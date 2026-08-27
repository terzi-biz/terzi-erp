/**
 * Загальне регулювання цільової маржі для калькуляторів напрямків
 * (ПВХ мембрана, руберойд, утеплення, демонтаж, гідроізоляція).
 *
 * Логіка детермінована:
 *   Ціна = Собівартість / (1 − маржа/100)
 * Різниця між поточною і цільовою ціною розподіляється по позиціях з вагами:
 * роботи дорожчають найбільше, логістика менше, матеріали найменше
 * (матеріали ближчі до собівартості й перевіряються клієнтом).
 *
 * Розрахункові кількості й собівартість НЕ змінюються — тільки ціни продажу.
 */

export const TARGET_MARGIN_ENGINE_VERSION = "target-margin@1.0.0";

/** Ваги розподілу націнки по блоках. */
export const MARGIN_BLOCK_WEIGHTS: Record<string, number> = {
  works: 1,
  services: 1,
  logistics: 0.5,
  materials: 0.3,
};

export interface MarginLine {
  block: string;
  qty: number;
  sum: number;
  cost: number;
  pricePerUnit: number;
}

export interface MarginResult<L extends MarginLine = MarginLine> {
  lines: L[];
  materialsSell: number;
  worksSell: number;
  logisticsSell: number;
  subtotalSell: number;
  totalClient: number;
  pricePerM2: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ціна, за якої досягається задана маржа від виручки. */
export function priceForMargin(totalCost: number, marginPercent: number): number {
  const m = Number(marginPercent) / 100;
  if (!(totalCost > 0) || !(m > 0) || m >= 0.95) return totalCost;
  return r2(totalCost / (1 - m));
}

export function applyTargetMargin<L extends MarginLine, T extends MarginResult<L>>(
  res: T,
  targetMargin?: number | null,
): T {
  const m = Number(targetMargin);
  if (!Number.isFinite(m) || m <= 0 || m >= 95) return res;
  if (!(res.totalCost > 0) || !(res.lines?.length > 0)) return res;

  // Маржа рахується від ціни без ПДВ — податок не є виручкою компанії.
  const oldVat = Number((res as { vatAdjustment?: number }).vatAdjustment) || 0;
  const target = priceForMargin(res.totalCost, m);
  const delta = r2(target - (res.totalClient - oldVat));
  if (Math.abs(delta) < 0.5) return res;


  const weightOf = (l: L) => (l.sum > 0 ? l.sum * (MARGIN_BLOCK_WEIGHTS[l.block] ?? 0.5) : 0);
  const base = res.lines.reduce((a, l) => a + weightOf(l), 0);
  if (!(base > 0)) return res;

  const warnings = [...res.warnings];
  let clamped = false;
  const lines = res.lines.map((l) => {
    const share = weightOf(l) / base;
    let sum = l.sum + delta * share;
    // Ніколи не продаємо позицію нижче її собівартості.
    if (sum < l.cost) {
      sum = l.cost;
      clamped = true;
    }
    sum = r2(sum);
    return {
      ...l,
      sum,
      pricePerUnit: l.qty > 0 ? r2(sum / l.qty) : l.pricePerUnit,
    };
  });

  const sumBy = (b: string) => r2(lines.filter((l) => l.block === b).reduce((a, l) => a + l.sum, 0));
  const materialsSell = sumBy("materials");
  const worksSell = sumBy("works");
  const logisticsSell = sumBy("logistics");
  const subtotalSell = r2(lines.reduce((a, l) => a + l.sum, 0));
  // ПДВ нараховується на матеріали, тому перераховуємо його від нової вартості матеріалів.
  const newVat =
    oldVat > 0 && res.materialsSell > 0 ? r2(oldVat * (materialsSell / res.materialsSell)) : oldVat;
  // Надбавки/знижки/комісії (різниця між підсумком і ціною клієнта) зберігаються.
  const offset = r2(res.totalClient - res.subtotalSell - oldVat);
  const totalClient = r2(subtotalSell + offset + newVat);
  const scale = res.totalClient > 0 ? totalClient / res.totalClient : 1;
  const grossProfit = r2(totalClient - newVat - res.totalCost);
  const marginPercent = totalClient - newVat > 0 ? r2((grossProfit / (totalClient - newVat)) * 100) : 0;


  if (clamped) {
    warnings.push(
      "Деякі позиції обмежені собівартістю — фактична маржа може відрізнятись від цільової.",
    );
  }

  return {
    ...res,
    lines,
    materialsSell,
    worksSell,
    logisticsSell,
    subtotalSell,
    ...(oldVat > 0 ? { vatAdjustment: newVat } : {}),
    totalClient,
    pricePerM2: r2(res.pricePerM2 * scale),
    grossProfit,
    marginPercent,
    warnings,
  };
}

