// hr-link.ts — POS ↔ HR (POS P3.5 S · มติ 5 7 11 · R1 R2 R4 R5 R9 R12) · ทางเดียวของ POS ไปหา `@/lib/modules/hr` (fitness "pos→hr")
//
// 🔴 ไฟล์ของ POS ไฟล์เดียว (กับ hr-link-actions.ts) ที่ import `@/lib/modules/hr` — ห้าม subpath (`hr/service` ฯลฯ) · โหลดแบบ lazy
//    (`await import`) เท่านั้น: กราฟของ HR (payroll → account …) ไม่ถูกลากเข้าตอนโหลดหน้าขาย และไม่มีวงโหลด staff-pin ↔ hr-link
// 🔴 POS ไม่เขียนตาราง HR เอง: ลงเวลา = hr.clockSelf (→ clock() ของ HR) · ส่งค่าคอมฯ เข้างวด = hr.requestAdjustment ใน tx ของผู้เรียก
// 🔴 ไม่ใช่ไฟล์ "use server" (action อยู่ hr-link-actions.ts) · คำปฏิเสธ "คืน" {ok:false, code, message ไทย} ไม่ throw
// 🔴 ความเป็นส่วนตัว (มติ 7 · privacy [L]): จอล็อกได้แค่ ตาราง (เริ่ม/เลิก) · ลาวันนี้ (จริง/ไม่) · อยู่ในช่วงไหม — ไม่มีชนิด/เหตุผลการลา ไม่มีเงิน ·
//    ชั่วโมงทำงานของกะ = ผู้ดูเงินเดือนเท่านั้น (canViewPayroll — เจ้าของ หรือ hr.payroll.read ชัดแจ้ง)
import type { Prisma } from "@prisma/client";
import { canAccessUnit, canViewPayroll } from "@/lib/core/rbac";
import type { OnShiftTodayItem, RequestAdjustInput } from "@/lib/modules/hr";
import { prisma } from "./db";
import { POS_DEVICE_CODE_RE } from "./device-shared";
import type { RegisterActor, RegisterCtx, RegisterRefusal, RegisterRefusalCode, StaffHrState, StaffScheduleReason } from "./register-shared";
import type { PosScheduleGate } from "./settings-shared";

type Tx = Prisma.TransactionClient;
const hr = () => import("@/lib/modules/hr");

const MIN_MS = 60_000;
const BKK_MS = 7 * 3_600_000;
const HOURS_MAX_SHIFTS = 200;
/** R12 · CD-6: IN นับได้ถึงเปิดกะ + 15 นาที · ปิดกะแล้ว ≥ 30 นาทีแต่ยังเป็น IN = ลืมลงเวลาออก · นาทีทำงานนับ IN ก่อนเปิดกะได้ 15 นาที */
const CLOCK_IN_GRACE_MIN = 15;
const CLOCK_OUT_AFTER_MIN = 30;

const MSG: Partial<Record<RegisterRefusalCode, string>> = {
  NOT_FOUND: "ไม่พบกะนี้ในสาขานี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ดูชั่วโมงทำงาน — เฉพาะเจ้าของร้านหรือผู้ดูเงินเดือน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  STAFF_TOKEN_INVALID: "สลับผู้ขายใหม่ — ใส่ PIN อีกครั้ง",
  ALREADY_CLOCKED: "ลงเวลานี้ไปแล้ววันนี้",
  NO_EMPLOYEE: "ผู้ใช้นี้ยังไม่ได้ผูกกับพนักงานในระบบพนักงาน (HR)",
  INTERNAL: "ระบบลงเวลาขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: RegisterRefusalCode, message?: string): RegisterRefusal => ({ ok: false, code, message: message ?? MSG[code] ?? "ทำรายการไม่ได้" });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const minOfDayBkk = (d: Date) => Math.floor((((d.getTime() + BKK_MS) % 86_400_000) + 86_400_000) % 86_400_000 / MIN_MS);
/** เที่ยงคืนเวลาไทยของวันของ d (instant) */
const bkkDayStart = (d: Date) => new Date(`${new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10)}T00:00:00+07:00`);

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ R4 R5 ด่านตารางงาน + สถานะบนจอล็อก ═══════════
/** POS P3.5 ▸ fix2 F3: ชนิดของสถานะ HR ต่อคน (ตะเข็บทดสอบ opts.hrItem ของ verifyStaffPin — staff-pin ไม่ import HR) ◂ */
export type HrScheduleItem = OnShiftTodayItem;
export type ScheduleGateDecision = { ok: true; capAt: Date | null } | { ok: false; reason: StaffScheduleReason; window?: { startMin: number; endMin: number } };

/** ช่วงที่ปลดล็อกได้ของตารางวันนั้น (นาทีเวลาไทย · รวมปลาย) = [start − early, end + late] */
const inWindow = (minOfDay: number, s: { startMin: number; endMin: number }, gate: Pick<PosScheduleGate, "earlyMin" | "lateMin">) =>
  minOfDay >= s.startMin - gate.earlyMin && minOfDay <= s.endMin + gate.lateMin;

/**
 * R4 (บริสุทธิ์): ตัดสินจากสถานะของพนักงาน ณ now · OWNER/MANAGER = ผ่าน (ยกเว้นตามบทบาท) · ไม่ผูก HR = ผ่าน (ทางเดิม) ·
 * active=false = INACTIVE · ลา APPROVED วันนี้ = LEAVE · ไม่มีตารางของวัน = ผ่าน (ห้ามกล่าวหาจากข้อมูลที่ไม่มี) · วันหยุด = DAY_OFF ·
 * นอกช่วง = OUTSIDE_HOURS + window · ผ่านตามตาราง = เพดานโทเคน end + lateMin ของวันนั้น
 */
export function scheduleGateDecide(item: OnShiftTodayItem | null, role: string, now: Date, gate: Pick<PosScheduleGate, "earlyMin" | "lateMin">): ScheduleGateDecision {
  if (role === "OWNER" || role === "MANAGER" || !item) return { ok: true, capAt: null };
  if (!item.active) return { ok: false, reason: "INACTIVE" };
  if (item.onLeave) return { ok: false, reason: "LEAVE" };
  const covering = coveringWindow(item, now, gate);
  if (covering) return { ok: true, capAt: covering };
  const s = item.schedule;
  if (!s) return { ok: true, capAt: null };
  if (s.dayOff) return { ok: false, reason: "DAY_OFF" };
  return { ok: false, reason: "OUTSIDE_HOURS", window: { startMin: s.startMin, endMin: s.endMin } };
}

/**
 * POS P3.5 ▸ fix2 N6: ช่วงที่ครอบ "ตอนนี้" — ตารางวันนี้ (นาทีของวัน) · เมื่อวาน (นาที + 1440 · กะเลยเที่ยงคืน) · พรุ่งนี้ (นาที − 1440 · เข้าก่อนเที่ยงคืน) ·
 * วันหยุดไม่ครอบ · คืนเพดานโทเคน = เที่ยงคืนของวันของแถว + end + lateMin · ไม่มีแถวไหนครอบ = null ◂
 */
function coveringWindow(item: OnShiftTodayItem, now: Date, gate: Pick<PosScheduleGate, "earlyMin" | "lateMin">): Date | null {
  const minute = minOfDayBkk(now);
  const day0 = bkkDayStart(now).getTime();
  const cands: [OnShiftTodayItem["schedule"] | undefined, number][] = [[item.schedule, 0], [item.adjacent?.yesterday, -1], [item.adjacent?.tomorrow, 1]];
  for (const [row, dayOffset] of cands) {
    if (!row || row.dayOff) continue;
    if (inWindow(minute - dayOffset * 1_440, row, gate)) return new Date(day0 + dayOffset * 86_400_000 + (row.endMin + gate.lateMin) * MIN_MS);
  }
  return null;
}

/** สถานะ HR ของผู้ใช้คนเดียว (ด่าน R4) — ร้านไม่มีระบบ HR / ไม่ผูก = null */
export async function hrScheduleItem(tenantId: string, userId: string, now: Date): Promise<OnShiftTodayItem | null> {
  const r = await (await hr()).onShiftToday({ tenantId, at: now, userIds: [userId] });
  return r.hrLinked ? (r.items.find((x) => x.userId === userId) ?? null) : null;
}

/**
 * R5 — สถานะบนจอล็อกของรายชื่อ: ร้านไม่มีระบบ HR = null (ไม่มีคีย์ hr เลย) · ผู้ใช้ไม่ผูก = {null,false,null} ·
 * วันหยุด/ลา/ลาออก = inSchedule false · ไม่มีตารางของวัน = inSchedule null · อื่น = อยู่ในช่วงปลดล็อกของด่าน (early/late) ไหม
 */
export async function staffHrStates(tenantId: string, userIds: string[], now: Date, gate: Pick<PosScheduleGate, "earlyMin" | "lateMin">): Promise<Map<string, StaffHrState> | null> {
  const r = await (await hr()).onShiftToday({ tenantId, at: now, userIds });
  if (!r.hrLinked) return null;
  const by = new Map(r.items.map((x) => [x.userId, x]));
  const out = new Map<string, StaffHrState>();
  for (const u of userIds) {
    const it = by.get(u);
    if (!it) {
      out.set(u, { schedule: null, onLeave: false, inSchedule: null });
      continue;
    }
    const s = it.schedule && !it.schedule.dayOff ? { startMin: it.schedule.startMin, endMin: it.schedule.endMin } : null;
    // POS P3.5 ▸ fix2 N6: "อยู่ในช่วง" = ด่านจะปลดล็อกให้ (รวมแถวเมื่อวาน/พรุ่งนี้ข้ามเที่ยงคืน) · ไม่มีแถววันนี้และไม่มีแถวไหนครอบ = null (ไม่มีข้อมูล) ◂
    const inSchedule = !it.active || it.onLeave ? false : coveringWindow(it, now, gate) ? true : it.schedule ? false : null;
    out.set(u, { schedule: s, onLeave: it.onLeave, inSchedule });
  }
  return out;
}

// ═══════════ POS P4.3 ▸ F-P3-17 · CD-P43-O3: ป้าย "จาก HR" รายคนของแท็บพนักงาน (17C) ◂ ═══════════
/**
 * ผู้ใช้ในชุดนี้ที่ผูกกับพนักงานในระบบพนักงานของร้าน (HrEmployee.linkedUserId · ผ่าน facade employeeOfUser) — ร้านไม่มี HR/ไม่ผูก = ไม่อยู่ในชุด ·
 *   อ่านอย่างเดียว · ไม่มีข้อมูลเงิน/การลา (ได้แค่ "ผูกหรือไม่") · เพดาน 500 คนต่อครั้ง
 */
export async function hrLinkedUserIds(tenantId: string, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(isId))].slice(0, 500);
  if (!isId(tenantId) || !ids.length) return new Set();
  const { employeeOfUser } = await hr();
  const rows = await Promise.all(ids.map(async (u) => ((await employeeOfUser(tenantId, u)) ? u : null)));
  return new Set(rows.filter((u): u is string => !!u));
}

// ═══════════ R12 ลงเวลาจากกะ (ตัวเอง = คนในโทเคน) ═══════════
export type PosClockInput = { kind: "IN" | "OUT"; deviceId: string; staffToken: string; shiftId: string };
export type PosClockResult = { ok: true; kind: "IN" | "OUT"; judgement?: string | null } | RegisterRefusal;

/**
 * ลงเวลาเข้า/ออกงานของ "คนในโทเคนผู้ขาย" หลังเปิด/ปิดกะ — กะต้องเป็นของสาขานี้ และคนในโทเคนเป็นผู้เปิดกะ ·
 * note = "POS กะ #<เลขกะ> · <เครื่อง>" · กดซ้ำ = ALREADY_CLOCKED (กันพร้อมกันด้วยล็อกต่อผู้ใช้) · ไม่ผูก HR = NO_EMPLOYEE · โทเคนผิด = STAFF_TOKEN_INVALID
 */
export async function posClockForShift(ctx: RegisterCtx, input: PosClockInput): Promise<PosClockResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    if (!isRecord(input) || (input.kind !== "IN" && input.kind !== "OUT") || !isId(input.shiftId)) return refuse("VALIDATION");
    const deviceId = input.deviceId;
    if (typeof deviceId !== "string" || !POS_DEVICE_CODE_RE.test(deviceId) || (ctx.deviceId !== undefined && ctx.deviceId !== deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const { staffActorFromToken } = await import("./staff-pin");
    const actor = await staffActorFromToken({ tenantId: ctx.tenantId, unitId: ctx.unitId, deviceId }, input.staffToken);
    if (!actor) return refuse("STAFF_TOKEN_INVALID");
    const shift = await prisma.posShift.findFirst({
      where: { id: input.shiftId, tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId },
      select: { shiftNo: true, deviceId: true, deviceLabel: true, openedByUserId: true },
    });
    if (!shift) return refuse("NOT_FOUND");
    if (shift.openedByUserId !== actor.userId) return refuse("PERMISSION_DENIED", "ลงเวลาได้เฉพาะกะของตัวเอง");
    const note = `POS กะ #${shift.shiftNo} · ${shift.deviceLabel ?? shift.deviceId}`;
    const facade = await hr();
    // กดพร้อมกันสองเครื่อง: ล็อกต่อ (ร้าน · ผู้ใช้) ระหว่าง "อ่านครั้งถัดไป → ลงเวลา" ⇒ ตัวหลังเห็นแถวของตัวแรกแล้ว = ALREADY_CLOCKED
    //   POS P3.5 ▸ fix2 F4: clockSelf อ่าน/เขียนผ่าน tx เดียวกับล็อก (ไม่ใช้ connection ที่สองของ pool ใต้ pg_advisory_xact_lock) ◂
    const r = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${"pos.hr.clock:"}::text || ${ctx.tenantId}::text || ':' || ${actor.userId}::text))) l`;
        return facade.clockSelf({ tenantId: ctx.tenantId, userId: actor.userId, kind: input.kind, note }, { tx }); // POS P3.5 ▸ fix2 F4: ใน tx ของล็อก ◂
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (!r.ok) return refuse(r.code);
    return { ok: true, kind: r.kind, judgement: r.judgement ?? null };
  } catch (e) {
    console.error(`[pos/hr-link] posClockForShift INTERNAL ${(e as { name?: string })?.name ?? "Error"}`);
    return refuse("INTERNAL");
  }
}

export type ShiftHoursWarning = "NO_CLOCK_IN" | "NO_CLOCK_OUT" | "NO_EMPLOYEE";
export type ShiftHoursItem = { shiftId: string; durationMin: number; workedMin: number | null; warnings: ShiftHoursWarning[] };
export type ShiftHoursResult = { ok: true; items: ShiftHoursItem[] } | RegisterRefusal;

/**
 * R12 · มติ 7 — ชั่วโมงของกะ (ผู้ดูเงินเดือนเท่านั้น): durationMin = ปิด (หรือตอนนี้) − เปิด · workedMin = นาทีทำงานของผู้เปิดกะช่วง
 * [เปิด − 15 นาที, ปิด (หรือตอนนี้)] ตามกติกา HR · คำเตือน NO_EMPLOYEE (ไม่ผูก HR · workedMin null) · NO_CLOCK_IN (ไม่มี IN ตั้งแต่เที่ยงคืนไทย
 * ถึงเปิดกะ + 15 นาที) · NO_CLOCK_OUT (ปิดกะแล้ว ≥ 30 นาที และการลงเวลาล่าสุดยังเป็น IN) · กะของสาขาที่ผู้ดูเข้าไม่ได้ = ไม่อยู่ในผล
 */
export async function shiftHoursForOwner(ctx: { tenantId: string; systemId: string; unitId?: string }, actor: RegisterActor, input: { shiftIds: string[] }, opts: { now?: Date } = {}): Promise<ShiftHoursResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return refuse("NOT_FOUND", "ไม่พบจุดขายนี้");
    const a = actorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true } });
    if (!sys) return refuse("NOT_FOUND", "ไม่พบจุดขายนี้");
    if (!canViewPayroll(a)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !Array.isArray(input.shiftIds) || input.shiftIds.length > HOURS_MAX_SHIFTS || !input.shiftIds.every(isId)) return refuse("VALIDATION");
    const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
    const shifts = await prisma.posShift.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: [...new Set(input.shiftIds)] }, ...(isId(ctx.unitId) ? { unitId: ctx.unitId } : {}) },
      select: { id: true, unitId: true, openedAt: true, closedAt: true, openedByUserId: true },
    });
    const facade = await hr();
    const items: ShiftHoursItem[] = [];
    for (const sh of shifts) {
      if (!canAccessUnit(a, sh.unitId)) continue;
      const end = sh.closedAt ?? now;
      const durationMin = Math.max(0, Math.floor((end.getTime() - sh.openedAt.getTime()) / MIN_MS));
      const atOpen = new Date(sh.openedAt.getTime() + CLOCK_IN_GRACE_MIN * MIN_MS);
      const [open, current] = await Promise.all([
        facade.onShiftToday({ tenantId: ctx.tenantId, unitId: sh.unitId, at: atOpen, userIds: [sh.openedByUserId] }),
        facade.onShiftToday({ tenantId: ctx.tenantId, unitId: sh.unitId, at: now, userIds: [sh.openedByUserId] }),
      ]);
      const itOpen = open.items.find((x) => x.userId === sh.openedByUserId);
      const itNow = current.items.find((x) => x.userId === sh.openedByUserId);
      if (!itOpen || !itNow) {
        items.push({ shiftId: sh.id, durationMin, workedMin: null, warnings: ["NO_EMPLOYEE"] });
        continue;
      }
      const warnings: ShiftHoursWarning[] = [];
      if (!itOpen.clock.firstInAt) warnings.push("NO_CLOCK_IN");
      if (sh.closedAt && now.getTime() - sh.closedAt.getTime() >= CLOCK_OUT_AFTER_MIN * MIN_MS && itNow.clock.lastKind === "IN") warnings.push("NO_CLOCK_OUT");
      const workedMin = await facade.workedMinutesBetween({ tenantId: ctx.tenantId, userId: sh.openedByUserId, from: new Date(sh.openedAt.getTime() - CLOCK_IN_GRACE_MIN * MIN_MS), to: end });
      items.push({ shiftId: sh.id, durationMin, workedMin, warnings });
    }
    const order = new Map(input.shiftIds.map((id, i) => [id, i]));
    items.sort((x, y) => (order.get(x.shiftId) ?? 0) - (order.get(y.shiftId) ?? 0));
    return { ok: true, items };
  } catch (e) {
    console.error(`[pos/hr-link] shiftHoursForOwner INTERNAL ${(e as { name?: string })?.name ?? "Error"}`);
    return refuse("INTERNAL", "อ่านชั่วโมงทำงานไม่ได้ชั่วคราว — ลองอีกครั้ง");
  }
}

// ═══════════ R9 ส่งค่าคอมฯ เข้างวดเงินเดือน (ผู้เรียก = staff-commission.ts) · R11 รายงาน ═══════════
/** พนักงาน active ที่มีโปรไฟล์เงินเดือนของผู้ใช้ (ระบบ HR เก่าสุดก่อน) · ไม่มี = null (แถวค้าง OPEN) */
export async function hrPayrollEmployeeOf(tenantId: string, userId: string): Promise<{ employeeId: string; systemId: string } | null> {
  return (await hr()).payrollEmployeeOfUser(tenantId, userId);
}
/** งวดที่มีรอบจ่ายแล้วของระบบ HR นี้ (อ่านใน tx ของผู้เรียก) */
export async function hrPayrollRunPeriods(ctx: { tenantId: string; systemId: string }, tx: Tx): Promise<string[]> {
  return (await hr()).payrollRunPeriods(ctx, { tx });
}
/** ยื่นรายการปรับเงิน (PENDING · อนุมัติด้วยกติกา 4 ตาของ HR) ใน tx ของผู้เรียก — งวดที่มีรอบแล้ว = code PERIOD_CLOSED */
export async function hrRequestPayAdjustment(ctx: { tenantId: string; systemId: string }, input: RequestAdjustInput, tx: Tx): Promise<{ ok: boolean; id?: string; code?: string; reason?: string }> {
  return (await hr()).requestAdjustment(ctx, input, { tx });
}
/** ผู้ใช้กลุ่มนี้คนไหนมีพนักงาน active + โปรไฟล์เงินเดือน (รายงาน: noEmployee = ไม่อยู่ในชุดนี้) */
export async function hrPayrollLinkedUserIds(tenantId: string, userIds: string[]): Promise<Set<string>> {
  return new Set(await (await hr()).activeLinkedUserIds(tenantId, userIds));
}
/** สถานะของรายการปรับเงิน (PENDING/APPROVED/REJECTED · runId · periodKey) ตาม id */
export async function hrAdjustmentStatuses(tenantId: string, ids: string[]): Promise<Map<string, { status: string; runId: string | null; periodKey: string }>> {
  const rows = ids.length ? await (await hr()).adjustmentStatuses({ tenantId, ids }) : [];
  return new Map(rows.map((r) => [r.id, { status: r.status, runId: r.runId, periodKey: r.periodKey }])); // POS P3.5 ▸ fix2 N1: + periodKey ◂
}
/** POS P3.5 ▸ fix2 N1: ให้ HR ย้ายรายการของระบบ (ค่าคอมฯ POS) ที่ค้างในงวดที่มีรอบแล้ว ไปงวดแรกที่ว่าง — คืนจำนวนที่ย้าย ◂ */
export async function hrRehomeStrandedSystemAdjustments(tenantId: string): Promise<number> {
  return (await hr()).rehomeStrandedSystemAdjustments(tenantId, 100);
}
/** ร้านนี้มีระบบ HR ไหม (การ์ดการเชื่อมต่อ · ค่าปริยาย clockOnShift) — อ่าน AppSystem ของเคอร์เนล ไม่แตะตาราง HR */
export async function tenantHasHr(tenantId: string): Promise<boolean> {
  return (await prisma.appSystem.count({ where: { tenantId, type: "HR" } })) > 0;
}
