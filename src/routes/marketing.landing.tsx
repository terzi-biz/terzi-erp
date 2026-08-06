import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel } from "@/components/marketing/MarketingShell";
import { CrudPanel } from "@/components/marketing/CrudPanel";
import { listMarketingRefs } from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing/landing")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Посадкові сторінки — Маркетинг TERZI" },
    { name: "description", content: "Лендінги та сайти TERZI: конверсія, форми, швидкість завантаження, зв'язок з кампаніями." },
    { property: "og:title", content: "Посадкові сторінки — Маркетинг TERZI" },
    { property: "og:description", content: "Керування лендінгами та їх конверсією у ліди TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LandingPage,
});

function LandingPage() {
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });

  return (
    <MarketingShell title="Посадкові сторінки" subtitle="Лендінги, форми, конверсія та швидкість завантаження">
      <Panel title="Сторінки">
        <CrudPanel
          table="marketing_landing_pages"
          rows={(refs?.landing ?? []) as unknown as Record<string, unknown>[]}
          emptyText="Сторінок ще немає"
          fields={[
            { key: "name", label: "Назва", required: true },
            { key: "url", label: "URL", required: true },
            { key: "service", label: "Послуга" },
            { key: "form_count", label: "К-сть форм", type: "number" },
            { key: "conversion_rate", label: "Конверсія, %", type: "number" },
            { key: "load_time_ms", label: "Завантаження, мс", type: "number", inTable: false },
            { key: "status", label: "Статус", type: "select", inTable: false, options: [{ value: "active", label: "Активна" }, { value: "archived", label: "Архів" }] },
            { key: "notes", label: "Нотатки", type: "textarea", inTable: false },
          ]}
        />
      </Panel>
    </MarketingShell>
  );
}
