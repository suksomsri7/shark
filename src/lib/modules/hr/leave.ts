// HR H2.7 ▸ เครื่องยนต์การลา: ประเภทการลา (policy) · สมุดวันลา (ledger) · ครึ่งวัน/ชั่วโมง · ไฟล์แนบ · งานยก/ตัดวันลาสะสม · event hr.leave.decided
//   (brief H2.7 R3–R12 · ตัวงาน requestLeave/decideLeave/cancelLeave ยังอยู่ที่ service.ts — Q2 · ที่นี่ = ตัวช่วยที่ service.ts เรียกในธุรกรรมของตัวเอง)
//
// กติกา:
//   • ยอดคงเหลือ = Σ แถวสมุด (HrLeaveBalanceTxn) — ไม่มีตัวนับ · เพิ่มแถวอย่างเดียว (ไม่ update/delete) · กันซ้ำด้วย unique (systemId, sourceKey)
//     grant:<emp>:<pol>:<ปี> · use:<leaveId> (−วัน) · use-revert:<leaveId> (ADJUST +วัน ครั้งเดียว เฉพาะที่มี USE) · carry:<emp>:<pol>:<ปี> · expire:<emp>:<pol>:<ปี>
//   • ลำดับล็อก (R8): hr-leave:<id> → hr-leave-emp:<sys>:<emp> → กุญแจตารางกะ (พนักงาน × วันลา เรียงจากน้อยไปมาก) · ยื่น/งานรายปี = กุญแจพนักงานอย่างเดียว ·
//     สลับกะ = hr-swap:<id> → กุญแจตารางกะ (ไม่แตะกุญแจใบลา) ⇒ ไม่มีวงล็อก · ใต้ล็อกใช้ tx ของผู้เรียกเท่านั้น (§C.8)
//   • นับวัน (R4): วันหยุดของสาขาในวันนั้น (แถวสาขา/ทั้งร้าน · แม้ร้านเปิด — Q5) ⇒ ไม่นับ · มีกะที่ประกาศแล้ววันนั้น ⇒ นับ ·
//     สัปดาห์นั้นมีกะประกาศแล้ววันอื่น ⇒ ไม่นับ · ตารางงานประจำบอกหยุด ⇒ ไม่นับ · นอกนั้นนับ
//   • ผู้อ่าน (R11): เหตุผลการลา/ไฟล์แนบ = เจ้าของร้าน · ผู้จัดการในสาขา · hr.leave.read ในสาขา · ตัวพนักงานเอง · ผู้ยื่นแทน ·
//     hr.leave.decide ในสาขา = แถวไม่มีเหตุผล · คนอื่น = ข้อความเดียวกันทุกไบต์ · ไม่ส่ง attachmentKey/ที่อยู่ไฟล์ออกไป
//   • ปฏิเสธ = LeaveRuleError / TimeRuleError (ข้อความไทยคงที่) — service.ts แปลงเป็น HrLeaveRequestError ◂
import type { HrHalfDay, HrLeaveStatus, HrLeaveType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { privateFileUrl } from "@/lib/storage/private-links";
import { lockRosterKeysInTx, unitOfDay } from "./roster";
import { weekdayOfDay, weekStartOf } from "./roster-rules";
import { hrScopeOf, unitTargetOf } from "./scope";
import { addDays, leaveDaysBetween, TIME_RULE_TEXT, TimeRuleError } from "./time-rules";
import { holidayOfDay, holidayRowsInRange } from "./holidays";
import {
  carryDays,
  carryExpiryOf,
  countLeaveDays,
  dayKey,
  expireDays,
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
  attachmentFileId: string | null;
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
    attachmentFileId: str(input.attachmentFileId) || null,
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
  const sched = await tx.hrWorkSchedule.findMany({ where: { employeeId: emp.id }, select: { weekday: true, dayOff: true } });
  const offWd = new Set(sched.filter((s) => s.dayOff).map((s) => s.weekday));
  const daysOff = new Set(days.filter((d) => !holidays.has(d) && !rostered.has(d) && (rosterWeeks.has(weekStartOf(d)) || offWd.has(weekdayOfDay(d)))));
  return countLeaveDays({ from, to, halfDay: half, hours, holidays, daysOff });
}

// ═══════════════════════════ สมุดวันลา ═══════════════════════════
async function sumTxn(tx: Tx, where: Prisma.HrLeaveBalanceTxnWhereInput): Promise<number> {
  const r = await tx.hrLeaveBalanceTxn.aggregate({ _sum: { days: true }, where });
  return tenthsOf(r._sum.days);
}
async function insertTxn(
  tx: Tx,
  ctx: Ctx,
  row: { employeeId: string; policyId: string; kind: "GRANT" | "USE" | "CARRY" | "EXPIRE" | "ADJUST"; tenths: number; leaveYear: number; effectiveDate: string; sourceKey: string; leaveId?: string | null },
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
async function pendingTenths(tx: Tx, employeeId: string, policyId: string, year: number, ysm: number, exceptId?: string): Promise<number> {
  const b = leaveYearBounds(year, ysm);
  const r = await tx.hrLeave.aggregate({
    _sum: { days: true },
    where: { employeeId, policyId, status: "PENDING", fromDate: { gte: dbDate(b.from), lte: dbDate(b.to) }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  return tenthsOf(r._sum.days);
}

/** ไฟล์แนบใช้ได้ไหม: ของร้านนี้ · ATTACHMENT · โฟลเดอร์ private · รูปหรือ PDF · ยังไม่ผูกกับใบลาอื่น */
async function fileUsableInTx(tx: Tx, tenantId: string, fileId: string, leaveId: string | null): Promise<boolean> {
  if (!/^[a-z0-9]{16,40}$/i.test(fileId)) return false;
  const f = await tx.fileAsset.findFirst({ where: { id: fileId }, select: { kind: true, path: true, contentType: true } });
  if (!f || f.kind !== "ATTACHMENT" || !f.path.startsWith(`t/${tenantId}/private/`)) return false;
  if (!(/^image\/[a-z0-9.+-]+$/i.test(f.contentType) || f.contentType === "application/pdf")) return false;
  const used = await tx.hrLeave.count({ where: { attachmentKey: fileId, ...(leaveId ? { id: { not: leaveId } } : {}) } });
  return used === 0;
}

/**
 * R3 ขั้นในธุรกรรม (ผู้เรียกถือ hr-leave-emp:<sys>:<emp> แล้ว): ซ้อนใบเดิม (Q13 — ครึ่งเช้า+ครึ่งบ่ายวันเดียวกันได้) → จำนวนวัน > 0 →
 * GRANT (ถ้ายังไม่มี) → คงเหลือ − ใบรออนุมัติอื่น ≥ วันลา (Q3 · ไม่จำกัด = ข้าม) → ไฟล์แนบ · คืน { days, fields = คอลัมน์ H1.2 ของแถวใหม่ }
 */
export async function reserveLeaveInTx(
  tx: Tx,
  ctx: Ctx,
  plan: LeaveRequestPlan,
): Promise<{ days: string; fields: { policyId: string | null; days: string; halfDay: HrHalfDay | null; hours: number | null; attachmentKey: string | null } }> {
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
    await ensureGrantInTx(tx, ctx, plan.emp, plan.policy, plan.leaveYear);
    if (!isUnlimited(plan.policy)) {
      const bal = await sumTxn(tx, { employeeId: plan.employeeId, policyId: plan.policy.id, leaveYear: plan.leaveYear });
      const pend = await pendingTenths(tx, plan.employeeId, plan.policy.id, plan.leaveYear, ysmOf(plan.policy));
      if (bal - pend < tenthsOf(days)) throw new LeaveRuleError(LEAVE_TEXT.balance);
    }
  }
  if (plan.attachmentFileId && !(await fileUsableInTx(tx, ctx.tenantId, plan.attachmentFileId, null))) throw new LeaveRuleError(LEAVE_TEXT.fileBad);
  return { days, fields: { policyId: plan.policy?.id ?? null, days, halfDay: plan.halfDay, hours: plan.hours, attachmentKey: plan.attachmentFileId } };
}

// ═══════════════════════════ ตัดสิน: ตัวช่วยในธุรกรรมของผู้เรียก ═══════════════════════════
export type LeaveLedgerRow = {
  id: string;
  employeeId: string;
  status: HrLeaveStatus;
  fromDate: string;
  toDate: string;
  days: string | null;
  policy: PolicyRow | null;
  startDate: Date | null;
};
/** ใบลา (ใน tx) สำหรับสมุด/ล็อก/event — null = ไม่พบในระบบนี้ */
export async function leaveRowInTx(tx: Tx, leaveId: string): Promise<LeaveLedgerRow | null> {
  const l = await tx.hrLeave.findFirst({
    where: { id: leaveId },
    select: { id: true, employeeId: true, status: true, fromDate: true, toDate: true, days: true, policy: { select: POLICY_SELECT }, employee: { select: { startDate: true } } },
  });
  if (!l) return null;
  return {
    id: l.id,
    employeeId: l.employeeId,
    status: l.status,
    fromDate: dayOf(l.fromDate),
    toDate: dayOf(l.toDate),
    days: l.days === null ? null : fmtTenths(tenthsOf(l.days)),
    policy: l.policy,
    startDate: l.employee.startDate,
  };
}
/** อนุมัติได้ไหม (R6): ใบรุ่นเก่า/ไม่จำกัด = ได้ · อื่น ๆ = GRANT (ถ้ายังไม่มี) แล้ว Σ สมุดของปีนั้น ≥ วันลา */
export async function leaveBalanceCoversInTx(tx: Tx, ctx: Ctx, row: LeaveLedgerRow): Promise<boolean> {
  if (!row.policy || row.days === null || isUnlimited(row.policy)) return true;
  const year = leaveYearOf(row.fromDate, ysmOf(row.policy));
  await ensureGrantInTx(tx, ctx, { id: row.employeeId, startDate: row.startDate }, row.policy, year);
  return (await sumTxn(tx, { employeeId: row.employeeId, policyId: row.policy.id, leaveYear: year })) >= tenthsOf(row.days);
}
/** สมุดตามการเปลี่ยนสถานะ: →APPROVED = USE · APPROVED→(REJECTED|CANCELLED) = คืนครั้งเดียว (เฉพาะที่มี USE) · อื่น ๆ = ไม่เขียน */
export async function leaveLedgerInTx(tx: Tx, ctx: Ctx, row: LeaveLedgerRow, from: string, to: string): Promise<void> {
  if (!row.policy || row.days === null) return; // ใบรุ่นเก่า (Q18)
  const year = leaveYearOf(row.fromDate, ysmOf(row.policy));
  const base = { employeeId: row.employeeId, policyId: row.policy.id, leaveYear: year, effectiveDate: row.fromDate, leaveId: row.id };
  if (to === "APPROVED" && from !== "APPROVED") {
    await insertTxn(tx, ctx, { ...base, kind: "USE", tenths: -tenthsOf(row.days), sourceKey: `use:${row.id}` });
    return;
  }
  if (from === "APPROVED" && (to === "REJECTED" || to === "CANCELLED")) {
    const use = await tx.hrLeaveBalanceTxn.findFirst({ where: { sourceKey: `use:${row.id}` }, select: { days: true } });
    if (use) await insertTxn(tx, ctx, { ...base, kind: "ADJUST", tenths: -tenthsOf(use.days), sourceKey: `use-revert:${row.id}` });
  }
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
 * อนุมัติแต่วันลาไม่พอ = ใบลา CANCELLED + audit รหัส BALANCE (ไม่ throw — Q4) · ข้อผิดพลาดของฐานข้อมูล = throw ⇒ event retry
 */
export async function applyLeaveDecision(input: { tenantId: string; systemId: string; leaveId: string; requestId: string; approved: boolean }): Promise<{ applied: boolean; code?: "BALANCE" }> {
  const ctx: Ctx = { tenantId: str(input?.tenantId), systemId: str(input?.systemId) };
  const id = str(input?.leaveId);
  const requestId = str(input?.requestId);
  if (!ctx.tenantId || !ctx.systemId || !id || !requestId) return { applied: false };
  const approved = input.approved === true;
  type Out = { kind: "noop" } | { kind: "refused" } | { kind: "done"; status: string };
  const out: Out = await tenantDb(ctx).$transaction(async (t): Promise<Out> => {
    const tx = t as unknown as Tx;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave:${id}`}, 0))`;
    const row = await leaveRowInTx(tx, id);
    if (!row || row.status !== "PENDING") return { kind: "noop" };
    const req = await tx.approvalRequest.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, entityType: "HrLeave", entityId: id }, select: { status: true } });
    if (!req || req.status !== (approved ? "APPROVED" : "REJECTED")) return { kind: "noop" };
    await lockLeaveEmployeeInTx(tx, ctx.systemId, row.employeeId);
    await lockRosterKeysInTx(tx, ctx.systemId, leaveRosterKeys(row));
    if (approved && !(await leaveBalanceCoversInTx(tx, ctx, row))) {
      const c = await tx.hrLeave.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
      return c.count === 1 ? { kind: "refused" } : { kind: "noop" };
    }
    const status = approved ? "APPROVED" : "REJECTED";
    const u = await tx.hrLeave.updateMany({ where: { id, status: "PENDING" }, data: { status, decidedById: ENGINE } });
    if (u.count !== 1) return { kind: "noop" };
    await leaveLedgerInTx(tx, ctx, row, "PENDING", status);
    await emitOutbox(tx, leaveDecidedEvent(ctx, row, status, "PENDING"));
    return { kind: "done", status };
  }, LEAVE_TX_OPTS);
  if (out.kind === "refused") {
    await writeAudit({ tenantId: ctx.tenantId, actorType: "SYSTEM", actorId: null, action: "hr.leave.apply_refused", targetType: "HrLeave", targetId: id, after: { leaveId: id, requestId, code: "BALANCE" } });
    return { applied: false, code: "BALANCE" };
  }
  if (out.kind === "done") {
    await writeAudit({ tenantId: ctx.tenantId, actorType: "SYSTEM", actorId: null, action: "hr.leave.decide", targetType: "HrLeave", targetId: id, before: { status: "PENDING" }, after: { status: out.status, decidedById: ENGINE, requestId } });
    return { applied: true };
  }
  return { applied: false };
}

// ═══════════════════════════ งานรายปี (R9) ═══════════════════════════
export type LeaveYearJobResult = { granted: number; carried: number; expired: number };
/**
 * GRANT ของปีการลาปัจจุบัน (เมื่อถึงวันมีสิทธิ์) · CARRY เข้าปีนี้ = carryDays(คงเหลือปีก่อน) เมื่อเพดาน > 0 ·
 * หลังวันหมดอายุ: EXPIRE = expireDays(สะสม, ใช้ไปถึงวันหมดอายุ) · ธุรกรรมละ 1 พนักงานใต้กุญแจพนักงาน · แถวแรกชนะ ⇒ รันซ้ำ = ไม่เปลี่ยน
 */
export async function runLeaveYearJob(input: { tenantId: string; systemId: string; asOf: string | Date }): Promise<LeaveYearJobResult> {
  const ctx: Ctx = { tenantId: str(input?.tenantId), systemId: str(input?.systemId) };
  const asOf = dayKey(input.asOf);
  const res: LeaveYearJobResult = { granted: 0, carried: 0, expired: 0 };
  if (!ctx.tenantId || !ctx.systemId) return res;
  const db = tenantDb(ctx);
  const policies = await db.hrLeavePolicy.findMany({ where: { active: true }, select: POLICY_SELECT, take: 200 });
  if (policies.length === 0) return res;
  const emps = await db.hrEmployee.findMany({ where: { active: true, OR: [{ employmentStatus: null }, { employmentStatus: { not: "ENDED" } }] }, select: { id: true, unitId: true, startDate: true }, take: 5000 });
  // คีย์ที่ควรมี — ข้ามพนักงานที่มีครบแล้ว (ไม่เปิดธุรกรรม)
  const keysOf = (empId: string, p: PolicyRow) => {
    const y = leaveYearOf(asOf, ysmOf(p));
    const exp = carryExpiryOf(y, ysmOf(p), p.carryExpiresMonthDay);
    const carry = tenthsOf(p.carryMaxDays) > 0;
    return [
      ...(isUnlimited(p) ? [] : [`grant:${empId}:${p.id}:${y}`]),
      ...(carry ? [`carry:${empId}:${p.id}:${y}`] : []),
      ...(carry && exp && asOf > exp ? [`expire:${empId}:${p.id}:${y}`] : []),
    ];
  };
  const forEmp = (e: { unitId: string | null }) => policies.filter((p) => p.unitId === null || p.unitId === e.unitId);
  const want = emps.map((e) => ({ e, keys: forEmp(e).flatMap((p) => keysOf(e.id, p)) }));
  const have = new Set(
    (await db.hrLeaveBalanceTxn.findMany({ where: { sourceKey: { in: want.flatMap((w) => w.keys) } }, select: { sourceKey: true }, take: 50_000 })).map((r) => r.sourceKey),
  );
  for (const { e, keys } of want) {
    if (keys.every((k) => have.has(k))) continue;
    const r = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockLeaveEmployeeInTx(tx, ctx.systemId, e.id);
      const one: LeaveYearJobResult = { granted: 0, carried: 0, expired: 0 };
      for (const p of forEmp(e)) {
        const ysm = ysmOf(p);
        const y = leaveYearOf(asOf, ysm);
        one.granted += await ensureGrantInTx(tx, ctx, e, p, y, asOf);
        if (tenthsOf(p.carryMaxDays) <= 0) continue;
        const ck = `carry:${e.id}:${p.id}:${y}`;
        if (!(await tx.hrLeaveBalanceTxn.findFirst({ where: { sourceKey: ck }, select: { id: true } }))) {
          const prev = await sumTxn(tx, { employeeId: e.id, policyId: p.id, leaveYear: y - 1 });
          const c = tenthsOf(carryDays(fmtTenths(prev), p.carryMaxDays));
          one.carried += await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "CARRY", tenths: c, leaveYear: y, effectiveDate: leaveYearBounds(y, ysm).from, sourceKey: ck });
        }
        const exp = carryExpiryOf(y, ysm, p.carryExpiresMonthDay);
        if (!exp || !(asOf > exp)) continue;
        const carried = await sumTxn(tx, { employeeId: e.id, policyId: p.id, leaveYear: y, kind: "CARRY" });
        if (carried <= 0) continue;
        const used = -(await sumTxn(tx, {
          employeeId: e.id,
          policyId: p.id,
          leaveYear: y,
          effectiveDate: { lte: dbDate(exp) },
          OR: [{ kind: "USE" }, { kind: "ADJUST", sourceKey: { startsWith: "use-revert:" } }],
        }));
        const x = tenthsOf(expireDays(fmtTenths(carried), fmtTenths(used)));
        one.expired += await insertTxn(tx, ctx, { employeeId: e.id, policyId: p.id, kind: "EXPIRE", tenths: -x, leaveYear: y, effectiveDate: addDays(exp, 1), sourceKey: `expire:${e.id}:${p.id}:${y}` });
      }
      return one;
    }, LEAVE_TX_OPTS);
    res.granted += r.granted;
    res.carried += r.carried;
    res.expired += r.expired;
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
  attachmentKey: true,
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
    hasAttachment: !!l.attachmentKey,
    needsAttachment: after !== null && days !== null && tenthsOf(days) >= after * 10, // Q10: ธงอย่างเดียว ไม่บล็อกการอนุมัติ
  };
  if (view === "reason") item.reason = l.reason;
  return { ok: true, item };
}

/** ลิงก์เปิดไฟล์แนบ (ผูกผู้ดู · ≤ 15 นาที) — เฉพาะผู้เห็นเหตุผล · กรณีอื่นทุกกรณี = ข้อความเดียวกัน */
export async function leaveAttachmentLink(ctx: Ctx, viewer: LeaveViewer, leaveId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const no = { ok: false as const, reason: LEAVE_TEXT.linkNo };
  const id = str(leaveId);
  const uid = str(viewer?.userId);
  if (!id || !uid) return no;
  const db = tenantDb(ctx);
  const l = await db.hrLeave.findFirst({ where: { id }, select: { fromDate: true, filedById: true, attachmentKey: true, employee: DETAIL_SELECT.employee } });
  if (!l || !l.attachmentKey || leaveViewOf(viewer, l) !== "reason") return no;
  const f = await tenantDb({ tenantId: ctx.tenantId }).fileAsset.findFirst({ where: { id: l.attachmentKey }, select: { id: true, path: true } });
  if (!f || !f.path.startsWith(`t/${ctx.tenantId}/private/`)) return no;
  try {
    return { ok: true, url: privateFileUrl(f.id, { kind: "STAFF", id: uid }, 900) };
  } catch {
    return no;
  }
}

/** แนบไฟล์ (อัปโหลดแล้ว · private) ให้ใบลา — ผู้กด = ตัวพนักงานเอง หรือผู้ยื่นแทน · ใบที่ยังเปิด (รอ/อนุมัติ) */
export async function attachLeaveFile(ctx: Ctx, actor: LeaveViewer, leaveId: string, input: { fileId: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const id = str(leaveId);
  const uid = str(actor?.userId);
  const fileId = str(input?.fileId);
  if (!id || !uid) return { ok: false, reason: LEAVE_TEXT.attachNotYours };
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave:${id}`}, 0))`;
    const l = await tx.hrLeave.findFirst({ where: { id }, select: { status: true, filedById: true, employee: { select: { linkedUserId: true } } } });
    if (!l || !(l.employee.linkedUserId === uid || l.filedById === uid)) return { ok: false as const, reason: LEAVE_TEXT.attachNotYours };
    if (l.status !== "PENDING" && l.status !== "APPROVED") return { ok: false as const, reason: LEAVE_TEXT.attachClosed };
    if (!(await fileUsableInTx(tx, ctx.tenantId, fileId, id))) return { ok: false as const, reason: LEAVE_TEXT.fileBad };
    const u = await tx.hrLeave.updateMany({ where: { id, status: { in: ["PENDING", "APPROVED"] } }, data: { attachmentKey: fileId } });
    return u.count === 1 ? { ok: true as const } : { ok: false as const, reason: LEAVE_TEXT.attachClosed };
  }, LEAVE_TX_OPTS);
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
