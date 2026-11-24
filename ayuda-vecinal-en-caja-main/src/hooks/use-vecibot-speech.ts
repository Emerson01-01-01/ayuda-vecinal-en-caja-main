import { useCallback, useEffect, useRef, useState } from "react";
import { spokenChatText } from "@/lib/vecibot-text";
import { describeSpanishVoice, selectWarmSpanishVoice, voiceKey, waitForSpanishVoice } from "@/lib/vecibot-voices";

export function useVecibotSpeech() {
  const [supported, setSupported] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceLabel, setVoiceLabel] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceSelection, setVoiceSelection] = useState("");
  const [notice, setNotice] = useState("");
  const preference = useRef("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const controller = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    setSpeakingId(null);
  }, []);

  useEffect(() => {
    setSupported(!!window.speechSynthesis && !!window.SpeechSynthesisUtterance);
    const updateVoice = () => {
      const available = (window.speechSynthesis?.getVoices() || []).filter(voice => /^es(?:[-_]|$)/i.test(voice.lang));
      setVoices(available);
      setVoiceLabel(describeSpanishVoice(available.find(voice => voiceKey(voice) === preference.current) || selectWarmSpanishVoice(available)));
    };
    updateVoice();
    window.speechSynthesis?.addEventListener("voiceschanged", updateVoice);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", updateVoice);
      controller.current?.abort();
      controller.current = null;
      if (utterance.current) {
        utterance.current.onend = null;
        utterance.current.onerror = null;
        utterance.current = null;
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      stop();
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) {
        setNotice("Este navegador no permite leer en voz alta. La respuesta sigue disponible por texto.");
        return false;
      }
      const chunks = spokenChatText(text).match(/[\s\S]{1,220}(?:\s|$)|[\s\S]{1,220}/g) || [];
      if (!chunks.length) return false;
      setNotice("");
      const activeController = new AbortController();
      controller.current = activeController;
      setSpeakingId(id);
      const voice = await waitForSpanishVoice(synth, activeController.signal, 1800, preference.current);
      if (activeController.signal.aborted) return false;
      if (!voice) {
        controller.current = null;
        setSpeakingId(null);
        setNotice("No hay voces en español disponibles. Puedes escribir o probar otro navegador.");
        return false;
      }
      setVoiceLabel(describeSpanishVoice(voice));
      // Resolve only when playback ends, fails or is cancelled. The microphone
      // controller can now await the actual audio lifecycle, not just enqueueing.
      return await new Promise<boolean>(resolve => {
        let settled = false;
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        const finish = (success: boolean, message = "") => {
          if (settled) return;
          settled = true;
          if (watchdog) clearTimeout(watchdog);
          activeController.signal.removeEventListener("abort", cancelled);
          if (utterance.current) {
            utterance.current.onstart = utterance.current.onend = utterance.current.onerror = null;
            utterance.current = null;
          }
          if (controller.current === activeController) controller.current = null;
          if (!success) synth.cancel();
          setSpeakingId(null);
          if (message) setNotice(message);
          resolve(success);
        };
        const cancelled = () => finish(false);
        activeController.signal.addEventListener("abort", cancelled, { once: true });
        const read = (index: number) => {
          if (activeController.signal.aborted) return finish(false);
          const chunk = chunks[index];
          if (!chunk) return finish(true);
          const active = new SpeechSynthesisUtterance(chunk);
          active.voice = voice; active.lang = voice.lang;
          // Preserve the existing masculine voice and its tuning.
          active.pitch = 0.96; active.rate = 0.95;
          active.onstart = () => {
            if (utterance.current !== active) return;
            if (watchdog) clearTimeout(watchdog);
            watchdog = setTimeout(() => finish(false, "La lectura se interrumpió. Pulsa Escuchar para reintentar."), Math.min(40_000, 6000 + chunk.length * 150));
          };
          active.onend = () => {
            if (utterance.current !== active) return;
            if (watchdog) clearTimeout(watchdog);
            read(index + 1);
          };
          active.onerror = event => {
            if (utterance.current !== active) return;
            finish(false, ["canceled", "interrupted"].includes(event.error) ? "" : "El navegador no pudo reproducir la voz. Pulsa Escuchar para reintentar.");
          };
          utterance.current = active;
          watchdog = setTimeout(() => finish(false, "El navegador no inició el audio. Pulsa Escuchar para permitir la reproducción."), 5000);
          try { synth.speak(active); }
          catch { finish(false, "No pude iniciar la lectura. Pulsa Escuchar para reintentar."); }
        };
        read(0);
      });
    },
    [stop],
  );

  function setAuto(enabled: boolean) {
    setAutomatic(enabled);
    if (!enabled) stop();
  }
  function chooseVoice(key: string) {
    stop();
    preference.current = key;
    setVoiceSelection(key);
    setVoiceLabel(describeSpanishVoice(voices.find(voice => voiceKey(voice) === key) || selectWarmSpanishVoice(voices)));
  }
  return { supported, automatic, setAutomatic: setAuto, speakingId, voiceLabel, voices, voiceSelection, chooseVoice, speak, stop, notice, clearNotice: () => setNotice("") };
}
