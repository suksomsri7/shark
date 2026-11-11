// kds-shared.ts — จอครัว (KDS) ส่วนบริสุทธิ์ · POS P2.6 S (R1 R5 R7 R8 R14 R16 · CD 2 5 · มติผู้คุมงาน 9 · names table แถว 11)
//
// 🔴 ไฟล์นี้ client component (จอ 04 · P2.6U) import ได้ — ห้าม import ค่าจาก prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ · ไม่มี `node:` (import type ได้)
//    ฝั่งเซิร์ฟเวอร์ = kds.ts · action = kds-actions.ts ("use server") · ตัวเรนเดอร์ใบครัว = kitchen-slip-render.ts
// 🔴 ตั๋วครัว = (RestaurantOrder, สถานี) — สถานะคิดจาก kdsStatus ของรายการ (ไม่มีคอลัมน์สถานะตั๋ว · CD2)
// 🔴 เวลาเป็น ms · นาฬิกาฉีดเข้า (nowMs) — ไม่มี Date.now() ในไฟล์นี้ (T2) · ทุกฟังก์ชันไม่แก้อินพุต

// ═══════════ ค่าคงที่ ═══════════
/** สถานะตั๋ว (ลำดับ = ลำดับคอลัมน์ · SERVED = หลุดบอร์ด นับใน "เสิร์ฟแล้ววันนี้") */
export const KDS_TICKET_STATES = ["NEW", "COOKING", "READY", "SERVED"] as const;
export type KdsTicketState = (typeof KDS_TICKET_STATES)[number];
/** คอลัมน์บนบอร์ด (SERVED ไม่อยู่บนบอร์ด) */
export const KDS_COLUMNS = ["NEW", "COOKING", "READY"] as const;
export type KdsColumn = (typeof KDS_COLUMNS)[number];
/** แหล่งของตั๋ว (R1): โต๊ะ (พนักงานส่งรอบ) · QR (ลูกค้าสั่งเอง) · หน้าขาย (ซื้อกลับ) · ออนไลน์ (P2.8) · หน้าเดิม (TAKEAWAY/PICKUP ของหน้าร้านอาหารเดิม) */
export const KDS_SOURCES = ["TABLE", "QR", "REGISTER", "ONLINE", "LEGACY"] as const;
export type KdsSource = (typeof KDS_SOURCES)[number];
/** เตือน "เหลือ 2 นาทีก่อนเลยเป้า" (CD5 · ไม่ใช่ kdsWarnMins ของจอเดิม) */
export const KDS_WARN_SEC = 120;
/** รอบ poll ของจอ (R7 · ไม่มี realtime ใหม่) */
export const KDS_POLL_MS = 6_000;
/** heal ตั๋วหน้าขายที่หลุด (R3 · มติ 3): บิลย้อนหลังไม่เกิน 12 ชม. · ≤ 20 บิลต่อครั้ง */
export const KDS_HEAL_WINDOW_MS = 12 * 3_600_000;
export const KDS_HEAL_MAX = 20;
/** "ค้างทำวันนี้" แสดง 8 ชื่อแรก (R7) */
export const KDS_PENDING_TOP = 8;
/** สถานี "รวมเสิร์ฟ (Expo)" — ค่าพิเศษของ stationId (R7) */
export const KDS_EXPO = "expo";
/** เหตุผลยกเลิกรายการครัวเมื่อออเดอร์/บิลถูกยกเลิก (R11 R12 · CD 18) */
export const KDS_CANCEL_REASON_ORDER = "ออเดอร์ถูกยกเลิก";
export const KDS_CANCEL_REASON_SALE = "บิลถูกยกเลิก";
/** ป้ายใบพิมพ์ซ้ำ (R14 · CD 13 14) */
export const KITCHEN_SLIP_COPY_LABEL = { th: "พิมพ์ซ้ำ", en: "REPRINT" } as const;
/** เพดาน autoAcceptMaxOpen (R13) */
export const KDS_AUTO_ACCEPT_MAX = 99;

// ═══════════ รหัสปฏิเสธ (R16) ═══════════
/** รหัสใหม่ของ P2.6 */
export const KDS_NEW_CODES = ["TICKET_NOT_FOUND", "TICKET_TOO_OLD", "KDS_STATION_NOT_FOUND", "TICKET_VOIDED"] as const; // fix2 N4: + TICKET_VOIDED
/** ทุกรหัสที่ฟังก์ชัน KDS / 86 คืนได้ (ใหม่ + ใช้ซ้ำ) */
export const KDS_REFUSAL_CODES = [
  "TICKET_NOT_FOUND",
  "TICKET_TOO_OLD",
  "KDS_STATION_NOT_FOUND",
  "TICKET_VOIDED", // fix2 N4: ดึงกลับตั๋วของบิล/ออเดอร์ที่ถูกยกเลิก
  "VALIDATION",
  "PERMISSION_DENIED",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_UNAVAILABLE",
  "CHANNEL_PAUSED",
  "INTERNAL",
] as const;
export type KdsRefusalCode = (typeof KDS_REFUSAL_CODES)[number];
export type KdsRefusal = { ok: false; code: KdsRefusalCode; message: string };

/** รหัส → คีย์ข้อความใต้ namespace `pos.kds` (`errors.<camelCase>`) · รหัสที่ไม่รู้จัก = `errors.unknown` (CD 20) */
export function kdsRefusalMessageKey(code: string): string {
  if (!(KDS_REFUSAL_CODES as readonly string[]).includes(code)) return "errors.unknown";
  return "errors." + code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ═══════════ สถานะ · แหล่ง (R1 R5) ═══════════
/**
 * สถานะตั๋วจาก kdsStatus ของรายการ (R5): ไม่นับ CANCELLED · ไม่มีรายการที่ยังมีผล = null (ไม่มีตั๋ว) ·
 * ทุกรายการ SERVED = SERVED · ทุกรายการ ≥ READY = READY · ทุกรายการ NEW = NEW · อื่น ๆ = COOKING
 */
export function ticketStateOf(statuses: readonly string[]): KdsTicketState | null {
  const live = statuses.filter((s) => s !== "CANCELLED");
  if (!live.length) return null;
  if (live.every((s) => s === "SERVED")) return "SERVED";
  if (live.every((s) => s === "READY" || s === "SERVED")) return "READY";
  if (live.every((s) => s === "NEW")) return "NEW";
  return "COOKING";
}

/** แหล่งของรอบ (R1): ONLINE > REGISTER > TABLE (session + พนักงาน) > QR (session) > LEGACY */
export function ticketSourceOf(r: { sessionId?: string | null; placedByUserId?: string | null; posSaleId?: string | null; posOrderId?: string | null }): KdsSource {
  if (r.posOrderId) return "ONLINE";
  if (r.posSaleId) return "REGISTER";
  if (r.sessionId && r.placedByUserId) return "TABLE";
  if (r.sessionId) return "QR";
  return "LEGACY";
}

// ═══════════ เวลา (R8 · CD5 · มติ 9) ═══════════
/** เป้าเวลา (นาที): เวลาเตรียมของออเดอร์ออนไลน์ → prepMinutes สูงสุดของเมนูในตั๋ว → kdsCriticalMins ของร้าน */
export function ticketTargetMinutes(i: { roundTargetMinutes: number | null | undefined; prepMinutes: readonly (number | null | undefined)[]; criticalMins: number }): number {
  if (typeof i.roundTargetMinutes === "number" && i.roundTargetMinutes > 0) return i.roundTargetMinutes;
  const preps = i.prepMinutes.filter((x): x is number => typeof x === "number" && x > 0);
  if (preps.length) return Math.max(...preps);
  return i.criticalMins;
}

export type KdsTimer = { elapsedSec: number; remainingSec: number; warn: boolean; late: boolean };
/** ตัวจับเวลา: elapsed = floor(วินาที) · remaining = เป้า·60 − elapsed · late = elapsed ≥ เป้า · warn = ยังไม่เลย และเหลือ ≤ 120 วิ */
export function ticketTimer(i: { sentAtMs: number; targetMinutes: number; nowMs: number }): KdsTimer {
  const elapsedSec = Math.max(0, Math.floor((i.nowMs - i.sentAtMs) / 1000));
  const remainingSec = i.targetMinutes * 60 - elapsedSec;
  const late = elapsedSec >= i.targetMinutes * 60;
  return { elapsedSec, remainingSec, warn: !late && remainingSec <= KDS_WARN_SEC, late };
}

/** เวลาเฉลี่ยจนพร้อม (นาที · floor ของค่าเฉลี่ย · ไม่มีตั๋ว = 0) */
export function avgReadyMinutes(pairs: readonly { sentAtMs: number; readyAtMs: number }[]): number {
  if (!pairs.length) return 0;
  const total = pairs.reduce((t, p) => t + (p.readyAtMs - p.sentAtMs) / 60_000, 0);
  return Math.floor(total / pairs.length);
}

// ═══════════ ลำดับคอลัมน์ (R7) ═══════════
export type KdsSortable = { id: string; isRush: boolean; sentAtMs: number; remainingSec: number; readyAtMs: number | null };
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * ใหม่ = ส่งก่อนก่อน (ไม่เรียงตามเร่ง · CD 15) · กำลังทำ = เร่งก่อน แล้วเวลาที่เหลือก่อนเลยเป้าน้อยก่อน · พร้อม = พร้อมก่อนก่อน ·
 * เสมอกัน = id · คืนอาร์เรย์ใหม่ (ไม่แก้อินพุต)
 */
export function sortColumn<T extends KdsSortable>(col: KdsColumn | string, tickets: readonly T[]): T[] {
  const arr = [...tickets];
  if (col === "COOKING") arr.sort((a, b) => Number(b.isRush) - Number(a.isRush) || a.remainingSec - b.remainingSec || byId(a.id, b.id));
  else if (col === "READY") arr.sort((a, b) => (a.readyAtMs ?? 0) - (b.readyAtMs ?? 0) || byId(a.id, b.id));
  else arr.sort((a, b) => a.sentAtMs - b.sentAtMs || byId(a.id, b.id));
  return arr;
}

// ═══════════ สัญญาข้อมูลของจอ 04 (P2.6U อ่าน) ═══════════
export type KdsLine = { itemId: string; qty: number; name: string; options: string[]; note: string | null; done: boolean; cancelled: boolean };
export type KdsTicket = {
  orderId: string;
  stationId: string;
  /** เลขรอบรายวัน (dailyNo) — "#16" */
  no: number;
  source: KdsSource;
  /** โต๊ะ/QR = ชื่อโต๊ะ · ออนไลน์ = "ชื่อช่องทาง · เลขอ้างอิง" · หน้าขาย/หน้าเดิม = "" (จอประกอบ "ซื้อกลับ · คิว N" จากข้อความเอง) */
  label: string;
  channelCode?: string | null;
  isRush: boolean;
  state: KdsTicketState;
  /** เวลาส่งเข้าครัว (createdAt ของรอบ · ISO) */
  sentAt: string;
  elapsedSec: number;
  targetMinutes: number;
  remainingSec: number;
  late: boolean;
  warn: boolean;
  lines: KdsLine[];
  doneCount: number;
  lineCount: number;
  staffName?: string | null;
  /** หน้าขาย: คิว N (= dailyNo) */
  queueNo?: number | null;
  /** max(readyAt) ของรายการ (ISO) — ตั๋วที่ยังไม่พร้อม = null */
  readyAt?: string | null;
  externalRef?: string | null;
};
export type KdsStationTab = { id: string; name: string; nameEn: string | null; openCount: number };
export type KdsEightySix = { productId: string; name: string; at: string; source: "KDS" | "STOCK" | "MANUAL" };
/** P2.6U ▸ fix1 F1: สินค้าที่เข้าครัวของสาขา (แผ่น 86) — เมนูของสาขา + สินค้าที่ผูกสถานี (ของตัวเอง/ของแม่) · available = availabilityFor · ไม่มีเงิน ◂ */
export type KdsKitchenProduct = { productId: string; name: string; nameEn: string | null; stationId: string; available: boolean; mark: { source: "KDS" | "STOCK" | "MANUAL"; at: string } | null };
export type KdsKitchenProductsResult = { ok: true; items: KdsKitchenProduct[] } | KdsRefusal;
export type KdsStationsResult = { ok: true; stations: { id: string; name: string; nameEn: string | null }[] } | KdsRefusal;
export type KdsBoard = {
  ok: true;
  stations: KdsStationTab[];
  tickets: KdsTicket[];
  /** P2.6U ▸ มติ 7: last + orderId/stationId (ตั๋วที่จะดึงกลับจากแถบ "เสิร์ฟแล้ววันนี้" — kdsRecall ต้องใช้ · เพิ่มอย่างเดียว) ◂ */
  servedToday: { count: number; last: { no: number; label: string; source: KdsSource; at: string; orderId?: string; stationId?: string } | null };
  pending: { name: string; qty: number }[];
  avgMinutes: number;
  targetMinutes: number;
  paused: boolean;
  pausedNote: string | null;
  eightySix: KdsEightySix[];
  serverNow: string;
};
export type KdsBoardResult = KdsBoard | KdsRefusal;
export type KdsActionResult = { ok: true; changed: number } | KdsRefusal;
export type KdsRushResult = { ok: true; rush: boolean } | KdsRefusal;
export type KitchenSlipLine = { qty: number; name: string; options: string[]; note: string | null };
export type KitchenSlip = {
  stationName: string;
  no: number;
  source: KdsSource;
  sourceLabel: string;
  channelName: string | null;
  externalRef: string | null;
  /** ISO */
  sentAt: string;
  staffName: string | null;
  lines: KitchenSlipLine[];
  copy: boolean;
  printLocale: "th" | "en";
};
export type KitchenSlipResult = { ok: true; slips: KitchenSlip[] } | KdsRefusal;
export type KitchenProgressResult = { ok: true; progress: { orderId: string; done: number; total: number }[] } | KdsRefusal;
export type KdsAutoAcceptResult = { ok: true; maxOpen: number | null } | KdsRefusal;
/** POS P5.2 ▸ D11: พักครัวจากจอครัวของ POS ◂ */
export type KdsKitchenPauseResult = { ok: true; paused: boolean } | KdsRefusal;
export const KDS_PAUSE_NOTE_MAX = 200;
export type KitchenBacklogRow = { stationId: string; open: number };
export type TicketForSaleResult = { ok: true; orderId: string | null; created: boolean; reason?: string };
export type HealResult = { ok: true; healed: number };
/** 86 (R9 · CD 11) */
export const AVAILABILITY_SOURCES = ["KDS", "STOCK", "MANUAL"] as const;
export type AvailabilitySource = (typeof AVAILABILITY_SOURCES)[number];
export type SetAvailabilityInput = { productId: string; unitId: string; available: boolean; source: "KDS" | "MANUAL"; note?: string | null; resetCounter?: boolean };
export type SetAvailabilityResult = { ok: true; changed: boolean; available: boolean } | KdsRefusal;
