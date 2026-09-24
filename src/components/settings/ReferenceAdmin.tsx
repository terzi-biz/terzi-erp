/**
 * Довідники пакета А: реквізити компаній (ФОП) з версіонуванням
 * і причини закриття з архівуванням. Історія не перезаписується.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveCloseReason,
  archiveCompanyRequisite,
  listCloseReasons,
  listCompanyRequisites,
  saveCloseReason,
  saveCompanyRequisite,
} from "@/lib/reference.functions";

type Requisite = Awaited<ReturnType<typeof listCompanyRequisites>>[number];
type CloseReason = Awaited<ReturnType<typeof listCloseReasons>>[number];

const emptyRequisite = {
  code: "",
  legal_name: "",
  short_name: "",
  tax_id: "",
  address: "",
  bank_name: "",
  iban: "",
  phone: "",
  email: "",
  signer_name: "",
  signer_position: "",
  is_default: false,
};

const FIELDS: { key: keyof typeof emptyRequisite; label: string }[] = [
  { key: "code", label: "Код (напр. fop1)" },
  { key: "legal_name", label: "Повна назва" },
  { key: "short_name", label: "Коротка назва" },
  { key: "tax_id", label: "ІПН / ЄДРПОУ" },
  { key: "address", label: "Адреса" },
  { key: "bank_name", label: "Банк" },
  { key: "iban", label: "IBAN" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "signer_name", label: "Підписант" },
  { key: "signer_position", label: "Посада підписанта" },
];

function fmt(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

export function CompanyRequisitesAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanyRequisites);
  const saveFn = useServerFn(saveCompanyRequisite);
  const archiveFn = useServerFn(archiveCompanyRequisite);
  const [form, setForm] = useState({ ...emptyRequisite });
  const [open, setOpen] = useState(false);
  /** new — нова юрособа/код; version — нова версія наявного коду (код незмінний). */
  const [mode, setMode] = useState<"new" | "version">("new");

  const query = useQuery({ queryKey: ["company-requisites"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["company-requisites"] });
      toast.success("Створено нову версію реквізитів");
      setForm({ ...emptyRequisite });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => archiveFn({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["company-requisites"] });
      toast.success("Стан запису змінено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (query.data ?? []) as Requisite[];

  const startNew = () => { setMode("new"); setForm({ ...emptyRequisite }); setOpen(true); };
  /** Нова версія з префілом останньої активної (або останньої) версії цього коду. */
  const startVersion = (code: string) => {
    const same = rows.filter((r) => r.code === code).sort((a, b) => b.version - a.version);
    const base = same.find((r) => !r.archived_at) ?? same[0];
    if (!base) return;
    const next = { ...emptyRequisite } as Record<string, unknown>;
    for (const k of Object.keys(emptyRequisite)) {
      const v = (base as Record<string, unknown>)[k];
      next[k] = k === "is_default" ? !!v : (v ?? "");
    }
    setMode("version"); setForm(next as typeof emptyRequisite); setOpen(true);
  };
  const latestIds = new Set(
    Object.values(rows.reduce<Record<string, Requisite>>((m, r) => {
      if (!m[r.code] || m[r.code].version < r.version) m[r.code] = r; return m;
    }, {})).map((r) => r.id),
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4 md:p-5">
        <div>
          <h2 className="text-lg font-black">Реквізити компаній (ФОП)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Правка не перезаписує запис: зберігається нова версія, попередні лишаються в історії документів.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" /> Нова компанія (новий код)
          </Button>
        )}
      </div>

      {canEdit && open && (
        <div className="grid gap-3 border-b border-border bg-secondary/30 p-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center justify-between text-sm font-semibold">
            <span>{mode === "version" ? `Нова версія реквізитів «${form.code}» (заповнено з останньої версії)` : "Нова юрособа / ФОП"}</span>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          {FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">{f.label}</span>
              <input
                className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
                value={String(form[f.key] ?? "")}
                disabled={f.key === "code" && mode === "version"}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((s) => ({ ...s, is_default: e.target.checked }))}
            />
            Основна компанія за замовчуванням
          </label>
          <div className="md:col-span-2">
            <Button
              size="sm"
              disabled={!form.code.trim() || !form.legal_name.trim() || save.isPending
                || (mode === "new" && rows.some((r) => r.code === form.code.trim()))}
              onClick={() => save.mutate()}
            >
              <Save className="mr-1 h-4 w-4" /> Зберегти версію
            </Button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="p-5 text-sm text-muted-foreground">Завантаження…</div>
      ) : rows.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">Реквізитів ще немає.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Код / версія</th>
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-4 py-3 text-left">ІПН</th>
                <th className="px-4 py-3 text-left">IBAN</th>
                <th className="px-4 py-3 text-left">Стан</th>
                <th className="px-4 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    {r.code} <span className="text-muted-foreground">v{r.version}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.legal_name}
                    {r.is_default && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">за замовч.</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(r.tax_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(r.iban)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.archived_at ? "Архів" : "Активна"}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && latestIds.has(r.id) && (
                      <Button size="sm" variant="outline" className="mr-1" onClick={() => startVersion(r.code)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Нова версія
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: r.id, archived: !r.archived_at })}
                      >
                        {r.archived_at ? <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> : <Archive className="mr-1 h-3.5 w-3.5" />}
                        {r.archived_at ? "Повернути" : "В архів"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const emptyReason = { scope: "lead" as "lead" | "order", code: "", label: "", is_negative: true, sort_order: 100 };

export function CloseReasonsAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCloseReasons);
  const saveFn = useServerFn(saveCloseReason);
  const archiveFn = useServerFn(archiveCloseReason);
  const [form, setForm] = useState<typeof emptyReason & { id?: string }>({ ...emptyReason });
  const editing = !!form.id;

  const query = useQuery({ queryKey: ["close-reasons"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["close-reasons"] });
      toast.success(form.id ? "Причину оновлено" : "Причину збережено");
      setForm({ ...emptyReason });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => archiveFn({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["close-reasons"] });
      toast.success("Стан причини змінено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = [...((query.data ?? []) as CloseReason[])].sort((a, b) =>
    a.scope === b.scope ? (a.sort_order ?? 0) - (b.sort_order ?? 0) : a.scope.localeCompare(b.scope));

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border p-4 md:p-5">
        <h2 className="text-lg font-black">Причини закриття</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Окремі набори для лідів і замовлень. Архівування зберігає історичні посилання.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-secondary/30 p-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Розділ</span>
            <select
              className="rounded border border-border bg-input px-2 py-1.5 text-sm"
              value={form.scope}
              disabled={editing}
              onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value as "lead" | "order" }))}
            >
              <option value="lead">Лід</option>
              <option value="order">Замовлення</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Код</span>
            <input
              className="w-32 rounded border border-border bg-input px-2 py-1.5 text-sm disabled:opacity-60"
              value={form.code}
              disabled={editing}
              onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
            />
          </label>
          <label className="text-sm flex-1 min-w-[200px]">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Назва</span>
            <input
              className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
              value={form.label}
              onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_negative}
              onChange={(e) => setForm((s) => ({ ...s, is_negative: e.target.checked }))}
            />
            Негативна
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Порядок</span>
            <input
              type="number" min={0} max={9999}
              className="w-20 rounded border border-border bg-input px-2 py-1.5 text-sm"
              value={form.sort_order}
              onChange={(e) => setForm((s) => ({ ...s, sort_order: Math.max(0, Math.min(9999, Math.trunc(Number(e.target.value) || 0))) }))}
            />
          </label>
          <Button size="sm" disabled={!form.code.trim() || !form.label.trim() || save.isPending} onClick={() => save.mutate()}>
            {editing ? <><Save className="mr-1 h-4 w-4" /> Зберегти зміни</> : <><Plus className="mr-1 h-4 w-4" /> Додати</>}
          </Button>
          {editing && <Button size="sm" variant="ghost" onClick={() => setForm({ ...emptyReason })}>Скасувати</Button>}
          {editing && <span className="w-full text-xs text-muted-foreground">Код і розділ незмінні — історичні посилання зберігаються.</span>}
        </div>
      )}

      {query.isLoading ? (
        <div className="p-5 text-sm text-muted-foreground">Завантаження…</div>
      ) : rows.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">Причин ще немає.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Розділ</th>
                <th className="px-4 py-3 text-left">Код</th>
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-4 py-3 text-left">Тип</th>
                <th className="px-4 py-3 text-left">Порядок</th>
                <th className="px-4 py-3 text-left">Стан</th>
                <th className="px-4 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">{r.scope === "lead" ? "Лід" : "Замовлення"}</td>
                  <td className="px-4 py-3 font-semibold">{r.code}</td>
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.is_negative ? "Негативна" : "Позитивна"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sort_order ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.archived_at ? "Архів" : "Активна"}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <Button size="sm" variant="outline" className="mr-1"
                        onClick={() => setForm({ id: r.id, scope: r.scope as "lead" | "order", code: r.code, label: r.label, is_negative: !!r.is_negative, sort_order: r.sort_order ?? 100 })}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Змінити
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: r.id, archived: !r.archived_at })}
                      >
                        {r.archived_at ? "Повернути" : "В архів"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
