export type BrigadeModule = "screed" | "roofing";

export interface Brigade {
  key: string;
  label: string;
  module: BrigadeModule;
  color: string;
}

export const BRIGADES: Brigade[] = [
  { key: "screed_lesha", label: "Льоша (стяжка)", module: "screed", color: "bg-blue-500/15 border-blue-500/40 text-blue-700" },
  { key: "screed_vitya", label: "Вітя (стяжка)",  module: "screed", color: "bg-sky-500/15 border-sky-500/40 text-sky-700" },
  { key: "roofing_1",    label: "Покрівля №1",    module: "roofing", color: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700" },
  { key: "roofing_2",    label: "Покрівля №2",    module: "roofing", color: "bg-teal-500/15 border-teal-500/40 text-teal-700" },
  { key: "roofing_3",    label: "Покрівля №3",    module: "roofing", color: "bg-lime-600/15 border-lime-600/40 text-lime-700" },
  { key: "roofing_4",    label: "Покрівля №4",    module: "roofing", color: "bg-amber-600/15 border-amber-600/40 text-amber-800" },
];

export function findBrigade(key: string): Brigade | undefined {
  return BRIGADES.find((b) => b.key === key);
}
