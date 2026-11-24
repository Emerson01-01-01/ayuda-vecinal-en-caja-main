import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { VoiceInputProps } from "./VoiceInputButton";

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function BrowserVoiceInputButton({
  onTranscript,
  disabled = false,
  onListeningChange,
  onStart,
  onAutoSubmit,
}: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const callbacks = useRef({ onTranscript, onListeningChange, onStart, onAutoSubmit });
  callbacks.current = { onTranscript, onListeningChange, onStart, onAutoSubmit };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (silence.current) clearTimeout(silence.current);
      const active = recognition.current;
      if (active) {
        active.onresult = null;
        active.onerror = null;
        active.onend = null;
        active.abort();
      }
    },
    [],
  );

  function toggle() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor)
      return void toast.error(
        "Este navegador no permite dictar gratis. Prueba Chrome o Edge, o usa el teclado.",
      );
    if (!window.isSecureContext)
      return void toast.error("Abre la app con HTTPS o en localhost para usar el micrófono.");
    const active = new Constructor();
    recognition.current = active;
    active.lang = "es-EC";
    active.continuous = Boolean(callbacks.current.onAutoSubmit);
    active.interimResults = true;
    let finalText = "";
    let unfinished = "";
    let failed = false;
    let delivered = false;
    active.onresult = (event) => {
      const results = Array.from(event.results);
      finalText = results
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      unfinished = results.filter((result) => !result.isFinal).map((result) => result[0].transcript).join(" ").trim();
      setInterim([finalText, unfinished].filter(Boolean).join(" "));
      if (silence.current) clearTimeout(silence.current);
      // Stop after a pause; only confirmed words will be submitted on onend.
      if ((finalText || unfinished) && callbacks.current.onAutoSubmit)
        silence.current = setTimeout(() => { if (recognition.current === active) active.stop(); }, 1500);
    };
    active.onerror = ({ error }) => {
      failed = true;
      const messages: Record<string, string> = {
        "not-allowed": "Permite el acceso al micrófono en la configuración del navegador.",
        "service-not-allowed":
          "El navegador bloqueó su servicio gratuito de dictado. Puedes usar el teclado.",
        "audio-capture": "No se encontró un micrófono disponible.",
        "no-speech": "No escuché palabras. Acércate al micrófono e intenta otra vez.",
        network:
          "El servicio de dictado del navegador no respondió. Revisa tu conexión o usa el teclado.",
      };
      if (error !== "aborted")
        toast.error(
          messages[error] || "No pude reconocer la voz. Intenta de nuevo o usa el teclado.",
        );
    };
    active.onend = () => {
      if (timer.current) clearTimeout(timer.current);
      if (silence.current) clearTimeout(silence.current);
      recognition.current = null;
      setListening(false);
      setInterim("");
      callbacks.current.onListeningChange?.(false);
      if (!failed && unfinished && callbacks.current.onAutoSubmit) {
        callbacks.current.onTranscript([finalText, unfinished].filter(Boolean).join(" "));
        return;
      }
      if (!failed && finalText && !delivered) {
        delivered = true;
        callbacks.current.onTranscript(finalText);
        callbacks.current.onAutoSubmit?.(finalText);
      }
    };
    try {
      callbacks.current.onStart?.();
      active.start();
      setListening(true);
      callbacks.current.onListeningChange?.(true);
      timer.current = setTimeout(() => active.stop(), 30000);
    } catch {
      recognition.current = null;
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      setListening(false);
      callbacks.current.onListeningChange?.(false);
      toast.error("No pude iniciar el micrófono. Revisa sus permisos.");
    }
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <Button
        type="button"
        variant={listening ? "destructive" : "outline"}
        size="sm"
        disabled={disabled && !listening}
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Terminar dictado" : "Dictar por voz"}
      >
        {listening ? <Square /> : <Mic />} {listening ? "Terminar" : "Dictar"}
      </Button>
      {listening && (
        <span role="status" className="max-w-40 truncate text-xs text-muted-foreground">
          Escuchando…{interim ? ` ${interim}` : ""}
        </span>
      )}
    </span>
  );
}
