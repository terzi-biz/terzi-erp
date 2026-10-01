import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listForemenPlan, upsertForemenTargets } from "@/lib/plan-fact.functions";

type Line = { name: string; target: string; target_orders: string };

export function ForemenPlanEditor({ month, editableWindow }: { month: string; editableWindow: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listForemenPlan);
  const saveFn = useServerFn(upsertForemenTargets);
  const q = useQuery({ queryKey: ["foremen-plan", month], queryFn: () => listFn({ data: { month } }) });
  const [lines, setLines] = useState<Line[]>([]);
  const [newName, setNewName] = useState("");
  useEffect(() => {
    if (q.data) setLines(q.data.foremen.map((f) => ({ name: f.name, target: String(f.target), target_orders: String(f.target_orders) })));
  }, [q.data]);
  const editable = editableWindow && (q.data?.editable ?? false);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { month, lines: lines.map((l) => ({ name: l.name, target: Number(l.target) || 0, target_orders: Math.round(Number(l.target_orders) || 0) })) } }),
    onSuccess: () => { toast.success("Плани прорабів збережено"); qc.invalidateQueries({ queryKey: ["foremen-plan", month] }); qc.invalidateQueries({ queryKey: ["plan-vs-fact"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (i: number, k: keyof Line, v: string) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4">
      <h2 className="text-sm font-bold">Плани прорабів</h2>
      <p className="text-xs text-muted-foreground">Ціль — сума договорів і кількість об'єктів, де прораб вказаний у картці замовлення.</p>
      {q.isLoading ? <div className="text-xs text-muted-foreground">Завантаження…</div> : (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.name} className="grid grid-cols-[1fr_7rem_5rem] items-center gap-2 text-xs">
              <span className="truncate font-semibold">{l.name}</span>
              <input inputMode="decimal" disabled={!editable} value={l.target} onChange={(e) => set(i, "target", e.target.value)} placeholder="₴"
                className="rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums disabled:opacity-60" />
              <input inputMode="numeric" disabled={!editable} value={l.target_orders} onChange={(e) => set(i, "target_orders", e.target.value)} placeholder="угод"
                className="rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums disabled:opacity-60" />
            </div>
          ))}
          {!lines.length && <div className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">Прорабів у замовленнях ще немає — додайте вручну</div>}
          {editable && (
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ім'я прораба"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs" />
              <button type="button" className="rounded-md border border-border px-3 text-xs font-semibold"
                onClick={() => { const n = newName.trim(); if (n && !lines.some((l) => l.name === n)) setLines((p) => [...p, { name: n, target: "0", target_orders: "0" }]); setNewName(""); }}>Додати</button>
            </div>
          )}
        </div>
      )}
      <button type="button" disabled={!editable || save.isPending} onClick={() => save.mutate()}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">Зберегти плани прорабів</button>
    </section>
  );
}
