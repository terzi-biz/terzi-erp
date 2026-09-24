/**
 * Етапи замовлення: читання опублікованого workflow і перехід з автоматикою.
 * Перехід — право orders:edit; план/факт бригад — лише для ролей з доступом до відомості.
 * Кожен перехід і результат кожної дії пишуться в журнал змін.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function publishedWorkflow(sb: any, roleKey: string | null) {
  const { resolveAllByKey } = await import("./config-kernel/scoped");
  const { workflowSchema } = await import("./config-kernel/workflow");
  const { data } = await sb.from("config_entries").select("kind,key,scope_type,scope_id,status,payload,version")
    .eq("kind", "workflow").eq("status", "published").eq("key", "order.production");
  const r = resolveAllByKey("workflow", data ?? [], { roleKey }).get("order.production");
  const p = r ? workflowSchema.safeParse(r.value) : null;
  return p?.success ? { wf: p.data, version: r!.version ?? null } : { wf: null, version: null };
}

export const getOrderWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadActor } = await import("./access.server");
    const actor = await loadActor(context.userId);
    return publishedWorkflow(context.supabase, actor.roleKey ?? null);
  });

export type ActionResult = { action: string; status: "done" | "skipped" | "error"; message: string };

export const transitionOrderStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), to: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePermission, admin, writeAudit } = await import("./access.server");
    const { decideTransition, label } = await import("./config-kernel/workflow");
    const actor = await requirePermission(context.userId, "orders", "edit");
    const db = (await admin()) as any;
    const { data: order } = await db.from("orders").select("id,number,name,production_status,manager_id,client_id").eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Замовлення не знайдено");
    const { wf, version } = await publishedWorkflow(db, actor.roleKey ?? null);
    const d = decideTransition(wf, order.production_status ?? null, data.to);
    if (!d.allowed) throw new Error(d.error);

    const { error } = await db.from("orders").update({ production_status: data.to }).eq("id", data.orderId);
    if (error) throw new Error(error.message);

    const results: ActionResult[] = [];
    let payrollOk: boolean | null = null;
    const canPayroll = async () => {
      if (payrollOk !== null) return payrollOk;
      try { const { requirePayrollAccess } = await import("./payroll-bridge.server"); await requirePayrollAccess(context.userId); payrollOk = true; }
      catch { payrollOk = false; }
      return payrollOk;
    };
    const period = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

    for (const a of d.actions) {
      try {
        if (a === "plan_from_estimate") {
          if (!(await canPayroll())) { results.push({ action: a, status: "skipped", message: "Немає доступу до відомості — план не оновлено" }); continue; }
          const { data: obs } = await db.from("order_brigades").select("brigade_key").eq("order_id", data.orderId);
          if (!obs?.length) { results.push({ action: a, status: "skipped", message: "Бригаду не призначено" }); continue; }
          const { applyEstimatePlan } = await import("./brigade-plan.server");
          let n = 0;
          for (const b of obs) n += await applyEstimatePlan(db, data.orderId, b.brigade_key, period, context.userId);
          results.push({ action: a, status: "done", message: `План оновлено: ${n} рядків для ${obs.length} бригад(и)` });
        } else if (a === "fact_to_payroll") {
          if (!(await canPayroll())) { results.push({ action: a, status: "skipped", message: "Немає доступу до відомості" }); continue; }
          const { syncOrderToPayroll, bridgeConfigured } = await import("./payroll-bridge.server");
          if (!bridgeConfigured()) { results.push({ action: a, status: "skipped", message: "Зв'язок з відомістю не налаштовано" }); continue; }
          // Надсилаються лише підтверджені рядки факту — правило всередині syncOrderToPayroll.
          const r: any = await syncOrderToPayroll(data.orderId, "workflow", context.userId);
          results.push({ action: a, status: r?.status === "error" ? "error" : r?.status === "skipped" ? "skipped" : "done", message: r?.message ?? "Надіслано у відомість" });
        } else if (a === "create_task") {
          const assignee = order.manager_id ?? context.userId;
          const { error: te } = await db.from("crm_tasks").insert({
            title: d.taskTitle ?? `Етап «${label(wf, data.to)}»`, order_id: data.orderId, client_id: order.client_id ?? null,
            owner_id: context.userId, assigned_to: assignee, kind: "workflow", priority: "normal", status: "open",
          });
          if (te) throw new Error(te.message);
          results.push({ action: a, status: "done", message: "Завдання створено" });
        }
      } catch (e: any) {
        results.push({ action: a, status: "error", message: e?.message ?? "Помилка" });
      }
    }

    await writeAudit(actor, {
      module: "orders", action: "order.stage_transition", entityType: "order", entityId: data.orderId,
      entityLabel: order.number ?? order.name ?? null, orderId: data.orderId,
      oldValue: { production_status: order.production_status },
      newValue: { production_status: data.to, workflow_version: version, governed: d.governed, actions: results },
    } as any);
    return { ok: true, governed: d.governed, results };
  });
