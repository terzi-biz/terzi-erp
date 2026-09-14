/**
 * Дебіторка по замовленню: договір, графік платежів, надходження з Finmap.
 *
 * Редагується вручну лише договір і графік. Факт (надходження, залишок,
 * прострочення) рахує Finance Core із операцій Finmap.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrderReceivables, saveOrderContract, savePaymentSchedule } from "@/lib/finance/contract.functions";
import { STAGE_STATUS_LABELS } from "@/lib/finance/core";
import { formatUah } from "@/lib/screed-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const d = (v?: string | null) => (v ? String(v).slice(0, 10).split("-").reverse().join(".") : "—");

type StageDraft = {
  id?: string;
  name: string;
  amount: string;
  percent: string;
  due_date: string;
  trigger_note: string;
  status: string;
};

export function OrderReceivables({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrderReceivables);
  const saveContractFn = useServerFn(saveOrderContract);
  const saveScheduleFn = useServerFn(savePaymentSchedule);

  const q = useQuery({
    queryKey: ["order-receivables", orderId],
    queryFn: () => getFn({ data: { order_id: orderId } }),
    enabled: !!orderId,
    retry: false,
  });
  const r = q.data;

  const [editing, setEditing] = useState(false);
  const [contract, setContract] = useState("");
  const [extras, setExtras] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([]);

  const startEdit = () => {
    setContract(r?.contract.contract_total != null ? String(r.contract.contract_total) : "");
    setExtras(r?.contract.approved_extras != null ? String(r.contract.approved_extras) : "");
    setStages(
      (r?.stages ?? []).map((s: any) => ({
        id: s.id, name: s.name ?? "",
        amount: s.percent != null ? "" : String(s.amount ?? ""),
        percent: s.percent != null ? String(s.percent) : "",
        due_date: (s.due_date ?? s.planned_date ?? "").slice(0, 10),
        trigger_note: s.trigger ?? "",
        status: s.status ?? "planned",
      })),
    );
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      await saveContractFn({
        data: {
          order_id: orderId,
          contract_total: contract.trim() === "" ? null : Number(contract),
          approved_extras: extras.trim() === "" ? null : Number(extras),
        },
      });
      await saveScheduleFn({
        data: {
          order_id: orderId,
          stages: stages
            .filter((s) => s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              amount: s.amount.trim() === "" ? null : Number(s.amount),
              percent: s.percent.trim() === "" ? null : Number(s.percent),
              due_date: s.due_date || null,
              trigger_note: s.trigger_note || null,
              status: s.status === "cancelled" ? ("cancelled" as const) : ("planned" as const),
            })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Договір і графік збережено");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["order-receivables", orderId] });
      qc.invalidateQueries({ queryKey: ["order-finance", orderId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти"),
  });

  if (q.error) return null;
  if (!r) return <div className="text-xs text-muted-foreground">Завантаження дебіторки…</div>;

  const box = (label: string, value: string, tone = "") => (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Договір і дебіторка {r.hasContract ? "" : "· сума договору не вказана"}
        </div>
        {!editing && <Button size="sm" variant="outline" onClick={startEdit}>Редагувати</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {box("Сума договору", formatUah(r.contractedRevenue))}
        {box("Отримано", formatUah(r.netReceived))}
        {box("Залишок", formatUah(r.remainingContractBalance))}
        {box("До сплати зараз", formatUah(r.dueNow), r.dueNow > 0 ? "text-warning" : "")}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {box("Прострочено", formatUah(r.overdue), r.overdue > 0 ? "text-destructive" : "")}
        {box("Заплановано у графіку", formatUah(r.scheduled))}
        {box("Наступний платіж", r.nextExpected ? `${formatUah(r.nextExpected.amount)} · ${d(r.nextExpected.date)}` : "—")}
      </div>

      {r.unscheduled !== 0 && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          Сума етапів не збігається з договором на {formatUah(Math.abs(r.unscheduled))} — перевірте графік платежів.
        </div>
      )}

      {!editing && (r.stages ?? []).length > 0 && (
        <div className="space-y-1">
          {r.stages.map((s: any, i: number) => (
            <div key={s.id ?? i} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-sm">
              <span className="min-w-0">
                <b className="block truncate">{s.name}</b>
                <span className="text-muted-foreground text-xs">
                  {d(s.due_date ?? s.planned_date)} · {STAGE_STATUS_LABELS[s.status as keyof typeof STAGE_STATUS_LABELS] ?? s.status}
                  {s.trigger ? ` · ${s.trigger}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <b>{formatUah(s.amount)}</b>
                <span className="block text-xs text-muted-foreground">оплачено {formatUah(s.paid)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Сума договору, ₴
              <Input value={contract} onChange={(e) => setContract(e.target.value)} inputMode="decimal" />
            </label>
            <label className="text-xs text-muted-foreground">
              Затверджені додаткові роботи, ₴
              <Input value={extras} onChange={(e) => setExtras(e.target.value)} inputMode="decimal" />
            </label>
          </div>

          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Графік платежів</div>
          {stages.map((s, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1.2fr_auto]">
              <Input placeholder="Назва етапу" value={s.name}
                onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input placeholder="Сума" inputMode="decimal" value={s.amount}
                onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <Input placeholder="%" inputMode="decimal" value={s.percent}
                onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
              <Input type="date" value={s.due_date}
                onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
              <Button size="sm" variant="ghost" onClick={() => setStages(stages.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button size="sm" variant="outline"
            onClick={() => setStages([...stages, { name: "", amount: "", percent: "", due_date: "", trigger_note: "", status: "planned" }])}>
            + Етап
          </Button>

          <div className="flex gap-2">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Зберегти</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Скасувати</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Вкажіть суму АБО відсоток від договору. Аванс за замовчуванням не припускається — етапи задаєте ви.
          </p>
        </div>
      )}
    </div>
  );
}
