// W8 probe (HR-LEAVE-3 × HR-PREPROD-1 merge) — own tenant via qc-hr-leave-3-lib (prefix qc-hr-leave3-), cleaned up at the end
const R = "/root/projects/shark-hr-b/scripts/";
const L = (await import(R + "qc-hr-leave-3-lib.mts")) as any;
const S = await L.setupLeave3("probe-l3-merge");
const { P, TT, U, V, c, rows, safe, sys, fx, tag } = S;
const SV = (await import("@/lib/modules/hr/service")) as any;
const JG = (await import("@/lib/modules/hr/judge")) as any;
const WE = (await import("@/lib/modules/hr/work-entries")) as any;
const ATP = (await import("@/lib/modules/hr/attendance-pay")) as any;
const PAY = (await import("@/lib/modules/hr/payroll")) as any;
try {
  const s = await sys("W8 probe", true);
  const sh = await L.shiftOf(P, TT, s, "เช้า", 540, 1020);
  const polSick = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "SICK", name: `ป่วย ${tag}`, paid: true, quotaDays: 0.2, allowHalfDay: true } })).id;
  const polVac = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "VACATION", name: `พักร้อน ${tag}`, paid: true, quotaDays: 30, allowHalfDay: true } })).id;
  await ATP.saveAttendancePayPolicy(c(s), V.owner, { enabled: true });
  const emp = async (code: string) => { const e = await fx.mkEmp(TT, s, `พนง ${code} ${tag}`, { startDate: "2030-01-01", unitId: S.u1, code }); await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } }); return e; };
  const leave = async (e: string, day: string, type: string, policyId: string, half: string) => { const r = await SV.requestLeave(c(s), { employeeId: e, type, policyId, fromDate: day, toDate: day, halfDay: half, actorUserId: U.staff.id }); await SV.decideLeave(c(s), r.id, "APPROVED", U.owner.id, { from: "PENDING" }); return r.id as string; };
  const eA = await emp("A"), eB = await emp("B");
  await L.entryOf(P, TT, s, eA, "2031-08-05", sh, S.u1, [540, 1020]);
  await L.entryOf(P, TT, s, eB, "2031-08-05", sh, S.u1, [540, 1020]);
  const am = await leave(eA, "2031-08-05", "SICK", polSick, "AM");
  await leave(eA, "2031-08-05", "VACATION", polVac, "PM");
  const amB = await leave(eB, "2031-08-05", "SICK", polSick, "AM"); // control: split AM half alone (PM no-show)
  const use = async (id: string) => (await rows(`SELECT days::text AS tenths, note FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 AND kind::text = 'USE' ORDER BY "createdAt"`, id)).map((x: any) => `${x.tenths}:${x.note}`).join(" ");
  console.log(`USE A.am = ${await use(am)} · USE B.am = ${await use(amB)}`);
  for (const d of ["2031-08-09", "2031-08-16"]) await safe(() => JG.runAttendanceJobs({ now: L.bk(d), tenantId: TT }));
  const NOW = L.bk("2031-09-05");
  const b = await safe(() => WE.buildWorkEntrySnapshot(c(s), V.owner, { periodKey: "2031-08" }, { now: NOW }));
  const att = async (e: string) => (await rows(`SELECT status::text AS st, "leaveHalf"::text AS h, "leaveFraction"::text AS fr FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = '2031-08-05'::date`, e)).map((x: any) => `${x.st}/${x.h}/${x.fr}`).join(",");
  const wd = async (e: string) => { const x = (await rows(`SELECT "paidLeaveMin" AS pl, "unpaidLeaveMin" AS ul, "absentMin" AS ab, "workMin" AS w, "leaveDays"::text AS ld, review FROM "HrWorkDay" WHERE "employeeId" = $1 AND date = '2031-08-05'::date`, e))[0]; return x ? `paid=${x.pl} unpaid=${x.ul} absent=${x.ab} work=${x.w} leaveDays=${x.ld} review=[${(x.review ?? []).join(",")}]` : "∅"; };
  console.log(`build ok=${b?.ok}`);
  console.log(`PAIR  A: att ${await att(eA)} · ${await wd(eA)}`);
  console.log(`CTRL  B: att ${await att(eB)} · ${await wd(eB)}`);
  const sy = await safe(() => ATP.syncAttendanceDeductions(c(s), V.owner, { periodKey: "2031-08" }, { now: NOW }));
  for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, s)) await safe(() => PAY.decideAdjustment(c(s), r.id, "APPROVED", { userId: U.owner.id, isOwner: true }));
  const run = await safe(() => PAY.createPayrollRunV2(c(s), V.pay, { periodKey: "2031-08", payDate: L.bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay.id, isOwner: false } }));
  const lines = async (e: string) => { const it = run?.id ? (await rows(`SELECT "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, run.id, e))[0] : null; return ((it?.l ?? []) as any[]).filter((x) => x.code !== "BASE").map((x) => `${x.code}:${x.day ?? "-"}:${x.minutes ?? "-"}:${x.amountSatang}`).join(" ") || "none"; };
  console.log(`sync ok=${sy?.ok} wait=${(sy?.wait ?? []).length} · run ok=${run?.ok} ${run?.code ?? ""}`);
  console.log(`LINES A: ${await lines(eA)} · B: ${await lines(eB)}`);
} catch (e) { console.log("CRASH", e instanceof Error ? e.stack : e); }
await S.cleanup();
process.exit(0);
