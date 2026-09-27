import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { listRegistrationApprovals } from "@/lib/registration.functions";
import {
  LayoutDashboard, Target, Calculator, FileText, Factory, CalendarDays, Package, Wallet, BarChart3, Settings,
  LogOut, ChevronDown, X, Plus, Bell, Ruler, Menu, PanelLeftClose, PanelLeftOpen, ChevronRight,
} from "lucide-react";
import { useState, useEffect, useContext, createContext, type ReactNode } from "react";
import { BrandMark, BrandWordmark } from "./brand/TerziBrand";
import {
  navForRoles, activeSectionKey, activeMobileTab, MODULE_KEYS, NAV_GROUPS, MOBILE_TABS,
  type NavSection, type MobileTab,
} from "./nav-model";
import { useModuleOverlays } from "@/lib/config-kernel/use-module-overlays";
import { moduleViews } from "@/lib/config-kernel/module-overlay";
import { useIsMobile } from "@/hooks/use-mobile";
import { buttonVariants } from "@/components/ui/button";
import { TerziAiAssistant } from "./TerziAiAssistant";

const AppShellContext = createContext(false);

const SECTION_ICON: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  crm: Target,
  calc: Calculator,
  estimates: FileText,
  orders: Factory,
  calendar: CalendarDays,
  warehouse: Package,
  finance: Wallet,
  analytics: BarChart3,
  settings: Settings,
};

const TAB_ICON: Record<MobileTab["key"], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  leads: Target,
  measurements: Ruler,
  calendar: CalendarDays,
  more: Menu,
};

const COLLAPSE_KEY = "tz.sidebar.collapsed";

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

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return s.toUpperCase();
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
  const roleLabel = roleLabels[primaryRole] ?? primaryRole;
  const { lang, setLang } = useI18n();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname, loc.searchStr]);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  };

  const overlays = useModuleOverlays();
  const isMobile = useIsMobile();
  const sections: NavSection[] = navForRoles(roles, moduleViews(MODULE_KEYS, overlays, { roles, lang: lang as "ua" | "ru", mobile: isMobile }));
  const active = activeSectionKey(loc.pathname);
  const activeSection = sections.find((s) => s.key === active);
  const search = (loc.search as Record<string, unknown> | undefined) ?? {};
  const isChildActive = (c: { to: string; search?: Record<string, string> }) =>
    loc.pathname === c.to && Object.entries(c.search ?? {}).every(([k, v]) => search[k] === v);
  const activeChild = activeSection?.children.find((c) => c.search && isChildActive(c))
    ?? activeSection?.children.find((c) => !c.search && c.to === loc.pathname);
  const [openKey, setOpenKey] = useState<string | null>(active);
  useEffect(() => { if (active) setOpenKey(active); }, [active]);
  const mobileTab = activeMobileTab(loc.pathname);

  const topLevel = sections.filter((s) => !s.group);
  const grouped = NAV_GROUPS
    .map((g) => ({ ...g, sections: sections.filter((s) => s.group === g.key) }))
    .filter((g) => g.sections.length > 0);

  const confirmSignOut = () => { if (window.confirm("Вийти з системи на цьому пристрої?")) signOut(); };

  const rowCls = (isActive: boolean, compact: boolean) =>
    `group relative flex w-full items-center gap-3 rounded-md ${compact ? "justify-center px-0 h-10" : "px-4 h-[34px]"} text-[14px] transition-colors ${
      isActive ? "bg-white/[0.08] font-semibold text-white" : "font-medium text-white/80 hover:bg-white/[0.05] hover:text-white"
    }`;
  const goldBar = <span aria-hidden className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-sm bg-[var(--color-gold)]" />;

  const renderSection = (s: NavSection, compact: boolean) => {
    const Icon = SECTION_ICON[s.key] ?? LayoutDashboard;
    const isActive = active === s.key;
    const opened = !compact && openKey === s.key;
    const badge = s.key === "settings" ? pendingApprovals || undefined : undefined;
    const icon = <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-[var(--color-gold-2)]" : "opacity-70"}`} strokeWidth={1.8} />;
    if (!s.children.length || compact) {
      return (
        <Link key={s.key} to={s.to} className={rowCls(isActive, compact)} title={compact ? s.label : undefined} aria-current={isActive ? "page" : undefined}>
          {isActive ? goldBar : null}
          {icon}
          {compact ? null : <span className="min-w-0 flex-1 truncate">{s.label}</span>}
          {compact && badge ? <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[var(--color-gold)]" /> : null}
        </Link>
      );
    }
    return (
      <div key={s.key}>
        <button type="button" onClick={() => setOpenKey(opened ? null : s.key)} aria-expanded={opened} className={rowCls(isActive, false)}>
          {isActive ? goldBar : null}
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{s.label}</span>
          {badge ? <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-gold)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--color-gold-foreground)]">{badge}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${opened ? "rotate-180" : ""}`} />
        </button>
        {opened && (
          <div className="mb-1.5 ml-[25px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
            {s.children.map((c) => {
              const on = isChildActive(c) && (c.search ? true : !activeSection?.children.some((o) => o.search && isChildActive(o)));
              return (
                <Link
                  key={`${s.key}:${c.to}:${JSON.stringify(c.search ?? {})}`}
                  to={c.to}
                  search={(c.search ?? {}) as never}
                  className={`block truncate rounded px-2 py-1.5 text-[13px] transition-colors ${
                    on ? "bg-white/[0.08] font-semibold text-[var(--color-gold-2)]" : "text-white/60 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {c.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSidebar = (mode: "desktop" | "drawer") => {
    const compact = mode === "desktop" && collapsed;
    return (
      <aside
        style={{ backgroundColor: "var(--color-sidebar)" }}
        className={`isolate flex h-full shrink-0 flex-col text-white ${mode === "drawer" ? "w-[296px] max-w-[86vw]" : compact ? "w-[72px]" : "w-64"}`}
      >
        <div className={`flex h-24 items-center border-b border-white/[0.08] ${compact ? "justify-center px-2" : "justify-between gap-2 pl-6 pr-4"}`}>
          <Link to="/" aria-label="TERZI ERP — дашборд" className="min-w-0">
            {compact ? <BrandMark size={34} /> : <BrandWordmark tone="white" width={176} />}
          </Link>
          {mode === "drawer" ? (
            <button type="button" onClick={() => setMobileOpen(false)} className="shrink-0 rounded p-1.5 hover:bg-white/10" aria-label="Закрити меню">
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <nav className={`flex-1 overflow-y-auto py-4 ${compact ? "px-2" : "px-3"}`} aria-label="Головне меню">
          <div className="space-y-0.5">{topLevel.map((s) => renderSection(s, compact))}</div>
          {grouped.map((g) => (
            <div key={g.key} className={compact ? "mt-3 border-t border-white/[0.08] pt-3 space-y-0.5" : "mt-5 space-y-0.5"}>
              {!compact && g.sections.length > 1 ? (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/45">{g.label}</div>
              ) : null}
              {g.sections.map((s) => renderSection(s, compact))}
            </div>
          ))}
        </nav>

        <div className={`border-t border-white/[0.08] ${compact ? "p-2" : "p-3"} space-y-2`}>
          {mode === "drawer" ? (
            <div className="flex items-center gap-2.5 rounded-md bg-white/[0.06] p-2.5">
              <Avatar url={profile?.avatar_url} name={displayName} size={36} tone="gold" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{displayName}</div>
                <div className="text-[11px] text-white/55">{roleLabel}</div>
              </div>
            </div>
          ) : null}
          {!compact ? (
            <div className="flex items-center gap-1 text-xs">
              {(["ua", "ru"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  className={`flex-1 rounded py-1.5 font-semibold uppercase transition-colors ${lang === l ? "bg-[var(--color-gold)] text-[var(--color-gold-foreground)]" : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14]"}`}>
                  {l}
                </button>
              ))}
              <button type="button" onClick={confirmSignOut} className="ml-1 grid h-[30px] w-9 place-items-center rounded bg-white/[0.08] text-white/80 hover:bg-white/[0.14]" aria-label="Вийти" title="Вийти">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={confirmSignOut} className="grid h-9 w-full place-items-center rounded text-white/70 hover:bg-white/10" aria-label="Вийти" title="Вийти">
              <LogOut className="h-4 w-4" />
            </button>
          )}
          {mode === "desktop" ? (
            <button type="button" onClick={toggleCollapsed}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white ${compact ? "justify-center" : ""}`}
              aria-label={compact ? "Розгорнути меню" : "Згорнути меню"} title={compact ? "Розгорнути меню" : "Згорнути меню"}>
              {compact ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Згорнути меню</>}
            </button>
          ) : null}
        </div>
      </aside>
    );
  };

  return (
    <div className="tz-has-tabbar relative flex min-h-screen bg-background">
      {/* Мобільний верхній бар (< md) */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between px-4 text-white md:hidden" style={{ backgroundColor: "var(--color-sidebar)", paddingTop: "env(safe-area-inset-top)" }}>
        <Link to="/" aria-label="TERZI ERP — дашборд"><BrandWordmark tone="white" width={104} /></Link>
        <div className="flex items-center gap-2">
          {canManageAccess && pendingApprovals ? (
            <Link to="/access" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label={`Заявки на доступ: ${pendingApprovals}`}>
              <Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-gold)]" />
            </Link>
          ) : null}
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Профіль і меню"><Avatar url={profile?.avatar_url} name={displayName} size={34} tone="light" /></button>
        </div>
      </div>

      <div className="sticky top-0 hidden h-screen md:block">{renderSidebar("desktop")}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <div className="absolute inset-0 bg-[#0B1B3A]/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full shadow-2xl">{renderSidebar("drawer")}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-3 border-b border-border bg-card/95 px-6 backdrop-blur md:flex">
          <nav aria-label="Хлібні крихти" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="shrink-0 text-muted-foreground">{activeSection?.label ?? "TERZI ERP"}</span>
            {activeChild && activeChild.label !== activeSection?.label ? (
              <>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-semibold text-foreground">{activeChild.label}</span>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-muted-foreground xl:inline">
              {new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv" })}
            </span>
            <Link to="/operations" className="grid h-9 w-9 place-items-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground" aria-label="Календар" title="Календар">
              <CalendarDays className="h-[18px] w-[18px]" />
            </Link>
            {canManageAccess && pendingApprovals ? (
              <Link to="/access" className="relative grid h-9 w-9 place-items-center rounded-md text-foreground/70 hover:bg-muted" aria-label={`Заявки на доступ: ${pendingApprovals}`} title="Заявки на доступ">
                <Bell className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-destructive)]" />
              </Link>
            ) : null}
            <Link to="/calc" className={buttonVariants({ variant: "gold", size: "sm" }) + " gap-1.5 font-semibold"}>
              <Plus className="h-3.5 w-3.5" /> Розрахунок
            </Link>
            <div className="ml-2 flex items-center gap-2.5 border-l border-border pl-4">
              <Avatar url={profile?.avatar_url} name={displayName} size={34} tone="navy" />
              <div className="hidden min-w-0 lg:block">
                <div className="max-w-[160px] truncate text-sm font-semibold leading-tight">{displayName}</div>
                <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        <TerziAiAssistant />
      </div>

      {/* Нижня панель вкладок (< md) */}
      <nav
        aria-label="Швидка навігація"
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-card/98 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MOBILE_TABS.map((t) => {
          const Icon = TAB_ICON[t.key];
          const on = t.key === "more" ? mobileOpen : mobileTab === t.key && !mobileOpen;
          const inner = (
            <>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${on ? "bg-[var(--color-gold-soft)]" : ""}`}>
                <Icon className={`h-[19px] w-[19px] ${on ? "text-[var(--color-primary)]" : "text-muted-foreground"}`} strokeWidth={on ? 2.1 : 1.8} />
              </span>
              <span className={`text-[11px] leading-none ${on ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{t.label}</span>
            </>
          );
          const cls = "flex h-16 flex-col items-center justify-center gap-1";
          return t.to ? (
            <Link key={t.key} to={t.to} className={cls} aria-current={on ? "page" : undefined}>{inner}</Link>
          ) : (
            <button key={t.key} type="button" className={cls} onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen}>{inner}</button>
          );
        })}
      </nav>
    </div>
  );
}

function Avatar({ url, name, size, tone }: { url?: string | null; name: string; size: number; tone: "navy" | "gold" | "light" }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const cls = tone === "navy"
    ? "bg-[var(--color-primary)] text-white"
    : tone === "gold"
      ? "bg-[var(--color-gold)] text-[var(--color-gold-foreground)]"
      : "bg-white text-[var(--color-primary)]";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full text-[12px] font-bold ${cls}`} style={{ width: size, height: size }}>
      {initials(name)}
    </span>
  );
}
