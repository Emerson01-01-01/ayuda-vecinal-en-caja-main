import { describe, expect, it, vi, afterEach } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractLocalFile } from "@/lib/vecibot-local-files";
import { attachmentMediaType, validateFiles } from "@/lib/vecibot-files";

function file(bytes: string | Uint8Array, name: string, type: string) {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const blob = new File([new Uint8Array(data)], name, { type });
  Object.defineProperty(blob, "arrayBuffer", { value: async () => new Uint8Array(data).buffer });
  Object.defineProperty(blob, "slice", { value: (start: number, end: number) => ({ arrayBuffer: async () => data.slice(start, end).buffer }) });
  return blob;
}
afterEach(() => vi.unstubAllGlobals());
describe("adjuntos sin IA", () => {
  it("lee texto y DOCX localmente sin subir contenido", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await extractLocalFile(file("Arroz: 2 unidades", "lista.txt", ""))).text).toBe("Arroz: 2 unidades");
    const bytes = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Leche &amp; pan</w:t></w:r></w:p></w:body></w:document>') });
    const result = await extractLocalFile(file(bytes, "lista.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expect(result.text).toBe("Leche & pan");
    expect(result.notice).toContain("Texto principal");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("no afirma comprender imágenes, audio, video ni DOC antiguo", async () => {
    for (const [name, type] of [["foto.jpg", "image/jpeg"], ["voz.mp3", "audio/mpeg"], ["clip.mp4", "video/mp4"], ["antiguo.doc", "application/msword"]]) {
      const result = await extractLocalFile(file("contenido", name!, type!));
      expect(result.text).toBe("");
      expect(result.notice).toMatch(/No se|No hay/);
    }
  });
  it("rechaza DOCX dañado y conserva los límites para los formatos nuevos", async () => {
    await expect(extractLocalFile(file("inválido", "lista.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).rejects.toThrow();
    expect(attachmentMediaType({ name: "voz.m4a", type: "" })).toBe("audio/mp4");
    expect(validateFiles([{ name: "video.mp4", type: "video/mp4", size: 6 * 1024 * 1024 }])).toContain("5 MB");
  });
});
