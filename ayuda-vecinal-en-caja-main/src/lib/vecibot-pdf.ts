import { plainChatText } from "./vecibot-text";

export interface PdfStore {
  name: string;
  barrio: string;
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  has_demo_data: boolean;
}

/** Loaded only when exporting, so the chat doesn't load PDF libraries upfront. */
export async function createVecibotPdf(text: string, store: PdfStore, now = new Date()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 18;
  const width = 174;
  let y = 20;
  const clean = (value: string) =>
    plainChatText(value).replace(/[^\x09\x0A\x0D\x20-\xFF\u20AC]/g, "");
  const write = (value: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(value), width) as string[];
    const step = size * 0.45 + 1;
    for (const line of lines) {
      if (y + step > 274) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += step;
    }
    y += 2;
  };
  doc.setProperties({
    title: `VeciBot - ${store.name}`,
    author: store.name,
    subject: "Reporte de la tienda",
  });
  doc.setTextColor(23, 50, 75);
  write(store.name, 18, true);
  write("VeciBot | Reporte de la tienda", 11, true);
  doc.setTextColor(60, 60, 60);
  const details = [store.address, store.barrio, store.phone, store.contact_email]
    .filter(Boolean)
    .join(" · ");
  if (details) write(details, 9);
  write(
    `Generado: ${new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" }).format(now)}`,
    9,
  );
  if (store.has_demo_data) write("Incluye datos ficticios de demostración.", 10, true);
  y += 4;

  const lines = text.replace(/\r/g, "").split("\n");
  const tableRow = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => clean(cell.trim()));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[index + 1] || "")) {
      const head = tableRow(line);
      const body: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|")) {
        body.push(tableRow(lines[index]!));
        index++;
      }
      index--;
      autoTable(doc, {
        head: [head],
        body,
        startY: y,
        margin: { top: 20, bottom: 23, left: margin, right: margin },
        styles: { font: "helvetica", fontSize: 9, overflow: "linebreak", cellPadding: 2.5 },
        headStyles: { fillColor: [23, 50, 75] },
        theme: "striped",
      });
      y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    } else if (line.trim()) {
      write(
        line,
        /^#{1,6}\s/.test(line) ? 13 : 11,
        /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*$/.test(line.trim()),
      );
    } else y += 3;
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      "Generado por VeciBot. Revisa los datos. Facturas: borrador para revisión.",
      margin,
      284,
    );
    doc.text(`${page} / ${count}`, 192, 290, { align: "right" });
  }
  return doc;
}

export async function downloadVecibotPdf(text: string, store: PdfStore) {
  const doc = await createVecibotPdf(text, store);
  const slug =
    store.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "tienda";
  await doc.save(
    `vecibot-${slug}-${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date())}.pdf`,
    { returnPromise: true },
  );
}
