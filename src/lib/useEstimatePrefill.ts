import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEstimate } from "@/lib/estimates.functions";

/**
 * Завантажує кошторис за id (з ?estimate=<id>) і викликає apply() з payload/клієнтом.
 * apply викликається один раз, коли дані прийшли.
 */
export function useEstimatePrefill(
  id: string | undefined,
  apply: (r: {
    id: string;
    payload: unknown;
    client_id?: string | null;
    order_id?: string | null;
    client_name: string | null;

    client_phone: string | null;
    address: string | null;
    manager: string | null;
    number: string;
    status: string;
  }) => void,
) {
  const getFn = useServerFn(getEstimate);
  const { data } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => getFn({ data: { id: id! } }),
    enabled: !!id,
  });
  useEffect(() => {
    if (data && (data as any).id) apply(data as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);
}
