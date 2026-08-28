import { describe, expect, it } from "vitest";
import {
  buildCanonicalResult,
  computeAdjustments,
  defaultSellerSettings,
  clientAmortAmount,
  DEFAULT_AMORT_SETTINGS,
  findBlockingPriceErrors,
  type RawLine,
} from "../core";
import { hasForbiddenClientKeys, toClientDTO, toInternalDTO } from "../core/dto";
import { coreFromLegacyResult, sellerFromLegacy } from "../core/legacy-adapter";
import { buildEstimateSnapshot } from "../estimate-snapshot";
import { calculatePvc, DEFAULT_PVC_COEFFS } from "../pvc-calc";
import { calculateInsulation } from "../insulation-calc";
import { calculateDemolition } from "../demolition-calc";

const line = (over: Partial<RawLine> & Pick<RawLine, "key" | "block" | "qtyTech">): RawLine => ({
  name: over.key,
  unit: "шт",
  sellPerUnit: 100,
  buyPerUnit: 60,
  ...over,
} as RawLine);

describe("Calculation Core — податки та продавці", () => {
  it("ФОП 2: без ПДВ і без безготівкової надбавки", () => {
    const r = buildCanonicalResult({
      module: "t", areaM2: 10, engineVersion: "t@1",
      seller: defaultSellerSettings("fop2"),
      lines: [line({ key: "m", block: "materials", qtyTech: 10 })],
    });
    expect(r.vatTotal).toBe(0);
    expect(r.totalClient).toBe(1000);
  });

  it("ФОП 3: безготівкова надбавка +6% за замовчуванням, редагована", () => {
    const seller = defaultSellerSettings("fop3");
    expect(seller.cashlessAdjustPercent).toBe(6);
    const r = buildCanonicalResult({
      module: "t", areaM2: 10, engineVersion: "t@1", seller,
      lines: [line({ key: "m", block: "materials", qtyTech: 10 })],
    });
    expect(r.revenueNet).toBe(1060);
    const custom = buildCanonicalResult({
      module: "t", areaM2: 10, engineVersion: "t@1",
      seller: { ...seller, cashlessAdjustPercent: 10 },
      lines: [line({ key: "m", block: "materials", qtyTech: 10 })],
    });
    expect(custom.revenueNet).toBe(1100);
  });

  it("платник ПДВ: 20% лише на матеріали, без подвійного нарахування", () => {
    const seller = defaultSellerSettings("vat_payer");
    const r = buildCanonicalResult({
      module: "t", areaM2: 10, engineVersion: "t@1", seller,
      lines: [
        line({ key: "m", block: "materials", qtyTech: 10 }),
        line({ key: "w", block: "works", qtyTech: 10 }),
      ],
    });
    expect(r.vatTotal).toBe(200);
    expect(r.totalClient).toBe(2200);
    const sumLineVat = r.lines.reduce((s, l) => s + l.vatAmount, 0);
    expect(+sumLineVat.toFixed(2)).toBe(r.vatTotal);
  });

  it("категорії ПДВ вимикаються для неплатника", () => {
    const s = sellerFromLegacy("fop", false);
    expect(s.profile).toBe("fop3");
    expect(s.vatRate).toBe(0);
  });
});

describe("Комерційні коригування", () => {
  it("порядок: складність → знижка → комісія → безготівка → мінімальний чек", () => {
    const a = computeAdjustments(1000, {
      complexityPercent: 10, discountPercent: 10, partnerCommission: 100, minCheck: 0,
    }, 6);
    expect(a.complexity).toBe(100);
    expect(a.discount).toBe(110);
    expect(a.net).toBe(+((1000 + 100 - 110 + 100) * 1.06).toFixed(2));
  });

  it("мінімальний чек добирається, а не множиться", () => {
    const a = computeAdjustments(1000, {
      complexityPercent: 0, discountPercent: 0, partnerCommission: 0, minCheck: 5000,
    });
    expect(a.minCheckTopUp).toBe(4000);
    expect(a.net).toBe(5000);
  });
});

describe("Амортизація", () => {
  it("за замовчуванням у собівартості й поза клієнтською ціною", () => {
    const r = buildCanonicalResult({
      module: "t", areaM2: 10, engineVersion: "t@1", amortCost: 500,
      lines: [line({ key: "m", block: "materials", qtyTech: 10 })],
    });
    expect(r.totalCost).toBe(1100);
    expect(r.revenueNet).toBe(1000);
  });

  it("режим % від робіт не рекурсивний", () => {
    const amount = clientAmortAmount(
      { ...DEFAULT_AMORT_SETTINGS, includeInClientPrice: true, clientMode: "percent_of_works", clientValue: 10 },
      { worksNet: 1000, logisticsNet: 200, netTotal: 1500, areaM2: 100, amortCost: 900 },
    );
    expect(amount).toBe(100);
  });

  it("грн/м² і фіксована сума", () => {
    const base = { worksNet: 0, logisticsNet: 0, netTotal: 0, areaM2: 50, amortCost: 0 };
    expect(clientAmortAmount({ ...DEFAULT_AMORT_SETTINGS, includeInClientPrice: true, clientMode: "per_m2", clientValue: 12 }, base)).toBe(600);
    expect(clientAmortAmount({ ...DEFAULT_AMORT_SETTINGS, includeInClientPrice: true, clientMode: "fixed", clientValue: 777 }, base)).toBe(777);
  });
});

describe("Політика цін", () => {
  it("підтверджений нуль не блокує, відсутня ціна блокує", () => {
    const errors = findBlockingPriceErrors([
      { key: "a", block: "materials", name: "A", qty: 1, sellPerUnit: 0, priceStatus: "confirmed_zero", billingMode: "separate_line" },
      { key: "b", block: "materials", name: "B", qty: 1, sellPerUnit: 0, priceStatus: "missing", billingMode: "separate_line" },
      { key: "c", block: "works", name: "C", qty: 1, sellPerUnit: 0, priceStatus: "missing", billingMode: "internal_only" },
    ]);
    expect(errors.map((e) => e.key)).toEqual(["b"]);
  });
});

describe("Роздільні DTO", () => {
  const canonical = buildCanonicalResult({
    module: "t", areaM2: 10, engineVersion: "t@1", amortCost: 300,
    seller: defaultSellerSettings("vat_payer"),
    lines: [
      line({ key: "m", block: "materials", qtyTech: 10, internalNote: "секрет" }),
      line({ key: "int", block: "works", qtyTech: 1, billingMode: "internal_only" }),
    ],
  });

  it("клієнтський DTO не містить внутрішніх ключів навіть зі значенням null", () => {
    const dto = toClientDTO(canonical);
    expect(hasForbiddenClientKeys(dto)).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain("секрет");
    expect(dto.lines.some((l) => l.key === "int")).toBe(false);
  });

  it("внутрішній DTO містить собівартість і маржу", () => {
    const dto = toInternalDTO(canonical);
    expect(dto.totalCost).toBeGreaterThan(0);
    expect(dto.marginPercent).not.toBeUndefined();
  });
});

describe("Історичні калькулятори на єдиному ядрі", () => {
  it("core собівартість = легасі собівартість (ПВХ)", () => {
    const res = calculatePvc({
      area: 200, perimeter: 60, parapetHeightM: 0.5, parapetWidthM: 0.4, parapetOverlapM: 0.1,
      thickness: "1.5", withGeotextile: true, withDemount: false, withSlope: false, withPrep: true,
      funnels75: 0, funnels110: 2, funnels160: 0, aerators75: 0, aerators110: 2, aerators160: 0,
      opaikaPoints: 3, detailMembraneM2: 0, pvcAngleMeters: 0, pvcClampMeters: 0, dripEdgeMeters: 0,
      withCapping: true, cappingMeters: 0,
      cityDelivery: true, outOfCityKm: 0, withLift: true, haulContainers: 0,
      payment: "cash", withVAT: false, partnerCommission: 0, discountPercent: 0, complexityPercent: 0,
    });
    expect(res.core).toBeTruthy();
    expect(res.core!.totalCost).toBeCloseTo(res.totalCost, 1);
    expect(res.rolls).toBe(Math.ceil(res.membraneM2 / DEFAULT_PVC_COEFFS.fieldRollM2));
    const capping = res.lines.find((l) => l.key === "m_capping");
    expect(capping).toBeTruthy();
    expect(capping!.purchaseQty).toBe(Math.ceil(capping!.qty / DEFAULT_PVC_COEFFS.profileBarLengthM));
  });

  it("утеплення й демонтаж віддають канонічний результат", () => {
    const ins = calculateInsulation({
      area: 100, payment: "cash", withVAT: false, partnerCommission: 0,
      discountPercent: 0, complexityPercent: 0,
    } as never);
    expect(ins.core?.module).toBe("insulation");
    const dem = calculateDemolition({
      area: 100, payment: "cash", withVAT: false, partnerCommission: 0,
      discountPercent: 0, complexityPercent: 0,
    } as never);
    expect(dem.core?.module).toBe("demolition");
  });

  it("внутрішні рядки бригади не потрапляють у клієнтський контур", () => {
    const canonical = coreFromLegacyResult("t", 100, {
      lines: [{ key: "m", block: "materials", name: "M", unit: "шт", qty: 1, pricePerUnit: 100, costPerUnit: 50 }],
      materialsCost: 50, worksCost: 11000, logisticsCost: 0,
    }, {
      payment: "cash", withVAT: false, complexityPercent: 0, discountPercent: 0,
      partnerCommission: 0, minCheck: 0, engineVersion: "t@1",
    });
    expect(canonical.totalCost).toBe(11050);
    expect(toClientDTO(canonical).lines.map((l) => l.key)).toEqual(["m"]);
  });
});

describe("Immutable snapshot", () => {
  it("snapshot@3 заморожує канонічний результат і обидва контури", () => {
    const res = calculateDemolition({
      area: 100, payment: "cash", withVAT: false, partnerCommission: 0,
      discountPercent: 0, complexityPercent: 0,
    } as never);
    const snap = buildEstimateSnapshot({
      module: "demolition", engineVersion: "demolition@core1",
      inputs: { area: 100 }, result: res, prices: { x: { buy: 1, sell: 2 } }, norms: { n: 1 },
    });
    expect(snap.snapshotVersion).toBe("snapshot@3");
    expect(snap.canonical).toBeTruthy();
    expect(snap.clientDTO?.kind).toBe("client");
    expect(snap.internalDTO?.kind).toBe("internal");
    const before = snap.canonical!.totalClient;
    res.core!.totalClient = 1;
    expect(snap.canonical!.totalClient).toBe(before);
  });
});
