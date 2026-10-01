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
/** วิธีจ่ายที่หน้าขาย P1.3 รับ (Addendum 2 · ที่เหลือเปิดใน P1.6) */
export const REGISTER_PAY_TYPES = ["CASH", "PROMPTPAY"] as const;
/** เพดานส่วนลดปริยายของ STAFF (basis point · docs/modules/14-pos.md §9) — OWNER/MANAGER ไม่จำกัด เว้นตั้ง `pos._maxDiscountBp` */
export const REGISTER_STAFF_MAX_DISCOUNT_BP = 1000;

// ═══════════ ชนิดข้อมูล ═══════════
export type RegisterRole = "OWNER" | "MANAGER" | "STAFF";

/** ผู้ขาย — ทรงเดียวกับ MemberActor · action สร้างจาก membership ของ SESSION เท่านั้น */
export type RegisterActor = { userId: string; role: RegisterRole; unitAccess: string[]; permissions: Record<string, unknown> };
/** ขอบเขตของคำขอ: ร้าน (จาก session) + ระบบ POS + สาขา */
export type RegisterCtx = { tenantId: string; systemId: string; unitId: string };

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
  | "UNKNOWN";

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
  optionGroupCount: number;
  /** กลุ่มตัวเลือกบังคับ (minSelect ≥ 1) — > 0 = ขายจากหน้านี้ไม่ได้จนกว่า P1.2 (OPTIONS_REQUIRED) */
  requiredOptionGroupCount: number;
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

export type RegisterScanResult =
  | { ok: true; match: "one"; product: RegisterProduct }
  | { ok: true; match: "choose"; products: RegisterProduct[] }
  | { ok: true; match: "none" }
  | RegisterRefusal;

/** บรรทัดของคำขอ quote/submit — สินค้า (productId) หรือรายการกำหนดเอง (name + unitPriceSatang) */
export type RegisterQuoteLineInput =
  | { productId: string; qty: number; discount?: PriceDiscount; openPrice?: true; unitPriceSatang?: number; note?: string }
  | { name: string; qty: number; unitPriceSatang: number; discount?: PriceDiscount; note?: string };
/** ไม่มีช่องคูปองโดยตั้งใจ (มติ Q12 — couponCode/couponDiscountSatang = VALIDATION) */
export type RegisterQuoteInput = { lines: RegisterQuoteLineInput[]; billDiscount?: PriceDiscount; memberId?: string };

export type RegisterQuoteLine = { productId: string | null; unitPriceSatang: number; grossSatang: number; discountSatang: number; lineTotalSatang: number };
export type RegisterQuoteTotals = {
  /** Σ gross ก่อนส่วนลดบรรทัด = "รวม" บนจอ (มติ Q7 · ต่างจาก PosSale.subtotalSatang ที่หลังส่วนลดบรรทัด) */
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  couponDiscountSatang: number;
  netSatang: number;
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
export type RegisterPayMethod = { type: RegisterPayType; amountSatang: number };
export type RegisterSubmitInput = RegisterQuoteInput & {
  /** คีย์เดียวต่อบิล — คงเดิมทุกการลองซ้ำ (สเปก §3.4) */
  idempotencyKey: string;
  payMethods: RegisterPayMethod[];
  /** ต้องมีเมื่อมีส่วนเงินสด และ ≥ ส่วนเงินสด */
  cashReceivedSatang?: number;
  /** ยอดที่แคชเชียร์เห็นจาก quote ล่าสุด (บังคับ · จำนวนเต็ม ≥ 0) — ไม่ตรงยอดเซิร์ฟเวอร์ = PRICE_CHANGED */
  expectedGrandTotalSatang: number;
};
export type RegisterSubmitOk = { ok: true; saleId: string; receiptNo: string | null; grandTotalSatang: number; changeSatang: number; duplicated: boolean };
/** PRICE_CHANGED พกยอดสดของเซิร์ฟเวอร์มาด้วย (จอแสดงใหม่ได้ทันทีไม่ต้อง quote ซ้ำ) */
export type RegisterPriceChanged = { ok: false; code: "PRICE_CHANGED"; message: string } & RegisterQuoteTotals;
/**
 * B1.1 (มติ 3.2 ข้อ 1–2): IDEMPOTENCY_CONFLICT = "มีบิลของคีย์นี้อยู่แล้ว" — ไม่ใช่ "ไม่มีบิล"
 * พก saleId/receiptNo/สถานะของบิลนั้นเสมอ (รวมบิลที่ VOIDED แล้ว) ⇒ จอแสดงบิลเดิม ห้ามขายซ้ำด้วยคีย์ใหม่เงียบ ๆ
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
  /** กะ = P1.9 — วันนี้ null เสมอ */
  shift: null;
  /** บิลวันนี้ (เวลาไทย) ที่ยังตัดสต็อกไม่ครบ */
  pendingStockCount: number;
  /** บิลออฟไลน์รอซิงก์ = P3 — วันนี้ 0 เสมอ */
  pendingSyncCount: number;
};
export type RegisterStatusResult = RegisterStatus | RegisterRefusal;

export type RegisterVatConfig = { ok: true; mode: "INCLUDED" | "NONE"; rateBp: number };
export type RegisterVatConfigResult = RegisterVatConfig | RegisterRefusal;

// ═══════════ สถานะตะกร้าฝั่ง client (สเปก §3.3) ═══════════
export type RegisterCartLine =
  | { key: string; kind: "product"; productId: string; qty: number; discount?: PriceDiscount; openPriceSatang?: number }
  | { key: string; kind: "custom"; name: string; unitPriceSatang: number; qty: number; discount?: PriceDiscount };
/** couponCode อยู่ในสถานะได้ (P1.12) แต่ `cartToQuoteInput` ไม่ส่งไปเซิร์ฟเวอร์ใน P1.3 */
export type RegisterCart = { lines: RegisterCartLine[]; billDiscount?: PriceDiscount; couponCode?: string; memberId?: string };

// ═══════════ ตัวช่วยบริสุทธิ์ ═══════════

/** ตะกร้าบนจอ → คำขอ quote (ชุดเดียวกับที่ submit ส่ง · ไม่ส่งคูปอง · ไม่ส่งราคาของสินค้าแคตตาล็อก) */
export function cartToQuoteInput(cart: RegisterCart): RegisterQuoteInput {
  const lines: RegisterQuoteLineInput[] = cart.lines.map((l) => {
    if (l.kind === "custom") {
      return { name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, ...(l.discount ? { discount: { ...l.discount } } : {}) };
    }
    return {
      productId: l.productId,
      qty: l.qty,
      ...(l.discount ? { discount: { ...l.discount } } : {}),
      ...(l.openPriceSatang !== undefined ? { openPrice: true as const, unitPriceSatang: l.openPriceSatang } : {}),
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
  pay: { idempotencyKey: string; payMethods: RegisterPayMethod[]; cashReceivedSatang?: number; expectedGrandTotalSatang: number },
): RegisterSubmitInput {
  const hasCash = pay.payMethods.some((p) => p.type === "CASH" && p.amountSatang > 0);
  return {
    ...cartToQuoteInput(cart),
    idempotencyKey: pay.idempotencyKey,
    payMethods: pay.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
    ...(hasCash && pay.cashReceivedSatang !== undefined ? { cashReceivedSatang: pay.cashReceivedSatang } : {}),
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
