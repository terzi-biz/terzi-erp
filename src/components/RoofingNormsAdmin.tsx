/**
 * Адмін-екран: нормативи наплавної покрівлі (руберойд).
 * Зберігається в БД (таблиця roofing_config), потрапляє у знімок кошторису.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, RotateCcw, Undo2 } from "lucide-react";
import { NumberInput } from "@/components/NumberInput";
import { getRoofingConfig, saveRoofingConfig } from "@/lib/roofing-config.functions";
import { ROOFING_CONFIG_QUERY_KEY } from "@/lib/useRoofingNorms";
import {
  DEFAULT_ROOFING_NORMS, mergeNorms,
  type RoofingNorms, type RoofingConfigPayload,
} from "@/lib/roofing/norms";

type Key = keyof RoofingNorms;

const GROUPS: { title: string; hint?: string; fields: { key: Key; label: string; step?: string }[] }[] = [
  {
    title: "Режими та нахлисти",
    hint: "Коефіцієнт швидкого режиму застосовується ТІЛЬКИ у швидкій оцінці — у точному розкрої він не використовується.",
    fields: [
      { key: "quickCoef", label: "Коефіцієнт швидкого режиму TERZI", step: "0.01" },
      { key: "sideOverlapM", label: "Боковий нахлист, м", step: "0.01" },
      { key: "endOverlapM", label: "Торцевий нахлист, м", step: "0.01" },
      { key: "seamShiftM", label: "Мін. зміщення швів верхнього шару, м", step: "0.1" },
      { key: "defaultParapetHeightM", label: "Заведення на вертикаль за замовчуванням, м", step: "0.05" },
    ],
  },
  {
    title: "Праймер",
    hint: "Праймер рахується лише по фактично ґрунтованій площі.",
    fields: [
      { key: "primerLPerM2", label: "Витрата праймера, л/м²", step: "0.05" },
      { key: "primerBucketL", label: "Об'єм відра, л", step: "1" },
    ],
  },
  {
    title: "Газ",
    fields: [
      { key: "gasKgPerM2Bottom", label: "Нижній шар, кг/м²", step: "0.05" },
      { key: "gasKgPerM2Top", label: "Верхній шар, кг/м²", step: "0.05" },
      { key: "gasKgPerM2Vertical", label: "Вертикаль (парапети), кг/м²", step: "0.05" },
      { key: "gasKgPerM2Drying", label: "Просушка основи, кг/м²", step: "0.05" },
      { key: "gasKgPerM2Repair", label: "Локальний ремонт, кг/м²", step: "0.05" },
      { key: "gasKgPerNode", label: "Вузлова точка, кг/шт", step: "0.05" },
      { key: "gasCylinderKg", label: "Маса балона, кг", step: "1" },
    ],
  },
  {
    title: "Розкрій та залишки",
    fields: [
      { key: "minUsableOffcutM", label: "Мін. корисна довжина залишку, м", step: "0.1" },
    ],
  },
  {
    title: "Логістика",
    fields: [
      { key: "rollsPerPallet", label: "Рулонів на палеті, шт", step: "1" },
      { key: "palletCapacityKg", label: "Місткість палети, кг", step: "50" },
    ],
  },
  {
    title: "Трудомісткість і округлення",
    fields: [
      { key: "laborHoursPerM2", label: "Люд.-год на 1 м²", step: "0.01" },
      { key: "laborHoursPerNodeM", label: "Люд.-год на 1 п.м вузла", step: "0.01" },
      { key: "laborHoursPerPoint", label: "Люд.-год на точку (воронка/аератор)", step: "0.1" },
      { key: "roundStep", label: "Крок округлення ціни, грн", step: "1" },
    ],
  },
];

export function RoofingNormsAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getRoofingConfig);
  const persist = useServerFn(saveRoofingConfig);
  const query = useQuery({ queryKey: ROOFING_CONFIG_QUERY_KEY, queryFn: () => load() });

  const saved = useMemo<RoofingNorms>(() => mergeNorms(query.data?.payload?.norms), [query.data]);
  const [draft, setDraft] = useState<RoofingNorms>(() => ({ ...saved }));
  useEffect(() => { setDraft({ ...saved }); }, [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const mutation = useMutation({
    mutationFn: (norms: RoofingNorms) => persist({ data: { norms } as RoofingConfigPayload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOFING_CONFIG_QUERY_KEY });
      toast.success("Нормативи покрівлі збережено. Калькулятор перераховано.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const numberCls = "w-full min-h-[44px] bg-input border border-border rounded px-2 py-1 text-right text-sm";

  if (query.isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження нормативів…</div>;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 panel px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {dirty ? <span className="text-primary font-semibold">● Є незбережені зміни</span> : "Без змін"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDraft({ ...saved })} disabled={!dirty}
            className="flex items-center gap-1 px-3 py-2 rounded bg-secondary text-xs font-semibold disabled:opacity-40">
            <Undo2 className="w-3.5 h-3.5" /> Скасувати
          </button>
          <button onClick={() => setDraft({ ...DEFAULT_ROOFING_NORMS })} disabled={!canEdit}
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

      {GROUPS.map((group) => (
        <div key={group.title} className="panel p-4 md:p-5">
          <h3 className="text-xs uppercase tracking-widest text-primary font-bold mb-1">{group.title}</h3>
          {group.hint && <p className="text-xs text-muted-foreground mb-3">{group.hint}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {group.fields.map((f) => (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
                <label className="min-w-0 text-sm leading-snug">{f.label}</label>
                <NumberInput step={f.step ?? "1"} className={numberCls} disabled={!canEdit}
                  value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
