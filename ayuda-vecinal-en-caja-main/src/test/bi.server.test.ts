import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { obtenerContextoBI } from "@/server/bi.server";

const now = new Date("2026-11-13T12:00:00-05:00");
type Row = Record<string, unknown>;
type Fixture = Record<string, Row[]>;
let clientCount = 0;

function database(fixture: Fixture = {}, failTable?: string) {
  const requests: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split("/").at(-1) ?? "";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (table === failTable && (table === "profiles" || offset > 0)) {
      return Response.json({ message: "Error de lectura", code: "TEST" }, { status: 400 });
    }
    let rows = fixture[table] ?? [];
    // El doble HTTP aplica filtros; no necesita credenciales ni conexión a Supabase.
    for (const [key, expression] of url.searchParams) {
      const match = /^(eq|gte|lte)\.(.*)$/.exec(expression);
      if (!match) continue;
      const [, operator, expected] = match;
      rows = rows.filter((row) => {
        const nested = row["sales"] as Row | undefined;
        const value = String(key === "sales.sale_date" ? nested?.["sale_date"] : row[key]);
        if (operator === "eq") return value === expected;
        if (expected === undefined) return false;
        if (key.endsWith("sale_date")) {
          return operator === "gte"
            ? Date.parse(value) >= Date.parse(expected)
            : Date.parse(value) <= Date.parse(expected);
        }
        return operator === "gte" ? value >= expected : value <= expected;
      });
    }
    // Simula un límite PostgREST menor al solicitado, para detectar truncamientos.
    return Response.json(rows.slice(offset, offset + 200));
  });
  const supabase = createClient<Database>("https://example.supabase.co", "test-publishable-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `bi-test-${++clientCount}`,
    },
    global: { fetch: fetchMock, headers: { Authorization: "Bearer propietario" } },
  });
  return { supabase, requests };
}

const shop: Row = {
  id: "store1",
  owner_id: "owner1",
  name: "Mi tienda",
  barrio: "Centro",
  has_demo_data: true,
};
const profile: Row = { id: "owner1", owner_name: "Ana" };

describe("obtenerContextoBI: consultas reales al cliente Supabase con HTTP simulado", () => {
  it("pagina ventas e ítems sin truncarlos, incluso con más de mil líneas en una venta", async () => {
    const sales = Array.from({ length: 1005 }, (_, i) => ({
      id: `s${i}`,
      store_id: "store1",
      sale_date: now.toISOString(),
      total: i === 0 ? 2402 : 2,
      total_cost: i === 0 ? 1201 : 1,
    }));
    const items = Array.from({ length: 2205 }, (_, i) => ({
      sale_id: i <= 1200 ? "s0" : `s${i - 1200}`,
      store_id: "store1",
      product_id: "p1",
      product_name: "Leche",
      category: "Lácteos",
      quantity: 1,
      unit_price: 2,
      unit_cost: 1,
      subtotal: 2,
      sales: { sale_date: now.toISOString() },
    }));
    const { supabase, requests } = database({
      stores: [shop, { ...shop, id: "store2", owner_id: "owner2" }],
      profiles: [profile],
      products: [
        {
          id: "p1",
          store_id: "store1",
          name: "Leche",
          category: "Lácteos",
          quantity: 10,
          min_stock: 2,
          purchase_price: 1,
          sale_price: 2,
          supplier: null,
        },
      ],
      sales: [...sales, { ...sales[1], id: "ajena", store_id: "store2", total: 99999 }],
      sale_items: items,
      expenses: Array.from({ length: 1005 }, (_, i) => ({
        id: `e${i}`,
        store_id: "store1",
        expense_date: "2026-11-13",
        amount: 0.1,
        category: "Servicios",
        description: "Luz",
      })),
      purchases: Array.from({ length: 1005 }, (_, i) => ({
        id: `c${i}`,
        store_id: "store1",
        purchase_date: "2026-11-13",
        total: 0.2,
        supplier: null,
      })),
    });

    const result = await obtenerContextoBI(supabase, "owner1", now);
    expect(result?.storeId).toBe("store1");
    expect(result?.contexto.resumenes.ultimos30dias).toMatchObject({
      transactions: 1005,
      unitsSold: 2205,
      salesTotal: 4410,
      cogs: 2205,
      operatingExpenses: 100.5,
      merchandisePurchases: 201,
      operatingResult: 2104.5,
    });
    expect(result?.contexto.masVendidos30dias[0]).toMatchObject({ qty: 2205, revenue: 4410 });
    expect(result?.contexto.incluyeDatosDeDemostracion).toBe(true);
    for (const url of requests) {
      const table = url.pathname.split("/").at(-1);
      if (table === "stores") expect(url.searchParams.get("owner_id")).toBe("eq.owner1");
      else if (table === "profiles") expect(url.searchParams.get("id")).toBe("eq.owner1");
      else {
        expect(url.searchParams.get("store_id")).toBe("eq.store1");
        expect(url.searchParams.get("order")).toContain("id.asc");
      }
    }
    const itemQuery = requests.find((url) => url.pathname.endsWith("/sale_items"));
    expect(itemQuery?.searchParams.getAll("sales.sale_date")).toEqual([
      "gte.2026-09-13T00:00:00-05:00",
      "lte.2026-11-13T17:00:00.000Z",
    ]);
    const saleQuery = requests.find((url) => url.pathname.endsWith("/sales"));
    expect(saleQuery?.searchParams.getAll("sale_date")).toEqual([
      "gte.2026-09-13T00:00:00-05:00",
      "lte.2026-11-13T17:00:00.000Z",
    ]);
  });

  it("devuelve un contexto válido para una tienda vacía", async () => {
    const { supabase } = database({ stores: [shop] });
    const result = await obtenerContextoBI(supabase, "owner1", now);
    expect(result?.contexto.disponibilidadDeDatos.sinVentasEnUltimos30dias).toBe(true);
    expect(result?.contexto.resumenes.ultimos30dias).toMatchObject({
      salesTotal: 0,
      merchandisePurchases: 0,
      grossMarginPct: null,
    });
    expect(result?.contexto.stockBajoOCritico).toEqual([]);
  });

  it("no consulta los registros comerciales si el usuario no tiene tienda", async () => {
    const { supabase, requests } = database({ stores: [{ ...shop, owner_id: "otro" }] });
    expect(await obtenerContextoBI(supabase, "owner1", now)).toBeNull();
    expect(requests).toHaveLength(2);
  });

  it("rechaza el resumen completo si falla una página posterior", async () => {
    const { supabase } = database(
      {
        stores: [shop],
        sales: Array.from({ length: 201 }, (_, i) => ({
          id: `s${i}`,
          store_id: "store1",
          sale_date: now.toISOString(),
          total: 2,
          total_cost: 1,
        })),
      },
      "sales",
    );
    await expect(obtenerContextoBI(supabase, "owner1", now)).rejects.toMatchObject({
      message: "Error de lectura",
    });
  });

  it("no oculta los errores de lectura del perfil", async () => {
    const { supabase } = database({ stores: [shop] }, "profiles");
    await expect(obtenerContextoBI(supabase, "owner1", now)).rejects.toMatchObject({
      message: "Error de lectura",
    });
  });
});
