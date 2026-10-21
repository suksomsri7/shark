// offline-client-shared.ts — ตัวช่วยบริสุทธิ์ของฝั่งเครื่อง (POS P3.4U · มติผู้คุม 1–11 · CD-P34U-1…4)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//
// ใช้ร่วม: IndexedDB ของเครื่อง (offline-store) · วงซิงก์/ดึงราคา (use-offline-register) · จอขาย/จอล็อก/หน้ากะ/หน้าตั้งค่า
// 🔴 บริสุทธิ์: ไม่ import prisma / server-only / next/* / node:* / ไฟล์ "use server" · ไม่อ่านนาฬิกาเอง (ผู้เรียกส่ง now) · ไม่สุ่ม
// 🔴 offline-shared.ts (สัญญาของใบ S) ห้ามแก้ — ตัวช่วยใหม่ของใบ U อยู่ไฟล์นี้เท่านั้น
import { OFFLINE_ITEM_KEYS, type OfflineQueueItem, type OfflineSellGateReason, type OfflineSnapshot } from "./offline-shared";

// ═══════════════════ ชื่อฐาน + คีย์ต้องห้าม (มติ 2 · R13) ═══════════════════
/** ฐาน IndexedDB ต่อระบบ POS + สาขา: `shark-pos-off:<systemId>:<unitId>` */
export const OFFLINE_DB_PREFIX = "shark-pos-off";
export function offlineDbName(systemId: string, unitId: string): string {
  return `${OFFLINE_DB_PREFIX}:${systemId}:${unitId}`;
}
/** คีย์ที่ห้ามลง IndexedDB ทุกระดับ (PIN ผู้จัดการ · PIN · 4 หลักท้าย · ต้นทุน · ข้อมูลสมาชิก) — ตัดทิ้งก่อนเขียนเสมอ */
const FORBIDDEN_EXACT = new Set(["managerPin", "managerUserId", "pin", "phoneLast4", "cost", "costSatang", "unitCostSatang", "giftCard"]);
export function offlineForbiddenKey(k: string): boolean {
  return FORBIDDEN_EXACT.has(k) || /^member/i.test(k) || /^cost/i.test(k);
}
/** สำเนาลึกที่ตัดคีย์ต้องห้ามทุกระดับ (array/วัตถุ) — ค่าอื่นคงเดิม · ใช้ก่อนทุกการเขียน IndexedDB */
export function offlineStoreSafe<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x as Record<string, unknown>)) if (!offlineForbiddenKey(k) && val !== undefined) out[k] = walk(val);
      return out;
    }
    return x;
  };
  return walk(v) as T;
}

// ═══════════════════ ระเบียนในเครื่อง ═══════════════════
/** queued = รอส่ง · parked = เซิร์ฟเวอร์ปฏิเสธ "รอผู้จัดการ" (อ่านอย่างเดียว · ไม่ส่งซ้ำ) */
export type OfflineQueueStatus = "queued" | "parked";
/** บิลออฟไลน์ในคิวของเครื่อง (append-only: ไม่มีลบ/ยกเลิกในเครื่อง — ออกจากคิวเมื่อเซิร์ฟเวอร์รับแล้วเท่านั้น) */
export type OfflineQueueRecord = OfflineQueueItem & {
  /** ผู้ใช้ session ที่ขาย (ป้ายระเบียน · แสดงให้คนถัดไปของสาขาเห็น) */
  userId: string;
  deviceId: string;
  status: OfflineQueueStatus;
  reason?: string;
  /** ยอดที่เครื่องคิด (แสดงในรายการ · เซิร์ฟเวอร์คิดซ้ำเสมอ) */
  totalSatang: number;
  tender: "CASH" | "TRANSFER";
  changeSatang: number;
  /** บรรทัดสำหรับพิมพ์สลิปซ้ำ (ชื่อ · จำนวน · ราคา — ไม่มีต้นทุน) */
  slipLines: OfflineSlipLine[];
  cashierName?: string;
};
export type OfflineSlipLine = { name: string; qty: number; unitPriceSatang: number; discountSatang: number; lineTotalSatang: number; options: string[]; weightGrams?: number };
/** บิลที่ซิงก์แล้ว (OK/DUPLICATE) — เก็บเลขจริงไว้พิมพ์ซ้ำ/แสดง "เลขจริง" (ไม่ใช่คิว · ไม่นับในป้ายรอซิงก์) */
export type OfflineSyncedRecord = { offlineRef: string; idempotencyKey: string; saleId: string | null; receiptNo: string | null; soldAt: string; syncedAt: string; totalSatang: number };
/** snapshot ของเครื่องที่เก็บ (ผูกผู้ใช้ session · ผู้ใช้อื่นเปิดหน้า = ล้าง) */
export type OfflineSnapshotRecord = { userId: string; deviceId: string; fetchedAt: string; snapshot: OfflineSnapshot };
/** ตัวตรวจ PIN ออฟไลน์ (มติ 8) — PBKDF2-SHA256 · เกลือต่อเครื่อง · เขียนเฉพาะตอนปลดล็อกออนไลน์ของเจ้าของโทเคน · ไม่มีตัว PIN */
export type OfflineUnlockRecord = { userId: string; hash: string; iterations: number; fails: number };

/** รายการที่ส่งไป /api/pos/sync — เฉพาะคีย์ของสัญญา (OFFLINE_ITEM_KEYS) · คีย์อื่น = เซิร์ฟเวอร์ปฏิเสธทั้งชุด */
export function offlineSyncItemOf(r: OfflineQueueRecord): OfflineQueueItem {
  const src = r as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of OFFLINE_ITEM_KEYS) if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  return out as unknown as OfflineQueueItem;
}

// ═══════════════════ จังหวะ (มติ 5 8) ═══════════════════
/** รอบวงซิงก์ (มติ 5: 30 วิ) */
export const OFFLINE_SYNC_INTERVAL_MS = 30_000;
/** ดึง snapshot ใหม่ทุก 15 นาทีขณะออนไลน์ (มติ 8) */
export const OFFLINE_SNAPSHOT_REFRESH_MS = 900_000;
/** หน่วงหลังขอบ priceValidUntil ก่อนดึงใหม่ (กันนาฬิกาเครื่องเร็ว) — ขั้นต่ำ 15 วิ */
export const OFFLINE_EDGE_MIN_WAIT_MS = 15_000;
/** ถอยเวลาเมื่อเครือข่ายล้ม / 5xx / BUSY / RATE_LIMITED: 30 วิ × 2^(n−1) เพดาน 5 นาที · 0 ครั้ง = 0 */
export function offlineBackoffMs(failures: number): number {
  if (!Number.isInteger(failures) || failures <= 0) return 0;
  return Math.min(30_000 * 2 ** Math.min(failures - 1, 10), 300_000);
}
/** ตัวตรวจ PIN ออฟไลน์ (มติ 8): ≥ 310k รอบ · ผิด 5 ครั้ง = ล็อกจนออนไลน์ */
export const OFFLINE_UNLOCK_ITERATIONS = 310_000;
export const OFFLINE_UNLOCK_MAX_FAILS = 5;
export function offlineUnlockLocked(r: OfflineUnlockRecord | null | undefined): boolean {
  return !!r && r.fails >= OFFLINE_UNLOCK_MAX_FAILS;
}

// ═══════════════════ จอ (19ง · มติ 3 6) ═══════════════════
/** ชิป "ใช้ได้เมื่อออนไลน์" ของ 19ง (แต้ม · คูปอง · บัตร · พร้อมเพย์) */
export const OFFLINE_CHIPS = ["points", "coupon", "card", "promptpay"] as const;
export type OfflineChip = (typeof OFFLINE_CHIPS)[number];
/** เหตุผลที่ขายออฟไลน์ไม่ได้ (offlineSellGate) → คีย์ใต้ pos.register */
export function offlineGateMessageKey(reason: OfflineSellGateReason): string {
  const k: Record<OfflineSellGateReason, string> = {
    DISABLED: "offline.gate.disabled",
    DEVICE_INACTIVE: "offline.gate.deviceInactive",
    NO_SNAPSHOT: "offline.gate.noSnapshot",
    CLOCK_INVALID: "offline.gate.clockInvalid",
    SNAPSHOT_TOO_OLD: "offline.gate.snapshotTooOld",
    PRICES_EXPIRED: "offline.gate.pricesExpired",
    QUEUE_FULL: "offline.gate.queueFull",
  };
  return k[reason] ?? "offline.gate.disabled";
}
/** มติ 6: ปิดกะที่เครื่องนี้ไม่ได้ขณะคิวในเครื่อง > 0 */
export function offlineCloseBlocked(queueCount: number): boolean {
  return Number.isInteger(queueCount) && queueCount > 0;
}
/** เงินทอน (สตางค์) — รับน้อยกว่ายอด = null (ยังรับไม่ครบ) */
export function offlineChangeSatang(totalSatang: number, receivedSatang: number): number | null {
  if (!Number.isInteger(totalSatang) || !Number.isInteger(receivedSatang) || totalSatang < 0 || receivedSatang < totalSatang) return null;
  return receivedSatang - totalSatang;
}
/** ปุ่มรับเงินด่วน: ยอดพอดี + ธนบัตรถัดไป (20/50/100/500/1000 บาท) ที่ ≥ ยอด — ไม่ซ้ำ เรียงน้อยไปมาก สูงสุด 4 ปุ่ม */
export function offlineQuickCash(totalSatang: number): number[] {
  if (!Number.isInteger(totalSatang) || totalSatang <= 0) return [];
  const out = new Set<number>([totalSatang]);
  for (const note of [2000, 5000, 10_000, 50_000, 100_000]) {
    const up = Math.ceil(totalSatang / note) * note;
    if (up > totalSatang) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

// ═══════════════════ คิวผู้จัดการ (CD-P34U-4 · N10) ═══════════════════
/** N10: แถว SHIFT_CLOSED ที่ซิงก์หลังเวลาขาย (createdAt > soldAt) = "ซิงก์หลังเครื่องปิดกะ" — จากฟิลด์เดิมเท่านั้น */
export function offlineSyncedAfterClose(row: { reason: string | null; soldAt: string; createdAt: string }): boolean {
  if (row.reason !== "SHIFT_CLOSED") return false;
  const s = Date.parse(row.soldAt);
  const c = Date.parse(row.createdAt);
  return Number.isFinite(s) && Number.isFinite(c) && c > s;
}
/** เหตุผลทิ้งบิลต้องยาว ≥ 5 ตัวอักษร (ตรงกับ discardOfflineSale) */
export const OFFLINE_DISCARD_REASON_MIN = 5;
export function offlineDiscardReasonOk(reason: string): boolean {
  return typeof reason === "string" && reason.trim().length >= OFFLINE_DISCARD_REASON_MIN && reason.trim().length <= 500;
}
