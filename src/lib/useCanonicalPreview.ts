/**
 * Live-preview калькуляторів на єдиному серверному Calculation Core.
 *
 * Фронтенд не рахує підсумки: він надсилає вхідні параметри й довідникові ціни,
 * а отримує вже дозволений DTO. Внутрішні поля (закупівля, собівартість,
 * маржа, прибуток) приходять тільки тим, кому це дозволено на сервері.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewModuleEstimate, type ModulePreviewResponse } from "./core/preview.functions";
import type { ModulePreviewRequest } from "./core/module-registry";
import type { CanonicalResult } from "./core/dto";

export interface PreviewEstimateLine {
  key: string;
  block: string;
  name: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  costPerUnit: number;
  sum: number;
  cost: number;
  showToClient?: boolean;
  note?: string;
}

/** Легасі-подібний результат для існуючих екранів — усі цифри з сервера. */
export interface PreviewResult extends Record<string, unknown> {
  lines: PreviewEstimateLine[];
  warnings: string[];
  materialsSell: number;
  totalClient: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  pricePerM2: number;
  vatAdjustment: number;
  core?: CanonicalResult;
}

const EMPTY: PreviewResult = {
  lines: [], warnings: [], materialsSell: 0, totalClient: 0, totalCost: 0,
  grossProfit: 0, marginPercent: 0, pricePerM2: 0, vatAdjustment: 0,
};

function toPreviewResult(res: ModulePreviewResponse): PreviewResult {
  const internal = res.internal;
  if (internal) {
    const lines: PreviewEstimateLine[] = internal.lines
      .filter((l) => !l.key.startsWith("int_"))
      .map((l) => ({
        key: l.key,
        block: l.block,
        name: l.name,
        unit: l.unit,
        qty: l.qtyTech,
        pricePerUnit: l.sellPerUnit,
        costPerUnit: l.buyPerUnit,
        sum: l.sellNet,
        cost: l.cost,
        showToClient: l.billingMode !== "internal_only",
        ...(l.note ? { note: l.note } : {}),
      }));
    return {
      ...res.tech,
      lines,
      warnings: [...res.warnings],
      materialsSell: internal.netByBlock.materials,
      totalClient: internal.totalClient,
      totalCost: internal.totalCost,
      grossProfit: internal.grossProfit,
      marginPercent: internal.marginPercent ?? 0,
      pricePerM2: internal.pricePerM2,
      vatAdjustment: internal.vatTotal,
      ...(res.canonical ? { core: res.canonical } : {}),
    };
  }

  const c = res.client;
  const lines: PreviewEstimateLine[] = c.lines.map((l) => ({
    key: l.key,
    block: l.block,
    name: l.name,
    unit: l.unit,
    qty: l.qty,
    pricePerUnit: l.pricePerUnit,
    costPerUnit: 0,
    sum: l.sum,
    cost: 0,
    showToClient: true,
    ...(l.note ? { note: l.note } : {}),
  }));
  const materialsGross = c.totalsByBlock.materials ?? 0;
  return {
    ...res.tech,
    lines,
    warnings: [...res.warnings],
    materialsSell: Math.max(0, +(materialsGross - c.vatAmount).toFixed(2)),
    totalClient: c.total,
    totalCost: 0,
    grossProfit: 0,
    marginPercent: 0,
    pricePerM2: c.pricePerM2,
    vatAdjustment: c.vatAmount,
  };
}

export interface CanonicalPreview {
  result: PreviewResult;
  client?: ModulePreviewResponse["client"];
  internal?: ModulePreviewResponse["internal"];
  isLoading: boolean;
  error: string | null;
}

export function useCanonicalPreview(req: ModulePreviewRequest): CanonicalPreview {
  const fn = useServerFn(previewModuleEstimate);
  const key = useMemo(() => JSON.stringify(req), [req]);
  const q = useQuery({
    queryKey: ["canonical-preview", req.module, key],
    queryFn: () => fn({ data: req }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const data = q.data && "ok" in q.data && q.data.ok ? (q.data as ModulePreviewResponse) : undefined;
  const result = useMemo(() => (data ? toPreviewResult(data) : EMPTY), [data]);

  return {
    result,
    ...(data?.client ? { client: data.client } : {}),
    ...(data?.internal ? { internal: data.internal } : {}),
    isLoading: q.isLoading,
    error: q.data && "ok" in q.data && !q.data.ok ? (q.data as { error: string }).error : null,
  };
}
