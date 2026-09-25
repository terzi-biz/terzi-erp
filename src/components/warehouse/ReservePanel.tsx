import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteReservation } from "@/lib/warehouse.functions";

export function ReservePanel({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const del = useServerFn(deleteReservation);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Резерв знято");
      onChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Замовлення</th>
              <th className="text-left px-3 py-2">Позиція</th>
              <th className="text-left px-3 py-2">Склад</th>
              <th className="text-right px-3 py-2">Зарезервовано</th>
              <th className="text-right px-3 py-2">Видано</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Резервів немає. Резерв створюється з картки замовлення.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-3 py-2 text-xs">
                  {r.order ? `${r.order.number} · ${r.order.name}` : "—"}
                </td>
                <td className="px-3 py-2">{r.item?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.warehouse?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {Number(r.qty).toFixed(2)} {r.item?.unit}
                </td>
                <td className="px-3 py-2 text-right">{Number(r.issued_qty ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-xs">{r.status}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="text-xs text-destructive font-semibold"
                    onClick={() => delMut.mutate(r.id)}
                  >
                    Зняти
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
