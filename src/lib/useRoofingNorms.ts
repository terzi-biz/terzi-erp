/**
 * Завантажує адміністровані нормативи наплавної покрівлі.
 * Поки нічого не збережено — повертає дефолти рушія.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRoofingConfig } from "./roofing-config.functions";
import { mergeNorms, type RoofingNorms } from "./roofing/norms";

export const ROOFING_CONFIG_QUERY_KEY = ["roofing-config"] as const;

export function useRoofingNorms(): { norms: RoofingNorms; isLoading: boolean; updatedAt?: string } {
  const fn = useServerFn(getRoofingConfig);
  const q = useQuery({
    queryKey: ROOFING_CONFIG_QUERY_KEY,
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  return {
    norms: mergeNorms(q.data?.payload?.norms),
    isLoading: q.isLoading,
    ...(q.data?.updatedAt ? { updatedAt: q.data.updatedAt } : {}),
  };
}
