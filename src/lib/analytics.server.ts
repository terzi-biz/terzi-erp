import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any, any, any>;

export interface DrilldownParams {
  metric: string;
  from: string;
  to: string;
  limit?: number;
}

export interface DrilldownRow {
  id: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  amount: number | null;
  href: string | null;
}

const CONTRACT = ["contract", "awaiting_prepayment", "sold"];
const num = (v: unknown) => (v == null ? null : Number(v) || 0);

/** Витягує реальні записи, що стоять за метрикою. Read-only, під RLS користувача. */
export async function drilldown(sb: Sb, p: DrilldownParams): Promise<DrilldownRow[]> {
  const limit = p.limit ?? 200;
  const fromTs = `${p.from}T00:00:00.000Z`;
  const toTs = `${p.to}T23:59:59.999Z`;

  const leads = async (extra?: (q: any) => any) => {
    let q = sb.from("crm_leads").select("*").gte("created_at", fromTs).lte("created_at", toTs)
      .order("created_at", { ascending: false }).limit(limit);
    if (extra) q = extra(q);
    const { data } = await q;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title || r.contact_name || "Лід",
      subtitle: [r.source, r.status, r.lead_quality].filter(Boolean).join(" · ") || null,
      date: r.created_at ?? null,
      amount: num(r.budget),
      href: "/crm/leads",
    }));
  };

  switch (p.metric) {
    case "leads":
      return leads();
    case "qualified":
      return leads((q) => q.eq("lead_quality", "цільовий"));
    case "dq_leads_no_source":
      return leads((q) => q.or("source.is.null,source.eq."));
    case "dq_leads_no_manager":
      return leads((q) => q.is("assigned_to", null));

    case "measurements":
    case "dq_measurements_no_surveyor": {
      let q = sb.from("order_measurements").select("*").gte("created_at", fromTs).lte("created_at", toTs)
        .order("created_at", { ascending: false }).limit(limit);
      if (p.metric === "dq_measurements_no_surveyor") q = q.is("surveyor_id", null);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: `Замір ${r.measurement_type ?? ""}`.trim(),
        subtitle: r.status ?? null,
        date: r.measured_at ?? r.created_at ?? null,
        amount: null,
        href: r.order_id ? `/orders/${r.order_id}` : null,
      }));
    }

    case "estimates":
    case "dq_estimates_no_order": {
      let q = sb.from("estimates").select("*").gte("created_at", fromTs).lte("created_at", toTs)
        .order("created_at", { ascending: false }).limit(limit);
      if (p.metric === "dq_estimates_no_order") q = q.is("order_id", null);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title || r.module || "Кошторис",
        subtitle: r.status ?? null,
        date: r.created_at ?? null,
        amount: num(r.total_client),
        href: "/history",
      }));
    }

    case "contracts":
    case "orders":
    case "dq_orders_no_amount": {
      let q = sb.from("orders").select("*").gte("created_at", fromTs).lte("created_at", toTs)
        .order("created_at", { ascending: false }).limit(limit);
      if (p.metric === "contracts") q = q.in("commercial_status", CONTRACT);
      if (p.metric === "dq_orders_no_amount") q = q.or("amount_total.is.null,amount_total.eq.0");
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: `${r.number ?? ""} ${r.name ?? ""}`.trim() || "Замовлення",
        subtitle: [r.commercial_status, r.source].filter(Boolean).join(" · ") || null,
        date: r.created_at ?? null,
        amount: num(r.amount_total),
        href: `/orders/${r.id}`,
      }));
    }

    case "payments": {
      const { data } = await sb.from("payments").select("*").gte("paid_at", p.from).lte("paid_at", p.to)
        .order("paid_at", { ascending: false }).limit(limit);
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.purpose || (r.direction === "in" ? "Надходження" : "Виплата"),
        subtitle: r.direction ?? null,
        date: r.paid_at ?? null,
        amount: num(r.amount),
        href: r.order_id ? `/orders/${r.order_id}` : "/finance",
      }));
    }

    case "calls_missed":
    case "dq_calls_unlinked": {
      let q = sb.from("crm_calls").select("*").gte("started_at", fromTs).lte("started_at", toTs)
        .order("started_at", { ascending: false }).limit(limit);
      if (p.metric === "calls_missed") q = q.is("is_missed", true);
      if (p.metric === "dq_calls_unlinked") q = q.is("lead_id", null).is("client_id", null);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.phone_e164 || r.phone_norm || "Дзвінок",
        subtitle: [r.direction, r.is_missed ? "пропущений" : "прийнятий"].filter(Boolean).join(" · "),
        date: r.started_at ?? null,
        amount: null,
        href: "/crm/calls",
      }));
    }

    default:
      return [];
  }
}
