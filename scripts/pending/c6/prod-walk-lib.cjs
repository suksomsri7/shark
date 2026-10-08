// prod-walk-lib.cjs — shared loader / guards / manifest for the C6.3 production walk-through (owner order 8 Oct 2026, option "ก").
// 🔴 Reads `.env` IN-PROCESS and never prints a URL, a token or a cookie value. No SET on the pooler connection (BEGIN READ ONLY … ROLLBACK).
// 🔴 Hard-coded scope: ONE tenant, ONE CRM system. Every script must call `guard(client)` before doing anything else.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");

const C = Object.freeze({
  TENANT_ID: "cmtazbpjh000004lcjikxju2i",
  TENANT_SLUG: "siam-dive-center",
  CRM_SYSTEM_ID: "cmtdvoopr000004jpf1vaply9",
  EXPECT_OWNER_COUNT: 1, // the tenant has exactly ONE real membership (OWNER) before setup
  PROD_HOST_MARK: "ep-royal-night", // same fragment as scripts/acc-v2-env.mts (the QC scripts REFUSE it; these scripts REQUIRE it)
  BASE: "https://shark.in.th",
  MARK: "qc-prod-", // every temp row carries this prefix in a human-readable column
  EMAIL_DOMAIN: "qc-prod.invalid", // RFC 6761 reserved TLD — can never be delivered
  UA: "qc-prod-walk", // Session.userAgent / PortalSession.userAgent tag
  DIR: "/tmp/c63-walk",
  MANIFEST: "/tmp/c63-walk/manifest.json",
  SESSION_TTL_MIN: 180, // short expiry for every minted session
});

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

/** Connect to prod (pooled DATABASE_URL by default; `--direct` = DIRECT_URL). Refuses any host that is not the prod mark. */
async function connect({ direct = process.argv.includes("--direct") } = {}) {
  const env = loadEnv();
  const url = direct ? env.DIRECT_URL : env.DATABASE_URL;
  if (!url) throw new Error(`no ${direct ? "DIRECT_URL" : "DATABASE_URL"} in .env`);
  let host = "";
  try { host = new URL(url).hostname; } catch { throw new Error("database url is not parseable"); }
  if (!host.includes(C.PROD_HOST_MARK)) throw new Error(`REFUSE: database host is not the production host mark (${C.PROD_HOST_MARK}…) — these scripts are written for the pilot tenant on prod only`);
  const client = new Client({ connectionString: url, statement_timeout: 30000, application_name: "c63-prod-walk" });
  await client.connect();
  return { client, hostMark: `${host.slice(0, 14)}…`, which: direct ? "DIRECT_URL" : "DATABASE_URL" };
}

/** Scope guard: tenant slug, CRM system (type, tenant, active, uiVersion 2) and the number of REAL memberships must match the expectation. */
async function guard(client, { allowTempMembers = true } = {}) {
  const t = await client.query(`SELECT id, slug, status::text AS status FROM "Tenant" WHERE id = $1`, [C.TENANT_ID]);
  if (t.rowCount !== 1 || t.rows[0].slug !== C.TENANT_SLUG) throw new Error("REFUSE: tenant id/slug do not match the expectation");
  if (t.rows[0].status !== "ACTIVE") throw new Error(`REFUSE: tenant status is ${t.rows[0].status}`);
  const s = await client.query(`SELECT id, type::text AS type, active, settings->'crm'->>'uiVersion' AS ui FROM "AppSystem" WHERE id = $1 AND "tenantId" = $2`, [C.CRM_SYSTEM_ID, C.TENANT_ID]);
  if (s.rowCount !== 1 || s.rows[0].type !== "CRM" || s.rows[0].active !== true) throw new Error("REFUSE: pilot CRM system not found / not CRM / not active");
  if (s.rows[0].ui !== "2") throw new Error(`REFUSE: pilot CRM system uiVersion is ${s.rows[0].ui} (expected 2)`);
  const m = await client.query(
    `SELECT m.id, m."userId", m.role::text AS role, u.email LIKE $2 AS temp
       FROM "Membership" m JOIN "User" u ON u.id = m."userId" WHERE m."tenantId" = $1`,
    [C.TENANT_ID, `${C.MARK}%@${C.EMAIL_DOMAIN}`],
  );
  const real = m.rows.filter((r) => !r.temp);
  const temp = m.rows.filter((r) => r.temp);
  if (real.length !== C.EXPECT_OWNER_COUNT || real[0].role !== "OWNER") throw new Error(`REFUSE: expected exactly ${C.EXPECT_OWNER_COUNT} real membership (OWNER) — found ${real.length} (${real.map((r) => r.role).join(",")})`);
  if (!allowTempMembers && temp.length) throw new Error(`REFUSE: ${temp.length} temp membership(s) already exist — run cleanup first`);
  return { ownerUserId: real[0].userId, ownerMembershipId: real[0].id, tempMemberships: temp.length };
}

// ───────────── ids / tokens ─────────────
/** cuid-shaped id with a recognisable prefix (never collides with real cuids: "qcprod" + 19 base36 chars = 25 chars). */
function newId() {
  return "qcprod" + crypto.randomBytes(16).toString("hex").slice(0, 19);
}
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
/** Session token — NEVER stored or printed. It is re-derived in-process from the session ROW ID and a key that exists only in `.env`
 *  (HMAC-SHA256 keyed by a hash of DATABASE_URL, 32 bytes base64url = same shape as src/lib/core/hash.ts randomToken()). The manifest holds row ids only. */
function tokenFor(sessionRowId, prefix = "") {
  const env = loadEnv();
  if (!env.DATABASE_URL || env.DATABASE_URL.length < 40) throw new Error("cannot derive session tokens: DATABASE_URL missing");
  const key = crypto.createHash("sha256").update(`c63-prod-walk:v1:${env.DATABASE_URL}`).digest();
  return prefix + crypto.createHmac("sha256", key).update(String(sessionRowId)).digest("base64url");
}

// ───────────── manifest (crash-safe: appended BEFORE every insert) ─────────────
function readManifest() {
  if (!fs.existsSync(C.MANIFEST)) return null;
  return JSON.parse(fs.readFileSync(C.MANIFEST, "utf8"));
}
function writeManifest(m) {
  fs.mkdirSync(C.DIR, { recursive: true });
  const tmp = `${C.MANIFEST}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, C.MANIFEST);
  try { fs.chmodSync(C.MANIFEST, 0o600); } catch { /* best effort */ }
}
/** Record an id under a table BEFORE the row is written (or right after the UI returned the id). `phase` = setup | walk. */
function manifestAdd(m, table, id, extra = {}) {
  m.rows = m.rows || {};
  m.rows[table] = m.rows[table] || [];
  if (!m.rows[table].some((r) => r.id === id)) m.rows[table].push({ id, at: new Date().toISOString(), ...extra });
  writeManifest(m);
}

const nowIso = () => new Date().toISOString();
const log = (...a) => console.log(...a);

module.exports = { C, loadEnv, connect, guard, newId, sha256, tokenFor, readManifest, writeManifest, manifestAdd, nowIso, log };
