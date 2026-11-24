import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import shop from "@/assets/hero-tienda.jpg";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-account";
import { localAuth } from "@/lib/local-client";

type Mode = "login" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode: Mode; redirect?: string | undefined } => ({
    mode: search["mode"] === "signup" || search["mode"] === "forgot" ? search["mode"] : "login",
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Accede a AyúdateVeci" }] }),
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(160),
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
});
const signupSchema = loginSchema.extend({
  owner_name: z.string().trim().min(2, "Escribe tu nombre.").max(80),
  store_name: z.string().trim().min(2, "Escribe el nombre de tu tienda.").max(80),
  barrio: z.string().trim().min(2, "Indica tu barrio o sector.").max(80),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72),
});

function destination(path?: string) {
  try {
    const url = new URL(path ?? "/app", window.location.origin);
    return url.origin === window.location.origin && /^\/app(?:\/|$)/.test(url.pathname)
      ? url.pathname + url.search
      : "/app";
  } catch {
    return "/app";
  }
}

function AuthPage() {
  const { mode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const signup = mode === "signup";

  useEffect(() => {
    void localAuth
      .session()
      .then((user) => {
        if (user && mode !== "forgot") void navigate({ to: destination(redirect), replace: true });
      })
      .catch(() => {});
  }, [navigate, redirect, mode]);

  async function finish(work: ReturnType<typeof localAuth.login>) {
    setLoading(true);
    const { error } = await work;
    setLoading(false);
    if (error) return void toast.error(error.message);
    await navigate({ to: destination(redirect), replace: true });
  }

  function showErrors(error: z.ZodError) {
    setErrors(Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message])));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setErrors({});
    if (signup) {
      const result = signupSchema.safeParse(form);
      if (!result.success) return showErrors(result.error);
      await finish(localAuth.register(result.data));
    } else {
      const result = loginSchema.safeParse(form);
      if (!result.success) return showErrors(result.error);
      await finish(localAuth.login(result.data));
    }
  }

  return (
    <div className="auth-page grid min-h-svh bg-background lg:grid-cols-2">
      <aside className="flex flex-col gap-6 border-b border-sidebar-border bg-canvas p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14">
        <Link to="/" className="self-start">
          <Logo tone="light" />
        </Link>
        <div className="my-auto hidden overflow-hidden rounded-3xl border border-sidebar-border lg:block">
          <img
            src={shop}
            alt="Estantes de una tienda de barrio"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <p className="max-w-lg font-display text-xl font-bold text-canvas-foreground sm:text-3xl">
          Tu tienda, mejor organizada.
        </p>
      </aside>
      <main className="flex items-center bg-secondary p-6 sm:p-10">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-bold text-navy sm:text-3xl">
            {signup
              ? "Crea la cuenta de tu tienda"
              : mode === "forgot"
                ? "Recupera tu contraseña"
                : "Inicia sesión"}
          </h1>
          {mode === "forgot" ? (
            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <p>
                Desde la carpeta del proyecto, abre una terminal en el equipo donde está la base de
                datos y ejecuta este comando con el correo de tu cuenta.
              </p>
              <code className="block break-all rounded-lg bg-card p-3">
                npm run db:password -- tu-correo
              </code>
              <Button asChild variant="outline">
                <Link to="/auth" search={{ mode: "login" }}>
                  Volver a iniciar sesión
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-info">
                <Link to="/auth" search={{ mode: "login", redirect }} onClick={() => setErrors({})}>
                  Iniciar sesión
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup", redirect }}
                  onClick={() => setErrors({})}
                >
                  Crear cuenta
                </Link>
              </div>
              <form key={mode} onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                {signup && (
                  <>
                    <Field
                      name="owner_name"
                      label="Nombre del propietario"
                      autoComplete="name"
                      error={errors["owner_name"]}
                    />
                    <Field
                      name="store_name"
                      label="Nombre de la tienda"
                      autoComplete="organization"
                      error={errors["store_name"]}
                    />
                    <Field
                      name="barrio"
                      label="Barrio o sector"
                      placeholder="Ej. Santa Rosa"
                      error={errors["barrio"]}
                    />
                  </>
                )}
                <Field
                  name="email"
                  type="email"
                  label="Correo electrónico"
                  autoComplete="email"
                  error={errors["email"]}
                />
                <Field
                  name="password"
                  type="password"
                  label="Contraseña"
                  autoComplete={signup ? "new-password" : "current-password"}
                  error={errors["password"]}
                />
                {!signup && (
                  <Link
                    to="/auth"
                    search={{ mode: "forgot" }}
                    className="block text-right text-sm font-semibold text-info hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                )}
                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full"
                  disabled={loading}
                >
                  {loading && <Loader2 className="animate-spin" />}
                  {signup ? "Crear mi cuenta" : "Iniciar sesión"}
                </Button>
                {!signup && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    disabled={loading}
                    onClick={() =>
                      void finish(localAuth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }))
                    }
                  >
                    <Store /> Entrar a la tienda de demostración
                  </Button>
                )}
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  name,
  label,
  error,
  ...props
}: {
  name: string;
  label: string;
  error: string | undefined;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={!!error} className="h-11 bg-card" {...props} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
