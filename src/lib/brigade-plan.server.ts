/** Спільна логіка: планові обсяги бригади з останнього затвердженого кошторису (один джерело правди). */
export async function estimatePlanRows(db: any, orderId: string) {
  const { mapEstimateWorks } = await import("./brigade-economics");
  const { data: est } = await db.from("estimates").select("id,module,internal_lines").eq("order_id", orderId).not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle();
  if (!est) throw new Error("Немає затвердженого кошторису");
  const { data: mappings } = await db.from("work_code_mappings").select("estimate_module,line_code,service_code,unit,active");
  const { mapped } = mapEstimateWorks(est.module, est.internal_lines, (mappings ?? []) as any);
  if (!mapped.length) throw new Error("Жодна позиція робіт кошторису не зіставлена з кодом роботи — налаштуйте маппінг");
  const ref = `estimate:${est.id}`;
  const rows = mapped.map((m: any) => ({ service_code: m.service_code, quantity: m.quantity, unit: m.unit, source_ref: `${ref}:${m.code}` }));
  return { rows, ref };
}

/** Замінює план бригади з кошторису (попередній анулюється, історія зберігається). */
export async function applyEstimatePlan(db: any, orderId: string, brigadeKey: string, period: string, userId: string) {
  const { rows } = await estimatePlanRows(db, orderId);
  await db.from("order_work_volumes").update({ voided: true }).eq("order_id", orderId).eq("brigade_key", brigadeKey)
    .eq("kind", "plan").eq("source", "estimate").eq("voided", false);
  const ins = rows.map((r: any) => ({ ...r, order_id: orderId, brigade_key: brigadeKey, kind: "plan", source: "estimate", period, created_by: userId }));
  const { error } = await db.from("order_work_volumes").insert(ins);
  if (error) throw new Error(error.message);
  return ins.length;
}
