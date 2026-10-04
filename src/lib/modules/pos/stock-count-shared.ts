// POS P1.14 ▸ ตรวจนับสต็อกจากหน้าขาย — ส่วนบริสุทธิ์ (ไม่ import db/prisma · ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ) ◂
// สัญญา: ledger/pos-briefs/pos-brief-P1.14.md (R2 R11 R14 R15) · ผู้เขียนตาราง = stock-count.ts เท่านั้น

/** รหัสคำปฏิเสธ (R15) — ทุกฟังก์ชันของ stock-count.ts คืน {ok:false, code, message} ไม่ throw */
export const STOCK_COUNT_REFUSAL_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "PERMISSION_DENIED",
  "NO_INVENTORY",
  "COUNT_ALREADY_OPEN",
  "COUNT_NOT_OPEN",
  "UNKNOWN_CODE",
  "NOT_IN_COUNT",
  "NOT_STOCKED",
  "NOTHING_COUNTED",
  "IDEMPOTENCY_CONFLICT",
  "STOCK_BUSY",
  "INTERNAL",
] as const;
export type StockCountRefusalCode = (typeof STOCK_COUNT_REFUSAL_CODES)[number];

/** ข้อความ th/en ต่อรหัส (en ไม่มีอักษรไทย) — message ของคำปฏิเสธ = th · ข้อความหน้าจอ pos.stockCount.* เป็นของใบ U */
export const STOCK_COUNT_MESSAGES: Record<StockCountRefusalCode, { th: string; en: string }> = {
  VALIDATION: { th: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร", en: "The request is not valid. Nothing was saved." },
  NOT_FOUND: { th: "ไม่พบรอบตรวจนับ สินค้า หรือที่เก็บนี้ในสาขานี้", en: "This count, item or location was not found for this branch." },
  PERMISSION_DENIED: { th: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน", en: "This account is not allowed to do this. Ask the shop owner for access." },
  NO_INVENTORY: { th: "สาขานี้ยังไม่ได้ผูกระบบคลังสินค้า — ผูกระบบคลังก่อนจึงจะนับหรือปรับสต็อกได้", en: "This branch has no inventory system linked. Link one before counting or changing stock." },
  COUNT_ALREADY_OPEN: { th: "ที่เก็บนี้มีรอบตรวจนับที่เปิดอยู่แล้ว — ทำรอบนั้นให้เสร็จหรือยกเลิกก่อน", en: "This location already has an open count. Finish or cancel it first." },
  COUNT_NOT_OPEN: { th: "รอบตรวจนับนี้ยืนยันหรือยกเลิกไปแล้ว — แก้ไขไม่ได้", en: "This count is already confirmed or cancelled and cannot be changed." },
  UNKNOWN_CODE: { th: "ไม่พบสินค้าของรหัสนี้ในคลังของสาขา", en: "No item in this branch inventory matches this code." },
  NOT_IN_COUNT: { th: "สินค้านี้ไม่อยู่ในรอบตรวจนับนี้", en: "This item is not part of this count." },
  NOT_STOCKED: { th: "สินค้านี้ไม่มีสต็อก (บริการหรือเลิกขายแล้ว)", en: "This item has no stock (a service or an archived item)." },
  NOTHING_COUNTED: { th: "ยังไม่ได้นับสินค้าในรอบนี้เลย — นับอย่างน้อย 1 รายการ หรือเลือกให้รายการที่ไม่นับเป็นศูนย์", en: "Nothing has been counted yet. Count at least one item or set uncounted items to zero." },
  IDEMPOTENCY_CONFLICT: { th: "มีรายการของรหัสนี้อยู่แล้วแต่ข้อมูลไม่ตรงกัน — ยังไม่ได้บันทึกรายการนี้", en: "A record with this key already exists with different data. This request was not saved." },
  STOCK_BUSY: { th: "สินค้านี้กำลังถูกบันทึกสต็อกจากหลายรายการพร้อมกัน — กรุณาลองใหม่อีกครั้ง", en: "This item is being updated by other transactions. Please try again." },
  INTERNAL: { th: "ระบบตรวจนับขัดข้องชั่วคราว — ลองอีกครั้ง", en: "The stock count service had a temporary problem. Please try again." },
};

export type StockCountRefusal = { ok: false; code: StockCountRefusalCode; message: string; countId?: string };

// ═══════════ เพดาน (R5 R13 R14) ═══════════
export const STOCK_COUNT_QTY_MAX = 10_000_000;
export const STOCK_COUNT_NOTE_MAX = 200;
export const STOCK_COUNT_REASON_MAX = 200;
export const STOCK_COUNT_CATEGORY_MAX = 50;
export const STOCK_COUNT_LIST_MAX = 100;
export const STOCK_COUNT_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export type StockCountStatus = "OPEN" | "CONFIRMED" | "CANCELLED";
export type StockCountScopeKind = "ALL" | "CATEGORY";
export type StockCountMode = "SET" | "ADD";
export type StockCountUncounted = "SKIP" | "ZERO";
export type StockCountFilter = "ALL" | "UNCOUNTED" | "VARIANCE";

/** R11 — วันที่เป็น ISO string */
export type StockCountView = {
  id: string;
  countNo: number;
  unitId: string;
  inventorySystemId: string;
  locationId: string;
  scope: StockCountScopeKind;
  categoryIds: string[];
  blind: boolean;
  status: StockCountStatus;
  note: string | null;
  snapshotAt: string;
  openedByUserId: string;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
};

/** R11 — จำนวนเป็นหน่วยสต็อก (ชิ้น · กรัมเมื่อ weighed) · blind + ไม่มีสิทธิ์ปรับ = snapshot/expected/variance เป็น null */
export type StockCountLineView = {
  id: string;
  itemId: string;
  name: string;
  sku: string;
  barcode: string | null;
  unitLabel: string;
  weighed: boolean;
  snapshotQty: number | null;
  countedQty: number | null;
  expectedAtCount: number | null;
  varianceQty: number | null;
  countedAt: string | null;
};

export type StockCountSummary = { total: number; counted: number; withVariance: number };
