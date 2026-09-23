/** Блок «Зарплата і KPI» на дашборді — лише для owner/фінансів (сервер повертає null інакше). */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, ChevronRight } from "lucide-react";
import { getPayrollDashboardSummary } from "@/lib/brigades.functions";

const ND = "немає даних";
export function PayrollKpiCard() {
  const fn = useServerFn(getPayrollDashboardSummary);
  const { data } = useQuery({ queryKey: ["payroll-dashboard"], queryFn: () => fn(), staleTime: 60_000, retry: false });
  if (!data) return null;
  const dt = (s: string | null) => (s ? new Date(s).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—");
  return (
    <Link to="/finance/payroll-kpi" className="crm-panel block p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-black"><Wallet className="h-5 w-5 text-primary" />Зарплата і KPI</h3>
        <span className="flex items-center text-xs text-primary">Відкрити <ChevronRight className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
        <div><small className="block text-muted-foreground">Зв'язок з відомістю</small><b>{data.configured ? "Налаштовано" : "Потрібен серверний секрет"}</b></div>
        <div><small className="block text-muted-foreground">Виплачено бригадам {data.month} (підтв.)</small><b>{data.confirmedPayouts === null ? ND : `${data.confirmedPayouts.toLocaleString("uk-UA")} грн`}</b></div>
        <div><small className="block text-muted-foreground">Виплат без підтвердження</small><b>{data.unconfirmedPayouts}</b></div>
        <div><small className="block text-muted-foreground">Факт обсягів без підтвердження</small><b>{data.unconfirmedFact}</b></div>
        <div><small className="block text-muted-foreground">Остання відправка</small><b>{dt(data.lastSent)}</b>{data.lastError && <span className="block text-destructive">Помилка {dt(data.lastError.at)}</span>}</div>
      </div>
    </Link>
  );
}
