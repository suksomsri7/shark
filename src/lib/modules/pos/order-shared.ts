// order-shared.ts — ออเดอร์ทุกช่องทาง ส่วนบริสุทธิ์ · POS P2.8 (R1 R2 R3 R8 R11 · มติผู้คุมงาน 4 12 17 23)
//
// 🔴 ไฟล์นี้ client component (จอ 09 · P2.8U) import ได้ — ห้าม import ค่าจาก prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (import type ได้)
//    ฝั่งเซิร์ฟเวอร์ = order.ts (ผู้เขียนเดียวของ PosOrder*) · action = order-actions.ts ("use server")
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · เวลาเป็น ms (Date.getTime) — ตัวจับเวลาเป็นการแสดงผลอย่างเดียว (CD6: ไม่มี cron ปฏิเสธอัตโนมัติ)
// 🔴 ตัวแกะอินพุตไม่ throw: ผิด = {ok:false, code:"VALIDATION", message ไทย, lineIndex?}
import { CHANNEL_CODE_RE, CHANNEL_REF_MAX } from "./channel-shared";
import { REGISTER_MAX_OPTIONS_PER_LINE, REGISTER_MAX_QTY, REGISTER_NOTE_MAX, type RegisterRefusalCode } from "./register-shared";
import type { PriceSource } from "./price-shared";

// ═══════════ ค่าคงที่ (ลำดับ = ลำดับของ enum ใน schema · ข้อสอบ ST7) ═══════════
export const ORDER_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY", "HANDED", "REJECTED", "CANCELLED"] as const;
export const ORDER_PAYMENT_STATES = ["UNPAID", "PAY_ON_PICKUP", "PLATFORM_PAID", "PAID", "REFUNDED"] as const;
export const ORDER_FULFILMENTS = ["PICKUP", "DELIVERY", "DINE_IN"] as const;
/** เหตุผลปฏิเสธ (ชีตปฏิเสธของจอ 09) — ลำดับ = ลำดับแสดง */
export const ORDER_REJECT_REASONS = ["OUT_OF_STOCK", "CLOSING", "TOO_BUSY", "OTHER"] as const;
/** สถานะเริ่มที่ผู้รับเข้าเลือกได้ (MANUAL ปริยาย ACCEPTED — แท็บเล็ตแพลตฟอร์มรับไปแล้ว · อื่น NEW) */
export const ORDER_START_STATUSES = ["NEW", "ACCEPTED"] as const;
/** สถานะชำระที่ผู้รับเข้าเลือกได้ (ช่องทาง DIRECT เท่านั้น — PLATFORM = PLATFORM_PAID เสมอ) */
export const ORDER_INPUT_PAYMENT_STATES = ["UNPAID", "PAY_ON_PICKUP"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderPaymentState = (typeof ORDER_PAYMENT_STATES)[number];
export type OrderFulfilment = (typeof ORDER_FULFILMENTS)[number];
export type OrderRejectReason = (typeof ORDER_REJECT_REASONS)[number];

/** หน้าต่างรับออเดอร์ (วินาที) — "ต้องรับใน 2:00" · แสดงผลอย่างเดียว */
export const ORDER_ACCEPT_WINDOW_SEC = 120;
/** เวลาเตรียมปริยายเมื่อช่องทางไม่ได้ตั้ง (R7: channel.prepMinutes ?? 15) */
export const ORDER_PREP_DEFAULT_MIN = 15;
export const ORDER_PREP_MIN = 1;
export const ORDER_PREP_MAX = 180;
/** บรรทัดต่อออเดอร์ได้ไม่เกิน */
export const ORDER_MAX_LINES = 100;
/** พักรับออเดอร์ได้นานสุด (ms) — 24 ชม. */
export const ORDER_PAUSE_MAX_MS = 24 * 3600 * 1000;
/** ราคาต่อหน่วยสูงสุดของบรรทัดกำหนดเอง/บรรทัดจากต้นทาง (สตางค์ · ฿1,000,000) */
export const ORDER_UNIT_PRICE_MAX = 100_000_000;
export const ORDER_NAME_MAX = 200;
export const ORDER_CUSTOMER_NAME_MAX = 100;
export const ORDER_PHONE_MAX = 30;
export const ORDER_ADDRESS_MAX = 300;
export const ORDER_KEY_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
/** รหัสออเดอร์ของร้าน <PFX>-NNNN ต่อสาขาต่อวัน (มติ 23) */
export const ORDER_CODE_PREFIX = "OD";
export const ORDER_CODE_RE = /^[A-Z0-9]{1,6}-\d{4}$/;
/** adapterConfig ที่รับได้จนกว่า P3.1 จะกำหนดการเข้ารหัส (ห้ามมีความลับ) */
export const ORDER_ADAPTER_CONFIG_KEYS = ["version", "note"] as const;
export const ORDER_ADAPTER_NOTE_MAX = 200;

// ═══════════ วงจรสถานะ (R2 · มติ 4) ═══════════
const ALLOWED: ReadonlySet<string> = new Set([
  "NEW>ACCEPTED",
  "NEW>REJECTED",
  "NEW>CANCELLED", // ต้นทางยกเลิก (เว็บร้าน/แพลตฟอร์ม) — พนักงานใช้ปฏิเสธแทน
  "ACCEPTED>PREPARING",
  "PREPARING>READY",
  "READY>HANDED",
  "ACCEPTED>CANCELLED",
  "PREPARING>CANCELLED",
  "READY>CANCELLED",
]);
/** เปลี่ยนจาก → ไป ได้ไหม (ไม่มีทางลัด ACCEPTED→READY · HANDED/REJECTED/CANCELLED = ปลายทาง) */
export function canTransition(from: string, to: string): boolean {
  return ALLOWED.has(`${from}>${to}`);
}
/** สถานะปลายทาง (ปิดงานแล้ว) */
export const isOrderClosed = (s: string): boolean => s === "HANDED" || s === "REJECTED" || s === "CANCELLED";

/** คอลัมน์ของจอ 09: ใหม่ · กำลังเตรียม (รับแล้ว+กำลังเตรียม) · พร้อม · เสร็จวันนี้ — ปฏิเสธ/ยกเลิก = ไม่อยู่ในคอลัมน์ */
export const ORDER_COLUMNS = ["new", "preparing", "ready", "done"] as const;
export type OrderColumn = (typeof ORDER_COLUMNS)[number];
export function orderColumnOf(status: string): OrderColumn | null {
  if (status === "NEW") return "new";
  if (status === "ACCEPTED" || status === "PREPARING") return "preparing";
  if (status === "READY") return "ready";
  if (status === "HANDED") return "done";
  return null;
}

// ═══════════ ตัวจับเวลา (CD6 · มติ 17) ═══════════
/** วินาทีที่เหลือในหน้าต่างรับ: max(0, ceil((รับเข้า + 120 วิ − ตอนนี้) / 1 วิ)) */
export function acceptRemainingSec(receivedAtMs: number, nowMs: number): number {
  const left = receivedAtMs + ORDER_ACCEPT_WINDOW_SEC * 1000 - nowMs;
  return left <= 0 ? 0 : Math.ceil(left / 1000);
}
/** นาทีที่เลยเวลา (เตรียม): ยังไม่ถึงกำหนด = 0 · เลย = floor((ตอนนี้ − กำหนด) / 60 วิ) */
export function orderLateMinutes(dueAtMs: number, nowMs: number): number {
  return nowMs <= dueAtMs ? 0 : Math.floor((nowMs - dueAtMs) / 60_000);
}
/** ปิดเบอร์: ตัวเลขล้วน → 2 ตัวแรก + "x-xxx-" + 4 ตัวท้าย ("0812341234" → "08x-xxx-1234") · ว่าง/null = null · สั้นกว่า 6 หลัก = x ทั้งหมด */
export function maskPhone(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length < 6) return "x".repeat(d.length);
  return `${d.slice(0, 2)}x-xxx-${d.slice(-4)}`;
}
/** รหัสออเดอร์ของร้าน (ลำดับต่อสาขาต่อวัน · 4 หลัก) */
export function orderCode(seq: number, prefix: string = ORDER_CODE_PREFIX): string {
  return `${prefix}-${String(Math.max(1, Math.trunc(seq))).padStart(4, "0")}`;
}

// ═══════════ ชนิดข้อมูล (สัญญา P2.8U) ═══════════
/** ตัวเลือกที่สำเนาไว้บนบรรทัด (รูปเดียวกับ PosSaleLineOption) */
export type OrderLineOption = { choiceId: string; groupId: string; groupName: string; choiceName: string; priceDeltaSatang: number };

/** บรรทัดที่ส่งเข้า: แคตตาล็อก {productId, qty, choiceIds?, note?} · กำหนดเอง {name, unitPriceSatang, qty, note?} ·
 *  ราคาจากต้นทาง {productId, name?, unitPriceSatang, qty} (adapter/เว็บร้านเท่านั้น — ประตูพนักงานปฏิเสธ) */
export type IngestLine =
  | { kind: "catalog"; productId: string; qty: number; choiceIds: string[]; note: string | null }
  | { kind: "custom"; name: string; unitPriceSatang: number; qty: number; note: string | null }
  | { kind: "priced"; productId: string; name: string | null; unitPriceSatang: number; qty: number; note: string | null; priceSource: PriceSource | null; priceRuleId: string | null; listPriceSatang: number | null };
export type IngestCustomer = { name: string; phone: string | null; memberId: string | null; partyId: string | null };
export type IngestInput = {
  channelId: string | null;
  channelCode: string | null;
  externalRef: string | null;
  idempotencyKey: string;
  lines: IngestLine[];
  customer: IngestCustomer;
  fulfilment: OrderFulfilment;
  address: string | null;
  note: string | null;
  chatConversationId: string | null;
  startStatus: "NEW" | "ACCEPTED" | null;
  paymentState: "UNPAID" | "PAY_ON_PICKUP" | null;
  prepMinutes: number | null;
  /** ประตูระบบ (ingestInTx) เท่านั้น */
  shopOrderId: string | null;
  payload: unknown;
};

/** รหัสปฏิเสธของออเดอร์ = ชุดของหน้าขาย + 5 รหัสใหม่ (R11)
 *  🔴 ไม่เพิ่มเข้า RegisterRefusalCode: register.ts มี REG_MESSAGE: Record<RegisterRefusalCode, string> (ครบทุกรหัส) และ register.ts ห้ามแตะใน P2.8 (มติ 3)
 *     — ข้อเสนอ ORACLE-EDIT ST2 อยู่ใน ledger/wo-notes/pos-P2.8.md · ข้อความจอ = refusalMessageKey (register-shared) ครบทั้ง 5 รหัสแล้ว */
export type OrderRefusalCode = RegisterRefusalCode | "ORDER_NOT_FOUND" | "ORDER_STATE_INVALID" | "ORDER_STATE_CHANGED" | "ORDER_UNPAID" | "CHANNEL_PAUSED";
/** messageKey = คีย์ข้อความเฉพาะกรณีใต้ `pos` (เช่น orders.errors.webPaid) — จอใช้แทน refusalMessageKey(code) เมื่อมี (P2.8 fix รอบ 2 F1 F4) */
export type OrderRefusal = { ok: false; code: OrderRefusalCode; message: string; lineIndex?: number; order?: OrderCard; requestId?: string; messageKey?: string };
/** ออเดอร์เว็บร้านที่ชำระแล้ว — ปฏิเสธ/ยกเลิกที่จอ POS ไม่ได้ (คืนเงิน/ยกเลิกที่หน้าเว็บร้าน · รีวิว F1) */
export const ORDER_WEB_PAID_MESSAGE = "ออเดอร์เว็บร้านที่ชำระแล้ว — คืนเงิน/ยกเลิกที่หน้าเว็บร้าน";
/** บิลของออเดอร์มีใบคืนเงินแล้ว — ยกเลิกออเดอร์ (void บิล) ไม่ได้ (รีวิว F4) */
export const ORDER_HAS_REFUNDS_MESSAGE = "บิลนี้มีการคืนเงินแล้ว — ยกเลิกออเดอร์ไม่ได้";
/** บิลของออเดอร์ถูกยกเลิกแล้ว — ส่งมอบไม่ได้ (fix รอบ 3 · H3) */
export const ORDER_SALE_VOIDED_MESSAGE = "บิลของออเดอร์นี้ถูกยกเลิกแล้ว — ส่งมอบไม่ได้ ยกเลิกออเดอร์แทน";

/** การ์ดออเดอร์ (คอลัมน์ของจอ 09) — ไม่มีเบอร์เต็ม (มติ 16) · เวลาเป็น ISO */
export type OrderCard = {
  id: string;
  channel: { id: string; code: string; name: string; payout: "PLATFORM" | "DIRECT" | null; adapter: string };
  ref: string;
  code: string;
  externalRef: string | null;
  status: OrderStatus;
  paymentState: OrderPaymentState;
  itemCount: number;
  qtyCount: number;
  totalSatang: number;
  customerName: string;
  phoneMasked: string | null;
  fulfilment: OrderFulfilment;
  address: string | null;
  note: string | null;
  receivedAt: string;
  acceptBy: string;
  /** NEW เท่านั้น (อื่น = null) */
  acceptRemainingSec: number | null;
  acceptedAt: string | null;
  prepMinutes: number | null;
  /** acceptedAt + prepMinutes (รับแล้วเท่านั้น) */
  prepDueAt: string | null;
  /** นาทีที่เลยเวลาเตรียม (ACCEPTED/PREPARING · อื่น 0) */
  lateMinutes: number;
  readyAt: string | null;
  handedAt: string | null;
  closedAt: string | null;
  rejectReason: string | null;
  saleId: string | null;
  receiptNo: string | null;
  shopOrderId: string | null;
  version: number;
};
export type OrderLineView = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPriceSatang: number;
  listPriceSatang: number | null;
  priceSource: PriceSource | null;
  options: OrderLineOption[];
  note: string | null;
  lineTotalSatang: number;
};
export type OrderEventView = { type: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; actorUserId: string | null; at: string };
export type OrderDetail = OrderCard & {
  lines: OrderLineView[];
  /** ค่าคอมฯ แพลตฟอร์มตามอัตราปัจจุบันของช่องทาง (= channelCommission) · net = ยอด − ค่าคอมฯ − VAT ค่าคอมฯ */
  commission: { commissionSatang: number; commissionVatSatang: number; netSatang: number };
  /** ออเดอร์ทุกสถานะของลูกค้าคนเดียวกัน (เบอร์ → สมาชิก → party) ที่สาขานี้ รวมใบนี้ · ค่าเฉลี่ยปัดครึ่งขึ้น */
  history: { count: number; avgSatang: number };
  memberId: string | null;
  partyId: string | null;
  chatConversationId: string | null;
  events: OrderEventView[];
};
export type OrderCounts = { byColumn: Record<OrderColumn, number>; byChannel: Record<string, number> };
export type OrderDaySummary = { count: number; totalSatang: number; rejectedCancelled: number; avgAcceptSeconds: number; onTime: { n: number; m: number } };

export type IngestOrderResult = { ok: true; orderId: string; duplicated: boolean; saleId: string | null } | OrderRefusal;
export type IngestInTxResult = { ok: true; skipped: true } | { ok: true; skipped?: false; orderId: string; duplicated: boolean; saleId: string | null } | OrderRefusal;
export type SourceCancelledResult = { ok: true; orderId: string | null; changed: boolean };
export type OrderActionResult = { ok: true; order: OrderCard; saleId?: string | null } | OrderRefusal;
export type PayOrderResult = { ok: true; saleId: string; duplicated?: boolean } | OrderRefusal;
/** since = ต้นช่วงที่ใช้จริง (ต้นวันไทย หรือ since ที่ส่งมา ตัดที่ 7 วัน · รีวิว F5) */
export type ListOrdersResult = { ok: true; orders: OrderCard[]; counts: OrderCounts; summary: OrderDaySummary; at: string; since: string } | OrderRefusal;
export type GetOrderResult = { ok: true; order: OrderDetail } | OrderRefusal;
export type ChannelOrderSettingsView = {
  id: string;
  code: string;
  name: string;
  adapter: string;
  payout: "PLATFORM" | "DIRECT";
  autoAccept: boolean;
  prepMinutes: number | null;
  pausedUntil: string | null;
  adapterConfig: { version: number; note?: string } | null;
};
export type ChannelOrderSettingsResult = { ok: true; channel: ChannelOrderSettingsView } | OrderRefusal;

// ═══════════ ตัวแกะอินพุต ═══════════
type Bad = { ok: false; code: "VALIDATION"; message: string; lineIndex?: number };
const bad = (message: string, lineIndex?: number): Bad => (lineIndex === undefined ? { ok: false, code: "VALIDATION", message } : { ok: false, code: "VALIDATION", message, lineIndex });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !/[\u0000-\u001F\u007F]/.test(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/** ข้อความเสริม: ไม่ส่ง/null = null · สตริงหลังตัดช่องว่าง 0 ตัว = null · ยาวเกิน/มีอักขระควบคุม = undefined (ผิด) */
function optText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  if ([...t].length > max || CTRL.test(t)) return undefined;
  return t;
}

const INGEST_KEYS = ["channelId", "channelCode", "externalRef", "idempotencyKey", "lines", "customer", "fulfilment", "address", "note", "chatConversationId", "startStatus", "paymentState", "prepMinutes"] as const;
/** คีย์ที่ประตูระบบ (ingestInTx · adapter) รับเพิ่ม */
const SOURCE_KEYS = ["shopOrderId", "payload"] as const;
const LINE_KEYS = ["productId", "name", "unitPriceSatang", "qty", "choiceIds", "note"] as const;
/** POS P2.8 fix รอบ 3 (H5): ประตูระบบรับที่มาของราคาจากต้นทาง (เว็บร้าน: ชั้น WEB ของ webPricesForShop) บนบรรทัดราคาต้นทาง */
const SOURCE_LINE_KEYS = ["priceSource", "priceRuleId", "listPriceSatang"] as const;
const PRICE_SOURCE_VALUES = ["BASE", "BRANCH", "CHANNEL", "RULE", "OPEN", "CUSTOM", "WEIGHED"] as const;
const CUSTOMER_KEYS = ["name", "phone", "memberId", "partyId"] as const;

export type ParseIngestResult = { ok: true; value: IngestInput } | Bad;

/**
 * ตัวแกะอินพุตของประตูรับออเดอร์ (มติ CD2): คีย์แปลก = VALIDATION · channelId หรือ channelCode อย่างใดอย่างหนึ่ง ·
 * idempotencyKey บังคับเสมอ (รวม MANUAL ที่ไม่มีเลขแพลตฟอร์ม — มติ 12) · externalRef ตัดช่องว่าง ≤ 40 · บรรทัด 1..100 ·
 * opts.source = ประตูระบบ (รับ shopOrderId/payload เพิ่ม)
 */
export function parseIngestInput(raw: unknown, opts: { source?: boolean } = {}): ParseIngestResult {
  try {
    if (!isRecord(raw)) return bad("ข้อมูลออเดอร์ไม่ถูกต้อง");
    const allowed: readonly string[] = opts.source ? [...INGEST_KEYS, ...SOURCE_KEYS] : INGEST_KEYS;
    const extra = Object.keys(raw).filter((k) => !allowed.includes(k) && raw[k] !== undefined);
    if (extra.length) return bad(`มีช่องข้อมูลที่ไม่รู้จัก: ${extra.slice(0, 3).join(", ")}`);
    // ช่องทาง
    const hasId = raw.channelId !== undefined && raw.channelId !== null;
    const hasCode = raw.channelCode !== undefined && raw.channelCode !== null;
    if (hasId === hasCode) return bad("ระบุช่องทางอย่างใดอย่างหนึ่ง (channelId หรือ channelCode)");
    if (hasId && !isId(raw.channelId)) return bad("รหัสช่องทางไม่ถูกต้อง");
    if (hasCode && (typeof raw.channelCode !== "string" || !CHANNEL_CODE_RE.test(raw.channelCode))) return bad("รหัสช่องทางไม่ถูกต้อง");
    // เลขแพลตฟอร์ม + คีย์
    let externalRef: string | null = null;
    if (raw.externalRef !== undefined && raw.externalRef !== null) {
      if (typeof raw.externalRef !== "string") return bad("เลขออเดอร์แพลตฟอร์มไม่ถูกต้อง");
      const t = raw.externalRef.trim();
      if ([...t].length > CHANNEL_REF_MAX || CTRL.test(t) || /[\n\r\t]/.test(t)) return bad(`เลขออเดอร์แพลตฟอร์มยาวได้ไม่เกิน ${CHANNEL_REF_MAX} ตัวอักษร`);
      externalRef = t || null;
    }
    if (typeof raw.idempotencyKey !== "string" || !ORDER_KEY_RE.test(raw.idempotencyKey)) return bad("รหัสรายการ (idempotencyKey) ไม่ถูกต้อง — ต้องส่งทุกครั้ง");
    // บรรทัด
    if (!Array.isArray(raw.lines) || raw.lines.length < 1) return bad("ออเดอร์ต้องมีอย่างน้อย 1 รายการ");
    if (raw.lines.length > ORDER_MAX_LINES) return bad(`ออเดอร์หนึ่งมีได้ไม่เกิน ${ORDER_MAX_LINES} รายการ`);
    const lines: IngestLine[] = [];
    for (let i = 0; i < raw.lines.length; i++) {
      const l: unknown = raw.lines[i];
      if (!isRecord(l)) return bad("รายการไม่ถูกต้อง", i);
      const lineKeys: readonly string[] = opts.source ? [...LINE_KEYS, ...SOURCE_LINE_KEYS] : LINE_KEYS;
      const ex = Object.keys(l).filter((k) => !lineKeys.includes(k) && l[k] !== undefined);
      if (ex.length) return bad(`รายการมีช่องข้อมูลที่ไม่รู้จัก: ${ex.slice(0, 3).join(", ")}`, i);
      if (!isInt(l.qty, 1, REGISTER_MAX_QTY)) return bad(`จำนวนต้องเป็นจำนวนเต็ม 1–${REGISTER_MAX_QTY}`, i);
      const note = optText(l.note, REGISTER_NOTE_MAX);
      if (note === undefined) return bad(`หมายเหตุรายการยาวได้ไม่เกิน ${REGISTER_NOTE_MAX} ตัวอักษร`, i);
      const hasProduct = l.productId !== undefined && l.productId !== null;
      const hasPrice = l.unitPriceSatang !== undefined && l.unitPriceSatang !== null;
      const hasChoices = l.choiceIds !== undefined && l.choiceIds !== null;
      if (hasProduct && !isId(l.productId)) return bad("รหัสสินค้าไม่ถูกต้อง", i);
      if (hasPrice && !isInt(l.unitPriceSatang, 0, ORDER_UNIT_PRICE_MAX)) return bad("ราคาต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
      const name = optText(l.name, ORDER_NAME_MAX);
      if (name === undefined) return bad(`ชื่อรายการยาวได้ไม่เกิน ${ORDER_NAME_MAX} ตัวอักษร`, i);
      if (hasProduct && !hasPrice) {
        let choiceIds: string[] = [];
        if (hasChoices) {
          const c = l.choiceIds;
          if (!Array.isArray(c) || c.length > REGISTER_MAX_OPTIONS_PER_LINE || !c.every(isId) || new Set(c).size !== c.length) return bad("ตัวเลือกที่ส่งมาไม่ถูกต้อง", i);
          choiceIds = [...(c as string[])];
        }
        if (name !== null) return bad("สินค้าแคตตาล็อกใช้ชื่อจากระบบ — ไม่ต้องส่งชื่อ", i);
        lines.push({ kind: "catalog", productId: l.productId as string, qty: l.qty, choiceIds, note });
        continue;
      }
      if (hasChoices) return bad("รายการกำหนดเองใส่ตัวเลือกไม่ได้", i);
      if (!hasPrice) return bad("รายการต้องมีสินค้า หรือชื่อพร้อมราคา", i);
      if (hasProduct) {
        // POS P2.8 fix รอบ 3 (H5): ที่มาของราคาจากต้นทาง (ประตูระบบเท่านั้น · ไม่ส่ง = null → CHANNEL)
        const ps = l.priceSource === undefined || l.priceSource === null ? null : (PRICE_SOURCE_VALUES as readonly unknown[]).includes(l.priceSource) ? (l.priceSource as PriceSource) : undefined;
        if (ps === undefined) return bad("ที่มาของราคาไม่ถูกต้อง", i);
        if (l.priceRuleId !== undefined && l.priceRuleId !== null && !isId(l.priceRuleId)) return bad("รหัสโปรราคาไม่ถูกต้อง", i);
        if (l.listPriceSatang !== undefined && l.listPriceSatang !== null && !isInt(l.listPriceSatang, 0, ORDER_UNIT_PRICE_MAX)) return bad("ราคาปกติไม่ถูกต้อง", i);
        lines.push({
          kind: "priced", productId: l.productId as string, name, unitPriceSatang: l.unitPriceSatang as number, qty: l.qty, note,
          priceSource: ps, priceRuleId: (l.priceRuleId as string | null | undefined) ?? null, listPriceSatang: (l.listPriceSatang as number | null | undefined) ?? null,
        });
        continue;
      }
      if (name === null) return bad("รายการกำหนดเองต้องมีชื่อ", i);
      lines.push({ kind: "custom", name, unitPriceSatang: l.unitPriceSatang as number, qty: l.qty, note });
    }
    // ลูกค้า
    const c: unknown = raw.customer;
    if (!isRecord(c)) return bad("ต้องระบุลูกค้า (ชื่อ)");
    const cex = Object.keys(c).filter((k) => !(CUSTOMER_KEYS as readonly string[]).includes(k) && c[k] !== undefined);
    if (cex.length) return bad(`ข้อมูลลูกค้ามีช่องที่ไม่รู้จัก: ${cex.slice(0, 3).join(", ")}`);
    const cname = optText(c.name, ORDER_CUSTOMER_NAME_MAX);
    if (!cname) return bad(`ชื่อลูกค้ายาว 1–${ORDER_CUSTOMER_NAME_MAX} ตัวอักษร`);
    const phone = optText(c.phone, ORDER_PHONE_MAX);
    if (phone === undefined || (phone !== null && !/^[0-9+()\-\s.]+$/.test(phone))) return bad("เบอร์โทรไม่ถูกต้อง");
    for (const k of ["memberId", "partyId"] as const) if (c[k] !== undefined && c[k] !== null && !isId(c[k])) return bad("รหัสสมาชิก/ผู้ติดต่อไม่ถูกต้อง");
    const customer: IngestCustomer = { name: cname, phone, memberId: (c.memberId as string | undefined) ?? null, partyId: (c.partyId as string | undefined) ?? null };
    // การรับของ
    if (!(ORDER_FULFILMENTS as readonly unknown[]).includes(raw.fulfilment)) return bad("วิธีรับของต้องเป็น PICKUP · DELIVERY · DINE_IN");
    const address = optText(raw.address, ORDER_ADDRESS_MAX);
    if (address === undefined) return bad(`ที่อยู่ยาวได้ไม่เกิน ${ORDER_ADDRESS_MAX} ตัวอักษร`);
    const note = optText(raw.note, REGISTER_NOTE_MAX);
    if (note === undefined) return bad(`หมายเหตุยาวได้ไม่เกิน ${REGISTER_NOTE_MAX} ตัวอักษร`);
    if (raw.chatConversationId !== undefined && raw.chatConversationId !== null && !isId(raw.chatConversationId)) return bad("รหัสห้องแชทไม่ถูกต้อง");
    let startStatus: IngestInput["startStatus"] = null;
    if (raw.startStatus !== undefined && raw.startStatus !== null) {
      if (!(ORDER_START_STATUSES as readonly unknown[]).includes(raw.startStatus)) return bad("สถานะเริ่มต้องเป็น NEW หรือ ACCEPTED");
      startStatus = raw.startStatus as "NEW" | "ACCEPTED";
    }
    let paymentState: IngestInput["paymentState"] = null;
    if (raw.paymentState !== undefined && raw.paymentState !== null) {
      if (!(ORDER_INPUT_PAYMENT_STATES as readonly unknown[]).includes(raw.paymentState)) return bad("สถานะชำระต้องเป็น UNPAID หรือ PAY_ON_PICKUP");
      paymentState = raw.paymentState as "UNPAID" | "PAY_ON_PICKUP";
    }
    let prepMinutes: number | null = null;
    if (raw.prepMinutes !== undefined && raw.prepMinutes !== null) {
      if (!isInt(raw.prepMinutes, ORDER_PREP_MIN, ORDER_PREP_MAX)) return bad(`เวลาเตรียมต้องเป็น ${ORDER_PREP_MIN}–${ORDER_PREP_MAX} นาที`);
      prepMinutes = raw.prepMinutes;
    }
    let shopOrderId: string | null = null;
    if (opts.source && raw.shopOrderId !== undefined && raw.shopOrderId !== null) {
      if (!isId(raw.shopOrderId)) return bad("รหัสออเดอร์เว็บร้านไม่ถูกต้อง");
      shopOrderId = raw.shopOrderId;
    }
    return {
      ok: true,
      value: {
        channelId: hasId ? (raw.channelId as string) : null,
        channelCode: hasCode ? (raw.channelCode as string) : null,
        externalRef,
        idempotencyKey: raw.idempotencyKey,
        lines,
        customer,
        fulfilment: raw.fulfilment as OrderFulfilment,
        address,
        note,
        chatConversationId: (raw.chatConversationId as string | undefined) ?? null,
        startStatus,
        paymentState,
        prepMinutes,
        shopOrderId,
        payload: opts.source ? (raw.payload ?? null) : null,
      },
    };
  } catch {
    return bad("ข้อมูลออเดอร์ไม่ถูกต้อง");
  }
}

/**
 * ลายนิ้วมือของบรรทัดสำหรับเทียบคำขอซ้ำ (X1) — ถุงบรรทัด ไม่สนลำดับ · สินค้า|จำนวน|ตัวเลือก (เรียง) · บรรทัดกำหนดเอง/ราคาจากต้นทางนับราคาด้วย ·
 * ไม่นับหมายเหตุ (คำขอซ้ำจากจอเดิมส่งหมายเหตุเดิมอยู่แล้ว — ความต่างที่นับคือ "ของ" ในออเดอร์)
 */
export function orderLinesFingerprint(lines: readonly { productId: string | null; name: string | null; qty: number; unitPriceSatang: number | null; choiceIds: readonly string[] }[]): string {
  return lines
    .map((l) => (l.productId ? `p:${l.productId}|${l.qty}|${[...l.choiceIds].sort().join("+")}${l.unitPriceSatang !== null ? `|${l.unitPriceSatang}` : ""}` : `c:${l.name ?? ""}|${l.qty}|${l.unitPriceSatang ?? 0}`))
    .sort()
    .join(",");
}

// ═══════════ ค่าตั้งรับออเดอร์ของช่องทาง (R7 · มติ 11) ═══════════
export type ChannelOrderSettingsInput = {
  channelId: string;
  autoAccept?: boolean;
  prepMinutes?: number | null;
  pausedUntil?: Date | null;
  adapterConfig?: { version: number; note?: string } | null;
};
const SETTINGS_KEYS = ["channelId", "autoAccept", "prepMinutes", "pausedUntil", "adapterConfig"] as const;
/** ตัวแกะค่าตั้ง: เวลาเตรียม 1..180|null · พักได้ถึง now + 24 ชม.|null · adapterConfig รับเฉพาะ {version, note?} (ห้ามความลับจนกว่า P3.1) */
export function parseChannelOrderSettings(raw: unknown, nowMs: number): { ok: true; value: ChannelOrderSettingsInput } | Bad {
  try {
    if (!isRecord(raw)) return bad("ข้อมูลค่าตั้งไม่ถูกต้อง");
    const extra = Object.keys(raw).filter((k) => !(SETTINGS_KEYS as readonly string[]).includes(k) && raw[k] !== undefined);
    if (extra.length) return bad(`มีช่องข้อมูลที่ไม่รู้จัก: ${extra.slice(0, 3).join(", ")}`);
    if (!isId(raw.channelId)) return bad("รหัสช่องทางไม่ถูกต้อง");
    const out: ChannelOrderSettingsInput = { channelId: raw.channelId };
    if (raw.autoAccept !== undefined) {
      if (typeof raw.autoAccept !== "boolean") return bad("รับอัตโนมัติต้องเป็นเปิด/ปิด");
      out.autoAccept = raw.autoAccept;
    }
    if (raw.prepMinutes !== undefined) {
      if (raw.prepMinutes !== null && !isInt(raw.prepMinutes, ORDER_PREP_MIN, ORDER_PREP_MAX)) return bad(`เวลาเตรียมต้องเป็น ${ORDER_PREP_MIN}–${ORDER_PREP_MAX} นาที`);
      out.prepMinutes = raw.prepMinutes as number | null;
    }
    if (raw.pausedUntil !== undefined) {
      if (raw.pausedUntil === null) out.pausedUntil = null;
      else {
        const d = raw.pausedUntil instanceof Date ? raw.pausedUntil : typeof raw.pausedUntil === "string" ? new Date(raw.pausedUntil) : null;
        if (!d || !Number.isFinite(d.getTime())) return bad("เวลาพักรับออเดอร์ไม่ถูกต้อง");
        if (d.getTime() > nowMs + ORDER_PAUSE_MAX_MS) return bad("พักรับออเดอร์ได้ไม่เกิน 24 ชั่วโมง");
        out.pausedUntil = d;
      }
    }
    if (raw.adapterConfig !== undefined) {
      const a: unknown = raw.adapterConfig;
      if (a === null) out.adapterConfig = null;
      else {
        if (!isRecord(a)) return bad("ค่าการเชื่อมต่อไม่ถูกต้อง");
        const ax = Object.keys(a).filter((k) => !(ORDER_ADAPTER_CONFIG_KEYS as readonly string[]).includes(k));
        if (ax.length) return bad("ค่าการเชื่อมต่อรับได้เฉพาะ version และ note — ห้ามใส่รหัสลับจนกว่าจะเปิดการเข้ารหัส (P3.1)");
        if (!isInt(a.version, 1, 9_999)) return bad("version ของการเชื่อมต่อต้องเป็นจำนวนเต็ม 1–9999");
        const note = optText(a.note, ORDER_ADAPTER_NOTE_MAX);
        if (note === undefined) return bad(`หมายเหตุการเชื่อมต่อยาวได้ไม่เกิน ${ORDER_ADAPTER_NOTE_MAX} ตัวอักษร`);
        out.adapterConfig = note ? { version: a.version, note } : { version: a.version };
      }
    }
    return { ok: true, value: out };
  } catch {
    return bad("ข้อมูลค่าตั้งไม่ถูกต้อง");
  }
}
