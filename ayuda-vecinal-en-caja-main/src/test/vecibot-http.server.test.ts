// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { vecibotEndpoint } from "@/server/vecibot-http.server";

afterEach(() => vi.unstubAllEnvs());
describe("CORS de VeciBot", () => {
  it("resuelve preflight permitido sin autenticar ni llamar al modelo", async () => {
    vi.stubEnv("VECIBOT_ALLOWED_ORIGINS", "https://tienda.example");
    const handler = vi.fn();
    const response = await vecibotEndpoint(
      new Request("https://api.example/api/vecibot", {
        method: "OPTIONS",
        headers: { Origin: "https://tienda.example" },
      }),
      handler,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://tienda.example");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(handler).not.toHaveBeenCalled();
  });
  it("rechaza orígenes no autorizados y añade CORS también en errores", async () => {
    vi.stubEnv("VECIBOT_ALLOWED_ORIGINS", "");
    const handler = vi.fn();
    const blocked = await vecibotEndpoint(
      new Request("https://api.example/api/vecibot", {
        method: "POST",
        headers: { Origin: "https://untrusted.example" },
      }),
      handler,
    );
    expect(blocked.status).toBe(403);
    expect(blocked.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    const failed = await vecibotEndpoint(
      new Request("https://api.example/api/vecibot", {
        method: "POST",
        headers: { Origin: "https://api.example" },
      }),
      async () => {
        throw new TypeError("fetch failed");
      },
    );
    expect(failed.status).toBe(502);
    expect(failed.headers.get("Access-Control-Allow-Origin")).toBe("https://api.example");
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
  });
});
