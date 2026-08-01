import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Square } from "lucide-react";
import { listKeyCrmImportRuns, runKeyCrmImportChunk, startKeyCrmImport } from "@/lib/integrations.functions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Очікує",
  running: "Виконується",
  done: "Завершено",
  error: "Помилка",
  cancelled: "Зупинено",
};

/** Покроковий початковий імпорт keyCRM: одна сторінка за запит, з прогресом. */
export function ImportPanel({ integrationId }: { integrationId: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listKeyCrmImportRuns);
  const fnStart = useServerFn(startKeyCrmImport);
  const fnChunk = useServerFn(runKeyCrmImportChunk);

  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const stopRef = useRef(false);

  const runs = useQuery({
    queryKey: ["keycrm-import", integrationId],
    queryFn: () => fnList({ data: { integrationId } }),
    enabled: !!integrationId,
  });

  const rows = (runs.data ?? []) as any[];
  const refresh = () => qc.invalidateQueries({ queryKey: ["keycrm-import", integrationId] });

  async function importAll(opts: { restart: boolean; dryRun?: boolean }) {
    if (busy) return;
    setBusy(true);
    stopRef.current = false;
    try {
      if (opts.restart && !opts.dryRun) await fnStart({ data: { integrationId } });
      let totalApplied = 0;
      for (const row of rows) {
        if (stopRef.current) break;
        setCurrent(row.label);
        for (let guard = 0; guard < 200; guard++) {
          if (stopRef.current) break;
          const res: any = await fnChunk({
            data: { integrationId, entity: row.entity, pageSize: 50, dryRun: opts.dryRun },
          });
          totalApplied += Number(res?.pageApplied ?? 0);
          refresh();
          if (res?.done) break;
        }
      }
      setCurrent(null);
      toast.success(
        opts.dryRun
          ? "Пробний прогін імпорту завершено — записів в ERP не створено"
          : stopRef.current
            ? `Імпорт зупинено. Записано ${totalApplied}`
            : `Імпорт завершено. Записано ${totalApplied}`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Помилка імпорту");
    } finally {
      setBusy(false);
      setCurrent(null);
      refresh();
    }
  }

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" /> Початковий імпорт keyCRM → ERP
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => importAll({ restart: false })}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Продовжити імпорт
          </button>
          <button
            disabled={busy}
            onClick={() => importAll({ restart: true })}
            className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            Почати з нуля
          </button>
          <button
            disabled={busy}
            onClick={() => importAll({ restart: false, dryRun: true })}
            className="px-3 py-1.5 rounded border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/10 disabled:opacity-50"
          >
            Пробний прогін
          </button>
          {busy && (
            <button
              onClick={() => { stopRef.current = true; }}
              className="px-3 py-1.5 rounded border border-destructive/50 text-destructive text-sm font-semibold hover:bg-destructive/10 flex items-center gap-2"
            >
              <Square className="w-3.5 h-3.5" /> Зупинити
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Імпорт іде посторінково (50 записів за запит) у порядку: довідники → клієнти → ліди → замовлення.
        Прогрес зберігається, тож процес можна зупинити й продовжити з того самого місця.
        {current ? ` Зараз: ${current}.` : ""}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="py-2">Сутність</th>
              <th className="py-2">Статус</th>
              <th className="py-2">Прогрес</th>
              <th className="py-2">Записано</th>
              <th className="py-2">Пропущено</th>
              <th className="py-2">Помилки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const run = r.run;
              const total = Number(run?.total_estimate ?? 0);
              const received = Number(run?.received ?? 0);
              const pct = run?.status === "done" ? 100 : total > 0 ? Math.min(99, Math.round((received / total) * 100)) : received > 0 ? 50 : 0;
              return (
                <tr key={r.entity}>
                  <td className="py-2 font-semibold">{r.label}</td>
                  <td className="py-2 text-xs">
                    <span className={run?.status === "error" ? "text-destructive" : run?.status === "done" ? "text-primary" : "text-muted-foreground"}>
                      {STATUS_LABEL[run?.status ?? "pending"] ?? "—"}
                    </span>
                    {run?.last_error && <div className="text-destructive text-[11px] max-w-[240px]">{run.last_error}</div>}
                  </td>
                  <td className="py-2 w-40">
                    <div className="h-1.5 rounded bg-secondary overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {received}
                      {total > 0 ? ` / ${total}` : ""}
                    </div>
                  </td>
                  <td className="py-2">{run?.applied ?? 0}</td>
                  <td className="py-2 text-muted-foreground">{run?.skipped ?? 0}</td>
                  <td className={`py-2 ${run?.failed ? "text-destructive" : "text-muted-foreground"}`}>{run?.failed ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
