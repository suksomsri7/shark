// scratch (HR VIS-5b investigation, not part of the repo): does the time report count an approved LEAVE day when the day is stored by the
// real judge path (finalizeStoredGaps), and does the board agree? Same fixture shape as qc-hr-vis-5b (a6 approved PERSONAL leave yesterday).
import { type Any, errText, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate } from "/root/projects/shark-hr/scripts/qc-hr-lib.mjs";
import { installNetGuard, sweepTenants, sweepResidue } from "/root/projects/shark-hr/scripts/qc-hr-h4.3-lib.mjs";
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
const { P, coreHash } = await qc4Env("qc-hr-vis5b-probe");
const judge = (await import("@/lib/modules/hr/judge")) as Any, rep = (await import("@/lib/modules/hr/reports")) as Any, sys = (await import("@/lib/modules/system/service")) as Any;
const PFX = "qc-hr-vis5bp-", tag = tagOf(String(Date.now())), SLUG = `${PFX}${Date.now()}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), DM1 = addDay(D0, -1), MONTH = DM1.slice(0, 7);
try {
  const T = await fx.newTenant("", "QC VIS5b probe");
  const U1 = await fx.newUnit(T, `QCV5bP u1 ${tag}`, "u1");
  const HRS = (await sys.createSystem(T, "HR", `HR ${tag}`)).id as string;
  await sys.linkUnit(T, HRS, U1).catch(() => undefined);
  const ctx = { tenantId: T, systemId: HRS };
  const owner = await fx.mkUser(T, "owner", `QCV5bP owner ${tag}`, "OWNER", [], {});
  const v = { role: owner.role, unitAccess: owner.unitAccess, permissions: owner.permissions, userId: owner.id };
  const A = await fx.mkEmp(T, HRS, `QCV5bP a ${tag}`, { code: "P1", startDate: "2025-01-01", unitId: U1, status: "ACTIVE" });
  const B = await fx.mkEmp(T, HRS, `QCV5bP b ${tag}`, { code: "P2", startDate: "2025-01-01", unitId: U1, status: "ACTIVE" });
  const sh = (await P.hrShift.create({ data: { ...ctx, unitId: U1, name: `S ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id;
  const pol = (await P.hrLeavePolicy.create({ data: { ...ctx, category: "PERSONAL", name: `P ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id;
  for (const e of [A, B]) await P.hrRosterEntry.create({ data: { ...ctx, employeeId: e, date: dbDate(DM1), shiftId: sh, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
  await P.hrLeave.create({ data: { ...ctx, employeeId: A, policyId: pol, type: "PERSONAL", fromDate: dbDate(DM1), toDate: dbDate(DM1), status: "APPROVED", reason: "x", days: 1 } });
  // B: hand-written stored LEAVE row exactly like qc-hr-vis-5b's stored() helper (no leaveFraction) — control for the oracle's observation
  const reB = await P.hrRosterEntry.findFirst({ where: { employeeId: B } });
  const board0 = await judge.loadAttendanceBoard(ctx, v, { day: DM1 }, {});
  const rep0 = await rep.loadReport(ctx, v, { report: "time", period: MONTH });
  const fin = await judge.finalizeStoredGaps(ctx, [A], DM1, DM1, new Date());
  await P.hrAttendanceDay.create({ data: { ...ctx, employeeId: B, date: dbDate(DM1), slotKey: reB.id, rosterEntryId: reB.id, unitId: U1, startMin: 480, endMin: 1020, status: "LEAVE", lateMin: 0, workedMin: 0, judgedAt: new Date() } });
  const stored = await P.hrAttendanceDay.findMany({ where: { systemId: HRS }, select: { employeeId: true, status: true, leaveFraction: true } });
  const board1 = await judge.loadAttendanceBoard(ctx, v, { day: DM1 }, {});
  const rep1 = await rep.loadReport(ctx, v, { report: "time", period: MONTH });
  const who = (id: string) => (id === A ? "A(judge-stored)" : "B(hand-stored)");
  console.log(JSON.stringify({
    day: DM1,
    boardBefore: board0.rows.map((r: Any) => `${who(r.employeeId)}:${r.slots.map((s: Any) => `${s.status}/stored=${s.stored}`).join(",")}`),
    reportBeforeStore: { ok: rep0.ok, rows: rep0.rows?.length, leaveDays: rep0.totals?.leaveDays },
    finalized: fin,
    stored: stored.map((s: Any) => `${who(s.employeeId)}:${s.status}:leaveFraction=${s.leaveFraction}`),
    boardAfter: board1.rows.map((r: Any) => `${who(r.employeeId)}:${r.slots.map((s: Any) => `${s.status}/stored=${s.stored}`).join(",")}`),
    reportAfter: { totals: rep1.totals?.leaveDays, rows: rep1.rows?.map((r: Any) => `${who(r.employeeId)}:leaveDays=${r.values.leaveDays}`) },
  }, null, 1));
} catch (e) {
  console.log(`probe error ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  try { await sweepTenants(P, fx.tenants); } catch (e) { console.log(`sweep ${errText(e)}`); }
  await cleanupFx(P, fx, SLUG);
  const r1 = await sweepResidue(P, fx.tenants), r2 = await residueOf(P, fx, SLUG, PFX), left = await P.tenant.count({ where: { slug: { startsWith: PFX } } });
  console.log(`RESIDUE sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left}`);
  await P.$disconnect?.();
}
process.exit(0);
