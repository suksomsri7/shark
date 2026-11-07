// ─────────────────────────────────────────────────────────────
// platform/hotel-web.ts — หน้าจองโรงแรมออนไลน์ V2 (สาธารณะ · ไม่ต้องล็อกอิน) · SVC H.8 · ใบสั่ง svc-brief-h.8.md §0–§3 + §9 + §10
//
// 🔴 เส้นเดียวกับหน้าเคาน์เตอร์: ทุกการจองผ่าน hotel.createBooking(actor null · source WEB · hold ONLINE) — ไฟล์นี้ไม่มีเส้นเขียนการจองเอง
//    ยกเลิกโดยแขก = hotel.cancelBookingAsGuest (booking.ts) · มัดจำ = สลิปกลาง (payment/slip-verify HOTEL/HOTEL_DEPOSIT) → consumer
//    payment.slip.approved สาขา HOTEL (onHotelSlipApproved ด้านล่าง) → hotel.takeBookingDeposit · QR สถิต = payment/receiver.promptpayQrFor
// 🔴 ลายเซ็น (input, opts) ทุกตัว · input มี tenantSlug + unitSlug เสมอ (X1: token/รหัสของร้านอื่น = ไม่พบ คำตอบเดียวกัน)
//    ล้มทุกแบบ = { ok:false, code, reason } ไม่ throw · เกินเพดาน = RATE_LIMITED (checkRateLimitDb ต่อ IP+หน่วย · นับทุกครั้งที่ยิง)
// 🔴 X7/X8: ถัง rate ใช้ hash ของ IP (ไม่มีอีเมล/เบอร์) · DTO ไม่มีเบอร์ · อีเมล mask · event hotel.web.* payload id + สตางค์ล้วน
//    lookup ผิด (รหัสผิด/อีเมลผิด) = คำตอบเดียวกันทุกไบต์ และวิ่งคิวรีชุดเดียวกัน · ไม่มีค้นด้วยชื่อ
// 🔴 ไม่ import prisma ดิบ — อ่านผ่าน facade @/lib/modules/hotel (storefront.ts) · ยอดเงินคิดฝั่งเซิร์ฟเวอร์เสมอ (ไม่รับยอดจากผู้ใช้)
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { z } from "zod";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { emitOutboxOutsideTx } from "@/lib/core/outbox";
import { resolvePublicUnit } from "@/lib/core/storefront";
import { resolveTenantByHost } from "@/lib/domain/service";
import { FORM_HONEYPOT_FIELD, consumeFormStartToken, issueFormStartToken, readFormStartToken } from "@/lib/modules/forms/spam-guard";
import * as coupon from "@/lib/modules/coupon";
import { systemForUnit } from "@/lib/modules/system/service";
import * as hotel from "@/lib/modules/hotel";
import { promptpayQrFor } from "@/lib/payment/receiver";
import { submitSlip } from "@/lib/payment/slip-verify";
import type { UploadDeps, DeleteDeps } from "@/lib/storage/service";

// ═══════════════ ชนิด ═══════════════
/** ตั๋วผ่านด่าน rate ของสลิป (publicSlipGate) — สร้างได้ในไฟล์นี้เท่านั้น · ใช้ได้ครั้งเดียว (route นับ rate ก่อนอ่าน body · r2 ข้อ 7) */
export type HotelSlipPass = { readonly slipPass: true };
export type HotelWebOpts = { clientKey: string; now?: Date; deps?: { put?: UploadDeps["put"]; del?: DeleteDeps["del"] }; slipPass?: HotelSlipPass };
export type HotelWebFailCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "PAST_DATE"
  | "TOO_FAR"
  | "CLOSED"
  | "REJECTED"
  | "TOO_MANY_ROOMS"
  | "PLAN_NOT_PUBLIC"
  | "AVAILABILITY_CHANGED"
  | "BAD_FILE"
  | "NOT_PAYABLE"
  | "FORBIDDEN"
  | "INVALID_STATUS"
  | "REFUND_CHANGED"
  | "BUSY"
  | "FAILED"
  | "CONTACT_REQUIRED" // SVC H.8 r2 ▸ โหมดมัดจำ/รออนุมัติ ต้องมีอีเมลหรือเบอร์ (ผู้ตรวจ A-6 ก) ◂
  | "TOO_MANY_HOLDS" // SVC H.8 r2 ▸ เพดานห้อง HOLD ต่อ client / ต่อประเภทต่อคืน (ผู้ตรวจ A-6 ข ค) ◂
  | string;
export type HotelWebFail = { ok: false; code: HotelWebFailCode; reason: string; dates?: string[]; refundSatang?: number };
export type WebIntent = { kind: "PROMPTPAY_STATIC"; qrPayload: string; qrSvgDataUrl: string; amountSatang: number; expiresAt: string | null; receiverName: string };
export type WebPlanQuote = {
  id: string;
  code: string;
  name: string;
  includeBreakfast: boolean;
  totalSatang: number;
  nights: { date: string; priceSatang: number }[];
  depositSatang: number;
  depositKind: string;
  cancelSummaryTh: string;
  cancelSummaryEn: string;
  cancelRules: { daysBefore: number; refundBp: number }[];
  refundable: boolean;
};
export type WebRoomType = {
  id: string;
  name: string;
  images: string[];
  amenities: string[];
  bedType: string | null;
  description: string | null;
  capacity: number;
  maxOccupancy: number | null;
  remaining: number;
  lowStock: boolean;
  soldOutDates: string[];
  plans: WebPlanQuote[];
};
export type WebSearchOk = { ok: true; checkIn: string; checkOut: string; nights: number; adults: number; children: number; rooms: number; roomTypes: WebRoomType[] };
export type WebInfoOk = {
  ok: true;
  unitName: string;
  tenantName: string;
  open: boolean;
  paused: boolean;
  badgeTh: string | null;
  badgeEn: string | null;
  descriptionTh: string | null;
  descriptionEn: string | null;
  heroImages: string[];
  checkInTime: string;
  checkOutTime: string;
  maxRooms: number;
  maxAdvanceBookingDays: number;
  selfCancel: boolean;
  today: string;
  formToken: string;
};
export type WebStatusDto = {
  ok: true;
  code: string;
  unitName: string;
  roomTypeName: string;
  rooms: { code: string; roomTypeName: string; status: string }[];
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  holdKind: "DEPOSIT" | "APPROVAL" | null;
  awaitingApproval: boolean;
  holdExpiresAt: string | null;
  expired: boolean;
  state: "HOLD" | "AWAITING_APPROVAL" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "HOLD_EXPIRED" | "NO_SHOW" | "REFUNDED";
  totalSatang: number;
  deposit: { requiredSatang: number; paid: boolean; paidSatang: number; slip: { status: string; at: string } | null };
  payAtHotelSatang: number;
  checkInTime: string;
  checkOutTime: string;
  emailMasked: string | null;
  pay: WebIntent | null;
  refund: { refundSatang: number; forfeitSatang: number; paidSatang: number } | null;
  refundedSatang: number;
  canCancel: boolean;
  /** SVC H.8 r2 (A-14) ยกเลิกได้ที่ไหน: SELF = ปุ่มในหน้านี้ (เว็บ/LINE) · CHANNEL = ช่องทางที่จอง (OTA) · HOTEL = ติดต่อโรงแรม */
  cancelVia: "SELF" | "CHANNEL" | "HOTEL";
  cancelledAt: string | null;
  lineAddFriendUrl: string | null;
  cancelRules: { daysBefore: number; refundBp: number }[];
};

// ═══════════════ ค่าคงที่ ═══════════════
/** เพดานความถี่ต่อ IP+หน่วย (ใบ §0 X7) — ค่าคงที่ความปลอดภัย ไม่ใช่นโยบายร้าน */
export const HOTEL_WEB_RATE = {
  search: { limit: 60, windowMs: 60_000 },
  quote: { limit: 60, windowMs: 60_000 },
  info: { limit: 120, windowMs: 60_000 },
  hold: { limit: 5, windowMs: 600_000 },
  lookup: { limit: 10, windowMs: 600_000 },
  cancel: { limit: 3, windowMs: 3_600_000 },
  slip: { limit: 10, windowMs: 600_000 },
  view: { limit: 190, windowMs: 600_000 }, // หน้าจ่าย/สถานะรีเฟรชทุก 5 วิ ⇒ 120 ครั้ง/10 นาที + เผื่อเปิดหน้า
} as const;
type RateOp = keyof typeof HOTEL_WEB_RATE;
/**
 * SVC H.8 r2 ▸ ด่านกันยึดห้อง (ผู้ตรวจ A-6 · มติผู้คุม) — ใช้กับโหมดที่สร้าง HOLD (DEPOSIT_REQUIRED · MANUAL_APPROVE)
 *   perClient: ห้อง HOLD ที่ยังไม่จ่าย (ยังไม่หมดอายุ) ต่อ client (IPv6 รวม /64) ≤ storefront.maxRooms
 *   perTypeNightBp: ห้อง HOLD เว็บ/LINE ที่ยังไม่จ่ายต่อประเภทต่อคืน ≤ ceil(ห้องขายได้ × 50%) (อย่างน้อย minPerTypeNight)
 *   คืนที่ห้องไม่พออยู่แล้ว ⇒ ไม่ใช้เพดานนี้ (ให้ createBooking ตอบ AVAILABILITY_CHANGED + dates ตามเดิม)
 *   🔴 ตรวจก่อนเข้า tx ของ createBooking (booking.ts ยกเว้นแคบ) ⇒ คำขอที่ยิงพร้อมกันหลุดเพดานได้ไม่เกินเพดาน rate hold (5/10 นาที/IP)
 */
export const HOTEL_WEB_HOLD_CAP = { perTypeNightBp: 5_000, minPerTypeNight: 1 } as const;
/** ตั๋วเริ่มฟอร์มต้องอายุอย่างน้อย (วินาที) — กรอกเร็วกว่านี้ = บอท */
export const HOTEL_WEB_MIN_FORM_SEC = 3;
export const HOTEL_WEB_EVENTS = {
  holdCreated: "hotel.web.hold_created",
  depositPaid: "hotel.web.deposit_paid",
  slipAttached: "hotel.web.slip_attached",
  cancelledByGuest: "hotel.web.cancelled_by_guest",
  lookupFailed: "hotel.web.lookup_failed",
} as const;
const SYSTEM_ACTOR = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: "module:hotel" } as const;
const MAX_WEB_NIGHTS = 30;

const R = {
  notFound: "ไม่พบการจองหรือที่พักนี้ — ตรวจรหัสการจองและอีเมลอีกครั้ง",
  rate: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  input: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  closed: "ที่พักนี้ปิดรับจองออนไลน์ชั่วคราว — การจองเดิมยังดูและยกเลิกได้",
  rejected: "ส่งคำขอไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  tooMany: "จองได้ไม่เกิน {n} ห้องต่อครั้ง",
  planNotPublic: "แผนราคานี้ไม่เปิดจองทางเว็บ — เลือกแผนอื่น",
  past: "วันเข้าพักผ่านไปแล้ว — เลือกวันนี้หรือวันถัดไป",
  tooFar: "จองล่วงหน้าได้ไม่เกิน {n} วัน",
  badFile: "แนบได้เฉพาะรูปสลิป JPG / PNG / WEBP ขนาดไม่เกิน 5 MB",
  notPayable: "การจองนี้ไม่มียอดมัดจำค้างชำระ",
  forbidden: "ที่พักนี้ยังไม่เปิดให้ยกเลิกเองทางเว็บ — ติดต่อที่พักโดยตรง",
  atChannel: "การจองนี้มาจากช่องทางจองอื่น — ยกเลิกหรือแก้ไขที่ช่องทางที่จองไว้",
  atHotel: "การจองนี้ทำกับโรงแรมโดยตรง — ติดต่อโรงแรมเพื่อยกเลิกหรือแก้ไข",
  contact: "กรอกอีเมลหรือเบอร์โทรอย่างน้อย 1 ช่อง เพื่อให้โรงแรมติดต่อกลับได้",
  tooManyHolds: "ตอนนี้มีห้องรอชำระมัดจำอยู่มาก — ชำระการจองที่ค้างอยู่ก่อน หรือลองใหม่ในอีกสักครู่",
  slipPending: "มีสลิปรอตรวจอยู่แล้ว — รอโรงแรมตรวจสักครู่",
  status: "การจองนี้ยกเลิกทางเว็บไม่ได้แล้ว — ติดต่อที่พักโดยตรง",
  refundChanged: "ยอดเงินคืนเปลี่ยนไปแล้ว — ตรวจยอดใหม่ก่อนยืนยัน",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
  failed: "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};
const fail = (code: HotelWebFailCode, reason: string, extra: Partial<HotelWebFail> = {}): HotelWebFail => ({ ok: false, code, reason, ...extra });
/** คำตอบ "ไม่พบ" ตัวเดียวทุกกรณี (X7: token/รหัส/อีเมลผิด · ร้านอื่น · ไม่มี) */
const NF = (): HotelWebFail => ({ ok: false, code: "NOT_FOUND", reason: R.notFound });

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const nowOf = (o: HotelWebOpts | undefined): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const normEmail = (v: unknown): string => str(v, 200).toLowerCase();

// ═══════════════ ตัวช่วยร่วม ═══════════════
/** IP ผู้ใช้จาก headers (ลำดับเดียวกับพอร์ทัลหอ/B.9): x-real-ip → x-vercel-forwarded-for → x-forwarded-for ตัวแรก */
export function hotelWebClientKey(h: Headers): string {
  for (const k of ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]) {
    const v = (h.get(k) ?? "").split(",")[0]?.trim().slice(0, 64) ?? "";
    if (v) return v;
  }
  return "unknown";
}

/**
 * client ของถัง/เพดาน: IPv6 รวมเป็น /64 (เครื่องเดียวสุ่มที่อยู่ท้าย /64 ได้ไม่จำกัด) · อื่น ๆ ตามเดิม (SVC H.8 r2 ผู้ตรวจ A-6 ข)
 */
export function hotelWebClientId(clientKey: unknown): string {
  const k = String(clientKey ?? "unknown").trim().toLowerCase().replace(/^\[|\](:\d+)?$/g, "");
  if (!k.includes(":") || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(k)) return k || "unknown";
  const body = k.split("%")[0] ?? "";
  if (!/^[0-9a-f:]+$/.test(body) || (body.match(/::/g) ?? []).length > 1) return k; // IPv4-mapped (มีจุด) = ที่อยู่เดียว ไม่รวม /64
  const [l, r] = body.includes("::") ? body.split("::") : [body, null];
  const left = l ? l.split(":") : [];
  const right = r ? r.split(":") : [];
  const groups = r === null ? left : [...left, ...Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => "0"), ...right];
  if (groups.length < 4) return k;
  return `${groups.slice(0, 4).map((x) => (x || "0").replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
const clientHash = (opts: HotelWebOpts | undefined) => sha(hotelWebClientId(opts?.clientKey)).slice(0, 32);
const unitHash = (u: { tenantSlug: string; unitSlug: string }) => sha(`${u.tenantSlug}/${u.unitSlug}`).slice(0, 12);

/**
 * ถัง rate ต่อ (การกระทำ, หน่วยที่มีจริง, client) — คีย์มีแต่ hash (ไม่มี IP/อีเมลดิบ)
 * SVC H.8 r2 (ผู้ตรวจ A-12): เรียกหลัง resolve หน่วย — slug ที่ไม่มีจริง/คำขอผิดรูป ⇒ ถังรวมต่อ client ถังเดียว (`none`) ไม่สร้างแถวใหม่ต่อ slug
 * tokenPart (หน้าจ่าย/สถานะ): ถังแยกต่อการจอง (เปิดหลายแท็บ/หลายการจองไม่ติดเพดานรวม) · token ที่ไม่มีจริง ⇒ ถัง `none` ร่วม
 */
async function limited(op: RateOp, unit: { tenantSlug: string; unitSlug: string } | null, opts: HotelWebOpts | undefined, tokenPart?: string | null): Promise<boolean> {
  const tok = tokenPart === undefined ? "" : `:${tokenPart ? sha(tokenPart).slice(0, 16) : "none"}`;
  const key = `hw:${op}:${unit ? unitHash(unit) : "none"}:${clientHash(opts)}${tok}`;
  const v = await checkRateLimitDb(key, HOTEL_WEB_RATE[op]);
  return !v.ok;
}

const formIdOf = (unitId: string) => `hotel-web:${unitId}`;
/** ตั๋วเริ่มฟอร์มจอง (ฝังในฟอร์มเป็น _sd_st) — ผูกหน่วย · ตรวจตอนสร้าง HOLD (อายุ ≥ 3 วิ · ใช้ได้ครั้งเดียว) */
export function holdFormStart(unitId: string, now: Date = new Date()): string {
  return issueFormStartToken(formIdOf(unitId), now);
}

/** โดเมนของร้าน (§9.5): โฮสต์ที่เป็นโดเมนของร้านอื่น ⇒ ไม่เสิร์ฟหน้าโรงแรมของร้านนี้ · โฮสต์ SHARK/ไม่รู้จัก ⇒ ผ่าน */
export async function hotelHostAllowed(host: string | null | undefined, tenantSlug: string): Promise<boolean> {
  // SVC H.8 r2 (ผู้ตรวจ A-15b): ตัดพอร์ตก่อนเทียบโดเมน (domain.normalizeHost ไม่ตัด · ห้ามแตะ domain/**) · [IPv6]:port ⇒ ตัวในวงเล็บ
  const raw = (host ?? "").trim();
  const h = raw.startsWith("[") ? raw.slice(1, Math.max(1, raw.indexOf("]"))) : raw.replace(/:\d*$/, "");
  if (!h) return true;
  try {
    const t = await resolveTenantByHost(h);
    return !t || t.slug === tenantSlug;
  } catch {
    return true;
  }
}

function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at < 1) return "***";
  const name = e.slice(0, at);
  return `${name.slice(0, Math.min(2, name.length))}***${e.slice(at)}`;
}

const SettingsKeys = {
  enabled: "rooms.hotel.storefront.enabled",
  maxRooms: "rooms.hotel.storefront.maxRooms",
  selfCancel: "rooms.hotel.storefront.selfCancel",
  badgeTh: "rooms.hotel.storefront.badgeTh",
  badgeEn: "rooms.hotel.storefront.badgeEn",
  descTh: "rooms.hotel.storefront.description.th",
  descEn: "rooms.hotel.storefront.description.en",
  hero: "rooms.hotel.storefront.heroImages",
  maxAdvance: "rooms.hotel.maxAdvanceBookingDays",
  minNights: "rooms.hotel.minNights",
  closedToArrival: "rooms.hotel.closedToArrival",
  deposit: "rooms.hotel.deposit",
  cancelPolicy: "rooms.hotel.cancelPolicy",
  bookingMode: "rooms.hotel.bookingMode",
  checkInTime: "rooms.hotel.checkInTime",
  checkOutTime: "rooms.hotel.checkOutTime",
  notifyChannel: "rooms.hotel.notify.channel",
  lineConnection: "messaging.lineConnectionId",
} as const;
type SKey = (typeof SettingsKeys)[keyof typeof SettingsKeys];
async function settingsOf(tenantId: string, unitId: string, keys: SKey[]): Promise<(k: SKey) => unknown> {
  const st = await resolveSettings({ tenantId }, [...keys], { unitId });
  return (k) => st[k]?.value;
}
const numV = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strV = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const rulesV = (v: unknown): { daysBefore: number; refundBp: number }[] =>
  Array.isArray(v) ? v.filter((r): r is { daysBefore: number; refundBp: number } => isRec(r) && Number.isInteger(r.daysBefore) && Number.isInteger(r.refundBp)).map((r) => ({ daysBefore: r.daysBefore, refundBp: r.refundBp })) : [];

/** แผนเปิดเว็บไหม — visibility ว่าง (แผนรุ่นแรก) = ทุกช่องทาง */
const webVisible = (visibility: unknown): boolean => {
  const v = Array.isArray(visibility) ? visibility.filter((x): x is string => typeof x === "string") : [];
  return v.length === 0 || v.includes("WEB");
};

/** สรุปเงื่อนไขยกเลิกสั้น TH/EN (กฎเรียงวันมาก→น้อย) */
export function cancelSummary(rules: readonly { daysBefore: number; refundBp: number }[]): { th: string; en: string; refundable: boolean } {
  const rs = [...rules].sort((a, b) => b.daysBefore - a.daysBefore).filter((r) => r.refundBp > 0);
  if (!rs.length) return { th: "ไม่คืนเงินเมื่อยกเลิก", en: "Non-refundable", refundable: false };
  const th: string[] = [];
  const en: string[] = [];
  for (const r of rs) {
    const pct = Math.round(r.refundBp / 100);
    if (r.refundBp >= 10_000) {
      th.push(r.daysBefore > 0 ? `ยกเลิกฟรีก่อน ${r.daysBefore} วัน` : "ยกเลิกฟรีถึงวันเข้าพัก");
      en.push(r.daysBefore > 0 ? `Free cancellation up to ${r.daysBefore} days before` : "Free cancellation until check-in day");
    } else {
      th.push(r.daysBefore > 0 ? `ก่อน ${r.daysBefore} วันคืนมัดจำ ${pct}%` : `วันเข้าพักคืนมัดจำ ${pct}%`);
      en.push(r.daysBefore > 0 ? `${pct}% deposit refund up to ${r.daysBefore} days before` : `${pct}% deposit refund on check-in day`);
    }
  }
  return { th: th.join(" · "), en: en.join(" · "), refundable: true };
}

// ─────────── อ่านพารามิเตอร์ร่วม ───────────
const SlugsIn = z.object({ tenantSlug: z.string().trim().min(1).max(100), unitSlug: z.string().trim().min(1).max(100) });
const slugsOf = (input: unknown): { tenantSlug: string; unitSlug: string } | null => {
  const p = SlugsIn.safeParse(input);
  return p.success ? p.data : null;
};
const intIn = (lo: number, hi: number) => z.coerce.number().int().min(lo).max(hi);
const StayIn = z.object({
  checkIn: z.string().refine((s) => hotel.isYmd(s)),
  checkOut: z.string().refine((s) => hotel.isYmd(s)),
  adults: intIn(1, 20).optional().default(2),
  children: intIn(0, 20).optional().default(0),
});

type StayCheck = { checkIn: string; checkOut: string; nights: number } | HotelWebFail;
/** ตรวจช่วงวัน (ก่อนแตะฐาน): รูปวัน · ออก > เข้า · ไม่ย้อนหลัง · ไม่ยาวเกิน */
function checkStay(checkIn: string, checkOut: string, today: string): StayCheck {
  if (!hotel.isYmd(checkIn) || !hotel.isYmd(checkOut)) return fail("INVALID_INPUT", "วันที่ไม่ถูกต้อง");
  if (!(checkOut > checkIn)) return fail("INVALID_INPUT", "วันออกต้องอยู่หลังวันเข้าพักอย่างน้อย 1 คืน");
  if (checkIn < today) return fail("PAST_DATE", R.past);
  const nights = hotel.dayNumber(checkOut) - hotel.dayNumber(checkIn);
  if (nights > MAX_WEB_NIGHTS) return fail("INVALID_INPUT", `จองทางเว็บได้ไม่เกิน ${MAX_WEB_NIGHTS} คืนต่อครั้ง — ติดต่อที่พักสำหรับการพักยาว`);
  return { checkIn, checkOut, nights };
}
const isWebFail = (v: unknown): v is HotelWebFail => isRec(v) && v.ok === false;

// ─────────── ราคา (เครื่องคิดราคา H.1 · pure หลังโหลดบริบท) ───────────
type Pc = NonNullable<Awaited<ReturnType<typeof hotel.loadPricingContext>>>;
function quotePlans(
  pc: Pc,
  roomTypeId: string,
  stay: { checkIn: string; checkOut: string },
  limits: { minNights: number | null; closedToArrival: boolean; maxAdvanceBookingDays: number },
  depositFromSettings: unknown,
  rulesOf: (planId: string) => { daysBefore: number; refundBp: number }[],
  onlyPlanIds?: string[],
): WebPlanQuote[] {
  const out: WebPlanQuote[] = [];
  for (const plan of pc.plans) {
    if (!webVisible(plan.visibility)) continue;
    if (onlyPlanIds && !onlyPlanIds.includes(plan.id)) continue;
    const q = hotel.quoteStay(pc, { roomTypeId, ratePlanId: plan.id, checkIn: stay.checkIn, checkOut: stay.checkOut, limits: { minNights: limits.minNights, maxNights: null, closedToArrival: limits.closedToArrival, maxAdvanceBookingDays: limits.maxAdvanceBookingDays } });
    if (!q.ok) continue;
    const depPolicy = hotel.depositPolicyOf(plan, isRec(depositFromSettings) && isStr(depositFromSettings.kind) ? (depositFromSettings as { kind: string }) : { kind: "FIRST_NIGHT" });
    const rules = rulesOf(plan.id);
    const cs = cancelSummary(rules);
    out.push({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      includeBreakfast: plan.includeBreakfast,
      totalSatang: q.nightsTotal,
      nights: q.nights.map((n) => ({ date: n.date, priceSatang: n.priceSatang })),
      depositSatang: hotel.depositFor([q], depPolicy, pc.rounding),
      depositKind: String(depPolicy.kind),
      cancelSummaryTh: cs.th,
      cancelSummaryEn: cs.en,
      cancelRules: rules,
      refundable: cs.refundable,
    });
  }
  return out;
}

// ═══════════════ publicInfo ═══════════════
export async function publicInfo(input: unknown, opts: HotelWebOpts): Promise<WebInfoOk | HotelWebFail> {
  try {
    const s = slugsOf(input);
    if (!s) return NF();
    const u = await hotel.webUnitBySlugs(s.tenantSlug, s.unitSlug);
    if (await limited("info", u, opts)) return fail("RATE_LIMITED", R.rate);
    if (!u) return NF();
    const K = SettingsKeys;
    const get = await settingsOf(u.tenantId, u.unitId, [K.enabled, K.maxRooms, K.selfCancel, K.badgeTh, K.badgeEn, K.descTh, K.descEn, K.hero, K.maxAdvance, K.checkInTime, K.checkOutTime]);
    const now = nowOf(opts);
    const paused = u.unitStatus !== "ACTIVE";
    return {
      ok: true,
      unitName: u.unitName,
      tenantName: u.tenantName,
      open: !paused && get(K.enabled) !== false,
      paused,
      badgeTh: strV(get(K.badgeTh)),
      badgeEn: strV(get(K.badgeEn)),
      descriptionTh: strV(get(K.descTh)),
      descriptionEn: strV(get(K.descEn)),
      heroImages: Array.isArray(get(K.hero)) ? (get(K.hero) as unknown[]).filter(isStr).slice(0, 10) : [],
      checkInTime: strV(get(K.checkInTime)) ?? "14:00",
      checkOutTime: strV(get(K.checkOutTime)) ?? "12:00",
      maxRooms: numV(get(K.maxRooms), 5),
      maxAdvanceBookingDays: numV(get(K.maxAdvance), 365),
      selfCancel: get(K.selfCancel) !== false,
      today: bkkYmd(now),
      formToken: holdFormStart(u.unitId, now),
    };
  } catch (e) {
    console.error("[hotel.web] info", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ publicSearch (≤ 14 คิวรี: หน่วย+ประเภท+กฎ 1 · ค่าตั้ง 2 · บริบทราคา 8 · ห้องว่าง 3) ═══════════════
const SearchIn = SlugsIn.and(StayIn).and(z.object({ rooms: intIn(1, 10).optional().default(1) }));
export async function publicSearch(input: unknown, opts: HotelWebOpts): Promise<WebSearchOk | HotelWebFail> {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const p = SearchIn.safeParse(input);
    const now = nowOf(opts);
    const today = bkkYmd(now);
    // คำขอผิดรูป = ถังรวมต่อ client (ไม่แตะฐานนอกจากถัง)
    if (!p.success) return (await limited("search", null, opts)) ? fail("RATE_LIMITED", R.rate) : fail("INVALID_INPUT", R.input);
    const stay = checkStay(p.data.checkIn, p.data.checkOut, today);
    if (isWebFail(stay)) return (await limited("search", null, opts)) ? fail("RATE_LIMITED", R.rate) : stay;
    // หน่วย + ประเภท + กฎยกเลิก + ข้อมูลห้องว่าง (สูตรเดียว buildAvailability) = 1 คิวรี → แล้วนับถังของหน่วยที่มีจริง (r2 A-12)
    const b = await hotel.webSearchBundle(p.data.tenantSlug, p.data.unitSlug, stay.checkIn, stay.checkOut);
    if (await limited("search", b, opts)) return fail("RATE_LIMITED", R.rate);
    if (!b) return NF();
    const K = SettingsKeys;
    const lastNight = hotel.addDaysYmd(stay.checkOut, -1);
    const [get, pc] = await Promise.all([
      settingsOf(b.tenantId, b.unitId, [K.enabled, K.maxAdvance, K.minNights, K.closedToArrival, K.deposit, K.cancelPolicy]),
      hotel.loadPricingContext({ tenantId: b.tenantId }, b.unitId, { from: stay.checkIn, to: lastNight }),
    ]);
    if (b.unitStatus !== "ACTIVE" || get(K.enabled) === false) return fail("CLOSED", R.closed);
    const maxAdvance = numV(get(K.maxAdvance), 365);
    if (hotel.dayNumber(stay.checkIn) - hotel.dayNumber(today) > maxAdvance) return fail("TOO_FAR", R.tooFar.replace("{n}", String(maxAdvance)));
    if (!pc) return NF();
    const av = { byDate: b.byDate };
    const settingRules = rulesV(get(K.cancelPolicy));
    const rulesOf = (planId: string) => {
      const r = b.cancelRules.filter((x) => x.ratePlanId === planId).map((x) => ({ daysBefore: x.daysBefore, refundBp: x.refundBp }));
      return r.length ? r : settingRules;
    };
    const ctx = { ...pc, today };
    const minN = get(K.minNights);
    const limits = { minNights: typeof minN === "number" ? minN : null, closedToArrival: get(K.closedToArrival) === true, maxAdvanceBookingDays: maxAdvance };
    const days = Object.keys(av.byDate).sort();
    const shown = new Set(days.length ? Object.keys(av.byDate[days[0]] ?? {}) : []);
    const roomsWanted = p.data.rooms;
    const roomTypes: WebRoomType[] = b.roomTypes
      .filter((t) => shown.has(t.id))
      .map((t) => {
        const cells = days.map((d) => ({ d, n: av.byDate[d]?.[t.id]?.available ?? 0 }));
        const remaining = cells.length ? Math.min(...cells.map((c) => c.n)) : 0;
        return {
          id: t.id,
          name: t.name,
          images: t.images,
          amenities: t.amenities,
          bedType: t.bedType,
          description: t.description,
          capacity: t.capacity,
          maxOccupancy: t.maxOccupancy,
          remaining,
          lowStock: remaining > 0 && remaining <= 3,
          soldOutDates: cells.filter((c) => c.n < roomsWanted).map((c) => c.d),
          plans: quotePlans(ctx, t.id, stay, limits, get(K.deposit), rulesOf),
        };
      });
    return { ok: true, checkIn: stay.checkIn, checkOut: stay.checkOut, nights: stay.nights, adults: p.data.adults, children: p.data.children, rooms: roomsWanted, roomTypes };
  } catch (e) {
    console.error("[hotel.web] search", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ ใบเสนอราคา (หลายห้อง · คูปอง) ═══════════════
const RoomSpecIn = z.object({
  roomTypeId: z.string().trim().min(1).max(64),
  qty: intIn(1, 10).optional().default(1),
  ratePlanId: z.string().trim().min(1).max(64).optional().nullable(),
  adults: intIn(1, 20).optional(),
  children: intIn(0, 20).optional(),
});
type RoomSpec = z.infer<typeof RoomSpecIn>;
const QuoteIn = SlugsIn.and(StayIn).and(z.object({ rooms: z.array(RoomSpecIn).min(1).max(10), couponCode: z.string().trim().max(40).optional().nullable() }));

type QuoteCore = {
  unit: hotel.WebUnit;
  stay: { checkIn: string; checkOut: string; nights: number };
  plan: hotel.WebPlanRow;
  lines: { roomTypeId: string; roomTypeName: string; qty: number; totalSatang: number; depositSatang: number; nights: { date: string; priceSatang: number }[] }[];
  totalSatang: number;
  depositSatang: number;
  coupon: { ok: true; code: string; systemId: string; discountSatang: number } | { ok: false; reason: string } | null;
  cancelRules: { daysBefore: number; refundBp: number }[];
};

/** แผนเดียวต่อใบจอง (หลายห้องได้) · แผนต้องเปิดเว็บ · ไม่ระบุ = แผนเริ่มต้น */
function pickPlan(plans: hotel.WebPlanRow[], specs: RoomSpec[]): hotel.WebPlanRow | HotelWebFail {
  const ids = [...new Set(specs.map((r) => r.ratePlanId ?? "").filter(Boolean))];
  if (ids.length > 1) return fail("INVALID_INPUT", "เลือกแผนราคาเดียวกันทุกห้องในการจองครั้งเดียว");
  const plan = ids.length ? plans.find((x) => x.id === ids[0]) : (plans.find((x) => x.isDefault && webVisible(x.visibility)) ?? plans.find((x) => webVisible(x.visibility)));
  if (!plan) return fail("NOT_FOUND", "ไม่พบแผนราคานี้");
  if (!webVisible(plan.visibility)) return fail("PLAN_NOT_PUBLIC", R.planNotPublic);
  return plan;
}

async function couponFor(tenantId: string, unitId: string, code: string | null | undefined, amountSatang: number): Promise<QuoteCore["coupon"]> {
  const c = (code ?? "").trim();
  if (!c) return null;
  const systemId = await systemForUnit(tenantId, unitId, "COUPON");
  if (!systemId) return { ok: false, reason: "NOT_FOUND" };
  const v = await coupon.validate({ code: c, tenantId, systemId, amountSatang, unitId });
  return v.ok ? { ok: true, code: v.code, systemId, discountSatang: v.discountSatang } : { ok: false, reason: v.reason };
}

async function quoteCore(unit: hotel.WebUnit, stay: { checkIn: string; checkOut: string; nights: number }, specs: RoomSpec[], couponCode: string | null | undefined, today: string): Promise<QuoteCore | HotelWebFail> {
  const plans = await hotel.webPlansOf(unit.tenantId, unit.unitId);
  const plan = pickPlan(plans, specs);
  if (isWebFail(plan)) return plan;
  const K = SettingsKeys;
  const [get, pc, planRules] = await Promise.all([
    settingsOf(unit.tenantId, unit.unitId, [K.maxAdvance, K.minNights, K.closedToArrival, K.deposit, K.cancelPolicy]),
    hotel.loadPricingContext({ tenantId: unit.tenantId }, unit.unitId, { from: stay.checkIn, to: hotel.addDaysYmd(stay.checkOut, -1), ratePlanId: plan.id }),
    hotel.planCancelRules(unit.tenantId, unit.unitId, plan.id),
  ]);
  if (!pc) return NF();
  const maxAdvance = numV(get(K.maxAdvance), 365);
  if (hotel.dayNumber(stay.checkIn) - hotel.dayNumber(today) > maxAdvance) return fail("TOO_FAR", R.tooFar.replace("{n}", String(maxAdvance)));
  const minN = get(K.minNights);
  const ctx = { ...pc, today };
  const lines: QuoteCore["lines"] = [];
  for (const r of specs) {
    const q = hotel.quoteStay(ctx, { roomTypeId: r.roomTypeId, ratePlanId: plan.id, checkIn: stay.checkIn, checkOut: stay.checkOut, limits: { minNights: typeof minN === "number" ? minN : null, maxNights: null, closedToArrival: get(K.closedToArrival) === true, maxAdvanceBookingDays: maxAdvance } });
    if (!q.ok) return fail(q.error === "NO_RATE" ? "NOT_FOUND" : q.error === "PAST_DATE" || q.error === "TOO_FAR" ? q.error : "INVALID_INPUT", q.messageTh, q.dates ? { dates: q.dates } : {});
    const planRow = pc.plans.find((x) => x.id === plan.id) ?? null;
    const dep = hotel.depositFor([q], hotel.depositPolicyOf(planRow, isRec(get(K.deposit)) ? (get(K.deposit) as { kind: string }) : { kind: "FIRST_NIGHT" }), pc.rounding);
    const name = pc.roomTypeList.find((t) => t.id === r.roomTypeId)?.name ?? "";
    lines.push({ roomTypeId: r.roomTypeId, roomTypeName: name, qty: r.qty, totalSatang: q.nightsTotal * r.qty, depositSatang: dep * r.qty, nights: q.nights.map((n) => ({ date: n.date, priceSatang: n.priceSatang })) });
  }
  const totalSatang = lines.reduce((a, l) => a + l.totalSatang, 0);
  const depositSatang = lines.reduce((a, l) => a + l.depositSatang, 0);
  const coupon = await couponFor(unit.tenantId, unit.unitId, couponCode, totalSatang);
  return { unit, stay, plan, lines, totalSatang, depositSatang, coupon, cancelRules: planRules.length ? planRules : rulesV(get(K.cancelPolicy)) };
}

export async function publicQuote(input: unknown, opts: HotelWebOpts) {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const unit = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
    if (await limited("quote", unit, opts)) return fail("RATE_LIMITED", R.rate);
    if (!unit) return NF();
    const p = QuoteIn.safeParse(input);
    if (!p.success) return fail("INVALID_INPUT", R.input);
    const today = bkkYmd(nowOf(opts));
    const stay = checkStay(p.data.checkIn, p.data.checkOut, today);
    if (isWebFail(stay)) return stay;
    const q = await quoteCore(unit, stay, p.data.rooms, p.data.couponCode, today);
    if (isWebFail(q)) return q;
    const discount = q.coupon?.ok ? q.coupon.discountSatang : 0;
    return {
      ok: true as const,
      totalSatang: q.totalSatang,
      depositSatang: q.depositSatang,
      discountSatang: discount,
      payAtHotelSatang: Math.max(0, q.totalSatang - discount - q.depositSatang),
      ratePlan: { id: q.plan.id, code: q.plan.code, name: q.plan.name },
      lines: q.lines,
      coupon: q.coupon ? (q.coupon.ok ? { ok: true, code: q.coupon.code, discountAppliedAt: "CHECKOUT" } : { ok: false, reason: q.coupon.reason }) : null,
      checkIn: q.stay.checkIn,
      checkOut: q.stay.checkOut,
      nights: q.stay.nights,
      cancelRules: q.cancelRules,
      cancelSummaryTh: cancelSummary(q.cancelRules).th,
      cancelSummaryEn: cancelSummary(q.cancelRules).en,
      refundable: cancelSummary(q.cancelRules).refundable,
      firstNightDeposit: q.lines.every((l) => l.nights.length > 0 && l.depositSatang === (l.nights[0]?.priceSatang ?? 0) * l.qty),
    };
  } catch (e) {
    console.error("[hotel.web] quote", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ QR มัดจำ (สถิต · ยอดล็อก) ═══════════════
async function intentFor(tenantId: string, unitId: string, amountSatang: number, code: string, expiresAt: Date | null): Promise<WebIntent | null> {
  if (amountSatang <= 0) return null;
  const r = await promptpayQrFor({ tenantId }, { unitId, amountSatang, ref: code });
  if (!r.ok) return null;
  return { kind: "PROMPTPAY_STATIC", qrPayload: r.payload, qrSvgDataUrl: r.svgDataUrl, amountSatang, expiresAt: expiresAt ? expiresAt.toISOString() : null, receiverName: r.displayName };
}
/** AUTO_CONFIRM ที่มีมัดจำ: จ่ายล่วงหน้าได้ถึงก่อนวันเข้า 1 วัน (เที่ยงคืนไทย) */
const autoPayDeadline = (checkIn: string) => new Date(`${hotel.addDaysYmd(checkIn, -1)}T23:59:59.000+07:00`);

// ═══════════════ publicCreateHold ═══════════════
const HoldIn = SlugsIn.and(StayIn).and(
  z.object({
    rooms: z.array(RoomSpecIn).min(1).max(10),
    guest: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(32).optional().nullable(),
      email: z.string().trim().max(120).optional().nullable(),
    }),
    couponCode: z.string().trim().max(40).optional().nullable(),
    locale: z.string().optional().nullable(),
    spam: z.object({ hp: z.string().max(500).optional().nullable(), st: z.string().max(300).optional().nullable() }).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(128),
  }),
);
const EMAIL_RE = /^[^\s@<>,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function publicCreateHold(input: unknown, opts: HotelWebOpts) {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const known = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
    if (await limited("hold", known, opts)) return fail("RATE_LIMITED", R.rate);
    if (!known) return NF();
    const p = HoldIn.safeParse(input);
    if (!p.success) return fail("INVALID_INPUT", R.input);
    const inp = p.data;
    const now = nowOf(opts);
    const today = bkkYmd(now);
    const stay = checkStay(inp.checkIn, inp.checkOut, today);
    if (isWebFail(stay)) return stay;
    const email = inp.guest.email ? inp.guest.email.trim() : "";
    if (email && !EMAIL_RE.test(email)) return fail("INVALID_INPUT", "อีเมลไม่ถูกต้อง");
    const phoneDigits = (inp.guest.phone ?? "").replace(/\D/g, "");
    if (inp.guest.phone && (phoneDigits.length < 9 || phoneDigits.length > 15)) return fail("INVALID_INPUT", "เบอร์โทรไม่ถูกต้อง");

    const pub = await resolvePublicUnit(inp.tenantSlug, inp.unitSlug, "HOTEL");
    if (!pub) return fail("CLOSED", R.closed);
    const unit: hotel.WebUnit = { tenantId: pub.tenant.id, tenantSlug: pub.tenant.slug, tenantName: pub.tenant.name, unitId: pub.unit.id, unitSlug: pub.unit.slug, unitName: pub.unit.name, unitStatus: String(pub.unit.status) };

    // กันสแปม (ปฏิเสธเงียบ · ไม่บอกเหตุผลจริง): honeypot (_sd_hp) · ตั๋วเริ่มฟอร์มของหน่วยนี้ อายุ ≥ 3 วิ
    const hp = inp.spam?.hp ?? "";
    const ticket = readFormStartToken(inp.spam?.st ?? "", formIdOf(unit.unitId), now);
    if ((hp && hp.trim()) || !ticket || ticket.ageSec < HOTEL_WEB_MIN_FORM_SEC) return fail("REJECTED", R.rejected);
    void FORM_HONEYPOT_FIELD;

    const K = SettingsKeys;
    const get = await settingsOf(unit.tenantId, unit.unitId, [K.enabled, K.maxRooms, K.bookingMode]);
    if (get(K.enabled) === false) return fail("CLOSED", R.closed);
    const maxRooms = numV(get(K.maxRooms), 5);
    const qty = inp.rooms.reduce((a, r) => a + r.qty, 0);
    if (qty > maxRooms) return fail("TOO_MANY_ROOMS", R.tooMany.replace("{n}", String(maxRooms)));
    // SVC H.8 r2 ▸ (ผู้ตรวจ A-6 ก) โหมดที่ถือห้อง (มัดจำ/รออนุมัติ) ต้องติดต่อแขกได้ — อีเมลหรือเบอร์ (รูปแบบตรวจแล้วด้านบน) อย่างน้อย 1 ◂
    const holdMode = String(get(K.bookingMode) ?? "DEPOSIT_REQUIRED") !== "AUTO_CONFIRM";
    if (holdMode && !email && !(inp.guest.phone && phoneDigits)) return fail("CONTACT_REQUIRED", R.contact);

    // คำขอซ้ำ (กดซ้ำ/รีเฟรช) ⇒ ใบเดิม — ก่อนใช้ตั๋ว (ตั๋วใบใหม่ของคำขอซ้ำไม่ถูกเผา) · ข้อมูลต่างจากใบเดิม ⇒ ใบเดิม + mismatch:true (r2 A-11)
    const idem = sha(`${unit.unitId}:${inp.idempotencyKey}`).slice(0, 40);
    const reqFp = { checkIn: stay.checkIn, checkOut: stay.checkOut, name: inp.guest.name, email: normEmail(email), phone: phoneDigits, plan: inp.rooms.find((r) => r.ratePlanId)?.ratePlanId ?? null, types: inp.rooms.flatMap((r) => Array.from({ length: r.qty }, () => r.roomTypeId)).sort() };
    const differs = (fp: PriorRow["fingerprint"]): boolean =>
      fp.checkIn !== reqFp.checkIn ||
      fp.checkOut !== reqFp.checkOut ||
      fp.guestName.trim() !== reqFp.name ||
      normEmail(fp.guestEmail) !== reqFp.email ||
      (fp.guestPhone ?? "").replace(/\D/g, "") !== reqFp.phone ||
      (reqFp.plan !== null && reqFp.plan !== fp.ratePlanId) ||
      fp.roomTypeIds.join("|") !== reqFp.types.join("|");
    const prior = await hotel.webBookingByIdem(unit.tenantId, unit.unitId, idem);
    if (prior) return replayHold(unit, prior, differs(prior.fingerprint));

    const plans = await hotel.webPlansOf(unit.tenantId, unit.unitId);
    const plan = pickPlan(plans, inp.rooms);
    if (isWebFail(plan)) return plan;

    let coupon: QuoteCore["coupon"] = null;
    if (inp.couponCode && inp.couponCode.trim()) {
      const q = await quoteCore(unit, stay, inp.rooms, inp.couponCode, today);
      if (isWebFail(q)) return q;
      coupon = q.coupon;
    }
    // SVC H.8 r2 ▸ ด่านกันยึดห้อง (ผู้ตรวจ A-6 ข ค · HOTEL_WEB_HOLD_CAP) — ห้องว่าง + ห้องที่ถืออยู่จาก snapshot เดียว ◂
    const markPrefix = `hw:hk:${unitHash(unit)}:${clientHash(opts)}:`;
    if (holdMode) {
      const gb = await hotel.webSearchBundle(unit.tenantSlug, unit.unitSlug, stay.checkIn, stay.checkOut, { now, markPrefix });
      if (gb) {
        if (gb.clientHeld + qty > maxRooms) return fail("TOO_MANY_HOLDS", R.tooManyHolds);
        const need = new Map<string, number>();
        for (const r of inp.rooms) need.set(r.roomTypeId, (need.get(r.roomTypeId) ?? 0) + r.qty);
        const days = Object.keys(gb.byDate).sort();
        const short = [...need].some(([t, n]) => !days.length || days.some((d) => (gb.byDate[d]?.[t]?.available ?? 0) < n));
        if (!short) {
          const held = new Map(gb.webHeld.map((h) => [`${h.roomTypeId}|${h.date}`, h.n]));
          for (const [t, n] of need) {
            for (const d of days) {
              const total = gb.byDate[d]?.[t]?.total ?? 0;
              const cap = Math.max(HOTEL_WEB_HOLD_CAP.minPerTypeNight, Math.ceil((total * HOTEL_WEB_HOLD_CAP.perTypeNightBp) / 10_000));
              if ((held.get(`${t}|${d}`) ?? 0) + n > cap) return fail("TOO_MANY_HOLDS", R.tooManyHolds);
            }
          }
        }
      }
    }
    if (!(await consumeFormStartToken(ticket.nonce))) return fail("REJECTED", R.rejected);

    const rooms = inp.rooms.flatMap((r) => Array.from({ length: r.qty }, () => ({ roomTypeId: r.roomTypeId, adults: r.adults ?? inp.adults, children: r.children ?? inp.children })));
    const locale = inp.locale === "en" ? "en" : "th";
    const created = await hotel.createBooking(null, { tenantId: unit.tenantId }, {
      unitId: unit.unitId,
      rooms,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      ratePlanId: plan.id,
      source: "WEB",
      hold: "ONLINE",
      guest: { name: inp.guest.name, phone: inp.guest.phone || null, email: email || null },
      couponCode: coupon?.ok ? coupon.code : null,
      coupon: coupon?.ok ? { code: coupon.code, systemId: coupon.systemId, discountSatang: coupon.discountSatang } : null,
      locale,
      idempotencyKey: idem,
    });
    if (!created.ok) {
      if (created.code === "DUPLICATE_REQUEST") {
        const again = await hotel.webBookingByIdem(unit.tenantId, unit.unitId, idem);
        return again ? replayHold(unit, again, differs(again.fingerprint)) : fail("BUSY", R.busy);
      }
      return fail(created.code, created.reason, created.dates ? { dates: created.dates } : {});
    }
    const head = created.reservations[0];
    if (head.status === "HOLD") await hotel.webHoldMark(markPrefix, created.reservations.map((r) => r.id)); // r2 A-6 ข
    const holdExpiresAt = head.holdExpiresAt ? new Date(head.holdExpiresAt) : null;
    const awaitingDeposit = head.status === "HOLD" && get(K.bookingMode) !== "MANUAL_APPROVE";
    const intent = awaitingDeposit ? await intentFor(unit.tenantId, unit.unitId, created.depositRequiredSatang, head.code, holdExpiresAt) : null;
    await emitOutboxOutsideTx({
      tenantId: unit.tenantId,
      unitId: unit.unitId,
      type: HOTEL_WEB_EVENTS.holdCreated,
      idempotencyKey: `${HOTEL_WEB_EVENTS.holdCreated}#${head.id}`,
      payload: { tenantId: unit.tenantId, unitId: unit.unitId, reservationId: head.id, reservationIds: created.reservations.map((r) => r.id), groupId: created.groupId, code: head.code, status: head.status, rooms: rooms.length, depositRequiredSatang: created.depositRequiredSatang, source: "WEB" },
    });
    const discount = coupon?.ok ? coupon.discountSatang : 0;
    return {
      ok: true as const,
      publicToken: created.publicToken,
      code: head.code,
      status: head.status,
      holdExpiresAt: head.holdExpiresAt,
      depositRequiredSatang: created.depositRequiredSatang,
      totalSatang: created.quote.totalSatang,
      discountSatang: discount,
      groupId: created.groupId,
      codes: created.reservations.map((r) => r.code),
      coupon: coupon ? (coupon.ok ? { ok: true, code: coupon.code, discountAppliedAt: "CHECKOUT" } : { ok: false, reason: coupon.reason }) : null,
      intent,
    };
  } catch (e) {
    console.error("[hotel.web] hold", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

type PriorRow = NonNullable<Awaited<ReturnType<typeof hotel.webBookingByIdem>>>;
async function replayHold(unit: hotel.WebUnit, r: PriorRow, mismatch = false) {
  const intent = r.status === "HOLD" && r.holdExpiresAt && r.depositRequiredSatang > 0 ? await intentFor(unit.tenantId, unit.unitId, r.depositRequiredSatang, r.code, r.holdExpiresAt) : null;
  return {
    ok: true as const,
    replayed: true,
    publicToken: r.publicToken,
    code: r.code,
    status: r.status,
    holdExpiresAt: r.holdExpiresAt ? r.holdExpiresAt.toISOString() : null,
    depositRequiredSatang: r.depositRequiredSatang,
    groupId: r.groupId,
    intent,
    ...(mismatch ? { mismatch: true } : {}),
  };
}

// ═══════════════ ตัวช่วยการจองจาก token ═══════════════
const TokenIn = SlugsIn.and(z.object({ publicToken: z.string().trim().min(1).max(64) }));
/**
 * หน่วย + การจองจาก token แล้วนับถัง rate ของหน่วยที่มีจริง (r2 A-12) — op "view" แยกถังต่อการจอง (r2 ข้อ 7) · token ผิด/ร้านอื่น ⇒ ถัง none ร่วม
 * skipRate = ผ่านด่านมาแล้ว (ตั๋ว publicSlipGate) · ไม่พบ = NF ตัวเดียว (X1)
 */
async function viewOf(op: RateOp, input: unknown, opts: HotelWebOpts | undefined, skipRate = false): Promise<{ unit: hotel.WebUnit; f: hotel.WebBookingFacts } | HotelWebFail> {
  const s0 = slugsOf(input);
  if (!s0) return NF();
  const p = TokenIn.safeParse(input);
  const unit = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
  const f = unit && p.success ? await hotel.webBookingFacts(unit.tenantId, unit.unitId, p.data.publicToken) : null;
  if (!skipRate && (await limited(op, unit, opts, op === "view" ? (f && p.success ? `${f.id}` : null) : undefined))) return fail("RATE_LIMITED", R.rate);
  if (!unit || !f) return NF();
  return { unit, f };
}
/** OTA = ยกเลิก/แก้ไขที่ช่องทาง · เว็บ/LINE = ยกเลิกเองได้ · อื่น (โทร/walk-in/เคาน์เตอร์) = ติดต่อโรงแรม (r2 A-14) */
const cancelViaOf = (source: string): WebStatusDto["cancelVia"] => (source === "WEB" || source === "LINE" ? "SELF" : source === "OTA" ? "CHANNEL" : "HOTEL");
const holdKindOf = (snapshot: unknown): "DEPOSIT" | "APPROVAL" => (isRec(snapshot) && snapshot.bookingMode === "MANUAL_APPROVE" ? "APPROVAL" : "DEPOSIT");
/** ยอดมัดจำที่ยังรับได้ตอนนี้ (หัวกลุ่ม) + เส้นตาย — ไม่มี = null */
function payableOf(f: hotel.WebBookingFacts, now: Date): { amount: number; expiresAt: Date | null } | null {
  if (f.head.depositPaidAt || f.head.depositSatang <= 0) return null;
  if (f.status === "HOLD") {
    if (holdKindOf(f.policySnapshot) === "APPROVAL") return null;
    if (f.holdExpiresAt && f.holdExpiresAt <= now) return null;
    return { amount: f.head.depositSatang, expiresAt: f.holdExpiresAt };
  }
  if (f.status === "CONFIRMED") {
    const dl = autoPayDeadline(f.checkIn);
    return dl > now ? { amount: f.head.depositSatang, expiresAt: dl } : null;
  }
  return null;
}

// ═══════════════ publicPayDeposit ═══════════════
export async function publicPayDeposit(input: unknown, opts: HotelWebOpts) {
  try {
    const x = await viewOf("view", input, opts);
    if (isWebFail(x)) return x;
    const now = nowOf(opts);
    if (x.f.head.depositPaidAt) return { ok: true as const, paid: true, intent: null };
    const pay = payableOf(x.f, now);
    if (!pay) return { ok: true as const, paid: false, intent: null };
    const intent = await intentFor(x.unit.tenantId, x.unit.unitId, pay.amount, x.f.code, pay.expiresAt);
    return { ok: true as const, paid: false, intent, ...(intent ? {} : { note: "NO_RECEIVER" }) };
  } catch (e) {
    console.error("[hotel.web] pay", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ publicAttachSlip ═══════════════
const SlipIn = TokenIn.and(z.object({ idempotencyKey: z.string().trim().min(8).max(128) }));
const slipPasses = new WeakSet<object>();
/**
 * ด่าน rate ของสลิปก่อนอ่าน body (route/แอ็กชันเรียกก่อน formData · r2 ข้อ 7) — ผ่าน = ตั๋วใช้ครั้งเดียวส่งต่อให้ publicAttachSlip (ไม่นับซ้ำ)
 */
export async function publicSlipGate(input: unknown, opts: HotelWebOpts): Promise<{ ok: true; pass: HotelSlipPass } | HotelWebFail> {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const unit = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
    if (await limited("slip", unit, opts)) return fail("RATE_LIMITED", R.rate);
    if (!unit) return NF();
    const pass: HotelSlipPass = Object.freeze({ slipPass: true as const });
    slipPasses.add(pass);
    return { ok: true, pass };
  } catch (e) {
    console.error("[hotel.web] slip-gate", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}
export async function publicAttachSlip(input: unknown, opts: HotelWebOpts) {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const passed = !!opts?.slipPass && slipPasses.delete(opts.slipPass);
    if (!passed) {
      const unit0 = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
      if (await limited("slip", unit0, opts)) return fail("RATE_LIMITED", R.rate);
    }
    const p = SlipIn.safeParse(input);
    if (!p.success) return fail("INVALID_INPUT", R.input);
    const file = isRec(input) && isRec(input.file) ? input.file : null;
    if (!file || !(file.data instanceof Uint8Array) || typeof file.contentType !== "string") return fail("BAD_FILE", R.badFile);
    const x = await viewOf("slip", input, opts, true);
    if (isWebFail(x)) return x;
    const { unit, f } = x;
    const late = f.status === "CANCELLED" && f.cancelReason === "HOLD_EXPIRED";
    if (f.head.depositPaidAt || f.head.depositSatang <= 0 || !(f.status === "HOLD" || f.status === "CONFIRMED" || late)) return fail("NOT_PAYABLE", R.notPayable);
    // แนบซ้ำด้วยกุญแจเดิม (กดซ้ำ/เน็ตหลุด) ⇒ สลิปเดิม — ไม่เทียบไฟล์ใหม่ (ไฟล์อาจถูกบีบอัดต่างกันทุกครั้ง)
    const slipKey = `hw-slip:${sha(`${unit.unitId}:${p.data.idempotencyKey}`).slice(0, 48)}`;
    const prior = await hotel.slipByIdemKey(unit.tenantId, unit.unitId, slipKey);
    if (prior) return { ok: true as const, slipId: prior.id, status: prior.status, replayed: true };
    // SVC H.8 r2 (ผู้ตรวจ A-13) สลิปรอตรวจได้ใบเดียวต่อการจอง — มีอยู่แล้ว ⇒ คืนใบเดิม + แจ้ง (ใบเดิมถูกปฏิเสธ ⇒ แนบใหม่ได้)
    if (f.pendingSlip) return { ok: true as const, slipId: f.pendingSlip.id, status: f.pendingSlip.status, replayed: true, alreadyPending: true, reason: R.slipPending };
    const deps = opts?.deps ?? {};
    const r = await submitSlip(
      { tenantId: unit.tenantId },
      {
        unitId: unit.unitId,
        domain: "HOTEL",
        refType: "HOTEL_DEPOSIT",
        refId: f.head.id,
        file: { data: file.data, contentType: file.contentType },
        expectedSatang: f.head.depositSatang,
        idempotencyKey: slipKey,
      },
      { ...(deps.put ? { put: deps.put } : {}), ...(deps.del ? { del: deps.del } : {}) },
    );
    if (!r.ok) {
      if (r.code === "VALIDATION") return fail("BAD_FILE", r.message || R.badFile);
      if (r.code === "NOT_FOUND") return NF();
      return fail(r.code, r.message || R.failed);
    }
    await emitOutboxOutsideTx({
      tenantId: unit.tenantId,
      unitId: unit.unitId,
      type: HOTEL_WEB_EVENTS.slipAttached,
      idempotencyKey: `${HOTEL_WEB_EVENTS.slipAttached}#${r.slipId}`,
      payload: { tenantId: unit.tenantId, unitId: unit.unitId, reservationId: f.head.id, slipId: r.slipId, status: r.status, expectedSatang: f.head.depositSatang },
    });
    return { ok: true as const, slipId: r.slipId, status: r.status, ...(r.replayed ? { replayed: true } : {}) };
  } catch (e) {
    console.error("[hotel.web] slip", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ publicStatus ═══════════════
function refundOf(f: hotel.WebBookingFacts, today: string): { refundSatang: number; forfeitSatang: number; paidSatang: number } | null {
  if (!f.head.depositPaidAt) return null;
  const pv = hotel.refundPreview({ policySnapshot: f.head.policySnapshot, checkInDate: f.head.checkInDate, depositSatang: f.head.depositSatang, depositPaidAt: f.head.depositPaidAt }, today, f.money ? f.money.remainingSatang : undefined);
  return { refundSatang: pv.refundSatang, forfeitSatang: pv.forfeitSatang, paidSatang: pv.paidSatang };
}
const stateOf = (f: hotel.WebBookingFacts): WebStatusDto["state"] => {
  if (f.status === "CANCELLED" && f.cancelReason === "HOLD_EXPIRED") return "HOLD_EXPIRED";
  if (f.status === "HOLD") return holdKindOf(f.policySnapshot) === "APPROVAL" ? "AWAITING_APPROVAL" : "HOLD";
  return f.status as WebStatusDto["state"];
};

export async function publicStatus(input: unknown, opts: HotelWebOpts): Promise<WebStatusDto | HotelWebFail> {
  try {
    const x = await viewOf("view", input, opts);
    if (isWebFail(x)) return x;
    const { unit, f } = x;
    const now = nowOf(opts);
    const today = bkkYmd(now);
    const K = SettingsKeys;
    const get = await settingsOf(unit.tenantId, unit.unitId, [K.checkInTime, K.checkOutTime, K.notifyChannel, K.lineConnection, K.selfCancel]);
    const channel = String(get(K.notifyChannel) ?? "EMAIL");
    const conn = strV(get(K.lineConnection));
    const basicId = (channel === "LINE" || channel === "BOTH") && conn ? await hotel.lineOaBasicId(unit.tenantId, conn) : null;
    const pay = payableOf(f, now);
    const intent = pay ? await intentFor(unit.tenantId, unit.unitId, pay.amount, f.code, pay.expiresAt) : null;
    const active = f.status === "HOLD" || f.status === "CONFIRMED";
    const groupTotal = f.group.filter((r) => r.status !== "CANCELLED" || f.status === "CANCELLED").reduce((a, r) => a + r.totalSatang, 0) || f.totalSatang;
    const holdKind = f.status === "HOLD" ? holdKindOf(f.policySnapshot) : null;
    return {
      ok: true,
      code: f.code,
      unitName: unit.unitName,
      roomTypeName: f.roomTypeName,
      rooms: f.group.map((r) => ({ code: r.code, roomTypeName: r.roomTypeName, status: r.status })),
      checkIn: f.checkIn,
      checkOut: f.checkOut,
      nights: f.nights,
      adults: f.adults,
      children: f.children,
      status: f.status,
      holdKind,
      awaitingApproval: holdKind === "APPROVAL",
      holdExpiresAt: f.status === "HOLD" && f.holdExpiresAt ? f.holdExpiresAt.toISOString() : null,
      expired: f.status === "CANCELLED" && f.cancelReason === "HOLD_EXPIRED",
      state: stateOf(f),
      totalSatang: groupTotal,
      deposit: { requiredSatang: f.head.depositSatang, paid: !!f.head.depositPaidAt, paidSatang: f.head.depositPaidAt ? (f.money?.amountSatang ?? f.head.depositSatang) : 0, slip: f.slip ? { status: f.slip.status, at: f.slip.createdAt } : null },
      payAtHotelSatang: Math.max(0, groupTotal - f.head.depositSatang),
      checkInTime: strV(get(K.checkInTime)) ?? "14:00",
      checkOutTime: strV(get(K.checkOutTime)) ?? "12:00",
      emailMasked: maskEmail(f.guestEmail),
      pay: intent,
      refund: active ? (refundOf(f, today) ?? { refundSatang: 0, forfeitSatang: 0, paidSatang: 0 }) : null,
      refundedSatang: f.money?.refundedSatang ?? 0,
      canCancel: active && get(K.selfCancel) !== false && !!f.guestEmail && cancelViaOf(f.source) === "SELF",
      cancelVia: cancelViaOf(f.source),
      cancelledAt: f.cancelledAt ? f.cancelledAt.toISOString() : null,
      lineAddFriendUrl: basicId ? `https://line.me/R/ti/p/${basicId}` : null,
      cancelRules: hotel.cancelRulesOfSnapshot(f.head.policySnapshot),
    };
  } catch (e) {
    console.error("[hotel.web] status", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ publicLookup (รหัส + อีเมล · คำตอบเดียวเมื่อไม่พบ) ═══════════════
export async function publicLookup(input: unknown, opts: HotelWebOpts): Promise<{ ok: true; publicToken: string } | HotelWebFail> {
  try {
    const s0 = slugsOf(input);
    if (!s0) return NF();
    const unit = await hotel.webUnitBySlugs(s0.tenantSlug, s0.unitSlug);
    if (await limited("lookup", unit, opts)) return fail("RATE_LIMITED", R.rate);
    const code = isRec(input) ? str(input.code, 40).toUpperCase() : "";
    const email = isRec(input) ? normEmail(input.email) : "";
    if (!unit) return NF();
    // คิวรีเดียวทุกกรณี (รหัสว่าง/ผิด ⇒ ค้นด้วยค่าที่ไม่มีวันตรง) — เวลาตอบ "รหัสผิด" ≈ "อีเมลผิด"
    const row = await hotel.webBookingByCode(unit.tenantId, unit.unitId, code || "-");
    const match = !!row && !!email && !!row.publicToken && normEmail(row.guestEmail) === email;
    if (match && row?.publicToken) return { ok: true, publicToken: row.publicToken };
    await emitOutboxOutsideTx({
      tenantId: unit.tenantId,
      unitId: unit.unitId,
      type: HOTEL_WEB_EVENTS.lookupFailed,
      idempotencyKey: `${HOTEL_WEB_EVENTS.lookupFailed}#${globalThis.crypto.randomUUID()}`,
      payload: { tenantId: unit.tenantId, unitId: unit.unitId, at: new Date().toISOString() },
    });
    return NF();
  } catch (e) {
    console.error("[hotel.web] lookup", e instanceof Error ? e.name : "Error");
    return NF();
  }
}

// ═══════════════ publicCancel (ยกเลิกเองจากลิงก์ · ยอดคืนต้องตรงที่แสดง) ═══════════════
const CancelIn = TokenIn.and(z.object({ email: z.string().max(200).optional().nullable(), confirmRefundSatang: z.coerce.number().int().min(0).max(1_000_000_000) }));
export async function publicCancel(input: unknown, opts: HotelWebOpts) {
  try {
    const x = await viewOf("cancel", input, opts);
    if (isWebFail(x)) return x;
    const p = CancelIn.safeParse(input);
    if (!p.success) return fail("INVALID_INPUT", R.input);
    const { unit, f } = x;
    const K = SettingsKeys;
    const get = await settingsOf(unit.tenantId, unit.unitId, [K.selfCancel]);
    if (get(K.selfCancel) === false) return fail("FORBIDDEN", R.forbidden);
    if (!(f.status === "HOLD" || f.status === "CONFIRMED")) return fail("INVALID_STATUS", R.status);
    // SVC H.8 r2 (ผู้ตรวจ A-14) ยกเลิกเองได้เฉพาะการจองเว็บ/LINE — OTA ยกเลิกที่ช่องทาง (กันห้องคืนขณะ OTA ยังถือ) · อื่น = ติดต่อโรงแรม
    const via = cancelViaOf(f.source);
    if (via !== "SELF") return fail("FORBIDDEN", via === "CHANNEL" ? R.atChannel : R.atHotel);
    const email = normEmail(p.data.email);
    if (!email || !f.guestEmail || normEmail(f.guestEmail) !== email) return NF();
    const today = bkkYmd(nowOf(opts));
    const refund = refundOf(f, today)?.refundSatang ?? 0;
    if (p.data.confirmRefundSatang !== refund) return fail("REFUND_CHANGED", R.refundChanged, { refundSatang: refund });
    const r = await hotel.cancelBookingAsGuest({ tenantId: unit.tenantId }, { unitId: unit.unitId, ...(f.groupId ? { groupId: f.groupId } : { reservationId: f.id }), reason: "GUEST_CANCELLED" });
    if (!r.ok) return fail(r.code === "INVALID_STATUS" || r.code === "STATE_CHANGED" || r.code === "BUSY" ? r.code : "FAILED", r.reason);
    await emitOutboxOutsideTx({
      tenantId: unit.tenantId,
      unitId: unit.unitId,
      type: HOTEL_WEB_EVENTS.cancelledByGuest,
      idempotencyKey: `${HOTEL_WEB_EVENTS.cancelledByGuest}#${f.id}`,
      payload: { tenantId: unit.tenantId, unitId: unit.unitId, reservationId: f.id, reservationIds: r.cancelled, groupId: f.groupId, code: f.code, refundSatang: r.refundSatang, forfeitSatang: r.forfeitSatang },
    });
    return { ok: true as const, status: "CANCELLED", refundSatang: r.refundSatang, forfeitSatang: r.forfeitSatang, ...(r.moneyWarning ? { warning: "MONEY_PENDING" } : {}) };
  } catch (e) {
    console.error("[hotel.web] cancel", e instanceof Error ? e.name : "Error");
    return fail("FAILED", R.failed);
  }
}

// ═══════════════ consumer: payment.slip.approved สาขา HOTEL (เรียกจาก outbox-consumers) ═══════════════
/**
 * สลิปมัดจำโรงแรมที่อนุมัติแล้ว ⇒ takeBookingDeposit (ผู้กระทำระบบ · PROMPTPAY · reference = สลิป) — HOLD→CONFIRMED · idempotent (ใบรับ keyBase hotel-deposit-<group|id>)
 * จ่ายหลังหมดเวลา = H.3 ข้อ 2 (re-book หรือคืนอัตโนมัติ + event deposit_after_expiry) · สลิปไม่ใช่ HOTEL/ร้านอื่น/ไม่พบ ⇒ ไม่ทำอะไร
 * BUSY/STATE_CHANGED ⇒ โยนให้คิวลองใหม่ · ล้มแบบอื่น = log (ไม่วนซ้ำไม่รู้จบ)
 */
export async function onHotelSlipApproved(evt: { tenantId: string; unitId?: string | null; payload: unknown }): Promise<void> {
  if (!isRec(evt) || !isStr(evt.tenantId)) return;
  const pl = isRec(evt.payload) ? evt.payload : null;
  if (!isStr(pl?.slipId) || (pl?.domain !== undefined && pl.domain !== "HOTEL")) return;
  const facts = await hotel.hotelDepositSlipFacts(evt.tenantId, pl.slipId);
  if (!facts || facts.amountSatang <= 0 || facts.settled) return;
  const r = await hotel.takeBookingDeposit(SYSTEM_ACTOR, { tenantId: evt.tenantId }, { unitId: facts.unitId, reservationId: facts.reservationId, payType: "PROMPTPAY", amountSatang: facts.amountSatang, reference: `slip:${facts.slipId}`.slice(0, 64) });
  if (r.ok) {
    await emitOutboxOutsideTx({
      tenantId: evt.tenantId,
      unitId: facts.unitId,
      type: HOTEL_WEB_EVENTS.depositPaid,
      idempotencyKey: `${HOTEL_WEB_EVENTS.depositPaid}#${facts.slipId}`,
      payload: { tenantId: evt.tenantId, unitId: facts.unitId, reservationId: facts.reservationId, groupId: facts.groupId, slipId: facts.slipId, saleId: r.saleId ?? null, amountSatang: facts.amountSatang },
    });
    return;
  }
  if (r.code === "BUSY" || r.code === "STATE_CHANGED") throw new Error(`hotel deposit ${r.code}`);
  console.warn(`[hotel.web] สลิปมัดจำอนุมัติแล้วแต่ลงมัดจำไม่ได้ (${r.code}) tenant=${evt.tenantId}`);
}
