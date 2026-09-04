import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Search, PhoneIncoming, PhoneOutgoing, PhoneCall, PhoneMissed, PlayCircle, Loader2,
  ExternalLink, Sparkles, Globe, Facebook, MessageCircle, PhoneForwarded, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getCallRecording } from "@/lib/crm.functions";
import { listCallsFeed } from "@/lib/calls.functions";
import type { CallFeedRow, CallSourceBucket } from "@/lib/calls.server";

export const Route = createFileRoute("/crm/calls")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Дзвінки — аналітика телефонії TERZI" },
    { name: "description", content: "Журнал і аналітика дзвінків TERZI: джерела 0800, сайт, OLX, пропущені, перші звернення, хто телефонував і кому." },
    { property: "og:title", content: "Дзвінки — аналітика телефонії TERZI" },
    { property: "og:description", content: "Аналітика телефонії: джерела дзвінків, пропущені, перші звернення, навантаження менеджерів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CallsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return iso(d); };

const SOURCE_META: Record<CallSourceBucket, { label: string; icon: any; cls: string }> = {
  "0800": { label: "0800", icon: PhoneForwarded, cls: "bg-sky-100 text-sky-800 border-sky-200" },
  olx: { label: "OLX", icon: Building2, cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  site: { label: "Сайт", icon: Globe, cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  google: { label: "Google", icon: Search, cls: "bg-amber-100 text-amber-900 border-amber-200" },
  meta: { label: "Meta", icon: Facebook, cls: "bg-blue-100 text-blue-800 border-blue-200" },
  messenger: { label: "Месенджер", icon: MessageCircle, cls: "bg-violet-100 text-violet-800 border-violet-200" },
  callback: { label: "Callback", icon: PhoneCall, cls: "bg-teal-100 text-teal-800 border-teal-200" },
  cold: { label: "Холодний", icon: PhoneOutgoing, cls: "bg-slate-100 text-slate-700 border-slate-200" },
  unknown: { label: "Джерело невідоме", icon: Globe, cls: "bg-muted text-muted-foreground border-border" },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function CallsPage() {
  const feedFn = useServerFn(listCallsFeed);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(iso(new Date()));
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "inbound" | "outbound" | "missed" | "new">("all");
  const [source, setSource] = useState<"all" | CallSourceBucket>("all");
  const [staff, setStaff] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["calls-feed", from, to],
    queryFn: () => feedFn({ data: { from, to } }),
  });

  const feed = (data?.rows ?? []) as CallFeedRow[];
  /** Перелік співробітників періоду для фільтра «Співробітник». */
  const staffOptions = useMemo(
    () => Array.from(new Set(feed.map((c) => c.employee_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "uk")),
    [feed],
  );
  const all = useMemo(
    () => (staff === "all" ? feed : feed.filter((c) => c.employee_name === staff)),
    [feed, staff],
  );

  const stats = useMemo(() => {
    const answered = all.filter((c) => !c.is_missed);
    const bySource = new Map<CallSourceBucket, number>();
    const byStaff = new Map<string, number>();
    for (const c of all) {
      bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
      if (c.employee_name) byStaff.set(c.employee_name, (byStaff.get(c.employee_name) ?? 0) + 1);
    }
    return {
      total: all.length,
      inbound: all.filter((c) => c.direction === "inbound").length,
      outbound: all.filter((c) => c.direction === "outbound").length,
      missed: all.filter((c) => c.is_missed).length,
      first: all.filter((c) => c.is_new_call).length,
      minutes: Math.round(all.reduce((a, c) => a + c.duration_sec, 0) / 60),
      answerRate: all.length ? Math.round((answered.length / all.length) * 100) : null,
      bySource: Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]),
      byStaff: Array.from(byStaff.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [all]);

  const rows = useMemo(() => {
    const nn = q.replace(/\D/g, "");
    const text = q.trim().toLowerCase();
    return all.filter((c) => {
      if (tab === "inbound" && c.direction !== "inbound") return false;
      if (tab === "outbound" && c.direction !== "outbound") return false;
      if (tab === "missed" && !c.is_missed) return false;
      if (tab === "new" && !c.is_new_call) return false;
      if (source !== "all" && c.source !== source) return false;
      if (!text) return true;
      if (nn && (c.counterparty ?? "").replace(/\D/g, "").includes(nn)) return true;
      return `${c.caller_label ?? ""} ${c.callee_label ?? ""} ${c.client_name ?? ""}`.toLowerCase().includes(text);
    });
  }, [all, q, tab, source]);


  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><PhoneCall className="w-6 h-6" /> Дзвінки</h1>
            <p className="text-sm text-muted-foreground">Аналітика телефонії: джерела, пропущені, перші звернення, менеджери</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={staff} onChange={(e) => setStaff(e.target.value)} className={inp} title="Співробітник">
              <option value="all">Усі співробітники</option>
              {staffOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
          </div>

        </div>

        {data?.truncated ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Показані не всі дзвінки періоду — звузьте діапазон дат.
          </div>
        ) : null}

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Усього" value={String(stats.total)} />
          <Kpi label="Вхідні" value={String(stats.inbound)} />
          <Kpi label="Вихідні" value={String(stats.outbound)} />
          <Kpi label="Пропущені" value={String(stats.missed)} tone={stats.missed ? "warn" : "default"} />
          <Kpi label="Вперше телефонують" value={String(stats.first)} />
          <Kpi label="Відповіли" value={stats.answerRate == null ? "немає даних" : `${stats.answerRate}%`} hint={`${stats.minutes} хв розмов`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-bold mb-3">Джерела дзвінків</div>
            <div className="space-y-1.5">
              {stats.bySource.map(([key, count]) => {
                const meta = SOURCE_META[key];
                const max = Math.max(1, ...stats.bySource.map((s) => s[1]));
                return (
                  <button key={key} onClick={() => setSource(source === key ? "all" : key)}
                    className={`w-full flex items-center gap-3 text-left rounded-sm px-1 py-0.5 ${source === key ? "ring-1 ring-primary" : ""}`}>
                    <span className={`w-36 shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full border px-2 py-0.5 ${meta.cls}`}>
                      <meta.icon className="w-3 h-3" />{meta.label}
                    </span>
                    <span className="flex-1 h-5 rounded-sm bg-muted/50 overflow-hidden">
                      <span className="block h-full bg-primary/70" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
                    </span>
                    <span className="w-12 text-right text-[12px] font-semibold tabular-nums">{count}</span>
                  </button>
                );
              })}
              {!stats.bySource.length ? <div className="text-sm text-muted-foreground">Немає даних</div> : null}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-bold mb-3">Дзвінки по співробітниках</div>
            <div className="space-y-2">
              {stats.byStaff.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm border-b border-border/60 pb-1.5 last:border-0">
                  <span className="truncate">{name}</span>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              ))}
              {!stats.byStaff.length ? <div className="text-sm text-muted-foreground">Немає даних про співробітників</div> : null}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {([["all", "Усі"], ["inbound", "Вхідні"], ["outbound", "Вихідні"], ["missed", "Пропущені"], ["new", "Вперше"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${tab === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{l}</button>
          ))}
          {source !== "all" ? (
            <button onClick={() => setSource("all")} className="rounded-full px-3 py-1.5 text-xs font-semibold border border-primary text-primary">
              Джерело: {SOURCE_META[source].label} ✕
            </button>
          ) : null}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за номером або іменем…"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
          {isLoading ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Завантаження…</div> : null}
          {rows.map((c) => <CallRow key={c.id} call={c} />)}
          {!isLoading && !rows.length ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Дзвінків немає</div> : null}
        </div>
      </div>
    </AppShell>
  );
}

const inp = "rounded-md border border-border bg-background px-3 py-2 text-sm";

function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1.5 text-[22px] leading-none font-black tracking-tight ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div> : null}
    </div>
  );
}

/** Рядок журналу: напрямок, джерело, хто кому телефонував, запис розмови. */
function CallRow({ call }: { call: CallFeedRow }) {
  const recFn = useServerFn(getCallRecording);
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const load = useMutation({
    mutationFn: () => recFn({ data: { call_id: call.id } }),
    onSuccess: (res: any) => {
      if (res?.url) { setUrl(res.url); setOpen(true); }
      else toast.info(res?.reason ?? "Запис недоступний");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося отримати запис"),
  });

  const inbound = call.direction === "inbound";
  const meta = SOURCE_META[call.source];
  const Icon = call.is_missed ? PhoneMissed : inbound ? PhoneIncoming : PhoneOutgoing;
  const iconCls = call.is_missed ? "text-destructive" : inbound ? "text-emerald-600" : "text-sky-600";

  return (
    <div className="px-3 py-2.5 text-sm">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate flex items-center gap-2">
            <span className="truncate">{call.caller_label ?? call.counterparty ?? "—"}</span>
            <span className="text-muted-foreground">→</span>
            <span className="truncate text-muted-foreground">{call.callee_label ?? "—"}</span>
            {call.is_new_call ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px] font-bold">
                <Sparkles className="w-3 h-3" />вперше
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {call.started_at ? new Date(call.started_at).toLocaleString("uk-UA") : "—"} · {call.counterparty ?? "номер невідомий"}
            {call.is_missed ? " · пропущений" : ""}
          </div>
        </div>
        <span className={`hidden sm:inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold rounded-full border px-2 py-0.5 ${meta.cls}`}>
          <meta.icon className="w-3 h-3" />{call.source_raw && call.source !== "unknown" ? meta.label : meta.label}
        </span>
        <div className="text-xs font-semibold whitespace-nowrap tabular-nums w-12 text-right">{mmss(call.duration_sec)}</div>
        {call.recording_available ? (
          <button onClick={() => (url ? setOpen((v) => !v) : load.mutate())} disabled={load.isPending}
            title="Прослухати запис розмови"
            className={`shrink-0 grid h-8 w-8 place-items-center rounded-lg border transition-colors ${
              open ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
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
