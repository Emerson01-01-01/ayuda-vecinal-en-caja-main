/**
 * Cálculos financieros de AyúdateVeci. Funciones puras, compartidas por la app y por VeciBot.
 *
 * Fórmulas:
 *   Ganancia bruta estimada  = ventas − costo de los productos vendidos
 *   Resultado operativo est. = ganancia bruta − gastos operativos
 * Las compras de mercadería NO son gasto operativo: su costo ya entra cuando el producto se vende.
 */
import { APP_TIMEZONE } from "./constants.ts";

export interface ProductLite {
  id: string;
  name: string;
  category: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  min_stock: number;
  supplier?: string | null;
}

export interface SaleItemLite {
  product_id: string | null;
  product_name: string;
  category?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
}

export interface SaleLite {
  id: string;
  sale_date: string;
  total: number;
  total_cost: number;
  sale_items?: SaleItemLite[];
}

export interface ExpenseLite {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
}

export interface PurchaseLite {
  id: string;
  purchase_date: string;
  supplier: string | null;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------ Fechas ------------------------------ */

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha local en la zona horaria configurada, en formato YYYY-MM-DD. */
export function dateKey(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return keyFmt.format(new Date(value));
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inicio del día en Ecuador (UTC−5, sin horario de verano) como ISO. */
export function startOfDayISO(key: string): string {
  return `${key}T00:00:00-05:00`;
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export type Period = "dia" | "semana" | "mes";

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function rangeForPeriod(period: Period, now: Date = new Date()): DateRange {
  const today = dateKey(now);
  if (period === "dia") return { from: today, to: today, label: "Hoy" };
  if (period === "semana") return { from: addDays(today, -6), to: today, label: "Últimos 7 días" };
  return { from: `${today.slice(0, 8)}01`, to: today, label: "Este mes" };
}

export function inRange(key: string, range: { from: string; to: string }): boolean {
  return key >= range.from && key <= range.to;
}

/* ------------------------------ Productos ------------------------------ */

export interface UnitMargin {
  amount: number;
  percent: number | null;
  belowCost: boolean;
}

/** Margen estimado por unidad = precio de venta − precio de compra. % sobre el precio de venta. */
export function unitMargin(p: Pick<ProductLite, "purchase_price" | "sale_price">): UnitMargin {
  const amount = round2(Number(p.sale_price) - Number(p.purchase_price));
  const percent = p.sale_price > 0 ? round2((amount / Number(p.sale_price)) * 100) : null;
  return { amount, percent, belowCost: Number(p.sale_price) < Number(p.purchase_price) };
}

export type StockStatus = "agotado" | "bajo" | "ok";

export function stockStatus(p: Pick<ProductLite, "quantity" | "min_stock">): StockStatus {
  if (p.quantity <= 0) return "agotado";
  if (p.quantity <= p.min_stock) return "bajo";
  return "ok";
}

/** Valida un carrito antes de vender: no se puede vender más de lo disponible. */
export function validateCart(
  cart: { productId: string; quantity: number }[],
  products: ProductLite[],
): string[] {
  const errors: string[] = [];
  const totals = new Map<string, number>();
  for (const line of cart)
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  for (const [id, qty] of totals) {
    const p = products.find((x) => x.id === id);
    if (!p) {
      errors.push("Un producto del carrito ya no existe.");
      continue;
    }
    if (!Number.isInteger(qty) || qty <= 0) errors.push(`Cantidad inválida para ${p.name}.`);
    else if (qty > p.quantity)
      errors.push(`Solo hay ${p.quantity} unidades de ${p.name}; no puedes vender ${qty}.`);
  }
  return errors;
}

/* ------------------------------ Resúmenes ------------------------------ */

export interface FinancialSummary {
  salesTotal: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingResult: number;
  grossMarginPct: number | null;
  transactions: number;
  unitsSold: number;
  avgTicket: number;
  /** Compras de mercadería del periodo; no se restan otra vez de la ganancia. */
  merchandisePurchases: number;
}

export function summarize(
  sales: SaleLite[],
  expenses: ExpenseLite[],
  range: { from: string; to: string },
  purchases: PurchaseLite[] = [],
): FinancialSummary {
  const s = sales.filter((x) => inRange(dateKey(x.sale_date), range));
  const e = expenses.filter((x) => inRange(dateKey(x.expense_date), range));
  const salesTotal = round2(s.reduce((a, x) => a + Number(x.total), 0));
  const cogs = round2(s.reduce((a, x) => a + Number(x.total_cost), 0));
  const grossProfit = round2(salesTotal - cogs);
  const operatingExpenses = round2(e.reduce((a, x) => a + Number(x.amount), 0));
  const operatingResult = round2(grossProfit - operatingExpenses);
  const unitsSold = s.reduce(
    (a, x) => a + (x.sale_items ?? []).reduce((b, i) => b + Number(i.quantity), 0),
    0,
  );
  return {
    salesTotal,
    cogs,
    grossProfit,
    operatingExpenses,
    operatingResult,
    grossMarginPct: salesTotal > 0 ? round2((grossProfit / salesTotal) * 100) : null,
    transactions: s.length,
    unitsSold,
    avgTicket: s.length ? round2(salesTotal / s.length) : 0,
    merchandisePurchases: round2(
      purchases
        .filter((p) => inRange(dateKey(p.purchase_date), range))
        .reduce((total, p) => total + Number(p.total), 0),
    ),
  };
}

export interface DailyPoint {
  key: string;
  label: string;
  ventas: number;
  ganancia: number;
  gastos: number;
}

const shortDay = new Intl.DateTimeFormat("es-EC", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
});

export function dailySeries(
  sales: SaleLite[],
  expenses: ExpenseLite[],
  range: { from: string; to: string },
): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const key of daysBetween(range.from, range.to)) {
    map.set(key, {
      key,
      label: shortDay.format(new Date(`${key}T12:00:00Z`)).replace(".", ""),
      ventas: 0,
      ganancia: 0,
      gastos: 0,
    });
  }
  for (const s of sales) {
    const p = map.get(dateKey(s.sale_date));
    if (!p) continue;
    p.ventas = round2(p.ventas + Number(s.total));
    p.ganancia = round2(p.ganancia + Number(s.total) - Number(s.total_cost));
  }
  for (const e of expenses) {
    const p = map.get(dateKey(e.expense_date));
    if (p) p.gastos = round2(p.gastos + Number(e.amount));
  }
  return [...map.values()];
}

export interface ProductMovement {
  productId: string | null;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  profit: number;
}

export function productRanking(
  sales: SaleLite[],
  range: { from: string; to: string },
  products: ProductLite[] = [],
): ProductMovement[] {
  const map = new Map<string, ProductMovement>();
  for (const p of products) {
    map.set(p.id, {
      productId: p.id,
      name: p.name,
      category: p.category,
      qty: 0,
      revenue: 0,
      profit: 0,
    });
  }
  for (const s of sales) {
    if (!inRange(dateKey(s.sale_date), range)) continue;
    for (const i of s.sale_items ?? []) {
      const key = i.product_id ?? `nombre:${i.product_name}`;
      const cur = map.get(key) ?? {
        productId: i.product_id,
        name: i.product_name,
        category: i.category ?? "",
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      cur.qty += Number(i.quantity);
      cur.revenue = round2(cur.revenue + Number(i.subtotal));
      cur.profit = round2(
        cur.profit + (Number(i.unit_price) - Number(i.unit_cost)) * Number(i.quantity),
      );
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
}

/** Productos registrados con menor movimiento (incluye los que no se vendieron). */
export function lowMovement(ranking: ProductMovement[], products: ProductLite[], limit = 5) {
  const ids = new Set(products.map((p) => p.id));
  return ranking
    .filter((r) => r.productId && ids.has(r.productId))
    .sort((a, b) => a.qty - b.qty || a.revenue - b.revenue)
    .slice(0, limit);
}

export function expensesByCategory(expenses: ExpenseLite[], range: { from: string; to: string }) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (!inRange(dateKey(e.expense_date), range)) continue;
    map.set(e.category, round2((map.get(e.category) ?? 0) + Number(e.amount)));
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Promedio diario de unidades vendidas por producto en los últimos `days` días. */
export function avgDailyUnits(sales: SaleLite[], days: number, now: Date = new Date()) {
  const today = dateKey(now);
  const range = { from: addDays(today, -(days - 1)), to: today };
  const map = new Map<string, number>();
  for (const s of sales) {
    if (!inRange(dateKey(s.sale_date), range)) continue;
    for (const i of s.sale_items ?? []) {
      if (!i.product_id) continue;
      map.set(i.product_id, (map.get(i.product_id) ?? 0) + Number(i.quantity));
    }
  }
  const out = new Map<string, number>();
  for (const [id, qty] of map) out.set(id, qty / days);
  return out;
}

/**
 * Cantidad sugerida para reponer: cubrir 7 días de venta promedio más el stock mínimo,
 * descontando lo que ya hay. Nunca negativa.
 */
export function suggestedReorder(p: ProductLite, avgDaily: number): number {
  const target = Math.ceil(avgDaily * 7) + p.min_stock;
  return Math.max(0, target - p.quantity);
}

/* ------------------------------ Recomendaciones ------------------------------ */

export type RecommendationKind =
  "reposicion" | "mas-vendidos" | "poca-rotacion" | "margen-bajo" | "gastos" | "compras";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  priority: "alta" | "media" | "baja";
  title: string;
  description: string;
  why: string;
  evidence: string[];
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function generateRecommendations(input: {
  products: ProductLite[];
  sales: SaleLite[];
  expenses: ExpenseLite[];
  now?: Date;
}): Recommendation[] {
  const { products, sales, expenses } = input;
  const now = input.now ?? new Date();
  const today = dateKey(now);
  const recs: Recommendation[] = [];
  if (products.length === 0) return recs;

  const last14 = { from: addDays(today, -13), to: today };
  const last30 = { from: addDays(today, -29), to: today };
  const avg = avgDailyUnits(sales, 14, now);
  const ranking14 = productRanking(sales, last14, products);

  // 1. Reposición
  const toRestock = products
    .filter((p) => stockStatus(p) !== "ok")
    .map((p) => ({ p, avg: avg.get(p.id) ?? 0, qty: suggestedReorder(p, avg.get(p.id) ?? 0) }))
    .sort((a, b) => a.p.quantity - b.p.quantity || b.avg - a.avg);
  if (toRestock.length) {
    const outCount = toRestock.filter((x) => x.p.quantity <= 0).length;
    recs.push({
      id: "reposicion",
      kind: "reposicion",
      priority: outCount > 0 ? "alta" : "media",
      title: `Repón ${toRestock.length} producto${toRestock.length > 1 ? "s" : ""}`,
      description:
        outCount > 0
          ? `Tienes ${outCount} producto${outCount > 1 ? "s" : ""} agotado${outCount > 1 ? "s" : ""}. Cada día sin stock es una venta que se va a otra tienda.`
          : "Algunos productos llegaron a su stock mínimo. Inclúyelos en tu próxima compra.",
      why: "Se genera cuando la cantidad disponible es igual o menor al stock mínimo que definiste.",
      evidence: toRestock
        .slice(0, 6)
        .map(
          (x) =>
            `${x.p.name}: quedan ${x.p.quantity} (mínimo ${x.p.min_stock}) · vendes ~${x.avg.toFixed(1)}/día · sugerido comprar ${x.qty}`,
        ),
    });
  }

  // 2. Más vendidos
  const top = ranking14.filter((r) => r.qty > 0).slice(0, 3);
  if (top.length) {
    recs.push({
      id: "mas-vendidos",
      kind: "mas-vendidos",
      priority: "media",
      title: "Cuida tus productos estrella",
      description: `${top.map((t) => t.name).join(", ")} son los que más se mueven. Mantén siempre existencias y ubícalos a la vista.`,
      why: "Ranking por unidades vendidas en los últimos 14 días.",
      evidence: top.map(
        (t) =>
          `${t.name}: ${t.qty} unidades · ${usd(t.revenue)} vendidos · ${usd(t.profit)} de ganancia bruta`,
      ),
    });
  }

  // 3. Poca rotación
  const ranking30 = productRanking(sales, last30, products);
  const stale = ranking30
    .filter((r) => r.productId && r.qty === 0)
    .map((r) => products.find((p) => p.id === r.productId)!)
    .filter((p) => p && p.quantity > 0);
  if (stale.length) {
    const tied = round2(stale.reduce((a, p) => a + p.quantity * p.purchase_price, 0));
    recs.push({
      id: "poca-rotacion",
      kind: "poca-rotacion",
      priority: "baja",
      title: `${stale.length} producto${stale.length > 1 ? "s" : ""} sin ventas en 30 días`,
      description: `Tienes aproximadamente ${usd(tied)} inmovilizados en mercadería que no se vende. Evita volver a comprarlos y considera una promoción.`,
      why: "Productos con existencias que no registran ventas en los últimos 30 días.",
      evidence: stale
        .slice(0, 6)
        .map(
          (p) => `${p.name}: ${p.quantity} en bodega · costo ${usd(p.quantity * p.purchase_price)}`,
        ),
    });
  }

  // 4. Margen bajo o precio bajo el costo
  const lowMargin = products
    .map((p) => ({ p, m: unitMargin(p) }))
    .filter((x) => x.m.belowCost || (x.m.percent !== null && x.m.percent < 12))
    .sort((a, b) => (a.m.percent ?? -999) - (b.m.percent ?? -999));
  if (lowMargin.length) {
    const below = lowMargin.filter((x) => x.m.belowCost).length;
    recs.push({
      id: "margen-bajo",
      kind: "margen-bajo",
      priority: below > 0 ? "alta" : "media",
      title:
        below > 0
          ? `${below} producto${below > 1 ? "s" : ""} se vende${below > 1 ? "n" : ""} bajo el costo`
          : "Revisa precios con margen bajo",
      description:
        below > 0
          ? "Estás perdiendo dinero en cada unidad vendida. Revisa el precio de venta o negocia con el proveedor."
          : "Estos productos dejan muy poca ganancia por unidad. Compara precios con otros proveedores.",
      why: "Margen por unidad menor al 12 % del precio de venta, o precio de venta menor al costo registrado.",
      evidence: lowMargin
        .slice(0, 6)
        .map(
          (x) =>
            `${x.p.name}: compra ${usd(x.p.purchase_price)} · venta ${usd(x.p.sale_price)} · margen ${x.m.percent === null ? "—" : `${x.m.percent.toFixed(1)} %`}`,
        ),
    });
  }

  // 5. Aumento de gastos: últimos 15 días vs. 15 anteriores
  const recent = { from: addDays(today, -14), to: today };
  const previous = { from: addDays(today, -29), to: addDays(today, -15) };
  const sum = (r: { from: string; to: string }) =>
    round2(
      expenses
        .filter((e) => inRange(dateKey(e.expense_date), r))
        .reduce((a, e) => a + Number(e.amount), 0),
    );
  const recentTotal = sum(recent);
  const prevTotal = sum(previous);
  const cats = expensesByCategory(expenses, last30);
  if (prevTotal > 0 && recentTotal > prevTotal * 1.25) {
    recs.push({
      id: "gastos",
      kind: "gastos",
      priority: "media",
      title: "Tus gastos operativos subieron",
      description: `En los últimos 15 días gastaste ${usd(recentTotal)}, frente a ${usd(prevTotal)} en los 15 días anteriores.`,
      why: "Se genera cuando los gastos de los últimos 15 días superan en más de 25 % a los del periodo anterior.",
      evidence: cats.slice(0, 4).map((c) => `${c.category}: ${usd(c.total)} en 30 días`),
    });
  } else if (cats.length) {
    const s30 = summarize(sales, expenses, last30);
    if (s30.grossProfit > 0 && s30.operatingExpenses > s30.grossProfit * 0.6) {
      recs.push({
        id: "gastos",
        kind: "gastos",
        priority: "media",
        title: "Los gastos consumen buena parte de tu ganancia",
        description: `En 30 días tus gastos operativos (${usd(s30.operatingExpenses)}) equivalen al ${Math.round((s30.operatingExpenses / s30.grossProfit) * 100)} % de tu ganancia bruta (${usd(s30.grossProfit)}).`,
        why: "Gastos operativos mayores al 60 % de la ganancia bruta estimada de los últimos 30 días.",
        evidence: cats.slice(0, 4).map((c) => `${c.category}: ${usd(c.total)}`),
      });
    }
  }

  // 6. Organización de compras por proveedor
  const bySupplier = new Map<string, string[]>();
  for (const x of toRestock) {
    const s = x.p.supplier?.trim() || "Sin proveedor asignado";
    bySupplier.set(s, [...(bySupplier.get(s) ?? []), `${x.p.name} (${x.qty})`]);
  }
  if (bySupplier.size) {
    recs.push({
      id: "compras",
      kind: "compras",
      priority: "baja",
      title: "Agrupa tu próxima compra por proveedor",
      description:
        "Comprar todo lo de un mismo proveedor en un solo viaje ahorra transporte y tiempo.",
      why: "Agrupa los productos por reponer según el proveedor registrado en cada producto.",
      evidence: [...bySupplier.entries()].map(([s, items]) => `${s}: ${items.join(", ")}`),
    });
  }

  const order = { alta: 0, media: 1, baja: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}

/* ------------------------------ Resumen para VeciBot ------------------------------ */

export const BI_DATA_WINDOW_DAYS = 62;
const BI_LIST_LIMIT = 10;
const BI_CATALOG_LIMIT = 30;
const LOW_ROTATION_MAX_UNITS = 2;

export function buildBusinessSnapshot(input: {
  storeName: string;
  ownerName: string;
  barrio: string;
  products: ProductLite[];
  sales: SaleLite[];
  expenses: ExpenseLite[];
  purchases: PurchaseLite[];
  hasDemoData: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const today = dateKey(now);
  const { products, sales, expenses, purchases } = input;
  const ranges = {
    hoy: { from: today, to: today },
    ayer: { from: addDays(today, -1), to: addDays(today, -1) },
    ultimos7dias: { from: addDays(today, -6), to: today },
    semanaAnterior: { from: addDays(today, -13), to: addDays(today, -7) },
    esteMes: { from: `${today.slice(0, 8)}01`, to: today },
    ultimos30dias: { from: addDays(today, -29), to: today },
  };
  const resumenes = Object.fromEntries(
    Object.entries(ranges).map(([k, r]) => [
      k,
      { ...r, ...summarize(sales, expenses, r, purchases) },
    ]),
  ) as Record<keyof typeof ranges, { from: string; to: string } & FinancialSummary>;
  const r30 = productRanking(sales, ranges.ultimos30dias, products);
  const avg = avgDailyUnits(sales, 14, now);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const slowProducts = r30
    .flatMap((r) => {
      const p = r.productId ? productsById.get(r.productId) : undefined;
      return p && p.quantity > 0 && r.qty <= LOW_ROTATION_MAX_UNITS
        ? [{ ...r, disponible: p.quantity }]
        : [];
    })
    .sort((a, b) => a.qty - b.qty || a.revenue - b.revenue || a.name.localeCompare(b.name));
  const lowStock = products
    .filter((p) => stockStatus(p) !== "ok")
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  const catalog = products.slice().sort((a, b) => a.name.localeCompare(b.name));
  const oldestSale = sales.reduce<string | null>((min, s) => {
    const k = dateKey(s.sale_date);
    return !min || k < min ? k : min;
  }, null);

  return {
    generadoEn: now.toISOString(),
    fechaHoy: today,
    zonaHoraria: APP_TIMEZONE,
    tienda: { nombre: input.storeName, propietario: input.ownerName, barrio: input.barrio },
    incluyeDatosDeDemostracion: input.hasDemoData,
    disponibilidadDeDatos: {
      desde: addDays(today, -(BI_DATA_WINDOW_DAYS - 1)),
      hasta: today,
      productosRegistrados: products.length,
      ventasCargadas: sales.length,
      sinVentasEnUltimos30dias: resumenes.ultimos30dias.transactions === 0,
      ventaMasAntiguaCargada: oldestSale,
      gastosCargados: expenses.length,
      comprasCargadas: purchases.length,
      nota: `Registros de los últimos ${BI_DATA_WINDOW_DAYS} días; los rankings abarcan los últimos 30 días. Cero ventas significa cero registros en ese periodo, no en toda la historia de la tienda.`,
      limitePorListadoInventario: BI_LIST_LIMIT,
      productosEnCatalogo: Math.min(products.length, BI_CATALOG_LIMIT),
      notaListados:
        "Los totales usan todos los registros consultados; los listados y el catálogo son una selección limitada.",
    },
    resumenes,
    ventasPorDia14: dailySeries(sales, expenses, { from: addDays(today, -13), to: today }).map(
      (d) => ({
        fecha: d.key,
        ventas: d.ventas,
        gananciaBruta: d.ganancia,
        gastos: d.gastos,
      }),
    ),
    masVendidos30dias: r30
      .filter((r) => r.qty > 0)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        disponible: r.productId ? (productsById.get(r.productId)?.quantity ?? null) : null,
      })),
    inventario: {
      productosConStockBajoOCritico: lowStock.length,
      productosAgotados: lowStock.filter((p) => p.quantity <= 0).length,
      productosDeBajaRotacion: slowProducts.length,
      criterioBajaRotacion: `Con existencias y entre 0 y ${LOW_ROTATION_MAX_UNITS} unidades vendidas en los últimos 30 días. No prueba que lleven 30 días en inventario.`,
    },
    stockBajoOCritico: lowStock.slice(0, BI_LIST_LIMIT).map((p) => ({
      productId: p.id,
      nombre: p.name,
      disponible: p.quantity,
      stockMinimo: p.min_stock,
      estado: stockStatus(p),
      reposicionSugerida: suggestedReorder(p, avg.get(p.id) ?? 0),
      proveedor: p.supplier ?? null,
    })),
    menorMovimiento30dias: slowProducts.slice(0, BI_LIST_LIMIT),
    gastosPorCategoria30dias: expensesByCategory(expenses, ranges.ultimos30dias).slice(
      0,
      BI_LIST_LIMIT,
    ),
    productos: catalog.slice(0, BI_CATALOG_LIMIT).map((p) => {
      const m = unitMargin(p);
      return {
        nombre: p.name,
        categoria: p.category,
        precioCompra: p.purchase_price,
        precioVenta: p.sale_price,
        margenUnidad: m.amount,
        margenPorcentaje: m.percent,
        bajoCosto: m.belowCost,
        disponible: p.quantity,
        stockMinimo: p.min_stock,
        estado: stockStatus(p),
        ventaPromedioDiaria14d: Number((avg.get(p.id) ?? 0).toFixed(2)),
        proveedor: p.supplier ?? null,
      };
    }),
  };
}

/** Saldo de ventas a crédito que siguen pendientes, sin límite de antigüedad. */
export function totalPending(sales: { credit_status: string | null; total: number }[]) {
  return round2(sales.reduce((sum, sale) => sum + (sale.credit_status === "Pendiente" ? sale.total : 0), 0));
}

export function promotionCombos(products: ProductLite[], sales: SaleLite[], now = new Date()) {
  const today = dateKey(now);
  const ranks = productRanking(sales, { from: addDays(today, -29), to: today }, products);
  const rank = new Map(ranks.map((item) => [item.productId, item.qty]));
  const available = products.filter((p) => p.quantity > p.min_stock && p.sale_price > p.purchase_price);
  const high = [...available].filter((p) => (rank.get(p.id) ?? 0) > 0)
    .sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0))
    .slice(0, Math.max(1, Math.floor(available.length / 3)));
  const highIds = new Set(high.map((p) => p.id));
  const low = available.filter((p) => !highIds.has(p.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || b.quantity - a.quantity);
  return high.slice(0, 3).flatMap((p) => {
    const index = low.findIndex((other) => (rank.get(other.id) ?? 0) < (rank.get(p.id) ?? 0));
    const other = index >= 0 ? low.splice(index, 1)[0] : undefined;
    if (!other) return [];
    const regular = round2(p.sale_price + other.sale_price);
    const cost = round2(p.purchase_price + other.purchase_price);
    const price = Math.max(round2(cost + 0.01), round2(regular * 0.9));
    return price < regular ? [{ high: p, low: other, price, regular, saving: round2(regular - price) }] : [];
  });
}
