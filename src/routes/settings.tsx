import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Layers, Home as RoofIcon, Snowflake, Hammer, Sliders } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

type Tab = "screed" | "roofing" | "common";

const SCREED_GROUPS = [
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади (до 100 м²), грн" },
    { key: "brigadePerM2", label: "Бригада понад 100 м², грн/м²" },
    { key: "brigadeMeshCost", label: "Бригада: сітка, грн/м²" },
    { key: "brigadeSlopeCost", label: "Бригада: розуклонка, грн/м²" },
    { key: "brigadeUnloadCost", label: "Вивантаження цементу: бригада, грн/міш." },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
  { title: "Логістика (стяжки)", fields: [
    { key: "dieselPrice", label: "Ціна дизелю, грн/л" },
    { key: "busFuelPer100", label: "Витрата буса, л/100км" },
    { key: "cityStationDelivery", label: "Доставка станції по місту, грн" },
    { key: "cementOwnBusToClient", label: "Цемент свій бус — клієнту" },
    { key: "smallManipCost", label: "Малий маніпулятор — собівартість" },
    { key: "smallManipClient", label: "Малий маніпулятор — клієнту" },
    { key: "bigManipCost", label: "Великий маніпулятор — собівартість" },
    { key: "bigManipClient", label: "Великий маніпулятор — клієнту" },
    { key: "cementUnloadClient", label: "Вивантаження цементу — клієнту, грн/міш." },
    { key: "cementUnloadCost", label: "Вивантаження — собівартість, грн/міш." },
    { key: "sandTripCapacity", label: "Місткість ходки піску, т" },
    { key: "sandCityCost", label: "Пісок місто — собівартість" },
    { key: "sandCityClient", label: "Пісок місто — клієнту" },
    { key: "sandOutskirtsClient", label: "Пісок околиця — клієнту" },
    { key: "sandChornomorskClient", label: "Пісок Чорноморськ — клієнту" },
  ]},
];

const ROOFING_GROUPS = [
  { title: "Рубемаст — коефіцієнти", fields: [
    { key: "rubemastOverlapCoef", label: "Коеф. перевитрати (нахльост 10 см)", step: "0.01" },
    { key: "rubemastRollAreaM2", label: "Площа рулону, м²" },
    { key: "rubemastPrimerLPerM2", label: "Праймер, л/м²", step: "0.01" },
    { key: "rubemastGasKgPerLayerM2", label: "Газ, кг/м²/шар", step: "0.01" },
    { key: "rubemastGasCylinderKg", label: "Балон газу, кг" },
  ]},
  { title: "ПВХ-мембрана — коефіцієнти", fields: [
    { key: "pvcOverlapCoef", label: "Нахльост мембрани", step: "0.01" },
    { key: "pvcGeoCoef", label: "Геотекстиль (коеф.)", step: "0.01" },
    { key: "pvcFastenersPerM2", label: "Кріплення, шт/м²", step: "0.5" },
  ]},
  { title: "Геометрія", fields: [
    { key: "parapetHeightCmDefault", label: "Висота парапету за замовч., см" },
  ]},
  { title: "Бригада / амортизація", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2Rubemast", label: "Бригада: рубемаст, грн/м²" },
    { key: "brigadePerM2Pvc", label: "Бригада: ПВХ, грн/м²" },
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const COMMON_FIELDS = [
  { key: "minCheck", label: "Мінімальний чек, грн" },
  { key: "marginThreshold", label: "Поріг маржинальності, %" },
  { key: "roundStep", label: "Округлення, грн" },
  { key: "fopRate", label: "Ставка ФОП", step: "0.01" },
  { key: "vatRate", label: "Ставка ПДВ", step: "0.01" },
];

function SettingsPage() {
  const { settings, updateSettings, roofingCoeffs, updateRoofingCoeffs, resetDefaults } = useAppStore();
  const [tab, setTab] = useState<Tab>("screed");

  const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
    { id: "screed", label: "Стяжка", icon: Layers },
    { id: "roofing", label: "Покрівля", icon: RoofIcon },
    { id: "common", label: "Спільні", icon: Sliders },
  ];

  const Group = ({ title, fields, getVal, onChange }: {
    title: string;
    fields: { key: string; label: string; step?: string }[];
    getVal: (k: string) => number;
    onChange: (k: string, v: number) => void;
  }) => (
    <div className="panel p-4 md:p-5 space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-primary font-bold mb-2">{title}</h3>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3">
          <label className="text-sm flex-1">{f.label}</label>
          <input type="number" step={f.step ?? "0.1"}
            className="w-28 md:w-32 bg-input border border-border rounded px-2 py-1 text-right text-sm"
            value={getVal(f.key)} onChange={(e) => onChange(f.key, +e.target.value)} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black">Налаштування калькулятора</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Коефіцієнти і мозок розрахунків. Ціни матеріалів/робіт — у каталозі модуля.
          </p>
        </div>
        <button onClick={resetDefaults} className="px-4 py-2 rounded bg-secondary text-sm font-semibold">Скинути дефолти</button>
      </div>

      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap ${tab === tb.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
            <tb.icon className="w-4 h-4" /> {tb.label}
          </button>
        ))}
        <button disabled className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-secondary/40 text-muted-foreground opacity-50 whitespace-nowrap">
          <Snowflake className="w-4 h-4" /> Утеплення (скоро)
        </button>
        <button disabled className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-secondary/40 text-muted-foreground opacity-50 whitespace-nowrap">
          <Hammer className="w-4 h-4" /> Демонтаж (скоро)
        </button>
      </div>

      <div className="space-y-4">
        {tab === "screed" && SCREED_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (settings as Record<string, number>)[k]}
            onChange={(k, v) => updateSettings({ [k]: v } as Partial<typeof settings>)} />
        ))}
        {tab === "roofing" && ROOFING_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (roofingCoeffs as unknown as Record<string, number>)[k]}
            onChange={(k, v) => updateRoofingCoeffs({ [k]: v } as Partial<typeof roofingCoeffs>)} />
        ))}
        {tab === "common" && (
          <>
            <Group title="Стяжка — спільні" fields={COMMON_FIELDS}
              getVal={(k) => (settings as Record<string, number>)[k]}
              onChange={(k, v) => updateSettings({ [k]: v } as Partial<typeof settings>)} />
            <Group title="Покрівля — спільні" fields={COMMON_FIELDS}
              getVal={(k) => (roofingCoeffs as Record<string, number>)[k]}
              onChange={(k, v) => updateRoofingCoeffs({ [k]: v } as Partial<typeof roofingCoeffs>)} />
          </>
        )}
      </div>
    </div>
  );
}
