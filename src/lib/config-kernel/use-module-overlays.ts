/** Runtime-читання опублікованих оверлеїв модулів (RLS: лише published). Порожньо → код. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveConfig } from "./lifecycle";
import type { ModuleOverlay } from "./module-overlay";

export function useModuleOverlays(): Record<string, ModuleOverlay | null> {
  const { data } = useQuery({
    queryKey: ["config", "module_overlay", "published"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("config_entries")
        .select("kind,key,scope_type,scope_id,status,payload")
        .eq("kind", "module_overlay").eq("status", "published");
      if (error) return {};
      const keys: string[] = [...new Set<string>((rows ?? []).map((r: any) => String(r.key)))];
      const out: Record<string, ModuleOverlay | null> = {};
      for (const k of keys) out[k] = resolveConfig("module_overlay", k, rows ?? [], {}).value;
      return out;
    },
  });
  return data ?? {};
}
