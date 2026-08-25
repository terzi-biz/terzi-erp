import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Inbox, ShieldCheck, ShieldAlert, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/crm/intake")({
  component: IntakePage,
  head: () => ({
    meta: [
      { title: "Вхідні ліди — TERZI ERP" },
      { name: "description", content: "Журнал вхідних лідів із сайту та рекламних кабінетів: підпис, дедуплікація, атрибуція." },
      { property: "og:title", content: "Вхідні ліди — TERZI ERP" },
      { property: "og:description", content: "Журнал прийому лідів з підписом, rate-limit і дедуплікацією." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface IntakeRow {
  id: string;
  provider: string;
  source: string | null;
  campaign: string | null;
  signature_ok: boolean;
  phone_norm: string | null;
  email: string | null;
  contact_name: string | null;
  status: string;
  error: string | null;
  lead_id: string | null;
  request_id: string | null;
  utm: Record<string, string> | null;
  gclid: string | null;
  fbclid: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Прийнято",
  duplicate: "Дубль",
  rejected: "Відхилено",
};

function mask(phone: string | null) {
  if (!phone) return "—";
  return phone.length <= 7 ? phone : `${phone.slice(0, 7)}****${phone.slice(-3)}`;
}

function IntakePage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["lead-intake-events"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_intake_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as IntakeRow[];
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => filter === "all" || r.status === filter),
    [data, filter],
  );

  const stats = useMemo(() => {
    const all = data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: all.length,
      today: all.filter((r) => r.created_at.slice(0, 10) === today).length,
      dupes: all.filter((r) => r.status === "duplicate").length,
      rejected: all.filter((r) => r.status === "rejected").length,
    };
  }, [data]);

  const endpoint = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/leads/intake`;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
            <Inbox className="w-6 h-6" /> Вхідні ліди
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Сайт, Google Ads, Meta, TikTok → контакт → лід → звернення. Підпис HMAC, rate-limit, дедуплікація.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Оновити
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        {([
          ["Всього подій", stats.total],
          ["Сьогодні", stats.today],
          ["Дублі", stats.dupes],
          ["Відхилені", stats.rejected],
        ] as [string, number][]).map(([label, v]) => (
          <div key={label} className="panel p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
            <div className="text-2xl font-black mt-1">{v}</div>
          </div>
        ))}
      </div>

      <div className="panel p-3 mb-4 text-xs space-y-2">
        <div className="font-bold uppercase tracking-widest text-muted-foreground text-[10px]">Endpoint для інтеграцій</div>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="px-2 py-1 rounded bg-secondary break-all">POST {endpoint}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(endpoint); toast.success("Скопійовано"); }}
            className="p-1 rounded bg-secondary"
            title="Копіювати"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
        <div className="text-muted-foreground">
          Заголовок <code>x-terzi-signature: sha256=HMAC_SHA256(тіло, LEAD_INTAKE_SECRET)</code>. Тіло:{" "}
          <code>{"{ provider, source, campaign, name, phone, email, message, direction, area, address, utm, gclid, fbclid, external_id }"}</code>.
          Ключ підпису зберігається у секретах бекенду й ніколи не потрапляє у frontend.
        </div>
      </div>

      <div className="flex gap-1 mb-2 flex-wrap">
        {([["all", "Усі"], ["accepted", "Прийнято"], ["duplicate", "Дублі"], ["rejected", "Відхилені"]] as [string, string][]).map(
          ([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded text-xs font-semibold ${filter === id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {error && <div className="panel p-4 text-sm text-destructive">Немає доступу або помилка: {(error as Error).message}</div>}
      {isLoading && <div className="panel p-4 text-sm text-muted-foreground">Завантаження…</div>}
      {!isLoading && !error && rows.length === 0 && (
        <div className="panel p-6 text-sm text-muted-foreground">
          Немає подій за вибраним фільтром. Після підключення форм сайту й рекламних кабінетів заявки з'являться тут.
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel p-0 overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                {["Дата", "Провайдер", "Джерело / кампанія", "Контакт", "UTM / clickid", "Підпис", "Статус", "Лід"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}
                  </td>
                  <td className="px-3 py-2 font-semibold">{r.provider}</td>
                  <td className="px-3 py-2">{r.source ?? "—"}{r.campaign ? ` · ${r.campaign}` : ""}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{r.contact_name ?? "—"}</div>
                    <div className="text-muted-foreground">{mask(r.phone_norm)}</div>
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">
                    {[r.utm?.["utm_source"], r.utm?.["utm_campaign"], r.gclid && "gclid", r.fbclid && "fbclid"]
                      .filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.signature_ok
                      ? <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      : <ShieldAlert className="w-4 h-4 text-destructive" />}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.status === "accepted" ? "bg-emerald-500/15 text-emerald-500"
                      : r.status === "duplicate" ? "bg-amber-500/15 text-amber-500"
                      : "bg-destructive/15 text-destructive"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.error && <div className="text-[10px] text-destructive mt-0.5 max-w-[200px] truncate" title={r.error}>{r.error}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.lead_id
                      ? <a href="/crm/leads" className="text-primary underline">лід</a>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
