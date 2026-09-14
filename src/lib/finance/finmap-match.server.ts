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

export type RuleStat = { rule: string; label: string; count: number; amount?: number };

export type MatchReport = {
  entity: "counterparties" | "projects" | "transactions";
  linked: number;
  review: number;
  skipped: number;
  rules: RuleStat[];
};

export type MatchOptions = { dryRun?: boolean };

/** Лічильник правил, які дали зіставлення (для dry-run звіту). */
export function ruleCounter() {
  const map = new Map<string, RuleStat>();
  return {
    hit(rule: string, label: string, amount = 0) {
      const cur = map.get(rule) ?? { rule, label, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount = Math.round(((cur.amount ?? 0) + amount) * 100) / 100;
      map.set(rule, cur);
    },
    list(): RuleStat[] {
      return [...map.values()].sort((a, b) => b.count - a.count);
    },
  };
}

/** Останні 9 цифр номера — стабільний ключ зіставлення (0XX / +380XX / 380XX). */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** Контрагенти Finmap → клієнти ERP за телефоном і назвою.
 *  Finmap віддає частину клієнтів у довіднику постачальників, тому фільтруємо
 *  лише свідомо «не клієнтські» типи (співробітники, власники, інвестори). */
const NON_CLIENT_KINDS = new Set(["employee", "owner", "investor"]);

export async function matchCounterparties(db: Db, opts: MatchOptions = {}): Promise<MatchReport> {
  const dry = !!opts.dryRun;
  const rules = ruleCounter();
  const [{ data: cps }, { data: clients }] = await Promise.all([
    db.from("finance_counterparties").select("id,finmap_id,finmap_kind,name,phone,email,client_id,employee_id,match_source").is("client_id", null),
    db.from("clients").select("id,name,phone,phone_e164,email").limit(5000),
  ]);
  const list = (clients ?? []) as any[];
  const byPhone = new Map<string, any>();
  const byEmail = new Map<string, any>();
  for (const c of list) {
    for (const p of [c.phone_e164, c.phone]) { const k = phoneKey(p); if (k && !byPhone.has(k)) byPhone.set(k, c); }
    const e = String(c.email ?? "").trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, c);
  }

  let linked = 0, review = 0, skipped = 0;
  for (const cp of ((cps ?? []) as any[])) {
    // 1. Ручний мапінг ніколи не перетирається.
    if (cp.match_source === "manual") { rules.hit("manual", "Ручний мапінг — пропущено"); skipped++; continue; }
    // Finmap kind=supplier не означає автоматично ERP Supplier: свідомо не клієнтські типи пропускаємо.
    if (NON_CLIENT_KINDS.has(cp.finmap_kind)) { rules.hit("non_client_kind", "Тип Finmap не клієнтський"); skipped++; continue; }

    // 2-4. Стабільні ідентифікатори: телефон, e-mail.
    const key = phoneKey(cp.phone) ?? (/^[\d+()\s-]+$/.test(String(cp.name ?? "")) ? phoneKey(cp.name) : null);
    const byPhoneHit = key ? byPhone.get(key) : null;
    const emailHit = byEmail.get(String(cp.email ?? "").trim().toLowerCase()) ?? null;

    let chosen: Candidate | null = null;
    let confident = false;
    let rule = "";
    if (byPhoneHit) { chosen = { id: byPhoneHit.id, label: byPhoneHit.name, score: 100 }; confident = true; rule = "phone_exact"; }
    else if (emailHit) { chosen = { id: emailHit.id, label: emailHit.name, score: 100 }; confident = true; rule = "email_exact"; }
    else {
      // 7. Нечітка назва — тільки на перевірку або дуже впевнений збіг.
      const cands = list
        .map((c) => ({ id: c.id, label: c.name as string, score: similarity(cp.name, c.name) }))
        .filter((c) => c.score >= REVIEW_MIN);
      const r = best(cands);
      chosen = r.top; confident = r.confident; rule = "name_similarity";
    }

    if (chosen && confident) {
      rules.hit(rule, rule === "phone_exact" ? "Точний телефон" : rule === "email_exact" ? "Точний e-mail" : "Збіг назви (висока впевненість)");
      if (!dry) {
        await db.from("finance_counterparties")
          .update({ client_id: chosen.id, match_score: chosen.score, match_source: "auto" }).eq("id", cp.id);
        await upsertReview(db, cp.finmap_kind, cp.finmap_id, cp.name, "client", chosen, "matched");
      }
      linked++;
    } else if (chosen) {
      rules.hit("needs_review_name", "Схожа назва — потребує перевірки");
      if (!dry) await upsertReview(db, cp.finmap_kind, cp.finmap_id, cp.name, "client", chosen, "needs_review");
      review++;
    } else { rules.hit("unmatched", "Кандидатів не знайдено"); skipped++; }
  }
  return { entity: "counterparties", linked, review, skipped, rules: rules.list() };
}


/** Проєкти Finmap → замовлення ERP (за номером, назвою, адресою) або клієнт. */
export async function matchProjects(db: Db, opts: MatchOptions = {}): Promise<MatchReport> {
  const dry = !!opts.dryRun;
  const rules = ruleCounter();
  const [{ data: projects }, { data: orders }, { data: clients }] = await Promise.all([
    db.from("finance_projects").select("id,finmap_id,name,order_id,client_id,match_source"),
    db.from("orders").select("id,number,name,address,client_id,client:client_id(name)").limit(5000),
    db.from("clients").select("id,name").limit(5000),
  ]);
  const ords = (orders ?? []) as any[];
  const cls = (clients ?? []) as any[];

  let linked = 0, review = 0, skipped = 0;
  for (const p of ((projects ?? []) as any[])) {
    if (p.match_source === "manual") { rules.hit("manual", "Ручний мапінг — пропущено"); skipped++; continue; }
    if (p.order_id && p.client_id) { rules.hit("already_linked", "Уже звʼязано"); skipped++; continue; }

    // 5. Точний номер замовлення в назві проєкту — детермінований збіг.
    const exact = ords.find((o) => o.number && normalizeName(p.name).includes(normalizeName(o.number)));
    const cands: Candidate[] = [];
    for (const o of ords) {
      const s = Math.max(similarity(p.name, o.address), similarity(p.name, o.name), similarity(p.name, o.client?.name) - 10);
      if (s >= REVIEW_MIN) cands.push({ id: o.id, label: o.number ?? o.name, score: s });
    }
    const r = exact ? { top: { id: exact.id, label: exact.number, score: 100 } as Candidate, confident: true } : best(cands);

    if (r.top && r.confident) {
      rules.hit(exact ? "order_number_exact" : "order_name_address", exact ? "Точний номер замовлення" : "Назва/адреса замовлення");
      if (!dry) {
        const order = ords.find((o) => o.id === r.top!.id);
        await db.from("finance_projects").update({
          order_id: r.top.id, client_id: order?.client_id ?? p.client_id ?? null,
          match_score: r.top.score, match_source: "auto",
        }).eq("id", p.id);
        await upsertReview(db, "project", p.finmap_id, p.name, "order", r.top, "matched");
      }
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
      rules.hit(soleOrder ? "client_sole_order" : "client_only", soleOrder ? "Клієнт із єдиним замовленням" : "Тільки клієнт (замовлення неоднозначне)");
      if (!dry) {
        await db.from("finance_projects").update({
          client_id: rc.top.id, order_id: p.order_id ?? soleOrder,
          match_score: rc.top.score, match_source: "auto",
        }).eq("id", p.id);
        await upsertReview(db, "project", p.finmap_id, p.name, "client", rc.top, "matched");
      }
      linked++;
    } else if (r.top || rc.top) {
      rules.hit("needs_review_name", "Схожа назва — потребує перевірки");
      if (!dry) await upsertReview(db, "project", p.finmap_id, p.name, "order", r.top ?? rc.top, "needs_review");
      review++;
    } else { rules.hit("unmatched", "Кандидатів не знайдено"); skipped++; }
  }
  return { entity: "projects", linked, review, skipped, rules: rules.list() };
}

/** Операції: зв'язки з проєкту/контрагента, номер замовлення з коментаря,
 *  далі — тільки однозначне замовлення клієнта. Кілька замовлень → needs_review. */
export async function backfillTransactionLinks(db: Db, opts: MatchOptions = {}): Promise<MatchReport> {
  const dry = !!opts.dryRun;
  const rules = ruleCounter();
  const [{ data: projects }, { data: cps }, { data: orders }, { data: manualLinks }] = await Promise.all([
    db.from("finance_projects").select("id,order_id,client_id"),
    db.from("finance_counterparties").select("id,client_id"),
    db.from("orders").select("id,number,client_id,created_at").limit(5000),
    db.from("finance_transaction_links").select("transaction_id").eq("status", "manual").limit(20000),
  ]);
  // Ручні зв'язки оператора ніколи не перетираються автоматикою.
  const manual = new Set(((manualLinks ?? []) as any[]).map((l) => l.transaction_id));
  const pr = new Map(((projects ?? []) as any[]).map((p) => [p.id, p]));
  const cp = new Map(((cps ?? []) as any[]).map((c) => [c.id, c]));
  const ordList = (orders ?? []) as any[];
  const ordByNumber = new Map(ordList.map((o) => [normalizeName(o.number), o]));
  const ordByClient = new Map<string, any[]>();
  for (const o of ordList) {
    if (!o.client_id) continue;
    const arr = ordByClient.get(o.client_id) ?? [];
    arr.push(o);
    ordByClient.set(o.client_id, arr);
  }

  let linked = 0, review = 0, skipped = 0, from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data: rows } = await db
      .from("finance_transactions")
      .select("id,kind,amount,amount_uah,order_id,client_id,finance_project_id,counterparty_id,comment,op_date,match_status,match_source")
      .or("order_id.is.null,client_id.is.null")
      .range(from, from + PAGE - 1);
    const list = (rows ?? []) as any[];
    if (!list.length) break;

    for (const t of list) {
      const money = Number(t.amount_uah ?? t.amount) || 0;
      if (t.match_source === "manual") { rules.hit("manual", "Ручний звʼязок — пропущено", money); skipped++; continue; }

      const p = t.finance_project_id ? pr.get(t.finance_project_id) : null;
      const c = t.counterparty_id ? cp.get(t.counterparty_id) : null;
      let orderId = t.order_id ?? null;
      let clientId = t.client_id ?? null;
      let rule = "";

      if (!orderId && p?.order_id) { orderId = p.order_id; rule = "project_order"; }
      if (!clientId) clientId = p?.client_id ?? c?.client_id ?? null;
      if (!rule && clientId && !t.client_id) rule = p?.client_id ? "project_client" : "counterparty_client";

      if (!orderId && t.comment) {
        const norm = normalizeName(t.comment);
        for (const [numKey, o] of ordByNumber) {
          if (numKey && norm.includes(numKey)) { orderId = o.id; clientId = clientId ?? o.client_id; rule = "comment_order_number"; break; }
        }
      }

      // Гроші клієнта переносимо на об'єкт ЛИШЕ коли замовлення однозначне.
      let ambiguous = false;
      if (!orderId && clientId) {
        const arr = ordByClient.get(clientId) ?? [];
        if (arr.length === 1) { orderId = arr[0].id; rule = rule || "client_sole_order"; }
        else if (arr.length > 1) ambiguous = true;
      }
      if (orderId && !clientId) clientId = ordList.find((o) => o.id === orderId)?.client_id ?? null;

      if (orderId === t.order_id && clientId === t.client_id) {
        rules.hit(ambiguous ? "ambiguous_multi_order" : "no_candidate",
          ambiguous ? "Кілька замовлень клієнта — потребує перевірки" : "Без кандидата (може бути адмін/податки/реклама)", money);
        if (ambiguous) review++; else skipped++;
        continue;
      }

      rules.hit(rule || "linked", {
        project_order: "Проєкт Finmap → замовлення",
        project_client: "Проєкт Finmap → клієнт",
        counterparty_client: "Контрагент → клієнт",
        comment_order_number: "Номер замовлення в коментарі",
        client_sole_order: "Єдине замовлення клієнта",
      }[rule] ?? "Звʼязок оновлено", money);

      if (!dry) {
        await db.from("finance_transactions").update({
          order_id: orderId, client_id: clientId,
          match_status: orderId || clientId ? "matched" : "unmatched",
        }).eq("id", t.id);
      }
      orderId || clientId ? linked++ : review++;
    }
    if (list.length < PAGE) break;
    from += PAGE;
  }
  return { entity: "transactions", linked, review, skipped, rules: rules.list() };
}


/** Повний прохід автозв'язування після синхронізації. */
export async function runFinmapAutoMatch(db: Db, opts: MatchOptions = {}): Promise<MatchReport[]> {
  const a = await matchCounterparties(db, opts);
  const b = await matchProjects(db, opts);
  const c = await backfillTransactionLinks(db, opts);
  return [a, b, c];
}
