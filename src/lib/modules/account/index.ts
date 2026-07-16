// account/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// เงินทุกบาทจากระบบภายนอก (POS) เข้าบัญชีผ่านที่นี่ — โมดูลอื่นไม่รู้เลขบัญชี/gl เลย
// WO-0002 (contract 2.4): applyExternalSale (ขายสด) + reverseExternalSale (void)
//
// 🔴 ห้าม import raw prisma ที่นี่ (F5 baseline freeze) — query ผ่าน service.ts / gl.ts เท่านั้น

import {
  createDocument,
  findAccountLinkFor,
  findAccountLinkForPos,
  findDocByRef,
  findOrCreateCustomerContact,
  setDocExternalRef,
  vatConfigOf,
} from "./service";
import { postExternalSale, reverseFor, type GlCtx } from "./gl";

/**
 * รับยอดขายสดจากระบบภายนอก (POS) เข้าบัญชี
 * 1) หา AccountSystemLink (POS↔Account) — ไม่เจอ = ไม่ post (หลัก standalone) ห้าม throw
 * 2) ถอด VAT จากยอดรวม: จด VAT → ฐาน = round(gross / (1 + rate)) · VAT = gross − ฐาน · ไม่จด → ฐาน = gross
 * 3) โพสต์ผ่าน gl.postExternalSale (idempotent ต่อ PosSale#refId#PAID)
 */
export async function applyExternalSale(input: {
  tenantId: string;
  sourceSystemId: string; // POS AppSystem.id
  refId: string; // PosSale.id
  occurredAt: Date;
  grossSatang: number; // ยอดรวม (ราคารวม VAT ถ้าร้านจด)
  payMethods: { channel: "CASH" | "TRANSFER" | "PROMPTPAY"; amountSatang: number }[];
}): Promise<{ posted: boolean; reason?: string }> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false, reason: "unlinked" };

  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const { vatRegistered, vatRateBp } = await vatConfigOf(link.systemId);

  const gross = input.grossSatang;
  const base = vatRegistered ? Math.round(gross / (1 + vatRateBp / 10000)) : gross;
  const vat = gross - base;

  // ช่องทางเงิน → บัญชี: เงินสด → 1000 (CASH) · โอน/พร้อมเพย์ → 1010 (BANK)
  const drLines = input.payMethods.map((p) => ({
    key: (p.channel === "CASH" ? "CASH" : "BANK") as "CASH" | "BANK",
    amountSatang: p.amountSatang,
  }));

  const res = await postExternalSale(ctx, {
    refId: input.refId,
    date: input.occurredAt,
    baseSatang: base,
    vatSatang: vat,
    drLines,
  });
  return { posted: "entryId" in res };
}

/**
 * กลับรายการยอดขาย POS ที่ถูก void — reversal ครบทุกขา (idempotent)
 * ไม่เชื่อมบัญชี = ไม่มีอะไรกลับ (posted: false)
 */
export async function reverseExternalSale(input: {
  tenantId: string;
  sourceSystemId: string;
  refId: string;
}): Promise<{ posted: boolean }> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false };

  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const reversed = await reverseFor(ctx, "PosSale", input.refId, "POS void บิล");
  return { posted: reversed.length > 0 };
}

// ─────────────────────────────────────────────────────────────
// ใบเสนอราคาจากระบบภายนอก (contract 2.4 ฝั่งเอกสาร) — ผู้ใช้แรก: CRM Deal (WO-0010)
// caller ห้ามรู้เรื่องเลขบัญชี/VAT — ส่งแค่ "ลูกค้าใคร มูลค่าเท่าไหร่ ชื่องานอะไร"
// idempotent ต่อ (refType, refId): เรียกซ้ำได้ใบเดิม
// ─────────────────────────────────────────────────────────────
export async function createExternalQuotation(input: {
  tenantId: string;
  sourceSystemId: string; // AppSystem.id ของระบบต้นทาง (CRM)
  sourceKind: "CRM";
  refType: string; // "CrmDeal"
  refId: string; // dealId
  title: string;
  valueSatang: number;
  customer: { name: string; phone?: string | null; email?: string | null };
}): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  // 1) หา link → ระบบบัญชีปลายทาง (opt-in — ไม่เชื่อม = ไม่ออก)
  const link = await findAccountLinkFor(input.tenantId, input.sourceKind, input.sourceSystemId);
  if (!link) return { ok: false, reason: "ยังไม่เชื่อมระบบบัญชี" };
  const ctx = { tenantId: input.tenantId, systemId: link.systemId };

  // 2) idempotent: มีใบเสนอราคาอ้างดีลนี้แล้ว → คืนใบเดิม
  const existing = await findDocByRef(ctx.systemId, "QUOTATION", input.refType, input.refId);
  if (existing) return { ok: true, docId: existing.id, created: false };

  // 3) findOrCreate ผู้ติดต่อฝั่งบัญชี (เทียบเบอร์ก่อน แล้วค่อยชื่อ)
  const contact = await findOrCreateCustomerContact(ctx, input.customer);

  // 4) สร้างใบเสนอราคา (DRAFT — พนักงานตรวจ/ส่งเองในระบบบัญชี) + ผูก ref กลับดีล
  const doc = await createDocument({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    docType: "QUOTATION",
    contactId: contact.id,
    lines: [{ description: input.title, qty: 1, unitPrice: input.valueSatang }],
  });
  await setDocExternalRef(doc.id, { refSystemId: input.sourceSystemId, refType: input.refType, refId: input.refId });
  return { ok: true, docId: doc.id, created: true };
}

// Payroll posting (WO-0036) — จุดเดียวที่ hr เรียกลงบัญชีเงินเดือน
export { postPayrollJV, type PayrollPostingInput } from "./gl";
