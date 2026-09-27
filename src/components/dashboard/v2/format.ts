/** Форматування чисел для дашборду v2 (uk-UA, табличні цифри задаються стилем). */
const nf0 = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const num = (n: number) => nf0.format(Math.round(n));
export const money = (n: number) => `${nf0.format(Math.round(n))} ₴`;

/** 4,86 млн ₴ · 162 тис ₴ · 818 ₴ */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${nf2.format(n / 1_000_000)} млн ₴`;
  if (a >= 10_000) return `${nf0.format(Math.round(n / 1000))} тис ₴`;
  return money(n);
}

/** Мільйони для осей графіка: 4,9 */
export const mln = (n: number) => nf1.format(n / 1_000_000);

export function pct(n: number, digits?: number): string {
  const d = digits ?? (Math.abs(n) >= 10 ? 0 : 1);
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)}%`;
}

export const delta = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

export const MONTHS_SHORT = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
export const MONTHS_NOM = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
export const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
