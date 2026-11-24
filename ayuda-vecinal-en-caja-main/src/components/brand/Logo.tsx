import { cn } from "@/lib/utils";

export function LogoMark({
  className,
}: {
  className?: string;
  mark?: "default" | "cuy";
}) {
  return (
    <img
      src="/brand/ayudate-veci-cuy.png"
      alt="Logotipo de AyúdateVeci"
      width={1328}
      height={1184}
      className={cn("brand-mark", className)}
    />
  );
}

export function Logo({
  className,
  tone = "dark",
  size = "md",
  mark = "cuy",
}: {
  className?: string;
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  mark?: "default" | "cuy";
}) {
  return (
    <div className={cn("brand-logo flex shrink-0 items-center gap-3", className)}>
      <LogoMark
        mark={mark}
      />
      <span
        className={cn(
          "whitespace-nowrap font-display font-bold leading-none tracking-tight",
          size === "lg" ? "text-2xl sm:text-3xl" : "text-xl",
          tone === "light" ? "text-canvas-foreground" : "text-navy",
        )}
      >
        {"Ayúdate"}
        <span className="text-primary">Veci</span>
      </span>
    </div>
  );
}
