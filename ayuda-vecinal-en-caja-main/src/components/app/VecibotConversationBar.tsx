import type { ReactNode } from "react";
import { Loader2, Mic, MicOff, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VecibotConversationBar(props: {
  enabled: boolean; listening: boolean; starting: boolean; processing: boolean; speaking: boolean; awake: boolean;
  muted: boolean; speechSupported: boolean; busy: boolean;
  notice: string; error: boolean; retryMic: boolean; retryVoice: boolean;
  onActivate: () => void; onStop: () => void; onMute: () => void; onListenNow: () => void; onRetryVoice: () => void;
  children: ReactNode;
}) {
  const status = props.speaking ? "Hablando" : props.processing ? "Procesando"
    : props.starting ? "Activando micrófono" : !props.enabled ? "Conversación por voz"
    : !props.listening ? "Reanudando escucha" : props.awake ? "Te escucho, veci" : "Di Hola VeciBot";
  const helper = props.speaking ? "El micrófono está en pausa mientras hablo."
    : props.processing ? "Esperando la confirmación del servidor."
    : props.enabled ? props.awake ? "Habla con calma. Enviaré después de 2 segundos de silencio." : "También puedes pulsar Hablar ahora."
    : "Activa el micrófono para conversar o escribe abajo.";
  return <section aria-label="Conversación por voz" className="mb-3 shrink-0 rounded-2xl border bg-card p-3 shadow-card sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span role="img" aria-label={props.listening ? "Micrófono activo" : props.enabled ? "Micrófono en pausa" : "Micrófono apagado"}
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${props.enabled || props.speaking ? "bg-primary-soft text-primary" : "bg-info-soft text-navy"}`}>
          {props.speaking ? <Volume2 className="size-5" /> : props.processing || props.starting ? <Loader2 className="size-5 motion-safe:animate-spin" /> : props.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p role="status" aria-live="polite" className="text-sm font-bold text-foreground">{status}</p>
            {(props.listening || props.speaking) && <span aria-hidden="true" className="flex h-5 items-center gap-0.5 text-primary">
              {[7, 12, 18, 12, 7].map((height, index) => <span key={index} style={{ height, animationDelay: `${index * 100}ms` }} className="w-0.5 rounded-full bg-current motion-safe:animate-pulse" />)}
            </span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={props.enabled || props.busy || props.speaking ? "outline" : "default"}
          onClick={props.enabled || props.busy || props.speaking ? props.onStop : props.onActivate}
          aria-label={props.enabled || props.busy || props.speaking ? "Detener conversación" : "Activar conversación"}>
          {props.enabled || props.busy || props.speaking ? <Square /> : <Mic />}{props.enabled || props.busy || props.speaking ? "Detener" : "Activar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!props.speechSupported} onClick={props.onMute} aria-pressed={props.muted}>
          {props.muted ? <VolumeX /> : <Volume2 />}{props.muted ? "Activar voz" : "Silenciar"}
        </Button>
        {props.enabled && !props.awake && !props.speaking && <Button type="button" size="sm" variant="ghost" onClick={props.onListenNow}>Hablar ahora</Button>}
      </div>
    </div>
    {props.notice && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
      <p role={props.error ? "alert" : "status"} className={props.error ? "text-destructive" : "text-muted-foreground"}>{props.notice}</p>
      {props.retryMic && <button type="button" onClick={props.onActivate} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><RotateCcw className="size-3" />Reintentar micrófono</button>}
      {props.retryVoice && <button type="button" onClick={props.onRetryVoice} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Volume2 className="size-3" />Escuchar</button>}
    </div>}
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded py-1 hover:text-foreground">Voz y conexión</summary>
      <div className="mt-2 space-y-2 border-t pt-2">{props.children}</div>
    </details>
  </section>;
}
