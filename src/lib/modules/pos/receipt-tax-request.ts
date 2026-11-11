// receipt-tax-request.ts — ลูกค้าขอใบกำกับภาษีเต็มรูปจากหน้าใบเสร็จออนไลน์ (POS P1.11 · R5) · ออกเอกสารจริง = P1.13
//
// 🔴 สาธารณะ (ไม่มีผู้ใช้): สิทธิ์คือโทเคนของใบเสร็จ · ไม่รับ id ใด ๆ จากผู้เรียก (คีย์อื่นนอก name/taxId/branchCode/address/email = VALIDATION)
// 🔴 ขอได้เมื่อ: บิล SALE สถานะ PAID (คืนบางส่วนยังขอได้ — P1.13 ตัดสินยอด) · จ่ายภายใน 7 วัน · ชนิดใบเสร็จ TAX_INVOICE_ABB (สมุดจด VAT)
//    อื่น = NOT_ELIGIBLE · คำขอที่ยังเปิด (REQUESTED/ISSUED) ต่อบิลได้ 1 ใบ = ALREADY_REQUESTED (ตัดสินใต้ล็อกแถวบิล FOR UPDATE)
// 🔴 taxId 13 หลัก (ตรวจรูปแบบอย่างเดียว · DBD = P1.13) · branchCode 5 หลัก ปริยาย "00000"
// 🔴 แถว + outbox pos.receipt.taxInvoiceRequested อยู่ใน tx เดียวกัน (consumer ยังว่าง — P1.13 เติม)
import type { Prisma, PosTaxInvoiceRequestStatus } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";
import { receiptForSale } from "./receipt";
import { saleForToken, type TokenSale } from "./receipt-token";
import {
  RECEIPT_EMAIL_RE,
  RECEIPT_ONLINE_MESSAGES,
  TAX_INVOICE_REQUEST_DAYS,
  textLength,
  type FullTaxInvoiceRequestResult,
  type PublicReceiptRefusalCode,
  type PublicTaxInvoiceAction,
  type ReceiptRefusal,
} from "./receipt-public-shared";

type Db = typeof prisma | Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const NAME_MAX = 120; // POS P1.13 follow-up 2: เท่าใบกำกับเต็มรูป (tax-invoice-shared)
const ADDRESS_MAX = 300; // POS P1.13 follow-up 2
const EMAIL_MAX = 120; // POS P1.13 reviewer N4: เท่าตัวแกะผู้ซื้อ (อีเมล ≤120)
const OPEN_STATUSES: PosTaxInvoiceRequestStatus[] = ["REQUESTED", "ISSUED"];
const INPUT_KEYS = new Set(["name", "taxId", "branchCode", "address", "email"]);

const refuse = (code: PublicReceiptRefusalCode, message?: string): ReceiptRefusal => ({ ok: false, code, message: message ?? RECEIPT_ONLINE_MESSAGES[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const NO_CTRL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

type CleanRequest = { name: string; taxId: string; branchCode: string; address: string; email: string | null };

/** ตรวจ/ทำความสะอาดคำขอ — false = VALIDATION */
function cleanInput(input: unknown): CleanRequest | false {
  if (!isRecord(input) || Object.keys(input).some((k) => !INPUT_KEYS.has(k) && input[k] !== undefined)) return false;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);
  const name = str(input.name);
  const address = str(input.address);
  const taxId = str(input.taxId);
  if (!name || textLength(name) > NAME_MAX || NO_CTRL.test(name)) return false;
  if (!address || textLength(address) > ADDRESS_MAX || NO_CTRL.test(address)) return false;
  if (!taxId || !/^\d{13}$/.test(taxId)) return false;
  let branchCode = "00000";
  if (input.branchCode !== undefined && input.branchCode !== null) {
    const b = str(input.branchCode);
    if (b === null || !/^\d{5}$/.test(b)) return false;
    branchCode = b;
  }
  let email: string | null = null;
  if (input.email !== undefined && input.email !== null) {
    const e = str(input.email);
    if (e === null) return false;
    if (e) {
      if (e.length > EMAIL_MAX || !RECEIPT_EMAIL_RE.test(e)) return false;
      email = e;
    }
  }
  return { name, taxId, branchCode, address, email };
}

/** บิลนี้ขอใบกำกับเต็มรูปได้ไหม (ไม่ดูคำขอเดิม) — kind มาจากตัวประกอบใบเสร็จ (สูตรเดียวกับใบที่พิมพ์) */
export function taxInvoiceEligible(sale: Pick<TokenSale, "docType" | "status" | "paidAt" | "createdAt">, kind: string, now = new Date()): boolean {
  if (sale.docType !== "SALE" || sale.status !== "PAID" || kind !== "TAX_INVOICE_ABB") return false;
  const paidAt = (sale.paidAt ?? sale.createdAt).getTime();
  return paidAt >= now.getTime() - TAX_INVOICE_REQUEST_DAYS * DAY_MS;
}

/** ปุ่ม "ขอใบกำกับภาษีเต็มรูป" บนหน้า (R2 actions.taxInvoice) — คำขอที่มีอยู่ชนะ (ISSUED > REQUESTED) · ไม่มี = ตามสิทธิ์ขอ */
export async function taxInvoiceActionOf(sale: TokenSale, kind: string, client?: Db): Promise<PublicTaxInvoiceAction> {
  if (sale.taxInvoiceDocId) return "ISSUED"; // POS P1.13 ▸ R7: ออกเต็มรูปแล้ว (ตอนชำระ · ทีหลัง · จากคำขอ) ◂
  const db = client ?? prisma;
  const open = await db.posTaxInvoiceRequest.findMany({
    where: { tenantId: sale.tenantId, saleId: sale.id, status: { in: OPEN_STATUSES } },
    select: { status: true },
  });
  if (open.some((r) => r.status === "ISSUED")) return "ISSUED";
  if (open.length) return "REQUESTED";
  return taxInvoiceEligible(sale, kind) ? "AVAILABLE" : "NOT_AVAILABLE";
}

/**
 * ขอใบกำกับภาษีเต็มรูป (R5) — {ok:true, requestId} | ปฏิเสธเป็นข้อมูล (TOKEN_NOT_FOUND · VALIDATION · NOT_ELIGIBLE · ALREADY_REQUESTED · INTERNAL)
 * ไม่ throw
 */
export async function requestFullTaxInvoice(token: string, input: unknown): Promise<FullTaxInvoiceRequestResult> {
  try {
    const clean = cleanInput(input);
    if (!clean) return refuse("VALIDATION");
    const sale = await saleForToken(token);
    if (!sale) return refuse("TOKEN_NOT_FOUND");
    const built = await receiptForSale(sale.tenantId, sale.systemId, sale.id);
    if (!built) return refuse("TOKEN_NOT_FOUND");
    if (!taxInvoiceEligible(sale, built.kind)) return refuse("NOT_ELIGIBLE");

    const res = await prisma.$transaction(async (tx): Promise<FullTaxInvoiceRequestResult> => {
      // ล็อกแถวบิล ⇒ สองคำขอพร้อมกันได้แถวเดียว (อีกคำขอ = ALREADY_REQUESTED) · อ่านสถานะซ้ำใต้ล็อก (ยกเลิก/คืนครบระหว่างทาง)
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosSale" WHERE id = ${sale.id} AND "tenantId" = ${sale.tenantId} FOR UPDATE`;
      if (locked[0]?.status !== "PAID") return refuse("NOT_ELIGIBLE");
      const open = await tx.posTaxInvoiceRequest.count({ where: { tenantId: sale.tenantId, saleId: sale.id, status: { in: OPEN_STATUSES } } });
      if (open > 0) return refuse("ALREADY_REQUESTED");
      const row = await tx.posTaxInvoiceRequest.create({
        data: { tenantId: sale.tenantId, unitId: sale.unitId, saleId: sale.id, ...clean },
        select: { id: true },
      });
      await emitOutbox(tx, {
        tenantId: sale.tenantId,
        type: "pos.receipt.taxInvoiceRequested",
        idempotencyKey: `pos.receipt.taxInvoiceRequested:${row.id}`,
        systemId: sale.systemId,
        unitId: sale.unitId,
        payload: { tenantId: sale.tenantId, unitId: sale.unitId, saleId: sale.id, requestId: row.id, receiptNo: sale.receiptNo ?? "" },
      });
      return { ok: true, requestId: row.id };
    });
    if (res.ok) scheduleDrain();
    return res;
  } catch (e) {
    console.error("[pos/receipt-tax-request] INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}
