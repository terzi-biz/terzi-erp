/**
 * Маркетинговий калькулятор TERZI — детерміноване ядро.
 * Усі цифри рахуються тільки тут. AI/рекомендації лише пояснюють готовий результат.
 * Відсутнє або невизначене значення → null (ніколи не підміняється нулем).
 */
export const MARKETING_CALC_VERSION = "mkt-calc-1.0.0";

export type PlanMode = "contracts" | "revenue";
export type SourceLabel = "fact" | "manual" | "assumption";
export type Status = "ok" | "warn" | "stop" | "na";
export type Constraint = "target" | "financial_cap" | "measurement_capacity" | "production_capacity" | "funnel_efficiency";

export type CalcInputs = {
  revenueMonths: (number | null)[]; // останні 5 закритих місяців, від найстаршого
  prevRevenueMonths: (number | null)[]; // попередні 5 місяців (для тренду), можуть бути порожні
  marketingCapPct: number;
  testBudgetPct: number; // % від маркетингового фонду
  operationsCapPct: number; // % від маркетингового фонду, лише стеля
  performanceMediaPct: number; // % від маркетингового фонду
  grossMarginPct: number;
  maxCacGpPct: number;
  safetyPct: number;
  avgContractValue: number;
  leadToMeasPct: number; // лід → заброньований (або завершений, якщо show-up вимкнено) замір
  showUpEnabled: boolean;
  showUpPct: number;
  measToEstPct: number;
  estToContractPct: number;
  planMode: PlanMode;
  targetContracts: number;
  targetRevenue: number;
  measurementCapacity: number; // завершені заміри / міс
  contractCapacity: number; // договори / міс (виробнича потужність)
  opsActualCost: number;
  actualCpl: number | null; // факт CPL поточного періоду, якщо є
};

export const DEFAULT_INPUTS: CalcInputs = {
  revenueMonths: [null, null, null, null, null],
  prevRevenueMonths: [],
  marketingCapPct: 15,
  testBudgetPct: 10,
  operationsCapPct: 30,
  performanceMediaPct: 60,
  grossMarginPct: 25.5,
  maxCacGpPct: 25,
  safetyPct: 80,
  avgContractValue: 0,
  leadToMeasPct: 0,
  showUpEnabled: false,
  showUpPct: 90,
  measToEstPct: 0,
  estToContractPct: 0,
  planMode: "contracts",
  targetContracts: 0,
  targetRevenue: 0,
  measurementCapacity: 0,
  contractCapacity: 0,
  opsActualCost: 0,
  actualCpl: null,
};

const fin = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
export function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!fin(a) || !fin(b) || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}
const mul = (...xs: (number | null | undefined)[]): number | null => (xs.every(fin) ? (xs as number[]).reduce((p, x) => p * x, 1) : null);
const sub = (a: number | null, b: number | null): number | null => (fin(a) && fin(b) ? a - b : null);
const add = (...xs: (number | null)[]): number | null => (xs.every(fin) ? (xs as number[]).reduce((p, x) => p + x, 0) : null);
const pct = (v: number) => v / 100;
export function avg(xs: (number | null)[]): number | null {
  const v = xs.filter(fin);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
const minNullable = (xs: (number | null)[]) => {
  const v = xs.filter(fin);
  return v.length ? Math.min(...v) : null;
};

export type CalcOutputs = ReturnType<typeof calculate>;

export function calculate(i: CalcInputs) {
  const revenueAvg5 = avg(i.revenueMonths);
  const prevAvg5 = avg(i.prevRevenueMonths);
  const revenueTrendPct = prevAvg5 ? mul(safeDiv(sub(revenueAvg5, prevAvg5), prevAvg5), 100) : null;
  const gm = pct(i.grossMarginPct);
  const gpBaseline = mul(revenueAvg5, gm);
  const marketingFundCap = mul(revenueAvg5, pct(i.marketingCapPct));
  const operationsCap = mul(marketingFundCap, pct(i.operationsCapPct));
  const opsVariance = sub(i.opsActualCost, operationsCap); // >0 — перевищення стелі
  const testBudget = mul(marketingFundCap, pct(i.testBudgetPct));
  const performanceMediaCap = mul(marketingFundCap, pct(i.performanceMediaPct));

  const gpPerContract = i.avgContractValue > 0 ? i.avgContractValue * gm : null;
  const maxFullCac = mul(gpPerContract, pct(i.maxCacGpPct));
  const showUp = i.showUpEnabled ? pct(i.showUpPct) : 1;
  const leadToContract = pct(i.leadToMeasPct) * showUp * pct(i.measToEstPct) * pct(i.estToContractPct);
  const l2c = leadToContract > 0 ? leadToContract : null;
  const breakEvenCpl = mul(maxFullCac, l2c);
  const targetCpl = mul(breakEvenCpl, pct(i.safetyPct));

  const requiredContracts = i.planMode === "contracts"
    ? (i.targetContracts > 0 ? i.targetContracts : null)
    : safeDiv(i.targetRevenue > 0 ? i.targetRevenue : null, i.avgContractValue);
  const requiredEstimates = safeDiv(requiredContracts, pct(i.estToContractPct));
  const requiredMeasurements = safeDiv(requiredEstimates, pct(i.measToEstPct));
  const requiredBooked = i.showUpEnabled ? safeDiv(requiredMeasurements, showUp) : null;
  const requiredLeads = safeDiv(i.showUpEnabled ? requiredBooked : requiredMeasurements, pct(i.leadToMeasPct));
  const requiredMedia = mul(requiredLeads, targetCpl);

  // Потужність у договорах: замірна (через конверсії) і виробнича.
  const measCapContracts = i.measurementCapacity > 0 ? i.measurementCapacity * pct(i.measToEstPct) * pct(i.estToContractPct) : null;
  const prodCapContracts = i.contractCapacity > 0 ? i.contractCapacity : null;
  const mediaFor = (contracts: number | null) => mul(safeDiv(contracts, l2c), targetCpl);
  const candidates: { c: Constraint; v: number | null }[] = [
    { c: "target", v: requiredMedia },
    { c: "financial_cap", v: performanceMediaCap },
    { c: "measurement_capacity", v: mediaFor(measCapContracts) },
    { c: "production_capacity", v: mediaFor(prodCapContracts) },
  ];
  let recommendedMedia: number | null = null;
  let limitingFactor: Constraint = "funnel_efficiency";
  if (fin(targetCpl) && targetCpl > 0) {
    for (const cand of candidates) {
      if (fin(cand.v) && (recommendedMedia === null || cand.v < recommendedMedia)) {
        recommendedMedia = cand.v;
        limitingFactor = cand.c;
      }
    }
  }

  const forecastLeads = safeDiv(recommendedMedia, targetCpl);
  const forecastContracts = mul(forecastLeads, l2c);
  const forecastMeasurements = mul(forecastLeads, pct(i.leadToMeasPct), showUp);
  const forecastEstimates = mul(forecastMeasurements, pct(i.measToEstPct));
  const forecastRevenue = mul(forecastContracts, i.avgContractValue || null);
  const forecastGp = mul(forecastRevenue, gm);
  const mediaCac = safeDiv(recommendedMedia, forecastContracts);
  const fullBudget = add(recommendedMedia, testBudget, i.opsActualCost);
  const fullCac = safeDiv(fullBudget, forecastContracts);
  const fullCacToGpPct = mul(safeDiv(fullCac, gpPerContract), 100);
  const costPerMeasurement = safeDiv(fullBudget, forecastMeasurements);
  const costPerEstimate = safeDiv(fullBudget, forecastEstimates);
  const mer = safeDiv(forecastRevenue, fullBudget);
  const mediaRoas = safeDiv(forecastRevenue, recommendedMedia);
  const gpRomi = safeDiv(sub(forecastGp, fullBudget), fullBudget);
  const contributionAfterMarketing = sub(forecastGp, fullBudget);
  const breakEvenContracts = safeDiv(fullBudget, gpPerContract);
  const breakEvenLeads = safeDiv(breakEvenContracts, l2c);
  const marketingPctRevenue = mul(safeDiv(fullBudget, forecastRevenue), 100);
  const marketingPctGp = mul(safeDiv(fullBudget, forecastGp), 100);
  const measUtilPct = mul(safeDiv(forecastMeasurements, i.measurementCapacity || null), 100);
  const contractUtilPct = mul(safeDiv(forecastContracts, i.contractCapacity || null), 100);
  const maxContracts = minNullable([measCapContracts, prodCapContracts]);
  const headroomContracts = fin(maxContracts) && fin(forecastContracts) ? Math.max(0, maxContracts - forecastContracts) : null;
  const headroomLeads = safeDiv(headroomContracts, l2c);
  const requiredVsCapPct = mul(safeDiv(requiredMedia, performanceMediaCap), 100);
  const mediaGap = fin(requiredMedia) && fin(performanceMediaCap) ? Math.max(0, requiredMedia - performanceMediaCap) : null;

  return {
    revenueAvg5, prevAvg5, revenueTrendPct, gpBaseline, marketingFundCap, operationsCap, opsActual: i.opsActualCost,
    opsVariance, testBudget, performanceMediaCap, gpPerContract, maxFullCac, leadToContract: l2c, breakEvenCpl, targetCpl,
    actualCpl: i.actualCpl, requiredContracts, requiredEstimates, requiredMeasurements, requiredBooked, requiredLeads,
    requiredMedia, recommendedMedia, limitingFactor, forecastLeads, forecastMeasurements, forecastEstimates, forecastContracts,
    forecastRevenue, forecastGp, mediaCac, fullBudget, fullCac, fullCacToGpPct, costPerMeasurement, costPerEstimate, mer,
    mediaRoas, gpRomi, contributionAfterMarketing, breakEvenContracts, breakEvenLeads, marketingPctRevenue, marketingPctGp,
    measUtilPct, contractUtilPct, headroomContracts, headroomLeads, requiredVsCapPct, mediaGap, maxContracts,
  };
}

export const CONSTRAINT_LABELS: Record<Constraint, string> = {
  target: "Ціль (обмежень немає)",
  financial_cap: "Фінансова стеля медіа",
  measurement_capacity: "Потужність замірів",
  production_capacity: "Виробнича потужність",
  funnel_efficiency: "Ефективність воронки / економіка",
};

// ---------- Форматування ----------
export const fmtUah = (v: number | null) => (fin(v) ? `${Math.round(v).toLocaleString("uk-UA")} ₴` : "—");
export const fmtNum = (v: number | null, d = 1) => (fin(v) ? v.toLocaleString("uk-UA", { maximumFractionDigits: d }) : "—");
export const fmtPctV = (v: number | null, d = 1) => (fin(v) ? `${v.toLocaleString("uk-UA", { maximumFractionDigits: d })}%` : "—");

// ---------- Контроль економіки ----------
export type ControlRow = { key: string; label: string; value: string; what: string; formula: string; meaning: string; status: Status; note: string };

export function controlRows(o: CalcOutputs, i: CalcInputs): ControlRow[] {
  const rows: ControlRow[] = [];
  const r = (x: ControlRow) => rows.push(x);
  r({
    key: "gp_contract", label: "GP / договір", value: fmtUah(o.gpPerContract),
    what: "Скільки валового прибутку в середньому приносить один договір.",
    formula: "Середній чек × Валова маржа",
    meaning: fin(o.gpPerContract) ? `Кожен договір дає ~${fmtUah(o.gpPerContract)} прибутку до маркетингу й постійних витрат.` : "Немає середнього чеку — економіку договору не порахувати.",
    status: fin(o.gpPerContract) ? "ok" : "na",
    note: fin(o.gpPerContract) ? "Зростання чеку чи маржі напряму розширює допустимий CAC." : "Внесіть середній чек.",
  });
  r({
    key: "max_cac", label: "Max Full CAC", value: fmtUah(o.maxFullCac),
    what: "Максимум, який можна витратити на маркетинг, щоб отримати один договір.",
    formula: "GP / договір × Допустима частка CAC",
    meaning: fin(o.maxFullCac) ? `Не більше ${fmtUah(o.maxFullCac)} на договір (${i.maxCacGpPct}% прибутку договору).` : "Не визначено.",
    status: fin(o.maxFullCac) ? "ok" : "na", note: "Це ліміт, а не ціль — працювати краще нижче нього.",
  });
  const cacShare = o.fullCacToGpPct;
  r({
    key: "cac_gp", label: "Full CAC / GP договору", value: fmtPctV(cacShare),
    what: "Яку частку прибутку договору з'їдає маркетинг.",
    formula: "Full CAC ÷ GP / договір",
    meaning: fin(cacShare) ? `Маркетинг забирає ${fmtPctV(cacShare)} прибутку кожного договору при ліміті ${i.maxCacGpPct}%.` : "Немає прогнозу договорів.",
    status: !fin(cacShare) ? "na" : cacShare > i.maxCacGpPct ? "stop" : cacShare > i.maxCacGpPct * 0.85 ? "warn" : "ok",
    note: fin(cacShare) && cacShare > i.maxCacGpPct ? "Ризик: масштабування знищує прибуток." : "Можливість: є запас до ліміту.",
  });
  r({
    key: "romi", label: "GP ROMI", value: fmtPctV(mul(o.gpRomi, 100)),
    what: "Скільки валового прибутку зверху повертає кожна гривня маркетингу.",
    formula: "(Прогноз GP − Повний бюджет) ÷ Повний бюджет",
    meaning: fin(o.gpRomi) ? (o.gpRomi >= 0 ? `Кожна 1 ₴ маркетингу повертає ${fmtNum(1 + o.gpRomi, 2)} ₴ валового прибутку.` : "Маркетинг коштує більше, ніж приносить прибутку.") : "Немає даних.",
    status: !fin(o.gpRomi) ? "na" : o.gpRomi < 0 ? "stop" : o.gpRomi < 1 ? "warn" : "ok",
    note: fin(o.gpRomi) && o.gpRomi >= 1 ? "Можна масштабувати ступенями." : "Не масштабувати до покращення.",
  });
  r({
    key: "req_cap", label: "Потрібне медіа / стеля Performance", value: fmtPctV(o.requiredVsCapPct),
    what: "Чи влазить потрібний під ціль бюджет у дозволену стелю.",
    formula: "Потрібний медіабюджет ÷ Performance Media Cap",
    meaning: fin(o.requiredVsCapPct) ? (o.requiredVsCapPct > 100 ? `Для цілі бракує ${fmtUah(o.mediaGap)} понад стелю.` : "Ціль вміщується в стелю.") : "Немає даних.",
    status: !fin(o.requiredVsCapPct) ? "na" : o.requiredVsCapPct > 100 ? "stop" : o.requiredVsCapPct > 90 ? "warn" : "ok",
    note: "При перевищенні: покращуйте воронку або CPL, а не лише піднімайте стелю.",
  });
  r({
    key: "mkt_gp", label: "Маркетинг % від GP", value: fmtPctV(o.marketingPctGp),
    what: "Яка частка всього валового прибутку йде на маркетинг.",
    formula: "Повний бюджет ÷ Прогноз GP",
    meaning: fin(o.marketingPctGp) ? `${fmtPctV(o.marketingPctGp)} валового прибутку йде на маркетинг.` : "Немає даних.",
    status: !fin(o.marketingPctGp) ? "na" : o.marketingPctGp > 50 ? "stop" : o.marketingPctGp > 35 ? "warn" : "ok",
    note: "Вище 35% — мало лишається на офіс і прибуток.",
  });
  const util = Math.max(o.measUtilPct ?? -1, o.contractUtilPct ?? -1);
  r({
    key: "capacity", label: "Завантаження потужностей", value: `${fmtPctV(o.measUtilPct, 0)} заміри · ${fmtPctV(o.contractUtilPct, 0)} договори`,
    what: "Наскільки план завантажує замірників і виробництво.",
    formula: "Прогноз ÷ Місячна потужність",
    meaning: util < 0 ? "Потужність не задана." : `Найбільше завантаження ${fmtPctV(util, 0)}; запас — ${fmtNum(o.headroomContracts)} договорів.`,
    status: util < 0 ? "na" : util > 100 ? "stop" : util > 90 ? "warn" : "ok",
    note: util > 90 ? "Вузьке місце: більше лідів не дасть більше договорів." : "Є простір для зростання.",
  });
  const cplOk = fin(o.actualCpl) && fin(o.targetCpl);
  r({
    key: "cpl", label: "Target CPL vs факт", value: `${fmtUah(o.targetCpl)} / ${fmtUah(o.actualCpl)}`,
    what: "Цільова ціна ліда з запасом безпеки проти фактичної.",
    formula: "Max CAC × Лід→Договір × Коеф. безпеки",
    meaning: cplOk ? (o.actualCpl! > o.targetCpl! ? `Фактичний CPL вищий за цільовий на ${fmtUah(o.actualCpl! - o.targetCpl!)}.` : "Фактичний CPL у межах цілі.") : "Немає фактичного CPL для порівняння.",
    status: !cplOk ? "na" : o.actualCpl! > (o.breakEvenCpl ?? Infinity) ? "stop" : o.actualCpl! > o.targetCpl! ? "warn" : "ok",
    note: "Break-even CPL — межа, Target CPL — робоча ціль.",
  });
  return rows;
}

// ---------- Рекомендації (детерміновані) ----------
export type Recommendation = { status: Status; title: string; text: string };

export function recommendations(o: CalcOutputs, i: CalcInputs): Recommendation[] {
  const out: Recommendation[] = [];
  if (fin(o.fullCacToGpPct) && o.fullCacToGpPct > i.maxCacGpPct && fin(o.fullCac) && fin(o.maxFullCac)) {
    out.push({ status: "stop", title: "СТОП масштабування: CAC вищий за ліміт",
      text: `Full CAC ${fmtUah(o.fullCac)} при ліміті ${fmtUah(o.maxFullCac)}. Знизьте CAC на ${fmtUah(o.fullCac - o.maxFullCac)} на договір або підніміть GP/конверсію.` });
  }
  if (fin(o.mediaGap) && o.mediaGap > 0) {
    out.push({ status: "warn", title: "Потрібне медіа перевищує стелю",
      text: `Розрив ${fmtUah(o.mediaGap)}. Варіанти: покращити воронку, знизити CPL, або підняти стелю лише якщо CAC/GP ≤ ${i.maxCacGpPct}%.` });
  }
  if ((o.measUtilPct ?? 0) > 90 || (o.contractUtilPct ?? 0) > 90) {
    out.push({ status: "warn", title: "Вузьке місце потужностей",
      text: `Заміри ${fmtPctV(o.measUtilPct, 0)}, договори ${fmtPctV(o.contractUtilPct, 0)}. Додаткові ліди впруться в потужність — спершу розширюйте замірників/бригади.` });
  }
  if (fin(o.gpRomi) && o.gpRomi >= 1 && (o.headroomContracts ?? 0) > 0 && (o.fullCacToGpPct ?? 100) <= i.maxCacGpPct) {
    out.push({ status: "ok", title: "Можна масштабувати ступенями 10–20%",
      text: `GP ROMI ${fmtPctV(o.gpRomi * 100, 0)}, запас ${fmtNum(o.headroomContracts)} договорів. Підвищуйте бюджет на 10–20% і контролюйте CAC щотижня.` });
  }
  const stages = [
    { name: "Лід → Замір", v: i.leadToMeasPct },
    { name: "Замір → Кошторис", v: i.measToEstPct },
    { name: "Кошторис → Договір", v: i.estToContractPct },
  ].filter((s) => s.v > 0);
  if (stages.length && fin(o.forecastContracts) && fin(o.gpPerContract)) {
    const weak = stages.reduce((a, b) => (b.v < a.v ? b : a));
    const extraContracts = o.forecastContracts * 0.1; // +10% відносно до етапу → +10% договорів
    out.push({ status: "warn", title: `Найслабший етап: ${weak.name} (${fmtPctV(weak.v)})`,
      text: `Покращення цього етапу на 10% дає ~${fmtNum(extraContracts)} договорів і ~${fmtUah(extraContracts * o.gpPerContract)} GP без збільшення бюджету.` });
  }
  if (fin(o.marketingPctGp) && o.marketingPctGp > 35) {
    out.push({ status: o.marketingPctGp > 50 ? "stop" : "warn", title: "Маркетинг забирає забагато GP",
      text: `${fmtPctV(o.marketingPctGp)} валового прибутку — на маркетинг. Ціль ≤ 35%.` });
  }
  if (!out.length) out.push({ status: "na", title: "Недостатньо даних", text: "Заповніть середній чек, конверсії та ціль, щоб отримати рекомендації." });
  return out;
}

// ---------- Сценарії ----------
export type Scenario = { key: string; label: string; targetPct: number; conversionPct: number; checkPct: number };
export const DEFAULT_SCENARIOS: Scenario[] = [
  { key: "conservative", label: "Conservative", targetPct: 80, conversionPct: 90, checkPct: 95 },
  { key: "base", label: "Base", targetPct: 100, conversionPct: 100, checkPct: 100 },
  { key: "growth", label: "Growth", targetPct: 125, conversionPct: 105, checkPct: 105 },
];
export function applyScenario(i: CalcInputs, s: Scenario): CalcInputs {
  const c = pct(s.conversionPct);
  return {
    ...i,
    targetContracts: i.targetContracts * pct(s.targetPct),
    targetRevenue: i.targetRevenue * pct(s.targetPct),
    leadToMeasPct: Math.min(100, i.leadToMeasPct * c),
    measToEstPct: Math.min(100, i.measToEstPct * c),
    estToContractPct: Math.min(100, i.estToContractPct * c),
    avgContractValue: i.avgContractValue * pct(s.checkPct),
  };
}

// ---------- План vs Факт ----------
export function monthPace(p: { planMedia: number | null; spendFact: number; dayOfMonth: number; daysInMonth: number }) {
  const forecast = p.dayOfMonth > 0 ? (p.spendFact / p.dayOfMonth) * p.daysInMonth : null;
  const remainingDays = Math.max(0, p.daysInMonth - p.dayOfMonth);
  const safeDaily = fin(p.planMedia) && remainingDays > 0 ? Math.max(0, (p.planMedia - p.spendFact) / remainingDays) : null;
  return { forecast, remainingDays, safeDaily };
}
