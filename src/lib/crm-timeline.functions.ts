/**
 * Єдиний хронологічний таймлайн клієнта: дзвінки, ліди, задачі,
 * замовлення, кошториси, рахунки та платежі в одному потоці.
 * Читання йде під RLS користувача (без сервісного ключа).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TimelineKind =
  | "request"
  | "call"
  | "lead"
  | "task"
  | "measurement"
  | "order"
  | "estimate"
  | "invoice"
  | "payment";


export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  amount?: number | null;
  href?: string | null;
  meta?: { call_id?: string; has_recording?: boolean };
};

export const getClientTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ client_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const cid = data.client_id;

    const [calls, leads, tasks, orders, estimates, invoices] = await Promise.all([
      db.from("crm_calls").select("id,direction,started_at,status,recording_url,created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
      db.from("crm_leads").select("id,title,status,direction,created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
      db.from("crm_tasks").select("id,title,status,due_at,created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
      db.from("orders").select("id,number,name,created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
      db.from("estimates").select("id,number,module,status,total_client,created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
      db.from("invoices").select("id,number,status,total,created_at,order_id").eq("client_id", cid).order("created_at", { ascending: false }).limit(data.limit),
    ]);

    const items: TimelineItem[] = [];

    for (const r of (calls.data ?? []) as any[]) {
      items.push({
        id: `call:${r.id}`,
        kind: "call",
        at: r.started_at ?? r.created_at,
        title: r.direction === "inbound" ? "Вхідний дзвінок" : "Вихідний дзвінок",
        subtitle: r.recording_url ? "Є запис розмови" : null,
        status: r.status ?? null,
        meta: { call_id: r.id, has_recording: Boolean(r.recording_url) },
      });
    }
    for (const r of (leads.data ?? []) as any[]) {
      items.push({ id: `lead:${r.id}`, kind: "lead", at: r.created_at, title: r.title ?? "Лід", status: r.status ?? null, href: "/crm/leads" });
    }
    for (const r of (tasks.data ?? []) as any[]) {
      items.push({
        id: `task:${r.id}`, kind: "task", at: r.created_at, title: r.title ?? "Задача",
        subtitle: r.due_at ? `Дедлайн: ${new Date(r.due_at).toLocaleDateString("uk-UA")}` : null,
        status: r.status ?? null, href: "/crm/tasks",
      });
    }
    for (const r of (orders.data ?? []) as any[]) {
      items.push({ id: `order:${r.id}`, kind: "order", at: r.created_at, title: `Замовлення ${r.number ?? ""}`.trim(), subtitle: r.name ?? null, href: `/orders/${r.id}` });
    }
    for (const r of (estimates.data ?? []) as any[]) {
      items.push({
        id: `estimate:${r.id}`, kind: "estimate", at: r.created_at,
        title: `Кошторис ${r.number ?? ""}`.trim(), subtitle: r.module ?? null,
        status: r.status ?? null, amount: r.total_client != null ? Number(r.total_client) : null,
      });
    }
    const invoiceRows = (invoices.data ?? []) as any[];
    for (const r of invoiceRows) {
      items.push({
        id: `invoice:${r.id}`, kind: "invoice", at: r.created_at,
        title: `Рахунок ${r.number ?? ""}`.trim(), status: r.status ?? null,
        amount: r.total != null ? Number(r.total) : null,
      });
    }

    const orderRows = (orders.data ?? []) as any[];
    const orderIds = Array.from(
      new Set([...invoiceRows.map((r) => r.order_id), ...orderRows.map((r) => r.id)].filter(Boolean)),
    );
    if (orderIds.length) {
      const [pays, measurements] = await Promise.all([
        db.from("payments").select("id,amount,direction,created_at,order_id")
          .in("order_id", orderIds).order("created_at", { ascending: false }).limit(data.limit),
        db.from("order_measurements").select("id,type,status,measured_at,created_at,order_id")
          .in("order_id", orderIds).order("created_at", { ascending: false }).limit(data.limit),
      ]);
      for (const r of (pays.data ?? []) as any[]) {
        items.push({
          id: `payment:${r.id}`, kind: "payment", at: r.created_at,
          title: r.direction === "in" ? "Оплата від клієнта" : "Виплата",
          amount: r.amount != null ? Number(r.amount) : null,
        });
      }
      for (const r of (measurements.data ?? []) as any[]) {
        items.push({
          id: `measurement:${r.id}`, kind: "measurement",
          at: r.measured_at ?? r.created_at, title: "Замір на об'єкті",
          subtitle: r.type ?? null, status: r.status ?? null,
          href: r.order_id ? `/orders/${r.order_id}` : null,
        });
      }
    }

    // Обращения (crm_requests) прив'язані до контактів клієнта.
    const { data: contactRows } = await db.from("crm_contacts").select("id").eq("client_id", cid).limit(200);
    const contactIds = (contactRows ?? []).map((c: any) => c.id);
    if (contactIds.length) {
      const { data: requests } = await db
        .from("crm_requests").select("id,subject,message,source,status,created_at")
        .in("contact_id", contactIds).order("created_at", { ascending: false }).limit(data.limit);
      for (const r of (requests ?? []) as any[]) {
        items.push({
          id: `request:${r.id}`, kind: "request", at: r.created_at,
          title: r.subject || "Звернення",
          subtitle: r.source ?? (r.message ? String(r.message).slice(0, 80) : null),
          status: r.status ?? null, href: "/crm/requests",
        });
      }
    }


    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items.slice(0, data.limit);
  });
