import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, FileText, FlaskConical, Paperclip, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import mascot from "@/assets/vecibot.png";
import { BrowserVoiceInputButton } from "@/components/app/BrowserVoiceInputButton";
import { MovementEditor } from "@/components/app/MovementEditor";
import { ConfirmDialog } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";
import { chatApi } from "@/lib/local-client";
import {
  clearMessageFiles,
  loadMessageFiles,
  saveMessageFiles,
} from "@/lib/vecibot-attachment-storage";
import { chatQuery, productsQuery, storeQuery, useRefreshBusiness } from "@/lib/queries";
import { invoiceAccept, invoiceKind, invoiceText, maxInvoiceBytes } from "@/lib/vecibot-invoice";
import type { MovementDraft } from "@/lib/vecibotParser.js";

export const Route = createFileRoute("/_authenticated/app/vecibot")({
  validateSearch: (search: Record<string, unknown>): { entrada?: "venta" | "compra" } =>
    search["entrada"] === "venta" || search["entrada"] === "compra"
      ? { entrada: search["entrada"] }
      : {},
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(chatQuery),
      context.queryClient.ensureQueryData(productsQuery),
    ]),
  component: Vecibot,
});

const prompts = [
  { label: "Registrar venta", text: "Registrar venta" },
  { label: "Anotar fiado", text: "Anotar fiado" },
  { label: "¿Qué se está acabando?", text: "¿Qué se está acabando?" },
  { label: "¿Cuánto gané hoy?", text: "¿Cuánto gané hoy?" },
];

function Vecibot() {
  const { entrada } = Route.useSearch();
  const { data: products } = useSuspenseQuery(productsQuery);
  const {
    data: { store },
  } = useSuspenseQuery(storeQuery);
  const { data: history, refetch } = useSuspenseQuery(chatQuery);
  const refresh = useRefreshBusiness();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sentFile, setSentFile] = useState<{ id: string; file: File } | null>(null);
  const [draft, setDraft] = useState<MovementDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [demo, setDemo] = useState(false);
  const [clear, setClear] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const pending = useRef<{ message: string; attachment: File | null; id: string } | null>(null);

  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [history.length, draft, status, sentFile]);

  async function send(message: string, attachment: File | null = null) {
    if (locked.current || draft || (!message.trim() && !attachment)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    const attempt =
      pending.current?.message === message && pending.current?.attachment === attachment
        ? pending.current
        : { message, attachment, id: crypto.randomUUID() };
    pending.current = attempt;
    try {
      let extracted = "";
      let fallback = false;
      if (attachment) {
        try {
          extracted = await invoiceText(attachment);
        } catch {
          fallback = true;
        }
      }
      const result = await chatApi.send({
        text: message.trim(),
        client_id: attempt.id,
        ...(attachment
          ? {
              attachment_name: attachment.name,
              attachment_text: extracted,
              manual_invoice: !extracted.trim(),
            }
          : {}),
      });
      if (attachment && (!extracted.trim() || fallback)) {
        setStatus("Completa la tarjeta con lo que ves en la factura o el cuaderno.");
      }
      if (attachment) {
        setSentFile({ id: result.id, file: attachment });
        void saveMessageFiles(store.id, result.id, [attachment]).catch(() =>
          toast.info(
            "El adjunto está visible en esta pestaña. Guarda una copia para consultarlo después.",
          ),
        );
      }
      pending.current = null;
      setText("");
      setFile(null);
      setDraft(result.draft);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude leer el mensaje.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function attach(candidate: File | undefined) {
    if (!candidate) return;
    if (!invoiceKind(candidate) || !candidate.size || candidate.size > maxInvoiceBytes) {
      setError("Elige una foto JPEG, PNG o WebP, o un archivo PDF, XLSX o CSV de hasta 5 MB.");
      return;
    }
    setError("");
    setFile(candidate);
  }

  async function demoInvoice() {
    if (locked.current || draft || busy) return;
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
      pdf.setFontSize(19);
      pdf.text("FACTURA DE DEMOSTRACIÓN", 20, 28);
      pdf.setFontSize(12);
      pdf.text(
        [
          "Proveedor: Distribuidora La Condamine",
          "6 fundas de leche a $0,86",
          "2 cubetas de huevos a $3,35",
          "Total: $11,86",
        ],
        20,
        42,
      );
      await send(
        "Registrar compra",
        new File([pdf.output("blob")], "factura-demo.pdf", { type: "application/pdf" }),
      );
    } catch {
      setError("No pude abrir la factura de demostración. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    try {
      await chatApi.clear();
      void clearMessageFiles(store.id).catch(() => {});
      setStatus("");
      setError("");
      setSentFile(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pude borrar el historial.");
    }
  }

  const disabled = busy || !!draft || listening;
  return (
    <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-card shadow-vecibot-glow">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 py-4 text-sidebar-accent-foreground sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src={mascot}
            className="size-12 rounded-2xl bg-sidebar-accent object-contain"
            alt=""
          />
          <div>
            <h1 className="font-display text-xl font-extrabold">VeciBot</h1>
            <p className="text-xs text-sidebar-foreground">Asistente de tu tienda</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={demo}
            onClick={() => setDemo((open) => !open)}
          >
            <FlaskConical /> Modo Demo
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Borrar historial"
            disabled={disabled || !history.length}
            onClick={() => setClear(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </header>
      {demo && (
        <div className="flex flex-wrap gap-2 border-b bg-info-soft px-4 py-3 sm:px-6">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void send("Vendí dos leches y cinco panes")}
          >
            Venta por voz simulada
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void send("Vendí tres panes a 20 centavos fiado a Doña Rosa")}
          >
            Fiado de Doña Rosa
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void demoInvoice()}
          >
            Cargar factura de ejemplo
          </Button>
        </div>
      )}
      <div
        ref={thread}
        role="log"
        aria-label="Conversación con VeciBot"
        className="space-y-4 overflow-y-auto bg-muted px-3 py-5 sm:px-6"
        style={{ height: "clamp(22rem, 57vh, 49rem)" }}
      >
        <div className="flex items-start gap-2">
          <Bot className="mt-2 size-5 shrink-0 text-info" aria-hidden />
          <p className="max-w-prose rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm font-semibold text-navy">
            ¡Hola Veci! ¿Qué vendimos, compramos o qué necesitas revisar hoy?
          </p>
        </div>
        {history.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user" ? "flex flex-col items-end gap-2" : "flex justify-start"
            }
          >
            <p
              className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm sm:max-w-[78%] ${message.role === "user" ? "rounded-tr-sm bg-navy text-navy-foreground" : "rounded-tl-sm border bg-card text-card-foreground"}`}
            >
              {message.content}
            </p>
            {message.role === "user" &&
              /(?:^|\n)Adjunto: /.test(message.content) &&
              (sentFile?.id === message.id ? (
                <Attachment file={sentFile.file} />
              ) : (
                <StoredAttachment storeId={store.id} messageId={message.id} />
              ))}
          </div>
        ))}
        {status && (
          <p className="text-sm font-semibold text-navy" role="status">
            {status}
          </p>
        )}
        {draft && (
          <MovementEditor
            draft={draft}
            products={products}
            onSave={(total) => {
              setDraft(null);
              setStatus(
                `${draft.intent === "REGISTRAR_COMPRA" ? "Compra registrada" : draft.intent === "REGISTRAR_FIADO" ? "Fiado anotado" : "Venta registrada"} por ${money(total)}. Inventario actualizado.`,
              );
              void refresh();
            }}
            onCancel={() => {
              setDraft(null);
              setStatus("Registro cancelado.");
            }}
          />
        )}
        {busy && (
          <p className="text-sm text-muted-foreground" role="status">
            Revisando tu mensaje…
          </p>
        )}
      </div>
      <form
        className="space-y-3 border-t p-3 sm:p-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!disabled) void send(text, file);
        }}
      >
        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Button
              type="button"
              key={prompt.label}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void send(prompt.text)}
            >
              {prompt.label}
            </Button>
          ))}
        </div>
        {file && <Attachment file={file} onRemove={() => setFile(null)} />}
        <Textarea
          aria-label="Mensaje para VeciBot"
          value={text}
          maxLength={2000}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!disabled) void send(text, file);
            }
          }}
          placeholder={
            entrada === "compra"
              ? "Ej. Compré una cubeta de huevos a $3,50"
              : "Ej. Vendí dos leches y cinco panes"
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <BrowserVoiceInputButton
            disabled={busy || !!draft}
            onListeningChange={setListening}
            onTranscript={setText}
            onAutoSubmit={(transcript) => void send(transcript, file)}
          />
          <input
            hidden
            type="file"
            ref={upload}
            accept={invoiceAccept}
            aria-label="Archivo de factura"
            onChange={(event) => {
              attach(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => upload.current?.click()}
          >
            <Paperclip /> Adjuntar factura
          </Button>
          <Button
            type="submit"
            size="sm"
            className="ml-auto"
            disabled={disabled || (!text.trim() && !file)}
          >
            <Send /> Enviar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      <ConfirmDialog
        open={clear}
        onOpenChange={setClear}
        title="¿Borrar el historial de VeciBot?"
        description="Se borrarán los mensajes de esta conversación."
        confirmLabel="Borrar historial"
        onConfirm={clearHistory}
      />
    </section>
  );
}

function StoredAttachment({ storeId, messageId }: { storeId: string; messageId: string }) {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let mounted = true;
    void loadMessageFiles(storeId, messageId)
      .then((files) => {
        if (mounted) setFile(files[0] ?? null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [storeId, messageId]);
  return file ? <Attachment file={file} /> : null;
}

function Attachment({ file, onRemove }: { file: File; onRemove?: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  const kind = invoiceKind(file);
  const [previewText, setPreviewText] = useState("");
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 text-sm text-navy">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 break-all font-semibold">{file.name}</span>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Quitar
          </Button>
        )}
      </div>
      {kind === "image" && url && (
        <>
          <img
            src={url}
            alt="Vista previa de la factura o cuaderno"
            className="max-h-48 rounded-lg object-contain"
          />
          {onRemove && (
            <p className="text-xs text-muted-foreground">
              Escribe los renglones de la foto o completa la tarjeta al enviarla.
            </p>
          )}
        </>
      )}
      {kind === "pdf" && url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-info underline"
        >
          Ver PDF
        </a>
      )}
      {(kind === "csv" || kind === "xlsx") && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              void invoiceText(file)
                .then((text) => setPreviewText(text || "La hoja está vacía."))
                .catch(() => setPreviewText("No pude leer la hoja."))
            }
          >
            Vista previa de la hoja
          </Button>
          {previewText && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2">
              {previewText}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
