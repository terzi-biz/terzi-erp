import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, HardHat } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatUah } from "@/lib/screed-calc";
import { ensureProductionVersion, updateFactLine } from "@/lib/estimates.functions";

export const Route = createFileRoute("/production/$id")({
  head: () => ({ meta: [
    { title: "План-факт замовлення — TERZI" },
    { name: "description", content: "Внесення фактичних обсягів і цін по позиціях кошторису TERZI з підрахунком відхилень." },
    { property: "og:title", content: "План-факт замовлення — TERZI" },
    { property: "og:description", content: "Фактичні обсяги, ціни та відхилення по замовленню TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProductionDetailPage,
});

const BLOCK_LABEL: Record<string, string> = {
  materials: "Матеріали", works: "Роботи", logistics: "Логістика", equipment: "Обладнання",
};

interface PlanLine {
  key: string; block: string; name: string; unit: string;
  qty: number; pricePerUnit: number; sum: number;
}

function ProductionDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const ensure = useServerFn(ensureProductionVersion);
  const saveFact = useServerFn(updateFactLine);

  const { data: version, isLoading } = useQuery({
    queryKey: ["production-version", id],
    queryFn: () => ensure({ data: { estimate_id: id } }),
    enabled: !!user,
  });

  const snapshot = (version as any)?.snapshot ?? {};
  const facts: Record<string, any> = snapshot.facts ?? {};

  const planLines: PlanLine[] = useMemo(() => {
    const calc = snapshot.calculation_json ?? {};
    const raw: any[] = Array.isArray(calc.lines) ? calc.lines : [];
    return raw.map((l, i) => ({
      key: String(l.key ?? `${l.block ?? "x"}-${i}`),
      block: String(l.block ?? "works"),
      name: String(l.name ?? l.key ?? "—"),
      unit: String(l.unit ?? ""),
      qty: Number(l.qty) || 0,
      pricePerUnit: Number(l.pricePerUnit) || 0,
      sum: Number(l.sum) || 0,
    }));
  }, [snapshot]);

  const mut = useMutation({
    mutationFn: (p: { line_key: string; fact_qty?: number | null; fact_price?: number | null; fact_note?: string | null }) =>
      saveFact({ data: { version_id: (version as any).id, ...p } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-version", id] }),
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти факт"),
  });

  const totals = planLines.reduce(
    (acc, l) => {
      const f = facts[l.key] ?? {};
      const fq = f.fact_qty ?? l.qty;
      const fp = f.fact_price ?? l.pricePerUnit;
      acc.plan += l.sum;
      acc.fact += fq * fp;
      return acc;
    },
    { plan: 0, fact: 0 },
  );
  const delta = totals.fact - totals.plan;

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Завантаження…</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/production" className="p-2 rounded-lg border border-border hover:bg-muted">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <HardHat className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-black tracking-tight truncate">
            {snapshot.number ?? "Кошторис"} · План-факт
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {snapshot.client_name || "—"}{snapshot.address ? ` · ${snapshot.address}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="План" value={formatUah(totals.plan)} />
        <Kpi label="Факт" value={formatUah(totals.fact)} />
        <Kpi
          label="Відхилення"
          value={`${delta >= 0 ? "+" : ""}${formatUah(delta)}`}
          tone={delta > 0 ? "warn" : delta < 0 ? "good" : undefined}
        />
      </div>

      {planLines.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          У виробничій версії немає збереженого розрахунку. Відкрийте кошторис, перерахуйте та збережіть його.
        </div>
      )}

      <div className="space-y-6">
        {["materials", "works", "logistics", "equipment"].map((block) => {
          const rows = planLines.filter((l) => l.block === block);
          if (!rows.length) return null;
          return (
            <section key={block} className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2 bg-muted text-xs font-bold uppercase tracking-wider">
                {BLOCK_LABEL[block] ?? block}
              </div>
              <div className="scroll-x">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="sticky-thead">
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="px-3 py-2">Позиція</th>
                      <th className="px-3 py-2 w-20">Од.</th>
                      <th className="px-3 py-2 w-24 text-right">План к-сть</th>
                      <th className="px-3 py-2 w-28">Факт к-сть</th>
                      <th className="px-3 py-2 w-28">Факт ціна</th>
                      <th className="px-3 py-2 w-28 text-right">Δ сума</th>
                      <th className="px-3 py-2 w-40">Примітка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <FactRow
                        key={l.key}
                        line={l}
                        fact={facts[l.key] ?? {}}
                        onSave={(p) => mut.mutate({ line_key: l.key, ...p })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base md:text-lg font-bold ${tone === "warn" ? "text-destructive" : tone === "good" ? "text-success" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function FactRow({
  line, fact, onSave,
}: {
  line: PlanLine;
  fact: any;
  onSave: (p: { fact_qty?: number | null; fact_price?: number | null; fact_note?: string | null }) => void;
}) {
  const [qty, setQty] = useState<string>(fact.fact_qty != null ? String(fact.fact_qty) : "");
  const [price, setPrice] = useState<string>(fact.fact_price != null ? String(fact.fact_price) : "");
  const [note, setNote] = useState<string>(fact.fact_note ?? "");

  useEffect(() => {
    setQty(fact.fact_qty != null ? String(fact.fact_qty) : "");
    setPrice(fact.fact_price != null ? String(fact.fact_price) : "");
    setNote(fact.fact_note ?? "");
  }, [fact.fact_qty, fact.fact_price, fact.fact_note]);

  const fq = qty === "" ? line.qty : Number(qty) || 0;
  const fp = price === "" ? line.pricePerUnit : Number(price) || 0;
  const d = fq * fp - line.sum;

  const inputCls = "w-full h-9 px-2 rounded border border-border bg-background text-sm";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">{line.name}</td>
      <td className="px-3 py-2 text-muted-foreground">{line.unit}</td>
      <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
      <td className="px-3 py-2">
        <input
          className={inputCls} inputMode="decimal" placeholder={String(line.qty)} value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => onSave({ fact_qty: qty === "" ? null : Number(qty) || 0 })}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls} inputMode="decimal" placeholder={String(line.pricePerUnit)} value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => onSave({ fact_price: price === "" ? null : Number(price) || 0 })}
        />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${d > 0 ? "text-destructive" : d < 0 ? "text-success" : "text-muted-foreground"}`}>
        {d === 0 ? "—" : `${d > 0 ? "+" : ""}${formatUah(d)}`}
      </td>
      <td className="px-3 py-2">
        <input
          className={inputCls} value={note} placeholder="—"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onSave({ fact_note: note || null })}
        />
      </td>
    </tr>
  );
}
