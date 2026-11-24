import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Lightbulb,
  Lock,
  MapPin,
  PackagePlus,
  Receipt,
  Wallet,
} from "lucide-react";

import vecibot from "@/assets/vecibot.png";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/conocer")({
  head: () => ({
    meta: [
      { title: "Conoce AyúdateVeci — Herramientas para tiendas de barrio" },
      {
        name: "description",
        content:
          "Descubre cómo AyúdateVeci ayuda a las tiendas de víveres de todo Ecuador con ventas, inventario, gastos, reportes y el asistente VeciBot.",
      },
      { property: "og:title", content: "Conoce AyúdateVeci" },
      {
        property: "og:description",
        content: "Ventas, compras, gastos, inventario, reportes y VeciBot en una sola app pensada para el celular.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Conocer,
});

const FEATURES = [
  { icon: Receipt, title: "Ventas en segundos", text: "Busca el producto, elige la cantidad y confirma. El inventario se descuenta solo." },
  { icon: Boxes, title: "Inventario al día", text: "Ve qué está por acabarse, qué está agotado y cuánto debes reponer." },
  { icon: PackagePlus, title: "Compras a proveedores", text: "Registra la mercadería que llega y actualiza existencias y costos." },
  { icon: Wallet, title: "Gastos del local", text: "Arriendo, luz, agua, transporte… separados de la compra de mercadería." },
  { icon: BarChart3, title: "Reportes claros", text: "Ventas, costo de lo vendido, ganancia bruta y resultado operativo por día, semana y mes." },
  { icon: Lightbulb, title: "Recomendaciones", text: "Sugerencias explicadas con los datos de tu propia tienda." },
];

function Conocer() {
  return (
    <div className="conocer-page min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-sidebar-border bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link to="/">
            <Logo tone="light" size="sm" />
          </Link>
          <Link
            to="/"
            className="conocer-back order-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-background px-4 py-2 text-sm font-semibold text-navy sm:order-none sm:ml-auto sm:w-auto"
          >
            ← Volver al inicio
          </Link>
          <Button asChild size="sm" variant="hero">
            <Link to="/auth" search={{ mode: "signup" }}>
              Crear cuenta
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="py-12 text-center">
          <h1 className="text-3xl font-extrabold text-canvas-foreground sm:text-5xl">
            Hecha para la tienda de la esquina
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-canvas-muted">
            AyúdateVeci reúne en el celular lo que antes estaba en el cuaderno: ventas, compras,
            gastos e inventario. Sin términos complicados.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="conocer-card rounded-2xl border bg-card p-5 shadow-card">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-navy">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </article>
          ))}
        </section>

        <section className="conocer-card mt-10 grid items-center gap-6 rounded-3xl border bg-card p-6 text-navy sm:grid-cols-[auto_1fr] sm:p-8">
          <img src={vecibot} alt="VeciBot, el asistente de AyúdateVeci" width={816} height={816} loading="lazy" className="mx-auto size-32 sm:size-40" />
          <div>
            <h2 className="text-2xl font-extrabold">Conoce a VeciBot</h2>
            <p className="mt-2 text-muted-foreground">
              Pregúntale “¿Cuánto vendí hoy?” o “¿Qué productos debo reponer?”. VeciBot revisa los
              registros de tu tienda y te responde en lenguaje sencillo. Si no tiene datos
              suficientes, te lo dice: nunca inventa ventas ni ganancias.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="conocer-card rounded-2xl border bg-card p-5 shadow-card">
            <ClipboardList className="size-5 text-info" />
            <h3 className="mt-3 font-bold text-navy">1. Registra tu tienda</h3>
            <p className="mt-1 text-sm text-muted-foreground">Nombre, barrio y tus productos.</p>
          </div>
          <div className="conocer-card rounded-2xl border bg-card p-5 shadow-card">
            <Receipt className="size-5 text-info" />
            <h3 className="mt-3 font-bold text-navy">2. Anota cada venta</h3>
            <p className="mt-1 text-sm text-muted-foreground">Y tus compras y gastos del día.</p>
          </div>
          <div className="conocer-card rounded-2xl border bg-card p-5 shadow-card">
            <BarChart3 className="size-5 text-info" />
            <h3 className="mt-3 font-bold text-navy">3. Mira cómo te va</h3>
            <p className="mt-1 text-sm text-muted-foreground">Reportes y consejos al instante.</p>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="conocer-card rounded-2xl border bg-card p-6 shadow-card">
            <MapPin className="size-5 text-info" />
            <h3 className="mt-3 text-lg font-bold text-navy">Para todo Ecuador</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Una herramienta para las tiendas de víveres de cualquier ciudad o comunidad del país.
              Organiza tu negocio desde el celular, estés donde estés.
            </p>
          </div>
          <div className="conocer-card rounded-2xl border bg-card p-6 shadow-card">
            <Lock className="size-5 text-info" />
            <h3 className="mt-3 text-lg font-bold text-navy">Tus datos son solo tuyos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada tienda tiene su propia cuenta. Ningún otro propietario puede ver tus ventas,
              gastos ni productos.
            </p>
          </div>
        </section>

        <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="hero" size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Crear mi cuenta gratis
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/auth" search={{ mode: "login" }}>
              Ya tengo cuenta
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
