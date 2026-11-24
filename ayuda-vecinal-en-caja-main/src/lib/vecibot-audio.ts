export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_RECORDING_MS = 60_000;
export const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
];

export function audioExtension(type: string) {
  return type.includes("mp4")
    ? "mp4"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : "webm";
}
