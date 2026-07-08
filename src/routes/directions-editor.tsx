import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Play, ChevronDown, ChevronRight } from "lucide-react";
import {
  listDirections, upsertDirection, deleteDirection, loadDefinition,
  upsertChild, deleteChild, type DirectionRow,
} from "@/lib/directions-repo";
import { evaluateDirection, type DirectionDefinition } from "@/lib/engines/direction-engine";
import { evalFormula } from "@/lib/engines/formula-eval";
import { formatUah } from "@/lib/screed-calc";

export const Route = createFileRoute("/directions-editor")({
  component: DirectionsAdmin,
});

type Tab = "general" | "fields" | "materials" | "works" | "logistics" | "coeffs" | "preview";

const CATEGORIES = ["screed", "roofing", "insulation", "demolition", "finish", "other"] as const;

function DirectionsAdmin() {
  const [dirs, setDirs] = useState<DirectionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [def, setDef] = useState<DirectionDefinition | null>(null);
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
      <div className="mb-6">
        <div className="hatch-accent h-1 w-16 mb-3 rounded" />
        <h1 className="text-2xl md:text-3xl font-black">Конструктор напрямків</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          No-code редактор: створюйте нові калькулятори через поля, матеріали, роботи, логістику та формули.
        </p>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <DirectionList
          dirs={dirs} selectedId={selectedId} onSelect={setSelectedId}
          onCreated={async (id) => { await refreshList(); setSelectedId(id); }}
          onDeleted={async () => { await refreshList(); setSelectedId(null); }}
        />
        <div className="min-w-0">
          {!currentRow && <div className="panel p-6 text-sm text-muted-foreground">Оберіть напрямок ліворуч або створіть новий.</div>}
          {currentRow && (
            <div className="space-y-3">
              <div className="flex gap-1 flex-wrap">
                {([
                  ["general", "Загальне"], ["fields", "Поля вводу"], ["materials", "Матеріали"],
                  ["works", "Роботи"], ["logistics", "Логістика"], ["coeffs", "Коефіцієнти"], ["preview", "Прев'ю"],
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
              {def && tab === "coeffs" && <CoeffsTab def={def} onChange={reload} />}
              {def && tab === "preview" && <PreviewTab def={def} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectionList({ dirs, selectedId, onSelect, onCreated, onDeleted }: {
  dirs: DirectionRow[]; selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
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

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Напрямки</div>
        <button onClick={() => setCreating(!creating)} className="p-1 rounded hover:bg-accent"><Plus className="w-4 h-4" /></button>
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
            <button onClick={() => remove(d.id)} className="p-1 opacity-40 hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
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
  default_value?: unknown; help_text?: string | null; sort_order: number; }

function FieldsTab({ def, onChange }: { def: DirectionDefinition; onChange: () => void }) {
  const [rows, setRows] = useState<FieldRow[]>(def.fields as FieldRow[]);
  useEffect(() => setRows(def.fields as FieldRow[]), [def]);

  const add = () => setRows([...rows, { field_key: "", label: "", type: "number", unit: "", default_value: 0, sort_order: rows.length }]);
  const update = (i: number, patch: Partial<FieldRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const row = rows[i];
    if (row.id) { try { await deleteChild("input_fields", row.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.field_key || !r.label) { toast.error("Заповніть key та label"); return; }
    try {
      await upsertChild("input_fields", {
        ...(r.id ? { id: r.id } : {}),
        direction_id: def.id,
        field_key: r.field_key, label: r.label, type: r.type,
        unit: r.unit || null, default_value: r.default_value ?? null,
        help_text: r.help_text || null, sort_order: r.sort_order,
      });
      toast.success("Збережено"); onChange();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>key</Th><Th>Назва</Th><Th>Тип</Th><Th>Од.</Th><Th>Default</Th><Th>Підказка</Th><Th>№</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <Td><input value={r.field_key} onChange={(e) => update(i, { field_key: e.target.value })} className="input-xs w-28" /></Td>
              <Td><input value={r.label} onChange={(e) => update(i, { label: e.target.value })} className="input-xs w-40" /></Td>
              <Td>
                <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} className="input-xs w-24">
                  <option value="number">number</option><option value="select">select</option>
                  <option value="checkbox">checkbox</option><option value="text">text</option>
                </select>
              </Td>
              <Td><input value={r.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} className="input-xs w-16" /></Td>
              <Td><input value={String(r.default_value ?? "")} onChange={(e) => update(i, { default_value: e.target.value })} className="input-xs w-20" /></Td>
              <Td><input value={r.help_text ?? ""} onChange={(e) => update(i, { help_text: e.target.value })} className="input-xs w-48" /></Td>
              <Td><input type="number" value={r.sort_order} onChange={(e) => update(i, { sort_order: +e.target.value })} className="input-xs w-14" /></Td>
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
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати поле</button>
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
    </div>
  );
}

// ------- Items tab (materials/works/logistics) -------
type ItemsKind = "materials" | "works" | "logistics";
const KIND_TABLE: Record<ItemsKind, "material_items" | "work_items" | "logistics_items"> = {
  materials: "material_items", works: "work_items", logistics: "logistics_items",
};

interface ItemRow { id?: string; code?: string | null; name: string; unit: string; cost_price: number;
  sale_coef_key?: string | null; formula: string; is_client_visible?: boolean; sort_order: number; }

function ItemsTab({ def, kind, onChange }: { def: DirectionDefinition; kind: ItemsKind; onChange: () => void }) {
  const source = def[kind];
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
  const update = (i: number, patch: Partial<ItemRow>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = async (i: number) => {
    const r = rows[i];
    if (r.id) { try { await deleteChild(KIND_TABLE[kind], r.id); toast.success("Видалено"); onChange(); } catch (e) { toast.error((e as Error).message); } }
    setRows(rows.filter((_, idx) => idx !== i));
  };
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.name || !r.unit) { toast.error("Заповніть назву та од."); return; }
    const formulaField = kind === "materials" ? "consumption_formula" : "quantity_formula";
    try {
      await upsertChild(KIND_TABLE[kind], {
        ...(r.id ? { id: r.id } : {}),
        direction_id: def.id,
        code: r.code || null, name: r.name, unit: r.unit, cost_price: r.cost_price,
        sale_coef_key: r.sale_coef_key || null,
        [formulaField]: r.formula || null,
        ...(kind !== "materials" ? { is_client_visible: r.is_client_visible ?? true } : {}),
        sort_order: r.sort_order,
      });
      toast.success("Збережено"); onChange();
    } catch (e) { toast.error((e as Error).message); }
  };

  const formulaLabel = kind === "materials" ? "Формула витрати" : "Формула кількості";

  return (
    <div className="panel p-3 overflow-x-auto">
      <div className="text-xs text-muted-foreground mb-2">
        Формули: змінні — це <code>field_key</code> полів вводу; коефіцієнти — <code>coeffs.KEY</code>. Функції: <code>ceil, floor, round, min, max, abs, if(cond,a,b)</code>. Приклад: <code>ceil(area * 1.1)</code>, <code>if(withGrind, area, 0)</code>.
      </div>
      <table className="w-full text-xs min-w-[1000px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>code</Th><Th>Назва</Th><Th>Од.</Th><Th>Cost</Th><Th>Націнка/coef</Th><Th>{formulaLabel}</Th>
          {kind !== "materials" && <Th>Клієнту</Th>}<Th>№</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <Td><input value={r.code ?? ""} onChange={(e) => update(i, { code: e.target.value })} className="input-xs w-20" /></Td>
              <Td><input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="input-xs w-44" /></Td>
              <Td><input value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} className="input-xs w-14" /></Td>
              <Td><input type="number" step="0.01" value={r.cost_price} onChange={(e) => update(i, { cost_price: +e.target.value })} className="input-xs w-20 text-right" /></Td>
              <Td><input value={r.sale_coef_key ?? ""} onChange={(e) => update(i, { sale_coef_key: e.target.value })} placeholder="1.5" className="input-xs w-20" /></Td>
              <Td><input value={r.formula} onChange={(e) => update(i, { formula: e.target.value })} placeholder="area * 1.1" className="input-xs w-60 font-mono" /></Td>
              {kind !== "materials" && <Td><input type="checkbox" checked={r.is_client_visible ?? true} onChange={(e) => update(i, { is_client_visible: e.target.checked })} /></Td>}
              <Td><input type="number" value={r.sort_order} onChange={(e) => update(i, { sort_order: +e.target.value })} className="input-xs w-14" /></Td>
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
      <button onClick={add} className="mt-2 flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded"><Plus className="w-3 h-3" /> Додати</button>
      <style>{`.input-xs{background:var(--input,#111);border:1px solid var(--border,#333);border-radius:4px;padding:2px 6px;font-size:12px}`}</style>
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
  const save = async (i: number) => {
    const r = rows[i];
    if (!r.coef_key) { toast.error("Введіть key"); return; }
    try {
      await upsertChild("coefficients", { ...(r.id ? { id: r.id } : {}), direction_id: def.id, coef_group: r.coef_group, coef_key: r.coef_key, value: r.value, description: r.description || null });
      toast.success("Збережено"); onChange();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel p-3 overflow-x-auto">
      <table className="w-full text-xs min-w-[700px]">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <Th>Група</Th><Th>Key</Th><Th>Значення</Th><Th>Опис</Th><Th>{" "}</Th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <Td><input value={r.coef_group} onChange={(e) => update(i, { coef_group: e.target.value })} className="input-xs w-28" /></Td>
              <Td><input value={r.coef_key} onChange={(e) => update(i, { coef_key: e.target.value })} className="input-xs w-32 font-mono" /></Td>
              <Td><input type="number" step="0.0001" value={r.value} onChange={(e) => update(i, { value: +e.target.value })} className="input-xs w-24 text-right" /></Td>
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
function PreviewTab({ def }: { def: DirectionDefinition }) {
  const [inputs, setInputs] = useState<Record<string, unknown>>(() => {
    const o: Record<string, unknown> = {};
    for (const f of def.fields) {
      const d = f.default_value;
      o[f.field_key] = f.type === "number" ? Number(d ?? 0) : f.type === "checkbox" ? !!d : (d ?? "");
    }
    return o;
  });
  useEffect(() => {
    const o: Record<string, unknown> = {};
    for (const f of def.fields) {
      const d = f.default_value;
      o[f.field_key] = f.type === "number" ? Number(d ?? 0) : f.type === "checkbox" ? !!d : (d ?? "");
    }
    setInputs(o);
  }, [def]);

  const result = useMemo(() => evaluateDirection(def, inputs), [def, inputs]);
  const [showFormulas, setShowFormulas] = useState(false);

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="panel p-3 space-y-2">
        <div className="text-xs uppercase font-bold text-primary">Вхідні дані</div>
        {def.fields.length === 0 && <div className="text-xs text-muted-foreground">Немає полів. Додайте у вкладці «Поля вводу».</div>}
        {def.fields.map((f) => (
          <div key={f.field_key} className="flex items-center gap-2">
            <label className="text-xs flex-1">{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
            {f.type === "checkbox" ? (
              <input type="checkbox" checked={!!inputs[f.field_key]}
                onChange={(e) => setInputs({ ...inputs, [f.field_key]: e.target.checked })} />
            ) : f.type === "number" ? (
              <input type="number" value={Number(inputs[f.field_key] ?? 0)}
                onChange={(e) => setInputs({ ...inputs, [f.field_key]: +e.target.value })}
                className="w-28 bg-input border border-border rounded px-2 py-1 text-sm text-right" />
            ) : (
              <input value={String(inputs[f.field_key] ?? "")}
                onChange={(e) => setInputs({ ...inputs, [f.field_key]: e.target.value })}
                className="w-40 bg-input border border-border rounded px-2 py-1 text-sm" />
            )}
          </div>
        ))}
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
        {(["materials", "works", "logistics"] as const).map((block) => {
          const items = result.lines.filter((l) => l.block === block);
          if (items.length === 0) return null;
          const label = block === "materials" ? "Матеріали" : block === "works" ? "Роботи" : "Логістика";
          return (
            <div key={block}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-1">{label}</div>
              <table className="w-full text-xs">
                <tbody>
                  {items.map((l, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-1">{l.name}</td>
                      <td className="text-right text-muted-foreground">{l.qty} {l.unit}</td>
                      <td className="text-right">{formatUah(l.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="border-t border-border pt-2 mt-2 space-y-1 text-sm">
          <Row k="Матеріали" v={formatUah(result.materialsSell)} />
          <Row k="Роботи" v={formatUah(result.worksSell)} />
          <Row k="Логістика" v={formatUah(result.logisticsSell)} />
          <Row k="Разом клієнту" v={formatUah(result.totalSell)} bold />
          <Row k="Собівартість" v={formatUah(result.totalCost)} muted />
          <Row k="Валовий прибуток" v={formatUah(result.grossProfit)} muted />
          <Row k="Маржа, %" v={result.marginPercent.toFixed(1) + "%"} muted />
        </div>
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
