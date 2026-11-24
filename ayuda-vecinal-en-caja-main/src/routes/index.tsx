import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Boxes, MapPin, Receipt, ShieldCheck, Sparkles } from "lucide-react";

import heroImg from "@/assets/hero-quito.jpg";
import vecibot from "@/assets/vecibot.png";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { localAuth } from "@/lib/local-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AyúdateVeci — Tu tienda, mejor organizada" },
      { name: "theme-color", content: "#102D4E" },
      {
        name: "description",
        content:
          "Administra tus ventas, controla tus gastos y descubre cómo mejorar tu tienda de víveres en Ecuador con ayuda del asistente VeciBot.",
      },
      { property: "og:title", content: "AyúdateVeci — Tu tienda, mejor organizada" },
      {
        property: "og:description",
        content:
          "Ventas, gastos, inventario y consejos de VeciBot para las tiendas de barrio de todo Ecuador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/brand/ayudate-veci-cuy.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void localAuth.session().then((user) => setSignedIn(!!user)).catch(() => {});
  }, []);

  return (
    <div className="welcome-page flex min-h-svh flex-col bg-canvas text-foreground">
      <a
        href="#contenido"
        className="sr-only rounded-lg bg-card px-4 py-3 font-semibold text-card-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>

      <header className="border-b border-sidebar-border bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-10">
          <Logo mark="cuy" tone="light" size="lg" className="welcome-logo" />
          {signedIn && (
            <nav aria-label="Acceso a tu tienda" className="shrink-0">
              <Button asChild className="min-h-11 px-3 sm:px-5">
                <Link to="/app">
                  Ir a mi tienda <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </nav>
          )}
        </div>
      </header>

      <main
        id="contenido"
        className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-10 lg:py-16"
      >
        <section aria-labelledby="bienvenida" className="min-w-0">
          <p className="inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.025em] text-canvas-muted sm:text-sm">
            <span className="h-0.5 w-6 shrink-0 rounded-full bg-info" aria-hidden="true" />
            Para las tiendas de víveres de Ecuador
          </p>
          <h1 id="bienvenida" className="welcome-title mt-6 text-canvas-foreground">
            Tu tienda,
            <span className="mt-1 block">mejor organizada.</span>
          </h1>
          <span className="mt-6 block h-1.5 w-14 rounded-full bg-info" aria-hidden="true" />
          <p className="welcome-description mt-6 max-w-lg text-canvas-muted">
            Administra tus ventas, controla tus gastos y descubre cómo mejorar tu negocio con ayuda
            de VeciBot.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {signedIn ? (
              <Button asChild size="lg" className="welcome-primary min-h-13 sm:px-7">
                <Link to="/app">
                  Entrar a mi tienda <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="welcome-primary min-h-13 sm:px-7">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Crear cuenta <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="min-h-13 text-card-foreground sm:px-7"
                >
                  <Link to="/auth" search={{ mode: "login" }}>
                    Iniciar sesión
                  </Link>
                </Button>
              </>
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            className="mt-3 min-h-11 w-full justify-center text-canvas-muted hover:text-navy sm:w-auto sm:justify-start"
          >
            <Link to="/conocer">
              Conocer la aplicación <ArrowRight aria-hidden="true" />
            </Link>
          </Button>

          <ul
            aria-label="Herramientas para tu negocio"
            className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-sidebar-border pt-6 sm:gap-x-7"
          >
            {[
              { icon: Receipt, label: "Ventas del día", detail: "Cada venta, en orden" },
              { icon: Boxes, label: "Inventario", detail: "Tus productos al día" },
              { icon: BarChart3, label: "Reportes", detail: "Tu negocio, más claro" },
              { icon: ShieldCheck, label: "Datos privados", detail: "Solo para tu tienda" },
            ].map(({ icon: Icon, label, detail }) => (
              <li key={label} className="flex items-start gap-2.5 sm:gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-info">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="pt-0.5">
                  <p className="text-sm font-bold text-canvas-foreground">{label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-canvas-muted">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Quito y tu asistente VeciBot" className="min-w-0 lg:pb-3">
          <figure className="welcome-photo relative rounded-[1.75rem] border border-border bg-card p-2.5 shadow-float sm:p-3">
            <div className="photo-frame relative overflow-hidden rounded-[1.15rem] bg-navy-soft">
              <img
                src={heroImg}
                alt="Vista panorámica de Quito, con sus edificios y las montañas al fondo"
                width={1500}
                height={1125}
                fetchPriority="high"
                className="photo-image aspect-[4/3] w-full object-cover"
              />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-bold text-card-foreground shadow-card">
                <MapPin className="size-3.5 text-info" aria-hidden="true" /> Quito, Ecuador
              </span>
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 pb-1 pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-card-foreground">
                Cerca de ti. Cerca de tu negocio.
              </span>
            </figcaption>
          </figure>

          <div className="surface-card relative mx-3 -mt-1 flex items-center gap-3 rounded-b-2xl border border-t-0 border-border bg-card px-4 py-4 shadow-card sm:mx-7 sm:gap-4 sm:px-5">
            <img
              src={vecibot}
              alt=""
              width={816}
              height={816}
              className="size-14 shrink-0 object-contain sm:size-16"
            />
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-info">
                <Sparkles className="size-3.5" aria-hidden="true" /> TU ALIADO INTELIGENTE
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                <strong>VeciBot:</strong> “Hoy conviene reponer leche y arroz.”
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-sidebar-border bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-5 text-center text-xs leading-relaxed text-canvas-muted sm:flex-row sm:px-8 sm:text-left lg:px-10">
          <p>
            <span className="text-xl font-bold text-canvas-foreground">Ayúdate<span className="text-primary">Veci</span></span>{" "}
            <span aria-hidden="true" className="px-1 text-info">
              ·
            </span>{" "}
            Prototipo universitario
          </p>
          <p>Para las tiendas de barrio de todo Ecuador</p>
        </div>
      </footer>
    </div>
  );
}
