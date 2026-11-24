import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChartColumnBig, CircleDollarSign, Info, Receipt, TrendingUp, Wallet } from "lucide-react";

import { CategoryPie, TrendLineChart } from "@/components/app/charts";
import { DemoNotice, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import {
  dailySeries,
  expensesByCategory,
  lowMovement,
  productRanking,
  rangeForPeriod,
  summarize,
  type Period,
} from "@/lib/finance";
import { formatDate, money, percent } from "@/lib/format";
import { expensesQuery, productsQuery, salesQuery, storeQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/reportes")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(salesQuery),
      context.queryClient.ensureQueryData(expensesQuery),
    ]),
  component: Reportes,
});

const PERIODS: { k: Period; l: string }[] = [
  { k: "dia", l: "Diario" },
  { k: "semana", l: "Semanal" },
  { k: "mes", l: "Mensual" },
];

function Reportes() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: sales } = useSuspenseQuery(salesQuery);
  const { data: expenses } = useSuspenseQuery(expensesQuery);
  const [period, setPeriod] = useState<Period>("semana");
  const range = rangeForPeriod(period);

  const s = useMemo(() => summarize(sales, expenses, range), [sales, expenses, range.from, range.to]);
  const series = useMemo(() => dailySeries(sales, expenses, period === "dia" ? { from: rangeForPeriod("semana").from, to: range.to } : range), [sales, expenses, period, range.from, range.to]);
  const ranking = useMemo(() => productRanking(sales, range, products), [sales, products, range.from, range.to]);
  const top = ranking.filter((r) => r.qty > 0).slice(0, 6);
  const slow = lowMovement(ranking, products, 6);
  const cats = expensesByCategory(expenses, range);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reportes"
        icon={ChartColumnBig}
        description={`${range.label}: ${formatDate(range.from)}${range.from !== range.to ? ` al ${formatDate(range.to)}` : ""}`}
        actions={PERIODS.map((p) => (
          <Button key={p.k} size="sm" variant={period === p.k ? "soft" : "outline"} className={period === p.k ? "border border-info/40" : undefined} onClick={() => setPeriod(p.k)}>
            {p.l}
          </Button>
        ))}
      />

      {me.store.has_demo_data && <DemoNotice />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Ventas totales" value={money(s.salesTotal)} hint={`${s.transactions} ventas · ticket ${money(s.avgTicket)}`} icon={Receipt} emphasis />
        <StatCard label="Costo de lo vendido" value={money(s.cogs)} hint="Según precio de compra" icon={CircleDollarSign} tone="navy" />
        <StatCard label="Ganancia bruta" value={money(s.grossProfit)} hint={`Margen ${percent(s.grossMarginPct)}`} icon={TrendingUp} />
        <StatCard label="Gastos operativos" value={money(s.operatingExpenses)} hint="Sin compras de mercadería" icon={Wallet} tone="red" />
        <StatCard
          label="Resultado operativo"
          value={money(s.operatingResult)}
          hint={s.operatingResult >= 0 ? "Estimado positivo" : "Estimado negativo"}
          icon={ChartColumnBig}
          tone={s.operatingResult >= 0 ? "green" : "red"}
        />
      </div>

      <SectionCard title="Cómo se calcula">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded-xl bg-muted p-3">
            <strong className="text-navy">Ganancia bruta</strong> = ventas − costo de los productos vendidos
            <br />
            <span className="tabular text-muted-foreground">
              {money(s.salesTotal)} − {money(s.cogs)} = <strong className="text-navy">{money(s.grossProfit)}</strong>
            </span>
          </p>
          <p className="rounded-xl bg-muted p-3">
            <strong className="text-navy">Resultado operativo</strong> = ganancia bruta − gastos operativos
            <br />
            <span className="tabular text-muted-foreground">
              {money(s.grossProfit)} − {money(s.operatingExpenses)} = <strong className="text-navy">{money(s.operatingResult)}</strong>
            </span>
          </p>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          El total vendido no es tu ganancia. Estos valores son estimados: usan el precio de compra registrado al momento de cada venta y no incluyen mermas, productos dañados, impuestos ni ventas que no se registraron en la app.
        </p>
      </SectionCard>

      <SectionCard title="Evolución de las ventas" description={period === "dia" ? "Últimos 7 días para dar contexto al día de hoy" : range.label}>
        {series.some((d) => d.ventas > 0 || d.gastos > 0) ? (
          <TrendLineChart data={series} />
        ) : (
          <EmptyState icon={TrendingUp} title="Sin datos en este periodo" description="Registra ventas para ver su evolución." />
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Productos más vendidos">
          {top.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay ventas en este periodo.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[24rem] text-sm [&_th]:px-3 [&_th]:py-3 [&_td]:px-3 [&_td]:py-3">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 text-right font-medium">Unid.</th>
                  <th className="pb-2 text-right font-medium">Ventas</th>
                  <th className="pb-2 text-right font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {top.map((r, i) => (
                  <tr key={r.name}>
                    <td className="py-2 text-navy">
                      <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-info-soft text-[11px] font-bold text-info">{i + 1}</span>
                      {r.name}
                    </td>
                    <td className="tabular text-right">{r.qty}</td>
                    <td className="tabular text-right">{money(r.revenue)}</td>
                    <td className="tabular text-right font-semibold text-info">{money(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Productos con menor movimiento" description="Incluye los que no se vendieron en el periodo">
          {slow.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin productos registrados.</p>
          ) : (
            <ul className="divide-y">
              {slow.map((r) => {
                const p = products.find((x) => x.id === r.productId);
                return (
                  <li key={r.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-navy">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.qty} vendidos · {p?.quantity ?? 0} en bodega
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Gastos operativos por categoría">
        {cats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay gastos registrados en este periodo.</p>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <CategoryPie data={cats} />
            <ul className="space-y-2 text-sm">
              {cats.map((c) => (
                <li key={c.category} className="flex justify-between rounded-xl bg-muted px-3 py-2">
                  <span className="text-navy">{c.category}</span>
                  <span className="tabular font-semibold">{money(c.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
