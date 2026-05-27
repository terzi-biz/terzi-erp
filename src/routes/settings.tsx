import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const LABELS: Record<string, string> = {
  dieselPrice: "Ціна дизелю, грн/л",
  busFuelPer100: "Витрата буса, л/100км",
  cityStationDelivery: "Доставка станції по місту, грн",
  cementOwnBusToClient: "Цемент свій бус → клієнту, грн",
  smallManipClient: "Маленький маніпулятор клієнту",
  bigManipClient: "Великий маніпулятор клієнту",
  cementUnloadClient: "Вивантаження цементу клієнту, грн/міш.",
  cementUnloadCost: "Вивантаження собівартість, грн/міш.",
  sandTripCapacity: "Місткість ходки піску, т",
  sandCityClient: "Пісок місто клієнту, грн",
  sandOutskirtsClient: "Пісок околиця, грн",
  sandChornomorskClient: "Пісок Чорноморськ, грн",
  brigadeMin: "Мін. оплата бригади (до 100 м²), грн",
  brigadePerM2: "Бригада понад 100 м², грн/м²",
  brigadeMeshCost: "Бригада: сітка, грн/м²",
  brigadeSlopeCost: "Бригада: розуклонка, грн/м²",
  amortEquipPerM2: "Амортизація обладнання, грн/м²",
  amortTransportPerM2: "Амортизація транспорту, грн/м²",
  minCheck: "Мінімальний чек, грн",
  marginThreshold: "Поріг маржинальності, %",
  roundStep: "Округлення, грн (1/5/10)",
};

function SettingsPage() {
  const { settings, updateSettings, resetDefaults } = useAppStore();
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div><div className="hatch-accent h-1 w-16 mb-3 rounded" /><h1 className="text-3xl font-black">Налаштування</h1></div>
        <button onClick={resetDefaults} className="px-4 py-2 rounded bg-secondary text-sm font-semibold">Скинути до дефолтів</button>
      </div>
      <div className="panel p-6 space-y-3">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <label className="text-sm">{label}</label>
            <input type="number" step="0.1" className="w-36 bg-input border border-border rounded px-2 py-1 text-right" value={(settings as any)[k]} onChange={(e) => updateSettings({ [k]: +e.target.value } as any)} />
          </div>
        ))}
      </div>
    </div>
  );
}
