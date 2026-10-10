// C6.0 R-1 read-only prod check: does any general API key use the AI tools that G1 removes from general keys?
const fs = require("node:fs"), path = require("node:path"), { Client } = require("pg");
const env = {}; for (const l of fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8").split("\n")) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1"); }
const Q = [
  ["apikeys", `SELECT name, "systemId" IS NOT NULL AS system_bound, jsonb_array_length("scopesJson"::jsonb) AS scopes, "lastUsedAt"::text, "createdAt"::text, "revokedAt" IS NOT NULL AS revoked FROM "ApiKey" ORDER BY "createdAt"`],
  ["ai_messages_30d", `SELECT role::text, count(*)::int AS n FROM "AiMessage" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1`],
  ["ai_tool_mentions_30d", `SELECT count(*)::int AS n FROM "AiMessage" WHERE "createdAt" > now() - interval '30 days' AND (content LIKE '%remember_fact%' OR content LIKE '%forget_fact%' OR content LIKE '%support_open_case%' OR content LIKE '%financial_summary%' OR content LIKE '%record_expense%')`],
  ["ai_credit_usage_30d", `SELECT count(*)::int AS n FROM "AiCreditTxn" WHERE "createdAt" > now() - interval '30 days'`],
  ["ai_conversations_total", `SELECT count(*)::int AS n, max("updatedAt")::text AS last FROM "AiConversation"`],
  ["ai_audit_tools_30d", `SELECT action, count(*)::int AS n FROM "AuditLog" WHERE action LIKE 'ai.%' AND "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`],
];
(async () => { const c = new Client({ connectionString: env.DATABASE_URL, statement_timeout: 20000 }); await c.connect(); await c.query("BEGIN READ ONLY");
  for (const [n, s] of Q) { try { const r = await c.query(s); console.log(`## ${n}`); r.rows.forEach((x) => console.log("  " + JSON.stringify(x))); } catch (e) { console.log(`## ${n}\n  ERR ${e.message}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); } }
  await c.query("ROLLBACK"); await c.end(); })().catch((e) => { console.error("ERR", e.message); process.exit(1); });
