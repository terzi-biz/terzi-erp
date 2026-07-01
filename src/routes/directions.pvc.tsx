/**
 * Пілотна сторінка нової ERP-моделі калькулятора: ПВХ-мембрана.
 * Форма підтягується з довідника input_fields, розрахунок робить серверний engine.
 * Дві вкладки: клієнтська / внутрішня (з собівартістю та маржою).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDirectionManifest, calculateDirection, saveDirectionEstimate } from "@/lib/directions.functions";
import { generateEstimateNumber } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Loader2, Save, FileDown, Calculator as CalcIcon } from "lucide-react";
import { exportPvcPdf, exportPvcExcel } from "@/lib/pvc-export";
import type { EstimateResult } from "@/lib/engines/direction-engine";

export const Route = createFileRoute("/directions/pvc")({ component: PvcPage });

function PvcPage() {
  const DIR = "pvc_membrane";
  const nav = useNavigate();
  const { roles } = useAuth();
  const internal = roles.includes("admin") || roles.includes("director") || roles.includes("finance");

  const getManifest = useServerFn(getDirectionManifest);
  const calcFn = useServerFn(calculateDirection);
  const saveFn = useServerFn(saveDirectionEstimate);

  const manifestQ = useQuery({
    queryKey: ["direction-manifest", DIR],
    queryFn: () => getManifest({ data: { directionId: DIR } }),
  });

  const [inputs, setInputs] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!manifestQ.data || Object.keys(inputs).length > 0) return;
    const init: Record<string, number> = {};
    for (const f of manifestQ.data.inputs) {
      const dv = f.default_value;
      const n = typeof dv === "string" ? Number(dv) : typeof dv === "number" ? dv : 0;
      init[f.field_key] = Number.isFinite(n) ? n : 0;
    }
    setInputs(init);
  }, [manifestQ.data, inputs]);

  const [client, setClient] = useState({ name: "", phone: "", address: "", manager: "" });
  const [tab, setTab] = useState<"client" | "internal">("client");
  const [result, setResult] = useState<EstimateResult | null>(null);

  const calcMut = useMutation({
    mutationFn: () => calcFn({ data: { directionId: DIR, inputs } }),
    onSuccess: (r) => setResult(r as EstimateResult),
  });

  // Auto-recalc when inputs change (debounced)
  useEffect(() => {
    if (!manifestQ.data || Object.keys(inputs).length === 0) return;
    const t = setTimeout(() => calcMut.mutate(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, manifestQ.data]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({
      data: {
        directionId: DIR,
        inputs,
        number: generateEstimateNumber(),
        clientName: client.name || null,
        clientPhone: client.phone || null,
        address: client.address || null,
        manager: client.manager || null,
      },
    }),
    onSuccess: () => nav({ to: "/history" }),
  });

  if (manifestQ.isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (manifestQ.error || !manifestQ.data) return <div className="p-8 text-destructive">Не вдалося завантажити напрям</div>;

  const m = manifestQ.data;
  const setVal = (k: string, v: string) => setInputs((s) => ({ ...s, [k]: Number(v.replace(",", ".")) || 0 }));

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Напрям (нова модель)</div>
          <h1 className="text-2xl font-bold">{m.direction.name}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => result && exportPvcPdf(m, inputs, result, client, internal ? "internal" : "client")}
            disabled={!result} className="px-3 py-2 text-sm border border-border rounded flex items-center gap-2 disabled:opacity-50 hover:bg-accent">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => result && exportPvcExcel(m, inputs, result, client, internal ? "internal" : "client")}
            disabled={!result} className="px-3 py-2 text-sm border border-border rounded flex items-center gap-2 disabled:opacity-50 hover:bg-accent">
            <FileDown className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => saveMut.mutate()} disabled={!result || saveMut.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded flex items-center gap-2 disabled:opacity-50">
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Зберегти кошторис
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        {/* Left: form */}
        <div className="space-y-4">
          <section className="border border-border rounded-lg p-4 bg-card">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Клієнт</h2>
            <div className="space-y-2">
              <input className="input-plain" placeholder="Ім'я клієнта" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
              <input className="input-plain" placeholder="Телефон" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
              <input className="input-plain" placeholder="Адреса об'єкта" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} />
              <input className="input-plain" placeholder="Менеджер" value={client.manager} onChange={(e) => setClient({ ...client, manager: e.target.value })} />
            </div>
          </section>

          <section className="border border-border rounded-lg p-4 bg-card">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Параметри об'єкта</h2>
            <div className="space-y-3">
              {m.inputs.map((f) => (
                <div key={f.field_key}>
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    {f.label}
                    {f.unit && <span className="text-[10px] text-muted-foreground/70">({f.unit})</span>}
                  </label>
                  <input
                    type="number" step="any" className="input-plain mt-1"
                    value={inputs[f.field_key] ?? 0}
                    onChange={(e) => setVal(f.field_key, e.target.value)}
                  />
                  {f.help_text && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{f.help_text}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: result */}
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-border">
            <button onClick={() => setTab("client")}
              className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "client" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
              Клієнтський кошторис
            </button>
            {internal && (
              <button onClick={() => setTab("internal")}
                className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "internal" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                Внутрішній (собівартість + маржа)
              </button>
            )}
          </div>

          {!result ? (
            <div className="text-sm text-muted-foreground p-8 border border-dashed border-border rounded-lg flex items-center gap-2">
              <CalcIcon className="w-4 h-4" /> Введіть параметри — розрахунок оновиться автоматично.
            </div>
          ) : (
            <ResultView result={result} view={tab} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultView({ result, view }: { result: EstimateResult; view: "client" | "internal" }) {
  const lines = view === "client" ? result.lines.filter((l) => l.clientVisible) : result.lines;
  const groups = useMemo(() => {
    const g: Record<string, typeof lines> = { materials: [], works: [], logistics: [], additional: [] };
    for (const l of lines) g[l.block].push(l);
    return g;
  }, [lines]);
  const labels: Record<string, string> = { materials: "Матеріали", works: "Роботи", logistics: "Транспорт та логістика", additional: "Додаткові послуги" };
  const money = (n: number) => n.toLocaleString("uk-UA", { maximumFractionDigits: 2 }) + " ₴";

  return (
    <div className="space-y-4">
      {(["materials", "works", "logistics", "additional"] as const).map((block) => {
        const arr = groups[block];
        if (!arr.length) return null;
        return (
          <div key={block} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-secondary/60 px-3 py-2 text-xs font-bold uppercase tracking-wider">{labels[block]}</div>
            <table className="w-full text-sm table-fixed">
              <thead className="text-[11px] uppercase text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2 w-[45%]">Позиція</th>
                  <th className="text-right px-3 py-2 w-[10%]">К-сть</th>
                  <th className="text-left px-3 py-2 w-[10%]">Од</th>
                  {view === "internal" && <th className="text-right px-3 py-2 w-[12%]">Собів., грн</th>}
                  <th className="text-right px-3 py-2 w-[12%]">Ціна</th>
                  <th className="text-right px-3 py-2 w-[13%]">Сума</th>
                </tr>
              </thead>
              <tbody>
                {arr.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 truncate" title={l.name}>{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{l.unit}</td>
                    {view === "internal" && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(l.cost)}</td>}
                    <td className="px-3 py-2 text-right tabular-nums">{money(l.pricePerUnit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(l.sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Резерв (5%)" value={money(result.totals.reserveAmount)} />
        <Kpi label="Разом клієнту" value={money(result.totals.totalClient)} primary />
        {view === "internal" && <Kpi label="Собівартість" value={money(result.totals.totalCost)} />}
        {view === "internal" && <Kpi label={`Маржа (${result.totals.marginPercent}%)`} value={money(result.totals.grossProfit)} accent />}
      </div>

      {result.warnings.length > 0 && (
        <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
          {result.warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, primary, accent }: { label: string; value: string; primary?: boolean; accent?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${primary ? "bg-primary text-primary-foreground border-primary" : accent ? "bg-accent/40 border-accent" : "bg-card border-border"}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
