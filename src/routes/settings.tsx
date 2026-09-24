import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useEffect, useMemo } from "react";
import { Layers, Home as RoofIcon, Snowflake, Hammer, Sliders, Save, Undo2, RotateCcw, Upload, RefreshCw, Cable, Grid3x3, Building2, ListX, ShieldCheck, Settings2, Calculator, Wallet, Palette, Compass, ArrowLeftRight, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import { PriceImportDialog } from "@/components/PriceImportDialog";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resyncCatalogPrices } from "@/lib/catalog.functions";
import { getSettingsAccess, saveCalcSettings } from "@/lib/config-kernel/settings-center.functions";
import { useCalcSettings, CALC_SETTINGS_QUERY_KEY } from "@/lib/useCalcSettings";
import { DEFAULT_SETTINGS } from "@/lib/screed-calc";
import { DEFAULT_ROOFING_COEFFS } from "@/lib/roofing-calc";
import { DEFAULT_INSULATION_COEFFS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_COEFFS } from "@/lib/demolition-calc";
import { ScreedGradesAdmin } from "@/components/ScreedGradesAdmin";
import { RoofingNormsAdmin } from "@/components/RoofingNormsAdmin";
import { CloseReasonsAdmin, CompanyRequisitesAdmin } from "@/components/settings/ReferenceAdmin";
import { FinanceRulesAdmin } from "@/components/settings/FinanceRulesAdmin";
import { ControlCenterAdmin } from "@/components/settings/ControlCenterAdmin";
import { PayrollBridgePanel } from "@/components/settings/PayrollBridgePanel";

const SECTION_IDS = ["system", "calculators", "finance", "company", "access", "integrations"] as const;
const TAB_IDS = ["screed", "grades", "roofing", "roofing_norms", "insulation", "demolition", "common", "requisites", "reasons", "finance_rules", "payroll_bridge", "control_center"] as const;

export const Route = createFileRoute("/settings")({
  validateSearch: (s: Record<string, unknown>): { section?: Section; tab?: Tab } => ({
    section: (SECTION_IDS as readonly string[]).includes(String(s.section)) ? (s.section as Section) : undefined,
    tab: (TAB_IDS as readonly string[]).includes(String(s.tab)) ? (s.tab as Tab) : undefined,
  }),
  component: SettingsPage,
  head: () => ({ meta: [
    { title: "Налаштування TERZI ERP" },
    { name: "description", content: "Центр налаштувань TERZI ERP: конфігурація, калькулятори, фінанси, компанія, доступи й інтеграції." },
    { property: "og:title", content: "Налаштування TERZI ERP" },
    { property: "og:description", content: "Єдиний центр налаштувань TERZI ERP з company-wide параметрами калькуляторів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

type Tab = "screed" | "grades" | "roofing" | "roofing_norms" | "insulation" | "demolition" | "common" | "requisites" | "reasons" | "finance_rules" | "payroll_bridge" | "control_center";
type Section = "system" | "calculators" | "finance" | "company" | "access" | "integrations";

/** Вкладки з числовими налаштуваннями калькулятора (мають панель збереження). */
const CALC_TABS: Tab[] = ["screed", "roofing", "insulation", "demolition", "common"];

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

type Section_ = { id: Section; label: string; icon: typeof Layers; description: string; tabs: { id: Tab; label: string; icon: typeof Layers }[] };

const SECTIONS: Section_[] = [
  { id: "system", label: "Система і конфігурація", icon: Settings2, description: "Модулі, кастомні поля, довідники — чернетка → перегляд → публікація.",
    tabs: [{ id: "control_center", label: "Модулі, поля, довідники", icon: Grid3x3 }] },
  { id: "calculators", label: "Калькулятори", icon: Calculator, description: "Company-wide норми, коефіцієнти й амортизація. Зміни діють для всієї компанії.",
    tabs: [
      { id: "screed", label: "Стяжка", icon: Layers },
      { id: "grades", label: "Марки стяжки", icon: Grid3x3 },
      { id: "roofing", label: "Покрівля", icon: RoofIcon },
      { id: "roofing_norms", label: "Нормативи руберойду", icon: Grid3x3 },
      { id: "insulation", label: "Утеплення", icon: Snowflake },
      { id: "demolition", label: "Демонтаж", icon: Hammer },
      { id: "common", label: "Спільні", icon: Sliders },
    ] },
  { id: "finance", label: "Фінанси", icon: Wallet, description: "Фінансові правила та зв'язок із відомістю зарплати і KPI.",
    tabs: [
      { id: "finance_rules", label: "Фінансові правила", icon: Sliders },
      { id: "payroll_bridge", label: "Зарплата і KPI", icon: Cable },
    ] },
  { id: "company", label: "Компанія", icon: Building2, description: "Реквізити, причини закриття, брендинг і напрямки.",
    tabs: [
      { id: "requisites", label: "Реквізити ФОП", icon: Building2 },
      { id: "reasons", label: "Причини закриття", icon: ListX },
    ] },
  { id: "access", label: "Доступи і безпека", icon: ShieldCheck, description: "Користувачі, ролі, права, заявки і журнал дій — у розділі «Доступи».", tabs: [] },
  { id: "integrations", label: "Інтеграції", icon: Cable, description: "Підключення зовнішніх сервісів і обмін даними.", tabs: [] },
];

type HubTo = "/access" | "/integrations" | "/branding" | "/directions-editor" | "/data-exchange";
type SearchHit = { label: string; hint: string; keywords: string; section?: Section; tab?: Tab; to?: HubTo };
/** Лише реальні розділи/вкладки/маршрути Налаштувань — жодних вигаданих результатів. */
const SEARCH_INDEX: SearchHit[] = [
  ...SECTIONS.flatMap((s) => [
    { label: s.label, hint: "Розділ", keywords: `${s.label} ${s.description}`, section: s.id, tab: s.tabs[0]?.id },
    ...s.tabs.map((t) => ({ label: t.label, hint: s.label, keywords: `${t.label} ${s.label}`, section: s.id, tab: t.id })),
  ]),
  { label: "Control Center: модулі, поля, довідники", hint: "Система", keywords: "control center центр керування модулі поля довідники конфігурація", section: "system", tab: "control_center" },
  { label: "Доступи і ролі", hint: "/access", keywords: "доступи ролі права користувачі безпека access", to: "/access" },
  { label: "Інтеграції та API", hint: "/integrations", keywords: "інтеграції api binotel finmap google meta integrations", to: "/integrations" },
  { label: "Обмін даними", hint: "/data-exchange", keywords: "обмін даними імпорт експорт data exchange", to: "/data-exchange" },
  { label: "Брендинг", hint: "/branding", keywords: "брендинг бренд контакти branding", to: "/branding" },
  { label: "Напрямки", hint: "/directions-editor", keywords: "напрямки directions редактор", to: "/directions-editor" },
];

/** Групи полів, які скидає «До дефолтів» для відкритої вкладки калькулятора. */
const TAB_RESET: Partial<Record<Tab, { sec: DraftSection; keys?: string[] }[]>> = {
  screed: [{ sec: "settings", keys: SCREED_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  roofing: [{ sec: "roofingCoeffs", keys: ROOFING_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  insulation: [{ sec: "insulationCoeffs", keys: INSULATION_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  demolition: [{ sec: "demolitionCoeffs", keys: DEMOLITION_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) }],
  common: (["settings", "roofingCoeffs", "insulationCoeffs", "demolitionCoeffs"] as DraftSection[]).map((sec) => ({ sec, keys: COMMON_FIELDS.map((f) => f.key) })),
};

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

function HubLink({ to, title, description, icon: Icon, disabled, note }: {
  to: "/access" | "/integrations" | "/branding" | "/directions-editor" | "/data-exchange";
  title: string; description: string; icon: typeof Layers; disabled?: boolean; note?: string;
}) {
  const body = (
    <div className={`panel p-4 h-full flex items-start gap-3 ${disabled ? "opacity-60" : "hover:border-primary transition-colors"}`}>
      <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm flex items-center gap-1">{title} {!disabled && <ArrowRight className="w-3.5 h-3.5" />}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {note && <p className="text-xs text-muted-foreground mt-1 italic">{note}</p>}
      </div>
    </div>
  );
  return disabled ? body : <Link to={to} className="block">{body}</Link>;
}

function SettingsPage() {
  const accessFn = useServerFn(getSettingsAccess);
  const accessQ = useQuery({ queryKey: ["settings-access"], queryFn: () => accessFn(), staleTime: 60_000 });
  const canManageSettings = accessQ.data?.canManageSettings === true;
  const canManageAccess = accessQ.data?.canManageAccess === true;
  const canManageFinanceRules = accessQ.data?.canManageFinanceRules === true;

  const effective = useCalcSettings();
  const saveFn = useServerFn(saveCalcSettings);
  const [saving, setSaving] = useState(false);

  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/settings" });
  const section: Section = search.section ?? "system";
  const tab: Tab = search.tab ?? (SECTIONS.find((x) => x.id === section)?.tabs[0]?.id ?? "control_center");
  const go = (sec: Section, tb?: Tab) => navigate({ search: { section: sec, tab: tb } });
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState<null | { module: Tab; kind: "material" | "work" }>(null);
  const [resyncing, setResyncing] = useState(false);
  const resyncFn = useServerFn(resyncCatalogPrices);
  const qc = useQueryClient();

  const saved = useMemo(() => ({
    settings: effective.settings as unknown as Record<string, number>,
    roofingCoeffs: effective.roofingCoeffs as unknown as Record<string, number>,
    insulationCoeffs: effective.insulationCoeffs as unknown as Record<string, number>,
    demolitionCoeffs: effective.demolitionCoeffs as unknown as Record<string, number>,
  }), [effective.settings, effective.roofingCoeffs, effective.insulationCoeffs, effective.demolitionCoeffs]);
  const savedJson = JSON.stringify(saved);

  // Локальна чернетка лише для незбережених правок; джерело істини — центральна конфігурація.
  const [draft, setDraft] = useState(saved);
  useEffect(() => { setDraft(JSON.parse(savedJson)); }, [savedJson]);
  const dirty = JSON.stringify(draft) !== savedJson;

  // Незбережені правки калькуляторів: попередження при зміні розділу/вкладки чи виході з Налаштувань.
  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      const leave = window.confirm("Є незбережені зміни налаштувань калькуляторів. Відкинути їх і продовжити?");
      if (leave) setDraft(JSON.parse(savedJson));
      return !leave;
    },
    enableBeforeUnload: () => dirty,
  });

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

  const setDraftValue = (sec: DraftSection, key: string, value: number) => {
    setDraft((d) => ({ ...d, [sec]: { ...d[sec], [key]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const changed = (Object.keys(KERNEL_KEY) as DraftSection[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));
      for (const k of changed) await saveFn({ data: { key: KERNEL_KEY[k], values: draft[k] } });
      await qc.invalidateQueries({ queryKey: CALC_SETTINGS_QUERY_KEY });
      toast.success("Налаштування збережено для всієї компанії.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не вдалося зберегти налаштування");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => { setDraft(JSON.parse(savedJson)); toast("Зміни скасовано"); };
  /** Скидає до дефолтів рушія лише поля відкритої вкладки. */
  const toDefaults = () => {
    const groups = TAB_RESET[tab];
    if (!groups) return;
    setDraft((d) => {
      const next = { ...d };
      for (const { sec, keys } of groups) {
        const cur = { ...next[sec] };
        for (const k of keys ?? Object.keys(CALC_DEFAULTS[sec])) cur[k] = CALC_DEFAULTS[sec][k];
        next[sec] = cur;
      }
      return next;
    });
    toast("Дефолти підставлено для цієї вкладки — натисніть «Зберегти», щоб застосувати.");
  };
  /** Окрема явна дія: скинути всі калькулятори (з підтвердженням). */
  const allToDefaults = () => {
    if (!window.confirm("Скинути до дефолтів рушія УСІ калькулятори (стяжка, покрівля, утеплення, демонтаж, спільні)? Зміни набудуть чинності лише після «Зберегти».")) return;
    setDraft({
      settings: { ...CALC_DEFAULTS.settings }, roofingCoeffs: { ...CALC_DEFAULTS.roofingCoeffs },
      insulationCoeffs: { ...CALC_DEFAULTS.insulationCoeffs }, demolitionCoeffs: { ...CALC_DEFAULTS.demolitionCoeffs },
    });
    toast("Дефолти підставлено для всіх калькуляторів — натисніть «Зберегти».");
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
          <NumberInput step={f.step ?? "0.1"} disabled={!canManageSettings}
            className="w-28 md:w-32 bg-input border border-border rounded px-2 py-1 text-right text-sm disabled:opacity-60"
            value={getVal(f.key) ?? 0} onChange={(v) => onChange(f.key, v)} />
        </div>
      ))}
    </div>
  );

  const ActionsBar = (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 panel px-3 py-2 mb-4">
      <div className="text-xs text-muted-foreground">
        {!canManageSettings ? "Лише перегляд: потрібне право «Керування налаштуваннями»."
          : dirty ? <span className="text-primary font-semibold">● Є незбережені зміни</span> : "Збережено для всієї компанії"}
      </div>
      {canManageSettings && (
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
            Скинути всі калькулятори
          </button>
          <button onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">
            <Save className="w-3.5 h-3.5" /> {saving ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      )}
    </div>
  );

  const current = SECTIONS.find((s) => s.id === section)!;
  const pickSection = (s: Section_) => go(s.id, s.tabs[0]?.id);
  const hits = q.trim().length >= 2
    ? SEARCH_INDEX.filter((h) => h.keywords.toLowerCase().includes(q.trim().toLowerCase()) || h.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 10)
    : [];

  if (accessQ.isPending) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-3" aria-busy="true">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">{SECTIONS.map((s) => <div key={s.id} className="h-11 rounded-md bg-muted animate-pulse" />)}</div>
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }
  if (accessQ.isError) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="panel p-5 border-destructive">
          <h1 className="text-lg font-black">Не вдалося перевірити права доступу до Налаштувань</h1>
          <p className="text-sm text-muted-foreground mt-1">{accessQ.error instanceof Error ? accessQ.error.message : "Спробуйте ще раз."}</p>
          <button onClick={() => accessQ.refetch()} className="mt-3 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold">Повторити</button>
        </div>
      </div>
    );
  }
  const showCalcBar = section === "calculators" && CALC_TABS.includes(tab);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="hatch-accent h-1 w-16 mb-3 rounded" />
        <h1 className="text-2xl md:text-3xl font-black">Налаштування TERZI</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Центр налаштувань: конфігурація системи, калькулятори, фінанси, компанія, доступи та інтеграції.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук у налаштуваннях: розділ, вкладка, доступи, інтеграції…"
          className="w-full rounded-md border border-border bg-input pl-8 pr-3 py-2 text-sm" aria-label="Пошук у налаштуваннях" />
        {q.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full panel p-1 shadow-lg">
            {hits.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground">Нічого не знайдено</div> : hits.map((h, i) => (
              h.to
                ? <Link key={i} to={h.to} className="flex justify-between gap-2 px-3 py-2 rounded text-sm hover:bg-accent"><span>{h.label}</span><span className="text-xs text-muted-foreground">{h.hint}</span></Link>
                : <button key={i} type="button" onClick={() => { setQ(""); go(h.section!, h.tab); }} className="w-full flex justify-between gap-2 px-3 py-2 rounded text-sm text-left hover:bg-accent"><span>{h.label}</span><span className="text-xs text-muted-foreground">{h.hint}</span></button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => pickSection(s)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold text-left ${section === s.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
            <s.icon className="w-4 h-4 shrink-0" /> <span className="leading-tight">{s.label}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-3">{current.description}</p>

      {current.tabs.length > 1 && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          {current.tabs.map((tb) => (
            <button key={tb.id} onClick={() => go(section, tb.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${tab === tb.id ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>
              <tb.icon className="w-3.5 h-3.5" /> {tb.label}
            </button>
          ))}
        </div>
      )}

      {section === "access" && (
        <div className="grid md:grid-cols-2 gap-3">
          <HubLink to="/access" icon={ShieldCheck} title="Доступи і ролі"
            description="Співробітники, ролі та права, індивідуальні перекриття, заявки на реєстрацію, журнал дій, безпека."
            disabled={!canManageAccess}
            note={canManageAccess ? undefined : "Доступно власнику системи та операційному адміністратору."} />
        </div>
      )}

      {section === "integrations" && (
        <div className="grid md:grid-cols-2 gap-3">
          <HubLink to="/integrations" icon={Cable} title="Інтеграції та API"
            description="Binotel, Finmap, Google, Meta, месенджери: стан підключень, тест, синхронізація, журнали." />
          <HubLink to="/data-exchange" icon={ArrowLeftRight} title="Обмін даними"
            description="Імпорт і експорт даних ERP." />
        </div>
      )}

      {section === "company" && (
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <HubLink to="/branding" icon={Palette} title="Брендинг" description="Контакти, переваги й тексти для клієнтських кошторисів." />
          <HubLink to="/directions-editor" icon={Compass} title="Напрямки" description="Редактор напрямків робіт і їх версій." />
        </div>
      )}

      {showCalcBar && ActionsBar}

      {showCalcBar && tab !== "common" && canManageSettings && (
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

      {current.tabs.length > 0 && (
        <div className="space-y-4">
          {tab === "grades" && <ScreedGradesAdmin canEdit={canManageSettings} />}
          {tab === "roofing_norms" && <RoofingNormsAdmin canEdit={canManageSettings} />}
          {tab === "requisites" && <CompanyRequisitesAdmin canEdit={canManageSettings} />}
          {tab === "reasons" && <CloseReasonsAdmin canEdit={canManageSettings} />}
          {tab === "finance_rules" && <FinanceRulesAdmin canEdit={canManageFinanceRules} />}
          {tab === "payroll_bridge" && <PayrollBridgePanel />}
          {tab === "control_center" && <ControlCenterAdmin canEdit={canManageSettings} />}
          {tab === "screed" && SCREED_GROUPS.map((g) => (
            <Group key={g.title} title={g.title} fields={g.fields}
              getVal={(k) => draft.settings[k]} onChange={(k, v) => setDraftValue("settings", k, v)} />
          ))}
          {tab === "roofing" && ROOFING_GROUPS.map((g) => (
            <Group key={g.title} title={g.title} fields={g.fields}
              getVal={(k) => draft.roofingCoeffs[k]} onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
          ))}
          {tab === "insulation" && INSULATION_GROUPS.map((g) => (
            <Group key={g.title} title={g.title} fields={g.fields}
              getVal={(k) => draft.insulationCoeffs[k]} onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
          ))}
          {tab === "demolition" && DEMOLITION_GROUPS.map((g) => (
            <Group key={g.title} title={g.title} fields={g.fields}
              getVal={(k) => draft.demolitionCoeffs[k]} onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
          ))}
          {tab === "common" && (
            <>
              <Group title="Стяжка — спільні (мін.чек, маржа, округлення, ФОП, ПДВ)" fields={COMMON_FIELDS}
                getVal={(k) => draft.settings[k]} onChange={(k, v) => setDraftValue("settings", k, v)} />
              <Group title="Покрівля — спільні" fields={COMMON_FIELDS}
                getVal={(k) => draft.roofingCoeffs[k]} onChange={(k, v) => setDraftValue("roofingCoeffs", k, v)} />
              <Group title="Утеплення — спільні" fields={COMMON_FIELDS}
                getVal={(k) => draft.insulationCoeffs[k]} onChange={(k, v) => setDraftValue("insulationCoeffs", k, v)} />
              <Group title="Демонтаж — спільні" fields={COMMON_FIELDS}
                getVal={(k) => draft.demolitionCoeffs[k]} onChange={(k, v) => setDraftValue("demolitionCoeffs", k, v)} />
            </>
          )}
        </div>
      )}

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
