export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain", "text/csv", "text/markdown", "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword", "application/rtf", "text/rtf",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a",
  "video/mp4", "video/webm", "video/quicktime",
] as const;

const extensionTypes: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
  txt: "text/plain", csv: "text/csv", md: "text/markdown", json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", rtf: "application/rtf",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
export const ATTACHMENT_ACCEPT = Object.keys(extensionTypes).map(ext => `.${ext}`).join(",");
export const ATTACHMENT_HELP = "Hasta 5 archivos: JPG, PNG, WebP, PDF, TXT, CSV, MD, JSON, DOCX, DOC, RTF; audio MP3, WAV, Ogg, M4A y videos MP4, WebM, MOV. Máximo 5 MB por archivo y 15 MB en total.";
export function attachmentMediaType(file: Pick<File, "type" | "name">) {
  return (!file.type || file.type === "application/octet-stream")
    ? extensionTypes[file.name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream"
    : file.type;
}

export function validateFiles(
  files: readonly Pick<File, "name" | "type" | "size">[],
): string | null {
  if (files.length > MAX_FILES) return `Puedes adjuntar hasta ${MAX_FILES} archivos.`;
  for (const file of files) {
    if (!file.size) return `El archivo ${file.name} está vacío.`;
    if (file.size > MAX_FILE_BYTES) return `El archivo ${file.name} supera los 5 MB.`;
    if (
      !ATTACHMENT_TYPES.some((type) => type === attachmentMediaType(file))
    )
      return `Formato no admitido: ${file.name}. ${ATTACHMENT_HELP}`;
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_FILE_BYTES)
    return "Los archivos juntos deben pesar como máximo 15 MB.";
  return null;
}
