import { Link, useLocation } from "@tanstack/react-router";
import { useI18n, useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Layers, Home, Snowflake, Hammer, History, Palette, Settings,
  BarChart3, LogOut, Users, ChevronDown, Package, Wrench, Truck, Menu, X, CalendarDays, Sparkles, Building2, HardHat,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { TerziLogo } from "./TerziLogo";

type Mod = "screed" | "roofing" | "insulation" | "demolition";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, user, roles, signOut } = useAuth();
  const primaryRole = roles.includes("admin") ? "admin" : roles.includes("director") ? "director" : roles.includes("finance") ? "finance" : (roles[0] ?? "manager");
  const roleLabels: Record<string, string> = { admin: "Адмін", director: "Директор", manager: "Менеджер", finance: "Фінансист" };
  const displayName = profile?.display_name || user?.email || "Користувач";
  const t = useT();
  const { lang, setLang } = useI18n();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [loc.pathname, loc.searchStr]);

  const moduleIcons: Record<Mod, typeof Layers> = {
    screed: Layers, roofing: Home, insulation: Snowflake, demolition: Hammer,
  };
  const modules: Mod[] = ["screed", "roofing", "insulation", "demolition"];

  const initialOpen = (() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    for (const m of modules) {
      if (loc.pathname === `/${m}` || search.includes(`module=${m}`)) return m;
    }
    return "screed" as Mod;
  })();
  const [openMod, setOpenMod] = useState<Mod | null>(initialOpen);

  const topLinks = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard") },
    { to: "/objects", icon: Building2, label: "Об'єкти" },
    { to: "/operations", icon: CalendarDays, label: "Операційний календар" },
    { to: "/production", icon: HardHat, label: "Виробництво" },

    { to: "/clients", icon: Users, label: "Клієнти" },
  ];
  const bottomLinks = [
    { to: "/history", icon: History, label: t("history") },
    { to: "/reports", icon: BarChart3, label: t("reports") },
    { to: "/branding", icon: Palette, label: t("branding") },
    { to: "/directions-editor", icon: Sparkles, label: "Конструктор напрямків" },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-2 transition-colors ${
      active ? "bg-sidebar-accent text-primary border-primary" : "text-sidebar-foreground/80 border-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 rounded hover:bg-sidebar-accent shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {topLinks.map((n) => (
          <Link key={n.to} to={n.to} className={linkCls(loc.pathname === n.to)}>
            <n.icon className="w-4 h-4" />{n.label}
          </Link>
        ))}

        <div className="mt-2 mb-1 px-5 text-[10px] uppercase tracking-widest text-muted-foreground">Модулі</div>
        {modules.map((m) => {
          const Icon = moduleIcons[m];
          const opened = openMod === m;
          const isActive = loc.pathname === `/${m}` ||
            (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("module") === m);
          return (
            <div key={m}>
              <button onClick={() => setOpenMod(opened ? null : m)}
                className={`w-full ${linkCls(isActive)} justify-between`}>
                <span className="flex items-center gap-3"><Icon className="w-4 h-4" />{t(m)}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${opened ? "rotate-180" : ""}`} />
              </button>
              {opened && (
                <div className="bg-sidebar-accent/40">
                  <Link to={`/${m}`} className={`flex items-center gap-2 pl-12 pr-4 py-2 text-xs ${loc.pathname === `/${m}` ? "text-primary font-bold" : "text-sidebar-foreground/80 hover:text-sidebar-foreground"}`}>
                    <Wrench className="w-3 h-3" /> Калькулятор
                  </Link>
                  <Link to="/materials" search={{ module: m }} className="flex items-center gap-2 pl-12 pr-4 py-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground">
                    <Package className="w-3 h-3" /> Матеріали
                  </Link>
                  <Link to="/works" search={{ module: m }} className="flex items-center gap-2 pl-12 pr-4 py-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground">
                    <Wrench className="w-3 h-3" /> Роботи
                  </Link>
                  <Link to="/equipment" search={{ module: m }} className="flex items-center gap-2 pl-12 pr-4 py-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground">
                    <Package className="w-3 h-3" /> Обладнання
                  </Link>
                  <Link to="/logistics" search={{ module: m }} className="flex items-center gap-2 pl-12 pr-4 py-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground">
                    <Truck className="w-3 h-3" /> Логістика
                  </Link>
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-3 pt-3 border-t border-sidebar-border">
          {bottomLinks.map((n) => (
            <Link key={n.to} to={n.to} className={linkCls(loc.pathname === n.to)}>
              <n.icon className="w-4 h-4" />{n.label}
            </Link>
          ))}
        </div>
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{roleLabels[primaryRole]}</div>
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
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded hover:bg-sidebar-accent">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <TerziLogo size={28} />
          <div className="font-black tracking-tight truncate">TERZI</div>
        </div>
        <button onClick={() => signOut()} className="p-2 -mr-2 rounded hover:bg-sidebar-accent">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {Sidebar}
      </div>

      {/* Mobile drawer */}
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
