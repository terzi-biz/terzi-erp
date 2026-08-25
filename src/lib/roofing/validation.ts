/**
 * Валідація вхідних даних наплавної покрівлі.
 * Помилки (blocking) забороняють збереження/експорт.
 * Попередження (warning) вимагають свідомого підтвердження користувачем.
 */
import type { GeometrySummary } from "./geometry";
import { EXPECTED_SURFACES } from "./geometry";
import type { NodesSummary, RoofNode } from "./nodes";
import type { RoofingNorms } from "./norms";
import type { RoofingCalcMode } from "./modes";
import type { RollSpec } from "./cutting";

export type IssueLevel = "error" | "warning";

export interface RoofingIssue {
  level: IssueLevel;
  code: string;
  message: string;
}

export interface ValidateInput {
  geometry: GeometrySummary;
  nodes: NodesSummary;
  norms: RoofingNorms;
  mode: RoofingCalcMode;
  rolls: RollSpec[];
  /** Чи застосовано коефіцієнт швидкого режиму поверх точного розкрою. */
  quickCoefOnPrecise?: boolean;
  /** Площа, яку ґрунтують, м². */
  primedAreaM2?: number;
  /** Дублікати робіт/матеріалів за ключами. */
  duplicateKeys?: string[];
}

export function validateRoofing(input: ValidateInput): RoofingIssue[] {
  const out: RoofingIssue[] = [];
  const add = (level: IssueLevel, code: string, message: string) => out.push({ level, code, message });

  const { geometry, nodes, norms, rolls } = input;

  if (geometry.totalAreaM2 <= 0) {
    add("error", "geometry.empty", "Не задана площа покрівлі — додайте хоча б одну поверхню.");
  }

  const expected = EXPECTED_SURFACES[geometry.kind];
  if (expected > 0 && geometry.surfaces.length !== expected) {
    add(
      "warning",
      "geometry.surface_count",
      `Тип покрівлі «${geometry.kind}» зазвичай має ${expected} поверхонь, задано ${geometry.surfaces.length}.`,
    );
  }

  for (const s of geometry.surfaces) {
    if (s.shape !== "manual" && (s.lengthM <= 0 || s.widthM <= 0)) {
      add("error", "surface.size", `Поверхня «${s.name}»: не задані розміри.`);
    }
    if (s.shape === "manual" && !(s.manualAreaM2 && s.manualAreaM2 > 0)) {
      add("error", "surface.manual_area", `Поверхня «${s.name}»: не задана ручна площа.`);
    }
  }

  if (geometry.maxSlopeDeg > 25) {
    add("warning", "geometry.slope", `Кут ската ${geometry.maxSlopeDeg}° — наплавлення потребує додаткової механічної фіксації.`);
  }

  for (const roll of rolls) {
    if (roll.widthM <= 0 || roll.lengthM <= 0) {
      add("error", "roll.size", `Матеріал «${roll.name}»: не задані розміри рулону.`);
      continue;
    }
    if (norms.sideOverlapM >= roll.widthM) {
      add("error", "roll.overlap", `Боковий нахлист ${norms.sideOverlapM} м ≥ ширини рулону «${roll.name}» (${roll.widthM} м).`);
    }
    if (norms.endOverlapM >= roll.lengthM) {
      add("error", "roll.end_overlap", `Торцевий нахлист ${norms.endOverlapM} м ≥ довжини рулону «${roll.name}».`);
    }
  }

  if (input.mode === "precise" && input.quickCoefOnPrecise) {
    add("error", "mode.double_reserve", "Подвійний запас: коефіцієнт швидкого режиму застосовано поверх точного розкрою.");
  }

  const dup = input.duplicateKeys ?? [];
  if (dup.length) {
    add("error", "lines.duplicate", `Задвоєні позиції у кошторисі: ${dup.join(", ")}.`);
  }

  const seenSegments = new Map<string, RoofNode>();
  for (const n of nodes.nodes) {
    if (n.lengthM <= 0) {
      add("warning", "node.length", `Вузол «${n.name}»: нульова довжина.`);
    }
    const key = n.name.trim().toLowerCase();
    if (key && seenSegments.has(key)) {
      add("error", "node.overlap", `Ділянка «${n.name}» описана двома типами вузлів — одна ділянка = один тип.`);
    } else if (key) {
      seenSegments.set(key, n);
    }
    if ((n.type === "parapet" || n.type === "abutment") && !(n.heightM || n.heightStartM)) {
      add("warning", "node.height", `Вузол «${n.name}»: не задана висота заведення.`);
    }
  }

  if (input.primedAreaM2 != null && input.primedAreaM2 > geometry.totalAreaM2 + nodes.verticalAreaM2) {
    add("warning", "primer.area", "Площа ґрунтування більша за загальну площу покрівлі та вузлів.");
  }

  return out;
}

export function hasBlockingIssues(issues: readonly RoofingIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function issuesText(issues: readonly RoofingIssue[], level: IssueLevel): string[] {
  return issues.filter((i) => i.level === level).map((i) => i.message);
}
