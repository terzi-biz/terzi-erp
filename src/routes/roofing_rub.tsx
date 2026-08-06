import { createFileRoute } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAppStore, generateEstimateNumber } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { usePersistedState } from "@/lib/usePersistedState";
import { useModulePricing } from "@/lib/usePricing";
import { saveEstimate } from "@/lib/estimates.functions";
import { ENGINE_VERSIONS } from "@/lib/engines/versions";
import { useEstimatePrefill } from "@/lib/useEstimatePrefill";
import { exportElementAsPng } from "@/lib/pngExport";
import { EstimateLinkPicker, type EstimateLink } from "@/components/EstimateLinkPicker";
import {
  calculateRoofing, DEFAULT_ROOFING_LOGISTICS, DEFAULT_ROOFING_WORKS,
  type RoofingInput, type PaymentForm, type PvcThickness, type RubemastBrand,
} from "@/lib/roofing-calc";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { AlertTriangle, Save, RotateCcw, Eye, EyeOff, Image as ImageIcon, Calculator, FileText, Info, Lightbulb } from "lucide-react";
import { EstimateView } from "@/components/EstimateView";
import logoAsset from "@/assets/terzi-logo.jpeg.asset.json";

export const Route = createFileRoute("/roofing_rub")({
  validateSearch: (s: Record<string, unknown>) => ({ estimate: typeof s.estimate === "string" ? s.estimate : undefined }),
  head: () => ({ meta: [
    { title: "Руберойд TERZI — калькулятор покрівлі" },
    { name: "description", content: "Калькулятор наплавної покрівлі TERZI: Акваізол і Руберіт 1–3 шари, праймер, газ, галтелі, аксесуари й КП." },
    { property: "og:title", content: "Руберойд TERZI — калькулятор покрівлі" },
    { property: "og:description", content: "Наплавна покрівля TERZI: рулони, праймер, газ, галтелі, воронки, аератори, логістика і КП." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: RubPage,
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <Info className="w-3 h-3 text-primary/70 cursor-help" />
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-56 z-30 hidden group-hover:block bg-popover text-popover-foreground text-[11px] leading-snug border border-border rounded-md p-2 shadow-lg normal-case tracking-normal">
              {hint}
            </span>
          </span>
        )}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mt-2 p-2 rounded bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground">
      <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

const defaultInput: RoofingInput = {
  area: 100, perimeter: 40, parapetHeightCm: 30, parapetTopFoldM: 0,
  system: "rubemast", layers: 2, pvcThickness: "1.5",
  rubemastBrand: "aquaizol",
  withPrimer: true, withSlope: false, slopeAvgThicknessMm: 50,
  withDemount: false, withGeotextile: true, withParapetWork: true,
  withGaltel: false, galtelMetersOverride: 0,
  funnelsCount: 0, aeratorsCount: 0, dripEdgeMeters: 0,
  innerCornersCount: 0, outerCornersCount: 0, opaikaPoints: 0,
  pvcAngleMeters: 0, pvcClampStripMeters: 0,
  cityDelivery: true, outOfCityKm: 0, withLift: true, haulContainers: 0,
  payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
};

function RubPage() {
  const { roles, profile } = useAuth();
  // Внутрішній кошторис (собівартість, маржа, прибуток) доступний усім користувачам ERP.
  const isInternal = true;
  const { roofingCoeffs, branding } = useAppStore();
  const search = Route.useSearch();
  const [input, setInput] = usePersistedState<RoofingInput>("terzi:draft:roofing_rub:input", defaultInput);
  const { materialPrices, workPrices, workCostPrices } = useModulePricing("roofing_rub", input.area);
  const [client, setClient] = usePersistedState("terzi:draft:roofing_rub:client", { name: "", phone: "", address: "", manager: profile?.display_name ?? "" });
  const [link, setLink] = useState<EstimateLink>({ clientId: null, orderId: null });
  const [showInternal, setShowInternal] = useState(isInternal);
  const [view, setView] = useState<"calc" | "estimate">("calc");
  const [estimateNumber, setEstimateNumber] = useState(() => generateEstimateNumber());
  const [estimateId, setEstimateId] = useState<string | undefined>(undefined);
  const [savedStatus, setSavedStatus] = useState<string>("preliminary");
  useEstimatePrefill(search.estimate, (r) => {
    setEstimateId(r.id); setEstimateNumber(r.number); setSavedStatus(r.status || "preliminary");
    setClient({ name: r.client_name ?? "", phone: r.client_phone ?? "", address: r.address ?? "", manager: r.manager ?? "" });
    setLink({ clientId: r.client_id ?? null, orderId: r.order_id ?? null });
    if (r.payload && typeof r.payload === "object") setInput({ ...defaultInput, ...(r.payload as RoofingInput) });
  });




  const worksMapped = useMemo(() => {
    const w = { ...DEFAULT_ROOFING_WORKS };
    const wp = workPrices as unknown as Record<string, number>;
    for (const k of Object.keys(w) as (keyof typeof w)[]) {
      if (wp[k]) w[k] = wp[k];
    }
    return w;
  }, [workPrices]);

  const result = useMemo(
    () => calculateRoofing(input, materialPrices, worksMapped, workCostPrices, DEFAULT_ROOFING_LOGISTICS, roofingCoeffs),
    [input, materialPrices, worksMapped, workCostPrices, roofingCoeffs],
  );

  const upd = <K extends keyof RoofingInput>(k: K, v: RoofingInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const qc = useQueryClient();
  const saveFn = useServerFn(saveEstimate);
  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: {
      id: estimateId,
      number: estimateNumber, module: "roofing_rub", status: savedStatus as any,
      client_id: link.clientId,
      order_id: link.orderId,
      client_name: client.name || null, client_phone: client.phone || null,
      address: client.address || null, manager: client.manager || null,
      area: input.area, thickness_cm: null,
      total_client: result.totalClient, total_cost: result.totalCost,
      gross_profit: result.grossProfit, margin_percent: result.marginPercent,
      payload: input as unknown as Record<string, unknown>,
      calculation_json: result as unknown as Record<string, unknown>,
      engine_version: ENGINE_VERSIONS.roofing,
    } }),
    onSuccess: (row: { id?: string }) => {
      if (row?.id) setEstimateId(row.id);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Кошторис покрівлі збережено");
    },
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });

  const inp = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 relative">
      {/* Brand logo watermark */}
      <img src={logoAsset.url} alt="" aria-hidden="true"
        className="pointer-events-none select-none fixed right-6 bottom-6 w-40 md:w-56 opacity-[0.06] z-0" />

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-border pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <img src={logoAsset.url} alt="TERZI" className="w-12 h-12 rounded-md object-cover ring-1 ring-border" />
          <div>
            <div className="hatch-accent h-1 w-16 mb-2 rounded" />
            <h1 className="text-xl md:text-2xl font-black">Покрівля · Руберойд</h1>
            <p className="text-xs text-muted-foreground mt-1">Наплавні бітумні системи Акваізол / Руберіт — 1, 2 або 3 шари</p>
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
          <EstimateView result={result} client={client} branding={branding}
            module={`Покрівля руберойд ×${input.layers}`}
            area={input.area} estimateNumber={estimateNumber} isInternal={isInternal} estimateId={estimateId} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 relative z-10" style={{ display: view === "calc" ? undefined : "none" }}>

        <div className="space-y-4 md:space-y-6">
          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Дані замовлення</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><EstimateLinkPicker value={link} onChange={(v, meta) => { setLink(v); if (meta) setClient((c) => ({ ...c, name: meta.clientName ?? c.name, phone: meta.clientPhone ?? c.phone, address: meta.address ?? c.address })); }} defaults={{ clientName: client.name, clientPhone: client.phone, address: client.address }} /></div>
              <Field label="Замовник"><input className={inp} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
              <Field label="Телефон"><input className={inp} value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></Field>
              <Field label="Адреса"><input className={inp} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
              <Field label="Менеджер"><input className={inp} value={client.manager} onChange={(e) => setClient({ ...client, manager: e.target.value })} /></Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Система покрівлі</h2>
            {input.system === "rubemast" && (
              <>
                <Field label="Марка рулону" hint="Акваізол ЕКО-ПЕ — преміум, стабільна якість, довша гарантія. Руберіт — базовий, оптимально для ремонтів та бюджетних замовлень.">
                  <div className="flex gap-2">
                    {(["aquaizol", "ruberit"] as RubemastBrand[]).map((b) => (
                      <button key={b} onClick={() => upd("rubemastBrand", b)}
                        className={`flex-1 py-2 rounded font-bold text-xs ${input.rubemastBrand === b ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        {b === "aquaizol" ? "Акваізол ЕКО-ПЕ" : "Руберіт"}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Кількість шарів">
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map((n) => (
                      <button key={n} onClick={() => upd("layers", n)}
                        className={`flex-1 py-2 rounded font-bold ${input.layers === n ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        {n} {n === 1 ? "шар" : "шари"}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}
            {input.system === "pvc" && (
              <>
                <Field label="Товщина мембрани Sika" hint="1.5 мм — стандарт житлових/адміністративних дахів. 1.8 мм — промислові, експлуатовані, високі механічні навантаження.">
                  <div className="flex gap-2">
                    {(["1.5", "1.8"] as PvcThickness[]).map((t) => (
                      <button key={t} onClick={() => upd("pvcThickness", t)}
                        className={`flex-1 py-2 rounded font-bold ${input.pvcThickness === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        {t} мм
                      </button>
                    ))}
                  </div>
                </Field>
                <Tip>
                  <b>ПВХ Sika</b> — механічне кріплення телескопами (≈4 шт/м²). 1.5 мм — стандарт для дахів без експлуатації; 1.8 мм — для замовлень з підвищеним навантаженням, парковок, терас. Нахльост ≈10 см (коеф. 1.10). Обов'язково геотекстиль-розділювач.
                </Tip>
              </>
            )}
            {input.system === "rubemast" && (
              <Tip>
                <b>Рубемаст</b> — наплавний рулон (10 м²). 1 шар — тимчасове/ремонтне рішення, 2 шари — стандарт житлової покрівлі, 3 шари — промислові дахи з тривалою гарантією. Нахльост 10 см (коеф. 1.15), витрата газу ≈0.35 кг/м² на шар.
              </Tip>
            )}
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Геометрія</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Площа, м²" hint="Чиста площа даху за проєктом (без парапету). Береться з обмірного плану.">
                <NumberInput className={inp} value={input.area} onChange={(v) => upd("area", v)} />
              </Field>
              <Field label="Периметр, п.м" hint="Сумарна довжина всіх сторін по контуру. Використовується для парапету, галтелей та капельників.">
                <NumberInput className={inp} value={input.perimeter} onChange={(v) => upd("perimeter", v)} />
              </Field>
              <Field label="Парапет, см" hint="Висота загину матеріалу на парапет. Стандарт TERZI: +30 см. Для експлуатованих дахів — 40–50 см.">
                <NumberInput className={inp} value={input.parapetHeightCm} onChange={(v) => upd("parapetHeightCm", v)} />
              </Field>
              <Field label="Заведення нагору, м" hint="Горизонтальна поличка зверху парапету (капелюх). Додає perimeter × висоту до робочої площі. Типово 0.07–0.15 м.">
                <NumberInput step="0.01" className={inp} value={input.parapetTopFoldM} onChange={(v) => upd("parapetTopFoldM", v)} />
              </Field>
            </div>
            <Tip>
              Робоча площа = Площа + Периметр × Парапет. За замовчуванням парапет 30 см — уточніть з замовником, для експлуатованих дахів або терас беріть 40–50 см.
            </Tip>
          </section>


          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Додатково</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {input.system === "rubemast" && (
                <>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withPrimer} onChange={(e) => upd("withPrimer", e.target.checked)} />Бітумний праймер</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withGaltel} onChange={(e) => upd("withGaltel", e.target.checked)} />Галтель по периметру (ц/п)</label>
                </>
              )}
              {input.system === "pvc" && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withGeotextile} onChange={(e) => upd("withGeotextile", e.target.checked)} />Геотекстиль 300 г/м²</label>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withDemount} onChange={(e) => upd("withDemount", e.target.checked)} />Демонтаж старого покриття</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withSlope} onChange={(e) => upd("withSlope", e.target.checked)} />Розуклонка XPS</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withParapetWork} onChange={(e) => upd("withParapetWork", e.target.checked)} />Обробка парапету/примикань</label>
            </div>
            <Tip>
              <b>Праймер</b> обов'язковий на бетоні/стяжці перед наплавленням. <b>Галтель</b> — цементно-піщаний перехід у кутах парапету (уникає розриву покриття). <b>Розуклонка XPS</b> — коли потрібен ухил ≥1,5% для водовідведення.
            </Tip>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Аксесуари / комплектація</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Воронки, шт"><NumberInput min={0} className={inp} value={input.funnelsCount} onChange={(v) => upd("funnelsCount", v)} /></Field>
              {input.system === "rubemast" && (
                <Field label="Аератори, шт"><NumberInput min={0} className={inp} value={input.aeratorsCount} onChange={(v) => upd("aeratorsCount", v)} /></Field>
              )}
              <Field label="Капельники, п.м"><NumberInput min={0} className={inp} value={input.dripEdgeMeters} onChange={(v) => upd("dripEdgeMeters", v)} placeholder={`≈ ${input.perimeter}`} /></Field>
              {input.system === "pvc" && (<>
                <Field label="Внутрішні кути, шт"><NumberInput min={0} className={inp} value={input.innerCornersCount} onChange={(v) => upd("innerCornersCount", v)} /></Field>
                <Field label="Зовнішні кути, шт"><NumberInput min={0} className={inp} value={input.outerCornersCount} onChange={(v) => upd("outerCornersCount", v)} /></Field>
                <Field label="ПВХ-уголок, п.м" hint="Гнучкий ПВХ-профіль для внутрішніх примикань до парапету/стін. Типово = периметру.">
                  <NumberInput min={0} className={inp} value={input.pvcAngleMeters} onChange={(v) => upd("pvcAngleMeters", v)} placeholder={`≈ ${input.perimeter}`} />
                </Field>
                <Field label="Прижимна планка, п.м" hint="Алюмінієва планка з герметиком для верхнього примикання мембрани до парапету/стіни.">
                  <NumberInput min={0} className={inp} value={input.pvcClampStripMeters} onChange={(v) => upd("pvcClampStripMeters", v)} placeholder={`≈ ${input.perimeter}`} />
                </Field>
              </>)}
              {input.system === "rubemast" && (<>
                <Field label="Точки опайки, шт"><NumberInput min={0} className={inp} value={input.opaikaPoints} onChange={(v) => upd("opaikaPoints", v)} /></Field>
                <Field label="Галтелі, п.м" hint="Ц/п галтель по периметру. 0 — використати периметр. Задайте, якщо галтель тільки на частині контуру.">
                  <NumberInput min={0} disabled={!input.withGaltel} className={inp} value={input.galtelMetersOverride} onChange={(v) => upd("galtelMetersOverride", v)} placeholder={`≈ ${input.perimeter}`} />
                </Field>
              </>)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Залиште 0, якщо не використовується. Капельники типово = периметру.</p>
            <Tip>
              <b>Воронки</b> — 1 шт на ~150–200 м². <b>Аератори</b> (для рубемасту) — 1 шт на ~50 м² при вологій основі. <b>Кути ПВХ</b> — рахуйте по фактичних зламах парапету. <b>Опайка</b> — точки примикань до труб/парапету.
            </Tip>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Логістика</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.cityDelivery} onChange={(e) => upd("cityDelivery", e.target.checked)} />Місто</label>
              <Field label="За містом, км в один бік" hint="Пробіг рахується × 2 (туди-назад). Тариф береться з Settings → Логістика.">
                <NumberInput disabled={input.cityDelivery} className={inp} value={input.outOfCityKm} onChange={(v) => upd("outOfCityKm", v)} />
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.withLift} onChange={(e) => upd("withLift", e.target.checked)} />Підйом матеріалів на дах</label>
              <Field label="Контейнери на вивіз (8 м³)" hint="Орієнтир: 1 контейнер ≈ 30–40 м² демонтованого рубероїду або 15 м³ утеплювача. Ціна одного вивозу — в Settings.">
                <NumberInput className={inp} value={input.haulContainers} onChange={(v) => upd("haulContainers", v)} />
              </Field>
            </div>
            <Tip>
              Позначте <b>Місто</b> для київських замовлень (фіксована доставка). Для області вкажіть кілометраж — розрахунок × 2. Підйом враховує ручну подачу матеріалу на висоту без крану.
            </Tip>
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
              <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={input.withVAT} onChange={(e) => upd("withVAT", e.target.checked)} />ПДВ на матеріали</label>
              <Field label="Комісія партнера, грн"><NumberInput className={inp} value={input.partnerCommission} onChange={(v) => upd("partnerCommission", v)} /></Field>
              <Field label="Знижка, %"><NumberInput className={inp} value={input.discountPercent} onChange={(v) => upd("discountPercent", v)} /></Field>
              <Field label="Складність, %"><NumberInput className={inp} value={input.complexityPercent} onChange={(v) => upd("complexityPercent", v)} /></Field>
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">Результати</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Робоча площа" value={`${formatNum(result.effectiveAreaM2, 1)} м²`} />
              <Stat label="Система" value={input.system === "rubemast" ? `Рубемаст ×${input.layers}` : `ПВХ Sika ${input.pvcThickness} мм`} />
              <Stat label="Ціна клієнту" value={formatUah(result.totalClient)} highlight />
              <Stat label="Ціна за м²" value={`${formatNum(result.pricePerM2, 0)} грн/м²`} />
              {showInternal && (<>
                <Stat label="Собівартість" value={formatUah(result.totalCost)} />
                <Stat label="Прибуток" value={formatUah(result.grossProfit)} />
                <Stat label="Маржа" value={`${formatNum(result.marginPercent, 1)} %`} highlight={result.marginPercent >= roofingCoeffs.marginThreshold} warn={result.marginPercent < roofingCoeffs.marginThreshold} />
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
                    <tr key={b + "_wrap"}>
                      <td colSpan={3} className="p-0">
                        <div className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary">{labels[b]}</div>
                        <table className="w-full">
                          <tbody>
                            {rows.map((l) => (
                              <tr key={l.key} className="border-b border-border/40">
                                <td className="py-1 pr-2">{l.name}</td>
                                <td className="text-center whitespace-nowrap text-muted-foreground px-2">{formatNum(l.qty, 1)} {l.unit}</td>
                                <td className="text-right">{formatUah(l.sum)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
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
