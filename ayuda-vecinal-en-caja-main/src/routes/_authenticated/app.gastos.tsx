import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Info, Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog, EmptyState, PageHeader, SectionCard } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { businessApi } from "@/lib/local-client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { dateKey, expensesByCategory } from "@/lib/finance";
import { errorMessage, formatDate, money } from "@/lib/format";
import { expensesQuery, storeQuery, useRefreshBusiness, type Expense } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/gastos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(expensesQuery),
  component: Gastos,
});

const schema = z.object({
  description: z.string().trim().min(1, "Describe el gasto").max(160),
  category: z.enum(EXPENSE_CATEGORIES, { errorMap: () => ({ message: "Elige una categoría" }) }),
  amount: z.coerce.number({ invalid_type_error: "Valor no válido" }).positive("Debe ser mayor a 0").max(1000000),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  notes: z.string().trim().max(500).optional(),
});

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
}

function Gastos() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: expenses } = useSuspenseQuery(expensesQuery);
  const refresh = useRefreshBusiness();
  const thisMonth = dateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const months = useMemo(() => [...new Set([thisMonth, ...expenses.map((e) => e.expense_date.slice(0, 7))])].sort().reverse(), [expenses, thisMonth]);
  const list = expenses.filter((e) => e.expense_date.startsWith(month));
  const total = list.reduce((a, e) => a + Number(e.amount), 0);
  const byCat = expensesByCategory(list, { from: `${month}-01`, to: `${month}-31` });

  async function remove() {
    if (!toDelete) return;
    const { error } = await businessApi.remove("expenses", toDelete.id);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Gasto eliminado.");
    setToDelete(null);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Gastos operativos"
        icon={Wallet}
        description="Lo que cuesta mantener abierta tu tienda: arriendo, servicios, transporte…"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Registrar gasto
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl bg-info-soft p-3 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          La mercadería que compras para vender <strong>no va aquí</strong>: regístrala en Compras. Así su costo no se cuenta dos veces en tus reportes.
        </p>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto py-1">
        {months.map((m) => (
          <Button key={m} size="sm" variant={m === month ? "soft" : "outline"} onClick={() => setMonth(m)} className={m === month ? "shrink-0 border border-info/40 capitalize" : "shrink-0 capitalize"}>
            {monthLabel(m)}
          </Button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Resumen del mes">
          <p className="tabular font-display text-3xl font-extrabold text-navy">{money(total)}</p>
          <p className="text-xs text-muted-foreground">{list.length} registro{list.length === 1 ? "" : "s"}</p>
          <ul className="mt-4 space-y-2">
            {byCat.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-sm">
                  <span className="text-navy">{c.category}</span>
                  <span className="tabular font-semibold">{money(c.total)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-info" style={{ width: `${total ? (c.total / total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Registros">
          {list.length === 0 ? (
            <EmptyState icon={Wallet} title="Sin gastos en este mes" description="Registra el arriendo, la luz, el agua o el transporte para conocer tu resultado real." />
          ) : (
            <ul className="divide-y">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{e.description}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(e.expense_date)}</span>
                      <Badge variant="secondary">{e.category}</Badge>
                    </div>
                    {e.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{e.notes}</p>}
                  </div>
                  <span className="tabular text-sm font-bold text-navy">{money(e.amount)}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Editar gasto"
                    onClick={() => {
                      setEditing(e);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Eliminar gasto" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setToDelete(e)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <ExpenseForm open={formOpen} onOpenChange={setFormOpen} expense={editing} onSaved={refresh} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="¿Eliminar este gasto?"
        description={`"${toDelete?.description}" por ${money(toDelete?.amount)}. Esta acción no se puede deshacer.`}
        onConfirm={remove}
      />
    </div>
  );
}

function ExpenseForm({
  open,
  onOpenChange,
  expense,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense: Expense | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ description: "", category: "", amount: "", expense_date: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      expense
        ? { description: expense.description, category: expense.category, amount: String(expense.amount), expense_date: expense.expense_date, notes: expense.notes ?? "" }
        : { description: "", category: "", amount: "", expense_date: dateKey(new Date()), notes: "" },
    );
  }, [open, expense]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, amount: form.amount.replace(",", ".") });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return void setErrors(errs);
    }
    if (parsed.data.expense_date > dateKey(new Date())) return void setErrors({ expense_date: "La fecha no puede ser futura" });
    const values = { ...parsed.data, notes: parsed.data.notes || null };
    setSaving(true);
    const { error } = await businessApi.save("expenses", values, expense?.id);
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success(expense ? "Gasto actualizado." : "Gasto registrado.");
    onSaved();
    onOpenChange(false);
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy">{expense ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
          <DialogDescription>Solo gastos de funcionamiento, no compras de mercadería.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={form.description} onChange={(e) => set("description")(e.target.value)} placeholder="Ej. Planilla de luz" autoFocus />
            {errors["description"] && <p className="text-xs text-destructive">{errors["description"]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category} onValueChange={set("category")}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors["category"] && <p className="text-xs text-destructive">{errors["category"]}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor ($)</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => set("amount")(e.target.value)} placeholder="0.00" />
              {errors["amount"] && <p className="text-xs text-destructive">{errors["amount"]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.expense_date} max={dateKey(new Date())} onChange={(e) => set("expense_date")(e.target.value)} />
              {errors["expense_date"] && <p className="text-xs text-destructive">{errors["expense_date"]}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones (opcional)</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {expense ? "Guardar cambios" : "Registrar gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
