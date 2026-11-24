import { z } from "zod";
import { PRODUCT_CATEGORIES } from "./constants";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const inputContextSchema = z.enum(["auto", "venta", "compra", "producto"]);
export type InputContext = z.infer<typeof inputContextSchema>;

const money = z.number().finite().min(0).max(100000);
const quantity = z.number().int().min(0).max(1000000);
const name = z.string().trim().min(1).max(120);
// Nullable fields make missing/illegible values explicit. Never turn them into zero.
export const extractedItemSchema = z.object({
  name,
  product_id: z.string().uuid().nullable(),
  quantity: quantity.nullable(),
  unit_cost: money.nullable(),
  sale_price: money.nullable(),
  category: z.enum(PRODUCT_CATEGORIES).nullable(),
  min_stock: z.number().int().min(0).max(100000).nullable(),
});
export const extractionSchema = z.object({
  intent: z.enum(["consulta", "venta", "compra", "producto"]),
  message: z.string().max(2000),
  date: z.string().max(10).nullable(),
  supplier: z.string().max(120).nullable(),
  items: z.array(extractedItemSchema).max(30),
  warnings: z.array(z.string().max(300)).max(15),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

const line = z.object({ product_id: z.string().uuid(), quantity: quantity.min(1) }).strict();
export const newProductSchema = z
  .object({
    name,
    category: z.enum(PRODUCT_CATEGORIES),
    purchase_price: money,
    sale_price: money,
    quantity,
    min_stock: z.number().int().min(0).max(100000),
    supplier: z.string().trim().max(120).nullable(),
  })
  .strict();

export const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("venta"), items: z.array(line).min(1).max(30) }).strict(),
  z
    .object({
      intent: z.literal("compra"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((v) => {
          const d = new Date(`${v}T12:00:00Z`);
          return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
        }, "Fecha no válida"),
      supplier: z.string().trim().max(120).nullable(),
      items: z
        .array(line.extend({ unit_cost: money }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({ intent: z.literal("producto"), products: z.array(newProductSchema).min(1).max(30) })
    .strict(),
]);
export type InputAction = z.infer<typeof actionSchema>;
export const commitSchema = z
  .object({ requestId: z.string().uuid(), action: actionSchema })
  .strict();

export function actionFromExtraction(draft: Extraction): InputAction {
  if (draft.intent === "producto") {
    return actionSchema.parse({
      intent: "producto",
      products: draft.items.map((item) => ({
        name: item.name,
        category: item.category,
        purchase_price: item.unit_cost,
        sale_price: item.sale_price,
        quantity: item.quantity,
        min_stock: item.min_stock,
        supplier: draft.supplier,
      })),
    });
  }
  return actionSchema.parse({
    intent: draft.intent,
    ...(draft.intent === "compra" ? { date: draft.date, supplier: draft.supplier } : {}),
    items: draft.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      ...(draft.intent === "compra" ? { unit_cost: item.unit_cost } : {}),
    })),
  });
}
