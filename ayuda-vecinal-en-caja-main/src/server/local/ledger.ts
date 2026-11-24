import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { dateKey } from "../../lib/finance.ts";
import { localDate, movement, optionalLabel, price, product, quantity } from "./business.ts";
import { cents, database, LocalError, nowISO, transaction } from "./db.ts";

const inputSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: quantity.min(1),
        unit_price: price.optional(),
      }),
    )
    .min(1, "Agrega al menos un producto.")
    .max(100),
  customer: optionalLabel(120),
  supplier: optionalLabel(120),
  notes: optionalLabel(1000),
  date: localDate.optional(),
  update_cost: z.boolean().optional(),
  key: z.string().uuid().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Kind = "sales" | "purchases";

const catalogs = {
  sales: { table: "ventas", lines: "detalle_ventas", fk: "venta_id", sign: -1, reason: "venta" },
  purchases: {
    table: "compras",
    lines: "detalle_compras",
    fk: "compra_id",
    sign: 1,
    reason: "compra",
  },
} as const;

export function sales(user: string) {
  const db = database();
  const headers = db
    .prepare(
      `SELECT id, usuario_id AS store_id, fecha AS sale_date,
    total / 100.0 AS total, costo_total / 100.0 AS total_cost, notas AS notes, creado AS created_at,
    tipo_pago AS payment_type, cliente_fiado AS credit_customer, estado_fiado AS credit_status,
    fecha_cobro AS paid_at FROM ventas WHERE usuario_id = ? ORDER BY fecha DESC, rowid DESC`,
    )
    .all(user);
  const lines = db
    .prepare(
      `SELECT d.id, d.venta_id AS sale_id, v.usuario_id AS store_id, d.producto_id AS product_id,
    d.nombre AS product_name, d.categoria AS category, d.cantidad AS quantity, d.precio_unitario / 100.0 AS unit_price,
    d.costo_unitario / 100.0 AS unit_cost, d.subtotal / 100.0 AS subtotal
    FROM detalle_ventas d JOIN ventas v ON v.id = d.venta_id WHERE v.usuario_id = ? ORDER BY d.rowid`,
    )
    .all(user);
  return withDetails(headers, lines, "sale_id", "sale_items");
}

export function purchases(user: string) {
  const db = database();
  const headers = db
    .prepare(
      `SELECT id, usuario_id AS store_id, fecha AS purchase_date, proveedor AS supplier,
    total / 100.0 AS total, notas AS notes, creado AS created_at, actualiza_costo AS update_cost
    FROM compras WHERE usuario_id = ? ORDER BY fecha DESC, rowid DESC`,
    )
    .all(user);
  const lines = db
    .prepare(
      `SELECT d.id, d.compra_id AS purchase_id, c.usuario_id AS store_id, d.producto_id AS product_id,
    d.nombre AS product_name, d.cantidad AS quantity, d.costo_unitario / 100.0 AS unit_cost,
    d.cantidad * d.costo_unitario / 100.0 AS subtotal
    FROM detalle_compras d JOIN compras c ON c.id = d.compra_id WHERE c.usuario_id = ? ORDER BY d.rowid`,
    )
    .all(user);
  return withDetails(headers, lines, "purchase_id", "purchase_items");
}

function withDetails<T, K extends string>(headers: T[], lines: T[], owner: string, name: K) {
  const index = new Map<unknown, T[]>();
  for (const line of lines) {
    const key = (line as Record<string, unknown>)[owner];
    if (!index.has(key)) index.set(key, []);
    index.get(key)?.push(line);
  }
  return headers.map((header) => ({
    ...header,
    [name]: index.get((header as { id: string }).id) ?? [],
  }));
}

export function writeLedger(user: string, kind: Kind, body: unknown, id?: string) {
  const input = inputSchema.parse(body);
  return transaction((db) => recordLedger(db, user, kind, input, id));
}

export function recordLedger(
  db: DatabaseSync,
  user: string,
  kind: Kind,
  input: Input,
  id?: string,
  saleDate?: string,
) {
  if (!id && input.key) {
    const existing = db
      .prepare("SELECT recurso_id FROM operaciones WHERE usuario_id = ? AND clave = ?")
      .get(user, input.key);
    if (existing) return String(existing["recurso_id"]);
  }

  const catalog = catalogs[kind];
  const previous = id ? ledgerEntry(db, user, kind, id) : undefined;
  const entryId = id ?? randomUUID();
  const timestamp = nowISO();
  const oldLines = previous ? detailRows(db, kind, entryId) : [];
  const products = new Map<string, ReturnType<typeof product>>();
  const currentProduct = (productId: string) => {
    if (!products.has(productId)) products.set(productId, product(db, user, productId));
    return products.get(productId)!;
  };
  const priorCosts = new Map(oldLines.map((line) => [line.producto_id, line.costo_unitario]));
  const lines = input.items.map((item) => {
    const p = currentProduct(item.product_id);
    const unitPrice = cents(
      item.unit_price ?? (kind === "sales" ? p.sale_price : p.purchase_price),
    );
    const cost = kind === "sales" ? (priorCosts.get(p.id) ?? cents(p.purchase_price)) : unitPrice;
    return { p, quantity: item.quantity, unitPrice, cost, subtotal: item.quantity * unitPrice };
  });
  const changes = new Map<string, number>();
  for (const line of oldLines) {
    if (line.producto_id)
      changes.set(
        line.producto_id,
        (changes.get(line.producto_id) ?? 0) - catalog.sign * line.cantidad,
      );
  }
  for (const line of lines)
    changes.set(line.p.id, (changes.get(line.p.id) ?? 0) + catalog.sign * line.quantity);
  for (const [productId, delta] of changes) {
    changeStock(
      db,
      user,
      currentProduct(productId),
      delta,
      previous ? "edicion" : catalog.reason,
      entryId,
    );
  }

  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  if (id) db.prepare(`DELETE FROM ${catalog.lines} WHERE ${catalog.fk} = ?`).run(id);
  if (kind === "sales") {
    const customer = input.customer || null;
    const paid =
      customer && customer === previous?.["cliente_fiado"] && previous["estado_fiado"] === "Pagado"
        ? (previous["fecha_cobro"] ?? null)
        : null;
    const fields = [
      saleDate ?? previous?.["fecha"] ?? timestamp,
      total,
      lines.reduce((sum, line) => sum + line.quantity * line.cost, 0),
      customer ? "Fiado" : "Pagado",
      customer,
      customer ? (paid ? "Pagado" : "Pendiente") : null,
      paid,
      input.notes || null,
    ] as const;
    if (id) {
      db.prepare(
        `UPDATE ventas SET fecha = ?, total = ?, costo_total = ?, tipo_pago = ?, cliente_fiado = ?,
        estado_fiado = ?, fecha_cobro = ?, notas = ? WHERE usuario_id = ? AND id = ?`,
      ).run(...fields, user, id);
    } else {
      db.prepare("INSERT INTO ventas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        entryId,
        user,
        ...fields,
        timestamp,
      );
    }
    const insert = db.prepare("INSERT INTO detalle_ventas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const { p, quantity, unitPrice, cost, subtotal } of lines) {
      insert.run(
        randomUUID(),
        entryId,
        p.id,
        p.name,
        p.category,
        quantity,
        unitPrice,
        cost,
        subtotal,
      );
    }
  } else {
    const updateCost = input.update_cost ?? Boolean(previous?.["actualiza_costo"]);
    const fields = [
      input.date ?? previous?.["fecha"] ?? dateKey(timestamp),
      input.supplier || null,
      total,
      input.notes || null,
      Number(updateCost),
    ] as const;
    if (id) {
      db.prepare(
        `UPDATE compras SET fecha = ?, proveedor = ?, total = ?, notas = ?, actualiza_costo = ?
        WHERE usuario_id = ? AND id = ?`,
      ).run(...fields, user, id);
    } else {
      db.prepare(
        "INSERT INTO compras (id, usuario_id, fecha, proveedor, total, notas, actualiza_costo, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(entryId, user, ...fields, timestamp);
    }
    const insert = db.prepare("INSERT INTO detalle_compras VALUES (?, ?, ?, ?, ?, ?)");
    const costs = new Map<string, number>();
    for (const { p, quantity, cost } of lines) {
      insert.run(randomUUID(), entryId, p.id, p.name, quantity, cost);
      if (updateCost) costs.set(p.id, cost);
    }
    updatePurchaseCosts(db, entryId, costs);
  }

  if (!id && input.key)
    db.prepare("INSERT INTO operaciones VALUES (?, ?, ?)").run(user, input.key, entryId);
  return entryId;
}

function ledgerEntry(db: DatabaseSync, user: string, kind: Kind, id: string) {
  const row = db
    .prepare(`SELECT * FROM ${catalogs[kind].table} WHERE usuario_id = ? AND id = ?`)
    .get(user, id);
  if (!row) throw new LocalError("El registro ya no existe.", 404);
  return row;
}

function detailRows(db: DatabaseSync, kind: Kind, id: string) {
  const catalog = catalogs[kind];
  return db
    .prepare(
      `SELECT producto_id, cantidad, costo_unitario FROM ${catalog.lines} WHERE ${catalog.fk} = ?`,
    )
    .all(id) as unknown as {
    producto_id: string | null;
    cantidad: number;
    costo_unitario: number;
  }[];
}

function changeStock(
  db: DatabaseSync,
  user: string,
  p: ReturnType<typeof product>,
  delta: number,
  reason: string,
  ref: string,
) {
  if (!delta) return;
  const finalStock = p.quantity + delta;
  if (finalStock < 0)
    throw new LocalError(
      `Stock insuficiente de ${p.name}. Hay ${p.quantity} ${p.unit} en inventario.`,
      409,
    );
  if (finalStock > 1_000_000)
    throw new LocalError(`El stock de ${p.name} supera el máximo permitido.`, 409);
  db.prepare("UPDATE productos SET stock = ?, actualizado = ? WHERE usuario_id = ? AND id = ?").run(
    finalStock,
    nowISO(),
    user,
    p.id,
  );
  movement(db, user, p, delta, finalStock, reason, ref);
}

function updatePurchaseCosts(db: DatabaseSync, id: string, costs: Map<string, number>) {
  const previous = db
    .prepare("SELECT producto_id FROM historial_costos WHERE compra_id = ?")
    .all(id);
  const affected = new Set(costs.keys());
  for (const row of previous) {
    const productId = String(row["producto_id"]);
    affected.add(productId);
    if (!costs.has(productId))
      db.prepare("DELETE FROM historial_costos WHERE compra_id = ? AND producto_id = ?").run(
        id,
        productId,
      );
  }
  for (const [productId, cost] of costs) {
    db.prepare(
      `INSERT INTO historial_costos (producto_id, compra_id, costo) VALUES (?, ?, ?)
      ON CONFLICT(producto_id, compra_id) DO UPDATE SET costo = excluded.costo`,
    ).run(productId, id, cost);
  }
  for (const productId of affected) {
    db.prepare(
      `UPDATE productos SET precio_compra = (SELECT costo FROM historial_costos WHERE producto_id = ?
      ORDER BY id DESC LIMIT 1), actualizado = ? WHERE id = ?`,
    ).run(productId, nowISO(), productId);
  }
}

export function removeLedger(user: string, kind: Kind, id: string) {
  transaction((db) => {
    ledgerEntry(db, user, kind, id);
    const catalog = catalogs[kind];
    const quantities = new Map<string, number>();
    for (const line of detailRows(db, kind, id)) {
      if (line.producto_id)
        quantities.set(line.producto_id, (quantities.get(line.producto_id) ?? 0) + line.cantidad);
    }
    for (const [productId, amount] of quantities)
      changeStock(db, user, product(db, user, productId), -catalog.sign * amount, "anulacion", id);
    if (kind === "purchases") updatePurchaseCosts(db, id, new Map());
    db.prepare(`DELETE FROM ${catalog.table} WHERE usuario_id = ? AND id = ?`).run(user, id);
  });
}

export function collectDebt(user: string, id: string) {
  return transaction((db) => {
    const row = ledgerEntry(db, user, "sales", id);
    if (row["tipo_pago"] !== "Fiado") throw new LocalError("Esta venta no corresponde a un fiado.");
    db.prepare(
      "UPDATE ventas SET estado_fiado = 'Pagado', fecha_cobro = ? WHERE usuario_id = ? AND id = ? AND estado_fiado = 'Pendiente'",
    ).run(nowISO(), user, id);
  });
}
