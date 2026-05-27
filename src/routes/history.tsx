import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { formatUah } from "@/lib/screed-calc";
import { useT } from "@/lib/i18n";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  const t = useT();
  const { history, removeEstimate } = useAppStore();
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black mb-6">{t("history")}</h1>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">№</th><th className="text-left p-3">Дата</th>
              <th className="text-left p-3">Клієнт</th><th className="text-left p-3">Адреса</th>
              <th className="text-right p-3">Площа</th><th className="text-right p-3">Сума</th>
              <th className="text-right p-3">Маржа</th><th></th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Поки немає кошторисів</td></tr>
            )}
            {history.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{e.number}</td>
                <td className="p-3">{new Date(e.createdAt).toLocaleString("uk-UA")}</td>
                <td className="p-3">{e.clientName || "—"}</td>
                <td className="p-3 text-muted-foreground">{e.address || "—"}</td>
                <td className="p-3 text-right">{e.area} м²</td>
                <td className="p-3 text-right font-bold text-primary">{formatUah(e.totalClient)}</td>
                <td className="p-3 text-right">{e.marginPercent.toFixed(1)}%</td>
                <td className="p-3"><button onClick={() => removeEstimate(e.id)} className="text-destructive opacity-60 hover:opacity-100"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
