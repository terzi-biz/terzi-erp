/**
 * Спільні запити центру звітів. Жодних бізнес-формул на клієнті:
 * усі значення приходять із канонічних серверних функцій.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalyticsOverview } from "@/lib/analytics.functions";
import { useReportPeriod } from "./report-shell";

export function useOverview() {
  const { period } = useReportPeriod();
  const load = useServerFn(getAnalyticsOverview);
  const query = useQuery({
    queryKey: ["reports", "overview", period.from, period.to],
    queryFn: () => load({ data: { from: period.from, to: period.to } }),
    staleTime: 60_000,
    retry: false,
  });
  return { period, query, data: query.data?.current as any, previous: query.data?.previous as any };
}
