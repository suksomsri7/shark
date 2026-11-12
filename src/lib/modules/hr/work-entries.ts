// HR H3.1 ▸ ชั่วโมงทำงาน (work entries) — snapshot ต่องวด: 1 หัววัน (HrWorkDay) ต่อพนักงานต่อวัน + แถวชนิด (HrWorkEntry) ·
//   ที่มาของทุกรายการเงินเดือนรุ่น 2 (H3.2/H3.4) · ไฟล์นี้เป็นผู้เขียน HrWorkDay/HrWorkEntry ที่เดียว (brief hr-brief-H3.1 R1 · R4–R8)
//
// ลำดับล็อก (ไม่มีวงรอ):
//   ดึงชั่วโมงทำงาน   : hr:payroll:run:<ระบบ>:<งวด> (ก่อนอ่านทุกอย่าง) → แถว HrWorkDay/HrWorkEntry ของงวดนั้น (เขียนใต้ล็อกงวดเท่านั้น)
//   คิดผลลงเวลาใหม่    : hr:payroll:run → hr:judge:<แถว> → hr:clock:<พนักงาน> → hr:roster:<…> (judge.ts) — ไม่แตะ HrWorkDay
//   อนุมัติ/บันทึกจ่าย  : hr:payroll:run → แถวรอบ FOR UPDATE → (ตรวจ/ผูก HrWorkDay ใน tx เดียวกัน) (payroll.ts)
//   อนุมัติ/ถอนใบลา · พ้นสภาพ : ไม่ถือล็อกงวด (hr-leave:* · hr:emp:* · hr:clock:*) ⇒ ไม่รอกันเป็นวง
//   ⇒ ทุกทางที่ถือล็อกงวดถือมันเป็นตัวแรก · ตัวดึงไม่ถือล็อกอื่นใดหลังล็อกงวด (อ่านเฉย ๆ) ⇒ ไม่มี cycle
// นาที = จำนวนเต็ม (ไม่มีเงินในไฟล์นี้) · OT = นาทีที่วัดได้เท่านั้น — จ่าย OT ผ่าน HrPayAdjustment (H2.9) ที่เดียว (บันทึกไว้ใน sourcesJson.otPayment) ◂
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { canViewPayroll, type MembershipCtx } from "@/lib/core/rbac";
import { employeeOfUser, leaveRowScopeOf } from "./service";
import { hrScopeOf, type HrScope } from "./scope";
import { canManageHrSettings } from "./settings";
import { workEntryDaysInTx, workEntryPunchesInTx, type JudgeViewer } from "./judge";
import { attendancePolicyOf } from "./judge-rules";
import { clockPolicyOf } from "./clock-rules";
import { unitOfDay } from "./roster";
import { holidayOfDay } from "./holidays";
import { addDays } from "./time-rules";
import {
  buildWorkDays,
  isBlocking,
  sha256Hex,
  tenthsOf,
  fmtTenths,
  workRulesOf,
  NORMAL_DAY_RANGE,
  WORK_ENTRY_ENGINE_VERSION,
  WORK_MIN_KEYS,
  type WorkDay,
  type WorkLeave,
  type WorkRules,
} from "./work-entries-rules";

type Ctx = { tenantId: string; systemId: string };
type Db = Prisma.TransactionClient;
export type WorkEntryViewer = JudgeViewer;

/** ข้อความคงที่ (ไทยทุกไบต์ — ห้ามต่อชื่อ/id) */
export const WE_TEXT = {
  no: "ไม่พบข้อมูลชั่วโมงทำงานนี้ หรือคุณไม่มีสิทธิ์ดู",
  buildNo: "คุณไม่มีสิทธิ์ดึงชั่วโมงทำงานเข้าเงินเดือน",
  period: "งวดต้องเป็นรูปแบบ YYYY-MM",
  frozen: "งวดนี้อนุมัติเงินเดือนแล้ว — ชั่วโมงทำงานถูกล็อกไว้ แก้ไม่ได้",
  tooMuch: "ข้อมูลของงวดนี้มากเกินไป — ลองดึงทีละสาขา",
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  approveBlocked: "ชั่วโมงทำงานของงวดนี้ยังไม่พร้อม — กด 'ดึงชั่วโมงทำงาน' และแก้รายการที่ต้องตรวจก่อนอนุมัติ",
  normalOwner: "เฉพาะเจ้าของร้านเปลี่ยนชั่วโมงทำงานปกติต่อวันได้",
  normalRange: "ชั่วโมงทำงานปกติต่อวันต้องอยู่ระหว่าง 60–720 นาที (จำนวนเต็ม)",
  normalSaved: "บันทึกชั่วโมงทำงานปกติต่อวันแล้ว — กด 'ดึงชั่วโมงทำงาน' ใหม่ในงวดที่ยังไม่อนุมัติ",
  failed: "บันทึกไม่สำเร็จ — กรุณาลองใหม่",
} as const;

export type WorkEntryState = "FROZEN" | "MISSING" | "OUTDATED" | "REVIEW" | "CURRENT";
const STATE_RANK: Record<WorkEntryState, number> = { CURRENT: 0, REVIEW: 1, OUTDATED: 2, MISSING: 3, FROZEN: 4 };
/** ทางจ่าย OT — นาทีในไฟล์นี้วัดอย่างเดียว · H3.2/H3.4 ต้องไม่สร้างรายการเงินจาก otWorkdayMin/otHolidayMin (จ่ายซ้ำ) */
export const WE_OT_PAYMENT = "MEASURED_ONLY_PAY_VIA_HR_PAY_ADJUSTMENT_H29";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAGE_SIZE = 25;
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const TAKE = 20_000;
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const nowOf = (opts: { now?: Date } | undefined): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? new Date(opts.now.getTime()) : new Date());
const lock = (tx: Db, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const periodLockKey = (ctx: Ctx, periodKey: string) => `hr:payroll:run:${ctx.systemId}:${periodKey}`;
function bounds(periodKey: string): { first: string; last: string } {
  const [y, m] = periodKey.split("-").map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${periodKey}-01`, last: `${periodKey}-${String(n).padStart(2, "0")}` };
}
const covers = (scope: HrScope, unitId: string | null) => scope.unitIds === "*" || (unitId !== null && scope.unitIds.includes(unitId));
const membership = (v: WorkEntryViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
/** ผู้ดึงชั่วโมงทำงาน = OWNER · hr.payroll.read (ตามขอบเขต HR ของตัวเอง) */
export const canBuildWorkEntries = (v: WorkEntryViewer | null | undefined): boolean => !!v && canViewPayroll(membership(v));
/** ผู้อ่านนาที (ไม่มีเงิน) = ผู้ดึง + MANAGER/hr.employee.create (สาขาของตัวเอง) */
export const canReadWorkEntries = (v: WorkEntryViewer | null | undefined): boolean => !!v && (canBuildWorkEntries(v) || canManageHrSettings(v));

// ═══════════════════════════ ค่าตั้ง: ชั่วโมงทำงานปกติต่อวัน (มติ Q10) ═══════════════════════════
const WORK_SETTINGS_KEY = "hrWork";
function settingsObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}
/** นาทีทำงานปกติต่อวันที่ตั้งไว้ (60–720 · ค่าปริยาย 480) */
export function normalMinutesOf(settings: unknown): number {
  const w = settingsObj(settingsObj(settings)[WORK_SETTINGS_KEY]);
  const v = w.normalMinutesPerDay;
  return typeof v === "number" && Number.isInteger(v) && v >= NORMAL_DAY_RANGE.min && v <= NORMAL_DAY_RANGE.max ? v : 480;
}
async function settingsOf(db: Db, ctx: Ctx): Promise<{ rules: WorkRules; policy: ReturnType<typeof attendancePolicyOf>; clock: ReturnType<typeof clockPolicyOf> }> {
  const s = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  const o = settingsObj(s?.settings);
  return { rules: workRulesOf({ normalDayMin: normalMinutesOf(o) }), policy: attendancePolicyOf(o.hrAttendance), clock: clockPolicyOf(o.hrClock) };
}
export async function getNormalMinutesPerDay(ctx: Ctx): Promise<number> {
  const s = await tenantDb(ctx).appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  return normalMinutesOf(s?.settings);
}
/** เจ้าของร้านเท่านั้น · ล็อกเดียวกับการบันทึกค่าตั้งการลงเวลา (hr:clockpolicy:<ระบบ>) ⇒ ไม่ทับค่าตั้งอื่นที่บันทึกพร้อมกัน */
export async function setNormalMinutesPerDay(ctx: Ctx, viewer: WorkEntryViewer, value: unknown): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!viewer || viewer.role !== "OWNER") return { ok: false, reason: WE_TEXT.normalOwner };
  const n = typeof value === "string" && /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < NORMAL_DAY_RANGE.min || n > NORMAL_DAY_RANGE.max) return { ok: false, reason: WE_TEXT.normalRange };
  const done = await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:clockpolicy:${ctx.systemId}`);
    const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
    if (!sys) return false;
    const base = { ...settingsObj(sys.settings) };
    base[WORK_SETTINGS_KEY] = { ...settingsObj(base[WORK_SETTINGS_KEY]), normalMinutesPerDay: n };
    const r = await tx.appSystem.updateMany({ where: { id: sys.id, tenantId: ctx.tenantId }, data: { settings: base as Prisma.InputJsonValue } });
    return r.count === 1;
  }, TX_OPTS);
  if (!done) return { ok: false, reason: WE_TEXT.failed };
  await writeAudit({ tenantId: ctx.tenantId, actorType: viewer.userId ? "USER" : "SYSTEM", actorId: viewer.userId ?? null, action: "hr.settings.work.update", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, normalMinutesPerDay: n } });
  return { ok: true, id: ctx.systemId };
}

// ═══════════════════════════ พนักงานของงวด ═══════════════════════════
const EMP_SELECT = { id: true, name: true, position: true, unitId: true, active: true, startDate: true, endDate: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } } as const;
type Emp = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
/** พนักงานที่ทำงานอย่างน้อย 1 วันในงวด (ปิดใช้โดยไม่มีวันสิ้นสุด = ไม่นับ — แบบเดียวกับรอบจ่าย) · เรียงตาม id */
async function periodEmployees(db: Db, ctx: Ctx, periodKey: string, where: Prisma.HrEmployeeWhereInput = {}): Promise<Emp[]> {
  const b = bounds(periodKey);
  const rows = (await db.hrEmployee.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ...where,
      AND: [{ OR: [{ startDate: null }, { startDate: { lte: dbDate(b.last) } }] }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(b.first) } }] }, { OR: [{ active: true }, { endDate: { not: null } }] }],
    },
    select: EMP_SELECT,
    orderBy: { id: "asc" },
    take: 5000,
  })) as Emp[];
  return rows;
}
function employedDays(e: Pick<Emp, "startDate" | "endDate">, periodKey: string): string[] {
  const b = bounds(periodKey);
  const s = e.startDate ? dayOf(e.startDate) : null;
  const en = e.endDate ? dayOf(e.endDate) : null;
  const out: string[] = [];
  for (let d = s && s > b.first ? s : b.first; d <= (en && en < b.last ? en : b.last); d = addDays(d, 1)) out.push(d);
  return out;
}

// ═══════════════════════════ สถานะของข้อมูลต้นทาง (R5 — อ่านถูก ไม่ตัดสินใหม่) ═══════════════════════════
type HashLeave = { id: string; employeeId: string; from: string; to: string; status: string; halfDay: string | null; hours: string | null; policyId: string | null; paid: boolean | null };
type HashData = { hashes: Map<string, string>; leaves: HashLeave[] };
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const BKK_MS = 7 * 3_600_000;
const bkkDay = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
/** อ่านทุกแถว (เป็นหน้า ๆ ละ TAKE ตาม id) — ไม่ตัดทิ้งเงียบ ๆ (r2 6) */
async function allRows<T extends { id: string }>(q: (after: string | null) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await q(after);
    out.push(...page);
    if (page.length < TAKE) return out;
    after = page[page.length - 1]!.id;
  }
}
const pageArgs = (after: string | null) => ({ orderBy: { id: "asc" as const }, take: TAKE, ...(after ? { cursor: { id: after }, skip: 1 } : {}) });
const push = <V,>(m: Map<string, V[]>, k: string, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};
/**
 * inputHash ต่อวัน (r2 2 — ครอบทุกอย่างที่ตัวตัดสิน H2.5 อ่าน ⇒ แถวที่ stale โดยไม่มีการเพิ่ม version ก็ทำให้วันนั้น OUTDATED) = sha256 ของ
 * {รุ่นเครื่อง · กติกา (normalDayMin) · นโยบาย hrAttendance + hrClock · วันเริ่ม/สิ้นสุด/ช่วงยืมตัว/สาขาของวัน · แถว HrAttendanceDay (id, version, slotKey) ·
 *  แถวลงเวลาที่ยังมีผล วัน−1…วัน+1 (id, kind, at, rosterEntryId — แถวที่ H2.6 ยกเลิกหลุดออก) · ตารางกะของสัปดาห์ (id, วัน, updatedAt, publishedAt, breakMin, shiftId) + กะต้นแบบ (graceMin) ·
 *  ตารางประจำของวันในสัปดาห์ (ค่าทั้งแถว + createdAt) · ใบลาที่ครอบวัน (id, status, halfDay, hours, policyId, paid) · วันหยุดของวัน (id, updatedAt, shopOpen)}
 * อ่านเป็นหน้า + จัดดัชนีครั้งเดียว (Map ต่อพนักงาน/วัน) — ไม่มีการกรองซ้ำ O(คน × วัน × แถว)
 */
async function hashDataOf(db: Db, ctx: Ctx, emps: Emp[], periodKey: string): Promise<HashData> {
  const b = bounds(periodKey);
  const ids = emps.map((e) => e.id);
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  if (!ids.length) return { hashes: new Map(), leaves: [] };
  const wFrom = mondayOf(b.first);
  const wTo = addDays(mondayOf(b.last), 6);
  const pFrom = new Date(dbDate(addDays(b.first, -1)).getTime() - BKK_MS);
  const pTo = new Date(dbDate(addDays(b.last, 2)).getTime() - BKK_MS);
  const [{ rules, policy, clock }, att, entries, shifts, sched, lv, hols, punches] = await Promise.all([
    settingsOf(db, ctx),
    allRows((a) => db.hrAttendanceDay.findMany({ where: { ...scope, employeeId: { in: ids }, date: { gte: dbDate(b.first), lte: dbDate(b.last) } }, select: { id: true, employeeId: true, date: true, version: true, slotKey: true }, ...pageArgs(a) })),
    allRows((a) => db.hrRosterEntry.findMany({ where: { ...scope, employeeId: { in: ids }, date: { gte: dbDate(wFrom), lte: dbDate(wTo) } }, select: { id: true, employeeId: true, date: true, updatedAt: true, publishedAt: true, breakMin: true, shiftId: true }, ...pageArgs(a) })),
    db.hrShift.findMany({ where: scope, select: { id: true, graceMin: true }, take: 5000 }),
    db.hrWorkSchedule.findMany({ where: { ...scope, employeeId: { in: ids } }, select: { employeeId: true, weekday: true, dayOff: true, startMin: true, endMin: true, graceMin: true, createdAt: true, updatedAt: true } }),
    allRows((a) =>
      db.hrLeave.findMany({
        where: { ...scope, employeeId: { in: ids }, fromDate: { lte: dbDate(b.last) }, toDate: { gte: dbDate(b.first) } },
        select: { id: true, employeeId: true, fromDate: true, toDate: true, status: true, halfDay: true, hours: true, policyId: true, policy: { select: { paid: true } } },
        ...pageArgs(a),
      }),
    ),
    db.hrHoliday.findMany({ where: { ...scope, date: { gte: dbDate(b.first), lte: dbDate(b.last) } }, select: { id: true, unitId: true, date: true, name: true, kind: true, shopOpen: true, updatedAt: true }, take: 5000 }),
    allRows((a) => workEntryPunchesInTx(db, ctx, ids, pFrom, pTo, a, TAKE)), // แถวลงเวลาที่ยังมีผล (H2.6 — ยกเลิกแล้วไม่นับ · อ่านผ่าน judge.ts)
  ]);
  const leaves: HashLeave[] = lv.map((l) => ({
    id: l.id,
    employeeId: l.employeeId,
    from: dayOf(l.fromDate),
    to: dayOf(l.toDate),
    status: String(l.status),
    halfDay: l.halfDay ?? null,
    hours: l.hours === null ? null : String(l.hours),
    policyId: l.policyId,
    paid: l.policy ? l.policy.paid : null,
  }));
  const ts = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  const grace = new Map(shifts.map((x) => [x.id, x.graceMin]));
  const attBy = new Map<string, (typeof att)[number][]>();
  for (const r of att) push(attBy, `${r.employeeId}|${dayOf(r.date)}`, r);
  const entBy = new Map<string, (typeof entries)[number][]>(); // ต่อพนักงาน|วันจันทร์ของสัปดาห์
  for (const r of entries) push(entBy, `${r.employeeId}|${mondayOf(dayOf(r.date))}`, r);
  const punchBy = new Map<string, (typeof punches)[number][]>();
  for (const r of punches) push(punchBy, `${r.employeeId}|${bkkDay(r.at)}`, r);
  const schedBy = new Map<string, (typeof sched)[number][]>();
  for (const r of sched) push(schedBy, `${r.employeeId}|${r.weekday}`, r);
  const leaveBy = new Map<string, HashLeave[]>();
  for (const l of leaves) push(leaveBy, l.employeeId, l);
  const hashes = new Map<string, string>();
  for (const e of emps) {
    const units = (e.units ?? []).map((u) => [u.id, u.unitId, dayOf(u.fromDate), u.toDate ? dayOf(u.toDate) : null]).sort();
    for (const day of employedDays(e, periodKey)) {
      const unitId = unitOfDay(e, day);
      const hol = holidayOfDay(hols, unitId, day) as (typeof hols)[number] | null;
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
      hashes.set(
        `${e.id}|${day}`,
        sha256Hex({
          engine: WORK_ENTRY_ENGINE_VERSION,
          rules,
          policy,
          clock,
          emp: { start: e.startDate ? dayOf(e.startDate) : null, end: e.endDate ? dayOf(e.endDate) : null, unitId, units },
          att: (attBy.get(`${e.id}|${day}`) ?? []).map((r) => [r.id, r.version, r.slotKey]).sort(),
          punches: [addDays(day, -1), day, addDays(day, 1)].flatMap((d) => (punchBy.get(`${e.id}|${d}`) ?? []).map((r) => [r.id, r.kind, ts(r.at), r.rosterEntryId])).sort(),
          roster: (entBy.get(`${e.id}|${mondayOf(day)}`) ?? []).map((r) => [r.id, dayOf(r.date), ts(r.updatedAt), ts(r.publishedAt), r.breakMin, r.shiftId, grace.get(r.shiftId) ?? null]).sort(),
          sched: (schedBy.get(`${e.id}|${wd}`) ?? []).map((r) => [r.dayOff, r.startMin, r.endMin, r.graceMin, ts(r.createdAt), ts(r.updatedAt)]).sort(),
          leaves: (leaveBy.get(e.id) ?? []).filter((l) => l.from <= day && day <= l.to).map((l) => [l.id, l.status, l.halfDay, l.hours, l.policyId, l.paid]).sort(),
          holiday: hol ? [hol.id, ts(hol.updatedAt), hol.shopOpen] : null,
        }),
      );
    }
  }
  return { hashes, leaves };
}

type StoredDay = { id: string; employeeId: string; date: Date; inputHash: string; digest: string; review: string[] };
async function frozenRun(db: Db, ctx: Ctx, periodKey: string): Promise<boolean> {
  return !!(await db.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } }));
}
/**
 * สถานะต่อพนักงาน (ไม่ดูรอบที่แช่แข็ง — ผู้เรียกตัดสิน FROZEN เอง) · คำสั่ง: hashDataOf (~8 + แถว/20 000) + หัววัน (แถว/20 000) ·
 * 2 000 คน × 31 วัน ≈ 62 000 หัววัน ⇒ ราว 20–30 คำสั่ง · ไม่มีคำสั่งต่อคน/ต่อวัน
 */
async function statesOf(db: Db, ctx: Ctx, emps: Emp[], periodKey: string): Promise<{ state: Map<string, WorkEntryState>; rows: StoredDay[] }> {
  const state = new Map<string, WorkEntryState>();
  if (!emps.length) return { state, rows: [] };
  const ids = emps.map((e) => e.id);
  const [hd, rows] = await Promise.all([
    hashDataOf(db, ctx, emps, periodKey),
    allRows((a) =>
      db.hrWorkDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, employeeId: { in: ids } }, select: { id: true, employeeId: true, date: true, inputHash: true, digest: true, review: true }, ...pageArgs(a) }) as Promise<StoredDay[]>,
    ),
  ]);
  const byEmp = new Map<string, StoredDay[]>();
  for (const r of rows) push(byEmp, r.employeeId, r);
  for (const e of emps) {
    const mine = byEmp.get(e.id) ?? [];
    if (!mine.length) {
      state.set(e.id, "MISSING");
      continue;
    }
    const days = employedDays(e, periodKey);
    const byDay = new Map(mine.map((r) => [dayOf(r.date), r]));
    const outdated = mine.length !== days.length || days.some((d) => byDay.get(d)?.inputHash !== hd.hashes.get(`${e.id}|${d}`));
    state.set(e.id, outdated ? "OUTDATED" : mine.some((r) => isBlocking(r.review)) ? "REVIEW" : "CURRENT");
  }
  return { state, rows };
}
const worst = (xs: Iterable<WorkEntryState>, empty: WorkEntryState): WorkEntryState => {
  let w: WorkEntryState | null = null;
  for (const x of xs) if (w === null || STATE_RANK[x] > STATE_RANK[w]) w = x;
  return w ?? empty;
};

// ═══════════════════════════ ดึงชั่วโมงทำงาน (R4) ═══════════════════════════
export type BuildResult =
  | { ok: true; periodKey: string; employees: number; written: number; unchanged: number; removed: number; blocking: number; next: string | null }
  | { ok: false; reason: string };
class Refusal extends Error {}
const DAY_COLS = (d: WorkDay) => ({
  periodKey: d.periodKey,
  unitId: d.unitId,
  dayClass: d.dayClass,
  dayStatus: d.dayStatus,
  ...Object.fromEntries(WORK_MIN_KEYS.map((k) => [k, d[k]])),
  leaveDays: d.leaveDays,
  review: d.review,
  sourcesJson: { ...d.sources, otPayment: WE_OT_PAYMENT } as Prisma.InputJsonValue,
  digest: d.digest,
  engineVersion: WORK_ENTRY_ENGINE_VERSION,
});

/**
 * ดึงชั่วโมงทำงานของงวด — ทีละหน้า pageSize คน (25) · หน้าละ 1 tx: ล็อกงวดก่อน → รอบ APPROVED/PAID ⇒ frozen (ไม่เขียน) →
 * อ่านผ่าน tx (ตัวอ่านของ judge.ts) → แถวที่ digest + inputHash เท่าเดิมไม่แตะ · เปลี่ยน ⇒ แก้แถวเดิม (version+1 · แถวชนิดเขียนใหม่) ·
 * วันที่ไม่ได้จ้างแล้ว ⇒ ลบ · ข้อมูลถึงเพดาน ⇒ tooMuch · ประวัติ hr.work_entries.built ต่อหน้า (จำนวนเท่านั้น) · ไม่มี event
 */
export async function buildWorkEntrySnapshot(
  ctx: Ctx,
  viewer: WorkEntryViewer,
  input: { periodKey?: unknown; employeeIds?: unknown; after?: unknown },
  // __afterRead = ช่องทดสอบของข้อสอบ (S9.5 แทรกการเปลี่ยนข้อมูลระหว่างการอ่าน) — action/หน้าไม่ส่ง
  opts: { now?: Date; pageSize?: number; __afterRead?: () => Promise<void> } = {},
): Promise<BuildResult> {
  if (!canBuildWorkEntries(viewer)) return { ok: false, reason: WE_TEXT.buildNo };
  const periodKey = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(periodKey)) return { ok: false, reason: WE_TEXT.period };
  const now = nowOf(opts);
  const pageSize = Number.isInteger(opts.pageSize) && opts.pageSize! > 0 ? opts.pageSize! : PAGE_SIZE;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const only = Array.isArray(input?.employeeIds) ? new Set(input.employeeIds.filter((x): x is string => typeof x === "string")) : null;
  const after = typeof input?.after === "string" ? input.after : "";
  const b = bounds(periodKey);
  const all = (await periodEmployees(tenantDb(ctx) as unknown as Db, ctx, periodKey)).filter((e) => covers(scope, e.unitId) && (!only || only.has(e.id)) && e.id > after);
  const total = { employees: 0, written: 0, unchanged: 0, removed: 0, blocking: 0 };
  const started = Date.now();
  let next: string | null = null;
  try {
    for (let i = 0; i < Math.max(all.length, 1); i += pageSize) {
      if (i > 0 && Date.now() - started > 20_000) {
        next = all[i - 1]!.id; // หมดเวลาของคำขอนี้ — เรียกต่อด้วย after = next
        break;
      }
      const page = all.slice(i, i + pageSize);
      const first = i === 0;
      const r = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Db;
        await lock(tx, periodLockKey(ctx, periodKey)); // ล็อกงวดก่อนอ่านทุกอย่าง
        if (await frozenRun(tx, ctx, periodKey)) throw new Refusal(WE_TEXT.frozen);
        const c = { employees: page.length, written: 0, unchanged: 0, removed: 0, blocking: 0 };
        // หน้าแรก (ทั้งร้าน ไม่จำกัดคน): ลบหัววันของพนักงานที่ไม่อยู่ในงวดแล้ว
        if (first && !only && scope.unitIds === "*" && !after) {
          const keep = (await periodEmployees(tx, ctx, periodKey)).map((e) => e.id);
          const del = await tx.hrWorkDay.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, employeeId: { notIn: keep } } });
          c.removed += del.count;
        }
        if (!page.length) return c;
        const ids = page.map((e) => e.id);
        // r2 (3): ตัวอ่านกับ hash ต้องมาจากข้อมูลชุดเดียวกัน — อ่าน hash ก่อนและหลังตัวอ่าน (READ COMMITTED) · ไม่ตรงกัน ⇒ วันนั้นเก็บ hash ที่ไม่มีวันตรง ⇒ OUTDATED
        const hd0 = await hashDataOf(tx, ctx, page, periodKey);
        const read = await workEntryDaysInTx(tx, ctx, ids, b.first, b.last, now);
        if (read.truncated) throw new Refusal(WE_TEXT.tooMuch);
        if (opts.__afterRead) await opts.__afterRead();
        const hd = await hashDataOf(tx, ctx, page, periodKey);
        const { rules } = await settingsOf(tx, ctx);
        // H3.1 r3: คำขอ OT ที่อนุมัติแล้ว (H2.9) — อ้างอิงอย่างเดียว (ไม่อยู่ใน inputHash: การจ่าย/ชำระ OT ไม่ทำให้งวด OUTDATED) · ไม่สร้างรายการเงิน
        const otReqs = await tx.hrOtRequest.findMany({
          where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, status: "APPROVED", revokedAt: null, date: { gte: dbDate(b.first), lte: dbDate(b.last) } },
          select: { id: true, employeeId: true, date: true },
          orderBy: { id: "asc" },
          take: TAKE,
        });
        const otBy = new Map<string, string[]>();
        for (const o of otReqs) push(otBy, `${o.employeeId}|${dayOf(o.date)}`, o.id);
        const lvById = new Map(hd.leaves.map((l) => [l.id, l]));
        const existing = await tx.hrWorkDay.findMany({
          where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, date: { gte: dbDate(b.first), lte: dbDate(b.last) } },
          select: { id: true, employeeId: true, date: true, inputHash: true, digest: true, version: true },
          take: TAKE,
        });
        const exBy = new Map(existing.map((x) => [`${x.employeeId}|${dayOf(x.date)}`, x]));
        const creates: Prisma.HrWorkDayCreateManyInput[] = [];
        const kinds: Prisma.HrWorkEntryCreateManyInput[] = [];
        const replaced: string[] = [];
        const seen = new Set<string>();
        for (const e of page) {
          const days = read.days.filter((d) => d.employeeId === e.id);
          const out = buildWorkDays({
            employeeId: e.id,
            startDate: e.startDate ? dayOf(e.startDate) : null,
            endDate: e.endDate ? dayOf(e.endDate) : null,
            from: b.first,
            to: b.last,
            rules,
            days: days.map((d) => ({
              otRequestIds: otBy.get(`${e.id}|${d.day}`) ?? [],
              day: d.day,
              unitId: d.unitId,
              holiday: d.holiday,
              slots: d.slots,
              leaves: d.leaves.map((l): WorkLeave => {
                const h = lvById.get(l.id);
                return { id: l.id, status: l.status, halfDay: l.halfDay, hours: l.hours === null ? null : Math.round(l.hours), paid: h?.paid ?? true, legacy: !h?.policyId };
              }),
            })),
          });
          for (const d of out) {
            const key = `${e.id}|${d.day}`;
            seen.add(key);
            if (isBlocking(d.review)) c.blocking++;
            const h1 = hd.hashes.get(key);
            const inputHash = h1 && h1 === hd0.hashes.get(key) ? h1 : sha256Hex({ racy: key, at: now.toISOString() });
            const ex = exBy.get(key);
            if (ex && ex.digest === d.digest && ex.inputHash === inputHash) {
              c.unchanged++;
              continue;
            }
            if (ex && ex.digest === d.digest) {
              // ผลเท่าเดิม แต่ข้อมูลต้นทางเปลี่ยน (เช่น แถวลงเวลาของวันข้างเคียง) ⇒ อัปเดต inputHash อย่างเดียว (version/แถวชนิดคงเดิม)
              const u = await tx.hrWorkDay.updateMany({ where: { id: ex.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: ex.version }, data: { inputHash } });
              if (u.count !== 1) throw new Refusal(WE_TEXT.failed);
              c.unchanged++;
              continue;
            }
            let id: string;
            if (ex) {
              const u = await tx.hrWorkDay.updateMany({
                where: { id: ex.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: ex.version },
                data: { ...DAY_COLS(d), inputHash, version: ex.version + 1, builtAt: now, runId: null } as Prisma.HrWorkDayUpdateManyMutationInput,
              });
              if (u.count !== 1) throw new Refusal(WE_TEXT.failed);
              id = ex.id;
              replaced.push(id);
            } else {
              id = randomUUID();
              creates.push({ id, tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: e.id, date: dbDate(d.day), ...DAY_COLS(d), inputHash, version: 1, builtAt: now } as Prisma.HrWorkDayCreateManyInput);
            }
            c.written++;
            const roster = d.sources.rosterEntryIds[0] ?? null;
            const used = d.sources.leaveIds.map((x) => lvById.get(x)).filter((x): x is HashLeave => !!x && x.status === "APPROVED");
            const paidLv = used.find((x) => x.paid !== false)?.id ?? null;
            const unpaidLv = used.find((x) => x.paid === false)?.id ?? null;
            for (const en of d.entries) {
              kinds.push({
                tenantId: ctx.tenantId,
                systemId: ctx.systemId,
                employeeId: e.id,
                date: dbDate(d.day),
                kind: en.kind,
                minutes: en.minutes,
                periodKey: d.periodKey,
                unitId: d.unitId,
                rosterEntryId: roster,
                leaveId: en.kind === "LEAVE_PAID" ? paidLv : en.kind === "LEAVE_UNPAID" ? unpaidLv : null,
                holidayId: d.sources.holidayId,
                otRequestId: en.kind === "OT_WORKDAY" || en.kind === "OT_HOLIDAY" ? (d.sources.otRequestIds[0] ?? null) : null,
                computedAt: now,
                note: en.kind === "OT_WORKDAY" || en.kind === "OT_HOLIDAY" ? WE_OT_PAYMENT : null,
                workDayId: id,
              });
            }
          }
        }
        if (replaced.length) await tx.hrWorkEntry.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, workDayId: { in: replaced } } });
        // แถวชนิดเก่าที่ไม่มีหัววัน (ก่อน H3.1 · ยังไม่ผูกรอบ) ของวันที่จะเขียน ⇒ ลบก่อน ไม่ให้ unique (employeeId, date, kind) ชน
        if (kinds.length) await tx.hrWorkEntry.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, periodKey, workDayId: null, runId: null } });
        if (creates.length) await tx.hrWorkDay.createMany({ data: creates });
        if (kinds.length) await tx.hrWorkEntry.createMany({ data: kinds });
        const gone = existing.filter((x) => !seen.has(`${x.employeeId}|${dayOf(x.date)}`)).map((x) => x.id);
        if (gone.length) c.removed += (await tx.hrWorkDay.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: gone } } })).count;
        return c;
      }, TX_OPTS);
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
      if (r.written || r.removed) {
        await writeAudit({
          tenantId: ctx.tenantId,
          actorType: viewer.userId ? "USER" : "SYSTEM",
          actorId: viewer.userId ?? null,
          action: "hr.work_entries.built",
          targetType: "AppSystem",
          targetId: ctx.systemId,
          after: { systemId: ctx.systemId, periodKey, employees: r.employees, written: r.written, unchanged: r.unchanged, removed: r.removed, blocking: r.blocking },
        });
      }
    }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    throw e;
  }
  return { ok: true, periodKey, ...total, next };
}

// ═══════════════════════════ ด่านอนุมัติ + แช่แข็ง (R6 — เรียกจาก payroll.ts ใต้ล็อกงวด) ═══════════════════════════
/** รอบรุ่น ≥ 2: พนักงานทุกคนในรอบต้อง CURRENT · รอบรุ่น 1 ไม่อ่านชั่วโมงทำงาน (ผ่านเสมอ — มติ Q5) */
export async function workEntriesApproveCheckInTx(tx: Db, ctx: Ctx, input: { runId: string; periodKey: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const run = await tx.hrPayrollRun.findFirst({ where: { id: input.runId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { engineVersion: true, periodKey: true } });
  if (!run || run.engineVersion < 2) return { ok: true };
  const items = await tx.hrPayrollItem.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, runId: input.runId }, select: { employeeId: true } });
  const ids = [...new Set(items.map((x) => x.employeeId))];
  if (!ids.length) return { ok: true };
  const emps = await periodEmployees(tx, ctx, run.periodKey, { id: { in: ids } });
  const { state } = await statesOf(tx, ctx, emps, run.periodKey);
  const bad = ids.some((id) => state.get(id) !== "CURRENT");
  return bad ? { ok: false, reason: WE_TEXT.approveBlocked } : { ok: true };
}
/** หลังอนุมัติสำเร็จ (count = 1): ผูกทุกแถวของงวดกับรอบ — แถวที่ผูกแล้วแก้ไม่ได้อีก (ตัวดึงเห็นรอบ APPROVED/PAID ⇒ frozen) */
export async function bindWorkEntriesToRunInTx(tx: Db, ctx: Ctx, input: { runId: string; periodKey: string }): Promise<{ days: number; entries: number }> {
  const where = { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: input.periodKey };
  const d = await tx.hrWorkDay.updateMany({ where, data: { runId: input.runId } });
  const e = await tx.hrWorkEntry.updateMany({ where, data: { runId: input.runId } });
  return { days: d.count, entries: e.count };
}

// ═══════════════════════════ ตัวอ่าน (R8 — นาทีเท่านั้น ไม่มีเงิน) ═══════════════════════════
const MIN_SUM_KEYS = ["plannedMin", "workMin", "otWorkdayMin", "holidayWorkMin", "otHolidayMin", "holidayPaidMin", "paidLeaveMin", "unpaidLeaveMin", "absentMin", "lateMin", "earlyOutMin"] as const;
export type WorkEntrySummary = {
  employedDays: number;
  worked: number;
  leave: number;
  absent: number;
  dayOff: number;
  holiday: number;
  unscheduled: number;
  pending: number;
  leaveDays: string;
  lateCount: number;
} & Record<(typeof MIN_SUM_KEYS)[number], number>;
export type WorkEntryPreviewRow = { employeeId: string; name: string; position: string | null; state: WorkEntryState; reviewCount: number; summary: WorkEntrySummary };
export type WorkEntryPreview = { ok: true; periodKey: string; state: WorkEntryState; rows: WorkEntryPreviewRow[] };
export type WorkEntryDayDto = {
  day: string;
  dayClass: string;
  dayStatus: string;
  leaveDays: string;
  review: string[];
  leaveLabel: string | null;
  sources: { attendanceDayIds: string[]; rosterEntryIds: string[]; leaveIds: string[]; holidayId: string | null };
} & Record<(typeof WORK_MIN_KEYS)[number], number>;
export type WorkEntryDays = { ok: true; employee: { id: string; name: string }; periodKey: string; state: WorkEntryState; days: WorkEntryDayDto[] };
type Refused = { ok: false; reason: string };
const NO: Refused = { ok: false, reason: WE_TEXT.no };
const no = (): Refused => ({ ...NO });

const DAY_READ = {
  id: true,
  employeeId: true,
  date: true,
  dayClass: true,
  dayStatus: true,
  ...Object.fromEntries(WORK_MIN_KEYS.map((k) => [k, true])),
  leaveDays: true,
  review: true,
  sourcesJson: true,
} as unknown as { id: true };
type DayRead = { id: string; employeeId: string; date: Date; dayClass: string; dayStatus: string; leaveDays: unknown; review: string[]; sourcesJson: unknown } & Record<(typeof WORK_MIN_KEYS)[number], number>;

function summaryOf(rows: DayRead[], employed: number): WorkEntrySummary {
  const n = (s: string) => rows.filter((r) => r.dayStatus === s).length;
  const sum = Object.fromEntries(MIN_SUM_KEYS.map((k) => [k, rows.reduce((a, r) => a + r[k], 0)])) as Record<(typeof MIN_SUM_KEYS)[number], number>;
  return {
    employedDays: employed,
    worked: n("WORKED"),
    leave: n("LEAVE"),
    absent: n("ABSENT"),
    dayOff: n("DAY_OFF"),
    holiday: n("HOLIDAY"),
    unscheduled: n("UNSCHEDULED"),
    pending: n("PENDING"),
    leaveDays: fmtTenths(rows.reduce((a, r) => a + tenthsOf(r.leaveDays), 0)),
    lateCount: rows.filter((r) => r.lateMin > 0).length,
    ...sum,
  };
}
async function periodState(db: Db, ctx: Ctx, emps: Emp[], periodKey: string): Promise<{ frozen: boolean; state: Map<string, WorkEntryState>; rows: StoredDay[] }> {
  const frozen = await frozenRun(db, ctx, periodKey);
  const s = await statesOf(db, ctx, emps, periodKey);
  if (frozen) for (const k of s.state.keys()) s.state.set(k, "FROZEN");
  return { frozen, ...s };
}

/** ภาพรวมของงวด (snapshot เท่านั้น — ไม่คิดสด) · พนักงานในขอบเขตสาขาของผู้ดู */
export async function workEntryPreview(ctx: Ctx, viewer: WorkEntryViewer, input: { periodKey?: unknown }, opts: { now?: Date } = {}): Promise<WorkEntryPreview | Refused> {
  void opts;
  if (!canReadWorkEntries(viewer)) return no();
  const periodKey = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(periodKey)) return no();
  const db = tenantDb(ctx) as unknown as Db;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const emps = (await periodEmployees(db, ctx, periodKey)).filter((e) => covers(scope, e.unitId));
  const { frozen, state } = await periodState(db, ctx, emps, periodKey);
  const rows = emps.length
    ? ((await db.hrWorkDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, employeeId: { in: emps.map((e) => e.id) } }, select: DAY_READ, take: TAKE })) as unknown as DayRead[])
    : [];
  const out: WorkEntryPreviewRow[] = [...emps]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
    .map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id);
      return {
        employeeId: e.id,
        name: e.name,
        position: e.position ?? null,
        state: state.get(e.id) ?? "MISSING",
        reviewCount: mine.filter((r) => r.review.length > 0).length,
        summary: summaryOf(mine, employedDays(e, periodKey).length),
      };
    });
  return { ok: true, periodKey, state: frozen ? "FROZEN" : worst(out.map((r) => r.state), "CURRENT"), rows: out };
}

async function daysDto(db: Db, ctx: Ctx, e: Emp, periodKey: string, wideLeave: boolean): Promise<WorkEntryDays> {
  const { state } = await periodState(db, ctx, [e], periodKey);
  const rows = (await db.hrWorkDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey, employeeId: e.id }, select: DAY_READ, orderBy: { date: "asc" }, take: 62 })) as unknown as DayRead[];
  const leaveIds = [...new Set(rows.flatMap((r) => (Array.isArray((r.sourcesJson as { leaveIds?: unknown })?.leaveIds) ? ((r.sourcesJson as { leaveIds: string[] }).leaveIds) : [])))];
  const lv = leaveIds.length
    ? await db.hrLeave.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: leaveIds } }, select: { id: true, type: true, status: true, policy: { select: { name: true } } } })
    : [];
  const CAT: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน", OTHER: "ลาอื่น ๆ" };
  const labelOf = (ids: string[]): string | null => {
    const rs = ids.map((id) => lv.find((x) => x.id === id)).filter((x): x is (typeof lv)[number] => !!x);
    const l = rs.find((x) => x.status === "APPROVED") ?? rs[0];
    if (!l) return null;
    return wideLeave ? l.policy?.name?.trim() || CAT[String(l.type)] || "ลา" : "ลา";
  };
  const days: WorkEntryDayDto[] = rows.map((r) => {
    const s = (r.sourcesJson ?? {}) as { attendanceDays?: { id: string }[]; rosterEntryIds?: string[]; leaveIds?: string[]; holidayId?: string | null };
    const leaveIdsOf = Array.isArray(s.leaveIds) ? s.leaveIds.map(String) : [];
    return {
      day: dayOf(r.date),
      dayClass: r.dayClass,
      dayStatus: r.dayStatus,
      ...(Object.fromEntries(WORK_MIN_KEYS.map((k) => [k, r[k]])) as Record<(typeof WORK_MIN_KEYS)[number], number>),
      leaveDays: fmtTenths(tenthsOf(r.leaveDays)),
      review: [...r.review],
      leaveLabel: labelOf(leaveIdsOf),
      sources: {
        attendanceDayIds: Array.isArray(s.attendanceDays) ? s.attendanceDays.map((x) => String(x.id)) : [],
        rosterEntryIds: Array.isArray(s.rosterEntryIds) ? s.rosterEntryIds.map(String) : [],
        leaveIds: leaveIdsOf,
        holidayId: typeof s.holidayId === "string" ? s.holidayId : null,
      },
    };
  });
  return { ok: true, employee: { id: e.id, name: e.name }, periodKey, state: state.get(e.id) ?? "MISSING", days };
}

/** วันของพนักงานหนึ่งคน · ไม่ใช่ผู้อ่าน / ไม่พบ / นอกสาขา / ร้านอื่น ⇒ คำปฏิเสธเดียวกันทุกไบต์ */
export async function workEntryDays(ctx: Ctx, viewer: WorkEntryViewer, input: { employeeId?: unknown; periodKey?: unknown }, opts: { now?: Date } = {}): Promise<WorkEntryDays | Refused> {
  void opts;
  if (!canReadWorkEntries(viewer)) return no();
  const periodKey = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  const id = typeof input?.employeeId === "string" ? input.employeeId.trim() : "";
  if (!PERIOD_RE.test(periodKey) || !id) return no();
  const db = tenantDb(ctx) as unknown as Db;
  const e = (await periodEmployees(db, ctx, periodKey, { id }))[0];
  if (!e || !covers(hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess }), e.unitId)) return no();
  const wide = "all" in leaveRowScopeOf(membership(viewer), viewer.userId ?? "");
  return daysDto(db, ctx, e, periodKey, wide);
}

/** วันของตัวเอง — พนักงานจากบัญชีผู้ใช้เท่านั้น (ไม่รับ employeeId จากผู้เรียก) · เห็นประเภทลาของตัวเอง */
export async function myWorkEntryDays(ctx: Ctx, actor: { userId?: unknown }, input: { periodKey?: unknown }, opts: { now?: Date } = {}): Promise<WorkEntryDays | Refused> {
  void opts;
  const userId = typeof actor?.userId === "string" ? actor.userId : "";
  const link = await employeeOfUser(ctx?.tenantId ?? "", userId);
  if (!link) return { ok: false, reason: WE_TEXT.noEmp };
  const periodKey = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(periodKey)) return no();
  const own: Ctx = { tenantId: ctx.tenantId, systemId: link.systemId };
  const db = tenantDb(own) as unknown as Db;
  const e = (await periodEmployees(db, own, periodKey, { id: link.employeeId }))[0];
  if (!e) return no();
  return daysDto(db, own, e, periodKey, true);
}
