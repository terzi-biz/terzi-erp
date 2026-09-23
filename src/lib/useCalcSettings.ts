/**
 * Ефективні company-wide налаштування калькуляторів: дефолти рушія + опубліковані
 * перевизначення з config-kernel. До завантаження/без записів — рівно дефолти рушія.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCalcSettings } from "@/lib/config-kernel/settings-center.functions";
import { mergeCalcSettings } from "@/lib/config-kernel/calc-settings";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/screed-calc";
import { DEFAULT_ROOFING_COEFFS, type RoofingCoefficients } from "@/lib/roofing-calc";
import { DEFAULT_INSULATION_COEFFS, type InsulationCoefficients } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_COEFFS, type DemolitionCoefficients } from "@/lib/demolition-calc";
import { useAuth } from "@/lib/auth";

export const CALC_SETTINGS_QUERY_KEY = ["calc-settings"] as const;

export function useCalcSettings() {
  const fn = useServerFn(getCalcSettings);
  const { session } = useAuth();
  const q = useQuery({
    queryKey: CALC_SETTINGS_QUERY_KEY,
    queryFn: () => fn(),
    enabled: !!session?.access_token,
    staleTime: 60_000,
  });
  const o = q.data;
  return {
    settings: mergeCalcSettings("screed", { ...DEFAULT_SETTINGS } as Settings, o?.screed),
    roofingCoeffs: mergeCalcSettings("roofing", { ...DEFAULT_ROOFING_COEFFS } as RoofingCoefficients, o?.roofing),
    insulationCoeffs: mergeCalcSettings("insulation", { ...DEFAULT_INSULATION_COEFFS } as InsulationCoefficients, o?.insulation),
    demolitionCoeffs: mergeCalcSettings("demolition", { ...DEFAULT_DEMOLITION_COEFFS } as DemolitionCoefficients, o?.demolition),
    isLoading: q.isLoading,
    loaded: q.isSuccess,
  };
}
