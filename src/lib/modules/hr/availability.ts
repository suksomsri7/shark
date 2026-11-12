// HR H4.1 ▸ ตารางกะ → เวลาจองของพนักงาน (X-HR.1 ตัวจริงหลัง seam SVC B.1) · คำใบ้หาคนแทนเมื่อมีใบลา · แจ้งครั้งเดียวต่อใบลาที่อนุมัติ
//
// staffWindows(StaffWindowsInput) → StaffWindowsRow[] (ลายเซ็นของ SVC B.1 — 🔴 ห้ามเปลี่ยน · hr/index.ts re-export ล้วน)
//   R6 แถวต่อพนักงานที่ส่งมา (ลำดับเดิม · ตัดซ้ำ) ที่เป็นพนักงานของร้านนี้ในระบบ HR ที่ active:
//      "จัดกะด้วยตาราง" = มีแถวประกาศแล้วในสัปดาห์ (จ.–อา. ไทย) ของวันนั้น หรือกะดึกที่เริ่ม D−1 ⇒ { employeeId, windows, breaks: [] } ·
//      หรือเป็นผู้ยกกะในสัปดาห์นั้นที่อนุมัติแล้ว (H2.3) · ไม่ใช่ ⇒ ไม่มีแถว (booking ใช้แหล่งถัดไปเหมือนเดิม) · R7 ENDED / active=false / นอกช่วงจ้าง ⇒ windows [] เสมอ
//   R8 ร้านอื่น · ไม่รู้จัก · ระบบปิด · วันเสีย · ไม่มี id ⇒ ไม่มีแถว (ไม่มี id = ไม่แตะฐาน) · ประกาศแล้ว = publishedAt ≠ null (Q3) · อ่านอย่างเดียว
//   หน้าต่างคิดด้วย availability-rules.ts#dayWindows (ล้วน) · breaks [] (Q4 — ตารางเก็บแค่จำนวนนาทีพัก)
// leaveDutyHints(ctx, viewer, { leaveId }) R9/R11 — กะของคนลาในช่วงใบลา (PENDING/APPROVED) + คนที่อยู่กะเดียวกัน + คนที่ว่างมาแทน ·
//   ผู้ไม่มีสิทธิ์/ไม่พบ/ร้านอื่น = ข้อความเดียวกันทุกไบต์ · ไม่มีเหตุผล/ประเภทการลา
// leaveDutyNotify({ tenantId, systemId, leaveId }) R10 — ผู้บริโภค hr.leave.decided (APPROVED) เรียก · ธุรกรรมเดียวใต้ล็อก hr-leave-hint:<id> ·
//   audit hr.leave.duty_hint = กุญแจกันซ้ำ (ส่งซ้ำ/พร้อมกัน/ถอนอนุมัติภายหลัง = ไม่เขียนเพิ่ม · ไม่ถอนข้อความ Q10)
// 🔴 ไม่ยกเลิก/ไม่ย้ายนัดจองใด ๆ (R13) · ไม่ import โมดูลอื่น · เขียนได้แค่ appNotification + auditLog (createMany ใน tx เดียว)
// ◂ HR H4.1
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { dayWindows, isValidDay, prevDayOf, type AvailabilityLeave } from "./availability-rules";
import { addDays, paidMinutes } from "./time-rules";
import { weekStartOf } from "./roster-rules";
import { hrScopeOf } from "./scope";

type Ctx = { tenantId: string; systemId: string };
// ตัวอ่านที่ใช้ร่วมกันระหว่าง tenantDb(ctx) กับ tx ของมัน (เฉพาะ delegate ที่ใช้)
type Db = Pick<ReturnType<typeof tenantDb>, "hrRosterEntry" | "hrEmployee" | "hrLeave">;

// SVC B.1 — field lists byte-identical (re-export จาก hr/index.ts)
export type StaffWindowsInput = { tenantId: string; unitId: string; date: string; employeeIds: string[] };
export type StaffWindowsRow = {
  employeeId: string;
  windows: { startMin: number; endMin: number }[];
  breaks: { startMin: number; endMin: number }[];
};

/** ข้อความคงที่ (ห้ามต่อชื่อ/id/ประเภทการลา) */
export const DUTY_HINT_TEXT = {
  hintNo: "ไม่พบใบลานี้ หรือคุณไม่มีสิทธิ์ดูผลกระทบต่อกะ",
  notifyTitle: "มีกะที่ต้องหาคนแทน",
  notifyBody: "ใบลาที่อนุมัติแล้วทำให้กะ {n} กะยังไม่มีคนแทน — เปิดหน้าการลาเพื่อดูคนที่ว่าง",
} as const;
export const DUTY_HINT_AUDIT = "hr.leave.duty_hint";

const DAY_MS = 86_400_000;
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`); // รูปเดียวกับคอลัมน์ @db.Date
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const dayIndex = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type EmpLife = { active: boolean; employmentStatus: string | null; startDate: Date | null; endDate: Date | null; contractEndAt: Date | null };
const isEnded = (e: EmpLife) => !e.active || e.employmentStatus === "ENDED";
/** วันนั้นอยู่ในช่วงการจ้าง: startDate ≤ วัน ≤ (endDate ?? contractEndAt ?? ไม่มีกำหนด) — สูตรเดียวกับ roster.ts */
function inEmployment(e: EmpLife, day: string): boolean {
  if (e.startDate && day < dayOf(e.startDate)) return false;
  const last = e.endDate ?? e.contractEndAt;
  return !(last && day > dayOf(last));
}
const leaveRule = (l: { fromDate: Date; toDate: Date; status: string; halfDay: string | null; hours: unknown }): AvailabilityLeave => ({
  fromDate: dayOf(l.fromDate),
  toDate: dayOf(l.toDate),
  status: l.status,
  halfDay: l.halfDay,
  hours: l.hours === null || l.hours === undefined ? null : String(l.hours),
});
/** ใบลาครึ่งวัน = AM/PM ที่ไม่มีชั่วโมง · อื่น ๆ (เต็มวัน · ชั่วโมง Q5) = ทั้งวัน */
const isWholeDay = (l: { halfDay: string | null; hours: unknown }) => !(l.hours === null && (l.halfDay === "AM" || l.halfDay === "PM"));
const covers = (l: { fromDate: Date; toDate: Date }, day: string) => dayOf(l.fromDate) <= day && day <= dayOf(l.toDate);

// ═══════════════════════════ staffWindows (R6–R8) ═══════════════════════════
export async function staffWindows(i: StaffWindowsInput): Promise<StaffWindowsRow[]> {
  const tenantId = typeof i?.tenantId === "string" ? i.tenantId : "";
  const unitId = typeof i?.unitId === "string" ? i.unitId.trim() : "";
  const day = typeof i?.date === "string" ? i.date.trim() : "";
  const ids = [...new Set((Array.isArray(i?.employeeIds) ? i.employeeIds : []).filter((x): x is string => typeof x === "string" && x !== ""))];
  if (!tenantId || !unitId || !isValidDay(day) || ids.length === 0) return [];
  const prev = prevDayOf(day) as string;
  const week0 = weekStartOf(day);
  const week6 = addDays(week0, 6);
  const from = prev < week0 ? prev : week0;
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR", active: true }, select: { id: true }, orderBy: { id: "asc" }, take: 50 });
  const rows = new Map<string, StaffWindowsRow>();
  for (const { id: systemId } of systems) {
    const db = tenantDb({ tenantId, systemId });
    const emps = await db.hrEmployee.findMany({
      where: { tenantId, systemId, id: { in: ids } },
      select: { id: true, active: true, employmentStatus: true, startDate: true, endDate: true, contractEndAt: true },
    });
    if (emps.length === 0) continue;
    const empIds = emps.map((e) => e.id);
    const [entries, leaves, gaveAway] = await Promise.all([
      db.hrRosterEntry.findMany({
        where: { tenantId, systemId, employeeId: { in: empIds }, publishedAt: { not: null }, date: { gte: dbDate(from), lte: dbDate(week6) } },
        select: { employeeId: true, date: true, unitId: true, startMin: true, endMin: true, crossesMidnight: true },
        take: 20_000,
      }),
      db.hrLeave.findMany({
        where: { tenantId, systemId, employeeId: { in: empIds }, status: "APPROVED", fromDate: { lte: dbDate(day) }, toDate: { gte: dbDate(prev) } },
        select: { employeeId: true, fromDate: true, toDate: true, status: true, halfDay: true, hours: true },
      }),
      // ยกกะให้คนอื่นแล้ว (H2.3 อนุมัติ) = ยังจัดกะด้วยตารางในสัปดาห์นั้น — วันนั้นว่างเพราะตารางกะ ไม่ใช่เพราะไม่มีตาราง (ไม่ตกไปเวลาร้านทั้งวัน)
      db.hrShiftSwapRequest.findMany({
        where: { tenantId, systemId, status: "APPROVED", requesterEmployeeId: { in: empIds }, fromEntry: { publishedAt: { not: null }, date: { gte: dbDate(week0), lte: dbDate(week6) } } },
        select: { requesterEmployeeId: true },
        take: 5000,
      }),
    ]);
    const gave = new Set(gaveAway.map((g) => g.requesterEmployeeId));
    for (const e of emps) {
      const mine = entries.filter((r) => r.employeeId === e.id).map((r) => ({ date: dayOf(r.date), unitId: r.unitId, startMin: r.startMin, endMin: r.endMin, crossesMidnight: r.crossesMidnight }));
      if (isEnded(e) || !inEmployment(e, day)) {
        rows.set(e.id, { employeeId: e.id, windows: [], breaks: [] }); // R7 — ไม่ปล่อยให้ตกไปแหล่งถัดไป
        continue;
      }
      const managed = gave.has(e.id) || mine.some((r) => (r.date >= week0 && r.date <= week6) || (r.date === prev && r.crossesMidnight));
      if (!managed) continue; // R6 ไม่มีตารางกะ ⇒ ไม่มีแถว
      const windows = dayWindows({
        day,
        unitId,
        entries: mine.filter((r) => r.date === day || r.date === prev),
        leaves: leaves.filter((l) => l.employeeId === e.id).map(leaveRule),
      });
      rows.set(e.id, { employeeId: e.id, windows, breaks: [] });
    }
  }
  return ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
}

// ═══════════════════════════ คำใบ้หาคนแทน (R9 · R11) ═══════════════════════════
export type DutyHintViewer = Pick<MembershipCtx, "role" | "permissions"> & { unitAccess: unknown; userId?: string | null };
export type DutyHintCandidate = { employeeId: string; name: string; weekMin: number; weekMinAfter: number };
export type DutyHintItem = {
  entryId: string;
  date: string;
  unitId: string | null;
  startMin: number;
  endMin: number;
  crossesMidnight: boolean;
  part: "FULL" | "AM" | "PM" | "HOURS";
  others: number;
  candidates: DutyHintCandidate[];
};
export type DutyHintResult = { ok: true; items: DutyHintItem[] } | { ok: false; reason: string };

/** R11 ผู้ดูคำใบ้: OWNER · MANAGER ในขอบเขตสาขาประจำของพนักงาน · STAFF ที่มี hr.leave.decide ในขอบเขตเดียวกัน — ไม่ใช่ตัวคนลาเอง */
function canSeeHint(v: DutyHintViewer | null | undefined, emp: { unitId: string | null; linkedUserId: string | null }): boolean {
  if (!v || typeof v !== "object") return false;
  if (emp.linkedUserId && v.userId && v.userId === emp.linkedUserId) return false;
  if (v.role === "OWNER") return true;
  const scope = hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
  const inScope = scope.unitIds === "*" || (!!emp.unitId && scope.unitIds.includes(emp.unitId));
  if (!inScope) return false;
  if (v.role === "MANAGER") return true;
  const p = (v.permissions ?? {}) as Record<string, unknown>;
  return v.role === "STAFF" && (p["hr.leave.decide"] === true || p["hr.*"] === true);
}

type HintLeave = { id: string; employeeId: string; fromDate: Date; toDate: Date; status: string; halfDay: string | null; hours: unknown };
const partOf = (l: HintLeave): DutyHintItem["part"] => (l.hours !== null && l.hours !== undefined ? "HOURS" : l.halfDay === "AM" ? "AM" : l.halfDay === "PM" ? "PM" : "FULL");

/** รายการกะของใบลา (อ่านอย่างเดียว · ใช้ db ของผู้เรียก — tx ได้) */
async function hintItems(db: Db, ctx: Ctx, leave: HintLeave): Promise<DutyHintItem[]> {
  if (leave.status !== "PENDING" && leave.status !== "APPROVED") return [];
  const { tenantId, systemId } = ctx;
  const own = await db.hrRosterEntry.findMany({
    where: { tenantId, systemId, employeeId: leave.employeeId, publishedAt: { not: null }, date: { gte: leave.fromDate, lte: leave.toDate } },
    select: { id: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
    take: 500,
  });
  if (own.length === 0) return [];
  const mine = own
    .map((r) => ({ ...r, day: dayOf(r.date) }))
    .sort((a, b) => byCode(a.day, b.day) || a.startMin - b.startMin || byCode(a.id, b.id));
  const days = [...new Set(mine.map((r) => r.day))];
  const weeks = days.map((d) => weekStartOf(d));
  const lo = addDays(weeks.reduce((a, b) => (a < b ? a : b)), -1);
  const hi = addDays(weeks.reduce((a, b) => (a > b ? a : b)), 7);
  const [emps, entries, leaves] = await Promise.all([
    db.hrEmployee.findMany({
      where: { tenantId, systemId },
      select: { id: true, name: true, unitId: true, active: true, employmentStatus: true, startDate: true, endDate: true, contractEndAt: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } },
      take: 5000,
    }),
    db.hrRosterEntry.findMany({
      where: { tenantId, systemId, publishedAt: { not: null }, date: { gte: dbDate(lo), lte: dbDate(hi) } },
      select: { id: true, employeeId: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
      take: 50_000,
    }),
    db.hrLeave.findMany({
      where: { tenantId, systemId, status: "APPROVED", fromDate: { lte: dbDate(hi) }, toDate: { gte: dbDate(lo) } },
      select: { employeeId: true, fromDate: true, toDate: true, halfDay: true, hours: true },
      take: 20_000,
    }),
  ]);
  const empById = new Map(emps.map((e) => [e.id, e]));
  const leavesOf = (id: string) => leaves.filter((l) => l.employeeId === id);
  const fullLeaveOn = (id: string, day: string) => leavesOf(id).some((l) => isWholeDay(l) && covers(l, day));
  const anyLeaveOn = (id: string, day: string) => leavesOf(id).some((l) => covers(l, day));
  const rows = entries.map((r) => ({ ...r, day: dayOf(r.date) }));
  const abs = (r: { day: string; startMin: number; endMin: number; crossesMidnight: boolean }) => {
    const base = dayIndex(r.day) * 1440;
    return { s: base + r.startMin, e: base + (r.crossesMidnight ? r.endMin + 1440 : r.endMin) };
  };
  const paid = (r: { startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean }) => {
    try {
      return paidMinutes(r);
    } catch {
      return 0;
    }
  };
  const lead = empById.get(leave.employeeId);
  const out: DutyHintItem[] = [];
  for (const it of mine) {
    const others = new Set(
      rows
        .filter((r) => r.day === it.day && r.shiftId === it.shiftId && r.unitId === it.unitId && r.employeeId !== leave.employeeId)
        .map((r) => r.employeeId)
        .filter((id) => {
          const e = empById.get(id);
          return !!e && !isEnded(e) && !fullLeaveOn(id, it.day);
        }),
    ).size;
    const unit = it.unitId ?? (lead ? unitOfDayOf(lead, it.day) : null);
    const w = abs(it);
    const week0 = weekStartOf(it.day);
    const week6 = addDays(week0, 6);
    const thisPaid = paid(it);
    const candidates: DutyHintCandidate[] = [];
    for (const e of emps) {
      if (e.id === leave.employeeId || isEnded(e) || !inEmployment(e, it.day)) continue;
      if (unitOfDayOf(e, it.day) !== unit) continue;
      if (anyLeaveOn(e.id, it.day)) continue;
      const theirs = rows.filter((r) => r.employeeId === e.id);
      if (theirs.some((r) => {
        const x = abs(r);
        return x.s < w.e && w.s < x.e;
      })) continue;
      const weekMin = theirs.filter((r) => r.day >= week0 && r.day <= week6 && !fullLeaveOn(e.id, r.day)).reduce((n, r) => n + paid(r), 0);
      candidates.push({ employeeId: e.id, name: e.name, weekMin, weekMinAfter: weekMin + thisPaid });
    }
    candidates.sort((a, b) => a.weekMin - b.weekMin || byCode(a.name, b.name) || byCode(a.employeeId, b.employeeId));
    out.push({ entryId: it.id, date: it.day, unitId: it.unitId, startMin: it.startMin, endMin: it.endMin, crossesMidnight: it.crossesMidnight, part: partOf(leave), others, candidates });
  }
  return out;
}

/** R3 ของ H2.1: สาขาของวัน = ยืมตัวที่ครอบวันนั้น (fromDate ล่าสุด แล้ว id) ไม่งั้นสาขาประจำ (สูตรเดียวกับ roster.ts#unitOfDay) */
function unitOfDayOf(emp: { unitId: string | null; units: { id: string; unitId: string; fromDate: Date; toDate: Date | null }[] }, day: string): string | null {
  const cover = emp.units
    .filter((b) => dayOf(b.fromDate) <= day && (!b.toDate || dayOf(b.toDate) >= day))
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime() || byCode(b.id, a.id));
  return cover[0]?.unitId ?? emp.unitId ?? null;
}

const LEAVE_SELECT = {
  id: true,
  employeeId: true,
  fromDate: true,
  toDate: true,
  status: true,
  halfDay: true,
  hours: true,
  employee: { select: { unitId: true, linkedUserId: true } },
} as const satisfies Prisma.HrLeaveSelect;

export async function leaveDutyHints(ctx: Ctx, viewer: DutyHintViewer | null, input: { leaveId: string }): Promise<DutyHintResult> {
  const no = { ok: false as const, reason: DUTY_HINT_TEXT.hintNo };
  const leaveId = typeof input?.leaveId === "string" ? input.leaveId : "";
  if (!ctx?.tenantId || !ctx?.systemId || !leaveId) return no;
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const leave = await db.hrLeave.findFirst({ where: { id: leaveId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: LEAVE_SELECT });
  if (!leave || !canSeeHint(viewer, leave.employee)) return no;
  const items = await hintItems(db, ctx, { ...leave, hours: leave.hours === null ? null : String(leave.hours) });
  return { ok: true, items };
}

// ═══════════════════════════ แจ้งครั้งเดียวต่อใบลาที่อนุมัติ (R10) ═══════════════════════════
export type DutyNotifyResult = { notified: number; uncovered: number };

export async function leaveDutyNotify(input: { tenantId: string; systemId: string; leaveId: string }): Promise<DutyNotifyResult> {
  const none = { notified: 0, uncovered: 0 };
  const { tenantId, systemId, leaveId } = input ?? ({} as typeof input);
  if (typeof tenantId !== "string" || !tenantId || typeof systemId !== "string" || !systemId || typeof leaveId !== "string" || !leaveId) return none;
  const ctx = { tenantId, systemId };
  return tenantDb(ctx).$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave-hint:${leaveId}`}, 0))::text AS k`;
    const leave = await tx.hrLeave.findFirst({ where: { id: leaveId, tenantId, systemId }, select: LEAVE_SELECT });
    if (!leave || leave.status !== "APPROVED") return none;
    const done = await tx.auditLog.findFirst({ where: { tenantId, action: DUTY_HINT_AUDIT, targetId: leaveId }, select: { id: true } });
    if (done) return none;
    const items = await hintItems(tx, ctx, { ...leave, hours: leave.hours === null ? null : String(leave.hours) });
    const uncovered = items.filter((x) => x.others === 0).length;
    if (uncovered === 0) return none;
    const members = await tx.membership.findMany({
      where: { tenantId, acceptedAt: { not: null } },
      select: { userId: true, role: true, unitAccess: true, permissions: true },
      orderBy: { userId: "asc" },
      take: 2000,
    });
    const recipients = members
      .filter((m) => canSeeHint({ role: m.role, unitAccess: m.unitAccess, permissions: (m.permissions ?? {}) as Record<string, unknown>, userId: m.userId }, leave.employee))
      .map((m) => m.userId);
    const body = DUTY_HINT_TEXT.notifyBody.replace("{n}", String(uncovered));
    if (recipients.length) await tx.appNotification.createMany({ data: recipients.map((recipientUserId) => ({ tenantId, recipientUserId, title: DUTY_HINT_TEXT.notifyTitle, body })) });
    await tx.auditLog.createMany({
      data: [{ tenantId, actorType: "SYSTEM", actorId: null, action: DUTY_HINT_AUDIT, targetType: "HrLeave", targetId: leaveId, after: { leaveId, uncovered, recipients: recipients.length } }],
    });
    return { notified: recipients.length, uncovered };
  });
}
