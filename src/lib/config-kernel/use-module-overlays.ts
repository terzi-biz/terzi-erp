/** Runtime оверлеї модулів: сервер резолвить company → role актора. Порожньо → код. */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getModuleOverlays } from "./control-plane.functions";
import type { ModuleOverlay } from "./module-overlay";

export function useModuleOverlays(): Record<string, ModuleOverlay | null> {
  const fn = useServerFn(getModuleOverlays);
  const { data } = useQuery({
    queryKey: ["config", "module_overlay", "published"],
    staleTime: 60_000,
    queryFn: async () => { try { return (await fn()) as Record<string, ModuleOverlay | null>; } catch { return {}; } },
  });
  return data ?? {};
}
