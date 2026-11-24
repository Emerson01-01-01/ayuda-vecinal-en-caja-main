import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { localAuth } from "@/lib/local-client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    const { error } = await localAuth.logout();
    if (error) return void toast.error(error.message);
    await queryClient.cancelQueries();
    queryClient.clear();
    toast.success("Cerraste sesión. ¡Hasta pronto!");
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  };
}
