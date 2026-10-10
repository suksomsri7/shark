// prod-walk-cleanup.cjs — removes EVERYTHING the C6.3 production walk created (temp accounts, sessions, qc-prod- CRM data and what it derived).
//   node scripts/pending/c6/prod-walk-cleanup.cjs                                   # DRY-RUN (default): prints the id sets + every DELETE it would run
//   node scripts/pending/c6/prod-walk-cleanup.cjs --apply --before <snapshot.json>  # one transaction · caps · post-conditions vs the BEFORE snapshot · COMMIT only if all hold
//   node scripts/pending/c6/prod-walk-cleanup.cjs --cleanup-only [--since <ISO>] [--apply --before <snapshot.json>]
//                                                                                   # emergency: manifest missing/corrupt → marker search only (qc-prod- / tag / .invalid)
//   flags: --keep-audit (leave AuditLog rows of the walk) · --keep-outbox (leave OutboxEvent history rows of the walk)
// How a row qualifies (ALL must hold): tenant = pilot tenant · AND (id listed in the manifest OR carries the qc-prod- marker OR hangs off such a row through a
//   link column OR belongs to a temp user) · AND, for deletion, the statement's row count ≤ its cap (else ROLLBACK).
// Never deleted here: OpsEvent (reported; controller decides) · anything of another tenant · any row of a real user except the tagged owner session.
"use strict";
const fs = require("node:fs");
const { C, connect, guard, readManifest, nowIso } = require("./prod-walk-lib.cjs");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const EMERGENCY = args.includes("--cleanup-only");
const KEEP_AUDIT = args.includes("--keep-audit");
const KEEP_OUTBOX = args.includes("--keep-outbox");
const OWNER_REVIEWED = args.includes("--owner-rows-reviewed"); // controller looked at the owner's own rows of the window and still wants the blanket systemId deletes
const DUMP = `${C.DIR}/deleted-rows.json`;
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const T = C.TENANT_ID;
const q = (s) => `"${s.replace(/"/g, '""')}"`;
const LIKE = `${C.MARK}%`;

// CRM-owned tables (all have tenantId on prod — verified by the phase-1 snapshot: 299 tenant tables, 0 FK-only children).
const OWNED = (t) => /^(Crm[A-Z]|CustomObject$|CustomRecord|Team$|TeamMember$|PortalSession$)/.test(t);
// link column → parent table whose temp-id set makes the row temp
const LINK = {
  contactId: "CrmContact", crmContactId: "CrmContact", primaryContactId: "CrmContact", fromContactId: "CrmContact", toContactId: "CrmContact", mergedIntoId: null,
  companyId: "CrmCompany", dealId: "CrmDeal", activityId: "CrmActivity", teamId: "Team", objectId: "CustomObject", recordId: "CustomRecord",
  pipelineId: "CrmPipeline", stageId: "CrmStage", fromStageId: null, toStageId: null, sequenceId: "CrmSequence", enrollmentId: "CrmSequenceEnrollment",
  emailId: "CrmEmailMessage", linkId: "CrmTrackedLink", sessionId: "CrmWebSession", portalAccessId: "CrmPortalAccess", ruleId: "CrmCommissionRule", commissionRuleId: "CrmCommissionRule",
};
const USER_COLS = ["userId", "ownerUserId", "createdById", "actorUserId", "invitedById", "assigneeUserId", "leadUserId", "decidedById", "approvedById", "recipientUserId", "updatedById"];
const MARK_COLS = ["name", "title", "label", "subject", "firstName", "singular", "plural", "nameSingular", "namePlural"];
// tables outside OWNED where rows addressed to a TEMP USER may be deleted (anything else referencing a temp user ⇒ ABORT and report)
const USER_REF_DELETABLE = new Set(["MemberSavedView", "MemberAccessLog", "AppNotification", "ChatReadState", "ChatConversationPref", "KanbanWatch", "PushDevice"]);
const CAP = { default: 300, ChatRateBucket: 60, MemberField: 120, MemberSection: 30, User: 3, Membership: 3, Team: 3, TeamMember: 6, Session: 12, PortalSession: 6, CrmPortalAccess: 4, CrmContact: 40, CrmCompany: 20, CrmDeal: 40, Party: 60, OutboxEvent: 1500, AuditLog: 1500, AppNotification: 400, total: 6000 };
const capOf = (t) => CAP[t] ?? CAP.default;

(async () => {
  const m = EMERGENCY ? null : readManifest();
  if (!m && !EMERGENCY) throw new Error(`no manifest at ${C.MANIFEST} — nothing was set up, or use --cleanup-only (marker search)`);
  const since = m?.startedAt ?? argOf("--since") ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  const beforePath = argOf("--before");
  if (APPLY && !beforePath) throw new Error("--apply needs --before <snapshot.json> (post-conditions are checked against it inside the transaction)");
  const before = beforePath ? JSON.parse(fs.readFileSync(beforePath, "utf8")) : null;
  if (before && before.tenantId !== T) throw new Error("BEFORE snapshot is for another tenant");

  const { client: c, hostMark, which } = await connect();
  console.log(`prod-walk-cleanup · ${APPLY ? "APPLY (WRITES)" : "DRY-RUN (no write)"} · ${EMERGENCY ? "EMERGENCY marker search" : "manifest + marker"} · since ${since} · ${which} · host ${hostMark} · ${nowIso()}`);
  await c.query(APPLY ? "BEGIN" : "BEGIN READ ONLY");
  try {
    const g = await guard(c);
    const ownerId = g.ownerUserId;

    // ── catalogue ──
    const colRows = await c.query(`SELECT c.table_name AS t, c.column_name AS c FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE' WHERE c.table_schema = 'public'`);
    const cols = new Map();
    for (const r of colRows.rows) { if (!cols.has(r.t)) cols.set(r.t, new Set()); cols.get(r.t).add(r.c); }
    const tenantTables = [...cols.keys()].filter((t) => cols.get(t).has("tenantId"));
    const owned = tenantTables.filter(OWNED).sort();

    // ── temp users (global table: marker e-mail is the ONLY selector; manifest ids must agree) ──
    const u = await c.query(`SELECT id FROM "User" WHERE email LIKE $1`, [`${C.MARK}%@${C.EMAIL_DOMAIN}`]);
    const tempUsers = u.rows.map((r) => r.id);
    if (m) for (const id of Object.values(m.users || {})) if (!tempUsers.includes(id)) console.log(`  note: manifest user ${id} no longer exists (already cleaned?)`);
    if (tempUsers.includes(ownerId)) throw new Error("ABORT: the real owner matched the temp-user selector");
    if (tempUsers.length > CAP.User) throw new Error(`ABORT: ${tempUsers.length} temp users found (cap ${CAP.User})`);
    const otherTenant = await c.query(`SELECT count(*)::int AS n FROM "Membership" WHERE "userId" = ANY($1) AND "tenantId" <> $2`, [tempUsers, T]);
    if (otherTenant.rows[0].n) throw new Error("ABORT: a temp user holds a membership in ANOTHER tenant");

    // ── id sets of CRM-owned tables: marker ∪ manifest, then fix-point over link columns ──
    const sets = new Map(owned.map((t) => [t, new Set()]));
    const add = (t, ids) => { let n = 0; const s = sets.get(t); if (!s) return 0; for (const id of ids) if (!s.has(id)) { s.add(id); n += 1; } return n; };
    for (const t of owned) {
      const cs = cols.get(t);
      if (!cs.has("id")) continue;
      const mk = MARK_COLS.filter((k) => cs.has(k)).map((k) => `${q(k)} LIKE $2`);
      if (cs.has("key")) mk.push(`"key" LIKE 'qcprod%'`, `"key" LIKE $2`);
      if (mk.length) add(t, (await c.query(`SELECT id FROM ${q(t)} WHERE "tenantId" = $1 AND (${mk.join(" OR ")})`, [T, LIKE])).rows.map((r) => r.id));
      const listed = (m?.rows?.[t] ?? []).map((r) => r.id);
      if (listed.length) {
        const ex = await c.query(`SELECT id, "tenantId" FROM ${q(t)} WHERE id = ANY($1)`, [listed]);
        for (const r of ex.rows) if (r.tenantId !== T) throw new Error(`ABORT: manifest id ${r.id} of ${t} belongs to ANOTHER tenant`);
        add(t, ex.rows.map((r) => r.id));
      }
    }
    for (let pass = 0, grew = 1; grew && pass < 8; pass += 1) {
      grew = 0;
      for (const t of owned) {
        const cs = cols.get(t);
        if (!cs.has("id")) continue;
        const conds = []; const params = [T]; let p = 1;
        for (const [col, parent] of Object.entries(LINK)) {
          if (!parent || !cs.has(col) || parent === t) continue;
          const ids = [...(sets.get(parent) ?? [])];
          if (!ids.length) continue;
          params.push(ids); p += 1; conds.push(`${q(col)} = ANY($${p})`);
        }
        if (tempUsers.length) for (const col of USER_COLS) if (cs.has(col)) { params.push(tempUsers); p += 1; conds.push(`${q(col)} = ANY($${p})`); }
        if (/^CustomRecordValue/.test(t) && cs.has("recordId")) { const any = [...sets.entries()].filter(([k]) => k !== t).flatMap(([, v]) => [...v]); if (any.length) { params.push(any); p += 1; conds.push(`"recordId" = ANY($${p})`); } }
        if (!conds.length) continue;
        grew += add(t, (await c.query(`SELECT id FROM ${q(t)} WHERE "tenantId" = $1 AND (${conds.join(" OR ")})`, params)).rows.map((r) => r.id));
      }
    }
    // stages/pipelines/lost reasons that existed BEFORE the walk must never be in a set (they are the shop's own defaults)
    for (const t of ["CrmPipeline", "CrmStage", "CrmLostReason"]) {
      const s = sets.get(t); if (!s || !s.size) continue;
      const old = await c.query(`SELECT id FROM ${q(t)} WHERE id = ANY($1) AND "createdAt" < ($2::timestamptz AT TIME ZONE 'UTC')`, [[...s], since]);
      if (old.rowCount) throw new Error(`ABORT: ${old.rowCount} ${t} row(s) older than the walk matched the selector`);
    }
    // every selected row must be younger than the walk (belt and braces — nothing pre-existing may be deleted)
    for (const t of owned) {
      const s = sets.get(t); if (!s.size || !cols.get(t).has("createdAt")) continue;
      const old = await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE id = ANY($1) AND "createdAt" < ($2::timestamptz AT TIME ZONE 'UTC') - interval '5 minutes'`, [[...s], since]);
      if (old.rows[0].n) throw new Error(`ABORT: ${old.rows[0].n} selected ${t} row(s) were created BEFORE the walk started`);
    }
    const allTempIds = [...tempUsers, ...[...sets.values()].flatMap((s) => [...s])];

    // ── the REAL owner's own CRM work during the walk (rule A): crm/team/custom audit rows of the owner OUTSIDE the walk's owner-step windows ──
    const ownerWins = (m?.ui ?? []).filter((x) => x.role === "owner" && x.at && x.end);
    const wa = ownerWins.map((x) => x.at), wb = ownerWins.map((x) => x.end);
    const foreign = (await c.query(
      `SELECT a.action, a."targetType", a."targetId", a."createdAt"::text AS at FROM "AuditLog" a WHERE a."tenantId" = $1 AND a."createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND a."actorId" = $3
         AND (a.action LIKE 'crm.%' OR a.action LIKE 'team.%' OR a.action LIKE 'custom.%')
         AND NOT EXISTS (SELECT 1 FROM unnest($4::timestamptz[], $5::timestamptz[]) w(a0, b0) WHERE a."createdAt" BETWEEN (w.a0 AT TIME ZONE 'UTC') - interval '3 seconds' AND (w.b0 AT TIME ZONE 'UTC') + interval '90 seconds')
       ORDER BY a."createdAt"`, [T, since, ownerId, wa, wb])).rows;
    const blanketOk = foreign.length === 0 || OWNER_REVIEWED;

    // ── derived rows outside the CRM-owned tables ──
    const plan = []; // { table, sql, params, why }
    // Party rows created for qc-prod contacts/companies (shared table: delete only marker + young + not held by anything else)
    let partyIds = [];
    if (cols.has("Party")) {
      const ids = new Set();
      for (const t of ["CrmContact", "CrmCompany"]) if (cols.get(t)?.has("partyId") && sets.get(t)?.size) for (const r of (await c.query(`SELECT "partyId" AS p FROM ${q(t)} WHERE id = ANY($1) AND "partyId" IS NOT NULL`, [[...sets.get(t)]])).rows) ids.add(r.p);
      for (const r of (await c.query(`SELECT id FROM "Party" WHERE "tenantId" = $1 AND name LIKE $2`, [T, LIKE])).rows) ids.add(r.id);
      const cand = (await c.query(`SELECT id, name LIKE $3 AS marked, "createdAt" >= ($4::timestamptz AT TIME ZONE 'UTC') - interval '5 minutes' AS young FROM "Party" WHERE "tenantId" = $1 AND id = ANY($2)`, [T, [...ids], LIKE, since])).rows;
      for (const r of cand) {
        if (!r.marked || !r.young) { console.log(`  ⚠️  Party ${r.id} is linked to a temp contact/company but is ${!r.marked ? "NOT qc-prod- marked" : "older than the walk"} — a temp row attached to a REAL party: left untouched, REPORT`); continue; }
        let held = 0;
        for (const t of tenantTables) {
          if (!cols.get(t).has("partyId") || t === "Party") continue;
          const own = sets.get(t) ? [...sets.get(t)] : [];
          held += (await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1 AND "partyId" = $2 ${cols.get(t).has("id") ? "AND NOT (id = ANY($3))" : "AND $3::text[] IS NOT NULL"}`, [T, r.id, own])).rows[0].n;
        }
        if (held) { console.log(`  ⚠️  Party ${r.id} is held by ${held} row(s) outside the walk (member/accounting/chat) — left untouched, REPORT`); continue; }
        partyIds.push(r.id);
      }
    }
    // rows of other modules created FROM temp data — must be zero if the plan was followed; never auto-deleted
    const unexpected = [];
    for (const [t, col] of [["Customer", "partyId"], ["AccountContact", "partyId"], ["MemberActivity", "refId"], ["KanbanCard", "id"], ["AccountDocument", "id"], ["WebhookDelivery", "id"], ["AutomationRun", "id"]]) {
      if (!cols.has(t) || !cols.get(t).has("createdAt")) continue;
      let r;
      if (col === "partyId" && cols.get(t).has("partyId")) r = await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1 AND ("partyId" = ANY($2) OR "createdAt" >= ($3::timestamptz AT TIME ZONE 'UTC'))`, [T, partyIds, since]);
      else r = await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`, [T, since]);
      if (r.rows[0].n) unexpected.push(`${t}: ${r.rows[0].n} row(s) created since the walk started`);
    }
    // any tenant table (not CRM-owned) with a row addressed to a temp user
    const userRef = [];
    if (tempUsers.length) for (const t of tenantTables) {
      if (OWNED(t) || t === "Membership") continue;
      const hit = USER_COLS.filter((k) => cols.get(t).has(k));
      if (!hit.length) continue;
      const r = await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1 AND (${hit.map((k) => `${q(k)} = ANY($2)`).join(" OR ")})`, [T, tempUsers]);
      if (!r.rows[0].n) continue;
      if (t === "AuditLog" || t === "OutboxEvent") continue; // handled below
      if (USER_REF_DELETABLE.has(t)) plan.push({ table: t, why: "rows addressed to a temp user", sql: `DELETE FROM ${q(t)} WHERE "tenantId" = $1 AND (${hit.map((k) => `${q(k)} = ANY($2)`).join(" OR ")})`, params: [T, tempUsers] });
      else userRef.push(`${t}: ${r.rows[0].n} row(s) reference a temp user via ${hit.join("/")}`);
    }
    // notifications that quote temp data to a real user (owner / shop-wide)
    if (cols.has("AppNotification")) plan.push({ table: "AppNotification", why: "notifications about qc-prod- records (any recipient) created during the walk", sql: `DELETE FROM "AppNotification" WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND (title LIKE $3 OR body LIKE $3)`, params: [T, since, `%${C.MARK}%`] });
    // Member-module tables the CRM writes under ITS OWN systemId: field-designer seed for contact/company/deal on the first write
    // (crm/contacts.ts:465-482), custom-object fields, saved views, sensitive-view log. Selector = tenant + systemId = pilot CRM + created during the walk.
    // (The pilot system held 0 such rows before the walk — asserted by the post-conditions against the BEFORE snapshot.)
    const skippedBlanket = [];
    for (const t of ["MemberFieldValueHistory", "MemberFieldValue", "MemberAccessLog", "MemberSavedView", "MemberField", "MemberSection", "PartyMergeCandidate", "CrmImportJob"]) {
      if (!cols.has(t) || OWNED(t)) continue;
      const cs = cols.get(t);
      if (!blanketOk) { skippedBlanket.push(t); continue; }
      if (cs.has("systemId") && cs.has("createdAt")) plan.push({ table: t, why: "rows the CRM wrote under the pilot CRM systemId during the walk (field designer seed / views / logs)", sql: `DELETE FROM ${q(t)} WHERE "tenantId" = $1 AND "systemId" = $2 AND "createdAt" >= ($3::timestamptz AT TIME ZONE 'UTC')`, params: [T, C.CRM_SYSTEM_ID, since] });
      else if (cs.has("fieldId")) plan.push({ table: t, why: "values/history of fields of the pilot CRM system", sql: `DELETE FROM ${q(t)} WHERE "tenantId" = $1 AND "fieldId" IN (SELECT id FROM "MemberField" WHERE "tenantId" = $1 AND "systemId" = $2 AND "createdAt" >= ($3::timestamptz AT TIME ZONE 'UTC'))`, params: [T, C.CRM_SYSTEM_ID, since] });
      else if (t === "PartyMergeCandidate" && partyIds.length) { const pc = ["partyAId", "partyBId", "partyId", "candidateId", "otherPartyId"].filter((k) => cs.has(k)); if (pc.length) plan.push({ table: t, why: "merge candidates of temp parties", sql: `DELETE FROM ${q(t)} WHERE "tenantId" = $1 AND (${pc.map((k) => `${q(k)} = ANY($2)`).join(" OR ")})`, params: [T, partyIds] }); }
    }
    if (cols.has("MemberSavedView")) plan.push({ table: "MemberSavedView", why: "saved views of the pilot CRM system carrying the qc-prod- marker", sql: `DELETE FROM "MemberSavedView" WHERE "tenantId" = $1 AND "systemId" = $2 AND name LIKE $3`, params: [T, C.CRM_SYSTEM_ID, LIKE] });
    // rate-limit buckets keyed by a temp user id (global table without tenantId; they also self-expire after 24 h)
    if (cols.has("ChatRateBucket") && cols.get("ChatRateBucket").has("key") && tempUsers.length) plan.push({ table: "ChatRateBucket", why: "rate-limit buckets whose key contains a temp user id", sql: `DELETE FROM "ChatRateBucket" b WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) x WHERE b.key LIKE '%' || x || '%')`, params: [tempUsers] });
    // outbox history + audit trail of the walk
    const pend = await c.query(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND status::text = 'PENDING'`, [T]);
    if (pend.rows[0].n) { const msg = `${pend.rows[0].n} OutboxEvent row(s) of the tenant are still PENDING — wait for the drain before deleting the rows they point at`; if (APPLY) throw new Error(`ABORT: ${msg}`); console.log(`  ⚠️  ${msg}`); }
    if (!KEEP_OUTBOX && allTempIds.length) plan.push({ table: "OutboxEvent", why: "event history rows whose payload points at a temp id (crm.* / custom.* / team.*)", sql: `DELETE FROM "OutboxEvent" o WHERE o."tenantId" = $1 AND o."createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND (o.type LIKE 'crm.%' OR o.type LIKE 'custom.%' OR o.type LIKE 'team.%') AND o.status::text <> 'PENDING' AND EXISTS (SELECT 1 FROM unnest($3::text[]) x WHERE o.payload::text LIKE '%' || x || '%')`, params: [T, since, allTempIds] });
    if (!KEEP_AUDIT) {
      if (allTempIds.length) plan.push({ table: "AuditLog", why: "audit rows whose actor is a temp user or whose target is a temp row", sql: `DELETE FROM "AuditLog" WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND ("actorId" = ANY($3) OR "targetId" = ANY($4))`, params: [T, since, tempUsers, allTempIds] });
      if (ownerWins.length) plan.push({ table: "AuditLog", why: "owner-SESSION audit rows written inside the walk's own owner-step time windows (crm.* / custom.* only; never crm.settings.uiVersion)", sql: `DELETE FROM "AuditLog" a WHERE a."tenantId" = $1 AND a."createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND a."actorId" = $3 AND (a.action LIKE 'crm.%' OR a.action LIKE 'custom.%') AND a.action <> 'crm.settings.uiVersion' AND EXISTS (SELECT 1 FROM unnest($4::timestamptz[], $5::timestamptz[]) w(a0, b0) WHERE a."createdAt" BETWEEN (w.a0 AT TIME ZONE 'UTC') - interval '3 seconds' AND (w.b0 AT TIME ZONE 'UTC') + interval '90 seconds')`, params: [T, since, ownerId, wa, wb] });
    }
    // CRM-owned rows — children first (FK order from the catalogue)
    const fk = await c.query(`SELECT cl.relname AS child, pr.relname AS parent FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_class pr ON pr.oid = k.confrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE k.contype = 'f' AND n.nspname = 'public'`);
    const involved = owned.filter((t) => sets.get(t).size);
    const order = []; const mark = new Set();
    const visit = (t) => { if (mark.has(t)) return; mark.add(t); for (const e of fk.rows) if (e.parent === t && e.child !== t && involved.includes(e.child)) visit(e.child); order.push(t); };
    for (const t of involved) visit(t);
    for (const t of order) plan.push({ table: t, why: "qc-prod- CRM data / temp team rows", sql: `DELETE FROM ${q(t)} WHERE "tenantId" = $1 AND id = ANY($2)`, params: [T, [...sets.get(t)]], expect: sets.get(t).size });
    if (partyIds.length) plan.push({ table: "Party", why: "Party rows created for qc-prod- contacts/companies (marker + created during the walk + held by nothing else)", sql: `DELETE FROM "Party" WHERE "tenantId" = $1 AND id = ANY($2) AND name LIKE $3`, params: [T, partyIds, LIKE], expect: partyIds.length });
    // sessions → memberships → users
    const sessIds = (m?.rows?.Session ?? []).map((r) => r.id);
    plan.push({ table: "Session", why: "sessions of temp users + the tagged owner session(s) of this walk", sql: `DELETE FROM "Session" WHERE "userId" = ANY($1) OR ("userAgent" = $2 AND "userId" = $3 AND (id = ANY($4) OR $5))`, params: [tempUsers, C.UA, ownerId, sessIds, EMERGENCY] });
    if (tempUsers.length) {
      plan.push({ table: "Membership", why: "temp memberships", sql: `DELETE FROM "Membership" WHERE "tenantId" = $1 AND "userId" = ANY($2) AND role::text <> 'OWNER'`, params: [T, tempUsers], expect: tempUsers.length });
      plan.push({ table: "User", why: "temp users (marker e-mail)", sql: `DELETE FROM "User" WHERE id = ANY($1) AND email LIKE $2`, params: [tempUsers, `${C.MARK}%@${C.EMAIL_DOMAIN}`], expect: tempUsers.length });
    }
    // pilot CRM system settings (rule A): revert ONLY the key paths the walk touched; whole-row restore (settings text + updatedAt ⇒ identical hash)
    // only when that alone reproduces the pre-walk JSON — anything else in the row is the owner's and stays.
    const sysBefore = m?.appSystemBefore ?? null;
    const sysRow = (await c.query(`SELECT settings, md5(s::text) AS hash FROM "AppSystem" s WHERE id = $1 AND "tenantId" = $2 ${APPLY ? "FOR UPDATE" : ""}`, [C.CRM_SYSTEM_ID, T])).rows[0];
    const stable = (v) => (v && typeof v === "object" && !Array.isArray(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : Array.isArray(v) ? `[${v.map(stable).join(",")}]` : JSON.stringify(v));
    const getAt = (o, path) => path.reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
    let sysMode = "none", reverted = null, sysDiff = [];
    if (sysBefore && sysRow.hash !== sysBefore.hash) {
      const was = JSON.parse(sysBefore.settings);
      reverted = JSON.parse(JSON.stringify(sysRow.settings));
      for (const dotted of m.touchedSettingsPaths ?? []) {
        const path = dotted.split(".");
        const old = getAt(was, path);
        let o = reverted;
        for (let i = 0; i < path.length - 1 && o; i += 1) { if (o[path[i]] === undefined && old !== undefined) o[path[i]] = {}; o = o[path[i]]; }
        if (o && typeof o === "object") { if (old === undefined) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = old; }
        for (let d = path.length - 1; d >= 1; d -= 1) { const par = getAt(reverted, path.slice(0, d - 1)); const cur = par?.[path[d - 1]]; if (cur && typeof cur === "object" && !Object.keys(cur).length && getAt(was, path.slice(0, d)) === undefined) delete par[path[d - 1]]; }
      }
      if (stable(reverted) === stable(was)) sysMode = "whole";
      else if (stable(reverted) !== stable(sysRow.settings)) { sysMode = "paths"; }
      else sysMode = "foreign-only";
      const a = was.crm ?? {}, b = reverted.crm ?? {};
      sysDiff = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => stable(a[k]) !== stable(b[k])).map((k) => `crm.${k}`);
      for (const k of new Set([...Object.keys(was), ...Object.keys(reverted)])) if (k !== "crm" && stable(was[k]) !== stable(reverted[k])) sysDiff.push(k);
    }

    // ── report ──
    console.log(`\ntemp users: ${tempUsers.length} · CRM-owned tables with temp rows: ${involved.length} · temp ids total: ${allTempIds.length} · Party to delete: ${partyIds.length}`);
    console.log(`sets: ${involved.map((t) => `${t}=${sets.get(t).size}`).join(" · ") || "(none)"}`);
    for (const p of plan) console.log(`  DELETE ${p.table.padEnd(26)} cap ${String(capOf(p.table)).padStart(4)}${p.expect != null ? ` · expect ${p.expect}` : ""} — ${p.why}`);
    console.log(`  AppSystem(pilot CRM): ${!sysBefore ? "no saved copy (emergency mode) — compare by hand" : sysMode === "none" ? "unchanged (hash equal)" : sysMode === "whole" ? `WHOLE-ROW restore (reverting the walk's paths [${(m.touchedSettingsPaths ?? []).join(", ")}] reproduces the pre-walk JSON exactly)` : sysMode === "paths" ? `PATH-ONLY restore of [${(m.touchedSettingsPaths ?? []).join(", ")}] — keys changed by someone else are KEPT: ${sysDiff.join(", ")}` : `nothing of ours to revert — row differs only in keys the walk never touched (KEPT): ${sysDiff.join(", ")}`}`);
    if (foreign.length) { console.log(`\n⚠️  the REAL owner worked in the CRM during the walk (${foreign.length} audit row(s) outside the walk's owner steps):`); for (const f of foreign.slice(0, 30)) console.log(`     ${f.at}  ${f.action}  ${f.targetType ?? ""} ${f.targetId ?? ""}`); console.log(`   ⇒ blanket "pilot systemId + created during the walk" deletes ${blanketOk ? "ENABLED by --owner-rows-reviewed" : `SKIPPED for: ${skippedBlanket.join(", ")} (rows kept; remove ours by id after review)`}`); }
    if (unexpected.length) console.log(`\n⚠️  rows in OTHER modules since the walk started (not deleted by this script — investigate; may be real shop activity):\n   ${unexpected.join("\n   ")}`);
    if (userRef.length) console.log(`\n⚠️  tables referencing a temp user that this script does not know how to clean:\n   ${userRef.join("\n   ")}`);
    const ops = await c.query(`SELECT level::text AS level, source, count(*)::int AS n FROM "OpsEvent" WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') GROUP BY 1,2`, [T, since]);
    console.log(`\nOpsEvent since start (never deleted here): ${ops.rowCount ? ops.rows.map((r) => `${r.level}/${r.source}=${r.n}`).join(" · ") : "none"}`);

    if (!APPLY) { await c.query("ROLLBACK"); await c.end(); console.log("\nDRY-RUN — nothing written."); return; }
    if (userRef.length) throw new Error("ABORT: unknown tables reference a temp user (see above) — deleting the users would orphan them");

    // ── apply (same transaction) ──
    let total = 0;
    const dumped = [];
    for (const p of plan) {
      const dumpIt = ["AuditLog", "OutboxEvent", "AppNotification"].includes(p.table);
      const r = await c.query(dumpIt ? `${p.sql} RETURNING *` : p.sql, p.params);
      if (dumpIt) for (const row of r.rows) {
        if (p.table === "AppNotification") for (const k of ["title", "body"]) if (typeof row[k] === "string" && !row[k].includes(C.MARK)) row[k] = `[not walk text — ${row[k].length} chars withheld]`;
        dumped.push({ table: p.table, why: p.why, row });
      }
      total += r.rowCount;
      console.log(`  deleted ${String(r.rowCount).padStart(4)}  ${p.table}`);
      if (r.rowCount > capOf(p.table)) throw new Error(`ABORT: ${p.table} deleted ${r.rowCount} > cap ${capOf(p.table)}`);
      if (p.expect != null && r.rowCount !== p.expect) throw new Error(`ABORT: ${p.table} deleted ${r.rowCount}, expected exactly ${p.expect}`);
      if (total > CAP.total) throw new Error(`ABORT: total deleted ${total} > cap ${CAP.total}`);
    }
    if (sysMode === "whole") {
      const r = await c.query(`UPDATE "AppSystem" SET settings = $1::jsonb, "updatedAt" = $2::timestamp WHERE id = $3 AND "tenantId" = $4`, [sysBefore.settings, sysBefore.updatedAt, C.CRM_SYSTEM_ID, T]);
      const h = await c.query(`SELECT md5(s::text) AS hash FROM "AppSystem" s WHERE id = $1`, [C.CRM_SYSTEM_ID]);
      if (r.rowCount !== 1 || h.rows[0].hash !== sysBefore.hash) throw new Error("ABORT: AppSystem restore did not reproduce the pre-walk row hash");
      console.log("  restored AppSystem(pilot CRM) → hash equals the pre-walk hash");
    } else if (sysMode === "paths") {
      const r = await c.query(`UPDATE "AppSystem" SET settings = $1::jsonb WHERE id = $2 AND "tenantId" = $3`, [JSON.stringify(reverted), C.CRM_SYSTEM_ID, T]);
      if (r.rowCount !== 1) throw new Error("ABORT: AppSystem path restore touched no row");
      console.log(`  AppSystem(pilot CRM): walk paths reverted; kept foreign changes in ${sysDiff.join(", ")}`);
    }
    // post-conditions vs the BEFORE snapshot (inside the transaction)
    const bad = [];
    for (const t of [...owned, "Membership", "Party", "AppSystem", "MemberField", "MemberSection", "MemberSavedView", "AppNotification", "AuditLog"]) {
      if (!cols.has(t) || !before.tables[t]) continue;
      const n = (await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1`, [T])).rows[0].n;
      const strict = OWNED(t) || ["Membership", "Party", "AppSystem", "MemberField", "MemberSection", "MemberSavedView"].includes(t);
      if (n === before.tables[t].n) continue;
      if (!strict) { console.log(`  note: ${t} ${before.tables[t].n} → ${n} (live table — judged by the snapshot compare)`); continue; }
      const young = cols.get(t).has("createdAt") ? (await c.query(`SELECT count(*)::int AS n FROM ${q(t)} WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`, [T, since])).rows[0].n : -1;
      if (foreign.length && n - before.tables[t].n === young) console.log(`  note: ${t} ${before.tables[t].n} → ${n}: ${young} row(s) created during the walk are KEPT (owner worked in the CRM — review by id)`);
      else bad.push(`${t}: ${n} now vs ${before.tables[t].n} before`);
    }
    const left = await c.query(`SELECT (SELECT count(*)::int FROM "User" WHERE email LIKE $1) AS users, (SELECT count(*)::int FROM "Session" WHERE "userAgent" = $2) AS sessions, (SELECT count(*)::int FROM "Membership" WHERE "tenantId" = $3) AS members`, [`${C.MARK}%@${C.EMAIL_DOMAIN}`, C.UA, T]);
    if (left.rows[0].users || left.rows[0].sessions || left.rows[0].members !== C.EXPECT_OWNER_COUNT) bad.push(`left-overs: ${JSON.stringify(left.rows[0])}`);
    if (bad.length) throw new Error(`ABORT (ROLLBACK): post-conditions failed —\n   ${bad.join("\n   ")}`);
    fs.writeFileSync(DUMP, JSON.stringify({ at: nowIso(), since, rows: dumped }, null, 1), { mode: 0o600 });
    console.log(`  evidence: ${dumped.length} AuditLog/OutboxEvent/AppNotification row(s) dumped → ${DUMP} (written BEFORE commit)`);
    await c.query("COMMIT");
    console.log(`\nCOMMITTED · ${total} rows deleted · next: prod-walk-snapshot --out after.json, then --compare before after`);
    await c.end();
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* connection may be gone */ }
    try { await c.end(); } catch { /* ignore */ }
    throw e;
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
