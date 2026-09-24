import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Palette, Compass, ArrowRight } from "lucide-react";
import { CloseReasonsAdmin, CompanyRequisitesAdmin } from "@/components/settings/ReferenceAdmin";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/company")({
  component: CompanySettingsPage,
  head: () => ({ meta: [
    { title: "Налаштування компанії — TERZI ERP" },
    { name: "description", content: "Реквізити ФОП, причини закриття угод, брендинг і напрямки робіт TERZI." },
    { property: "og:title", content: "Налаштування компанії — TERZI ERP" },
    { property: "og:description", content: "Реквізити, довідники компанії, брендинг і напрямки робіт TERZI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function CompanySettingsPage() {
  const { query, canManageSettings } = useSettingsAccess();
  const [tab, setTab] = useState<"requisites" | "reasons">("requisites");

  if (query.isPending) return <div className="h-64 rounded-md bg-muted animate-pulse" aria-busy="true" />;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Link to="/branding" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
          <Palette className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div><div className="font-bold text-sm flex items-center gap-1">Брендинг <ArrowRight className="w-3.5 h-3.5" /></div>
            <p className="text-xs text-muted-foreground mt-1">Контакти, переваги й тексти для клієнтських кошторисів.</p></div>
        </Link>
        <Link to="/directions-editor" className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
          <Compass className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div><div className="font-bold text-sm flex items-center gap-1">Напрямки <ArrowRight className="w-3.5 h-3.5" /></div>
            <p className="text-xs text-muted-foreground mt-1">Редактор напрямків робіт і їх версій.</p></div>
        </Link>
      </div>

      <div className="flex gap-1">
        <button onClick={() => setTab("requisites")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === "requisites" ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>Реквізити ФОП</button>
        <button onClick={() => setTab("reasons")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === "reasons" ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>Причини закриття</button>
      </div>
      {tab === "requisites" && <CompanyRequisitesAdmin canEdit={canManageSettings} />}
      {tab === "reasons" && <CloseReasonsAdmin canEdit={canManageSettings} />}
    </div>
  );
}
