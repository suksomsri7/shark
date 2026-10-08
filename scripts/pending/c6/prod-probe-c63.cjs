// C6.3 read-only pilot probe (copy of prod-probe-c61.cjs with pilot-tenant queries; BEGIN READ ONLY, never prints URLs).
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
// --url-from-env: take the URL from the process env instead of .env (used by neon-rehearse-migrations.cjs against a throw-away branch)
const url = process.argv.includes("--url-from-env") ? (useDirect ? process.env.DIRECT_URL : process.env.DATABASE_URL) : useDirect ? env.DIRECT_URL : env.DATABASE_URL;
if (!url) { console.error("no url in .env for", useDirect ? "DIRECT_URL" : "DATABASE_URL"); process.exit(1); }
let host = "?"; try { host = new URL(url).host.replace(/^[^.]*/, (h) => h.slice(0, 12) + "…"); } catch {}
const Q = [
  ["pilot_crm_systems", `SELECT id, name, "createdAt"::text, settings->'crm'->>'uiVersion' AS crm_ui, settings->>'uiVersion' AS top_ui, left(settings::text, 300) AS settings_head FROM "AppSystem" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i' AND type::text='CRM' ORDER BY "createdAt"`],
  ["pilot_members", `SELECT role::text, count(*)::int AS n FROM "Membership" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i' GROUP BY 1 ORDER BY 1`],
  ["pilot_crm_rows", `SELECT 'CrmContact' AS t, count(*)::int AS n FROM "CrmContact" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i' UNION ALL SELECT 'CrmDeal', count(*)::int FROM "CrmDeal" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i' UNION ALL SELECT 'CrmActivity', count(*)::int FROM "CrmActivity" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i'`],
  ["pilot_ops_warn_err_24h", `SELECT level::text, source, count(*)::int AS n FROM "OpsEvent" WHERE "tenantId"='cmtazbpjh000004lcjikxju2i' AND "createdAt" > now() - interval '24 hours' AND level::text IN ('WARN','ERROR') GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`],
  ["outbox_error_24h", `SELECT type, count(*)::int AS n FROM "OutboxEvent" WHERE status::text IN ('ERROR','FAILED','DEAD') AND "createdAt" > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`],
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
