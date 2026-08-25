import { createFileRoute } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useModulePricing } from "@/lib/usePricing";
import { saveEstimate } from "@/lib/estimates.functions";
import { ENGINE_VERSIONS } from "@/lib/engines/versions";
import { useEstimatePrefill } from "@/lib/useEstimatePrefill";
import { EstimateLinkPicker } from "@/components/EstimateLinkPicker";
import {
  calculateScreed, formatUah, formatNum, selfTestControlScenario,
  type ScreedInput, type Profile, type MeshType, type CementType, type CementDelivery, type SandDelivery, type SandType, type PaymentForm, type InsulationType,
} from "@/lib/screed-calc";

import { useI18n } from "@/lib/i18n";
import {
  AlertTriangle, CheckCircle2, Download, Eye, EyeOff,
  Calculator, FileText, HelpCircle, User, MapPin, Phone, Search,
} from "lucide-react";
import { EstimateView } from "@/components/EstimateView";
import { EstimateDraftControls } from "@/components/EstimateDraftControls";
import { useEstimateDraft } from "@/lib/useEstimateDraft";
import {
  DEFAULT_SCREED_PRODUCTION_CONFIG, SCREED_GRADES, SCREED_GRADE_LIST, GRADE_LABEL,
  SCREED_GRADE_DISCLAIMER, calculateScreedProduction, compareGrades, screedPositionName,
  type ScreedGrade, type ScreedProductionConfig,
} from "@/lib/screed-grades";

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

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      aria-pressed={checked}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function OptionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 rounded-md border border-border/60 bg-background/50 px-3 py-2.5">
      <span className="min-w-0 flex-1 text-sm leading-snug">{label}</span>
      <span className="shrink-0"><ToggleSwitch checked={checked} onChange={onChange} /></span>
    </div>
  );
}

const defaultInput: ScreedInput = {
  area: 100, thicknessCm: 7, perimeter: 0, roomsCount: 1, floor: 3, profile: "standard",
  screedGrade: "M200", cementType: "m500",
  withFilm: true, withDamper: true, meshType: "none", withSlope: false, withGrind: true, withCuts: true, sandType: "standard",
  withComplexPrep: false, withCementUnload: false, withDemolition: false, insulationType: "none",
  cityDelivery: true, outOfCityKm: 0, withLift: false, cementDelivery: "own", sandDelivery: "city",
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

function ScreedPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const { profile } = useAuth();
  // Внутрішній кошторис (собівартість, маржа, прибуток) доступний усім користувачам ERP.
  const isInternal = true;
  const { settings, branding } = useAppStore();
  const search = Route.useSearch();
  const draft = useEstimateDraft<ScreedInput, { targetMargin: number }>({
    module: "screed", defaultInput, defaultExtra: { targetMargin: 30 },
    defaultManager: profile?.display_name ?? "",
  });
  const { input, setInput, client, setClient, link, setLink, estimateNumber, estimateId } = draft;
  const savedStatus = draft.status;
  const targetMargin = draft.extra.targetMargin;
  const setTargetMargin = (v: number) => draft.setExtra({ targetMargin: v });
  const { materialPrices, workPrices, logisticsPrices } = useModulePricing("screed", input.area);

  const [showInternal, setShowInternal] = useState(isInternal);
  const [view, setView] = useState<"calc" | "estimate">("calc");
  useEstimatePrefill(search.estimate, draft.loadRecord);

  const [showCompare, setShowCompare] = useState(false);

  // Централізована конфігурація: база — адмін-налаштування (Налаштування → Марки стяжки),
  // закупівельні ціни — з каталогу, тарифи бригади — з налаштувань ERP.
  const { payload: screedConfig } = useScreedConfig();
  const baseCfg = screedConfig.config;
  const prodCfg: ScreedProductionConfig = useMemo(() => ({
    ...baseCfg,
    sandPricePerTon: materialPrices.sand?.buy ?? baseCfg.sandPricePerTon,
    cementM400BagPrice: materialPrices.cement400?.buy ?? baseCfg.cementM400BagPrice,
    cementM500BagPrice: materialPrices.cement500?.buy ?? baseCfg.cementM500BagPrice,
    fiberPackPrice: materialPrices.fiber?.buy ?? baseCfg.fiberPackPrice,
    plasticizerPricePerL: materialPrices.plast?.buy ?? baseCfg.plasticizerPricePerL,
    filmPricePerM2: materialPrices.film?.buy ?? baseCfg.filmPricePerM2,
    damperPricePerM: materialPrices.damper?.buy ?? baseCfg.damperPricePerM,
    brigadeMinCost: settings.brigadeMin ?? baseCfg.brigadeMinCost,
    brigadePerM2Over100: settings.brigadePerM2 ?? baseCfg.brigadePerM2Over100,
    sandTruckCapacityTons: settings.sandTripCapacity ?? baseCfg.sandTruckCapacityTons,
    sandTruckCost: logisticsPrices.sand_city?.buy ?? baseCfg.sandTruckCost,
    stationDeliveryCost: logisticsPrices.station_city?.buy ?? baseCfg.stationDeliveryCost,
  }), [materialPrices, logisticsPrices, settings, baseCfg]);

  const prodInput = useMemo(() => ({
    areaM2: input.area,
    thicknessCm: input.thicknessCm,
    perimeterM: input.perimeter ?? 0,
    screedGrade: (input.screedGrade ?? "M200") as ScreedGrade,
    cementGrade: (input.cementType === "m400" ? "m400" : "m500") as "m400" | "m500",
    hasMesh: input.meshType !== "none",
    hasSlope: input.withSlope,
    marginPercent: targetMargin,
  }), [input, targetMargin]);

  const prod = useMemo(() => calculateScreedProduction(prodInput, prodCfg), [prodInput, prodCfg]);
  const comparison = useMemo(() => (showCompare ? compareGrades(prodInput, prodCfg) : []), [showCompare, prodInput, prodCfg]);
  const techInfo = useMemo(() => ([
    { label: "Марка стяжки", value: GRADE_LABEL[prod.screedGrade] },
    { label: "Орієнтир міцності", value: `≈${prod.strengthMPa} МПа` },
    { label: "Площа", value: `${formatNum(prod.areaM2, 2)} м²` },
    { label: "Середній шар", value: `${Math.round(prod.thicknessCm * 10)} мм` },
    { label: "Об'єм суміші", value: `${formatNum(prod.screedVolumeM3, 2)} м³` },
    { label: "Марка цементу", value: prod.cementGrade === "m400" ? "М400" : "М500" },
    { label: "Цемент", value: `${prod.cementBags} міш. (${prod.cementKg} кг)` },
    { label: "Пісок", value: `${formatNum(prod.sandTons, 2)} т` },
    { label: "Фібра", value: `${prod.fiberPacks} уп. (${formatNum(prod.fiberKg, 2)} кг)` },
    { label: "Пластифікатор", value: `${formatNum(prod.plasticizerLiters, 2)} л` },
    { label: "Позиція", value: screedPositionName(prod) },
  ]), [prod]);

  const result = useMemo(() => calculateScreed(input, materialPrices, workPrices as unknown as typeof import("@/lib/screed-calc").DEFAULT_WORK_PRICES, settings, logisticsPrices), [input, materialPrices, workPrices, logisticsPrices, settings]);
  const selfTest = useMemo(() => selfTestControlScenario(), []);

  const upd = <K extends keyof ScreedInput>(k: K, v: ScreedInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const qc = useQueryClient();
  const saveFn = useServerFn(saveEstimate);
  const onSaveDraft = useCallback(async () => {
    const row = await saveFn({ data: {
      id: estimateId,
      number: estimateNumber,
      module: "screed",
      status: savedStatus as any,
      client_id: link.clientId,
      order_id: link.orderId,
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
      payload: { ...input, targetMargin } as unknown as Record<string, unknown>,
      calculation_json: { ...result, production: prod, productionConfig: prodCfg } as unknown as Record<string, unknown>,
      engine_version: ENGINE_VERSIONS.screed,
    } });
    qc.invalidateQueries({ queryKey: ["estimates"] });
    return row as { id?: string };
  }, [saveFn, qc, estimateId, estimateNumber, savedStatus, link, client, input, result, targetMargin, prod, prodCfg]);

  // PDF формується тільки з аркуша «Кошторис / КП», щоб у файл потрапили ручні правки.
  const onPdf = () => {
    setView("estimate");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("Відкрито аркуш «Кошторис / КП» — натисніть «Друк PDF» під кошторисом (з усіма правками)");
  };


  const inp = "w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm focus:border-primary hover:border-border/80 outline-none transition-colors";
  const inpWithIcon = inp + " pl-9";
  const sel = "w-full min-w-0 bg-input border border-border rounded-md px-3 py-2.5 text-sm focus:border-primary hover:border-border/80 outline-none transition-colors appearance-none cursor-pointer";
  const btnBase = "px-3.5 py-2 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-all duration-150 active:scale-[0.97]";

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto space-y-5 sm:space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-2xl font-black">{t("screedTitle")}</h1>
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
          isInternal={isInternal} estimateId={estimateId} techInfo={techInfo}
          editsKey={draft.editsKey} onEditsChange={draft.setEditsSig} />
      )}

      <div className="grid lg:grid-cols-[1fr_420px] gap-7" style={{ display: view === "calc" ? undefined : "none" }}>

        <div className="space-y-7">
          {/* Client */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">{t("clientData")}</h2>
            <div className="mb-4">
              <EstimateLinkPicker
                value={link}
                onChange={(v, meta) => {
                  setLink(v);
                  if (meta) setClient((c) => ({ ...c, name: meta.clientName ?? c.name, phone: meta.clientPhone ?? c.phone, address: meta.address ?? c.address }));
                }}
                defaults={{ clientName: client.name, clientPhone: client.phone, address: client.address }}
              />
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Площа, м²"><NumberInput className={inp} value={input.area} onChange={(v) => upd("area", v)} /></Field>
              <Field label="Периметр, пог.м"><NumberInput className={inp} value={input.perimeter ?? 0} onChange={(v) => upd("perimeter", v)} /></Field>
              <Field label="Кімнат" hint="Якщо більше 1 — додаються деформаційні шви / нарізка.">
                <NumberInput min="1" className={inp} value={input.roomsCount} onChange={(v) => upd("roomsCount", v)} />
              </Field>
              <Field label="Поверх" hint="Поверх подачі суміші. Від 6-го поверху додається коефіцієнт підйому 5–50%.">
                <NumberInput className={inp} value={input.floor} onChange={(v) => upd("floor", v)} />
              </Field>
              <Field label="Ліфт" hint="Наявність ліфта на замовленні — впливає на швидкість подачі матеріалу.">
                <ToggleSwitch checked={input.withLift} onChange={(v) => upd("withLift", v)} />
              </Field>
              <Field label="Товщина, см" hint="Робочий діапазон 4–25 см. Понад 7 см додається окрема позиція «Влаштування стяжки понад 7 см» — 15 грн/м² за кожен см.">
                <NumberInput step="0.5" className={inp} value={input.thicknessCm} onChange={(v) => upd("thicknessCm", v)} />
              </Field>
              <Field label="Марка стяжки" hint={SCREED_GRADE_DISCLAIMER}>
                <select className={sel} value={input.screedGrade ?? "M200"} onChange={(e) => upd("screedGrade", e.target.value as ScreedGrade)}>
                  {SCREED_GRADE_LIST.map((g) => (
                    <option key={g} value={g}>{GRADE_LABEL[g]} · ≈{SCREED_GRADES[g].strengthMPa} МПа</option>
                  ))}
                </select>
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
              <Field label="Пісок" hint="Пісок з відсівом застосовується для посиленої стяжки (закупка 750 грн/т, продаж 850 грн/т).">
                <select className={sel} value={input.sandType ?? "standard"} onChange={(e) => upd("sandType", e.target.value as SandType)}>
                  <option value="standard">Звичайний</option>
                  <option value="screened">З відсівом (посилена)</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Options */}
          <section className="panel p-6">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-5 text-primary">Опції</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
              <OptionToggle label="Демпферна стрічка" checked={input.withDamper} onChange={(v) => upd("withDamper", v)} />
              <OptionToggle label="Плівка п/е" checked={input.withFilm} onChange={(v) => upd("withFilm", v)} />
              <OptionToggle label="Шліфовка" checked={input.withGrind} onChange={(v) => upd("withGrind", v)} />
              <OptionToggle label="Нарізання деформаційних швів" checked={input.withCuts !== false} onChange={(v) => upd("withCuts", v)} />
              <OptionToggle label="Розухилення" checked={input.withSlope} onChange={(v) => upd("withSlope", v)} />
              <OptionToggle label="Складна підготовка" checked={input.withComplexPrep} onChange={(v) => upd("withComplexPrep", v)} />
              <OptionToggle label="Вивантаження мішків цементу" checked={input.withCementUnload === true} onChange={(v) => upd("withCementUnload", v)} />
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
              <Field label={t("outOfCity")}><NumberInput disabled={input.cityDelivery} className={inp + " disabled:opacity-50"} value={input.outOfCityKm} onChange={(v) => upd("outOfCityKm", v)} /></Field>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Field label={t("payment")}>
                <select className={sel} value={input.payment} onChange={(e) => upd("payment", e.target.value as PaymentForm)}>
                  <option value="cash">{t("cash")}</option>
                  <option value="cashless">{t("cashless")}</option>
                  <option value="fop">{t("fop")} (+6%)</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-7 cursor-pointer hover:text-primary transition-colors"><input type="checkbox" className="accent-primary" checked={input.withVAT} onChange={(e) => upd("withVAT", e.target.checked)} />{t("vat")}</label>
              <Field label={t("partnerCommission")}><NumberInput className={inp} value={input.partnerCommission} onChange={(v) => upd("partnerCommission", v)} /></Field>
              <Field label={t("discount") + " %"}><NumberInput className={inp} value={input.discountPercent} onChange={(v) => upd("discountPercent", v)} /></Field>
              <Field label={t("complexity")}><NumberInput className={inp} value={input.complexityPercent} onChange={(v) => upd("complexityPercent", v)} /></Field>
            </div>
          </section>
        {/* Виробнича собівартість за маркою */}
          <section className="panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-bold text-sm uppercase tracking-wider text-primary">
                Виробнича собівартість · {GRADE_LABEL[prod.screedGrade]}
              </h2>
              <button type="button" onClick={() => setShowCompare((v) => !v)}
                className={`${btnBase} ${showCompare ? "bg-primary/15 text-primary border border-primary/40" : "bg-secondary hover:bg-secondary/80"}`}>
                <Calculator className="w-3.5 h-3.5" /> Порівняти марки
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-5">
              <Stat label="Об'єм суміші" value={`${formatNum(prod.screedVolumeM3, 2)} м³`} highlight />
              <Stat label="Марка" value={`${GRADE_LABEL[prod.screedGrade]} · ≈${prod.strengthMPa} МПа`} />
              <Stat label="Середній шар" value={`${formatNum(prod.thicknessCm, 1)} см`} />
              <Stat label="Периметр" value={`${formatNum(prod.perimeterM, 1)} м.п.`} warn={prod.perimeterM <= 0} />
            </div>

            {prod.warnings.map((w) => (
              <div key={w} className="mb-4 flex items-start gap-2 p-2.5 rounded bg-warning/10 text-warning text-xs">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}
              </div>
            ))}

            <ProdTable title="Матеріали (закупка)" rows={prod.materialRows} total={prod.materialsTotal} />
            <ProdTable title="Робота бригади" rows={prod.laborRows} total={prod.laborTotal} />
            <ProdTable title="Логістика" rows={prod.logisticsRows} total={prod.logisticsTotal} />

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
              <Stat label="Матеріали" value={formatUah(prod.materialsTotal)} />
              <Stat label="Робота" value={formatUah(prod.laborTotal)} />
              <Stat label="Логістика" value={formatUah(prod.logisticsTotal)} />
              <Stat label="Повна собівартість" value={formatUah(prod.productionCost)} highlight />
              <Stat label="Собівартість 1 м²" value={`${formatNum(prod.productionCostPerM2, 0)} грн/м²`} highlight />
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <Field label="Цільова маржа, %" hint="Маржа рахується від виручки: Ціна = Собівартість / (1 − маржа/100).">
                  <NumberInput className={inp} value={targetMargin} onChange={setTargetMargin} />
                </Field>
                <Stat label="Ціна клієнту" value={formatUah(prod.sellingPrice)} highlight />
                <Stat label="Ціна клієнту / м²" value={`${formatNum(prod.sellingPricePerM2, 0)} грн/м²`} />
                <Stat label="Валовий прибуток" value={formatUah(prod.grossProfit)} />
                <Stat label="Маржа" value={`${formatNum(prod.marginPercent, 1)} %`} />
              </div>
              <div className="mt-3 flex gap-2">
                {[25, 30, 35, 40].map((m) => (
                  <button key={m} type="button" onClick={() => setTargetMargin(m)}
                    className={`${btnBase} ${targetMargin === m ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}>{m}%</button>
                ))}
              </div>
            </div>

            {showCompare && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-1.5">Марка</th>
                      <th className="text-right py-1.5">Об'єм</th>
                      <th className="text-right py-1.5">Пісок</th>
                      <th className="text-right py-1.5">Цемент</th>
                      <th className="text-right py-1.5">Фібра</th>
                      <th className="text-right py-1.5">Пласт.</th>
                      <th className="text-right py-1.5">Собівартість</th>
                      <th className="text-right py-1.5">грн/м²</th>
                      <th className="text-right py-1.5">Δ до попередньої</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((c) => (
                      <tr key={c.grade} className={`border-b border-border/40 ${c.grade === prod.screedGrade ? "bg-primary/10" : ""}`}>
                        <td className="py-1.5 font-semibold">{GRADE_LABEL[c.grade]}</td>
                        <td className="text-right tabular-nums">{formatNum(c.volumeM3, 2)} м³</td>
                        <td className="text-right tabular-nums">{formatNum(c.sandTons, 2)} т</td>
                        <td className="text-right tabular-nums">{c.cementBags} міш.</td>
                        <td className="text-right tabular-nums">{c.fiberPacks} уп.</td>
                        <td className="text-right tabular-nums">{formatNum(c.plasticizerLiters, 2)} л</td>
                        <td className="text-right tabular-nums">{formatUah(c.productionCost)}</td>
                        <td className="text-right tabular-nums font-semibold">{formatNum(c.costPerM2, 0)}</td>
                        <td className="text-right tabular-nums">{c.deltaPerM2 ? `+${formatNum(c.deltaPerM2, 0)} грн/м²` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{SCREED_GRADE_DISCLAIMER}</p>
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

      {view === "calc" && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => { setView("estimate"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="px-6 py-3 rounded-md bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-primary/90"
          >
            <FileText className="w-4 h-4" /> Сформувати кошторис / КП
          </button>
        </div>
      )}

      {/* Панель дій — внизу під кошторисом */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
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
        <EstimateDraftControls draft={draft} onSave={onSaveDraft} canAutosave={input.area > 0} buttonClass={`${btnBase} bg-secondary hover:bg-secondary/80`} />
        <button onClick={onPdf} className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md`}><Download className="w-3.5 h-3.5" />{t("downloadPdf")}</button>

      </div>
    </div>
  );
}


function ProdTable({ title, rows, total }: { title: string; rows: { key: string; name: string; unit: string; qty: number; price: number; sum: number }[]; total: number }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1.5">{title}</div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left py-1 font-medium">Найменування</th>
            <th className="text-right py-1 font-medium">К-сть</th>
            <th className="text-right py-1 font-medium">Ціна</th>
            <th className="text-right py-1 font-medium">Сума</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/40">
              <td className="py-1.5 pr-2">{r.name}</td>
              <td className="text-right tabular-nums whitespace-nowrap">{formatNum(r.qty, 2)} {r.unit}</td>
              <td className="text-right tabular-nums">{formatNum(r.price, 2)}</td>
              <td className="text-right tabular-nums font-medium">{formatUah(r.sum)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="pt-2 text-right font-bold uppercase text-[10px] tracking-wider">Разом</td>
            <td className="pt-2 text-right font-bold tabular-nums">{formatUah(total)}</td>
          </tr>
        </tbody>
      </table>
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
