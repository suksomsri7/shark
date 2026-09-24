// QC — CRM v2 WO C3.0: migration `crm_v2_c` (every table of phase C3) + scope registry (F1/F8) + the schema the C3.1–C3.9 briefs need
// Oracle writer · the C3.0 builder must NOT touch this file · QC database only (.env.qc / .env.qc2 — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.0.mts
//       `--force-run` = run every check while prisma/migrations/*_crm_v2_c is absent: the static SQL parser self-tests (T0.x, on the
//       synthetic SQL embedded below) and the DB-helper positive controls go green, everything else is RED for the right reason
//       ("migration absent") — it proves the file never crashes. Without the flag and without the migration ⇒ SKIPPED.
// requires: crm-seed   (reads nothing seeded; the only writes are inside transactions that are ROLLED BACK)
//
// SOURCES: crm-brief-C3.0.md (the table list · `CrmCommission` amounts BigInt + unique [dealId, ruleId, userId, refId] ·
//   `CrmPortalAccess` + inviteTokenHash/inviteExpiresAt · `HrPayAdjustment.crmCommissionId` · **VERIFIED: `CustomerSession.customerId`
//   is NOT NULL ⇒ do NOT alter that table, add the sibling `PortalSession`** per R-C.5 · report schedules need NO table per R-E.6) ·
//   crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.1 exactly three migrations a/b/c · R-C.2 model names · R-C.5 PortalSession ·
//   R-E.6 settings.crm.reportSchedules[]) · MASTER-PLAN §2.5 (migration rules: additive only · created with `migrate dev --create-only`
//   on QC · every line read by eye · no DROP / destructive ALTER TYPE / NOT NULL without default / UNIQUE on a table that may hold
//   duplicates) §3 (D-gates) §4 (X groups) §6 row C3.0 · CRM-RUN §4 (Prisma CLI ONLY through `scripts/qc-prisma.sh`; prod migrates
//   inside `scripts/vercel-build.sh`, which is how `crm_v2_a`/`crm_v2_b` were confirmed) · scripts/qc-crm-c2.0.mts (the model for this
//   file) · blueprint §4.3 (groups "ทีมขาย" = CrmVisibilityPolicy · CrmQuota · CrmCommissionRule/Commission and "portal" =
//   CrmPortalAccess · CrmPortalRequest) §4.2 (the enum list) §5.9 §11.6 §11.8 §15 (C15 revised → PortalSession) ·
//   the downstream briefs that constrain the schema: C3.1 (reports read StageHistory/CrmDealPayment/CrmCommission — no new table) ·
//   C3.2 (CrmQuota + `crm.quota.reached` once per owner+period+threshold ⇒ the quota unique) · C3.3 (CrmCommissionRule/CrmCommission,
//   proportional partial payments, reversal rows, `HrPayAdjustment.crmCommissionId`) · C3.5 (portal: invite token hashed + 7-day expiry,
//   sessions, requests, revoke kills sessions) · C3.6 (integrations status lives in `settings.integrations` — no table) ·
//   C3.7 (mobile — no schema) · C3.8 (REST set three — no schema) · C3.9 (PDPA erase/export must be able to reach every new table).
//
// 🔴 MIGRATION SAFETY (S1.10): `crm_v2_c` must contain NO statement that can fail on existing production data — no UNIQUE or NOT NULL
//   over existing rows, no CHECK, no FK whose validation reads existing rows, no ADD VALUE of a value that already exists. A unique on an
//   OLD table is allowed only when it is partial over a column added in this same migration WITHOUT a default (every existing row is NULL
//   ⇒ the index is empty ⇒ it can never fail) — that is exactly `HrPayAdjustment.crmCommissionId`. Everything that must hold over
//   existing rows belongs to **C6.1**, after a read-only duplicate count on prod (see the addendum's C6.1 list).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   ONE migration dir `<yyyymmddHHMMSS>_crm_v2_c` (14-digit real timestamp, sorts after *_crm_v2_b, timestamp not shared) — additive
//   only: CREATE TYPE · CREATE TABLE · CREATE [UNIQUE] INDEX · ALTER TABLE … ADD COLUMN (nullable, or a non-volatile DEFAULT) ·
//   ALTER TABLE … ADD CONSTRAINT FOREIGN KEY (only on a NEW table). No DROP / RENAME / ALTER COLUMN / UPDATE|INSERT|DELETE / trigger /
//   function. No `ALTER TYPE … ADD VALUE` is needed at all (every enum of phase C3 is brand new — S1.5 keeps the door shut anyway).
//   NEW ENUMS (6): CrmQuotaOwner{USER,TEAM} · CrmCommissionBasis{PAID,WON} · CrmCommissionKind{PCT,FIXED,TIERED} ·
//     CrmCommissionStatus{PENDING,APPROVED,PAID,REVERSED,REJECTED} · CrmPortalRole{VIEW,APPROVE,PAY,ADMIN} ·
//     CrmPortalRequestKind{ISSUE,CONTACT_CHANGE,PROFILE_CHANGE,DOCUMENT_REQUEST}
//   NEW TABLES (6 · model name = table name · tenantId NOT NULL on every one · exact columns in NEW_TABLES below):
//     CrmQuota · CrmCommissionRule · CrmCommission · CrmPortalAccess · CrmPortalRequest · PortalSession
//   NEW COLUMN ON AN EXISTING TABLE (exactly one): `HrPayAdjustment.crmCommissionId text NULL` (no default) + a PARTIAL UNIQUE
//     ("crmCommissionId") WHERE "crmCommissionId" IS NOT NULL — one commission can be paid through at most one payroll adjustment,
//     and the index is empty on existing rows so `migrate deploy` on prod cannot fail. NO foreign key (HR must not depend on CRM).
//   NOT ADDED (each asserted): `CustomerSession` is UNTOUCHED (customerId is NOT NULL — R-C.5 sends the portal to PortalSession) ·
//     no schedule/recipient column on `ReportDef` (R-E.6 keeps them in `settings.crm.reportSchedules[]`) · no `MemberSavedView` change
//     (objectKey/teamId arrived with crm_v2_a) · no `PosSale.dealId` (C29) · no unique `AccountContact(systemId, partyId)` and no
//     "one primary contact per company" unique (both C6.1) · no FK from `CrmCommission.dealId` to `CrmDeal` (a deleted deal must not
//     cascade away paid-commission history) · no plaintext token column anywhere.
//   prisma/schema: every new model declared with no `@@map` · src/lib/core/scope.ts: every new model registered — axis "system" when the
//   table has systemId, else "tenant" (PortalSession is tenant-scoped: its CRM system lives in `crmSystemId`).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 33 checks = T0 3 (parser self-tests) · S1 9 (one dir/name · applied + checksum · additive only · existing-table
//   safety · no ADD VALUE misuse · UNIQUE rules · the 6 tables · touched-existing allowlist · schema↔DB in sync) · S2 1 (the 6 enums) ·
//   S3 8 (the shape of each new table · the HR column + its partial unique · the NOT-ADDED list) · S4 3 (prisma models · scope.ts ·
//   fitness F1/F8) · S5 2 (uiVersion-1 / v1 safety) · X 6 (X1 tenantId · X3 defaults+dedupe · X4 keys · X7 hashed tokens ·
//   X8 no raw IP/PII · X10 no secret column) · ERR/CLEAN 1. n/a: X2 (no op/tool) · X5 (no job row) · X6 (no input surface) ·
//   X9 (no mutation) — schema-only work order.
// HOUSE RULES: SKIP guard before any DB connection · the only writes are inside a ROLLED BACK transaction · Prisma CLI only through
//   `scripts/qc-prisma.sh` (never `migrate dev`) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const FORCE = process.argv.includes("--force-run");
const MIG_ROOT = "prisma/migrations";
const SCHEMA_DIR = "prisma/schema";
const SCOPE_FILE = "src/lib/core/scope.ts";
const allMigDirs = existsSync(MIG_ROOT) ? readdirSync(MIG_ROOT).filter((d) => /^\d+_/.test(d)).sort() : [];
const cDirs = allMigDirs.filter((d) => /_crm_v2_c$/.test(d));
const migDir: string | undefined = cDirs[0];
if (!migDir && !FORCE) {
  console.log("⚠️  SKIPPED — WO C3.0 not built yet: no prisma/migrations/*_crm_v2_c (run with --force-run to exercise the parsers)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);
const TAG = `qc-c30-${randomBytes(3).toString("hex")}`;

// ════════════════════════════════ static SQL analysis (pure — T0.x exercises it on synthetic SQL) ════════════════════════════════
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const nx = sql[i + 1];
    if (ch === "-" && nx === "-") { const jj = sql.indexOf("\n", i); i = jj < 0 ? n : jj; cur += " "; continue; }
    if (ch === "/" && nx === "*") { const jj = sql.indexOf("*/", i + 2); i = jj < 0 ? n : jj + 2; cur += " "; continue; }
    if (ch === "'" || ch === '"') {
      let jj = i + 1;
      while (jj < n) { if (sql[jj] === ch) { if (sql[jj + 1] === ch) { jj += 2; continue; } break; } jj++; }
      cur += sql.slice(i, jj + 1); i = jj + 1; continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (m) { const t = m[0]; const jj = sql.indexOf(t, i + t.length); const end = jj < 0 ? n : jj + t.length; cur += sql.slice(i, end); i = end; continue; }
    }
    if (ch === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0; let cur = ""; let q: string | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unq = (s: string) => s.trim().replace(/^"|"$/g, "");
type IdxInfo = { name: string; table: string; unique: boolean; cols: string[]; where: string | null };
type Violation = { rule: string; stmt: string };
type Analysis = {
  statements: string[]; violations: Violation[]; newTables: Set<string>; newEnums: Map<string, string[]>;
  addedEnumValues: [string, string][]; addedCols: Map<string, Map<string, string>>; indexes: IdxInfo[];
  touchedExisting: Set<string>; fks: { table: string; ref: string }[]; kinds: Record<string, number>;
};
/** the ONLY existing objects crm_v2_c may touch */
const ALLOWED_EXISTING_TABLES = new Set(["HrPayAdjustment"]);
const VOLATILE_DEFAULT = /(gen_random_uuid|uuid_generate_v\d|random\s*\(|clock_timestamp|timeofday|nextval\s*\()/i;

function analyzeSql(sql: string): Analysis {
  const statements = splitSql(sql);
  const violations: Violation[] = [];
  const newTables = new Set<string>();
  const newEnums = new Map<string, string[]>();
  const addedEnumValues: [string, string][] = [];
  const addedCols = new Map<string, Map<string, string>>();
  const indexes: IdxInfo[] = [];
  const touchedExisting = new Set<string>();
  const fks: { table: string; ref: string }[] = [];
  const kinds: Record<string, number> = {};
  const bump = (k: string) => { kinds[k] = (kinds[k] ?? 0) + 1; };
  const bad = (rule: string, stmt: string) => violations.push({ rule, stmt: short(stmt, 160) });
  for (const st of statements) {
    const s = st.replace(/^\s+/, "");
    if (/^CREATE\s+TYPE\s+"?(\w+)"?\s+AS\s+ENUM/i.test(s)) {
      bump("CREATE TYPE");
      const name = unq(/^CREATE\s+TYPE\s+("?\w+"?)/i.exec(s)?.[1] ?? "");
      const vals = [...(s.match(/'([^']+)'/g) ?? [])].map((x) => x.slice(1, -1));
      newEnums.set(name, vals);
      continue;
    }
    if (/^ALTER\s+TYPE\b/i.test(s)) {
      const m = /^ALTER\s+TYPE\s+("?\w+"?)\s+ADD\s+VALUE\s+'([^']+)'/i.exec(s);
      if (!m) { bad("destructive ALTER TYPE", s); continue; }
      bump("ALTER TYPE ADD VALUE");
      addedEnumValues.push([unq(m[1]), m[2]]);
      continue;
    }
    if (/^CREATE\s+TABLE\b/i.test(s)) {
      bump("CREATE TABLE");
      const name = unq(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i.exec(s)?.[1]?.replace(/^public\./, "") ?? "");
      newTables.add(name);
      const body = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
      const cols = new Map<string, string>();
      for (const part of splitTop(body)) {
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(part.trim())) {
          if (/^CHECK\b/i.test(part.trim())) bad("CHECK constraint", part);
          continue;
        }
        const mm = /^("?[\w]+"?)\s+(.+)$/.exec(part.trim());
        if (mm) cols.set(unq(mm[1]), mm[2]);
      }
      addedCols.set(name, cols);
      continue;
    }
    if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s)) {
      bump(/UNIQUE/i.test(s.slice(0, 20)) ? "CREATE UNIQUE INDEX" : "CREATE INDEX");
      const m = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s+ON\s+("?[\w.]+"?)\s*(?:USING\s+\w+\s*)?\((.*?)\)\s*(?:WHERE\s+(.*))?$/i.exec(s);
      if (m) {
        const table = unq(m[3].replace(/^public\./, ""));
        indexes.push({ name: unq(m[2]), table, unique: !!m[1], cols: splitTop(m[4]).map((x) => unq(x.replace(/\s+(ASC|DESC|NULLS\s+\w+).*$/i, ""))), where: m[5]?.trim() ?? null });
        if (!newTables.has(table)) touchedExisting.add(table);
      }
      continue;
    }
    if (/^ALTER\s+TABLE\b/i.test(s)) {
      const table = unq(/^ALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w.]+"?)/i.exec(s)?.[1]?.replace(/^public\./, "") ?? "");
      if (!newTables.has(table)) touchedExisting.add(table);
      if (/\bDROP\b/i.test(s)) { bad("DROP", s); continue; }
      if (/\bRENAME\b/i.test(s)) { bad("RENAME", s); continue; }
      if (/ALTER\s+(COLUMN\s+)?"?\w+"?\s+(SET|TYPE|DROP)/i.test(s)) { bad("ALTER COLUMN", s); continue; }
      if (/ADD\s+COLUMN/i.test(s)) {
        bump("ADD COLUMN");
        const m = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)\s+(.+)$/i.exec(s);
        if (m) {
          const col = unq(m[1]);
          const rest = m[2];
          const cols = addedCols.get(table) ?? new Map<string, string>();
          cols.set(col, rest);
          addedCols.set(table, cols);
          if (/NOT\s+NULL/i.test(rest) && !/DEFAULT/i.test(rest) && !newTables.has(table)) bad("NOT NULL without default on an existing table", s);
          const def = /DEFAULT\s+([^,]+?)(?:\s+NOT\s+NULL)?$/i.exec(rest)?.[1] ?? "";
          if (def && VOLATILE_DEFAULT.test(def) && !newTables.has(table)) bad("volatile default on an existing table (table rewrite)", s);
        }
        continue;
      }
      if (/ADD\s+CONSTRAINT/i.test(s)) {
        if (/FOREIGN\s+KEY/i.test(s)) {
          bump("ADD FK");
          const ref = unq(/REFERENCES\s+("?[\w.]+"?)/i.exec(s)?.[1]?.replace(/^public\./, "") ?? "");
          fks.push({ table, ref });
          if (!newTables.has(table)) bad("FK on an existing table (validation reads existing rows — C6.1)", s);
          continue;
        }
        if (/UNIQUE/i.test(s)) { bump("ADD UNIQUE"); if (!newTables.has(table)) bad("UNIQUE constraint on an existing table", s); continue; }
        if (/CHECK/i.test(s)) { bad("CHECK constraint", s); continue; }
        bad("unknown ADD CONSTRAINT", s);
        continue;
      }
      bad("unknown ALTER TABLE", s);
      continue;
    }
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(s)) { bad("data statement", s); continue; }
    if (/^(DROP|CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER|VIEW|RULE))\b/i.test(s)) { bad("DROP / function / trigger / view", s); continue; }
    if (/^(BEGIN|COMMIT|SET|COMMENT)\b/i.test(s)) { bump("noise"); continue; }
    bad("unknown statement", s);
  }
  // UNIQUE index rules: only on a new table, or partial over a column added here without default
  for (const ix of indexes) {
    if (!ix.unique) continue;
    if (newTables.has(ix.table)) continue;
    const added = addedCols.get(ix.table);
    const allAddedHere = ix.cols.every((c0) => added?.has(c0));
    const noDefault = ix.cols.every((c0) => !/DEFAULT/i.test(added?.get(c0) ?? "DEFAULT"));
    if (!(allAddedHere && noDefault && ix.where)) violations.push({ rule: "UNIQUE over existing rows (belongs to C6.1)", stmt: short(ix.name, 160) });
  }
  return { statements, violations, newTables, newEnums, addedEnumValues, addedCols, indexes, touchedExisting, fks, kinds };
}
/** every ADD VALUE of this migration must not be used as a default / cast / predicate in the same file */
function enumValueMisuse(an: Analysis, sql: string): string[] {
  const out: string[] = [];
  for (const [type, val] of an.addedEnumValues) {
    const re = new RegExp(`(DEFAULT\\s+'${val}'|'${val}'::\\s*"?${type}"?|=\\s*'${val}')`, "i");
    if (re.test(sql)) out.push(`${type}.${val}`);
  }
  return out;
}
function nameProblems(dirs: string[], d: string | undefined): string[] {
  const p: string[] = [];
  const cs = dirs.filter((x) => /_crm_v2_c$/.test(x));
  if (cs.length !== 1) p.push(`${cs.length} *_crm_v2_c dirs (want exactly 1)`);
  if (d) {
    const ts = d.split("_")[0] ?? "";
    if (!/^\d{14}$/.test(ts)) p.push(`${d}: timestamp is not 14 digits`);
    else {
      const [Y, M, D, h, m, s2] = [ts.slice(0, 4), ts.slice(4, 6), ts.slice(6, 8), ts.slice(8, 10), ts.slice(10, 12), ts.slice(12, 14)].map(Number);
      if (M < 1 || M > 12 || D < 1 || D > 31 || h > 23 || m > 59 || s2 > 59 || Y < 2024) p.push(`${d}: impossible timestamp`);
    }
    const b = dirs.filter((x) => /_crm_v2_b$/.test(x)).sort().pop();
    if (!b) p.push("no *_crm_v2_b dir to sort after");
    else if (!(d > b)) p.push(`${d} does not sort after ${b}`);
    const clash = dirs.filter((x) => x !== d && x.split("_")[0] === ts);
    if (clash.length) p.push(`${d}: timestamp shared with ${clash.join(",")}`);
  }
  const stray = dirs.filter((x) => /_crm_v2_/.test(x) && !/_crm_v2_[abc]$/.test(x));
  if (stray.length) p.push(`unexpected CRM v2 migration(s): ${stray.join(",")} (R-C.1: exactly a/b/c)`);
  return p;
}

// ════════════════════════════════ contract data ════════════════════════════════
const TX = "text", I4 = "int4", I8 = "int8", BO = "bool", TA = "_text";
const TS = ["timestamp", "timestamptz"], JS = ["jsonb", "json"];
type ColSpec = { udt?: string | string[]; nn?: boolean; def?: string };
type TableSpec = { cols: Record<string, ColSpec>; unique?: string[][]; partialUnique?: string[][]; index?: string[][]; why: string };
const c = (udt?: string | string[], nn?: boolean, def?: string): ColSpec => ({ udt, nn, def });
const tenantCols = { tenantId: c(TX, true) };
const sysCols = { tenantId: c(TX, true), systemId: c(TX, true) };
const NEW_ENUMS: Record<string, string[]> = {
  CrmQuotaOwner: ["USER", "TEAM"],
  CrmCommissionBasis: ["PAID", "WON"],
  CrmCommissionKind: ["PCT", "FIXED", "TIERED"],
  CrmCommissionStatus: ["PENDING", "APPROVED", "PAID", "REVERSED", "REJECTED"],
  CrmPortalRole: ["VIEW", "APPROVE", "PAY", "ADMIN"],
  CrmPortalRequestKind: ["ISSUE", "CONTACT_CHANGE", "PROFILE_CHANGE", "DOCUMENT_REQUEST"],
};
const NEW_TABLES: Record<string, TableSpec> = {
  CrmQuota: {
    why: "§4.3 ทีมขาย + C3.2 (one target per owner per period — the unique makes `crm.quota.reached` a conditional insert)",
    cols: { ...sysCols, ownerType: c("CrmQuotaOwner", true), ownerId: c(TX, true), periodKey: c(TX, true), targetSatang: c(I8, true), targetDeals: c(I4, false), targetActivities: c(I4, false), note: c(TX, false), createdAt: c(TS, true) },
    unique: [["systemId", "ownerType", "ownerId", "periodKey"]],
  },
  CrmCommissionRule: {
    why: "§4.3 + C3.3 (basis PAID default · PCT/FIXED/TIERED in `config` · scope pipeline/team/products · split · payout delay)",
    cols: { ...sysCols, name: c(TX, true), basis: c("CrmCommissionBasis", true, "PAID"), kind: c("CrmCommissionKind", true), config: c(JS, true), pipelineId: c(TX, false), teamId: c(TX, false), productIds: c(TA, true, "[]"), minDealSatang: c(I8, false), splitCollaboratorsBp: c(I4, true, "0"), payoutDelayDays: c(I4, true, "0"), active: c(BO, true, "true"), sortOrder: c(I4, true, "0"), createdAt: c(TS, true) },
    index: [["systemId", "active"]],
  },
  CrmCommission: {
    why: "§4.3 + C3.3 (amounts BigInt · the 4-column unique is what makes a replayed payment event one commission row)",
    cols: { ...sysCols, dealId: c(TX, true), ruleId: c(TX, true), userId: c(TX, true), amountSatang: c(I8, true), basisSatang: c(I8, true), basis: c("CrmCommissionBasis", true), status: c("CrmCommissionStatus", true, "PENDING"), periodKey: c(TX, true), approvalRequestId: c(TX, false), hrPayAdjustmentId: c(TX, false), refType: c(TX, false), refId: c(TX, true, ""), reversedOfId: c(TX, false), note: c(TX, false), createdAt: c(TS, true), decidedAt: c(TS, false) },
    unique: [["dealId", "ruleId", "userId", "refId"]],
    index: [["userId", "periodKey"], ["systemId", "status"]],
  },
  CrmPortalAccess: {
    why: "§4.3 portal + C3.5 (invite: single-use HASHED token + 7-day expiry · revoke kills sessions)",
    cols: { ...sysCols, companyId: c(TX, true), contactId: c(TX, true), role: c("CrmPortalRole", true, "VIEW"), invitedById: c(TX, false), invitedAt: c(TS, true), acceptedAt: c(TS, false), lastLoginAt: c(TS, false), revokedAt: c(TS, false), loginMethods: c(TA, true, "[]"), inviteTokenHash: c(TX, false), inviteExpiresAt: c(TS, false) },
    unique: [["companyId", "contactId"], ["inviteTokenHash"]],
    index: [["contactId"]],
  },
  CrmPortalRequest: {
    why: "§4.3 portal + C3.5 (issue → kanban card or plain request · CONTACT_CHANGE/PROFILE_CHANGE → approval)",
    cols: { ...sysCols, companyId: c(TX, true), contactId: c(TX, true), kind: c("CrmPortalRequestKind", true), payload: c(JS, true), status: c(TX, true, "PENDING"), kanbanCardId: c(TX, false), approvalRequestId: c(TX, false), decidedById: c(TX, false), decidedAt: c(TS, false), createdAt: c(TS, true) },
    index: [["companyId", "status"]],
  },
  PortalSession: {
    why: "R-C.5 / C15 revised: the sibling of CustomerSession (whose customerId is NOT NULL) — same token/cookie/limiter logic, CRM subject",
    cols: { ...tenantCols, portalAccessId: c(TX, true), crmContactId: c(TX, true), crmSystemId: c(TX, true), tokenHash: c(TX, true), userAgent: c(TX, false), ipHash: c(TX, false), expiresAt: c(TS, true), revokedAt: c(TS, false), createdAt: c(TS, true) },
    unique: [["tokenHash"]],
    index: [["portalAccessId"], ["tenantId", "expiresAt"]],
  },
};
const NEW_TABLE_NAMES = Object.keys(NEW_TABLES);
/** tables that must NOT be touched by crm_v2_c (each with the reason) */
const FORBIDDEN_TOUCH: [string, string][] = [
  ["CustomerSession", "R-C.5: customerId is NOT NULL ⇒ the portal gets the sibling table PortalSession instead"],
  ["ReportDef", "R-E.6: report schedules live in settings.crm.reportSchedules[] — no column"],
  ["MemberSavedView", "objectKey/teamId arrived with crm_v2_a"],
  ["PosSale", "decision C29: no PosSale.dealId"],
  ["AccountContact", "the unique (systemId, partyId) belongs to C6.1 after a duplicate count on prod"],
  ["CrmCompanyContact", "the one-primary unique belongs to C6.1 (ruling R1 of C2.0)"],
];

// ════════════════════════════════ T0 — parser self-tests (no DB) ════════════════════════════════
console.log(`\n═══ QC CRM v2 · C3.0 — migration crm_v2_c ═══`);
const SAMPLE_GOOD = `
-- CreateEnum
CREATE TYPE "CrmQuotaOwner" AS ENUM ('USER', 'TEAM');
-- CreateTable
CREATE TABLE "CrmQuota" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "systemId" TEXT NOT NULL, "ownerType" "CrmQuotaOwner" NOT NULL, "note" TEXT, CONSTRAINT "CrmQuota_pkey" PRIMARY KEY ("id"));
-- CreateIndex
CREATE UNIQUE INDEX "CrmQuota_systemId_ownerType_key" ON "CrmQuota"("systemId", "ownerType");
-- AlterTable
ALTER TABLE "HrPayAdjustment" ADD COLUMN "crmCommissionId" TEXT;
CREATE UNIQUE INDEX "HrPayAdjustment_crmCommissionId_key" ON "HrPayAdjustment"("crmCommissionId") WHERE "crmCommissionId" IS NOT NULL;
ALTER TABLE "CrmQuota" ADD CONSTRAINT "CrmQuota_fk" FOREIGN KEY ("systemId") REFERENCES "AppSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;
const SAMPLE_BAD: [string, RegExp][] = [
  [`ALTER TABLE "CrmDeal" DROP COLUMN "title";`, /DROP/],
  [`ALTER TABLE "CrmDeal" RENAME COLUMN "a" TO "b";`, /RENAME/],
  [`ALTER TABLE "CrmDeal" ALTER COLUMN "title" SET NOT NULL;`, /ALTER COLUMN/],
  [`ALTER TABLE "HrPayAdjustment" ADD COLUMN "x" TEXT NOT NULL;`, /NOT NULL without default/],
  [`ALTER TABLE "HrPayAdjustment" ADD COLUMN "y" TEXT NOT NULL DEFAULT gen_random_uuid();`, /volatile default/],
  [`ALTER TABLE "HrPayAdjustment" ADD CONSTRAINT "u" UNIQUE ("periodKey");`, /UNIQUE constraint on an existing table/],
  [`ALTER TABLE "HrPayAdjustment" ADD CONSTRAINT "f" FOREIGN KEY ("crmCommissionId") REFERENCES "CrmCommission"("id");`, /FK on an existing table/],
  [`UPDATE "CrmDeal" SET "title" = 'x';`, /data statement/],
  [`CREATE UNIQUE INDEX "x" ON "CrmCompanyContact"("companyId");`, /UNIQUE over existing rows/],
  [`ALTER TYPE "CrmActivitySource" RENAME VALUE 'a' TO 'b';`, /destructive ALTER TYPE/],
  [`CREATE TRIGGER t AFTER INSERT ON "CrmDeal" EXECUTE FUNCTION f();`, /trigger/],
];
{
  const split = splitSql(`SELECT 'a;b'; -- x;\nSELECT "c;d"; /* y; */ DO $x$ BEGIN END; $x$;`);
  chk("C3.0-T0.1", "the statement splitter is not fooled by a ';' inside quotes, a line comment, a block comment or a $tag$ body (3 statements)",
    split.length === 3 && /^DO \$x\$/.test(split[2] ?? ""), "3", `${split.length}: ${short(split.join(" | "), 200)}`);
  const g = analyzeSql(SAMPLE_GOOD);
  chk("C3.0-T0.2", "a GOOD synthetic migration parses with ZERO violations: 1 new enum · 1 new table · the HR column + its PARTIAL unique (allowed: the column is added here without a default) · an FK on a NEW table · HrPayAdjustment recognised as the only existing table touched",
    g.violations.length === 0 && g.newEnums.size === 1 && g.newTables.has("CrmQuota") && g.addedCols.get("HrPayAdjustment")?.has("crmCommissionId") === true && g.indexes.some((i) => i.unique && !!i.where && i.table === "HrPayAdjustment") && g.touchedExisting.has("HrPayAdjustment") && g.fks.length === 1,
    "0 violations", `violations=${g.violations.map((v) => v.rule).join(",") || "-"} enums=${g.newEnums.size} tables=${[...g.newTables].join(",")} touched=${[...g.touchedExisting].join(",")} fks=${g.fks.length}`);
  const missed: string[] = [];
  for (const [stmt, re] of SAMPLE_BAD) {
    const a = analyzeSql(stmt);
    if (!a.violations.some((v) => re.test(v.rule))) missed.push(short(stmt, 60));
  }
  chk("C3.0-T0.3", `each of the ${SAMPLE_BAD.length} BAD synthetic statements is caught by its own rule (DROP · RENAME · ALTER COLUMN · NOT NULL without default · volatile default · UNIQUE constraint on an old table · FK on an old table · data statement · UNIQUE index over existing rows · destructive ALTER TYPE · trigger)`,
    missed.length === 0, "all caught", `missed: ${missed.join(" | ") || "-"}`);
}

// ════════════════════════════════ DB ════════════════════════════════
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { Client } = (await import("pg" as string)) as { Client: new (o: Any) => Any };
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20_000 });
await db.connect();
const q = async <T = Any,>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
const migSql = migDir ? read(`${MIG_ROOT}/${migDir}/migration.sql`) : "";
const AN = analyzeSql(migSql);
const ABSENT = migDir ? "" : " (migration absent)";
console.log(`[env] DB ${host} · migration ${migDir ?? "ABSENT"}${FORCE && !migDir ? " · --force-run (C3.0 checks expected red)" : ""}\n`);

type ColInfo = { udt: string; nullable: boolean; def: string | null };
const colCache = new Map<string, Map<string, ColInfo>>();
const colInfo = async (t: string): Promise<Map<string, ColInfo>> => {
  if (colCache.has(t)) return colCache.get(t)!;
  const rows = await q<{ column_name: string; udt_name: string; is_nullable: string; column_default: string | null }>(
    `select column_name, udt_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1`, [t]);
  const m = new Map(rows.map((r) => [r.column_name, { udt: r.udt_name, nullable: r.is_nullable === "YES", def: r.column_default }]));
  colCache.set(t, m);
  return m;
};
const idxList = async (t: string): Promise<IdxInfo[]> => {
  const rows = await q<{ indexname: string; indexdef: string }>(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename=$1`, [t]);
  return rows.map((r) => {
    const m = /USING \w+ \((.*?)\)(?: WHERE (.*))?$/.exec(r.indexdef);
    return { name: r.indexname, table: t, unique: /CREATE UNIQUE INDEX/i.test(r.indexdef), cols: m ? splitTop(m[1]).map((x) => unq(x.replace(/\s+(ASC|DESC|NULLS \w+).*$/i, ""))) : [], where: m?.[2] ?? null };
  });
};
const sameCols = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const hasFullUnique = (ix: IdxInfo[], cols: string[]) => ix.some((x) => x.unique && !x.where && sameCols([...x.cols].sort(), [...cols].sort()));
const hasPartialUnique = (ix: IdxInfo[], cols: string[]) => ix.some((x) => x.unique && !!x.where && sameCols(x.cols, cols));
const hasIndex = (ix: IdxInfo[], cols: string[]) => ix.some((x) => sameCols(x.cols.slice(0, cols.length), cols));
const enumLabels = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 order by e.enumsortorder`, [name])).map((r) => r.enumlabel);
const udtOk = (want: string | string[] | undefined, have: string) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);
const defOk = (want: string | undefined, have: string | null) => {
  if (want === undefined) return true;
  const d = (have ?? "").replace(/::[\w" ]+(\[\])?/g, "").replace(/'/g, "").trim();
  if (want === "true" || want === "false") return d.toLowerCase() === want;
  if (want === "[]") return /^(\{\}|ARRAY\[\])$/i.test(d);
  if (want === "") return d === "" && have !== null;
  return d === want;
};
const specProblems = async (t: string, cols: Record<string, ColSpec>): Promise<string[]> => {
  const ci = await colInfo(t);
  if (!ci.size) return [`table ${t} missing`];
  const p: string[] = [];
  for (const [name, s] of Object.entries(cols)) {
    const h = ci.get(name);
    if (!h) { p.push(`${name}: missing`); continue; }
    if (!udtOk(s.udt, h.udt)) p.push(`${name}: type ${h.udt} ≠ ${JSON.stringify(s.udt)}`);
    if (s.nn === true && h.nullable) p.push(`${name}: nullable, want NOT NULL`);
    if (s.nn === false && !h.nullable) p.push(`${name}: NOT NULL, want nullable`);
    if (!defOk(s.def, h.def)) p.push(`${name}: default ${h.def ?? "none"} ≠ ${s.def}`);
  }
  return p;
};

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — the migration file
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · the migration ──");
  {
    const p = nameProblems(allMigDirs, migDir);
    chk("C3.0-S1.1", `exactly ONE migration ${migDir ?? "*_crm_v2_c"} with a real 14-digit timestamp that sorts after *_crm_v2_b, shares its timestamp with nobody, and no CRM v2 migration outside a/b/c exists (R-C.1)`,
      !!migDir && p.length === 0, "1 dir · well named", `${p.join(" · ") || "-"}${ABSENT}`);
  }
  {
    const rows = migDir ? await q<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      `select migration_name, checksum, finished_at, rolled_back_at from _prisma_migrations where migration_name = $1`, [migDir]) : [];
    const row = rows[0];
    const sha = migSql ? createHash("sha256").update(migSql).digest("hex") : "";
    chk("C3.0-S1.2", "applied on the QC branch by the controller through `bash scripts/iso.sh bash scripts/qc-prisma.sh migrate deploy` (never `migrate dev`): the row is finished, not rolled back, and its checksum is the sha256 of the migration.sql on disk (nobody edited the file after applying it)",
      !!row && !!row.finished_at && !row.rolled_back_at && String(row.checksum) === sha,
      "finished · checksum matches", `row=${!!row} finished=${!!row?.finished_at} rolledBack=${!!row?.rolled_back_at} checksum=${row ? (String(row.checksum) === sha ? "match" : `${short(String(row.checksum), 16)} ≠ ${short(sha, 16)}`) : "-"}${ABSENT}`);
  }
  {
    const allowed = new Set(["CREATE TYPE", "CREATE TABLE", "CREATE INDEX", "CREATE UNIQUE INDEX", "ADD COLUMN", "ADD FK", "ALTER TYPE ADD VALUE", "noise"]);
    const unexpected = Object.keys(AN.kinds).filter((k) => !allowed.has(k));
    chk("C3.0-S1.3", `additive only: every statement is CREATE TYPE / CREATE TABLE / CREATE [UNIQUE] INDEX / ALTER TABLE ADD COLUMN / ADD CONSTRAINT FOREIGN KEY on a new table — no DROP, RENAME, ALTER COLUMN, CHECK, data statement, trigger or function (${AN.statements.length} statements)`,
      !!migDir && AN.violations.length === 0 && unexpected.length === 0,
      "0 violations", `violations=${AN.violations.map((v) => `${v.rule}: ${v.stmt}`).join(" | ") || "-"} kinds=${JSON.stringify(AN.kinds)}${ABSENT}`);
  }
  {
    const onOld = [...AN.addedCols.entries()].filter(([t]) => !AN.newTables.has(t));
    const bad: string[] = [];
    for (const [t, cols] of onOld) for (const [name, rest] of cols) {
      if (/NOT\s+NULL/i.test(rest) && !/DEFAULT/i.test(rest)) bad.push(`${t}.${name}: NOT NULL without default`);
      if (/DEFAULT/i.test(rest) && VOLATILE_DEFAULT.test(rest)) bad.push(`${t}.${name}: volatile default`);
    }
    chk("C3.0-S1.4", "every column added to an EXISTING table is nullable (or has a cheap constant default): `HrPayAdjustment.crmCommissionId` is plain nullable text with no default, so `migrate deploy` on a prod table with hundreds of thousands of rows neither rewrites it nor fails",
      !!migDir && bad.length === 0 && onOld.every(([t]) => ALLOWED_EXISTING_TABLES.has(t)),
      "nullable · no rewrite", `problems=${bad.join(" | ") || "-"} tables=${onOld.map(([t]) => t).join(",") || "-"}${ABSENT}`);
  }
  {
    const misuse = enumValueMisuse(AN, migSql);
    chk("C3.0-S1.5", `no enum value added with ALTER TYPE … ADD VALUE is used as a default, cast or predicate in the SAME migration (Postgres cannot use a value added in the same transaction) — phase C3 needs no ADD VALUE at all (found: ${AN.addedEnumValues.length})`,
      misuse.length === 0, "no misuse", `misused=${misuse.join(",") || "-"} added=${AN.addedEnumValues.map(([t, v]) => `${t}.${v}`).join(",") || "-"}${ABSENT}`);
  }
  {
    const uniquesOnOld = AN.indexes.filter((i) => i.unique && !AN.newTables.has(i.table));
    const okPartial = uniquesOnOld.every((i) => !!i.where && i.cols.every((cc) => AN.addedCols.get(i.table)?.has(cc)));
    chk("C3.0-S1.6", "🔴 UNIQUE rules: a unique index exists only on a NEW table, or as a PARTIAL unique over a column added in this same migration without a default (all existing rows NULL ⇒ the index is empty ⇒ it cannot fail on prod). `HrPayAdjustment.crmCommissionId` is that one case; the AccountContact and one-primary uniques must NOT be here (they are C6.1's)",
      !!migDir && okPartial && uniquesOnOld.every((i) => ALLOWED_EXISTING_TABLES.has(i.table)),
      "partial over a new column only", `uniquesOnOldTables=${uniquesOnOld.map((i) => `${i.table}(${i.cols.join(",")})${i.where ? " partial" : " FULL"}`).join(" | ") || "-"}${ABSENT}`);
  }
  {
    const missing = NEW_TABLE_NAMES.filter((t) => !AN.newTables.has(t));
    const extra = [...AN.newTables].filter((t) => !NEW_TABLE_NAMES.includes(t));
    chk("C3.0-S1.7", `the migration creates exactly the ${NEW_TABLE_NAMES.length} tables phase C3 needs (${NEW_TABLE_NAMES.join(" · ")}) and nothing else — no table of a later phase, no table the briefs decided against (report schedules live in settings, R-E.6)`,
      !!migDir && missing.length === 0 && extra.length === 0,
      `${NEW_TABLE_NAMES.length} tables`, `missing=${missing.join(",") || "-"} extra=${extra.join(",") || "-"}${ABSENT}`);
  }
  {
    const touched = [...AN.touchedExisting];
    const bad = touched.filter((t) => !ALLOWED_EXISTING_TABLES.has(t));
    const forbidden = FORBIDDEN_TOUCH.filter(([t]) => AN.touchedExisting.has(t) || new RegExp(`ALTER TABLE\\s+"?${t}"?`, "i").test(migSql)).map(([t, why]) => `${t} (${why})`);
    chk("C3.0-S1.8", `existing objects: the ONLY table crm_v2_c may touch is HrPayAdjustment (one nullable column + one partial unique). CustomerSession · ReportDef · MemberSavedView · PosSale · AccountContact · CrmCompanyContact must be untouched — each for a recorded reason`,
      !!migDir && bad.length === 0 && forbidden.length === 0,
      "HrPayAdjustment only", `touched=${touched.join(",") || "-"} illegal=${bad.join(",") || "-"} forbidden=${forbidden.join(" | ") || "-"}${ABSENT}`);
  }
  {
    // schema ↔ DB in sync: `migrate diff` must produce an empty script
    let out = "";
    let ran = false;
    if (migDir && existsSync("scripts/qc-prisma.sh")) {
      const r = spawnSync("bash", ["scripts/qc-prisma.sh", "migrate", "diff", "--from-config-datasource", "--to-schema", SCHEMA_DIR, "--script"], { encoding: "utf8", timeout: 240_000, env: process.env });
      ran = r.status === 0;
      out = `${r.stdout ?? ""}`;
    }
    const empty = /empty migration/i.test(out) || out.trim().split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length === 0;
    chk("C3.0-S1.9", "prisma/schema and the QC database agree after the migration: `qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script` prints an EMPTY migration (nothing drifted, nothing was applied by hand)",
      ran && empty, "empty diff", `ran=${ran} output=${short(out.trim() || "(not run)", 200)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — the enums
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · enums ──");
  {
    const problems: string[] = [];
    for (const [name, vals] of Object.entries(NEW_ENUMS)) {
      const have = await enumLabels(name);
      if (have.length === 0) { problems.push(`${name}: missing`); continue; }
      const miss = vals.filter((v) => !have.includes(v));
      const extra = have.filter((v) => !vals.includes(v));
      if (miss.length || extra.length) problems.push(`${name}: missing ${miss.join(",") || "-"} extra ${extra.join(",") || "-"}`);
    }
    chk("C3.0-S2.1", `blueprint §4.2: the 6 new enums exist in the database with exactly their values — ${Object.entries(NEW_ENUMS).map(([k, v]) => `${k}{${v.join(",")}}`).join(" · ")}`,
      problems.length === 0, "6 enums", `${problems.join(" · ") || "-"}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — the shape of every new table (from the DB, not from the SQL text)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · table shapes ──");
  let n = 0;
  for (const [t, spec] of Object.entries(NEW_TABLES)) {
    n += 1;
    const problems = await specProblems(t, spec.cols);
    const ix = await idxList(t);
    const uniqMiss = (spec.unique ?? []).filter((cols) => !hasFullUnique(ix, cols)).map((cols) => `unique(${cols.join(",")})`);
    const idxMiss = (spec.index ?? []).filter((cols) => !hasIndex(ix, cols)).map((cols) => `index(${cols.join(",")})`);
    chk(`C3.0-S3.${n}`, `${t} — ${spec.why}: every contract column with its type/nullability/default, plus ${(spec.unique ?? []).length} unique and ${(spec.index ?? []).length} index`,
      problems.length === 0 && uniqMiss.length === 0 && idxMiss.length === 0,
      "shape matches", `${[...problems, ...uniqMiss, ...idxMiss].join(" · ") || "-"}${ABSENT}`);
  }
  {
    const ci = await colInfo("HrPayAdjustment");
    const col = ci.get("crmCommissionId");
    const ix = await idxList("HrPayAdjustment");
    const partial = hasPartialUnique(ix, ["crmCommissionId"]);
    const fkRows = await q<{ n: number }>(`select count(*)::int as n from pg_constraint k join pg_class cl on cl.oid = k.conrelid join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1] where k.contype = 'f' and cl.relname = 'HrPayAdjustment' and a.attname = 'crmCommissionId'`);
    chk("C3.0-S3.7", "the ONE column on an existing table: `HrPayAdjustment.crmCommissionId` is nullable text with NO default, carries a PARTIAL UNIQUE (… ) WHERE crmCommissionId IS NOT NULL so one commission can never be paid through two adjustments, and has NO foreign key to CRM (HR must not depend on the CRM module, and a soft link survives a deleted commission row)",
      !!col && col.udt === "text" && col.nullable && col.def === null && partial && Number(fkRows[0]?.n ?? 0) === 0,
      "nullable · partial unique · no FK", `col=${col ? `${col.udt}/${col.nullable ? "null" : "NOT NULL"}/${col.def ?? "no default"}` : "missing"} partialUnique=${partial} fks=${fkRows[0]?.n ?? "-"}${ABSENT}`);
  }
  {
    const cs = await colInfo("CustomerSession");
    const csExtra = ["subjectType", "crmContactId", "crmSystemId", "portalAccessId"].filter((c0) => cs.has(c0));
    const rd = await colInfo("ReportDef");
    const rdExtra = ["cron", "schedule", "recipients", "emails"].filter((c0) => rd.has(c0));
    const ps = await colInfo("PosSale");
    const posDeal = ps.has("dealId");
    const acIx = await idxList("AccountContact");
    const acUnique = acIx.some((i) => i.unique && !i.where && sameCols([...i.cols].sort(), ["partyId", "systemId"]));
    const ccIx = await idxList("CrmCompanyContact");
    const ccPrimary = ccIx.some((i) => i.unique && i.cols.includes("isPrimary"));
    chk("C3.0-S3.8", "the NOT-ADDED list holds in the live database: CustomerSession has no subjectType/crmContactId/crmSystemId (R-C.5 — the sibling PortalSession carries the portal subject) · ReportDef has no schedule/recipient column (R-E.6) · no PosSale.dealId (C29) · no full unique AccountContact(systemId, partyId) and no unique involving CrmCompanyContact.isPrimary (both belong to C6.1, after a read-only duplicate count on prod)",
      csExtra.length === 0 && rdExtra.length === 0 && !posDeal && !acUnique && !ccPrimary,
      "none of them", `customerSession=${csExtra.join(",") || "-"} reportDef=${rdExtra.join(",") || "-"} posSaleDealId=${posDeal} accountContactUnique=${acUnique} onePrimaryUnique=${ccPrimary}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — prisma models · scope registry · fitness
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · models · scope · fitness ──");
  const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(`${SCHEMA_DIR}/${f}`)).join("\n") : "";
  {
    const missing = NEW_TABLE_NAMES.filter((t) => !new RegExp(`^model\\s+${t}\\s*\\{`, "m").test(schemaAll));
    const mapped = NEW_TABLE_NAMES.filter((t) => {
      const m = new RegExp(`^model\\s+${t}\\s*\\{([\\s\\S]*?)^\\}`, "m").exec(schemaAll);
      return !!m && /@@map\(/.test(m[1]);
    });
    chk("C3.0-S4.1", `prisma/schema declares all ${NEW_TABLE_NAMES.length} new models with NO @@map (table name = model name, which is what the tenant-scope guard and fitness F8 assume)`,
      missing.length === 0 && mapped.length === 0, "declared · no @@map", `missing=${missing.join(",") || "-"} mapped=${mapped.join(",") || "-"}${ABSENT}`);
  }
  {
    const scopeSrc = read(SCOPE_FILE);
    const missing: string[] = [];
    const wrongAxis: string[] = [];
    for (const t of NEW_TABLE_NAMES) {
      const m = new RegExp(`^\\s{2}${t}:\\s*(.+?),\\s*(?://.*)?$`, "m").exec(scopeSrc);
      if (!m) { missing.push(t); continue; }
      const wantSys = Object.keys(NEW_TABLES[t].cols).includes("systemId");
      const isSys = /sys\(/.test(m[1]);
      if (wantSys !== isSys) wrongAxis.push(`${t}: ${m[1].trim()} (want ${wantSys ? "sys()" : "tenant"})`);
    }
    chk("C3.0-S4.2", "src/lib/core/scope.ts registers every new model — axis `sys()` when the table has systemId, plain `tenant` otherwise (PortalSession is tenant-scoped: its CRM system sits in crmSystemId) — so `scopeOf` never falls back to a global scope and fitness F1 stays green",
      missing.length === 0 && wrongAxis.length === 0, "6 registered · right axis", `missing=${missing.join(",") || "-"} wrongAxis=${wrongAxis.join(" | ") || "-"}${ABSENT}`);
  }
  {
    let f1 = "", f8 = "", code = -1;
    if (migDir) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/fitness.mts"], { encoding: "utf8", timeout: 420_000, env: process.env });
      code = r.status ?? -1;
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      f1 = (out.match(/F1\.\d[^\n]*/g) ?? []).join(" | ");
      f8 = (out.match(/F8\.\d[^\n]*/g) ?? []).join(" | ");
    }
    const green = (s: string) => s.length > 0 && !/❌|FAIL/i.test(s);
    chk("C3.0-S4.3", "fitness F1 (every model registered in the scope registry — fail-closed) and F8 (every model appears in a migration) are green after crm_v2_c",
      green(f1) && green(f8), "F1 + F8 green", `exit=${code} F1=${short(f1 || "(not run)", 120)} F8=${short(f8 || "(not run)", 120)}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — v1 / uiVersion-1 safety (PERMANENT RULE)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · v1 safety ──");
  {
    const cs = await colInfo("CustomerSession");
    const customerId = cs.get("customerId");
    const hr = await colInfo("HrPayAdjustment");
    const amount = hr.get("amountSatang");
    const kind = hr.get("kind");
    chk("C3.0-S5.1", "the tables the live product writes to are unchanged where it matters: `CustomerSession.customerId` is still NOT NULL text (the very fact that sent the portal to its own table) and `HrPayAdjustment.amountSatang` / `.kind` keep their type and nullability, so payroll code written before C3.0 still compiles and still inserts",
      !!customerId && !customerId.nullable && customerId.udt === "text" && !!amount && !amount.nullable && !!kind && !kind.nullable,
      "unchanged", `customerId=${customerId ? `${customerId.udt}/${customerId.nullable ? "null" : "NOT NULL"}` : "missing"} amountSatang=${amount ? `${amount.udt}/${amount.nullable}` : "missing"} kind=${kind ? kind.udt : "missing"}`);
  }
  {
    // a v1-shaped INSERT naming only pre-C3.0 columns still succeeds (rolled back)
    let ok = false;
    let err = "";
    try {
      await q("BEGIN");
      await q(`INSERT INTO "HrPayAdjustment" ("id","tenantId","systemId","employeeId","periodKey","kind","amountSatang","status","createdAt")
               VALUES ($1,$2,$3,$4,$5,'COMMISSION',1000,'PENDING',now())`, [`${TAG}-adj`, `${TAG}-t`, `${TAG}-s`, `${TAG}-e`, "2569-10"]);
      const rows = await q<{ n: number }>(`select count(*)::int as n from "HrPayAdjustment" where id = $1`, [`${TAG}-adj`]);
      ok = Number(rows[0]?.n ?? 0) === 1;
    } catch (e) { err = String((e as Error)?.message ?? e); }
    finally { await q("ROLLBACK").catch(() => null); }
    const left = await q<{ n: number }>(`select count(*)::int as n from "HrPayAdjustment" where id = $1`, [`${TAG}-adj`]);
    chk("C3.0-S5.2", "an INSERT written the way the payroll code writes it today (naming only pre-C3.0 columns, nothing about commissions) still succeeds after the migration — and this oracle leaves no trace: the probe runs inside a transaction that is rolled back",
      ok && Number(left[0]?.n ?? -1) === 0, "insert ok · rolled back", `insert=${ok ? "ok" : err} leftover=${left[0]?.n ?? "?"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X groups
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X groups ──");
  {
    const bad: string[] = [];
    for (const t of NEW_TABLE_NAMES) {
      const ci = await colInfo(t);
      if (!ci.size) { bad.push(`${t}: missing`); continue; }
      const ten = ci.get("tenantId");
      if (!ten || ten.nullable) bad.push(`${t}.tenantId ${ten ? "nullable" : "missing"}`);
      const sys = ci.get("systemId");
      if (sys && sys.nullable) bad.push(`${t}.systemId nullable`);
      const crmSys = ci.get("crmSystemId");
      if (crmSys && crmSys.nullable) bad.push(`${t}.crmSystemId nullable`);
    }
    chk("C3.0-X1.1", "X1 scope: every new table carries `tenantId` NOT NULL (the tenant guard injects it on every query) and any systemId/crmSystemId column is NOT NULL too — a row that cannot say which shop and which CRM system it belongs to is a leak waiting to happen",
      bad.length === 0, "tenantId NOT NULL everywhere", `${bad.join(" · ") || "-"}${ABSENT}`);
  }
  {
    const rule = await colInfo("CrmCommissionRule");
    const comm = await colInfo("CrmCommission");
    const quota = await colInfo("CrmQuota");
    const defaults = [
      ["CrmCommissionRule.splitCollaboratorsBp", rule.get("splitCollaboratorsBp"), "0"],
      ["CrmCommissionRule.payoutDelayDays", rule.get("payoutDelayDays"), "0"],
      ["CrmCommissionRule.sortOrder", rule.get("sortOrder"), "0"],
      ["CrmCommissionRule.active", rule.get("active"), "true"],
      ["CrmCommission.status", comm.get("status"), "PENDING"],
      ["CrmCommissionRule.basis", rule.get("basis"), "PAID"],
    ] as [string, ColInfo | undefined, string][];
    const bad = defaults.filter(([, h, want]) => !h || !defOk(want, h.def)).map(([k, h, want]) => `${k}=${h?.def ?? "missing"} want ${want}`);
    const money = [["CrmCommission.amountSatang", comm.get("amountSatang")], ["CrmCommission.basisSatang", comm.get("basisSatang")], ["CrmQuota.targetSatang", quota.get("targetSatang")], ["CrmCommissionRule.minDealSatang", rule.get("minDealSatang")]] as [string, ColInfo | undefined][];
    const notBig = money.filter(([, h]) => !h || h.udt !== "int8").map(([k, h]) => `${k}=${h?.udt ?? "missing"}`);
    chk("C3.0-X3.1", "X3 counters and money: every counter/flag of the new tables has a constant default (splitCollaboratorsBp · payoutDelayDays · sortOrder = 0 · active = true · commission status PENDING · rule basis PAID) so a row created by a partial write is never NULL-arithmetic, and every money column is BigInt (int8) as the brief demands — a year of commissions must not overflow int4",
      bad.length === 0 && notBig.length === 0, "defaults · int8 money", `defaults=${bad.join(" | ") || "-"} money=${notBig.join(" | ") || "-"}${ABSENT}`);
  }
  {
    const ix = await idxList("CrmCommission");
    const uniq = hasFullUnique(ix, ["dealId", "ruleId", "userId", "refId"]);
    const refId = (await colInfo("CrmCommission")).get("refId");
    const quotaIx = await idxList("CrmQuota");
    const quotaUniq = hasFullUnique(quotaIx, ["systemId", "ownerType", "ownerId", "periodKey"]);
    chk("C3.0-X4.1", "🔴 X4 dedupe keys are the whole defence of the money paths: CrmCommission has the 4-column UNIQUE (dealId, ruleId, userId, refId) **and `refId` is NOT NULL with a '' default** — a nullable refId would let two NULL rows through (Postgres does not dedupe NULLs) and a replayed `invoice.paid` would pay the rep twice · CrmQuota has its unique (systemId, ownerType, ownerId, periodKey) so `crm.quota.reached` can be a conditional insert instead of check-then-emit",
      uniq && !!refId && !refId.nullable && quotaUniq,
      "unique bites · refId NOT NULL", `commissionUnique=${uniq} refId=${refId ? `${refId.udt}/${refId.nullable ? "NULLABLE" : "NOT NULL"}/${refId.def ?? "no default"}` : "missing"} quotaUnique=${quotaUniq}${ABSENT}`);
  }
  {
    const pa = await colInfo("CrmPortalAccess");
    const psCols = await colInfo("PortalSession");
    const hashOnly = pa.has("inviteTokenHash") && !pa.has("inviteToken") && psCols.has("tokenHash") && !psCols.has("token");
    const plaintext: string[] = [];
    for (const t of NEW_TABLE_NAMES) {
      const ci = await colInfo(t);
      for (const name of ci.keys()) if (/token$/i.test(name) && !/hash$/i.test(name)) plaintext.push(`${t}.${name}`);
    }
    const psIx = await idxList("PortalSession");
    chk("C3.0-X7.1", "X7 public-surface tokens are stored as hashes only: the invite token (`CrmPortalAccess.inviteTokenHash`, unique, with `inviteExpiresAt` for the 7-day window) and the portal session token (`PortalSession.tokenHash`, unique) — no new table has a plaintext `*Token` column anywhere",
      hashOnly && plaintext.length === 0 && hasFullUnique(psIx, ["tokenHash"]),
      "hash only · unique", `hashOnly=${hashOnly} plaintext=${plaintext.join(",") || "-"}${ABSENT}`);
  }
  {
    const rawIp: string[] = [];
    const pii: string[] = [];
    for (const t of NEW_TABLE_NAMES) {
      const ci = await colInfo(t);
      for (const name of ci.keys()) {
        if (/^ip$|ipAddress|^remoteAddr/i.test(name)) rawIp.push(`${t}.${name}`);
        if (/phone|email|fullName|firstName|lastName|address/i.test(name)) pii.push(`${t}.${name}`);
      }
    }
    const ps = await colInfo("PortalSession");
    chk("C3.0-X8.1", "X8 PDPA: no new table stores a raw IP address (PortalSession keeps `ipHash`, unlike the older CustomerSession.ip it is modelled on) and none of them carries a phone, e-mail, name or address column — the portal rows point at a contact by id and nothing more",
      rawIp.length === 0 && pii.length === 0 && ps.has("ipHash"),
      "no ip · no PII columns", `rawIp=${rawIp.join(",") || "-"} pii=${pii.join(",") || "-"} ipHash=${ps.has("ipHash")}${ABSENT}`);
  }
  {
    const secrets: string[] = [];
    for (const t of NEW_TABLE_NAMES) {
      const ci = await colInfo(t);
      for (const name of ci.keys()) if (/password|secret|accessToken|refreshToken|apiKey|privateKey/i.test(name)) secrets.push(`${t}.${name}`);
    }
    chk("C3.0-X10.1", "X10 secrets: no new table has a secret-bearing column (password · secret · access/refresh token · api key · private key) — the portal has nothing to keep besides hashes",
      secrets.length === 0, "none", `${secrets.join(",") || "-"}${ABSENT}`);
  }
} catch (e) {
  chk("C3.0-ERR", "the oracle ran to the end without an unexpected exception", false, "no exception", short(e instanceof Error ? `${e.name}: ${e.message}` : String(e), 400));
} finally {
  await q(`ROLLBACK`).catch(() => null);
  const left = await q<{ n: number }>(`select count(*)::int as n from "HrPayAdjustment" where id like $1`, [`${TAG}%`]).catch(() => [{ n: 0 }]);
  chk("C3.0-CLEAN", "the oracle leaves the QC database exactly as found — the only write it ever makes is the v1-shaped INSERT of S5.2 inside a transaction that is rolled back (0 rows carrying this run's tag)",
    Number(left[0]?.n ?? 0) === 0, "0 rows", `leftover=${left[0]?.n ?? "?"}`, "MAJOR");
  await db.end().catch(() => null);
}

const total = cks.length;
const passed = cks.filter((x) => x.ok).length;
const findings = cks.filter((x) => !x.ok).map((x) => ({ id: x.id, sev: x.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.0: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
