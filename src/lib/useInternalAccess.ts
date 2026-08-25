import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInternalPricesAccess } from "@/lib/access.functions";
import { useAuth } from "@/lib/auth";

/**
 * Доступ до внутрішніх цін (собівартість, маржа, прибуток).
 * Джерело істини — серверна перевірка прав; до відповіді вважаємо, що прав немає.
 */
export function useInternalAccess(): { isInternal: boolean; loading: boolean } {
  const fn = useServerFn(getInternalPricesAccess);
  const { session } = useAuth();
  const enabled = !!session?.access_token;
  const q = useQuery({
    queryKey: ["internal-prices-access"],
    queryFn: () => fn(),
    enabled,
    staleTime: 5 * 60_000,
  });
  return { isInternal: q.data?.allowed === true, loading: enabled && q.isLoading };
}
