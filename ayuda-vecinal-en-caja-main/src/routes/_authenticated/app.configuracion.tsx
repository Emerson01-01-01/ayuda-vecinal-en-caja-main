import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { FlaskConical, KeyRound, Loader2, LogOut, Save, Settings, Store, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog, PageHeader, SectionCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSignOut } from "@/hooks/use-sign-out";
import { clearMessageFiles } from "@/lib/vecibot-attachment-storage";
import { businessApi, localAuth } from "@/lib/local-client";
import { BARRIO_SUGERENCIAS } from "@/lib/constants";
import { errorMessage } from "@/lib/format";
import { productsQuery, storeQuery, useRefreshBusiness } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/configuracion")({
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery),
  component: Configuracion,
});

const schema = z.object({
  store_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  owner_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  barrio: z.string().trim().max(80),
  phone: z.string().trim().max(20).regex(/^[0-9+\s-]*$/, "Solo números").optional(),
  contact_email: z.union([z.literal(""), z.string().trim().email("Correo no válido")]),
  address: z.string().trim().max(160).optional(),
  default_min_stock: z.coerce.number().int("Número entero").min(0).max(10000),
});

function Configuracion() {
  const { data: me } = useSuspenseQuery(storeQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const signOut = useSignOut();
  const s = me.store;

  const [form, setForm] = useState({
    store_name: s.name,
    owner_name: me.profile.owner_name,
    barrio: s.barrio,
    phone: s.phone ?? "",
    contact_email: s.contact_email ?? "",
    address: s.address ?? "",
    default_min_stock: String(s.default_min_stock),
  });
  const [alerts, setAlerts] = useState(s.low_stock_alerts);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return void setErrors(errs);
    }
    setErrors({});
    const d = parsed.data;
    setSaving(true);
    const { error: err } = await businessApi.patch("store", {
      ...d, phone: d.phone || null, contact_email: d.contact_email || null,
      address: d.address || null, low_stock_alerts: alerts,
    });
    setSaving(false);
    if (err) return void toast.error(errorMessage(err));
    toast.success("Datos de la tienda guardados.");
    refresh();
  }

  async function applyMinStock() {
    setBusy(true);
    const { error } = await businessApi.patch("stock-minimum", { min_stock: Number(form.default_min_stock) });
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success(`Stock mínimo de ${form.default_min_stock} aplicado a todos los productos.`);
    refresh();
  }

  async function loadDemo() {
    setBusy(true);
    const { error } = await businessApi.save("demo", {});
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Datos ficticios de demostración cargados.");
    refresh();
  }

  async function clearAll() {
    setBusy(true);
    const { error } = await businessApi.remove("store");
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    void clearMessageFiles(s.id).catch(() => {});
    toast.success("Se borraron todos los registros de tu tienda.");
    refresh();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" icon={Settings} description="Datos de tu tienda, preferencias y cuenta." />

      <form onSubmit={save} className="space-y-5">
        <SectionCard title={<span className="flex items-center gap-2"><Store className="size-4 text-info" /> Tu tienda</span>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la tienda" error={errors["store_name"]}>
              <Input value={form.store_name} onChange={set("store_name")} />
            </Field>
            <Field label="Nombre del propietario" error={errors["owner_name"]}>
              <Input value={form.owner_name} onChange={set("owner_name")} />
            </Field>
            <Field label="Barrio o sector" error={errors["barrio"]}>
              <Input value={form.barrio} onChange={set("barrio")} list="sectores-config" />
              <datalist id="sectores-config">
                {BARRIO_SUGERENCIAS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label="Dirección (opcional)" error={errors["address"]}>
              <Input value={form.address} onChange={set("address")} placeholder="Ej. Av. Principal y calle 10" />
            </Field>
            <Field label="Teléfono de contacto (opcional)" error={errors["phone"]}>
              <Input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="09xxxxxxxx" />
            </Field>
            <Field label="Correo de contacto (opcional)" error={errors["contact_email"]}>
              <Input value={form.contact_email} onChange={set("contact_email")} type="email" />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Preferencias">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock mínimo para productos nuevos" error={errors["default_min_stock"]}>
              <div className="flex gap-2">
                <Input value={form.default_min_stock} onChange={set("default_min_stock")} inputMode="numeric" className="w-24" />
                <Button type="button" variant="outline" onClick={() => setApplyOpen(true)} disabled={!products.length}>
                  Aplicar a todos
                </Button>
              </div>
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-semibold text-navy">Alertas de stock bajo</span>
                <span className="text-xs text-muted-foreground">Mostrar avisos en el panel principal</span>
              </span>
              <Switch checked={alerts} onCheckedChange={setAlerts} />
            </label>
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar cambios
          </Button>
        </div>
      </form>

      <SectionCard title={<span className="flex items-center gap-2"><UserRound className="size-4 text-info" /> Perfil y cuenta</span>}>
        <p className="text-sm text-muted-foreground">
          Correo de acceso: <strong className="text-navy">{me.email}</strong>
        </p>
        <ChangePassword />
        <Button variant="outline" className="mt-4" onClick={signOut}>
          <LogOut /> Cerrar sesión
        </Button>
      </SectionCard>

      <SectionCard title={<span className="flex items-center gap-2"><FlaskConical className="size-4 text-warning-foreground" /> Datos de demostración</span>}>
        <p className="text-sm text-muted-foreground">
          {s.has_demo_data
            ? "Tu tienda tiene datos ficticios de demostración. Bórralos antes de empezar a usarla de verdad."
            : "Puedes cargar productos, ventas, compras y gastos ficticios para probar la aplicación (solo si tu tienda no tiene productos)."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {products.length === 0 && (
            <Button variant="outline" onClick={loadDemo} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Cargar datos de demostración
            </Button>
          )}
          <Button variant="destructive" onClick={() => setClearOpen(true)} disabled={busy}>
            <Trash2 /> Borrar todos los datos de la tienda
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title="¿Aplicar a todos los productos?"
        description={`El stock mínimo de tus ${products.length} productos pasará a ser ${form.default_min_stock} unidades.`}
        confirmLabel="Sí, aplicar"
        destructive={false}
        onConfirm={applyMinStock}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="¿Borrar todos los datos?"
        description="Se eliminarán productos, ventas, compras, gastos, movimientos y la conversación con VeciBot. Tu cuenta y los datos de la tienda se mantienen. No se puede deshacer."
        confirmLabel="Sí, borrar todo"
        onConfirm={clearAll}
      />
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return void toast.error("La nueva contraseña debe tener al menos 8 caracteres.");
    setSaving(true);
    const { error } = await localAuth.password({ password: next, current_password: current });
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Contraseña actualizada.");
    setCurrent("");
    setNext("");
    setOpen(false);
  }

  if (!open)
    return (
      <Button variant="ghost" className="mt-3 px-0" onClick={() => setOpen(true)}>
        <KeyRound /> Cambiar contraseña
      </Button>
    );

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Contraseña actual">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="Nueva contraseña">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Guardar
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-navy">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
