import { Link, useLocation } from "@tanstack/react-router";
import { useI18n, useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, Layers, Home, Snowflake, Hammer, Package, Wrench, History, Palette, Settings, BarChart3, LogOut } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, user, roles, signOut } = useAuth();
  const primaryRole = roles[0] ?? "manager";
  const roleLabels: Record<string, string> = { admin: "Адмін", director: "Директор", manager: "Менеджер", finance: "Фінансист" };
  const displayName = profile?.display_name || user?.email || "Користувач";
  const t = useT();
  const { lang, setLang } = useI18n();
  const { role, setRole } = useUserRole();
  const loc = useLocation();

  const nav = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard") },
    { to: "/screed", icon: Layers, label: t("screed") },
    { to: "/roofing", icon: Home, label: t("roofing") },
    { to: "/insulation", icon: Snowflake, label: t("insulation") },
    { to: "/demolition", icon: Hammer, label: t("demolition") },
    { to: "/materials", icon: Package, label: t("materials") },
    { to: "/works", icon: Wrench, label: t("works") },
    { to: "/history", icon: History, label: t("history") },
    { to: "/reports", icon: BarChart3, label: t("reports") },
    { to: "/branding", icon: Palette, label: t("branding") },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary grid place-items-center text-primary-foreground font-black text-lg">T</div>
            <div>
              <div className="font-black tracking-tight text-base leading-none">TERZI</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Estimate System</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {nav.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-2 transition-colors ${active ? "bg-sidebar-accent text-primary border-primary" : "text-sidebar-foreground/80 border-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}>
                <n.icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="flex items-center gap-1 text-xs">
            {(["ua", "ru"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`flex-1 py-1.5 rounded font-semibold uppercase ${lang === l ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>{l}</button>
            ))}
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs">
            <option value="admin">Адмін</option>
            <option value="director">Директор</option>
            <option value="manager">Менеджер</option>
            <option value="finance">Фінансист</option>
          </select>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
