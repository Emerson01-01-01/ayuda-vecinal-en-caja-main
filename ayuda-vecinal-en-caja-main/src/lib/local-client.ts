import type { MovementDraft } from "./vecibotParser.js";

export type LocalUser = { id: string; email: string };
export type ChatEntry = { id: string; role: "user" | "assistant"; content: string };
export type LedgerInput = {
  items: { product_id: string; quantity: number; unit_price?: number }[];
  key?: string;
  customer?: string;
  supplier?: string;
  notes?: string;
  date?: string;
  update_cost?: boolean;
};

async function request<T>(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(data?.message ?? "No pude acceder al servidor local.");
  return data as T;
}

const local = <T>(resource: string, method?: string, body?: unknown) =>
  request<T>(`/api/local/${resource}`, method, body);

async function mutation<T>(work: Promise<T>) {
  try {
    return { data: await work, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("No pude completar la operación."),
    };
  }
}

export const localAuth = {
  session: () => local<LocalUser | null>("session"),
  login: (body: { email: string; password: string }) =>
    mutation(local<LocalUser>("session", "POST", body)),
  register: (body: {
    email: string;
    password: string;
    owner_name: string;
    store_name: string;
    barrio: string;
  }) => mutation(local<LocalUser>("accounts", "POST", body)),
  logout: () => mutation(local("session", "DELETE")),
  password: (body: { password: string; current_password: string }) =>
    mutation(local("password", "PATCH", body)),
};

export const businessApi = {
  read: <T>(resource: string) => local<T>(resource),
  save: <T = null>(resource: string, body: unknown, id?: string) =>
    mutation(
      local<T>(
        id ? `${resource}/${encodeURIComponent(id)}` : resource,
        id ? "PATCH" : "POST",
        body,
      ),
    ),
  patch: (resource: string, body: unknown) => mutation(local(resource, "PATCH", body)),
  remove: (resource: string, id?: string) =>
    mutation(local(id ? `${resource}/${encodeURIComponent(id)}` : resource, "DELETE")),
  ledger: (resource: "sales" | "purchases", body: LedgerInput, id?: string) =>
    businessApi.save<string>(resource, body, id),
  paid: (id: string) => mutation(local(`sales/${encodeURIComponent(id)}/paid`, "PATCH", {})),
};

export const chatApi = {
  history: () => request<ChatEntry[]>("/api/vecibot"),
  send: (body: {
    text: string;
    client_id: string;
    attachment_text?: string;
    attachment_name?: string;
    manual_invoice?: boolean;
  }) =>
    request<{ id: string; answer: string; draft: MovementDraft | null }>(
      "/api/vecibot",
      "POST",
      body,
    ),
  clear: () => request("/api/vecibot", "DELETE"),
};
