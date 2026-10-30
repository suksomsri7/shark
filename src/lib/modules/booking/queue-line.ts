// SVC B.4 — โหมดแถวเดียว: เช็กอิน (QR/LINE/เบอร์/พนักงาน) · walk-in · บัตร P/A · เครื่องสถานะงาน · ยกเลิก/เลื่อนฝั่งร้าน
// แบบ: ledger/DESIGN-BOOKING-QUEUE.md §4.1 BQ-4 · สัญญา: ledger/svc-briefs/svc-brief-b.4.md §3.1 §3.2
//
// 🔴 ข้อผิดพลาดคืน { ok:false, code, reason } ไม่ throw (ยกเว้นบั๊ก/ฐานล่ม) · เหตุผลไทยไม่โทษผู้ใช้ · payload event ไม่มีชื่อ/เบอร์ (X8)
// 🔴 เขียนสถานะ = CAS (`updateMany where { id, tenantId, unitId, status: <ที่อ่าน> }`) · count 0 = แพ้ ⇒ ไม่ยิง event
// 🔴 ล็อก: เช็กอิน = แถวนัด FOR UPDATE · walk-in/เลื่อน = advisory สาขา → ช่างทั้งสาขา (lockUnitTx · ลำดับเดียวกับ B.3) → แถวนัด ·
//    งานอื่น (เรียก/เริ่ม/เสร็จ/ยกเลิก) = แถวนัด FOR UPDATE · ห้ามใช้ connection ที่สองขณะถือล็อก: ค่าตั้ง/โปรไฟล์/snapshot/ประเภทบัตร
//    เตรียมก่อนธุรกรรม · ผูก Party + runPlanner หลัง commit (ล้ม = log ไม่ทำให้เหตุการณ์ล้ม)
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx · ของร้าน/สาขาอื่น = NOT_FOUND (เช็กอินด้วยเหตุผลเดียวกันทุกกรณี · X7)
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { resolveSettings, snapshotPolicy, getDef, SNAPSHOT_KEYS } from "@/lib/core/settings";
import { signLink, verifyLink, SIGNED_LINK_MAX_MIN } from "@/lib/core/signed-link";
import * as queue from "@/lib/modules/queue/service";
import { quoteWalkIn } from "./planner";
import {
  LINE_TX,
  addDaysStr,
  bkkDayOf,
  jobOf,
  jobRowsOf,
  latePolicyOf,
  lineSettingsOf,
  lockUnitTx,
  planInputOf,
  planPreOf,
  runPlanner,
  skippedOf,
} from "./planner-run";
import { bookingPhoneKey, isRealDateStr, linkPartyAfterCommit, staffDayProfiles } from "./service";
import { localToUtc } from "./slots";
import { staffServiceTerms } from "./staff-hours";

const MIN_MS = 60_000;

export type LineCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type CheckInBy = { appointmentId: string } | { token: string } | { phone: string };
export type CheckInVia = "QR" | "LINE" | "PHONE" | "STAFF";
export type CheckInFail = "NOT_FOUND" | "NOT_TODAY" | "TOO_LATE" | "NOT_CONFIRMED" | "BAD_STATE" | "AMBIGUOUS" | "NOT_SINGLE_LINE" | "BAD_INPUT" | "BUSY";
export type CheckInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; already: boolean; asWalkIn: boolean }
  | { ok: false; code: CheckInFail; reason: string; candidates?: { appointmentId: string; startAt: Date; staffId: string }[] };

export type WalkInChannel = "KIOSK" | "STAFF" | "REMOTE";
export type WalkInInput = { serviceId: string; staffId: string | null; channel: WalkInChannel; customerName?: string; customerPhone?: string; priority?: boolean };
export type WalkInFail = "NOT_FOUND" | "NOT_SINGLE_LINE" | "WALKIN_DISABLED" | "WALKIN_CLOSED" | "BAD_INPUT" | "BUSY";
export type WalkInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; staffId: string | null; plannedStartAt: Date | null; waitMin: number | null }
  | { ok: false; code: WalkInFail; reason: string };

export type JobFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "CLASH" | "BUSY";
export type JobResult = { ok: true } | { ok: false; code: JobFail; reason: string };
export type RescheduleFail = JobFail | "FULL" | "PAST" | "BAD_INPUT" | "ON_LEAVE" | "NOT_QUALIFIED";
export type RescheduleResult = { ok: true } | { ok: false; code: RescheduleFail; reason: string };

// ───────────────────────── ข้อความ ─────────────────────────
const R = {
  NOT_SINGLE_LINE: "สาขานี้ยังไม่ได้เปิดโหมดคิวแถวเดียว",
  NOT_FOUND_CHECKIN: "ไม่พบนัดที่เช็กอินได้ กรุณาติดต่อพนักงาน", // X7: เหตุผลเดียวทุกกรณีที่หาแถวไม่เจอ/ข้ามขอบเขต/token ใช้ไม่ได้
  NOT_TODAY: "นัดนี้ไม่ใช่ของวันนี้ เช็กอินได้ในวันนัด",
  TOO_LATE: "เลยเวลาที่ร้านรอแล้ว กรุณาติดต่อพนักงานเพื่อรับบัตรคิวใหม่",
  NOT_CONFIRMED: "นัดนี้รอร้านยืนยันก่อน กรุณาติดต่อพนักงาน",
  BAD_STATE_CHECKIN: "นัดนี้เช็กอินไม่ได้ในสถานะปัจจุบัน",
  AMBIGUOUS: "เบอร์นี้มีหลายนัดในวันนี้ กรุณาเลือกนัด",
  BAD_INPUT: "ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่",
  SVC_NOT_FOUND: "ไม่พบบริการที่เลือก",
  STAFF_NOT_FOUND: "ไม่พบผู้ให้บริการที่เลือก",
  WALKIN_DISABLED: "บริการนี้ไม่รับลูกค้า walk-in กรุณาจองเวลาล่วงหน้า",
  WALKIN_CLOSED: "ขณะนี้คิว walk-in เต็มแล้ว กรุณาจองเวลาล่วงหน้า",
  ALREADY_TODAY: "เบอร์นี้มีบัตรคิววันนี้ที่ยังรออยู่แล้ว", // SVC B.9 (rejectSamePhoneToday)
  JOB_NOT_FOUND: "ไม่พบงานนี้",
  JOB_BAD_STATE: "งานนี้ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน",
  LOST_RACE: "สถานะงานเพิ่งถูกเปลี่ยนโดยรายการอื่น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  FULL: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น",
  PAST: "เวลาที่เลือกผ่านไปแล้ว",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
  CLASH: "เริ่มตอนนี้จะชนนัดถัดไป — ย้ายช่างหรือเลื่อนนัดก่อน",
  QUEUE_SETUP: "ตั้งค่าบัตรคิวของสาขายังไม่พร้อม (ประเภทบัตรถูกปิดหรือตัวอักษรนำเลขชนประเภทอื่น) — แจ้งผู้ดูแลร้าน",
} as const;

/** J1: ข้อผิดพลาดชั่วคราวของฐาน (deadlock 40P01 · serialization · หมดเวลา tx) ⇒ ลองใหม่ได้ ไม่ใช่บั๊ก */
function isBusyErr(e: unknown): boolean {
  const o = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
  if (!o) return false;
  if (o.code === "P2034" || o.code === "P2028") return true;
  if (o.meta?.code === "40P01" || o.meta?.code === "40001") return true;
  return typeof o.message === "string" && /40P01|40001|deadlock detected|could not serialize/i.test(o.message);
}
/** ลองธุรกรรมซ้ำ 1 ครั้งเมื่อชนชั่วคราว · ยังชน ⇒ null (ผู้เรียกคืน {ok:false, code:"BUSY"}) · ข้อผิดพลาดอื่น throw ตามจริง */
export async function retryBusy<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusyErr(e)) throw e;
      if (attempt >= 1) {
        console.warn("[booking.line] ธุรกรรมชนกันซ้ำ ⇒ BUSY", e instanceof Error ? e.message.slice(0, 160) : e);
        return null;
      }
    }
  }
}
/** SVC B.5 ▸ ธุรกรรมของทางแถวเดียว (LINE_TX · ลองใหม่ 1 ครั้งเมื่อชนชั่วคราว ⇒ null = BUSY) — ให้ line-ops ใช้ร่วม ◂ */
export function runLineTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | null> {
  return retryBusy(() => prisma.$transaction(fn, LINE_TX));
}
class TxAbort extends Error {}
const isNoType = (e: unknown) => e instanceof Error && e.message === "NO_TYPE";

const SYS_NAME_WALKIN = "ลูกค้า walk-in";

// ───────────────────────── ตัวช่วย ─────────────────────────

type ApptKey = { id: string; unitId: string; staffId: string; kind: string; channel: string | null; serviceId: string };
/** payload ร่วมของ event ใบนี้ — id ล้วน (X8: ไม่มีชื่อ/เบอร์/อีเมล) */
function evPayload(a: ApptKey, extra?: Record<string, unknown>): Record<string, unknown> {
  return { appointmentId: a.id, unitId: a.unitId, staffId: a.staffId, kind: a.kind, channel: a.channel, serviceId: a.serviceId, ...(extra ?? {}) };
}

async function emit(tx: Prisma.TransactionClient, ctx: LineCtx, type: string, key: string, payload: Record<string, unknown>): Promise<void> {
  await emitOutbox(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId, type, idempotencyKey: key, payload });
}

/** แถวนัดใต้ล็อก (FOR UPDATE) — ขอบเขต ctx เสมอ */
export type LockedAppt = {
  id: string; unitId: string; status: AppointmentStatus; kind: string; channel: string | null; staffId: string; serviceId: string;
  startAt: Date; endAt: Date; checkedInAt: Date | null; queueTicketId: string | null; partyId: string | null; policySnapshot: unknown;
};
export async function lockAppt(tx: Prisma.TransactionClient, ctx: LineCtx, id: string): Promise<LockedAppt | null> {
  const rows = await tx.$queryRaw<LockedAppt[]>`
    SELECT "id", "unitId", "status"::text AS "status", "kind", "channel", "staffId", "serviceId", "startAt", "endAt", "checkedInAt",
           "queueTicketId", "partyId", "policySnapshot"
    FROM "Appointment" WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} AND "unitId" = ${ctx.unitId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

/** CAS ของงาน: เปลี่ยนเมื่อสถานะยังเป็นที่อ่าน · คืน true = ชนะ */
export async function casAppt(tx: Prisma.TransactionClient, ctx: LineCtx, a: { id: string; status: AppointmentStatus }, data: Prisma.AppointmentUncheckedUpdateManyInput): Promise<boolean> {
  const r = await tx.appointment.updateMany({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: a.status }, data });
  return r.count === 1;
}

export const okCtx = (ctx: LineCtx | null | undefined): ctx is LineCtx =>
  !!ctx && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.unitId === "string" && !!ctx.unitId;

function prefixesOf(values: Record<string, unknown>): { appointment: string; walkIn: string } {
  const p = values["booking.queue.prefixes"];
  const o = p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  const s = (x: unknown, d: string) => (typeof x === "string" && x.trim() ? x.trim() : d);
  return { appointment: s(o.appointment, "P"), walkIn: s(o.walkIn, "A") };
}

export async function replan(ctx: LineCtx, now: Date): Promise<void> {
  try {
    await runPlanner({ tenantId: ctx.tenantId, unitId: ctx.unitId }, { now });
  } catch (e) {
    console.error(`[booking.line] วางคิวใหม่ไม่สำเร็จ unit=${ctx.unitId}`, e instanceof Error ? e.message : e);
  }
}

// ═════════════════════════ เช็กอิน ═════════════════════════

/**
 * token ของ QR บนใบนัด (CC §4.5) — หมดอายุสิ้นวันถัดจากวันนัด (ไม่เกินเพดานของ signLink) ·
 * นัดไม่ใช่ของ ctx (X1) / เลยวันหมดอายุแล้ว ⇒ null
 */
export async function checkInToken(ctx: LineCtx, appointmentId: string): Promise<string | null> {
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return null;
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true, startAt: true } });
  if (!a) return null;
  const expAt = localToUtc(addDaysStr(bkkDayOf(a.startAt.getTime()), 2), 0).getTime(); // สิ้นวันนัด + 1 วัน
  const minutes = Math.ceil((expAt - Date.now()) / MIN_MS);
  if (minutes < 1) return null;
  return signLink({ tenantId: ctx.tenantId, purpose: "booking.checkin", subjectId: a.id, expMin: Math.min(minutes, SIGNED_LINK_MAX_MIN) });
}

type PhoneHit = { id: string; startAt: Date; staffId: string; status: string; policySnapshot: unknown };

/** นัดของเบอร์ในวันไทยของ now (คีย์เบอร์ของ B.3 ฉบับ SQL — เท่ากับ bookingPhoneKey) */
async function phoneHits(ctx: LineCtx, key: string, dayStr: string): Promise<PhoneHit[]> {
  return prisma.$queryRaw<PhoneHit[]>`
    SELECT a."id", a."startAt", a."staffId", a."status"::text AS "status", a."policySnapshot"
    FROM "Appointment" a
    CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(a."customerPhone", ''), '[^0-9]', '', 'g') AS d1) p1
    CROSS JOIN LATERAL (SELECT CASE WHEN p1.d1 LIKE '0066%' THEN substr(p1.d1, 5)
                                    WHEN p1.d1 LIKE '66%' THEN substr(p1.d1, 3)
                                    ELSE p1.d1 END AS d2) p2
    WHERE a."tenantId" = ${ctx.tenantId} AND a."unitId" = ${ctx.unitId}
      AND a."startAt" >= ${localToUtc(addDaysStr(dayStr, -1), 0)} AND a."startAt" < ${localToUtc(dayStr, 24 * 60)}
      AND a."status" IN ('CONFIRMED', 'LATE', 'ARRIVED', 'IN_SERVICE')
      AND (CASE WHEN p2.d2 = '' THEN '' WHEN p2.d2 LIKE '0%' THEN p2.d2 ELSE '0' || p2.d2 END) = ${key}
    ORDER BY a."startAt", a."id"`;
}

const CHECKED_IN = new Set<string>(["ARRIVED", "QUEUED", "IN_SERVICE"]);

/**
 * เช็กอิน (ใบสั่ง §3.2) — ลำดับตรวจ: แถวเดียว → หาแถว → ใต้ FOR UPDATE: มีบัตรแล้ว ⇒ already · PENDING · สถานะ · วัน · ไม่มา →
 * CAS CONFIRMED|LATE → ARRIVED + บัตร P + queueTicketId + booking.checked_in ใน tx เดียว → หลัง commit runPlanner
 */
export async function checkIn(ctx: LineCtx, by: CheckInBy, opts: { via: CheckInVia; now?: Date }): Promise<CheckInResult> {
  const fail = (code: CheckInFail, reason: string): CheckInResult => ({ ok: false, code, reason });
  const NF = () => fail("NOT_FOUND", R.NOT_FOUND_CHECKIN);
  if (!okCtx(ctx) || !by || typeof by !== "object") return fail("BAD_INPUT", R.BAD_INPUT);
  const via = opts?.via;
  if (via !== "QR" && via !== "LINE" && via !== "PHONE" && via !== "STAFF") return fail("BAD_INPUT", R.BAD_INPUT);
  const now = opts.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return fail("NOT_SINGLE_LINE", R.NOT_SINGLE_LINE);
  const today = bkkDayOf(now.getTime());
  const yesterday = addDaysStr(today, -1);
  /** J6: วันนัด = วันนี้ หรือ เมื่อวาน (นัด 23:xx) ที่ยังไม่เลยเวลาไม่มา ·
   *  SVC B.5 ▸ (ข) หนี้ B.4: นัดเมื่อวานที่ร้านถอยไม่มาเอง (`job.manualHold`) = ร้านตั้งใจรอ ⇒ เช็กอินได้หลังเที่ยงคืน (ไม่มีเวลาไม่มา) ◂ */
  const dayOk = (startAt: Date, snap: unknown): boolean => {
    const d = bkkDayOf(startAt.getTime());
    if (d === today) return true;
    if (d !== yesterday) return false;
    const pol = latePolicyOf(snap, values);
    if (pol.manualHold) return true;
    return pol.noShowAfterMin !== null && now.getTime() < startAt.getTime() + pol.noShowAfterMin * MIN_MS;
  };

  // ── หาแถว (นอกล็อก · ผลจริงตัดสินใต้ FOR UPDATE) ──
  let id: string;
  if ("token" in by) {
    const v = verifyLink(by.token, "booking.checkin");
    if (!v || v.tenantId !== ctx.tenantId) return NF();
    id = v.subjectId;
  } else if ("appointmentId" in by) {
    if (typeof by.appointmentId !== "string" || !by.appointmentId) return NF();
    id = by.appointmentId;
  } else if ("phone" in by) {
    const key = bookingPhoneKey(typeof by.phone === "string" ? by.phone : "");
    if (key === "" || key === "0") return fail("BAD_INPUT", R.BAD_INPUT);
    const hits = (await phoneHits(ctx, key, today)).filter((h) => dayOk(h.startAt, h.policySnapshot) || (bkkDayOf(h.startAt.getTime()) === yesterday && CHECKED_IN.has(h.status)));
    const open = hits.filter((h) => h.status === "CONFIRMED" || h.status === "LATE");
    // ยังไม่เช็กอิน 1 นัด = นัดนั้น · ไม่มีที่ยังไม่เช็กอิน แต่มีที่เช็กอินแล้ว 1 นัด = คืนบัตรเดิม (กดซ้ำ/ยิงพร้อมกัน)
    const pool = open.length ? open : hits;
    if (pool.length === 0) return NF();
    if (pool.length > 1) {
      return { ok: false, code: "AMBIGUOUS", reason: R.AMBIGUOUS, candidates: pool.map((h) => ({ appointmentId: h.id, startAt: h.startAt, staffId: h.staffId })) };
    }
    id = pool[0].id;
  } else return fail("BAD_INPUT", R.BAD_INPUT);

  const pType = await queue.ensureSystemQueueType({ tenantId: ctx.tenantId, unitId: ctx.unitId }, "APPOINTMENT", prefixesOf(values).appointment);
  if (!pType) return fail("NOT_SINGLE_LINE", R.QUEUE_SETUP);

  /**
   * J1: ลำดับในธุรกรรม = แถวนัด FOR UPDATE → (บัตรเก่า) → ออกบัตร → **UPDATE แถวนัดครั้งเดียว** (CAS {ARRIVED, checkedInAt, queueTicketId})
   *   — UPDATE ซ้ำบนแถวที่ tx นี้เพิ่งเขียนจะยิง RI check (KEY SHARE บน BookingStaff) ⇒ ล็อกกลับด้านกับ runPlanner (ช่าง → แถวนัด) ⇒ 40P01
   *   ทางนี้ไม่ขอล็อกช่างเลย ⇒ ขอบรอมีทิศเดียว แถวนัด → บัตร/ลำดับเลขบัตร (ไม่มีวงกับ planner/tick)
   */
  type TxOut = { kind: "fail"; res: CheckInResult } | { kind: "ok"; res: Extract<CheckInResult, { ok: true }>; changed: boolean };
  const attempt = () => prisma.$transaction(async (tx): Promise<TxOut> => {
    const a = await lockAppt(tx, ctx, id);
    if (!a) return { kind: "fail", res: NF() };
    const pol = latePolicyOf(a.policySnapshot, values);
    const lateArrival = (at: number) => a.kind === "BOOKED" && at >= a.startAt.getTime() + pol.graceMin * MIN_MS && pol.afterGrace === "RELEASE_REQUEUE";
    const issue = () => queue.issueTicketTx(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      typeId: pType.id,
      channel: "BOOKING",
      refType: "APPOINTMENT",
      refId: a.id,
      partyId: a.partyId,
      businessDate: today,
      actorType: via === "STAFF" ? "STAFF" : "CUSTOMER",
      ...(via === "STAFF" && ctx.actorUserId ? { issuedBy: ctx.actorUserId } : {}),
    });
    if (CHECKED_IN.has(a.status)) {
      const t = a.queueTicketId
        ? await tx.queueTicket.findFirst({ where: { id: a.queueTicketId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true, number: true } })
        : null;
      if (t) {
        return { kind: "ok", res: { ok: true, appointmentId: a.id, ticketId: t.id, ticketNumber: t.number, already: true, asWalkIn: lateArrival((a.checkedInAt ?? now).getTime()) }, changed: false };
      }
      if (a.status === "ARRIVED") {
        // J6: ARRIVED จากจอเดิม (ไม่มีบัตร) ⇒ ออกบัตรให้ · CAS เดียว · already:true (มาถึงแล้วก่อนหน้านี้)
        const ticket = await issue();
        const checkedInAt = a.checkedInAt ?? now;
        if (!(await casAppt(tx, ctx, a, { checkedInAt, queueTicketId: ticket.id }))) throw new TxAbort();
        await emit(tx, ctx, "booking.checked_in", `booking.checked_in#${a.id}#${ticket.id}`, evPayload(a, { ticketId: ticket.id, via, asWalkIn: false }));
        return { kind: "ok", res: { ok: true, appointmentId: a.id, ticketId: ticket.id, ticketNumber: ticket.number, already: true, asWalkIn: lateArrival(checkedInAt.getTime()) }, changed: true };
      }
    }
    if (a.status === "PENDING") return { kind: "fail", res: fail("NOT_CONFIRMED", R.NOT_CONFIRMED) };
    if (a.status !== "CONFIRMED" && a.status !== "LATE") return { kind: "fail", res: fail("BAD_STATE", R.BAD_STATE_CHECKIN) };
    if (!dayOk(a.startAt, a.policySnapshot)) {
      const d = bkkDayOf(a.startAt.getTime());
      return { kind: "fail", res: d === yesterday ? fail("TOO_LATE", R.TOO_LATE) : fail("NOT_TODAY", R.NOT_TODAY) };
    }
    if (pol.noShowAfterMin !== null && now.getTime() >= a.startAt.getTime() + pol.noShowAfterMin * MIN_MS) {
      return { kind: "fail", res: fail("TOO_LATE", R.TOO_LATE) }; // ไม่เปลี่ยนแถว — tick ตั้ง NO_SHOW (แถว manualHold ไม่มีเวลาไม่มา · J4)
    }
    if (a.queueTicketId) {
      // จอเดิมถอย ARRIVED → CONFIRMED แล้วเช็กอินใหม่ ⇒ บัตรเก่าที่ยัง active ถูกยกเลิกก่อนออกใบใหม่ (งาน↔บัตร active 1:1)
      await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "CANCELLED", { now, actorType: "SYSTEM", cancelReason: "STAFF" });
    }
    const ticket = await issue();
    if (!(await casAppt(tx, ctx, a, { status: "ARRIVED", checkedInAt: now, queueTicketId: ticket.id }))) throw new TxAbort(); // ไม่เกิดใต้ FOR UPDATE — ถอยบัตรทิ้ง
    const asWalkIn = lateArrival(now.getTime());
    await emit(tx, ctx, "booking.checked_in", `booking.checked_in#${a.id}#${ticket.id}`, evPayload(a, { ticketId: ticket.id, via, asWalkIn }));
    return { kind: "ok", res: { ok: true, appointmentId: a.id, ticketId: ticket.id, ticketNumber: ticket.number, already: false, asWalkIn }, changed: true };
  }, LINE_TX);
  let out: TxOut | null;
  try {
    out = await retryBusy(attempt);
  } catch (e) {
    if (e instanceof TxAbort) return fail("BAD_STATE", R.BAD_STATE_CHECKIN);
    if (isNoType(e)) return fail("NOT_SINGLE_LINE", R.QUEUE_SETUP);
    throw e;
  }
  if (!out) return fail("BUSY", R.BUSY);
  if (out.kind === "fail") return out.res;
  if (out.changed) await replan(ctx, now);
  return out.res;
}

// ═════════════════════════ walk-in ═════════════════════════

const WALKIN_CHANNEL_TO_TICKET = { KIOSK: "KIOSK", STAFF: "STAFF", REMOTE: "ONLINE" } as const;

/**
 * walk-in (ใบสั่ง §3.2): ใต้ล็อก (advisory สาขา → ช่างทั้งหมด) สร้าง PlanInput จากฐาน → quoteWalkIn → แถว WALKIN/QUEUED ถือช่องตามที่ quote
 * + บัตร A + booking.created ใน tx เดียว → หลัง commit ผูก Party + runPlanner · คืนแผนหลัง runPlanner
 */
/**
 * SVC B.9 ▸ opt เพิ่ม (พฤติกรรมเดิมคงเดิมเมื่อไม่ส่ง):
 *   skipPartyLink — ช่องทางที่ไม่ยืนยันเบอร์ (รับบัตรมือถือ) ไม่ผูก Party จากเบอร์ (กันสวมเบอร์แล้วยึด LINE ของลูกค้าคนอื่น · N1)
 *   rejectSamePhoneToday — ตรวจ "เบอร์นี้มี walk-in ที่ยังรอของวันนี้" ใต้ล็อกสาขาใน tx เดียวกับการสร้าง (เบอร์เดียวยิงพร้อมกันได้ใบเดียว · N7) ◂
 */
export type WalkInAlready = { ok: false; code: "ALREADY"; reason: string };
export async function createWalkIn(ctx: LineCtx, i: WalkInInput, opts: { now?: Date; deviceId?: string; skipPartyLink?: boolean; rejectSamePhoneToday: true }): Promise<WalkInResult | WalkInAlready>;
export async function createWalkIn(ctx: LineCtx, i: WalkInInput, opts?: { now?: Date; deviceId?: string; skipPartyLink?: boolean; rejectSamePhoneToday?: false }): Promise<WalkInResult>;
export async function createWalkIn(ctx: LineCtx, i: WalkInInput, opts?: { now?: Date; deviceId?: string; skipPartyLink?: boolean; rejectSamePhoneToday?: boolean }): Promise<WalkInResult | WalkInAlready> {
  const fail = (code: WalkInFail, reason: string): WalkInResult => ({ ok: false, code, reason });
  if (!okCtx(ctx) || !i || typeof i !== "object" || typeof i.serviceId !== "string" || !i.serviceId) return fail("BAD_INPUT", R.BAD_INPUT);
  if (i.staffId !== null && i.staffId !== undefined && typeof i.staffId !== "string") return fail("BAD_INPUT", R.BAD_INPUT);
  if (i.channel !== "KIOSK" && i.channel !== "STAFF" && i.channel !== "REMOTE") return fail("BAD_INPUT", R.BAD_INPUT);
  const name = typeof i.customerName === "string" ? i.customerName.trim().slice(0, 200) : "";
  const phone = typeof i.customerPhone === "string" ? i.customerPhone.trim().slice(0, 40) : "";
  if (phone) {
    const key = bookingPhoneKey(phone);
    if (key === "" || key === "0") return fail("BAD_INPUT", R.BAD_INPUT);
  }
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const { tenantId, unitId } = ctx;

  const values = await lineSettingsOf(tenantId, unitId);
  if (!values) return fail("NOT_SINGLE_LINE", R.NOT_SINGLE_LINE);
  const service = await prisma.bookingService.findFirst({
    where: { id: i.serviceId, tenantId, unitId, active: true },
    select: { id: true, name: true, durationMin: true, bufferMin: true, priceSatang: true },
  });
  if (!service) return fail("NOT_FOUND", R.SVC_NOT_FOUND);
  let staffId = typeof i.staffId === "string" && i.staffId ? i.staffId : null;
  if (staffId) {
    const st = await prisma.bookingStaff.findFirst({ where: { id: staffId, tenantId, unitId, active: true }, select: { id: true } });
    if (!st) return fail("NOT_FOUND", R.STAFF_NOT_FOUND);
  }
  // SVC B.6 ▸ ตู้ส่ง deviceId ⇒ walkInPickStaff อ่านชั้น DEVICE (#44 UNIT→DEVICE) ตรงกับที่จอตู้แสดง ◂
  const deviceId = typeof opts?.deviceId === "string" && opts.deviceId ? opts.deviceId : undefined;
  const wr = await resolveSettings({ tenantId }, ["booking.service.walkIn", "booking.queue.walkInPickStaff"], { unitId, serviceId: service.id, ...(deviceId ? { deviceId } : {}) });
  const wi = wr["booking.service.walkIn"]?.value as { enabled?: unknown; closeAtOrAboveMin?: unknown } | null | undefined;
  if (wi && typeof wi === "object") {
    if (wi.enabled === false) return fail("WALKIN_DISABLED", R.WALKIN_DISABLED);
    if (typeof wi.closeAtOrAboveMin === "number" && service.durationMin >= wi.closeAtOrAboveMin) return fail("WALKIN_DISABLED", R.WALKIN_DISABLED);
  }
  if (wr["booking.queue.walkInPickStaff"]?.value === false) staffId = null; // ร้านไม่ให้เลือกช่าง ⇒ ใครก็ได้

  // ── ก่อนธุรกรรม (ห้ามใช้ connection ที่สองใต้ล็อก): โปรไฟล์/บริการ/ค่าตั้งตัววางคิว · snapshot · ประเภทบัตร A ──
  const dayStr = bkkDayOf(now.getTime());
  const pre = await planPreOf(ctx, dayStr, values);
  const perStaff = (SNAPSHOT_KEYS.appointment ?? []).some((k) => {
    const def = getDef(k) as { chain?: readonly string[] } | undefined;
    return !!def?.chain?.includes("STAFF");
  });
  const snapStaff = perStaff ? pre.profiles.map((p) => p.staffId) : [pre.profiles[0]?.staffId ?? null];
  const snaps = new Map<string | null, Awaited<ReturnType<typeof snapshotPolicy>>>();
  for (const sid of snapStaff) {
    snaps.set(sid, await snapshotPolicy({ tenantId }, "appointment", { unitId, serviceId: service.id, ...(sid ? { staffId: sid } : {}) }));
  }
  const aType = await queue.ensureSystemQueueType({ tenantId, unitId }, "WALKIN", prefixesOf(values).walkIn);
  if (!aType) return fail("NOT_SINGLE_LINE", R.QUEUE_SETUP);
  // m-5 (ผู้คุมเคาะ): สิทธิ์คิวก่อนรับเฉพาะช่องทาง STAFF (พนักงานยืนยันกลุ่มได้คิวก่อน) · KIOSK/REMOTE ส่งมา ⇒ ละไว้ ออกเป็นคิวปกติ ไม่ error
  const priority = i.priority === true && i.channel === "STAFF";

  type TxOut = { kind: "closed" } | { kind: "already" } | { kind: "ok"; id: string; ticketId: string; ticketNumber: string; staffId: string; startAt: Date };
  const attempt = () => prisma.$transaction(async (tx): Promise<TxOut> => {
    await lockUnitTx(tx, ctx);
    if (opts?.rejectSamePhoneToday && phone) {
      const key = bookingPhoneKey(phone);
      const mine = await tx.appointment.findMany({
        where: { tenantId, unitId, kind: "WALKIN", status: { in: ["QUEUED", "ARRIVED", "IN_SERVICE"] }, startAt: { gte: localToUtc(dayStr, 0), lt: localToUtc(dayStr, 24 * 60) } },
        select: { customerPhone: true },
      });
      if (mine.some((m) => bookingPhoneKey(m.customerPhone) === key)) return { kind: "already" };
    }
    const rows = await jobRowsOf(tx, ctx, dayStr);
    // SVC B.5 ▸ งานที่บัตร SKIPPED วางท้ายแถวแบบเดียวกับ runPlanner (ราคาเวลารอ = ช่องจริงในฐาน) ◂
    const q = quoteWalkIn(planInputOf(pre, rows, now.getTime(), await skippedOf(tx, ctx, rows)), { serviceId: service.id, staffId, priority });
    if (q.closed || q.startAt === null || q.endAt === null || !q.staffId) return { kind: "closed" };
    const prof = pre.profiles.find((p) => p.staffId === q.staffId);
    const terms = prof ? staffServiceTerms(prof.services, service) : null;
    const durationMin = Math.round((q.endAt - q.startAt) / MIN_MS);
    const snap = snaps.get(perStaff ? q.staffId : snapStaff[0]) ?? null;
    const startAt = new Date(q.startAt);
    const created = await tx.appointment.create({
      data: {
        tenantId,
        unitId,
        staffId: q.staffId,
        serviceId: service.id,
        startAt,
        endAt: new Date(q.endAt + service.bufferMin * MIN_MS),
        status: "QUEUED",
        kind: "WALKIN",
        channel: i.channel,
        source: "STAFF",
        assignMode: staffId ? "SPECIFIC" : "ANY",
        checkedInAt: now,
        plannedStaffId: q.staffId,
        plannedStartAt: startAt,
        priceSatang: terms?.priceSatang ?? service.priceSatang,
        depositSatang: 0,
        customerName: name || SYS_NAME_WALKIN,
        customerPhone: phone,
        // J6: priority เก็บใน job (เฉพาะเมื่อจริง · additive) ⇒ วางคิวทุกรอบยังได้สิทธิ์เดิม
        policySnapshot: { ...(snap ?? {}), job: { durationMin, bufferMin: service.bufferMin, ...(priority ? { priority: true } : {}) } } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, unitId: true, staffId: true, kind: true, channel: true, serviceId: true },
    });
    const ticket = await queue.issueTicketTx(tx, {
      tenantId,
      unitId,
      typeId: aType.id,
      channel: WALKIN_CHANNEL_TO_TICKET[i.channel],
      refType: "APPOINTMENT",
      refId: created.id,
      businessDate: dayStr,
      actorType: i.channel === "STAFF" ? "STAFF" : "CUSTOMER",
      ...(i.channel === "STAFF" && ctx.actorUserId ? { issuedBy: ctx.actorUserId } : {}),
    });
    await tx.appointment.updateMany({ where: { id: created.id, tenantId, unitId, status: "QUEUED", queueTicketId: null }, data: { queueTicketId: ticket.id } });
    await tx.queueTicket.updateMany({ where: { id: ticket.id, tenantId, unitId }, data: { etaAt: startAt } });
    await emit(tx, ctx, "booking.created", `booking.created#${created.id}`, evPayload(created, { ticketId: ticket.id, assignMode: staffId ? "SPECIFIC" : "ANY" }));
    return { kind: "ok", id: created.id, ticketId: ticket.id, ticketNumber: ticket.number, staffId: q.staffId, startAt };
  }, LINE_TX);
  let out: TxOut | null;
  try {
    out = await retryBusy(attempt);
  } catch (e) {
    if (isNoType(e)) return fail("NOT_SINGLE_LINE", R.QUEUE_SETUP);
    throw e;
  }
  if (!out) return fail("BUSY", R.BUSY);
  if (out.kind === "closed") return fail("WALKIN_CLOSED", R.WALKIN_CLOSED);
  if (out.kind === "already") return { ok: false, code: "ALREADY", reason: R.ALREADY_TODAY };

  // ── หลัง commit: ผูก Party (เบอร์ ≥ 9 หลัก) → บัตรได้ partyId เดียวกัน · วางคิวใหม่ ──
  if (phone && !opts?.skipPartyLink) {
    await linkPartyAfterCommit(tenantId, out.id, name || null, phone);
    const p = await prisma.appointment.findFirst({ where: { id: out.id, tenantId, unitId }, select: { partyId: true } });
    if (p?.partyId) await prisma.queueTicket.updateMany({ where: { id: out.ticketId, tenantId, unitId, partyId: null }, data: { partyId: p.partyId } });
  }
  await replan(ctx, now);
  const row = await prisma.appointment.findFirst({ where: { id: out.id, tenantId, unitId }, select: { plannedStartAt: true, plannedStaffId: true, staffId: true } });
  const plannedStartAt = row ? row.plannedStartAt : out.startAt;
  return {
    ok: true,
    appointmentId: out.id,
    ticketId: out.ticketId,
    ticketNumber: out.ticketNumber,
    staffId: row ? (row.plannedStaffId ?? row.staffId) : out.staffId,
    plannedStartAt,
    waitMin: plannedStartAt ? Math.max(0, Math.round((plannedStartAt.getTime() - now.getTime()) / MIN_MS)) : null,
  };
}

// ═════════════════════════ เครื่องสถานะงาน ═════════════════════════

type JobStep = (tx: Prisma.TransactionClient, a: LockedAppt) => Promise<JobResult>;
const jobFail = (code: JobFail, reason: string): JobResult => ({ ok: false, code, reason });

/**
 * งานหนึ่งชิ้นใต้ FOR UPDATE ของแถว · `lockUnit` = ทางที่ย้ายช่อง (J3) ⇒ advisory สาขา → ช่างทั้งสาขา ก่อนแถวนัด (ลำดับเดียวกับ planner) ·
 * สำเร็จ ⇒ runPlanner หลัง commit (หน่วยไม่ใช่แถวเดียว = runPlanner ไม่เขียนอะไร) · ชนชั่วคราว ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY
 */
async function jobTx(ctx: LineCtx, appointmentId: string, now: Date, step: JobStep, o?: { lockUnit?: boolean }): Promise<JobResult> {
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return jobFail("NOT_FOUND", R.JOB_NOT_FOUND);
  const res = await retryBusy(() => prisma.$transaction(async (tx) => {
    if (o?.lockUnit) await lockUnitTx(tx, ctx);
    const a = await lockAppt(tx, ctx, appointmentId);
    if (!a) return jobFail("NOT_FOUND", R.JOB_NOT_FOUND);
    return step(tx, a);
  }, LINE_TX));
  if (!res) return jobFail("BUSY", R.BUSY);
  if (res.ok) await replan(ctx, now);
  return res;
}
const nowOf = (opts?: { now?: Date }) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());

/** เรียก: งาน ARRIVED/QUEUED ที่บัตร WAITING/CALLED ⇒ บัตร CALLED callCount+1 · event คีย์ตาม callCount (เรียกซ้ำ = event ใหม่) · สถานะงานคงเดิม */
export async function callJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult> {
  const now = nowOf(opts);
  return jobTx(ctx, appointmentId, now, async (tx, a) => {
    if ((a.status !== "ARRIVED" && a.status !== "QUEUED") || !a.queueTicketId) return jobFail("BAD_STATE", R.JOB_BAD_STATE);
    const m = await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "CALLED", { now, actorType: "STAFF", actorId: ctx.actorUserId ?? null });
    if (!m.ok) return m.code === "LOST_RACE" ? jobFail("LOST_RACE", R.LOST_RACE) : jobFail("BAD_STATE", R.JOB_BAD_STATE);
    await emit(tx, ctx, "queue.ticket.called", `queue.ticket.called#${m.ticket.id}#${m.ticket.callCount}`,
      evPayload(a, { ticketId: m.ticket.id, callCount: m.ticket.callCount }));
    return { ok: true };
  });
}

/**
 * เริ่ม: ARRIVED/QUEUED ⇒ IN_SERVICE startedAt · บัตร SERVING ·
 * walk-in ย้ายช่องที่ถือไปเริ่มจริง (startAt = now · endAt = now + เดิม) — J3: ทางที่ย้ายช่อง ⇒ ล็อก advisory สาขา → ช่าง → แถวนัด แล้วตรวจชน
 * กับแถวที่ถือช่องของช่างคนนั้น (นัดที่ยังรอ PENDING/CONFIRMED · งานที่มาแล้ว/กำลังทำ ถือถึง max(endAt, now, แผน)) · ชน ⇒ CLASH ไม่เขียนอะไร
 * (walk-in QUEUED อื่น/นัด LATE ที่ตัววางคิวปล่อยช่อง ไม่นับ — วางใหม่หลังเหตุการณ์)
 */
export async function startJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult> {
  const now = nowOf(opts);
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return jobFail("NOT_FOUND", R.JOB_NOT_FOUND);
  const kind = (await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { kind: true } }))?.kind;
  if (!kind) return jobFail("NOT_FOUND", R.JOB_NOT_FOUND);
  return jobTx(ctx, appointmentId, now, async (tx, a) => {
    if (a.status !== "ARRIVED" && a.status !== "QUEUED") return jobFail("BAD_STATE", R.JOB_BAD_STATE);
    const data: Prisma.AppointmentUncheckedUpdateManyInput = { status: "IN_SERVICE", startedAt: now, plannedStartAt: now, plannedStaffId: a.staffId };
    if (a.kind === "WALKIN") {
      const end = new Date(now.getTime() + (a.endAt.getTime() - a.startAt.getTime()));
      const clash = await tx.$queryRaw<{ id: string }[]>`
        SELECT x."id" FROM "Appointment" x
        WHERE x."tenantId" = ${ctx.tenantId} AND x."staffId" = ${a.staffId} AND x."id" <> ${a.id}
          AND x."startAt" < ${end}
          AND (
            (x."status" IN ('PENDING', 'CONFIRMED') AND x."endAt" > ${now})
            OR (x."status" IN ('ARRIVED', 'IN_SERVICE')
                AND GREATEST(x."endAt", ${now}::timestamp,
                             COALESCE(x."plannedStartAt", x."startAt") + (x."endAt" - x."startAt"),
                             COALESCE(x."startedAt", x."startAt") + (x."endAt" - x."startAt")) > ${now})
          )
        LIMIT 1`;
      if (clash.length) return jobFail("CLASH", R.CLASH);
      data.startAt = now;
      data.endAt = end;
    }
    if (!(await casAppt(tx, ctx, a, data))) return jobFail("LOST_RACE", R.LOST_RACE);
    let ticketId: string | null = null;
    if (a.queueTicketId) {
      const m = await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "SERVING", { now, actorType: "STAFF", actorId: ctx.actorUserId ?? null });
      if (m.ok) ticketId = m.ticket.id;
    }
    await emit(tx, ctx, "booking.started", `booking.started#${a.id}`, evPayload(a, { ticketId: ticketId ?? a.queueTicketId }));
    return { ok: true };
  }, { lockUnit: kind === "WALKIN" });
}

/**
 * เสร็จ: IN_SERVICE ⇒ DONE doneAt · บัตร DONE · booking.completed (คีย์เดิม · payload เดิม + id ของใบนี้) + queue.ticket.done ·
 * **ไม่ยิง queue.served** (CRM ลง VISIT จาก booking.completed แล้ว · §6 ข้อ 8) · B.10 จะสลับเป็นบิลพัก POS
 */
export async function completeJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult> {
  const now = nowOf(opts);
  return jobTx(ctx, appointmentId, now, async (tx, a) => {
    if (a.status !== "IN_SERVICE") return jobFail("BAD_STATE", R.JOB_BAD_STATE);
    if (!(await casAppt(tx, ctx, a, { status: "DONE", doneAt: now }))) return jobFail("LOST_RACE", R.LOST_RACE);
    const full = await tx.appointment.findFirst({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { customerId: true } });
    await emit(tx, ctx, "booking.completed", `booking.completed#${a.id}`, {
      appointmentId: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, customerId: full?.customerId ?? null, serviceId: a.serviceId,
      staffId: a.staffId, kind: a.kind, channel: a.channel,
    });
    if (a.queueTicketId) {
      const m = await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "DONE", { now, actorType: "STAFF", actorId: ctx.actorUserId ?? null });
      if (m.ok) await emit(tx, ctx, "queue.ticket.done", `queue.ticket.done#${m.ticket.id}`, evPayload(a, { ticketId: m.ticket.id }));
    }
    return { ok: true };
  });
}

const SHOP_CANCELLABLE = new Set<string>(["PENDING", "CONFIRMED", "LATE", "ARRIVED", "QUEUED"]);

/** ยกเลิกฝั่งร้าน: PENDING/CONFIRMED/LATE/ARRIVED/QUEUED ⇒ CANCELLED cancelReason SHOP · บัตร CANCELLED (STAFF) · มัดจำไม่แตะ (O8b) */
export async function cancelByShop(ctx: LineCtx, appointmentId: string, opts?: { now?: Date; note?: string }): Promise<JobResult> {
  const now = nowOf(opts);
  return jobTx(ctx, appointmentId, now, async (tx, a) => {
    if (!SHOP_CANCELLABLE.has(a.status)) return jobFail("BAD_STATE", R.JOB_BAD_STATE);
    if (!(await casAppt(tx, ctx, a, { status: "CANCELLED", cancelReason: "SHOP", plannedStartAt: null, plannedStaffId: null }))) {
      return jobFail("LOST_RACE", R.LOST_RACE);
    }
    if (a.queueTicketId) {
      await queue.moveTicketTx(tx, { tenantId: ctx.tenantId, unitId: ctx.unitId }, a.queueTicketId, "CANCELLED", { now, actorType: "STAFF", actorId: ctx.actorUserId ?? null, cancelReason: "STAFF" });
    }
    await emit(tx, ctx, "booking.cancelled", `booking.cancelled#${a.id}`, evPayload(a, { ticketId: a.queueTicketId, reason: "SHOP", from: a.status }));
    return { ok: true };
  });
}

const RESCHEDULABLE = new Set<string>(["PENDING", "CONFIRMED", "LATE"]);

/** N1: policySnapshot ที่ตัด job.manualHold ออก (คีย์อื่นคงเดิมทุกตัว) · ไม่มี manualHold ⇒ undefined (ไม่เขียน snapshot) */
function withoutManualHold(snap: unknown): Prisma.InputJsonValue | undefined {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return undefined;
  const base = snap as Record<string, unknown>;
  const job = base.job && typeof base.job === "object" && !Array.isArray(base.job) ? (base.job as Record<string, unknown>) : null;
  if (!job || !Object.prototype.hasOwnProperty.call(job, "manualHold")) return undefined;
  const { manualHold: _drop, ...rest } = job;
  void _drop;
  return { ...base, job: rest } as unknown as Prisma.InputJsonValue;
}

/**
 * เลื่อนฝั่งร้าน (กติการ้านจองให้ของ B.3): PENDING/CONFIRMED/LATE เท่านั้น · ใต้ล็อกสาขา → ช่าง · ห้ามซ้อน (ไม่นับตัวเอง) ·
 * LATE ⇒ CONFIRMED + lateAt null · policySnapshot ไม่เปลี่ยน · rescheduleCount ไม่นับ (นับเฉพาะลูกค้าเลื่อนเอง — B.7)
 */
export async function rescheduleByShop(
  ctx: LineCtx,
  appointmentId: string,
  to: { dateStr: string; startMin: number; staffId?: string },
  opts?: { now?: Date },
): Promise<RescheduleResult> {
  const fail = (code: RescheduleFail, reason: string): RescheduleResult => ({ ok: false, code, reason });
  const now = nowOf(opts);
  if (!okCtx(ctx) || typeof appointmentId !== "string" || !appointmentId) return fail("NOT_FOUND", R.JOB_NOT_FOUND);
  const { tenantId, unitId } = ctx;
  const cur = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId, unitId },
    select: { id: true, status: true, staffId: true, serviceId: true, policySnapshot: true },
  });
  if (!cur) return fail("NOT_FOUND", R.JOB_NOT_FOUND);
  if (!RESCHEDULABLE.has(cur.status)) return fail("BAD_STATE", R.JOB_BAD_STATE);
  if (!to || typeof to !== "object" || typeof to.dateStr !== "string" || !isRealDateStr(to.dateStr)
    || !Number.isInteger(to.startMin) || to.startMin < 0 || to.startMin >= 24 * 60
    || (to.staffId !== undefined && (typeof to.staffId !== "string" || !to.staffId))) {
    return fail("BAD_INPUT", R.BAD_INPUT);
  }
  const staffId = to.staffId ?? cur.staffId;
  const service = await prisma.bookingService.findFirst({
    where: { id: cur.serviceId, tenantId, unitId },
    select: { id: true, name: true, durationMin: true, bufferMin: true, priceSatang: true },
  });
  if (!service) return fail("NOT_FOUND", R.SVC_NOT_FOUND);
  const startAt = localToUtc(to.dateStr, to.startMin);
  if (startAt.getTime() <= now.getTime()) return fail("PAST", R.PAST);
  const [p] = await staffDayProfiles({ tenantId, unitId }, to.dateStr, { staffIds: [staffId] });
  if (!p) return fail("NOT_FOUND", R.STAFF_NOT_FOUND);
  if (p.onLeave) return fail("ON_LEAVE", `${p.name} ลาในวันที่เลือก`);
  const terms = staffServiceTerms(p.services, service);
  if (!terms) return fail("NOT_QUALIFIED", `${p.name} ไม่ได้ให้บริการ "${service.name}"`);
  const buf = jobOf(cur.policySnapshot).bufferMin ?? service.bufferMin;
  const endAt = new Date(startAt.getTime() + (terms.durationMin + buf) * MIN_MS);

  type TxOut = RescheduleResult & { ev?: true };
  const res = await retryBusy(() => prisma.$transaction(async (tx): Promise<TxOut> => {
    await lockUnitTx(tx, ctx); // advisory สาขา → ช่างทั้งสาขา (รวมตัวเดิม + ตัวใหม่ ตาม sortOrder)
    const a = await lockAppt(tx, ctx, appointmentId);
    if (!a) return fail("NOT_FOUND", R.JOB_NOT_FOUND);
    if (!RESCHEDULABLE.has(a.status)) return fail("BAD_STATE", R.JOB_BAD_STATE);
    const clash = await tx.appointment.findFirst({
      where: { tenantId, staffId, id: { not: a.id }, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
      select: { id: true },
    });
    if (clash) return fail("FULL", R.FULL);
    const data: Prisma.AppointmentUncheckedUpdateManyInput = { startAt, endAt, staffId, plannedStartAt: null, plannedStaffId: null };
    // N1: เวลานัดใหม่ ⇒ ล้าง job.manualHold (การถอยของร้านผูกกับเวลานัดเดิม) ใน CAS เดียวกัน — วันใหม่ tick ตั้งสาย/ไม่มาได้ตามปกติ
    const cleared = withoutManualHold(a.policySnapshot);
    if (cleared !== undefined) data.policySnapshot = cleared;
    if (a.status === "LATE") {
      data.status = "CONFIRMED";
      data.lateAt = null;
    }
    if (!(await casAppt(tx, ctx, a, data))) return fail("LOST_RACE", R.LOST_RACE);
    await emit(tx, ctx, "booking.rescheduled", `booking.rescheduled#${a.id}#${startAt.toISOString()}#${staffId}`,
      evPayload({ ...a, staffId }, { fromStartAt: a.startAt.toISOString(), fromStaffId: a.staffId, startAt: startAt.toISOString(), by: "SHOP" }));
    return { ok: true };
  }, LINE_TX));
  if (!res) return fail("BUSY", R.BUSY);
  if (res.ok) await replan(ctx, now);
  return res.ok ? { ok: true } : res;
}

// SVC B.9 ▸ ราคาเวลารอ walk-in แบบอ่านอย่างเดียว (รับบัตรคิวจากมือถือ #42 · ตรวจ maxWaitMin ก่อนสร้างแถว) —
//   ไม่ล็อก ไม่เขียน · ชุดเดียวกับ createWalkIn (planPreOf → jobRowsOf → skippedOf → planInputOf → quoteWalkIn) ·
//   หน่วยไม่ใช่แถวเดียว / ctx ผิดรูป ⇒ null · walkInPickStaff = false ⇒ คิดแบบ "ใครก็ได้" (ตรงกับ createWalkIn) ◂
export async function quoteWalkInWait(
  ctx: LineCtx,
  i: { serviceId: string; staffId: string | null },
  opts?: { now?: Date },
): Promise<{ closed: boolean; waitMin: number | null } | null> {
  if (!okCtx(ctx) || !i || typeof i.serviceId !== "string" || !i.serviceId) return null;
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return null;
  let staffId = typeof i.staffId === "string" && i.staffId ? i.staffId : null;
  if (staffId) {
    const pick = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.queue.walkInPickStaff"], { unitId: ctx.unitId });
    if (pick["booking.queue.walkInPickStaff"]?.value === false) staffId = null;
  }
  const dayStr = bkkDayOf(now.getTime());
  const reader = prisma as unknown as Prisma.TransactionClient;
  const [pre, rows] = await Promise.all([planPreOf(ctx, dayStr, values), jobRowsOf(reader, ctx, dayStr)]);
  const q = quoteWalkIn(planInputOf(pre, rows, now.getTime(), await skippedOf(reader, ctx, rows)), { serviceId: i.serviceId, staffId });
  return { closed: q.closed, waitMin: q.closed ? null : q.waitMin };
}
