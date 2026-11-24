// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { handleLocalApi } from "@/server/local/http";
import { seedAccount } from "@/server/local/seed";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-account";
import type { Product, Sale } from "@/lib/queries";

async function api<T>(path: string, method = "GET", body?: unknown, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await handleLocalApi(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return {
    status: response.status,
    data: (await response.json()) as T,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

beforeAll(() => {
  vi.stubEnv("AYUDATEVECI_DB", ":memory:");
});

describe("AyúdateVeci con SQLite", () => {
  it("revisa y confirma compras y fiados, evita duplicados, refleja cobros y revierte stock al anular", async () => {
    expect(seedAccount()).toBe(true);
    expect(seedAccount()).toBe(false);
    const anonymous = await api("/api/local/products");
    expect(anonymous.status).toBe(401);
    const demo = await api("/api/local/session", "POST", {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(demo.status).toBe(200);
    const cookie = demo.cookie;
    expect(cookie).toBeDefined();
    const readProducts = () =>
      api<Product[]>("/api/local/products", "GET", undefined, cookie).then((result) => result.data);
    const readSales = () =>
      api<Sale[]>("/api/local/sales", "GET", undefined, cookie).then((result) => result.data);
    const before = await readProducts();
    const pan = before.find((p) => p.name === "Pan de agua")!;
    const leche = before.find((p) => p.name.startsWith("Leche"))!;
    const draft = await api<{ draft: { intent: string; party: string; items: unknown[] } }>(
      "/api/vecibot",
      "POST",
      {
        text: "Vendí tres panes a dos reales fiado a Doña Rosa",
      },
      cookie,
    );
    expect(draft.data.draft).toMatchObject({
      intent: "REGISTRAR_FIADO",
      party: "Doña Rosa",
      items: [{ productId: pan.id, quantity: "3", price: "0.2" }],
    });
    expect(await readProducts()).toEqual(before);

    const payload = {
      customer: "Doña Rosa",
      key: randomUUID(),
      items: [{ product_id: pan.id, quantity: 3, unit_price: 0.2 }],
    };
    const sale = await api<string>("/api/local/sales", "POST", payload, cookie);
    expect(sale.status).toBe(201);
    expect((await api<string>("/api/local/sales", "POST", payload, cookie)).data).toBe(sale.data);
    expect((await readProducts()).find((p) => p.id === pan.id)?.quantity).toBe(pan.quantity - 3);
    expect((await readSales()).find((s) => s.id === sale.data)).toMatchObject({
      total: 0.6,
      total_cost: 0.33,
      credit_status: "Pendiente",
    });
    const paid = await api(`/api/local/sales/${sale.data}/paid`, "PATCH", {}, cookie);
    expect(paid.status).toBe(200);
    expect((await readSales()).find((s) => s.id === sale.data)?.credit_status).toBe("Pagado");

    const failed = await api(
      "/api/local/sales",
      "POST",
      {
        items: [
          { product_id: leche.id, quantity: 1 },
          { product_id: pan.id, quantity: 9999 },
        ],
      },
      cookie,
    );
    expect(failed.status).toBe(409);
    expect((await readProducts()).find((p) => p.id === leche.id)?.quantity).toBe(leche.quantity);

    const invoice = await api<{ draft: unknown }>(
      "/api/vecibot",
      "POST",
      {
        text: "Registrar compra",
        attachment_name: "factura-demo.pdf",
        attachment_text:
          "Página 1:\nFACTURA DE DEMOSTRACIÓN\nProveedor: Tienda La Esquina\nLeche\t4\t0,91\nTotal: $3,64",
      },
      cookie,
    );
    expect(invoice.data.draft).toMatchObject({
      intent: "REGISTRAR_COMPRA",
      party: "Tienda La Esquina",
      items: [{ productId: leche.id, quantity: "4", price: "0.91" }],
    });
    const purchase = await api<string>(
      "/api/local/purchases",
      "POST",
      {
        supplier: "Tienda La Esquina",
        update_cost: true,
        items: [{ product_id: leche.id, quantity: 4, unit_price: 0.91 }],
      },
      cookie,
    );
    expect(purchase.status).toBe(201);
    expect((await readProducts()).find((p) => p.id === leche.id)).toMatchObject({
      quantity: leche.quantity + 4,
      purchase_price: 0.91,
    });
    expect(
      (
        await api(
          `/api/local/purchases/${purchase.data}`,
          "PATCH",
          {
            update_cost: true,
            items: [{ product_id: leche.id, quantity: 5, unit_price: 0.95 }],
          },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect((await readProducts()).find((p) => p.id === leche.id)).toMatchObject({
      quantity: leche.quantity + 5,
      purchase_price: 0.95,
    });
    expect(
      (await api(`/api/local/purchases/${purchase.data}`, "DELETE", undefined, cookie)).status,
    ).toBe(200);
    expect((await api(`/api/local/sales/${sale.data}`, "DELETE", undefined, cookie)).status).toBe(
      200,
    );
    expect((await readProducts()).find((p) => p.id === leche.id)).toMatchObject({
      quantity: leche.quantity,
      purchase_price: leche.purchase_price,
    });
    expect((await readProducts()).find((p) => p.id === pan.id)?.quantity).toBe(pan.quantity);

    const second = await api("/api/local/accounts", "POST", {
      owner_name: "Ana",
      tienda: "Nueva",
      store_name: "Otra tienda",
      barrio: "Bellavista",
      email: "ana@example.test",
      password: "solo-pruebas-2026",
    });
    expect(second.status).toBe(201);
    expect((await api("/api/local/products", "GET", undefined, second.cookie)).data).toEqual([]);
    expect(
      (await api(`/api/local/products/${pan.id}`, "DELETE", undefined, second.cookie)).status,
    ).toBe(404);
  });
});
