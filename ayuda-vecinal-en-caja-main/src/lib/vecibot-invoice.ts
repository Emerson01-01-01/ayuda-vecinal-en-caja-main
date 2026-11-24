import { extractLocalFile } from "./vecibot-local-files";

export const invoiceAccept = "image/jpeg,image/png,image/webp,.pdf,.xlsx,.csv";
export const maxInvoiceBytes = 5 * 1024 * 1024;

export function invoiceKind(file: File) {
  if (/\.(jpe?g|png|webp)$/i.test(file.name) || /^(image\/(jpeg|png|webp))$/.test(file.type))
    return "image";
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf";
  if (/\.xlsx$/i.test(file.name)) return "xlsx";
  if (/\.csv$/i.test(file.name)) return "csv";
  return null;
}

export async function invoiceText(file: File) {
  const kind = invoiceKind(file);
  if (!kind || file.size > maxInvoiceBytes)
    throw new Error("Elige una foto JPEG, PNG, WebP, un PDF, XLSX o CSV de hasta 5 MB.");
  if (kind === "image") return "";
  if (kind === "xlsx") return readWorkbook(file);
  if (kind === "csv") return file.slice(0, 65536).text().then(csvAsRows);
  return (await extractLocalFile(file)).text;
}

function csvAsRows(text: string) {
  const rows = text
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const sample = rows.find((row) => !/^proveedor\s*:/i.test(row.trim())) ?? "";
  const delimiter = sample.includes(";") ? ";" : sample.includes("\t") ? "\t" : ",";
  const field = new RegExp(`(?:^|${delimiter})(?:"((?:[^"]|"")*)"|([^${delimiter}]*))`, "g");
  return rows
    .slice(0, 101)
    .map((row) =>
      Array.from(row.matchAll(field), (match) =>
        (match[1]?.replace(/""/g, '"') ?? match[2] ?? "").trim(),
      ).join("\t"),
    )
    .join("\n")
    .slice(0, 16000);
}

async function readWorkbook(file: File) {
  const { unzipSync } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: ({ name, originalSize }) =>
      /^(?:xl\/sharedStrings\.xml|xl\/worksheets\/sheet1\.xml)$/.test(name) &&
      originalSize <= 2_000_000,
  });
  const sheet = archive["xl/worksheets/sheet1.xml"];
  if (!sheet)
    throw new Error(
      "No pude leer la primera hoja. Guarda los productos en la primera hoja o exporta a CSV.",
    );
  const xml = (bytes: Uint8Array) => {
    const value = new DOMParser().parseFromString(
      new TextDecoder().decode(bytes),
      "application/xml",
    );
    if (value.querySelector("parsererror")) throw new Error("La hoja de Excel está dañada.");
    return value;
  };
  const elements = (node: Document | Element, name: string) =>
    Array.from(node.getElementsByTagNameNS("*", name));
  const shared = archive["xl/sharedStrings.xml"];
  const strings = shared
    ? elements(xml(shared), "si").map((si) =>
        elements(si, "t")
          .map((t) => t.textContent)
          .join(""),
      )
    : [];
  const rows = elements(xml(sheet), "row").slice(0, 101);
  return rows
    .map((row) => {
      const values: string[] = [];
      for (const cell of elements(row, "c")) {
        const letters = /^[A-Z]+/.exec(cell.getAttribute("r") ?? "")?.[0];
        const index = letters
          ? Array.from(letters).reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1
          : values.length;
        if (index >= 4) continue;
        const value = elements(cell, "v")[0]?.textContent ?? "";
        values[index] =
          cell.getAttribute("t") === "s"
            ? (strings[Number(value)] ?? "")
            : cell.getAttribute("t") === "inlineStr"
              ? elements(cell, "t")
                  .map((t) => t.textContent)
                  .join("")
              : value;
      }
      return values.join("\t");
    })
    .join("\n")
    .slice(0, 16000);
}
