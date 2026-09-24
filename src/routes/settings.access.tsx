import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/access")({
  component: AccessSettingsPage,
  head: () => ({ meta: [
    { title: "Доступи і безпека — TERZI ERP" },
    { name: "description", content: "Користувачі, ролі, права, заявки на реєстрацію та журнал дій TERZI ERP." },
    { property: "og:title", content: "Доступи і безпека — TERZI ERP" },
    { property: "og:description", content: "Керування доступами співробітників TERZI ERP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function AccessSettingsPage() {
  const { query, canManageAccess } = useSettingsAccess();
  if (query.isPending) return <div className="h-32 rounded-md bg-muted animate-pulse" aria-busy="true" />;

  const body = (
    <div className={`panel p-4 flex items-start gap-3 ${canManageAccess ? "hover:border-primary transition-colors" : "opacity-60"}`}>
      <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div>
        <div className="font-bold text-sm flex items-center gap-1">Доступи і ролі {canManageAccess && <ArrowRight className="w-3.5 h-3.5" />}</div>
        <p className="text-xs text-muted-foreground mt-1">Співробітники, ролі та права, індивідуальні перекриття, заявки на реєстрацію, журнал дій.</p>
        {!canManageAccess && <p className="text-xs text-muted-foreground mt-1 italic">Доступно власнику системи та операційному адміністратору.</p>}
      </div>
    </div>
  );

  return <div className="grid md:grid-cols-2 gap-3">{canManageAccess ? <Link to="/access" className="block">{body}</Link> : body}</div>;
}
