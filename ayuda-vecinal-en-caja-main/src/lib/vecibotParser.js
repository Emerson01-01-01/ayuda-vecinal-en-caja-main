const words = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
};
const number = `(?:\\d+(?:[.,]\\d{1,2})?|${Object.keys(words).join("|")})`;
const units =
  "fundas?|libras?|cubetas?|quintal(?:es)?|botellas?|cajas?|unidades?|latas?|sobres?|barras?|kilos?|paquetes?";
const singular = (word) =>
  ({ quintales: "quintal", panes: "pan", unidades: "unidad" })[word] ?? word.replace(/s$/, "");
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const numberValue = (value) => words[value] ?? Number(value.replace(",", "."));
const tokens = (value) =>
  normalize(value)
    .match(/[a-z0-9]+/g)
    ?.filter((word) => !["de", "del", "la", "el"].includes(word))
    .map(singular) ?? [];

const saleLead =
  /^(?:(?:registra(?:r)?|anota(?:r)?)\s+(?:una?\s+)?)?(?:venta\b|vendi\b|vendemos\b|vendimos\b|despache\b|salieron\b|fiado\b|fie\b|credito\b)\s*[:\-]?\s*/;
const purchaseLead =
  /^(?:(?:registra(?:r)?|anota(?:r)?)\s+(?:una?\s+)?)?(?:compra\b|compre\b|compramos\b|recibi\b|ingresaron\b|llegaron\b|factura\b)\s*[:\-]?\s*/;

function findProduct(description, unit, products) {
  const lookup = tokens(description);
  const candidates = products.filter((p) => {
    const name = tokens(p.name);
    return lookup.length && lookup.every((word) => name.includes(word));
  });
  const compatible = unit
    ? candidates.filter(
        (p) =>
          singular(normalize(p.unit)) === unit ||
          (unit === "unidad" && !/^(?:libra|quintal|kilo)$/.test(normalize(p.unit))),
      )
    : candidates;
  const exact = compatible.find((p) => tokens(p.name).join(" ") === lookup.join(" "));
  return exact ?? (compatible.length === 1 ? compatible[0] : null);
}

const priced = new RegExp(
  `(?:\\ba\\s+\\$?\\s*|\\$\\s*)(${number})(?:\\s*(dolar(?:es)?|real(?:es)?|centavos?)(?:\\s+con\\s+(${number})\\s*centavos?)?)?(?:\\s*(?:c\\s*/\\s*u|cada\\s+un[oa]))?\\s*$|\\b(${number})\\s*(dolar(?:es)?|real(?:es)?|centavos?)(?:\\s+con\\s+(${number})\\s*centavos?)?(?:\\s*(?:c\\s*/\\s*u|cada\\s+un[oa]))?\\s*$`,
);
const quantityPrefix = new RegExp(`^(${number})(?:\\s*[x×]\\s*|\\s+)`);
const unitPrefix = new RegExp(`^(${units})\\s+de\\s+`);
const separated = /\r?\n|;\s*|\s+\+\s+|\s+y\s+(?!\d+\s*centavos\b)|,\s+(?!\d{1,2}(?:\s|$))/;

function parseItem(source, products, compra) {
  let text = normalize(source)
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/^[-•]\s*/, "");
  if (
    !text ||
    /^(?:total|subtotal|iva|pagina|factura de demostracion|producto\b.*cantidad|cantidad\b.*producto|fecha|ruc|factura\s*(?:nro|no|#|\d))\b/.test(
      text,
    )
  )
    return null;
  const tabular = text
    .split(/\t+|\s*;\s*|,(?=\s*[^\d])|,(?=\s*\d+(?=,))/)
    .map((value) => value.trim());
  const tableNameFirst =
    tabular.length >= 2 &&
    !Number.isFinite(numberValue(tabular[0])) &&
    Number.isFinite(numberValue(tabular[1]));
  const tableQtyFirst =
    tabular.length >= 2 &&
    Number.isFinite(numberValue(tabular[0])) &&
    !Number.isFinite(numberValue(tabular[1]));
  if (tableNameFirst || tableQtyFirst) {
    const [name, qty] = tableNameFirst ? [tabular[0], tabular[1]] : [tabular[1], tabular[0]];
    text = `${qty} ${name}${tabular[2] ? " a " + tabular[2] : ""}`;
  }
  const cost = priced.exec(text);
  let price = null;
  if (cost) {
    const currency = cost[2] || cost[5];
    const amount = numberValue(cost[1] || cost[4]);
    price = currency?.startsWith("real")
      ? amount / 10
      : currency?.startsWith("centavo")
        ? amount / 100
        : amount + (cost[3] || cost[6] ? numberValue(cost[3] || cost[6]) / 100 : 0);
    text = text.slice(0, cost.index).trim();
  }
  const count = quantityPrefix.exec(text);
  if (count) text = text.slice(count[0].length);
  const packaging = unitPrefix.exec(text);
  const product = findProduct(text, null, products);
  const name = packaging ? text.slice(packaging[0].length) : text;
  const unit = packaging ? singular(packaging[1]) : null;
  const selected = unit ? findProduct(name, unit, products) : product;
  return {
    productId: selected?.id ?? "",
    // Keep the received description visible, especially if an explicit unit needs review.
    description: text,
    quantity: count ? String(numberValue(count[1])) : "",
    price: String(
      price ?? (selected ? (compra ? selected.purchase_price : selected.sale_price) : ""),
    ),
  };
}

function consultation(text) {
  if (/agot|stock|acabando|repon|faltan|inventario/.test(text)) return "stock";
  if (/gane|ganancia|utilidad|beneficio/.test(text)) return "profit";
  if (/mas vend|mayor rotacion|populares/.test(text)) return "top";
  if (/deben|debe\b|deuda|por cobrar|fiados\b/.test(text)) return "debts";
  if (/vend[iom]|ventas|facture|ingreso/.test(text)) return "sales";
  if (/combo|promo/.test(text)) return "combos";
  return "help";
}

export function parseVeciBot(message, products, sourceText = "") {
  const original = message.trim().replace(/^\s*[¡!]+\s*/, "");
  const prompt = normalize(original);
  const attachment = sourceText.trim();
  const pregunta =
    /^[¿?]|^(?:que\b|cuanto\b|quien\b|cual\b|como\b|muestra\b|dime\b|revisa\b)/.test(prompt) ||
    prompt.endsWith("?");
  const compra = purchaseLead.test(prompt) || Boolean(attachment);
  const fiado = !compra && /\b(?:fiad[oa]|fie|a credito|al credito|credito)\b/.test(prompt);
  const venta = saleLead.test(prompt) || /^(?:le\s+)?vendi\b/.test(prompt);
  if ((!attachment && pregunta) || (!compra && !fiado && !venta)) {
    return {
      intent: "CONSULTA_NEGOCIO",
      query: consultation(prompt),
      period: /mes\b/.test(prompt) ? "mes" : /semana|7 dias/.test(prompt) ? "semana" : "dia",
    };
  }

  const intent = compra ? "REGISTRAR_COMPRA" : fiado ? "REGISTRAR_FIADO" : "REGISTRAR_VENTA";
  let body = original;
  let party = "";
  const partyPatterns = compra
    ? [
        /(?:^|\s)proveedor\s*:\s*(.+?)(?=[\n;]|$)/i,
        /\s+(?:a|de)\s+([A-ZÁÉÍÓÚÑ][\p{L}\s.-]{1,110})$/u,
      ]
    : fiado
      ? [
          /\b(?:fiad[oa]|cr[eé]dito)\s+(?:a|para)\s+([^\n;]+)$/i,
          /\s+para\s+([^\n;]+)$/i,
          /\s+a\s+((?!credito\b|crédito\b)[\p{L}][\p{L}\s.\x27-]{1,110})(?:\s+(?:fiado|a cr[eé]dito))?$/iu,
        ]
      : [];
  for (const pattern of partyPatterns) {
    const found = pattern.exec(body);
    if (!found) continue;
    party = found[1]
      .trim()
      .replace(/\s+(?:fiado|a cr[eé]dito)$/i, "")
      .replace(/[.,:]$/, "");
    body = body.replace(found[0], "");
    break;
  }
  if (compra && !party && attachment) {
    party = /^\s*proveedor\s*:\s*(.+)$/im.exec(attachment)?.[1]?.trim() ?? "";
  }

  body = normalize(body).replace(/^le\s+/, "");
  body = body
    .replace(compra ? purchaseLead : saleLead, "")
    .replace(/\b(?:fiad[oa]|al? credito)\b/g, "")
    .replace(/\s+por\s+(?:un\s+)?total.*$/, "")
    .trim();
  const rows = (attachment || body).split(/\r?\n/).flatMap((row) => {
    if (row.includes("\t")) return [row];
    if (/^[^;]+;\s*\d+;/.test(row)) return [row];
    if (/^[^,]+,\s*\d+,/.test(row)) return [row.replace(/,\s*(?=\d+(?:[.,]\d+)?(?:,|$))/g, "\t")];
    return row.split(separated);
  });
  const items = rows
    .filter((row) => !/^\s*proveedor\s*:/i.test(row))
    .map((row) => parseItem(row, products, compra))
    .filter(Boolean)
    .slice(0, 100);
  return { intent, party, items };
}
