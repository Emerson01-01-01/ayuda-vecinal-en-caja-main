import type { Extraction } from "./vecibot-input";

export function plainChatText(text: string): string {
  return text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
    .replace(/\|/g, "; ")
    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function requestsPdf(text: string): boolean {
  return /\b(pdf|reporte|informe|resumen|factura)\b/i.test(text);
}

export function spokenChatText(text: string): string {
  return plainChatText(text)
    .replace(/^\s*(?:[-*+>]|\d+[.)])\s+/gm, "")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(value: unknown) {
  return value == null ? "Por revisar" : String(value).replace(/[|\r\n]/g, " ");
}

export function extractionText(draft: Extraction): string {
  return [
    draft.message,
    "",
    "**Datos detectados para revisar**",
    `Proveedor: ${cell(draft.supplier)} · Fecha: ${cell(draft.date)}`,
    "",
    "| Producto | Cantidad | Costo unitario | Precio de venta |",
    "| --- | --- | --- | --- |",
    ...draft.items.map(
      (item) =>
        `| ${cell(item.name)} | ${cell(item.quantity)} | ${cell(item.unit_cost)} | ${cell(item.sale_price)} |`,
    ),
    "",
    ...draft.warnings.map((warning) => `- ${warning}`),
    "",
    "Revisa y confirma los datos en el formulario para guardarlos.",
  ].join("\n");
}
