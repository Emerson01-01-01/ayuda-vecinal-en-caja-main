// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleVeciBotAction, handleVeciBotInput, readInput } from "@/server/vecibot-input.server";
import { InputError, readBoundedBody } from "@/server/vecibot-auth.server";
import {
  actionFromExtraction,
  commitSchema,
  MAX_IMAGE_BYTES,
  type Extraction,
} from "@/lib/vecibot-input";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), extract: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/vecibot-auth.server", async (load) => ({
  ...(await load<typeof import("@/server/vecibot-auth.server")>()),
  authenticateInput: mocks.auth,
}));
vi.mock("@/server/ai/extract-input.server", () => ({ extractInput: mocks.extract }));

const productId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const catalog = [{ id: productId, name: "Leche 1 L", sale_price: 1.25, quantity: 10 }];
const client = { from: mocks.from, rpc: mocks.rpc };
let query: Record<string, ReturnType<typeof vi.fn>>;

function draft(overrides: Partial<Extraction> = {}): Extraction {
  return {
    intent: "venta",
    message: "Vender leche",
    date: null,
    supplier: null,
    warnings: [],
    items: [
      {
        name: "Leche 1 L",
        product_id: productId,
        quantity: 2,
        unit_cost: null,
        sale_price: null,
        category: null,
        min_stock: null,
      },
    ],
    ...overrides,
  };
}
function jsonRequest(payload: unknown) {
  return new Request("https://example.test/api/vecibot-entrada", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
function photo(bytes: Uint8Array, type: string) {
  const boundary = "vecibot-test";
  const start = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="foto.jpg"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const end = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(start.length + bytes.length + end.length);
  body.set(start);
  body.set(bytes, start.length);
  body.set(end, start.length + bytes.length);
  return new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  query = Object.fromEntries(["select", "eq", "order", "range", "in"].map((key) => [key, vi.fn()]));
  for (const method of ["select", "eq", "order"]) query[method]!.mockReturnValue(query);
  query["range"]!.mockImplementation(async (start: number) => ({
    data: start === 0 ? catalog : [],
    error: null,
  }));
  query["in"]!.mockResolvedValue({ data: [{ id: productId }], error: null });
  mocks.from.mockReturnValue(query);
  mocks.auth.mockResolvedValue({ client, store: { id: "store1", default_min_stock: 5 } });
  mocks.extract.mockResolvedValue(draft());
  mocks.rpc.mockResolvedValue({ data: { message: "Venta registrada" }, error: null });
});

describe("entrada multimedia: límites y validación", () => {
  it("acepta texto en español y no acepta campos de tienda/control del cliente", async () => {
    expect(await readInput(jsonRequest({ text: "Vendí dos leches" }))).toEqual({
      text: "Vendí dos leches",
      context: "auto",
    });
    const response = await handleVeciBotInput(
      jsonRequest({ text: "Vendí leche", storeId: "otra" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("verifica los bytes de la foto y no confía en la extensión ni MIME", async () => {
    await expect(
      readInput(photo(new TextEncoder().encode("<script>"), "image/jpeg")),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readInput(photo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/png")),
    ).rejects.toMatchObject({ status: 415 });
    const parsed = await readInput(photo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"));
    expect("files" in parsed && parsed.files[0]?.mediaType).toBe("image/jpeg");
    expect(parsed.context).toBe("auto");
  });
  it("rechaza fotos grandes y streams sin Content-Length que exceden el límite", async () => {
    await expect(
      readInput(photo(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/jpeg")),
    ).rejects.toMatchObject({ status: 413 });
    const request = new Request("https://example.test", {
      method: "POST",
      body: "demasiados bytes",
    });
    expect(request.headers.has("content-length")).toBe(false);
    await expect(readBoundedBody(request, 4)).rejects.toMatchObject({ status: 413 });
  });
  it("acepta múltiples imágenes y PDFs y entrega su contenido al extractor", async () => {
    const form = new FormData();
    form.append("files", new Blob(["%PDF-1.7\n"], { type: "application/pdf" }), "compra.pdf");
    form.append(
      "files",
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }),
      "nota.jpg",
    );
    form.set("text", "Registra esta compra");
    const response = await handleVeciBotInput(
      new Request("https://example.test/api/vecibot-entrada", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    expect(mocks.extract.mock.calls[0]?.[1]).toMatchObject({
      text: "Registra esta compra",
      files: [
        { filename: "compra.pdf", mediaType: "application/pdf", bytes: expect.any(Uint8Array) },
        { filename: "nota.jpg", mediaType: "image/jpeg", bytes: expect.any(Uint8Array) },
      ],
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rechaza lotes con demasiados archivos, PDFs falsos y formularios rotos", async () => {
    const form = new FormData();
    for (let index = 0; index < 6; index++)
      form.append("files", new Blob(["%PDF-1.7"], { type: "application/pdf" }), `${index}.pdf`);
    expect(
      (
        await handleVeciBotInput(
          new Request("https://example.test", { method: "POST", body: form }),
        )
      ).status,
    ).toBe(413);
    await expect(
      readInput(photo(new TextEncoder().encode("no es PDF"), "application/pdf")),
    ).rejects.toMatchObject({ status: 415 });
    const broken = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
      body: "broken",
    });
    expect((await handleVeciBotInput(broken)).status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("rechaza faltantes, cantidades fraccionadas, fechas imposibles y precios negativos", () => {
    expect(() =>
      actionFromExtraction(draft({ items: [{ ...draft().items[0]!, quantity: null }] })),
    ).toThrow();
    expect(() =>
      actionFromExtraction(draft({ items: [{ ...draft().items[0]!, quantity: 1.5 }] })),
    ).toThrow();
    expect(() =>
      actionFromExtraction(
        draft({
          intent: "compra",
          date: "2026-02-30",
          items: [{ ...draft().items[0]!, unit_cost: 1 }],
        }),
      ),
    ).toThrow();
    expect(() =>
      actionFromExtraction(
        draft({
          intent: "compra",
          date: "2026-11-01",
          items: [{ ...draft().items[0]!, unit_cost: -1 }],
        }),
      ),
    ).toThrow();
    expect(
      commitSchema.safeParse({ requestId, action: { intent: "consulta", items: [] } }).success,
    ).toBe(false);
  });
});

describe("entrada multimedia: aislamiento y escritura", () => {
  it("autentica antes de leer datos o llamar a la IA", async () => {
    mocks.auth.mockRejectedValue(new InputError(401, "Inicia sesión"));
    expect((await handleVeciBotInput(jsonRequest({ text: "venta" }))).status).toBe(401);
    expect((await handleVeciBotAction(jsonRequest({}))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("carga todas las páginas del catálogo con filtro de tienda, y analizar no escribe", async () => {
    const response = await handleVeciBotInput(jsonRequest({ text: "Vendí dos leches" }));
    expect(response.status).toBe(200);
    expect(query["eq"]).toHaveBeenCalledWith("store_id", "store1");
    expect(query["range"]).toHaveBeenCalledTimes(2);
    expect(mocks.extract.mock.calls[0]?.[2]).toEqual(catalog);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("elimina IDs ajenos sugeridos por la IA y exige seleccionarlos en la revisión", async () => {
    mocks.extract.mockResolvedValue(
      draft({ items: [{ ...draft().items[0]!, product_id: otherId }] }),
    );
    const response = await handleVeciBotInput(jsonRequest({ text: "Vendí leche" }));
    const data = await response.json();
    expect(data.draft.items[0].product_id).toBeNull();
    expect(data.draft.warnings.length).toBeGreaterThan(0);
  });
  it("no escribe cuando hay duplicados o una fecha futura", async () => {
    expect(
      (
        await handleVeciBotAction(
          jsonRequest({
            requestId,
            action: {
              intent: "venta",
              items: [draft().items[0], draft().items[0]].map((item) => ({
                product_id: item!.product_id,
                quantity: 1,
              })),
            },
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handleVeciBotAction(
          jsonRequest({
            requestId,
            action: {
              intent: "compra",
              date: "2999-01-01",
              supplier: null,
              items: [{ product_id: productId, quantity: 1, unit_cost: 1 }],
            },
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("envía reintentos con la misma clave a la RPC atómica y nunca inserta ventas directamente", async () => {
    const action = actionFromExtraction(draft());
    for (let i = 0; i < 2; i++)
      expect((await handleVeciBotAction(jsonRequest({ requestId, action }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "apply_vecibot_action", {
      _request_id: requestId,
      _action: action,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "apply_vecibot_action", {
      _request_id: requestId,
      _action: action,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith("sales");
  });
  it("devuelve un error útil si falta la migración o la base rechaza la operación", async () => {
    const payload = { requestId, action: actionFromExtraction(draft()) };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect((await handleVeciBotAction(jsonRequest(payload))).status).toBe(503);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001" } });
    expect((await handleVeciBotAction(jsonRequest(payload))).status).toBe(409);
  });
});
