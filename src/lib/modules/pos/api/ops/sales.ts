// ops/sales.ts — op ของบิลขาย POS (ใบ P0.2 → ใบ P2.13)
//
// P0.2: `sales.create` / `sales.void` (คู่กับ tool เดิมของผู้ช่วย AI `pos_create_sale` / `void_sale` — ทางเดินของ tool ยังไม่สลับ · มติ 7)
// P2.13 (brief §1 #2–#10 · มติ 1 5 · CD1 CD3 CD4 CD6 CD9):
//   - `sales.create` ชี้ไป `submitRegisterSale` (หน้าขายตัวเดียวกัน: ราคาแคตตาล็อก/ตัวเลือก/ราคาช่องทาง/สต็อก/ใบเสร็จ/JV) — ไม่เรียก createSale เองแล้ว
//     บรรทัดกำหนดเอง/ราคาเปิด = ต้องมี pos.sale.priceOverride (facade ตัดสิน) · วิธีจ่าย v1 = CASH TRANSFER PROMPTPAY CARD PLATFORM
//   - อ่าน: รายการบิล (billsPageData) · บิล (billDetail) · ใบเสร็จต้นฉบับ (receiptPayload) · ตะกร้า quote · ที่คืนได้ (saleForRefund)
//   - คืนเงิน (refundSale) · ใบกำกับเต็มรูป (issueFullTaxInvoice)
// 🔴 ตรรกะเงินอยู่ที่ facade เท่านั้น — ที่นี่มีแค่ "ด่าน" (สาขา/ระเบียนเป็นของระบบ POS ของคีย์ · units.ts) + ส่งต่อ + แปลคำปฏิเสธ (http-errors.ts)
//    ตรวจรูปเงินชั้น schema เฉพาะบิลที่เป็นบรรทัดกำหนดเองล้วน (รูป P0.2 — ยอดรู้ได้โดยไม่ต้องอ่าน DB · CD1 คง S5.8/S5.10)

import { z } from "zod";
import { actorRefId, type ApiActor } from "@/lib/api/actor";
import { ApiError, paged } from "@/lib/api/respond";
import { canAccessUnit } from "@/lib/core/rbac";
import { billsPageData, billDetail, voidSaleByActor } from "../../bills";
import { BILL_PAGE_SIZES, BILL_STATUS_FILTERS } from "../../bills-shared";
import { bkkToday, PosSaleError } from "../../index";
import { receiptPayload } from "../../receipt";
import { refundSale, saleForRefund } from "../../refund";
import { quoteRegisterCart, submitRegisterSale, type RegisterApiCtx } from "../../register";
import type { RegisterQuoteLineInput } from "../../register-shared";
import { issueFullTaxInvoice } from "../../tax-invoice";
import { posRegisterActorOf, posActorCanUseUnit } from "../actor";
import { posData, posResult, toPosApiError } from "../http-errors";
import { posApiServiceKey } from "../keys";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { posApiPriorSale, posApiShiftState, posSaleHead, posSaleShiftId, posSaleUnit, requirePosUnit } from "../units";

/** เพดานของคอลัมน์เงิน/จำนวน (Postgres Int — pos.prisma: PosSale.*Satang · PosSaleLine · PosPayment) */
export const POS_INT_MAX = 2_147_483_647;
/** เพดานบรรทัดต่อบิล — กัน payload ยักษ์ (หน้าขายจริงไม่เคยถึง) */
const MAX_LINES = 200;
/** เพดานจำนวนต่อบรรทัด — คู่กับเพดานราคาแล้วผลคูณรวม ≤ 200 × 10,000 × Int max ≈ 4.3e15 < 2^53 (เลข JS ยังแม่น) */
const MAX_QTY = 10_000;

/**
 * วิธีจ่ายที่ผู้เรียกภายนอกใช้ได้ (มติ 5 · CD2) — บัตรของขวัญ/เครดิตร้าน/มัดจำ/ห้องพัก ไม่อยู่ในชุดนี้โดยตั้งใจ:
 * PIN ของบัตรจะต้องเดินผ่านแอปบุคคลที่สาม (owner line ใน POS-OWNER-PENDING) · DEPOSIT/ROOM_CHARGE = ทางภายในของโมดูลอื่น
 * PLATFORM ใช้ได้เฉพาะช่องทาง payout PLATFORM (แถวเดียวเต็มยอด — facade ตัดสิน CHANNEL_PAY_MISMATCH)
 */
// POS P2.9 ▸ CD-P29-1 (b): GIFT_CARD/STORE_CREDIT ไม่อยู่ในชุดนี้โดยตั้งใจ (API ไม่มีขั้น PIN · schema .strict() ปฏิเสธ giftCard) ◂
const EXTERNAL_PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY", "CARD", "PLATFORM"] as const;

const satang = z.number().int().min(0).max(POS_INT_MAX);
const unitIdField = z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system. List them with GET /units.");
const unitIdOpt = unitIdField.optional().describe("Branch of the record. Optional: the record's own branch is used; a different branch answers 404.");
const discount = z
  .object({ type: z.enum(["AMOUNT", "PERCENT"]).describe("AMOUNT = satang off · PERCENT = basis points (1000 = 10%)."), value: satang.describe("Satang (AMOUNT) or basis points (PERCENT).") })
  .strict();

/** บรรทัดสินค้าจากแคตตาล็อก — ราคามาจากเซิร์ฟเวอร์เสมอ */
const productLine = z
  .object({
    productId: z.string().min(1).max(64).describe("Catalog product id (GET /products)."),
    qty: z.number().int().min(1).max(MAX_QTY).describe(`Quantity (whole number, max ${MAX_QTY}). Weighed items: 1.`),
    options: z
      .array(z.object({ choiceId: z.string().min(1).max(64).describe("Option choice id (GET /products/{id}/options).") }).strict())
      .max(20)
      .optional()
      .describe("Chosen options of the product."),
    weighedBarcode: z.string().min(8).max(32).optional().describe("Scale label (EAN-13 starting with the shop's weighed prefix) for a sold-by-weight product."),
    discount: discount.optional().describe("Line discount. Limited by the discount ceiling of the key (STAFF)."),
    note: z.string().max(200).optional().describe("Line note printed on the receipt."),
  })
  .strict();
/** บรรทัดกำหนดเอง (รูป P0.2) — ต้องมี pos.sale.priceOverride */
const customLine = z
  .object({
    name: z.string().trim().min(1).max(200).describe("Line name as printed on the receipt."),
    qty: z.number().int().min(1).max(MAX_QTY).describe(`Quantity (whole number, max ${MAX_QTY}).`),
    unitPriceSatang: satang.describe("Unit price in satang (baht x 100). Needs scope pos.sale.priceOverride."),
  })
  .strict();
const cartLines = z
  .array(z.union([productLine, customLine]))
  .min(1)
  .max(MAX_LINES)
  .describe("Bill lines: catalog lines {productId, qty, options?, weighedBarcode?} or custom lines {name, qty, unitPriceSatang} (custom lines need pos.sale.priceOverride).");
const payMethod = z
  .object({
    type: z.enum(EXTERNAL_PAY_TYPES).describe("CASH, TRANSFER, PROMPTPAY, CARD or PLATFORM (PLATFORM only on a platform sales channel)."),
    amountSatang: satang.min(1).describe("Amount paid with this method, in satang."),
    reference: z.string().trim().min(1).max(60).optional().describe("Slip / terminal reference (CARD and TRANSFER only)."),
  })
  .strict();

const isCustom = (l: z.infer<typeof productLine> | z.infer<typeof customLine>): l is z.infer<typeof customLine> => "name" in l;

/** ตะกร้าของ op → บรรทัดของหน้าขาย (ส่งต่อตรงตัว ไม่คิดราคา) */
function toRegisterLines(lines: (z.infer<typeof productLine> | z.infer<typeof customLine>)[]): RegisterQuoteLineInput[] {
  return lines.map((l) =>
    isCustom(l)
      ? { name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang }
      : {
          productId: l.productId,
          qty: l.qty,
          ...(l.options ? { options: l.options.map((o) => ({ choiceId: o.choiceId })) } : {}),
          ...(l.weighedBarcode ? { weighedBarcode: l.weighedBarcode } : {}),
          ...(l.discount ? { discount: l.discount } : {}),
          ...(l.note ? { note: l.note } : {}),
        },
  );
}

/**
 * input ของ `sales.create`
 * 🔴 บิลที่เป็นบรรทัดกำหนดเองล้วน (รูป P0.2 · ไม่มีส่วนลดท้ายบิล) ⇒ ยอดบิล = Σ qty × ราคา พอดี ⇒ ตรวจ "จ่ายครบพอดี" และ "ไม่ล้นคอลัมน์ Int"
 *    ได้ตั้งแต่ชั้น schema (422 validation พร้อมช่องที่ผิด · CD1) · บรรทัดแคตตาล็อก = facade ตัดสิน (PAYMENT_MISMATCH 422 · PRICE_CHANGED 409)
 */
const createInput = z
  .object({
    unitId: unitIdField,
    lines: cartLines,
    payMethods: z.array(payMethod).min(1).max(10).describe("Payments. The sum must equal the bill total exactly."),
    expectedGrandTotalSatang: satang
      .optional()
      .describe("The total you showed the customer (from POST /sales/quote). Recommended: when it differs from the live total the sale is refused with 409 state_conflict and nothing is written. Absent = no total check."),
    cashReceivedSatang: satang.optional().describe("Cash handed over by the customer (>= the CASH part). Absent = exactly the CASH part (no change)."),
    channelId: z.string().min(1).max(64).optional().describe("Sales channel id (GET /channels). Absent = the branch's walk-in channel (STORE)."),
    channelRef: z.string().trim().min(1).max(40).optional().describe("Order number on the platform (platform channels)."),
    billDiscount: discount.optional().describe("Bill level discount. Limited by the discount ceiling of the key (STAFF)."),
    note: z.string().max(200).optional().describe("Bill note."),
    shiftId: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "Bind the bill to this OPEN shift of the same branch. Absent: when the shop requires a shift for sales from other sources, the single open shift of the branch is used (no open shift, or several open shifts with a CASH payment = 409 state_conflict SHIFT_REQUIRED); otherwise the bill is out of any shift and the answer has outOfShift: true.",
      ), // POS P2.14 ▸ API-1 ◂
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.lines.every(isCustom) || v.billDiscount) return;
    let total = 0;
    v.lines.forEach((l, i) => {
      const lineTotal = (l as z.infer<typeof customLine>).qty * (l as z.infer<typeof customLine>).unitPriceSatang;
      if (lineTotal > POS_INT_MAX) {
        ctx.addIssue({ code: "custom", path: ["lines", i], message: "ยอดของรายการนี้สูงเกินกว่าที่ระบบบันทึกได้ — แยกเป็นหลายบิล" });
      }
      total += lineTotal;
    });
    if (total > POS_INT_MAX) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "ยอดรวมของบิลสูงเกินกว่าที่ระบบบันทึกได้ — แยกเป็นหลายบิล" });
      return;
    }
    const paid = v.payMethods.reduce((s, p) => s + p.amountSatang, 0);
    if (paid !== total) {
      ctx.addIssue({
        code: "custom",
        path: ["payMethods"],
        message: `ยอดชำระรวม ${paid} สตางค์ ต้องเท่ากับยอดบิล ${total} สตางค์พอดี`,
      });
    }
  });

/**
 * คีย์กันซ้ำแบบ P0.2 (`api:<ผู้เรียก>:<Idempotency-Key>`) — คงไว้ตามสัญญา P0.2 S5.11 (CD1)
 * 🔴 ทางขายของ P2.13 ใช้ `posApiServiceKey` (keys.ts) เพราะหน้าขายไม่รับ ":" ในคีย์ (⚠️6)
 */
export function posSaleServiceKey(actor: ApiActor, idempotencyKey: string | null, requestId: string): string {
  return `api:${actorRefId(actor)}:${idempotencyKey ?? requestId}`;
}

/** คีย์ชั้นบริการของคำขอเขียนนี้ (ผูกผู้เรียก · ไม่มี Idempotency-Key = requestId = ไม่กันซ้ำข้ามคำขอ) */
export function posOpServiceKey(actor: ApiActor, idempotencyKey: string | null, requestId: string): string {
  return posApiServiceKey(actorRefId(actor), idempotencyKey ?? requestId);
}

/**
 * คนในร้าน (ผู้กดยืนยันข้อเสนอ AI / ผู้ช่วย) ต้องเข้าถึงสาขานั้นได้ — กติกาเดียวกับหน้าขาย (`actions/pos.ts` assertPosCan)
 * คีย์ API = การเชื่อมต่อระดับร้าน (แบบเดียวกับ member/api/actor) ⇒ ไม่ผูกสาขา ไม่ต้องตรวจ (ตัวกรองสาขาของคีย์ = posActorCanUseUnit)
 * ไม่ผ่าน = 404 (ไม่บอกว่าสาขา/บิลนั้นมีอยู่)
 */
export function actorCanUseUnit(actor: Pick<ApiActor, "kind" | "membership">, unitId: string): boolean {
  if (actor.kind === "apikey") return true;
  return canAccessUnit(actor.membership, unitId);
}

/** ctx ของ facade หน้าขาย — คีย์ API พก `apiKeyId` (บิล sourceModule API · กะตามกติกา "ทางอื่น" · CD5) */
function registerCtx(actor: ApiActor, unitId: string, shiftId?: string): RegisterApiCtx {
  return {
    tenantId: actor.tenantId,
    systemId: actor.systemId,
    unitId,
    ...(actor.kind === "apikey" && actor.keyId ? { apiKeyId: actor.keyId } : {}),
    ...(shiftId ? { apiShiftId: shiftId } : {}),
  };
}

const saleTarget = ({ params }: { params: Record<string, string> }) => (params.id ? { targetType: "PosSale", targetId: params.id } : null);

// ═══════════ อ่าน ═══════════
const listInput = z
  .object({
    unitId: z.string().min(1).max(64).describe('Branch id, or "*" for every branch the key may read.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Thai business date YYYY-MM-DD. Default today."),
    status: z.enum(BILL_STATUS_FILTERS).optional().describe("Filter by bill status. Default ALL."),
    q: z.string().max(100).optional().describe("Search receipt number or member."),
    page: z.coerce.number().int().min(1).max(100_000).optional().describe("Page number, from 1."),
    pageSize: z.coerce
      .number()
      .int()
      .refine((n) => (BILL_PAGE_SIZES as readonly number[]).includes(n), { message: `pageSize ต้องเป็น ${BILL_PAGE_SIZES.join(" / ")}` })
      .optional()
      .describe(`Bills per page: ${BILL_PAGE_SIZES.join(", ")}. Default 10.`),
  })
  .strict();

const salesList = definePosOp({
  id: "sales.list",
  method: "GET",
  path: "/sales",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "List the bills of one Thai business day for a branch (or every readable branch with unitId=*), newest first, with day counts and totals.",
  label: "รายการบิล",
  test: "sales.list",
  input: listInput,
  paged: true,
  async handler({ actor, input }) {
    if (input.unitId !== "*") await requirePosUnit(actor, input.unitId);
    const r = posResult(
      await billsPageData({ tenantId: actor.tenantId, systemId: actor.systemId, unitId: input.unitId }, posRegisterActorOf(actor), {
        unitId: input.unitId,
        date: input.date ?? bkkToday(),
        ...(input.status ? { status: input.status } : {}),
        ...(input.q ? { q: input.q } : {}),
        ...(input.page ? { page: input.page } : {}),
        ...(input.pageSize ? { pageSize: input.pageSize } : {}),
      }),
    );
    const pageCount = Math.max(1, Math.ceil(r.total / r.pageSize));
    return paged(r.items, { page: r.page, pageSize: r.pageSize, pageCount, total: r.total, hasMore: r.page < pageCount }, { date: r.date, counts: r.counts, summary: r.summary });
  },
});

const idUnitInput = z.object({ unitId: unitIdOpt }).strict();

const salesGet = definePosOp({
  id: "sales.get",
  method: "GET",
  path: "/sales/{id}",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "One bill with its lines, options, payments, refunds and channel.",
  label: "รายละเอียดบิล",
  test: "sales.get",
  input: idUnitInput,
  async handler({ actor, params, input }) {
    const unitId = await posSaleUnit(actor, params.id ?? "", input.unitId);
    // POS P2.14 ▸ API-10 มติ 8: เงินของบิลใน REST ใช้ชื่อลงท้าย Satang ทุกคีย์ (แปลงที่ op · ลิ้นชักบิลของจอยังใช้ DTO เดิมของ billDetail) ◂
    const { bill } = posResult(await billDetail({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { saleId: params.id, unitId }));
    // POS P2.14 ▸ fix1 H2: ต้นทุน/กำไรต่อบรรทัด = เฉพาะคีย์ที่มี pos.report.view (billDetail คืน null ให้คนอื่น) — null = ไม่มีฟิลด์ในคำตอบ ◂
    const lines = bill.lines.map(({ costSatang, marginSatang, ...l }) => ({ ...l, ...(costSatang === null ? {} : { costSatang }), ...(marginSatang === null ? {} : { marginSatang }) }));
    return { ...bill, lines, totals: posApiBillTotals(bill.totals) };
  },
});

/** POS P2.14 ▸ API-10: totals ของ billDetail → ชื่อของ REST (*Satang · vatRateBp คงชื่อ) — สตางค์จำนวนเต็มทุกช่อง ◂ */
export function posApiBillTotals(t: { subtotal: number; lineDiscount: number; billDiscount: number; coupon: number; tier: number; serviceCharge: number; vatSatang: number; vatRateBp: number; grandTotal: number; tip: number; refunded: number }) {
  return {
    subtotalSatang: t.subtotal,
    lineDiscountSatang: t.lineDiscount,
    billDiscountSatang: t.billDiscount,
    couponSatang: t.coupon,
    tierSatang: t.tier,
    serviceChargeSatang: t.serviceCharge,
    vatSatang: t.vatSatang,
    vatRateBp: t.vatRateBp,
    grandTotalSatang: t.grandTotal,
    tipSatang: t.tip,
    refundedSatang: t.refunded,
  };
}

const salesReceipt = definePosOp({
  id: "sales.receipt",
  method: "GET",
  path: "/sales/{id}/receipt",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "The original receipt payload of a bill (shop header, lines, VAT, payments, footer). Reading it is not a reprint and is not counted as one.",
  label: "ใบเสร็จต้นฉบับ",
  test: "sales.receipt",
  input: idUnitInput,
  async handler({ actor, params, input }) {
    const unitId = await posSaleUnit(actor, params.id ?? "", input.unitId);
    return posData(await receiptPayload({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { saleId: params.id ?? "", copy: false }));
  },
});

const quoteInput = z
  .object({
    unitId: unitIdField,
    lines: cartLines,
    channelId: z.string().min(1).max(64).optional().describe("Sales channel id. Absent = walk-in (STORE)."),
    billDiscount: discount.optional().describe("Bill level discount."),
  })
  .strict();

const salesQuote = definePosOp({
  id: "sales.quote",
  method: "POST",
  path: "/sales/quote",
  kind: "read",
  rate: "read",
  action: POS_SCOPES.saleCreate,
  summary: "Price a cart exactly like the register does (catalog price, options, channel price, VAT, rounding) without writing anything. Send its grandTotalSatang as expectedGrandTotalSatang when you sell.",
  label: "คิดราคาตะกร้า",
  test: "sales.quote",
  input: quoteInput,
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(
      await quoteRegisterCart(registerCtx(actor, unitId), posRegisterActorOf(actor), {
        lines: toRegisterLines(input.lines),
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.billDiscount ? { billDiscount: input.billDiscount } : {}),
      } as Parameters<typeof quoteRegisterCart>[2]),
    );
  },
});

const refundableInput = z.object({ unitId: unitIdOpt }).strict();

const salesRefundable = definePosOp({
  id: "sales.refundable",
  method: "GET",
  path: "/sales/{id}/refundable",
  kind: "read",
  action: POS_SCOPES.saleRefund,
  summary: "What is still refundable on a bill: every line with its net amount, quantity already refunded and quantity left.",
  label: "รายการที่คืนได้ของบิล",
  test: "sales.refundable",
  input: refundableInput,
  async handler({ actor, params, input }) {
    const unitId = await posSaleUnit(actor, params.id ?? "", input.unitId);
    return posData(await saleForRefund(registerCtx(actor, unitId), posRegisterActorOf(actor), { saleId: params.id ?? "" }));
  },
});

// ═══════════ เขียน ═══════════
const salesCreate = definePosOp({
  id: "sales.create",
  method: "POST",
  path: "/sales",
  kind: "write",
  action: POS_SCOPES.saleCreate,
  summary: "Sell: price the cart like the register, cut stock, post accounting and number the receipt in one step. Payments must add up to the bill total exactly (all amounts in satang).",
  label: "เปิดบิลขาย",
  test: "POS-P0.2-OP.3",
  input: createInput,
  auditTarget: ({ data }) => {
    const id = typeof data === "object" && data !== null ? (data as { saleId?: unknown }).saleId : null;
    return typeof id === "string" && id ? { targetType: "PosSale", targetId: id } : null;
  },
  async handler({ actor, input, idempotencyKey, requestId }) {
    // ด่าน id + สาขา: สาขาต้องผูกกับระบบ POS ของ actor จริง และผู้กระทำต้องใช้สาขานั้นได้ (ไม่ผ่าน = ไม่พบ)
    const unitId = await requirePosUnit(actor, input.unitId);
    const serviceKey = posOpServiceKey(actor, idempotencyKey, requestId);
    // POS P2.14 ▸ API-7: ลองซ้ำหลัง TTL 24 ชม. ของ ApiIdempotency = บิลเดิม — ค้นคีย์ก่อนด่านกะ/quote ของ op (หน้าขายค้นคีย์ก่อนคิดราคาอยู่แล้ว ·
    //   quote ของ op เองต้องไม่ปฏิเสธก่อน เช่น สินค้าถูก 86 หลังขาย) · ยอดที่ส่งต่อ = ยอดของบิลเดิม ⇒ facade คืนบิลเดิม (duplicated) ◂
    const prior = await posApiPriorSale(actor, serviceKey);
    // POS P2.14 ▸ API-1 มติ 2 · มติ 12 (CD-1 409): ไม่ส่ง shiftId + ร้านตั้ง "ทางอื่นต้องมีกะ" ⇒ กะเปิดกะเดียวของสาขา (ผูกกะนั้น) ·
    //   0 กะ = SHIFT_REQUIRED · ≥ 2 กะ + เงินสด = SHIFT_REQUIRED (ไม่เดากะ — ส่ง shiftId) · ≥ 2 กะ ไม่มีเงินสด = กติกาเดิมของ createSale (นอกกะ) ·
    //   ร้านไม่ตั้ง = แบบเดิม (นอกกะ) + คำตอบบอก outOfShift: true · บิลเดิม (prior) ไม่ผ่านด่านนี้ (คำตอบเดิม) ◂
    let shiftId = input.shiftId;
    if (!prior && !shiftId) {
      const st = await posApiShiftState(actor, unitId);
      if (st.otherSourcesRequired) {
        const hasCash = input.payMethods.some((p) => p.type === "CASH");
        if (st.open.length === 0) throw toPosApiError({ ok: false, code: "SHIFT_REQUIRED", message: "สาขานี้ยังไม่มีกะที่เปิดอยู่ — เปิดกะก่อนขาย (ร้านตั้งให้บิลจากทางอื่นต้องอยู่ในกะ)" });
        if (st.open.length === 1) shiftId = st.open[0];
        else if (hasCash) throw toPosApiError({ ok: false, code: "SHIFT_REQUIRED", message: "สาขานี้เปิดกะอยู่หลายกะ — ส่ง shiftId ของกะที่รับเงินสดนี้ (ดูกะที่เปิดอยู่ได้ที่ GET /shifts)" });
      }
    }
    const ctx = registerCtx(actor, unitId, shiftId);
    const ra = posRegisterActorOf(actor);
    const lines = toRegisterLines(input.lines);
    const cart = {
      lines,
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.billDiscount ? { billDiscount: input.billDiscount } : {}),
    } as Parameters<typeof quoteRegisterCart>[2];
    // CD4: ไม่ส่งยอดที่คาด = ไม่ตรวจยอด ⇒ ใช้ยอดของ quote ตัวเดียวกับหน้าขาย (ไม่คิดเงินที่นี่) · บิลเดิม = ยอดของบิลเดิม (POS P2.14 ▸ API-7 ◂)
    const expected = input.expectedGrandTotalSatang ?? prior?.grandTotalSatang ?? (posResult(await quoteRegisterCart(ctx, ra, cart)) as { grandTotalSatang: number }).grandTotalSatang;
    const cash = input.payMethods.find((p) => p.type === "CASH")?.amountSatang;
    const cashReceived = input.cashReceivedSatang ?? cash;
    const r = posResult(
      await submitRegisterSale(ctx, ra, {
        ...cart,
        payMethods: input.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang, ...(p.reference ? { reference: p.reference } : {}) })),
        expectedGrandTotalSatang: expected,
        ...(cashReceived !== undefined ? { cashReceivedSatang: cashReceived } : {}),
        ...(input.channelRef ? { channelRef: input.channelRef } : {}),
        ...(input.note ? { note: input.note } : {}),
        idempotencyKey: serviceKey,
      } as Parameters<typeof submitRegisterSale>[2]),
    );
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ (ไม่ขึ้นกับ duplicated) + API-1 outOfShift = บิลไม่อยู่ในกะ (อ่านจากบิลจริง — บิลเดิมก็ตอบตามบิลเดิม) ◂
    return {
      saleId: r.saleId,
      receiptNo: r.receiptNo,
      grandTotalSatang: r.grandTotalSatang,
      changeSatang: r.changeSatang,
      duplicated: r.duplicated,
      outOfShift: (await posSaleShiftId(actor, r.saleId)) === null,
      ...(r.member ? { member: r.member } : {}),
    };
  },
});

/**
 * ที่มาของบิลที่ op นี้ยกเลิกได้ = บิลของ POS เอง (หน้าขาย · ผู้ช่วย AI ของ POS · REST ของ POS)
 * บิลที่ระบบอื่นเปิด (createSale ถูกเรียกจาก hotel/restaurant/booking/…) ต้องยกเลิกจากระบบต้นทาง
 * เพราะระบบนั้นมีสถานะของตัวเอง (การจอง/ออเดอร์/ตั๋ว/บัตรกำนัล) ที่ voidSale ไม่รู้จัก
 */
export const POS_NATIVE_SOURCES: readonly string[] = ["POS", "AI", "API"];

/** ชื่อไทยของระบบต้นทาง (ค่า `sourceModule` ที่โค้ดเขียนจริงตอน 1 ต.ค. 2569) */
const SOURCE_LABEL_TH: Record<string, string> = {
  HOTEL: "ระบบโรงแรม",
  RESTAURANT: "ระบบร้านอาหาร",
  BOOKING: "ระบบนัดหมาย/จองบริการ",
  TICKET: "ระบบขายตั๋ว",
  ECOM: "ร้านค้าออนไลน์",
  MEMBER: "ระบบสมาชิก (บัตรกำนัล/สมาชิกรายเดือน)",
  CLINIC: "ระบบคลินิก",
  RENTAL: "ระบบเช่า",
  SCHOOL: "ระบบโรงเรียน/คอร์สเรียน",
};

/** บิลจากระบบอื่น → 409 พร้อมบอกว่าต้องไปยกเลิกที่ไหน · บิลของ POS เอง → null */
export function foreignSaleError(sourceModule: string | null): ApiError | null {
  const src = sourceModule ?? "POS";
  if (POS_NATIVE_SOURCES.includes(src)) return null;
  const where = SOURCE_LABEL_TH[src] ?? "ระบบต้นทางที่เปิดบิลนี้";
  return new ApiError(
    409,
    "state_conflict",
    `บิลนี้เปิดมาจาก${where} — กรุณายกเลิกจากระบบนั้น เพื่อให้การจอง/ออเดอร์ที่ผูกอยู่ถูกยกเลิกไปพร้อมกัน`,
    "This bill was opened by another system. Cancel it from that system instead.",
  );
}

/** ข้อความที่ `voidSale` โยนเมื่อบิลไม่อยู่ในสถานะ PAID (service.ts — ตรวจซ้ำใน tx) */
const VOID_STATE_MESSAGE = "บิลนี้ void ไม่ได้";

/** error ของ voidSale → 409 เมื่อเป็นเรื่องสถานะ (บิลถูกยกเลิกไปแล้วระหว่างตรวจกับลงมือ · กะของบิลปิดแล้ว) · อื่น ๆ ปล่อยผ่าน */
export function voidErrorToApi(e: unknown): unknown {
  if (e instanceof Error && e.message === VOID_STATE_MESSAGE) {
    return new ApiError(409, "state_conflict", "บิลนี้ถูกยกเลิกไปแล้วหรือไม่อยู่ในสถานะที่ยกเลิกได้", "Only paid bills can be voided.");
  }
  // POS P1.9 R2 F5 ▸ S11: บิลหน้าขายในกะที่ปิดแล้ว = 409 (ไม่ใช่ 500) ◂
  if (e instanceof PosSaleError && e.code === "SHIFT_CLOSED") {
    return new ApiError(409, "state_conflict", "กะของบิลนี้ปิดแล้ว — ยกเลิกบิลไม่ได้ ใช้การคืนเงินแทน", "The shift of this bill is closed. Use a refund instead.");
  }
  return e;
}

const voidInput = z
  .object({
    reason: z.string().trim().min(5).max(500).describe("Why the bill is voided. Stored in the audit log."),
    unitId: unitIdOpt,
  })
  .strict();

const salesVoid = definePosOp({
  id: "sales.void",
  method: "POST",
  path: "/sales/{id}/void",
  kind: "danger",
  action: POS_SCOPES.saleVoid,
  summary:
    "Void a paid POS bill (register or API). Reverses accounting, coupons, member rights and stock. Cannot be undone; a bill with refunds must be refunded instead, and a bill of a closed shift cannot be voided. When the shop's approval rule for voids applies, nothing is voided: 409 state_conflict with the approval request id in hint, and the request waits for a manager in the app.",
  label: "ยกเลิกบิลขาย",
  test: "POS-P0.2-OP.4",
  input: voidInput,
  auditTarget: saleTarget,
  async handler({ actor, params, input, idempotencyKey, requestId }) {
    const saleId = params.id ?? "";
    // ด่าน id: บิลต้องเป็นของร้าน + ระบบ POS ของ actor · ผู้กระทำใช้สาขาของบิลได้ (ตัวกรองของคีย์ / สิทธิ์สาขาของคน)
    const sale = await posSaleHead(actor, saleId);
    if (!sale || !posActorCanUseUnit(actor, sale.unitId) || (input.unitId !== undefined && input.unitId !== sale.unitId)) {
      throw new ApiError(404, "not_found", "ไม่พบบิลนี้ในระบบขายหน้าร้าน", "The bill was not found in this POS system.");
    }
    const foreign = foreignSaleError(sale.sourceModule);
    if (foreign) throw foreign;
    if (sale.status !== "PAID") {
      throw new ApiError(409, "state_conflict", `บิลนี้ยกเลิกไม่ได้ (สถานะปัจจุบัน: ${sale.status})`, "Only paid bills can be voided.");
    }
    // POS P2.13 ▸ fix1 F1: ทางเดียวกับลิ้นชักบิล (voidSaleByActor) — กติกาอนุมัติ POS_VOID ของร้าน (APPROVAL_REQUIRED/PENDING_APPROVAL = 409 · requestId ใน hint) ·
    //   กะของบิลปิดแล้ว = SHIFT_CLOSED · audit ในtx · คีย์บริการผูกคีย์ API (เล่นซ้ำ = ผลเดิม) — ไม่เรียก voidSale ตรงอีก ◂
    let r: Awaited<ReturnType<typeof voidSaleByActor>>;
    try {
      r = await voidSaleByActor(registerCtx(actor, sale.unitId) /* POS P2.14 ▸ API-9: apiKeyId ⇒ audit source API ◂ */, posRegisterActorOf(actor), {
        unitId: sale.unitId,
        saleId: sale.id,
        reason: input.reason,
        idempotencyKey: posOpServiceKey(actor, idempotencyKey, requestId),
      });
    } catch (e) {
      throw toPosApiError(voidErrorToApi(e));
    }
    posResult(r);
    return { saleId: sale.id, status: "VOIDED" as const };
  },
});

const REFUND_REASONS = ["DAMAGED", "WRONG_ITEM", "CHANGED_MIND", "OTHER"] as const;
const REFUND_PAY_TYPES_V1 = ["CASH", "TRANSFER", "PROMPTPAY", "CARD", "PLATFORM"] as const;
const refundInput = z
  .object({
    reason: z.string().trim().min(5).max(200).describe("Why the money goes back. Stored on the refund document and in the audit log."),
    reasonCode: z.enum(REFUND_REASONS).optional().describe("DAMAGED, WRONG_ITEM, CHANGED_MIND or OTHER (default)."),
    lines: z
      .array(
        z
          .object({
            lineId: z.string().min(1).max(64).describe("Line id of the bill (GET /sales/{id}/refundable)."),
            qty: z.number().int().min(1).max(MAX_QTY).describe("Units to refund (a weighed line refunds as 1)."),
            restock: z.boolean().optional().describe("Put the goods back into stock. Default true; send false for damaged goods that are thrown away."),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_LINES)
      .describe("Lines and quantities to refund."),
    payMethods: z
      .array(
        z
          .object({
            type: z.enum(REFUND_PAY_TYPES_V1).describe("How the money goes back: CASH, TRANSFER, PROMPTPAY, CARD or PLATFORM."),
            amountSatang: satang.min(1).describe("Amount, in satang."),
            reference: z.string().trim().min(1).max(60).optional().describe("Transfer / terminal reference."),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .describe("Refund payments. The sum must equal the refund total (see GET /sales/{id}/refundable)."),
    unitId: unitIdOpt,
  })
  .strict();

const salesRefund = definePosOp({
  id: "sales.refund",
  method: "POST",
  path: "/sales/{id}/refund",
  kind: "danger",
  action: POS_SCOPES.saleRefund,
  summary: "Refund part or all of a paid bill: issues a REFUND document (credit note), restocks, reverses accounting and member points, and emits pos.sale.refunded.",
  label: "คืนเงิน",
  test: "sales.refund",
  input: refundInput,
  auditTarget: saleTarget,
  async handler({ actor, params, input, idempotencyKey, requestId }) {
    const unitId = await posSaleUnit(actor, params.id ?? "", input.unitId);
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ — ไม่ผ่าน posData (ผลฟิลด์เดียว = ค่าเปล่า · หลายฟิลด์ = วัตถุ ⇒ รูปเปลี่ยนตามผล) ◂
    const r = posResult(
      await refundSale(registerCtx(actor, unitId), posRegisterActorOf(actor), {
        saleId: params.id ?? "",
        lines: input.lines.map((l) => ({ lineId: l.lineId, qty: l.qty, restock: l.restock ?? true })), // ของคืนเข้าคลังโดยปริยาย (ส่ง false = ของเสีย)
        payMethods: input.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang, ...(p.reference ? { reference: p.reference } : {}) })),
        reasonCode: input.reasonCode ?? "OTHER",
        reason: input.reason,
        idempotencyKey: posOpServiceKey(actor, idempotencyKey, requestId),
      }),
    );
    return { refund: r.refund, sale: r.sale, duplicated: r.duplicated === true };
  },
});

const taxInvoiceInput = z
  .object({
    buyer: z
      .object({
        kind: z.enum(["PERSON", "JURISTIC"]).describe("PERSON or JURISTIC (company)."),
        name: z.string().trim().min(1).max(200).describe("Buyer name as on the tax invoice."),
        taxId: z.string().trim().min(13).max(13).describe("13 digit tax id."),
        branchCode: z.string().trim().max(5).optional().describe("Head office 00000 or the 5 digit branch number (companies)."),
        address: z.string().trim().min(1).max(500).describe("Buyer address."),
        email: z.string().trim().max(200).optional().describe("E-mail to send the invoice to."),
      })
      .strict()
      .describe("Buyer of the full tax invoice."),
    unitId: unitIdOpt,
  })
  .strict();

const salesTaxInvoice = definePosOp({
  id: "sales.taxInvoice",
  method: "POST",
  path: "/sales/{id}/tax-invoice",
  kind: "write",
  action: POS_SCOPES.taxInvoiceIssue,
  summary: "Issue a full tax invoice for a paid bill (the shop must be VAT registered with the accounting module linked). One invoice per bill.",
  label: "ออกใบกำกับภาษีเต็มรูป",
  test: "sales.taxInvoice",
  input: taxInvoiceInput,
  auditTarget: saleTarget,
  async handler({ actor, params, input }) {
    const unitId = await posSaleUnit(actor, params.id ?? "", input.unitId);
    // POS P2.14 ▸ API-5: คีย์บริการผูกคีย์ API + บิล (pos-api:<keyId>:<saleId>) — facade ใช้กันซ้ำ/ลง audit · ผู้กระทำที่ไม่ใช่คีย์ = ไม่มีคีย์บริการ (ทางเดิม) ◂
    const serviceKey = actor.kind === "apikey" && actor.keyId ? `pos-api:${actor.keyId}:${params.id ?? ""}` : undefined;
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ — ไม่ผ่าน posData (ผลฟิลด์เดียว = ค่าเปล่า · หลายฟิลด์ = วัตถุ ⇒ รูปเปลี่ยนตามผล) ◂
    const r = posResult(
      await issueFullTaxInvoice({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { saleId: params.id ?? "", buyer: input.buyer, ...(serviceKey ? { serviceKey } : {}) }),
    );
    return { docId: r.docId, docNo: r.docNo };
  },
});

export const SALES_OPS: ApiOp[] = [salesList, salesGet, salesReceipt, salesQuote, salesCreate, salesVoid, salesRefundable, salesRefund, salesTaxInvoice];
