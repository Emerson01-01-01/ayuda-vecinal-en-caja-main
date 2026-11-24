// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createVecibotPdf } from "@/lib/vecibot-pdf";

describe("PDF real del chat", () => {
  it("genera PDF con datos españoles, tabla larga, saltos de página y numeración", async () => {
    const store = {
      name: "Tienda Doña María",
      barrio: "Riobamba",
      address: "Av. España 123",
      phone: "0990000000",
      contact_email: "tienda@example.test",
      has_demo_data: true,
    };
    const report = [
      "# Resumen de ventas",
      "Ganancia estimada: **$12,50**. Revisión de productos.",
      "",
      "| Producto | Cantidad | Valor |",
      "| --- | --- | --- |",
      ...Array.from({ length: 100 }, (_, index) => `| Café número ${index + 1} | 2 | $3,50 |`),
      "",
      "Última línea: información de la tienda.",
    ].join("\n");
    const doc = await createVecibotPdf(report, store, new Date("2026-11-16T03:00:00Z"));
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const pdf = doc.output();
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("/Title (VeciBot - Tienda Doña María)");
    const internal = doc.internal as typeof doc.internal & { pages: string[][] };
    const contents = internal.pages.flat().join("\n");
    expect(contents).toContain("Tienda Doña María");
    expect(contents).toContain("Av. España 123");
    expect(contents).toContain("15 nov 2026"); // Ecuador, not the host's local date.
    expect(contents).toContain("Café número 100");
    expect(contents).toContain("Última línea");
    expect(contents).toContain("datos ficticios de demostración");
    expect(contents).not.toContain("**");
    expect(contents).toContain(`${doc.getNumberOfPages()} / ${doc.getNumberOfPages()}`);
  });
});
