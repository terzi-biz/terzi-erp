import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/works")({ component: WorksPage });

const LABELS: Record<string, string> = {
  screedBase: "Стяжка 4–7 см, грн/м²",
  screedExtraPerCm: "+ за см понад 7, грн/м²",
  prep: "Підготовка основи, грн/м²",
  film: "Укладка плівки, грн/м²",
  damper: "Укладка демпферу, грн/п.м",
  cuts: "Нарізка швів, грн/м²",
  grind: "Шліфовка, грн/м²",
  mesh: "Укладка сітки, грн/м²",
  slope: "Розуклонка, грн/м²",
  cementUnload: "Вивантаження цементу, грн/міш.",
};

function WorksPage() {
  const { workPrices, setWorkPrice } = useAppStore();
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black mb-6">Роботи · Стяжка</h1>
      <div className="panel p-6 space-y-3">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <label className="text-sm">{label}</label>
            <input type="number" step="0.5" className="w-32 bg-input border border-border rounded px-2 py-1 text-right" value={(workPrices as any)[k]} onChange={(e) => setWorkPrice(k as any, +e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
