import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NumberInput } from "@/components/NumberInput";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, RotateCcw, Save, AlertTriangle, Pencil, Undo2 } from "lucide-react";
import { listCatalog, upsertCatalogItem, deleteCatalogItem, seedCatalogDefaults, resyncCatalogPrices,
  getTierMargins, applyTierMargin, setTierCellPrice, resetTierCell, resetTierColumnToSystem } from "@/lib/catalog.functions";
import { TIER_KEYS, TIER_LABEL, TIER_PRICE_COL, TIER_MANUAL_COL, DEFAULT_TIER_MARGIN, tierPriceFromMargin, type TierKey } from "@/lib/catalog-tiers";
import { toast } from "sonner";

type Module = "screed" | "roofing" | "insulation" | "demolition" | "common";
type Kind = "material" | "work" | "equipment" | "logistics";

interface Row {
  id?: string;
  module: Module;
  kind: Kind;
  code?: string | null;
  name: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  lifetime_months?: number | null;
  is_custom: boolean;
  is_active: boolean;
  sort_order: number;
  sell_price_t50?: number | null;
  sell_price_t100?: number | null;
  sell_price_t250?: number | null;
  sell_price_t500?: number | null;
  manual_t50?: boolean;
  manual_t100?: boolean;
  manual_t250?: boolean;
  manual_t500?: boolean;
}

const MODULE_LABEL: Record<Module, string> = {
  screed: "Стяжка", roofing: "Покрівля", insulation: "Утеплення", demolition: "Демонтаж", common: "Спільні",
};
const KIND_LABEL: Record<Kind, string> = {
  material: "Матеріали", work: "Роботи", equipment: "Обладнання", logistics: "Логістика",
};

function margin(buy: number, sell: number) {
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
}

const fmt = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(2));


export function CatalogPage({ module, kind }: { module: Module; kind: Kind }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCatalog);
  const upsert = useServerFn(upsertCatalogItem);
  const del = useServerFn(deleteCatalogItem);
  const seed = useServerFn(seedCatalogDefaults);
  const resync = useServerFn(resyncCatalogPrices);
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});

  const queryKey = ["catalog", module, kind];
  const { data: items = [], isLoading } = useQuery({
    queryKey, queryFn: () => fetchList({ data: { module, kind } }),
  });

  // ---- Ціни по діапазонах площі (нові колонки) ----
  const fetchMargins = useServerFn(getTierMargins);
  const applyMargin = useServerFn(applyTierMargin);
  const setCell = useServerFn(setTierCellPrice);
  const resetCell = useServerFn(resetTierCell);
  const resetColumn = useServerFn(resetTierColumnToSystem);
  const marginsKey = ["catalog-tier-margins", module, kind];
  const { data: tierMargins } = useQuery({
    queryKey: marginsKey, queryFn: () => fetchMargins({ data: { module, kind } }),
  });
  const marginOf = (t: TierKey) => Number(tierMargins?.[t] ?? DEFAULT_TIER_MARGIN[t]);
  const [draftMargin, setDraftMargin] = useState<Partial<Record<TierKey, number>>>({});
  const [preview, setPreview] = useState<TierKey | null>(null);
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: marginsKey });
  };
  const applyMut = useMutation({
    mutationFn: (p: { tier: TierKey; margin_percent: number }) =>
      applyMargin({ data: { module, kind, ...p } }),
    onSuccess: (r: { recalculated: number }, v) => {
      invalidateAll();
      setPreview(null);
      setDraftMargin((d) => { const c = { ...d }; delete c[v.tier]; return c; });
      toast.success(`Перераховано позицій: ${r.recalculated}`);
    },
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });
  const cellMut = useMutation({
    mutationFn: (p: { id: string; tier: TierKey; price: number }) => setCell({ data: p }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });
  const resetCellMut = useMutation({
    mutationFn: (p: { id: string; tier: TierKey }) => resetCell({ data: p }),
    onSuccess: () => { invalidateAll(); toast.success("Повернуто розрахунок по загальній маржі"); },
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });
  const resetColMut = useMutation({
    mutationFn: (tier: TierKey) => resetColumn({ data: { module, kind, tier } }),
    onSuccess: (r: { recalculated: number }) => { invalidateAll(); setPreview(null); toast.success(`Повернуто системні значення: ${r.recalculated}`); },
    onError: (e: Error) => toast.error("Помилка: " + e.message),
  });


  const saveMut = useMutation({
    mutationFn: (row: Row) => upsert({ data: row }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const seedMut = useMutation({
    mutationFn: () => seed({ data: { module, kind } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const resyncMut = useMutation({
    mutationFn: () => resync({ data: { module, kind, markupPercent: 30, updateSell: true, forceReplaceSystem: module === "roofing" && (kind === "material" || kind === "work") } }),
    onSuccess: (r: { updated: number; inserted: number; deleted?: number }) => {
      qc.invalidateQueries({ queryKey });
      toast.success(`Пересіяно з прайсу: оновлено ${r.updated}, додано ${r.inserted}, видалено старих ${r.deleted ?? 0}`);
    },
    onError: (e: Error) => toast.error("Помилка ресинку: " + e.message),
  });

  const onPatch = (id: string, patch: Partial<Row>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const onSaveRow = (row: Row) => {
    const patch = edits[row.id!];
    if (!patch) return;
    saveMut.mutate({ ...row, ...patch });
    setEdits((e) => { const c = { ...e }; delete c[row.id!]; return c; });
  };

  const dirtyIds = Object.keys(edits).filter((id) => Object.keys(edits[id] ?? {}).length > 0);
  const dirtyCount = dirtyIds.length;

  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveAll = async (opts?: { silent?: boolean }) => {
    if (!dirtyCount) return true;
    setSaving(true);
    try {
      const rows = (items as Row[]).filter((r) => dirtyIds.includes(r.id!));
      for (const r of rows) await upsert({ data: { ...r, ...edits[r.id!] } });
      setEdits((e) => {
        const c = { ...e };
        for (const r of rows) delete c[r.id!];
        return c;
      });
      await qc.invalidateQueries({ queryKey });
      setLastSavedAt(Date.now());
      if (!opts?.silent) toast.success(`Збережено змін: ${rows.length}`);
      return true;
    } catch (e) {
      toast.error("Помилка збереження: " + (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Debounced autosave — правки зберігаються самі через 1.5с після останнього вводу
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  useEffect(() => {
    if (!dirtyCount || saving) return;
    const t = setTimeout(() => { void saveAllRef.current({ silent: true }); }, 1500);
    return () => clearTimeout(t);
  }, [edits, dirtyCount, saving]);

  // Warn on route change / tab close when there are unsaved edits
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyCount > 0,
    enableBeforeUnload: () => dirtyCount > 0,
    withResolver: true,
  });

  useEffect(() => { setEdits({}); }, [module, kind]);


  const onAdd = () => {
    saveMut.mutate({
      module, kind, name: "Нова позиція", unit: kind === "equipment" ? "міс." : "шт",
      buy_price: 0, sell_price: 0, lifetime_months: kind === "equipment" ? 36 : null,
      is_custom: true, is_active: true, sort_order: items.length,
    });
  };

  const isEquip = kind === "equipment";


  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-border pb-4 mb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-2 rounded" />
          <h1 className="text-xl md:text-2xl font-black">{MODULE_LABEL[module]} · {KIND_LABEL[kind]}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {isEquip
              ? "Назва, вартість придбання, термін експлуатації, місячна амортизація для клієнта."
              : kind === "logistics"
              ? "Доставки, підйоми, вивіз сміття. Закупка / продаж — для маржинальності."
              : "Назва, одиниця, закупка, продаж, маржинальність. Можна додавати кастомні позиції."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {items.length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
              className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold inline-flex items-center gap-2">
              <RotateCcw className="w-3 h-3" /> Завантажити дефолти
            </button>
          )}
          <button
            onClick={() => confirm(module === "roofing" && (kind === "material" || kind === "work")
              ? "Примусово перезавантажити seed-и покрівлі з файлу? Старі системні позиції матеріалів/робіт будуть видалені, кастомні позиції залишаться."
              : "Пересіяти прайс з файлу? Замінить назви/ціни на несинхронізованих (не-кастомних) позиціях та додасть нові з прайсу.") && resyncMut.mutate()}
            disabled={resyncMut.isPending}
            className="px-3 py-2 rounded-md bg-warning/20 text-warning border border-warning/40 text-xs font-semibold inline-flex items-center gap-2"
            title="Оновлює каталог з актуального прайсу TERZI (Excel-файли), не чіпаючи кастомні позиції"
          >
            <RotateCcw className="w-3 h-3" /> {resyncMut.isPending ? "Синхронізація…" : module === "roofing" && (kind === "material" || kind === "work") ? "Reload seed-и" : "Пересіяти прайс"}
          </button>
          <button onClick={onAdd}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
            <Plus className="w-3 h-3" /> Додати
          </button>
          <button onClick={() => saveAll()} disabled={!dirtyCount || saving}
            className="px-3 py-2 rounded-md bg-success text-success-foreground text-xs font-bold inline-flex items-center gap-2 disabled:opacity-40">
            <Save className="w-3 h-3" /> {saving ? "Збереження…" : dirtyCount ? `Зберегти зміни (${dirtyCount})` : "Все збережено"}
          </button>
          <span className="text-[10px] text-muted-foreground self-center">
            {saving ? "Автозбереження…" : dirtyCount ? "Автозбереження за мить…" : lastSavedAt
              ? `Збережено о ${new Date(lastSavedAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Автозбереження увімкнено"}
          </span>



        </div>
      </div>

      {isLoading ? <div className="text-muted-foreground text-sm">Завантаження…</div> : (
        <div className="panel scroll-x max-h-[calc(100vh-220px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[1240px] sticky-thead">
            <thead className="bg-secondary text-xs uppercase tracking-wider">

              <tr>
                <th className="text-left p-3">Назва</th>
                <th className="text-left p-3 w-20">Од.</th>
                <th className="text-right p-3 w-28">{isEquip ? "Вартість" : "Закупка"}</th>
                <th className="text-right p-3 w-28">{isEquip ? "Амортиз./міс." : "Продаж"}</th>
                {isEquip && <th className="text-right p-3 w-20">Міс.</th>}
                <th className="text-right p-3 w-20">Маржа</th>
                <th className="text-center p-3 w-20">Тип</th>
                {TIER_KEYS.map((t) => {
                  const saved = marginOf(t);
                  const draft = draftMargin[t] ?? saved;
                  const changed = Math.abs(draft - saved) > 0.0001;
                  return (
                    <th key={t} className="p-2 w-40 align-top border-l border-border">
                      <div className="text-[10px] font-bold normal-case leading-tight">{TIER_LABEL[t]}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[9px] normal-case text-muted-foreground">Маржа, %</span>
                        <NumberInput step="1"
                          className="w-16 bg-input border border-border rounded px-1 py-0.5 text-right text-xs"
                          value={draft}
                          onChange={(v) => setDraftMargin((d) => ({ ...d, [t]: v }))} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button disabled={!changed} onClick={() => setPreview(t)}
                          className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-bold normal-case disabled:opacity-40">
                          Застосувати
                        </button>
                        <button disabled={!changed}
                          onClick={() => setDraftMargin((d) => { const c = { ...d }; delete c[t]; return c; })}
                          className="px-1.5 py-0.5 rounded bg-secondary text-[9px] font-semibold normal-case disabled:opacity-40">
                          Відмінити
                        </button>
                        <button
                          onClick={() => confirm(`Повернути системні значення для «${TIER_LABEL[t]}» (маржа ${DEFAULT_TIER_MARGIN[t]}%)?`) && resetColMut.mutate(t)}
                          className="px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/40 text-[9px] font-semibold normal-case">
                          Системні
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="p-3 w-20" />
              </tr>
            </thead>

            </thead>
            <tbody>
              {(items as Row[]).map((r) => {
                const patch = edits[r.id!] ?? {};
                const cur = { ...r, ...patch } as Row;
                const dirty = Object.keys(patch).length > 0;
                const m = margin(cur.buy_price, cur.sell_price);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">
                      <input className="w-full bg-input border border-border rounded px-2 py-1"
                        value={cur.name} onChange={(e) => onPatch(r.id!, { name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <input className="w-full bg-input border border-border rounded px-2 py-1"
                        value={cur.unit} onChange={(e) => onPatch(r.id!, { unit: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <NumberInput step="0.5" className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                        value={cur.buy_price} onChange={(v) => onPatch(r.id!, { buy_price: v })} />
                    </td>
                    <td className="p-2">
                      <NumberInput step="0.5" className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                        value={cur.sell_price} onChange={(v) => onPatch(r.id!, { sell_price: v })} />
                    </td>
                    {isEquip && (
                      <td className="p-2">
                        <NumberInput className="w-full bg-input border border-border rounded px-2 py-1 text-right"
                          value={cur.lifetime_months ?? 0}
                          onChange={(v) => onPatch(r.id!, { lifetime_months: v })} />
                      </td>
                    )}
                    <td className={`p-2 text-right font-bold ${m >= 30 ? "text-success" : m >= 15 ? "text-warning" : "text-destructive"}`}>
                      {m.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${cur.is_custom ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {cur.is_custom ? "Кастом" : "Сист."}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1 justify-end">
                        {dirty && (
                          <button onClick={() => onSaveRow(r)} title="Зберегти"
                            className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
                            <Save className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => confirm(`Видалити "${r.name}"?`) && delMut.mutate(r.id!)} title="Видалити"
                          className="p-1.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={isEquip ? 8 : 7} className="p-8 text-center text-muted-foreground">
                  Каталог порожній. Завантажте дефолти або додайте позицію.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dirtyCount > 0 && (
        <div className="sticky bottom-0 mt-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-xs font-semibold inline-flex items-center gap-2 text-warning">
            <AlertTriangle className="w-4 h-4" /> Незбережені зміни: {dirtyCount}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setEdits({})} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold">
              Скасувати зміни
            </button>
            <button onClick={() => saveAll()} disabled={saving}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-2">
              <Save className="w-3 h-3" /> {saving ? "Збереження…" : "Зберегти зміни"}
            </button>
          </div>
        </div>
      )}

      {blocker.status === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="panel max-w-sm w-full p-5 space-y-4 bg-card border border-border rounded-lg shadow-xl">
            <h2 className="font-black text-base">Незбережені зміни</h2>
            <p className="text-sm text-muted-foreground">
              У каталозі є {dirtyCount} незбережених змін. Зберегти перед переходом?
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => blocker.reset()} className="px-3 py-2 rounded-md bg-secondary text-xs font-semibold">
                Залишитись
              </button>
              <button onClick={() => { setEdits({}); blocker.proceed(); }}
                className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs font-semibold">
                Вийти без збереження
              </button>
              <button onClick={async () => { if (await saveAll()) blocker.proceed(); }} disabled={saving}
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold">
                {saving ? "Збереження…" : "Зберегти та вийти"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

