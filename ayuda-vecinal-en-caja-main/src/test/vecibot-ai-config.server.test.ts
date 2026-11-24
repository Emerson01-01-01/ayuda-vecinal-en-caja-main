// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { AI_UNAVAILABLE_MESSAGE, getVecibotAIConfig, vecibotStatus } from "@/server/ai/config.server";
import { createResponsesCall } from "@/server/ai/responses";
import { extractInput } from "@/server/ai/extract-input.server";

afterEach(() => vi.unstubAllGlobals());

it("indica que no hay IA habilitada sin leer claves, hacer llamadas o generar respuestas", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(() => getVecibotAIConfig()).toThrow(AI_UNAVAILABLE_MESSAGE);
  const onFinish = vi.fn();
  const call = createResponsesCall(new Request("https://example.test/api/vecibot"), { provider: "unavailable" }, []);
  expect(() => call.result.toUIMessageStreamResponse({ originalMessages: [], onFinish, onError: () => "error" })).toThrow(AI_UNAVAILABLE_MESSAGE);
  expect(onFinish).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("la interpretación de adjuntos falla explícitamente sin inventar un borrador", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(extractInput(new Request("https://example.test/api/vecibot-entrada"), { text: "Lee mi archivo", context: "auto" }, [])).rejects.toMatchObject({ status: 503, message: AI_UNAVAILABLE_MESSAGE });
  expect(fetch).not.toHaveBeenCalled();
});

it("el estado público conserva el servidor conectado y no expone configuración de proveedores", async () => {
  const response = vecibotStatus();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ server: "connected", aiConfigured: false, message: AI_UNAVAILABLE_MESSAGE });
});
