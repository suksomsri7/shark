// ─────────────────────────────────────────────────────────────
// core/sellable.ts — หน้าสัมผัส "ของที่ขายได้" (ทัวร์ · ตั๋ว · โรงแรมในอนาคต) · RUN TRIPS T0.1
// สัญญา: ledger/TRIPS-CORE-CONTRACT.md §C (คัดตรงตัว) · ใบสั่ง ledger/trips-briefs/T0.1.md §1 §7 ข้อ 14
//
// 🔴 pure ล้วน: ไม่มี import (ข้อสอบ S-3) — ชนิด + ทะเบียนข้อความ + ตัวตรวจชนิดสินค้า
// 🔴 RequestHash = ชนิดเท่านั้น — ตัวคำนวณ (canonical JSON → sha256 ด้วย node:crypto) อยู่ «src/lib/platform/sellables.ts» (server · CC §C m-9)
// ─────────────────────────────────────────────────────────────

// ── ทะเบียน (ข้อความตรวจกับทะเบียน · เพิ่มชนิดไม่ต้อง migrate) ──
export const PRODUCT_KINDS = ["TRIP", "TICKET", "HOTEL"] as const; // ลำดับนี้ = ลำดับล็อกข้ามชนิด (§D.5)
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"] as const;
export type SellChannel = (typeof SELL_CHANNELS)[number];

const PRODUCT_KIND_SET: ReadonlySet<string> = new Set(PRODUCT_KINDS);
/** ชนิดสินค้าที่ทะเบียนรู้จัก (ตัวพิมพ์ต้องตรง · ไม่ใช่ข้อความ ⇒ false) */
export function isProductKind(v: unknown): v is ProductKind {
  return typeof v === "string" && PRODUCT_KIND_SET.has(v);
}

const SELL_CHANNEL_SET: ReadonlySet<string> = new Set(SELL_CHANNELS);
/** ช่องทางขายที่ทะเบียนรู้จัก (ตัวพิมพ์ต้องตรง · ไม่ใช่ข้อความ ⇒ false) */
export function isSellChannel(v: unknown): v is SellChannel {
  return typeof v === "string" && SELL_CHANNEL_SET.has(v);
}

export type SellActor =
  | { kind: "STAFF"; userId: string } // สิทธิ์ตรวจที่ action ก่อนเรียก (assertCan)
  | { kind: "AGENT"; agentAccountId: string; agentUserId: string } // จาก session พอร์ทัล/คีย์ API
  | { kind: "PUBLIC"; clientKey: string } // แฮช IP+UA ใช้กับ rate limit เท่านั้น
  | { kind: "SYSTEM"; job: string };
export type SellCtx = { tenantId: string; unitId: string /* หน่วยของหน้าจอง (สิทธิ์/ค่าตั้งของหน้า) */; channel: SellChannel; actor: SellActor; now?: Date; locale?: "th" | "en" };
export type Attribution = { agentCode?: string; staffCode?: string; linkId?: string; source?: string };

export type PaxQty = { paxTypeId: string; qty: number };
export type LineRequest = {
  productKind: ProductKind;
  unitId: string; // (แก้รอบ 2 · M-15) หน่วยของสินค้าบรรทัดนี้ — ตะกร้าข้ามหน่วยได้
  productId: string; // TripProduct.id | TicketEvent.id
  slotId: string; // TripDeparture.id | TicketSession.id
  optionId?: string;
  pax: PaxQty[]; // ตั๋ว: paxTypeId = TicketType.id
  unitIds?: string[]; // TripUnit.id (เตียง) — Liveaboard เท่านั้น
  wholeCabinIds?: string[]; // เหมาเคบิน
  extras?: { extraId: string; qty: number }[];
  pickupZoneId?: string;
  promoCode?: string;
  currency?: string; // ไม่ใช่ THB ได้เฉพาะ productType LIVEABOARD (CURRENCY_NOT_ALLOWED)
};
export type QuoteRequest = { lines: LineRequest[]; attribution?: Attribution; agentDiscountSatang?: number /* Q12 · เพดานจากค่าตั้ง */ };

export type Money = { satang: number; minor?: number; currency: string };
export type QuoteLine = {
  ref: string; // ดัชนีบรรทัดคำขอ
  items: {
    kind: string;
    label: string;
    qty: number;
    unit: Money;
    amount: Money;
    commissionable: boolean;
    discountable: boolean;
    passThrough: boolean;
    taxKind: "VAT7" | "EXEMPT" | "NONE";
    priceSource: string;
  }[];
  available: { publicLeft: number; agentLeft?: number };
  cutoffAt?: string;
};
export type Quote = {
  quoteId: string; // = priceFingerprint (แฮชของคำขอ + ราคา + เวอร์ชันข้อมูล) — ไม่มีแถวในฐาน
  lines: QuoteLine[];
  totals: { gross: Money; discount: Money; passThrough: Money; payable: Money };
  agent?: { collectFromCustomer: Money; remitToShop: Money; agentEarns: Money; whtGrossUp: Money; creditLeftSatang: number | null }; // §9.2 ข้อ 7
  cancelLadder: CancelStep[];
  paymentSchedule: DueSpec[];
  holdMinutes: number;
  fx?: { rateMicros: number; at: string } | null;
  warnings: { code: string; messageTh: string }[]; // WARN จากตัวตรวจ (L10 ราคาต่ำกว่าทุน ฯลฯ) — ไม่บล็อก
  expiresAt: string;
};
export type CancelStep = { daysBefore: number; refundBp: number }; // เรียงมาก→น้อย
export type DueSpec = { seq: number; kind: string; amount: Money; dueAt: string; passengerRef?: string };

export type HoldRequest = { quote: QuoteRequest; quoteId: string; basketId?: string; idempotencyKey: string; holdMinutes?: number };
export type Hold = { holdIds: string[]; basketId: string | null; expiresAt: string };
export type Booker = { name: string; phone?: string; email?: string; lineUserId?: string; partyId?: string; marketingConsent?: boolean };
export type ConfirmRequest = {
  holdIds: string[];
  idempotencyKey: string;
  quoteId: string;
  booker: Booker;
  passengers?: { name: string; paxTypeId: string; fields?: Record<string, unknown> }[];
  pay: { method: "PAY_NOW" | "PAY_LATER" | "WALLET" | "CREDIT"; tender?: "PROMPTPAY" | "CARD" | "SLIP" | "CASH" }; // (แก้รอบ 3 · m-1) ค่าเดียวกับ `TripBooking.payMethod` · ผู้เก็บเงินมาจาก `agency.money.collector` (A10) ที่ resolve แล้ว
  note?: string;
};
export type BookingRef = { productKind: ProductKind; bookingId: string; code: string; status: string; publicToken: string; dues: DueSpec[] };
export type CancelRequest = {
  bookingId: string;
  mode: "QUOTE" | "EXECUTE";
  reason: string;
  reasonKind?: "CUSTOMER" | "EXTERNAL" | "MIN_NOT_MET" | "SHOP_FAULT";
  choice?: "MONEY" | "CREDIT" | "MOVE_DATE";
  moveToSlotId?: string;
  idempotencyKey: string;
}; // (แก้รอบ 3 · m-1) ค่าเดียวกับ `TripRefundRequest`
export type CancelResult = { computed: { refundSatang: number; feeSatang: number; ladderStep: CancelStep | null; source: "SNAPSHOT" }; requestId?: string; status?: string };
export type AvailabilityQuery = { productId: string; from: string; to: string; optionId?: string; paxTotal?: number };
export type AvailabilityRow = { slotId: string; startsAt: string; localDate: string; status: string; publicLeft: number; agentLeft?: number; priceFrom?: Money; belowMin?: boolean };

export type SellResult<T> = { ok: true; value: T } | { ok: false; code: SellErrorCode; messageTh: string; retryable: boolean; details?: Record<string, unknown> };
export const SELL_ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "FORBIDDEN",
  "KIND_NOT_SUPPORTED",
  "CURRENCY_NOT_ALLOWED",
  "SOLD_OUT",
  "INSUFFICIENT_ALLOTMENT",
  "BERTH_TAKEN",
  "SLOT_CLOSED",
  "CUTOFF_PASSED",
  "PRICE_CHANGED",
  "BELOW_MIN_SELL_PRICE",
  "DISCOUNT_OVER_CAP",
  "HOLD_EXPIRED",
  "HOLD_NOT_FOUND",
  "HOLD_LIMIT",
  "AGENT_SUSPENDED",
  "CREDIT_LIMIT",
  "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "BUSY",
  "STATE_CONFLICT",
] as const;
export type SellErrorCode = (typeof SELL_ERROR_CODES)[number];

export interface Sellable {
  kind: ProductKind;
  availability(ctx: SellCtx, q: AvailabilityQuery): Promise<SellResult<AvailabilityRow[]>>;
  quote(ctx: SellCtx, req: QuoteRequest): Promise<SellResult<Quote>>;
  hold(ctx: SellCtx, req: HoldRequest): Promise<SellResult<Hold>>;
  confirm(ctx: SellCtx, req: ConfirmRequest): Promise<SellResult<BookingRef[]>>;
  cancel(ctx: SellCtx, req: CancelRequest): Promise<SellResult<CancelResult>>;
  // (แก้รอบ 2 · B-2) ใช้โดย platform/basket.ts เท่านั้น — ทำงานใน tx ของผู้เรียก ไม่ commit เอง · สองเฟสตาม §D.5
  capacityRowsOf(ctx: SellCtx, line: LineRequest | { holdId: string }): Promise<CapacityRowRef[]>; // อ่านไม่ล็อก: แถวเฟส 1 ที่บรรทัดนี้ต้องใช้
  reserveInTx(tx: unknown, ctx: SellCtx, rows: CapacityRowRef[], intent: ReserveIntent): Promise<SellResult<Reservation>>; // เฟส 1 เท่านั้น (ล็อก+ตัวนับ)
  finalizeInTx(
    tx: unknown,
    ctx: SellCtx,
    reservations: Reservation[],
    req: (HoldRequest | ConfirmRequest) & { basketId: string },
  ): Promise<SellResult<{ holds?: Hold; bookings?: BookingRef[]; ledger: LedgerDraft[] }>>; // เฟส 2 ชั้น 2a–2e · สมุดเอเจนซี่คืนเป็น draft ให้ตะกร้า post ครั้งเดียว (2f)
}
export type CapacityRowRef = { layer: "1a" | "1b" | "1c"; table: string; id: string; sortKey: string }; // ตะกร้าเรียงทั้งหมดตาม (layer, kindIndex, table, sortKey, id)
export type ReserveIntent = { op: "HOLD" | "CONVERT" | "RELEASE" | "MOVE"; qtyPublic: number; qtyAllot: number; allotmentId?: string; unitIds?: string[] };
export type Reservation = { kind: ProductKind; slotId: string; qtyPublic: number; qtyAllot: number; unitIds: string[]; allotmentId?: string };
export type LedgerDraft = { agentAccountId: string; kind: string; amountSatang: number; idempotencyKey: string; refs: Record<string, string> };
export type RequestHash = string; // (แก้รอบ 2 · m-9) ชนิดเท่านั้น — ตัวคำนวณอยู่ «src/lib/platform/sellables.ts» (server)
