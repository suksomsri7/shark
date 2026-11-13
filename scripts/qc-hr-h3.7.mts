// QC — HR V2 · H3.7 payroll accounting v2: accrual JV at approve (finalize) · payment JV at markPaid · explicit HR→ACCOUNT book link ·
//      posting key hr-payroll#<runId>#accrual|pay · symmetric reversal (reverseEntry) · old runs keep the one-step JV
//      brief ledger/hr-briefs/hr-brief-H3.7.md · design + worked examples ledger/wo-notes/hr-H3.7-design.md · list ledger/wo-notes/hr-H3.7-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every expected amount is hand arithmetic (scripts/fixtures/hr-h3.7-vectors.json), re-derived by the oracle's own formula (qc-hr-h3.7-lib) —
//    never produced by the code under test.
// DB runs are INSERTED v2-shaped (engineVersion 2 + inputDigest, APPROVED, not finalized) and driven through H3.4's RETRY_FINAL door of
//    approveRun (the single final transaction) — the builder must keep that door. Needs H3.4 merged (stepsJson/inputDigest columns);
//    on a base without H3.4 the S4 group is RED by design (presence guard, no crash).
// Tenants qc-hr-h37-<stamp> (3) · runs dated 2031 · markPaidRun opts.now injected · SKIP while hr/payroll-journal-rules.ts is absent (QC_FORCE=1 runs) · --list
// Base for statics = baseRef("QC_H37_BASE") (merge-base HEAD origin/session/hr) — never a hard-coded sha.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.7.mts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Base, type Sev, ROOT, rd, errText, short, canon, stripComments, loadOpt, modState, baseRef, diffHunks, fileAt, makeRegistry, qc4Env,
  makeFixtures, cleanupFx, residueOf, vOf, fitnessNoEnv, importsOf, tagOf, srcFiles, commitInBase, pathInBase,
} from "./qc-hr-lib.mjs";
import {
  VEC, T, TX, type Amounts, type Row, type VItem, type VBound, oracleAmounts, oracleRows, rowsFrom, rowsEq, sumSide, vectorsSelfCheck,
  rng, fuzzRun, amountsFrom, amountsEq, bkkDay, fill, oracleClass, codeOfKey,
} from "./qc-hr-h3.7-lib.mjs";

const SUITE = "qc-hr-h3.7";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h37-";
const H = "src/lib/modules/hr/";
const A_ = "src/lib/modules/account/";
const F = {
  pure: `${H}payroll-journal-rules.ts`, payroll: `${H}payroll.ts`, actions: `${H}payroll-actions.ts`,
  gl: `${A_}gl.ts`, conn: `${A_}connections.ts`, idx: `${A_}index.ts`, coa: `${A_}coa.ts`,
};
const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R6|C|R|[static] gl.ts: ≥1 hunk vs base, every hunk carries "HR H3.7", no line removed (additive only)
S1.2|R6|C|R|[static] connections.ts + index.ts: every hunk marked "HR H3.7" · index exports payrollBookOf linkPayrollBook ensurePayrollLedgersInTx postPayrollAccrualJV postPayrollPayJV payrollAccrualTemplate PAYROLL_ACCOUNTS
S1.3|R6|C|R|[static] account/** files changed vs base ⊆ gl · connections · index · coa (coa: only marked MAPPING_KEY_LABEL lines) · ≥1 of gl/connections/index changed
S1.4|R6|C|G|[static] [control] hr/** imports account only via "@/lib/modules/account" · no account table delegate / raw "Account…" SQL in hr/**
S1.5|R3|C|R|[static] pure file hr/payroll-journal-rules.ts: exists · imports type-only or none · no db / clock / random
S1.6|R9|C|G|[static] [control] no new migration and prisma/schema unchanged vs base (H3.7 needs none: HrPayrollRun.accountSystemId already exists)
S1.7|R8|C|G|[static] [control] frozen vs base: markPaid block · v1 approveRun block · gl postPayrollJV/reverseEntry/reverseFor/commitEntry/resolveLine/ensureAccounting/postManualJV bodies
S1.8|§5|M|R|[static] every new fixed text byte-exact in payroll.ts ∪ gl.ts ∪ connections.ts ∪ pure file (placeholders split)
S1.9|X12|M|G|[run] [control] fitness + fitness-hr without env ⇒ exit 0
S1.10|R7|m|R|[static] UI testids hr-pay-book · hr-pay-account (HR settings) · hr-markpaid-account · hr-markpaid-date (payroll) present under hr UI
S1.11|R1 R7|M|R|[static] connections HR card accountKeys ⊇ PAYROLL_SALARY_EXPENSE, PAYROLL_SALARY_PAYABLE · payroll.ts exports markPaidRun setPayrollBook setPayrollPayAccount · payroll-actions calls markPaidRun
S2.0|fix|C|G|[pure] [control] worked examples A–E self-consistent (oracle formula = hand numbers · Σdr = Σcr = total · pay = Σ net)
S2.1|R2|C|R|[pure] PAYROLL_ACCOUNTS = fixture (key · code · type · label · ledgerName) in order
S2.2|R3|C|R|[pure] accrualAmountsV2 on examples A–E = hand amounts (11 fields each)
S2.3|R4|C|R|[pure] payrollAccrualTemplate on A–E = hand rows (order · key · side · amount · zero rows omitted) + notes = fixture
S2.4|R3 R4|C|R|[pure] fuzz 3,000 runs: builder amounts = oracle amounts · rows = oracle rows · Σdr = Σcr · all amounts safe integers > 0
S2.5|R3|C|R|[pure] 7 inconsistent vectors ⇒ {ok:false, code:"INCONSISTENT"}
S2.6|R3|M|R|[pure] claimClassOf: 12 vectors (ADVANCE · DAMAGES · OVERPAY · carry suffix · LATE/ABSENT null)
S2.7|R5|M|R|[pure] payrollAccrualDay (8 vectors: min(payDay, last day of P) · leap · malformed null) · paidOnOk (6 vectors)
S2.8|R3|M|R|[pure] deterministic + input not mutated (amounts · template)
S3.0|fix|C|G|[db] [control] fixture: 3 tenants · 5 books in T1 (A created first) · 1 in T2 · 1 in T3 · HR systems · owners
S3.1|R1 R2|C|R|[db] setPayrollBook(hA→A) ⇒ payrollBookOf ONE A · 4 new ledgers (6010 2120 2150 1140, isSystem, type, name) · 8 mappings → fixture codes · ensure again = no new rows · audit hr.payroll.book · manager ⇒ bookOwner
S3.2|R1|C|R|[db] move A→B (A link disabled · B enabled) · null ⇒ NONE · account-side connect of a 2nd book ⇒ hrOtherBook, rows unchanged
S3.3|R6|C|R|[db] cross-tenant: T2 book ⇒ bookNotFound, no link row · facade with foreign HR ⇒ refused · forged T2 link to a T1 HR system ignored both ways
S3.4|R1|C|R|[db] two enabled links ⇒ payrollBookOf MANY
S3.5|R2|C|R|[db] shop's own 2120 (not ours) ⇒ PAYROLL_SALARY_PAYABLE never mapped to it · accrual ⇒ MAPPING_MISSING naming "เงินเดือนค้างจ่าย"/2120 · no entry · owner maps 2121 ⇒ posts there
S3.6|R4|C|R|[db] postPayrollAccrualJV (example B amounts) on A: key hr-payroll#<id>#accrual · refType hr-payroll · GENERAL/ADJUST · day · memo · lines = B by code · repeat ⇒ same id (reused) · other book ⇒ OTHER_BOOK
S3.7|R4|C|R|[db] postPayrollPayJV: Dr 2120 / Cr 1010 · PAYMENTS/PAYMENT · repeat reused · archived / other-book finance ⇒ PAY_ACCOUNT · net 0 ⇒ entryId null
S3.8|R5|C|R|[db] facade on a CLOSED period ⇒ PERIOD_CLOSED (existing text) · before lockBeforeDate ⇒ PERIOD_LOCKED (lockedMessage) · nothing written
S4.0|dep|C|R|[db] H3.4 in base: HrPayrollRun.stepsJson + inputDigest · HrPaySource CARRY_FORWARD
S4.1|R1 R4|C|R|[db] example A via approveRun (final tx): ok · journalEntryId = accrual · accountSystemId = A · finalized · key/book/day 2031-09-30 (payDay 10-05) · lines = A
S4.2|R1|C|R|[db] example B: lines = B (advances 1140 · damages 4900 · overpay 6000 · refund Dr 4900) · H3.4 carry row DAMAGES 87,777 → 2031-10 written · carry not booked
S4.3|R1|C|R|[db] example C (leavers): lines = C incl. receivable rows · ADVANCE receivable 145,000 not booked · net-0 employee ok
S4.4|R1|C|R|[db] example D (bonus month) lines = D
S4.5|R1 R3|C|R|[db] example E on the SECOND book (link, not "first ACCOUNT"): 2 lines in B · nothing for that run in A
S4.6|R1|C|R|[db] markPaidRun: A with chosen bank (Dr 2120 / Cr 1010, PAYMENTS, day 10-05, key #pay) · D with the default pay account setting (Cr 1000) · PAID · one hr.payroll.paid each
S4.7|R1 R5|C|R|[db] pay refusals on E: no account · other book's finance ⇒ payAccount · before P / after today ⇒ payDate · closed period ⇒ periodClosed · each: APPROVED, no pay entry, no paid event
S4.8|R5|C|R|[db] reverse PAID A ⇒ 2 REVERSAL entries (of pay and of accrual) · mirrored · originals REVERSED · per-ledger net of the run = 0 · dated today · repeat ⇒ alreadyReversed, nothing new
S4.9|R5|C|R|[db] reverse APPROVED-unpaid E ⇒ exactly 1 reversal (accrual) · no pay entry
S4.10|R5|C|R|[db] today's period CLOSED in A ⇒ reversals of PAID B dated the 1st of the next month (existing rule) · nothing in the closed period
S4.11|R3|C|R|[db] book moved after approve: pay with the new book's finance ⇒ payAccount · pay/reverse land in the recorded book A · new book untouched
S4.12|R3|C|R|[db] no link: approve ok approvedNoBook · finalized · no JV · accountSystemId null · note · markPaidRun PAID no entry · reverse ok reverseNoBook (Q1)
S4.13|R3|C|R|[db] two enabled links ⇒ approve BOOK_AMBIGUOUS · run DRAFT · no entry anywhere
S4.14|R2|C|R|[db] mapping PAYROLL_SSO_PAYABLE removed ⇒ MAPPING_MISSING naming it · DRAFT · no entry · audit post_failed code · a run that needs no SSO still posts in that book
S4.15|R5|C|R|[db] accrual day in a CLOSED period ⇒ periodClosed · before lockBeforeDate ⇒ lockedMessage · DRAFT · no entry
S4.16|R4|C|R|[db] failure after the post (__failFinal) ⇒ no entry (no orphan) · DRAFT · retry ⇒ exactly one · approve again ⇒ approveNotDraft, still one
S4.17|R4|C|R|[db] 4 × approveRun ∥ ⇒ one accrual entry · 4 × markPaidRun ∥ ⇒ one PAID, one pay entry, one paid event
S4.18|R5|C|R|[db] LATER_RUN (later v2 run APPROVED) and CARRY_BOUND (carry row bound to a later draft) ⇒ fixed texts · no reversal entry · status unchanged
S4.19|R8|C|R|[db] H3.4-era run (one-step JV, accountSystemId null): reverse ⇒ 1 reversal of that JV, no hr-payroll entry · markPaidRun of such a run ⇒ PAID, no entry
S4.20|R8|C|G|[db] [control] v1 golden: v1 run in a linked shop ⇒ one-step JV (AccountManualJV · PAYMENTS · 6000/6000/1010/2100/2130 from run totals) · no hr-payroll key · markPaid posts nothing · reverse 1 reversal
S4.21|R6|C|R|[db] scoping: every hr-payroll entry/line in T1 · entry book = run.accountSystemId · T2/T3 books have none
S4.22|R1 R5|M|R|[db] audits: approve after {accountSystemId, journalEntryId} · reverse after {reversalEntryIds ×2}
S4.23|R3|C|R|[db] stored figures inconsistent (Σ lines ≠ gross) ⇒ approve INCONSISTENT · DRAFT · no entry
S4.25|Q2|C|R|[db] (ORACLE-EDIT H3.7 builder · controller ruling Q2) v1 orphan closed: a keyed v1 JV already posted for the run (approve posted, link failed) ⇒ approveRun links THAT entry (one live entry) · figures changed meanwhile ⇒ new entry linked + the stale one reversed once
S2.9|F5|C|R|[pure] (ORACLE-EDIT H3.7 fix r1 F5) refund vector F: refund of OVERPAY → Dr overpay recovery · DAMAGES → Dr 4900 · old one-step run → salary expense · unknown → 4900 + flag · rows/notes
S4.26|F1|C|R|[db] (ORACLE-EDIT fix r1 F1) approve ∥ pay: pays fired while finalize holds the lock (__inFinal) ⇒ never PAID without the pay entry · ≤ 1 pay entry · ≤ 1 paid event
S4.27|F1|C|R|[db] (ORACLE-EDIT fix r1) approve ∥ reverse: reverse fired while finalize holds the lock ⇒ REVERSED with the accrual reversed in its book (net 0) or APPROVED with the accrual live
S4.28|F2 F6|C|R|[db] (ORACLE-EDIT fix r1 F2/F6/D3) link to an inactive book ⇒ BOOK_INACTIVE · to a missing book ⇒ BOOK_MISSING (DRAFT, no entry) · owner unlink from the account side ⇒ no-book approve + last-unlink shown · legacy link with posting off ⇒ approvedOff, no entry, switch on ⇒ posts · book deactivated after approve ⇒ pay + reverse refused bookGone, reactivated ⇒ pay ok
S4.29|F3|C|R|[db] (ORACLE-EDIT fix r1 F3) manual reversal of accrual / pay / keyed v1 entries refused at the journal · accrual reversed behind HR's back ⇒ pay ENTRY_REVERSED and reverse entryReversed, nothing written
S4.30|F4|C|R|[db] (ORACLE-EDIT fix r1 F4) pay day before P ⇒ accrual dated the first day of P (period P) · pay date before P refused
S4.31|F5|C|R|[db] (ORACLE-EDIT fix r1 F5) refund vector F through approve: lines by code = F · audit flags REFUND_CLASS_UNKNOWN
S4.32|F2 F7|C|R|[db] (ORACLE-EDIT fix r1 F2/F7) non-owner connect/disconnect of HR from the account side refused (no row change) · OWNER of another tenant ⇒ bookOwner · payroll mapping saved without an owner session refused · wrong-class mapping forced in the DB ⇒ approve MAPPING_MISSING
S4.33|F8|M|R|[db] (ORACLE-EDIT fix r1 F8) markPaidRun on a PAID run ⇒ alreadyPaid text
S1.12|F1|C|R|[static] (ORACLE-EDIT fix r2 e) markPaidV2's PAID update is guarded by status APPROVED · the booked pay path posts the pay entry then updates PAID guarded by status APPROVED inside the SAME $transaction callback
S4.34|F1|C|R|[db] (ORACLE-EDIT fix r2 e · r3 5) period lock held in a raw tx ⇒ approve blocked; released ⇒ approve held at __inFinal while pay is observed waiting; released ⇒ pay runs after finalize (booked path, pay entry after the accrual, PAID) · pay ∥ pay exactly one ok / one entry / one event
S4.35|F5|C|R|[db] (ORACLE-EDIT fix r2 b · r3 3/4) give back a recovered claim: offered = next open period · past period / covered period / leaver after end period refused · REFUND PENDING with sourceRef refund:<claim>#<refund> · branch-limited requester on a unit-less employee refused · over the deducted remainder refused · member of another tenant refused · claim of a reversed run refused (+ ORACLE-EDIT H3.4-YTD · controller ruling: refused with code NO · a covered LATER run alone refuses the gap period and moves the offer past it · same branch-limited requester accepted on its own branch)
S4.24|R1|C|R|[db] (ORACLE-EDIT H3.7 builder · controller ruling H3.5/H3.6) bank file (CSV GENERIC) of a v2-accounting run = Cr "net salaries payable" of its accrual = run net · PAID D and APPROVED-unpaid F2 (accrual only) both exportable
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.7-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.7-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.pure))) skipReasons.push(`${F.pure} absent (H3.7 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") =>
  chk(id, Object.values(r).every(Boolean), exp, `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all"}${extra ? ` ${extra}` : ""}`);
// ORACLE-EDIT (H3.7 builder, merge of H3.9 · controller order): base-aware like qc-hr-h3.9 — session/hr may hold merges not pushed to origin yet; when
//   merge-base(HEAD, session/hr) descends from the origin-derived base it is the newer base (an env override wins) ◂
const BASE0 = baseRef("QC_H37_BASE");
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const BASE = !process.env.QC_H37_BASE && LOCAL_MB && LOCAL_MB !== BASE0 && (!BASE0 || commitInBase(BASE0, LOCAL_MB)) ? LOCAL_MB : BASE0;
// in-base guard: once H3.7 itself is in the base, the "diff vs base" statics (S1.1 · S1.2 hunks · S1.3 · S1.6) have nothing of H3.7 left to judge ⇒ n/a (pass, noted)
const H37_IN_BASE = !!BASE && pathInBase("src/lib/modules/hr/payroll-journal-rules.ts", BASE);
const GROUP_FAIL: string[] = [];
async function blk(ids: string[], fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    GROUP_FAIL.push(`${ids[0]}: ${errText(e)}`);
    console.log(`  💥 ${ids.join(",")}: ${errText(e)}`);
    for (const id of ids) chk(id, false, "checked", `group threw: ${errText(e).slice(0, 140)}`);
  }
}

// ═════════════════════════ static ═════════════════════════
const MARK = /HR H3\.7/;
function hunksMarked(file: string, allowRemove: boolean): { any: boolean; all: boolean; removed: number } {
  const hs = BASE ? diffHunks(BASE, file) : null;
  if (!hs) return { any: false, all: false, removed: -1 };
  const removed = hs.reduce((t, h) => t + h.removed.length, 0);
  const all = hs.every((h) => h.added.concat(h.removed).some((l) => MARK.test(l)));
  return { any: hs.length > 0, all, removed: allowRemove ? 0 : removed };
}
/** body of a top-level function `export async function name(` / `function name(` / `async function name(` up to the next line starting with "}" */
function fnBody(src: string | null, name: string): string {
  if (!src) return "";
  const m = new RegExp(`^(export )?(async )?function ${name}\\(`, "m").exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const between = (src: string | null, a: string, b: string): string => {
  if (!src) return "";
  const i = src.indexOf(a);
  const j = i < 0 ? -1 : src.indexOf(b, i);
  return i < 0 || j < 0 ? "" : src.slice(i, j);
};
const stripMarked = (s: string) => s.split("\n").filter((l) => !MARK.test(l)).join("\n");
function listChanged(dir: string): string[] {
  if (!BASE) return ["(no base)"];
  try {
    return execFileSync("git", ["diff", "--name-only", BASE, "--", dir], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return ["(git error)"];
  }
}
function runStatic(): void {
  const gl = hunksMarked(F.gl, false);
  if (H37_IN_BASE) chk("S1.1", true, "marked additive hunks", "n/a — H3.7 in base");
  else ck("S1.1", { base: !!BASE, hunks: gl.any, marked: gl.all, additive: gl.removed === 0 }, "marked additive hunks", `removed=${gl.removed}`);
  const cn = hunksMarked(F.conn, true);
  const ix = hunksMarked(F.idx, false);
  const idx = stripComments(rd(F.idx));
  const names = ["payrollBookOf", "linkPayrollBook", "ensurePayrollLedgersInTx", "postPayrollAccrualJV", "postPayrollPayJV", "payrollAccrualTemplate", "PAYROLL_ACCOUNTS"];
  const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(idx));
  ck("S1.2", { conn: H37_IN_BASE || (cn.any && cn.all), idx: H37_IN_BASE || (ix.any && ix.all && ix.removed === 0), exports: missing.length === 0 }, "marked + exports", `${missing.join(",")}${H37_IN_BASE ? " (hunks n/a — H3.7 in base)" : ""}`);
  const changed = listChanged(A_);
  // ORACLE-EDIT (H3.7 builder · fix round 1): + account/journal-v2.ts (controller authorised ONE marked additive hunk — F3) · coa.ts may also hold one
  //   marked block (first added line carries "HR H3.7", last carries "◂ HR H3.7") for the payroll-mapping guard (F7)
  const JV2 = `${A_}journal-v2.ts`;
  const allowed = new Set([F.gl, F.conn, F.idx, F.coa, JV2]);
  const nb = (ls: string[]) => ls.filter((l) => l.trim() !== "");
  const block = (h: { added: string[]; removed: string[] }) => { const a = nb(h.added); return h.removed.length === 0 && a.length > 0 && MARK.test(a[0]!) && /◂ HR H3\.7|HR H3\.7.*◂/.test(a[a.length - 1]!); };
  const coaH = changed.includes(F.coa) ? (diffHunks(BASE, F.coa) ?? []) : [];
  const coaOk = coaH.every((h) => (h.removed.length === 0 && h.added.every((l) => MARK.test(l) || /^\s*PAYROLL_[A-Z_]+: "/.test(l))) || block(h));
  const jvH = changed.includes(JV2) ? (diffHunks(BASE, JV2) ?? []) : [];
  const jvOk = jvH.length <= 1 && jvH.every((h) => h.removed.length === 0 && nb(h.added).every((l) => MARK.test(l)));
  if (H37_IN_BASE) chk("S1.3", true, "⊆ 4 files", "n/a — H3.7 in base");
  else ck("S1.3", { subset: changed.every((f) => allowed.has(f)), coa: coaOk, journalV2: jvOk, some: [F.gl, F.conn, F.idx].some((f) => changed.includes(f)) }, "⊆ 4 files", changed.join(","));
  const hrFiles = srcFiles("src/lib/modules/hr").filter((f) => /\.(ts|tsx)$/.test(f));
  const badImp: string[] = [];
  const badTbl: string[] = [];
  for (const f of hrFiles) {
    const s = rd(f);
    // ORACLE-EDIT (H3.7 builder, merge of H3.6): the H3.6 brief-prescribed deep imports allowlisted per file exactly as fitness F2.2 (hr-H3.6 notes item 8) — any other deep import stays illegal
    const DEEP_OK: Record<string, string[]> = { "src/lib/modules/hr/filings/cert.ts": ["@/lib/modules/account/totals", "@/lib/modules/account/doc-numbering"], "src/lib/modules/hr/filings/service.ts": ["@/lib/modules/account/doc-numbering"], "src/lib/modules/hr/filings/cert-pdf.tsx": ["@/lib/modules/account/public-doc-pdf"] };
    for (const i of importsOf(s)) if (/modules\/account|\.\.\/account/.test(i.spec) && i.spec !== "@/lib/modules/account" && !(DEEP_OK[f] ?? []).includes(i.spec)) badImp.push(`${f}:${i.spec}`);
    if (/\.(accountJournalEntry|accountJournalLine|accountLedger|accountMapping|accountSystemLink|accountPeriod|accountFinance|accountSettings)\b|"Account(JournalEntry|JournalLine|Ledger|Mapping|SystemLink|Period|Finance|Settings)"/.test(stripComments(s))) badTbl.push(f);
  }
  ck("S1.4", { imports: badImp.length === 0, tables: badTbl.length === 0 }, "facade only", `${badImp.join(",")} ${badTbl.join(",")}`);
  const pure = rd(F.pure);
  const pImps = importsOf(pure);
  const pBody = stripComments(pure);
  ck("S1.5", {
    exists: pure.length > 0, imports: pImps.every((i) => i.type), noDb: !/prisma|tenantDb|@\/lib\/core\/db/.test(pBody), noClock: !/Date\.now\(|new Date\(\s*\)|Math\.random|randomUUID|performance\.now/.test(pBody),
  }, "pure", pImps.map((i) => i.spec).join(","));
  const migNow = existsSync(join(ROOT, "prisma/migrations")) ? readdirSync(join(ROOT, "prisma/migrations")) : [];
  const migChanged = migNow.length ? listChanged("prisma/migrations") : ["(no migrations dir)"];
  const schemaChanged = listChanged("prisma/schema");
  if (H37_IN_BASE) chk("S1.6", true, "no migration", "n/a — H3.7 in base");
  else ck("S1.6", { mig: migChanged.length === 0, schema: schemaChanged.length === 0 }, "no migration", `${migChanged.join(",")} ${schemaChanged.join(",")}`);
  const pb = BASE ? fileAt(BASE, F.payroll) : null;
  const pn = rd(F.payroll);
  const gb = BASE ? fileAt(BASE, F.gl) : null;
  const gn = rd(F.gl);
  const mpB = fnBody(pb, "markPaid");
  const apB = stripMarked(between(pb, "export async function approveRun(", "\n// ── กลับรายการเงินเดือน"));
  const apN = stripMarked(between(pn, "export async function approveRun(", "\n// ── กลับรายการเงินเดือน"));
  const frozen = ["postPayrollJV", "reverseEntry", "reverseFor", "commitEntry", "resolveLine", "ensureAccounting", "postManualJV"].filter((n) => !fnBody(gb, n) || fnBody(gb, n) !== fnBody(gn, n));
  // ORACLE-EDIT (H3.7 fix r1 F8): v1 approveRun may carry exactly ONE marked line, byte-exact (the posting-key shadow of postPayrollJV — Q2)
  const V1_LINE = "    const postPayrollJV = (c: { tenantId: string; systemId: string }, i: Parameters<typeof postPayrollV1KeyedJV>[2]) => postPayrollV1KeyedJV(c, runId, i); // HR H3.7 ▸ Q2: JV รุ่น 1 มีคีย์กันซ้ำ (refId = รอบ) — ผูกไม่สำเร็จแล้วกดใหม่ = ผูกรายการเดิม ไม่ลงซ้ำ (ปิด JV กำพร้า) ◂";
  const apMarked = between(pn, "export async function approveRun(", "\n// ── กลับรายการเงินเดือน").split("\n").filter((l) => MARK.test(l));
  ck("S1.7", { v1Pin: apMarked.length === 1 && apMarked[0] === V1_LINE, markPaid: !!mpB && mpB === fnBody(pn, "markPaid"), approveV1: !!apB && apB === apN, gl: frozen.length === 0 }, "frozen", frozen.join(","));
  const hay = [F.payroll, F.gl, F.conn, F.pure].map(rd).join("\n");
  const absent = (TX_NEW()).filter((k) => !T[k]!.split(/\{\w+\}/).every((seg) => hay.includes(seg)));
  chk("S1.8", absent.length === 0 && hay.length > 0, "all new texts", absent.join(",") || "ok");
  const uiFiles = [...srcFiles("src/lib/modules/hr"), ...(existsSync(join(ROOT, "src/app/app/sys/[id]/hr")) ? srcFiles("src/app/app/sys/[id]/hr") : [])].filter((f) => /\.tsx$/.test(f));
  const ui = uiFiles.map(rd).join("\n");
  const ids = ["hr-pay-book", "hr-pay-account", "hr-markpaid-account", "hr-markpaid-date"].filter((t) => !ui.includes(`"${t}"`));
  chk("S1.10", ids.length === 0, "4 testids", ids.join(",") || "ok");
  const card = between(rd(F.conn), 'kind: "HR"', "},");
  const exp = ["markPaidRun", "setPayrollBook", "setPayrollPayAccount"].filter((n) => !new RegExp(`export async function ${n}\\(`).test(pn));
  // ORACLE-EDIT (fix r2 e): PAID only from APPROVED, in the same tx as the pay entry
  {
    const mpv2 = fnBody(pn, "markPaidV2");
    const booked = fnBody(pn, "markPaidBookedH37");
    const iPost = booked.indexOf("postPayrollPayJV(");
    const iUpd = booked.indexOf(`UPDATE "HrPayrollRun" SET "status" = 'PAID'`);
    const iTx = booked.indexOf(".$transaction(");
    const iEnd = booked.indexOf("}, H34_TX)");
    ck("S1.12", {
      v2Guard: /updateMany\(\{ where: \{[^}]*status: "APPROVED" \}, data: \{ status: "PAID" \}/.test(mpv2),
      // ORACLE-EDIT (fix r3 6): the book is re-read under the row lock BEFORE the PAID update (F1)
      v2BookReread: (() => { const i = mpv2.indexOf(`SELECT "accountSystemId" AS "a" FROM "HrPayrollRun"`); const j = mpv2.indexOf("updateMany({ where:"); return i > 0 && j > i && /return "BOOKED" as const/.test(mpv2.slice(i, j)); })(),
      bookedOrder: iTx > 0 && iPost > iTx && iUpd > iPost && iEnd > iUpd && /"status" = 'APPROVED'::"PayrollRunStatus"`/.test(booked.slice(iUpd, iEnd)),
    }, "conditional PAID in the posting tx");
  }
  ck("S1.11", { card: /PAYROLL_SALARY_EXPENSE/.test(card) && /PAYROLL_SALARY_PAYABLE/.test(card), exports: exp.length === 0, action: /markPaidRun\(/.test(rd(F.actions)) }, "wired", exp.join(","));
}
const TX_NEW = (): string[] => (Array.isArray(TX?.new) ? (TX.new as string[]) : []);

// ═════════════════════════ pure ═════════════════════════
type Mod = Any;
const toItems = (items: VItem[]) => items.map((i) => ({ employeeId: i.emp, grossSatang: i.grossSatang, ssoEmployeeSatang: i.ssoEmployeeSatang, ssoEmployerSatang: i.ssoEmployerSatang, whtSatang: i.whtSatang, netSatang: i.netSatang, snapshotJson: i.snapshot }));
const toBound = (b: VBound[]) => b.map((x) => ({ id: x.id, employeeId: x.emp, kind: x.kind, sourceType: x.sourceType, sourceRef: x.sourceRef, amountSatang: x.amountSatang }));
const call = (m: Mod, fn: string, ...a: unknown[]): Any => {
  if (!m || typeof m[fn] !== "function") return { __absent: fn };
  try {
    return m[fn](...a);
  } catch (e) {
    return { __threw: errText(e) };
  }
};
function runPure(PURE: Mod, ACC: Mod): void {
  const sc = vectorsSelfCheck();
  chk("S2.0", sc.length === 0, "self-consistent", sc.join(" · ") || "ok");
  const accs = ACC?.PAYROLL_ACCOUNTS;
  const want = (VEC.accounts as Any[]).map((a) => [a.key, a.code, a.type, a.label, a.ledgerName]);
  const got = Array.isArray(accs) ? accs.map((a: Any) => [a.key, a.code, a.type, a.label, a.ledgerName]) : null;
  chk("S2.1", canon(got) === canon(want), "fixture accounts", short(got, 160));
  const exs = Object.entries(VEC.examples as Record<string, Any>);
  const badA: string[] = [];
  const badR: string[] = [];
  for (const [n, ex] of exs) {
    const r = call(PURE, "accrualAmountsV2", toItems(ex.items), toBound(ex.bound));
    if (r?.ok !== true || !amountsEq(amountsFrom(r.amounts), ex.amounts as Amounts)) badA.push(`${n}:${short(r?.amounts ?? r, 80)}`);
    const rows = call(ACC, "payrollAccrualTemplate", ex.amounts);
    const notes = (VEC.template as Any[]).filter((t) => ex.amounts[t[2]] !== 0).map((t) => t[3]);
    if (!rowsEq(rowsFrom(rows), ex.rows as Row[]) || !Array.isArray(rows) || canon(rows.map((x: Any) => x.note)) !== canon(notes)) badR.push(`${n}:${short(rows, 80)}`);
  }
  chk("S2.2", badA.length === 0, "5 examples", badA.join(" · ") || "ok");
  chk("S2.3", badR.length === 0, "5 examples", badR.join(" · ") || "ok");
  {
    const r = rng(VEC.fuzz.seed);
    const bad: string[] = [];
    for (let i = 0; i < VEC.fuzz.runs; i++) {
      const x = fuzzRun(r, 1 + (i % VEC.fuzz.maxItems));
      const o = oracleAmounts(x.items, x.bound);
      if (!o.ok) {
        bad.push(`gen${i}:${o.why}`);
        break;
      }
      const b = call(PURE, "accrualAmountsV2", toItems(x.items), toBound(x.bound));
      const rows = rowsFrom(call(ACC, "payrollAccrualTemplate", o.amounts));
      const want = oracleRows(o.amounts);
      if (b?.ok !== true || !amountsEq(amountsFrom(b.amounts), o.amounts)) bad.push(`amounts#${i}`);
      else if (!rowsEq(rows, want) || sumSide(rows!, "DR") !== sumSide(rows!, "CR") || !rows!.every((x2) => Number.isSafeInteger(x2[2]) && x2[2] > 0)) bad.push(`rows#${i}`);
      if (bad.length >= 3) break;
    }
    chk("S2.4", bad.length === 0, `${VEC.fuzz.runs} runs`, bad.join(",") || "ok");
  }
  {
    const bad: string[] = [];
    for (const [n, v] of Object.entries(VEC.inconsistent as Record<string, Any>)) {
      const r = call(PURE, "accrualAmountsV2", toItems(v.items), toBound(v.bound));
      if (!(r?.ok === false && r?.code === "INCONSISTENT")) bad.push(`${n}:${short(r, 60)}`);
    }
    chk("S2.5", bad.length === 0, "7 refusals", bad.join(" · ") || "ok");
  }
  {
    const bad = (VEC.classes as [Any, string | null][]).filter(([row, want]) => oracleClass(row) !== want || call(PURE, "claimClassOf", row) !== want).map(([row]) => `${row.kind}/${row.sourceType}`);
    chk("S2.6", bad.length === 0, "12 classes", bad.join(",") || "ok");
  }
  {
    const b1 = (VEC.accrualDay as [string[], string | null][]).filter(([a, w]) => call(PURE, "payrollAccrualDay", ...a) !== w).map(([a]) => a.join("/"));
    const b2 = (VEC.paidOn as [string[], boolean][]).filter(([a, w]) => call(PURE, "paidOnOk", ...a) !== w).map(([a]) => a.join("/"));
    chk("S2.7", b1.length + b2.length === 0, "14 vectors", [...b1, ...b2].join(",") || "ok");
  }
  {
    const ex = VEC.examples.C;
    const it = toItems(ex.items);
    const bd = toBound(ex.bound);
    const before = canon([it, bd, ex.amounts]);
    const r1 = call(PURE, "accrualAmountsV2", it, bd);
    const r2 = call(PURE, "accrualAmountsV2", it, bd);
    const t1 = call(ACC, "payrollAccrualTemplate", ex.amounts);
    const t2 = call(ACC, "payrollAccrualTemplate", ex.amounts);
    ck("S2.8", { ok: r1?.ok === true, same: canon(r1) === canon(r2) && canon(t1) === canon(t2) && Array.isArray(t1), untouched: canon([it, bd, ex.amounts]) === before }, "pure");
  }
  // ORACLE-EDIT (H3.7 fix r1 F5): refund vector F
  {
    const F5 = VEC.refundVector;
    const o = oracleAmounts(F5.items, F5.bound, F5.claims);
    const b = call(PURE, "accrualAmountsV2", toItems(F5.items), toBound(F5.bound), F5.claims);
    const rows = rowsFrom(call(ACC, "payrollAccrualTemplate", F5.amounts));
    const byCode = (rows ?? []).map(([k, sd, n]) => [codeOfKey(k), sd, n]);
    ck("S2.9", {
      oracle: o.ok && amountsEq(o.amounts, F5.amounts as Amounts), builder: b?.ok === true && amountsEq(amountsFrom(b.amounts), F5.amounts as Amounts), flag: canon(b?.flags) === canon(F5.flags),
      rows: canon(byCode) === canon(F5.byCode) && sumSide(rows ?? [], "DR") === F5.total && sumSide(rows ?? [], "CR") === F5.total,
    }, "refund classes", short({ b: b?.amounts ?? b, byCode }, 200));
  }
}

// ═════════════════════════ db ═════════════════════════
let crashed = "";
const { P, coreHash } = await qc4Env(SUITE);
const tag = tagOf(String(Date.now()));
const SLUG = `${SLUG_PREFIX}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const PURE = await loadOpt(F.pure, "@/lib/modules/hr/payroll-journal-rules");
const ACC = (await import("@/lib/modules/account" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const CONN = (await import("@/lib/modules/account/connections" as string).catch(() => null)) as Any;
const POLICY = (await import("@/lib/modules/account/policy" as string).catch(() => null)) as Any;
const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const SYS = (await import("@/lib/modules/system/service" as string)) as Any;
const BANK = (await import("@/lib/modules/hr/bank-files/service" as string).catch(() => null)) as Any; // ORACLE-EDIT (H3.7 builder): S4.24 bank file total
const HRSVC = (await import("@/lib/modules/hr/service" as string)) as Any;
console.log(`modules: pure ${modState(PURE, F.pure)} · account ${ACC?.__err ? ACC.__err : "loaded"}`);

const NOW = new Date("2032-01-10T05:00:00.000Z");
const has = (m: Mod, ...fns: string[]) => fns.filter((f) => typeof m?.[f] !== "function");
const rows = async (sql: string, ...p: unknown[]): Promise<Any[]> => ((await fx.rawRows(sql, ...p)) ?? []) as Any[];
const ledgerCodes = new Map<string, string>();
async function codeOf(accountId: string): Promise<string> {
  if (!ledgerCodes.has(accountId)) ledgerCodes.set(accountId, ((await P.accountLedger.findUnique({ where: { id: accountId }, select: { code: true } }))?.code ?? "?") as string);
  return ledgerCodes.get(accountId)!;
}
async function linesOf(entryId: string | null | undefined): Promise<Row[]> {
  if (!entryId) return [];
  const ls = (await P.accountJournalLine.findMany({ where: { entryId } })) as Any[];
  const out: Row[] = [];
  for (const l of ls) out.push([await codeOf(l.accountId), l.debit > 0 ? "DR" : "CR", l.debit > 0 ? l.debit : l.credit]);
  return out;
}
const msEq = (a: Row[], b: Row[]) => canon([...a].map((r) => r.join("|")).sort()) === canon([...b].map((r) => r.join("|")).sort());
const entriesOfRun = (runId: string) => P.accountJournalEntry.findMany({ where: { refId: runId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
const keyEntry = (runId: string, ev: string) => P.accountJournalEntry.findFirst({ where: { idempotencyKey: `hr-payroll#${runId}#${ev}` } }) as Promise<Any>;
const runOf = async (id: string): Promise<Any> => (await rows(`SELECT id, status::text AS status, "journalEntryId", "accountSystemId", note, "stepsJson" FROM "HrPayrollRun" WHERE id = $1`, id))[0];
const fin = (r: Any) => r?.stepsJson?.finalized === true;
const paidEvents = (runId: string) => P.outboxEvent.count({ where: { idempotencyKey: `hr.payroll.paid#${runId}` } }) as Promise<number>;
const netByCode = async (runId: string): Promise<Record<string, number>> => {
  const m: Record<string, number> = {};
  for (const e of await entriesOfRun(runId)) for (const [c, s, n] of await linesOf(e.id)) m[c] = (m[c] ?? 0) + (s === "DR" ? n : -n);
  return m;
};

async function runDb(): Promise<void> {
  // ── S3.0 fixture ──
  const T1 = await fx.newTenant("-a", `QC H37 A ${tag}`);
  const T2 = await fx.newTenant("-b", `QC H37 B ${tag}`);
  const T3 = await fx.newTenant("-c", `QC H37 C ${tag}`);
  const own1 = await fx.mkUser(T1, "own1", `QC37 owner ${tag}`, "OWNER", [], {});
  const mgr1 = await fx.mkUser(T1, "mgr1", `QC37 manager ${tag}`, "MANAGER", [], {});
  const own2 = await fx.mkUser(T2, "own2", `QC37 owner2 ${tag}`, "OWNER", [], {});
  const actor = { userId: own1.id, isOwner: true };
  const book = async (t: string, n: string) => (await SYS.createSystem(t, "ACCOUNT", `${n} ${tag}`)).id as string;
  const BA = await book(T1, "บัญชี A");
  const BB = await book(T1, "บัญชี B");
  const BF = await book(T1, "บัญชี F");
  const BL = await book(T1, "บัญชี L");
  const BD = await book(T1, "บัญชี D");
  const BC = await book(T2, "บัญชี C");
  const BV = await book(T3, "บัญชี V");
  const hr = async (t: string, n: string) => (await SYS.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const HS: Record<string, string> = {};
  for (const n of ["hA", "hB", "hC", "hD", "hE", "hN", "hM", "hX", "hX2", "hX3", "hX4", "hL", "hL2", "hO1", "hO2", "hMv", "hF", "hF2", "hLk", "hDD", "hT", "hT2"]) HS[n] = await hr(T1, n);
  const h3 = await hr(T2, "h3");
  const hv = await hr(T3, "hv");
  const c1 = (h: string) => ({ tenantId: T1, systemId: HS[h]! });
  chk("S3.0", !!BA && !!BB && !!BC && !!BV && Object.keys(HS).length === 22 && !!h3 && !!hv, "fixture", "ok");

  const H34 = (await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HrPayrollRun' AND column_name IN ('stepsJson','inputDigest')`)).length === 2
    && (await rows(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'HrPaySource' AND e.enumlabel = 'CARRY_FORWARD'`)).length === 1;
  const fxMissing = has(PAY, "setPayrollBook", "setPayrollPayAccount", "markPaidRun");
  const accMissing = has(ACC, "payrollBookOf", "linkPayrollBook", "ensurePayrollLedgersInTx", "postPayrollAccrualJV", "postPayrollPayJV");
  const link = async (h: string, acc: string | null) => PAY.setPayrollBook(c1(h), vOf(own1), { accountSystemId: acc });

  // ── S3 facade ──
  await blk(["S3.1"], async () => {
    if (fxMissing.length || accMissing.length) throw new Error(`absent: ${[...fxMissing, ...accMissing].join(",")}`);
    const r = await link("hA", BA);
    const one = await ACC.payrollBookOf(T1, HS.hA);
    const leds = (await P.accountLedger.findMany({ where: { systemId: BA } })) as Any[];
    const newOk = (VEC.accounts as Any[]).filter((a) => a.isNew).every((a) => leds.some((l) => l.code === a.code && l.type === a.type && l.isSystem === true && l.name === a.ledgerName));
    const maps = (await P.accountMapping.findMany({ where: { systemId: BA, key: { startsWith: "PAYROLL_" } } })) as Any[];
    const mapOk = maps.length === 8 && (await Promise.all(maps.map(async (m) => (await codeOf(m.accountId)) === codeOfKey(m.key)))).every(Boolean);
    const n0 = [await P.accountLedger.count({ where: { systemId: BA } }), await P.accountMapping.count({ where: { systemId: BA } })];
    await P.$transaction((tx: Any) => ACC.ensurePayrollLedgersInTx({ tenantId: T1, systemId: BA }, tx));
    const n1 = [await P.accountLedger.count({ where: { systemId: BA } }), await P.accountMapping.count({ where: { systemId: BA } })];
    const audit = await P.auditLog.count({ where: { tenantId: T1, action: "hr.payroll.book" } });
    const mgr = await PAY.setPayrollBook(c1("hB"), vOf(mgr1), { accountSystemId: BA });
    ck("S3.1", { ok: r?.ok === true, one: one?.kind === "ONE" && one?.systemId === BA, newLedgers: newOk, maps: mapOk, idem: canon(n0) === canon(n1), audit: audit >= 1, mgr: mgr?.ok === false && mgr?.reason === T.bookOwner }, "linked", short({ one, maps: maps.length, n0, n1 }, 160));
    for (const h of ["hB", "hC", "hD", "hX", "hX2", "hX3", "hX4", "hL", "hL2", "hO1", "hO2", "hMv", "hM"]) await link(h, BA);
    await link("hE", BB);
    await link("hF", BF);
    await link("hF2", BF);
    await link("hLk", BL);
  });
  await blk(["S3.2"], async () => {
    if (fxMissing.length || accMissing.length) throw new Error("absent");
    await link("hT", BA);
    const mv = await link("hT", BB);
    const ls = (await P.accountSystemLink.findMany({ where: { linkedKind: "HR", linkedId: HS.hT } })) as Any[];
    const moved = ls.some((l) => l.systemId === BA && l.enabled === false) && ls.some((l) => l.systemId === BB && l.enabled === true) && ls.filter((l) => l.enabled).length === 1;
    const oneB = await ACC.payrollBookOf(T1, HS.hT);
    await link("hT", null);
    const none = await ACC.payrollBookOf(T1, HS.hT);
    await link("hT", BA);
    const before = canon(((await P.accountSystemLink.findMany({ where: { linkedKind: "HR", linkedId: HS.hT }, orderBy: { systemId: "asc" } })) as Any[]).map((l) => [l.systemId, l.enabled]));
    const cr = await CONN.connect({ tenantId: T1, systemId: BB }, "HR", HS.hT, own1.id);
    const after = canon(((await P.accountSystemLink.findMany({ where: { linkedKind: "HR", linkedId: HS.hT }, orderBy: { systemId: "asc" } })) as Any[]).map((l) => [l.systemId, l.enabled]));
    ck("S3.2", { move: mv?.ok === true && moved, oneB: oneB?.kind === "ONE" && oneB?.systemId === BB, none: none?.kind === "NONE", other: cr?.ok === false && cr?.reason === T.hrOtherBook, unchanged: before === after }, "moved", short({ cr, before, after }, 160));
  });
  await blk(["S3.3"], async () => {
    if (fxMissing.length || accMissing.length) throw new Error("absent");
    const r = await link("hT2", BC);
    const lk = await P.accountSystemLink.count({ where: { linkedKind: "HR", linkedId: HS.hT2 } });
    const f = await ACC.linkPayrollBook({ tenantId: T2, hrSystemId: HS.hT2, accountSystemId: BC, actorUserId: own2.id });
    await P.accountSystemLink.create({ data: { tenantId: T2, systemId: BC, linkedKind: "HR", linkedId: HS.hN, enabled: true, config: {} } });
    const a1 = await ACC.payrollBookOf(T1, HS.hN);
    const a2 = await ACC.payrollBookOf(T2, HS.hN);
    const lk2 = await P.accountSystemLink.count({ where: { linkedKind: "HR", linkedId: HS.hT2 } });
    ck("S3.3", { refused: r?.ok === false && r?.reason === T.bookNotFound, noRow: lk === 0 && lk2 === 0, facade: f?.ok === false, ignoredT1: a1?.kind === "NONE", ignoredT2: a2?.kind === "NONE" }, "isolated", short({ r, f, a1, a2 }, 160));
  });
  await blk(["S3.4"], async () => {
    if (accMissing.length) throw new Error("absent");
    await P.accountSystemLink.create({ data: { tenantId: T1, systemId: BB, linkedKind: "HR", linkedId: HS.hM, enabled: true, config: {} } });
    const m = await ACC.payrollBookOf(T1, HS.hM);
    chk("S3.4", m?.kind === "MANY", "MANY", short(m));
  });
  // finance accounts (after the books were seeded by the link)
  const ledgerId = async (sys: string, code: string) => ((await P.accountLedger.findFirst({ where: { systemId: sys, code } }))?.id ?? null) as string | null;
  const mkFin = async (sys: string, type: string, name: string, code: string, archived = false) =>
    (await P.accountFinance.create({ data: { tenantId: T1, systemId: sys, type, name: `${name} ${tag}`, ledgerAccountId: await ledgerId(sys, code), ...(archived ? { archivedAt: new Date() } : {}) } })).id as string;
  let finBankA = "", finCashA = "", finArchA = "", finBankB = "";
  await blk(["S3.5", "S3.6", "S3.7", "S3.8"], async () => {
    if (fxMissing.length || accMissing.length) throw new Error(`absent: ${[...fxMissing, ...accMissing].join(",")}`);
    finBankA = await mkFin(BA, "BANK", "ธนาคาร A", "1010");
    finCashA = await mkFin(BA, "CASH", "เงินสด A", "1000");
    finArchA = await mkFin(BA, "BANK", "ปิดแล้ว A", "1010", true);
    finBankB = await mkFin(BB, "BANK", "ธนาคาร B", "1010");
    const ctxOf = (s: string) => ({ tenantId: T1, systemId: s });
    const post = (s: string, input: Any) => P.$transaction((tx: Any) => ACC.postPayrollAccrualJV(ctxOf(s), input, tx), { timeout: 60_000, maxWait: 20_000 });
    const pay = (s: string, input: Any) => P.$transaction((tx: Any) => ACC.postPayrollPayJV(ctxOf(s), input, tx), { timeout: 60_000, maxWait: 20_000 });
    // S3.5 shop's own 2120
    {
      await P.accountLedger.create({ data: { tenantId: T1, systemId: BD, code: "2120", name: "เงินกู้ยืมกรรมการ", type: "LIABILITY", cashflowActivity: "OPERATING", isSystem: false } });
      const r = await link("hDD", BD);
      const m = await P.accountMapping.findFirst({ where: { systemId: BD, key: "PAYROLL_SALARY_PAYABLE" } });
      const others = await P.accountMapping.count({ where: { systemId: BD, key: { startsWith: "PAYROLL_" } } });
      const runId = `qc37fac${tag}D`;
      const p1 = await post(BD, { runId, periodKey: "2031-09", day: "2031-09-30", amounts: VEC.examples.A.amounts });
      const n1 = await P.accountJournalEntry.count({ where: { refId: runId } });
      const l2121 = (await P.accountLedger.create({ data: { tenantId: T1, systemId: BD, code: "2121", name: `ค้างจ่ายเงินเดือน ${tag}`, type: "LIABILITY", cashflowActivity: "OPERATING", isSystem: false } })).id as string;
      await P.accountMapping.create({ data: { tenantId: T1, systemId: BD, key: "PAYROLL_SALARY_PAYABLE", accountId: l2121 } });
      const p2 = await post(BD, { runId, periodKey: "2031-09", day: "2031-09-30", amounts: VEC.examples.A.amounts });
      const ls = await linesOf(p2?.entryId);
      ck("S3.5", {
        linked: r?.ok === true, notMapped: !m && others === 7, missing: p1?.ok === false && p1?.code === "MAPPING_MISSING" && p1?.text === fill(T.mappingMissing, { name: "เงินเดือนค้างจ่าย", code: "2120" }), none: n1 === 0,
        fixed: p2?.ok === true && ls.some((x) => x[0] === "2121" && x[1] === "CR" && x[2] === 4_321_042),
      }, "never the shop's 2120", short({ p1, p2 }, 200));
    }
    // S3.6
    {
      const runId = `qc37fac${tag}A`;
      const ex = VEC.examples.B;
      const p1 = await post(BA, { runId, periodKey: "2031-09", day: "2031-09-30", amounts: ex.amounts, postedById: own1.id });
      const e = p1?.entryId ? await P.accountJournalEntry.findUnique({ where: { id: p1.entryId } }) : null;
      const p2 = await post(BA, { runId, periodKey: "2031-09", day: "2031-09-30", amounts: ex.amounts });
      const pOther = await post(BB, { runId, periodKey: "2031-09", day: "2031-09-30", amounts: ex.amounts });
      const n = await P.accountJournalEntry.count({ where: { idempotencyKey: `hr-payroll#${runId}#accrual` } });
      ck("S3.6", {
        ok: p1?.ok === true && p1?.reused === false, key: e?.idempotencyKey === `hr-payroll#${runId}#accrual` && e?.refType === "hr-payroll" && e?.refId === runId,
        kind: e?.book === "GENERAL" && e?.journal === "ADJUST" && e?.source === "AUTO", day: bkkDay(e?.date) === "2031-09-30" && e?.periodKey === "2031-09",
        memo: e?.memo === fill(T.accrualMemo, { p: "2031-09" }), lines: msEq(await linesOf(e?.id), ex.byCode), reused: p2?.ok === true && p2?.entryId === p1?.entryId && p2?.reused === true,
        other: pOther?.ok === false && pOther?.code === "OTHER_BOOK" && pOther?.text === T.otherBook, one: n === 1,
      }, "posted once", short({ p1, p2, pOther }, 200));
    }
    // S3.7
    {
      const runId = `qc37fac${tag}A`;
      const q1 = await pay(BA, { runId, periodKey: "2031-09", day: "2031-10-05", netSatang: 1_483_507, financeAccountId: finBankA });
      const e = q1?.entryId ? await P.accountJournalEntry.findUnique({ where: { id: q1.entryId } }) : null;
      const q2 = await pay(BA, { runId, periodKey: "2031-09", day: "2031-10-05", netSatang: 1_483_507, financeAccountId: finBankA });
      const z = `qc37fac${tag}Z`;
      const qa = await pay(BA, { runId: z, periodKey: "2031-09", day: "2031-10-05", netSatang: 100, financeAccountId: finArchA });
      const qb = await pay(BA, { runId: z, periodKey: "2031-09", day: "2031-10-05", netSatang: 100, financeAccountId: finBankB });
      const q0 = await pay(BA, { runId: `qc37fac${tag}N`, periodKey: "2031-09", day: "2031-10-05", netSatang: 0, financeAccountId: finBankA });
      const nz = await P.accountJournalEntry.count({ where: { refId: { in: [z, `qc37fac${tag}N`] } } });
      ck("S3.7", {
        ok: q1?.ok === true && e?.idempotencyKey === `hr-payroll#${runId}#pay` && e?.book === "PAYMENTS" && e?.journal === "PAYMENT" && bkkDay(e?.date) === "2031-10-05",
        memo: e?.memo === fill(T.payMemo, { p: "2031-09" }), lines: msEq(await linesOf(e?.id), [["2120", "DR", 1_483_507], ["1010", "CR", 1_483_507]]),
        reused: q2?.ok === true && q2?.entryId === q1?.entryId, arch: qa?.ok === false && qa?.code === "PAY_ACCOUNT" && qa?.text === T.payAccount,
        otherBook: qb?.ok === false && qb?.code === "PAY_ACCOUNT", zero: q0?.ok === true && q0?.entryId === null, nothing: nz === 0,
      }, "pay JV", short({ q1, qa, qb, q0 }, 200));
    }
    // S3.8
    {
      await P.accountPeriod.create({ data: { tenantId: T1, systemId: BL, periodKey: "2031-04", status: "CLOSED" } });
      const lock = new Date("2031-10-01T05:00:00.000Z");
      await P.accountSettings.upsert({ where: { systemId: BL }, create: { tenantId: T1, systemId: BL, lockBeforeDate: lock }, update: { lockBeforeDate: lock } });
      const c = await post(BL, { runId: `qc37fac${tag}L1`, periodKey: "2031-04", day: "2031-04-30", amounts: VEC.examples.E.amounts });
      const l = await post(BL, { runId: `qc37fac${tag}L2`, periodKey: "2031-09", day: "2031-09-30", amounts: VEC.examples.E.amounts });
      const n = await P.accountJournalEntry.count({ where: { refId: { in: [`qc37fac${tag}L1`, `qc37fac${tag}L2`] } } });
      ck("S3.8", {
        closed: c?.ok === false && c?.code === "PERIOD_CLOSED" && c?.text === fill(T.periodClosed, { p: "2031-04" }),
        locked: l?.ok === false && l?.code === "PERIOD_LOCKED" && l?.text === POLICY?.lockedMessage?.(lock), none: n === 0,
      }, "refused", short({ c, l }, 200));
    }
  });

  // ── S4 integration ──
  chk("S4.0", H34, "stepsJson + inputDigest + CARRY_FORWARD", H34 ? "present" : "H3.4 not in base");
  const emps = new Map<string, string>();
  async function insRun(h: string, ex: Any, o: { periodKey?: string; payDay?: string; status?: string; label: string; steps?: Any; journalEntryId?: string | null; items?: VItem[]; bound?: VBound[] }): Promise<string> {
    const ctx = c1(h);
    const runId = `qc37${tag}${o.label}`;
    const items: VItem[] = o.items ?? ex.items;
    const bound: VBound[] = o.bound ?? ex.bound;
    const idOf = (sym: string) => (bound.some((b) => b.id === sym) ? `${runId}_${sym}` : sym);
    for (const it of items) {
      const k = `${h}:${it.emp}`;
      if (!emps.has(k)) emps.set(k, await fx.mkEmp(T1, ctx.systemId, `QC37 ${it.emp} ${h} ${tag}`, it.endDate ? { endDate: it.endDate } : {}));
    }
    const pk = o.periodKey ?? ex.periodKey;
    const payDay = o.payDay ?? ex.payDay;
    const sum = (f: keyof VItem) => items.reduce((t, i) => t + Number(i[f] ?? 0), 0);
    await P.$executeRawUnsafe(
      `INSERT INTO "HrPayrollRun" ("id","tenantId","systemId","periodKey","payDate","status","totalGrossSatang","totalSsoEmployeeSatang","totalSsoEmployerSatang","totalWhtSatang","totalNetSatang","totalAddSatang","totalDeductSatang","engineVersion","createdById","approvedById","approvedAt","stepsJson","inputDigest","journalEntryId","note")
       VALUES ($1,$2,$3,$4,$5::timestamp,$6::"PayrollRunStatus",$7,$8,$9,$10,$11,$12,$13,2,$14,$15,$16::timestamp,$17::jsonb,$18,$19,'qc')`,
      runId, T1, ctx.systemId, pk, `${payDay} 00:00:00`, o.status ?? "APPROVED", sum("grossSatang"), sum("ssoEmployeeSatang"), sum("ssoEmployerSatang"), sum("whtSatang"), sum("netSatang"), sum("addSatang"), sum("deductSatang"),
      mgr1.id, (o.status ?? "APPROVED") === "DRAFT" ? null : own1.id, (o.status ?? "APPROVED") === "DRAFT" ? null : "2031-09-01 00:00:00", JSON.stringify(o.steps ?? {}), `qc37-${runId}`, o.journalEntryId ?? null,
    );
    for (const b of bound)
      await P.$executeRawUnsafe(
        `INSERT INTO "HrPayAdjustment" ("id","tenantId","systemId","employeeId","periodKey","kind","amountSatang","status","sourceType","sourceRef","runId","requestedById","decidedById","decidedAt")
         VALUES ($1,$2,$3,$4,$5,$6::"HrPayItemKind",$7,'APPROVED'::"HrPayItemStatus",$8::"HrPaySource",$9,$10,$11,$11,now())`,
        idOf(b.id), T1, ctx.systemId, emps.get(`${h}:${b.emp}`), pk, b.kind, b.amountSatang, b.sourceType, b.sourceRef?.replace("PREVRUN", `${runId}prev`).replace(`:${b.emp}:`, `:${emps.get(`${h}:${b.emp}`)}:`) ?? null, runId, own1.id,
      );
    for (const it of items) {
      const snap = { ...it.snapshot, lines: (it.snapshot.lines ?? []).map((l: Any) => ({ ...l, ref: idOf(l.ref) })) };
      if (!Array.isArray(it.snapshot.lines)) delete (snap as Any).lines;
      await P.$executeRawUnsafe(
        `INSERT INTO "HrPayrollItem" ("id","tenantId","systemId","runId","employeeId","grossSatang","ssoBaseSatang","ssoEmployeeSatang","ssoEmployerSatang","whtSatang","netSatang","addSatang","deductSatang","snapshotJson")
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        `${runId}_${it.emp}`, T1, ctx.systemId, runId, emps.get(`${h}:${it.emp}`), it.grossSatang, it.ssoEmployeeSatang, it.ssoEmployerSatang, it.whtSatang, it.netSatang, it.addSatang ?? 0, it.deductSatang ?? 0, JSON.stringify(snap),
      );
    }
    return runId;
  }
  const approve = (h: string, runId: string, hooks?: Any) => (hooks ? PAY.approveRun(c1(h), runId, undefined, actor, hooks) : PAY.approveRun(c1(h), runId, undefined, actor)).catch((e: unknown) => ({ ok: false, note: `threw ${errText(e)}` }));
  const payRun = (h: string, runId: string, opts: Any) => (typeof PAY.markPaidRun === "function" ? PAY.markPaidRun(c1(h), runId, { now: NOW, actor, ...opts }) : Promise.resolve({ ok: false, note: "∅ markPaidRun" })).catch((e: unknown) => ({ ok: false, note: `threw ${errText(e)}` }));
  const reverse = (h: string, runId: string) => PAY.reverseRun(c1(h), runId, "qc h3.7", actor).catch((e: unknown) => ({ ok: false, note: `threw ${errText(e)}` }));
  const S4 = ["S4.1", "S4.2", "S4.3", "S4.4", "S4.5", "S4.6", "S4.7", "S4.8", "S4.9", "S4.10", "S4.11", "S4.12", "S4.13", "S4.14", "S4.15", "S4.16", "S4.17", "S4.18", "S4.19", "S4.21", "S4.22", "S4.23", "S4.24"]; // ORACLE-EDIT (H3.7 builder): + S4.24
  const R: Record<string, string> = {};
  const exampleCheck = async (id: string, h: string, name: string, bookId: string, extra: (runId: string, e: Any) => Promise<Record<string, unknown>> = async () => ({})) => {
    const ex = VEC.examples[name];
    const runId = await insRun(h, ex, { label: name });
    R[name] = runId;
    const r = await approve(h, runId);
    const run = await runOf(runId);
    const e = await keyEntry(runId, "accrual");
    const n = (await entriesOfRun(runId)).length;
    ck(id, {
      ok: r?.ok === true && r?.note === T.approvedPosted, link: !!e && run?.journalEntryId === e.id && run?.accountSystemId === bookId && fin(run) && run?.status === "APPROVED",
      entry: e?.systemId === bookId && e?.tenantId === T1 && e?.refType === "hr-payroll" && e?.book === "GENERAL" && e?.journal === "ADJUST" && bkkDay(e?.date) === ex.accrualDay && e?.periodKey === ex.periodKey,
      lines: msEq(await linesOf(e?.id), ex.byCode), one: n === 1, ...(await extra(runId, e)),
    }, `example ${name}`, short({ r, acct: run?.accountSystemId, n }, 160));
  };
  const s4ok = H34 && !fxMissing.length && !accMissing.length;
  await blk(S4, async () => {
    if (!s4ok) throw new Error(!H34 ? "H3.4 not in base (no stepsJson/inputDigest/CARRY_FORWARD)" : `absent: ${[...fxMissing, ...accMissing].join(",")}`);
    await exampleCheck("S4.1", "hA", "A", BA);
    await exampleCheck("S4.2", "hB", "B", BA, async (runId) => {
      const cf = await rows(`SELECT kind::text AS k, "amountSatang" AS a, "periodKey" AS p, "sourceRef" AS r FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD' AND "sourceRef" LIKE $2`, HS.hB, `cf:${runId}:%`);
      const lines = (await Promise.all((await entriesOfRun(runId)).map((x: Any) => linesOf(x.id)))).flat();
      return { carry: cf.length === 1 && cf[0].k === "DEDUCTION" && Number(cf[0].a) === 87_777 && cf[0].p === "2031-10" && String(cf[0].r).endsWith(":DAMAGES"), notBooked: !lines.some((l) => l[2] === 87_777) };
    });
    await exampleCheck("S4.3", "hC", "C", BA, async (runId) => ({ advRecvNotBooked: !(await Promise.all((await entriesOfRun(runId)).map((x: Any) => linesOf(x.id)))).flat().some((l) => l[2] === 145_000) }));
    await exampleCheck("S4.4", "hD", "D", BA);
    await exampleCheck("S4.5", "hE", "E", BB, async (runId) => ({ notInA: (await P.accountJournalEntry.count({ where: { refId: runId, systemId: BA } })) === 0 }));
    // S4.6 pay
    {
      const pa = await payRun("hA", R.A!, { financeAccountId: finBankA, paidOn: "2031-10-05" });
      const ea = await keyEntry(R.A!, "pay");
      const sp = await PAY.setPayrollPayAccount(c1("hD"), vOf(own1), { financeAccountId: finCashA });
      const pd = await payRun("hD", R.D!, { paidOn: "2031-12-26" });
      const ed = await keyEntry(R.D!, "pay");
      const pb = await payRun("hB", R.B!, { financeAccountId: finBankA, paidOn: "2031-09-30" });
      ck("S4.6", {
        a: pa?.ok === true && pa?.note === T.paidOk && (await runOf(R.A!))?.status === "PAID", ea: ea?.systemId === BA && ea?.book === "PAYMENTS" && ea?.journal === "PAYMENT" && bkkDay(ea?.date) === "2031-10-05" && msEq(await linesOf(ea?.id), VEC.examples.A.pay),
        setting: sp?.ok === true, d: pd?.ok === true && msEq(await linesOf(ed?.id), VEC.examples.D.pay) && bkkDay(ed?.date) === "2031-12-26", b: pb?.ok === true,
        events: (await paidEvents(R.A!)) === 1 && (await paidEvents(R.D!)) === 1,
      }, "paid", short({ pa, sp, pd, pb }, 200));
    }
    // S4.7 pay refusals on E (book B)
    {
      const tries = [
        [await payRun("hE", R.E!, { paidOn: "2031-09-30" }), T.payAccount],
        [await payRun("hE", R.E!, { financeAccountId: finBankA, paidOn: "2031-09-30" }), T.payAccount],
        [await payRun("hE", R.E!, { financeAccountId: finBankB, paidOn: "2031-08-31" }), T.payDate],
        [await payRun("hE", R.E!, { financeAccountId: finBankB, paidOn: "2032-01-11" }), T.payDate],
      ] as [Any, string][];
      await P.accountPeriod.create({ data: { tenantId: T1, systemId: BB, periodKey: "2031-10", status: "CLOSED" } });
      tries.push([await payRun("hE", R.E!, { financeAccountId: finBankB, paidOn: "2031-10-01" }), fill(T.periodClosed, { p: "2031-10" })]);
      const bad = tries.map(([r, t], i) => (r?.ok === false && r?.note === t ? "" : `#${i}:${short(r, 60)}`)).filter(Boolean);
      ck("S4.7", { texts: bad.length === 0, approved: (await runOf(R.E!))?.status === "APPROVED", noPay: !(await keyEntry(R.E!, "pay")), noEvent: (await paidEvents(R.E!)) === 0 }, "5 refusals", bad.join(" "));
    }
    // S4.8 reverse PAID A
    {
      const acc = await keyEntry(R.A!, "accrual");
      const pe = await keyEntry(R.A!, "pay");
      const rv = await reverse("hA", R.A!);
      const revs = (await P.accountJournalEntry.findMany({ where: { reversalOfId: { in: [acc?.id ?? "∅", pe?.id ?? "∅"] } } })) as Any[];
      const mirrored = (await Promise.all(revs.map(async (x) => msEq(await linesOf(x.id), (await linesOf(x.reversalOfId)).map(([c, s, n]) => [c, s === "DR" ? "CR" : "DR", n] as Row))))).every(Boolean);
      const orig = (await P.accountJournalEntry.findMany({ where: { id: { in: [acc?.id ?? "∅", pe?.id ?? "∅"] } } })) as Any[];
      const net = await netByCode(R.A!);
      const today = bkkDay(new Date());
      const n0 = (await entriesOfRun(R.A!)).length;
      const again = await reverse("hA", R.A!);
      ck("S4.8", {
        ok: rv?.ok === true && rv?.note === T.reverseOk && (await runOf(R.A!))?.status === "REVERSED", two: revs.length === 2 && revs.every((x) => x.journal === "REVERSAL" && x.systemId === BA), mirrored,
        orig: orig.length === 2 && orig.every((x) => x.status === "REVERSED"), zero: Object.values(net).every((v) => v === 0) && Object.keys(net).length >= 5, dated: revs.every((x) => bkkDay(x.date) === today),
        again: again?.ok === false && again?.note === T.alreadyReversed && (await entriesOfRun(R.A!)).length === n0,
      }, "symmetric", short({ rv, net }, 200));
    }
    // S4.9 reverse unpaid E
    {
      const acc = await keyEntry(R.E!, "accrual");
      const rv = await reverse("hE", R.E!);
      const revs = (await P.accountJournalEntry.findMany({ where: { refId: R.E!, journal: "REVERSAL" } })) as Any[];
      ck("S4.9", { ok: rv?.ok === true, one: revs.length === 1 && revs[0].reversalOfId === acc?.id && revs[0].systemId === BB, noPay: !(await keyEntry(R.E!, "pay")) }, "1 reversal", short(rv));
    }
    // S4.11 book moved after approve
    {
      const runId = await insRun("hMv", VEC.examples.A, { label: "Mv" });
      const a = await approve("hMv", runId);
      const mv = await link("hMv", BB);
      const p1 = await payRun("hMv", runId, { financeAccountId: finBankB, paidOn: "2031-10-05" });
      const p2 = await payRun("hMv", runId, { financeAccountId: finBankA, paidOn: "2031-10-05" });
      const rv = await reverse("hMv", runId);
      const inA = await P.accountJournalEntry.count({ where: { refId: runId, systemId: BA } });
      const inB = await P.accountJournalEntry.count({ where: { refId: runId, systemId: BB } });
      ck("S4.11", { approved: a?.ok === true, moved: mv?.ok === true, refuseNew: p1?.ok === false && p1?.note === T.payAccount, paid: p2?.ok === true, reversed: rv?.ok === true, inA: inA === 4, inB: inB === 0 }, "recorded book", short({ p1, p2, inA, inB }, 160));
    }
    // S4.12 no link
    {
      const runId = await insRun("hN", VEC.examples.E, { label: "N" });
      const a = await approve("hN", runId);
      const run = await runOf(runId);
      const p = await payRun("hN", runId, { paidOn: "2031-09-30" });
      const rv = await reverse("hN", runId);
      const any = await P.accountJournalEntry.count({ where: { refId: runId } });
      ck("S4.12", {
        approve: a?.ok === true && a?.note === T.approvedNoBook, row: !run?.journalEntryId && !run?.accountSystemId && fin(run) && run?.note === T.noteNoBook, paid: p?.ok === true,
        reverse: rv?.ok === true && rv?.note === T.reverseNoBook && (await runOf(runId))?.status === "REVERSED", none: any === 0,
      }, "no accounting", short({ a, p, rv }, 200));
    }
    // S4.13 MANY
    {
      const runId = await insRun("hM", VEC.examples.E, { label: "M" });
      const a = await approve("hM", runId);
      ck("S4.13", { refused: a?.ok === false && a?.code === "BOOK_AMBIGUOUS" && a?.note === T.bookAmbiguous, draft: (await runOf(runId))?.status === "DRAFT", none: (await P.accountJournalEntry.count({ where: { refId: runId } })) === 0 }, "ambiguous", short(a));
    }
    // S4.14 mapping missing
    {
      await P.accountMapping.deleteMany({ where: { systemId: BF, key: "PAYROLL_SSO_PAYABLE" } });
      const runId = await insRun("hF", VEC.examples.A, { label: "F" });
      const a = await approve("hF", runId);
      const au = (await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.payroll.post_failed", targetId: runId } })) as Any[];
      const run2 = await insRun("hF2", VEC.examples.E, { label: "F2" });
      R.F2 = run2; // ORACLE-EDIT (H3.7 builder): S4.24 reads this APPROVED-unpaid (accrual-only) run
      const b = await approve("hF2", run2);
      ck("S4.14", {
        refused: a?.ok === false && a?.code === "MAPPING_MISSING" && a?.note === fill(T.mappingMissing, { name: "เงินสมทบประกันสังคมค้างนำส่ง", code: "2150" }), draft: (await runOf(runId))?.status === "DRAFT",
        none: (await P.accountJournalEntry.count({ where: { refId: runId } })) === 0, audit: au.some((x) => x.after?.code === "MAPPING_MISSING"), noSsoPosts: b?.ok === true && !!(await keyEntry(run2, "accrual")),
      }, "named refusal", short({ a, b }, 200));
    }
    // S4.15 closed / locked accrual day
    {
      await P.accountPeriod.create({ data: { tenantId: T1, systemId: BA, periodKey: "2031-03", status: "CLOSED" } });
      const r1 = await insRun("hX", VEC.examples.A, { label: "X1", periodKey: "2031-03", payDay: "2031-03-31" });
      const a = await approve("hX", r1);
      const r2 = await insRun("hLk", VEC.examples.A, { label: "Lk" });
      const b = await approve("hLk", r2);
      const lock = (await P.accountSettings.findUnique({ where: { systemId: BL } }))?.lockBeforeDate;
      ck("S4.15", {
        closed: a?.ok === false && a?.code === "PERIOD_CLOSED" && a?.note === fill(T.periodClosed, { p: "2031-03" }), locked: b?.ok === false && b?.code === "PERIOD_LOCKED" && !!lock && b?.note === POLICY?.lockedMessage?.(lock),
        draft: (await runOf(r1))?.status === "DRAFT" && (await runOf(r2))?.status === "DRAFT", none: (await P.accountJournalEntry.count({ where: { refId: { in: [r1, r2] } } })) === 0,
      }, "refused", short({ a, b }, 200));
    }
    // S4.16 failure after the post ⇒ no orphan · retry once
    {
      const runId = await insRun("hX2", VEC.examples.A, { label: "X2", periodKey: "2031-05", payDay: "2031-05-31" });
      const f = await approve("hX2", runId, { __failFinal: true });
      const n0 = await P.accountJournalEntry.count({ where: { refId: runId } });
      const st0 = (await runOf(runId))?.status;
      await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET status = 'APPROVED'::"PayrollRunStatus", "approvedById" = $2, "approvedAt" = now() WHERE id = $1`, runId, own1.id);
      const a = await approve("hX2", runId);
      const b = await approve("hX2", runId);
      const n = await P.accountJournalEntry.count({ where: { refId: runId } });
      ck("S4.16", { failed: f?.ok === false && n0 === 0 && st0 === "DRAFT", retry: a?.ok === true, again: b?.ok === false && b?.note === T.approveNotDraft, one: n === 1 }, "no orphan, once", short({ f, a, b, n0, n }, 200));
    }
    // S4.17 races
    {
      const runId = await insRun("hX3", VEC.examples.A, { label: "X3", periodKey: "2031-06", payDay: "2031-06-30" });
      const res = await Promise.all([0, 1, 2, 3].map(() => approve("hX3", runId)));
      const n1 = await P.accountJournalEntry.count({ where: { idempotencyKey: `hr-payroll#${runId}#accrual` } });
      const pays = await Promise.all([0, 1, 2, 3].map(() => payRun("hX3", runId, { financeAccountId: finBankA, paidOn: "2031-06-30" })));
      const n2 = await P.accountJournalEntry.count({ where: { idempotencyKey: `hr-payroll#${runId}#pay` } });
      const run = await runOf(runId);
      ck("S4.17", { approveOne: res.some((x: Any) => x?.ok) && n1 === 1 && fin(run), payOne: pays.filter((x: Any) => x?.ok).length === 1 && n2 === 1 && run?.status === "PAID", event: (await paidEvents(runId)) === 1 }, "exactly once", `${res.map((x: Any) => x?.ok).join(",")} · ${pays.map((x: Any) => x?.ok).join(",")} n1=${n1} n2=${n2}`);
    }
    // S4.18 LATER_RUN · CARRY_BOUND
    {
      const l1 = await insRun("hL", VEC.examples.A, { label: "L1", periodKey: "2031-07", payDay: "2031-07-31" });
      await approve("hL", l1);
      await payRun("hL", l1, { financeAccountId: finBankA, paidOn: "2031-07-31" });
      const l2 = await insRun("hL", VEC.examples.A, { label: "L2", periodKey: "2031-08", payDay: "2031-08-31" });
      await approve("hL", l2);
      const r1 = await reverse("hL", l1);
      const k1 = await insRun("hL2", VEC.examples.B, { label: "K1" });
      await approve("hL2", k1);
      const k2 = await insRun("hL2", VEC.examples.E, { label: "K2", periodKey: "2031-10", payDay: "2031-10-31", status: "DRAFT", bound: [], items: VEC.examples.E.items });
      await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "runId" = $1 WHERE "systemId" = $2 AND "sourceRef" LIKE $3`, k2, HS.hL2, `cf:${k1}:%`);
      const r2 = await reverse("hL2", k1);
      const revs = await P.accountJournalEntry.count({ where: { refId: { in: [l1, k1] }, journal: "REVERSAL" } });
      ck("S4.18", {
        later: r1?.ok === false && r1?.note === T.laterRun && (await runOf(l1))?.status === "PAID", carry: r2?.ok === false && r2?.note === T.carryBound && (await runOf(k1))?.status === "APPROVED", none: revs === 0,
      }, "refused", short({ r1, r2 }, 200));
    }
    // S4.19 H3.4-era runs
    {
      const jv = (await ACC.postPayrollJV({ tenantId: T1, systemId: BA }, { payDate: new Date("2031-07-31T05:00:00Z"), periodKey: "2031-07", grossSatang: 1_200_000, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 1_200_000 })).entryId as string;
      const o1 = await insRun("hO1", VEC.examples.E, { label: "O1", periodKey: "2031-07", payDay: "2031-07-31", status: "PAID", steps: { finalized: true }, journalEntryId: jv });
      const rv = await reverse("hO1", o1);
      const revs = await P.accountJournalEntry.count({ where: { reversalOfId: jv } });
      const jv2 = (await ACC.postPayrollJV({ tenantId: T1, systemId: BA }, { payDate: new Date("2031-07-31T05:00:00Z"), periodKey: "2031-07", grossSatang: 1_200_000, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 1_200_000 })).entryId as string;
      const o2 = await insRun("hO2", VEC.examples.E, { label: "O2", periodKey: "2031-07", payDay: "2031-07-31", status: "APPROVED", steps: { finalized: true }, journalEntryId: jv2 });
      const before = await P.accountJournalEntry.count({ where: { systemId: BA } });
      const p = await payRun("hO2", o2, { financeAccountId: finBankA, paidOn: "2031-07-31" });
      const after = await P.accountJournalEntry.count({ where: { systemId: BA } });
      const keys = await P.accountJournalEntry.count({ where: { idempotencyKey: { startsWith: `hr-payroll#${o1}` } } }) + (await P.accountJournalEntry.count({ where: { idempotencyKey: { startsWith: `hr-payroll#${o2}` } } }));
      ck("S4.19", { reversed: rv?.ok === true && revs === 1, paid: p?.ok === true && (await runOf(o2))?.status === "PAID" && after === before, noKeys: keys === 0 }, "old way", short({ rv, p, before, after }, 160));
    }
    // S4.23 inconsistent
    {
      const v = VEC.inconsistent.I1_sum_ne_gross;
      const runId = await insRun("hX4", null, { label: "X4", periodKey: "2031-09", payDay: "2031-09-30", items: v.items, bound: v.bound });
      const a = await approve("hX4", runId);
      ck("S4.23", { refused: a?.ok === false && a?.code === "INCONSISTENT" && a?.note === T.inconsistent, draft: (await runOf(runId))?.status === "DRAFT", none: (await P.accountJournalEntry.count({ where: { refId: runId } })) === 0 }, "refused", short(a));
    }
    // ORACLE-EDIT (H3.7 builder · controller ruling): S4.24 bank file total = Cr 2120 of the accrual = run net (H3.5 status rules unchanged for accrual-only runs)
    {
      const bad: string[] = [];
      for (const [h, name, runId] of [["hD", "D", R.D!], ["hF2", "E", R.F2!]] as const) {
        for (const it of VEC.examples[name].items as VItem[]) await P.hrEmployee.update({ where: { id: emps.get(`${h}:${it.emp}`)! }, data: { bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `QC37 ${it.emp}` } });
        const pv = BANK?.previewBankFile ? await BANK.previewBankFile(c1(h), vOf(own1), { runId, format: "CSV", presetId: "GENERIC" }, { now: NOW }).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: false, reason: "∅ bank-files" };
        const cr2120 = (await linesOf((await keyEntry(runId, "accrual"))?.id)).filter((l) => l[0] === "2120" && l[1] === "CR").reduce((t, l) => t + l[2], 0);
        const net = (VEC.examples[name].items as VItem[]).reduce((t, i) => t + i.netSatang, 0);
        const st = (await runOf(runId))?.status;
        if (!(pv?.ok === true && pv.totalSatang === cr2120 && cr2120 === net && pv.runNetSatang === net && pv.itemCount === (VEC.examples[name].items as VItem[]).length)) bad.push(`${name}/${st}:${short({ pv: pv?.ok ? [pv.totalSatang, pv.runNetSatang, pv.itemCount] : pv, cr2120, net }, 120)}`);
      }
      chk("S4.24", bad.length === 0, "bank total = Cr 2120 = net (PAID + APPROVED-unpaid)", bad.join(" · ") || "ok");
    }
    // S4.10 today's period closed ⇒ reversals in the next open period (book A · PAID B)
    {
      const today = bkkDay(new Date()).slice(0, 7);
      const [y, m] = today.split("-").map(Number);
      const next = `${m === 12 ? y! + 1 : y}-${String(m === 12 ? 1 : m! + 1).padStart(2, "0")}`;
      await P.accountPeriod.upsert({ where: { systemId_periodKey: { systemId: BA, periodKey: today } }, create: { tenantId: T1, systemId: BA, periodKey: today, status: "CLOSED" }, update: { status: "CLOSED" } }).catch(async () => {
        await P.accountPeriod.updateMany({ where: { systemId: BA, periodKey: today }, data: { status: "CLOSED" } });
      });
      const rv = await reverse("hB", R.B!);
      const revs = (await P.accountJournalEntry.findMany({ where: { refId: R.B!, journal: "REVERSAL" } })) as Any[];
      ck("S4.10", { ok: rv?.ok === true, two: revs.length === 2, next: revs.every((x) => x.periodKey === next && bkkDay(x.date) === `${next}-01`) }, `dated ${next}-01`, short(revs.map((x) => [x.periodKey, bkkDay(x.date)])));
    }
    // S4.21 scoping
    {
      const all = (await P.accountJournalEntry.findMany({ where: { refType: "hr-payroll", tenantId: { in: [T1, T2, T3] } } })) as Any[];
      const realRuns = all.filter((e) => String(e.refId).startsWith(`qc37${tag}`));
      const runBook = new Map<string, string | null>();
      for (const e of realRuns) if (!runBook.has(e.refId)) runBook.set(e.refId, (await runOf(e.refId))?.accountSystemId ?? null);
      const linesBad = await P.accountJournalLine.count({ where: { entryId: { in: all.map((e) => e.id) }, NOT: { tenantId: T1 } } });
      ck("S4.21", {
        tenant: all.length > 0 && all.every((e) => e.tenantId === T1), book: realRuns.every((e) => e.systemId === runBook.get(e.refId)), lines: linesBad === 0,
        others: (await P.accountJournalEntry.count({ where: { systemId: { in: [BC, BV] }, refType: "hr-payroll" } })) === 0,
      }, "scoped", `entries=${all.length}`);
    }
    // S4.22 audits
    {
      const ap = (await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.payroll.approve", targetId: R.A! } })) as Any[];
      const rv = (await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.payroll.reverse", targetId: R.A! } })) as Any[];
      const acc = await keyEntry(R.A!, "accrual");
      ck("S4.22", { approve: ap.some((x) => x.after?.accountSystemId === BA && x.after?.journalEntryId === acc?.id), reverse: rv.some((x) => Array.isArray(x.after?.reversalEntryIds) && x.after.reversalEntryIds.length === 2) }, "audited", short([ap[0]?.after, rv[0]?.after], 200));
    }
  });

  // ── S4.20 v1 golden (control — base behaviour) ──
  await blk(["S4.20"], async () => {
    await P.accountSystemLink.create({ data: { tenantId: T3, systemId: BV, linkedKind: "HR", linkedId: hv, enabled: true, config: {} } });
    const ctx = { tenantId: T3, systemId: hv };
    const e1 = await HRSVC.createEmployee(ctx, { name: `QC37 v1a ${tag}` });
    const e2 = await HRSVC.createEmployee(ctx, { name: `QC37 v1b ${tag}` });
    fx.names.push(`QC37 v1a ${tag}`, `QC37 v1b ${tag}`);
    await PAY.setSalaryProfile(ctx, { employeeId: e1.id, baseSalarySatang: 3_000_000 });
    await PAY.setSalaryProfile(ctx, { employeeId: e2.id, baseSalarySatang: 1_500_000 });
    const run = await PAY.createPayrollRun(ctx, { periodKey: "2031-06", payDate: new Date("2031-06-25T05:00:00Z") });
    const a = await PAY.approveRun(ctx, run.id);
    const r = (await rows(`SELECT "journalEntryId" AS j, "accountSystemId" AS acc, "totalGrossSatang" AS g, "totalSsoEmployeeSatang" AS se, "totalSsoEmployerSatang" AS sr, "totalWhtSatang" AS w, "totalNetSatang" AS n FROM "HrPayrollRun" WHERE id = $1`, run.id))[0];
    const e = r?.j ? await P.accountJournalEntry.findUnique({ where: { id: r.j } }) : null;
    const want: Row[] = ([["6000", "DR", Number(r?.g)], ["6000", "DR", Number(r?.sr)], ["1010", "CR", Number(r?.n)], ["2100", "CR", Number(r?.se) + Number(r?.sr)], ["2130", "CR", Number(r?.w)]] as Row[]).filter((x) => x[2] !== 0);
    const lines = await linesOf(e?.id);
    const keys = await P.accountJournalEntry.count({ where: { tenantId: T3, refType: "hr-payroll" } });
    const n0 = await P.accountJournalEntry.count({ where: { systemId: BV } });
    const mp = await PAY.markPaid(ctx, run.id);
    const n1 = await P.accountJournalEntry.count({ where: { systemId: BV } });
    const rv = await PAY.reverseRun(ctx, run.id, "qc v1");
    const revs = e ? await P.accountJournalEntry.count({ where: { reversalOfId: e.id } }) : -1;
    ck("S4.20", {
      approve: a?.ok === true, oneStep: e?.refType === "AccountManualJV" && e?.book === "PAYMENTS" && e?.systemId === BV && msEq(lines, want), noAcct: !r?.acc, noKey: keys === 0,
      paidNoPost: mp?.ok === true && n1 === n0, reversed: rv?.ok === true && revs === 1,
    }, "v1 unchanged", short({ a, lines, want, mp, rv }, 240));
  });

  // ── S4.25 v1 orphan (ORACLE-EDIT H3.7 builder · controller ruling Q2) ──
  await blk(["S4.25"], async () => {
    if (typeof ACC.postPayrollV1KeyedJV !== "function") throw new Error("absent: postPayrollV1KeyedJV");
    const ctx = { tenantId: T3, systemId: hv };
    const book = { tenantId: T3, systemId: BV };
    const totals = async (id: string) => (await rows(`SELECT "payDate" AS d, "periodKey" AS p, "totalGrossSatang" AS g, "totalSsoEmployeeSatang" AS se, "totalSsoEmployerSatang" AS sr, "totalWhtSatang" AS w, "totalNetSatang" AS n, "journalEntryId" AS j FROM "HrPayrollRun" WHERE id = $1`, id))[0];
    const inputOf = (t: Any, bump = 0) => ({ payDate: new Date(t.d), periodKey: t.p, grossSatang: Number(t.g) + bump, ssoEmployeeSatang: Number(t.se), ssoEmployerSatang: Number(t.sr), whtSatang: Number(t.w), netSatang: Number(t.n) + bump });
    const live = async (id: string) => P.accountJournalEntry.count({ where: { refId: id, status: "POSTED", reversalOfId: null } });
    // (a) same figures: the earlier approve posted, then the link failed (run back to DRAFT, no journalEntryId)
    const ra = await PAY.createPayrollRun(ctx, { periodKey: "2031-07", payDate: new Date("2031-07-25T05:00:00Z") });
    const ta = await totals(ra.id);
    const orphanA = (await ACC.postPayrollV1KeyedJV(book, ra.id, inputOf(ta))).entryId as string;
    const aa = await PAY.approveRun(ctx, ra.id);
    const linkA = (await totals(ra.id))?.j;
    // (b) figures changed between the failed link and the retry (draft recomputed) ⇒ the stale entry is reversed, the new one linked
    const rb = await PAY.createPayrollRun(ctx, { periodKey: "2031-08", payDate: new Date("2031-08-25T05:00:00Z") });
    const tb = await totals(rb.id);
    const orphanB = (await ACC.postPayrollV1KeyedJV(book, rb.id, inputOf(tb, 100))).entryId as string;
    const ab = await PAY.approveRun(ctx, rb.id);
    const linkB = (await totals(rb.id))?.j;
    const staleRev = await P.accountJournalEntry.count({ where: { reversalOfId: orphanB } });
    const linesB = await linesOf(linkB);
    ck("S4.25", {
      a: aa?.ok === true && linkA === orphanA && (await live(ra.id)) === 1, b: ab?.ok === true && !!linkB && linkB !== orphanB && staleRev === 1 && (await live(rb.id)) === 1,
      bFigures: linesB.some((l) => l[0] === "1010" && l[1] === "CR" && l[2] === Number(tb.n)), refType: (await P.accountJournalEntry.count({ where: { tenantId: T3, refType: "hr-payroll" } })) === 0,
    }, "one live entry, linked", short({ aa, linkA, orphanA, ab, linkB, orphanB, staleRev }, 220));
  });

  // ═══════ ORACLE-EDIT (H3.7 builder · fix round 1 — reviewer/hunter coverage list) S4.26–S4.33 ═══════
  const S5 = ["S4.26", "S4.27", "S4.28", "S4.29", "S4.30", "S4.31", "S4.32", "S4.33", "S4.34", "S4.35"]; // ORACLE-EDIT fix r2: + S4.34 S4.35
  await blk(S5, async () => {
    if (!s4ok) throw new Error("S4 prerequisites absent");
    const JV2 = (await import("@/lib/modules/account/journal-v2" as string)) as Any;
    const COA = (await import("@/lib/modules/account/coa" as string)) as Any;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const newHr = async (n: string, bookId: string | null) => {
      HS[n] = await hr(T1, n);
      if (bookId) {
        const r = await link(n, bookId);
        if (r?.ok !== true) throw new Error(`link ${n}: ${short(r)}`);
      }
      return HS[n]!;
    };
    const payEntries = (runId: string) => P.accountJournalEntry.count({ where: { idempotencyKey: `hr-payroll#${runId}#pay` } });
    // S4.26 approve ∥ pay
    {
      await newHr("hP1", BA);
      const id = await insRun("hP1", VEC.examples.A, { label: "P1" });
      let pays: Promise<Any>[] = [];
      const a = await approve("hP1", id, {
        __inFinal: async () => {
          pays = [
            ...[0, 1].map(() => payRun("hP1", id, { financeAccountId: finBankA, paidOn: "2031-10-05" })),
            ...[0, 1].map(() => PAY.markPaid(c1("hP1"), id).catch((e: unknown) => ({ ok: false, note: errText(e) }))),
          ];
          await sleep(1500);
        },
      });
      const res = await Promise.all(pays);
      const run = await runOf(id);
      const pe = await payEntries(id);
      ck("S4.26", { approved: a?.ok === true, fired: res.length === 4, neverPaidWithout: run?.status !== "PAID" || pe === 1, onePay: pe <= 1, events: (await paidEvents(id)) <= 1 && ((await paidEvents(id)) === 1) === (run?.status === "PAID") },
        "no PAID without pay entry", short({ st: run?.status, pe, res: res.map((x: Any) => x?.ok ? "ok" : String(x?.note ?? "").slice(0, 20)) }, 220));
    }
    // S4.27 approve ∥ reverse
    {
      await newHr("hP2", BA);
      const id = await insRun("hP2", VEC.examples.A, { label: "P2" });
      let revs: Promise<Any>[] = [];
      const a = await approve("hP2", id, { __inFinal: async () => { revs = [0, 1].map(() => reverse("hP2", id)); await sleep(1500); } });
      const res = await Promise.all(revs);
      const run = await runOf(id);
      const acc = await keyEntry(id, "accrual");
      const revN = acc ? await P.accountJournalEntry.count({ where: { reversalOfId: acc.id, systemId: BA } }) : -1;
      const net = await netByCode(id);
      const okState = run?.status === "REVERSED" ? acc?.status === "REVERSED" && revN === 1 && Object.values(net).every((v) => v === 0) : run?.status === "APPROVED" && acc?.status === "POSTED" && revN === 0;
      ck("S4.27", { approved: a?.ok === true, state: okState, oneOk: res.filter((x: Any) => x?.ok).length <= 1 }, "consistent", short({ st: run?.status, revN, res: res.map((x: Any) => x?.ok ? "ok" : String(x?.note ?? "").slice(0, 24)) }, 220));
    }
    // S4.28 book inactive / missing / unlinked / posting off / deactivated after approve
    {
      const BX = await book(T1, "บัญชี X");
      await newHr("hD1", BX);
      await P.appSystem.update({ where: { id: BX }, data: { active: false } });
      const r1 = await insRun("hD1", VEC.examples.E, { label: "D1" });
      const a1 = await approve("hD1", r1);
      const hD2 = await newHr("hD2", null);
      await P.accountSystemLink.create({ data: { tenantId: T1, systemId: `qc37ghost${tag}`, linkedKind: "HR", linkedId: hD2, enabled: true, config: { autoPost: true } } });
      const r2 = await insRun("hD2", VEC.examples.E, { label: "D2" });
      const a2 = await approve("hD2", r2);
      const hD3 = await newHr("hD3", BA);
      const un = await CONN.disconnect({ tenantId: T1, systemId: BA }, "HR", hD3, own1.id);
      const r3 = await insRun("hD3", VEC.examples.E, { label: "D3" });
      const a3 = await approve("hD3", r3);
      const acct3 = await PAY.getPayrollAccounting(c1("hD3"));
      const hD4 = await newHr("hD4", null);
      await P.accountSystemLink.create({ data: { tenantId: T1, systemId: BA, linkedKind: "HR", linkedId: hD4, enabled: true, config: {} } });
      // ORACLE-EDIT (fix r2 a — controller ruling): a legacy link (config {}) = posting ON · OFF only when the owner stored autoPost false
      const screen4 = await PAY.getPayrollAccounting(c1("hD4"));
      const r4 = await insRun("hD4", VEC.examples.E, { label: "D4" });
      const a4 = await approve("hD4", r4);
      const p4 = await payRun("hD4", r4, { financeAccountId: finBankA, paidOn: "2031-09-30" });
      const sw = await PAY.setPayrollPosting(c1("hD4"), vOf(own1), { on: false });
      const cfg4 = ((await P.accountSystemLink.findFirst({ where: { systemId: BA, linkedKind: "HR", linkedId: hD4 } })) as Any)?.config;
      const r4b = await insRun("hD4", VEC.examples.E, { label: "D4b", periodKey: "2031-10", payDay: "2031-10-31" });
      const a4b = await approve("hD4", r4b);
      const n4b = (await runOf(r4b))?.note;
      const BY = await book(T1, "บัญชี Y");
      await newHr("hD5", BY);
      const finY = await mkFin(BY, "BANK", "ธนาคาร Y", "1010");
      const r5 = await insRun("hD5", VEC.examples.E, { label: "D5" });
      const a5 = await approve("hD5", r5);
      await P.appSystem.update({ where: { id: BY }, data: { active: false } });
      const p5 = await payRun("hD5", r5, { financeAccountId: finY, paidOn: "2031-09-30" });
      const v5 = await reverse("hD5", r5);
      const st5 = (await runOf(r5))?.status;
      const pe5 = await payEntries(r5);
      await P.appSystem.update({ where: { id: BY }, data: { active: true } });
      const p5b = await payRun("hD5", r5, { financeAccountId: finY, paidOn: "2031-09-30" });
      const none = async (r: string) => (await P.accountJournalEntry.count({ where: { refId: r } })) === 0;
      ck("S4.28", {
        inactive: a1?.ok === false && a1?.code === "BOOK_INACTIVE" && (await runOf(r1))?.status === "DRAFT" && (await none(r1)),
        missing: a2?.ok === false && a2?.code === "BOOK_MISSING" && (await runOf(r2))?.status === "DRAFT" && (await none(r2)),
        unlinked: un?.ok === true && a3?.ok === true && a3?.note === T.approvedNoBook && (await none(r3)) && acct3?.link === "NONE" && !!acct3?.lastUnlink,
        legacyOn: screen4?.link === "ONE" && a4?.ok === true && a4?.note === T.approvedPosted && !!(await keyEntry(r4, "accrual")) && p4?.ok === true && !!(await keyEntry(r4, "pay")),
        explicitOff: sw?.ok === true && cfg4?.autoPost === false && a4b?.ok === true && (await none(r4b)) && !!n4b && n4b !== T.noteNoBook && (await PAY.getPayrollAccounting(c1("hD4")))?.link === "OFF",
        gone: a5?.ok === true && p5?.ok === false && p5?.code === "BOOK_GONE" && v5?.ok === false && v5?.note === p5?.note && st5 === "APPROVED" && pe5 === 0 && p5b?.ok === true,
      }, "book states", short({ a1, a2, a3: a3?.note, un, acct3: acct3?.link, a4: a4?.note, p4: p4?.note, cfg4, a4b: a4b?.note, p5, v5: v5?.note, p5b: p5b?.note, st5 }, 1200));
    }
    // S4.29 manual reversal refused · reversed behind HR's back
    {
      await newHr("hM1", BA);
      const id = await insRun("hM1", VEC.examples.A, { label: "M1" });
      await approve("hM1", id);
      const acc = await keyEntry(id, "accrual");
      const mj = await JV2.reverseJournalEntry({ tenantId: T1, systemId: BA }, acc?.id ?? "∅", "ทดสอบกลับมือ");
      const v1e = (await rows(`SELECT "journalEntryId" AS j FROM "HrPayrollRun" WHERE "tenantId" = $1 AND "journalEntryId" IS NOT NULL ORDER BY "createdAt" LIMIT 1`, T3))[0]?.j;
      const mv1 = await JV2.reverseJournalEntry({ tenantId: T3, systemId: BV }, v1e ?? "∅", "ทดสอบกลับมือ");
      await ACC.reverseEntry({ tenantId: T1, systemId: BA }, acc?.id, "สมมุติกลับจากระบบบัญชี");
      const n0 = (await entriesOfRun(id)).length;
      const p = await payRun("hM1", id, { financeAccountId: finBankA, paidOn: "2031-10-05" });
      const v = await reverse("hM1", id);
      ck("S4.29", {
        manual: mj?.ok === false && /เงินเดือน/.test(String(mj?.reason)), manualV1: mv1?.ok === false && /เงินเดือน/.test(String(mv1?.reason)),
        pay: p?.ok === false && p?.code === "ENTRY_REVERSED", reverse: v?.ok === false && v?.note === p?.note, untouched: (await entriesOfRun(id)).length === n0 && (await runOf(id))?.status === "APPROVED",
      }, "refused", short({ mj, mv1, p, v }, 300));
    }
    // S4.30 pay day before P
    {
      await newHr("hD6", BA);
      const id = await insRun("hD6", VEC.examples.A, { label: "D6", periodKey: "2031-09", payDay: "2031-08-25" });
      const a = await approve("hD6", id);
      const e = await keyEntry(id, "accrual");
      const p = await payRun("hD6", id, { financeAccountId: finBankA, paidOn: "2031-08-25" });
      ck("S4.30", { approved: a?.ok === true, day: bkkDay(e?.date) === "2031-09-01" && e?.periodKey === "2031-09", payBefore: p?.ok === false && p?.note === T.payDate }, "clamped", short({ d: bkkDay(e?.date), p: e?.periodKey, pay: p }, 200));
    }
    // S4.31 refund vector F through approve
    {
      const F5 = VEC.refundVector;
      await newHr("hR1", BA);
      const prevB = await insRun("hR1", VEC.examples.E, { label: "R0b", periodKey: "2031-07", payDay: "2031-07-31" });
      await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "accountSystemId" = $2, "stepsJson" = '{"finalized": true}'::jsonb, status = 'PAID'::"PayrollRunStatus" WHERE id = $1`, prevB, BA);
      const prevO = await insRun("hR1", VEC.examples.E, { label: "R0o", periodKey: "2031-08", payDay: "2031-08-31" });
      await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "stepsJson" = '{"finalized": true}'::jsonb, status = 'PAID'::"PayrollRunStatus" WHERE id = $1`, prevO);
      const emp = emps.get("hR1:e1")!;
      for (const c of F5.claims as Any[])
        await P.$executeRawUnsafe(`INSERT INTO "HrPayAdjustment" ("id","tenantId","systemId","employeeId","periodKey","kind","amountSatang","status","sourceType","runId","requestedById","decidedById","decidedAt") VALUES ($1,$2,$3,$4,'2031-07','DEDUCTION'::"HrPayItemKind",1000,'APPROVED'::"HrPayItemStatus",$5::"HrPaySource",$6,$7,$7,now())`,
          `qc37${tag}${c.id}`, T1, HS.hR1, emp, c.sourceType, c.booked ? prevB : prevO, own1.id);
      const items = (F5.items as VItem[]).map((i) => ({ ...i, emp: "e1" }));
      const bound = (F5.bound as VBound[]).map((b) => ({ ...b, emp: "e1", sourceRef: b.sourceRef ? b.sourceRef.replace(/^refund:/, `refund:qc37${tag}`) : null }));
      const id = await insRun("hR1", null, { label: "R1", periodKey: "2031-09", payDay: "2031-09-30", items, bound });
      const a = await approve("hR1", id);
      const e = await keyEntry(id, "accrual");
      const au = (await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.payroll.approve", targetId: id } })) as Any[];
      ck("S4.31", { approved: a?.ok === true, lines: msEq(await linesOf(e?.id), F5.byCode), flag: au.some((x) => canon(x.after?.flags) === canon(F5.flags)) }, "refund classes posted", short({ a, l: await linesOf(e?.id) }, 260));
    }
    // S4.32 owner-only linking (both sides) · mapping guard
    {
      const hO = await newHr("hO3", null);
      const c = await CONN.connect({ tenantId: T1, systemId: BB }, "HR", hO, mgr1.id);
      const rowsAfter = await P.accountSystemLink.count({ where: { linkedKind: "HR", linkedId: hO } });
      const hO4 = await newHr("hO4", BA);
      const d = await CONN.disconnect({ tenantId: T1, systemId: BA }, "HR", hO4, mgr1.id);
      const still = await ACC.payrollBookOf(T1, hO4);
      const foreign = await PAY.setPayrollBook(c1("hO3"), vOf(own2), { accountSystemId: BA });
      const l1010 = await ledgerId(BA, "1010");
      const m0 = await P.accountMapping.findFirst({ where: { systemId: BA, key: "PAYROLL_SALARY_EXPENSE" } });
      const sm = await COA.setMapping({ tenantId: T1, systemId: BA }, "PAYROLL_SALARY_EXPENSE", l1010).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
      const m1 = await P.accountMapping.findFirst({ where: { systemId: BA, key: "PAYROLL_SALARY_EXPENSE" } });
      const hW = await newHr("hW1", BF);
      await P.accountMapping.updateMany({ where: { systemId: BF, key: "PAYROLL_SALARY_EXPENSE" }, data: { accountId: (await ledgerId(BF, "1010"))! } });
      const rw = await insRun("hW1", VEC.examples.E, { label: "W1" });
      const aw = await approve("hW1", rw);
      ck("S4.32", {
        connect: c?.ok === false && rowsAfter === 0, disconnect: d?.ok === false && still?.kind === "ONE", foreign: foreign?.ok === false && foreign?.reason === T.bookOwner,
        mapping: sm?.ok === false && m1?.accountId === m0?.accountId, wrongClass: aw?.ok === false && aw?.code === "MAPPING_CLASS" && /ไม่ใช่หมวดที่ถูกต้อง/.test(String(aw?.note)) && /ค่าใช้จ่าย/.test(String(aw?.note)) && !!hW, // ORACLE-EDIT (fix r2 c): wrong class named, not "not mapped"
      }, "owner only · class guard", short({ c, d, foreign, sm, aw }, 300));
    }
    // S4.33 already paid
    {
      const p = await payRun("hA", R.A!, { financeAccountId: finBankA, paidOn: "2031-10-05" });
      const pd = await payRun("hD", R.D!, { paidOn: "2031-12-26" });
      ck("S4.33", { text: pd?.ok === false && pd?.code === "ALREADY_PAID" && !!pd?.note && pd.note !== "ต้องอนุมัติรอบก่อนจึงจ่ายได้", reversedRun: p?.ok === false }, "already paid", short({ p, pd }, 160));
    }
    // ORACLE-EDIT (fix r2 e) S4.34 deterministic races through the period advisory lock
    {
      const sysP = await newHr("hQ1", BA);
      const holdLock = (pk: string) => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let held!: () => void;
        const isHeld = new Promise<void>((r) => (held = r));
        const done = P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr:payroll:run:${sysP}:${pk}`);
          held();
          await gate;
        }, { timeout: 120_000, maxWait: 20_000 });
        return { isHeld, release, done };
      };
      const settled = (p: Promise<unknown>) => Promise.race([p.then(() => true, () => true), sleep(1200).then(() => false)]);
      // ORACLE-EDIT (fix r3 5): deterministic order — P held ⇒ approve blocked · P released ⇒ approve reaches __inFinal (holds P inside the final tx) ⇒
      //   pay started and observed waiting ⇒ finalize released ⇒ pay must run AFTER finalize: booked path, pay entry created after the accrual
      const id = await insRun("hQ1", VEC.examples.A, { label: "Q1" });
      const h1 = holdLock("2031-09");
      await h1.isHeld;
      let inFinal!: () => void;
      const reachedFinal = new Promise<void>((r) => (inFinal = r));
      let releaseFinal!: () => void;
      const finalGate = new Promise<void>((r) => (releaseFinal = r));
      const ap = approve("hQ1", id, { __inFinal: async () => { inFinal(); await finalGate; } });
      const blockedP = !(await settled(ap));
      h1.release();
      await h1.done;
      await Promise.race([reachedFinal, sleep(30_000)]);
      const py = payRun("hQ1", id, { financeAccountId: finBankA, paidOn: "2031-10-05" });
      const payWaits = !(await settled(py));
      releaseFinal();
      const [apR, pyR] = [await ap, await py];
      const blocked1 = blockedP && payWaits;
      const st1 = (await runOf(id))?.status;
      const acc1 = await P.accountJournalEntry.count({ where: { idempotencyKey: `hr-payroll#${id}#accrual` } });
      const pe1 = await payEntries(id);
      const accE = await keyEntry(id, "accrual");
      const payE = await keyEntry(id, "pay");
      const order = !!accE && !!payE && new Date(payE.createdAt).getTime() > new Date(accE.createdAt).getTime() && pyR?.ok === true && st1 === "PAID" && pe1 === 1;
      // pay ∥ pay on an approved (finalized) run
      const id2 = await insRun("hQ1", VEC.examples.A, { label: "Q2", periodKey: "2031-10", payDay: "2031-10-31" });
      await approve("hQ1", id2);
      const h2 = holdLock("2031-10");
      await h2.isHeld;
      const pays = [0, 1].map(() => payRun("hQ1", id2, { financeAccountId: finBankA, paidOn: "2031-10-31" }));
      const blocked2 = !(await settled(pays[0]!)) && !(await settled(pays[1]!));
      h2.release();
      await h2.done;
      const pr = await Promise.all(pays);
      ck("S4.34", {
        blocked: blocked1 && blocked2, approved: apR?.ok === true && acc1 === 1, paidIffEntry: (st1 === "PAID") === (pe1 === 1) && pe1 <= 1, payAfterFinalize: order,
        payOnce: pr.filter((x: Any) => x?.ok).length === 1 && (await runOf(id2))?.status === "PAID" && (await payEntries(id2)) === 1 && (await paidEvents(id2)) === 1,
      }, "lock-ordered", short({ blocked1, blocked2, apR: apR?.note, pyR: pyR?.note, st1, pe1, pr: pr.map((x: Any) => x?.ok) }, 260));
    }
    // ORACLE-EDIT (fix r2 b · r3 3/4) S4.35 give back a recovered claim
    {
      const setV2 = (sysId: string) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, sysId);
      const hG = await newHr("hG1", BA);
      await setV2(hG);
      const gRun = await insRun("hG1", VEC.examples.B, { label: "G1" });
      await approve("hG1", gRun);
      const claim = `${gRun}_bDmg`; // deducted 212,223 in 2031-09 (example B, 10 % cap)
      const g = (amt: number, pk: string, who = own1.id, cl = claim, h = "hG1") => PAY.giveBackClaim(c1(h), { userId: who }, { claimId: cl, amountSatang: amt, periodKey: pk });
      const offered = await PAY.giveBackPeriodOf(c1("hG1"), claim);
      const past = await g(1, "2031-08");
      const covered = await g(1, "2031-09");
      const over = await g(212_224, "2031-10");
      const ok1 = await g(150_000, "2031-10");
      const over2 = await g(62_224, "2031-10");
      const ok2 = await g(62_223, "2031-11");
      const foreign = await g(1, "2031-10", own2.id);
      // branch-limited requester, employee without a unit (rule of payroll-actions payTarget → unitTargetOf) ⇒ refused
      const uBr = await fx.newUnit(T1, `QC37 สาขา ${tag}`, "u37");
      const brl = await fx.mkUser(T1, "brl37", `QC37 branch ${tag}`, "STAFF", [uBr], { "hr.payadjust.request": true, "hr.payroll.read": true });
      const branchRef = await g(1, "2031-10", brl.id);
      // leaver: c1 of example C ended 2031-09-15 ⇒ 2031-10 is after the end period
      await setV2(HS.hC!);
      const leaver = await g(1, "2031-10", own1.id, `${R.C}_c1Dmg`, "hC");
      const leaverOffer = await PAY.giveBackPeriodOf(c1("hC"), `${R.C}_c1Dmg`);
      await setV2(HS.hB!);
      const reversed = await g(1, "2031-11", own1.id, `${R.B}_bDmg`, "hB");
      // ORACLE-EDIT (H3.4-YTD · controller ruling) part B1 — review r3 MINOR-1: the "≤ latest covered run" rule on its own (claim deducted 2031-09,
      //   no 2031-10 run, the same employee in an APPROVED finalized 2031-11 run) · control: the same request is accepted before the later run exists
      const hG2 = await newHr("hG2", BA);
      await setV2(hG2);
      const g2Run = await insRun("hG2", VEC.examples.B, { label: "G2" });
      await approve("hG2", g2Run);
      const g2 = (pk: string, who = own1.id) => PAY.giveBackClaim(c1("hG2"), { userId: who }, { claimId: `${g2Run}_bDmg`, amountSatang: 1, periodKey: pk });
      const ctrlOffer = await PAY.giveBackPeriodOf(c1("hG2"), `${g2Run}_bDmg`);
      const ctrl = await g2("2031-10");
      await insRun("hG2", null, { label: "G2n", periodKey: "2031-11", payDay: "2031-11-30", steps: { finalized: true }, items: (VEC.examples.E.items as VItem[]).map((i) => ({ ...i, emp: "b1" })), bound: [] });
      const gap = await g2("2031-10");
      const gapOffer = await PAY.giveBackPeriodOf(c1("hG2"), `${g2Run}_bDmg`);
      // ORACLE-EDIT (H3.4-YTD · controller ruling) part B2 — review r3 MINOR-2: positive control — the same branch-limited user on an employee of its own branch ⇒ accepted
      await P.hrEmployee.update({ where: { id: emps.get("hG2:b1")! }, data: { unitId: uBr } });
      const ownBranch = await g2("2031-12", brl.id);
      const made = await rows(`SELECT kind::text AS k, status::text AS s, "periodKey" AS p, "amountSatang" AS a FROM "HrPayAdjustment" WHERE "sourceRef" LIKE $1 ORDER BY "amountSatang"`, `refund:${claim}#%`);
      const isP = (x: Any) => x?.ok === false && x?.code === "PERIOD";
      ck("S4.35", {
        offered: offered === "2031-10", past: isP(past), covered: isP(covered), over: over?.ok === false && over?.code === "AMOUNT", ok: ok1?.ok === true && ok2?.ok === true,
        over2: over2?.ok === false && over2?.code === "AMOUNT", rows: made.length === 2 && made.every((x: Any) => x.k === "REFUND" && x.s === "PENDING") && Number(made[0]?.a) === 62_223 && Number(made[1]?.a) === 150_000,
        foreign: foreign?.ok === false && foreign?.code === "NO" && !/\d/.test(String(foreign?.reason)), branchUnitless: branchRef?.ok === false && branchRef?.code === "NO",
        leaver: isP(leaver) && leaverOffer === null, reversedRun: reversed?.ok === false && reversed?.code === "NO", // ORACLE-EDIT (H3.4-YTD · controller ruling) part B3 — review r3 NOTE-4: refused for the right reason
        ctrlOk: ctrlOffer === "2031-10" && ctrl?.ok === true, gapRefused: isP(gap), gapOffered: gapOffer === "2031-12", ownBranch: ownBranch?.ok === true, // ORACLE-EDIT (H3.4-YTD · controller ruling) part B1/B2
      }, "give back", short({ offered, past, covered, over, ok1, over2, ok2, foreign, branchRef, leaver, leaverOffer, reversed, made, ctrlOffer, ctrl, gap, gapOffer, ownBranch }, 600)); // ORACLE-EDIT (H3.4-YTD · controller ruling)
    }
  });
}

// ═════════════════════════ run ═════════════════════════
async function cleanup(): Promise<string[]> {
  const ids = fx.tenants;
  if (!ids.length) return [];
  const inList = ids.map((x) => `'${x}'`).join(",");
  const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
    .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (let pass = 0; pass < 4; pass += 1) {
    await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" IN (${inList})`).catch(() => null);
    for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
  }
  const left: string[] = [];
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
    if (Number(r?.[0]?.n ?? 0) !== 0) left.push(`${t}=${r?.[0]?.n}`);
  }
  return left;
}
try {
  runStatic();
  runPure(PURE, ACC);
  const fz = await fitnessNoEnv();
  chk("S1.9", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  let left: string[] = [];
  try {
    left = await cleanup();
  } catch (e) {
    left = [`cleanup threw: ${errText(e)}`];
  }
  await cleanupFx(P, fx, SLUG);
  left.push(...(await residueOf(P, fx, SLUG, SLUG_PREFIX)));
  chk("Z1", left.length === 0, "none", left.join(",") || "clean");
}
if (GROUP_FAIL.length) console.log(`GROUP-THROWS ${GROUP_FAIL.length}: ${GROUP_FAIL.map((g) => g.slice(0, 120)).join(" | ")}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
