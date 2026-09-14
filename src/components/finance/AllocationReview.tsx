/**
 * Ручний інструмент підтвердження та корекції розподілів операцій Finmap.
 * Виміри (проєкт / стаття / напрямок) незалежні; ручний розподіл фіксує
 * лише свій вимір і не перетирається наступною синхронізацією.
 * Розрахунків тут немає — суми рахує серверна функція.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatUah } from "@/lib/screed-calc";
import { TERZI_MODULES, moduleLabel } from "@/lib/modules";
import { listAllocationReview, getAllocationHistory, saveManualAllocation } from "@/lib/finance/management.functions";

const card = "rounded-2xl border border-border bg-card p-4 shadow-sm";
const note = "rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground";
const input = "h-8 w-full rounded-md border border-border bg-background px-2 text-[12px]";

type Dim = "project" | "category" | "service";
const DIM_LABEL: Record<Dim, string> = { project: "Проєкт (обʼєкт)", category: "Стаття", service: "Напрямок" };
const STATUS_LABEL: Record<string, string> = {
  none: "немає розподілу", partial: "частковий", full: "повний", manual: "ручний", needs_review: "на перевірку",
};

const dfmt = (v: string | null) => (v ? new Date(v).toLocaleDateString("uk-UA") : "—");
const dtfmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

type Part = { ref?: string | null; name?: string | null; order_id?: string | null; category_id?: string | null; service?: string | null; amount: number };

export function AllocationReviewSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllocationReview);
  const [dim, setDim] = useState<Dim>("project");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fin-alloc-review", dim],
    queryFn: () => listFn({ data: { dimension: dim, limit: 50 } }),
  });

  if (isLoading) return <div className={note}>Завантаження…</div>;
  if (error) return <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{(error as Error).message}</div>;

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <div className={note}>
        Підтвердіть розподіл як є або скоригуйте суми вручну. Виміри незалежні: ручний розподіл
        за напрямком не блокує оновлення проєкту чи статті з Finmap. Кожна зміна пишеться в історію.
      </div>

      <div className="flex flex-wrap gap-2">
        {(["project", "category", "service"] as Dim[]).map((d) => (
          <button
            key={d}
            onClick={() => { setDim(d); setOpenId(null); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${dim === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {DIM_LABEL[d]}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <div className={note}>Операцій, що потребують ручного розподілу за цим виміром, немає.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r: any) => {
            const d = r.dims.find((x: any) => x.dimension === dim);
            return (
              <div key={r.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold">
                      {r.kind === "income" ? "Надходження" : "Витрата"} · {formatUah(r.amount)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {[r.counterparty, r.category, r.comment].filter(Boolean).join(" · ") || "без опису"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Касова дата {dfmt(r.payment_date)} · управлінський період {dfmt(r.period_start)}—{dfmt(r.period_end)}
                    </div>
                  </div>
                  <div className="text-right text-[11px]">
                    <div className="font-semibold">{STATUS_LABEL[d?.status] ?? d?.status}</div>
                    <div className="text-muted-foreground">
                      розподілено {formatUah(d?.allocated ?? 0)} · залишок {formatUah(d?.unallocated ?? 0)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  className="mt-2 text-[11px] font-semibold text-primary"
                >
                  {openId === r.id ? "Згорнути" : "Підтвердити або скоригувати"}
                </button>

                {openId === r.id && d ? (
                  <AllocationEditor
                    tx={r}
                    dim={dim}
                    dimState={d}
                    refs={data!.refs}
                    onSaved={() => { qc.invalidateQueries({ queryKey: ["fin-alloc-review"] }); }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AllocationEditor({
  tx, dim, dimState, refs, onSaved,
}: { tx: any; dim: Dim; dimState: any; refs: { orders: Array<{ id: string; label: string }>; categories: Array<{ id: string; label: string }> }; onSaved: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveManualAllocation);
  const histFn = useServerFn(getAllocationHistory);

  const [parts, setParts] = useState<Part[]>(() =>
    dimState.parts.length
      ? dimState.parts.map((p: any) => ({ ref: p.ref, name: p.name, order_id: p.order_id, category_id: p.category_id, service: p.service, amount: p.amount }))
      : [{ amount: tx.amount }],
  );

  const { data: history } = useQuery({
    queryKey: ["fin-alloc-history", tx.id],
    queryFn: () => histFn({ data: { transaction_id: tx.id } }),
  });

  const sum = useMemo(() => parts.reduce((s, p) => s + (Number(p.amount) || 0), 0), [parts]);
  const rest = Math.round((tx.amount - sum) * 100) / 100;

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          transaction_id: tx.id,
          dimension: dim,
          parts: parts
            .filter((p) => (Number(p.amount) || 0) !== 0)
            .map((p) => ({
              ref: p.ref ?? null,
              name: p.name ?? null,
              order_id: dim === "project" ? (p.order_id ?? null) : null,
              category_id: dim === "category" ? (p.category_id ?? null) : null,
              service: dim === "service" ? (p.service ?? null) : null,
              amount: Number(p.amount) || 0,
            })),
        },
      }),
    onSuccess: () => {
      toast.success("Розподіл збережено як ручний");
      qc.invalidateQueries({ queryKey: ["fin-alloc-history", tx.id] });
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти розподіл"),
  });

  const upd = (i: number, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {dimState.hasFinmap && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-[11px] text-primary">
          Увага: цей вимір надходить із Finmap. Після збереження він стає ручним і наступні
          синхронізації його не змінять — розбіжність із Finmap доведеться правити тут вручну.
          Дублів при повторній синхронізації не буде: попередні частки цього виміру замінюються.
        </div>
      )}

      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            {dim === "project" ? (
              <select
                className={input}
                value={p.order_id ?? ""}
                onChange={(e) => {
                  const o = refs.orders.find((x) => x.id === e.target.value);
                  upd(i, { order_id: e.target.value || null, name: o?.label ?? null, ref: p.ref ?? null });
                }}
              >
                <option value="">— обʼєкт не вибрано —</option>
                {refs.orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : dim === "category" ? (
              <select
                className={input}
                value={p.category_id ?? ""}
                onChange={(e) => {
                  const c = refs.categories.find((x) => x.id === e.target.value);
                  upd(i, { category_id: e.target.value || null, name: c?.label ?? null });
                }}
              >
                <option value="">— стаття не вибрана —</option>
                {refs.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            ) : (
              <select
                className={input}
                value={p.service ?? ""}
                onChange={(e) => upd(i, { service: e.target.value || null, name: e.target.value ? moduleLabel(e.target.value) : null })}
              >
                <option value="">— напрямок не вибрано —</option>
                {TERZI_MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            )}
            <input
              type="number"
              step="0.01"
              className={`${input} text-right`}
              value={p.amount}
              onChange={(e) => upd(i, { amount: Number(e.target.value) })}
            />
            <button
              onClick={() => setParts((prev) => prev.filter((_, idx) => idx !== i))}
              className="h-8 rounded-md border border-border px-2 text-[11px] text-muted-foreground"
            >
              Прибрати
            </button>
          </div>
        ))}
        <button
          onClick={() => setParts((prev) => [...prev, { amount: Math.max(rest, 0) }])}
          className="text-[11px] font-semibold text-primary"
        >
          + Додати частку
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          Сума операції {formatUah(tx.amount)} · розподілено {formatUah(sum)} ·{" "}
          {rest > 0 ? `нерозподілено ${formatUah(rest)}` : rest < 0 ? `перевищення ${formatUah(-rest)}` : "розподілено повністю"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || rest < 0}
            className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {dimState.parts.length && sum === tx.amount ? "Підтвердити розподіл" : "Зберегти корекцію"}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Історія змін</div>
        {!history?.length ? (
          <div className="py-1 text-[11px] text-muted-foreground">Ручних змін ще не було</div>
        ) : (
          <div className="mt-1 space-y-1">
            {history.map((h: any) => (
              <div key={h.id} className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <b>{h.actor_name ?? "Користувач"}</b>
                  <span className="text-muted-foreground">{dtfmt(h.created_at)}</span>
                </div>
                <div className="text-muted-foreground">
                  Вимір: {DIM_LABEL[(h.new_value?.dimension as Dim) ?? "project"] ?? "—"} · часток:{" "}
                  {Array.isArray(h.new_value?.parts) ? h.new_value.parts.length : 0}
                  {Array.isArray(h.old_value) ? ` (було ${h.old_value.length})` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
