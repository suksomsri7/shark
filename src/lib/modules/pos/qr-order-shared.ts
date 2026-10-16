// qr-order-shared.ts — ประตูสาธารณะ QR (สั่งที่โต๊ะ /q/t/<qrToken> · สั่งล่วงหน้าจ่ายก่อน /q/<linkToken> · สถานะ /q/o/<orderToken>) ส่วนบริสุทธิ์ · POS P2.7
//
// 🔴 ไฟล์นี้ client component (หน้า /q/** · P2.7U) import ได้ — ห้าม import ค่าจาก prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ · ไม่มีเวลา/สุ่ม (Date.now · new Date() · Math.random)
//    ฝั่งเซิร์ฟเวอร์ = qr-order.ts (ผู้ประสานงาน — ไม่เขียนตารางเอง) · action = app/(store)/q/actions.ts ("use server")
// 🔴 คำปฏิเสธสาธารณะมีคีย์ตายตัว {ok:false, code, messageKey, message?, lineIndex?, retryAfterSec?} — ไม่มีรายละเอียดภายใน (ไม่มีรหัสดิบของโมดูลอื่น)
//    โทเคนผิดรูป/ไม่รู้จัก/ถูกเปลี่ยน/เป็นของประตูอื่น/ร้านอื่น = TOKEN_INVALID รูปเดียวกันทุกตัว (ไม่มีช่องรู้ว่ามีอยู่ · มติ 11)
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · เวลาเป็น ISO string (หน้าจัดรูปเองฝั่งเครื่องลูกค้า — SSR ไม่มีเวลาของเครื่อง)
// สัญญา: ledger/pos-briefs/pos-brief-P2.7.md §3 · §10 มติ 11 · ตารางชื่อ ledger/wo-notes/pos-P2.7-oracle.md

import type { PriceSource } from "./price-shared";

// ═══════════ รหัสปฏิเสธ (R4) ═══════════
/** รหัสใหม่ของประตู QR (มติ 11 · R4) */
export const QR_REFUSAL_CODES = ["QR_CLOSED", "SESSION_CHANGED", "TOKEN_INVALID", "RATE_LIMITED", "PREORDER_EXPIRED"] as const;
export type QrNewRefusalCode = (typeof QR_REFUSAL_CODES)[number];
/** รหัสทั้งหมดที่ประตูสาธารณะคืนได้ (รหัสเดิมของหน้าขายที่ลูกค้าเข้าใจได้ + INTERNAL) — ทุกตัวมีคีย์ qr.errors.<camel> ทั้ง th/en */
export const QR_PUBLIC_CODES = [
  ...QR_REFUSAL_CODES,
  "VALIDATION",
  "PRODUCT_UNAVAILABLE",
  "CHANNEL_NOT_SOLD",
  "OPTIONS_REQUIRED",
  "OPTIONS_INVALID",
  "OPTION_UNAVAILABLE",
  "PRICE_NOT_SET",
  "NO_SESSION", // POS P2.7 ▸ fix3 nit (a): เรียกพนักงาน/ขอเช็คบิลบนโต๊ะที่ยังไม่มีรายการ ◂
  "INTERNAL",
] as const;
export type QrRefusalCode = (typeof QR_PUBLIC_CODES)[number];
export type QrRefusal = { ok: false; code: QrRefusalCode; messageKey: string; message?: string; lineIndex?: number; retryAfterSec?: number };

/** รหัส → คีย์ข้อความใต้ `pos` (QR_CLOSED → qr.errors.qrClosed) */
export function qrRefusalMessageKey(code: string): string {
  return `qr.errors.${String(code).toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}
/** คำปฏิเสธสาธารณะ (คีย์ตายตัว) — ไม่ส่ง message = หน้าใช้ messageKey */
export function qrRefuse(code: QrRefusalCode, extra: { lineIndex?: number; retryAfterSec?: number } = {}): QrRefusal {
  return {
    ok: false,
    code,
    messageKey: qrRefusalMessageKey(code),
    ...(extra.lineIndex !== undefined ? { lineIndex: extra.lineIndex } : {}),
    ...(extra.retryAfterSec !== undefined ? { retryAfterSec: extra.retryAfterSec } : {}),
  };
}
export const isQrRefusal = (v: unknown): v is QrRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;

// ═══════════ โทเคน (มติ 11) ═══════════
/** ลิงก์สั่งล่วงหน้า (PosOrderLink.token) — 16 ตัว Crockford base32 ตัวใหญ่ (0-9 A-Z ไม่มี I L O U) · พิมพ์/แสดงซ้ำได้ */
export const QR_LINK_TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
/** หน้าสถานะออเดอร์ (PosOrder.publicToken) — 12 ตัว ตัวสร้างเดียวกับใบเสร็จออนไลน์ (receipt-token) */
export const QR_ORDER_TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{12}$/;
/** QR ของโต๊ะ (RestaurantTable.qrToken: cuid() ตอนสร้าง · qr_<uuid32> หลังเปลี่ยน) — ตรวจรูปอย่างหลวมก่อนค้น */
export const QR_TABLE_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const QR_LINK_TOKEN_LENGTH = 16;
export const isLinkToken = (v: unknown): v is string => typeof v === "string" && QR_LINK_TOKEN_RE.test(v);
export const isOrderToken = (v: unknown): v is string => typeof v === "string" && QR_ORDER_TOKEN_RE.test(v);
export const isTableQrToken = (v: unknown): v is string => typeof v === "string" && QR_TABLE_TOKEN_RE.test(v);

// ═══════════ เพดาน (มติ 11 · CD-O6) ═══════════
export const QR_MAX_LINES = 30;
export const QR_MAX_QTY = 50;
export const QR_NOTE_MAX = 200;
export const QR_NAME_MAX = 100;
/** ตัวกันถล่มต่อโทเคน (ในหน่วยความจำ · ต่อ instance) — ซ้อนบนเพดาน DB 10 ครั้ง/นาที/IP (CD-O6) */
export const QR_SUBMIT_PER_TOKEN_PER_MIN = 60;
/** เพดาน DB ต่อ IP ของการส่ง (สั่ง · ส่งรอบ · เรียกพนักงาน · แจ้งโอน) — ตัวเลขเดียวกับ ACCOUNT_RATE.publicSubmit */
export const QR_SUBMIT_PER_IP_PER_MIN = 10;
/** ตัวเลือกต่อบรรทัด (กันอินพุตใหญ่ผิดรูป) */
export const QR_MAX_CHOICES = 20;
/** แขกส่งตะกร้าเดิมซ้ำภายในหน้าต่างนี้ = รอบเดิม (CD-O7 · ในหน่วยความจำ) */
export const QR_ROUND_DEDUPE_MS = 10_000;
/** ลูกค้ากด "โอนแล้ว" ซ้ำภายในหน้าต่างนี้ = ไม่บันทึกซ้ำ */
export const QR_CLAIM_DEDUPE_MS = 2 * 60_000;
/** โพลของหน้าสถานะ/หน้าโต๊ะ (หน้าเว้นเมื่อแท็บไม่อยู่หน้าจอ) */
export const QR_STATUS_POLL_MS = 5_000;
export const QR_TABLE_POLL_MS = 8_000;

// ═══════════ เบอร์โทร (PDPA §3) ═══════════
/**
 * เบอร์ไทย → รูปปกติ 0XXXXXXXX(X): ตัดช่องว่าง/ขีด/จุด/วงเล็บ · +66/66 นำหน้า → 0 · ต้องเป็น 0 + 8–9 หลัก (มือถือ 10 · บ้าน 9) · อื่น = null
 * "081-234-5678" · "+66812345678" · "66 81 234 5678" → "0812345678" · "021234567" คงเดิม · "12345" · "08123456789" · "" → null
 */
export function normalizeThaiPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.trim().replace(/[\s().-]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("66") && !d.startsWith("0")) d = `0${d.slice(2)}`;
  return /^0\d{8,9}$/.test(d) ? d : null;
}

// ═══════════ ตะกร้าสาธารณะ ═══════════
/** บรรทัดของลูกค้า — สินค้า + จำนวน + ตัวเลือก + โน้ต (ราคามาจากเซิร์ฟเวอร์เท่านั้น) */
export type QrCartLine = { productId: string; qty: number; choiceIds?: string[]; note?: string };
export type QrParsedLine = { productId: string; qty: number; choiceIds: string[]; note: string | null };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k) || o[k] === undefined);
const LINE_KEYS = ["productId", "qty", "choiceIds", "note"] as const;
const cleanText = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

/** ตะกร้า (1..30 บรรทัด · qty 1..50 · ตัวเลือก ≤ 20 ไม่ซ้ำ · โน้ต ≤ 200) — ผิด = VALIDATION (+ lineIndex) */
export function parseQrCart(raw: unknown): { ok: true; lines: QrParsedLine[] } | QrRefusal {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > QR_MAX_LINES) return qrRefuse("VALIDATION");
  const lines: QrParsedLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const l: unknown = raw[i];
    const bad = () => qrRefuse("VALIDATION", { lineIndex: i });
    if (!isRecord(l) || !onlyKeys(l, LINE_KEYS) || !isId(l.productId)) return bad();
    if (typeof l.qty !== "number" || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > QR_MAX_QTY) return bad();
    let choiceIds: string[] = [];
    if (l.choiceIds !== undefined && l.choiceIds !== null) {
      if (!Array.isArray(l.choiceIds) || l.choiceIds.length > QR_MAX_CHOICES || !l.choiceIds.every(isId) || new Set(l.choiceIds).size !== l.choiceIds.length) return bad();
      choiceIds = [...(l.choiceIds as string[])];
    }
    let note: string | null = null;
    if (l.note !== undefined && l.note !== null) {
      if (typeof l.note !== "string" || l.note.length > QR_NOTE_MAX || !cleanText(l.note)) return bad();
      note = l.note.trim() || null;
    }
    lines.push({ productId: l.productId, qty: l.qty, choiceIds, note });
  }
  return { ok: true, lines };
}

/** คีย์ของคำขอสั่งล่วงหน้า (หน้าสร้าง 1 ต่อ 1 ตะกร้า · ส่งซ้ำ = ออเดอร์เดิม) — ชุดตัวอักษรเดียวกับ ORDER_KEY_RE */
export const QR_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;
export type QrPreorderInput = { lines: QrCartLine[]; customer: { name: string; phone: string }; idempotencyKey: string; note?: string };
export type QrParsedPreorder = { lines: QrParsedLine[]; customer: { name: string; phone: string }; idempotencyKey: string; note: string | null };
/** สั่งล่วงหน้า: ตะกร้า + ชื่อ (1..100) + เบอร์ไทย (ปกติรูปแล้ว) + คีย์ + โน้ตทั้งใบ (≤ 200) — ผิด = VALIDATION */
export function parseQrPreorder(raw: unknown): { ok: true; value: QrParsedPreorder } | QrRefusal {
  if (!isRecord(raw) || !onlyKeys(raw, ["lines", "customer", "idempotencyKey", "note"])) return qrRefuse("VALIDATION");
  if (typeof raw.idempotencyKey !== "string" || !QR_IDEMPOTENCY_KEY_RE.test(raw.idempotencyKey)) return qrRefuse("VALIDATION");
  const cart = parseQrCart(raw.lines);
  if (!cart.ok) return cart;
  const c = raw.customer;
  if (!isRecord(c) || !onlyKeys(c, ["name", "phone"])) return qrRefuse("VALIDATION");
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (!name || name.length > QR_NAME_MAX || !cleanText(name)) return qrRefuse("VALIDATION");
  const phone = normalizeThaiPhone(c.phone);
  if (!phone) return qrRefuse("VALIDATION");
  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string" || raw.note.length > QR_NOTE_MAX || !cleanText(raw.note)) return qrRefuse("VALIDATION");
    note = raw.note.trim() || null;
  }
  return { ok: true, value: { lines: cart.lines, customer: { name, phone }, idempotencyKey: raw.idempotencyKey, note } };
}

/** รอบของโต๊ะ: ตะกร้า + session ที่หน้าเห็นตอนโหลด (null = ยังไม่มี session) + guestToken ของเครื่อง (ไม่บังคับ) + โน้ต */
export type QrTableRoundInput = { lines: QrCartLine[]; expectedSessionId?: string | null; guestToken?: string; note?: string };
export type QrParsedTableRound = { lines: QrParsedLine[]; expectedSessionId: string | null | undefined; guestToken: string | null; note: string | null };
export const QR_GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
export function parseQrTableRound(raw: unknown): { ok: true; value: QrParsedTableRound } | QrRefusal {
  if (!isRecord(raw) || !onlyKeys(raw, ["lines", "expectedSessionId", "guestToken", "note"])) return qrRefuse("VALIDATION");
  const cart = parseQrCart(raw.lines);
  if (!cart.ok) return cart;
  let expected: string | null | undefined = undefined;
  if (raw.expectedSessionId === null) expected = null;
  else if (raw.expectedSessionId !== undefined) {
    if (!isId(raw.expectedSessionId)) return qrRefuse("VALIDATION");
    expected = raw.expectedSessionId;
  }
  let guestToken: string | null = null;
  if (raw.guestToken !== undefined && raw.guestToken !== null) {
    if (typeof raw.guestToken !== "string" || !QR_GUEST_TOKEN_RE.test(raw.guestToken)) return qrRefuse("VALIDATION");
    guestToken = raw.guestToken;
  }
  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string" || raw.note.length > QR_NOTE_MAX || !cleanText(raw.note)) return qrRefuse("VALIDATION");
    note = raw.note.trim() || null;
  }
  return { ok: true, value: { lines: cart.lines, expectedSessionId: expected, guestToken, note } };
}

/** ลายนิ้วมือของตะกร้า (กันส่งรอบซ้ำของแขก · CD-O7) — สินค้า|จำนวน|ตัวเลือกเรียง|โน้ต ตามลำดับบรรทัด */
export function qrCartHash(lines: readonly QrParsedLine[]): string {
  return lines.map((l) => `${l.productId}|${l.qty}|${[...l.choiceIds].sort().join(",")}|${l.note ?? ""}`).join(";");
}

// ═══════════ มุมมองที่หน้าใช้ (สัญญา U card) ═══════════
export type QrMenuChoice = { choiceId: string; name: string; nameEn: string | null; priceDeltaSatang: number; available: boolean };
export type QrMenuGroup = { groupId: string; name: string; nameEn: string | null; minSelect: number; maxSelect: number; choices: QrMenuChoice[] };
export type QrMenuItem = {
  productId: string;
  name: string;
  nameEn: string | null;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  priceSatang: number;
  priceSource: PriceSource;
  available: boolean;
  optionGroups: QrMenuGroup[];
};
/** POS P2.7U ▸ หัวร้านของหน้าสาธารณะ (ชื่อร้าน · โลโก้ · ชื่อสาขา — ไม่มีข้อมูลส่วนตัว) ◂ */
export type QrShopHeader = { name: string; logoUrl: string | null; branch: string };
/** เหตุที่ประตูปิด (หน้าแสดงแบนเนอร์ · เมนูยังเห็นแบบอ่านอย่างเดียว) */
export const QR_CLOSED_REASONS = ["CHANNEL_OFF", "CHANNEL_PAUSED", "KITCHEN_PAUSED", "KITCHEN_CLOSED", "PAYMENT_NOT_READY"] as const;
export type QrClosedReason = (typeof QR_CLOSED_REASONS)[number];

export type QrRoundItem = { name: string; qty: number; options: string[]; status: "NEW" | "COOKING" | "READY" | "SERVED" | "CANCELLED"; lineTotalSatang: number };
export type QrRound = { id: string; no: number; at: string; items: QrRoundItem[] };
export type QrTableView = {
  unit: { name: string };
  /** POS P2.7U ▸ หัวร้านของหน้า (แหล่งเดียวกับหัวใบเสร็จ · receiptShopHeader) — เพิ่มล้วน ◂ */
  shop?: QrShopHeader;
  table: { name: string };
  open: boolean;
  closedReason?: QrClosedReason;
  menu: QrMenuItem[];
  /** session ที่เปิดอยู่ของโต๊ะ (หรือโต๊ะปลายทางที่ถูกรวม) — null = ยังไม่มีใครสั่ง (ส่งรอบแรกเปิดให้เอง) */
  session: { id: string; rounds: QrRound[] } | null;
  serviceChargeBp: number;
  ver: string;
};
export type QrTableDoorResult = { ok: true; view: QrTableView } | QrRefusal;
export type QrTablePollResult = { ok: true; changed: false; ver: string } | { ok: true; changed: true; ver: string; view: QrTableView } | QrRefusal;

export type QrQuoteLine = { productId: string; qty: number; unitPriceSatang: number; lineTotalSatang: number; priceSource: PriceSource; options: { choiceId: string; name: string; priceDeltaSatang: number }[] };
export type QrQuoteResult = { ok: true; lines: QrQuoteLine[]; subtotalSatang: number; serviceChargeSatang?: number; totalSatang: number } | QrRefusal;

export type QrBillLine = { name: string; qty: number; options: string[]; amountSatang: number };
export type QrTableBill = { lines: QrBillLine[]; subtotalSatang: number; serviceChargeSatang: number; totalSatang: number; promptpayPayload: string | null; payHidden: boolean };
export type QrTableBillResult = { ok: true; bill: QrTableBill } | QrRefusal;

export type QrLinkView = { unit: { name: string }; /** POS P2.7U ▸ หัวร้าน (เพิ่มล้วน) ◂ */ shop?: QrShopHeader; open: boolean; closedReason?: QrClosedReason; menu: QrMenuItem[]; prepMinutes: number };
export type QrLinkDoorResult = { ok: true; view: QrLinkView } | QrRefusal;

export type QrPlaceRoundResult = { ok: true; roundId: string; sessionId: string } | QrRefusal;
export type QrPlacePreorderResult = { ok: true; orderToken: string; duplicated: boolean } | QrRefusal;
export type QrOkResult = { ok: true } | QrRefusal;

/** สถานะที่ลูกค้าเห็น (มาจาก PosOrder.status + paymentState) */
export type QrOrderPay = { kind: "PROMPTPAY_STATIC" | "PROMPTPAY_BEAM" | "CARD_BEAM"; amountSatang: number; qrPayload: string | null; expiresAt: string; status: "PENDING" | "PAID" | "CONSUMED" | "EXPIRED" | "CANCELLED" };
export type QrOrderStatusView = {
  code: string;
  status: "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "HANDED" | "REJECTED" | "CANCELLED";
  paymentState: string;
  totalSatang: number;
  payBy: string | null;
  paidAt: string | null;
  claimedAt: string | null;
  /** ใบขอรับเงินของออเดอร์ — แสดง QR เฉพาะตอน PENDING_PAYMENT */
  pay: QrOrderPay | null;
  /** ใบเสร็จออนไลน์ /r/<token> หลังร้านรับออเดอร์ (บิลเกิดตอนรับ) */
  receiptToken: string | null;
  phoneMasked: string | null;
  customerName: string;
  unit: { name: string };
  /** POS P2.7U ▸ หัวร้าน (เพิ่มล้วน) ◂ */
  shop?: QrShopHeader;
  /** POS P2.7U ▸ โทเคนลิงก์สั่งล่วงหน้าที่ใช้อยู่ของสาขา (ปุ่ม "ลองใหม่" ของหน้าหมดเวลา 19ค · null = ร้านปิดลิงก์แล้ว) — เพิ่มล้วน ◂ */
  orderAgainToken?: string | null;
  /** เวลารับโดยประมาณ (หลังร้านรับ = acceptedAt + prepMinutes) */
  readyEta: string | null;
  /** เหตุของการปิด (หมดเวลาจ่าย · ร้านปฏิเสธ · ยกเลิก) — ร้านคืนเงินให้ภายหลังเมื่อจ่ายแล้ว */
  closedReason: "PAYMENT_EXPIRED" | "REJECTED" | "CANCELLED" | null;
  refundPending: boolean;
  lines: { name: string; qty: number; options: string[]; lineTotalSatang: number }[];
};
export type QrOrderStatusResult = { ok: true; changed: false; ver: string } | { ok: true; changed: true; ver: string; view: QrOrderStatusView } | QrRefusal;

/** รุ่นของภาพที่หน้าถือ — เท่าเดิม = changed:false (โพลไม่เขียนอะไร · มติ 11) */
export function sinceVer(parts: readonly (string | number | null | undefined)[]): string {
  return parts.map((p) => (p === null || p === undefined ? "-" : String(p))).join(".");
}
