import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { totalPending } from "@/lib/finance";
import { formatDate, money } from "@/lib/format";
import { businessApi } from "@/lib/local-client";
import { salesQuery, useRefreshBusiness, type Sale } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/fiados")({
  loader: ({ context }) => context.queryClient.ensureQueryData(salesQuery),
  component: Fiados,
});

function Fiados() {
  const { data: sales } = useSuspenseQuery(salesQuery);
  const refresh = useRefreshBusiness();
  const [selected, setSelected] = useState<Sale | null>(null);
  const pending = sales.filter((sale) => sale.credit_status === "Pendiente");
  const paid = sales
    .filter((sale) => sale.credit_status === "Pagado")
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));

  async function collect(sale: Sale) {
    const { error } = await businessApi.paid(sale.id);
    if (error) return void toast.error(error.message);
    toast.success(`Cobro de ${money(sale.total)} registrado.`);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Libreta de fiados"
        icon={BookOpen}
        description="Consulta quién te debe y registra los cobros."
        actions={
          <Button asChild>
            <Link to="/app/ventas">Registrar un fiado</Link>
          </Button>
        }
      />
      <StatCard
        label="Total por cobrar"
        value={money(totalPending(pending))}
        hint={`${pending.length} ${pending.length === 1 ? "fiado pendiente" : "fiados pendientes"}`}
        icon={BookOpen}
        tone="amber"
      />
      <SectionCard title="Pendientes de cobro">
        {!pending.length ? (
          <EmptyState
            icon={Check}
            title="Estás al día"
            description="Cuando registres una venta fiada, aparecerá aquí."
          />
        ) : (
          <ul className="divide-y">
            {pending.map((sale) => (
              <DebtRow
                key={sale.id}
                sale={sale}
                action={
                  <Button size="sm" variant="outline" onClick={() => setSelected(sale)}>
                    <Check /> Marcar como Pagado
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>
      {!!paid.length && (
        <SectionCard title="Cobros registrados">
          <ul className="divide-y">
            {paid.map((sale) => (
              <DebtRow key={sale.id} sale={sale} action={<Badge variant="success">Pagado</Badge>} />
            ))}
          </ul>
        </SectionCard>
      )}
      <ConfirmDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={`¿Registrar cobro de ${money(selected?.total ?? 0)}?`}
        description={`El fiado de ${selected?.credit_customer ?? ""} quedará pagado.`}
        confirmLabel="Sí, registrar cobro"
        destructive={false}
        onConfirm={() => {
          if (selected) void collect(selected);
        }}
      />
    </div>
  );
}

function DebtRow({ sale, action }: { sale: Sale; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold text-navy">{sale.credit_customer}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(sale.sale_date)} ·{" "}
          {sale.sale_items.map((item) => `${item.quantity} × ${item.product_name}`).join(", ")}
        </p>
        {sale.paid_at && (
          <p className="text-xs text-muted-foreground">Cobrado el {formatDate(sale.paid_at)}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <strong className="text-navy">{money(sale.total)}</strong>
        {action}
      </div>
    </li>
  );
}
