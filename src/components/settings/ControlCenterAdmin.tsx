/**
 * Settings Control Center (Wave 2): модулі, сутності й поля, довідники.
 * Усі зміни — через config kernel: чернетка → перегляд змін → публікація.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Archive, Eye, Send, Save, Trash2, Boxes, Database, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveConfigDraft, previewConfigDraft, publishConfig } from "@/lib/config-kernel/config.functions";
import { listConfigAdmin, discardConfigDraft, type AdminConfigRow } from "@/lib/config-kernel/control-plane.functions";
import { TERZI_MODULES } from "@/lib/modules";
import { ENTITIES } from "@/lib/config-kernel/registries";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABEL, customKeyCollision, FIELD_KEY_RE, formulaSyntaxError, type CustomFieldEntity } from "@/lib/config-kernel/custom-fields";
import { EXTERNAL_DICTIONARIES } from "@/lib/config-kernel/dictionaries";

const SCOPE = { type: "company" as const, id: "terzi" };
type Kind = "module_overlay" | "custom_field" | "dictionary";
type Section = "modules" | "fields" | "dictionaries";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function useKind(kind: Kind) {
  const fn = useServerFn(listConfigAdmin);
  return useQuery({ queryKey: ["config-admin", kind], queryFn: () => fn({ data: { kind } }) });
}

/** Поточний стан ключа: чернетка (якщо є) поверх опублікованого. */
function byKey(rows: AdminConfigRow[] | undefined) {
  const m = new Map<string, { draft?: AdminConfigRow; published?: AdminConfigRow }>();
  for (const r of rows ?? []) {
    if (r.scope_type !== SCOPE.type || r.scope_id !== SCOPE.id) continue;
    const e = m.get(r.key) ?? {};
    if (r.status === "draft") e.draft = r; else e.published = r;
    m.set(r.key, e);
  }
  return m;
}

function StatusBadge({ e }: { e?: { draft?: AdminConfigRow; published?: AdminConfigRow } }) {
  if (!e) return <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">код за замовчуванням</span>;
  return (
    <span className="flex gap-1">
      {e.published && <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">опубл. v{e.published.version}</span>}
      {e.draft && <span className="text-[10px] rounded bg-accent px-1.5 py-0.5 text-accent-foreground">чернетка v{e.draft.version}</span>}
    </span>
  );
}

/** Панель дій ключа: зберегти чернетку, перегляд diff, публікація, скасування. */
function Lifecycle({ kind, cfgKey, payload, hasDraft, onDone }: { kind: Kind; cfgKey: string; payload: unknown; hasDraft: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveConfigDraft);
  const prev = useServerFn(previewConfigDraft);
  const pub = useServerFn(publishConfig);
  const disc = useServerFn(discardConfigDraft);
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof prev>> | null>(null);
  const target = { kind, key: cfgKey, scope: SCOPE };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["config-admin", kind] }); qc.invalidateQueries({ queryKey: ["config"] }); qc.invalidateQueries({ queryKey: ["custom-fields"] }); };
  const err = (e: any) => toast.error(e?.message ?? "Помилка");
  const mSave = useMutation({ mutationFn: () => save({ data: { ...target, payload } }), onSuccess: () => { toast.success("Чернетку збережено"); setDiff(null); refresh(); }, onError: err });
  const mPrev = useMutation({ mutationFn: () => prev({ data: target }), onSuccess: (r) => { setDiff(r); if (!r) toast.info("Немає чернетки"); }, onError: err });
  const mPub = useMutation({ mutationFn: () => pub({ data: target }), onSuccess: () => { toast.success("Опубліковано"); setDiff(null); refresh(); onDone?.(); }, onError: err });
  const mDisc = useMutation({ mutationFn: () => disc({ data: target }), onSuccess: () => { toast.success("Чернетку скасовано"); setDiff(null); refresh(); }, onError: err });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => mSave.mutate()} disabled={mSave.isPending}><Save className="h-3.5 w-3.5 mr-1" />Зберегти чернетку</Button>
        <Button size="sm" variant="outline" onClick={() => mPrev.mutate()} disabled={!hasDraft || mPrev.isPending}><Eye className="h-3.5 w-3.5 mr-1" />Переглянути зміни</Button>
        <Button size="sm" onClick={() => mPub.mutate()} disabled={!hasDraft || mPub.isPending}><Send className="h-3.5 w-3.5 mr-1" />Опублікувати</Button>
        {hasDraft && <Button size="sm" variant="ghost" onClick={() => mDisc.mutate()}><Trash2 className="h-3.5 w-3.5 mr-1" />Скасувати чернетку</Button>}
      </div>
      {diff && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1">
          <div className="font-semibold">Чернетка v{diff.draftVersion} проти {diff.publishedVersion ? `v${diff.publishedVersion}` : "коду за замовчуванням"}</div>
          {!diff.validation.ok && <div className="text-destructive">{diff.validation.errors?.join("; ")}</div>}
          {diff.changes.length === 0 ? <div className="text-muted-foreground">Змін немає</div> : diff.changes.map((c) => (
            <div key={c.path} className="font-mono break-all"><span className="text-muted-foreground">{c.path}:</span> {JSON.stringify(c.before) ?? "—"} → {JSON.stringify(c.after) ?? "—"}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ControlCenterAdmin({ canEdit }: { canEdit: boolean }) {
  const [section, setSection] = useState<Section>("modules");
  const [q, setQ] = useState("");
  const cards: { id: Section; label: string; icon: typeof Boxes; hint: string }[] = [
    { id: "modules", label: "Модулі", icon: Boxes, hint: "Підписи UA/RU, активність, порядок, ролі, пристрої" },
    { id: "fields", label: "Сутності й поля", icon: Database, hint: "Кастомні поля для Замовлень і Лідів" },
    { id: "dictionaries", label: "Довідники", icon: ListTree, hint: "Реєстр довідників, нові списки з архівом" },
  ];
  if (!canEdit) return <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Керування конфігурацією доступне адміністратору (право «Керування налаштуваннями»).</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <button key={c.id} type="button" onClick={() => setSection(c.id)}
            className={`text-left rounded-lg border p-3 transition-colors ${section === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
            <div className="flex items-center gap-2 font-semibold text-sm"><c.icon className="h-4 w-4" />{c.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.hint}</div>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Пошук…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {section === "modules" && <ModulesSection q={q} />}
      {section === "fields" && <FieldsSection q={q} />}
      {section === "dictionaries" && <DictionariesSection q={q} />}
    </div>
  );
}

/* ---------------- Modules ---------------- */
function ModulesSection({ q }: { q: string }) {
  const { data } = useKind("module_overlay");
  const map = useMemo(() => byKey(data), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const list = TERZI_MODULES.filter((m) => !q || `${m.id} ${m.label}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      {list.map((m) => {
        const e = map.get(m.id);
        return (
          <div key={m.id} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <div><div className="font-medium text-sm">{m.label}</div><div className="text-xs text-muted-foreground font-mono">{m.id} · {m.route ?? "без маршруту"}</div></div>
              <StatusBadge e={e} />
            </button>
            {open === m.id && <ModuleEditor id={m.id} codeLabel={m.label} codeActive={m.active} initial={(e?.draft ?? e?.published)?.payload ?? {}} hasDraft={!!e?.draft} />}
          </div>
        );
      })}
    </div>
  );
}

function ModuleEditor({ id, codeLabel, codeActive, initial, hasDraft }: { id: string; codeLabel: string; codeActive: boolean; initial: any; hasDraft: boolean }) {
  const [f, setF] = useState({
    label_uk: initial.label_uk ?? initial.label ?? "", label_ru: initial.label_ru ?? "",
    active: initial.active ?? codeActive, order: initial.order ?? "", roles: (initial.roles ?? []).join(", "),
    desktop: initial.desktop ?? true, mobile: initial.mobile ?? true,
  });
  const payload: Record<string, unknown> = {};
  if (f.label_uk.trim()) payload.label_uk = f.label_uk.trim();
  if (f.label_ru.trim()) payload.label_ru = f.label_ru.trim();
  if (f.active !== codeActive) payload.active = f.active;
  if (String(f.order).trim() !== "") payload.order = Number(f.order);
  const roles = f.roles.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (roles.length) payload.roles = roles;
  if (!f.desktop) payload.desktop = false;
  if (!f.mobile) payload.mobile = false;
  return (
    <div className="border-t border-border p-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Підпис UA (код: {codeLabel})</span><Input value={f.label_uk} onChange={(e) => setF({ ...f, label_uk: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Підпис RU</span><Input value={f.label_ru} onChange={(e) => setF({ ...f, label_ru: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Порядок (0–1000)</span><Input inputMode="numeric" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Ролі (через кому; порожньо — усім)</span><Input value={f.roles} onChange={(e) => setF({ ...f, roles: e.target.value })} placeholder="admin, director, manager, finance" /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Активний</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.desktop} onChange={(e) => setF({ ...f, desktop: e.target.checked })} />Показувати на комп'ютері</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.checked })} />Показувати на телефоні</label>
      </div>
      <p className="text-xs text-muted-foreground">Маршрути й розрахунки модуля не змінюються — лише відображення в меню.</p>
      <Lifecycle kind="module_overlay" cfgKey={id} payload={payload} hasDraft={hasDraft} />
    </div>
  );
}

/* ---------------- Fields ---------------- */
function FieldsSection({ q }: { q: string }) {
  const { data } = useKind("custom_field");
  const map = useMemo(() => byKey(data), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const keys = [...map.keys()].filter((k) => !q || `${k} ${JSON.stringify((map.get(k)!.draft ?? map.get(k)!.published)?.payload)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-xs font-semibold mb-2">Реєстр сутностей</div>
        <div className="flex flex-wrap gap-2">
          {ENTITIES.map((e) => (
            <span key={e.key} className="text-xs rounded border border-border px-2 py-1">
              {e.label} <span className="text-muted-foreground font-mono">{e.table}</span>
              {e.role === "projection" ? " · проєкція" : ""}{e.key in CUSTOM_FIELD_ENTITIES ? " · кастомні поля" : ""}
            </span>
          ))}
        </div>
      </div>
      <Button size="sm" onClick={() => { setCreating(!creating); setOpen(null); }}><Plus className="h-4 w-4 mr-1" />Нове поле</Button>
      {creating && <div className="rounded-lg border border-primary/40 bg-card"><FieldEditor initial={null} hasDraft={false} /></div>}
      {keys.length === 0 && !creating && <div className="text-sm text-muted-foreground">Кастомних полів ще немає.</div>}
      {keys.map((k) => {
        const e = map.get(k)!;
        const p = (e.draft ?? e.published)!.payload;
        return (
          <div key={k} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === k ? null : k)}>
              <div>
                <div className="font-medium text-sm">{p.label_uk}{p.archived ? " (архів)" : ""}</div>
                <div className="text-xs text-muted-foreground font-mono">{k} · {CUSTOM_FIELD_TYPE_LABEL[p.type as keyof typeof CUSTOM_FIELD_TYPE_LABEL] ?? p.type}</div>
              </div>
              <StatusBadge e={e} />
            </button>
            {open === k && <FieldEditor cfgKey={k} initial={p} hasDraft={!!e.draft} published={!!e.published} />}
          </div>
        );
      })}
    </div>
  );
}

function FieldEditor({ cfgKey, initial, hasDraft, published }: { cfgKey?: string; initial: any; hasDraft: boolean; published?: boolean }) {
  const { data: allFields } = useKind("custom_field");
  const [entity, setEntity] = useState<CustomFieldEntity>((cfgKey?.split(".")[0] as CustomFieldEntity) ?? "order");
  const [field, setField] = useState(cfgKey?.split(".")[1] ?? "");
  const [f, setF] = useState<any>(initial ?? { label_uk: "", type: "text", order: 100 });
  const [optsText, setOptsText] = useState(((initial?.options ?? []) as any[]).map((o) => `${o.code}=${o.label_uk}${o.archived ? " [архів]" : ""}`).join("\n"));
  const key = cfgKey ?? `${entity}.${field}`;
  const keyErr = !cfgKey && field ? (!FIELD_KEY_RE.test(field) ? "Лише латиниця a-z, цифри, _ (2–48)" : customKeyCollision(entity, field) ? "Збігається з основною колонкою — оберіть інший ключ" : null) : null;
  const options = optsText.split("\n").map((l: string) => l.trim()).filter(Boolean).map((l: string) => {
    const archived = /\[архів\]$/.test(l);
    const [code, ...rest] = l.replace(/\s*\[архів\]$/, "").split("=");
    return { code: code.trim(), label_uk: (rest.join("=") || code).trim(), ...(archived ? { archived: true } : {}) };
  });
  const isSelect = f.type === "single_select" || f.type === "multi_select";
  const numericKeys = [...new Set((allFields ?? [])
    .filter((r) => r.key.startsWith(`${entity}.`) && ["number", "money", "percentage"].includes(r.payload?.type))
    .map((r) => r.key.split(".")[1]!))];
  const formulaErr = f.type === "formula" && (f.formula ?? "").trim() ? formulaSyntaxError(String(f.formula), numericKeys) : null;
  const payload: any = { label_uk: f.label_uk, type: f.type };
  if (f.label_ru) payload.label_ru = f.label_ru;
  if (f.help) payload.help = f.help;
  if (f.required) payload.required = true;
  if (f.order !== "" && f.order != null) payload.order = Number(f.order);
  if (f.archived) payload.archived = true;
  if (isSelect && f.dictionary) payload.dictionary = f.dictionary;
  if (isSelect && !f.dictionary && options.length) payload.options = options;
  if (f.type === "relation") payload.relation_entity = f.relation_entity ?? "order";
  if (f.type === "formula") payload.formula = f.formula ?? "";
  return (
    <div className="border-t border-border p-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs space-y-1"><span>Сутність</span>
          <select className={sel} value={entity} disabled={!!cfgKey} onChange={(e) => setEntity(e.target.value as CustomFieldEntity)}>
            {Object.entries(CUSTOM_FIELD_ENTITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></label>
        <label className="text-xs space-y-1"><span>Ключ поля (латиниця)</span><Input value={field} disabled={!!cfgKey} onChange={(e) => setField(e.target.value)} placeholder="object_class" />
          {keyErr && <span className="text-destructive">{keyErr}</span>}</label>
        <label className="text-xs space-y-1"><span>Тип</span>
          <select className={sel} value={f.type} disabled={!!published} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABEL[t]}</option>)}
          </select></label>
        <label className="text-xs space-y-1"><span>Назва UA</span><Input value={f.label_uk} onChange={(e) => setF({ ...f, label_uk: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Назва RU</span><Input value={f.label_ru ?? ""} onChange={(e) => setF({ ...f, label_ru: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Порядок</span><Input inputMode="numeric" value={f.order ?? ""} onChange={(e) => setF({ ...f, order: e.target.value })} /></label>
      </div>
      {isSelect && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs space-y-1"><span>Довідник (код, необов'язково)</span><Input value={f.dictionary ?? ""} onChange={(e) => setF({ ...f, dictionary: e.target.value })} placeholder="object_class" /></label>
          <label className="text-xs space-y-1"><span>Або власні опції: рядок «код=Назва», «[архів]» в кінці — архів</span>
            <Textarea rows={4} value={optsText} onChange={(e) => setOptsText(e.target.value)} placeholder={"new=Новий\nvip=VIP"} /></label>
        </div>
      )}
      {f.type === "relation" && (
        <label className="text-xs space-y-1 block"><span>Зв'язок із</span>
          <select className={sel} value={f.relation_entity ?? "order"} onChange={(e) => setF({ ...f, relation_entity: e.target.value })}>
            {["order", "lead", "client", "contact", "estimate", "measurement"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select></label>
      )}
      {f.type === "formula" && (
        <label className="text-xs space-y-1 block">
          <span>Формула: числові кастомні поля цієї сутності та + - * / ( )</span>
          <Input value={f.formula ?? ""} onChange={(e) => setF({ ...f, formula: e.target.value })} placeholder="area * price_per_m2" />
          {formulaErr && <span className="text-destructive">{formulaErr}</span>}
          <span className="block text-muted-foreground">Доступні ключі: {numericKeys.join(", ") || "немає числових полів"}</span>
        </label>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />Обов'язкове</label>
        <label className="flex items-center gap-2"><Archive className="h-3.5 w-3.5" /><input type="checkbox" checked={!!f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} />Архівувати (значення зберігаються)</label>
      </div>
      {!keyErr && !formulaErr && field ? <Lifecycle kind="custom_field" cfgKey={key} payload={payload} hasDraft={hasDraft} /> : <p className="text-xs text-muted-foreground">Вкажіть ключ поля.</p>}
    </div>
  );
}

/* ---------------- Dictionaries ---------------- */
function DictionariesSection({ q }: { q: string }) {
  const { data } = useKind("dictionary");
  const map = useMemo(() => byKey(data), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-xs font-semibold mb-2">Авторитетні довідники ERP (редагуються у своїх розділах)</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {EXTERNAL_DICTIONARIES.filter((d) => match(`${d.code} ${d.label}`)).map((d) => (
            <div key={d.code} className="text-xs flex justify-between gap-2 rounded border border-border px-2 py-1.5">
              <span>{d.label} <span className="font-mono text-muted-foreground">{d.table}</span></span>
              <span className="text-muted-foreground">{d.adminHint}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs space-y-1"><span>Код нового довідника</span><Input value={newCode} onChange={(e) => setNewCode(e.target.value.trim())} placeholder="object_class" /></label>
        <Button size="sm" disabled={!/^[a-z][a-z0-9_]{1,47}$/.test(newCode) || map.has(newCode) || EXTERNAL_DICTIONARIES.some((d) => d.code === newCode)} onClick={() => { setOpen(newCode); }}><Plus className="h-4 w-4 mr-1" />Створити</Button>
      </div>
      {open && !map.has(open) && <div className="rounded-lg border border-primary/40 bg-card"><DictionaryEditor code={open} initial={null} hasDraft={false} /></div>}
      {[...map.keys()].filter((k) => match(`${k} ${(map.get(k)!.draft ?? map.get(k)!.published)?.payload?.label_uk}`)).map((k) => {
        const e = map.get(k)!;
        const p = (e.draft ?? e.published)!.payload;
        return (
          <div key={k} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === k ? null : k)}>
              <div><div className="font-medium text-sm">{p.label_uk}</div><div className="text-xs text-muted-foreground font-mono">{k} · {p.items?.length ?? 0} ел.</div></div>
              <StatusBadge e={e} />
            </button>
            {open === k && <DictionaryEditor code={k} initial={p} hasDraft={!!e.draft} />}
          </div>
        );
      })}
    </div>
  );
}

function DictionaryEditor({ code, initial, hasDraft }: { code: string; initial: any; hasDraft: boolean }) {
  const [label, setLabel] = useState(initial?.label_uk ?? "");
  const [labelRu, setLabelRu] = useState(initial?.label_ru ?? "");
  const [items, setItems] = useState<any[]>(initial?.items ?? []);
  const upd = (i: number, patch: any) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const payload: any = { label_uk: label, items: items.map((it, i) => {
    const o: any = { code: it.code, label_uk: it.label_uk, order: Number(it.order ?? i * 10) };
    if (it.label_ru) o.label_ru = it.label_ru;
    if (it.archived) o.archived = true;
    if (it.metadata && Object.keys(it.metadata).length) o.metadata = it.metadata;
    return o;
  }) };
  if (labelRu) payload.label_ru = labelRu;
  const publishedCodes = new Set(((initial?.items ?? []) as any[]).map((i) => i.code));
  return (
    <div className="border-t border-border p-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Назва UA</span><Input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="text-xs space-y-1"><span>Назва RU</span><Input value={labelRu} onChange={(e) => setLabelRu(e.target.value)} /></label>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className={`grid gap-2 grid-cols-2 sm:grid-cols-[1fr_2fr_2fr_80px_auto] items-center ${it.archived ? "opacity-60" : ""}`}>
            <Input value={it.code} disabled={publishedCodes.has(it.code) && !!initial} onChange={(e) => upd(i, { code: e.target.value.trim() })} placeholder="код" />
            <Input value={it.label_uk} onChange={(e) => upd(i, { label_uk: e.target.value })} placeholder="Назва UA" />
            <Input value={it.label_ru ?? ""} onChange={(e) => upd(i, { label_ru: e.target.value })} placeholder="Назва RU" />
            <Input inputMode="numeric" value={it.order ?? ""} onChange={(e) => upd(i, { order: e.target.value })} placeholder="№" />
            {publishedCodes.has(it.code) && initial
              ? <Button size="sm" variant="ghost" onClick={() => upd(i, { archived: !it.archived })}><Archive className="h-3.5 w-3.5 mr-1" />{it.archived ? "Відновити" : "В архів"}</Button>
              : <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setItems([...items, { code: "", label_uk: "", order: items.length * 10 }])}><Plus className="h-3.5 w-3.5 mr-1" />Елемент</Button>
      </div>
      <p className="text-xs text-muted-foreground">Опубліковані елементи не видаляються — лише архівуються: історичні записи й далі показують їхню назву.</p>
      <Lifecycle kind="dictionary" cfgKey={code} payload={payload} hasDraft={hasDraft} />
    </div>
  );
}
