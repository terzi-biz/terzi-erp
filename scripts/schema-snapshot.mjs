#!/usr/bin/env node
/**
 * Machine-readable snapshot схеми production/staging БД.
 *
 * Використання:
 *   SUPABASE_DB_URL="postgres://..." node scripts/schema-snapshot.mjs
 *
 * Пише docs/schema-snapshot.json (таблиці, колонки, enum-и, індекси,
 * функції, тригери, RLS-політики). Дані НЕ вивантажуються — тільки схема.
 * Результат використовується для порівняння з чистою staging-базою,
 * побудованою лише з supabase/migrations (див. docs/SCHEMA_DRIFT.md).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const url = process.env["SUPABASE_DB_URL"];
if (!url) {
  console.error("Потрібна змінна SUPABASE_DB_URL (див. .env.example).");
  process.exit(1);
}

const QUERIES = {
  tables: `select table_name from information_schema.tables where table_schema='public' order by 1`,
  columns: `select table_name, column_name, data_type, is_nullable, column_default
            from information_schema.columns where table_schema='public' order by 1,2`,
  enums: `select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid
          join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' order by 1, e.enumsortorder`,
  indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2`,
  policies: `select tablename, policyname, cmd, roles::text, qual, with_check
             from pg_policies where schemaname='public' order by 1,2`,
  rls: `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' order by 1`,
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname in ('public','private') order by 1`,
  triggers: `select event_object_table, trigger_name, action_timing, event_manipulation
             from information_schema.triggers where trigger_schema='public' order by 1,2`,
};

const run = (sql) =>
  JSON.parse(
    execFileSync("psql", [url, "-Atq", "-c", `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trim() || "[]",
  );

const snapshot = { generated_at: new Date().toISOString() };
for (const [key, sql] of Object.entries(QUERIES)) {
  snapshot[key] = run(sql);
  console.log(`${key}: ${snapshot[key].length}`);
}

mkdirSync("docs", { recursive: true });
writeFileSync("docs/schema-snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log("Записано docs/schema-snapshot.json");
