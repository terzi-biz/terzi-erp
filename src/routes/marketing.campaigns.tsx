import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState } from "@/components/marketing/MarketingShell";
import { CrudPanel } from "@/components/marketing/CrudPanel";
import { listMarketingRefs } from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing/campaigns")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Кампанії — Маркетинг TERZI" },
    { name: "description", content: "Рекламні кампанії TERZI: бюджети, послуга, тип клієнта, посадкова сторінка, щоденні витрати." },
    { property: "og:title", content: "Кампанії — Маркетинг TERZI" },
    { property: "og:description", content: "Керування рекламними кампаніями та щоденними показниками TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CampaignsPage,
});

function CampaignsPage() {
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs, isLoading } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });

  const campaignOpts = (refs?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <MarketingShell title="Кампанії" subtitle="Бюджети, тип кампанії, послуга, посадкова сторінка та щоденні витрати">
      <Panel title="Кампанії">
        {isLoading ? <EmptyState text="Завантаження…" /> : (
          <CrudPanel
            table="marketing_campaigns"
            rows={(refs?.campaigns ?? []) as unknown as Record<string, unknown>[]}
            emptyText="Кампаній ще немає — додайте вручну або підключіть рекламний кабінет"
            fields={[
              { key: "name", label: "Назва", required: true },
              { key: "channel_id", label: "Канал", type: "select", options: (refs?.channels ?? []).map((c) => ({ value: c.id, label: c.name })),
                render: (r) => refs?.channels.find((c) => c.id === r.channel_id)?.name ?? "—" },
              { key: "campaign_type", label: "Тип", type: "select", options: ["search", "lead_form", "landing", "retargeting", "brand", "performance_max", "organic", "offline", "partner"].map((v) => ({ value: v, label: v })) },
              { key: "status", label: "Статус", type: "select", options: [{ value: "active", label: "Активна" }, { value: "paused", label: "Пауза" }, { value: "archived", label: "Архів" }] },
              { key: "monthly_budget", label: "Місячний бюджет", type: "number" },
              { key: "account_id", label: "Кабінет", type: "select", inTable: false, options: (refs?.accounts ?? []).map((a) => ({ value: a.id, label: a.name })) },
              { key: "service", label: "Послуга", inTable: false },
              { key: "client_type", label: "Тип клієнта", type: "select", inTable: false, options: [{ value: "B2C", label: "B2C" }, { value: "B2B", label: "B2B" }] },
              { key: "daily_budget", label: "Денний бюджет", type: "number", inTable: false },
              { key: "landing_page_id", label: "Лендінг", type: "select", inTable: false, options: (refs?.landing ?? []).map((l) => ({ value: l.id, label: l.name })) },
              { key: "start_date", label: "Початок", type: "date", inTable: false },
              { key: "end_date", label: "Завершення", type: "date", inTable: false },
            ]}
          />
        )}
      </Panel>

      <Panel title="Щоденні показники (ручне внесення / імпорт)">
        <CrudPanel
          table="marketing_daily_metrics"
          rows={[]}
          emptyText="Показники додаються тут вручну або автоматично інтеграціями. Перегляд агрегатів — у розділах «Огляд» та «Аналітика»."
          fields={[
            { key: "date", label: "Дата", type: "date", required: true },
            { key: "campaign_id", label: "Кампанія", type: "select", options: campaignOpts },
            { key: "channel_id", label: "Канал", type: "select", options: (refs?.channels ?? []).map((c) => ({ value: c.id, label: c.name })) },
            { key: "spend", label: "Витрата", type: "number" },
            { key: "impressions", label: "Покази", type: "number" },
            { key: "clicks", label: "Кліки", type: "number" },
            { key: "platform_leads", label: "Ліди платформи", type: "number", inTable: false },
          ]}
        />
      </Panel>
    </MarketingShell>
  );
}
