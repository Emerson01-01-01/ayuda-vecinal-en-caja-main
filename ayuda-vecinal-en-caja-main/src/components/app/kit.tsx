import type { ComponentType, ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { stockStatus } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info sm:inline-flex">
            <Icon className="size-5" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-canvas-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-canvas-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card min-w-0 rounded-2xl border bg-card p-4 shadow-card sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold text-navy">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "green" | "navy" | "amber" | "red" | "blue";
const toneStyles: Record<Tone, string> = {
  green: "bg-info-soft text-info",
  navy: "bg-navy-soft text-navy",
  amber: "bg-warning-soft text-warning-foreground",
  red: "bg-destructive-soft text-destructive",
  blue: "bg-info-soft text-info",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card rounded-2xl border p-4 shadow-card",
        emphasis ? "bg-card text-navy" : "bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-xs font-semibold uppercase tracking-wide", emphasis ? "text-muted-foreground" : "text-muted-foreground")}>
          {label}
        </p>
        <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", emphasis ? "bg-card text-info" : toneStyles[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("tabular mt-2 font-display text-2xl font-extrabold sm:text-[1.7rem]", emphasis ? "" : "text-navy")}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", emphasis ? "text-muted-foreground" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center rounded-2xl border bg-card px-6 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-info-soft text-info">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-3 font-bold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Sí, eliminar",
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-navy">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  const s = stockStatus({ quantity, min_stock: min });
  if (s === "agotado") return <Badge variant="danger">Agotado</Badge>;
  if (s === "bajo") return <Badge variant="warning">Stock bajo</Badge>;
  return <Badge variant="success">Disponible</Badge>;
}

export function DemoNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border border-dashed border-warning/50 bg-warning-soft px-3 py-2 text-xs text-warning-foreground", className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Datos ficticios de demostración.</strong> Tu tienda incluye registros de ejemplo para
        probar la aplicación. Puedes borrarlos en Configuración.
      </p>
    </div>
  );
}

export function LoadingBlock({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-canvas-muted">
      <span className="mr-2 size-4 animate-spin rounded-full border-2 border-info border-t-transparent" />
      {label}
    </div>
  );
}
