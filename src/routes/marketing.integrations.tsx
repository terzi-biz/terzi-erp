import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState } from "@/components/marketing/MarketingShell";
import { updateMarketingIntegration, testMarketingIntegration } from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing/integrations")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Інтеграції маркетингу — TERZI" },
    { name: "description", content: "Підключення рекламних кабінетів, аналітики та телефонії до маркетингового модуля TERZI." },
    { property: "og:title", content: "Інтеграції маркетингу — TERZI" },
    { property: "og:description", content: "Стан підключення Google Ads, Meta, GA4, Binotel та інших джерел даних." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: IntegrationsPage,
});

type Row = { key: string; name: string; note: string };
const CATALOG: Row[] = [
  { key: "google_ads", name: "Google Ads", note: "Витрати, кампанії, кліки, покази" },
  { key: "meta_ads", name: "Meta Ads", note: "Витрати, кампанії, креативи, ліди з форм" },
  { key: "ga4", name: "Google Analytics 4", note: "Поведінка на сайті та джерела трафіку" },
  { key: "search_console", name: "Google Search Console", note: "Органічний пошук, запити, позиції" },
  { key: "gmb", name: "Google Business Profile", note: "Дзвінки та маршрути з картки компанії" },
  { key: "binotel", name: "Binotel", note: "Дзвінки, записи, пропущені — вже працює в ERP" },
  { key: "keycrm", name: "keyCRM", note: "Ліди й угоди — вже працює в ERP" },
  { key: "site_forms", name: "Форми сайту", note: "Заявки з лендінгів через вебхук" },
];

function IntegrationsPage() {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateMarketingIntegration);
  const testFn = useServerFn(testMarketingIntegration);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mkt", "integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_integrations").select("*");
      if (error) throw error;
      return data;
    },
  });

  const stateOf = (key: string) => rows.find((r) => r.provider_key === key);

  const toggle = async (key: string, name: string, enabled: boolean) => {
    try {
      await saveFn({ data: { providerKey: key, name, enabled } });
      toast.success(enabled ? "Увімкнено" : "Вимкнено");
      qc.invalidateQueries({ queryKey: ["mkt", "integrations"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  const test = async (key: string) => {
    try {
      const res = await testFn({ data: { providerKey: key } });
      res.ok ? toast.success(res.message) : toast.error(res.message);
      qc.invalidateQueries({ queryKey: ["mkt", "integrations"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  return (
    <MarketingShell title="Інтеграції" subtitle="Джерела даних маркетингу. Статус «підключено» з'являється лише після успішної перевірки">
      <Panel title="Доступні підключення">
        {isLoading ? <EmptyState text="Завантаження…" /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {CATALOG.map((c) => {
              const st = stateOf(c.key);
              const status = st?.connection_status ?? "not_connected";
              return (
                <div key={c.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.note}</div>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold ${status === "connected" ? "text-success" : status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      {status === "connected" ? "підключено" : status === "error" ? "помилка" : "не підключено"}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => toggle(c.key, c.name, !st?.enabled)}
                      className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold">
                      {st?.enabled ? "Вимкнути" : "Увімкнути"}
                    </button>
                    <button onClick={() => test(c.key)} className="rounded-md border border-border px-2 py-1 text-[11px]">Перевірити</button>
                  </div>
                  {st?.last_error ? <div className="mt-1 text-[11px] text-destructive">{st.last_error}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </MarketingShell>
  );
}
