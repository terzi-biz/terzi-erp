import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, X, PhoneIncoming, PhoneOutgoing, PhoneCall, PlayCircle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listCalls, upsertCall, getCallRecording } from "@/lib/crm.functions";


export const Route = createFileRoute("/crm/calls")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Дзвінки — CRM TERZI" },
    { name: "description", content: "Журнал дзвінків TERZI: вхідні та вихідні виклики, тривалість, зв'язок з лідами." },
    { property: "og:title", content: "Дзвінки — CRM TERZI" },
    { property: "og:description", content: "Історія телефонних комунікацій з клієнтами TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CallsPage,
});

const empty = { direction: "inbound", from_number: "", to_number: "", duration_sec: 0, status: "answered", started_at: "" };

function CallsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCalls);
  const saveFn = useServerFn(upsertCall);
  const { data = [] } = useQuery({ queryKey: ["crm", "calls"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const rows = useMemo(() => {
    const nn = q.replace(/\D/g, "");
    return (data as any[]).filter((c) =>
      (dir === "all" || c.direction === dir) &&
      (!nn || (c.phone_norm || "").includes(nn)));
  }, [data, q, dir]);

  const stats = useMemo(() => {
    const arr = data as any[];
    return {
      total: arr.length,
      inbound: arr.filter((c) => c.direction === "inbound").length,
      minutes: Math.round(arr.reduce((a, c) => a + Number(c.duration_sec || 0), 0) / 60),
    };
  }, [data]);

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: {
      direction: p.direction,
      from_number: p.from_number || null,
      to_number: p.to_number || null,
      duration_sec: Number(p.duration_sec) || 0,
      status: p.status || null,
      started_at: p.started_at ? new Date(p.started_at).toISOString() : new Date().toISOString(),
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm"] }); setOpen(false); setForm(empty); toast.success("Дзвінок збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка збереження"),
  });

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><PhoneCall className="w-6 h-6" /> Дзвінки</h1>
            <p className="text-sm text-muted-foreground">Журнал викликів (ручний запис до підключення телефонії)</p>
          </div>
          <button onClick={() => { setForm(empty); setOpen(true); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground flex items-center gap-2">
            <Plus className="w-4 h-4" /> Записати дзвінок
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Усього" value={String(stats.total)} />
          <Kpi label="Вхідні" value={String(stats.inbound)} />
          <Kpi label="Хвилин" value={String(stats.minutes)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {[["all", "Усі"], ["inbound", "Вхідні"], ["outbound", "Вихідні"]].map(([k, l]) => (
            <button key={k} onClick={() => setDir(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${dir === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за номером…"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
          {rows.map((c) => <CallRow key={c.id} call={c} />)}
          {!rows.length ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Дзвінків немає</div> : null}
        </div>

      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-md bg-card rounded-t-2xl md:rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold">Записати дзвінок</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Напрямок</span>
              <select className={inp} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="inbound">Вхідний</option>
                <option value="outbound">Вихідний</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Номер</span>
              <input className={inp} value={form.direction === "inbound" ? form.from_number : form.to_number}
                onChange={(e) => setForm(form.direction === "inbound" ? { ...form, from_number: e.target.value } : { ...form, to_number: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Тривалість, сек</span>
                <input type="number" min={0} className={inp} value={form.duration_sec}
                  onChange={(e) => setForm({ ...form, duration_sec: e.target.value.replace(/^0+(?=\d)/, "") })} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Статус</span>
                <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="answered">Відповіли</option>
                  <option value="missed">Пропущений</option>
                  <option value="busy">Зайнято</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Час початку</span>
              <input type="datetime-local" className={inp} value={form.started_at}
                onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-md border border-border py-2 text-sm font-semibold">Скасувати</button>
              <button disabled={save.isPending} onClick={() => save.mutate(form)}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground">Зберегти</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-black">{value}</div>
    </div>
  );
}

/** Рядок журналу з відтворенням аудіозапису розмови. */
function CallRow({ call }: { call: any }) {
  const recFn = useServerFn(getCallRecording);
  const [url, setUrl] = useState<string | null>(call.recording_url ?? null);
  const [open, setOpen] = useState(false);
  const load = useMutation({
    mutationFn: () => recFn({ data: { call_id: call.id } }),
    onSuccess: (res: any) => {
      if (res?.url) { setUrl(res.url); setOpen(true); }
      else toast.info(res?.reason ?? "Запис недоступний");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося отримати запис"),
  });

  const canHaveRecord = call.recording_url || call.recording_available || call.external_source === "binotel";

  return (
    <div className="px-3 py-2.5 text-sm">
      <div className="flex items-center gap-3">
        {call.direction === "inbound"
          ? <PhoneIncoming className="w-4 h-4 text-primary shrink-0" />
          : <PhoneOutgoing className="w-4 h-4 text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{call.direction === "inbound" ? call.from_number : call.to_number}</div>
          <div className="text-xs text-muted-foreground truncate">
            {new Date(call.started_at).toLocaleString("uk-UA")} · {call.status || "—"}
          </div>
        </div>
        <div className="text-xs font-semibold whitespace-nowrap tabular-nums">
          {Math.floor((call.duration_sec || 0) / 60)}:{String((call.duration_sec || 0) % 60).padStart(2, "0")}
        </div>
        {canHaveRecord ? (
          <button
            onClick={() => (url ? setOpen((v) => !v) : load.mutate())}
            disabled={load.isPending}
            title="Прослухати запис розмови"
            className={`shrink-0 grid h-8 w-8 place-items-center rounded-lg border transition-colors ${
              open ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}>
            {load.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          </button>
        ) : <span className="w-8 shrink-0" />}
      </div>

      {open && url ? (
        <div className="mt-2 flex items-center gap-2">
          <audio controls preload="none" src={url} className="h-9 w-full" />
          <a href={url} target="_blank" rel="noreferrer"
            className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" title="Відкрити запис">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      ) : null}
    </div>
  );
}

