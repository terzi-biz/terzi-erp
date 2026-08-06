import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateRules, sumMetrics, num } from "./kpi";

type SB = SupabaseClient<Database>;

/** Rule-based двигун попереджень маркетингу. Без AI, лише SQL-агрегація і пороги. */
export async function evaluateMarketingRules(sb: SB, userId: string) {
  const to = new Date();
  const from = new Date(to.getTime() - 13 * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [metrics, campaigns, leads, budgets, integrations] = await Promise.all([
    sb.from("marketing_daily_metrics").select("campaign_id, spend, clicks, impressions").gte("date", iso(from)).lte("date", iso(to)),
    sb.from("marketing_campaigns").select("id, name").eq("status", "active"),
    sb.from("crm_leads").select("id, title, status, lead_quality, created_at, marketing_campaign_id").gte("created_at", from.toISOString()).limit(1000),
    sb.from("marketing_budgets").select("*"),
    sb.from("marketing_integrations").select("provider, title, connection_status, last_error, token_expiry"),
  ]);

  const byCampaign = new Map<string, { spend: number; clicks: number; impressions: number; requests: number }>();
  for (const m of metrics.data ?? []) {
    if (!m.campaign_id) continue;
    const cur = byCampaign.get(m.campaign_id) ?? { spend: 0, clicks: 0, impressions: 0, requests: 0 };
    cur.spend += num(m.spend); cur.clicks += num(m.clicks); cur.impressions += num(m.impressions);
    byCampaign.set(m.campaign_id, cur);
  }
  for (const l of leads.data ?? []) {
    if (!l.marketing_campaign_id) continue;
    const cur = byCampaign.get(l.marketing_campaign_id) ?? { spend: 0, clicks: 0, impressions: 0, requests: 0 };
    cur.requests += 1;
    byCampaign.set(l.marketing_campaign_id, cur);
  }

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const drafts = evaluateRules({
    campaigns: (campaigns.data ?? []).map((c) => {
      const agg = byCampaign.get(c.id) ?? { spend: 0, clicks: 0, impressions: 0, requests: 0 };
      return { id: c.id, name: c.name, ...agg };
    }),
    budgets: (budgets.data ?? []).map((b) => ({
      id: b.id,
      label: `${b.period_month}`,
      planned: num(b.planned_amount),
      actual: num(b.actual_amount),
      dayOfMonth: now.getDate(),
      daysInMonth,
      payment_status: b.payment_status,
    })),
    leads: (leads.data ?? []).map((l) => ({ id: l.id, title: l.title, created_at: l.created_at, lead_quality: l.lead_quality, status: String(l.status) })),
    integrations: integrations.data ?? [],
    now,
  });

  let created = 0;
  for (const d of drafts) {
    const { data: existing } = await sb.from("marketing_alerts").select("id, status").eq("dedup_key", d.dedup_key).maybeSingle();
    if (existing) {
      if (existing.status !== "open") continue;
      await sb.from("marketing_alerts").update({ current_value: d.current_value, description: d.description }).eq("id", existing.id);
      continue;
    }
    const { error } = await sb.from("marketing_alerts").insert({ ...d, assigned_user_id: userId });
    if (!error) created += 1;
  }
  return { checked: drafts.length, created };
}

/** Детерміновані рекомендації (без AI) на основі 14-денних агрегатів. */
export async function buildRecommendations(sb: SB, userId: string) {
  const to = new Date();
  const from = new Date(to.getTime() - 13 * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [metrics, campaigns, leads] = await Promise.all([
    sb.from("marketing_daily_metrics").select("*").gte("date", iso(from)).lte("date", iso(to)),
    sb.from("marketing_campaigns").select("id, name"),
    sb.from("crm_leads").select("id, marketing_campaign_id, lead_quality").gte("created_at", from.toISOString()).limit(2000),
  ]);

  const names = new Map((campaigns.data ?? []).map((c) => [c.id, c.name]));
  const grouped = new Map<string, typeof metrics.data>();
  for (const m of metrics.data ?? []) {
    if (!m.campaign_id) continue;
    const arr = grouped.get(m.campaign_id) ?? [];
    arr!.push(m);
    grouped.set(m.campaign_id, arr);
  }
  const requests = new Map<string, number>();
  const qualified = new Map<string, number>();
  for (const l of leads.data ?? []) {
    if (!l.marketing_campaign_id) continue;
    requests.set(l.marketing_campaign_id, (requests.get(l.marketing_campaign_id) ?? 0) + 1);
    if (l.lead_quality === "цільовий") qualified.set(l.marketing_campaign_id, (qualified.get(l.marketing_campaign_id) ?? 0) + 1);
  }

  let created = 0;
  for (const [campaignId, rows] of grouped) {
    const sum = sumMetrics((rows ?? []) as never);
    const req = requests.get(campaignId) ?? 0;
    const q = qualified.get(campaignId) ?? 0;
    const name = names.get(campaignId) ?? "Кампанія";
    let draft: { title: string; problem: string; action: string; effect: string; risk: string; priority: string } | null = null;

    if (sum.spend > 0 && req === 0) {
      draft = {
        title: `Зупинити або перезапустити «${name}»`,
        problem: "Кампанія витрачає бюджет без жодного звернення за 14 днів.",
        action: "Перевірити релевантність оголошень та посадкової сторінки, зупинити неефективні групи, перерозподілити бюджет.",
        effect: "Економія бюджету та перерозподіл на кампанії з лідами.",
        risk: "Втрата охоплення бренду.",
        priority: "high",
      };
    } else if (req > 0 && q / req < 0.3 && req >= 5) {
      draft = {
        title: `Низька якість лідів у «${name}»`,
        problem: `Цільових лідів ${q} із ${req} (${Math.round((q / req) * 100)}%).`,
        action: "Уточнити таргетинг і мінус-слова, додати кваліфікуючі питання у форму (площа, район, послуга).",
        effect: "Зростання частки цільових лідів і зниження вартості замовлення.",
        risk: "Тимчасове зменшення кількості звернень.",
        priority: "medium",
      };
    } else if (sum.impressions > 1000 && (sum.clicks / sum.impressions) * 100 < 1) {
      draft = {
        title: `Слабкий CTR у «${name}»`,
        problem: `CTR ${((sum.clicks / sum.impressions) * 100).toFixed(2)}% при ${sum.impressions} показах.`,
        action: "Оновити креативи та заголовки, протестувати нові рекламні кути (ціна, гарантія, до/після).",
        effect: "Зростання CTR і зниження CPC.",
        risk: "Потрібен час на навчання кампанії.",
        priority: "medium",
      };
    }
    if (!draft) continue;

    const { data: exists } = await sb.from("marketing_recommendations")
      .select("id").eq("entity_id", campaignId).eq("title", draft.title).in("status", ["new", "postponed"]).maybeSingle();
    if (exists) continue;

    const { error } = await sb.from("marketing_recommendations").insert({
      recommendation_type: "optimization",
      title: draft.title,
      problem: draft.problem,
      evidence: `Витрата ${Math.round(sum.spend)} ₴, кліки ${sum.clicks}, звернення ${req}, цільові ${q}.`,
      current_metric: req > 0 ? `CPL ${Math.round(sum.spend / req)} ₴` : `Витрата ${Math.round(sum.spend)} ₴ без лідів`,
      target_metric: "CPL у межах цільового значення",
      recommended_action: draft.action,
      expected_effect: draft.effect,
      risk: draft.risk,
      priority: draft.priority,
      entity_type: "campaign",
      entity_id: campaignId,
      assigned_user_id: userId,
    });
    if (!error) created += 1;
  }
  return { created };
}
