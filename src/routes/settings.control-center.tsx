import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, ToggleRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { CrmKpi, CrmPanel } from "@/components/crm/CrmUi";
import { JournalPanel } from "@/components/automation/JournalPanel";
import { RulesEditor } from "@/components/automation/RulesEditor";
import { useAuth } from "@/lib/auth";
import {
  controlCenterKpis,
  listJournal,
  listRules,
} from "@/lib/automation/automation.functions";

export const Route = createFileRoute("/settings/control-center")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Control Center — Правила — TERZI ERP" },
      {
        name: "description",
        content: "Правила коли / якщо / то: автоматизація статусів замовлень, журнал план/факт.",
      },
      { property: "og:title", content: "Control Center — TERZI ERP" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlCenterPage,
});

function ControlCenterPage() {
  const { roles } = useAuth();
  const canWrite = roles.includes("admin") || roles.includes("director");

  const listRulesFn = useServerFn(listRules);
  const listJournalFn = useServerFn(listJournal);
  const kpisFn = useServerFn(controlCenterKpis);

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => listRulesFn(),
  });

  const { data: journalData, isLoading: journalLoading } = useQuery({
    queryKey: ["automation-journal"],
    queryFn: () => listJournalFn({ data: { limit: 50 } }),
  });

  const { data: kpis } = useQuery({
    queryKey: ["automation-kpis"],
    queryFn: () => kpisFn(),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4 p-3 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Налаштування</div>
            <h1 className="text-xl font-black tracking-tight md:text-3xl">Control Center</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Правила «коли / якщо / то» спрацьовують при зміні статусу замовлення та етапу ліда. Журнал — план/факт виконання дій.
            </p>
          </div>
          <Link to="/settings" className="text-xs font-semibold text-primary hover:underline">
            ← Загальні налаштування
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CrmKpi
            icon={ToggleRight}
            label="Правила увімкнено"
            value={String(kpis?.rules_enabled ?? "—")}
            tone="primary"
          />
          <CrmKpi
            icon={Activity}
            label="Журнал сьогодні"
            value={String(kpis?.journal_today ?? "—")}
            tone="gold"
          />
          <CrmKpi
            icon={AlertTriangle}
            label="Помилки (failed)"
            value={String(kpis?.failed ?? "—")}
            tone="danger"
          />
        </div>

        <CrmPanel className="space-y-3 p-3 md:p-4">
          <h2 className="text-sm font-bold">Правила</h2>
          {rulesLoading ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Завантаження…
            </div>
          ) : (
            <RulesEditor rules={(rulesData?.rules as any[]) ?? []} canWrite={canWrite} />
          )}
        </CrmPanel>

        <CrmPanel className="space-y-3 p-3 md:p-4">
          <h2 className="text-sm font-bold">Журнал (останні 50)</h2>
          <JournalPanel rows={(journalData?.journal as any[]) ?? []} loading={journalLoading} />
        </CrmPanel>
      </div>
    </AppShell>
  );
}
