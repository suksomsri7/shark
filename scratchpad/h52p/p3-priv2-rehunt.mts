// H5.2 re-hunt of HR-PRIV-2 — probe 3: doubling test (hidden employees' pay ×2, diff everything a limited viewer fetches) + own slip + MANAGER [] preview + export names.
// Lane DB only (qc-hr.sh wrapper) · own tenants qc-h52p-* · no outbound.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { writeFileSync } from "node:fs";
import { qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, errText, canon, addDay, dbDate } from "../../scripts/qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "../../scripts/qc-hr-h4.3-lib.mjs";
import { v1Item } from "../../scripts/qc-hr-h3.8-lib.mjs";

const SLUG_PREFIX = "qc-h52p-";
installNetGuard();
const { P, coreHash } = await qc4Env("h52p-priv2");
const imp = async (s: string): Promise<Any> => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const M: Record<string, Any> = {};
for (const [k, s] of Object.entries({
  priv: "@/lib/modules/hr/privacy", svc: "@/lib/modules/hr/service", scope: "@/lib/modules/hr/scope", inbox: "@/lib/modules/hr/inbox", judge: "@/lib/modules/hr/judge",
  roster: "@/lib/modules/hr/roster", leave: "@/lib/modules/hr/leave", ot: "@/lib/modules/hr/ot", stock: "@/lib/modules/hr/stock-charge", we: "@/lib/modules/hr/work-entries",
  ap: "@/lib/modules/hr/attendance-pay", open: "@/lib/modules/hr/payroll-opening", slip: "@/lib/modules/hr/payslip", rep: "@/lib/modules/hr/reports", labor: "@/lib/modules/hr/labor",
  self: "@/lib/modules/hr/self", payroll: "@/lib/modules/hr/payroll", sys: "@/lib/modules/system/service", RR: "@/lib/modules/hr/reports-rules", tools: "@/lib/ai/tools", actor: "@/lib/ai/actor",
})) M[k] = await imp(s);
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
async function call(m: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof m?.[fn] !== "function") return { __missing: fn };
  Object.assign(console, { log() {}, info() {}, warn() {}, error() {} });
  try { return await m[fn](...a); } catch (e) { return { __throw: errText(e) }; } finally { Object.assign(console, REAL); }
}
const ser = (v: unknown) => canon(JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? String(x) : x instanceof Uint8Array || (x && x.type === "Buffer") ? `<bytes:${Buffer.from(x.data ?? x).toString("utf8").length}:${Buffer.from(x.data ?? x).toString("utf8")}>` : x))));

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const DM1 = addDay(D0, -1);
const MONTH = D0.slice(0, 7);
const PREV = (() => { const [y, m] = MONTH.split("-").map(Number); return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7); })();
const YEAR = Number(D0.slice(0, 4));
const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
const OUT: Record<string, Any> = {};

try {
  const TA = await fx.newTenant("", "QC H52P priv2");
  const U1 = await fx.newUnit(TA, `QC52 u1 ${tag}`, "u1"), U2 = await fx.newUnit(TA, `QC52 u2 ${tag}`, "u2");
  const HRS = (await M.sys.createSystem(TA, "HR", `HR ${tag}`)).id as string;
  for (const u of [U1, U2]) await M.sys.linkUnit(TA, HRS, u).catch(() => undefined);
  const ctx = { tenantId: TA, systemId: HRS };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TA, t, `QC52 ${t} ${tag}`, r, ua, p);
  const W: Record<string, Any> = {
    owner: await mk("owner", "OWNER", [], {}),
    payU1: await mk("payu1", "STAFF", [U1], { "hr.payroll.read": true }),
    payU1m: await mk("payu1m", "MANAGER", [U1], { "hr.payroll.read": true }),
    mgrU1: await mk("mgru1", "MANAGER", [U1], {}),
    mgrAll: await mk("mgrall", "MANAGER", [], {}),
    approver: await mk("approver", "STAFF", [U1], { "hr.payadjust.approve": true }),
    emp: await mk("emp", "STAFF", [], {}),
  };
  const E: Record<string, string> = {};
  const defs: [string, string, string | null][] = [["e1", U1, W.emp.id], ["e2", U1, null], ["e3", U1, null], ["e4", U2, null], ["e5", U2, null], ["e6", U2, null]];
  let k = 0;
  for (const [key, home, linked] of defs) { k++; E[key] = await fx.mkEmp(TA, HRS, `QC52 ${key} ${tag}`, { code: `C${k}`, startDate: "2025-01-01", unitId: home, linkedUserId: linked }); }
  const base: Record<string, number> = { e1: 3_011_717, e2: 3_021_717, e3: 3_031_717, e4: 3_041_717, e5: 3_051_717, e6: 3_061_717 };
  for (const key of Object.keys(E)) await P.hrSalaryProfile.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[key], payType: "MONTHLY", baseSalarySatang: base[key], ssoEligible: true } });
  await P.hrEmployeeUnit.create({ data: { tenantId: TA, systemId: HRS, employeeId: E.e6, unitId: U1, fromDate: dbDate(addDay(D0, -40)) } });
  const sh = (await P.hrShift.create({ data: { tenantId: TA, systemId: HRS, unitId: U1, name: `S ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id;
  for (const e of ["e1", "e2", "e6"]) for (const day of [DM1, D0]) await P.hrRosterEntry.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e], date: dbDate(day), shiftId: sh, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
  // paid v1 run (prev month)
  const run = await P.hrPayrollRun.create({ data: { tenantId: TA, systemId: HRS, periodKey: PREV, payDate: new Date(`${PREV}-28T12:00:00+07:00`), status: "PAID", engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
  const itemOf = (key: string, f: number) => v1Item(base[key]! * f, [], { add: 0, deduct: 0, gross: base[key]! * f, ssoBase: 1_500_000, ee: 75_000, wht: 20_000 * f + k });
  const setItems = async (f: Record<string, number>) => {
    await P.hrPayrollItem.deleteMany({ where: { runId: run.id } });
    let g = 0, n = 0, w = 0;
    for (const key of Object.keys(E)) { const it = itemOf(key, f[key] ?? 1); await P.hrPayrollItem.create({ data: { tenantId: TA, systemId: HRS, runId: run.id, employeeId: E[key], ...it } }); g += it.grossSatang; n += it.netSatang; w += it.whtSatang; }
    await P.hrPayrollRun.update({ where: { id: run.id }, data: { totalGrossSatang: g, totalNetSatang: n, totalWhtSatang: w, totalSsoEmployeeSatang: 75_000 * 6, totalSsoEmployerSatang: 75_000 * 6 } });
  };
  await setItems({});
  // approved OT with money (day DM1 in U1 for e2 and borrowed e6; e4 in U2)
  const OT: Record<string, string> = {};
  for (const e of ["e2", "e6", "e4"]) {
    const amt = Math.round((base[e]! / 30 / 8) * 1.5 * 2);
    OT[e] = (await P.hrOtRequest.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e], date: dbDate(DM1), startAt: bkk(DM1, 1020), endAt: bkk(DM1, 1140), minutes: 120, paidMinutes: 120, timing: "AFTER", status: "APPROVED", multiplierBp: 15_000, amountSatang: amt, segmentsJson: [{ cls: "OT_WORKDAY", minutes: 120, multiplierBp: 15_000, amountSatang: amt }] } })).id;
  }
  // pending OT (decidable in inbox) for e6
  OT.e6p = (await P.hrOtRequest.create({ data: { tenantId: TA, systemId: HRS, employeeId: E.e6, date: dbDate(D0), startAt: bkk(D0, 1020), endAt: bkk(D0, 1080), minutes: 60, timing: "AFTER", status: "PENDING" } })).id;
  // stock charge (deduction) for e6 and e2 — amount 15% of base (overCap = amount×10 > base)
  for (const e of ["e2", "e6", "e4"]) {
    const amt = Math.round(base[e]! * 0.15);
    const adj = await P.hrPayAdjustment.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e], periodKey: MONTH, kind: "DEDUCTION", amountSatang: amt, status: "PENDING", sourceType: "INVENTORY_ISSUE", requestedById: W.owner.id } }).catch((x: unknown) => ({ id: null, err: errText(x) }));
    if (adj.id) await P.hrStockCharge.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e], kind: "DAMAGE", requestKey: `${tag}-${e}`, adjustmentId: adj.id, description: "แก้วแตก", amountSatang: amt, consentRef: "C-1", consentAt: dbDate(DM1), consentRecordedById: W.owner.id, requestedById: W.owner.id } }).catch((x: unknown) => console.log(`stock ${e}: ${errText(x)}`));
    else console.log(`adj ${e}: ${adj.err}`);
  }
  // OT pay adjustment with rate snapshot (e6)
  await P.hrPayAdjustment.create({ data: { tenantId: TA, systemId: HRS, employeeId: E.e6, periodKey: MONTH, kind: "OT", amountSatang: 25_000, hours: 2, rateSatang: Math.round(base.e6! / 240), status: "PENDING", requestedById: W.owner.id } });

  const vOf = (w: Any) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
  const week = (() => { const d = new Date(`${D0}T00:00:00Z`); return addDay(D0, -((d.getUTCDay() + 6) % 7)); })();
  // ─── snapshot of everything a viewer can fetch ───
  async function snap(wk: string): Promise<Record<string, string>> {
    const w = W[wk], v = vOf(w), out: Record<string, string> = {};
    const put = async (n: string, m: Any, fn: string, ...a: unknown[]) => { out[n] = ser(await call(m, fn, ...a)); };
    for (const e of ["e2", "e4", "e6"]) {
      await put(`profile:${e}`, M.priv, "loadEmployeeProfileForViewer", ctx, v, E[e]);
      await put(`slipLoader:${e}`, M.priv, "loadPayslipForViewer", ctx, v, run.id, E[e]);
      await put(`slipForViewer:${e}`, M.slip, "slipForViewer", ctx, v, { runId: run.id, employeeId: E[e] });
      await put(`slipHistory:${e}`, M.slip, "slipHistory", ctx, v, { employeeId: E[e], taxYear: Number(PREV.slice(0, 4)) });
      await put(`attMonth:${e}`, M.judge, "loadAttendanceMonth", ctx, v, { employeeId: E[e], month: MONTH });
      await put(`stockList:${e}`, M.stock, "listStockCharges", ctx, v, { employeeId: E[e] });
      await put(`weDays:${e}`, M.we, "workEntryDays", ctx, v, { employeeId: E[e], periodKey: MONTH });
    }
    await put("otList", M.ot, "otRequestList", ctx, v, {});
    await put("otListPending", M.ot, "otRequestList", ctx, v, { status: "PENDING" });
    const sl = await call(M.stock, "listStockCharges", ctx, v, {});
    out.stockList = ser(sl);
    out.stockCap = ser(sl?.items ? [...((await call(M.stock, "stockPeriodCapFlags", ctx, v, sl.items)) ?? [])] : null);
    await put("stockAttention", M.stock, "stockAttention", ctx, v);
    await put("inboxList", M.inbox, "listInbox", ctx, v, {});
    await put("inboxCounts", M.inbox, "inboxCounts", ctx, v);
    await put("teamOverviewWithPreview", M.inbox, "teamOverviewWithPreview", ctx, v, { day: D0 });
    await put("preview", M.payroll, "previewPayrollRunV2", ctx, v, { runId: run.id });
    await put("attDedPreview", M.ap, "attendanceDeductionPreview", ctx, v, { periodKey: MONTH });
    await put("wePreview", M.we, "workEntryPreview", ctx, v, { periodKey: MONTH });
    await put("openingYtd", M.open, "listOpeningYtd", ctx, v, { taxYear: YEAR });
    await put("laborDay", M.labor, "laborDay", ctx, v, { day: D0, unitId: U1 });
    await put("laborDayAll", M.labor, "laborDay", ctx, v, { day: D0 });
    await put("laborWeek", M.labor, "laborWeek", ctx, v, { week, unitId: U1 });
    await put("laborMonthPrev", M.labor, "laborMonth", ctx, v, { periodKey: PREV, unitId: U1 });
    await put("laborMonthPrevAll", M.labor, "laborMonth", ctx, v, { periodKey: PREV });
    await put("laborMonthCur", M.labor, "laborMonth", ctx, v, { periodKey: MONTH, unitId: U1 });
    await put("listAdjustments(page)", M.payroll, "listAdjustments", ctx, undefined, 200, M.scope.hrScopeOf(v));
    for (const r of M.RR.REPORT_IDS as string[]) {
      const kind = M.RR.REPORT_CATALOG[r].period;
      for (const period of kind === "year" ? [PREV.slice(0, 4)] : kind === "day" ? [D0] : [PREV, MONTH]) {
        await put(`rep:${r}:${period}`, M.rep, "loadReport", ctx, v, { report: r, period });
        await put(`csv:${r}:${period}`, M.rep, "exportReport", ctx, v, { report: r, period, format: "CSV" });
      }
    }
    // payroll page composition (payroll-ui.tsx PRIV-2): only when canViewPayroll
    if (M.priv.hrAccessOf(v).seeSensitive) {
      const scope = M.scope.hrScopeOf(v);
      const listed = await M.svc.listEmployees(ctx, 200, scope);
      const emps = listed.filter((e: Any) => M.scope.inPayScope(scope, e.unitId));
      const profs = (await M.payroll.listSalaryProfiles(ctx)).filter((p: Any) => emps.some((e: Any) => e.id === p.employeeId)).map((p: Any) => [p.employeeId, p.baseSalarySatang, p.otHourlyRateSatang]);
      const payIds = await M.scope.payScopeEmployeeIds(ctx, scope);
      const all = M.scope.isAllBranches(scope);
      const runs = (await M.payroll.listRuns(ctx)).map((r: Any) => {
        const shown = all ? r.items : r.items.filter((it: Any) => payIds === null || payIds.includes(it.employeeId));
        const sum = (kk: string) => shown.reduce((x: number, it: Any) => x + it[kk], 0);
        return { p: r.periodKey, n: shown.length, hidden: r.items.length - shown.length, fig: all ? [r.totalNetSatang, r.totalGrossSatang, r.totalSsoEmployeeSatang, r.totalWhtSatang] : [sum("netSatang"), sum("grossSatang"), sum("ssoEmployeeSatang"), sum("whtSatang")], items: shown.map((it: Any) => [it.employeeId, it.grossSatang, it.netSatang]) };
      });
      const stranded = (await M.payroll.strandedAdjustments(ctx)).filter((x: Any) => all || payIds?.includes(x.employeeId));
      out.payrollPage = ser({ emps: emps.map((e: Any) => e.id), profs, runs, stranded });
    }
    // AI tools as this viewer
    const mem = await P.membership.findFirst({ where: { tenantId: TA, userId: w.id }, select: { role: true, unitAccess: true, permissions: true } });
    const actor = M.actor.aiMemberActor(TA, w.id, mem);
    for (const [name, args] of [["hr_labor_percent", { day: D0, unitId: U1 }], ["hr_labor_percent", { periodKey: PREV }], ["hr_late_report", { period: MONTH }], ["hr_who_is_on_today", { day: D0 }]] as [string, Any][]) {
      out[`ai:${name}:${canon(args)}`] = ser(await call(M.tools, "runTool", { tenantId: TA, actor }, name, args));
    }
    return out;
  }
  const VIEWERS = ["payU1", "payU1m", "mgrU1", "mgrAll", "approver", "emp", "owner"];
  const before: Record<string, Record<string, string>> = {};
  for (const wk of VIEWERS) before[wk] = await snap(wk);
  // ─── double hidden pay: e6 (borrowed into U1) and e4 (U2) ───
  for (const e of ["e6", "e4"]) {
    base[e] = base[e]! * 2;
    await P.hrSalaryProfile.updateMany({ where: { employeeId: E[e] }, data: { baseSalarySatang: base[e] } });
    const o = await P.hrOtRequest.findFirst({ where: { id: OT[e] } });
    await P.hrOtRequest.update({ where: { id: OT[e] }, data: { amountSatang: o.amountSatang * 2, segmentsJson: [{ cls: "OT_WORKDAY", minutes: 120, multiplierBp: 15_000, amountSatang: o.amountSatang * 2 }] } });
    await P.hrPayAdjustment.updateMany({ where: { employeeId: E[e], kind: "OT" }, data: { rateSatang: Math.round(base[e]! / 240), amountSatang: 50_000 } });
  }
  base.e6 = base.e6!; // (items use base × factor 1 after base doubled)
  await setItems({});
  const after: Record<string, Record<string, string>> = {};
  for (const wk of VIEWERS) after[wk] = await snap(wk);
  const diff: Record<string, string[]> = {};
  for (const wk of VIEWERS) diff[wk] = Object.keys(before[wk]!).filter((n) => before[wk]![n] !== after[wk]![n]);
  OUT.diff = diff;
  // details of every changed surface for limited viewers (first 600 chars of before/after)
  OUT.changed = {};
  for (const wk of VIEWERS.filter((x) => x !== "owner")) for (const n of diff[wk]!) OUT.changed[`${wk}|${n}`] = { b: before[wk]![n]!.slice(0, 900), a: after[wk]![n]!.slice(0, 900) };
  OUT.sample = { payU1_otList: after.payU1!.otList!.slice(0, 1500), payU1_stock: after.payU1!.stockList!.slice(0, 1200), payU1_stockCap: after.payU1!.stockCap, payU1_preview: after.payU1!.preview!.slice(0, 800), mgrAll_preview: after.mgrAll!.preview, mgrU1_preview: after.mgrU1!.preview!.slice(0, 500), payU1_page: after.payU1!.payrollPage?.slice(0, 1500), payU1_laborDay: after.payU1!.laborDay!.slice(0, 600), payU1_ot_csv: after.payU1![`csv:ot:${PREV}`]?.slice(0, 900), payU1_inbox: after.payU1!.inboxList!.slice(0, 1500), approver_otList: after.approver!.otList!.slice(0, 800) };

  // ─── own slip (emp = e1) ───
  const a = { tenantId: TA, userId: W.emp.id, role: "STAFF", unitAccess: [], permissions: {} };
  const own = await call(M.priv, "loadPayslipForViewer", ctx, vOf(W.emp), run.id, E.e1);
  const item = await P.hrPayrollItem.findFirst({ where: { runId: run.id, employeeId: E.e1 } });
  OUT.ownSlip = { runKeys: own?.run ? Object.keys(own.run).sort() : own, itemOk: own?.item?.grossSatang === item.grossSatang && own?.item?.netSatang === item.netSatang, mySlip: ser(await call(M.slip, "mySlip", a, { runId: run.id })).slice(0, 400), mySlips: ser(await call(M.slip, "mySlips", a)).slice(0, 300), pdf: await call(M.slip, "downloadMyPayslipPdf", a, { runId: run.id }).then((r: Any) => (r?.ok ? `ok ${r.bytes?.length}` : ser(r).slice(0, 200))) };
  OUT.payU1slipLoaderOwnBranch = await call(M.priv, "loadPayslipForViewer", ctx, vOf(W.payU1), run.id, E.e2).then((r: Any) => (r ? { runKeys: Object.keys(r.run).sort(), gross: r.item?.grossSatang } : r));
  OUT.ownerSlipLoader = await call(M.priv, "loadPayslipForViewer", ctx, vOf(W.owner), run.id, E.e2).then((r: Any) => (r ? { hasTotals: "totalGrossSatang" in r.run } : r));

  // ─── names: dirty rows + new writes + exports ───
  const DIRTY: Record<string, string> = { e2: `=HYPERLINK("http://x.invalid","y")`, e3: `+cmd|' /C calc'!A0`, e1: `ab‮dc⁦ef\u0007`, e5: `@SUM(A1)`, e4: `-2+3 zero​width﻿` };
  for (const [e, n] of Object.entries(DIRTY)) await P.hrEmployee.update({ where: { id: E[e] }, data: { name: n } });
  OUT.nameWrites = {};
  for (const [lbl, n] of Object.entries({ bidi: "QC ‮x", zw: "QC ​x", ctrl: "QC \u0007x", formula: "=1+1", plus: "+1", at: "@x" })) {
    OUT.nameWrites[lbl] = ser(await call(M.svc, "updateEmployee", ctx, E.e3, { name: n })).slice(0, 160);
  }
  await P.hrEmployee.update({ where: { id: E.e3 }, data: { name: DIRTY.e3, position: `@SUM(A1)` } });
  OUT.exports = {};
  for (const r of ["payroll-month", "time", "ot", "wages", "register"]) {
    const kind = M.RR.REPORT_CATALOG[r].period;
    const period = kind === "day" ? D0 : r === "time" ? MONTH : PREV;
    const x = await call(M.rep, "exportReport", ctx, vOf(W.owner), { report: r, period, format: "CSV" });
    if (x?.ok) {
      const t = Buffer.from(x.bytes).toString("utf8");
      const cells = t.split(/\r?\n/).flatMap((l) => l.split(","));
      OUT.exports[r] = { ok: true, danger: cells.filter((c) => /^"?[=+\-@\t]/.test(c) && !/^"?-?\d+(\.\d+)?"?$/.test(c)), bidiOrZw: /[‪-‮⁦-⁩​﻿\u0007]/.test(t), names: cells.filter((c) => /HYPERLINK|cmd|SUM|ab|zero/.test(c)) };
    } else OUT.exports[r] = { ok: false, r: ser(x).slice(0, 300) };
  }
  OUT.pdfDirtyName = await call(M.slip, "downloadPayslipPdf", ctx, vOf(W.owner), { runId: run.id, employeeId: E.e1 }).then((r: Any) => (r?.ok ? `ok ${r.bytes?.length} ${r.fileName}` : ser(r).slice(0, 200)));
} catch (e) {
  Object.assign(console, REAL);
  console.log(`🔴 ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 3).join(" | ")}`);
} finally {
  writeFileSync("scratchpad/h52p/out-p3.json", JSON.stringify(OUT, null, 1));
  console.log(JSON.stringify({ diff: OUT.diff, ownSlip: OUT.ownSlip, nameWrites: OUT.nameWrites, exports: OUT.exports }, null, 1).slice(0, 6000));
  await sweepTenants(P, fx.tenants).catch(() => undefined);
  await cleanupFx(P, fx, SLUG);
  const r1 = await sweepResidue(P, fx.tenants);
  await residueOf(P, fx, SLUG, SLUG_PREFIX);
  console.log(`RESIDUE sweep=${r1.join(",") || "none"} tenants(${SLUG_PREFIX}*)=${await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } })} OUTBOUND=${NET.attempts.length} ${NET.attempts.join(",")}`);
}
