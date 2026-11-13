// QC — HR V2 · H3.4 payroll run v2 (engineVersion 2): pay types · proration (HQ6) · holiday pay/work · carry-forward (HQ7) · maker-checker (HQ17) ·
//      branch preview · key wiring · REFUND kind · H2.9 normal-day divisor · brief ledger/hr-briefs/hr-brief-H3.4.md + wo-notes/hr-H3.4-design.md (DRAFT)
// ⚠️ Oracle under change control — ORACLE-EDIT only.
// 🔴 Every expected number is a LITERAL (scripts/fixtures/hr-h3.4-vectors.json + constants below) worked by hand in ledger/wo-notes/hr-H3.4-oracle.md.
// CONTRACT (brief R2–R16):
//   payroll-run-rules.ts (pure): computeRunItemV2(input, lawSet) → {ok, lines[…], …, carry[{cls, amountSatang}], receivable[…], flags, blocked} | {ok:false, code} ·
//     RUN_V2_DEFAULTS {normalDayMin 480, catCapBp 1000, totalCapBp 2000} · r2 = controller rulings L1–L9 (13 Nov) — vectors tagged rev r2-* re-verify on a lane DB
//   payroll.ts: getPayrollEngine(ctx) · setPayrollEngine(ctx, viewer, {engineVersion, catCapBp?, totalCapBp?}, {now?}) · createPayrollRunV2(ctx, viewer, {periodKey, payDate}, {now?, actor?}) ·
//     recomputeDraftRun(ctx, runId, actor, {viewer?, now?}) · approveRun(ctx, runId, expect?, actor?) · reverseRun(…) (CARRY_BOUND) · previewPayrollRunV2(ctx, viewer, {runId}) ·
//     confirmBranchHours(ctx, viewer, {runId, unitId}, {now?}) · holidayWorkPricedInTx · RUN2_TEXT · V2_VARIABLE_PAY
//   ot-rules.ts otAmount({…, normalDayMin?}) · payroll-rules-v2.ts classifyIncomeV2 accepts REFUND
// Tenants qc-hr-h34-<stamp> · Sept/Oct 2031 · opts.now · QC-only law rows qc-h34-<tag>-* deleted at the end · SKIP while payroll-run-rules.ts absent · S7.* n/a without H3.2.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, type Who, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, dbDate, tagOf, sha, canon,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, fileAt, srcFiles, makeRegistry, qc4Env, makeFixtures, cleanupFx,
  vOf, fitnessNoEnv, importsOf, jsonOf, testidsOf, loadOpt, modState, msgParity, tokensOnly, holdAdvisory, frozenControls,
} from "./qc-hr-lib.mjs";
import { FIX_CHECKS, FIX2_CHECKS, FIX3_CHECKS, MERGE_CHECKS, fnBody, lineStr, runFixRound1, runFixRound2, runFixRound3, runMergeRound, runPureH34, runStaticH34 } from "./qc-hr-h3.4-lib.mjs"; // ORACLE-EDIT (H3.4 fix round 1): controller F1–F10 + coverage list — checks live in the lib (file size)

const SUITE = "qc-hr-h3.4";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h34-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}payroll-run-rules.ts`, ui: `${H}payroll-run-ui.tsx`, payroll: `${H}payroll.ts`, acts: `${H}payroll-actions.ts`, v2: `${H}payroll-rules-v2.ts`,
  otRules: `${H}ot-rules.ts`, ot: `${H}ot.ts`, index: `${H}index.ts`, attPay: `${H}attendance-pay.ts`, schema: "prisma/schema/payroll.prisma",
  migK: "prisma/migrations/20270106000000_hr_payroll_v2_kinds/migration.sql", migC: "prisma/migrations/20270106000001_hr_payroll_v2/migration.sql",
  page: "src/app/app/sys/[id]/hr/payroll/page.tsx", th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", fx: "scripts/fixtures/hr-h3.4-vectors.json",
};
const FROZEN = [
  `${H}payroll-digest.ts`, `${H}work-entries.ts`, `${H}work-entries-rules.ts`, `${H}work-entries-actions.ts`, `${H}judge.ts`, `${H}judge-rules.ts`, `${H}leave.ts`, `${H}leave-rules.ts`,
  `${H}clock.ts`, `${H}clock-rules.ts`, `${H}holidays.ts`, `${H}roster.ts`, `${H}roster-rules.ts`, `${H}swap.ts`, `${H}law.ts`, "src/lib/modules/platform/hr-law.ts", `${H}privacy.ts`,
  `${H}privacy-shared.ts`, `${H}service.ts`, `${H}lifecycle.ts`, `${H}self.ts`, `${H}stock-charge.ts`, `${H}attendance-pay.ts`, `${H}attendance-pay-rules.ts`, "src/lib/outbox-consumers.ts",
  "src/lib/modules/account/gl.ts", "scripts/seed-hr-qc.mts", "scripts/fixtures/hr-h3.3-vectors.json",
];
const FX = jsonOf(F.fx) as Any;
const T = (FX?.texts ?? {}) as Record<string, string>; // RUN2_TEXT (brief §3 / design §5) + reused LAW_MSG · WE_TEXT · ATT_TEXT — byte-exact literals in the fixture file
const dupText = (p: string) => String(T.dup ?? "∅").replace("{p}", p);
const PAY_ROW_KEYS = srt(["employeeId", "name", "unitId", "payType", "lines", "flags", "carry", "grossSatang", "ssoEmployeeSatang", "whtSatang", "netSatang", "addSatang", "deductSatang", "review"]);
const MGR_ROW_KEYS = srt(["employeeId", "name", "unitId", "days", "workMin", "paidLeaveMin", "unpaidLeaveMin", "holidayWorkMin", "holidayPaidMin", "unplannedMin", "review"]);
const TESTIDS = ["hr-run2-create", "hr-run2-steps", "hr-run2-tiles", "hr-run2-table", "hr-run2-review", "hr-run2-approve", "hr-run2-pay", "hr-run2-reverse", "hr-run2-rebuild", "hr-run2-row-*", "hr-run2-lines-*", "hr-run2-branch-*"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] new files · rules pure (imports ./payroll-rules-v2 ./ot-rules only)
S1.2|R12|C|R|[static] migrations: _kinds = 2 ADD VALUE only · _v2 additive (stepsJson · inputDigest · HrPayAdjustment.consentAt) · schema
S1.3|R1|C|R|[static] single writer of HrPayrollRun/Item/HrPayAdjustment = payroll.ts (base writers tolerated)
S1.4|R1|C|R|[static] law.ts only reader of HrLawTable · payroll.ts uses loadLawSet
S1.5|R16|M|R|[static] no GPS/photo field in new code
S1.6|R1|C|G|[static] payroll-rules.ts sha · frozen files unchanged vs base
S1.7|R1|C|R|[static] marked hunks · V2_VARIABLE_PAY = false
S1.8|R8|C|R|[static] keys hr.payroll.reverse · hr.payadjust.reject wired
S1.9|R15|M|R|[static] UI testids · inventory · hr.run2 th=en · tokens · page · engine card
S1.10|R2|C|R|[static] measured OT never priced · ot.ts subtracts run minutes
S2.1|R2|C|R|[pure] monthly V01–V07
S2.2|HQ6|C|R|[pure] proration V08–V11
S2.3|R2|C|R|[pure] unpaid leave V12–V14
S2.4|R2|C|R|[pure] daily V15–V24
S2.5|R2|C|R|[pure] hourly V25–V28
S2.6|R2|C|R|[pure] monthly holiday work V29–V32
S2.7|R2|C|R|[pure] adjustments V33–V36
S2.8|L1|C|R|[pure] r2 caps per category 10 % + total 20 % · consent (s.77) · carry · receivable V37–V44 V51 V61–V63 V65–V67
S2.9|R2|C|R|[pure] refusals V45–V49
S2.13|L2|C|R|[pure] r2 ÷30 proration (Feb/31-day) · s.56 SHOP vs PUBLIC · dated SSO row · SSO rounding · lateness refund V52–V60 V64
S2.14|r3|C|R|[pure] r3 one-off tax Por.96 ข้อ 1(5) (bonus month · December · one-off allowance) · SSO wage components from the law row V68–V72
S2.10|NA-11|M|R|[pure] V50 daily + commission: regular month = earned (placeholder)
S2.11|R11|C|R|[pure] otAmount normalDayMin OTN-01…05
S2.12|R12|C|R|[pure] classifyIncomeV2 REFUND outside 40(1)/SSO · TIP still BAD_KIND
S3.1|R2|C|R|[pure] identities (gross · Σ lines · net ≥ 0 · carry)
S3.2|R2|M|R|[pure] purity · RUN_V2_DEFAULTS
S3.3|HQ7|C|R|[pure] two periods V38 · Σ 2,000,000
S3.4|R14|M|R|[pure] perf: 300 employees × 31 days < 2,000 ms
S4.1|R3|C|R|[db] engine setting rules
S4.2|R3|C|R|[db] engine mismatch refusals
S4.3|Q2|C|R|[db] no ACTIVE law ⇒ LAW_MISSING · nothing written
S4.4|R4|C|R|[db] PENDING OT request ⇒ OT_OPEN
S4.5|R4|C|R|[db] create Sept: 3 items + totals literal (r2: SSO 875 · caps 10/20) · lawRowIds · ytd · 5 bound
S4.6|R2|C|R|[db] lines literal · refs · no double pay · workDays
S4.7|HQ17|C|R|[db] maker-checker SAME_PERSON · OWN_PAY · NO_ACTOR
S4.8|R6|C|R|[db] inputs changed ⇒ INPUTS_CHANGED
S4.9|R5|C|R|[db] rebuild makes pay3 the maker
S4.10|R6|C|R|[db] 3 ∥ approve ⇒ 1 ok · JV 12,509,167 · days bound · carry rows literal
S4.11|R7|M|R|[db] 2 ∥ markPaid ⇒ 1 ok · PAID
S4.12|R11|C|R|[db] late OT request ⇒ 200,000 (run-priced minutes subtracted)
S4.13|HQ7|C|R|[db] Oct literal (2572 SSO row ⇒ 1,000 ฿) · Σ advance 900,000 · claim 627,500 + carry 72,500
S4.14|R7|C|R|[db] reverse Sept while carry bound ⇒ CARRY_BOUND
S4.15|R7|C|R|[db] reverse Oct then Sept ⇒ 3 carry rows REJECTED · rows restored · JV reversed
S4.16|R4|C|R|[db] stale ⇒ WORK_ENTRIES at create and approve
S4.17|R12|M|R|[db] REFUND request only in engine-2 shops
S4.18|R6|C|R|[db] (controller ruling 4, phase B) refused approve (NEGATIVE_NET) writes no carry/receivable rows · blocked item carries nothing
S5.1|R13|C|R|[race] 3 ∥ create ⇒ 1 ok · 2 dup
S5.2|R13|C|R|[race] create waits on the period lock
S5.3|R13|C|R|[race] approve-adjustment ∥ create ⇒ bound XOR moved
S5.4|R13|C|R|[race] cancel ∥ create ⇒ gone XOR bound
S6.1|R9|C|R|[db] preview viewer matrix (manager: minutes only)
S6.2|R9|C|R|[db] IDOR ⇒ identical no
S6.3|R10|M|R|[db] confirmBranchHours rules
S7.1|H3.2|C|G|[db] (H3.2-guarded) LATE_RULE −2,777 reduces taxable + SSO wage · net 1,909,723
S7.2|H3.2|C|G|[db] (H3.2-guarded) stale approved row ⇒ create refused
S7.4|H3.2|M|G|[db+static] (controller, reviewer minor on H3.2) workEntrySourceEmployeesInTx finds punch-only staff by a distinct read (no TAKE cap on full punch rows)
S7.3|H3.2|C|G|[db] (H3.2-guarded, controller phase B) bound LATE deduction → approve → reverse → rebuild → sync → approve ⇒ money = entitlement (one LATE row, −2,777 · net 1,909,723)
S8.1|frozen|C|G|[db] v1 golden: frozen MONTHLY digest/totals unchanged
S8.2|frozen|C|G|[db] v1 shop cycle unchanged
X12.1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue · ACTIVE law count restored
S7.5|cov|C|G|[db] (H3.2-guarded, fix r1 coverage) v2 approve before the deductions were synced ⇒ ATTENDANCE_SYNC (H3.2 gate) · run DRAFT
${FIX_CHECKS}
${FIX2_CHECKS}
${FIX3_CHECKS}
${MERGE_CHECKS}
S7.8|merge|C|G|[db] (H3.2-guarded, merge round minors A/B) leaver's corrected row PENDING in P blocks approve (attPending) · one stale + one bindable approved row still refuses
S7.7|H5|C|G|[db] (H3.2-guarded, fix r3 H5) leaver: corrected late deduction lands in the leaver's draft period, the draft must be rebuilt, then 2,361 is deducted once in Sept
S7.6|G2|C|G|[db] (H3.2-guarded, fix r2 G2) stale late deduction bound to a v2 draft: correction → pull → sync waits → rebuild ok (stale left out) → sync supersedes → approve ⇒ corrected 2,361 settled once, no loop
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.4-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.4-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rules))) skipReasons.push(`${F.rules} absent (H3.4 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H34_BASE") || "bcf352f882cfd5f0ff98fb2db2fa1bdbb6f16e15";
const H32 = existsSync(join(ROOT, F.attPay));

// ═════════════════════════ statics ═════════════════════════
// ORACLE-EDIT (H3.4 fix round 1 — file size > 60 KB): the static group S1.* moved verbatim to qc-hr-h3.4-lib.mts (runStaticH34) · same checks, same literals
// ORACLE-EDIT (H3.7 builder): account/gl.ts stays frozen for H3.4 except additive hunks marked "HR H3.7" (H3.7 is the one HR ticket allowed to touch gl.ts — brief H3.7 R6)
//   fix r1 F8 (reviewer): EVERY added line of the hunk must lie inside the H3.7 block — first non-blank added line opens "HR H3.7 ▸", last closes "◂ HR H3.7"
const glH37Only = (p: string) => p === "src/lib/modules/account/gl.ts" && (() => {
  const hs = diffHunks(BASE, p);
  return !!hs && hs.length > 0 && hs.every((h) => {
    const a = h.added.filter((l) => l.trim() !== "");
    return h.removed.length === 0 && a.length > 0 && /HR H3\.7 ▸/.test(a[0]!) && /◂ HR H3\.7/.test(a[a.length - 1]!) && a.slice(1, -1).every((l) => !/◂ HR H3\.7/.test(l));
  });
})();
const runStatic = () => runStaticH34({ F, FROZEN: FROZEN.filter((p) => !glH37Only(p)), TESTIDS, BASE, H, ck, chk }); // ORACLE-EDIT (H3.7 builder)

// ═════════════════════════ pure ═════════════════════════
// ORACLE-EDIT (H3.4 fix round 1 — file size): the pure groups S2.* / S3.* moved verbatim to qc-hr-h3.4-lib.mts (runPureH34) · same vectors, same checks
const runPure = (R: Any, OR: Any, V2: Any) => runPureH34({ FX, F, ck, chk }, R, OR, V2);

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
async function callMod(Mo: Any, file: string, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `absent: ${fn} (${modState(Mo, file)})`, value: undefined };
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : textOf(v?.reason ?? v?.note ?? v) || short(v, 80), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 70)}"`);
const codeOf = (r: RO) => String(r.value?.code ?? "");

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/payroll-run-rules");
const OR = (await import("@/lib/modules/hr/ot-rules")) as Any;
const V2 = (await import("@/lib/modules/hr/payroll-rules-v2")) as Any;
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · base=${BASE.slice(0, 9)} · H3.2 ${H32 ? "present" : "absent (S7 n/a)"}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const OT = (await import("@/lib/modules/hr/ot")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const AP = H32 ? await loadOpt(F.attPay, "@/lib/modules/hr/attendance-pay") : null;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const LAW_KEY = `qc-h34-${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const PY = (fn: string, ...a: unknown[]) => callMod(pay, F.payroll, fn, a);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const FIX_TS = new Date("2031-06-01T00:00:00Z");
const [SEP, OCT] = ["2031-09", "2031-10"];
const PAY_SEP = new Date("2031-09-30T03:00:00Z");
const PAY_OCT = new Date("2031-10-31T03:00:00Z");
const [N_SEP8, N_OCT1, N_NOV1] = [bk("2031-09-08"), bk("2031-10-01"), bk("2031-11-01")];
let actBefore = -1;
const lawIds: string[] = [];
const rows = async (sql: string, ...p: unknown[]) => (await fx.rawRows(sql, ...p)) ?? [];
const runRow = async (id: string | undefined) => (id ? (await rows(`SELECT id, status::text AS status, "engineVersion", "createdById", "approvedById", "journalEntryId", "totalGrossSatang" AS g, "totalSsoEmployeeSatang" AS se, "totalSsoEmployerSatang" AS sr, "totalWhtSatang" AS w, "totalNetSatang" AS n, "totalAddSatang" AS a, "totalDeductSatang" AS d FROM "HrPayrollRun" WHERE id = $1`, id))[0] : undefined);
const stepsOf = async (id: string | undefined) => (id ? (await rows(`SELECT "stepsJson" AS s FROM "HrPayrollRun" WHERE id = $1`, id))[0]?.s : undefined); // column added by H3.4 (absent ⇒ undefined)
const itemsOf = async (id: string | undefined) => (id ? await rows(`SELECT * FROM "HrPayrollItem" WHERE "runId" = $1`, id) : []);
const lawStatus = (s: string) => P.$executeRawUnsafe(`UPDATE "HrLawTable" SET status = $1::"HrLawStatus" WHERE "sourceKey" LIKE $2`, s, `${LAW_KEY}-%`);

async function runDb(): Promise<void> {
  actBefore = Number((await rows(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`))[0]?.n ?? -1);
  // r2 (L5): SSO rows are dated — 2569–2571 values (max 17,500 ⇒ 875 ฿) from 2031-01-01 and the 2572 step (max 20,000 ⇒ 1,000 ฿) from 2031-10-01 (QC dates; same json as the law rows)
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const) {
    const id = `${LAW_KEY}-${k}`;
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'DRAFT'::"HrLawStatus", $1, 'qc h3.4 fixture', 'QC', now())`, id, kind, from, JSON.stringify(FX?.law?.[j] ?? {}));
    lawIds.push(id);
  }
  const TT = await fx.newTenant("", "QC HR H3.4 เงินเดือนรุ่น 2");
  const T2 = await fx.newTenant("-other", "QC HR H3.4 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const [sA, sB, sV, sO] = [await sys("ทีม A"), await sys("ทีม B"), await sys("ทีม V1"), await sys("ทีมอื่น", T2)];
  const ACCT34 = (await sysSvc.createSystem(TT, "ACCOUNT", `บัญชี ${tag}`)).id as string; // ORACLE-EDIT (H3.7 builder): keep the book id — H3.7 posts only into the book linked to the HR system (no "first ACCOUNT system")
  const [cA, cB, cV, cO] = [{ tenantId: TT, systemId: sA }, { tenantId: TT, systemId: sB }, { tenantId: TT, systemId: sV }, { tenantId: T2, systemId: sO }];
  const PK = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC34 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK), pay2: await mk("pay2", "STAFF", ["*"], PK), pay3: await mk("pay3", "STAFF", ["*"], PK),
    mgrU1: await mk("mgru1", "MANAGER", [u1], {}), staffHr: await mk("staffhr", "STAFF", [u2], { "hr.employee.create": true }), member: await mk("member", "STAFF", [], {}),
    self: await mk("self", "STAFF", [], {}), other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  // ORACLE-EDIT (H3.7 builder · brief H3.7 §6): the JV assertions of system A (S4.10 · S4.15) need the explicit HR→ACCOUNT link (H3.7 R3) ·
  //   a BANK money account of that book for the pay entry (markPaidRun · S4.11 / S4.15) — no literal of H3.4 changes except S4.10's JV total (see there)
  if (typeof (pay as Any)?.setPayrollBook === "function") await PY("setPayrollBook", { tenantId: TT, systemId: sA }, V.owner, { accountSystemId: ACCT34 });
  const FIN34 = ((await P.accountFinance.create({ data: { tenantId: TT, systemId: ACCT34, type: "BANK", name: `QC34 ธนาคาร ${tag}`, ledgerAccountId: (await P.accountLedger.findFirst({ where: { systemId: ACCT34, code: "1010" } }))?.id ?? null } })) as Any).id as string; // ORACLE-EDIT (H3.7 builder)
  const A = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, { userId: w.id, isOwner: w.role === "OWNER" }])) as Record<keyof typeof U, Any>;
  const me = (s: string, n: string, o: Record<string, unknown> = {}, tid = TT) => fx.mkEmp(tid, s, `${n} ${tag}`, { startDate: "2030-01-01", ...o } as Any);
  const E = {
    mA: await me(sA, "เอ", { unitId: u1, linkedUserId: U.pay2.id }), mB: await me(sA, "บี", { unitId: u2 }), eC: await me(sA, "ซี", { unitId: u2, linkedUserId: U.self.id, startDate: "2031-09-16" }),
    eS: await me(sB, "เอส", { unitId: u1 }), eV: await me(sV, "วี", { unitId: u1 }), eO: await me(sO, "โอ", {}, T2),
  };
  const prof = (s: string, emp: string, base: number) => P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: emp, baseSalarySatang: base, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  await prof(sA, E.mA, 3000000);
  await prof(sA, E.mB, 8000000);
  await prof(sA, E.eC, 1500000);
  await prof(sB, E.eS, 2000000);
  await prof(sV, E.eV, 1500000);
  const shiftOf = async (s: string) => (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: `เช้า ${tag}`, startMin: 420, endMin: 900, crossesMidnight: false, graceMin: 15 } })).id as string;
  const [shA, shB] = [await shiftOf(sA), await shiftOf(sB)];
  const ent = async (s: string, sh: string, emp: string, day: string, unitId: string) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: emp, date: dbDate(day), shiftId: sh, unitId, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } })).id as string;
  const att = async (s: string, emp: string, kind: string, at: Date, re: string | null) => (await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: emp, kind, at, rosterEntryId: re, source: "KIOSK" } })).id as string;
  const io = async (s: string, emp: string, re: string | null, inAt: Date, outAt: Date | null) => ({ i: await att(s, emp, "IN", inAt, re), o: outAt ? await att(s, emp, "OUT", outAt, re) : null });
  for (const d of ["2031-09-01", "2031-09-02", "2031-09-03", "2031-09-04", "2031-09-05", "2031-09-17"]) await io(sA, E.mA, await ent(sA, shA, E.mA, d, u1), bk(d, "07:00"), bk(d, "15:00"));
  for (const d of ["2031-09-01", "2031-09-02"]) await io(sA, E.mB, await ent(sA, shA, E.mB, d, u2), bk(d, "07:00"), bk(d, "15:00"));
  await io(sA, E.mA, null, bk("2031-09-06", "09:00"), bk("2031-09-06", "19:00"));
  await io(sA, E.mB, null, bk("2031-09-06", "09:00"), bk("2031-09-06", "19:00"));
  await P.hrHoliday.create({ data: { tenantId: TT, systemId: sA, unitId: null, date: dbDate("2031-09-17"), name: `วันหยุด ${tag}`, kind: "PUBLIC" } });
  const pol = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sA, category: "PERSONAL", name: `ลากิจไม่รับค่าจ้าง ${tag}`, paid: false, allowHours: true } })).id as string;
  await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E.eC, type: "PERSONAL", fromDate: dbDate("2031-09-18"), toDate: dbDate("2031-09-18"), status: "APPROVED", policyId: pol, days: 1, reason: `ลับ ${tag}` } });
  const reB = await ent(sB, shB, E.eS, "2031-09-01", u1);
  const eSin = await att(sB, E.eS, "IN", bk("2031-09-01", "07:20"), reB);
  const adj = async (s: string, emp: string, per: string, kind: string, amount: number) =>
    (await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: s, employeeId: emp, periodKey: per, kind, amountSatang: amount, status: "APPROVED", requestedById: U.owner.id, decidedById: U.owner.id, decidedAt: FIX_TS, note: `qc ${tag}` } })).id as string;
  const hasRefund = Number((await rows(`SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'HrPayItemKind' AND e.enumlabel = 'REFUND'`))[0]?.n ?? 0) > 0;
  const ADJ: Record<string, string> = { aDed: await adj(sA, E.mA, SEP, "DEDUCTION", 700000), b1: await adj(sA, E.mB, SEP, "BONUS", 1000000), c1: await adj(sA, E.eC, SEP, "ADVANCE", 900000) };
  if (hasRefund) ADJ.b2 = await adj(sA, E.mB, SEP, "REFUND", 50000);
  const job = (now: Date) => JG.runAttendanceJobs({ now, tenantId: TT });
  const reqA = await OT.requestOt(cA, V.owner, { employeeId: E.mA, date: "2031-09-06", start: "09:00", end: "19:00" }, { now: bk("2031-09-05") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  // ORACLE-EDIT (H3.4 builder, phase B): + 2031-09-22 — runAttendanceJobs judges a 7-day window (judge.ts WINDOW_DAYS) and the 15th at noon is not over,
  //   so 15–17 Sep were never stored (H3.1 NOT_STORED blocks the period ⇒ WORK_ENTRIES at create); no literal changes
  for (const d of ["2031-09-08", "2031-09-15", "2031-09-22", "2031-09-25", "2031-10-01"]) await job(bk(d));
  await OT.decideOtRequest(cA, V.owner, reqA?.id ?? "∅", "APPROVED", { now: N_SEP8 }).catch(() => null);
  const otRow = (await rows(`SELECT id, "amountSatang" AS a, "periodKey" AS p FROM "HrPayAdjustment" WHERE "tenantId" = $1 AND "employeeId" = $2 AND "sourceType"::text = 'OT_REQUEST'`, TT, E.mA))[0];
  if (otRow) ADJ.aOT = otRow.id;
  console.log(`  ℹ fixture OT_REQUEST mA = ${otRow ? `${otRow.a} @${otRow.p}` : "∅"} (want 175000 @2031-09) · REFUND ${hasRefund}`);
  const nameOfAdj = Object.fromEntries(Object.entries(ADJ).map(([k, v]) => [v, k]));
  const wdIds = new Map((await rows(`SELECT id FROM "HrWorkDay" WHERE "tenantId" = $1`, TT)).map((r: Any) => [r.id, "wd"]));
  const refName = (x: string) => nameOfAdj[x] ?? (wdIds.has(x) ? "wd" : x);
  const refreshWd = async () => (await rows(`SELECT id FROM "HrWorkDay" WHERE "tenantId" = $1`, TT)).forEach((r: Any) => wdIds.set(r.id, "wd"));

  // ── S4.1 engine ──
  {
    const g0 = await PY("getPayrollEngine", cA);
    const nOwner = await PY("setPayrollEngine", cA, V.pay1, { engineVersion: 2 }, { now: N_OCT1 });
    const cap = await PY("setPayrollEngine", cA, V.owner, { engineVersion: 2, catCapBp: 10001 }, { now: N_OCT1 });
    const noLaw = await PY("setPayrollEngine", cA, V.owner, { engineVersion: 2 }, { now: N_OCT1 });
    await lawStatus("ACTIVE");
    const ok = await PY("setPayrollEngine", cA, V.owner, { engineVersion: 2 }, { now: N_OCT1 });
    await PY("setPayrollEngine", cB, V.owner, { engineVersion: 2 }, { now: N_OCT1 });
    const g1 = await PY("getPayrollEngine", cA);
    const aud = await P.auditLog.count({ where: { tenantId: TT, action: "hr.payroll.engine" } }).catch(() => -1);
    const r = {
      def: g0.value?.engineVersion === 1 && g0.value?.catCapBp === 1000 && g0.value?.totalCapBp === 2000, owner: !nOwner.ok && nOwner.text === T.engineOwner, cap: !cap.ok && cap.text === T.capRange,
      law: !noLaw.ok && noLaw.text === T.lawMissing, ok: ok.ok && g1.value?.engineVersion === 2, audit: aud >= 2,
    };
    ck("S4.1", r, "engine rules", `${shown(g0)} ${shown(nOwner)} ${shown(noLaw)} ${shown(ok)} audit=${aud}`);
  }
  // ── S4.2 / S4.3 / S4.4 ──
  const createV2 = (c: Any, v: Any, per: string, payDate: Date, actor: Any, now = N_OCT1) => PY("createPayrollRunV2", c, v, { periodKey: per, payDate }, { now, actor });
  const liveRuns = async (s: string, per: string) => rows(`SELECT id FROM "HrPayrollRun" WHERE "systemId" = $1 AND "periodKey" = $2 AND status <> 'REVERSED'`, s, per);
  {
    let v1Text = "";
    try {
      const r0 = await pay.createPayrollRun(cA, { periodKey: SEP, payDate: PAY_SEP });
      v1Text = `CREATED ${r0?.id}`;
      await pay.deleteDraftRun(cA, r0?.id, A.owner).catch(() => null);
    } catch (e) {
      v1Text = (e as Error)?.message ?? errText(e);
    }
    const e1 = await createV2(cV, V.owner, SEP, PAY_SEP, A.owner);
    ck("S4.2", { v1: v1Text === T.engineV2, v2: !e1.ok && codeOf(e1) === "ENGINE_V1" && e1.text === T.engineV1, none: (await liveRuns(sA, SEP)).length === 0 }, "engineV2 · ENGINE_V1", `v1="${short(v1Text, 50)}" v2=${shown(e1)}`);
  }
  {
    await lawStatus("DRAFT");
    const r0 = await createV2(cA, V.pay1, SEP, PAY_SEP, A.pay1);
    await lawStatus("ACTIVE");
    const bound = await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "runId" IS NOT NULL`, sA);
    ck("S4.3", { code: !r0.ok && codeOf(r0) === "LAW_MISSING", text: r0.text === T.lawMissing, none: (await liveRuns(sA, SEP)).length === 0 && bound.length === 0 }, "LAW_MISSING · nothing written", shown(r0));
  }
  {
    const pend = await OT.requestOt(cA, V.owner, { employeeId: E.mB, date: "2031-09-20", start: "10:00", end: "12:00" }, { now: bk("2031-09-19") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const r0 = await createV2(cA, V.pay1, SEP, PAY_SEP, A.pay1);
    await OT.cancelOtRequest(cA, V.owner, pend?.id ?? "∅").catch(() => null);
    ck("S4.4", { pend: !!pend?.id, code: !r0.ok && codeOf(r0) === "OT_OPEN" && r0.text === T.otOpen, none: (await liveRuns(sA, SEP)).length === 0 }, "OT_OPEN", shown(r0));
  }
  // ── S4.5 / S4.6 create Sept ──
  const c1 = await createV2(cA, V.pay1, SEP, PAY_SEP, A.pay1);
  const RS = c1.value?.id as string | undefined;
  await refreshWd();
  const itemBy = async (run: string | undefined, emp: string) => (await itemsOf(run)).find((i: Any) => i.employeeId === emp);
  const money = (i: Any) => (i ? `${i.grossSatang}/${i.ssoEmployeeSatang}/${i.ssoEmployerSatang}/${i.whtSatang}/${i.netSatang}/${i.addSatang}/${i.deductSatang}` : "∅");
  {
    const run = await runRow(RS);
    const [iA, iB, iC] = [await itemBy(RS, E.mA), await itemBy(RS, E.mB), await itemBy(RS, E.eC)];
    const bound = await rows(`SELECT id FROM "HrPayAdjustment" WHERE "runId" = $1`, RS ?? "∅");
    const r = {
      ok: c1.ok, run: run?.engineVersion === 2 && run?.createdById === U.pay1.id && run?.status === "DRAFT",
      mA: money(iA) === "2947500/87500/87500/0/2860000/175000/327500", mB: money(iB) === "9316667/87500/87500/61458/9167709/1050000/0", eC: money(iC) === "35000/35000/35000/0/0/0/665000",
      totals: run && `${run.g}/${run.se}/${run.sr}/${run.w}/${run.n}/${run.a}/${run.d}` === "12299167/210000/210000/61458/12027709/1225000/992500",
      law: canon(iA?.lawRowIds) === canon(lawIds.filter((x) => !x.endsWith("-sso2")).sort()), ytd: iA?.ytdJson?.monthIndex === 9, bound: bound.length === 5,
    };
    ck("S4.5", r, "Sept literal", `${shown(c1)} A=${money(iA)} B=${money(iB)} C=${money(iC)} bound=${bound.length}`);
  }
  {
    const L = async (emp: string) => ((await itemBy(RS, emp))?.snapshotJson?.lines ?? []).map((l: Any) => lineStr(l, refName)).sort();
    const want = {
      mA: ["BASE:profile:-:-:3000000", "HOLIDAY_WORK:wd:2031-09-17:480:100000", "OT:aOT:-:-:175000", "DEDUCTION:aDed:-:-:-327500/700000"].sort(),
      mB: ["BASE:profile:-:-:8000000", "HOLIDAY_WORK:wd:2031-09-06:480:266667", "BONUS:b1:-:-:1000000", "REFUND:b2:-:-:50000"].sort(),
      eC: ["BASE:profile:-:-:1500000", "PRORATION:employment:-:15:-750000", "UNPAID_LEAVE:wd:2031-09-18:480:-50000", "ADVANCE:c1:-:-:-665000/900000"].sort(),
    };
    const got = { mA: await L(E.mA), mB: await L(E.mB), eC: await L(E.eC) };
    const wd17 = (await rows(`SELECT id FROM "HrWorkDay" WHERE "employeeId" = $1 AND date = '2031-09-17'`, E.mA))[0]?.id;
    const hwLine = ((await itemBy(RS, E.mA))?.snapshotJson?.lines ?? []).find((l: Any) => l.code === "HOLIDAY_WORK");
    const all = (await itemsOf(RS)).flatMap((i: Any) => i.snapshotJson?.lines ?? []);
    const wdn = async (emp: string) => ((await itemBy(RS, emp))?.snapshotJson?.workDays ?? []).length;
    const r = {
      mA: canon(got.mA) === canon(want.mA), mB: canon(got.mB) === canon(want.mB), eC: canon(got.eC) === canon(want.eC), ref: !!wd17 && hwLine?.ref === wd17,
      noOt: all.length > 0 && !all.some((l: Any) => /^OT_(WORKDAY|HOLIDAY)$/.test(l.code)), wd: `${await wdn(E.mA)}/${await wdn(E.mB)}/${await wdn(E.eC)}` === "30/30/15",
    };
    ck("S4.6", r, "lines literal", `A=${short(got.mA, 140)}`);
  }
  // ── S6 previews + manager step (DRAFT) ──
  {
    const pv = (c: Any, v: Any, id = RS ?? "∅") => PY("previewPayrollRunV2", c, v, { runId: id });
    const [o, p1, m, s, mem, sf] = [await pv(cA, V.owner), await pv(cA, V.pay1), await pv(cA, V.mgrU1), await pv(cA, V.staffHr), await pv(cA, V.member), await pv(cA, V.self)];
    const ot = await pv(cO, V.other);
    const keysOk = (rs: Any[], want: string) => rs.length > 0 && rs.every((x) => srt(Object.keys(x)) === want);
    const mRows = m.value?.rows ?? [];
    const r = {
      owner: o.ok && (o.value?.rows ?? []).length === 3 && keysOk(o.value.rows, PAY_ROW_KEYS), pay: p1.ok && (p1.value?.rows ?? []).length === 3,
      mgr: m.ok && mRows.length === 1 && mRows[0]?.employeeId === E.mA && keysOk(mRows, MGR_ROW_KEYS) && !/Satang|"lines"|"carry"|payType/.test(JSON.stringify(m.value)),
      refused: [s, mem, sf, ot].every((x) => !x.ok && x.text === T.no),
    };
    ck("S6.1", r, "viewer matrix", `o=${shown(o)} m=${shown(m)} s=${shown(s)} other=${shown(ot)}`);
    const unk = await pv(cA, V.owner, "nonexistent-run-id");
    const otherRun = await pv(cO, V.other, RS ?? "∅");
    ck("S6.2", { unk: !unk.ok && unk.text === T.no, other: !otherRun.ok && otherRun.text === T.no && !JSON.stringify(otherRun.value ?? {}).includes(E.mA) }, "identical no", `${shown(unk)} ${shown(otherRun)}`);
    const cf = (v: Any, unitId: string) => PY("confirmBranchHours", cA, v, { runId: RS ?? "∅", unitId }, { now: N_OCT1 });
    const [ok1, no2, no3] = [await cf(V.mgrU1, u1), await cf(V.mgrU1, u2), await cf(V.staffHr, u2)];
    const st = await stepsOf(RS);
    ck("S6.3", { ok: ok1.ok && !!st?.branches?.[u1], no2: !no2.ok && no2.text === T.confirmNo, no3: !no3.ok && no3.text === T.confirmNo }, "confirm rules", `${shown(ok1)} ${shown(no2)} steps=${short(st, 60)}`);
  }
  // ── S4.7 maker-checker ──
  const approve = (c: Any, id: string | undefined, actor: Any) => PY("approveRun", c, id ?? "∅", undefined, actor);
  {
    const [same, own, none] = [await approve(cA, RS, A.pay1), await approve(cA, RS, A.pay2), await approve(cA, RS, undefined)];
    const r = {
      same: !same.ok && codeOf(same) === "SAME_PERSON" && same.text === T.samePerson, own: !own.ok && codeOf(own) === "OWN_PAY" && own.text === T.ownPay,
      none: !none.ok && codeOf(none) === "NO_ACTOR" && none.text === T.noActor, draft: (await runRow(RS))?.status === "DRAFT",
    };
    ck("S4.7", r, "SAME_PERSON · OWN_PAY · NO_ACTOR", `${shown(same)} ${shown(own)} ${shown(none)}`);
  }
  {
    await P.hrSalaryProfile.updateMany({ where: { systemId: sA, employeeId: E.mB }, data: { baseSalarySatang: 8050000 } });
    const ch = await approve(cA, RS, A.pay3);
    await P.hrSalaryProfile.updateMany({ where: { systemId: sA, employeeId: E.mB }, data: { baseSalarySatang: 8000000 } });
    ck("S4.8", { code: !ch.ok && codeOf(ch) === "INPUTS_CHANGED" && ch.text === T.inputsChanged, draft: (await runRow(RS))?.status === "DRAFT" }, "INPUTS_CHANGED", shown(ch));
  }
  {
    const rb = await PY("recomputeDraftRun", cA, RS ?? "∅", A.pay3, { viewer: V.pay3, now: N_OCT1 });
    const run = await runRow(RS);
    const same = await approve(cA, RS, A.pay3);
    // ORACLE-EDIT (H3.4 fix round 2 G6): stepsJson now carries the makers list — "steps cleared" = no branch confirmations left (makers include pay3)
    const st9 = await stepsOf(RS);
    const r = { ok: rb.ok, maker: run?.createdById === U.pay3.id, steps: !st9?.branches && Array.isArray(st9?.makers) && st9.makers.includes(U.pay3.id), totals: Number(run?.n) === 12027709, same: !same.ok && codeOf(same) === "SAME_PERSON" };
    ck("S4.9", r, "rebuilder is the maker", `${shown(rb)} maker=${run?.createdById === U.pay3.id} ${shown(same)}`);
  }
  // ── S4.10 approve ──
  {
    // ORACLE-EDIT (H3.4 fix round 2 G6): pay1 created this draft and pay3 rebuilt it ⇒ both are on the makers list — the checker is the owner (Q9 exemption)
    const res = await Promise.all([0, 1, 2].map(() => approve(cA, RS, A.owner)));
    const run = await runRow(RS);
    const lines = run?.journalEntryId ? ((await P.accountJournalLine.findMany({ where: { entryId: run.journalEntryId }, select: { debit: true, credit: true } }).catch(() => [])) as Any[]) : [];
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    const unbound = await rows(`SELECT count(*)::int AS n FROM "HrWorkDay" WHERE "systemId" = $1 AND "periodKey" = $2 AND ("runId" IS NULL OR "runId" <> $3)`, sA, SEP, RS ?? "∅");
    const carry = (await rows(`SELECT kind::text AS k, "amountSatang" AS a, "periodKey" AS p, status::text AS s, "employeeId" AS e, "sourceRef" AS r FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD' ORDER BY "amountSatang"`, sA))
      .map((c: Any) => `${c.e === E.mA ? "mA" : c.e === E.eC ? "eC" : "?"}:${c.k}:${c.a}:${c.p}:${c.s}:${String(c.r).startsWith(`cf:${RS}:`)}`);
    const r = {
      // ORACLE-EDIT (H3.7 builder): the approve entry is now the ACCRUAL (design H3.7 §2), no longer the one-step JV (gross + employer SSO = 12,299,167 + 210,000 = 12,509,167).
      //   Accrual Σdr = salary expense (Σ lines 12,299,167 + advances 665,000 + claims 327,500 − refund 50,000 = 13,241,667) + employer SSO 210,000 + refund 50,000 = 13,501,667
      //   = Σcr net 12,027,709 + SSO 420,000 + WHT 61,458 + advances 665,000 (1140) + damages 327,500 (4900) = 13,501,667 ⇒ 12,509,167 → 13,501,667 (= old + 665,000 + 327,500)
      one: res.filter((x) => x.ok).length === 1, run: run?.status === "APPROVED" && run?.approvedById === U.owner.id, jv: dr === 13501667 && cr === 13501667,
      days: Number(unbound[0]?.n ?? -1) === 0, carry: canon(carry) === canon(["eC:ADVANCE:235000:2031-10:APPROVED:true", "mA:DEDUCTION:372500:2031-10:APPROVED:true"]),
    };
    ck("S4.10", r, "1 ok · JV · carry", `${res.map(shown).join(" ")} dr=${dr} carry=${carry.join(",")}`);
  }
  {
    // ORACLE-EDIT (H3.7 builder): a run posted in a book is paid through markPaidRun (pay entry Dr 2120 / Cr bank) — markPaid of a booked v2 run now
    //   delegates there and needs a pay account + a pay date inside the wage month (2031 fixture ⇒ `now` injected); "exactly one PAID" unchanged
    const pr = await Promise.all([0, 1].map(() => PY("markPaidRun", cA, RS ?? "∅", { financeAccountId: FIN34, paidOn: "2031-09-30", now: N_OCT1 })));
    ck("S4.11", { one: pr.filter((x) => x.ok).length === 1, paid: (await runRow(RS))?.status === "PAID" }, "1 ok · PAID", pr.map(shown).join(" "));
  }
  {
    const q = await OT.requestOt(cA, V.owner, { employeeId: E.mB, date: "2031-09-06", start: "09:00", end: "19:00" }, { now: bk("2031-09-06", "20:00") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    await OT.decideOtRequest(cA, V.owner, q?.id ?? "∅", "APPROVED", { now: N_OCT1 }).catch(() => null);
    const row = (await rows(`SELECT "amountSatang" AS a, "periodKey" AS p, kind::text AS k FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'OT_REQUEST'`, E.mB)).map((x: Any) => `${x.k}:${x.a}:${x.p}`);
    ck("S4.12", { req: !!q?.id, row: canon(row) === canon(["OT:200000:2031-10"]) }, "OT 200,000 @2031-10", row.join(",") || "∅");
  }
  // ── S4.13 Oct ──
  const c2 = await createV2(cA, V.pay1, OCT, PAY_OCT, A.pay1, N_NOV1);
  const RO_ = c2.value?.id as string | undefined;
  {
    const [iA, iB, iC] = [await itemBy(RO_, E.mA), await itemBy(RO_, E.mB), await itemBy(RO_, E.eC)];
    const applied = async (emp: string, code: string) => {
      let s = 0;
      for (const run of [RS, RO_]) for (const l of (await itemBy(run, emp))?.snapshotJson?.lines ?? []) if (l.code === code) s += -Number(l.amountSatang);
      return s;
    };
    const r = {
      ok: c2.ok, mA: money(iA) === "2700000/100000/100000/0/2600000/0/300000", mB: money(iB) === "8200000/100000/100000/14167/8085833/200000/0", eC: money(iC) === "1265000/75000/75000/0/1190000/0/235000",
      adv: (await applied(E.eC, "ADVANCE")) === 900000, claim: (await applied(E.mA, "DEDUCTION")) === 627500, sso2: canon(iA?.lawRowIds) === canon(lawIds.filter((x) => !x.endsWith("-sso")).sort()),
    };
    ck("S4.13", r, "Oct literal · Σ two periods", `${shown(c2)} A=${money(iA)} B=${money(iB)} C=${money(iC)}`);
  }
  {
    const rv = await PY("reverseRun", cA, RS ?? "∅", "qc", A.owner);
    const cb = await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD' AND "runId" = $2`, sA, RO_ ?? "∅");
    ck("S4.14", { code: !rv.ok && codeOf(rv) === "CARRY_BOUND" && rv.text === T.carryBound, paid: (await runRow(RS))?.status === "PAID", bound: Number(cb[0]?.n) === 2 }, "CARRY_BOUND", shown(rv));
  }
  {
    const ap = await approve(cA, RO_, A.pay3);
    const pd = await PY("markPaidRun", cA, RO_ ?? "∅", { financeAccountId: FIN34, paidOn: "2031-10-31", now: N_NOV1 }); // ORACLE-EDIT (H3.7 builder): as S4.11 (booked run ⇒ pay entry)
    const r1 = await PY("reverseRun", cA, RO_ ?? "∅", "qc", A.owner);
    const r2 = await PY("reverseRun", cA, RS ?? "∅", "qc", A.owner);
    const [s1, s2] = [await runRow(RS), await runRow(RO_)];
    const carry = (await rows(`SELECT status::text AS s FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, sA)).map((x: Any) => x.s);
    const fixtureIds = Object.values(ADJ);
    const fixtureRows = fixtureIds.length ? await rows(`SELECT status::text AS s, "runId" FROM "HrPayAdjustment" WHERE id = ANY($1::text[])`, fixtureIds) : [];
    const rev = async (je: string | null | undefined) => (je ? await P.accountJournalEntry.count({ where: { reversalOfId: je } }).catch(() => -1) : -1);
    const r = {
      chain: ap.ok && pd.ok && r1.ok && r2.ok, both: s1?.status === "REVERSED" && s2?.status === "REVERSED", carry: carry.length === 3 && carry.every((s) => s === "REJECTED"),
      rows: fixtureRows.length === fixtureIds.length && fixtureRows.every((x: Any) => x.s === "APPROVED" && x.runId === null), jv: (await rev(s1?.journalEntryId)) === 1 && (await rev(s2?.journalEntryId)) === 1,
    };
    ck("S4.15", r, "reverse both · restored", `${shown(ap)} ${shown(r1)} ${shown(r2)} carry=${carry.join(",")}`);
  }
  // ── S4.16 stale (system B) ──
  const dayB = async () => (await rows(`SELECT id FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = '2031-09-01'`, E.eS))[0]?.id as string | undefined;
  const recB = async () => JG.recomputeAttendanceDay(cB, V.owner, { dayId: (await dayB()) ?? "∅", reason: "แก้ผลตรวจ QC" }, { now: N_OCT1 }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  let RB: string | undefined;
  {
    const r0 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
    const outId = await att(sB, E.eS, "OUT", bk("2031-09-01", "15:00"), reB);
    await recB();
    const r1 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
    RB = r1.value?.id;
    const iS = await itemBy(RB, E.eS);
    await P.hrAttendance.updateMany({ where: { id: outId }, data: { at: bk("2031-09-01", "16:00") } });
    await recB();
    const a = await approve(cB, RB, A.pay3);
    const r = {
      blocked: !r0.ok && codeOf(r0) === "WORK_ENTRIES" && r0.text === T.weBlocked, ok: r1.ok && money(iS) === "2000000/87500/87500/0/1912500/0/0",
      approve: !a.ok && codeOf(a) === "WORK_ENTRIES" && (await runRow(RB))?.status === "DRAFT",
    };
    ck("S4.16", r, "WORK_ENTRIES ×2 · ok between", `${shown(r0)} ${shown(r1)} ${money(iS)} ${shown(a)}`);
    if (RB) await pay.deleteDraftRun(cB, RB, A.owner).catch(() => null);
  }
  {
    const req = (c: Any, emp: string) => PY("requestAdjustment", c, { employeeId: emp, periodKey: "2031-12", kind: "REFUND", amountSatang: 100, requestedById: U.owner.id });
    const [v1, v2] = [await req(cV, E.eV), await req(cB, E.eS)];
    ck("S4.17", { v1: !v1.ok && v1.text === T.refundV1, v2: v2.ok }, "refundV1 · ok", `${shown(v1)} ${shown(v2)}`);
  }
  // ── S4.18 (controller ruling 4, phase B): a refused approve leaves no carry rows ──
  {
    const sN = await sys("ทีมติดลบ");
    const cN = { tenantId: TT, systemId: sN };
    const eN = await me(sN, "เอ็น", { unitId: u1 });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: sN, employeeId: eN, baseSalarySatang: 100, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    await adj(sN, eN, SEP, "ADVANCE", 50000);
    await PY("setPayrollEngine", cN, V.owner, { engineVersion: 2 }, { now: N_OCT1 });
    const cr = await createV2(cN, V.owner, SEP, PAY_SEP, A.owner);
    const ap = await approve(cN, cr.value?.id, A.owner);
    const carry = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, sN))[0]?.n ?? -1);
    const it = await itemBy(cr.value?.id, eN);
    const r = {
      created: cr.ok, refused: !ap.ok && codeOf(ap) === "NEGATIVE_NET" && ap.text === String(T.negativeNet ?? "∅").replace("{names}", `เอ็น ${tag}`), draft: (await runRow(cr.value?.id))?.status === "DRAFT", noCarry: carry === 0,
      item: Number(it?.netSatang) < 0 && (it?.snapshotJson?.carry ?? []).length === 0 && (it?.snapshotJson?.receivable ?? []).length === 0,
    };
    ck("S4.18", r, "NEGATIVE_NET · 0 carry rows", `${shown(cr)} ${shown(ap)} carry=${carry} net=${it?.netSatang}`);
    if (cr.value?.id) await pay.deleteDraftRun(cN, cr.value.id, A.owner).catch(() => null);
  }
  // ── fix round 1 (controller F1–F10 + coverage) — own systems per check (qc-hr-h3.4-lib.mts) ──
  const FXE = {
    P, TT, tag, ck, T, LAW_KEY, sys: (n: string) => sys(n), me: (s: string, n: string, o: Record<string, unknown> = {}) => me(s, n, o), adj, att, PY, rows, itemBy, runRow, bk, V, A, U, u1, u2, OT, JG,
    SC: await loadOpt(`${H}stock-charge.ts`, "@/lib/modules/hr/stock-charge"), pay, mkUser: (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>) => mk(t, r, ua, p),
    PAY_SEP, PAY_OCT, N_OCT1, N_NOV1, WE: await loadOpt(`${H}work-entries.ts`, "@/lib/modules/hr/work-entries"),
  };
  await runFixRound1(FXE);
  await runFixRound2(FXE); // fix round 2 (controller G1–G6)
  await runFixRound3({ ...FXE, T2, sysIn: (t: string, n: string) => sys(n, t), meIn: (t: string, s: string, n: string, o: Record<string, unknown> = {}) => me(s, n, o, t) }); // fix round 3 (H1–H3)
  await runMergeRound({ ...FXE, BF: await loadOpt(`${H}bank-files/service.ts`, "@/lib/modules/hr/bank-files/service") }); // merge round (H3.5 bank files)
  // ── S5 races (system B) ──
  const del = async () => {
    for (const r of await liveRuns(sB, SEP)) await pay.deleteDraftRun(cB, r.id, A.owner).catch(() => null);
  };
  {
    const res = await Promise.all([0, 1, 2].map(() => createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1)));
    const dups = res.filter((x) => !x.ok && x.text === dupText(SEP)).length;
    ck("S5.1", { one: res.filter((x) => x.ok).length === 1, dups: dups === 2, live: (await liveRuns(sB, SEP)).length === 1 }, "1 ok · 2 dup", res.map(shown).join(" "));
    await del();
  }
  {
    const h = await holdAdvisory(P, `hr:payroll:run:${sB}:${SEP}`, async () => undefined, () => createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1));
    ck("S5.2", { waited: h.waited, ok: h.res.ok }, "waits then ok", `${h.waited} ${shown(h.res)} ${h.holderErr}`);
    await del();
  }
  {
    const q = await pay.requestAdjustment(cB, { employeeId: E.eS, periodKey: SEP, kind: "ALLOWANCE", amountSatang: 10000, requestedById: U.owner.id }).catch(() => null);
    const [, cr] = await Promise.all([pay.decideAdjustment(cB, q?.id ?? "∅", "APPROVED", A.pay3).catch(() => null), createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1)]);
    const row = (await rows(`SELECT status::text AS s, "runId", "periodKey" AS p FROM "HrPayAdjustment" WHERE id = $1`, q?.id ?? "∅"))[0];
    const runId = cr.value?.id;
    const r = { ok: cr.ok, xor: row?.s === "APPROVED" && ((row.runId === runId && row.p === SEP) !== (row.runId === null && row.p === OCT)) };
    ck("S5.3", r, "bound XOR moved", `${shown(cr)} row=${short(row, 80)}`);
    await del();
  }
  {
    const id = await adj(sB, E.eS, SEP, "ALLOWANCE", 20000);
    const [ca, cr] = await Promise.all([pay.cancelAdjustment(cB, id, A.owner).catch((e: unknown) => ({ ok: false, reason: errText(e) })), createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1)]);
    const row = (await rows(`SELECT "runId" FROM "HrPayAdjustment" WHERE id = $1`, id))[0];
    const iS = await itemBy(cr.value?.id, E.eS);
    // ORACLE-EDIT (H3.4 builder, phase B): S5.3's ALLOWANCE 10,000 stays APPROVED in 2031-09 when it bound (its draft is deleted, the row is not) ⇒
    //   it is legitimately in this run too — compare the run's add with the other bound rows of eS instead of a bare 0 / 20,000
    const others = Number((await rows(`SELECT COALESCE(SUM("amountSatang"), 0)::int AS n FROM "HrPayAdjustment" WHERE "runId" = $1 AND "employeeId" = $2 AND id <> $3 AND kind::text IN ('OT','COMMISSION','BONUS','ALLOWANCE','REFUND')`, cr.value?.id ?? "∅", E.eS, id))[0]?.n ?? 0);
    const gone = !row && Number(iS?.addSatang) === others && ca?.ok;
    const kept = !!row && row.runId === cr.value?.id && Number(iS?.addSatang) === others + 20000 && !ca?.ok;
    ck("S5.4", { ok: cr.ok, xor: gone !== kept }, "gone XOR bound", `${shown(cr)} cancel=${ca?.ok} row=${short(row, 60)} add=${iS?.addSatang}`);
    await del();
  }
  // ── S7 H3.2-guarded ──
  if (!H32 || !AP || AP.__err) {
    chk("S7.1", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.2", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.3", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.4", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.5", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.6", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.7", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
    chk("S7.8", true, "n/a", "n/a — H3.2 absent (hr/attendance-pay.ts)");
  } else {
    const A_ = (fn: string, ...a: unknown[]) => callMod(AP, F.attPay, fn, a);
    // ORACLE-EDIT (H3.4 builder, phase B): the S5.3/S5.4 race rows (ALLOWANCE 10,000 / 20,000 of eS in 2031-09) outlive their deleted drafts —
    //   reject the leftover unbound ones so the S7.1 literal (no other additions) stays the hand arithmetic of the oracle notes
    await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET status = 'REJECTED' WHERE "employeeId" = $1 AND kind::text = 'ALLOWANCE' AND "runId" IS NULL AND "sourceType" IS NULL`, E.eS);
    await A_("saveAttendancePayPolicy", cB, V.owner, { enabled: true });
    await callMod(await loadOpt(`${H}work-entries.ts`, "@/lib/modules/hr/work-entries"), "work-entries", "buildWorkEntrySnapshot", [cB, V.owner, { periodKey: SEP }, { now: N_OCT1 }]);
    {
      // S7.5 (fix r1 coverage): policy in force for 2031 (enabled now ⇒ interval from this month on) · work hours pulled · deductions NOT synced ⇒ ATTENDANCE_SYNC
      const c0 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
      const a0 = await approve(cB, c0.value?.id, A.pay3);
      ck("S7.5", { created: c0.ok, gate: !a0.ok && codeOf(a0) === "ATTENDANCE_SYNC", draft: (await runRow(c0.value?.id))?.status === "DRAFT" }, "ATTENDANCE_SYNC", `${shown(c0)} ${shown(a0)}`);
      if (c0.value?.id) await pay.deleteDraftRun(cB, c0.value.id, A.owner).catch(() => null);
    }
    await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
    const late = (await rows(`SELECT id FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status = 'PENDING'`, E.eS))[0]?.id;
    await pay.decideAdjustment(cB, late ?? "∅", "APPROVED", A.owner).catch(() => null);
    const cr = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
    const i = await itemBy(cr.value?.id, E.eS);
    const ln = (i?.snapshotJson?.lines ?? []).find((l: Any) => l.code === "LATE_RULE");
    ck("S7.1", { ok: cr.ok, line: ln?.amountSatang === -2777, wht: i?.snapshotJson?.whtIncomeSatang === 1997223, net: Number(i?.netSatang) === 1909723 }, "LATE_RULE −2,777", `${shown(cr)} ${short(ln, 80)} net=${i?.netSatang}`);
    {
      // S7.3 (controller, phase B): bound deduction → run approved (JV) → reversed → rebuilt → work hours + deductions re-synced → approved ⇒ settled money = entitlement
      const a1 = await approve(cB, cr.value?.id, A.pay3);
      const rv = await PY("reverseRun", cB, cr.value?.id ?? "∅", "qc h3.4 S7.3", A.owner);
      const cr2 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
      await callMod(await loadOpt(`${H}work-entries.ts`, "@/lib/modules/hr/work-entries"), "work-entries", "buildWorkEntrySnapshot", [cB, V.owner, { periodKey: SEP }, { now: N_OCT1 }]);
      await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      const a2 = await approve(cB, cr2.value?.id, A.pay3);
      const i2 = await itemBy(cr2.value?.id, E.eS);
      const lates = await rows(`SELECT status::text AS s, "runId" FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status::text <> 'REJECTED'`, E.eS);
      const ln2 = (i2?.snapshotJson?.lines ?? []).find((l: Any) => l.code === "LATE_RULE");
      const r = {
        first: a1.ok && rv.ok && (await runRow(cr.value?.id))?.status === "REVERSED", rebuilt: cr2.ok && a2.ok && (await runRow(cr2.value?.id))?.status === "APPROVED",
        money: ln2?.amountSatang === -2777 && Number(i2?.netSatang) === 1909723 && Number(i2?.deductSatang) === 2777, oneRow: lates.length === 1 && lates[0]?.runId === cr2.value?.id,
      };
      ck("S7.3", r, "money = entitlement after reverse + rebuild", `${shown(a1)} ${shown(rv)} ${shown(cr2)} ${shown(a2)} net=${i2?.netSatang} lates=${short(lates, 80)}`);
      if (cr2.value?.id) await PY("reverseRun", cB, cr2.value.id, "qc h3.4 S7.3 cleanup", A.owner);
    }
    {
      // S7.4: an employee whose only source data in the month is a punch (no roster/attendance day/schedule) counts as having source data
      const WE = await loadOpt(`${H}work-entries.ts`, "@/lib/modules/hr/work-entries");
      const eP = await me(sB, "พี", { unitId: u1 });
      await att(sB, eP, "IN", bk("2031-09-20", "08:00"), null);
      let got: Any = null;
      try {
        got = await WE.workEntrySourceEmployeesInTx(P, cB, SEP, [eP]);
      } catch (e) {
        got = errText(e);
      }
      const body = fnBody(stripComments(rd(`${H}work-entries.ts`)), "workEntrySourceEmployeesInTx");
      const r = { found: got instanceof Set && got.has(eP), distinct: /workEntryPunchEmployeesInTx\(/.test(body) && !/workEntryPunchesInTx\(/.test(body) && !/\bTAKE\b/.test(body), judge: /distinct:\s*\["employeeId"\]/.test(fnBody(rd(`${H}judge.ts`), "workEntryPunchEmployeesInTx")) };
      ck("S7.4", r, "punch-only employee found · distinct read", short(got instanceof Set ? [...got] : got, 80));
    }
    await del();
    await P.hrAttendance.updateMany({ where: { id: eSin }, data: { at: bk("2031-09-01", "07:30") } });
    await recB();
    const st = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
    ck("S7.2", { refused: !st.ok && st.text === T.attStale }, "H3.2 stale text", shown(st));
    await del();
    {
      // S7.6 (fix r2 G2): from the stale state above — sync (supersede → PENDING 4,166 for late 30) → approve → create (binds) → correct 07:30→07:17 → pull →
      //   sync waits (bound to a draft) → rebuild OK (stale left out) → sync (supersede → PENDING 2,361) → approve rows → approve run ⇒ settled = 2,361 once
      //   hand: 2,000,000 × 30 / 14,400 = 4,166.67 → 4,166 (floor, H3.2) · × 17 / 14,400 = 2,361.11 → 2,361 (grace 15 ⇒ 07:17 is late 17)
      const pend = async () => { for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status::text = 'PENDING'`, E.eS)) await pay.decideAdjustment(cB, r.id, "APPROVED", A.owner).catch(() => null); };
      const buildB = () => callMod(WEm, "work-entries", "buildWorkEntrySnapshot", [cB, V.owner, { periodKey: SEP }, { now: N_OCT1 }]);
      const WEm = await loadOpt(`${H}work-entries.ts`, "@/lib/modules/hr/work-entries");
      const s0 = await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      await pend();
      const c6 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
      const bound0 = (await itemBy(c6.value?.id, E.eS))?.deductSatang;
      await P.hrAttendance.updateMany({ where: { id: eSin }, data: { at: bk("2031-09-01", "07:17") } });
      await recB();
      await buildB();
      const s1 = await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      const rb = await PY("recomputeDraftRun", cB, c6.value?.id ?? "∅", A.pay1, { viewer: V.pay1, now: N_OCT1 });
      const s2 = await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      await pend();
      const a6 = await approve(cB, c6.value?.id, A.pay3);
      const live = await rows(`SELECT "amountSatang" AS a, status::text AS st, "runId", "periodKey" AS p FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status::text = 'APPROVED'`, E.eS);
      const settled = live.reduce((x: number, r: Any) => x + Number(r.a), 0);
      const i6 = await itemBy(c6.value?.id, E.eS);
      // ORACLE-EDIT (H3.4 fix round 3 H6): the corrected row lives in the month after the live Sept draft (non-leaver ⇒ P+1) and is not in the Sept run; the Sept item deducts 0
      ck("S7.6", { s0: s0.ok, created: c6.ok && Number(bound0) === 4166, rebuilt: rb.ok, s2: s2.ok, approved: a6.ok, once: settled === 2361 && live.length === 1, where: live[0]?.p === "2031-10" && live[0]?.runId === null, item: Number(i6?.deductSatang) === 0 }, "no loop · settled 2,361", `${shown(c6)} b0=${bound0} s1=${short(s1.value, 60)} ${shown(rb)} ${shown(a6)} live=${short(live, 80)}`);
      if (a6.ok) await PY("reverseRun", cB, c6.value?.id ?? "∅", "qc cleanup", A.owner);
      else if (c6.value?.id) await pay.deleteDraftRun(cB, c6.value.id, A.owner).catch(() => null);
      // S7.7 (fix r3 H5): a leaver (end 2031-09-30) — late 20 bound in the Sept draft (2,777) → corrected to late 17 → pull → sync waits → rebuild →
      //   sync puts the corrected row in Sept itself (the leaver's last period, run still DRAFT) → approve the row (stays in Sept) → approve run refused
      //   INPUTS_CHANGED (approved row not bound) → rebuild binds it → approve ⇒ Sept item deducts 2,361 exactly once · hand 2,000,000 × 17 / 14,400 = 2,361.11 → 2,361
      const eL = await me(sB, "ลาออก7", { unitId: u1, endDate: "2031-09-30" });
      await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: sB, employeeId: eL, baseSalarySatang: 2000000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
      const reL = await ent(sB, shB, eL, "2031-09-02", u1);
      const inL = await att(sB, eL, "IN", bk("2031-09-02", "07:20"), reL);
      await att(sB, eL, "OUT", bk("2031-09-02", "15:00"), reL);
      for (const d of ["2031-09-08", "2031-09-15", "2031-09-22", "2031-09-29", "2031-10-01"]) await JG.runAttendanceJobs({ now: bk(d), tenantId: TT });
      await buildB();
      await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      const pendL = async () => { for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status::text = 'PENDING'`, eL)) await pay.decideAdjustment(cB, r.id, "APPROVED", A.owner).catch(() => null); };
      await pendL();
      const c7 = await createV2(cB, V.pay1, SEP, PAY_SEP, A.pay1);
      const b7 = Number((await itemBy(c7.value?.id, eL))?.deductSatang);
      await P.hrAttendance.updateMany({ where: { id: inL }, data: { at: bk("2031-09-02", "07:17") } });
      const dL = (await rows(`SELECT id FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = '2031-09-02'`, eL))[0]?.id;
      await JG.recomputeAttendanceDay(cB, V.owner, { dayId: dL ?? "∅", reason: "แก้ผลตรวจ QC" }, { now: N_OCT1 }).catch(() => null);
      await buildB();
      await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      const rb7 = await PY("recomputeDraftRun", cB, c7.value?.id ?? "∅", A.pay1, { viewer: V.pay1, now: N_OCT1 });
      await A_("syncAttendanceDeductions", cB, V.owner, { periodKey: SEP }, { now: N_OCT1 });
      // merge round minor B: the corrected row is still PENDING in Sept ⇒ approve refused (attPending) — H3.2's gate alone would let it through
      const a7p = await approve(cB, c7.value?.id, A.pay3);
      await pendL();
      // merge round minor A: one stale (no header) + one bindable APPROVED row of Sept ⇒ still refused
      const rawStale = `qcstale${tag}`;
      await P.$executeRawUnsafe(`INSERT INTO "HrPayAdjustment" (id, "tenantId", "systemId", "employeeId", "periodKey", kind, "amountSatang", status, "requestedById", "sourceType", "sourceRef", "createdAt") VALUES ($1, $2, $3, $4, $5, 'DEDUCTION', 100, 'APPROVED', $6, 'LATE_RULE', $7, now())`, rawStale, TT, sB, eL, SEP, U.owner.id, `att:${SEP}:${eL}:99`);
      const a7s = await approve(cB, c7.value?.id, A.pay3);
      await P.$executeRawUnsafe(`DELETE FROM "HrPayAdjustment" WHERE id = $1`, rawStale);
      const a7a = await approve(cB, c7.value?.id, A.pay3);
      const rb7b = await PY("recomputeDraftRun", cB, c7.value?.id ?? "∅", A.pay1, { viewer: V.pay1, now: N_OCT1 });
      const a7 = await approve(cB, c7.value?.id, A.pay3);
      const i7 = await itemBy(c7.value?.id, eL);
      const liveL = await rows(`SELECT "amountSatang" AS a, "periodKey" AS p, "runId" FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'LATE_RULE' AND status::text = 'APPROVED'`, eL);
      ck("S7.8", { pendingBlocks: !a7p.ok && codeOf(a7p) === "ATTENDANCE_PENDING" && a7p.text === T.attPending, staleAndBindable: !a7s.ok }, "minor A/B refusals", `${shown(a7p)} ${shown(a7s)}`);
      ck("S7.7", { bound: c7.ok && b7 === 2777, rebuilt: rb7.ok && rb7b.ok, refusedFirst: !a7a.ok && codeOf(a7a) === "INPUTS_CHANGED", approved: a7.ok, item: Number(i7?.deductSatang) === 2361, once: liveL.length === 1 && Number(liveL[0]?.a) === 2361 && liveL[0]?.p === SEP && liveL[0]?.runId === c7.value?.id }, "leaver: corrected 2,361 deducted once in Sept", `${shown(c7)} b=${b7} ${shown(a7a)} ${shown(a7)} d=${i7?.deductSatang} live=${short(liveL, 90)}`);
      if (a7.ok) await PY("reverseRun", cB, c7.value?.id ?? "∅", "qc cleanup", A.owner);
      else if (c7.value?.id) await pay.deleteDraftRun(cB, c7.value.id, A.owner).catch(() => null);
    }
  }
  // ── S8 v1 ──
  {
    const TD = await fx.newTenant("-frozen", "QC HR H3.4 แช่แข็ง");
    const out = await frozenControls(P, fx, TD, T2, U.other, tag, async () => "ok");
    chk("S8.1", out.digests[0], out.digests[1], out.digests[2]);
  }
  {
    let id = "";
    let err = "";
    try {
      id = (await pay.createPayrollRun(cV, { periodKey: SEP, payDate: PAY_SEP }))?.id ?? "";
    } catch (e) {
      err = errText(e);
    }
    const ap = await pay.approveRun(cV, id || "∅").catch((e: unknown) => ({ ok: false, note: errText(e) }));
    const pd = await pay.markPaid(cV, id || "∅").catch(() => ({ ok: false }));
    const rv = await pay.reverseRun(cV, id || "∅", "qc", A.owner).catch(() => ({ ok: false }));
    const run = await runRow(id || undefined);
    const it = await itemBy(id || undefined, E.eV);
    const r = { ok: !!id && ap?.ok && pd?.ok && rv?.ok, v1: run?.engineVersion === 1 && run?.createdById === null && run?.status === "REVERSED", money: money(it) === "1500000/75000/75000/0/1425000/0/0" };
    ck("S8.2", r, "v1 cycle unchanged", `${err || "created"} ${money(it)}`);
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  runPure(R, OR, V2);
  const fz = await fitnessNoEnv();
  chk("X12.1", fz.ok, "exit 0 ×2", fz.note);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const left: string[] = [];
  const ids = fx.tenants.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`).catch(() => [])) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass++) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
    await cleanupFx(P, fx, SLUG);
    for (const t of tables) {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? 0);
      if (n !== 0) left.push(`${t}=${n}`);
    }
  } else await cleanupFx(P, fx, SLUG);
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
  const lawLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE 'qc-h34-%'`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
  const actAfter = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
  const users = await P.user.count({ where: { email: { startsWith: `${SLUG}-` } } }).catch(() => -1);
  const tn = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
  if (lawLeft !== 0) left.push(`HrLawTable(qc-h34)=${lawLeft}`);
  if (actBefore >= 0 && actAfter !== actBefore) left.push(`ACTIVE law ${actBefore}→${actAfter}`);
  if (users !== 0) left.push(`user=${users}`);
  if (tn !== 0) left.push(`tenant(${SLUG_PREFIX}*)=${tn}`);
  console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length}) · ACTIVE law rows after cleanup ${actAfter}`);
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
