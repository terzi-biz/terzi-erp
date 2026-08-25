import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { listCatalog } from "@/lib/catalog.functions";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_MATERIAL_PRICES, DEFAULT_WORK_PRICES,
  type MaterialPrice,
  DEFAULT_LOGISTICS_PRICES,
} from "@/lib/screed-calc";
import { DEFAULT_ROOFING_PRICES, DEFAULT_ROOFING_WORKS, DEFAULT_ROOFING_WORK_COSTS } from "@/lib/roofing-calc";
import { DEFAULT_PVC_PRICES, DEFAULT_PVC_WORKS, DEFAULT_PVC_WORK_COSTS } from "@/lib/pvc-calc";
import { DEFAULT_INSULATION_PRICES, DEFAULT_INSULATION_WORKS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_PRICES, DEFAULT_DEMOLITION_WORKS } from "@/lib/demolition-calc";
import { TIER_PRICE_COL, tierForArea } from "@/lib/catalog-tiers";
import { buildPriceSources } from "@/lib/price-integrity";


const MODULE_DEFAULT_MATERIALS: Record<string, Record<string, MaterialPrice>> = {
  screed: DEFAULT_MATERIAL_PRICES,
  roofing: DEFAULT_ROOFING_PRICES,
  roofing_pvc: DEFAULT_PVC_PRICES,
  roofing_rub: DEFAULT_ROOFING_PRICES,
  insulation: DEFAULT_INSULATION_PRICES,
  demolition: DEFAULT_DEMOLITION_PRICES,
};
const MODULE_DEFAULT_WORKS: Record<string, Record<string, number>> = {
  screed: DEFAULT_WORK_PRICES as unknown as Record<string, number>,
  roofing: DEFAULT_ROOFING_WORKS as unknown as Record<string, number>,
  roofing_pvc: DEFAULT_PVC_WORKS,
  roofing_rub: DEFAULT_ROOFING_WORKS as unknown as Record<string, number>,
  insulation: DEFAULT_INSULATION_WORKS as unknown as Record<string, number>,
  demolition: DEFAULT_DEMOLITION_WORKS as unknown as Record<string, number>,
};
const MODULE_DEFAULT_WORK_COSTS: Record<string, Record<string, number>> = {
  screed: {},
  roofing: DEFAULT_ROOFING_WORK_COSTS,
  roofing_pvc: DEFAULT_PVC_WORK_COSTS,
  roofing_rub: DEFAULT_ROOFING_WORK_COSTS,
  insulation: {},
  demolition: {},
};

type Module = "screed" | "roofing" | "roofing_pvc" | "roofing_rub" | "insulation" | "demolition";


type TierRow = {
  code: string | null;
  buy_price: number;
  sell_price: number;
  sell_price_t50?: number | null;
  sell_price_t100?: number | null;
  sell_price_t250?: number | null;
  sell_price_t500?: number | null;
};

/** Ціна продажу з урахуванням діапазону площі; фолбек — базова sell_price. */
function sellForArea(r: TierRow, area?: number): number {
  if (typeof area === "number" && area > 0) {
    const col = TIER_PRICE_COL[tierForArea(area)];
    const v = Number((r as Record<string, unknown>)[col] ?? 0);
    if (v > 0) return v;
  }
  return Number(r.sell_price) || 0;
}

/**
 * Load catalog items from DB for a module and overlay them on top of
 * the calculator's defaults. Items are matched by `code`.
 * `area` (м²) вибирає колонку ціни продажу: ≤50 / 50–100 / 100–250 / >250.
 */
export function useModulePricing(module: Module, area?: number) {
  const fetchList = useServerFn(listCatalog);
  const { session } = useAuth();
  const enabled = !!session?.access_token;


  const mats = useQuery({
    queryKey: ["catalog", module, "material"],
    queryFn: () => fetchList({ data: { module, kind: "material" } }),
    staleTime: 60_000,
    enabled,
  });
  const works = useQuery({
    queryKey: ["catalog", module, "work"],
    queryFn: () => fetchList({ data: { module, kind: "work" } }),
    staleTime: 60_000,
    enabled,
  });

  const logistics = useQuery({
    queryKey: ["catalog", module, "logistics"],
    queryFn: () => fetchList({ data: { module, kind: "logistics" } }),
    staleTime: 60_000,
    enabled,
  });

  const logisticsPrices = useMemo<Record<string, MaterialPrice>>(() => {
    const out: Record<string, MaterialPrice> = module === "screed" ? { ...DEFAULT_LOGISTICS_PRICES } : {};
    for (const r of (logistics.data ?? []) as TierRow[]) {
      if (!r.code) continue;
      out[r.code] = { buy: Number(r.buy_price) || 0, sell: sellForArea(r, area) };
    }
    return out;
  }, [logistics.data, module, area]);

  const materialPrices = useMemo<Record<string, MaterialPrice>>(() => {
    const out: Record<string, MaterialPrice> = { ...(MODULE_DEFAULT_MATERIALS[module] ?? {}) };
    for (const r of (mats.data ?? []) as TierRow[]) {
      if (!r.code) continue;
      out[r.code] = { buy: Number(r.buy_price) || 0, sell: sellForArea(r, area) };
    }
    return out;
  }, [mats.data, module, area]);

  const workPrices = useMemo(() => {
    const out: Record<string, number> = { ...(MODULE_DEFAULT_WORKS[module] ?? {}) };
    for (const r of (works.data ?? []) as TierRow[]) {
      if (!r.code) continue;
      out[r.code] = sellForArea(r, area);
    }
    return out;
  }, [works.data, module, area]);

  const workCostPrices = useMemo(() => {
    const out: Record<string, number> = { ...(MODULE_DEFAULT_WORK_COSTS[module] ?? {}) };
    for (const r of (works.data ?? []) as Array<{ code: string | null; buy_price: number }>) {
      if (!r.code) continue;
      out[r.code] = Number(r.buy_price) || 0;
    }
    return out;
  }, [works.data, module]);

  /** Джерело ціни по кожному коду — для попередження про відсутні позиції прайсу. */
  const priceSources = useMemo(() => {
    const defaults: string[] = [];
    for (const [k, v] of Object.entries(MODULE_DEFAULT_MATERIALS[module] ?? {})) if (v.sell > 0) defaults.push(k);
    for (const [k, v] of Object.entries(MODULE_DEFAULT_WORKS[module] ?? {})) if (Number(v) > 0) defaults.push(k);
    if (module === "screed") for (const [k, v] of Object.entries(DEFAULT_LOGISTICS_PRICES)) if (v.sell > 0) defaults.push(k);
    const catalog: string[] = [];
    for (const q of [mats.data, works.data, logistics.data]) {
      for (const r of (q ?? []) as TierRow[]) if (r.code) catalog.push(r.code);
    }
    return buildPriceSources(catalog, defaults);
  }, [mats.data, works.data, logistics.data, module]);

  /** Версія прайсу = найсвіжіший updated_at позицій каталогу (сек. епохи), 0 якщо каталог порожній. */
  const priceBookVersion = useMemo(() => {
    let max = 0;
    for (const q of [mats.data, works.data, logistics.data]) {
      for (const r of (q ?? []) as Array<{ updated_at?: string | null }>) {
        const t = r.updated_at ? Date.parse(r.updated_at) : NaN;
        if (Number.isFinite(t) && t > max) max = t;
      }
    }
    return max ? Math.floor(max / 1000) : 0;
  }, [mats.data, works.data, logistics.data]);

  return {
    materialPrices, workPrices, workCostPrices, logisticsPrices,
    priceSources, priceBookVersion,
    loading: mats.isLoading || works.isLoading,
  };
}

