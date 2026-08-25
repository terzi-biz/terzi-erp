import type { RoofingInput, RoofingResult } from "@/lib/roofing-calc";
import { formatNum } from "@/lib/screed-calc";
import { HardHat, AlertTriangle } from "lucide-react";

/** Виробнича карта (для прораба): площі, шари, вузли, витратні, попередження. Без цін. */
export function ProductionCard({
  input,
  result,
  estimateNumber,
  address,
}: {
  input: RoofingInput;
  result: RoofingResult;
  estimateNumber?: string;
  address?: string;
}) {
  const parapetAreaM2 = Math.max(
    0,
    result.effectiveAreaM2 - Math.max(0, input.area),
  );
  const bottomLayers = Math.max(0, input.layers - 1);

  const nodes: Array<{ label: string; value: string }> = [
    { label: "Периметр", value: `${formatNum(input.perimeter, 1)} п.м` },
    { label: "Висота парапету", value: `${formatNum(input.parapetHeightCm, 0)} см` },
    { label: "Загин по верху", value: `${formatNum(input.parapetTopFoldM, 2)} м` },
    { label: "Галтель", value: input.withGaltel ? `${formatNum(result.galtelMeters ?? 0, 1)} п.м` : "немає" },
    { label: "Воронки", value: `${input.funnelsCount} шт` },
    { label: "Аератори", value: `${input.aeratorsCount} шт` },
    { label: "Капельник", value: `${formatNum(input.dripEdgeMeters, 1)} п.м` },
    { label: "Кути внутр./зовн.", value: `${input.innerCornersCount} / ${input.outerCornersCount}` },
    { label: "Обпайка проходок", value: `${input.opaikaPoints} шт` },
  ];

  const works = result.lines.filter((l) => l.block === "works");
  const materials = result.lines.filter((l) => l.block === "materials");

  return (
    <section className="panel p-4 md:p-5 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
          <HardHat className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-sm uppercase tracking-wider text-primary">
            Виробнича карта
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            {estimateNumber ? `${estimateNumber}` : "Без номера"}
            {address ? ` · ${address}` : ""}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Cell label="Площа покриття" value={`${formatNum(input.area, 1)} м²`} />
        <Cell label="Вертикаль (парапет)" value={`${formatNum(parapetAreaM2, 1)} м²`} />
        <Cell label="Робоча площа" value={`${formatNum(result.effectiveAreaM2, 1)} м²`} highlight />
        <Cell
          label="Шари"
          value={`${bottomLayers} нижн. + 1 верхн.`}
        />
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Вузли та краї
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {nodes.map((n) => (
            <div key={n.label} className="flex justify-between gap-2 text-sm border-b border-border/40 py-1">
              <span className="text-muted-foreground">{n.label}</span>
              <span className="font-medium whitespace-nowrap">{n.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Cell label="Рулони" value={result.rolls != null ? `${result.rolls} рул.` : "—"} />
        <Cell label="Праймер" value={result.primerL != null ? `${formatNum(result.primerL, 1)} л` : "—"} />
        <Cell
          label="Газ"
          value={result.gasCylinders != null ? `${result.gasCylinders} бал.` : "—"}
        />
        <Cell
          label="Підготовка основи"
          value={input.withPrepBase ? "так" : "ні"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
            Обсяги робіт
          </h3>
          <ul className="text-sm space-y-1">
            {works.map((l) => (
              <li key={l.key} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span>{l.name}</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatNum(l.qty, 2)} {l.unit}
                </span>
              </li>
            ))}
            {works.length === 0 && <li className="text-muted-foreground">Робіт не вибрано.</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
            Матеріали на об'єкт
          </h3>
          <ul className="text-sm space-y-1">
            {materials.map((l) => (
              <li key={l.key} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span>{l.name}</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {l.purchaseQty != null
                    ? `${formatNum(l.purchaseQty, 2)} ${l.purchaseUnit ?? l.unit}`
                    : `${formatNum(l.qty, 2)} ${l.unit}`}
                </span>
              </li>
            ))}
            {materials.length === 0 && (
              <li className="text-muted-foreground">Матеріалів немає.</li>
            )}
          </ul>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-xs"
            >
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded ${highlight ? "bg-primary/10" : "bg-secondary/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
