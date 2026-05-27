import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useAppStore, useUserRole, generateEstimateNumber } from "@/lib/store";
import {
  calculateScreed, formatUah, formatNum, selfTestControlScenario,
  type ScreedInput, type Profile, type MeshType, type CementDelivery, type SandDelivery, type PaymentForm,
} from "@/lib/screed-calc";
import { generateClientPdf } from "@/lib/pdf";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, CheckCircle2, Download, Save, Printer, RotateCcw, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/screed")({ component: ScreedPage });

const defaultInput: ScreedInput = {
  area: 100, thicknessCm: 7, perimeter: 0, floor: 3, profile: "standard",
  withFilm: true, withDamper: true, meshType: "none", withSlope: false, withGrind: false,
  cityDelivery: true, outOfCityKm: 0, cementDelivery: "own", sandDelivery: "city",
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

function ScreedPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const { role } = useUserRole();
  const isInternal = role !== "manager";
  const { materialPrices, workPrices, settings, branding, addEstimate } = useAppStore();
  const [input, setInput] = useState<ScreedInput>(defaultInput);
  const [client, setClient] = useState({ name: "", phone: "", address: "", manager: "" });
  const [showInternal, setShowInternal] = useState(isInternal);

  const result = useMemo(() => calculateScreed(input, materialPrices, workPrices, settings), [input, materialPrices, workPrices, settings]);
  const selfTest = useMemo(() => selfTestControlScenario(), []);

  const upd = <K extends keyof ScreedInput>(k: K, v: ScreedInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const onSave = () => {
    const id = crypto.randomUUID();
    addEstimate({
      id, number: generateEstimateNumber(), createdAt: Date.now(), module: "screed",
      clientName: client.name, clientPhone: client.phone, address: client.address, manager: client.manager,
      area: input.area, thicknessCm: result.thicknessUsed,
      totalClient: result.totalClient, totalCost: result.totalCost, grossProfit: result.grossProfit,
      marginPercent: result.marginPercent, status: "draft", payload: input,
    });
    alert("Кошторис збережено в історії");
  };

  const onPdf = async () => {
    const blob = await generateClientPdf({
      number: generateEstimateNumber(),
      date: new Date().toLocaleDateString("uk-UA"),
      clientName: client.name, clientPhone: client.phone, address: client.address, manager: client.manager,
      area: input.area, thicknessCm: result.thicknessUsed, result, branding, lang, module: t("screed"),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `TERZI-${Date.now()}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>
  );
  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl font-black">{t("screedTitle")}</h1>
        </div>
        <div className="flex gap-2">
          {isInternal && (
            <button onClick={() => setShowInternal((v) => !v)} className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold inline-flex items-center gap-2">
              {showInternal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showInternal ? t("internalMode") : t("clientMode")}
            </button>
          )}
          <button onClick={() => setInput(defaultInput)} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2"><RotateCcw className="w-3 h-3" />{t("reset")}</button>
          <button onClick={onSave} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2"><Save className="w-3 h-3" />{t("save")}</button>
          <button onClick={() => window.print()} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2"><Printer className="w-3 h-3" />{t("print")}</button>
          <button onClick={onPdf} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2"><Download className="w-3 h-3" />{t("downloadPdf")}</button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-6">
          {/* Client */}
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">{t("clientData")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("clientName")}><input className={inp} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
              <Field label={t("clientPhone")}><input className={inp} value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></Field>
              <Field label={t("address")}><input className={inp} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
              <Field label={t("manager")}><input className={inp} value={client.manager} onChange={(e) => setClient({ ...client, manager: e.target.value })} /></Field>
            </div>
          </section>

          {/* Parameters */}
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">{t("parameters")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label={t("area")}><input type="number" className={inp} value={input.area} onChange={(e) => upd("area", +e.target.value)} /></Field>
              <Field label={t("thickness")}><input type="number" step="0.5" className={inp} value={input.thicknessCm} onChange={(e) => upd("thicknessCm", +e.target.value)} /></Field>
              <Field label={t("perimeter")}><input type="number" className={inp} value={input.perimeter ?? 0} onChange={(e) => upd("perimeter", +e.target.value)} /></Field>
              <Field label={t("floor")}><input type="number" className={inp} value={input.floor} onChange={(e) => upd("floor", +e.target.value)} /></Field>
            </div>
            <div className="mt-3">
              <Field label={t("profile")}>
                <select className={inp} value={input.profile} onChange={(e) => upd("profile", e.target.value as Profile)}>
                  <option value="econom">{t("profileEcon")}</option>
                  <option value="standard">{t("profileStandard")}</option>
                  <option value="reinforced">{t("profileReinforced")}</option>
                  <option value="manual">{t("profileManual")}</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Additions */}
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">{t("additions")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withFilm} onChange={(e) => upd("withFilm", e.target.checked)} />{t("withFilm")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withDamper} onChange={(e) => upd("withDamper", e.target.checked)} />{t("withDamper")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withSlope} onChange={(e) => upd("withSlope", e.target.checked)} />{t("withSlope")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withGrind} onChange={(e) => upd("withGrind", e.target.checked)} />{t("withGrind")}</label>
              <Field label={t("meshType")}>
                <select className={inp} value={input.meshType} onChange={(e) => upd("meshType", e.target.value as MeshType)}>
                  <option value="none">—</option>
                  <option value="comp25">Композит 2.5 мм</option>
                  <option value="comp35">Композит 3.5 мм</option>
                  <option value="met25">Метал 2.5 мм</option>
                  <option value="met35">Метал 3.5 мм</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Logistics */}
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">{t("logistics")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.cityDelivery} onChange={(e) => upd("cityDelivery", e.target.checked)} />{t("city")}</label>
              <Field label={t("outOfCity")}><input type="number" disabled={input.cityDelivery} className={inp} value={input.outOfCityKm} onChange={(e) => upd("outOfCityKm", +e.target.value)} /></Field>
              <Field label={t("cementDelivery")}>
                <select className={inp} value={input.cementDelivery} onChange={(e) => upd("cementDelivery", e.target.value as CementDelivery)}>
                  <option value="own">Свій бус (до 80 міш.)</option>
                  <option value="smallManip">Маленький маніпулятор</option>
                  <option value="bigManip">Великий маніпулятор</option>
                  <option value="none">Не враховувати</option>
                </select>
              </Field>
              <Field label={t("sandDelivery")}>
                <select className={inp} value={input.sandDelivery} onChange={(e) => upd("sandDelivery", e.target.value as SandDelivery)}>
                  <option value="city">Місто</option>
                  <option value="outskirts">Околиця</option>
                  <option value="chornomorsk">Чорноморськ / Іллічівськ</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Commercial */}
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Комерційні умови</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t("payment")}>
                <select className={inp} value={input.payment} onChange={(e) => upd("payment", e.target.value as PaymentForm)}>
                  <option value="cash">{t("cash")}</option>
                  <option value="cashless">{t("cashless")}</option>
                  <option value="fop">{t("fop")}</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={input.withVAT} onChange={(e) => upd("withVAT", e.target.checked)} />{t("vat")}</label>
              <Field label={t("partnerCommission")}><input type="number" className={inp} value={input.partnerCommission} onChange={(e) => upd("partnerCommission", +e.target.value)} /></Field>
              <Field label={t("discount") + " %"}><input type="number" className={inp} value={input.discountPercent} onChange={(e) => upd("discountPercent", +e.target.value)} /></Field>
              <Field label={t("complexity")}><input type="number" className={inp} value={input.complexityPercent} onChange={(e) => upd("complexityPercent", +e.target.value)} /></Field>
            </div>
          </section>
        </div>

        {/* Right: results sticky */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="panel p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">{t("results")}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label={t("volume")} value={`${formatNum(result.volumeM3, 2)} м³`} />
              <Stat label={t("thickness")} value={`${result.thicknessUsed} см`} />
              <Stat label={t("totalClient")} value={formatUah(result.totalClient)} highlight />
              <Stat label={t("pricePerM2")} value={`${formatNum(result.pricePerM2, 0)} грн/м²`} />
              {showInternal && (<>
                <Stat label={t("totalCost")} value={formatUah(result.totalCost)} />
                <Stat label={t("grossProfit")} value={formatUah(result.grossProfit)} />
                <Stat label={t("margin")} value={`${formatNum(result.marginPercent, 1)} %`} highlight={result.marginPercent >= settings.marginThreshold} warn={result.marginPercent < settings.marginThreshold} />
              </>)}
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{t(w)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Lines preview */}
          <section className="panel p-5 max-h-[420px] overflow-auto">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">Кошторис</h2>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr><th className="text-left py-1">Найм.</th><th>К-сть</th><th>Сума</th></tr>
              </thead>
              <tbody>
                {(["materials", "works", "logistics"] as const).map((b) => (
                  <>
                    <tr key={b}><td colSpan={3} className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary">{t(b === "materials" ? "materialsBlock" : b === "works" ? "worksBlock" : "logisticsBlock")}</td></tr>
                    {result.lines.filter((l) => l.block === b).map((l) => (
                      <tr key={l.key + l.name} className="border-b border-border/40">
                        <td className="py-1">{t(l.name)}</td>
                        <td className="text-center">{formatNum(l.qty, 1)} {l.unit}</td>
                        <td className="text-right">{formatUah(l.sum)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </section>

          {/* Self test */}
          {isInternal && (
            <section className="panel p-4">
              <div className="flex items-center gap-2 mb-2">
                {selfTest.ok ? <CheckCircle2 className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
                <span className="font-bold text-xs uppercase tracking-wider">Контрольний сценарій 100м²/7см</span>
              </div>
              <ul className="text-[11px] space-y-0.5 font-mono">
                {selfTest.report.map((r, i) => <li key={i} className={r.startsWith("✓") ? "text-success" : "text-destructive"}>{r}</li>)}
              </ul>
            </section>
          )}
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
