import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationHealth } from "@/lib/integrations/health.functions";
import type { HealthState } from "@/lib/integrations/health";

const STATE: Record<HealthState, { label: string; cls: string }> = {
  connected: { label: "Підключено", cls: "bg-success/15 text-success border-success/40" },
  degraded: { label: "Застаріло", cls: "bg-warning/15 text-warning border-warning/40" },
  legacy: { label: "Legacy-статус", cls: "bg-warning/15 text-warning border-warning/40" },
  configured: { label: "Налаштовано, не перевірено", cls: "bg-warning/15 text-warning border-warning/40" },
  error: { label: "Помилка", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  not_configured: { label: "Не налаштовано", cls: "bg-muted text-muted-foreground border-border" },
};
const CAP: Record<string, string> = { test: "тест", sync: "синхр.", webhook_in: "вхідний вебхук", outbound: "вихідні", conversions: "конверсії", oauth: "OAuth" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export function HealthOverview({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const fn = useServerFn(getIntegrationHealth);
  const { data, isLoading, error } = useQuery({ queryKey: ["integration-health"], queryFn: () => fn() });
  if (isLoading) return <div className="text-sm text-muted-foreground">Завантаження стану інтеграцій…</div>;
  if (error || !data) return <div className="text-sm text-destructive">Не вдалося отримати стан інтеграцій</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.records.map((r) => {
          const s = STATE[r.state];
          return (
            <button key={r.id} type="button" onClick={() => r.tab && onOpenTab(r.tab)}
              className={`text-left rounded-lg border bg-card p-3 ${r.tab ? "hover:border-primary" : "cursor-default"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{r.label}</div>
                  <div className="text-[11px] text-muted-foreground">{r.account ?? "Акаунт невідомий"}</div>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${s.cls}`}>{s.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{r.reason}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 text-[11px]">
                <dt className="text-muted-foreground">API-тест</dt><dd>{fmt(r.lastTestAt)}{r.lastTestOk === false ? " ✕" : ""}</dd>
                <dt className="text-muted-foreground">Синхронізація</dt><dd>{fmt(r.lastSyncAt)}</dd>
                <dt className="text-muted-foreground">Подія/вебхук</dt><dd>{fmt(r.lastEventAt)}</dd>
              </dl>
              {r.facts.map((f) => <div key={f} className="mt-1 text-[11px]">{f}</div>)}
              {r.lastError ? <div className="mt-1 line-clamp-2 text-[11px] text-destructive">{r.lastError}</div> : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {r.capabilities.length ? r.capabilities.map((c) => (
                  <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{CAP[c]}</span>
                )) : <span className="text-[10px] text-muted-foreground">Адаптер ще не реалізовано</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 font-bold">Якість даних і готовність атрибуції</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.readiness.map((m) => {
            const pct = m.count !== null && m.total ? Math.round((m.count / m.total) * 100) : null;
            const warn = m.total === null || m.total === 0 || (pct !== null && pct < 50);
            return (
              <div key={m.label} className="flex items-center justify-between gap-2 text-sm">
                <span>{m.label}</span>
                <span className={warn ? "text-warning font-semibold" : "font-semibold"}>
                  {m.total === null ? "немає доступу" : m.total === 0 ? "немає даних" : `${m.count} / ${m.total} (${pct}%)`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
