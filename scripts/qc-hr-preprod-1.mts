// QC — HR V2 · fix ticket HR-PREPROD-1 (six pre-prod debts) · brief ledger/hr-briefs/hr-brief-PREPROD-1.md · notes ledger/wo-notes/hr-PREPROD-1-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-preprod-1.mts  (--list)
// Registry re-based to e8e3b24f4: every check GREEN there · V1–V9 review checks live in scripts/qc-hr-preprod-1b.mts (same lib)
// Own tenants qc-hr-pp1-* (3 per run) · 2031 dates · own ACTIVE law rows removed in finally · money = integer satang, literals derived in the notes ·
//   base = QC_PP1_BASE || merge-base(HEAD, session/hr) · diff statics are n/a once the base already carries `HR PREPROD-1` (in-base guard)
import { execFileSync } from "node:child_process";
import { type Any, type Base, ROOT, rd, short, errText, failedKeys, canon, sha, isThai, stripComments, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, changedVsBase, diffHunks, makeRegistry, srcFiles } from "./qc-hr-lib.mjs";
import { setupPP1, nextScope, bk, dd, nowOf } from "./qc-hr-preprod-1-lib.mjs";
import { changedFiles, bodyOf } from "./qc-hr-priv-2-lib.mjs";

const SUITE = "qc-hr-preprod-1";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const H = "src/lib/modules/hr/";
// ── pinned contract (brief) ──
const TXT = {
  paid: "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้", // = CORRECTION_TEXT.paid (MONEY-2 gate · R3 second gate)
  noAccess: "ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์ดูค่าจ้างของพนักงานคนนี้", // R4 PAY_SCOPE_NO_ACCESS_TEXT (scope.ts)
  paidLocked: "เปลี่ยน 'ได้รับค่าจ้าง' ของประเภทการลานี้ไม่ได้ เพราะมีใบลาที่อนุมัติแล้วอยู่ในเดือนที่อนุมัติเงินเดือนแล้ว — สร้างประเภทการลาใหม่แทน", // R5 SETTINGS_TEXT.paidLocked
};
const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
ST1|static|C|G|payroll-rules.ts sha frozen
ST2|static|C|G|frozen files unchanged vs base (rules/attendance-pay/judge/ot/labor/reports/correction/prisma/core/api)
ST3|static|C|G|allowed files only · older oracles changed only by explicit-allowlist ORACLE-EDIT (…PREPROD-1) hunks · covers scripts/*.mts
ST4|static|M|G|every changed src hunk carries "HR PREPROD-1" · no bare removals
ST5|static|M|G|no AppSystem settings write outside lockHrSettings + writeHrSettingsKeys
ST6|static|C|G|R4 one pay-scope predicate: payTarget · decideAdjustmentAs · setAdjustmentConsent · giveBackClaim · chargeGate use inPayScope/payScopeWhere · no second copy
ST7|static|M|G|texts: PAY_SCOPE_NO_ACCESS_TEXT (scope.ts, one constant) · SETTINGS_TEXT.paidLocked · each literal once in src · leaveSplitOf exported
ST8|static|m|G|R2 page: REFUND_BEHIND line · PRIV-2 filter on strandedAdjustments kept
R6.1|R6|m|G|runbook 13a (HF-SSO-M2) under row 13 of HANDOVER-H3.md §3
Z0|house|C|G|own law rows: none before · 3 inserted
R1.1|R1|C|G|[db] v1+JV reverse: REVERSED · LATE/ABSENT rows APPROVED unbound 106,250 · heads unchanged
R1.2|R1|C|G|[db] v1+JV re-create binds the same rows · sync writes nothing
R1.3|R1|M|G|[db] v1+JV MONEY-2 leave gate: refuses before reverse · allows after
R1.4|R1|C|G|[db] v2 no-book finalized reverse: REVERSED · rows unbound 106,250 · heads unchanged
R1.5|R1|C|G|[db] v2 no-book re-create: ABSENT_RULE −100,000 + LATE_RULE −6,250 bound · sync writes nothing
R1.6|R1|M|G|[db] v2 no-book leave gate: refuses before · allows after
R1.7|R1|C|G|[db] v2 booked reverse: REVERSED · rows unbound 106,250 · heads unchanged
R1.8|R1|C|G|[db] v2 booked re-create: same lines bound · sync writes nothing
R1.9|R1|M|G|[db] v2 booked leave gate: refuses before · allows after
R2.1|R2|C|G|[db] refund 50,000 in run-less 2031-04 behind approved 2031-05 ⇒ strandedAdjustments lists it · REFUND_BEHIND
R2.2|R2|C|G|[db] moveStrandedAdjustment(refund) ⇒ 2031-06 · APPROVED unbound · audit hr.payadjust.move
R2.3|R2|M|G|[db] 2031-06 draft carries REFUND:+50,000
R2.4|R2|M|G|[db] (Q7) leaver (end 2031-05) refund listed · move refused fixed text · nothing written
R2.5|R2|M|G|[db] control: ordinary give-back (period after lastCovered) not listed
R2.6|R2|M|G|[db] control: old stranded BONUS listed unchanged · moves to 2031-04
R3.1|R3|C|G|[db] SICK 10–14 Mar (5.0) with 28.0 used ⇒ request accepted (PENDING)
R3.2|R3|C|G|[db] approve ⇒ USE −2.0 · note unpaid:3.0;from:2031-03-12
R3.3|R3|M|G|[db] (ruling 1) leaveSplitOf → { paidDays 2, unpaidDays 3, unpaidFrom 2031-03-12 } · leave item paidDays / unpaidDays
R3.4|R3|C|G|[db] balance never negative: used 30.0 · balance 0.0 · available 0.0 · Σ ledger 0
R3.5|R3|C|G|[db] v2 March: UNPAID_LEAVE 12/13/14 Mar −100,000 each = −300,000 · none on 10/11
R3.6|R3|C|G|[db] (V1) 27.5 used ⇒ USE −2.5 · unpaid:2.5;from:2031-03-12 (no ;half) · −50,000 −100,000 −100,000 = −250,000
R3.7|R3|M|G|[db] revoke approved over-balance leave ⇒ use-revert +2.0 only · Σ 2.0
R3.8|R3|C|G|[db] unpaid part in APPROVED Feb ⇒ decideLeave refused CORRECTION_TEXT.paid · PENDING · no USE
R3.9|R3|C|G|[db] same, owner auto-approve ⇒ refused · no row
R3.10|R3|C|G|[db] same, chain apply ⇒ PAID · CANCELLED · no USE
R3.11|R3|M|G|[db] leave spanning Feb(APPROVED)/Mar: paid 27–28 Feb, unpaid 1–3 Mar ⇒ approved · unpaid:3.0;from:2031-03-01
R3.12|R3|M|G|[db] control: MONEY-2 gate — unpaid-policy leave in APPROVED Feb still refused
R3.13|R3|m|G|[db] control: SICK within balance ⇒ USE −2.0 · note null (ruling 2) · no unpaid
R3.14|R3|M|G|[db] control: PERSONAL over quota still refused (LEAVE_TEXT.balance) · no row
R3.15|R3|m|G|[db] control: engine v1 March run unchanged (gross 3,000,000 · no UNPAID_LEAVE)
R3.16|R3|M|G|[db] positive control: unpaid-policy day on the R3 roster = UNPAID_LEAVE −100,000 (fixture basis N = 480)
R4.1|R4|C|G|[db] inbox decideAdjustmentAs: borrowed · other-branch · missing ⇒ PAY_SCOPE_NO_ACCESS_TEXT byte-equal · nothing written
R4.2|R4|C|G|[db] decideAdjustmentAction on borrowed + other-branch rows = not-found answer · nothing written
R4.3|R4|C|G|[db] cancelAdjustmentAction borrowed + other-branch = not-found answer · nothing written
R4.4|R4|C|G|[db] moveStrandedAdjustmentAction borrowed + other-branch = not-found answer · nothing written
R4.5|R4|C|G|[db] setAdjustmentConsent home-less + other-branch = not-found answer · nothing written
R4.6|R4|C|G|[db] giveBackClaim borrowed + other-branch = not-found answer · nothing written
R4.7|R4|C|G|[db] withdrawStockCharge borrowed home-less + other-branch = not-found answer · nothing written
R4.8|R4|M|G|[db] control: all-branch viewer does all 7 on borrowed / home-less rows
R4.9|R4|M|G|[db] control: limited viewer, in-scope home: 6 actions ok
R4.10|R4|m|G|[db] control: inbox decideAdjustmentAs in-scope ok
R5.1|R5|C|G|[db] paid→unpaid flip with approved leave in APPROVED Aug ⇒ paidLocked · row byte-same · no audit
R5.2|R5|C|G|[db] unpaid→paid flip, same ⇒ refused · unchanged
R5.3|R5|M|G|[db] control: approved leave only in open month (+ pending in Aug) ⇒ flip allowed
R5.4|R5|m|G|[db] control: rename + paid unchanged on the locked policy ⇒ allowed
Z1|house|C|G|no residue
Z2|house|M|G|no deadlock
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`PP1-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "PP1-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const BASE = (() => {
  if (process.env.QC_PP1_BASE) return process.env.QC_PP1_BASE;
  for (const ref of ["session/hr", "origin/session/hr"]) {
    try {
      return git(["merge-base", "HEAD", ref]);
    } catch {
      /* next */
    }
  }
  return "";
})();
const atBase = (p: string) => {
  try {
    return git(["show", `${BASE}:${p}`]);
  } catch {
    return "";
  }
};
const IN_BASE = !!BASE && atBase(`${H}payroll.ts`).includes("HR PREPROD-1");

// ═════════════════════════ statics ═════════════════════════
const OWN = ["scripts/qc-hr-preprod-1.mts", "scripts/qc-hr-preprod-1-lib.mts", "scripts/qc-hr-preprod-1b.mts", "scripts/qc-hr-preprod-1c.mts"];
const ALLOWED_SRC = ["payroll.ts", "payroll-actions.ts", "payroll-ui.tsx", "scope.ts", "leave.ts", "leave-rules.ts", "service.ts", "work-entries.ts", "work-entries-rules.ts", "privacy.ts", "ui.tsx", "self.ts", "self-ui.tsx", "settings.ts", "stock-charge.ts"].map((f) => `${H}${f}`).concat(["src/messages/th/common.json", "src/messages/en/common.json"]);
/** explicit ORACLE-EDIT allowlist (brief §ORACLE-EDIT + "possibly money-2 ST3 and priv-2 statics") — every hunk must carry ORACLE-EDIT …PREPROD-1 */
const ORACLE_ALLOW = ["h1.3", "h3.2", "h3.4-lib", "h3.6", "h3.8", "h3.9", "h4.3-lib", "money-2", "priv-2", "priv-2-lib"].map((x) => `scripts/qc-hr-${x}.mts`);
const HR_ALL = srcFiles("src/lib/modules/hr");
const FROZEN = ["prisma", "src/lib/core", `${H}api`, "package.json", "scripts/qc-hr-lib.mts", ...HR_ALL.filter((f) => /\/(payroll-rules\.ts|payroll-run-rules\.ts|payroll-rules-v2\.ts|payroll-rules-sso\.ts|attendance-pay[^/]*|judge[^/]*|ot[-.][^/]*|labor[^/]*|reports[^/]*|correction[^/]*)$/.test(f))];
const code = (p: string) => stripComments(rd(p));
function runStatic(): void {
  ck("ST1", { sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA }, "payroll-rules.ts sha");
  { const d = BASE ? changedVsBase(BASE, FROZEN) : "no base"; ck("ST2", { unchanged: d === "unchanged" }, "unchanged", d.slice(0, 160)); }
  const ch = BASE ? changedFiles(BASE).filter((f) => !f.startsWith("scratchpad/")) : ["∅base"];
  const srcCh = ch.filter((f) => f.startsWith("src/") && !f.endsWith(".json"));
  {
    const bad = IN_BASE ? [] : ch.filter((f) => {
      if (f.startsWith("ledger/") || OWN.includes(f) || ALLOWED_SRC.includes(f)) return false;
      if (ORACLE_ALLOW.includes(f)) { const hs = diffHunks(BASE, f) ?? []; return !hs.length || !hs.every((h) => h.added.some((l) => /ORACLE-EDIT[^\n]*PREPROD-1/.test(l))); }
      return true;
    });
    ck("ST3", { allowed: bad.length === 0 }, "allowed only", IN_BASE ? "n/a · PREPROD-1 in base" : `bad=${bad.slice(0, 8).join(",") || "none"} (changed ${ch.length})`);
  }
  {
    const bad: string[] = [];
    if (!IN_BASE) for (const f of srcCh) {
      const hs = diffHunks(BASE, f);
      if (!hs) { bad.push(`${f}:git`); continue; }
      hs.forEach((h, i) => {
        const mk = h.added.some((l) => l.includes("HR PREPROD-1"));
        if (h.added.length && !mk) bad.push(`${f.split("/").pop()}#${i + 1}`);
        if (!h.added.length && h.removed.length) bad.push(`${f.split("/").pop()}#${i + 1}:bare-removal`);
      });
    }
    ck("ST4", { marked: bad.length === 0 }, "every hunk marked", IN_BASE ? "n/a · PREPROD-1 in base" : bad.slice(0, 8).join(" "));
  }
  {
    const bad: string[] = [];
    for (const f of srcCh) for (const h of diffHunks(BASE, f) ?? []) for (const l of h.added) {
      if (/\bappSystem\s*\.\s*(update|updateMany|upsert)\s*\(|UPDATE\s+"AppSystem"/.test(l) && !/writeHrSettingsKeys/.test(l)) bad.push(f.split("/").pop()!);
    }
    ck("ST5", { none: bad.length === 0 }, "no raw settings write", bad.join(","));
  }
  {
    const pa = code(`${H}payroll-actions.ts`), py = code(`${H}payroll.ts`), sc = code(`${H}stock-charge.ts`);
    const helpers = (src: string) => [...src.matchAll(/(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()/g)].map((m) => m[1] ?? m[2]!).filter((n) => /\b(inPayScope|payScopeWhere)\(/.test(bodyOf(src, n)));
    const uses = (src: string, fn: string) => { const b = bodyOf(src, fn); const hs = helpers(src).filter((n) => n !== fn); return !!b && (/\b(inPayScope|payScopeWhere)\(/.test(b) || hs.some((n) => new RegExp(`\\b${n}\\(`).test(b))); };
    const copies: string[] = [];
    for (const f of srcCh.filter((x) => x !== `${H}scope.ts`)) for (const h of diffHunks(BASE, f) ?? []) for (const l of h.added) if (/unitIds\s*(===\s*"\*"|\.includes\()|function\s+inPayScope|const\s+inPayScope/.test(l)) copies.push(f.split("/").pop()!);
    const r = {
      payTarget: uses(pa, "payTarget"), decideAs: uses(py, "decideAdjustmentAs"), consent: uses(py, "setAdjustmentConsent"), giveBack: uses(py, "giveBackClaim"), chargeGate: uses(sc, "chargeGate"),
      oneDef: !HR_ALL.some((f) => f !== `${H}scope.ts` && /(?:function|const)\s+(inPayScope|payScopeWhere)\b/.test(code(f))), noCopy: copies.length === 0,
    };
    ck("ST6", r, "one predicate", copies.join(","));
  }
  {
    const sc = rd(`${H}scope.ts`), st = rd(`${H}settings.ts`);
    const src = HR_ALL.map((f) => rd(f)).join("\n");
    const count = (s: string) => src.split(s).length - 1;
    const scHunks = BASE && !IN_BASE ? diffHunks(BASE, `${H}scope.ts`) ?? [] : [];
    const scAdded = scHunks.flatMap((h) => h.added).filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l));
    const r = {
      scope: sc.includes(`export const PAY_SCOPE_NO_ACCESS_TEXT = "${TXT.noAccess}"`), oneConst: IN_BASE || (scAdded.length === 1 && /PAY_SCOPE_NO_ACCESS_TEXT/.test(scAdded[0]!) && scHunks.every((h) => !h.removed.length)),
      settings: new RegExp(`paidLocked:\\s*"${TXT.paidLocked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(st), once: count(TXT.noAccess) === 1 && count(TXT.paidLocked) === 1,
      split: /export\s+(async\s+)?function\s+leaveSplitOf\b/.test(rd(`${H}leave.ts`)),
    };
    ck("ST7", r, "texts + leaveSplitOf", `noAccess×${count(TXT.noAccess)} paidLocked×${count(TXT.paidLocked)} scopeAdded=${scAdded.length}`);
  }
  {
    const ui = code(`${H}payroll-ui.tsx`);
    ck("ST8", { line: /REFUND_BEHIND/.test(ui), filter: /strandedAdjustments\(ctx\)[^\n]*allBranches\s*\|\|\s*inPay\(x\.employeeId\)/.test(ui) }, "line + filter");
  }
  {
    const hv = rd("ledger/HANDOVER-H3.md");
    const at = hv.indexOf("13a (HF-SSO-M2)");
    const p = at < 0 ? "" : hv.slice(at, at + 900);
    ck("R6.1", { para: at >= 0, keys: ["v1:SSO:2569/2572/2575", "v1:DEDUCTION:2569/2572/2575", "15,000", "9,000", "2026-01", "875", "G-SSO-GO"].every((k) => p.includes(k)), afterRow13: at > hv.indexOf("| 13") }, "13a paragraph");
  }
}
runStatic();

// ═════════════════════════ DB ═════════════════════════
if (!process.env.DATABASE_URL) {
  console.log("🔴 DATABASE_URL unset — refusing to run the DB part (use scripts/qc-hr.sh)");
  process.exit(finish({ forced: FORCE, crashed: "DATABASE_URL unset", missing: [] }));
}
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage; // before next/*
const { installNetGuard } = (await import("./qc-hr-h4.3-lib.mjs")) as Any;
installNetGuard();
const S = await setupPP1(SUITE);
const { P, tag, rows, safe, runOf, adjOf, itemOf, linesOf, auditN, snapRow, PAY } = S;
console.log(`[${SUITE}] base=${BASE.slice(0, 9)}${IN_BASE ? " (PREPROD-1 in base)" : ""}`);
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const LV = await imp("@/lib/modules/hr/leave"), SV = await imp("@/lib/modules/hr/service"), AP = await imp("@/lib/modules/hr/attendance-pay"), JG = await imp("@/lib/modules/hr/judge");
const WE = await imp("@/lib/modules/hr/work-entries"), STG = await imp("@/lib/modules/hr/settings"), SC = await imp("@/lib/modules/hr/stock-charge"), PV = await imp("@/lib/modules/hr/privacy");
const ACT = await imp("@/lib/modules/hr/payroll-actions");
for (const [k, m] of Object.entries({ LV, SV, AP, JG, WE, STG, SC, PV, ACT })) if (m?.__err) console.log(`  ⚠ import ${k}: ${m.__err}`);
const inS = await nextScope();
const deadlocks = async () => Number((await rows(`SELECT deadlocks::bigint AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? -1);
const num = (v: unknown) => Number(String(v));
const pol = async (TT: string, s: string, category: string, paid: boolean, quota: number | null) =>
  (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category, name: `${category} ${paid ? "p" : "u"} ${tag}`, paid, quotaDays: quota, allowHalfDay: true, allowHours: false } })).id as string;
const leaveRow = async (TT: string, s: string, e: string, type: string, from: string, to: string, policyId: string, days: string, status = "PENDING") =>
  (await P.hrLeave.create({ data: { tenantId: TT, systemId: s, employeeId: e, type, fromDate: dd(from), toDate: dd(to), status, policyId, days, reason: `qc ${tag}` } })).id as string;
const txns = (leaveId: string) => rows(`SELECT kind::text AS k, days::text AS d, "sourceKey" AS sk, note FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 ORDER BY "createdAt", id`, leaveId);
const ledgerSum = async (e: string, p: string) => num((await rows(`SELECT COALESCE(SUM(days), 0)::text AS n FROM "HrLeaveBalanceTxn" WHERE "employeeId" = $1 AND "policyId" = $2 AND "leaveYear" = 2031`, e, p))[0]?.n);
const stOf = async (id: string) => (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, id))[0]?.s;
let crashed = "";
const section = async (name: string, f: () => Promise<void>) => {
  try {
    await f();
  } catch (e) {
    crashed ||= `${name}: ${errText(e)}`;
    console.log(`CRASH ${name} ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
  }
};
const dl0 = await deadlocks();
try {
  ck("Z0", { none: S.lawPresent === 0, inserted: S.lawOk }, "0 present · 3 inserted", `present=${S.lawPresent}`);
  const KB = await S.kit("b", "booked");
  const KN = await S.kit("n", "nobook");
  const K4 = await S.kit("s", "scope");

  // ── R1: reversal with bound LATE/ABSENT rows — v1+JV (KB) · v2 no-book (KN) · v2 booked (KB) ──
  await section("R1", async () => {
    const AUG = "2031-08", N8 = nowOf(AUG);
    const bookB = await KB.book("B");
    const paths: [Any, string, "v1" | "v2n" | "v2b"][] = [[KB, await KB.sys("หักสาย-V1", false), "v1"], [KN, await KN.sys("หักสาย-V2N"), "v2n"], [KB, await KB.sys("หักสาย-V2B"), "v2b"]];
    for (const [k, [K, s, kind]] of paths.entries()) {
      const c = K.c(s);
      if (kind === "v2b") await safe(() => PAY.setPayrollBook(c, K.V.owner, { accountSystemId: bookB }));
      const e = await K.emp(s, `A${k}`, { salary: 3_000_000 });
      const sh = await K.shift(s);
      for (const [d, inHm] of [["2031-08-04", "09:00"], ["2031-08-05", "09:30"], ["2031-08-06", ""], ["2031-08-07", "09:00"], ["2031-08-08", "09:00"]] as const) {
        const re = await K.roster(s, sh, e, d);
        if (inHm) await K.punch(s, e, re, d, inHm);
      }
      const vac = await pol(K.TT, s, "VACATION", true, null);
      const ps = await safe(() => AP.saveAttendancePayPolicy(c, K.V.owner, { enabled: true, late: true, absent: true, earlyOut: false, freeMin: 0, stepMin: 1 }));
      for (const d of ["2031-08-09", "2031-08-16", "2031-08-23", "2031-08-30", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: K.TT }));
      await safe(() => WE.buildWorkEntrySnapshot(c, K.V.owner, { periodKey: AUG }, { now: N8 }));
      const sy0 = await safe(() => AP.syncAttendanceDeductions(c, K.V.owner, { periodKey: AUG }, { now: N8 }));
      for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, s)) await safe(() => PAY.decideAdjustment(c, r.id, "APPROVED", K.ownA));
      const R = kind === "v1" ? await K.createV1(s, AUG) : await K.create(s, AUG);
      const RA = R?.id ? await K.approve(s, R.id) : R;
      const run0 = await runOf(R?.id ?? "");
      const att = () => rows(`SELECT id, status::text AS s, "runId" AS r, "amountSatang" AS a, "sourceType"::text AS src FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text IN ('ABSENT_RULE','LATE_RULE') ORDER BY id`, s);
      const heads = async () => canon(await rows(`SELECT * FROM "HrAttendanceDeduction" WHERE "systemId" = $1 ORDER BY id`, s));
      const amounts = (xs: Any[]) => canon(Object.fromEntries(xs.map((x) => [x.src, Number(x.a)])));
      const WANT = canon({ ABSENT_RULE: 100_000, LATE_RULE: 6_250 });
      const a0 = await att(), h0 = await heads();
      const setup = RA?.ok === true && a0.length === 2 && amounts(a0) === WANT && a0.every((x: Any) => x.s === "APPROVED" && x.r === R?.id) &&
        (kind === "v1" ? !!run0?.jv : kind === "v2n" ? !run0?.book && !run0?.jv && run0?.st?.finalized === true : run0?.book === bookB);
      if (!setup) console.log(`  ⚠ setup R1 ${kind}: ${short({ ps: ps?.ok ?? ps, sy0: sy0?.ok ?? sy0, R: R?.code ?? R?.reason ?? R?.id, RA, a0, run0: { ...run0, st: undefined } }, 500)}`);
      const gate = async () => {
        const id = await leaveRow(K.TT, s, e, "VACATION", "2031-08-06", "2031-08-06", vac, "1.0");
        const r = await P.$transaction((tx: Any) => LV.leavePaidRunRefusalInTx(tx, c, id)).catch((x: unknown) => `THROW ${errText(x)}`);
        await P.hrLeave.delete({ where: { id } });
        return r as string | null;
      };
      const gBefore = await gate();
      const rv = R?.id ? await K.reverse(s, R.id) : R;
      const a1 = await att();
      ck(`R1.${3 * k + 1}`, { setup, reverse: rv?.ok === true, status: (await runOf(R?.id ?? ""))?.status === "REVERSED", rows: a1.length === 2 && a1.every((x: Any) => x.s === "APPROVED" && x.r === null) && amounts(a1) === WANT, heads: (await heads()) === h0 },
        "REVERSED · unbound · 106,250 · heads same", short({ rv: rv?.note ?? rv, a1: a1.map((x: Any) => `${x.src}:${x.s}:${x.r ? "bound" : "∅"}:${x.a}`) }, 240));
      const gAfter = await gate();
      const re = kind === "v1" ? await K.createV1(s, AUG) : await K.create(s, AUG);
      const a2 = await att();
      const ls = re?.id && kind !== "v1" ? (await linesOf(re.id, e)).map((x) => x.replace(/@.*$/, "")) : [];
      const all0 = canon(await rows(`SELECT id, status::text, "runId", "amountSatang", "periodKey" FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY id`, s)), hh0 = await heads();
      const sy = await safe(() => AP.syncAttendanceDeductions(c, K.V.owner, { periodKey: AUG }, { now: N8 }));
      const all1 = canon(await rows(`SELECT id, status::text, "runId", "amountSatang", "periodKey" FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY id`, s));
      ck(`R1.${3 * k + 2}`, { recreate: !!re?.id, same: canon(a2.map((x: Any) => x.id)) === canon(a0.map((x: Any) => x.id)) && a2.every((x: Any) => x.r === re?.id && x.s === "APPROVED") && amounts(a2) === WANT,
        lines: kind === "v1" || (ls.includes("ABSENT_RULE:-100000") && ls.includes("LATE_RULE:-6250")), syncRan: sy?.ok !== false || !!sy?.wait, nothing: all1 === all0 && (await heads()) === hh0 },
      "same rows bound · sync writes nothing", short({ re: re?.code ?? re?.reason ?? (re?.id ? "ok" : re), ls, sy: sy?.ok ?? sy?.reason }, 240));
      ck(`R1.${3 * k + 3}`, { setup, before: gBefore === TXT.paid, after: gAfter === null }, "paid text → null", short({ gBefore, gAfter }, 160));
    }
  });

  // ── R2: refund stuck in a run-less period behind a later approved run (KN) ──
  await section("R2", async () => {
    const K = KN, s = await K.sys("คืนค้าง-R2"), c = K.c(s);
    const e = await K.emp(s, "RE", { salary: 2_000_000 }), eL = await K.emp(s, "RL", { salary: 2_000_000, endDate: "2031-05-20" }), eO = await K.emp(s, "RO", { salary: 2_000_000 });
    const cE = (await K.adj(s, e, "2031-03", "DEDUCTION", 150_000)).id, cL = (await K.adj(s, eL, "2031-03", "DEDUCTION", 150_000)).id;
    const mar = await K.create(s, "2031-03");
    const marA = mar?.id ? await K.approve(s, mar.id) : mar;
    const gE = await K.giveBack(s, cE, 50_000, "2031-04"), gL = await K.giveBack(s, cL, 50_000, "2031-04");
    if (gE?.id) await safe(() => PAY.decideAdjustment(c, gE.id, "APPROVED", K.ownA));
    const st0 = ((await safe(() => PAY.strandedAdjustments(c))) ?? []) as Any[];
    const bon = (await P.hrPayAdjustment.create({ data: { tenantId: K.TT, systemId: s, employeeId: eO, periodKey: "2031-03", kind: "BONUS", amountSatang: 70_000, status: "APPROVED", note: "qc bonus", requestedById: K.U.pay1.id } })).id as string;
    const may = await K.create(s, "2031-05");
    const mayA = may?.id ? await K.approve(s, may.id) : may;
    const setup = marA?.ok === true && !!gE?.id && !!gL?.id && mayA?.ok === true;
    if (!setup) console.log(`  ⚠ setup R2: ${short({ mar: mar?.reason ?? mar?.id, marA, gE, gL, may: may?.reason ?? may?.id, mayA }, 400)}`);
    const st1 = ((await safe(() => PAY.strandedAdjustments(c))) ?? []) as Any[];
    const of = (xs: Any[], id: string) => (Array.isArray(xs) ? xs : []).find((x) => x?.id === id);
    ck("R2.5", { setup: !!gE?.id && !!gL?.id, notListed: Array.isArray(st0) && !of(st0, gE?.id ?? "∅") && !of(st0, gL?.id ?? "∅") }, "not listed", short(st0, 120));
    const rE = of(st1, gE?.id ?? "∅");
    ck("R2.1", { setup, listed: !!rE && rE.kind === "REFUND" && rE.periodKey === "2031-04" && rE.amountSatang === 50_000 && rE.reason === "REFUND_BEHIND" }, "listed REFUND_BEHIND", short(rE ?? st1.map((x: Any) => `${x.kind}:${x.periodKey}`), 160));
    const b = of(st1, bon);
    ck("R2.6", { listed: !!b && canon({ ...b, reason: undefined }) === canon({ id: bon, employeeId: eO, periodKey: "2031-03", kind: "BONUS", status: "APPROVED", amountSatang: 70_000, note: "qc bonus", crmCommissionId: null }) && b.reason !== "REFUND_BEHIND",
      moved: (await safe(() => PAY.moveStrandedAdjustment(c, bon, K.ownA)))?.movedTo === "2031-04" }, "unchanged · → 2031-04", short(b, 200));
    const a0 = await auditN(K.TT);
    const mv = gE?.id ? await safe(() => PAY.moveStrandedAdjustment(c, gE.id, K.ownA)) : null;
    const r1 = await adjOf(gE?.id ?? "");
    const au = await rows(`SELECT after FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action = 'hr.payadjust.move'`, K.TT, gE?.id ?? "");
    ck("R2.2", { setup, moved: mv?.ok === true && mv?.movedTo === "2031-06", row: r1?.p === "2031-06" && r1?.s === "APPROVED" && r1?.r === null && Number(r1?.a) === 50_000, audit: au.some((x: Any) => x.after?.periodKey === "2031-06") && (await auditN(K.TT)) === a0 + 1 },
      "→ 2031-06 · audit", short({ mv, r1 }, 200));
    const jun = await K.create(s, "2031-06");
    const lj = jun?.id ? (await linesOf(jun.id, e)).map((x) => x.replace(/@.*$/, "")) : [];
    ck("R2.3", { setup, created: jun?.ok === true, refund: lj.includes("REFUND:50000") }, "REFUND:+50,000", short({ jun: jun?.reason ?? jun?.ok, lj }, 200));
    const rL = of(st1, gL?.id ?? "∅");
    const sL = await snapRow("HrPayAdjustment", gL?.id ?? ""), aL = await auditN(K.TT);
    const mvL = gL?.id ? await safe(() => PAY.moveStrandedAdjustment(c, gL.id, K.ownA)) : null;
    const why = String(mvL?.reason ?? "");
    ck("R2.4", { setup, listed: rL?.reason === "REFUND_BEHIND", refused: mvL?.ok === false && isThai(why) && !/2031|RL /.test(why) && !why.includes(gL?.id ?? "∅") && !mvL?.__throw,
      same: (await snapRow("HrPayAdjustment", gL?.id ?? "")) === sL && (await auditN(K.TT)) === aL }, "listed · fixed refusal · unchanged", short({ rL: rL?.reason, mvL }, 220));
  });

  // ── R3: SICK beyond the paid balance (KN) ──
  await section("R3", async () => {
    const K = KN, TT = K.TT;
    const preUsed = async (s: string, e: string, p: string, used: string) => {
      await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: s, employeeId: e, policyId: p, kind: "GRANT", days: "30.0", leaveYear: 2031, effectiveDate: dd("2031-01-01"), sourceKey: `grant:${e}:${p}:2031` } });
      const l = await leaveRow(TT, s, e, "SICK", "2031-01-02", "2031-01-31", p, used, "APPROVED");
      await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: s, employeeId: e, policyId: p, kind: "USE", days: `-${used}`, leaveYear: 2031, effectiveDate: dd("2031-01-02"), sourceKey: `use:${l}`, leaveId: l } });
    };
    const req = (s: string, e: string, from: string, to: string, p: string, type = "SICK") => safe(() => SV.requestLeave(K.c(s), { employeeId: e, type, fromDate: from, toDate: to, reason: "qc ป่วย", actorUserId: K.U.owner.id, policyId: p }));
    const dec = (s: string, id: string) => safe(() => SV.decideLeave(K.c(s), id, "APPROVED", K.U.pay1.id, { from: "PENDING" }).then(() => ({ ok: true })));
    const use = async (id: string) => (await txns(id)).find((t: Any) => t.sk === `use:${id}`);
    // numbers system s3 (v2): E1 28.0 used · E2 27.5 used · E3 April revoke · E9 within balance
    const s3 = await K.sys("ลาป่วย-R3"), sick = await pol(TT, s3, "SICK", true, 30), pers = await pol(TT, s3, "PERSONAL", true, 3);
    const [E1, E2, E3, E9] = [await K.emp(s3, "S1"), await K.emp(s3, "S2"), await K.emp(s3, "S3"), await K.emp(s3, "S9")];
    await preUsed(s3, E1, sick, "28.0");
    await preUsed(s3, E2, sick, "27.5");
    await preUsed(s3, E3, sick, "28.0");
    const sh = await K.shift(s3);
    for (const e of [E1, E2]) for (const d of ["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14"]) await K.roster(s3, sh, e, d);
    const r1 = await req(s3, E1, "2031-03-10", "2031-03-14", sick);
    const l1 = (r1?.id ?? "") as string;
    const row1 = (await rows(`SELECT status::text AS s, days::text AS d FROM "HrLeave" WHERE id = $1`, l1))[0];
    ck("R3.1", { accepted: !!l1 && row1?.s === "PENDING" && num(row1?.d) === 5 }, "PENDING 5.0", short(r1?.reason ?? row1, 160));
    const d1 = l1 ? await dec(s3, l1) : r1;
    const u1 = await use(l1);
    ck("R3.2", { approved: d1?.ok === true && (await stOf(l1)) === "APPROVED", use: num(u1?.d) === -2 && u1?.note === "unpaid:3.0;from:2031-03-12" }, "USE −2.0 · note", short({ d1: d1?.reason ?? d1, u1 }, 200));
    {
      const f = LV.leaveSplitOf;
      let sp: unknown = null;
      if (typeof f === "function") sp = await Promise.resolve().then(() => f(K.c(s3), [l1])).catch(() => Promise.resolve().then(() => f(P, [l1])).catch((x: unknown) => ({ __err: errText(x) })));
      const a = (sp instanceof Map ? sp.get(l1) : (sp as Any)?.[l1]) as Any; // ruling 1: { paidDays, unpaidDays, unpaidFrom } per leave id
      const items = await safe(() => PV.leaveItemsForViewer(K.c(s3), { ...K.V.owner, userId: K.U.owner.id }));
      const it = [...(items?.history ?? []), ...(items?.pending ?? [])].find((x: Any) => x?.id === l1);
      ck("R3.3", { reader: !!a && num(a.paidDays) === 2 && num(a.unpaidDays) === 3 && a.unpaidFrom === "2031-03-12", dto: !!it && num(it.paidDays) === 2 && num(it.unpaidDays) === 3 }, "paidDays 2 · unpaidDays 3 · unpaidFrom 12 Mar", short({ sp, it }, 240));
    }
    {
      const bal = await safe(() => LV.leaveBalances(K.c(s3), K.V.owner, { employeeId: E1, year: 2031 }));
      const it = (bal?.items ?? []).find((x: Any) => x.policyId === sick);
      ck("R3.4", { approved: (await stOf(l1)) === "APPROVED", item: it?.used === "30.0" && it?.balance === "0.0" && it?.available === "0.0", sum: (await ledgerSum(E1, sick)) === 0 }, "30.0 · 0.0 · 0.0 · Σ 0", short(it, 200));
    }
    const r2 = await req(s3, E2, "2031-03-10", "2031-03-14", sick);
    const l2 = (r2?.id ?? "") as string;
    const d2 = l2 ? await dec(s3, l2) : r2;
    const u2 = await use(l2);
    const E10 = await K.emp(s3, "S10"), unp3 = await pol(TT, s3, "OTHER", false, null); // positive control of the roster basis (480 min ⇒ 100,000/day)
    await K.roster(s3, sh, E10, "2031-03-20");
    await leaveRow(TT, s3, E10, "OTHER", "2031-03-20", "2031-03-20", unp3, "1.0", "APPROVED");
    const r9 = await req(s3, E9, "2031-03-17", "2031-03-18", sick);
    const d9 = r9?.id ? await dec(s3, r9.id) : r9;
    for (const d of ["2031-03-15", "2031-03-22", "2031-03-29", "2031-04-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
    const mar = await K.create(s3, "2031-03");
    const unpaid = async (e: string) => (mar?.id ? await linesOf(mar.id, e) : []).filter((x) => x.startsWith("UNPAID_LEAVE:"));
    const up1 = await unpaid(E1), up2 = await unpaid(E2);
    const tot = (xs: string[]) => xs.reduce((t, x) => t + Number(x.split(":")[1]!.split("@")[0]), 0);
    ck("R3.5", { run: mar?.ok === true, lines: canon(up1.sort()) === canon(["UNPAID_LEAVE:-100000@2031-03-12", "UNPAID_LEAVE:-100000@2031-03-13", "UNPAID_LEAVE:-100000@2031-03-14"]), total: tot(up1) === -300_000 },
      "−300,000 on 12–14", short({ mar: mar?.reason ?? mar?.ok, up1 }, 220));
    ck("R3.16", { run: mar?.ok === true, line: canon(await unpaid(E10)) === canon(["UNPAID_LEAVE:-100000@2031-03-20"]) }, "−100,000 @20 Mar", short(await unpaid(E10), 120));
    ck("R3.6", { approved: d2?.ok === true, use: num(u2?.d) === -2.5 && u2?.note === "unpaid:2.5;from:2031-03-12",
      lines: canon(up2.sort()) === canon(["UNPAID_LEAVE:-100000@2031-03-13", "UNPAID_LEAVE:-100000@2031-03-14", "UNPAID_LEAVE:-50000@2031-03-12"]), total: tot(up2) === -250_000 }, "−250,000", short({ d2: d2?.reason ?? d2, u2, up2 }, 240));
    {
      const u9 = await use((r9?.id ?? "") as string);
      ck("R3.13", { approved: d9?.ok === true, use: num(u9?.d) === -2 && u9?.note === null, noLines: mar?.id ? (await unpaid(E9)).length === 0 : false }, "USE −2.0 · no unpaid", short({ d9: d9?.reason ?? d9, u9 }, 160));
      const q = await req(s3, E9, "2031-03-24", "2031-03-28", pers, "PERSONAL");
      const n = (await rows(`SELECT 1 FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = '2031-03-24'::date`, E9)).length;
      ck("R3.14", { refused: !q?.id && q?.__throw?.message === LV.LEAVE_TEXT?.balance, noRow: n === 0 }, "LEAVE_TEXT.balance", short(q?.reason ?? q?.id, 160));
    }
    {
      const r3 = await req(s3, E3, "2031-04-07", "2031-04-11", sick);
      const l3 = (r3?.id ?? "") as string;
      const d3 = l3 ? await dec(s3, l3) : r3;
      const rv = l3 ? await safe(() => SV.decideLeave(K.c(s3), l3, "REJECTED", K.U.pay1.id, { from: "APPROVED" }).then(() => ({ ok: true }))) : r3;
      const t3 = await txns(l3);
      ck("R3.7", { approved: d3?.ok === true, revoked: rv?.ok === true && (await stOf(l3)) === "REJECTED", rows: canon(t3.map((t: Any) => `${t.k}:${num(t.d)}`)) === canon(["USE:-2", "ADJUST:2"]), sum: (await ledgerSum(E3, sick)) === 2 }, "+2.0 only · Σ 2.0", short({ d3: d3?.reason ?? d3, rv: rv?.reason ?? rv, t3 }, 200));
    }
    // gate system sg: Feb run APPROVED first, then leaves
    const sg = await K.sys("ลาป่วยเดือนปิด-G"), sickG = await pol(TT, sg, "SICK", true, 30), unpG = await pol(TT, sg, "PERSONAL", false, null);
    const [G4, G5, G6, G7, G8] = [await K.emp(sg, "G4"), await K.emp(sg, "G5"), await K.emp(sg, "G6"), await K.emp(sg, "G7"), await K.emp(sg, "G8")];
    for (const e of [G4, G5, G6, G7]) await preUsed(sg, e, sickG, "28.0");
    const feb = await K.create(sg, "2031-02");
    const febA = feb?.id ? await K.approve(sg, feb.id) : feb;
    const setupG = febA?.ok === true;
    if (!setupG) console.log(`  ⚠ setup R3 gate: ${short({ feb: feb?.reason ?? feb?.id, febA }, 200)}`);
    {
      const r = await req(sg, G4, "2031-02-24", "2031-02-28", sickG);
      const d = r?.id ? await dec(sg, r.id) : r;
      ck("R3.8", { setupG, pending: !!r?.id, refused: d?.__throw?.message === TXT.paid, st: (await stOf(r?.id ?? "")) === "PENDING", noUse: !(await use(r?.id ?? "")) }, "paid text · PENDING", short({ r: r?.reason ?? r?.id, d: d?.reason ?? d }, 200));
    }
    {
      const r = await req(sg, G7, "2031-02-27", "2031-03-03", sickG);
      const d = r?.id ? await dec(sg, r.id) : r;
      const u = await use(r?.id ?? "");
      ck("R3.11", { setupG, approved: d?.ok === true && (await stOf(r?.id ?? "")) === "APPROVED", use: num(u?.d) === -2 && u?.note === "unpaid:3.0;from:2031-03-01" }, "approved · note", short({ r: r?.reason ?? r?.id, d: d?.reason ?? d, u }, 200));
    }
    {
      const l = await leaveRow(TT, sg, G8, "PERSONAL", "2031-02-20", "2031-02-20", unpG, "1.0");
      const d = await dec(sg, l);
      ck("R3.12", { setupG, refused: d?.__throw?.message === TXT.paid, st: (await stOf(l)) === "PENDING" }, "paid text", short(d?.reason ?? d, 160));
    }
    {
      await P.hrEmployee.update({ where: { id: G5 }, data: { linkedUserId: K.U.owner.id } });
      const q = await safe(() => SV.requestLeave(K.c(sg), { employeeId: G5, type: "SICK", fromDate: "2031-02-24", toDate: "2031-02-28", reason: "qc ป่วย", actorUserId: K.U.owner.id, policyId: sickG }));
      const n = (await rows(`SELECT 1 FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = '2031-02-24'::date`, G5)).length;
      ck("R3.9", { setupG, refused: !q?.id && (q?.__throw?.message === TXT.paid || q?.reason === TXT.paid), noRow: n === 0 }, "paid text · no row", short(q?.reason ?? q?.id, 160));
      await P.hrEmployee.update({ where: { id: G5 }, data: { linkedUserId: null } });
    }
    {
      const ap = (await P.approvalPolicy.create({ data: { tenantId: TT, name: `qc pp1 ${tag}`, entityType: "HrLeave", systemId: sg } })).id as string;
      const l = await leaveRow(TT, sg, G6, "SICK", "2031-02-24", "2031-02-28", sickG, "5.0");
      const rq = (await P.approvalRequest.create({ data: { tenantId: TT, policyId: ap, entityType: "HrLeave", entityId: l, systemId: sg, status: "APPROVED", requestedById: K.U.owner.id, idempotencyKey: `approval-HrLeave-${l}`, decidedAt: new Date() } })).id as string;
      const r = await safe(() => LV.applyLeaveDecision({ tenantId: TT, systemId: sg, leaveId: l, requestId: rq, approved: true }));
      await P.approvalPolicy.update({ where: { id: ap }, data: { active: false } });
      ck("R3.10", { setupG, refused: r?.applied === false && r?.code === "PAID", st: (await stOf(l)) === "CANCELLED", noUse: !(await use(l)) }, "PAID · CANCELLED", short(r, 160));
    }
    {
      const s1 = await K.sys("ลาป่วยรุ่นหนึ่ง-V1", false), sick1 = await pol(TT, s1, "SICK", true, 30);
      const e = await K.emp(s1, "V1");
      await preUsed(s1, e, sick1, "28.0");
      const r = await req(s1, e, "2031-03-10", "2031-03-14", sick1);
      if (r?.id) await dec(s1, r.id);
      const v = await K.createV1(s1, "2031-03");
      const it = v?.id ? await itemOf(v.id, e) : null;
      ck("R3.15", { run: !!v?.id, gross: Number(it?.g) === 3_000_000, noUnpaid: !!it && !canon(it.j ?? {}).includes("UNPAID_LEAVE") }, "gross 3,000,000", short({ v: v?.reason ?? v?.id, g: it?.g }, 160));
    }
  });

  // ── R4: limited payroll viewer vs out-of-pay-scope money rows (K4) ──
  await section("R4", async () => {
    const K = K4, TT = K.TT, s = await K.sys("ขอบเขต-R4"), c = K.c(s);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const eB = await K.emp(s, "B", { unit: K.u2 }), eH = await K.emp(s, "H", { unit: null }), eA = await K.emp(s, "A", { unit: K.u1 }), eO = await K.emp(s, "O", { unit: K.u2 });
    for (const e of [eB, eH]) await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: s, employeeId: e, unitId: K.u1, fromDate: dd(from), toDate: null } });
    const clB = (await K.adj(s, eB, "2031-02", "DEDUCTION", 100_000)).id, clA = (await K.adj(s, eA, "2031-02", "DEDUCTION", 100_000)).id, clO = (await K.adj(s, eO, "2031-02", "DEDUCTION", 100_000)).id;
    const feb = await K.create(s, "2031-02");
    const febA = feb?.id ? await K.approve(s, feb.id) : feb;
    const pend = async (e: string, kind = "BONUS") => (await K.adj(s, e, "2031-05", kind, 30_000, false)).id;
    const strand = async (e: string) => (await P.hrPayAdjustment.create({ data: { tenantId: TT, systemId: s, employeeId: e, periodKey: "2031-02", kind: "BONUS", amountSatang: 40_000, status: "APPROVED", note: "qc r4", requestedById: K.U.pay1.id } })).id as string;
    const [dB, dA, xB, xA, iB, iO, iA, kH, kA] = [await pend(eB), await pend(eA), await pend(eB), await pend(eA), await pend(eB), await pend(eO), await pend(eA), await pend(eH, "DEDUCTION"), await pend(eA, "DEDUCTION")];
    const [mB, mA, mB2, mO] = [await strand(eB), await strand(eA), await strand(eB), await strand(eO)];
    const [dO, xO, kO] = [await pend(eO), await pend(eO), await pend(eO, "DEDUCTION")]; // ruling 5: home other branch, not borrowed
    const [dB2, xB2, iB2, kH2] = [await pend(eB), await pend(eB), await pend(eB), await pend(eH, "DEDUCTION")]; // all-branch control rows (the probed rows stay as the limited call left them)
    const stock = async (e: string, k: string) => (await safe(() => SC.requestStockCharge(c, K.V.owner, { requestKey: `qcpp1${tag}${k}`, employeeId: e, kind: "DAMAGE", amountSatang: 20_000, description: "qc ของเสียหาย", consent: { confirmed: true, ref: "QC-1", at: today } })))?.chargeId ?? "";
    const [chH, chA, chH2, chO] = [await stock(eH, "hhhh"), await stock(eA, "aaaa"), await stock(eH, "hhh2"), await stock(eO, "oooo")];
    const setup = febA?.ok === true && !!chH && !!chA && !!chH2 && !!chO && [dB, dA, xB, xA, iB, iO, iA, kH, kA, dB2, xB2, iB2, kH2, clO, dO, xO, kO].every(Boolean);
    if (!setup) console.log(`  ⚠ setup R4: ${short({ feb: feb?.reason ?? feb?.id, febA, chH, chA }, 300)}`);
    const MISS = "qcpp1missing000000";
    const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ systemId: s, ...o })) f.set(k, v); return f; };
    const act = (who: Any, fn: string, o: Record<string, string>) => inS(who.cookie, `/app/sys/${s}/hr/payroll`, () => ACT[fn](fd(o))).catch((e: unknown) => ({ __throw: errText(e) }));
    const ops: Record<string, (who: Any, id: string) => Promise<Any>> = {
      decideAs: (w, id) => safe(() => PAY.decideAdjustmentAs(c, vOfW(w), id, "APPROVED")),
      decide: (w, id) => act(w, "decideAdjustmentAction", { id, status: "APPROVED" }),
      cancel: (w, id) => act(w, "cancelAdjustmentAction", { id }),
      move: (w, id) => act(w, "moveStrandedAdjustmentAction", { id }),
      consent: (w, id) => safe(() => PAY.setAdjustmentConsent(c, vOfW(w), { id, consent: true })),
      giveBack: (w, id) => safe(() => PAY.giveBackClaim(c, { userId: w.id }, { claimId: id, amountSatang: 10_000, periodKey: "2031-03", note: null })),
      withdraw: (w, id) => safe(() => SC.withdrawStockCharge(c, vOfW(w), id)),
    };
    function vOfW(w: Any) { return { role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id }; }
    const world = async (ids: string[]) => canon([await auditN(TT), ...(await Promise.all(ids.map(async (id) => (await snapRow("HrPayAdjustment", id)) + (await snapRow("HrStockCharge", id))))),
      (await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1`, s))[0]?.n]);
    const strip = (r: Any) => (r && typeof r === "object" ? { ...r, __throw: r.__throw ? errText(r.__throw) : undefined } : r);
    const probe = async (id: string, op: string, row: string, other: string) => {
      const w0 = await world([row, other]);
      const out = await ops[op]!(K.U.lim, row);
      const outO = await ops[op]!(K.U.lim, other);
      const w1 = await world([row, other]);
      const miss = await ops[op]!(K.U.lim, MISS);
      const r = { setup, refused: out?.ok === false, sameAsMissing: canon(strip(out)) === canon(strip(miss)), otherSame: canon(strip(outO)) === canon(strip(miss)), nothing: w0 === w1 };
      ck(id, r, "= not-found ×2 · nothing written", short({ out: strip(out), outO: strip(outO), miss: strip(miss) }, 300));
    };
    {
      const w0 = await world([iB, iO]);
      const [a, b, m] = [await ops.decideAs!(K.U.lim, iB), await ops.decideAs!(K.U.lim, iO), await ops.decideAs!(K.U.lim, MISS)];
      ck("R4.1", { setup, borrowed: a?.ok === false && a?.reason === TXT.noAccess, other: canon(b) === canon(a), missing: canon(m) === canon(a), nothing: (await world([iB, iO])) === w0 }, "PAY_SCOPE_NO_ACCESS_TEXT ×3", short({ a, b, m }, 260));
    }
    await probe("R4.2", "decide", dB, dO);
    await probe("R4.3", "cancel", xB, xO);
    await probe("R4.4", "move", mB, mO);
    await probe("R4.5", "consent", kH, kO);
    await probe("R4.6", "giveBack", clB, clO);
    await probe("R4.7", "withdraw", chH, chO);
    const okR = (r: Any) => !!r && r.ok === true;
    const allRes: Record<string, Any> = {};
    for (const [op, id] of [["decideAs", iB2], ["decide", dB2], ["cancel", xB2], ["move", mB2], ["consent", kH2], ["giveBack", clB], ["withdraw", chH2]] as const) allRes[op] = await ops[op]!(K.U.all, id);
    ck("R4.8", Object.fromEntries(Object.entries(allRes).map(([k, v]) => [k, okR(v)])), "all ok", short(Object.fromEntries(Object.entries(allRes).filter(([, v]) => !okR(v)).map(([k, v]) => [k, strip(v)])), 260));
    const inRes: Record<string, Any> = {};
    for (const [op, id] of [["decide", dA], ["cancel", xA], ["move", mA], ["consent", kA], ["giveBack", clA], ["withdraw", chA]] as const) inRes[op] = await ops[op]!(K.U.lim, id);
    ck("R4.9", Object.fromEntries(Object.entries(inRes).map(([k, v]) => [k, okR(v)])), "all ok", short(Object.fromEntries(Object.entries(inRes).filter(([, v]) => !okR(v)).map(([k, v]) => [k, strip(v)])), 260));
    const ia = await ops.decideAs!(K.U.lim, iA);
    ck("R4.10", { ok: okR(ia), st: (await adjOf(iA))?.s === "APPROVED" }, "approved", short(strip(ia), 160));
  });

  // ── R5: paid flag of a leave policy (KN) ──
  await section("R5", async () => {
    const K = KN, TT = K.TT, s = await K.sys("ประเภทลา-R5"), c = K.c(s);
    const e = await K.emp(s, "P5");
    const [pA, pB, pC] = [await pol(TT, s, "SICK", true, null), await pol(TT, s, "PERSONAL", false, null), await pol(TT, s, "VACATION", true, null)];
    const r = await K.create(s, "2031-08"); // run first (no leave yet), then the approved leaves land in the APPROVED month
    const ra = r?.id ? await K.approve(s, r.id) : r;
    await leaveRow(TT, s, e, "SICK", "2031-08-12", "2031-08-12", pA, "1.0", "APPROVED");
    await leaveRow(TT, s, e, "PERSONAL", "2031-08-13", "2031-08-13", pB, "1.0", "APPROVED");
    await leaveRow(TT, s, e, "VACATION", "2031-09-10", "2031-09-10", pC, "1.0", "APPROVED");
    await leaveRow(TT, s, e, "VACATION", "2031-08-14", "2031-08-14", pC, "1.0", "PENDING");
    const setup = ra?.ok === true;
    if (!setup) console.log(`  ⚠ setup R5: ${short({ r: r?.reason ?? r?.id, ra }, 200)}`);
    const upd = (id: string, patch: Any) => safe(() => STG.updateLeavePolicy(c, K.V.owner, id, patch));
    for (const [id, p, cid] of [[pA, false, "R5.1"], [pB, true, "R5.2"]] as const) {
      const s0 = await snapRow("HrLeavePolicy", id), a0 = await auditN(TT);
      const u = await upd(id, { paid: p });
      ck(cid, { setup, refused: u?.ok === false && u?.reason === TXT.paidLocked, same: (await snapRow("HrLeavePolicy", id)) === s0, noAudit: (await auditN(TT)) === a0 }, "paidLocked · unchanged", short(u, 200));
    }
    const uc = await upd(pC, { paid: false });
    ck("R5.3", { setup, ok: uc?.ok === true, paid: (await rows(`SELECT paid FROM "HrLeavePolicy" WHERE id = $1`, pC))[0]?.paid === false }, "flipped", short(uc, 160));
    const ua = await upd(pA, { name: `ป่วย ใหม่ ${tag}`, paid: true });
    const ra2 = (await rows(`SELECT paid, name FROM "HrLeavePolicy" WHERE id = $1`, pA))[0];
    ck("R5.4", { setup, ok: ua?.ok === true, row: ra2?.paid === true && ra2?.name === `ป่วย ใหม่ ${tag}` }, "renamed", short(ua, 160));
  });
} catch (e) {
  crashed ||= errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  const dl1 = await deadlocks();
  chk("Z2", dl1 === dl0 && dl0 >= 0, "0 new deadlocks", `${dl0}→${dl1}`);
  const left = await S.cleanup().catch((e: unknown) => [`cleanup threw ${errText(e)}`]);
  chk("Z1", left.length === 0, "none", left.join(","));
}
process.exit(finish({ forced: FORCE, crashed, missing: [] }));
