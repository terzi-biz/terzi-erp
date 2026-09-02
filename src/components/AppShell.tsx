import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { listRegistrationApprovals } from "@/lib/registration.functions";
import {
  LayoutDashboard, Target, Calculator, FileText, Building2, Wallet, BarChart3, Settings,
  LogOut, ChevronDown, Menu, X, Plus,
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
  const activeSection = sections.find((s) => s.key === active);
  const activeChild = activeSection?.children.find((c) => c.to === loc.pathname);
  const [openKey, setOpenKey] = useState<string | null>(active);
  useEffect(() => { if (active) setOpenKey(active); }, [active]);

  const linkCls = (isActive: boolean) =>
    `flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold rounded-md mx-2 transition-colors ${
      isActive
        ? "bg-white/12 text-white shadow-[inset_2px_0_0_var(--color-gold)]"
        : "text-white/70 hover:bg-white/8 hover:text-white"
    }`;

  const Sidebar = (
    <aside
      style={{ backgroundColor: "var(--color-sidebar)" }}
      className="w-72 md:w-60 shrink-0 text-white flex flex-col h-full isolate"
    >
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <TerziLogo size={34} />
          <div className="min-w-0">
            <div className="font-black tracking-tight text-[15px] leading-none">TERZI</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/50 mt-1 truncate">ERP · Одеса</div>
          </div>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 rounded hover:bg-white/10 shrink-0" aria-label="Закрити меню">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5" aria-label="Головне меню">
        {sections.map((s) => {
          const Icon = SECTION_ICON[s.key] ?? LayoutDashboard;
          const isActive = active === s.key;
          const opened = openKey === s.key;
          const badge = s.key === "settings" ? pendingApprovals || undefined : undefined;
          if (!s.children.length) {
            return (
              <Link key={s.key} to={s.to} className={linkCls(isActive)}>
                <Icon className="w-4 h-4 shrink-0" />
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
                  {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-gold)] px-1.5 text-[10px] font-black text-[var(--color-gold-foreground)]">{badge}</span> : null}
                  <ChevronDown className={`w-3 h-3 transition-transform ${opened ? "rotate-180" : ""}`} />
                </span>
              </button>
              {opened && (
                <div className="mt-0.5 mb-1.5 ml-6 mr-2 border-l border-white/12 pl-3 space-y-0.5">
                  {s.children.map((c) => (
                    <Link
                      key={`${s.key}:${c.to}`}
                      to={c.to}
                      className={`block rounded px-2 py-1.5 text-[12px] transition-colors ${
                        loc.pathname === c.to ? "bg-white/10 text-[var(--color-gold)] font-bold" : "text-white/60 hover:text-white hover:bg-white/6"
                      }`}
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

      <div className="p-3 border-t border-white/10 space-y-2">
        <div className="flex items-center gap-1 text-xs">
          {(["ua", "ru"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`flex-1 py-1.5 rounded font-semibold uppercase transition-colors ${lang === l ? "bg-[var(--color-gold)] text-[var(--color-gold-foreground)]" : "bg-white/8 text-white/70 hover:bg-white/14"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-md bg-white/8 p-2.5">
          <div className="flex items-center gap-2">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--color-gold)] text-[var(--color-gold-foreground)] grid place-items-center text-xs font-black">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate text-white">{displayName}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">{roleLabels[primaryRole] ?? primaryRole}</div>
            </div>
          </div>
          <button onClick={() => { if (window.confirm("Вийти з системи на цьому пристрої?")) signOut(); }} className="mt-2 w-full flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/18 rounded py-1.5 text-[11px] font-semibold text-white/85">
            <LogOut className="w-3 h-3" /> Вийти
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex relative bg-background">
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 text-white" style={{ backgroundColor: "var(--color-sidebar)" }}>
        <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded hover:bg-white/10" aria-label="Відкрити меню">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <TerziLogo size={26} />
          <div className="font-black tracking-tight truncate">TERZI</div>
        </div>
        <button onClick={() => { if (window.confirm("Вийти з системи на цьому пристрої?")) signOut(); }} className="p-2 -mr-2 rounded hover:bg-white/10" aria-label="Вийти">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="hidden md:block sticky top-0 h-screen">{Sidebar}</div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full shadow-2xl" style={{ backgroundColor: "var(--color-sidebar)" }}>{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 pt-14 md:pt-0 flex flex-col">
        <header className="hidden md:flex sticky top-0 z-30 h-14 items-center gap-3 border-b border-border bg-card/95 backdrop-blur px-6">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{activeSection?.label ?? "TERZI"}</div>
            <div className="text-sm font-bold truncate leading-tight">{activeChild?.label ?? activeSection?.label ?? "Дашборд"}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden lg:inline">
              {new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
            <Link to="/calc" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
              <Plus className="w-3.5 h-3.5" /> Розрахунок
            </Link>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
