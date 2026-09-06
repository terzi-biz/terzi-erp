/**
 * Офіційний курс НБУ на дату. Використовується для переведення рекламних витрат
 * у гривню (єдина валюта обліку). Курс детермінований: офіційний, на дату витрати.
 * Оригінальна сума й валюта зберігаються окремо — для довідкового показу.
 */

const cache = new Map<string, number>();

const API = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange";

/** Курс валюти до гривні на дату YYYY-MM-DD. null — якщо НБУ не повернув значення. */
export async function nbuRate(currency: string, date: string): Promise<number | null> {
  const code = currency.toUpperCase();
  if (code === "UAH") return 1;
  const key = `${code}:${date}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const d = date.replace(/-/g, "");
  try {
    const res = await fetch(`${API}?valcode=${encodeURIComponent(code)}&date=${d}&json`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ rate?: number }>;
    const rate = Number(json?.[0]?.rate ?? 0);
    if (!rate || !Number.isFinite(rate)) return null;
    cache.set(key, rate);
    return rate;
  } catch {
    return null;
  }
}

export type Converted = { uah: number; original: number; currency: string; rate: number | null };

/** Переводить суму в гривню за курсом НБУ. Без курсу — сума лишається як є, rate = null. */
export async function toUah(amount: number, currency: string, date: string): Promise<Converted> {
  const code = (currency || "UAH").toUpperCase();
  const rate = await nbuRate(code, date);
  return {
    uah: rate != null ? Math.round(amount * rate * 100) / 100 : amount,
    original: amount,
    currency: code,
    rate,
  };
}
