/**
 * Пошук сутностей для привʼязки кошторису: ліди, заміри, замовлення, клієнти.
 * Читання під RLS користувача, максимум 20 рядків, пошук по телефону / назві / адресі.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { digits, likeTerm } from "./pagination";

export type LinkKind = "leads" | "measurements" | "orders" | "clients";

export type LinkHit = {
  id: string;
  kind: LinkKind;
  title: string;
  subtitle: string | null;
  phone: string | null;
  address: string | null;
  clientId: string | null;
  orderId: string | null;
  area: number | null;
};

const input = z.object({
  kind: z.enum(["leads", "measurements", "orders", "clients"]),
  q: z.string().max(120).default(""),
});

export const searchLinkTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ context, data }): Promise<LinkHit[]> => {
    const db = context.supabase as any;
    const term = likeTerm(data.q);
    const num = digits(data.q);
    const phoneOr = (col: string) => (num.length >= 3 ? [`${col}.ilike.*${num}*`] : []);

    if (data.kind === "clients") {
      let q = db.from("clients").select("id,name,phone,phone_e164,address").order("created_at", { ascending: false }).limit(20);
      if (term) q = q.or([`name.ilike.*${term}*`, `address.ilike.*${term}*`, `phone.ilike.*${term}*`, ...phoneOr("phone_e164")].join(","));
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return (rows ?? []).map((r: any) => ({
        id: r.id, kind: "clients", title: r.name, subtitle: null, phone: r.phone_e164 ?? r.phone,
        address: r.address, clientId: r.id, orderId: null, area: null,
      }));
    }

    if (data.kind === "leads") {
      let q = db.from("crm_leads").select("id,title,phone_e164,address,area,client_id,order_id,status,created_at")
        .order("created_at", { ascending: false }).limit(20);
      if (term) q = q.or([`title.ilike.*${term}*`, `address.ilike.*${term}*`, ...phoneOr("phone_e164")].join(","));
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return (rows ?? []).map((r: any) => ({
        id: r.id, kind: "leads", title: r.title ?? "Лід без назви",
        subtitle: r.created_at ? new Date(r.created_at).toLocaleDateString("uk-UA") : null,
        phone: r.phone_e164, address: r.address, clientId: r.client_id, orderId: r.order_id,
        area: r.area != null ? Number(r.area) : null,
      }));
    }

    if (data.kind === "orders") {
      let q = db.from("orders").select("id,number,name,address,client_id,clients(name,phone_e164)")
        .order("created_at", { ascending: false }).limit(20);
      if (term) q = q.or([`name.ilike.*${term}*`, `number.ilike.*${term}*`, `address.ilike.*${term}*`].join(","));
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return (rows ?? []).map((r: any) => ({
        id: r.id, kind: "orders", title: `${r.number ?? ""} ${r.name ?? ""}`.trim(),
        subtitle: r.clients?.name ?? null, phone: r.clients?.phone_e164 ?? null,
        address: r.address, clientId: r.client_id, orderId: r.id, area: null,
      }));
    }

    // measurements
    let q = db.from("order_measurements")
      .select("id,scheduled_at,area,status,order_id,lead_id,client_id,orders(number,name,address,client_id)")
      .order("scheduled_at", { ascending: false, nullsFirst: false }).limit(20);
    if (term) {
      const { data: ords } = await db.from("orders").select("id")
        .or([`name.ilike.*${term}*`, `number.ilike.*${term}*`, `address.ilike.*${term}*`].join(",")).limit(50);
      const ids = (ords ?? []).map((o: any) => o.id);
      if (!ids.length) return [];
      q = q.in("order_id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id, kind: "measurements",
      title: r.orders ? `${r.orders.number ?? ""} ${r.orders.name ?? ""}`.trim() : "Замір",
      subtitle: r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString("uk-UA") : null,
      phone: null, address: r.orders?.address ?? null,
      clientId: r.client_id ?? r.orders?.client_id ?? null, orderId: r.order_id,
      area: r.area != null ? Number(r.area) : null,
    }));
  });
