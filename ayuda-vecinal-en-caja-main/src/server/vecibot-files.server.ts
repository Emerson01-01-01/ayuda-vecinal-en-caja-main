import { attachmentMediaType, ATTACHMENT_TYPES, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_FILE_BYTES } from "@/lib/vecibot-files";
import { unzipSync } from "fflate";
import { InputError } from "./vecibot-auth.server";

export interface Attachment {
  bytes: Uint8Array;
  mediaType: string;
  filename: string;
}

export function validateAttachment(
  bytes: Uint8Array,
  declaredType: string,
  name: string,
): Attachment {
  if (!bytes.length) throw new InputError(400, "El archivo está vacío.");
  if (bytes.length > MAX_FILE_BYTES)
    throw new InputError(413, "Cada archivo debe pesar como máximo 5 MB.");
  let mediaType = "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mediaType = "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value))
    mediaType = "image/png";
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 12));
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") mediaType = "image/webp";
  if (prefix.startsWith("%PDF-")) mediaType = "application/pdf";
  const canonical = declaredType === "audio/mp3" ? "audio/mpeg" : declaredType === "audio/x-wav" ? "audio/wav" : declaredType === "audio/x-m4a" ? "audio/mp4" : declaredType === "text/rtf" ? "application/rtf" : declaredType;
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WAVE") mediaType = "audio/wav";
  if (prefix.startsWith("OggS")) mediaType = "audio/ogg";
  if (prefix.startsWith("ID3") || bytes[0] === 0xff && ((bytes[1] || 0) & 0xe0) === 0xe0 && canonical === "audio/mpeg") mediaType = "audio/mpeg";
  if ([0x1a, 0x45, 0xdf, 0xa3].every((n, i) => bytes[i] === n) && ["audio/webm", "video/webm"].includes(canonical)) mediaType = canonical;
  if (prefix.slice(4, 8) === "ftyp" && ["audio/mp4", "video/mp4", "video/quicktime"].includes(canonical)) mediaType = canonical;
  if (prefix.startsWith("{\\rtf")) mediaType = "application/rtf";
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((n, i) => bytes[i] === n)) mediaType = "application/msword";
  if (canonical === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && prefix.startsWith("PK")) {
    try {
      const entries = unzipSync(bytes, { filter: entry => entry.name === "word/document.xml" && entry.originalSize <= 2 * 1024 * 1024 });
      if (entries["word/document.xml"]) mediaType = canonical;
    } catch { /* Invalid ZIP is rejected below. */ }
  }
  if (!mediaType && ["text/plain", "text/csv", "text/markdown", "application/json"].includes(canonical)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!text.includes("\0")) {
        if (canonical === "application/json") JSON.parse(text);
        mediaType = canonical;
      }
    } catch { /* Invalid UTF-8/JSON is rejected. */ }
  }
  if (!mediaType || (canonical && canonical !== mediaType) || !ATTACHMENT_TYPES.some(type => type === mediaType))
    throw new InputError(415, "El contenido o tipo del archivo no es válido para los formatos admitidos. Adjuntar no implica analizarlo.");
  return {
    bytes,
    mediaType,
    filename: name.replace(/[\r\n\x00-\x1f/\\]/g, "_").slice(0, 180) || "archivo",
  };
}

export function validateAttachments(files: Attachment[]) {
  if (files.length > MAX_FILES)
    throw new InputError(413, `Puedes adjuntar hasta ${MAX_FILES} archivos.`);
  if (files.reduce((size, file) => size + file.bytes.length, 0) > MAX_TOTAL_FILE_BYTES)
    throw new InputError(413, "Los archivos juntos deben pesar como máximo 15 MB.");
  return files;
}

export async function readFormAttachments(form: FormData) {
  const values = [...form.getAll("files"), ...form.getAll("image")];
  if (!values.length) throw new InputError(400, "Selecciona un archivo.");
  if (values.length > MAX_FILES)
    throw new InputError(413, `Puedes adjuntar hasta ${MAX_FILES} archivos.`);
  const files: Attachment[] = [];
  for (const value of values) {
    if (typeof value === "string") throw new InputError(400, "Adjunta archivos, no URLs.");
    files.push(
      validateAttachment(new Uint8Array(await value.arrayBuffer()), attachmentMediaType(value), value.name),
    );
  }
  return validateAttachments(files);
}

/** Only inline bytes are accepted. Never fetch client-controlled URLs. */
export function readInlineAttachment(part: {
  url: string;
  mediaType: string;
  filename?: string | undefined;
}) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(part.url);
  if (!match || match[1] !== part.mediaType || match[2]!.length % 4 !== 0)
    throw new InputError(
      415,
      "Adjunta el contenido del archivo en Base64; no se admiten URLs externas.",
    );
  if (match[2]!.length > 4 * Math.ceil(MAX_FILE_BYTES / 3))
    throw new InputError(413, "Cada archivo debe pesar como máximo 5 MB.");
  return validateAttachment(
    new Uint8Array(Buffer.from(match[2]!, "base64")),
    part.mediaType,
    part.filename || "archivo",
  );
}
