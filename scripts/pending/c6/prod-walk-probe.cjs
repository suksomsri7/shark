// prod-walk-probe.cjs — READ-ONLY facts that decide the side-effect analysis of the C6.3 walk (webhook subscriptions, automation rules,
// push devices, notification recipients, outbox traffic, cron health). BEGIN READ ONLY … ROLLBACK · prints no URL path/secret/row content.
"use strict";
const { C, connect, guard } = require("./prod-walk-lib.cjs");
const T = C.TENANT_ID;
const Q = [
  ["webhook_endpoints", `SELECT id, active, split_part(split_part(url, '://', 2), '/', 1) AS host, jsonb_array_length("eventsJson") AS n_events, (SELECT string_agg(e, ',') FROM jsonb_array_elements_text("eventsJson") e WHERE e LIKE 'crm.%' OR e LIKE 'custom.%' OR e LIKE 'team.%') AS crm_events, left("eventsJson"::text, 300) AS events_head, "createdAt"::text FROM "WebhookEndpoint" WHERE "tenantId" = $1`],
  ["webhook_deliveries_by_type", `SELECT "eventType", status::text AS status, count(*)::int AS n, max("createdAt")::text AS last FROM "WebhookDelivery" WHERE "tenantId" = $1 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20`],
  ["automation_rules", `SELECT id, left(name, 40) AS name, event, enabled, scope::text AS scope, kind, "actionType"::text AS action_type, "systemId", "boardId" IS NOT NULL AS has_board, jsonb_array_length(actions) AS n_actions, (SELECT string_agg(a->>'type', ',') FROM jsonb_array_elements(actions) a) AS action_types FROM "AutomationRule" WHERE "tenantId" = $1`],
  ["api_keys", `SELECT count(*)::int AS n FROM "ApiKey" WHERE "tenantId" = $1`],
  ["push_devices", `SELECT platform, ("userId" = $2) AS is_owner, count(*)::int AS n FROM "PushDevice" WHERE "tenantId" = $1 OR "userId" = $2 GROUP BY 1,2`, "owner"],
  ["app_notifications", `SELECT ("recipientUserId" IS NULL) AS shop_wide, ("recipientUserId" = $2) AS to_owner, count(*)::int AS n, count(*) FILTER (WHERE "readAt" IS NULL)::int AS unread, max("createdAt")::text AS last FROM "AppNotification" WHERE "tenantId" = $1 GROUP BY 1,2`, "owner"],
  ["outbox_types_7d", `SELECT type, status::text AS status, count(*)::int AS n, max("createdAt")::text AS last FROM "OutboxEvent" WHERE "tenantId" = $1 AND "createdAt" > now() - interval '7 days' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 25`],
  ["outbox_crm_any", `SELECT type, status::text AS status, count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND (type LIKE 'crm.%' OR type LIKE 'custom.%' OR type LIKE 'team.%') GROUP BY 1,2`],
  ["audit_log", `SELECT action, "actorType"::text AS actor_type, "targetType", "createdAt"::text FROM "AuditLog" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 5`],
  ["ops_events", `SELECT level::text AS level, source, left(message, 80) AS message, "createdAt"::text FROM "OpsEvent" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 5`],
  ["tenant_limits_modules", `SELECT status::text AS status, plan::text AS plan, jsonb_typeof(limits) AS limits_type, (SELECT string_agg(k, ',') FROM jsonb_object_keys(limits) k) AS limit_keys, left("enabledModules"::text, 200) AS modules FROM "Tenant" WHERE id = $1`],
  ["member_party_rows", `SELECT (SELECT count(*)::int FROM "Customer" WHERE "tenantId" = $1) AS customers, (SELECT count(*)::int FROM "Party" WHERE "tenantId" = $1) AS parties, (SELECT count(*)::int FROM "KanbanBoard" WHERE "tenantId" = $1) AS boards, (SELECT count(*)::int FROM "HrEmployee" WHERE "tenantId" = $1) AS employees`],
  ["account_docs", `SELECT (SELECT count(*)::int FROM "AccountDocument" WHERE "tenantId" = $1) AS documents, (SELECT count(*)::int FROM "AccountContact" WHERE "tenantId" = $1) AS contacts, (SELECT count(*)::int FROM "AccountDocSequence" WHERE "tenantId" = $1) AS sequences`],
  ["ai_wallet", `SELECT count(*)::int AS wallets FROM "AiCreditWallet" WHERE "tenantId" = $1`],
  ["chat_connections", `SELECT count(*)::int AS n FROM "ChatChannelConnection" WHERE "tenantId" = $1`],
  ["crm_tables_exist", `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE 'Crm%' OR table_name LIKE 'Custom%' OR table_name IN ('Team','TeamMember','PortalSession'))`, "none"],
  ["triggers_on_audit_like", `SELECT event_object_table AS tbl, trigger_name, action_timing, event_manipulation FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY 1 LIMIT 40`, "none"],
  ["rls_or_rules", `SELECT tablename, rulename FROM pg_rules WHERE schemaname = 'public' LIMIT 20`, "none"],
  ["rls_tables", `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relrowsecurity LIMIT 20`, "none"],
  ["db_sequences", `SELECT count(*)::int AS n FROM pg_sequences WHERE schemaname = 'public'`, "none"],
];
(async () => {
  const { client: c, hostMark, which } = await connect();
  await c.query("BEGIN READ ONLY");
  const g = await guard(c);
  console.log(`prod walk probe · ${which} · host ${hostMark} · ${new Date().toISOString()} · temp memberships now: ${g.tempMemberships}`);
  for (const [name, sql, p2] of Q) {
    try { const r = await c.query(sql, p2 === "owner" ? [T, g.ownerUserId] : p2 === "none" ? [] : [T]); console.log(`\n## ${name} (${r.rowCount})`); for (const row of r.rows) console.log("  " + JSON.stringify(row)); }
    catch (e) { console.log(`\n## ${name}\n  ERR ${String(e.message).slice(0, 200)}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); }
  }
  await c.query("ROLLBACK");
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
