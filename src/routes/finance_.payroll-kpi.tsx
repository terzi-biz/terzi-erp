import { createFileRoute, Link } from "@tanstack/react-router";
import { BrigadesAdmin } from "@/components/finance/BrigadesAdmin";
import { PayrollBridgePanel, PayrollOpenButton } from "@/components/settings/PayrollBridgePanel";

export const Route = createFileRoute("/finance_/payroll-kpi")({
  head: () => ({
    meta: [
      { title: "Зарплата і KPI — TERZI ERP" },
      { name: "description", content: "Відомість TERZI Payroll KPI з входом через ERP." },
      { property: "og:title", content: "Зарплата і KPI — TERZI ERP" },
      { property: "og:description", content: "Відомість TERZI Payroll KPI з входом через ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayrollKpiPage,
});

function PayrollKpiPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Зарплата і KPI</h1>
          <p className="text-sm text-muted-foreground">Відомість відкривається без повторного входу — доступ за правами ERP (власник / фінанси).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">← Дашборд</Link>
          <PayrollOpenButton />
        </div>
      </div>
      <PayrollBridgePanel showSettings={false} />
      <BrigadesAdmin />
    </div>
  );
}
