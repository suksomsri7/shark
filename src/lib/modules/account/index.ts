// account/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// เงินทุกบาทจากระบบภายนอก (POS) เข้าบัญชีผ่านที่นี่ — โมดูลอื่นไม่รู้เลขบัญชี/gl เลย
// WO-0002 (contract 2.4): applyExternalSale (ขายสด) + reverseExternalSale (void)
//
// 🔴 ห้าม import raw prisma ที่นี่ (F5 baseline freeze) — query ผ่าน service.ts / gl.ts เท่านั้น

import { findAccountLinkForPos, vatConfigOf } from "./service";
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
