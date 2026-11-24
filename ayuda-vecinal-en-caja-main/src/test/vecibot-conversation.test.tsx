import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVecibotConversation, isVecibotWakeWord, type BrowserRecognition } from "@/hooks/use-vecibot-conversation";

class Recognition implements BrowserRecognition {
  static instances: Recognition[] = [];
  lang = ""; continuous = false; interimResults = false;
  onresult: BrowserRecognition["onresult"] = null;
  onerror: BrowserRecognition["onerror"] = null;
  onend: BrowserRecognition["onend"] = null;
  onspeechstart: BrowserRecognition["onspeechstart"] = null;
  onspeechend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.()); stop = vi.fn(); abort = vi.fn();
  constructor() { Recognition.instances.push(this); }
  result(final: string, interim = "") {
    this.onresult?.({ results: [
      ...(final ? [{ isFinal: true, 0: { transcript: final } }] : []),
      ...(interim ? [{ isFinal: false, 0: { transcript: interim } }] : []),
    ] });
  }
}
const latest = () => Recognition.instances.at(-1)!;
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); Recognition.instances = [];
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal("isSecureContext", true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("conversación gratuita del navegador", () => {
  it("saluda una vez y reanuda la escucha después de enviar y terminar la voz", async () => {
    let finish!: () => void;
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(() => new Promise<boolean>(resolve => { finish = () => resolve(true); })), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result, rerender } = renderHook(({ blocked }) => useVecibotConversation({ ...options, blocked }), { initialProps: { blocked: false } });
    act(() => result.current.activate());
    act(() => latest().result("Hola VeciBot")); await advance(2500);
    act(() => latest().result("VeciBot")); await advance(2500);
    expect(options.onWake).toHaveBeenCalledOnce();
    act(() => latest().result("¿Cómo está mi tienda?")); await advance(2000);
    const count = Recognition.instances.length;
    rerender({ blocked: true });
    await act(async () => finish());
    await advance(3000); expect(Recognition.instances).toHaveLength(count);
    rerender({ blocked: false }); await advance(500);
    expect(result.current.listening).toBe(true);
    expect(Recognition.instances).toHaveLength(count + 1);
    expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith("¿Cómo está mi tienda?");
    expect(options.onDeactivate).not.toHaveBeenCalled();
  });
  it("apaga el micrófono tras un envío rechazado y conserva el dictado sin avisos repetidos", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(() => false), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    act(() => result.current.activate());
    act(() => latest().result("VeciBot")); await advance(2500);
    const active = latest();
    act(() => active.result("Consulta sobre mi tienda")); await advance(2000);
    expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith("Consulta sobre mi tienda");
    expect(options.onTranscript).toHaveBeenLastCalledWith("Consulta sobre mi tienda");
    expect(result.current.enabled).toBe(false);
    expect(active.abort).toHaveBeenCalledOnce();
    const count = Recognition.instances.length;
    await advance(6000); expect(Recognition.instances).toHaveLength(count);
    expect(options.onDeactivate).toHaveBeenCalledOnce();
    expect(result.current.notice).toBe("");
  });
  it("reprograma el silencio si el servicio termina después de comenzar otra frase", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    act(() => result.current.activate()); act(() => latest().result("VeciBot")); await advance(2500);
    act(() => latest().result("¿Cuánto vendí hoy?")); await advance(500);
    act(() => latest().onspeechstart?.());
    act(() => latest().onend?.());
    await advance(1999); expect(options.onSubmit).not.toHaveBeenCalled();
    await advance(1); expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith("¿Cuánto vendí hoy?");
  });
  it("solo pide micrófono al activar, reconoce el saludo y envía una vez tras 2 s", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    expect(Recognition.instances).toHaveLength(0);
    act(() => result.current.activate());
    expect(latest().lang).toBe("es-EC");
    const microphone = latest();
    options.onWake.mockImplementation(() => expect(microphone.abort).toHaveBeenCalledOnce());
    act(() => microphone.result("Hola VeciBot"));
    await advance(1999); expect(options.onWake).not.toHaveBeenCalled();
    await advance(1); expect(options.onWake).toHaveBeenCalledOnce();
    expect(options.onSubmit).not.toHaveBeenCalled();
    await advance(500);
    act(() => latest().result("¿Cuánto vendí hoy?"));
    expect(options.onTranscript).toHaveBeenLastCalledWith("¿Cuánto vendí hoy?");
    await advance(2000);
    expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith("¿Cuánto vendí hoy?");
    await advance(3000); expect(options.onSubmit).toHaveBeenCalledOnce();
  });
  it("espera a palabras finales y reinicia el tiempo al continuar hablando", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    act(() => result.current.activate());
    act(() => latest().result("VeciBot")); await advance(2500);
    act(() => latest().result("Vendí", "dos")); await advance(1500);
    act(() => latest().result("Vendí dos leches")); await advance(1999);
    expect(options.onSubmit).not.toHaveBeenCalled();
    await advance(1); expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith("Vendí dos leches");
  });
  it("conserva el texto y no envía una frase que el navegador dejó incompleta", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    act(() => result.current.activate());
    act(() => latest().result("VeciBot")); await advance(2500);
    act(() => latest().result("Vendí", "dos le"));
    await advance(3500);
    expect(options.onSubmit).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(options.onTranscript).toHaveBeenLastCalledWith("Vendí dos le");
  });
  it("no reconoce durante la respuesta ni se reactiva tras desactivar o desmontar", async () => {
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result, rerender, unmount } = renderHook(({ blocked }) => useVecibotConversation({ ...options, blocked }), { initialProps: { blocked: false } });
    act(() => result.current.activate());
    const first = latest(); const stale = first.onresult;
    rerender({ blocked: true });
    expect(first.abort).toHaveBeenCalledOnce();
    act(() => stale?.({ results: [{ isFinal: true, 0: { transcript: "Mi propia voz" } }] }));
    await advance(3000); expect(options.onTranscript).not.toHaveBeenCalled();
    rerender({ blocked: false }); await advance(500);
    const resumed = latest();
    act(() => result.current.deactivate());
    expect(resumed.abort).toHaveBeenCalledOnce();
    const count = Recognition.instances.length;
    await advance(5000); expect(Recognition.instances).toHaveLength(count);
    act(() => result.current.activate());
    const last = latest(); unmount(); expect(last.abort).toHaveBeenCalledOnce();
  });
  it("explica falta de soporte y denegación del permiso sin hacer peticiones de IA", () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    const options = { blocked: false, onTranscript: vi.fn(), onSubmit: vi.fn(), onWake: vi.fn(), onDeactivate: vi.fn() };
    const { result } = renderHook(() => useVecibotConversation(options));
    act(() => result.current.activate());
    expect(result.current.notice).toContain("no ofrece dictado");
    vi.stubGlobal("SpeechRecognition", Recognition);
    act(() => result.current.activate());
    act(() => latest().onerror?.({ error: "not-allowed" }));
    expect(result.current.enabled).toBe(false);
    expect(result.current.notice).toContain("El navegador no permitió el micrófono");
    expect(options.onSubmit).not.toHaveBeenCalled();
  });
  it("no confunde una consulta que menciona VeciBot con la palabra de activación", () => {
    expect(isVecibotWakeWord("¡Hola, Veci Bot!")).toBe(true);
    expect(isVecibotWakeWord("VeciBot, dime mis ventas")).toBe(false);
  });
});
