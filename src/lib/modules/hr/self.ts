// HR H2.10 ▸ "ของฉัน" — ทางเดียวของหน้าบริการตัวเอง (/app/me/hr) เข้าสู่ระบบ HR (brief hr-brief-H2.10 R2–R11)
//
// 🔴 ความปลอดภัยก่อน: พนักงาน "ได้มาจากบัญชีที่ล็อกอินเท่านั้น" — ทุกฟังก์ชันเรียก resolveSelf(actor) → employeeOfUser (H0.7: 1 ร้าน ≤ 1 แถว)
//   ไม่มีฟังก์ชันใดอ่าน employeeId / userId / systemId / tenantId จาก input (ค่าที่ติดมากับ input หรือคีย์เกินบน actor = ไม่ถูกอ่าน) ·
//   id ต่างชาติตัวเดียวที่รับ = เพื่อนที่จะรับกะ (ต้องอยู่ใน mySwapTargets ของกะต้นทางนั้น — R9) ·
//   id ของรายการ (ใบลา · OT · สลับกะ · แก้เวลา · เบิกล่วงหน้า · บันทึก) ต้องเป็นของตัวเอง ตรวจก่อนเรียก service — ไม่ใช่ = SELF_TEXT.notFound
//   (ไบต์เดียวกันทุกกรณี: ไม่มี · ของคนอื่น · สาขาอื่น · ร้านอื่น) · ไม่ผูกบัญชี = noEmployee จากทุกฟังก์ชัน (ไม่ throw · ไม่เขียน) ·
//   พ้นสภาพ (ENDED / ปิดสถานะ) = ตัวอ่านคืนประวัติของตัวเอง · ตัวเขียน = inactive (ไม่เขียน)
// กติกาธุรกิจไม่อยู่ที่นี่: ทุกตัวเขียนเรียก service เดิม (H2.3 สลับกะ · H2.4 ลงเวลา · H2.6 แก้เวลา · H2.7 ใบลา · H2.9 OT · H4.4 บันทึก ·
//   payroll.requestAdjustment) — ข้อความปฏิเสธ = ของ service ตรงตัว · ช่องว่างเดียวที่ปิดที่นี่ = เบิกล่วงหน้าแบบเล็กที่สุด (R6) ·
//   ไฟล์ server ล้วน (ไม่ใช่ "use server") — หน้า/ปุ่มเรียกผ่าน self-actions.ts · `opts.now` ใช้ในข้อสอบเท่านั้น ◂
import { cache } from "react";
import type { HrLeaveType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { employeeOfUser, requestLeave, cancelLeave, HrLeaveRequestError, leaveCancelOpen, type Ctx } from "./service";
import { CLOCK_TEXT, mobileClock, myClockState } from "./clock";
import { mobileClockPayloadOf } from "./clock-rules";
import { activeLeavePolicies, leaveRefusalText, myLeaveBalances, type LeaveBalanceItem } from "./leave";
import { countLeaveDays, fmtTenths, tenthsOf } from "./leave-rules";
import { leaveDaysBetween } from "./time-rules";
import { cancelOtRequest, myOtRequests, otCancelOpen, requestOt } from "./ot";
import { cancelSwap, listMySwaps, requestSwap, respondSwap, swapCandidatesAccepted, SWAP_REFUSAL } from "./swap";
import { cancelCorrection, correctablePunches, correctionCancelOpen, myCorrections, requestCorrection } from "./correction";
import { CORRECTION_RULES } from "./correction-rules";
import { acknowledgeReviewNote, myReviewNotes, type MyReviewNoteItem } from "./lifecycle";
import { cancelSelfAdvance, requestSelfAdvance, selfAdvanceCancelOpen, SELF_ADVANCE_NOTE_MAX } from "./payroll";
import { rosterOnDay } from "./roster";
import { myStockCharges, type MyStockCharge } from "./stock-charge";
import { holidaysBetween } from "./holidays";
import { unitNamesOf } from "./scope";
import { addDays, bkkDayKey, shiftWindow, TimeRuleError } from "./time-rules";
import { finalizedOf, slipState } from "./payslip-rules"; // HR H3.8 ▸ สลิปที่ออกแล้ว (pure) ◂
// HR H3.8 ▸ ทางเข้าของหน้า "ของฉัน" (ใต้ /app/me/hr) สู่สลิป/หนังสือรับรองเงินเดือน — หน้าและ route ของฉัน import ผ่าน facade นี้เท่านั้น (H2.10 R3) ·
//   ทุกตัวได้พนักงานจาก resolveSelf (payslip.ts) · ไม่มีตัวใดรับรหัสพนักงานจากผู้เรียก ◂
export { mySlip, mySlips } from "./payslip";
export { myPayslipPdfGet, mySalaryCertGet } from "./payslip-route";
export { MySalaryCertCard, MySlipYears, SlipCard, SlipDataNotice, mySlipHistory, mySlipPdfHref } from "./payslip-ui";

// ═══════════════════════════ ข้อความคงที่ (§3 · ไม่มีชื่อคน/รหัสใด ๆ) ═══════════════════════════
export const SELF_TEXT = {
  noEmployee: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงานของร้านนี้ — ขอให้ผู้จัดการผูกบัญชีให้ก่อน",
  inactive: CLOCK_TEXT.mInactive,
  notFound: "ไม่พบรายการนี้ในคำขอของคุณ — เปิดหน้าใหม่แล้วลองอีกครั้ง",
  advAmount: "ระบุยอดเบิกเป็นบาทเต็ม ตั้งแต่ 1 ถึง 50,000 บาท",
  advOpen: "มีคำขอเบิกล่วงหน้าที่รออนุมัติอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  advNote: "หมายเหตุยาวเกินไป (ไม่เกิน 200 ตัวอักษร)",
  advClosed: "ยังยื่นเบิกล่วงหน้าไม่ได้ — งวดเดือนนี้และเดือนหน้าปิดรอบจ่ายแล้ว",
} as const;
/** ข้อความกลางเมื่อ service ล้มด้วยเหตุที่ไม่ใช่การปฏิเสธ (ไม่ส่งข้อความระบบออกไป) */
const FAILED_TEXT = "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง";
const PICK_DATES_TEXT = "เลือกวันที่เริ่มและวันที่สิ้นสุดการลา";
/** แทน SWAP_REFUSAL.leavePeer สำหรับผู้ขอ (มติ r2 — ไม่บอกว่าเพื่อนคนที่เลือกลา) */
const SWAP_PEER_UNAVAILABLE = "เพื่อนร่วมงานคนนี้รับกะวันนั้นไม่ได้ — เลือกคนอื่น";
/** H2.7 D4 / H2.6 D6 ▸ ข้อความสถานะใบลาสำหรับเจ้าของใบ (รวมใบที่ระบบยกเลิกให้เพราะวันลาไม่พอ/เป็นวันหยุดทั้งหมด) ◂ */
const LEAVE_STATUS_TEXT: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิกแล้ว",
  BALANCE: "ระบบยกเลิกให้ — วันลาคงเหลือไม่พอตอนอนุมัติ (ไม่หักวันลา) · ยื่นใหม่ได้หลังดูยอดคงเหลือ",
  ZERO_DAYS: "ระบบยกเลิกให้ — วันที่ลาเป็นวันหยุดทั้งหมด (ไม่หักวันลา)",
  OUT_OF_EMPLOYMENT: "ระบบยกเลิกให้ — วันที่ลาอยู่นอกช่วงการจ้าง",
};
const LEAVE_TYPE_TEXT: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน", OTHER: "ลาอื่น ๆ" };

// ═══════════════════════════ ตัวตน ═══════════════════════════
export type SelfActor = { tenantId: string; userId: string; role: string; unitAccess: unknown; permissions: unknown };
type Opts = { now?: Date };
type Fail = { ok: false; reason: string };
type Me = {
  tenantId: string;
  userId: string;
  role: string;
  unitAccess: unknown;
  permissions: Record<string, unknown>;
  ctx: Ctx;
  employeeId: string;
  name: string;
  position: string | null;
  active: boolean;
  homeUnitId: string | null;
  units: { id: string; unitId: string; fromDate: Date; toDate: Date | null }[];
};
const no = (reason: string): Fail => ({ ok: false, reason });
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nowOf = (opts?: Opts): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date());
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const hmOf = (at: Date) => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);

/** สร้าง actor จากเซสชัน (requireTenant) — หน้า/action ใช้ตัวนี้ ไม่ประกอบเอง */
export function selfActorOf(auth: { user: { id: string }; active: { tenantId: string; role: string; unitAccess: unknown; permissions: unknown } }): SelfActor {
  return { tenantId: auth.active.tenantId, userId: auth.user.id, role: auth.active.role, unitAccess: auth.active.unitAccess, permissions: auth.active.permissions };
}

/**
 * ผู้ใช้ → พนักงานของตัวเอง (ทางเดียว) — อ่านเฉพาะ tenantId/userId/role/unitAccess/permissions ของ actor · คีย์อื่นบน actor ไม่ถูกอ่าน ·
 * ไม่ผูก / ร้านที่ไม่มี HR / ร้านอื่น = null
 */
export async function resolveSelf(actor: SelfActor | null | undefined): Promise<Me | null> {
  const tenantId = str(actor?.tenantId);
  const userId = str(actor?.userId);
  if (!tenantId || !userId) return null;
  const row = await selfRowOf(tenantId, userId);
  if (!row) return null;
  const { ctx, e } = row;
  const p = actor?.permissions;
  return {
    tenantId,
    userId,
    role: str(actor?.role) || "STAFF",
    unitAccess: Array.isArray(actor?.unitAccess) ? actor.unitAccess : [],
    permissions: p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
    ctx,
    employeeId: e.id,
    name: e.name,
    position: e.position,
    active: e.active && e.employmentStatus !== "ENDED",
    homeUnitId: e.unitId,
    units: e.units,
  };
}
/** แถวพนักงานของ (ร้าน, ผู้ใช้) — ครั้งเดียวต่อคำขอ (React cache: layout + หน้า + ตัวอ่านทุกตัวใช้ผลเดียวกัน · นอก RSC = เรียกตรง) */
const selfRowOf = cache(async (tenantId: string, userId: string) => {
  const link = await employeeOfUser(tenantId, userId);
  if (!link) return null;
  const ctx: Ctx = { tenantId, systemId: link.systemId };
  const e = await tenantDb(ctx).hrEmployee.findFirst({
    where: { id: link.employeeId, tenantId, systemId: link.systemId, linkedUserId: userId },
    select: { id: true, name: true, position: true, active: true, employmentStatus: true, unitId: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } },
  });
  return e ? { ctx, e } : null;
});
/** ระบบ HR ที่บัญชีนี้ผูกอยู่ (null = ไม่ผูก) — เมนู/แท็บ HR ใช้ตัดสิน "ของฉัน" ต่อระบบ (ผลเดียวกับ resolveSelf ในคำขอเดียวกัน) */
export async function selfLinkedSystemOf(tenantId: string, userId: string): Promise<string | null> {
  return (await selfRowOf(str(tenantId), str(userId)))?.ctx.systemId ?? null;
}
/** ผู้ดูที่ส่งให้ service เดิม (บทบาท/คีย์จากเซสชัน — role ยังมีผลตาม service: เจ้าของร้านยื่นลา = อนุมัติทันที ฯลฯ) */
const viewerOf = (me: Me) => ({ userId: me.userId, role: me.role as "STAFF", unitAccess: me.unitAccess, permissions: me.permissions });
async function unitNameOf(tenantId: string, unitId: string | null): Promise<string | null> {
  if (!unitId) return null;
  return (await unitNamesOf(tenantId, [unitId])).get(unitId) ?? null;
}
/** service ล้มด้วยเหตุอื่น (ไม่ใช่ข้อความปฏิเสธ) ⇒ ข้อความกลาง (log ฝั่งเซิร์ฟเวอร์) */
function failed(e: unknown): Fail {
  console.error("[hr.self]", e);
  return no(FAILED_TEXT);
}

// ═══════════════════════════ ตัวอ่าน (R4 — คีย์ DTO ตายตัว) ═══════════════════════════
export type MySelf = { ok: true; active: boolean; name: string; position: string | null; unitName: string | null };
export async function mySelf(actor: SelfActor): Promise<MySelf | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  return { ok: true, active: me.active, name: me.name, position: me.position, unitName: await unitNameOf(me.tenantId, me.homeUnitId) };
}

type EntryRow = { id: string; date: Date; startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean; unitId: string | null; shift: { name: string } };
const ENTRY_SELECT = { id: true, date: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true, unitId: true, shift: { select: { name: true } } } as const;
/** กะที่ประกาศแล้วของตัวเองในช่วงวัน (เรียงวัน/เวลาเริ่ม) */
async function ownEntries(me: Me, from: string, to: string): Promise<EntryRow[]> {
  return (await tenantDb(me.ctx).hrRosterEntry.findMany({
    where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, publishedAt: { not: null }, date: { gte: dbDate(from), lte: dbDate(to) } },
    select: ENTRY_SELECT,
    orderBy: [{ date: "asc" }, { startMin: "asc" }, { id: "asc" }],
    take: 200,
  })) as EntryRow[];
}

export type MyShift = { shiftName: string; startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean; unitName: string | null };
export type MyColleague = { name: string; position: string | null; shiftName: string; startMin: number; endMin: number };
export type MyToday = { ok: true; day: string; shift: MyShift | null; clock: Awaited<ReturnType<typeof myClockState>>; colleagues: MyColleague[] };
const COLLEAGUES_MAX = 20;
export async function myToday(actor: SelfActor, opts: Opts = {}): Promise<MyToday | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const now = nowOf(opts);
  const day = bkkDayKey(now);
  const mine = (await ownEntries(me, day, day))[0] ?? null;
  const clock = await myClockState({ tenantId: me.tenantId, userId: me.userId }, { now });
  const shift: MyShift | null = mine
    ? { shiftName: mine.shift.name, startMin: mine.startMin, endMin: mine.endMin, breakMin: mine.breakMin, crossesMidnight: mine.crossesMidnight, unitName: await unitNameOf(me.tenantId, mine.unitId) }
    : null;
  // เพื่อนร่วมกะ (Q6): วันเดียวกัน · สาขาเดียวกัน · เวลาทับกัน · ประกาศแล้ว · ยังทำงาน · ไม่ได้ลา (ตัวอ่านตารางกะของวัน — rosterOnDay กรองให้แล้ว)
  let colleagues: MyColleague[] = [];
  if (mine && me.active && mine.unitId) {
    const w0 = shiftWindow(day, mine);
    const r = await rosterOnDay({ tenantId: me.tenantId, date: day, unitId: mine.unitId, systemId: me.ctx.systemId });
    const mates = r.entries.filter((e) => e.employeeId !== me.employeeId && e.unitId === mine.unitId && e.start < w0.end && e.end > w0.start);
    const ids = [...new Set(mates.map((e) => e.employeeId))].slice(0, COLLEAGUES_MAX);
    if (ids.length) {
      const db = tenantDb(me.ctx);
      const [emps, shifts] = await Promise.all([
        db.hrEmployee.findMany({ where: { id: { in: ids }, tenantId: me.tenantId, systemId: me.ctx.systemId }, select: { id: true, name: true, position: true } }),
        db.hrShift.findMany({ where: { id: { in: [...new Set(mates.map((e) => e.shiftId))] } }, select: { id: true, name: true } }),
      ]);
      const eOf = new Map(emps.map((e) => [e.id, e]));
      const sOf = new Map(shifts.map((s) => [s.id, s.name]));
      const seen = new Set<string>();
      for (const m of mates) {
        const e = eOf.get(m.employeeId);
        if (!e || seen.has(e.id)) continue;
        seen.add(e.id);
        colleagues.push({ name: e.name, position: e.position, shiftName: sOf.get(m.shiftId) ?? "", startMin: m.startMin, endMin: m.endMin });
      }
      colleagues = colleagues.slice(0, COLLEAGUES_MAX);
    }
  }
  return { ok: true, day, shift, clock, colleagues };
}

export type MyWeekEntry = { shiftName: string; startMin: number; endMin: number; crossesMidnight: boolean; unitName: string | null };
export type MyWeekDay = { date: string; entries: MyWeekEntry[]; leave: { label: string; half: string | null } | null; holiday: string | null };
export type MyWeek = { ok: true; weekStart: string; days: MyWeekDay[] };
const mondayOf = (day: string): string => {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay(); // วันตามปฏิทิน (สตริงวันไทย) — ไม่ขึ้นกับโซนเครื่อง
  return addDays(day, -((wd + 6) % 7));
};
export async function myWeek(actor: SelfActor, input: { week?: unknown } = {}, opts: Opts = {}): Promise<MyWeek | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const now = nowOf(opts);
  const cur = mondayOf(bkkDayKey(now));
  let start = isDay(input?.week) ? mondayOf(input.week) : cur;
  if (start < addDays(cur, -28)) start = addDays(cur, -28);
  if (start > addDays(cur, 56)) start = addDays(cur, 56);
  const end = addDays(start, 6);
  const db = tenantDb(me.ctx);
  const [entries, leaves, hols] = await Promise.all([
    ownEntries(me, start, end),
    db.hrLeave.findMany({
      where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dbDate(end) }, toDate: { gte: dbDate(start) } },
      select: { type: true, fromDate: true, toDate: true, halfDay: true, policy: { select: { name: true } } },
      take: 50,
    }),
    holidaysBetween(me.ctx, { unitId: me.homeUnitId, from: start, to: end }),
  ]);
  const unitNames = await unitNamesOf(me.tenantId, entries.map((e) => e.unitId));
  const days: MyWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lv = leaves.find((l) => dayOf(l.fromDate) <= d && dayOf(l.toDate) >= d);
    days.push({
      date: d,
      entries: entries
        .filter((e) => dayOf(e.date) === d)
        .map((e) => ({ shiftName: e.shift.name, startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight, unitName: e.unitId ? (unitNames.get(e.unitId) ?? null) : null })),
      leave: lv ? { label: lv.policy?.name ?? LEAVE_TYPE_TEXT[lv.type] ?? LEAVE_TYPE_TEXT.OTHER, half: lv.halfDay ?? null } : null,
      holiday: hols.find((h) => h.date === d)?.name ?? null,
    });
  }
  return { ok: true, weekStart: start, days };
}

export type MyLeaveItem = {
  id: string;
  policyName: string;
  type: HrLeaveType;
  fromDate: string;
  toDate: string;
  days: string | null;
  halfDay: string | null;
  hours: number | null;
  status: string;
  statusText: string;
  canCancel: boolean;
  createdAt: string;
};
export type MyOtItem = { id: string; date: string; start: string; end: string; minutes: number; status: string; timing: string; amountSatang: number | null; canCancel: boolean };
export type MySwapItem = {
  id: string;
  role: "REQUESTER" | "TARGET";
  status: string;
  fromDate: string | null;
  fromShiftName: string | null;
  toDate: string | null;
  toShiftName: string | null;
  peerName: string;
  canRespond: boolean;
  canCancel: boolean;
};
export type MyCorrectionItem = { id: string; action: string; kind: string; day: string | null; proposedAt: string | null; status: string; canCancel: boolean };
export type MyAdvanceItem = { id: string; periodKey: string; amountSatang: number; status: string; canCancel: boolean; createdAt: string };
export type MyRequests = { ok: true; leaves: MyLeaveItem[]; ot: MyOtItem[]; swaps: MySwapItem[]; corrections: MyCorrectionItem[]; advances: MyAdvanceItem[] };
const LIST_MAX = 50;
export async function myRequests(actor: SelfActor, opts: Opts = {}): Promise<MyRequests | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const now = nowOf(opts);
  const today = bkkDayKey(now);
  const db = tenantDb(me.ctx);
  const v = viewerOf(me);
  const [leaveRows, ot, sw, co, adv] = await Promise.all([
    db.hrLeave.findMany({
      where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId },
      select: { id: true, type: true, fromDate: true, toDate: true, days: true, halfDay: true, hours: true, status: true, decidedById: true, createdAt: true, policy: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIST_MAX,
    }),
    myOtRequests(me.ctx, v),
    listMySwaps(me.ctx, v),
    myCorrections(me.ctx, v, { now }),
    db.hrPayAdjustment.findMany({
      where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, kind: "ADVANCE" },
      select: { id: true, periodKey: true, amountSatang: true, status: true, runId: true, requestedById: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIST_MAX,
    }),
  ]);
  // ใบที่ระบบยกเลิกให้ (สายอนุมัติใช้ผลไม่ได้ — H2.7 D4) ⇒ ข้อความบอกเหตุ
  const cancelled = leaveRows.filter((l) => l.status === "CANCELLED").map((l) => l.id);
  const refused = cancelled.length
    ? await tenantDb({ tenantId: me.tenantId }).auditLog.findMany({ where: { tenantId: me.tenantId, action: "hr.leave.apply_refused", targetId: { in: cancelled } }, select: { targetId: true, after: true }, take: 200 })
    : [];
  const codeOf = new Map(refused.map((a) => [a.targetId ?? "", String(((a.after ?? {}) as Record<string, unknown>).code ?? "")]));
  const owner = me.role === "OWNER";
  const leaves: MyLeaveItem[] = leaveRows.map((l) => ({
    id: l.id,
    policyName: l.policy?.name ?? LEAVE_TYPE_TEXT[l.type] ?? LEAVE_TYPE_TEXT.OTHER,
    type: l.type,
    fromDate: dayOf(l.fromDate),
    toDate: dayOf(l.toDate),
    days: l.days === null ? null : fmtTenths(tenthsOf(l.days)),
    halfDay: l.halfDay ?? null,
    hours: l.hours === null ? null : Number(l.hours),
    status: l.status,
    statusText: (l.status === "CANCELLED" ? LEAVE_STATUS_TEXT[codeOf.get(l.id) ?? ""] : undefined) ?? LEAVE_STATUS_TEXT[l.status] ?? l.status,
    // ใบรออนุมัติ · ใบของเจ้าของร้านที่อนุมัติทันทีและยังไม่ถึงวันลา (H0.7 R5 — service ตัดสินซ้ำตอนกด)
    canCancel: leaveCancelOpen({ status: l.status, decidedById: l.decidedById, fromDate: dayOf(l.fromDate) }, { isOwner: owner, today }),
    createdAt: l.createdAt.toISOString(),
  }));
  const otItems: MyOtItem[] = (ot.ok ? ot.items : []).map((o) => ({
    id: o.id,
    date: o.date,
    start: hmOf(new Date(o.startAt)),
    end: hmOf(new Date(o.endAt)),
    minutes: o.requestedMin,
    status: o.status,
    timing: o.timing,
    amountSatang: "amountSatang" in o ? o.amountSatang : null,
    canCancel: otCancelOpen(o.status),
  }));
  const swaps: MySwapItem[] = (sw.ok ? sw.items : []).map((s) => {
    const mine = s.requester.employeeId === me.employeeId;
    return {
      id: s.id,
      role: mine ? "REQUESTER" : "TARGET",
      status: s.status,
      fromDate: s.from?.date ?? null,
      fromShiftName: s.from?.shiftName ?? null,
      toDate: s.to?.date ?? null,
      toShiftName: s.to?.shiftName ?? null,
      peerName: mine ? s.target.name : s.requester.name,
      canRespond: s.canRespond,
      canCancel: s.canCancel,
    };
  });
  const corrections: MyCorrectionItem[] = (co.ok ? co.items : [])
    .filter((c) => c.employeeId === me.employeeId)
    .map((c) => ({ id: c.id, action: c.action, kind: c.kind, day: c.day, proposedAt: c.proposedAt, status: c.status, canCancel: correctionCancelOpen(c.status) }));
  const advances: MyAdvanceItem[] = adv.map((a) => ({
    id: a.id,
    periodKey: a.periodKey,
    amountSatang: a.amountSatang,
    status: a.status,
    canCancel: selfAdvanceCancelOpen(a, me.userId),
    createdAt: a.createdAt.toISOString(),
  }));
  return { ok: true, leaves, ot: otItems, swaps, corrections, advances };
}

export async function myBalances(actor: SelfActor, input: { year?: unknown } = {}, opts: Opts = {}): Promise<{ ok: true; items: LeaveBalanceItem[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const year = typeof input?.year === "number" && Number.isInteger(input.year) ? input.year : null;
  const r = await myLeaveBalances(me.ctx, viewerOf(me), year !== null ? { year } : { at: bkkDayKey(nowOf(opts)) });
  return r.ok ? { ok: true, items: r.items } : no(r.reason);
}

export type MyLeavePolicy = { id: string; name: string; category: HrLeaveType; allowHalfDay: boolean; allowHours: boolean };
export async function myLeaveForm(actor: SelfActor, opts: Opts = {}): Promise<{ ok: true; policies: MyLeavePolicy[]; balances: LeaveBalanceItem[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const [all, bal] = await Promise.all([activeLeavePolicies(me.ctx), myLeaveBalances(me.ctx, viewerOf(me), { at: bkkDayKey(nowOf(opts)) })]);
  const balances = bal.ok ? bal.items : [];
  // ประเภทที่ใช้กับสาขาของตัวเอง (ชุดเดียวกับยอดคงเหลือ — ทั้งร้าน + สาขาประจำ)
  const mine = new Set(balances.map((b) => b.policyId));
  const policies = all.filter((p) => mine.has(p.id)).map((p) => ({ id: p.id, name: p.name, category: p.category, allowHalfDay: p.allowHalfDay, allowHours: p.allowHours }));
  return { ok: true, policies, balances };
}

/** ภาพก่อนส่ง (07b): จำนวนวันโดยประมาณ · กะของตัวเองที่ทับ ("กระทบกะ") · คงเหลือหลังลา — ไม่ใช่ผลกระทบการจอง (H4.1) · service นับจริงตอนยื่น */
export async function myLeavePreview(
  actor: SelfActor,
  input: { policyId?: unknown; fromDate?: unknown; toDate?: unknown; halfDay?: unknown; hours?: unknown },
  opts: Opts = {},
): Promise<{ ok: true; days: string; shifts: { date: string; shiftName: string }[]; availableAfter: string | null } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const from = input?.fromDate;
  const to = input?.toDate;
  if (!isDay(from) || !isDay(to)) return no(PICK_DATES_TEXT);
  try {
    leaveDaysBetween(from, to); // ช่วงวันกลับหัว / ยาวเกินกำหนด = ข้อความของ service (ก่อนอ่านอะไร)
  } catch (e) {
    const t = leaveRefusalText(e);
    return t ? no(t) : failed(e);
  }
  const half = input?.halfDay === "AM" || input?.halfDay === "PM" ? input.halfDay : null;
  const hours = typeof input?.hours === "number" ? input.hours : null;
  const [entries, hols, bal] = await Promise.all([
    ownEntries(me, from, to),
    holidaysBetween(me.ctx, { unitId: me.homeUnitId, from, to }),
    myLeaveBalances(me.ctx, viewerOf(me), { at: from }),
  ]);
  const rostered = new Set(entries.map((e) => dayOf(e.date)));
  let days: string;
  try {
    days = countLeaveDays({ from, to, halfDay: half, hours, holidays: new Set(hols.map((h) => h.date).filter((d) => !rostered.has(d))), daysOff: new Set() });
  } catch (e) {
    const t = leaveRefusalText(e);
    if (t) return no(t);
    return failed(e);
  }
  const item = bal.ok ? bal.items.find((b) => b.policyId === str(input?.policyId)) : undefined;
  const availableAfter = item && item.available !== null ? fmtTenths(tenthsOf(item.available) - tenthsOf(days)) : null;
  return { ok: true, days, shifts: entries.map((e) => ({ date: dayOf(e.date), shiftName: e.shift.name })), availableAfter };
}

export type MySwapTarget = { employeeId: string; name: string; position: string | null; entryId: string | null; shiftName: string | null };
/** กะของตัวเองที่ยังมาไม่ถึงและประกาศแล้ว (หรือ null) */
async function ownFutureEntry(me: Me, entryId: unknown, now: Date): Promise<EntryRow | null> {
  const id = str(entryId);
  if (!id) return null;
  const e = (await tenantDb(me.ctx).hrRosterEntry.findFirst({
    where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, publishedAt: { not: null }, date: { gte: dbDate(bkkDayKey(now)) } },
    select: ENTRY_SELECT,
  })) as EntryRow | null;
  return e;
}
/**
 * เพื่อนที่ service สลับกะ "ยอมรับ" สำหรับกะต้นทางนี้ (มติ r2): ผู้สมัคร = พนักงานในระบบเดียวกันที่ผูกบัญชี · ยังทำงาน · สาขาประจำหรือยืมตัวเข้าสาขาของกะในวันนั้น
 * (query ตรงเงื่อนไข ไม่ตัดจำนวน) → ถามตัวตรวจของ swap.ts (swapCandidatesAccepted — กติกาเดียวกับ requestSwap) ว่า "ยกกะให้" ได้ไหม ·
 * entryId = กะของเขาวันนั้นที่ "แลก" ได้ด้วย (ไม่มี = ยกกะให้เท่านั้น) · ผลไม่บอกเหตุผลรายคน (ไม่เปิดว่าใครลา)
 */
async function swapTargetsOf(me: Me, from: EntryRow, now: Date): Promise<MySwapTarget[]> {
  const day = dayOf(from.date);
  if (!from.unitId) return [];
  const db = tenantDb(me.ctx);
  const d = dbDate(day);
  const peers = await db.hrEmployee.findMany({
    where: {
      tenantId: me.tenantId,
      systemId: me.ctx.systemId,
      active: true,
      linkedUserId: { not: null },
      NOT: [{ id: me.employeeId }, { employmentStatus: "ENDED" }],
      OR: [{ unitId: from.unitId }, { units: { some: { unitId: from.unitId, fromDate: { lte: d }, OR: [{ toDate: null }, { toDate: { gte: d } }] } } }],
    },
    select: { id: true, name: true, position: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  if (!peers.length) return [];
  const theirs = (await db.hrRosterEntry.findMany({
    where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: { in: peers.map((p) => p.id) }, publishedAt: { not: null }, date: d },
    select: { ...ENTRY_SELECT, employeeId: true },
    orderBy: [{ startMin: "asc" }, { id: "asc" }],
  })) as (EntryRow & { employeeId: string })[];
  const today = bkkDayKey(now);
  const give = await swapCandidatesAccepted(me.ctx, me.userId, from.id, peers.map((p) => ({ employeeId: p.id, toEntryId: null })), today);
  const out: MySwapTarget[] = [];
  for (let i = 0; i < peers.length; i++) {
    if (!give[i]) continue;
    const p = peers[i]!;
    const mine = theirs.filter((x) => x.employeeId === p.id);
    const trade = mine.length ? await swapCandidatesAccepted(me.ctx, me.userId, from.id, mine.map((x) => ({ employeeId: p.id, toEntryId: x.id })), today) : [];
    const e = mine.find((_, k) => trade[k]) ?? null;
    out.push({ employeeId: p.id, name: p.name, position: p.position, entryId: e?.id ?? null, shiftName: e?.shift.name ?? null });
  }
  return out;
}
/** เพื่อนที่รับ/แลกกะได้ (R9): เฉพาะคนที่ service สลับกะยอมรับ · กะต้นทางต้องเป็นของตัวเองที่ยังมาไม่ถึง · พ้นสภาพ = inactive */
export async function mySwapTargets(actor: SelfActor, input: { fromEntryId?: unknown }, opts: Opts = {}): Promise<{ ok: true; items: MySwapTarget[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const now = nowOf(opts);
  const from = await ownFutureEntry(me, input?.fromEntryId, now);
  if (!from) return no(SELF_TEXT.notFound);
  return { ok: true, items: await swapTargetsOf(me, from, now) };
}

/** กะของตัวเองที่ยังมาไม่ถึง (28 วัน) — ตัวเลือก "กะที่จะขอเปลี่ยน" ของฟอร์มสลับกะ */
export async function myShiftsAhead(actor: SelfActor, opts: Opts = {}): Promise<{ ok: true; items: { entryId: string; date: string; shiftName: string; startMin: number; endMin: number }[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const today = bkkDayKey(nowOf(opts));
  const rows = await ownEntries(me, today, addDays(today, 28));
  return { ok: true, items: rows.map((e) => ({ entryId: e.id, date: dayOf(e.date), shiftName: e.shift.name, startMin: e.startMin, endMin: e.endMin })) };
}

/** การลงเวลาของตัวเองที่ขอแก้ได้ (ไม่ส่งรหัสพนักงานใด ๆ ให้ service — ตัวเองจากบัญชี) */
export async function myCorrectablePunches(actor: SelfActor, input: { from?: unknown; to?: unknown }, opts: Opts = {}): Promise<{ ok: true; items: { id: string; kind: string; at: string }[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  const today = bkkDayKey(nowOf(opts));
  const from = isDay(input?.from) ? input.from : addDays(today, -CORRECTION_RULES.BACK_DAYS);
  const to = isDay(input?.to) ? input.to : today;
  const rows = await correctablePunches(me.ctx, viewerOf(me), { from, to });
  return { ok: true, items: rows.map((r) => ({ id: r.id, kind: r.kind, at: r.at })) };
}

export type MySlip = { runId: string; periodKey: string; status: string; netSatang: number; href: string };
export type MyDocuments = { ok: true; payslips: MySlip[]; notes: MyReviewNoteItem[]; certificate: null; myRequestsSlot: null };
export async function myDocuments(actor: SelfActor): Promise<MyDocuments | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  // HR H3.8 ▸ R6: เฉพาะสลิปที่ออกแล้ว (รุ่น 2 ต้องปิดงาน) · ลิงก์ไปหน้าสลิปของฉัน /app/me/hr/pay/<รอบ> · คีย์ DTO เดิม ◂
  const items = (
    await tenantDb(me.ctx).hrPayrollItem.findMany({
      where: { tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, run: { status: { in: ["APPROVED", "PAID"] } } },
      select: { runId: true, netSatang: true, run: { select: { periodKey: true, status: true, engineVersion: true, stepsJson: true } } },
      orderBy: [{ run: { periodKey: "desc" } }, { runId: "desc" }],
      take: 36,
    })
  ).filter((i) => slipState({ status: i.run.status, engineVersion: i.run.engineVersion, finalized: finalizedOf(i.run.stepsJson) }) === "ISSUED"); // HR H3.8 ◂
  const notes = await myReviewNotes({ tenantId: me.tenantId, userId: me.userId });
  return {
    ok: true,
    payslips: items.map((i) => ({ runId: i.runId, periodKey: i.run.periodKey, status: i.run.status, netSatang: i.netSatang, href: `/app/me/hr/pay/${i.runId}` })), // HR H3.8 ▸ หน้าสลิปของฉัน ◂
    notes: notes.items,
    certificate: null, // H3.8 (หนังสือรับรอง)
    myRequestsSlot: null, // H4.6 (คำขอของฉันรวมทุกระบบ)
  };
}

/** H4.6 ▸ ช่อง "คำขอของฉัน" (Q14): รายการเบิกของ/ค่าเสียหายของตัวเอง — ตัวอ่านเดิมของ H4.6 (myStockCharges) ตรงตัว · ไม่ผูก = noEmployee */
export async function myStockRequests(actor: SelfActor): Promise<{ ok: true; items: MyStockCharge[] } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  return { ok: true, items: await myStockCharges({ tenantId: me.tenantId, userId: me.userId }) };
}

// ═══════════════════════════ ตัวเขียน (R5 — service เดิม · ข้อความเดิม) ═══════════════════════════
/** ลงเวลาด้วยมือถือของตัวเอง — ก้อนจากผู้เรียกส่งต่อให้ตัวอ่านของชั้นลงเวลา (clock-rules.mobileClockPayloadOf) ทั้งก้อน · ผลไม่มีพิกัด (มีแค่ระยะห่าง) */
export async function selfClock(actor: SelfActor, input: unknown, opts: Opts = {}) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  return mobileClock({ tenantId: me.tenantId, userId: me.userId }, mobileClockPayloadOf(input), { now: opts?.now });
}

export async function selfRequestLeave(
  actor: SelfActor,
  input: { policyId?: unknown; fromDate?: unknown; toDate?: unknown; halfDay?: unknown; hours?: unknown; reason?: unknown },
): Promise<{ ok: true; id: string } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const policyId = str(input?.policyId);
  // หมวดของประเภทที่เลือก (ผู้เรียกรุ่นใหม่ส่ง policyId · service ตรวจประเภท/สาขาเองอีกชั้น)
  const pol = policyId ? (await activeLeavePolicies(me.ctx)).find((p) => p.id === policyId) : undefined;
  try {
    // ตัวตน = ด่าน (REVIEW #14): ยื่นของตัวเองไม่ต้องมีคีย์ hr.leave.request · ผู้ยื่น = บัญชีของพนักงานเอง
    const r = await requestLeave(me.ctx, {
      employeeId: me.employeeId,
      actorUserId: me.userId,
      type: pol?.category ?? "PERSONAL",
      policyId: policyId || null,
      fromDate: str(input?.fromDate),
      toDate: str(input?.toDate),
      halfDay: input?.halfDay === "AM" || input?.halfDay === "PM" ? input.halfDay : null,
      hours: typeof input?.hours === "number" || typeof input?.hours === "string" ? input.hours : null,
      reason: typeof input?.reason === "string" ? input.reason : null, // ไม่ตัดเอง — service เป็นผู้ตัดสิน
    });
    return { ok: true, id: r.id };
  } catch (e) {
    const t = leaveRefusalText(e) ?? (e instanceof HrLeaveRequestError ? e.message : null) ?? (e instanceof TimeRuleError ? e.message : null);
    return t ? no(t) : failed(e);
  }
}

export async function selfCancelLeave(actor: SelfActor, leaveId: unknown) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(leaveId);
  const own = id ? await tenantDb(me.ctx).hrLeave.findFirst({ where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId }, select: { id: true } }) : null;
  if (!own) return no(SELF_TEXT.notFound);
  return cancelLeave(me.ctx, own.id, { actorUserId: me.userId });
}

export async function selfRequestOt(actor: SelfActor, input: { date?: unknown; start?: unknown; end?: unknown; reason?: unknown }, opts: Opts = {}) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  // ไม่ส่ง employeeId ⇒ service หาพนักงานจากบัญชีเอง (ทางของตัวเอง)
  return requestOt(me.ctx, viewerOf(me), { date: input?.date, start: input?.start, end: input?.end, reason: input?.reason }, { now: opts?.now });
}

export async function selfCancelOt(actor: SelfActor, otId: unknown) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(otId);
  const own = id ? await tenantDb(me.ctx).hrOtRequest.findFirst({ where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId }, select: { id: true } }) : null;
  if (!own) return no(SELF_TEXT.notFound);
  return cancelOtRequest(me.ctx, viewerOf(me), own.id);
}

export async function selfRequestSwap(
  actor: SelfActor,
  input: { fromEntryId?: unknown; targetEmployeeId?: unknown; toEntryId?: unknown; reason?: unknown },
  opts: Opts = {},
) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const from = await ownFutureEntry(me, input?.fromEntryId, nowOf(opts));
  if (!from) return no(SELF_TEXT.notFound);
  // เพื่อน = id ต่างชาติตัวเดียวที่รับ (R9) — ต้องอยู่ในรายชื่อของกะต้นทางนี้ · กะปลายทาง (ถ้าส่ง) = กะของเพื่อนในรายชื่อเท่านั้น
  const peer = (await swapTargetsOf(me, from, nowOf(opts))).find((t) => t.employeeId === str(input?.targetEmployeeId));
  if (!peer) return no(SELF_TEXT.notFound);
  const toEntryId = str(input?.toEntryId) || null;
  if (toEntryId && toEntryId !== peer.entryId) return no(SELF_TEXT.notFound);
  const r = await requestSwap(me.ctx, viewerOf(me), { fromEntryId: from.id, targetEmployeeId: peer.employeeId, toEntryId, reason: typeof input?.reason === "string" ? input.reason : null });
  // ข้อความ "เพื่อนร่วมงาน ลาอนุมัติแล้ว" ไม่ส่งถึงผู้ขอ (ไม่เปิดว่าเพื่อนที่เลือกลา) ⇒ ข้อความกลาง
  return !r.ok && r.reason === SWAP_REFUSAL.leavePeer ? no(SWAP_PEER_UNAVAILABLE) : r;
}

export async function selfRespondSwap(actor: SelfActor, swapId: unknown, accept: unknown) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(swapId);
  const own = id ? await tenantDb(me.ctx).hrShiftSwapRequest.findFirst({ where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, targetEmployeeId: me.employeeId }, select: { id: true } }) : null;
  if (!own) return no(SELF_TEXT.notFound);
  return respondSwap(me.ctx, viewerOf(me), own.id, { accept: accept === true });
}

export async function selfCancelSwap(actor: SelfActor, swapId: unknown) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(swapId);
  const own = id ? await tenantDb(me.ctx).hrShiftSwapRequest.findFirst({ where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, requesterEmployeeId: me.employeeId }, select: { id: true } }) : null;
  if (!own) return no(SELF_TEXT.notFound);
  return cancelSwap(me.ctx, viewerOf(me), own.id);
}

export async function selfRequestCorrection(
  actor: SelfActor,
  input: { action?: unknown; attendanceId?: unknown; kind?: unknown; at?: unknown; reason?: unknown },
  opts: Opts = {},
) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  // ทางของตัวเอง (ไม่ส่ง employeeId) — service ตรวจว่าแถวที่ขอแก้เป็นของพนักงานคนนี้เอง
  return requestCorrection(me.ctx, viewerOf(me), { action: input?.action, attendanceId: input?.attendanceId, kind: input?.kind, at: input?.at, reason: input?.reason }, { now: opts?.now });
}

export async function selfCancelCorrection(actor: SelfActor, correctionId: unknown) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(correctionId);
  const own = id ? await tenantDb(me.ctx).hrTimeCorrection.findFirst({ where: { id, tenantId: me.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId }, select: { id: true } }) : null;
  if (!own) return no(SELF_TEXT.notFound);
  return cancelCorrection(me.ctx, viewerOf(me), own.id);
}

// ── เบิกล่วงหน้า (R6 + มติ r2: ธุรกรรมเดียวใต้ล็อกใน payroll.ts · ผ่อนหลายงวด/เพดานของร้าน = H3.4) ──
const ADV_MAX_BAHT = 50_000;
/**
 * ยื่นเบิกล่วงหน้าของตัวเอง: บาทเต็ม 1–50,000 · หมายเหตุ ≤ 200 · เปิดได้ทีละ 1 ใบ (รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่จ่าย) ·
 * งวด = เดือนนี้ (ไทย) ถ้ายังไม่มีรอบจ่าย ไม่งั้นเดือนหน้า ไม่งั้นปิด — ตรวจ+เขียนในธุรกรรมเดียวใต้ล็อก hr:advance (payroll.requestSelfAdvance) ·
 * ไม่เคยอนุมัติตัวเอง: ผู้อนุมัติ = หน้าเงินเดือนเดิม (decideAdjustment · ล็อกเดียวกัน)
 */
export async function selfRequestAdvance(actor: SelfActor, input: { amountBaht?: unknown; note?: unknown }, opts: Opts = {}): Promise<{ ok: true; id: string; periodKey: string } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const baht = input?.amountBaht;
  if (typeof baht !== "number" || !Number.isInteger(baht) || baht < 1 || baht > ADV_MAX_BAHT) return no(SELF_TEXT.advAmount);
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if ([...note].length > SELF_ADVANCE_NOTE_MAX) return no(SELF_TEXT.advNote);
  const r = await requestSelfAdvance(me.ctx, { employeeId: me.employeeId, requestedById: me.userId, amountSatang: baht * 100, note: note || null }, { now: opts?.now });
  if (r.ok) return r;
  return no(r.code === "OPEN" ? SELF_TEXT.advOpen : r.code === "CLOSED" ? SELF_TEXT.advClosed : r.code === "NOTE" ? SELF_TEXT.advNote : SELF_TEXT.advAmount);
}

/** ยกเลิกเบิกล่วงหน้าของตัวเองที่ยังรออนุมัติ (ยังไม่เข้ารอบจ่าย · ยื่นเอง) — payroll.cancelSelfAdvance ใต้ล็อกเดียวกัน · ไม่ใช่ = notFound */
export async function selfCancelAdvance(actor: SelfActor, advanceId: unknown): Promise<{ ok: true } | Fail> {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(advanceId);
  if (!id) return no(SELF_TEXT.notFound);
  const r = await cancelSelfAdvance(me.ctx, { id, employeeId: me.employeeId, requestedById: me.userId });
  return r.ok ? r : no(SELF_TEXT.notFound);
}

export async function selfAcknowledgeNote(actor: SelfActor, noteId: unknown, opts: Opts = {}) {
  const me = await resolveSelf(actor);
  if (!me) return no(SELF_TEXT.noEmployee);
  if (!me.active) return no(SELF_TEXT.inactive);
  const id = str(noteId);
  // บันทึกของตัวเองที่เปิดให้เห็น = รายการของ myReviewNotes (ตัวอ่านเดิม H4.4 — ไม่อ่านตารางบันทึกตรงในไฟล์นี้)
  const own = id ? (await myReviewNotes({ tenantId: me.tenantId, userId: me.userId })).items.find((n) => n.id === id) : undefined;
  if (!own) return no(SELF_TEXT.notFound);
  return acknowledgeReviewNote({ tenantId: me.tenantId, userId: me.userId }, own.id, { now: opts?.now });
}
