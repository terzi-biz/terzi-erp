/**
 * Центр канонічних звітів. Layout зі спільним періодом і вкладками;
 * кожна вкладка — окремий маршрут /reports/*.
 */
import { createFileRoute, redirect, Outlet, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const REPORT_TABS = [
  { to: "/reports", label: "Огляд" },
  { to: "/reports/funnel", label: "Воронка" },
  { to: "/reports/tasks", label: "Задачі" },
  { to: "/reports/telephony", label: "Телефонія" },
  { to: "/reports/finmap", label: "Finmap" },
  { to: "/reports/marketing", label: "Marketing" },
  { to: "/reports/operations", label: "Operations" },
  { to: "/reports/finance", label: "Finance" },
  { to: "/reports/administration", label: "Administration" },
  { to: "/reports/ceo", label: "CEO" },
] as const;

export const Route = createFileRoute("/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ReportsLayout,
});

function ReportsLayout() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 p-4 md:p-6">
        <header>
          <div className="hatch-accent mb-2 h-1 w-14 rounded" />
          <h1 className="font-display text-2xl font-black">Звіти TERZI</h1>
          <p className="text-xs text-muted-foreground">Канонічні звіти зі спільним періодом: воронка, задачі, телефонія, фінанси, маркетинг, операції, адміністрування.</p>
        </header>
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {REPORT_TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: t.to === "/reports" }}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </AppShell>
  );
}
