// H5.2 money hunter p5 — 300 employees (timings of build → create → approve → documents) · run totals near/over int4 · swap → judgement → pay
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/p5-scale.mts
import { type Any, setup, short, errText } from "./common.mjs";

const S = await setup("h52m-p5");
const { P, fx, tag, TT, u1, U, V, c, rows, safe, sys, book, fin, emp, runOf, PAY, BK, FS, REP } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1400)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
const timed = async <R,>(f: () => Promise<R>): Promise<[R, number]> => { const t = Date.now(); const r = await f(); return [r, Date.now() - t]; };
let crashed = "";
try {
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const v2 = (s: string) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, s);
  const bulk = async (s: string, n: number, salary: number, prefix: string) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 50) {
      const batch = Array.from({ length: Math.min(50, n - i) }, (_, k) => ({ tenantId: TT, systemId: s, name: `${prefix}${i + k} ${tag}`, unitId: u1, startDate: dd("2030-01-01"), bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `Q52 ${prefix}${i + k}` }));
      const made = await P.hrEmployee.createManyAndReturn({ data: batch, select: { id: true } });
      ids.push(...made.map((m: Any) => m.id));
    }
    await P.hrSalaryProfile.createMany({ data: ids.map((employeeId) => ({ tenantId: TT, systemId: s, employeeId, baseSalarySatang: salary, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } })) });
    return ids;
  };
  // ── A. 300 employees × 30,000 (v2, booked) ──
  const sA = await sys("ทีมใหญ่");
  const BA = await book("A");
  await PAY.setPayrollBook(c(sA), own, { accountSystemId: BA });
  const finA = await fin(BA, "bankA");
  await bulk(sA, 300, 3_000_000, "E");
  await v2(sA);
  const NOW = bk("2031-09-03");
  const [cr, tC] = await timed(() => safe(() => PAY.createPayrollRunV2(c(sA), VP, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } })));
  out("A.create300", { ok: cr?.ok, code: cr?.code, r: cr?.reason, employees: cr?.employees, ms: tC });
  if (cr?.id) {
    const [ap, tA] = await timed(() => safe(() => PAY.approveRun(c(sA), cr.id, undefined, ownA)));
    out("A.approve", { ap, ms: tA });
    const [pd, tP] = await timed(() => safe(() => PAY.markPaidRun(c(sA), cr.id, { financeAccountId: finA, paidOn: "2031-08-31", now: NOW })));
    out("A.pay", { pd, ms: tP });
    const r = await runOf(cr.id);
    out("A.run", r);
    out("A.expect", { g: 300 * 3_000_000, se: 300 * 87_500, n: 300 * (3_000_000 - 87_500), eq: Number(r.g) === 900_000_000 && Number(r.n) === 300 * 2_912_500 });
    const [bf, tB] = await timed(() => safe(() => BK.generateBankFile(c(sA), own, { runId: cr.id, format: "CSV", presetId: "GENERIC" }, { now: NOW })));
    out("A.bank", { ok: bf?.ok, code: bf?.code, items: bf?.itemCount, total: bf?.totalSatang, eq: bf?.totalSatang === Number(r.n), ms: tB });
    const [pm, tR] = await timed(() => safe(() => REP.loadReport(c(sA), own, { report: "payroll-month", period: "2031-08" })));
    out("A.report", { ok: pm?.ok ?? !!pm?.totals, rows: pm?.rows?.length, net: pm?.totals?.net, code: pm?.code, ms: tR });
    const [rv, tV] = await timed(() => safe(() => PAY.reverseRun(c(sA), cr.id, "qc", ownA)));
    out("A.reverse", { rv, ms: tV });
  }
  // ── B. run totals over int4 (21,474,836.47 ฿): 30 × 800,000 ฿ = 24,000,000 ฿ — v2 and v1 ──
  for (const [label, isV2] of [["v2", true], ["v1", false]] as const) {
    const s = await sys(`ทีมเงินเดือนสูง ${label}`, false);
    if (isV2) await v2(s);
    await bulk(s, 30, 80_000_000, `H${label}`);
    const res = isV2
      ? await safe(() => PAY.createPayrollRunV2(c(s), VP, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }))
      : await safe(() => PAY.createPayrollRun(c(s), { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }));
    out(`B.overInt4.${label}`, { res: short(res, 300), runs: await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1`, s) });
  }
  // ── B2. single employee near the item limit: 21,000,000 ฿ salary (v2) ──
  {
    const s = await sys("ทีมหนึ่งคน");
    await v2(s);
    await bulk(s, 1, 2_100_000_000, "BIG");
    const res = await safe(() => PAY.createPayrollRunV2(c(s), VP, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }));
    out("B2.bigSalary", { res: short(res, 300), item: res?.id ? await rows(`SELECT "grossSatang" AS g, "whtSatang" AS w, "ssoEmployeeSatang" AS se, "netSatang" AS n FROM "HrPayrollItem" WHERE "runId" = $1`, res.id) : null });
    if (res?.id) out("B2.approve(no book)", await safe(() => PAY.approveRun(c(s), res.id, undefined, ownA)));
  }
  // ── C. shift swap → judgement → pay (two u1 employees, 30,000 each) ──
  {
    const JG = (await import("@/lib/modules/hr/judge")) as Any;
    const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
    const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
    const SW = (await import("@/lib/modules/hr/swap")) as Any;
    const s = await sys("ทีมสลับ");
    await v2(s);
    const uX = await fx.mkUser(TT, "ux", `Q52 ux ${tag}`, "STAFF", [u1], {});
    const uY = await fx.mkUser(TT, "uy", `Q52 uy ${tag}`, "STAFF", [u1], {});
    const eX = await emp(s, "SX", { salary: 3_000_000, unit: u1 });
    const eY = await emp(s, "SY", { salary: 3_000_000, unit: u1 });
    await P.hrEmployee.update({ where: { id: eX }, data: { linkedUserId: uX.id } });
    await P.hrEmployee.update({ where: { id: eY }, data: { linkedUserId: uY.id } });
    const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: "เช้า", startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
    const ent = async (e: string, day: string) => (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: e, date: dd(day), shiftId: sh, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-07-01T00:00:00Z"), source: "MANUAL" } })).id as string;
    const fX = await ent(eX, "2031-08-18");
    const tY = await ent(eY, "2031-08-19");
    const r1 = await safe(() => SW.requestSwap(c(s), { userId: uX.id, role: "STAFF", unitAccess: [u1], permissions: {} }, { fromEntryId: fX, targetEmployeeId: eY, toEntryId: tY, reason: "qc" }));
    const r2 = r1?.ok ? await safe(() => SW.respondSwap(c(s), { userId: uY.id, role: "STAFF", unitAccess: [u1], permissions: {} }, r1.id, { accept: true })) : null;
    const r3 = r1?.ok ? await safe(() => SW.decideSwap(c(s), { ...own, userId: U.owner.id }, r1.id, { decision: "APPROVED" })) : null;
    const who = async (d: string) => (await rows(`SELECT "employeeId" AS e, id FROM "HrRosterEntry" WHERE "systemId" = $1 AND date = $2::date`, s, d)).map((x: Any) => ({ e: x.e === eX ? "eX" : "eY", id: x.id }));
    const [w18, w19] = [await who("2031-08-18"), await who("2031-08-19")];
    out("C.swap", { r1, r2, r3, d18: w18.map((x) => x.e), d19: w19.map((x) => x.e) });
    // punches follow the roster AFTER the swap (whoever is on it works on time)
    for (const [d, w] of [["2031-08-18", w18], ["2031-08-19", w19]] as const) for (const x of w) {
      await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: x.e === "eX" ? eX : eY, kind: "IN", at: bk(d, "08:58"), rosterEntryId: x.id, source: "KIOSK" } });
      await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: x.e === "eX" ? eX : eY, kind: "OUT", at: bk(d, "17:00"), rosterEntryId: x.id, source: "KIOSK" } });
    }
    await AP.saveAttendancePayPolicy(c(s), own, { enabled: true });
    for (const d of ["2031-08-20", "2031-08-27", "2031-09-03"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
    out("C.build", (await safe(() => WE.buildWorkEntrySnapshot(c(s), own, { periodKey: "2031-08" }, { now: NOW })))?.ok);
    out("C.days", (await rows(`SELECT "employeeId" AS e, date::text AS d, "dayStatus"::text AS st, "workMin" AS w, "absentMin" AS a FROM "HrWorkDay" WHERE "systemId" = $1 AND ("workMin" > 0 OR "absentMin" > 0) ORDER BY date`, s)).map((r: Any) => `${r.e === eX ? "eX" : "eY"}${r.d.slice(8)}:${r.st}:w${r.w}:a${r.a}`));
    out("C.sync", await safe(() => AP.syncAttendanceDeductions(c(s), own, { periodKey: "2031-08" }, { now: NOW })));
    const cr2 = await safe(() => PAY.createPayrollRunV2(c(s), VP, { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }));
    out("C.run", cr2?.id ? (await rows(`SELECT "employeeId" AS e, "grossSatang" AS g, "deductSatang" AS d FROM "HrPayrollItem" WHERE "runId" = $1`, cr2.id)).map((i: Any) => `${i.e === eX ? "eX" : "eY"}:${i.g}:${i.d}`) : cr2);
  }
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
