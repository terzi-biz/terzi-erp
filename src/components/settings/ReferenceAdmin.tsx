/**
 * Довідники пакета А: реквізити компаній (ФОП) з версіонуванням
 * і причини закриття з архівуванням. Історія не перезаписується.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Plus, Save } from "lucide-react";
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
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> Нова версія
          </Button>
        )}
      </div>

      {canEdit && open && (
        <div className="grid gap-3 border-b border-border bg-secondary/30 p-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">{f.label}</span>
              <input
                className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
                value={String(form[f.key] ?? "")}
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
              disabled={!form.code.trim() || !form.legal_name.trim() || save.isPending}
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
  const [form, setForm] = useState({ ...emptyReason });

  const query = useQuery({ queryKey: ["close-reasons"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["close-reasons"] });
      toast.success("Причину збережено");
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

  const rows = (query.data ?? []) as CloseReason[];

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
              onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value as "lead" | "order" }))}
            >
              <option value="lead">Лід</option>
              <option value="order">Замовлення</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Код</span>
            <input
              className="w-32 rounded border border-border bg-input px-2 py-1.5 text-sm"
              value={form.code}
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
          <Button size="sm" disabled={!form.code.trim() || !form.label.trim() || save.isPending} onClick={() => save.mutate()}>
            <Plus className="mr-1 h-4 w-4" /> Додати
          </Button>
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
                  <td className="px-4 py-3 text-muted-foreground">{r.archived_at ? "Архів" : "Активна"}</td>
                  <td className="px-4 py-3 text-right">
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
