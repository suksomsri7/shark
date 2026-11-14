// H5.2 money hunter p1 — TIME → PAY chain on one v2 tenant/month (Aug 2031) + reconciliation across documents + post-approval changes
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/p1-chain.mts
import { type Any, setup, short, satOf, T, errText } from "./common.mjs";

const S = await setup("h52m-p1");
const { P, fx, tag, TT, u1, u2, U, V, c, rows, safe, sys, book, fin, emp, runOf, itemsOf, entries, linesBy, PAY, FS, BK, REP, PS } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1400)}`);
const sum = (xs: Any[], k: string) => xs.reduce((t, x) => t + Number(x[k] ?? 0), 0);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
const dd = (day: string) => new Date(`${day}T00:00:00Z`);
const PER = "2031-08";
const PAYDATE = bk("2031-08-31", "10:00");
const NOW = bk("2031-09-05", "12:00");
let crashed = "";
try {
  const JG = (await import("@/lib/modules/hr/judge")) as Any;
  const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
  const OT = (await import("@/lib/modules/hr/ot")) as Any;
  const CM = (await import("@/lib/modules/hr/correction")) as Any;
  const AP = (await import("@/lib/modules/hr/attendance-pay")) as Any;
  const SW = (await import("@/lib/modules/hr/swap")) as Any;
  const LV = (await import("@/lib/modules/hr/leave")) as Any;
  const LB = (await import("@/lib/modules/hr/labor")) as Any;
  const AI = (await import("@/lib/modules/hr/ai")) as Any;
  const APIA = (await import("@/lib/modules/hr/api/actor")) as Any;
  const APIR = (await import("@/lib/modules/hr/api/ops/reports")) as Any;
  // ── fixture ──
  const sA = await sys("ทีมเวลา");
  const BA = await book("A");
  const own = V.owner;
  out("F.setBook", await safe(() => PAY.setPayrollBook(c(sA), own, { accountSystemId: BA })));
  const finA = await fin(BA, "bankA");
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const uB = await fx.mkUser(TT, "ub", `Q52 ub ${tag}`, "STAFF", [u1], {});
  const uC = await fx.mkUser(TT, "uc", `Q52 uc ${tag}`, "STAFF", [u1], {});
  const eA = await emp(sA, "EA", { salary: 3_000_000, unit: u1, nid: "1102000123454" });
  const eB = await emp(sA, "EB", { salary: 2_000_000, unit: u2, nid: "3100600999991" });
  const eC = await emp(sA, "EC", { salary: 2_500_000, unit: u1, nid: "1500100123451" });
  await P.hrEmployee.update({ where: { id: eB }, data: { linkedUserId: uB.id } });
  await P.hrEmployee.update({ where: { id: eC }, data: { linkedUserId: uC.id } });
  const name: Record<string, string> = { [eA]: "eA", [eB]: "eB", [eC]: "eC" };
  const FIX_TS = new Date("2031-07-01T00:00:00Z");
  const sh = (await P.hrShift.create({ data: { tenantId: TT, systemId: sA, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 5 } })).id as string;
  const shBr = (await P.hrShift.create({ data: { tenantId: TT, systemId: sA, name: `เช้าพัก ${tag}`, startMin: 540, endMin: 1080, crossesMidnight: false, graceMin: 5 } })).id as string;
  const ent = async (e: string, day: string, unitId: string, o: { shift?: string; end?: number; br?: number } = {}) =>
    (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA, employeeId: e, date: dd(day), shiftId: o.shift ?? sh, unitId, startMin: 540, endMin: o.end ?? 1020, breakMin: o.br ?? 0, crossesMidnight: false, published: true, publishedAt: FIX_TS, source: "MANUAL" } })).id as string;
  const att = async (e: string, kind: string, at: Date, re: string | null) => (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: e, kind, at, rosterEntryId: re, source: "KIOSK" } })).id as string;
  const work = async (e: string, day: string, unitId: string, inHm: string | null, outHm: string | null, o: { shift?: string; end?: number; br?: number } = {}) => {
    const re = await ent(e, day, unitId, o);
    return { re, i: inHm ? await att(e, "IN", bk(day, inHm), re) : null, o: outHm ? await att(e, "OUT", bk(day, outHm), re) : null };
  };
  // eA (u1, 30,000)
  await work(eA, "2031-08-04", u1, "09:30", "17:00"); // late 30
  await work(eA, "2031-08-05", u1, "09:00", "16:15"); // early 45
  const a06 = await work(eA, "2031-08-06", u1, "09:00", null); // missing OUT
  await work(eA, "2031-08-07", u1, "09:20", "19:00"); // late 20 + OT 17–19
  await work(eA, "2031-08-08", u1, "09:00", "19:00"); // public holiday worked + OT 17–19
  await work(eA, "2031-08-11", u1, "09:00", "18:00", { shift: shBr, end: 1080, br: 60 }); // break shift 9–18 (60) ⇒ 480 work
  await work(eA, "2031-08-12", u1, null, null); // unpaid leave
  await work(eA, "2031-08-13", u1, null, null); // paid leave
  await work(eA, "2031-08-14", u1, null, null); // absent
  const a15 = await work(eA, "2031-08-15", u1, "09:40", "17:00"); // late 40 → corrected after judgement + approval
  await P.hrHoliday.create({ data: { tenantId: TT, systemId: sA, unitId: null, date: dd("2031-08-08"), name: `วันหยุด ${tag}`, kind: "PUBLIC" } });
  const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sA, category: "PERSONAL", name: `ลากิจไม่รับค่าจ้าง ${tag}`, paid: false, allowHours: true } })).id as string;
  const polV = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: sA, category: "VACATION", name: `พักร้อน ${tag}`, paid: true, allowHours: true } })).id as string;
  const leave = async (e: string, type: string, day: string, pol: string, status = "APPROVED") => (await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: e, type, fromDate: dd(day), toDate: dd(day), status, policyId: pol, days: 1, reason: `ลับ ${tag}` } })).id as string;
  await leave(eA, "PERSONAL", "2031-08-12", polU);
  await leave(eA, "VACATION", "2031-08-13", polV);
  // eC: 4–8 at u1, 25–29 at u2 (moved branch mid-month) · eB/eC swap 18 ↔ 19 (both u1)
  for (const d of ["04", "05", "06", "07"]) await work(eC, `2031-08-${d}`, u1, "08:55", "17:00");
  for (const d of ["25", "26", "27", "28", "29"]) await work(eC, `2031-08-${d}`, u2, "08:55", "17:00");
  const eB18 = await ent(eB, "2031-08-18", u1);
  const eC19 = await ent(eC, "2031-08-19", u1);
  const sw = await safe(() => SW.requestSwap(c(sA), { userId: uB.id, role: "STAFF", unitAccess: [u1], permissions: {} }, { fromEntryId: eB18, targetEmployeeId: eC, toEntryId: eC19, reason: "qc" }));
  const rs = sw?.ok ? await safe(() => SW.respondSwap(c(sA), { userId: uC.id, role: "STAFF", unitAccess: [u1], permissions: {} }, sw.id, { accept: true })) : sw;
  const ds = sw?.ok ? await safe(() => SW.decideSwap(c(sA), { ...own, userId: U.owner.id }, sw.id, { decision: "APPROVED" })) : sw;
  const r18 = (await rows(`SELECT id, "employeeId" AS e FROM "HrRosterEntry" WHERE "systemId" = $1 AND date = '2031-08-18'`, sA)).map((r: Any) => name[r.e]);
  const r19 = (await rows(`SELECT id, "employeeId" AS e FROM "HrRosterEntry" WHERE "systemId" = $1 AND date = '2031-08-19'`, sA)).map((r: Any) => name[r.e]);
  out("F.swap", { req: sw?.ok ?? sw, resp: rs?.ok ?? rs, decide: ds?.ok ?? ds, r18, r19 });
  // punches per the roster after the swap (on time)
  for (const d of ["2031-08-18", "2031-08-19"]) {
    const re = (await rows(`SELECT id, "employeeId" AS e FROM "HrRosterEntry" WHERE "systemId" = $1 AND date = $2::date`, sA, d))[0];
    if (re) { await att(re.e, "IN", bk(d, "08:58"), re.id); await att(re.e, "OUT", bk(d, "17:00"), re.id); }
  }
  // adjustments for eB: advance 5,000 + damages 3,000 (requested by pay1, approved by owner)
  const ownA = { userId: U.owner.id, isOwner: true };
  const adv = await PAY.requestAdjustment(c(sA), { employeeId: eB, periodKey: PER, kind: "ADVANCE", amountSatang: 500_000, note: "เบิกล่วงหน้า qc", requestedById: U.pay1.id });
  const dmg = await PAY.requestAdjustment(c(sA), { employeeId: eB, periodKey: PER, kind: "DEDUCTION", amountSatang: 300_000, note: "ค่าเสียหาย qc", requestedById: U.pay1.id });
  out("F.adj", { adv, dmg, a1: await safe(() => PAY.decideAdjustment(c(sA), adv.id, "APPROVED", ownA)), a2: await safe(() => PAY.decideAdjustment(c(sA), dmg.id, "APPROVED", ownA)) });
  // engine v2 (H3.4 oracle pattern: settings key) + attendance-pay policy on
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, sA);
  out("F.attPolicy", await safe(() => AP.saveAttendancePayPolicy(c(sA), own, { enabled: true })));
  // OT requests (owner) — day 7 (workday) and day 8 (holiday) 17:00–19:00
  const ot7 = await safe(() => OT.requestOt(c(sA), own, { employeeId: eA, date: "2031-08-07", start: "17:00", end: "19:00", reason: "QC" }, { now: bk("2031-08-06", "10:00") }));
  const ot8 = await safe(() => OT.requestOt(c(sA), own, { employeeId: eA, date: "2031-08-08", start: "17:00", end: "19:00", reason: "QC" }, { now: bk("2031-08-07", "10:00") }));
  const job = (d: string) => safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
  for (const d of ["2031-08-06", "2031-08-09", "2031-08-12"]) await job(d);
  out("F.otDecide", [await safe(() => OT.decideOtRequest(c(sA), own, ot7?.id, "APPROVED", { now: bk("2031-08-09") })), await safe(() => OT.decideOtRequest(c(sA), own, ot8?.id, "APPROVED", { now: bk("2031-08-09") }))]);
  for (const d of ["2031-08-16", "2031-08-20", "2031-08-23", "2031-08-27", "2031-08-30", "2031-09-02", "2031-09-05"]) await job(d);
  out("F.settle", await safe(() => OT.settleOtRequests({ tenantId: TT, systemId: sA, now: NOW })));
  const build = () => safe(() => WE.buildWorkEntrySnapshot(c(sA), own, { periodKey: PER }, { now: NOW }));
  const sync = () => safe(() => AP.syncAttendanceDeductions(c(sA), own, { periodKey: PER }, { now: NOW }));
  const attRows = async () => (await rows(`SELECT id, "employeeId" AS e, "sourceType"::text AS st, kind::text AS k, status::text AS s, "amountSatang" AS a, "periodKey" AS p, "runId" AS r, "sourceRef" AS ref FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY "createdAt", id`, sA));
  const showAdj = async () => (await attRows()).map((r: Any) => `${name[r.e]}:${r.st ?? "-"}:${r.k}:${r.s}:${r.a}:${r.p}:${r.r ? "bound" : "free"}`);
  const create = () => safe(() => PAY.createPayrollRunV2(c(sA), VP, { periodKey: PER, payDate: PAYDATE }, { now: NOW, actor: { userId: U.pay1.id, isOwner: false } }));

  // ── 1. judgement → work entries ──
  const wdOf = async () => (await rows(`SELECT "employeeId" AS e, date::text AS d, "dayClass"::text AS c, "dayStatus"::text AS st, "lateMin" AS l, "earlyOutMin" AS eo, "absentMin" AS ab, "workMin" AS w, "paidLeaveMin" AS pl, "unpaidLeaveMin" AS ul, "holidayWorkMin" AS hw, "otWorkdayMin" AS ow, "otHolidayMin" AS oh, "unitId" AS u, review FROM "HrWorkDay" WHERE "systemId" = $1 AND "periodKey" = $2 ORDER BY "employeeId", date`, sA, PER))
    .filter((r: Any) => r.w || r.l || r.eo || r.ab || r.pl || r.ul || r.hw || r.ow || r.oh || (r.review ?? []).length).map((r: Any) => `${name[r.e]}${r.d.slice(8)}=${r.c}:${r.st}:l${r.l}:e${r.eo}:a${r.ab}:w${r.w}:pl${r.pl}:ul${r.ul}:hw${r.hw}:ow${r.ow}:oh${r.oh}:${r.u === u1 ? "u1" : r.u === u2 ? "u2" : "-"}${(r.review ?? []).length ? `:${r.review.join("+")}` : ""}`);
  out("1.build0", await build());
  out("1.days0", await wdOf());
  out("1.create0(missing OUT)", await create());
  const corr06 = await safe(() => CM.requestCorrection(c(sA), { ...own, userId: U.owner.id }, { action: "ADD", employeeId: eA, kind: "OUT", at: bk("2031-08-06", "17:00"), reason: "ลืมตอกออก qc" }, { now: NOW }));
  out("1.corr06", corr06);
  out("1.build1", await build());
  out("1.days1", await wdOf());
  out("1.otRows", await rows(`SELECT date::text AS d, status::text AS s, "paidMinutes" AS pm, "amountSatang" AS a, "segmentsJson" AS seg, "settleCode" AS sc FROM "HrOtRequest" WHERE "systemId" = $1 ORDER BY date`, sA));
  // ── 2. attendance deductions ──
  out("2.sync1", await sync());
  out("2.adj1", await showAdj());
  for (const r of await attRows()) if (r.s === "PENDING" && (r.st === "LATE_RULE" || r.st === "ABSENT_RULE")) await safe(() => PAY.decideAdjustment(c(sA), r.id, "APPROVED", ownA));
  out("2.adj1approved", await showAdj());
  // correction AFTER the judgement + deduction approval: day 15 IN 09:40 → 09:00
  const corr15 = await safe(() => CM.requestCorrection(c(sA), { ...own, userId: U.owner.id }, { action: "CHANGE", employeeId: eA, attendanceId: a15.i, at: bk("2031-08-15", "09:00"), reason: "แก้เวลาเข้า qc" }, { now: NOW }));
  out("2.corr15", corr15);
  out("2.build2", await build());
  out("2.create(stale)", await create());
  out("2.sync2", await sync());
  for (const r of await attRows()) if (r.s === "PENDING" && (r.st === "LATE_RULE" || r.st === "ABSENT_RULE")) await safe(() => PAY.decideAdjustment(c(sA), r.id, "APPROVED", ownA));
  out("2.adj2", await showAdj());
  // ── 3. run ──
  const cr = await create();
  out("3.create", cr);
  const R = cr?.id as string;
  const items = await itemsOf(R);
  const run = await runOf(R);
  const linesOf = async (e: string) => ((await rows(`SELECT "snapshotJson"->'lines' AS l, "snapshotJson"->'flags' AS f, "snapshotJson"->'carry' AS cy FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, R, e))[0]) ?? {};
  const adjIds = new Map((await attRows()).map((r: Any) => [r.id, r]));
  const wdIds = new Map((await rows(`SELECT id, date::text AS d FROM "HrWorkDay" WHERE "systemId" = $1`, sA)).map((r: Any) => [r.id, r.d]));
  const refName = (x: string) => (adjIds.has(x) ? `adj:${adjIds.get(x).st ?? adjIds.get(x).k}` : wdIds.has(x) ? `wd${String(wdIds.get(x)).slice(8)}` : x);
  const L: Record<string, string[]> = {};
  for (const e of [eA, eB, eC]) {
    const li = await linesOf(e);
    L[name[e]!] = ((li.l ?? []) as Any[]).map((l) => `${l.code}:${refName(l.ref)}:${l.day ? l.day.slice(8) : "-"}:${l.minutes ?? "-"}:${l.amountSatang}${l.requestedSatang !== undefined ? `/${l.requestedSatang}` : ""}`);
    out(`3.lines.${name[e]}`, { lines: L[name[e]!], flags: li.f, carry: li.cy });
  }
  const money = (i: Any) => (i ? `${i.g}/${i.se}/${i.sr}/${i.w}/${i.n}/${i.a}/${i.d}` : "∅");
  const want = { eA: "2992709/87500/87500/0/2905209/112500/119791", eB: "1300000/87500/87500/0/1212500/0/700000", eC: "2500000/87500/87500/0/2412500/0/0" };
  const got = Object.fromEntries([eA, eB, eC].map((e) => [name[e], money(items.find((i: Any) => i.e === e))]));
  out("3.items", { got, want, eq: Object.fromEntries(Object.keys(want).map((k) => [k, (got as Any)[k] === (want as Any)[k]])) });
  out("3.run", run);
  // trace: every line ref is unique per item; every bound adjustment appears in exactly one line; every line's adjustment is bound to this run
  const bound = await rows(`SELECT id, "employeeId" AS e FROM "HrPayAdjustment" WHERE "runId" = $1`, R);
  const allLines = (await rows(`SELECT "employeeId" AS e, "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1`, R)).flatMap((x: Any) => (x.l as Any[]).map((l) => ({ ...l, e: x.e })));
  const adjLineRefs = allLines.filter((l: Any) => !["BASE", "PRORATION", "HOLIDAY_WORK", "UNPAID_LEAVE", "UNPAID_CAP", "HOLIDAY_PAY", "DAY_WAGE", "HOUR_WAGE"].includes(l.code)).map((l: Any) => l.ref);
  const wdLineKeys = allLines.filter((l: Any) => ["HOLIDAY_WORK", "UNPAID_LEAVE"].includes(l.code)).map((l: Any) => `${l.code}|${l.ref}`);
  out("3.trace", {
    boundN: bound.length, adjLines: adjLineRefs.length, everyBoundOnce: bound.every((b: Any) => adjLineRefs.filter((x: string) => x === b.id).length === 1),
    everyLineBound: adjLineRefs.every((x: string) => bound.some((b: Any) => b.id === x)), wdUnique: new Set(wdLineKeys).size === wdLineKeys.length,
    sumLinesEqGross: items.every((i: Any) => allLines.filter((l: Any) => l.e === i.e).reduce((t: number, l: Any) => t + Number(l.amountSatang), 0) === Number(i.g)),
    runTotals: Number(run.g) === sum(items, "g") && Number(run.n) === sum(items, "n") && Number(run.se) === sum(items, "se") && Number(run.sr) === sum(items, "sr") && Number(run.d) === sum(items, "d") && Number(run.a) === sum(items, "a"),
  });
  // ── 4. idempotency: jobs + build + sync again; recompute draft ──
  const digest0 = (await rows(`SELECT "inputDigest" AS d FROM "HrPayrollRun" WHERE id = $1`, R))[0]?.d;
  await job("2031-09-05");
  out("4.settle", await safe(() => OT.settleOtRequests({ tenantId: TT, systemId: sA, now: NOW })));
  out("4.build", await build());
  out("4.sync", await sync());
  out("4.recompute", await safe(() => PAY.recomputeDraftRun(c(sA), R, { userId: U.pay1.id, isOwner: false }, { viewer: VP, now: NOW })));
  const items2 = await itemsOf(R);
  out("4.same", { digest: digest0 === (await rows(`SELECT "inputDigest" AS d FROM "HrPayrollRun" WHERE id = $1`, R))[0]?.d, items: short(items) === short(items2), adj: (await attRows()).length, ot: await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'OT_REQUEST'`, sA) });
  // ── 5. approve + pay ──
  out("5.approve", await safe(() => PAY.approveRun(c(sA), R, undefined, ownA)));
  out("5.pay", await safe(() => PAY.markPaidRun(c(sA), R, { financeAccountId: finA, paidOn: "2031-08-31", now: NOW })));
  const runA = await runOf(R);
  out("5.run", runA);
  out("5.carry", await rows(`SELECT "employeeId" AS e, kind::text AS k, "amountSatang" AS a, "periodKey" AS p, status::text AS s FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, sA));
  // ── 6. reconciliation ──
  const it = await itemsOf(R);
  const SUM = { g: sum(it, "g"), n: sum(it, "n"), w: sum(it, "w"), se: sum(it, "se"), sr: sum(it, "sr"), sb: sum(it, "sb"), inc: sum(it, "inc"), a: sum(it, "a"), d: sum(it, "d") };
  out("6.sums", SUM);
  const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ฮันเตอร์ จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50", rdFormFlag: 2 };
  out("6.profile", (await safe(() => FS.saveFilingProfile(c(sA), own, PROFILE)))?.ok);
  for (const [e, f] of [[eA, "เอ"], [eB, "บี"], [eC, "ซี"]] as const) await safe(() => FS.saveFilingPerson(c(sA), own, { employeeId: e, title: "นาย", firstName: f, lastName: "ทดสอบ" }));
  const bf = await safe(() => BK.generateBankFile(c(sA), own, { runId: R, format: "CSV", presetId: "GENERIC" }, { now: NOW }));
  const pnd = await safe(() => FS.generateFiling(c(sA), own, { kind: "PND1", period: PER }, { now: NOW }));
  const sso = await safe(() => FS.generateFiling(c(sA), own, { kind: "SSO110", runId: R }, { now: NOW }));
  out("6.bank", { ok: bf?.ok, code: bf?.code, r: bf?.reason, total: bf?.totalSatang, eq: bf?.totalSatang === SUM.n });
  out("6.pnd1", { ok: pnd?.ok, code: pnd?.code, r: pnd?.reason, lines: pnd?.lineCount, total: pnd?.totalSatang, tax: pnd?.taxSatang, eqInc: pnd?.totalSatang === SUM.inc, eqTax: pnd?.taxSatang === SUM.w });
  out("6.sso110", { ok: sso?.ok, code: sso?.code, r: sso?.reason, total: sso?.totalSatang, tax: sso?.taxSatang, sb: SUM.sb, se: SUM.se, sr: SUM.sr });
  const en = await entries(R);
  for (const e of en) out(`6.jv.${String(e.k).split("#").pop()}`, { dr: Number(e.dr), cr: Number(e.cr), lines: await linesBy(e.id) });
  const acc = en.find((e: Any) => String(e.k).endsWith("#accrual"));
  const accL = acc ? await linesBy(acc.id) : [];
  const byCode = (code: string, side: "dr" | "cr") => accL.filter((l: Any) => l.code === code).reduce((t: number, l: Any) => t + Number(l[side]), 0);
  const salaryExp = byCode("6000", "dr") - byCode("6000", "cr");
  const erExp = byCode("6010", "dr");
  out("6.jvCheck", { salaryExp, erExp, wageCost: salaryExp + erExp, cr2120: byCode("2120", "cr"), eqNet: byCode("2120", "cr") === SUM.n });
  const slips = [];
  for (const e of [eA, eB, eC]) slips.push(await safe(() => PS.slipForViewer(c(sA), own, { runId: R, employeeId: e })));
  out("6.slips", slips.map((s: Any, i: number) => ({ ok: s?.ok, net: s?.netSatang, earn: s?.earningsSatang, ded: s?.deductionsSatang, eq: s?.netSatang === Number(it.find((x: Any) => x.e === [eA, eB, eC][i])?.n) })));
  const pm = await safe(() => REP.loadReport(c(sA), own, { report: "payroll-month", period: PER }));
  out("6.payrollMonth", { totals: pm?.totals, g: satOf(pm?.totals?.gross) === SUM.g, n: satOf(pm?.totals?.net) === SUM.n, d: satOf(pm?.totals?.deduct) === SUM.d, er: satOf(pm?.totals?.ssoEmployer) === SUM.sr });
  const lm = async (unitId: string | null) => safe(() => LB.laborMonth(c(sA), own, { unitId, periodKey: PER }, { now: NOW }));
  const [lAll, l1, l2] = [await lm(null), await lm(u1), await lm(u2)];
  out("6.labor", { all: [lAll?.basis, lAll?.costSatang, lAll?.code], u1: [l1?.basis, l1?.costSatang], u2: [l2?.basis, l2?.costSatang], sumUnits: Number(l1?.costSatang ?? 0) + Number(l2?.costSatang ?? 0), runGrossPlusEr: SUM.g + SUM.sr, journalWageCost: salaryExp + erExp });
  const ai = await safe(() => AI.hrLaborPercent({ tenantId: TT, systemId: sA, actor: { kind: "member", userId: U.owner.id } }, { periodKey: PER }));
  out("6.ai", { cost: ai?.body?.costSatang, basis: ai?.body?.basis, mode: ai?.mode, raw: ai?.body?.costSatang === undefined ? ai : undefined });
  const actor = APIA.hrApiKeyActor({ tenantId: TT, systemId: sA, keyId: "qc", keyName: "qc", scopes: ["hr.employee.read", "hr.payroll.read"], bound: true, createdById: U.owner.id });
  const api = await safe(() => APIR.REPORTS_OPS[0].handler({ actor, params: { report: "payroll-month" }, input: { period: PER } }));
  out("6.api", { totals: api?.totals ?? api, eqNet: satOf(api?.totals?.net) === SUM.n || api?.totals?.netSatang === SUM.n });
  // ── 7. changes AFTER approval/pay ──
  const out05 = (await rows(`SELECT id FROM "HrAttendance" WHERE "employeeId" = $1 AND kind::text='OUT' AND at = $2 AND "voidedAt" IS NULL`, eA, bk("2031-08-05", "16:15")))[0]?.id;
  const corrAfter = await safe(() => CM.requestCorrection(c(sA), { ...own, userId: U.owner.id }, { action: "CHANGE", employeeId: eA, attendanceId: out05, at: bk("2031-08-05", "17:00"), reason: "แก้หลังจ่าย qc" }, { now: NOW }));
  out("7.correctionAfterPaid", corrAfter);
  const pendLeave = await leave(eA, "PERSONAL", "2031-08-14", polU, "PENDING");
  const lvDec = await safe(() => LV.decideLeaveAs(c(sA), { ...own, userId: U.owner.id }, pendLeave, "APPROVED"));
  out("7.backdatedUnpaidLeaveOnPaidMonth", { decide: lvDec, status: (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, pendLeave))[0]?.s });
  out("7.buildAfter", await build());
  out("7.syncAfter", await sync());
  out("7.preview", await safe(() => WE.workEntryPreview(c(sA), own, { periodKey: PER }, { now: NOW })).then((p: Any) => ({ ok: p?.ok, frozen: p?.frozen, states: (p?.rows ?? []).map((r: Any) => `${name[r.employeeId]}=${r.state}`) })));
  out("7.adjAfter", await showAdj());
  out("7.runUnchanged", short(await runOf(R)) === short(runA) && short(await itemsOf(R)) === short(it));
  // Sept: is anything for the back-dated unpaid leave surfaced? (create Sept draft and look)
  const sepNow = bk("2031-10-05");
  await P.$executeRawUnsafe(`SELECT 1`);
  out("7.sepBuild", await safe(() => WE.buildWorkEntrySnapshot(c(sA), own, { periodKey: "2031-09" }, { now: sepNow })));
  const sep = await safe(() => PAY.createPayrollRunV2(c(sA), VP, { periodKey: "2031-09", payDate: bk("2031-09-30", "10:00") }, { now: sepNow, actor: { userId: U.pay1.id, isOwner: false } }));
  out("7.sepCreate", sep);
  if (sep?.id) for (const e of [eA, eB]) out(`7.sepLines.${name[e]}`, ((await rows(`SELECT "snapshotJson"->'lines' AS l FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, sep.id, e))[0]?.l ?? []).map((l: Any) => `${l.code}:${l.amountSatang}${l.requestedSatang !== undefined ? `/${l.requestedSatang}` : ""}`));
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
