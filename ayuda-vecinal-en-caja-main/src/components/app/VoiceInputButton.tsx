import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_AUDIO_BYTES, MAX_RECORDING_MS, RECORDING_TYPES } from "@/lib/vecibot-audio";
import { transcribeAudio } from "@/lib/vecibot-transcription-client";
import { vecibotErrorMessage } from "@/lib/vecibot-client";
import { BrowserVoiceInputButton } from "./BrowserVoiceInputButton";

interface Recording {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  chunks: Blob[];
  size: number;
}
type Status = "idle" | "permission" | "recording" | "transcribing";

function release(recording: Recording) {
  if (recording.timer) clearTimeout(recording.timer);
  recording.timer = null;
  if (recording.recorder) {
    recording.recorder.ondataavailable = null;
    recording.recorder.onstop = null;
    recording.recorder.onerror = null;
    if (recording.recorder.state !== "inactive") recording.recorder.stop();
  }
  recording.stream?.getTracks().forEach((track) => track.stop());
  recording.stream = null;
}

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  onListeningChange?: ((listening: boolean) => void) | undefined;
  onStart?: (() => void) | undefined;
  onAutoSubmit?: ((text: string) => void) | undefined;
}

/** Free browser dictation is the default; server transcription is explicitly opt-in. */
export function VoiceInputButton({
  mode = "browser",
  ...props
}: VoiceInputProps & { mode?: "browser" | "server" }) {
  return mode === "server" ? (
    <RecordedVoiceInputButton {...props} />
  ) : (
    <BrowserVoiceInputButton {...props} />
  );
}

function RecordedVoiceInputButton({
  onTranscript,
  disabled = false,
  onListeningChange,
  onStart,
  onAutoSubmit,
}: VoiceInputProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [retryAudio, setRetryAudio] = useState<Blob | null>(null);
  const current = useRef<Recording | null>(null);
  const callbacks = useRef({ onTranscript, onListeningChange, onStart, onAutoSubmit });
  callbacks.current = { onTranscript, onListeningChange, onStart, onAutoSubmit };

  useEffect(
    () => () => {
      const active = current.current;
      current.current = null;
      if (active) {
        active.controller.abort();
        release(active);
      }
    },
    [],
  );

  function finish(active: Recording) {
    release(active);
    if (current.current !== active) return;
    current.current = null;
    setStatus("idle");
    callbacks.current.onListeningChange?.(false);
  }

  function cancel() {
    const active = current.current;
    if (active) {
      active.controller.abort();
      finish(active);
    }
    setRetryAudio(null);
  }

  function isCurrent(active: Recording) {
    return current.current === active && !active.controller.signal.aborted;
  }

  function makeRecording(): Recording {
    const active: Recording = {
      stream: null,
      recorder: null,
      timer: null,
      controller: new AbortController(),
      chunks: [],
      size: 0,
    };
    current.current = active;
    callbacks.current.onStart?.();
    callbacks.current.onListeningChange?.(true);
    return active;
  }

  async function upload(active: Recording, audio: Blob) {
    if (current.current !== active || active.controller.signal.aborted) return;
    release(active);
    setStatus("transcribing");
    try {
      const text = await transcribeAudio(audio, active.controller.signal);
      if (current.current !== active || active.controller.signal.aborted) return;
      setRetryAudio(null);
      callbacks.current.onTranscript(text);
      callbacks.current.onAutoSubmit?.(text);
    } catch (error) {
      if (current.current === active && !active.controller.signal.aborted) {
        setRetryAudio(audio);
        toast.error(vecibotErrorMessage(error));
      }
    } finally {
      finish(active);
    }
  }

  async function start() {
    if (current.current || disabled) return;
    if (!window.isSecureContext)
      return void toast.error("Abre la app con HTTPS o en localhost para usar el micrófono.");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined" ||
      typeof MediaRecorder.isTypeSupported !== "function"
    )
      return void toast.error(
        "Este navegador no permite grabar audio. Usa un navegador actualizado o escribe el mensaje.",
      );
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      return void toast.error(
        "El navegador no ofrece un formato de grabación compatible. Prueba un navegador actualizado.",
      );
    const active = makeRecording();
    setRetryAudio(null);
    setStatus("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent(active)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      active.stream = stream;
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      active.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (current.current !== active || !event.data.size) return;
        active.size += event.data.size;
        if (active.size > MAX_AUDIO_BYTES) {
          toast.error("La grabación supera los 8 MB. Dicta un mensaje más corto.");
          active.controller.abort();
          finish(active);
          return;
        }
        active.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (current.current !== active) return;
        toast.error("No pude grabar el audio. Revisa el micrófono e intenta otra vez.");
        active.controller.abort();
        finish(active);
      };
      recorder.onstop = () => {
        if (current.current !== active || active.controller.signal.aborted) return;
        const audio = new Blob(active.chunks, { type: recorder.mimeType || mimeType });
        if (!audio.size) {
          toast.error("No se grabó audio. Vuelve a dictar.");
          finish(active);
          return;
        }
        void upload(active, audio);
      };
      recorder.start(1000);
      setStatus("recording");
      active.timer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      if (!isCurrent(active)) return;
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
      toast.error(
        name === "NotAllowedError"
          ? "Permite el acceso al micrófono en la configuración del navegador."
          : name === "NotFoundError"
            ? "No se encontró un micrófono disponible."
            : name === "NotReadableError"
              ? "El micrófono está ocupado. Cierra otra aplicación que lo esté usando."
              : "No pude iniciar la grabación. Revisa el micrófono y sus permisos.",
      );
      finish(active);
    }
  }

  const recording = status === "recording";
  const working = status !== "idle";
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={recording ? "destructive" : "outline"}
        size="sm"
        disabled={disabled && !working}
        aria-pressed={recording}
        aria-label={
          recording ? "Terminar dictado" : working ? "Cancelar dictado" : "Dictar por voz"
        }
        onClick={() => {
          if (recording) {
            const recorder = current.current?.recorder;
            if (recorder?.state === "recording") recorder.stop();
          } else if (working) cancel();
          else void start();
        }}
      >
        {recording ? <Square /> : working ? <X /> : <Mic />}{" "}
        {recording ? "Terminar" : working ? "Cancelar" : "Dictar"}
      </Button>
      {working && (
        <span
          role="status"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        >
          {status === "transcribing" && <Loader2 className="size-3 animate-spin" />}
          {status === "permission"
            ? "Esperando permiso…"
            : recording
              ? "Grabando… máximo 60 s"
              : "Transcribiendo…"}
        </span>
      )}
      {retryAudio && !working && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              if (!current.current) void upload(makeRecording(), retryAudio);
            }}
          >
            <RotateCcw /> Reintentar audio
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setRetryAudio(null)}
          >
            Descartar audio
          </Button>
        </>
      )}
    </span>
  );
}
