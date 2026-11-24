import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/vecibot-input";

export function ImageInputButtons({
  onImage,
  disabled = false,
}: {
  onImage: (file: File) => void;
  disabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  function select(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.some((type) => type === file.type))
      return void toast.error(
        "Usa una foto JPEG, PNG o WebP. Convierte las fotos HEIC antes de subirlas.",
      );
    if (file.size > MAX_IMAGE_BYTES)
      return void toast.error("La foto debe pesar como máximo 5 MB.");
    if (!file.size) return void toast.error("La foto está vacía. Selecciona otra.");
    onImage(file);
  }
  return (
    <>
      <input
        ref={camera}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        capture="environment"
        className="hidden"
        aria-label="Archivo de cámara"
        onChange={(e) => select(e.currentTarget)}
      />
      <input
        ref={gallery}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="hidden"
        aria-label="Archivo de foto"
        onChange={(e) => select(e.currentTarget)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => camera.current?.click()}
        aria-label="Tomar foto"
      >
        <Camera /> Foto
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => gallery.current?.click()}
        aria-label="Subir foto"
      >
        <ImagePlus /> Subir
      </Button>
    </>
  );
}
