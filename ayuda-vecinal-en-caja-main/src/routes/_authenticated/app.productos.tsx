import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, PageHeader, StockBadge } from "@/components/app/kit";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessApi } from "@/lib/local-client";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { unitMargin } from "@/lib/finance";
import { errorMessage, money, percent } from "@/lib/format";
import { productsQuery, storeQuery, useRefreshBusiness, type Product } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/productos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery),
  component: Productos,
});

function Productos() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Todas");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (cat === "Todas" || p.category === cat) &&
        (!term || p.name.toLowerCase().includes(term) || (p.supplier ?? "").toLowerCase().includes(term)),
    );
  }, [products, q, cat]);

  async function remove() {
    if (!toDelete) return;
    const { error } = await businessApi.remove("products", toDelete.id);
    if (error) return void toast.error(errorMessage(error));
    toast.success(`"${toDelete.name}" fue eliminado. El historial de ventas se conserva.`);
    setToDelete(null);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        icon={Package}
        description={`${products.length} producto${products.length === 1 ? "" : "s"} en tu catálogo`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Nuevo producto
          </Button>
        }
      />

      <div className="sticky top-[77px] z-20 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none lg:top-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o proveedor…" className="h-11 bg-card pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto py-1">
          {["Todas", ...PRODUCT_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "visual-button shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
                cat === c ? "border-info bg-info-soft text-info" : "bg-card text-navy hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? "Aún no tienes productos" : "No encontramos productos"}
          description={products.length === 0 ? "Agrega lo que vendes en tu tienda para empezar a registrar ventas." : "Prueba con otra palabra o categoría."}
          action={
            products.length === 0 && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus /> Agregar mi primer producto
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const m = unitMargin(p);
            return (
              <li key={p.id} className="surface-card min-w-0 rounded-2xl border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-navy">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.category}
                      {p.supplier ? ` · ${p.supplier}` : ""}
                    </p>
                  </div>
                  <StockBadge quantity={p.quantity} min={p.min_stock} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted px-2 py-2">
                    <dt className="text-[11px] text-muted-foreground">Compra</dt>
                    <dd className="tabular text-sm font-bold text-navy">{money(p.purchase_price)}</dd>
                  </div>
                  <div className="rounded-xl bg-muted px-2 py-2">
                    <dt className="text-[11px] text-muted-foreground">Venta</dt>
                    <dd className="tabular text-sm font-bold text-navy">{money(p.sale_price)}</dd>
                  </div>
                  <div className={cn("rounded-xl px-2 py-2", m.belowCost ? "bg-destructive-soft" : "bg-info-soft")}>
                    <dt className="text-[11px] text-muted-foreground">Margen</dt>
                    <dd className={cn("tabular text-sm font-bold", m.belowCost ? "text-destructive" : "text-accent-foreground")}>{money(m.amount)}</dd>
                  </div>
                </dl>
                {m.belowCost && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="size-3.5" /> Precio de venta inferior al costo registrado
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="tabular font-bold text-navy">{p.quantity} · {p.unit}</span>
                    <span className="text-muted-foreground">disponibles · mín. {p.min_stock}</span>
                    {!m.belowCost && m.percent !== null && <Badge variant="outline" className="hidden sm:inline-flex">{percent(m.percent)}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${p.name}`} className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setToDelete(p)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        defaultMinStock={me.store.default_min_stock}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="¿Eliminar este producto?"
        description={`Vas a eliminar "${toDelete?.name}" del catálogo. Las ventas y compras pasadas se conservan en el historial. Esta acción no se puede deshacer.`}
        onConfirm={remove}
      />
    </div>
  );
}
