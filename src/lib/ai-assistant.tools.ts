/** Чисте планування інструментів TZI AI за правами (без побічних ефектів). */
export const AI_MODEL = "openai/gpt-6-astra";
export type AiToolKey = "overview" | "integrations" | "finance";

export function planTools(p: { reports: boolean; integrations: boolean; finance: boolean }): AiToolKey[] {
  const tools: AiToolKey[] = [];
  if (p.reports) tools.push("overview");
  if (p.integrations || p.reports) tools.push("integrations");
  // Фінанси — лише для уповноважених; звіти самі по собі не відкривають фінанси.
  if (p.finance) tools.push("finance");
  return tools;
}
