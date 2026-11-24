import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { EXPENSE_CATEGORIES, PRODUCT_CATEGORIES } from "../../lib/constants.ts";
import { dateKey } from "../../lib/finance.ts";
import { cents, database, LocalError, nowISO, required, transaction } from "./db.ts";

export const price = z.number().min(0).max(100000);
export const quantity = z.number().int().min(0).max(1_000_000);
export const label = (max: number) => z.string().trim().min(1).max(max);
export const optionalLabel = (max: number) => z.string().trim().max(max).nullish();
export const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      Number.isFinite(+parsed) &&
      parsed.toISOString().slice(0, 10) === value &&
      value <= dateKey(new Date())
    );
  }, "Usa una fecha válida que no sea futura.");

const itemSchema = z.object({
  name: label(120),
  category: z.enum(PRODUCT_CATEGORIES),
  purchase_price: price,
  sale_price: price,
  quantity,
  min_stock: quantity,
  unit: label(24),
  supplier: optionalLabel(120),
});
const inventorySchema = itemSchema.pick({ quantity: true, min_stock: true });
type ProductInput = z.infer<typeof itemSchema>;
export type LocalProduct = Omit<ProductInput, "supplier"> & {
  id: string;
  store_id: string;
  supplier: string | null;
  created_at: string;
  updated_at: string;
};

const productColumns = `id, usuario_id AS store_id, nombre AS name, categoria AS category,
  precio_compra / 100.0 AS purchase_price, precio_venta / 100.0 AS sale_price, stock AS quantity,
  stock_minimo AS min_stock, unidad AS unit, proveedor AS supplier, creado AS created_at, actualizado AS updated_at`;

export function products(user: string) {
  return database()
    .prepare(
      `SELECT ${productColumns} FROM productos WHERE usuario_id = ? ORDER BY nombre COLLATE NOCASE`,
    )
    .all(user) as unknown as LocalProduct[];
}

export function product(db: DatabaseSync, user: string, id: string) {
  return required(
    db
      .prepare(`SELECT ${productColumns} FROM productos WHERE usuario_id = ? AND id = ?`)
      .get(user, id) as unknown as LocalProduct | undefined,
    "El producto ya no está en tu catálogo.",
  );
}

export function movement(
  db: DatabaseSync,
  user: string,
  p: LocalProduct,
  delta: number,
  stock: number,
  reason: string,
  reference: string | null = null,
) {
  if (delta === 0) return;
  const type =
    reason === "venta"
      ? "salida"
      : reason === "compra" || reason === "stock_inicial"
        ? "entrada"
        : "ajuste";
  db.prepare("INSERT INTO movimientos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    user,
    p.id,
    p.name,
    type,
    delta,
    reason,
    reference,
    stock,
    null,
    nowISO(),
  );
}

export function insertProduct(db: DatabaseSync, user: string, values: ProductInput) {
  const id = randomUUID();
  const stamp = nowISO();
  db.prepare("INSERT INTO productos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    user,
    values.name,
    values.category,
    cents(values.purchase_price),
    cents(values.sale_price),
    values.quantity,
    values.min_stock,
    values.unit,
    values.supplier || null,
    stamp,
    stamp,
  );
  db.prepare("INSERT INTO historial_costos (producto_id, costo) VALUES (?, ?)").run(
    id,
    cents(values.purchase_price),
  );
  movement(db, user, product(db, user, id), values.quantity, values.quantity, "stock_inicial");
  return id;
}

export function saveProduct(user: string, body: unknown, id?: string) {
  const values = itemSchema.parse(body);
  return transaction((db) => {
    if (!id) return insertProduct(db, user, values);
    const previous = product(db, user, id);
    db.prepare(
      `UPDATE productos SET nombre = ?, categoria = ?, precio_compra = ?, precio_venta = ?,
      stock = ?, stock_minimo = ?, unidad = ?, proveedor = ?, actualizado = ? WHERE usuario_id = ? AND id = ?`,
    ).run(
      values.name,
      values.category,
      cents(values.purchase_price),
      cents(values.sale_price),
      values.quantity,
      values.min_stock,
      values.unit,
      values.supplier || null,
      nowISO(),
      user,
      id,
    );
    if (cents(previous.purchase_price) !== cents(values.purchase_price))
      db.prepare("INSERT INTO historial_costos (producto_id, costo) VALUES (?, ?)").run(
        id,
        cents(values.purchase_price),
      );
    movement(
      db,
      user,
      { ...previous, name: values.name },
      values.quantity - previous.quantity,
      values.quantity,
      "ajuste",
    );
    return id;
  });
}

export function adjustProduct(user: string, id: string, body: unknown) {
  const values = inventorySchema.parse(body);
  return transaction((db) => {
    const p = product(db, user, id);
    db.prepare(
      "UPDATE productos SET stock = ?, stock_minimo = ?, actualizado = ? WHERE usuario_id = ? AND id = ?",
    ).run(values.quantity, values.min_stock, nowISO(), user, id);
    movement(db, user, p, values.quantity - p.quantity, values.quantity, "ajuste");
  });
}

export function removeProduct(user: string, id: string) {
  if (
    !database().prepare("DELETE FROM productos WHERE usuario_id = ? AND id = ?").run(user, id)
      .changes
  )
    throw new LocalError("El producto ya no está en tu catálogo.", 404);
}

export function movements(user: string) {
  return database()
    .prepare(
      `SELECT id, usuario_id AS store_id, producto_id AS product_id, nombre AS product_name,
    tipo AS movement_type, cantidad AS quantity, motivo AS reason, referencia_id AS reference_id,
    stock_final AS stock_after, nota AS note, creado AS created_at
    FROM movimientos WHERE usuario_id = ? ORDER BY rowid DESC LIMIT 300`,
    )
    .all(user);
}

const expenseSchema = z.object({
  description: label(140),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: price.min(0.01),
  expense_date: localDate,
  notes: optionalLabel(1000),
});

export function expenses(user: string) {
  return database()
    .prepare(
      `SELECT id, usuario_id AS store_id, descripcion AS description, categoria AS category,
    monto / 100.0 AS amount, fecha AS expense_date, notas AS notes, creado AS created_at, actualizado AS updated_at
    FROM gastos WHERE usuario_id = ? ORDER BY fecha DESC, rowid DESC`,
    )
    .all(user);
}

export function saveExpense(user: string, body: unknown, id?: string) {
  const e = expenseSchema.parse(body);
  const stamp = nowISO();
  const fields = [
    e.description,
    e.category,
    cents(e.amount),
    e.expense_date,
    e.notes || null,
    stamp,
  ] as const;
  if (!id) {
    database()
      .prepare("INSERT INTO gastos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), user, ...fields, stamp);
    return;
  }
  if (
    !database()
      .prepare(
        `UPDATE gastos SET descripcion = ?, categoria = ?, monto = ?, fecha = ?, notas = ?,
    actualizado = ? WHERE usuario_id = ? AND id = ?`,
      )
      .run(...fields, user, id).changes
  )
    throw new LocalError("El gasto ya no existe.", 404);
}

export function removeExpense(user: string, id: string) {
  if (
    !database().prepare("DELETE FROM gastos WHERE usuario_id = ? AND id = ?").run(user, id).changes
  )
    throw new LocalError("El gasto ya no existe.", 404);
}

export function chatMessages(user: string) {
  return database()
    .prepare(
      `SELECT id, role, content FROM (
    SELECT rowid, id, role, content FROM chat_messages WHERE usuario_id = ? ORDER BY rowid DESC LIMIT 200
  ) ORDER BY rowid`,
    )
    .all(user);
}

export function saveExchange(user: string, id: string, message: string, answer: string) {
  transaction((db) => {
    const insert = db.prepare("INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?)");
    if (db.prepare("SELECT id FROM chat_messages WHERE id = ? AND usuario_id = ?").get(id, user))
      return;
    insert.run(id, user, "user", message, nowISO());
    insert.run(randomUUID(), user, "assistant", answer, nowISO());
  });
}

export function clearChat(user: string) {
  database().prepare("DELETE FROM chat_messages WHERE usuario_id = ?").run(user);
}

export function clearStore(user: string) {
  transaction((db) => {
    for (const table of [
      "operaciones",
      "chat_messages",
      "movimientos",
      "ventas",
      "compras",
      "gastos",
      "productos",
    ])
      db.prepare(`DELETE FROM ${table} WHERE usuario_id = ?`).run(user);
    db.prepare("UPDATE usuarios SET datos_demo = 0, actualizado = ? WHERE id = ?").run(
      nowISO(),
      user,
    );
  });
}
