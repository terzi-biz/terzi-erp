/**
 * Finance Core v3 — редактор версіонованих фінансових правил.
 * Ставки, відсотки й пороги живуть тут, а не в коді UI.
 * Правка створює нову версію: попередня лишається в історії.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listFinanceRules, listReasonCodes, saveFinanceRule } from "@/lib/finance/rules.functions";
import { RULE_SCOPES } from "@/lib/finance/rules";

const SCOPE_LABELS: Record<string, string> = {
  compensation: "Винагороди",
  overhead: "Накладні",
  reserve: "Резерви",
  tax: "Податки",
  amortization: "Амортизація",
};

const UNIT_LABELS: Record<string, string> = {
  uah: "грн", percent: "%", months: "міс.", ratio: "коеф.", units: "од.",
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyDraft = {
  scope: "compensation",
  code: "",
  label: "",
  value_num: "",
  unit: "uah",
  effective_from: today(),
  notes: "",
};

export function FinanceRulesAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listFinanceRules);
  const save = useServerFn(saveFinanceRule);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState(false);

  const { data: rules = [], isLoading } = useQuery({ queryKey: ["finance-rules"], queryFn: () => list() });

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          scope: draft.scope as (typeof RULE_SCOPES)[number],
          code: draft.code.trim(),
          label: draft.label.trim() || null,
          value_num: draft.value_num === "" ? null : Number(draft.value_num),
          unit: draft.unit as "uah",
          effective_from: draft.effective_from,
          notes: draft.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Збережено нову версію правила");
      setDraft(emptyDraft);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["finance-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = rules.filter((r) => !r.effective_to);
  const history = rules.filter((r) => r.effective_to);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Фінансові правила</h2>
          <p className="text-sm text-muted-foreground">
            Ставки, відсотки й пороги за датами дії. Зміна не впливає на закриті періоди.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> Нова версія
          </Button>
        )}
      </div>

      {open && canEdit && (
        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
          <label className="text-sm">
            Розділ
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
            >
              {RULE_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s] ?? s}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Код правила
            <input className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.code} placeholder="sales_gp_percent"
              onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </label>
          <label className="text-sm">
            Назва
            <input className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
          <label className="text-sm">
            Значення
            <input type="number" step="0.01" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.value_num} onChange={(e) => setDraft({ ...draft, value_num: e.target.value })} />
          </label>
          <label className="text-sm">
            Одиниця
            <select className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
              {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Діє з
            <input type="date" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
              value={draft.effective_from} onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} />
          </label>
          <div className="md:col-span-3">
            <Button size="sm" disabled={!draft.code || mutation.isPending} onClick={() => mutation.mutate()}>
              <Save className="mr-1 h-4 w-4" /> Зберегти версію
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження…</p>
      ) : (
        <RuleTable title="Чинні правила" rows={active} empty="Правил ще немає" />
      )}
      {history.length > 0 && <RuleTable title="Історія версій" rows={history} empty="" muted />}

      <ReasonCodes />
    </div>
  );
}

type Rule = Awaited<ReturnType<typeof listFinanceRules>>[number];

function RuleTable({ title, rows, empty, muted }: { title: string; rows: Rule[]; empty: string; muted?: boolean }) {
  if (!rows.length && !empty) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className={`w-full text-sm ${muted ? "opacity-70" : ""}`}>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Розділ</th>
                <th className="px-3 py-2">Код</th>
                <th className="px-3 py-2">Назва</th>
                <th className="px-3 py-2 text-right">Значення</th>
                <th className="px-3 py-2">Діє з</th>
                <th className="px-3 py-2">Діє до</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{SCOPE_LABELS[r.scope] ?? r.scope}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2">{r.label ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.value_num === null
                      ? <span className="text-amber-600">потребує налаштування</span>
                      : `${Number(r.value_num)} ${UNIT_LABELS[r.unit ?? ""] ?? ""}`}
                  </td>
                  <td className="px-3 py-2">{r.effective_from}</td>
                  <td className="px-3 py-2">{r.effective_to ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReasonCodes() {
  const list = useServerFn(listReasonCodes);
  const { data = [] } = useQuery({ queryKey: ["finance-reason-codes"], queryFn: () => list() });
  if (!data.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Причини (reason codes)</h3>
      <div className="flex flex-wrap gap-2">
        {data.map((r) => (
          <span key={r.id} className="rounded-full border px-3 py-1 text-xs">
            {r.label}
            {r.is_excluded_from_pnl && <span className="ml-1 text-muted-foreground">· поза P&amp;L</span>}
            {r.is_one_off && <span className="ml-1 text-muted-foreground">· разова</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
