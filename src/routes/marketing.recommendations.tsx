import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState } from "@/components/marketing/MarketingShell";
import { listRecommendations, generateRecommendations, setRecommendationStatus } from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing/recommendations")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Рекомендації — Маркетинг TERZI" },
    { name: "description", content: "Рекомендації щодо реклами TERZI на основі правил: перерозподіл бюджету, слабкі кампанії, темп витрат." },
    { property: "og:title", content: "Рекомендації — Маркетинг TERZI" },
    { property: "og:description", content: "Пояснювальні підказки для рішень по рекламних кампаніях TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: RecommendationsPage,
});

function RecommendationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRecommendations);
  const genFn = useServerFn(generateRecommendations);
  const resolveFn = useServerFn(setRecommendationStatus);
  const { data = [], isLoading } = useQuery({ queryKey: ["mkt", "recommendations"], queryFn: () => listFn() });

  const run = async () => {
    try {
      const res = await genFn();
      toast.success(`Сформовано рекомендацій: ${res.created}`);
      qc.invalidateQueries({ queryKey: ["mkt", "recommendations"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  const setStatus = async (id: string, status: "accepted" | "dismissed") => {
    await resolveFn({ data: { id, status } });
    qc.invalidateQueries({ queryKey: ["mkt", "recommendations"] });
  };

  return (
    <MarketingShell title="Рекомендації"
      subtitle="Підказки формуються детермінованими правилами на основі ваших даних — рішення завжди за вами"
      actions={<button onClick={run} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Оновити рекомендації</button>}>
      <Panel title="Активні рекомендації">
        {isLoading ? <EmptyState text="Завантаження…" /> : data.length ? (
          <div className="space-y-2">
            {data.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="text-sm font-semibold">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {r.problem ? <div><span className="font-semibold">Проблема:</span> {r.problem}</div> : null}
                  {r.evidence ? <div><span className="font-semibold">Дані:</span> {r.evidence}</div> : null}
                  {r.recommended_action ? <div><span className="font-semibold">Дія:</span> {r.recommended_action}</div> : null}
                  {r.expected_effect ? <div><span className="font-semibold">Ефект:</span> {r.expected_effect}</div> : null}
                  {r.risk ? <div><span className="font-semibold">Ризик:</span> {r.risk}</div> : null}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setStatus(r.id, "accepted")} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold">Прийняти</button>
                  <button onClick={() => setStatus(r.id, "dismissed")} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">Відхилити</button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState text="Рекомендацій немає — натисніть «Оновити рекомендації»" />}
      </Panel>
    </MarketingShell>
  );
}
