import { useCallback, useEffect, useRef, useState } from "react";

export interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend?: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
export const WAKE_GREETING = "Dígame, veci, ¿en qué puedo ayudarte?";
export function parseVecibotWake(text: string) {
  const match = /^[¡¿!\s]*(?:hola[\s,!.:;¡¿]*)?veci\s*bot\b[\s,!.:;\-]*(.*)$/i.exec(text.trim());
  if (!match) return null;
  const query = match[1]!.trim();
  return { query: /^[¿¡?!.,;:\s]*$/.test(query) ? "" : query };
}
export const isVecibotWakeWord = (text: string) => parseVecibotWake(text)?.query === "";

/** One microphone session at a time; audio playback and requests always pause capture. */
export function useVecibotConversation(options: {
  blocked: boolean; onTranscript: (text: string) => void;
  onSubmit: (text: string) => void | boolean | Promise<unknown>;
  onWake: () => void | Promise<unknown>; onDeactivate: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [awake, setAwake] = useState(false);
  const [notice, setNotice] = useState("");
  const callbacks = useRef(options); callbacks.current = options;
  const active = useRef<BrowserRecognition | null>(null);
  const running = useRef(false), woken = useRef(false), mounted = useRef(true);
  const epoch = useRef(0), pending = useRef<number | null>(null), rapidEnds = useRef(0);
  const permission = useRef<PermissionStatus | null>(null);
  const words = useRef({ final: "", interim: "" });
  const lastActivity = useRef(0);
  const timers = useRef<Record<"silence" | "restart" | "startup" | "final", ReturnType<typeof setTimeout> | null>>({ silence: null, restart: null, startup: null, final: null });
  const startRef = useRef<() => void>(() => {});
  function clearTimer(name: keyof typeof timers.current) {
    if (timers.current[name]) clearTimeout(timers.current[name]);
    timers.current[name] = null;
  }
  const release = useCallback(() => {
    (Object.keys(timers.current) as (keyof typeof timers.current)[]).forEach(clearTimer);
    const recognition = active.current; active.current = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = recognition.onspeechstart = null;
      recognition.onstart = recognition.onspeechend = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
    if (mounted.current) { setListening(false); setStarting(false); setFinalizing(false); }
  }, []);
  const deactivate = useCallback(() => {
    running.current = false; woken.current = false; epoch.current++; pending.current = null;
    words.current = { final: "", interim: "" };
    if (permission.current) permission.current.onchange = null;
    permission.current = null;
    release();
    if (mounted.current) { setEnabled(false); setAwake(false); setTurnBusy(false); }
    callbacks.current.onDeactivate();
  }, [release]);
  function fail(message: string) { setNotice(message); deactivate(); }
  function later() {
    if (!running.current || pending.current !== null || callbacks.current.blocked || active.current) return;
    clearTimer("restart");
    timers.current.restart = setTimeout(() => startRef.current(), 500);
  }
  async function deliver() {
    const text = words.current.final.trim();
    if (!running.current || pending.current !== null || callbacks.current.blocked || !text || words.current.interim) return;
    const turn = epoch.current;
    pending.current = turn; release(); words.current = { final: "", interim: "" }; setTurnBusy(true);
    try {
      const invocation = parseVecibotWake(text);
      if (!woken.current) {
        if (!invocation) { setNotice("Di «Hola VeciBot» o pulsa «Hablar ahora». Tu dictado sigue en el cuadro."); return; }
        woken.current = true; setAwake(true); setNotice("");
        callbacks.current.onTranscript(invocation.query);
        await callbacks.current.onWake();
        if (turn !== epoch.current || !running.current) return;
      }
      const query = invocation ? invocation.query : text;
      if (query) {
        callbacks.current.onTranscript(query);
        const sent = await callbacks.current.onSubmit(query);
        if (turn === epoch.current && sent === false) deactivate();
      } else callbacks.current.onTranscript("");
    } catch {
      if (turn === epoch.current) fail("No se pudo completar el envío. Revisa el dictado y vuelve a intentarlo.");
    } finally {
      if (pending.current === turn) { pending.current = null; setTurnBusy(false); later(); }
    }
  }
  function awaitFinal(recognition: BrowserRecognition) {
    if (timers.current.final) return;
    clearTimer("silence"); setFinalizing(true);
    // Arm the deadline BEFORE stop(): some browsers immediately dispatch onend.
    timers.current.final = setTimeout(() => fail("El navegador dejó palabras sin confirmar. Revisa el texto y pulsa Enviar, o reintenta el micrófono."), 1500);
    try { recognition.stop(); } catch { /* Await any final event from an ended session. */ }
  }
  function schedule(delay = 2000) {
    clearTimer("silence");
    timers.current.silence = setTimeout(() => {
      timers.current.silence = null;
      if (!running.current || callbacks.current.blocked) return;
      if (words.current.interim && active.current) awaitFinal(active.current);
      else void deliver();
    }, delay);
  }
  startRef.current = () => {
    if (!running.current || active.current || pending.current !== null || callbacks.current.blocked) return;
    const browser = window as VoiceWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) return fail("Este navegador no ofrece dictado. Puedes seguir escribiendo.");
    const recognition = new Constructor(), session = epoch.current, startedAt = Date.now();
    const prefix = words.current.final;
    let noSpeech = false;
    active.current = recognition; setStarting(true);
    recognition.lang = "es-EC"; recognition.continuous = true; recognition.interimResults = true;
    const current = () => active.current === recognition && running.current && epoch.current === session;
    const started = () => { if (current()) { clearTimer("startup"); setStarting(false); setListening(true); } };
    recognition.onstart = started;
    recognition.onspeechstart = () => {
      if (!current()) return;
      started(); clearTimer("silence"); lastActivity.current = Date.now();
    };
    recognition.onspeechend = () => {
      if (current() && (words.current.final || words.current.interim)) { lastActivity.current = Date.now(); schedule(); }
    };
    recognition.onresult = event => {
      if (!current() || callbacks.current.blocked) return;
      started(); rapidEnds.current = 0; setNotice(""); lastActivity.current = Date.now();
      const results = Array.from(event.results);
      words.current = {
        final: [prefix, ...results.filter(result => result.isFinal).map(result => result[0].transcript)].filter(Boolean).join(" ").trim(),
        interim: results.filter(result => !result.isFinal).map(result => result[0].transcript).join(" ").trim(),
      };
      const text = [words.current.final, words.current.interim].filter(Boolean).join(" ");
      callbacks.current.onTranscript(text.slice(0, 2000));
      if (text.length > 2000) return fail("El dictado llegó a 2000 caracteres. Revísalo antes de enviarlo.");
      if (!words.current.interim && timers.current.final) { clearTimer("final"); setFinalizing(false); void deliver(); }
      else if (text) schedule();
    };
    recognition.onerror = ({ error }) => {
      if (!current()) return;
      if (error === "no-speech") { noSpeech = true; return; }
      const messages: Record<string, string> = {
        "not-allowed": "El navegador no permitió el micrófono o retiró el permiso. Permítelo y pulsa Reintentar micrófono.",
        "service-not-allowed": "El navegador bloqueó su servicio de dictado. Prueba otro navegador o usa el teclado.",
        "audio-capture": "No hay un micrófono disponible. Conéctalo y vuelve a intentarlo.",
        "network": "El servicio de dictado no respondió. Revisa tu conexión y reintenta el micrófono.",
        "language-not-supported": "El servicio no admite este idioma de dictado. Puedes usar el teclado.",
      };
      fail(messages[error] || "El reconocimiento de voz se interrumpió. Reintenta el micrófono o escribe.");
    };
    recognition.onend = () => {
      if (!current()) return;
      clearTimer("startup"); setListening(false); setStarting(false);
      if (words.current.interim) {
        // Give the service time to finalize; never discard confirmed text on onend.
        if (!timers.current.final) schedule(Math.max(0, 2000 - (Date.now() - lastActivity.current)));
        return;
      }
      active.current = null;
      if (words.current.final && !timers.current.silence) schedule(Math.max(0, 2000 - (Date.now() - lastActivity.current)));
      rapidEnds.current = !noSpeech && Date.now() - startedAt < 1500 ? rapidEnds.current + 1 : 0;
      if (rapidEnds.current >= 3) return fail("El navegador está cerrando la escucha repetidamente. Revisa el permiso y pulsa Reintentar micrófono.");
      later();
    };
    timers.current.startup = setTimeout(() => fail("El navegador no activó el micrófono. Revisa la solicitud de permiso y vuelve a intentarlo."), 20_000);
    try { recognition.start(); }
    catch { fail("No pude activar el micrófono. Revisa los permisos y vuelve a intentarlo."); }
  };
  function activate() {
    if (running.current) return;
    const browser = window as VoiceWindow;
    if (!window.isSecureContext) return setNotice("Abre la aplicación con HTTPS o localhost para usar el micrófono.");
    if (!browser.SpeechRecognition && !browser.webkitSpeechRecognition) return setNotice("Este navegador no ofrece dictado gratuito. Puedes seguir escribiendo.");
    epoch.current++; const session = epoch.current;
    setNotice(""); running.current = true; woken.current = false; rapidEnds.current = 0;
    words.current = { final: "", interim: "" }; setEnabled(true); setAwake(false);
    startRef.current();
    void navigator.permissions?.query({ name: "microphone" as PermissionName }).then(status => {
      if (!running.current || epoch.current !== session) return;
      permission.current = status;
      const changed = () => { if (status.state === "denied" && running.current) fail("Se retiró el permiso del micrófono. Permítelo en el navegador y pulsa Reintentar micrófono."); };
      status.onchange = changed; changed();
    }).catch(() => { /* Permission introspection is optional; recognition still reports errors. */ });
  }
  function listenNow() { if (!running.current) return; woken.current = true; setAwake(true); setNotice(""); }
  useEffect(() => {
    if (options.blocked) { release(); words.current = { final: "", interim: "" }; }
    else later();
  }, [options.blocked, enabled, release]);
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.hidden) deactivate(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", deactivate);
    return () => {
      mounted.current = false; running.current = false; epoch.current++;
      if (permission.current) permission.current.onchange = null;
      release(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", deactivate);
    };
  }, [deactivate, release]);
  return { enabled, listening, starting, processing: turnBusy || finalizing, awake, notice, activate, deactivate, listenNow, pause: release, isEnabled: () => running.current };
}
