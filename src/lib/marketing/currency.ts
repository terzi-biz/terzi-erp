/** Довідковий підпис до гривневої суми: «(≈ $225)». Облік ведеться лише в ₴. */

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", PLN: "zł" };

export function currencyNote(items?: Array<{ currency: string; amount: number }> | null): string | null {
  if (!items?.length) return null;
  const parts = items
    .filter((i) => Number(i.amount) > 0)
    .map((i) => {
      const v = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(Number(i.amount)));
      const s = SYMBOL[i.currency.toUpperCase()];
      return s ? `${s}${v}` : `${v} ${i.currency}`;
    });
  return parts.length ? `≈ ${parts.join(" · ")}` : null;
}
