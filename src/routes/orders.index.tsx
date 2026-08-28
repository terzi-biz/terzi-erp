import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Building2, MapPin, Phone, ExternalLink, CalendarDays, User } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listOrders } from "@/lib/orders.functions";
import {
  COMMERCIAL_LABELS, PRODUCTION_LABELS, FINANCIAL_LABELS, SERVICE_LABELS,
  COMMERCIAL_STATUSES, PRODUCTION_STATUSES, ORDER_SERVICES, RISK_LABELS,
} from "@/lib/orders.constants";
import { computeOrderKpi, crmUrl } from "@/lib/order-management";
import { formatUah } from "@/lib/screed-calc";

export const Route = createFileRoute("/orders/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Замовлення — TERZI" },
    { name: "description", content: "Реєстр замовлень TERZI: клієнти, послуги, статуси, менеджери, план/факт по грошах і строках." },
    { property: "og:title", content: "Замовлення — TERZI" },
    { property: "og:description", content: "Картки замовлень TERZI з планом і фактом по доходу, витратах, маржі та строках." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: OrdersPage,
});

const riskBar: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
};
const riskChip: Record<string, string> = {
  green: "bg-success/15 text-success",
  yellow: "bg-warning/15 text-warning",
  red: "bg-destructive/15 text-destructive",
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtMoney = (v: number | null) => (v == null ? "—" : formatUah(v));
const fmtPct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

function OrdersPage() {
  const listFn = useServerFn(listOrders);
  const { data = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [prod, setProd] = useState("all");
  const [service, setService] = useState("all");
  const [manager, setManager] = useState("all");
  const [risk, setRisk] = useState("all");

  const managers = useMemo(
    () => Array.from(new Set((data as any[]).map((r) => r.manager_display).filter(Boolean))).sort(),
    [data],
  );

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (data as any[]).filter((r) => {
      if (status !== "all" && r.commercial_status !== status) return false;
      if (prod !== "all" && r.production_status !== prod) return false;
      if (risk !== "all" && r.risk_level !== risk) return false;
      if (manager !== "all" && r.manager_display !== manager) return false;
      if (service !== "all" && !(r.services ?? []).includes(service)) return false;
      if (!nq) return true;
      return [r.number, r.name, r.address, r.client?.name, r.client?.phone, r.manager_display]
        .filter(Boolean).join(" ").toLowerCase().includes(nq);
    });
  }, [data, q, status, prod, service, manager, risk]);

  const resetFilters = () => { setQ(""); setStatus("all"); setProd("all"); setService("all"); setManager("all"); setRisk("all"); };
  const selectCls = "rounded-md border border-input bg-background text-xs px-2.5 py-2";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Замовлення</h1>
            <p className="text-sm text-muted-foreground mt-1">Замір → розрахунок → кошторис → договір → виробництво</p>
          </div>
          <Link to="/orders/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> Створити замовлення
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: номер, назва, адреса, клієнт, телефон…"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <select value={service} onChange={(e) => setService(e.target.value)} className={selectCls}>
              <option value="all">Всі напрямки</option>
              {ORDER_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              <option value="all">Комерція: всі</option>
              {COMMERCIAL_STATUSES.map((s) => <option key={s} value={s}>{COMMERCIAL_LABELS[s]}</option>)}
            </select>
            <select value={prod} onChange={(e) => setProd(e.target.value)} className={selectCls}>
              <option value="all">Виробництво: всі</option>
              {PRODUCTION_STATUSES.map((s) => <option key={s} value={s}>{PRODUCTION_LABELS[s]}</option>)}
            </select>
            <select value={manager} onChange={(e) => setManager(e.target.value)} className={selectCls}>
              <option value="all">Менеджер: всі</option>
              {managers.map((m) => <option key={m as string} value={m as string}>{m as string}</option>)}
            </select>
            <select value={risk} onChange={(e) => setRisk(e.target.value)} className={selectCls}>
              <option value="all">Ризик: всі</option>
              {Object.entries(RISK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button onClick={resetFilters} className="hover:text-foreground underline">Скинути фільтри</button>
            <span>Знайдено: <b className="text-foreground">{rows.length}</b> з {(data as any[]).length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Завантаження…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground bg-card border border-border rounded-lg">
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Замовлень за цими умовами немає.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r: any) => <OrderCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function OrderCard({ r }: { r: any }) {
  const kpi = computeOrderKpi(r);
  const crm = crmUrl(r);
  return (
    <div className="relative group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/60 transition-colors">
      <span className={`absolute left-0 top-0 h-full w-1 ${riskBar[r.risk_level] ?? "bg-muted"}`} />
      <Link to="/orders/$id" params={{ id: r.id }} className="block p-4 pl-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-muted-foreground">{r.number}</div>
            <div className="font-bold leading-tight truncate">{r.name}</div>
            {r.address && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{r.address}
              </div>
            )}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0 ${riskChip[r.risk_level] ?? ""}`}>
            {RISK_LABELS[r.risk_level] ?? r.risk_level}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {(r.services ?? []).map((s: string) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{SERVICE_LABELS[s] ?? s}</span>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/40 p-2 text-center">
          <Metric label="Договір" value={fmtMoney(kpi.plan.revenue)} />
          <Metric label="План витрат" value={fmtMoney(kpi.plan.cost)} />
          <Metric label="Маржа план" value={fmtPct(kpi.plan.margin)} />
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" />{r.manager_display ?? "—"}</span>
          <span className="flex items-center gap-1 truncate"><CalendarDays className="w-3 h-3 shrink-0" />Старт: {fmtDate(r.planned_start)}</span>
          {(kpi.days.plan != null || kpi.days.fact != null) && (
            <span className="col-span-2">
              Строк: план {kpi.days.plan ?? "—"} дн · факт {kpi.days.fact ?? "—"} дн
              {kpi.days.delta != null && (
                <b className={kpi.days.delta > 0 ? "text-destructive ml-1" : "text-success ml-1"}>
                  ({kpi.days.delta > 0 ? "+" : ""}{kpi.days.delta})
                </b>
              )}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 text-[10px]">
          <Chip>{COMMERCIAL_LABELS[r.commercial_status] ?? r.commercial_status}</Chip>
          <Chip>{PRODUCTION_LABELS[r.production_status] ?? r.production_status}</Chip>
          <Chip>{FINANCIAL_LABELS[r.financial_status] ?? r.financial_status}</Chip>
        </div>
      </Link>

      <div className="flex items-center gap-3 border-t border-border px-4 py-2 pl-5 text-xs">
        {r.client?.name ? <span className="truncate font-semibold">{r.client.name}</span> : <span className="text-muted-foreground">Клієнта не вказано</span>}
        {r.client?.phone && (
          <a href={`tel:${String(r.client.phone).replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Phone className="w-3 h-3" />{r.client.phone}
          </a>
        )}
        {crm && (
          <a href={crm} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
            KeyCRM <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-bold truncate">{value}</div>
    </div>
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{children}</span>;
}
