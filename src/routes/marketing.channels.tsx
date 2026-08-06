import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState } from "@/components/marketing/MarketingShell";
import { CrudPanel } from "@/components/marketing/CrudPanel";
import { listMarketingRefs } from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing/channels")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Рекламні канали — Маркетинг TERZI" },
    { name: "description", content: "Довідник рекламних каналів TERZI: платні, органічні, месенджери, офлайн і партнерські джерела." },
    { property: "og:title", content: "Рекламні канали — Маркетинг TERZI" },
    { property: "og:description", content: "Керування джерелами трафіку та рекламними каналами TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ChannelsPage,
});

function ChannelsPage() {
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs, isLoading } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });

  return (
    <MarketingShell title="Рекламні канали" subtitle="Джерела трафіку: платні, органічні, месенджери, офлайн, партнери">
      <Panel title="Канали">
        {isLoading ? <EmptyState text="Завантаження…" /> : (
          <CrudPanel
            table="marketing_channels"
            rows={(refs?.channels ?? []) as unknown as Record<string, unknown>[]}
            emptyText="Каналів немає"
            fields={[
              { key: "name", label: "Назва", required: true },
              { key: "channel_type", label: "Тип", type: "select", options: [
                { value: "paid", label: "Платний" }, { value: "organic", label: "Органічний" },
                { value: "messenger", label: "Месенджер" }, { value: "referral", label: "Рекомендації" },
                { value: "partner", label: "Партнер" }, { value: "offline", label: "Офлайн" },
              ] },
              { key: "platform", label: "Платформа" },
              { key: "status", label: "Статус" },
              { key: "sort_order", label: "Порядок", type: "number" },
              { key: "key", label: "Ключ", inTable: false },
            ]}
          />
        )}
      </Panel>

      <Panel title="Рекламні кабінети">
        <CrudPanel
          table="marketing_accounts"
          rows={(refs?.accounts ?? []) as unknown as Record<string, unknown>[]}
          emptyText="Кабінетів ще немає"
          fields={[
            { key: "name", label: "Назва", required: true },
            { key: "channel_id", label: "Канал", type: "select", options: (refs?.channels ?? []).map((c) => ({ value: c.id, label: c.name })),
              render: (r) => refs?.channels.find((c) => c.id === r.channel_id)?.name ?? "—" },
            { key: "external_account_id", label: "ID кабінету" },
            { key: "currency", label: "Валюта" },
            { key: "connection_status", label: "Стан підключення", type: "select", options: [
              { value: "not_connected", label: "Не підключено" }, { value: "connected", label: "Підключено" }, { value: "error", label: "Помилка" },
            ] },
          ]}
        />
      </Panel>
    </MarketingShell>
  );
}
