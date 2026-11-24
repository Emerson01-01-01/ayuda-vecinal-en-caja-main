import { afterEach, describe, expect, it, vi } from "vitest";
import { chatRequestMessages, filesToParts, vecibotFetch } from "@/lib/vecibot-client";
import { validateFiles } from "@/lib/vecibot-files";

afterEach(() => vi.unstubAllGlobals());
describe("archivos y transporte del chat", () => {
  it("convierte contenido real de varios archivos a Base64 para la ruta del chat", async () => {
    const parts = await filesToParts([
      new File(["%PDF-1.7\n"], "factura.pdf", { type: "application/pdf" }),
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "nota.jpg", { type: "image/jpeg" }),
    ]);
    expect(parts.map((part) => part.url)).toEqual([
      "data:application/pdf;base64,JVBERi0xLjcK",
      "data:image/jpeg;base64,/9j/4A==",
    ]);
    const messages = chatRequestMessages([
      { id: "old", role: "user", parts: [parts[0]!, { type: "text", text: "Anterior" }] },
      { id: "new", role: "user", parts: [parts[1]!, { type: "text", text: "Actual" }] },
    ]);
    expect(messages[0]!.parts).toEqual([{ type: "text", text: "Anterior" }]);
    expect(messages[1]!.parts).toContainEqual(parts[1]);
  });
  it("valida formato, cantidad y tamaño acumulado antes de enviar", () => {
    expect(validateFiles([{ name: "vacío.pdf", type: "application/pdf", size: 0 }])).toContain(
      "vacío",
    );
    expect(validateFiles([{ name: "logo.svg", type: "image/svg+xml", size: 10 }])).toContain(
      "Formato no admitido",
    );
    expect(
      validateFiles(
        Array.from({ length: 6 }, () => ({ name: "a.pdf", type: "application/pdf", size: 100 })),
      ),
    ).toContain("hasta 5");
    expect(
      validateFiles(
        Array.from({ length: 4 }, () => ({
          name: "a.pdf",
          type: "application/pdf",
          size: 4 * 1024 * 1024,
        })),
      ),
    ).toContain("15 MB");
  });
  it("distingue errores del servidor, proxies HTML y fallos de conexión", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(
      Response.json({ error: "Se agotaron los créditos" }, { status: 402 }),
    );
    await expect(vecibotFetch("/api/vecibot")).rejects.toThrow("Se agotaron los créditos");
    fetch.mockResolvedValueOnce(new Response("<html>too large</html>", { status: 413 }));
    await expect(vecibotFetch("/api/vecibot")).rejects.toThrow("límite del servidor");
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(vecibotFetch("/api/vecibot")).rejects.toThrow("No se pudo llegar al servidor");
  });
});
