import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, AlertTriangle, Hash } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listClients, upsertClient } from "@/lib/clients.functions";
import {
  saveOrder, ORDER_SERVICES, SERVICE_LABELS,
  COMMERCIAL_STATUSES, COMMERCIAL_LABELS,
} from "@/lib/orders.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/new")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Новий замовлення — TERZI" }] }),
  component: NewObjectPage,
});

type NextAction = "measurement" | "calc" | "task" | "lead";

const NEXT_ACTIONS: { v: NextAction; l: string; status: (typeof COMMERCIAL_STATUSES)[number] }[] = [
  { v: "measurement", l: "Призначити замер", status: "measurement_scheduled" },
  { v: "calc",        l: "Створити попередній розрахунок", status: "calculation" },
  { v: "task",        l: "Поставити задачу менеджеру", status: "qualification" },
  { v: "lead",        l: "Зберегти як новий лід", status: "new" },
];

function normPhone(s: string) {
  return s.replace(/\D+/g, "").replace(/^380/, "");
}

function NewObjectPage() {
  const navigate = useNavigate();
  const listClientsFn = useServerFn(listClients);
  const upsertClientFn = useServerFn(upsertClient);
  const saveObjectFn = useServerFn(saveOrder);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => listClientsFn() });

  const [step, setStep] = useState(1);
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<string>("");
  const [newClient, setNewClient] = useState({ name: "", phone: "", email: "" });

  const [form, setForm] = useState({
    name: "", address: "", district: "", order_type: "",
    floor: "" as string, has_lift: false, distance_km: "" as string,
    source: "", crm_link: "", notes: "",
  });
  const [services, setServices] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState<NextAction | "">("");
  const [commercialStatus, setCommercialStatus] =
    useState<(typeof COMMERCIAL_STATUSES)[number] | "">("");

  // Duplicate detection by phone/email
  const duplicates = useMemo(() => {
    if (clientMode !== "new") return [];
    const phone = normPhone(newClient.phone);
    const email = newClient.email.trim().toLowerCase();
    if (!phone && !email) return [];
    return (clients as any[]).filter((c) => {
      const cp = normPhone(c.phone ?? "");
      const ce = (c.email ?? "").trim().toLowerCase();
      return (phone && cp && cp === phone) || (email && ce && ce === email);
    });
  }, [clientMode, newClient.phone, newClient.email, clients]);

  const chosenAction = NEXT_ACTIONS.find((a) => a.v === nextAction);
  const effectiveStatus = commercialStatus || chosenAction?.status || "new";

  const saveMut = useMutation({
    mutationFn: async () => {
      let cid = clientId || null;
      if (clientMode === "new" && newClient.name.trim()) {
        const c = await upsertClientFn({ data: {
          name: newClient.name.trim(),
          phone: newClient.phone || null,
          email: newClient.email || null,
          address: form.address || null,
          notes: null,
          status: "lead",
        } });
        cid = (c as any).id;
      }
      const obj = await saveObjectFn({ data: {
        name: form.name.trim(),
        address: form.address || null,
        district: form.district || null,
        order_type: form.order_type || null,
        floor: form.floor ? Number(form.floor) : null,
        has_lift: form.has_lift,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        source: form.source || null,
        crm_link: form.crm_link || null,
        notes: form.notes || null,
        client_id: cid,
        commercial_status: effectiveStatus as any,
        services: services as any,
      } });
      return obj as any;
    },
    onSuccess: (obj) => {
      toast.success(`Замовлення ${obj.number} створено`);
      navigate({ to: "/orders/$id", params: { id: obj.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });

  const canNext = () => {
    if (step === 1) {
      if (clientMode === "existing") return !!clientId;
      return newClient.name.trim().length > 0
        && (newClient.phone.trim().length > 0 || newClient.email.trim().length > 0);
    }
    if (step === 2) return form.name.trim().length > 0;
    if (step === 3) return services.length > 0;
    if (step === 5) return !!nextAction && !!effectiveStatus;
    return true;
  };

  const useExistingDup = (c: any) => {
    setClientMode("existing");
    setClientId(c.id);
    toast.info(`Обрано існуючого клієнта: ${c.name}`);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black">Новий замовлення</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            Крок {step} з 5 · <Hash className="w-3 h-3" /> номер TRZ-{new Date().getFullYear()}-NNNN
            <span className="text-xs">(присвоюється автоматично при збереженні)</span>
          </p>
        </div>

        <div className="flex gap-1">
          {[1,2,3,4,5].map((n) => (
            <div key={n} className={`flex-1 h-1.5 rounded ${step >= n ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 md:p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Клієнт</h2>
              <div className="flex gap-2">
                <button onClick={() => setClientMode("existing")} className={`flex-1 py-2 rounded text-sm font-semibold ${clientMode === "existing" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Існуючий</button>
                <button onClick={() => setClientMode("new")} className={`flex-1 py-2 rounded text-sm font-semibold ${clientMode === "new" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Новий</button>
              </div>
              {clientMode === "existing" ? (
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— Оберіть клієнта —</option>
                  {(clients as any[]).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <Input label="Назва / ПІБ *" value={newClient.name} onChange={(v) => setNewClient({ ...newClient, name: v })} />
                  <Input label="Телефон *" value={newClient.phone} onChange={(v) => setNewClient({ ...newClient, phone: v })} placeholder="+380..." />
                  <Input label="Email *" value={newClient.email} onChange={(v) => setNewClient({ ...newClient, email: v })} />
                  <p className="text-xs text-muted-foreground">Вкажіть хоча б телефон або email — для перевірки на дублікати.</p>

                  {duplicates.length > 0 && (
                    <div className="mt-2 p-3 rounded border border-yellow-500/40 bg-yellow-500/10">
                      <div className="flex items-center gap-2 text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                        <AlertTriangle className="w-4 h-4" />
                        Знайдено збіги за телефоном/email:
                      </div>
                      <ul className="mt-2 space-y-1">
                        {duplicates.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                            <span>{c.name}{c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}</span>
                            <button type="button" onClick={() => useExistingDup(c)}
                              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground font-semibold">
                              Використати
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Основні дані</h2>
              <Input label="Назва замовлення *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Input label="Адреса" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Район" value={form.district} onChange={(v) => setForm({ ...form, district: v })} />
                <Input label="Тип замовлення" value={form.order_type} onChange={(v) => setForm({ ...form, order_type: v })} placeholder="ЖК, комерція, склад…" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input label="Поверх" value={form.floor} onChange={(v) => setForm({ ...form, floor: v })} type="number" />
                <div>
                  <label className="text-xs text-muted-foreground">Ліфт</label>
                  <label className="flex items-center gap-2 py-2 text-sm">
                    <input type="checkbox" checked={form.has_lift} onChange={(e) => setForm({ ...form, has_lift: e.target.checked })} /> Є
                  </label>
                </div>
                <Input label="Відстань, км" value={form.distance_km} onChange={(v) => setForm({ ...form, distance_km: v })} type="number" />
              </div>
              <Input label="Джерело ліду" value={form.source} onChange={(v) => setForm({ ...form, source: v })} placeholder="Google, рекомендація…" />
              <Input label="Посилання CRM" value={form.crm_link} onChange={(v) => setForm({ ...form, crm_link: v })} />
              <Textarea label="Коментар" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Послуги *</h2>
              <p className="text-xs text-muted-foreground">Оберіть одну або декілька</p>
              <div className="grid grid-cols-2 gap-2">
                {ORDER_SERVICES.map((s) => {
                  const on = services.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => setServices(on ? services.filter((x) => x !== s) : [...services, s])}
                      className={`text-left p-3 rounded border text-sm ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}>
                      <div className="flex items-center gap-2">
                        {on && <Check className="w-4 h-4" />}
                        {SERVICE_LABELS[s]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Попередні параметри</h2>
              <p className="text-xs text-muted-foreground">Детальні параметри та зони заповнюються в карточці замовлення після створення. Тут — лише те, що вже відомо.</p>
              <Textarea label="Попередні нотатки: площа, товщина, доступ, ..."
                value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Наступна дія *</h2>
                {NEXT_ACTIONS.map((o) => (
                  <label key={o.v} className="flex items-center gap-2 p-3 border border-border rounded cursor-pointer hover:bg-secondary/40">
                    <input type="radio" checked={nextAction === o.v}
                      onChange={() => { setNextAction(o.v); if (!commercialStatus) setCommercialStatus(o.status); }} />
                    <span className="text-sm">{o.l}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Комерційний статус *</label>
                <select
                  value={effectiveStatus}
                  onChange={(e) => setCommercialStatus(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                >
                  {COMMERCIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{COMMERCIAL_LABELS[s]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Обирається автоматично відповідно до наступної дії. Можна змінити вручну.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Назад
            </button>
            {step < 5 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canNext()}
                className="inline-flex items-center gap-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-semibold disabled:opacity-40">
                Далі <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !canNext()}
                className="inline-flex items-center gap-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-semibold disabled:opacity-40">
                {saveMut.isPending ? "Створюємо…" : "Створити замовлення"}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" />
    </div>
  );
}
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" />
    </div>
  );
}
