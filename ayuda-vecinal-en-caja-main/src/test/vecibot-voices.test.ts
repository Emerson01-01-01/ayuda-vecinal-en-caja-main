import { describe, expect, it } from "vitest";
import { describeSpanishVoice, selectWarmSpanishVoice } from "@/lib/vecibot-voices";
const voice = (name: string, lang: string) => ({ name, lang } as SpeechSynthesisVoice);
describe("preferencia masculina y acento disponible", () => {
  it("elige la masculina ecuatoriana antes que otra masculina natural", () => {
    expect(selectWarmSpanishVoice([
      voice("Microsoft Dalia Online Natural", "es-MX"), voice("Microsoft Jorge Natural", "es-MX"),
      voice("Microsoft Luis", "es-EC"), voice("Microsoft Gonzalo Natural", "es-CO"),
    ])?.name).toBe("Microsoft Luis");
  });
  it("prioriza Colombia y Latinoamérica cuando no hay masculina ecuatoriana", () => {
    expect(selectWarmSpanishVoice([voice("Microsoft Pablo", "es-ES"), voice("Microsoft Jorge", "es-MX"), voice("Microsoft Gonzalo", "es-CO")])?.lang).toBe("es-CO");
  });
  it("si no hay masculina identificable elige Ecuador y explica la limitación", () => {
    const selected = selectWarmSpanishVoice([voice("Microsoft Dalia Natural", "es-MX"), voice("Español del sistema", "es-EC")]);
    expect(selected?.lang).toBe("es-EC");
    expect(describeSpanishVoice(selected)).toContain("no informa el género");
    expect(describeSpanishVoice(voice("Microsoft Jorge", "es-MX"))).toContain("no se garantiza uno ecuatoriano");
  });
});
