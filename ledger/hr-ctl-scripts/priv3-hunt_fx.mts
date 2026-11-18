// PRIV-3 hunt — shared fixture (own tenants qc-h52p-*) · run only through the lane wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
import { makeFixtures, tagOf, addDay, dbDate, errText } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
import { v1Item } from "/root/projects/shark-hr-l5/scripts/qc-hr-h3.8-lib.mjs";

export const PFX = "qc-h52p-";
export const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
export const SLUG = `${PFX}${Date.now()}${tag}`;
export const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
export const MONTH = D0.slice(0, 7);
export const PREV = (() => { const [y, m] = MONTH.split("-").map(Number); return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7); })();
export const unk = () => `c${Math.random().toString(36).slice(2, 12)}zq${Math.random().toString(36).slice(2, 10)}`;
const PAYK = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.payadjust.reject": true };
export const NAMEPFX = `QCH5 `;

export async function buildFx(P: Any, coreHash: Any, M: Any) {
  const fx = makeFixtures(P, coreHash, SLUG);
  const T = await fx.newTenant("", "QC H52P priv3 shop"), T2 = await fx.newTenant("-x", "QC H52P priv3 other");
  const U1 = await fx.newUnit(T, `QCH5 สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCH5 สาขาสอง ${tag}`, "u2"), UX = await fx.newUnit(T2, `QCH5 ร้านอื่น ${tag}`, "ux");
  const HRS = (await M.sys.createSystem(T, "HR", `HRA ${tag}`)).id as string;
  const HRS2 = (await M.sys.createSystem(T, "HR", `HRB ${tag}`)).id as string; // second HR system, same shop
  const HRX = (await M.sys.createSystem(T2, "HR", `HRX ${tag}`)).id as string;
  for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
  await M.sys.linkUnit(T, HRS2, U2).catch(() => undefined);
  await M.sys.linkUnit(T2, HRX, UX).catch(() => undefined);
  const sc = { tenantId: T, systemId: HRS };
  const mk = (k: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = T) => fx.mkUser(tid, k.toLowerCase(), `QCH5 user${k} ${tag}`, r, ua, p);
  const W: Record<string, Any> = {
    O: await mk("O", "OWNER", [], {}), M: await mk("M", "MANAGER", ["*"], {}), MB: await mk("MB", "MANAGER", [U1], {}), P: await mk("P", "STAFF", ["*"], PAYK), PB: await mk("PB", "STAFF", [U1], PAYK),
    S: await mk("S", "STAFF", ["*"], { "hr.leave.request": true }), S0: await mk("S0", "STAFF", [], {}), SR: await mk("SR", "STAFF", ["*"], { "hr.leave.request": true }),
    SD: await mk("SD", "STAFF", ["*"], { "hr.leave.request": true, "hr.leave.read": true, "hr.leave.decide": true }),
    K: await mk("K", "STAFF", ["*"], { "hr.attendance.clock": true }), N: await mk("N", "STAFF", [], {}),
    SE: await mk("SE", "STAFF", [], { "hr.employee.read": true }), SDec: await mk("SDec", "STAFF", [], { "hr.leave.decide": true }), SPR: await mk("SPR", "STAFF", [], { "hr.payadjust.request": true }),
    SPA: await mk("SPA", "STAFF", [], { "hr.payadjust.approve": true }), SRR: await mk("SRR", "STAFF", [], { "hr.roster.read": true }), SRO: await mk("SRO", "STAFF", [], { "hr.payroll.read": true }),
    X2: await mk("X2", "STAFF", [], { "hr.leave.request": true }), XO: await mk("XO", "OWNER", [], {}, T2),
  };
  const defs: [string, string, string | null, string | null, Record<string, Any>][] = [
    ["e1", HRS, U1, W.S.id, {}], ["e2", HRS, U1, null, {}], ["e3", HRS, U2, null, {}], ["e4", HRS, U2, null, {}], ["e5", HRS, U1, null, { active: false, status: "ENDED", endDate: addDay(D0, -10) }], ["e7", HRS, U1, W.S0.id, {}],
    ["eK", HRS, U1, W.K.id, {}], ["x2e", HRS2, U2, W.X2.id, {}], ["x2o", HRS2, U2, null, {}],
  ];
  const E: Record<string, { id: string; name: string; sys: string }> = {};
  for (const [i, [k, sys, u, link, o]] of defs.entries()) {
    const name = `${NAMEPFX}${k} ${tag}`;
    const id = await fx.mkEmp(T, sys, name, { code: `H5${i}`, startDate: "2024-02-01", position: "บาริสต้า", unitId: u, linkedUserId: link, ...o });
    await P.hrSalaryProfile.create({ data: { tenantId: T, systemId: sys, employeeId: id, payType: "MONTHLY", baseSalarySatang: 2_500_000 + i * 1_013, ssoEligible: true } });
    E[k] = { id, name, sys };
  }
  const xe = await fx.mkEmp(T2, HRX, `${NAMEPFX}xT2 ${tag}`, { code: "XT", unitId: UX });
  E.xT2 = { id: xe, name: `${NAMEPFX}xT2 ${tag}`, sys: HRX };
  await P.hrEmployeeUnit.create({ data: { ...sc, employeeId: E.e3!.id, unitId: U1, fromDate: dbDate(addDay(D0, -3)) } });
  const doc = (await P.hrEmployeeDoc.create({ data: { ...sc, employeeId: E.e2!.id, kind: "OTHER", title: "เอกสาร", url: `https://files.invalid/${tag}` } })).id as string;
  const pol = (await P.hrLeavePolicy.create({ data: { ...sc, category: "PERSONAL", name: `กิจ ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id as string;
  await P.approvalPolicy.create({ data: { tenantId: T, name: `H5 ลา ${tag}`, entityType: "HrLeave", active: true, steps: { create: [{ tenantId: T, order: 1, approverRole: "MANAGER" }] } } }).catch(() => undefined);
  const leave = (await P.hrLeave.create({ data: { ...sc, employeeId: E.e2!.id, policyId: pol, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: `ธุระ ${tag}`, days: 1 } })).id as string;
  let svcLeave = "";
  try { const r = await M.svc.requestLeave(sc, { employeeId: E.e3!.id, type: "PERSONAL", policyId: pol, fromDate: addDay(D0, 25), toDate: addDay(D0, 25), reason: `svc ${tag}`, actorUserId: W.O.id }); svcLeave = String(r?.id ?? ""); } catch (e) { svcLeave = `ERR ${errText(e)}`; }
  const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
  const sh = (await P.hrShift.create({ data: { ...sc, unitId: U1, name: `เช้า ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id as string;
  const entry = async (e: string, day: string) => (await P.hrRosterEntry.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(day), shiftId: sh, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } })).id as string;
  const RE = { e1: await entry("e1", addDay(D0, 2)), e2: await entry("e2", addDay(D0, 2)), e2b: await entry("e2", addDay(D0, 3)), e1t: await entry("e1", D0), e2t: await entry("e2", D0) };
  const att = (await P.hrAttendance.create({ data: { ...sc, employeeId: E.e2!.id, kind: "IN", at: bkk(addDay(D0, -1), 500), source: "MOBILE" } })).id as string;
  const ot = (await P.hrOtRequest.create({ data: { ...sc, employeeId: E.e2!.id, date: dbDate(addDay(D0, 2)), startAt: bkk(addDay(D0, 2), 1020), endAt: bkk(addDay(D0, 2), 1080), minutes: 60, timing: "AFTER", reason: `otr ${tag}`, status: "PENDING" } })).id as string;
  const corr = (await P.hrTimeCorrection.create({ data: { ...sc, employeeId: E.e2!.id, kind: "OUT", proposedAt: bkk(addDay(D0, -1), 1020), reason: `corr ${tag}`, status: "PENDING", day: dbDate(addDay(D0, -1)) } })).id as string;
  const adj = (await P.hrPayAdjustment.create({ data: { ...sc, employeeId: E.e2!.id, periodKey: MONTH, kind: "BONUS", amountSatang: 12_345, status: "PENDING", requestedById: W.O.id } })).id as string;
  const note = (await P.hrReviewNote.create({ data: { ...sc, employeeId: E.e2!.id, kind: "NOTE", title: "QC", body: `body ${tag}`, visibleToEmployee: false } })).id as string;
  const run = await P.hrPayrollRun.create({ data: { ...sc, periodKey: PREV, payDate: new Date(`${PREV}-28T12:00:00+07:00`), status: "PAID", engineVersion: 1, totalGrossSatang: 6_000_000, totalSsoEmployeeSatang: 150_000, totalSsoEmployerSatang: 150_000, totalWhtSatang: 0, totalNetSatang: 5_850_000, totalAddSatang: 0 } });
  for (const e of ["e1", "e2"]) await P.hrPayrollItem.create({ data: { ...sc, runId: run.id, employeeId: E[e]!.id, ...v1Item(3_000_000, [], { add: 0, deduct: 0, gross: 3_000_000, ssoBase: 1_500_000, ee: 75_000, wht: 0 }) } });
  const swap = await P.hrShiftSwapRequest.create({ data: { ...sc, requesterEmployeeId: E.e2!.id, targetEmployeeId: E.e1!.id, fromEntryId: RE.e2, toEntryId: RE.e1, status: "AWAITING_PEER", reason: "swap" } }).then((r: Any) => r.id as string).catch((e: unknown) => `ERR ${errText(e).slice(0, 80)}`);
  return { fx, T, T2, U1, U2, UX, HRS, HRS2, HRX, sc, W, E, doc, pol, leave, svcLeave, sh, RE, att, ot, corr, adj, note, runId: run.id as string, swap };
}
