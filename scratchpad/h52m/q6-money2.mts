// H5.2 re-hunt of HR-MONEY-2 — new holes: leave gate race / paid leave / spanning · split-shift labour · RUN_LIMIT off-by-one + recompute · give-back orderings
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/q6-money2.mts
import { type Any, setup, short, errText, underLock } from "./common.mjs";

const S = await setup("h52m-q6");
const { P, tag, TT, u1, u2, U, V, c, rows, safe, sys, book, fin, emp, runOf, PAY } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1400)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
let crashed = "";
try {
  const JG = (await import("@/lib/modules/hr/judge")) as Any;
  const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
  const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
  const LV = (await import("@/lib/modules/hr/leave")) as Any;
  const LB = (await import("@/lib/modules/hr/labor")) as Any;
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const v2 = (s: string) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, s);
  const NOW = bk("2031-09-05");
  const create = (s: string, per: string, pay: Date, now = NOW) => safe(() => PAY.createPayrollRunV2(c(s), VP, { periodKey: per, payDate: pay }, { now, actor: { userId: U.pay1.id, isOwner: false } }));

  // ═══ L. leave gate ═══
  const sL = await sys("ทีมลา");
  await v2(sL);
  const eL = await emp(sL, "L1", { salary: 3_000_000, unit: u1 });
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: sL, name: "เช้า", startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  const ent = async (s: string, e: string, day: string, unitId: string, a = 540, b = 1020) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: e, date: dd(day), shiftId: sh, unitId, startMin: a, endMin: b, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } })).id as string;
  const work = async (s: string, e: string, day: string, unitId: string, i: string | null, o: string | null, a = 540, b = 1020) => {
    const re = await ent(s, e, day, unitId, a, b);
    if (i) await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: "IN", at: bk(day, i), rosterEntryId: re, source: "KIOSK" } });
    if (o) await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: "OUT", at: bk(day, o), rosterEntryId: re, source: "KIOSK" } });
  };
  for (const d of ["04", "05", "06", "07", "08"]) await work(sL, eL, `2031-08-${d}`, u1, "09:00", "17:00");
  await work(sL, eL, "2031-08-11", u1, null, null); // absent
  await work(sL, eL, "2031-08-12", u1, "09:00", "17:00");
  await work(sL, eL, "2031-08-29", u1, "09:00", "17:00");
  await work(sL, eL, "2031-09-01", u1, "09:00", "17:00");
  const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sL, category: "PERSONAL", name: `ไม่รับค่าจ้าง ${tag}`, paid: false, allowHours: true } })).id as string;
  const polP = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sL, category: "SICK", name: `ป่วย ${tag}`, paid: true, allowHours: true } })).id as string;
  const pend = async (type: string, from: string, to: string, pol: string, days = 1) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: sL, employeeId: eL, type, fromDate: dd(from), toDate: dd(to), status: "PENDING", policyId: pol, days, reason: "qc" } })).id as string;
  await safe(() => AP.saveAttendancePayPolicy(c(sL), own, { enabled: true }));
  for (const d of ["2031-08-09", "2031-08-16", "2031-08-23", "2031-08-30", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  out("L.build", (await safe(() => WE.buildWorkEntrySnapshot(c(sL), own, { periodKey: "2031-08" }, { now: NOW })))?.ok);
  out("L.sync", (await safe(() => AP.syncAttendanceDeductions(c(sL), own, { periodKey: "2031-08" }, { now: NOW })))?.created);
  for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, sL)) await safe(() => PAY.decideAdjustment(c(sL), r.id, "APPROVED", ownA));
  const RL = await create(sL, "2031-08", bk("2031-08-31", "10:00"));
  out("L.create", RL);
  const lvRace = await pend("PERSONAL", "2031-08-12", "2031-08-12", polU); // pending unpaid leave filed after the draft (12th, worked)
  out("L.previewWithPending", await safe(() => WE.workEntryPreview(c(sL), own, { periodKey: "2031-08" }, { now: NOW })).then((p: Any) => (p?.rows ?? []).map((r: Any) => r.state)));
  // L1 · race: unpaid-leave approval passes the paid-month check, then waits (policy row held FOR UPDATE) while the run is approved
  const race = await underLock(P, { rowSql: `SELECT 1 FROM "HrLeavePolicy" WHERE id = $1 FOR UPDATE`, args: [polU] }, [
    () => safe(() => LV.decideLeaveAs(c(sL), { ...own, userId: U.owner.id }, lvRace, "APPROVED")),
    () => safe(() => PAY.approveRun(c(sL), RL.id, undefined, ownA)),
  ], [true, false]);
  out("L1.race(leave∥approve)", { res: race.res, blocked: race.blocked, leave: (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, lvRace))[0]?.s, run: (await runOf(RL.id))?.status });
  out("L1.wdFrozen12", await rows(`SELECT "unpaidLeaveMin" AS ul, "workMin" AS w FROM "HrWorkDay" WHERE "employeeId" = $1 AND date = '2031-08-12'`, eL));
  // L1b · now make Aug PAID-approved: unpaid leave of the 12th is approved (pre-approval), rebuild, sync, recompute, approve
  await safe(() => WE.buildWorkEntrySnapshot(c(sL), own, { periodKey: "2031-08" }, { now: NOW }));
  await safe(() => AP.syncAttendanceDeductions(c(sL), own, { periodKey: "2031-08" }, { now: NOW }));
  for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, sL)) await safe(() => PAY.decideAdjustment(c(sL), r.id, "APPROVED", ownA));
  out("L1b.recompute", await safe(() => PAY.recomputeDraftRun(c(sL), RL.id, { userId: U.pay1.id, isOwner: false }, { viewer: VP, now: NOW })));
  out("L1b.approve", await safe(() => PAY.approveRun(c(sL), RL.id, undefined, ownA)));
  out("L1b.lines", (await rows(`SELECT "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1`, RL.id))[0]?.l?.map((l: Any) => `${l.code}:${l.amountSatang}`));
  const SV = (await import("@/lib/modules/hr/service")) as Any;
  out("L1b.revokeApprovedUnpaidInPaid", await safe(() => SV.decideLeave(c(sL), lvRace, "REJECTED", U.owner.id, { from: "APPROVED" })));
  out("L1b.cancelApprovedUnpaidInPaid", await safe(() => SV.cancelLeave ? SV.cancelLeave(c(sL), lvRace, { actorUserId: U.owner.id }) : "n/a"));
  out("L1b.leaveNow", (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, lvRace))[0]?.s);
  // L2 · back-dated PAID sick leave on the absent day (11th) of the paid month
  const lvPaid = await pend("SICK", "2031-08-11", "2031-08-11", polP);
  out("L2.paidLeaveOnAbsentDay", await safe(() => LV.decideLeaveAs(c(sL), { ...own, userId: U.owner.id }, lvPaid, "APPROVED")));
  out("L2.sync", await safe(() => AP.syncAttendanceDeductions(c(sL), own, { periodKey: "2031-08" }, { now: NOW })).then((r: Any) => ({ created: r?.created, refunds: r?.refunds, ok: r?.ok })));
  out("L2.absentRows", await rows(`SELECT "sourceType"::text AS st, kind::text AS k, status::text AS s, "amountSatang" AS a, "periodKey" AS p, "runId" IS NOT NULL AS bound FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text IN ('LATE_RULE','ABSENT_RULE')`, sL));
  // L3 · spanning paid Aug + open Sep · Sep only · cancel of an approved unpaid leave in the paid month
  out("L3.span31Aug-1Sep", await safe(() => pend("PERSONAL", "2031-08-29", "2031-09-01", polU, 2).then((id) => LV.decideLeaveAs(c(sL), { ...own, userId: U.owner.id }, id, "APPROVED"))));
  out("L3.sepOnly", await safe(() => pend("PERSONAL", "2031-09-01", "2031-09-01", polU).then((id) => LV.decideLeaveAs(c(sL), { ...own, userId: U.owner.id }, id, "APPROVED"))));
  out("L3.revokeApprovedInPaid", lvRace ? await safe(() => LV.decideLeaveAs(c(sL), { ...own, userId: U.owner.id }, lvRace, "REJECTED")) : null);

  // ═══ S. split shift, two branches the same day ═══
  const sS = await sys("ทีมกะแยก");
  await v2(sS);
  const BS = await book("S");
  await PAY.setPayrollBook(c(sS), own, { accountSystemId: BS });
  const eS = await emp(sS, "SP", { salary: 3_000_000, unit: u1 });
  await work(sS, eS, "2031-08-05", u1, "08:58", "13:00", 540, 780);
  await work(sS, eS, "2031-08-06", u2, "08:58", "17:00");
  for (const d of ["2031-08-09", "2031-08-16", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  out("S.build", (await safe(() => WE.buildWorkEntrySnapshot(c(sS), own, { periodKey: "2031-08" }, { now: NOW })))?.ok);
  out("S.day", await rows(`SELECT date::text AS d, "workMin" AS w, "unitId" = $2 AS home FROM "HrWorkDay" WHERE "employeeId" = $1 AND "workMin" > 0`, eS, u1));
  const RS = await create(sS, "2031-08", bk("2031-08-31", "10:00"));
  out("S.approve", await safe(() => PAY.approveRun(c(sS), RS.id, undefined, ownA)));
  const lm = (unitId: string | null) => safe(() => LB.laborMonth(c(sS), own, { unitId, periodKey: "2031-08" }, { now: NOW })).then((x: Any) => x?.costSatang);
  out("S.labor(expect 240 u1 / 480 u2 of 3,087,500 = 1,029,167 / 2,058,333)", { all: await lm(null), u1: await lm(u1), u2: await lm(u2) });
  out("S.reverse", await safe(() => PAY.reverseRun(c(sS), RS.id, "qc", ownA)));
  out("S.laborAfterReverse(estimate)", { basis: (await safe(() => LB.laborMonth(c(sS), own, { unitId: null, periodKey: "2031-08" }, { now: NOW })))?.basis });

  // ═══ R. RUN_LIMIT off-by-one ═══
  const INT = 2_147_483_647;
  for (const [lbl, isV2, b2] of [["v2.at", true, INT - 2_000_000_000], ["v2.over", true, INT - 2_000_000_000 + 1], ["v1.at", false, INT - 2_000_000_000], ["v1.over", false, INT - 2_000_000_000 + 1]] as const) {
    const s = await sys(`ทีมเพดาน ${lbl}`, false);
    if (isV2) await v2(s);
    for (const [n, sal] of [["A", 2_000_000_000], ["B", b2]] as const) {
      const e = await emp(s, `${lbl}${n}`, { salary: sal, unit: u1 });
      await P.hrSalaryProfile.updateMany({ where: { employeeId: e }, data: { ssoEligible: false } });
    }
    const r = isV2 ? await create(s, "2031-08", bk("2031-08-31", "10:00")) : await safe(() => PAY.createPayrollRun(c(s), { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }));
    const run = (await rows(`SELECT id, "totalGrossSatang" AS g FROM "HrPayrollRun" WHERE "systemId" = $1`, s))[0];
    out(`R.${lbl}`, { ok: r?.ok ?? !!r?.id, code: r?.code, g: run?.g, items: run ? (await rows(`SELECT count(*)::int AS n FROM "HrPayrollItem" WHERE "runId" = $1`, run.id))[0]?.n : 0 });
    if (lbl === "v2.at" && run) {
      // recompute after a raise of 1 satang ⇒ RUN_LIMIT; draft unchanged
      const e = (await rows(`SELECT "employeeId" AS e FROM "HrSalaryProfile" WHERE "systemId" = $1 ORDER BY "baseSalarySatang" LIMIT 1`, s))[0]?.e;
      await P.hrSalaryProfile.updateMany({ where: { employeeId: e }, data: { baseSalarySatang: b2 + 1 } });
      out("R.v2.recomputeOver", await safe(() => PAY.recomputeDraftRun(c(s), run.id, { userId: U.pay1.id, isOwner: false }, { viewer: VP, now: NOW })));
      out("R.v2.draftKept", { run: await runOf(run.id), items: (await rows(`SELECT count(*)::int AS n FROM "HrPayrollItem" WHERE "runId" = $1`, run.id))[0]?.n });
      // with an advance: gross under the limit but accrual salary expense = gross + advance
      await P.hrSalaryProfile.updateMany({ where: { employeeId: e }, data: { baseSalarySatang: b2 } });
    }
  }
  {
    const s = await sys("ทีมเพดานเบิก");
    await v2(s);
    const a = await emp(s, "XA", { salary: 2_000_000_000, unit: u1 });
    const b = await emp(s, "XB", { salary: INT - 2_000_000_000, unit: u1 });
    await P.hrSalaryProfile.updateMany({ where: { systemId: s }, data: { ssoEligible: false } });
    const r = await PAY.requestAdjustment(c(s), { employeeId: b, periodKey: "2031-08", kind: "ADVANCE", amountSatang: 1_000, requestedById: U.pay1.id });
    await PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA);
    out("R.v2.advanceAtLimit(gross<limit, expense=limit+0)", await create(s, "2031-08", bk("2031-08-31", "10:00")));
    await P.hrSalaryProfile.updateMany({ where: { employeeId: b }, data: { baseSalarySatang: INT - 2_000_000_000 + 1 } });
    const run0 = (await rows(`SELECT id FROM "HrPayrollRun" WHERE "systemId" = $1`, s))[0]?.id;
    out("R.v2.advanceOver(gross=limit-999, expense=limit+1) recompute", await safe(() => PAY.recomputeDraftRun(c(s), run0, { userId: U.pay1.id, isOwner: false }, { viewer: VP, now: NOW })));
    void a;
  }

  // ═══ G. give-back orderings ═══
  const sG = await sys("ทีมคืน");
  await v2(sG);
  const BG = await book("G");
  await PAY.setPayrollBook(c(sG), own, { accountSystemId: BG });
  const finG = await fin(BG, "bankG");
  const eG = await emp(sG, "G1", { salary: 2_000_000, unit: u1 });
  const cl = await PAY.requestAdjustment(c(sG), { employeeId: eG, periodKey: "2031-08", kind: "DEDUCTION", amountSatang: 100_000, requestedById: U.pay1.id });
  await PAY.decideAdjustment(c(sG), cl.id, "APPROVED", ownA);
  const adjs = async () => (await rows(`SELECT kind::text AS k, status::text AS s, "amountSatang" AS a, "periodKey" AS p, "runId" AS r FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY "createdAt", id`, sG)).map((x: Any) => `${x.k}:${x.s}:${x.a}:${x.p}:${x.r ? x.r.slice(-4) : "free"}`);
  const A1 = await create(sG, "2031-08", bk("2031-08-31", "10:00"));
  await PAY.approveRun(c(sG), A1.id, undefined, ownA);
  await PAY.markPaidRun(c(sG), A1.id, { financeAccountId: finG, paidOn: "2031-08-31", now: NOW });
  // G1 race: giveBack ∥ reverse (claim row held)
  const g1 = await underLock(P, { rowSql: `SELECT 1 FROM "HrPayAdjustment" WHERE id = $1 FOR UPDATE`, args: [cl.id] }, [
    () => safe(() => PAY.giveBackClaim(c(sG), { userId: U.owner.id }, { claimId: cl.id, amountSatang: 30_000, periodKey: "2031-09" })),
    () => safe(() => PAY.reverseRun(c(sG), A1.id, "qc", ownA)),
  ]);
  out("G1.giveBack∥reverse", { res: g1.res, blocked: g1.blocked, adj: await adjs() });
  // G2 reverse twice
  out("G2.reverseAgain", await safe(() => PAY.reverseRun(c(sG), A1.id, "qc", ownA)));
  // G3 re-run Aug, approve, give back, Sep draft (refund bound) → reverse Aug (REFUND_BOUND) → approve Sep → pay → reverse Sep → reverse Aug → re-run both
  const A2 = await create(sG, "2031-08", bk("2031-08-31", "10:00"));
  out("G3.recreateAug", { A2: A2?.ok, ap: await safe(() => PAY.approveRun(c(sG), A2.id, undefined, ownA)) });
  const gb = await safe(() => PAY.giveBackClaim(c(sG), { userId: U.owner.id }, { claimId: cl.id, amountSatang: 30_000, periodKey: "2031-09" }));
  await safe(() => PAY.decideAdjustment(c(sG), gb.id, "APPROVED", ownA));
  const S1 = await create(sG, "2031-09", bk("2031-09-30", "10:00"), bk("2031-10-03"));
  out("G3.sepDraft", { S1: S1?.ok, adj: await adjs() });
  out("G3.reverseAug(refund in draft)", await safe(() => PAY.reverseRun(c(sG), A2.id, "qc", ownA)));
  out("G3.cancelClaim(bound approved)", await safe(() => PAY.cancelAdjustment(c(sG), cl.id, ownA)));
  out("G3.approveSep", await safe(() => PAY.approveRun(c(sG), S1.id, undefined, ownA)));
  out("G3.reverseAug(after Sep approved)", await safe(() => PAY.reverseRun(c(sG), A2.id, "qc", ownA)));
  out("G3.reverseSep", await safe(() => PAY.reverseRun(c(sG), S1.id, "qc", ownA)));
  out("G3.reverseAug", await safe(() => PAY.reverseRun(c(sG), A2.id, "qc", ownA)));
  out("G3.adj", await adjs());
  const A3 = await create(sG, "2031-08", bk("2031-08-31", "10:00"));
  await safe(() => PAY.approveRun(c(sG), A3.id, undefined, ownA));
  const S2 = await create(sG, "2031-09", bk("2031-09-30", "10:00"), bk("2031-10-03"));
  await safe(() => PAY.approveRun(c(sG), S2.id, undefined, ownA));
  const live = await rows(`SELECT r."periodKey" AS p, i."snapshotJson"->'lines' AS l FROM "HrPayrollItem" i JOIN "HrPayrollRun" r ON r.id = i."runId" WHERE r."systemId" = $1 AND r.status::text IN ('APPROVED','PAID') ORDER BY r."periodKey"`, sG);
  out("G3.liveLines", live.map((x: Any) => `${x.p}:${(x.l as Any[]).map((l) => `${l.code}:${l.amountSatang}`).join(",")}`));
  out("G3.adjEnd", await adjs());
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
