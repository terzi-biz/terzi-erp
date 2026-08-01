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
import { DEFAULT_INSULATION_PRICES, DEFAULT_INSULATION_WORKS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_PRICES, DEFAULT_DEMOLITION_WORKS } from "@/lib/demolition-calc";

const MODULE_DEFAULT_MATERIALS: Record<string, Record<string, MaterialPrice>> = {
  screed: DEFAULT_MATERIAL_PRICES,
  roofing: DEFAULT_ROOFING_PRICES,
  insulation: DEFAULT_INSULATION_PRICES,
  demolition: DEFAULT_DEMOLITION_PRICES,
};
const MODULE_DEFAULT_WORKS: Record<string, Record<string, number>> = {
  screed: DEFAULT_WORK_PRICES as unknown as Record<string, number>,
  roofing: DEFAULT_ROOFING_WORKS as unknown as Record<string, number>,
  insulation: DEFAULT_INSULATION_WORKS as unknown as Record<string, number>,
  demolition: DEFAULT_DEMOLITION_WORKS as unknown as Record<string, number>,
};
const MODULE_DEFAULT_WORK_COSTS: Record<string, Record<string, number>> = {
  screed: {},
  roofing: DEFAULT_ROOFING_WORK_COSTS,
  insulation: {},
  demolition: {},
};

type Module = "screed" | "roofing" | "insulation" | "demolition";

/**
 * Load catalog items from DB for a module and overlay them on top of
 * the calculator's defaults. Items are matched by `code`.
 */
export function useModulePricing(module: Module) {
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
    for (const r of (logistics.data ?? []) as Array<{ code: string | null; buy_price: number; sell_price: number }>) {
      if (!r.code) continue;
      out[r.code] = { buy: Number(r.buy_price) || 0, sell: Number(r.sell_price) || 0 };
    }
    return out;
  }, [logistics.data, module]);

  const materialPrices = useMemo<Record<string, MaterialPrice>>(() => {
    const out: Record<string, MaterialPrice> = { ...(MODULE_DEFAULT_MATERIALS[module] ?? {}) };
    for (const r of (mats.data ?? []) as Array<{ code: string | null; buy_price: number; sell_price: number }>) {
      if (!r.code) continue;
      out[r.code] = { buy: Number(r.buy_price) || 0, sell: Number(r.sell_price) || 0 };
    }
    return out;
  }, [mats.data, module]);

  const workPrices = useMemo(() => {
    const out: Record<string, number> = { ...(MODULE_DEFAULT_WORKS[module] ?? {}) };
    for (const r of (works.data ?? []) as Array<{ code: string | null; sell_price: number }>) {
      if (!r.code) continue;
      out[r.code] = Number(r.sell_price) || 0;
    }
    return out;
  }, [works.data, module]);
  const workCostPrices = useMemo(() => {
    const out: Record<string, number> = { ...(MODULE_DEFAULT_WORK_COSTS[module] ?? {}) };
    for (const r of (works.data ?? []) as Array<{ code: string | null; buy_price: number }>) {
      if (!r.code) continue;
      out[r.code] = Number(r.buy_price) || 0;
    }
    return out;
  }, [works.data, module]);

  return { materialPrices, workPrices, workCostPrices, logisticsPrices, loading: mats.isLoading || works.isLoading };
}
