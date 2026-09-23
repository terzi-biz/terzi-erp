/**
 * Економіка об'єкта по бригадах (детерміновано, без AI).
 * План ≠ факт: факт лише з підтверджених рядків. Невідомо → null («немає даних»), не 0.
 * Ставка бригади — зарплатна; ціна клієнту з кошторису не підміняється.
 */
export type VolumeRow = {
  id: string; brigade_key: string; service_code: string; kind: "plan" | "fact";
  quantity: number; unit: string | null; source: string; period: string;
  confirmed: boolean; voided: boolean;
  source_ref?: string | null;
};
export type RateRow = {
  brigade_key: string; service_code: string; unit: string; rate: number;
  effective_from: string; effective_to: string | null; active: boolean;
  /** per_unit (за замовч.) | minimum | fixed_until_threshold */
  pricing?: string | null; minimum_amount?: number | null; threshold_qty?: number | null;
  /** erp — довідник ERP (пріоритет); site — каталог відомості (лише читання, не записується). */
  source?: "erp" | "site";
};
export type PayoutRow = { brigade_key: string; amount: number; period: string; confirmed: boolean; voided: boolean };
export type EstimateLine = { block?: string; code?: string; name?: string; qty?: number; unit?: string; cost?: number };
export type MappingRow = { estimate_module: string; line_code: string; service_code: string; unit: string | null; active: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Ставка, дійсна на місяць періоду (перший день). Кілька дійсних — найновіша за effective_from. */
export function rateFor(rates: RateRow[], brigade: string, service: string, period: string): RateRow | null {
  const d = `${period}-01`;
  return rates
    .filter((r) => r.active && r.brigade_key === brigade && r.service_code === service && r.effective_from <= d && (!r.effective_to || r.effective_to >= d))
    .sort((a, b) => ((a.source === "site" ? 1 : 0) - (b.source === "site" ? 1 : 0)) || b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

export type LineAmount = { row: VolumeRow; rate: number | null; amount: number | null; rateSource?: "erp" | "site" | null };

/**
 * Сума за схемою ставки. Невідома/неповна схема → null (не 0).
 * fixed_until_threshold: qty ≤ threshold → фікс minimum_amount; qty > threshold → qty × rate
 * (напр. screed_base: до 100 м² — 12 000 ₴, понад 100 м² — 110 ₴/м² за всю площу).
 */
export function amountByRate(rt: RateRow, quantity: number): number | null {
  const mode = rt.pricing ?? "per_unit";
  const min = finite(rt.minimum_amount);
  const thr = finite(rt.threshold_qty);
  if (mode === "per_unit") return r2(rt.rate * quantity);
  if (mode === "minimum") return min === null ? null : r2(Math.max(min, rt.rate * quantity));
  if (mode === "fixed_until_threshold") {
    if (min === null || thr === null || thr <= 0) return null;
    return quantity <= thr ? r2(min) : r2(rt.rate * quantity);
  }
  return null;
}

/**
 * Суми по рядках. Фікс/мінімум застосовується до сумарного обсягу бригади×коду×періоду,
 * а не до кожного рядка окремо; сума розподіляється пропорційно обсягу.
 */
export function priceVolumes(rows: VolumeRow[], rates: RateRow[]): LineAmount[] {
  const groups = new Map<string, VolumeRow[]>();
  for (const row of rows) {
    const k = `${row.brigade_key}|${row.service_code}|${row.period}`;
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  const out = new Map<VolumeRow, LineAmount>();
  for (const grp of groups.values()) {
    const f = grp[0];
    const rt = rateFor(rates, f.brigade_key, f.service_code, f.period);
    if (!rt) { for (const row of grp) out.set(row, { row, rate: null, amount: null, rateSource: null }); continue; }
    const totalQty = grp.reduce((s, r) => s + r.quantity, 0);
    const total = amountByRate(rt, totalQty);
    if (total === null || totalQty <= 0) { for (const row of grp) out.set(row, { row, rate: rt.rate, amount: total === null ? null : 0, rateSource: rt.source ?? "erp" }); continue; }
    let rest = total;
    grp.forEach((row, i) => {
      const a = i === grp.length - 1 ? r2(rest) : r2((total * row.quantity) / totalQty);
      rest = r2(rest - a);
      out.set(row, { row, rate: rt.rate, amount: a, rateSource: rt.source ?? "erp" });
    });
  }
  return rows.map((r) => out.get(r)!);
}

/** Відсоток лише при відомій додатній виручці: gross / revenue × 100. */
export function pct(gross: number | null, revenue: number | null): number | null {
  if (gross === null || revenue === null || revenue <= 0) return null;
  return r2((gross / revenue) * 100);
}

/** Сума, або null якщо хоч один елемент невідомий чи список порожній. */
function sumKnown(xs: (number | null)[]): number | null {
  if (!xs.length || xs.some((x) => x === null)) return null;
  return r2(xs.reduce<number>((s, x) => s + (x as number), 0));
}

export type EstimateSplit = {
  planRevenue: number | null;
  planTotalCost: number | null;
  /** Кошторисна праця (блок works) — відома лише при наявних рядках. */
  estimateLabor: number | null;
  /** Матеріали/логістика/інше без праці. */
  planNonLabor: number | null;
  compositionKnown: boolean;
};

export function splitEstimate(est: { total_client: unknown; total_cost: unknown; internal_lines: unknown } | null): EstimateSplit {
  if (!est) return { planRevenue: null, planTotalCost: null, estimateLabor: null, planNonLabor: null, compositionKnown: false };
  const lines = Array.isArray(est.internal_lines) ? (est.internal_lines as EstimateLine[]) : [];
  const costs = lines.map((l) => finite(l.cost));
  const known = lines.length > 0 && costs.every((c) => c !== null);
  const labor = known ? r2(lines.reduce((s, l) => s + (l.block === "works" ? (finite(l.cost) as number) : 0), 0)) : null;
  const non = known ? r2(lines.reduce((s, l) => s + (l.block !== "works" ? (finite(l.cost) as number) : 0), 0)) : null;
  return { planRevenue: finite(est.total_client), planTotalCost: finite(est.total_cost), estimateLabor: labor, planNonLabor: non, compositionKnown: known };
}

/** Позиції робіт кошторису → коди робіт через налаштовуваний маппінг. */
export function mapEstimateWorks(module: string | null, lines: unknown, mappings: MappingRow[]) {
  const arr = Array.isArray(lines) ? (lines as EstimateLine[]) : [];
  const mapped: { code: string; name: string; service_code: string; quantity: number; unit: string | null }[] = [];
  const unmapped: { code: string; name: string; reason: string }[] = [];
  for (const l of arr.filter((x) => x.block === "works")) {
    const code = String(l.code ?? "");
    const qty = finite(l.qty ?? (l as any).quantity);
    const m = mappings.find((x) => x.active && x.estimate_module === module && x.line_code === code);
    if (!m) unmapped.push({ code, name: l.name ?? code, reason: "немає маппінгу коду роботи" });
    else if (qty === null || qty <= 0) unmapped.push({ code, name: l.name ?? code, reason: "немає кількості" });
    else mapped.push({ code, name: l.name ?? code, service_code: m.service_code, quantity: qty, unit: m.unit ?? l.unit ?? null });
  }
  return { mapped, unmapped };
}

export type Economics = {
  estimate: EstimateSplit;
  /** gross — валова прибуток у ₴; marginPct — gross/revenue×100 (%). */
  plan: { lines: LineAmount[]; brigadeTotal: number | null; gross: number | null; marginPct: number | null; grossBasis: string };
  fact: {
    lines: LineAmount[]; accruedByRate: number | null; revenue: number | null;
    gross: number | null; marginPct: number | null; grossBasis: string;
    /** Взаєморозрахунки з бригадами — не впливають на валовий прибуток. */
    settlement: { accrued: number | null; paid: number | null; unconfirmedPayouts: number; due: number | null };
  };
  diff: { brigade_key: string; service_code: string; plan: number; fact: number; delta: number }[];
};

export function computeEconomics(input: {
  estimate: { total_client: unknown; total_cost: unknown; internal_lines: unknown } | null;
  volumes: VolumeRow[]; rates: RateRow[]; payouts: PayoutRow[];
  /** Підтверджена фактична виручка (null — немає даних). */
  factRevenue: number | null;
  /** Підтверджені фактичні прямі витрати БЕЗ бригад (null — немає даних). */
  factNonLabor: number | null;
}): Economics {
  const est = splitEstimate(input.estimate);
  const live = input.volumes.filter((v) => !v.voided);
  const planLines = priceVolumes(live.filter((v) => v.kind === "plan"), input.rates);
  const factLines = priceVolumes(live.filter((v) => v.kind === "fact" && v.confirmed), input.rates);
  const planBrigade = sumKnown(planLines.map((l) => l.amount));

  let planGross: number | null = null;
  let planBasis = "Немає даних: немає затвердженого кошторису";
  if (est.planRevenue !== null) {
    if (est.compositionKnown && planBrigade !== null) {
      planGross = r2(est.planRevenue - (est.planNonLabor as number) - planBrigade);
      planBasis = "Виручка − матеріали/інші прямі (без праці кошторису) − план робіт бригад за ставками";
    } else if (est.planTotalCost !== null) {
      planGross = r2(est.planRevenue - est.planTotalCost);
      planBasis = "Виручка − собівартість кошторису (праця вже всередині; бригада повторно не віднімається)";
    }
  }

  const livePay = input.payouts.filter((p) => !p.voided);
  const confirmedPay = livePay.filter((p) => p.confirmed);
  const payouts = confirmedPay.length ? r2(confirmedPay.reduce((s, p) => s + p.amount, 0)) : null;
  const unconfirmedPayouts = r2(livePay.filter((p) => !p.confirmed).reduce((s, p) => s + p.amount, 0));
  const accrued = sumKnown(factLines.map((l) => l.amount));
  let factGross: number | null = null;
  let factBasis = "Немає даних: потрібні підтверджені виручка, прямі витрати і нарахування бригадам за ставками";
  if (input.factRevenue !== null && input.factNonLabor !== null && accrued !== null) {
    factGross = r2(input.factRevenue - input.factNonLabor - accrued);
    factBasis = "Підтверджена виручка − підтверджені прямі витрати − нараховано бригадам за підтвердженими обсягами (виплати не впливають)";
  }

  const key = (l: LineAmount) => `${l.row.brigade_key}|${l.row.service_code}`;
  const agg = new Map<string, { plan: number; fact: number }>();
  for (const l of planLines) { const a = agg.get(key(l)) ?? { plan: 0, fact: 0 }; a.plan += l.row.quantity; agg.set(key(l), a); }
  for (const l of factLines) { const a = agg.get(key(l)) ?? { plan: 0, fact: 0 }; a.fact += l.row.quantity; agg.set(key(l), a); }
  const diff = [...agg.entries()].map(([k, v]) => {
    const [brigade_key, service_code] = k.split("|");
    return { brigade_key, service_code, plan: r2(v.plan), fact: r2(v.fact), delta: r2(v.fact - v.plan) };
  });

  return {
    estimate: est,
    plan: { lines: planLines, brigadeTotal: planBrigade, gross: planGross, marginPct: pct(planGross, est.planRevenue), grossBasis: planBasis },
    fact: {
      lines: factLines, accruedByRate: accrued, revenue: input.factRevenue,
      gross: factGross, marginPct: pct(factGross, input.factRevenue), grossBasis: factBasis,
      settlement: { accrued, paid: payouts, unconfirmedPayouts, due: accrued !== null ? r2(accrued - (payouts ?? 0)) : null },
    },
    diff,
  };
}

/** workItems/planWorkItems для приймача: лише зіставлені бригади; факт — тільки підтверджений. */
export function payrollWorkItems(volumes: VolumeRow[], payrollIds: Record<string, string | null | undefined>) {
  const toItem = (v: VolumeRow) => {
    const id = payrollIds[v.brigade_key];
    return id ? { brigadeId: id, serviceCode: v.service_code, quantity: v.quantity } : null;
  };
  const live = volumes.filter((v) => !v.voided);
  const plan = live.filter((v) => v.kind === "plan").map(toItem).filter((x): x is NonNullable<typeof x> => !!x);
  const fact = live.filter((v) => v.kind === "fact" && v.confirmed).map(toItem).filter((x): x is NonNullable<typeof x> => !!x);
  const skipped = live.filter((v) => !payrollIds[v.brigade_key]).length;
  return { plan, fact, skipped };
}

/**
 * Ставки з каталогу відомості як read-only fallback (не записуються в brigade_work_rates).
 * Лише rate != null; зіставлення по payroll_id або канонічному алiасу; без вгадування за назвою.
 * pricing='screed_base' → fixed_until_threshold (поріг 100 м²): qty ≤ 100 → minimum (12 000),
 * qty > 100 → qty × rate за весь обсяг (101 м² = 11 110). Інші коди: per_unit, навіть якщо
 * minimum=0. Невідому схему pricing не вгадуємо → ставку пропущено.
 */
export function siteCatalogRates(
  catalog: { brigades: { id: string; active: boolean; rates: { code: string; unit: string | null; rate: number | null; pricing: string | null; minimum: number | null }[] }[] } | null,
  locals: { key: string; payroll_id: string | null }[],
  alias: Record<string, string | null | undefined>,
): RateRow[] {
  if (!catalog) return [];
  const out: RateRow[] = [];
  for (const l of locals) {
    const sid = l.payroll_id ?? alias[l.key] ?? null;
    const b = sid ? catalog.brigades.find((x) => x.id === sid && x.active) : undefined;
    if (!b) continue;
    for (const r of b.rates) {
      if (r.rate === null || !Number.isFinite(r.rate) || r.rate < 0) continue;
      const p = (r.pricing ?? "").toLowerCase();
      let pricing: string;
      let minimum: number | null = null;
      let threshold: number | null = null;
      if (p === "screed_base") {
        if (r.minimum === null || !Number.isFinite(r.minimum) || r.minimum <= 0) continue;
        pricing = "fixed_until_threshold";
        minimum = r.minimum;
        threshold = 100;
      } else if (p === "" || p === "per_unit" || p === "unit" || p === "per_m2" || p === "rate") {
        pricing = "per_unit";
      } else {
        continue;
      }
      out.push({ brigade_key: l.key, service_code: r.code, unit: r.unit ?? "", rate: r.rate, effective_from: "0000-01-01", effective_to: null, active: true, pricing, minimum_amount: minimum, threshold_qty: threshold, source: "site" });
    }
  }
  return out;
}
