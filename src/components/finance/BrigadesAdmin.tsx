/** Довідник бригад, ставки робіт і маппінг позицій кошторису → коди робіт (owner/фінанси). */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listBrigades, upsertBrigade, listRatesAndMappings, addRate, upsertMapping } from "@/lib/brigades.functions";

const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const MODULES = ["screed", "roofing", "general", "demolition", "insulation"] as const;

export function BrigadesAdmin() {
  const qc = useQueryClient();
  const bFn = useServerFn(listBrigades);
  const rmFn = useServerFn(listRatesAndMappings);
  const upB = useServerFn(upsertBrigade);
  const addR = useServerFn(addRate);
  const upM = useServerFn(upsertMapping);
  const b = useQuery({ queryKey: ["brigades"], queryFn: () => bFn() });
  const rm = useQuery({ queryKey: ["brigade-rates"], queryFn: () => rmFn(), retry: false });
  const act = useMutation({
    mutationFn: (fn: () => Promise<any>) => fn(),
    onSuccess: () => { toast.success("Збережено"); qc.invalidateQueries({ queryKey: ["brigades"] }); qc.invalidateQueries({ queryKey: ["brigade-rates"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const [nb, setNb] = useState({ key: "", label: "", module: "general" as (typeof MODULES)[number], payroll_id: "" });
  const [nr, setNr] = useState({ brigadeKey: "", serviceCode: "", unit: "м²", rate: "", effectiveFrom: "", pricing: "per_unit" as "per_unit" | "minimum" | "fixed_until_threshold", minimum: "", threshold: "" });
  const n = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
  const [nm, setNm] = useState({ estimateModule: "", lineCode: "", serviceCode: "", unit: "" });
  if (rm.isError) return null;
  const brigades = b.data ?? [];
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h3 className="font-semibold text-sm">Бригади</h3>
        {brigades.map((x) => (
          <div key={x.key} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium w-48">{x.label}</span>
            <span className="font-mono text-muted-foreground">{x.key}</span>
            <span>{x.module}</span>
            <span className="text-muted-foreground">у відомості: {x.payroll_id ?? "не зіставлено"}</span>
            <Button size="sm" variant="ghost" onClick={() => act.mutate(() => upB({ data: { ...x, active: !x.active } }))}>{x.active ? "Деактивувати" : "Активувати"}</Button>
          </div>
        ))}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5 items-end pt-2">
          <Input className="h-9" placeholder="ключ (латиниця)" value={nb.key} onChange={(e) => setNb({ ...nb, key: e.target.value.trim() })} />
          <Input className="h-9" placeholder="Назва" value={nb.label} onChange={(e) => setNb({ ...nb, label: e.target.value })} />
          <select className={sel} value={nb.module} onChange={(e) => setNb({ ...nb, module: e.target.value as any })}>{MODULES.map((m) => <option key={m}>{m}</option>)}</select>
          <Input className="h-9" placeholder="id у відомості (необов.)" value={nb.payroll_id} onChange={(e) => setNb({ ...nb, payroll_id: e.target.value.trim() })} />
          <Button size="sm" disabled={!nb.key || !nb.label} onClick={() => act.mutate(() => upB({ data: { key: nb.key, label: nb.label, module: nb.module, payroll_id: nb.payroll_id || null, active: true, sort_order: (brigades.length + 1) * 10, notes: null } }))}>Додати / оновити</Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h3 className="font-semibold text-sm">Ставки робіт бригад (зарплатні, не ціна клієнту)</h3>
        {(rm.data?.rates ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Ставок ще немає — вартість робіт показується як «немає даних».</p> : (rm.data?.rates ?? []).map((r) => (
          <div key={r.id} className="text-xs">{brigades.find((x) => x.key === r.brigade_key)?.label ?? r.brigade_key} · <span className="font-mono">{r.service_code}</span> · {r.rate} грн/{r.unit}{(r as any).pricing === "minimum" ? ` · мінімум ${(r as any).minimum_amount} грн` : (r as any).pricing === "fixed_until_threshold" ? ` · до ${(r as any).threshold_qty} ${r.unit} фікс ${(r as any).minimum_amount} грн, понад — ставка за весь обсяг` : ""} · з {r.effective_from.split("-").reverse().join(".")}{r.effective_to ? ` по ${r.effective_to.split("-").reverse().join(".")}` : ""}</div>
        ))}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-6 items-end pt-2">
          <select className={sel} value={nr.brigadeKey} onChange={(e) => setNr({ ...nr, brigadeKey: e.target.value })}><option value="">Бригада…</option>{brigades.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
          <Input className="h-9" placeholder="код роботи" value={nr.serviceCode} onChange={(e) => setNr({ ...nr, serviceCode: e.target.value.trim() })} />
          <Input className="h-9" placeholder="од." value={nr.unit} onChange={(e) => setNr({ ...nr, unit: e.target.value })} />
          <Input className="h-9" inputMode="decimal" placeholder="ставка, грн" value={nr.rate} onChange={(e) => setNr({ ...nr, rate: e.target.value })} />
          <select className={sel} value={nr.pricing} onChange={(e) => setNr({ ...nr, pricing: e.target.value as any })}><option value="per_unit">За одиницю</option><option value="minimum">Не менше мінімуму</option><option value="fixed_until_threshold">Фікс до порогу</option></select>
          {nr.pricing !== "per_unit" && <Input className="h-9" inputMode="decimal" placeholder={nr.pricing === "minimum" ? "мінімум, грн" : "фікс, грн"} value={nr.minimum} onChange={(e) => setNr({ ...nr, minimum: e.target.value })} />}
          {nr.pricing === "fixed_until_threshold" && <Input className="h-9" inputMode="decimal" placeholder="поріг обсягу" value={nr.threshold} onChange={(e) => setNr({ ...nr, threshold: e.target.value })} />}
          <Input className="h-9" type="date" value={nr.effectiveFrom} onChange={(e) => setNr({ ...nr, effectiveFrom: e.target.value })} />
          <Button size="sm" disabled={!nr.brigadeKey || !nr.serviceCode || !nr.effectiveFrom || !(Number(nr.rate.replace(",", ".")) > 0) || (nr.pricing !== "per_unit" && n(nr.minimum) === null) || (nr.pricing === "fixed_until_threshold" && !((n(nr.threshold) ?? 0) > 0))}
            onClick={() => act.mutate(() => addR({ data: { brigadeKey: nr.brigadeKey, serviceCode: nr.serviceCode, unit: nr.unit, rate: Number(nr.rate.replace(",", ".")), effectiveFrom: nr.effectiveFrom, note: null, pricing: nr.pricing, minimumAmount: nr.pricing === "per_unit" ? null : n(nr.minimum), thresholdQty: nr.pricing === "fixed_until_threshold" ? n(nr.threshold) : null } }))}>Нова ставка</Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-3 space-y-2">
        <h3 className="font-semibold text-sm">Маппінг позицій кошторису → коди робіт</h3>
        {(rm.data?.mappings ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Маппінгів немає — план із кошторису не підтягується.</p> : (rm.data?.mappings ?? []).map((m) => (
          <div key={m.id} className="text-xs">{m.estimate_module} · {m.line_code} → <span className="font-mono">{m.service_code}</span>{m.unit ? ` (${m.unit})` : ""}{m.active ? "" : " · вимкнено"}</div>
        ))}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5 items-end pt-2">
          <Input className="h-9" placeholder="модуль кошторису (roofing…)" value={nm.estimateModule} onChange={(e) => setNm({ ...nm, estimateModule: e.target.value.trim() })} />
          <Input className="h-9" placeholder="код позиції (W001)" value={nm.lineCode} onChange={(e) => setNm({ ...nm, lineCode: e.target.value.trim() })} />
          <Input className="h-9" placeholder="код роботи" value={nm.serviceCode} onChange={(e) => setNm({ ...nm, serviceCode: e.target.value.trim() })} />
          <Input className="h-9" placeholder="од. (необов.)" value={nm.unit} onChange={(e) => setNm({ ...nm, unit: e.target.value })} />
          <Button size="sm" disabled={!nm.estimateModule || !nm.lineCode || !nm.serviceCode} onClick={() => act.mutate(() => upM({ data: { ...nm, unit: nm.unit || null, active: true } }))}>Зберегти</Button>
        </div>
      </section>
    </div>
  );
}
