import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatUah } from "@/lib/screed-calc";
import { getStockDocFinmap, linkStockDocFinmap, unlinkStockDocFinmap } from "@/lib/warehouse-finmap.functions";

const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");

/** Зв'язок приходу з наявною оплатою постачальнику з Finmap (без створення операцій у Finmap). */
export function StockDocFinmap({ docId }: { docId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStockDocFinmap);
  const linkFn = useServerFn(linkStockDocFinmap);
  const unlinkFn = useServerFn(unlinkStockDocFinmap);
  const q = useQuery({ queryKey: ["stock-doc-finmap", docId], queryFn: () => getFn({ data: { docId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["stock-doc-finmap", docId] });
  const link = useMutation({
    mutationFn: (transactionId: string) => linkFn({ data: { docId, transactionId } }),
    onSuccess: () => { toast.success("Прихід пов'язано з оплатою Finmap"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const unlink = useMutation({
    mutationFn: (linkId: string) => unlinkFn({ data: { linkId } }),
    onSuccess: () => { toast.success("Зв'язок прибрано"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  if (q.isLoading) return <div className="text-xs text-muted-foreground">Завантаження…</div>;
  const d = q.data as any;
  if (!d?.allowed) return <div className="text-xs text-muted-foreground">Оплати Finmap доступні лише фінансовим ролям.</div>;

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground">
        Оплата постачальнику вже є у Finmap — тут її лише пов'язують із приходом. Нові операції у Finmap не створюються.
      </div>
      {d.links.length > 0 && (
        <div className="space-y-1">
          <div className="font-semibold">Пов'язані оплати</div>
          {d.links.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
              <span>{fmtDate(l.finance_transactions?.op_date)} · {formatUah(Math.abs(Number(l.finance_transactions?.amount_uah ?? l.finance_transactions?.amount) || 0))} · {l.finance_transactions?.comment ?? "без коментаря"}</span>
              <button className="text-destructive font-semibold" onClick={() => unlink.mutate(l.id)}>Прибрати</button>
            </div>
          ))}
        </div>
      )}
      <div className="font-semibold">Можливі оплати (витрати ±10 днів{Number(d.doc.total_cost) > 0 ? ", сума ±2%" : ""})</div>
      {d.candidates.length === 0 ? (
        <div className="text-muted-foreground">Відповідних витрат у Finmap не знайдено.</div>
      ) : (
        d.candidates.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
            <span>{fmtDate(t.op_date)} · {formatUah(t.amount_abs)} · {t.comment ?? "без коментаря"}</span>
            <button className="text-primary font-semibold" disabled={link.isPending} onClick={() => link.mutate(t.id)}>Пов'язати</button>
          </div>
        ))
      )}
    </div>
  );
}
