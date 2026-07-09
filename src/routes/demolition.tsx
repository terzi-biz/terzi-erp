import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAppStore, generateEstimateNumber } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useModulePricing } from "@/lib/usePricing";
import { saveEstimate } from "@/lib/estimates.functions";
import {
  calculateDemolition, DEFAULT_DEMOLITION_LOGISTICS, DEFAULT_DEMOLITION_WORKS,
  type DemolitionInput, type DemoType, type ContainerSize, type PaymentForm,
} from "@/lib/demolition-calc";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { exportElementAsPng } from "@/lib/pngExport";
import { AlertTriangle, Save, Image as ImageIcon, RotateCcw, Eye, EyeOff, Calculator, FileText } from "lucide-react";
import { EstimateView } from "@/components/EstimateView";
import logoAsset from "@/assets/terzi-logo.jpeg.asset.json";

export const Route = createFileRoute("/demolition")({ component: DemolitionPage });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>
  );
}

const defaultInput: DemolitionInput = {
  area: 50, thicknessCm: 7, type: "screed",
  containerSize: 8, withBags: false, floor: 1,
  cityDelivery: true, outOfCityKm: 0,
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

function DemolitionPage() {
  const { roles, profile } = useAuth();
  const isInternal = roles.some((r) => r === "admin" || r === "director" || r === "finance");
  const { demolitionCoeffs, branding } = useAppStore();
  const { materialPrices, workPrices } = useModulePricing("demolition");
  const [input, setInput] = useState<DemolitionInput>(defaultInput);
  const [client, setClient] = useState({ name: "", phone: "", address: "", manager: profile?.display_name ?? "" });
  const [showInternal, setShowInternal] = useState(isInternal);
  const printRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"calc" | "estimate">("calc");
  const [estimateNumber] = useState(() => generateEstimateNumber());
  const [estimateId, setEstimateId] = useState<string | undefined>(undefined);

  const worksMapped = useMemo(() => {
    const w = { ...DEFAULT_DEMOLITION_WORKS };
    const wp = workPrices as unknown as Record<string, number>;
    for (const k of Object.keys(w) as (keyof typeof w)[]) if (wp[k]) w[k] = wp[k];
    return w;
  }, [workPrices]);

  const result = useMemo(
    () => calculateDemolition(input, materialPrices, worksMapped, DEFAULT_DEMOLITION_LOGISTICS, demolitionCoeffs),
    [input, materialPrices, worksMapped, demolitionCoeffs],
  );

  const upd = <K extends keyof DemolitionInput>(k: K, v: DemolitionInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const qc = useQueryClient();
  const saveFn = useServerFn(saveEstimate);
  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: {
      id: estimateId,
      number: estimateNumber, module: "demolition", status: "draft",
      client_name: client.name || null, client_phone: client.phone || null,
      address: client.address || null, manager: client.manager || null,
      area: input.area, thickness_cm: input.thicknessCm,
      total_client: result.totalClient, total_cost: result.totalCost,
      gross_profit: result.grossProfit, margin_percent: result.marginPercent,
      payload: input as unknown as Record<string, unknown>,
    } }),
    onSuccess: (row: { id?: string }) => {
      if (row?.id) setEstimateId(row.id);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Кошторис демонтажу збережено");
    },
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });

  const onPng = async () => {
    if (!printRef.current) return;
    await exportElementAsPng(printRef.current, `TERZI-demo-${Date.now()}.png`);
  };

  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 relative">
      <img src={logoAsset.url} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed right-6 bottom-6 w-40 md:w-56 opacity-[0.06] z-0" />

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-border pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <img src={logoAsset.url} alt="TERZI" className="w-12 h-12 rounded-md object-cover ring-1 ring-border" />
          <div>
            <div className="hatch-accent h-1 w-16 mb-2 rounded" />
            <h1 className="text-xl md:text-2xl font-black">Калькулятор демонтажу</h1>
            <p className="text-xs text-muted-foreground mt-1">Стяжка / плитка / покрівля / перегородки + вивіз</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isInternal && (
            <button onClick={() => setShowInternal((v) => !v)} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2">
              {showInternal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showInternal ? "Управлінський" : "Клієнтський"}
            </button>
          )}
          <button onClick={() => setInput(defaultInput)} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2"><RotateCcw className="w-3 h-3" />Скинути</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"><Save className="w-3 h-3" />{saveMut.isPending ? "…" : "Зберегти"}</button>
          <button onClick={onPng} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2"><ImageIcon className="w-3 h-3" />PNG</button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-border relative z-10">
        <button onClick={() => setView("calc")} className={`px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${view === "calc" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Calculator className="w-4 h-4" /> Калькулятор
        </button>
        <button onClick={() => setView("estimate")} className={`px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${view === "estimate" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <FileText className="w-4 h-4" /> Кошторис / КП
        </button>
      </div>

      {view === "estimate" && (
        <div className="relative z-10">
          <EstimateView result={result} client={client} branding={branding} module="Демонтаж"
            area={input.area} thicknessCm={input.thicknessCm} estimateNumber={estimateNumber} isInternal={isInternal} estimateId={estimateId} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 relative z-10" style={{ display: view === "calc" ? undefined : "none" }}>

        <div className="space-y-4 md:space-y-6">
          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Дані об'єкта</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Замовник"><input className={inp} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
              <Field label="Телефон"><input className={inp} value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></Field>
              <Field label="Адреса"><input className={inp} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
              <Field label="Менеджер"><input className={inp} value={client.manager} onChange={(e) => setClient({ ...client, manager: e.target.value })} /></Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Тип демонтажу</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                { id: "screed", label: "🪨 Стяжка" },
                { id: "tile", label: "🟦 Плитка" },
                { id: "roof", label: "🏠 Покрівля" },
                { id: "walls", label: "🧱 Перегородки" },
              ] as { id: DemoType; label: string }[]).map((t) => (
                <button key={t.id} onClick={() => upd("type", t.id)}
                  className={`p-3 rounded-md border-2 text-xs font-semibold transition ${input.type === t.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 hover:border-primary/50"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Геометрія / поверх</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Площа, м²"><input type="number" className={inp} value={input.area} onChange={(e) => upd("area", +e.target.value)} /></Field>
              <Field label="Товщина, см"><input type="number" className={inp} value={input.thicknessCm} onChange={(e) => upd("thicknessCm", +e.target.value)} /></Field>
              <Field label="Поверх"><input type="number" className={inp} value={input.floor} onChange={(e) => upd("floor", +e.target.value)} /></Field>
              <Field label="Ручний об'єм сміття, м³ (опц.)">
                <input type="number" className={inp} value={input.manualHaulM3 ?? 0} onChange={(e) => upd("manualHaulM3", +e.target.value || undefined)} />
              </Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Логістика</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Розмір контейнера">
                <select className={inp} value={input.containerSize} onChange={(e) => upd("containerSize", +e.target.value as ContainerSize)}>
                  <option value={8}>8 м³</option>
                  <option value={27}>27 м³</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={input.withBags} onChange={(e) => upd("withBags", e.target.checked)} />Винос мішками</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.cityDelivery} onChange={(e) => upd("cityDelivery", e.target.checked)} />Місто</label>
              <Field label="За містом, км в один бік"><input type="number" disabled={input.cityDelivery} className={inp} value={input.outOfCityKm} onChange={(e) => upd("outOfCityKm", +e.target.value)} /></Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Комерційні умови</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Оплата">
                <select className={inp} value={input.payment} onChange={(e) => upd("payment", e.target.value as PaymentForm)}>
                  <option value="cash">Готівка</option>
                  <option value="cashless">Безготівково</option>
                  <option value="fop">ФОП (+6%)</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={input.withVAT} onChange={(e) => upd("withVAT", e.target.checked)} />ПДВ</label>
              <Field label="Комісія партнера, грн"><input type="number" className={inp} value={input.partnerCommission} onChange={(e) => upd("partnerCommission", +e.target.value)} /></Field>
              <Field label="Знижка, %"><input type="number" className={inp} value={input.discountPercent} onChange={(e) => upd("discountPercent", +e.target.value)} /></Field>
              <Field label="Складність, %"><input type="number" className={inp} value={input.complexityPercent} onChange={(e) => upd("complexityPercent", +e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div ref={printRef} className="space-y-4 bg-background">
            <section className="panel p-4 md:p-5">
              <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">Результати</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Об'єм сміття" value={`${formatNum(result.wasteM3, 2)} м³`} />
                <Stat label="Контейнерів" value={`${result.containers} шт`} />
                <Stat label="Ціна клієнту" value={formatUah(result.totalClient)} highlight />
                <Stat label="Ціна за м²" value={`${formatNum(result.pricePerM2, 0)} грн/м²`} />
                {showInternal && (<>
                  <Stat label="Собівартість" value={formatUah(result.totalCost)} />
                  <Stat label="Прибуток" value={formatUah(result.grossProfit)} />
                  <Stat label="Маржа" value={`${formatNum(result.marginPercent, 1)} %`} highlight={result.marginPercent >= demolitionCoeffs.marginThreshold} warn={result.marginPercent < demolitionCoeffs.marginThreshold} />
                </>)}
              </div>
              {result.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel p-4 md:p-5 max-h-[420px] overflow-auto">
              <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">Кошторис</h2>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr><th className="text-left py-1">Найм.</th><th>К-сть</th><th className="text-right">Сума</th></tr>
                </thead>
                <tbody>
                  {(["materials", "works", "logistics"] as const).map((b) => {
                    const labels = { materials: "Матеріали", works: "Роботи", logistics: "Логістика" };
                    const rows = result.lines.filter((l) => l.block === b);
                    if (rows.length === 0) return null;
                    return (
                      <>
                        <tr key={b}><td colSpan={3} className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary">{labels[b]}</td></tr>
                        {rows.map((l) => (
                          <tr key={l.key} className="border-b border-border/40">
                            <td className="py-1">{l.name}</td>
                            <td className="text-center">{formatNum(l.qty, 1)} {l.unit}</td>
                            <td className="text-right">{formatUah(l.sum)}</td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`p-2 rounded ${warn ? "bg-destructive/10" : highlight ? "bg-primary/10" : "bg-secondary/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold ${warn ? "text-destructive" : highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
