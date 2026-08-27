import { createFileRoute } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useMemo, useRef, useCallback } from "react";
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
  calculateInsulation,
  DEFAULT_INSULATION_LOGISTICS,
  DEFAULT_INSULATION_WORKS,
  type InsulationInput,
  type InsZone,
  type InsMaterial,
  type PaymentForm,
} from "@/lib/insulation-calc";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { exportElementAsPng } from "@/lib/pngExport";
import { AlertTriangle, Image as ImageIcon, Eye, EyeOff, Calculator, FileText } from "lucide-react";
import { EstimateView, vatFromResult } from "@/components/EstimateView";
import { EstimateDraftControls } from "@/components/EstimateDraftControls";
import { useEstimateDraft } from "@/lib/useEstimateDraft";
import { TargetMarginPanel } from "@/components/TargetMarginPanel";
import { applyTargetMargin } from "@/lib/target-margin";
import logoAsset from "@/assets/terzi-logo.jpeg.asset.json";

export const Route = createFileRoute("/insulation")({
  validateSearch: (s: Record<string, unknown>) => ({
    estimate: typeof s.estimate === "string" ? s.estimate : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Утеплення TERZI — калькулятор" },
      {
        name: "description",
        content: "Калькулятор утеплення TERZI: EPS, XPS, мінвата, шари, підйом, логістика і КП.",
      },
      { property: "og:title", content: "Утеплення TERZI — калькулятор" },
      {
        property: "og:description",
        content: "Калькулятор утеплення TERZI: EPS, XPS, мінвата, шари, підйом, логістика і КП.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InsulationPage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const defaultInput: InsulationInput = {
  area: 100,
  perimeter: 40,
  thicknessCm: 5,
  layersCount: 1,
  zone: "facade",
  material: "eps_50",
  withGlue: true,
  withDowels: true,
  withMesh: true,
  cityDelivery: true,
  outOfCityKm: 0,
  withLift: false,
  haulContainers: 0,
  payment: "cash",
  withVAT: false,
  partnerCommission: 0,
  discountPercent: 0,
  complexityPercent: 0,
};

function InsulationPage() {
  const { profile } = useAuth();
  // Внутрішні ціни (собівартість/маржа) — лише за наявності права на сервері.
  const { isInternal } = useInternalAccess();
  const { insulationCoeffs, branding } = useAppStore();
  const search = Route.useSearch();
  const draft = useEstimateDraft<InsulationInput, { targetMargin: number }>({
    module: "insulation",
    defaultInput,
    defaultExtra: { targetMargin: 0 },
    defaultManager: profile?.display_name ?? "",
  });
  const { input, setInput, client, setClient, link, setLink, estimateNumber, estimateId } = draft;
  const savedStatus = draft.status;
  const targetMargin = draft.extra.targetMargin;
  const setTargetMargin = (v: number) => draft.setExtra({ targetMargin: v });
  const { materialPrices, workPrices, priceSources, priceBookVersion } = useModulePricing(
    "insulation",
    input.area,
  );
  const [showInternalPref, setShowInternal] = useState(true);
  const showInternal = isInternal && showInternalPref;
  const printRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"calc" | "estimate">("calc");
  useEstimatePrefill(search.estimate, draft.loadRecord);

  const worksMapped = useMemo(() => {
    const w = { ...DEFAULT_INSULATION_WORKS };
    const wp = workPrices as unknown as Record<string, number>;
    for (const k of Object.keys(w) as (keyof typeof w)[]) if (wp[k]) w[k] = wp[k];
    return w;
  }, [workPrices]);

  const baseResult = useMemo(
    () =>
      calculateInsulation(
        input,
        materialPrices,
        worksMapped,
        DEFAULT_INSULATION_LOGISTICS,
        insulationCoeffs,
      ),
    [input, materialPrices, worksMapped, insulationCoeffs],
  );
  const result = useMemo(
    () => applyTargetMargin(baseResult, targetMargin),
    [baseResult, targetMargin],
  );

  const upd = <K extends keyof InsulationInput>(k: K, v: InsulationInput[K]) =>
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
        module: "insulation",
        status: savedStatus as any,
        client_id: link.clientId,
        order_id: link.orderId,
        client_name: client.name || null,
        client_phone: client.phone || null,
        address: client.address || null,
        manager: client.manager || null,
        area: input.area,
        thickness_cm: input.thicknessCm,
        total_client: result.totalClient,
        total_cost: result.totalCost,
        gross_profit: result.grossProfit,
        margin_percent: result.marginPercent,
        payload: input as unknown as Record<string, unknown>,
        calculation_json: buildEstimateSnapshot({
          module: "insulation",
          engineVersion: ENGINE_VERSIONS.insulation,
          priceBookVersion,
          inputs: input,
          result,
          prices: {
            materials: materialPrices,
            works: worksMapped,
            logistics: DEFAULT_INSULATION_LOGISTICS,
          },
          norms: { coefficients: insulationCoeffs },
          priceSources,
        }) as unknown as Record<string, unknown>,
        engine_version: ENGINE_VERSIONS.insulation,
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

  const onPng = async () => {
    if (!printRef.current) return;
    await exportElementAsPng(printRef.current, `TERZI-utepl-${Date.now()}.png`);
  };

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
            <h1 className="text-xl md:text-2xl font-black">Калькулятор утеплення</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Фасад / покрівля / підлога / полістиролбетон
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
          <button
            onClick={onPng}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2"
          >
            <ImageIcon className="w-3 h-3" />
            PNG
          </button>
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
            module="Утеплення"
            area={input.area}
            thicknessCm={input.thicknessCm}
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
              Зона утеплення
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {(
                [
                  { id: "facade", label: "🏢 Фасад" },
                  { id: "roof", label: "🏠 Покрівля" },
                  { id: "floor", label: "⬇️ Підлога" },
                  { id: "polystyrcrete", label: "🧱 Полістирол-бетон" },
                ] as { id: InsZone; label: string }[]
              ).map((z) => (
                <button
                  key={z.id}
                  onClick={() => upd("zone", z.id)}
                  className={`p-3 rounded-md border-2 text-xs font-semibold transition ${input.zone === z.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 hover:border-primary/50"}`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Матеріал
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(
                [
                  { id: "eps_50", label: "EPS-35 50 мм" },
                  { id: "xps_50", label: "XPS Carbon 50 мм" },
                  { id: "mineral", label: "Мінвата 100 мм" },
                  { id: "polystyrcrete", label: "Полістиролбетон" },
                ] as { id: InsMaterial; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => upd("material", m.id)}
                  className={`p-3 rounded-md border-2 text-xs font-semibold transition ${input.material === m.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 hover:border-primary/50"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
              Геометрія
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Площа, м²">
                <NumberInput className={inp} value={input.area} onChange={(v) => upd("area", v)} />
              </Field>
              <Field label="Периметр, п.м">
                <NumberInput
                  className={inp}
                  value={input.perimeter}
                  onChange={(v) => upd("perimeter", v)}
                />
              </Field>
              <Field label="Товщина шару, см">
                <NumberInput
                  className={inp}
                  value={input.thicknessCm}
                  onChange={(v) => upd("thicknessCm", v)}
                />
              </Field>
              <Field label="Шари">
                <NumberInput
                  min="1"
                  disabled={input.material === "polystyrcrete"}
                  className={inp}
                  value={input.layersCount}
                  onChange={(v) => upd("layersCount", v)}
                />
              </Field>
            </div>
          </section>

          {input.material !== "polystyrcrete" && (
            <section className="panel p-4 md:p-5">
              <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">
                Додатково
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={input.withGlue}
                    onChange={(e) => upd("withGlue", e.target.checked)}
                  />
                  Клей
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={input.withDowels}
                    onChange={(e) => upd("withDowels", e.target.checked)}
                  />
                  Дюбель-парасолька
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={input.withMesh}
                    onChange={(e) => upd("withMesh", e.target.checked)}
                  />
                  Склосітка + армування
                </label>
              </div>
            </section>
          )}

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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={input.withLift}
                  onChange={(e) => upd("withLift", e.target.checked)}
                />
                Підйом на поверх/дах
              </label>
              <Field label="За містом, км в один бік">
                <NumberInput
                  disabled={input.cityDelivery}
                  className={inp}
                  value={input.outOfCityKm}
                  onChange={(v) => upd("outOfCityKm", v)}
                />
              </Field>
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
          <div ref={printRef} className="space-y-4 bg-background">
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
                <Stat label="Площа" value={`${formatNum(input.area, 1)} м²`} />
                <Stat label="Матеріал" value={input.material} />
                <Stat label="Ціна клієнту" value={formatUah(result.totalClient)} highlight />
                <Stat label="Ціна за м²" value={`${formatNum(result.pricePerM2, 0)} грн/м²`} />
                {showInternal && (
                  <>
                    <Stat label="Собівартість" value={formatUah(result.totalCost)} />
                    <Stat label="Прибуток" value={formatUah(result.grossProfit)} />
                    <Stat
                      label="Маржа"
                      value={`${formatNum(result.marginPercent, 1)} %`}
                      highlight={result.marginPercent >= insulationCoeffs.marginThreshold}
                      warn={result.marginPercent < insulationCoeffs.marginThreshold}
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
                      <>
                        <tr key={b}>
                          <td
                            colSpan={3}
                            className="pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-primary"
                          >
                            {labels[b]}
                          </td>
                        </tr>
                        {rows.map((l) => (
                          <tr key={l.key} className="border-b border-border/40">
                            <td className="py-1">{l.name}</td>
                            <td className="text-center">
                              {formatNum(l.qty, 1)} {l.unit}
                            </td>
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
