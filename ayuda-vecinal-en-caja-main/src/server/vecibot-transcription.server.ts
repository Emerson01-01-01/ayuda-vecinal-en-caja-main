import { MAX_AUDIO_BYTES } from "@/lib/vecibot-audio";
import { AI_UNAVAILABLE_MESSAGE } from "./ai/config.server";
import { authenticateInput, InputError, readBoundedBody } from "./vecibot-auth.server";
import { vecibotEndpoint } from "./vecibot-http.server";

export async function readAudio(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data"))
    throw new InputError(415, "Envía una grabación de audio como multipart/form-data.");
  const bytes = await readBoundedBody(request, MAX_AUDIO_BYTES + 16000);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new InputError(400, "El formulario de audio no es válido.");
  }
  if ([...form.keys()].some((key) => key !== "audio") || form.getAll("audio").length !== 1)
    throw new InputError(400, "Envía una sola grabación en el campo audio.");
  const file = form.get("audio");
  if (!file || typeof file === "string" || !file.size)
    throw new InputError(400, "La grabación está vacía. Vuelve a dictar.");
  if (file.size > MAX_AUDIO_BYTES)
    throw new InputError(413, "La grabación supera los 8 MB. Dicta un mensaje más corto.");
  const data = new Uint8Array(await file.arrayBuffer());
  const declared = file.type.split(";")[0]?.toLowerCase();
  const prefix = new TextDecoder("ascii").decode(data.slice(0, 12));
  let mediaType = "";
  let extension = "";
  if (
    [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => data[index] === value) &&
    ["audio/webm", "video/webm"].includes(declared || "")
  ) {
    mediaType = "audio/webm";
    extension = "webm";
  } else if (
    prefix.startsWith("RIFF") &&
    prefix.slice(8, 12) === "WAVE" &&
    ["audio/wav", "audio/wave", "audio/x-wav"].includes(declared || "")
  ) {
    mediaType = "audio/wav";
    extension = "wav";
  } else if (
    prefix.startsWith("OggS") &&
    ["audio/ogg", "application/ogg"].includes(declared || "")
  ) {
    mediaType = "audio/ogg";
    extension = "ogg";
  } else if (
    prefix.slice(4, 8) === "ftyp" &&
    ["audio/mp4", "video/mp4", "audio/x-m4a"].includes(declared || "")
  ) {
    mediaType = "audio/mp4";
    extension = "mp4";
  }
  if (!mediaType)
    throw new InputError(415, "La grabación debe contener audio WebM, MP4, Ogg o WAV válido.");
  return { data, mediaType, filename: `dictado.${extension}` };
}

export function handleVeciBotTranscription(request: Request) {
  return vecibotEndpoint(request, async () => {
    await authenticateInput(request);
    await readAudio(request);
    throw new InputError(503, AI_UNAVAILABLE_MESSAGE);
  });
}
