import { queryOptions, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/integrations/supabase/types";
import { businessApi, chatApi } from "./local-client";

export type Store = Tables<"stores">;
export type Profile = Tables<"profiles">;
export type Product = Tables<"products"> & { unit: string };
export type Sale = Tables<"sales"> & {
  sale_items: Tables<"sale_items">[];
  payment_type: "Pagado" | "Fiado";
  credit_customer: string | null;
  credit_status: "Pendiente" | "Pagado" | null;
  paid_at: string | null;
};
export type Purchase = Tables<"purchases"> & { purchase_items: Tables<"purchase_items">[]; update_cost: 0 | 1 };
export type Expense = Tables<"expenses">;
export type Movement = Tables<"inventory_movements">;
export type ChatMessageRow = Tables<"chat_messages">;

const businessQuery = <T>(resource: string) => queryOptions({
  queryKey: [resource],
  queryFn: () => businessApi.read<T>(resource),
});

export const storeQuery = businessQuery<{ store: Store; profile: Profile; email: string }>("store");
export const productsQuery = businessQuery<Product[]>("products");
export const salesQuery = businessQuery<Sale[]>("sales");
export const expensesQuery = businessQuery<Expense[]>("expenses");
export const purchasesQuery = businessQuery<Purchase[]>("purchases");
export const movementsQuery = businessQuery<Movement[]>("movements");
export const chatQuery = queryOptions({
  queryKey: ["chat"],
  queryFn: chatApi.history,
  staleTime: Infinity,
});

export function useRefreshBusiness() {
  const client = useQueryClient();
  return () =>
    Promise.all(
      ["store", "products", "sales", "expenses", "purchases", "movements", "chat"].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    );
}
