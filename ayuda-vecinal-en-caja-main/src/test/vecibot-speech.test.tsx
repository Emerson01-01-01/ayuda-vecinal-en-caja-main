import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVecibotSpeech } from "@/hooks/use-vecibot-speech";

class Utterance {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: { name: string; lang: string } | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}
let changed: (() => void) | null;
let synth: {
  getVoices: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.clearAllMocks();
  changed = null;
  synth = {
    getVoices: vi.fn(() => [
      { name: "English Natural", lang: "en-US" },
      { name: "Español del sistema", lang: "es-EC" },
      { name: "Microsoft Jorge Online (Natural)", lang: "es-MX" },
      { name: "Microsoft Dalia Online (Natural)", lang: "es-MX" },
    ]),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn((_event, listener) => {
      changed = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("lectura cálida de VeciBot", () => {
  it("prefiere la voz masculina disponible y limpia Markdown", async () => {
    const { result } = renderHook(() => useVecibotSpeech());
    let reading!: Promise<boolean>;
    await act(async () => {
      reading = result.current.speak(
        "m1",
        "# Resumen\n- **Ganancia estimada:** $12,50.\n- *Revisa* tu stock.",
      );
    });
    const active = synth.speak.mock.calls[0]![0] as Utterance;
    expect(active.text).toBe("Resumen Ganancia estimada: $12,50. Revisa tu stock.");
    expect(active.voice?.name).toContain("Jorge");
    expect(active.pitch).toBe(0.96);
    expect(active.rate).toBe(0.95);
    expect(fetch).not.toHaveBeenCalled(); // Reading requires no backend, session or API key.
    await act(async () => {
      active.onend?.();
      await reading;
    });
    expect(result.current.speakingId).toBeNull();
  });

  it("espera voiceschanged cuando Edge todavía no ha cargado voces", async () => {
    synth.getVoices.mockReturnValue([]);
    const { result } = renderHook(() => useVecibotSpeech());
    let reading!: Promise<boolean>;
    act(() => {
      reading = result.current.speak("m1", "Hola vecina");
    });
    expect(synth.speak).not.toHaveBeenCalled();
    synth.getVoices.mockReturnValue([{ name: "Google español", lang: "es-ES" }]);
    await act(async () => { changed?.(); });
    await act(async () => {
      (synth.speak.mock.calls[0]![0] as Utterance).onend?.();
      await reading;
    });
    expect(synth.speak.mock.calls[0]![0].voice.name).toBe("Google español");
    expect(synth.removeEventListener).toHaveBeenCalledWith("voiceschanged", expect.any(Function));
  });

  it("cancela una espera pendiente y no vuelve a hablar al llegar las voces", async () => {
    synth.getVoices.mockReturnValue([]);
    const { result } = renderHook(() => useVecibotSpeech());
    let reading!: Promise<boolean>;
    act(() => {
      reading = result.current.speak("m1", "Hola");
    });
    await act(async () => {
      result.current.stop();
      await reading;
    });
    changed?.();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(result.current.speakingId).toBeNull();
  });

  it("no usa la voz por defecto si no hay voces españolas", async () => {
    vi.useFakeTimers();
    synth.getVoices.mockReturnValue([{ name: "English", lang: "en-US" }]);
    const { result } = renderHook(() => useVecibotSpeech());
    let reading!: Promise<boolean>;
    act(() => {
      reading = result.current.speak("m1", "Hola");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
      await reading;
    });
    expect(synth.speak).not.toHaveBeenCalled();
    expect(result.current.notice).toContain("No hay voces en español");
  });

  it("permite elegir una voz del navegador y usa esa selección sin peticiones externas", async () => {
    const { result } = renderHook(() => useVecibotSpeech());
    act(() => result.current.chooseVoice("Microsoft Dalia Online (Natural)|es-MX"));
    await act(async () => { void result.current.speak("elegida", "Dígame, veci."); });
    expect(synth.speak.mock.calls[0]![0].voice.name).toContain("Dalia");
    expect(result.current.voiceLabel).toContain("es-MX");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("detiene y libera la lectura al apagar voz automática o salir", async () => {
    const { result, unmount } = renderHook(() => useVecibotSpeech());
    await act(async () => {
      result.current.setAutomatic(true);
      void result.current.speak("m1", "Primer texto");
    });
    act(() => result.current.setAutomatic(false));
    expect(synth.cancel).toHaveBeenCalledOnce();
    await act(async () => { void result.current.speak("m2", "Segundo texto"); });
    const active = synth.speak.mock.calls[1]![0] as Utterance;
    unmount();
    expect(active.onend).toBeNull();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
});
