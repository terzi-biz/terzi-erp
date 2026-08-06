import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel } from "@/components/marketing/MarketingShell";
import { CrudPanel } from "@/components/marketing/CrudPanel";
import { listMarketingRefs } from "@/lib/marketing.functions";
import { AD_ANGLES } from "@/lib/marketing/kpi";

export const Route = createFileRoute("/marketing/creatives")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Креативи — Маркетинг TERZI" },
    { name: "description", content: "Банк рекламних креативів TERZI: формати, тексти, рекламні кути та болі клієнта." },
    { property: "og:title", content: "Креативи — Маркетинг TERZI" },
    { property: "og:description", content: "Керування креативами та рекламними кутами кампаній TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CreativesPage,
});

function CreativesPage() {
  const refsFn = useServerFn(listMarketingRefs);
  const { data: refs } = useQuery({ queryKey: ["mkt", "refs"], queryFn: () => refsFn() });

  return (
    <MarketingShell title="Креативи" subtitle="Формати, тексти, рекламні кути, болі клієнта">
      <Panel title="Банк креативів">
        <CrudPanel
          table="marketing_creatives"
          rows={(refs?.creatives ?? []) as unknown as Record<string, unknown>[]}
          emptyText="Креативів ще немає"
          fields={[
            { key: "name", label: "Назва", required: true },
            { key: "media_type", label: "Тип медіа", type: "select", options: ["image", "video", "carousel", "text", "story"].map((v) => ({ value: v, label: v })) },
            { key: "advertising_angle", label: "Рекламний кут", type: "select", options: AD_ANGLES.map((v) => ({ value: v, label: v })) },
            { key: "service", label: "Послуга" },
            { key: "status", label: "Статус", type: "select", options: [{ value: "active", label: "Активний" }, { value: "paused", label: "Пауза" }, { value: "archived", label: "Архів" }] },
            { key: "headline", label: "Заголовок", inTable: false },
            { key: "primary_text", label: "Основний текст", type: "textarea", inTable: false },
            { key: "description", label: "Опис", type: "textarea", inTable: false },
            { key: "cta", label: "CTA", inTable: false },
            { key: "pain_point", label: "Біль клієнта", inTable: false },
            { key: "file_url", label: "Посилання на медіа", inTable: false },
            { key: "language", label: "Мова", inTable: false },
          ]}
        />
      </Panel>
    </MarketingShell>
  );
}
