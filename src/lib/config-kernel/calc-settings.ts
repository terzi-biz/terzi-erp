/**
 * Control Plane — числові налаштування калькуляторів (kind `calc_settings`).
 * Ключ = модуль (screed | roofing | insulation | demolition). Payload — часткове
 * перевизначення числових полів дефолтів рушія; порожній payload = дефолти рушія
 * (поточна поведінка без змін). Невідомі поля відхиляються.
 */
import { z } from "zod";
import { DEFAULT_SETTINGS } from "@/lib/screed-calc";
import { DEFAULT_ROOFING_COEFFS } from "@/lib/roofing-calc";
import { DEFAULT_INSULATION_COEFFS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_COEFFS } from "@/lib/demolition-calc";

export const CALC_SETTINGS_DEFAULTS = {
  screed: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
  roofing: DEFAULT_ROOFING_COEFFS as unknown as Record<string, unknown>,
  insulation: DEFAULT_INSULATION_COEFFS as unknown as Record<string, unknown>,
  demolition: DEFAULT_DEMOLITION_COEFFS as unknown as Record<string, unknown>,
} as const;

export type CalcSettingsKey = keyof typeof CALC_SETTINGS_DEFAULTS;
export const CALC_SETTINGS_KEYS = Object.keys(CALC_SETTINGS_DEFAULTS) as CalcSettingsKey[];

export function isCalcSettingsKey(k: string): k is CalcSettingsKey {
  return (CALC_SETTINGS_KEYS as string[]).includes(k);
}

/** Числові поля дефолтів, які дозволено перевизначати. */
export function numericFieldsOf(key: CalcSettingsKey): string[] {
  return Object.entries(CALC_SETTINGS_DEFAULTS[key])
    .filter(([, v]) => typeof v === "number")
    .map(([k]) => k);
}

const finite = z.number().finite().min(-1e9).max(1e9);

/** Загальна схема kind: record скінченних чисел (поля перевіряються в guardTransition). */
export const calcSettingsSchema = z.record(z.string().max(64), finite);

export function calcSettingsKeyErrors(key: string, payload: unknown): string[] {
  if (!isCalcSettingsKey(key)) return [`Невідомий калькулятор «${key}»`];
  if (!payload || typeof payload !== "object") return [];
  const allowed = new Set(numericFieldsOf(key));
  return Object.keys(payload).filter((k) => !allowed.has(k)).map((k) => `${k}: поле не підтримується для ${key}`);
}

/** Ефективні значення: дефолти рушія + лише валідні числові перевизначення. */
export function mergeCalcSettings<T extends object>(key: CalcSettingsKey, defaults: T, override: unknown): T {
  if (!override || typeof override !== "object") return defaults;
  const allowed = new Set(numericFieldsOf(key));
  const out: Record<string, unknown> = { ...(defaults as object) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (allowed.has(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out as T;
}

/** Лише поля, що відрізняються від дефолтів (що зберігаємо). */
export function diffFromDefaults(key: CalcSettingsKey, values: Record<string, unknown>): Record<string, number> {
  const d = CALC_SETTINGS_DEFAULTS[key];
  const out: Record<string, number> = {};
  for (const f of numericFieldsOf(key)) {
    const v = values[f];
    if (typeof v === "number" && Number.isFinite(v) && v !== d[f]) out[f] = v;
  }
  return out;
}
