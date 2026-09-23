/**
 * Економіка об'єкта по бригадах (детерміновано, без AI).
 * План ≠ факт: факт лише з підтверджених рядків. Невідомо → null («немає даних»), не 0.
 * Ставка бригади — зарплатна; ціна клієнту з кошторису не підміняється.
 */
export type VolumeRow = {
  id: string; brigade_key: string; service_code: string; kind: "plan" | "fact";
  quantity: number; unit: string | null; source: string; period: string;
  confirmed: boolean; voided: boolean;
};
export type RateRow = {
  brigade_key: string; service_code: string; unit: string; rate: number;
  effective_from: string; effective_to: string | null; active: boolean;
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
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

export type LineAmount = { row: VolumeRow; rate: number | null; amount: number | null };

export function priceVolumes(rows: VolumeRow[], rates: RateRow[]): LineAmount[] {
  return rows.map((row) => {
    const rt = rateFor(rates, row.brigade_key, row.service_code, row.period);
    return { row, rate: rt?.rate ?? null, amount: rt ? r2(rt.rate * row.quantity) : null };
  });
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
    const qty = finite(l.qty);
    const m = mappings.find((x) => x.active && x.estimate_module === module && x.line_code === code);
    if (!m) unmapped.push({ code, name: l.name ?? code, reason: "немає маппінгу коду роботи" });
    else if (qty === null || qty <= 0) unmapped.push({ code, name: l.name ?? code, reason: "немає кількості" });
    else mapped.push({ code, name: l.name ?? code, service_code: m.service_code, quantity: qty, unit: m.unit ?? l.unit ?? null });
  }
  return { mapped, unmapped };
}

export type Economics = {
  estimate: EstimateSplit;
  plan: { lines: LineAmount[]; brigadeTotal: number | null; margin: number | null; marginBasis: string };
  fact: { lines: LineAmount[]; accruedByRate: number | null; payouts: number | null; unconfirmedPayouts: number; revenue: number | null; margin: number | null; marginBasis: string };
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

  let planMargin: number | null = null;
  let planBasis = "Немає даних: немає затвердженого кошторису";
  if (est.planRevenue !== null) {
    if (est.compositionKnown && planBrigade !== null) {
      planMargin = r2(est.planRevenue - (est.planNonLabor as number) - planBrigade);
      planBasis = "Виручка − матеріали/інші прямі (без праці кошторису) − план робіт бригад за ставками";
    } else if (est.planTotalCost !== null) {
      planMargin = r2(est.planRevenue - est.planTotalCost);
      planBasis = "Виручка − собівартість кошторису (праця вже всередині; бригада повторно не віднімається)";
    }
  }

  const livePay = input.payouts.filter((p) => !p.voided);
  const confirmedPay = livePay.filter((p) => p.confirmed);
  const payouts = confirmedPay.length ? r2(confirmedPay.reduce((s, p) => s + p.amount, 0)) : null;
  const unconfirmedPayouts = r2(livePay.filter((p) => !p.confirmed).reduce((s, p) => s + p.amount, 0));
  let factMargin: number | null = null;
  let factBasis = "Немає даних: потрібні підтверджені виручка, прямі витрати і виплати бригадам";
  if (input.factRevenue !== null && input.factNonLabor !== null && payouts !== null) {
    factMargin = r2(input.factRevenue - input.factNonLabor - payouts);
    factBasis = "Підтверджена виручка − підтверджені прямі витрати − підтверджені виплати бригадам";
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
    plan: { lines: planLines, brigadeTotal: planBrigade, margin: planMargin, marginBasis: planBasis },
    fact: { lines: factLines, accruedByRate: sumKnown(factLines.map((l) => l.amount)), payouts, unconfirmedPayouts, revenue: input.factRevenue, margin: factMargin, marginBasis: factBasis },
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
