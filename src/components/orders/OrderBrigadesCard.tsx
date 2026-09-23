/** Бригади об'єкта + план/факт робіт і виплат. Економіка — лише owner/фінанси (сервер). */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardHat, Check, Ban, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getOrderBrigades, setOrderBrigades, getOrderBrigadeEconomics, pullPlanVolumes, addWorkVolume, setRecordState, addPayout,
} from "@/lib/brigades.functions";
import { getPayrollSiteSummary } from "@/lib/payroll-bridge.functions";

const ND = "немає даних";
const money = (v: number | null | undefined) => (v === null || v === undefined ? ND : `${v.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн`);
const qty = (v: number) => v.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export function OrderBrigadesCard({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrderBrigades);
  const setFn = useServerFn(setOrderBrigades);
  const q = useQuery({ queryKey: ["order-brigades", orderId], queryFn: () => getFn({ data: { orderId } }) });
  const [draft, setDraft] = useState<string[] | null>(null);
  const m = useMutation({
    mutationFn: (keys: string[]) => setFn({ data: { orderId, brigadeKeys: keys } }),
    onSuccess: () => { toast.success("Бригади збережено"); setDraft(null); qc.invalidateQueries({ queryKey: ["order-brigades", orderId] }); qc.invalidateQueries({ queryKey: ["order-econ", orderId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  if (!q.data) return null;
  const { brigades, assigned, canEdit, canSeeEconomics } = q.data;
  const cur = draft ?? assigned;
  const label = (k: string) => brigades.find((b) => b.key === k)?.label ?? k;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><HardHat className="h-3.5 w-3.5" />Бригади об'єкта</div>
      <div className="flex flex-wrap gap-2">
        {brigades.filter((b) => b.active || cur.includes(b.key)).map((b) => {
          const on = cur.includes(b.key);
          return (
            <button key={b.key} type="button" disabled={!canEdit}
              onClick={() => setDraft(on ? cur.filter((k) => k !== b.key) : [...cur, b.key])}
              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"} disabled:opacity-60`}>
              {b.label}
            </button>
          );
        })}
      </div>
      {draft && <div className="flex gap-2"><Button size="sm" onClick={() => m.mutate(draft)} disabled={m.isPending}>Зберегти</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Скасувати</Button></div>}
      {!cur.length && <p className="text-xs text-muted-foreground">Бригади не призначено. Бронювання в календарі для цього об'єкта будуть обмежені призначеними бригадами.</p>}
      {canSeeEconomics && assigned.length > 0 && <Economics orderId={orderId} label={label} />}
    </div>
  );
}

function Economics({ orderId, label }: { orderId: string; label: (k: string) => string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrderBrigadeEconomics);
  const pullFn = useServerFn(pullPlanVolumes);
  const addFn = useServerFn(addWorkVolume);
  const stateFn = useServerFn(setRecordState);
  const payFn = useServerFn(addPayout);
  const q = useQuery({ queryKey: ["order-econ", orderId], queryFn: () => getFn({ data: { orderId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["order-econ", orderId] });
  const onErr = (e: any) => toast.error(e?.message ?? "Помилка");
  const act = useMutation({ mutationFn: (fn: () => Promise<any>) => fn(), onSuccess: () => { toast.success("Збережено"); refresh(); }, onError: onErr });
  const [vol, setVol] = useState({ brigadeKey: "", serviceCode: "", kind: "fact" as "plan" | "fact", quantity: "", unit: "м²", period: "", note: "" });
  const [pay, setPay] = useState({ brigadeKey: "", amount: "", period: "", note: "" });
  const [pull, setPull] = useState({ brigadeKey: "", source: "estimate" as "estimate" | "measurement", serviceCode: "" });

  if (q.isError) return <p className="text-xs text-destructive">{(q.error as any)?.message}</p>;
  const d = q.data;
  if (!d) return <p className="text-xs text-muted-foreground">Завантаження…</p>;
  const e = d.econ;
  const period = d.defaultPeriod as string;
  const assigned: string[] = d.assigned;

  const Line = ({ l, fact }: { l: any; fact?: boolean }) => (
    <tr className="border-t border-border/60">
      <td className="py-1 pr-2">{label(l.row.brigade_key)}</td>
      <td className="pr-2 font-mono">{l.row.service_code}</td>
      <td className="pr-2 text-right">{qty(l.row.quantity)} {l.row.unit ?? ""}</td>
      <td className="pr-2 text-right">{l.rate === null ? ND : `${l.rate} грн`}</td>
      <td className="pr-2 text-right">{money(l.amount)}</td>
      <td className="pr-2 text-muted-foreground">{l.row.source} · {l.row.period}{fact ? " · підтв." : ""}</td>
      <td><button type="button" aria-label="Анулювати" className="text-muted-foreground hover:text-destructive" onClick={() => act.mutate(() => stateFn({ data: { table: "order_work_volumes", id: l.row.id, action: "void" } }))}><Ban className="h-3.5 w-3.5" /></button></td>
    </tr>
  );
  const pendingFact = (d.volumes as any[]).filter((v) => v.kind === "fact" && !v.confirmed && !v.voided);
  const livePayouts = (d.payouts as any[]).filter((p) => !p.voided);

  return (
    <div className="space-y-4 border-t border-border pt-3 text-xs">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat l="Планова виручка (кошторис)" v={money(e.estimate.planRevenue)} />
        <Stat l="План матеріали/інші прямі (без праці)" v={e.estimate.compositionKnown ? money(e.estimate.planNonLabor) : `${ND} (склад кошторису невідомий)`} />
        <Stat l="План робіт бригад за ставками" v={money(e.plan.brigadeTotal)} />
        <Stat l="Маржа план" v={money(e.plan.margin)} note={e.plan.marginBasis} />
        <Stat l="Факт нараховано за ставками (підтв. обсяги)" v={money(e.fact.accruedByRate)} note="Розрахунок, не виплата" />
        <Stat l="Факт виплачено бригадам (підтв.)" v={money(e.fact.payouts)} note={e.fact.unconfirmedPayouts ? `Не підтверджено: ${money(e.fact.unconfirmedPayouts)}` : undefined} />
        <Stat l="Факт виручка" v={money(e.fact.revenue)} />
        <Stat l="Маржа факт" v={money(e.fact.margin)} note={e.fact.marginBasis} />
      </div>
      {e.estimate.estimateLabor !== null && <p className="text-muted-foreground">Праця всередині кошторису: {money(e.estimate.estimateLabor)} — у маржі план не віднімається вдруге.</p>}
      {!d.estimate && <p className="text-muted-foreground">Затвердженого кошторису немає.</p>}

      <section className="space-y-2">
        <h4 className="font-semibold">План обсягів і вартості робіт</h4>
        <div className="flex flex-wrap items-end gap-2">
          <select className={sel} value={pull.brigadeKey} onChange={(x) => setPull({ ...pull, brigadeKey: x.target.value })}><option value="">Бригада…</option>{assigned.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
          <select className={sel} value={pull.source} onChange={(x) => setPull({ ...pull, source: x.target.value as any })}><option value="estimate">З кошторису (маппінг)</option><option value="measurement">З площі заміру</option></select>
          {pull.source === "measurement" && <Input className="h-9 w-40" placeholder="код роботи" value={pull.serviceCode} onChange={(x) => setPull({ ...pull, serviceCode: x.target.value.trim() })} />}
          <Button size="sm" variant="outline" disabled={!pull.brigadeKey} onClick={() => act.mutate(() => pullFn({ data: { orderId, brigadeKey: pull.brigadeKey, source: pull.source, serviceCode: pull.serviceCode || undefined, period } }))}><Download className="h-3.5 w-3.5 mr-1" />Підтягнути план</Button>
        </div>
        {d.estimateWorks.unmapped.length > 0 && <p className="text-muted-foreground">Не зіставлено з кодами робіт: {d.estimateWorks.unmapped.map((u: any) => `${u.code} ${u.name} (${u.reason})`).join("; ")}</p>}
        <Table rows={e.plan.lines.map((l: any) => <Line key={l.row.id} l={l} />)} />
      </section>

      <section className="space-y-2">
        <h4 className="font-semibold">Факт виконаних обсягів (лише підтверджені)</h4>
        <Table rows={e.fact.lines.map((l: any) => <Line key={l.row.id} l={l} fact />)} />
        {pendingFact.length > 0 && (
          <div className="space-y-1">
            <div className="text-muted-foreground">Очікують підтвердження:</div>
            {pendingFact.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2">
                <span>{label(v.brigade_key)} · {v.service_code} · {qty(v.quantity)} {v.unit ?? ""} · {v.period}</span>
                <Button size="sm" variant="outline" onClick={() => act.mutate(() => stateFn({ data: { table: "order_work_volumes", id: v.id, action: "confirm" } }))}><Check className="h-3.5 w-3.5 mr-1" />Підтвердити</Button>
                <Button size="sm" variant="ghost" onClick={() => act.mutate(() => stateFn({ data: { table: "order_work_volumes", id: v.id, action: "void" } }))}><Ban className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-7 items-end">
          <select className={sel} value={vol.brigadeKey} onChange={(x) => setVol({ ...vol, brigadeKey: x.target.value })}><option value="">Бригада…</option>{assigned.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
          <select className={sel} value={vol.kind} onChange={(x) => setVol({ ...vol, kind: x.target.value as any })}><option value="fact">Факт</option><option value="plan">План</option></select>
          <Input className="h-9" placeholder="код роботи" value={vol.serviceCode} onChange={(x) => setVol({ ...vol, serviceCode: x.target.value.trim() })} />
          <Input className="h-9" inputMode="decimal" placeholder="кількість" value={vol.quantity} onChange={(x) => setVol({ ...vol, quantity: x.target.value })} />
          <Input className="h-9" placeholder="од." value={vol.unit} onChange={(x) => setVol({ ...vol, unit: x.target.value })} />
          <Input className="h-9" placeholder={period} value={vol.period} onChange={(x) => setVol({ ...vol, period: x.target.value })} />
          <Button size="sm" disabled={!vol.brigadeKey || !vol.serviceCode || !(Number(vol.quantity.replace(",", ".")) > 0)}
            onClick={() => act.mutate(() => addFn({ data: { orderId, brigadeKey: vol.brigadeKey, serviceCode: vol.serviceCode, kind: vol.kind, quantity: Number(vol.quantity.replace(",", ".")), unit: vol.unit || null, period: vol.period || period, note: vol.note || null } }))}><Plus className="h-3.5 w-3.5 mr-1" />Додати</Button>
        </div>
        <p className="text-muted-foreground">Ручний факт зберігається з джерелом «manual» і періодом; у розрахунок потрапляє лише після окремого підтвердження.</p>
      </section>

      <section className="space-y-2">
        <h4 className="font-semibold">Фактичні виплати бригадам</h4>
        {livePayouts.length === 0 ? <p className="text-muted-foreground">{ND}</p> : livePayouts.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2">
            <span>{label(p.brigade_key)} · {money(p.amount)} · {p.period} · {p.source}{p.confirmed ? " · підтверджено" : " · не підтверджено"}</span>
            {!p.confirmed && <Button size="sm" variant="outline" onClick={() => act.mutate(() => stateFn({ data: { table: "order_brigade_payouts", id: p.id, action: "confirm" } }))}><Check className="h-3.5 w-3.5 mr-1" />Підтвердити</Button>}
            <Button size="sm" variant="ghost" onClick={() => act.mutate(() => stateFn({ data: { table: "order_brigade_payouts", id: p.id, action: "void" } }))}><Ban className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5 items-end">
          <select className={sel} value={pay.brigadeKey} onChange={(x) => setPay({ ...pay, brigadeKey: x.target.value })}><option value="">Бригада…</option>{assigned.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
          <Input className="h-9" inputMode="decimal" placeholder="сума, грн" value={pay.amount} onChange={(x) => setPay({ ...pay, amount: x.target.value })} />
          <Input className="h-9" placeholder={period} value={pay.period} onChange={(x) => setPay({ ...pay, period: x.target.value })} />
          <Input className="h-9" placeholder="примітка" value={pay.note} onChange={(x) => setPay({ ...pay, note: x.target.value })} />
          <Button size="sm" disabled={!pay.brigadeKey || !(Number(pay.amount.replace(",", ".")) > 0)}
            onClick={() => act.mutate(() => payFn({ data: { orderId, brigadeKey: pay.brigadeKey, amount: Number(pay.amount.replace(",", ".")), period: pay.period || period, note: pay.note || null } }))}><Plus className="h-3.5 w-3.5 mr-1" />Виплата</Button>
        </div>
      </section>

      {e.diff.length > 0 && (
        <section className="space-y-1">
          <h4 className="font-semibold">Різниця план – факт (обсяги)</h4>
          {e.diff.map((x: any) => <div key={`${x.brigade_key}${x.service_code}`}>{label(x.brigade_key)} · {x.service_code}: план {qty(x.plan)} · факт {qty(x.fact)} · Δ {qty(x.delta)}</div>)}
        </section>
      )}
      <p className="text-muted-foreground">{d.factNote}</p>
      <SiteSummary orderId={orderId} />
    </div>
  );
}

function Stat({ l, v, note }: { l: string; v: string; note?: string }) {
  return <div className="rounded-md border border-border/60 p-2"><div className="text-[10px] text-muted-foreground">{l}</div><div className="font-semibold text-sm">{v}</div>{note && <div className="text-[10px] text-muted-foreground mt-0.5">{note}</div>}</div>;
}
function Table({ rows }: { rows: React.ReactNode[] }) {
  if (!rows.length) return <p className="text-muted-foreground">{ND}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="text-muted-foreground text-left"><tr><th>Бригада</th><th>Код</th><th className="text-right">Обсяг</th><th className="text-right">Ставка</th><th className="text-right">Сума</th><th>Джерело</th><th /></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function SiteSummary({ orderId }: { orderId: string }) {
  const fn = useServerFn(getPayrollSiteSummary);
  const q = useQuery({ queryKey: ["payroll-site-summary", orderId], queryFn: () => fn({ data: { orderId } }), staleTime: 60_000, retry: false });
  const r = q.data;
  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h4 className="font-semibold">Дані відомості Payroll KPI (довідково, не змінюють ERP)</h4>
      {!r ? <p className="text-muted-foreground">Завантаження…</p> : !r.ok ? <p className="text-muted-foreground">{r.reason}</p> : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat l="План виручка" v={money(r.summary.planRevenue)} />
            <Stat l="План прямі (повний кошторис)" v={money(r.summary.planDirectCosts)} />
            <Stat l="План бригади" v={money(r.summary.planCrew)} />
            <Stat l="План вал" v={money(r.summary.planGross)} />
            <Stat l="Маржа план" v={money(r.summary.planMargin)} />
            <Stat l="Відхилення" v={money(r.summary.variance)} />
            <Stat l="Факт виручка" v={money(r.summary.revenue)} />
            <Stat l="Факт прямі" v={money(r.summary.directCosts)} />
            <Stat l="Факт бригади" v={money(r.summary.crewFact)} />
            <Stat l="Факт вал" v={money(r.summary.gross)} />
            <Stat l="Маржа факт" v={money(r.summary.margin)} />
            <Stat l="Виплачено бригаді" v={money(r.summary.crewPaid)} />
          </div>
          {(r.summary.planLines.length > 0 || r.summary.factLines.length > 0) && (
            <div className="grid gap-2 md:grid-cols-2">
              {([["План робіт", r.summary.planLines], ["Факт робіт", r.summary.factLines]] as const).map(([t, ls]) => (
                <div key={t}><b>{t}</b>{ls.length === 0 ? <p className="text-muted-foreground">немає даних</p> : (
                  <ul className="text-xs">{ls.map((l, i) => <li key={i}>{l.brigadeId} · {l.serviceCode} · {l.quantity ?? "немає даних"} {l.unit ?? ""} · {money(l.amount)}</li>)}</ul>
                )}</div>
              ))}
            </div>
          )}
          <p className="text-muted-foreground">Виконання підтверджене: {r.summary.verified ? "так" : "ні"} · Акт: {r.summary.act ? "так" : "ні"} · Оплачено: {r.summary.paid ? "так" : "ні"} · Закрито: {r.summary.closed ? "так" : "ні"} · ревізія {r.summary.revision ?? "—"} · оновлено у відомості {r.summary.updatedAt ? new Date(r.summary.updatedAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—"}</p>
        </>
      )}
    </section>
  );
}
