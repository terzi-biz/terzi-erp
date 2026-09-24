import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Calculator, Grid3x3, Wallet, Building2, ShieldCheck, Cable, LayoutGrid, Target } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
  head: () => ({ meta: [
    { title: "Налаштування TERZI ERP" },
    { name: "description", content: "Центр налаштувань TERZI ERP: норми витрат, модулі, фінанси, компанія, доступи й інтеграції." },
    { property: "og:title", content: "Налаштування TERZI ERP" },
    { property: "og:description", content: "Єдиний центр налаштувань TERZI ERP з company-wide нормами калькуляторів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

export const SETTINGS_NAV = [
  { to: "/settings", label: "Огляд", icon: LayoutGrid, exact: true, description: "Усі розділи налаштувань в одному місці." },
  { to: "/settings/norms", label: "Норми і коефіцієнти", icon: Calculator, description: "Праймер, газ, мінімалка бригади, амортизація, ПДВ — діє одразу для кошторисів." },
  { to: "/settings/system", label: "Система і модулі", icon: Grid3x3, description: "Модулі, кастомні поля, довідники, марки стяжки й нормативи руберойду." },
  { to: "/settings/finance", label: "Фінанси", icon: Wallet, description: "Фінансові правила, зарплата і KPI." },
  { to: "/settings/sales-plan", label: "План продажів", icon: Target, description: "Плани по місяцях і менеджерах." },
  { to: "/settings/company", label: "Компанія", icon: Building2, description: "Реквізити, причини закриття, брендинг, напрямки." },
  { to: "/settings/access", label: "Доступи і безпека", icon: ShieldCheck, description: "Користувачі, ролі, права, журнал дій." },
  { to: "/settings/integrations", label: "Інтеграції", icon: Cable, description: "Підключення сервісів і обмін даними." },
] as const;

function SettingsLayout() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-5">
        <div className="hatch-accent h-1 w-16 mb-3 rounded" />
        <h1 className="text-2xl md:text-3xl font-black">Налаштування TERZI</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Керування ERP через інтерфейс: норми, модулі, фінанси, компанія, доступи та інтеграції.
        </p>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-4 lg:gap-6">
        <nav className="panel p-2 h-max lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto">
          {SETTINGS_NAV.map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: item.exact === true }}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              inactiveProps={{ className: "hover:bg-accent" }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap">
              <item.icon className="w-4 h-4 shrink-0" /> {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
