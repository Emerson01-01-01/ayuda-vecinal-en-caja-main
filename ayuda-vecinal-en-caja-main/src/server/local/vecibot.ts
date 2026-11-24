import { randomUUID } from "node:crypto";
import { z } from "zod";
import { money } from "../../lib/format";
import {
  promotionCombos,
  productRanking,
  rangeForPeriod,
  stockStatus,
  summarize,
  totalPending,
} from "../../lib/finance";
import { parseVeciBot, type Consultation } from "../../lib/vecibotParser.js";
import type { Expense, Sale } from "../../lib/queries";
import { chatMessages, clearChat, expenses, products, saveExchange } from "./business.ts";
import { sales } from "./ledger.ts";
import { LocalError } from "./db.ts";

const requestSchema = z.object({
  text: z.string().trim().max(2000),
  client_id: z.string().uuid().optional(),
  attachment_text: z.string().max(16000).optional(),
  attachment_name: z.string().trim().max(250).optional(),
  manual_invoice: z.boolean().optional(),
});

export function localVecibot(user: string, method: string, body?: unknown) {
  if (method === "GET") return chatMessages(user);
  if (method === "DELETE") {
    clearChat(user);
    return null;
  }
  if (method !== "POST") throw new LocalError("Método no permitido.", 405);
  const input = requestSchema.parse(body);
  if (!input.text && !input.attachment_text && !input.manual_invoice)
    throw new LocalError("Escribe un mensaje o adjunta una factura.");
  const text = input.text || "Registrar compra";
  const catalog = products(user);
  const parsed = parseVeciBot(text, catalog, input.attachment_text);
  const draft = input.manual_invoice && parsed.intent === "CONSULTA_NEGOCIO"
    ? parseVeciBot(`Registrar compra\n${text}`, catalog)
    : parsed;
  const answer =
    draft.intent === "CONSULTA_NEGOCIO"
      ? answerQuery(user, draft, catalog)
      : draft.items.length
        ? "Revisa los productos, las cantidades y los precios antes de guardar."
        : "Completa los datos en la tarjeta y confirma cuando estén listos.";
  const message = [input.text, input.attachment_name ? `Adjunto: ${input.attachment_name}` : ""]
    .filter(Boolean)
    .join("\n");
  const id = input.client_id ?? randomUUID();
  saveExchange(user, id, message || text, answer);
  return { id, answer, draft: draft.intent === "CONSULTA_NEGOCIO" ? null : draft };
}

function answerQuery(user: string, question: Consultation, catalog: ReturnType<typeof products>) {
  if (question.query === "help")
    return "Puedes decir «Vendí dos leches», «Vendí tres panes fiado a Doña Rosa», «Compré una cubeta de huevos a $3,50» o preguntar por ventas, ganancias, fiados, stock y combos.";
  if (question.query === "stock") {
    const low = catalog
      .filter((p) => stockStatus(p) !== "ok")
      .sort((a, b) => a.quantity - b.quantity);
    return low.length
      ? `Estos productos necesitan reposición:\n${low
          .slice(0, 10)
          .map((p) => `• ${p.name}: ${p.quantity} ${p.unit} (mínimo ${p.min_stock})`)
          .join("\n")}`
      : "Todos tus productos están por encima de su mínimo.";
  }
  const receipts = sales(user) as unknown as Sale[];
  if (question.query === "debts")
    return `Tienes ${money(totalPending(receipts))} pendientes de cobro en la Libreta de fiados.`;
  if (question.query === "combos") {
    const combos = promotionCombos(catalog, receipts);
    return combos.length
      ? combos
          .map((combo) => `• ${combo.high.name} + ${combo.low.name} por ${money(combo.price)}`)
          .join("\n")
      : "Aún faltan ventas o productos con stock para calcular combos.";
  }
  const range = rangeForPeriod(question.period);
  if (question.query === "top") {
    const top = productRanking(receipts, range, catalog)
      .filter((p) => p.qty > 0)
      .slice(0, 5);
    return top.length
      ? `${range.label}, los más vendidos fueron:\n${top.map((p) => `• ${p.name}: ${p.qty}`).join("\n")}`
      : "Aún no tienes ventas registradas en ese periodo.";
  }
  const result = summarize(receipts, expenses(user) as unknown as Expense[], range);
  return question.query === "sales"
    ? `${range.label}: ${money(result.salesTotal)} en ${result.transactions} ventas registradas, incluidos los fiados.`
    : `${range.label}: ${money(result.operatingResult)} de ganancia operativa estimada (${money(result.salesTotal)} en ventas, ${money(result.cogs)} de costo y ${money(result.operatingExpenses)} en gastos).`;
}
