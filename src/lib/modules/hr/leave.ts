// HR H2.7 ▸ เครื่องยนต์การลา: ประเภทการลา (policy) · สมุดวันลา (ledger) · ครึ่งวัน/ชั่วโมง · ไฟล์แนบ · งานยก/ตัดวันลาสะสม · event hr.leave.decided
//   (brief H2.7 R3–R12 · ตัวงาน requestLeave/decideLeave/cancelLeave ยังอยู่ที่ service.ts — Q2 · ที่นี่ = ตัวช่วยที่ service.ts เรียกในธุรกรรมของตัวเอง)
//
// กติกา:
//   • ยอดคงเหลือ = Σ แถวสมุด (HrLeaveBalanceTxn) — ไม่มีตัวนับ · เพิ่มแถวอย่างเดียว (ไม่ update/delete) · กันซ้ำด้วย unique (systemId, sourceKey)
//     grant:<emp>:<pol>:<ปี> · use:<leaveId> (−วัน) · use-revert:<leaveId> (ADJUST +วัน ครั้งเดียว · ปี/ประเภทของแถว USE) ·
//     ยกวันสะสม = โอนในธุรกรรมเดียว (r2 มติ L2): carry-out:<emp>:<pol>:<ปีY> (CARRY −c ในปี Y−1) + carry:<emp>:<pol>:<ปีY> (CARRY +c ในปี Y · note "expires:YYYY-MM-DD") ·
//     expire:<emp>:<pol>:<ปี> (EXPIRE −สะสมที่ไม่ได้ใช้ · 0.0 ก็เขียน = ประเมินแล้ว) · expire-late:<leaveId> (ปรับ EXPIRE เมื่อใบที่นับเป็นวันสะสมถูกถอนหลังมี expire:) ·
//     carry-out-top:/carry-top:<leaveId> (โอนเพิ่มเมื่อถอนใบปีก่อนหลังยกวันสะสมแล้ว — r3 R2-M2) ·
//     วันสะสมที่ใช้ = min(ยกเข้า, Σ วันใบอนุมัติที่จบภายในวันหมดอายุ) คำนวณทุกครั้ง ไม่จดไว้ (r3 R2-M1)
//   • วันสะสมใช้ได้เฉพาะใบลาที่ "วันสุดท้าย ≤ วันหมดอายุ" และใช้ก่อนวันปกติ (L3) · ยอดของปีไม่ติดลบ (L6) · ไฟล์แนบปิดทั้งหมด (D3)
//   • ลำดับล็อก (R8): hr-leave:<id> → hr-leave-emp:<sys>:<emp> → กุญแจตารางกะ (พนักงาน × วันลา เรียงจากน้อยไปมาก) · ยื่น/งานรายปี = กุญแจพนักงานอย่างเดียว ·
//     สลับกะ = hr-swap:<id> → กุญแจตารางกะ (ไม่แตะกุญแจใบลา) ⇒ ไม่มีวงล็อก · ใต้ล็อกใช้ tx ของผู้เรียกเท่านั้น (§C.8)
//   • นับวัน (R4 · r2 มติ D5): มีกะที่ประกาศแล้ววันนั้น ⇒ นับ (แม้เป็นวันหยุด) · วันหยุดของสาขาในวันนั้น (แถวสาขา/ทั้งร้าน) ⇒ ไม่นับ ·
//     สัปดาห์นั้นมีกะประกาศแล้ววันอื่น ⇒ ไม่นับ · ตารางงานประจำบอกหยุด ⇒ ไม่นับ · นอกนั้นนับ
//   • ผู้อ่าน (R11): เหตุผลการลา/ไฟล์แนบ = เจ้าของร้าน · ผู้จัดการในสาขา · hr.leave.read ในสาขา · ตัวพนักงานเอง · ผู้ยื่นแทน ·
//     hr.leave.decide ในสาขา = แถวไม่มีเหตุผล · คนอื่น = ข้อความเดียวกันทุกไบต์ · ไม่ส่ง attachmentKey/ที่อยู่ไฟล์ออกไป
//   • ปฏิเสธ = LeaveRuleError / TimeRuleError (ข้อความไทยคงที่) — service.ts แปลงเป็น HrLeaveRequestError ◂
import type { HrHalfDay, HrLeaveStatus, HrLeaveType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { lockRosterKeysInTx, unitOfDay } from "./roster";
import { weekdayOfDay, weekStartOf } from "./roster-rules";
import { hrScopeOf, unitTargetOf } from "./scope";
import { employeeUnitsOf, leaveTargetOf } from "./scope"; // HR H2.11 ▸ ด่านสาขาของ decideLeaveAs (ตัวเดียวกับ decideLeaveAction) ◂
import { INBOX_TEXT } from "./inbox-shared"; // HR H2.11 ▸ ข้อความ "ไม่มีสิทธิ์ตัดสิน" ของกล่องคำขอรวม ◂
import { addDays, leaveDaysBetween, TIME_RULE_TEXT, TimeRuleError } from "./time-rules";
import { holidayOfDay, holidayRowsInRange } from "./holidays";
import { thaiDateKey } from "@/lib/ui/date"; // r4: วันที่ยื่นใบลา (ตามปฏิทินไทย)
import { CORRECTION_TEXT } from "./correction-rules"; // HR MONEY-2 ▸ R5: ข้อความ "เดือนนี้อนุมัติเงินเดือนแล้ว" ตัวเดียวกับคำขอแก้เวลา (ไม่คัดลอก) ◂
import {
  carryDays,
  carryExpiryOf,
  countLeaveDays,
  dayKey,
  fmtTenths,
  grantDays,
  hourlyLeaveDays,
  LEAVE_TEXT,
  leaveYearBounds,
  leaveYearOf,
  LeaveRuleError,
  tenthsOf,
} from "./leave-rules";

export { LEAVE_TEXT, LeaveRuleError } from "./leave-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
/** ผู้ดู/ผู้กด — รูปเดียวกับ HrViewer (role · unitAccess · permissions · userId) */
export type LeaveViewer = { role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown; userId?: string | null };

/** event ตัดสินใบลา (consumer ใน outbox-consumers.ts · ป้ายใน automation/labels.ts) */
export const LEAVE_DECIDED_EVENT = "hr.leave.decided";
/** ธุรกรรมใต้ล็อกของการลา (ค่าเดียวกับ LEAVE_LOCK_TX_OPTS ของ service.ts) */
export const LEAVE_TX_OPTS = { maxWait: 20_000, timeout: 60_000 } as const;
/** ผู้ตัดสินของสายอนุมัติ (ค่าเดิมของ approval-effects) */
const ENGINE = "approval-engine";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const memberOf = (v: LeaveViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
const can = (m: MembershipCtx, action: string) => evaluate(m, { module: "hr", action });

// ═══════════════════════════ ล็อก ═══════════════════════════
/** ล็อกต่อพนักงาน (ยื่น · ตัดสิน · ยกเลิก · งานรายปี) — เรียกหลัง hr-leave:<id> (ถ้ามี) และก่อนกุญแจตารางกะ */
export async function lockLeaveEmployeeInTx(tx: Tx, systemId: string, employeeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave-emp:${systemId}:${employeeId}`}, 0))`;
}
/** กุญแจตารางกะของทุกวันในใบลา (พนักงาน × วัน) */
export function leaveRosterKeys(row: { employeeId: string; fromDate: string; toDate: string }): { employeeId: string; date: string }[] {
  const out: { employeeId: string; date: string }[] = [];
  for (let d = row.fromDate, n = 0; d <= row.toDate && n < 367; d = addDays(d, 1), n++) out.push({ employeeId: row.employeeId, date: d });
  return out;
}

// ═══════════════════════════ ประเภทการลา + พนักงาน ═══════════════════════════
const POLICY_SELECT = {
  id: true,
  unitId: true,
  category: true,
  name: true,
  quotaDays: true,
  minServiceDays: true,
  firstYearProrata: true,
  carryMaxDays: true,
  carryExpiresMonthDay: true,
  allowHalfDay: true,
  allowHours: true,
  attachmentAfterDays: true,
  yearStartMonth: true,
  active: true,
  sortOrder: true,
} as const satisfies Prisma.HrLeavePolicySelect;
type PolicyRow = Prisma.HrLeavePolicyGetPayload<{ select: typeof POLICY_SELECT }>;
const EMP_SELECT = {
  id: true,
  name: true,
  linkedUserId: true,
  unitId: true,
  startDate: true,
  endDate: true,
  contractEndAt: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const satisfies Prisma.HrEmployeeSelect;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const isUnlimited = (p: Pick<PolicyRow, "quotaDays">) => p.quotaDays === null;
const ysmOf = (p: Pick<PolicyRow, "yearStartMonth">) => p.yearStartMonth || 1;
const policyOrder = (unit: string | null) => (a: PolicyRow, b: PolicyRow) =>
  Number(b.unitId !== null && b.unitId === unit) - Number(a.unitId !== null && a.unitId === unit) || a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);

// ═══════════════════════════ ยื่น: ตรวจก่อนธุรกรรม (ไม่เขียนอะไร) ═══════════════════════════
export type LeaveRequestFields = {
  employeeId: string;
  type: HrLeaveType;
  fromDate: string | Date;
  toDate: string | Date;
  policyId?: string | null;
  halfDay?: string | null;
  hours?: number | string | null;
  attachmentFileId?: string | null;
};
export type LeaveRequestPlan = {
  employeeId: string;
  emp: EmpRow;
  type: HrLeaveType;
  from: string;
  to: string;
  policy: PolicyRow | null;
  halfDay: HrHalfDay | null;
  hours: number | null;
  leaveYear: number | null;
};

/**
 * R3 ขั้นก่อนธุรกรรม (ลำดับคงที่ · ไม่เขียนอะไร): ช่วงวัน/≤366 → ประเภทการลา → ครึ่งวัน/ชั่วโมง → ปีการลาเดียว → ช่วงการจ้าง → สิทธิ์ตามอายุงาน ·
 * ไม่มีประเภทที่ตรงหมวด (ผู้เรียกรุ่นเก่า) = policy null ⇒ เก็บจำนวนวัน ไม่ลงสมุด (Q18)
 */
export async function planLeaveRequest(ctx: Ctx, input: LeaveRequestFields): Promise<LeaveRequestPlan> {
  const from = dayKey(input.fromDate);
  const to = dayKey(input.toDate);
  leaveDaysBetween(from, to); // ช่วงวันกลับหัว / ยาวเกิน 366 วัน = ข้อความเดิม (TIME_RULE_TEXT)
  const db = tenantDb(ctx);
  const emp = await db.hrEmployee.findFirst({ where: { id: input.employeeId }, select: EMP_SELECT });
  if (!emp) throw new LeaveRuleError(LEAVE_TEXT.policyNf); // ไม่ควรเกิด (service ตรวจพนักงานก่อนแล้ว)
  const unit = unitOfDay(emp, from);
  const pid = str(input.policyId);
  let policy: PolicyRow | null = null;
  if (pid) {
    const p = await db.hrLeavePolicy.findFirst({ where: { id: pid }, select: POLICY_SELECT });
    if (!p || !p.active || (p.unitId !== null && p.unitId !== unit)) throw new LeaveRuleError(LEAVE_TEXT.policyNf);
    policy = p;
  } else {
    const ps = await db.hrLeavePolicy.findMany({ where: { category: input.type, active: true, OR: [{ unitId: null }, ...(unit ? [{ unitId: unit }] : [])] }, select: POLICY_SELECT, take: 100 });
    policy = ps.sort(policyOrder(unit))[0] ?? null;
  }
  if (str(input.attachmentFileId)) throw new LeaveRuleError(LEAVE_TEXT.attachOff); // r2 มติ D3: ไม่รับรหัสไฟล์ใด ๆ
  const half: HrHalfDay | null = input.halfDay === "AM" || input.halfDay === "PM" ? input.halfDay : null;
  const rawHours = input.hours === null || input.hours === undefined || input.hours === "" ? null : Number(input.hours);
  if (half && rawHours !== null) throw new LeaveRuleError(LEAVE_TEXT.halfAndHours);
  if (half && policy && !policy.allowHalfDay) throw new LeaveRuleError(LEAVE_TEXT.halfNotAllowed);
  if (rawHours !== null && !policy?.allowHours) throw new LeaveRuleError(LEAVE_TEXT.hoursNotAllowed);
  if (half && from !== to) throw new TimeRuleError(TIME_RULE_TEXT.halfDayRange);
  if (rawHours !== null) {
    hourlyLeaveDays(rawHours);
    if (from !== to) throw new LeaveRuleError(LEAVE_TEXT.hoursBad);
  }
  let leaveYear: number | null = null;
  if (policy) {
    leaveYear = leaveYearOf(from, ysmOf(policy));
    if (leaveYearOf(to, ysmOf(policy)) !== leaveYear) throw new LeaveRuleError(LEAVE_TEXT.crossYear);
  }
  const last = emp.endDate ?? emp.contractEndAt;
  if ((emp.startDate && from < dayOf(emp.startDate)) || (last && to > dayOf(last))) throw new LeaveRuleError(LEAVE_TEXT.outOfEmployment);
  if (policy && leaveYear !== null) {
    const g = grantDays(policy, emp.startDate, leaveYear, ysmOf(policy));
    if (!g.eligible) throw new LeaveRuleError(g.code === "NO_START" ? LEAVE_TEXT.noStart : LEAVE_TEXT.notEligible);
    if (from < g.effectiveDate) throw new LeaveRuleError(LEAVE_TEXT.notEligible);
  }
  return {
    employeeId: emp.id,
    emp,
    type: policy?.category ?? input.type,
    from,
    to,
    policy,
    halfDay: half,
    hours: rawHours,
    leaveYear,
  };
}

// ═══════════════════════════ นับวัน (R4) — ใน tx ของผู้เรียก ═══════════════════════════
async function leaveDaysInTx(tx: Tx, emp: Pick<EmpRow, "id" | "unitId" | "units">, from: string, to: string, half: HrHalfDay | null, hours: number | null): Promise<string> {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 367; d = addDays(d, 1)) days.push(d);
  const unitByDay = new Map(days.map((d) => [d, unitOfDay(emp, d)]));
  const hrows = await holidayRowsInRange(tx, from, to, [...new Set(unitByDay.values())]);
  const holidays = new Set(days.filter((d) => holidayOfDay(hrows, unitByDay.get(d) ?? null, d)));
  const wFrom = weekStartOf(from);
  const wTo = addDays(weekStartOf(to), 6);
  const entries = await tx.hrRosterEntry.findMany({
    where: { employeeId: emp.id, published: true, date: { gte: dbDate(wFrom), lte: dbDate(wTo) } },
    select: { date: true },
    take: 1000,
  });
  const rostered = new Set(entries.map((e) => dayOf(e.date)));
  const rosterWeeks = new Set([...rostered].map((d) => weekStartOf(d)));
  for (const d of rostered) holidays.delete(d); // r2 มติ D5: มีกะที่ประกาศแล้ววันนั้น = ถูกจัดให้ทำงาน ⇒ นับเป็นวันลา (HQ23 ยืนยันกับที่ปรึกษาแรงงาน)
  const sched = await tx.hrWorkSchedule.findMany({ where: { employeeId: emp.id }, select: { weekday: true, dayOff: true } });
  const offWd = new Set(sched.filter((s) => s.dayOff).map((s) => s.weekday));
  const daysOff = new Set(days.filter((d) => !holidays.has(d) && !rostered.has(d) && (rosterWeeks.has(weekStartOf(d)) || offWd.has(weekdayOfDay(d)))));
  return countLeaveDays({ from, to, halfDay: half, hours, holidays, daysOff });
}

// ═══════════════════════════ สมุดวันลา ═══════════════════════════
type TxnKind = "GRANT" | "USE" | "CARRY" | "EXPIRE" | "ADJUST";
async function insertTxn(
  tx: Tx,
  ctx: Ctx,
  row: { employeeId: string; policyId: string; kind: TxnKind; tenths: number; leaveYear: number; effectiveDate: string; sourceKey: string; leaveId?: string | null; note?: string | null },
): Promise<number> {
  const r = await tx.hrLeaveBalanceTxn.createMany({
    data: [
      {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        employeeId: row.employeeId,
        policyId: row.policyId,
        kind: row.kind,
        days: fmtTenths(row.tenths),
        leaveYear: row.leaveYear,
        effectiveDate: dbDate(row.effectiveDate),
        sourceKey: row.sourceKey,
        leaveId: row.leaveId ?? null,
        note: row.note ?? null,
      },
    ],
    skipDuplicates: true, // แถวแรกชนะ (unique systemId+sourceKey) — ส่งซ้ำ/พร้อมกัน = ไม่เพิ่ม
  });
  return r.count;
}
/** GRANT ของปีนั้น (ถ้ายังไม่มี · มีสิทธิ์ · มีโควตา) — onlyIfEffective: งานรายปีเขียนเมื่อถึงวันมีสิทธิ์แล้วเท่านั้น */
async function ensureGrantInTx(tx: Tx, ctx: Ctx, emp: Pick<EmpRow, "id" | "startDate">, policy: PolicyRow, year: number, onlyIfEffectiveBy?: string): Promise<number> {
  if (isUnlimited(policy)) return 0;
  const g = grantDays(policy, emp.startDate, year, ysmOf(policy));
  if (!g.eligible || g.days === null) return 0;
  if (onlyIfEffectiveBy && g.effectiveDate > onlyIfEffectiveBy) return 0;
  return insertTxn(tx, ctx, { employeeId: emp.id, policyId: policy.id, kind: "GRANT", tenths: tenthsOf(g.days), leaveYear: year, effectiveDate: g.effectiveDate, sourceKey: `grant:${emp.id}:${policy.id}:${year}` });
}

// note ของแถว: CARRY เข้า (carry:<…>) "expires:YYYY-MM-DD" = วันหมดอายุที่ตรึงไว้ตอนยก (ไม่มี = ไม่หมดอายุ)
//   r3 (มติ R2-M1) · r4: "ใช้วันสะสมไปเท่าไร" คำนวณเสมอ ไม่จดไว้ — consumed = min(ยกเข้า, Σ วันของใบที่อนุมัติอยู่ (ไม่ถูกถอน) ที่จบ และยื่น ภายในวันหมดอายุ)
const EXPIRES_NOTE = /^expires:(\d{4}-\d{2}-\d{2})$/;
/** สถานะของปีการลา 1 ปี (พนักงาน × ประเภท) จาก Σ แถว — ไม่มีตัวนับ */
export type LeaveYearState = {
  /** Σ ทุกแถวของปีนั้น (สิบส่วน) */
  sum: number;
  /** มีแถว carry:<…>:<ปี> แล้ว (ยกเข้าแล้ว · 0.0 ก็นับ) */
  carried: boolean;
  /** วันสะสมที่ยกเข้า = Σ แถว CARRY ที่เป็นบวกของปีนี้ (carry: + carry-top:) */
  carryIn: number;
  /** วันหมดอายุของวันสะสมที่ยกเข้า (null = ไม่หมดอายุ / ไม่มีวันสะสม) */
  expiry: string | null;
  /** มีแถว expire:<…>:<ปี> แล้ว */
  expiredDone: boolean;
  /** −Σ EXPIRE ของปีนี้ (หลัก + ปรับย้อนหลัง) */
  expired: number;
  /** วันสะสมที่ถูกใช้ (คำนวณ) = min(carryIn, Σ วันใบอนุมัติที่จบภายในวันหมดอายุ) */
  consumed: number;
  /** EXPIRE ที่ "ควรเป็น" รวมทั้งปี = carryIn − consumed */
  expireDue: number;
  /** วันสะสมที่ยังไม่หมดอายุและยังไม่ถูกใช้ = max(0, carryIn − consumed − expired) */
  carryLeft: number;
  /** วันที่ใบลาที่จบหลังวันหมดอายุใช้ได้ = Σ − carryLeft */
  nonCarry: number;
};
export async function leaveYearStateInTx(tx: Tx, employeeId: string, policyId: string, year: number): Promise<LeaveYearState> {
  const rows = await tx.hrLeaveBalanceTxn.findMany({ where: { employeeId, policyId, leaveYear: year }, select: { kind: true, days: true, sourceKey: true, note: true }, take: 5000 });
  const reverted = new Set(rows.filter((r) => r.sourceKey.startsWith("use-revert:")).map((r) => r.sourceKey.slice("use-revert:".length)));
  let sum = 0;
  let carryIn = 0;
  let carried = false;
  let expiry: string | null = null;
  let expiredDone = false;
  let expired = 0;
  const uses = new Map<string, number>(); // leaveId → วัน (ใบที่อนุมัติอยู่)
  const inKey = `carry:${employeeId}:${policyId}:${year}`;
  for (const r of rows) {
    const t = tenthsOf(r.days);
    sum += t;
    if (r.kind === "CARRY" && t > 0) carryIn += t;
    if (r.sourceKey === inKey) {
      carried = true;
      expiry = EXPIRES_NOTE.exec(r.note ?? "")?.[1] ?? null;
    } else if (r.kind === "USE" && r.sourceKey.startsWith("use:") && !reverted.has(r.sourceKey.slice(4))) {
      uses.set(r.sourceKey.slice(4), -t);
    } else if (r.kind === "EXPIRE") {
      expired += -t;
      if (r.sourceKey === `expire:${employeeId}:${policyId}:${year}`) expiredDone = true;
    }
  }
  let pre = 0;
  if (carryIn > 0 && uses.size) {
    const ls = await tx.hrLeave.findMany({ where: { id: { in: [...uses.keys()] } }, select: { id: true, toDate: true, createdAt: true }, take: 5000 });
    const of = new Map(ls.map((l) => [l.id, { to: dayOf(l.toDate), filed: thaiDateKey(l.createdAt) }]));
    for (const [id, d] of uses) {
      const l = of.get(id);
      if (expiry === null || (l !== undefined && l.to <= expiry && l.filed <= expiry)) pre += d; // r4: ยื่นหลังวันหมดอายุ ไม่ใช้วันสะสม
    }
  }
  const consumed = Math.min(carryIn, Math.max(0, pre));
  const expireDue = carryIn - consumed;
  const carryLeft = Math.max(0, expireDue - expired);
  return { sum, carried, carryIn, expiry, expiredDone, expired, consumed, expireDue, carryLeft, nonCarry: sum - carryLeft };
}
/** ใบลาที่จบภายในวันหมดอายุ ⇒ ใช้วันสะสมได้ (L3) */
/** r4 (มติ 1): ใช้วันสะสมได้เฉพาะใบที่ "จบภายในวันหมดอายุ และยื่นภายในวันหมดอายุ" — ยื่นหลังหมดอายุ = หักวันปกติเท่านั้น */
const carryEligible = (toDate: string, filedOn: string, st: Pick<LeaveYearState, "expiry">) => st.expiry === null || (toDate <= st.expiry && filedOn <= st.expiry);
/** ล็อกแถวประเภทการลาแบบ FOR SHARE (r4 มติ 2) — ตั้งค่าโควตา (FOR UPDATE) กับการอนุมัติ/ยื่นไม่สวนกัน · คืนค่าล่าสุดของแถว */
async function policyForShareInTx(tx: Tx, policyId: string): Promise<PolicyRow | null> {
  await tx.$queryRaw`SELECT id FROM "HrLeavePolicy" WHERE id = ${policyId} FOR SHARE`;
  return tx.hrLeavePolicy.findFirst({ where: { id: policyId }, select: POLICY_SELECT });
}

/**
 * R3 ขั้นในธุรกรรม (ผู้เรียกถือ hr-leave-emp:<sys>:<emp> แล้ว): ซ้อนใบเดิม (Q13 — ครึ่งเช้า+ครึ่งบ่ายวันเดียวกันได้) → จำนวนวัน > 0 →
 * GRANT (ถ้ายังไม่มี) → จองยอด (Q3 · ไม่จำกัด = ข้าม): Σ ใบรออนุมัติ + ใบนี้ ≤ Σ ปีนั้น และ ส่วนที่ใช้วันสะสมไม่ได้ (จบหลังวันหมดอายุ) ≤ วันปกติ (L3) ·
 * คืน { days, fields = คอลัมน์ H1.2 ของแถวใหม่ } (ไฟล์แนบปิด — D3)
 */
export async function reserveLeaveInTx(
  tx: Tx,
  ctx: Ctx,
  plan: LeaveRequestPlan,
): Promise<{ days: string; fields: { policyId: string | null; days: string; halfDay: HrHalfDay | null; hours: number | null } }> {
  const others = await tx.hrLeave.findMany({
    where: { employeeId: plan.employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dbDate(plan.to) }, toDate: { gte: dbDate(plan.from) } },
    select: { fromDate: true, toDate: true, halfDay: true },
    take: 50,
  });
  const halfPair = (o: (typeof others)[number]) =>
    !!plan.halfDay && plan.from === plan.to && !!o.halfDay && dayOf(o.fromDate) === plan.from && dayOf(o.toDate) === plan.from && o.halfDay !== plan.halfDay;
  if (others.some((o) => !halfPair(o))) throw new LeaveRuleError(LEAVE_TEXT.overlap);
  const days = await leaveDaysInTx(tx, plan.emp, plan.from, plan.to, plan.halfDay, plan.hours);
  if (tenthsOf(days) <= 0) throw new LeaveRuleError(LEAVE_TEXT.zeroDays);
  if (plan.policy && plan.leaveYear !== null) {
    const live = await policyForShareInTx(tx, plan.policy.id); // r4 มติ 2 · r5: ล็อกแถวก่อน แล้ว GRANT จากค่าล่าสุดใต้ล็อก
    if (live) await ensureGrantInTx(tx, ctx, plan.emp, live, plan.leaveYear);
    if (live && !isUnlimited(live)) {
      const st = await leaveYearStateInTx(tx, plan.employeeId, plan.policy.id, plan.leaveYear);
      const today = thaiDateKey(new Date());
      const b = leaveYearBounds(plan.leaveYear, ysmOf(plan.policy));
      const pend = await tx.hrLeave.findMany({
        where: { employeeId: plan.employeeId, policyId: plan.policy.id, status: "PENDING", fromDate: { gte: dbDate(b.from), lte: dbDate(b.to) } },
        select: { toDate: true, days: true, createdAt: true },
        take: 1000,
      });
      let all = tenthsOf(days);
      let late = carryEligible(plan.to, today, st) ? 0 : tenthsOf(days);
      for (const p of pend) {
        all += tenthsOf(p.days);
        if (!carryEligible(dayOf(p.toDate), thaiDateKey(p.createdAt), st)) late += tenthsOf(p.days);
      }
      if (all > st.sum || late > st.nonCarry) throw new LeaveRuleError(LEAVE_TEXT.balance);
    }
  }
  return { days, fields: { policyId: plan.policy?.id ?? null, days, halfDay: plan.halfDay, hours: plan.hours } };
}

// ═══════════════════════════ ตัดสิน: ตัวช่วยในธุรกรรมของผู้เรียก ═══════════════════════════
export type LeaveLedgerRow = {
  id: string;
  employeeId: string;
  status: HrLeaveStatus;
  fromDate: string;
  toDate: string;
  days: string | null;
  halfDay: HrHalfDay | null;
  hours: number | null;
  policy: PolicyRow | null;
  startDate: Date | null;
  /** r4: วันสิ้นสุดการจ้าง (endDate ?? contractEndAt) · วันที่ยื่น (ปฏิทินไทย) */
  lastDay: string | null;
  filedOn: string;
  emp: Pick<EmpRow, "id" | "unitId" | "units">;
};
/** ใบลา (ใน tx) สำหรับสมุด/ล็อก/event — null = ไม่พบในระบบนี้ */
export async function leaveRowInTx(tx: Tx, leaveId: string): Promise<LeaveLedgerRow | null> {
  const l = await tx.hrLeave.findFirst({
    where: { id: leaveId },
    select: {
      id: true,
      employeeId: true,
      status: true,
      fromDate: true,
      toDate: true,
      days: true,
      halfDay: true,
      hours: true,
      policy: { select: POLICY_SELECT },
      createdAt: true,
      employee: { select: { startDate: true, endDate: true, contractEndAt: true, unitId: true, units: EMP_SELECT.units } },
    },
  });
  if (!l) return null;
  return {
    id: l.id,
    employeeId: l.employeeId,
    status: l.status,
    fromDate: dayOf(l.fromDate),
    toDate: dayOf(l.toDate),
    days: l.days === null ? null : fmtTenths(tenthsOf(l.days)),
    halfDay: l.halfDay,
    hours: l.hours === null ? null : Number(String(l.hours)),
    policy: l.policy,
    startDate: l.employee.startDate,
    lastDay: (() => {
      const d = l.employee.endDate ?? l.employee.contractEndAt;
      return d ? dayOf(d) : null;
    })(),
    filedOn: thaiDateKey(l.createdAt),
    emp: { id: l.employeeId, unitId: l.employee.unitId, units: l.employee.units },
  };
}
export type LeaveApprovalCheck = { ok: true; row: LeaveLedgerRow } | { ok: false; code: "BALANCE" | "ZERO_DAYS" | "OUT_OF_EMPLOYMENT" };
/**
 * อนุมัติได้ไหม (R6 · r2 มติ D1): ผู้เรียกถือ hr-leave → emp → กุญแจตารางกะแล้ว ⇒ นับวันใหม่ (วันหยุด/ตารางกะที่เพิ่มหลังยื่น) ·
 * 0 วัน = ZERO_DAYS · ใบรุ่นเก่า/ไม่จำกัด = ได้ · อื่น ๆ = GRANT (ถ้ายังไม่มี) แล้ว: จบภายในวันหมดอายุ ⇒ วัน ≤ Σ · จบหลังวันหมดอายุ ⇒ วัน ≤ วันปกติ (L3) ·
 * คืนแถวที่มีจำนวนวันใหม่ — ผู้เรียกเขียน days ลงใบลาในคำสั่งเปลี่ยนสถานะ และ USE ใช้ค่านี้
 */
export async function leaveApprovalCheckInTx(tx: Tx, ctx: Ctx, row: LeaveLedgerRow): Promise<LeaveApprovalCheck> {
  // r4 มติ 3a: ช่วงการจ้างตรวจซ้ำตอนอนุมัติ (วันสิ้นสุดอาจถูกบันทึกหลังยื่น) — นอกช่วง = ไม่อนุมัติ ไม่เขียน USE
  if ((row.startDate && row.fromDate < dayOf(row.startDate)) || (row.lastDay && row.toDate > row.lastDay)) return { ok: false, code: "OUT_OF_EMPLOYMENT" };
  // r4 มติ 2: ลำดับล็อก hr-leave → emp → กุญแจตารางกะ → แถวประเภทการลา (FOR SHARE) · หน้าตั้งค่าถือแถวนี้ FOR UPDATE โดยไม่ถือ advisory lock ใด ⇒ ไม่มีวงล็อก
  const live = row.policy ? await policyForShareInTx(tx, row.policy.id) : null;
  let r: LeaveLedgerRow = row.policy && live ? { ...row, policy: live } : row;
  if (row.days !== null) {
    const days = await leaveDaysInTx(tx, row.emp, row.fromDate, row.toDate, row.halfDay, row.hours);
    if (tenthsOf(days) <= 0) return { ok: false, code: "ZERO_DAYS" };
    r = { ...r, days };
  }
  if (!r.policy || r.days === null || isUnlimited(r.policy)) return { ok: true, row: r };
  const year = leaveYearOf(r.fromDate, ysmOf(r.policy));
  await ensureGrantInTx(tx, ctx, { id: r.employeeId, startDate: r.startDate }, r.policy, year);
  const st = await leaveYearStateInTx(tx, r.employeeId, r.policy.id, year);
  const need = tenthsOf(r.days);
  return (carryEligible(r.toDate, r.filedOn, st) ? need <= st.sum : need <= st.nonCarry) ? { ok: true, row: r } : { ok: false, code: "BALANCE" };
}
/**
 * สมุดตามการเปลี่ยนสถานะ: →APPROVED = USE · APPROVED→(REJECTED|CANCELLED) = คืนครั้งเดียว เข้าปี/ประเภทของแถว USE เสมอ (L5) ·
 * r3/r4: ใบที่นับเป็นวันสะสม (จบ+ยื่นภายในวันหมดอายุ) ถูกถอนหลังมีแถว expire: ของปีนั้นแล้ว ⇒ expire-late:<leaveId> ให้ Σ EXPIRE = ยกเข้า − min(ยกเข้า, วันที่นับ)
 *   ใน tx เดียวกัน · ครั้งเดียวต่อใบ (ใบที่ยื่นหลังวันหมดอายุไม่ใช้วันสะสม จึงไม่มีการปรับตอนอนุมัติ — r4 มติ 1) ·
 * r3 (มติ R2-M2): ถอนใบของปี Y หลังยกวันสะสม Y→Y+1 ไปแล้ว (มี carry:<…>:<Y+1>) และวันสะสมของ Y+1 ยังไม่หมดอายุ (ยังไม่มี expire:<…>:<Y+1>) ⇒
 *   โอนเพิ่มใน tx เดียวกัน carry-out-top:<leaveId> (−t ปี Y) + carry-top:<leaveId> (+t ปี Y+1) · t = min(วันที่คืน, เพดาน − ยกไปแล้ว, Σ ปี Y) ·
 *   หมดอายุแล้ว = ไม่โอน (วันคืนอยู่ในปี Y ซึ่งปิดแล้ว) · อื่น ๆ = ไม่เขียน
 */
export async function leaveLedgerInTx(tx: Tx, ctx: Ctx, row: LeaveLedgerRow, from: string, to: string): Promise<void> {
  if (to === "APPROVED" && from !== "APPROVED") {
    if (!row.policy || row.days === null) return; // ใบรุ่นเก่า (Q18)
    const year = leaveYearOf(row.fromDate, ysmOf(row.policy));
    const base = { employeeId: row.employeeId, policyId: row.policy.id, leaveYear: year, effectiveDate: row.fromDate, leaveId: row.id };
    await insertTxn(tx, ctx, { ...base, kind: "USE", tenths: -tenthsOf(row.days), sourceKey: `use:${row.id}` }); // r4: ไม่มี expire-use (ใบที่ยื่นหลังหมดอายุไม่ใช้วันสะสม)
    return;
  }
  if (from === "APPROVED" && (to === "REJECTED" || to === "CANCELLED")) {
    const use = await tx.hrLeaveBalanceTxn.findFirst({ where: { sourceKey: `use:${row.id}` }, select: { days: true, leaveYear: true, policyId: true, employeeId: true } });
    if (!use) return;
    const base = { employeeId: use.employeeId, policyId: use.policyId, leaveYear: use.leaveYear, effectiveDate: row.fromDate, leaveId: row.id };
    const back = -tenthsOf(use.days);
    const n = await insertTxn(tx, ctx, { ...base, kind: "ADJUST", tenths: back, sourceKey: `use-revert:${row.id}` });
    if (n !== 1) return;
    await expireAdjustInTx(tx, ctx, base, row.toDate, row.filedOn, `expire-late:${row.id}`);
    // R2-M2: เติมการยกวันสะสมเข้าปีถัดไป (ถ้ายกไปแล้วและยังไม่หมดอายุ)
    const next = use.leaveYear + 1;
    const pre = `${use.employeeId}:${use.policyId}:${next}`;
    const carryRow = await tx.hrLeaveBalanceTxn.findFirst({ where: { sourceKey: `carry:${pre}` }, select: { effectiveDate: true } });
    const expRow = carryRow ? await tx.hrLeaveBalanceTxn.findFirst({ where: { sourceKey: `expire:${pre}` }, select: { id: true } }) : null;
    const pol = carryRow && !expRow ? await tx.hrLeavePolicy.findFirst({ where: { id: use.policyId }, select: { carryMaxDays: true } }) : null;
    if (!carryRow || expRow || !pol) return;
    const cur = await leaveYearStateInTx(tx, use.employeeId, use.policyId, use.leaveYear);
    const nxt = await leaveYearStateInTx(tx, use.employeeId, use.policyId, next);
    const t = Math.min(back, tenthsOf(pol.carryMaxDays) - nxt.carryIn, cur.sum);
    if (t <= 0) return;
    await insertTxn(tx, ctx, { ...base, kind: "CARRY", tenths: -t, effectiveDate: addDays(dayOf(carryRow.effectiveDate), -1), sourceKey: `carry-out-top:${row.id}` });
    await insertTxn(tx, ctx, { ...base, leaveYear: next, kind: "CARRY", tenths: t, effectiveDate: dayOf(carryRow.effectiveDate), sourceKey: `carry-top:${row.id}` });
  }
}
/** ปรับ EXPIRE ของปีนั้นให้ตรงสูตร (เฉพาะเมื่อมีแถว expire: แล้ว และใบจบภายในวันหมดอายุ) — 0 = ไม่เขียน */
async function expireAdjustInTx(
  tx: Tx,
  ctx: Ctx,
  base: { employeeId: string; policyId: string; leaveYear: number; leaveId: string },
  toDate: string,
  filedOn: string,
  sourceKey: string,
): Promise<void> {
  const st = await leaveYearStateInTx(tx, base.employeeId, base.policyId, base.leaveYear);
  if (!st.expiredDone || !st.expiry || toDate > st.expiry || filedOn > st.expiry) return; // ใบที่ไม่เคยนับเป็นวันสะสม ⇒ ไม่ปรับ
  const delta = st.expireDue - st.expired;
  if (delta === 0) return;
  await insertTxn(tx, ctx, { ...base, effectiveDate: addDays(st.expiry, 1), kind: "EXPIRE", tenths: -delta, sourceKey });
}
/** event hr.leave.decided (R12) — payload id/วัน/สถานะเท่านั้น · 1 ใบ × 1 สถานะ = 1 แถวตลอดกาล */
export function leaveDecidedEvent(ctx: Ctx, row: Pick<LeaveLedgerRow, "id" | "employeeId" | "fromDate" | "toDate" | "days">, status: string, previousStatus: string | null) {
  return {
    tenantId: ctx.tenantId,
    type: LEAVE_DECIDED_EVENT,
    idempotencyKey: `${LEAVE_DECIDED_EVENT}#${row.id}#${status}`,
    systemId: ctx.systemId,
    payload: { leaveId: row.id, systemId: ctx.systemId, employeeId: row.employeeId, status, previousStatus, fromDate: row.fromDate, toDate: row.toDate, days: row.days },
  };
}

// ═══════════════════════════ ผลของสายอนุมัติ (R7) ═══════════════════════════
/**
 * ใช้ผลคำขออนุมัติชนิด HrLeave — ธุรกรรมเดียว ลำดับล็อกเดียวกับ decideLeave · ใบไม่ใช่ PENDING / คำขอไม่ตรงผล = ไม่ทำอะไร (ส่งซ้ำปลอดภัย) ·
 * อนุมัติแต่วันลาไม่พอ = ใบลา CANCELLED + audit รหัส BALANCE · นับวันใหม่ได้ 0 = CANCELLED + audit รหัส ZERO_DAYS (ไม่ throw — Q4 · D1) ·
 * ข้อผิดพลาดของฐานข้อมูล = throw ⇒ event retry
 */
export async function applyLeaveDecision(input: { tenantId: string; systemId: string; leaveId: string; requestId: string; approved: boolean }): Promise<{ applied: boolean; code?: "BALANCE" | "ZERO_DAYS" | "OUT_OF_EMPLOYMENT" | "PAID" }> { // HR MONEY-2 ▸ R5 + PAID ◂
  const ctx: Ctx = { tenantId: str(input?.tenantId), systemId: str(input?.systemId) };
  const id = str(input?.leaveId);
  const requestId = str(input?.requestId);
  if (!ctx.tenantId || !ctx.systemId || !id || !requestId) return { applied: false };
  const approved = input.approved === true;
  type Out = { kind: "noop" } | { kind: "refused"; code: "BALANCE" | "ZERO_DAYS" | "OUT_OF_EMPLOYMENT" | "PAID" } | { kind: "done"; status: string }; // HR MONEY-2 ▸ + PAID ◂
  const out: Out = await tenantDb(ctx).$transaction(async (t): Promise<Out> => {
    const tx = t as unknown as Tx;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave:${id}`}, 0))`;
    let row = await leaveRowInTx(tx, id);
    if (!row || row.status !== "PENDING") return { kind: "noop" };
    const req = await tx.approvalRequest.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, entityType: "HrLeave", entityId: id }, select: { status: true } });
    if (!req || req.status !== (approved ? "APPROVED" : "REJECTED")) return { kind: "noop" };
    await lockLeaveEmployeeInTx(tx, ctx.systemId, row.employeeId);
    await lockRosterKeysInTx(tx, ctx.systemId, leaveRosterKeys(row));
    if (approved && (await leavePaidRunRefusalInTx(tx, ctx, id))) { // HR MONEY-2 ▸ R5: ลาไม่รับค่าจ้างในเดือนที่อนุมัติเงินเดือนแล้ว ⇒ ใบลา CANCELLED + audit รหัส PAID ◂
      const c = await tx.hrLeave.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } }); // HR MONEY-2 ◂
      return c.count === 1 ? { kind: "refused", code: "PAID" } : { kind: "noop" }; // HR MONEY-2 ◂
    } // HR MONEY-2 ◂
    if (approved) {
      const chk = await leaveApprovalCheckInTx(tx, ctx, row);
      if (!chk.ok) {
        const c = await tx.hrLeave.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
        return c.count === 1 ? { kind: "refused", code: chk.code } : { kind: "noop" };
      }
      row = chk.row;
    }
    const status = approved ? "APPROVED" : "REJECTED";
    const u = await tx.hrLeave.updateMany({ where: { id, status: "PENDING" }, data: { status, decidedById: ENGINE, ...(approved && row.days !== null ? { days: row.days } : {}) } });
    if (u.count !== 1) return { kind: "noop" };
    await leaveLedgerInTx(tx, ctx, row, "PENDING", status);
    await emitOutbox(tx, leaveDecidedEvent(ctx, row, status, "PENDING"));
    return { kind: "done", status };
  }, LEAVE_TX_OPTS);
  if (out.kind === "refused") {
    await writeAudit({ tenantId: ctx.tenantId, actorType: "SYSTEM", actorId: null, action: "hr.leave.apply_refused", targetType: "HrLeave", targetId: id, after: { leaveId: id, requestId, code: out.code } });
    return { applied: false, code: out.code };
  }
  if (out.kind === "done") {
    await writeAudit({ tenantId: ctx.tenantId, actorType: "SYSTEM", actorId: null, action: "hr.leave.decide", targetType: "HrLeave", targetId: id, before: { status: "PENDING" }, after: { status: out.status, decidedById: ENGINE, requestId } });
    return { applied: true };
  }
  return { applied: false };
}

// ═══════════════════════════ งานรายปี (R9 · r2 มติ L2/L4/L7) ═══════════════════════════
export type LeaveYearJobResult = { granted: number; carried: number; expired: number; txs: number; waited: number; more: boolean; failed: number; failedError?: string };
/** เพดานธุรกรรมต่อรอบต่อระบบ (L7) — ที่เหลือทำรอบถัดไป */
export const LEAVE_JOB_MAX_TX = 100;
type JobPolicy = PolicyRow;
type PendRow = { employeeId: string; policyId: string | null; fromDate: Date; toDate: Date; createdAt: Date };
/**
 * ต่อ (พนักงาน × ประเภท) ของปีการลา Y = leaveYearOf(asOf):
 *   GRANT(Y) เมื่อถึงวันมีสิทธิ์ ·
 *   ยกวันสะสม (เพดาน > 0) = โอนในธุรกรรมเดียว carry-out −c (ปี Y−1) + carry +c (ปี Y · ตรึงวันหมดอายุ) · c = min(เพดาน, Σ ปี Y−1 หลังปิดวันหมดอายุของปี Y−1) ·
 *     รอ (ข้าม) ขณะพนักงานมีใบ PENDING ของประเภทนั้นในปี Y−1 (L2) ·
 *   หลังวันหมดอายุ: EXPIRE = วันสะสมที่ยังไม่ได้ใช้ (0.0 ก็เขียน) · รอขณะมีใบ PENDING ที่จบภายในวันหมดอายุ (L4) ·
 * เงียบ (L7): คิดจากแถวที่มีอยู่ก่อนเปิดธุรกรรม — พนักงานที่ครบแล้ว/ยังไม่ถึงสิทธิ์/กำลังรอ = ไม่เปิดธุรกรรม · ≤ maxTx ธุรกรรมต่อรอบ (more = ยังมีงานค้าง) ·
 * ใต้กุญแจพนักงานตรวจซ้ำทุกเงื่อนไข · แถวแรกชนะ ⇒ รันซ้ำ = ไม่เปลี่ยน
 */
export async function runLeaveYearJob(input: { tenantId: string; systemId: string; asOf: string | Date; maxTx?: number }): Promise<LeaveYearJobResult> {
  const ctx: Ctx = { tenantId: str(input?.tenantId), systemId: str(input?.systemId) };
  const asOf = dayKey(input.asOf);
  const maxTx = Number.isInteger(input?.maxTx) && (input.maxTx as number) > 0 ? (input.maxTx as number) : LEAVE_JOB_MAX_TX;
  const res: LeaveYearJobResult = { granted: 0, carried: 0, expired: 0, txs: 0, waited: 0, more: false, failed: 0 };
  if (!ctx.tenantId || !ctx.systemId) return res;
  const db = tenantDb(ctx);
  const policies = await db.hrLeavePolicy.findMany({ where: { active: true }, select: POLICY_SELECT, take: 200 });
  if (policies.length === 0) return res;
  const emps = await db.hrEmployee.findMany({
    where: { active: true, OR: [{ employmentStatus: null }, { employmentStatus: { not: "ENDED" } }] },
    select: { id: true, unitId: true, startDate: true, endDate: true, contractEndAt: true },
    orderBy: { id: "asc" },
    take: 5000,
  });
  // r4 มติ 3b · r5: พนักงานที่สิ้นสุดการจ้าง (endDate ?? contractEndAt — กติกาเดียวกับตอนอนุมัติ) ก่อนวันเริ่มปีการลา = ไม่มี GRANT/ยกวันสะสมของปีนั้น
  const forEmp = (e: { unitId: string | null; endDate: Date | null; contractEndAt: Date | null }) => {
    const last = e.endDate ?? e.contractEndAt;
    return policies.filter((p) => (p.unitId === null || p.unitId === e.unitId) && !(last && dayOf(last) < leaveYearBounds(leaveYearOf(asOf, ysmOf(p)), ysmOf(p)).from));
  };
  /** r5 มติ 2: จุดสิ้นสุด "ยื่นภายในวันหมดอายุ" = เที่ยงคืนต้นวันถัดไปตามเวลาไทย */
  const filedByEnd = (exp: string) => new Date(Date.parse(`${addDays(exp, 1)}T00:00:00+07:00`));
  const carryCap = (p: JobPolicy) => tenthsOf(p.carryMaxDays);
  const yearOf = (p: JobPolicy) => leaveYearOf(asOf, ysmOf(p));
  const grantKey = (e: { id: string; startDate: Date | null }, p: JobPolicy) => {
    if (isUnlimited(p)) return null;
    const g = grantDays(p, e.startDate, yearOf(p), ysmOf(p));
    return g.eligible && g.days !== null && g.effectiveDate <= asOf ? `grant:${e.id}:${p.id}:${yearOf(p)}` : null; // ยังไม่ถึงสิทธิ์ = ไม่ต้องการแถว (ไม่เปิดธุรกรรม)
  };
  const keys = emps.flatMap((e) =>
    forEmp(e).flatMap((p) => [grantKey(e, p), ...(carryCap(p) > 0 ? [`carry:${e.id}:${p.id}:${yearOf(p)}`, `expire:${e.id}:${p.id}:${yearOf(p)}`] : [])].filter((k): k is string => !!k)),
  );
  const have = new Map<string, string | null>();
  for (let i = 0; i < keys.length; i += 5000) {
    const rows = await db.hrLeaveBalanceTxn.findMany({ where: { sourceKey: { in: keys.slice(i, i + 5000) } }, select: { sourceKey: true, note: true }, take: 5000 });
    for (const r of rows) have.set(r.sourceKey, r.note);
  }
  const pending: PendRow[] = await db.hrLeave.findMany({ where: { status: "PENDING", policyId: { not: null } }, select: { employeeId: true, policyId: true, fromDate: true, toDate: true, createdAt: true }, take: 20_000 });
  /** toBy = วันหมดอายุ ⇒ นับเฉพาะใบที่จบ และยื่น ภายในวันหมดอายุ (r5 มติ 2 — ใบยื่นช้าใช้วันสะสมไม่ได้ จึงไม่รั้ง EXPIRE) */
  const pendOf = (empId: string, p: JobPolicy, year: number, toBy?: string) => {
    const b = leaveYearBounds(year, ysmOf(p));
    return pending.some(
      (l) => l.employeeId === empId && l.policyId === p.id && dayOf(l.fromDate) >= b.from && dayOf(l.fromDate) <= b.to && (!toBy || (dayOf(l.toDate) <= toBy && l.createdAt < filedByEnd(toBy))),
    );
  };
  /** งานที่ยังต้องทำของ (พนักงาน × ประเภท): "work" = เปิดธุรกรรม · "wait" = รอใบ PENDING · "none" = ครบ/ไม่ต้องทำ */
  const need = (e: { id: string; startDate: Date | null }, p: JobPolicy): "work" | "wait" | "none" => {
    const gk = grantKey(e, p);
    const y = yearOf(p);
    let work = !!gk && !have.has(gk);
    let wait = false;
    if (carryCap(p) > 0) {
      const ck = `carry:${e.id}:${p.id}:${y}`;
      if (!have.has(ck)) {
        if (pendOf(e.id, p, y - 1)) wait = true;
        else work = true;
      } else {
        const exp = EXPIRES_NOTE.exec(have.get(ck) ?? "")?.[1] ?? null;
        if (exp && asOf > exp && !have.has(`expire:${e.id}:${p.id}:${y}`)) {
          if (pendOf(e.id, p, y, exp)) wait = true;
          else work = true;
        }
      }
    }
    return work ? "work" : wait ? "wait" : "none";
  };
  for (const e of emps) {
    const states = forEmp(e).map((p) => need(e, p));
    if (!states.includes("work")) {
      if (states.includes("wait")) res.waited++;
      continue;
    }
    if (res.txs >= maxTx) {
      res.more = true;
      break;
    }
    res.txs++;
    // r3 (review MINOR): ธุรกรรมของพนักงานคนหนึ่งล้ม = ข้ามคนนั้น ทำคนถัดไป (นับ failed + ข้อความแรก · ผู้เรียก log ครั้งเดียว) — รอบถัดไปลองใหม่
    const r = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockLeaveEmployeeInTx(tx, ctx.systemId, e.id);
      const one = { granted: 0, carried: 0, expired: 0, waited: 0 };
      for (const p0 of forEmp(e)) {
        // r5 มติ 1: อ่านแถวประเภทการลาใหม่แบบ FOR SHARE ในธุรกรรมของพนักงาน (ค่าโควตา/เพดานล่าสุด · ตั้งค่าที่ถือ FOR UPDATE อยู่ = รอ)
        const p = await policyForShareInTx(tx, p0.id);
        if (!p || !p.active) continue;
        const ysm = ysmOf(p);
        const y = leaveYearOf(asOf, ysm);
        one.granted += await ensureGrantInTx(tx, ctx, e, p, y, asOf);
        if (carryCap(p) <= 0) continue;
        const pendIn = (year: number, toBy?: string) => {
          const b = leaveYearBounds(year, ysm);
          return tx.hrLeave.count({
            where: { employeeId: e.id, policyId: p.id, status: "PENDING", fromDate: { gte: dbDate(b.from), lte: dbDate(b.to) }, ...(toBy ? { toDate: { lte: dbDate(toBy) }, createdAt: { lt: filedByEnd(toBy) } } : {}) },
          });
        };
        let cur = await leaveYearStateInTx(tx, e.id, p.id, y);
        if (!cur.carried) {
          if ((await pendIn(y - 1)) > 0) {
            one.waited = 1; // L2: รอใบปี Y−1 ตัดสินก่อน
            continue;
          }
          // ปิดวันหมดอายุของปี Y−1 ก่อน (ถ้ายังค้าง) แล้วค่อยโอน — ไม่ยกวันสะสมที่หมดอายุแล้วซ้ำ
          const prev = await leaveYearStateInTx(tx, e.id, p.id, y - 1);
          let prevSum = prev.sum;
          if (prev.carried && !prev.expiredDone && prev.expiry && asOf > prev.expiry) {
            one.expired += await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "EXPIRE", tenths: -prev.carryLeft, leaveYear: y - 1, effectiveDate: addDays(prev.expiry, 1), sourceKey: `expire:${e.id}:${p.id}:${y - 1}` });
            prevSum -= prev.carryLeft;
          }
          const c = tenthsOf(carryDays(fmtTenths(prevSum), p.carryMaxDays));
          const exp = carryExpiryOf(y, ysm, p.carryExpiresMonthDay);
          const b = leaveYearBounds(y, ysm);
          await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "CARRY", tenths: -c, leaveYear: y - 1, effectiveDate: addDays(b.from, -1), sourceKey: `carry-out:${e.id}:${p.id}:${y}` });
          one.carried += await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "CARRY", tenths: c, leaveYear: y, effectiveDate: b.from, sourceKey: `carry:${e.id}:${p.id}:${y}`, note: exp ? `expires:${exp}` : null });
          cur = await leaveYearStateInTx(tx, e.id, p.id, y);
        }
        if (!cur.expiry || !(asOf > cur.expiry) || cur.expiredDone) continue;
        if ((await pendIn(y, cur.expiry)) > 0) {
          one.waited = 1; // L4: รอใบที่จบภายในวันหมดอายุตัดสินก่อน
          continue;
        }
        one.expired += await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "EXPIRE", tenths: -cur.carryLeft, leaveYear: y, effectiveDate: addDays(cur.expiry, 1), sourceKey: `expire:${e.id}:${p.id}:${y}` });
      }
      return one;
    }, LEAVE_TX_OPTS).catch((err: unknown) => {
      res.failed++;
      // r4 มติ 5: ผลลัพธ์เก็บแค่ข้อความสั้น (ชื่อ + รหัส) · ข้อผิดพลาดเต็มลง log ของเซิร์ฟเวอร์
      const code = err && typeof err === "object" && "code" in err ? ` ${String((err as { code: unknown }).code).slice(0, 20)}` : "";
      res.failedError ??= `${err instanceof Error ? err.name : "Error"}${code}`.slice(0, 80);
      console.error("[runLeaveYearJob] employee tx failed", { systemId: ctx.systemId, employeeId: e.id }, err);
      return null;
    });
    if (!r) continue;
    res.granted += r.granted;
    res.carried += r.carried;
    res.expired += r.expired;
    res.waited += r.waited;
  }
  return res;
}

// ═══════════════════════════ ผู้อ่าน (R11) ═══════════════════════════
type ViewKind = "reason" | "row" | null;
/** ผู้ดูคนนี้เห็นใบลาใบนี้แบบไหน — "reason" = มีเหตุผล/ไฟล์แนบ · "row" = แถวไม่มีเหตุผล · null = ไม่เห็น */
function leaveViewOf(v: LeaveViewer, l: { fromDate: Date; filedById: string | null; employee: Pick<EmpRow, "linkedUserId" | "unitId" | "units"> }): ViewKind {
  if (!v) return null;
  const uid = str(v.userId);
  if (uid && (l.employee.linkedUserId === uid || l.filedById === uid)) return "reason";
  const m = memberOf(v);
  if (m.role === "OWNER") return "reason";
  if (!unitTargetOf(hrScopeOf(m), { unitId: l.employee.unitId, borrowings: l.employee.units }, l.fromDate).ok) return null;
  if (m.role === "MANAGER" || can(m, "hr.leave.read")) return "reason";
  return can(m, "hr.leave.decide") ? "row" : null;
}
const DETAIL_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  fromDate: true,
  toDate: true,
  days: true,
  halfDay: true,
  hours: true,
  status: true,
  reason: true,
  filedById: true,
  policy: { select: { id: true, name: true, category: true, attachmentAfterDays: true } },
  employee: { select: { name: true, linkedUserId: true, unitId: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } } },
} as const satisfies Prisma.HrLeaveSelect;

export type LeaveDetailItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  policyId: string | null;
  policyName: string | null;
  category: HrLeaveType;
  fromDate: string;
  toDate: string;
  days: string | null;
  halfDay: HrHalfDay | null;
  hours: string | null;
  status: HrLeaveStatus;
  hasAttachment: boolean;
  needsAttachment: boolean;
  reason?: string | null;
};
/** ใบลา 1 ใบตามสิทธิ์ผู้ดู (คีย์คงที่ · เหตุผลเฉพาะผู้เห็นเหตุผล · ไม่มี attachmentKey/ที่อยู่ไฟล์) */
export async function leaveDetail(ctx: Ctx, viewer: LeaveViewer, leaveId: string): Promise<{ ok: true; item: LeaveDetailItem } | { ok: false; reason: string }> {
  const id = str(leaveId);
  const l = id ? await tenantDb(ctx).hrLeave.findFirst({ where: { id }, select: DETAIL_SELECT }) : null;
  const view = l ? leaveViewOf(viewer, l) : null;
  if (!l || !view) return { ok: false, reason: LEAVE_TEXT.detailNo };
  const days = l.days === null ? null : fmtTenths(tenthsOf(l.days));
  const after = l.policy?.attachmentAfterDays ?? null;
  const item: LeaveDetailItem = {
    id: l.id,
    employeeId: l.employeeId,
    employeeName: l.employee.name,
    policyId: l.policy?.id ?? null,
    policyName: l.policy?.name ?? null,
    category: l.policy?.category ?? l.type,
    fromDate: dayOf(l.fromDate),
    toDate: dayOf(l.toDate),
    days,
    halfDay: l.halfDay,
    hours: l.hours === null ? null : fmtTenths(tenthsOf(l.hours)),
    status: l.status,
    hasAttachment: false, // r2 มติ D3: ไฟล์แนบปิด — ไม่อ่านคอลัมน์ไฟล์เลย (ธง needsAttachment คงไว้)
    needsAttachment: after !== null && days !== null && tenthsOf(days) >= after * 10, // Q10: ธงอย่างเดียว ไม่บล็อกการอนุมัติ
  };
  if (view === "reason") item.reason = l.reason;
  return { ok: true, item };
}

/**
 * ลิงก์เปิดไฟล์แนบ — r2 มติ D3: ไฟล์แนบปิดในใบนี้ (หนี้ D-H27-attach: ต้องมีที่อัปโหลดของ HR เอง + กันใช้ซ้ำทั้งร้าน) ⇒
 * ไม่สร้างลิงก์ให้ใครเลย ทุกกรณีได้ข้อความเดียวกัน · ไม่อ่านฐานข้อมูล
 */
export async function leaveAttachmentLink(_ctx: Ctx, _viewer: LeaveViewer, _leaveId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  return { ok: false, reason: LEAVE_TEXT.linkNo };
}

/** แนบไฟล์ให้ใบลา — r2 มติ D3: ปิด ⇒ ปฏิเสธทุกครั้งด้วยข้อความเดียว ไม่รับรหัสไฟล์ใด ๆ ไม่เขียนอะไร */
export async function attachLeaveFile(_ctx: Ctx, _actor: LeaveViewer, _leaveId: string, _input: { fileId: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  return { ok: false, reason: LEAVE_TEXT.attachOff };
}

export type LeaveBalanceItem = {
  policyId: string;
  name: string;
  category: HrLeaveType;
  unlimited: boolean;
  granted: string;
  carried: string;
  used: string;
  adjusted: string;
  expired: string;
  balance: string;
  pending: string;
  available: string | null;
};
type BalanceQuery = { year?: number | null; at?: string | Date | null };
async function balanceItems(ctx: Ctx, emp: Pick<EmpRow, "id" | "unitId" | "startDate">, q: BalanceQuery): Promise<LeaveBalanceItem[]> {
  const db = tenantDb(ctx);
  const policies = (await db.hrLeavePolicy.findMany({ where: { active: true, OR: [{ unitId: null }, ...(emp.unitId ? [{ unitId: emp.unitId }] : [])] }, select: POLICY_SELECT, take: 100 })).sort(
    policyOrder(emp.unitId),
  );
  if (policies.length === 0) return [];
  const at = q.at ? dayKey(q.at) : null;
  const yearOf = (p: PolicyRow) => (Number.isInteger(q.year) ? (q.year as number) : at ? leaveYearOf(at, ysmOf(p)) : 0);
  const years = [...new Set(policies.map(yearOf))];
  const txns = await db.hrLeaveBalanceTxn.findMany({
    where: { employeeId: emp.id, policyId: { in: policies.map((p) => p.id) }, leaveYear: { in: years } },
    select: { policyId: true, kind: true, days: true, leaveYear: true, sourceKey: true },
    take: 5000,
  });
  const pend = await db.hrLeave.findMany({ where: { employeeId: emp.id, status: "PENDING", policyId: { in: policies.map((p) => p.id) } }, select: { policyId: true, fromDate: true, days: true }, take: 1000 });
  return policies.map((p) => {
    const y = yearOf(p);
    const b = leaveYearBounds(y, ysmOf(p));
    const rows = txns.filter((r) => r.policyId === p.id && r.leaveYear === y);
    const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + tenthsOf(r.days), 0);
    let granted = sum((r) => r.kind === "GRANT");
    if (!isUnlimited(p) && !rows.some((r) => r.kind === "GRANT")) {
      const g = grantDays(p, emp.startDate, y, ysmOf(p)); // ยังไม่ถูกเขียน (เขียนตอนยื่น/อนุมัติ/งานรายปี) — แสดงสิทธิ์ที่มีจริง
      if (g.eligible && g.days !== null) granted += tenthsOf(g.days);
    }
    const carried = sum((r) => r.kind === "CARRY");
    const usedNet = -sum((r) => r.kind === "USE" || (r.kind === "ADJUST" && r.sourceKey.startsWith("use-revert:")));
    const adjusted = sum((r) => r.kind === "ADJUST" && !r.sourceKey.startsWith("use-revert:"));
    const expired = -sum((r) => r.kind === "EXPIRE");
    const balance = granted + carried - usedNet + adjusted - expired;
    const pending = pend.filter((l) => l.policyId === p.id && dayOf(l.fromDate) >= b.from && dayOf(l.fromDate) <= b.to).reduce((s, l) => s + tenthsOf(l.days), 0);
    return {
      policyId: p.id,
      name: p.name,
      category: p.category,
      unlimited: isUnlimited(p),
      granted: fmtTenths(granted),
      carried: fmtTenths(carried),
      used: fmtTenths(usedNet),
      adjusted: fmtTenths(adjusted),
      expired: fmtTenths(expired),
      balance: fmtTenths(balance),
      pending: fmtTenths(pending),
      available: isUnlimited(p) ? null : fmtTenths(balance - pending),
    };
  });
}

/** ยอดวันลาของพนักงาน 1 คน — ผู้ดูแถวใบลาในสาขา (เจ้าของ · ผู้จัดการ · hr.leave.read · hr.leave.decide) · นอกสาขา = ข้อความ H1.1 · อื่น ๆ = balNo */
export async function leaveBalances(
  ctx: Ctx,
  viewer: LeaveViewer,
  input: { employeeId: string } & BalanceQuery,
): Promise<{ ok: true; items: LeaveBalanceItem[] } | { ok: false; reason: string }> {
  const no = { ok: false as const, reason: LEAVE_TEXT.balNo };
  if (!viewer) return no;
  const m = memberOf(viewer);
  if (!(m.role === "OWNER" || m.role === "MANAGER" || can(m, "hr.leave.read") || can(m, "hr.leave.decide"))) return no;
  const id = str(input?.employeeId);
  const emp = id ? await tenantDb(ctx).hrEmployee.findFirst({ where: { id }, select: { id: true, unitId: true, startDate: true, units: EMP_SELECT.units } }) : null;
  if (!emp) return no;
  const t = unitTargetOf(hrScopeOf(m), { unitId: emp.unitId, borrowings: emp.units });
  if (!t.ok) return { ok: false, reason: t.reason };
  return { ok: true, items: await balanceItems(ctx, emp, input) };
}

/** ยอดวันลาของตัวเอง — หาพนักงานจากบัญชีผู้กด (employeeOfUser · ไม่รับ employeeId จากผู้เรียก — §C.7) */
export async function myLeaveBalances(ctx: Ctx, actor: LeaveViewer, input: BalanceQuery = {}): Promise<{ ok: true; items: LeaveBalanceItem[] } | { ok: false; reason: string }> {
  const uid = str(actor?.userId);
  if (!uid) return { ok: false, reason: LEAVE_TEXT.balNo };
  const { employeeOfUser } = await import("./service"); // นำเข้าตอนเรียก (service.ts นำเข้าไฟล์นี้)
  const own = await employeeOfUser(ctx.tenantId, uid);
  if (!own) return { ok: false, reason: LEAVE_TEXT.balNo };
  const c: Ctx = { tenantId: ctx.tenantId, systemId: own.systemId };
  const emp = await tenantDb(c).hrEmployee.findFirst({ where: { id: own.employeeId }, select: { id: true, unitId: true, startDate: true } });
  if (!emp) return { ok: false, reason: LEAVE_TEXT.balNo };
  return { ok: true, items: await balanceItems(c, emp, { year: input?.year ?? null, at: input?.at ?? null }) };
}

/** ประเภทการลาที่เปิดอยู่ (สำหรับฟอร์มยื่น — ชื่อ/หมวด/ครึ่งวัน เท่านั้น) */
export async function activeLeavePolicies(ctx: Ctx): Promise<{ id: string; name: string; category: HrLeaveType; allowHalfDay: boolean; allowHours: boolean; attachmentAfterDays: number | null }[]> {
  const rows = await tenantDb(ctx).hrLeavePolicy.findMany({ where: { active: true }, select: POLICY_SELECT, take: 100 });
  return rows
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1))
    .map((p) => ({ id: p.id, name: p.name, category: p.category, allowHalfDay: p.allowHalfDay, allowHours: p.allowHours, attachmentAfterDays: p.attachmentAfterDays }));
}

/** ข้อความปฏิเสธของงานลา (ข้อความไทยคงที่) — อื่น ๆ = null */
export function leaveRefusalText(e: unknown): string | null {
  return e instanceof LeaveRuleError || e instanceof TimeRuleError ? e.message : null;
}
// ◂ HR H2.7

// ═══════════════════════════ HR H2.11 ▸ กล่องคำขอรวม (ภาพ 05) — ตัวห่อและตัวอ่านแบบชุด (เพิ่มอย่างเดียว · กติกาเดิมไม่แตะ) ═══════════════════════════
//   • decideLeaveAs = ทางต่อใบของ bulkDecideLeaveAction (คีย์ hr.leave.decide → สาขาของพนักงาน ณ วันเริ่มลา → decideLeave from PENDING) — ด่านเดียว ไม่มีกติกาใหม่
//   • leaveDetailsMany = leaveDetail ทีละหลายใบ (คีย์/ผู้ดูเดียวกันทุกไบต์ · อ่านครั้งเดียว)
//   • teamLeaveBalances = leaveBalances ของพนักงานในขอบเขตทั้งทีม (ด่านเดียวกัน · คิวรีคงที่ไม่ขึ้นกับจำนวนคน)
//   • inboxSubjects = ข้อเท็จจริงที่ DTO ของแต่ละชนิดตั้งใจไม่ส่ง แต่กล่องต้องใช้ซ่อน/ล็อกรายการ: สาขาของพนักงาน ณ วันของคำขอ · "เป็นของผู้ดูเอง" ·
//     "ผู้ดูเป็นผู้ยื่น" (OT · แก้เวลา) · "อยู่ในสายอนุมัติ" — คืนเฉพาะค่าที่เทียบกับผู้ดู (boolean/สาขา) ไม่ส่งบัญชีที่ผูก/ผู้ยื่นออกไป
type LeaveDecideAsResult = { ok: true; status: "APPROVED" | "REJECTED" } | { ok: false; reason: string };
const LEAVE_NOT_FOUND_TEXT = "ไม่พบใบลา หรืออยู่นอกร้านนี้";
/** ตัดสินใบลา 1 ใบในนามผู้ดู — ด่านของ (bulk)decideLeaveAction ต่อใบ แล้ว decideLeave(from PENDING) · ปฏิเสธ = ข้อความของงานลาเองทุกไบต์ */
export async function decideLeaveAs(ctx: Ctx, v: LeaveViewer, leaveId: string, status: "APPROVED" | "REJECTED"): Promise<LeaveDecideAsResult> {
  const m = memberOf(v);
  const uid = str(v?.userId);
  const id = str(leaveId);
  if (!uid || !can(m, "hr.leave.decide")) return { ok: false, reason: INBOX_TEXT.noRight };
  if (status !== "APPROVED" && status !== "REJECTED") return { ok: false, reason: LEAVE_NOT_FOUND_TEXT };
  const lt = id ? await leaveTargetOf(ctx, id) : null;
  if (lt) {
    const emp = await employeeUnitsOf(ctx, lt.employeeId);
    if (emp) {
      const t = unitTargetOf(hrScopeOf(m), emp, lt.fromDate);
      if (!t.ok) return { ok: false, reason: t.reason };
      if (!evaluate(m, { module: "hr", action: "hr.leave.decide", ...(t.unitId ? { unitId: t.unitId } : {}) })) return { ok: false, reason: INBOX_TEXT.noRight };
    }
  }
  const { decideLeave, HrLeaveDecisionError } = await import("./service"); // นำเข้าตอนเรียก (service.ts นำเข้าไฟล์นี้)
  try {
    await decideLeave(ctx, id, status, uid, { from: "PENDING" });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, reason: e instanceof HrLeaveDecisionError ? e.message : LEAVE_NOT_FOUND_TEXT };
  }
}

/** leaveDetail หลายใบ — อ่านครั้งเดียว · ผลต่อ id เท่ากับ leaveDetail ทุกไบต์ (ไม่พบ/ไม่มีสิทธิ์ = detailNo) */
export async function leaveDetailsMany(ctx: Ctx, viewer: LeaveViewer, leaveIds: string[]): Promise<Map<string, { ok: true; item: LeaveDetailItem } | { ok: false; reason: string }>> {
  const ids = [...new Set((Array.isArray(leaveIds) ? leaveIds : []).map(str).filter(Boolean))].slice(0, 1000);
  const out = new Map<string, { ok: true; item: LeaveDetailItem } | { ok: false; reason: string }>(ids.map((id) => [id, { ok: false, reason: LEAVE_TEXT.detailNo }]));
  if (!ids.length) return out;
  const rows = await tenantDb(ctx).hrLeave.findMany({ where: { id: { in: ids } }, select: DETAIL_SELECT, take: ids.length });
  for (const l of rows) {
    const view = leaveViewOf(viewer, l);
    if (!view) continue;
    const days = l.days === null ? null : fmtTenths(tenthsOf(l.days));
    const after = l.policy?.attachmentAfterDays ?? null;
    const item: LeaveDetailItem = {
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee.name,
      policyId: l.policy?.id ?? null,
      policyName: l.policy?.name ?? null,
      category: l.policy?.category ?? l.type,
      fromDate: dayOf(l.fromDate),
      toDate: dayOf(l.toDate),
      days,
      halfDay: l.halfDay,
      hours: l.hours === null ? null : fmtTenths(tenthsOf(l.hours)),
      status: l.status,
      hasAttachment: false,
      needsAttachment: after !== null && days !== null && tenthsOf(days) >= after * 10,
    };
    if (view === "reason") item.reason = l.reason;
    out.set(l.id, { ok: true, item });
  }
  return out;
}

/** ยอดของประเภทการลา 1 แบบ ของพนักงาน 1 คน ในปี y — สูตรเดียวกับ balanceItems (ข้อมูลที่อ่านมาแล้ว) */
function balanceItemOf(
  p: PolicyRow,
  emp: { startDate: Date | null },
  y: number,
  txns: { policyId: string; kind: string; days: unknown; leaveYear: number; sourceKey: string }[],
  pend: { policyId: string | null; fromDate: Date; days: unknown }[],
): LeaveBalanceItem {
  const b = leaveYearBounds(y, ysmOf(p));
  const rows = txns.filter((r) => r.policyId === p.id && r.leaveYear === y);
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + tenthsOf(r.days), 0);
  let granted = sum((r) => r.kind === "GRANT");
  if (!isUnlimited(p) && !rows.some((r) => r.kind === "GRANT")) {
    const g = grantDays(p, emp.startDate, y, ysmOf(p));
    if (g.eligible && g.days !== null) granted += tenthsOf(g.days);
  }
  const carried = sum((r) => r.kind === "CARRY");
  const usedNet = -sum((r) => r.kind === "USE" || (r.kind === "ADJUST" && r.sourceKey.startsWith("use-revert:")));
  const adjusted = sum((r) => r.kind === "ADJUST" && !r.sourceKey.startsWith("use-revert:"));
  const expired = -sum((r) => r.kind === "EXPIRE");
  const balance = granted + carried - usedNet + adjusted - expired;
  const pending = pend.filter((l) => l.policyId === p.id && dayOf(l.fromDate) >= b.from && dayOf(l.fromDate) <= b.to).reduce((s, l) => s + tenthsOf(l.days), 0);
  return {
    policyId: p.id,
    name: p.name,
    category: p.category,
    unlimited: isUnlimited(p),
    granted: fmtTenths(granted),
    carried: fmtTenths(carried),
    used: fmtTenths(usedNet),
    adjusted: fmtTenths(adjusted),
    expired: fmtTenths(expired),
    balance: fmtTenths(balance),
    pending: fmtTenths(pending),
    available: isUnlimited(p) ? null : fmtTenths(balance - pending),
  };
}
export type TeamLeaveBalances = {
  year: number;
  rows: { employeeId: string; name: string; unitId: string | null; items: LeaveBalanceItem[] }[];
};
const TEAM_MAX = 1000;
/**
 * ยอดวันลาของทั้งทีม (ปีเดียว) — ด่านเดียวกับ leaveBalances (เจ้าของ · ผู้จัดการ · hr.leave.read · hr.leave.decide) · แถว = พนักงานที่ยังทำงาน
 * ที่สาขาประจำอยู่ในขอบเขต (unitTargetOf แบบเดียวกับ leaveBalances) · ค่าต่อคน = leaveBalances({ employeeId, year }) ทุกไบต์ · null = ไม่ผ่านด่าน
 */
export async function teamLeaveBalances(ctx: Ctx, viewer: LeaveViewer, input: { year: number; unitId?: string | null }): Promise<TeamLeaveBalances | null> {
  if (!viewer) return null;
  const m = memberOf(viewer);
  if (!(m.role === "OWNER" || m.role === "MANAGER" || can(m, "hr.leave.read") || can(m, "hr.leave.decide"))) return null;
  const year = Number.isInteger(input?.year) ? input.year : Number(thaiDateKey(new Date()).slice(0, 4));
  const scope = hrScopeOf(m);
  const unitId = str(input?.unitId);
  if (unitId && scope.unitIds !== "*" && !scope.unitIds.includes(unitId)) return { year, rows: [] };
  const db = tenantDb(ctx);
  const emps = (
    await db.hrEmployee.findMany({
      where: { active: true, ...(unitId ? { unitId } : {}) },
      select: { id: true, name: true, unitId: true, startDate: true, units: EMP_SELECT.units },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: TEAM_MAX,
    })
  ).filter((e) => unitTargetOf(scope, { unitId: e.unitId, borrowings: e.units }).ok);
  if (!emps.length) return { year, rows: [] };
  const ids = emps.map((e) => e.id);
  const policies = await db.hrLeavePolicy.findMany({ where: { active: true }, select: POLICY_SELECT, take: 500 });
  const polIds = policies.map((p) => p.id);
  const [txns, pend] = polIds.length
    ? await Promise.all([
        db.hrLeaveBalanceTxn.findMany({ where: { employeeId: { in: ids }, policyId: { in: polIds }, leaveYear: year }, select: { employeeId: true, policyId: true, kind: true, days: true, leaveYear: true, sourceKey: true }, take: 100_000 }),
        db.hrLeave.findMany({ where: { employeeId: { in: ids }, status: "PENDING", policyId: { in: polIds } }, select: { employeeId: true, policyId: true, fromDate: true, days: true }, take: 50_000 }),
      ])
    : [[], []];
  return {
    year,
    rows: emps.map((e) => {
      const mine = policies.filter((p) => p.unitId === null || (!!e.unitId && p.unitId === e.unitId)).sort(policyOrder(e.unitId)).slice(0, 100);
      const t = txns.filter((r) => r.employeeId === e.id);
      const pd = pend.filter((r) => r.employeeId === e.id);
      return { employeeId: e.id, name: e.name, unitId: e.unitId, items: mine.map((p) => balanceItemOf(p, e, year, t, pd)) };
    }),
  };
}

export type InboxSubject = { name: string; unitId: string | null; own: boolean; unitAt: (day: string | null) => string | null };
export type InboxSubjects = {
  employees: Map<string, InboxSubject>;
  /** OT: เวลาที่ยื่น + ผู้ดูเป็นผู้ยื่นไหม (กติกา 4 ตาของ decideOtRequest) */
  ot: Map<string, { createdAt: Date; filedByViewer: boolean }>;
  /** คำขอแก้เวลาที่ผู้ดูเป็นผู้ยื่น (decideCorrection ปฏิเสธผู้ยื่น) */
  correctionFiledByViewer: Set<string>;
  /** ใบลา/สลับกะ/แก้เวลาที่มีคำขอในสายอนุมัติ (ไม่ใช่ยกเลิก) — สายเป็นเจ้าของการตัดสิน */
  chain: Set<string>;
};
const INBOX_READER_KEYS = ["hr.leave.read", "hr.leave.decide", "hr.employee.create", "hr.payadjust.approve", "hr.payroll.read", "hr.*"];
/**
 * ข้อเท็จจริงของกล่องคำขอรวม (อ่านอย่างเดียว · 4 คิวรีไม่ขึ้นกับจำนวนรายการ) — ผู้ดูที่มีบทบาท/คีย์อ่าน HR ใดก็ได้ · อื่น ๆ = null ·
 * พนักงานนอกขอบเขตสาขาของผู้ดูไม่อยู่ในผล (สาขาประจำหรือยืมตัวในขอบเขต) · ไม่คืน linkedUserId/requestedBy — คืนแค่ own/filedByViewer
 */
export async function inboxSubjects(
  ctx: Ctx,
  viewer: LeaveViewer,
  input: { employeeIds: string[]; otIds: string[]; correctionIds: string[]; chainIds: { leave: string[]; swap: string[]; correction: string[] } },
): Promise<InboxSubjects | null> {
  if (!viewer) return null;
  const m = memberOf(viewer);
  const perms = m.permissions as Record<string, unknown>;
  if (!(m.role === "OWNER" || m.role === "MANAGER" || INBOX_READER_KEYS.some((k) => perms[k] === true))) return null;
  const uid = str(viewer.userId);
  const scope = hrScopeOf(m);
  const uniq = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).map(str).filter(Boolean))].slice(0, 5000);
  const empIds = uniq(input?.employeeIds);
  const otIds = uniq(input?.otIds);
  const corrIds = uniq(input?.correctionIds);
  const chainIds = { HrLeave: uniq(input?.chainIds?.leave), HrShiftSwapRequest: uniq(input?.chainIds?.swap), HrTimeCorrection: uniq(input?.chainIds?.correction) };
  const db = tenantDb(ctx);
  const [emps, ots, corrs, chains] = await Promise.all([
    empIds.length ? db.hrEmployee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true, unitId: true, linkedUserId: true, units: EMP_SELECT.units }, take: empIds.length }) : Promise.resolve([]),
    otIds.length ? db.hrOtRequest.findMany({ where: { id: { in: otIds } }, select: { id: true, createdAt: true, requestedByUserId: true }, take: otIds.length }) : Promise.resolve([]),
    corrIds.length ? db.hrTimeCorrection.findMany({ where: { id: { in: corrIds } }, select: { id: true, requestedByUserId: true }, take: corrIds.length }) : Promise.resolve([]),
    Object.values(chainIds).some((x) => x.length)
      ? tenantDb({ tenantId: ctx.tenantId }).approvalRequest.findMany({
          where: { status: { not: "CANCELLED" }, OR: Object.entries(chainIds).filter(([, ids]) => ids.length).map(([entityType, ids]) => ({ entityType, entityId: { in: ids } })) },
          select: { entityId: true },
          take: 20_000,
        })
      : Promise.resolve([]),
  ]);
  const inScope = (e: { unitId: string | null; units: { unitId: string }[] }) => scope.unitIds === "*" || (!!e.unitId && scope.unitIds.includes(e.unitId)) || e.units.some((b) => (scope.unitIds as string[]).includes(b.unitId));
  return {
    employees: new Map(
      emps.filter(inScope).map((e) => [e.id, { name: e.name, unitId: e.unitId, own: !!uid && e.linkedUserId === uid, unitAt: (day: string | null) => (day ? unitOfDay(e, day) : e.unitId) }] as const),
    ),
    ot: new Map(ots.map((o) => [o.id, { createdAt: o.createdAt, filedByViewer: !!uid && o.requestedByUserId === uid }] as const)),
    correctionFiledByViewer: new Set(corrs.filter((c) => !!uid && c.requestedByUserId === uid).map((c) => c.id)),
    chain: new Set(chains.map((c) => c.entityId)),
  };
}
// ◂ HR H2.11

// HR MONEY-2 ▸ R5 (H5.2 m4) + R6 (re-hunt N1): ใบลาที่มีผลต่อเงิน (ประเภทการลา paid === false) ที่วันลาตกในเดือนที่ระบบ HR นี้มีรอบเงินเดือน APPROVED/PAID แล้ว ⇒
//   อนุมัติ / ถอนอนุมัติ / ยกเลิก ไม่ได้ (กติกาเดียวกับคำขอแก้เวลา — correction.ts paidMonthsOf: ทุกรอบของระบบในเดือนนั้น ไม่ใช่รายคน) ·
//   R6: + ถอน/ยกเลิกใบลารับค่าจ้างในเดือนนั้น · + ใบลาใดก็ได้บนวันที่ถูกหักสาย/ขาดในรอบที่อนุมัติแล้ว · ใบลารับค่าจ้างวันอื่น/เดือนที่ยังเปิด = เหมือนเดิม ·
//   ผู้เรียกถือล็อก hr-leave:<id> → พนักงานอยู่แล้ว · คืนข้อความคงที่ (null = ผ่าน)
const monthsOfRange = (from: string, to: string): string[] => {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let i = 0; i < 240; i += 1) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    out.push(k);
    m += 1;
    if (m > 12) ((m = 1), (y += 1));
  }
  return out;
};
/**
 * R5/R6 ข้อความปฏิเสธ (null = ผ่าน):
 *   (a) ใบลาไม่รับค่าจ้าง (paid === false) — หรือ `revoke` (ถอน/ยกเลิกใบที่อนุมัติแล้ว) ของใบลาใดก็ได้ (D2) — ในเดือนที่มีรอบ APPROVED/PAID ·
 *   (b) ใบลาใดก็ได้ (รับ/ไม่รับค่าจ้าง · ใบรุ่นเก่า) ที่ครอบวันที่มีรายการหักสาย/ขาด (HrAttendanceDeduction.linesJson วันนั้น) ผูกอยู่กับรอบ APPROVED/PAID
 */
export async function leavePaidRunRefusalInTx(tx: Tx, ctx: Ctx, leaveId: string, opts: { revoke?: boolean } = {}): Promise<string | null> {
  const l = await tx.hrLeave.findFirst({ where: { id: leaveId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true, fromDate: true, toDate: true, policy: { select: { paid: true } } } });
  if (!l) return null;
  const from = dayOf(l.fromDate);
  const to = dayOf(l.toDate);
  const months = monthsOfRange(from, to);
  if (!months.length) return null;
  if (l.policy?.paid === false || opts.revoke === true) { // D2: ถอน/ยกเลิกใบที่อนุมัติแล้ว — ทุกใบ (มีหรือไม่มีประเภทการลา)
    const run = await tx.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: { in: months }, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } });
    if (run) return CORRECTION_TEXT.paid;
  }
  // D1: เริ่มจากรายการหักสาย/ขาดของพนักงานที่ผูกรอบแล้ว (ชุดเล็กโดยธรรมชาติ) → รอบ APPROVED/PAID → หัวรายการของเดือนที่ลา — ไม่มีเพดานแถวที่ตัดแถวสำคัญทิ้ง
  const bound = await tx.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: l.employeeId, kind: "DEDUCTION", sourceType: { in: ["ABSENT_RULE", "LATE_RULE"] }, runId: { not: null } }, select: { id: true, runId: true } });
  const runIds = [...new Set(bound.map((b) => b.runId).filter((x): x is string => !!x))];
  if (!runIds.length) return null;
  const paidRuns = new Set((await tx.hrPayrollRun.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: runIds }, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } })).map((r) => r.id));
  const ids = bound.filter((b) => !!b.runId && paidRuns.has(b.runId)).map((b) => b.id);
  if (!ids.length) return null;
  const heads = await tx.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: l.employeeId, adjustmentId: { in: ids }, workPeriodKey: { in: months } }, select: { linesJson: true } });
  const onDay = heads.some((h) => (Array.isArray(h.linesJson) ? (h.linesJson as unknown[]) : []).some((x) => {
    const ln = (x && typeof x === "object" ? x : {}) as { day?: unknown; amountSatang?: unknown };
    return typeof ln.day === "string" && ln.day >= from && ln.day <= to && Number(ln.amountSatang) > 0;
  }));
  return onDay ? CORRECTION_TEXT.paid : null;
}
// ◂ HR MONEY-2
