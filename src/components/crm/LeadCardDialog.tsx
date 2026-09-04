/**
 * Повна картка ліда в стилі AmoCRM: редагування всіх полів, історія комунікацій,
 * коментарі, задачі та дзвінки з прослуховуванням записів.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  X, Phone, MessageSquare, CheckSquare, PhoneCall, History, Save, PlayCircle,
  Loader2, PhoneMissed, PhoneIncoming, PhoneOutgoing, User, Plus,
} from "lucide-react";
import { getLeadCard, saveLead, listCrmStaff } from "@/lib/crm/board.functions";
import { addLeadNote, upsertTask, getCallRecording } from "@/lib/crm.functions";
import { LEAD_CUSTOM_FIELDS, LEAD_FIELD_GROUPS } from "@/lib/crm/lead-fields";

const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const lbl = "text-[11px] uppercase tracking-wider text-muted-foreground";

type Stage = { id: string; name: string; color?: string | null };

export function LeadCardDialog({
  leadId, stages, onClose,
}: { leadId: string; stages: Stage[]; onClose: () => void }) {
  const qc = useQueryClient();
  const cardFn = useServerFn(getLeadCard);
  const saveFn = useServerFn(saveLead);
  const staffFn = useServerFn(listCrmStaff);
  const noteFn = useServerFn(addLeadNote);
  const taskFn = useServerFn(upsertTask);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "lead-card", leadId],
    queryFn: () => cardFn({ data: { lead_id: leadId } }),
  });
  const { data: staff = [] } = useQuery({ queryKey: ["crm", "staff"], queryFn: () => staffFn() });

  const lead = data?.lead ?? null;
  const [form, setForm] = useState<any>({});
  const [fields, setFields] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<"comments" | "tasks" | "calls" | "history">("comments");
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  useEffect(() => {
    if (!lead) return;
    setForm({
      title: lead.title ?? "", phone_e164: lead.phone ?? "", budget: lead.budget ?? "",
      area: lead.area ?? "", address: lead.address ?? "", source: lead.source ?? "",
      direction: lead.direction ?? "", notes: lead.notes ?? "", stage_id: lead.stage_id ?? "",
      assigned_to: lead.assigned_to ?? "", next_action_at: lead.next_action_at?.slice(0, 16) ?? "",
    });
    setFields({ ...(lead.fields ?? {}) });
  }, [lead?.id]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: leadId,
          patch: {
            title: form.title || undefined,
            stage_id: form.stage_id || null,
            assigned_to: form.assigned_to || null,
            budget: form.budget === "" ? null : Number(form.budget),
            area: form.area === "" ? null : Number(form.area),
            address: form.address || null,
            source: form.source || null,
            direction: form.direction || null,
            notes: form.notes || null,
            phone_e164: form.phone_e164 || null,
            next_action_at: form.next_action_at ? new Date(form.next_action_at).toISOString() : null,
          },
          fields,
        },
      }),
    onSuccess: () => {
      toast.success("Картку збережено");
      qc.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });

  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { lead_id: leadId, body: note.trim() } }),
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["crm", "lead-card", leadId] }); },
  });
  const addTask = useMutation({
    mutationFn: () => taskFn({ data: {
      title: taskTitle.trim(), kind: "call", lead_id: leadId,
      due_at: taskDue ? new Date(taskDue).toISOString() : null,
    } as any }),
    onSuccess: () => { setTaskTitle(""); setTaskDue(""); qc.invalidateQueries({ queryKey: ["crm", "lead-card", leadId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити задачу"),
  });

  const comments = useMemo(
    () => (data?.activities ?? []).filter((a: any) => a.kind === "note" || a.kind === "comment" || a.kind === "file"),
    [data],
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 p-0 md:p-6" onClick={onClose}>
      <div className="m-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-none border border-border bg-background md:h-[92vh] md:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-transparent text-lg font-black tracking-tight outline-none" />
            <div className="text-xs text-muted-foreground">
              {lead?.created_at ? new Date(lead.created_at).toLocaleString("uk-UA") : "—"}
              {lead?.status ? ` · ${lead.status}` : ""}
            </div>
          </div>
          <select value={form.stage_id ?? ""} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
            <option value="">Без етапу</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Зберегти
          </button>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Завантаження…</div>
        ) : (
          <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
            {/* Ліва колонка — дані ліда */}
            <div className="space-y-4 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Section title="Про заявку">
                  <Field label="Джерело"><input className={inp} value={form.source ?? ""} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
                  <Field label="Напрям робіт"><input className={inp} value={form.direction ?? ""} onChange={(e) => setForm({ ...form, direction: e.target.value })} /></Field>
                  <Field label="Відповідальний менеджер">
                    <select className={inp} value={form.assigned_to ?? ""} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                      <option value="">—</option>
                      {(staff as any[]).map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name ?? s.user_id}</option>)}
                    </select>
                  </Field>
                  <Field label="Бюджет, ₴"><input type="number" className={inp} value={form.budget ?? ""} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
                  <Field label="Площа, м²"><input type="number" className={inp} value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
                  <Field label="Наступний контакт"><input type="datetime-local" className={inp} value={form.next_action_at ?? ""} onChange={(e) => setForm({ ...form, next_action_at: e.target.value })} /></Field>
                </Section>

                <Section title="Контактні дані">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-muted"><User className="h-4 w-4" /></span>
                    <span className="font-semibold">{lead?.client_name ?? "Ім'я не вказане"}</span>
                  </div>
                  <Field label="Телефон"><input className={inp} value={form.phone_e164 ?? ""} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} /></Field>
                  <div className="flex gap-2">
                    <a href={form.phone_e164 ? `tel:${form.phone_e164}` : undefined}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${form.phone_e164 ? "bg-sky-600 text-white" : "pointer-events-none bg-muted text-muted-foreground"}`}>
                      <Phone className="h-4 w-4" /> Подзвонити
                    </a>
                    <a href={form.phone_e164 ? `sms:${form.phone_e164}` : undefined}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold ${form.phone_e164 ? "border-border" : "pointer-events-none border-border text-muted-foreground"}`}>
                      <MessageSquare className="h-4 w-4" /> Написати
                    </a>
                  </div>
                  <Field label="Адреса"><input className={inp} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                  <Field label="Замітка"><textarea rows={3} className={inp} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </Section>
              </div>

              {LEAD_FIELD_GROUPS.map((g) => (
                <Section key={g.key} title={g.label}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {LEAD_CUSTOM_FIELDS.filter((f) => f.group === g.key).map((f) => (
                      <Field key={f.key} label={f.label}>
                        {f.type === "bool" ? (
                          <button onClick={() => setFields({ ...fields, [f.key]: !fields[f.key] })}
                            className={`h-6 w-11 rounded-full transition-colors ${fields[f.key] ? "bg-primary" : "bg-muted"}`}>
                            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${fields[f.key] ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        ) : f.type === "select" ? (
                          <select className={inp} value={String(fields[f.key] ?? "")} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}>
                            <option value="">—</option>
                            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={f.type === "number" ? "number" : "text"} className={inp}
                            value={String(fields[f.key] ?? "")}
                            onChange={(e) => setFields({ ...fields, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
                        )}
                      </Field>
                    ))}
                  </div>
                </Section>
              ))}
            </div>

            {/* Права колонка — комунікації */}
            <div className="flex min-h-0 flex-col border-t border-border bg-card lg:border-l lg:border-t-0">
              <div className="flex gap-1 border-b border-border px-2 py-2">
                {([["comments", "Коментарі", MessageSquare], ["tasks", "Задачі", CheckSquare],
                   ["calls", "Дзвінки", PhoneCall], ["history", "Історія", History]] as const).map(([k, l, Icon]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                    <Icon className="h-3.5 w-3.5" />{l}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {tab === "comments" ? (
                  comments.length ? comments.map((a: any) => (
                    <div key={a.id} className="rounded-md border border-border px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">{a.actor_name ?? "Система"} · {new Date(a.created_at).toLocaleString("uk-UA")}</div>
                      <div className="text-sm">{a.body}</div>
                    </div>
                  )) : <Empty text="Коментарів ще немає" />
                ) : null}

                {tab === "tasks" ? (
                  (data?.tasks ?? []).length ? (data?.tasks ?? []).map((t: any) => (
                    <div key={t.id} className="rounded-md border border-border px-3 py-2">
                      <div className="text-sm font-medium">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.due_at ? new Date(t.due_at).toLocaleString("uk-UA") : "без терміну"} · {t.status}
                      </div>
                    </div>
                  )) : <Empty text="Задач немає" />
                ) : null}

                {tab === "calls" ? (
                  (data?.calls ?? []).length ? (data?.calls ?? []).map((c: any) => <CallItem key={c.id} call={c} />)
                    : <Empty text="Дзвінків за цим номером немає" />
                ) : null}

                {tab === "history" ? (
                  (data?.activities ?? []).length ? (data?.activities ?? []).map((a: any) => (
                    <div key={a.id} className="border-l-2 border-border pl-3 text-sm">
                      <div className="text-[11px] text-muted-foreground">{a.actor_name ?? "Система"} · {new Date(a.created_at).toLocaleString("uk-UA")}</div>
                      {a.body}
                    </div>
                  )) : <Empty text="Історія порожня" />
                ) : null}
              </div>

              {tab === "tasks" ? (
                <div className="space-y-2 border-t border-border p-3">
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Нова задача…" className={inp} />
                  <div className="flex gap-2">
                    <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inp} />
                    <button onClick={() => taskTitle.trim() && addTask.mutate()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
                      <Plus className="h-4 w-4" /> Додати
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 border-t border-border p-3">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Введіть коментар…" className={inp} />
                  <button onClick={() => note.trim() && addNote.mutate()}
                    className="rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">OK</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className={lbl}>{label}</span>{children}</label>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Дзвінок у картці ліда з прослуховуванням запису. */
function CallItem({ call }: { call: any }) {
  const recFn = useServerFn(getCallRecording);
  const [url, setUrl] = useState<string | null>(null);
  const load = useMutation({
    mutationFn: () => recFn({ data: { call_id: call.id } }),
    onSuccess: (res: any) => (res?.url ? setUrl(res.url) : toast.info(res?.reason ?? "Запис недоступний")),
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося отримати запис"),
  });
  const Icon = call.is_missed ? PhoneMissed : call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 ${call.is_missed ? "text-destructive" : call.direction === "inbound" ? "text-emerald-600" : "text-sky-600"}`} />
        <span className="flex-1 truncate">{call.started_at ? new Date(call.started_at).toLocaleString("uk-UA") : "—"}</span>
        <span className="tabular-nums text-xs">{mmss(Number(call.duration_sec ?? 0))}</span>
        {call.recording_available ? (
          <button onClick={() => !url && load.mutate()} disabled={load.isPending} title="Прослухати запис">
            {load.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-primary" />}
          </button>
        ) : null}
      </div>
      {url ? <audio controls preload="none" src={url} className="mt-2 h-9 w-full" /> : null}
    </div>
  );
}
