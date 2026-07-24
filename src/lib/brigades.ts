export type BrigadeModule = "screed" | "roofing";

export interface Brigade {
  key: string;
  label: string;
  module: BrigadeModule;
  color: string;   // pill / cell tint (light)
  dot: string;     // solid dot color
}

export const BRIGADES: Brigade[] = [
  { key: "screed_lesha", label: "Льоша · стяжка", module: "screed",  color: "bg-blue-50 border-blue-200 text-blue-800",       dot: "bg-blue-500" },
  { key: "screed_vitya", label: "Вітя · стяжка",  module: "screed",  color: "bg-sky-50 border-sky-200 text-sky-800",          dot: "bg-sky-500" },
  { key: "roofing_1",    label: "Покрівля №1",    module: "roofing", color: "bg-orange-50 border-orange-200 text-orange-800", dot: "bg-orange-500" },
  { key: "roofing_2",    label: "Покрівля №2",    module: "roofing", color: "bg-amber-50 border-amber-200 text-amber-800",    dot: "bg-amber-500" },
  { key: "roofing_3",    label: "Покрівля №3",    module: "roofing", color: "bg-emerald-50 border-emerald-200 text-emerald-800", dot: "bg-emerald-500" },
  { key: "roofing_4",    label: "Покрівля №4",    module: "roofing", color: "bg-teal-50 border-teal-200 text-teal-800",       dot: "bg-teal-500" },
];

export function findBrigade(key: string): Brigade | undefined {
  return BRIGADES.find((b) => b.key === key);
}
