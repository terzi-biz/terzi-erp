/** Спільні схеми серверної пагінації (клієнт-безпечний модуль). */
import { z } from "zod";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export const pageQuerySchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  page_size: z.number().int().refine((v) => (PAGE_SIZES as readonly number[]).includes(v), "page_size: 25/50/100")
    .default(DEFAULT_PAGE_SIZE),
  q: z.string().max(120).default(""),
  status: z.string().max(40).optional().nullable(),
  from: z.string().max(10).optional().nullable(),
  to: z.string().max(10).optional().nullable(),
  sort: z.string().max(40).optional().nullable(),
  desc: z.boolean().default(true),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Діапазон рядків PostgREST для сторінки. */
export function pageRange(p: { page: number; page_size: number }): [number, number] {
  const from = (p.page - 1) * p.page_size;
  return [from, from + p.page_size - 1];
}

/** Безпечний пошуковий термін для ilike (без спецсимволів PostgREST). */
export function likeTerm(q: string): string {
  return q.replace(/[,()\\%*]/g, " ").trim().slice(0, 60);
}

/** Тільки цифри — для пошуку по нормалізованому телефону. */
export function digits(q: string): string {
  return q.replace(/\D/g, "");
}
