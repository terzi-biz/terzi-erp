/**
 * Межі бізнес-періодів у таймзоні Europe/Kyiv.
 * Усі KPI рахуються за українським календарним днем, а не за UTC.
 */

export const KYIV_TZ = "Europe/Kyiv";

/** Зсув Києва відносно UTC (у хвилинах) на конкретний момент часу. */
export function kyivOffsetMinutes(at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p['year']), Number(p['month']) - 1, Number(p['day']),
    Number(p['hour']) % 24, Number(p['minute']), Number(p['second']),
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** ISO-мітка початку (00:00) або кінця (23:59:59.999) київського дня. */
export function kyivDayBoundary(date: string, end = false): string {
  const naive = new Date(`${date}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  const off = kyivOffsetMinutes(naive);
  return new Date(naive.getTime() - off * 60000).toISOString();
}

/** Період [from 00:00, to 23:59:59.999] київського часу у вигляді ISO-міток UTC. */
export function kyivRange(from: string, to: string): { from: string; to: string } {
  return { from: kyivDayBoundary(from), to: kyivDayBoundary(to, true) };
}

/** Поточна київська дата у форматі YYYY-MM-DD. */
export function kyivToday(at: Date = new Date()): string {
  const off = kyivOffsetMinutes(at);
  return new Date(at.getTime() + off * 60000).toISOString().slice(0, 10);
}
