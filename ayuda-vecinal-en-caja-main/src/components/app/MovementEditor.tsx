import { useRef, useState, type FormEvent } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessApi } from "@/lib/local-client";
import { money } from "@/lib/format";
import { dateKey } from "@/lib/finance";
import type { Product } from "@/lib/queries";
import type { DraftLine, MovementDraft } from "@/lib/vecibotParser.js";

const blank = { productId: "", description: "", quantity: "", price: "" };
type EditableLine = DraftLine & { key: number };
type Existing = { id: string; date?: string; notes?: string | null; updateCost?: boolean };

export function MovementEditor({
  draft,
  products,
  onSave,
  onCancel,
  existing,
}: {
  draft: MovementDraft;
  products: Product[];
  onSave: (total: number) => void;
  onCancel: () => void;
  existing?: Existing;
}) {
  const [lines, setLines] = useState<EditableLine[]>(() =>
    (draft.items.length ? draft.items : [blank]).map((line, key) => ({ ...line, key })),
  );
  const [party, setParty] = useState(draft.party);
  const [date, setDate] = useState(existing?.date ?? dateKey(new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [updateCost, setUpdateCost] = useState(existing?.updateCost ?? true);
  const [fiado, setFiado] = useState(draft.intent === "REGISTRAR_FIADO");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nextLine = useRef(lines.length);
  const operation = useRef(crypto.randomUUID());
  const locking = useRef(false);
  const purchase = draft.intent === "REGISTRAR_COMPRA";
  const number = (value: string) => Number(value.trim().replace(",", "."));
  const items = lines.map((line) => ({
    product_id: line.productId,
    quantity: number(line.quantity),
    unit_price: number(line.price),
  }));
  const total = items.reduce((sum, item) => {
    const amount = (item.quantity * Math.round(item.unit_price * 100)) / 100;
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  function edit(key: number, patch: Partial<DraftLine>) {
    setLines((old) => old.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locking.current) return;
    setError("");
    if (
      !items.length ||
      items.some(
        (item, index) =>
          !item.product_id ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          !lines[index]?.price.trim() ||
          !Number.isFinite(item.unit_price) ||
          item.unit_price < 0,
      )
    ) {
      setError("Elige un producto y revisa su cantidad y precio en cada fila.");
      return;
    }
    if (!purchase && fiado && !party.trim()) {
      setError("Escribe el nombre del cliente del fiado.");
      return;
    }
    locking.current = true;
    setSaving(true);
    const result = await businessApi.ledger(
      purchase ? "purchases" : "sales",
      {
        items,
        notes,
        key: operation.current,
        ...(purchase
          ? { supplier: party, date, update_cost: updateCost }
          : { customer: fiado ? party : "" }),
      },
      existing?.id,
    );
    locking.current = false;
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSave(total);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-info/35 bg-card p-3 text-card-foreground sm:p-4"
    >
      <h2 className="font-display text-base font-bold text-navy">
        {existing ? "Editar " : "Revisar "}
        {purchase ? "compra" : fiado ? "fiado" : "venta"}
      </h2>
      <fieldset disabled={saving} className="space-y-3">
        {existing && !purchase && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fiado}
              onChange={(event) => setFiado(event.target.checked)}
            />{" "}
            Venta a crédito
          </label>
        )}
        {(purchase || fiado) && (
          <label className="block text-sm font-semibold">
            {purchase ? "Proveedor" : "Cliente del fiado"}
            <Input
              className="mt-1"
              maxLength={120}
              value={party}
              onChange={(event) => setParty(event.target.value)}
            />
          </label>
        )}
        {purchase && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm font-semibold">
              Fecha de compra
              <Input
                className="mt-1"
                type="date"
                max={dateKey(new Date())}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={updateCost}
                onChange={(event) => setUpdateCost(event.target.checked)}
              />{" "}
              Actualizar costo del catálogo
            </label>
          </div>
        )}
        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          return (
            <div
              key={line.key}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg bg-muted p-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <label className="col-span-3 min-w-0 text-xs font-semibold sm:col-span-1">
                Producto {index + 1}
                <select
                  className="mt-1 block h-9 w-full rounded-md border border-input bg-card px-2 text-sm font-normal"
                  value={line.productId}
                  onChange={(event) => {
                    const selection = products.find((p) => p.id === event.target.value);
                    edit(line.key, {
                      productId: event.target.value,
                      price:
                        line.productId || !line.price
                          ? String(
                              selection
                                ? purchase
                                  ? selection.purchase_price
                                  : selection.sale_price
                                : "",
                            )
                          : line.price,
                    });
                  }}
                >
                  <option value="">
                    {line.description ? `Revisar: ${line.description}` : "Elige un producto"}
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold">
                Cantidad {product && <span className="font-normal">({product.unit})</span>}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => edit(line.key, { quantity: event.target.value })}
                />
              </label>
              <label className="min-w-0 text-xs font-semibold">
                {purchase ? "Costo c/u ($)" : "Precio c/u ($)"}
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) => edit(line.key, { price: event.target.value })}
                />
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Quitar producto ${index + 1}`}
                onClick={() => setLines((old) => old.filter((item) => item.key !== line.key))}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={lines.length >= 100}
          onClick={() => {
            const key = nextLine.current++;
            setLines((old) => [...old, { ...blank, key }]);
          }}
        >
          <Plus /> Agregar producto
        </Button>
        {existing && (
          <label className="block text-sm font-semibold">
            Notas
            <Input
              className="mt-1"
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        )}
      </fieldset>
      <div className="flex items-center justify-between border-t pt-3 font-bold text-navy">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !products.length}>
          <Check /> {saving ? "Guardando…" : "Confirmar y Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          <X /> Cancelar
        </Button>
      </div>
      {!products.length && (
        <p className="text-sm text-muted-foreground">
          Agrega los productos al catálogo antes de registrar el movimiento.
        </p>
      )}
    </form>
  );
}
