import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Layers, Home as RoofIcon, Snowflake, Hammer, Sliders, Save, Undo2, RotateCcw, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PriceImportDialog } from "@/components/PriceImportDialog";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { resyncCatalogPrices } from "@/lib/catalog.functions";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

type Tab = "screed" | "roofing" | "insulation" | "demolition" | "common";

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
];

const ROOFING_GROUPS = [
  { title: "Рубемаст / євроруберойд — коефіцієнти", fields: [
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
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2Rubemast", label: "Бригада: рубемаст, грн/м²" },
    { key: "brigadePerM2Pvc", label: "Бригада: ПВХ, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const INSULATION_GROUPS = [
  { title: "Норми витрат матеріалів", fields: [
    { key: "cutoffCoef", label: "Коеф. перевитрати плит (обрізки)", step: "0.01" },
    { key: "glueBagsPer10M2", label: "Клей: мішків на 10 м²", step: "0.1" },
    { key: "dowelsPerM2", label: "Дюбелі, шт/м²" },
    { key: "meshCoef", label: "Склосітка (коеф. з нахльостом)", step: "0.01" },
    { key: "polystyrcreteWastePercent", label: "Полістиролбетон: втрати, %" },
  ]},
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2", label: "Бригада, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const DEMOLITION_GROUPS = [
  { title: "Об'єм сміття (норми)", fields: [
    { key: "wasteM3PerM2Screed", label: "Стяжка, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Tile", label: "Плитка, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Roof", label: "Покрівля, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Walls", label: "Перегородки, м³/м²", step: "0.01" },
    { key: "wasteLooseCoef", label: "Коеф. розпушення", step: "0.05" },
    { key: "bagsPerM3", label: "Мішків на 1 м³" },
    { key: "floorAddPercent", label: "Надбавка за поверх, %" },
  ]},
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2", label: "Бригада, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const COMMON_FIELDS = [
  { key: "minCheck", label: "Мінімальний чек, грн" },
  { key: "marginThreshold", label: "Мінімальний маржинальний %, %" },
  { key: "roundStep", label: "Округлення суми, грн" },
  { key: "fopRate", label: "Ставка при ФОП (наприклад 0.06)", step: "0.01" },
  { key: "vatRate", label: "Ставка ПДВ (наприклад 0.20)", step: "0.01" },
  { key: "materialMarkupPercent", label: "Націнка на матеріали, % (для ресинку каталогу)", step: "1" },
];

function SettingsPage() {
  const {
    settings, updateSettings,
    roofingCoeffs, updateRoofingCoeffs,
    insulationCoeffs, updateInsulationCoeffs,
    demolitionCoeffs, updateDemolitionCoeffs,
    resetDefaults,
  } = useAppStore();
  const [tab, setTab] = useState<Tab>("screed");
  const [importOpen, setImportOpen] = useState<null | { module: Tab; kind: "material" | "work" }>(null);
  const [resyncing, setResyncing] = useState(false);
  const resyncFn = useServerFn(resyncCatalogPrices);
  const qc = useQueryClient();

  const runResync = async (module: Exclude<Tab, "common">, kind: "material" | "work") => {
    setResyncing(true);
    try {
      const markup = Number(draft.settings.materialMarkupPercent ?? 30);
      const res = await resyncFn({ data: { module, kind, markupPercent: markup, updateSell: kind === "material" } });
      await qc.invalidateQueries({ queryKey: ["catalog", module, kind] });
      toast.success(`Пересіяно: оновлено ${res.updated}, додано ${res.inserted}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не вдалося пересіяти прайси");
    } finally {
      setResyncing(false);
    }
  };

  // Local draft — changes are only committed to the store on Save.
  const [draft, setDraft] = useState(() => ({
    settings: { ...settings },
    roofingCoeffs: { ...roofingCoeffs },
    insulationCoeffs: { ...insulationCoeffs },
    demolitionCoeffs: { ...demolitionCoeffs },
  }));

  // Re-sync if the store changes externally (e.g. resetDefaults).
  useEffect(() => {
    setDraft({
      settings: { ...settings },
      roofingCoeffs: { ...roofingCoeffs },
      insulationCoeffs: { ...insulationCoeffs },
      demolitionCoeffs: { ...demolitionCoeffs },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, roofingCoeffs, insulationCoeffs, demolitionCoeffs]);

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify({
      settings, roofingCoeffs, insulationCoeffs, demolitionCoeffs,
    });
  }, [draft, settings, roofingCoeffs, insulationCoeffs, demolitionCoeffs]);

  const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
    { id: "screed", label: "Стяжка", icon: Layers },
    { id: "roofing", label: "Покрівля", icon: RoofIcon },
    { id: "insulation", label: "Утеплення", icon: Snowflake },
    { id: "demolition", label: "Демонтаж", icon: Hammer },
    { id: "common", label: "Спільні", icon: Sliders },
  ];

  const setDraftValue = (
    section: "settings" | "roofingCoeffs" | "insulationCoeffs" | "demolitionCoeffs",
    key: string, value: number,
  ) => {
    setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
  };

  const save = () => {
    updateSettings(draft.settings);
    updateRoofingCoeffs(draft.roofingCoeffs);
    updateInsulationCoeffs(draft.insulationCoeffs);
    updateDemolitionCoeffs(draft.demolitionCoeffs);
    toast.success("Налаштування збережено. Розрахунки перераховано.");
  };

  const discard = () => {
    setDraft({
      settings: { ...settings },
      roofingCoeffs: { ...roofingCoeffs },
      insulationCoeffs: { ...insulationCoeffs },
      demolitionCoeffs: { ...demolitionCoeffs },
    });
    toast("Зміни скасовано");
  };

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
            value={getVal(f.key) ?? 0} onChange={(e) => onChange(f.key, +e.target.value)} />
        </div>
      ))}
    </div>
  );

  const ActionsBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 panel px-3 py-2 mb-4">
      <div className="text-xs text-muted-foreground">
        {dirty ? <span className="text-primary font-semibold">● Є незбережені зміни</span> : "Без змін"}
      </div>
      <div className="flex gap-2">
        <button onClick={discard} disabled={!dirty}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
          <Undo2 className="w-3.5 h-3.5" /> Скасувати
        </button>
        <button onClick={resetDefaults}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-xs font-semibold">
          <RotateCcw className="w-3.5 h-3.5" /> До дефолтів
        </button>
        <button onClick={save} disabled={!dirty}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">
          <Save className="w-3.5 h-3.5" /> Зберегти
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black">Налаштування калькулятора</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Норми витрат бригади, норми витрат матеріалів, коефіцієнти, амортизація і спільні параметри (мін. чек, маржа, округлення, ФОП, ПДВ).
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap ${tab === tb.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
            <tb.icon className="w-4 h-4" /> {tb.label}
          </button>
        ))}
      </div>

      {ActionsBar}

      {tab !== "common" && (
        <div className="panel p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
            <Upload className="w-3 h-3 inline mr-1" /> Імпорт прайсу постачальника:
          </span>
          <button onClick={() => setImportOpen({ module: tab, kind: "material" })}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold">
            Матеріали (xlsx / csv)
          </button>
          <button onClick={() => setImportOpen({ module: tab, kind: "work" })}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold">
            Роботи (xlsx / csv)
          </button>
          <span className="mx-2 text-muted-foreground/50">|</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            <RefreshCw className="w-3 h-3 inline mr-1" /> Пересіяти дефолти (націнка {draft.settings.materialMarkupPercent ?? 30}%):
          </span>
          <button onClick={() => runResync(tab as Exclude<Tab, "common">, "material")} disabled={resyncing}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
            Матеріали
          </button>
          <button onClick={() => runResync(tab as Exclude<Tab, "common">, "work")} disabled={resyncing}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
            Роботи
          </button>
        </div>
      )}

      <div className="space-y-4">
        {tab === "screed" && SCREED_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (draft.settings as unknown as Record<string, number>)[k]}
            onChange={(k, v) => setDraftValue("settings", k, v)} />
        ))}
        {tab === "roofing" && ROOFING_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (draft.roofingCoeffs as unknown as Record<string, number>)[k]}
            onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
        ))}
        {tab === "insulation" && INSULATION_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (draft.insulationCoeffs as unknown as Record<string, number>)[k]}
            onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
        ))}
        {tab === "demolition" && DEMOLITION_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields}
            getVal={(k) => (draft.demolitionCoeffs as unknown as Record<string, number>)[k]}
            onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
        ))}
        {tab === "common" && (
          <>
            <Group title="Стяжка — спільні (мін.чек, маржа, округлення, ФОП, ПДВ)" fields={COMMON_FIELDS}
              getVal={(k) => (draft.settings as unknown as Record<string, number>)[k]}
              onChange={(k, v) => setDraftValue("settings", k, v)} />
            <Group title="Покрівля — спільні" fields={COMMON_FIELDS}
              getVal={(k) => (draft.roofingCoeffs as unknown as Record<string, number>)[k]}
              onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
            <Group title="Утеплення — спільні" fields={COMMON_FIELDS}
              getVal={(k) => (draft.insulationCoeffs as unknown as Record<string, number>)[k]}
              onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
            <Group title="Демонтаж — спільні" fields={COMMON_FIELDS}
              getVal={(k) => (draft.demolitionCoeffs as unknown as Record<string, number>)[k]}
              onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
          </>
        )}
      </div>

      {importOpen && importOpen.module !== "common" && (
        <PriceImportDialog
          module={importOpen.module as "screed" | "roofing" | "insulation" | "demolition"}
          kind={importOpen.kind}
          onClose={() => setImportOpen(null)}
        />
      )}
    </div>
  );
}
