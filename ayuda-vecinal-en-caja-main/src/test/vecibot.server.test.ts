// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildBusinessSnapshot } from "@/lib/finance";
import { handleVeciBot } from "@/server/vecibot.server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  obtenerContextoBI: vi.fn(),
  createResponsesCall: vi.fn(),
  insert: vi.fn(),
  getVecibotAIConfig: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/server/bi.server", () => ({ obtenerContextoBI: mocks.obtenerContextoBI }));
vi.mock("@/server/ai/responses", () => ({ createResponsesCall: mocks.createResponsesCall }));
// Provider-independent business pipeline; no actual provider is enabled by this test.
vi.mock("@/server/ai/config.server", () => ({ getVecibotAIConfig: mocks.getVecibotAIConfig }));
vi.mock("ai", () => ({ convertToModelMessages: vi.fn(async () => []) }));

const client = { auth: { getClaims: mocks.getClaims }, from: () => ({ insert: mocks.insert }) };
const context = buildBusinessSnapshot({
  storeName: "Mi tienda",
  ownerName: "Ana",
  barrio: "Centro",
  hasDemoData: false,
  products: [],
  sales: [],
  expenses: [],
  purchases: [],
  now: new Date("2026-11-13T17:00:00Z"),
});

function request(token = "uno.dos.tres") {
  return new Request("https://example.test/api/vecibot", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerId: "propietario-ajeno",
      storeId: "tienda-ajena",
      contextoBI: { ventas: 99999 },
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "¿Qué me recomiendas?" }] },
      ],
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getVecibotAIConfig.mockReturnValue({ provider: "test-only" });
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  mocks.createClient.mockReturnValue(client);
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "owner1" } }, error: null });
  mocks.obtenerContextoBI.mockResolvedValue({ storeId: "store1", contexto: context });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.createResponsesCall.mockReturnValue({
    result: { toUIMessageStreamResponse: () => new Response("respuesta") },
    withRunId: (response: Response) => response,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("VeciBot: contexto BI por petición", () => {
  it("inyecta el JSON del servidor y usa al propietario verificado, ignorando el contexto del cliente", async () => {
    const response = await handleVeciBot(request());
    expect(response.status).toBe(200);
    expect(mocks.obtenerContextoBI).toHaveBeenCalledWith(client, "owner1");
    const systemPrompt: unknown = mocks.createResponsesCall.mock.calls[0]?.[3];
    expect(typeof systemPrompt).toBe("string");
    const serializedContext = String(systemPrompt).split(
      "CONTEXTO BI (JSON calculado por el servidor):\n",
    )[1];
    expect(JSON.parse(serializedContext ?? "null")).toEqual(context);
    expect(systemPrompt).toContain("sin recalcularlos");
    expect(systemPrompt).toContain("sierra ecuatoriana");
    expect(systemPrompt).toContain("invita amablemente a registrar ventas");
    expect(systemPrompt).not.toContain("99999");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: "store1", role: "user" }),
    );
    await handleVeciBot(request());
    expect(mocks.obtenerContextoBI).toHaveBeenCalledTimes(2);
  });

  it("responde 500 ante errores BI y no llama al modelo con cifras parciales", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.obtenerContextoBI.mockRejectedValue(new Error("Fallo de base de datos"));
    const response = await handleVeciBot(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "No pude leer los datos de tu tienda. Intenta de nuevo.",
    });
    expect(mocks.createResponsesCall).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando no hay tienda", async () => {
    mocks.obtenerContextoBI.mockResolvedValue(null);
    expect((await handleVeciBot(request())).status).toBe(404);
    expect(mocks.createResponsesCall).not.toHaveBeenCalled();
  });

  it("no consulta datos ni llama al modelo cuando la sesión no es válida", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("JWT inválido") });
    expect((await handleVeciBot(request())).status).toBe(401);
    expect(mocks.obtenerContextoBI).not.toHaveBeenCalled();
    expect(mocks.createResponsesCall).not.toHaveBeenCalled();
  });

  it("envía bytes de varios adjuntos Base64 al modelo y persiste solo texto y nombres", async () => {
    const response = await handleVeciBot(
      new Request("https://example.test/api/vecibot", {
        method: "POST",
        headers: { Authorization: "Bearer one.two.three", "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "m2",
              role: "user",
              parts: [
                { type: "text", text: "Lee esta factura" },
                {
                  type: "file",
                  mediaType: "application/pdf",
                  filename: "factura.pdf",
                  url: "data:application/pdf;base64,JVBERi0xLjcK",
                },
                {
                  type: "file",
                  mediaType: "image/jpeg",
                  filename: "nota.jpg",
                  url: "data:image/jpeg;base64,/9j/4A==",
                },
              ],
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    const messages = mocks.createResponsesCall.mock.calls[0]?.[2];
    expect(messages[0].content).toEqual([
      { type: "text", text: "Lee esta factura" },
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "factura.pdf",
        data: expect.any(Uint8Array),
      },
      { type: "image", mediaType: "image/jpeg", image: expect.any(Uint8Array) },
    ]);
    expect(new TextDecoder().decode(messages[0].content[1].data)).toBe("%PDF-1.7\n");
    expect(mocks.insert).toHaveBeenCalledWith({
      store_id: "store1",
      role: "user",
      content: "Lee esta factura\n\nArchivos: factura.pdf, nota.jpg",
    });
  });

  it("acepta multipart real y archivos sin texto", async () => {
    const form = new FormData();
    form.append("files", new Blob(["%PDF-1.7\n"], { type: "application/pdf" }), "factura.pdf");
    const response = await handleVeciBot(
      new Request("https://example.test/api/vecibot", {
        method: "POST",
        headers: { Authorization: "Bearer one.two.three" },
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.createResponsesCall.mock.calls[0]?.[2][0].content[1].mediaType).toBe(
      "application/pdf",
    );
  });

  it("rechaza URLs externas, firmas falsas y tipos sin llamar a la IA", async () => {
    for (const url of [
      "https://private.test/documento.pdf",
      "data:application/pdf;base64,aG9sYQ==",
    ]) {
      const response = await handleVeciBot(
        new Request("https://example.test/api/vecibot", {
          method: "POST",
          headers: { Authorization: "Bearer one.two.three", "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                id: "m2",
                role: "user",
                parts: [{ type: "file", mediaType: "application/pdf", url }],
              },
            ],
          }),
        }),
      );
      expect(response.status).toBe(415);
    }
    expect(mocks.createResponsesCall).not.toHaveBeenCalled();
    expect(mocks.obtenerContextoBI).not.toHaveBeenCalled();
  });

  it("devuelve JSON útil si falla la red durante la autenticación", async () => {
    mocks.getClaims.mockRejectedValue(new TypeError("fetch failed"));
    const response = await handleVeciBot(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("servicio de IA o de datos");
  });
});
