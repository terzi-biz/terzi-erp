import { createFileRoute } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useModulePricing } from "@/lib/usePricing";
import { useInternalAccess } from "@/lib/useInternalAccess";
import { findPriceIssues, priceBlockReason } from "@/lib/price-integrity";
import { saveEstimate } from "@/lib/estimates.functions";
import { ENGINE_VERSIONS } from "@/lib/engines/versions";
import { buildEstimateSnapshot } from "@/lib/estimate-snapshot";
import { useEstimatePrefill } from "@/lib/useEstimatePrefill";
import { EstimateLinkPicker } from "@/components/EstimateLinkPicker";
import {
  calculatePvc,
  DEFAULT_PVC_LOGISTICS,
  DEFAULT_PVC_WORKS,
  DEFAULT_PVC_COEFFS,
  type PvcInput,
  type PvcThickness,
} from "@/lib/pvc-calc";
import type { PaymentForm } from "@/lib/roofing-calc";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { AlertTriangle, Eye, EyeOff, Calculator, FileText, Info, Lightbulb } from "lucide-react";
import { EstimateView, vatFromResult } from "@/components/EstimateView";
import { EstimateDraftControls } from "@/components/EstimateDraftControls";
import { useEstimateDraft } from "@/lib/useEstimateDraft";
import { TargetMarginPanel } from "@/components/TargetMarginPanel";
import { applyTargetMargin } from "@/lib/target-margin";
import logoAsset from "@/assets/terzi-logo.jpeg.asset.json";

export const Route = createFileRoute("/roofing_pvc")({
  validateSearch: (s: Record<string, unknown>) => ({
    estimate: typeof s.estimate === "string" ? s.estimate : undefined,
  }),
  head: () => ({
    meta: [
      { title: "ПВХ мембрана TERZI — калькулятор покрівлі" },
      {
        name: "description",
        content:
          "Калькулятор ПВХ-мембрани Sika: нахльост 1.15, вертикальна площа парапету, воронки та аератори d75/110/160, профілі й розхідники.",
      },
      { property: "og:title", content: "ПВХ мембрана TERZI — калькулятор покрівлі" },
      {
        property: "og:description",
        content:
          "Розрахунок ПВХ-мембрани TERZI: горизонтальна і вертикальна площа, комплектація, логістика, КП.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PvcPage,
});

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

const defaultInput: PvcInput = {
  area: 100,
  perimeter: 40,
  parapetHeightM: 0.5,
  parapetWidthM: 0.4,
  parapetOverlapM: 0.1,
  thickness: "1.5",
  withGeotextile: true,
  withDemount: false,
  withSlope: false,
  withPrep: true,
  funnels75: 0,
  funnels110: 0,
  funnels160: 0,
  aerators75: 0,
  aerators110: 0,
  aerators160: 0,
  opaikaPoints: 0,
  detailMembraneM2: 0,
  pvcAngleMeters: 0,
  pvcClampMeters: 0,
  dripEdgeMeters: 0,
  cappingMeters: 0,
  withCapping: false,
  cityDelivery: true,
  outOfCityKm: 0,
  withLift: true,
  haulContainers: 0,
  payment: "cash",
  withVAT: false,
  partnerCommission: 0,
  discountPercent: 0,
  complexityPercent: 0,
};

function PvcPage() {
  const { profile } = useAuth();
  // Внутрішні ціни (собівартість/маржа) — лише за наявності права на сервері.
  const { isInternal } = useInternalAccess();
  const { branding } = useAppStore();
  const search = Route.useSearch();
  const draft = useEstimateDraft<PvcInput, { targetMargin: number }>({
    module: "roofing_pvc",
    defaultInput,
    defaultExtra: { targetMargin: 0 },
    defaultManager: profile?.display_name ?? "",
  });
  const { input, setInput, client, setClient, link, setLink, estimateNumber, estimateId } = draft;
  const savedStatus = draft.status;
  const targetMargin = draft.extra.targetMargin;
  const setTargetMargin = (v: number) => draft.setExtra({ targetMargin: v });

  const { materialPrices, workPrices, workCostPrices, priceSources, priceBookVersion } =
    useModulePricing("roofing_pvc", input.area);
  const [showInternalPref, setShowInternal] = useState(true);
  const showInternal = isInternal && showInternalPref;
  const [view, setView] = useState<"calc" | "estimate">("calc");

  useEstimatePrefill(search.estimate, draft.loadRecord);

  const worksMapped = useMemo(() => {
    const w: Record<string, number> = { ...DEFAULT_PVC_WORKS };
    const wp = workPrices as unknown as Record<string, number>;
    for (const k of Object.keys(w)) if (wp[k]) w[k] = wp[k];
    return w;
  }, [workPrices]);

  const baseResult = useMemo(
    () =>
      calculatePvc(
        input,
        materialPrices,
        worksMapped,
        workCostPrices,
        DEFAULT_PVC_LOGISTICS,
        DEFAULT_PVC_COEFFS,
      ),
    [input, materialPrices, worksMapped, workCostPrices],
  );
  const result = useMemo(
    () => applyTargetMargin(baseResult, targetMargin),
    [baseResult, targetMargin],
  );


  const upd = <K extends keyof PvcInput>(k: K, v: PvcInput[K]) =>
    setInput((s) => ({ ...s, [k]: v }));

  const qc = useQueryClient();
  const saveFn = useServerFn(saveEstimate);
  /** Позиції з нульовою ціною / відсутні в прайсі — блокують збереження й експорт. */
  const priceIssues = useMemo(
    () => findPriceIssues(result.lines, priceSources),
    [result.lines, priceSources],
  );
  const priceBlock = priceBlockReason(priceIssues);

  const onSaveDraft = useCallback(async () => {
    const row = await saveFn({
      data: {
        id: estimateId,
        number: estimateNumber,
        module: "roofing_pvc",
        status: savedStatus as any,
        client_id: link.clientId,
        order_id: link.orderId,
        client_name: client.name || null,
        client_phone: client.phone || null,
        address: client.address || null,
        manager: client.manager || null,
        area: input.area,
        thickness_cm: null,
        total_client: result.totalClient,
        total_cost: result.totalCost,
        gross_profit: result.grossProfit,
        margin_percent: result.marginPercent,
        payload: input as unknown as Record<string, unknown>,
        calculation_json: buildEstimateSnapshot({
          module: "roofing_pvc",
          engineVersion: ENGINE_VERSIONS.roofing,
          priceBookVersion,
          inputs: input,
          result,
          prices: {
            materials: materialPrices,
            works: worksMapped,
            workCosts: workCostPrices,
            logistics: DEFAULT_PVC_LOGISTICS,
          },
          norms: { coefficients: DEFAULT_PVC_COEFFS },
          priceSources,
        }) as unknown as Record<string, unknown>,
        engine_version: ENGINE_VERSIONS.roofing,
        price_book_version: priceBookVersion || null,
      },
    });
    qc.invalidateQueries({ queryKey: ["estimates"] });
    return row as { id?: string };
  }, [
    saveFn,
    qc,
    estimateId,
    estimateNumber,
    savedStatus,
    link,
    client,
    input,
    result,
    priceBookVersion,
    priceSources,
  ]);

  const inp =
    "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 relative">
      <img
        src={logoAsset.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none fixed right-6 bottom-6 w-40 md:w-56 opacity-[0.06] z-0"
      />

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-border pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="TERZI"
            className="w-12 h-12 rounded-md object-cover ring-1 ring-border"
          />
          <div>
            <div className="hatch-accent h-1 w-16 mb-2 rounded" />
            <h1 className="text-xl md:text-2xl font-black">ПВХ мембрана</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Sika 1.5 / 1.8 мм · нахльост ×{DEFAULT_PVC_COEFFS.overlapCoef} · горизонталь +
              вертикаль парапету
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isInternal && (
            <button
              onClick={() => setShowInternal((v) => !v)}
              className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2"
            >
              {showInternal ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showInternal ? "Управлінський" : "Клієнтський"}
            </button>
          )}
          <EstimateDraftControls
            draft={draft}
            onSave={onSaveDraft}
            canAutosave={input.area > 0}
            blockReason={priceBlock}
          />
        </div>
      </header>

      <div className="flex gap-1 border-b border-border relative z-10">
        <button
          onClick={() => setView("calc")}
          className={`px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${view === "calc" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Calculator className="w-4 h-4" /> Калькулятор
        </button>
        <button
          onClick={() => setView("estimate")}
          className={`px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${view === "estimate" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <FileText className="w-4 h-4" /> Кошторис / КП
        </button>
      </div>

      {view === "estimate" && (
        <div className="relative z-10">
          <EstimateView
            result={result}
            vat={vatFromResult(result)}
            client={client}
            branding={branding}
            module={`Покрівля ПВХ мембрана ${input.thickness} мм`}
            area={input.area}
            estimateNumber={estimateNumber}
            isInternal={isInternal}
            exportBlockReason={priceBlock}
            estimateId={estimateId}
            editsKey={draft.editsKey}
            onEditsChange={draft.setEditsSig}
          />
        </div>
      )}

      <div
        className="grid lg:grid-cols-[1fr_400px] gap-6 relative z-10"
        style={{ display: view === "calc" ? undefined : "none" }}
      >
        <div className="space-y-4 md:space-y-6">
          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Дані замовлення
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <EstimateLinkPicker
                  value={link}
                  onChange={(v, meta) => {
                    setLink(v);
                    if (meta)
                      setClient((c) => ({
                        ...c,
                        name: meta.clientName ?? c.name,
                        phone: meta.clientPhone ?? c.phone,
                        address: meta.address ?? c.address,
                      }));
                  }}
                  defaults={{
                    clientName: client.name,
                    clientPhone: client.phone,
                    address: client.address,
                  }}
                />
              </div>
              <Field label="Замовник">
                <input
                  className={inp}
                  value={client.name}
                  onChange={(e) => setClient({ ...client, name: e.target.value })}
                />
              </Field>
              <Field label="Телефон">
                <input
                  className={inp}
                  value={client.phone}
                  onChange={(e) => setClient({ ...client, phone: e.target.value })}
                />
              </Field>
              <Field label="Адреса">
                <input
                  className={inp}
                  value={client.address}
                  onChange={(e) => setClient({ ...client, address: e.target.value })}
                />
              </Field>
              <Field label="Менеджер">
                <input
                  className={inp}
                  value={client.manager}
                  onChange={(e) => setClient({ ...client, manager: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Мембрана
            </h2>
            <Field
              label="Товщина мембрани Sika"
              hint="1.5 мм — стандарт житлових/адміністративних дахів. 1.8 мм — промислові та експлуатовані покриття."
            >
              <div className="flex gap-2">
                {(["1.5", "1.8"] as PvcThickness[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => upd("thickness", t)}
                    className={`flex-1 py-2 rounded font-bold ${input.thickness === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    {t} мм
                  </button>
                ))}
              </div>
            </Field>
            <div className="mt-3">
              <Field
                label="Неармована D-15 (вузли), м²"
                hint="Sikaplan D-15 — окрема неармована мембрана ТІЛЬКИ для проходок, примикань і вузлів. Не замінює армоване польове полотно. 0 = автонорма від периметру та кількості точок."
              >
                <NumberInput
                  step="0.1"
                  className={inp}
                  value={input.detailMembraneM2}
                  onChange={(v) => upd("detailMembraneM2", v)}
                />
              </Field>
            </div>
            <Tip>
              Площа мембрани = (горизонтальна + вертикальна) ×{" "}
              <b>{DEFAULT_PVC_COEFFS.overlapCoef}</b> (нахльост). Кріплення телескопами ≈
              {DEFAULT_PVC_COEFFS.fastenersPerM2} шт/м². Планки та профілі закуповуються 2-метровими
              елементами: розрахунок — у м.п., закупівля — у штуках.
            </Tip>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Геометрія
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Горизонтальна площа, м²" hint="Чиста площа даху по контуру парапету.">
                <NumberInput className={inp} value={input.area} onChange={(v) => upd("area", v)} />
              </Field>
              <Field
                label="Периметр парапету, п.м"
                hint="Сумарна довжина парапету — база для вертикальної площі."
              >
                <NumberInput
                  className={inp}
                  value={input.perimeter}
                  onChange={(v) => upd("perimeter", v)}
                />
              </Field>
              <Field label="Висота парапету, м">
                <NumberInput
                  step="0.01"
                  className={inp}
                  value={input.parapetHeightM}
                  onChange={(v) => upd("parapetHeightM", v)}
                />
              </Field>
              <Field
                label="Ширина парапету, м"
                hint="Товщина парапету зверху — мембрана заводиться по ній."
              >
                <NumberInput
                  step="0.01"
                  className={inp}
                  value={input.parapetWidthM}
                  onChange={(v) => upd("parapetWidthM", v)}
                />
              </Field>
              <Field
                label="Нахльост за парапет, м"
                hint="Заведення мембрани за зовнішній край парапету."
              >
                <NumberInput
                  step="0.01"
                  className={inp}
                  value={input.parapetOverlapM}
                  onChange={(v) => upd("parapetOverlapM", v)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
              <Stat label="Вертикаль, м" value={formatNum(result.verticalHeightM, 2)} />
              <Stat label="Вертикальна площа" value={`${formatNum(result.verticalAreaM2, 1)} м²`} />
              <Stat label="Разом геометрія" value={`${formatNum(result.effectiveAreaM2, 1)} м²`} />
              <Stat
                label="Мембрани з нахльостом"
                value={`${formatNum(result.membraneM2, 0)} м²`}
                highlight
              />
            </div>
            <Tip>
              Вертикальна висота = висота + ширина парапету + нахльост. Вертикальна площа = периметр
              × ця висота.
            </Tip>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Комплектація
            </h2>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Воронки, шт
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="d 75 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.funnels75}
                  onChange={(v) => upd("funnels75", v)}
                />
              </Field>
              <Field label="d 110 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.funnels110}
                  onChange={(v) => upd("funnels110", v)}
                />
              </Field>
              <Field label="d 160 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.funnels160}
                  onChange={(v) => upd("funnels160", v)}
                />
              </Field>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 mt-4">
              Аератори, шт
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="d 75 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.aerators75}
                  onChange={(v) => upd("aerators75", v)}
                />
              </Field>
              <Field label="d 110 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.aerators110}
                  onChange={(v) => upd("aerators110", v)}
                />
              </Field>
              <Field label="d 160 мм">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.aerators160}
                  onChange={(v) => upd("aerators160", v)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <Field label="Точки обпайки, шт" hint="Виходи труб, стійки, нестандартні примикання.">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.opaikaPoints}
                  onChange={(v) => upd("opaikaPoints", v)}
                />
              </Field>
              <Field label="ПВХ-уголок, п.м" hint="0 — рахувати автоматично: периметр × запас.">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.pvcAngleMeters}
                  onChange={(v) => upd("pvcAngleMeters", v)}
                  placeholder={`авто ≈ ${formatNum(input.perimeter * DEFAULT_PVC_COEFFS.angleReserve, 1)}`}
                />
              </Field>
              <Field label="Прижимна планка, п.м" hint="0 — рахувати автоматично від периметру.">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.pvcClampMeters}
                  onChange={(v) => upd("pvcClampMeters", v)}
                  placeholder={`авто ≈ ${formatNum(input.perimeter * DEFAULT_PVC_COEFFS.clampReserve, 1)}`}
                />
              </Field>
              <Field label="Капельник, п.м" hint="0 — дорівнює периметру.">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.dripEdgeMeters}
                  onChange={(v) => upd("dripEdgeMeters", v)}
                  placeholder={`авто ≈ ${input.perimeter}`}
                />
              </Field>
              <Field label="Накривка парапету, п.м" hint="0 — не рахується. Закупівля елементами по 2 м.">
                <NumberInput
                  min={0}
                  className={inp}
                  value={input.cappingMeters ?? 0}
                  onChange={(v) => upd("cappingMeters", v)}
                  placeholder={`авто ≈ ${input.perimeter}`}
                />
              </Field>
            </div>
            <Tip>
              Розхідники (рондоль, дюбель, шуруп, герметик) рахуються автоматично: рондоль{" "}
              {DEFAULT_PVC_COEFFS.rondelPerMeterVert} шт/п.м вертикалі, дюбель+шуруп{" "}
              {DEFAULT_PVC_COEFFS.dowelsPerMeterStrip} шт/п.м планки.
            </Tip>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Додатково
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withPrep}
                  onChange={(e) => upd("withPrep", e.target.checked)}
                />
                Підготовка поверхні
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withGeotextile}
                  onChange={(e) => upd("withGeotextile", e.target.checked)}
                />
                Геотекстиль-розділювач
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withDemount}
                  onChange={(e) => upd("withDemount", e.target.checked)}
                />
                Демонтаж старого покриття
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withSlope}
                  onChange={(e) => upd("withSlope", e.target.checked)}
                />
                Розуклонка XPS
              </label>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Логістика
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.cityDelivery}
                  onChange={(e) => upd("cityDelivery", e.target.checked)}
                />
                Місто
              </label>
              <Field label="За містом, км в один бік">
                <NumberInput
                  disabled={input.cityDelivery}
                  className={inp}
                  value={input.outOfCityKm}
                  onChange={(v) => upd("outOfCityKm", v)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withLift}
                  onChange={(e) => upd("withLift", e.target.checked)}
                />
                Підйом матеріалів на дах
              </label>
              <Field label="Контейнери на вивіз (8 м³)">
                <NumberInput
                  className={inp}
                  value={input.haulContainers}
                  onChange={(v) => upd("haulContainers", v)}
                />
              </Field>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Комерційні умови
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Оплата">
                <select
                  className={inp}
                  value={input.payment}
                  onChange={(e) => upd("payment", e.target.value as PaymentForm)}
                >
                  <option value="cash">Готівка</option>
                  <option value="cashless">Безготівково</option>
                  <option value="fop">ФОП (+6%)</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-6">
                <input
                  type="checkbox"
                  checked={input.withVAT}
                  onChange={(e) => upd("withVAT", e.target.checked)}
                />
                ПДВ на матеріали
              </label>
              <Field label="Комісія партнера, грн">
                <NumberInput
                  className={inp}
                  value={input.partnerCommission}
                  onChange={(v) => upd("partnerCommission", v)}
                />
              </Field>
              <Field label="Знижка, %">
                <NumberInput
                  className={inp}
                  value={input.discountPercent}
                  onChange={(v) => upd("discountPercent", v)}
                />
              </Field>
              <Field label="Складність, %">
                <NumberInput
                  className={inp}
                  value={input.complexityPercent}
                  onChange={(v) => upd("complexityPercent", v)}
                />
              </Field>
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <TargetMarginPanel
            value={targetMargin}
            onChange={setTargetMargin}
            totalClient={result.totalClient}
            pricePerM2={result.pricePerM2}
            grossProfit={result.grossProfit}
            marginPercent={result.marginPercent}
            totalCost={result.totalCost}
            showInternal={showInternal}
          />
          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">
              Результати
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Мембрана" value={`${formatNum(result.membraneM2, 0)} м²`} />
              <Stat label="Кріплення" value={`${formatNum(result.fasteners ?? 0, 0)} шт`} />
              <Stat label="Ціна клієнту" value={formatUah(result.totalClient)} highlight />
              <Stat label="Ціна за м²" value={`${formatNum(result.pricePerM2, 0)} грн/м²`} />
              {showInternal && (
                <>
                  <Stat label="Собівартість" value={formatUah(result.totalCost)} />
                  <Stat label="Прибуток" value={formatUah(result.grossProfit)} />
                  <Stat
                    label="Маржа"
                    value={`${formatNum(result.marginPercent, 1)} %`}
                    highlight={result.marginPercent >= DEFAULT_PVC_COEFFS.marginThreshold}
                    warn={result.marginPercent < DEFAULT_PVC_COEFFS.marginThreshold}
                  />
                </>
              )}
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs"
                  >
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-4 md:p-5 max-h-[420px] overflow-auto">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-primary">
              Кошторис
            </h2>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-1">Найм.</th>
                  <th>К-сть</th>
                  <th className="text-right">Сума</th>
                </tr>
              </thead>
              <tbody>
                {(["materials", "works", "logistics"] as const).map((b) => {
                  const labels = {
                    materials: "Матеріали",
                    works: "Роботи",
                    logistics: "Логістика",
                  };
                  const rows = result.lines.filter((l) => l.block === b);
                  if (rows.length === 0) return null;
                  return (
                    <tr key={b + "_wrap"}>
                      <td colSpan={3} className="p-0">
                        <div className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary">
                          {labels[b]}
                        </div>
                        <table className="w-full">
                          <tbody>
                            {rows.map((l) => (
                              <tr key={l.key} className="border-b border-border/40">
                                <td className="py-1 pr-2">{l.name}</td>
                                <td className="text-center whitespace-nowrap text-muted-foreground px-2">
                                  {formatNum(l.qty, 1)} {l.unit}
                                </td>
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
            onClick={() => {
              setView("estimate");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-6 py-3 rounded-md bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-primary/90"
          >
            <FileText className="w-4 h-4" /> Сформувати кошторис / КП
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`p-2 rounded ${warn ? "bg-destructive/10" : highlight ? "bg-primary/10" : "bg-secondary/40"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold ${warn ? "text-destructive" : highlight ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}
