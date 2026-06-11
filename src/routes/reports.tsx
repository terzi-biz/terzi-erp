import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatUah } from "@/lib/screed-calc";
import { useAuth } from "@/lib/auth";
import { listEstimates } from "@/lib/estimates.functions";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

interface E {
  id: string; manager: string | null; total_client: number;
  total_cost: number; margin_percent: number;
}

function ReportsPage() {
  const { user } = useAuth();
  const list = useServerFn(listEstimates);
  const { data: rows = [] } = useQuery({ queryKey: ["estimates"], queryFn: () => list(), enabled: !!user });
  const history = (rows as E[]).map((e) => ({
    ...e,
    total_client: Number(e.total_client),
    total_cost: Number(e.total_cost),
    margin_percent: Number(e.margin_percent),
  }));
  const total = history.reduce((a, e) => a + e.total_client, 0);
  const cost = history.reduce((a, e) => a + e.total_cost, 0);
  const profit = total - cost;
  const avgMargin = history.length ? history.reduce((a, e) => a + e.margin_percent, 0) / history.length : 0;

  const byManager = history.reduce<Record<string, { count: number; sum: number; margin: number }>>((acc, e) => {
    const k = e.manager || "—";
    acc[k] ??= { count: 0, sum: 0, margin: 0 };
    acc[k].count++; acc[k].sum += e.total_client; acc[k].margin += e.margin_percent;
    return acc;
  }, {});

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
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr><th className="text-left py-2">Менеджер</th><th className="text-right">К-сть</th><th className="text-right">Сума</th><th className="text-right">Маржа сер.</th></tr>
          </thead>
          <tbody>
            {Object.entries(byManager).map(([m, v]) => (
              <tr key={m} className="border-b border-border/40">
                <td className="py-2">{m}</td>
                <td className="text-right">{v.count}</td>
                <td className="text-right">{formatUah(v.sum)}</td>
                <td className="text-right">{(v.margin / v.count).toFixed(1)}%</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Ще немає даних</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
