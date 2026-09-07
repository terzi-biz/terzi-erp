import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computePayroll, payrollScheduleFor, type KpiRule, type KpiFact } from "./payroll-engine";
import { payrollProfileInput, payrollPeriodInput, payrollKpiFactInput, payrollStatusInput, uuid } from "./finance.schema";

async function assertFinance(context: any) {
  const { data, error } = await context.supabase.rpc("is_finance_user", { _uid: context.userId });
  if (error) { console.error("is_finance_user", error); throw new Error("Не вдалося перевірити права доступу"); }
  if (data !== true) throw new Error("Немає доступу до зарплатного модуля");
}

export const listPayrollProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const [{ data: profiles, error }, { data: employees }] = await Promise.all([
      context.supabase.from("payroll_profiles").select("*, employee:employee_id(full_name)").order("valid_from", { ascending: false }),
      context.supabase.from("payroll_employees").select("id,full_name,active,base_salary").order("full_name"),
    ]);
    if (error) { console.error("listPayrollProfiles", error); throw new Error("Не вдалося завантажити схеми оплати"); }
    return { profiles: profiles ?? [], employees: employees ?? [] };
  });

export const savePayrollProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payrollProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { id, ...rest } = data;
    const payload: any = { ...rest, created_by: context.userId };
    const { data: out, error } = id
      ? await context.supabase.from("payroll_profiles").update(payload).eq("id", id).select().single()
      : await context.supabase.from("payroll_profiles").insert(payload).select().single();
    if (error) { console.error("savePayrollProfile", error); throw new Error("Не вдалося зберегти схему оплати"); }
    return out;
  });

export const listPayrollPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const { data, error } = await context.supabase.from("payroll_periods").select("*").order("period", { ascending: false }).limit(36);
    if (error) { console.error("listPayrollPeriods", error); throw new Error("Не вдалося завантажити періоди"); }
    return data ?? [];
  });

/** Розрахунок місяця: детермінований, за версійними схемами оплати. Перерахунок ідемпотентний. */
export const calculatePayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payrollPeriodInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const period = data.period;
    const monthStart = `${period}-01`;
    const monthEnd = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).toISOString().slice(0, 10);

    let { data: pRow } = await context.supabase.from("payroll_periods").select("*").eq("period", period).maybeSingle();
    if (!pRow) {
      const { data: created, error } = await context.supabase.from("payroll_periods").insert({ period, status: "open" }).select().single();
      if (error) { console.error("createPeriod", error); throw new Error("Не вдалося створити період"); }
      pRow = created;
    }
    if (["approved", "closed"].includes(pRow.status)) throw new Error("Період закрито — розрахунок не змінюється");

    const { data: profiles } = await context.supabase
      .from("payroll_profiles")
      .select("*, employee:employee_id(full_name,active)")
      .lte("valid_from", monthEnd)
      .or(`valid_to.is.null,valid_to.gte.${monthStart}`);

    const results: any[] = [];
    for (const prof of (profiles ?? []) as any[]) {
      if (prof.employee?.active === false) continue;

      const { data: existing } = await context.supabase
        .from("payroll_calculations").select("id,status,paid_amount")
        .eq("period_id", pRow.id).eq("employee_id", prof.employee_id).maybeSingle();
      if (existing && ["approved", "paid", "scheduled", "partially_paid"].includes(existing.status)) {
        results.push({ employee_id: prof.employee_id, skipped: true, reason: "Розрахунок уже затверджено" });
        continue;
      }

      const { data: facts } = existing
        ? await context.supabase.from("payroll_kpis").select("code,actual,status").eq("calculation_id", existing.id)
        : { data: [] as any[] };

      const kpiFacts: KpiFact[] = ((facts ?? []) as any[]).map((f) => ({
        code: f.code, actual: Number(f.actual) || 0, approved: f.status === "approved",
      }));

      const res = computePayroll({
        baseSalary: Number(prof.base_salary) || 0,
        advancePercent: Number(prof.advance_percent ?? 50),
        kpiRules: (prof.kpi_scheme ?? []) as KpiRule[],
        facts: kpiFacts,
        advancePaid: Number(existing?.paid_amount) || 0,
      });

      const calcPayload = {
        period_id: pRow.id, employee_id: prof.employee_id, profile_id: prof.id,
        payroll_group: prof.payroll_group ?? "administrative",
        base_amount: res.base_amount, advance_amount: res.advance_amount,
        kpi_amount: res.kpi_amount, bonus_amount: res.bonus_amount,
        deduction_amount: res.deduction_amount, reimbursement_amount: res.reimbursement_amount,
        total_payable: res.total_payable, status: "calculated",
        engine_version: res.engine_version, computed_at: new Date().toISOString(),
      };

      const { data: calc, error } = existing
        ? await context.supabase.from("payroll_calculations").update(calcPayload).eq("id", existing.id).select().single()
        : await context.supabase.from("payroll_calculations").insert(calcPayload).select().single();
      if (error) { console.error("payrollCalc", error); throw new Error("Не вдалося зберегти розрахунок"); }

      for (const k of res.kpis) {
        const { data: kExist } = await context.supabase
          .from("payroll_kpis").select("id").eq("calculation_id", calc.id).eq("code", k.code).maybeSingle();
        const kPayload = {
          calculation_id: calc.id, code: k.code, title: k.title, kpi_type: k.kpi_type,
          target: k.target, actual: k.actual, weight: k.weight, result: k.result, bonus: k.bonus, status: k.status,
        };
        if (kExist) await context.supabase.from("payroll_kpis").update(kPayload).eq("id", kExist.id);
        else await context.supabase.from("payroll_kpis").insert(kPayload);
      }

      results.push({ employee_id: prof.employee_id, name: prof.employee?.full_name, ...res });
    }

    return { period, schedule: payrollScheduleFor(period), calculations: results };
  });

export const listPayrollCalculations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: p } = await context.supabase.from("payroll_periods").select("id,status").eq("period", data.period).maybeSingle();
    if (!p) return { period: data.period, status: null, rows: [], schedule: payrollScheduleFor(data.period) };
    const { data: rows, error } = await context.supabase
      .from("payroll_calculations")
      .select("*, employee:employee_id(full_name), kpis:payroll_kpis(*), payments:payroll_payments(*)")
      .eq("period_id", p.id)
      .order("payroll_group");
    if (error) { console.error("listPayrollCalculations", error); throw new Error("Не вдалося завантажити розрахунки"); }
    return { period: data.period, status: p.status, rows: rows ?? [], schedule: payrollScheduleFor(data.period) };
  });

export const setPayrollKpiFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payrollKpiFactInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const patch: any = { actual: data.actual, status: data.approved ? "approved" : "pending" };
    if (data.approved) { patch.approved_by = context.userId; patch.approved_at = new Date().toISOString(); }
    const { error } = await context.supabase.from("payroll_kpis").update(patch)
      .eq("calculation_id", data.calculation_id).eq("code", data.code);
    if (error) { console.error("setPayrollKpiFact", error); throw new Error("Не вдалося зберегти KPI"); }
    return { ok: true };
  });

export const setPayrollStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payrollStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: before, error: e0 } = await context.supabase
      .from("payroll_calculations").select("*").eq("id", data.calculation_id).single();
    if (e0 || !before) throw new Error("Розрахунок не знайдено");
    const { data: after, error } = await context.supabase
      .from("payroll_calculations").update({ status: data.to_status }).eq("id", data.calculation_id).select().single();
    if (error) { console.error("setPayrollStatus", error); throw new Error("Не вдалося змінити статус"); }
    await context.supabase.from("payroll_approvals").insert({
      calculation_id: data.calculation_id, period_id: before.period_id,
      from_status: before.status, to_status: data.to_status, actor_id: context.userId,
      comment: data.comment ?? null, before_data: before, after_data: after,
    });
    return after;
  });

/** Зіставлення нарахувань із фактичними виплатами (операції Finmap типу «витрата» по співробітнику). */
export const reconcilePayrollPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: p } = await context.supabase.from("payroll_periods").select("id").eq("period", data.period).maybeSingle();
    if (!p) throw new Error("Період не знайдено");

    const monthStart = `${data.period}-01`;
    const monthEnd = new Date(Number(data.period.slice(0, 4)), Number(data.period.slice(5, 7)) + 1, 5).toISOString().slice(0, 10);

    const [{ data: calcs }, { data: tx }] = await Promise.all([
      context.supabase.from("payroll_calculations").select("id,employee_id,total_payable,paid_amount").eq("period_id", p.id),
      context.supabase.from("finance_transactions")
        .select("id,amount,amount_uah,op_date,counterparty_id,counterparty:counterparty_id(employee_id)")
        .eq("kind", "expense").gte("op_date", monthStart).lte("op_date", monthEnd),
    ]);

    let matched = 0;
    for (const c of (calcs ?? []) as any[]) {
      const own = ((tx ?? []) as any[]).filter((t) => t.counterparty?.employee_id === c.employee_id);
      if (!own.length) continue;
      let paid = 0;
      for (const t of own) {
        const amount = Number(t.amount_uah ?? t.amount) || 0;
        paid += amount;
        const { data: exists } = await context.supabase
          .from("payroll_payments").select("id").eq("transaction_id", t.id).maybeSingle();
        if (exists) continue;
        await context.supabase.from("payroll_payments").insert({
          calculation_id: c.id, employee_id: c.employee_id, period_id: p.id,
          payment_kind: new Date(t.op_date).getDate() <= 25 && new Date(t.op_date).getDate() >= 15 ? "advance" : "salary",
          amount, paid_at: t.op_date, transaction_id: t.id, match_status: "matched",
        });
        matched++;
      }
      const status = paid <= 0 ? undefined : paid + 0.5 >= Number(c.total_payable) ? "paid" : "partially_paid";
      await context.supabase.from("payroll_calculations")
        .update({ paid_amount: paid, ...(status ? { status } : {}) }).eq("id", c.id);
    }
    return { matched };
  });

export const getEmployeePayrollHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employee_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: rows, error } = await context.supabase
      .from("payroll_calculations")
      .select("*, period:period_id(period), payments:payroll_payments(*)")
      .eq("employee_id", data.employee_id)
      .order("created_at", { ascending: false }).limit(36);
    if (error) { console.error("getEmployeePayrollHistory", error); throw new Error("Не вдалося завантажити історію виплат"); }
    return rows ?? [];
  });

/**
 * Аванс 20-го / остаточний розрахунок 5-го як реальна операція Finmap.
 *
 * Ідемпотентність: externalId = terzi:payment:<uuid рядка payroll_payments>.
 * Сума нарахування не змінюється; фактична оплата, що прийде назад із Finmap
 * при наступній синхронізації, зменшує залишок (reconcilePayrollPayments).
 */
export const pushPayrollPaymentToFinmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      calculation_id: uuid,
      payment_kind: z.enum(["advance", "salary"]).default("advance"),
      amount: z.number().min(0.01),
      paid_at: z.string().min(4),
      account_id: uuid,
      category_id: uuid.nullish(),
      note: z.string().max(300).nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { finmapConfigured, finmap, externalIdFor } = await import("./finmap-client.server");
    if (!finmapConfigured()) throw new Error("Не додано ключ Finmap (FINMAP_API_KEY)");

    const { data: calc, error: e0 } = await context.supabase
      .from("payroll_calculations")
      .select("id,employee_id,period_id,total_payable,paid_amount,employee:employee_id(full_name)")
      .eq("id", data.calculation_id).single();
    if (e0 || !calc) throw new Error("Розрахунок не знайдено");

    const [{ data: account }, { data: cp }, { data: category }] = await Promise.all([
      context.supabase.from("finance_accounts").select("id,name,finmap_id,actual_balance,opening_balance").eq("id", data.account_id).single(),
      context.supabase.from("finance_counterparties").select("id,finmap_id,finmap_kind").eq("employee_id", calc.employee_id).maybeSingle(),
      data.category_id
        ? context.supabase.from("finance_categories").select("id,finmap_id").eq("id", data.category_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    if (!account?.finmap_id) throw new Error("Рахунок не синхронізовано з Finmap");

    // Створюємо запис виплати (план), щоб мати стабільний externalId.
    const { data: payment, error: e1 } = await context.supabase
      .from("payroll_payments")
      .insert({
        calculation_id: calc.id, employee_id: calc.employee_id, period_id: calc.period_id,
        payment_kind: data.payment_kind, amount: data.amount, paid_at: data.paid_at,
        match_status: "pending", note: data.note ?? null, finmap_status: "pending",
      })
      .select().single();
    if (e1 || !payment) { console.error("payroll_payments insert", e1); throw new Error("Не вдалося створити виплату"); }

    const externalId = externalIdFor("payment", payment.id);
    try {
      await finmap.createOperation("expense", {
        externalId,
        date: Date.parse(`${data.paid_at}T12:00:00Z`),
        sum: data.amount,
        accountFromId: account.finmap_id,
        ...(category?.finmap_id ? { categoryId: category.finmap_id } : {}),
        ...(cp?.finmap_id ? { counterpartyId: cp.finmap_id } : {}),
        comment: data.note ?? `${data.payment_kind === "advance" ? "Аванс" : "Остаточний розрахунок"} — ${calc.employee?.full_name ?? ""}`.trim(),
      });
    } catch (e: any) {
      await context.supabase.from("payroll_payments")
        .update({ finmap_status: "error", note: String(e?.message ?? e).slice(0, 300) }).eq("id", payment.id);
      throw new Error(`Finmap не прийняв операцію: ${String(e?.message ?? e)}`);
    }

    await context.supabase.from("payroll_payments")
      .update({ finmap_external_id: externalId, finmap_status: "sent" }).eq("id", payment.id);

    // Локальне відображення факту: операція у витратах + зменшення залишку на рахунку.
    // Ідемпотентність — за external_id; наступна синхронізація Finmap оновить цей же рядок.
    const { data: txExists } = await context.supabase
      .from("finance_transactions").select("id").eq("external_id", externalId).maybeSingle();
    if (!txExists) {
      await context.supabase.from("finance_transactions").insert({
        kind: "expense", op_date: data.paid_at, amount: data.amount, amount_uah: data.amount,
        currency: "UAH", account_id: account.id,
        ...(data.category_id ? { category_id: data.category_id } : {}),
        ...(cp?.id ? { counterparty_id: cp.id } : {}),
        comment: data.note ?? `${data.payment_kind === "advance" ? "Аванс" : "Остаточний розрахунок"} — ${calc.employee?.full_name ?? ""}`.trim(),
        source: "payroll", external_id: externalId, sync_status: "sent", match_status: "matched",
      });
      const balance = Number(account.actual_balance ?? account.opening_balance) || 0;
      await context.supabase.from("finance_accounts")
        .update({ actual_balance: balance - data.amount }).eq("id", account.id);
    }

    const paid = (Number(calc.paid_amount) || 0) + data.amount;
    await context.supabase.from("payroll_calculations").update({
      paid_amount: paid,
      status: paid + 0.5 >= (Number(calc.total_payable) || 0) ? "paid" : "partially_paid",
    }).eq("id", calc.id);

    return {
      ok: true,
      payment_id: payment.id,
      external_id: externalId,
      rest: Math.max((Number(calc.total_payable) || 0) - paid, 0),
    };
  });

