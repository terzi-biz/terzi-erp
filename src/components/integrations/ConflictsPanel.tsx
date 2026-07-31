import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Database, Loader2, RefreshCw, X } from "lucide-react";
import { listIntegrationConflicts, resolveIntegrationConflict } from "@/lib/integrations.functions";

type Resolution = "keep_erp" | "keep_external" | "ignore";

const STATUS_LABEL: Record<string, string> = {
  open: "Відкриті",
  resolved: "Вирішені",
  ignored: "Проігноровані",
};

const RESOLUTION_LABEL: Record<string, string> = {
  keep_erp: "Застосовано ERP → keyCRM",
  keep_external: "Застосовано keyCRM → ERP",
  ignore: "Проігноровано",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function diffRows(internal: any, external: any) {
  const a = internal && typeof internal === "object" ? internal : {};
  const b = external && typeof external === "object" ? external : {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return keys.map((k) => {
    const iv = a[k];
    const ev = b[k];
    return { key: k, internal: iv, external: ev, changed: JSON.stringify(iv ?? null) !== JSON.stringify(ev ?? null) };
  });
}

export function ConflictsPanel({ integrationId }: { integrationId: string | null }) {
  const qc = useQueryClient();
  const fnConflicts = useServerFn(listIntegrationConflicts);
  const fnResolve = useServerFn(resolveIntegrationConflict);

  const [status, setStatus] = useState<string>("open");
  const [entity, setEntity] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const conflicts = useQuery({
    queryKey: ["int-conflicts", integrationId],
    queryFn: () => fnConflicts({ data: { integrationId: integrationId ?? null } }),
    enabled: !!integrationId,
  });

  const all = (conflicts.data ?? []) as any[];
  const entities = useMemo(() => Array.from(new Set(all.map((c) => c.entity))).sort(), [all]);
  const rows = all.filter((c) => (status === "all" || c.status === status) && (entity === "all" || c.entity === entity));
  const openCount = all.filter((c) => c.status === "open").length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["int-conflicts", integrationId] });

  const resolve = useMutation({
    mutationFn: async (p: { id: string; resolution: Resolution }) => fnResolve({ data: p }),
    onMutate: (p) => setBusyId(p.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, p) => {
      toast.success(RESOLUTION_LABEL[p.resolution]);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося застосувати рішення"),
  });

  const bulk = useMutation({
    mutationFn: async (resolution: Resolution) => {
      const targets = rows.filter((c) => c.status === "open");
      let ok = 0;
      for (const c of targets) {
        try {
          await fnResolve({ data: { id: c.id, resolution } });
          ok++;
        } catch {
          /* продовжуємо решту */
        }
      }
      return { ok, total: targets.length };
    },
    onSuccess: (r) => {
      toast.success(`Оброблено ${r.ok} із ${r.total} конфліктів`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка масової обробки"),
  });

  if (!integrationId) return null;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Черга конфліктів
          {openCount > 0 && <span className="rounded-full bg-amber-500/15 text-amber-600 px-2 py-0.5 text-xs font-bold">{openCount} відкритих</span>}
        </div>
        <button onClick={refresh} className="px-2.5 py-1 rounded bg-secondary text-xs font-semibold hover:bg-accent flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${conflicts.isFetching ? "animate-spin" : ""}`} /> Оновити
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Запис змінено з обох боків. Оберіть, яку версію застосувати: «Залишити ERP» надішле дані в keyCRM, «Взяти keyCRM» перезапише запис в ERP. Кожне рішення журналюється в аудиті.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-input border border-border rounded px-2 py-1">
          <option value="open">Відкриті</option>
          <option value="resolved">Вирішені</option>
          <option value="ignored">Проігноровані</option>
          <option value="all">Усі</option>
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="bg-input border border-border rounded px-2 py-1">
          <option value="all">Усі сутності</option>
          {entities.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          лише відмінні поля
        </label>
        {rows.some((c) => c.status === "open") && (
          <div className="flex flex-wrap gap-2 ml-auto">
            <button
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("keep_erp")}
              className="px-2.5 py-1 rounded border border-primary/40 text-primary font-semibold hover:bg-primary/10 disabled:opacity-50"
            >
              Усі → залишити ERP
            </button>
            <button
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("keep_external")}
              className="px-2.5 py-1 rounded border border-border font-semibold hover:bg-accent disabled:opacity-50"
            >
              Усі → взяти keyCRM
            </button>
          </div>
        )}
      </div>

      {conflicts.isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження…</div>
      )}
      {!conflicts.isLoading && rows.length === 0 && (
        <div className="text-xs text-muted-foreground">Конфліктів у вибраному фільтрі немає.</div>
      )}

      <div className="space-y-2">
        {rows.map((c) => {
          const open = c.status === "open";
          const isOpen = expanded[c.id] ?? open;
          const d = diffRows(c.internal_value, c.external_value);
          const changed = d.filter((r) => r.changed);
          const visible = onlyChanged ? (changed.length ? changed : d) : d;
          const busy = busyId === c.id;
          return (
            <div key={c.id} className="rounded border border-border overflow-hidden">
              <button
                onClick={() => setExpanded({ ...expanded, [c.id]: !isOpen })}
                className="w-full flex flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Database className="w-3.5 h-3.5 text-primary" />
                <span className="font-bold">{c.entity}</span>
                <span className="text-muted-foreground">keyCRM #{c.external_id ?? "—"}</span>
                <span className="text-muted-foreground">· {fmt(c.created_at)}</span>
                <span className="text-muted-foreground">· відмінних полів: {changed.length}</span>
                <span className={`ml-auto rounded px-2 py-0.5 font-semibold ${open ? "bg-amber-500/15 text-amber-600" : "bg-secondary text-muted-foreground"}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                  {c.resolution ? ` · ${RESOLUTION_LABEL[c.resolution] ?? c.resolution}` : ""}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border p-3 space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-[11px] uppercase text-muted-foreground">
                        <tr className="text-left">
                          <th className="py-1.5 pr-3">Поле</th>
                          <th className="py-1.5 pr-3">Версія ERP</th>
                          <th className="py-1.5">Версія keyCRM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visible.map((r) => (
                          <tr key={r.key} className={r.changed ? "bg-amber-500/5" : ""}>
                            <td className="py-1.5 pr-3 font-semibold align-top whitespace-nowrap">{r.key}</td>
                            <td className={`py-1.5 pr-3 align-top break-all ${r.changed ? "text-foreground font-medium" : "text-muted-foreground"}`}>{show(r.internal)}</td>
                            <td className={`py-1.5 align-top break-all ${r.changed ? "text-foreground font-medium" : "text-muted-foreground"}`}>{show(r.external)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {open && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busy}
                        onClick={() => resolve.mutate({ id: c.id, resolution: "keep_erp" })}
                        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Залишити ERP (надіслати в keyCRM)
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => resolve.mutate({ id: c.id, resolution: "keep_external" })}
                        className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold hover:bg-accent disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" /> Взяти keyCRM (оновити ERP)
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => resolve.mutate({ id: c.id, resolution: "ignore" })}
                        className="px-3 py-1.5 rounded border border-border text-xs font-semibold hover:bg-accent disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" /> Ігнорувати
                      </button>
                    </div>
                  )}
                  {!open && (
                    <div className="text-[11px] text-muted-foreground">
                      Вирішено {fmt(c.resolved_at)}{c.resolution ? ` · ${RESOLUTION_LABEL[c.resolution] ?? c.resolution}` : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
