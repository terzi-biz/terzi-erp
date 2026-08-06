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

const NOTES: Record<string, string> = {
  google_ads: "Витрати, кампанії, кліки, покази",
  meta_ads: "Витрати, кампанії, креативи, ліди з форм",
  ga4: "Поведінка на сайті та джерела трафіку",
  search_console: "Органічний пошук, запити, позиції",
  google_business: "Дзвінки та маршрути з картки компанії",
  binotel: "Дзвінки, записи, пропущені — вже працює в ERP",
  keycrm: "Ліди й угоди — вже працює в ERP",
  site_forms: "Заявки з лендінгів через вебхук",
};

const statusLabel = (s: string) =>
  s === "connected" ? "підключено" : s === "error" ? "помилка" : s === "connecting" ? "підключення…" : s === "disabled" ? "вимкнено" : "не підключено";

function IntegrationsPage() {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateMarketingIntegration);
  const testFn = useServerFn(testMarketingIntegration);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mkt", "integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_integrations").select("*").order("priority");
      if (error) throw error;
      return data;
    },
  });

  const setStatus = async (provider: string, status: "not_connected" | "disabled") => {
    try {
      await saveFn({ data: { provider, connection_status: status } });
      toast.success(status === "disabled" ? "Інтеграцію вимкнено" : "Інтеграцію увімкнено");
      qc.invalidateQueries({ queryKey: ["mkt", "integrations"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  const test = async (provider: string) => {
    try {
      const res = await testFn({ data: { provider } });
      if (res.ok) toast.success(res.message); else toast.error(res.message);
      qc.invalidateQueries({ queryKey: ["mkt", "integrations"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
  };

  return (
    <MarketingShell title="Інтеграції" subtitle="Джерела даних маркетингу. Статус «підключено» з'являється лише після успішної перевірки">
      <Panel title="Доступні підключення">
        {isLoading ? <EmptyState text="Завантаження…" /> : rows.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground">{NOTES[r.provider] ?? r.provider}</div>
                  </div>
                  <span className={`text-[10px] uppercase font-semibold ${r.connection_status === "connected" ? "text-success" : r.connection_status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                    {statusLabel(r.connection_status)}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setStatus(r.provider, r.connection_status === "disabled" ? "not_connected" : "disabled")}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold">
                    {r.connection_status === "disabled" ? "Увімкнути" : "Вимкнути"}
                  </button>
                  <button onClick={() => test(r.provider)} className="rounded-md border border-border px-2 py-1 text-[11px]">Перевірити</button>
                </div>
                {r.last_error ? <div className="mt-1 text-[11px] text-destructive">{r.last_error}</div> : null}
                {r.is_read_only ? <div className="mt-1 text-[10px] text-muted-foreground">Режим «тільки читання»</div> : null}
              </div>
            ))}
          </div>
        ) : <EmptyState text="Список інтеграцій порожній" />}
      </Panel>
    </MarketingShell>
  );
}
