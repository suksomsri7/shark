// ─────────────────────────────────────────────────────────────
// platform/booking-line-link.ts — ผูก LINE กับนัด/บัตรคิว + ตัวจัดการ postback `booking.*` · SVC B.9 · ใบสั่ง §3.2
//   issueBookingLinkCode (รหัสผูก APPOINTMENT / QUEUE_TICKET ผ่าน facade แชท) · resolveBookingParty · onBookingPostback · onBookingLinked
//
// 🔴 สัญญา route R0.7 (postback-routes.ts หัวไฟล์ ข้อ 1–4):
//    ctx มาจากแถว connection ของ webhook เสมอ (ไม่อ่าน tenant/party จาก data) · ref ใน params ต้องเป็นของร้าน ctx **และ** ของลูกค้าที่กด
//    (owns: OA ของหน่วยของนัด = ctx.connectionId และ ผูกรหัสโดยผู้ติดต่อนี้ หรือ Party ของนัด = ctx.partyId)
//    ไม่ใช่เจ้าของ/ไม่พบ/ไม่มีพารามิเตอร์/action ไม่รู้จัก ⇒ ข้อความกลางเดียวทุกไบต์ (X7) และไม่เขียนอะไร
//    onLinked: partyMismatch ⇒ LINK_OK_TEXT ตรงตัว (ไม่เปิดข้อมูลของ ref)
// 🔴 คำตอบไม่มีเบอร์ · รหัสผูกคืนครั้งเดียว ห้าม log · ทุกคิวรีผูก tenantId
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { getDef, renderTemplate, resolveSettings } from "@/lib/core/settings";
import { checkIn, deferTicket, loadTodayLine, ticketTokenFor } from "@/lib/modules/booking";
import { issueLinkCode } from "@/lib/modules/chat";
import { bookingApptOf, bookingEndOfDay, bookingOaLink, bookingYmd, bookingHhmm, bookingLinkedContactIds, bookingMsgVars } from "@/lib/platform/booking-notify";
import { LINK_OK_TEXT } from "@/lib/platform/postback-routes";
import type { LinkedInfo, PostbackCtx, PostbackEvent, PostbackReply } from "@/lib/platform/postback-routes";

/** ข้อความกลาง (X7) — ไม่บอกว่ามีรายการนี้อยู่ไหม */
export const BOOKING_POSTBACK_NOT_FOUND = "ไม่พบรายการนี้ — ติดต่อร้านทางแชทนี้ได้เลย";

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
const MAX_TTL_MIN = 43_200;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ACTIONS = new Set(["checkin", "late", "defer", "reschedule"]);
const LINKABLE_BOOKED = new Set(["PENDING", "CONFIRMED", "LATE", "ARRIVED"]);
const LINKABLE_WALKIN = new Set(["QUEUED", "ARRIVED"]);
/**
 * ช่องทางที่ร้าน/LINE ยืนยันตัวลูกค้าแล้ว (พนักงานกรอก · โทรหาร้าน · LINE) — Party ของงานเชื่อได้ว่าเป็นของคนที่จอง
 * ช่องทางอื่น (ONLINE · KIOSK · REMOTE · ไม่ระบุ) = เบอร์ที่ใครพิมพ์ก็ได้ ⇒ ห้ามใช้ Party ของงานยืนยันตัว/ผูก LINE (N1 · กันสวมเบอร์ยึด LINE ลูกค้าคนอื่น)
 */
const VERIFIED_CHANNELS = new Set(["STAFF", "PHONE", "LINE"]);
const verifiedParty = (a: { channel: string | null; partyId: string | null }): string | null =>
  a.partyId && a.channel && VERIFIED_CHANNELS.has(a.channel) ? a.partyId : null;

const T = {
  NOT_CONFIGURED: "สาขานี้ยังไม่ได้ตั้ง LINE OA สำหรับแจ้งเตือนลูกค้า",
  BAD_STATE: "รายการนี้ผูก LINE ไม่ได้ในสถานะปัจจุบัน",
  NOT_FOUND: "ไม่พบนัดนี้",
  ISSUE_FAILED: "ออกรหัสผูก LINE ไม่สำเร็จ — ลองใหม่อีกครั้ง",
  LATE_CANT: "นัดนี้แจ้งไปไม่ทันผ่านแชทไม่ได้แล้ว (เช็กอินแล้วหรือนัดสิ้นสุดแล้ว) — ติดต่อร้านทางแชทนี้ได้เลย",
  LATE_WINDOW: "แจ้งไปไม่ทันผ่านแชทได้เฉพาะวันนัด ก่อนเลยเวลาที่ร้านรอ — ติดต่อร้านทางแชทนี้ได้เลย",
  DEFER_CANT: "บัตรนี้เลื่อนไปคิวหลังไม่ได้แล้ว — ติดต่อพนักงานที่หน้าร้าน",
} as const;

const clampTtl = (ms: number) => Math.min(MAX_TTL_MIN, Math.max(1, Math.ceil(ms / MIN_MS)));
const validNow = (d: Date | undefined): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const NF = (): PostbackReply => ({ text: BOOKING_POSTBACK_NOT_FOUND });

async function unitLineConnection(tenantId: string, unitId: string): Promise<string | null> {
  const s = await resolveSettings({ tenantId }, ["messaging.lineConnectionId"], { unitId });
  const v = s["messaging.lineConnectionId"]?.value;
  return typeof v === "string" && v ? v : null;
}

// ───────────────────────── รหัสผูก ─────────────────────────

export async function issueBookingLinkCode(
  ctx: { tenantId: string; unitId: string },
  i: { appointmentId: string },
  opts?: { now?: Date },
): Promise<
  | { ok: true; purpose: "APPOINTMENT" | "QUEUE_TICKET"; code: string; deepLink: string | null; expiresAt: Date }
  | { ok: false; code: "NOT_FOUND" | "NOT_CONFIGURED" | "BAD_STATE"; reason: string }
> {
  const now = validNow(opts?.now);
  if (!ctx?.tenantId || !ctx?.unitId) return { ok: false, code: "NOT_FOUND", reason: T.NOT_FOUND };
  const a = await bookingApptOf(ctx, i?.appointmentId);
  if (!a) return { ok: false, code: "NOT_FOUND", reason: T.NOT_FOUND };
  const connectionId = await unitLineConnection(ctx.tenantId, ctx.unitId);
  if (!connectionId) return { ok: false, code: "NOT_CONFIGURED", reason: T.NOT_CONFIGURED };
  let purpose: "APPOINTMENT" | "QUEUE_TICKET";
  let refId: string;
  let ttlMin: number;
  if (a.kind !== "WALKIN" && LINKABLE_BOOKED.has(a.status) && now.getTime() < bookingEndOfDay(a.startAt).getTime()) {
    purpose = "APPOINTMENT";
    refId = a.id;
    ttlMin = clampTtl(a.startAt.getTime() + DAY_MS - now.getTime());
  } else if (a.kind === "WALKIN" && LINKABLE_WALKIN.has(a.status) && a.queueTicketId) {
    purpose = "QUEUE_TICKET";
    refId = a.queueTicketId;
    ttlMin = clampTtl(bookingEndOfDay(now).getTime() - now.getTime());
  } else return { ok: false, code: "BAD_STATE", reason: T.BAD_STATE };
  const r = await issueLinkCode({ tenantId: ctx.tenantId }, { purpose, refId, ttlMin, connectionId });
  if (!r.ok) return { ok: false, code: "NOT_CONFIGURED", reason: r.error === "VALIDATION" ? T.ISSUE_FAILED : T.NOT_CONFIGURED };
  return { ok: true, purpose, code: r.code, deepLink: bookingOaLink(r.deepLink), expiresAt: r.expiresAt };
}

/** ref ของรหัสผูก → Party ของงาน (ร้านนี้เท่านั้น) · อื่น/ไม่พบ ⇒ null */
export async function resolveBookingParty(ctx: { tenantId: string }, a: { purpose: string; refId: string }): Promise<string | null> {
  if (!ctx?.tenantId || !a || typeof a.refId !== "string" || !a.refId) return null;
  // QUEUE_TICKET ⇒ null เสมอ (มติผู้คุม RM-1): รหัสบัตรผูกผู้ติดต่อกับบัตรได้ แต่ไม่ผูก Party
  if (a.purpose !== "APPOINTMENT") return null;
  const r = await prisma.appointment.findFirst({ where: { id: a.refId, tenantId: ctx.tenantId }, select: { partyId: true, channel: true } });
  return r ? verifiedParty(r) : null;
}

// ───────────────────────── postback ─────────────────────────

type Appt = NonNullable<Awaited<ReturnType<typeof bookingApptOf>>>;

/** ความเป็นเจ้าของ (ใช้กับทุก postback) */
async function owns(ctx: PostbackCtx, a: Appt): Promise<boolean> {
  const conn = await unitLineConnection(ctx.tenantId, a.unitId);
  if (!conn || conn !== ctx.connectionId) return false;
  const vp = verifiedParty(a);
  if (vp && ctx.partyId && vp === ctx.partyId) return true;
  const linked = await bookingLinkedContactIds(ctx.tenantId, a);
  return linked.includes(ctx.chatContactId);
}

function noShowOf(snap: unknown): number | null {
  const v = snap && typeof snap === "object" ? (snap as { values?: Record<string, unknown> }).values?.["booking.late.noShowAfterMin"] : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function graceOf(snap: unknown): number | null {
  const v = snap && typeof snap === "object" ? (snap as { values?: Record<string, unknown> }).values?.["booking.late.graceMin"] : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/** "ไปไม่ทัน" — audit ครั้งเดียวต่อนัด (ล็อก advisory ต่อนัดใน tx เดียว · ไม่ใช้ connection ที่สอง) */
async function recordRunningLate(tenantId: string, a: Appt): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:late:${tenantId}:${a.id}`}, 0))`;
    const had = await tx.auditLog.findFirst({ where: { tenantId, action: "booking.customer.running_late", targetType: "Appointment", targetId: a.id }, select: { id: true } });
    if (had) return;
    // = writeAudit (core/audit) แต่อยู่ใต้ tx เดียวกับล็อก — แถวเดียวต่อนัดแม้กดพร้อมกันหลายเครื่อง
    await tx.auditLog.create({
      data: { tenantId, actorType: "SYSTEM", actorId: null, action: "booking.customer.running_late", targetType: "Appointment", targetId: a.id, after: { unitId: a.unitId } },
    });
  });
}

export async function onBookingPostback(ctx: PostbackCtx, evt: PostbackEvent, opts?: { now?: Date }): Promise<PostbackReply> {
  const now = validNow(opts?.now);
  if (!ctx?.tenantId || !ctx?.connectionId || !ctx?.chatContactId || !evt) return NF();
  const id = evt.params?.a;
  if (typeof id !== "string" || !id) return NF();
  if (!ID_RE.test(id)) throw new Error("BAD_POSTBACK_DATA"); // ข้อมูลผิดรูป (ไม่ได้มาจากปุ่มของเรา) ⇒ ตัวแจกตอบ handled:false
  if (!ACTIONS.has(evt.action)) return NF();
  const a = await bookingApptOf({ tenantId: ctx.tenantId }, id);
  if (!a || !(await owns(ctx, a))) return NF();
  const uctx = { tenantId: ctx.tenantId, unitId: a.unitId };

  switch (evt.action) {
    case "checkin": {
      const r = await checkIn(uctx, { appointmentId: a.id }, { via: "LINE", now });
      if (!r.ok) return { text: r.reason };
      return { text: `เช็กอินเรียบร้อย · บัตรคิวของคุณคือ ${r.ticketNumber} — รอเรียกคิวได้เลย` };
    }
    case "late": {
      if (a.kind === "WALKIN" || (a.status !== "CONFIRMED" && a.status !== "LATE") || a.checkedInAt) return { text: T.LATE_CANT };
      // N8: แจ้งได้เฉพาะวันนัด (วันไทยเดียวกัน) และก่อนถึงเวลาถือว่าไม่มา (snapshot · ไม่มี = สิ้นวันนัด)
      const noShow = noShowOf(a.policySnapshot);
      const until = noShow !== null ? a.startAt.getTime() + noShow * MIN_MS : bookingEndOfDay(a.startAt).getTime();
      if (bookingYmd(now) !== bookingYmd(a.startAt) || now.getTime() >= until) return { text: T.LATE_WINDOW };
      await recordRunningLate(ctx.tenantId, a);
      const g = graceOf(a.policySnapshot);
      const hold = g !== null ? ` · ร้านรอได้ถึงประมาณ ${bookingHhmm(a.startAt.getTime() + g * MIN_MS)} (ผ่อนผัน ${g} นาที)` : "";
      return { text: `รับทราบแล้ว แจ้งร้านให้ว่าคุณจะไปถึงช้ากว่านัด ${bookingHhmm(a.startAt.getTime())}${hold} · เมื่อถึงร้านกดเช็กอินได้เลย` };
    }
    case "defer": {
      if (a.kind !== "WALKIN" || !a.queueTicketId) return { text: T.DEFER_CANT };
      const token = await ticketTokenFor(uctx, a.queueTicketId);
      if (!token) return { text: T.DEFER_CANT };
      const r = await deferTicket(token, { now });
      return r.ok ? { text: "เลื่อนไปคิวหลังให้แล้ว 1 คิว · ดูลำดับล่าสุดได้จากหน้าบัตรคิว" } : { text: r.reason };
    }
    default: // reschedule — ลิงก์จัดการนัดมาพร้อม B.7 (หนี้)
      return { text: `ต้องการเลื่อนนัดเวลา ${bookingHhmm(a.startAt.getTime())} พิมพ์วันเวลาที่สะดวกในแชทนี้ได้เลย ร้านจะติดต่อกลับเพื่อเลื่อนนัดให้` };
  }
}

export async function onBookingLinked(ctx: PostbackCtx, a: LinkedInfo, opts?: { now?: Date }): Promise<PostbackReply> {
  const now = validNow(opts?.now);
  if (!a || a.partyMismatch) return { text: LINK_OK_TEXT };
  if (!ctx?.tenantId || typeof a.refId !== "string" || !a.refId) return { text: LINK_OK_TEXT };
  if (a.purpose === "QUEUE_TICKET") {
    const t = await prisma.queueTicket.findFirst({
      where: { id: a.refId, tenantId: ctx.tenantId, refType: "APPOINTMENT" },
      select: { id: true, unitId: true, number: true, status: true, callCount: true, refId: true },
    });
    if (!t?.refId) return { text: LINK_OK_TEXT };
    const fallback = { text: `ผูก LINE แล้ว · บัตร ${t.number}` };
    const uctx = { tenantId: ctx.tenantId, unitId: t.unitId };
    const appt = await bookingApptOf(uctx, t.refId);
    if (!appt) return fallback;
    const S = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.msg.enabled", "booking.msg.ticketIssued", "booking.notify.hideServiceName"], { unitId: t.unitId });
    const en = S["booking.msg.enabled"]?.value as Record<string, unknown> | null | undefined;
    const def = getDef("booking.msg.ticketIssued");
    if (!en || typeof en !== "object" || en.ticketIssued !== true || !def) return fallback;
    const line = await loadTodayLine(uctx, { userId: "", access: { view: true, operate: false, checkIn: false, walkIn: false, runOwn: false, runAny: false, fullPhone: false } }, { now });
    const vars = await bookingMsgVars(uctx, appt, { id: t.id, number: t.number, status: String(t.status), callCount: t.callCount }, { line, hideService: S["booking.notify.hideServiceName"]?.value === true });
    const text = renderTemplate(def, S["booking.msg.ticketIssued"]?.value, vars, "th").trim();
    return text.includes(t.number) ? { text } : fallback;
  }
  if (a.purpose === "APPOINTMENT") {
    const appt = await bookingApptOf({ tenantId: ctx.tenantId }, a.refId);
    if (!appt) return { text: LINK_OK_TEXT };
    const unit = await prisma.businessUnit.findFirst({ where: { id: appt.unitId, tenantId: ctx.tenantId }, select: { name: true } });
    return { text: `ผูก LINE กับนัดที่ ${unit?.name ?? "ร้าน"} เวลา ${bookingHhmm(appt.startAt.getTime())} แล้ว · เราจะแจ้งเตือนก่อนถึงนัดทางแชทนี้` };
  }
  return { text: LINK_OK_TEXT };
}
