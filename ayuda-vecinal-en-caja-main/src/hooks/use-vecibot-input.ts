import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vecibotFetch, vecibotErrorMessage } from "@/lib/vecibot-client";
import { validateFiles } from "@/lib/vecibot-files";
import {
  extractionSchema,
  type Extraction,
  type InputContext,
  type InputAction,
} from "@/lib/vecibot-input";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Inicia sesión para usar VeciBot.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export async function saveInputAction(requestId: string, action: InputAction) {
  const response = await vecibotFetch("/api/vecibot-acciones", {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action }),
  });
  const body = await response.json();
  return body.result as { message: string };
}

export function useVeciBotInput({
  context = "auto",
  onQuestion,
  onExtracted,
  onAnalyzed,
  onError,
}: {
  context?: InputContext;
  onQuestion?: ((text: string, files: File[]) => void | boolean | Promise<void | boolean>) | undefined;
  onExtracted?: ((draft: Extraction) => void) | undefined;
  onAnalyzed?: ((draft: Extraction, text: string, files: File[]) => void) | undefined;
  onError?: ((message: string) => void) | undefined;
} = {}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Extraction | null>(null);
  const [requestId, setRequestId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function analyze(text: string, attachment?: File | File[]) {
    const files = attachment ? (Array.isArray(attachment) ? attachment : [attachment]) : [];
    if (controller.current || (!text.trim() && !files.length)) return false;
    const validation = validateFiles(files);
    if (validation) {
      if (onError) onError(validation);
      else toast.error(validation);
      return false;
    }
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    try {
      const image = files.find((file) => file.type.startsWith("image/"));
      setPreview(image ? URL.createObjectURL(image) : null);
      const headers = await authHeaders();
      let body: FormData | string;
      if (files.length) {
        body = new FormData();
        for (const file of files) body.append("files", file);
        body.set("text", text);
        body.set("context", context);
      } else {
        body = JSON.stringify({ text, context });
      }
      const response = await vecibotFetch("/api/vecibot-entrada", {
        method: "POST",
        headers: files.length ? headers : { ...headers, "Content-Type": "application/json" },
        body,
        signal: active.signal,
      });
      const result = await response.json();
      if (active.signal.aborted) return false;
      const extracted = extractionSchema.parse(result.draft);
      if (extracted.intent === "consulta") {
        if (onQuestion) {
          const sent = await onQuestion(
            text || "Analiza los archivos adjuntos y muestra sus datos estructurados.",
            files,
          );
          if (sent === false) return false;
        } else toast.info(extracted.message || "Indica qué quieres registrar y sus datos.");
      } else if (onExtracted) onExtracted(extracted);
      else {
        onAnalyzed?.(extracted, text, files);
        setDraft(extracted);
        setRequestId(crypto.randomUUID());
      }
      return !active.signal.aborted;
    } catch (error) {
      if (!active.signal.aborted) {
        const message = vecibotErrorMessage(error);
        if (onError) onError(message);
        else toast.error(message);
      }
      return false;
    } finally {
      if (!active.signal.aborted) setBusy(false);
      if (controller.current === active) controller.current = null;
    }
  }
  function dismiss() {
    setDraft(null);
    setPreview(null);
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }
  return { analyze, cancel, busy, draft, setDraft, requestId, preview, dismiss };
}
