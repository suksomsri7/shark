// H5.2 money hunter p3 — concurrency on the time→pay chain (held locks + pg_blocking_pids via common.underLock)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/p3-races.mts
import { type Any, setup, short, errText, underLock } from "./common.mjs";

const S = await setup("h52m-p3");
const { P, TT, u1, U, V, c, rows, safe, sys, book, emp, runOf, itemsOf, PAY } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1400)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
let crashed = "";
try {
  const JG = (await import("@/lib/modules/hr/judge")) as Any;
  const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
  const OT = (await import("@/lib/modules/hr/ot")) as Any;
  const CM = (await import("@/lib/modules/hr/correction")) as Any;
  const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
  const sR = await sys("ทีมแข่ง");
  const BR = await book("R");
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  await PAY.setPayrollBook(c(sR), own, { accountSystemId: BR });
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const eA = await emp(sR, "RA", { salary: 3_000_000, unit: u1 });
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: sR, name: "เช้า", startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  const work = async (day: string, inHm: string, outHm: string) => {
    const re = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sR, employeeId: eA, date: dd(day), shiftId: sh, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } })).id as string;
    const i = (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sR, employeeId: eA, kind: "IN", at: bk(day, inHm), rosterEntryId: re, source: "KIOSK" } })).id as string;
    await P.hrAttendance.create({ data: { tenantId: TT, systemId: sR, employeeId: eA, kind: "OUT", at: bk(day, outHm), rosterEntryId: re, source: "KIOSK" } });
    return i;
  };
  const in04 = await work("2031-08-04", "09:30", "17:00"); // late 30 ⇒ 6,250
  await work("2031-08-05", "09:00", "17:00");
  const in06 = await work("2031-08-06", "09:20", "17:00"); // late 20 ⇒ 4,166
  await work("2031-08-07", "09:00", "19:00");
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, sR);
  await AP.saveAttendancePayPolicy(c(sR), own, { enabled: true });
  const PER = "2031-08";
  const NOW = bk("2031-09-05");
  for (const d of ["2031-08-06", "2031-08-09", "2031-08-16", "2031-08-23", "2031-08-30", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  const build = () => safe(() => WE.buildWorkEntrySnapshot(c(sR), own, { periodKey: PER }, { now: NOW }));
  const sync = () => safe(() => AP.syncAttendanceDeductions(c(sR), own, { periodKey: PER }, { now: NOW }));
  const approvePending = async () => { for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING' AND kind::text <> 'REFUND'`, sR)) await safe(() => PAY.decideAdjustment(c(sR), r.id, "APPROVED", ownA)); };
  const adjs = async () => (await rows(`SELECT kind::text AS k, "sourceType"::text AS st, status::text AS s, "amountSatang" AS a, "periodKey" AS p, "runId" AS r FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY "createdAt", id`, sR)).map((x: Any) => `${x.st ?? "-"}:${x.k}:${x.s}:${x.a}:${x.p}:${x.r ? x.r.slice(-4) : "free"}`);
  const create = () => safe(() => PAY.createPayrollRunV2(c(sR), VP, { periodKey: PER, payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }));
  const live = async () => rows(`SELECT id, status::text AS s, "totalNetSatang" AS n, "totalDeductSatang" AS d, "totalAddSatang" AS a FROM "HrPayrollRun" WHERE "systemId" = $1 AND status::text <> 'REVERSED' ORDER BY "createdAt"`, sR);
  const pk = { key: `hr:payroll:run:${sR}:${PER}`, seed: 0 };
  out("0.build", (await build())?.ok);
  out("0.sync", (await sync())?.created);
  await approvePending();
  out("0.adj", await adjs());

  // R1 · OT approve ∥ run build (OT approve queued first on the period lock)
  const ot = await safe(() => OT.requestOt(c(sR), own, { employeeId: eA, date: "2031-08-07", start: "17:00", end: "19:00", reason: "QC" }, { now: bk("2031-08-06") }));
  const r1 = await underLock(P, pk, [() => safe(() => OT.decideOtRequest(c(sR), own, ot?.id, "APPROVED", { now: NOW })), () => create()]);
  out("R1.otFirst", { res: r1.res, blocked: r1.blocked, adj: await adjs(), runs: await live() });
  // R1b · reverse order on a fresh draft: delete, new pending OT on day 5 (not worked after 17:00 ⇒ 0 pay) — create queued first, approve second
  for (const r of await live()) await safe(() => PAY.deleteDraftRun(c(sR), r.id, ownA));
  const ot2 = await safe(() => OT.requestOt(c(sR), own, { employeeId: eA, date: "2031-08-05", start: "17:00", end: "18:00", reason: "QC" }, { now: bk("2031-08-04") }));
  const r1b = await underLock(P, pk, [() => create(), () => safe(() => OT.decideOtRequest(c(sR), own, ot2?.id, "APPROVED", { now: NOW }))]);
  out("R1b.createFirst", { res: r1b.res, blocked: r1b.blocked, adj: await adjs(), runs: await live() });

  // R2 · two run builds for the same period
  for (const r of await live()) await safe(() => PAY.deleteDraftRun(c(sR), r.id, ownA));
  const r2 = await underLock(P, pk, [() => create(), () => create()]);
  out("R2.twoCreates", { res: r2.res.map((x: Any) => x?.ok ? "ok" : x?.code), blocked: r2.blocked, runs: (await live()).length, boundOnce: await rows(`SELECT "runId", count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "runId" IS NOT NULL GROUP BY "runId"`, sR) });

  // R3 · attendance correction (queued first) ∥ run approve (second): approve must not approve stale time data
  const R = (await live())[0]?.id as string;
  const r3 = await underLock(P, pk, [
    () => safe(() => CM.requestCorrection(c(sR), { ...own, userId: U.owner.id }, { action: "CHANGE", employeeId: eA, attendanceId: in04, at: bk("2031-08-04", "09:00"), reason: "แก้เวลาเข้า qc" }, { now: NOW })),
    () => safe(() => PAY.approveRun(c(sR), R, undefined, ownA)),
  ]);
  out("R3.corrThenApprove", { res: r3.res, blocked: r3.blocked, run: await runOf(R), adj: await adjs() });
  // R3b · approve (first) ∥ correction (second)
  await build(); out("R3b.sync", (await sync())?.created); await approvePending();
  out("R3b.recompute", await safe(() => PAY.recomputeDraftRun(c(sR), R, { userId: U.pay1.id, isOwner: false }, { viewer: VP, now: NOW })));
  out("R3b.sync2", await sync()); await approvePending();
  // manual deduction must be requested while the period has no live run ⇒ delete the draft, request, re-create
  out("R3b.deleteDraft", await safe(() => PAY.deleteDraftRun(c(sR), R, ownA)));
  const man = await PAY.requestAdjustment(c(sR), { employeeId: eA, periodKey: PER, kind: "DEDUCTION", amountSatang: 10_000, note: "qc", requestedById: U.pay1.id });
  out("R3b.man", { man, dec: man?.id ? await PAY.decideAdjustment(c(sR), man.id, "APPROVED", ownA) : null });
  const cR = await create();
  out("R3b.recreate", cR);
  const R2 = cR?.id as string;
  out("R3b.before", { run: await runOf(R2), adj: await adjs() });
  // R4 · approve (first) ∥ cancel of a bound-draft adjustment (second) ∥ correction (third)
  const r4 = await underLock(P, pk, [
    () => safe(() => PAY.approveRun(c(sR), R2, undefined, ownA)),
    () => safe(() => PAY.cancelAdjustment(c(sR), man?.id ?? "∅", ownA)),
    () => safe(() => CM.requestCorrection(c(sR), { ...own, userId: U.owner.id }, { action: "CHANGE", employeeId: eA, attendanceId: in06, at: bk("2031-08-06", "09:00"), reason: "แก้ qc" }, { now: NOW })),
  ]);
  const runR = await runOf(R2);
  const it = await itemsOf(R2);
  out("R4.approve|cancel|corr", { res: r4.res, blocked: r4.blocked, run: runR, item: it, adj: await adjs() });
  out("R4.consistent", { manBound: (await rows(`SELECT "runId" FROM "HrPayAdjustment" WHERE id = $1`, man?.id ?? "∅"))[0]?.runId === R2, itemDeductEqBound: Number(it[0]?.d) === Number((await rows(`SELECT coalesce(sum("amountSatang"),0)::int AS s FROM "HrPayAdjustment" WHERE "runId" = $1 AND kind::text IN ('DEDUCTION','ADVANCE')`, R))[0]?.s) });

  // R5 · judgement job ∥ correction on the same employee (hr:clock held): Sept day
  const in0901 = await work("2031-09-01", "09:45", "17:00");
  const r5 = await underLock(P, { key: `hr:clock:${eA}`, seed: 0 }, [
    () => safe(() => CM.requestCorrection(c(sR), { ...own, userId: U.owner.id }, { action: "CHANGE", employeeId: eA, attendanceId: in0901, at: bk("2031-09-01", "09:00"), reason: "แก้ qc" }, { now: bk("2031-09-03") })),
    () => safe(() => JG.runAttendanceJobs({ now: bk("2031-09-03"), tenantId: TT })),
  ]);
  const day = await rows(`SELECT status::text AS s, "lateMin" AS l, version FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = '2031-09-01'`, eA);
  await safe(() => JG.runAttendanceJobs({ now: bk("2031-09-04"), tenantId: TT }));
  const day2 = await rows(`SELECT status::text AS s, "lateMin" AS l, version FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = '2031-09-01'`, eA);
  out("R5.corr|job", { res: r5.res, blocked: r5.blocked, day, dayAfterNextJob: day2 });
  out("deadlocks", await rows(`SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()`));
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
