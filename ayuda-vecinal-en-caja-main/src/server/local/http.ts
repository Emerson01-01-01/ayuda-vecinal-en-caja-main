import { ZodError } from "zod";
import {
  applyMinStock,
  changePassword,
  closeSession,
  login,
  openSession,
  register,
  sessionUser,
  store,
  updateStore,
} from "./auth.ts";
import {
  adjustProduct,
  clearStore,
  expenses,
  movements,
  products,
  removeExpense,
  removeProduct,
  saveExpense,
  saveProduct,
} from "./business.ts";
import { LocalError } from "./db.ts";
import { collectDebt, purchases, removeLedger, sales, writeLedger } from "./ledger.ts";
import { loadDemo } from "./seed.ts";
import { localVecibot } from "./vecibot.ts";

function respond(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(data, { status, headers });
}

export async function handleLocalApi(request: Request) {
  const url = new URL(request.url);
  const { method } = request;
  try {
    const absolutePath = url.pathname.replace(/\/$/, "");
    const chat = absolutePath === "/api/vecibot";
    if (!chat && !absolutePath.startsWith("/api/local/"))
      return respond({ message: "Ruta no disponible en el modo local." }, 404);
    const [resource, id, action, ...rest] = absolutePath.slice("/api/local/".length).split("/");
    if (!chat && (rest.length || (action && !(resource === "sales" && action === "paid")))) {
      return respond({ message: "Ruta no disponible." }, 404);
    }

    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return respond({ message: "La solicitud debe venir de AyúdateVeci." }, 403);
      }
    }
    let body: unknown;
    if (method === "POST" || method === "PATCH") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new LocalError("Envía los datos en JSON.", 415);
      body = await readBody(request);
    }

    if (!chat && !id && resource === "session") {
      if (method === "GET") return respond(sessionUser(request));
      if (method === "POST") {
        const user = login(body);
        return respond(user, 200, openSession(request, user.id));
      }
      if (method === "DELETE") return respond(null, 200, closeSession(request));
    }
    if (!chat && !id && resource === "accounts" && method === "POST") {
      const user = register(body);
      return respond(user, 201, openSession(request, user.id));
    }

    const user = sessionUser(request)?.id;
    if (!user) throw new LocalError("Inicia sesión para acceder a tu tienda.", 401);
    if (chat) return respond(localVecibot(user, method, body));

    if (resource === "store" && !id) {
      if (method === "GET") return respond(store(user));
      if (method === "PATCH") return respond(updateStore(user, body) ?? null);
      if (method === "DELETE") return respond(clearStore(user) ?? null);
    }
    if (resource === "password" && !id && method === "PATCH")
      return respond(null, 200, changePassword(request, user, body));
    if (resource === "demo" && !id && method === "POST") return respond(loadDemo(user) ?? null);
    if (resource === "stock-minimum" && !id && method === "PATCH")
      return respond(applyMinStock(user, body) ?? null);
    if (resource === "movements" && !id && method === "GET") return respond(movements(user));
    if (resource === "products") {
      if (!id && method === "GET") return respond(products(user));
      if (!id && method === "POST") return respond(saveProduct(user, body), 201);
      if (id && method === "PATCH") return respond(saveProduct(user, body, id));
      if (id && method === "DELETE") return respond(removeProduct(user, id) ?? null);
    }
    if (resource === "stock" && id && method === "PATCH")
      return respond(adjustProduct(user, id, body) ?? null);
    if (resource === "expenses") {
      if (!id && method === "GET") return respond(expenses(user));
      if (!id && method === "POST") return respond(saveExpense(user, body) ?? null, 201);
      if (id && method === "PATCH") return respond(saveExpense(user, body, id) ?? null);
      if (id && method === "DELETE") return respond(removeExpense(user, id) ?? null);
    }
    if (resource === "sales" || resource === "purchases") {
      if (id && action === "paid" && method === "PATCH")
        return respond(collectDebt(user, id) ?? null);
      if (!action) {
        if (!id && method === "GET")
          return respond(resource === "sales" ? sales(user) : purchases(user));
        if (!id && method === "POST") return respond(writeLedger(user, resource, body), 201);
        if (id && method === "PATCH") return respond(writeLedger(user, resource, body, id));
        if (id && method === "DELETE") return respond(removeLedger(user, resource, id) ?? null);
      }
    }
    return respond({ message: "Ruta no disponible." }, 404);
  } catch (error) {
    if (error instanceof LocalError) return respond({ message: error.message }, error.status);
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return respond(
        {
          message: issue?.path.length
            ? `Revisa el campo ${issue.path.join(".")}: ${issue.message}`
            : (issue?.message ?? "Revisa los datos."),
        },
        400,
      );
    }
    console.error(error);
    return respond({ message: "No pude guardar o consultar tus datos locales." }, 500);
  }
}

async function readBody(request: Request) {
  const limit = 128 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new LocalError("La entrada es demasiado larga.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LocalError("Faltan los datos.");
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new LocalError("La entrada es demasiado larga.", 413);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new LocalError("Los datos JSON no son válidos.");
  }
}
