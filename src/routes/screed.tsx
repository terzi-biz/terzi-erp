import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { useAppStore, generateEstimateNumber } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useModulePricing } from "@/lib/usePricing";
import { saveEstimate } from "@/lib/estimates.functions";
import { useEstimatePrefill } from "@/lib/useEstimatePrefill";
import {
  calculateScreed, formatUah, formatNum, selfTestControlScenario,
  type ScreedInput, type Profile, type MeshType, type CementType, type CementDelivery, type SandDelivery, type PaymentForm, type InsulationType,
} from "@/lib/screed-calc";
import { generateClientPdf } from "@/lib/pdf";
import { useI18n } from "@/lib/i18n";
import {
  AlertTriangle, CheckCircle2, Download, Save, Printer, RotateCcw, Eye, EyeOff,
  Calculator, FileText, HelpCircle, User, MapPin, Phone, Search,
} from "lucide-react";
import { EstimateView } from "@/components/EstimateView";

export const Route = createFileRoute("/screed")({
  validateSearch: (s: Record<string, unknown>) => ({ estimate: typeof s.estimate === "string" ? s.estimate : undefined }),
  head: () => ({ meta: [
    { title: "Стяжка TERZI — калькулятор" },
    { name: "description", content: "Калькулятор напівсухої стяжки TERZI з цементом, кімнатами, ліфтом, логістикою і КП." },
    { property: "og:title", content: "Стяжка TERZI — калькулятор" },
    { property: "og:description", content: "Калькулятор напівсухої стяжки TERZI з цементом, кімнатами, ліфтом, логістикою і КП." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ScreedPage,
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-muted-foreground/60 hover:text-primary transition-colors">
            <HelpCircle className="w-3 h-3" />
          </span>
        )}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const defaultInput: ScreedInput = {
  area: 100, thicknessCm: 7, perimeter: 0, roomsCount: 1, floor: 3, profile: "standard", cementType: "auto",
  withFilm: true, withDamper: true, meshType: "none", withSlope: false, withGrind: true,
  withComplexPrep: false, withDemolition: false, insulationType: "none",
  cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

function ScreedPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const { roles, profile } = useAuth();
  const isInternal = roles.some((r) => r === "admin" || r === "director" || r === "finance");
  const { settings, branding } = useAppStore();
  const { materialPrices, workPrices } = useModulePricing("screed");
  const search = Route.useSearch();
  const [input, setInput] = useState<ScreedInput>(defaultInput);
  const [client, setClient] = useState({ name: "", phone: "", address: "", manager: profile?.display_name ?? "" });
  const [showInternal, setShowInternal] = useState(isInternal);
  const [view, setView] = useState<"calc" | "estimate">("calc");
  const [estimateNumber, setEstimateNumber] = useState(() => generateEstimateNumber());
  const [estimateId, setEstimateId] = useState<string | undefined>(undefined);
  const [savedStatus, setSavedStatus] = useState<string>("preliminary");
  useEstimatePrefill(search.estimate, (r) => {
    setEstimateId(r.id);
    setEstimateNumber(r.number);
    setSavedStatus(r.status || "preliminary");
    setClient({
      name: r.client_name ?? "", phone: r.client_phone ?? "",
      address: r.address ?? "", manager: r.manager ?? "",
    });
    if (r.payload && typeof r.payload === "object") setInput({ ...defaultInput, ...(r.payload as ScreedInput) });
  });

  const result = useMemo(() => calculateScreed(input, materialPrices, workPrices as unknown as typeof import("@/lib/screed-calc").DEFAULT_WORK_PRICES, settings), [input, materialPrices, workPrices, settings]);
  const selfTest = useMemo(() => selfTestControlScenario(), []);

  const upd = <K extends keyof ScreedInput>(k: K, v: ScreedInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const qc = useQueryClient();
  const saveFn = useServerFn(saveEstimate);
  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: {
      id: estimateId,
      number: estimateNumber,
      module: "screed",
      status: savedStatus as any,
      client_name: client.name || null,
      client_phone: client.phone || null,
      address: client.address || null,
      manager: client.manager || null,
      area: input.area,
      thickness_cm: result.thicknessUsed,
      total_client: result.totalClient,
      total_cost: result.totalCost,
      gross_profit: result.grossProfit,
      margin_percent: result.marginPercent,
      payload: input as unknown as Record<string, unknown>,
    } }),
    onSuccess: (row: { id?: string }) => {
      if (row?.id) setEstimateId(row.id);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Кошторис збережено на сервері");
    },
    onError: (e: Error) => toast.error("Помилка збереження: " + e.message),
  });
  const onSave = () => saveMut.mutate();

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

  const inp = "w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm focus:border-primary hover:border-border/80 outline-none transition-colors";
  const inpWithIcon = inp + " pl-9";
  const sel = "w-full min-w-0 bg-input border border-border rounded-md px-3 py-2.5 text-sm focus:border-primary hover:border-border/80 outline-none transition-colors appearance-none cursor-pointer";
  const btnBase = "px-3.5 py-2 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-all duration-150 active:scale-[0.97]";

  return (
    <div className="p-7 lg:p-10 max-w-7xl mx-auto space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl font-black">{t("screedTitle")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isInternal && (
            <button
              onClick={() => setShowInternal((v) => !v)}
              className={`${btnBase} ${showInternal ? "bg-primary/15 text-primary border border-primary/40" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
              title="Управлінський режим — показує собівартість, маржу та прибуток"
            >
              {showInternal ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showInternal ? t("internalMode") : t("clientMode")}
            </button>
          )}
          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
          <button onClick={() => setInput(defaultInput)} className={`${btnBase} bg-secondary hover:bg-secondary/80`}><RotateCcw className="w-3.5 h-3.5" />{t("reset")}</button>
          <button onClick={onSave} disabled={saveMut.isPending} className={`${btnBase} bg-secondary hover:bg-secondary/80 disabled:opacity-50`}><Save className="w-3.5 h-3.5" />{saveMut.isPending ? "…" : t("save")}</button>
          <button onClick={() => window.print()} className={`${btnBase} bg-secondary hover:bg-secondary/80`}><Printer className="w-3.5 h-3.5" />{t("print")}</button>
          <button onClick={onPdf} className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md`}><Download className="w-3.5 h-3.5" />{t("downloadPdf")}</button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setView("calc")} className={`px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px transition-colors ${view === "calc" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Calculator className="w-4 h-4" /> Калькулятор
        </button>
        <button onClick={() => setView("estimate")} className={`px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px transition-colors ${view === "estimate" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <FileText className="w-4 h-4" /> Кошторис / КП
        </button>
      </div>

      {view === "estimate" && (
        <EstimateView result={result} client={client} branding={branding} module="Стяжка"
          area={input.area} thicknessCm={result.thicknessUsed} estimateNumber={estimateNumber}
          isInternal={isInternal} estimateId={estimateId} />
      )}

      <div className="grid lg:grid-cols-[1fr_420px] gap-7" style={{ display: view === "calc" ? undefined : "none" }}>

        <div className="space-y-7">
          {/* Client */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">{t("clientData")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t("clientName")}>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input className={inpWithIcon} placeholder="Ім'я Клієнта..." value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
                </div>
              </Field>
              <Field label={t("clientPhone")}>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input className={inpWithIcon} type="tel" placeholder="+380 (__) ___-____" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
                </div>
              </Field>
              <Field label={t("address")} hint="Введіть адресу — система запропонує варіанти автодоповнення">
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input className={inpWithIcon + " pr-9"} placeholder="м. Одеса, вул..." value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} list="address-suggestions" />
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <datalist id="address-suggestions">
                    <option value="м. Одеса, " />
                    <option value="м. Чорноморськ, " />
                    <option value="м. Южне, " />
                    <option value="смт. Авангард, " />
                  </datalist>
                </div>
              </Field>
              <Field label={t("manager")}><input className={inp} value={client.manager} onChange={(e) => setClient({ ...client, manager: e.target.value })} /></Field>
            </div>
          </section>

          {/* Parameters */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">{t("parameters")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Площа, м²"><input type="number" className={inp} value={input.area} onChange={(e) => upd("area", +e.target.value)} /></Field>
              <Field label="Периметр, пог.м"><input type="number" className={inp} value={input.perimeter ?? 0} onChange={(e) => upd("perimeter", +e.target.value)} /></Field>
              <Field label="Кімнат" hint="Якщо більше 1 — додаються деформаційні шви / нарізка.">
                <input type="number" min="1" className={inp} value={input.roomsCount} onChange={(e) => upd("roomsCount", +e.target.value)} />
              </Field>
              <Field label="Поверх" hint="Поверх подачі суміші. Від 6-го поверху додається коефіцієнт підйому 5–50%.">
                <input type="number" className={inp} value={input.floor} onChange={(e) => upd("floor", +e.target.value)} />
              </Field>
              <Field label="Ліфт" hint="Наявність ліфта на об'єкті — впливає на швидкість подачі матеріалу.">
                <ToggleSwitch checked={input.withLift} onChange={(v) => upd("withLift", v)} />
              </Field>
              <Field label="Товщина, см" hint="Робочий діапазон 4–15 см. Понад 15 см — лише з адмін-дозволом.">
                <input type="number" step="0.5" className={inp} value={input.thicknessCm} onChange={(e) => upd("thicknessCm", +e.target.value)} />
              </Field>
              <Field label="Цемент" hint="М500 (рекомендовано) — стандарт TERZI. Auto бере цемент з профілю суміші.">
                <select className={sel} value={input.cementType} onChange={(e) => upd("cementType", e.target.value as CementType)}>
                  <option value="auto">Auto за профілем</option>
                  <option value="m500">М500 (рекомендовано)</option>
                  <option value="m400">М400</option>
                </select>
              </Field>
              <Field label="Профіль суміші" hint="Економ — М400; Стандарт/Посилений — М500 з різною кількістю фібри.">
                <select className={sel} value={input.profile} onChange={(e) => upd("profile", e.target.value as Profile)}>
                  <option value="econom">{t("profileEcon")}</option>
                  <option value="standard">{t("profileStandard")}</option>
                  <option value="reinforced">{t("profileReinforced")}</option>
                  <option value="manual">{t("profileManual")}</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Options */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">Опції</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Армувальна сітка" hint="Композит — легка скло/базальт-пластикова сітка (+10% площі). Метал — зварна сталева (+15% площі).">
                <select className={sel} value={input.meshType} onChange={(e) => upd("meshType", e.target.value as MeshType)}>
                  <option value="none">Без сітки</option>
                  <option value="comp25">Композит 2.5 мм</option>
                  <option value="comp35">Композит 3.5 мм</option>
                  <option value="met25">Метал 2.5 мм</option>
                  <option value="met35">Метал 3.5 мм</option>
                </select>
              </Field>
              <Field label="Утеплення" hint="Утеплювач під стяжку (ЕПС / ХПС різної товщини).">
                <select className={sel} value={input.insulationType} onChange={(e) => upd("insulationType", e.target.value as InsulationType)}>
                  <option value="none">Немає</option>
                  <option value="eps30">ЕПС 30 мм</option>
                  <option value="eps50">ЕПС 50 мм</option>
                  <option value="xps30">ХПС 30 мм</option>
                  <option value="xps50">ХПС 50 мм</option>
                </select>
              </Field>
              <OptionToggle label="Розухилення" checked={input.withSlope} onChange={(v) => upd("withSlope", v)} />
              <OptionToggle label="Складна підготовка" checked={input.withComplexPrep} onChange={(v) => upd("withComplexPrep", v)} />
              <OptionToggle label="Демонтажні роботи" checked={input.withDemolition} onChange={(v) => upd("withDemolition", v)} />
              <OptionToggle label="Підйом матеріалу на поверх" checked={input.withLift} onChange={(v) => upd("withLift", v)} />
            </div>
          </section>


          {/* Logistics */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">{t("logistics")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors"><input type="checkbox" className="accent-primary" checked={input.cityDelivery} onChange={(e) => upd("cityDelivery", e.target.checked)} />{t("city")}</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors"><input type="checkbox" className="accent-primary" checked={input.withLift} onChange={(e) => upd("withLift", e.target.checked)} />Ліфт / складна подача</label>
              <Field label={t("outOfCity")}><input type="number" disabled={input.cityDelivery} className={inp + " disabled:opacity-50"} value={input.outOfCityKm} onChange={(e) => upd("outOfCityKm", +e.target.value)} /></Field>
              <Field label={t("cementDelivery")}>
                <select className={sel} value={input.cementDelivery} onChange={(e) => upd("cementDelivery", e.target.value as CementDelivery)}>
                  <option value="own">Свій бус (до 80 мішків)</option>
                  <option value="smallManip">Маленький маніпулятор</option>
                  <option value="bigManip">Великий маніпулятор</option>
                  <option value="none">Не враховувати</option>
                </select>
              </Field>
              <Field label={t("sandDelivery")}>
                <select className={sel} value={input.sandDelivery} onChange={(e) => upd("sandDelivery", e.target.value as SandDelivery)}>
                  <option value="city">Місто (Одеса)</option>
                  <option value="outskirts">Околиця</option>
                  <option value="chornomorsk">Чорноморськ / Іллічівськ</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Commercial */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">Комерційні умови</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label={t("payment")}>
                <select className={sel} value={input.payment} onChange={(e) => upd("payment", e.target.value as PaymentForm)}>
                  <option value="cash">{t("cash")}</option>
                  <option value="cashless">{t("cashless")}</option>
                  <option value="fop">{t("fop")} (+6%)</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-7 cursor-pointer hover:text-primary transition-colors"><input type="checkbox" className="accent-primary" checked={input.withVAT} onChange={(e) => upd("withVAT", e.target.checked)} />{t("vat")}</label>
              <Field label={t("partnerCommission")}><input type="number" className={inp} value={input.partnerCommission} onChange={(e) => upd("partnerCommission", +e.target.value)} /></Field>
              <Field label={t("discount") + " %"}><input type="number" className={inp} value={input.discountPercent} onChange={(e) => upd("discountPercent", +e.target.value)} /></Field>
              <Field label={t("complexity")}><input type="number" className={inp} value={input.complexityPercent} onChange={(e) => upd("complexityPercent", +e.target.value)} /></Field>
            </div>
          </section>
        </div>

        {/* Right: results sticky */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">{t("results")}</h2>
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
            {showInternal && result.marginPercent < settings.marginThreshold && (
              <div className="mt-4 p-4 rounded-md bg-destructive/15 border border-destructive/40 text-destructive">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Маржинальність нижче порогу
                </div>
                <div className="text-xs mt-1 opacity-90">
                  Поточна {formatNum(result.marginPercent, 1)}% &lt; {settings.marginThreshold}%. Перегляньте ціну, знижку або обсяг.
                </div>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.filter((w) => w !== "warnLowMargin").map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded bg-warning/10 text-warning text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t(w)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Lines preview — full height, no inner scroll */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Кошторис</h2>
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col />
                <col style={{ width: "28%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-1.5 font-medium">Найменування</th>
                  <th className="text-center py-1.5 font-medium">К-сть</th>
                  <th className="text-right py-1.5 font-medium">Сума</th>
                </tr>
              </thead>
              <tbody>
                {(["materials", "works", "logistics"] as const).map((b) => (
                  <>
                    <tr key={b}>
                      <td colSpan={3} className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary">
                        {t(b === "materials" ? "materialsBlock" : b === "works" ? "worksBlock" : "logisticsBlock")}
                      </td>
                    </tr>
                    {result.lines.filter((l) => l.block === b).map((l) => (
                      <tr key={l.key + l.name} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                        <td className="py-1.5 truncate pr-2">{t(l.name)}</td>
                        <td className="text-center tabular-nums">{formatNum(l.qty, 1)} {l.unit}</td>
                        <td className="text-right tabular-nums font-medium">{formatUah(l.sum)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </section>

          {/* Self test */}
          {isInternal && (
            <section className="panel p-5">
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
    <div className={`p-3 rounded-md transition-colors ${warn ? "bg-destructive/10 border border-destructive/30" : highlight ? "bg-primary/10 border border-primary/30" : "bg-secondary/40 border border-transparent"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold mt-0.5 ${warn ? "text-destructive" : highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
