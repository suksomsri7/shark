// SVC B.5 — งานของจอคิววันนี้แถวเดียวที่ B.4 ยังไม่มี: ข้าม (#43) · เรียกคืน · ย้ายช่าง
// สัญญา: ledger/svc-briefs/svc-brief-b.5.md §3.3 · แบบ: DESIGN-BOOKING-QUEUE.md R5 · ภาคผนวก ก #43
//
// 🔴 วินัย B.3/B.4: เขียนสถานะ = CAS (`updateMany where { id, tenantId, unitId, status }` · บัตรผ่าน moveTicketTx = status + callCount) ·
//    แพ้ ⇒ LOST_RACE ไม่เขียนอะไร · ข้อผิดพลาดคืน { ok:false, code, reason ไทย } ไม่ throw
// 🔴 ล็อก (ทุกทางในไฟล์นี้ย้าย/วางช่องใหม่): advisory สาขา → BookingStaff ทั้งสาขา ตาม sortOrder (lockUnitTx) → แถวนัด FOR UPDATE → บัตร ·
//    ห้ามใช้ connection ที่สองขณะถือล็อก (โปรไฟล์ช่าง/บริการ/ค่าตั้งอ่านก่อนธุรกรรม) · 40P01 ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY
// 🔴 ไม่มีแถวถือช่องซ้อน: ข้าม/เรียกคืนไม่ย้ายช่องในธุรกรรม (วางใหม่ด้วย runPlanner หลัง commit — ตัววางคิวเขียนช่องตามแผนใต้ล็อกเดียว) ·
//    ย้ายช่างนัด = ตรวจชนกับแถวถือช่องของช่างใหม่ใต้ล็อก · ย้ายช่าง walk-in = วางทั้งวันใน tx เดียวกัน (วางไม่ได้ ⇒ ถอยทั้ง tx)
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx · ไม่มี event ใหม่ (ข้าม = QueueTicketEvent · เรียกคืน = queue.ticket.called · ย้าย = booking.rescheduled)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import * as queue from "@/lib/modules/queue/service";
import { bkkDayOf, jobOf, lineSettingsOf, lockUnitTx, planAndWriteTx, planPreOf } from "./planner-run";
import { casAppt, lockAppt, okCtx, replan, runLineTx, type JobResult, type LineCtx, type LockedAppt } from "./queue-line";
import { staffDayProfiles } from "./service";
import { staffServiceTerms, windowsToEpoch } from "./staff-hours";

const MIN_MS = 60_000;

export type { JobResult } from "./queue-line";
export type MoveFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "CLASH" | "FULL" | "ON_LEAVE" | "NOT_QUALIFIED" | "BAD_INPUT";
export type MoveResult = { ok: true } | { ok: false; code: MoveFail; reason: string };

const R = {
  NOT_FOUND: "ไม่พบงานนี้",
  STAFF_NOT_FOUND: "ไม่พบผู้ให้บริการที่เลือกในสาขานี้",
  BAD_INPUT: "กรุณาเลือกผู้ให้บริการ",
  SKIP_BAD_STATE: "ข้ามได้เฉพาะคิวที่เรียกแล้วและลูกค้ายังไม่มา",
  RECALL_BAD_STATE: "เรียกคืนได้เฉพาะคิวที่ถูกข้ามไว้",
  MOVE_BAD_STATE: "ย้ายผู้ให้บริการได้เฉพาะนัด \"ใครก็ได้\" ที่ลูกค้ายังไม่มา และ walk-in ที่รอคิว — นัดที่ระบุผู้ให้บริการให้ใช้เลื่อนนัด",
  SAME_STAFF: "งานนี้อยู่กับผู้ให้บริการคนนี้อยู่แล้ว",
  FULL: "ผู้ให้บริการคนนี้ไม่ว่างในช่วงเวลานั้น",
  FULL_WALKIN: "วันนี้ผู้ให้บริการคนนี้รับคิวนี้ไม่ทันแล้ว — ลองเลือกคนอื่น",
  OUT_OF_HOURS: "ช่วงเวลานั้นอยู่นอกเวลาทำงานของผู้ให้บริการคนนี้",
  LOST_RACE: "สถานะงานเพิ่งถูกเปลี่ยนโดยรายการอื่น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
  NOT_SINGLE_LINE: "สาขานี้ยังไม่ได้เปิดโหมดคิวแถวเดียว",
} as const;

const IN_SHOP = new Set<string>(["ARRIVED", "QUEUED"]);
const nowOf = (opts?: { now?: Date }) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const fail = <C extends string>(code: C, reason: string) => ({ ok: false as const, code, reason });

class Abort extends Error {
  constructor(readonly res: { ok: false; code: MoveFail; reason: string }) {
    super(res.code);
  }
}

/** payload ของ event ใบนี้ — id ล้วน (X8: ไม่มีชื่อ/เบอร์) · รูปเดียวกับ queue-line */
function evPayload(a: { id: string; unitId: string; staffId: string; kind: string; channel: string | null; serviceId: string }, extra?: Record<string, unknown>) {
  return { appointmentId: a.id, unitId: a.unitId, staffId: a.staffId, kind: a.kind, channel: a.channel, serviceId: a.serviceId, ...(extra ?? {}) };
}

/** งานหนึ่งชิ้นใต้ advisory สาขา → ช่างทั้งสาขา → แถวนัด · สำเร็จ ⇒ runPlanner หลัง commit */
async function lineTx(ctx: LineCtx, appointmentId: string, now: Date, step: (tx: Prisma.TransactionClient, a: LockedAppt) => Promise<JobResult>): Promise<JobResult> {
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return fail("NOT_FOUND", R.NOT_FOUND);
  const res = await runLineTx(async (tx): Promise<JobResult> => {
    await lockUnitTx(tx, ctx);
    const a = await lockAppt(tx, ctx, appointmentId);
    if (!a) return fail("NOT_FOUND", R.NOT_FOUND);
    return step(tx, a);
  });
  if (!res) return fail("BUSY", R.BUSY);
  if (res.ok) await replan(ctx, now);
  return res;
}

/**
 * ข้าม (#43): งานในร้าน (ARRIVED/QUEUED) ที่บัตร CALLED ⇒ บัตร SKIPPED (skippedAt = now · QueueTicketEvent SKIPPED actor STAFF) ·
 * สถานะงานคงเดิม · แคชแผนของงานล้าง แล้ว runPlanner (งานนี้ไปท้ายแถว) · บัตร/งานสถานะอื่น ⇒ BAD_STATE · ไม่ยิง event
 */
export async function skipJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult> {
  const now = nowOf(opts);
  return lineTx(ctx, appointmentId, now, async (tx, a) => {
    if (!IN_SHOP.has(a.status) || !a.queueTicketId) return fail("BAD_STATE", R.SKIP_BAD_STATE);
    const m = await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "SKIPPED", { now, actorType: "STAFF", actorId: ctx.actorUserId ?? null });
    if (!m.ok) return m.code === "LOST_RACE" ? fail("LOST_RACE", R.LOST_RACE) : fail("BAD_STATE", R.SKIP_BAD_STATE);
    if (!(await casAppt(tx, ctx, a, { plannedStartAt: null, plannedStaffId: null }))) throw new LostRace();
    return { ok: true };
  }).catch(lostRaceToResult);
}

/**
 * เรียกคืน: บัตร SKIPPED ⇒ CALLED (callCount + 1 · calledAt = now · QueueTicketEvent RECALLED) + event queue.ticket.called
 * (คีย์เดิมของ B.4 `queue.ticket.called#<ticketId>#<callCount>`) · งานกลับลำดับเดิม (runPlanner) · บัตรไม่ใช่ SKIPPED ⇒ BAD_STATE
 */
export async function recallJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult> {
  const now = nowOf(opts);
  return lineTx(ctx, appointmentId, now, async (tx, a) => {
    if (!IN_SHOP.has(a.status) || !a.queueTicketId) return fail("BAD_STATE", R.RECALL_BAD_STATE);
    const m = await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "CALLED", {
      now, actorType: "STAFF", actorId: ctx.actorUserId ?? null, recallSkipped: true,
    });
    if (!m.ok) return m.code === "LOST_RACE" ? fail("LOST_RACE", R.LOST_RACE) : fail("BAD_STATE", R.RECALL_BAD_STATE);
    if (!(await casAppt(tx, ctx, a, { plannedStartAt: null, plannedStaffId: null }))) throw new LostRace();
    await emitOutbox(tx, {
      tenantId: ctx.tenantId, unitId: ctx.unitId, type: "queue.ticket.called",
      idempotencyKey: `queue.ticket.called#${m.ticket.id}#${m.ticket.callCount}`,
      payload: evPayload(a, { ticketId: m.ticket.id, callCount: m.ticket.callCount }),
    });
    return { ok: true };
  }).catch(lostRaceToResult);
}

/** CAS ของงานแพ้หลังบัตรเปลี่ยนไปแล้ว ⇒ ถอยทั้ง tx (บัตรกลับสถานะเดิม) แล้วคืน LOST_RACE */
class LostRace extends Error {}
function lostRaceToResult(e: unknown): JobResult {
  if (e instanceof LostRace) return fail("LOST_RACE", R.LOST_RACE);
  throw e;
}

const MOVABLE_BOOKED = new Set<string>(["PENDING", "CONFIRMED", "LATE"]);
type MoveRow = { id: string; kind: string; status: string; assignMode: string; checkedInAt: Date | null; staffId: string };
/** ชนิด/สถานะที่ย้ายช่างได้ (§3.2.1 move): นัด "ใครก็ได้" ที่ยังไม่เช็กอิน (PENDING/CONFIRMED/LATE) · walk-in ที่รอ (QUEUED) */
export function movable(a: MoveRow): boolean {
  if (a.kind === "WALKIN") return a.status === "QUEUED";
  return a.assignMode === "ANY" && a.checkedInAt === null && MOVABLE_BOOKED.has(a.status);
}

/**
 * ย้ายช่าง (ใต้ lockUnitTx → แถวนัด FOR UPDATE) · ลำดับตรวจ: งานไม่พบ ⇒ NOT_FOUND → ช่างปลายทางไม่ใช่ของสาขา/ไม่ active ⇒ NOT_FOUND ·
 * ว่าง ⇒ BAD_INPUT → ชนิด/สถานะ ⇒ BAD_STATE → ลา ⇒ ON_LEAVE → ทำบริการไม่ได้ ⇒ NOT_QUALIFIED →
 *   นัด: เวลาเดิม · endAt = startAt + นาทีของช่างใหม่ + buffer(snapshot) · ชนแถวถือช่องของช่างใหม่ ⇒ FULL ·
 *        ผ่าน ⇒ CAS { staffId, endAt, assignMode SPECIFIC, แคชแผนล้าง } (LATE คง LATE · snapshot/rescheduleCount ไม่แตะ)
 *   walk-in: CAS { staffId, assignMode SPECIFIC } แล้ววางทั้งวันใน tx เดียวกัน · แผนวางงานนี้ไม่ได้วันนี้ ⇒ ถอยทั้ง tx คืน FULL
 *   event booking.rescheduled (by SHOP) · หลัง commit runPlanner
 */
export async function moveJobStaff(ctx: LineCtx, appointmentId: string, toStaffId: string, opts?: { now?: Date }): Promise<MoveResult> {
  const now = nowOf(opts);
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return fail("NOT_FOUND", R.NOT_FOUND);
  const { tenantId, unitId } = ctx;
  const db = tenantDb({ tenantId, unitId }); // อ่านก่อนธุรกรรม — ผูกขอบเขตร้าน/สาขา (X1)
  const cur = await db.appointment.findFirst({
    where: { id: appointmentId, tenantId, unitId },
    select: { id: true, kind: true, status: true, assignMode: true, checkedInAt: true, staffId: true, serviceId: true, startAt: true, policySnapshot: true },
  });
  if (!cur) return fail("NOT_FOUND", R.NOT_FOUND);
  if (typeof toStaffId !== "string" || !toStaffId.trim()) return fail("BAD_INPUT", R.BAD_INPUT);
  const to = await db.bookingStaff.findFirst({ where: { id: toStaffId, tenantId, unitId, active: true }, select: { id: true } });
  if (!to) return fail("NOT_FOUND", R.STAFF_NOT_FOUND);
  if (!movable(cur)) return fail("BAD_STATE", R.MOVE_BAD_STATE);
  if (cur.staffId === toStaffId && cur.assignMode === "SPECIFIC") return fail("BAD_INPUT", R.SAME_STAFF);
  const service = await db.bookingService.findFirst({
    where: { id: cur.serviceId, tenantId, unitId },
    select: { id: true, name: true, durationMin: true, bufferMin: true, priceSatang: true },
  });
  if (!service) return fail("NOT_FOUND", R.NOT_FOUND);
  const walkIn = cur.kind === "WALKIN";
  const dayStr = walkIn ? bkkDayOf(now.getTime()) : bkkDayOf(cur.startAt.getTime());
  const [p] = await staffDayProfiles({ tenantId, unitId }, dayStr, { staffIds: [toStaffId] });
  if (!p) return fail("NOT_FOUND", R.STAFF_NOT_FOUND);
  if (p.onLeave) return fail("ON_LEAVE", `${p.name} ลาในวันนั้น`);
  const terms = staffServiceTerms(p.services, service);
  if (!terms) return fail("NOT_QUALIFIED", `${p.name} ไม่ได้ให้บริการ "${service.name}"`);

  // ── ก่อนธุรกรรม (ห้ามใช้ connection ที่สองใต้ล็อก) ──
  const values = walkIn ? await lineSettingsOf(tenantId, unitId) : null;
  if (walkIn && !values) return fail("BAD_STATE", R.NOT_SINGLE_LINE);
  const pre = walkIn ? await planPreOf(ctx, dayStr, values!) : null;
  const buf = jobOf(cur.policySnapshot).bufferMin ?? service.bufferMin;
  const bookedEnd = new Date(cur.startAt.getTime() + (terms.durationMin + buf) * MIN_MS);
  if (!walkIn) {
    const wins = windowsToEpoch(dayStr, p.windows);
    const svcEnd = cur.startAt.getTime() + terms.durationMin * MIN_MS;
    if (!wins.some((w) => cur.startAt.getTime() >= w.startAt && svcEnd <= w.endAt)) return fail("FULL", R.OUT_OF_HOURS);
  }

  type TxOut = MoveResult;
  let res: TxOut | null;
  try {
    res = await runLineTx(async (tx): Promise<TxOut> => {
      await lockUnitTx(tx, ctx); // advisory สาขา → ช่างทั้งสาขา (ตัวเดิม + ตัวใหม่ ตาม sortOrder)
      const a = await lockAppt(tx, ctx, appointmentId);
      if (!a) return fail("NOT_FOUND", R.NOT_FOUND);
      const row = await tx.appointment.findFirst({ where: { id: a.id, tenantId, unitId }, select: { assignMode: true, startAt: true } });
      if (!row || !movable({ id: a.id, kind: a.kind, status: a.status, assignMode: row.assignMode, checkedInAt: a.checkedInAt, staffId: a.staffId })) {
        return fail("BAD_STATE", R.MOVE_BAD_STATE);
      }
      if (!walkIn) {
        if (row.startAt.getTime() !== cur.startAt.getTime()) return fail("LOST_RACE", R.LOST_RACE);
        // แถวถือช่องของช่างใหม่ (กติกา rescheduleByShop: ไม่นับ CANCELLED/NO_SHOW) + J5: งานที่มาแล้ว/กำลังทำ ถือถึงแผน/เวลาเริ่มจริง + ความยาว
        const clash = await tx.$queryRaw<{ id: string }[]>`
          SELECT x."id" FROM "Appointment" x
          WHERE x."tenantId" = ${tenantId} AND x."staffId" = ${toStaffId} AND x."id" <> ${a.id}
            AND x."status" NOT IN ('CANCELLED', 'NO_SHOW')
            AND x."startAt" < ${bookedEnd}
            AND (CASE WHEN x."status" IN ('ARRIVED', 'IN_SERVICE')
                      THEN GREATEST(x."endAt",
                                    COALESCE(x."plannedStartAt", x."startAt") + (x."endAt" - x."startAt"),
                                    COALESCE(x."startedAt", x."startAt") + (x."endAt" - x."startAt"))
                      ELSE x."endAt" END) > ${cur.startAt}
          LIMIT 1`;
        if (clash.length) return fail("FULL", R.FULL);
        const w = await tx.appointment.updateMany({
          where: { id: a.id, tenantId, unitId, status: a.status, staffId: a.staffId, checkedInAt: null },
          data: { staffId: toStaffId, endAt: bookedEnd, assignMode: "SPECIFIC", plannedStaffId: null, plannedStartAt: null },
        });
        if (w.count !== 1) return fail("LOST_RACE", R.LOST_RACE);
        await emitOutbox(tx, {
          tenantId, unitId, type: "booking.rescheduled",
          idempotencyKey: `booking.rescheduled#${a.id}#${cur.startAt.toISOString()}#${toStaffId}`,
          payload: evPayload({ ...a, staffId: toStaffId }, {
            fromStartAt: cur.startAt.toISOString(), fromStaffId: a.staffId, startAt: cur.startAt.toISOString(), by: "SHOP",
          }),
        });
        return { ok: true };
      }
      // walk-in ที่รอ: ระบุช่างใหม่ แล้ววางทั้งวันใน tx เดียวกัน (ตัววางคิวเขียนช่องตามแผน ⇒ ไม่มีแถวถือช่องซ้อน)
      const w = await tx.appointment.updateMany({
        where: { id: a.id, tenantId, unitId, status: "QUEUED", staffId: a.staffId },
        data: { staffId: toStaffId, assignMode: "SPECIFIC" },
      });
      if (w.count !== 1) return fail("LOST_RACE", R.LOST_RACE);
      await planAndWriteTx(tx, ctx, pre!, now.getTime());
      const after = await tx.appointment.findFirst({
        where: { id: a.id, tenantId, unitId },
        select: { status: true, staffId: true, plannedStaffId: true, plannedStartAt: true, startAt: true },
      });
      if (!after || after.status !== "QUEUED" || after.staffId !== toStaffId || after.plannedStaffId !== toStaffId || !after.plannedStartAt) {
        throw new Abort(fail("FULL", R.FULL_WALKIN)); // ถอยทั้ง tx (staffId/assignMode/แผนของทุกงานกลับเดิม)
      }
      await emitOutbox(tx, {
        tenantId, unitId, type: "booking.rescheduled",
        idempotencyKey: `booking.rescheduled#${a.id}#${after.startAt.toISOString()}#${toStaffId}`,
        payload: evPayload({ ...a, staffId: toStaffId }, {
          fromStartAt: a.startAt.toISOString(), fromStaffId: a.staffId, startAt: after.startAt.toISOString(), by: "SHOP",
        }),
      });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof Abort) return e.res;
    throw e;
  }
  if (!res) return fail("BUSY", R.BUSY);
  if (res.ok) await replan(ctx, now);
  return res;
}
