// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { handleChatSubmission } from "@/server/vecibot-messages.server";
import { readStoredMessage } from "@/lib/vecibot-messages";
import { InputError } from "@/server/vecibot-auth.server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), insert: vi.fn(), eq: vi.fn(), previous: vi.fn() }));
vi.mock("@/server/vecibot-auth.server", async load => ({
  ...(await load<typeof import("@/server/vecibot-auth.server")>()), authenticateInput: mocks.auth,
}));
const records = new Map<string, { id: string; store_id: string; role: string; content: string }>();
const id = "11111111-1111-4111-8111-111111111111";
const photo = new Uint8Array(readFileSync(new URL("../assets/vecibot.png", import.meta.url)));
const client = { from: (table: string) => {
  expect(table).toBe("chat_messages");
  const query = { insert: mocks.insert, select: () => query, eq: mocks.eq, maybeSingle: mocks.previous };
  mocks.eq.mockReturnValue(query);
  return query;
} };
function submission(text = "Esta es mi foto", bytes = photo, key = id) {
  const form = new FormData(); form.set("id", key); form.set("text", text);
  form.set("files", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "foto.png");
  return form;
}
function request(form = submission()) { return new Request("https://example.test/api/vecibot-mensajes", { method: "POST", body: form }); }
beforeEach(() => {
  vi.clearAllMocks(); records.clear();
  mocks.auth.mockResolvedValue({ client, store: { id: "store1" } });
  mocks.insert.mockImplementation(async row => {
    if (records.has(row.id)) return { error: { code: "23505" } };
    records.set(row.id, row); return { error: null };
  });
  mocks.previous.mockImplementation(async () => ({ data: records.get(id), error: null }));
});
afterEach(() => vi.restoreAllMocks());

describe("recepción del chat independiente de IA", () => {
  it("recorre HTTP real con un mensaje y una imagen PNG existente del proyecto", async () => {
    // Only identity and the database are test doubles; HTTP, multipart and file validation are real.
    const server = createServer(async (incoming, outgoing) => {
      const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const address = server.address() as AddressInfo;
      const req = new Request(`http://127.0.0.1:${address.port}/api/vecibot-mensajes`, {
        method: "POST", headers: { "Content-Type": incoming.headers["content-type"]! }, body: Buffer.concat(chunks),
      });
      const response = await handleChatSubmission(req);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/vecibot-mensajes`, { method: "POST", body: submission() });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id, received: true, text: "Esta es mi foto", attachments: [{ filename: "foto.png", mediaType: "image/png", size: photo.length }], ai: { available: false } });
      const saved = records.get(id)!;
      expect(saved.store_id).toBe("store1");
      expect(readStoredMessage(saved.content)).toMatchObject({ text: "Esta es mi foto", attachments: [{ filename: "foto.png", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
      expect(saved.content).not.toContain(Buffer.from(photo).toString("base64"));
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("acepta solo imagen o solo texto, sin necesitar un proveedor", async () => {
    expect((await handleChatSubmission(request(submission("")))).status).toBe(200);
    const response = await handleChatSubmission(new Request("https://example.test/api/vecibot-mensajes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", text: "Solo texto" }),
    }));
    expect(response.status).toBe(200);
    expect(records.size).toBe(2);
  });
  it("un reintento idéntico confirma el mismo mensaje; un contenido diferente produce conflicto", async () => {
    expect((await handleChatSubmission(request())).status).toBe(200);
    expect((await handleChatSubmission(request())).status).toBe(200);
    expect(records.size).toBe(1);
    expect(mocks.eq).toHaveBeenCalledWith("store_id", "store1");
    const conflict = await handleChatSubmission(request(submission("Otro texto")));
    expect(conflict.status).toBe(409);
    expect(records.size).toBe(1);
  });
  it("rechaza sesiones, campos ajenos y archivos falsos sin guardar datos", async () => {
    mocks.auth.mockRejectedValueOnce(new InputError(401, "Inicia sesión"));
    expect((await handleChatSubmission(request())).status).toBe(401);
    const foreign = submission(); foreign.set("storeId", "otra-tienda");
    expect((await handleChatSubmission(request(foreign))).status).toBe(400);
    expect((await handleChatSubmission(request(submission("", new TextEncoder().encode("no soy una foto"))))).status).toBe(415);
    expect(records.size).toBe(0);
  });
  it("un error al guardar se muestra como fallo, sin una recepción ficticia", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "42501" } });
    const response = await handleChatSubmission(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.stringContaining("no tiene permiso") });
    expect(records.size).toBe(0);
  });
});
