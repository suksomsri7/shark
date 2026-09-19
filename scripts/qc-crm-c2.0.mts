// QC — CRM v2 WO C2.0: migration `crm_v2_b` (every table of phase C2) + scope registry (F1/F8) + the schema debts parked for C2.0
// Oracle writer · the C2.0 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.0.mts
//       `--force-run` = run every check even while prisma/migrations/*_crm_v2_b is absent: the static SQL parser self-tests
//       (T0.x, synthetic SQL embedded below) and the DB-helper positive controls go green, everything else is RED for the right
//       reason ("migration absent") — proves the file never crashes. Without the flag and without the migration ⇒ SKIPPED.
// requires: crm-seed   (reads seeded CRM system/contacts/deals only as FK targets; every write is either inside a transaction that
//                       is ROLLED BACK, or a row tagged `qc-c20-<rand>` deleted in `finally`)
//
// SOURCES: crm-brief-C2.0.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.1 three migrations · R-C.4 CrmDealPayment.refType ·
//   R-E.14 uiVersion) · MASTER-PLAN §2.5 (migration rules) §4 (X groups) §6 row C2.0 · CRM-RUN §4 (Prisma CLI only through
//   scripts/qc-prisma.sh; prod migrates inside scripts/vercel-build.sh) · blueprint §4.2 §4.3 (groups คะแนน·มอบหมาย·อัตโนมัติ / อีเมล /
//   ติดตาม) §4.6 §15 (C22 C29 + EmailDomain) · downstream briefs that constrain the schema: C2.2 (versioning, lease, one ACTIVE),
//   C2.5 (scheduled-send lease, Message-ID dedupe), C2.6 (FormDef/FormSubmission columns, pageViews, ipHash), C2.7 (CrmDealPayment
//   flag-first), C2.8 (score log dedupe key ruleId+eventKey), C2.10 (CrmUserPref)
// CONTROLLER RULINGS 19 Sep 2569 (binding, applied here): R1 the C1.3 partial unique "one primary contact per company" moves to C6.1
//   (a failing CREATE UNIQUE INDEX during `migrate deploy` on prod leaves a half-applied failed migration that blocks every later deploy)
//   — the C2.0 builder instead fixes scripts/crm-backfill-companies-from-text.mts (isPrimary only for the first contact of a company with
//   no current primary) + the seed so a reseed gives 0 duplicates · R2 CrmSequenceStep.version + UNIQUE(sequenceId, version, index) ·
//   R3 one ACTIVE enrollment = partial UNIQUE(sequenceId, contactId) WHERE status = 'ACTIVE' (re-enrol after DONE/STOPPED) ·
//   R4 CrmDealPayment.refType/status plain text · R5 CrmImportJob full shape · R6 CrmScoreLog.eventKey + partial UNIQUE(ruleId, eventKey)
//   · R7 AutomationRun.crmContactId + partial UNIQUE(ruleId, crmContactId, eventKey) WHERE crmContactId IS NOT NULL · CrmEmailEvent.
//   providerEventId + partial unique · CrmEmailMessage.trackTokenHash (no plaintext token, X7) · R8 allowlist + AutomationRun.
// 🔴 MIGRATION SAFETY (S1.10): crm_v2_b must contain NO statement that can fail on existing prod data — no UNIQUE or NOT NULL over
//   existing rows, no FK whose validation reads existing rows, no ADD VALUE of a value that already exists. A unique on an old table is
//   allowed only when it is partial over a column added in this same migration WITHOUT a default (every existing row is NULL ⇒ empty).
//   EVERY constraint that must hold over existing rows (CrmCompanyContact one-primary, AccountContact(systemId, partyId), …) BELONGS TO C6.1,
//   after a read-only duplicate count on prod.
// DEBTS PARKED FOR C2.0 (wo-notes): C1.3 partial unique "one current primary contact per company" (→ C6.1 by R1) · C1.4 import-job table ·
//   C1.5 CrmDeal.archivedAt + CrmActivitySource.KANBAN (also C1.6) · C1.1 MemberActivity index ONLY with EXPLAIN evidence ·
//   C1.8/C2.6 FormDef.crmSystemId · C1.1 unique AccountContact(systemId, partyId) belongs to C6.1 ⇒ must NOT be here
// PERMANENT RULE (C1.7): uiVersion-1 safety — the migration changes no behaviour of v1 paths: pre-C2.0 columns of 13 v1/C1 tables keep
//   type/nullability/default (baseline captured from QC on 19 Sep 2569, embedded below), new columns on old tables are nullable or
//   defaulted, and a v1-shaped INSERT naming only pre-C2.0 columns still succeeds (rolled back).
// X GROUPS: X1 (tenantId/systemId NOT NULL on every new table) · X3 (counters default 0 + one ACTIVE enrollment, 10-way race on separate
//   connections × 2 rounds) · X4 (dedupe keys: CrmDealPayment flag, Message-ID, score log; 10-way race × 2) · X5 (leaseUntil + pickup
//   indexes) · X8 (no raw IP column) · X10 (no secret column). N/A: X2 (no op/tool) · X6 (no input surface) · X7 (no endpoint) ·
//   X9 (no mutation op) — schema-only work order.
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented): qc-form · qc-forms-notify · qc-marketing · every qc-crm-c1.* ·
//   qc-member-m1.3 · qc-member-m1.9 (30/15/10/5). This file itself spawns fitness (F1/F8, with and without env) and qc-member-m1.2.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   ONE migration dir `<yyyymmddHHMMSS>_crm_v2_b` (sorts after 20261031000000_crm_v2_a, unique timestamp) — additive only:
//   CREATE TYPE · ALTER TYPE … ADD VALUE · CREATE TABLE · CREATE [UNIQUE] INDEX · ALTER TABLE … ADD COLUMN (nullable or DEFAULT,
//   non-volatile default on old tables) · ALTER TABLE … ADD CONSTRAINT FOREIGN KEY (on a new table, or on a column added here).
//   No DROP / RENAME / ALTER COLUMN / data statement / trigger / function. No value added by ALTER TYPE is used as a default, cast or
//   predicate in the same file. UNIQUE only on new tables, or partial over a column added here without default (AutomationRun).
//   Existing objects touched: CrmContact · CrmDeal · CrmCompanyContact (non-unique index only) · FormDef · FormSubmission · AutomationRun ·
//   MemberActivity (columns/indexes only with EXPLAIN evidence in ledger/wo-notes/crm-C2.0.md) · enum CrmActivitySource (nothing else).
//   New enums: CrmAssignMode{FIXED,ROUND_ROBIN,TEAM_LEAD,LEAST_OPEN} · CrmSeqStepKind{EMAIL,LINE,TASK,WAIT,SMS} ·
//     CrmEnrollStatus{ACTIVE,PAUSED,DONE,STOPPED} · CrmEmailStatus{QUEUED,SENT,DELIVERED,OPENED,BOUNCED,FAILED,RECEIVED} ·
//     CrmEmailEventKind{OPEN,CLICK,BOUNCE,COMPLAINT,REPLY,UNSUBSCRIBE} · CrmWebEventKind{PAGEVIEW,CLICK,FORM_VIEW,FORM_SUBMIT,IDENTIFY,CONSENT}
//     + CrmActivitySource ADD VALUE KANBAN
//   New tables (19, model name = table name, every one has tenantId NOT NULL; exact columns in NEW_TABLES below):
//     CrmScoreRule CrmScoreLog CrmAssignmentRule CrmSequence CrmSequenceStep CrmSequenceEnrollment CrmEmailMessage CrmEmailEvent
//     CrmEmailTemplate CrmEmailUserSetting CrmMailProvider EmailDomain CrmTrackedLink CrmTrackedClick CrmWebSession CrmWebEvent
//     CrmDealPayment CrmUserPref CrmImportJob
//   New columns: FormDef += crmSystemId? assignRuleId? utmCapture Boolean @default(true) scoreOnSubmit Int? createCompanyFromField?
//     spamGuard Json? · FormSubmission += utm Json? pageUrl? referrer? webSessionId? · CrmContact += trackingOptOut Boolean
//     @default(false) · CrmDeal += archivedAt DateTime? · AutomationRun += crmContactId String? (no default) + partial UNIQUE
//     ("ruleId", "crmContactId", "eventKey") WHERE "crmContactId" IS NOT NULL
//   NOT added: PosSale.dealId (C29) · MktRecipient.emailMessageId (C29) · unique AccountContact(systemId, partyId) (C6.1) ·
//     unique CrmCompanyContact one-primary (C6.1) · plaintext CrmEmailMessage.trackToken (X7)
//   Scripts (builder): crm-backfill-companies-from-text.mts sets isPrimary only for the first contact of a company without a current primary
//   scope.ts: every new model registered — axis "system" when the table has systemId, else "tenant" (tenantId column required)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const FORCE = process.argv.includes("--force-run");
const MIG_ROOT = "prisma/migrations";
const allMigDirs = existsSync(MIG_ROOT) ? readdirSync(MIG_ROOT).filter((d) => /^\d+_/.test(d)).sort() : [];
const bDirs = allMigDirs.filter((d) => /_crm_v2_b$/.test(d));
const migDir: string | undefined = bDirs[0];
if (!migDir && !FORCE) {
  console.log("⚠️  SKIPPED — WO C2.0 not built yet: no prisma/migrations/*_crm_v2_b (run with --force-run to exercise the parsers)");
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
const short = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);
const TAGP = `qc-c20-${randomBytes(3).toString("hex")}`;
const tag = () => `${TAGP}-${randomBytes(5).toString("hex")}`;

// ════════════════════════════════ static SQL analysis (pure — exercised by T0.x on synthetic SQL) ════════════════════════════════
/** Split a migration into statements: strips -- and block comments, respects '…' "…" and $tag$…$tag$, whitespace collapsed. */
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const nx = sql[i + 1];
    if (ch === "-" && nx === "-") { const j = sql.indexOf("\n", i); i = j < 0 ? n : j; cur += " "; continue; }
    if (ch === "/" && nx === "*") { const j = sql.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; cur += " "; continue; }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) { if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; } j++; }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (m) { const t = m[0]; const j = sql.indexOf(t, i + t.length); const end = j < 0 ? n : j + t.length; cur += sql.slice(i, end); i = end; continue; }
    }
    if (ch === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
/** Split at commas that sit at paren depth 0 and outside quotes. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0; let cur = ""; let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
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
  statements: string[]; violations: Violation[]; newTables: Set<string>; newEnums: Map<string, string[]>; addedEnumValues: [string, string][];
  addedCols: Map<string, Map<string, string>>; indexes: IdxInfo[]; touchedExisting: Set<string>; alteredEnums: Set<string>; kinds: Record<string, number>;
};
/** Existing objects C2.0 may touch (S1.8) — everything else that is not created here is out of scope. */
const ALLOWED_EXISTING_TABLES = new Set(["CrmContact", "CrmDeal", "CrmCompanyContact", "FormDef", "FormSubmission", "AutomationRun", "MemberActivity"]);
const ALLOWED_EXISTING_ENUMS = new Set(["CrmActivitySource"]);
const VOLATILE_DEFAULT = /(gen_random_uuid|uuid_generate_v\d|random\s*\(|clock_timestamp|timeofday|nextval\s*\()/i;

function analyzeSql(sql: string): Analysis {
  const statements = splitSql(sql);
  const newTables = new Set<string>();
  const newEnums = new Map<string, string[]>();
  const addedEnumValues: [string, string][] = [];
  const addedCols = new Map<string, Map<string, string>>();
  const violations: Violation[] = [];
  const indexes: IdxInfo[] = [];
  const touchedExisting = new Set<string>();
  const alteredEnums = new Set<string>();
  const kinds: Record<string, number> = {};
  const bump = (k: string) => { kinds[k] = (kinds[k] ?? 0) + 1; };
  const v = (rule: string, stmt: string) => violations.push({ rule, stmt: short(stmt, 160) });
  // pass 1 — what this file creates
  for (const s of statements) {
    let m = /^CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"(\w+)"/i.exec(s);
    if (m) newTables.add(m[1]);
    m = /^CREATE TYPE "(\w+)" AS ENUM \((.*)\)$/i.exec(s);
    if (m) newEnums.set(m[1], [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]));
    m = /^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:"?public"?\.)?"(\w+)" (.*)$/i.exec(s);
    if (m) {
      for (const act of splitTop(m[2])) {
        const a = /^ADD COLUMN (?:IF NOT EXISTS )?"(\w+)" (.*)$/i.exec(act);
        if (a) { if (!addedCols.has(m[1])) addedCols.set(m[1], new Map()); addedCols.get(m[1])!.set(a[1], a[2]); }
      }
    }
  }
  // a unique on an OLD table is empty-safe only when partial over a column added HERE without a default (all existing rows NULL)
  const emptySafePartial = (ix: IdxInfo) => !!ix.where && ix.cols.some((col) => {
    const d = addedCols.get(ix.table)?.get(col);
    return d !== undefined && !/\bDEFAULT\b/i.test(d) && new RegExp(`"?${col}"?\\s+IS NOT NULL`, "i").test(ix.where ?? "");
  });
  // pass 2 — rules
  for (const s of statements) {
    let m: RegExpExecArray | null;
    if ((m = /^CREATE TYPE "(\w+)" AS ENUM \(/i.exec(s))) { bump("CREATE TYPE"); continue; }
    if ((m = /^ALTER TYPE "(\w+)" ADD VALUE (?:IF NOT EXISTS )?'((?:[^']|'')*)'(?: (?:BEFORE|AFTER) '(?:[^']|'')*')?$/i.exec(s))) {
      bump("ALTER TYPE ADD VALUE"); addedEnumValues.push([m[1], m[2]]); if (!newEnums.has(m[1])) alteredEnums.add(m[1]); continue;
    }
    if (/^ALTER TYPE /i.test(s)) { v(/ RENAME /i.test(s) ? "RENAME" : /\bDROP\b/i.test(s) ? "DROP" : "UNCLASSIFIED", s); continue; }
    if (/^CREATE TABLE /i.test(s)) { bump("CREATE TABLE"); continue; }
    if ((m = /^CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?"?(\w+)"? ON (?:ONLY )?(?:"?public"?\.)?"(\w+)"\s*(?:USING \w+\s*)?\((.*?)\)(?:\s+WHERE (.*))?$/i.exec(s))) {
      const ix: IdxInfo = { name: m[2], table: m[3], unique: !!m[1], cols: splitTop(m[4]).map((c) => unq(c.replace(/\s+(ASC|DESC|NULLS \w+).*$/i, ""))), where: m[5] ?? null };
      indexes.push(ix); bump(ix.unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX");
      if (!newTables.has(ix.table)) {
        touchedExisting.add(ix.table);
        if (ix.unique && ix.table === "AccountContact") v("ACCOUNTCONTACT_UNIQUE", s);
        else if (ix.unique && !emptySafePartial(ix)) v("UNIQUE_ON_EXISTING", s);
      }
      continue;
    }
    if ((m = /^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:"?public"?\.)?"(\w+)" (.*)$/i.exec(s))) {
      const t = m[1];
      const existing = !newTables.has(t);
      for (const act of splitTop(m[2])) {
        let a: RegExpExecArray | null;
        if ((a = /^ADD COLUMN (?:IF NOT EXISTS )?"(\w+)" (.*)$/i.exec(act))) {
          bump("ADD COLUMN");
          if (existing) {
            touchedExisting.add(t);
            const def = /\bDEFAULT\b/i.test(a[2]);
            if (/\bNOT NULL\b/i.test(a[2]) && !def) v("ADD_COLUMN_NOT_NULL_NO_DEFAULT", `${t}.${a[1]} ${a[2]}`);
            if (def && VOLATILE_DEFAULT.test(a[2])) v("VOLATILE_DEFAULT_EXISTING", `${t}.${a[1]} ${a[2]}`);
            if (/\b(PRIMARY KEY|UNIQUE|CHECK|REFERENCES)\b/i.test(a[2])) v("CONSTRAINT_ON_EXISTING", `${t}.${a[1]} ${a[2]}`);
          }
          continue;
        }
        if ((a = /^ADD CONSTRAINT "?(\w+)"? FOREIGN KEY \(([^)]*)\)/i.exec(act))) {
          bump("ADD FOREIGN KEY");
          if (existing) {
            touchedExisting.add(t);
            const fkCols = splitTop(a[2]).map(unq);
            const added = addedCols.get(t);
            if (!fkCols.every((c) => added?.has(c) && !/\bDEFAULT\b/i.test(added.get(c) ?? ""))) v("FK_ON_EXISTING_COLUMN", `${t}(${fkCols.join(",")})`);
          }
          continue;
        }
        if ((a = /^ADD CONSTRAINT "?(\w+)"? (UNIQUE|PRIMARY KEY|CHECK|EXCLUDE)\b/i.exec(act))) {
          bump(`ADD ${a[2].toUpperCase()}`);
          if (existing) { touchedExisting.add(t); v(/UNIQUE/i.test(a[2]) ? (t === "AccountContact" ? "ACCOUNTCONTACT_UNIQUE" : "UNIQUE_ON_EXISTING") : "CONSTRAINT_ON_EXISTING", `${t}: ${act}`); }
          continue;
        }
        if (/^ALTER COLUMN\b/i.test(act) || /^ALTER "?\w+"? (SET|DROP|TYPE)\b/i.test(act)) {
          if (existing) { touchedExisting.add(t); v("ALTER_COLUMN_EXISTING", `${t}: ${act}`); } else bump("ALTER COLUMN (new table)");
          continue;
        }
        if (/^DROP\b/i.test(act)) { if (existing) touchedExisting.add(t); v("DROP", `${t}: ${act}`); continue; }
        if (/^RENAME\b/i.test(act)) { if (existing) touchedExisting.add(t); v("RENAME", `${t}: ${act}`); continue; }
        if (existing) touchedExisting.add(t);
        v("UNCLASSIFIED", `${t}: ${act}`);
      }
      continue;
    }
    if (/^(UPDATE|DELETE|INSERT|TRUNCATE|COPY|MERGE)\b/i.test(s)) { v("DATA_STATEMENT", s); continue; }
    if (/^DROP\b/i.test(s)) { v("DROP", s); continue; }
    if (/^ALTER \w+ .* RENAME\b/i.test(s)) { v("RENAME", s); continue; }
    v("UNCLASSIFIED", s);
  }
  // an enum value added by ALTER TYPE … ADD VALUE cannot be used in the same migration (PG: "unsafe use of new value")
  for (const [T, V] of addedEnumValues) {
    const esc = V.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const uses = [
      new RegExp(`'${esc}'\\s*::\\s*"?${T}"?`),
      new RegExp(`"${T}"(?:\\[\\])?(?:\\s+NOT NULL)?\\s+DEFAULT\\s+'${esc}'`, "i"),
      new RegExp(`SET DEFAULT\\s+'${esc}'`, "i"),
      new RegExp(`\\bWHERE\\b.*'${esc}'`, "i"),
    ];
    for (const s of statements) {
      if (/^ALTER TYPE /i.test(s)) continue;
      if (uses.some((re) => re.test(s))) v("NEW_ENUM_VALUE_USED", `${T}.${V} in: ${s}`);
    }
  }
  return { statements, violations, newTables, newEnums, addedEnumValues, addedCols, indexes, touchedExisting, alteredEnums, kinds };
}

/** Migration-name rules: one `<14-digit valid timestamp>_crm_v2_b`, after crm_v2_a, timestamp not shared, no crm_v2_d. */
function migNameProblems(dirs: string[]): string[] {
  const p: string[] = [];
  const b = dirs.filter((d) => /_crm_v2_b$/.test(d));
  const a = dirs.find((d) => /_crm_v2_a$/.test(d));
  if (b.length !== 1) p.push(`expected exactly one *_crm_v2_b dir, found ${b.length}`);
  for (const d of b) {
    const m = /^(\d+)_crm_v2_b$/.exec(d);
    const ts = m?.[1] ?? "";
    if (ts.length !== 14) p.push(`${d}: timestamp is not 14 digits`);
    else {
      const [Y, M, D, h, mi, s] = [ts.slice(0, 4), ts.slice(4, 6), ts.slice(6, 8), ts.slice(8, 10), ts.slice(10, 12), ts.slice(12, 14)].map(Number);
      const dt = new Date(Date.UTC(Y, M - 1, D, h, mi, s));
      if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D || h > 23 || mi > 59 || s > 59) p.push(`${d}: not a real date/time`);
    }
    if (!a) p.push("no *_crm_v2_a dir to sort after");
    else if (!(d > a)) p.push(`${d} does not sort after ${a}`);
    const clash = dirs.filter((x) => x !== d && x.split("_")[0] === ts);
    if (clash.length) p.push(`${d}: timestamp shared with ${clash.join(",")}`);
  }
  const crm = dirs.filter((d) => /_crm_v2_/.test(d) && !/_crm_v2_[abc]$/.test(d));
  if (crm.length) p.push(`unexpected CRM v2 migration(s): ${crm.join(",")} (R-C.1: exactly a/b/c)`);
  return p;
}

// ════════════════════════════════ contract data ════════════════════════════════
const TX = "text", I4 = "int4", I8 = "int8", BO = "bool", TA = "_text";
const TS = ["timestamp", "timestamptz"], JS = ["jsonb", "json"];
type ColSpec = { udt?: string | string[]; nn?: boolean; def?: "true" | "false" | "0" | "1" | "[]" | string };
type TableSpec = { cols: Record<string, ColSpec>; unique?: string[][]; index?: string[][]; sev?: Sev; why: string };
const c = (udt?: string | string[], nn?: boolean, def?: ColSpec["def"]): ColSpec => ({ udt, nn, def });
const tenantCols = { tenantId: c(TX, true) };
const sysCols = { tenantId: c(TX, true), systemId: c(TX, true) };
const NEW_ENUMS: Record<string, string[]> = {
  CrmAssignMode: ["FIXED", "ROUND_ROBIN", "TEAM_LEAD", "LEAST_OPEN"],
  CrmSeqStepKind: ["EMAIL", "LINE", "TASK", "WAIT", "SMS"],
  CrmEnrollStatus: ["ACTIVE", "PAUSED", "DONE", "STOPPED"],
  CrmEmailStatus: ["QUEUED", "SENT", "DELIVERED", "OPENED", "BOUNCED", "FAILED", "RECEIVED"],
  CrmEmailEventKind: ["OPEN", "CLICK", "BOUNCE", "COMPLAINT", "REPLY", "UNSUBSCRIBE"],
  CrmWebEventKind: ["PAGEVIEW", "CLICK", "FORM_VIEW", "FORM_SUBMIT", "IDENTIFY", "CONSENT"],
};
const NEW_TABLES: Record<string, TableSpec> = {
  CrmScoreRule: { why: "§4.3 scoring rules (C2.8)", cols: { ...sysCols, name: c(TX, true), event: c(TX, true), conditions: c(JS, false), points: c(I4, true), expiresDays: c(I4, false), maxPerDay: c(I4, false), active: c(BO, true, "true"), isSystem: c(BO, true, "false"), sortOrder: c(I4) }, index: [["systemId", "event"]] },
  CrmScoreLog: { why: "§4.3 score log (C2.8 decay/explain)", cols: { ...tenantCols, contactId: c(TX, true), ruleId: c(TX, false), points: c(I4, true), reason: c(TX, true), refType: c(TX, false), refId: c(TX, false), eventKey: c(TX, false), expiresAt: c(TS, false), expired: c(BO, true, "false"), createdAt: c(TS, true) }, index: [["contactId", "createdAt"], ["expiresAt", "expired"]] },
  CrmAssignmentRule: { why: "§4.3 assignment (C2.3)", cols: { ...sysCols, name: c(TX, true), conditions: c(JS, true), mode: c("CrmAssignMode", true), userIds: c(TA, true, "[]"), teamId: c(TX, false), rrCursor: c(I4, true, "0"), maxOpenPerUser: c(I4, false), sortOrder: c(I4), active: c(BO, true, "true"), stats: c(JS, false) }, index: [["systemId", "sortOrder"]] },
  CrmSequence: { why: "§4.3 + brief (version for 'edit = new version') (C2.2)", cols: { ...sysCols, name: c(TX, true), description: c(TX, false), stopOnReply: c(BO, true, "true"), stopOnWon: c(BO, true, "true"), stopOnLost: c(BO, true, "true"), businessDaysOnly: c(BO, true, "true"), sendWindow: c(JS, false), maxActive: c(I4, false), active: c(BO, true, "true"), stats: c(JS, false), createdById: c(TX), archivedAt: c(TS, false), version: c(I4, true, "1") }, index: [["systemId", "active"]] },
  CrmSequenceStep: { why: "§4.3 steps (C2.2) + R2 version — unique checked in S3.11", cols: { ...tenantCols, sequenceId: c(TX, true), version: c(I4, true), index: c(I4, true), kind: c("CrmSeqStepKind", true), templateId: c(TX, false), subject: c(TX, false), body: c(TX, false), waitDays: c(I4, false), waitHours: c(I4, false), taskTitle: c(TX, false), taskType: c("CrmActivityType", false), channel: c(TX, false) } },
  CrmSequenceEnrollment: { why: "§4.3 + brief (sequenceVersion · leaseUntil X5) (C2.2) — R3 one-ACTIVE partial unique checked in X3.2", cols: { ...tenantCols, sequenceId: c(TX, true), contactId: c(TX, true), dealId: c(TX, false), enrolledById: c(TX, false), enrolledBy: c(TX, true), stepIndex: c(I4, true, "0"), nextAt: c(TS, false), status: c("CrmEnrollStatus", true, "ACTIVE"), stoppedReason: c(TX, false), stoppedAt: c(TS, false), stats: c(JS, false), sequenceVersion: c(I4, true), leaseUntil: c(TS, false) }, index: [["status", "nextAt"], ["contactId"]] },
  CrmEmailMessage: { why: "§4.3 e-mail (C2.5) + brief leaseUntil (scheduled send X5)", cols: { ...sysCols, contactId: c(TX, false), companyId: c(TX, false), dealId: c(TX, false), direction: c("CrmDirection", true), messageId: c(TX, true), inReplyTo: c(TX, false), references: c(TA), threadKey: c(TX, true), fromAddr: c(TX, true), fromName: c(TX, false), toAddrs: c(TA), ccAddrs: c(TA), bccAddrs: c(TA), subject: c(TX, true), bodyHtml: c(TX, false), bodyText: c(TX, false), snippet: c(TX, false), attachments: c(JS, false), sentById: c(TX, false), sentAt: c(TS, false), receivedAt: c(TS, false), scheduledAt: c(TS, false), status: c("CrmEmailStatus", true), providerId: c(TX, false), providerError: c(TX, false), sequenceStepId: c(TX, false), campaignId: c(TX, false), templateId: c(TX, false), trackTokenHash: c(TX, true), openCount: c(I4, true, "0"), clickCount: c(I4, true, "0"), firstOpenedAt: c(TS, false), lastOpenedAt: c(TS, false), repliedAt: c(TS, false), routing: c(JS, false), matchedBy: c(TX, false), purgedAt: c(TS, false), leaseUntil: c(TS, false) }, unique: [["messageId"], ["trackTokenHash"]], index: [["contactId", "sentAt"], ["threadKey", "sentAt"], ["systemId", "direction", "sentAt"], ["systemId", "matchedBy"], ["scheduledAt", "status"]] },
  CrmEmailEvent: { why: "§4.3 e-mail events (child — tenantId for the scope guard) + R7b providerEventId (partial unique in S3.15)", cols: { ...tenantCols, emailId: c(TX, true), kind: c("CrmEmailEventKind", true), providerEventId: c(TX, false), url: c(TX, false), userAgent: c(TX, false), at: c(TS, true) }, index: [["emailId", "at"], ["kind", "at"]] },
  CrmEmailTemplate: { why: "§4.3 templates", cols: { ...sysCols, name: c(TX, true), subject: c(TX, true), bodyHtml: c(TX, true), category: c(TX, false), variables: c(TA), active: c(BO, true), isSystem: c(BO, true), sortOrder: c(I4) }, unique: [["systemId", "name"]] },
  CrmEmailUserSetting: { why: "§4.3 per-user e-mail override (C4)", cols: { ...sysCols, userId: c(TX, true), fromName: c(TX, false), fromAddr: c(TX, false), replyToMode: c(TX, true), replyToAddr: c(TX, false), copyToAddr: c(TX, false), copyMode: c(TX, true), signatureHtml: c(TX, false), providerId: c(TX, false) }, unique: [["systemId", "userId"]] },
  CrmMailProvider: { why: "§4.3 skeleton", cols: { ...sysCols, userId: c(TX, false), kind: c(TX, true), status: c(TX, true), tokenRef: c(TX, false), lastSyncAt: c(TS, false) }, unique: [["systemId", "userId", "kind"]] },
  EmailDomain: { why: "brief + §15 (tenant-scoped verified sending domain)", cols: { ...tenantCols, domain: c(TX, true), status: c(TX, true), providerId: c(TX, false), records: c(JS, false), verifiedAt: c(TS, false), createdAt: c(TS, true) }, unique: [["tenantId", "domain"]] },
  CrmTrackedLink: { why: "§4.3 tracked links (C2.6)", cols: { ...sysCols, code: c(TX, true), url: c(TX, true), name: c(TX, false), campaignId: c(TX, false), linkId: c(TX, false), channel: c(TX, false), clicks: c(I4, true, "0"), uniqueClicks: c(I4, true, "0"), active: c(BO, true, "true"), expiresAt: c(TS, false), createdById: c(TX), createdAt: c(TS, true) }, unique: [["code"]], index: [["systemId", "createdAt"]] },
  CrmTrackedClick: { why: "§4.3 clicks (child)", cols: { ...tenantCols, linkId: c(TX, true), contactId: c(TX, false), emailId: c(TX, false), webSessionId: c(TX, false), userAgent: c(TX, false), at: c(TS, true) }, index: [["linkId", "at"]] },
  CrmWebSession: { why: "§4.3 web sessions (C2.6 — ipHash, no raw IP)", cols: { ...sysCols, visitorId: c(TX, true), contactId: c(TX, false), consentVersion: c([I4, TX], false), consentAt: c(TS, false), firstUrl: c(TX, false), referrer: c(TX, false), utm: c(JS, false), userAgent: c(TX, false), ipHash: c(TX, false), startedAt: c(TS, true), lastSeenAt: c(TS, true), pageViews: c(I4, true, "0"), identifiedBy: c(TX, false), purgedAt: c(TS, false) }, index: [["systemId", "visitorId"], ["contactId", "startedAt"], ["lastSeenAt"]] },
  CrmWebEvent: { why: "§4.3 web events (child)", cols: { ...tenantCols, sessionId: c(TX, true), kind: c("CrmWebEventKind", true), url: c(TX, false), title: c(TX, false), durationSec: c(I4, false), meta: c(JS, false), at: c(TS, true) }, index: [["sessionId", "at"]] },
  CrmDealPayment: { why: "brief + C29 (POS↔deal link AND recordPayment flag) + R4 refType/status plain text", cols: { ...sysCols, dealId: c(TX, true), refType: c(TX, true), refId: c(TX, true), satang: c(I8, true), status: c(TX, true), countedAt: c(TS, false), reversedAt: c(TS, false), createdAt: c(TS, true) }, unique: [["dealId", "refType", "refId"]] },
  CrmUserPref: { why: "brief + C22 (per-user notification prefs + quiet hours)", cols: { ...sysCols, userId: c(TX, true), notifications: c(JS, true), quietHours: c(JS, false) }, unique: [["systemId", "userId"]] },
  CrmImportJob: { why: "C1.4 debt (contacts.ts:1948 'the real job table comes with C2.0') + R5 shape", cols: { ...sysCols, kind: c(TX, true), status: c(TX, true), createdById: c(TX), totalRows: c(I4, true, "0"), processedRows: c(I4, true, "0"), result: c(JS, false), error: c(TX, false), leaseUntil: c(TS, false), startedAt: c(TS, false), finishedAt: c(TS, false), createdAt: c(TS, true) }, index: [["status", "leaseUntil"]] },
};
const NEW_TABLE_NAMES = Object.keys(NEW_TABLES);
const NEW_TABLE_SET = new Set(NEW_TABLE_NAMES);
/** Phase C3 tables belong to crm_v2_c (R-C.1) — must not appear here. */
const C3_TABLES = ["CrmQuota", "CrmCommissionRule", "CrmCommission", "CrmPortalAccess", "CrmPortalRequest", "PortalSession"];
const EXISTING_NEW_COLS: Record<string, Record<string, ColSpec>> = {
  FormDef: { crmSystemId: c(TX, false), assignRuleId: c(TX, false), utmCapture: c(BO, true, "true"), scoreOnSubmit: c(I4, false), createCompanyFromField: c(TX, false), spamGuard: c(JS, false) },
  FormSubmission: { utm: c(JS, false), pageUrl: c(TX, false), referrer: c(TX, false), webSessionId: c(TX, false) },
  CrmContact: { trackingOptOut: c(BO, true, "false") },
  CrmDeal: { archivedAt: c(TS, false) },
};
/** Expected value a v1-shaped insert gets in the new columns (S5.4). null = SQL NULL. */
const V1_EXPECT: Record<string, Record<string, unknown>> = {
  FormDef: { crmSystemId: null, assignRuleId: null, utmCapture: true, scoreOnSubmit: null, createCompanyFromField: null, spamGuard: null },
  FormSubmission: { utm: null, pageUrl: null, referrer: null, webSessionId: null },
  CrmContact: { trackingOptOut: false },
  CrmDeal: { archivedAt: null },
  AutomationRun: { crmContactId: null },
};

// ════════════════════════════════ synthetic SQL for the parser self-tests (T0.x) ════════════════════════════════
const SAMPLE_GOOD = `-- CreateEnum
CREATE TYPE "CrmAssignMode" AS ENUM ('FIXED', 'ROUND_ROBIN');
-- AlterEnum
ALTER TYPE "CrmActivitySource" ADD VALUE 'KANBAN';
/* block comment ; with a semicolon */
ALTER TABLE "CrmContact" ADD COLUMN     "trackingOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FormDef" ADD COLUMN     "crmSystemId" TEXT,
ADD COLUMN     "utmCapture" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spamGuard" JSONB;
CREATE TABLE "CrmAssignmentRule" (
    "id" TEXT NOT NULL,
    "note" TEXT DEFAULT 'a;b, c',
    "mode" "CrmAssignMode" NOT NULL DEFAULT 'FIXED',
    "rrCursor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmAssignmentRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CrmDealPayment" ("id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "refType" TEXT NOT NULL, "refId" TEXT NOT NULL, "satang" BIGINT NOT NULL, CONSTRAINT "CrmDealPayment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CrmDealPayment_dealId_refType_refId_key" ON "CrmDealPayment"("dealId", "refType", "refId");
CREATE INDEX "CrmAssignmentRule_rrCursor_idx" ON "CrmAssignmentRule"("rrCursor");
ALTER TABLE "AutomationRun" ADD COLUMN "crmContactId" TEXT;
CREATE UNIQUE INDEX "AutomationRun_ruleId_crmContactId_eventKey_key" ON "AutomationRun"("ruleId", "crmContactId", "eventKey") WHERE "crmContactId" IS NOT NULL;
CREATE INDEX "CrmCompanyContact_companyId_isPrimary_idx" ON "CrmCompanyContact"("companyId", "isPrimary");
CREATE INDEX "CrmDeal_systemId_archivedAt_idx" ON "CrmDeal"("systemId", "archivedAt");
ALTER TABLE "CrmDeal" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "CrmDealPayment" ADD CONSTRAINT "CrmDealPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormDef" ADD CONSTRAINT "FormDef_crmSystemId_fkey" FOREIGN KEY ("crmSystemId") REFERENCES "AppSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`;
const SAMPLE_BAD: [string, string[]][] = [
  [`ALTER TABLE "CrmContact" DROP COLUMN "company";`, ["DROP"]],
  [`DROP INDEX "CrmDeal_systemId_kind_idx";`, ["DROP"]],
  [`ALTER TABLE "CrmDeal" RENAME COLUMN "title" TO "name";`, ["RENAME"]],
  [`ALTER TABLE "CrmDeal" ALTER COLUMN "valueSatang" SET DATA TYPE BIGINT;`, ["ALTER_COLUMN_EXISTING"]],
  [`ALTER TABLE "FormDef" ALTER COLUMN "description" SET NOT NULL;`, ["ALTER_COLUMN_EXISTING"]],
  [`ALTER TABLE "CrmContact" ALTER COLUMN "source" SET DEFAULT 'X';`, ["ALTER_COLUMN_EXISTING"]],
  [`ALTER TABLE "CrmContact" ADD COLUMN "trackingOptOut" BOOLEAN NOT NULL;`, ["ADD_COLUMN_NOT_NULL_NO_DEFAULT"]],
  [`ALTER TYPE "CrmActivitySource" ADD VALUE 'KANBAN'; CREATE TABLE "X" ("id" TEXT NOT NULL, "src" "CrmActivitySource" NOT NULL DEFAULT 'KANBAN');`, ["NEW_ENUM_VALUE_USED"]],
  [`ALTER TYPE "CrmActivitySource" ADD VALUE 'KANBAN'; CREATE INDEX "a_idx" ON "CrmActivity"("source") WHERE "source" = 'KANBAN'::"CrmActivitySource";`, ["NEW_ENUM_VALUE_USED"]],
  [`CREATE UNIQUE INDEX "CrmContact_email_key" ON "CrmContact"("systemId", "email");`, ["UNIQUE_ON_EXISTING"]],
  [`CREATE UNIQUE INDEX "CrmCompanyContact_x_key" ON "CrmCompanyContact"("companyId");`, ["UNIQUE_ON_EXISTING"]],
  [`CREATE UNIQUE INDEX "AccountContact_systemId_partyId_key" ON "AccountContact"("systemId", "partyId");`, ["ACCOUNTCONTACT_UNIQUE"]],
  [`CREATE UNIQUE INDEX "CrmCompanyContact_one_primary_key" ON "CrmCompanyContact"("companyId") WHERE "isPrimary" AND "endedAt" IS NULL;`, ["UNIQUE_ON_EXISTING"]],
  [`ALTER TABLE "AutomationRun" ADD COLUMN "crmContactId" TEXT DEFAULT 'x'; CREATE UNIQUE INDEX "a_key" ON "AutomationRun"("ruleId", "crmContactId", "eventKey") WHERE "crmContactId" IS NOT NULL;`, ["UNIQUE_ON_EXISTING"]],
  [`CREATE UNIQUE INDEX "a_key" ON "AutomationRun"("ruleId", "customerId", "eventKey") WHERE "customerId" IS NOT NULL;`, ["UNIQUE_ON_EXISTING"]],
  [`ALTER TABLE "FormDef" ADD COLUMN "crmSystemId" TEXT DEFAULT 'sys1'; ALTER TABLE "FormDef" ADD CONSTRAINT "FormDef_crmSystemId_fkey" FOREIGN KEY ("crmSystemId") REFERENCES "AppSystem"("id");`, ["FK_ON_EXISTING_COLUMN"]],
  [`UPDATE "CrmCompanyContact" SET "isPrimary" = false WHERE "id" = 'x';`, ["DATA_STATEMENT"]],
  [`TRUNCATE "CrmScoreLog";`, ["DATA_STATEMENT"]],
  [`ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_contactId_fkey2" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id");`, ["FK_ON_EXISTING_COLUMN"]],
  [`ALTER TABLE "FormSubmission" ADD COLUMN "token" TEXT NOT NULL DEFAULT gen_random_uuid();`, ["VOLATILE_DEFAULT_EXISTING"]],
  [`ALTER TABLE "FormDef" ADD CONSTRAINT "FormDef_chk" CHECK ("active");`, ["CONSTRAINT_ON_EXISTING"]],
  [`CREATE TRIGGER t AFTER INSERT ON "CrmDeal" FOR EACH ROW EXECUTE FUNCTION f();`, ["UNCLASSIFIED"]],
  [`ALTER TYPE "CrmActivitySource" RENAME VALUE 'RULE' TO 'RULES';`, ["RENAME"]],
  [`DO $x$ BEGIN RAISE NOTICE ';'; END $x$;`, ["UNCLASSIFIED"]],
];
const SAMPLE_SPLIT = `SELECT 'a;b'; -- c;
/* d; */ DO $x$ BEGIN RAISE NOTICE ';'; END $x$; CREATE TABLE "A" ("x" TEXT DEFAULT 'it''s;');`;

// ════════════════════════════════ uiVersion-1 baseline — pre-C2.0 columns captured from QC (19 Sep 2569, after crm_v2_a) ════════════════════════════════
// [column, udt_name, nullable(1)/not-null(0), column_default] — C2.0 must leave every one of these exactly as is (S5.1)
const BASELINE: Record<string, [string, string, 0 | 1, string | null][]> = {
  AutomationRun: [["id","text",0,null],["tenantId","text",0,null],["ruleId","text",0,null],["status","AutomationRunStatus",0,null],["detail","text",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["boardId","text",1,null],["cardId","text",1,null],["customerId","text",1,null],["eventKey","text",1,null],["finishedAt","timestamp",1,null],["journeyId","text",1,null],["payload","jsonb",1,null],["scheduledAt","timestamp",1,null],["stepIndex","int4",1,null]],
  CrmContact: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["name","text",0,null],["phone","text",1,null],["email","text",1,null],["company","text",1,null],["lifecycleStage","CrmLifecycleStage",0,"'LEAD'::\"CrmLifecycleStage\""],["source","text",1,null],["ownerUserId","text",1,null],["memberCustomerId","text",1,null],["note","text",1,null],["archivedAt","timestamp",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null],["partyId","text",1,null],["assignedAt","timestamp",1,null],["assignedBy","text",1,null],["attributionId","text",1,null],["companyId","text",1,null],["convertedAt","timestamp",1,null],["department","text",1,null],["emailBouncedAt","timestamp",1,null],["emailOptOut","bool",0,"false"],["firstName","text",1,null],["jobTitle","text",1,null],["lastActivityAt","timestamp",1,null],["lastName","text",1,null],["leadStatus","CrmLeadStatus",0,"'NEW'::\"CrmLeadStatus\""],["lineUserId","text",1,null],["locale","text",1,"'th'::text"],["marketingOptOut","bool",0,"false"],["mergedIntoId","text",1,null],["nextActivityAt","timestamp",1,null],["portalAccessAt","timestamp",1,null],["previousEmails","_text",1,"ARRAY[]::text[]"],["score","int4",0,"0"],["scoreBand","CrmScoreBand",1,null],["scoreUpdatedAt","timestamp",1,null],["sourceChannel","text",1,null],["sourceDetail","jsonb",1,null],["sourceKind","MemberSource",1,null],["tags","_text",1,"ARRAY[]::text[]"],["teamId","text",1,null],["titleTh","text",1,null]],
  CrmDeal: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["contactId","text",0,null],["pipelineId","text",0,null],["stageId","text",0,null],["title","text",0,null],["valueSatang","int4",0,"0"],["kind","CrmStageKind",0,"'OPEN'::\"CrmStageKind\""],["expectedCloseAt","timestamp",1,null],["closedAt","timestamp",1,null],["ownerUserId","text",1,null],["lostReason","text",1,null],["quotationDocId","text",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null],["collaboratorUserIds","_text",1,"ARRAY[]::text[]"],["companyId","text",1,null],["currency","text",0,"'THB'::text"],["discountBp","int4",0,"0"],["forecastCategory","CrmForecastCategory",0,"'PIPELINE'::\"CrmForecastCategory\""],["invoiceDocId","text",1,null],["kanbanCardId","text",1,null],["lastActivityAt","timestamp",1,null],["lostReasonId","text",1,null],["nextActivityAt","timestamp",1,null],["nextStep","text",1,null],["paidSatang","int8",0,"0"],["pendingApprovalRequestId","text",1,null],["pendingLines","jsonb",1,null],["probabilityOverride","int4",1,null],["reopenedCount","int4",0,"0"],["sourceDetail","jsonb",1,null],["sourceKind","MemberSource",1,null],["stageEnteredAt","timestamp",0,"CURRENT_TIMESTAMP"],["stalledAt","timestamp",1,null],["tags","_text",1,"ARRAY[]::text[]"],["teamId","text",1,null],["wonValueSatang","int8",1,null]],
  CrmActivity: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["contactId","text",1,null],["dealId","text",1,null],["type","CrmActivityType",0,"'TASK'::\"CrmActivityType\""],["title","text",0,null],["dueAt","timestamp",1,null],["doneAt","timestamp",1,null],["ownerUserId","text",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["aiNextStep","text",1,null],["aiSummary","text",1,null],["attendees","jsonb",1,null],["body","text",1,null],["channel","text",1,null],["companyId","text",1,null],["completedById","text",1,null],["customRecordId","text",1,null],["direction","CrmDirection",1,null],["durationSec","int4",1,null],["endAt","timestamp",1,null],["kanbanCardId","text",1,null],["location","text",1,null],["meetingUrl","text",1,null],["mentions","_text",1,"ARRAY[]::text[]"],["outcome","text",1,null],["pinned","bool",0,"false"],["priority","CrmPriority",0,"'NORMAL'::\"CrmPriority\""],["recordingFileId","text",1,null],["remindAt","timestamp",1,null],["source","CrmActivitySource",0,"'MANUAL'::\"CrmActivitySource\""],["sourceRef","text",1,null],["startAt","timestamp",1,null],["transcript","text",1,null]],
  CrmCompany: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["partyId","text",0,null],["name","text",0,null],["legalName","text",1,null],["taxId","text",1,null],["branchCode","text",1,"'00000'::text"],["industry","text",1,null],["size","CrmCompanySize",1,null],["website","text",1,null],["emailDomain","text",1,null],["phone","text",1,null],["email","text",1,null],["lineOaId","text",1,null],["lifecycleStage","CrmLifecycleStage",0,"'LEAD'::\"CrmLifecycleStage\""],["score","int4",0,"0"],["ownerUserId","text",1,null],["teamId","text",1,null],["parentCompanyId","text",1,null],["accountContactId","text",1,null],["memberCustomerId","text",1,null],["tags","_text",1,"ARRAY[]::text[]"],["note","text",1,null],["logoFileId","text",1,null],["annualRevenueSatang","int8",1,null],["employeeCount","int4",1,null],["foundedYear","int4",1,null],["lastActivityAt","timestamp",1,null],["openDealCount","int4",0,"0"],["wonValueSatang","int8",0,"0"],["outstandingSatang","int8",0,"0"],["mergedIntoId","text",1,null],["archivedAt","timestamp",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null]],
  CrmCompanyContact: [["id","text",0,null],["tenantId","text",0,null],["companyId","text",0,null],["contactId","text",0,null],["role","CrmContactRole",0,"'OTHER'::\"CrmContactRole\""],["jobTitle","text",1,null],["isPrimary","bool",0,"false"],["startedAt","timestamp",1,null],["endedAt","timestamp",1,null],["note","text",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"]],
  CrmPipeline: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["name","text",0,null],["isDefault","bool",0,"false"],["sortOrder","int4",0,"0"],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["archivedAt","timestamp",1,null],["autoInvoiceOnWon","bool",0,"false"],["autoWonOnPaid","bool",0,"false"],["currency","text",0,"'THB'::text"],["kind","CrmPipelineKind",0,"'SALES'::\"CrmPipelineKind\""],["stageOnQuoteAcceptedId","text",1,null],["stageOnQuoteRejectedId","text",1,null],["teamIds","_text",1,"ARRAY[]::text[]"]],
  CrmStage: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["pipelineId","text",0,null],["name","text",0,null],["kind","CrmStageKind",0,"'OPEN'::\"CrmStageKind\""],["probability","int4",0,"0"],["sortOrder","int4",0,"0"],["color","text",1,null],["description","text",1,null],["requireFields","_text",1,"ARRAY[]::text[]"],["requireLines","bool",0,"false"],["requireQuotation","bool",0,"false"],["staleDays","int4",1,null]],
  FormDef: [["id","text",0,null],["tenantId","text",0,null],["name","text",0,null],["description","text",1,null],["publicToken","text",0,null],["active","bool",0,"true"],["crmEnabled","bool",0,"false"],["fieldsJson","jsonb",0,"'[]'::jsonb"],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null]],
  FormSubmission: [["id","text",0,null],["tenantId","text",0,null],["formId","text",0,null],["answersJson","jsonb",0,"'{}'::jsonb"],["crmContactId","text",1,null],["ip","text",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"]],
  MemberActivity: [["id","text",0,null],["tenantId","text",0,null],["customerId","text",0,null],["unitId","text",1,null],["module","text",0,null],["type","text",0,null],["refType","text",1,null],["refId","text",1,null],["summary","text",0,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["actorUserId","text",1,null],["data","jsonb",1,null],["crmCompanyId","text",1,null],["crmContactId","text",1,null],["dealId","text",1,null]],
  PosSale: [["id","text",0,null],["tenantId","text",0,null],["unitId","text",0,null],["memberId","text",1,null],["sourceModule","text",0,"'POS'::text"],["sourceId","text",1,null],["idempotencyKey","text",0,null],["receiptNo","text",1,null],["status","PosSaleStatus",0,"'PAID'::\"PosSaleStatus\""],["subtotalSatang","int4",0,null],["discountSatang","int4",0,"0"],["vatSatang","int4",0,"0"],["grandTotalSatang","int4",0,null],["pointEarned","int4",0,"0"],["paidAt","timestamp",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null],["systemId","text",0,null],["attributionId","text",1,null],["giftCardTxnId","text",1,null],["stampEventIds","_text",1,"ARRAY[]::text[]"],["tierDiscountSatang","int4",0,"0"],["voucherUseIds","_text",1,"ARRAY[]::text[]"],["giftCardId","text",1,null]],
  AccountContact: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["kind","AccountContactKind",0,"'CUSTOMER'::\"AccountContactKind\""],["legalType","AccountLegalType",0,"'COMPANY'::\"AccountLegalType\""],["name","text",0,null],["taxId","text",1,null],["branchCode","text",1,"'00000'::text"],["branchName","text",1,null],["address","text",1,null],["phone","text",1,null],["email","text",1,null],["creditTermDays","int4",0,"0"],["note","text",1,null],["archivedAt","timestamp",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["updatedAt","timestamp",0,null],["bankAccountNote","text",1,null],["defaultPriceMode","AccountPriceMode",1,null],["defaultWhtRateBp","int4",1,null],["defaultWhtType","text",1,null],["mergedIntoId","text",1,null],["ownerUserId","text",1,null],["phoneNorm","text",1,null],["partyId","text",1,null],["addressLine","text",1,null],["apAccountCode","text",1,null],["arAccountCode","text",1,null],["code","text",1,null],["contactPerson","text",1,null],["country","text",1,"'TH'::text"],["district","text",1,null],["fax","text",1,null],["legalEntityType","text",1,null],["lineId","text",1,null],["officeType","text",1,null],["personTitle","text",1,null],["postcode","text",1,null],["province","text",1,null],["subdistrict","text",1,null],["tags","jsonb",0,"'[]'::jsonb"],["taxIdCountry","text",1,"'TH'::text"],["website","text",1,null]],
  MktRecipient: [["id","text",0,null],["tenantId","text",0,null],["systemId","text",0,null],["campaignId","text",0,null],["customerId","text",1,null],["contact","text",0,null],["sentAt","timestamp",1,null],["createdAt","timestamp",0,"CURRENT_TIMESTAMP"],["holdout","bool",0,"false"],["openedAt","timestamp",1,null],["saleSatang","int8",1,null],["usedAt","timestamp",1,null],["variant","text",1,null],["channel","text",1,null],["error","text",1,null],["saleId","text",1,null],["status","text",0,"'PENDING'::text"],["voucherId","text",1,null]],
};
const ENUM_BASELINE: Record<string, string[]> = {
  CrmActivitySource: ["MANUAL","AUTO","EMAIL","CHAT","CALENDAR","PORTAL","WEB","API","RULE"],
  CrmActivityType: ["CALL","MEETING","EMAIL","LINE","TASK","NOTE","CHAT","SMS","WHATSAPP","VISIT","WEB","PORTAL"],
  CrmCompanySize: ["MICRO","SMALL","MEDIUM","LARGE","ENTERPRISE"],
  CrmContactRole: ["DECISION_MAKER","INFLUENCER","COORDINATOR","BILLING","TECHNICAL","END_USER","OTHER"],
  CrmDirection: ["IN","OUT"],
  CrmForecastCategory: ["PIPELINE","BEST_CASE","COMMIT","OMITTED"],
  CrmLeadStatus: ["NEW","CONTACTED","QUALIFIED","UNQUALIFIED","NURTURE"],
  CrmLifecycleStage: ["LEAD","PROSPECT","CUSTOMER","LOST","CHURNED"],
  CrmPipelineKind: ["SALES","RENEWAL","SERVICE"],
  CrmPriority: ["LOW","NORMAL","HIGH"],
  CrmScoreBand: ["HOT","WARM","COLD"],
  CrmStageKind: ["OPEN","WON","LOST"],
  CrmVisibility: ["OWN","TEAM","ALL"],
};
/** indexes of the existing tables C2.0 may touch (+ AccountContact, PosSale) — every one must survive unchanged (S5.5) */
const IDX_BASELINE: Record<string, [string, string][]> = {
  CrmContact: [["CrmContact_partyId_idx","CREATE INDEX \"CrmContact_partyId_idx\" ON public.\"CrmContact\" USING btree (\"partyId\")"],["CrmContact_pkey","CREATE UNIQUE INDEX \"CrmContact_pkey\" ON public.\"CrmContact\" USING btree (id)"],["CrmContact_systemId_companyId_idx","CREATE INDEX \"CrmContact_systemId_companyId_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"companyId\")"],["CrmContact_systemId_lastActivityAt_idx","CREATE INDEX \"CrmContact_systemId_lastActivityAt_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"lastActivityAt\")"],["CrmContact_systemId_leadStatus_idx","CREATE INDEX \"CrmContact_systemId_leadStatus_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"leadStatus\")"],["CrmContact_systemId_lifecycleStage_idx","CREATE INDEX \"CrmContact_systemId_lifecycleStage_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"lifecycleStage\")"],["CrmContact_systemId_mergedIntoId_idx","CREATE INDEX \"CrmContact_systemId_mergedIntoId_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"mergedIntoId\")"],["CrmContact_systemId_ownerUserId_idx","CREATE INDEX \"CrmContact_systemId_ownerUserId_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"ownerUserId\")"],["CrmContact_systemId_phone_idx","CREATE INDEX \"CrmContact_systemId_phone_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", phone)"],["CrmContact_systemId_score_idx","CREATE INDEX \"CrmContact_systemId_score_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", score)"],["CrmContact_systemId_teamId_idx","CREATE INDEX \"CrmContact_systemId_teamId_idx\" ON public.\"CrmContact\" USING btree (\"systemId\", \"teamId\")"],["CrmContact_tenantId_email_idx","CREATE INDEX \"CrmContact_tenantId_email_idx\" ON public.\"CrmContact\" USING btree (\"tenantId\", email)"],["CrmContact_tenantId_idx","CREATE INDEX \"CrmContact_tenantId_idx\" ON public.\"CrmContact\" USING btree (\"tenantId\")"]],
  CrmDeal: [["CrmDeal_contactId_idx","CREATE INDEX \"CrmDeal_contactId_idx\" ON public.\"CrmDeal\" USING btree (\"contactId\")"],["CrmDeal_pkey","CREATE UNIQUE INDEX \"CrmDeal_pkey\" ON public.\"CrmDeal\" USING btree (id)"],["CrmDeal_systemId_companyId_idx","CREATE INDEX \"CrmDeal_systemId_companyId_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"companyId\")"],["CrmDeal_systemId_expectedCloseAt_idx","CREATE INDEX \"CrmDeal_systemId_expectedCloseAt_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"expectedCloseAt\")"],["CrmDeal_systemId_forecastCategory_expectedCloseAt_idx","CREATE INDEX \"CrmDeal_systemId_forecastCategory_expectedCloseAt_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"forecastCategory\", \"expectedCloseAt\")"],["CrmDeal_systemId_kind_idx","CREATE INDEX \"CrmDeal_systemId_kind_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", kind)"],["CrmDeal_systemId_ownerUserId_kind_expectedCloseAt_idx","CREATE INDEX \"CrmDeal_systemId_ownerUserId_kind_expectedCloseAt_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"ownerUserId\", kind, \"expectedCloseAt\")"],["CrmDeal_systemId_stageId_idx","CREATE INDEX \"CrmDeal_systemId_stageId_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"stageId\")"],["CrmDeal_systemId_stalledAt_idx","CREATE INDEX \"CrmDeal_systemId_stalledAt_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"stalledAt\")"],["CrmDeal_systemId_teamId_kind_idx","CREATE INDEX \"CrmDeal_systemId_teamId_kind_idx\" ON public.\"CrmDeal\" USING btree (\"systemId\", \"teamId\", kind)"]],
  CrmCompanyContact: [["CrmCompanyContact_companyId_contactId_key","CREATE UNIQUE INDEX \"CrmCompanyContact_companyId_contactId_key\" ON public.\"CrmCompanyContact\" USING btree (\"companyId\", \"contactId\")"],["CrmCompanyContact_contactId_idx","CREATE INDEX \"CrmCompanyContact_contactId_idx\" ON public.\"CrmCompanyContact\" USING btree (\"contactId\")"],["CrmCompanyContact_pkey","CREATE UNIQUE INDEX \"CrmCompanyContact_pkey\" ON public.\"CrmCompanyContact\" USING btree (id)"]],
  FormDef: [["FormDef_pkey","CREATE UNIQUE INDEX \"FormDef_pkey\" ON public.\"FormDef\" USING btree (id)"],["FormDef_publicToken_key","CREATE UNIQUE INDEX \"FormDef_publicToken_key\" ON public.\"FormDef\" USING btree (\"publicToken\")"],["FormDef_tenantId_active_idx","CREATE INDEX \"FormDef_tenantId_active_idx\" ON public.\"FormDef\" USING btree (\"tenantId\", active)"]],
  FormSubmission: [["FormSubmission_formId_createdAt_idx","CREATE INDEX \"FormSubmission_formId_createdAt_idx\" ON public.\"FormSubmission\" USING btree (\"formId\", \"createdAt\")"],["FormSubmission_pkey","CREATE UNIQUE INDEX \"FormSubmission_pkey\" ON public.\"FormSubmission\" USING btree (id)"],["FormSubmission_tenantId_idx","CREATE INDEX \"FormSubmission_tenantId_idx\" ON public.\"FormSubmission\" USING btree (\"tenantId\")"]],
  MemberActivity: [["MemberActivity_customerId_module_createdAt_idx","CREATE INDEX \"MemberActivity_customerId_module_createdAt_idx\" ON public.\"MemberActivity\" USING btree (\"customerId\", module, \"createdAt\")"],["MemberActivity_pkey","CREATE UNIQUE INDEX \"MemberActivity_pkey\" ON public.\"MemberActivity\" USING btree (id)"],["MemberActivity_tenantId_customerId_createdAt_idx","CREATE INDEX \"MemberActivity_tenantId_customerId_createdAt_idx\" ON public.\"MemberActivity\" USING btree (\"tenantId\", \"customerId\", \"createdAt\")"]],
  AutomationRun: [["AutomationRun_pkey","CREATE UNIQUE INDEX \"AutomationRun_pkey\" ON public.\"AutomationRun\" USING btree (id)"],["AutomationRun_ruleId_customerId_createdAt_idx","CREATE INDEX \"AutomationRun_ruleId_customerId_createdAt_idx\" ON public.\"AutomationRun\" USING btree (\"ruleId\", \"customerId\", \"createdAt\")"],["AutomationRun_ruleId_customerId_eventKey_key","CREATE UNIQUE INDEX \"AutomationRun_ruleId_customerId_eventKey_key\" ON public.\"AutomationRun\" USING btree (\"ruleId\", \"customerId\", \"eventKey\")"],["AutomationRun_tenantId_createdAt_idx","CREATE INDEX \"AutomationRun_tenantId_createdAt_idx\" ON public.\"AutomationRun\" USING btree (\"tenantId\", \"createdAt\")"],["AutomationRun_tenantId_ruleId_createdAt_idx","CREATE INDEX \"AutomationRun_tenantId_ruleId_createdAt_idx\" ON public.\"AutomationRun\" USING btree (\"tenantId\", \"ruleId\", \"createdAt\")"],["AutomationRun_tenantId_status_scheduledAt_idx","CREATE INDEX \"AutomationRun_tenantId_status_scheduledAt_idx\" ON public.\"AutomationRun\" USING btree (\"tenantId\", status, \"scheduledAt\")"]],
  AccountContact: [["AccountContact_partyId_idx","CREATE INDEX \"AccountContact_partyId_idx\" ON public.\"AccountContact\" USING btree (\"partyId\")"],["AccountContact_pkey","CREATE UNIQUE INDEX \"AccountContact_pkey\" ON public.\"AccountContact\" USING btree (id)"],["AccountContact_systemId_archivedAt_createdAt_idx","CREATE INDEX \"AccountContact_systemId_archivedAt_createdAt_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", \"archivedAt\", \"createdAt\")"],["AccountContact_systemId_code_active_key","CREATE UNIQUE INDEX \"AccountContact_systemId_code_active_key\" ON public.\"AccountContact\" USING btree (\"systemId\", code) WHERE ((code IS NOT NULL) AND (\"archivedAt\" IS NULL))"],["AccountContact_systemId_code_idx","CREATE INDEX \"AccountContact_systemId_code_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", code)"],["AccountContact_systemId_kind_archivedAt_idx","CREATE INDEX \"AccountContact_systemId_kind_archivedAt_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", kind, \"archivedAt\")"],["AccountContact_systemId_name_idx","CREATE INDEX \"AccountContact_systemId_name_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", name)"],["AccountContact_systemId_phoneNorm_idx","CREATE INDEX \"AccountContact_systemId_phoneNorm_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", \"phoneNorm\")"],["AccountContact_systemId_taxId_branchCode_active_key","CREATE UNIQUE INDEX \"AccountContact_systemId_taxId_branchCode_active_key\" ON public.\"AccountContact\" USING btree (\"systemId\", \"taxId\", \"branchCode\") WHERE ((\"taxId\" IS NOT NULL) AND (\"archivedAt\" IS NULL))"],["AccountContact_systemId_taxId_branchCode_idx","CREATE INDEX \"AccountContact_systemId_taxId_branchCode_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", \"taxId\", \"branchCode\")"],["AccountContact_systemId_taxId_idx","CREATE INDEX \"AccountContact_systemId_taxId_idx\" ON public.\"AccountContact\" USING btree (\"systemId\", \"taxId\")"]],
  PosSale: [["PosSale_pkey","CREATE UNIQUE INDEX \"PosSale_pkey\" ON public.\"PosSale\" USING btree (id)"],["PosSale_tenantId_idempotencyKey_key","CREATE UNIQUE INDEX \"PosSale_tenantId_idempotencyKey_key\" ON public.\"PosSale\" USING btree (\"tenantId\", \"idempotencyKey\")"],["PosSale_tenantId_unitId_createdAt_idx","CREATE INDEX \"PosSale_tenantId_unitId_createdAt_idx\" ON public.\"PosSale\" USING btree (\"tenantId\", \"unitId\", \"createdAt\")"],["PosSale_unitId_receiptNo_key","CREATE UNIQUE INDEX \"PosSale_unitId_receiptNo_key\" ON public.\"PosSale\" USING btree (\"unitId\", \"receiptNo\")"]],
};

// ════════════════════════════════ run ════════════════════════════════
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { resolveCrmScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
const { Client } = (await import("pg" as string)) as { Client: new (o: Any) => Any };
const newClient = async () => { const cl = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20_000 }); await cl.connect(); return cl; };
const db = await newClient();
const q = async <T = Any,>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];
const migSql = migDir ? read(`${MIG_ROOT}/${migDir}/migration.sql`) : "";
const AN = analyzeSql(migSql);
const ABSENT = migDir ? "" : " (migration absent)";

type ColInfo = { udt: string; nullable: boolean; def: string | null; dataType: string };
const colCache = new Map<string, Map<string, ColInfo>>();
const colInfo = async (t: string, fresh = false): Promise<Map<string, ColInfo>> => {
  if (!fresh && colCache.has(t)) return colCache.get(t)!;
  const rows = await q<{ column_name: string; udt_name: string; is_nullable: string; column_default: string | null; data_type: string }>(
    `select column_name, udt_name, is_nullable, column_default, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [t]);
  const m = new Map(rows.map((r) => [r.column_name, { udt: r.udt_name, nullable: r.is_nullable === "YES", def: r.column_default, dataType: r.data_type }]));
  if (m.size) colCache.set(t, m);
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
/** unique=true ⇒ a full (non-partial) UNIQUE on exactly these columns · unique=false ⇒ any index on exactly these columns */
const hasIdx = (ix: IdxInfo[], cols: string[], unique: boolean) => ix.some((x) => sameCols(x.cols, cols) && (!unique || (x.unique && !x.where)));
const enumLabels = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 order by e.enumsortorder`, [name])).map((r) => r.enumlabel);
const isEnumType = async (udt: string) => (await q(`select 1 from pg_type where typname=$1 and typtype='e'`, [udt])).length > 0;
const fkCache = new Map<string, Map<string, string>>();
const fkMap = async (t: string): Promise<Map<string, string>> => {
  if (fkCache.has(t)) return fkCache.get(t)!;
  const rows = await q<{ col: string; ref: string }>(`select a.attname as col, cf.relname as ref from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_class cf on cf.oid=k.confrelid
     join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1] where k.contype='f' and cl.relname=$1`, [t]);
  const m = new Map(rows.map((r) => [r.col, r.ref]));
  fkCache.set(t, m);
  return m;
};
const tableExists = async (t: string) => (await colInfo(t)).size > 0;
const udtOk = (want: string | string[] | undefined, have: string) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);
const defOk = (want: ColSpec["def"], have: string | null) => {
  if (want === undefined) return true;
  const d = (have ?? "").replace(/::[\w" ]+(\[\])?/g, "").replace(/'/g, "").trim();
  if (want === "true" || want === "false") return d.toLowerCase() === want;
  if (want === "0" || want === "1") return d === want;
  if (want === "[]") return /^(\{\}|ARRAY\[\])$/i.test(d);
  return d === want;
};
/** Mismatch list of a table against a column spec. */
const specProblems = async (t: string, cols: Record<string, ColSpec>): Promise<string[]> => {
  const ci = await colInfo(t, true);
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

// ─── generic row builder for rollback probes / tagged race rows (fills NOT NULL columns without a default) ───
let tid = ""; let SYS = ""; let OWNER = ""; let OTHER_TENANT = "";
const existingId = async (ref: string): Promise<string | null> => {
  if (ref === "Tenant") return tid;
  if (ref === "AppSystem") return SYS;
  if (ref === "User") return OWNER || null;
  const ci = await colInfo(ref);
  const where = ci.has("systemId") ? `where "systemId"=$1` : ci.has("tenantId") ? `where "tenantId"=$1` : "";
  const arch = ci.has("archivedAt") ? `${where ? " and" : "where"} "archivedAt" is null` : "";
  const rows = await q<{ id: string }>(`select id from "${ref}" ${where}${arch} order by id limit 1`, where ? [ci.has("systemId") ? SYS : tid] : []);
  if (rows[0]?.id) return rows[0].id;
  return (await q<{ id: string }>(`select id from "${ref}" order by id limit 1`))[0]?.id ?? null;
};
const fillFor = async (info: ColInfo): Promise<unknown> => {
  const u = info.udt;
  if (u === "text" || u === "varchar" || u === "bpchar") return tag();
  if (["int2", "int4", "int8", "numeric", "float4", "float8"].includes(u)) return "0";
  if (u === "bool") return "false";
  if (["timestamp", "timestamptz", "date"].includes(u)) return new Date().toISOString();
  if (u === "json" || u === "jsonb") return "{}";
  if (u.startsWith("_")) return "{}";
  if (u === "uuid") return randomUUID();
  if (await isEnumType(u)) return (await enumLabels(u))[0];
  return tag();
};
type Built = { sql: string; params: unknown[]; id: string };
/** INSERT for `t`: overrides + every NOT-NULL-without-default column (restricted to `only` when given — v1 probe). */
const buildInsert = async (t: string, over: Record<string, unknown>, opts: { only?: Set<string>; depth?: number; made?: { t: string; id: string }[] } = {}): Promise<Built> => {
  const ci = await colInfo(t);
  if (!ci.size) throw new Error(`table ${t} missing`);
  const fk = await fkMap(t);
  const cols: string[] = []; const vals: string[] = []; const params: unknown[] = [];
  let id = "";
  for (const [col, info] of ci) {
    const has = Object.prototype.hasOwnProperty.call(over, col);
    const required = !info.nullable && info.def === null;
    if (!has && (!required || (opts.only && !opts.only.has(col)))) continue;
    let val: unknown;
    if (has) val = over[col];
    else if (col === "id") val = tag();
    else if (col === "tenantId") val = tid;
    else if (col === "systemId") val = SYS;
    else if (fk.has(col)) {
      const ref = fk.get(col)!;
      val = NEW_TABLE_SET.has(ref) && (opts.depth ?? 0) < 3 ? await insertRow(ref, {}, { depth: (opts.depth ?? 0) + 1, made: opts.made }) : await existingId(ref);
    } else if (col.endsWith("UserId") || col === "userId" || col.endsWith("ById")) val = OWNER || tag();
    else val = await fillFor(info);
    if (col === "id") id = String(val);
    cols.push(`"${col}"`); params.push(val); vals.push(`$${params.length}::"${info.udt}"`);
  }
  return { sql: `INSERT INTO "${t}" (${cols.join(", ")}) VALUES (${vals.join(", ")})`, params, id };
};
const insertRow = async (t: string, over: Record<string, unknown>, opts: { only?: Set<string>; depth?: number; made?: { t: string; id: string }[] } = {}): Promise<string> => {
  const b = await buildInsert(t, over, opts);
  await db.query(b.sql, b.params);
  opts.made?.push({ t, id: b.id });
  return b.id;
};
/** Run one statement under a savepoint; returns the SQLSTATE on failure (null = succeeded). */
const tryStmt = async (sql: string, params: unknown[]): Promise<{ code: string | null; msg: string }> => {
  await db.query("SAVEPOINT qc_c20");
  try { await db.query(sql, params); await db.query("RELEASE SAVEPOINT qc_c20"); return { code: null, msg: "" }; }
  catch (e) { await db.query("ROLLBACK TO SAVEPOINT qc_c20"); return { code: String((e as Any)?.code ?? "?"), msg: String((e as Error)?.message ?? e).slice(0, 160) }; }
};
/** Everything inside is rolled back — probes never leave data behind. */
const rolledBack = async <T,>(fn: () => Promise<T>): Promise<T> => {
  await db.query("BEGIN");
  try { return await fn(); } finally { await db.query("ROLLBACK"); }
};
const probe = async (id: string, title: string, fn: () => Promise<{ ok: boolean; exp: string; act: string }>, sev: Sev = "CRITICAL") => {
  try { const r = await fn(); chk(id, title, r.ok, r.exp, r.act, sev); }
  catch (e) { chk(id, title, false, "probe ran", `error: ${String((e as Error)?.message ?? e).slice(0, 220)}${ABSENT}`, sev); }
};
/** n parallel INSERTs on n separate connections (autocommit) — returns how many succeeded. */
const race = async (stmts: Built[]): Promise<{ okCount: number; codes: string[] }> => {
  const clients = await Promise.all(stmts.map(() => newClient()));
  try {
    const res = await Promise.allSettled(stmts.map((s, i) => clients[i].query(s.sql, s.params)));
    return { okCount: res.filter((r) => r.status === "fulfilled").length, codes: res.filter((r) => r.status === "rejected").map((r) => String(((r as PromiseRejectedResult).reason as Any)?.code ?? "?")) };
  } finally { await Promise.all(clients.map((cl) => cl.end().catch(() => undefined))); }
};
const spawnSuite = (args: string[], env: NodeJS.ProcessEnv = process.env) => {
  const r = spawnSync("pnpm", ["exec", "tsx", ...args], { encoding: "utf8", env, timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const sum = /JSON_SUMMARY (\{.*\})/.exec(out)?.[1];
  return { code: r.status ?? -1, out, sum: sum ? (JSON.parse(sum) as { total: number; passed: number; findings?: Any[] }) : null };
};

const made: { t: string; id: string }[] = [];
const raceSeqIds: string[] = [];
try {
  const shim = {
    tenant: { findFirst: async (a: Any) => (await q(`select id from "Tenant" where slug=$1`, [a.where.slug]))[0] ?? null },
    appSystem: { findMany: async (a: Any) => q(`select id, type::text as type from "AppSystem" where "tenantId"=$1 order by "createdAt" asc`, [a.where.tenantId]) },
  };
  const scope = await cq.resolveCrmScope(shim);
  if (!scope) throw new Error("QC not seeded (scripts/seed-member-qc.mts → scripts/seed-crm-qc.mts)");
  tid = scope.tenantId; SYS = scope.systemId;
  OWNER = (await q<{ userId: string }>(`select "userId" from "Membership" where "tenantId"=$1 order by (role::text = 'OWNER') desc, "createdAt" asc limit 1`, [tid]))[0]?.userId ?? "";
  OTHER_TENANT = (await q<{ id: string }>(`select id from "Tenant" where id<>$1 order by id limit 1`, [tid]))[0]?.id ?? "";
  console.log(`\n── QC scope: tenant ${tid} · CRM system ${SYS} · migration ${migDir ?? "ABSENT"}${FORCE ? " · --force-run" : ""}`);

  // ═══ T0 — parser self-tests + DB-helper positive controls (prove that a green/red below means something) ═══
  console.log("\n── T0 parser self-tests / positive controls");
  const split = splitSql(SAMPLE_SPLIT);
  chk("C2.0-T0.1", "splitter: comments, quoted ';', doubled quotes and $tag$ bodies do not split a statement (3 statements)", split.length === 3 && /^DO \$x\$/.test(split[1]) && /it''s;/.test(split[2]), "3 · DO … · CREATE … it''s;", JSON.stringify(split));
  const g = analyzeSql(SAMPLE_GOOD);
  const gAdded = [...(g.addedCols.get("FormDef")?.keys() ?? [])].join(",");
  chk("C2.0-T0.2", "GOOD synthetic migration → 0 violations · 2 new tables · 1 new enum · 1 ADD VALUE · FormDef cols crmSystemId,utmCapture,spamGuard · empty-safe partial unique on AutomationRun accepted · touched existing = AutomationRun,CrmCompanyContact,CrmContact,CrmDeal,FormDef",
    g.violations.length === 0 && g.newTables.size === 2 && g.newEnums.size === 1 && g.addedEnumValues.length === 1 && gAdded === "crmSystemId,utmCapture,spamGuard" && [...g.touchedExisting].sort().join(",") === "AutomationRun,CrmCompanyContact,CrmContact,CrmDeal,FormDef",
    "clean", `violations=${JSON.stringify(g.violations)} tables=${[...g.newTables]} enums=${[...g.newEnums.keys()]} add=${gAdded} touched=${[...g.touchedExisting].sort()}`);
  const badMiss: string[] = [];
  for (const [sql, want] of SAMPLE_BAD) {
    const got = [...new Set(analyzeSql(sql).violations.map((x) => x.rule))].sort();
    if (got.join(",") !== [...want].sort().join(",")) badMiss.push(`${short(sql, 70)} → got [${got}] want [${want}]`);
  }
  chk("C2.0-T0.3", `each of ${SAMPLE_BAD.length} BAD synthetic statements is caught by exactly its rule (DROP · RENAME · ALTER COLUMN · NOT NULL w/o default · new enum value used · unique on old table incl. CrmCompanyContact one-primary and partial over an OLD or DEFAULTED column · AccountContact unique · FK on a defaulted new column · data statement · FK on old column · volatile default · CHECK · trigger · DO)`,
    badMiss.length === 0, "all caught", badMiss.join(" ‖ "));
  const nameCases: [string[], boolean][] = [
    [["20261030000000_member_v2_h3", "20261031000000_crm_v2_a", "20261101000000_crm_v2_b"], true],
    [["20261031000000_crm_v2_a", "20261031000000_crm_v2_b"], false],
    [["20261031000000_crm_v2_a", "20261030120000_crm_v2_b"], false],
    [["20261031000000_crm_v2_a", "2026110100000_crm_v2_b"], false],
    [["20261031000000_crm_v2_a", "20261399000000_crm_v2_b"], false],
    [["20261031000000_crm_v2_a", "20261101000000_crm_v2_b", "20261102000000_crm_v2_b"], false],
    [["20261031000000_crm_v2_a", "20261101000000_crm_v2_b", "20261103000000_crm_v2_d"], false],
  ];
  const nameBad = nameCases.filter(([d, ok]) => (migNameProblems(d).length === 0) !== ok).map(([d]) => d.join("+"));
  chk("C2.0-T0.4", "migration-name checker: accepts a later unique 14-digit timestamp · rejects a timestamp clash, sorting before crm_v2_a, 13 digits, an impossible date, two b dirs, a crm_v2_d", nameBad.length === 0, "7/7", nameBad.join(" ‖ "));
  const aDir = allMigDirs.find((d) => /_crm_v2_a$/.test(d)) ?? "";
  const aRow = (await q<{ checksum: string }>(`select checksum from "_prisma_migrations" where migration_name=$1 and finished_at is not null`, [aDir]))[0];
  const aSha = createHash("sha256").update(readFileSync(`${MIG_ROOT}/${aDir}/migration.sql`)).digest("hex");
  const pcContact = (await colInfo("CrmContact")).get("name");
  const pcIdx = hasIdx(await idxList("CrmCompany"), ["systemId", "partyId"], true);
  const pcFk = (await fkMap("CrmCompanyContact")).get("companyId");
  const pcEnum = (await enumLabels("CrmActivitySource")).includes("MANUAL");
  chk("C2.0-T0.5", "DB helpers on known crm_v2_a objects: CrmContact.name text NOT NULL · unique CrmCompany(systemId,partyId) · FK CrmCompanyContact.companyId→CrmCompany · enum CrmActivitySource has MANUAL · _prisma_migrations.checksum of crm_v2_a = sha256(migration.sql)",
    pcContact?.udt === "text" && !pcContact.nullable && pcIdx && pcFk === "CrmCompany" && pcEnum && aRow?.checksum === aSha,
    "all true", `name=${JSON.stringify(pcContact)} idx=${pcIdx} fk=${pcFk} enum=${pcEnum} checksum=${aRow?.checksum === aSha}`);

  // ═══ S1 — the migration file and its SQL ═══
  console.log("\n── S1 migration file · SQL review (static)");
  const np = migNameProblems(allMigDirs);
  chk("C2.0-S1.1", `one migration ${migDir ?? "*_crm_v2_b"}: 14-digit real timestamp, sorts after crm_v2_a, timestamp not shared, no CRM v2 migration other than a/b/c (R-C.1)`, !!migDir && np.length === 0, "no problems", np.join(" ‖ ") || ABSENT);
  const mRow = migDir ? (await q<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null; logs: string | null }>(`select checksum, finished_at, rolled_back_at, logs from "_prisma_migrations" where migration_name=$1 order by started_at desc limit 1`, [migDir]))[0] : undefined;
  const fileSha = migDir ? createHash("sha256").update(readFileSync(`${MIG_ROOT}/${migDir}/migration.sql`)).digest("hex") : "";
  chk("C2.0-S1.2", "applied on QC by the controller (`scripts/qc-prisma.sh migrate deploy`): finished, not rolled back, and _prisma_migrations.checksum = sha256 of the file on disk (QC ran exactly the SQL that was reviewed)",
    !!mRow?.finished_at && !mRow.rolled_back_at && mRow.checksum === fileSha, "finished · checksum equal",
    mRow ? `finished=${!!mRow.finished_at} rolledBack=${!!mRow.rolled_back_at} checksum=${mRow.checksum === fileSha ? "equal" : "DIFFERENT"} ${short(mRow.logs ?? "", 120)}` : `no _prisma_migrations row${ABSENT}`);
  const vs = (rules: string[]) => AN.violations.filter((x) => rules.includes(x.rule));
  const fmt = (xs: Violation[]) => xs.map((x) => `${x.rule}: ${x.stmt}`).join(" ‖ ");
  const k1 = vs(["UNCLASSIFIED", "DATA_STATEMENT", "DROP", "RENAME"]);
  chk("C2.0-S1.3", `additive only: every statement is CREATE TYPE / ALTER TYPE ADD VALUE / CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN|ADD CONSTRAINT FK — no DROP, RENAME, UPDATE/DELETE/INSERT/TRUNCATE, trigger, function, DO (${AN.statements.length} statements: ${JSON.stringify(AN.kinds)})`,
    !!migDir && AN.statements.length > 0 && k1.length === 0, "0 violations", fmt(k1) || ABSENT);
  const k2 = vs(["ALTER_COLUMN_EXISTING", "ADD_COLUMN_NOT_NULL_NO_DEFAULT", "VOLATILE_DEFAULT_EXISTING", "FK_ON_EXISTING_COLUMN", "CONSTRAINT_ON_EXISTING"]);
  chk("C2.0-S1.4", "existing tables: no ALTER COLUMN (type · nullability · default), ADD COLUMN is nullable or has a DEFAULT that is not volatile (no table rewrite), FK only on a column added here, no CHECK/PK constraint",
    !!migDir && k2.length === 0, "0 violations", fmt(k2) || ABSENT);
  const k3 = vs(["NEW_ENUM_VALUE_USED"]);
  chk("C2.0-S1.5", `no enum value added with ALTER TYPE … ADD VALUE is used as a default, cast or predicate in the same migration (added: ${AN.addedEnumValues.map(([t, v2]) => `${t}.${v2}`).join(",") || "-"})`,
    !!migDir && k3.length === 0, "0 violations", fmt(k3) || ABSENT);
  const k4 = vs(["UNIQUE_ON_EXISTING", "ACCOUNTCONTACT_UNIQUE"]);
  const ccUniqStatic = AN.indexes.filter((x) => x.unique && !AN.newTables.has(x.table));
  chk("C2.0-S1.6", `UNIQUE only on new tables, or partial over a column added here without default (AutomationRun R7a) — never CrmCompanyContact one-primary nor AccountContact (both C6.1) (found on old tables: ${ccUniqStatic.map((x) => `${x.table}(${x.cols}) where ${x.where ?? "-"}`).join("; ") || "-"})`,
    !!migDir && k4.length === 0, "0 violations", fmt(k4) || ABSENT);
  const missCreate = NEW_TABLE_NAMES.filter((t) => !AN.newTables.has(t));
  const extraCreate = [...AN.newTables].filter((t) => !NEW_TABLE_SET.has(t));
  const c3Here = extraCreate.filter((t) => C3_TABLES.includes(t));
  chk("C2.0-S1.7", `the migration creates the ${NEW_TABLE_NAMES.length} contract tables (F8: each model appears in migration SQL) — none missing, no phase-C3 table (crm_v2_c), no unlisted table`,
    !!migDir && missCreate.length === 0 && extraCreate.length === 0, "exact set", `missing: ${missCreate.join(",") || "-"} · extra: ${extraCreate.join(",") || "-"}${c3Here.length ? ` (C3: ${c3Here.join(",")})` : ""}${ABSENT}`, c3Here.length || missCreate.length ? "CRITICAL" : "MAJOR");
  const outTables = [...AN.touchedExisting].filter((t) => !ALLOWED_EXISTING_TABLES.has(t));
  const outEnums = [...AN.alteredEnums].filter((t) => !ALLOWED_EXISTING_ENUMS.has(t));
  chk("C2.0-S1.8", `existing objects touched only from the contract list (CrmContact · CrmDeal · CrmCompanyContact · FormDef · FormSubmission · AutomationRun · MemberActivity · enum CrmActivitySource — R8) — touched: ${[...AN.touchedExisting].sort().join(",") || "-"} · enums: ${[...AN.alteredEnums].join(",") || "-"}`,
    !!migDir && outTables.length === 0 && outEnums.length === 0, "none outside", `tables: ${outTables.join(",") || "-"} · enums: ${outEnums.join(",") || "-"}${ABSENT}`, "MAJOR");
  const maIdx = AN.indexes.filter((x) => x.table === "MemberActivity");
  const maCols = [...(AN.addedCols.get("MemberActivity")?.keys() ?? [])];
  const notes = read("ledger/wo-notes/crm-C2.0.md");
  const evidence = /EXPLAIN/i.test(notes) && /MemberActivity/.test(notes);
  chk("C2.0-S1.9", `C1.1 debt + R8: new columns or indexes on the hot table MemberActivity only with EXPLAIN evidence in ledger/wo-notes/crm-C2.0.md (default ruling: none) — indexes here: ${maIdx.map((x) => `(${x.cols})`).join(",") || "none"} · columns: ${maCols.join(",") || "none"}`,
    !!migDir && ((maIdx.length === 0 && maCols.length === 0) || evidence), "none, or EXPLAIN evidence", `indexes=${maIdx.length} columns=${maCols.length} evidence=${evidence}${ABSENT}`, "MAJOR");
  const k10 = vs(["UNIQUE_ON_EXISTING", "ACCOUNTCONTACT_UNIQUE", "ADD_COLUMN_NOT_NULL_NO_DEFAULT", "ALTER_COLUMN_EXISTING", "FK_ON_EXISTING_COLUMN", "CONSTRAINT_ON_EXISTING", "VOLATILE_DEFAULT_EXISTING", "DATA_STATEMENT"]);
  const addExisting = AN.addedEnumValues.filter(([t, v2]) => (ENUM_BASELINE[t] ?? []).includes(v2)).map(([t, v2]) => `ADD VALUE ${t}.${v2} already exists before C2.0`);
  const enumOld = [...AN.newEnums.keys()].filter((t) => t in ENUM_BASELINE).map((t) => `CREATE TYPE ${t} already exists`);
  const tblOld = [...AN.newTables].filter((t) => t in BASELINE).map((t) => `CREATE TABLE ${t} already exists`);
  chk("C2.0-S1.10", "🔴 migration safety: NO statement can fail on existing prod data — no UNIQUE / NOT NULL / CHECK over existing rows, no FK whose validation reads existing rows, no ADD VALUE / CREATE of an object that already exists (a failure mid-`migrate deploy` on prod leaves a half-applied migration that blocks every later deploy — such constraints belong to C6.1)",
    !!migDir && k10.length === 0 && addExisting.length + enumOld.length + tblOld.length === 0, "0", `${[fmt(k10), ...addExisting, ...enumOld, ...tblOld].filter(Boolean).join(" ‖ ")}${ABSENT}`);

  // ═══ S2 — new enums and tables on QC (after migrate deploy) ═══
  console.log("\n── S2 new enums + tables (QC state)");
  const enumMiss: string[] = [];
  for (const [name, vals] of Object.entries(NEW_ENUMS)) { const have = await enumLabels(name); for (const v2 of vals) if (!have.includes(v2)) enumMiss.push(`${name}.${v2}`); }
  chk("C2.0-S2.1", `blueprint §4.2: ${Object.keys(NEW_ENUMS).length} new enums with every value (${Object.keys(NEW_ENUMS).join(" · ")})`, enumMiss.length === 0, "all present", `${enumMiss.join(",")}${ABSENT}`);
  let n2 = 1;
  for (const [t, spec] of Object.entries(NEW_TABLES)) {
    n2++;
    const p = await specProblems(t, spec.cols);
    const ix = p[0]?.endsWith("missing") && p.length === 1 ? [] : await idxList(t);
    for (const u of spec.unique ?? []) if (!hasIdx(ix, u, true)) p.push(`unique(${u}) missing`);
    for (const u of spec.index ?? []) if (!hasIdx(ix, u, false)) p.push(`index(${u}) missing`);
    const summary = Object.entries(spec.cols).map(([k, s]) => `${k}${s.nn === false ? "?" : ""}`).join(" ");
    chk(`C2.0-S2.${n2}`, `${t} — ${spec.why}: ${summary}${spec.unique?.length ? ` · unique ${spec.unique.map((u) => `(${u})`).join(" ")}` : ""}${spec.index?.length ? ` · index ${spec.index.map((u) => `(${u})`).join(" ")}` : ""}`,
      p.length === 0, "exact", `${p.join(" · ")}${ABSENT}`, spec.sev ?? "CRITICAL");
  }

  // ═══ S3 — columns on existing tables + the debts parked for C2.0 ═══
  console.log("\n── S3 existing-table columns + parked debts");
  let n3 = 0;
  for (const [t, cols] of Object.entries(EXISTING_NEW_COLS)) {
    n3++;
    const p = await specProblems(t, cols);
    const why = t === "FormDef" ? "brief (C1.8/C2.6 FormDef.crmSystemId · assign rule · UTM · score · company-from-field · spam guard C24)" : t === "FormSubmission" ? "brief (C2.6 capture)" : t === "CrmContact" ? "brief (C2.6 web tracking opt-out)" : "C1.5 debt (soft delete)";
    chk(`C2.0-S3.${n3}`, `${t} += ${Object.entries(cols).map(([k, s]) => `${k}${s.nn === false ? "?" : ""}${s.def ? `=${s.def}` : ""}`).join(" ")} — ${why}`, p.length === 0, "exact", `${p.join(" · ")}${ABSENT}`);
  }
  const src = await enumLabels("CrmActivitySource");
  chk("C2.0-S3.5", "C1.5/C1.6 debt: enum CrmActivitySource has KANBAN (added with ALTER TYPE ADD VALUE — never used as a default here, S1.5)", src.includes("KANBAN"), "KANBAN", `${src.join(",")}${ABSENT}`);
  const ccIdx = await idxList("CrmCompanyContact");
  const ccBase = new Set((IDX_BASELINE.CrmCompanyContact ?? []).map(([n]) => n));
  const ccNewUniq = ccIdx.filter((x) => x.unique && !ccBase.has(x.name));
  const ccStatic = AN.indexes.filter((x) => x.table === "CrmCompanyContact" && x.unique);
  chk("C2.0-S3.6", 'R1: the C1.3 partial unique "one current primary contact per company" is NOT in crm_v2_b — it moves to C6.1 (after a read-only duplicate count on prod), like AccountContact(systemId, partyId): no new UNIQUE on CrmCompanyContact in the SQL or on QC',
    ccNewUniq.length === 0 && ccStatic.length === 0, "absent", `db: ${JSON.stringify(ccNewUniq.map((x) => [x.name, x.cols, x.where]))} · sql: ${JSON.stringify(ccStatic.map((x) => [x.cols, x.where]))}`);
  const bf = read("scripts/crm-backfill-companies-from-text.mts");
  const blindCreate = /crmCompanyContact\.create\(\s*\{[^;]*?isPrimary:\s*true\b/.test(bf);
  const looksUp = /crmCompanyContact\.(count|findFirst|findMany)\(\s*\{[^;]*?isPrimary:\s*true/.test(bf) || /"isPrimary"\s*(=\s*true|AND|\))/.test(bf);
  chk("C2.0-S3.7", "R1 (builder fixes the cause): scripts/crm-backfill-companies-from-text.mts no longer creates CrmCompanyContact with a literal `isPrimary: true` — it looks up the company's current primary first and marks only the first contact of a company that has none (static)",
    !!bf && !blindCreate && looksUp, "no blind create · looks up current primary", `file=${!!bf} blindCreate=${blindCreate} looksUpCurrentPrimary=${looksUp}`);
  const dupPrim = await q<{ companyId: string; n: number }>(`select "companyId", count(*)::int as n from "CrmCompanyContact" where "isPrimary" and "endedAt" is null group by 1 having count(*) > 1 limit 5`);
  chk("C2.0-S3.8", "R1 data check (after the controller's reseed `seed-member-qc` → `seed-crm-qc`, which runs the backfill): QC has 0 companies with >1 current primary contact — the precondition C6.1 needs before its unique",
    dupPrim.length === 0, "0 groups", JSON.stringify(dupPrim));
  const acIdx = await idxList("AccountContact");
  const acUniq = acIdx.some((x) => x.unique && sameCols(x.cols, ["systemId", "partyId"]));
  chk("C2.0-S3.9", "C1.1 ruling: NO unique AccountContact(systemId, partyId) here — it belongs to C6.1 after a read-only duplicate count on prod (static: no unique on AccountContact in the SQL)",
    !acUniq && !AN.violations.some((x) => x.rule === "ACCOUNTCONTACT_UNIQUE"), "absent", `db=${acUniq}`);
  const posDeal = (await colInfo("PosSale", true)).has("dealId"); const mktMsg = (await colInfo("MktRecipient", true)).has("emailMessageId");
  chk("C2.0-S3.10", "decision C29: NO PosSale.dealId (hot table — CrmDealPayment is the link) and NO MktRecipient.emailMessageId (member campaigns keep their own pixel)",
    !posDeal && !mktMsg && !AN.addedCols.get("PosSale")?.has("dealId") && !AN.addedCols.get("MktRecipient")?.has("emailMessageId"), "both absent", `PosSale.dealId=${posDeal} MktRecipient.emailMessageId=${mktMsg}`);
  const stepCols = await colInfo("CrmSequenceStep", true);
  const stepIdx = stepCols.size ? await idxList("CrmSequenceStep") : [];
  const stepVer = stepCols.get("version");
  chk("C2.0-S3.11", 'R2 / C2.2 "edit = new version; old enrollments finish on their version": CrmSequenceStep carries version Int NOT NULL and UNIQUE(sequenceId, version, index) — without it the old version\'s steps are overwritten',
    stepVer?.udt === "int4" && !stepVer.nullable && hasIdx(stepIdx, ["sequenceId", "version", "index"], true), "version int NOT NULL + unique(sequenceId,version,index)",
    `version=${JSON.stringify(stepVer)} uniques=${JSON.stringify(stepIdx.filter((x) => x.unique).map((x) => x.cols))}${ABSENT}`);
  const dpCols = await colInfo("CrmDealPayment", true);
  const rt = dpCols.get("refType"); const st = dpCols.get("status");
  chk("C2.0-S3.12", "R4: CrmDealPayment.refType and status are plain text NOT NULL (validated in the app — INVOICE or a future ref type needs no migration)",
    rt?.udt === "text" && !rt.nullable && st?.udt === "text" && !st.nullable, "text/text NOT NULL", `refType=${rt ? `${rt.udt}/${rt.nullable ? "null" : "nn"}` : "-"} status=${st ? `${st.udt}/${st.nullable ? "null" : "nn"}` : "-"}${ABSENT}`);
  const dpIdx = dpCols.size ? await idxList("CrmDealPayment") : [];
  chk("C2.0-S3.13", "CrmDealPayment lookup by the paying object (consumers of pos.sale.paid / account.payment.* find the row by refId): an index leading with (refType, refId) or (refId)",
    dpIdx.some((x) => (x.cols[0] === "refType" && x.cols[1] === "refId") || x.cols[0] === "refId"), "present", `${JSON.stringify(dpIdx.map((x) => x.cols))}${ABSENT}`, "MINOR");
  const arCol = (await colInfo("AutomationRun", true)).get("crmContactId");
  const arIdx = await idxList("AutomationRun");
  const arKey = arIdx.find((x) => x.unique && sameCols(x.cols, ["ruleId", "crmContactId", "eventKey"]) && !!x.where && /"?crmContactId"?\s+IS NOT NULL/i.test(x.where));
  chk("C2.0-S3.14", "R7a (C2.1 X4 for CRM subjects): AutomationRun.crmContactId text nullable, no default + partial UNIQUE(ruleId, crmContactId, eventKey) WHERE crmContactId IS NOT NULL (empty-safe: only new rows carry it) · the member key unique(ruleId, customerId, eventKey) is unchanged (S5.5)",
    arCol?.udt === "text" && arCol.nullable && arCol.def === null && !!arKey, "column + partial unique", `col=${JSON.stringify(arCol)} key=${arKey ? `${arKey.name} where ${arKey.where}` : "none"}${ABSENT}`);
  const evIdx = (await tableExists("CrmEmailEvent")) ? await idxList("CrmEmailEvent") : [];
  const evKey = evIdx.find((x) => x.unique && x.cols.includes("providerEventId") && (!x.where || /providerEventId"?\s+IS NOT NULL/i.test(x.where)));
  chk("C2.0-S3.15", "R7b (C2.5 X4 webhook replay → one event): CrmEmailEvent.providerEventId text? + UNIQUE on it where non-null",
    (await colInfo("CrmEmailEvent")).get("providerEventId")?.nullable === true && !!evKey, "column + unique", `key=${evKey ? `(${evKey.cols}) where ${evKey.where ?? "-"}` : JSON.stringify(evIdx.filter((x) => x.unique).map((x) => x.cols))}${ABSENT}`);

  // ═══ S4 — scope registry (F1) + fitness F1/F8 ═══
  console.log("\n── S4 scope registry");
  const schemaSrc = readdirSync("prisma/schema").filter((f) => f.endsWith(".prisma")).map((f) => read(`prisma/schema/${f}`)).join("\n");
  const noModel = NEW_TABLE_NAMES.filter((t) => !new RegExp(`^model\\s+${t}\\s*\\{`, "m").test(schemaSrc));
  const mapped = NEW_TABLE_NAMES.filter((t) => new RegExp(`^model\\s+${t}\\s*\\{[^}]*@@map\\(`, "m").test(schemaSrc));
  chk("C2.0-S4.1", `prisma/schema declares every new model (${NEW_TABLE_NAMES.length}) with no @@map (table name = model name, as the scope guard and F8 assume)`, noModel.length === 0 && mapped.length === 0, "all · no @@map", `missing: ${noModel.join(",") || "-"} · @@map: ${mapped.join(",") || "-"}`);
  const scopeMod = (await import("@/lib/core/scope")) as { scopeOf: (m: string) => { axis: string; systemField?: string } };
  const scopeBad: string[] = [];
  for (const t of NEW_TABLE_NAMES) {
    let d: { axis: string; systemField?: string } | null = null;
    try { d = scopeMod.scopeOf(t); } catch { scopeBad.push(`${t}: not registered`); continue; }
    const ci = await colInfo(t);
    if (d.axis !== "tenant" && d.axis !== "system") { scopeBad.push(`${t}: axis ${d.axis}`); continue; }
    if (!ci.size) { scopeBad.push(`${t}: table missing`); continue; }
    if (!ci.has("tenantId")) scopeBad.push(`${t}: axis ${d.axis} but no tenantId column (guard injects tenantId)`);
    if (d.axis === "system" && !ci.has(d.systemField ?? "systemId")) scopeBad.push(`${t}: axis system but no ${d.systemField ?? "systemId"}`);
    if (d.axis === "tenant" && ci.has("systemId")) scopeBad.push(`${t}: has systemId but registered tenant (use sys())`);
  }
  chk("C2.0-S4.2", "src/lib/core/scope.ts registers every new model (scopeOf does not throw) — axis system when the table has systemId, else tenant, and the axis columns exist on QC", scopeBad.length === 0, "all consistent", scopeBad.join(" · "));
  if (migDir) {
    const f1 = spawnSuite(["scripts/fitness.mts"]);
    const envNo = { ...process.env }; delete envNo.DATABASE_URL; delete envNo.DIRECT_URL;
    const f2 = spawnSuite(["scripts/fitness.mts"], envNo);
    const green = (out: string, id: string) => new RegExp(`✅ \\[${id.replace(".", "\\.")}\\]`).test(out);
    chk("C2.0-S4.3", "fitness F1.1/F1.2 (scope registry complete) + F8.1 (every model in a migration) green — with env and with `env -u DATABASE_URL`",
      ["F1.1", "F1.2", "F8.1"].every((id) => green(f1.out, id) && green(f2.out, id)), "green ×2",
      `env: ${["F1.1", "F1.2", "F8.1"].map((id) => `${id}=${green(f1.out, id)}`).join(" ")} · no-env: ${["F1.1", "F1.2", "F8.1"].map((id) => `${id}=${green(f2.out, id)}`).join(" ")} · summary ${f1.sum?.passed}/${f1.sum?.total} | ${f2.sum?.passed}/${f2.sum?.total}`);
  } else chk("C2.0-S4.3", "fitness F1/F8 green with and without env", false, "green ×2", `not run${ABSENT}`);

  // ═══ S5 — uiVersion-1 safety: v1 paths see no behaviour change ═══
  console.log("\n── S5 uiVersion-1 / v1 safety");
  const baseDiff: string[] = [];
  const newOnOld: string[] = [];
  for (const [t, cols] of Object.entries(BASELINE)) {
    const ci = await colInfo(t, true);
    for (const [name, udt, nul, def] of cols) {
      const h = ci.get(name);
      if (!h) { baseDiff.push(`${t}.${name} gone`); continue; }
      if (h.udt !== udt) baseDiff.push(`${t}.${name} type ${udt}→${h.udt}`);
      if (h.nullable !== (nul === 1)) baseDiff.push(`${t}.${name} nullable ${nul === 1}→${h.nullable}`);
      if ((h.def ?? null) !== def) baseDiff.push(`${t}.${name} default ${def}→${h.def}`);
    }
    const known = new Set(cols.map((x) => x[0]));
    for (const [name, h] of ci) if (!known.has(name) && !h.nullable && h.def === null) newOnOld.push(`${t}.${name}`);
  }
  chk("C2.0-S5.1", `no pre-C2.0 column of ${Object.keys(BASELINE).length} v1/C1 tables (${Object.keys(BASELINE).join(" ")}) changed type, nullability or default, none disappeared`, baseDiff.length === 0, "identical", baseDiff.slice(0, 20).join(" · "));
  chk("C2.0-S5.2", "every column added to those tables is nullable or has a default (an INSERT written by v1 code keeps working)", newOnOld.length === 0, "none NOT NULL w/o default", newOnOld.join(","));
  const enumGone: string[] = [];
  for (const [name, vals] of Object.entries(ENUM_BASELINE)) { const have = await enumLabels(name); for (const v2 of vals) if (!have.includes(v2)) enumGone.push(`${name}.${v2}`); }
  chk("C2.0-S5.3", `every pre-C2.0 value of the ${Object.keys(ENUM_BASELINE).length} Crm* enums still exists`, enumGone.length === 0, "all", enumGone.join(","));
  await probe("C2.0-S5.4", "v1-shaped INSERT naming only pre-C2.0 required columns succeeds on FormDef · FormSubmission · CrmContact · CrmDeal · AutomationRun, and the new columns read back as their safe defaults (utmCapture=true · trackingOptOut=false · others NULL) — rolled back", async () => rolledBack(async () => {
    const bad: string[] = [];
    for (const [t, expect] of Object.entries(V1_EXPECT)) {
      const only = new Set(BASELINE[t].filter(([, , nul, def]) => nul === 0 && def === null).map(([n]) => n));
      const b = await buildInsert(t, {}, { only });
      const r = await tryStmt(b.sql, b.params);
      if (r.code) { bad.push(`${t}: insert failed ${r.code} ${r.msg}`); continue; }
      const row = (await q(`select * from "${t}" where id=$1`, [b.id]))[0] ?? {};
      for (const [k, want] of Object.entries(expect)) if (!(k in row) || row[k] !== want) bad.push(`${t}.${k}=${JSON.stringify(row[k])} want ${JSON.stringify(want)}`);
    }
    return { ok: bad.length === 0, exp: "5 inserts ok · defaults", act: `${bad.join(" · ")}${ABSENT}` };
  }));

  const idxGone: string[] = [];
  for (const [t, list] of Object.entries(IDX_BASELINE)) {
    const now = new Map((await q<{ indexname: string; indexdef: string }>(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename=$1`, [t])).map((r) => [r.indexname, r.indexdef]));
    for (const [name, def] of list) if (now.get(name) !== def) idxGone.push(`${t}.${name} ${now.has(name) ? "changed" : "gone"}`);
  }
  chk("C2.0-S5.5", `every pre-C2.0 index of ${Object.keys(IDX_BASELINE).join(" ")} still exists with the same definition (v1 query plans + existing uniques untouched)`, idxGone.length === 0, "identical", idxGone.join(" · "));

  // ═══ S6 — regression named by the brief that this oracle runs itself ═══
  console.log("\n── S6 regression");
  if (migDir) {
    const m12 = spawnSuite(["scripts/qc-member-m1.2.mts"]);
    chk("C2.0-S6.1", "regression qc-member-m1.2 (member field engine on the shared tables) still green after crm_v2_b", m12.code === 0 && !!m12.sum && m12.sum.total > 0 && m12.sum.passed === m12.sum.total, "green", `exit ${m12.code} ${m12.sum?.passed}/${m12.sum?.total}`);
  } else chk("C2.0-S6.1", "regression qc-member-m1.2 green", false, "green", `not run${ABSENT}`);

  // ═══ X groups ═══
  console.log("\n── X groups");
  const x1: string[] = [];
  for (const t of NEW_TABLE_NAMES) {
    const ci = await colInfo(t);
    if (!ci.size) { x1.push(`${t} missing`); continue; }
    const tc = ci.get("tenantId"); if (!tc || tc.nullable) x1.push(`${t}.tenantId ${tc ? "nullable" : "missing"}`);
    const sc = ci.get("systemId"); if (sc && sc.nullable) x1.push(`${t}.systemId nullable`);
  }
  chk("C2.0-X1.1", "X1: every new table has tenantId NOT NULL (children included — the tenant guard injects it) and systemId, where present, is NOT NULL", x1.length === 0, "all", x1.join(" · "));
  const counters: [string, string, string][] = [["CrmAssignmentRule", "rrCursor", "0"], ["CrmEmailMessage", "openCount", "0"], ["CrmEmailMessage", "clickCount", "0"], ["CrmTrackedLink", "clicks", "0"], ["CrmTrackedLink", "uniqueClicks", "0"], ["CrmWebSession", "pageViews", "0"], ["CrmSequenceEnrollment", "stepIndex", "0"], ["CrmSequence", "version", "1"]];
  const x3: string[] = [];
  for (const [t, col, d] of counters) { const h = (await colInfo(t)).get(col); if (!h || h.udt !== "int4" || h.nullable || !defOk(d, h.def)) x3.push(`${t}.${col}=${h ? `${h.udt}/${h.nullable ? "null" : "nn"}/${h.def}` : "missing"}`); }
  chk("C2.0-X3.1", "X3: counters are Int NOT NULL with a default (rrCursor · openCount · clickCount · clicks · uniqueClicks · pageViews · stepIndex = 0 · CrmSequence.version = 1) so C2.x can increment in ONE statement", x3.length === 0, "all", `${x3.join(" · ")}${ABSENT}`);
  const enIdx = (await tableExists("CrmSequenceEnrollment")) ? await idxList("CrmSequenceEnrollment") : [];
  const oneActive = enIdx.find((x) => x.unique && sameCols(x.cols, ["sequenceId", "contactId"]) && !!x.where && /status/.test(x.where) && /ACTIVE/.test(x.where));
  const fullUniq = enIdx.find((x) => x.unique && sameCols(x.cols, ["sequenceId", "contactId"]) && !x.where);
  await probe("C2.0-X3.2", "R3: one ACTIVE enrollment per (sequence, contact) = partial UNIQUE(sequenceId, contactId) WHERE status = 'ACTIVE' (no full unique) — rolled back: 2nd ACTIVE → 23505 · after the first becomes DONE a new ACTIVE is accepted (re-enrol)", async () => {
    if (!oneActive || fullUniq) return { ok: false, exp: "partial ACTIVE unique · no full unique", act: `partial=${oneActive?.name ?? "none"} full=${fullUniq?.name ?? "none"} ${JSON.stringify(enIdx.filter((x) => x.unique).map((x) => [x.cols, x.where]))}${ABSENT}` };
    return rolledBack(async () => {
      const seq = await insertRow("CrmSequence", {});
      const contact = await existingId("CrmContact");
      const a = await buildInsert("CrmSequenceEnrollment", { sequenceId: seq, contactId: contact, status: "ACTIVE" }); const r1 = await tryStmt(a.sql, a.params);
      const b = await buildInsert("CrmSequenceEnrollment", { sequenceId: seq, contactId: contact, status: "ACTIVE" }); const r2 = await tryStmt(b.sql, b.params);
      await db.query(`UPDATE "CrmSequenceEnrollment" SET status='DONE' WHERE id=$1`, [a.id]);
      const cc = await buildInsert("CrmSequenceEnrollment", { sequenceId: seq, contactId: contact, status: "ACTIVE" }); const r3 = await tryStmt(cc.sql, cc.params);
      return { ok: r1.code === null && r2.code === "23505" && r3.code === null, exp: "ok · 23505 · ok", act: `${r1.code ?? "ok"} ${r1.msg} · ${r2.code ?? "ok"} · ${r3.code ?? "ok"} ${r3.msg}` };
    });
  });
  await probe("C2.0-X3.3", "X3 race: 10 parallel ACTIVE enrollments of one contact into one sequence on 10 separate connections → exactly 1 row (× 2 rounds; temp sequence tagged qc-c20-, deleted in finally)", async () => {
    const seq = await insertRow("CrmSequence", { name: `${TAGP}-seq` }, { made });
    raceSeqIds.push(seq);
    const contact = await existingId("CrmContact");
    const rounds: string[] = [];
    for (let r = 0; r < 2; r++) {
      const stmts = await Promise.all(Array.from({ length: 10 }, () => buildInsert("CrmSequenceEnrollment", { sequenceId: seq, contactId: contact, status: "ACTIVE" })));
      const res = await race(stmts);
      const n = Number((await q<{ n: number }>(`select count(*)::int as n from "CrmSequenceEnrollment" where "sequenceId"=$1 and "contactId"=$2 and status::text='ACTIVE'`, [seq, contact]))[0]?.n ?? -1);
      rounds.push(`ok=${res.okCount} rows=${n} codes=${[...new Set(res.codes)]}`);
      await db.query(`DELETE FROM "CrmSequenceEnrollment" WHERE "sequenceId"=$1`, [seq]);
    }
    return { ok: rounds.every((x) => x.startsWith("ok=1 rows=1")), exp: "ok=1 rows=1 ×2", act: rounds.join(" | ") };
  });
  await probe("C2.0-X4.1", "X4 flag (rolled back): CrmDealPayment(dealId, PAYMENT, refId) inserted twice → 23505 · same refId as POS_SALE → accepted (positive control: the key is the triple)", async () => rolledBack(async () => {
    const deal = await existingId("CrmDeal"); const ref = tag();
    const a = await buildInsert("CrmDealPayment", { dealId: deal, refType: "PAYMENT", refId: ref, satang: "100", status: "LINKED" });
    const r1 = await tryStmt(a.sql, a.params);
    const b = await buildInsert("CrmDealPayment", { dealId: deal, refType: "PAYMENT", refId: ref, satang: "100", status: "LINKED" });
    const r2 = await tryStmt(b.sql, b.params);
    const cc = await buildInsert("CrmDealPayment", { dealId: deal, refType: "POS_SALE", refId: ref, satang: "100", status: "LINKED" });
    const r3 = await tryStmt(cc.sql, cc.params);
    return { ok: r1.code === null && r2.code === "23505" && r3.code === null, exp: "ok · 23505 · ok", act: `${r1.code ?? "ok"} ${r1.msg} · ${r2.code ?? "ok"} · ${r3.code ?? "ok"} ${r3.msg}` };
  }));
  await probe("C2.0-X4.2", "X4 race: 10 parallel CrmDealPayment rows for the same (deal, PAYMENT, refId) on separate connections → exactly 1 row (× 2 rounds; rows tagged, deleted)", async () => {
    const deal = await existingId("CrmDeal");
    const rounds: string[] = [];
    for (let r = 0; r < 2; r++) {
      const ref = tag();
      const stmts = await Promise.all(Array.from({ length: 10 }, () => buildInsert("CrmDealPayment", { dealId: deal, refType: "PAYMENT", refId: ref, satang: "700", status: "LINKED" })));
      const res = await race(stmts);
      const n = Number((await q<{ n: number }>(`select count(*)::int as n from "CrmDealPayment" where "refId"=$1`, [ref]))[0]?.n ?? -1);
      rounds.push(`ok=${res.okCount} rows=${n}`);
      await db.query(`DELETE FROM "CrmDealPayment" WHERE "refId"=$1`, [ref]);
    }
    return { ok: rounds.every((x) => x === "ok=1 rows=1"), exp: "ok=1 rows=1 ×2", act: rounds.join(" | ") };
  });
  await probe("C2.0-X4.3", "X4 natural keys (rolled back): duplicate CrmEmailMessage.messageId → 23505 · duplicate trackTokenHash → 23505 · duplicate CrmTrackedLink.code → 23505 · EmailDomain(tenant, domain) twice → 23505 but same domain in another tenant accepted · CrmUserPref(system, user) twice → 23505 · CrmEmailTemplate(system, name) twice → 23505", async () => rolledBack(async () => {
    const out: string[] = [];
    const dup = async (t: string, first: Record<string, unknown>, second: Record<string, unknown>, want: string | null) => {
      const a = await buildInsert(t, first); const r1 = await tryStmt(a.sql, a.params);
      const b = await buildInsert(t, second); const r2 = await tryStmt(b.sql, b.params);
      if (r1.code !== null || r2.code !== want) out.push(`${t}${JSON.stringify(Object.keys(second))}: ${r1.code ?? "ok"} ${r1.msg} → ${r2.code ?? "ok"} (want ${want ?? "ok"}) ${r2.msg}`);
    };
    const mid = `<${tag()}@qc>`; const tok = tag(); const code = tag(); const dom = `${tag()}.example`; const nm = tag();
    await dup("CrmEmailMessage", { messageId: mid }, { messageId: mid }, "23505");
    await dup("CrmEmailMessage", { trackTokenHash: tok }, { trackTokenHash: tok }, "23505");
    await dup("CrmTrackedLink", { code }, { code }, "23505");
    await dup("EmailDomain", { domain: dom }, { domain: dom }, "23505");
    await dup("EmailDomain", { domain: `x${dom}` }, { domain: `x${dom}`, tenantId: OTHER_TENANT }, null);
    await dup("CrmUserPref", { userId: OWNER }, { userId: OWNER }, "23505");
    await dup("CrmEmailTemplate", { name: nm }, { name: nm }, "23505");
    return { ok: out.length === 0, exp: "all as stated", act: `${out.join(" ‖ ")}${ABSENT}` };
  }));
  const slIdx = (await tableExists("CrmScoreLog")) ? await idxList("CrmScoreLog") : [];
  const slKey = slIdx.find((x) => x.unique && sameCols(x.cols, ["ruleId", "eventKey"]) && !!x.where && /ruleId"?\s+IS NOT NULL/i.test(x.where) && /eventKey"?\s+IS NOT NULL/i.test(x.where));
  await probe("C2.0-X4.4", `R6 / C2.8 X4 "same event twice/parallel → one log": CrmScoreLog partial UNIQUE(ruleId, eventKey) WHERE both NOT NULL — rolled back: same (rule, eventKey) twice → 23505 · two manual rows (ruleId/eventKey NULL) accepted — found ${slKey ? `${slKey.name}` : "none"}`, async () => {
    if (!slKey) return { ok: false, exp: "partial unique(ruleId, eventKey)", act: `uniques: ${JSON.stringify(slIdx.filter((x) => x.unique).map((x) => [x.cols, x.where]))}${ABSENT}` };
    return rolledBack(async () => {
      const rule = await insertRow("CrmScoreRule", {}); const ek = tag();
      const a = await buildInsert("CrmScoreLog", { ruleId: rule, eventKey: ek }); const r1 = await tryStmt(a.sql, a.params);
      const b = await buildInsert("CrmScoreLog", { ruleId: rule, eventKey: ek }); const r2 = await tryStmt(b.sql, b.params);
      const m1 = await buildInsert("CrmScoreLog", { ruleId: null, eventKey: null }); const r3 = await tryStmt(m1.sql, m1.params);
      const m2 = await buildInsert("CrmScoreLog", { ruleId: null, eventKey: null }); const r4 = await tryStmt(m2.sql, m2.params);
      return { ok: r1.code === null && r2.code === "23505" && r3.code === null && r4.code === null, exp: "ok · 23505 · ok · ok", act: `${r1.code ?? "ok"} ${r1.msg} · ${r2.code ?? "ok"} · ${r3.code ?? "ok"} ${r3.msg} · ${r4.code ?? "ok"}` };
    });
  });
  await probe("C2.0-X4.5", "R7a / C2.1 X4: AutomationRun with the same (ruleId, crmContactId, eventKey) twice → 23505 · member/board rows (crmContactId NULL) with the same ruleId+eventKey twice are still accepted exactly as before (v1) — rolled back", async () => rolledBack(async () => {
    const rule = tag(); const ek = tag(); const ct = await existingId("CrmContact");
    const a = await buildInsert("AutomationRun", { ruleId: rule, crmContactId: ct, eventKey: ek }); const r1 = await tryStmt(a.sql, a.params);
    const b = await buildInsert("AutomationRun", { ruleId: rule, crmContactId: ct, eventKey: ek }); const r2 = await tryStmt(b.sql, b.params);
    const v1a = await buildInsert("AutomationRun", { ruleId: rule, eventKey: ek }); const r3 = await tryStmt(v1a.sql, v1a.params);
    const v1b = await buildInsert("AutomationRun", { ruleId: rule, eventKey: ek }); const r4 = await tryStmt(v1b.sql, v1b.params);
    return { ok: r1.code === null && r2.code === "23505" && r3.code === null && r4.code === null, exp: "ok · 23505 · ok · ok", act: `${r1.code ?? "ok"} ${r1.msg} · ${r2.code ?? "ok"} · ${r3.code ?? "ok"} ${r3.msg} · ${r4.code ?? "ok"}${ABSENT}` };
  }));
  await probe("C2.0-X4.6", "R7b: CrmEmailEvent with the same providerEventId twice → 23505 · two events without providerEventId accepted — rolled back", async () => rolledBack(async () => {
    const pe = tag();
    const a = await buildInsert("CrmEmailEvent", { providerEventId: pe }); const r1 = await tryStmt(a.sql, a.params);
    const b = await buildInsert("CrmEmailEvent", { providerEventId: pe }); const r2 = await tryStmt(b.sql, b.params);
    const n1 = await buildInsert("CrmEmailEvent", { providerEventId: null }); const r3 = await tryStmt(n1.sql, n1.params);
    const n2 = await buildInsert("CrmEmailEvent", { providerEventId: null }); const r4 = await tryStmt(n2.sql, n2.params);
    return { ok: r1.code === null && r2.code === "23505" && r3.code === null && r4.code === null, exp: "ok · 23505 · ok · ok", act: `${r1.code ?? "ok"} ${r1.msg} · ${r2.code ?? "ok"} · ${r3.code ?? "ok"} · ${r4.code ?? "ok"}` };
  }));
  const x5: string[] = [];
  for (const t of ["CrmSequenceEnrollment", "CrmEmailMessage", "CrmImportJob"]) { const h = (await colInfo(t)).get("leaseUntil"); if (!h || !TS.includes(h.udt) || !h.nullable) x5.push(`${t}.leaseUntil ${h ? `${h.udt}/${h.nullable}` : "missing"}`); }
  const emIdx = (await tableExists("CrmEmailMessage")) ? await idxList("CrmEmailMessage") : [];
  if (!hasIdx(enIdx, ["status", "nextAt"], false)) x5.push("CrmSequenceEnrollment index(status,nextAt) missing");
  if (!hasIdx(emIdx, ["scheduledAt", "status"], false)) x5.push("CrmEmailMessage index(scheduledAt,status) missing");
  chk("C2.0-X5.1", "X5: rows picked by jobs carry leaseUntil DateTime? (claim = conditional update on the lease, never on the terminal state): CrmSequenceEnrollment (runDue) · CrmEmailMessage (scheduled send) · CrmImportJob (async import) + pickup indexes (status,nextAt) / (scheduledAt,status)", x5.length === 0, "all", `${x5.join(" · ")}${ABSENT}`);
  const plainTok: string[] = [];
  for (const t of NEW_TABLE_NAMES) for (const col of (await colInfo(t)).keys()) if (/token$/i.test(col) && !/(Hash|Ref)$/.test(col)) plainTok.push(`${t}.${col}`);
  const emU = (await tableExists("CrmEmailMessage")) ? hasIdx(await idxList("CrmEmailMessage"), ["trackTokenHash"], true) : false;
  chk("C2.0-X7.1", "R7c / X7: tracking tokens are stored only as a hash — CrmEmailMessage.trackTokenHash UNIQUE, and no new table has a plaintext *Token column", plainTok.length === 0 && emU, "hash only", `plaintext: ${plainTok.join(",") || "-"} · trackTokenHash unique=${emU}${ABSENT}`);
  const ipCols: string[] = []; const secretCols: string[] = [];
  for (const t of NEW_TABLE_NAMES) for (const col of (await colInfo(t)).keys()) {
    if (/^(ip|ipAddr|ipAddress|remoteIp|clientIp|remoteAddr)$/i.test(col)) ipCols.push(`${t}.${col}`);
    if (/(password|secret|accessToken|refreshToken|apiKey|privateKey|clientSecret)/i.test(col)) secretCols.push(`${t}.${col}`);
  }
  const hasIpHash = (await colInfo("CrmWebSession")).has("ipHash");
  chk("C2.0-X8.1", "X8: no new table stores a raw IP address (CrmWebSession keeps ipHash only)", ipCols.length === 0 && hasIpHash, "no ip column · ipHash present", `ip: ${ipCols.join(",") || "-"} · ipHash=${hasIpHash}${ABSENT}`);
  chk("C2.0-X10.1", "X10: no new table has a secret-bearing column (password/secret/access|refresh token/api key) — CrmMailProvider stores tokenRef only", secretCols.length === 0 && (await colInfo("CrmMailProvider")).has("tokenRef"), "none · tokenRef", `${secretCols.join(",") || "-"}${ABSENT}`);
} catch (e) {
  console.error("💥", e);
  chk("C2.0-ERR", "oracle ran to the end", false, "end", String((e as Error)?.message ?? e).slice(0, 240));
} finally {
  await cleanup();
  await db.end().catch(() => undefined);
}
async function cleanup() {
  const d = async (sql: string, params: unknown[]) => { try { await db.query(sql, params); } catch { /* table may not exist yet */ } };
  try { await db.query("ROLLBACK"); } catch { /* no open tx */ }
  if (raceSeqIds.length) await d(`DELETE FROM "CrmSequenceEnrollment" WHERE "sequenceId" = ANY($1)`, [raceSeqIds]);
  await d(`DELETE FROM "CrmDealPayment" WHERE "refId" LIKE $1`, [`${TAGP}-%`]);
  for (const m of [...made].reverse()) await d(`DELETE FROM "${m.t}" WHERE id=$1`, [m.id]);
  const left = made.length ? await q<{ n: number }>(`select count(*)::int as n from "CrmSequence" where name like $1`, [`${TAGP}%`]).catch(() => [{ n: -1 }]) : [{ n: 0 }];
  if (Number(left[0]?.n ?? 0) !== 0) console.log(`⚠️  cleanup left ${left[0]?.n} CrmSequence rows tagged ${TAGP}`);
}
const total = cks.length; const passed = cks.filter((x) => x.ok).length;
const findings = cks.filter((x) => !x.ok).map((x) => ({ id: x.id, sev: x.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.0: ${passed}/${total}${migDir ? "" : " (--force-run without migration: RED expected outside T0)"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, ...(migDir ? {} : { forced: true, migrationAbsent: true }) })}`);
process.exit(passed === total ? 0 : 1);
