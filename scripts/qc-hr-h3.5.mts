// QC — HR V2 · H3.5 salary transfer files: KBank PCT [V]/[V2-weak] · KTB iPay [V2] (fixed width, off by default, "ยังไม่ทดสอบกับธนาคารจริง") ·
//      generic CSV/XLSX with saved per-shop mapping (+ KTB Business preset) · brief ledger/hr-briefs/hr-brief-H3.5.md (DRAFT · Q1–Q13 defaults)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every golden byte is a fixture built field by field from the research layouts (ledger/wo-notes/hr-H3.5-oracle.md) — never by the code under test.
//    G1 and G3A equal the research's own independent vectors (hr-H3.5-H3.6-formats-research.md C3 V3/V4) byte for byte.
// Tenants qc-hr-h35-<stamp> · runs dated 2031 · opts.now injected · SKIP while hr/bank-files/build.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H35_BASE") (merge-base HEAD origin/session/hr) · base-diff parts n/a once bank-files/service.ts is in the base
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.5.mts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, canon, sha, keysDeep, jsonOf, loadOpt, modState,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, fileAt, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, tagOf, HR_FORBIDDEN_DTO_KEYS, msgParity, testidsOf, inventoryParity,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h3.5";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h35-";
const H = "src/lib/modules/hr/";
const BF = `${H}bank-files/`;
const F = {
  build: `${BF}build.ts`, svc: `${BF}service.ts`, acts: `${BF}actions.ts`, ui: `${BF}ui.tsx`,
  pure: ["build", "codes", "encode", "kbank", "ktb", "generic", "xlsx"].map((n) => `${BF}${n}.ts`),
  route: "src/app/app/sys/[id]/hr/payroll/bank-file/[fileId]/route.ts",
  dl: `${BF}download-route.ts`, // ORACLE-EDIT H3.5 fix r1 (F5): route logic lives in a helper the oracle can call without cookies

  mig: "prisma/migrations/20270107000000_hr_bank_files/migration.sql", schema: "prisma/schema/payroll.prisma", hrSchema: "prisma/schema/hr.prisma",
  scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts", payPage: "src/app/app/sys/[id]/hr/payroll/page.tsx", setPage: "src/app/app/sys/[id]/hr/settings/page.tsx",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
const FIX = "scripts/fixtures/";
const TX = jsonOf(`${FIX}hr-h3.5-texts.json`) as Any;
const VEC = jsonOf(`${FIX}hr-h3.5-vectors.json`) as Any;
const gold = (n: string) => readFileSync(join(ROOT, FIX, n));
const T = TX?.th ?? {};
const FROZEN = [
  PAYROLL_RULES_FILE, `${H}payroll.ts`, `${H}payroll-actions.ts`, `${H}payroll-ui.tsx`, `${H}payroll-rules-v2.ts`, `${H}payroll-digest.ts`, `${H}privacy.ts`,
  `${H}privacy-shared.ts`, `${H}service.ts`, `${H}scope.ts`, `${H}stock-charge.ts`, `${H}attendance-pay.ts`, `${H}law.ts`, "src/lib/outbox-consumers.ts",
  "src/lib/storage/service.ts", "src/lib/core/rbac.ts", "scripts/seed-hr-qc.mts", "scripts/fitness-hr.mts", "scripts/qc-hr-lib.mts",
  "scripts/qc-hr-h1.2.mts", "scripts/qc-hr-h1.3.mts", "scripts/qc-hf-hr-privacy.mts", "src/lib/modules/approval", "src/lib/modules/account",
];
const TESTIDS = ["hr-bank-open-*", "hr-bank-format", "hr-bank-tile", "hr-bank-excluded", "hr-bank-warn", "hr-bank-untested", "hr-bank-ack", "hr-bank-generate", "hr-bank-legal",
  "hr-bank-files", "hr-bank-file-*", "hr-bank-dl-*", "hr-bank-profile", "hr-bank-fmt-*", "hr-bank-ack-untested", "hr-bank-profile-save", "hr-bank-presets", "hr-bank-preset-save"];
const PREVIEW_KEYS = srt(["ok", "itemCount", "totalSatang", "runNetSatang", "rows", "notIncluded", "warnings", "untested"]);
const ROW_KEYS = srt(["seq", "employeeId", "name", "bankCode", "accountMasked", "amountSatang"]);
const NI_KEYS = srt(["employeeId", "name", "cause", "netSatang"]);
const WARN_KEYS = srt(["employeeId", "name", "warning"]);
const FILE_KEYS = srt(["id", "format", "fileName", "itemCount", "totalSatang", "excludedCount", "createdAt", "expiresAt", "createdByName", "downloads"]);
const AUDIT_KEYS = srt(["fileId", "format", "itemCount", "totalSatang", "excludedCount"]);

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] migration 20270107000000_hr_bank_files: 3 CREATE TABLE (HrBankProfile · HrBankExportPreset · HrBankFile) + CHECKs · additive only
S1.2|R1|C|R|[static] payroll.prisma 3 models · HrEmployee/HrPayrollRun/HrPayrollItem blocks unchanged vs base · scope.ts sys() ×3 · hr-qc-env ×3
S1.3|R2|C|R|[static] pure layer bank-files/{build,codes,encode,kbank,ktb,generic,xlsx}.ts: imports ⊆ ./ + node:zlib · no db/clock/random/fetch
S1.4|Q3|C|G|[static] [control] no bankFileKey in bank-files/** or route · R7/S6.1 oracles + privacy 6-key list untouched (no ORACLE-EDIT needed)
S1.5|frozen|C|G|[static] [control] payroll-rules sha · frozen files/dirs unchanged vs base
S1.6|§5|M|R|[static] marked hunks "HR H3.5" in payroll.prisma · core/scope.ts · hr-qc-env.mts · payroll page · settings page (every hunk marked)
S1.7|R14|C|R|[static] download route: GET → downloadBankFile · attachment · no-store · nosniff · no bytes on refusal
S1.8|R15|M|R|[static] UI testids · inventory rows wo H3.5 · hr.bank.* th = en · untested th/en exact · untested + legal texts used
S1.9|R15|C|R|[static] client boundary: ui.tsx exists · no "use client" file under bank-files imports service/build/db or reads account fields
S1.10|R10|C|R|[static] service: gate reads permissions "hr.payroll.read" ∧ "hr.payroll.pay" explicitly · actions "use server" · writeAudit actions named
S2.0|fix|C|G|[pure] [control] goldens self-consistent: line lengths · header count/total = Σ details · G1/G3A key slices = research C3 tables
S2.1|R4|C|R|[pure] BANK_TEXT = texts fixture (th + reasons + warnings) byte-exact
S2.2|R4|C|R|[pure] resolveBankCode: 24 vectors (4 [V] codes · prefixes/suffixes · unknown ⇒ null)
S2.3|R5|C|R|[pure] G1 KBank PCT ASCII byte-exact + meta + 5 not-included causes · TIS620 run = same bytes, charset windows-874
S2.4|R5 R7|C|R|[pure] G2 KBank PCT TIS-620 Thai names (fallback + cut 50) byte-exact · G2A ASCII ⇒ ENCODING text listing 3 employees
S2.5|R6|C|R|[pure] G3A/G3B/G3C KTB iPay STANDARD byte-exact (era CE/BE × receiving branch ZEROS/SPACES) · SAME_BANK
S2.6|R6|C|R|[pure] G4 KTB iPay DIRECT defaults (TIS620 · CE · SPACES · ref HR202611-0001 · service 02) byte-exact
S2.7|R8|C|R|[pure] G5A/G5B/G5C generic CSV byte-exact (preset GENERIC · custom mapping SATANG/DMY_BE/summary/TIS620 · DMY_CE/BAHT)
S2.8|R8|C|R|[pure] G6 XLSX = G5A rows (parseImportFile) · every cell string + numFmt 49 · G7 KTB_BUSINESS preset rows
S2.9|R8|C|R|[pure] G8 formula cells ⇒ FORMULA text listing 2 employees (never neutralised)
S2.10|R3|C|R|[pure] refusals: STATUS ×2 · NEGATIVE · MISMATCH · EMPTY (+ report) · OPTIONS ×4 · PROFILE ×4 · fixed texts
S2.11|R3|C|R|[pure] properties ×40 sets × 4 formats: widths · header = Σ details · Σ file + Σ excluded = run net · deterministic · input not mutated
S2.12|R5–R8|M|R|[pure] edges: 1 satang · 21,474,836.47 · OVER_LIMIT at 3,000,000.01 only · EFFECTIVE_PAST · DUP_ACCOUNT · KTB NAME_CUT 100
S3.0|fix|C|G|[db] [control] fixture: 7 runs inserted (APPROVED/DRAFT/REVERSED/PAID/mismatch/v2/negative) · Σ items = totals · tenant has no ACCOUNT system
S3.1|R10 R12|C|R|[db] profile: owner saves · ackUntested · profileInput · non-owner profileOwner · read owner full / payroll masked / others no · audit {formatsEnabled}
S3.2|R9 R5|C|R|[db] DB1 KBank PCT via generateBankFile (owner, defaults) byte-exact · meta · notIncluded DTO · preview same counts
S3.3|R11|C|R|[db] manifest row (sha · bytes · counts · createdAt = now · expiresAt +7 d · no account digits) · run row unchanged · no outbox/adjustment write
S3.4|R12|C|R|[db] audit generate row: action · target · after keys exact + values · no account digits anywhere in audit · console silent on accounts
S3.5|R11|C|R|[db] download: same bytes + audit + downloads 1 · account edited ⇒ changed · restored ⇒ ok · past expiry ⇒ expired
S3.6|R3|C|R|[db] DRAFT/REVERSED ⇒ status · mismatch ⇒ mismatch · negative ⇒ negative · no manifest on refusal · PAID ok · v2 run ok
S3.7|R6 R10|C|R|[db] KTB on system A: off ⇒ formatOff · enabled with KBank debit ⇒ profile · system B DB2 KTB STANDARD byte-exact
S3.8|R8|C|R|[db] generic CSV preset GENERIC on run 1: 5 rows · Σ = 80,122.67 · excluded 2 · header row
S3.9|R8|M|R|[db] presets: save · duplicate name · 0 columns · bad field · list · generate with preset id · other system id ⇒ no · delete · audit
S3.10|R7|C|R|[db] ASCII on run 1 ⇒ encoding text naming the Thai account holder's display name
S3.11|R13|C|R|[db] DTOs: preview / rows / notIncluded / warnings / file list keys exact · no forbidden key · account digits only as •••last4
S4.1|R10|C|R|[db] 10 viewers × 5 operations: owner + payroll(read+pay) ok · read-only · pay-only · branch-limited · managers · member · self · other tenant ⇒ no (identical bytes) · nothing written
S4.2|X2|C|R|[db] cross-system/tenant: system B ctx with run/file of A · other tenant ctx ⇒ no (identical bytes)
S5.1|X6|M|R|[db] 6 parallel generates ⇒ 6 manifests · one sha · audit 6
S5.2|X6|C|R|[db] generate ∥ reverseRun (v2 run) ⇒ consistent · download after reverse ⇒ status
X8.1|X8|M|R|[db] tenant without ACCOUNT/POS: S3.2 path ok and no account/POS row written
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
S6.1|F1|C|R|[pure] fix r1: effective year outside 2000–2400 (KTB CE/BE · PCT) ⇒ OPTIONS · bounds 2000-01-01 / 2400-12-31 BE ⇒ 498 · fixedLinesOk rejects 497/499
S6.2|F1|C|R|[db] fix r1: generate KTB 9999-12-31 BE ⇒ options · no manifest · no audit
S6.3|F2|C|R|[pure] fix r1: PCT item ≥ 10^15 ⇒ AMOUNT naming the employee · Σ ≥ 10^15 ⇒ AMOUNT naming the file total · 10^15−1 ⇒ 487 bytes
S6.4|F3|C|R|[pure] fix r1: Thai cut at the last complete cluster (50×ก+่ · 49×ก+เก · 48×ก+กิ่ข · KTB 99×ก+ก้) padded with spaces · NAME_CUT · plain ASCII cut unchanged
S6.5|F4|C|R|[pure] fix r1: formula after leading whitespace/control · leading tab outright · name/code trimmed · UTF-8 CSV control/bidi ⇒ ENCODING · XLSX bidi ⇒ ENCODING
S6.6|F5|C|R|[db] fix r1: route helper — rsc / next-router-prefetch ⇒ 204 · HEAD ⇒ 405 (ORACLE-EDIT H3.9 fix r1 F2a), no count, no audit · plain ⇒ 200 bytes +1/+1 · attachment sanitised · no-store · nosniff · 404/409/410 text, no bytes
S6.7|F6|C|R|[db] fix r1: bank format switched off ⇒ download formatOff (CSV file unaffected) · on again ⇒ ok
S6.8|F7|M|R|[pure] fix r1: BANK_TEXT_EN = fixture en · same keys as BANK_TEXT · {names} parity · no Thai in en · bankTextFor(locale)
S6.9|F8|M|R|[db] fix r1: empty employee code sorts like null (last) · shop debit account changed ⇒ changed · restored ⇒ ok
S6.10|F8|C|G|[db] fix r1: download ∥ reverseRun ×4 ⇒ consistent (ok-then-reversed or status) · later downloads ⇒ status · audit = real downloads
S6.11|F8|C|G|[db+static] fix r1: page data for managers / read-only / pay-only / branch / member / self = nothing (canUseBankFiles false · runs/profile/presets NO) · owner + payroll true · both UI parts return null without the gate
Z1|house|C|G|no residue (3 new tables included)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.5-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.5-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.build))) skipReasons.push(`${F.build} absent (H3.5 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H35_BASE") || "30f83b99a";
const IN_BASE = pathInBase(F.svc, BASE);
const listDir = (d: string): string[] => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).map((n) => `${d}${n}`) : []);
const markedOk = (file: string) => {
  const hs = diffHunks(BASE, file);
  if (!hs) return false;
  const mine = hs.filter((h) => h.added.some((l) => /HR H3\.5/.test(l)));
  return mine.length > 0 && hs.every((h) => h.added.concat(h.removed).some((l) => /HR H\d|H\d\.\d/.test(l)));
};
const modelBlock = (src: string | null, name: string) => {
  if (!src) return "";
  const i = src.search(new RegExp(`^model ${name} \\{`, "m"));
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i) + 2);
};
const enc = (s: string) => Buffer.from(s, "utf8");
const bufOf = (x: unknown): Buffer | null => (x instanceof Uint8Array ? Buffer.from(x) : null);
const eqBytes = (x: unknown, g: Buffer) => {
  const b = bufOf(x);
  return !!b && Buffer.compare(b, g) === 0;
};
const diffAt = (x: unknown, g: Buffer) => {
  const b = bufOf(x);
  if (!b) return `no bytes (${typeof x})`;
  for (let i = 0; i < Math.max(b.length, g.length); i++) if (b[i] !== g[i]) return `len ${b.length}/${g.length} first diff @${i}`;
  return "same";
};
const ACCT_RE = /\d{10,15}/;

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  // S1.1
  {
    const m = rd(F.mig);
    const tables = ["HrBankProfile", "HrBankExportPreset", "HrBankFile"];
    const r = {
      exists: !!m,
      tables: tables.every((t) => new RegExp(`CREATE TABLE "${t}"`).test(m)),
      checks: (m.match(/\bCHECK\b/g) ?? []).length >= 6,
      uniqueSys: /UNIQUE[^;]*"systemId"/i.test(m) || /CREATE UNIQUE INDEX[^;]*"HrBankProfile"[^;]*\("systemId"\)/.test(m),
      additive: !/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b|\bRENAME\b|ALTER\s+COLUMN|ALTER TABLE "(HrEmployee|HrPayrollRun|HrPayrollItem)"/i.test(m),
    };
    ck("S1.1", r, "3 tables · CHECKs · additive");
  }
  // S1.2
  {
    const cur = rd(F.schema);
    const base = fileAt(BASE, F.schema);
    const hrCur = rd(F.hrSchema);
    const hrBase = fileAt(BASE, F.hrSchema);
    const scope = rd(F.scope);
    const env = rd(F.env);
    const r = {
      models: ["HrBankProfile", "HrBankExportPreset", "HrBankFile"].every((m) => new RegExp(`^model ${m} \\{`, "m").test(cur)),
      // ORACLE-EDIT (H3.4 merge round): base-diff part n/a once H3.5 is in the base (as the header says / S1.6) — later tickets (H3.4) legitimately change these files; still checked on H3.5's own branch
      runSame: IN_BASE || (!!base && modelBlock(cur, "HrPayrollRun") === modelBlock(base, "HrPayrollRun") && modelBlock(cur, "HrPayrollItem") === modelBlock(base, "HrPayrollItem")),
      empSame: !!hrBase && modelBlock(hrCur, "HrEmployee") === modelBlock(hrBase, "HrEmployee"),
      scope: ["HrBankProfile", "HrBankExportPreset", "HrBankFile"].every((m) => new RegExp(`\\b${m}:\\s*sys\\(\\)`).test(scope)),
      env: ["HrBankProfile", "HrBankExportPreset", "HrBankFile"].every((m) => new RegExp(`model:\\s*"${m}"`).test(env)),
    };
    ck("S1.2", r, "models · frozen blocks · scope · env");
  }
  // S1.3
  {
    const bad: string[] = [];
    for (const f of F.pure) {
      const s = rd(f);
      if (!s) {
        bad.push(`∅${f.slice(BF.length)}`);
        continue;
      }
      const src = stripComments(s);
      const imps = importsOf(s).filter((i) => !(i.spec.startsWith("./") || i.spec === "node:zlib"));
      if (imps.length) bad.push(`${f.slice(BF.length)} imports ${imps.map((i) => i.spec).join(",")}`);
      if (/\bDate\.now\(|new Date\(\s*\)|Math\.random|\bprisma\b|tenantDb|\bfetch\(|process\.env|"use server"|"use client"/.test(src)) bad.push(`${f.slice(BF.length)} impure token`);
    }
    chk("S1.3", bad.length === 0, "7 pure files", bad.join(" · ") || "ok");
  }
  // S1.4 control
  {
    const files = [...listDir(BF).filter((p) => /\.(ts|tsx)$/.test(p)), F.route].filter((p) => existsSync(join(ROOT, p)));
    const hits = files.filter((f) => /\bbankFileKey\b/.test(stripComments(rd(f))));
    const oracles = changedVsBase(BASE, ["scripts/qc-hr-h1.2.mts", "scripts/qc-hr-h1.3.mts", "scripts/qc-hf-hr-privacy.mts", "scripts/fitness-hr.mts"]);
    const ps = rd(`${H}privacy-shared.ts`);
    const six = /EMPLOYEE_SENSITIVE_FIELDS = \[\s*"nationalId",\s*"ssoNumber",\s*"houseRegAddress",\s*"bankName",\s*"bankAccountNo",\s*"bankAccountName",\s*\] as const/.test(ps);
    // ORACLE-EDIT (H3.4 merge round): base-diff part n/a once H3.5 is in the base (as the header says / S1.6) — later tickets (H3.4) legitimately change these files; still checked on H3.5's own branch
    ck("S1.4", { noKey: hits.length === 0, oracles: IN_BASE || oracles === "unchanged", six }, "no bankFileKey · oracles unchanged · 6 keys", `${hits.join(",")} ${oracles}`);
  }
  // S1.5 control
  {
    const shaOk = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
    const d = changedVsBase(BASE, FROZEN);
    // ORACLE-EDIT (H3.4 merge round): base-diff part n/a once H3.5 is in the base (as the header says / S1.6) — later tickets (H3.4) legitimately change these files; still checked on H3.5's own branch
    ck("S1.5", { shaOk, frozen: IN_BASE || d === "unchanged" }, "unchanged", d);
  }
  // S1.6
  {
    const r = IN_BASE
      ? { inBase: true }
      : { schema: markedOk(F.schema), scope: markedOk(F.scope), env: markedOk(F.env), payPage: markedOk(F.payPage), setPage: markedOk(F.setPage) };
    ck("S1.6", r, "every hunk marked", IN_BASE ? "n/a · H3.5 in base" : "");
  }
  // S1.7
  {
    // ORACLE-EDIT H3.5 fix r1 (F5, controller ruling): the GET logic moved to bank-files/download-route.ts#bankFileGet (behaviour tested in S6.6) —
    //   the route must call it; service call + header contract are read from route + helper together; noRaw applies to both
    const s0 = stripComments(rd(F.route));
    const h0 = stripComments(rd(F.dl));
    const s = `${s0}\n${h0}`;
    const r = {
      exists: !!s0 && !!h0,
      get: /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(s0),
      svc: /bankFileGet\s*\(/.test(s0) && /downloadBankFile\s*\(/.test(h0),
      attach: /attachment/.test(s) && /Content-Disposition/i.test(s),
      noStore: /no-store/.test(s),
      nosniff: /nosniff/i.test(s),
      noRaw: !/\bprisma\b|tenantDb|bankAccountNo/.test(s),
    };
    ck("S1.7", r, "route contract");
  }
  // S1.8
  {
    const ui = rd(F.ui);
    const ids = new Set([...testidsOf(ui, "hr-bank-"), ...testidsOf(rd(F.setPage), "hr-bank-")]);
    const th = jsonOf(F.th)?.hr?.bank ?? {};
    const en = jsonOf(F.en)?.hr?.bank ?? {};
    const mp = msgParity(th, en, ["untested", "title"]);
    const invRows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => String(r.testid ?? "").startsWith("hr-bank-"));
    const r = {
      testids: TESTIDS.every((t) => ids.has(t)),
      inv: invRows.length >= TESTIDS.length && invRows.every((r) => r.wo === "H3.5" && r.oracle === "qc-hr-h3.5"),
      msg: Object.values(mp).every(Boolean),
      untested: th.untested === TX?.messages?.untested?.th && en.untested === TX?.messages?.untested?.en,
      // ORACLE-EDIT H3.5 fix r1 (F8, reviewer minor): `\blegal\b` matched the testid — now the texts must be rendered as JSX expressions
      texts: /\.untestedLong\s*\}/.test(stripComments(ui)) && /\.legal\s*\}/.test(stripComments(ui)),
    };
    ck("S1.8", r, "ids · inventory · messages", `missing ids: ${TESTIDS.filter((t) => !ids.has(t)).join(",") || "-"} · inv ${invRows.length}`);
  }
  // S1.9
  {
    const files = listDir(BF).filter((p) => /\.(ts|tsx)$/.test(p));
    const clients = files.filter((f) => /^\s*["']use client["']/m.test(rd(f)));
    const bad = clients.filter((f) => {
      const s = rd(f);
      return importsOf(s).some((i) => /service|build|core\/db|\.\/(kbank|ktb|generic|xlsx|encode|codes)$/.test(i.spec)) || /\b(bankAccountNo|debitAccountNo|accountNo)\b/.test(stripComments(s));
    });
    ck("S1.9", { ui: existsSync(join(ROOT, F.ui)), clean: bad.length === 0 }, "ui · clean client files", bad.join(","));
  }
  // S1.10
  {
    const s = stripComments(rd(F.svc));
    const a = rd(F.acts);
    const r = {
      svc: !!s,
      read: /["']hr\.payroll\.read["']\]\s*===\s*true/.test(s),
      pay: /["']hr\.payroll\.pay["']\]\s*===\s*true/.test(s),
      audit: ["hr.bankfile.generate", "hr.bankfile.download", "hr.bankfile.profile", "hr.bankfile.preset"].every((x) => s.includes(`"${x}"`)),
      actions: /^\s*["']use server["']/m.test(a),
      noBytesStore: !/uploadFile|bankFileKey/.test(s),
    };
    ck("S1.10", r, "gate keys · audit names · actions");
  }
}

// ═════════════════════════ pure ═════════════════════════
const NOWS = (s: string) => new Date(s);
function callBuild(B: Any, input: Any): Any {
  if (typeof B?.buildBankFile !== "function") return { ok: false, code: "∅buildBankFile", text: modState(B, F.build) };
  try {
    return B.buildBankFile({ ...input, now: NOWS(input.now) });
  } catch (e) {
    return { ok: false, code: "THROW", text: errText(e) };
  }
}
const niOf = (r: Any) => ((r?.notIncluded ?? []) as Any[]).map((x) => [x.employeeId, x.cause, x.netSatang]);
const wOf = (r: Any) => srt(((r?.warnings ?? []) as Any[]).map((w) => `${w.employeeId ?? "-"}:${w.code}`));
const wWant = (v: Any) => srt(((v.warnings ?? []) as Any[]).map(([e, c]: [string, string]) => `${e ?? "-"}:${c}`));
function metaOk(r: Any, v: Any) {
  return {
    ok: r?.ok === true,
    fileName: r?.fileName === v.fileName,
    ctype: v.contentType ? r?.contentType === v.contentType : true,
    count: r?.itemCount === v.itemCount,
    total: r?.totalSatang === v.totalSatang,
    ni: canon(niOf(r)) === canon(v.notIncluded ?? []),
    warn: wOf(r) === wWant(v),
  };
}
function goldenCheck(id: string, B: Any, keys: string[]) {
  const r: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const k of keys) {
    const v = VEC[k];
    const out = callBuild(B, v.input);
    const m = metaOk(out, v);
    const bytes = eqBytes(out?.bytes, gold(v.golden));
    r[`${k}.bytes`] = bytes;
    for (const [mk, mv] of Object.entries(m)) r[`${k}.${mk}`] = mv;
    if (!bytes || !Object.values(m).every(Boolean)) notes.push(`${k}: ${out?.ok === false ? `${out.code} ${short(out.text, 50)}` : diffAt(out?.bytes, gold(v.golden))} ${failedKeys(m)}`);
  }
  ck(id, r, keys.join("+") + " exact", notes.join(" | "));
}
function textFor(code: string, names: string[] = []) {
  const key: Record<string, string> = { STATUS: "status", NEGATIVE: "negative", MISMATCH: "mismatch", OPTIONS: "options", PROFILE: "profile", ENCODING: "encoding", FORMULA: "formula", EMPTY: "empty", AMOUNT: "amount", LAYOUT: "layout" }; // ORACLE-EDIT H3.5 fix r1: + AMOUNT/LAYOUT texts (F1/F2)
  return String(T[key[code]] ?? "∅").replace("{names}", names.join(", "));
}
const refusalOk = (r: Any, code: string, names?: string[], emps?: string[]) =>
  r?.ok === false && r.code === code && r.text === textFor(code, names ?? []) && (!emps || canon(((r.employees ?? []) as Any[]).map((e) => e.employeeId)) === canon(emps));

// mini unzip (XLSX inspection only)
function unzip(b: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(b);
  const m = new Map<string, Buffer>();
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) return m;
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString("utf8");
    const lnl = buf.readUInt16LE(lho + 26), lxl = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + lnl + lxl, lho + 30 + lnl + lxl + csize);
    try {
      m.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    } catch {
      m.set(name, Buffer.alloc(0));
    }
    p += 46 + nl + xl + cl;
  }
  return m;
}
function xlsxTextOnly(bytes: Uint8Array): { ok: boolean; note: string } {
  const z = unzip(bytes);
  const styles = z.get("xl/styles.xml")?.toString("utf8") ?? "";
  const sheetName = [...z.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k));
  const sheet = sheetName ? z.get(sheetName)!.toString("utf8") : "";
  const xfsBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const xfs = [...xfsBlock.matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => /numFmtId="(\d+)"/.exec(m[1])?.[1] ?? "0");
  const cells = [...sheet.matchAll(/<c\b([^>]*?)(\/>|>)/g)].map((m) => m[1]);
  const bad = cells.filter((a) => {
    const s = Number(/\bs="(\d+)"/.exec(a)?.[1] ?? "0");
    const t = /\bt="([^"]+)"/.exec(a)?.[1] ?? "n";
    return xfs[s] !== "49" || !(t === "s" || t === "inlineStr");
  });
  return { ok: !!sheet && cells.length > 0 && bad.length === 0, note: `${sheetName ?? "no sheet"} cells=${cells.length} bad=${bad.length} xfs=${xfs.join(",")}` };
}
const padRows = (rows: string[][]) => {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(w - r.length).fill("")]);
};

// deterministic payee sets for properties
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
function propSets(): Any[] {
  const out: Any[] = [];
  const banks = ["กสิกรไทย", "KBank", "SCB", "ไทยพาณิชย์", "กรุงเทพ", "BBL", "กรุงไทย", "KTB", "กรุงศรี", "", null];
  for (let c = 0; c < 40; c++) {
    const r = lcg(1000 + c);
    const n = 1 + Math.floor(r() * 12);
    const payees = Array.from({ length: n }, (_, i) => {
      const acctKind = r();
      const accountNo = acctKind < 0.08 ? null : acctKind < 0.14 ? "12345" : String(Math.floor(r() * 1e10)).padStart(10, "0");
      const net = r() < 0.1 ? 0 : 1 + Math.floor(r() * 5_000_000);
      return { employeeId: `p${c}-${i}`, name: `PAYEE ${c} ${i}`, code: `P${String(i).padStart(3, "0")}`, bankName: banks[Math.floor(r() * banks.length)], accountNo, accountName: r() < 0.2 ? null : `NAME ${c} ${i}`, netSatang: net };
    });
    out.push(payees);
  }
  return out;
}
const PROF_K = { debitBankCode: "004", debitAccountNo: "1112223334", debitBranchCode: null, companyNameEn: "SHOP CO LTD", ktbCompanyId: null };
const PROF_T = { debitBankCode: "006", debitAccountNo: "1112223334", debitBranchCode: "0123", companyNameEn: "SHOP CO LTD", ktbCompanyId: "COMPANY01" };
const runOf = (total: number, status = "APPROVED") => ({ runId: "run-p", periodKey: "2026-11", payDate: "2026-11-25", status, totalNetSatang: total });
const NOW1 = "2026-11-24T10:20:30+07:00";

function runPure(B: Any, DORM: Any): void {
  // S2.0 control — goldens self-consistent + research slices
  {
    const lines = (n: string) => gold(n).toString("latin1").split("\r\n").slice(0, -1);
    const pct = (n: string) => {
      const L = lines(n);
      const sum = L.slice(1).reduce((a, l) => a + Number(l.slice(32, 47)), 0);
      return L[0].length === 178 && L.slice(1).every((l) => l.length === 487) && Number(L[0].slice(51, 66)) === sum && Number(L[0].slice(154, 172)) === L.length - 1;
    };
    const ktb = (n: string) => {
      const L = lines(n);
      const sum = L.slice(1).reduce((a, l) => a + Number(l.slice(57, 74)), 0);
      return L.every((l) => l.length === 498) && Number(L[0].slice(19, 38)) === sum && Number(L[0].slice(12, 19)) === L.length - 1;
    };
    const g3 = lines("hr-h3.5-g3a-ktb-std.txt");
    const g1 = lines("hr-h3.5-g1-kbank-pct.txt");
    const r = {
      vec: !!VEC && !!TX,
      pct: ["hr-h3.5-g1-kbank-pct.txt", "hr-h3.5-g2-kbank-pct-tis620.txt", "hr-h3.5-db1-kbank-pct.txt"].every(pct),
      ktb: ["hr-h3.5-g3a-ktb-std.txt", "hr-h3.5-g3b-ktb-std.txt", "hr-h3.5-g3c-ktb-std.txt", "hr-h3.5-g4-ktb-direct.txt", "hr-h3.5-db2-ktb-std.txt"].every(ktb),
      v3: g3[1].slice(9, 12) === "014" && g3[1].slice(16, 27) === "01234567890" && g3[1].slice(53, 55) === "01" && g3[1].slice(57, 74) === "00000000001500000" && g3[1].slice(392, 398) === "000001" && g3[1].slice(398, 400) === "09" && g3[0].slice(12, 19) === "0000002" && g3[0].slice(19, 38) === "0000000000002443000",
      v4: g1[0].slice(51, 66) === "000000002443000" && g1[0].slice(154, 172) === "000000000000000002" && g1[1].slice(32, 47) === "000000001500000" && g1[1].slice(48, 54) === "261124",
      bom: gold("hr-h3.5-g5a-generic.txt").subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && gold("hr-h3.5-g5b-generic-tis620.txt")[0] !== 0xef,
    };
    ck("S2.0", r, "fixtures consistent");
  }
  // S2.1
  {
    const want = canon({ ...T, reasons: TX?.reasons, warnings: TX?.warnings });
    chk("S2.1", canon(B?.BANK_TEXT) === want, "BANK_TEXT = fixture", B?.BANK_TEXT ? "differs" : modState(B, F.build));
  }
  // S2.2
  {
    const bad = ((VEC?.CODES ?? []) as [string | null, string | null][]).filter(([i, o]) => {
      try {
        return (B?.resolveBankCode?.(i) ?? null) !== o;
      } catch {
        return true;
      }
    });
    chk("S2.2", typeof B?.resolveBankCode === "function" && bad.length === 0, "24 vectors", bad.map(([i]) => JSON.stringify(i)).join(",") || (typeof B?.resolveBankCode === "function" ? "ok" : "∅resolveBankCode"));
  }
  // S2.3 G1 + TIS620 twin
  {
    const v = VEC.G1;
    const a = callBuild(B, v.input);
    const t = callBuild(B, { ...v.input, options: { ...v.input.options, encoding: "TIS620" } });
    const m = metaOk(a, v);
    ck("S2.3", { bytes: eqBytes(a?.bytes, gold(v.golden)), ...m, twin: eqBytes(t?.bytes, gold(v.golden)), twinCt: t?.contentType === "text/plain; charset=windows-874" }, "G1 exact",
      a?.ok === false ? `${a.code} ${short(a.text, 60)}` : diffAt(a?.bytes, gold(v.golden)));
  }
  // S2.4 G2 + G2A
  {
    const v = VEC.G2;
    const a = callBuild(B, v.input);
    const x = callBuild(B, VEC.G2A.input);
    ck("S2.4", { bytes: eqBytes(a?.bytes, gold(v.golden)), ...metaOk(a, v), ascii: refusalOk(x, "ENCODING", VEC.G2A.names, VEC.G2A.employees) }, "G2 exact · G2A refused",
      `${a?.ok === false ? `${a.code} ${short(a.text, 40)}` : diffAt(a?.bytes, gold(v.golden))} · G2A ${x?.code} ${short(x?.text, 50)}`);
  }
  goldenCheck("S2.5", B, ["G3A", "G3B", "G3C"]);
  goldenCheck("S2.6", B, ["G4"]);
  goldenCheck("S2.7", B, ["G5A", "G5B", "G5C"]);
  // S2.8 XLSX
  {
    const g6 = callBuild(B, VEC.G6.input);
    const g7 = callBuild(B, VEC.G7.input);
    const parse = (o: Any): string[][] | null => {
      if (!o?.bytes || typeof DORM?.parseImportFile !== "function") return null;
      const p = DORM.parseImportFile(o.bytes);
      return p?.ok ? padRows([p.headers, ...p.rows]) : null;
    };
    const r6 = parse(g6);
    const r7 = parse(g7);
    const t6 = g6?.bytes ? xlsxTextOnly(g6.bytes) : { ok: false, note: "no bytes" };
    const t7 = g7?.bytes ? xlsxTextOnly(g7.bytes) : { ok: false, note: "no bytes" };
    ck("S2.8", {
      g6rows: !!r6 && canon(r6) === canon(padRows(VEC.G6.rows)), g6meta: g6?.fileName === VEC.G6.fileName && g6?.contentType === VEC.G6.contentType && g6?.itemCount === 3 && g6?.totalSatang === VEC.G6.totalSatang,
      g6text: t6.ok, g7rows: !!r7 && canon(r7) === canon(padRows(VEC.G7.rows)), g7text: t7.ok, det: !!g6?.bytes && eqBytes(callBuild(B, VEC.G6.input)?.bytes, Buffer.from(g6.bytes)),
    }, "rows + Text format", `${g6?.ok === false ? `${g6.code} ${short(g6.text, 40)}` : t6.note} · ${t7.note} · ${short(r7?.[0], 60)}`);
  }
  // S2.9
  {
    const x = callBuild(B, VEC.G8.input);
    chk("S2.9", refusalOk(x, "FORMULA", VEC.G8.names, VEC.G8.employees) && !x?.bytes, "FORMULA listing e2, e3", `${x?.code} ${short(x?.text, 80)}`);
  }
  // S2.10 refusals
  {
    const base = VEC.G1.input;
    const tot = base.run.totalNetSatang;
    const pay1 = (net: number) => [{ employeeId: "z1", name: "Z", code: null, bankName: "KBank", accountNo: "0123456789", accountName: "Z", netSatang: net }];
    const r: Record<string, unknown> = {
      draft: refusalOk(callBuild(B, { ...base, run: { ...base.run, status: "DRAFT" } }), "STATUS"),
      reversed: refusalOk(callBuild(B, { ...base, run: { ...base.run, status: "REVERSED" } }), "STATUS"),
      negative: refusalOk(callBuild(B, { ...base, payees: [...base.payees, { ...base.payees[0], employeeId: "neg", netSatang: -1 }], run: { ...base.run, totalNetSatang: tot - 1 } }), "NEGATIVE"),
      mismatch: refusalOk(callBuild(B, { ...base, run: { ...base.run, totalNetSatang: tot + 1 } }), "MISMATCH"),
      empty: (() => {
        const o = callBuild(B, { ...base, payees: [base.payees[2], base.payees[3]], run: { ...base.run, totalNetSatang: 50000 } });
        return refusalOk(o, "EMPTY") && canon(niOf(o)) === canon([["e3", "NET_ZERO", 0], ["e4", "NO_ACCOUNT", 50000]]);
      })(),
      optEff: refusalOk(callBuild(B, { ...base, options: { ...base.options, effectiveDate: "2026-02-30" } }), "OPTIONS"),
      optBatch: refusalOk(callBuild(B, { ...base, options: { ...base.options, batchRef: "NOV-26" } }), "OPTIONS"),
      optFormat: refusalOk(callBuild(B, { ...base, options: { ...base.options, format: "SCB" } }), "OPTIONS"),
      optCols: refusalOk(callBuild(B, { ...VEC.G5A.input, options: { format: "CSV", effectiveDate: "2026-11-25", generic: { columns: [], includeHeader: true, includeSummary: false, amountStyle: "BAHT_2DP", dateStyle: "ISO_CE", encoding: "UTF8_BOM" } } }), "OPTIONS"),
      profCompany: refusalOk(callBuild(B, { ...base, profile: { ...PROF_K, companyNameEn: null } }), "PROFILE"),
      profBank: refusalOk(callBuild(B, { ...base, profile: { ...PROF_K, debitBankCode: "006" } }), "PROFILE"),
      profKtbId: refusalOk(callBuild(B, { ...VEC.G3A.input, profile: { ...PROF_T, ktbCompanyId: null } }), "PROFILE"),
      profLong: refusalOk(callBuild(B, { ...base, profile: { ...PROF_K, companyNameEn: "X".repeat(51) } }), "PROFILE"),
      okOne: callBuild(B, { ...base, payees: pay1(1), run: { ...base.run, totalNetSatang: 1 } })?.ok === true,
    };
    ck("S2.10", r, "13 refusal vectors");
  }
  // S2.11 properties
  {
    const sets = propSets();
    const bad: string[] = [];
    let built = 0;
    for (const [ci, payees] of sets.entries()) {
      const total = payees.reduce((a: number, p: Any) => a + p.netSatang, 0);
      const fmts: [string, Any, Any][] = [
        ["KBANK_PCT", PROF_K, { format: "KBANK_PCT", effectiveDate: "2026-11-25" }],
        ["KTB_STD", PROF_T, { format: "KTB_IPAY", ktbMode: "STANDARD", effectiveDate: "2026-11-25" }],
        ["KTB_DIR", PROF_T, { format: "KTB_IPAY", ktbMode: "DIRECT", effectiveDate: "2026-11-25" }],
        ["CSV", null, { format: "CSV", effectiveDate: "2026-11-25", generic: { preset: "GENERIC" } }],
      ];
      for (const [fk, prof, opts] of fmts) {
        const input = { run: runOf(total), payees, profile: prof, options: opts, now: NOW1 };
        const before = canon(input);
        const o = callBuild(B, input);
        const o2 = callBuild(B, input);
        const tag = `#${ci}.${fk}`;
        if (canon(input) !== before) bad.push(`${tag} mutated`);
        const niSum = ((o?.notIncluded ?? []) as Any[]).reduce((a, x) => a + Number(x.netSatang), 0);
        if (o?.ok === false) {
          if (o.code !== "EMPTY" || niSum !== total) bad.push(`${tag} ${o.code}`);
          continue;
        }
        if (o?.ok !== true || !o.bytes) {
          bad.push(`${tag} no result`);
          continue;
        }
        built++;
        if (!eqBytes(o2?.bytes, Buffer.from(o.bytes))) bad.push(`${tag} nondeterministic`);
        if (o.totalSatang + niSum !== total) bad.push(`${tag} Σ`);
        if (o.itemCount + (o.notIncluded?.length ?? 0) !== payees.length) bad.push(`${tag} count`);
        const text = Buffer.from(o.bytes).toString("latin1");
        if (fk === "CSV") {
          const L = text.replace(/^\xef\xbb\xbf/, "").split("\r\n").slice(1, -1);
          const s = L.reduce((a, l) => a + Math.round(Number(l.split(",")[6]) * 100), 0);
          if (L.length !== o.itemCount || s !== o.totalSatang) bad.push(`${tag} csv Σ`);
          continue;
        }
        const L = text.split("\r\n");
        if (L.pop() !== "") bad.push(`${tag} no final CRLF`);
        if (fk === "KBANK_PCT") {
          const sum = L.slice(1).reduce((a, l) => a + Number(l.slice(32, 47)), 0);
          if (L[0].length !== 178 || !L.slice(1).every((l) => l.length === 487) || Number(L[0].slice(51, 66)) !== sum || Number(L[0].slice(154, 172)) !== L.length - 1 || sum !== o.totalSatang) bad.push(`${tag} pct`);
        } else {
          const sum = L.slice(1).reduce((a, l) => a + Number(l.slice(57, 74)), 0);
          if (!L.every((l) => l.length === 498) || Number(L[0].slice(19, 38)) !== sum || Number(L[0].slice(12, 19)) !== L.length - 1 || sum !== o.totalSatang) bad.push(`${tag} ktb`);
        }
      }
    }
    chk("S2.11", bad.length === 0 && built >= 80, "160 cases · ≥80 files built", `${built} built · ${bad.slice(0, 6).join(" ") || "ok"}${bad.length > 6 ? ` +${bad.length - 6}` : ""}`);
  }
  // S2.12 edges
  {
    const kp = (payees: Any[], extra: Any = {}) => callBuild(B, { run: runOf(payees.reduce((a, p) => a + p.netSatang, 0)), payees, profile: PROF_K, options: { format: "KBANK_PCT", effectiveDate: "2026-11-25", ...extra }, now: NOW1 });
    const one = (id: string, net: number, acct = "0123456789", name = "ONE") => ({ employeeId: id, name, code: null, bankName: "KBank", accountNo: acct, accountName: name, netSatang: net });
    const csvOf = (payees: Any[], style: string) => callBuild(B, { run: runOf(payees.reduce((a, p) => a + p.netSatang, 0)), payees, profile: null, options: { format: "CSV", effectiveDate: "2026-11-25", generic: { columns: [["amount", "A"]], includeHeader: false, includeSummary: false, amountStyle: style, dateStyle: "ISO_CE", encoding: "UTF8_BOM" } }, now: NOW1 });
    const csvText = (o: Any) => (o?.bytes ? Buffer.from(o.bytes).toString("utf8") : "∅");
    const p1 = kp([one("a", 1)]);
    const lim = kp([one("a", 300_000_000), one("b", 300_000_001, "0123456780")]);
    const past = kp([one("a", 100)], { effectiveDate: "2026-11-23" });
    const dup = kp([one("a", 100), one("b", 200)]);
    const ktbLong = callBuild(B, { run: runOf(500), payees: [{ employeeId: "k", name: "K", code: null, bankName: "SCB", accountNo: "1234567890", accountName: "N".repeat(101), netSatang: 500 }], profile: PROF_T, options: { format: "KTB_IPAY", effectiveDate: "2026-11-25" }, now: NOW1 });
    const ktbLine = ktbLong?.bytes ? Buffer.from(ktbLong.bytes).toString("latin1").split("\r\n")[1] ?? "" : "";
    const r = {
      pct1: !!p1?.bytes && Buffer.from(p1.bytes).toString("latin1").split("\r\n")[1]?.slice(32, 47) === "000000000000001",
      baht1: csvText(csvOf([one("a", 1)], "BAHT_2DP")) === "\ufeff0.01\r\n",
      satang1: csvText(csvOf([one("a", 1)], "SATANG")) === "\ufeff1\r\n",
      big: csvText(csvOf([one("a", 2_147_483_647)], "BAHT_2DP")) === "\ufeff21474836.47\r\n",
      limit: wOf(lim) === "b:OVER_LIMIT",
      past: wOf(past) === "-:EFFECTIVE_PAST",
      dup: wOf(dup) === "a:DUP_ACCOUNT,b:DUP_ACCOUNT",
      ktbCut: wOf(ktbLong) === "k:NAME_CUT" && ktbLine.slice(92, 192) === "N".repeat(100) && ktbLine.length === 498,
    };
    ck("S2.12", r, "edge vectors", `lim=${wOf(lim)} past=${wOf(past)} dup=${wOf(dup)} ktb=${wOf(ktbLong)}`);
  }
}

// ═════════════════════════ fix round 1 — pure (ORACLE-EDIT H3.5 fix r1: checks added per controller rulings F1–F4 · F7) ═════════════════════════
const tisDec = (b: Uint8Array) => Array.from(b, (x) => (x >= 0xa1 ? String.fromCharCode(x - 0xa0 + 0x0e00) : String.fromCharCode(x))).join("");
function runPureFix(B: Any): void {
  const kOne = (over: Any, opt: Any, prof: Any = PROF_K) => {
    const p = { employeeId: "x", name: "X", code: "C", bankName: opt.format === "KBANK_PCT" ? "KBank" : "SCB", accountNo: "0123456789", accountName: "ACC", netSatang: 100, ...over };
    return callBuild(B, { run: runOf(p.netSatang), payees: [p], profile: prof, options: opt, now: NOW1 });
  };
  const lensOf = (o: Any) => (o?.bytes ? tisDec(o.bytes).split("\r\n").slice(0, -1).map((l) => l.length).join("/") : `∅${o?.code}`);
  // S6.1
  {
    const ktb = (eff: string, era: string) => kOne({}, { format: "KTB_IPAY", effectiveDate: eff, ktbDateEra: era }, PROF_T);
    const pct = (eff: string) => kOne({}, { format: "KBANK_PCT", effectiveDate: eff });
    const r = {
      ktbBigBE: refusalOk(ktb("9999-12-31", "BE"), "OPTIONS"),
      ktbSmallCE: refusalOk(ktb("0999-01-01", "CE"), "OPTIONS"),
      ktb1999: refusalOk(ktb("1999-12-31", "CE"), "OPTIONS"),
      ktb2401: refusalOk(ktb("2401-01-01", "BE"), "OPTIONS"),
      pctBig: refusalOk(pct("9999-12-31"), "OPTIONS"),
      pctSmall: refusalOk(pct("0999-01-01"), "OPTIONS"),
      lo: lensOf(ktb("2000-01-01", "CE")) === "498/498" && lensOf(pct("2000-01-01")) === "178/487",
      hi: lensOf(ktb("2400-12-31", "BE")) === "498/498" && lensOf(pct("2400-12-31")) === "178/487",
      guard: typeof B?.fixedLinesOk === "function" && B.fixedLinesOk("KTB_IPAY", ["x".repeat(498), "x".repeat(498)]) && !B.fixedLinesOk("KTB_IPAY", ["x".repeat(498), "x".repeat(499)]) && !B.fixedLinesOk("KTB_IPAY", ["x".repeat(497), "x".repeat(498)]) && B.fixedLinesOk("KBANK_PCT", ["x".repeat(178), "x".repeat(487)]) && !B.fixedLinesOk("KBANK_PCT", ["x".repeat(178), "x".repeat(488)]),
    };
    ck("S6.1", r, "year range + length guard", `2000=${lensOf(ktb("2000-01-01", "CE"))} 2400BE=${lensOf(ktb("2400-12-31", "BE"))}`);
  }
  // S6.3
  {
    const big = kOne({ netSatang: 10 ** 15, name: "BIG ONE" }, { format: "KBANK_PCT", effectiveDate: "2026-11-25" });
    const ok15 = kOne({ netSatang: 10 ** 15 - 1 }, { format: "KBANK_PCT", effectiveDate: "2026-11-25" });
    const two = callBuild(B, {
      run: runOf(2 * 6e14),
      payees: [0, 1].map((i) => ({ employeeId: `t${i}`, name: `T${i}`, code: null, bankName: "KBank", accountNo: `012345678${i}`, accountName: `T${i}`, netSatang: 6e14 })),
      profile: PROF_K, options: { format: "KBANK_PCT", effectiveDate: "2026-11-25" }, now: NOW1,
    });
    const r = {
      item: refusalOk(big, "AMOUNT", ["BIG ONE"], ["x"]) && !big?.bytes,
      total: two?.ok === false && two.code === "AMOUNT" && two.text === String(T.amount).replace("{names}", String(T.amountTotal)) && !two.bytes,
      fits: lensOf(ok15) === "178/487",
    };
    ck("S6.3", r, "amount fits field", `${big?.code} ${short(big?.text, 50)} · ${two?.code} ${short(two?.text, 50)}`);
  }
  // S6.4
  {
    const K = "ก";
    const pctName = (nm: string) => {
      const o = kOne({ accountName: nm }, { format: "KBANK_PCT", effectiveDate: "2026-11-25" });
      return { field: o?.bytes ? tisDec(o.bytes).split("\r\n")[1]?.slice(79, 129) : "∅", w: wOf(o), len: lensOf(o) };
    };
    const ktbName = (nm: string) => {
      const o = kOne({ accountName: nm }, { format: "KTB_IPAY", effectiveDate: "2026-11-25" }, PROF_T);
      return { field: o?.bytes ? tisDec(o.bytes).split("\r\n")[1]?.slice(92, 192) : "∅", w: wOf(o), len: lensOf(o) };
    };
    const a = pctName(K.repeat(50) + "่");
    const b = pctName(K.repeat(49) + "เก");
    const c = pctName(K.repeat(48) + "กิ่ข");
    const d = pctName(K.repeat(51));
    const e = ktbName(K.repeat(99) + "ก้");
    const f = pctName("N".repeat(60));
    const r = {
      toneOrphan: a.field === K.repeat(49) + " " && a.w === "x:NAME_CUT" && a.len === "178/487",
      leadVowel: b.field === K.repeat(49) + " " && b.w === "x:NAME_CUT",
      twoMarks: c.field === K.repeat(48) + "  " && c.w === "x:NAME_CUT",
      plainThai: d.field === K.repeat(50) && d.w === "x:NAME_CUT",
      ktb: e.field === K.repeat(99) + " " && e.w === "x:NAME_CUT" && e.len === "498/498",
      ascii: f.field === "N".repeat(50) && f.w === "x:NAME_CUT",
    };
    ck("S6.4", r, "cut at cluster start", `a=${JSON.stringify(a.field?.slice(-3))} b=${JSON.stringify(b.field?.slice(-3))} c=${JSON.stringify(c.field?.slice(-3))} e=${JSON.stringify(e.field?.slice(-3))}`);
  }
  // S6.5
  {
    const spec = (encoding = "UTF8_BOM") => ({ columns: [["employeeCode", "c"], ["employeeName", "n"], ["payeeName", "p"], ["paymentRef", "r"], ["amount", "a"]], includeHeader: false, includeSummary: false, amountStyle: "SATANG", dateStyle: "ISO_CE", encoding });
    const g = (over: Any, fmt = "CSV", enc = "UTF8_BOM") => {
      const p = { employeeId: "x", name: "N", code: "C1", bankName: "SCB", accountNo: "0123456789", accountName: "OK", netSatang: 100, ...over };
      return callBuild(B, { run: runOf(100), payees: [p], profile: null, options: { format: fmt, effectiveDate: "2026-11-25", generic: spec(enc) }, now: NOW1 });
    };
    const trimmed = g({ name: "  สมชาย  ", code: " E9 " });
    const r = {
      wsFormula: refusalOk(g({ accountName: "  =1+1" }), "FORMULA", ["N"], ["x"]),
      ctlFormula: refusalOk(g({ paymentRef: " \n=1" }), "FORMULA", ["N"], ["x"]) && refusalOk(g({ paymentRef: " \u0007=1" }), "ENCODING", ["N"], ["x"]),
      tabRef: refusalOk(g({ paymentRef: "\tABC" }), "FORMULA", ["N"], ["x"]),
      crRef: refusalOk(g({ paymentRef: "\rABC" }), "FORMULA", ["N"], ["x"]),
      codeTab: refusalOk(g({ code: "\t=1+1" }), "FORMULA", ["N"], ["x"]),
      trim: trimmed?.ok === true && Buffer.from(trimmed.bytes).toString("utf8") === "﻿E9,สมชาย,OK,HR202611-0001,100\r\n",
      bidi: refusalOk(g({ accountName: "AB‮C" }), "ENCODING", ["N"], ["x"]) && refusalOk(g({ accountName: "AB⁦C" }), "ENCODING", ["N"], ["x"]),
      ctl: ["\u0000", "\u0007", "\u001b", "\u007f"].every((c) => refusalOk(g({ accountName: `A${c}B` }), "ENCODING", ["N"], ["x"])),
      xlsxBidi: refusalOk(g({ accountName: "AB⁩C" }, "XLSX"), "ENCODING", ["N"], ["x"]),
      crlfInside: g({ accountName: "A\r\nB" })?.ok === true,
    };
    ck("S6.5", r, "formula/control guard", `trim=${trimmed?.ok ? JSON.stringify(Buffer.from(trimmed.bytes).toString("utf8")) : trimmed?.code}`);
  }
  // S6.8
  {
    const th = { ...T, reasons: TX?.reasons, warnings: TX?.warnings } as Any;
    const en = TX?.en as Any;
    const keysOf = (o: Any) => srt([...Object.keys(o ?? {}).filter((k) => typeof o[k] === "string"), ...Object.keys(o?.reasons ?? {}).map((k) => `r.${k}`), ...Object.keys(o?.warnings ?? {}).map((k) => `w.${k}`)]);
    const flat = (o: Any): [string, string][] => [...Object.entries(o ?? {}).filter(([, v]) => typeof v === "string"), ...Object.entries(o?.reasons ?? {}).map(([k, v]) => [`r.${k}`, v]), ...Object.entries(o?.warnings ?? {}).map(([k, v]) => [`w.${k}`, v])] as [string, string][];
    const enMap = new Map(flat(en));
    const r = {
      fixture: !!en && canon(B?.BANK_TEXT_EN) === canon(en),
      keys: keysOf(en) === keysOf(th) && keysOf(B?.BANK_TEXT_EN) === keysOf(B?.BANK_TEXT),
      names: flat(th).every(([k, v]) => String(v).includes("{names}") === String(enMap.get(k) ?? "").includes("{names}")),
      noThai: flat(en).every(([, v]) => typeof v === "string" && v.trim() !== "" && !/[฀-๿]/.test(v)),
      pick: typeof B?.bankTextFor === "function" && B.bankTextFor("en") === B.BANK_TEXT_EN && B.bankTextFor("th") === B.BANK_TEXT && B.bankTextFor(undefined) === B.BANK_TEXT,
    };
    ck("S6.8", r, "en text set parity", `${keysOf(en).length} keys`);
  }
}

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
const CAPTURED: string[] = [];
const REAL_CONSOLE = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let capDepth = 0; // parallel calls share one capture (depth counter) — the real console is restored when the last call ends
async function callMod(Mo: Any, file: string, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, file)})`, value: undefined };
  const cap = (...a: unknown[]) => void CAPTURED.push(a.map((x) => (typeof x === "string" ? x : short(x, 400))).join(" "));
  if (capDepth++ === 0) Object.assign(console, { log: cap, info: cap, warn: cap, error: cap });
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : String(v?.reason ?? textOf(v) ?? short(v, 80)), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  } finally {
    if (--capDepth === 0) Object.assign(console, REAL_CONSOLE);
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 60)}"`);
const noOk = (r: RO) => r.value?.ok === false && r.value?.code === "NO" && r.value?.reason === T.no;
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const B = await loadOpt(F.build, "@/lib/modules/hr/bank-files/build");
const SV = await loadOpt(F.svc, "@/lib/modules/hr/bank-files/service");
const DL = await loadOpt(F.dl, "@/lib/modules/hr/bank-files/download-route"); // ORACLE-EDIT H3.5 fix r1 (F5) ◂
const DORM = (await import("@/lib/modules/dorm/import-parse")) as Any;
console.log(`[${SUITE}] build=${modState(B, F.build)} · service=${modState(SV, F.svc)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H3.5 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const S = (fn: string, ...a: unknown[]) => callMod(SV, F.svc, fn, a);
const NOW = new Date("2031-10-30T02:00:00Z"); // 09:00 Bangkok
const DAY = 86_400_000;
const MINE = ["HrBankFile", "HrBankExportPreset", "HrBankProfile"];
const ACCTS = ["0123456789", "0987654321", "1234567890", "5555555555", "1112223330", "4445556667", "1112223334", "2223334445", "6667778889", "9990001112"];
const hasAcct = (s: string) => ACCTS.some((a) => s.includes(a)) || s.includes("098-765-4321");

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.5 ไฟล์โอนเงิน");
  const T2 = await fx.newTenant("-other", "QC HR H3.5 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีมอื่น", T2)];
  const cA = { tenantId: TT, systemId: sA };
  const cB = { tenantId: TT, systemId: sB };
  const cO = { tenantId: T2, systemId: sO };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC35 ${t} ${tag}`, r, ua, p);
  const RP = { "hr.payroll.read": true, "hr.payroll.pay": true };
  const U = {
    owner: await mk("owner", "OWNER", [], {}),
    pay: await mk("pay", "STAFF", ["*"], RP),
    readOnly: await mk("readonly", "STAFF", ["*"], { "hr.payroll.read": true }),
    payOnly: await mk("payonly", "STAFF", ["*"], { "hr.payroll.pay": true }),
    branchPay: await mk("branchpay", "STAFF", [u1], RP),
    mgr: await mk("mgr", "MANAGER", [u1], {}),
    mgrAll: await mk("mgrall", "MANAGER", ["*"], {}),
    member: await mk("member", "STAFF", [], {}),
    self: await mk("self", "STAFF", [], {}),
    other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const emp = async (s: string, code: string, nm: string, bank: string | null, acct: string | null, accName: string | null, o: Record<string, unknown> = {}) => {
    const id = await fx.mkEmp(TT, s, `${nm} ${tag}`, { code, startDate: "2030-01-01", ...o } as Any);
    await P.hrEmployee.update({ where: { id }, data: { bankName: bank, bankAccountNo: acct, bankAccountName: accName } });
    return id;
  };
  const E = {
    a1: await emp(sA, "A01", "เอ หนึ่ง", "KBank", "0123456789", "A ONE"),
    a2: await emp(sA, "A02", "บี สอง", "ธนาคารกสิกรไทย", "098-765-4321", "นายบี สอง"),
    a3: await emp(sA, "A03", "ซี สาม", "SCB", "1234567890", "C THREE"),
    a4: await emp(sA, "A04", "ดี สี่", "KBank", null, null),
    a5: await emp(sA, "A05", "อี ห้า", "KBank", "5555555555", "E FIVE"),
    a6: await emp(sA, "A06", "เอฟ หก", "KBank", "1112223330", "F SIX", { linkedUserId: U.self.id }),
    a7: await emp(sA, "A07", "จี เจ็ด", "กรุงไทย", "4445556667", "G SEVEN"),
    b1: await emp(sB, "B01", "บี หนึ่ง", "SCB", "2223334445", "B ONE"),
    b2: await emp(sB, "B02", "บี สอง", "กรุงไทย", "6667778889", "B TWO"),
  };
  const nameOf = (id: string) => (Object.entries(E).find(([, v]) => v === id)?.[0] ?? id);
  const NET: Record<string, number> = { a1: 3_000_000, a2: 1_234_567, a3: 2_000_000, a4: 500_000, a5: 0, a6: 1_000_000, a7: 777_700 };
  const mkRun = async (c: Any, periodKey: string, payDay: string, status: string, items: [string, number][], o: Record<string, unknown> = {}) => {
    const total = items.reduce((a, [, n]) => a + n, 0);
    const run = await P.hrPayrollRun.create({
      data: { tenantId: c.tenantId, systemId: c.systemId, periodKey, payDate: new Date(`${payDay}T12:00:00+07:00`), status, totalGrossSatang: total, totalNetSatang: total, journalEntryId: status === "DRAFT" ? null : `qc-h35-jv-${tag}-${periodKey}`, ...o },
    });
    for (const [e, n] of items) await P.hrPayrollItem.create({ data: { tenantId: c.tenantId, systemId: c.systemId, runId: run.id, employeeId: e, grossSatang: n, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: n } });
    return run.id as string;
  };
  const all7 = Object.entries(NET).map(([k, n]) => [E[k as keyof typeof E], n] as [string, number]);
  const R = {
    r1: await mkRun(cA, "2031-10", "2031-10-31", "APPROVED", all7),
    r2: await mkRun(cA, "2031-11", "2031-11-30", "DRAFT", [[E.a1, 3_000_000]]),
    r3: await mkRun(cA, "2031-09", "2031-09-30", "REVERSED", [[E.a1, 3_000_000]]),
    r4: await mkRun(cA, "2031-08", "2031-08-31", "PAID", [[E.a1, 3_000_000]]),
    r5: await mkRun(cA, "2031-07", "2031-07-31", "APPROVED", [[E.a1, 3_000_000]], { totalNetSatang: 2_999_999 }),
    r6: await mkRun(cA, "2031-06", "2031-06-30", "APPROVED", [[E.a1, 3_000_000], [E.a3, 2_000_000]], { engineVersion: 2 }),
    r7: await mkRun(cA, "2031-05", "2031-05-31", "APPROVED", [[E.a1, 3_000_000], [E.a3, -100]]),
    rb: await mkRun(cB, "2031-10", "2031-10-31", "APPROVED", [[E.b1, 150_000], [E.b2, 250_000]]),
  };
  // S3.0 control
  {
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: TT }, include: { items: true } })) as Any[];
    const sums = runs.filter((r) => r.id !== R.r5).every((r) => r.items.reduce((a: number, i: Any) => a + i.netSatang, 0) === r.totalNetSatang);
    const acct = await P.appSystem.count({ where: { tenantId: TT, type: { in: ["ACCOUNT", "POS"] } } });
    ck("S3.0", { runs: runs.length === 8, sums, noAcct: acct === 0, r1: runs.find((r) => r.id === R.r1)?.totalNetSatang === 8_512_267 }, "fixture ok", `${runs.length} runs acct=${acct}`);
  }
  const counts = async () => ({
    files: Number((await fx.rawRows(`SELECT count(*)::int AS n FROM "HrBankFile" WHERE "tenantId" = $1`, TT))?.[0]?.n ?? -1),
    audit: await P.auditLog.count({ where: { tenantId: TT, action: { startsWith: "hr.bankfile." } } }),
    outbox: await P.outboxEvent.count({ where: { tenantId: TT } }),
    adj: await P.hrPayAdjustment.count({ where: { tenantId: TT } }),
  });
  const profA = { debitBankCode: "004", debitAccountNo: "1112223334", debitBranchCode: null, companyNameEn: "QC SHOP CO", ktbCompanyId: null, formatsEnabled: ["KBANK_PCT"], acknowledgeUntested: true };
  // S3.1 profile
  {
    const noAck = await S("saveBankProfile", cA, V.owner, { ...profA, acknowledgeUntested: false }, { now: NOW });
    const badIn = await S("saveBankProfile", cA, V.owner, { ...profA, debitAccountNo: "12345" }, { now: NOW });
    const nonOwner = await S("saveBankProfile", cA, V.pay, profA, { now: NOW });
    const mgrTry = await S("saveBankProfile", cA, V.mgrAll, profA, { now: NOW });
    const ok = await S("saveBankProfile", cA, V.owner, profA, { now: NOW });
    const okB = await S("saveBankProfile", cB, V.owner, { debitBankCode: "006", debitAccountNo: "9990001112", debitBranchCode: "0456", companyNameEn: "QC SHOP B", ktbCompanyId: "QCB01", formatsEnabled: ["KTB_IPAY"], acknowledgeUntested: true }, { now: NOW });
    const rOwner = await S("getBankProfile", cA, V.owner);
    const rPay = await S("getBankProfile", cA, V.pay);
    const rMem = await S("getBankProfile", cA, V.member);
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.bankfile.profile" } })) as Any[];
    const r = {
      noAck: noAck.value?.ok === false && noAck.text === T.ackUntested,
      badIn: badIn.value?.ok === false && badIn.text === T.profileInput,
      nonOwner: nonOwner.text === T.profileOwner && mgrTry.text === T.profileOwner,
      ok: ok.ok && okB.ok,
      ownerFull: rOwner.value?.profile?.debitAccountNo === "1112223334" && canon(rOwner.value?.profile?.formatsEnabled) === canon(["KBANK_PCT"]),
      payMasked: rPay.ok && !("debitAccountNo" in (rPay.value?.profile ?? { debitAccountNo: 1 })) && rPay.value?.profile?.debitAccountMasked === "•••3334" && !hasAcct(JSON.stringify(rPay.value)),
      memberNo: noOk(rMem),
      audit: aud.length === 2 && aud.every((a) => canon(Object.keys(a.after ?? {}).sort()) === canon(["formatsEnabled"]) && !hasAcct(JSON.stringify(a))),
    };
    ck("S3.1", r, "profile contract", `${shown(noAck)} ${shown(badIn)} ${shown(nonOwner)} ${shown(ok)} pay=${short(rPay.value, 80)} audit=${aud.length}`);
  }
  // S3.2 DB1
  const before = await counts();
  const runRow0 = canon(await P.hrPayrollRun.findUnique({ where: { id: R.r1 } }));
  const g1 = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "KBANK_PCT", options: {} }, { now: NOW });
  const pv1 = await S("previewBankFile", cA, V.owner, { runId: R.r1, format: "KBANK_PCT", options: {} }, { now: NOW });
  const DB1 = gold("hr-h3.5-db1-kbank-pct.txt");
  {
    const v = g1.value;
    const ni = ((v?.notIncluded ?? []) as Any[]).map((x) => `${nameOf(x.employeeId)}:${x.cause}:${x.netSatang}`).join(",");
    const r = {
      ok: g1.ok, bytes: eqBytes(v?.bytes, DB1), fileName: v?.fileName === "PCT311030090000.txt", ct: v?.contentType === "text/plain; charset=windows-874",
      count: v?.itemCount === 3, total: v?.totalSatang === 5_234_567, untested: v?.untested === true,
      ni: ni === "a3:NOT_THIS_BANK:2000000,a4:NO_ACCOUNT:500000,a5:NET_ZERO:0,a7:NOT_THIS_BANK:777700",
      niName: ((v?.notIncluded ?? []) as Any[]).every((x) => typeof x.name === "string" && x.name.endsWith(tag)),
      preview: pv1.ok && pv1.value?.itemCount === 3 && pv1.value?.totalSatang === 5_234_567 && pv1.value?.runNetSatang === 8_512_267 && (pv1.value?.notIncluded ?? []).length === 4,
    };
    ck("S3.2", r, "DB1 exact", `${shown(g1)} ${diffAt(v?.bytes, DB1)} ni=${ni}`);
    const sysN = await P.appSystem.count({ where: { tenantId: TT, type: { in: ["ACCOUNT", "POS"] } } });
    const jvN = P.accountJournalEntry ? await P.accountJournalEntry.count({ where: { tenantId: TT } }).catch(() => -1) : 0;
    chk("X8.1", g1.ok && r.bytes && sysN === 0 && jvN === 0, "ok without ACCOUNT/POS", `${shown(g1)} systems=${sysN} jv=${jvN}`);
  }
  const fileId1 = String(g1.value?.fileId ?? "∅");
  // S3.3 manifest
  {
    const m = (await fx.rawRows(`SELECT * FROM "HrBankFile" WHERE "id" = $1`, fileId1))?.[0] as Any;
    const after = await counts();
    const runRow1 = canon(await P.hrPayrollRun.findUnique({ where: { id: R.r1 } }));
    const r = {
      row: !!m, sha: m?.sha256 === sha256Hex(DB1), len: Number(m?.byteLength) === DB1.length, counts: Number(m?.itemCount) === 3 && Number(m?.totalSatang) === 5_234_567 && Number(m?.excludedCount) === 4,
      created: m && new Date(m.createdAt).toISOString() === NOW.toISOString(), expires: m && new Date(m.expiresAt).getTime() === NOW.getTime() + 7 * DAY,
      who: m?.createdById === U.owner.id && m?.runId === R.r1 && m?.systemId === sA && m?.format === "KBANK_PCT", noAcct: !!m && !hasAcct(JSON.stringify(m)),
      run: runRow0 === runRow1 && !JSON.parse(runRow1).bankFileKey, outbox: after.outbox === before.outbox, adj: after.adj === before.adj, files: after.files === before.files + 1,
    };
    ck("S3.3", r, "manifest · nothing else written", short(m && { ...m, optionsJson: undefined }, 160));
  }
  // S3.4 audit
  {
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.bankfile.generate" } })) as Any[];
    const all = (await P.auditLog.findMany({ where: { tenantId: TT } })) as Any[];
    const a = aud[0];
    const r = {
      one: aud.length === 1, target: a?.targetType === "HrPayrollRun" && a?.targetId === R.r1 && a?.actorId === U.owner.id,
      keys: srt(Object.keys(a?.after ?? {})) === AUDIT_KEYS, vals: canon(a?.after) === canon({ fileId: fileId1, format: "KBANK_PCT", itemCount: 3, totalSatang: 5_234_567, excludedCount: 4 }),
      noAcct: !all.some((x) => hasAcct(JSON.stringify(x))), console: !CAPTURED.some(hasAcct),
    };
    ck("S3.4", r, "audit exact · no account digits", short(a?.after, 120));
  }
  // S3.5 download
  {
    const d1 = await S("downloadBankFile", cA, V.owner, { fileId: fileId1 }, { now: new Date(NOW.getTime() + DAY) });
    const daud = await P.auditLog.count({ where: { tenantId: TT, action: "hr.bankfile.download" } });
    const dl = Number((await fx.rawRows(`SELECT "downloads" FROM "HrBankFile" WHERE "id" = $1`, fileId1))?.[0]?.downloads ?? -1);
    await P.hrEmployee.update({ where: { id: E.a1 }, data: { bankAccountNo: "0123456780" } });
    const d2 = await S("downloadBankFile", cA, V.owner, { fileId: fileId1 }, { now: new Date(NOW.getTime() + DAY) });
    await P.hrEmployee.update({ where: { id: E.a1 }, data: { bankAccountNo: "0123456789" } });
    const d3 = await S("downloadBankFile", cA, V.pay, { fileId: fileId1 }, { now: new Date(NOW.getTime() + 2 * DAY) });
    const d4 = await S("downloadBankFile", cA, V.owner, { fileId: fileId1 }, { now: new Date(NOW.getTime() + 7 * DAY + 60_000) });
    const r = {
      same: d1.ok && eqBytes(d1.value?.bytes, DB1) && d1.value?.fileName === "PCT311030090000.txt", counter: dl === 1 && daud === 1,
      changed: d2.value?.ok === false && d2.text === T.changed && !d2.value?.bytes, restored: d3.ok && eqBytes(d3.value?.bytes, DB1),
      expired: d4.value?.ok === false && d4.text === T.expired && !d4.value?.bytes,
    };
    ck("S3.5", r, "download contract", `${shown(d1)} ${shown(d2)} ${shown(d3)} ${shown(d4)} dl=${dl}`);
  }
  // S3.6 run states
  {
    const c0 = await counts();
    const gen = (runId: string) => S("generateBankFile", cA, V.owner, { runId, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const [x2, x3, x5, x7] = [await gen(R.r2), await gen(R.r3), await gen(R.r5), await gen(R.r7)];
    const c1 = await counts();
    const x4 = await gen(R.r4);
    const x6 = await gen(R.r6);
    const r = {
      draft: x2.text === T.status, reversed: x3.text === T.status, mismatch: x5.text === T.mismatch, negative: x7.text === T.negative, none: c1.files === c0.files && c1.audit === c0.audit,
      paid: x4.ok && x4.value?.itemCount === 1 && x4.value?.totalSatang === 3_000_000, v2: x6.ok && x6.value?.itemCount === 2 && x6.value?.totalSatang === 5_000_000,
    };
    ck("S3.6", r, "status gates", [x2, x3, x5, x7, x4, x6].map(shown).join(" "));
  }
  // S3.7 KTB
  {
    const off = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "KTB_IPAY", options: {} }, { now: NOW });
    await S("saveBankProfile", cA, V.owner, { ...profA, formatsEnabled: ["KBANK_PCT", "KTB_IPAY"] }, { now: NOW });
    const prof = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "KTB_IPAY", options: {} }, { now: NOW });
    await S("saveBankProfile", cA, V.owner, profA, { now: NOW });
    const kb = await S("generateBankFile", cB, V.owner, { runId: R.rb, format: "KTB_IPAY", options: {} }, { now: NOW });
    const DB2 = gold("hr-h3.5-db2-ktb-std.txt");
    const r = {
      off: off.text === T.formatOff, profile: prof.text === T.profile, ktb: kb.ok && eqBytes(kb.value?.bytes, DB2), name: kb.value?.fileName === "KTB_IPAY_203110_311030090000.txt",
      ni: canon(((kb.value?.notIncluded ?? []) as Any[]).map((x) => [nameOf(x.employeeId), x.cause, x.netSatang])) === canon([["b2", "SAME_BANK", 250000]]),
    };
    ck("S3.7", r, "KTB gates + DB2", `${shown(off)} ${shown(prof)} ${shown(kb)} ${diffAt(kb.value?.bytes, DB2)}`);
  }
  // S3.8 generic on r1
  {
    const g = await S("generateBankFile", cA, V.pay, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const text = g.value?.bytes ? Buffer.from(g.value.bytes).toString("utf8") : "";
    const L = text.replace(/^\ufeff/, "").split("\r\n");
    const head = L[0];
    const rows = L.slice(1, -1);
    const sum = rows.reduce((a, l) => a + Math.round(Number(l.split(",")[6]) * 100), 0);
    const r = {
      ok: g.ok, bom: text.startsWith("\ufeff"), head: head === (VEC.G6.rows[0] as string[]).join(","), rows: rows.length === 5, sum: sum === 8_012_267 && g.value?.totalSatang === 8_012_267,
      ni: srt(((g.value?.notIncluded ?? []) as Any[]).map((x) => `${nameOf(x.employeeId)}:${x.cause}`)) === "a4:NO_ACCOUNT,a5:NET_ZERO",
      eff: rows.every((l) => l.split(",")[7] === "2031-10-31"), ref: rows[0]?.split(",")[8] === "HR203110-0001",
    };
    ck("S3.8", r, "generic default", `${shown(g)} ${short(rows[0], 80)}`);
  }
  // S3.9 presets
  {
    const cols = [["accountNo", "เลขบัญชี"], ["amount", "ยอด"], ["const:01", "รหัส"]];
    const inp = { name: `ชุด ${tag}`, kind: "CSV", columns: cols, includeHeader: false, includeSummary: true, amountStyle: "SATANG", dateStyle: "DMY_BE", encoding: "UTF8_BOM" };
    const s1 = await S("saveBankPreset", cA, V.pay, inp);
    const dupN = await S("saveBankPreset", cA, V.owner, inp);
    const zero = await S("saveBankPreset", cA, V.owner, { ...inp, name: `ว่าง ${tag}`, columns: [] });
    const badF = await S("saveBankPreset", cA, V.owner, { ...inp, name: `ผิด ${tag}`, columns: [["nationalId", "x"]] });
    const lst = await S("listBankPresets", cA, V.owner);
    const pid = String(s1.value?.id ?? "∅");
    const g = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "CSV", presetId: pid }, { now: NOW });
    const t = g.value?.bytes ? Buffer.from(g.value.bytes).toString("utf8").replace(/^\ufeff/, "").split("\r\n") : [];
    const crossB = await S("generateBankFile", cB, V.owner, { runId: R.rb, format: "CSV", presetId: pid }, { now: NOW });
    const del = await S("deleteBankPreset", cA, V.owner, { id: pid });
    const lst2 = await S("listBankPresets", cA, V.owner);
    const aud = await P.auditLog.count({ where: { tenantId: TT, action: "hr.bankfile.preset" } });
    const r = {
      save: s1.ok, dup: dupN.text === T.presetName, zero: zero.text === T.presetColumns, badF: badF.text === T.presetColumns,
      list: ((lst.value?.items ?? []) as Any[]).some((p) => p.id === pid && p.name === inp.name), use: g.ok && t[0] === "0123456789,3000000,01" && t.at(-3) === "จำนวนรายการ,5" && t.at(-2) === "ยอดรวม,8012267" && t.at(-1) === "",
      cross: noOk(crossB), del: del.ok && !((lst2.value?.items ?? []) as Any[]).some((p) => p.id === pid), audit: aud === 2,
    };
    ck("S3.9", r, "preset CRUD", `${shown(s1)} ${shown(dupN)} ${shown(zero)} ${shown(badF)} ${shown(g)} ${short(t.slice(0, 2), 60)} ${short(t.slice(-3), 60)}`);
  }
  // S3.10 encoding refusal via service
  {
    const x = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "KBANK_PCT", options: { encoding: "ASCII" } }, { now: NOW });
    chk("S3.10", x.value?.ok === false && x.text === String(T.encoding).replace("{names}", `บี สอง ${tag}`), "names a2 display name", shown(x));
  }
  // S3.11 DTOs
  {
    const pv = pv1.value;
    const lf = await S("listBankFiles", cA, V.owner, { runId: R.r1 });
    const items = (lf.value?.items ?? []) as Any[];
    const forb = [...keysDeep(pv), ...keysDeep(items)].filter((k) => HR_FORBIDDEN_DTO_KEYS.includes(k) || /^(debit)?[Aa]ccountNo$|^bytes$/.test(k));
    const r = {
      preview: srt(Object.keys(pv ?? {})) === PREVIEW_KEYS, rows: ((pv?.rows ?? []) as Any[]).length === 3 && (pv.rows as Any[]).every((x) => srt(Object.keys(x)) === ROW_KEYS),
      masked: ((pv?.rows ?? []) as Any[]).map((x) => x.accountMasked).join(",") === "•••6789,•••4321,•••3330",
      ni: ((pv?.notIncluded ?? []) as Any[]).every((x) => srt(Object.keys(x)) === NI_KEYS), warn: ((pv?.warnings ?? []) as Any[]).every((x) => srt(Object.keys(x)) === WARN_KEYS),
      files: items.length >= 1 && items.every((x) => srt(Object.keys(x)) === FILE_KEYS), forbidden: forb.length === 0, digits: !hasAcct(JSON.stringify(pv ?? "∅")) && !hasAcct(JSON.stringify(items)),
    };
    ck("S3.11", r, "DTO keys exact", `${short(Object.keys(pv ?? {}), 80)} forb=${forb.join(",")}`);
  }
  // S4.1 matrix
  {
    const DENY = ["readOnly", "payOnly", "branchPay", "mgr", "mgrAll", "member", "self"] as const;
    const c0 = await counts();
    const ops = (v: Any, c: Any) => [
      S("previewBankFile", c, v, { runId: R.r1, format: "KBANK_PCT", options: {} }, { now: NOW }),
      S("generateBankFile", c, v, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW }),
      S("listBankFiles", c, v, { runId: R.r1 }),
      S("downloadBankFile", c, v, { fileId: fileId1 }, { now: NOW }),
      S("listBankPresets", c, v),
    ];
    const denied: string[] = [];
    const shapes = new Set<string>();
    for (const k of DENY) {
      const res = await Promise.all(ops(V[k], cA));
      res.forEach((x, i) => {
        if (!noOk(x)) denied.push(`${k}#${i}=${shown(x)}`);
        shapes.add(canon(x.value));
      });
    }
    // ORACLE-EDIT H3.5 (builder, 12 Nov — reason: ops #4 listBankPresets(cO, V.other) takes no id, so it asks the OTHER tenant's OWNER for the
    //   presets of the owner's OWN HR system — a legitimate success, never "other tenant ⇒ no". Kept ops #0–#3 on cO (they carry tenant A's run/file
    //   ids) and added all 5 ops with tenant A's ctx (cA) for V.other — the real "other tenant" case; strictly more refusals checked, none removed)
    const oth = [...(await Promise.all(ops(V.other, cO))).slice(0, 4), ...(await Promise.all(ops(V.other, cA)))];
    oth.forEach((x, i) => {
      if (!noOk(x)) denied.push(`other#${i}=${shown(x)}`);
      shapes.add(canon(x.value));
    });
    const c1 = await counts();
    const allowed = [...(await Promise.all(ops(V.owner, cA))), ...(await Promise.all(ops(V.pay, cA)))];
    const r = { denied: denied.length === 0, identical: shapes.size === 1, nothing: c1.files === c0.files && c1.audit === c0.audit, allowed: allowed.every((x) => x.ok) };
    ck("S4.1", r, "2 allowed · 8 refused identically", `${denied.slice(0, 4).join(" ")} shapes=${shapes.size} allowed=${allowed.map((x) => (x.ok ? "✓" : "✗")).join("")}`);
  }
  // S4.2 cross system/tenant
  {
    const a = await S("generateBankFile", cB, V.owner, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const b = await S("downloadBankFile", cB, V.owner, { fileId: fileId1 }, { now: NOW });
    const c = await S("listBankFiles", cB, V.owner, { runId: R.r1 });
    const d = await S("generateBankFile", { tenantId: T2, systemId: sA }, V.other, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const e = await S("previewBankFile", cO, V.other, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const all = [a, b, c, d, e];
    ck("S4.2", { refused: all.every(noOk), identical: new Set(all.map((x) => canon(x.value))).size === 1 }, "no (identical)", all.map(shown).join(" "));
  }
  // S5.1 race
  {
    const c0 = await counts();
    const res = await Promise.all(Array.from({ length: 6 }, () => S("generateBankFile", cA, V.owner, { runId: R.r4, format: "CSV", presetId: "GENERIC" }, { now: NOW })));
    const ids = res.map((x) => String(x.value?.fileId ?? ""));
    const shas = ((await fx.rawRows(`SELECT "sha256" FROM "HrBankFile" WHERE "id" = ANY($1)`, ids)) ?? []).map((x: Any) => x.sha256);
    const c1 = await counts();
    ck("S5.1", { ok: res.every((x) => x.ok), distinct: new Set(ids).size === 6, sha: shas.length === 6 && new Set(shas).size === 1, files: c1.files === c0.files + 6, audit: c1.audit === c0.audit + 6 }, "6 manifests one sha", res.map(shown).join(" "));
  }
  // S5.2 generate ∥ reverse (v2 run r6)
  {
    const nOf = async () => Number((await fx.rawRows(`SELECT count(*)::int AS n FROM "HrBankFile" WHERE "runId" = $1`, R.r6))?.[0]?.n ?? -1);
    const n0 = await nOf();
    const [g, rv] = await Promise.all([
      S("generateBankFile", cA, V.owner, { runId: R.r6, format: "CSV", presetId: "GENERIC" }, { now: NOW }),
      pay.reverseRun(cA, R.r6, "qc h3.5 race", { userId: U.owner.id, isOwner: true }).catch((e: unknown) => ({ ok: false, note: errText(e) })),
    ]);
    const st = (await P.hrPayrollRun.findUnique({ where: { id: R.r6 } }))?.status;
    const n1 = await nOf();
    const files = ((await fx.rawRows(`SELECT "id" FROM "HrBankFile" WHERE "runId" = $1`, R.r6)) ?? []) as Any[];
    const dls = await Promise.all(files.map((f) => S("downloadBankFile", cA, V.owner, { fileId: f.id }, { now: NOW })));
    const r = {
      reversed: rv?.ok === true && st === "REVERSED", consistent: n0 >= 1 && (g.ok ? n1 === n0 + 1 : g.text === T.status && n1 === n0), dlRefused: files.length >= 1 && dls.every((d) => d.value?.ok === false && d.text === T.status),
    };
    ck("S5.2", r, "consistent", `gen=${shown(g)} rv=${short(rv, 50)} files=${files.length} dl=${dls.map(shown).join(",")}`);
  }
  // ═════════ fix round 1 — DB (ORACLE-EDIT H3.5 fix r1: checks added per controller rulings F1 · F5 · F6 · F8) ═════════
  const dlCount = async (id: string) => Number((await fx.rawRows(`SELECT "downloads" FROM "HrBankFile" WHERE "id" = $1`, id))?.[0]?.downloads ?? -1);
  const dlAudit = async (id: string) => (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.bankfile.download" } })).filter((a: Any) => a.after?.fileId === id).length;
  // S6.2
  {
    await S("saveBankProfile", cB, V.owner, { debitBankCode: "006", debitAccountNo: "9990001112", debitBranchCode: "0456", companyNameEn: "QC SHOP B", ktbCompanyId: "QCB01", formatsEnabled: ["KTB_IPAY"], acknowledgeUntested: true }, { now: NOW });
    const c0 = await counts();
    const x = await S("generateBankFile", cB, V.owner, { runId: R.rb, format: "KTB_IPAY", options: { effectiveDate: "9999-12-31", ktbDateEra: "BE" } }, { now: NOW });
    const y = await S("generateBankFile", cB, V.owner, { runId: R.rb, format: "KTB_IPAY", options: { effectiveDate: "0999-01-01" } }, { now: NOW });
    const c1 = await counts();
    ck("S6.2", { refused: x.text === T.options && y.text === T.options && !x.value?.bytes, none: c1.files === c0.files && c1.audit === c0.audit }, "options · nothing saved", `${shown(x)} ${shown(y)}`);
  }
  // S6.6 route helper
  {
    const gen = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const fid = String(gen.value?.fileId ?? "∅");
    const get = async (h: Record<string, string>, fileId = fid, now = NOW, ctx: Any = cA, v: Any = V.owner) => {
      if (typeof DL?.bankFileGet !== "function") return null;
      try {
        return (await DL.bankFileGet(new Request("http://qc.invalid/x", { headers: h }), ctx, v, fileId, { now })) as Response;
      } catch (e) {
        console.log(`bankFileGet threw ${errText(e)}`);
        return null;
      }
    };
    const n0 = await dlCount(fid);
    const a0 = await dlAudit(fid);
    const rsc = await get({ rsc: "1" });
    const pre = await get({ "next-router-prefetch": "1" });
    // ORACLE-EDIT (builder H3.9 fix r1 F2a · controller 13 Nov): HEAD (Next answers HEAD with GET) ⇒ 405 before any read — no count, no audit ◂
    let head: Response | null = null;
    try {
      head = typeof DL?.bankFileGet === "function" ? ((await DL.bankFileGet(new Request("http://qc.invalid/x", { method: "HEAD" }), cA, V.owner, fid, { now: NOW })) as Response) : null;
    } catch {
      head = null;
    }
    const n1 = await dlCount(fid);
    const a1 = await dlAudit(fid);
    const plain = await get({});
    const body = plain ? Buffer.from(await plain.arrayBuffer()) : Buffer.alloc(0);
    const n2 = await dlCount(fid);
    const a2 = await dlAudit(fid);
    const no = await get({}, "nosuchfile0000");
    const exp = await get({}, fid, new Date(NOW.getTime() + 8 * DAY));
    await P.hrEmployee.update({ where: { id: E.a1 }, data: { bankAccountNo: "0123456780" } });
    const chg = await get({});
    await P.hrEmployee.update({ where: { id: E.a1 }, data: { bankAccountNo: "0123456789" } });
    const r6files = ((await fx.rawRows(`SELECT "id" FROM "HrBankFile" WHERE "runId" = $1`, R.r6)) ?? []) as Any[];
    const st = r6files[0] ? await get({}, String(r6files[0].id)) : null;
    const other = await get({}, fid, NOW, cO, V.other);
    const refusal = async (x: Response | null, status: number, text: string) =>
      !!x && x.status === status && (await x.text()) === text && !x.headers.get("content-disposition") && x.headers.get("cache-control") === "no-store" && /nosniff/.test(x.headers.get("x-content-type-options") ?? "");
    const n3 = await dlCount(fid);
    const r = {
      gen: gen.ok,
      rsc: rsc?.status === 204 && pre?.status === 204 && head?.status === 405 && n1 === n0 && a1 === a0, // ORACLE-EDIT H3.9 fix r1 F2a: + HEAD 405 ◂
      plain: plain?.status === 200 && body.length > 0 && eqBytes(body, Buffer.from(gen.value?.bytes ?? [])) && n2 === n0 + 1 && a2 === a0 + 1,
      headers: !!plain && /^attachment; filename="[A-Za-z0-9_.-]+"$/.test(plain.headers.get("content-disposition") ?? "") && plain.headers.get("cache-control") === "no-store" && /nosniff/.test(plain.headers.get("x-content-type-options") ?? ""),
      sanitise: typeof DL?.safeFileName === "function" && DL.safeFileName('a"b;c\r\n.csv') === "a_b_c__.csv",
      r404: await refusal(no, 404, T.no), r410: await refusal(exp, 410, T.expired), r409: await refusal(chg, 409, T.changed), status: await refusal(st, 409, T.status), other: await refusal(other, 404, T.no),
      noExtra: n3 === n2,
    };
    ck("S6.6", r, "route helper contract", `rsc=${rsc?.status} pre=${pre?.status} plain=${plain?.status} n=${n0}/${n1}/${n2}/${n3} a=${a0}/${a1}/${a2} no=${no?.status} exp=${exp?.status} chg=${chg?.status} st=${st?.status}`);
  }
  // S6.7 format OFF ⇒ no download
  const kFile = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "KBANK_PCT", options: {} }, { now: NOW });
  const kId = String(kFile.value?.fileId ?? "∅");
  {
    const csv = await S("generateBankFile", cA, V.owner, { runId: R.r1, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    await S("saveBankProfile", cA, V.owner, { ...profA, formatsEnabled: [] }, { now: NOW });
    const off = await S("downloadBankFile", cA, V.owner, { fileId: kId }, { now: NOW });
    const csvOff = await S("downloadBankFile", cA, V.owner, { fileId: String(csv.value?.fileId ?? "∅") }, { now: NOW });
    await S("saveBankProfile", cA, V.owner, profA, { now: NOW });
    const on = await S("downloadBankFile", cA, V.owner, { fileId: kId }, { now: NOW });
    ck("S6.7", { made: kFile.ok && csv.ok, off: off.value?.ok === false && off.text === T.formatOff && !off.value?.bytes, csv: csvOff.ok, on: on.ok && eqBytes(on.value?.bytes, Buffer.from(kFile.value?.bytes ?? [])) }, "formatOff while off", `${shown(off)} ${shown(csvOff)} ${shown(on)}`);
  }
  // S6.9 empty code sorts last · shop debit account changed
  {
    const b3 = await emp(sB, "", "เค ว่าง", "SCB", "3334445556", "K EMPTY");
    const b4 = await emp(sB, "L-TMP", "แอล นัล", "SCB", "3334445557", "L NULL");
    await P.hrEmployee.update({ where: { id: b4 }, data: { code: null } });
    const b5 = await emp(sB, "B00", "เอ็ม ศูนย์", "SCB", "3334445558", "M ZERO");
    const rc = await mkRun(cB, "2031-09", "2031-09-30", "APPROVED", [[b3, 100], [b4, 200], [b5, 300]]);
    const pv = await S("previewBankFile", cB, V.owner, { runId: rc, format: "CSV", presetId: "GENERIC" }, { now: NOW });
    const order = ((pv.value?.rows ?? []) as Any[]).map((x) => x.employeeId);
    await S("saveBankProfile", cA, V.owner, { ...profA, debitAccountNo: "2223334441" }, { now: NOW });
    const chg = await S("downloadBankFile", cA, V.owner, { fileId: kId }, { now: NOW });
    await S("saveBankProfile", cA, V.owner, profA, { now: NOW });
    const back = await S("downloadBankFile", cA, V.owner, { fileId: kId }, { now: NOW });
    ck("S6.9", { order: canon(order) === canon([b5, b3, b4]), changed: chg.value?.ok === false && chg.text === T.changed && !chg.value?.bytes, restored: back.ok }, "sort + debit change", `order=${order.map((x) => (x === b3 ? "b3" : x === b4 ? "b4" : x === b5 ? "b5" : x)).join(",")} ${shown(chg)} ${shown(back)}`);
  }
  // S6.10 download ∥ reverse ×4
  {
    const runs = [await mkRun(cA, "2031-01", "2031-01-31", "APPROVED", [[E.a1, 3_000_000]]), await mkRun(cA, "2031-02", "2031-02-28", "APPROVED", [[E.a1, 3_000_000]]), await mkRun(cA, "2031-03", "2031-03-31", "APPROVED", [[E.a1, 3_000_000]]), await mkRun(cA, "2031-04", "2031-04-30", "APPROVED", [[E.a1, 3_000_000]])];
    const files = await Promise.all(runs.map((runId) => S("generateBankFile", cA, V.owner, { runId, format: "CSV", presetId: "GENERIC" }, { now: NOW })));
    const ids = files.map((f) => String(f.value?.fileId ?? "∅"));
    const res = await Promise.all(runs.map((runId, i) => Promise.all([
      S("downloadBankFile", cA, V.owner, { fileId: ids[i] }, { now: NOW }),
      pay.reverseRun(cA, runId, "qc h3.5 fix race", { userId: U.owner.id, isOwner: true }).catch((e: unknown) => ({ ok: false, note: errText(e) })),
    ])));
    const after = await Promise.all(ids.map((fileId) => S("downloadBankFile", cA, V.owner, { fileId }, { now: NOW })));
    const sts = await Promise.all(runs.map(async (id) => (await P.hrPayrollRun.findUnique({ where: { id } }))?.status));
    const per = await Promise.all(ids.map(async (id) => ({ n: await dlCount(id), a: await dlAudit(id) })));
    const r = {
      made: files.every((f) => f.ok),
      reversed: res.every(([, rv]) => (rv as Any)?.ok === true) && sts.every((x) => x === "REVERSED"),
      consistent: res.every(([d], i) => (d.ok ? eqBytes(d.value?.bytes, Buffer.from(files[i]!.value?.bytes ?? [])) && per[i]!.n === 1 && per[i]!.a === 1 : d.text === T.status && per[i]!.n === 0 && per[i]!.a === 0)),
      later: after.every((d) => d.value?.ok === false && d.text === T.status),
    };
    ck("S6.10", r, "consistent ×4", res.map(([d]) => shown(d)).join(" ") + ` · ${per.map((x) => `${x.n}/${x.a}`).join(",")}`);
  }
  // S6.11 page data for viewers without the right
  {
    const DENY = ["readOnly", "payOnly", "branchPay", "mgr", "mgrAll", "member", "self"] as const;
    const bad: string[] = [];
    for (const k of DENY) {
      const can = typeof SV?.canUseBankFiles === "function" ? await SV.canUseBankFiles(cA, V[k]) : true;
      const [runsR, prof, pres] = [await S("listBankRuns", cA, V[k]), await S("getBankProfile", cA, V[k]), await S("listBankPresets", cA, V[k])];
      if (can !== false || ![runsR, prof, pres].every(noOk)) bad.push(k);
    }
    const okOwner = (await SV?.canUseBankFiles?.(cA, V.owner)) === true && (await SV?.canUseBankFiles?.(cA, V.pay)) === true;
    const ui = stripComments(rd(F.ui));
    const guards = (ui.match(/if\s*\(!\(await canUseBankFiles\(ctx, viewer\)\)\)\s*return null;/g) ?? []).length;
    ck("S6.11", { deny: bad.length === 0, allow: okOwner, ui: guards >= 2 }, "nothing for non-holders", `${bad.join(",") || "ok"} guards=${guards}`);
  }
}
function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  runPure(B, DORM);
  runPureFix(B); // ORACLE-EDIT H3.5 fix r1 ◂
  const fz = await fitnessNoEnv();
  chk("X12.1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const exists = async (t: string) => !!(await fx.rawRows(`SELECT to_regclass($1)::text AS r`, `"${t}"`))?.[0]?.r;
  for (const tid of fx.tenants) for (const t of MINE) if (await exists(t)) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      if (!(await exists(t))) continue; // table absent (before migration) = nothing left
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (!r || Number(r[0]?.n) !== 0) left.push(`${t}=${r?.[0]?.n ?? "?"}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
