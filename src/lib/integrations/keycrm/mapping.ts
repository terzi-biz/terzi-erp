/**
 * Чисті правила мапінгу keyCRM → TERZI ERP (без БД і без побічних ефектів).
 * Використовуються синхронізацією та тестами.
 */

export type LeadCanonicalStatus = "open" | "won" | "lost" | "postponed";

export type KeyCrmStatus = {
  id?: number | string | null;
  title?: string | null;
  name?: string | null;
  alias?: string | null;
  is_final?: boolean | null;
};

const WON_RE = /(успешн|успішн|successful|won|продан|оплачен)/i;
const POSTPONED_RE = /(отлож|відклад|не актуально|ожидает готовности)/i;

/**
 * Канонічний статус ліда за етапом keyCRM.
 * Активний етап → open, «Успешно» → won, решта фінальних → lost (причина = назва етапу).
 * Причини відмови лишаються причинами, а не етапами воронки.
 */
export function canonicalLeadStatus(status: KeyCrmStatus | null | undefined): {
  status: LeadCanonicalStatus;
  lostReason: string | null;
} {
  const title = String(status?.title ?? status?.name ?? "");
  const alias = String(status?.alias ?? "");
  const text = `${title} ${alias}`;
  const isFinal = status?.is_final === true;
  if (WON_RE.test(text)) return { status: "won", lostReason: null };
  if (!isFinal) return { status: "open", lostReason: null };
  if (POSTPONED_RE.test(text)) return { status: "postponed", lostReason: title || null };
  return { status: "lost", lostReason: title || null };
}

/* ------------------------------ custom fields ----------------------------- */

/** Відповідність назв додаткових полів keyCRM ключам картки ліда TERZI. */
const FIELD_PATTERNS: { re: RegExp; key: string }[] = [
  { re: /^utm[_ ]?source$/i, key: "utm_source" },
  { re: /^utm[_ ]?medium$/i, key: "utm_medium" },
  { re: /^utm[_ ]?campaign$/i, key: "utm_campaign" },
  { re: /^utm[_ ]?content$/i, key: "utm_content" },
  { re: /^utm[_ ]?term$/i, key: "utm_term" },
  { re: /^gclid$/i, key: "gclid" },
  { re: /^(fbclid|fbp)$/i, key: "fbclid" },
  { re: /^(gbraid|wbraid)$/i, key: "gbraid" },
  { re: /landing/i, key: "landing_page" },
  { re: /(тип услуги|тип послуги|тип работ|тип робіт)/i, key: "service_type" },
  { re: /(тип объекта|тип обʼєкта|тип об'єкта)/i, key: "object_type" },
  { re: /(площад|площа)/i, key: "object_area" },
  { re: /(адрес|адреса)/i, key: "object_address" },
  { re: /(слой|товщин)/i, key: "layer_thickness" },
  { re: /(армиров|сітк)/i, key: "mesh" },
  { re: /(утеплен|утеплюв)/i, key: "insulation" },
  { re: /(теплый пол|тепла підлога)/i, key: "warm_floor" },
  { re: /(этаж|поверх|высот)/i, key: "floor" },
  { re: /(фио|піб)/i, key: "client_full_name" },
  { re: /(номер договора|номер договору)/i, key: "contract_number" },
  { re: /(сумма договора|сума договору)/i, key: "contract_sum" },
  { re: /(замер|замір)/i, key: "measure_done" },
  { re: /(периметр)/i, key: "perimeter" },
];

export type KeyCrmCustomField = { id?: number | string; uuid?: string; name?: string; type?: string; value?: unknown };

function fieldValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && x !== "").join(", ") || null;
  if (v === "" || v === undefined) return null;
  return v;
}

export type MappedCustomFields = {
  /** Значення для crm_leads.tags.fields (ключі збігаються з LEAD_CUSTOM_FIELDS). */
  fields: Record<string, unknown>;
  utm: Record<string, string>;
  area: number | null;
  address: string | null;
  /** Оригінальні значення keyCRM для відлагодження. */
  raw: Record<string, unknown>;
};

export function mapCustomFields(list: KeyCrmCustomField[] | null | undefined): MappedCustomFields {
  const out: MappedCustomFields = { fields: {}, utm: {}, area: null, address: null, raw: {} };
  for (const f of list ?? []) {
    const value = fieldValue(f?.value);
    if (value === null) continue;
    const name = String(f?.name ?? "");
    out.raw[String(f?.uuid ?? f?.id ?? name)] = value;
    const hit = FIELD_PATTERNS.find((p) => p.re.test(name));
    if (!hit) continue;
    out.fields[hit.key] = value;
    if (hit.key.startsWith("utm_")) out.utm[hit.key] = String(value);
    if (hit.key === "gclid" || hit.key === "fbclid" || hit.key === "gbraid") out.utm[hit.key] = String(value);
    if (hit.key === "landing_page") out.utm.landing_page = String(value);
    if (hit.key === "object_area") {
      const n = Number(String(value).replace(",", "."));
      if (Number.isFinite(n) && n > 0) out.area = n;
    }
    if (hit.key === "object_address") out.address = String(value);
  }
  return out;
}

/* --------------------------- збереження даних ERP -------------------------- */

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "" || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/**
 * Патч без знищення даних: значення keyCRM записуються лише якщо вони непорожні,
 * а поля, якими keyCRM не володіє, — лише коли в ERP порожньо.
 * `owned` — поля, де keyCRM є джерелом істини (етап, статус, зовнішні ID).
 */
export function preservePatch(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  owned: string[] = [],
): Record<string, unknown> {
  const ownedSet = new Set(owned);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (isEmpty(v)) continue;
    if (!existing) {
      patch[k] = v;
      continue;
    }
    if (ownedSet.has(k) || isEmpty(existing[k])) patch[k] = v;
  }
  return patch;
}

/** Обʼєднання UTM: наявна атрибуція ERP сильніша, keyCRM лише доповнює порожні ключі. */
export function mergeUtm(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (isEmpty(v)) continue;
    if (isEmpty(out[k])) out[k] = v;
  }
  return out;
}

/* ---------------------------- мапінг менеджерів --------------------------- */

export type ErpUser = { id: string; email?: string | null; phone?: string | null; name?: string | null };
export type KeyCrmUser = { id: number | string; email?: string | null; phone?: string | null; full_name?: string | null };

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9);

/**
 * Відповідність користувача keyCRM співробітнику ERP.
 * Тільки стабільні ознаки: e-mail, далі телефон. Тільки за іменем — ніколи.
 */
export function matchManager(user: KeyCrmUser, erpUsers: ErpUser[]): { userId: string | null; by: "email" | "phone" | null } {
  const email = String(user.email ?? "").trim().toLowerCase();
  if (email) {
    const hits = erpUsers.filter((u) => String(u.email ?? "").trim().toLowerCase() === email);
    if (hits.length === 1) return { userId: hits[0]!.id, by: "email" };
  }
  const phone = digits(user.phone);
  if (phone.length === 9) {
    const hits = erpUsers.filter((u) => digits(u.phone) === phone);
    if (hits.length === 1) return { userId: hits[0]!.id, by: "phone" };
  }
  return { userId: null, by: null };
}

/* ------------------------------- дублі клієнтів --------------------------- */

export type DuplicateRecord = {
  id: string;
  name?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  createdAt?: string | null;
  status?: string | null;
  /** Кількість бізнес-звʼязків (замовлення, кошториси, ліди, дзвінки). */
  relations?: number;
  /** Скільки заповнених полів у записі. */
  completeness?: number;
};

export type DuplicateGroup = {
  key: string;
  by: "external_id" | "phone_e164" | "email";
  safe: boolean;
  reason: string | null;
  survivor: DuplicateRecord;
  losers: DuplicateRecord[];
};

function pickSurvivor(list: DuplicateRecord[]): DuplicateRecord {
  return [...list].sort(
    (a, b) =>
      (b.relations ?? 0) - (a.relations ?? 0) ||
      (b.completeness ?? 0) - (a.completeness ?? 0) ||
      Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? ""),
  )[0] as DuplicateRecord;
}

/**
 * Детерміновані групи дублів: однаковий зовнішній ID keyCRM, точний E.164 або точний e-mail.
 * Нечіткого злиття людей за іменем немає. Групи з конфліктом ознак — не SAFE.
 */
export function buildDuplicateGroups(records: DuplicateRecord[]): DuplicateGroup[] {
  const buckets = new Map<string, { by: DuplicateGroup["by"]; list: DuplicateRecord[] }>();
  const add = (by: DuplicateGroup["by"], key: string, r: DuplicateRecord) => {
    const k = `${by}:${key}`;
    const b = buckets.get(k) ?? { by, list: [] };
    if (!b.list.some((x) => x.id === r.id)) b.list.push(r);
    buckets.set(k, b);
  };
  for (const r of records) {
    if (r.status === "archived") continue;
    if (r.externalSource && r.externalId) add("external_id", `${r.externalSource}:${r.externalId}`, r);
    if (r.phoneE164) add("phone_e164", r.phoneE164, r);
    if (r.email) add("email", r.email.trim().toLowerCase(), r);
  }

  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();
  const order: DuplicateGroup["by"][] = ["external_id", "phone_e164", "email"];
  for (const by of order) {
    for (const [key, bucket] of buckets) {
      if (bucket.by !== by || bucket.list.length < 2) continue;
      const list = bucket.list.filter((r) => !used.has(r.id));
      if (list.length < 2) continue;
      const survivor = pickSurvivor(list);
      const losers = list.filter((r) => r.id !== survivor.id);
      // Конфлікт: у групі різні точні e-mail або різні зовнішні ID keyCRM.
      const emails = new Set(list.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean));
      const externals = new Set(list.map((r) => (r.externalId ? `${r.externalSource}:${r.externalId}` : "")).filter(Boolean));
      const conflicting = (by !== "email" && emails.size > 1) || (by !== "external_id" && externals.size > 1);
      const safe = !conflicting;
      if (safe) for (const r of list) used.add(r.id);
      groups.push({
        key,
        by,
        safe,
        reason: conflicting ? "Різні точні ідентифікатори всередині групи — потребує перевірки" : null,
        survivor,
        losers,
      });
    }
  }
  return groups;
}
