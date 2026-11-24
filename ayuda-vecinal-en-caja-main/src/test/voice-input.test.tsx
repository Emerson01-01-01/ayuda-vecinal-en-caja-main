import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceInputButton } from "@/components/app/VoiceInputButton";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  transcribe: vi.fn(),
  getUserMedia: vi.fn(),
  trackStop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/vecibot-transcription-client", () => ({ transcribeAudio: mocks.transcribe }));

class Recorder {
  static latest: Recorder;
  static isTypeSupported = vi.fn((type: string) => type.startsWith("audio/webm"));
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: this.mimeType }),
    });
    this.onstop?.();
  });
  constructor(_stream: unknown, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
    Recorder.latest = this;
  }
}
const stream = { getTracks: () => [{ stop: mocks.trackStop }] };

beforeEach(() => {
  vi.clearAllMocks();
  Recorder.isTypeSupported.mockImplementation((type: string) => type.startsWith("audio/webm"));
  mocks.getUserMedia.mockResolvedValue(stream);
  mocks.transcribe.mockResolvedValue("Vendí dos leches.");
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mocks.getUserMedia } });
  vi.stubGlobal("isSecureContext", true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function begin() {
  fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
  await screen.findByRole("button", { name: "Terminar dictado" });
}

describe("dictado grabado en localhost", () => {
  it("graba audio real y solo entrega la transcripción al terminar", async () => {
    const onTranscript = vi.fn();
    const onListeningChange = vi.fn();
    render(
      <VoiceInputButton
        mode="server"
        onTranscript={onTranscript}
        onListeningChange={onListeningChange}
      />,
    );
    await begin();
    expect(mocks.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(Recorder.latest.start).toHaveBeenCalledWith(1000);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Terminar dictado" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledExactlyOnceWith("Vendí dos leches."));
    expect(mocks.transcribe.mock.calls[0]![0].size).toBe(4);
    expect(mocks.trackStop).toHaveBeenCalledOnce();
    expect(onListeningChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it("usa MP4 cuando WebM no está disponible", async () => {
    Recorder.isTypeSupported.mockImplementation((type: string) => type === "audio/mp4");
    const view = render(<VoiceInputButton mode="server" onTranscript={vi.fn()} />);
    await begin();
    expect(Recorder.latest.mimeType).toBe("audio/mp4");
    view.unmount();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.trackStop).toHaveBeenCalledOnce();
  });

  it("explica permisos denegados y vuelve a permitir dictar", async () => {
    mocks.getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<VoiceInputButton mode="server" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Permite el acceso")),
    );
    expect(screen.getByRole("button", { name: "Dictar por voz" })).toBeEnabled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("conserva la grabación si falla la red y la reintenta sin pedir otro micrófono", async () => {
    mocks.transcribe.mockRejectedValueOnce(new Error("Servidor ocupado"));
    const onTranscript = vi.fn();
    render(<VoiceInputButton mode="server" onTranscript={onTranscript} />);
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Terminar dictado" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar audio" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("Vendí dos leches."));
    expect(mocks.getUserMedia).toHaveBeenCalledOnce();
    expect(mocks.transcribe.mock.calls[0]![0]).toBe(mocks.transcribe.mock.calls[1]![0]);
  });

  it("aborta una transcripción al salir sin entregar resultados tardíos", async () => {
    let resolve!: (text: string) => void;
    mocks.transcribe.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const onTranscript = vi.fn();
    const view = render(<VoiceInputButton mode="server" onTranscript={onTranscript} />);
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Terminar dictado" }));
    await screen.findByText("Transcribiendo…");
    const signal = mocks.transcribe.mock.calls[0]![1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve("resultado tardío"));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("libera el micrófono si se cancela mientras se espera permiso", async () => {
    let grant!: (value: typeof stream) => void;
    mocks.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    render(<VoiceInputButton mode="server" onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictar por voz" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar dictado" }));
    await act(async () => grant(stream));
    expect(mocks.trackStop).toHaveBeenCalledOnce();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
});
