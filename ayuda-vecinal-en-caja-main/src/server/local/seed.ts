import type { DatabaseSync } from "node:sqlite";
import { addDays, dateKey } from "../../lib/finance.ts";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../lib/demo-account.ts";
import { insertUser } from "./auth.ts";
import { insertProduct } from "./business.ts";
import { LocalError, nowISO, transaction } from "./db.ts";
import { recordLedger } from "./ledger.ts";

const catalog = [
  ["Arroz extra", "Abarrotes", 0.52, 0.7, 55, 12, "libra", "Distribuidora La Condamine"],
  ["Aceite vegetal 1 L", "Abarrotes", 1.64, 2.15, 18, 5, "botella", "Distribuidora La Condamine"],
  ["Cubeta de huevos", "Productos básicos", 3.35, 4.5, 8, 5, "cubeta", "Avícola San Luis"],
  ["Leche entera 1 L", "Lácteos", 0.86, 1.12, 22, 6, "funda", "Lácteos Chimborazo"],
  ["Azúcar blanca", "Abarrotes", 0.44, 0.6, 30, 6, "libra", "Distribuidora La Condamine"],
  ["Pan de agua", "Productos básicos", 0.11, 0.2, 46, 12, "unidad", "Panadería Santa Rosa"],
  ["Cola 1,35 L", "Bebidas", 0.94, 1.35, 18, 5, "botella", "Bebidas Sierra Centro"],
  ["Atún en aceite", "Abarrotes", 1.04, 1.5, 3, 4, "lata", "Distribuidora La Condamine"],
  [
    "Galletas de vainilla",
    "Snacks y golosinas",
    0.32,
    0.55,
    14,
    4,
    "funda",
    "Distribuidora La Condamine",
  ],
  [
    "Jabón para ropa",
    "Productos de limpieza",
    0.55,
    0.85,
    0,
    3,
    "barra",
    "Distribuidora La Condamine",
  ],
  ["Harina de trigo", "Abarrotes", 0.54, 0.75, 15, 4, "libra", "Distribuidora La Condamine"],
  ["Café instantáneo", "Abarrotes", 0.65, 0.95, 12, 4, "sobre", "Distribuidora La Condamine"],
] as const;

export function seedAccount() {
  return transaction((db) => {
    if (db.prepare("SELECT id FROM usuarios WHERE email = ?").get(DEMO_EMAIL)) return false;
    const { id } = insertUser(db, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      owner_name: "María Llanga",
      store_name: "Víveres La Esquina",
      barrio: "Santa Rosa, Riobamba",
    });
    insertDemoRows(db, id);
    return true;
  });
}

export function loadDemo(user: string) {
  transaction((db) => insertDemoRows(db, user));
}

function insertDemoRows(db: DatabaseSync, user: string) {
  const exists = db
    .prepare(
      `SELECT EXISTS(SELECT 1 FROM productos WHERE usuario_id = ?)
       OR EXISTS(SELECT 1 FROM ventas WHERE usuario_id = ?)
       OR EXISTS(SELECT 1 FROM compras WHERE usuario_id = ?)
       OR EXISTS(SELECT 1 FROM gastos WHERE usuario_id = ?) AS occupied`,
    )
    .get(user, user, user, user);
  if (exists?.["occupied"])
    throw new LocalError("Usa una tienda sin registros para cargar datos de demostración.", 409);
  const ids = catalog.map(
    ([name, category, purchase_price, sale_price, quantity, min_stock, unit, supplier]) =>
      insertProduct(db, user, {
        name,
        category,
        purchase_price,
        sale_price,
        quantity,
        min_stock,
        unit,
        supplier,
      }),
  );
  const today = dateKey(new Date());
  const item = (index: number, quantity: number, unit_price?: number) => ({
    product_id: ids[index]!,
    quantity,
    ...(unit_price === undefined ? {} : { unit_price }),
  });
  recordLedger(db, user, "purchases", {
    supplier: "Distribuidora La Condamine",
    date: addDays(today, -7),
    items: [item(0, 25), item(1, 12), item(4, 15), item(8, 12)],
  });
  for (let day = 6; day > 0; day--) {
    recordLedger(
      db,
      user,
      "sales",
      { items: [item(0, 4 + (day % 3)), item(5, 5), item(3, 2), item(6, 1)] },
      undefined,
      `${addDays(today, -day)}T14:30:00.000Z`,
    );
  }
  recordLedger(db, user, "sales", { items: [item(5, 5), item(3, 2), item(1, 1), item(2, 1)] });
  recordLedger(db, user, "sales", {
    customer: "Doña Rosa",
    items: [item(0, 2), item(4, 2), item(3, 1)],
  });
  recordLedger(db, user, "sales", { customer: "José Guamán", items: [item(2, 1), item(6, 1)] });
  db.prepare("UPDATE usuarios SET datos_demo = 1, actualizado = ? WHERE id = ?").run(
    nowISO(),
    user,
  );
}
