/**
 * Клієнти TERZI: список з агрегатами та повна картка клієнта.
 * Читання йде під RLS користувача. Нові клієнти при читанні не створюються.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toE164 } from "./phone";
import { clientInput, clientIdInput } from "./clients.schema";

export type ClientListRow = {
  id: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  source: string | null;
  manager_id: string | null;
  manager_display: string | null;
  crm_link: string | null;
  external_source: string | null;
  external_id: string | null;
  status: string;
  created_at: string;
  orders_count: number;
  orders_total: number;
  paid_total: number;
  debt_total: number;
  active_orders: number;
  last_activity_at: string | null;
};

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data, error } = await db.from("clients").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listClients", error); throw new Error("Не вдалося завантажити клієнтів"); }
    const clients = (data ?? []) as any[];
    if (!clients.length) return [] as ClientListRow[];

    const ids = clients.map((c) => c.id);
    const [ordersRes, callsRes] = await Promise.all([
      db.from("orders")
        .select("id,client_id,amount_total,paid_total,commercial_status,production_status,created_at,updated_at")
        .in("client_id", ids),
      db.from("crm_calls").select("client_id,phone_e164,created_at").order("created_at", { ascending: false }).limit(2000),
    ]);

    const orders = (ordersRes.data ?? []) as any[];
    const calls = (callsRes.data ?? []) as any[];

    const managerIds = Array.from(new Set(clients.map((c) => c.manager_id).filter(Boolean)));
    const { staffNameMap } = await import("./staff.server");
    const mgrMap = await staffNameMap(managerIds as string[]);

    const byPhone = new Map<string, string>();
    for (const c of clients) {
      const e164 = toE164(c.phone);
      if (e164 && !byPhone.has(e164)) byPhone.set(e164, c.id);
    }
    const callActivity = new Map<string, string>();
    for (const call of calls) {
      const cid = call.client_id ?? (call.phone_e164 ? byPhone.get(call.phone_e164) : null);
      if (!cid) continue;
      const prev = callActivity.get(cid);
      if (!prev || new Date(call.created_at) > new Date(prev)) callActivity.set(cid, call.created_at);
    }

    return clients.map((c) => {
      const own = orders.filter((o) => o.client_id === c.id);
      const ordersTotal = own.reduce((s, o) => s + Number(o.amount_total ?? 0), 0);
      const paidTotal = own.reduce((s, o) => s + Number(o.paid_total ?? 0), 0);
      const active = own.filter(
        (o) => o.commercial_status !== "refused" && o.production_status !== "handed_over",
      ).length;
      const stamps = [
        c.updated_at ?? c.created_at,
        callActivity.get(c.id) ?? null,
        ...own.map((o) => o.updated_at ?? o.created_at),
      ].filter(Boolean) as string[];
      const last = stamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
      return {
        ...c,
        phone_e164: toE164(c.phone),
        manager_display: c.manager_id ? mgrMap.get(c.manager_id) ?? null : null,
        orders_count: own.length,
        orders_total: ordersTotal,
        paid_total: paidTotal,
        debt_total: Math.max(0, ordersTotal - paidTotal),
        active_orders: active,
        last_activity_at: last,
      } as ClientListRow;
    });
  });

/** Повна картка клієнта: базові поля, замовлення, кошториси, фінанси, задачі, коментарі, дзвінки. */
export const getClientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: client, error } = await db.from("clients").select("*").eq("id", data.id).maybeSingle();
    if (error) { console.error("getClientDetail", error); throw new Error("Не вдалося завантажити клієнта"); }
    if (!client) throw new Error("Клієнта не знайдено");

    const e164 = toE164((client as any).phone);

    const [ordersRes, estimatesRes, invoicesRes, tasksRes] = await Promise.all([
      db.from("orders")
        .select("id,number,name,address,amount_total,paid_total,commercial_status,production_status,financial_status,planned_start,planned_end,created_at")
        .eq("client_id", data.id).order("created_at", { ascending: false }),
      db.from("estimates").select("id,number,module,status,total_client,created_at")
        .eq("client_id", data.id).order("created_at", { ascending: false }),
      db.from("invoices").select("id,number,status,kind,total,paid,issue_date,due_date,created_at")
        .eq("client_id", data.id).order("created_at", { ascending: false }),
      db.from("crm_tasks").select("id,title,status,priority,due_at,created_at,order_id")
        .eq("client_id", data.id).order("created_at", { ascending: false }).limit(100),
    ]);

    const orders = (ordersRes.data ?? []) as any[];
    const orderIds = orders.map((o) => o.id);

    const [paymentsRes, commentsRes] = await Promise.all([
      orderIds.length
        ? db.from("payments").select("id,order_id,amount,direction,paid_at,method,note,created_at").in("order_id", orderIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? db.from("order_comments").select("id,order_id,author_name,body,pinned,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(100)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Один телефон = одна картка: тягнемо дзвінки за client_id АБО за нормалізованим номером.
    let callsQuery = db.from("crm_calls")
      .select("id,direction,status,started_at,created_at,duration_sec,from_number,to_number,phone_e164,recording_url,recording_available,external_id,client_id")
      .order("created_at", { ascending: false }).limit(100);
    callsQuery = e164
      ? callsQuery.or(`client_id.eq.${data.id},phone_e164.eq.${e164}`)
      : callsQuery.eq("client_id", data.id);
    const callsRes = await callsQuery;

    const managerName = (client as any).manager_id
      ? await (async () => {
          const { staffName } = await import("./staff.server");
          return await staffName((client as any).manager_id);
        })()
      : null;

    const ordersTotal = orders.reduce((s, o) => s + Number(o.amount_total ?? 0), 0);
    const paidTotal = orders.reduce((s, o) => s + Number(o.paid_total ?? 0), 0);
    const activeOrders = orders.filter(
      (o) => o.commercial_status !== "refused" && o.production_status !== "handed_over",
    ).length;
    const calls = (callsRes.data ?? []) as any[];
    const lastActivity = [
      (client as any).updated_at ?? (client as any).created_at,
      orders[0]?.created_at ?? null,
      calls[0]?.started_at ?? calls[0]?.created_at ?? null,
    ].filter(Boolean).sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    return {
      client: { ...(client as any), phone_e164: e164, manager_display: managerName },
      orders,
      estimates: (estimatesRes.data ?? []) as any[],
      invoices: (invoicesRes.data ?? []) as any[],
      payments: (paymentsRes.data ?? []) as any[],
      tasks: (tasksRes.data ?? []) as any[],
      comments: (commentsRes.data ?? []) as any[],
      calls,
      summary: {
        orders_count: orders.length,
        orders_total: ordersTotal,
        paid_total: paidTotal,
        debt_total: Math.max(0, ordersTotal - paidTotal),
        active_orders: activeOrders,
        last_activity_at: lastActivity,
      },
    };
  });

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const row = { ...fields, owner_id: context.userId };
    const { data: out, error } = id
      ? await context.supabase.from("clients").update(row).eq("id", id).select().single()
      : await context.supabase.from("clients").insert(row).select().single();
    if (error) { console.error("upsertClient", error); throw new Error("Не вдалося зберегти клієнта"); }
    return out;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) { console.error("deleteClient", error); throw new Error("Не вдалося видалити клієнта"); }
    return { ok: true };
  });

/** Довідник менеджерів для фільтрів і картки. */
export const listClientManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listStaffDirectory } = await import("./staff.server");
    return await listStaffDirectory();
  });
