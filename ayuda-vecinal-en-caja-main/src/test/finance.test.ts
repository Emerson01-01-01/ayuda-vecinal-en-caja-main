import { describe, expect, it } from "vitest";

import {
  buildBusinessSnapshot,
  generateRecommendations,
  stockStatus,
  suggestedReorder,
  summarize,
  unitMargin,
  validateCart,
  type ExpenseLite,
  type ProductLite,
  type PurchaseLite,
  type SaleLite,
} from "@/lib/finance";

const day = "2026-10-20";
const range = { from: day, to: day };

const sales: SaleLite[] = [
  { id: "s1", sale_date: `${day}T10:00:00-05:00`, total: 10, total_cost: 7, sale_items: [] },
  { id: "s2", sale_date: `${day}T15:00:00-05:00`, total: 5, total_cost: 3, sale_items: [] },
];
const expenses: ExpenseLite[] = [
  { id: "e1", description: "Luz", category: "Servicios básicos", amount: 2, expense_date: day },
];

describe("Fórmulas de reportes", () => {
  it("ganancia bruta = ventas − costo de lo vendido", () => {
    const s = summarize(sales, expenses, range);
    expect(s.salesTotal).toBe(15);
    expect(s.cogs).toBe(10);
    expect(s.grossProfit).toBe(5);
  });

  it("resultado operativo = ganancia bruta − gastos operativos", () => {
    expect(summarize(sales, expenses, range).operatingResult).toBe(3);
  });

  it("el total vendido no se confunde con la ganancia", () => {
    const s = summarize(sales, expenses, range);
    expect(s.salesTotal).not.toBe(s.grossProfit);
  });

  it("las ventas de otros días no entran en el periodo", () => {
    const other: SaleLite = {
      id: "s3",
      sale_date: "2026-10-19T12:00:00-05:00",
      total: 100,
      total_cost: 50,
      sale_items: [],
    };
    expect(summarize([...sales, other], expenses, range).salesTotal).toBe(15);
  });
});

describe("Productos", () => {
  it("margen por unidad y aviso cuando la venta es menor al costo", () => {
    expect(unitMargin({ purchase_price: 0.55, sale_price: 0.75 })).toMatchObject({
      amount: 0.2,
      belowCost: false,
    });
    expect(unitMargin({ purchase_price: 2.1, sale_price: 2 }).belowCost).toBe(true);
  });

  it("estado de stock: agotado, bajo (≤ mínimo) y disponible", () => {
    expect(stockStatus({ quantity: 0, min_stock: 5 })).toBe("agotado");
    expect(stockStatus({ quantity: 5, min_stock: 5 })).toBe("bajo");
    expect(stockStatus({ quantity: 6, min_stock: 5 })).toBe("ok");
  });
});

const leche: ProductLite = {
  id: "p1",
  name: "Leche",
  category: "Lácteos",
  purchase_price: 0.85,
  sale_price: 1.05,
  quantity: 3,
  min_stock: 10,
  supplier: "Lácteos Chimborazo",
};

describe("Ventas", () => {
  it("no permite vender más unidades de las disponibles", () => {
    expect(validateCart([{ productId: "p1", quantity: 4 }], [leche])).toHaveLength(1);
    expect(validateCart([{ productId: "p1", quantity: 3 }], [leche])).toHaveLength(0);
  });
});

describe("Reposición", () => {
  it("sugerido = 7 días de venta promedio + mínimo − existencias", () => {
    expect(suggestedReorder(leche, 2)).toBe(21);
    expect(suggestedReorder({ ...leche, quantity: 100 }, 2)).toBe(0);
  });

  it("recomienda reponer los productos bajo el mínimo", () => {
    const recs = generateRecommendations({
      products: [leche],
      sales: [],
      expenses: [],
      now: new Date(`${day}T12:00:00-05:00`),
    });
    expect(recs.some((r) => r.kind === "reposicion")).toBe(true);
  });
});

const now = new Date("2026-11-13T12:00:00-05:00");

function product(id: string, overrides: Partial<ProductLite> = {}): ProductLite {
  return {
    id,
    name: id,
    category: "Abarrotes",
    purchase_price: 1,
    sale_price: 2,
    quantity: 10,
    min_stock: 2,
    ...overrides,
  };
}

function sale(
  id: string,
  productId: string | null,
  quantity: number,
  saleDate = "2026-11-13T12:00:00-05:00",
): SaleLite {
  return {
    id,
    sale_date: saleDate,
    total: quantity * 2,
    total_cost: quantity,
    sale_items: [
      {
        product_id: productId,
        product_name: productId ?? "Producto eliminado",
        quantity,
        unit_price: 2,
        unit_cost: 1,
        subtotal: quantity * 2,
      },
    ],
  };
}

function snapshot(
  input: {
    products?: ProductLite[];
    sales?: SaleLite[];
    expenses?: ExpenseLite[];
    purchases?: PurchaseLite[];
  } = {},
) {
  return buildBusinessSnapshot({
    storeName: "Mi tienda",
    ownerName: "Ana",
    barrio: "Centro",
    hasDemoData: false,
    products: [],
    sales: [],
    expenses: [],
    purchases: [],
    ...input,
    now,
  });
}

describe("Contexto BI", () => {
  it("ordena el top 5 por unidades y luego ingresos, incluyendo el primer día local del periodo", () => {
    const result = snapshot({
      products: Array.from({ length: 6 }, (_, i) => product(`p${i}`)),
      sales: [
        ...Array.from({ length: 6 }, (_, i) => sale(`s${i}`, `p${i}`, i + 1)),
        sale("limite", "p0", 7, "2026-10-15T05:00:00Z"),
        sale("fuera", "p1", 100, "2026-10-15T04:59:59Z"),
        sale("futura", "p1", 100, "2026-11-14T05:00:00Z"),
        {
          ...sale("mayor-ingreso", "p4", 1),
          total: 4,
          sale_items: [
            {
              product_id: "p4",
              product_name: "p4",
              quantity: 1,
              unit_price: 4,
              unit_cost: 1,
              subtotal: 4,
            },
          ],
        },
      ],
    });
    expect(result.masVendidos30dias.map((p) => p.productId)).toEqual([
      "p0",
      "p4",
      "p5",
      "p3",
      "p2",
    ]);
    expect(result.masVendidos30dias[0]).toMatchObject({ qty: 8, revenue: 16, disponible: 10 });
    expect(result.resumenes.ultimos30dias.from).toBe("2026-10-15");
  });

  it("incluye agotados y el umbral exacto de stock, y limita detalles sin perder los conteos", () => {
    const result = snapshot({
      products: [
        product("agotado", { quantity: 0, min_stock: 0 }),
        ...Array.from({ length: 11 }, (_, i) => product(`bajo${i}`, { quantity: 2 })),
        product("normal", { quantity: 3 }),
      ],
    });
    expect(result.inventario).toMatchObject({
      productosConStockBajoOCritico: 12,
      productosAgotados: 1,
    });
    expect(result.stockBajoOCritico).toHaveLength(10);
    expect(result.stockBajoOCritico[0]).toMatchObject({ nombre: "agotado", estado: "agotado" });
    expect(result.stockBajoOCritico.find((p) => p.nombre === "normal")).toBeUndefined();
  });

  it("baja rotación solo incluye existencias con entre cero y dos unidades vendidas", () => {
    const result = snapshot({
      products: [
        product("sin-ventas"),
        product("lento"),
        product("popular"),
        product("agotado", { quantity: 0 }),
      ],
      sales: [sale("s1", "lento", 2), sale("s2", "popular", 3), sale("s3", "agotado", 1)],
    });
    expect(result.menorMovimiento30dias.map((p) => p.productId)).toEqual(["sin-ventas", "lento"]);
    expect(result.inventario.productosDeBajaRotacion).toBe(2);
  });

  it("separa compras y gastos y conserva los costos históricos aunque cambie el precio de compra", () => {
    const result = snapshot({
      products: [product("leche", { purchase_price: 999 })],
      sales: [sale("s1", "leche", 5)],
      expenses: [
        {
          id: "e1",
          description: "Luz",
          category: "Servicios",
          amount: 2,
          expense_date: "2026-11-13",
        },
      ],
      purchases: [
        { id: "c1", purchase_date: "2026-11-13", supplier: null, total: 0.1 },
        { id: "c2", purchase_date: "2026-11-13", supplier: null, total: 0.2 },
        { id: "c3", purchase_date: "2026-10-14", supplier: null, total: 100 },
      ],
    });
    expect(result.resumenes.ultimos30dias).toMatchObject({
      salesTotal: 10,
      cogs: 5,
      grossProfit: 5,
      operatingExpenses: 2,
      operatingResult: 3,
      grossMarginPct: 50,
      merchandisePurchases: 0.3,
    });
  });

  it("sin ventas entrega ceros y margen null, pero mantiene los gastos y alertas reales", () => {
    const result = snapshot({
      products: [product("leche", { quantity: 1 })],
      expenses: [
        {
          id: "e1",
          description: "Luz",
          category: "Servicios",
          amount: 2,
          expense_date: "2026-11-13",
        },
      ],
    });
    expect(result.disponibilidadDeDatos.sinVentasEnUltimos30dias).toBe(true);
    expect(result.resumenes.ultimos30dias).toMatchObject({
      salesTotal: 0,
      cogs: 0,
      grossProfit: 0,
      operatingResult: -2,
      grossMarginPct: null,
      avgTicket: 0,
      transactions: 0,
    });
    expect(result.masVendidos30dias).toEqual([]);
    expect(result.stockBajoOCritico).toHaveLength(1);
    expect(result.menorMovimiento30dias).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("no confunde ventas antiguas con las del periodo y conserva las de productos eliminados", () => {
    const result = snapshot({ sales: [sale("antigua", "p1", 10, "2026-10-01T12:00:00-05:00")] });
    expect(result.disponibilidadDeDatos).toMatchObject({
      ventasCargadas: 1,
      sinVentasEnUltimos30dias: true,
    });
    expect(result.masVendidos30dias).toEqual([]);
    const deleted = snapshot({ sales: [sale("borrado", null, 5)] });
    expect(deleted.masVendidos30dias[0]).toMatchObject({
      productId: null,
      qty: 5,
      revenue: 10,
      disponible: null,
    });
    expect(deleted.menorMovimiento30dias).toEqual([]);
  });
});
