/**
 * Універсальний вигляд «Кошторис / КП».
 * Працює з будь-яким CalcResult-подібним об'єктом (стяжка / покрівля / утеплення / демонтаж).
 * Дві версії: внутрішня (із закуп., собівартістю, маржею, прибутком) і клієнтська (без внутрішніх цифр).
 * Кнопки: Друк PDF + Зображення (PNG).
 */
import { Fragment, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, FileDown, ImageIcon, Plus, RotateCcw, Trash2 } from "lucide-react";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { exportElementAsPng, exportElementAsPdf } from "@/lib/pngExport";
import type { Branding } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { SchedulePanel } from "@/components/SchedulePanel";

interface ClientOverride {
  name?: string;
  unit?: string;
  qty?: number;
  pricePerUnit?: number;
  removed?: boolean;
}
interface ClientExtraLine {
  id: string;
  block: string;
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
}

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
  layers?: number;
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

export function EstimateView({
  result, client, branding, module, area, thicknessCm, estimateNumber, isInternal,
  estimateId, layers, schedule,
}: Props) {
  const t = useT();
  const [mode, setMode] = useState<"client" | "internal">(isInternal ? "internal" : "client");
  const internalRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<HTMLDivElement | null>(null);

  // Редаговані позиції клієнтського КП
  const [overrides, setOverrides] = useState<Record<string, ClientOverride>>({});
  const [extras, setExtras] = useState<ClientExtraLine[]>([]);

  const activeRef = mode === "internal" ? internalRef : clientRef;
  const fname = `TERZI-${module}-${estimateNumber}-${mode === "internal" ? "internal" : "client"}`;

  const onPdf = () => activeRef.current && exportElementAsPdf(activeRef.current, `${fname}.pdf`);
  const onPng = () => activeRef.current && exportElementAsPng(activeRef.current, `${fname}.png`);
  const onResetClient = () => { setOverrides({}); setExtras([]); };

  const blockOrder = ["materials", "works", "logistics"];
  const grouped = blockOrder.map((b) => ({
    block: b,
    label: BLOCK_LABELS[b] ?? b,
    rows: result.lines.filter((l) => l.block === b),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 panel p-3">
        <div className="flex gap-1">
          {isInternal && (
            <button onClick={() => setMode("internal")}
              className={`px-3 py-2 rounded text-xs font-semibold inline-flex items-center gap-2 ${mode === "internal" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              <Eye className="w-3 h-3" /> Внутрішня (з собівартістю)
            </button>
          )}
          <button onClick={() => setMode("client")}
            className={`px-3 py-2 rounded text-xs font-semibold inline-flex items-center gap-2 ${mode === "client" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            <EyeOff className="w-3 h-3" /> Клієнтська
          </button>
        </div>
        <div className="flex gap-2">
          {mode === "client" && (Object.keys(overrides).length > 0 || extras.length > 0) && (
            <button onClick={onResetClient} className="px-3 py-2 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-2">
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

      {mode === "client" && (
        <div className="text-[11px] text-muted-foreground panel p-2 px-3">
          У клієнтській версії ви можете редагувати назву, одиницю, кількість і ціну кожної позиції. Сума і підсумки перераховуються автоматично. Натисніть «+ позицію» у блоці, щоб додати власну, або <Trash2 className="w-3 h-3 inline" /> щоб прибрати.
        </div>
      )}

      {mode === "internal" && isInternal && (() => {
        const MAP: Record<string, "screed" | "roofing" | "insulation" | "demolition"> = {
          "Стяжка": "screed", "screed": "screed",
          "Покрівля": "roofing", "roofing": "roofing",
          "Утеплення": "insulation", "insulation": "insulation",
          "Демонтаж": "demolition", "demolition": "demolition",
        };
        const moduleKey = MAP[module];
        return (
          <>
            {moduleKey && (
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
            )}
            <div ref={internalRef} className="bg-white text-slate-900 p-6 rounded border border-border">
              <InternalSheet result={result} client={client} branding={branding} module={module}
                area={area} thicknessCm={thicknessCm} estimateNumber={estimateNumber} grouped={grouped} />
            </div>
          </>
        );
      })()}
      {mode === "client" && (
        <div ref={clientRef} className="bg-white text-slate-900 p-6 rounded border border-border">
          <ClientSheet
            result={result} client={client} branding={branding} module={module}
            area={area} thicknessCm={thicknessCm} estimateNumber={estimateNumber} grouped={grouped}
            overrides={overrides} setOverrides={setOverrides}
            extras={extras} setExtras={setExtras}
          />
        </div>
      )}
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
}

function Header({ branding, estimateNumber, module, client, area, thicknessCm, title }:
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
    </header>
  );
}

function InternalSheet(p: SheetProps) {
  const t = useT();
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
          </tr>
        </thead>
        <tbody>
          {p.grouped.map((g) => (
            <FragmentRows key={g.block} g={g} t={t} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 font-bold">
            <td className="p-2" colSpan={5}>РАЗОМ</td>
            <td className="p-2 text-right">{formatUah(p.result.totalCost)}</td>
            <td className="p-2 text-right">{formatUah(p.result.totalClient)}</td>
            <td className="p-2 text-right">
              {formatNum(p.result.marginPercent, 1)}%
            </td>
          </tr>
          <tr>
            <td className="p-1 pt-2 text-right text-slate-600" colSpan={5}>Валовий прибуток:</td>
            <td colSpan={3} className="p-1 pt-2 text-right font-bold text-emerald-700">
              {formatUah(p.result.grossProfit)}
            </td>
          </tr>
          <tr>
            <td className="p-1 text-right text-slate-600" colSpan={5}>Ціна за м²:</td>
            <td colSpan={3} className="p-1 text-right">{formatNum(p.result.pricePerM2, 0)} грн/м²</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-4 text-[10px] text-slate-500">
        Документ для внутрішнього використання TERZI. Не передавати клієнту.
      </div>
    </div>
  );
}

interface ClientSheetProps extends SheetProps {
  overrides: Record<string, ClientOverride>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, ClientOverride>>>;
  extras: ClientExtraLine[];
  setExtras: React.Dispatch<React.SetStateAction<ClientExtraLine[]>>;
}

const lineId = (r: EstimateLine) => `${r.block}::${r.key}::${r.name}`;

function ClientSheet(p: ClientSheetProps) {
  const t = useT();
  const { overrides, setOverrides, extras, setExtras } = p;

  const setOv = (id: string, patch: Partial<ClientOverride>) =>
    setOverrides((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const inputCls = "w-full bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-amber-600 focus:bg-amber-50/50 px-1 py-0.5 text-[11px]";

  // Будуємо ефективні блоки з урахуванням правок і додаткових позицій
  const effectiveBlocks = useMemo(() => {
    const blocks = p.grouped.map((g) => {
      const baseRows = g.rows
        .filter((r) => r.showToClient !== false)
        .map((r) => {
          const id = lineId(r);
          const ov = overrides[id] ?? {};
          if (ov.removed) return null;
          const name = ov.name ?? t(r.name);
          const unit = ov.unit ?? r.unit;
          const qty = ov.qty ?? r.qty;
          const pricePerUnit = ov.pricePerUnit ?? r.pricePerUnit;
          return { id, name, unit, qty, pricePerUnit, sum: qty * pricePerUnit, isExtra: false as const };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const extraRows = extras
        .filter((e) => e.block === g.block)
        .map((e) => ({ id: e.id, name: e.name, unit: e.unit, qty: e.qty, pricePerUnit: e.pricePerUnit, sum: e.qty * e.pricePerUnit, isExtra: true as const }));

      return { block: g.block, label: g.label, rows: [...baseRows, ...extraRows] };
    }).filter((g) => g.rows.length > 0 || extras.some((e) => e.block === g.block));

    // Додаємо блоки, які повністю порожні в base, але мають extras
    p.grouped.forEach((g) => { /* already covered */ });
    return blocks;
  }, [p.grouped, overrides, extras, t]);

  const grandTotal = effectiveBlocks.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.sum, 0), 0);
  const pricePerM2 = p.area > 0 ? grandTotal / p.area : 0;

  const addExtra = (block: string) => {
    setExtras((s) => [...s, {
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      block, name: "Нова позиція", unit: "шт", qty: 1, pricePerUnit: 0,
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
          {effectiveBlocks.map((g) => {
            const sub = g.rows.reduce((a, r) => a + r.sum, 0);
            return (
              <Fragment key={g.block}>
                <tr className="bg-slate-100">
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
                  const update = (patch: Partial<ClientOverride>) => {
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
                        <input type="number" step="0.01" className={`${inputCls} text-right`} value={r.qty}
                          onChange={(e) => update({ qty: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="text-right p-1.5">
                        <input type="number" step="0.01" className={`${inputCls} text-right`} value={r.pricePerUnit}
                          onChange={(e) => update({ pricePerUnit: Number(e.target.value) || 0 })} />
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
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900">
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


function FragmentRows({ g, t }: { g: { block: string; label: string; rows: EstimateLine[] }; t: ReturnType<typeof useT> }) {
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={8} className="p-1.5 font-bold uppercase text-[10px] tracking-wider">{g.label}</td>
      </tr>
      {g.rows.map((r) => {
        const margin = r.sum > 0 ? ((r.sum - r.cost) / r.sum) * 100 : 0;
        return (
          <tr key={r.key + r.name} className="border-b border-slate-200">
            <td className="p-1.5">{t(r.name)}</td>
            <td className="text-center p-1.5">{r.unit}</td>
            <td className="text-right p-1.5">{formatNum(r.qty, 1)}</td>
            <td className="text-right p-1.5">{formatNum(r.costPerUnit, 1)}</td>
            <td className="text-right p-1.5">{formatNum(r.pricePerUnit, 0)}</td>
            <td className="text-right p-1.5">{formatUah(r.cost)}</td>
            <td className="text-right p-1.5 font-semibold">{formatUah(r.sum)}</td>
            <td className={`text-right p-1.5 ${margin >= 20 ? "text-emerald-700" : "text-amber-700"}`}>
              {formatNum(margin, 0)}%
            </td>
          </tr>
        );
      })}
    </>
  );
}
