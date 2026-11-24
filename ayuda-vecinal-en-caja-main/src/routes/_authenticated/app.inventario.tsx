import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Boxes, Loader2, PackageX, Sliders, Truck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, SectionCard, StatCard, StockBadge } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessApi } from "@/lib/local-client";
import { avgDailyUnits, stockStatus, suggestedReorder } from "@/lib/finance";
import { errorMessage, formatDateTime, money, reasonLabel } from "@/lib/format";
import { movementsQuery, productsQuery, salesQuery, useRefreshBusiness, type Product } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/inventario")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(salesQuery),
      context.queryClient.ensureQueryData(movementsQuery),
    ]),
  component: Inventario,
});

type Filter = "todos" | "bajo" | "agotado";

function Inventario() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: sales } = useSuspenseQuery(salesQuery);
  const { data: movements } = useSuspenseQuery(movementsQuery);
  const [filter, setFilter] = useState<Filter>("todos");
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const avg = useMemo(() => avgDailyUnits(sales, 14), [sales]);
  const low = products.filter((p) => stockStatus(p) === "bajo");
  const out = products.filter((p) => stockStatus(p) === "agotado");
  const value = products.reduce((a, p) => a + p.quantity * p.purchase_price, 0);
  const list = products.filter((p) => filter === "todos" || stockStatus(p) === filter);
  const restock = [...out, ...low].map((p) => ({ p, avg: avg.get(p.id) ?? 0, qty: suggestedReorder(p, avg.get(p.id) ?? 0) }));

  return (
    <div>
      <PageHeader
        title="Inventario"
        icon={Boxes}
        description="Existencias, alertas de reposición e historial de entradas y salidas."
        actions={
          <>
            <Button asChild variant="outline"><Link to="/app/productos">Gestionar productos</Link></Button>
            <Button asChild variant="outline">
              <Link to="/app/compras"><Truck /> Registrar compra</Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Disponibles" value={products.length - out.length} hint="Productos con existencias" icon={Boxes} />
        <StatCard label="Pocas unidades" value={low.length} hint="En o bajo el mínimo" icon={TriangleAlert} tone="amber" />
        <StatCard label="Agotados" value={out.length} hint="Sin existencias" icon={PackageX} tone="red" />
        <StatCard label="Valor al costo" value={money(value)} hint="Mercadería en bodega" icon={Truck} tone="navy" />
      </div>

      <Tabs defaultValue="existencias">
        <TabsList className="mb-4 grid w-full grid-cols-3 sm:w-[28rem]">
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="reponer">Reponer ({restock.length})</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="existencias">
          <div className="mb-3 flex gap-2">
            {(
              [
                ["todos", "Todos"],
                ["bajo", "Pocas unidades"],
                ["agotado", "Agotados"],
              ] as const
            ).map(([k, l]) => (
              <Button key={k} size="sm" variant={filter === k ? "soft" : "outline"} className={filter === k ? "border border-info/40" : undefined} onClick={() => setFilter(k)}>
                {l}
              </Button>
            ))}
          </div>
          {list.length === 0 ? (
            <EmptyState icon={Boxes} title="Nada por aquí" description={filter === "todos" ? "Registra productos para ver tu inventario." : "¡Bien! No hay productos en esta situación."} />
          ) : (
            <SectionCard>
              <ul className="divide-y">
                {list.map((p) => {
                  const pct = Math.min(100, p.min_stock > 0 ? (p.quantity / (p.min_stock * 2)) * 100 : 100);
                  const s = stockStatus(p);
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                          <StockBadge quantity={p.quantity} min={p.min_stock} />
                        </div>
                        <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", s === "ok" ? "bg-info" : s === "bajo" ? "bg-warning" : "bg-destructive")} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.quantity} ({p.unit}) · mínimo {p.min_stock} · vende ~{(avg.get(p.id) ?? 0).toFixed(1)}/día
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setAdjusting(p)}>
                        <Sliders /> <span className="hidden sm:inline">Ajustar</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="reponer">
          {restock.length === 0 ? (
            <EmptyState icon={Boxes} title="No hay nada que reponer" description="Todos tus productos están sobre su stock mínimo." />
          ) : (
            <SectionCard title="Alertas de reposición" description="Sugerido = venta promedio de 7 días + stock mínimo − existencias actuales">
              <ul className="divide-y">
                {restock.map(({ p, avg: a, qty }) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-xl", p.quantity <= 0 ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning-foreground")}>
                      {p.quantity <= 0 ? <PackageX className="size-4" /> : <TriangleAlert className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Hay {p.quantity} · mín. {p.min_stock} · ~{a.toFixed(1)}/día{p.supplier ? ` · ${p.supplier}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Comprar</p>
                      <p className="tabular font-bold text-info">{qty} u.</p>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="movimientos">
          {movements.length === 0 ? (
            <EmptyState icon={Boxes} title="Sin movimientos" description="Las ventas, compras y ajustes aparecerán aquí." />
          ) : (
            <SectionCard title="Historial de entradas y salidas" description="Últimos 300 movimientos">
              <ul className="divide-y">
                {movements.map((m) => {
                  const isIn = m.movement_type === "entrada" || (m.movement_type === "ajuste" && m.quantity > 0);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2.5">
                      <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", m.movement_type === "ajuste" ? "bg-info-soft text-info" : isIn ? "bg-info-soft text-info" : "bg-navy-soft text-navy")}>
                        {m.movement_type === "ajuste" ? <Sliders className="size-4" /> : isIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">{m.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {reasonLabel(m.reason)} · {formatDateTime(m.created_at)}
                          {m.stock_after != null ? ` · quedaron ${m.stock_after}` : ""}
                        </p>
                      </div>
                      <span className={cn("tabular text-sm font-bold", isIn ? "text-info" : "text-navy")}>
                        {isIn ? "+" : "−"}
                        {Math.abs(m.quantity)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </TabsContent>
      </Tabs>

      <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function AdjustDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const refresh = useRefreshBusiness();
  const [qty, setQty] = useState("");
  const [min, setMin] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  if (product && product.id !== lastId) {
    setLastId(product.id);
    setQty(String(product.quantity));
    setMin(String(product.min_stock));
  }

  async function save() {
    if (!product) return;
    const q = Number(qty);
    const m = Number(min);
    if (!Number.isInteger(q) || q < 0 || !Number.isInteger(m) || m < 0) return void toast.error("Usa números enteros mayores o iguales a 0.");
    setSaving(true);
    const { error } = await businessApi.save("stock", { quantity: q, min_stock: m }, product.id);
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Inventario ajustado.");
    refresh();
    setLastId(null);
    onClose();
  }

  return (
    <Dialog
      open={!!product}
      onOpenChange={(o) => {
        if (!o) {
          setLastId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-navy">Ajustar {product?.name}</DialogTitle>
          <DialogDescription>Usa esto para corregir conteos (mermas, roturas, conteo físico). Queda registrado como ajuste.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Existencias reales</Label>
            <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Stock mínimo</Label>
            <Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
