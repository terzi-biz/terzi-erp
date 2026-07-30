import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";
import { SYNC_MODE_HINT, SYNC_MODE_LABEL, type SyncMode } from "@/lib/integrations/keycrm-constants";
import {
  listIntegrationConflicts,
  listIntegrationSyncSettings,
  resolveIntegrationConflict,
  runIntegrationSync,
  saveIntegrationSyncSetting,
} from "@/lib/integrations.functions";

const MODES: SyncMode[] = ["off", "erp_master", "external_master", "bidirectional"];

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function SyncPanel({ list, active, onSelect }: { list: any[]; active: any; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const keycrmList = useMemo(() => list.filter((i) => i.provider_key === "keycrm"), [list]);
  const current = keycrmList.find((i) => i.id === active?.id) ?? keycrmList[0] ?? null;

  const fnSettings = useServerFn(listIntegrationSyncSettings);
  const fnSave = useServerFn(saveIntegrationSyncSetting);
  const fnRun = useServerFn(runIntegrationSync);
  const fnConflicts = useServerFn(listIntegrationConflicts);
  const fnResolve = useServerFn(resolveIntegrationConflict);

  const settings = useQuery({
    queryKey: ["int-sync", current?.id],
    queryFn: () => fnSettings({ data: { integrationId: current.id } }),
    enabled: !!current,
  });
  const conflicts = useQuery({
    queryKey: ["int-conflicts", current?.id],
    queryFn: () => fnConflicts({ data: { integrationId: current?.id ?? null } }),
    enabled: !!current,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["int-sync", current?.id] });
    qc.invalidateQueries({ queryKey: ["int-conflicts", current?.id] });
  };

  const save = useMutation({
    mutationFn: (p: any) => fnSave({ data: p }),
    onSuccess: () => { toast.success("Налаштування синхронізації збережено"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const run = useMutation({
    mutationFn: (p: any) => fnRun({ data: p }),
    onSuccess: (r: any) => {
      const items = (r ?? []) as any[];
      const created = items.reduce((s, x) => s + (x.created ?? 0), 0);
      const updated = items.reduce((s, x) => s + (x.updated ?? 0), 0);
      toast.success(`Синхронізацію завершено: створено ${created}, оновлено ${updated}`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка синхронізації"),
  });
  const resolve = useMutation({
    mutationFn: (p: any) => fnResolve({ data: p }),
    onSuccess: () => { toast.success("Конфлікт закрито"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const [pick, setPick] = useState<Record<string, boolean>>({});

  if (!current) {
    return <div className="panel p-6 text-sm text-muted-foreground">Створіть підключення keyCRM у вкладці «Підключення», щоб налаштувати синхронізацію.</div>;
  }

  const rows = (settings.data ?? []) as any[];
  const chosen = rows.filter((r) => pick[r.entity]).map((r) => r.entity);

  return (
    <div className="space-y-4">
      {keycrmList.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {keycrmList.map((i) => (
            <button key={i.id} onClick={() => onSelect(i.id)} className={`px-3 py-1.5 rounded text-sm font-semibold ${current.id === i.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
              {i.name}
            </button>
          ))}
        </div>
      )}

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" /> Напрямки синхронізації · {current.name}</div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={run.isPending}
              onClick={() => run.mutate({ integrationId: current.id, entities: chosen.length ? chosen : undefined })}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {chosen.length ? `Синхронізувати обране (${chosen.length})` : "Синхронізувати активні"}
            </button>
            <button
              disabled={run.isPending || !chosen.length}
              onClick={() => run.mutate({ integrationId: current.id, entities: chosen, full: true })}
              className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Повне перезавантаження
            </button>
          </div>
        </div>

        {settings.isLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження…</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="text-left">
                <th className="py-2 w-8"></th>
                <th className="py-2">Сутність</th>
                <th className="py-2">Режим</th>
                <th className="py-2">Автоопитування</th>
                <th className="py-2">Остання синхронізація</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.entity} className="align-top">
                  <td className="py-2">
                    <input type="checkbox" checked={!!pick[r.entity]} onChange={(e) => setPick({ ...pick, [r.entity]: e.target.checked })} />
                  </td>
                  <td className="py-2">
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.target}{r.note ? ` · ${r.note}` : ""}{r.outbound ? "" : " · лише читання"}</div>
                  </td>
                  <td className="py-2">
                    <select
                      value={r.mode}
                      onChange={(e) => save.mutate({ integrationId: current.id, entity: r.entity, mode: e.target.value, pollEnabled: r.poll_enabled, pollIntervalMin: r.poll_interval_min })}
                      className="bg-input border border-border rounded px-2 py-1 text-sm"
                    >
                      {MODES.filter((m) => r.outbound || m !== "erp_master").map((m) => (
                        <option key={m} value={m}>{SYNC_MODE_LABEL[m]}</option>
                      ))}
                    </select>
                    <div className="text-[11px] text-muted-foreground mt-1 max-w-[260px]">{SYNC_MODE_HINT[r.mode as SyncMode]}</div>
                  </td>
                  <td className="py-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!!r.poll_enabled}
                        onChange={(e) => save.mutate({ integrationId: current.id, entity: r.entity, mode: r.mode, pollEnabled: e.target.checked, pollIntervalMin: r.poll_interval_min })}
                      />
                      кожні
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        defaultValue={r.poll_interval_min}
                        onBlur={(e) => save.mutate({ integrationId: current.id, entity: r.entity, mode: r.mode, pollEnabled: r.poll_enabled, pollIntervalMin: Number(e.target.value) || 15 })}
                        className="w-16 bg-input border border-border rounded px-1 py-0.5"
                      />
                      хв
                    </label>
                  </td>
                  <td className="py-2 text-xs">
                    <div>{fmt(r.last_sync_at)}</div>
                    {r.last_status && <div className={r.last_status === "error" ? "text-destructive" : "text-muted-foreground"}>{r.last_status}{r.last_error ? `: ${r.last_error}` : ""}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Конфлікти даних</div>
        <p className="text-xs text-muted-foreground">Запис змінено з обох боків. Оберіть, яка версія є правильною — рішення журналюється.</p>
        {((conflicts.data ?? []) as any[]).filter((c) => c.status === "open").length === 0 && (
          <div className="text-xs text-muted-foreground">Відкритих конфліктів немає.</div>
        )}
        <div className="space-y-2">
          {((conflicts.data ?? []) as any[]).filter((c) => c.status === "open").map((c) => (
            <div key={c.id} className="rounded border border-border p-2 text-xs space-y-2">
              <div className="font-semibold">{c.entity} · зовнішній ID {c.external_id ?? "—"} · {fmt(c.created_at)}</div>
              <div className="grid gap-2 md:grid-cols-2">
                <pre className="bg-secondary rounded p-2 overflow-x-auto max-h-40">{JSON.stringify(c.internal_value, null, 2)}</pre>
                <pre className="bg-secondary rounded p-2 overflow-x-auto max-h-40">{JSON.stringify(c.external_value, null, 2)}</pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => resolve.mutate({ id: c.id, resolution: "keep_erp" })} className="px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold">Залишити ERP</button>
                <button onClick={() => resolve.mutate({ id: c.id, resolution: "keep_external" })} className="px-2.5 py-1 rounded bg-secondary font-semibold hover:bg-accent">Взяти keyCRM</button>
                <button onClick={() => resolve.mutate({ id: c.id, resolution: "ignore" })} className="px-2.5 py-1 rounded bg-secondary font-semibold hover:bg-accent">Ігнорувати</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
