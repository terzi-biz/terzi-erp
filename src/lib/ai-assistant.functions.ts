import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  question: z.string().trim().min(3).max(1200),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type AssistantLink = { label: string; href: string };
type AssistantResult = {
  answer: string;
  links: AssistantLink[];
  period: { from: string; to: string };
  generatedAt: string;
  sources: string[];
};

function allowedLinks(): AssistantLink[] {
  return [
    { label: "CEO-звіт", href: "/reports/ceo" },
    { label: "Воронка", href: "/reports/funnel" },
    { label: "Задачі", href: "/reports/tasks" },
    { label: "Телефонія", href: "/reports/telephony" },
    { label: "Маркетинг", href: "/reports/marketing" },
    { label: "Операції", href: "/reports/operations" },
    { label: "Інтеграції", href: "/integrations" },
  ];
}

function readText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export const askTerziAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => inputSchema.parse(value))
  .handler(async ({ context, data }): Promise<AssistantResult> => {
    if (data.from > data.to) throw new Error("Початок періоду не може бути пізніше завершення");

    const [{ dashboardOverview }, { buildReconciliationReport }, access] = await Promise.all([
      import("./analytics.server"),
      import("./integrations/telemetry.server"),
      import("./access.server"),
    ]);
    const actor = await access.loadActor(context.userId);
    if (!actor.isOwner) await access.requirePermission(context.userId, "reports", "view");

    const overview = await dashboardOverview(context.supabase, { from: data.from, to: data.to });
    let reconciliation: unknown = { unavailable: true };
    try {
      reconciliation = await buildReconciliationReport(context.userId);
    } catch {
      reconciliation = { unavailable: true, reason: "Немає дозволу або даних інтеграцій" };
    }

    const maySeeFinance = await access.canViewInternalPrices(context.userId);
    let finance: unknown = { restricted: true };
    if (maySeeFinance) {
      const { computeManagementKpi } = await import("./finance/management.functions");
      finance = await computeManagementKpi(context.supabase, data.from, data.to);
    }

    const snapshot = {
      period: overview.period,
      kpi: overview.kpi,
      funnel: overview.funnel,
      tasks: overview.tasks,
      telephony: overview.telephony,
      operations: overview.operations,
      marketingBySource: overview.sources,
      dataQuality: overview.data_quality,
      integrationFreshness: overview.freshness,
      reconciliation,
      finance,
    };
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI Gateway не налаштовано");

    const started = Date.now();
    let answer = "";
    let status = "ok";
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: [
                "Ти — read-only аналітичний помічник TERZI ERP. Відповідай українською стисло і предметно.",
                "Використовуй виключно JSON-знімок нижче. Не обчислюй нові фінальні KPI та не вигадуй дані.",
                "Чітко розрізняй: договір/продаж, нарахований дохід і фактичні надходження Finmap.",
                "Якщо доказів недостатньо, напиши «Недостатньо даних» і назви відсутні дані.",
                "Не розкривай фінансові дані, якщо finance.restricted=true.",
                "Завжди вкажи період, джерело показників та важливі обмеження якості даних.",
                "Не стверджуй, що інтеграція підключена, якщо немає фактичного lastSuccessAt.",
              ].join(" "),
            },
            { role: "user", content: `Питання: ${data.question}\n\nПеревірений знімок TERZI:\n${JSON.stringify(snapshot)}` },
          ],
        }),
      });
      if (!response.ok) throw new Error(`AI Gateway: ${response.status}`);
      answer = readText(await response.json());
      if (!answer) throw new Error("AI Gateway повернув порожню відповідь");
    } catch (error) {
      status = "error";
      throw error;
    } finally {
      await access.writeAudit(actor, {
        module: "reports",
        action: "ai_question",
        entityType: "ai_assistant",
        reason: data.question,
        newValue: { from: data.from, to: data.to, status, latency_ms: Date.now() - started, model: "google/gemini-3-flash-preview" },
      });
    }

    const links = allowedLinks();
    if (maySeeFinance) links.push({ label: "Фінанси", href: "/reports/finance" }, { label: "Finmap", href: "/reports/finmap" });
    return {
      answer,
      links,
      period: { from: data.from, to: data.to },
      generatedAt: new Date().toISOString(),
      sources: maySeeFinance
        ? ["CEO Dashboard", "CRM", "Marketing", "Operations", "Integration Core", "Finmap"]
        : ["CEO Dashboard", "CRM", "Marketing", "Operations", "Integration Core"],
    };
  });