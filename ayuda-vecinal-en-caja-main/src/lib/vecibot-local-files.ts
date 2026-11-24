import { attachmentMediaType, validateFiles } from "./vecibot-files";

export interface LocalFileResult { name: string; text: string; notice: string }
const TEXT_LIMIT = 16000;
/** Deterministic extraction in the browser: no AI, upload, OCR or speech model. */
export async function extractLocalFile(file: File): Promise<LocalFileResult> {
  const validation = validateFiles([file]);
  if (validation) throw new Error(validation);
  const type = attachmentMediaType(file);
  let text = "";
  let notice = "";
  if (type.startsWith("text/") && type !== "text/rtf" || type === "application/json") {
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    if (bytes.includes(0)) throw new Error("El archivo no parece texto UTF-8. Guárdalo como TXT UTF-8.");
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    notice = file.size > 65536 ? "Solo se leyó el inicio del archivo (64 KB)." : "Texto extraído en este navegador; sin análisis de IA.";
  } else if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: entry => entry.name === "word/document.xml" && entry.originalSize <= 2 * 1024 * 1024,
    });
    const document = entries["word/document.xml"];
    if (!document) throw new Error("DOCX inválido o texto descomprimido mayor de 2 MB. Exporta una copia a TXT o PDF.");
    // Parse as XML; never insert the document's markup into the page.
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(document), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("No pude leer el XML del DOCX.");
    text = Array.from(xml.getElementsByTagNameNS("*", "p")).map(p => p.textContent).join("\n");
    notice = "Texto principal extraído del DOCX; no se leen fotos, comentarios ni tablas como estructura.";
  } else if (type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true });
    try {
      const pdf = await task.promise;
      const pages: string[] = [];
      let count = 0;
      for (let page = 1; page <= Math.min(pdf.numPages, 30) && count < TEXT_LIMIT; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const value = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        pages.push(`Página ${page}:\n${value}`); count += value.length;
      }
      if (pages.every(page => /^Página \d+:\s*$/.test(page)))
        return { name: file.name, text: "", notice: "No se encontró texto seleccionable. Puede ser un PDF escaneado: no hay OCR ni análisis de imágenes disponible." };
      text = pages.join("\n\n");
      notice = `Texto seleccionable extraído de ${pages.length} de ${pdf.numPages} páginas; sin OCR ni comprensión de imágenes.`;
    } finally { await task.destroy(); }
  } else {
    notice = type.startsWith("image/") ? "Foto adjunta y disponible en vista previa. No se analizó su contenido: no hay visión ni OCR configurados."
      : type.startsWith("audio/") ? "Audio adjunto para reproducir. No se transcribió ni comprendió su contenido."
      : type.startsWith("video/") ? "Video adjunto para reproducir. No se analizaron imágenes ni audio."
      : "Archivo adjunto. No hay un extractor local para este formato; conviértelo a DOCX, TXT o PDF con texto seleccionable.";
  }
  return { name: file.name, text: text.slice(0, TEXT_LIMIT), notice: notice + (text.length > TEXT_LIMIT ? " Vista limitada a 16.000 caracteres." : "") };
}
