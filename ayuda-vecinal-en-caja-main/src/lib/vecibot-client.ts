import type { FileUIPart, UIMessage } from "ai";
import { attachmentMediaType, validateFiles } from "./vecibot-files";
import { messageReceiptSchema } from "./vecibot-messages";

export async function sendChatSubmission(id: string, text: string, files: File[], token: string, signal?: AbortSignal) {
  const validation = validateFiles(files);
  if (validation) throw new Error(validation);
  if (!token) throw new Error("Tu sesión no está disponible. Vuelve a iniciar sesión para enviar el mensaje.");
  const body = new FormData();
  body.set("id", id); body.set("text", text);
  for (const file of files) body.append("files", file, file.name);
  const controller = new AbortController();
  const cancelled = () => controller.abort();
  signal?.addEventListener("abort", cancelled, { once: true });
  if (signal?.aborted) cancelled();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const response = await vecibotFetch("/api/vecibot-mensajes", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body, signal: controller.signal,
    });
    const parsed = messageReceiptSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.id !== id) throw new Error("El servidor no confirmó este mensaje. Reintenta; se conservará el mismo identificador para evitar duplicados.");
    return parsed.data;
  } catch (error) {
    if (timedOut) throw new Error("El servidor no confirmó el mensaje en 20 segundos. Se conservan el texto y los archivos; puedes reintentar sin duplicarlo.");
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancelled); }
}

export function vecibotErrorMessage(error: unknown): string {
  if (error instanceof TypeError)
    return "No se pudo llegar al servidor. Revisa tu conexión y que la app esté abierta desde su dirección de servidor.";
  let message = error instanceof Error ? error.message : "VeciBot no pudo responder.";
  try {
    const body = JSON.parse(message);
    if (typeof body.error === "string") message = body.error;
  } catch {
    /* Plain text or stream error. */
  }
  return message;
}

/** Preserve HTTP errors even when a proxy returns HTML instead of JSON. */
export async function vecibotFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error(vecibotErrorMessage(error));
  }
  if (!response.ok) {
    let message =
      response.status === 413
        ? "Los archivos superan el límite del servidor. Envía menos archivos o reduce su tamaño."
        : response.status === 401
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : response.status === 404
            ? "No se encontró el endpoint de VeciBot. Ejecuta el servidor completo de la aplicación."
            : response.status === 504
              ? "El servidor tardó demasiado. Prueba con menos archivos."
              : `El servidor no pudo procesar la solicitud (${response.status}). Intenta de nuevo.`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
    } catch {
      /* Proxy or non-JSON error. */
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (response.headers.get("content-type")?.includes("text/html"))
    throw new Error(
      "El servidor devolvió una página en lugar de la API de VeciBot. Ejecuta el servidor completo y revisa la ruta /api.",
    );
  return response;
}

export function filesToParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<FileUIPart>((resolve, reject) => {
          const reader = new FileReader();
          const mediaType = attachmentMediaType(file);
          reader.onload = () =>
            resolve({
              type: "file",
              filename: file.name,
              mediaType,
              url: String(reader.result).replace(/^data:[^;]*;/, `data:${mediaType};`),
            });
          reader.onerror = () =>
            reject(new Error(`No pude leer ${file.name}. Vuelve a seleccionarlo.`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

/** Don't upload old documents again or include reasoning/tool payloads. */
export function chatRequestMessages(messages: UIMessage[]) {
  return messages.slice(-20).map((message, index, current) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.filter(
      (part) =>
        part.type === "text" ||
        (part.type === "file" && message.role === "user" && index === current.length - 1),
    ),
  }));
}
