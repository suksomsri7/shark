// HR H3.9 ▸ รายงาน HR + ทะเบียนลูกจ้าง + ไฟล์ส่งออก CSV/XLSX — service (server เท่านั้น) · brief hr-brief-H3.9 R3–R10b · matrix wo-notes/hr-H3.9-design.md §1
//   🔒 จุดตัดสินเดียว reportAccessOf(viewer) → { reports, money, fullId } — ใช้กติกาเดิมทั้งหมด (canReadRoster · ด่านยอดวันลาของทีม · canViewPayroll)
//   แถว = ขอบเขตสาขาของผู้ดู (hrScopeOf + unitWhere: สาขาประจำหรือยืมตัวที่เปิดวันนี้ · ไม่ระบุสาขาเห็นเฉพาะผู้ดูทุกสาขา) ·
//   ยอดรวม = ผลรวมของแถวที่ผู้ดูได้รับเท่านั้น (ไม่เคยใช้ยอดรวมของรอบ) · คอลัมน์เงิน ($) เฉพาะผู้ดูเงินเดือน — ไม่มีในข้อมูลที่ส่งออกเลย
//   เลขประจำตัวประชาชน = •••4 ตัวท้ายทุกที่ · เลขเต็มเฉพาะไฟล์ทะเบียนของเจ้าของ/ผู้ดูเงินเดือนทุกสาขา ขณะเปิดตั้งค่า hrReports.registerFullId
//   อ่านค่าที่เก็บไว้เท่านั้น (ผลตัดสินรายวัน · คำขอ OT · รายการเงินเดือนของรอบ APPROVED/PAID — รุ่น 2 เฉพาะที่ปิดงานแล้ว) — ไม่คิดเงิน/ภาษี/ประกันสังคมใหม่
//   ไม่เก็บไฟล์ (สร้างตามคำขอ) · ส่งออกสำเร็จลงประวัติ hr.report.export (คีย์คอลัมน์ ไม่มีค่า) · ดูหน้า/ปฏิเสธไม่ลงประวัติ ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { canViewPayroll, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { employeeUnitsOf, hrScopeOf, isAllBranches, unitNamesOf, unitTargetOf, unitWhere, type HrScope } from "./scope";
import { canReadRoster } from "./roster-board";
import { canManageHrSettings } from "./settings";
import { teamLeaveBalances, type LeaveViewer } from "./leave";
import {
  REGISTER_STATUTORY,
  REPORT_CATALOG,
  REPORT_IDS,
  REPORT_LABELS,
  REPORT_LIMITS,
  absentMinOf,
  addressOf,
  ageOn,
  bahtText,
  columnsFor,
  exportProblem,
  isReportId,
  leaveTenthsOf,
  maskCitizenId,
  periodOk,
  reportBytes,
  reportTable,
  reportTextFor,
  tenthsText,
  wagePartsOf,
  whtIncomeOf,
  type ReportId,
} from "./reports-rules";
import { XLSX_CONTENT_TYPE } from "./bank-files/xlsx";

type Ctx = { tenantId: string; systemId: string };
export type ReportViewer = { role: string; unitAccess: unknown; permissions: unknown; userId?: string | null };
export type ReportAccess = { reports: ReportId[]; money: boolean; fullId: boolean };
type Opts = { locale?: string | null };
export type ReportNo = { ok: false; code: "NO"; reason: string };
export type ReportFail = { ok: false; code: string; reason: string };
export type ReportDto = {
  ok: true;
  report: ReportId;
  period: string;
  unitId: string | null;
  columns: { key: string; label: string }[];
  rows: { employeeId: string; values: Record<string, string> }[];
  totals: Record<string, string> | null;
  warnings: { field: string; count: number }[];
  notes: string[];
};
export type ReportExport = { ok: true; bytes: Uint8Array; fileName: string; contentType: string; rowCount: number; columns: string[] };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TX_OPTS = { maxWait: 15_000, timeout: 20_000 } as const;
const textOf = (o?: Opts) => reportTextFor(o?.locale);
const NO = (o?: Opts): ReportNo => ({ ok: false, code: "NO", reason: textOf(o).no });
const fail = (code: string, reason: string): ReportFail => ({ ok: false, code, reason });
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const dayOf = (d: Date | null | undefined) => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "");
/** วันตามปฏิทินไทย (UTC+7) ของเวลา */
const bkkDayOf = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const membershipOf = (v: ReportViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: obj(v.permissions) }) as MembershipCtx;
const ROLES = new Set(["OWNER", "MANAGER", "STAFF"]);
const validViewer = (v: ReportViewer | null | undefined): v is ReportViewer => !!v && typeof v.role === "string" && ROLES.has(v.role);

// ═════════════ ด่าน (จุดเดียว) ═════════════
/** ด่านยอดวันลาของทีม (leave.ts#teamLeaveBalances — เจ้าของ · ผู้จัดการ · hr.leave.read · hr.leave.decide) */
function leaveGateOf(m: MembershipCtx): boolean {
  return m.role === "OWNER" || m.role === "MANAGER" || evaluate(m, { module: "hr", action: "hr.leave.read" }) || evaluate(m, { module: "hr", action: "hr.leave.decide" });
}
/** รายงานที่ผู้ดูเปิดได้ + เห็นคอลัมน์เงินไหม + มีสิทธิ์รับเลขประจำตัวเต็มในไฟล์ทะเบียน (เมื่อเจ้าของเปิดตั้งค่า) — design §1.1 */
export function reportAccessOf(v: ReportViewer | null | undefined): ReportAccess {
  if (!validViewer(v)) return { reports: [], money: false, fullId: false };
  const m = membershipOf(v);
  const pay = canViewPayroll(m);
  const roster = canReadRoster({ role: m.role, unitAccess: m.unitAccess, permissions: m.permissions });
  const leave = leaveGateOf(m) || pay; // มติ Q1: ผู้ดูเงินเดือนเห็นรายงานวันลา (ตามสาขาของตัวเอง)
  const reports = REPORT_IDS.filter((r) => (r === "time" || r === "ot" ? roster || pay : r === "leave" ? leave : pay));
  return { reports, money: pay, fullId: m.role === "OWNER" || (pay && isAllBranches(hrScopeOf(m))) };
}

/** ระบบต้องเป็นระบบ HR ของร้านใน ctx — null = ไม่ผ่าน */
async function hrSystemOf(ctx: Ctx): Promise<{ settings: Record<string, unknown> } | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ID_RE.test(ctx.tenantId) || !ID_RE.test(ctx.systemId)) return null;
  const s = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { settings: true } });
  return s ? { settings: obj(s.settings) } : null;
}
/**
 * ด่านบริบท: ระบบ HR ของร้าน + สมาชิกภาพจริงของผู้ดูในร้านนั้น (ยอมรับแล้ว · บทบาทตรงกับที่ส่งมา) — สิทธิ์/สาขาใช้ค่าจากฐาน ·
 * null = ไม่ผ่าน (ร้านอื่น · ระบบอื่น · ไม่ใช่สมาชิก — ข้อความ NO เดียวกันทุกกรณี)
 */
type Gate = { settings: Record<string, unknown>; v: ReportViewer };
async function gateOf(ctx: Ctx, viewer: ReportViewer | null | undefined): Promise<Gate | null> {
  if (!validViewer(viewer) || typeof viewer.userId !== "string" || !ID_RE.test(viewer.userId)) return null;
  if (!ctx || typeof ctx.tenantId !== "string" || !ID_RE.test(ctx.tenantId)) return null;
  const [sys, m] = await Promise.all([
    hrSystemOf(ctx),
    tenantDb({ tenantId: ctx.tenantId }).membership.findFirst({ where: { tenantId: ctx.tenantId, userId: viewer.userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } }),
  ]);
  if (!sys || !m || String(m.role) !== viewer.role) return null;
  return { settings: sys.settings, v: { role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions, userId: viewer.userId } };
}
const fullIdSettingOf = (settings: Record<string, unknown>) => obj(settings.hrReports).registerFullId === true;

// ═════════════ อินพุต ═════════════
type Input = { report: ReportId; period: string; unitId: string | null };
function parseInput(raw: unknown): Input | null {
  const i = obj(raw);
  if (!isReportId(i.report) || !periodOk(i.report, i.period)) return null;
  const u = i.unitId;
  if (u !== undefined && u !== null && u !== "" && (typeof u !== "string" || !ID_RE.test(u))) return null;
  return { report: i.report, period: i.period as string, unitId: typeof u === "string" && u ? u : null };
}
const formatOf = (f: unknown): "CSV" | "XLSX" | null => (typeof f === "string" && (f.toUpperCase() === "CSV" || f.toUpperCase() === "XLSX") ? (f.toUpperCase() as "CSV" | "XLSX") : null);

// ═════════════ พนักงานในขอบเขต (1 คิวรี) ═════════════
type Emp = {
  id: string;
  code: string | null;
  name: string;
  unitId: string | null;
  active: boolean;
  gender?: string | null;
  birthDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  position?: string | null;
  department?: string | null;
  employmentStatus?: string | null;
  addressLine?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postcode?: string | null;
  citizen?: string | null;
};
/** รหัส (ว่างไว้ท้าย) → ชื่อ → id (เทียบหน่วยรหัสของ JS) */
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const empOrder = (a: Emp, b: Emp) => {
  const ca = a.code ?? "";
  const cb = b.code ?? "";
  if (!ca !== !cb) return ca ? -1 : 1;
  return cmpStr(ca, cb) || cmpStr(a.name, b.name) || cmpStr(a.id, b.id);
};

async function employeesOf(ctx: Ctx, scope: HrScope, unitId: string | null, report: ReportId): Promise<Emp[] | "LIMIT"> {
  if (unitId && scope.unitIds !== "*" && !scope.unitIds.includes(unitId)) return [];
  const reg = report === "register";
  const idCol = reg || report === "tax-month" || report === "tax-year";
  const where: Prisma.HrEmployeeWhereInput = { AND: [unitWhere(scope), ...(unitId ? [{ unitId }] : [])] };
  const rows = await tenantDb(ctx).hrEmployee.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      unitId: true,
      active: true,
      ...(reg
        ? {
            gender: true,
            birthDate: true,
            startDate: true,
            endDate: true,
            position: true,
            department: true,
            employmentStatus: true,
            addressLine: true,
            subdistrict: true,
            district: true,
            province: true,
            postcode: true,
          }
        : {}),
      ...(idCol ? { nationalId: true } : {}),
    },
    orderBy: { id: "asc" },
    take: REPORT_LIMITS.employees + 1,
  });
  if (rows.length > REPORT_LIMITS.employees) return "LIMIT";
  return rows.map((r) => {
    const { nationalId, ...rest } = r as typeof r & { nationalId?: string | null };
    return { ...(rest as Omit<Emp, "citizen">), citizen: idCol ? (nationalId ?? null) : null };
  });
}

// ═════════════ แถวตามชนิดรายงาน ═════════════
type Row = { emp: Emp; values: Record<string, string> };
const monthBounds = (p: string) => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { first: `${p}-01`, last: `${p}-${String(last).padStart(2, "0")}`, next };
};
const d0 = (day: string) => new Date(`${day}T00:00:00.000Z`);
const bkk0 = (day: string) => new Date(`${day}T00:00:00+07:00`);

type TimeAgg = { slots: number; worked: Set<string>; lateN: number; lateMin: number; earlyN: number; earlyMin: number; absent: Set<string>; absentMin: number; leaveT: number; workedMin: number; otMin: number; missingOut: number };
const WORKED = new Set(["ON_TIME", "LATE", "EARLY_OUT"]);
/** ผลตัดสินรายวันของเดือน (อ่านครั้งเดียว ขอบเขตพนักงานที่ส่งมา) → สรุปต่อคน — กติกา design §2 time */
async function timeAggOf(ctx: Ctx, period: string, ids: string[]): Promise<Map<string, TimeAgg>> {
  const out = new Map<string, TimeAgg>();
  if (!ids.length) return out;
  const b = monthBounds(period);
  const days = await tenantDb(ctx).hrAttendanceDay.findMany({
    where: { employeeId: { in: ids }, date: { gte: d0(b.first), lte: d0(b.last) } },
    select: { employeeId: true, date: true, status: true, startMin: true, endMin: true, crossesMidnight: true, lateMin: true, earlyOutMin: true, workedMin: true, otMin: true, missingOut: true, leaveFraction: true },
    take: (REPORT_LIMITS.employees + 1) * 31 * 4,
  });
  for (const d of days) {
    let a = out.get(d.employeeId);
    if (!a) out.set(d.employeeId, (a = { slots: 0, worked: new Set(), lateN: 0, lateMin: 0, earlyN: 0, earlyMin: 0, absent: new Set(), absentMin: 0, leaveT: 0, workedMin: 0, otMin: 0, missingOut: 0 }));
    const day = dayOf(d.date);
    const st = String(d.status);
    if (st !== "DAY_OFF" && st !== "NO_SCHEDULE") a.slots++;
    if (WORKED.has(st)) a.worked.add(day);
    if (d.lateMin > 0) (a.lateN++, (a.lateMin += d.lateMin));
    if (d.earlyOutMin > 0) (a.earlyN++, (a.earlyMin += d.earlyOutMin));
    if (st === "ABSENT") {
      a.absent.add(day);
      a.absentMin += absentMinOf({ startMin: d.startMin, endMin: d.endMin, crossesMidnight: d.crossesMidnight, leaveFraction: d.leaveFraction === null ? null : String(d.leaveFraction) });
    }
    a.leaveT += leaveTenthsOf(d.leaveFraction === null ? null : String(d.leaveFraction));
    a.workedMin += d.workedMin;
    a.otMin += d.otMin;
    if (d.missingOut) a.missingOut++;
  }
  return out;
}

async function timeRows(ctx: Ctx, period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const ids = [...emps.keys()];
  const agg = await timeAggOf(ctx, period, ids);
  if (!agg.size) return [];
  const b = monthBounds(period);
  const corr = await tenantDb(ctx).hrTimeCorrection.findMany({
    where: { employeeId: { in: [...agg.keys()] }, status: "APPROVED", day: { gte: d0(b.first), lte: d0(b.last) } },
    select: { employeeId: true },
    take: 100_000,
  });
  const nCorr = new Map<string, number>();
  for (const c of corr) nCorr.set(c.employeeId, (nCorr.get(c.employeeId) ?? 0) + 1);
  return [...agg.entries()].map(([id, a]) => ({
    emp: emps.get(id)!,
    values: {
      slots: String(a.slots),
      workedDays: String(a.worked.size),
      lateCount: String(a.lateN),
      lateMin: String(a.lateMin),
      earlyOutCount: String(a.earlyN),
      earlyOutMin: String(a.earlyMin),
      absentDays: String(a.absent.size),
      absentMin: String(a.absentMin),
      leaveDays: tenthsText(a.leaveT),
      workedMin: String(a.workedMin),
      measuredOtMin: String(a.otMin),
      missingOut: String(a.missingOut),
      corrections: String(nCorr.get(id) ?? 0),
    },
  }));
}

async function leaveRows(ctx: Ctx, v: ReportViewer, period: string, unitId: string | null, emps: Map<string, Emp>): Promise<Row[]> {
  const m = membershipOf(v);
  // มติ Q1: ผู้ดูเงินเดือนที่ไม่ผ่านด่านยอดวันลาเอง ⇒ เรียกโค้ดยอดเดียวกันด้วยสิทธิ์อ่านใบลาในขอบเขตสาขาเดิมของผู้ดู (ไม่เพิ่มสาขา · ไม่มีเหตุผล/ไฟล์แนบ)
  const lv: LeaveViewer = leaveGateOf(m) ? { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions, userId: v.userId ?? null } : { role: "STAFF", unitAccess: m.unitAccess, permissions: { "hr.leave.read": true }, userId: v.userId ?? null };
  const tb = await teamLeaveBalances(ctx, lv, { year: Number(period), unitId });
  if (!tb) return [];
  const out: Row[] = [];
  for (const r of tb.rows) {
    const emp = emps.get(r.employeeId);
    if (!emp) continue;
    for (const it of r.items)
      out.push({
        emp,
        values: {
          policy: it.name,
          category: String(it.category),
          unlimited: it.unlimited ? "Y" : "",
          granted: it.granted,
          carried: it.carried,
          used: it.used,
          adjusted: it.adjusted,
          expired: it.expired,
          balance: it.balance,
          pending: it.pending,
        },
      });
  }
  return out;
}

async function otRows(ctx: Ctx, period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const ids = [...emps.keys()];
  if (!ids.length) return [];
  const b = monthBounds(period);
  const reqs = await tenantDb(ctx).hrOtRequest.findMany({
    // HR H3.9 ▸ มติ A: คำขอที่อนุมัติแล้วถูกยกเลิกภายหลัง (revokedAt) ไม่นับในอนุมัติ/นาทีอนุมัติเลย · ส่วน HOLIDAY_WORK ที่ H3.4 คงจ่ายไว้ = คอลัมน์ของตัวเอง ◂
    where: { employeeId: { in: ids }, date: { gte: d0(b.first), lte: d0(b.last) }, OR: [{ status: { in: ["PENDING", "APPROVED", "REJECTED"] } }, { status: "CANCELLED", revokedAt: { not: null } }] },
    select: { employeeId: true, status: true, minutes: true, amountSatang: true, segmentsJson: true, settledAt: true, revokedAt: true, settleCode: true },
    take: 200_000,
  });
  type A = { p: number; a: number; r: number; min: number; wMin: number; hMin: number; ohMin: number; w: number; h: number; oh: number; amt: number; kMin: number; k: number };
  const agg = new Map<string, A>();
  for (const q of reqs) {
    let x = agg.get(q.employeeId);
    if (!x) agg.set(q.employeeId, (x = { p: 0, a: 0, r: 0, min: 0, wMin: 0, hMin: 0, ohMin: 0, w: 0, h: 0, oh: 0, amt: 0, kMin: 0, k: 0 }));
    const segs = Array.isArray(q.segmentsJson) ? (q.segmentsJson as unknown[]).map(obj) : [];
    if (q.revokedAt) {
      // ยกเลิกหลังอนุมัติ: นับเฉพาะส่วนทำงานวันหยุดที่ยังคงจ่าย (จ่ายแล้ว · ไม่มีรหัสค้าง) — ไม่ใช่ OT ที่อนุมัติ
      if (q.settledAt && q.settleCode === null)
        for (const s of segs)
          if (s.cls === "HOLIDAY_WORK") {
            x.kMin += Number.isSafeInteger(s.minutes) ? (s.minutes as number) : 0;
            x.k += Number.isSafeInteger(s.amountSatang) ? (s.amountSatang as number) : 0;
          }
      continue;
    }
    if (q.status === "PENDING") x.p++;
    else if (q.status === "REJECTED") x.r++;
    else {
      x.a++;
      x.min += q.minutes;
      if (q.settledAt && q.settleCode === null) {
        if (Number.isSafeInteger(q.amountSatang)) x.amt += q.amountSatang!;
        for (const s of segs) {
          const mn = Number.isSafeInteger(s.minutes) ? (s.minutes as number) : 0;
          const am = Number.isSafeInteger(s.amountSatang) ? (s.amountSatang as number) : 0;
          if (s.cls === "OT_WORKDAY") (x.wMin += mn), (x.w += am);
          else if (s.cls === "HOLIDAY_WORK") (x.hMin += mn), (x.h += am);
          else if (s.cls === "OT_HOLIDAY") (x.ohMin += mn), (x.oh += am);
        }
      }
    }
  }
  return [...agg.entries()].filter(([, x]) => x.p + x.a + x.r > 0 || x.kMin > 0 || x.k !== 0).map(([id, x]) => ({
    emp: emps.get(id)!,
    values: {
      pending: String(x.p),
      approved: String(x.a),
      rejected: String(x.r),
      approvedMin: String(x.min),
      otWorkdayMin: String(x.wMin),
      holidayWorkMin: String(x.hMin),
      otHolidayMin: String(x.ohMin),
      keptHolidayWorkMin: String(x.kMin),
      otWorkdayAmt: bahtText(x.w),
      holidayWorkAmt: bahtText(x.h),
      otHolidayAmt: bahtText(x.oh),
      keptHolidayWorkAmt: bahtText(x.k),
      amount: bahtText(x.amt),
    },
  }));
}

type Item = {
  employeeId: string;
  grossSatang: number;
  addSatang: number;
  deductSatang: number;
  ssoBaseSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  snapshotJson: unknown;
  run: { periodKey: string; payDate: Date; status: string; engineVersion: number; journalEntryId: string | null; stepsJson: unknown };
};
/** รายการเงินเดือนของรอบ APPROVED/PAID (รุ่น 2 เฉพาะรอบที่ปิดงานแล้ว: มี journalEntryId หรือ stepsJson.finalized — มติ Q5) · อ่านครั้งเดียว */
async function itemsOf(ctx: Ctx, ids: string[], run: Prisma.HrPayrollRunWhereInput): Promise<Item[]> {
  if (!ids.length) return [];
  const rows = await tenantDb(ctx).hrPayrollItem.findMany({
    where: { employeeId: { in: ids }, run: { ...run, status: { in: ["APPROVED", "PAID"] } } },
    select: {
      employeeId: true,
      grossSatang: true,
      addSatang: true,
      deductSatang: true,
      ssoBaseSatang: true,
      ssoEmployeeSatang: true,
      ssoEmployerSatang: true,
      whtSatang: true,
      netSatang: true,
      snapshotJson: true,
      run: { select: { periodKey: true, payDate: true, status: true, engineVersion: true, journalEntryId: true, stepsJson: true } },
    },
    orderBy: [{ run: { payDate: "asc" } }, { id: "asc" }],
    take: (REPORT_LIMITS.employees + 1) * 14,
  });
  return (rows as unknown as Item[]).filter((i) => i.run.engineVersion < 2 || !!i.run.journalEntryId || obj(i.run.stepsJson).finalized === true);
}
const moneyCells = (i: Pick<Item, "grossSatang" | "addSatang" | "deductSatang" | "ssoEmployeeSatang" | "ssoEmployerSatang" | "whtSatang" | "netSatang">) => ({
  gross: bahtText(i.grossSatang),
  add: bahtText(i.addSatang),
  deduct: bahtText(i.deductSatang),
  ssoEmployee: bahtText(i.ssoEmployeeSatang),
  ssoEmployer: bahtText(i.ssoEmployerSatang),
  wht: bahtText(i.whtSatang),
  net: bahtText(i.netSatang),
});

async function payrollMonthRows(ctx: Ctx, period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const items = await itemsOf(ctx, [...emps.keys()], { periodKey: period });
  return items.map((i) => ({ emp: emps.get(i.employeeId)!, values: { status: String(i.run.status), engine: String(i.run.engineVersion), ...moneyCells(i) } }));
}

type Sum = { n: number; months: Set<string>; gross: number; add: number; deduct: number; ssoE: number; ssoR: number; ssoBase: number; wht: number; net: number; income: number };
const sumBy = (items: Item[]) => {
  const out = new Map<string, Sum>();
  for (const i of items) {
    let s = out.get(i.employeeId);
    if (!s) out.set(i.employeeId, (s = { n: 0, months: new Set(), gross: 0, add: 0, deduct: 0, ssoE: 0, ssoR: 0, ssoBase: 0, wht: 0, net: 0, income: 0 }));
    s.n++;
    s.months.add(bkkDayOf(i.run.payDate).slice(0, 7));
    s.gross += i.grossSatang;
    s.add += i.addSatang;
    s.deduct += i.deductSatang;
    s.ssoE += i.ssoEmployeeSatang;
    s.ssoR += i.ssoEmployerSatang;
    s.ssoBase += i.ssoBaseSatang;
    s.wht += i.whtSatang;
    s.net += i.netSatang;
    s.income += whtIncomeOf({ engineVersion: i.run.engineVersion, addSatang: i.addSatang, snapshot: i.snapshotJson });
  }
  return out;
};

async function payrollYearRows(ctx: Ctx, period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const sums = sumBy(await itemsOf(ctx, [...emps.keys()], { periodKey: { startsWith: `${period}-` } }));
  return [...sums.entries()].map(([id, s]) => ({
    emp: emps.get(id)!,
    values: { runs: String(s.n), ...moneyCells({ grossSatang: s.gross, addSatang: s.add, deductSatang: s.deduct, ssoEmployeeSatang: s.ssoE, ssoEmployerSatang: s.ssoR, whtSatang: s.wht, netSatang: s.net }) },
  }));
}

/** ภาษี/ประกันสังคม: เดือน/ปีตามวันจ่าย (เวลาไทย — แบบเดียวกับยอดสะสมของ H3.4) · เงินได้ 40(1) = whtIncomeOf */
async function taxRows(ctx: Ctx, report: "tax-month" | "tax-year", period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const from = report === "tax-month" ? bkk0(`${period}-01`) : bkk0(`${period}-01-01`);
  const to = report === "tax-month" ? bkk0(`${monthBounds(period).next}-01`) : bkk0(`${Number(period) + 1}-01-01`);
  const sums = sumBy(await itemsOf(ctx, [...emps.keys()], { payDate: { gte: from, lt: to } }));
  return [...sums.entries()].map(([id, s]) => {
    const emp = emps.get(id)!;
    const common = { citizenId: maskCitizenId(emp.citizen), income: bahtText(s.income), wht: bahtText(s.wht), ssoEmployee: bahtText(s.ssoE), ssoEmployer: bahtText(s.ssoR) };
    return { emp, values: report === "tax-month" ? { ...common, ssoBase: bahtText(s.ssoBase) } : { ...common, months: String(s.months.size) } };
  });
}

/** เอกสารการจ่ายค่าจ้าง ม.114: รายการของงวด + วัน/นาทีทำงานของเดือนเดียวกัน (กติกาเดียวกับรายงานเวลา) */
async function wagesRows(ctx: Ctx, period: string, emps: Map<string, Emp>): Promise<Row[]> {
  const items = await itemsOf(ctx, [...emps.keys()], { periodKey: period });
  if (!items.length) return [];
  const agg = await timeAggOf(ctx, period, [...new Set(items.map((i) => i.employeeId))]);
  return items.map((i) => {
    const w = wagePartsOf({ engineVersion: i.run.engineVersion, snapshot: i.snapshotJson });
    const a = agg.get(i.employeeId);
    return {
      emp: emps.get(i.employeeId)!,
      values: {
        payType: REPORT_LABELS.payType[w.payType] ?? "",
        rate: w.rateSatang === null ? "" : bahtText(w.rateSatang),
        workedDays: String(a?.worked.size ?? 0),
        workedMin: String(a?.workedMin ?? 0),
        wage: bahtText(w.wageSatang),
        ot: bahtText(w.otSatang),
        holidayWork: bahtText(w.holidayWorkSatang),
        add: bahtText(i.addSatang),
        deduct: bahtText(i.deductSatang),
        gross: bahtText(i.grossSatang),
        net: bahtText(i.netSatang),
        payDate: bkkDayOf(i.run.payDate),
      },
    };
  });
}

/** ทะเบียนลูกจ้าง ม.113 ณ วันที่: ทุกคนในขอบเขต รวมคนที่สิ้นสุดการจ้างแล้ว (ม.115 · Q11) · อัตราค่าจ้างปัจจุบันจากโปรไฟล์เงินเดือน (D-2) */
async function registerRows(ctx: Ctx, asOf: string, emps: Map<string, Emp>, fullId: boolean): Promise<Row[]> {
  const ids = [...emps.keys()];
  if (!ids.length) return [];
  const db = tenantDb(ctx);
  const [profiles, regs] = await Promise.all([
    db.hrSalaryProfile.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, payType: true, baseSalarySatang: true, dailyRateSatang: true, hourlyRateSatang: true }, take: REPORT_LIMITS.employees + 1 }),
    db.hrEmployeeRegister.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, nationality: true, otherBenefits: true }, take: REPORT_LIMITS.employees + 1 }),
  ]);
  const prof = new Map(profiles.map((p) => [p.employeeId, p]));
  const reg = new Map(regs.map((r) => [r.employeeId, r]));
  return [...emps.values()].map((e) => {
    const p = prof.get(e.id);
    const r = reg.get(e.id);
    const pt = p ? String(p.payType) : "";
    const rate = !p ? null : pt === "DAILY" ? p.dailyRateSatang : pt === "HOURLY" ? p.hourlyRateSatang : p.baseSalarySatang;
    const birth = dayOf(e.birthDate);
    const age = birth ? ageOn(birth, asOf) : null;
    return {
      emp: e,
      values: {
        gender: e.gender ? (REPORT_LABELS.gender[e.gender] ?? "") : "",
        nationality: r?.nationality ?? "",
        birthDate: birth,
        age: age === null ? "" : String(age),
        address: addressOf([e.addressLine, e.subdistrict, e.district, e.province, e.postcode]),
        startDate: dayOf(e.startDate),
        position: [e.position, e.department].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).join(" / "),
        payType: pt ? (REPORT_LABELS.payType[pt] ?? "") : "",
        rate: rate === null || rate === undefined || !Number.isSafeInteger(rate) ? "" : bahtText(rate),
        otherBenefits: r?.otherBenefits ?? "",
        endDate: dayOf(e.endDate),
        status: e.employmentStatus ? (REPORT_LABELS.status[e.employmentStatus] ?? "") : "",
        citizenId: fullId ? (typeof e.citizen === "string" ? e.citizen.trim() : "") : maskCitizenId(e.citizen),
      },
    };
  });
}

// ═════════════ ประกอบรายงาน ═════════════
type Built = { dto: ReportDto; keys: string[]; names: string[]; fullId: boolean };
const isMoneyKey = (report: ReportId, key: string) => REPORT_CATALOG[report].columns.find((c) => c.key === key)?.cls === "$";
const cellNum = (report: ReportId, key: string, s: string): number => {
  if (isMoneyKey(report, key)) {
    const m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
    return m ? (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number(m[3])) : 0;
  }
  if (key === "leaveDays") {
    const m = /^(-?)(\d+)\.(\d)$/.exec(s);
    return m ? (m[1] ? -1 : 1) * (Number(m[2]) * 10 + Number(m[3])) : 0;
  }
  return /^-?\d+$/.test(s) ? Number(s) : 0;
};
const cellOfSum = (report: ReportId, key: string, n: number) => (isMoneyKey(report, key) ? bahtText(n) : key === "leaveDays" ? tenthsText(n) : String(n));

async function build(ctx: Ctx, g: Gate, raw: unknown, o: Opts & { surface: "page" | "export" }): Promise<Built | ReportFail> {
  const T = textOf(o);
  const { v: viewer, settings } = g;
  const input = parseInput(raw);
  if (!input) return fail("INPUT", T.input);
  const acc = reportAccessOf(viewer);
  if (!acc.reports.includes(input.report)) return NO(o);
  const { report, period, unitId } = input;
  const scope = hrScopeOf(membershipOf(viewer));
  const emps = await employeesOf(ctx, scope, unitId, report);
  if (emps === "LIMIT") return fail("LIMIT", T.limit);
  const byId = new Map(emps.map((e) => [e.id, e]));
  const fullId = o.surface === "export" && report === "register" && acc.fullId && fullIdSettingOf(settings);
  let rows: Row[];
  switch (report) {
    case "time":
      rows = await timeRows(ctx, period, byId);
      break;
    case "leave":
      rows = await leaveRows(ctx, viewer, period, unitId, byId);
      break;
    case "ot":
      rows = await otRows(ctx, period, byId);
      break;
    case "payroll-month":
      rows = await payrollMonthRows(ctx, period, byId);
      break;
    case "payroll-year":
      rows = await payrollYearRows(ctx, period, byId);
      break;
    case "tax-month":
    case "tax-year":
      rows = await taxRows(ctx, report, period, byId);
      break;
    case "wages":
      rows = await wagesRows(ctx, period, byId);
      break;
    case "register":
      rows = await registerRows(ctx, period, byId, fullId);
      break;
  }
  rows.sort((a, b) => empOrder(a.emp, b.emp));
  const units = await unitNamesOf(ctx.tenantId, rows.map((r) => r.emp.unitId));
  const def = REPORT_CATALOG[report];
  const keys = columnsFor(report, { money: acc.money, fullId }, o.surface);
  const outRows = rows.map((r) => {
    const all: Record<string, string> = { code: r.emp.code ?? "", name: r.emp.name, unit: r.emp.unitId ? (units.get(r.emp.unitId) ?? "") : "", ...r.values };
    return { employeeId: r.emp.id, values: Object.fromEntries(keys.map((k) => [k, all[k] ?? ""])) };
  });
  const sumKeys = def.columns.filter((c) => c.sum && keys.includes(c.key)).map((c) => c.key);
  const totals = def.totals ? Object.fromEntries(sumKeys.map((k) => [k, cellOfSum(report, k, outRows.reduce((a, r) => a + cellNum(report, k, r.values[k] ?? ""), 0))])) : null;
  const warnings: { field: string; count: number }[] = [];
  const notes: string[] = [];
  if (report === "register") {
    for (const f of REGISTER_STATUTORY) {
      const n = outRows.filter((r) => (r.values[f] ?? "") === "").length;
      if (n > 0) warnings.push({ field: f, count: n });
    }
    // HR H3.9 ▸ มติ B: นับพนักงานทั้งร้านเฉพาะผู้ดูทุกสาขา — ผู้ดูบางสาขาไม่ได้สัญญาณจำนวนคนของทั้งร้าน ◂
    if (isAllBranches(scope)) notes.push((await tenantDb(ctx).hrEmployee.count({ where: { active: true } })) >= 10 ? T.registerDuty : T.registerUnder10);
    notes.push(T.registerRetention);
    if (warnings.length) notes.push(T.registerMissing);
  } else if (report === "time") notes.push(T.timeNote);
  else if (report === "wages") notes.push(T.s114Note);
  else if (report.startsWith("payroll-") || report.startsWith("tax-")) notes.push(T.taxNote);
  const en = !def.thaiOnly && o.locale === "en";
  const byKey = new Map(def.columns.map((c) => [c.key, c] as const));
  return {
    dto: {
      ok: true,
      report,
      period,
      unitId,
      columns: keys.map((k) => ({ key: k, label: en ? byKey.get(k)!.en : byKey.get(k)!.th })),
      rows: outRows,
      totals,
      warnings,
      notes,
    },
    keys,
    names: rows.map((r) => r.emp.name),
    fullId,
  };
}

/** รายงานสำหรับหน้าจอ (ค่าเดียวกับเซลล์ไฟล์ · เลขประจำตัวแบบ •••4 ตัวท้ายเสมอ) — ไม่ลงประวัติ */
export async function loadReport(ctx: Ctx, viewer: ReportViewer, input: { report: unknown; period: unknown; unitId?: unknown }, opts?: Opts): Promise<ReportDto | ReportFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  const b = await build(ctx, g, input, { locale: opts?.locale ?? null, surface: "page" });
  return "dto" in b ? b.dto : b;
}

/** ไฟล์ส่งออก (สร้างตามคำขอ ไม่เก็บ) — ตัวเขียน H3.5 · ตรวจเซลล์ก่อน (ENCODING → FORMULA) · สำเร็จ = ประวัติ hr.report.export 1 แถว */
export async function exportReport(
  ctx: Ctx,
  viewer: ReportViewer,
  input: { report: unknown; period: unknown; unitId?: unknown; format: unknown },
  opts?: Opts,
): Promise<ReportExport | ReportFail> {
  const T = textOf(opts);
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  const format = formatOf(obj(input).format);
  if (!format || !parseInput(input)) return fail("INPUT", T.input);
  const b = await build(ctx, g, input, { locale: opts?.locale ?? null, surface: "export" });
  if (!("dto" in b)) return b;
  const { dto, keys, names, fullId } = b;
  const table = reportTable({ report: dto.report, keys, rows: dto.rows.map((r) => r.values), totals: dto.totals, locale: opts?.locale ?? null });
  const problem = exportProblem(table.slice(1, 1 + dto.rows.length), names);
  if (problem) return fail(problem.code, (problem.code === "FORMULA" ? T.formula : T.encoding).replace("{names}", problem.names.join(", ")));
  const bytes = reportBytes(table, format);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: viewer.userId ?? null,
    action: "hr.report.export",
    targetType: "HrReport",
    targetId: dto.report,
    after: { report: dto.report, period: dto.period, format, rowCount: dto.rows.length, columns: keys, unitId: dto.unitId, fullId },
  });
  return {
    ok: true,
    bytes,
    fileName: `HR_${dto.report}_${dto.period}.${format === "CSV" ? "csv" : "xlsx"}`,
    contentType: format === "CSV" ? "text/csv; charset=utf-8" : XLSX_CONTENT_TYPE,
    rowCount: dto.rows.length,
    columns: keys,
  };
}

// ═════════════ ตั้งค่า: เลขประจำตัวเต็มในไฟล์ทะเบียน (มติ Q2) ═════════════
export async function getReportSettings(ctx: Ctx, viewer: ReportViewer, opts?: Opts): Promise<{ ok: true; registerFullId: boolean; warning: string } | ReportNo> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  const m = membershipOf(g.v);
  if (!(m.role === "OWNER" || canViewPayroll(m))) return NO(opts);
  return { ok: true, registerFullId: fullIdSettingOf(g.settings), warning: textOf(opts).fullIdWarning };
}

/** เจ้าของร้านเท่านั้น · เปิดต้องติ๊กรับทราบคำเตือน · รวมเฉพาะคีย์ hrReports.registerFullId (คีย์อื่นของ settings คงเดิม) · ลงประวัติ hr.report.setting */
export async function setReportSettings(ctx: Ctx, viewer: ReportViewer, input: { registerFullId: unknown; acknowledge?: unknown }, opts?: Opts): Promise<{ ok: true; registerFullId: boolean } | ReportFail> {
  const T = textOf(opts);
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  if (g.v.role !== "OWNER") return fail("OWNER", T.settingOwner);
  const i = obj(input);
  if (typeof i.registerFullId !== "boolean") return fail("INPUT", T.input);
  const on = i.registerFullId;
  if (on && i.acknowledge !== true) return fail("ACK", T.ackFullId);
  const done = await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Prisma.TransactionClient;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:reports:settings:${ctx.systemId}`}, 0))`;
    const s = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { settings: true } });
    if (!s) return false;
    const base = obj(s.settings);
    const next = { ...base, hrReports: { ...obj(base.hrReports), registerFullId: on } };
    const r = await tx.appSystem.updateMany({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, data: { settings: next as Prisma.InputJsonValue } });
    return r.count === 1;
  }, TX_OPTS);
  if (!done) return NO(opts);
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: viewer.userId ?? null, action: "hr.report.setting", targetType: "AppSystem", targetId: ctx.systemId, after: { registerFullId: on } });
  return { ok: true, registerFullId: on };
}

// ═════════════ ทะเบียน: สัญชาติ · ประโยชน์ตอบแทนอย่างอื่น (R10) ═════════════
const LIMITS = { nationality: 60, otherBenefits: 500 } as const;
const BAD_CHAR = /[\u0000-\u001f\u007f‪-‮⁦-⁩￾￿]/;
/** ค่าที่ส่งมา → undefined (ไม่แก้) · null (ล้าง) · ข้อความ · false = ไม่ถูกต้อง */
function fieldOf(v: unknown, max: number): string | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return null;
  if (BAD_CHAR.test(s) || [...s].length > max) return false;
  return s;
}
/** พนักงานอยู่ในระบบนี้และในสาขาของผู้ดู (ระดับพนักงาน = สาขาประจำ แบบเดียวกับการแก้โปรไฟล์) */
async function employeeTargetOk(ctx: Ctx, v: ReportViewer, employeeId: unknown): Promise<string | null> {
  if (typeof employeeId !== "string" || !ID_RE.test(employeeId)) return null;
  const eu = await employeeUnitsOf(ctx, employeeId);
  if (!eu) return null;
  return unitTargetOf(hrScopeOf(membershipOf(v)), eu).ok ? employeeId : null;
}

export async function loadRegisterFields(ctx: Ctx, viewer: ReportViewer, input: { employeeId: unknown }, opts?: Opts): Promise<{ ok: true; nationality: string | null; otherBenefits?: string | null } | ReportNo> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  const m = membershipOf(g.v);
  const pay = canViewPayroll(m);
  if (!(canManageHrSettings(m) || pay)) return NO(opts);
  const id = await employeeTargetOk(ctx, g.v, obj(input).employeeId);
  if (!id) return NO(opts);
  const r = await tenantDb(ctx).hrEmployeeRegister.findFirst({ where: { employeeId: id }, select: { nationality: true, otherBenefits: true } });
  return pay ? { ok: true, nationality: r?.nationality ?? null, otherBenefits: r?.otherBenefits ?? null } : { ok: true, nationality: r?.nationality ?? null };
}

/** สัญชาติ = ผู้ตั้งค่า HR (canManageHrSettings) ในสาขา · ประโยชน์ตอบแทนอย่างอื่น = ต้องดูเงินเดือนได้ด้วย · ลงประวัติ hr.register.update (ชื่อช่องเท่านั้น) */
export async function saveRegisterFields(ctx: Ctx, viewer: ReportViewer, input: { employeeId: unknown; nationality?: unknown; otherBenefits?: unknown }, opts?: Opts): Promise<{ ok: true } | ReportFail> {
  const T = textOf(opts);
  const g = await gateOf(ctx, viewer);
  if (!g) return NO(opts);
  const m = membershipOf(g.v);
  if (!canManageHrSettings(m)) return NO(opts);
  const i = obj(input);
  if (i.otherBenefits !== undefined && !canViewPayroll(m)) return NO(opts);
  const id = await employeeTargetOk(ctx, g.v, i.employeeId);
  if (!id) return NO(opts);
  const nat = fieldOf(i.nationality, LIMITS.nationality);
  const ben = fieldOf(i.otherBenefits, LIMITS.otherBenefits);
  if (nat === false || ben === false) return fail("INPUT", T.registerInput);
  const data: { nationality?: string | null; otherBenefits?: string | null } = {};
  if (nat !== undefined) data.nationality = nat;
  if (ben !== undefined) data.otherBenefits = ben;
  const fields = Object.keys(data);
  if (!fields.length) return { ok: true };
  // 1 แถวต่อพนักงาน (employeeId UNIQUE): แก้แถวเดิม · ไม่มี ⇒ สร้าง · ชนกันตอนสร้างพร้อมกัน (P2002) ⇒ แก้แถวที่อีกฝั่งสร้าง
  const db = tenantDb(ctx);
  const upd = () => db.hrEmployeeRegister.updateMany({ where: { employeeId: id }, data: { ...data, updatedById: viewer.userId ?? null } });
  if ((await upd()).count === 0) {
    try {
      await db.hrEmployeeRegister.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: id, ...data, updatedById: viewer.userId ?? null } });
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002" || (await upd()).count !== 1) throw e;
    }
  }
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: viewer.userId ?? null, action: "hr.register.update", targetType: "HrEmployee", targetId: id, after: { employeeId: id, fields } });
  return { ok: true };
}

// ◂ HR H3.9
