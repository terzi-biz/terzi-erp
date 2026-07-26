/**
 * Централізовані версії розрахункових двигунів.
 * Змінюємо рядок при будь-якому коригуванні формул/прайсів за замовчуванням,
 * щоб історичні кошториси зберегли слід, яким саме двигуном були пораховані.
 */
export const ENGINE_VERSIONS = {
  screed: "screed@2026.07.26",
  roofing: "roofing@2026.07.26",
  insulation: "insulation@2026.07.26",
  demolition: "demolition@2026.07.26",
} as const;

export type EngineModule = keyof typeof ENGINE_VERSIONS;
