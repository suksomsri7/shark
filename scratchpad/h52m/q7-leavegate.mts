// H5.2 re-hunt of HR-MONEY-2 R5 — leave decisions on a PAID month (Aug 2031 approved first)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/q7-leavegate.mts
import { type Any, setup, short, errText } from "./common.mjs";

const S = await setup("h52m-q7");
const { P, tag, TT, u1, U, V, c, rows, safe, sys, emp, PAY } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 900)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
let crashed = "";
try {
  const JG = (await import("@/lib/modules/hr/judge")) as Any;
  const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
  const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
  const LV = (await import("@/lib/modules/hr/leave")) as Any;
  const SV = (await import("@/lib/modules/hr/service")) as Any;
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const s = await sys("ทีมลาเดือนปิด");
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, s);
  const e = await emp(s, "M1", { salary: 3_000_000, unit: u1 });
  await P.hrEmployee.update({ where: { id: e }, data: { linkedUserId: U.owner.id } }); // owner's own leave ⇒ cancelLeave path of an approved owner leave
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: "เช้า", startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  const work = async (day: string, io: boolean) => {
    const re = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: e, date: dd(day), shiftId: sh, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } })).id as string;
    if (io) { await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: "IN", at: bk(day, "09:00"), rosterEntryId: re, source: "KIOSK" } }); await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: "OUT", at: bk(day, "17:00"), rosterEntryId: re, source: "KIOSK" } }); }
  };
  for (const d of ["04", "05", "06", "07", "08"]) await work(`2031-08-${d}`, true);
  for (const d of ["11", "13", "14", "29"]) await work(`2031-08-${d}`, false); // 11 absent · 13 unpaid leave (pre-approved) · 14 absent · 29 absent
  await work("2031-09-01", false);
  const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "PERSONAL", name: `ไม่รับค่าจ้าง ${tag}`, paid: false, allowHours: true } })).id as string;
  const polP = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "SICK", name: `ป่วย ${tag}`, paid: true, allowHours: true } })).id as string;
  const mk = async (type: string, from: string, to: string, pol: string, status: string, days = 1) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: s, employeeId: e, type, fromDate: dd(from), toDate: dd(to), status, policyId: pol, days, reason: "qc" } })).id as string;
  const pre = await mk("PERSONAL", "2031-08-13", "2031-08-13", polU, "APPROVED");
  await AP.saveAttendancePayPolicy(c(s), own, { enabled: true });
  const NOW = bk("2031-09-05");
  for (const d of ["2031-08-09", "2031-08-16", "2031-08-23", "2031-08-30", "2031-09-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  out("0.build", (await safe(() => WE.buildWorkEntrySnapshot(c(s), own, { periodKey: "2031-08" }, { now: NOW })))?.ok);
  out("0.sync", (await safe(() => AP.syncAttendanceDeductions(c(s), own, { periodKey: "2031-08" }, { now: NOW })))?.created);
  for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, s)) await safe(() => PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA));
  const R = await safe(() => PAY.createPayrollRunV2(c(s), VP, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }));
  out("0.create", R);
  out("0.approve", await safe(() => PAY.approveRun(c(s), R.id, undefined, ownA)));
  out("0.lines", (await rows(`SELECT "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1`, R.id))[0]?.l?.map((l: Any) => `${l.code}:${l.day ?? "-"}:${l.amountSatang}`));
  const dec = (id: string) => safe(() => LV.decideLeaveAs(c(s), { ...own, userId: U.pay1.id, role: "OWNER" }, id, "APPROVED"));
  const ownerDec = async (id: string) => safe(() => SV.decideLeave(c(s), id, "APPROVED", U.pay1.id, { from: "PENDING" }).then(() => ({ ok: true })));
  out("1.unpaidBackdated14", await ownerDec(await mk("PERSONAL", "2031-08-14", "2031-08-14", polU, "PENDING")));
  out("2.paidSickBackdated11", await ownerDec(await mk("SICK", "2031-08-11", "2031-08-11", polP, "PENDING")));
  out("2.sync", await safe(() => AP.syncAttendanceDeductions(c(s), own, { periodKey: "2031-08" }, { now: NOW })).then((r: Any) => ({ created: r?.created, refunds: r?.refunds })));
  out("3.unpaidSpan29Aug-1Sep", await ownerDec(await mk("PERSONAL", "2031-08-29", "2031-09-01", polU, "PENDING", 2)));
  out("4.unpaidSep1", await ownerDec(await mk("PERSONAL", "2031-09-01", "2031-09-01", polU, "PENDING")));
  out("5.revokePreApproved13", await safe(() => SV.decideLeave(c(s), pre, "REJECTED", U.pay1.id, { from: "APPROVED" }).then(() => ({ ok: true }))));
  out("6.ownerCancelPreApproved13", await safe(() => SV.cancelLeave(c(s), pre, { actorUserId: U.owner.id })));
  out("7.leaves", (await rows(`SELECT "fromDate"::text AS f, "toDate"::text AS t, status::text AS s, "policyId" = $2 AS unpaid FROM "HrLeave" WHERE "systemId" = $1 ORDER BY "createdAt"`, s, polU)));
  void dec;
} catch (x) {
  crashed = errText(x);
  console.log(`CRASH ${crashed} ${(x as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
