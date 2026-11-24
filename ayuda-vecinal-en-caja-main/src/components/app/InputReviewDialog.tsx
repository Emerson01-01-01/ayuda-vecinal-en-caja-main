import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { dateKey } from "@/lib/finance";
import { money } from "@/lib/format";
import { productsQuery, useRefreshBusiness } from "@/lib/queries";
import { actionFromExtraction, type Extraction, type ExtractedItem } from "@/lib/vecibot-input";
import { saveInputAction } from "@/hooks/use-vecibot-input";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const numberValue = (value: string) => (value === "" ? null : Number(value));

export function InputReviewDialog({
  draft,
  onChange,
  onClose,
  requestId,
  preview,
  onSaved,
}: {
  draft: Extraction;
  onChange: (draft: Extraction) => void;
  onClose: () => void;
  requestId: string;
  preview: string | null;
  onSaved?: ((message: string) => void) | undefined;
}) {
  const { data: products } = useSuspenseQuery(productsQuery);
  const refresh = useRefreshBusiness();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  // A new draft is a new operation; uncertain retries retain the same ID and data.
  useEffect(() => {
    setLocked(false);
    setError("");
  }, [requestId]);
  const isProduct = draft.intent === "producto";
  const isPurchase = draft.intent === "compra";
  const title = isProduct
    ? "Revisa los productos"
    : isPurchase
      ? "Revisa la compra"
      : "Revisa la venta";

  function update(index: number, patch: Partial<ExtractedItem>) {
    onChange({
      ...draft,
      items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  async function save() {
    if (pending.current) return;
    let action;
    try {
      action = actionFromExtraction(draft);
    } catch {
      setError(
        "Completa los campos vacíos, elige los productos y revisa cantidades y precios. No se ha guardado nada.",
      );
      return;
    }
    pending.current = true;
    setSaving(true);
    setLocked(true);
    setError("");
    let saved: { message: string };
    try {
      saved = await saveInputAction(requestId, action);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status < 500) setLocked(false);
      setError(err instanceof Error ? err.message : "No pude guardar. Intenta de nuevo.");
      setSaving(false);
      pending.current = false;
      return;
    }
    toast.success(saved.message);
    onClose();
    // A cache refresh failure must never be reported as a failed database write.
    void refresh();
    void qc.invalidateQueries({ queryKey: ["chat"] });
    onSaved?.(saved.message);
  }

  const total = draft.items.reduce(
    (sum, item) =>
      sum +
      (item.quantity ?? 0) *
        (isPurchase
          ? (item.unit_cost ?? 0)
          : (products.find((p) => p.id === item.product_id)?.sale_price ?? 0)),
    0,
  );
  const totalComplete =
    draft.items.length > 0 &&
    draft.items.every(
      (item) =>
        item.quantity !== null &&
        (isPurchase ? item.unit_cost !== null : products.some((p) => p.id === item.product_id)),
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            VeciBot detectó estos datos. Corrige lo que falte y pulsa Guardar para registrar la
            operación.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <img
            src={preview}
            alt="Foto que se está revisando"
            className="max-h-48 w-full rounded-lg bg-muted object-contain"
          />
        )}
        <p className="text-sm text-muted-foreground">{draft.message}</p>
        {draft.warnings.length > 0 && (
          <ul className="list-disc space-y-1 rounded-lg bg-warning-soft p-3 pl-7 text-sm text-warning-foreground">
            {draft.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        )}
        <fieldset disabled={locked || saving} className="min-w-0 space-y-3 disabled:opacity-75">
          {(isProduct || isPurchase) && (
            <label className="block space-y-1 text-sm">
              Proveedor (opcional)
              <Input
                value={draft.supplier ?? ""}
                maxLength={120}
                onChange={(e) => onChange({ ...draft, supplier: e.target.value || null })}
              />
            </label>
          )}
          {isPurchase && (
            <label className="block space-y-1 text-sm">
              Fecha de compra
              <Input
                type="date"
                value={draft.date ?? ""}
                max={dateKey(new Date())}
                onChange={(e) => onChange({ ...draft, date: e.target.value })}
              />
            </label>
          )}
          {draft.items.length === 0 && (
            <p className="text-sm text-destructive">
              No se detectaron productos. Prueba una foto más clara o describe lo que quieres
              registrar.
            </p>
          )}
          {draft.items.map((item, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{item.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() =>
                    onChange({ ...draft, items: draft.items.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {isProduct ? (
                <>
                  <label className="block space-y-1 text-sm">
                    Nombre
                    <Input
                      value={item.name}
                      maxLength={120}
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Categoría
                    <select
                      className={selectClass}
                      value={item.category ?? ""}
                      onChange={(e) =>
                        update(index, { category: e.target.value as ExtractedItem["category"] })
                      }
                    >
                      <option value="">Elige una categoría</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="block space-y-1 text-sm">
                  Producto del catálogo
                  <select
                    className={selectClass}
                    value={item.product_id ?? ""}
                    onChange={(e) => update(index, { product_id: e.target.value || null })}
                  >
                    <option value="">Elige el producto correcto</option>
                    {products.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {p.quantity} disponibles
                      </option>
                    ))}
                  </select>
                  {!item.product_id && (
                    <span className="text-xs text-destructive">
                      Si es nuevo, créalo primero en Productos y vuelve a cargar esta compra.
                    </span>
                  )}
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  {isProduct ? "Existencias iniciales" : "Cantidad (unidades)"}
                  <Input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={isProduct ? 0 : 1}
                    max={1000000}
                    value={item.quantity ?? ""}
                    onChange={(e) => update(index, { quantity: numberValue(e.target.value) })}
                  />
                </label>
                {(isPurchase || isProduct) && (
                  <label className="space-y-1 text-sm">
                    Costo unitario ($)
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="100000"
                      value={item.unit_cost ?? ""}
                      onChange={(e) => update(index, { unit_cost: numberValue(e.target.value) })}
                    />
                  </label>
                )}
                {isProduct && (
                  <>
                    <label className="space-y-1 text-sm">
                      Precio de venta ($)
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100000"
                        step="0.01"
                        value={item.sale_price ?? ""}
                        onChange={(e) => update(index, { sale_price: numberValue(e.target.value) })}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      Stock mínimo
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100000"
                        step="1"
                        value={item.min_stock ?? ""}
                        onChange={(e) => update(index, { min_stock: numberValue(e.target.value) })}
                      />
                    </label>
                  </>
                )}
              </div>
              {isProduct &&
                item.sale_price !== null &&
                item.unit_cost !== null &&
                item.sale_price < item.unit_cost && (
                  <p className="text-xs text-destructive">
                    El precio de venta es menor al costo de compra.
                  </p>
                )}
              {!isProduct && !isPurchase && item.product_id && (
                <p className="text-xs text-muted-foreground">
                  Precio del catálogo:{" "}
                  {money(products.find((p) => p.id === item.product_id)?.sale_price ?? 0)} por
                  unidad. Se comprobarán las existencias al guardar.
                </p>
              )}
            </div>
          ))}
        </fieldset>
        {!isProduct && (
          <p className="text-right text-lg font-bold">
            Total {totalComplete ? money(total) : "por completar"}
          </p>
        )}
        {isPurchase && (
          <p className="text-xs text-muted-foreground">
            Se sumarán las existencias y se actualizarán los costos unitarios de compra. Revisa
            impuestos, descuentos y unidades de la factura.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {locked && !saving && (
          <p className="text-xs text-muted-foreground">
            Reintenta con estos mismos datos para comprobar el guardado sin duplicarlo. Para
            corregirlos, cierra y empieza una nueva entrada.
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cerrar
          </Button>
          <Button type="button" disabled={saving || !draft.items.length} onClick={save}>
            {saving && <Loader2 className="animate-spin" />}
            {locked && !saving ? "Reintentar guardado" : "Guardar registro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
