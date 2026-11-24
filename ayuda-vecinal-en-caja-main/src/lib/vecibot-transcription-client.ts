import { supabase } from "@/integrations/supabase/client";
import { audioExtension, MAX_AUDIO_BYTES } from "./vecibot-audio";
import { vecibotFetch } from "./vecibot-client";

export async function transcribeAudio(audio: Blob, signal: AbortSignal) {
  if (!audio.size || audio.size > MAX_AUDIO_BYTES)
    throw new Error("La grabación debe contener audio y pesar como máximo 8 MB.");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Inicia sesión para usar el dictado de VeciBot.");
  if (signal.aborted) throw new DOMException("Dictado cancelado", "AbortError");
  const body = new FormData();
  body.set("audio", audio, `dictado.${audioExtension(audio.type)}`);
  const response = await vecibotFetch("/api/vecibot-transcribir", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    body,
    signal,
  });
  const result = await response.json();
  if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 2000)
    throw new Error("El servidor no devolvió una transcripción válida. Vuelve a dictar.");
  return result.text.trim();
}
