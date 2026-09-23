/** Кастомні поля запису (Order/Lead). Нічого не показує, якщо полів немає — поведінка без змін. */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCustomFields, setCustomFieldValue } from "@/lib/config-kernel/control-plane.functions";
import { dictionaryLabel, selectableItems, type Dictionary } from "@/lib/config-kernel/dictionaries";
import type { CustomFieldDef } from "@/lib/config-kernel/custom-fields";
import { useI18n } from "@/lib/i18n";

type Entity = "order" | "lead";
type Opt = { code: string; label: string };

function optionsFor(def: CustomFieldDef, dicts: Record<string, Dictionary>, lang: "ua" | "ru"): { active: Opt[]; label: (c: string) => string } {
  if (def.dictionary) {
    const d = dicts[def.dictionary];
    return { active: selectableItems(d).map((i) => ({ code: i.code, label: lang === "ru" && i.label_ru ? i.label_ru : i.label_uk })), label: (c) => dictionaryLabel(d, c, lang) };
  }
  const opts = def.options ?? [];
  return {
    active: opts.filter((o) => !o.archived).map((o) => ({ code: o.code, label: lang === "ru" && o.label_ru ? o.label_ru : o.label_uk })),
    label: (c) => { const o = opts.find((x) => x.code === c); if (!o) return c; const l = lang === "ru" && o.label_ru ? o.label_ru : o.label_uk; return o.archived ? `${l} (архів)` : l; },
  };
}

function display(def: CustomFieldDef, v: unknown, lbl: (c: string) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (def.type) {
    case "boolean": return v ? "Так" : "Ні";
    case "money": return `${Number(v).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн`;
    case "percentage": return `${Number(v).toLocaleString("uk-UA")} %`;
    case "date": return String(v).split("-").reverse().join(".");
    case "datetime": return new Date(String(v)).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" });
    case "single_select": return lbl(String(v));
    case "multi_select": return (v as string[]).map(lbl).join(", ");
    case "tags": return (v as string[]).join(", ");
    default: return String(v);
  }
}

export function CustomFieldsCard({ entity, entityId }: { entity: Entity; entityId: string }) {
  const lang = (useI18n((s) => s.lang) as "ua" | "ru") ?? "ua";
  const fetchFn = useServerFn(getCustomFields);
  const q = useQuery({ queryKey: ["custom-fields", entity, entityId], queryFn: () => fetchFn({ data: { entity, entityId } }), retry: false });
  const fields = (q.data?.fields ?? []).filter((f: any) => !f.def.archived || q.data?.values[f.key] != null);
  if (!q.data || fields.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Додаткові поля</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f: any) => (
          <FieldRow key={f.key} entity={entity} entityId={entityId} fieldKey={f.key} def={f.def}
            value={q.data!.values[f.key]} dicts={q.data!.dictionaries} canEdit={q.data!.canEdit && !f.def.archived} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function FieldRow({ entity, entityId, fieldKey, def, value, dicts, canEdit, lang }: {
  entity: Entity; entityId: string; fieldKey: string; def: CustomFieldDef; value: unknown;
  dicts: Record<string, Dictionary>; canEdit: boolean; lang: "ua" | "ru";
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setCustomFieldValue);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? (def.type === "multi_select" ? [] : ""));
  const { active, label } = optionsFor(def, dicts, lang);
  const m = useMutation({
    mutationFn: (v: unknown) => saveFn({ data: { entity, entityId, field: fieldKey, value: v } }),
    onSuccess: () => { toast.success("Збережено"); setEdit(false); qc.invalidateQueries({ queryKey: ["custom-fields", entity, entityId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const title = lang === "ru" && def.label_ru ? def.label_ru : def.label_uk;
  const editable = canEdit && def.type !== "formula";
  const current = Array.isArray(value) ? value as string[] : value != null ? [String(value)] : [];
  const selectOpts = [...active, ...current.filter((c) => !active.some((a) => a.code === c)).map((c) => ({ code: c, label: label(c) }))];

  const input = (() => {
    switch (def.type) {
      case "long_text": return <Textarea value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} rows={3} />;
      case "boolean": return (
        <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft === true ? "1" : draft === false ? "0" : ""} onChange={(e) => setDraft(e.target.value === "" ? null : e.target.value === "1")}>
          <option value="">—</option><option value="1">Так</option><option value="0">Ні</option>
        </select>);
      case "single_select": return (
        <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft ?? ""} onChange={(e) => setDraft(e.target.value || null)}>
          <option value="">—</option>
          {selectOpts.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>);
      case "multi_select": return (
        <div className="flex flex-wrap gap-2">
          {selectOpts.map((o) => {
            const on = (draft ?? []).includes(o.code);
            return <button type="button" key={o.code} onClick={() => setDraft(on ? draft.filter((c: string) => c !== o.code) : [...(draft ?? []), o.code])}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{o.label}</button>;
          })}
        </div>);
      case "tags": return <Input value={Array.isArray(draft) ? draft.join(", ") : draft ?? ""} onChange={(e) => setDraft(e.target.value)} placeholder="через кому" />;
      case "number": case "money": case "percentage": return <Input inputMode="decimal" value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} />;
      case "date": return <Input type="date" value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} />;
      case "datetime": return <Input type="datetime-local" value={draft ? String(draft).slice(0, 16) : ""} onChange={(e) => setDraft(e.target.value)} />;
      default: return <Input value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} />;
    }
  })();

  return (
    <div className="rounded-md border border-border/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">{title}{def.required ? " *" : ""}</div>
        {editable && !edit && <button type="button" aria-label={`Редагувати ${title}`} onClick={() => { setDraft(value ?? (def.type === "multi_select" ? [] : "")); setEdit(true); }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
      </div>
      {edit ? (
        <div className="mt-1 space-y-2">
          {input}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => m.mutate(draft)} disabled={m.isPending}><Check className="h-3.5 w-3.5 mr-1" />Зберегти</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ) : (
        <div className="text-sm font-medium break-words">
          {def.type === "formula" ? <span className="text-muted-foreground text-xs">Формула: обчислення буде доступне з Formula Engine</span>
            : (def.type === "file" || def.type === "image") && value ? <a className="underline" href={String(value)} target="_blank" rel="noreferrer">Відкрити</a>
            : display(def, value, label)}
        </div>
      )}
    </div>
  );
}
