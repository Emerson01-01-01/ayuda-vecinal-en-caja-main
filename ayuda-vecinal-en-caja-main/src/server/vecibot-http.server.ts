import { InputError, inputErrorResponse } from "./vecibot-auth.server";

/** Same-origin by default. Cross-origin clients must be explicitly configured. */
export async function vecibotEndpoint(request: Request, handler: () => Promise<Response>) {
  const origin = request.headers.get("origin");
  const allowed = new Set(
    (process.env["VECIBOT_ALLOWED_ORIGINS"] || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin && origin !== new URL(request.url).origin && !allowed.has(origin))
    return Response.json(
      { error: "Este origen no está autorizado para usar VeciBot." },
      { status: 403, headers },
    );
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Lovable-AIG-Run-ID",
    );
    headers.set(
      "Access-Control-Expose-Headers",
      "X-Lovable-AIG-Run-ID, x-vercel-ai-ui-message-stream",
    );
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  let response: Response;
  try {
    if (request.method !== "POST") throw new InputError(405, "Usa POST para enviar mensajes.");
    response = await handler();
  } catch (error) {
    response = inputErrorResponse(error);
  }
  const merged = new Headers(response.headers);
  headers.forEach((value, key) => merged.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
