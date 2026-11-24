import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { dateKey } from "@/lib/finance";
import { commitSchema, inputContextSchema } from "@/lib/vecibot-input";
import { MAX_TOTAL_FILE_BYTES } from "@/lib/vecibot-files";
import { readFormAttachments } from "./vecibot-files.server";
import { vecibotEndpoint } from "./vecibot-http.server";
import { extractInput, type CatalogItem } from "./ai/extract-input.server";
import {
  authenticateInput,
  InputError,
  inputErrorResponse,
  readBoundedBody,
} from "./vecibot-auth.server";

const textSchema = z
  .object({ text: z.string().trim().min(1).max(2000), context: inputContextSchema.default("auto") })
  .strict();

export async function readInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("application/json")) {
    const bytes = await readBoundedBody(request, 12000);
    return textSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  }
  if (!contentType.startsWith("multipart/form-data"))
    throw new InputError(415, "Envía texto, imágenes o documentos PDF.");
  const bytes = await readBoundedBody(request, MAX_TOTAL_FILE_BYTES + 32000);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new InputError(400, "El formulario de archivos no es válido.");
  }
  if ([...form.keys()].some((key) => !["files", "image", "text", "context"].includes(key)))
    throw new InputError(400, "El formulario contiene campos no permitidos.");
  const files = await readFormAttachments(form);
  return {
    text: z
      .string()
      .trim()
      .max(2000)
      .parse(form.get("text") ?? ""),
    context: inputContextSchema.parse(form.get("context") ?? "auto"),
    files,
  };
}

async function loadCatalog(client: SupabaseClient<Database>, storeId: string) {
  const catalog: CatalogItem[] = [];
  for (;;) {
    const { data, error } = await client
      .from("products")
      .select("id,name,sale_price,quantity")
      .eq("store_id", storeId)
      .order("id")
      .range(catalog.length, catalog.length + 499);
    if (error || !data) throw new InputError(500, "No pude leer el catálogo de tu tienda.");
    if (!data.length) return catalog;
    catalog.push(...data);
    if (catalog.length > 5000)
      throw new InputError(
        422,
        "Tu catálogo es muy grande para esta entrada. Usa el formulario de productos.",
      );
  }
}

export function handleVeciBotInput(request: Request): Promise<Response> {
  return vecibotEndpoint(request, () => processVeciBotInput(request));
}

async function processVeciBotInput(request: Request): Promise<Response> {
  try {
    const { client, store } = await authenticateInput(request);
    const input = await readInput(request);
    const catalog = await loadCatalog(client, store.id);
    const draft = await extractInput(request, input, catalog);
    const ids = new Set(catalog.map((p) => p.id));
    // Never trust an ID suggested by a model unless it belongs to this store.
    for (const item of draft.items) {
      if (item.product_id && !ids.has(item.product_id)) {
        item.product_id = null;
        draft.warnings.push(`Elige el producto del catálogo para ${item.name}.`);
      }
    }
    draft.warnings = draft.warnings.slice(0, 15);
    return Response.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Entrada no válida. Revisa el texto o los archivos." },
        { status: 400 },
      );
    return inputErrorResponse(error);
  }
}

export function handleVeciBotAction(request: Request): Promise<Response> {
  return vecibotEndpoint(request, () => processVeciBotAction(request));
}

async function processVeciBotAction(request: Request): Promise<Response> {
  try {
    const { client } = await authenticateInput(request);
    const body = await readBoundedBody(request, 64000);
    const { requestId, action } = commitSchema.parse(JSON.parse(new TextDecoder().decode(body)));
    if (action.intent === "compra" && action.date > dateKey(new Date()))
      throw new InputError(422, "La fecha de compra no puede ser futura.");
    if (action.intent !== "producto") {
      const ids = action.items.map((item) => item.product_id);
      if (new Set(ids).size !== ids.length)
        throw new InputError(422, "Une las cantidades de los productos repetidos.");
    }
    // The invoker RPC checks the receipt BEFORE current product ownership/stock,
    // so a successful retry still works if the product was later deleted.
    // New writes validate every product's store inside the same transaction.
    const { data, error } = await client.rpc("apply_vecibot_action", {
      _request_id: requestId,
      _action: action,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883")
        throw new InputError(503, "Falta aplicar la migración de entradas de VeciBot en Supabase.");
      if (["P0001", "22023", "23514", "23505"].includes(error.code))
        throw new InputError(
          409,
          "No se pudo guardar. Revisa el stock, los productos repetidos y los datos; si ya reintentaste, usa una nueva entrada.",
        );
      throw new InputError(500, "No pude guardar el registro. Puedes reintentar sin duplicarlo.");
    }
    return Response.json({ result: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Completa los datos: productos, cantidades enteras y precios válidos." },
        { status: 400 },
      );
    return inputErrorResponse(error);
  }
}
