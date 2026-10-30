// SVC B.6 — หน้าสาธารณะของโหมดแถวเดียว: จอทีวี (ภาพ 05) · ตู้รับบัตร/เช็กอิน (ภาพ 04) · หน้าบัตรลูกค้า (ภาพ 06ก)
// สัญญา: ledger/svc-briefs/svc-brief-b.6.md §3.2–§3.4 · แบบ: DESIGN-BOOKING-QUEUE.md R4 · §7 · ภาคผนวก ก #44 #52–58
//
// 🔴 แยกร้านด้วย token เท่านั้น (X1): อุปกรณ์ = deviceByToken · บัตร = HMAC (ไม่เก็บในฐาน) · ทุกคิวรีผูก tenantId + unitId ที่ได้จาก token
// 🔴 token ใช้ไม่ได้ทุกกรณี ⇒ ผลเดียวกันทุกไบต์ (X7): ตัวโหลด null · ฟังก์ชันเขียน { ok:false, code:"NOT_FOUND", reason: R.NF }
// 🔴 X8: DTO ทุกตัวไม่มีชื่อ/เบอร์ลูกค้า (ใช้แผนสดของ B.5 แล้วตัดเหลือเลข/เวลา/ชื่อช่าง) · showCustomerName ไม่มีผล (มติ Q2)
// 🔴 นโยบายร้านอ่านจากทะเบียนค่าตั้งต่อคำขอ (UNIT → DEVICE) · rate limit = checkRateLimitDb (ข้ามเครื่องได้) นับก่อนค้นฐานงาน
// 🔴 เขียนสถานะ = CAS ใต้ lockUnitTx → แถวนัด (FOR UPDATE) · replan หลัง commit · ชนชั่วคราว ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY
// 🔴 ทุกฟังก์ชันรับ now ฉีดได้ (นาฬิกาเดียวตลอด) · เวลาไทยคิดจาก epoch (bkkDayOf/localToUtc)
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import * as queue from "@/lib/modules/queue/service";
import { deviceByToken } from "./devices";
import { quoteWalkIn } from "./planner";
import { addDaysStr, bkkDayOf, jobRowsOf, lineSettingsOf, lockUnitTx, planInputOf, planPreOf, skippedOf } from "./planner-run";
import { casAppt, checkIn, createWalkIn, lockAppt, replan, runLineTx } from "./queue-line";
import { localToUtc } from "./slots";
import { loadTodayLine, type LineJob, type TodayLineView } from "./today-line";

const MIN_MS = 60_000;

// ───────────────────────── สัญญา ─────────────────────────
export type TvChair = { seat: number; staffName: string | null; state: "BUSY" | "CALLING" | "FREE"; ticketNumber: string | null; nextTicketNumber: string | null };
export type TvNext = { ticketNumber: string; startMs: number | null; seat: number | null; staffName: string | null; booked: boolean };
export type TvView = {
  unitName: string; dayStr: string; nowMs: number;
  calling: { ticketNumber: string; seat: number | null; staffName: string | null; serviceName: string } | null;
  chairs: TvChair[]; next: TvNext[]; walkInWaitMin: number | null; voice: string[];
};
export type KioskService = { id: string; name: string; durationMin: number; priceSatang: number; walkIn: boolean };
export type KioskView = {
  unitName: string; dayStr: string; nowMs: number;
  busyCount: number; seatCount: number; waitingCount: number; nextTicketNumber: string | null; walkInWaitMin: number | null;
  services: KioskService[]; staff: { id: string; name: string }[] | null;
  phone: "OPTIONAL" | "REQUIRED"; paperTicket: boolean; pinLock: boolean;
  /** SVC B.7 ▸ หนี้ B.6 §9: หน้าจองล่วงหน้าของสาขา (/s/<tenantSlug>/<unitSlug>) — QR "จองวันอื่นล่วงหน้า" ◂ */
  bookUrl: string;
};
export type KioskTicket = { ticketNumber: string; serviceName: string; staffName: string | null; seat: number | null; plannedStartMs: number | null; waitMin: number | null; aheadCount: number; ticketUrl: string; lineLink: string | null };
export type KioskCheckedIn = KioskTicket & { bookedStartMs: number };
export type KioskFail = "NOT_FOUND" | "BAD_INPUT" | "RATE_LIMITED" | "BUSY";
export type TicketAhead = { kind: "NOW" | "WAIT" | "BOOKED" | "ME"; ticketNumber: string | null; startMs: number | null; seat: number | null };
export type TicketView = {
  unitName: string; ticketNumber: string; status: "WAITING" | "CALLED" | "SERVING" | "DONE" | "SKIPPED" | "CANCELLED" | "NO_SHOW";
  kind: "BOOKED" | "WALKIN"; serviceName: string; staffName: string | null; seat: number | null;
  issuedAtMs: number; bookedStartMs: number | null; plannedStartMs: number | null; returnByMs: number | null;
  aheadCount: number | null; ahead: TicketAhead[]; canDefer: boolean; canCancel: boolean;
};
export type TicketOpFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "RATE_LIMITED";

/** ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน · §7 ข้อ 9) */
export const KIOSK_RATE = { checkIn: { limit: 20, windowMs: 300_000 }, walkIn: { limit: 30, windowMs: 600_000 } } as const satisfies {
  checkIn: { limit: 20; windowMs: 300000 }; walkIn: { limit: 30; windowMs: 600000 };
};
export const TICKET_RATE = { limit: 10, windowMs: 600_000 } as const satisfies { limit: 10; windowMs: 600000 };

const R = {
  /** X7: ข้อความเดียวทุกกรณีที่ token/อุปกรณ์/บัตร/นัด ใช้ไม่ได้หรือหาไม่พบ */
  NF: "ไม่พบข้อมูลที่ใช้ได้ — กรุณาติดต่อพนักงานที่หน้าร้าน",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  BAD_INPUT: "ข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่",
  AMBIGUOUS: "เบอร์นี้มีหลายนัดในวันนี้ — สแกน QR จากใบนัด หรือติดต่อพนักงาน",
  PHONE_REQUIRED: "กรุณากรอกเบอร์โทรก่อนรับบัตรคิว",
  WALKIN_DISABLED: "บริการนี้ไม่รับลูกค้า walk-in กรุณาจองเวลาล่วงหน้า",
  SVC_NOT_FOUND: "ไม่พบบริการที่เลือก",
  DEFER_BAD_STATE: "บัตรนี้เลื่อนไปคิวหลังไม่ได้แล้ว (ไม่มีคิว walk-in ถัดไป หรือถึงคิวแล้ว)",
  CANCEL_BAD_STATE: "บัตรนี้ยกเลิกจากหน้านี้ไม่ได้ — ติดต่อพนักงานที่หน้าร้าน",
  LOST_RACE: "สถานะบัตรเพิ่งเปลี่ยน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
} as const;

type Ctx = { tenantId: string; unitId: string };
type Opts = { now?: Date };
const nowOf = (o?: Opts): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const nf = () => ({ ok: false as const, code: "NOT_FOUND" as const, reason: R.NF });
const fail = <C extends string>(code: C, reason: string) => ({ ok: false as const, code, reason });

/** ผู้ดูภายในของหน้าสาธารณะ — เห็นแผนอย่างเดียว (ไม่มีเบอร์เต็ม · ไม่มีปุ่ม) */
const PUBLIC_VIEWER = { userId: "", access: { view: true, operate: false, checkIn: false, walkIn: false, runOwn: false, runAny: false, fullPhone: false } };
const lineOf = (ctx: Ctx, now: Date): Promise<TodayLineView | null> => loadTodayLine(ctx, PUBLIC_VIEWER, { now });

const TV_KEYS = ["booking.display.tvShow", "booking.display.voice", "booking.display.nextCount"];
const KIOSK_KEYS = ["booking.kiosk.services", "booking.kiosk.phone", "booking.kiosk.paperTicket", "booking.kiosk.pinLock", "booking.queue.walkInPickStaff", "booking.display.tvShow"];

async function settingsOf(ctx: Ctx, keys: string[], deviceId?: string): Promise<Record<string, unknown>> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, keys, { unitId: ctx.unitId, ...(deviceId ? { deviceId } : {}) });
  return Object.fromEntries(keys.map((k) => [k, r[k]?.value]));
}
/** #52 label: PROVIDER ⇒ แสดงชื่อช่าง · RESOURCE ⇒ เลขเก้าอี้อย่างเดียว (showCustomerName ไม่มีผล — Q2) */
const showStaffOf = (v: unknown): boolean => !(v && typeof v === "object" && (v as { label?: unknown }).label === "RESOURCE");

async function unitNameOf(ctx: Ctx): Promise<string> {
  const u = await tenantDb(ctx).businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId }, select: { name: true } });
  return u?.name ?? "";
}

/** ลำดับเก้าอี้ (B.5) + ชื่อช่าง */
function seatsOf(line: TodayLineView) {
  const seat = new Map(line.staff.map((s) => [s.staffId, s.seat]));
  const name = new Map(line.staff.map((s) => [s.staffId, s.name]));
  return {
    seat: (id: string | null | undefined) => (id ? seat.get(id) ?? null : null),
    name: (id: string | null | undefined, show: boolean) => (show && id ? name.get(id) ?? null : null),
  };
}

// ───────────────────────── บริการที่รับ walk-in · ราคาเวลารอ ─────────────────────────

type Svc = { id: string; name: string; durationMin: number; priceSatang: number; walkIn: boolean };
/** บริการ active ของสาขา (sortOrder, createdAt, id) + รับ walk-in ได้ไหม (booking.service.walkIn: enabled · closeAtOrAboveMin — กติกาเดียวกับ createWalkIn) */
async function servicesOf(ctx: Ctx): Promise<Svc[]> {
  const svcs = await tenantDb(ctx).bookingService.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, durationMin: true, priceSatang: true },
  });
  if (!svcs.length) return [];
  const res = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.service.walkIn"], svcs.map((s) => ({ unitId: ctx.unitId, serviceId: s.id })));
  return svcs.map((s, i) => {
    const v = res[i]?.["booking.service.walkIn"]?.value as { enabled?: unknown; closeAtOrAboveMin?: unknown } | null | undefined;
    const open = !v || typeof v !== "object" ? true : v.enabled !== false && !(typeof v.closeAtOrAboveMin === "number" && s.durationMin >= v.closeAtOrAboveMin);
    return { id: s.id, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang, walkIn: open };
  });
}

/** เวลารอ walk-in "ใครก็ได้" ของบริการ walk-in แรก ณ now — quoteWalkIn อ่านอย่างเดียว (ไม่ล็อก ไม่เขียน) · ปิดรับ/ไม่มีบริการ ⇒ null */
async function walkInWaitOf(ctx: Ctx, now: Date, svcs: Svc[]): Promise<number | null> {
  const first = svcs.find((s) => s.walkIn);
  if (!first) return null;
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return null;
  const dayStr = bkkDayOf(now.getTime());
  const reader = tenantDb(ctx) as unknown as Prisma.TransactionClient;
  const [pre, rows] = await Promise.all([planPreOf(ctx, dayStr, values), jobRowsOf(reader, ctx, dayStr)]);
  const skipped = await skippedOf(reader, ctx, rows);
  const q = quoteWalkIn(planInputOf(pre, rows, now.getTime(), skipped), { serviceId: first.id, staffId: null });
  return q.closed || q.waitMin === null ? null : q.waitMin;
}

// ═════════════════════════ ทีวี (§3.2) ═════════════════════════

export async function loadTvView(token: unknown, opts?: Opts): Promise<TvView | null> {
  const now = nowOf(opts);
  const dev = await deviceByToken(token, "TV");
  if (!dev) return null;
  const ctx: Ctx = { tenantId: dev.tenantId, unitId: dev.unitId };
  const [line, s, unitName, svcs] = await Promise.all([lineOf(ctx, now), settingsOf(ctx, TV_KEYS, dev.deviceId), unitNameOf(ctx), servicesOf(ctx)]);
  if (!line) return null;
  const show = showStaffOf(s["booking.display.tvShow"]);
  const nextCount = typeof s["booking.display.nextCount"] === "number" ? (s["booking.display.nextCount"] as number) : 3;
  const voice = Array.isArray(s["booking.display.voice"]) ? (s["booking.display.voice"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const st = seatsOf(line);

  // กำลังเรียก = บัตร CALLED ของงานในร้านที่ calledAt ล่าสุด
  const calledJobs = line.waiting.filter((j) => j.ticketStatus === "CALLED");
  let calling: TvView["calling"] = null;
  if (calledJobs.length) {
    const tks = await tenantDb(ctx).queueTicket.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, refType: "APPOINTMENT", refId: { in: calledJobs.map((j) => j.appointmentId) }, status: "CALLED" },
      select: { refId: true, calledAt: true },
    });
    const at = new Map(tks.map((t) => [t.refId, t.calledAt?.getTime() ?? 0]));
    const top = [...calledJobs].sort((a, b) => (at.get(b.appointmentId) ?? 0) - (at.get(a.appointmentId) ?? 0))[0];
    if (top?.ticketNumber) calling = { ticketNumber: top.ticketNumber, seat: st.seat(top.staffId), staffName: st.name(top.staffId, show), serviceName: top.serviceName };
  }

  const chairs: TvChair[] = line.staff.map((p) => {
    const busy = line.inService.find((j) => j.staffId === p.staffId);
    const call = busy ? null : calledJobs.find((j) => j.staffId === p.staffId);
    const nxt = line.waiting.find((j) => j.ticketStatus === "WAITING" && j.staffId === p.staffId);
    return {
      seat: p.seat,
      staffName: show ? p.name : null,
      state: busy ? "BUSY" : call ? "CALLING" : "FREE",
      ticketNumber: busy?.ticketNumber ?? call?.ticketNumber ?? null,
      nextTicketNumber: nxt?.ticketNumber ?? null,
    };
  });

  const next: TvNext[] = line.waiting
    .filter((j): j is LineJob & { ticketNumber: string } => j.ticketStatus === "WAITING" && !!j.ticketNumber)
    .slice(0, Math.max(0, nextCount))
    .map((j) => ({ ticketNumber: j.ticketNumber, startMs: j.plannedStartMs, seat: st.seat(j.staffId), staffName: st.name(j.staffId, show), booked: j.kind === "BOOKED" }));

  return {
    unitName, dayStr: bkkDayOf(now.getTime()), nowMs: now.getTime(),
    calling, chairs, next, walkInWaitMin: await walkInWaitOf(ctx, now, svcs), voice,
  };
}

// ═════════════════════════ ตู้ (§3.3) ═════════════════════════

type KioskPolicy = { services: "WALKIN_ENABLED" | "ALL"; phone: "OPTIONAL" | "REQUIRED"; paperTicket: boolean; pinLock: boolean; pickStaff: boolean; showStaff: boolean };
function kioskPolicyOf(s: Record<string, unknown>): KioskPolicy {
  return {
    services: s["booking.kiosk.services"] === "ALL" ? "ALL" : "WALKIN_ENABLED",
    phone: s["booking.kiosk.phone"] === "REQUIRED" ? "REQUIRED" : "OPTIONAL",
    paperTicket: s["booking.kiosk.paperTicket"] === true,
    pinLock: s["booking.kiosk.pinLock"] !== false,
    pickStaff: s["booking.queue.walkInPickStaff"] !== false,
    showStaff: showStaffOf(s["booking.display.tvShow"]),
  };
}
const kioskServicesFor = (svcs: Svc[], p: KioskPolicy): KioskService[] =>
  (p.services === "ALL" ? svcs : svcs.filter((s) => s.walkIn)).map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang, walkIn: s.walkIn }));

export async function loadKioskView(token: unknown, opts?: Opts): Promise<KioskView | null> {
  const now = nowOf(opts);
  const dev = await deviceByToken(token, "KIOSK");
  if (!dev) return null;
  const ctx: Ctx = { tenantId: dev.tenantId, unitId: dev.unitId };
  const [line, s, unitName, svcs] = await Promise.all([lineOf(ctx, now), settingsOf(ctx, KIOSK_KEYS, dev.deviceId), unitNameOf(ctx), servicesOf(ctx)]);
  if (!line) return null;
  const p = kioskPolicyOf(s);
  const first = line.waiting.find((j) => (j.ticketStatus === "WAITING" || j.ticketStatus === "CALLED") && !!j.ticketNumber);
  return {
    unitName, dayStr: bkkDayOf(now.getTime()), nowMs: now.getTime(),
    busyCount: new Set(line.inService.map((j) => j.staffId).filter((x): x is string => !!x)).size,
    seatCount: line.staff.length,
    waitingCount: line.kpi.waiting,
    nextTicketNumber: first?.ticketNumber ?? null,
    walkInWaitMin: await walkInWaitOf(ctx, now, svcs),
    services: kioskServicesFor(svcs, p),
    staff: p.pickStaff ? line.staff.map((x) => ({ id: x.staffId, name: x.name })) : null,
    phone: p.phone, paperTicket: p.paperTicket, pinLock: p.pinLock,
    bookUrl: await bookUrlOf(ctx), // SVC B.7
  };
}

/** SVC B.7 ▸ หน้าจองออนไลน์ของสาขา (slug ร้าน + slug สาขา · ไม่มี token) ◂ */
async function bookUrlOf(ctx: Ctx): Promise<string> {
  const u = await tenantDb(ctx).businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId }, select: { slug: true, tenant: { select: { slug: true } } } });
  return u ? `/s/${u.tenant.slug}/${u.slug}` : "";
}

/** ข้อความจากเครื่องอ่าน QR: token ตรง ๆ หรือ URL ที่มี token เป็น ?t= / ?token= หรือ path ท้ายสุด */
function qrTokenOf(raw: string): string {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    const u = new URL(s);
    const q = u.searchParams.get("t") ?? u.searchParams.get("token");
    if (q) return q;
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "";
  } catch {
    return "";
  }
}

/** ลิงก์เปิดแชท OA พร้อมรหัสผูกบัตร (issueLinkCode QUEUE_TICKET) · สาขาไม่ตั้ง LINE / OA ไม่มี basicId / ล้ม ⇒ null */
async function lineLinkOf(ctx: Ctx, ticketId: string, now: Date): Promise<string | null> {
  try {
    const s = await settingsOf(ctx, ["messaging.lineConnectionId"]);
    const conn = s["messaging.lineConnectionId"];
    if (typeof conn !== "string" || !conn) return null;
    const endOfDay = localToUtc(addDaysStr(bkkDayOf(now.getTime()), 1), 0).getTime();
    const ttlMin = Math.min(43_200, Math.max(1, Math.ceil((endOfDay - now.getTime()) / MIN_MS)));
    const { issueLinkCode } = await import("@/lib/modules/chat");
    const r = await issueLinkCode({ tenantId: ctx.tenantId }, { purpose: "QUEUE_TICKET", refId: ticketId, ttlMin, connectionId: conn });
    return r.ok ? r.deepLink : null;
  } catch (e) {
    console.error("[booking.public] ออกรหัสผูก LINE ไม่สำเร็จ", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

/** บัตรที่เพิ่งออก/เช็กอิน → ข้อมูลบนจอตู้ (แผนสดหลัง replan · ไม่มีชื่อ/เบอร์) */
async function kioskTicketOf(
  ctx: Ctx, appointmentId: string, ticketId: string, ticketNumber: string, now: Date, showStaff: boolean, waitMin?: number | null,
): Promise<KioskTicket & { bookedStartMs: number | null }> {
  const db = tenantDb(ctx);
  const [line, tk, appt] = await Promise.all([
    lineOf(ctx, now),
    db.queueTicket.findFirst({ where: { id: ticketId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { businessDate: true } }),
    db.appointment.findFirst({
      where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId },
      select: { kind: true, startAt: true, staffId: true, plannedStaffId: true, plannedStartAt: true, service: { select: { name: true } } },
    }),
  ]);
  const tokUrl = ticketToken({ tenantId: ctx.tenantId, unitId: ctx.unitId, businessDate: tk?.businessDate ?? bkkDayOf(now.getTime()), number: ticketNumber });
  const idx = line ? line.waiting.findIndex((j) => j.appointmentId === appointmentId) : -1;
  const job = line && idx >= 0 ? line.waiting[idx] : line?.inService.find((j) => j.appointmentId === appointmentId) ?? null;
  const st = line ? seatsOf(line) : null;
  const staffId = job?.staffId ?? appt?.plannedStaffId ?? appt?.staffId ?? null;
  const planned = job?.plannedStartMs ?? appt?.plannedStartAt?.getTime() ?? null;
  return {
    ticketNumber,
    serviceName: job?.serviceName ?? appt?.service.name ?? "",
    staffName: st ? st.name(staffId, showStaff) : null,
    seat: st ? st.seat(staffId) : null,
    plannedStartMs: planned,
    waitMin: waitMin ?? job?.waitMin ?? (planned !== null ? Math.max(0, Math.round((planned - now.getTime()) / MIN_MS)) : null),
    aheadCount: Math.max(0, idx),
    ticketUrl: tokUrl ? `/bq/t/${tokUrl}` : "", // ไม่มี SESSION_SECRET ⇒ "" = ไม่มีหน้าบัตร (ตู้ไม่แสดง QR)
    lineLink: await lineLinkOf(ctx, ticketId, now),
    bookedStartMs: appt && appt.kind !== "WALKIN" ? appt.startAt.getTime() : null,
  };
}

export async function kioskCheckIn(
  token: unknown,
  by: { phone: string } | { qr: string },
  opts?: Opts,
): Promise<{ ok: true; ticket: KioskCheckedIn } | { ok: false; code: KioskFail | "NOT_TODAY" | "TOO_LATE" | "NOT_CONFIRMED" | "BAD_STATE" | "AMBIGUOUS"; reason: string }> {
  const now = nowOf(opts);
  const dev = await deviceByToken(token, "KIOSK");
  if (!dev) return nf();
  const rl = await checkRateLimitDb(`bq:kiosk:checkin:${dev.deviceId}`, KIOSK_RATE.checkIn, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  const ctx: Ctx = { tenantId: dev.tenantId, unitId: dev.unitId };
  let r: Awaited<ReturnType<typeof checkIn>>;
  if (by && typeof by === "object" && "qr" in by && typeof by.qr === "string" && by.qr.trim()) {
    const t = qrTokenOf(by.qr);
    if (!t) return nf();
    r = await checkIn(ctx, { token: t }, { via: "QR", now });
  } else if (by && typeof by === "object" && "phone" in by && typeof by.phone === "string") {
    r = await checkIn(ctx, { phone: by.phone }, { via: "PHONE", now });
  } else return fail("BAD_INPUT", R.BAD_INPUT);
  if (!r.ok) {
    // X7: ไม่บอกว่าเบอร์/QR มีนัดไหม · AMBIGUOUS ไม่ส่ง candidates (ไม่บอกเวลานัด)
    if (r.code === "NOT_FOUND" || r.code === "NOT_SINGLE_LINE") return nf();
    if (r.code === "AMBIGUOUS") return fail("AMBIGUOUS", R.AMBIGUOUS);
    return fail(r.code, r.reason);
  }
  const s = await settingsOf(ctx, ["booking.display.tvShow"], dev.deviceId);
  const t = await kioskTicketOf(ctx, r.appointmentId, r.ticketId, r.ticketNumber, now, showStaffOf(s["booking.display.tvShow"]));
  return { ok: true, ticket: { ...t, bookedStartMs: t.bookedStartMs ?? now.getTime() } };
}

export async function kioskWalkIn(
  token: unknown,
  i: { serviceId: string; staffId: string | null; phone?: string },
  opts?: Opts,
): Promise<{ ok: true; ticket: KioskTicket } | { ok: false; code: KioskFail | "PHONE_REQUIRED" | "WALKIN_DISABLED" | "WALKIN_CLOSED"; reason: string }> {
  const now = nowOf(opts);
  const dev = await deviceByToken(token, "KIOSK");
  if (!dev) return nf();
  const rl = await checkRateLimitDb(`bq:kiosk:walkin:${dev.deviceId}`, KIOSK_RATE.walkIn, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  const ctx: Ctx = { tenantId: dev.tenantId, unitId: dev.unitId };
  if (!i || typeof i !== "object" || typeof i.serviceId !== "string" || !i.serviceId) return fail("BAD_INPUT", R.BAD_INPUT);
  const p = kioskPolicyOf(await settingsOf(ctx, KIOSK_KEYS, dev.deviceId));
  const phone = typeof i.phone === "string" ? i.phone.trim() : "";
  if (p.phone === "REQUIRED" && !phone) return fail("PHONE_REQUIRED", R.PHONE_REQUIRED);
  const svcs = await servicesOf(ctx);
  const svc = svcs.find((s) => s.id === i.serviceId);
  if (!svc) return fail("NOT_FOUND", R.SVC_NOT_FOUND);
  const onScreen = kioskServicesFor(svcs, p).find((s) => s.id === svc.id);
  if (!onScreen || !onScreen.walkIn) return fail("WALKIN_DISABLED", R.WALKIN_DISABLED);
  const staffId = p.pickStaff && typeof i.staffId === "string" && i.staffId ? i.staffId : null;
  const r = await createWalkIn(ctx, { serviceId: svc.id, staffId, channel: "KIOSK", ...(phone ? { customerPhone: phone } : {}) }, { now, deviceId: dev.deviceId });
  if (!r.ok) {
    if (r.code === "NOT_SINGLE_LINE") return nf();
    return fail(r.code, r.reason);
  }
  const t = await kioskTicketOf(ctx, r.appointmentId, r.ticketId, r.ticketNumber, now, p.showStaff, r.waitMin);
  const { bookedStartMs: _b, ...ticket } = t;
  void _b;
  return { ok: true, ticket };
}

// ═════════════════════════ หน้าบัตรลูกค้า (§3.4) ═════════════════════════

const secretOf = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return typeof s === "string" && s.length >= 32 ? s : null;
};
const sigOf = (secret: string, p: string) => createHmac("sha256", `booking-ticket:v1:${secret}`).update(p).digest("base64url");
type TicketKey = { tenantId: string; unitId: string; businessDate: string; number: string };

/** token หน้าบัตร = base64url("v1|tenant|unit|date|number") + "." + HMAC — กำหนดแน่นอน ไม่เก็บในฐาน · ไม่มี SESSION_SECRET ⇒ "" */
export function ticketToken(t: TicketKey): string {
  const secret = secretOf();
  if (!secret) return "";
  const p = Buffer.from(`v1|${t.tenantId}|${t.unitId}|${t.businessDate}|${t.number}`, "utf8").toString("base64url");
  return `${p}.${sigOf(secret, p)}`;
}

/** ตรวจลายเซ็น (timing-safe) + รูป canonical — ไม่แตะฐาน */
function parseTicketToken(token: unknown): TicketKey | null {
  const secret = secretOf();
  if (!secret || typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [p, s] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(p) || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const want = Buffer.from(sigOf(secret, p));
  const got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const raw = Buffer.from(p, "base64url");
  if (raw.toString("base64url") !== p) return null;
  const f = raw.toString("utf8").split("|");
  if (f.length !== 5 || f[0] !== "v1" || f.slice(1).some((x) => !x)) return null;
  const [, tenantId, unitId, businessDate, number] = f;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return null;
  return { tenantId, unitId, businessDate, number };
}

/** อายุ: วันของบัตร = วันไทยของ now หรือเมื่อวาน */
const fresh = (k: TicketKey, now: Date) => {
  const today = bkkDayOf(now.getTime());
  return k.businessDate === today || k.businessDate === addDaysStr(today, -1);
};

type TicketRow = { id: string; status: string; number: string; refId: string; businessDate: string; createdAt: Date };
/** บัตรจริงของ key (refType APPOINTMENT · หน่วยแถวเดียว) */
async function ticketOfKey(k: TicketKey): Promise<TicketRow | null> {
  const ctx: Ctx = { tenantId: k.tenantId, unitId: k.unitId };
  const t = await tenantDb(ctx).queueTicket.findFirst({
    where: { tenantId: k.tenantId, unitId: k.unitId, businessDate: k.businessDate, number: k.number, refType: "APPOINTMENT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, number: true, refId: true, businessDate: true, createdAt: true },
  });
  if (!t || !t.refId) return null;
  if ((await lineSettingsOf(k.tenantId, k.unitId)) === null) return null;
  return { ...t, status: String(t.status), refId: t.refId };
}

export async function ticketTokenFor(ctx: { tenantId: string; unitId: string }, ticketId: string): Promise<string | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.unitId !== "string" || !ctx.tenantId || !ctx.unitId || typeof ticketId !== "string" || !ticketId) return null;
  const t = await tenantDb(ctx).queueTicket.findFirst({
    where: { id: ticketId, tenantId: ctx.tenantId, unitId: ctx.unitId, refType: "APPOINTMENT" },
    select: { businessDate: true, number: true },
  });
  if (!t) return null;
  return ticketToken({ tenantId: ctx.tenantId, unitId: ctx.unitId, businessDate: t.businessDate, number: t.number }) || null;
}

type PeerReader = Pick<Prisma.TransactionClient, "queueTicket" | "appointment">;
type Peer = { id: string; checkedInAt: Date };
const keyLt = (a: { ms: number; id: string }, b: { ms: number; id: string }) => a.ms < b.ms || (a.ms === b.ms && a.id < b.id);
/** walk-in QUEUED ของวันบัตร ที่บัตร WAITING/CALLED (ไม่รวมฉัน) เรียงลำดับออกบัตร (checkedInAt, id) */
async function walkInPeers(db: PeerReader, ctx: Ctx, businessDate: string, meId: string): Promise<Peer[]> {
  const tks = await db.queueTicket.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, businessDate, refType: "APPOINTMENT", status: { in: ["WAITING", "CALLED"] } },
    select: { refId: true },
  });
  const ids = tks.map((t) => t.refId).filter((x): x is string => !!x && x !== meId);
  if (!ids.length) return [];
  const rows = await db.appointment.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: ids }, kind: "WALKIN", status: "QUEUED", checkedInAt: { not: null } },
    select: { id: true, checkedInAt: true },
  });
  return rows
    .filter((r): r is Peer => !!r.checkedInAt)
    .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime() || (a.id < b.id ? -1 : 1));
}
/** peers ที่อยู่หลังฉันในลำดับออกบัตร */
async function walkInsAfter(db: PeerReader, ctx: Ctx, businessDate: string, me: { id: string; checkedInAt: Date | null }): Promise<Peer[]> {
  if (!me.checkedInAt) return [];
  const mine = { ms: me.checkedInAt.getTime(), id: me.id };
  return (await walkInPeers(db, ctx, businessDate, me.id)).filter((r) => keyLt(mine, { ms: r.checkedInAt.getTime(), id: r.id }));
}

const ACTIVE_TICKET = new Set(["WAITING", "CALLED"]);
const TICKET_STATUSES = new Set(["WAITING", "CALLED", "SERVING", "DONE", "SKIPPED", "CANCELLED", "NO_SHOW"]);

export async function loadTicketView(token: unknown, opts?: Opts): Promise<TicketView | null> {
  const now = nowOf(opts);
  const k = parseTicketToken(token);
  if (!k || !fresh(k, now)) return null;
  const tk = await ticketOfKey(k);
  if (!tk || !TICKET_STATUSES.has(tk.status)) return null;
  const ctx: Ctx = { tenantId: k.tenantId, unitId: k.unitId };
  const db = tenantDb(ctx);
  const appt = await db.appointment.findFirst({
    where: { id: tk.refId, tenantId: ctx.tenantId, unitId: ctx.unitId },
    select: { id: true, kind: true, status: true, staffId: true, plannedStaffId: true, startAt: true, checkedInAt: true, service: { select: { name: true } } },
  });
  if (!appt) return null;
  const [line, s, unitName] = await Promise.all([lineOf(ctx, now), settingsOf(ctx, ["booking.display.tvShow"]), unitNameOf(ctx)]);
  const show = showStaffOf(s["booking.display.tvShow"]);
  const st = line ? seatsOf(line) : null;
  const walkIn = appt.kind === "WALKIN";
  const active = ACTIVE_TICKET.has(tk.status);
  const idx = line && active ? line.waiting.findIndex((j) => j.appointmentId === appt.id) : -1;
  const job = line && idx >= 0 ? line.waiting[idx] : null;
  const staffId = job?.staffId ?? appt.plannedStaffId ?? appt.staffId;

  let ahead: TicketAhead[] = [];
  let aheadCount: number | null = null;
  let plannedStartMs: number | null = null;
  if (line && job) {
    plannedStartMs = job.plannedStartMs;
    const nowJob = line.inService.find((j) => j.staffId === staffId);
    const before = line.waiting.slice(0, idx).map((j): TicketAhead => ({
      kind: j.ticketNumber ? "WAIT" : "BOOKED", ticketNumber: j.ticketNumber ?? null, startMs: j.plannedStartMs, seat: st!.seat(j.staffId),
    }));
    ahead = [
      ...(nowJob ? [{ kind: "NOW" as const, ticketNumber: nowJob.ticketNumber, startMs: null, seat: st!.seat(nowJob.staffId) }] : []),
      ...before,
      { kind: "ME", ticketNumber: tk.number, startMs: plannedStartMs, seat: st!.seat(staffId) },
    ];
    aheadCount = before.length;
  }
  const queuedWalkIn = walkIn && String(appt.status) === "QUEUED";
  const canCancel = queuedWalkIn && active;
  const canDefer = queuedWalkIn && tk.status === "WAITING" && (await walkInsAfter(db as unknown as PeerReader, ctx, tk.businessDate, appt)).length > 0;

  return {
    unitName,
    ticketNumber: tk.number,
    status: tk.status as TicketView["status"],
    kind: walkIn ? "WALKIN" : "BOOKED",
    serviceName: job?.serviceName ?? appt.service.name,
    staffName: st ? st.name(staffId, show) : null,
    seat: st ? st.seat(staffId) : null,
    issuedAtMs: (appt.checkedInAt ?? tk.createdAt).getTime(),
    bookedStartMs: walkIn ? null : appt.startAt.getTime(),
    plannedStartMs,
    returnByMs: plannedStartMs !== null ? plannedStartMs - 5 * MIN_MS : null,
    aheadCount,
    ahead,
    canDefer,
    canCancel,
  };
}

class Abort extends Error {
  constructor(readonly res: { ok: false; code: TicketOpFail; reason: string }) {
    super(res.code);
  }
}

/** ปุ่มหน้าบัตร: ลายเซ็น → rate limit (ต่อบัตร) → อายุ/บัตรจริง → ใต้ lockUnitTx + แถวนัด → replan หลัง commit */
async function ticketOp(
  token: unknown,
  opts: Opts | undefined,
  step: (tx: Prisma.TransactionClient, ctx: Ctx, tk: TicketRow, now: Date) => Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }>,
): Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }> {
  const now = nowOf(opts);
  const k = parseTicketToken(token);
  if (!k) return nf();
  const rl = await checkRateLimitDb(`bq:ticket:${k.tenantId}:${k.unitId}:${k.businessDate}:${k.number}`, TICKET_RATE, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  if (!fresh(k, now)) return nf();
  const tk = await ticketOfKey(k);
  if (!tk) return nf();
  const ctx: Ctx = { tenantId: k.tenantId, unitId: k.unitId };
  let res: { ok: true } | { ok: false; code: TicketOpFail; reason: string } | null;
  try {
    res = await runLineTx((tx) => step(tx, ctx, tk, now));
  } catch (e) {
    if (e instanceof Abort) return e.res;
    throw e;
  }
  if (!res) return fail("BUSY", R.BUSY);
  if (res.ok) await replan(ctx, now);
  return res;
}

/** ขอเลื่อนไปคิวหลัง = ถอย 1 คิว (สลับกับ walk-in ถัดไป): checkedInAt = X.checkedInAt + 1 ms + QueueTicketEvent DEFERRED (CUSTOMER) */
export async function deferTicket(token: unknown, opts?: Opts): Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }> {
  return ticketOp(token, opts, async (tx, ctx, tk) => {
    await lockUnitTx(tx, ctx);
    const a = await lockAppt(tx, ctx, tk.refId);
    if (!a) return nf();
    const t = await tx.queueTicket.findFirst({ where: { id: tk.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { status: true } });
    if (a.kind !== "WALKIN" || a.status !== "QUEUED" || a.queueTicketId !== tk.id || String(t?.status) !== "WAITING") return fail("BAD_STATE", R.DEFER_BAD_STATE);
    const after = await walkInsAfter(tx, ctx, tk.businessDate, a);
    const x = after[0];
    if (!x) return fail("BAD_STATE", R.DEFER_BAD_STATE);
    // ถอยพอดี 1 คิว: ฉัน = X + 1 ms · คนถัดจาก X ที่ลำดับ (checkedInAt, id) ไม่อยู่หลังฉันแล้ว (เวลาเท่ากัน/ชิดกัน) ⇒ ดันทีละ 1 ms ต่อกัน (CAS ทุกแถว)
    const mineMs = x.checkedInAt.getTime() + 1;
    const w = await tx.appointment.updateMany({
      where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "QUEUED", checkedInAt: a.checkedInAt },
      data: { checkedInAt: new Date(mineMs) },
    });
    if (w.count !== 1) return fail("LOST_RACE", R.LOST_RACE);
    let floor = { ms: mineMs, id: a.id };
    for (const y of after.slice(1)) {
      const yk = { ms: y.checkedInAt.getTime(), id: y.id };
      if (keyLt(floor, yk)) break;
      const nk = { ms: floor.ms + 1, id: y.id };
      const wy = await tx.appointment.updateMany({
        where: { id: y.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "QUEUED", checkedInAt: y.checkedInAt },
        data: { checkedInAt: new Date(nk.ms) },
      });
      if (wy.count !== 1) throw new Abort(fail("LOST_RACE", R.LOST_RACE));
      floor = nk;
    }
    await tx.queueTicketEvent.create({
      data: { tenantId: ctx.tenantId, unitId: ctx.unitId, ticketId: tk.id, action: "DEFERRED", actorType: "CUSTOMER", actorId: null, detail: { behindAppointmentId: x.id } },
    });
    return { ok: true };
  });
}

/** ยกเลิกบัตร (ลูกค้า · เฉพาะ walk-in ที่รอ): งาน + บัตร CANCELLED (CUSTOMER) + booking.cancelled ใน tx เดียว */
export async function cancelTicket(token: unknown, opts?: Opts): Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }> {
  return ticketOp(token, opts, async (tx, ctx, tk, now) => {
    await lockUnitTx(tx, ctx);
    const a = await lockAppt(tx, ctx, tk.refId);
    if (!a) return nf();
    const t = await tx.queueTicket.findFirst({ where: { id: tk.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { status: true } });
    if (a.kind !== "WALKIN" || a.status !== "QUEUED" || a.queueTicketId !== tk.id || !ACTIVE_TICKET.has(String(t?.status))) return fail("BAD_STATE", R.CANCEL_BAD_STATE);
    if (!(await casAppt(tx, ctx, a, { status: "CANCELLED", cancelReason: "CUSTOMER", plannedStartAt: null, plannedStaffId: null }))) return fail("LOST_RACE", R.LOST_RACE);
    const m = await queue.moveTicketTx(tx, ctx, tk.id, "CANCELLED", { now, actorType: "CUSTOMER", cancelReason: "CUSTOMER" });
    if (!m.ok) throw new Abort(fail("LOST_RACE", R.LOST_RACE)); // ถอยทั้ง tx (งานกลับ QUEUED)
    await emitOutbox(tx, {
      tenantId: ctx.tenantId, unitId: ctx.unitId, type: "booking.cancelled", idempotencyKey: `booking.cancelled#${a.id}`,
      payload: {
        appointmentId: a.id, unitId: a.unitId, staffId: a.staffId, kind: a.kind, channel: a.channel, serviceId: a.serviceId,
        ticketId: tk.id, reason: "CUSTOMER", from: a.status,
      },
    });
    return { ok: true };
  });
}
