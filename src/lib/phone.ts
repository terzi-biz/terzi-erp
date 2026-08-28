/**
 * Єдина канонічна нормалізація телефонів у E.164 (клієнт + сервер).
 *
 * Правила:
 * - вихідний номер ніколи не змінюється; нормалізований пишеться окремо (phone_e164);
 * - для невалідного номера значення не вигадується — повертається validation status;
 * - за замовчуванням країна Україна (+380), міжнародні номери приймаються лише
 *   у явному вигляді (з «+» або «00»).
 */

export type PhoneStatus =
  | "valid"
  | "empty"
  | "too_short"
  | "too_long"
  | "unknown_country"
  | "invalid";

export type NormalizedPhone = {
  /** Вихідне значення без змін (trim). */
  raw: string | null;
  /** E.164 (+380…) або null, якщо номер невалідний. */
  e164: string | null;
  /** Лише цифри — сумісність із наявним полем phone_norm. */
  digits: string | null;
  valid: boolean;
  status: PhoneStatus;
  /** Людське пояснення для UI/журналу. */
  message: string | null;
};

const STATUS_MESSAGE: Record<PhoneStatus, string | null> = {
  valid: null,
  empty: "Номер не вказано",
  too_short: "Замало цифр для номера телефону",
  too_long: "Забагато цифр для номера телефону",
  unknown_country: "Не визначено країну: вкажіть номер у форматі +XXXXXXXXXXX",
  invalid: "Некоректний номер телефону",
};

function fail(raw: string | null, status: PhoneStatus, digits: string | null = null): NormalizedPhone {
  return { raw, e164: null, digits, valid: false, status, message: STATUS_MESSAGE[status] };
}

/** Канонічна нормалізація. Єдина точка правди для Binotel, keyCRM, lead intake і CRM. */
export function normalizePhone(input: unknown): NormalizedPhone {
  const raw = input == null ? null : String(input).trim();
  if (!raw) return fail(raw && raw.length ? raw : null, "empty");

  const international = /^\+/.test(raw) || /^00\d/.test(raw);
  const digits = raw.replace(/\D/g, "").replace(/^00/, international ? "" : "00");
  if (!digits) return fail(raw, "invalid");

  // Український номер у локальних формах.
  if (!international) {
    if (digits.length === 9) return ok(raw, `380${digits}`);
    if (digits.length === 10 && digits.startsWith("0")) return ok(raw, `38${digits}`);
    if (digits.length === 11 && digits.startsWith("80")) return ok(raw, `3${digits}`);
    if (digits.length === 12 && digits.startsWith("380")) return ok(raw, digits);
    if (digits.length < 9) return fail(raw, "too_short", digits);
    if (digits.length > 15) return fail(raw, "too_long", digits);
    // 11 або 13–15 цифр без «+»: країна невідома, вигадувати код не можна.
    return fail(raw, "unknown_country", digits);
  }

  if (digits.length < 8) return fail(raw, "too_short", digits);
  if (digits.length > 15) return fail(raw, "too_long", digits);
  return ok(raw, digits);
}

function ok(raw: string, digits: string): NormalizedPhone {
  return { raw, e164: `+${digits}`, digits, valid: true, status: "valid", message: null };
}

/** Короткий доступ: E.164 або null. */
export function toE164(input: unknown): string | null {
  return normalizePhone(input).e164;
}

/** Лише цифри валідного номера — сумісність із полем phone_norm. */
export function phoneDigits(input: unknown): string | null {
  const n = normalizePhone(input);
  return n.valid ? n.digits : null;
}

/** Порівняння двох номерів. Невалідні номери ніколи не збігаються. */
export function samePhone(a: unknown, b: unknown): boolean {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  return Boolean(x.valid && y.valid && x.e164 === y.e164);
}

/** Маскування для журналів і UI: +38050***4567. */
export function maskPhone(input: unknown): string | null {
  const n = normalizePhone(input);
  const value = n.e164 ?? (input == null ? null : String(input));
  if (!value) return null;
  if (value.length <= 6) return "***";
  return `${value.slice(0, value.length - 7)}***${value.slice(-3)}`;
}
