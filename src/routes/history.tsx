import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatUah } from "@/lib/screed-calc";
import { listEstimates, deleteEstimate } from "@/lib/estimates.functions";

export const Route = createFileRoute("/history")({ component: HistoryPage });

interface EstimateRow {
  id: string;
  number: string;
  created_at: string;
  module: string;
  status: string;
  client_name: string | null;
  address: string | null;
  area: number | null;
  total_client: number;
  margin_percent: number;
}

const MODULE_LABEL: Record<string, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Чернетка", sent: "Надіслано", approved: "Затверджено",
  inWork: "В роботі", done: "Виконано", refused: "Відмова", archived: "Архів",
};

function HistoryPage() {
  const t = useT();
  const qc = useQueryClient();
  const list = useServerFn(listEstimates);
  const del = useServerFn(deleteEstimate);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["estimates"], queryFn: () => list(),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black mb-6">{t("history")}</h1>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">№</th>
              <th className="text-left p-3">Дата</th>
              <th className="text-left p-3">Модуль</th>
              <th className="text-left p-3">Клієнт</th>
              <th className="text-left p-3">Адреса</th>
              <th className="text-left p-3">Статус</th>
              <th className="text-right p-3">Площа</th>
              <th className="text-right p-3">Сума</th>
              <th className="text-right p-3">Маржа</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="p-10 text-center text-muted-foreground">Завантаження…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={10} className="p-10 text-center text-muted-foreground">Поки немає кошторисів</td></tr>
            )}
            {(rows as EstimateRow[]).map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{e.number}</td>
                <td className="p-3">{new Date(e.created_at).toLocaleString("uk-UA")}</td>
                <td className="p-3">{MODULE_LABEL[e.module] ?? e.module}</td>
                <td className="p-3">{e.client_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{e.address || "—"}</td>
                <td className="p-3"><span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-secondary">{STATUS_LABEL[e.status] ?? e.status}</span></td>
                <td className="p-3 text-right">{e.area ?? "—"} м²</td>
                <td className="p-3 text-right font-bold text-primary">{formatUah(Number(e.total_client))}</td>
                <td className="p-3 text-right">{Number(e.margin_percent).toFixed(1)}%</td>
                <td className="p-3">
                  <button onClick={() => confirm(`Видалити ${e.number}?`) && delMut.mutate(e.id)}
                    className="text-destructive opacity-60 hover:opacity-100">
                    <Trash2 className="w-4 h-4" />
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
