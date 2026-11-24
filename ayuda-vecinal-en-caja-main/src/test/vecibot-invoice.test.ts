import { File as NodeFile } from "node:buffer";
import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { invoiceText } from "@/lib/vecibot-invoice";
import { parseVeciBot } from "@/lib/vecibotParser.js";

const products = [
  { id: "leche", name: "Leche entera 1 L", unit: "funda", purchase_price: 0.86, sale_price: 1.12 },
];

it("lee la primera hoja XLSX y conserva el costo unitario", async () => {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const bytes = zipSync({
    "xl/sharedStrings.xml": strToU8(`<sst xmlns="${namespace}"><si><t>Leche</t></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet xmlns="${namespace}"><sheetData><row r="1">
      <c r="A1" t="s"><v>0</v></c><c r="B1"><v>4</v></c><c r="C1"><v>0.91</v></c>
    </row></sheetData></worksheet>`),
  });
  const file = new NodeFile([bytes], "factura.xlsx");
  const text = await invoiceText(file as unknown as File);
  expect(parseVeciBot("Registrar compra", products, text)).toMatchObject({
    intent: "REGISTRAR_COMPRA",
    items: [{ productId: "leche", price: "0.91", quantity: "4" }],
  });
});

it("conserva comas decimales en un CSV de Excel", async () => {
  const file = new NodeFile(["Producto;Cantidad;Costo unitario\r\nLeche;4;0,91"], "factura.csv");
  const text = await invoiceText(file as unknown as File);
  expect(parseVeciBot("Registrar compra", products, text)).toMatchObject({
    intent: "REGISTRAR_COMPRA",
    items: [{ productId: "leche", price: "0.91", quantity: "4" }],
  });
});
