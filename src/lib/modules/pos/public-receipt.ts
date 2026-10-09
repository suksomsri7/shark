// public-receipt.ts — ใบเสร็จออนไลน์ /r/<token> (POS P1.11 · R1 R2 R6 R8 R9 · CD1 CD3 CD6)
//
// 🔴 สาธารณะ: ไม่อ่าน session · สิทธิ์คือโทเคน (ค้นด้วย unique index อย่างเดียว — ไม่มีทางไล่รายการ) · ไม่รับ id ใด ๆ จากผู้เรียก
// 🔴 ไม่มีข้อมูลส่วนตัว (R2): ไม่มีชื่อ/เบอร์/อีเมลสมาชิก ชื่อแคชเชียร์ รหัสเครื่อง หรือ id ภายในในผลลัพธ์ — ประกอบเป็นคีย์ทีละตัว (allowlist)
//    จากตัวประกอบใบเสร็จของ receipt.ts (สูตรบรรทัด/ส่วนลด/VAT ชุดเดียวกับใบที่พิมพ์ · ไม่ derive เงินซ้ำ)
// 🔴 สถานะมาจากแถวบิลล้วน (R8): status · refundedSatang · ใบ REFUND (refSaleId) เปิดแล้วเป็นบิลต้นทาง
// 🔴 แต้ม: point.getBalance ของระบบแต้มตัวแรกที่ผูกระบบสมาชิกของลูกค้า (มติผู้คุมงาน 11)
// 🔴 รีวิว: ผ่าน facade ของโมดูลสมาชิกเท่านั้น (submitReviewForRef / reviewStateForRef · CD3 · มติ 8) — POS ไม่แตะ MemberReview
import * as member from "@/lib/modules/member";
import * as point from "@/lib/modules/point";
import { prisma } from "./db";
import { receiptForSale, salePointBalance } from "./receipt";
import { saleForToken } from "./receipt-token";
import { taxInvoiceActionOf } from "./receipt-tax-request";
import {
  RECEIPT_ONLINE_MESSAGES,
  RECEIPT_REVIEW_BODY_MAX,
  publicReceiptStatus,
  textLength,
  type PublicReceipt,
  type PublicReceiptRefusalCode,
  type PublicReceiptResult,
  type ReceiptRefusal,
  type ReceiptReviewResult,
} from "./receipt-public-shared";

// ของที่หน้าใบเสร็จออนไลน์ใช้ทั้งหมดออกจากไฟล์นี้ที่เดียว (ข้อสอบ P1.11 ค้นชื่อที่นี่)
export { ensureReceiptToken } from "./receipt-token";
export { requestFullTaxInvoice } from "./receipt-tax-request";
export { reportReceiptIssue } from "./receipt-issue";

const refuse = (code: PublicReceiptRefusalCode, message?: string): ReceiptRefusal => ({ ok: false, code, message: message ?? RECEIPT_ONLINE_MESSAGES[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ใบเสร็จสาธารณะของโทเคน (R2) — ไม่ throw */
export async function publicReceipt(token: string): Promise<PublicReceiptResult> {
  try {
    const sale = await saleForToken(token);
    if (!sale) return refuse("TOKEN_NOT_FOUND");
    const built = await receiptForSale(sale.tenantId, sale.systemId, sale.id);
    if (!built) return refuse("TOKEN_NOT_FOUND");
    const { payload, kind } = built;
    const t = payload.totals;

    const [abb, points, taxInvoice, reviewState] = await Promise.all([
      kind === "TAX_INVOICE_ABB"
        ? prisma.accountDocument.findFirst({
            where: { tenantId: sale.tenantId, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: sale.id, ...(built.bookId ? { systemId: built.bookId } : {}) },
            select: { docNo: true },
          })
        : null,
      pointsOf(sale.tenantId, sale.unitId, sale.memberId, built.sale.pointEarned),
      taxInvoiceActionOf(sale, kind),
      sale.memberId ? member.reviewStateForRef({ tenantId: sale.tenantId }, { refType: "PosSale", refId: sale.id }) : null,
    ]);

    const receipt: PublicReceipt = {
      shop: { name: payload.shop.name, branchLabel: payload.shop.branchName, logoUrl: payload.shop.logoUrl ?? null },
      receiptNo: payload.doc.receiptNo,
      ...(abb?.docNo ? { abbNo: abb.docNo } : {}),
      paidAt: (sale.paidAt ?? sale.createdAt).toISOString(),
      status: publicReceiptStatus(sale),
      refundedSatang: sale.refundedSatang,
      lines: payload.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        ...(l.options && l.options.length ? { options: [...l.options] } : {}),
        lineTotalSatang: l.lineTotalSatang,
      })),
      // CD6: ส่วนลดท้ายบิล + คูปอง + สิทธิ์สมาชิก (ระดับ/ว่อชเชอร์) = PosSale.discountSatang ก้อนเดียว ("ส่วนลด + คูปอง")
      discountSatang: built.sale.discountSatang,
      // F3: ค่าบริการ/ทิปจากตัวประกอบเดียวกับใบที่พิมพ์ (ไม่มี = 0 ตามแถวบิล)
      serviceChargeSatang: t.serviceChargeSatang,
      tipSatang: t.tipSatang,
      vat: t.vatRateBp > 0 && t.vatSatang > 0 ? { rateBp: t.vatRateBp, satang: t.vatSatang, included: true } : null,
      grandTotalSatang: t.grandTotalSatang,
      payments: payload.payments.map((p) => ({ method: p.type, satang: p.amountSatang })),
      points,
      // POS P1.12 ▸ R15 มติ 8: บรรทัดสิทธิ์จากสำเนาของบิล (kind · label · ส่วนลด) — ไม่มีข้อมูลตัวตนสมาชิก ◂
      memberBenefits: (t.memberBenefits ?? []).map((b) => ({ kind: b.kind, label: b.label, discountSatang: b.discountSatang })),
      channel: payload.channel ? { name: payload.channel.name, ref: payload.channel.ref } : null, // POS P2.1 ▸ R11 ◂
      // review: บิลมีสมาชิกที่ยังอยู่ในระบบสมาชิก (points ไม่ null) + ยังไม่ได้ส่งรีวิว + ลิงก์ขอรีวิวของ journey ยังไม่หมดอายุ (F2)
      actions: { taxInvoice, review: (reviewState === "NONE" || reviewState === "REQUESTED") && points !== null, report: true },
    };
    return { ok: true, receipt };
  } catch (e) {
    console.error("[pos/public-receipt] INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}

/**
 * แต้มของบิล (มีสมาชิกเท่านั้น) — POS P1.12 R15: balance สดของระบบแต้มที่ผูกสาขาของบิล (member facade · ตัวเดียวกับใบเสร็จ) ·
 * สาขาไม่มีระบบแต้ม = ทางเดิม (ระบบแต้มตัวแรกของระบบสมาชิก · มติ P1.11 ข้อ 11) · ลูกค้าไม่อยู่ในระบบสมาชิกใดแล้ว = null
 */
async function pointsOf(tenantId: string, unitId: string, memberId: string | null, earned: number): Promise<PublicReceipt["points"]> {
  if (!memberId) return null;
  const c = await prisma.customer.findFirst({ where: { id: memberId, tenantId }, select: { memberSystemId: true } });
  if (!c?.memberSystemId) return null;
  const unitBal = await salePointBalance(tenantId, unitId, { id: memberId, memberSystemId: c.memberSystemId });
  if (unitBal !== null) return { earned, balance: unitBal };
  const [pointSys] = await point.resolvePointSystemIds(tenantId, c.memberSystemId);
  return { earned, balance: pointSys ? await point.getBalance(pointSys, memberId) : 0 };
}

/**
 * ลูกค้าให้คะแนนร้านจากหน้าใบเสร็จ (R6) — เฉพาะบิลที่มีสมาชิก · ผ่าน member.submitReviewForRef (CD3 · มติ 8)
 * {ok:true, reviewId} | TOKEN_NOT_FOUND · VALIDATION · NO_MEMBER · ALREADY_REVIEWED · REVIEW_EXPIRED (F2: เกิน 30 วัน) · INTERNAL — ไม่ throw
 */
export async function submitReceiptReview(token: string, input: unknown): Promise<ReceiptReviewResult> {
  try {
    if (!isRecord(input) || Object.keys(input).some((k) => k !== "rating" && k !== "body" && input[k] !== undefined)) return refuse("VALIDATION");
    const rating = input.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return refuse("VALIDATION");
    let body: string | null = null;
    if (input.body !== undefined && input.body !== null) {
      if (typeof input.body !== "string") return refuse("VALIDATION");
      const b = input.body.trim();
      if (textLength(b) > RECEIPT_REVIEW_BODY_MAX || /\u0000/.test(b)) return refuse("VALIDATION");
      body = b || null;
    }
    const sale = await saleForToken(token);
    if (!sale) return refuse("TOKEN_NOT_FOUND");
    if (!sale.memberId) return refuse("NO_MEMBER");
    const c = await prisma.customer.findFirst({ where: { id: sale.memberId, tenantId: sale.tenantId }, select: { id: true, memberSystemId: true } });
    if (!c?.memberSystemId) return refuse("NO_MEMBER");
    try {
      const r = await member.submitReviewForRef(
        { tenantId: sale.tenantId, systemId: c.memberSystemId, actorUserId: null },
        { customerId: c.id, refType: "PosSale", refId: sale.id, rating, body },
      );
      if (r.alreadyReviewed) return refuse("ALREADY_REVIEWED");
      if (r.expired) return refuse("REVIEW_EXPIRED");
      return { ok: true, reviewId: r.reviewId };
    } catch (e) {
      if (e instanceof member.MemberNotFoundError) return refuse("NO_MEMBER");
      if (e instanceof member.MemberInputError) return refuse("VALIDATION", e.message);
      throw e;
    }
  } catch (e) {
    console.error("[pos/public-receipt] review INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}
