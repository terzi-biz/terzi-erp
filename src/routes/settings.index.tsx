import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SETTINGS_NAV } from "./settings";

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
    <div className="grid sm:grid-cols-2 gap-3">
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
  );
}
