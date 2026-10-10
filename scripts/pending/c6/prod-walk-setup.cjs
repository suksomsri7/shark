// prod-walk-setup.cjs — temp accounts + sessions for the C6.3 production walk-through (owner order 8 Oct 2026, option "ก").
//   node scripts/pending/c6/prod-walk-setup.cjs                      # DRY-RUN (default): prints what it WOULD insert, validates columns, writes nothing
//   node scripts/pending/c6/prod-walk-setup.cjs --apply              # stage "staff": 3 users · 3 memberships · 1 team · 2 team members · 4 sessions
//   node scripts/pending/c6/prod-walk-setup.cjs --stage portal [--apply] --company <CrmCompany.id> --contact <CrmContact.id>
//                                                                     # stage "portal": 1 CrmPortalAccess + 1 PortalSession for a qc-prod company/contact the walk created
// 🔴 Writes ONLY with --apply. Every id is appended to /tmp/c63-walk/manifest.json BEFORE its INSERT (crash-safe cleanup).
// 🔴 Plain SQL on purpose: the app services would also emit `team.updated` outbox events + AuditLog rows (src/lib/core/teams.ts:118-128,157) and
//    the staff-invite service needs an HrEmployee row (src/lib/staff/service.ts:357-366) — neither is wanted for throw-away accounts.
// 🔴 Never prints a token. Tokens are derived in-process from the session row id (lib tokenFor) — the manifest holds row ids only.
"use strict";
const { C, connect, guard, newId, sha256, tokenFor, readManifest, writeManifest, manifestAdd, nowIso } = require("./prod-walk-lib.cjs");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const STAGE = argOf("--stage") || "staff";

// Permission sets = the QC roles (scripts/seed-crm-qc.mts:131-137): team lead "nok" and staff "thana" hold 8 explicit keys and NO company keys
// (⇒ companies pages are 404 for them by design, C5.5-fix2). MANAGER needs no keys (src/lib/modules/crm/access.ts:77 — all but the 5 owner-only keys).
const STAFF_KEYS = { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.deal.read": true, "crm.deal.create": true, "crm.deal.move": true, "crm.activity.create": true, "crm.activity.complete": true };
const ROLES = [
  { key: "manager", role: "MANAGER", permissions: {}, name: "qc-prod-manager" },
  { key: "lead", role: "STAFF", permissions: STAFF_KEYS, name: "qc-prod-teamlead" },
  { key: "staff", role: "STAFF", permissions: STAFF_KEYS, name: "qc-prod-staff" },
];
const TEAM_NAME = "qc-prod-team-a";

/** Check that every NOT NULL column without a default is supplied (catches schema drift before any write). */
async function checkColumns(c, table, supplied) {
  const r = await c.query(`SELECT column_name AS c, is_nullable AS n, column_default AS d FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
  if (!r.rowCount) throw new Error(`table ${table} not found`);
  const all = new Set(r.rows.map((x) => x.c));
  const unknown = supplied.filter((k) => !all.has(k));
  const missing = r.rows.filter((x) => x.n === "NO" && x.d === null && !supplied.includes(x.c)).map((x) => x.c);
  if (unknown.length || missing.length) throw new Error(`${table}: unknown columns [${unknown}] · required-but-missing [${missing}]`);
}

/** One planned insert. `show` = the same row with secrets masked (what the dry-run prints). */
function plan(table, row, show) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${cols.map((k) => `"${k}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`;
  return { table, cols, sql, values: cols.map((k) => row[k]), id: row.id, show: show ?? row };
}

(async () => {
  const { client: c, hostMark, which } = await connect();
  console.log(`prod-walk-setup · stage ${STAGE} · ${APPLY ? "APPLY (WRITES)" : "DRY-RUN (no write)"} · ${which} · host ${hostMark} · ${nowIso()}`);
  await c.query("BEGIN READ ONLY");
  const g = await guard(c, { allowTempMembers: STAGE !== "staff" });
  const now = new Date();
  const exp = new Date(now.getTime() + C.SESSION_TTL_MIN * 60_000);
  const plans = [];
  let m = readManifest();

  if (STAGE === "staff") {
    if (m && m.rows && Object.values(m.rows).some((a) => a.length)) throw new Error(`REFUSE: ${C.MANIFEST} already lists rows — run prod-walk-cleanup first (or move the manifest away after a verified cleanup)`);
    const dupUsers = await c.query(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${C.MARK}%@${C.EMAIL_DOMAIN}`]);
    const dupTeam = await c.query(`SELECT count(*)::int AS n FROM "Team" WHERE "tenantId" = $1 AND name = $2`, [C.TENANT_ID, TEAM_NAME]);
    if (dupUsers.rows[0].n || dupTeam.rows[0].n) throw new Error(`REFUSE: temp rows already exist (users ${dupUsers.rows[0].n} · team ${dupTeam.rows[0].n}) — run cleanup first`);
    const sys = await c.query(`SELECT settings::text AS settings, "updatedAt"::text AS "updatedAt", md5(s::text) AS hash FROM "AppSystem" s WHERE id = $1 AND "tenantId" = $2`, [C.CRM_SYSTEM_ID, C.TENANT_ID]);
    const users = {};
    for (const r of ROLES) {
      const uid = newId();
      users[r.key] = uid;
      plans.push(plan("User", { id: uid, email: `${C.MARK}${r.key}@${C.EMAIL_DOMAIN}`, name: r.name, prefs: "{}", createdAt: now, updatedAt: now }));
      plans.push(plan("Membership", { id: newId(), userId: uid, tenantId: C.TENANT_ID, role: r.role, unitAccess: "[]", permissions: JSON.stringify(r.permissions), invitedAt: now, acceptedAt: now, createdAt: now, updatedAt: now }));
    }
    const teamId = newId();
    plans.push(plan("Team", { id: teamId, tenantId: C.TENANT_ID, name: TEAM_NAME, leadUserId: users.lead, unitIds: "{}", description: "qc-prod- temporary team (C6.3 walk) — safe to delete", createdAt: now, updatedAt: now }));
    plans.push(plan("TeamMember", { id: newId(), tenantId: C.TENANT_ID, teamId, userId: users.lead, role: "LEAD", acceptingLeads: true, joinedAt: now }));
    plans.push(plan("TeamMember", { id: newId(), tenantId: C.TENANT_ID, teamId, userId: users.staff, role: "MEMBER", acceptingLeads: true, joinedAt: now }));
    const sessions = {};
    for (const [key, userId] of [["owner", g.ownerUserId], ...Object.entries(users)]) {
      const sid = newId();
      sessions[key] = sid;
      const row = { id: sid, userId, tokenHash: sha256(tokenFor(sid)), userAgent: C.UA, expiresAt: exp, idleExpiresAt: exp, createdAt: now };
      plans.push(plan("Session", row, { ...row, tokenHash: "(sha256 of a fresh random token — not printed)", _for: key }));
    }
    for (const p of plans) await checkColumns(c, p.table, p.cols);
    await c.query("ROLLBACK");

    const perTable = {};
    for (const p of plans) perTable[p.table] = (perTable[p.table] || 0) + 1;
    console.log(`\nrows to insert: ${plans.length} → ${Object.entries(perTable).map(([t, n]) => `${t} ${n}`).join(" · ")}`);
    for (const p of plans) console.log(`  ${p.table}  ${JSON.stringify(p.show)}`);
    console.log(`\nowner session: for the REAL owner's user (${g.ownerUserId.slice(0, 8)}…), userAgent "${C.UA}", expires ${exp.toISOString()} (the owner's own ${"sessions"} are not touched)`);
    console.log(`AppSystem(pilot CRM) row hash now ${sys.rows[0].hash} · settings + updatedAt are saved into the manifest so cleanup can restore them byte-for-byte`);
    if (!APPLY) { console.log("\nDRY-RUN — nothing written, manifest untouched. Re-run with --apply to write."); await c.end(); return; }

    m = { startedAt: nowIso(), tenantId: C.TENANT_ID, crmSystemId: C.CRM_SYSTEM_ID, ownerUserId: g.ownerUserId, users, teamId, sessions, touchedSettingsPaths: [], sessionExpiresAt: exp.toISOString(), appSystemBefore: { settings: sys.rows[0].settings, updatedAt: sys.rows[0].updatedAt, hash: sys.rows[0].hash }, rows: {}, ui: [] };
    writeManifest(m);
    for (const p of plans) manifestAdd(m, p.table, p.id, { phase: "setup" }); // ids on disk BEFORE the first INSERT
    await c.query("BEGIN");
    try {
      for (const p of plans) { const r = await c.query(p.sql, p.values); if (r.rowCount !== 1) throw new Error(`${p.table}: inserted ${r.rowCount}`); }
      const chk = await c.query(`SELECT count(*)::int AS n FROM "Membership" WHERE "tenantId" = $1`, [C.TENANT_ID]);
      if (chk.rows[0].n !== C.EXPECT_OWNER_COUNT + ROLES.length) throw new Error(`membership count after insert = ${chk.rows[0].n}`);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw new Error(`setup rolled back (nothing written): ${e.message}`); }
    m.setupDoneAt = nowIso(); writeManifest(m);
    console.log(`\nAPPLIED ${plans.length} rows · manifest ${C.MANIFEST}`);
  } else if (STAGE === "portal") {
    if (!m || !m.setupDoneAt) throw new Error("REFUSE: no manifest from the staff stage");
    const companyId = argOf("--company"), contactId = argOf("--contact");
    if (!companyId || !contactId) throw new Error("usage: --stage portal --company <id> --contact <id>");
    // both rows must be temp rows of this walk: tenant + pilot system + qc-prod- marker + listed in the manifest + linked to each other (current link)
    const ok = await c.query(
      `SELECT co.id FROM "CrmCompany" co JOIN "CrmContact" ct ON ct.id = $3 JOIN "CrmCompanyContact" l ON l."companyId" = co.id AND l."contactId" = ct.id AND l."endedAt" IS NULL
        WHERE co.id = $2 AND co."tenantId" = $1 AND ct."tenantId" = $1 AND co."systemId" = $4 AND ct."systemId" = $4 AND co.name LIKE $5 AND ct.name LIKE $5`,
      [C.TENANT_ID, companyId, contactId, C.CRM_SYSTEM_ID, `${C.MARK}%`]);
    if (ok.rowCount !== 1) throw new Error("REFUSE: company/contact are not a linked qc-prod- pair of the pilot CRM system");
    const listed = (t, id) => (m.rows[t] || []).some((r) => r.id === id);
    if (!listed("CrmCompany", companyId) || !listed("CrmContact", contactId)) throw new Error("REFUSE: company/contact are not in the manifest");
    const portal = await c.query(`SELECT settings->'crm'->'portal'->>'enabled' AS enabled FROM "AppSystem" WHERE id = $1`, [C.CRM_SYSTEM_ID]);
    if (portal.rows[0].enabled !== "true") console.log("⚠️  settings.crm.portal.enabled is not true — the portal session will be rejected until the owner step of the walk enables it (customer-session.ts:664)");
    const accessId = newId();
    const psid = newId();
    const token = tokenFor(psid, "cp_"); // PORTAL_TOKEN_PREFIX (src/lib/modules/member/customer-session.ts:558) · tokenHash = sha256(token) (:694)
    plans.push(plan("CrmPortalAccess", { id: accessId, tenantId: C.TENANT_ID, systemId: C.CRM_SYSTEM_ID, companyId, contactId, role: "APPROVE", invitedById: g.ownerUserId, invitedAt: now, acceptedAt: now, loginMethods: "{EMAIL_OTP}" }));
    const srow = { id: psid, tenantId: C.TENANT_ID, portalAccessId: accessId, crmContactId: contactId, crmSystemId: C.CRM_SYSTEM_ID, tokenHash: sha256(token), userAgent: C.UA, expiresAt: exp, createdAt: now };
    plans.push(plan("PortalSession", srow, { ...srow, tokenHash: "(not printed)" }));
    for (const p of plans) await checkColumns(c, p.table, p.cols);
    await c.query("ROLLBACK");
    console.log(`\nrows to insert: 2 → CrmPortalAccess 1 · PortalSession 1 (no invitation e-mail: the row is inserted already accepted, portal.invite() is NOT called)`);
    for (const p of plans) console.log(`  ${p.table}  ${JSON.stringify(p.show)}`);
    if (!APPLY) { console.log("\nDRY-RUN — nothing written."); await c.end(); return; }
    m.sessions.customer = psid; m.portal = { accessId, companyId, contactId }; writeManifest(m);
    for (const p of plans) manifestAdd(m, p.table, p.id, { phase: "setup-portal" });
    await c.query("BEGIN");
    try { for (const p of plans) { const r = await c.query(p.sql, p.values); if (r.rowCount !== 1) throw new Error(`${p.table}: inserted ${r.rowCount}`); } await c.query("COMMIT"); }
    catch (e) { await c.query("ROLLBACK"); throw new Error(`portal stage rolled back: ${e.message}`); }
    console.log("\nAPPLIED 2 rows");
  } else throw new Error(`unknown stage ${STAGE}`);
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
