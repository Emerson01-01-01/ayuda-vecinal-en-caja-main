import { APP_TIMEZONE } from "./constants";

const moneyFmt = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 });

export function money(value: number | null | undefined): string {
  return moneyFmt.format(Number(value ?? 0));
}

export function num(value: number | null | undefined): string {
  return numberFmt.format(Number(value ?? 0));
}

export function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${numberFmt.format(value)} %`;
}

export function formatDate(value: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-05:00`)
    : new Date(value);
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "vecino";
}

export function errorMessage(error: unknown): string {
  if (!error) return "Ocurrió un error inesperado.";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Ocurrió un error inesperado.";
}

export function reasonLabel(reason: string): string {
  const map: Record<string, string> = { venta: "Venta", compra: "Compra", ajuste: "Ajuste", inicial: "Stock inicial", stock_inicial: "Stock inicial", edicion: "Edición", anulacion: "Anulación" };
  return map[reason] ?? reason;
}
