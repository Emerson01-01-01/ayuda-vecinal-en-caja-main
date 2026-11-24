import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attachmentMediaType } from "@/lib/vecibot-files";
import type { LocalFileResult } from "@/lib/vecibot-local-files";

export function ChatFilePreview({ file, disabled, onRemove, onPlaybackStart }: { file: File; disabled: boolean; onRemove?: (() => void) | undefined; onPlaybackStart?: (() => void) | undefined }) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<LocalFileResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const type = attachmentMediaType(file);
  useEffect(() => {
    const value = URL.createObjectURL(file); setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  async function extract() {
    setWorking(true); setError("");
    try {
      const { extractLocalFile } = await import("@/lib/vecibot-local-files");
      setResult(await extractLocalFile(file));
    } catch { setError("No pude extraer el texto. El documento puede estar dañado, cifrado o usar un formato no compatible. No se analizó su contenido."); }
    finally { setWorking(false); }
  }
  return <li className="rounded-lg border bg-card p-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-all">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
      <Button type="button" size="sm" variant="ghost" disabled={working} onClick={() => void extract()}>{working ? "Extrayendo…" : "Extraer texto / ver estado"}</Button>
      {onRemove && <Button type="button" size="sm" variant="ghost" disabled={disabled || working} aria-label={`Quitar ${file.name}`} onClick={onRemove}>Quitar</Button>}
      {!onRemove && url && <a href={url} download={file.name} className="underline">Descargar adjunto</a>}
    </div>
    {url && type.startsWith("image/") && <img src={url} alt={`Vista previa: ${file.name}`} className="mt-2 max-h-32 max-w-full rounded object-contain" />}
    {url && type.startsWith("audio/") && <audio controls preload="metadata" src={url} onPlay={onPlaybackStart} className="mt-2 max-w-full" aria-label={`Audio: ${file.name}`} />}
    {url && type.startsWith("video/") && <video controls preload="metadata" src={url} onPlay={onPlaybackStart} className="mt-2 max-h-40 max-w-full rounded" aria-label={`Video: ${file.name}`} />}
    {url && type === "application/pdf" && <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">Abrir vista previa del PDF</a>}
    {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    {result && <div className="mt-2"><p role="status">{result.notice}</p>{result.text && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans">{result.text}</pre>}</div>}
  </li>;
}
