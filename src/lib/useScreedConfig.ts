/**
 * Завантажує адміністровану матрицю марок і тарифи стяжки з БД.
 * Поки налаштування не збережені — повертає дефолти рушія.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getScreedConfig } from "./screed-config.functions";
import {
  DEFAULT_SCREED_CONFIG_PAYLOAD, SCREED_GRADES, DEFAULT_SCREED_PRODUCTION_CONFIG,
  type ScreedConfigPayload,
} from "./screed-grades";

export const SCREED_CONFIG_QUERY_KEY = ["screed-config"] as const;

export function useScreedConfig(): { payload: ScreedConfigPayload; isLoading: boolean } {
  const fn = useServerFn(getScreedConfig);
  const q = useQuery({
    queryKey: SCREED_CONFIG_QUERY_KEY,
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  const saved = q.data?.payload;
  return {
    payload: saved
      ? {
          grades: { ...SCREED_GRADES, ...saved.grades },
          config: { ...DEFAULT_SCREED_PRODUCTION_CONFIG, ...saved.config },
        }
      : DEFAULT_SCREED_CONFIG_PAYLOAD,
    isLoading: q.isLoading,
  };
}
