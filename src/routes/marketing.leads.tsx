import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState } from "@/components/marketing/MarketingShell";
import { listAttributedLeads, listMarketingRefs, updateLeadMarketing, getLeadTouchpoints } from "@/lib/marketing.functions";
import { LEAD_QUALITIES } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/leads")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Ліди та атрибуція — Маркетинг TERZI" },
    { name: "description", content: "Атрибуція лідів TERZI: перше і останнє торкання, канал, кампанія, креатив, якість ліда." },
    { property: "og:title", content: "Ліди та атрибуція — Маркетинг TERZI" },
    { property: "og:description", content: "Кваліфікація лідів і повна хронологія рекламних торкань." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LeadsPage,
});

function LeadsPage() {
  const qc = useQueryClient();
  const leadsFn = useServerFn(listAttributedLeads);
  const refsFn = useServerFn(listMarketingRefs);
  const saveFn = useServerFn(updateLeadMarketing);
  const touchFn = useServerFn(getLeadTouchpoints);

  const { data: leads = [], isLoading } = useQuery({ queryKey: ["mkt", "leads"], queryFn: () => leadsFn() });
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data: touchpoints = [] } = useQuery({
    queryKey: ["mkt", "touchpoints", sel],
    queryFn: () => touchFn({ data: { leadId: sel! } }),
    enabled: !!sel,
  });

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return leads.filter((l) => !nq || (l.title ?? "").toLowerCase().includes(nq));
  }, [leads, q]);

  const lead = leads.find((l) => l.id === sel) ?? null;
  const name = (list: { id: string; name: string }[] | undefined, id: string | null) => list?.find((x) => x.id === id)?.name ?? "—";

  const patch = async (values: Record<string, string | null>) => {
    if (!sel) return;
    try {
      await saveFn({ data: { leadId: sel, ...values } as never });
      toast.success("Оновлено");
      qc.invalidateQueries({ queryKey: ["mkt", "leads"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  return (
    <MarketingShell title="Ліди та атрибуція" subtitle="Перше і останнє торкання, канал, кампанія, креатив, якість ліда">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук ліда…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`Ліди (${rows.length})`}>
          {isLoading ? <EmptyState text="Завантаження…" /> : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left py-1">Лід</th><th className="text-left">Канал</th><th className="text-left">Якість</th><th className="text-right">Дата</th></tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className={`border-t border-border/60 cursor-pointer ${sel === l.id ? "bg-secondary/60" : ""}`} onClick={() => setSel(l.id)}>
                      <td className="py-2 pr-2 max-w-[220px] truncate">{l.title}</td>
                      <td className="pr-2">{name(refs?.channels, l.marketing_channel_id) }</td>
                      <td className="pr-2">{l.lead_quality ?? <span className="text-destructive">не оброблений</span>}</td>
                      <td className="text-right text-muted-foreground">{new Date(l.created_at).toLocaleDateString("uk-UA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState text="Лідів немає" />}
        </Panel>

        <Panel title="Маркетингова картка ліда">
          {!lead ? <EmptyState text="Оберіть лід зі списку" /> : (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-sm">{lead.title}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-muted-foreground">First touch:</span> {lead.first_touch_at ? new Date(lead.first_touch_at).toLocaleString("uk-UA") : "—"}</div>
                <div><span className="text-muted-foreground">Last touch:</span> {lead.last_touch_at ? new Date(lead.last_touch_at).toLocaleString("uk-UA") : "—"}</div>
                <div><span className="text-muted-foreground">Джерело:</span> {lead.source ?? "—"}</div>
                <div><span className="text-muted-foreground">UTM campaign:</span> {(lead.utm as { campaign?: string } | null)?.campaign ?? lead.campaign ?? "—"}</div>
              </div>

              {[
                { k: "lead_quality", label: "Якість ліда", opts: LEAD_QUALITIES.map((v) => ({ value: v, label: v })) },
                { k: "disqualify_reason_id", label: "Причина нецільового", opts: (refs?.reasons ?? []).map((r) => ({ value: r.id, label: r.name })) },
                { k: "marketing_channel_id", label: "Канал", opts: (refs?.channels ?? []).map((c) => ({ value: c.id, label: c.name })) },
                { k: "marketing_campaign_id", label: "Кампанія", opts: (refs?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name })) },
                { k: "marketing_creative_id", label: "Креатив", opts: (refs?.creatives ?? []).map((c) => ({ value: c.id, label: c.name })) },
                { k: "landing_page_id", label: "Посадкова сторінка", opts: (refs?.landing ?? []).map((c) => ({ value: c.id, label: c.name })) },
              ].map((f) => (
                <label key={f.k} className="block">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                  <select value={String((lead as Record<string, unknown>)[f.k] ?? "")}
                    onChange={(e) => patch({ [f.k]: e.target.value || null })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                    <option value="">—</option>
                    {f.opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Хронологія торкань</div>
                {touchpoints.length ? (
                  <ul className="space-y-1">
                    {touchpoints.map((t) => (
                      <li key={t.id} className="flex justify-between border-b border-border/60 pb-1">
                        <span>{t.touchpoint_type} · {t.source ?? "—"}</span>
                        <span className="text-muted-foreground">{new Date(t.occurred_at).toLocaleString("uk-UA")}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState text="Торкань ще не зафіксовано" />}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </MarketingShell>
  );
}
