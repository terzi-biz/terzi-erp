import { createFileRoute } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Save, Play, ChevronDown, ChevronRight,
  Copy, ArrowUp, ArrowDown, Download, Upload, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  listDirections, upsertDirection, deleteDirection, loadDefinition,
  upsertChild, deleteChild, type DirectionRow,
} from "@/lib/directions-repo";
import type { DirectionDefinition } from "@/lib/engines/direction-engine";
import { evaluateDirectionRuntime, type RuntimeDefinition } from "@/lib/directions/runtime";
import { evalFormula, tryEvalFormula } from "@/lib/engines/formula-eval";
import {
  listVersions, publishVersion, restoreVersion, diffConfigs,
  type DirectionVersionRow,
} from "@/lib/directions/versions";
import { formatUah } from "@/lib/screed-calc";

export const Route = createFileRoute("/directions-editor")({
  component: DirectionsAdmin,
});

type Tab = "general" | "fields" | "materials" | "works" | "logistics" | "services" | "formulas" | "coeffs" | "versions" | "preview";

const CATEGORIES = ["screed", "roofing", "insulation", "demolition", "finish", "other"] as const;

function DirectionsAdmin() {
  const [dirs, setDirs] = useState<DirectionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [def, setDef] = useState<RuntimeDefinition | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(false);

  const refreshList = async () => {
    const list = await listDirections();
    setDirs(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  };
  useEffect(() => { refreshList().catch((e) => toast.error(e.message)); }, []);

  useEffect(() => {
    if (!selectedId) { setDef(null); return; }
    setLoading(true);
    loadDefinition(selectedId).then(setDef).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [selectedId]);

  const reload = () => selectedId && loadDefinition(selectedId).then(setDef);

  const currentRow = dirs.find((d) => d.id === selectedId) || null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl md:text-3xl font-black">Конструктор напрямків</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            No-code редактор: створюйте нові калькулятори через поля, матеріали, роботи, логістику та формули.
          </p>
        </div>
        {def && <JsonIO def={def} onImported={reload} />}
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <DirectionList
          dirs={dirs} selectedId={selectedId} onSelect={setSelectedId}
          onCreated={async (id) => { await refreshList(); setSelectedId(id); }}
          onDeleted={async () => { await refreshList(); setSelectedId(null); }}
          onDuplicated={async (id) => { await refreshList(); setSelectedId(id); }}
        />
        <div className="min-w-0">
          {!currentRow && <div className="panel p-6 text-sm text-muted-foreground">Оберіть напрямок ліворуч або створіть новий.</div>}
          {currentRow && (
            <div className="space-y-3">
              <div className="flex gap-1 flex-wrap">
                {([
                  ["general", "Загальне"], ["fields", "Поля вводу"], ["materials", "Матеріали"],
                  ["works", "Роботи"], ["logistics", "Логістика"], ["services", "Дод. послуги"],
                  ["formulas", "Формули"], ["coeffs", "Коефіцієнти"], ["versions", "Версії"], ["preview", "Прев'ю"],
                ] as [Tab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)}
                    className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {loading && <div className="text-sm text-muted-foreground">Завантаження…</div>}

              {def && tab === "general" && <GeneralTab row={currentRow} onSaved={refreshList} />}
              {def && tab === "fields" && <FieldsTab def={def} onChange={reload} />}
              {def && tab === "materials" && <ItemsTab def={def} kind="materials" onChange={reload} />}
              {def && tab === "works" && <ItemsTab def={def} kind="works" onChange={reload} />}
              {def && tab === "logistics" && <ItemsTab def={def} kind="logistics" onChange={reload} />}
              {def && tab === "services" && <ItemsTab def={def} kind="services" onChange={reload} />}
              {def && tab === "formulas" && <FormulasTab def={def} onChange={reload} />}
              {def && tab === "coeffs" && <CoeffsTab def={def} onChange={reload} />}
              {def && tab === "versions" && <VersionsTab def={def} onChange={async () => { await reload(); await refreshList(); }} />}
              {def && tab === "preview" && <PreviewTab def={def} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectionList({ dirs, selectedId, onSelect, onCreated, onDeleted, onDuplicated }: {
  dirs: DirectionRow[]; selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
  onDuplicated: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [category, setCategory] = useState<string>("other");

  const create = async () => {
    if (!id || !name) { toast.error("Введіть slug та назву"); return; }
    try {
      await upsertDirection({ id, name, category, description: null, active: true });
      toast.success("Створено");
      setCreating(false); setName(""); setId("");
      onCreated(id);
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (rid: string) => {
    if (!confirm(`Видалити напрямок "${rid}"? Всі поля, матеріали, роботи, логістика теж видаляться.`)) return;
    try { await deleteDirection(rid); toast.success("Видалено"); onDeleted(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const duplicate = async (rid: string) => {
    const src = dirs.find((d) => d.id === rid);
    if (!src) return;
    const newId = prompt(`Дублювати "${src.name}" — введіть новий slug:`, `${rid}_copy`);
    if (!newId) return;
    const slug = newId.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    try {
      const full = await loadDefinition(rid);
      await upsertDirection({ id: slug, name: `${src.name} (копія)`, category: src.category, description: src.description, active: false });
      // Скопіювати дітей паралельно
      await Promise.all([
        ...full.fields.map((f) => upsertChild("input_fields", { ...(f as unknown as Record<string, unknown>), id: undefined, direction_id: slug })),
        ...full.materials.map((m) => upsertChild("material_items", { ...(m as unknown as Record<string, unknown>), id: undefined, direction_id: slug })),
        ...full.works.map((w) => upsertChild("work_items", { ...(w as unknown as Record<string, unknown>), id: undefined, direction_id: slug })),
        ...full.logistics.map((l) => upsertChild("logistics_items", { ...(l as unknown as Record<string, unknown>), id: undefined, direction_id: slug })),
        ...full.coefficients.map((c) => upsertChild("coefficients", { ...(c as unknown as Record<string, unknown>), id: undefined, direction_id: slug })),
      ]);
      toast.success("Дубльовано");
      onDuplicated(slug);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Напрямки ({dirs.length})</div>
        <button onClick={() => setCreating(!creating)} className="p-1 rounded hover:bg-accent" title="Створити"><Plus className="w-4 h-4" /></button>
      </div>
      {creating && (
        <div className="space-y-1 p-2 border border-border rounded bg-background">
          <input value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="slug (напр. mansard)" className="w-full bg-input border border-border rounded px-2 py-1 text-xs" />
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Назва" className="w-full bg-input border border-border rounded px-2 py-1 text-xs" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1 text-xs">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={create} className="w-full bg-primary text-primary-foreground py-1 rounded text-xs font-bold">Створити</button>
        </div>
      )}
      <div className="space-y-1 max-h-[70vh] overflow-y-auto">
        {dirs.map((d) => (
          <div key={d.id} className={`flex items-center gap-1 rounded ${selectedId === d.id ? "bg-primary/20" : "hover:bg-accent"}`}>
            <button onClick={() => onSelect(d.id)} className="flex-1 text-left px-2 py-1.5 min-w-0">
              <div className="text-sm font-semibold truncate">{d.name}</div>
              <div className="text-[10px] uppercase text-muted-foreground">{d.category} {!d.active && " · off"}</div>
            </button>
            <button onClick={() => duplicate(d.id)} className="p-1 opacity-40 hover:opacity-100" title="Дублювати"><Copy className="w-3 h-3" /></button>
            <button onClick={() => remove(d.id)} className="p-1 opacity-40 hover:opacity-100" title="Видалити"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonIO({ def, onImported }: { def: DirectionDefinition; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportJson = () => {
    const payload = {
      direction: { id: def.id, name: def.name, category: def.category },
      fields: def.fields, materials: def.materials, works: def.works,
      logistics: def.logistics, coefficients: def.coefficients,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `direction-${def.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const j = JSON.parse(text) as {
        materials?: unknown[]; works?: unknown[]; logistics?: unknown[];
        fields?: unknown[]; coefficients?: unknown[];
      };
      const jobs: Promise<unknown>[] = [];
      const push = (table: "input_fields" | "material_items" | "work_items" | "logistics_items" | "coefficients", arr?: unknown[]) => {
        for (const r of arr ?? []) jobs.push(upsertChild(table, { ...(r as Record<string, unknown>), id: undefined, direction_id: def.id }));
      };
      push("input_fields", j.fields);
      push("material_items", j.materials);
      push("work_items", j.works);
      push("logistics_items", j.logistics);
      push("coefficients", j.coefficients);
      await Promise.all(jobs);
      toast.success(`Імпортовано ${jobs.length} записів`);
      onImported();
    } catch (e) { toast.error(`Помилка імпорту: ${(e as Error).message}`); }
  };
  return (
    <div className="flex gap-2">
      <button onClick={exportJson} className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-1">
        <Download className="w-3 h-3" /> Експорт JSON
      </button>
      <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded bg-secondary text-xs font-semibold inline-flex items-center gap-1">
        <Upload className="w-3 h-3" /> Імпорт JSON
      </button>
      <input ref={fileRef} type="file" accept="application/json" className="hidden"
        onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
    </div>
  );
}

function GeneralTab({ row, onSaved }: { row: DirectionRow; onSaved: () => void }) {
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);
  const save = async () => {
    try { await upsertDirection(draft); toast.success("Збережено"); onSaved(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="panel p-4 space-y-3 max-w-xl">
      <Field label="ID (slug)"><input disabled value={draft.id} className="w-full bg-input border border-border rounded px-2 py-1 text-sm opacity-60" /></Field>
      <Field label="Назва"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className="w-full bg-input border border-border rounded px-2 py-1 text-sm" /></Field>
      <Field label="Категорія">
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Опис"><textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        className="w-full bg-input border border-border rounded px-2 py-1 text-sm" rows={2} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        Активний (доступний менеджерам)
      </label>
      <button onClick={save} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-bold flex items-center gap-2">
        <Save className="w-4 h-4" /> Зберегти
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}

// ------- Fields tab -------
interface FieldRow { id?: string; field_key: string; label: string; type: string; unit?: string | null;
  default_value?: unknown; enum_values?: unknown; help_text?: string | null; sort_order: number; }

function FieldsTab({ def, onChange }: { def: DirectionDefinition; onChange: () => void }) {
  const [rows, setRows] = useState<FieldRow[]>(def.fields as FieldRow[]);
  useEffect(() => setRows(def.fields as FieldRow[]), [def]);

  const add = () => setRows([...rows, { field_key: "", label: "", type: "number", unit: "", default_value: 0, sort_order: rows.length }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((r, idx) => (r.sort_order = idx));
    setRows(next);
  };
  const update = (i: number, patch: Partial<FieldRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const row = rows[i];
    if (row.id) { try { await deleteChild("input_fields", row.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const buildPayload = (r: FieldRow) => ({
    ...(r.id ? { id: r.id } : {}),
    direction_id: def.id,
    field_key: r.field_key, label: r.label, type: r.type,
    unit: r.unit || null,
    default_value: r.default_value ?? null,
    enum_values: r.enum_values ?? null,
    help_text: r.help_text || null,
    sort_order: r.sort_order,
  });
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.field_key || !r.label) { toast.error("Заповніть key та label"); return; }
    try { await upsertChild("input_fields", buildPayload(r)); toast.success("Збережено"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const saveAll = async () => {
    const invalid = rows.filter((r) => !r.field_key || !r.label);
    if (invalid.length) { toast.error(`${invalid.length} рядків без key/label`); return; }
    try { await Promise.all(rows.map((r) => upsertChild("input_fields", buildPayload(r)))); toast.success("Збережено всі"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">Для типу <code>select</code> вкажіть значення через кому у полі «Options».</div>
        <button onClick={saveAll} className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
          <Save className="w-3 h-3" /> Зберегти всі
        </button>
      </div>
      <table className="w-full text-xs min-w-[1000px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>№</Th><Th>key</Th><Th>Назва</Th><Th>Тип</Th><Th>Од.</Th><Th>Default / Options</Th><Th>Підказка</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `new-${i}`} className="border-b border-border/50">
              <Td>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="opacity-50 hover:opacity-100" title="Вгору"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => move(i, 1)} className="opacity-50 hover:opacity-100" title="Вниз"><ArrowDown className="w-3 h-3" /></button>
                </div>
              </Td>
              <Td><input value={r.field_key} onChange={(e) => update(i, { field_key: e.target.value })} className="input-xs w-28" /></Td>
              <Td><input value={r.label} onChange={(e) => update(i, { label: e.target.value })} className="input-xs w-40" /></Td>
              <Td>
                <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} className="input-xs w-24">
                  <option value="number">number</option><option value="select">select</option>
                  <option value="checkbox">checkbox</option><option value="text">text</option>
                </select>
              </Td>
              <Td><input value={r.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} className="input-xs w-16" /></Td>
              <Td>
                {r.type === "select" ? (
                  <input value={Array.isArray(r.enum_values) ? (r.enum_values as string[]).join(",") : ""}
                    onChange={(e) => update(i, { enum_values: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="a,b,c" className="input-xs w-32" />
                ) : (
                  <input value={String(r.default_value ?? "")} onChange={(e) => update(i, { default_value: e.target.value })} className="input-xs w-24" />
                )}
              </Td>
              <Td><input value={r.help_text ?? ""} onChange={(e) => update(i, { help_text: e.target.value })} className="input-xs w-48" /></Td>
              <Td>
                <div className="flex gap-1">
                  <button onClick={() => save(i)} className="p-1 rounded bg-primary text-primary-foreground" title="Зберегти"><Save className="w-3 h-3" /></button>
                  <button onClick={() => remove(i)} className="p-1 rounded bg-destructive text-destructive-foreground" title="Видалити"><Trash2 className="w-3 h-3" /></button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати поле</button>
      <FormulaVarsHint def={def} />
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
    </div>
  );
}

// ------- Items tab (materials/works/logistics/services) -------
type ItemsKind = "materials" | "works" | "logistics" | "services";
const KIND_TABLE: Record<ItemsKind, "material_items" | "work_items" | "logistics_items" | "additional_services"> = {
  materials: "material_items", works: "work_items", logistics: "logistics_items", services: "additional_services",
};

interface ItemRow { id?: string; code?: string | null; name: string; unit: string; cost_price: number;
  sale_coef_key?: string | null; formula: string; is_client_visible?: boolean; sort_order: number; }

function ItemsTab({ def, kind, onChange }: { def: RuntimeDefinition; kind: ItemsKind; onChange: () => void }) {
  const source = (def[kind] ?? []) as unknown[];

  const mapIn = (r: unknown): ItemRow => {
    const x = r as Record<string, unknown>;
    return {
      id: x.id as string | undefined,
      code: (x.code as string) ?? null,
      name: x.name as string,
      unit: x.unit as string,
      cost_price: Number(x.cost_price),
      sale_coef_key: (x.sale_coef_key as string) ?? null,
      formula: (x.consumption_formula as string) ?? (x.quantity_formula as string) ?? "",
      is_client_visible: (x.is_client_visible as boolean) ?? true,
      sort_order: (x.sort_order as number) ?? 0,
    };
  };
  const [rows, setRows] = useState<ItemRow[]>(source.map(mapIn));
  useEffect(() => setRows(source.map(mapIn)), [def, kind]);

  const add = () => setRows([...rows, { code: "", name: "", unit: "шт", cost_price: 0, sale_coef_key: "1.5", formula: "", is_client_visible: true, sort_order: rows.length }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((r, idx) => (r.sort_order = idx));
    setRows(next);
  };
  const update = (i: number, patch: Partial<ItemRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const r = rows[i];
    if (r.id) { try { await deleteChild(KIND_TABLE[kind], r.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const duplicate = (i: number) => {
    const r = rows[i];
    const copy: ItemRow = { ...r, id: undefined, name: `${r.name} (копія)`, sort_order: rows.length };
    setRows([...rows, copy]);
  };
  const buildPayload = (r: ItemRow) => {
    const formulaField = kind === "materials" ? "consumption_formula" : "quantity_formula";
    return {
      ...(r.id ? { id: r.id } : {}),
      direction_id: def.id,
      code: r.code || null, name: r.name, unit: r.unit, cost_price: r.cost_price,
      sale_coef_key: r.sale_coef_key || null,
      [formulaField]: r.formula || null,
      ...(kind !== "materials" ? { is_client_visible: r.is_client_visible ?? true } : {}),
      sort_order: r.sort_order,
    };
  };
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.name || !r.unit) { toast.error("Заповніть назву та од."); return; }
    try { await upsertChild(KIND_TABLE[kind], buildPayload(r)); toast.success("Збережено"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const saveAll = async () => {
    const invalid = rows.filter((r) => !r.name || !r.unit);
    if (invalid.length) { toast.error(`${invalid.length} рядків без назви/од.`); return; }
    try { await Promise.all(rows.map((r) => upsertChild(KIND_TABLE[kind], buildPayload(r)))); toast.success("Збережено всі"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const formulaLabel = kind === "materials" ? "Формула витрати" : "Формула кількості";

  // Тестовий контекст для валідації формул: field defaults + coeffs
  const testCtx = useMemo(() => {
    const inputs: Record<string, unknown> = {};
    for (const f of def.fields) {
      const d = f.default_value;
      inputs[f.field_key] = f.type === "number" ? Number(d ?? 1) : f.type === "checkbox" ? !!d : (d ?? "");
    }
    const coeffs: Record<string, number> = {};
    for (const c of def.coefficients) coeffs[c.coef_key] = Number(c.value);
    return { ...inputs, inputs, coeffs };
  }, [def]);

  return (
    <div className="panel p-3 overflow-x-auto">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground max-w-3xl">
          Змінні — <code>field_key</code> полів. Коефіцієнти — <code>coeffs.KEY</code>. Функції: <code>ceil, floor, round, min, max, abs, sqrt, pow, if(cond,a,b)</code>. Умова у ціні: залиште <code>Націнка/coef</code> порожнім для дефолту ×1.5, введіть число (<code>2.1</code>) або ключ коеф. (<code>markup_roof</code>).
        </div>
        <button onClick={saveAll} className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
          <Save className="w-3 h-3" /> Зберегти всі
        </button>
      </div>
      <table className="w-full text-xs min-w-[1100px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>№</Th><Th>code</Th><Th>Назва</Th><Th>Од.</Th><Th>Cost</Th><Th>Націнка/coef</Th><Th>{formulaLabel}</Th>
          {kind !== "materials" && <Th>Клієнту</Th>}<Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const check = tryEvalFormula(r.formula, testCtx);
            return (
              <tr key={r.id ?? `new-${i}`} className="border-b border-border/50">
                <Td>
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} className="opacity-50 hover:opacity-100" title="Вгору"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => move(i, 1)} className="opacity-50 hover:opacity-100" title="Вниз"><ArrowDown className="w-3 h-3" /></button>
                  </div>
                </Td>
                <Td><input value={r.code ?? ""} onChange={(e) => update(i, { code: e.target.value })} className="input-xs w-20" /></Td>
                <Td><input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="input-xs w-44" /></Td>
                <Td><input value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} className="input-xs w-14" /></Td>
                <Td><NumberInput step="0.01" value={r.cost_price} onChange={(v) => update(i, { cost_price: v })} className="input-xs w-20 text-right" /></Td>
                <Td><input value={r.sale_coef_key ?? ""} onChange={(e) => update(i, { sale_coef_key: e.target.value })} placeholder="1.5" className="input-xs w-20" /></Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <input value={r.formula} onChange={(e) => update(i, { formula: e.target.value })}
                      placeholder="area * 1.1"
                      className={`input-xs w-56 font-mono ${!check.ok ? "border-destructive" : ""}`} />
                    {r.formula && (check.ok
                      ? <span className="text-[10px] text-emerald-500 inline-flex items-center gap-0.5" title={`= ${check.value.toFixed(2)}`}><CheckCircle2 className="w-3 h-3" />{check.value.toFixed(1)}</span>
                      : <span className="text-[10px] text-destructive inline-flex items-center gap-0.5" title={check.error}><AlertCircle className="w-3 h-3" />err</span>
                    )}
                  </div>
                </Td>
                {kind !== "materials" && <Td><input type="checkbox" checked={r.is_client_visible ?? true} onChange={(e) => update(i, { is_client_visible: e.target.checked })} /></Td>}
                <Td>
                  <div className="flex gap-1">
                    <button onClick={() => save(i)} className="p-1 rounded bg-primary text-primary-foreground" title="Зберегти"><Save className="w-3 h-3" /></button>
                    <button onClick={() => duplicate(i)} className="p-1 rounded bg-secondary" title="Дублювати"><Copy className="w-3 h-3" /></button>
                    <button onClick={() => remove(i)} className="p-1 rounded bg-destructive text-destructive-foreground" title="Видалити"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати</button>
      <FormulaVarsHint def={def} />
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
    </div>
  );
}

function FormulaVarsHint({ def }: { def: DirectionDefinition }) {
  const vars = def.fields.map((f) => f.field_key);
  const coefs = def.coefficients.map((c) => `coeffs.${c.coef_key}`);
  if (!vars.length && !coefs.length) return null;
  return (
    <div className="mt-3 p-2 border border-border/50 rounded bg-background/40 text-[10px] text-muted-foreground">
      <div className="mb-1"><b>Змінні:</b> {vars.map((v) => <code key={v} className="mr-1 px-1 bg-secondary rounded">{v}</code>)}</div>
      {coefs.length > 0 && <div><b>Коефіцієнти:</b> {coefs.map((v) => <code key={v} className="mr-1 px-1 bg-secondary rounded">{v}</code>)}</div>}
    </div>
  );
}

// ------- Coefficients tab -------
interface CoefRow { id?: string; coef_group: string; coef_key: string; value: number; description?: string | null; }
function CoeffsTab({ def, onChange }: { def: DirectionDefinition; onChange: () => void }) {
  const [rows, setRows] = useState<CoefRow[]>(def.coefficients as CoefRow[]);
  useEffect(() => setRows(def.coefficients as CoefRow[]), [def]);

  const add = () => setRows([...rows, { coef_group: "general", coef_key: "", value: 1 }]);
  const update = (i: number, patch: Partial<CoefRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const r = rows[i];
    if (r.id) { try { await deleteChild("coefficients", r.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const buildPayload = (r: CoefRow) => ({ ...(r.id ? { id: r.id } : {}), direction_id: def.id, coef_group: r.coef_group, coef_key: r.coef_key, value: r.value, description: r.description || null });
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.coef_key) { toast.error("Введіть key"); return; }
    try { await upsertChild("coefficients", buildPayload(r)); toast.success("Збережено"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const saveAll = async () => {
    const bad = rows.filter((r) => !r.coef_key);
    if (bad.length) { toast.error(`${bad.length} рядків без key`); return; }
    try { await Promise.all(rows.map((r) => upsertChild("coefficients", buildPayload(r)))); toast.success("Збережено всі"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 overflow-x-auto">
      <div className="flex justify-end mb-2">
        <button onClick={saveAll} className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
          <Save className="w-3 h-3" /> Зберегти всі
        </button>
      </div>
      <table className="w-full text-xs min-w-[700px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>Група</Th><Th>Key</Th><Th>Значення</Th><Th>Опис</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `new-${i}`} className="border-b border-border/50">
              <Td><input value={r.coef_group} onChange={(e) => update(i, { coef_group: e.target.value })} className="input-xs w-28" /></Td>
              <Td><input value={r.coef_key} onChange={(e) => update(i, { coef_key: e.target.value })} className="input-xs w-32 font-mono" /></Td>
              <Td><NumberInput step="0.0001" value={r.value} onChange={(v) => update(i, { value: v })} className="input-xs w-24 text-right" /></Td>
              <Td><input value={r.description ?? ""} onChange={(e) => update(i, { description: e.target.value })} className="input-xs w-64" /></Td>
              <Td>
                <div className="flex gap-1">
                  <button onClick={() => save(i)} className="p-1 rounded bg-primary text-primary-foreground"><Save className="w-3 h-3" /></button>
                  <button onClick={() => remove(i)} className="p-1 rounded bg-destructive text-destructive-foreground"><Trash2 className="w-3 h-3" /></button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати коеф.</button>
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
    </div>
  );
}

// ------- Preview tab -------
function PreviewTab({ def }: { def: RuntimeDefinition }) {
  const initial = () => {
    const o: Record<string, unknown> = {};
    for (const f of def.fields) {
      const d = f.default_value;
      o[f.field_key] = f.type === "number" ? Number(d ?? 0) : f.type === "checkbox" ? !!d : (d ?? "");
    }
    return o;
  };
  const [inputs, setInputs] = useState<Record<string, unknown>>(initial);
  useEffect(() => setInputs(initial()), [def]);

  const result = useMemo(() => evaluateDirectionRuntime(def, inputs), [def, inputs]);
  const [showFormulas, setShowFormulas] = useState(false);

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="panel p-3 space-y-2">
        <div className="text-xs uppercase font-bold text-primary">Вхідні дані</div>
        {def.fields.length === 0 && <div className="text-xs text-muted-foreground">Немає полів. Додайте у вкладці «Поля вводу».</div>}
        {def.fields.map((f) => {
          const enumVals = Array.isArray(f.enum_values) ? (f.enum_values as string[]) : [];
          return (
            <div key={f.field_key} className="flex items-center gap-2">
              <label className="text-xs flex-1">{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
              {f.type === "checkbox" ? (
                <input type="checkbox" checked={!!inputs[f.field_key]}
                  onChange={(e) => setInputs({ ...inputs, [f.field_key]: e.target.checked })} />
              ) : f.type === "number" ? (
                <NumberInput value={Number(inputs[f.field_key] ?? 0)}
                  onChange={(v) => setInputs({ ...inputs, [f.field_key]: v })}
                  className="w-28 bg-input border border-border rounded px-2 py-1 text-sm text-right" />
              ) : f.type === "select" && enumVals.length ? (
                <select value={String(inputs[f.field_key] ?? "")}
                  onChange={(e) => setInputs({ ...inputs, [f.field_key]: e.target.value })}
                  className="w-40 bg-input border border-border rounded px-2 py-1 text-sm">
                  {enumVals.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={String(inputs[f.field_key] ?? "")}
                  onChange={(e) => setInputs({ ...inputs, [f.field_key]: e.target.value })}
                  className="w-40 bg-input border border-border rounded px-2 py-1 text-sm" />
              )}
            </div>
          );
        })}
        <button onClick={() => setShowFormulas(!showFormulas)}
          className="mt-3 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded">
          {showFormulas ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Дебаг формул
        </button>
        {showFormulas && (
          <div className="text-[10px] font-mono bg-background border border-border rounded p-2 space-y-1 max-h-64 overflow-y-auto">
            {[...def.materials.map((m) => ({ n: m.name, f: m.consumption_formula })),
              ...def.works.map((w) => ({ n: w.name, f: w.quantity_formula })),
              ...def.logistics.map((l) => ({ n: l.name, f: l.quantity_formula }))].map((x, i) => (
              <div key={i}>
                <span className="text-muted-foreground">{x.n}:</span> {x.f || "—"} = <span className="text-primary">{x.f ? evalFormula(x.f, result.ctx).toFixed(2) : "0"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel p-3 space-y-2">
        <div className="text-xs uppercase font-bold text-primary flex items-center gap-2">
          <Play className="w-3 h-3" /> Розрахунок
        </div>
        {(["materials", "works", "logistics", "services"] as const).map((block) => {
          const items = result.lines.filter((l) => l.block === block);
          if (items.length === 0) return null;
          const label = block === "materials" ? "Матеріали" : block === "works" ? "Роботи" : block === "logistics" ? "Логістика" : "Додаткові послуги";
          return (
            <div key={block}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-1">{label}</div>
              <table className="w-full text-xs">
                <tbody>
                  {items.map((l, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-1">{l.name}</td>
                      <td className="text-right text-muted-foreground">
                        {l.calcQty} {l.unit}
                        {l.packs != null && l.packs > 0 && (
                          <span className="ml-1 text-[10px]">(закупка {l.purchaseQty} {l.unit} = {l.packs} {l.packUnit || "уп."})</span>
                        )}
                      </td>
                      <td className="text-right">{formatUah(l.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="border-t border-border pt-2 mt-2 space-y-1 text-sm">
          <Row k="Матеріали" v={formatUah(result.totals.materialsSell)} />
          <Row k="Роботи" v={formatUah(result.totals.worksSell)} />
          <Row k="Логістика" v={formatUah(result.totals.logisticsSell)} />
          {result.totals.servicesSell > 0 && <Row k="Додаткові послуги" v={formatUah(result.totals.servicesSell)} />}
          <Row k="Разом клієнту" v={formatUah(result.totals.totalSell)} bold />
          <Row k="Собівартість" v={formatUah(result.totals.totalCost)} muted />
          <Row k="Валовий прибуток" v={formatUah(result.totals.grossProfit)} muted />
          <Row k="Маржа, %" v={result.totals.marginPercent.toFixed(1) + "%"} muted />
          <Row k="Рушій" v={result.engineVersion} muted />
        </div>
        {result.blocking.map((w, i) => <div key={`b${i}`} className="text-xs text-destructive">⛔ {w}</div>)}
        {result.warnings.map((w, i) => <div key={i} className="text-xs text-amber-500">⚠ {w}</div>)}
      </div>
    </div>
  );
}

function Row({ k, v, bold, muted }: { k: string; v: string; bold?: boolean; muted?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-primary" : ""} ${muted ? "text-muted-foreground text-xs" : ""}`}><span>{k}</span><span>{v}</span></div>;
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-2 py-1 font-semibold uppercase text-[10px] tracking-wider">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-2 py-1">{children}</td>; }

// ------- Formulas tab (Хвиля 3) -------
interface FormulaRow { id?: string; formula_key: string; expression: string; output_unit?: string | null; description?: string | null; }

function FormulasTab({ def, onChange }: { def: RuntimeDefinition; onChange: () => void }) {
  const [rows, setRows] = useState<FormulaRow[]>((def.formulas ?? []) as FormulaRow[]);
  useEffect(() => setRows((def.formulas ?? []) as FormulaRow[]), [def]);

  const testCtx = useMemo(() => {
    const inputs: Record<string, unknown> = {};
    for (const f of def.fields) {
      const d = f.default_value;
      inputs[f.field_key] = f.type === "number" ? Number(d ?? 1) : f.type === "checkbox" ? !!d : (d ?? "");
    }
    const coeffs: Record<string, number> = {};
    for (const c of def.coefficients) coeffs[c.coef_key] = Number(c.value);
    const derived: Record<string, number> = {};
    for (const r of rows) {
      const check = tryEvalFormula(r.expression, { ...inputs, inputs, coeffs, derived, ...derived });
      if (check.ok) derived[r.formula_key] = check.value;
    }
    return { ...inputs, inputs, coeffs, derived, ...derived };
  }, [def, rows]);

  const add = () => setRows([...rows, { formula_key: "", expression: "", output_unit: "" }]);
  const update = (i: number, patch: Partial<FormulaRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const r = rows[i];
    if (r.id) { try { await deleteChild("formulas", r.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const payload = (r: FormulaRow) => ({
    ...(r.id ? { id: r.id } : {}), direction_id: def.id,
    formula_key: r.formula_key, expression: r.expression,
    output_unit: r.output_unit || null, description: r.description || null,
  });
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.formula_key || !r.expression) { toast.error("Заповніть ключ та вираз"); return; }
    try { await upsertChild("formulas", payload(r)); toast.success("Збережено"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const saveAll = async () => {
    try { await Promise.all(rows.filter((r) => r.formula_key && r.expression).map((r) => upsertChild("formulas", payload(r)))); toast.success("Збережено всі"); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 overflow-x-auto">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground max-w-3xl">
          Проміжні формули доступні у виразах як <code>derived.KEY</code> або просто <code>KEY</code>.
          Дозволено: <code>+ − × ÷</code>, <code>ceil, floor, round, min, max, abs, sqrt, pow, if(cond,a,b)</code>. Без eval і без AI.
        </div>
        <button onClick={saveAll} className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
          <Save className="w-3 h-3" /> Зберегти всі
        </button>
      </div>
      <table className="w-full text-xs min-w-[760px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>Ключ</Th><Th>Вираз</Th><Th>Од.</Th><Th>Опис</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const check = tryEvalFormula(r.expression, testCtx);
            return (
              <tr key={r.id ?? `new-${i}`} className="border-b border-border/50">
                <Td><input value={r.formula_key} onChange={(e) => update(i, { formula_key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })} className="input-xs w-36 font-mono" /></Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <input value={r.expression} onChange={(e) => update(i, { expression: e.target.value })}
                      placeholder="area * coeffs.overlap" className={`input-xs w-72 font-mono ${r.expression && !check.ok ? "border-destructive" : ""}`} />
                    {r.expression && (check.ok
                      ? <span className="text-[10px] text-emerald-500 inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{check.value.toFixed(2)}</span>
                      : <span className="text-[10px] text-destructive inline-flex items-center gap-0.5" title={check.error}><AlertCircle className="w-3 h-3" />err</span>)}
                  </div>
                </Td>
                <Td><input value={r.output_unit ?? ""} onChange={(e) => update(i, { output_unit: e.target.value })} className="input-xs w-16" /></Td>
                <Td><input value={r.description ?? ""} onChange={(e) => update(i, { description: e.target.value })} className="input-xs w-48" /></Td>
                <Td>
                  <div className="flex gap-1">
                    <button onClick={() => save(i)} className="p-1 rounded bg-primary text-primary-foreground" title="Зберегти"><Save className="w-3 h-3" /></button>
                    <button onClick={() => remove(i)} className="p-1 rounded bg-destructive text-destructive-foreground" title="Видалити"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати формулу</button>
      <FormulaVarsHint def={def} />
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
    </div>
  );
}

// ------- Versions tab (Хвиля 3) -------
function VersionsTab({ def, onChange }: { def: RuntimeDefinition; onChange: () => void }) {
  const [versions, setVersions] = useState<DirectionVersionRow[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<string | null>(null);

  const load = async () => {
    try { setVersions(await listVersions(def.id)); } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { void load(); }, [def.id]);

  const publish = async () => {
    setBusy(true);
    try {
      const v = await publishVersion(def.id, note);
      toast.success(`Опубліковано версію v${v}`);
      setNote("");
      await load(); onChange();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const rollback = async (row: DirectionVersionRow) => {
    if (!confirm(`Відкатити чернетку до v${row.version}? Поточна чернетка буде перезаписана, опубліковані версії не змінюються.`)) return;
    setBusy(true);
    try { await restoreVersion(row); toast.success(`Чернетку відкатано до v${row.version}`); await load(); onChange(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const selected = versions.find((v) => v.id === compare) ?? null;
  const diff = useMemo(() => (selected ? diffConfigs(selected.config, def) : []), [selected, def]);

  return (
    <div className="space-y-3">
      <div className="panel p-4 space-y-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Публікація</div>
        <p className="text-xs text-muted-foreground">
          Публікація зберігає незмінний знімок конфігурації (поля, довідники, формули, коефіцієнти) з версією рушія.
          Збережені кошториси працюють на своїй версії — публікація їх не змінює.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Примітка до версії"
            className="flex-1 min-w-[200px] bg-input border border-border rounded px-2 py-1 text-sm" />
          <button onClick={publish} disabled={busy}
            className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 className="w-4 h-4" /> Опублікувати v{(versions[0]?.version ?? 0) + 1}
          </button>
        </div>
      </div>

      <div className="panel p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <Th>Версія</Th><Th>Дата</Th><Th>Рушій</Th><Th>Примітка</Th><Th>{" "}</Th>
          </tr></thead>
          <tbody>
            {versions.length === 0 && (
              <tr><Td>—</Td><Td>Ще немає опублікованих версій</Td><Td>{" "}</Td><Td>{" "}</Td><Td>{" "}</Td></tr>
            )}
            {versions.map((v) => (
              <tr key={v.id} className="border-b border-border/50">
                <Td><span className="font-bold">v{v.version}</span></Td>
                <Td>{new Date(v.published_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}</Td>
                <Td className="font-mono text-[10px]">{v.engine_version}</Td>
                <Td>{v.note ?? "—"}</Td>
                <Td>
                  <div className="flex gap-1">
                    <button onClick={() => setCompare(compare === v.id ? null : v.id)} className="px-2 py-1 rounded bg-secondary font-semibold">
                      {compare === v.id ? "Схвати" : "Порівняти з чернеткою"}
                    </button>
                    <button onClick={() => rollback(v)} disabled={busy} className="px-2 py-1 rounded bg-secondary font-semibold disabled:opacity-50">
                      Відкат
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="panel p-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">
            Зміни v{selected.version} → чернетка ({diff.length})
          </div>
          {diff.length === 0 && <div className="text-sm text-muted-foreground">Чернетка ідентична версії v{selected.version}.</div>}
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {diff.map((d, i) => (
              <div key={`${d.block}-${d.key}-${i}`} className="text-xs flex gap-2 border-b border-border/40 pb-1">
                <span className={`px-1.5 rounded font-bold shrink-0 ${
                  d.kind === "added" ? "bg-emerald-500/15 text-emerald-500"
                  : d.kind === "removed" ? "bg-destructive/15 text-destructive"
                  : "bg-amber-500/15 text-amber-500"}`}>
                  {d.kind === "added" ? "+" : d.kind === "removed" ? "−" : "~"}
                </span>
                <span className="font-semibold shrink-0">{d.block} · {d.key}</span>
                <span className="text-muted-foreground break-all">{d.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
