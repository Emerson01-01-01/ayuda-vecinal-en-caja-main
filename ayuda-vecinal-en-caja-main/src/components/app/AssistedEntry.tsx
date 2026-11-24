import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssistedEntry({ context }: { context: "venta" | "compra" }) {
  return (
    <Button asChild variant="outline" className="mb-4">
      <Link to="/app/vecibot" search={{ entrada: context }}>
        <Bot /> Registrar con VeciBot
      </Link>
    </Button>
  );
}
