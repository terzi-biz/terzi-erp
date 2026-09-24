import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettingsAccess } from "@/lib/config-kernel/settings-center.functions";

/** Права доступу до розділів Налаштувань (сервер — джерело істини). */
export function useSettingsAccess() {
  const fn = useServerFn(getSettingsAccess);
  const q = useQuery({ queryKey: ["settings-access"], queryFn: () => fn(), staleTime: 60_000 });
  return {
    query: q,
    canManageSettings: q.data?.canManageSettings === true,
    canManageAccess: q.data?.canManageAccess === true,
    canManageFinanceRules: q.data?.canManageFinanceRules === true,
  };
}
