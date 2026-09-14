/**
 * Стан щогодинної фонової звірки з Finmap: останній успіх або помилка,
 * час, обсяг оброблених операцій і перехід до звірки.
 * Дані беруться з одного серверного джерела (журнал синхронізації).
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFinmapSyncHealth } from "@/lib/finance/management.functions";

const dt = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("uk-UA", {
        timeZone: "Europe/Kyiv",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "немає даних";

const nf = new Intl.NumberFormat("uk-UA");

const ageText = (min: number | null) => {
  if (min == null) return "—";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
};

export function FinmapSyncStatus() {
  const fn = useServerFn(getFinmapSyncHealth);
  const { data, isLoading, error } = useQuery({
    queryKey: ["finmap-sync-health"],
    queryFn: () => fn(),
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <div className="text-xs text-muted-foreground">Завантаження…</div>;
  if (error || !data) return <div className="text-xs text-muted-foreground">Немає доступу до стану звірення</div>;

  const bad = !data.configured || !!data.lastError || data.stale;
  const tone = !data.configured
    ? "border-border bg-muted/40 text-muted-foreground"
    : data.lastError
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : data.stale
        ? "border-primary/40 bg-primary/5 text-primary"
        : "border-success/40 bg-success/5 text-success";

  const statusText = !data.configured
    ? "Не налаштовано (немає ключа Finmap)"
    : data.lastError
      ? "Помилка останнього прогону"
      : data.stale
        ? "Давно не оновлювалось"
        : "Успішно";

  const p = data.processed;

  return (
    <div className="space-y-2.5 text-[12px]">
      <div className={`rounded-md border px-3 py-2 text-[12px] font-semibold ${tone}`}>{statusText}</div>

      {data.lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {data.lastError}
          {data.lastErrorAt ? <div className="mt-0.5 opacity-80">{dt(data.lastErrorAt)}</div> : null}
        </div>
      )}

      {[
        ["Останній успіх", `${dt(data.lastSuccessAt)}${data.ageMinutes != null ? ` · ${ageText(data.ageMinutes)}` : ""}`],
        ["Останній запуск", dt(data.lastRunAt)],
        ["Наступний очікується", dt(data.nextDueAt)],
        ["Оброблено операцій", `${nf.format(p.fetched)} (нових ${nf.format(p.inserted)}, оновлено ${nf.format(p.updated)})`],
        ["Усього операцій у базі", nf.format(data.transactionsTotal)],
      ].map(([l, v]) => (
        <div key={l} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0 last:pb-0">
          <span className="text-muted-foreground">{l}</span>
          <b className="text-right">{v}</b>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link to="/finance" search={{ tab: "reconcile" }} className="text-[11px] font-semibold text-primary">
          Перейти до звірки
        </Link>
        {bad && data.configured ? (
          <Link to="/finance" search={{ tab: "finmap" }} className="text-[11px] font-semibold text-primary">
            Журнал синхронізації
          </Link>
        ) : null}
      </div>
    </div>
  );
}
