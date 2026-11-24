import { z } from "zod";
import { MAX_TOTAL_FILE_BYTES } from "@/lib/vecibot-files";
import { storedMessageContent, type MessageAttachment, type MessageReceipt } from "@/lib/vecibot-messages";
import { authenticateInput, InputError, readBoundedBody } from "./vecibot-auth.server";
import { readFormAttachments, readInlineAttachment, validateAttachments, type Attachment } from "./vecibot-files.server";
import { vecibotEndpoint } from "./vecibot-http.server";
import { AI_UNAVAILABLE_MESSAGE } from "./ai/config.server";

const inputSchema = z.object({ id: z.string().uuid(), text: z.string().trim().max(2000).default("") }).strict();
const inlineFileSchema = z.object({ filename: z.string().max(200).optional(), mediaType: z.string().max(100), url: z.string(), type: z.literal("file").optional() }).strict();

export async function readChatSubmission(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let input: z.infer<typeof inputSchema>;
  let files: Attachment[];
  try {
    if (contentType.startsWith("multipart/form-data")) {
      const bytes = await readBoundedBody(request, MAX_TOTAL_FILE_BYTES + 32768);
      const form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
      if ([...form.keys()].some(key => !["id", "text", "files"].includes(key))) throw new InputError(400, "El envío contiene campos no permitidos.");
      input = inputSchema.parse({ id: form.get("id"), text: form.get("text") || "" });
      files = form.getAll("files").length ? await readFormAttachments(form) : [];
    } else if (contentType.startsWith("application/json")) {
      const bytes = await readBoundedBody(request, Math.ceil(MAX_TOTAL_FILE_BYTES * 4 / 3) + 32768);
      const body = z.object({ id: z.string().uuid(), text: z.string().max(2000).default(""), files: z.array(inlineFileSchema).max(5).default([]) }).strict().parse(JSON.parse(new TextDecoder().decode(bytes)));
      input = inputSchema.parse({ id: body.id, text: body.text });
      files = body.files.map(readInlineAttachment);
    } else throw new InputError(415, "Envía el mensaje como JSON o multipart/form-data.");
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(400, "El mensaje o el formulario de archivos no es válido.");
  }
  validateAttachments(files);
  if (!input.text && !files.length) throw new InputError(400, "Escribe un mensaje o adjunta al menos un archivo.");
  return { ...input, files };
}

export async function attachmentMetadata(files: Attachment[]): Promise<MessageAttachment[]> {
  return Promise.all(files.map(async file => ({
    filename: file.filename, mediaType: file.mediaType, size: file.bytes.length,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(file.bytes)))).map(byte => byte.toString(16).padStart(2, "0")).join(""),
  })));
}

/** Message receipt is independent from AI. Auth and RLS remain mandatory. */
export function handleChatSubmission(request: Request) {
  return vecibotEndpoint(request, async () => {
    const { client, store } = await authenticateInput(request);
    const input = await readChatSubmission(request);
    const attachments = await attachmentMetadata(input.files);
    const content = storedMessageContent(input.text, attachments);
    const { error } = await client.from("chat_messages").insert({ id: input.id, store_id: store.id, role: "user", content });
    if (error?.code === "23505") {
      // Lost responses may be retried. Verify ownership AND identical content before acknowledging.
      const previous = await client.from("chat_messages").select("id,role,content").eq("store_id", store.id).eq("id", input.id).maybeSingle();
      if (previous.error) throw new InputError(500, "No pude comprobar el envío anterior. Reintenta con el mismo mensaje.");
      if (!previous.data || previous.data.role !== "user" || previous.data.content !== content)
        throw new InputError(409, "Este identificador ya corresponde a otro mensaje. Conserva los archivos y vuelve a enviarlo como un mensaje nuevo.");
    } else if (error) {
      throw new InputError(error.code === "42501" ? 403 : 500, error.code === "42501"
        ? "Tu sesión no tiene permiso para guardar mensajes en esta tienda. Vuelve a iniciar sesión."
        : "Supabase no pudo guardar el mensaje. Tu texto y archivos siguen disponibles para reintentar.");
    }
    const receipt: MessageReceipt = {
      id: input.id, text: input.text, attachments, received: true,
      ai: { available: false, message: AI_UNAVAILABLE_MESSAGE },
    };
    return Response.json(receipt);
  });
}
