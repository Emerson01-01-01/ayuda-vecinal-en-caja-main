import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bot, Boxes, ClipboardList, Flame, Lightbulb, Percent, Snail, Wallet } from "lucide-react";

import { DemoNotice, EmptyState, PageHeader } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateRecommendations, type RecommendationKind } from "@/lib/finance";
import { expensesQuery, productsQuery, salesQuery, storeQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/recomendaciones")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(salesQuery),
      context.queryClient.ensureQueryData(expensesQuery),
    ]),
  component: Recomendaciones,
});

const ICONS: Record<RecommendationKind, typeof Boxes> = {
  reposicion: Boxes,
  "mas-vendidos": Flame,
  "poca-rotacion": Snail,
  "margen-bajo": Percent,
  gastos: Wallet,
  compras: ClipboardList,
};

function Recomendaciones() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: sales } = useSuspenseQuery(salesQuery);
  const { data: expenses } = useSuspenseQuery(expensesQuery);
  const recs = useMemo(() => generateRecommendations({ products, sales, expenses }), [products, sales, expenses]);

  return (
    <div>
      <PageHeader
        title="Recomendaciones"
        icon={Lightbulb}
        description="Sugerencias calculadas con los registros de tu tienda. Cada una explica de dónde sale."
        actions={
          <Button asChild variant="navy">
            <Link to="/app/vecibot">
              <Bot /> Conversar con VeciBot
            </Link>
          </Button>
        }
      />
      {me.store.has_demo_data && <DemoNotice className="mb-4" />}
      {recs.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Aún no hay suficientes datos"
          description="Registra productos, ventas y gastos durante unos días y aquí aparecerán recomendaciones para tu negocio."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {recs.map((r) => {
            const Icon = ICONS[r.kind];
            return (
              <li key={r.id} className="surface-card flex flex-col rounded-2xl border bg-card p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-navy">{r.title}</h2>
                      <Badge variant={r.priority === "alta" ? "danger" : r.priority === "media" ? "warning" : "info"}>Prioridad {r.priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy">¿Por qué?</p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.why}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-navy">Datos que la respaldan</p>
                  <ul className="mt-1 space-y-1">
                    {r.evidence.map((e) => (
                      <li key={e} className="text-xs text-navy">
                        • {e}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
