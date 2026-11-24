import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { LoadingBlock } from "@/components/app/kit";
import { storeQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Mi tienda — AyúdateVeci" },
      { name: "description", content: "Panel de administración de tu tienda de víveres." },
      { property: "og:title", content: "Mi tienda — AyúdateVeci" },
      { property: "og:description", content: "Panel de administración de tu tienda de víveres." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
  pendingComponent: () => <LoadingBlock label="Abriendo tu tienda…" />,
  component: AppLayout,
});

function AppLayout() {
  const { data } = useSuspenseQuery(storeQuery);
  return (
    <AppShell storeName={data.store.name} barrio={data.store.barrio}>
      <Outlet />
    </AppShell>
  );
}
