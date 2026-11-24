import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/app.vecibot";
import { parseVeciBot } from "@/lib/vecibotParser.js";

const mocks = vi.hoisted(() => ({
  products: [
    { id: "pan", name: "Pan de agua", unit: "unidad", purchase_price: 0.11, sale_price: 0.2 },
    {
      id: "leche",
      name: "Leche entera 1 L",
      unit: "funda",
      purchase_price: 0.86,
      sale_price: 1.12,
    },
  ],
  fetch: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  chatQuery: { queryKey: ["chat"] },
  storeQuery: { queryKey: ["store"] },
  productsQuery: { queryKey: ["products"] },
  useRefreshBusiness: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "chat"
        ? []
        : queryKey[0] === "store"
          ? { store: { id: "tienda-demo" } }
          : mocks.products,
    refetch: mocks.refetch,
  }),
}));

vi.mock("@/lib/vecibot-attachment-storage", () => ({
  saveMessageFiles: vi.fn().mockResolvedValue(undefined),
  loadMessageFiles: vi.fn().mockResolvedValue([]),
  clearMessageFiles: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = vi.fn(() => "blob:factura");
      static override revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(Route, "useSearch").mockReturnValue({});
  mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url !== "/api/vecibot") return Response.json("saved");
    const body = JSON.parse(String(init?.body));
    const text = body.manual_invoice ? "Registrar compra" : body.text;
    return Response.json({
      id: body.client_id,
      answer: "",
      draft: parseVeciBot(text, mocks.products),
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openChat() {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
}

it("pide confirmación antes de guardar, permite corregir una cantidad y usa la misma API que Ventas", async () => {
  openChat();
  expect(
    screen.getByText("¡Hola Veci! ¿Qué vendimos, compramos o qué necesitas revisar hoy?"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Modo Demo" }));
  fireEvent.click(screen.getByRole("button", { name: "Venta por voz simulada" }));
  expect(await screen.findByText("Revisar venta")).toBeVisible();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getAllByLabelText(/Cantidad/)[0]!, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar y Guardar" }));
  await screen.findByText(/Venta registrada por/);
  const [url, init] = mocks.fetch.mock.calls[1]!;
  expect(url).toBe("/api/local/sales");
  expect(JSON.parse(init.body).items).toEqual([
    { product_id: "leche", quantity: 3, unit_price: 1.12 },
    { product_id: "pan", quantity: 5, unit_price: 0.2 },
  ]);
});

it("muestra el cliente del fiado y permite cancelar sin guardar", async () => {
  openChat();
  fireEvent.click(screen.getByRole("button", { name: "Modo Demo" }));
  fireEvent.click(screen.getByRole("button", { name: "Fiado de Doña Rosa" }));
  expect(await screen.findByLabelText("Cliente del fiado")).toHaveValue("Doña Rosa");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByText("Registro cancelado.")).toBeVisible();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it("muestra la foto y abre una compra editable sin enviar la imagen al servidor", async () => {
  openChat();
  const photo = new File(["imagen"], "cuaderno.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Archivo de factura"), { target: { files: [photo] } });
  expect(await screen.findByAltText("Vista previa de la factura o cuaderno")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Revisar compra")).toBeVisible();
  expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toMatchObject({
    text: "",
    manual_invoice: true,
    attachment_name: "cuaderno.png",
    attachment_text: "",
  });
});
