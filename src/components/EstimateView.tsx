/**
 * Універсальний вигляд «Кошторис / КП».
 * Працює з будь-яким CalcResult-подібним об'єктом (стяжка / покрівля / утеплення / демонтаж).
 * Дві версії: внутрішня (із закуп., собівартістю, маржею, прибутком) і клієнтська (без внутрішніх цифр).
 * Кнопки: Друк PDF + Зображення (PNG).
 */
import { Fragment, useRef, useState } from "react";
import { Eye, EyeOff, FileDown, ImageIcon } from "lucide-react";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { exportElementAsPng, exportElementAsPdf } from "@/lib/pngExport";
import type { Branding } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { SchedulePanel } from "@/components/SchedulePanel";

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

  const activeRef = mode === "internal" ? internalRef : clientRef;
  const fname = `TERZI-${module}-${estimateNumber}-${mode === "internal" ? "internal" : "client"}`;

  const onPdf = () => activeRef.current && exportElementAsPdf(activeRef.current, `${fname}.pdf`);
  const onPng = () => activeRef.current && exportElementAsPng(activeRef.current, `${fname}.png`);

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
          <button onClick={onPng} className="px-3 py-2 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-2">
            <ImageIcon className="w-3 h-3" /> Зображення
          </button>
          <button onClick={onPdf} className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
            <FileDown className="w-3 h-3" /> Друк PDF
          </button>
        </div>
      </div>

      {mode === "internal" && isInternal && (
        <>
          {(["screed","roofing","insulation","demolition"] as const).includes(module as any) && (
            <SchedulePanel
              estimateId={estimateId}
              module={module as any}
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
      )}
      {mode === "client" && (
        <div ref={clientRef} className="bg-white text-slate-900 p-6 rounded border border-border">
          <ClientSheet result={result} client={client} branding={branding} module={module}
            area={area} thicknessCm={thicknessCm} estimateNumber={estimateNumber} grouped={grouped} />
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

function ClientSheet(p: SheetProps) {
  const t = useT();
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
          </tr>
        </thead>
        <tbody>
          {p.grouped.map((g) => {
            const rows = g.rows.filter((r) => r.showToClient !== false);
            if (!rows.length) return null;
            const sub = rows.reduce((a, r) => a + r.sum, 0);
            return (
              <Fragment key={g.block}>
                <tr className="bg-slate-100">
                  <td colSpan={5} className="p-1.5 font-bold uppercase text-[10px] tracking-wider">{g.label}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.key + r.name} className="border-b border-slate-200">
                    <td className="p-1.5">{t(r.name)}</td>
                    <td className="text-center p-1.5">{r.unit}</td>
                    <td className="text-right p-1.5">{formatNum(r.qty, 1)}</td>
                    <td className="text-right p-1.5">{formatNum(r.pricePerUnit, 0)}</td>
                    <td className="text-right p-1.5">{formatUah(r.sum)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-300">
                  <td colSpan={4} className="p-1 text-right text-slate-600">Підсумок {g.label.toLowerCase()}:</td>
                  <td className="p-1 text-right font-semibold">{formatUah(sub)}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900">
            <td colSpan={4} className="p-2 text-right font-bold text-base">РАЗОМ:</td>
            <td className="p-2 text-right font-black text-base text-amber-700">{formatUah(p.result.totalClient)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="p-1 text-right text-slate-600">Ціна за м²:</td>
            <td className="p-1 text-right">{formatNum(p.result.pricePerM2, 0)} грн/м²</td>
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
