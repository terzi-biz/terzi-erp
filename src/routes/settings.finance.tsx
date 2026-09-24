import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FinanceRulesAdmin } from "@/components/settings/FinanceRulesAdmin";
import { PayrollBridgePanel } from "@/components/settings/PayrollBridgePanel";
import { useSettingsAccess } from "@/lib/useSettingsAccess";

export const Route = createFileRoute("/settings/finance")({
  component: FinanceSettingsPage,
  head: () => ({ meta: [
    { title: "Фінансові налаштування — TERZI ERP" },
    { name: "description", content: "Фінансові правила TERZI ERP та зв'язок із відомістю зарплати і KPI." },
    { property: "og:title", content: "Фінансові налаштування — TERZI ERP" },
    { property: "og:description", content: "Правила фінансів, зарплати і KPI в TERZI ERP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function FinanceSettingsPage() {
  const { query, canManageFinanceRules } = useSettingsAccess();
  const [tab, setTab] = useState<"rules" | "payroll">("rules");

  if (query.isPending) return <div className="h-64 rounded-md bg-muted animate-pulse" aria-busy="true" />;

  return (
    <div>
      <div className="flex gap-1 mb-3">
        <button onClick={() => setTab("rules")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === "rules" ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>Фінансові правила</button>
        <button onClick={() => setTab("payroll")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === "payroll" ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`}>Зарплата і KPI</button>
      </div>
      {tab === "rules" && <FinanceRulesAdmin canEdit={canManageFinanceRules} />}
      {tab === "payroll" && <PayrollBridgePanel />}
    </div>
  );
}
