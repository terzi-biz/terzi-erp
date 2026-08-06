import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { saveMarketingRow, deleteMarketingRow } from "@/lib/marketing.functions";
import { EmptyState } from "./MarketingShell";

export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  required?: boolean;
  inTable?: boolean;
  render?: (row: Record<string, unknown>) => string;
};

type Table = Parameters<typeof saveMarketingRow>[0] extends { data: infer D } ? (D extends { table: infer T } ? T : string) : string;

export function CrudPanel({ table, rows, fields, emptyText, queryKey = ["mkt"] }: {
  table: Table;
  rows: Record<string, unknown>[];
  fields: FieldSpec[];
  emptyText: string;
  queryKey?: string[];
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveMarketingRow);
  const delFn = useServerFn(deleteMarketingRow);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const cols = fields.filter((f) => f.inTable !== false).slice(0, 5);

  const submit = async () => {
    for (const f of fields) if (f.required && !String(form[f.key] ?? "").trim()) { toast.error(`Заповніть «${f.label}»`); return; }
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.key];
      if (v === undefined) continue;
      values[f.key] = v === "" ? null : f.type === "number" ? Number(v) : v;
    }
    setBusy(true);
    try {
      await saveFn({ data: { table: table as never, id: (form.id as string) || null, valuesJson: JSON.stringify(values) } });
      toast.success("Збережено");
      setOpen(false); setForm({});
      qc.invalidateQueries({ queryKey });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Помилка збереження"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex justify-end mb-2">
        <button onClick={() => { setForm({}); setOpen(true); }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
          <Plus className="w-3.5 h-3.5" /> Додати
        </button>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>{cols.map((c) => <th key={c.key} className="text-left py-1 pr-3 whitespace-nowrap">{c.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t border-border/60">
                  {cols.map((c) => (
                    <td key={c.key} className="py-2 pr-3 max-w-[240px] truncate">
                      <button className="text-left hover:text-primary" onClick={() => { setForm(r); setOpen(true); }}>
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </button>
                    </td>
                  ))}
                  <td className="text-right">
                    <button className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Видалити запис?")) return;
                        try { await delFn({ data: { table: table as never, id: String(r.id) } }); qc.invalidateQueries({ queryKey }); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Помилка"); }
                      }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState text={emptyText} />}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl border border-border bg-card p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">{form.id ? "Редагувати" : "Новий запис"}</h3>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}{f.required ? " *" : ""}</span>
                {f.type === "select" ? (
                  <select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea rows={3} value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                ) : (
                  <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                )}
              </label>
            ))}
            <button onClick={submit} disabled={busy}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
