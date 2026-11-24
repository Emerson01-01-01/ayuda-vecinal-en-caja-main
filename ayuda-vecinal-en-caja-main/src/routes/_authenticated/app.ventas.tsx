import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, History, Loader2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, PageHeader, SectionCard } from "@/components/app/kit";
import { LedgerActions } from "@/components/app/LedgerActions";
import { AssistedEntry } from "@/components/app/AssistedEntry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessApi } from "@/lib/local-client";
import { addDays, dateKey, inRange, validateCart } from "@/lib/finance";
import { errorMessage, formatDate, formatTime, money } from "@/lib/format";
import { productsQuery, salesQuery, useRefreshBusiness, type Product } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/ventas")({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(productsQuery), context.queryClient.ensureQueryData(salesQuery)]),
  component: Ventas,
});

function Ventas() {
  return (
    <div>
      <PageHeader title="Ventas" icon={ShoppingCart} description="Registra cada venta y el inventario se actualiza automáticamente." />
      <Tabs defaultValue="nueva">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:w-80">
          <TabsTrigger value="nueva">Nueva venta</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="nueva">
          <AssistedEntry context="venta" />
          <NuevaVenta />
        </TabsContent>
        <TabsContent value="historial">
          <Historial />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NuevaVenta() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);
  const operation = useRef(crypto.randomUUID());
  const [fiado, setFiado] = useState(false);
  const [customer, setCustomer] = useState("");

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => !t || p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t)).slice(0, 40);
  }, [products, q]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId.get(id)!, qty }))
    .filter((l) => l.product);
  const total = lines.reduce((a, l) => a + l.qty * l.product.sale_price, 0);
  const units = lines.reduce((a, l) => a + l.qty, 0);

  function setQty(p: Product, qty: number) {
    if (qty > p.quantity) {
      toast.error(`Solo hay ${p.quantity} unidades de ${p.name}.`);
      qty = p.quantity;
    }
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[p.id];
      else next[p.id] = qty;
      return next;
    });
  }

  function add(p: Product) {
    if (p.quantity <= 0) return void toast.error(`${p.name} está agotado. Regístralo en Compras cuando llegue.`);
    setQty(p, (cart[p.id] ?? 0) + 1);
  }

  function openConfirm() {
    if (fiado && !customer.trim()) return void toast.error("Escribe el nombre del cliente.");
    const errs = validateCart(lines.map((l) => ({ productId: l.product.id, quantity: l.qty })), products);
    if (errs.length) return void toast.error(errs[0]);
    setConfirmOpen(true);
  }

  async function confirm() {
    if (saving) return;
    setSaving(true);
    const { error } = await businessApi.ledger("sales", {
      items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty, unit_price: l.product.sale_price })),
      customer: fiado ? customer : "", key: operation.current,
    });
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success(`Venta registrada por ${money(total)}. Inventario actualizado.`);
    setCart({});
    setQ("");
    setFiado(false);
    setCustomer("");
    operation.current = crypto.randomUUID();
    refresh();
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Primero registra tus productos"
        description="Para vender necesitas tener productos en tu catálogo."
        action={
          <Button asChild>
            <Link to="/app/productos">Ir a Productos</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <SectionCard title="1. Busca y toca un producto">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. leche, arroz, cola…" className="h-11 pl-9" autoFocus />
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {found.map((p) => {
            const inCart = cart[p.id] ?? 0;
            const out = p.quantity <= 0;
            return (
              <li key={p.id} className="min-w-0">
                <button
                  onClick={() => add(p)}
                  disabled={out}
                  className={cn(
                    "visual-button flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left",
                    out ? "cursor-not-allowed opacity-50" : "hover:border-info hover:bg-info-soft/50",
                    inCart > 0 && "border-info bg-info-soft/60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{out ? "Agotado" : `${p.quantity - inCart} disponibles`}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-bold text-navy">{money(p.sale_price)}</p>
                    {inCart > 0 && <p className="text-xs font-semibold text-info">× {inCart}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {found.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay productos con ese nombre.</p>}
      </SectionCard>

      <div ref={cartRef} className="lg:sticky lg:top-8 lg:self-start">
        <SectionCard title="2. Revisa la venta" description={units ? `${units} unidad${units === 1 ? "" : "es"}` : "El carrito está vacío"}>
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Toca productos de la lista para agregarlos.</p>
          ) : (
            <ul className="divide-y">
              {lines.map(({ product: p, qty }) => (
                <li key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {money(p.sale_price)} c/u · máx. {p.quantity}
                      </p>
                    </div>
                    <p className="tabular text-sm font-bold text-navy">{money(qty * p.sale_price)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="icon-sm" variant="outline" aria-label="Quitar uno" onClick={() => setQty(p, qty - 1)}>
                      <Minus />
                    </Button>
                    <Input
                      inputMode="numeric"
                      value={qty}
                      onChange={(e) => setQty(p, Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
                      className="h-8 w-16 text-center"
                      aria-label={`Cantidad de ${p.name}`}
                    />
                    <Button size="icon-sm" variant="outline" aria-label="Agregar uno" onClick={() => setQty(p, qty + 1)} disabled={qty >= p.quantity}>
                      <Plus />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive-soft hover:text-destructive" aria-label="Quitar producto" onClick={() => setQty(p, 0)}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-navy-foreground">
            <span className="text-sm font-semibold">Total</span>
            <span className="tabular font-display text-2xl font-extrabold">{money(total)}</span>
          </div>
          <label className="mt-3 block text-sm font-semibold">
            Forma de pago
            <select className="mt-1 block h-10 w-full rounded-md border bg-card px-2 font-normal" value={fiado ? "Fiado" : "Pagado"}
              onChange={(event) => setFiado(event.target.value === "Fiado")}>
              <option>Pagado</option><option>Fiado</option>
            </select>
          </label>
          {fiado && <label className="mt-2 block text-sm font-semibold">Cliente del fiado
            <Input className="mt-1" value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={120} />
          </label>}
          <Button variant="hero" size="lg" className="mt-3 w-full" disabled={!lines.length || saving} onClick={openConfirm}>
            {saving && <Loader2 className="animate-spin" />}
            Confirmar venta
          </Button>
        </SectionCard>
      </div>

      {lines.length > 0 && (
        <button
          onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-2xl bg-navy px-4 py-3 text-navy-foreground shadow-float lg:hidden"
        >
          <span className="text-sm font-semibold">
            {units} en carrito · Ver venta
          </span>
          <span className="tabular font-display text-lg font-extrabold">{money(total)}</span>
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Confirmar venta por ${money(total)}?`}
        description={`Se registrarán ${units} unidades y se descontarán del inventario: ${lines.map((l) => `${l.qty} × ${l.product.name}`).join(", ")}.`}
        confirmLabel="Sí, registrar venta"
        destructive={false}
        onConfirm={confirm}
      />
    </div>
  );
}

function Historial() {
  const { data: sales } = useSuspenseQuery(salesQuery);
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const today = dateKey(new Date());
  const range = { from: Number.isFinite(days) ? addDays(today, -(days - 1)) : "0000-01-01", to: today };

  const groups = useMemo(() => {
    const map = new Map<string, typeof sales>();
    for (const s of sales) {
      const k = dateKey(s.sale_date);
      if (!inRange(k, range)) continue;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, days, today]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { d: 1, l: "Hoy" },
          { d: 7, l: "7 días" },
          { d: 30, l: "30 días" },
          { d: Infinity, l: "Todas" },
        ].map((o) => (
          <Button key={o.d} size="sm" variant={days === o.d ? "soft" : "outline"} className={days === o.d ? "border border-info/40" : undefined} onClick={() => setDays(o.d)}>
            {o.l}
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={History} title="No hay ventas en este periodo" description="Las ventas que registres aparecerán aquí con su fecha y detalle." />
      ) : (
        groups.map(([day, list]) => {
          const tot = list.reduce((a, s) => a + Number(s.total), 0);
          return (
            <SectionCard key={day} title={formatDate(day, { weekday: "long", day: "numeric", month: "long", year: undefined })} action={<span className="tabular text-sm font-bold text-info">{money(tot)}</span>}>
              <ul className="divide-y">
                {list.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} className="visual-button flex w-full items-center gap-3 py-2.5 text-left">
                      <span className="tabular w-12 text-xs font-semibold text-muted-foreground">{formatTime(s.sale_date)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-navy">
                        {s.sale_items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                      </span>
                      <span className="tabular text-sm font-bold text-navy">{money(s.total)}</span>
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === s.id && "rotate-180")} />
                    </button>
                    {open === s.id && (
                      <div className="mb-3 overflow-x-auto rounded-xl bg-muted p-3 text-sm">
                        {s.payment_type === "Fiado" && <p className="mb-2 text-xs text-muted-foreground">Fiado a {s.credit_customer} · {s.credit_status}</p>}
                        <table className="w-full min-w-[22rem] [&_th]:pb-2 [&_td]:pr-2">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                              <th className="font-medium">Producto</th>
                              <th className="text-right font-medium">Cant.</th>
                              <th className="text-right font-medium">Precio</th>
                              <th className="text-right font-medium">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.sale_items.map((i) => (
                              <tr key={i.id}>
                                <td className="py-0.5 text-navy">{i.product_name}</td>
                                <td className="tabular text-right">{i.quantity}</td>
                                <td className="tabular text-right">{money(i.unit_price)}</td>
                                <td className="tabular text-right font-semibold">{money(i.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Costo de lo vendido: {money(s.total_cost)} · Ganancia bruta: {money(Number(s.total) - Number(s.total_cost))}
                        </p>
                        <LedgerActions entry={s} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
