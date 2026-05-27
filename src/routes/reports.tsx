import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { formatUah } from "@/lib/screed-calc";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  const history = useAppStore((s) => s.history);
  const total = history.reduce((a, e) => a + e.totalClient, 0);
  const cost = history.reduce((a, e) => a + e.totalCost, 0);
  const profit = total - cost;
  const avgMargin = history.length ? history.reduce((a, e) => a + e.marginPercent, 0) / history.length : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black mb-6">Управлінський звіт</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          ["Кошторисів", String(history.length)],
          ["Загальна сума", formatUah(total)],
          ["Розрахунковий прибуток", formatUah(profit)],
          ["Середня маржа", `${avgMargin.toFixed(1)}%`],
        ].map(([l, v]) => (
          <div key={l} className="panel p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="text-2xl font-black mt-2 text-primary">{v}</div>
          </div>
        ))}
      </div>
      <div className="panel p-5">
        <h2 className="font-bold mb-3">По менеджерах</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border"><tr><th className="text-left py-2">Менеджер</th><th className="text-right">К-сть</th><th className="text-right">Сума</th><th className="text-right">Маржа сер.</th></tr></thead>
          <tbody>
            {Object.entries(history.reduce<Record<string, { count: number; sum: number; margin: number }>>((acc, e) => {
              const k = e.manager || "—";
              acc[k] ??= { count: 0, sum: 0, margin: 0 };
              acc[k].count++; acc[k].sum += e.totalClient; acc[k].margin += e.marginPercent;
              return acc;
            }, {})).map(([m, v]) => (
              <tr key={m} className="border-b border-border/40"><td className="py-2">{m}</td><td className="text-right">{v.count}</td><td className="text-right">{formatUah(v.sum)}</td><td className="text-right">{(v.margin / v.count).toFixed(1)}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
