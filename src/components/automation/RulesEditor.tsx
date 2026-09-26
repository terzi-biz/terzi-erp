import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { crmButton, crmInput } from "@/components/crm/CrmUi";
import { saveRule, setRuleEnabled } from "@/lib/automation/automation.functions";
import { COMMERCIAL_LABELS, COMMERCIAL_STATUSES } from "@/lib/orders.constants";
import { cn } from "@/lib/utils";

export type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_entity: string;
  trigger_field: string;
  trigger_from: string | null;
  trigger_to: string;
  actions: unknown;
};

function formatActions(actions: unknown): string {
  if (!Array.isArray(actions)) return "—";
  return actions
    .map((a: any) => {
      if (a?.type === "create_task") return `задача: ${a.title ?? "?"}`;
      if (a?.type === "set_plan_fact") return "план/факт";
      if (a?.type === "write_journal") return "журнал";
      return a?.type ?? "?";
    })
    .join(", ");
}

const MEASUREMENT_STATUSES: Record<string, string> = {
  planned: "Заплановано",
  assigned: "Призначено",
  confirmed: "Підтверджено",
  in_progress: "В роботі",
  completed: "Виконано",
  canceled: "Скасовано",
  rescheduled: "Перенесено",
};

type TriggerKind = "order" | "lead" | "measurement";
const TRIGGERS: Record<TriggerKind, { label: string; entity: TriggerKind; field: string }> = {
  order: { label: "Статус замовлення (комерційний)", entity: "order", field: "commercial_status" },
  lead: { label: "Етап ліда у воронці", entity: "lead", field: "stage_id" },
  measurement: { label: "Статус заміру", entity: "measurement", field: "status" },
};

let STAGE_NAMES: Record<string, string> = {};

function whenLabel(r: RuleRow): string {
  return `${r.trigger_entity}.${r.trigger_field}`;
}

function ifLabel(r: RuleRow): string {
  const from = r.trigger_from ? `${r.trigger_from} → ` : "";
  const toLabel =
    r.trigger_field === "commercial_status"
      ? (COMMERCIAL_LABELS[r.trigger_to] ?? r.trigger_to)
      : r.trigger_field === "stage_id"
        ? (STAGE_NAMES[r.trigger_to] ?? r.trigger_to)
        : r.trigger_entity === "measurement"
          ? (MEASUREMENT_STATUSES[r.trigger_to] ?? r.trigger_to)
          : r.trigger_to;
  return `${from}${toLabel}`;
}

type Props = {
  rules: RuleRow[];
  canWrite: boolean;
};

export function RulesEditor({ rules, canWrite }: Props) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveRule);
  const enableFn = useServerFn(setRuleEnabled);

  const [name, setName] = useState("Нова задача при зміні статусу");
  const [kind, setKind] = useState<TriggerKind>("order");
  const [triggerTo, setTriggerTo] = useState<string>("contract");
  const stagesQ = useQuery({
    queryKey: ["automation-crm-stages"],
    queryFn: async () => {
      const { data } = await supabase.from("crm_stages").select("id, name, sort_order, is_active").order("sort_order");
      return (data ?? []) as { id: string; name: string; is_active: boolean | null }[];
    },
  });
  const stages = stagesQ.data ?? [];
  STAGE_NAMES = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const options: [string, string][] =
    kind === "order"
      ? COMMERCIAL_STATUSES.map((s) => [s, COMMERCIAL_LABELS[s] ?? s])
      : kind === "lead"
        ? stages.filter((s) => s.is_active !== false).map((s) => [s.id, s.name])
        : Object.entries(MEASUREMENT_STATUSES);
  const [taskTitle, setTaskTitle] = useState("Обробити {{to}} — {{entity_id}}");
  const [dueHours, setDueHours] = useState(24);

  const sorted = useMemo(
    () => [...rules].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, "uk")),
    [rules],
  );

  const createMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: name.trim() || "Правило",
          enabled: true,
          trigger_entity: TRIGGERS[kind].entity,
          trigger_field: TRIGGERS[kind].field,
          trigger_from: null,
          trigger_to: triggerTo,
          condition: {},
          actions: [
            {
              type: "create_task" as const,
              title: taskTitle.trim() || "Автозадача",
              kind: "follow_up",
              due_offset_hours: Number(dueHours) || 24,
            },
            { type: "write_journal" as const, note: "auto from Control Center" },
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Правило створено");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      qc.invalidateQueries({ queryKey: ["automation-kpis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) => enableFn({ data: p }),
    onSuccess: () => {
      toast.success("Статус оновлено");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      qc.invalidateQueries({ queryKey: ["automation-kpis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Назва</th>
              <th className="px-3 py-2 font-semibold">Коли</th>
              <th className="px-3 py-2 font-semibold">Якщо</th>
              <th className="px-3 py-2 font-semibold">То</th>
              <th className="px-3 py-2 font-semibold">Статус</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Немає правил. Створіть перше нижче (order.commercial_status → create_task).
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{whenLabel(r)}</td>
                  <td className="px-3 py-2 text-xs">{ifLabel(r)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatActions(r.actions)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!canWrite || toggleMut.isPending}
                      onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase",
                        r.enabled
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {r.enabled ? "увімкнено" : "вимкнено"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4">
          <h3 className="text-sm font-bold">Нове правило (шаблон)</h3>
          <p className="text-xs text-muted-foreground">
            Коли змінюється вибране поле → якщо нове значення = … → то створити задачу + запис у журналі.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Коли змінюється</span>
              <select
                className={crmInput}
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as TriggerKind;
                  setKind(k);
                  setTriggerTo(k === "order" ? "contract" : k === "measurement" ? "completed" : "");
                }}
              >
                {(Object.keys(TRIGGERS) as TriggerKind[]).map((k) => (
                  <option key={k} value={k}>{TRIGGERS[k].label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Назва</span>
              <input className={crmInput} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Якщо нове значення =</span>
              <select className={crmInput} value={triggerTo} onChange={(e) => setTriggerTo(e.target.value)}>
                <option value="">—</option>
                {options.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="text-xs md:col-span-2">
              <span className="mb-1 block text-muted-foreground">Заголовок задачі (шаблон)</span>
              <input className={crmInput} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Дедлайн, годин від зараз</span>
              <input
                type="number"
                min={0}
                max={2160}
                className={crmInput}
                value={dueHours}
                onChange={(e) => setDueHours(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={crmButton}
              disabled={createMut.isPending || !triggerTo}
              onClick={() => createMut.mutate()}
            >
              Створити правило
            </button>
          </div>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">Редагування доступне admin / director.</p>
      )}
    </div>
  );
}
