import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Blocks, Boxes, BriefcaseBusiness, PackageOpen, Ruler, Warehouse } from "lucide-react";

export const Route = createFileRoute("/settings/catalog")({
  component: CatalogSettingsPage,
  head: () => ({ meta: [
    { title: "Ціни, матеріали і роботи — TERZI ERP" },
    { name: "description", content: "Довідники матеріалів, закупівельних і продажних цін, ставок бригад, логістики та обладнання TERZI." },
    { property: "og:title", content: "Ціни, матеріали і роботи — TERZI ERP" },
    { property: "og:description", content: "Master Data для калькуляторів TERZI: ціни змінюються в інтерфейсі, калькулятори читають їх з бази." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

const ITEMS = [
  { to: "/materials", label: "Матеріали та ціни", description: "Категорія, артикул, одиниця, закупівельна (внутрішня) і продажна ціна, постачальник. Зміна ціни — з історією.", icon: PackageOpen },
  { to: "/works", label: "Роботи і ставки бригад", description: "Вид робіт, одиниця (м², п.м, м³), ставка бригади і ціна для клієнта.", icon: BriefcaseBusiness },
  { to: "/logistics", label: "Логістика", description: "Тарифи доставки по місту та області.", icon: Boxes },
  { to: "/equipment", label: "Обладнання та амортизація", description: "Техніка, ресурс і вартість амортизації в кошторисі.", icon: Ruler },
  { to: "/warehouse/nomenclature", label: "Номенклатура складу", description: "Складські позиції, фасування, прив'язка до матеріалів каталогу.", icon: Warehouse },
  { to: "/directions-editor", label: "Напрямки робіт (конструктор)", description: "Склад робіт і матеріалів кожного напрямку для калькуляторів.", icon: Blocks },
] as const;

function CatalogSettingsPage() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Єдине джерело цін для всіх калькуляторів. Нові ціни діють для нових розрахунків; збережені кошториси не перераховуються.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
            <item.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-bold text-sm flex items-center gap-1">{item.label} <ArrowRight className="w-3.5 h-3.5" /></div>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
