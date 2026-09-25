import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Blocks,
  Boxes,
  BriefcaseBusiness,
  Cable,
  Megaphone,
  PackageOpen,
  Paintbrush,
  Ruler,
} from "lucide-react";
import { SETTINGS_NAV } from "./settings";

const RELATED_SCREENS = [
  { to: "/materials", label: "Матеріали", description: "Каталог матеріалів, цін і характеристик.", icon: PackageOpen },
  { to: "/works", label: "Роботи", description: "Довідник робіт і ставок виконання.", icon: BriefcaseBusiness },
  { to: "/logistics", label: "Логістика", description: "Тарифи та правила доставки матеріалів.", icon: Boxes },
  { to: "/equipment", label: "Обладнання", description: "Обладнання, витрати та правила амортизації.", icon: Ruler },
  { to: "/directions-editor", label: "Напрямки (конструктор)", description: "Налаштування напрямків робіт і розрахунків.", icon: Blocks },
  { to: "/branding", label: "Брендинг", description: "Логотипи та оформлення документів.", icon: Paintbrush },
  { to: "/crm/intake", label: "Вхідні ліди", description: "Перегляд і налаштування вхідних заявок.", icon: Cable },
  { to: "/data-exchange", label: "Обмін даними", description: "Імпорт та експорт даних ERP.", icon: ArrowLeftRight },
  { to: "/marketing/integrations", label: "Маркетинг: інтеграції", description: "Підключення маркетингових джерел і каналів.", icon: Megaphone },
  { to: "/crm/leads", label: "Воронки та етапи CRM", description: "Етапи воронки лідів редагуються в самій воронці.", icon: Blocks },
  { to: "/reports/finance-ceo", label: "Фінанси компанії", description: "Результат фінансових правил: прибуток по компанії та напрямках.", icon: BriefcaseBusiness },
] as const;

export const Route = createFileRoute("/settings/")({
  component: SettingsOverview,
  head: () => ({ meta: [
    { title: "Огляд налаштувань — TERZI ERP" },
    { name: "description", content: "Огляд усіх розділів налаштувань TERZI ERP: норми, модулі, фінанси, компанія, доступи, інтеграції." },
    { property: "og:title", content: "Огляд налаштувань — TERZI ERP" },
    { property: "og:description", content: "Швидкий перехід до будь-якого розділу налаштувань TERZI ERP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function SettingsOverview() {
  const items = SETTINGS_NAV.filter((i) => i.exact !== true);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-bold">Основні налаштування</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <Link key={item.to} to={item.to} className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
              <item.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-sm flex items-center gap-1">{item.label} <ArrowRight className="w-3.5 h-3.5" /></div>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold">Каталог і пов’язані екрани</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {RELATED_SCREENS.map((item) => (
            <Link key={item.to} to={item.to} className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
              <item.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-sm flex items-center gap-1">{item.label} <ArrowRight className="w-3.5 h-3.5" /></div>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
