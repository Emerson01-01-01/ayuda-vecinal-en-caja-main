import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { businessApi } from "@/lib/local-client";
import { productsQuery, useRefreshBusiness, type Purchase, type Sale } from "@/lib/queries";
import type { MovementDraft } from "@/lib/vecibotParser.js";
import { ConfirmDialog } from "./kit";
import { MovementEditor } from "./MovementEditor";

export function LedgerActions({ entry }: { entry: Sale | Purchase }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const purchase = "purchase_items" in entry;
  const name = purchase ? "compra" : "venta";
  const draft: MovementDraft = {
    intent: purchase
      ? "REGISTRAR_COMPRA"
      : entry.payment_type === "Fiado"
        ? "REGISTRAR_FIADO"
        : "REGISTRAR_VENTA",
    party: (purchase ? entry.supplier : entry.credit_customer) ?? "",
    items: (purchase ? entry.purchase_items : entry.sale_items).map((item) => ({
      productId: item.product_id ?? "",
      description: item.product_name,
      quantity: String(item.quantity),
      price: String("unit_price" in item ? item.unit_price : item.unit_cost),
    })),
  };

  async function cancelEntry() {
    const { error } = await businessApi.remove(purchase ? "purchases" : "sales", entry.id);
    if (error) return void toast.error(error.message);
    toast.success(
      purchase
        ? "Compra anulada. Inventario actualizado."
        : "Venta anulada. Inventario actualizado.",
    );
    await refresh();
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {editing ? (
        <MovementEditor
          draft={draft}
          products={products}
          existing={{
            id: entry.id,
            notes: entry.notes,
            ...(purchase ? { date: entry.purchase_date, updateCost: !!entry.update_cost } : {}),
          }}
          onCancel={() => setEditing(false)}
          onSave={() => {
            setEditing(false);
            toast.success("Cambios guardados. Inventario actualizado.");
            void refresh();
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Editar {name}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(true)}>
            <Trash2 /> Anular {name}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`¿Anular esta ${name}?`}
        description="El registro saldrá del historial y se ajustará el inventario."
        confirmLabel={`Anular ${name}`}
        onConfirm={cancelEntry}
      />
    </div>
  );
}
