import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVeciBotInput } from "@/hooks/use-vecibot-input";

const mocks = vi.hoisted(() => ({ session: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session } },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, info: mocks.info } }));
const draft = {
  intent: "consulta",
  message: "Consulta sobre documentos",
  date: null,
  supplier: null,
  warnings: [],
  items: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "one.two.three" } } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("entrada del chat", () => {
  it("no da por enviado el texto/archivo cuando el transporte del chat devuelve un fallo", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ draft })); vi.stubGlobal("fetch", fetch);
    const onQuestion = vi.fn().mockResolvedValue(false);
    const files = [new File(["leche"], "lista.txt", { type: "text/plain" })];
    const { result } = renderHook(() => useVeciBotInput({ onQuestion }));
    await act(async () => { expect(await result.current.analyze("Lee esta lista", files)).toBe(false); });
    expect(onQuestion).toHaveBeenCalledExactlyOnceWith("Lee esta lista", files);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
  it("notifica el fallo una sola vez al panel sin duplicarlo como toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "IA no disponible" }, { status: 503 })));
    const onError = vi.fn();
    const { result } = renderHook(() => useVeciBotInput({ onError }));
    await act(async () => { expect(await result.current.analyze("Hola")).toBe(false); });
    expect(onError).toHaveBeenCalledExactlyOnceWith("IA no disponible");
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it("cancelar impide que una respuesta tardía vuelva a enviar mensajes", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    const onQuestion = vi.fn();
    const { result } = renderHook(() => useVeciBotInput({ onQuestion }));
    let sending!: Promise<boolean>;
    await act(async () => { sending = result.current.analyze("Hola"); });
    act(() => result.current.cancel());
    await act(async () => { resolve(Response.json({ draft })); expect(await sending).toBe(false); });
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    expect(onQuestion).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
  it("envía multipart con varios archivos y conserva los originales para la respuesta del chat", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ draft }));
    vi.stubGlobal("fetch", fetch);
    const onQuestion = vi.fn();
    const files = [
      new File(["%PDF-1.7"], "a.pdf", { type: "application/pdf" }),
      new File(["%PDF-1.7"], "b.pdf", { type: "application/pdf" }),
    ];
    const { result } = renderHook(() => useVeciBotInput({ onQuestion }));
    await act(async () => {
      expect(await result.current.analyze("Lee los documentos", files)).toBe(true);
    });
    const options = fetch.mock.calls[0]![1] as RequestInit;
    expect((options.body as FormData).getAll("files")).toHaveLength(2);
    expect(options.headers).toEqual({ Authorization: "Bearer one.two.three" });
    expect(onQuestion).toHaveBeenCalledWith("Lee los documentos", files);
    expect(result.current.busy).toBe(false);
  });
  it("muestra el error del proveedor y permite reintentar sin enviar otra consulta", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "Falta configurar la IA" }, { status: 503 })),
    );
    const onQuestion = vi.fn();
    const { result } = renderHook(() => useVeciBotInput({ onQuestion }));
    await act(async () => {
      expect(await result.current.analyze("Hola")).toBe(false);
    });
    expect(mocks.error).toHaveBeenCalledWith("Falta configurar la IA");
    expect(onQuestion).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});
