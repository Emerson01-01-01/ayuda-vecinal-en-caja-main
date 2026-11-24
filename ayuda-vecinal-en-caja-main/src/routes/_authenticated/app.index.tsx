import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Bot,
  Gift,
  CircleDollarSign,
  FlaskConical,
  Loader2,
  Package,
  PackageX,
  ShoppingCart,
  Sliders,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { SalesBarChart } from "@/components/app/charts";
import { DemoNotice, EmptyState, SectionCard, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { businessApi } from "@/lib/local-client";
import { addDays, dailySeries, dateKey, productRanking, promotionCombos, rangeForPeriod, stockStatus, summarize, totalPending, unitMargin } from "@/lib/finance";
import { errorMessage, firstName, formatDate, formatDateTime, money, reasonLabel } from "@/lib/format";
import {
  expensesQuery,
  movementsQuery,
  productsQuery,
  salesQuery,
  storeQuery,
  useRefreshBusiness,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(productsQuery),
      queryClient.ensureQueryData(salesQuery),
      queryClient.ensureQueryData(expensesQuery),
      queryClient.ensureQueryData(movementsQuery),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: sales } = useSuspenseQuery(salesQuery);
  const { data: expenses } = useSuspenseQuery(expensesQuery);
  const { data: movements } = useSuspenseQuery(movementsQuery);
  const refresh = useRefreshBusiness();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const today = dateKey(new Date());
  const todaySum = useMemo(() => summarize(sales, expenses, { from: today, to: today }), [sales, expenses, today]);
  const week = useMemo(() => dailySeries(sales, expenses, { from: addDays(today, -6), to: today }), [sales, expenses, today]);
  const weekTotal = week.reduce((a, d) => a + d.ventas, 0);

  const outOfStock = products.filter((p) => stockStatus(p) === "agotado");
  const lowStock = products.filter((p) => stockStatus(p) === "bajo");
  const belowCost = products.filter((p) => unitMargin(p).belowCost);
  const month = rangeForPeriod("mes");
  const estimated = summarize(sales, expenses, month).operatingResult;
  const ranking = productRanking(sales, month, products).filter((item) => item.qty > 0).slice(0, 5);
  const combos = promotionCombos(products, sales);

  async function loadDemo() {
    setLoadingDemo(true);
    const { error } = await businessApi.save("demo", {});
    setLoadingDemo(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Listo: cargamos datos ficticios de demostración en tu tienda.");
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="surface-card rounded-3xl border bg-card p-5 text-navy shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: undefined })}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          ¡Hola, {firstName(me.profile.owner_name)}!
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Bienvenido a AyúdateVeci. Revisemos cómo va <strong>{me.store.name}</strong> hoy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="hero" size="sm">
            <Link to="/app/ventas">
              <ShoppingCart /> Nueva venta
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/gastos">
              <Wallet /> Registrar gasto
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/compras">
              <Truck /> Registrar compra
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/vecibot">
              <Bot /> Preguntar a VeciBot
            </Link>
          </Button>
        </div>
      </div>

      {me.store.has_demo_data && <DemoNotice />}

      {products.length === 0 && (
        <SectionCard>
          <EmptyState
            icon={Package}
            title="Tu tienda todavía no tiene productos"
            description="Empieza registrando lo que vendes. Si solo quieres probar la aplicación, carga datos ficticios de demostración."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link to="/app/productos">
                    <Package /> Agregar productos
                  </Link>
                </Button>
                <Button variant="outline" onClick={loadDemo} disabled={loadingDemo}>
                  {loadingDemo ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                  Cargar datos de demostración
                </Button>
              </div>
            }
          />
        </SectionCard>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ventas del día" value={money(todaySum.salesTotal)} hint={`${todaySum.transactions} venta${todaySum.transactions === 1 ? "" : "s"}`} icon={CircleDollarSign} emphasis />
        <StatCard
          label="Ganancia del mes"
          value={money(estimated)}
          hint="Ventas − costo − gastos operativos"
          icon={TrendingUp}
          tone={estimated >= 0 ? "green" : "red"}
        />
        <Link to="/app/fiados" className="rounded-2xl focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard label="Total por cobrar" value={money(totalPending(sales))} hint="Abrir libreta de fiados" icon={BookOpen} tone="navy" />
        </Link>
        <StatCard
          label="Stock bajo"
          value={lowStock.length + outOfStock.length}
          hint={`${outOfStock.length} agotado${outOfStock.length === 1 ? "" : "s"}`}
          icon={AlertTriangle}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Ventas de los últimos 7 días"
          description={`Total: ${money(weekTotal)} · barras verdes = ventas, azules = ganancia bruta`}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/reportes">Ver reportes</Link>
            </Button>
          }
        >
          {weekTotal > 0 ? (
            <SalesBarChart data={week} />
          ) : (
            <EmptyState icon={TrendingUp} title="Aún no hay ventas esta semana" description="Cuando registres ventas, aquí verás cómo evolucionan día a día." />
          )}
        </SectionCard>

        <SectionCard title="Alertas importantes">
          <ul className="space-y-2">
            {outOfStock.length === 0 && lowStock.length === 0 && belowCost.length === 0 && (
              <li className="rounded-xl bg-success-soft p-3 text-sm text-accent-foreground">
                Todo en orden. No hay alertas por ahora.
              </li>
            )}
            {outOfStock.slice(0, 3).map((p) => (
              <Alert key={p.id} icon={PackageX} tone="red" title={`${p.name} está agotado`} text="Repón pronto para no perder ventas." />
            ))}
            {lowStock.slice(0, 3).map((p) => (
              <Alert key={p.id} icon={AlertTriangle} tone="amber" title={`${p.name}: quedan ${p.quantity}`} text={`Tu mínimo es ${p.min_stock} unidades.`} />
            ))}
            {belowCost.slice(0, 2).map((p) => (
              <Alert key={p.id} icon={CircleDollarSign} tone="red" title={`${p.name} se vende bajo el costo`} text={`Compra ${money(p.purchase_price)} · venta ${money(p.sale_price)}`} />
            ))}
          </ul>
          {(outOfStock.length + lowStock.length > 0) && (
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link to="/app/inventario">Ver inventario completo</Link>
            </Button>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Productos más vendidos" description="Unidades vendidas en el mes">
          {ranking.length ? <ul className="space-y-3" aria-label="Gráfico de productos más vendidos">
            {ranking.map((item) => <li key={item.productId ?? item.name}>
              <div className="mb-1 flex justify-between gap-3 text-sm font-semibold text-navy">
                <span>{item.name}</span><span className="tabular">{item.qty}</span>
              </div>
              <div className="h-2 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-info" style={{ width: `${100 * item.qty / (ranking[0]?.qty ?? 1)}%` }} />
              </div>
            </li>)}
          </ul> : <p className="py-4 text-sm text-muted-foreground">Las ventas de este mes aparecerán aquí.</p>}
        </SectionCard>
        <SectionCard title="Sugerencias de promoción" description="Combos según la rotación de los últimos 30 días y las existencias actuales.">
          {combos.length ? <ul className="space-y-2">
            {combos.map((combo) => <li key={combo.high.id} className="flex items-center gap-3 rounded-xl bg-muted p-3">
              <Gift className="size-5 shrink-0 text-info" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{combo.high.name} + {combo.low.name}</p>
                <p className="text-xs text-muted-foreground">Precio por separado {money(combo.regular)}</p>
              </div>
              <strong className="tabular text-sm text-success">{money(combo.price)}</strong>
            </li>)}
          </ul> : <p className="py-4 text-sm text-muted-foreground">Cuando haya ventas y productos con stock suficiente, verás combos aquí.</p>}
        </SectionCard>
      </div>

      <SectionCard
        title="Movimientos recientes"
        description="Entradas y salidas de mercadería"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/inventario">Ver todo</Link>
          </Button>
        }
      >
        {movements.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>
        ) : (
          <ul className="divide-y">
            {movements.slice(0, 8).map((m) => {
              const isIn = m.movement_type === "entrada" || (m.movement_type === "ajuste" && m.quantity > 0);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${m.movement_type === "ajuste" ? "bg-info-soft text-info" : isIn ? "bg-info-soft text-info" : "bg-navy-soft text-navy"}`}>
                    {m.movement_type === "ajuste" ? <Sliders className="size-4" /> : isIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{m.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {reasonLabel(m.reason)} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  <span className={`tabular text-sm font-bold ${isIn ? "text-info" : "text-navy"}`}>
                    {isIn ? "+" : "−"}
                    {Math.abs(m.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Alert({
  icon: Icon,
  tone,
  title,
  text,
}: {
  icon: typeof AlertTriangle;
  tone: "red" | "amber";
  title: string;
  text: string;
}) {
  return (
    <li className={`flex items-start gap-3 rounded-xl p-3 ${tone === "red" ? "bg-destructive-soft" : "bg-warning-soft"}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "red" ? "text-destructive" : "text-warning-foreground"}`} />
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}
