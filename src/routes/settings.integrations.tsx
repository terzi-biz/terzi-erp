import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable, ArrowLeftRight, ArrowRight, Megaphone, Webhook } from "lucide-react";

export const Route = createFileRoute("/settings/integrations")({
  component: IntegrationsSettingsPage,
  head: () => ({ meta: [
    { title: "Інтеграції — налаштування TERZI ERP" },
    { name: "description", content: "Підключення Binotel, Finmap, Google, Meta та месенджерів, а також обмін даними TERZI ERP." },
    { property: "og:title", content: "Інтеграції — налаштування TERZI ERP" },
    { property: "og:description", content: "Стан підключень, тест, синхронізація та журнали інтеграцій TERZI ERP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function IntegrationsSettingsPage() {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Link to="/integrations" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
        <Cable className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div><div className="font-bold text-sm flex items-center gap-1">Інтеграції та API <ArrowRight className="w-3.5 h-3.5" /></div>
          <p className="text-xs text-muted-foreground mt-1">Binotel, Finmap, Google, Meta, месенджери: стан підключень, тест, синхронізація, журнали.</p></div>
      </Link>
      <Link to="/data-exchange" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
        <ArrowLeftRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div><div className="font-bold text-sm flex items-center gap-1">Обмін даними <ArrowRight className="w-3.5 h-3.5" /></div>
          <p className="text-xs text-muted-foreground mt-1">Імпорт і експорт даних ERP.</p></div>
      </Link>
      <Link to="/crm/intake" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
        <Webhook className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div><div className="font-bold text-sm flex items-center gap-1">Вхідні ліди (API webhook) <ArrowRight className="w-3.5 h-3.5" /></div>
          <p className="text-xs text-muted-foreground mt-1">Канали приймання та журнал вхідних заявок.</p></div>
      </Link>
      <Link to="/marketing/integrations" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
        <Megaphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div><div className="font-bold text-sm flex items-center gap-1">Маркетинг: інтеграції <ArrowRight className="w-3.5 h-3.5" /></div>
          <p className="text-xs text-muted-foreground mt-1">Підключення маркетингових джерел і рекламних каналів.</p></div>
      </Link>
    </div>
  );
}
