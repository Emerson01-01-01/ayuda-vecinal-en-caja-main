import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceInputButton } from "@/components/app/VoiceInputButton";

const mocks = vi.hoisted(() => ({ error: vi.fn(), paidTranscribe: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/vecibot-transcription-client", () => ({ transcribeAudio: mocks.paidTranscribe }));
class Recognition {
  static latest: Recognition;
  lang = "";
  continuous = true;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    Recognition.latest = this;
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("MediaRecorder", undefined);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dictado gratuito por defecto", () => {
  it("usa SpeechRecognition y entrega solo texto final sin llamar a APIs de IA", () => {
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
    expect(Recognition.latest.lang).toBe("es-EC");
    act(() =>
      Recognition.latest.onresult?.({ results: [{ isFinal: false, 0: { transcript: "vendí" } }] }),
    );
    expect(onTranscript).not.toHaveBeenCalled();
    act(() =>
      Recognition.latest.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "vendí dos leches" } }],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Terminar dictado" }));
    act(() => Recognition.latest.onend?.());
    expect(onTranscript).toHaveBeenCalledWith("vendí dos leches");
    expect(mocks.paidTranscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("no intenta transcripción de pago si el servicio del navegador falla", () => {
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
    act(() => {
      Recognition.latest.onerror?.({ error: "network" });
      Recognition.latest.onend?.();
    });
    expect(mocks.error).toHaveBeenCalledWith(
      expect.stringContaining("Revisa tu conexión o usa el teclado"),
    );
    expect(mocks.paidTranscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("finaliza tras una pausa y envía el dictado confirmado una sola vez", () => {
    vi.useFakeTimers();
    try {
      const onAutoSubmit = vi.fn();
      render(<VoiceInputButton onTranscript={vi.fn()} onAutoSubmit={onAutoSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
      expect(screen.getByRole("status")).toHaveTextContent("Escuchando");
      act(() => Recognition.latest.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "vendí una libra de arroz" } }],
      }));
      act(() => vi.advanceTimersByTime(1500));
      expect(Recognition.latest.stop).toHaveBeenCalledTimes(1);
      act(() => {
        Recognition.latest.onend?.();
        Recognition.latest.onend?.();
      });
      expect(onAutoSubmit).toHaveBeenCalledExactlyOnceWith("vendí una libra de arroz");
    } finally {
      vi.useRealTimers();
    }
  });

  it("desconecta los callbacks y libera el dictado al salir", () => {
    const view = render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
    view.unmount();
    expect(Recognition.latest.abort).toHaveBeenCalledOnce();
    expect(Recognition.latest.onresult).toBeNull();
  });
});
