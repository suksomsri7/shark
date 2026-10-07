// register-shared.ts — ชนิดข้อมูล ค่าคงที่ และตัวช่วยบริสุทธิ์ของหน้าขายใหม่ (POS P1.3)
//
// 🔴 ไฟล์นี้ client component import ได้: import ค่าได้แค่ `./pricing-shared` และ `@/lib/ui/money` (ข้อสอบ S5.14 · สเปก G9)
//    ห้ามแตะ prisma / register.ts / catalog.ts / service.ts — ฝั่งเซิร์ฟเวอร์อยู่ที่ register.ts + register-actions.ts
// 🔴 สัญญาข้อมูล = สเปก §3.2 + มติ Q6 Q9 Q21–Q23 Q25 + Addendum 2 (รหัสปฏิเสธ · submit ต้องมี expectedGrandTotalSatang · CASH/PROMPTPAY)
//    ข้อความ `message` ที่เซิร์ฟเวอร์คืนเป็นภาษาไทยไว้ดูใน log — จอ "ห้าม" แสดง ใช้ `refusalMessageKey(code)` → คีย์ pos.register.errors.*

import { formatBaht } from "@/lib/ui/money";
import type { PriceDiscount, PriceCartInput, PriceVat } from "./pricing-shared";

// ═══════════ ค่าคงที่ ═══════════
export const REGISTER_MAX_LINES = 200;
export const REGISTER_MAX_QTY = 9999;
/** "เหลือ N" เมื่อ stockLeft ≤ ค่านี้ (มติ Q10) */
export const REGISTER_LOW_STOCK = 5;
/** ขนาดหน้าปริยายของ registerCatalog (สูงสุด REGISTER_PAGE_MAX) */
export const REGISTER_PAGE_SIZE = 100;
export const REGISTER_PAGE_MAX = 500;
/** วิธีจ่ายที่หน้าขายรับ (P1.3 Addendum 2 + P1.6 R2: โอน + บัตรแบบกรอกเลขอ้างอิง EDC · ไม่มีเกตเวย์ = P1.7) */
export const REGISTER_PAY_TYPES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"] as const;
/** P1.6 R2: แบ่งจ่ายได้ไม่เกินกี่รายการ (ชนิดซ้ำได้ · เงินสดได้รายการเดียว) — เกิน = SPLIT_INVALID */
export const REGISTER_MAX_PAY_METHODS = 10;
/** P1.6 R5: หมายเหตุบิล/บรรทัดยาวได้ไม่เกิน (ตัวอักษร) */
export const REGISTER_NOTE_MAX = 500;
/** P1.6: เลขอ้างอิงบัตร/โอน ยาวได้ไม่เกิน */
export const REGISTER_REFERENCE_MAX = 100;
/** POS P1.2 R1: ตัวเลือกต่อบรรทัดได้ไม่เกิน (เกิน = VALIDATION) */
export const REGISTER_MAX_OPTIONS_PER_LINE = 20;
/** POS P1.2 R12: น้ำหนักที่กรอกเอง (กรัม) ได้ 1–ค่านี้ */
export const REGISTER_MAX_WEIGHT_GRAMS = 99_999;
/** เพดานส่วนลดปริยายของ STAFF (basis point · docs/modules/14-pos.md §9) — OWNER/MANAGER ไม่จำกัด เว้นตั้ง `pos._maxDiscountBp` */
export const REGISTER_STAFF_MAX_DISCOUNT_BP = 1000;

/** POS P1.5: บิลที่พัก (HELD) อายุเกินกี่วันนับจาก createdAt (24 ชม.ต่อวัน แบบเลื่อน) ⇒ ทิ้งเองตอนเปิดรายการ — ตั้งได้ที่
 *  `AppSystem(POS).settings.pos.heldCart.expireDays` (จำนวนเต็ม 1–365) · ไม่ตั้ง/ผิดรูป = ค่านี้ */
export const HELD_CART_EXPIRE_DAYS = 2;
/** ป้ายบิลที่พักยาวได้ไม่เกิน (ตัวอักษร) */
export const HELD_CART_LABEL_MAX = 60;

// ═══════════ ธงหน้าขายใหม่ (มติ Q4) ═══════════
/**
 * ธง `AppSystem(POS).settings.pos.registerV2` — เทียบ === true เคร่ง (สตริง "true" / 1 = จอเดิม)
 * 🔴 ตัวอ่านเดียวของธงนี้: register/page.tsx (เลือกจอ) + app/layout.tsx (บอก shell ว่าหน้าขายของระบบไหนเป็นโหมดราง — B2.1)
 *    ทั้งคู่ต้องตัดสินตรงกัน ไม่งั้นจอเดิมได้รางหรือจอใหม่ได้แถบเต็ม ⇒ ห้ามเขียนตัวอ่านซ้ำที่อื่น
 */
export function posRegisterV2On(settings: unknown): boolean {
  const s = (settings ?? {}) as { pos?: { registerV2?: unknown } | null };
  return typeof s === "object" && s.pos?.registerV2 === true;
}

// ═══════════ ชนิดข้อมูล ═══════════
export type RegisterRole = "OWNER" | "MANAGER" | "STAFF";

/** ผู้ขาย — ทรงเดียวกับ MemberActor · action สร้างจาก membership ของ SESSION เท่านั้น */
export type RegisterActor = { userId: string; role: RegisterRole; unitAccess: string[]; permissions: Record<string, unknown> };
/** ขอบเขตของคำขอ: ร้าน (จาก session) + ระบบ POS + สาขา */
/** POS P1.9: deviceId = รหัสเครื่อง (client สร้างครั้งเดียวเก็บ localStorage · [A-Za-z0-9_-]{8,64}) — ใช้หากะของเครื่อง · ผิดรูป = VALIDATION */
export type RegisterCtx = { tenantId: string; systemId: string; unitId: string; deviceId?: string };

/** คำศัพท์รหัสปฏิเสธ (ชุดเดียวกับ catalog + สเปก §4.6 + Addendum) */
export type RegisterRefusalCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION"
  | "INVALID_LINE"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "OPTIONS_REQUIRED"
  | "MEMBER_NOT_FOUND"
  | "MEMBER_RIGHTS_UNSUPPORTED"
  | "PRICE_NOT_SET"
  | "PRICE_CHANGED"
  | "PAYMENT_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "LINE_DISCOUNT_EXCEEDS_LINE"
  | "BILL_DISCOUNT_EXCEEDS_TOTAL"
  | "DISCOUNT_EXCEEDS_LIMIT"
  | "TOO_MANY_LINES"
  | "STOCK_INSUFFICIENT"
  | "CONFLICT"
  | "BUSY"
  | "INTERNAL"
  | "UNKNOWN"
  // POS P1.5: เรียกคืนบิลที่พักซึ่งเครื่องอื่นเรียกไปแล้ว (ผู้ชนะคนเดียว · H2)
  | "ALREADY_RECALLED"
  // POS P1.6: สาขาไม่ใช่ของจุดขายนี้ / ร้านมีหลายจุดขายแต่สาขาไม่ผูก (O21) · แบ่งจ่ายเกินเพดาน · เปิดทิปโดยไม่มีบัญชีพักทิป
  | "UNIT_SYSTEM_MISMATCH"
  | "SPLIT_INVALID"
  | "TIP_ACCOUNT_REQUIRED"
  // POS P1.9: กะ/ลิ้นชัก
  | "SHIFT_REQUIRED"
  | "SHIFT_ALREADY_OPEN"
  | "SHIFT_CLOSED"
  | "REASON_REQUIRED"
  | "DRAWER_INSUFFICIENT"
  // POS P1.2: ตัวเลือก (ไม่มีในกลุ่มที่ผูก/เกินจำนวน · หมดชั่วคราว) · ขายแม่ที่มีตัวแปร · สินค้าชั่งไม่มีน้ำหนัก
  | "OPTIONS_INVALID"
  | "OPTION_UNAVAILABLE"
  | "VARIANT_REQUIRED"
  | "WEIGHT_REQUIRED"
  // POS P1.10: เครื่องที่ถูกเพิกถอน (ขาย/เปิดกะ/พัก/เรียกคืน) · ลงทะเบียนเกินเพดาน · ไม่พบเครื่องในสาขานี้
  | "DEVICE_REVOKED"
  | "DEVICE_LIMIT"
  | "DEVICE_NOT_FOUND";

/** คำปฏิเสธ — คืนค่า ไม่ throw · `lineIndex` = บรรทัดที่ผิด (ลำดับเดียวกับที่ส่งมา) ถ้าระบุได้ */
export type RegisterRefusal = { ok: false; code: RegisterRefusalCode; message: string; lineIndex?: number };

export type RegisterSoldOutReason = "UNAVAILABLE" | "NO_STOCK";
export type RegisterProduct = {
  id: string;
  invItemId: string | null;
  name: string;
  nameEn: string | null;
  kind: "PRODUCT" | "SERVICE" | "MENU" | "BUNDLE";
  categoryId: string | null;
  /** null = ยังไม่ตั้งราคา (ไม่ใช้ต้นทุนแทน · ขายได้เฉพาะราคาเปิดของผู้มี pos.sale.priceOverride) */
  priceSatang: number | null;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  /** P1.2: ตัวแปรใช้กลุ่มของสินค้าแม่ (P6) */
  optionGroupCount: number;
  /** กลุ่มตัวเลือกบังคับ (minSelect ≥ 1) — > 0 = ต้องส่ง options ที่เลือกครบ (P1.2 R2 · ไม่ครบ = OPTIONS_REQUIRED) */
  requiredOptionGroupCount: number;
  /** P1.2 R6: แม่ของตัวแปร (null = ไม่ใช่ตัวแปร) · ตัวแปรที่ไม่ตั้งราคาใช้ราคาแม่ใน priceSatang แล้ว (P5) */
  parentId: string | null;
  /** P1.2 R6: จำนวนตัวแปรที่ขายได้ที่สาขานี้ — > 0 = ต้องเลือกตัวแปร (ขายแม่ตรง = VARIANT_REQUIRED) */
  variantCount: number;
  /** P1.2 R9: ขายตามน้ำหนัก — priceSatang = ราคาต่อกิโลกรัม · ต้องส่ง weighedBarcode หรือ weightGrams (ไม่ส่ง = WEIGHT_REQUIRED) */
  soldByWeight: boolean;
  soldOut: boolean;
  /** UNAVAILABLE = ปิดขายที่สาขา (กดขายไม่ได้ · ชนะหมดสต็อก) · NO_STOCK = นับสต็อกและหมด (ยังขายได้ · ติดลบตามนโยบายปริยาย) */
  soldOutReason: RegisterSoldOutReason | null;
  /** คงเหลือเมื่อนับสต็อก · null = ไม่นับ */
  stockLeft: number | null;
  trackStock: boolean;
  trackStockMode: "auto" | "on" | "off";
};
export type RegisterCategory = { id: string; name: string; nameEn: string | null; productCount: number };

export type RegisterCatalogInput = { q?: string; categoryId?: string; cursor?: string; limit?: number };
export type RegisterCatalogResult = { ok: true; categories: RegisterCategory[]; products: RegisterProduct[]; nextCursor: string | null } | RegisterRefusal;

/** P1.2 R11: ผลสแกนป้ายเครื่องชั่ง — code = ป้ายที่ต้องส่งต่อเป็น weighedBarcode · ค่าใดคิดไม่ได้ (ไม่มีราคาต่อกก.) = null */
export type RegisterWeighedScan = { code: string; grams: number | null; priceSatang: number | null };
export type RegisterScanResult =
  | { ok: true; match: "one"; product: RegisterProduct; weighed?: RegisterWeighedScan }
  | { ok: true; match: "choose"; products: RegisterProduct[] }
  | { ok: true; match: "none" }
  | RegisterRefusal;

/** บรรทัดของคำขอ quote/submit — สินค้า (productId) หรือรายการกำหนดเอง (name + unitPriceSatang) */
/**
 * P1.2: options = ตัวเลือกที่เลือก (≤ REGISTER_MAX_OPTIONS_PER_LINE · ไม่ซ้ำ · ราคา/ชื่อจาก client ถูกเมิน) ·
 * สินค้าชั่ง = weighedBarcode (ป้ายเครื่องชั่ง) หรือ weightGrams (กรอกเอง · ต้องมี pos.sale.priceOverride) อย่างใดอย่างหนึ่ง · qty 1
 */
export type RegisterLineOptionInput = { choiceId: string };
export type RegisterQuoteLineInput =
  | {
      productId: string;
      qty: number;
      discount?: PriceDiscount;
      openPrice?: true;
      unitPriceSatang?: number;
      note?: string;
      options?: RegisterLineOptionInput[];
      weighedBarcode?: string;
      weightGrams?: number;
    }
  | { name: string; qty: number; unitPriceSatang: number; discount?: PriceDiscount; note?: string };
/** ไม่มีช่องคูปองโดยตั้งใจ (มติ Q12 — couponCode/couponDiscountSatang = VALIDATION) */
export type RegisterQuoteInput = { lines: RegisterQuoteLineInput[]; billDiscount?: PriceDiscount; memberId?: string };

/** P1.2 R3: ตัวเลือกที่เซิร์ฟเวอร์ใช้คิดราคา (ราคา/ชื่อสดจาก DB) */
export type RegisterQuoteLineOption = { choiceId: string; groupId: string; name: string; priceDeltaSatang: number };
export type RegisterQuoteLine = {
  productId: string | null;
  /** = ราคาฐาน (หรือราคาของน้ำหนัก) + optionsSatang */
  unitPriceSatang: number;
  grossSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
  /** P1.2 R3: Σ priceDelta ต่อหน่วย (0 = ไม่มีตัวเลือก) */
  optionsSatang: number;
  options: RegisterQuoteLineOption[];
  /** P1.2 R12: น้ำหนักของบรรทัดชั่ง (กรัม) · อื่น ๆ = null */
  weightGrams: number | null;
};
export type RegisterQuoteTotals = {
  /** Σ gross ก่อนส่วนลดบรรทัด = "รวม" บนจอ (มติ Q7 · ต่างจาก PosSale.subtotalSatang ที่หลังส่วนลดบรรทัด) */
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  couponDiscountSatang: number;
  netSatang: number;
  /** P1.6 ค่าบริการ (รวมอยู่ใน grandTotal + ฐาน VAT) · ระบบไม่เปิดค่าบริการ = 0 */
  serviceChargeSatang: number;
  vatSatang: number;
  grandTotalSatang: number;
  /** ตรงลำดับบรรทัดที่ส่งมา · ราคาต่อหน่วย = ราคาที่เซิร์ฟเวอร์ใช้จริง (มติ Q22) */
  lines: RegisterQuoteLine[];
  vatMode: "INCLUDED" | "NONE";
  vatRateBp: number;
};
export type RegisterQuote = { ok: true } & RegisterQuoteTotals;
export type RegisterQuoteResult = RegisterQuote | RegisterRefusal;

export type RegisterPayType = (typeof REGISTER_PAY_TYPES)[number];
/** reference = เลขอ้างอิงบัตร/EDC หรือโอน (P1.6 · ≤ REGISTER_REFERENCE_MAX · เงินสด/พร้อมเพย์ไม่มี) */
export type RegisterPayMethod = { type: RegisterPayType; amountSatang: number; reference?: string };
export type RegisterSubmitInput = RegisterQuoteInput & {
  /** คีย์เดียวต่อบิล — คงเดิมทุกการลองซ้ำ (สเปก §3.4) */
  idempotencyKey: string;
  payMethods: RegisterPayMethod[];
  /** ต้องมีเมื่อมีส่วนเงินสด และ ≥ ส่วนเงินสด */
  cashReceivedSatang?: number;
  /** P1.6 ทิป (สตางค์ · นอกยอดบิล ⇒ Σ วิธีจ่าย = ยอดบิล + ทิป) — ส่งได้เมื่อระบบเปิดรับทิปเท่านั้น */
  tipSatang?: number;
  /** P1.6 หมายเหตุบิล (≤ REGISTER_NOTE_MAX) */
  note?: string;
  /** ยอดที่แคชเชียร์เห็นจาก quote ล่าสุด (บังคับ · จำนวนเต็ม ≥ 0) — ไม่ตรงยอดเซิร์ฟเวอร์ = PRICE_CHANGED */
  expectedGrandTotalSatang: number;
};
export type RegisterSubmitOk = { ok: true; saleId: string; receiptNo: string | null; grandTotalSatang: number; changeSatang: number; duplicated: boolean };
/** PRICE_CHANGED พกยอดสดของเซิร์ฟเวอร์มาด้วย (จอแสดงใหม่ได้ทันทีไม่ต้อง quote ซ้ำ) */
export type RegisterPriceChanged = { ok: false; code: "PRICE_CHANGED"; message: string } & RegisterQuoteTotals;
/**
 * B1.1 (มติ 3.2 ข้อ 1–2): IDEMPOTENCY_CONFLICT = "มีบิลของคีย์นี้อยู่แล้ว" — ไม่ใช่ "ไม่มีบิล"
 * พก saleId/receiptNo/สถานะของบิลนั้น (รวมบิลที่ VOIDED แล้ว) ⇒ จอแสดงบิลเดิม ห้ามขายซ้ำด้วยคีย์ใหม่เงียบ ๆ
 * R4 K2: บิลนอกระบบ+สาขาของคำขอ (หรือโมดูลอื่น) = CONFLICT เปล่า → มาในรูป RegisterRefusal code IDEMPOTENCY_CONFLICT (ไม่มีฟิลด์บิล)
 */
export type RegisterSaleStatus = "PAID" | "VOIDED" | "REFUNDED";
export type RegisterIdempotencyConflict = {
  ok: false;
  code: "IDEMPOTENCY_CONFLICT";
  message: string;
  saleId: string;
  receiptNo: string | null;
  saleStatus: RegisterSaleStatus;
};
export type RegisterSubmitResult = RegisterSubmitOk | RegisterPriceChanged | RegisterIdempotencyConflict | RegisterRefusal;

export type RegisterStatus = {
  ok: true;
  unit: { id: string; name: string };
  /** roleLabel = ภาษาไทยจากเซิร์ฟเวอร์ · จออังกฤษแปลจาก role (มติ Q23) */
  user: { name: string; roleLabel: string; role: RegisterRole };
  /** กะ OPEN ของเครื่องนี้ (P1.9 · null = ยังไม่เปิด/ไม่ส่ง deviceId) */
  shift: RegisterShiftInfo | null;
  /** P1.9: จุดขายนี้บังคับเปิดกะก่อนขาย (S6) — true + shift null = ปุ่มชำระถูกล็อก "เปิดกะก่อนเริ่มขาย" */
  shiftRequired?: boolean;
  /** บิลวันนี้ (เวลาไทย) ที่ยังตัดสต็อกไม่ครบ */
  pendingStockCount: number;
  /** บิลออฟไลน์รอซิงก์ = P3 — วันนี้ 0 เสมอ */
  pendingSyncCount: number;
};
export type RegisterStatusResult = RegisterStatus | RegisterRefusal;
/** POS P1.9 (S15) — กะของเครื่องบนแถบสถานะ */
export type RegisterShiftInfo = { id: string; shiftNo: number; openedAt: string; openedByName: string; deviceLabel: string | null };

export type RegisterVatConfig = { ok: true; mode: "INCLUDED" | "NONE"; rateBp: number };

// ═══════════ POS P1.2 R7 — ตัวเลือก/ตัวแปรของสินค้า (ป๊อปโอเวอร์ภาพ 01) ═══════════
export type RegisterOptionChoice = { choiceId: string; name: string; nameEn: string | null; priceDeltaSatang: number; isDefault: boolean; unavailable: boolean };
export type RegisterOptionGroup = { groupId: string; name: string; nameEn: string | null; minSelect: number; maxSelect: number; choices: RegisterOptionChoice[] };
export type RegisterVariant = { id: string; name: string; nameEn: string | null; priceSatang: number | null; barcode: string | null; soldOut: boolean };
/** กลุ่มตามลำดับผูก (ตัวแปร = กลุ่มของแม่) · ตัวเลือกที่เก็บถาวรไม่อยู่ · 86 = unavailable · isDefault ให้จอเลือกไว้ก่อน (เซิร์ฟเวอร์ไม่ใส่ให้เอง) */
export type RegisterProductOptionsResult = { ok: true; productId: string; groups: RegisterOptionGroup[]; variants: RegisterVariant[] } | RegisterRefusal;
export type RegisterVatConfigResult = RegisterVatConfig | RegisterRefusal;

// ═══════════ POS P1.5 — พักบิล / เรียกคืน ═══════════
/** แถวในลิ้นชักบิลที่พัก · createdAt = ISO · preview = ชื่อรายการย่อ (ตอนพัก) · heldByName = ชื่อผู้พัก (ไม่มี = null) */
export type HeldCartSummary = {
  id: string;
  label: string | null;
  lineCount: number;
  approxTotalSatang: number;
  heldByUserId: string;
  heldByName: string | null;
  preview: string;
  createdAt: string;
};
/** P1.2 R2 F5: PERMISSION_DENIED = บรรทัดยังขายได้ แต่ผู้เรียกคืนไม่มีสิทธิ์ที่บรรทัดต้องใช้ (เช่น น้ำหนักที่กรอกเอง = pos.sale.priceOverride) */
export type HeldCartNoticeCode = "PRICE_CHANGED" | "PRODUCT_NOT_FOUND" | "PRODUCT_UNAVAILABLE" | "PERMISSION_DENIED";
/** คำเตือนต่อบรรทัดตอนเรียกคืน (ลำดับบรรทัดเดียวกับ cart ที่คืน) — PRICE_CHANGED มีราคาตอนพัก/ราคาปัจจุบัน */
export type HeldCartNotice = { lineIndex: number; code: HeldCartNoticeCode; heldUnitPriceSatang?: number; unitPriceSatang?: number };
export type HoldRegisterCartInput = { cart: RegisterQuoteInput; label?: string | null };
export type HoldRegisterCartResult = { ok: true; heldCart: HeldCartSummary } | RegisterRefusal;
/** expireDays = วันหมดอายุที่ระบบนี้ใช้จริง (settings หรือค่าปริยาย) — ลิ้นชักแสดงค่านี้ */
export type ListHeldCartsResult = { ok: true; items: HeldCartSummary[]; count: number; expireDays: number } | RegisterRefusal;
/** quote = ราคาปัจจุบัน (ไม่ใช่ราคาตอนพัก) · บรรทัดที่ขายไม่ได้แล้วยังอยู่ใน cart พร้อม notice (quote จึงไม่ ok จนกว่าจะเอาออก) ·
 *  products = สินค้าของบรรทัดที่ยังขายได้ (จอใช้แสดงชื่อ/ราคา) · lineNames = ชื่อสินค้าต่อบรรทัด (null = รายการกำหนดเอง/ไม่พบ) */
export type RecallHeldCartResult =
  | { ok: true; heldCartId: string; cart: RegisterQuoteInput; quote: RegisterQuoteResult; notices: HeldCartNotice[]; products: RegisterProduct[]; lineNames: (string | null)[] }
  | RegisterRefusal;
export type DiscardHeldCartResult = { ok: true } | RegisterRefusal;

// ═══════════ สถานะตะกร้าฝั่ง client (สเปก §3.3) ═══════════
/** P1.2 R13: options = choiceId ที่เลือก (ไม่มี/ว่าง = ไม่มีตัวเลือก) · บรรทัดชั่ง = weighedBarcode หรือ weightGrams (qty 1 · ไม่รวม +1) */
export type RegisterCartLine =
  | {
      key: string;
      kind: "product";
      productId: string;
      qty: number;
      discount?: PriceDiscount;
      openPriceSatang?: number;
      options?: string[];
      weighedBarcode?: string;
      weightGrams?: number;
      /** P1.6 R5: หมายเหตุบรรทัด (≤ REGISTER_NOTE_MAX · ส่งไปกับ quote/submit · บิลที่พักไม่เก็บ) */
      note?: string;
    }
  | { key: string; kind: "custom"; name: string; unitPriceSatang: number; qty: number; discount?: PriceDiscount; note?: string };
/** couponCode อยู่ในสถานะได้ (P1.12) แต่ `cartToQuoteInput` ไม่ส่งไปเซิร์ฟเวอร์ใน P1.3 · note = หมายเหตุบิล (P1.6 R5 · ส่งตอน submit เท่านั้น) */
export type RegisterCart = { lines: RegisterCartLine[]; billDiscount?: PriceDiscount; couponCode?: string; memberId?: string; note?: string };

/** ชุดตัวเลือกแบบไม่ขึ้นกับลำดับ (multiset · undefined ≡ []) */
const optionSetKey = (o: readonly string[] | undefined): string => [...(o ?? [])].sort().join("\u0000");
const isWeighedLine = (l: RegisterCartLine): boolean => l.kind === "product" && (l.weighedBarcode !== undefined || l.weightGrams !== undefined);

/**
 * P1.4 B2: เพิ่มสินค้า 1 ชิ้น (แตะการ์ด · สแกน) — สแกนซ้ำ = +1 ที่บรรทัดแรกของสินค้าเดียวกันที่ไม่มีส่วนลดและไม่ใช่ราคาเปิด (ราคาเดียวกัน)
 *   ไม่มีบรรทัดแบบนั้น = บรรทัดใหม่ {key:newLineKey, qty 1} · เพดาน REGISTER_MAX_QTY · ตะกร้าเต็ม REGISTER_MAX_LINES = คืนตะกร้าเดิม
 *   ไม่แก้ตะกร้าที่ส่งเข้า (คง billDiscount/memberId)
 * P1.2 R13: options = choiceId ที่เลือกจากป๊อปโอเวอร์ — +1 เฉพาะบรรทัดที่ "ชุดตัวเลือกเดียวกัน" (ไม่ขึ้นกับลำดับ · undefined ≡ []) ·
 *   บรรทัดชั่งไม่เป็นเป้า +1 เสมอ (ใช้ cartAddWeighed)
 * P1.2 U R2 (มติผู้คุมงาน ข้อ 2): คีย์รวมบรรทัด = สินค้า (ตัวแปร = productId ของลูก) + ชุดตัวเลือก + หมายเหตุ — แตะการ์ดธรรมดา (ไม่มี note)
 *   รวมได้เฉพาะบรรทัดที่ไม่มีหมายเหตุ · note = หมายเหตุรายการจากป๊อปโอเวอร์ (ว่าง ≡ ไม่มี) · บรรทัดใหม่เก็บ note ด้วย
 */
export function cartAddProduct(cart: RegisterCart, productId: string, newLineKey: string, options?: string[], note?: string): RegisterCart {
  const want = optionSetKey(options);
  const wantNote = note && note.trim() ? note : "";
  const same = cart.lines.findIndex(
    (l) =>
      l.kind === "product" &&
      l.productId === productId &&
      !l.discount &&
      l.openPriceSatang === undefined &&
      !isWeighedLine(l) &&
      optionSetKey(l.options) === want &&
      (l.note && l.note.trim() ? l.note : "") === wantNote,
  );
  if (same >= 0) {
    if (cart.lines[same]!.qty >= REGISTER_MAX_QTY) return cart;
    return { ...cart, lines: cart.lines.map((l, i) => (i === same ? { ...l, qty: Math.min(REGISTER_MAX_QTY, l.qty + 1) } : l)) };
  }
  if (cart.lines.length >= REGISTER_MAX_LINES) return cart;
  return {
    ...cart,
    lines: [...cart.lines, { key: newLineKey, kind: "product", productId, qty: 1, ...(options && options.length ? { options: [...options] } : {}), ...(wantNote ? { note: wantNote } : {}) }],
  };
}

/**
 * P1.2 R12/R13: เพิ่มบรรทัดชั่ง (qty 1 · ไม่รวมกับบรรทัดใด) — ป้ายเครื่องชั่ง (weighedBarcode จาก registerScan) หรือน้ำหนักที่กรอกเอง (weightGrams)
 *   ส่งมาทั้งสองหรือไม่ส่งเลย / ตะกร้าเต็ม = คืนตะกร้าเดิม · ราคาจริงมาจาก quote (เซิร์ฟเวอร์ถอดป้ายเอง)
 */
export function cartAddWeighed(
  cart: RegisterCart,
  productId: string,
  newLineKey: string,
  weight: { weighedBarcode: string } | { weightGrams: number },
  options?: string[],
): RegisterCart {
  const wb = "weighedBarcode" in weight ? weight.weighedBarcode : undefined;
  const wg = "weightGrams" in weight ? weight.weightGrams : undefined;
  if ((wb === undefined) === (wg === undefined) || cart.lines.length >= REGISTER_MAX_LINES) return cart;
  const line: RegisterCartLine = {
    key: newLineKey,
    kind: "product",
    productId,
    qty: 1,
    ...(options && options.length ? { options: [...options] } : {}),
    ...(wb !== undefined ? { weighedBarcode: wb } : { weightGrams: wg as number }),
  };
  return { ...cart, lines: [...cart.lines, line] };
}

// ═══════════ ตัวช่วยบริสุทธิ์ ═══════════
/**
 * POS P1.5: ตะกร้าที่เรียกคืน (RegisterQuoteInput จากเซิร์ฟเวอร์) → ตะกร้าบนจอ · คีย์บรรทัดใหม่ทุกบรรทัด (newLineKey ต่อบรรทัด) ·
 * ราคาของสินค้าแคตตาล็อกไม่ถูกนำมา (เว้นราคาเปิด) · ไม่มีคูปอง · ไม่มีคีย์บิล (คีย์ใหม่มาจาก resetBill เท่านั้น)
 */
export function quoteInputToCart(input: RegisterQuoteInput, newLineKey: () => string): RegisterCart {
  const lines: RegisterCartLine[] = input.lines.map((l) => {
    const discount = l.discount ? { discount: { ...l.discount } } : {};
    if ("productId" in l && typeof l.productId === "string") {
      // P1.2 R13: ตัวเลือก + น้ำหนักติดไปกับบรรทัด (บิลพักเรียกคืนแล้วตัวเลือก/ป้ายชั่งเดิมครบ)
      const opts = Array.isArray(l.options) ? l.options.map((o) => o.choiceId) : [];
      return {
        key: newLineKey(),
        kind: "product",
        productId: l.productId,
        qty: l.qty,
        ...discount,
        ...(l.openPrice === true && typeof l.unitPriceSatang === "number" ? { openPriceSatang: l.unitPriceSatang } : {}),
        ...(opts.length ? { options: opts } : {}),
        ...(typeof l.weighedBarcode === "string" ? { weighedBarcode: l.weighedBarcode } : {}),
        ...(typeof l.weightGrams === "number" ? { weightGrams: l.weightGrams } : {}),
      };
    }
    const c = l as { name: string; qty: number; unitPriceSatang: number };
    return { key: newLineKey(), kind: "custom", name: c.name, unitPriceSatang: c.unitPriceSatang, qty: c.qty, ...discount };
  });
  return { lines, ...(input.billDiscount ? { billDiscount: { ...input.billDiscount } } : {}), ...(input.memberId ? { memberId: input.memberId } : {}) };
}


/** ตะกร้าบนจอ → คำขอ quote (ชุดเดียวกับที่ submit ส่ง · ไม่ส่งคูปอง · ไม่ส่งราคาของสินค้าแคตตาล็อก) */
export function cartToQuoteInput(cart: RegisterCart): RegisterQuoteInput {
  const lines: RegisterQuoteLineInput[] = cart.lines.map((l) => {
    // P1.6 R5: หมายเหตุบรรทัดไปกับคำขอ (ว่าง = ไม่ส่ง)
    const note = l.note && l.note.trim() ? { note: l.note } : {};
    if (l.kind === "custom") {
      return { name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, ...(l.discount ? { discount: { ...l.discount } } : {}), ...note };
    }
    return {
      productId: l.productId,
      qty: l.qty,
      ...(l.discount ? { discount: { ...l.discount } } : {}),
      ...note,
      ...(l.openPriceSatang !== undefined ? { openPrice: true as const, unitPriceSatang: l.openPriceSatang } : {}),
      // P1.2 R13: ส่งแค่ choiceId (ราคา/ชื่อคิดที่เซิร์ฟเวอร์) · บรรทัดชั่งส่งป้าย/น้ำหนัก
      ...(l.options && l.options.length ? { options: l.options.map((choiceId) => ({ choiceId })) } : {}),
      ...(l.weighedBarcode !== undefined ? { weighedBarcode: l.weighedBarcode } : {}),
      ...(l.weightGrams !== undefined ? { weightGrams: l.weightGrams } : {}),
    };
  });
  return {
    lines,
    ...(cart.billDiscount ? { billDiscount: { ...cart.billDiscount } } : {}),
    ...(cart.memberId ? { memberId: cart.memberId } : {}),
  };
}

/**
 * ตะกร้า + การจ่าย → คำขอ submit · เก็บผลไว้แล้วส่งตัวเดิมทุกครั้งที่ลองซ้ำ (สเปก §3.4 ข้อ 6 — payload ต้องเหมือนเดิมทุกไบต์
 * ไม่งั้นได้ IDEMPOTENCY_CONFLICT) · ไม่มีส่วนเงินสด = ไม่ส่ง cashReceivedSatang
 */
export function cartToSubmitInput(
  cart: RegisterCart,
  pay: { idempotencyKey: string; payMethods: RegisterPayMethod[]; cashReceivedSatang?: number; expectedGrandTotalSatang: number; tipSatang?: number; note?: string },
): RegisterSubmitInput {
  const hasCash = pay.payMethods.some((p) => p.type === "CASH" && p.amountSatang > 0);
  return {
    ...cartToQuoteInput(cart),
    idempotencyKey: pay.idempotencyKey,
    payMethods: pay.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang, ...(p.reference ? { reference: p.reference } : {}) })),
    ...(hasCash && pay.cashReceivedSatang !== undefined ? { cashReceivedSatang: pay.cashReceivedSatang } : {}),
    ...(pay.tipSatang ? { tipSatang: pay.tipSatang } : {}),
    ...(pay.note ? { note: pay.note } : {}),
    expectedGrandTotalSatang: pay.expectedGrandTotalSatang,
  };
}

/**
 * ตะกร้า → อินพุตของ priceCart สำหรับคิดยอดทันใจบนจอ (ราคาจากกริด · VAT/เพดานจากหน้าเพจ) — ยอดจริงมาจาก quote เสมอ
 * สินค้าที่ไม่รู้จัก/ยังไม่ตั้งราคา (และไม่มีราคาเปิด) = คืนคำปฏิเสธ (ไม่เดาราคา)
 */
export function cartToPriceInput(
  cart: RegisterCart,
  products: ReadonlyMap<string, Pick<RegisterProduct, "priceSatang">> | Readonly<Record<string, Pick<RegisterProduct, "priceSatang">>>,
  vat: { mode: "INCLUDED" | "NONE" | "EXCLUDED"; rateBp: number },
  maxDiscountBp: number | null,
): PriceCartInput | RegisterRefusal {
  const get = (id: string) => (products instanceof Map ? products.get(id) : (products as Record<string, Pick<RegisterProduct, "priceSatang">>)[id]);
  const lines: PriceCartInput["lines"] = [];
  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i]!;
    if (l.kind === "custom") {
      lines.push({ qty: l.qty, unitPriceSatang: l.unitPriceSatang, discount: l.discount ?? null });
      continue;
    }
    const price = l.openPriceSatang ?? get(l.productId)?.priceSatang;
    if (price === undefined) return { ok: false, code: "PRODUCT_NOT_FOUND", message: "ไม่พบสินค้าในตะกร้า", lineIndex: i };
    if (price === null) return { ok: false, code: "PRICE_NOT_SET", message: "สินค้านี้ยังไม่ตั้งราคา", lineIndex: i };
    lines.push({ qty: l.qty, unitPriceSatang: price, discount: l.discount ?? null });
  }
  const v: PriceVat = { mode: vat.mode, rateBp: vat.rateBp };
  return { lines, billDiscount: cart.billDiscount ?? null, vat: v, maxDiscountBp };
}

const REFUSAL_KEY: Readonly<Record<string, string>> = {
  NOT_FOUND: "errors.notFound",
  // POS P1.9 ▸ กะ ◂
  SHIFT_REQUIRED: "errors.shiftRequired",
  SHIFT_ALREADY_OPEN: "errors.shiftAlreadyOpen",
  SHIFT_CLOSED: "errors.shiftClosed",
  REASON_REQUIRED: "errors.reasonRequired",
  DRAWER_INSUFFICIENT: "errors.drawerInsufficient",
  // POS P1.2 ▸ ตัวเลือก · ตัวแปร · สินค้าชั่ง ◂
  OPTIONS_INVALID: "errors.optionsInvalid",
  OPTION_UNAVAILABLE: "errors.optionUnavailable",
  VARIANT_REQUIRED: "errors.variantRequired",
  WEIGHT_REQUIRED: "errors.weightRequired",
  PERMISSION_DENIED: "errors.permissionDenied",
  VALIDATION: "errors.invalidLine",
  INVALID_LINE: "errors.invalidLine",
  PRODUCT_NOT_FOUND: "errors.productNotFound",
  PRODUCT_UNAVAILABLE: "errors.productUnavailable",
  OPTIONS_REQUIRED: "errors.optionsRequired",
  MEMBER_NOT_FOUND: "errors.memberNotFound",
  MEMBER_RIGHTS_UNSUPPORTED: "errors.memberRightsUnsupported",
  PRICE_NOT_SET: "errors.priceNotSet",
  PRICE_CHANGED: "errors.priceChanged",
  PAYMENT_MISMATCH: "errors.paymentMismatch",
  IDEMPOTENCY_CONFLICT: "errors.idempotencyConflict",
  LINE_DISCOUNT_EXCEEDS_LINE: "errors.lineDiscountExceedsLine",
  BILL_DISCOUNT_EXCEEDS_TOTAL: "errors.billDiscountExceedsTotal",
  DISCOUNT_EXCEEDS_LIMIT: "errors.discountExceedsLimit",
  TOO_MANY_LINES: "errors.tooManyLines",
  STOCK_INSUFFICIENT: "errors.stockInsufficient",
  CONFLICT: "errors.conflict",
  BUSY: "errors.busy",
  ALREADY_RECALLED: "errors.alreadyRecalled",
  // POS P1.6
  UNIT_SYSTEM_MISMATCH: "errors.unitSystemMismatch",
  SPLIT_INVALID: "errors.splitInvalid",
  TIP_ACCOUNT_REQUIRED: "errors.tipAccountRequired",
  TIP_NOT_AVAILABLE: "errors.tipNotAvailable", // R2 F5 (ค่าตั้งการชำระเงิน)
  // POS P1.9b ▸ นับย้อนหลังกะที่บังคับปิด ◂
  SHIFT_NOT_FORCED: "errors.shiftNotForced",
  ALREADY_RECOUNTED: "errors.alreadyRecounted",
  // POS P1.10 ▸ ทะเบียนเครื่อง ◂
  DEVICE_REVOKED: "errors.deviceRevoked",
  DEVICE_LIMIT: "errors.deviceLimit",
  DEVICE_NOT_FOUND: "errors.deviceNotFound",
};

/**
 * รหัสปฏิเสธ → คีย์ข้อความใต้ `pos.register` (สเปก §4.6 + Addendum 2) · INTERNAL / UNKNOWN / รหัสที่ไม่รู้จัก = errors.unknown
 * จอห้ามแสดง `message` ของเซิร์ฟเวอร์ (ภาษาไทย) และห้ามแสดงรหัสดิบ
 */
export function refusalMessageKey(code: string): string {
  return Object.prototype.hasOwnProperty.call(REFUSAL_KEY, code) ? REFUSAL_KEY[code]! : "errors.unknown";
}

/** เงินบนจอ: ทศนิยมเฉพาะเมื่อมีเศษสตางค์ (8550 → ฿85.50 · 62500 → ฿625 · −1000 → −฿10) */
export function moneyText(satang: number): string {
  return formatBaht(satang, { decimals: satang % 100 !== 0 });
}

/** ชื่อตามภาษาจอ — อังกฤษใช้ nameEn ถ้ามี */
export function displayName(row: { name: string; nameEn?: string | null }, locale: string): string {
  return locale.startsWith("en") && row.nameEn ? row.nameEn : row.name;
}
