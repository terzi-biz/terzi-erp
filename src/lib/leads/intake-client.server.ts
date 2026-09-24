/**
 * Серверний клієнт для сайтів/лендінгів TERZI: підпис і відправка в канонічний
 * POST /api/public/leads/intake. Секрет лише на сервері сайту — ніколи в браузері.
 * URL передається явно (без хардкоду домену).
 */
import { createHmac } from "node:crypto";
import type { IntakePayload } from "./intake.server";

export function signIntakeBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

export async function postLeadToTerzi(intakeUrl: string, payload: IntakePayload, secret: string) {
  const body = JSON.stringify(payload);
  const res = await fetch(intakeUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-terzi-signature": signIntakeBody(body, secret) },
    body,
  });
  return { httpStatus: res.status, body: (await res.json().catch(() => null)) as unknown };
}
