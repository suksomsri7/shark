// hr/pos-seam.ts — รอยต่อ HR ↔ POS ฉบับ C-8 v2 (POS P3.5 · มติ 5 · ledger/POS-CONTRACTS.md C-8)
//
// 🔴 4 ชื่อที่แช่แข็ง: onShiftToday · workedMinutesBetween · clockSelf · adjustmentStatuses — POS เรียกผ่าน `@/lib/modules/hr` (index.ts) เท่านั้น
//    HR เปลี่ยน "ตัวใน" ได้เอง (H2.1 roster แทนตารางรายสัปดาห์ · H1.1 แกนสาขา · H2.4 ย้าย clock ไป hr/clock.ts) โดย POS ไม่ต้องแก้ ·
//    รูปร่างอินพุต/ผลลัพธ์ห้ามเปลี่ยน (เพิ่มฟิลด์ได้)
// 🔴 ไฟล์ของ HR ที่เลน POS เขียน (มติ 5): ประกอบจากฟังก์ชันของ HR เอง (service/rules) + ตัวอ่าน pos-seam-read.ts ·
//    เขียนตาราง HR ทางเดียว = `clock()` ของ service.ts (ไม่มีคำสั่งเขียน/SQL ดิบในไฟล์นี้) · ไม่ import โมดูล POS
// 🔴 ไม่มีข้อมูลเงิน/ชนิดการลา/เหตุผลการลาในผลลัพธ์ (privacy [L] — จอล็อกเป็นเครื่องกลางของร้าน)
import { bkkParts, clock, employeeOfUser, getSchedule, isOnLeave, nextClockKind } from "./service";
import { workedMinutes } from "./rules";
import { adjustmentStatusRows, attendanceBetween, attendanceMarks, employeeActiveOf, hrSystemIdsOf } from "./pos-seam-read";

export type PosSeamSchedule = { startMin: number; endMin: number; graceMin: number; dayOff: boolean };
/** สถานะการลงเวลาของวันไทยของ `at` (ไม่เกิน `at`): IN แรกของวัน · รายการล่าสุด (ไม่จำกัดวัน) — ใช้คำเตือนชั่วโมงของกะ (R12 · CD-6) */
export type PosSeamClockMarks = { firstInAt: string | null; lastKind: "IN" | "OUT" | null; lastAt: string | null };
export type OnShiftTodayItem = {
  userId: string;
  employeeId: string;
  active: boolean;
  onLeave: boolean;
  /** ตารางของวันในสัปดาห์ (เวลาไทย) ของ `at` · null = ยังไม่ตั้ง (ห้ามกล่าวหาจากข้อมูลที่ไม่มี) */
  schedule: PosSeamSchedule | null;
  clock: PosSeamClockMarks;
  /** POS P3.5 ▸ fix2 N6: ตารางของวันก่อน/วันถัดไป (กะข้ามเที่ยงคืน · เพิ่มล้วน) ◂ */
  adjacent: { yesterday: PosSeamSchedule | null; tomorrow: PosSeamSchedule | null };
};
export type OnShiftTodayResult = { hrLinked: boolean; items: OnShiftTodayItem[] };
export type ClockSelfResult = { ok: true; kind: "IN" | "OUT"; judgement?: string | null } | { ok: false; code: "NO_EMPLOYEE" | "ALREADY_CLOCKED" };

const MAX_USERS = 500;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const validDate = (v: unknown): v is Date => v instanceof Date && Number.isFinite(v.getTime());

/**
 * ใครในชุดผู้ใช้นี้เป็นพนักงาน HR + สถานะของวันนี้ (ณ `at`): active · ลา APPROVED (วันไทย) · ตารางของวันนั้น · การลงเวลา
 * items = เฉพาะผู้ใช้ที่ผูกกับ HrEmployee (linkedUserId) · ร้านไม่มีระบบ HR = { hrLinked:false, items:[] }
 * `unitId` รับไว้แต่ยังไม่ใช้ — HrEmployee ยังไม่มีแกนสาขาจนกว่า HR H1.1 (วันนั้น HR กรองให้เอง ชื่อและรูปร่างเดิม)
 */
export async function onShiftToday(input: { tenantId: string; unitId?: string | null; at: Date; userIds: string[] }): Promise<OnShiftTodayResult> {
  const tenantId = input?.tenantId;
  if (!isId(tenantId)) return { hrLinked: false, items: [] };
  const systems = await hrSystemIdsOf(tenantId);
  if (systems.length === 0) return { hrLinked: false, items: [] };
  const at = validDate(input.at) ? input.at : new Date();
  const { weekday, dateStr } = bkkParts(at);
  const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
  const userIds = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).filter(isId))].slice(0, MAX_USERS);
  const items: OnShiftTodayItem[] = [];
  for (const userId of userIds) {
    const emp = await employeeOfUser(tenantId, userId);
    if (!emp) continue;
    const ctx = { tenantId, systemId: emp.systemId };
    const [active, onLeave, week, marks] = await Promise.all([
      employeeActiveOf(ctx, emp.employeeId),
      isOnLeave(tenantId, userId, at),
      getSchedule(ctx, emp.employeeId),
      attendanceMarks(ctx, emp.employeeId, dayStart, at),
    ]);
    const row = week[weekday] ?? null;
    const sch = (r: { startMin: number; endMin: number; graceMin: number; dayOff: boolean } | null | undefined): PosSeamSchedule | null =>
      r ? { startMin: r.startMin, endMin: r.endMin, graceMin: r.graceMin, dayOff: r.dayOff } : null;
    items.push({
      userId,
      employeeId: emp.employeeId,
      active: active === true,
      onLeave,
      schedule: row ? { startMin: row.startMin, endMin: row.endMin, graceMin: row.graceMin, dayOff: row.dayOff } : null,
      clock: {
        firstInAt: marks.firstInAt ? marks.firstInAt.toISOString() : null,
        lastKind: marks.lastKind === "IN" || marks.lastKind === "OUT" ? marks.lastKind : null,
        lastAt: marks.lastAt ? marks.lastAt.toISOString() : null,
      },
      adjacent: { yesterday: sch(week[(weekday + 6) % 7]), tomorrow: sch(week[(weekday + 1) % 7]) }, // POS P3.5 ▸ fix2 N6 ◂
    });
  }
  return { hrLinked: true, items };
}

/** นาทีทำงานของผู้ใช้ในช่วง [from, to] — จับคู่ IN/OUT ด้วยกติกาของ HR (rules.workedMinutes) · ไม่ใช่พนักงาน/ช่วงผิด = 0 */
export async function workedMinutesBetween(input: { tenantId: string; userId: string; from: Date; to: Date }): Promise<number> {
  if (!isId(input?.tenantId) || !isId(input.userId) || !validDate(input.from) || !validDate(input.to) || input.to.getTime() < input.from.getTime()) return 0;
  const emp = await employeeOfUser(input.tenantId, input.userId);
  if (!emp) return 0;
  const events = await attendanceBetween({ tenantId: input.tenantId, systemId: emp.systemId }, emp.employeeId, input.from, input.to);
  return workedMinutes(events);
}

/**
 * ลงเวลาของตัวเอง (ผู้ใช้ที่ผูกกับพนักงาน active) — ชนิดที่ขอต้องตรงกับ "ครั้งถัดไปของวันนี้" ของ HR (nextClockKind) ไม่งั้น ALREADY_CLOCKED
 * (กดซ้ำ = ไม่เพิ่มแถว · กันซ้ำที่ฐาน) · ไม่ผูก/ลาออกแล้ว = NO_EMPLOYEE · เขียนผ่าน clock() ของ HR เท่านั้น (คำตัดสินสาย/ตรงเวลาเป็นของ HR)
 */
export async function clockSelf(input: { tenantId: string; userId: string; kind: "IN" | "OUT"; note?: string | null }): Promise<ClockSelfResult> {
  if (!isId(input?.tenantId) || !isId(input.userId) || (input.kind !== "IN" && input.kind !== "OUT")) return { ok: false, code: "NO_EMPLOYEE" };
  const emp = await employeeOfUser(input.tenantId, input.userId);
  if (!emp) return { ok: false, code: "NO_EMPLOYEE" };
  const ctx = { tenantId: input.tenantId, systemId: emp.systemId };
  if ((await employeeActiveOf(ctx, emp.employeeId)) !== true) return { ok: false, code: "NO_EMPLOYEE" };
  const next = await nextClockKind(ctx, emp.employeeId);
  if (next !== input.kind) return { ok: false, code: "ALREADY_CLOCKED" };
  const note = typeof input.note === "string" ? input.note.slice(0, 200) : null;
  const r = await clock(ctx, { employeeId: emp.employeeId, kind: input.kind, note });
  return { ok: true, kind: input.kind, judgement: r.judgement };
}

/** สถานะของรายการปรับเงินเดือน (HrPayAdjustment) ตาม id — PENDING/APPROVED/REJECTED + รอบจ่าย (runId) · ข้ามร้าน/ไม่พบ = ไม่อยู่ในผล */
export async function adjustmentStatuses(input: { tenantId: string; ids: string[] }): Promise<{ id: string; status: string; runId: string | null; periodKey: string }[]> { // POS P3.5 ▸ fix2 N1: + periodKey (เพิ่มล้วน) ◂
  if (!isId(input?.tenantId) || !Array.isArray(input.ids)) return [];
  return adjustmentStatusRows(input.tenantId, input.ids);
}
