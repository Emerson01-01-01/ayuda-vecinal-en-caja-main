import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { businessApi } from "@/lib/local-client";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { unitMargin } from "@/lib/finance";
import { errorMessage, money, percent } from "@/lib/format";
import type { Product } from "@/lib/queries";

const schema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(120),
  category: z.enum(PRODUCT_CATEGORIES, { errorMap: () => ({ message: "Elige una categoría" }) }),
  purchase_price: z.coerce.number({ invalid_type_error: "Valor no válido" }).min(0, "No puede ser negativo").max(100000),
  sale_price: z.coerce.number({ invalid_type_error: "Valor no válido" }).min(0, "No puede ser negativo").max(100000),
  quantity: z.coerce.number().int("Solo números enteros").min(0, "No puede ser negativo").max(1000000),
  min_stock: z.coerce.number().int("Solo números enteros").min(0, "No puede ser negativo").max(100000),
  supplier: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1, "Indica la unidad").max(24),
});

type FormState = Record<keyof z.infer<typeof schema>, string>;

const empty = (minStock: number): FormState => ({
  name: "",
  category: "",
  purchase_price: "",
  sale_price: "",
  quantity: "0",
  min_stock: String(minStock),
  supplier: "",
  unit: "unidad",
});

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  defaultMinStock,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product | null;
  defaultMinStock: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(empty(defaultMinStock));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            purchase_price: String(product.purchase_price),
            sale_price: String(product.sale_price),
            quantity: String(product.quantity),
            min_stock: String(product.min_stock),
            supplier: product.supplier ?? "",
            unit: product.unit,
          }
        : empty(defaultMinStock),
    );
  }, [open, product, defaultMinStock]);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cost = Number(form.purchase_price.replace(",", "."));
  const price = Number(form.sale_price.replace(",", "."));
  const preview =
    form.purchase_price !== "" && form.sale_price !== "" && Number.isFinite(cost) && Number.isFinite(price)
      ? unitMargin({ purchase_price: cost, sale_price: price })
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      purchase_price: form.purchase_price.replace(",", "."),
      sale_price: form.sale_price.replace(",", "."),
    });
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const i of parsed.error.issues) errs[i.path[0] as keyof FormState] ??= i.message;
      setErrors(errs);
      return;
    }
    const values = { ...parsed.data, supplier: parsed.data.supplier || null };
    setSaving(true);
    const { error } = await businessApi.save("products", values, product?.id);
    setSaving(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success(product ? "Producto actualizado." : "Producto agregado al catálogo.");
    if (values.sale_price < values.purchase_price) {
      toast.warning("Atención: el precio de venta es menor al costo. Perderás dinero en cada unidad.");
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-navy">{product ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>Los precios son por unidad y en dólares.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <F label="Unidad de inventario" error={errors.unit}>
            <Input value={form.unit} onChange={(e) => set("unit")(e.target.value)} placeholder="Ej. libra, funda o cubeta" />
          </F>
          <F label="Nombre" error={errors.name}>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ej. Leche entera 1 L" autoFocus />
          </F>
          <F label="Categoría" error={errors.category}>
            <Select value={form.category} onValueChange={set("category")}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Precio de compra ($)" error={errors.purchase_price}>
              <Input inputMode="decimal" value={form.purchase_price} onChange={(e) => set("purchase_price")(e.target.value)} placeholder="0.00" />
            </F>
            <F label="Precio de venta ($)" error={errors.sale_price}>
              <Input inputMode="decimal" value={form.sale_price} onChange={(e) => set("sale_price")(e.target.value)} placeholder="0.00" />
            </F>
          </div>
          {preview && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${preview.belowCost ? "bg-destructive-soft text-destructive" : "bg-success-soft text-accent-foreground"}`}>
              {preview.belowCost && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <p>
                {preview.belowCost
                  ? `El precio de venta es menor al costo: pierdes ${money(Math.abs(preview.amount))} por unidad.`
                  : `Margen estimado: ${money(preview.amount)} por unidad (${percent(preview.percent)} del precio de venta).`}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <F label="Cantidad disponible" error={errors.quantity}>
              <Input inputMode="numeric" value={form.quantity} onChange={(e) => set("quantity")(e.target.value)} />
            </F>
            <F label="Stock mínimo" error={errors.min_stock}>
              <Input inputMode="numeric" value={form.min_stock} onChange={(e) => set("min_stock")(e.target.value)} />
            </F>
          </div>
          {product && Number(form.quantity) !== product.quantity && (
            <p className="text-xs text-muted-foreground">
              El cambio de cantidad quedará registrado como un ajuste de inventario. Para mercadería nueva, usa Compras.
            </p>
          )}
          <F label="Proveedor (opcional)" error={errors.supplier}>
            <Input value={form.supplier} onChange={(e) => set("supplier")(e.target.value)} placeholder="Ej. Distribuidora Andina" />
          </F>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {product ? "Guardar cambios" : "Agregar producto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-navy">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
