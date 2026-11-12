// ─────────────────────────────────────────────────────────────
// trips/capacity-core.ts — ค่าคงที่ · ผังสถานะ hold/รายการรอ · ฟังก์ชันบริสุทธิ์ของเครื่องยนต์ความจุ · RUN TRIPS T0.4
// ใบสั่ง ledger/trips-briefs/T0.4.md §3.1 · CC §D.3 §D.5
//
// 🔴 บริสุทธิ์: import type เท่านั้น (ข้อสอบ S-5) · ไม่มี I/O · ไม่อ่านนาฬิกาเครื่อง (ผู้เรียกส่ง now)
// 🔴 ไม่มีตัวเลขธุรกิจ — ระยะถือ/เพดานมาจากค่าตั้ง T5 T9 X2 X10 ที่ผู้เรียกส่งเข้า · ค่าคงที่ที่นี่ = ค่าในสัญญาเท่านั้น
// ─────────────────────────────────────────────────────────────
import type { CapacityRowRef, SellActor, SellChannel } from "@/lib/core/sellable";

// ── T0.4 capacity ──
// ───────────────────────── สถานะ ─────────────────────────
export const HOLD_STATUSES = ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];
export const HOLD_PURPOSES = ["PAYMENT", "SHOP_CONFIRM", "AGENT_REQUEST", "SUPPLIER_REQUEST", "WAITLIST_OFFER", "AGENT_HOLD"] as const;
export type HoldPurpose = (typeof HOLD_PURPOSES)[number];
export const WAITLIST_STATUSES = ["WAITING", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** ช่องทางที่ผู้กระทำ PUBLIC ใช้ได้ (ใบสั่ง §2) */
export const PUBLIC_CHANNELS: readonly SellChannel[] = ["WEB", "LIFF", "EMBED", "CHAT_AI"];
/** ช่องทางที่ใช้ตัดสินปิดรับของรายการรอ (ใบสั่ง §3.6 · §11 ข้อ 1(ค)) */
export const WAITLIST_CHANNEL: SellChannel = "WEB";

// ───────────────────────── ค่าในสัญญา (ไม่ใช่ตัวเลขธุรกิจ) ─────────────────────────
/** ตัวกวาดอ่านทีละหน้า (CC §D.4 ข้อ 1) */
export const SWEEP_PAGE_SIZE = 200;
/** 40P01/55P03 ⇒ ลองใหม่สูงสุด (ใบสั่ง §4 ข้อ 4) แล้ว BUSY */
export const LOCK_RETRIES = 3;
/** listAvailability ช่วงวันสูงสุด (รวมวันแรกและวันสุดท้าย) */
export const LIST_SPAN_MAX_DAYS = 62;
/** qty ต่อคำขอ (ใบสั่ง §2) */
export const QTY_MIN = 1;
export const QTY_MAX = 50;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
/** หน้าต่าง rate limit ถือที่สาธารณะ (CC §J.3 · ชั่วโมงละ) */
export const RATE_WINDOW_MS = 3_600_000;

// ───────────────────────── ผังสถานะ ─────────────────────────
const HOLD_NEXT: Readonly<Record<string, readonly string[]>> = { ACTIVE: ["CONVERTED", "EXPIRED", "RELEASED"] };
const WAITLIST_NEXT: Readonly<Record<string, readonly string[]>> = {
  WAITING: ["OFFERED", "CANCELLED", "EXPIRED"],
  OFFERED: ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"],
};

/** ACTIVE → CONVERTED|EXPIRED|RELEASED เท่านั้น · สถานะอื่นจบ */
export function canTransitionHold(from: string, to: string): boolean {
  return (HOLD_NEXT[from] ?? []).includes(to);
}
/** WAITING → OFFERED|CANCELLED|EXPIRED · OFFERED → ACCEPTED|DECLINED|EXPIRED|CANCELLED · ที่เหลือจบ */
export function canTransitionWaitlist(from: string, to: string): boolean {
  return (WAITLIST_NEXT[from] ?? []).includes(to);
}

export function isHoldPurpose(v: unknown): v is HoldPurpose {
  return typeof v === "string" && (HOLD_PURPOSES as readonly string[]).includes(v);
}

// ───────────────────────── ที่ว่าง (R2 · CC §D.3) ─────────────────────────
export type CounterShape = { capacity: number; sold: number; held: number; reserved: number };
/** capacity − sold − held − reserved ตรงตัว — ไม่ clamp (ติดลบ = บั๊กต้องเห็น) · ไม่ปั้น/ไม่ปัด */
export function publicLeftOf(c: CounterShape): number {
  return c.capacity - c.sold - c.held - c.reserved;
}

// ───────────────────────── เวลาหมดของ hold (CC §D.4 ข้อ 3 · แหล่งเดียว M-3) ─────────────────────────
export type HoldDurations = {
  holdMinutes?: number; // T5 trips.sell.holdMinutes — PAYMENT ไม่มีเอเจนซี่
  waitlistHoldMinutes?: number; // T9 trips.sell.waitlistHoldMinutes — WAITLIST_OFFER
  shopConfirmHours?: number; // X2 trips.sell.shopConfirmHours — SHOP_CONFIRM
  agentHoldMinutes?: number; // A16 agency.hold.duration — AGENT_HOLD / PAYMENT ของเอเจนซี่ (A1.x)
  agentRequestHours?: number; // A19 agency.quota.requestResponseHours — AGENT_REQUEST (A1.x)
  supplierHours?: number; // trips.supplier.respondHours (+ shopDecisionHours) — SUPPLIER_REQUEST
};
const positive = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** expiresAt ตาม purpose · ค่าที่ต้องใช้ไม่มี ⇒ null (ผู้เรียกคืน VALIDATION/STATE_CONFLICT) */
export function holdExpiresAt(purpose: string, d: HoldDurations, now: Date): Date | null {
  const at = (ms: number) => new Date(now.getTime() + ms);
  switch (purpose) {
    case "PAYMENT":
      return positive(d.holdMinutes) ? at(d.holdMinutes * MS_PER_MINUTE) : null;
    case "WAITLIST_OFFER":
      return positive(d.waitlistHoldMinutes) ? at(d.waitlistHoldMinutes * MS_PER_MINUTE) : null;
    case "SHOP_CONFIRM":
      return positive(d.shopConfirmHours) ? at(d.shopConfirmHours * MS_PER_HOUR) : null;
    case "AGENT_HOLD":
      return positive(d.agentHoldMinutes) ? at(d.agentHoldMinutes * MS_PER_MINUTE) : null;
    case "AGENT_REQUEST":
      return positive(d.agentRequestHours) ? at(d.agentRequestHours * MS_PER_HOUR) : null;
    case "SUPPLIER_REQUEST":
      return positive(d.supplierHours) ? at(d.supplierHours * MS_PER_HOUR) : null;
    default:
      return null;
  }
}

// ───────────────────────── ลำดับล็อกเฟส 1 (CC §D.5) ─────────────────────────
const LAYER_ORDER: Readonly<Record<string, number>> = { "1a": 0, "1b": 1, "1c": 2 };
/** ลำดับชนิดตาม PRODUCT_KINDS (TRIP, TICKET, HOTEL) จากชื่อตาราง */
function kindIndexOfTable(table: string): number {
  if (table.startsWith("Trip") || table.startsWith("Agent") || table === "CabinAssignment") return 0;
  if (table.startsWith("Ticket")) return 1;
  if (table.startsWith("Hotel")) return 2;
  return 3;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** เรียง (layer, kindIndex, table, sortKey, id) · คืน array ใหม่ (ไม่แก้ของเดิม) */
export function sortCapacityRows(rows: readonly CapacityRowRef[]): CapacityRowRef[] {
  return [...rows].sort(
    (a, b) =>
      (LAYER_ORDER[a.layer] ?? 9) - (LAYER_ORDER[b.layer] ?? 9) ||
      kindIndexOfTable(a.table) - kindIndexOfTable(b.table) ||
      cmp(a.table, b.table) ||
      cmp(a.sortKey, b.sortKey) ||
      cmp(a.id, b.id),
  );
}

// ───────────────────────── คีย์กันซ้ำ (CC §C ข้อ 3 · m-8) ─────────────────────────
/** pub:<basketTokenHash>:<key> · ag:<agentAccountId>:<key> · st:<userId>:<key> · sys:<job>:<key> */
export function idemKeyFor(actor: SellActor, key: string, basketTokenHash?: string): string {
  switch (actor.kind) {
    case "PUBLIC":
      return `pub:${basketTokenHash ?? ""}:${key}`;
    case "AGENT":
      return `ag:${actor.agentAccountId}:${key}`;
    case "STAFF":
      return `st:${actor.userId}:${key}`;
    case "SYSTEM":
      return `sys:${actor.job}:${key}`;
  }
}

/** capKey ของผู้กระทำที่ไม่ใช่สาธารณะ (ใบสั่ง §4 ข้อ 7) — ไม่ถูกนับเพดาน · ไม่ปนกับ basket ใด */
export function ownCapKeyOf(actor: SellActor): string {
  switch (actor.kind) {
    case "PUBLIC":
      return `public:${actor.clientKey}`;
    case "AGENT":
      return `agent:${actor.agentAccountId}`;
    case "STAFF":
      return `st:${actor.userId}`;
    case "SYSTEM":
      return `sys:${actor.job}`;
  }
}
export const waitlistCapKey = (waitlistId: string) => `waitlist:${waitlistId}`;
export const waitlistOfferIdemKey = (waitlistId: string) => `wl:${waitlistId}`;

/** วันรวมปลายทั้งสองของช่วง YYYY-MM-DD (UTC ล้วน) */
export function inclusiveDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / (24 * MS_PER_HOUR)) + 1;
}
// ── /T0.4 capacity ──
