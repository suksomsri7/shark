// C6.1 read-only production probe (controller only). Loads DATABASE_URL / DIRECT_URL from the project's .env IN-PROCESS and never prints
// them; every query runs inside `BEGIN READ ONLY` (pooler-safe: no SET, the transaction ends with ROLLBACK). Owner authorised the
// read-only prod probe on 7 Oct 2026 (chat). Usage: node scripts/pending/c6/prod-probe-c61.cjs [--direct]   (default = DATABASE_URL)
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8").split("\n")) {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const useDirect = process.argv.includes("--direct");
const url = useDirect ? env.DIRECT_URL : env.DATABASE_URL;
if (!url) { console.error("no url in .env for", useDirect ? "DIRECT_URL" : "DATABASE_URL"); process.exit(1); }
let host = "?"; try { host = new URL(url).host.replace(/^[^.]*/, (h) => h.slice(0, 12) + "…"); } catch {}
const Q = [
  ["role", `SELECT current_user, has_schema_privilege(current_user,'public','CREATE') AS can_create_in_public, version() AS pg`],
  ["migrations_crm", `SELECT migration_name, finished_at::text, rolled_back_at::text FROM "_prisma_migrations" WHERE migration_name LIKE '%crm%' OR migration_name LIKE '2026110%' ORDER BY migration_name`],
  ["migrations_last5", `SELECT migration_name, finished_at::text FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 5`],
  ["migrations_pending_or_failed", `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`],
  ["crm_systems_uiVersion", `SELECT COALESCE(settings->>'uiVersion','(unset)') AS ui_version, count(*)::int AS systems, count(DISTINCT "tenantId")::int AS tenants FROM "AppSystem" WHERE type::text = 'CRM' GROUP BY 1 ORDER BY 1`],
  ["outbox_error_crm_24h", `SELECT count(*)::int AS n FROM "OutboxEvent" WHERE type LIKE 'crm.%' AND status::text IN ('ERROR','FAILED','DEAD') AND "createdAt" > now() - interval '24 hours'`],
  ["outbox_by_status_24h", `SELECT status::text, count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" > now() - interval '24 hours' GROUP BY 1 ORDER BY 1`],
  ["outbox_crm_types_all_time", `SELECT count(*)::int AS n, min("createdAt")::text AS first FROM "OutboxEvent" WHERE type LIKE 'crm.%'`],
  ["apikeys_summary", `SELECT (CASE WHEN "revokedAt" IS NULL THEN 'active' ELSE 'revoked' END) AS state, ("systemId" IS NOT NULL) AS system_bound, (jsonb_array_length("scopesJson"::jsonb) > 0) AS has_scopes, count(*)::int AS n FROM "ApiKey" GROUP BY 1,2,3 ORDER BY 1,2,3`],
  ["apikeys_account_bound_non_account_scope", `SELECT count(*)::int AS n FROM "ApiKey" k JOIN "AppSystem" s ON s.id = k."systemId" WHERE k."revokedAt" IS NULL AND s.type::text = 'ACCOUNT' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(k."scopesJson"::jsonb) sc WHERE sc NOT LIKE 'account.%')`],
  ["apikeys_no_creator_active", `SELECT count(*)::int AS n FROM "ApiKey" WHERE "revokedAt" IS NULL AND "createdById" IS NULL`],
  ["lock_slots", `SELECT current_setting('max_locks_per_transaction')::int * (current_setting('max_connections')::int + current_setting('max_prepared_transactions')::int) AS lock_slots, current_setting('max_connections')::int AS max_connections`],
  ["jno_candidates_90d", `SELECT count(*)::int AS candidates FROM (SELECT "systemId" FROM "AccountJournalEntry" WHERE "createdAt" > now() - interval '90 days' GROUP BY 1) s`],
  ["jno_docno_bad_shape", `SELECT count(*)::int AS n FROM "AccountJournalEntry" WHERE "docNo" !~ '^(SV|PV|RV|PY|JV)-\\d{4}-\\d{2}-\\d{4,}$'`],
  ["jno_docno_long_tail", `SELECT count(*)::int AS n FROM "AccountJournalEntry" WHERE "docNo" ~ '\\d{7,}$'`],
  ["jno_sequences_existing", `SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'acc_jno_%'`],
  ["jno_migration_rows", `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name LIKE '2026110400000%'`],
  ["rowcounts_index_targets", `SELECT 'CrmContact' AS t, count(*)::int AS n FROM "CrmContact" UNION ALL SELECT 'CustomRecord', count(*)::int FROM "CustomRecord" UNION ALL SELECT 'CrmEmailMessage', count(*)::int FROM "CrmEmailMessage" UNION ALL SELECT 'OutboxEvent', count(*)::int FROM "OutboxEvent" UNION ALL SELECT 'AccountContact', count(*)::int FROM "AccountContact" UNION ALL SELECT 'CrmCompanyContact', count(*)::int FROM "CrmCompanyContact" UNION ALL SELECT 'AccountJournalEntry', count(*)::int FROM "AccountJournalEntry"`],
  ["accountcontact_dup_system_party", `SELECT count(*)::int AS dup_groups, COALESCE(sum(c-1),0)::int AS extra_rows FROM (SELECT "systemId", "partyId", count(*) c FROM "AccountContact" WHERE "partyId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d`],
  ["companycontact_multi_primary", `SELECT count(*)::int AS companies FROM (SELECT "companyId" FROM "CrmCompanyContact" WHERE "isPrimary" GROUP BY 1 HAVING count(*) > 1) d`],
  ["tenants", `SELECT count(*)::int AS tenants FROM "Tenant"`],
];
(async () => {
  const c = new Client({ connectionString: url, statement_timeout: 20000 });
  await c.connect();
  console.log(`prod probe C6.1 · ${useDirect ? "DIRECT_URL" : "DATABASE_URL"} · host ${host} · ${new Date().toISOString()}`);
  await c.query("BEGIN READ ONLY");
  for (const [name, sql] of Q) {
    try { const r = await c.query(sql); console.log(`\n## ${name}`); for (const row of r.rows) console.log("  " + JSON.stringify(row)); }
    catch (e) { console.log(`\n## ${name}\n  ERR ${e.message}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); }
  }
  await c.query("ROLLBACK");
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
