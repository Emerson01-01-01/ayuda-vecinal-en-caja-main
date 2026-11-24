import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, PageHeader, SectionCard } from "@/components/app/kit";
import { LedgerActions } from "@/components/app/LedgerActions";
import { AssistedEntry } from "@/components/app/AssistedEntry";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessApi } from "@/lib/local-client";
import { dateKey } from "@/lib/finance";
import { errorMessage, formatDate, money } from "@/lib/format";
import { productsQuery, purchasesQuery, useRefreshBusiness, type Product } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/compras")({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(productsQuery), context.queryClient.ensureQueryData(purchasesQuery)]),
  component: Compras,
});

function Compras() {
  return (
    <div>
      <PageHeader
        title="Compras de mercadería"
        icon={Truck}
        description="Registra lo que compras a tus proveedores. Las existencias suben automáticamente."
      />
      <Tabs defaultValue="nueva">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:w-80">
          <TabsTrigger value="nueva">Nueva compra</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="nueva">
          <AssistedEntry context="compra" />
          <NuevaCompra />
        </TabsContent>
        <TabsContent value="historial">
          <HistorialCompras />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface Line {
  product: Product;
  qty: string;
  cost: string;
}

function NuevaCompra() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(dateKey(new Date()));
  const [notes, setNotes] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const operation = useRef(crypto.randomUUID());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    const inCart = new Set(lines.map((l) => l.product.id));
    const list = products.filter((p) => !inCart.has(p.id) && (!t || p.name.toLowerCase().includes(t)));
    // Primero los que necesitan reposición
    return list.sort((a, b) => a.quantity - a.min_stock - (b.quantity - b.min_stock)).slice(0, 12);
  }, [products, q, lines]);

  const parsed = lines.map((l) => ({
    ...l,
    qtyN: parseInt(l.qty, 10),
    costN: Number(l.cost.replace(",", ".")),
  }));
  const total = parsed.reduce((a, l) => a + (Number.isFinite(l.qtyN * l.costN) ? l.qtyN * l.costN : 0), 0);
  const suppliers = [...new Set(products.map((p) => p.supplier).filter(Boolean))] as string[];

  function add(p: Product) {
    setLines((ls) => [...ls, { product: p, qty: String(Math.max(1, p.min_stock * 2 - p.quantity)), cost: String(p.purchase_price) }]);
    if (!supplier && p.supplier) setSupplier(p.supplier);
    setQ("");
  }

  function openConfirm() {
    if (!lines.length) return void toast.error("Agrega al menos un producto.");
    const bad = parsed.find((l) => !Number.isInteger(l.qtyN) || l.qtyN <= 0 || !Number.isFinite(l.costN) || l.costN < 0);
    if (bad) return void toast.error(`Revisa la cantidad y el costo de ${bad.product.name}.`);
    if (date > dateKey(new Date())) return void toast.error("La fecha de compra no puede ser futura.");
    setConfirmOpen(true);
  }

  async function confirm() {
    if (saving) return;
    setSaving(true);
    const { error } = await businessApi.ledger("purchases", {
      items: parsed.map((l) => ({ product_id: l.product.id, quantity: l.qtyN, unit_price: l.costN })),
      date, update_cost: updateCost, supplier, notes, key: operation.current,
    });
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success(`Compra registrada por ${money(total)}. Existencias actualizadas.`);
    setLines([]);
    setNotes("");
    operation.current = crypto.randomUUID();
    refresh();
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="Primero registra tus productos"
        description="Las compras se registran sobre productos de tu catálogo."
        action={
          <Button asChild>
            <Link to="/app/productos">Ir a Productos</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
      <SectionCard title="1. Elige los productos" description="Los que necesitan reposición aparecen primero">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="h-11 pl-9" />
        </div>
        <ul className="space-y-2">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button onClick={() => add(p)} className="visual-button flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left hover:border-info hover:bg-info-soft/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                  <p className={cn("text-xs", p.quantity <= p.min_stock ? "font-semibold text-warning-foreground" : "text-muted-foreground")}>
                    Hay {p.quantity} · mínimo {p.min_stock}
                  </p>
                </div>
                <Plus className="size-4 text-info" />
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="2. Cantidades y costos">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="proveedores" placeholder="Ej. Distribuidora Central" />
            <datalist id="proveedores">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Agrega productos desde la lista.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {lines.map((l, idx) => (
              <li key={l.product.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-navy">{l.product.name}</p>
                  <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-1 grid grid-cols-3 items-end gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Cantidad</Label>
                    <Input inputMode="numeric" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Costo unit. ($)</Label>
                    <Input inputMode="decimal" value={l.cost} onChange={(e) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, cost: e.target.value } : x)))} />
                  </div>
                  <p className="tabular pb-2 text-right text-sm font-bold text-navy">{money((parseInt(l.qty, 10) || 0) * (Number(l.cost.replace(",", ".")) || 0))}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 space-y-3">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones (opcional)" />
          <label className="flex items-start gap-2 text-sm text-navy">
            <Checkbox checked={updateCost} onCheckedChange={(v) => setUpdateCost(v === true)} className="mt-0.5" />
            Actualizar el precio de compra de cada producto con este costo
          </label>
          <div className="flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-navy-foreground">
            <span className="text-sm font-semibold">Total de la compra</span>
            <span className="tabular font-display text-2xl font-extrabold">{money(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Las compras de mercadería no se suman a los gastos operativos: su costo se cuenta cuando vendes el producto.
          </p>
          <Button variant="hero" size="lg" className="w-full" disabled={!lines.length || saving} onClick={openConfirm}>
            {saving && <Loader2 className="animate-spin" />}
            Registrar compra
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Registrar compra por ${money(total)}?`}
        description={`Se sumarán al inventario: ${parsed.map((l) => `${l.qtyN} × ${l.product.name}`).join(", ")}.`}
        confirmLabel="Sí, registrar"
        destructive={false}
        onConfirm={confirm}
      />
    </div>
  );
}

function HistorialCompras() {
  const { data: purchases } = useSuspenseQuery(purchasesQuery);
  const [open, setOpen] = useState<string | null>(null);
  if (purchases.length === 0) {
    return <EmptyState icon={Truck} title="Aún no registras compras" description="Cuando compres mercadería a un proveedor, regístrala aquí." />;
  }
  return (
    <SectionCard>
      <ul className="divide-y">
        {purchases.map((p) => (
          <li key={p.id}>
            <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                <Truck className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy">{p.supplier || "Sin proveedor"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.purchase_date)} · {p.purchase_items.length} producto{p.purchase_items.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="tabular text-sm font-bold text-navy">{money(p.total)}</span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === p.id && "rotate-180")} />
            </button>
            {open === p.id && (
              <div className="mb-3 space-y-1 rounded-xl bg-muted p-3 text-sm">
                {p.purchase_items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-2">
                    <span className="text-navy">
                      {i.quantity} × {i.product_name} <span className="text-muted-foreground">({money(i.unit_cost)} c/u)</span>
                    </span>
                    <span className="tabular font-semibold">{money(i.subtotal)}</span>
                  </div>
                ))}
                {p.notes && <p className="pt-1 text-xs text-muted-foreground">{p.notes}</p>}
                <LedgerActions entry={p} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
