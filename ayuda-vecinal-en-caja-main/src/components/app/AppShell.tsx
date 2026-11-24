import { Link, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, MapPin } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSignOut } from "@/hooks/use-sign-out";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, NAV_ITEMS } from "./nav";

function isActive(pathname: string, to: string, exact?: boolean) {
  const p = pathname.replace(/\/$/, "") || "/";
  return exact ? p === to : p === to || p.startsWith(`${to}/`);
}

export function AppShell({
  storeName,
  barrio,
  children,
}: {
  storeName: string;
  barrio: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const signOut = useSignOut();
  const [moreOpen, setMoreOpen] = useState(false);

  const navList = (onNavigate?: () => void, light = true) => (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.to, "exact" in item ? item.exact : false);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm font-semibold transition-colors",
              light
                ? active
                  ? "border-info/30 bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                : active
                  ? "border-info/30 bg-info-soft text-accent-foreground"
                  : "text-navy hover:bg-muted",
            )}
          >
            <Icon className="size-5" />
            {item.label}

          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell min-h-screen bg-canvas">
      {/* Menú lateral (computadoras) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Link to="/app" className="px-1">
          <Logo tone="light" />
        </Link>
        <div className="mx-1 mt-5 rounded-xl bg-sidebar-accent px-3 py-2.5">
          <p className="truncate text-sm font-bold text-sidebar-accent-foreground">{storeName}</p>
          {barrio && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-sidebar-foreground">
              <MapPin className="size-3" /> {barrio}
            </p>
          )}
        </div>
        <div className="mt-5 flex-1 overflow-y-auto">{navList()}</div>
        <button
          onClick={signOut}
          className="visual-button mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-5" /> Cerrar sesión
        </button>
      </aside>

      {/* Cabecera (celulares) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-canvas/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link to="/app">
          <Logo tone="light" size="sm" />
        </Link>
        <div className="min-w-0 max-w-[40%] text-right">
          <p className="truncate text-xs font-bold text-canvas-foreground">{storeName}</p>
          {barrio && <p className="truncate text-[11px] text-canvas-muted">{barrio}</p>}
        </div>
      </header>

      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-72 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto min-w-0 max-w-6xl">{children}</div>
      </main>

      {/* Navegación inferior (celulares) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-2 pt-1.5 shadow-float backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_TABS.map((to) => {
            const item = NAV_ITEMS.find((n) => n.to === to)!;
            const active = isActive(pathname, to, to === "/app");
            const Icon = item.icon;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold",
                  active ? "text-info" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-info-soft ring-1 ring-info/25")}>
                  <Icon className="size-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="visual-button flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" />
            </span>
            Más
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-left text-navy">Menú</SheetTitle>
          </SheetHeader>
          <div className="mt-2 px-1 pb-4">
            {navList(() => setMoreOpen(false), false)}
            <button
              onClick={() => {
                setMoreOpen(false);
                signOut();
              }}
              className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive-soft"
            >
              <LogOut className="size-5" /> Cerrar sesión
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
