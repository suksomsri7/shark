// tax-invoice.ts — ใบกำกับภาษีเต็มรูปของบิล POS (P1.13 · R3–R6 · CD1–CD6) · ผู้เขียนเดียวของ PosBuyerProfile
//
// 🔴 POS แตะบัญชีผ่าน facade `@/lib/modules/account` เท่านั้น (F2.2) — ไม่เขียน AccountDocument/AccountContact/Customer เอง
// 🔴 ปฏิเสธเป็นข้อมูล {ok:false, code, message ไทย} — ไม่ throw (รหัสทั้งหมดอยู่ที่ tax-invoice-shared.ts)
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { TaxInvoiceBuyer } from "./tax-invoice-shared";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * R6 — จำผู้ซื้อไว้กับสมาชิก (upsert 1 แถวต่อสมาชิก · ไม่แตะตาราง Customer) · สมาชิกต้องเป็นของร้านนี้ (อื่น = ไม่เขียน)
 * ล้ม = ไม่ทำให้งานหลัก (บิล/เอกสาร) ล้ม — แค่ไม่จำ
 */
export async function rememberBuyerForMember(tenantId: string, customerId: string, buyer: TaxInvoiceBuyer, client?: Db): Promise<boolean> {
  const db = client ?? prisma;
  try {
    const member = await db.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!member) return false;
    const prev = await db.posBuyerProfile.findUnique({ where: { customerId }, select: { tenantId: true } });
    if (prev && prev.tenantId !== tenantId) return false;
    const data = { kind: buyer.kind, name: buyer.name, taxId: buyer.taxId, branchCode: buyer.branchCode, address: buyer.address, email: buyer.email };
    await db.posBuyerProfile.upsert({ where: { customerId }, create: { tenantId, customerId, ...data }, update: data });
    return true;
  } catch (e) {
    console.error("[pos/tax-invoice] rememberBuyer", e instanceof Error ? e.name : "Error");
    return false;
  }
}
