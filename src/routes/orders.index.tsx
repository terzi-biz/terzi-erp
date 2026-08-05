import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Building2, MapPin, User, Phone, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listOrders, COMMERCIAL_LABELS, PRODUCTION_LABELS, FINANCIAL_LABELS, SERVICE_LABELS, COMMERCIAL_STATUSES } from "@/lib/orders.functions";

export const Route = createFileRoute("/orders/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Замовлення — TERZI" },
    { name: "description", content: "Реєстр замовлень TERZI: клієнти, послуги, статуси, менеджери, дати." },
  ]}),
  component: ObjectsPage,
});

const riskCls: Record<string,string> = {
  green: "bg-success/20 text-success",
  yellow: "bg-warning/20 text-warning",
  red: "bg-destructive/20 text-destructive",
};

function ObjectsPage() {
  const listFn = useServerFn(listOrders);
  const { data = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (data as any[]).filter((r) => {
      if (status !== "all" && r.commercial_status !== status) return false;
      if (!nq) return true;
      return [r.number, r.name, r.address, r.client?.name, r.manager_display]
        .filter(Boolean).join(" ").toLowerCase().includes(nq);
    });
  }, [data, q, status]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Замовлення</h1>
            <p className="text-sm text-muted-foreground mt-1">Центральна сутність: замер → розрахунок → смета → договір → виробництво</p>
          </div>
          <Link to="/orders/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> Створити замовлення
          </Link>
        </div>

        <div className="flex gap-2 flex-wrap items-center bg-card border border-border rounded-lg p-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: номер, назва, адреса, клієнт..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-input bg-background text-sm px-3 py-2">
            <option value="all">Всі комерційні статуси</option>
            {COMMERCIAL_STATUSES.map((s) => <option key={s} value={s}>{COMMERCIAL_LABELS[s]}</option>)}
          </select>
          <div className="text-xs text-muted-foreground ml-auto">Знайдено: <b>{rows.length}</b></div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="scroll-x">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky-thead bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Номер</th>
                  <th className="text-left px-3 py-2">Замовлення</th>
                  <th className="text-left px-3 py-2">Клієнт</th>
                  <th className="text-left px-3 py-2">Послуги</th>
                  <th className="text-left px-3 py-2">Комерція</th>
                  <th className="text-left px-3 py-2">Виробництво</th>
                  <th className="text-left px-3 py-2">Фінанси</th>
                  <th className="text-left px-3 py-2">Ризик</th>
                  <th className="text-left px-3 py-2">Менеджер</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Завантаження…</td></tr>}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Немає замовлень. Створіть перший.
                  </td></tr>
                )}
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.number}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.name}</div>
                      {r.address && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{r.address}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {r.client ? (
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-1"><User className="w-3 h-3" />{r.client.name}</div>
                          {r.client.phone && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{r.client.phone}</div>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(r.services ?? []).map((s: string) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{SERVICE_LABELS[s] ?? s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{COMMERCIAL_LABELS[r.commercial_status] ?? r.commercial_status}</td>
                    <td className="px-3 py-2 text-xs">{PRODUCTION_LABELS[r.production_status] ?? r.production_status}</td>
                    <td className="px-3 py-2 text-xs">{FINANCIAL_LABELS[r.financial_status] ?? r.financial_status}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${riskCls[r.risk_level] ?? ""}`}>{r.risk_level}</span></td>
                    <td className="px-3 py-2 text-xs">{r.manager_display ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to="/orders/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Відкрити <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
