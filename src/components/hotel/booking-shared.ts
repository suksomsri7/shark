// SVC H.3 ▸ ของใช้ร่วมของจอจอง V2 (รายการ · รายละเอียด · วิซาร์ด · รับมัดจำ · ใบสั่ง h.3 §4) — pure ล้วน (ไม่มี directive · import type เท่านั้น)
//   วันที่จากสตริง "YYYY-MM-DD" · เวลา (นับถอยหลัง) รับ now จากผู้เรียก · เงินเป็นสตางค์ Int · ข้อความไทยทั้งหมด
import type { BookingDetail, BookingListRow } from "@/lib/modules/hotel";

export type { BookingDetail, BookingListRow };

/** ผลของ action จอง (ข้อมูล ไม่ throw) */
export type BookingActionResult = { ok: boolean; code?: string; reason?: string; [k: string]: unknown };
export type BookingAction = (input: unknown) => Promise<BookingActionResult>;
export type DepositSubmit = (input: { payType: string; reference: string | null }) => Promise<BookingActionResult>;
export type ResultHandler = (r: BookingActionResult) => void;
export type VoidHandler = () => void;
export type Runner = () => Promise<BookingActionResult>;

/** ป้ายสถานะ (ไทย) */
export const STATUS_TH: Record<string, string> = {
  HOLD: "ถือไว้รอมัดจำ",
  CONFIRMED: "ยืนยัน",
  CHECKED_IN: "เข้าพัก",
  CHECKED_OUT: "ออกแล้ว",
  NO_SHOW: "ไม่มา",
  CANCELLED: "ยกเลิก",
  BOOKED: "ยืนยัน (ระบบเดิม)",
  REFUNDED: "คืนเงินแล้ว",
};
export const STATUS_FILTERS: { value: string; labelTh: string }[] = [
  { value: "", labelTh: "ทุกสถานะ" },
  { value: "HOLD", labelTh: STATUS_TH.HOLD },
  { value: "CONFIRMED", labelTh: STATUS_TH.CONFIRMED },
  { value: "CHECKED_IN", labelTh: STATUS_TH.CHECKED_IN },
  { value: "CHECKED_OUT", labelTh: STATUS_TH.CHECKED_OUT },
  { value: "NO_SHOW", labelTh: STATUS_TH.NO_SHOW },
  { value: "CANCELLED", labelTh: STATUS_TH.CANCELLED },
];
/** สีป้ายสถานะ */
export function statusToneClass(status: string): string {
  if (status === "HOLD") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "CONFIRMED" || status === "BOOKED") return "bg-sky-50 text-sky-800 border-sky-200";
  if (status === "CHECKED_IN") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "NO_SHOW" || status === "CANCELLED" || status === "REFUNDED") return "bg-rose-50 text-rose-800 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

/** ป้ายแหล่งที่มา (ไทย) */
export const SOURCE_TH: Record<string, string> = {
  WEB: "หน้าเว็บ",
  WALK_IN: "เดินเข้ามา",
  PHONE: "โทรศัพท์",
  LINE: "ไลน์ (LINE)",
  OTA: "ช่องทางออนไลน์ (OTA)",
};
export const SOURCE_FILTERS: { value: string; labelTh: string }[] = [{ value: "", labelTh: "ทุกแหล่ง" }, ...Object.entries(SOURCE_TH).map(([value, labelTh]) => ({ value, labelTh }))];
/** แหล่งที่พนักงานเลือกได้ในวิซาร์ด (หน้าเคาน์เตอร์ · มติ 12) */
export const COUNTER_SOURCES = ["WALK_IN", "PHONE", "LINE", "WEB", "OTA"] as const;

/** วิธีรับมัดจำ (เงินจริงเท่านั้น · ตรงกับ POS DEPOSIT_PAY_TYPES) */
export const PAY_TYPES: { value: "CASH" | "PROMPTPAY" | "TRANSFER" | "CARD"; labelTh: string }[] = [
  { value: "CASH", labelTh: "เงินสด" },
  { value: "PROMPTPAY", labelTh: "พร้อมเพย์ (QR)" },
  { value: "TRANSFER", labelTh: "โอนเงิน" },
  { value: "CARD", labelTh: "บัตร" },
];
/** ตัวเลือกขั้น 3 ของวิซาร์ด: รับมัดจำทันที (4 แบบ) หรือ «รอโอน» (ถือห้องตาม holdMinutesCounter) */
export const DEPOSIT_CHOICES: { value: string; labelTh: string }[] = [...PAY_TYPES, { value: "WAIT_TRANSFER", labelTh: "รอโอน (ถือห้องไว้ก่อน)" }];

/** นโยบายไม่มาเข้าพัก (ป้ายไทย) */
export const NO_SHOW_TH: Record<string, string> = {
  FORFEIT_RELEASE_AFTER_AUDIT: "ริบมัดจำ แล้วปล่อยห้อง",
  FORFEIT_HOLD_STAY: "ริบมัดจำ และถือห้องไว้ต่อ",
  REFUND_RELEASE: "คืนมัดจำเต็ม แล้วปล่อยห้อง",
};

/** ป้ายประวัติ (action ของ AuditLog) */
export const HISTORY_TH: Record<string, string> = {
  "hotel.booking.created": "สร้างการจอง",
  "hotel.booking.confirmed": "ยืนยันการจอง",
  "hotel.booking.deposit": "รับมัดจำ",
  "hotel.booking.cancelled": "ยกเลิก",
  "hotel.booking.hold_expired": "หมดเวลาถือห้อง",
  "hotel.booking.no_show": "ตั้งไม่มา",
  "hotel.booking.no_show_undo": "ย้อนสถานะไม่มา",
  "hotel.booking.extended": "ต่อคืน",
  "hotel.booking.shortened": "ย่นคืน",
  "hotel.booking.room_assigned": "กำหนดห้อง",
  "hotel.booking.rescheduled": "เลื่อน/ย้าย",
  "hotel.booking.deposit_after_expiry": "รับมัดจำหลังหมดเวลา (คืนเงินอัตโนมัติ)",
};
export const PRICE_SOURCE_TH: Record<string, string> = { RATE: "ตามตารางราคา", OVERRIDE: "แก้มือ", FALLBACK: "ราคาฐาน", MANUAL: "กำหนดเอง" };

// ───────── เงิน · วันที่ ─────────
const comma = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** สตางค์ ⇒ "1,290" หรือ "1,290.50" */
export function moneyTh(satang: number): string {
  const n = Math.round(Number.isFinite(satang) ? satang : 0);
  const a = Math.abs(n);
  const st = a % 100;
  return `${n < 0 ? "-" : ""}${comma(Math.floor(a / 100))}${st ? `.${String(st).padStart(2, "0")}` : ""}`;
}
/** "1,290" (บาท) ⇒ สตางค์ · ผิดรูป ⇒ null */
export function parseBahtToSatang(s: string): number | null {
  const t = s.replace(/[,\s฿]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [b, f = ""] = t.split(".");
  return Number(b) * 100 + Number(f.padEnd(2, "0"));
}
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isYmdStr = (s: unknown): s is string => typeof s === "string" && YMD.test(s);
/** "2026-11-07" ⇒ "7 พ.ย." (withYear ⇒ "7 พ.ย. 69") */
export function dateTh(ymd: string, withYear = false): string {
  const m = YMD.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""}${withYear ? ` ${String(Number(m[1]) + 543).slice(-2)}` : ""}`;
}
/** จำนวนวันระหว่างสองวัน (UTC ล้วน) */
export function daysBetween(from: string, to: string): number {
  if (!isYmdStr(from) || !isYmdStr(to)) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
export function addDaysStr(ymd: string, n: number): string {
  if (!isYmdStr(ymd)) return ymd;
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
export const stayTh = (checkIn: string, checkOut: string): string => `${dateTh(checkIn)} – ${dateTh(checkOut)} (${daysBetween(checkIn, checkOut)} คืน)`;

/**
 * ป้าย HOLD — รอมัดจำ = นับถอยหลัง · รออนุมัติ (MANUAL_APPROVE · m-4 ผู้ตรวจรอบ 1) = "รอโรงแรมยืนยัน · ถือห้องถึง <เวลา>"
 * holdExpiresAt (ISO) เทียบ nowMs
 */
export function countdownTh(holdExpiresAt: string | null, nowMs: number, holdKind: "DEPOSIT" | "APPROVAL" | null = "DEPOSIT"): string {
  if (holdKind === "APPROVAL") return holdExpiresAt ? `รอโรงแรมยืนยัน · ถือห้องถึง ${dateTimeTh(holdExpiresAt)}` : "รอโรงแรมยืนยัน";
  if (!holdExpiresAt) return "รอผู้จัดการยืนยัน";
  const left = Date.parse(holdExpiresAt) - nowMs;
  if (!Number.isFinite(left)) return "";
  if (left <= 0) return "หมดเวลาถือห้องแล้ว";
  const min = Math.ceil(left / 60_000);
  if (min < 60) return `เหลืออีก ${min} นาที`;
  const h = Math.floor(min / 60);
  if (h < 48) return `เหลืออีก ${h} ชม. ${min % 60} นาที`;
  return `เหลืออีก ${Math.floor(h / 24)} วัน`;
}

/** ขั้นวิซาร์ดจาก query (1|2|3 เท่านั้น) */
export function wizardStepOf(v: unknown): 1 | 2 | 3 {
  const n = Math.min(3, Math.max(1, Math.trunc(Number(v) || 1)));
  return n === 3 ? 3 : n === 2 ? 2 : 1;
}
/** จำนวนห้องจาก query (1–10) */
export const roomsCountOf = (v: unknown): number => Math.min(10, Math.max(1, Math.trunc(Number(v) || 1)));

/** ป้ายกลุ่ม */
export const groupTh = (n: number): string => (n > 1 ? `กลุ่ม ${n} ห้อง` : "");

/** ข้อมูลประเภทห้องของวิซาร์ด (หน้าเตรียมจากฝั่งเซิร์ฟเวอร์) */
export type WizardRoomType = { id: string; name: string; maxOccupancy: number | null; baseOccupancy: number; extraBedAllowed: boolean; available: number; total: number; priceSatang: number | null; priceNote: string | null };
export type WizardPlan = { id: string; name: string; isDefault: boolean };
export type WizardModel = {
  unitSlug: string;
  today: string;
  checkIn: string;
  checkOut: string;
  roomTypeId: string;
  rooms: number;
  step: 1 | 2 | 3;
  roomTypes: WizardRoomType[];
  plans: WizardPlan[];
};

/** ข้อความหลังทำรายการสำเร็จ (จอรายละเอียด) */
export const DONE_TH: Record<string, string> = {
  confirm: "ยืนยันการจองแล้ว",
  deposit: "รับมัดจำแล้ว",
  cancel: "ยกเลิกการจองแล้ว",
  cancelGroup: "ยกเลิกทั้งกลุ่มแล้ว",
  extend: "ต่อคืนแล้ว",
  shorten: "ย่นคืนแล้ว",
  assign: "กำหนดห้องแล้ว",
  noShow: "บันทึกไม่มาแล้ว",
  undo: "ย้อนสถานะเป็นยืนยันแล้ว",
};
export type DetailTab = "guest" | "rooms" | "money" | "history";
export const DETAIL_TABS: { key: DetailTab; labelTh: string }[] = [
  { key: "guest", labelTh: "แขก" },
  { key: "rooms", labelTh: "ห้องและคืน" },
  { key: "money", labelTh: "เงิน" },
  { key: "history", labelTh: "ประวัติ" },
];
/** เวลาไทย "7 พ.ย. 14:05" จาก ISO */
export function dateTimeTh(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3_600_000).toISOString();
  return `${dateTh(d.slice(0, 10))} ${d.slice(11, 16)}`;
}
/** ขั้นบันไดคืนเงิน ⇒ ข้อความไทย */
export function cancelRulesTh(rules: { daysBefore: number; refundBp: number }[]): string {
  if (!rules.length) return "ไม่คืนเงิน";
  return [...rules]
    .sort((a, b) => b.daysBefore - a.daysBefore)
    .map((r) => (r.daysBefore === 0 ? `วันเข้าพัก คืน ${r.refundBp / 100}%` : `ก่อน ${r.daysBefore} วัน คืน ${r.refundBp / 100}%`))
    .join(" · ");
}
export type DetailActions = {
  confirm: BookingAction;
  cancel: BookingAction;
  extend: BookingAction;
  quoteExtend: BookingAction;
  shorten: BookingAction;
  assign: BookingAction;
  noShow: BookingAction;
  undo: BookingAction;
  takeDeposit: BookingAction;
};
export type AssignableRoom = { id: string; number: string; roomTypeId: string; roomTypeName: string; sameType: boolean };
export type DetailPerms = { canManage: boolean; canCancel: boolean; isManager: boolean };
