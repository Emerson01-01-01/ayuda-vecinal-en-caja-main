import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export class InputError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Always uses the owner's JWT and the publishable key, preserving RLS. */
export async function authenticateInput(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new InputError(503, "Supabase no está configurado en el servidor.");
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.split(".").length !== 3)
    throw new InputError(401, "Inicia sesión para usar VeciBot.");
  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub)
    throw new InputError(401, "Tu sesión expiró. Vuelve a iniciar sesión.");
  const store = await client
    .from("stores")
    .select("id,default_min_stock")
    .eq("owner_id", data.claims.sub)
    .maybeSingle();
  if (store.error) throw new InputError(500, "No pude leer tu tienda.");
  if (!store.data) throw new InputError(404, "No encontramos tu tienda.");
  return { client, store: store.data };
}

/** Bound the actual stream, including requests without Content-Length. */
export async function readBoundedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new InputError(413, "El archivo o mensaje es demasiado grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400, "Envía un mensaje o un archivo.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new InputError(413, "El archivo o mensaje supera el tamaño permitido.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function inputErrorResponse(error: unknown) {
  if (error instanceof InputError)
    return Response.json({ error: error.message }, { status: error.status });
  // Do not log invoice content, images, transcripts or provider request bodies.
  const status = (error as { statusCode?: number })?.statusCode;
  const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
  return Response.json(
    {
      error: timeout
        ? "La IA tardó demasiado en responder. Intenta con menos archivos o vuelve a enviar."
        : status === 429
          ? "VeciBot está ocupado. Espera un momento."
          : status === 402
            ? "Se agotaron los créditos de IA. Revisa la configuración de VeciBot."
            : status === 401 || status === 403
              ? "La clave o el acceso al modelo de IA no está habilitado en el servidor."
              : "No pude comunicarme con el servicio de IA o de datos. Intenta de nuevo.",
    },
    { status: timeout ? 504 : status === 429 ? 429 : status === 402 ? 402 : 502 },
  );
}
