/**
 * Дашборд-блок «Синхронізація та Reconciliation».
 * Показує лише фактичні дані ядра інтеграцій: останній успіх, останню спробу,
 * кількість оброблених операцій, чергу й конфлікти. Без вигаданих значень.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/control-center";
import { getIntegrationReconciliation } from "@/lib/integrations.functions";

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function ReconciliationPanel() {
  const load = useServerFn(getIntegrationReconciliation);
  const q = useQuery({ queryKey: ["integration-reconciliation"], queryFn: () => load(), staleTime: 60_000, retry: false });
  const data = q.data as any;

  return (
    <div className="crm-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black">Синхронізація та Reconciliation</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Оновити"><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button>
          <Button asChild variant="link" size="sm"><Link to="/integrations">Деталі <ChevronRight /></Link></Button>
        </div>
      </div>

      {q.isLoading ? <EmptyState text="Завантаження стану інтеграцій…" />
        : q.isError ? <EmptyState text="Немає доступу до стану інтеграцій" />
        : !data?.integrations?.length ? <EmptyState text="Підключень ще немає" />
        : <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Оброблено", data.totals.processed], ["Створено", data.totals.created], ["Оновлено", data.totals.updated], ["Помилки", data.totals.failed]].map(([l, v]) => (
              <div key={String(l)} className="rounded-md border border-border p-2 text-xs">
                <small className="block text-[10px] text-muted-foreground">{l}</small>
                <b className="text-sm">{Number(v).toLocaleString("uk-UA")}</b>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Останній успіх: {dt(data.lastSuccessAt)} · у черзі {data.totals.queued} · конфліктів {data.totals.conflicts}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.integrations.map((i: any) => (
              <div key={i.id} className="rounded-md border border-border p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <b className="truncate">{i.name}</b>
                  <span className={i.lastError ? "text-destructive" : i.needsConnection ? "text-warning" : "text-success"}>
                    {i.lastError ? "Помилка" : i.needsConnection ? "Потребує підключення" : "Активна"}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Успіх: {dt(i.lastSuccessAt)} · Спроба: {dt(i.lastAttemptAt)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Оброблено {i.processed} · створено {i.created} · оновлено {i.updated} · пропущено {i.skipped} · помилок {i.failed}
                  {i.conflicts ? ` · конфліктів ${i.conflicts}` : ""}
                </p>
              </div>
            ))}
          </div>
        </>}
    </div>
  );
}
