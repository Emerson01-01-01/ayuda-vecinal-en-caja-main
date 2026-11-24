import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { localAuth } from "@/lib/local-client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await localAuth.session();
    if (!user) {
      throw redirect({ to: "/auth", search: { mode: "login", redirect: location.href } });
    }
    return { user };
  },
  component: () => <Outlet />,
});
