export type MovementIntent = "REGISTRAR_VENTA" | "REGISTRAR_FIADO" | "REGISTRAR_COMPRA";
export interface DraftLine {
  productId: string;
  description: string;
  quantity: string;
  price: string;
}
export interface MovementDraft {
  intent: MovementIntent;
  party: string;
  items: DraftLine[];
}
export interface Consultation {
  intent: "CONSULTA_NEGOCIO";
  query: "stock" | "profit" | "top" | "debts" | "sales" | "combos" | "help";
  period: "dia" | "semana" | "mes";
}
export function parseVeciBot(
  message: string,
  products: {
    id: string;
    name: string;
    unit: string;
    purchase_price: number;
    sale_price: number;
  }[],
  sourceText?: string,
): MovementDraft | Consultation;
