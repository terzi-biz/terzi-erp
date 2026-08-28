/**
 * Універсальна виробнича карта (для прораба) для будь-якого напрямку.
 * Показує обсяги робіт і матеріалів без будь-яких цін.
 */
import { HardHat } from "lucide-react";
import { formatNum } from "@/lib/screed-calc";
import type { EstimateLineLike } from "@/lib/estimate-line";

export function GenericProductionCard({
  lines,
  title,
  estimateNumber,
  address,
  facts = [],
}: {
  lines: EstimateLineLike[];
  title: string;
  estimateNumber?: string;
  address?: string;
  facts?: Array<{ label: string; value: string }>;
}) {
  const works = lines.filter((l) => l.block === "works");
  const materials = lines.filter((l) => l.block === "materials");

  return (
    <section className="panel p-4 md:p-5 space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
          <HardHat className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider text-primary">
            Виробнича карта
          </h2>
          <p className="text-xs text-muted-foreground">
            {estimateNumber ? `${estimateNumber} · ` : ""}
            {title}
            {address ? ` · ${address}` : ""}
          </p>
        </div>
      </header>

      {facts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="rounded border border-border bg-secondary/30 p-2">
              <div className="text-[11px] text-muted-foreground">{f.label}</div>
              <div className="text-sm font-bold tabular-nums">{f.value}</div>
            </div>
          ))}
        </div>
      )}

      <ProdBlock title="Роботи" rows={works} />
      <ProdBlock title="Матеріали на об'єкт" rows={materials} />

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Немає даних розрахунку.</p>
      )}
    </section>
  );
}

function ProdBlock({ title, rows }: { title: string; rows: EstimateLineLike[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-1 font-semibold">Найменування</th>
            <th className="text-right py-1 font-semibold w-28">Кількість</th>
            <th className="text-left py-1 font-semibold w-16 pl-2">Од.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/50">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums font-medium">{formatNum(r.qty, 2)}</td>
              <td className="py-1.5 pl-2 text-muted-foreground">{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
