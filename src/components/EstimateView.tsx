/**
 * Універсальний вигляд «Кошторис / КП».
 * Обидві версії (внутрішня та клієнтська) підтримують ручне редагування:
 * найменування, одиниця, кількість, ціна закупки (лише внутр.), ціна продажу.
 * Можна додавати нові позиції або видаляти будь-яку існуючу.
 * Кнопки: Друк PDF (файл локально) + Зображення (PNG високої якості).
 * Перемикач Внутрішня/Клієнтська винесений вниз під кошторис.
 */
import { NumberInput } from "@/components/NumberInput";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, FileDown, ImageIcon, Plus, RotateCcw, Trash2 } from "lucide-react";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { exportElementAsPng } from "@/lib/pngExport";
import { generateEstimatePdf } from "@/lib/estimate-pdf";

import type { Branding } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { usePersistedState } from "@/lib/usePersistedState";
import { SchedulePanel } from "@/components/SchedulePanel";
import { TERZI_LOGO_URL } from "@/components/TerziLogo";

/** Diagonal repeating watermark with TERZI gold logo — fills the estimate sheet. */
function EstimateWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 select-none"
      style={{
        backgroundImage: `url(${TERZI_LOGO_URL})`,
        backgroundRepeat: "repeat",
        backgroundSize: "220px 220px",
        transform: "rotate(-22deg) scale(1.4)",
        transformOrigin: "center",
        opacity: 0.06,
        filter: "grayscale(0.4)",
      }}
    />
  );
}

interface Override {
  name?: string;
  unit?: string;
  qty?: number;
  pricePerUnit?: number;
  costPerUnit?: number;
  removed?: boolean;
}
interface ExtraLine {
  id: string;
  block: string;
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
}

/**
 * Ручні правки кошторису зберігаються локально (на пристрої) під стабільним ключем кошторису,
 * щоб вони не зникали при перемиканні вкладок браузера, поверненні на сторінку чи перезавантаженні
 * і потрапляли у PDF/PNG, які генеруються з цього ж аркуша.
 */


export type ShowInClientMode = "always" | "detailed_only" | "condensed_only" | "never";
export type ClientViewMode = "detailed" | "condensed" | "turnkey";

export interface EstimateLine {
  key: string;
  block: string; // materials | works | logistics
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
  sum: number;
  cost: number;
  showToClient?: boolean;
  /** Тонший контроль: якщо задано, override showToClient. */
  showInClient?: ShowInClientMode;
  /** Ключ клієнтської групи (для режиму «Стисла»); якщо порожньо — за блоком. */
  clientGroup?: string;
}

export interface EstimateResultLike {
  lines: EstimateLine[];
  totalClient: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  pricePerM2: number;
  materialsSell?: number;
  worksSell?: number;
  logisticsSell?: number;
  materialsCost?: number;
  worksCost?: number;
  logisticsCost?: number;
}

export interface ClientInfo {
  name: string; phone: string; address: string; manager: string;
}

interface Props {
  result: EstimateResultLike;
  client: ClientInfo;
  branding: Branding;
  module: string;
  area: number;
  thicknessCm?: number;
  estimateNumber: string;
  isInternal: boolean;
  estimateId?: string;
  /** Ключ сховища ручних правок; задається чернеткою, щоб правки скидались разом із формою. */
  editsKey?: string;
  /** Підпись ручних правок — для відстеження незбережених змін. */
  onEditsChange?: (signature: string) => void;
  /** Технічний блок кошторису (марка стяжки, об'єм суміші тощо). */
  techInfo?: { label: string; value: string }[];
  layers?: number;
  initialClientViewMode?: ClientViewMode;
  onClientViewModeChange?: (m: ClientViewMode) => void;
  schedule?: {
    startAt?: string | null;
    durationDays?: number | null;
    durationOverride?: number | null;
    gcalEventId?: string | null;
    gcalSyncedAt?: string | null;
  };
}

const BLOCK_LABELS: Record<string, string> = {
  materials: "Матеріали", works: "Роботи", logistics: "Логістика",
};

/** Робимо безпечну частину імені файлу: прибираємо тільки заборонені символи, кирилицю лишаємо. */
function sanitizeForFilename(s: string): string {
  return (s || "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFilename(opts: {
  mode: "internal" | "client";
  module: string;
  area: number;
  address: string;
  ext: "pdf" | "png";
}): string {
  const doc = opts.mode === "client" ? "КП" : "Кошторис";
  const parts = [
    "TERZI",
    doc,
    opts.module,
    `${Math.round(opts.area)}м2`,
    opts.address,
  ]
    .map(sanitizeForFilename)
    .filter(Boolean);
  return `${parts.join(" ")}.${opts.ext}`;
}

const lineId = (r: EstimateLine) => `${r.block}::${r.key}::${r.name}`;

export function EstimateView({
  result, client, branding, module, area, thicknessCm, estimateNumber, isInternal,
  estimateId, layers, schedule, initialClientViewMode, onClientViewModeChange, techInfo,
}: Props) {
  const t = useT();
  const internalRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<HTMLDivElement | null>(null);

  // Стабільний ключ (не залежить від згенерованого номера), щоб правки не губилися
  // при поверненні на сторінку чи перезавантаженні вкладки.
  const editKey = `terzi:estimate-edits:${estimateId ?? module}`;
  const [mode, setMode] = usePersistedState<"client" | "internal">(
    `${editKey}:mode`, isInternal ? "internal" : "client",
  );
  const [clientViewMode, setClientViewMode] = usePersistedState<ClientViewMode>(
    `${editKey}:cvm`, initialClientViewMode ?? "detailed",
  );

  // ЄДИНИЙ стан правок для обох виглядів: зміни у внутрішньому кошторисі
  // одразу відображаються в КП і навпаки.
  const [overrides, setOverrides] = usePersistedState<Record<string, Override>>(`${editKey}:ov`, {});
  const [extras, setExtras] = usePersistedState<ExtraLine[]>(`${editKey}:ex`, []);

  const blockOrderTop = ["materials", "works", "logistics"];
  const groupedTop = blockOrderTop.map((b) => ({
    block: b,
    label: BLOCK_LABELS[b] ?? b,
    rows: result.lines.filter((l) => l.block === b),
  })).filter((g) => g.rows.length > 0);

  // Ефективні (з урахуванням ручних правок) рядки рахуємо на рівні батьківського
  // компонента, щоб і аркуш на екрані, і PDF-таблиця будувались з одних даних.
  const effInternal = useEffectiveBlocks(groupedTop, overrides, extras, false, t);
  const effClient = useEffectiveBlocks(groupedTop, overrides, extras, true, t, clientViewMode);


  const baseLinesCost = result.lines.reduce((a, r) => a + r.cost, 0);
  const baseLinesSell = result.lines.reduce((a, r) => a + r.sum, 0);
  const hiddenCost = result.totalCost - baseLinesCost;
  const hiddenSell = result.totalClient - baseLinesSell;

  const internalTotals = (() => {
    const cost = effInternal.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.cost, 0), 0) + hiddenCost;
    const sell = effInternal.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.sum, 0), 0) + hiddenSell;
    return {
      totalCost: cost, totalSell: sell, grossProfit: sell - cost,
      marginPct: sell > 0 ? ((sell - cost) / sell) * 100 : 0,
      pricePerM2: area > 0 ? sell / area : 0,
    };
  })();
  const clientTotals = (() => {
    const sell = effClient.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.sum, 0), 0) + hiddenSell;
    return { totalSell: sell, pricePerM2: area > 0 ? sell / area : 0 };
  })();

  const activeRef = mode === "internal" ? internalRef : clientRef;
  const filenamePdf = buildFilename({ mode, module, area, address: client.address, ext: "pdf" });
  const filenamePng = buildFilename({ mode, module, area, address: client.address, ext: "png" });
  

  /** PDF генерується справжньою таблицею (не скріншотом аркуша). */
  const onPdf = async () => {
    const isInt = mode === "internal";
    const src = isInt ? effInternal : effClient;
    const blocks = isInt
      ? src.map((g) => ({
          title: g.label,
          rows: g.rows.map((r) => ({
            name: r.name, unit: r.unit, qty: r.qty,
            costPerUnit: r.costPerUnit, pricePerUnit: r.pricePerUnit,
            cost: r.cost, sum: r.sum,
          })),
        }))
      : clientViewMode === "turnkey"
        ? [{
            title: "Комплекс робіт",
            rows: [{
              name: `Комплекс робіт під ключ (${module}, ${area} м²)`, unit: "компл.", qty: 1,
              pricePerUnit: clientTotals.totalSell, sum: clientTotals.totalSell,
            }],
          }]
        : clientViewMode === "condensed"
          ? [{
              title: "Роботи та матеріали",
              rows: src.map((g) => {
                const sub = g.rows.reduce((a, r) => a + r.sum, 0);
                return { name: g.label, unit: "компл.", qty: 1, pricePerUnit: sub, sum: sub };
              }),
            }]
          : src.map((g) => ({
              title: g.label,
              rows: g.rows.map((r) => ({
                name: r.name, unit: r.unit, qty: r.qty, pricePerUnit: r.pricePerUnit, sum: r.sum,
              })),
            }));

    const blob = await generateEstimatePdf({
      mode: isInt ? "internal" : "client",
      number: estimateNumber,
      date: new Date().toLocaleDateString("uk-UA"),
      clientName: client.name, clientPhone: client.phone,
      address: client.address, manager: client.manager,
      module, area, thicknessCm,
      blocks,
      totalSell: isInt ? internalTotals.totalSell : clientTotals.totalSell,
      totalCost: internalTotals.totalCost,
      grossProfit: internalTotals.grossProfit,
      marginPercent: internalTotals.marginPct,
      pricePerM2: isInt ? internalTotals.pricePerM2 : clientTotals.pricePerM2,
      branding,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filenamePdf;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const onPng = () => activeRef.current && exportElementAsPng(activeRef.current, filenamePng);
  const onResetActive = () => { setOverrides({}); setExtras([]); };

  const hasEdits = Object.keys(overrides).length > 0 || extras.length > 0;

  const blockOrder = ["materials", "works", "logistics"];
  const grouped = blockOrder.map((b) => ({
    block: b,
    label: BLOCK_LABELS[b] ?? b,
    rows: result.lines.filter((l) => l.block === b),
  })).filter((g) => g.rows.length > 0);

  const ToolbarBlock = (
    <div className="flex flex-wrap items-center justify-between gap-2 panel p-3">
      <div className="text-xs text-muted-foreground">
        Режим: <b className="text-foreground">{mode === "internal" ? "Внутрішній кошторис" : "Комерційна пропозиція"}</b>
      </div>
      <div className="flex gap-2">
        {hasEdits && (
          <button onClick={onResetActive} className="px-3 py-2 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-2">
            <RotateCcw className="w-3 h-3" /> Скинути правки
          </button>
        )}
        <button onClick={onPng} className="px-3 py-2 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-2">
          <ImageIcon className="w-3 h-3" /> Зображення
        </button>
        <button onClick={onPdf} className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
          <FileDown className="w-3 h-3" /> Друк PDF
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Перемикач Внутрішня / Клієнтська — НАД кошторисом */}
      <div className="flex justify-center gap-1 panel p-3">
        {isInternal && (
          <button onClick={() => setMode("internal")}
            className={`px-4 py-2 rounded text-xs font-semibold inline-flex items-center gap-2 ${mode === "internal" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            <Eye className="w-3 h-3" /> Внутрішня (з собівартістю)
          </button>
        )}
        <button onClick={() => setMode("client")}
          className={`px-4 py-2 rounded text-xs font-semibold inline-flex items-center gap-2 ${mode === "client" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
          <EyeOff className="w-3 h-3" /> Клієнтська
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground panel p-2 px-3">
        Ви можете редагувати будь-яку позицію: назву, одиницю, кількість
        {mode === "internal" ? ", закупку та ціну продажу" : " та ціну"}. Натисніть «+ позицію» у блоці, щоб додати власну, або <Trash2 className="w-3 h-3 inline" /> щоб прибрати.
      </div>

      {mode === "internal" && isInternal && (
        <div ref={internalRef} className="relative bg-white text-slate-900 p-6 rounded border border-border overflow-hidden">
          <EstimateWatermark />
          <div className="relative z-10">
            <InternalSheet result={result} client={client} branding={branding} module={module}
              area={area} thicknessCm={thicknessCm} estimateNumber={estimateNumber} grouped={grouped} techInfo={techInfo}
              overrides={overrides} setOverrides={setOverrides}
              extras={extras} setExtras={setExtras}
              effective={effInternal} totals={internalTotals} />
          </div>
        </div>
      )}
      {mode === "client" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 panel p-3">
            <div className="text-[11px] text-muted-foreground">
              Формат КП:
            </div>
            <div className="flex gap-1">
              {([
                ["detailed", "Детальна"],
                ["condensed", "Стисла (за групами)"],
                ["turnkey", "Під ключ (1 рядок)"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setClientViewMode(k); onClientViewModeChange?.(k); }}
                  className={`px-3 py-1.5 rounded text-[11px] font-semibold ${clientViewMode === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div ref={clientRef} className="relative bg-white text-slate-900 p-6 rounded border border-border overflow-hidden">
            <EstimateWatermark />
            <div className="relative z-10">
              <ClientSheet
                result={result} client={client} branding={branding} module={module}
                area={area} thicknessCm={thicknessCm} estimateNumber={estimateNumber} grouped={grouped} techInfo={techInfo}
                overrides={overrides} setOverrides={setOverrides}
                extras={extras} setExtras={setExtras}
                clientViewMode={clientViewMode}
                effective={effClient} totals={clientTotals}
              />
            </div>
          </div>
        </>
      )}

      {mode === "internal" && isInternal && (() => {
        const m = module.toLowerCase();
        const moduleKey: "screed" | "roofing" | "insulation" | "demolition" | undefined =
          m.includes("стяжк") || m.includes("screed") ? "screed" :
          m.includes("покрівл") || m.includes("покривл") || m.includes("рубемаст") || m.includes("пвх") || m.includes("roofing") ? "roofing" :
          m.includes("утепл") || m.includes("insulation") ? "insulation" :
          m.includes("демонтаж") || m.includes("demolition") ? "demolition" : undefined;
        return moduleKey ? (
          <SchedulePanel
            estimateId={estimateId}
            module={moduleKey}
            area={area}
            layers={layers}
            initial={schedule ? {
              startAt: schedule.startAt,
              durationDays: schedule.durationDays,
              durationOverride: schedule.durationOverride,
              gcalEventId: schedule.gcalEventId,
              gcalSyncedAt: schedule.gcalSyncedAt,
            } : undefined}
          />
        ) : null;
      })()}

      {/* Експорт — у самому низу */}
      {ToolbarBlock}
    </div>
  );
}



interface SheetProps {
  result: EstimateResultLike;
  client: ClientInfo;
  branding: Branding;
  module: string;
  area: number;
  thicknessCm?: number;
  estimateNumber: string;
  grouped: { block: string; label: string; rows: EstimateLine[] }[];
  techInfo?: { label: string; value: string }[];
}

function Header({ branding, estimateNumber, module, client, area, thicknessCm, title, techInfo }:
  SheetProps & { title: string }) {
  return (
    <header className="border-b-2 border-slate-900 pb-3 mb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black tracking-tight">{branding.company}</div>
          <div className="text-xs text-slate-600">{branding.tagline}</div>
        </div>
        <div className="text-right text-[11px] text-slate-700">
          <div>{branding.phones.join(" · ")}</div>
          <div>{branding.website} · {branding.address}</div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{title} № {estimateNumber}</h2>
        <div className="text-xs text-slate-600">Дата: {new Date().toLocaleDateString("uk-UA")}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 text-[11px] text-slate-700">
        <div>Замовник: <b>{client.name || "—"}</b></div>
        <div>Напрямок: <b>{module}</b></div>
        <div>Телефон: <b>{client.phone || "—"}</b></div>
        <div>Площа: <b>{area} м²{thicknessCm ? ` · ${thicknessCm} см` : ""}</b></div>
        <div>Адреса: <b>{client.address || "—"}</b></div>
        <div>Менеджер: <b>{client.manager || "—"}</b></div>
      </div>
      {techInfo && techInfo.length > 0 && (
        <div className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-700">
          {techInfo.map((r) => (
            <div key={r.label}>{r.label}: <b>{r.value}</b></div>
          ))}
        </div>
      )}
    </header>
  );
}

interface EditableSheetProps extends SheetProps {
  overrides: Record<string, Override>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, Override>>>;
  extras: ExtraLine[];
  setExtras: React.Dispatch<React.SetStateAction<ExtraLine[]>>;
  clientViewMode?: ClientViewMode;
  effective: EffectiveBlock[];
  totals: { totalSell: number; pricePerM2: number; totalCost?: number; grossProfit?: number; marginPct?: number };
}

/** Спільний вхідний CSS для клітинок таблиці. */
const inputCls = "w-full bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-amber-600 focus:bg-amber-50/50 px-1 py-0.5 text-[11px]";

/** Правило видимості позиції для клієнта з урахуванням showInClient та поточного режиму. */
function isRowVisibleToClient(r: EstimateLine, cvm: ClientViewMode): boolean {
  const mode = r.showInClient;
  if (mode) {
    if (mode === "never") return false;
    if (mode === "always") return true;
    if (mode === "detailed_only") return cvm === "detailed";
    if (mode === "condensed_only") return cvm === "condensed";
  }
  return r.showToClient !== false;
}

export interface EffectiveRow {
  id: string; name: string; unit: string; qty: number;
  pricePerUnit: number; costPerUnit: number; sum: number; cost: number; isExtra: boolean;
}
export interface EffectiveBlock { block: string; label: string; rows: EffectiveRow[] }

/** Спільна побудова ефективних блоків (з урахуванням правок і extras). */
function useEffectiveBlocks(
  grouped: SheetProps["grouped"],
  overrides: Record<string, Override>,
  extras: ExtraLine[],
  filterClient: boolean,
  t: ReturnType<typeof useT>,
  clientViewMode: ClientViewMode = "detailed",
) {
  return useMemo(() => {
    return grouped.map((g) => {
      const baseRows = g.rows
        .filter((r) => (filterClient ? isRowVisibleToClient(r, clientViewMode) : true))
        .map((r) => {
          const id = lineId(r);
          const ov = overrides[id] ?? {};
          if (ov.removed) return null;
          const name = ov.name ?? t(r.name);
          const unit = ov.unit ?? r.unit;
          const qty = ov.qty ?? r.qty;
          const pricePerUnit = ov.pricePerUnit ?? r.pricePerUnit;
          const costPerUnit = ov.costPerUnit ?? r.costPerUnit;
          return {
            id, name, unit, qty, pricePerUnit, costPerUnit,
            sum: qty * pricePerUnit, cost: qty * costPerUnit, isExtra: false as const,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const extraRows = extras
        .filter((e) => e.block === g.block)
        .map((e) => ({
          id: e.id, name: e.name, unit: e.unit, qty: e.qty,
          pricePerUnit: e.pricePerUnit, costPerUnit: e.costPerUnit,
          sum: e.qty * e.pricePerUnit, cost: e.qty * e.costPerUnit, isExtra: true as const,
        }));

      return { block: g.block, label: g.label, rows: [...baseRows, ...extraRows] };
    }).filter((g) => g.rows.length > 0);
  }, [grouped, overrides, extras, filterClient, t, clientViewMode]);
}

function InternalSheet(p: EditableSheetProps) {
  const t = useT();
  const { overrides, setOverrides, extras, setExtras } = p;
  const setOv = (id: string, patch: Partial<Override>) =>
    setOverrides((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const effective = p.effective;
  const totalCost = p.totals.totalCost ?? 0;
  const totalSell = p.totals.totalSell;
  const grossProfit = p.totals.grossProfit ?? 0;
  const marginPct = p.totals.marginPct ?? 0;
  const pricePerM2 = p.totals.pricePerM2;


  const addExtra = (block: string) => {
    setExtras((s) => [...s, {
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      block, name: "Нова позиція", unit: "шт", qty: 1, pricePerUnit: 0, costPerUnit: 0,
    }]);
  };
  const removeRow = (id: string, isExtra: boolean) => {
    if (isExtra) setExtras((s) => s.filter((e) => e.id !== id));
    else setOv(id, { removed: true });
  };

  return (
    <div>
      <Header {...p} title="Внутрішній кошторис" />
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="text-left p-1.5">Найменування</th>
            <th className="text-center p-1.5 w-12">Од.</th>
            <th className="text-right p-1.5 w-14">К-сть</th>
            <th className="text-right p-1.5 w-20">Закуп.</th>
            <th className="text-right p-1.5 w-20">Прод.</th>
            <th className="text-right p-1.5 w-24">Собівар.</th>
            <th className="text-right p-1.5 w-24">Продаж</th>
            <th className="text-right p-1.5 w-16">Маржа</th>
            <th className="w-8 p-1.5 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {effective.map((g) => (
            <Fragment key={g.block}>
              <tr className="bg-slate-100" data-pdf-block>
                <td colSpan={9} className="p-1.5 font-bold uppercase text-[10px] tracking-wider">
                  <div className="flex items-center justify-between">
                    <span>{g.label}</span>
                    <button
                      type="button"
                      onClick={() => addExtra(g.block)}
                      className="print:hidden inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900"
                    >
                      <Plus className="w-3 h-3" /> позицію
                    </button>
                  </div>
                </td>
              </tr>
              {g.rows.map((r) => {
                const margin = r.sum > 0 ? ((r.sum - r.cost) / r.sum) * 100 : 0;
                const update = (patch: Partial<Override>) => {
                  if (r.isExtra) {
                    setExtras((s) => s.map((e) => e.id === r.id ? { ...e, ...patch } : e));
                  } else {
                    setOv(r.id, patch);
                  }
                };
                return (
                  <tr key={r.id} className="border-b border-slate-200 align-top">
                    <td className="p-1.5">
                      <input className={inputCls} value={r.name}
                        onChange={(e) => update({ name: e.target.value })} />
                    </td>
                    <td className="text-center p-1.5">
                      <input className={`${inputCls} text-center`} value={r.unit}
                        onChange={(e) => update({ unit: e.target.value })} />
                    </td>
                    <td className="text-right p-1.5">
                      <NumberInput step="0.01" className={`${inputCls} text-right`} value={r.qty}
                        onChange={(v) => update({ qty: v })} />
                    </td>
                    <td className="text-right p-1.5">
                      <NumberInput step="0.01" className={`${inputCls} text-right`} value={r.costPerUnit}
                        onChange={(v) => update({ costPerUnit: v })} />
                    </td>
                    <td className="text-right p-1.5">
                      <NumberInput step="0.01" className={`${inputCls} text-right`} value={r.pricePerUnit}
                        onChange={(v) => update({ pricePerUnit: v })} />
                    </td>
                    <td className="text-right p-1.5">{formatUah(r.cost)}</td>
                    <td className="text-right p-1.5 font-semibold">{formatUah(r.sum)}</td>
                    <td className={`text-right p-1.5 ${margin >= 20 ? "text-emerald-700" : "text-amber-700"}`}>
                      {formatNum(margin, 0)}%
                    </td>
                    <td className="p-1.5 text-center print:hidden">
                      <button type="button" onClick={() => removeRow(r.id, r.isExtra)}
                        className="text-slate-400 hover:text-red-600" title="Прибрати позицію">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 font-bold" data-pdf-block>
            <td className="p-2" colSpan={5}>РАЗОМ</td>
            <td className="p-2 text-right">{formatUah(totalCost)}</td>
            <td className="p-2 text-right">{formatUah(totalSell)}</td>
            <td className="p-2 text-right">{formatNum(marginPct, 1)}%</td>
            <td className="print:hidden" />
          </tr>
          <tr>
            <td className="p-1 pt-2 text-right text-slate-600" colSpan={5}>Валовий прибуток:</td>
            <td colSpan={3} className="p-1 pt-2 text-right font-bold text-emerald-700">
              {formatUah(grossProfit)}
            </td>
            <td className="print:hidden" />
          </tr>
          <tr>
            <td className="p-1 text-right text-slate-600" colSpan={5}>Ціна за м²:</td>
            <td colSpan={3} className="p-1 text-right">{formatNum(pricePerM2, 0)} грн/м²</td>
            <td className="print:hidden" />
          </tr>
        </tfoot>
      </table>
      <div className="mt-4 text-[10px] text-slate-500">
        Документ для внутрішнього використання TERZI. Не передавати клієнту.
      </div>
    </div>
  );
}

function ClientSheet(p: EditableSheetProps) {
  const t = useT();
  const { overrides, setOverrides, extras, setExtras } = p;

  const setOv = (id: string, patch: Partial<Override>) =>
    setOverrides((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const cvm = p.clientViewMode ?? "detailed";
  const effective = p.effective;
  const grandTotal = p.totals.totalSell;
  const pricePerM2 = p.totals.pricePerM2;

  const addExtra = (block: string) => {
    setExtras((s) => [...s, {
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      block, name: "Нова позиція", unit: "шт", qty: 1, pricePerUnit: 0, costPerUnit: 0,
    }]);
  };
  const removeRow = (id: string, isExtra: boolean) => {
    if (isExtra) setExtras((s) => s.filter((e) => e.id !== id));
    else setOv(id, { removed: true });
  };

  return (
    <div>
      <Header {...p} title="Комерційна пропозиція" />
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="text-left p-1.5">Найменування</th>
            <th className="text-center p-1.5 w-14">Од.</th>
            <th className="text-right p-1.5 w-16">К-сть</th>
            <th className="text-right p-1.5 w-24">Ціна</th>
            <th className="text-right p-1.5 w-28">Сума</th>
            <th className="w-8 p-1.5 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {cvm === "detailed" && effective.map((g) => {
            const sub = g.rows.reduce((a, r) => a + r.sum, 0);
            return (
              <Fragment key={g.block}>
                <tr className="bg-slate-100" data-pdf-block>
                  <td colSpan={6} className="p-1.5 font-bold uppercase text-[10px] tracking-wider">
                    <div className="flex items-center justify-between">
                      <span>{g.label}</span>
                      <button
                        type="button"
                        onClick={() => addExtra(g.block)}
                        className="print:hidden inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900"
                      >
                        <Plus className="w-3 h-3" /> позицію
                      </button>
                    </div>
                  </td>
                </tr>
                {g.rows.map((r) => {
                  const update = (patch: Partial<Override>) => {
                    if (r.isExtra) {
                      setExtras((s) => s.map((e) => e.id === r.id ? { ...e, ...patch } : e));
                    } else {
                      setOv(r.id, patch);
                    }
                  };
                  return (
                    <tr key={r.id} className="border-b border-slate-200 align-top">
                      <td className="p-1.5">
                        <input className={inputCls} value={r.name}
                          onChange={(e) => update({ name: e.target.value })} />
                      </td>
                      <td className="text-center p-1.5">
                        <input className={`${inputCls} text-center`} value={r.unit}
                          onChange={(e) => update({ unit: e.target.value })} />
                      </td>
                      <td className="text-right p-1.5">
                        <NumberInput step="0.01" className={`${inputCls} text-right`} value={r.qty}
                          onChange={(v) => update({ qty: v })} />
                      </td>
                      <td className="text-right p-1.5">
                        <NumberInput step="0.01" className={`${inputCls} text-right`} value={r.pricePerUnit}
                          onChange={(v) => update({ pricePerUnit: v })} />
                      </td>
                      <td className="text-right p-1.5 font-semibold">{formatUah(r.sum)}</td>
                      <td className="p-1.5 text-center print:hidden">
                        <button type="button" onClick={() => removeRow(r.id, r.isExtra)}
                          className="text-slate-400 hover:text-red-600" title="Прибрати позицію">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-b border-slate-300">
                  <td colSpan={4} className="p-1 text-right text-slate-600">Підсумок {g.label.toLowerCase()}:</td>
                  <td className="p-1 text-right font-semibold">{formatUah(sub)}</td>
                  <td className="print:hidden" />
                </tr>
              </Fragment>
            );
          })}

          {cvm === "condensed" && effective.map((g) => {
            const sub = g.rows.reduce((a, r) => a + r.sum, 0);
            return (
              <tr key={g.block} className="border-b border-slate-200">
                <td className="p-2 font-semibold">{g.label}</td>
                <td className="text-center p-2 text-slate-500">компл.</td>
                <td className="text-right p-2">1</td>
                <td className="text-right p-2">{formatUah(sub)}</td>
                <td className="text-right p-2 font-semibold">{formatUah(sub)}</td>
                <td className="print:hidden" />
              </tr>
            );
          })}

          {cvm === "turnkey" && (
            <tr className="border-b border-slate-200">
              <td className="p-2 font-semibold">Комплекс робіт під ключ ({p.module}, {p.area} м²)</td>
              <td className="text-center p-2 text-slate-500">компл.</td>
              <td className="text-right p-2">1</td>
              <td className="text-right p-2">{formatUah(grandTotal)}</td>
              <td className="text-right p-2 font-semibold">{formatUah(grandTotal)}</td>
              <td className="print:hidden" />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900" data-pdf-block>
            <td colSpan={4} className="p-2 text-right font-bold text-base">РАЗОМ:</td>
            <td className="p-2 text-right font-black text-base text-amber-700">{formatUah(grandTotal)}</td>
            <td className="print:hidden" />
          </tr>
          <tr>
            <td colSpan={4} className="p-1 text-right text-slate-600">Ціна за м²:</td>
            <td className="p-1 text-right">{formatNum(pricePerM2, 0)} грн/м²</td>
            <td className="print:hidden" />
          </tr>
        </tfoot>
      </table>

      <div className="mt-5 space-y-1 text-[10px] text-slate-700">
        <div><b>Гарантія:</b> {p.branding.warrantyText}</div>
        <div><b>Умови оплати:</b> {p.branding.paymentTerms}</div>
        <div className="text-slate-500">
          {p.branding.workHours} · {p.branding.phones[0]}
        </div>
      </div>
    </div>
  );
}
