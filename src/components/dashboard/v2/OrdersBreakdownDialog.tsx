import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { moneyShort } from "./format";

const STATUS: Record<string, string> = {
  sold: "Продано", contract: "Договір", awaiting_prepayment: "Очікує аванс", new: "Новий",
  postponed: "Відкладено", calculation: "Розрахунок", estimate_sent: "КП надіслано",
  measurement_done: "Замір виконано", measurement_scheduled: "Замір заплановано", qualification: "Кваліфікація",
};

export type BreakdownPick = { kind: "source" | "manager"; label: string } | null;

/** Список замовлень каналу/менеджера за період (ті самі правила, що й у плашці). */
export function OrdersBreakdownDialog({ pick, from, to, onClose }: { pick: BreakdownPick; from: string; to: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash", "orders-breakdown", pick?.kind, pick?.label, from, to],
    enabled: !!pick,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("orders_breakdown_list" as any, { p_from: from, p_to: to, p_kind: pick!.kind, p_label: pick!.label } as any);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const fmt = (d: string) => d ? d.split("-").reverse().join(".") : "—";
  return (
    <Dialog open={!!pick} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{pick?.label} · {fmt(from)}–{fmt(to)}</DialogTitle></DialogHeader>
        {isLoading ? <div className="py-6 text-sm text-muted-foreground">Завантаження…</div> : !data?.length ? (
          <div className="py-6 text-sm text-muted-foreground">Замовлень немає</div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((o) => (
              <li key={o.id}>
                <Link to="/orders/$id" params={{ id: o.id }} className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{o.number} · {o.name}</div>
                    <div className="text-xs text-muted-foreground">{fmt(o.ordered_on)} · {STATUS[o.commercial_status] ?? o.commercial_status} · {o.source ?? "без джерела"} · {o.manager}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tz-num text-sm font-semibold">{moneyShort(Number(o.amount_total ?? 0))}</div>
                    <div className="text-xs text-muted-foreground">оплачено {moneyShort(Number(o.paid_total ?? 0))}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
