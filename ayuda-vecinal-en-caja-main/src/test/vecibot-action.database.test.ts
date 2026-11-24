// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const owner1 = "10000000-0000-4000-8000-000000000001";
const owner2 = "10000000-0000-4000-8000-000000000002";
const store1 = "20000000-0000-4000-8000-000000000001";
const store2 = "20000000-0000-4000-8000-000000000002";
const product1 = "30000000-0000-4000-8000-000000000001";
const product2 = "30000000-0000-4000-8000-000000000002";
const requestId = "40000000-0000-4000-8000-000000000001";
const db = new PGlite();

// Minimal existing database contract. The migration itself is executed verbatim.
const bootstrap = `
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE FUNCTION public.current_store_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT id FROM public.stores WHERE owner_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_store_owner(_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = _store_id AND owner_id = auth.uid()) $$;
CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid REFERENCES stores(id),
  name text, category text, purchase_price numeric, sale_price numeric, quantity integer, min_stock integer, supplier text);
CREATE TABLE sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid REFERENCES stores(id));
CREATE TABLE purchases(LIKE sales INCLUDING ALL);
CREATE TABLE chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid REFERENCES stores(id), role text, content text);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_owner ON stores TO authenticated USING(owner_id = auth.uid()) WITH CHECK(owner_id = auth.uid());
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_owner ON products TO authenticated USING(public.is_store_owner(store_id)) WITH CHECK(public.is_store_owner(store_id));
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_owner ON sales TO authenticated USING(public.is_store_owner(store_id)) WITH CHECK(public.is_store_owner(store_id));
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_owner ON purchases TO authenticated USING(public.is_store_owner(store_id)) WITH CHECK(public.is_store_owner(store_id));
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_owner ON chat_messages TO authenticated USING(public.is_store_owner(store_id)) WITH CHECK(public.is_store_owner(store_id));
CREATE FUNCTION register_sale(_items jsonb, _notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE item jsonb; record_id uuid; available integer;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    SELECT quantity INTO available FROM products WHERE id = (item->>'product_id')::uuid FOR UPDATE;
    IF available < (item->>'quantity')::integer THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
    UPDATE products SET quantity = quantity - (item->>'quantity')::integer WHERE id = (item->>'product_id')::uuid;
  END LOOP;
  INSERT INTO sales(store_id) VALUES(current_store_id()) RETURNING id INTO record_id;
  RETURN record_id;
END $$;
CREATE FUNCTION register_purchase(_items jsonb, _notes text DEFAULT NULL, _purchase_date date DEFAULT CURRENT_DATE,
  _supplier text DEFAULT NULL, _update_cost boolean DEFAULT TRUE) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE item jsonb; record_id uuid;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    UPDATE products SET quantity = quantity + (item->>'quantity')::integer,
      purchase_price = CASE WHEN _update_cost THEN (item->>'unit_cost')::numeric ELSE purchase_price END
      WHERE id = (item->>'product_id')::uuid;
  END LOOP;
  INSERT INTO purchases(store_id) VALUES(current_store_id()) RETURNING id INTO record_id;
  RETURN record_id;
END $$;
`;

beforeAll(async () => {
  await db.exec(bootstrap);
  await db.exec(
    readFileSync(
      new URL("../../drizzle/migrations/0002_vecibot_multimedia.sql", import.meta.url),
      "utf8",
    ),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE vecibot_action_receipts, chat_messages, sales, purchases, products, stores CASCADE;
    INSERT INTO stores VALUES ('${store1}', '${owner1}'), ('${store2}', '${owner2}');
    INSERT INTO products(id,store_id,name,category,purchase_price,sale_price,quantity,min_stock) VALUES
      ('${product1}','${store1}','Leche','Lácteos',0.8,1.25,10,5),
      ('${product2}','${store2}','Pan','Abarrotes',0.1,0.2,20,5);
    SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${owner1}', false);`);
});
afterAll(async () => {
  await db.close();
});

const sale = (quantity = 2) => ({ intent: "venta", items: [{ product_id: product1, quantity }] });
async function apply(action: unknown, id = requestId) {
  return db.query<{ result: { id: string; message: string } }>(
    "SELECT public.apply_vecibot_action($1::uuid, $2::jsonb) AS result",
    [id, JSON.stringify(action)],
  );
}
async function stock() {
  return (
    await db.query<{ quantity: number }>("SELECT quantity FROM products WHERE id = $1", [product1])
  ).rows[0]!.quantity;
}

describe("RPC de VeciBot en PostgreSQL embebido", () => {
  it("registra una venta y solicitudes repetidas consumen stock una sola vez", async () => {
    const [first, second] = await Promise.all([apply(sale()), apply(sale())]);
    expect(first.rows[0]!.result.id).toBe(second.rows[0]!.result.id);
    expect(await stock()).toBe(8);
    expect((await db.query("SELECT * FROM sales")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM chat_messages")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM vecibot_action_receipts")).rows).toHaveLength(1);
  });
  it("rechaza reutilizar la misma entrada con otros datos", async () => {
    await apply(sale());
    await expect(apply(sale(3))).rejects.toThrow("otros datos");
    expect(await stock()).toBe(8);
  });
  it("devuelve el recibo de una venta aunque luego se elimine el producto", async () => {
    const first = await apply(sale());
    await db.query("DELETE FROM products WHERE id = $1", [product1]);
    const retry = await apply(sale());
    expect(retry.rows[0]!.result.id).toBe(first.rows[0]!.result.id);
    expect((await db.query("SELECT * FROM sales")).rows).toHaveLength(1);
  });
  it("revierte inventario y recibo cuando la venta excede el stock", async () => {
    await expect(apply(sale(11))).rejects.toThrow("Stock insuficiente");
    expect(await stock()).toBe(10);
    expect((await db.query("SELECT * FROM vecibot_action_receipts")).rows).toHaveLength(0);
    await apply(sale(1));
    expect(await stock()).toBe(9);
  });
  it("impide escribir productos de otra tienda incluso al llamar la RPC directamente", async () => {
    await expect(
      apply({ intent: "venta", items: [{ product_id: product2, quantity: 1 }] }),
    ).rejects.toThrow("no autorizado");
    expect((await db.query("SELECT * FROM products WHERE id = $1", [product2])).rows).toHaveLength(
      0,
    );
    await expect(
      db.query(
        "INSERT INTO vecibot_action_receipts(store_id,request_id,action) VALUES($1,$2,'{}')",
        [store2, requestId],
      ),
    ).rejects.toThrow();
  });
  it("delega compras y actualiza las existencias y el costo", async () => {
    await apply({
      intent: "compra",
      date: "2026-01-01",
      supplier: "Proveedor",
      items: [{ product_id: product1, quantity: 4, unit_cost: 0.9 }],
    });
    expect(await stock()).toBe(14);
    expect(
      (
        await db.query<{ purchase_price: string }>(
          "SELECT purchase_price FROM products WHERE id = $1",
          [product1],
        )
      ).rows[0]!.purchase_price,
    ).toBe("0.9");
    expect((await db.query("SELECT * FROM purchases")).rows).toHaveLength(1);
  });
  it("revierte un lote completo si un producto ya existe", async () => {
    const product = {
      name: "Arroz",
      category: "Abarrotes",
      purchase_price: 1,
      sale_price: 1.5,
      quantity: 3,
      min_stock: 2,
      supplier: null,
    };
    await expect(
      apply({ intent: "producto", products: [product, { ...product, name: "Leche" }] }),
    ).rejects.toThrow("ya existe");
    expect((await db.query("SELECT * FROM products WHERE name = 'Arroz'")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM vecibot_action_receipts")).rows).toHaveLength(0);
  });
  it("no inventa ceros para datos faltantes al invocar la función directamente", async () => {
    await expect(
      apply({
        intent: "producto",
        products: [
          { name: "Arroz", category: "Abarrotes", quantity: 1, min_stock: 0, sale_price: 1 },
        ],
      }),
    ).rejects.toThrow("Precio requerido");
    await expect(
      apply({ intent: "venta", items: [{ product_id: product1, quantity: 0.5 }] }),
    ).rejects.toThrow("entera requerida");
  });
  it("deniega la ejecución anónima y el resultado de la otra tienda", async () => {
    await apply(sale());
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${owner2}', false);`);
    expect((await db.query("SELECT * FROM vecibot_action_receipts")).rows).toHaveLength(0);
    await db.exec("SET ROLE anon;");
    await expect(apply(sale())).rejects.toThrow("permission denied");
  });
});
