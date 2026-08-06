/**
 * Детермінована маркетингова аналітика: KPI, воронка, rule-based попередження.
 * Без AI — лише агрегація і правила. Використовується і на сервері, і в UI.
 */

export type DailyMetric = {
  date: string;
  channel_id: string | null;
  campaign_id: string | null;
  creative_id: string | null;
  spend: number | string;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  sessions: number;
  platform_leads: number;
  website_leads: number;
  calls: number;
  conversions: number;
  conversion_value: number | string;
};

export type FunnelInput = {
  impressions: number;
  clicks: number;
  requests: number;
  qualified: number;
  measurementsBooked: number;
  measurementsDone: number;
  quotes: number;
  contracts: number;
  prepayments: number;
  completed: number;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
export const num = n;

export function sumMetrics(rows: DailyMetric[]) {
  const acc = {
    spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, sessions: 0,
    platform_leads: 0, website_leads: 0, calls: 0, conversions: 0, conversion_value: 0,
  };
  for (const r of rows) {
    acc.spend += n(r.spend);
    acc.impressions += n(r.impressions);
    acc.reach += n(r.reach);
    acc.clicks += n(r.clicks);
    acc.link_clicks += n(r.link_clicks);
    acc.sessions += n(r.sessions);
    acc.platform_leads += n(r.platform_leads);
    acc.website_leads += n(r.website_leads);
    acc.calls += n(r.calls);
    acc.conversions += n(r.conversions);
    acc.conversion_value += n(r.conversion_value);
  }
  return acc;
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/** ROMI = (валовий прибуток − маркетингові витрати) / витрати × 100% */
export function romi(grossProfit: number, spend: number) {
  return spend > 0 ? ((grossProfit - spend) / spend) * 100 : 0;
}

export function derived(sum: ReturnType<typeof sumMetrics>, requests: number, qualified: number, measurements: number, contracts: number) {
  return {
    ctr: pct(sum.clicks, sum.impressions),
    cpc: ratio(sum.spend, sum.clicks),
    cpm: ratio(sum.spend * 1000, sum.impressions),
    cpl: ratio(sum.spend, requests),
    cpql: ratio(sum.spend, qualified),
    cpMeasurement: ratio(sum.spend, measurements),
    cpContract: ratio(sum.spend, contracts),
  };
}

export type KpiStatus = "good" | "warn" | "bad";
/** Статус KPI: зростання добре (higherIsBetter) чи погано. */
export function kpiStatus(current: number, previous: number, higherIsBetter = true): KpiStatus {
  if (previous <= 0) return "good";
  const delta = ((current - previous) / previous) * 100;
  const gain = higherIsBetter ? delta : -delta;
  if (gain >= -5) return "good";
  if (gain >= -20) return "warn";
  return "bad";
}

export function deltaPct(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

export function buildFunnel(f: FunnelInput) {
  const steps: { key: string; label: string; value: number }[] = [
    { key: "impressions", label: "Покази", value: f.impressions },
    { key: "clicks", label: "Кліки", value: f.clicks },
    { key: "requests", label: "Звернення", value: f.requests },
    { key: "qualified", label: "Цільові ліди", value: f.qualified },
    { key: "measurement_booked", label: "Замір призначено", value: f.measurementsBooked },
    { key: "measurement_done", label: "Замір відбувся", value: f.measurementsDone },
    { key: "quotes", label: "КП", value: f.quotes },
    { key: "contracts", label: "Договори", value: f.contracts },
    { key: "prepayments", label: "Передоплати", value: f.prepayments },
    { key: "completed", label: "Виконані об'єкти", value: f.completed },
  ];
  const top = steps[0]?.value || 0;
  return steps.map((s, i) => {
    const prev = i === 0 ? s.value : steps[i - 1]!.value;
    return { ...s, fromPrev: pct(s.value, prev), fromTop: pct(s.value, top) };
  });
}

/* ---------------- Rule-based alerts ---------------- */

export type AlertDraft = {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  metric_name: string | null;
  current_value: number | null;
  threshold_value: number | null;
  dedup_key: string;
};

export type RuleConfig = {
  targetCpl: number;
  cplGrowthPercent: number;
  spendNoLeadsThreshold: number;
  budgetPacePercent: number;
  leadSlaMinutes: number;
};

export const DEFAULT_RULES: RuleConfig = {
  targetCpl: 500,
  cplGrowthPercent: 40,
  spendNoLeadsThreshold: 2000,
  budgetPacePercent: 120,
  leadSlaMinutes: 60,
};

export type CampaignAgg = { id: string; name: string; spend: number; requests: number; clicks: number; impressions: number };
export type BudgetAgg = { id: string; label: string; planned: number; actual: number; dayOfMonth: number; daysInMonth: number; payment_status: string };
export type LeadAgg = { id: string; title: string; created_at: string; lead_quality: string | null; status: string };

export function evaluateRules(input: {
  campaigns: CampaignAgg[];
  budgets: BudgetAgg[];
  leads: LeadAgg[];
  integrations: { provider: string; title: string; connection_status: string; last_error: string | null; token_expiry: string | null }[];
  now?: Date;
  rules?: Partial<RuleConfig>;
}): AlertDraft[] {
  const cfg = { ...DEFAULT_RULES, ...(input.rules ?? {}) };
  const now = input.now ?? new Date();
  const out: AlertDraft[] = [];

  for (const c of input.campaigns) {
    if (c.spend >= cfg.spendNoLeadsThreshold && c.requests === 0) {
      out.push({
        alert_type: "campaign_spend_no_leads", severity: "critical",
        title: `Кампанія «${c.name}» витрачає бюджет без заявок`,
        description: `Витрата ${Math.round(c.spend)} ₴ за період, звернень — 0.`,
        entity_type: "campaign", entity_id: c.id, metric_name: "spend",
        current_value: c.spend, threshold_value: cfg.spendNoLeadsThreshold,
        dedup_key: `campaign_spend_no_leads:${c.id}`,
      });
    } else if (c.requests > 0) {
      const cpl = c.spend / c.requests;
      if (cpl > cfg.targetCpl * (1 + cfg.cplGrowthPercent / 100)) {
        out.push({
          alert_type: "cpl_above_target", severity: "warning",
          title: `Висока вартість звернення у «${c.name}»`,
          description: `CPL ${Math.round(cpl)} ₴ проти цільових ${cfg.targetCpl} ₴.`,
          entity_type: "campaign", entity_id: c.id, metric_name: "cpl",
          current_value: cpl, threshold_value: cfg.targetCpl,
          dedup_key: `cpl_above_target:${c.id}`,
        });
      }
    }
  }

  for (const b of input.budgets) {
    if (b.planned > 0) {
      const pace = b.daysInMonth > 0 ? (b.actual / b.planned) / (b.dayOfMonth / b.daysInMonth) * 100 : 0;
      if (pace >= cfg.budgetPacePercent) {
        out.push({
          alert_type: "budget_overpace", severity: b.actual > b.planned ? "critical" : "warning",
          title: `Бюджет «${b.label}» витрачається швидше плану`,
          description: `Освоєно ${Math.round(b.actual)} ₴ із ${Math.round(b.planned)} ₴ (темп ${Math.round(pace)}%).`,
          entity_type: "budget", entity_id: b.id, metric_name: "budget_pace",
          current_value: pace, threshold_value: cfg.budgetPacePercent,
          dedup_key: `budget_overpace:${b.id}`,
        });
      }
    }
    if (b.payment_status && b.payment_status !== "ok") {
      out.push({
        alert_type: "budget_payment_issue", severity: "critical",
        title: `Проблема з оплатою: ${b.label}`,
        description: `Статус платежу: ${b.payment_status}.`,
        entity_type: "budget", entity_id: b.id, metric_name: "payment_status",
        current_value: null, threshold_value: null,
        dedup_key: `budget_payment_issue:${b.id}`,
      });
    }
  }

  for (const l of input.leads) {
    const ageMin = (now.getTime() - new Date(l.created_at).getTime()) / 60000;
    if (!l.lead_quality && l.status === "open" && ageMin > cfg.leadSlaMinutes) {
      out.push({
        alert_type: "lead_sla_breach", severity: "warning",
        title: `Лід без кваліфікації: ${l.title}`,
        description: `Понад ${Math.round(ageMin)} хв без визначення якості ліда (SLA ${cfg.leadSlaMinutes} хв).`,
        entity_type: "lead", entity_id: l.id, metric_name: "lead_sla",
        current_value: Math.round(ageMin), threshold_value: cfg.leadSlaMinutes,
        dedup_key: `lead_sla_breach:${l.id}`,
      });
    }
  }

  for (const i of input.integrations) {
    if (i.last_error) {
      out.push({
        alert_type: "integration_error", severity: "warning",
        title: `Помилка синхронізації: ${i.title}`,
        description: i.last_error.slice(0, 300),
        entity_type: "integration", entity_id: null, metric_name: null,
        current_value: null, threshold_value: null,
        dedup_key: `integration_error:${i.provider}`,
      });
    }
    if (i.token_expiry && new Date(i.token_expiry).getTime() - now.getTime() < 7 * 864e5) {
      out.push({
        alert_type: "integration_token_expiring", severity: "warning",
        title: `Термін токена спливає: ${i.title}`,
        description: `Токен дійсний до ${new Date(i.token_expiry).toLocaleDateString("uk-UA")}.`,
        entity_type: "integration", entity_id: null, metric_name: null,
        current_value: null, threshold_value: null,
        dedup_key: `integration_token_expiring:${i.provider}`,
      });
    }
  }

  return out;
}

export const LEAD_QUALITIES = [
  "новий", "не оброблений", "у роботі", "цільовий", "нецільовий", "дубль", "не додзвонились",
  "призначено замір", "замір відбувся", "надіслано КП", "переговори", "договір", "відмова", "відкладений попит",
] as const;

export const AD_ANGLES = [
  "ціна", "швидкість", "гарантія", "договір", "фіксована вартість", "до/після", "німецьке обладнання",
  "до 600 м² за день", "автономна робота", "великі об'єкти", "якість", "вирішення проблеми", "кейс", "відгук",
] as const;

export const AREA_BUCKETS = [
  { key: "lt50", label: "до 50 м²", min: 0, max: 50 },
  { key: "50_100", label: "50–100", min: 50, max: 100 },
  { key: "100_200", label: "100–200", min: 100, max: 200 },
  { key: "200_500", label: "200–500", min: 200, max: 500 },
  { key: "500_1000", label: "500–1 000", min: 500, max: 1000 },
  { key: "gt1000", label: "понад 1 000", min: 1000, max: Infinity },
] as const;
