import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import type { RoofLine } from "@/lib/roofing-calc";
import { formatNum } from "@/lib/screed-calc";
import { listRoofingActuals, saveRoofingActual } from "@/lib/roofing-actuals.functions";

interface FactRowData {
  fact_qty: number;
  offcut_qty: number;
  writeoff_qty: number;
  labor_hours: number;
  deviation_reason: string | null;
}

/** План/факт після завершення об'єкта: факт, залишки, списання, трудовитрати, відхилення. */
export function PlanFactPanel({
  lines,
  estimateId,
  orderId,
}: {
  lines: RoofLine[];
  estimateId?: string;
  orderId?: string | null;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listRoofingActuals);
  const save = useServerFn(saveRoofingActual);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["roofing-actuals", estimateId],
    queryFn: () => list({ data: { estimate_id: estimateId! } }),
    enabled: !!estimateId,
  });

  const facts = useMemo(() => {
    const map: Record<string, FactRowData> = {};
    for (const r of (rows ?? []) as any[]) {
      map[r.item_key] = {
        fact_qty: Number(r.fact_qty) || 0,
        offcut_qty: Number(r.offcut_qty) || 0,
        writeoff_qty: Number(r.writeoff_qty) || 0,
        labor_hours: Number(r.labor_hours) || 0,
        deviation_reason: r.deviation_reason ?? null,
      };
    }
    return map;
  }, [rows]);

  const mut = useMutation({
    mutationFn: (p: Record<string, unknown>) => save({ data: p as never }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roofing-actuals", estimateId] }),
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти факт"),
  });

  if (!estimateId) {
    return (
      <section className="panel p-6 text-sm text-muted-foreground">
        Спочатку збережіть кошторис — після цього тут можна вносити факт по об'єкту.
      </section>
    );
  }

  const planTotal = lines.reduce((s, l) => s + l.qty, 0);
  const factTotal = lines.reduce((s, l) => s + (facts[l.key]?.fact_qty ?? 0), 0);
  const laborTotal = lines.reduce((s, l) => s + (facts[l.key]?.labor_hours ?? 0), 0);

  return (
    <section className="panel p-4 md:p-5 space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
          <ClipboardCheck className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider text-primary">План / факт</h2>
          <p className="text-xs text-muted-foreground">
            Фактичні обсяги, залишки, списання і трудовитрати після завершення об'єкта
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="План (сума к-стей)" value={formatNum(planTotal, 1)} />
        <Kpi label="Факт (сума к-стей)" value={formatNum(factTotal, 1)} />
        <Kpi label="Трудовитрати, год" value={formatNum(laborTotal, 1)} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження факту…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Позиція</th>
                <th className="py-2 px-2 text-right w-24">План</th>
                <th className="py-2 px-2 w-24">Факт</th>
                <th className="py-2 px-2 w-24">Залишок</th>
                <th className="py-2 px-2 w-24">Списано</th>
                <th className="py-2 px-2 w-20">Год</th>
                <th className="py-2 px-2 text-right w-28">Відхилення</th>
                <th className="py-2 pl-2 w-40">Причина</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <Row
                  key={l.key}
                  line={l}
                  fact={facts[l.key]}
                  onSave={(p) =>
                    mut.mutate({
                      estimate_id: estimateId,
                      order_id: orderId ?? null,
                      item_key: l.key,
                      item_name: l.name,
                      unit: l.unit,
                      plan_qty: l.qty,
                      fact_qty: p.fact_qty,
                      offcut_qty: p.offcut_qty,
                      writeoff_qty: p.writeoff_qty,
                      labor_hours: p.labor_hours,
                      deviation_reason: p.deviation_reason,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-secondary/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}

function Row({
  line,
  fact,
  onSave,
}: {
  line: RoofLine;
  fact?: FactRowData;
  onSave: (p: FactRowData) => void;
}) {
  const [qty, setQty] = useState(fact?.fact_qty ? String(fact.fact_qty) : "");
  const [offcut, setOffcut] = useState(fact?.offcut_qty ? String(fact.offcut_qty) : "");
  const [writeoff, setWriteoff] = useState(fact?.writeoff_qty ? String(fact.writeoff_qty) : "");
  const [hours, setHours] = useState(fact?.labor_hours ? String(fact.labor_hours) : "");
  const [reason, setReason] = useState(fact?.deviation_reason ?? "");

  useEffect(() => {
    setQty(fact?.fact_qty ? String(fact.fact_qty) : "");
    setOffcut(fact?.offcut_qty ? String(fact.offcut_qty) : "");
    setWriteoff(fact?.writeoff_qty ? String(fact.writeoff_qty) : "");
    setHours(fact?.labor_hours ? String(fact.labor_hours) : "");
    setReason(fact?.deviation_reason ?? "");
  }, [fact?.fact_qty, fact?.offcut_qty, fact?.writeoff_qty, fact?.labor_hours, fact?.deviation_reason]);

  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const flush = () =>
    onSave({
      fact_qty: num(qty),
      offcut_qty: num(offcut),
      writeoff_qty: num(writeoff),
      labor_hours: num(hours),
      deviation_reason: reason || null,
    });

  const delta = qty === "" ? 0 : num(qty) - line.qty;
  const deltaPct = line.qty > 0 && qty !== "" ? (delta / line.qty) * 100 : 0;
  const cls = "w-full h-9 px-2 rounded border border-border bg-background text-sm";

  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-2">
        <div className="font-medium">{line.name}</div>
        <div className="text-[11px] text-muted-foreground">{line.unit}</div>
      </td>
      <td className="py-2 px-2 text-right tabular-nums">{formatNum(line.qty, 2)}</td>
      <td className="py-2 px-2">
        <input className={cls} inputMode="decimal" value={qty} placeholder={formatNum(line.qty, 2)}
          onChange={(e) => setQty(e.target.value)} onBlur={flush} />
      </td>
      <td className="py-2 px-2">
        <input className={cls} inputMode="decimal" value={offcut} placeholder="0"
          onChange={(e) => setOffcut(e.target.value)} onBlur={flush} />
      </td>
      <td className="py-2 px-2">
        <input className={cls} inputMode="decimal" value={writeoff} placeholder="0"
          onChange={(e) => setWriteoff(e.target.value)} onBlur={flush} />
      </td>
      <td className="py-2 px-2">
        <input className={cls} inputMode="decimal" value={hours} placeholder="0"
          onChange={(e) => setHours(e.target.value)} onBlur={flush} />
      </td>
      <td
        className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${
          delta > 0 ? "text-destructive" : delta < 0 ? "text-success" : "text-muted-foreground"
        }`}
      >
        {qty === "" || delta === 0
          ? "—"
          : `${delta > 0 ? "+" : ""}${formatNum(delta, 2)} (${delta > 0 ? "+" : ""}${formatNum(deltaPct, 1)}%)`}
      </td>
      <td className="py-2 pl-2">
        <input className={cls} value={reason} placeholder="—"
          onChange={(e) => setReason(e.target.value)} onBlur={flush} />
      </td>
    </tr>
  );
}
