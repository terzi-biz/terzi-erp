/**
 * Settings Control Center (Wave 2): модулі, сутності й поля, довідники.
 * Усі зміни — через config kernel: чернетка → перегляд змін → публікація.
 */
import { createContext, useContext, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Archive, Eye, Send, Save, Trash2, Boxes, Database, ListTree, History, Undo2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scopedEntries } from "@/lib/config-kernel/admin-view";
import { saveConfigDraft, previewConfigDraft, publishConfig, rollbackConfig } from "@/lib/config-kernel/config.functions";
import { listConfigAdmin, discardConfigDraft, listConfigScopeRoles, listConfigHistory, type AdminConfigRow } from "@/lib/config-kernel/control-plane.functions";
import { TERZI_MODULES } from "@/lib/modules";
import { ENTITIES } from "@/lib/config-kernel/registries";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABEL, customKeyCollision, FIELD_KEY_RE, formulaSyntaxError, type CustomFieldEntity } from "@/lib/config-kernel/custom-fields";
import { EXTERNAL_DICTIONARIES } from "@/lib/config-kernel/dictionaries";

type Scope = { type: "company" | "role"; id: string };
const COMPANY: Scope = { type: "company", id: "terzi" };
const ScopeCtx = createContext<Scope>(COMPANY);
const useScope = () => useContext(ScopeCtx);
type Kind = "module_overlay" | "custom_field" | "dictionary";
type Section = "modules" | "fields" | "dictionaries";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function useKind(kind: Kind) {
  const fn = useServerFn(listConfigAdmin);
  return useQuery({ queryKey: ["config-admin", kind], queryFn: () => fn({ data: { kind } }) });
}

/** Поточний стан ключа: чернетка (якщо є) поверх опублікованого. */
function byKey(rows: AdminConfigRow[] | undefined, scope: Scope) {
  const m = new Map<string, { draft?: AdminConfigRow; published?: AdminConfigRow }>();
  for (const r of rows ?? []) {
    if (r.scope_type !== scope.type || r.scope_id !== scope.id) continue;
    const e = m.get(r.key) ?? {};
    if (r.status === "draft") e.draft = r; else e.published = r;
    m.set(r.key, e);
  }
  return m;
}

function StatusBadge({ e, inherited }: { e?: { draft?: AdminConfigRow; published?: AdminConfigRow }; inherited?: boolean }) {
  if (!e && inherited) return <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">успадковано від компанії</span>;
  if (!e) return <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">код за замовчуванням</span>;
  return (
    <span className="flex gap-1">
      {e.published && <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">опубл. v{e.published.version}</span>}
      {e.draft && <span className="text-[10px] rounded bg-accent px-1.5 py-0.5 text-accent-foreground">чернетка v{e.draft.version}</span>}
    </span>
  );
}

/** Підтвердження дії lifecycle з приміткою до зміни (зберігається в історії). */
function NoteDialog({ open, title, description, required, pending, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; required?: boolean; pending?: boolean;
  onCancel: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const ok = !required || note.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setNote(""); onCancel(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <label className="text-xs space-y-1 block">
          <span>Примітка до зміни{required ? " (обов'язково)" : " (необов'язково)"}</span>
          <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Що і чому змінено" />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setNote(""); onCancel(); }}>Скасувати</Button>
          <Button disabled={!ok || pending} onClick={() => { const n = note.trim(); setNote(""); onConfirm(n); }}>Підтвердити</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Панель дій ключа: зберегти чернетку, перегляд diff, публікація, скасування. */
function Lifecycle({ kind, cfgKey, payload, hasDraft, onDone }: { kind: Kind; cfgKey: string; payload: unknown; hasDraft: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveConfigDraft);
  const prev = useServerFn(previewConfigDraft);
  const pub = useServerFn(publishConfig);
  const disc = useServerFn(discardConfigDraft);
  const scope = useScope();
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof prev>> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmPub, setConfirmPub] = useState(false);
  const target = { kind, key: cfgKey, scope };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["config-admin", kind] }); qc.invalidateQueries({ queryKey: ["config"] }); qc.invalidateQueries({ queryKey: ["custom-fields"] }); };
  const err = (e: any) => toast.error(e?.message ?? "Помилка");
  const mSave = useMutation({ mutationFn: () => save({ data: { ...target, payload } }), onSuccess: () => { toast.success("Чернетку збережено"); setDiff(null); refresh(); }, onError: err });
  const mPrev = useMutation({ mutationFn: () => prev({ data: target }), onSuccess: (r) => { setDiff(r); if (!r) toast.info("Немає чернетки"); }, onError: err });
  const mPub = useMutation({ mutationFn: (note: string) => pub({ data: { ...target, note: note || null } }), onSuccess: () => { toast.success("Опубліковано"); setConfirmPub(false); setDiff(null); refresh(); onDone?.(); }, onError: err });
  const mDisc = useMutation({ mutationFn: () => disc({ data: target }), onSuccess: () => { toast.success("Чернетку скасовано"); setDiff(null); refresh(); }, onError: err });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => mSave.mutate()} disabled={mSave.isPending}><Save className="h-3.5 w-3.5 mr-1" />Зберегти чернетку</Button>
        <Button size="sm" variant="outline" onClick={() => mPrev.mutate()} disabled={!hasDraft || mPrev.isPending}><Eye className="h-3.5 w-3.5 mr-1" />Переглянути зміни</Button>
        <Button size="sm" onClick={() => setConfirmPub(true)} disabled={!hasDraft || mPub.isPending}><Send className="h-3.5 w-3.5 mr-1" />Опублікувати</Button>
        {hasDraft && <Button size="sm" variant="ghost" onClick={() => mDisc.mutate()}><Trash2 className="h-3.5 w-3.5 mr-1" />Скасувати чернетку</Button>}
        <Button size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)}><History className="h-3.5 w-3.5 mr-1" />Історія</Button>
      </div>
      <NoteDialog open={confirmPub} title="Опублікувати чернетку?" pending={mPub.isPending}
        description={`Зміни «${cfgKey}» набудуть чинності для ${scope.type === "company" ? "всієї компанії" : `ролі ${scope.id}`}. Попередня версія лишиться в історії.`}
        onCancel={() => setConfirmPub(false)} onConfirm={(n) => mPub.mutate(n)} />
      {showHistory && <HistoryPanel kind={kind} cfgKey={cfgKey} onChanged={refresh} />}
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

const fmtDt = (v: string | null) => v ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(v)) : "—";
const STATUS_UA: Record<string, string> = { draft: "чернетка", published: "опубліковано", superseded: "попередня", discarded: "скасована" };

/** Історія версій ключа у поточному скоупі + rollback через існуючий lifecycle. */
function HistoryPanel({ kind, cfgKey, onChanged }: { kind: Kind; cfgKey: string; onChanged: () => void }) {
  const scope = useScope();
  const hist = useServerFn(listConfigHistory);
  const rb = useServerFn(rollbackConfig);
  const q = useQuery({ queryKey: ["config-history", kind, cfgKey, scope.type, scope.id], queryFn: () => hist({ data: { kind, key: cfgKey, scope } }) });
  const [target, setTarget] = useState<number | null>(null);
  const m = useMutation({
    mutationFn: (a: { v: number; note: string }) => rb({ data: { kind, key: cfgKey, scope, toVersion: a.v, note: a.note } }),
    onSuccess: () => { toast.success("Відкат виконано — створено нову опубліковану версію"); setTarget(null); q.refetch(); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  if (q.isLoading) return <div className="text-xs text-muted-foreground">Завантаження історії…</div>;
  const rows = q.data ?? [];
  if (!rows.length) return <div className="text-xs text-muted-foreground">Версій у цьому скоупі ще немає — діє код за замовчуванням.</div>;
  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-1.5 text-left">Версія</th><th className="p-1.5 text-left">Стан</th><th className="p-1.5 text-left">Хто / коли</th><th className="p-1.5 text-left">Примітка</th><th className="p-1.5" /></tr></thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-1.5 font-mono">v{r.version}{r.basedOn ? ` ← v${r.basedOn}` : ""}</td>
              <td className="p-1.5">{STATUS_UA[r.status] ?? r.status}</td>
              <td className="p-1.5">{r.publisher ?? r.author ?? "—"} · {fmtDt(r.publishedAt ?? r.createdAt)}</td>
              <td className="p-1.5 text-muted-foreground">{r.note ?? ""}</td>
              <td className="p-1.5 text-right">
                {r.status === "superseded" && <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => setTarget(r.version)}><Undo2 className="h-3 w-3 mr-1" />Відкотити</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NoteDialog open={target != null} required pending={m.isPending} title={`Відкотити до v${target ?? ""}?`}
        description="Буде створено нову опубліковану версію з вмістом обраної; історія не стирається."
        onCancel={() => setTarget(null)} onConfirm={(note) => target != null && m.mutate({ v: target, note })} />
    </div>
  );
}

function ScopeSelector({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  const fn = useServerFn(listConfigScopeRoles);
  const { data: roles } = useQuery({ queryKey: ["config-scope-roles"], queryFn: () => fn(), staleTime: 5 * 60_000 });
  const value = scope.type === "company" ? "company" : `role:${scope.id}`;
  return (
    <label className="text-xs flex flex-wrap items-center gap-2">
      <span className="font-semibold">Рівень налаштування:</span>
      <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={value}
        onChange={(e) => onChange(e.target.value === "company" ? COMPANY : { type: "role", id: e.target.value.slice(5) })}>
        <option value="company">Компанія (усі)</option>
        {(roles ?? []).map((r) => <option key={r.key} value={`role:${r.key}`}>Роль: {r.name}</option>)}
      </select>
      {scope.type === "role" && <span className="text-muted-foreground">Перевизначає налаштування компанії лише для цієї ролі.</span>}
    </label>
  );
}

export function ControlCenterAdmin({ canEdit }: { canEdit: boolean }) {
  const [section, setSection] = useState<Section>("modules");
  const [scope, setScope] = useState<Scope>(COMPANY);
  const [q, setQ] = useState("");
  const cards: { id: Section; label: string; icon: typeof Boxes; hint: string }[] = [
    { id: "modules", label: "Модулі", icon: Boxes, hint: "Підписи UA/RU, активність, порядок, ролі, пристрої" },
    { id: "fields", label: "Сутності й поля", icon: Database, hint: "Кастомні поля для Замовлень і Лідів" },
    { id: "dictionaries", label: "Довідники", icon: ListTree, hint: "Реєстр довідників, нові списки з архівом" },
  ];
  if (!canEdit) return <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Керування конфігурацією доступне адміністратору (право «Керування налаштуваннями»).</div>;
  return (
    <ScopeCtx.Provider value={scope}>
    <div className="space-y-4">
      <ScopeSelector scope={scope} onChange={setScope} />
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
    </ScopeCtx.Provider>
  );
}

/* ---------------- Modules ---------------- */
function ModulesSection({ q }: { q: string }) {
  const { data } = useKind("module_overlay");
  const scope = useScope();
  const map = useMemo(() => byKey(data, scope), [data, scope]);
  const base = useMemo(() => byKey(data, COMPANY), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const list = TERZI_MODULES.filter((m) => !q || `${m.id} ${m.label}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      {list.map((m) => {
        const e = map.get(m.id);
        const b = scope.type === "role" ? base.get(m.id) : undefined;
        return (
          <div key={m.id} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <div><div className="font-medium text-sm">{m.label}</div><div className="text-xs text-muted-foreground font-mono">{m.id} · {m.route ?? "без маршруту"}</div></div>
              <StatusBadge e={e} inherited={!!b?.published} />
            </button>
            {open === m.id && <ModuleEditor key={`${scope.type}:${scope.id}`} id={m.id} codeLabel={m.label} codeActive={m.active} initial={(e?.draft ?? e?.published ?? b?.published)?.payload ?? {}} hasDraft={!!e?.draft} />}
          </div>
        );
      })}
    </div>
  );
}

function ModuleEditor({ id, codeLabel, codeActive, initial, hasDraft }: { id: string; codeLabel: string; codeActive: boolean; initial: any; hasDraft: boolean }) {
  const [f, setF] = useState({
    label_uk: initial.label_uk ?? initial.label ?? "", label_ru: initial.label_ru ?? "",
    active: initial.active ?? codeActive, order: initial.order ?? "", roles: (initial.roles ?? []) as string[],
    desktop: initial.desktop ?? true, mobile: initial.mobile ?? true,
  });
  const payload: Record<string, unknown> = {};
  if (f.label_uk.trim()) payload.label_uk = f.label_uk.trim();
  if (f.label_ru.trim()) payload.label_ru = f.label_ru.trim();
  if (f.active !== codeActive) payload.active = f.active;
  if (String(f.order).trim() !== "") payload.order = Number(f.order);
  if (f.roles.length) payload.roles = f.roles;
  const rolesFn = useServerFn(listConfigScopeRoles);
  const { data: roleList } = useQuery({ queryKey: ["config-scope-roles"], queryFn: () => rolesFn(), staleTime: 5 * 60_000 });
  const known = new Set((roleList ?? []).map((r) => r.key));
  const legacy = f.roles.filter((k) => !known.has(k)); // збережені ключі, яких немає серед активних ролей — не губимо
  const toggleRole = (k: string, on: boolean) => setF({ ...f, roles: on ? [...f.roles, k] : f.roles.filter((x) => x !== k) });
  if (!f.desktop) payload.desktop = false;
  if (!f.mobile) payload.mobile = false;
  return (
    <div className="border-t border-border p-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Підпис UA (код: {codeLabel})</span><Input value={f.label_uk} onChange={(e) => setF({ ...f, label_uk: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Підпис RU</span><Input value={f.label_ru} onChange={(e) => setF({ ...f, label_ru: e.target.value })} /></label>
        <label className="text-xs space-y-1"><span>Порядок (0–1000)</span><Input inputMode="numeric" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></label>
      </div>
      <div className="text-xs space-y-1">
        <span>Ролі (нічого не обрано — усім)</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(roleList ?? []).map((r) => (
            <label key={r.key} className="flex items-center gap-1.5"><input type="checkbox" checked={f.roles.includes(r.key)} onChange={(e) => toggleRole(r.key, e.target.checked)} />{r.name}</label>
          ))}
          {legacy.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked onChange={() => toggleRole(k, false)} />{k} (неактивна/невідома)</label>
          ))}
        </div>
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
  const scope = useScope();
  const map = useMemo(() => byKey(data, scope), [data, scope]);
  const base = useMemo(() => byKey(data, COMPANY), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const allKeys = [...new Set([...base.keys(), ...map.keys()])].sort();
  const keys = allKeys.filter((k) => !q || `${k} ${JSON.stringify(((map.get(k) ?? base.get(k))!.draft ?? (map.get(k) ?? base.get(k))!.published)?.payload)}`.toLowerCase().includes(q.toLowerCase()));
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
      {creating && scope.type === "company" && <div className="rounded-lg border border-primary/40 bg-card"><FieldEditor initial={null} hasDraft={false} /></div>}
      {creating && scope.type === "role" && <div className="text-xs text-muted-foreground">Нові поля створюються на рівні компанії; для ролі можна лише перевизначити назву, порядок, обов'язковість чи архів.</div>}
      {keys.length === 0 && !creating && <div className="text-sm text-muted-foreground">Кастомних полів ще немає.</div>}
      {keys.map((k) => {
        const e = map.get(k);
        const b = base.get(k);
        const p = (e?.draft ?? e?.published ?? b?.draft ?? b?.published)!.payload;
        return (
          <div key={k} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === k ? null : k)}>
              <div>
                <div className="font-medium text-sm">{p.label_uk}{p.archived ? " (архів)" : ""}</div>
                <div className="text-xs text-muted-foreground font-mono">{k} · {CUSTOM_FIELD_TYPE_LABEL[p.type as keyof typeof CUSTOM_FIELD_TYPE_LABEL] ?? p.type}</div>
              </div>
              <StatusBadge e={e} inherited={scope.type === "role" && !!b?.published} />
            </button>
            {open === k && <FieldEditor key={`${scope.type}:${scope.id}`} cfgKey={k} initial={p} hasDraft={!!e?.draft} published={!!e?.published || !!b?.published} />}
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
  const scope = useScope();
  const map = useMemo(() => byKey(data, scope), [data, scope]);
  const entries = useMemo(() => scopedEntries(data, scope, COMPANY), [data, scope]);
  const allCodes = useMemo(() => new Set((data ?? []).map((r) => r.key)), [data]);
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
              {d.adminRoute
                ? <Link to={d.adminRoute} className="text-primary inline-flex items-center gap-1 hover:underline">{d.adminHint}<ExternalLink className="h-3 w-3" /></Link>
                : <span className="text-muted-foreground">{d.adminHint}</span>}
            </div>
          ))}
        </div>
      </div>
      {scope.type === "role" ? (
        <div className="text-xs text-muted-foreground">Нові довідники створюються на рівні компанії; для ролі можна перевизначити успадкований довідник.</div>
      ) : (
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs space-y-1"><span>Код нового довідника</span><Input value={newCode} onChange={(e) => setNewCode(e.target.value.trim())} placeholder="object_class" /></label>
        <Button size="sm" disabled={!/^[a-z][a-z0-9_]{1,47}$/.test(newCode) || allCodes.has(newCode) || EXTERNAL_DICTIONARIES.some((d) => d.code === newCode)} onClick={() => { setOpen(newCode); }}><Plus className="h-4 w-4 mr-1" />Створити</Button>
      </div>
      )}
      {open && scope.type === "company" && !map.has(open) && !allCodes.has(open) && <div className="rounded-lg border border-primary/40 bg-card"><DictionaryEditor code={open} initial={null} hasDraft={false} /></div>}
      {entries.filter(({ key, own, inherited }) => match(`${key} ${(own?.draft ?? own?.published ?? inherited)?.payload?.label_uk ?? ""}`)).map(({ key: k, own: e, inherited }) => {
        const p = (e?.draft ?? e?.published ?? inherited)!.payload;
        return (
          <div key={k} className="rounded-lg border border-border bg-card">
            <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === k ? null : k)}>
              <div><div className="font-medium text-sm">{p.label_uk}</div><div className="text-xs text-muted-foreground font-mono">{k} · {p.items?.length ?? 0} ел.</div></div>
              <StatusBadge e={e} inherited={!!inherited} />
            </button>
            {open === k && <DictionaryEditor key={`${scope.type}:${scope.id}`} code={k} initial={p} hasDraft={!!e?.draft} />}
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
