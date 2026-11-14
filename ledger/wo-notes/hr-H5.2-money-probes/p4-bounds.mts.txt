// H5.2 money hunter p4 — period boundaries (Bangkok) · Feb proration ÷30 · start/leave on 1st/last day · overnight shift across month end ·
//   run created at 00:30 Bangkok · rehire in the same month (same national id) · branch move mid-month (labour split) · AI labour % · v1 Feb
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/p4-bounds.mts
import { type Any, setup, short, errText } from "./common.mjs";

const S = await setup("h52m-p4");
const { P, TT, u1, u2, U, V, c, rows, safe, sys, book, fin, emp, runOf, itemsOf, PAY, FS } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1600)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
let crashed = "";
try {
  const JG = (await import("@/lib/modules/hr/judge")) as Any;
  const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
  const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
  const LB = (await import("@/lib/modules/hr/labor")) as Any;
  const AI = (await import("@/lib/modules/hr/ai")) as Any;
  const SW = (await import("@/lib/modules/hr/swap")) as Any;
  const sF = await sys("ทีมขอบ");
  const BF = await book("F");
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  await PAY.setPayrollBook(c(sF), own, { accountSystemId: BF });
  const finF = await fin(BF, "bankF");
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const E = {
    start15: await emp(sF, "S15", { salary: 3_000_000, unit: u1, start: "2031-02-15", nid: "1102000123454" }),
    startLast: await emp(sF, "S28", { salary: 3_000_000, unit: u1, start: "2031-02-28", nid: "3100600999991" }),
    end1: await emp(sF, "E01", { salary: 3_000_000, unit: u1, end: "2031-02-01", nid: "1500100123451" }),
    end27: await emp(sF, "E27", { salary: 3_000_000, unit: u1, end: "2031-02-27", nid: "1103700012346" }),
    end28: await emp(sF, "E28", { salary: 3_000_000, unit: u1, end: "2031-02-28", nid: "1103700012354" }),
    night: await emp(sF, "N01", { salary: 3_000_000, unit: u1, nid: "1103700012362" }),
    mover: await emp(sF, "M01", { salary: 3_000_000, unit: u1, nid: "1103700012371" }),
    rehA: await emp(sF, "RH1", { salary: 6_000_000, unit: u1, end: "2031-02-05", nid: "1103700012389" }),
    rehB: await emp(sF, "RH2", { salary: 6_000_000, unit: u1, start: "2031-02-20", nid: "1103700012389" }),
  };
  const nm = Object.fromEntries(Object.entries(E).map(([k, v]) => [v, k]));
  // branch move: u1 until 14 Feb, u2 from 15 Feb (HrEmployeeUnit history)
  await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sF, employeeId: E.mover, unitId: u1, fromDate: dd("2030-01-01"), toDate: dd("2031-02-14") } });
  await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sF, employeeId: E.mover, unitId: u2, fromDate: dd("2031-02-15") } });
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: sF, name: "เช้า", startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  const shN = (await P.hrShift.create({ data: { tenantId: TT, systemId: sF, name: "ดึก", startMin: 1320, endMin: 360, crossesMidnight: true, graceMin: 5 } })).id as string;
  const ent = async (e: string, day: string, unitId: string, night = false) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sF, employeeId: e, date: dd(day), shiftId: night ? shN : sh, unitId, startMin: night ? 1320 : 540, endMin: night ? 360 : 1020, breakMin: 0, crossesMidnight: night, published: true, publishedAt: new Date("2031-01-01T00:00:00Z"), source: "MANUAL" } })).id as string;
  const att = (e: string, kind: string, at: Date, re: string | null) => P.hrAttendance.create({ data: { tenantId: TT, systemId: sF, employeeId: e, kind, at, rosterEntryId: re, source: "KIOSK" } });
  for (const d of ["03", "04", "05", "06"]) { const re = await ent(E.mover, `2031-02-${d}`, u1); await att(E.mover, "IN", bk(`2031-02-${d}`, "08:59"), re); await att(E.mover, "OUT", bk(`2031-02-${d}`, "17:00"), re); }
  for (const d of ["17", "18", "19", "20"]) { const re = await ent(E.mover, `2031-02-${d}`, u2); await att(E.mover, "IN", bk(`2031-02-${d}`, "08:59"), re); await att(E.mover, "OUT", bk(`2031-02-${d}`, "17:00"), re); }
  // night shift 28 Feb 22:00 → 1 Mar 06:00 · IN 22:30 (late 30) · OUT 06:00 next day; and 31 Jan night: IN 23:59, OUT 1 Feb 06:00 (late 99)
  const n28 = await ent(E.night, "2031-02-28", u1, true);
  await att(E.night, "IN", bk("2031-02-28", "22:30"), n28);
  await att(E.night, "OUT", bk("2031-03-01", "06:00"), n28);
  const n31 = await ent(E.night, "2031-01-31", u1, true);
  await att(E.night, "IN", bk("2031-01-31", "23:59"), n31);
  await att(E.night, "OUT", bk("2031-02-01", "06:00"), n31);
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, sF);
  await AP.saveAttendancePayPolicy(c(sF), own, { enabled: true });
  for (const d of ["2031-02-03", "2031-02-08", "2031-02-15", "2031-02-22", "2031-03-01", "2031-03-03", "2031-03-08"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  // run "created at 00:30 Bangkok on 1 Mar" = 2031-02-28T17:30Z
  const NOWX = new Date("2031-02-28T17:30:00Z");
  const days = async (per: string) => (await rows(`SELECT "employeeId" AS e, date::text AS d, "periodKey" AS p, "dayClass"::text AS c, "lateMin" AS l, "workMin" AS w, "unitId" AS u, review FROM "HrWorkDay" WHERE "systemId" = $1 AND "periodKey" = $2 AND ("workMin" > 0 OR "lateMin" > 0 OR cardinality(review) > 0) ORDER BY "employeeId", date`, sF, per))
    .map((r: Any) => `${nm[r.e]}${r.d.slice(5)}@${r.p}:${r.c}:l${r.l}:w${r.w}:${r.u === u1 ? "u1" : r.u === u2 ? "u2" : "-"}${(r.review ?? []).length ? ":" + r.review.join("+") : ""}`);
  for (const per of ["2031-01", "2031-02"]) out(`B.build.${per}`, await safe(() => WE.buildWorkEntrySnapshot(c(sF), own, { periodKey: per }, { now: NOWX })));
  out("B.days.2031-01", await days("2031-01"));
  out("B.days.2031-02", await days("2031-02"));
  out("B.sync.2031-02", await safe(() => AP.syncAttendanceDeductions(c(sF), own, { periodKey: "2031-02" }, { now: NOWX })));
  out("B.sync.2031-01", await safe(() => AP.syncAttendanceDeductions(c(sF), own, { periodKey: "2031-01" }, { now: NOWX })));
  for (const r of await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND status::text = 'PENDING'`, sF)) await safe(() => PAY.decideAdjustment(c(sF), r.id, "APPROVED", ownA));
  out("B.adj", (await rows(`SELECT "employeeId" AS e, "sourceType"::text AS st, "amountSatang" AS a, "periodKey" AS p, status::text AS s FROM "HrPayAdjustment" WHERE "systemId" = $1`, sF)).map((x: Any) => `${nm[x.e]}:${x.st}:${x.a}:${x.p}:${x.s}`));
  // Feb run: pay date 1 Mar 00:30 Bangkok (Feb 28 17:30Z) — accepted? tax month/year by Bangkok day
  const cr = await safe(() => PAY.createPayrollRunV2(c(sF), VP, { periodKey: "2031-02", payDate: NOWX }, { now: NOWX, actor: { userId: U.pay1.id, isOwner: false } }));
  out("C.createFeb@00:30BKK", cr);
  const R = cr?.id as string;
  if (R) {
    const it = await rows(`SELECT "employeeId" AS e, "grossSatang" AS g, "ssoBaseSatang" AS sb, "ssoEmployeeSatang" AS se, "netSatang" AS n, "snapshotJson"->'lines' AS l, "snapshotJson"->'flags' AS f, "ytdJson"->>'monthIndex' AS mi FROM "HrPayrollItem" WHERE "runId" = $1`, R);
    for (const i of it) out(`C.item.${nm[i.e]}`, { g: i.g, sb: i.sb, se: i.se, n: i.n, mi: i.mi, lines: (i.l as Any[]).map((l) => `${l.code}:${l.minutes ?? "-"}:${l.amountSatang}`), flags: i.f });
    out("C.excluded", await safe(() => PAY.runExclusions(c(sF), "2031-02")).then((x: Any) => (x ?? []).map((y: Any) => `${nm[y.employeeId]}:${y.reason}`)));
    out("C.approve", await safe(() => PAY.approveRun(c(sF), R, undefined, ownA)));
    out("C.pay", await safe(() => PAY.markPaidRun(c(sF), R, { financeAccountId: finF, paidOn: "2031-02-28", now: new Date("2031-03-02T05:00:00Z") })));
    out("C.run", await runOf(R));
    const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ฮันเตอร์ จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50", rdFormFlag: 2 };
    await safe(() => FS.saveFilingProfile(c(sF), own, PROFILE));
    for (const e of Object.values(E)) await safe(() => FS.saveFilingPerson(c(sF), own, { employeeId: e, title: "นาย", firstName: nm[e], lastName: "ทดสอบ" }));
    const NOWF = new Date("2031-03-02T05:00:00Z");
    for (const per of ["2031-02", "2031-03"]) { const p = await safe(() => FS.previewFiling(c(sF), own, { kind: "PND1", period: per }, { now: NOWF })); out(`C.pnd1.${per}`, { ok: p?.ok, code: p?.code, r: p?.reason, lines: p?.lineCount, total: p?.totalSatang }); }
    const sso = await safe(() => FS.generateFiling(c(sF), own, { kind: "SSO110", runId: R }, { now: NOWF }));
    out("C.sso110", { ok: sso?.ok, code: sso?.code, r: sso?.reason, lines: sso?.lineCount, wages: sso?.totalSatang, contrib: sso?.taxSatang, warn: sso?.warnings });
    if (sso?.bytes) out("C.sso110.rehireLines", Buffer.from(sso.bytes).toString("latin1").split(/\r?\n/).filter((l) => l.includes("1103700012389")).map((l) => l.slice(0, 14) + "…" + l.slice(-55, -27)));
    // labour: month actual per branch (owner) + AI tool (owner as member actor)
    const lm = (unitId: string | null) => safe(() => LB.laborMonth(c(sF), own, { unitId, periodKey: "2031-02" }, { now: NOWF }));
    const [a, b1, b2] = [await lm(null), await lm(u1), await lm(u2)];
    const items = await itemsOf(R);
    const G = items.reduce((t: number, i: Any) => t + Number(i.g) + Number(i.sr), 0);
    const mv = items.find((i: Any) => i.e === E.mover);
    out("D.labor", { all: a?.costSatang, u1: b1?.costSatang, u2: b2?.costSatang, sum: Number(b1?.costSatang ?? 0) + Number(b2?.costSatang ?? 0), runGrossPlusEr: G, mover: mv ? Number(mv.g) + Number(mv.sr) : null, basis: a?.basis });
    const ai = await safe(() => AI.hrLaborPercent({ tenantId: TT, systemId: sF, actor: { kind: "member", tenantId: TT, userId: U.owner.id, membership: { role: "OWNER" } } }, { periodKey: "2031-02" }));
    out("D.ai", { cost: ai?.body?.costSatang, basis: ai?.body?.basis, eq: ai?.body?.costSatang === a?.costSatang, raw: ai?.body?.costSatang === undefined ? ai : undefined });
  }
  // swap refusal reason (P1 saw ok:false) — same shape on this system, today = real clock
  const uX = await S.fx.mkUser(TT, "ux", "Q52 ux", "STAFF", [u1], {});
  const uY = await S.fx.mkUser(TT, "uy", "Q52 uy", "STAFF", [u1], {});
  await P.hrEmployee.update({ where: { id: E.start15 }, data: { linkedUserId: uX.id } });
  await P.hrEmployee.update({ where: { id: E.night }, data: { linkedUserId: uY.id } });
  const fe = await ent(E.start15, "2031-06-10", u1);
  const te = await ent(E.night, "2031-06-11", u1);
  out("E.swap", await safe(() => SW.requestSwap(c(sF), { userId: uX.id, role: "STAFF", unitAccess: [u1], permissions: {} }, { fromEntryId: fe, targetEmployeeId: E.night, toEntryId: te, reason: "qc" })));
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
