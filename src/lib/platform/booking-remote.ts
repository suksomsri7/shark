// ─────────────────────────────────────────────────────────────
// platform/booking-remote.ts — รับบัตรคิวจากมือถือโดยไม่ต้องมาร้าน (ภาคผนวก ก #42) · SVC B.9 · ใบสั่ง §3.3
//   loadRemoteTicketForm (หน้า /s/<ร้าน>/<สาขา>/remote) · takeRemoteTicket (server action สาธารณะ)
//
// 🔴 ทางสาธารณะ (ไม่มี session): rate limit ต่อผู้ใช้ **ก่อนแตะฐาน** (checkRateLimitDb ข้ามเครื่องได้) · หน่วยใช้ไม่ได้ทุกกรณี ⇒ ผลเดียวกันทุกไบต์ (X7)
// 🔴 เบอร์นี้มีบัตร walk-in ของวันนี้ที่ยังรออยู่ ⇒ ALREADY **ไม่คืนลิงก์บัตร** (กันพิมพ์เบอร์คนอื่นแล้วได้ลิงก์ยกเลิก/เลื่อนบัตรเขา)
// 🔴 ตรวจเวลารอ (maxWaitMin) ก่อนสร้างแถว · สร้างผ่าน createWalkIn ของ B.4 (channel REMOTE) · ลิงก์บัตร = token ของ B.6
// 🔴 X8: ผลคืน/ข้อผิดพลาดไม่มีเบอร์/ชื่อ · ไม่ log เบอร์ · นโยบายจากทะเบียนค่าตั้ง (booking.queue.remoteTicket · singleLine · walkInPickStaff)
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { bkkDayStart } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { bookingPhoneKey, createWalkIn, quoteWalkInWait, ticketTokenFor } from "@/lib/modules/booking";
import { issueLinkCode } from "@/lib/modules/chat";
import { bookingEndOfDay, bookingOaLink } from "@/lib/platform/booking-notify";

export type RemoteTicketForm = {
  unitName: string;
  services: { id: string; name: string; durationMin: number }[];
  staff: { id: string; name: string }[] | null;
  waitMin: number | null;
  maxWaitMin: number | null;
};
/** ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน · ใบสั่ง §6 ข้อ 9) */
export const REMOTE_RATE = { perClient: { limit: 5, windowMs: 600_000 } } as const satisfies { perClient: { limit: 5; windowMs: 600000 } };
/** เปิดหน้า /remote (GET) ต่อ IP — ค่าคงที่ความปลอดภัย (N6) */
export const REMOTE_VIEW_RATE = { limit: 60, windowMs: 600_000 } as const;
/** ช่วงนับเพดานบัตรทางมือถือต่อสาขา (booking.queue.remoteTicket.maxPerHour) */
const CAP_WINDOW_MS = 60 * 60_000;
export type RemoteFail = "NOT_FOUND" | "BAD_INPUT" | "RATE_LIMITED" | "TOO_LONG" | "ALREADY" | "WALKIN_DISABLED" | "WALKIN_CLOSED" | "BUSY";

const R = {
  /** X7: ข้อความเดียวทุกกรณีที่ร้าน/สาขา/การเปิดรับใช้ไม่ได้ */
  NF: "ไม่พบหน้ารับบัตรคิวนี้ หรือร้านยังไม่เปิดรับบัตรคิวทางมือถือ",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  BAD_INPUT: "กรุณาเลือกบริการและกรอกเบอร์โทรให้ถูกต้อง",
  ALREADY: "เบอร์นี้มีบัตรคิววันนี้ที่ยังรออยู่แล้ว — ดูบัตรเดิมจากลิงก์/LINE ที่ได้รับ หรือติดต่อร้าน",
  TOO_LONG: "ขณะนี้คิวรอนานเกินกว่าที่ร้านรับบัตรทางมือถือ — กรุณาลองใหม่ภายหลัง หรือมาที่ร้าน",
  CAP: "ช่วงนี้ร้านรับบัตรคิวทางมือถือครบจำนวนแล้ว — กรุณาลองใหม่ภายหลัง หรือมาที่ร้าน",
} as const;

const MIN_PHONE_DIGITS = 9;
const ACTIVE_WALKIN = ["QUEUED", "ARRIVED", "IN_SERVICE"] as const;
const MIN_MS = 60_000;

type Opts = { now?: Date };
type Ctx = { tenantId: string; unitId: string };
const validNow = (o?: Opts): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const nf = () => ({ ok: false as const, code: "NOT_FOUND" as const, reason: R.NF });
const fail = (code: RemoteFail, reason: string) => ({ ok: false as const, code, reason });
const SLUG_RE = /^[A-Za-z0-9_-]{1,100}$/;

type Unit = Ctx & { name: string; maxWaitMin: number | null; maxPerHour: number | null; pickStaff: boolean };

/** หน่วยที่รับบัตรมือถือได้: slug ร้าน+สาขาตรง · BOOKING · แถวเดียว · remoteTicket.enabled — ไม่ครบ ⇒ null */
async function remoteUnitOf(tenantSlug: string, unitSlug: string): Promise<Unit | null> {
  if (typeof tenantSlug !== "string" || typeof unitSlug !== "string" || !SLUG_RE.test(tenantSlug) || !SLUG_RE.test(unitSlug)) return null;
  const t = await prisma.tenant.findFirst({ where: { slug: tenantSlug }, select: { id: true } });
  if (!t) return null;
  const u = await prisma.businessUnit.findFirst({ where: { tenantId: t.id, slug: unitSlug, type: "BOOKING" }, select: { id: true, name: true } });
  if (!u) return null;
  const s = await resolveSettings({ tenantId: t.id }, ["booking.queue.singleLine", "booking.queue.remoteTicket", "booking.queue.walkInPickStaff"], { unitId: u.id });
  if (s["booking.queue.singleLine"]?.value !== true) return null;
  const rt = s["booking.queue.remoteTicket"]?.value as { enabled?: unknown; maxWaitMin?: unknown; maxPerHour?: unknown } | null | undefined;
  if (!rt || typeof rt !== "object" || rt.enabled !== true) return null;
  const max = typeof rt.maxWaitMin === "number" && Number.isFinite(rt.maxWaitMin) ? rt.maxWaitMin : null;
  const cap = typeof rt.maxPerHour === "number" && Number.isInteger(rt.maxPerHour) && rt.maxPerHour >= 1 ? rt.maxPerHour : null;
  return { tenantId: t.id, unitId: u.id, name: u.name, maxWaitMin: max, maxPerHour: cap, pickStaff: s["booking.queue.walkInPickStaff"]?.value !== false };
}

/** บริการ active ของสาขาที่รับ walk-in (booking.service.walkIn — กติกาเดียวกับ createWalkIn) เรียง sortOrder, createdAt, id */
async function walkInServicesOf(ctx: Ctx): Promise<RemoteTicketForm["services"]> {
  const svcs = await prisma.bookingService.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, durationMin: true },
  });
  if (!svcs.length) return [];
  const res = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.service.walkIn"], svcs.map((s) => ({ unitId: ctx.unitId, serviceId: s.id })));
  return svcs.filter((s, i) => {
    const v = res[i]?.["booking.service.walkIn"]?.value as { enabled?: unknown; closeAtOrAboveMin?: unknown } | null | undefined;
    if (!v || typeof v !== "object") return true;
    return v.enabled !== false && !(typeof v.closeAtOrAboveMin === "number" && s.durationMin >= v.closeAtOrAboveMin);
  });
}

/** หน้า /remote (GET): นับต่อ IP ก่อนแตะฐานงาน · เกิน ⇒ false (หน้าแสดงให้ลองใหม่ภายหลัง) */
export async function checkRemoteViewRate(clientKey: string, opts?: Opts): Promise<boolean> {
  const client = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim().slice(0, 100) : "unknown";
  const rl = await checkRateLimitDb(`bq:remote-view:${client}`, REMOTE_VIEW_RATE, validNow(opts).getTime());
  return rl.ok;
}

export async function loadRemoteTicketForm(tenantSlug: string, unitSlug: string, opts?: Opts): Promise<RemoteTicketForm | null> {
  const now = validNow(opts);
  const u = await remoteUnitOf(tenantSlug, unitSlug);
  if (!u) return null;
  const ctx: Ctx = { tenantId: u.tenantId, unitId: u.unitId };
  const [services, staff] = await Promise.all([
    walkInServicesOf(ctx),
    u.pickStaff
      ? prisma.bookingStaff.findMany({
          where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const q = services[0] ? await quoteWalkInWait(ctx, { serviceId: services[0].id, staffId: null }, { now }) : null;
  return { unitName: u.name, services, staff, waitMin: q && !q.closed ? q.waitMin : null, maxWaitMin: u.maxWaitMin };
}

/** เบอร์นี้มีงาน WALKIN ของวันไทยนี้ในหน่วยที่ยัง active ไหม (เทียบด้วย bookingPhoneKey — ไม่ log เบอร์) */
async function hasActiveWalkIn(ctx: Ctx, phoneKey: string, now: Date): Promise<boolean> {
  const d0 = bkkDayStart(now);
  const d1 = bookingEndOfDay(now);
  const rows = await prisma.appointment.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, kind: "WALKIN", status: { in: [...ACTIVE_WALKIN] }, startAt: { gte: d0, lt: d1 }, customerPhone: { not: "" } },
    select: { customerPhone: true },
    take: 500,
  });
  return rows.some((r) => bookingPhoneKey(r.customerPhone) === phoneKey);
}

/** ลิงก์เปิดแชท OA พร้อมรหัสผูกบัตร (QUEUE_TICKET · ถึงสิ้นวันไทย — แบบ B.6) · ไม่มี OA/basicId/ล้ม ⇒ null */
async function lineLinkOf(ctx: Ctx, ticketId: string, now: Date): Promise<string | null> {
  try {
    const s = await resolveSettings({ tenantId: ctx.tenantId }, ["messaging.lineConnectionId"], { unitId: ctx.unitId });
    const conn = s["messaging.lineConnectionId"]?.value;
    if (typeof conn !== "string" || !conn) return null;
    const ttlMin = Math.min(43_200, Math.max(1, Math.ceil((bookingEndOfDay(now).getTime() - now.getTime()) / MIN_MS)));
    const r = await issueLinkCode({ tenantId: ctx.tenantId }, { purpose: "QUEUE_TICKET", refId: ticketId, ttlMin, connectionId: conn });
    return r.ok ? bookingOaLink(r.deepLink) : null;
  } catch (e) {
    console.error("[booking.remote] ออกรหัสผูก LINE ไม่สำเร็จ", e instanceof Error ? e.name : "error");
    return null;
  }
}

export async function takeRemoteTicket(
  tenantSlug: string,
  unitSlug: string,
  i: { serviceId: string; staffId: string | null; phone: string; clientKey: string },
  opts?: Opts,
): Promise<{ ok: true; ticketNumber: string; waitMin: number | null; ticketUrl: string; lineLink: string | null } | { ok: false; code: RemoteFail; reason: string }> {
  const now = validNow(opts);
  // 1. rate limit ก่อนแตะฐานงาน
  const client = typeof i?.clientKey === "string" && i.clientKey.trim() ? i.clientKey.trim().slice(0, 100) : "unknown";
  const rl = await checkRateLimitDb(`bq:remote:${String(tenantSlug).slice(0, 100)}/${String(unitSlug).slice(0, 100)}:${client}`, REMOTE_RATE.perClient, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  // 2. หน่วย (X7)
  const u = await remoteUnitOf(tenantSlug, unitSlug);
  if (!u) return nf();
  const ctx: Ctx = { tenantId: u.tenantId, unitId: u.unitId };
  // 3. เบอร์ + บริการ
  const phone = typeof i?.phone === "string" ? i.phone.trim().slice(0, 40) : "";
  const key = bookingPhoneKey(phone);
  if (!phone || key.length < MIN_PHONE_DIGITS) return fail("BAD_INPUT", R.BAD_INPUT);
  const serviceId = typeof i?.serviceId === "string" ? i.serviceId.trim() : "";
  if (!serviceId || serviceId.length > 100) return fail("BAD_INPUT", R.BAD_INPUT);
  const staffId = u.pickStaff && typeof i?.staffId === "string" && i.staffId.trim() ? i.staffId.trim().slice(0, 100) : null;
  // 4. เบอร์ซ้ำวันเดียวกัน ⇒ ALREADY (ไม่คืนลิงก์)
  if (await hasActiveWalkIn(ctx, key, now)) return fail("ALREADY", R.ALREADY);
  // 5. เวลารอ ณ now (อ่านอย่างเดียว) เกินเพดานของร้าน ⇒ ไม่สร้างแถว
  if (u.maxWaitMin !== null) {
    const q = await quoteWalkInWait(ctx, { serviceId, staffId }, { now });
    if (q && !q.closed && q.waitMin !== null && q.waitMin > u.maxWaitMin) return fail("TOO_LONG", R.TOO_LONG);
  }
  // 6. เพดานบัตรทางมือถือต่อสาขาต่อชั่วโมง (ค่าตั้ง · ไม่ตั้ง = ไม่จำกัด)
  if (u.maxPerHour !== null) {
    const n = await prisma.appointment.count({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, kind: "WALKIN", channel: "REMOTE", checkedInAt: { gt: new Date(now.getTime() - CAP_WINDOW_MS), lte: now } },
    });
    if (n >= u.maxPerHour) return fail("WALKIN_CLOSED", R.CAP);
  }
  // 7. สร้าง walk-in (B.4) — ไม่ผูก Party จากเบอร์ (เบอร์ไม่ได้ยืนยัน · N1) · ตรวจเบอร์ซ้ำใต้ล็อกสาขาใน tx เดียวกับการสร้าง (N7)
  const r = await createWalkIn(ctx, { serviceId, staffId, channel: "REMOTE", customerPhone: phone }, { now, skipPartyLink: true, rejectSamePhoneToday: true });
  if (!r.ok) {
    if (r.code === "NOT_SINGLE_LINE") return nf();
    if (r.code === "ALREADY") return fail("ALREADY", R.ALREADY);
    return fail(r.code, r.reason);
  }
  const token = await ticketTokenFor(ctx, r.ticketId);
  return {
    ok: true,
    ticketNumber: r.ticketNumber,
    waitMin: r.waitMin,
    ticketUrl: token ? `/bq/t/${token}` : "", // ไม่มี SESSION_SECRET ⇒ "" = ไม่มีหน้าบัตร (แบบ B.6)
    lineLink: await lineLinkOf(ctx, r.ticketId, now),
  };
}
