import {
  Bot,
  BookOpen,
  Boxes,
  ChartColumnBig,
  House,
  Lightbulb,
  Package,
  ShoppingCart,
  Settings,
  Truck,
  Wallet,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/app", label: "Inicio", icon: House, exact: true },
  { to: "/app/productos", label: "Productos", icon: Package },
  { to: "/app/ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/app/fiados", label: "Fiados", icon: BookOpen },
  { to: "/app/compras", label: "Compras", icon: Truck },
  { to: "/app/gastos", label: "Gastos", icon: Wallet },
  { to: "/app/inventario", label: "Inventario", icon: Boxes },
  { to: "/app/reportes", label: "Reportes", icon: ChartColumnBig },
  { to: "/app/recomendaciones", label: "Recomendaciones", icon: Lightbulb },
  { to: "/app/vecibot", label: "VeciBot", icon: Bot },
  { to: "/app/configuracion", label: "Configuración", icon: Settings },
] as const;

export const MOBILE_TABS = ["/app", "/app/ventas", "/app/productos", "/app/vecibot"] as const;
