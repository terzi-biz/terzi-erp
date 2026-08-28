import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { listRegistrationApprovals } from "@/lib/registration.functions";
import {
  LayoutDashboard, Target, Calculator, FileText, Building2, Wallet, BarChart3, Settings,
  LogOut, ChevronDown, Menu, X,
} from "lucide-react";
import { useState, useEffect, useContext, createContext, type ReactNode } from "react";
import { TerziLogo } from "./TerziLogo";
import { navForRoles, activeSectionKey, type NavSection } from "./nav-model";

const AppShellContext = createContext(false);

const SECTION_ICON: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  crm: Target,
  calc: Calculator,
  estimates: FileText,
  orders: Building2,
  finance: Wallet,
  analytics: BarChart3,
  settings: Settings,
};

/** Guards against nested AppShell usage: inner instances render children only. */
export function AppShell({ children }: { children: ReactNode }) {
  const nested = useContext(AppShellContext);
  if (nested) return <>{children}</>;
  return (
    <AppShellContext.Provider value={true}>
      <AppShellLayout>{children}</AppShellLayout>
    </AppShellContext.Provider>
  );
}

function AppShellLayout({ children }: { children: ReactNode }) {
  const { profile, user, roles, signOut } = useAuth();
  const primaryRole = roles.includes("admin")
    ? "admin"
    : roles.includes("director")
      ? "director"
      : roles.includes("finance")
        ? "finance"
        : (roles[0] ?? "manager");
  const canManageAccess = roles.includes("admin") || roles.includes("director");
  const listApprovals = useServerFn(listRegistrationApprovals);
  const { data: approvals = [] } = useQuery({
    queryKey: ["registration-approvals", "nav"],
    queryFn: () => listApprovals(),
    enabled: canManageAccess,
    refetchInterval: 60_000,
  });
  const pendingApprovals = approvals.filter((row) => row.status === "pending").length;
  const roleLabels: Record<string, string> = { admin: "Адмін", director: "Директор", manager: "Менеджер", finance: "Фінансист" };
  const displayName = profile?.display_name || user?.email || "Користувач";
  const { lang, setLang } = useI18n();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname, loc.searchStr]);

  const sections: NavSection[] = navForRoles(roles);
  const active = activeSectionKey(loc.pathname);
  const [openKey, setOpenKey] = useState<string | null>(active);
  useEffect(() => { if (active) setOpenKey(active); }, [active]);

  const linkCls = (isActive: boolean) =>
    `flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-2 transition-colors ${
      isActive ? "bg-sidebar-accent text-primary border-primary" : "text-sidebar-foreground/80 border-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground"
    }`;

  const Sidebar = (
    <aside
      style={{ backgroundColor: "var(--color-sidebar)" }}
      className="w-72 md:w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-full opacity-100 isolate"
    >
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <TerziLogo size={40} />
          <div className="min-w-0">
            <div className="font-black tracking-tight text-base leading-none">TERZI</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 truncate">Будівельна компанія</div>
          </div>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 rounded hover:bg-sidebar-accent shrink-0" aria-label="Закрити меню">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Головне меню">
        {sections.map((s) => {
          const Icon = SECTION_ICON[s.key] ?? LayoutDashboard;
          const isActive = active === s.key;
          const opened = openKey === s.key;
          const badge = s.key === "settings" ? pendingApprovals || undefined : undefined;
          if (!s.children.length) {
            return (
              <Link key={s.key} to={s.to} className={linkCls(isActive)}>
                <Icon className="w-4 h-4" />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
              </Link>
            );
          }
          return (
            <div key={s.key}>
              <button
                onClick={() => setOpenKey(opened ? null : s.key)}
                aria-expanded={opened}
                className={`w-full ${linkCls(isActive)} justify-between`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-black text-primary-foreground">{badge}</span> : null}
                  <ChevronDown className={`w-3 h-3 transition-transform ${opened ? "rotate-180" : ""}`} />
                </span>
              </button>
              {opened && (
                <div className="bg-sidebar-accent/40">
                  {s.children.map((c) => (
                    <Link
                      key={`${s.key}:${c.to}`}
                      to={c.to}
                      className={`flex items-center gap-2 pl-12 pr-4 py-2 text-xs ${loc.pathname === c.to ? "text-primary font-bold" : "text-sidebar-foreground/80 hover:text-sidebar-foreground"}`}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-1 text-xs">
          {(["ua", "ru"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`flex-1 py-1.5 rounded font-semibold uppercase ${lang === l ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="bg-secondary/60 border border-border rounded-md p-2.5">
          <div className="flex items-center gap-2">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{displayName}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{roleLabels[primaryRole] ?? primaryRole}</div>
            </div>
          </div>
          <button onClick={() => { if (window.confirm("Вийти з системи на цьому пристрої?")) signOut(); }} className="mt-2 w-full flex items-center justify-center gap-1.5 bg-background hover:bg-accent border border-border rounded py-1.5 text-[11px] font-semibold">
            <LogOut className="w-3 h-3" /> Вийти
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex relative brand-watermark">
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded hover:bg-sidebar-accent" aria-label="Відкрити меню">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <TerziLogo size={28} />
          <div className="font-black tracking-tight truncate">TERZI</div>
        </div>
        <button onClick={() => { if (window.confirm("Вийти з системи на цьому пристрої?")) signOut(); }} className="p-2 -mr-2 rounded hover:bg-sidebar-accent" aria-label="Вийти">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="hidden md:block">{Sidebar}</div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full shadow-2xl" style={{ backgroundColor: "var(--color-sidebar)" }}>{Sidebar}</div>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0 relative">{children}</main>
    </div>
  );
}
