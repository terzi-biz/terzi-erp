import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatUah } from "@/lib/screed-calc";
import { listEstimates } from "@/lib/estimates.functions";
import { Layers, Home, Snowflake, Hammer, Plus, History, Users, Palette, BarChart3, Settings } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

interface E { id: string; created_at: string; total_client: number; }

function Dashboard() {
  const t = useT();
  const { user } = useAuth();
  const list = useServerFn(listEstimates);
  const { data: rows = [] } = useQuery({ queryKey: ["estimates"], queryFn: () => list(), enabled: !!user });
  const history = rows as E[];
  const total = history.reduce((a, e) => a + Number(e.total_client), 0);
  const avg = history.length ? total / history.length : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = history.filter((e) => new Date(e.created_at).getTime() >= today.getTime()).length;

  const modules = [
    { to: "/screed", icon: Layers, label: t("screed"), active: true, desc: "Напівсуха машинна стяжка" },
    { to: "/roofing", icon: Home, label: t("roofing"), active: true, desc: "Рубемаст / ПВХ-мембрана Sika" },
    { to: "/insulation", icon: Snowflake, label: t("insulation"), active: true, desc: "EPS, XPS, мінвата, полістиролбетон" },
    { to: "/demolition", icon: Hammer, label: t("demolition"), active: true, desc: "Стяжка, плитка, покрівля, перегородки" },
  ];

  const quick = [
    { to: "/screed", icon: Plus, label: t("newEstimate") },
    { to: "/clients", icon: Users, label: "Клієнти" },
    { to: "/history", icon: History, label: t("history") },
    { to: "/reports", icon: BarChart3, label: t("managerReport") },
    { to: "/branding", icon: Palette, label: t("branding") },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-3xl font-black tracking-tight">{t("appName")}</h1>
          <p className="text-muted-foreground mt-1">{t("tagline")}</p>
        </div>
        <Link to="/screed" className="bg-primary text-primary-foreground px-5 py-3 rounded-md font-bold uppercase tracking-wide text-sm hover:opacity-90 inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t("newEstimate")}
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("totalEstimates"), value: String(history.length) },
          { label: t("totalSum"), value: formatUah(total) },
          { label: t("avgCheck"), value: formatUah(avg) },
          { label: t("todayCount"), value: String(todayCount) },
        ].map((k) => (
          <div key={k.label} className="panel p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-black mt-2 text-primary">{k.value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-bold uppercase tracking-wider text-muted-foreground mb-4">{t("pickModule")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link key={m.to} to={m.to} className="panel p-6 hover:border-primary transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 hatch-accent h-1 w-20" />
              <m.icon className="w-10 h-10 text-primary mb-3" />
              <div className="font-black text-xl">{m.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
              <div className={`mt-4 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded inline-block ${m.active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                {m.active ? t("active") : t("comingSoon")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold uppercase tracking-wider text-muted-foreground mb-4">Швидкі дії</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quick.map((q) => (
            <Link key={q.to + q.label} to={q.to} className="panel p-4 hover:border-primary text-center transition-all">
              <q.icon className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-xs font-semibold">{q.label}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
