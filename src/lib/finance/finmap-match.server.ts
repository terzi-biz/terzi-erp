/**
 * Автозв'язування Finmap ↔ ERP: проєкти → замовлення/клієнти,
 * контрагенти → клієнти, операції → замовлення й клієнти.
 *
 * Правила:
 *  - зіставлення детерміноване (нормалізація тексту + перекриття токенів + номер будинку);
 *  - автоматично зв'язуємо тільки впевнені збіги (score ≥ AUTO_LINK), решта — needs_review;
 *  - ручні зв'язки (match_source='manual') ніколи не перетираються;
 *  - жодних вигаданих сум: зв'язок лише переносить order_id/client_id.
 */

type Db = any;

export const AUTO_LINK = 82;
export const REVIEW_MIN = 55;

const TRANSLIT: Record<string, string> = { ё: "е", є: "е", э: "е", ї: "і", и: "і", ы: "і", й: "і", ъ: "", ь: "", "'": "", "’": "" };

export function normalizeName(raw: string | null | undefined): string {
  let s = String(raw ?? "").toLowerCase();
  s = s.replace(/[ёєэїиыйъь'’]/g, (c) => TRANSLIT[c] ?? c);
  s = s.replace(/[^a-zа-яіє0-9]+/gi, " ");
  return s.replace(/\s+/g, " ").trim();
}

const STOP = new Set(["дом", "дім", "обект", "объект", "об", "ул", "вул", "улица", "вулиця", "замовлення", "заказ", "кв", "буд", "жк", "терзи", "terzi"]);

export function tokensOf(raw: string | null | undefined): { words: string[]; numbers: string[] } {
  const n = normalizeName(raw);
  const parts = n.split(" ").filter(Boolean);
  return {
    words: parts.filter((p) => !/^\d+$/.test(p) && p.length >= 3 && !STOP.has(p)),
    numbers: parts.filter((p) => /^\d+$/.test(p)),
  };
}

/** 0..100. Повна рівність — 100; інакше перекриття значущих токенів + збіг номерів. */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const ta = tokensOf(a), tb = tokensOf(b);
  if (!ta.words.length || !tb.words.length) return 0;
  const setB = new Set(tb.words);
  const hit = ta.words.filter((w) => setB.has(w) || tb.words.some((x) => x.startsWith(w) || w.startsWith(x))).length;
  const base = (hit / Math.min(ta.words.length, tb.words.length)) * 100;
  if (base === 0) return 0;
  const numsA = new Set(ta.numbers), numsB = new Set(tb.numbers);
  if (numsA.size && numsB.size) {
    const same = [...numsA].some((x) => numsB.has(x));
    return Math.min(100, Math.round(same ? base + 10 : base - 30));
  }
  return Math.round(base * 0.9);
}

export type Candidate = { id: string; label: string; score: number };

function best(candidates: Candidate[]): { top: Candidate | null; confident: boolean } {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0] ?? null;
  const second = sorted[1]?.score ?? 0;
  return { top, confident: !!top && top.score >= AUTO_LINK && top.score - second >= 8 };
}

async function upsertReview(db: Db, kind: string, finmapId: string, name: string, entity: string, cand: Candidate | null, status: string) {
  await db.from("finmap_entity_mappings").upsert(
    {
      finmap_kind: kind, finmap_id: finmapId, finmap_name: name,
      erp_entity: entity, erp_id: cand?.id ?? null, status,
      confidence: cand?.score ?? null,
    },
    { onConflict: "finmap_kind,finmap_id" },
  );
}

export type MatchReport = {
  entity: "counterparties" | "projects" | "transactions";
  linked: number;
  review: number;
  skipped: number;
};

/** Контрагенти Finmap (дебітори) → клієнти ERP за назвою та телефоном. */
export async function matchCounterparties(db: Db): Promise<MatchReport> {
  const [{ data: cps }, { data: clients }] = await Promise.all([
    db.from("finance_counterparties").select("id,finmap_id,finmap_kind,name,phone,client_id,match_source").is("client_id", null),
    db.from("clients").select("id,name,phone").limit(5000),
  ]);
  const list = (clients ?? []) as any[];
  const byPhone = new Map<string, any>();
  for (const c of list) { const p = String(c.phone ?? "").replace(/\D/g, "").slice(-9); if (p.length === 9) byPhone.set(p, c); }

  let linked = 0, review = 0, skipped = 0;
  for (const cp of ((cps ?? []) as any[])) {
    if (cp.match_source === "manual") { skipped++; continue; }
    if (!["debitor", "client"].includes(cp.finmap_kind)) { skipped++; continue; }

    const phone = String(cp.phone ?? "").replace(/\D/g, "").slice(-9);
    const byPhoneHit = phone.length === 9 ? byPhone.get(phone) : null;
    let chosen: Candidate | null = byPhoneHit ? { id: byPhoneHit.id, label: byPhoneHit.name, score: 100 } : null;
    let confident = !!chosen;

    if (!chosen) {
      const cands = list
        .map((c) => ({ id: c.id, label: c.name as string, score: similarity(cp.name, c.name) }))
        .filter((c) => c.score >= REVIEW_MIN);
      const r = best(cands);
      chosen = r.top; confident = r.confident;
    }

    if (chosen && confident) {
      await db.from("finance_counterparties")
        .update({ client_id: chosen.id, match_score: chosen.score, match_source: "auto" }).eq("id", cp.id);
      await upsertReview(db, cp.finmap_kind, cp.finmap_id, cp.name, "client", chosen, "matched");
      linked++;
    } else if (chosen) {
      await upsertReview(db, cp.finmap_kind, cp.finmap_id, cp.name, "client", chosen, "needs_review");
      review++;
    } else skipped++;
  }
  return { entity: "counterparties", linked, review, skipped };
}

/** Проєкти Finmap → замовлення ERP (за номером, назвою, адресою) або клієнт. */
export async function matchProjects(db: Db): Promise<MatchReport> {
  const [{ data: projects }, { data: orders }, { data: clients }] = await Promise.all([
    db.from("finance_projects").select("id,finmap_id,name,order_id,client_id,match_source"),
    db.from("orders").select("id,number,name,address,client_id,client:client_id(name)").limit(5000),
    db.from("clients").select("id,name").limit(5000),
  ]);
  const ords = (orders ?? []) as any[];
  const cls = (clients ?? []) as any[];

  let linked = 0, review = 0, skipped = 0;
  for (const p of ((projects ?? []) as any[])) {
    if (p.match_source === "manual" || (p.order_id && p.client_id)) { skipped++; continue; }

    const cands: Candidate[] = [];
    for (const o of ords) {
      const s = Math.max(
        similarity(p.name, o.address),
        similarity(p.name, o.name),
        o.number && normalizeName(p.name).includes(normalizeName(o.number)) ? 100 : 0,
        similarity(p.name, o.client?.name) - 10,
      );
      if (s >= REVIEW_MIN) cands.push({ id: o.id, label: o.number ?? o.name, score: s });
    }
    const r = best(cands);

    if (r.top && r.confident) {
      const order = ords.find((o) => o.id === r.top!.id);
      await db.from("finance_projects").update({
        order_id: r.top.id, client_id: order?.client_id ?? p.client_id ?? null,
        match_score: r.top.score, match_source: "auto",
      }).eq("id", p.id);
      await upsertReview(db, "project", p.finmap_id, p.name, "order", r.top, "matched");
      linked++;
      continue;
    }

    // Замовлення не знайдено — пробуємо хоча б клієнта, щоб операції не залишались «нічиїми».
    const clientCands = cls
      .map((c) => ({ id: c.id, label: c.name as string, score: similarity(p.name, c.name) }))
      .filter((c) => c.score >= REVIEW_MIN);
    const rc = best(clientCands);
    if (rc.top && rc.confident) {
      // Якщо у клієнта рівно одне замовлення — зв'язок однозначний, тому переносимо і його.
      const clientOrders = ords.filter((o) => o.client_id === rc.top!.id);
      const soleOrder = clientOrders.length === 1 ? clientOrders[0].id : null;
      await db.from("finance_projects").update({
        client_id: rc.top.id, order_id: p.order_id ?? soleOrder,
        match_score: rc.top.score, match_source: "auto",
      }).eq("id", p.id);
      await upsertReview(db, "project", p.finmap_id, p.name, "client", rc.top, "matched");
      linked++;
    } else if (r.top || rc.top) {
      await upsertReview(db, "project", p.finmap_id, p.name, "order", r.top ?? rc.top, "needs_review");
      review++;
    } else skipped++;
  }
  return { entity: "projects", linked, review, skipped };
}

/** Операції: переносимо зв'язки з проєкту/контрагента, плюс номер замовлення з коментаря. */
export async function backfillTransactionLinks(db: Db): Promise<MatchReport> {
  const [{ data: projects }, { data: cps }, { data: orders }] = await Promise.all([
    db.from("finance_projects").select("id,order_id,client_id"),
    db.from("finance_counterparties").select("id,client_id"),
    db.from("orders").select("id,number,client_id").limit(5000),
  ]);
  const pr = new Map(((projects ?? []) as any[]).map((p) => [p.id, p]));
  const cp = new Map(((cps ?? []) as any[]).map((c) => [c.id, c]));
  const ordByNumber = new Map(((orders ?? []) as any[]).map((o) => [normalizeName(o.number), o]));

  let linked = 0, review = 0, skipped = 0, from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data: rows } = await db
      .from("finance_transactions")
      .select("id,order_id,client_id,finance_project_id,counterparty_id,comment,match_status")
      .or("order_id.is.null,client_id.is.null")
      .range(from, from + PAGE - 1);
    const list = (rows ?? []) as any[];
    if (!list.length) break;

    for (const t of list) {
      const p = t.finance_project_id ? pr.get(t.finance_project_id) : null;
      const c = t.counterparty_id ? cp.get(t.counterparty_id) : null;
      let orderId = t.order_id ?? p?.order_id ?? null;
      let clientId = t.client_id ?? p?.client_id ?? c?.client_id ?? null;

      if (!orderId && t.comment) {
        const norm = normalizeName(t.comment);
        for (const [num, o] of ordByNumber) {
          if (num && norm.includes(num)) { orderId = o.id; clientId = clientId ?? o.client_id; break; }
        }
      }
      if (orderId === t.order_id && clientId === t.client_id) { skipped++; continue; }

      await db.from("finance_transactions").update({
        order_id: orderId, client_id: clientId,
        match_status: orderId || clientId ? "matched" : "unmatched",
      }).eq("id", t.id);
      orderId || clientId ? linked++ : review++;
    }
    if (list.length < PAGE) break;
    from += PAGE;
  }
  return { entity: "transactions", linked, review, skipped };
}

/** Повний прохід автозв'язування після синхронізації. */
export async function runFinmapAutoMatch(db: Db): Promise<MatchReport[]> {
  const a = await matchCounterparties(db);
  const b = await matchProjects(db);
  const c = await backfillTransactionLinks(db);
  return [a, b, c];
}
