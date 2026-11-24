export const APP_TIMEZONE = "America/Guayaquil";

export const PRODUCT_CATEGORIES = [
  "Bebidas",
  "Lácteos",
  "Snacks y golosinas",
  "Abarrotes",
  "Productos de limpieza",
  "Higiene personal",
  "Productos básicos",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const EXPENSE_CATEGORIES = [
  "Arriendo",
  "Servicios básicos",
  "Transporte",
  "Mantenimiento",
  "Otros gastos operativos",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Ejemplos de nombres de barrios; el campo acepta cualquier sector de Ecuador. */
export const BARRIO_SUGERENCIAS = [
  "Centro",
  "Bellavista",
  "La Primavera",
  "Los Álamos",
  "Las Acacias",
  "Los Pinos",
  "Santa Rosa",
  "24 de Mayo",
  "El Recreo",
];
