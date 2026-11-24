import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  addDays,
  BI_DATA_WINDOW_DAYS,
  buildBusinessSnapshot,
  dateKey,
  startOfDayISO,
} from "@/lib/finance";

const PAGE_SIZE = 500;
export type ContextoBI = ReturnType<typeof buildBusinessSnapshot>;

/** No devuelve totales parciales: cualquier error de una página cancela el contexto. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await build(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data) throw new Error("La consulta BI no devolvió datos.");
    if (data.length === 0) return rows;
    rows.push(...data);
    // Se avanza por filas recibidas: también funciona si PostgREST limita la página.
  }
}

/**
 * Consulta fresca por pregunta, con el cliente del propietario (JWT + RLS).
 * ownerId debe proceder de la sesión verificada, nunca del cuerpo de la petición.
 * Devuelve null si el propietario todavía no tiene tienda.
 */
export async function obtenerContextoBI(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  now: Date = new Date(),
): Promise<{ storeId: string; contexto: ContextoBI } | null> {
  const [storeRes, profileRes] = await Promise.all([
    supabase
      .from("stores")
      .select("id,name,barrio,has_demo_data")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase.from("profiles").select("owner_name").eq("id", ownerId).maybeSingle(),
  ]);
  if (storeRes.error) throw storeRes.error;
  if (profileRes.error) throw profileRes.error;
  const store = storeRes.data;
  if (!store) return null;

  const today = dateKey(now);
  const since = addDays(today, -(BI_DATA_WINDOW_DAYS - 1));
  const sinceISO = startOfDayISO(since);
  const untilISO = now.toISOString();
  const [products, sales, items, expenses, purchases] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("products")
        .select("id,name,category,purchase_price,sale_price,quantity,min_stock,supplier")
        .eq("store_id", store.id)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("sales")
        .select("id,sale_date,total,total_cost")
        .eq("store_id", store.id)
        .gte("sale_date", sinceISO)
        .lte("sale_date", untilISO)
        .order("id")
        .range(from, to),
    ),
    // Paginación independiente: una relación embebida puede truncar los ítems de una venta.
    fetchAll((from, to) =>
      supabase
        .from("sale_items")
        .select(
          "sale_id,product_id,product_name,category,quantity,unit_price,unit_cost,subtotal,sales!inner(sale_date)",
        )
        .eq("store_id", store.id)
        .gte("sales.sale_date", sinceISO)
        .lte("sales.sale_date", untilISO)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("expenses")
        .select("id,description,category,amount,expense_date")
        .eq("store_id", store.id)
        .gte("expense_date", since)
        .lte("expense_date", today)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("purchases")
        .select("id,purchase_date,supplier,total")
        .eq("store_id", store.id)
        .gte("purchase_date", since)
        .lte("purchase_date", today)
        .order("id")
        .range(from, to),
    ),
  ]);

  const itemsBySale = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsBySale.get(item.sale_id) ?? [];
    group.push(item);
    itemsBySale.set(item.sale_id, group);
  }

  return {
    storeId: store.id,
    contexto: buildBusinessSnapshot({
      storeName: store.name,
      ownerName: profileRes.data?.owner_name ?? "",
      barrio: store.barrio,
      products,
      sales: sales.map((sale) => ({ ...sale, sale_items: itemsBySale.get(sale.id) ?? [] })),
      expenses,
      purchases,
      hasDemoData: store.has_demo_data,
      now,
    }),
  };
}
