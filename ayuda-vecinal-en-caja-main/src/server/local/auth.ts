import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { label, optionalLabel, quantity } from "./business.ts";
import { database, LocalError, nowISO, required, transaction } from "./db.ts";

const cookie = "ayudateveci_session";
const lifetime = 60 * 60 * 24 * 7;
const email = z
  .string()
  .trim()
  .email()
  .max(160)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(72);
const credentials = z.object({ email, password: z.string().min(1).max(72) });
const registration = z.object({
  email,
  password,
  owner_name: label(80),
  store_name: label(80),
  barrio: label(80),
});
type Registration = z.infer<typeof registration>;

const encode = (text: string) => createHash("sha256").update(text).digest("hex");

function passwordHash(secret: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(secret, salt, 64).toString("hex")}`;
}

function matches(secret: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(secret, salt, 64), Buffer.from(hash, "hex"));
}

export function register(body: unknown) {
  const input = registration.parse(body);
  return transaction((db) => insertUser(db, input));
}

export function insertUser(db: DatabaseSync, input: Registration) {
  if (db.prepare("SELECT id FROM usuarios WHERE email = ?").get(input.email))
    throw new LocalError("Ese correo ya tiene una cuenta. Inicia sesión.", 409);
  const id = randomUUID();
  const stamp = nowISO();
  db.prepare(
    `INSERT INTO usuarios (id, nombre, tienda, email, password, barrio, correo_contacto, creado, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.owner_name,
    input.store_name,
    input.email,
    passwordHash(input.password),
    input.barrio,
    input.email,
    stamp,
    stamp,
  );
  return { id, email: input.email };
}

export function login(body: unknown) {
  const data = credentials.parse(body);
  const row = database()
    .prepare("SELECT id, email, password FROM usuarios WHERE email = ?")
    .get(data.email);
  if (!row || !matches(data.password, String(row["password"])))
    throw new LocalError("Correo o contraseña incorrectos.", 401);
  return { id: String(row["id"]), email: String(row["email"]) };
}

function token(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookie + "="))
    ?.slice(cookie.length + 1);
}

export function sessionUser(request: Request) {
  const value = token(request);
  if (!value) return null;
  const row = database()
    .prepare(
      `SELECT u.id, u.email FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira > ?`,
    )
    .get(encode(value), Date.now());
  return row ? { id: String(row["id"]), email: String(row["email"]) } : null;
}

function cookieValue(request: Request, value: string, seconds: number) {
  return `${cookie}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function openSession(request: Request, user: string) {
  const value = randomBytes(32).toString("base64url");
  const db = database();
  db.prepare("DELETE FROM sesiones WHERE expira <= ?").run(Date.now());
  db.prepare("INSERT INTO sesiones VALUES (?, ?, ?)").run(
    encode(value),
    user,
    Date.now() + lifetime * 1000,
  );
  return cookieValue(request, value, lifetime);
}

export function closeSession(request: Request) {
  const value = token(request);
  if (value) database().prepare("DELETE FROM sesiones WHERE token_hash = ?").run(encode(value));
  return cookieValue(request, "", 0);
}

export function store(user: string) {
  const row = required(
    database()
      .prepare(
        `SELECT id, nombre, tienda, email, barrio, direccion, telefono,
    correo_contacto, minimo_predeterminado, alertas, datos_demo, creado, actualizado FROM usuarios WHERE id = ?`,
      )
      .get(user),
    "No se encontró tu tienda.",
  );
  return {
    store: {
      id: user,
      owner_id: user,
      name: row["tienda"],
      barrio: row["barrio"],
      address: row["direccion"],
      phone: row["telefono"],
      contact_email: row["correo_contacto"],
      default_min_stock: row["minimo_predeterminado"],
      low_stock_alerts: Boolean(row["alertas"]),
      has_demo_data: Boolean(row["datos_demo"]),
      created_at: row["creado"],
      updated_at: row["actualizado"],
    },
    profile: {
      id: user,
      owner_name: row["nombre"],
      created_at: row["creado"],
      updated_at: row["actualizado"],
    },
    email: row["email"],
  };
}

const settings = z.object({
  owner_name: label(80),
  store_name: label(80),
  barrio: label(80),
  address: optionalLabel(160),
  phone: optionalLabel(40),
  contact_email: email.nullish(),
  default_min_stock: quantity,
  low_stock_alerts: z.boolean(),
});

export function updateStore(user: string, body: unknown) {
  const data = settings.parse(body);
  database()
    .prepare(
      `UPDATE usuarios SET nombre = ?, tienda = ?, barrio = ?, direccion = ?, telefono = ?,
    correo_contacto = ?, minimo_predeterminado = ?, alertas = ?, actualizado = ? WHERE id = ?`,
    )
    .run(
      data.owner_name,
      data.store_name,
      data.barrio,
      data.address || null,
      data.phone || null,
      data.contact_email || null,
      data.default_min_stock,
      Number(data.low_stock_alerts),
      nowISO(),
      user,
    );
}

export function applyMinStock(user: string, body: unknown) {
  const { min_stock } = z.object({ min_stock: quantity }).parse(body);
  database()
    .prepare("UPDATE productos SET stock_minimo = ?, actualizado = ? WHERE usuario_id = ?")
    .run(min_stock, nowISO(), user);
}

export function changePassword(request: Request, user: string, body: unknown) {
  const data = z.object({ current_password: z.string().min(1).max(72), password }).parse(body);
  const row = required(
    database().prepare("SELECT password FROM usuarios WHERE id = ?").get(user),
    "No se encontró tu cuenta.",
  );
  if (!matches(data.current_password, String(row["password"])))
    throw new LocalError("La contraseña actual es incorrecta.");
  setPassword(user, data.password);
  return openSession(request, user);
}

export function resetLocalPassword(address: string, secret: string) {
  const row = required(
    database().prepare("SELECT id FROM usuarios WHERE email = ?").get(email.parse(address)),
    "No se encontró ese correo.",
  );
  setPassword(String(row["id"]), password.parse(secret));
}

function setPassword(user: string, secret: string) {
  transaction((db) => {
    db.prepare("UPDATE usuarios SET password = ?, actualizado = ? WHERE id = ?").run(
      passwordHash(secret),
      nowISO(),
      user,
    );
    db.prepare("DELETE FROM sesiones WHERE usuario_id = ?").run(user);
  });
}
