/**
 * Адмін-екран: матриця марок стяжки М100–М300 (на 7 м³ = 100 м² × 7 см)
 * та тарифи робіт / логістики. Зберігається в БД (таблиця screed_config).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, RotateCcw, Undo2 } from "lucide-react";
import { NumberInput } from "@/components/NumberInput";
import { getScreedConfig, saveScreedConfig } from "@/lib/screed-config.functions";
import { SCREED_CONFIG_QUERY_KEY } from "@/lib/useScreedConfig";
import {
  DEFAULT_SCREED_CONFIG_PAYLOAD, SCREED_GRADE_LIST, GRADE_LABEL,
  type GradeRecipe, type ScreedConfigPayload, type ScreedGrade, type ScreedProductionConfig,
} from "@/lib/screed-grades";

type RecipeKey = keyof GradeRecipe;
const RECIPE_FIELDS: { key: RecipeKey; label: string; short: string; step: string }[] = [
  { key: "strengthMPa", label: "Орієнтир міцності, МПа", short: "МПа", step: "1" },
  { key: "sandTonsPer7m3", label: "Пісок, т / 7 м³", short: "Пісок, т", step: "0.1" },
  { key: "cementM500BagsPer7m3", label: "Цемент М500, міш. / 7 м³", short: "Ц. М500, міш.", step: "1" },
  { key: "cementM400BagsPer7m3", label: "Цемент М400, міш. / 7 м³", short: "Ц. М400, міш.", step: "1" },
  { key: "fiberPacksPer7m3", label: "Фібра, уп. / 7 м³", short: "Фібра, уп.", step: "1" },
  { key: "plasticizerLitersPer7m3", label: "Пластифікатор, л / 7 м³", short: "Пласт., л", step: "0.5" },
];

type CfgKey = keyof ScreedProductionConfig;
const CFG_GROUPS: { title: string; fields: { key: CfgKey; label: string; step?: string }[] }[] = [
  { title: "Закупівельні ціни (дефолти, якщо немає в каталозі)", fields: [
    { key: "sandPricePerTon", label: "Пісок, грн/т" },
    { key: "cementM400BagPrice", label: "Цемент М400, грн/міш." },
    { key: "cementM500BagPrice", label: "Цемент М500, грн/міш." },
    { key: "fiberPackPrice", label: "Фібра, грн/уп." },
    { key: "plasticizerPricePerL", label: "Пластифікатор, грн/л" },
    { key: "filmPricePerM2", label: "Плівка, грн/м²" },
    { key: "damperPricePerM", label: "Демпферна стрічка, грн/м.п." },
    { key: "dieselPricePerL", label: "Дизель, грн/л" },
  ]},
  { title: "Технологічні норми", fields: [
    { key: "dieselLitersPer100m2", label: "Дизель, л на 100 м²", step: "0.5" },
    { key: "filmCoef", label: "Коеф. плівки", step: "0.05" },
    { key: "cementBagKg", label: "Вага мішка цементу, кг", step: "1" },
    { key: "fiberPackKg", label: "Вага упаковки фібри, кг", step: "0.1" },
    { key: "baseThicknessCm", label: "Базова товщина, см", step: "0.5" },
  ]},
  { title: "Робота бригади", fields: [
    { key: "brigadeMinCost", label: "Мінімалка до 100 м², грн", step: "100" },
    { key: "brigadePerM2Over100", label: "Понад 100 м², грн/м²", step: "5" },
    { key: "cementUnloadPerBag", label: "Вивантаження цементу, грн/міш.", step: "1" },
    { key: "meshPerM2", label: "Армувальна сітка, грн/м²", step: "1" },
    { key: "slopePerM2", label: "Розуклонка, грн/м²", step: "1" },
    { key: "extraThicknessPerCmPerM2", label: "Доплата за см понад базу, грн/м²·см", step: "1" },
  ]},
  { title: "Логістика", fields: [
    { key: "stationDeliveryCost", label: "Доставка станції, грн", step: "50" },
    { key: "sandTruckCost", label: "Рейс піску (КамАЗ), грн", step: "50" },
    { key: "sandTruckCapacityTons", label: "Місткість КамАЗ, т", step: "1" },
    { key: "sandPurchaseStepTons", label: "Кратність закупівлі піску, т", step: "0.5" },
    { key: "cementDeliveryCost", label: "Доставка цементу, грн", step: "50" },
  ]},
];

const clone = (p: ScreedConfigPayload): ScreedConfigPayload => ({
  grades: Object.fromEntries(SCREED_GRADE_LIST.map((g) => [g, { ...p.grades[g] }])) as Record<ScreedGrade, GradeRecipe>,
  config: { ...p.config },
});

export function ScreedGradesAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getScreedConfig);
  const persist = useServerFn(saveScreedConfig);
  const query = useQuery({ queryKey: SCREED_CONFIG_QUERY_KEY, queryFn: () => load() });

  const saved = useMemo<ScreedConfigPayload>(() => {
    const p = query.data?.payload;
    return p
      ? { grades: { ...DEFAULT_SCREED_CONFIG_PAYLOAD.grades, ...p.grades }, config: { ...DEFAULT_SCREED_CONFIG_PAYLOAD.config, ...p.config } }
      : DEFAULT_SCREED_CONFIG_PAYLOAD;
  }, [query.data]);

  const [draft, setDraft] = useState<ScreedConfigPayload>(() => clone(saved));
  useEffect(() => { setDraft(clone(saved)); }, [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const mutation = useMutation({
    mutationFn: (payload: ScreedConfigPayload) => persist({ data: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SCREED_CONFIG_QUERY_KEY });
      toast.success("Матрицю марок і тарифи збережено. Калькулятор перераховано.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRecipe = (g: ScreedGrade, k: RecipeKey, v: number) =>
    setDraft((d) => ({ ...d, grades: { ...d.grades, [g]: { ...d.grades[g], [k]: v } } }));
  const setCfg = (k: CfgKey, v: number) =>
    setDraft((d) => ({ ...d, config: { ...d.config, [k]: v } }));

  const numberCls = "w-full min-h-[44px] bg-input border border-border rounded px-2 py-1 text-right text-sm";

  if (query.isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження налаштувань…</div>;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 panel px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {dirty ? <span className="text-primary font-semibold">● Є незбережені зміни</span> : "Без змін"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDraft(clone(saved))} disabled={!dirty}
            className="flex items-center gap-1 px-3 py-2 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
            <Undo2 className="w-3.5 h-3.5" /> Скасувати
          </button>
          <button onClick={() => setDraft(clone(DEFAULT_SCREED_CONFIG_PAYLOAD))} disabled={!canEdit}
            className="flex items-center gap-1 px-3 py-2 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
            <RotateCcw className="w-3.5 h-3.5" /> До дефолтів
          </button>
          <button onClick={() => mutation.mutate(draft)} disabled={!canEdit || !dirty || mutation.isPending}
            className="flex items-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">
            <Save className="w-3.5 h-3.5" /> Зберегти
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="panel p-4 text-sm text-muted-foreground">
          Перегляд доступний усім, редагування — лише адміністраторам і директорам.
        </div>
      )}

      <div className="panel p-4 md:p-5">
        <h3 className="text-xs uppercase tracking-widest text-primary font-bold mb-1">Матриця марок М100–М300</h3>
        <p className="text-xs text-muted-foreground mb-3">Норми задані на 7 м³ суміші (100 м² × 7 см) і масштабуються пропорційно об'єму.</p>

        {/* Десктоп / планшет — таблиця */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Показник</th>
                {SCREED_GRADE_LIST.map((g) => <th key={g} className="px-2 py-2 text-center">{GRADE_LABEL[g]}</th>)}
              </tr>
            </thead>
            <tbody>
              {RECIPE_FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-border/60">
                  <td className="px-2 py-2">{f.label}</td>
                  {SCREED_GRADE_LIST.map((g) => (
                    <td key={g} className="px-1 py-1.5">
                      <NumberInput step={f.step} className={numberCls} disabled={!canEdit}
                        value={draft.grades[g][f.key]} onChange={(v) => setRecipe(g, f.key, v)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Мобільний — картки по марках */}
        <div className="md:hidden space-y-3">
          {SCREED_GRADE_LIST.map((g) => (
            <div key={g} className="rounded-lg border border-border/60 p-3">
              <div className="text-sm font-black mb-2">{GRADE_LABEL[g]}</div>
              <div className="space-y-2">
                {RECIPE_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2">
                    <span className="min-w-0 text-sm leading-snug">{f.short}</span>
                    <NumberInput step={f.step} className={numberCls} disabled={!canEdit}
                      value={draft.grades[g][f.key]} onChange={(v) => setRecipe(g, f.key, v)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {CFG_GROUPS.map((group) => (
        <div key={group.title} className="panel p-4 md:p-5">
          <h3 className="text-xs uppercase tracking-widest text-primary font-bold mb-3">{group.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {group.fields.map((f) => (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
                <label className="min-w-0 text-sm leading-snug">{f.label}</label>
                <NumberInput step={f.step ?? "1"} className={numberCls} disabled={!canEdit}
                  value={draft.config[f.key]} onChange={(v) => setCfg(f.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
