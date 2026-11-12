// ─────────────────────────────────────────────────────────────
// trips/booking-core.ts — ส่วนบริสุทธิ์ของการจองทัวร์: contactKey · snapshot → คอลัมน์ · รูปคำขอ (zod) · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §1 §2 §5.1 §5.2 ข้อ 7 · §6
//
// 🔴 บริสุทธิ์: import ได้แค่ zod + import type · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่ throw (ตัวตรวจคืน safeParse)
// 🔴 จำนวนเต็มทุกช่องจำกัด int4 · ทุกอินพุต z.strictObject · ไม่มีค่าธุรกิจตายตัว
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { Booker } from "@/lib/core/sellable";

// ── T0.6 booking ──
export const INT4_MAX = 2_147_483_647;
const ID = z.string().trim().min(1).max(128);
const NN = z.number().int().min(0).max(INT4_MAX);
/** คีย์กันซ้ำของผู้เรียก (CC §C ข้อ 3) — สั้นกว่า 100 เพื่อเผื่อส่วนต่อท้ายของ hold ต่อบรรทัด (`_<i>`) */
export const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
/** token ตะกร้าของหน้าจอง (PUBLIC) */
export const BASKET_TOKEN = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ISO = z.string().min(1).max(64).refine((s) => !Number.isNaN(Date.parse(s)), { message: "เวลาไม่ถูกต้อง" });

// ═══════════════ บรรทัด · ใบเสนอราคา (รูปเดียวกับ LineRequest/QuoteRequest ของ CC §C) ═══════════════
export const lineSchema = z.strictObject({
  productKind: z.string().min(1).max(16),
  unitId: ID,
  productId: ID,
  slotId: ID,
  optionId: ID.optional(),
  pax: z.array(z.strictObject({ paxTypeId: ID, qty: NN })).min(1).max(50),
  unitIds: z.array(ID).max(200).optional(),
  wholeCabinIds: z.array(ID).max(200).optional(),
  extras: z.array(z.strictObject({ extraId: ID, qty: NN })).max(200).optional(),
  pickupZoneId: ID.optional(),
  promoCode: z.string().max(64).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});
export type LineInput = z.infer<typeof lineSchema>;
export const quoteRequestSchema = z.strictObject({
  lines: z.array(lineSchema).min(1).max(20),
  attribution: z.strictObject({ agentCode: z.string().max(64).optional(), staffCode: z.string().max(64).optional(), linkId: z.string().max(128).optional(), source: z.string().max(64).optional() }).optional(),
  agentDiscountSatang: NN.optional(),
});
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

const overrideSchema = z.strictObject({ itemRef: z.string().min(1).max(200), unitMinor: NN, reason: z.string().max(500) });
/** resolvedMinor ไม่บังคับในรูป — ตรวจแยกเพื่อคืนเหตุ APPROVAL_RESOLVED_REQUIRED (ใบสั่ง §5.2 ข้อ 6 · มติ §16 ข้อ 3) */
const approvalSchema = z.strictObject({ approvalId: ID, itemRef: z.string().min(1).max(200), unitMinor: NN, resolvedMinor: NN.optional() });
export type OverrideInput = z.infer<typeof overrideSchema>;
export type ApprovalInput = z.infer<typeof approvalSchema>;

export const bookerSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  lineUserId: z.string().trim().max(128).optional(),
  partyId: ID.optional(),
  marketingConsent: z.boolean().optional(),
});
const passengerSchema = z.strictObject({ name: z.string().trim().min(1).max(200), paxTypeId: ID, fields: z.record(z.string(), z.unknown()).optional() });
const paySchema = z.strictObject({ method: z.enum(["PAY_NOW", "PAY_LATER", "WALLET", "CREDIT"]), tender: z.enum(["PROMPTPAY", "CARD", "SLIP", "CASH"]).optional() });

// ═══════════════ คำขอของบริการ (ใบสั่ง §5.1) ═══════════════
export const holdRequestSchema = z.strictObject({
  quote: quoteRequestSchema,
  quoteId: z.string().min(1).max(128),
  quoteExpiresAt: ISO,
  idempotencyKey: IDEM_KEY,
  basketToken: BASKET_TOKEN.optional(),
  basketId: ID.optional(),
  holdMinutes: NN.optional(),
  priceOverrides: z.array(overrideSchema).max(200).optional(),
  overrideApprovals: z.array(approvalSchema).max(200).optional(),
});
export type TripHoldRequest = z.infer<typeof holdRequestSchema>;

const confirmBase = {
  holdIds: z.array(ID).min(1).max(20),
  idempotencyKey: IDEM_KEY,
  quoteId: z.string().min(1).max(128),
  booker: bookerSchema,
  passengers: z.array(passengerSchema).max(200).optional(),
  pay: paySchema,
  note: z.string().max(1000).optional(),
  basketId: ID,
  quote: quoteRequestSchema,
  basketToken: BASKET_TOKEN.optional(),
  onExpired: z.enum(["FAIL", "REHOLD"]).optional(),
  priceOverrides: z.array(overrideSchema).max(200).optional(),
  overrideApprovals: z.array(approvalSchema).max(200).optional(),
};
export const confirmRequestSchema = z.strictObject(confirmBase);
export type TripConfirmRequest = z.infer<typeof confirmRequestSchema>;

export const bookNowRequestSchema = z.strictObject({
  idempotencyKey: IDEM_KEY,
  quoteId: z.string().min(1).max(128),
  quoteExpiresAt: ISO,
  booker: bookerSchema,
  passengers: z.array(passengerSchema).max(200).optional(),
  pay: paySchema,
  note: z.string().max(1000).optional(),
  quote: quoteRequestSchema,
  priceOverrides: z.array(overrideSchema).max(200).optional(),
  overrideApprovals: z.array(approvalSchema).max(200).optional(),
});
export type TripBookNowRequest = z.infer<typeof bookNowRequestSchema>;

export const changeRequestSchema = z.strictObject({
  bookingId: ID,
  expectedVersion: NN,
  line: lineSchema,
  quoteId: z.string().min(1).max(128),
  quoteExpiresAt: ISO,
  idempotencyKey: IDEM_KEY,
  useCurrentPolicy: z.boolean().optional(),
  reason: z.string().max(500).optional(),
  priceOverrides: z.array(overrideSchema).max(200).optional(),
  overrideApprovals: z.array(approvalSchema).max(200).optional(),
});
export type TripChangeRequest = z.infer<typeof changeRequestSchema>;

export const cancelRequestSchema = z.strictObject({
  bookingId: ID,
  mode: z.enum(["QUOTE", "EXECUTE"]),
  reason: z.string().trim().min(1).max(500),
  reasonKind: z.enum(["CUSTOMER", "EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"]).optional(),
  choice: z.enum(["MONEY", "CREDIT", "MOVE_DATE"]).optional(),
  moveToSlotId: ID.optional(),
  idempotencyKey: IDEM_KEY,
});
export const approveRequestSchema = z.strictObject({ bookingId: ID, expectedVersion: NN, decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(500).optional() });
export const getRequestSchema = z.strictObject({ bookingId: ID });
export const listRequestSchema = z.strictObject({
  departureId: ID.optional(),
  status: z.string().max(16).optional(),
  from: YMD.optional(),
  to: YMD.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export const transitionRequestSchema = z.strictObject({ bookingId: ID, from: z.string().min(1).max(16), to: z.string().min(1).max(16), expectedVersion: NN, reason: z.string().trim().max(500).optional() });
export const expiredEventSchema = z.object({ tenantId: ID, unitId: ID, bookingId: ID });

/** เหตุผลของ useCurrentPolicy ต้องยาว ≥ 10 ตัวอักษร (CC :667) */
export const CHANGE_POLICY_REASON_MIN = 10;

// ═══════════════ contactKey (ใบสั่ง §5.2 ข้อ 7 — กติกาเดียวทุกช่องทาง · ไม่ใช้ partyId) ═══════════════
/** เบอร์ → E.164 (ไทย 0xxxxxxxxx ⇒ +66…) · ตัดขีด/ช่องว่าง/วงเล็บ · สั้นกว่า 8 หลัก ⇒ null */
export function phoneE164(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const plus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (d.length < 8 || d.length > 15 + 2) return null;
  if (plus) return `+${d}`;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  if (d.startsWith("0")) d = `66${d.slice(1)}`;
  return `+${d}`;
}
/** เบอร์ ⇒ tel:+E164 · ไม่มีเบอร์ ⇒ line:<id> · ไม่มี ⇒ mail:<อีเมลตัวเล็ก> · ไม่มีเลย ⇒ null */
export function contactKeyOf(booker: Pick<Booker, "phone" | "email" | "lineUserId"> | null | undefined): string | null {
  if (!booker || typeof booker !== "object") return null;
  const tel = phoneE164(booker.phone);
  if (tel) return `tel:${tel}`;
  const line = typeof booker.lineUserId === "string" ? booker.lineUserId.trim() : "";
  if (line) return `line:${line}`;
  const mail = typeof booker.email === "string" ? booker.email.trim().toLowerCase() : "";
  if (mail) return `mail:${mail}`;
  return null;
}

// ═══════════════ snapshot → คอลัมน์ (ใบสั่ง §6) ═══════════════
type SnapLine = {
  kind: string;
  paxTypeId?: string | null;
  extraId?: string | null;
  qty: number;
  unitMinor: number;
  amountMinor: number;
  amountSatang: number;
  vatSatang: number;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: string;
  priceSource: string;
  usesCapacity?: boolean;
};
export type SnapshotShape = {
  currency: string;
  fx: { rateMicros: number } | null;
  travel: { localDate: string };
  lines: readonly SnapLine[];
  totals: { grossSatang: number; discountSatang: number; agentDiscountSatang: number; passThroughSatang: number; vatSatang: number; payableSatang: number };
  commission: { commissionSatang: number; commissionVatSatang: number; wht: { whtSatang: number | null }; remitToShopSatang: number } | null;
  paymentSchedule: readonly { seq: number; kind: string; amountSatang: number; dueAt: string; dueAtBooking?: boolean }[];
};
export type BookingColumns = {
  grossSatang: number;
  discountSatang: number;
  agentDiscountSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  whtSatang: number;
  netToShopSatang: number;
  currency: string;
  fxRateMicros: number | null;
  travelDate: string;
  collectMode: "SHOP";
  contactRoute: "DIRECT";
  marketingEligible: boolean;
  accountingState: "NONE";
  paidSatang: number;
  refundedSatang: number;
};
export type BookingItemColumns = {
  kind: "SEAT" | "EXTRA" | "PICKUP";
  paxTypeId: string | null;
  extraId: string | null;
  qty: number;
  unitPriceMinor: number;
  amountMinor: number;
  amountSatang: number;
  vatSatang: number;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: "VAT7" | "EXEMPT" | "NONE";
  priceSource: string;
  usesCapacity: boolean;
};
const int4 = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= INT4_MAX;
const ITEM_KINDS: ReadonlySet<string> = new Set(["SEAT", "EXTRA", "PICKUP"]);
const TAX_KINDS: ReadonlySet<string> = new Set(["VAT7", "EXEMPT", "NONE"]);

/** คอลัมน์ของ TripBooking + รายการ จาก snapshot (ทุกตัว int4 · ไม่ตรงรูป ⇒ null — ผู้เรียกปฏิเสธ VALIDATION) */
export function bookingColumnsFromSnapshot(snap: SnapshotShape): { booking: BookingColumns; items: BookingItemColumns[] } | null {
  const t = snap.totals;
  const c = snap.commission;
  const booking: BookingColumns = {
    grossSatang: t.grossSatang,
    discountSatang: t.discountSatang,
    agentDiscountSatang: t.agentDiscountSatang,
    passThroughSatang: t.passThroughSatang,
    vatSatang: t.vatSatang,
    commissionSatang: c ? c.commissionSatang : 0,
    commissionVatSatang: c ? c.commissionVatSatang : 0,
    whtSatang: c ? (c.wht.whtSatang ?? 0) : 0,
    netToShopSatang: c ? c.remitToShopSatang : t.payableSatang,
    currency: snap.currency,
    fxRateMicros: snap.fx?.rateMicros ?? null,
    travelDate: snap.travel.localDate,
    collectMode: "SHOP",
    contactRoute: "DIRECT",
    marketingEligible: true,
    accountingState: "NONE",
    paidSatang: 0,
    refundedSatang: 0,
  };
  const nums = [booking.grossSatang, booking.discountSatang, booking.agentDiscountSatang, booking.passThroughSatang, booking.vatSatang, booking.commissionSatang, booking.commissionVatSatang, booking.whtSatang, booking.netToShopSatang];
  if (!nums.every(int4) || (booking.fxRateMicros !== null && !int4(booking.fxRateMicros)) || !/^\d{4}-\d{2}-\d{2}$/.test(booking.travelDate)) return null;
  const items: BookingItemColumns[] = [];
  for (const l of snap.lines) {
    if (!ITEM_KINDS.has(l.kind) || !TAX_KINDS.has(l.taxKind)) return null;
    if (![l.qty, l.unitMinor, l.amountMinor, l.amountSatang, l.vatSatang].every(int4)) return null;
    items.push({
      kind: l.kind as BookingItemColumns["kind"],
      paxTypeId: typeof l.paxTypeId === "string" ? l.paxTypeId : null,
      extraId: typeof l.extraId === "string" ? l.extraId : null,
      qty: l.qty,
      unitPriceMinor: l.unitMinor,
      amountMinor: l.amountMinor,
      amountSatang: l.amountSatang,
      vatSatang: l.vatSatang,
      commissionable: l.commissionable === true,
      discountable: l.discountable === true,
      passThrough: l.passThrough === true,
      taxKind: l.taxKind as BookingItemColumns["taxKind"],
      priceSource: String(l.priceSource),
      usesCapacity: l.kind === "SEAT" && l.usesCapacity !== false,
    });
  }
  return { booking, items };
}

/** ที่นั่งที่นับความจุของ snapshot (Σ qty ของ SEAT ประเภทที่ใช้ที่นั่ง · มติ §16 ข้อ 8) */
export function seatsOfSnapshot(snap: Pick<SnapshotShape, "lines">): number {
  return snap.lines.filter((l) => l.kind === "SEAT" && l.usesCapacity !== false).reduce((s, l) => s + l.qty, 0);
}
/** ยอดครบกำหนดตอนจอง (Σ งวดที่ dueAtBooking ของ snapshot) */
export function dueNowOfSnapshot(snap: Pick<SnapshotShape, "paymentSchedule">): number {
  return snap.paymentSchedule.filter((s) => s.dueAtBooking === true).reduce((s, r) => s + r.amountSatang, 0);
}

/** จับคู่ผู้เดินทางกับที่นั่ง (ต่อประเภทคน · ไม่เกินจำนวนที่นั่ง) — เกิน ⇒ null (TOO_MANY_PASSENGERS) */
export function assignPassengers(passengers: readonly { name: string; paxTypeId: string }[], seatsByPaxType: Readonly<Record<string, number>>): { name: string; paxTypeId: string }[] | null {
  const left: Record<string, number> = { ...seatsByPaxType };
  const out: { name: string; paxTypeId: string }[] = [];
  for (const p of passengers) {
    const n = left[p.paxTypeId] ?? 0;
    if (n <= 0) return null;
    left[p.paxTypeId] = n - 1;
    out.push({ name: p.name, paxTypeId: p.paxTypeId });
  }
  return out;
}
// ── /T0.6 booking ──
