import { useRef } from "react";
import { Camera, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_ACCEPT, validateFiles } from "@/lib/vecibot-files";

export function ChatFileInput({
  files,
  onFiles,
  disabled,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  function select(input: HTMLInputElement) {
    const added = Array.from(input.files || []);
    input.value = "";
    if (!added.length) return;
    const next = [...files, ...added];
    const error = validateFiles(next);
    if (error) return void toast.error(error);
    onFiles(next);
  }
  return (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        aria-label="Archivo de cámara"
        disabled={disabled}
        onChange={(e) => select(e.currentTarget)}
      />
      <input
        ref={upload}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        aria-label="Fotos, documentos, audio y videos"
        disabled={disabled}
        onChange={(e) => select(e.currentTarget)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        <Camera /> Foto
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => upload.current?.click()}
      >
        <Paperclip /> Subir
      </Button>
    </>
  );
}
