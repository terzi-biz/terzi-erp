import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { useT, dict } from "@/lib/i18n";

export const Route = createFileRoute("/materials")({ component: MaterialsPage });

const META: Array<{ key: string; nameKey: keyof typeof dict; unit: string }> = [
  { key: "sand", nameKey: "m_sand", unit: "т" },
  { key: "cement500", nameKey: "m_cement500", unit: "міш." },
  { key: "cement400", nameKey: "m_cement400", unit: "міш." },
  { key: "fiber", nameKey: "m_fiber", unit: "уп." },
  { key: "plast", nameKey: "m_plast", unit: "л" },
  { key: "film", nameKey: "m_film", unit: "м²" },
  { key: "damper", nameKey: "m_damper", unit: "п.м" },
  { key: "mesh_comp_25", nameKey: "m_mesh_comp_25", unit: "м²" },
  { key: "mesh_comp_35", nameKey: "m_mesh_comp_35", unit: "м²" },
  { key: "mesh_met_25", nameKey: "m_mesh_met_25", unit: "м²" },
  { key: "mesh_met_35", nameKey: "m_mesh_met_35", unit: "м²" },
];

function MaterialsPage() {
  const t = useT();
  const { materialPrices, setMaterialPrice } = useAppStore();
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black mb-6">{t("materials")}</h1>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr><th className="text-left p-3">Матеріал</th><th className="text-left p-3">Од.</th><th className="text-right p-3">Закупка</th><th className="text-right p-3">Продаж</th></tr>
          </thead>
          <tbody>
            {META.map((m) => {
              const p = materialPrices[m.key];
              return (
                <tr key={m.key} className="border-t border-border">
                  <td className="p-3">{t(m.nameKey)}</td>
                  <td className="p-3 text-muted-foreground">{m.unit}</td>
                  <td className="p-3"><input type="number" step="0.5" className="w-28 bg-input border border-border rounded px-2 py-1 text-right" value={p.buy} onChange={(e) => setMaterialPrice(m.key, { ...p, buy: +e.target.value })} /></td>
                  <td className="p-3"><input type="number" step="0.5" className="w-28 bg-input border border-border rounded px-2 py-1 text-right" value={p.sell} onChange={(e) => setMaterialPrice(m.key, { ...p, sell: +e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
