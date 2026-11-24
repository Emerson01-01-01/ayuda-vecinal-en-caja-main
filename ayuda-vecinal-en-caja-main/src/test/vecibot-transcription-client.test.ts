import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "@/lib/vecibot-transcription-client";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session } },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "one.two.three" } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("subida del dictado", () => {
  it("envía los bytes de audio y el JWT, dejando el boundary al navegador", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ text: " Hola vecina " }));
    vi.stubGlobal("fetch", fetch);
    const audio = new Blob(["grabación"], { type: "audio/webm;codecs=opus" });
    expect(await transcribeAudio(audio, new AbortController().signal)).toBe("Hola vecina");
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/vecibot-transcribir");
    expect(options.headers).toEqual({ Authorization: "Bearer one.two.three" });
    const uploaded = options.body.get("audio") as File;
    expect(uploaded.size).toBe(audio.size);
    expect(uploaded.name).toBe("dictado.webm");
  });
  it("no envía audio sin sesión", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mocks.session.mockResolvedValue({ data: { session: null } });
    await expect(
      transcribeAudio(new Blob(["audio"]), new AbortController().signal),
    ).rejects.toThrow("Inicia sesión");
    expect(fetch).not.toHaveBeenCalled();
  });
});
