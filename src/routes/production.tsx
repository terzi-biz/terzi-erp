import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HardHat, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatUah } from "@/lib/screed-calc";
import { listProductionEstimates, STATUS_LABELS } from "@/lib/estimates.functions";

export const Route = createFileRoute("/production")({
  head: () => ({ meta: [
    { title: "Виробництво — план-факт | TERZI" },
    { name: "description", content: "Екран прораба TERZI: активні об'єкти в роботі, внесення фактичних обсягів і цін, відхилення від плану." },
    { property: "og:title", content: "Виробництво — план-факт | TERZI" },
    { property: "og:description", content: "Активні об'єкти в роботі та облік фактичних обсягів TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProductionListPage,
});

const MODULE_LABEL: Record<string, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж",
};

function ProductionListPage() {
  const { user } = useAuth();
  const list = useServerFn(listProductionEstimates);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["production-estimates"], queryFn: () => list(), enabled: !!user,
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <HardHat className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Виробництво</h1>
          <p className="text-sm text-muted-foreground">Об'єкти в роботі — план-факт по позиціях</p>
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Завантаження…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Немає кошторисів у роботі. Погодьте кошторис в «Історії» та переведіть у статус «В роботі».
        </div>
      )}

      <div className="grid gap-3">
        {(rows as any[]).map((r) => (
          <Link
            key={r.id}
            to="/production/$id"
            params={{ id: r.id }}
            className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4 hover:border-primary transition-colors"
          >
            <div className="min-w-0">
              <div className="font-semibold truncate">{r.number} · {MODULE_LABEL[r.module] ?? r.module}</div>
              <div className="text-sm text-muted-foreground truncate">
                {r.client_name || "—"}{r.address ? ` · ${r.address}` : ""}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {STATUS_LABELS[r.status] ?? r.status}
                {r.area ? ` · ${r.area} м²` : ""}
                {r.schedule_start_at ? ` · старт ${new Date(r.schedule_start_at).toLocaleDateString("uk-UA")}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold">{formatUah(Number(r.total_client) || 0)}</div>
              <ArrowRight className="w-4 h-4 inline-block text-muted-foreground mt-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
