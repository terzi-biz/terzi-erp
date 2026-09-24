/**
 * Редактор company-wide норм витрат і коефіцієнтів калькуляторів.
 * Джерело істини — config-kernel; тут лише чернетка правок + збереження.
 * Збережені значення миттєво застосовуються до нових розрахунків і кошторисів.
 */
import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Undo2, RotateCcw, Upload, RefreshCw, Layers, Home as RoofIcon, Snowflake, Hammer, Sliders } from "lucide-react";
import { NumberInput } from "@/components/NumberInput";
import { PriceImportDialog } from "@/components/PriceImportDialog";
import { resyncCatalogPrices } from "@/lib/catalog.functions";
import { saveCalcSettings } from "@/lib/config-kernel/settings-center.functions";
import { useCalcSettings, CALC_SETTINGS_QUERY_KEY } from "@/lib/useCalcSettings";
import { DEFAULT_SETTINGS } from "@/lib/screed-calc";
import { DEFAULT_ROOFING_COEFFS } from "@/lib/roofing-calc";
import { DEFAULT_INSULATION_COEFFS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_COEFFS } from "@/lib/demolition-calc";

type ModuleTab = "screed" | "roofing" | "insulation" | "demolition" | "common";

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
  { title: "Рубемаст / євроруберойд — норми витрат", fields: [
    { key: "rubemastOverlapCoef", label: "Коеф. перевитрати (нахльост 10 см)", step: "0.01" },
    { key: "rubemastRollAreaM2", label: "Площа рулону, м²" },
    { key: "rubemastPrimerLPerM2", label: "Праймер, л/м²", step: "0.01" },
    { key: "rubemastGasKgPerLayerM2", label: "Газ, кг/м²/шар", step: "0.01" },
    { key: "rubemastGasCylinderKg", label: "Балон газу, кг" },
  ]},
  { title: "ПВХ-мембрана — норми витрат", fields: [
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

const CALC_DEFAULTS = {
  settings: DEFAULT_SETTINGS as unknown as Record<string, number>,
  roofingCoeffs: DEFAULT_ROOFING_COEFFS as unknown as Record<string, number>,
  insulationCoeffs: DEFAULT_INSULATION_COEFFS as unknown as Record<string, number>,
  demolitionCoeffs: DEFAULT_DEMOLITION_COEFFS as unknown as Record<string, number>,
};
type DraftSection = keyof typeof CALC_DEFAULTS;
const KERNEL_KEY: Record<DraftSection, "screed" | "roofing" | "insulation" | "demolition"> = {
  settings: "screed", roofingCoeffs: "roofing", insulationCoeffs: "insulation", demolitionCoeffs: "demolition",
};

const TABS: { id: ModuleTab; label: string; icon: typeof Layers }[] = [
  { id: "screed", label: "Стяжка", icon: Layers },
  { id: "roofing", label: "Покрівля", icon: RoofIcon },
  { id: "insulation", label: "Утеплення", icon: Snowflake },
  { id: "demolition", label: "Демонтаж", icon: Hammer },
  { id: "common", label: "Спільні", icon: Sliders },
];

const TAB_RESET: Record<ModuleTab, { sec: DraftSection; keys: string[] }[]> = {
  screed: [{ sec: "settings", keys: SCREED_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  roofing: [{ sec: "roofingCoeffs", keys: ROOFING_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  insulation: [{ sec: "insulationCoeffs", keys: INSULATION_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  demolition: [{ sec: "demolitionCoeffs", keys: DEMOLITION_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  common: (["settings", "roofingCoeffs", "insulationCoeffs", "demolitionCoeffs"] as DraftSection[]).map((sec) => ({ sec, keys: COMMON_FIELDS.map((f) => f.key) })),
};

function Group({ title, fields, getVal, onChange, disabled }: {
  title: string;
  fields: { key: string; label: string; step?: string }[];
  getVal: (k: string) => number;
  onChange: (k: string, v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="panel p-4 md:p-5 space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-primary font-bold mb-2">{title}</h3>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3">
          <label className="text-sm flex-1">{f.label}</label>
          <NumberInput step={f.step ?? "0.1"} disabled={disabled}
            className="w-28 md:w-32 bg-input border border-border rounded px-2 py-1 text-right text-sm disabled:opacity-60"
            value={getVal(f.key) ?? 0} onChange={(v) => onChange(f.key, v)} />
        </div>
      ))}
    </div>
  );
}

export function CalcNormsEditor({ canEdit }: { canEdit: boolean }) {
  const effective = useCalcSettings();
  const saveFn = useServerFn(saveCalcSettings);
  const resyncFn = useServerFn(resyncCatalogPrices);
  const qc = useQueryClient();

  const [tab, setTab] = useState<ModuleTab>("screed");
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [importOpen, setImportOpen] = useState<null | { module: Exclude<ModuleTab, "common">; kind: "material" | "work" }>(null);

  const saved = useMemo(() => ({
    settings: effective.settings as unknown as Record<string, number>,
    roofingCoeffs: effective.roofingCoeffs as unknown as Record<string, number>,
    insulationCoeffs: effective.insulationCoeffs as unknown as Record<string, number>,
    demolitionCoeffs: effective.demolitionCoeffs as unknown as Record<string, number>,
  }), [effective.settings, effective.roofingCoeffs, effective.insulationCoeffs, effective.demolitionCoeffs]);
  const savedJson = JSON.stringify(saved);

  const [draft, setDraft] = useState(saved);
  useEffect(() => { setDraft(JSON.parse(savedJson)); }, [savedJson]);
  const dirty = JSON.stringify(draft) !== savedJson;

  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      const leave = window.confirm("Є незбережені зміни норм. Відкинути їх і продовжити?");
      if (leave) setDraft(JSON.parse(savedJson));
      return !leave;
    },
    enableBeforeUnload: () => dirty,
  });

  const setDraftValue = (sec: DraftSection, key: string, value: number) =>
    setDraft((d) => ({ ...d, [sec]: { ...d[sec], [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const changed = (Object.keys(KERNEL_KEY) as DraftSection[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));
      for (const k of changed) await saveFn({ data: { key: KERNEL_KEY[k], values: draft[k] } });
      await qc.invalidateQueries({ queryKey: CALC_SETTINGS_QUERY_KEY });
      toast.success("Норми збережено — застосовано до нових розрахунків і кошторисів.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не вдалося зберегти норми");
    } finally {
      setSaving(false);
    }
  };

  const runResync = async (module: Exclude<ModuleTab, "common">, kind: "material" | "work") => {
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

  const discard = () => { setDraft(JSON.parse(savedJson)); toast("Зміни скасовано"); };
  const toDefaults = () => {
    setDraft((d) => {
      const next = { ...d };
      for (const { sec, keys } of TAB_RESET[tab]) {
        const cur = { ...next[sec] };
        for (const k of keys) cur[k] = CALC_DEFAULTS[sec][k];
        next[sec] = cur;
      }
      return next;
    });
    toast("Дефолти підставлено для цієї вкладки — натисніть «Зберегти».");
  };
  const allToDefaults = () => {
    if (!window.confirm("Скинути до дефолтів УСІ норми (стяжка, покрівля, утеплення, демонтаж, спільні)? Зміни набудуть чинності лише після «Зберегти».")) return;
    setDraft({
      settings: { ...CALC_DEFAULTS.settings }, roofingCoeffs: { ...CALC_DEFAULTS.roofingCoeffs },
      insulationCoeffs: { ...CALC_DEFAULTS.insulationCoeffs }, demolitionCoeffs: { ...CALC_DEFAULTS.demolitionCoeffs },
    });
    toast("Дефолти підставлено для всіх норм — натисніть «Зберегти».");
  };

  const disabled = !canEdit;

  return (
    <div>
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${tab === t.id ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 panel px-3 py-2 mb-4">
        <div className="text-xs text-muted-foreground">
          {disabled ? "Лише перегляд: потрібне право «Керування налаштуваннями»."
            : dirty ? <span className="text-primary font-semibold">● Є незбережені зміни</span> : "Збережено для всієї компанії"}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <button onClick={discard} disabled={!dirty || saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
              <Undo2 className="w-3.5 h-3.5" /> Скасувати
            </button>
            <button onClick={toDefaults} disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
              <RotateCcw className="w-3.5 h-3.5" /> До дефолтів (ця вкладка)
            </button>
            <button onClick={allToDefaults} disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-xs font-semibold text-destructive disabled:opacity-40">
              Скинути всі норми
            </button>
            <button onClick={save} disabled={!dirty || saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        )}
      </div>

      {tab !== "common" && !disabled && (
        <div className="panel p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
            <Upload className="w-3 h-3 inline mr-1" /> Імпорт прайсу постачальника:
          </span>
          <button onClick={() => setImportOpen({ module: tab, kind: "material" })}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold">Матеріали (xlsx / csv)</button>
          <button onClick={() => setImportOpen({ module: tab, kind: "work" })}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold">Роботи (xlsx / csv)</button>
          <span className="mx-2 text-muted-foreground/50">|</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            <RefreshCw className="w-3 h-3 inline mr-1" /> Пересіяти дефолти (націнка {draft.settings.materialMarkupPercent ?? 30}%):
          </span>
          <button onClick={() => runResync(tab, "material")} disabled={resyncing}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">Матеріали</button>
          <button onClick={() => runResync(tab, "work")} disabled={resyncing}
            className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold disabled:opacity-40">Роботи</button>
        </div>
      )}

      <div className="space-y-4">
        {tab === "screed" && SCREED_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields} disabled={disabled}
            getVal={(k) => draft.settings[k]} onChange={(k, v) => setDraftValue("settings", k, v)} />
        ))}
        {tab === "roofing" && ROOFING_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields} disabled={disabled}
            getVal={(k) => draft.roofingCoeffs[k]} onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
        ))}
        {tab === "insulation" && INSULATION_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields} disabled={disabled}
            getVal={(k) => draft.insulationCoeffs[k]} onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
        ))}
        {tab === "demolition" && DEMOLITION_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} fields={g.fields} disabled={disabled}
            getVal={(k) => draft.demolitionCoeffs[k]} onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
        ))}
        {tab === "common" && (
          <>
            <Group title="Стяжка — спільні (мін.чек, маржа, округлення, ФОП, ПДВ)" fields={COMMON_FIELDS} disabled={disabled}
              getVal={(k) => draft.settings[k]} onChange={(k, v) => setDraftValue("settings", k, v)} />
            <Group title="Покрівля — спільні" fields={COMMON_FIELDS} disabled={disabled}
              getVal={(k) => draft.roofingCoeffs[k]} onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
            <Group title="Утеплення — спільні" fields={COMMON_FIELDS} disabled={disabled}
              getVal={(k) => draft.insulationCoeffs[k]} onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
            <Group title="Демонтаж — спільні" fields={COMMON_FIELDS} disabled={disabled}
              getVal={(k) => draft.demolitionCoeffs[k]} onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
          </>
        )}
      </div>

      {importOpen && (
        <PriceImportDialog module={importOpen.module} kind={importOpen.kind} onClose={() => setImportOpen(null)} />
      )}
    </div>
  );
}
