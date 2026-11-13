// QC — HR V2 · H3.6 government filings: ภ.ง.ด.1 / ภ.ง.ด.1ก (RD Format 2.0 [V]) · สปส.1-10 (SSO Format135 layout [V], bytes [U]) ·
//      50 ทวิ PDF per employee (content [V], PDF/e-mail [U]) · brief ledger/hr-briefs/hr-brief-H3.6.md (DRAFT · Q1–Q14 defaults) + notes wo-notes/hr-H3.6-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Golden bytes = fixtures written field by field from the layouts (ledger/wo-notes/hr-H3.6-derive.py) — never by the code under test.
//    G1 / G3 equal the research's own vectors (C3 V1 with checksum-valid IDs / C3 V2 byte for byte); RD's sample files round-trip byte for byte.
// 🔴 Depends on H3.4 (stored v2 item fields). On a base without H3.4 the S7.* checks fail by design (n/a → fail, declared); the DB fixture
//    inserts v2-shaped rows itself (columns exist since H1.3), so nothing here needs H3.4's services.
// Tenants qc-hr-h36-<stamp> · runs dated 2031 (BE 2574) · opts.now injected · SKIP while hr/filings/build.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H36_BASE") (merge-base HEAD origin/session/hr) · no "newest migration" assertion
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.6.mts
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process"; // ORACLE-EDIT (builder H3.9 merge round) ◂
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, canon, sha, keysDeep, jsonOf, loadOpt, modState,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, commitInBase, pathInBase, changedVsBase, diffHunks, fileAt, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, fitnessNoEnv, importsOf, tagOf, HR_FORBIDDEN_DTO_KEYS, msgParity, testidsOf,
} from "./qc-hr-lib.mjs";
import { T, TX, gold, runPure, eqBytes, firstDiff, bufOf, pdfPagesText, thNorm, digitsOf, fillText } from "./qc-hr-h3.6-lib.mjs";

const SUITE = "qc-hr-h3.6";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h36-";
const H = "src/lib/modules/hr/";
const FD = `${H}filings/`;
const F = {
  build: `${FD}build.ts`, svc: `${FD}service.ts`, acts: `${FD}actions.ts`, ui: `${FD}ui.tsx`, pdf: `${FD}cert-pdf.tsx`, dl: `${FD}download-route.ts`, figures: `${FD}figures.ts`,
  pure: ["build", "rd", "sso", "figures", "cert", "texts"].map((n) => `${FD}${n}.ts`),
  routes: ["src/app/app/sys/[id]/hr/payroll/filing/[fileId]/route.ts", "src/app/app/sys/[id]/hr/payroll/tax-cert/[certId]/route.ts", "src/app/app/me/hr/tax-cert/[certId]/route.ts"],
  mig: "prisma/migrations/20270108000000_hr_filings/migration.sql", schema: "prisma/schema/payroll.prisma", hrSchema: "prisma/schema/hr.prisma",
  scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts", payPage: "src/app/app/sys/[id]/hr/payroll/page.tsx", setPage: "src/app/app/sys/[id]/hr/settings/page.tsx",
  mePay: "src/app/app/me/hr/pay/page.tsx", th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
  payroll: `${H}payroll.ts`,
};
const MODELS = ["HrFilingProfile", "HrFilingPerson", "HrFilingFile", "HrTaxCertificate"];
const FROZEN = [
  PAYROLL_RULES_FILE, `${H}payroll.ts`, `${H}payroll-actions.ts`, `${H}payroll-ui.tsx`, `${H}payroll-rules-v2.ts`, `${H}payroll-digest.ts`, `${H}law.ts`, `${H}privacy.ts`,
  `${H}privacy-shared.ts`, `${H}service.ts`, `${H}self.ts`, `${H}scope.ts`, `${H}bank-files`, "src/lib/outbox-consumers.ts", "src/lib/core/rbac.ts",
  "scripts/seed-hr-qc.mts", "scripts/fitness-hr.mts", "scripts/qc-hr-lib.mts", "scripts/qc-hr-h1.2.mts", "scripts/qc-hr-h1.3.mts", "scripts/qc-hr-h3.5.mts",
  "scripts/qc-hf-hr-privacy.mts", "src/lib/modules/approval", "src/lib/modules/account",
];
const TESTIDS = ["hr-filing-pnd1", "hr-filing-pnd1a", "hr-filing-sso-*", "hr-filing-period", "hr-filing-tile", "hr-filing-excluded", "hr-filing-warn", "hr-filing-untested", "hr-filing-generate",
  "hr-filing-files", "hr-filing-dl-*", "hr-taxcert-list", "hr-taxcert-issue-*", "hr-taxcert-bulk", "hr-taxcert-dl-*", "hr-taxcert-void-*", "hr-taxcert-pdfnote", "hr-filing-person-*",
  "hr-filing-person-save", "hr-filing-profile", "hr-filing-profile-save", "hr-mytaxcert", "hr-mytaxcert-dl-*"];
const K = {
  preview: srt(["ok", "kind", "period", "lineCount", "totalSatang", "taxSatang", "rows", "notIncluded", "warnings", "untested"]),
  row: srt(["seq", "employeeId", "name", "pinMasked", "payDate", "amountSatang", "taxSatang"]),
  ni: srt(["employeeId", "name", "cause", "fields", "amountSatang", "taxSatang"]),
  warn: srt(["employeeId", "name", "warning", "fields"]),
  file: srt(["id", "kind", "period", "fileName", "lineCount", "totalSatang", "taxSatang", "excludedCount", "createdAt", "expiresAt", "createdByName", "downloads"]),
  cert: srt(["id", "employeeId", "name", "taxYear", "kind", "docNo", "formSeq", "issuedAt", "voided", "downloads", "stale"]),
  mine: srt(["id", "taxYear", "kind", "docNo", "issuedAt"]),
  audGen: srt(["fileId", "kind", "period", "lineCount", "totalSatang", "taxSatang", "excludedCount"]),
};

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] migration 20270108000000_hr_filings: 4 CREATE TABLE + CHECKs + partial unique live certificate + UNIQUE (systemId, docNo) · additive only
S1.2|R1|C|R|[static] payroll.prisma 4 models · HrEmployee/HrPayrollRun/HrPayrollItem blocks unchanged vs base · scope.ts sys() ×4 · hr-qc-env ×4
S1.3|R2|C|R|[static] pure layer filings/{build,rd,sso,figures,cert,texts}.ts: imports ⊆ ./ · ../bank-files/encode · account/totals · account/doc-numbering · no db/clock/random/fetch
S1.4|R11|C|R|[static] engine reuse: service calls reserveSeq + formatDocNo from account/doc-numbering · no AccountDocSequence/lastNo SQL or own counter under hr/** · periodKey "HR50:"
S1.5|R3 F2|C|R|[static] no recompute: hr/filings/** exists and imports no payroll-rules*/payroll-run-rules/law/ot-rules · no ssoContribution/ssoV2/whtYtdV2/monthlyWhtSatang/computeRunItemV2/computeItem · no ytdJson/lawRowIds/hrLawTable/filingJson token
S1.6|frozen|C|G|[static] [control] payroll-rules sha · frozen files/dirs unchanged vs base (incl. bank-files, account, self, law)
S1.7|§5|M|R|[static] marked hunks "HR H3.6" in payroll.prisma · core/scope.ts · hr-qc-env.mts · payroll page · settings page · me/hr/pay page (every hunk marked)
S1.8|R15|M|R|[static] UI testids (notes §8) · inventory rows wo H3.6 · hr.filing.* th = en · untestedSso/wageU/pdfNote rendered as expressions
S1.9|R14|C|R|[static] 3 routes: GET → filingFileGet / taxCertGet / myTaxCertGet · helper uses bank-files isRouterFetch · attachment · no-store · nosniff · no prisma/nationalId in routes
S1.10|R15 R13|C|R|[static] client boundary: ui.tsx exists · no "use client" file under filings imports service/build/cert/db or names nationalId/contentJson
S1.11|R9 R12|C|R|[static] service imports bankGateOf · actions "use server" · 7 audit action names · no uploadFile/filingJson write
S2.0|fix|C|G|[pure] [control] goldens self-consistent (22/26 fields, totals, 135 chars, research V2 header verbatim, Σ monthly goldens = 1ก golden per PIN, DB goldens)
S2.1|R7|C|R|[pure] FILING_TEXT / FILING_TEXT_EN / FIELD_LABEL = texts fixture byte-exact · filingTextFor(locale)
S2.2|R4|C|R|[pure] thaiIdOk: 12 vectors (checksum · length · non-digits · formatted · empty · null)
S2.3|R3|C|R|[pure] itemFigures F1–F10: v2 stored fields · v1 base + add · broken/negative/string/unknown engine ⇒ ok:false
S2.4|R5|C|R|[pure] G1 ภ.ง.ด.1 byte-exact (research V1) + file name + counts + totals
S2.5|R4 R5|C|R|[pure] G2 ภ.ง.ด.1ก byte-exact (cert holder first · 3112 date · full address · "-" title · 12/3 ⇒ 12-3 + SLASH_DASH) · G2X slashMode EXCLUDE ⇒ named :char · G2W warnings · "/" in a name ⇒ INCOMPLETE
S2.6|R5|C|R|[pure] monthly Oct/Nov(DASH)/Nov(EXCLUDE)/Dec of the G2 data byte-exact + reports (property ground truth)
S2.7|R5|C|R|[pure] RD sample files: parseRdFile → emitRdFile byte-identical (final CRLF present / absent) · codes 5..1 / 1,1,1,2,3 · totals
S2.8|R5|M|R|[pure] options: formType 01 + seqNo 2 (file name, header 14) · formFlag 2 (TRANS_AMT = TOT_TAX, flag 2)
S2.9|R7|C|R|[pure] ภ.ง.ด. refusals R1–R11: code · fields · fixed text
S2.10|R6|C|R|[pure] G3 สปส.1-10 TIS-620 = research V2 byte for byte · options {} ⇒ same bytes (defaults)
S2.11|R6|C|R|[pure] G3U UTF-8 · G3L LF byte-exact · content types
S2.12|R6|C|R|[pure] G3A ACTUAL / G3B CLAMPED byte-exact · NAME_CUT · ssoPrefix · NOT_INSURED · TIS char ⇒ INCOMPLETE firstName:char (UTF8 ⇒ included)
S2.13|R7|C|R|[pure] SSO refusals S1–S10: code · fields · fixed text
S2.14|R4 R5|C|R|[pure] properties ×40 sets: Σ 12 monthly files = 1ก per PIN · totals = Σ lines · deterministic · input not mutated
S2.15|R11|C|R|[pure] taxCertContent C1–C4 exact (payee name/address rules · bahtText) · taxCertDocNo via formatDocNo
S2.16|R11|C|R|[pure] renderTaxCertPdf(C1): %PDF · 2 pages (ฉบับที่ 1/2) · numbers + Thai content on both · no other ID · same text twice
S3.0|fix|C|G|[db] [control] fixture: 6 employees · runs R1 v1 PAID · R2 v2 APPROVED · R3 v2 PAID · R4 REVERSED · R5 DRAFT · system B broken v2 · Σ items = totals · no ACCOUNT system in tenant A
S3.1|R1 R9|C|R|[db] profile: owner saves/reads · non-owner payroll holder profileOwner · bad taxId ⇒ person/profile fields · audit {op}
S3.2|R1|C|R|[db] person: gate holder saves title/first/last/ssoPrefix/address parts · read back · bad ssoPrefix ⇒ person text · audit {employeeId} · HrEmployee untouched
S3.3|R4 R5|C|R|[db] DB1 ภ.ง.ด.1 2031-02 via generateFiling byte-exact · e6 ZERO_INCOME · NOT_PAID · preview = same counts
S3.4|R4 R5|C|R|[db] DB2 ภ.ง.ด.1ก 2031 byte-exact (after e2 LEAVER cert) · e3 INCOMPLETE · V1_RUN · Σ monthly (Jan/Feb/Mar previews) = annual per employee
S3.5|R6|C|R|[db] DB3 SSO R2 defaults byte-exact (TIS620 · CLAMPED · 15/03/2574) · e4 ssoPrefix · e6 NOT_INSURED · DB3A ACTUAL option bytes
S3.6|R10 R12|C|R|[db] manifest (sha · bytes · counts · createdAt = now · expiresAt +7 d · options without IDs) · audit generate keys exact · no payroll/outbox write
S3.7|R10|C|R|[db] download: same bytes + downloads 1 + audit · person edited ⇒ changed · restored ⇒ ok · R2 reversed ⇒ PND changed / SSO status · past expiry ⇒ expired
S3.8|R3 R4|C|R|[db] statuses: DRAFT/REVERSED never in files · SSO on DRAFT ⇒ status · system B broken v2 ⇒ RUN_DATA text naming 2031-02 · no manifest on refusal
S3.9|R11|C|R|[db] LEAVER e2 ⇒ HR50-2031-0001 formSeq 1 (figures frozen) · e1 LEAVER ⇒ certNotLeft · e2 again ⇒ certExists · audit issue keys · counter row (HR system, WHT_CERT, HR50:2031)
S3.10|R11|C|R|[db] bulk 2031: issued e1/e4/e5 = 0002/0003/0004 · skipped e2 ALREADY · e3 INCOMPLETE [nationalId] · e6 NO_INCOME · formSeq = 1ก lines
S3.11|R11|C|R|[db] frozen content: employee name/ID edited after issue ⇒ downloaded PDF still shows issued data · contentSha matches · tampered content ⇒ certChanged
S3.12|R11|C|R|[db] void: owner only (certVoidOwner) · reason 1–200 · voided ⇒ download voided · reissue e4 ⇒ 0005 (no reuse) formSeq 4 · 1ก warns CERT_SEQ for e5
S3.13|R11|C|R|[db] tenant with an ACCOUNT book: first certificate HR50-2031-0001 · no AccountDocument WHT_CERT · no AccountDocSequence row under the book
S3.14|R9|C|R|[db] self-service: own live certificates only · own PDF ok + audit by SELF · other employee's certId / voided / unlinked user ⇒ no (identical bytes)
S3.16|R4|C|R|[db] v2 run not finalized (H3.4 stepsJson.finalized ≠ true — posting in progress) is no filing source: 1ก excludes it + NOT_FINAL naming 2031-06 · SSO ⇒ notFinal (guard: stepsJson column absent ⇒ n/a fail)
S3.15|R13|C|R|[db] DTO keys exact (preview · row · notIncluded · warning · file · certificate · mine) · IDs only as •••last4 · no forbidden key · no contentJson
S4.1|R9|C|R|[db] 10 viewers × 8 operations: owner + payroll(read+pay all branches) ok · read-only · pay-only · branch-limited · managers · member · self · other tenant ⇒ no · nothing written
S4.2|X2|C|R|[db] cross system/tenant: system B ctx with file/cert of A · other tenant ctx ⇒ no (identical bytes)
S4.3|R12|C|R|[db] privacy (after files + certificates were produced): no national/tax ID digits in audit · outbox · console · manifest optionsJson · download file names · route paths
S5.1|X6|C|R|[db] 4 parallel issues for one employee ⇒ 1 certificate + 3 certExists · numbers contiguous
S5.2|X6|C|R|[db] 6 parallel issues for 6 employees ⇒ 6 distinct numbers 1..6 · counter lastNo 6
S6.1|R14|C|R|[db] route helpers: rsc / prefetch ⇒ 204 untouched · plain ⇒ 200 attachment no-store nosniff · refusal 404/409/410 fixed text, no bytes · self helper
S7.1|ruling 6|C|R|[static] H3.4 merged: payroll.ts writes snapshot whtIncomeSatang · whtOneOffSatang · ssoWageSatang for engineVersion 2 (n/a on a base without H3.4 ⇒ fail, by design)
S7.2|R3|C|R|[static] filings/figures.ts reads exactly those snapshot keys + baseSalarySatang/ssoEligible (v1) and the item columns — no other snapshot key
S8.1|debt H3.5|C|R|[pure] ORACLE-EDIT (H3.6 builder, controller order): a payee/person name that is blank after cleaning (only combining marks/spaces) is refused or listed, never written — KBANK_PCT + CSV ⇒ ENCODING naming the payee · ภ.ง.ด.1 + สปส.1-10 ⇒ INCOMPLETE firstName
S8.2|debt H3.5|C|R|[pure] ORACLE-EDIT (H3.6 builder, controller order): full-width ＝ ＋ － ＠ at the start of a CSV/XLSX cell count as formula starters (formulaLike + CSV/XLSX build ⇒ FORMULA) · ASCII rules unchanged
S2.17|fix r1 F1|C|R|[pure] ORACLE-EDIT (H3.6 fix r1): FORM_FLAG label ↔ value ↔ bytes — RD Format 2.0 ช่อง 22 "1=ยื่นด้วยสื่อฯ 2=ยื่นอินเตอร์เน็ต" [V]: messages formFlag1 = สื่อ / formFlag2 = อินเทอร์เน็ต (th+en) · ui option 1/2 · header 22 + TRANS_AMT · default (no flag anywhere) = 2 · service/schema default 2
S2.18|fix r1 F2|C|R|[pure] ORACLE-EDIT (H3.6 fix r1): exclusion per employee per file — items 100,000 + 0 in one month ⇒ 1 line, not in notIncluded · 0 + 0 ⇒ one ZERO_INCOME · incomplete with 2 items ⇒ one INCOMPLETE (sums)
S2.19|fix r1 F5|C|R|[pure] ORACLE-EDIT (H3.6 fix r1): U+2028/U+2029 refused/listed like CR/LF — PND firstName/houseNo :char · SSO firstName :char (bank CSV/XLSX cell ⇒ ENCODING is in S8.1 key ls)
S3.17|fix r1 F4 F6 F7|C|R|[db] ORACLE-EDIT (H3.6 fix r1): ANNUAL before 1 Jan of the next year (BKK) ⇒ certTooEarly (single + bulk) · LEAVER with a future end date ⇒ certNotLeft · PND of a period whose only run is unfinalized ⇒ EMPTY with notFinal + period · bulk stopped mid-run by a profile change ⇒ ok with issued + stopped PROFILE, no wasted number
S6.2|fix r1 F9|C|R|[db] ORACLE-EDIT (H3.6 fix r1): HEAD to the 3 helpers ⇒ 405, no build/audit/download count · routes export HEAD and refuse non-GET first
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (4 new tables + AccountDocSequence rows of the QC tenants)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.6-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.6-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.build))) skipReasons.push(`${F.build} absent (H3.6 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// base = merge-base with origin/session/hr when it already holds H3.5 (bank-files/service.ts); else the brief's base 5d7bcf0c4 (session/hr merges not pushed yet)
// ORACLE-EDIT (builder H3.9 merge round · controller 13 Nov): base-aware — the local integration branch session/hr can hold merges not pushed to origin yet
//   (postmerge pushes later); when merge-base(HEAD, session/hr) is a descendant of the origin-derived base it is the newer base and is used (an env override wins) ◂
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const MB0 = baseRef("QC_H36_BASE");
const MB = !process.env.QC_H36_BASE && MB0 && LOCAL_MB && LOCAL_MB !== MB0 && commitInBase(MB0, LOCAL_MB) ? LOCAL_MB : MB0;
const BASE = MB && pathInBase("src/lib/modules/hr/bank-files/service.ts", MB) ? MB : "5d7bcf0c4";
const IN_BASE = pathInBase(F.svc, BASE);
const listDir = (d: string): string[] => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).map((n) => `${d}${n}`) : []);
const markedOk = (file: string) => {
  const hs = diffHunks(BASE, file);
  if (!hs) return false;
  const mine = hs.filter((h) => h.added.some((l) => /HR H3\.6/.test(l)));
  return mine.length > 0 && hs.every((h) => h.added.concat(h.removed).some((l) => /HR H\d|H\d\.\d/.test(l)));
};
const modelBlock = (src: string | null, name: string) => {
  if (!src) return "";
  const i = src.search(new RegExp(`^model ${name} \\{`, "m"));
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}", i) + 2);
};
const filingSrc = () => listDir(FD).filter((p) => /\.(ts|tsx)$/.test(p));

// ═════════════════════════ static ═════════════════════════
function runStatic(): void {
  {
    const m = rd(F.mig);
    const r = {
      exists: !!m,
      tables: MODELS.every((t) => new RegExp(`CREATE TABLE "${t}"`).test(m)),
      checks: (m.match(/\bCHECK\b/g) ?? []).length >= 12,
      live: /CREATE UNIQUE INDEX[^;]*"HrTaxCertificate"[^;]*\("systemId",\s*"employeeId",\s*"taxYear"\)[^;]*WHERE[^;]*"voidedAt" IS NULL/i.test(m),
      docNo: /UNIQUE[^;]*"HrTaxCertificate"[^;]*\("systemId",\s*"docNo"\)/i.test(m) || /CREATE UNIQUE INDEX[^;]*ON "HrTaxCertificate"\("systemId", "docNo"\)/.test(m),
      restrict: (m.match(/REFERENCES "HrEmployee"\("id"\) ON DELETE RESTRICT/g) ?? []).length >= 2,
      additive: !/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b|\bRENAME\b|ALTER\s+COLUMN|ALTER TABLE "(HrEmployee|HrPayrollRun|HrPayrollItem)" (ADD COLUMN|DROP)/i.test(m),
    };
    ck("S1.1", r, "4 tables · CHECKs · uniques · additive");
  }
  {
    const cur = rd(F.schema);
    const base = fileAt(BASE, F.schema);
    const hrBase = fileAt(BASE, F.hrSchema);
    const scope = rd(F.scope);
    const env = rd(F.env);
    ck("S1.2", {
      models: MODELS.every((m) => new RegExp(`^model ${m} \\{`, "m").test(cur)),
      runSame: !!base && modelBlock(cur, "HrPayrollRun") === modelBlock(base, "HrPayrollRun") && modelBlock(cur, "HrPayrollItem") === modelBlock(base, "HrPayrollItem"),
      // ORACLE-EDIT (H3.6 builder, 13 Nov): the strip left each back-relation line's own "\n" behind, so any added relation line made the block differ ⇒ strip the line WITH its newline
      // ORACLE-EDIT (builder H3.9 merge round · controller 13 Nov): base-aware — when the base already holds H3.6 its back-relation lines are in the base block too ⇒ strip them on both sides ◂
      // ORACLE-EDIT (H3.8 merge round · controller 13 Nov · S1.2): base-diff part n/a once H3.6 is in the base (IN_BASE) — later tickets add back-relations (H3.8 HrSalaryCertificate[]) ◂
      empSame: IN_BASE || (!!hrBase && modelBlock(rd(F.hrSchema), "HrEmployee").replace(/^[ \t]*\w+\s+(HrFilingPerson|HrTaxCertificate)\S*.*\n/gm, "") === modelBlock(hrBase, "HrEmployee").replace(/^[ \t]*\w+\s+(HrFilingPerson|HrTaxCertificate)\S*.*\n/gm, "")),
      scope: MODELS.every((m) => new RegExp(`\\b${m}:\\s*sys\\(\\)`).test(scope)),
      env: MODELS.every((m) => new RegExp(`model:\\s*"${m}"`).test(env)),
    }, "models · frozen blocks · scope · env");
  }
  {
    const bad: string[] = [];
    const ok = (s: string) => s.startsWith("./") || s === "../bank-files/encode" || s === "@/lib/modules/account/totals" || s === "@/lib/modules/account/doc-numbering";
    for (const f of F.pure) {
      const s = rd(f);
      if (!s) {
        bad.push(`∅${f.slice(FD.length)}`);
        continue;
      }
      const imps = importsOf(s).filter((i) => !ok(i.spec));
      if (imps.length) bad.push(`${f.slice(FD.length)} imports ${imps.map((i) => i.spec).join(",")}`);
      if (/\bDate\.now\(|new Date\(\s*\)|Math\.random|\bprisma\b|tenantDb|\bfetch\(|process\.env|"use server"|"use client"|\breserveSeq\b/.test(stripComments(s))) bad.push(`${f.slice(FD.length)} impure token`);
    }
    chk("S1.3", bad.length === 0, "6 pure files", bad.join(" · ") || "ok");
  }
  {
    const s = stripComments(rd(F.svc));
    const imp = importsOf(rd(F.svc)).find((i) => i.spec === "@/lib/modules/account/doc-numbering");
    const hrFiles = [...listDirDeep(H)].filter((p) => /\.(ts|tsx)$/.test(p));
    const counters = hrFiles.filter((f) => /AccountDocSequence|accountDocSequence|"lastNo"|\blastNo\b/.test(stripComments(rd(f))));
    ck("S1.4", { imported: !!imp, reserve: /\breserveSeq\s*\(/.test(s), format: /\bformatDocNo\s*\(/.test(stripComments(rd(`${FD}cert.ts`))) || /\bformatDocNo\s*\(/.test(s), ns: /["'`]HR50:/.test(s), noOwn: counters.length === 0 }, "one engine", counters.join(","));
  }
  {
    const files = filingSrc();
    const bad: string[] = [];
    for (const f of files) {
      const s = rd(f);
      const imps = importsOf(s).filter((i) => /payroll-rules|payroll-run-rules|\/law$|\.\/law$|\.\.\/law$|ot-rules/.test(i.spec));
      if (imps.length) bad.push(`${f.slice(FD.length)}→${imps.map((i) => i.spec).join(",")}`);
      if (/\b(ssoContribution|ssoV2|whtYtdV2|monthlyWhtSatang|computeRunItemV2|computeItem|ytdJson|lawRowIds|hrLawTable|HrLawTable|filingJson)\b/.test(stripComments(s))) bad.push(`${f.slice(FD.length)} token`);
    }
    chk("S1.5", files.length >= 6 && bad.length === 0, "filings present · stored figures only", `${files.length} files ${bad.join(" · ")}`);
  }
  {
    const shaOk = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
    // ORACLE-EDIT (H3.6 builder, 13 Nov — controller order: close two H3.5 debts in bank-files/** as marked "HR H3.6" hunks + checks S8.1/S8.2):
    //   bank-files may differ from the base only in files whose every hunk carries "HR H3.6" in an added line · everything else in FROZEN stays byte-unchanged
    const bankDir = `${H}bank-files`;
    //   + (fix r1 F8) ONLY the frozen oracle edits listed in wo-notes/hr-H3.6.md: file → check ids; every hunk must carry "ORACLE-EDIT (H3.6" + one listed id
    const ORACLE_EDITS: Record<string, string[]> = { "scripts/qc-hr-h3.5.mts": ["S1.2"] };
    // ORACLE-EDIT (builder H3.9 merge round · controller 13 Nov): base-aware — once H3.6 is in the base (IN_BASE), the remaining diff belongs to later tickets:
    //   their hunks are accepted when marked with their own ticket ("HR H<n>.<n>" / "ORACLE-EDIT … H<n>.<n>"); an unmarked hunk still fails ◂
    const laterMarked = (h: { added: string[] }, re: RegExp) => IN_BASE && h.added.some((l) => re.test(l));
    const oracleEdited = (f: string) =>
      (!!ORACLE_EDITS[f] || IN_BASE) &&
      (diffHunks(BASE, f) ?? [{ added: [], removed: [] }]).every((h) => h.added.some((l) => /ORACLE-EDIT \(H3\.6/.test(l) && (ORACLE_EDITS[f] ?? []).some((id) => l.includes(id))) || laterMarked(h, /ORACLE-EDIT[^\n]*H\d+\.\d+/));
    const d0 = changedVsBase(BASE, FROZEN.filter((f) => f !== bankDir));
    const left = d0.startsWith("changed: ") ? d0.slice(9).split(",").filter((f) => !oracleEdited(f)) : [];
    const d = d0.startsWith("changed: ") ? (left.length ? `changed: ${left.join(",")}` : "unchanged") : d0;
    const bankChanged = changedVsBase(BASE, [bankDir]);
    const bankFiles = bankChanged.startsWith("changed: ") ? bankChanged.slice(9).split(",") : [];
    const bankUnmarked = bankFiles.filter((f) => !(diffHunks(BASE, f) ?? [{ added: [], removed: [] }]).every((h) => h.added.some((l) => /HR H3\.6/.test(l)) || laterMarked(h, /HR H\d+\.\d+/)));
    ck("S1.6", { shaOk, frozen: d === "unchanged", bank: bankChanged === "unchanged" || (bankChanged.startsWith("changed: ") && bankUnmarked.length === 0) }, "unchanged (bank-files: HR H3.6 hunks only)", `${d} · bank ${bankChanged}${bankUnmarked.length ? ` unmarked ${bankUnmarked.join(",")}` : ""}`);
  }
  {
    const r = IN_BASE ? { inBase: true } : { schema: markedOk(F.schema), scope: markedOk(F.scope), env: markedOk(F.env), payPage: markedOk(F.payPage), setPage: markedOk(F.setPage), mePay: markedOk(F.mePay) };
    ck("S1.7", r, "every hunk marked", IN_BASE ? "n/a · H3.6 in base" : "");
  }
  {
    const ui = rd(F.ui);
    // ORACLE-EDIT (H3.6 builder, 13 Nov): testidsOf needs ≥1 char after the prefix, so the bare id "hr-mytaxcert" could never be found with prefix "hr-mytaxcert" ⇒ scan "hr-my" too
    const ids = new Set([...testidsOf(ui, "hr-filing-"), ...testidsOf(ui, "hr-taxcert-"), ...testidsOf(ui, "hr-mytaxcert"), ...testidsOf(ui, "hr-my"), ...testidsOf(rd(F.setPage), "hr-filing-"), ...testidsOf(rd(F.mePay), "hr-mytaxcert"), ...testidsOf(rd(F.mePay), "hr-my")]);
    const th = jsonOf(F.th)?.hr?.filing ?? {};
    const en = jsonOf(F.en)?.hr?.filing ?? {};
    const mp = msgParity(th, en, ["title"]);
    const invRows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => /^hr-(filing|taxcert|mytaxcert)/.test(String(r.testid ?? "")));
    const u = stripComments(ui);
    ck("S1.8", {
      testids: TESTIDS.every((t) => ids.has(t)),
      inv: invRows.length >= TESTIDS.length && invRows.every((r) => r.wo === "H3.6" && r.oracle === "qc-hr-h3.6"),
      msg: Object.values(mp).every(Boolean),
      texts: /\.untestedSso\s*\}/.test(u) && /\.wageU\s*\}/.test(u) && /\.pdfNote\s*\}/.test(u),
    }, "ids · inventory · messages · notes", `missing: ${TESTIDS.filter((t) => !ids.has(t)).join(",") || "-"} · inv ${invRows.length}`);
  }
  {
    const h0 = stripComments(rd(F.dl));
    const rs = F.routes.map((p) => stripComments(rd(p)));
    const all = `${rs.join("\n")}\n${h0}`;
    ck("S1.9", {
      exists: !!h0 && rs.every(Boolean),
      get: rs.every((s) => /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(s)),
      helpers: /filingFileGet\s*\(/.test(rs[0]) && /taxCertGet\s*\(/.test(rs[1]) && /myTaxCertGet\s*\(/.test(rs[2]),
      svc: /downloadFiling\s*\(/.test(h0) && /downloadTaxCertificate\s*\(/.test(h0) && /downloadMyTaxCertificate\s*\(/.test(h0),
      router: importsOf(rd(F.dl)).some((i) => /bank-files\/download-route$/.test(i.spec)) && /isRouterFetch\s*\(/.test(h0),
      attach: /attachment/.test(all) && /Content-Disposition/i.test(all) && /no-store/.test(all) && /nosniff/i.test(all),
      noRaw: !/\bprisma\b|tenantDb|nationalId|contentJson/.test(all),
    }, "routes contract");
  }
  {
    const clients = filingSrc().filter((f) => /^\s*["']use client["']/m.test(rd(f)));
    const bad = clients.filter((f) => {
      const s = rd(f);
      return importsOf(s).some((i) => /service|build|cert|core\/db|\.\/(rd|sso|figures)$/.test(i.spec)) || /\b(nationalId|contentJson|taxId)\b/.test(stripComments(s));
    });
    ck("S1.10", { ui: existsSync(join(ROOT, F.ui)), clean: bad.length === 0 }, "ui · clean client files", bad.join(","));
  }
  {
    const s = stripComments(rd(F.svc));
    ck("S1.11", {
      svc: !!s,
      gate: importsOf(rd(F.svc)).some((i) => /bank-files\/service$/.test(i.spec)) && /\bbankGateOf\s*\(/.test(s),
      audit: ["hr.filing.generate", "hr.filing.download", "hr.filing.profile", "hr.filing.person", "hr.taxcert.issue", "hr.taxcert.download", "hr.taxcert.void"].every((x) => s.includes(`"${x}"`)),
      actions: /^\s*["']use server["']/m.test(rd(F.acts)),
      noStore: !/uploadFile|filingJson|bankFileKey/.test(s),
    }, "gate · audit names · actions");
  }
  // S7 — H3.4 dependency (declared n/a → fail on a base without H3.4)
  {
    const p = stripComments(rd(F.payroll));
    const has34 = existsSync(join(ROOT, `${H}payroll-run-rules.ts`));
    const keys = ["whtIncomeSatang", "whtOneOffSatang", "ssoWageSatang"];
    const ok = has34 && keys.every((k) => new RegExp(`\\b${k}:\\s*r\\.${k}\\b`).test(p));
    chk("S7.1", ok, "H3.4 snapshot keys written", has34 ? keys.filter((k) => !new RegExp(`\\b${k}:\\s*r\\.${k}\\b`).test(p)).join(",") || "ok" : "n/a — H3.4 not in this tree (payroll-run-rules.ts absent) ⇒ fail by design");
  }
  {
    const s = stripComments(rd(F.figures));
    const read = new Set([...s.matchAll(/\b(?:snap|snapshot|s)\s*(?:\??\.)\s*(\w+)|\[\s*["'](\w+)["']\s*\]/g)].map((m) => String(m[1] ?? m[2] ?? "")).filter(Boolean));
    const want = ["whtIncomeSatang", "whtOneOffSatang", "ssoWageSatang", "baseSalarySatang", "ssoEligible"];
    const extra = [...read].filter((k) => /Satang$|Eligible$|Json$/.test(k) && !want.includes(k) && !["whtSatang", "addSatang", "ssoBaseSatang", "ssoEmployeeSatang", "ssoEmployerSatang", "snapshotJson"].includes(k));
    chk("S7.2", !!s && want.every((k) => s.includes(k)) && extra.length === 0, "stored keys only", s ? `extra: ${extra.join(",") || "-"}` : "∅ figures.ts");
  }
}
function listDirDeep(d: string, out: string[] = []): string[] {
  const abs = join(ROOT, d);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs, { withFileTypes: true })) {
    const p = `${d}${n.name}`;
    if (n.isDirectory()) listDirDeep(`${p}/`, out);
    else out.push(p);
  }
  return out;
}

// ═════════════════════════ db ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
const CAPTURED: string[] = [];
const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let depth = 0;
async function callMod(Mo: Any, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, fn)})`, value: undefined };
  const cap = (...a: unknown[]) => void CAPTURED.push(a.map((x) => (typeof x === "string" ? x : short(x, 400))).join(" "));
  if (depth++ === 0) Object.assign(console, { log: cap, info: cap, warn: cap, error: cap });
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : String(v?.reason ?? textOf(v) ?? short(v, 80)), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  } finally {
    if (--depth === 0) Object.assign(console, REAL);
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 70)}"`);
const noOk = (r: RO) => r.value?.ok === false && r.value?.code === "NO" && r.value?.reason === T.no;
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const B = await loadOpt(F.build, "@/lib/modules/hr/filings/build");
const SV = await loadOpt(F.svc, "@/lib/modules/hr/filings/service");
const PDFM = await loadOpt(F.pdf, "@/lib/modules/hr/filings/cert-pdf");
const DL = await loadOpt(F.dl, "@/lib/modules/hr/filings/download-route");
console.log(`[${SUITE}] build=${modState(B, F.build)} · service=${modState(SV, F.svc)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H3.6 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const S = (fn: string, ...a: unknown[]) => callMod(SV, fn, a);
const D = (fn: string, ...a: unknown[]) => callMod(DL, fn, a);
const DAY = 86_400_000;
const MINE = ["HrTaxCertificate", "HrFilingFile", "HrFilingPerson", "HrFilingProfile"];
const IDS = ["1102000123454", "3100600999991", "1500100123451", "3900100123453", "1700100123459", "0105555000013", "0105555000021", "1200100123453"];
const leaks = (s: string) => IDS.filter((x) => s.includes(x));
const at = (iso: string) => ({ now: new Date(iso) });
const NOW_FEB = at("2031-03-05T03:00:00Z");

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H3.6 แบบยื่น");
  const T2 = await fx.newTenant("-other", "QC HR H3.6 ร้านอื่น");
  const TB = await fx.newTenant("-book", "QC HR H3.6 มีสมุดบัญชี");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const sys = async (n: string, t = TT, type = "HR") => (await sysSvc.createSystem(t, type, `${n} ${tag}`)).id as string;
  const [sA, sB, sC, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีม C"), await sys("ทีมอื่น", T2)];
  const sBook = await sys("บัญชี", TB, "ACCOUNT");
  const sBH = await sys("HR มีบัญชี", TB);
  const cA = { tenantId: TT, systemId: sA };
  const cB = { tenantId: TT, systemId: sB };
  const cC = { tenantId: TT, systemId: sC };
  const cO = { tenantId: T2, systemId: sO };
  const cBH = { tenantId: TB, systemId: sBH };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC36 ${t} ${tag}`, r, ua, p);
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
  const bookOwner = await mk("bookowner", "OWNER", [], {}, TB);
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const actorOf = (w: Any) => ({ tenantId: w.tenantId, userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
  const emp = async (c: Any, code: string, nm: string, nid: string | null, o: Record<string, unknown> = {}) => {
    const id = await fx.mkEmp(c.tenantId, c.systemId, `${nm} ${tag}`, { code, startDate: "2030-01-01", ...(o.linkedUserId ? { linkedUserId: o.linkedUserId as string } : {}) });
    await P.hrEmployee.update({ where: { id }, data: { nationalId: nid, ...ADDR, ...(o.endDate ? { endDate: new Date(`${o.endDate}T00:00:00Z`) } : {}) } });
    return id;
  };
  const E = {
    e1: await emp(cA, "A01", "เอกชัย", "1102000123454"),
    e2: await emp(cA, "A02", "บุษบา", "3100600999991", { endDate: "2031-03-31" }),
    e3: await emp(cA, "A03", "ชัยวัฒน์", null),
    e4: await emp(cA, "A04", "ดำรง", "1500100123451"),
    e5: await emp(cA, "A05", "ห้าวหาญ", "3900100123453", { linkedUserId: U.self.id }),
    e6: await emp(cA, "A06", "หกฉาก", "1700100123459"),
    b1: await emp(cB, "B01", "บีหนึ่ง", "1200100123453"),
  };
  const PERSON: Record<string, Any> = {
    e1: { title: "นาย", firstName: "เอกชัย", lastName: "หนึ่งดี", houseNo: "99", street: "พญาไท" },
    e2: { title: "นางสาว", firstName: "บุษบา", lastName: "สองใจ" },
    e3: { title: "นาย", firstName: "ชัยวัฒน์", lastName: "สามมิตร" },
    e4: { title: "ด.ช.", firstName: "ดำรง", lastName: "สี่ทิศ" },
    e5: { title: "นาง", firstName: "ห้าวหาญ", lastName: "ใจกล้า" },
    e6: { title: "นาย", firstName: "หกฉาก", lastName: "หกสี" },
  };
  // runs (rows inserted directly — figures are stored data, H3.6 only reads them)
  const v1snap = (base: number, add: number, elig: boolean) => ({ baseSalarySatang: base, addSatang: add, deductSatang: 0, adjustments: [], ssoEligible: elig, deductions: { spouse: false, children: 0 }, computedAt: "2031-01-25T00:00:00.000Z" });
  const v2snap = (inc: number, one: number, wage: number) => ({ engineVersion: 2, payType: "MONTHLY", baseSalarySatang: inc, normalDayMin: 480, lines: [], flags: [], carry: [], receivable: [], availableSatang: 0, whtIncomeSatang: inc, whtOneOffSatang: one, ssoWageSatang: wage, workDays: [], holidayWork: {} });
  const HAS_STEPS = !!(await fx.rawRows(`SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'HrPayrollRun' AND column_name = 'stepsJson'`))?.length;
  type It = { e: string; wht: number; add?: number; ssoBase: number; ee: number; snap: Any; gross: number };
  const mkRun = async (c: Any, periodKey: string, payDay: string, status: string, ev: number, items: It[], final = ev >= 2 && (status === "APPROVED" || status === "PAID")) => {
    const tot = (f: (i: It) => number) => items.reduce((a, i) => a + f(i), 0);
    const run = await P.hrPayrollRun.create({
      data: {
        tenantId: c.tenantId, systemId: c.systemId, periodKey, payDate: new Date(`${payDay}T12:00:00+07:00`), status, engineVersion: ev,
        totalGrossSatang: tot((i) => i.gross), totalSsoEmployeeSatang: tot((i) => i.ee), totalSsoEmployerSatang: tot((i) => i.ee), totalWhtSatang: tot((i) => i.wht),
        totalNetSatang: tot((i) => i.gross - i.ee - i.wht), totalAddSatang: tot((i) => i.add ?? 0), journalEntryId: status === "DRAFT" ? null : `qc-h36-jv-${tag}-${periodKey}-${c.systemId.slice(-4)}`,
      },
    });
    for (const i of items)
      await P.hrPayrollItem.create({
        data: { tenantId: c.tenantId, systemId: c.systemId, runId: run.id, employeeId: i.e, grossSatang: i.gross, ssoBaseSatang: i.ssoBase, ssoEmployeeSatang: i.ee, ssoEmployerSatang: i.ee, whtSatang: i.wht, netSatang: i.gross - i.ee - i.wht, addSatang: i.add ?? 0, snapshotJson: i.snap },
      });
    // H3.4 finalized flag (stepsJson exists only once H3.4 is merged) — raw SQL so this file compiles on either client
    if (final && HAS_STEPS) await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "stepsJson" = '{"finalized":true}'::jsonb WHERE "id" = $1`, run.id);
    return run.id as string;
  };
  const R = {
    r1: await mkRun(cA, "2031-01", "2031-01-30", "PAID", 1, [
      { e: E.e1, wht: 50_000, ssoBase: 1_750_000, ee: 87_500, snap: v1snap(3_000_000, 0, true), gross: 3_000_000 },
      { e: E.e2, wht: 0, add: 100_000, ssoBase: 1_750_000, ee: 87_500, snap: v1snap(2_000_000, 100_000, true), gross: 2_100_000 },
      { e: E.e3, wht: 0, ssoBase: 1_500_000, ee: 75_000, snap: v1snap(1_500_000, 0, true), gross: 1_500_000 },
      { e: E.e5, wht: 0, ssoBase: 0, ee: 0, snap: v1snap(1_000_000, 0, false), gross: 1_000_000 },
    ]),
    r2: await mkRun(cA, "2031-02", "2031-02-27", "APPROVED", 2, [
      { e: E.e1, wht: 75_000, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(3_500_000, 25_000, 3_000_000), gross: 3_500_000 },
      { e: E.e2, wht: 0, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(2_000_000, 0, 2_000_000), gross: 2_000_000 },
      { e: E.e4, wht: 0, ssoBase: 1_200_000, ee: 60_000, snap: v2snap(1_200_000, 0, 1_200_000), gross: 1_200_000 },
      { e: E.e6, wht: 0, ssoBase: 0, ee: 0, snap: v2snap(0, 0, 0), gross: 0 },
    ]),
    r3: await mkRun(cA, "2031-03", "2031-03-31", "PAID", 2, [
      { e: E.e1, wht: 50_000, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(3_000_000, 0, 3_000_000), gross: 3_000_000 },
      { e: E.e2, wht: 0, ssoBase: 1_000_000, ee: 50_000, snap: v2snap(1_000_000, 0, 1_000_000), gross: 1_000_000 },
    ]),
    r4: await mkRun(cA, "2031-04", "2031-04-30", "REVERSED", 2, [{ e: E.e1, wht: 50_000, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(3_000_000, 0, 3_000_000), gross: 3_000_000 }]),
    r5: await mkRun(cA, "2031-05", "2031-05-29", "DRAFT", 2, [{ e: E.e1, wht: 50_000, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(3_000_000, 0, 3_000_000), gross: 3_000_000 }]),
    r6: await mkRun(cA, "2031-06", "2031-06-30", "APPROVED", 2, [{ e: E.e1, wht: 50_000, ssoBase: 1_750_000, ee: 87_500, snap: v2snap(3_000_000, 0, 3_000_000), gross: 3_000_000 }], false),
    rb: await mkRun(cB, "2031-02", "2031-02-27", "APPROVED", 2, [{ e: E.b1, wht: 0, ssoBase: 1_000_000, ee: 50_000, snap: { engineVersion: 2, whtOneOffSatang: 0, ssoWageSatang: 1_000_000 }, gross: 1_000_000 }]),
  };
  // S3.0 control
  {
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: TT } })) as Any[];
    const items = (await P.hrPayrollItem.findMany({ where: { tenantId: TT } })) as Any[];
    const sums = runs.every((r) => items.filter((i) => i.runId === r.id).reduce((a, i) => a + i.whtSatang, 0) === r.totalWhtSatang);
    const acct = await P.appSystem.count({ where: { tenantId: TT, type: "ACCOUNT" } });
    ck("S3.0", { runs: runs.length === 7, items: items.length === 14, sums, noAcct: acct === 0, book: (await P.appSystem.count({ where: { tenantId: TB, type: "ACCOUNT" } })) === 1 }, "fixture ok", `${runs.length} runs ${items.length} items`);
  }
  const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ไฟล์ยื่น จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
  // S3.1 profile
  {
    const bad = await S("saveFilingProfile", cA, V.owner, { ...PROFILE, taxId: "0105555000014" });
    const byPay = await S("saveFilingProfile", cA, V.pay, PROFILE);
    const ok = await S("saveFilingProfile", cA, V.owner, PROFILE);
    const back = await S("getFilingProfile", cA, V.owner);
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.filing.profile" } })) as Any[];
    ck("S3.1", {
      badId: bad.value?.ok === false && bad.text === fillText("profile", ["taxId"]),
      owner: byPay.value?.ok === false && byPay.text === T.profileOwner,
      saved: ok.ok, read: back.value?.profile?.taxId === PROFILE.taxId && back.value?.profile?.ssoAccountNo === PROFILE.ssoAccountNo,
      audit: aud.length === 1 && canon(Object.keys(aud[0].after ?? {}).sort()) === canon(["op"]) && leaks(JSON.stringify(aud)).length === 0,
    }, "owner profile", `${shown(bad)} ${shown(byPay)} ${shown(ok)}`);
    await S("saveFilingProfile", cB, V.owner, PROFILE);
    await S("saveFilingProfile", cC, V.owner, PROFILE);
    await callMod(SV, "saveFilingProfile", [cBH, vOf(bookOwner), { ...PROFILE, taxId: "0105555000021" }]);
  }
  // S3.2 persons
  {
    const res: RO[] = [];
    for (const [k, p] of Object.entries(PERSON)) res.push(await S("saveFilingPerson", cA, V.pay, { employeeId: E[k as keyof typeof E], ...p }));
    const badPrefix = await S("saveFilingPerson", cA, V.pay, { employeeId: E.e4, ...PERSON.e4, ssoPrefix: "12" });
    const got = await S("getFilingPerson", cA, V.pay, { employeeId: E.e1 });
    const empRow = await P.hrEmployee.findUnique({ where: { id: E.e1 } });
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.filing.person" } })) as Any[];
    ck("S3.2", {
      saved: res.every((r) => r.ok), prefix: badPrefix.value?.ok === false && badPrefix.text === fillText("person", ["ssoPrefix"]),
      read: got.value?.person?.firstName === "เอกชัย" && got.value?.person?.houseNo === "99",
      empSame: empRow?.name === `เอกชัย ${tag}` && empRow?.nationalId === "1102000123454",
      audit: aud.length === 6 && aud.every((a) => canon(Object.keys(a.after ?? {})) === canon(["employeeId"])),
    }, "persons", res.map(shown).join(" "));
    await callMod(SV, "saveFilingPerson", [cB, V.pay, { employeeId: E.b1, title: "นาย", firstName: "บี", lastName: "หนึ่ง" }]);
  }
  const gen = (c: Any, v: Any, req: Any, o: Any = NOW_FEB) => S("generateFiling", c, v, req, o);
  // S3.3 DB1
  let fileDb1 = "";
  {
    const pv = await S("previewFiling", cA, V.owner, { kind: "PND1", period: "2031-02" }, NOW_FEB);
    const g = await gen(cA, V.owner, { kind: "PND1", period: "2031-02" });
    fileDb1 = g.value?.fileId ?? "";
    const want = gold("hr-h3.6-db1-pnd1.txt");
    ck("S3.3", {
      bytes: eqBytes(g.value?.bytes, want), name: g.value?.fileName === "PND1_0105555000013_000000_2574_02_00_00.txt",
      zero: canon((g.value?.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause])) === canon([[E.e6, "ZERO_INCOME"]]),
      warn: canon((g.value?.warnings ?? []).map((w: Any) => w.warning ?? w.code)) === canon(["NOT_PAID"]),
      preview: pv.value?.lineCount === 3 && pv.value?.totalSatang === 6_700_000 && pv.value?.taxSatang === 75_000,
    }, "DB1 byte-exact", `${firstDiff(g.value?.bytes, want)} ${shown(g)}`);
  }
  // S3.9 leaver certificate (before the annual file so DB2 orders by it)
  let certE2 = "";
  {
    const notLeft = await S("issueTaxCertificate", cA, V.owner, { employeeId: E.e1, taxYear: 2031, kind: "LEAVER" }, at("2031-04-10T03:00:00Z"));
    const r = await S("issueTaxCertificate", cA, V.owner, { employeeId: E.e2, taxYear: 2031, kind: "LEAVER" }, at("2031-04-10T03:00:00Z"));
    certE2 = r.value?.certId ?? "";
    const again = await S("issueTaxCertificate", cA, V.owner, { employeeId: E.e2, taxYear: 2031, kind: "LEAVER" }, at("2031-04-11T03:00:00Z"));
    const row = certE2 ? await P.hrTaxCertificate?.findUnique?.({ where: { id: certE2 } }).catch(() => null) : null;
    const seq = (await fx.rawRows(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "docType" = 'WHT_CERT' AND "periodKey" = 'HR50:2031'`, sA)) ?? [];
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.taxcert.issue" } })) as Any[];
    const content = row?.contentJson ?? {};
    ck("S3.9", {
      notLeft: notLeft.value?.ok === false && notLeft.text === T.certNotLeft,
      issued: r.value?.docNo === "HR50-2031-0001" && r.value?.formSeq === 1,
      frozen: content.totalSatang === 5_100_000 && content.totalTaxSatang === 0 && content.funds?.ssoSatang === 225_000 && content.kind === "LEAVER" && content.payee?.taxId === "3100600999991",
      exists: again.value?.ok === false && again.text === String(T.certExists).replace("{docNo}", "HR50-2031-0001"),
      counter: Number(seq[0]?.lastNo) === 1,
      audit: aud.length === 1 && canon(Object.keys(aud[0].after ?? {}).sort()) === canon(["certId", "docNo", "kind", "taxYear"]) && leaks(JSON.stringify(aud)).length === 0,
    }, "leaver certificate", `${shown(notLeft)} ${shown(r)} ${shown(again)}`);
  }
  // S3.4 DB2 + monthly property
  {
    const g = await gen(cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-01-20T03:00:00Z"));
    const want = gold("hr-h3.6-db2-pnd1a.txt");
    const months = await Promise.all(["2031-01", "2031-02", "2031-03"].map((p) => S("previewFiling", cA, V.owner, { kind: "PND1", period: p }, NOW_FEB)));
    const sum = new Map<string, [number, number]>();
    for (const m of months) for (const r of (m.value?.rows ?? []) as Any[]) sum.set(r.employeeId, [(sum.get(r.employeeId)?.[0] ?? 0) + r.amountSatang, (sum.get(r.employeeId)?.[1] ?? 0) + r.taxSatang]);
    const ann = await S("previewFiling", cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-01-20T03:00:00Z"));
    const annMap = new Map<string, [number, number]>(((ann.value?.rows ?? []) as Any[]).map((r) => [r.employeeId, [r.amountSatang, r.taxSatang]]));
    ck("S3.4", {
      bytes: eqBytes(g.value?.bytes, want),
      e3: (g.value?.notIncluded ?? []).some((x: Any) => x.employeeId === E.e3 && x.cause === "INCOMPLETE" && canon(x.fields) === canon(["nationalId"])),
      warn: canon((g.value?.warnings ?? []).map((w: Any) => w.warning ?? w.code).sort()) === canon(["NOT_FINAL", "NOT_PAID", "V1_RUN"]),
      prop: annMap.size === 4 && [...annMap].every(([k, v]) => canon(sum.get(k)) === canon(v)),
    }, "DB2 byte-exact · Σ monthly = annual", `${firstDiff(g.value?.bytes, want)} ${shown(g)}`);
  }
  // S3.5 DB3
  let fileSso = "";
  {
    const g = await gen(cA, V.owner, { kind: "SSO110", runId: R.r2 });
    fileSso = g.value?.fileId ?? "";
    const ga = await gen(cA, V.owner, { kind: "SSO110", runId: R.r2, options: { wageMode: "ACTUAL" } });
    const want = gold("hr-h3.6-db3-sso.txt");
    ck("S3.5", {
      bytes: eqBytes(g.value?.bytes, want), ctype: g.value?.contentType === "text/plain; charset=windows-874",
      ni: canon((g.value?.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause, x.fields])) === canon([[E.e4, "INCOMPLETE", ["ssoPrefix"]], [E.e6, "NOT_INSURED", []]]),
      actual: eqBytes(ga.value?.bytes, gold("hr-h3.6-db3a-sso-actual.txt")),
    }, "DB3 byte-exact", `${firstDiff(g.value?.bytes, want)} ${shown(g)}`);
  }
  // S3.6 manifest + audit + no payroll write
  {
    const m = fileDb1 ? await P.hrFilingFile?.findUnique?.({ where: { id: fileDb1 } }).catch(() => null) : null;
    const want = gold("hr-h3.6-db1-pnd1.txt");
    const aud = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.filing.generate" } })) as Any[]).find((a) => a.after?.fileId === fileDb1);
    const runs = ((await P.hrPayrollRun.findMany({ where: { tenantId: TT }, orderBy: { periodKey: "asc" } })) as Any[]).filter((r) => r.systemId === sA);
    const outbox = await P.outboxEvent.count({ where: { tenantId: TT } }).catch(() => -1);
    ck("S3.6", {
      manifest: !!m && m.sha256 === sha256Hex(want) && m.byteLength === want.length && m.lineCount === 3 && m.kind === "PND1" && m.period === "2031-02",
      times: !!m && +m.createdAt === +NOW_FEB.now && +m.expiresAt === +NOW_FEB.now + 7 * DAY,
      noIds: !!m && leaks(JSON.stringify(m.optionsJson ?? {})).length === 0,
      audit: !!aud && srt(Object.keys(aud.after ?? {})) === K.audGen && aud.after.totalSatang === 6_700_000,
      runs: runs.map((r) => r.status).join(",") === "PAID,APPROVED,PAID,REVERSED,DRAFT,APPROVED" && runs.every((r) => r.filingJson === null),
      outbox: outbox === 0,
    }, "manifest · audit · read-only", short(m, 100));
  }
  // S3.7 download lifecycle
  {
    const dl = (id: string, o: Any = NOW_FEB) => S("downloadFiling", cA, V.owner, { fileId: id }, o);
    const a = await dl(fileDb1);
    const cnt = async (id: string) => Number((await P.hrFilingFile?.findUnique?.({ where: { id } }).catch(() => null))?.downloads ?? -1);
    const c1 = await cnt(fileDb1);
    await S("saveFilingPerson", cA, V.pay, { employeeId: E.e2, ...PERSON.e2, lastName: "สองใจใหม่" });
    const changed = await dl(fileDb1);
    await S("saveFilingPerson", cA, V.pay, { employeeId: E.e2, ...PERSON.e2 });
    const back = await dl(fileDb1);
    const expired = await dl(fileDb1, at("2031-03-13T03:00:01Z"));
    await P.hrPayrollRun.update({ where: { id: R.r2 }, data: { status: "REVERSED" } });
    const revPnd = await dl(fileDb1);
    const revSso = await dl(fileSso);
    await P.hrPayrollRun.update({ where: { id: R.r2 }, data: { status: "APPROVED" } });
    const audN = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.filing.download" } })) as Any[]).filter((x) => x.after?.fileId === fileDb1).length;
    ck("S3.7", {
      same: eqBytes(a.value?.bytes, gold("hr-h3.6-db1-pnd1.txt")) && c1 === 1,
      changed: changed.value?.ok === false && changed.text === T.changed, back: back.ok,
      expired: expired.value?.ok === false && expired.text === T.expired,
      revPnd: revPnd.value?.ok === false && revPnd.text === T.changed, revSso: revSso.value?.ok === false && revSso.text === T.status,
      audit: audN === 2,
    }, "download rules", [a, changed, back, expired, revPnd, revSso].map(shown).join(" "));
  }
  // S3.8 statuses + RUN_DATA
  {
    const before = await P.hrFilingFile?.count?.({ where: { tenantId: TT } }).catch(() => -1);
    const ssoDraft = await gen(cA, V.owner, { kind: "SSO110", runId: R.r5 });
    const ssoRev = await gen(cA, V.owner, { kind: "SSO110", runId: R.r4 });
    const may = await S("previewFiling", cA, V.owner, { kind: "PND1", period: "2031-05" }, NOW_FEB);
    const broken = await gen(cB, V.owner, { kind: "PND1", period: "2031-02" });
    const after = await P.hrFilingFile?.count?.({ where: { tenantId: TT } }).catch(() => -2);
    ck("S3.8", {
      draft: ssoDraft.value?.ok === false && ssoDraft.text === T.status, rev: ssoRev.value?.ok === false && ssoRev.text === T.status,
      noDraftInPnd: may.value?.ok === false && may.value?.code === "EMPTY",
      runData: broken.value?.ok === false && broken.text === String(T.runData).replace("{runs}", "2031-02"),
      noManifest: before === after,
    }, "statuses · RUN_DATA", [ssoDraft, ssoRev, may, broken].map(shown).join(" "));
  }
  // S3.10 bulk
  const certs: Record<string, string> = {};
  {
    const r = await S("issueTaxCertificatesBulk", cA, V.owner, { taxYear: 2031 }, at("2032-02-01T03:00:00Z"));
    const issued = ((r.value?.issued ?? []) as Any[]).map((x) => [x.employeeId, x.docNo]);
    for (const x of (r.value?.issued ?? []) as Any[]) certs[x.employeeId] = x.certId;
    const skipped = ((r.value?.skipped ?? []) as Any[]).map((x) => [x.employeeId, x.cause, x.fields ?? []]);
    const ann = await S("previewFiling", cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-02-02T03:00:00Z"));
    const rows = ((ann.value?.rows ?? []) as Any[]).map((x) => [x.employeeId, x.seq]);
    const list = await S("listTaxCertificates", cA, V.owner, { taxYear: 2031 });
    const fs = new Map(((list.value?.items ?? []) as Any[]).map((x) => [x.employeeId, x.formSeq]));
    ck("S3.10", {
      issued: canon(issued) === canon([[E.e1, "HR50-2031-0002"], [E.e4, "HR50-2031-0003"], [E.e5, "HR50-2031-0004"]]),
      skipped: canon(skipped) === canon([[E.e2, "ALREADY", []], [E.e3, "INCOMPLETE", ["nationalId"]], [E.e6, "NO_INCOME", []]]),
      order: canon(rows) === canon([[E.e2, 1], [E.e1, 2], [E.e4, 3], [E.e5, 4]]),
      formSeq: rows.every(([e, s]) => fs.get(e) === s),
    }, "bulk issue", `${short(issued, 120)} ${short(skipped, 120)}`);
  }
  // S3.11 frozen content
  {
    await P.hrEmployee.update({ where: { id: E.e1 }, data: { nationalId: "1102000123462" } });
    await S("saveFilingPerson", cA, V.pay, { employeeId: E.e1, ...PERSON.e1, firstName: "เปลี่ยนชื่อ" });
    const d = await S("downloadTaxCertificate", cA, V.owner, { certId: certs[E.e1] });
    let pages: string[] = [];
    try {
      pages = bufOf(d.value?.bytes) ? pdfPagesText(bufOf(d.value.bytes)!) : [];
    } catch {
      pages = [];
    }
    const row = certs[E.e1] ? await P.hrTaxCertificate?.findUnique?.({ where: { id: certs[E.e1] } }).catch(() => null) : null;
    const shaOk = !!row && row.contentSha256 === sha(canon(row.contentJson));
    // tamper the stored content (oracle-only write) ⇒ certChanged, then restore
    let tampered: RO = { ok: true, text: "", value: null };
    if (row) {
      await P.hrTaxCertificate.update({ where: { id: row.id }, data: { contentJson: { ...row.contentJson, totalSatang: 1 } } });
      tampered = await S("downloadTaxCertificate", cA, V.owner, { certId: row.id });
      await P.hrTaxCertificate.update({ where: { id: row.id }, data: { contentJson: row.contentJson } });
    }
    await P.hrEmployee.update({ where: { id: E.e1 }, data: { nationalId: "1102000123454" } });
    await S("saveFilingPerson", cA, V.pay, { employeeId: E.e1, ...PERSON.e1 });
    ck("S3.11", {
      pdf: pages.length === 2 && pages.every((p) => digitsOf(p).includes("1102000123454") && !digitsOf(p).includes("1102000123462") && thNorm(p).includes(thNorm("เอกชัย")) && digitsOf(p).includes("HR50-2031-0002") && digitsOf(p).includes("95,000.00")),
      sha: shaOk, tamper: tampered.value?.ok === false && tampered.text === T.certChanged,
    }, "frozen issued content", `${shown(d)} pages=${pages.length}`);
  }
  // S3.12 void + reissue
  {
    const byPay = await S("voidTaxCertificate", cA, V.pay, { certId: certs[E.e4], reason: "ข้อมูลผิด" }, at("2032-02-03T03:00:00Z"));
    const noReason = await S("voidTaxCertificate", cA, V.owner, { certId: certs[E.e4], reason: "" }, at("2032-02-03T03:00:00Z"));
    const v = await S("voidTaxCertificate", cA, V.owner, { certId: certs[E.e4], reason: "ข้อมูลผิด" }, at("2032-02-03T03:00:00Z"));
    const dlVoid = await S("downloadTaxCertificate", cA, V.owner, { certId: certs[E.e4] });
    const re = await S("issueTaxCertificate", cA, V.owner, { employeeId: E.e4, taxYear: 2031, kind: "ANNUAL" }, at("2032-02-04T03:00:00Z"));
    const ann = await S("previewFiling", cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-02-05T03:00:00Z"));
    const w = ((ann.value?.warnings ?? []) as Any[]).filter((x) => x.warning === "CERT_SEQ").map((x) => x.employeeId);
    const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.taxcert.void" } })) as Any[];
    ck("S3.12", {
      owner: byPay.value?.ok === false && byPay.text === T.certVoidOwner, reason: noReason.value?.ok === false && noReason.text === T.voidReason,
      voided: v.ok && dlVoid.value?.ok === false && dlVoid.text === T.voided,
      reissue: re.value?.docNo === "HR50-2031-0005" && re.value?.formSeq === 4,
      seqWarn: canon(w) === canon([E.e5]),
      audit: aud.length === 1 && !JSON.stringify(aud).includes("ข้อมูลผิด"),
    }, "void · reissue · CERT_SEQ", [byPay, noReason, v, dlVoid, re].map(shown).join(" "));
  }
  // S3.13 tenant with an ACCOUNT book
  {
    const e = await emp(cBH, "K01", "กอไก่", "3100500654321");
    await callMod(SV, "saveFilingPerson", [cBH, vOf(bookOwner), { employeeId: e, title: "นาย", firstName: "กอ", lastName: "ไก่" }]);
    await mkRun(cBH, "2031-01", "2031-01-30", "PAID", 2, [{ e, wht: 1000, ssoBase: 1_000_000, ee: 50_000, snap: v2snap(1_000_000, 0, 1_000_000), gross: 1_000_000 }]);
    const r = await callMod(SV, "issueTaxCertificate", [cBH, vOf(bookOwner), { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, at("2032-02-01T03:00:00Z")]);
    const docs = await P.accountDocument.count({ where: { tenantId: TB } }).catch(() => -1);
    const bookSeq = (await fx.rawRows(`SELECT count(*)::int AS n FROM "AccountDocSequence" WHERE "systemId" = $1`, sBook))?.[0]?.n;
    const hrSeq = (await fx.rawRows(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HR50:2031'`, sBH))?.[0]?.lastNo;
    ck("S3.13", { no: r.value?.docNo === "HR50-2031-0001", docs: docs === 0, bookSeq: Number(bookSeq) === 0, hrSeq: Number(hrSeq) === 1 }, "same numbering with a book", shown(r));
  }
  // S3.14 self-service
  {
    const me = actorOf(U.self);
    const list = await S("listMyTaxCertificates", me);
    const own = await S("downloadMyTaxCertificate", me, { certId: certs[E.e5] });
    const other = await S("downloadMyTaxCertificate", me, { certId: certs[E.e1] });
    const unknown = await S("downloadMyTaxCertificate", me, { certId: "nope" });
    const member = await S("downloadMyTaxCertificate", actorOf(U.member), { certId: certs[E.e5] });
    const aud = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.taxcert.download" } })) as Any[]).filter((a) => a.after?.by === "SELF");
    ck("S3.14", {
      list: canon(((list.value?.items ?? []) as Any[]).map((x) => x.docNo)) === canon(["HR50-2031-0004"]),
      own: own.ok && bufOf(own.value?.bytes)?.subarray(0, 5).toString("latin1") === "%PDF-",
      other: noOk(other) && canon(other.value) === canon(unknown.value), member: noOk(member),
      audit: aud.length === 1,
    }, "own certificate only", [list, own, other, member].map(shown).join(" "));
  }
  // S3.16 not finalized (H3.4)
  {
    const ann = await S("previewFiling", cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-02-05T03:00:00Z"));
    const nf = ((ann.value?.warnings ?? []) as Any[]).find((w) => w.warning === "NOT_FINAL");
    const e1 = ((ann.value?.rows ?? []) as Any[]).find((r) => r.employeeId === E.e1);
    const sso6 = await gen(cA, V.owner, { kind: "SSO110", runId: R.r6 });
    ck("S3.16", { guard: HAS_STEPS, warn: !!nf && canon(nf.fields) === canon(["2031-06"]) && nf.employeeId === null, e1: e1?.amountSatang === 9_500_000, sso: sso6.value?.ok === false && sso6.text === T.notFinal },
      "finalized runs only", HAS_STEPS ? `${short(nf, 80)} ${shown(sso6)}` : "n/a — HrPayrollRun.stepsJson absent (H3.4 not merged) ⇒ fail by design");
  }
  // S3.15 DTO keys
  {
    const pv = await S("previewFiling", cA, V.owner, { kind: "PND1A", period: "2031" }, at("2032-02-05T03:00:00Z"));
    const files = await S("listFilingFiles", cA, V.owner, {});
    const cl = await S("listTaxCertificates", cA, V.owner, { taxYear: 2031 });
    const mine = await S("listMyTaxCertificates", actorOf(U.self));
    const keysOk = (arr: Any[], want: string) => arr.length > 0 && arr.every((x) => srt(Object.keys(x)) === want);
    const all = [pv.value, files.value, cl.value, mine.value];
    const forb = all.flatMap((v) => [...keysDeep(v)].filter((k) => (HR_FORBIDDEN_DTO_KEYS as readonly string[]).includes(k) || k === "contentJson"));
    const masked = ((pv.value?.rows ?? []) as Any[]).every((r) => /^•••\d{4}$/.test(r.pinMasked));
    ck("S3.15", {
      preview: srt(Object.keys(pv.value ?? {})) === K.preview, row: keysOk(pv.value?.rows ?? [], K.row), ni: keysOk(pv.value?.notIncluded ?? [], K.ni), warn: keysOk(pv.value?.warnings ?? [], K.warn),
      file: keysOk(files.value?.items ?? [], K.file), cert: keysOk(cl.value?.items ?? [], K.cert), mine: keysOk(mine.value?.items ?? [], K.mine),
      forbidden: forb.length === 0, masked, noIds: leaks(JSON.stringify(all)).length === 0,
    }, "DTO shapes", forb.join(","));
  }
  // S4.1 gate matrix
  {
    const deny = ["readOnly", "payOnly", "branchPay", "mgr", "mgrAll", "member", "self", "other"] as const;
    const before = await P.hrFilingFile?.count?.({ where: { tenantId: TT } }).catch(() => -1);
    const ops = (v: Any): Promise<RO>[] => [
      S("previewFiling", cA, v, { kind: "PND1", period: "2031-02" }, NOW_FEB),
      S("generateFiling", cA, v, { kind: "PND1", period: "2031-02" }, NOW_FEB),
      S("downloadFiling", cA, v, { fileId: fileDb1 }, NOW_FEB),
      S("listFilingFiles", cA, v, {}),
      S("getFilingPerson", cA, v, { employeeId: E.e1 }),
      S("issueTaxCertificate", cA, v, { employeeId: E.e6, taxYear: 2031, kind: "ANNUAL" }, at("2032-02-06T03:00:00Z")),
      S("listTaxCertificates", cA, v, { taxYear: 2031 }),
      S("downloadTaxCertificate", cA, v, { certId: certs[E.e1] }),
    ];
    const bad: string[] = [];
    for (const k of deny) {
      const rs = await Promise.all(ops(V[k]));
      rs.forEach((r, i) => {
        if (!noOk(r)) bad.push(`${k}#${i}`);
      });
    }
    const after = await P.hrFilingFile?.count?.({ where: { tenantId: TT } }).catch(() => -2);
    const okOwner = (await Promise.all(ops(V.pay))).filter((r, i) => i !== 5 && i !== 1).every((r) => r.ok);
    ck("S4.1", { deny: bad.length === 0, nothing: before === after, allow: okOwner && (await SV?.canUseFilings?.(cA, V.owner)) === true }, "gate", bad.slice(0, 12).join(","));
  }
  // S4.2 cross system/tenant
  {
    const x1 = await S("downloadFiling", cB, V.owner, { fileId: fileDb1 }, NOW_FEB);
    const x2 = await S("downloadTaxCertificate", cB, V.owner, { certId: certs[E.e1] });
    const x3 = await S("downloadFiling", cO, V.other, { fileId: fileDb1 }, NOW_FEB);
    const x4 = await S("getFilingPerson", cB, V.owner, { employeeId: E.e1 });
    const u = await S("downloadFiling", cA, V.owner, { fileId: "unknown" }, NOW_FEB);
    ck("S4.2", { a: noOk(x1), b: noOk(x2), c: noOk(x3), d: noOk(x4), same: [x1, x2, x3, x4].every((x) => canon(x.value) === canon(u.value)) }, "no", [x1, x2, x3, x4].map(shown).join(" "));
  }
  // S5.1 / S5.2 races (system C: fresh counter)
  {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const e = await emp(cC, `C0${i}`, `ซี${i}`, ["1102000123454", "3100600999991", "1500100123451", "3900100123453", "1700100123459", "1200100123453"][i]);
      await S("saveFilingPerson", cC, V.owner, { employeeId: e, title: "นาย", firstName: `ซี${"กขคงจฉ"[i]}`, lastName: "ทดสอบ" });
      ids.push(e);
    }
    await mkRun(cC, "2031-01", "2031-01-30", "PAID", 2, ids.map((e) => ({ e, wht: 100, ssoBase: 0, ee: 0, snap: v2snap(100_000, 0, 0), gross: 100_000 })));
    const same = await Promise.all([0, 1, 2, 3].map(() => S("issueTaxCertificate", cC, V.owner, { employeeId: ids[0], taxYear: 2031, kind: "ANNUAL" }, at("2032-02-01T03:00:00Z"))));
    const okN = same.filter((r) => r.ok).length;
    ck("S5.1", { one: okN === 1, rest: same.filter((r) => !r.ok).every((r) => /HR50-2031-0001/.test(r.text)) }, "1 + 3 certExists", same.map(shown).join(" "));
    const many = await Promise.all(ids.slice(1).map((e) => S("issueTaxCertificate", cC, V.owner, { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, at("2032-02-01T03:00:00Z"))));
    const nos = [same.find((r) => r.ok)?.value?.docNo, ...many.map((r) => r.value?.docNo)].sort();
    const last = (await fx.rawRows(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HR50:2031'`, sC))?.[0]?.lastNo;
    chk("S5.2", many.every((r) => r.ok) && canon(nos) === canon([1, 2, 3, 4, 5, 6].map((n) => `HR50-2031-000${n}`)) && Number(last) === 6, "6 distinct contiguous", `${nos.join(",")} last=${last}`);
  }
  // S6.1 route helpers
  {
    const req = (h: Record<string, string> = {}) => new Request("http://qc.invalid/x", { headers: h });
    const r204 = await D("filingFileGet", req({ rsc: "1" }), cA, V.owner, fileDb1, NOW_FEB);
    const pre = await D("taxCertGet", req({ "next-router-prefetch": "1" }), cA, V.owner, certs[E.e1], {});
    const okF = await D("filingFileGet", req(), cA, V.owner, fileDb1, NOW_FEB);
    const okC = await D("taxCertGet", req(), cA, V.owner, certs[E.e1], {});
    const no = await D("filingFileGet", req(), cA, V.member, fileDb1, NOW_FEB);
    const exp = await D("filingFileGet", req(), cA, V.owner, fileDb1, at("2031-03-20T00:00:00Z"));
    const mine = await D("myTaxCertGet", req(), actorOf(U.self), certs[E.e5], {});
    const notMine = await D("myTaxCertGet", req(), actorOf(U.self), certs[E.e1], {});
    const st = (x: RO) => (x.value instanceof Response ? x.value.status : -1);
    const hd = (x: RO, k: string) => (x.value instanceof Response ? x.value.headers.get(k) ?? "" : "");
    const body = async (x: RO) => (x.value instanceof Response ? Buffer.from(await x.value.clone().arrayBuffer()) : Buffer.alloc(0));
    const okBody = await body(okF);
    const noBody = (await body(no)).toString("utf8");
    const expBody = (await body(exp)).toString("utf8");
    ck("S6.1", {
      r204: st(r204) === 204 && st(pre) === 204,
      ok: st(okF) === 200 && /^attachment; filename="PND1_0105555000013_000000_2574_02_00_00\.txt"$/.test(hd(okF, "content-disposition")) && hd(okF, "cache-control") === "no-store" && hd(okF, "x-content-type-options") === "nosniff" && okBody.length > 0,
      cert: st(okC) === 200 && (await body(okC)).subarray(0, 5).toString("latin1") === "%PDF-" && !/1102000123454/.test(hd(okC, "content-disposition")),
      no: st(no) === 404 && noBody === T.no, exp: st(exp) === 410 && expBody === T.expired,
      self: st(mine) === 200 && st(notMine) === 404,
    }, "helpers", `${st(r204)} ${st(okF)} ${st(okC)} ${st(no)} ${st(exp)} ${st(mine)} ${st(notMine)}`);
  }
  // ORACLE-EDIT (H3.6 fix r1): S3.17 (F4 F6 F7) on a fresh system D · S6.2 (F9) HEAD
  {
    const sD = await sys("ทีม D");
    const cD = { tenantId: TT, systemId: sD };
    await S("saveFilingProfile", cD, V.owner, PROFILE);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const e = await emp(cD, `D0${i}`, `ดี${i}`, ["1102000123454", "3100600999991", "1500100123451"][i]!, i === 1 ? { endDate: "2031-12-31" } : {});
      await S("saveFilingPerson", cD, V.owner, { employeeId: e, title: "นาย", firstName: `ดี${"กขค"[i]}`, lastName: "ทดสอบ" });
      ids.push(e);
    }
    await mkRun(cD, "2031-01", "2031-01-30", "PAID", 2, ids.map((e) => ({ e, wht: 100, ssoBase: 0, ee: 0, snap: v2snap(100_000, 0, 0), gross: 100_000 })));
    await mkRun(cD, "2031-06", "2031-06-30", "APPROVED", 2, [{ e: ids[0]!, wht: 100, ssoBase: 0, ee: 0, snap: v2snap(100_000, 0, 0), gross: 100_000 }], false);
    const lastSec = at("2031-12-31T16:59:59Z"); // 23:59:59 เวลาไทย 31 ธ.ค. 2031
    const early = await S("issueTaxCertificate", cD, V.owner, { employeeId: ids[0], taxYear: 2031, kind: "ANNUAL" }, lastSec);
    const earlyBulk = await S("issueTaxCertificatesBulk", cD, V.owner, { taxYear: 2031 }, lastSec);
    const notYetLeft = await S("issueTaxCertificate", cD, V.owner, { employeeId: ids[1], taxYear: 2031, kind: "LEAVER" }, at("2031-12-20T03:00:00Z"));
    const nf = await S("previewFiling", cD, V.owner, { kind: "PND1", period: "2031-06" }, NOW_FEB);
    const bulk = await callMod(SV, "issueTaxCertificatesBulk", [cD, V.owner, { taxYear: 2031 }, { now: new Date("2032-01-05T03:00:00Z"), __afterIssue: async (n: number) => { if (n === 1) await P.hrFilingProfile.updateMany({ where: { systemId: sD }, data: { signerName: null } }); } }]);
    const lastNo = (await fx.rawRows(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "periodKey" = 'HR50:2031'`, sD))?.[0]?.lastNo;
    const nCert = await P.hrTaxCertificate.count({ where: { systemId: sD } });
    ck("S3.17", {
      early: early.value?.ok === false && early.text === T.certTooEarly, earlyBulk: earlyBulk.value?.ok === false && earlyBulk.text === T.certTooEarly && !earlyBulk.value?.issued,
      leaver: notYetLeft.value?.ok === false && notYetLeft.text === T.certNotLeft,
      notFinal: nf.value?.ok === false && nf.value?.code === "EMPTY" && nf.text === `${T.notFinal} (2031-06)`,
      stopped: bulk.value?.ok === true && (bulk.value.issued ?? []).length === 1 && bulk.value.stopped?.code === "PROFILE" && Number(lastNo) === 1 && nCert === 1,
    }, "too early · not left · notFinal EMPTY · bulk stop keeps issued", `${shown(early)} ${shown(earlyBulk)} ${shown(notYetLeft)} ${shown(nf)} ${short(bulk.value, 160)} last=${lastNo}`);
  }
  {
    const head = (u: string) => new Request(u, { method: "HEAD" });
    const before = Number((await P.hrFilingFile.findUnique({ where: { id: fileDb1 } }))?.downloads ?? -1);
    const audBefore = await P.auditLog.count({ where: { tenantId: TT, action: { in: ["hr.filing.download", "hr.taxcert.download"] } } });
    const h1 = await D("filingFileGet", head("http://qc.invalid/f"), cA, V.owner, fileDb1, NOW_FEB);
    const h2 = await D("taxCertGet", head("http://qc.invalid/c"), cA, V.owner, certs[E.e1], {});
    const h3 = await D("myTaxCertGet", head("http://qc.invalid/m"), actorOf(U.self), certs[E.e5], {});
    const after = Number((await P.hrFilingFile.findUnique({ where: { id: fileDb1 } }))?.downloads ?? -2);
    const audAfter = await P.auditLog.count({ where: { tenantId: TT, action: { in: ["hr.filing.download", "hr.taxcert.download"] } } });
    const st = (x: RO) => (x.value instanceof Response ? x.value.status : -1);
    const routesOk = F.routes.every((p) => /export\s+(async\s+)?function\s+HEAD\b/.test(rd(p)) && /req\.method !== "GET"/.test(rd(p)));
    ck("S6.2", { status: [h1, h2, h3].every((x) => st(x) === 405), noCount: before === after, noAudit: audBefore === audAfter, routes: routesOk }, "HEAD ⇒ 405 before anything", `${st(h1)} ${st(h2)} ${st(h3)} dl ${before}/${after} aud ${audBefore}/${audAfter}`);
  }
  // S4.3 privacy sweep (after everything)
  {
    const aud = JSON.stringify(await P.auditLog.findMany({ where: { tenantId: { in: [TT, TB] } } }));
    const ob = JSON.stringify(await P.outboxEvent.findMany({ where: { tenantId: { in: [TT, TB] } } }).catch(() => []));
    const man = JSON.stringify((await P.hrFilingFile?.findMany?.({ where: { tenantId: TT } }).catch(() => [])) ?? []);
    const names = ((await P.hrFilingFile?.findMany?.({ where: { tenantId: TT }, select: { fileName: true } }).catch(() => [])) ?? []) as Any[];
    const routesLeak = F.routes.some((p) => /nationalId|taxId/.test(p));
    const cons = CAPTURED.join("\n");
    const produced = (await P.auditLog.count({ where: { tenantId: TT, action: { in: ["hr.filing.generate", "hr.taxcert.issue"] } } })) >= 2;
    ck("S4.3", {
      produced, audit: leaks(aud).length === 0, outbox: leaks(ob).length === 0, console: leaks(cons).filter((x) => x !== "0105555000013").length === 0,
      manifest: leaks(man.replace(/"fileName":"[^"]*"/g, "")).length === 0, names: names.every((n) => !leaks(String(n.fileName)).some((x) => x !== "0105555000013" && x !== "0105555000021")), routes: !routesLeak,
    }, "no IDs outside files", `audit ${leaks(aud).join(",")} console ${leaks(cons).join(",")}`);
  }
}
function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

// ═════════════════════════ fix r1 pure (ORACLE-EDIT, H3.6 fix r1, controller order 13 Nov) ═════════════════════════
function runFix1Pure(): void {
  const V = jsonOf("scripts/fixtures/hr-h3.6-vectors.json") as Any;
  const cl = (x: unknown) => JSON.parse(JSON.stringify(x)) as Any;
  const hdr = (r: Any) => (r?.ok === true ? Buffer.from(r.bytes).subarray(3).toString("utf8").split("\r\n")[0]!.split("|") : []);
  // S2.17 FORM_FLAG
  {
    const th = jsonOf(F.th)?.hr?.filing ?? {};
    const en = jsonOf(F.en)?.hr?.filing ?? {};
    const ui = stripComments(rd(F.ui));
    const g1 = V?.pnd?.G1?.in;
    const f1 = g1 && typeof B?.buildPnd1 === "function" ? B.buildPnd1({ ...cl(g1), options: { formFlag: 1 } }) : null;
    const f2 = g1 && typeof B?.buildPnd1 === "function" ? B.buildPnd1({ ...cl(g1), options: { formFlag: 2 } }) : null;
    const nd = g1 ? cl(g1) : null;
    if (nd) delete nd.employer.rdFormFlag;
    const fd = nd && typeof B?.buildPnd1 === "function" ? B.buildPnd1(nd) : null;
    const h1 = hdr(f1), h2 = hdr(f2), hd = hdr(fd);
    ck("S2.17", {
      thLabels: /สื่อ/.test(String(th.formFlag1)) && /อินเทอร์เน็ต/.test(String(th.formFlag2)) && !/อินเทอร์เน็ต/.test(String(th.formFlag1)),
      enLabels: /media/i.test(String(en.formFlag1)) && /online/i.test(String(en.formFlag2)),
      uiOptions: /<option value="1">\{t\("formFlag1"\)\}<\/option>/.test(ui) && /<option value="2">\{t\("formFlag2"\)\}<\/option>/.test(ui) && /defaultValue=\{String\(p\?\.rdFormFlag \?\? 2\)\}/.test(ui),
      bytes1: h1[21] === "1" && h1[19] === "0.00", bytes2: h2[21] === "2" && h2[19] === h2[16] && h2[16] === "500.00", dflt: hd[21] === "2",
      svc: /rdFormFlag: 2,/.test(stripComments(rd(F.svc))) && /rdFormFlag\s+Int\s+@default\(2\)/.test(rd(F.schema)),
    }, "1 = media · 2 = internet (label = value = byte) · default 2", `h1=${h1[21]}/${h1[19]} h2=${h2[21]}/${h2[19]} dflt=${hd[21]}`);
  }
  // S2.18 per-employee exclusion
  {
    const g = V?.pnd?.G1?.in ? cl(V.pnd.G1.in) : null;
    let r: Any = null;
    if (g && typeof B?.buildPnd1 === "function") {
      const it = (e: string, run: string, inc: number, tax: number) => ({ ...cl(g.items[0]), employeeId: e, runId: run, incomeSatang: inc, taxSatang: tax });
      g.persons = [cl(V.persons.p1), cl(V.persons.p2), cl(V.persons.p3)];
      g.items = [it("p1", "rA", 10_000_000, 0), it("p1", "rB", 0, 0), it("p2", "rA", 0, 0), it("p2", "rB", 0, 0), it("p3", "rA", 500_000, 0), it("p3", "rB", 0, 1000)];
      r = B.buildPnd1(g);
    }
    ck("S2.18", {
      lines: r?.ok === true && r.lineCount === 1 && r.totalSatang === 10_000_000,
      ni: r?.ok === true && canon((r.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause, x.incomeSatang, x.taxSatang])) === canon([["p2", "ZERO_INCOME", 0, 0], ["p3", "INCOMPLETE", 500_000, 1000]]),
    }, "one decision per employee per file", short(r?.notIncluded, 120));
  }
  // S2.19 U+2028 / U+2029
  {
    const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
    const g = V?.pnd?.G1?.in ? cl(V.pnd.G1.in) : null;
    let rp: Any = null, rs: Any = null;
    if (g && typeof B?.buildPnd1 === "function") {
      g.persons[0].firstName = `สม${LS}ชาย`;
      g.persons[1].address.houseNo = `12${PS}3`;
      rp = B.buildPnd1(g);
    }
    const s3 = V?.sso?.G3?.in ? cl(V.sso.G3.in) : null;
    if (s3 && typeof B?.buildSso110 === "function") {
      s3.persons[0].firstName = `สม${LS}ชาย`;
      s3.options = { ...s3.options, encoding: "UTF8" };
      rs = B.buildSso110(s3);
    }
    ck("S2.19", {
      pnd: rp?.ok === false && rp.code === "EMPTY" && canon((rp.notIncluded ?? []).map((x: Any) => [x.employeeId, x.fields])) === canon([["p1", ["firstName:char"]], ["p2", ["address.houseNo:char"]]]),
      sso: rs?.ok === true && canon((rs.notIncluded ?? []).map((x: Any) => [x.employeeId, x.fields])) === canon([["p1", ["firstName:char"]]]),
    }, "U+2028/2029 like CR/LF", `${short(rp?.notIncluded ?? rp, 100)} · ${short(rs?.notIncluded, 80)}`);
  }
}

// ═════════════════════════ S8 — H3.5 debts closed here (ORACLE-EDIT, H3.6 builder, controller order 13 Nov) ═════════════════════════
async function runDebts(): Promise<void> {
  const BK = await loadOpt(`${H}bank-files/build.ts`, "@/lib/modules/hr/bank-files/build");
  const GN = await loadOpt(`${H}bank-files/generic.ts`, "@/lib/modules/hr/bank-files/generic");
  const V = jsonOf("scripts/fixtures/hr-h3.6-vectors.json") as Any;
  const MARKS = "\u0E34\u0E48\u0E31"; // ิ่ั — combining marks only
  const bank = (accountName: string, format: string, generic?: unknown) => {
    try {
      return BK?.buildBankFile?.({
        run: { runId: "r1", periodKey: "2026-11", payDate: "2026-11-25", status: "PAID", totalNetSatang: 200 },
        payees: [
          { employeeId: "e1", name: "สมชาย", code: "E1", bankName: "กสิกรไทย", accountNo: "1234567890", accountName, netSatang: 100 },
          { employeeId: "e2", name: "สมหญิง", code: "E2", bankName: "กสิกรไทย", accountNo: "1234567891", accountName: "สมหญิง", netSatang: 100 },
        ],
        profile: { debitBankCode: "004", debitAccountNo: "1234567899", debitBranchCode: null, companyNameEn: "QC SHOP CO", ktbCompanyId: null },
        options: { format, effectiveDate: "2026-11-25", ...(generic ? { generic } : {}) },
        now: new Date("2026-11-20T03:00:00Z"),
      }) ?? null;
    } catch (e) {
      return { ok: false, code: `THROW ${errText(e)}` };
    }
  };
  {
    const pct = bank(` ${MARKS} `, "KBANK_PCT");
    const csv = bank(MARKS, "CSV", { preset: "GENERIC" });
    const okName = bank("สมชาย", "CSV", { preset: "GENERIC" });
    const g1 = V?.pnd?.G1?.in ? JSON.parse(JSON.stringify(V.pnd.G1.in)) : null;
    if (g1) g1.persons[0].firstName = MARKS;
    const pnd = g1 && typeof B?.buildPnd1 === "function" ? B.buildPnd1(g1) : null;
    const g3 = V?.sso?.G3?.in ? JSON.parse(JSON.stringify(V.sso.G3.in)) : null;
    if (g3) g3.persons[0].firstName = MARKS;
    const sso = g3 && typeof B?.buildSso110 === "function" ? B.buildSso110(g3) : null;
    const named = (r: Any) => r?.ok === false && r.code === "ENCODING" && canon((r.employees ?? []).map((e: Any) => e.employeeId)) === canon(["e1"]);
    const lsName = `สม${String.fromCharCode(0x2028)}ชาย`; // ORACLE-EDIT (H3.6 fix r1 F5): U+2028 in a CSV/XLSX cell ⇒ ENCODING
    const ls = named(bank(lsName, "CSV", { preset: "GENERIC" })) && named(bank(lsName, "XLSX", { preset: "GENERIC" }));
    ck("S8.1", {
      pct: named(pct), csv: named(csv), control: okName?.ok === true, ls,
      pnd: pnd?.ok === true && pnd.lineCount === 1 && canon((pnd.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause, x.fields])) === canon([["p1", "INCOMPLETE", ["firstName"]]]),
      sso: sso?.ok === true && sso.lineCount === 1 && canon((sso.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause, x.fields])) === canon([["p1", "INCOMPLETE", ["firstName"]]]),
    }, "blank-after-cleaning names refused/listed", `pct=${pct?.code ?? pct?.ok} csv=${csv?.code ?? csv?.ok} pnd=${short(pnd?.notIncluded, 60)} sso=${short(sso?.notIncluded, 60)}`);
  }
  {
    const fl = typeof GN?.formulaLike === "function" ? GN.formulaLike : null;
    const yes = ["\uFF1DSUM(A1)", "\uFF0B1", "\uFF0D1", "\uFF20x", " \uFF1D1", "\u3000\uFF0B1", "=1", "+1", "-1", "@x", "\t1"];
    const no = ["a\uFF1D1", "สมชาย", "1\uFF0B1", ""];
    const csv = bank("\uFF1DHYPERLINK(1)", "CSV", { preset: "GENERIC" });
    const xlsx = bank("\uFF20cmd", "XLSX", { preset: "GENERIC" });
    ck("S8.2", {
      fn: !!fl, yes: !!fl && yes.every((x) => fl(x) === true), no: !!fl && no.every((x) => fl(x) === false),
      csv: csv?.ok === false && csv.code === "FORMULA", xlsx: xlsx?.ok === false && xlsx.code === "FORMULA",
    }, "full-width formula starters", `${fl ? [...yes.filter((x) => !fl(x)), ...no.filter((x) => fl(x))].map((x) => JSON.stringify(x)).join(",") : "∅ formulaLike"} csv=${csv?.code ?? csv?.ok} xlsx=${xlsx?.code ?? xlsx?.ok}`);
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  await runPure(chk, B, PDFM);
  await runDebts(); // ORACLE-EDIT (H3.6 builder): S8.1/S8.2 — H3.5 debts closed in H3.6
  runFix1Pure(); // ORACLE-EDIT (H3.6 fix r1): S2.17–S2.19
  const fz = await fitnessNoEnv();
  chk("X12.1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const exists = async (t: string) => !!(await fx.rawRows(`SELECT to_regclass($1)::text AS r`, `"${t}"`))?.[0]?.r;
  for (const tid of fx.tenants) {
    for (const t of MINE) if (await exists(t)) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
    await P.$executeRawUnsafe(`DELETE FROM "AccountDocSequence" WHERE "tenantId" = $1`, tid).catch(() => null);
  }
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of [...MINE, "AccountDocSequence"]) {
      if (!(await exists(t))) continue;
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (!r || Number(r[0]?.n) !== 0) left.push(`${t}=${r?.[0]?.n ?? "?"}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
