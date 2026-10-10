// prod-walk-snapshot.cjs — READ-ONLY tenant-wide snapshot for the C6.3 production walk-through.
//   node scripts/pending/c6/prod-walk-snapshot.cjs --out /tmp/c63-walk/snapshot-<label>.json
//   node scripts/pending/c6/prod-walk-snapshot.cjs --compare <before.json> <after.json>     (no DB access; exit 3 on unexplained drift)
// What it records (everything inside ONE `BEGIN READ ONLY … ROLLBACK`; no SET; prints no URL / secret / row content):
//   • every public table that has a "tenantId" column: count · max(createdAt) · max(updatedAt) · md5 of the ordered id list (≤ 50 000 rows)
//     · md5 of the full row text for the WATCH list (tables the walk writes or must not change)
//   • every table WITHOUT tenantId that hangs off a tenant table through a foreign key (≤ 3 hops): count through the join
//   • global tables the walk touches: User (temp marker) · Session (owner + tag) · AuthToken (temp e-mails)
//   • facts for the setup plan: units, systems, CRM↔unit links, teams, pipelines, keys present in settings.crm (names only)
"use strict";
const fs = require("node:fs");
const { C, connect, guard, nowIso } = require("./prod-walk-lib.cjs");

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const q = (s) => `"${s.replace(/"/g, '""')}"`;

// Tables whose full row content is hashed (walk writes them, or they must come back byte-identical).
const WATCH = (t) => /^(Crm|Custom|Team|Portal|AppSystem|Membership|Tenant$|BusinessUnit$|Party|MemberField|MemberSection|AutomationRule|ApiKey|Webhook|Notification|Approval)/.test(t);

// ───────────── compare mode (pure file diff) ─────────────
if (args[0] === "--compare") {
  const a = JSON.parse(fs.readFileSync(args[1], "utf8"));
  const b = JSON.parse(fs.readFileSync(args[2], "utf8"));
  const names = Array.from(new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])).sort();
  let drift = 0;
  const lines = [];
  for (const n of names) {
    const x = a.tables[n], y = b.tables[n];
    if (!x || !y) { drift += 1; lines.push(`  ${n}: ${x ? "missing in AFTER" : "missing in BEFORE"}`); continue; }
    const diffs = [];
    for (const k of ["n", "maxCreated", "maxUpdated", "idHash", "rowHash", "err"]) if ((x[k] ?? null) !== (y[k] ?? null)) diffs.push(k === "n" ? `n ${x.n}→${y.n}` : k);
    if (diffs.length) { drift += 1; lines.push(`  ${n}: ${diffs.join(" · ")}${WATCH(n) ? "   ← WATCH" : ""}`); }
  }
  for (const k of Object.keys(a.global)) if (JSON.stringify(a.global[k]) !== JSON.stringify(b.global[k])) { drift += 1; lines.push(`  [global] ${k}: ${JSON.stringify(a.global[k])} → ${JSON.stringify(b.global[k])}`); }
  console.log(`compare ${args[1]} (${a.at}) ↔ ${args[2]} (${b.at}) · tables ${names.length} · drifting ${drift}`);
  for (const l of lines) console.log(l);
  console.log(drift === 0 ? "IDENTICAL" : "DRIFT — every line above must be explained (real shop activity vs. walk residue) before the walk is declared clean");
  process.exit(drift === 0 ? 0 : 3);
}

(async () => {
  const out = argOf("--out");
  if (!out) { console.error("usage: --out <file.json>  |  --compare <a.json> <b.json>"); process.exit(1); }
  const { client: c, hostMark, which } = await connect();
  await c.query("BEGIN READ ONLY");
  const safe = async (sql, params = []) => {
    try { return await c.query(sql, params); }
    catch (e) { await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); return { err: String(e.message).slice(0, 160), rows: [], rowCount: 0 }; }
  };
  const g = await guard(c);
  const T = C.TENANT_ID;

  // 1) catalogue
  const cols = await c.query(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, ordinal_position`);
  const isTable = new Set((await c.query(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows.map((r) => r.t));
  const byTable = new Map();
  for (const r of cols.rows) { if (!isTable.has(r.t)) continue; if (!byTable.has(r.t)) byTable.set(r.t, new Set()); byTable.get(r.t).add(r.c); }
  const fks = await c.query(`
    SELECT cl.relname AS child, a.attname AS fk, pr.relname AS parent, pa.attname AS pk
      FROM pg_constraint k
      JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_class pr ON pr.oid = k.confrelid
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = k.confkey[1]
     WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1`);
  const tenantTables = [...byTable.keys()].filter((t) => byTable.get(t).has("tenantId")).sort();
  const tables = {};

  // 2) tables with tenantId
  for (const t of tenantTables) {
    const cs = byTable.get(t);
    const parts = [`count(*)::int AS n`];
    if (cs.has("createdAt")) parts.push(`max("createdAt")::text AS mc`);
    if (cs.has("updatedAt")) parts.push(`max("updatedAt")::text AS mu`);
    const r = await safe(`SELECT ${parts.join(", ")} FROM ${q(t)} WHERE "tenantId" = $1`, [T]);
    if (r.err) { tables[t] = { err: r.err }; continue; }
    const row = { n: r.rows[0].n, maxCreated: r.rows[0].mc ?? null, maxUpdated: r.rows[0].mu ?? null };
    if (cs.has("id") && row.n > 0 && row.n <= 50000) {
      const h = await safe(`SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) AS h FROM ${q(t)} WHERE "tenantId" = $1`, [T]);
      row.idHash = h.err ? `ERR ${h.err}` : h.rows[0].h;
      if (WATCH(t) && row.n <= 5000) {
        const hh = await safe(`SELECT md5(string_agg(md5(x::text), '' ORDER BY x.id::text)) AS h FROM ${q(t)} x WHERE x."tenantId" = $1`, [T]);
        row.rowHash = hh.err ? `ERR ${hh.err}` : hh.rows[0].h;
      }
    }
    tables[t] = row;
  }
  // Tenant row itself (no tenantId column)
  {
    const r = await safe(`SELECT md5(x::text) AS h, x."updatedAt"::text AS mu FROM "Tenant" x WHERE id = $1`, [T]);
    tables["Tenant"] = r.err ? { err: r.err } : { n: 1, maxUpdated: r.rows[0].mu, rowHash: r.rows[0].h };
  }

  // 3) child tables without tenantId — resolve a join path to a tenant table (≤ 3 hops)
  const tenantSet = new Set(tenantTables);
  const edges = new Map(); // child → [{fk,parent,pk}]
  for (const r of fks.rows) { if (!edges.has(r.child)) edges.set(r.child, []); edges.get(r.child).push(r); }
  const pathOf = (t, depth = 0, seen = new Set()) => {
    if (tenantSet.has(t)) return [];
    if (depth >= 3 || seen.has(t)) return null;
    seen.add(t);
    for (const e of edges.get(t) ?? []) {
      if (e.parent === t) continue;
      const rest = pathOf(e.parent, depth + 1, seen);
      if (rest) return [e, ...rest];
    }
    return null;
  };
  const unreachable = [];
  for (const t of [...byTable.keys()].sort()) {
    if (tenantSet.has(t) || t === "Tenant" || t.startsWith("_")) continue;
    const p = pathOf(t);
    if (!p || !p.length) { unreachable.push(t); continue; }
    let sql = `SELECT count(*)::int AS n FROM ${q(t)} t0`;
    p.forEach((e, i) => { sql += ` JOIN ${q(e.parent)} t${i + 1} ON t${i}.${q(e.fk)} = t${i + 1}.${q(e.pk)}`; });
    sql += ` WHERE t${p.length}."tenantId" = $1`;
    const r = await safe(sql, [T]);
    tables[t] = r.err ? { err: r.err, via: p.map((e) => e.parent).join("→") } : { n: r.rows[0].n, via: p.map((e) => `${e.fk}→${e.parent}`).join(" · ") };
  }

  // 4) global tables the walk touches
  const like = `${C.MARK}%@${C.EMAIL_DOMAIN}`;
  const one = async (sql, params) => { const r = await safe(sql, params); return r.err ? `ERR ${r.err}` : r.rows[0]; };
  const global = {
    tempUsers: await one(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [like]),
    tempUserSessions: await one(`SELECT count(*)::int AS n FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE u.email LIKE $1`, [like]),
    taggedSessions: await one(`SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" = $1`, [C.UA]),
    ownerSessions: await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" > now())::int AS live FROM "Session" WHERE "userId" = $1`, [g.ownerUserId]),
    tempAuthTokens: await one(`SELECT count(*)::int AS n FROM "AuthToken" WHERE email LIKE $1`, [like]),
    ownerMembershipHash: await one(`SELECT md5(m::text) AS h FROM "Membership" m WHERE id = $1`, [g.ownerMembershipId]),
    ownerUserHash: await one(`SELECT md5(u::text) AS h FROM "User" u WHERE id = $1`, [g.ownerUserId]),
  };

  // 5) facts for the setup plan (names / ids / key names only — no customer data, no settings values)
  const rows = async (sql, params = [T]) => { const r = await safe(sql, params); return r.err ? [{ err: r.err }] : r.rows; };
  const facts = {
    units: await rows(`SELECT id, type::text AS type, status::text AS status, left(name, 40) AS name FROM "BusinessUnit" WHERE "tenantId" = $1 ORDER BY "sortOrder", "createdAt"`),
    systems: await rows(`SELECT id, type::text AS type, active, left(name, 40) AS name, (SELECT count(*)::int FROM "AppSystemUnit" u WHERE u."systemId" = s.id) AS units FROM "AppSystem" s WHERE "tenantId" = $1 ORDER BY type::text, "createdAt"`),
    crmUnits: await rows(`SELECT "unitId" FROM "AppSystemUnit" WHERE "tenantId" = $1 AND "systemId" = $2`, [T, C.CRM_SYSTEM_ID]),
    crmSettingsKeys: await rows(`SELECT k AS key, jsonb_typeof(v) AS type FROM "AppSystem" s, jsonb_each(COALESCE(s.settings->'crm', '{}'::jsonb)) AS e(k, v) WHERE s.id = $2 AND s."tenantId" = $1`, [T, C.CRM_SYSTEM_ID]),
    crmSettingsTopKeys: await rows(`SELECT k AS key FROM "AppSystem" s, jsonb_object_keys(s.settings) AS k WHERE s.id = $2 AND s."tenantId" = $1`, [T, C.CRM_SYSTEM_ID]),
    teams: await rows(`SELECT id, left(name, 40) AS name, "archivedAt" IS NOT NULL AS archived FROM "Team" WHERE "tenantId" = $1`),
    pipelines: await rows(`SELECT p.id, left(p.name, 40) AS name, p."isDefault", (SELECT count(*)::int FROM "CrmStage" st WHERE st."pipelineId" = p.id) AS stages FROM "CrmPipeline" p WHERE p."tenantId" = $1 AND p."systemId" = $2`, [T, C.CRM_SYSTEM_ID]),
    stages: await rows(`SELECT st.id, st."pipelineId", left(st.name, 30) AS name, st.kind::text AS kind, st."sortOrder" FROM "CrmStage" st WHERE st."tenantId" = $1 AND st."systemId" = $2 ORDER BY st."pipelineId", st."sortOrder"`, [T, C.CRM_SYSTEM_ID]),
    lostReasons: await rows(`SELECT count(*)::int AS n FROM "CrmLostReason" WHERE "tenantId" = $1 AND "systemId" = $2`, [T, C.CRM_SYSTEM_ID]),
    markerRows: {
      contacts: await rows(`SELECT count(*)::int AS n FROM "CrmContact" WHERE "tenantId" = $1 AND name LIKE $2`, [T, `${C.MARK}%`]),
      companies: await rows(`SELECT count(*)::int AS n FROM "CrmCompany" WHERE "tenantId" = $1 AND name LIKE $2`, [T, `${C.MARK}%`]),
      deals: await rows(`SELECT count(*)::int AS n FROM "CrmDeal" WHERE "tenantId" = $1 AND title LIKE $2`, [T, `${C.MARK}%`]),
      teams: await rows(`SELECT count(*)::int AS n FROM "Team" WHERE "tenantId" = $1 AND name LIKE $2`, [T, `${C.MARK}%`]),
    },
    opsWarnErr24h: await rows(`SELECT level::text AS level, source, count(*)::int AS n FROM "OpsEvent" WHERE "tenantId" = $1 AND "createdAt" > now() - interval '24 hours' AND level::text IN ('WARN','ERROR') GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`),
    outboxNotDone: await rows(`SELECT type, status::text AS status, count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND status::text <> 'DONE' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20`),
  };

  await c.query("ROLLBACK");
  await c.end();

  const snap = { at: nowIso(), which, hostMark, tenantId: T, crmSystemId: C.CRM_SYSTEM_ID, ownerUserId: g.ownerUserId, tempMembershipsNow: g.tempMemberships, counts: { tenantTables: tenantTables.length, childTables: Object.keys(tables).length - tenantTables.length - 1, unreachable: unreachable.length }, tables, unreachable, global, facts };
  fs.mkdirSync(require("node:path").dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap, null, 1), { mode: 0o600 });

  const nonZero = Object.entries(tables).filter(([, v]) => (v.n ?? 0) > 0);
  const errs = Object.entries(tables).filter(([, v]) => v.err);
  console.log(`snapshot · ${which} · host ${hostMark} · ${snap.at}`);
  console.log(`tables with tenantId: ${tenantTables.length} · child tables via FK: ${snap.counts.childTables} · tables not reachable from the tenant (global): ${unreachable.length}`);
  console.log(`tables holding rows of this tenant: ${nonZero.length} · total rows ${nonZero.reduce((s, [, v]) => s + v.n, 0)} · query errors: ${errs.length}`);
  for (const [n, v] of errs) console.log(`  ERR ${n}: ${v.err}`);
  console.log(`CRM/Team/Custom/Portal rows now: ${nonZero.filter(([n]) => /^(Crm|Custom|Team|Portal)/.test(n)).map(([n, v]) => `${n}=${v.n}`).join(" · ") || "(none)"}`);
  console.log(`global: ${JSON.stringify(global)}`);
  console.log(`facts: units ${facts.units.length} · systems ${facts.systems.length} · crm↔unit links ${facts.crmUnits.length} · teams ${facts.teams.length} · pipelines ${facts.pipelines.length} · stages ${facts.stages.length}`);
  console.log(`saved → ${out}`);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
