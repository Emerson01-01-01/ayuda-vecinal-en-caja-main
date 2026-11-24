// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleVeciBotTranscription, readAudio } from "@/server/vecibot-transcription.server";
import { InputError } from "@/server/vecibot-auth.server";
import { AI_UNAVAILABLE_MESSAGE } from "@/server/ai/config.server";
import { MAX_AUDIO_BYTES } from "@/lib/vecibot-audio";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }));
vi.mock("@/server/vecibot-auth.server", async (load) => ({
  ...(await load<typeof import("@/server/vecibot-auth.server")>()),
  authenticateInput: mocks.auth,
}));
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x01]);
function request(bytes: Uint8Array = webm, type = "audio/webm;codecs=opus", extra = false) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(bytes)], { type }), "dictado.webm");
  if (extra) form.set("storeId", "otra-tienda");
  return new Request("https://example.test/api/vecibot-transcribir", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({});
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("endpoint de dictado sin proveedor externo", () => {
  it("explica la ausencia de IA sin transmitir audio ni inventar una transcripción", async () => {
    const response = await handleVeciBotTranscription(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: AI_UNAVAILABLE_MESSAGE });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("verifica la sesión antes de leer audio", async () => {
    mocks.auth.mockRejectedValue(new InputError(401, "Inicia sesión"));
    expect((await handleVeciBotTranscription(request())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("conserva validación de bytes, tamaño, campos y MIME", async () => {
    await expect(readAudio(request(new TextEncoder().encode("no soy audio")))).rejects.toMatchObject({ status: 415 });
    await expect(readAudio(request(webm, "audio/wav"))).rejects.toMatchObject({ status: 415 });
    await expect(readAudio(request(new Uint8Array(MAX_AUDIO_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
    await expect(readAudio(request(webm, "audio/webm", true))).rejects.toMatchObject({ status: 400 });
    expect((await readAudio(request(new TextEncoder().encode("RIFF1234WAVEdata"), "audio/wav"))).mediaType).toBe("audio/wav");
    const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32]);
    expect((await readAudio(request(mp4, "audio/mp4"))).filename).toBe("dictado.mp4");
  });
});
