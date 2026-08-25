/**
 * Міграція старого вводу (`RoofingInput` з area/perimeter) у нову геометрію.
 * Старий кошторис = «плоска покрівля + швидкий режим», без втрати даних.
 */
import type { RoofSurface } from "./geometry";
import { defaultSurfaces } from "./geometry";
import type { RoofNode } from "./nodes";
import type { RoofingCalcMode } from "./modes";

export interface LegacyRoofingShape {
  area?: number;
  perimeter?: number;
  parapetHeightCm?: number;
  parapetTopFoldM?: number;
}

export interface MigratedGeometry {
  kind: "flat";
  mode: RoofingCalcMode;
  surfaces: RoofSurface[];
  nodes: RoofNode[];
}

export function migrateLegacyGeometry(input: LegacyRoofingShape): MigratedGeometry {
  const area = Math.max(0, input.area ?? 0);
  const side = area > 0 ? +Math.sqrt(area).toFixed(3) : 0;
  const surfaces: RoofSurface[] = area > 0
    ? [{ id: "s1", name: "Покрівля", shape: "manual", lengthM: side, widthM: side, manualAreaM2: area, layDirection: "along" }]
    : defaultSurfaces("flat");

  const nodes: RoofNode[] = [];
  const perimeter = Math.max(0, input.perimeter ?? 0);
  const h = Math.max(0, input.parapetHeightCm ?? 0) / 100;
  if (perimeter > 0 && (h > 0 || (input.parapetTopFoldM ?? 0) > 0)) {
    nodes.push({
      id: "n1",
      type: "parapet",
      name: "Парапет по периметру",
      lengthM: perimeter,
      heightM: h,
      topFoldM: Math.max(0, input.parapetTopFoldM ?? 0),
      layers: 1,
    });
  }

  return { kind: "flat", mode: "quick", surfaces, nodes };
}
