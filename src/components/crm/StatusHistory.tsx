/**
 * Історія переходів між етапами: ліди — crm_lead_activities (from/to stage) + entity_status_history;
 * заміри — entity_status_history (entity_type = 'measurement').
 */
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MEASUREMENT_STATUS_LABELS, canonicalMeasurementStatus } from "@/lib/measurement-status";

const LEAD_STATUS: Record<string, string> = { open: "Відкритий", won: "Виграно", lost: "Втрачено", postponed: "Відкладено" };
const fmt = (v: string) => new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Item = { at: string; from: string | null; to: string; who: string | null };

export function StatusHistory({ entity, id }: { entity: "lead" | "measurement"; id: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["status-history", entity, id],
    queryFn: async (): Promise<Item[]> => {
      const items: Item[] = [];
      const { data: esh } = await supabase.from("entity_status_history")
        .select("old_status,new_status,changed_at,changed_by").eq("entity_type", entity).eq("entity_id", id)
        .order("changed_at", { ascending: false }).limit(50);
      const label = (s: string | null) => !s ? null : entity === "measurement"
        ? MEASUREMENT_STATUS_LABELS[canonicalMeasurementStatus(s)] : (LEAD_STATUS[s] ?? s);
      const userIds = new Set<string>();
      for (const r of esh ?? []) {
        if ((r as any).changed_by) userIds.add((r as any).changed_by);
        items.push({ at: (r as any).changed_at, from: label((r as any).old_status), to: label((r as any).new_status) ?? "—", who: (r as any).changed_by });
      }
      if (entity === "lead") {
        const { data: acts } = await supabase.from("crm_lead_activities")
          .select("from_stage_id,to_stage_id,created_at,actor_name,actor_id").eq("lead_id", id)
          .not("to_stage_id", "is", null).order("created_at", { ascending: false }).limit(50);
        const stageIds = Array.from(new Set((acts ?? []).flatMap((a: any) => [a.from_stage_id, a.to_stage_id]).filter(Boolean)));
        const names = new Map<string, string>();
        if (stageIds.length) {
          const { data: st } = await supabase.from("crm_stages").select("id,name").in("id", stageIds);
          for (const s of st ?? []) names.set((s as any).id, (s as any).name);
        }
        for (const a of acts ?? []) {
          items.push({ at: (a as any).created_at, from: names.get((a as any).from_stage_id) ?? null, to: names.get((a as any).to_stage_id) ?? "Етап", who: (a as any).actor_name ?? (a as any).actor_id });
        }
      }
      const ids = [...userIds];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id,display_name,email").in("user_id", ids);
        const m = new Map((profs ?? []).map((p: any) => [p.user_id, p.display_name || p.email]));
        for (const it of items) if (it.who && m.has(it.who)) it.who = m.get(it.who) as string;
      }
      return items.sort((a, b) => b.at.localeCompare(a.at));
    },
  });

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-bold"><History className="h-4 w-4" /> Історія етапів ({data.length})</div>
      {isLoading ? <div className="text-xs text-muted-foreground">Завантаження…</div> : null}
      {!isLoading && !data.length ? <div className="text-xs text-muted-foreground">Переходів ще не зафіксовано</div> : null}
      <ol className="max-h-64 space-y-1.5 overflow-y-auto">
        {data.map((it, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 border-l-2 border-primary/40 pl-2 text-xs">
            <span className="text-muted-foreground">{fmt(it.at)}</span>
            <span>{it.from ? <>{it.from} → </> : null}<b>{it.to}</b></span>
            {it.who && !/^[0-9a-f-]{36}$/.test(it.who) ? <span className="text-muted-foreground">· {it.who}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
