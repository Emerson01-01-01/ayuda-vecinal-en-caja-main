// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readInput } from "@/server/vecibot-input.server";
import { readInlineAttachment } from "@/server/vecibot-files.server";

describe("envío de archivos al servidor sin invocar IA", () => {
  it("recibe texto junto con documentos, audio y video en multipart y valida Base64", async () => {
    const files = [
      { name: "lista.txt", type: "text/plain", bytes: strToU8("2 leches y 3 panes") },
      { name: "nota.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="urn:w"><w:p><w:t>Leche</w:t></w:p></w:document>') }) },
      { name: "audio.wav", type: "audio/wav", bytes: strToU8("RIFF1234WAVEdata") },
      { name: "clip.mp4", type: "video/mp4", bytes: new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]) },
    ];
    const form = new FormData(); form.set("text", "Revisa estos archivos");
    for (const file of files) form.append("files", new Blob([file.bytes], { type: file.type }), file.name);
    const input = await readInput(new Request("https://example.test/api/vecibot-entrada", { method: "POST", body: form }));
    expect(input.text).toBe("Revisa estos archivos");
    expect("files" in input && input.files.map(file => file.filename)).toEqual(files.map(file => file.name));
    for (const file of files) {
      expect(readInlineAttachment({ filename: file.name, mediaType: file.type, url: `data:${file.type};base64,${Buffer.from(file.bytes).toString("base64")}` }).bytes).toEqual(file.bytes);
    }
  });
  it("rechaza contenido falso y URLs externas, sin descargar nada", () => {
    expect(() => readInlineAttachment({ mediaType: "video/mp4", filename: "falso.mp4", url: `data:video/mp4;base64,${Buffer.from("no soy video").toString("base64")}` })).toThrow("no es válido");
    expect(() => readInlineAttachment({ mediaType: "image/jpeg", url: "https://external.test/foto.jpg" })).toThrow("URLs externas");
  });
});
