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
  Loader2, PhoneMissed, PhoneIncoming, PhoneOutgoing, User, Plus, Briefcase, Navigation,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { getLeadCard, saveLead, listCrmStaff } from "@/lib/crm/board.functions";
import { addLeadNote, upsertTask, getCallRecording, convertLeadToOrder } from "@/lib/crm.functions";
import { LEAD_CUSTOM_FIELDS, LEAD_FIELD_GROUPS } from "@/lib/crm/lead-fields";
import { CrmEyebrow, CrmSpec, crmButton, crmButtonOutline } from "@/components/crm/CrmUi";
import { LeadZonesPanel } from "@/components/crm/LeadZonesPanel";
import { LeadMeasurementsPanel } from "@/components/crm/LeadMeasurementsPanel";
import { SourceBadge } from "@/components/crm/SourceBadge";
import { MessengerLinks } from "@/components/crm/MessengerLinks";
import { OrderReceivables } from "@/components/finance/OrderReceivables";
import { Calculator } from "lucide-react";

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
  const convertFn = useServerFn(convertLeadToOrder);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "lead-card", leadId],
    queryFn: () => cardFn({ data: { lead_id: leadId } }),
  });
  const { data: staff = [] } = useQuery({ queryKey: ["crm", "staff"], queryFn: () => staffFn() });

  const lead = data?.lead ?? null;
  const [form, setForm] = useState<any>({});
  const [fields, setFields] = useState<Record<string, any>>({});
  const [zones, setZones] = useState<any[]>([]);
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
      client_name: lead.client_name ?? "", client_email: lead.client_email ?? "", client_company: lead.client_company ?? "",
      assigned_to: lead.assigned_to ?? "", next_action_at: lead.next_action_at?.slice(0, 16) ?? "",
    });
    setFields({ ...(lead.fields ?? {}) });
    setZones([...(lead.zones ?? [])]);
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
          zones: zones.filter((z) => String(z.name ?? "").trim()),
          client: form.client_name?.trim()
            ? { name: form.client_name.trim(), email: form.client_email || null, company: form.client_company || null }
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Картку збережено");
      qc.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });

  const convert = useMutation({
    mutationFn: () => convertFn({ data: { lead_id: leadId } }),
    onSuccess: (r: any) => {
      toast.success(r?.created ? `Замовлення ${r.number ?? ""} створено` : "Лід вже має замовлення");
      qc.invalidateQueries({ queryKey: ["crm"] });
      navigate({ to: "/orders/$id", params: { id: r.order_id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити замовлення"),
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
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-[#0B1B3A]/55 p-0 backdrop-blur-[2px] md:items-stretch" onClick={onClose}>
      <div className="flex h-[calc(100%-12px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-t-2xl border-border bg-background shadow-2xl md:h-full md:rounded-none md:border-l"
        role="dialog" aria-modal="true" aria-label={form.title || "Картка ліда"}
        onClick={(e) => e.stopPropagation()}>
        {/* Mobile: шапка full-screen sheet */}
        <div className="border-b border-border bg-card px-4 pb-3 pt-2 md:hidden">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="truncate">Лід{lead?.created_at ? ` · ${new Date(lead.created_at).toLocaleDateString("uk-UA")}` : ""}</span>
              </div>
              <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })}
                aria-label="Назва ліда" className="mt-0.5 w-full bg-transparent font-display text-[22px] font-bold leading-tight outline-none" />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {stages.find((s) => s.id === form.stage_id) ? <span className="tz-pill tz-pill--gold">● {stages.find((s) => s.id === form.stage_id)!.name}</span> : null}
                {lead ? <SourceBadge cabinet={lead.cabinet} source={lead.source} /> : null}
              </div>
            </div>
            <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted" aria-label="Закрити картку"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 md:flex md:px-5">
          <div className="min-w-0 flex-1">
            <CrmEyebrow>Картка ліда / Робочий простір</CrmEyebrow>
            <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full bg-transparent font-display text-lg font-bold outline-none" />
            <div className="text-xs text-muted-foreground">
              {lead?.created_at ? new Date(lead.created_at).toLocaleString("uk-UA") : "—"}
              {lead?.status ? ` · ${lead.status}` : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {form.area ? <CrmSpec label="Площа" value={`${Number(form.area)} м²`} tone="primary" /> : null}
              {form.direction ? <CrmSpec label="Напрям" value={form.direction} tone="gold" /> : null}
              {fields["object_type"] ? <CrmSpec label="Тип об'єкта" value={String(fields["object_type"])} /> : null}
            </div>

          </div>
          <select value={form.stage_id ?? ""} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
            <option value="">Без етапу</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => convert.mutate()} disabled={convert.isPending}
            className={`${crmButtonOutline} disabled:opacity-60`}>
            {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Створити замовлення
          </button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className={crmButton}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Зберегти
          </button>

          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md hover:bg-muted" aria-label="Закрити картку"><X className="h-5 w-5" /></button>
        </div>

        {isLoading ? (
          <div className="flex-1 p-8 text-center text-sm text-muted-foreground">Завантаження…</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
            {/* Ліва колонка — дані ліда */}
            <div className="flex flex-col gap-4 p-4 md:p-5 lg:overflow-y-auto">
              {/* Mobile: швидкі дії та зведення */}
              <div className="order-first space-y-3 md:hidden">
                <div className="grid grid-cols-2 gap-2">
                  <a href={form.phone_e164 ? `tel:${form.phone_e164}` : undefined} aria-disabled={!form.phone_e164}
                    className={`flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3 text-[13px] font-semibold ${form.phone_e164 ? "" : "pointer-events-none opacity-50"}`}>
                    <Phone className="h-5 w-5" /> Дзвінок
                  </a>
                  <a href={form.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address)}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!form.address}
                    className={`flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3 text-[13px] font-semibold ${form.address ? "" : "pointer-events-none opacity-50"}`}>
                    <Navigation className="h-5 w-5" /> Маршрут
                  </a>
                </div>
                <MessengerLinks phone={form.phone_e164} />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-[#EEF1F6] p-3.5 text-[12px] [&_dd]:mt-0.5 [&_dd]:text-[15px] [&_dd]:font-semibold [&_dd]:text-foreground [&_dt]:text-muted-foreground">
                  <div><dt>Телефон</dt><dd className="truncate tabular-nums">{form.phone_e164 || "—"}</dd></div>
                  <div><dt>Адреса</dt><dd className="truncate">{form.address || "—"}</dd></div>
                  <div><dt>Площа</dt><dd>{form.area ? `${Number(form.area)} м²` : "—"}</dd></div>
                  <div><dt>Сума</dt><dd className="tabular-nums">{form.budget ? `${new Intl.NumberFormat("uk-UA").format(Number(form.budget))} ₴` : "—"}</dd></div>
                  <div><dt>Менеджер</dt><dd className="truncate">{lead?.manager_name ?? "—"}</dd></div>
                  <div><dt>Наступний контакт</dt><dd>{lead?.next_action_at ? new Date(lead.next_action_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>
                </dl>
                <label className="block">
                  <span className={lbl}>Етап</span>
                  <select value={form.stage_id ?? ""} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} className={`${inp} mt-1 h-11`}>
                    <option value="">Без етапу</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>
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
                  <Field label="Імʼя та прізвище клієнта"><input className={inp} placeholder="Напр. Олександр Петренко" value={form.client_name ?? ""} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
                  <Field label="Email"><input type="email" className={inp} value={form.client_email ?? ""} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></Field>
                  <Field label="Компанія"><input className={inp} value={form.client_company ?? ""} onChange={(e) => setForm({ ...form, client_company: e.target.value })} /></Field>
                  {!lead?.client_id && <p className="text-[11px] text-muted-foreground">Після збереження імені буде створено картку клієнта.</p>}
                  <Field label="Телефон"><input className={inp} value={form.phone_e164 ?? ""} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} /></Field>
                  <div className="hidden md:block space-y-2">
                    <a href={form.phone_e164 ? `tel:${form.phone_e164}` : undefined}
                      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold ${form.phone_e164 ? "bg-primary text-primary-foreground" : "pointer-events-none bg-muted text-muted-foreground"}`}>
                      <Phone className="h-4 w-4" /> Подзвонити
                    </a>
                    <MessengerLinks phone={form.phone_e164} />
                  </div>
                  <Field label="Адреса"><input className={inp} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                  <Field label="Замітка"><textarea rows={3} className={inp} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </Section>
              </div>

              <Section title="Замовлення, кошторис і оплати">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => { sessionStorage.setItem("terzi.pendingLead", leadId); navigate({ to: "/calc" }); }}
                    className={`${crmButtonOutline} justify-center`}>
                    <Calculator className="h-4 w-4" /> Розрахувати кошторис
                  </button>
                  {lead?.order_id ? (
                    <button type="button" onClick={() => navigate({ to: "/orders/$id", params: { id: lead.order_id! } })}
                      className={`${crmButtonOutline} justify-center`}>
                      <Briefcase className="h-4 w-4" /> Картка замовлення
                    </button>
                  ) : (
                    <button type="button" onClick={() => convert.mutate()} disabled={convert.isPending}
                      className={`${crmButtonOutline} justify-center disabled:opacity-60`}>
                      {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Створити замовлення
                    </button>
                  )}
                  {lead?.client_id ? (
                    <button type="button" onClick={() => navigate({ to: "/clients/$id", params: { id: lead.client_id! } })}
                      className={`${crmButtonOutline} justify-center`}>
                      <User className="h-4 w-4" /> Картка клієнта
                    </button>
                  ) : null}
                </div>
                {lead?.order_id ? (
                  <div className="mt-3"><OrderReceivables orderId={lead.order_id} /></div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Договір, оплати з Finmap і борг зʼявляться після створення замовлення.</p>
                )}
              </Section>

              <LeadZonesPanel zones={zones} onChange={setZones} />

              <div className="max-md:order-first">
              <LeadMeasurementsPanel
                leadId={leadId}
                lead={lead}
                measurements={(data?.measurements ?? []) as any[]}
              />
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
            <div className="flex flex-col border-t border-border bg-card/95 lg:min-h-0 lg:border-l lg:border-t-0">
              <div className="flex gap-1 border-b border-border px-2 py-2">
                {([["comments", "Коментарі", MessageSquare], ["tasks", "Задачі", CheckSquare],
                   ["calls", "Дзвінки", PhoneCall], ["history", "Історія", History]] as const).map(([k, l, Icon]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                    <Icon className="h-3.5 w-3.5" />{l}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-2 p-3 lg:overflow-y-auto">
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
        {/* Mobile: закріплені дії внизу */}
        <div className="flex gap-2 border-t border-border bg-card px-4 pt-3 md:hidden" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="tz-btn-gold h-12 flex-1 text-[15px]">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Зберегти
          </button>
          <button onClick={() => convert.mutate()} disabled={convert.isPending}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-[14px] font-semibold disabled:opacity-60">
            {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Замовлення
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="border-b border-border pb-2 font-display text-sm font-bold">{title}</div>
      {children}
    </section>
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
