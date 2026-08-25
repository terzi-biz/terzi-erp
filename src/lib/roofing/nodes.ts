/**
 * Краї та вузли покрівлі. Правило: одна ділянка периметра = один тип вузла.
 * Жоден вузол не додається автоматично — все вводить користувач.
 */

export type RoofNodeType =
  | "drip"        // капельник
  | "parapet"     // парапет
  | "abutment"    // примикання до стіни
  | "ridge"       // коник
  | "valley"      // єндова
  | "adjacent"    // сусідній скат
  | "expansion"   // деформаційний шов
  | "custom";     // свій вузол

export const NODE_LABELS: Record<RoofNodeType, string> = {
  drip: "Капельник",
  parapet: "Парапет",
  abutment: "Примикання до стіни",
  ridge: "Коник",
  valley: "Єндова",
  adjacent: "Сусідній скат",
  expansion: "Деформаційний шов",
  custom: "Свій вузол",
};

export interface RoofNode {
  id: string;
  type: RoofNodeType;
  name: string;
  /** Довжина ділянки, п.м. */
  lengthM: number;
  /** Висота заведення для вертикальних вузлів (парапет/примикання), м. Для змінної — середня. */
  heightM?: number;
  /** Змінна висота: початок/кінець, м. Якщо задані — heightM = (h1+h2)/2. */
  heightStartM?: number;
  heightEndM?: number;
  /** Додаткове заведення на горизонтальну поличку парапету, м. */
  topFoldM?: number;
  /** Скільки шарів гідроізоляції заводиться на цей вузол. */
  layers?: number;
  /** Варіант виконання (текст із довідника вузлів). */
  variant?: string;
  /** Чи потрібні окремі будівельні роботи по вузлу (штукатурка парапету тощо). */
  withMasonry?: boolean;
}

/** Ефективна висота вузла: середня, якщо задано початок/кінець. */
export function nodeHeight(n: RoofNode): number {
  if (n.heightStartM != null && n.heightEndM != null) {
    return +(((Math.max(0, n.heightStartM) + Math.max(0, n.heightEndM)) / 2)).toFixed(3);
  }
  return Math.max(0, n.heightM ?? 0);
}

/** Вертикальна (додаткова) площа вузла, м² — без запасу на нахлисти. */
export function nodeArea(n: RoofNode): number {
  const h = nodeHeight(n) + Math.max(0, n.topFoldM ?? 0);
  if (h <= 0) return 0;
  return +(Math.max(0, n.lengthM) * h * Math.max(1, n.layers ?? 1)).toFixed(3);
}

export interface NodesSummary {
  nodes: RoofNode[];
  /** Сума вертикальних площ усіх вузлів, м². */
  verticalAreaM2: number;
  /** Загальна довжина вузлів за типом, п.м. */
  lengthByType: Record<RoofNodeType, number>;
  totalLengthM: number;
}

const ZERO_BY_TYPE = (): Record<RoofNodeType, number> => ({
  drip: 0, parapet: 0, abutment: 0, ridge: 0, valley: 0, adjacent: 0, expansion: 0, custom: 0,
});

export function summarizeNodes(nodes: RoofNode[]): NodesSummary {
  const lengthByType = ZERO_BY_TYPE();
  let vertical = 0;
  let total = 0;
  for (const n of nodes) {
    const len = Math.max(0, n.lengthM);
    lengthByType[n.type] += len;
    total += len;
    vertical += nodeArea(n);
  }
  return {
    nodes,
    verticalAreaM2: +vertical.toFixed(3),
    lengthByType,
    totalLengthM: +total.toFixed(3),
  };
}

/** Проходки / точкові елементи — вводяться вручну, за замовчуванням 0. */
export interface RoofPenetrations {
  funnels: number;
  parapetFunnels: number;
  aerators: number;
  pipes: number;
  customPoints: number;
}

export const EMPTY_PENETRATIONS: RoofPenetrations = {
  funnels: 0, parapetFunnels: 0, aerators: 0, pipes: 0, customPoints: 0,
};

export function penetrationCount(p: RoofPenetrations): number {
  return p.funnels + p.parapetFunnels + p.aerators + p.pipes + p.customPoints;
}
