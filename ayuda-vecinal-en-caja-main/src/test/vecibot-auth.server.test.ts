// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateInput } from "@/server/vecibot-auth.server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  claims: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  store: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
const client = { auth: { getClaims: mocks.claims }, from: mocks.from };
const request = (token?: string) =>
  new Request("https://example.test", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.createClient.mockReturnValue(client);
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "verified-owner" } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.store });
  mocks.store.mockResolvedValue({ data: { id: "store1", default_min_stock: 5 }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("autenticación multimedia real del handler", () => {
  it("no construye un cliente sin bearer token y rechaza claims no verificadas", async () => {
    await expect(authenticateInput(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.createClient).not.toHaveBeenCalled();
    mocks.claims.mockResolvedValue({ data: null, error: new Error("Firma inválida") });
    await expect(authenticateInput(request("one.two.three"))).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("consulta solo la tienda del propietario verificado con JWT y clave pública", async () => {
    const result = await authenticateInput(request("one.two.three"));
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
        global: { headers: { Authorization: "Bearer one.two.three" } },
      }),
    );
    expect(mocks.claims).toHaveBeenCalledWith("one.two.three");
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", "verified-owner");
    expect(result.store.id).toBe("store1");
  });
  it("distingue una tienda ausente de una configuración incompleta", async () => {
    mocks.store.mockResolvedValue({ data: null, error: null });
    await expect(authenticateInput(request("one.two.three"))).rejects.toMatchObject({
      status: 404,
    });
    vi.stubEnv("SUPABASE_URL", "");
    await expect(authenticateInput(request("one.two.three"))).rejects.toMatchObject({
      status: 503,
    });
  });
});
