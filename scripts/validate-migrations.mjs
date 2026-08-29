#!/usr/bin/env node
/**
 * Валідація історії міграцій TERZI ERP (без підключення до БД).
 *
 * Перевіряє:
 *  - імена файлів `<YYYYMMDDHHMMSS>_<slug>.sql`;
 *  - монотонність timestamp;
 *  - відсутність дублікатів timestamp;
 *  - що кожен `CREATE TABLE public.x` має GRANT і ENABLE ROW LEVEL SECURITY;
 *  - що в міграціях немає захардкоджених секретів.
 *
 * Якщо доступний SUPABASE_DB_URL — додатково нагадує про schema snapshot.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const errors = [];
const warnings = [];

if (!existsSync(DIR)) {
  console.error(`Немає каталогу ${DIR}`);
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
let prev = "";
const seen = new Set();

for (const file of files) {
  const m = /^(\d{14})_[\w.-]+\.sql$/.exec(file);
  if (!m) {
    errors.push(`Некоректне ім'я міграції: ${file}`);
    continue;
  }
  const ts = m[1];
  if (seen.has(ts)) errors.push(`Дубльований timestamp міграції: ${ts}`);
  seen.add(ts);
  if (ts < prev) errors.push(`Порушено порядок міграцій: ${file} йде після ${prev}`);
  prev = ts;

  const sql = readFileSync(join(DIR, file), "utf8");
  const lower = sql.toLowerCase();

  const created = [...lower.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/g)].map((x) => x[1]);
  for (const table of created) {
    if (!new RegExp(`grant[\\s\\S]*public\\.${table}\\b`).test(lower)) {
      errors.push(`${file}: таблиця public.${table} створена без GRANT`);
    }
    if (!new RegExp(`alter table[\\s\\S]*public\\.${table}[\\s\\S]*enable row level security`).test(lower)) {
      errors.push(`${file}: таблиця public.${table} створена без ENABLE ROW LEVEL SECURITY`);
    }
  }

  if (/(service_role_key|sb_secret_|eyj[a-z0-9]{20,})/i.test(sql)) {
    errors.push(`${file}: схоже на захардкоджений секрет`);
  }
  if (/\bdrop table\b/i.test(sql)) {
    warnings.push(`${file}: містить DROP TABLE — переконайся, що це задокументовано в docs/SCHEMA_DRIFT.md`);
  }
}

console.log(`Перевірено міграцій: ${files.length}`);
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);

if (errors.length) {
  console.error(`\nВалідація міграцій провалена: ${errors.length} помилок.`);
  process.exit(1);
}
console.log("Валідація міграцій пройдена.");
