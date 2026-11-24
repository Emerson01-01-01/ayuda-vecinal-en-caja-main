const femaleNames =
  /salome|salomé|dalia|andrea|sabina|paulina|helena|elvira|paloma|laura|lucia|lucía|monica|mónica|catalina|maria|maría|ximena|camila|lupe|conchita|penelope|penélope/i;
const knownMaleNames =
  /jorge|alvaro|álvaro|pablo|diego|carlos|andres|andrés|raul|raúl|enrique|antonio|luis|gonzalo|tomas|tomás|lorenzo|marcelo|juan|manuel|alonso|emilio|roberto|rodrigo|gerardo|victor|víctor|sergio|mateo|lautaro/i;
const natural = /natural|neural|online|google.*espa[nñ]ol|google.*spanish/i;

export const voiceKey = (voice: SpeechSynthesisVoice) => voice.voiceURI || `${voice.name}|${voice.lang}`;
export const hasMaleVoiceName = (voice: SpeechSynthesisVoice) => knownMaleNames.test(voice.name);
export function describeSpanishVoice(voice: SpeechSynthesisVoice | undefined) {
  if (!voice) return "No hay una voz en español disponible. Puedes seguir escribiendo.";
  return `Voz: ${voice.name} (${voice.lang}).${hasMaleVoiceName(voice) ? " Preferencia masculina por el nombre de la voz." : " El navegador no informa el género de esta voz; puedes elegir otra."}${/^es[-_]EC$/i.test(voice.lang) ? "" : " El acento disponible corresponde a ese idioma, no se garantiza uno ecuatoriano."}`;
}

function score(voice: SpeechSynthesisVoice) {
  return (
    // Within the preferred voice group, Ecuador is always the first locale.
    (/^es[-_]EC$/i.test(voice.lang) ? 10000 : /^es[-_]CO$/i.test(voice.lang) ? 8000 : /^es[-_]419$/i.test(voice.lang) ? 7000 : /^es[-_](?!ES(?:$|[-_]))/i.test(voice.lang) ? 6000 : 0) +
    (natural.test(voice.name) ? 100 : 0) -
    (femaleNames.test(voice.name) ? 250 : 0) +
    (/google.*espa[nñ]ol|google.*spanish/i.test(voice.name) ? 50 : 0)
  );
}

export function selectWarmSpanishVoice(voices: SpeechSynthesisVoice[]) {
  const spanish = voices.filter((voice) => /^es(?:[-_]|$)/i.test(voice.lang));
  // Web Speech does not expose gender. Prefer known male names, then locale.
  const male = spanish.filter(hasMaleVoiceName);
  return (male.length ? male : spanish)
    .sort((a, b) => score(b) - score(a))[0];
}

/** Wait for delayed Edge/Chrome voice enumeration, with cancellation and a bounded wait. */
export function waitForSpanishVoice(
  synth: SpeechSynthesis,
  signal: AbortSignal,
  timeout = 1800,
  preferred = "",
): Promise<SpeechSynthesisVoice | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  const select = () => synth.getVoices().find(voice => /^es(?:[-_]|$)/i.test(voice.lang) && voiceKey(voice) === preferred) || selectWarmSpanishVoice(synth.getVoices());
  const initial = select();
  if (initial) return Promise.resolve(initial);
  return new Promise((resolve) => {
    const done = (voice?: SpeechSynthesisVoice) => {
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", changed);
      signal.removeEventListener("abort", aborted);
      resolve(voice);
    };
    const changed = () => {
      const voice = select();
      if (voice) done(voice);
    };
    const aborted = () => done();
    const timer = setTimeout(() => done(select()), timeout);
    synth.addEventListener("voiceschanged", changed);
    signal.addEventListener("abort", aborted, { once: true });
  });
}
