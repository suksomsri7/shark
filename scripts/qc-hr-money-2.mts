// QC — HR V2 · fix ticket HR-MONEY-2 (H5.2 money hunt M1 M2 m3 m4 m5) · brief ledger/hr-briefs/hr-brief-MONEY-2.md · numbers ledger/wo-notes/hr-MONEY-2-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Tenant qc-hr-money2-<stamp> · 2031 dates · opts.now injected · own ACTIVE law rows (qc-hr-money2-<tag>-*) removed in finally · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_MONEY2_BASE=60659e7c0 pnpm exec tsx scripts/qc-hr-money-2.mts
// Money = integer satang · every expectation is a literal derived by hand in the note · base = QC_MONEY2_BASE || merge-base(HEAD, session/hr) ·
//   statics vs base are n/a once the base already carries `HR MONEY-2` (in-base guard)
import { execFileSync } from "node:child_process";
import { type Any, type Base, ROOT, rd, short, errText, textOf, failedKeys, canon, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, changedVsBase, diffHunks, makeRegistry, jsonOf, flat } from "./qc-hr-lib.mjs";
import { setupMoney2, underLock, bk, dd, NOW } from "./qc-hr-money-2-lib.mjs";

const SUITE = "qc-hr-money-2";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const H = "src/lib/modules/hr/";
// ── pinned contract (brief §R) ──
const TXT = {
  paid: "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้", // = CORRECTION_TEXT.paid (correction-rules.ts) — R5 reuses it
  refundBound: "การคืนเงินของรายการหักในรอบนี้อยู่ในรอบจ่ายงวดถัดไปแล้ว — ลบร่างหรือกลับรายการรอบงวดถัดไปก่อน แล้วจึงกลับรายการรอบนี้",
  limit: "ยอดรวมของรอบจ่ายนี้เกิน 21,474,836.47 บาท ซึ่งเป็นยอดสูงสุดที่ระบบเงินเดือนรับได้ต่อรอบ — แยกพนักงานไปอีกระบบ HR แล้วสร้างรอบจ่ายแยกกัน",
};
const VOID_ACTION = "hr.payadjust.refund_void";
const INT4 = 2_147_483_647;

const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
ST1|static|C|G|payroll-rules.ts byte-frozen (sha)
ST2|static|C|G|frozen files unchanged vs base (payroll-run-rules · payroll-journal-rules · labor-rules · judge · work-entries(-rules) · correction(-rules) · ai.ts · account module · prisma)
ST3|static|M|G|payroll.ts · labor.ts · leave.ts · service.ts change only by hunks whose added lines carry "HR MONEY-2"
ST4|static|m|R|item flag REFUND_HELD labelled in th + en (hr payroll flags fl_REFUND_HELD)
ST5|static|m|R|R5 refusal text comes from CORRECTION_TEXT.paid (leave.ts or service.ts references CORRECTION_TEXT.paid — no copy)
Z0|house|C|G|own law rows: none present before · 3 inserted
R1.0|R1|M|G|[db] control: give-back accepted · Sep draft (before any reversal) carries REFUND:+50,000 for the claim's employee
R1.1|R1|C|R|[db] reverse the deduction run (v2, no later run) ⇒ ok · pending refund REJECTED + unbound in the same tx · audit hr.payadjust.refund_void {code DEDUCTION_REVERSED, claimId}
R1.2|R1|C|R|[db] re-create + approve the deduction run ⇒ claim deducted again (DEDUCTION:-150000) · Sep = BASE:2000000 only, gross 2,000,000 · refund stays REJECTED (nothing restored)
R1.3|R1|M|R|[db] legacy (pre-fix reversal left refund APPROVED): cancelAdjustment(claim) ⇒ ok · claim gone · refund REJECTED · audit refund_void {code CLAIM_CANCELLED}
R1.4|R1|C|R|[db] build backstop: refund whose claim is not bound to a live APPROVED/PAID run ⇒ Sep draft has no REFUND line (BASE only) · refund APPROVED unbound · item flag REFUND_HELD
R1.5|R1|C|R|[db] approve backstop: claim loses its run while the refund is bound to the Sep DRAFT ⇒ approve code INPUTS_CHANGED · Sep stays DRAFT
R1.6|R1|C|R|[db] reverse while the refund is bound to a later DRAFT ⇒ code REFUND_BOUND + fixed text · deduction run unchanged · refund APPROVED bound to the draft
R1.7|R1|M|R|[db] after deleting that draft: reverse ok · refund REJECTED unbound
R1.8|R1|M|G|[db] refund already paid in an APPROVED later run ⇒ reverse refused LATER_RUN (today's rule for dependent paid items) · nothing changed
R1.9|R1|C|R|[db] race A (refund row locked): create Sep ∥ reverse Aug — both wait · create binds REFUND:+50000 · reverse REFUND_BOUND · Aug APPROVED
R1.10|R1|C|R|[db] race B (refund row locked): reverse Aug ∥ create Sep — both wait · reverse ok · refund REJECTED · Sep BASE only
R1.11|R1|M|R|[db] v1 path: reverse a v1 run whose claim has a pending refund ⇒ ok · refund REJECTED · audit refund_void {code DEDUCTION_REVERSED}
R2.0|R2|C|G|[db] control: Aug accrual journal (hand) Dr 6000 6,800,000 · Dr 6010 262,500 · Dr 4900 40,000
R2.1|R2|C|R|[db] owner laborMonth Aug all units = ACTUAL 7,062,500 (wage cost before recoveries, refunds excluded, + employer SSO)
R2.2|R2|C|R|[db] ACTUAL = accrual Dr 6000 + Dr 6010 of the same run, to the satang
R2.3|R2|M|R|[db] hr_labor_percent (owner, month) costSatang 7,062,500 basis ACTUAL (same reader)
R2.4|R2|M|R|[db] v1 run (base 15,000 · claim 5,000) ACTUAL = 1,575,000 (earnings 1,500,000 + SSO er 75,000) · v1 approve ok
R2.5|R2|C|R|[db] limited viewer [u2] month u2: cost 3,975,000 (home-u2 staff only) · excludedHeadcount 1 · partial
R2.6|R2|C|G|[db] doubling: outsider eM's Aug item ×2 ⇒ limited [u2] laborMonth u2 byte-identical (canon)
R2.7|R2|M|R|[db] doubling positive control: owner u1 4,116,667 · u2 6,033,333
R3.0|R3|M|G|[db] control: eM has 3 judged work days in Aug with equal workMin > 0
R3.1|R3|M|R|[db] owner u1 = 2,058,334 (eM 2 of 3 days at u1 + remainder satang to home u1)
R3.2|R3|M|R|[db] owner u2 = 5,004,166 · u1 + u2 = all units 7,062,500
R3.3|R3|M|R|[db] limited viewer [u1] month u1 = 2,058,334 · excludedHeadcount 0
R4.1|R4|M|G|[db] v2 run totalling exactly 2,147,483,647 is created (boundary accepted)
R4.2|R4|M|R|[db] v2 recompute that would total 2,147,483,648 ⇒ refused with the fixed text · draft unchanged (totals · digest)
R4.3|R4|M|R|[db] v2 create over the boundary ⇒ {ok:false, code RUN_LIMIT, reason text} · 0 live runs · 0 items
R4.4|R4|m|G|[db] v1 run totalling exactly 2,147,483,647 is created
R4.5|R4|M|R|[db] v1 create over the boundary ⇒ PayrollInputError(text) · 0 runs written
R5.1|R5|M|R|[db] approve an UNPAID leave in a month with an APPROVED run ⇒ refused with CORRECTION_TEXT.paid · stays PENDING
R5.2|R5|m|G|[db] approve a PAID leave in the same month ⇒ ok APPROVED
R5.3|R5|m|G|[db] approve an UNPAID leave in a month without a run ⇒ ok APPROVED
R5.4|R5|M|R|[db] owner's own UNPAID leave created-as-approved in the APPROVED month ⇒ refused with CORRECTION_TEXT.paid · no row
R5.5|R5|m|G|[db] control: same owner leave in September ⇒ created APPROVED
Z1|house|C|G|no residue (tenant · users · own law rows · ACTIVE count)
Z2|house|M|G|no deadlock during the races (pg_stat_database.deadlocks unchanged)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`MONEY-2-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "MONEY-2-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const BASE = (() => {
  if (process.env.QC_MONEY2_BASE) return process.env.QC_MONEY2_BASE;
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
const IN_BASE = !!BASE && atBase(`${H}payroll.ts`).includes("HR MONEY-2");

// ═════════════════════════ statics ═════════════════════════
function runStatic(): void {
  ck("ST1", { sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA }, "payroll-rules.ts sha");
  {
    const files = [`${H}payroll-run-rules.ts`, `${H}payroll-journal-rules.ts`, `${H}labor-rules.ts`, `${H}judge.ts`, `${H}work-entries.ts`, `${H}work-entries-rules.ts`, `${H}correction.ts`, `${H}correction-rules.ts`, `${H}ai.ts`, "src/lib/modules/account", "prisma"];
    const d = IN_BASE ? "n/a · MONEY-2 in base" : BASE ? changedVsBase(BASE, files) : "no base";
    ck("ST2", { unchanged: IN_BASE || d === "unchanged" }, "unchanged", d);
  }
  {
    const files = [`${H}payroll.ts`, `${H}labor.ts`, `${H}leave.ts`, `${H}service.ts`];
    const bad: string[] = [];
    if (!IN_BASE) for (const f of files) {
      const hs = diffHunks(BASE, f);
      if (hs === null) bad.push(`${f}:git`);
      else hs.forEach((h, i) => { if (!h.added.some((l) => /HR MONEY-2/.test(l))) bad.push(`${f.split("/").pop()}#${i + 1}`); });
    }
    ck("ST3", { marked: bad.length === 0 }, "every hunk marked", IN_BASE ? "n/a · MONEY-2 in base" : bad.slice(0, 8).join(" "));
  }
  {
    const has = (p: string) => Object.entries(flat(jsonOf(p) ?? {})).some(([k, v]) => /(^|\.)fl_REFUND_HELD$/.test(k) && typeof v === "string" && !!v);
    ck("ST4", { th: has("src/messages/th/common.json"), en: has("src/messages/en/common.json") }, "fl_REFUND_HELD th + en");
  }
  {
    const src = rd(`${H}leave.ts`) + rd(`${H}service.ts`);
    const rules = rd(`${H}correction-rules.ts`);
    ck("ST5", { reuse: /CORRECTION_TEXT\s*\.\s*paid/.test(src), same: rules.includes(`paid: "${TXT.paid}"`), noCopy: !src.includes(TXT.paid) }, "CORRECTION_TEXT.paid reused · not copied");
  }
}
runStatic();

// ═════════════════════════ DB ═════════════════════════
if (!process.env.DATABASE_URL) {
  console.log("🔴 DATABASE_URL unset — refusing to run the DB part (use scripts/qc-hr.sh)");
  process.exit(finish({ forced: FORCE, crashed: "DATABASE_URL unset", missing: [] }));
}
const S = await setupMoney2(SUITE);
const { P, fx, tag, TT, u1, u2, U, V, ownA, c, sys, setV2, book, emp, rows, safe, create, approve, reverse, adj, giveBack, runOf, adjOf, itemOf, linesOf, flagsOf, auditOf, liveRuns, PAY } = S;
console.log(`[${SUITE}] base=${BASE.slice(0, 9)}${IN_BASE ? " (MONEY-2 in base)" : ""} · tenant ${TT}`);
const LB = (await import("@/lib/modules/hr/labor")) as Any;
const AI = (await import("@/lib/modules/hr/ai")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const LV = (await import("@/lib/modules/hr/leave")) as Any;
const SV = (await import("@/lib/modules/hr/service")) as Any;
const deadlocks = async () => Number((await rows(`SELECT deadlocks::bigint AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? -1);
let crashed = "";
const dl0 = await deadlocks();
try {
  ck("Z0", { none: S.lawPresent === 0, inserted: S.lawOk }, "0 present · 3 inserted", `present=${S.lawPresent}`);

  // ── R1 helper: claim 1,500 ฿ in Aug on a 20,000 ฿ employee (under the s.76 cap 2,000 ฿ ⇒ no carry) · Aug approved · give back 500 ฿ into Sep (approved) ──
  const claimFlow = async (name: string) => {
    const s = await sys(name);
    const e = await emp(s, `E${name.slice(-2)}`, { salary: 2_000_000 });
    const claim = (await adj(s, e, "2031-08", "DEDUCTION", 150_000)).id;
    const cr = await create(s, "2031-08");
    const ap = cr?.id ? await approve(s, cr.id) : cr;
    const gb = await giveBack(s, claim, 50_000, "2031-09");
    const da = gb?.id ? await safe(() => PAY.decideAdjustment(c(s), gb.id, "APPROVED", ownA)) : gb;
    const ok = cr?.ok === true && ap?.ok === true && gb?.ok === true && da?.ok !== false;
    if (!ok) console.log(`  ⚠ claimFlow ${name}: ${short({ cr, ap, gb, da }, 300)}`);
    return { s, e, claim, aug: (cr?.id ?? "") as string, rf: (gb?.id ?? "") as string, ok };
  };
  const voidAudit = async (rf: string, code: string, claim: string) => (await auditOf(rf, VOID_ACTION)).some((a: Any) => a.after?.code === code && a.after?.claimId === claim);

  // R1.1 / R1.2 — lifecycle
  {
    const L = await claimFlow("ชีวิต-L1");
    const rv = await reverse(L.s, L.aug);
    const rf = await adjOf(L.rf);
    const cl = await adjOf(L.claim);
    ck("R1.1", { setup: L.ok, reverse: rv?.ok === true, voided: rf?.s === "REJECTED" && rf?.r === null, claimFree: cl?.s === "APPROVED" && cl?.r === null, audit: await voidAudit(L.rf, "DEDUCTION_REVERSED", L.claim) },
      "refund REJECTED + audit", short({ rv, rf: rf?.s }, 200));
    const re = await create(L.s, "2031-08");
    const reA = re?.id ? await approve(L.s, re.id) : re;
    const augLines = re?.id ? await linesOf(re.id, L.e) : [];
    const sep = await create(L.s, "2031-09");
    const sepLines = sep?.id ? await linesOf(sep.id, L.e) : [];
    const sepItem = sep?.id ? await itemOf(sep.id, L.e) : null;
    ck("R1.2", { recreate: reA?.ok === true && augLines.includes("DEDUCTION:-150000"), sep: canon(sepLines) === canon(["BASE:2000000"]) && Number(sepItem?.g) === 2_000_000, refund: (await adjOf(L.rf))?.s === "REJECTED" },
      "Sep BASE only", short({ augLines, sepLines }, 200));
  }
  // R1.3 / R1.4 — legacy state left by the pre-fix reversal (run REVERSED, claims unbound, refunds APPROVED)
  {
    const s = await sys("ค้างเดิม-C");
    const e3 = await emp(s, "C3", { salary: 2_000_000 });
    const e4 = await emp(s, "C4", { salary: 2_000_000 });
    const dC = (await adj(s, e3, "2031-08", "DEDUCTION", 150_000)).id;
    const dD = (await adj(s, e4, "2031-08", "DEDUCTION", 150_000)).id;
    const cr = await create(s, "2031-08");
    const ap = cr?.id ? await approve(s, cr.id) : cr;
    const gC = await giveBack(s, dC, 50_000, "2031-09");
    const gD = await giveBack(s, dD, 50_000, "2031-09");
    for (const g of [gC, gD]) if (g?.id) await safe(() => PAY.decideAdjustment(c(s), g.id, "APPROVED", ownA));
    const setup = cr?.ok === true && ap?.ok === true && gC?.ok === true && gD?.ok === true;
    await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET status = 'REVERSED'::"PayrollRunStatus" WHERE id = $1`, cr?.id ?? "");
    await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "runId" = NULL WHERE id IN ($1, $2)`, dC, dD);
    const can = await safe(() => PAY.cancelAdjustment(c(s), dC, ownA));
    const rfC = await adjOf(gC?.id ?? "");
    ck("R1.3", { setup, cancel: can?.ok === true, gone: !(await adjOf(dC)), voided: rfC?.s === "REJECTED" && rfC?.r === null, audit: await voidAudit(gC?.id ?? "", "CLAIM_CANCELLED", dC) }, "claim gone · refund REJECTED", short({ can, rf: rfC?.s }, 160));
    const sep = await create(s, "2031-09");
    const l4 = sep?.id ? await linesOf(sep.id, e4) : [];
    const rfD = await adjOf(gD?.id ?? "");
    ck("R1.4", { created: sep?.ok === true, lines: canon(l4) === canon(["BASE:2000000"]), held: rfD?.s === "APPROVED" && rfD?.r === null, flag: sep?.id ? (await flagsOf(sep.id, e4)).includes("REFUND_HELD") : false },
      "no REFUND line · held · flag", short({ sep: sep?.code, l4, rf: rfD }, 220));
  }
  // R1.5 — approve backstop
  {
    const D = await claimFlow("อนุมัติ-D5");
    const sep = await create(D.s, "2031-09");
    const pre = sep?.id ? (await linesOf(sep.id, D.e)).includes("REFUND:50000") : false;
    await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "runId" = NULL WHERE id = $1`, D.claim);
    const ap = sep?.id ? await approve(D.s, sep.id) : sep;
    ck("R1.5", { setup: D.ok && pre, refused: ap?.ok === false && ap?.code === "INPUTS_CHANGED", draft: (await runOf(sep?.id ?? ""))?.status === "DRAFT" }, "INPUTS_CHANGED", short(ap, 160));
  }
  // R1.0 / R1.6 / R1.7 — refund bound to a later DRAFT
  {
    const E = await claimFlow("ร่าง-E6");
    const sep = await create(E.s, "2031-09");
    const l0 = sep?.id ? await linesOf(sep.id, E.e) : [];
    ck("R1.0", { setup: E.ok, lines: canon(l0) === canon(["BASE:2000000", "REFUND:50000"]) || canon(l0) === canon(["REFUND:50000", "BASE:2000000"]) }, "REFUND:+50,000 in the Sep draft", short(l0, 120));
    const rv = await reverse(E.s, E.aug);
    const rf = await adjOf(E.rf);
    ck("R1.6", { refused: rv?.ok === false && rv?.code === "REFUND_BOUND" && rv?.note === TXT.refundBound, aug: (await runOf(E.aug))?.status === "APPROVED", bound: rf?.s === "APPROVED" && rf?.r === sep?.id }, "REFUND_BOUND", short(rv, 200));
    const del = sep?.id ? await safe(() => PAY.deleteDraftRun(c(E.s), sep.id, ownA)) : sep;
    const rv2 = await reverse(E.s, E.aug);
    const rf2 = await adjOf(E.rf);
    ck("R1.7", { del: del?.ok === true, reverse: rv2?.ok === true, voided: rf2?.s === "REJECTED" && rf2?.r === null }, "reverse ok · refund REJECTED", short({ del, rv2, rf2: rf2?.s }, 200));
  }
  // R1.8 — refund already paid (later run APPROVED) ⇒ LATER_RUN
  {
    const Q = await claimFlow("จ่ายแล้ว-P8");
    const sep = await create(Q.s, "2031-09");
    const sa = sep?.id ? await approve(Q.s, sep.id) : sep;
    const paidLine = sep?.id ? (await linesOf(sep.id, Q.e)).includes("REFUND:50000") : false;
    const rv = await reverse(Q.s, Q.aug);
    const rf = await adjOf(Q.rf);
    ck("R1.8", { setup: Q.ok && sa?.ok === true && paidLine, refused: rv?.ok === false && rv?.code === "LATER_RUN", aug: (await runOf(Q.aug))?.status === "APPROVED", refund: rf?.s === "APPROVED" && rf?.r === sep?.id }, "LATER_RUN", short(rv, 160));
  }
  // R1.9 / R1.10 — races on the refund row
  {
    const A = await claimFlow("แข่ง-A9");
    const ra = await underLock(P, { rowSql: `SELECT id FROM "HrPayAdjustment" WHERE id = $1 FOR UPDATE`, args: [A.rf] }, [() => create(A.s, "2031-09"), () => reverse(A.s, A.aug)]);
    const [crA, rvA] = ra.res as Any[];
    const lA = crA?.id ? await linesOf(crA.id, A.e) : [];
    ck("R1.9", { setup: A.ok, holder: !ra.holderErr, waited: ra.blocked.every(Boolean), create: crA?.ok === true && lA.includes("REFUND:50000"), reverse: rvA?.ok === false && rvA?.code === "REFUND_BOUND", aug: (await runOf(A.aug))?.status === "APPROVED" },
      "both wait · REFUND_BOUND", short({ blocked: ra.blocked, crA: crA?.code ?? crA?.ok, rvA: rvA?.code ?? rvA?.ok, lA }, 240));
    const B = await claimFlow("แข่ง-B10");
    const rb = await underLock(P, { rowSql: `SELECT id FROM "HrPayAdjustment" WHERE id = $1 FOR UPDATE`, args: [B.rf] }, [() => reverse(B.s, B.aug), () => create(B.s, "2031-09")]);
    const [rvB, crB] = rb.res as Any[];
    const lB = crB?.id ? await linesOf(crB.id, B.e) : [];
    ck("R1.10", { setup: B.ok, holder: !rb.holderErr, waited: rb.blocked.every(Boolean), reverse: rvB?.ok === true, refund: (await adjOf(B.rf))?.s === "REJECTED", create: crB?.ok === true && canon(lB) === canon(["BASE:2000000"]) },
      "both wait · refund REJECTED · Sep BASE only", short({ blocked: rb.blocked, rvB: rvB?.code ?? rvB?.ok, crB: crB?.code ?? crB?.ok, lB }, 240));
  }

  // ── R2 / R3: booked v2 system, Jul + Aug ──
  const sA = await sys("ค่าแรง-A");
  const BA = await book("A");
  const sb = await safe(() => PAY.setPayrollBook(c(sA), V.owner, { accountSystemId: BA }));
  const eM = await emp(sA, "EM", { unit: u1, salary: 3_000_000 });
  const eB = await emp(sA, "EB", { unit: u2, salary: 2_000_000 });
  const eR = await emp(sA, "ER", { unit: u2, salary: 1_800_000 });
  const jClaim = (await adj(sA, eR, "2031-07", "DEDUCTION", 100_000)).id;
  const jul = await create(sA, "2031-07");
  const julA = jul?.id ? await approve(sA, jul.id) : jul;
  const gbR = await giveBack(sA, jClaim, 40_000, "2031-08");
  if (gbR?.id) await safe(() => PAY.decideAdjustment(c(sA), gbR.id, "APPROVED", ownA));
  await adj(sA, eB, "2031-08", "ADVANCE", 500_000);
  await adj(sA, eB, "2031-08", "DEDUCTION", 150_000);
  // eM rostered 09:00–17:00 Mon 4 + Tue 5 Aug at u1, Wed 6 Aug at u2 (borrowed), punches exactly on shift
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: sA, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  for (const [d, u] of [["2031-08-04", u1], ["2031-08-05", u1], ["2031-08-06", u2]] as const) {
    const re = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA, employeeId: eM, date: dd(d), shiftId: sh, unitId: u, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } })).id as string;
    for (const [k, hm] of [["IN", "09:00"], ["OUT", "17:00"]] as const) await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: eM, kind: k, at: bk(d, hm), rosterEntryId: re, source: "KIOSK" } });
  }
  for (const d of ["2031-08-05", "2031-08-06", "2031-08-07", "2031-08-09", "2031-08-12", "2031-09-02"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  const aug = await create(sA, "2031-08");
  const augA = aug?.id ? await approve(sA, aug.id) : aug;
  const AUG = (aug?.id ?? "") as string;
  const setupA = sb?.ok === true && jul?.ok === true && julA?.ok === true && gbR?.ok === true && aug?.ok === true && augA?.ok === true;
  if (!setupA) console.log(`  ⚠ setup A: ${short({ sb, jul, julA, gbR, aug, augA }, 400)}`);
  const wds = await rows(`SELECT "workMin" AS w FROM "HrWorkDay" WHERE "employeeId" = $1 AND "periodKey" = '2031-08' AND "workMin" > 0`, eM);
  ck("R3.0", { setup: setupA, three: wds.length === 3 && wds.every((w: Any) => Number(w.w) === Number(wds[0]?.w) && Number(w.w) > 0) }, "3 equal worked days", short(wds, 80));
  // journal
  const acc = (await rows(`SELECT e.id FROM "AccountJournalEntry" e WHERE e."refId" = $1 AND e."idempotencyKey" LIKE '%#accrual' AND e."reversalOfId" IS NULL`, AUG))[0];
  const jl = acc ? await rows(`SELECT a.code, l.debit::bigint AS dr, l.credit::bigint AS cr FROM "AccountJournalLine" l JOIN "AccountLedger" a ON a.id = l."accountId" WHERE l."entryId" = $1`, acc.id) : [];
  const dr = (code: string) => jl.filter((l: Any) => l.code === code).reduce((t: number, l: Any) => t + Number(l.dr), 0);
  ck("R2.0", { setup: setupA, d6000: dr("6000") === 6_800_000, d6010: dr("6010") === 262_500, d4900: dr("4900") === 40_000 }, "6,800,000 · 262,500 · 40,000", `6000=${dr("6000")} 6010=${dr("6010")} 4900=${dr("4900")}`);
  const LM = (v: Any, unitId: string | null) => safe(() => LB.laborMonth(c(sA), v, { unitId, periodKey: "2031-08" }, { now: NOW["2031-08"] }));
  const cost = (r: Any) => (r?.ok === true ? Number(r.costSatang) : NaN);
  const [oAll, o1, o2] = [await LM(V.owner, null), await LM(V.owner, u1), await LM(V.owner, u2)];
  ck("R2.1", { basis: oAll?.basis === "ACTUAL", cost: cost(oAll) === 7_062_500 }, "7,062,500", `${oAll?.basis} ${cost(oAll)}`);
  ck("R2.2", { eq: cost(oAll) === dr("6000") + dr("6010") && dr("6000") > 0 }, "= Dr6000 + Dr6010", `${cost(oAll)} vs ${dr("6000") + dr("6010")}`);
  const ai = await safe(() => AI.hrLaborPercent({ tenantId: TT, systemId: sA, actor: { kind: "member", tenantId: TT, userId: U.owner.id, membership: { role: "OWNER" } } }, { periodKey: "2031-08" }));
  ck("R2.3", { cost: ai?.body?.costSatang === 7_062_500, basis: ai?.body?.basis === "ACTUAL" }, "7,062,500 ACTUAL", short(ai?.body ?? ai, 160));
  ck("R3.1", { u1: cost(o1) === 2_058_334 }, "2,058,334", String(cost(o1)));
  ck("R3.2", { u2: cost(o2) === 5_004_166, sum: cost(o1) + cost(o2) === cost(oAll) }, "5,004,166 · sum", `${cost(o2)} sum=${cost(o1) + cost(o2)}`);
  const l2 = await LM(V.payU2, u2);
  ck("R2.5", { cost: cost(l2) === 3_975_000, excl: l2?.excludedHeadcount === 1, partial: l2?.partial === true }, "3,975,000 · excl 1 · partial", short({ c: l2?.costSatang, x: l2?.excludedHeadcount, p: l2?.partial, r: l2?.reason }, 160));
  const l1 = await LM(V.payU1, u1);
  ck("R3.3", { cost: cost(l1) === 2_058_334, excl: l1?.excludedHeadcount === 0 }, "2,058,334 · excl 0", short({ c: l1?.costSatang, x: l1?.excludedHeadcount, r: l1?.reason }, 160));
  // doubling eM's Aug item (every money field + every line ×2, consistent) — then restore
  {
    const orig = (await rows(`SELECT id, "grossSatang" AS g, "ssoEmployeeSatang" AS se, "ssoEmployerSatang" AS sr, "whtSatang" AS w, "netSatang" AS n, "addSatang" AS a, "deductSatang" AS d, "snapshotJson" AS j FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, AUG, eM))[0];
    const before = canon(await LM(V.payU2, u2));
    let after = "";
    let d1: Any = null;
    let d2: Any = null;
    if (orig) {
      const j2 = { ...orig.j, lines: ((orig.j?.lines ?? []) as Any[]).map((l) => ({ ...l, amountSatang: Number(l.amountSatang) * 2, ...(l.requestedSatang !== undefined ? { requestedSatang: Number(l.requestedSatang) * 2 } : {}) })) };
      const set = (k: number, j: unknown) => P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "grossSatang" = $2, "ssoEmployeeSatang" = $3, "ssoEmployerSatang" = $4, "whtSatang" = $5, "netSatang" = $6, "addSatang" = $7, "deductSatang" = $8, "snapshotJson" = $9::jsonb WHERE id = $1`,
        orig.id, Number(orig.g) * k, Number(orig.se) * k, Number(orig.sr) * k, Number(orig.w) * k, Number(orig.n) * k, Number(orig.a) * k, Number(orig.d) * k, JSON.stringify(j));
      await set(2, j2);
      try {
        after = canon(await LM(V.payU2, u2));
        d1 = await LM(V.owner, u1);
        d2 = await LM(V.owner, u2);
      } finally {
        await set(1, orig.j);
      }
    }
    ck("R2.6", { item: !!orig, same: !!after && after === before }, "byte-identical", short({ before: before.slice(0, 80), after: after.slice(0, 80) }, 200));
    ck("R2.7", { u1: cost(d1) === 4_116_667, u2: cost(d2) === 6_033_333 }, "4,116,667 · 6,033,333", `${cost(d1)} · ${cost(d2)}`);
  }
  // v1 system (R2.4 then R1.11)
  {
    const sV = await sys("รุ่นหนึ่ง-V", false);
    const eV = await emp(sV, "V1", { salary: 1_500_000 });
    const dV = (await adj(sV, eV, "2031-08", "DEDUCTION", 500_000)).id;
    const rv1 = await safe(() => PAY.createPayrollRun(c(sV), { periodKey: "2031-08", payDate: bk("2031-08-29", "10:00") }));
    const ap1 = rv1?.id ? await approve(sV, rv1.id) : rv1;
    const lv = await safe(() => LB.laborMonth(c(sV), V.owner, { unitId: null, periodKey: "2031-08" }, { now: NOW["2031-08"] }));
    ck("R2.4", { approve: ap1?.ok === true, basis: lv?.basis === "ACTUAL", cost: cost(lv) === 1_575_000 }, "1,575,000", short({ ap1: ap1?.ok ?? ap1, c: lv?.costSatang, b: lv?.basis }, 160));
    await setV2(sV);
    const gb = await giveBack(sV, dV, 200_000, "2031-09");
    if (gb?.id) await safe(() => PAY.decideAdjustment(c(sV), gb.id, "APPROVED", ownA));
    const rv = rv1?.id ? await reverse(sV, rv1.id) : rv1;
    const rf = await adjOf(gb?.id ?? "");
    ck("R1.11", { setup: gb?.ok === true, reverse: rv?.ok === true, voided: rf?.s === "REJECTED" && rf?.r === null, audit: await voidAudit(gb?.id ?? "", "DEDUCTION_REVERSED", dV) }, "refund REJECTED", short({ gb: gb?.code ?? gb?.ok, rv, rf: rf?.s }, 220));
  }

  // ── R4: int4 boundary ──
  {
    const s4 = await sys("ขอบ-B4");
    const x1 = await emp(s4, "X1", { salary: 1_073_741_823 });
    const x2 = await emp(s4, "X2", { salary: 1_073_741_824 });
    const ok = await create(s4, "2031-08");
    const r0 = await runOf(ok?.id ?? "");
    ck("R4.1", { created: ok?.ok === true, total: Number(r0?.g) === INT4 }, "gross 2,147,483,647", short({ ok: ok?.code ?? ok?.ok, g: r0?.g }, 120));
    await P.hrSalaryProfile.updateMany({ where: { systemId: s4, employeeId: x2 }, data: { baseSalarySatang: 1_073_741_825 } });
    const items0 = canon(await rows(`SELECT "employeeId", "grossSatang" FROM "HrPayrollItem" WHERE "runId" = $1 ORDER BY "employeeId"`, ok?.id ?? ""));
    const rc = ok?.id ? await safe(() => PAY.recomputeDraftRun(c(s4), ok.id, { userId: U.pay1.id, isOwner: false }, { viewer: V.pay1, now: NOW["2031-08"] })) : ok;
    const r1 = await runOf(ok?.id ?? "");
    const items1 = canon(await rows(`SELECT "employeeId", "grossSatang" FROM "HrPayrollItem" WHERE "runId" = $1 ORDER BY "employeeId"`, ok?.id ?? ""));
    ck("R4.2", { refused: rc?.ok === false && textOf(rc) === TXT.limit, totals: Number(r1?.g) === INT4 && r1?.dg === r0?.dg && r1?.status === "DRAFT", items: items1 === items0 }, "fixed text · unchanged", short(rc, 200));
    const del = ok?.id ? await safe(() => PAY.deleteDraftRun(c(s4), ok.id, ownA)) : ok;
    const over = await create(s4, "2031-08");
    const nItems = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollItem" WHERE "systemId" = $1`, s4))[0]?.n ?? -1);
    ck("R4.3", { del: del?.ok === true, refused: over?.ok === false && over?.code === "RUN_LIMIT" && over?.reason === TXT.limit, none: (await liveRuns(s4)) === 0 && nItems === 0 }, "RUN_LIMIT", short({ over: over?.reason ?? over }, 200));
    void x1;
    const s1 = await sys("ขอบ-B1", false);
    await emp(s1, "Y1", { salary: 1_073_741_823 });
    const y2 = await emp(s1, "Y2", { salary: 1_073_741_824 });
    const v1ok = await safe(() => PAY.createPayrollRun(c(s1), { periodKey: "2031-08", payDate: bk("2031-08-29", "10:00") }));
    const rv0 = await runOf(v1ok?.id ?? "");
    ck("R4.4", { created: !!v1ok?.id, total: Number(rv0?.g) === INT4 }, "gross 2,147,483,647", short({ v1ok: v1ok?.id ? "ok" : v1ok, g: rv0?.g }, 160));
    if (v1ok?.id) await P.$executeRawUnsafe(`DELETE FROM "HrPayrollItem" WHERE "runId" = $1`, v1ok.id).then(() => P.$executeRawUnsafe(`DELETE FROM "HrPayrollRun" WHERE id = $1`, v1ok.id));
    await P.hrSalaryProfile.updateMany({ where: { systemId: s1, employeeId: y2 }, data: { baseSalarySatang: 1_073_741_825 } });
    const v1over = await safe(() => PAY.createPayrollRun(c(s1), { periodKey: "2031-08", payDate: bk("2031-08-29", "10:00") }));
    const thrown = v1over?.__throw as Any;
    const nRuns = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1`, s1))[0]?.n ?? -1);
    ck("R4.5", { refused: thrown?.name === "PayrollInputError" && thrown?.message === TXT.limit, none: nRuns === 0 }, "PayrollInputError(text)", short({ r: v1over?.reason ?? v1over?.id }, 200));
  }

  // ── R5: leave decisions in an APPROVED month ──
  {
    const s5 = await sys("ลา-L5");
    const eL = await emp(s5, "LA", { salary: 2_000_000 });
    const eO = await emp(s5, "LO", { salary: 2_000_000, linkedUserId: U.owner.id });
    const r = await create(s5, "2031-08");
    const ra = r?.id ? await approve(s5, r.id) : r;
    const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s5, category: "PERSONAL", name: `ลากิจไม่รับค่าจ้าง ${tag}`, paid: false, allowHours: true } })).id as string;
    const polP = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s5, category: "VACATION", name: `พักร้อน ${tag}`, paid: true, allowHours: true } })).id as string;
    const sh5 = (await P.hrShift.create({ data: { tenantId: TT, systemId: s5, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
    for (const [e, d] of [[eL, "2031-08-14"], [eL, "2031-08-15"], [eL, "2031-09-11"], [eO, "2031-08-20"], [eO, "2031-09-17"]] as const)
      await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s5, employeeId: e, date: dd(d), shiftId: sh5, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } });
    const lv = async (e: string, type: string, d: string, pol: string) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: s5, employeeId: e, type, fromDate: dd(d), toDate: dd(d), status: "PENDING", policyId: pol, days: 1, reason: `qc ${tag}` } })).id as string;
    const stOf = async (id: string) => (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, id))[0]?.s;
    const own = { ...V.owner, userId: U.owner.id };
    const setup = r?.ok === true && ra?.ok === true;
    const a1 = await lv(eL, "PERSONAL", "2031-08-14", polU);
    const d1 = await safe(() => LV.decideLeaveAs(c(s5), own, a1, "APPROVED"));
    ck("R5.1", { setup, refused: d1?.ok === false && d1?.reason === TXT.paid, pending: (await stOf(a1)) === "PENDING" }, "refused · PENDING", short(d1, 160));
    const a2 = await lv(eL, "VACATION", "2031-08-15", polP);
    const d2 = await safe(() => LV.decideLeaveAs(c(s5), own, a2, "APPROVED"));
    ck("R5.2", { ok: d2?.ok === true, st: (await stOf(a2)) === "APPROVED" }, "APPROVED", short(d2, 160));
    const a3 = await lv(eL, "PERSONAL", "2031-09-11", polU);
    const d3 = await safe(() => LV.decideLeaveAs(c(s5), own, a3, "APPROVED"));
    ck("R5.3", { ok: d3?.ok === true, st: (await stOf(a3)) === "APPROVED" }, "APPROVED", short(d3, 160));
    const req = (d: string) => safe(() => SV.requestLeave(c(s5), { employeeId: eO, type: "PERSONAL", fromDate: d, toDate: d, reason: "qc ลา", actorUserId: U.owner.id, policyId: polU }));
    const rowsOn = async (d: string) => rows(`SELECT status::text AS s FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = $2::date`, eO, d);
    const q1 = await req("2031-08-20");
    ck("R5.4", { refused: !q1?.id && (q1?.__throw?.message === TXT.paid || q1?.reason === TXT.paid), noRow: (await rowsOn("2031-08-20")).length === 0 }, "refused · no row", short({ q1: q1?.reason ?? q1?.id }, 200));
    const q2 = await req("2031-09-17");
    const r2 = await rowsOn("2031-09-17");
    ck("R5.5", { created: !!q2?.id, approved: r2.length === 1 && r2[0]?.s === "APPROVED" }, "APPROVED", short({ q2: q2?.reason ?? q2?.id, r2 }, 200));
  }
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  const dl1 = await deadlocks();
  chk("Z2", dl1 === dl0 && dl0 >= 0, "0 new deadlocks", `${dl0}→${dl1}`);
  const left = await S.cleanup().catch((e: unknown) => [`cleanup threw ${errText(e)}`]);
  chk("Z1", left.length === 0, "none", left.join(","));
  void fx;
}
process.exit(finish({ forced: FORCE, crashed, missing: [] }));
