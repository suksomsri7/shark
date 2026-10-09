// account/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// เงินทุกบาทจากระบบภายนอก (POS) เข้าบัญชีผ่านที่นี่ — โมดูลอื่นไม่รู้เลขบัญชี/gl เลย
// WO-0002 (contract 2.4): applyExternalSale (ขายสด) + reverseExternalSale (void)
//
// 🔴 ห้าม import raw prisma ที่นี่ (F5 baseline freeze) — query ผ่าน service.ts / gl.ts เท่านั้น

import type { AccountDocType, Prisma } from "@prisma/client";
import { handleBeamPaid, handleBeamFailed } from "./payment-request";
import {
  convertDocument,
  createDocument,
  findExternalSaleDoc,
  upsertExternalCreditNoteDocument,
  findAccountLinkFor,
  findAccountLinkForPos,
  findDocByRef,
  findOrCreateCustomerContact,
  ensureNamedCustomerContact, // POS P2.1 ▸ ผู้ติดต่อของช่องทาง = ชื่อเดียวกัน 1 รายต่อสมุด (CD6 · ล็อกต่อสมุด+ชื่อ · รีวิว F2) ◂
  resolveProductIdsForExternalSale,
  setDocExternalRef,
  setQuotationResponse,
  upsertExternalSaleDocument,
  supersedeExternalSaleAbb,
  bookTaxIdOf,
  vatConfigOf,
  voidExternalSaleDocument,
  type ExternalSaleDocLine,
} from "./service";
// CRM v2 · C0.3-A: ชนิด+คณิตศาสตร์บรรทัดเอกสาร (ไฟล์ `totals.ts` บริสุทธิ์ ไม่แตะ prisma) + ตัวจัดรูปเงิน
import { lineAmount, type LineInput } from "./totals";
import { baht } from "./service";
// ตัวกันข้อความเทคนิค (Prisma/SDK) หลุดถึงผู้ใช้ — ใช้ตอนแปลง exception เป็น `{ok:false, reason}` ของ facade
import { safeReason } from "./errors";
// POS P1.6 ▸ ถอด VAT สูตรเดียวกับบิล POS ◂
import { splitIncludedVat } from "@/lib/money/vat";
// CRM C1.3 ▸ `accountSystemForCrm` (ท้ายไฟล์) — tenantDb (ไม่ใช่ prisma ดิบ · F5) + ตาม Party ที่ถูกรวมไปตัวปลายทาง
import { tenantDb as crmTenantDb } from "@/lib/core/db";
import * as crmPartyFacade from "@/lib/modules/party";
// ◂ CRM C1.3

// ราคาขายสินค้า POS (master data — ไม่กระทบ GL) เปิดผ่าน facade ให้โมดูล pos เรียก
export {
  updateAccountProductSalePrice,
  createAccountProductWithSalePrice,
} from "./service";

// POS P1.10 ▸ ใบเสร็จ/ใบกำกับภาษีอย่างย่อของ POS: config VAT ของสมุดที่ผูก (อ่านล้วน · vatRegistered · vatRateBp · posAbbreviatedInvoice) ◂
export { vatConfigOf } from "./service";

// M3.7 (ระบบสมาชิก v2 · ไทม์ไลน์ประวัติ) — เอกสารขาออกของ party หนึ่ง (อ่านอย่างเดียว · read-through)
//   ผู้เรียก: `member/history.ts` (dynamic import — account/index อยู่ในวงจรโหลดไฟล์ของโมดูลบัญชีเอง)
export { listDocsByParty, type PartyDocRow } from "./service";

// WO 4.1 (MAP §F.11) — คลังเรียกกลับเข้ามาเมื่อ item เปลี่ยน (ชื่อ/sku/หน่วย/ต้นทุน)
//   chokepoint inventory→account · ไม่ throw · ไม่ผูก/ไม่มีระบบ = { synced:false, reason }
export { syncItemToAccountProduct, type SyncResult } from "./inventory-link";

// WO 7.2 (§12 กล่องขาเข้า) — 🔴 **ห้าม re-export `./inbox` ที่นี่**: index.ts อยู่ในวงจร
//   service → bundle → inventory/service → inventory/account-bridge → account/index
//   ⇒ ถ้า index ดึง `./inbox` (ซึ่ง import service/attachment ต่อ) จะเกิดวงกลม
//   "Cannot access 'VISIBLE_DOC_TYPES' before initialization" ตั้งแต่ตอนโหลดโมดูล (เจอจริงตอน seed)
//   ตัวเรียกจริงคือ `src/lib/outbox-consumers.ts` ซึ่งเป็น composition root (อยู่นอก src/lib/modules
//   จึงไม่ติดกฎ F2.2) → ให้ import `@/lib/modules/account/inbox` ตรง ๆ เหมือนที่ทำกับ pos/account-bridge

/** ระบบบัญชีที่ผูกกับ POS ระบบนี้ (systemId) — null = ยังไม่เชื่อมบัญชี */
export async function posAccountSystemId(
  tenantId: string,
  posSystemId: string,
): Promise<string | null> {
  const link = await findAccountLinkForPos(tenantId, posSystemId);
  return link?.systemId ?? null;
}
import {
  postExternalSale,
  postExternalRefund,
  postExternalChannelCommission, // POS P2.1 ◂
  posSaleEntryPosted, // POS P2.1 ▸ fix round 1 (F1) ◂
  posSalePaidContact, // POS P2.1 ▸ fix round 1 (F3) ◂
  ensureAccounting, // POS P2.1 ▸ ก่อนโพสต์คีย์ช่องทาง (R7) ◂
  externalSalePosted,
  postGiftCardSale as postGiftCardSaleGl,
  postGiftCardUse as postGiftCardUseGl,
  postGiftCardExpire as postGiftCardExpireGl,
  reverseFor,
  type GlCtx,
} from "./gl";
// WO 4.3 (§8.2) — บิล POS ที่มีรายการจัดชุด: ตัดสต็อกส่วนประกอบหลังสร้างเอกสารบิล
import { consumeBundleComponentsForDoc } from "./product";
import { createExpenseDoc as createExpenseDocRaw } from "./expense";

/**
 * รับยอดขายสดจากระบบภายนอก (POS) เข้าบัญชี
 * 1) หา AccountSystemLink (POS↔Account) — ไม่เจอ = ไม่ post (หลัก standalone) ห้าม throw
 * 2) ถอด VAT จากยอดรวม: จด VAT → ฐาน = round(gross / (1 + rate)) · VAT = gross − ฐาน · ไม่จด → ฐาน = gross
 * 3) โพสต์ผ่าน gl.postExternalSale (idempotent ต่อ PosSale#refId#PAID)
 *
 * WO 4.2 (MAP §F.13) — ของเพิ่มที่ "ไม่ส่งก็ได้" (ไม่ส่ง = พฤติกรรมเดิมเป๊ะทุกบรรทัด):
 *   `lines`    → สร้าง **เอกสารบัญชี 1 ใบต่อบิล** พร้อมบรรทัดสินค้า ⇒ รายงาน "ขายอะไรดี" เห็นยอด POS
 *   `customer` → ผูกผู้ติดต่อฝั่งบัญชี (partyId ก่อน ตาม WO 3.1) ⇒ รายงาน "ขายใคร" เห็นยอด POS
 *   🔴 GL ไม่เปลี่ยนแม้แต่สตางค์เดียวไม่ว่าจะส่ง lines หรือไม่ — JV ยังคิดจาก grossSatang/payMethods เส้นเดิม
 *      เอกสารเป็นชั้น "รายงาน" เท่านั้น (ไม่โพสต์ GL ซ้ำ — ดู service.EXTERNAL_SALE_DOC_TYPE)
 */
export async function applyExternalSale(input: {
  tenantId: string;
  sourceSystemId: string; // POS AppSystem.id
  refId: string; // PosSale.id
  occurredAt: Date;
  grossSatang: number; // ยอดรวม (ราคารวม VAT ถ้าร้านจด)
  // ส่วนของยอดรวมที่มาจาก "บริการ" — ไม่ระบุ = ถือเป็นขายสินค้าทั้งก้อน (พฤติกรรมเดิม)
  serviceGrossSatang?: number;
  payMethods: { channel: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" | "PLATFORM"; amountSatang: number }[];
  /** POS P2.1 (เพิ่มล้วน · มติ 1 / CD6): ชื่อช่องทางขาย — แถว PLATFORM ลงลูกหนี้ 1100 ผูกผู้ติดต่อชื่อนี้ (ไม่ส่ง/ไม่มีแถว PLATFORM = เดิมทุกไบต์) */
  channelName?: string | null;
  /** WO 4.2 — บรรทัดของบิล (สตางค์ · ราคาต่อหน่วยตามที่ขายจริง = รวม VAT เมื่อร้านจด VAT)
   *  Σ(qty×unitPriceSatang − discountSatang) ต้องเท่ากับ grossSatang เป๊ะ ไม่งั้นไม่บันทึกอะไรเลย */
  lines?: {
    itemId?: string | null; // InvItem.id (คลังกลาง — WO 4.1)
    accountProductId?: string | null; // AccountProduct.id (ถ้าผู้เรียกรู้ตรง ๆ)
    name: string;
    qty: number;
    unitPriceSatang: number;
    vatRateBp?: number;
    discountSatang?: number;
  }[];
  /** WO 4.2 — ลูกค้าของบิล (ไม่ส่ง/ไม่มี = ลูกค้าเดินเข้าร้าน → เอกสารไม่ผูกผู้ติดต่อ) */
  customer?: {
    memberId?: string | null;
    partyId?: string | null;
    name?: string | null;
    phone?: string | null;
  };
  /** เลขใบเสร็จของ POS — ใช้เป็นเลขที่เอกสารถ้ายังว่างในสมุดเล่มนี้ */
  receiptNo?: string | null;
  /** POS P1.13 (R2 · CD1 · CD4 · เพิ่มล้วน): ผู้ซื้อขอใบกำกับภาษีเต็มรูปตอนชำระ — สมุดจด VAT ⇒ ชั้นเอกสารเป็น TAX_INVOICE (แทน ABB)
   *  ผู้ติดต่อ = ผู้ซื้อ (จับด้วยเลขผู้เสียภาษี+สาขาก่อน · ไม่ผูก partyId ของสมาชิก — มติ 1) · GL เหมือนบิลไม่มีผู้ซื้อทุกสตางค์ · ไม่ส่ง = เดิมทุกไบต์ */
  buyer?: { kind: "PERSON" | "JURISTIC"; name: string; taxId: string; branchCode: string; address: string; email: string | null };
}): Promise<{ posted: boolean; reason?: string; docId?: string; fullTaxInvoice?: boolean }> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false, reason: "unlinked" };

  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const { vatRegistered, vatRateBp, posAbbreviatedInvoice } = await vatConfigOf(link.systemId);

  const gross = input.grossSatang;
  // POS P1.6 ▸ สูตรเดียวกับ PosSale.vatSatang (src/lib/money/vat.ts) ◂
  const { baseSatang: base, vatSatang: vat } = vatRegistered ? splitIncludedVat(gross, vatRateBp) : { baseSatang: gross, vatSatang: 0 };

  // ── WO 4.2: ตรวจบรรทัดก่อนแตะอะไรทั้งสิ้น — ไม่ตรงยอด = ไม่โพสต์ ไม่สร้างเอกสาร (บิลเพี้ยนห้ามเข้าบัญชี) ──
  const lines = input.lines;
  if (lines && lines.length > 0) {
    const bad = lines.find(
      (l) =>
        !Number.isInteger(l.qty) ||
        l.qty <= 0 ||
        !Number.isInteger(l.unitPriceSatang) ||
        l.unitPriceSatang < 0 ||
        (l.discountSatang !== undefined && (!Number.isInteger(l.discountSatang) || l.discountSatang < 0)),
    );
    if (bad)
      return {
        posted: false,
        reason: `บรรทัด "${bad.name}" มีจำนวน/ราคา/ส่วนลดไม่ถูกต้อง (ต้องเป็นจำนวนเต็มสตางค์ และไม่ติดลบ) — ไม่บันทึกบัญชี`,
      };
    const sum = lines.reduce((n, l) => n + l.qty * l.unitPriceSatang - (l.discountSatang ?? 0), 0);
    if (sum !== gross)
      return {
        posted: false,
        reason: `ยอดรวมของบรรทัด (${sum} สตางค์) ไม่เท่ากับยอดบิล (${gross} สตางค์) — ไม่บันทึกบัญชี`,
      };
  }

  // ช่องทางเงิน → บัญชีขา Dr (ขา Cr รายได้/VAT คงเดิม):
  //   CASH → 1000 (CASH) · TRANSFER/PROMPTPAY → 1010 (BANK)
  //   DEPOSIT → 2110 (DEPOSIT_RECEIVED ลดหนี้สินมัดจำรับ) · ROOM_CHARGE → 1100 (AR ลูกหนี้)
  //   POS P2.1: PLATFORM → ลูกหนี้แพลตฟอร์ม (PLATFORM_RECEIVABLE = 1100 · option A) ผูกผู้ติดต่อของช่องทาง
  const channelToKey = (
    ch: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" | "PLATFORM",
  ): "CASH" | "BANK" | "DEPOSIT_RECEIVED" | "AR" => {
    switch (ch) {
      case "CASH":
        return "CASH";
      case "DEPOSIT":
        return "DEPOSIT_RECEIVED";
      case "ROOM_CHARGE":
        return "AR";
      case "PLATFORM":
        return CHANNEL_GL_KEY["PLATFORM_RECEIVABLE"];
      default:
        return "BANK";
    }
  };
  // POS P2.1 ▸ มีแถว PLATFORM เท่านั้นที่ seed ผัง/หาผู้ติดต่อ (บิลอื่นไม่แตะอะไรเพิ่ม — JV เดิมทุกไบต์) ◂
  const hasPlatform = input.payMethods.some((p) => p.channel === "PLATFORM");
  if (hasPlatform) await ensureAccounting(ctx); // R7: คีย์ลูกหนี้แพลตฟอร์มต้องจับคู่ได้ก่อนโพสต์ (ห้ามตก 9999)
  const platformContactId = hasPlatform ? await platformContact(ctx, input.channelName) : null;
  const drLines = input.payMethods.map((p) => ({
    key: channelToKey(p.channel),
    amountSatang: p.amountSatang,
    ...(p.channel === "PLATFORM" && platformContactId ? { contactId: platformContactId } : {}),
  }));

  // ถอด VAT จากฝั่งบริการด้วยอัตราส่วนเดียวกับทั้งบิล แล้ว clamp ไม่ให้เกินฐานรวม
  const svcGross = Math.min(Math.max(0, Math.round(input.serviceGrossSatang ?? 0)), gross);
  const svcBase = gross > 0 ? Math.min(base, Math.round((base * svcGross) / gross)) : 0;

  const res = await postExternalSale(ctx, {
    refId: input.refId,
    date: input.occurredAt,
    baseSatang: base,
    vatSatang: vat,
    serviceBaseSatang: svcBase,
    drLines,
  });
  const posted = "entryId" in res;

  // ── WO 4.2: ชั้นเอกสาร (ไม่มี lines = ข้ามทั้งบล็อก → เส้นทางเดิมทุกประการ) ──
  //    WO 8.1: เจ้าของปิด "ใบกำกับอย่างย่อจาก POS" ในหน้าตั้งค่า (§9.2) = ไม่สร้างชั้นเอกสารนี้
  //    POS P1.13: ผู้ซื้อขอใบกำกับเต็มรูป + สมุดจด VAT = สร้างใบเต็มรูปเสมอ (ลูกค้าขอเอกสารเอง ไม่ขึ้นกับสวิตช์ใบอย่างย่อ)
  // follow-up 3 (ป้องกัน): ใบเต็มรูปเฉพาะเมื่อสมุด "ออกใบกำกับได้" ณ ตอนลงบัญชี (จด VAT · เปิดใบอย่างย่อจาก POS · มีเลขผู้เสียภาษี · บิลมี VAT)
  //   ไม่ครบ = ถอยไปเส้น ABB/ใบเสร็จเดิม (ไม่ล้างสำเนาผู้ซื้อ · ฝั่ง POS เตือน ops) — หน้าขายปฏิเสธ NOT_ELIGIBLE ตั้งแต่ตอนชำระแล้ว
  const full = !!input.buyer && vatRegistered && posAbbreviatedInvoice && vat > 0 && (await bookTaxIdOf(link.systemId)) !== "";
  if (!lines || lines.length === 0 || (!posAbbreviatedInvoice && !full)) return { posted };

  const contactId = full ? await resolveBuyerContact(ctx, input.buyer!) : await resolveExternalSaleContact(ctx, input.customer);
  const map = await resolveProductIdsForExternalSale(ctx.systemId, {
    itemIds: lines.map((l) => l.itemId ?? "").filter(Boolean),
    productIds: lines.map((l) => l.accountProductId ?? "").filter(Boolean),
  });
  const docLines: ExternalSaleDocLine[] = lines.map((l) => ({
    description: l.name,
    qty: l.qty,
    unitPrice: l.unitPriceSatang,
    discount: l.discountSatang ?? 0,
    vatRateBp: l.vatRateBp ?? null,
    productId:
      (l.accountProductId ? map.byProductId.get(l.accountProductId) : undefined) ??
      (l.itemId ? map.byItemId.get(l.itemId) : undefined) ??
      null,
  }));

  const doc = await upsertExternalSaleDocument({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    refSystemId: input.sourceSystemId,
    refId: input.refId,
    docNo: input.receiptNo ?? null,
    occurredAt: input.occurredAt,
    contactId,
    // ร้านจด VAT: ราคาหน้าร้าน "รวม VAT แล้ว" (เส้นเดียวกับที่ JV ถอด VAT ออกจากยอดรวม)
    vatMode: vatRegistered ? "INCLUDE" : "NONE",
    vatRegistered,
    vatRateBp,
    grandTotalSatang: gross,
    note: input.receiptNo ? `ขายหน้าร้าน POS · ใบเสร็จ ${input.receiptNo}` : "ขายหน้าร้าน POS",
    lines: docLines,
    ...(full ? { fullTaxInvoice: true, buyer: input.buyer } : {}), // POS P1.13 ▸ R2 · fix F4 สำเนาผู้ซื้อตามที่กรอก ◂
  });
  if (!doc.ok) return { posted, reason: doc.reason };
  // WO 4.3 (§8.2): บิล POS ที่ขาย "รายการจัดชุด" → ตัดสต็อกส่วนประกอบ
  //   ตัดเฉพาะตอนเอกสารถูก "สร้างใหม่" (created) — ยิงซ้ำด้วย refId เดิม upsert คืนใบเดิม ⇒ ไม่ตัดซ้ำ
  //   (ตัวที่ผูกคลังยังมีคีย์ idempotent ต่อบรรทัดซ้อนอีกชั้น)
  if (doc.created) await consumeBundleComponentsForDoc(ctx, doc.docId);
  return { posted, docId: doc.docId, ...(full ? { fullTaxInvoice: true } : {}) };
}

/**
 * POS P1.13 (มติ 1 · CD4) — ผู้ติดต่อของผู้ซื้อใบกำกับเต็มรูป: เลขผู้เสียภาษี + สาขาชนะชื่อ (ใช้ผู้ติดต่อเดิมของร้านที่เลขตรง)
 * ไม่ส่ง partyId (ไม่งั้นผู้ติดต่อของสมาชิกที่ไม่มีเลขภาษีจะชนะ) · สร้างใหม่ = มีเลข/สาขา/ที่อยู่/อีเมล/ชนิดครบ
 */
async function resolveBuyerContact(
  ctx: GlCtx,
  buyer: { kind: "PERSON" | "JURISTIC"; name: string; taxId: string; branchCode: string; address: string; email: string | null },
): Promise<string> {
  const contact = await findOrCreateCustomerContact(
    { tenantId: ctx.tenantId, systemId: ctx.systemId },
    {
      name: buyer.name,
      taxId: buyer.taxId,
      branchCode: buyer.branchCode || "00000",
      email: buyer.email ?? null,
      address: buyer.address,
      legalType: buyer.kind === "PERSON" ? "PERSON" : "COMPANY",
    },
  );
  return contact.id;
}

/**
 * POS P1.13 (R3 · CD1 · CD2 · มติ 4) — ออกใบกำกับภาษีเต็มรูปทีหลังแทนใบกำกับอย่างย่อของบิล POS (ทางเฉพาะของ POS · ไม่แตะ GL)
 * {ok:true, docId, docNo, created} | {ok:false, code}:
 *   UNLINKED (POS ไม่ผูกสมุด) · NOT_VAT (สมุดไม่จด VAT) · NO_ABB (ยังไม่มี ABB ของบิล — consumer ยังไม่ทำงาน · ลองใหม่ได้) ·
 *   NOT_LIVE (ABB ถูกยกเลิก/แทนไปแล้วโดยไม่มีใบเต็มรูป) · INTERNAL
 * ยิงซ้ำหลังออกแล้ว = ใบเดิม (created:false) · ไม่เคย throw
 */
export async function supersedeAbbWithTaxInvoice(input: {
  tenantId: string;
  sourceSystemId: string; // POS AppSystem.id
  refId: string; // PosSale.id
  buyer: { kind: "PERSON" | "JURISTIC"; name: string; taxId: string; branchCode: string; address: string; email: string | null };
}): Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; buyerMatches?: boolean } | { ok: false; code: "UNLINKED" | "NOT_VAT" | "NO_ABB" | "NOT_LIVE" | "INTERNAL"; reason: string }> {
  try {
    const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
    if (!link) return { ok: false, code: "UNLINKED", reason: "POS นี้ยังไม่ผูกสมุดบัญชี" };
    const { vatRegistered } = await vatConfigOf(link.systemId);
    if (!vatRegistered) return { ok: false, code: "NOT_VAT", reason: "สมุดบัญชีไม่ได้จดภาษีมูลค่าเพิ่ม" };
    const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
    const abb = await findDocByRef(link.systemId, "TAX_INVOICE_ABB", "PosSale", input.refId);
    if (!abb) return { ok: false, code: "NO_ABB", reason: "ระบบบัญชียังไม่มีใบกำกับภาษีอย่างย่อของบิลนี้" };
    const contactId = await resolveBuyerContact(ctx, input.buyer);
    const res = await supersedeExternalSaleAbb({
      tenantId: input.tenantId,
      systemId: link.systemId,
      abbDocId: abb.id,
      contactId,
      buyer: input.buyer, // POS P1.13 fix F1 (ตรวจผู้ซื้อของใบเดิม) + F4 (สำเนาผู้ซื้อตามที่กรอก) ◂
    });
    if (!res.ok) return { ok: false, code: res.code === "NOT_FOUND" ? "NO_ABB" : res.code, reason: res.reason };
    return res;
  } catch (e) {
    return { ok: false, code: "INTERNAL", reason: safeReason(e, "ออกใบกำกับภาษีเต็มรูปไม่สำเร็จ") };
  }
}
/** ชื่อตามข้อสอบ P1.13 (ตารางชื่อ #16) — ตัวเดียวกับ supersedeAbbWithTaxInvoice */
export const convertAbbToTaxInvoice = supersedeAbbWithTaxInvoice;

// POS P1.13 ▸ R5 · CD3: ค้นนิติบุคคลกรมพัฒน์ฯ — POS เรียกผ่าน facade เท่านั้น (กุญแจอยู่ใน env ของ prod · ไม่มีกุญแจ = DBD_REASON.noKey) ◂
export { lookupJuristic, isDbdConfigured, DBD_REASON, type DbdLookupResult } from "./dbd";

/**
 * ผู้ติดต่อของบิล POS — partyId ก่อน (WO 3.1) แล้วค่อยเบอร์/ชื่อ ตามลำดับของ `findOrCreateCustomerContact`
 * ไม่มีข้อมูลลูกค้าเลย = **ลูกค้าเดินเข้าร้าน** → คืน null (เอกสารไม่ผูกผู้ติดต่อ · รายงานจัดเป็น "ไม่ระบุคู่ค้า")
 * — ตั้งใจไม่สร้างผู้ติดต่อ "ลูกค้าทั่วไป" ก้อนเดียวรวมทุกคน เพราะจะกลายเป็นลูกค้าอันดับ 1 ปลอม ๆ ในรายงาน
 */
async function resolveExternalSaleContact(
  ctx: GlCtx,
  customer?: { memberId?: string | null; partyId?: string | null; name?: string | null; phone?: string | null },
): Promise<string | null> {
  if (!customer) return null;
  const name = (customer.name ?? "").trim();
  const phone = (customer.phone ?? "").trim();
  if (!customer.partyId && !name && !phone) return null;
  const contact = await findOrCreateCustomerContact(
    { tenantId: ctx.tenantId, systemId: ctx.systemId },
    {
      // ไม่มีชื่อ (สมาชิกที่กรอกแค่เบอร์) → ใช้เบอร์เป็นชื่อชั่วคราว เหมือนกติกา Party ของ WO 3.1
      name: name || phone || "ลูกค้า POS",
      phone: phone || null,
      partyId: customer.partyId ?? null,
    },
  );
  return contact.id;
}

/**
 * กลับรายการยอดขาย POS ที่ถูก void — reversal ครบทุกขา (idempotent)
 * ไม่เชื่อมบัญชี = ไม่มีอะไรกลับ (posted: false)
 * WO 4.2: ถ้าบิลนั้นมีเอกสารบัญชี (POS ส่ง lines) → ยกเลิกเอกสารด้วย (VOIDED ไม่ลบบรรทัด)
 */
export async function reverseExternalSale(input: {
  tenantId: string;
  sourceSystemId: string;
  refId: string;
}): Promise<{ posted: boolean; docVoided?: boolean }> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false };

  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const reversed = await reverseFor(ctx, "PosSale", input.refId, "POS void บิล");
  const voided = await voidExternalSaleDocument(input.tenantId, link.systemId, input.refId, "POS void บิล");
  return { posted: reversed.length > 0, docVoided: voided.voided };
}

// ─────────────────────────────────────────────────────────────
// POS P1.8 ▸ คืนเงินหน้าร้าน → ใบลดหนี้ + กลับรายการตามสัดส่วน (REVIEW #6) ◂
//
// 🔴 ร้านที่ไม่ผูกบัญชีกับ POS = { posted:false, reason:"unlinked" } **ห้าม throw** (หลัก standalone เดียวกับ applyExternalSale)
// 🔴 GL: Dr รายได้ (สินค้า/บริการตามสัดส่วนบรรทัดบริการ) + Dr ภาษีขาย · Cr เงินสด/ธนาคารตามวิธีคืน — idempotent ต่อใบคืน
//    VAT ถอดด้วย splitIncludedVat สูตรเดียวกับ PosSale.vatSatang ของใบคืน · JV/ใบกำกับของบิลเดิมไม่ถูกแตะ (CD6)
// 🔴 ชั้นเอกสาร: CREDIT_NOTE 1 ใบต่อใบคืน อ้าง ABB ของบิลเดิม (findDocByRef) · เลขที่ = เลขใบคืนของ POS
//    สร้างเฉพาะเมื่อส่ง lines และร้านเปิด "ใบกำกับอย่างย่อจาก POS" (กติกาเดียวกับชั้นเอกสารของ applyExternalSale)
//    POS ไม่เห็นเลขบัญชีใด ๆ (D3)
export async function applyExternalRefund(input: {
  tenantId: string;
  sourceSystemId: string; // POS AppSystem.id
  refId: string; // PosSale.id ของใบคืน (docType REFUND)
  saleRefId: string; // PosSale.id ของบิลเดิม (หา ABB)
  occurredAt: Date;
  grossSatang: number; // ยอดคืน (รวม VAT ถ้าร้านจด)
  /** ส่วนของยอดคืนที่เป็นบริการ (กลับ 4030) — ไม่ส่ง = สินค้าทั้งก้อน */
  serviceGrossSatang?: number;
  payMethods: { channel: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" | "PLATFORM"; amountSatang: number }[];
  /** POS P2.1 (เพิ่มล้วน): ชื่อช่องทางขาย — แถว PLATFORM (แพลตฟอร์มคืนลูกค้า) ลดลูกหนี้ 1100 ของผู้ติดต่อนี้ */
  channelName?: string | null;
  /** บรรทัดของใบคืน (Σ qty×unitPrice − discount = grossSatang เป๊ะ) — ไม่ส่ง/ว่าง = ไม่มีชั้นเอกสาร */
  lines?: { itemId?: string | null; name: string; qty: number; unitPriceSatang: number; discountSatang?: number }[];
  docNo?: string | null; // เลขใบคืนของ POS
  reason?: string | null;
  // POS P1.16 ▸ R5b(a): VAT ของใบคืน POS (PosSale.vatSatang) — ส่งมา = ใช้ตัวนี้ทั้ง JV และใบลดหนี้ (สมุดจด VAT)
  //   ⇒ คืนครบหลายใบ Σ VAT = VAT ของบิลเป๊ะ · 2200 ของบิลสุทธิ 0 · ไม่ส่ง/ผิดรูป = ถอดจากยอดแบบเดิม ◂
  vatSatang?: number;
}): Promise<{ posted: boolean; reason?: string; docId?: string }> {
  // ไม่ผูก = จบเงียบ · ความล้มของ GL (งวดปิด/ผังไม่ครบ) โยนต่อแบบ applyExternalSale ⇒ คิวลองใหม่ ไม่ปิดเงียบ ๆ
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false, reason: "unlinked" };
  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const { vatRegistered, vatRateBp, posAbbreviatedInvoice } = await vatConfigOf(link.systemId);
  const gross = input.grossSatang;
  if (!Number.isInteger(gross) || gross <= 0) return { posted: false, reason: "ยอดคืนต้องเป็นจำนวนเต็มสตางค์มากกว่า 0 — ไม่บันทึกบัญชี" };
  const paySum = input.payMethods.reduce((n, p) => n + p.amountSatang, 0);
  if (paySum !== gross) return { posted: false, reason: `ยอดคืนแยกตามวิธี (${paySum}) ไม่เท่ากับยอดใบคืน (${gross}) — ไม่บันทึกบัญชี` };
  const lines = input.lines ?? [];
  if (lines.length > 0) {
    const bad = lines.find((l) => !Number.isInteger(l.qty) || l.qty <= 0 || !Number.isInteger(l.unitPriceSatang) || l.unitPriceSatang < 0 || (l.discountSatang !== undefined && (!Number.isInteger(l.discountSatang) || l.discountSatang < 0)));
    if (bad) return { posted: false, reason: `บรรทัด "${bad.name}" ของใบคืนมีจำนวน/ราคา/ส่วนลดไม่ถูกต้อง — ไม่บันทึกบัญชี` };
    const sum = lines.reduce((n, l) => n + l.qty * l.unitPriceSatang - (l.discountSatang ?? 0), 0);
    if (sum !== gross) return { posted: false, reason: `ยอดรวมของบรรทัดใบคืน (${sum}) ไม่เท่ากับยอดคืน (${gross}) — ไม่บันทึกบัญชี` };
  }
  const explicitVat = vatRegistered && Number.isInteger(input.vatSatang) && input.vatSatang! >= 0 && input.vatSatang! <= gross ? input.vatSatang! : null;
  const { baseSatang: base, vatSatang: vat } =
    explicitVat !== null ? { baseSatang: gross - explicitVat, vatSatang: explicitVat } : vatRegistered ? splitIncludedVat(gross, vatRateBp) : { baseSatang: gross, vatSatang: 0 };
  const svcGross = Math.min(Math.max(0, Math.round(input.serviceGrossSatang ?? 0)), gross);
  const svcBase = Math.min(base, Math.round((base * svcGross) / gross));
  // คืนได้เฉพาะเงินสด/ธนาคาร (มัดจำ/ลงห้อง ถูกปฏิเสธตั้งแต่ POS — R5) · ที่เหลือ = ธนาคาร
  //   POS P2.1 ▸ PLATFORM = แพลตฟอร์มคืนลูกค้า ⇒ Cr ลูกหนี้แพลตฟอร์ม (1100) ผูกผู้ติดต่อของช่องทาง (R9) ◂
  //   fix round 1 (F3) ▸ ผู้ติดต่อ = ผู้ติดต่อบนบรรทัด 1100 ของ JV ขาย (PAID) ของบิลเดิม · ไม่มี = ชื่อช่องทางปัจจุบัน ◂
  const refundPlatformContact = input.payMethods.some((p) => p.channel === "PLATFORM")
    ? ((await posSalePaidContact(ctx, input.saleRefId, CHANNEL_GL_KEY["PLATFORM_RECEIVABLE"])) ?? (await platformContact(ctx, input.channelName)))
    : null;
  const crLines = input.payMethods.map((p) =>
    p.channel === "PLATFORM"
      ? { key: CHANNEL_GL_KEY["PLATFORM_RECEIVABLE"], amountSatang: p.amountSatang, ...(refundPlatformContact ? { contactId: refundPlatformContact } : {}) }
      : { key: (p.channel === "CASH" ? "CASH" : "BANK") as "CASH" | "BANK", amountSatang: p.amountSatang },
  );
  const res = await postExternalRefund(ctx, { refId: input.refId, date: input.occurredAt, baseSatang: base, vatSatang: vat, serviceBaseSatang: svcBase, crLines });
  const posted = "entryId" in res;
  if (lines.length === 0 || !posAbbreviatedInvoice) return { posted };

  const abb = await findExternalSaleDoc(link.systemId, input.saleRefId);
  const map = await resolveProductIdsForExternalSale(ctx.systemId, { itemIds: lines.map((l) => l.itemId ?? "").filter(Boolean), productIds: [] });
  const docLines: ExternalSaleDocLine[] = lines.map((l) => ({
    description: l.name,
    qty: l.qty,
    unitPrice: l.unitPriceSatang,
    discount: l.discountSatang ?? 0,
    vatRateBp: null,
    productId: (l.itemId ? map.byItemId.get(l.itemId) : undefined) ?? null,
  }));
  const reason = (input.reason ?? "").trim() || "คืนสินค้า/คืนเงินหน้าร้าน";
  const doc = await upsertExternalCreditNoteDocument({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    refSystemId: input.sourceSystemId,
    refId: input.refId,
    sourceDocId: abb?.id ?? null,
    docNo: input.docNo ?? null,
    occurredAt: input.occurredAt,
    contactId: abb?.contactId ?? null,
    vatMode: vatRegistered ? "INCLUDE" : "NONE",
    vatRegistered,
    vatRateBp,
    grandTotalSatang: gross,
    ...(explicitVat !== null ? { vatSatang: explicitVat } : {}), // POS P1.16 ▸ CD-O8: เอกสาร = ใบคืน POS = JV ◂
    reason,
    note: input.docNo ? `คืนเงินหน้าร้าน POS · ใบคืน ${input.docNo}${abb?.docNo ? ` · อ้างใบเสร็จ ${abb.docNo}` : ""}` : "คืนเงินหน้าร้าน POS",
    lines: docLines,
  });
  if (!doc.ok) return { posted, reason: doc.reason };
  return { posted, docId: doc.docId };
}

// ─────────────────────────────────────────────────────────────
// POS P2.1 ▸ ช่องทางขาย: ลูกหนี้แพลตฟอร์ม + ค่าคอมฯ ช่องทาง (R7 R9 · §9 Q1 option A · CD5 CD6) ◂
//
// 🔴 คีย์ของช่องทาง (§9 Q1): ตั้งชื่อไว้ตอนนี้ ชี้ไปบัญชีเดิมของผัง (option A — ผังไม่เปลี่ยน) ·
//    เจ้าของบัญชีเลือก option B ทีหลัง (1120 ลูกหนี้แพลตฟอร์ม / 6520 ค่าคอมมิชชันแพลตฟอร์ม · POS-OWNER-PENDING O25) = แก้ตารางนี้ที่เดียว
// 🔴 POS ไม่เห็นเลขบัญชี — ส่งแค่ยอด/payout/ชื่อช่องทาง · ไม่ผูกสมุด = {posted:false, reason:"unlinked"} ไม่ throw ·
//    ความล้มของ GL (งวดปิด ฯลฯ) โยนต่อ ⇒ คิวลองใหม่ (แบบ applyExternalSale)
const CHANNEL_GL_KEY = {
  "PLATFORM_RECEIVABLE": "AR", // ลูกหนี้แพลตฟอร์ม (option A = 1100 ลูกหนี้การค้า · แยกรายแพลตฟอร์มด้วยผู้ติดต่อ)
  "PLATFORM_COMMISSION": "PAYMENT_FEE", // ค่าคอมฯ แพลตฟอร์ม (option A = 6500 ค่าธรรมเนียมชำระเงิน)
  "CHANNEL_COMMISSION_PAYABLE": "AP", // ค่าคอมฯ ค้างจ่ายของช่องทางที่ร้านเก็บเงินเอง (2100)
  "CHANNEL_COMMISSION_VAT": "VAT_INPUT_UNDUE", // VAT บนค่าคอมฯ รอใบกำกับจากแพลตฟอร์ม (1155 · Q2/O26)
} as const;

/**
 * ผู้ติดต่อของช่องทาง (ชื่อเดียวกัน 1 รายต่อสมุด · CD6) — ชื่อว่าง = null (บรรทัดไม่ผูกผู้ติดต่อ)
 * fix round 1 (รีวิว F2): หา-แล้ว-สร้างอยู่ใต้ pg_advisory_xact_lock(hashtext(สมุด:ชื่อ)) ใน transaction เดียว
 *   + หาตัวเก่าสุดก่อน (createdAt asc) — ตัวล็อกอยู่ใน service (facade ห้ามแตะ prisma ดิบ · F5) ⇒ ensureNamedCustomerContact
 */
async function platformContact(ctx: GlCtx, channelName: string | null | undefined): Promise<string | null> {
  const name = (channelName ?? "").trim();
  if (!name) return null;
  return (await ensureNamedCustomerContact({ tenantId: ctx.tenantId, systemId: ctx.systemId }, name)).id;
}

/**
 * POS P2.1 (R7 R9) — JV ค่าคอมฯ ของช่องทางขาย แยกจาก JV ขาย (PAID) · idempotent ต่อคีย์ของตัวเอง:
 *   ปกติ: `PosSale#<บิล>#COMMISSION` · reverse (คืนเงินตามสัดส่วน): `PosSale#<ใบคืน>#COMMISSION_REFUNDED`
 *   PLATFORM: Dr ค่าคอมฯ (6500) + Dr ภาษีซื้อรอใบกำกับ (1155) / Cr ลูกหนี้แพลตฟอร์ม (1100) ⇒ ลูกหนี้เหลือ = ยอดที่แพลตฟอร์มจะโอน
 *   DIRECT:   Dr ค่าคอมฯ (6500) + Dr 1155 / Cr เจ้าหนี้ (2100) · สมุดไม่จด VAT ⇒ VAT รวมเข้าค่าคอมฯ (ไม่มี 1155)
 *   ค่าคอมฯ 0 ⇒ {posted:false, reason:"zero"} · ไม่ผูกสมุด ⇒ {posted:false, reason:"unlinked"} · void = reverseFor ของบิลกลับให้เอง
 */
export async function applyExternalChannelCommission(input: {
  tenantId: string;
  sourceSystemId: string; // POS AppSystem.id
  refId: string; // PosSale.id ของบิล (ปกติ) หรือของใบคืน (reverse)
  occurredAt: Date;
  commissionSatang: number;
  commissionVatSatang: number;
  payout: "PLATFORM" | "DIRECT";
  channelName: string;
  /** เลขใบเสร็จ/เลขใบคืนของ POS — ใส่ใน memo */
  receiptNo?: string | null;
  /** true = กลับรายการตามส่วนแบ่งของใบคืน (refId = ใบคืน) */
  reverse?: boolean;
  /** fix round 1 (เพิ่มล้วน): reverse — PosSale.id ของบิลเดิม ⇒ กลับได้เฉพาะเมื่อบิลมี JV COMMISSION แล้ว + ใช้ผู้ติดต่อของ PAID (F1 F3) */
  saleRefId?: string | null;
}): Promise<{ posted: boolean; reason?: string; entryId?: string }> {
  const c = Number.isInteger(input.commissionSatang) && input.commissionSatang > 0 ? input.commissionSatang : 0;
  const v = Number.isInteger(input.commissionVatSatang) && input.commissionVatSatang > 0 ? input.commissionVatSatang : 0;
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false, reason: "unlinked" };
  if (c + v === 0) return { posted: false, reason: "zero" };
  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  // fix round 1 (รีวิว F1) ▸ ลำดับเงิน: ห้ามมี COMMISSION โดยไม่มี PAID · ห้ามกลับ (COMMISSION_REFUNDED) ค่าคอมฯ ที่บิลไม่เคยลง ◂
  //   คีย์ของตัวเองมีแล้ว = จบก่อนแตะผัง/ผู้ติดต่อ (ผลเดิม "already")
  const saleId = input.reverse ? (input.saleRefId ?? null) : input.refId;
  if (await posSaleEntryPosted(ctx, input.refId, input.reverse ? "COMMISSION_REFUNDED" : "COMMISSION")) return { posted: false, reason: "already" };
  if (!input.reverse && !(await posSaleEntryPosted(ctx, input.refId, "PAID"))) return { posted: false, reason: "no-paid" };
  if (input.reverse && saleId && !(await posSaleEntryPosted(ctx, saleId, "COMMISSION"))) return { posted: false, reason: "no-commission" };
  await ensureAccounting(ctx); // R7: ผัง/การจับคู่คีย์ครบก่อนโพสต์ — ห้ามตก 9999 SUSPENSE
  const { vatRegistered } = await vatConfigOf(link.systemId);
  // fix round 1 (รีวิว F3) ▸ PLATFORM: ผู้ติดต่อ = ผู้ติดต่อบนบรรทัด 1100 ของ PAID ของบิล (ช่องทางเปลี่ยนชื่อทีหลังก็ยังเป็นรายเดิม) · ไม่มี = ชื่อช่องทาง ◂
  const paidContact = input.payout === "PLATFORM" && saleId ? await posSalePaidContact(ctx, saleId, CHANNEL_GL_KEY["PLATFORM_RECEIVABLE"]) : null;
  const contactId = paidContact ?? (await platformContact(ctx, input.channelName));
  const name = (input.channelName ?? "").trim() || "ช่องทางขาย";
  const no = (input.receiptNo ?? "").trim();
  const memo = input.reverse ? `คืนค่าคอมฯ ช่องทาง ${name}${no ? ` · ใบคืน ${no}` : ""}` : `ค่าคอมฯ ช่องทาง ${name}${no ? ` · บิล ${no}` : ""}`;
  const res = await postExternalChannelCommission(ctx, {
    refId: input.refId,
    date: input.occurredAt,
    commissionSatang: c,
    commissionVatSatang: v,
    foldVat: !vatRegistered,
    keys: {
      expense: CHANNEL_GL_KEY["PLATFORM_COMMISSION"],
      vatInput: CHANNEL_GL_KEY["CHANNEL_COMMISSION_VAT"],
      counter: input.payout === "PLATFORM" ? CHANNEL_GL_KEY["PLATFORM_RECEIVABLE"] : CHANNEL_GL_KEY["CHANNEL_COMMISSION_PAYABLE"],
    },
    contactId,
    memo,
    reverse: !!input.reverse,
  });
  return "entryId" in res ? { posted: true, entryId: res.entryId } : { posted: false, reason: "already" };
}

/**
 * POS P1.8 F8 — บิล POS นี้ลง JV ขายแล้วหรือยัง (คีย์ PosSale#<refId>#PAID ของสมุดที่ผูกกับ POS)
 * null = ไม่ผูกบัญชี (ไม่มีอะไรให้ลง) · ใช้ตัดสินว่าตัวรับคืนเงินต้องลงบิลเดิมแทน pos.sale.paid ที่ข้ามไปหรือไม่
 */
export async function posSalePosted(input: { tenantId: string; sourceSystemId: string; refId: string }): Promise<boolean | null> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return null;
  return externalSalePosted({ tenantId: input.tenantId, systemId: link.systemId }, input.refId);
}

/** POS P1.8 R9 — เอกสารบัญชี (ใบกำกับอย่างย่อ) ของบิล POS — null = ไม่ผูกบัญชี/ยังไม่มีเอกสาร (อ่านอย่างเดียว · ไม่ throw) */
export async function posSaleAccountingRef(input: { tenantId: string; sourceSystemId: string; refId: string }): Promise<{ docId: string; docNo: string | null } | null> {
  try {
    const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
    if (!link) return null;
    const doc = await findExternalSaleDoc(link.systemId, input.refId);
    return doc ? { docId: doc.id, docNo: doc.docNo } : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// บัตรกำนัล (M2.6 · D3 · §9.4) — โมดูล giftcard เรียกผ่าน 4 ฟังก์ชันนี้เท่านั้น
//
// 🔴 ผู้เรียกไม่รู้เลขบัญชี: ส่งแค่ "เงินเท่าไหร่ เข้าทางไหน อ้างอิงอะไร" — mapping 2110/4030/4900 อยู่ที่ gl.ts
// 🔴 ร้านที่ยังไม่เชื่อมบัญชีกับ POS = ไม่ post (คืน { posted: false, reason: "unlinked" }) **ห้าม throw**
//    (หลัก standalone เดียวกับ applyExternalSale — ระบบสมาชิกต้องขายบัตรได้แม้ร้านไม่ได้ใช้โมดูลบัญชี)
// ─────────────────────────────────────────────────────────────

export type GiftCardPayMethod = {
  channel: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE";
  amountSatang: number;
};

export type GiftCardPostResult = { posted: boolean; entryId?: string; reason?: string };

/** ระบบบัญชีที่ผูกกับ POS ของร้าน + ctx ของ GL — null = ยังไม่เชื่อมบัญชี */
async function giftCardCtx(tenantId: string, posSystemId: string): Promise<GlCtx | null> {
  const link = await findAccountLinkForPos(tenantId, posSystemId);
  return link ? { tenantId, systemId: link.systemId } : null;
}

/** ขายบัตรกำนัล / เติมเงินเข้าบัตร → รับเงินล่วงหน้า (Dr เงินสด-ธนาคาร · Cr 2110) */
export async function postGiftCardSale(input: {
  tenantId: string;
  sourceSystemId: string; // AppSystem.id ของ POS ที่รับเงิน
  refId: string; // GiftCard.id (ขายใบใหม่) หรือ GiftCardTxn.id (เติมเงิน)
  refType?: "GiftCard" | "GiftCardTxn";
  occurredAt: Date;
  satang: number;
  payMethods: GiftCardPayMethod[];
}, tx?: Prisma.TransactionClient): Promise<GiftCardPostResult> {
  const ctx = await giftCardCtx(input.tenantId, input.sourceSystemId);
  if (!ctx) return { posted: false, reason: "unlinked" };
  const res = await postGiftCardSaleGl(ctx, {
    refType: input.refType ?? "GiftCard",
    refId: input.refId,
    date: input.occurredAt,
    satang: input.satang,
    drLines: input.payMethods.map((p) => ({ key: giftCardChannelKey(p.channel), amountSatang: p.amountSatang })),
  }, tx);
  return "entryId" in res ? { posted: true, entryId: res.entryId } : { posted: false, reason: "posted-before" };
}

/** ใช้บัตรกำนัลชำระบิล → รับรู้รายได้ (Dr 2110 · Cr 4030) */
export async function postGiftCardUse(input: {
  tenantId: string;
  sourceSystemId: string;
  refId: string; // GiftCardTxn.id
  occurredAt: Date;
  satang: number;
}, tx?: Prisma.TransactionClient): Promise<GiftCardPostResult> {
  const ctx = await giftCardCtx(input.tenantId, input.sourceSystemId);
  if (!ctx) return { posted: false, reason: "unlinked" };
  const res = await postGiftCardUseGl(ctx, { refId: input.refId, date: input.occurredAt, satang: input.satang }, tx);
  return "entryId" in res ? { posted: true, entryId: res.entryId } : { posted: false, reason: "posted-before" };
}

/** บัตรกำนัลหมดอายุทั้งที่มียอดเหลือ → รายได้อื่น (Dr 2110 · Cr 4900) */
export async function postGiftCardExpire(input: {
  tenantId: string;
  sourceSystemId: string;
  refId: string; // GiftCardTxn.id (รายการ EXPIRE)
  occurredAt: Date;
  satang: number;
}, tx?: Prisma.TransactionClient): Promise<GiftCardPostResult> {
  const ctx = await giftCardCtx(input.tenantId, input.sourceSystemId);
  if (!ctx) return { posted: false, reason: "unlinked" };
  const res = await postGiftCardExpireGl(ctx, { refId: input.refId, date: input.occurredAt, satang: input.satang }, tx);
  return "entryId" in res ? { posted: true, entryId: res.entryId } : { posted: false, reason: "posted-before" };
}

/**
 * กลับรายการบัญชีของบัตรกำนัล (void บิลที่ใช้บัตร) — ใช้ `reverseFor` ตัวเดิมของ GL
 * idempotent: เรียกซ้ำได้ (reverseFor ข้าม entry ที่ถูกกลับไปแล้ว)
 */
export async function reverseGiftCardPosting(input: {
  tenantId: string;
  sourceSystemId: string;
  refType: "GiftCard" | "GiftCardTxn";
  refId: string;
  reason: string;
}): Promise<{ posted: boolean }> {
  const ctx = await giftCardCtx(input.tenantId, input.sourceSystemId);
  if (!ctx) return { posted: false };
  const reversed = await reverseFor(ctx, input.refType, input.refId, input.reason);
  return { posted: reversed.length > 0 };
}

/** ช่องทางเงินของ POS → คีย์บัญชีขา Dr (เส้นเดียวกับ applyExternalSale) */
function giftCardChannelKey(
  channel: GiftCardPayMethod["channel"],
): "CASH" | "BANK" | "DEPOSIT_RECEIVED" | "AR" {
  switch (channel) {
    case "CASH":
      return "CASH";
    case "DEPOSIT":
      return "DEPOSIT_RECEIVED";
    case "ROOM_CHARGE":
      return "AR";
    default:
      return "BANK";
  }
}

// ─────────────────────────────────────────────────────────────
// ตรวจของที่ผู้เรียกภายนอกส่งเข้ามา (CRM v2 · C0.3) — **ปฏิเสธ ไม่ใช่แอบปัดให้**
//
// 🔴 ทำไมต้องตรวจที่นี่ ไม่ใช่ใน `createDocument`: `computeTotals` clamp ส่วนลดที่ "เอาไปคิด"
//    (`Math.min(Math.max(0,d), baseSum)`) แต่ `createDocument` **เก็บค่าดิบ** ลงคอลัมน์ `discountAmount`
//    และ `gl.postDocument` คิดฐานรายได้จากค่าที่เก็บ (`subTotal − discountAmount`)
//    ⇒ ส่งส่วนลด ฿1,500 ให้ใบ ฿1,000: เอกสารพิมพ์ออกมาว่าลด ฿1,500 แต่ยอดรวม ฿0 (ขัดกันเอง)
//      แปลงเป็นใบแจ้งหนี้แล้วกด "ออกเอกสาร" จะเด้ง "ลงบัญชีไม่สมดุล…" ตลอดกาล — ใบนั้นออกไม่ได้อีกเลย
//      ส่วนลดติดลบร้ายกว่า: เงียบจนถึงตอนออกเอกสาร แล้วบันทึกรายได้ **สูงกว่า** ที่เสนอราคาไว้
//    หน้าจอเอกสารของคนในร้านผ่าน `computeDocTotals` ที่ clamp มาก่อนแล้ว — facade นี้คือผู้เรียกรายแรก
//    ที่ยิงตรงถึง `createDocument` ได้ · `createDocument` เป็นโค้ดเงินที่ใช้ร่วมกัน ใบนี้เป็น additive-only
//    จึงแก้ที่ปากทางนี้ (ข้อบกพร่องที่ลึกกว่านั้นบันทึกเป็นหนี้ของโมดูลบัญชี ไม่แก้ในใบนี้)
//    🔴 แอบ clamp ให้เงียบ ๆ ไม่ได้: ฿1,500 ที่กลายเป็น ฿1,000 เองคือการปิดบังความผิดพลาดของคนกรอก
// ─────────────────────────────────────────────────────────────

/** จำนวนของบรรทัด: คอลัมน์เป็น Decimal(12,4) — ปัดที่ปากทางให้ตรงกับที่ฐานเก็บ (ไม่งั้นใบพิมพ์ขัดกันเอง) */
const roundQty4 = (qty: number): number =>
  Number.isFinite(qty) ? Math.round(qty * 10_000) / 10_000 : qty;

const isSatang = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);

// ─── เพดาน "เท่าที่ฐานข้อมูลเก็บได้จริง" ───────────────────────────────────────
// 🔴 ด่าน "จำนวนเต็ม/ไม่ติดลบ" อย่างเดียวไม่พอ: `unitPrice` · `discount` · `amount` ของบรรทัด และ
//    `AccountDocument.discountAmount`/`subTotal` เป็น Postgres `int4` ส่วน `qty` เป็น `Decimal(12,4)`
//    (prisma/schema/account.prisma:215-232) ⇒ ค่าที่ใหญ่เกินผ่านด่านเดิมได้สบาย แล้วไปตายที่ฐานข้อมูล
//    (`value out of range for type integer` · `numeric field overflow`) เป็น **exception ที่หลุดออกจาก
//    facade ซึ่งสัญญาไว้ว่าคืน `{ok:false, reason}` เสมอ** ⇒ route ฝั่ง CRM ตอบ 500 แทนข้อความไทย
const MAX_SATANG = 2_147_483_647; // int4 = ฿21,474,836.47
const MAX_QTY = 99_999_999.9999; // Decimal(12,4) = 8 หลักหน้าจุด + 4 หลักหลังจุด
const MAX_QTY_TEXT = MAX_QTY.toLocaleString("th-TH", { maximumFractionDigits: 4 });
/** จำนวนบรรทัดสูงสุดที่รับจากระบบภายนอก — อาร์เรย์ไม่จำกัดคือทางที่สองที่ทำให้ใบนี้ระเบิด
 *  (เทียบเคียงเพดานเดิมของโมดูล `TEMPLATE_MAX_LINES` = 100 แล้วเผื่อไว้ให้ดีลใหญ่) */
const MAX_EXTERNAL_LINES = 200;

/**
 * ปัญหาของ input (ถ้ามี) เป็นข้อความไทยที่ **บอกตัวเลขที่ได้รับจริง** — ไม่มีปัญหา = null
 * `checkLines` = ผู้เรียกส่ง `lines` มาเอง (บรรทัดที่ระบบสร้างเองจาก title/valueSatang คงพฤติกรรมเดิมเป๊ะ)
 */
function externalQuotationProblem(
  lines: LineInput[],
  checkLines: boolean,
  discountAmount: number | null | undefined,
  valueSatang: number,
): string | null {
  if (checkLines) {
    if (lines.length > MAX_EXTERNAL_LINES)
      return `จำนวนรายการมากเกินไป (สูงสุด ${MAX_EXTERNAL_LINES} รายการ · ได้รับ ${lines.length} รายการ)`;
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      const at = `รายการที่ ${i + 1}`;
      if (typeof l.qty !== "number" || !Number.isFinite(l.qty) || l.qty < 0)
        return `${at}: จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ได้รับ ${String(l.qty)})`;
      if (l.qty > MAX_QTY)
        return `${at}: จำนวนสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ${MAX_QTY_TEXT} · ได้รับ ${String(l.qty)})`;
      if (!isSatang(l.unitPrice) || l.unitPrice < 0)
        return `${at}: ราคาต่อหน่วยต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป (ได้รับ ${String(l.unitPrice)})`;
      if (l.unitPrice > MAX_SATANG)
        return `${at}: ราคาต่อหน่วยสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(l.unitPrice)})`;
      const disc = l.discount ?? 0;
      if (!isSatang(disc) || disc < 0)
        return `${at}: ส่วนลดต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป (ได้รับ ${String(l.discount)})`;
      if (disc > MAX_SATANG)
        return `${at}: ส่วนลดสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(disc)})`;
      const gross = Math.round(l.qty * l.unitPrice);
      if (gross > MAX_SATANG)
        return `${at}: ยอดของรายการสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(gross)})`;
      if (disc > gross)
        return `${at}: ส่วนลด ฿${baht(disc)} มากกว่ายอดของรายการ ฿${baht(gross)} — ตรวจส่วนลดของรายการนี้อีกครั้ง`;
      if (l.vatRateBp !== undefined && l.vatRateBp !== null) {
        const bp = l.vatRateBp;
        if (!isSatang(bp) || bp < -1 || bp > 10_000)
          return `${at}: อัตราภาษีต้องเป็นจำนวนเต็ม (0 = 0% · -1 = ยกเว้น · 700 = 7%) (ได้รับ ${String(bp)})`;
      }
    }
  } else {
    // ── เส้นทางเดิม (`valueSatang` → บรรทัดเดียว) ต้องถูกตรวจเหมือนกัน ──────────────────
    // 🔴 เดิมเส้นนี้ไม่ถูกตรวจเลย: `valueSatang: -150000` ทำให้แถวบรรทัดเก็บ `unitPrice = -150000`
    //    แต่ `amount = lineAmount = Math.max(0, -150000) = 0` (totals.ts:31-32) ⇒ subTotal/grandTotal = 0
    //    เอกสารพิมพ์ออกมาเป็น "บรรทัดติดลบบนใบที่ยอดรวมศูนย์" — ขัดกันเองแบบเดียวกับส่วนลดเกินยอดข้างบน
    //    ผู้เรียกที่มีอยู่วันนี้บังเอิญกัน `valueSatang <= 0` ไว้เอง (crm/service.ts:303) แต่ใบนี้ประกาศ
    //    ตัวเองเป็น "ประตูที่ตรวจให้" แล้ว และ C1.5 กำลังจะเพิ่มผู้เรียก ⇒ ตรวจที่นี่ ไม่ฝากความหวังไว้กับผู้เรียก
    if (!isSatang(valueSatang))
      return `มูลค่าดีลต้องเป็นจำนวนเต็มสตางค์ (ได้รับ ${String(valueSatang)})`;
    if (valueSatang < 0)
      return `มูลค่าดีลต้องเป็นศูนย์หรือมากกว่า (ได้รับ ฿${baht(valueSatang)})`;
    if (valueSatang > MAX_SATANG)
      return `มูลค่าดีลสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(valueSatang)})`;
  }
  // ยอดรวมฐานของทุกบรรทัด: `subTotal` ก็เป็น int4 ⇒ หลายบรรทัดที่แต่ละบรรทัดไม่เกินเพดาน รวมกันทะลุได้
  const baseSum = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  if (baseSum > MAX_SATANG)
    return `ยอดรวมรายการสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(baseSum)}) — แยกออกเป็นหลายใบ`;
  if (discountAmount !== undefined && discountAmount !== null) {
    if (!isSatang(discountAmount))
      return `ส่วนลดท้ายบิลต้องเป็นจำนวนเต็มสตางค์ (ได้รับ ${String(discountAmount)})`;
    if (discountAmount < 0)
      return `ส่วนลดท้ายบิลต้องเป็นศูนย์หรือมากกว่า (ได้รับ ฿${baht(discountAmount)})`;
    if (discountAmount > MAX_SATANG)
      return `ส่วนลดท้ายบิลสูงเกินกว่าที่ระบบเก็บได้ (สูงสุด ฿${baht(MAX_SATANG)} · ได้รับ ฿${baht(discountAmount)})`;
    if (discountAmount > baseSum)
      return `ส่วนลดท้ายบิล ฿${baht(discountAmount)} มากกว่ายอดรวมรายการ ฿${baht(baseSum)} — ตรวจยอดส่วนลดอีกครั้ง`;
  }
  return null;
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
  // WO 3.1 (MAP §F.5): CRM ส่ง partyId ของ CrmContact ต้นทางมาด้วย — ใช้เป็นกุญแจจับคู่ผู้ติดต่อฝั่งบัญชี
  // ตัวแรกก่อน taxId/phone/name+email (lookup แทนการเดาจากชื่อ/เบอร์) · sourceContactId เก็บไว้เผื่อ debug/audit
  partyId?: string | null;
  sourceContactId?: string | null;
  // ── CRM v2 · C0.3-A1 · additive ทั้งก้อน — ไม่ส่งสักตัว = เอกสาร/บรรทัดเหมือนเดิมทุกคอลัมน์ ──
  /** บรรทัดจริงของดีล (หลายบรรทัด · VAT/ส่วนลดต่อบรรทัด) — **มี `lines` เมื่อไหร่ ยอดคิดจาก `lines` เท่านั้น
   *  และ `valueSatang` ถูกละทิ้งทั้งตัว** (มติผู้คุมงาน C0.3 ข้อ 2 — ห้าม "เกลี่ย" สองตัวเลขให้ตรงกัน) */
  lines?: LineInput[];
  /** ส่วนลดท้ายบิล (สตางค์) — กระจายตามสัดส่วนฐานของแต่ละบรรทัดโดย `computeTotals` */
  discountAmount?: number | null;
  validUntil?: Date | null;
  note?: string | null;
  createdById?: string | null;
}): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  // 1) หา link → ระบบบัญชีปลายทาง (opt-in — ไม่เชื่อม = ไม่ออก)
  const link = await findAccountLinkFor(input.tenantId, input.sourceKind, input.sourceSystemId);
  if (!link) return { ok: false, reason: "ยังไม่เชื่อมระบบบัญชี" };
  const ctx = { tenantId: input.tenantId, systemId: link.systemId };

  // 2) idempotent: มีใบเสนอราคาอ้างดีลนี้แล้ว → คืนใบเดิม
  const existing = await findDocByRef(ctx.systemId, "QUOTATION", input.refType, input.refId);
  if (existing) return { ok: true, docId: existing.id, created: false };

  // 3) findOrCreate ผู้ติดต่อฝั่งบัญชี — partyId ก่อน (ถ้ามี) แล้วค่อยเทียบเบอร์/ชื่อ
  const contact = await findOrCreateCustomerContact(ctx, { ...input.customer, partyId: input.partyId ?? null });

  // 3.5) ตรวจของที่ผู้เรียกส่งมาใหม่ **ก่อนแตะเงิน** (ดูหมายเหตุที่ `externalQuotationProblem`)
  const lines: LineInput[] =
    input.lines && input.lines.length > 0
      ? input.lines.map((l) => ({ ...l, qty: roundQty4(l.qty) }))
      : [{ description: input.title, qty: 1, unitPrice: input.valueSatang }];
  const problem = externalQuotationProblem(
    lines,
    input.lines != null && input.lines.length > 0,
    input.discountAmount,
    input.valueSatang,
  );
  if (problem) return { ok: false, reason: problem };

  // 4) สร้างใบเสนอราคา (DRAFT — พนักงานตรวจ/ส่งเองในระบบบัญชี) + ผูก ref กลับดีล
  //    ไม่ส่ง `lines` = บรรทัดเดียวจาก title+valueSatang (เส้นทางเดิมเป๊ะ) · ส่ง `lines` = ยอดมาจากบรรทัด
  const doc = await createDocument({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    docType: "QUOTATION",
    contactId: contact.id,
    lines,
    // ทุกช่องด้านล่างเป็น optional ของ `createDocument` อยู่แล้ว — ไม่ส่งมา = undefined = ค่าเดิม (0/null)
    discountAmount: input.discountAmount ?? undefined,
    validUntil: input.validUntil ?? undefined,
    note: input.note ?? undefined,
    createdById: input.createdById ?? undefined,
  });
  await setDocExternalRef(doc.id, { refSystemId: input.sourceSystemId, refType: input.refType, refId: input.refId });
  return { ok: true, docId: doc.id, created: true };
}

// ═══════════════════════════════════════════════════════════════
// CRM v2 · ใบ C0.3 ส่วน A — สิ่งที่ CRM ต้องเรียกจากโมดูลบัญชี (ทั้งหมดเป็นของเพิ่ม)
//   · ตัวห่อ = บาง: ด่าน/ข้อความไทย/ธุรกรรม อยู่ที่ service เดิมทั้งหมด ไม่มีตรรกะซ้ำที่นี่
//   · ทุกตัวผูก `ctx {tenantId, systemId}` ⇒ id ของร้านอื่น = "ไม่พบเอกสาร" ไม่ใช่ข้อมูลรั่ว (X1)
// ═══════════════════════════════════════════════════════════════

export type AccountCtx = { tenantId: string; systemId: string };

/**
 * ใบเสนอราคา → ใบแจ้งหนี้ (ใบใหม่เป็น DRAFT · `sourceDocId` ชี้กลับใบเสนอราคา · relation CONVERT)
 * ต้นทางยังเป็นร่าง = ปฏิเสธพร้อมเหตุผลไทย (ด่านของ `convertDocument` — ห้ามข้าม)
 */
export async function convertQuotationToInvoice(
  ctx: AccountCtx,
  quotationDocId: string,
  opts: { createdById?: string | null } = {},
): Promise<{ ok: true; docId: string } | { ok: false; reason: string }> {
  const res = await convertDocument(ctx.tenantId, ctx.systemId, quotationDocId, "INVOICE", opts.createdById ?? null);
  return res.ok ? { ok: true, docId: res.newId } : res;
}

// CRM C1.5 ▸ ใบแจ้งหนี้จากดีล (เพิ่มอย่างเดียว · แบบเดียวกับ `createExternalQuotation` ทุกด่าน) — ผู้เรียก: `crm/deals.ts#issueInvoice`
//   ใช้เมื่อดีลยังไม่มีใบเสนอราคาที่ "ออกแล้ว" ให้แปลงต่อ (ร่างแปลงไม่ได้ — ด่านของ convertDocument) · idempotent ต่อ (refType, refId)
//   ใบใหม่เป็น DRAFT (พนักงานตรวจ/ออกเองในระบบบัญชี) · ไม่เชื่อมบัญชี = ไม่ออก · ตรวจบรรทัด/ส่วนลดด้วยตัวตรวจเดียวกัน
//   ⚠️ นอกไฟล์ที่ใบ C1.5 เป็นเจ้าของ — ผู้คุมงานตัดสิน (รายงานของ builder) · ใบ C2.7 (`createInvoiceFromLines`) รับช่วงต่อ
export async function createExternalInvoice(input: {
  tenantId: string;
  sourceSystemId: string;
  sourceKind: "CRM";
  refType: string;
  refId: string;
  title: string;
  valueSatang: number;
  customer: { name: string; phone?: string | null; email?: string | null };
  partyId?: string | null;
  sourceContactId?: string | null;
  lines?: LineInput[];
  discountAmount?: number | null;
  note?: string | null;
  createdById?: string | null;
}): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  const link = await findAccountLinkFor(input.tenantId, input.sourceKind, input.sourceSystemId);
  if (!link) return { ok: false, reason: "ยังไม่เชื่อมระบบบัญชี" };
  const ctx = { tenantId: input.tenantId, systemId: link.systemId };
  const existing = await findDocByRef(ctx.systemId, "INVOICE", input.refType, input.refId);
  if (existing) return { ok: true, docId: existing.id, created: false };
  const contact = await findOrCreateCustomerContact(ctx, { ...input.customer, partyId: input.partyId ?? null });
  const lines: LineInput[] =
    input.lines && input.lines.length > 0
      ? input.lines.map((l) => ({ ...l, qty: roundQty4(l.qty) }))
      : [{ description: input.title, qty: 1, unitPrice: input.valueSatang }];
  const problem = externalQuotationProblem(lines, input.lines != null && input.lines.length > 0, input.discountAmount, input.valueSatang);
  if (problem) return { ok: false, reason: problem };
  const doc = await createDocument({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    docType: "INVOICE",
    contactId: contact.id,
    lines,
    discountAmount: input.discountAmount ?? undefined,
    note: input.note ?? undefined,
    createdById: input.createdById ?? undefined,
  });
  await setDocExternalRef(doc.id, { refSystemId: input.sourceSystemId, refType: input.refType, refId: input.refId });
  return { ok: true, docId: doc.id, created: true };
}

/**
 * ใบแจ้งหนี้ที่ "แปลงมาจาก" ใบเสนอราคาใบนี้แล้ว (CONVERT · sourceDocId) และยังไม่ถูกยกเลิก — อ่านอย่างเดียว · ไม่พบ = null
 * ผู้เรียก: `crm/deals.ts#issueInvoice` (รีวิว C1.5 S9 — ใช้ใบเดิมแทนการออกซ้ำ) · ผูก ctx ⇒ เอกสารร้าน/สมุดอื่น = null
 */
export async function invoiceConvertedFrom(ctx: AccountCtx, quotationDocId: string): Promise<{ docId: string } | null> {
  if (!ctx.tenantId || !ctx.systemId || !quotationDocId) return null;
  const doc = await crmTenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId }).accountDocument.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "INVOICE", sourceDocId: quotationDocId, status: { notIn: ["VOIDED", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return doc ? { docId: doc.id } : null;
}
// ◂ CRM C1.5

/**
 * ลูกค้าตอบใบเสนอราคา (ตอบรับ/ปฏิเสธ) + **เก็บหลักฐานผู้เซ็นไว้ในแถว audit ของเอกสารใบนั้น**
 * ยังบังคับสถานะ `AWAITING_ACCEPT` เหมือนเดิม (ตัวห่อไม่มีสิทธิ์ข้ามด่านของ `setQuotationResponse`)
 * 🔴 PDPA (X8): หลักฐานที่เก็บมีแค่ ชื่อผู้เซ็น · ip ที่ hash แล้ว · user agent — ไม่มีเบอร์/อีเมล
 */
export async function respondQuotation(
  ctx: AccountCtx,
  docId: string,
  accepted: boolean,
  opts: {
    by: "STAFF" | "PORTAL";
    signer?: { name: string; ipHash: string; userAgent: string } | null;
    /** ผู้ใช้ที่กดฝั่งร้าน (by = STAFF) — ฝั่งพอร์ทัลลูกค้าไม่มี User ⇒ actorType = SYSTEM */
    actorUserId?: string | null;
    // CRM C3.5 ▸ เหตุผลที่ลูกค้าปฏิเสธ (เก็บ "ฝั่งร้าน" ในแถว audit ของเอกสารเท่านั้น — ไม่เคยอยู่ใน payload ของ event · X8) ·
    //   event เพิ่มเติมของผู้เรียกที่ต้องเกิดเฉพาะกับคำตอบที่ชนะ (ส่งต่อให้ `setQuotationResponse.alsoEmit`) ◂
    reason?: string | null;
    alsoEmit?: { type: string; idempotencyKey: string; payload: unknown; systemId?: string | null }[];
    /** CRM C3.5 ▸ (มติผู้คุมงาน S4) id ของสิทธิ์พอร์ทัล/ผู้ติดต่อที่ตอบ — ลง audit ของเอกสาร (id ล้วน) ◂ */
    portal?: { accessId: string; contactId: string } | null;
  } = { by: "STAFF" },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 🔴 หลักฐานเขียน **ในธุรกรรมเดียวกับการเปลี่ยนสถานะ** (ดูหมายเหตุที่ `setQuotationResponse`):
  //    ถ้าเขียนทีหลังผ่าน `writeAudit` (ซึ่งกลืน error ทุกชนิดโดยตั้งใจ) ใบที่ลูกค้ากดตอบรับจากพอร์ทัล
  //    อาจจบเป็น ACCEPTED โดยไม่มีบันทึกว่าใครเซ็น จาก ip ไหน ด้วยเบราว์เซอร์อะไร
  //    …แต่ "ย้อนกลับทั้งใบ" ต้องออกมาเป็น `{ok:false, reason}` ภาษาไทย **ไม่ใช่ exception**:
  //    ผู้เรียกคือหน้า/route ของพอร์ทัลลูกค้า ถ้าปล่อยให้หลุด ลูกค้าจะเจอหน้า 500 แทนข้อความที่บอกให้ลองใหม่
  //    (`safeReason` กันข้อความเทคนิคของ Prisma หลุดไปโชว์ลูกค้า — ข้อความไทยที่เราเขียนเองผ่านได้ตามเดิม)
  try {
    return await setQuotationResponse(ctx.tenantId, ctx.systemId, docId, accepted, {
      audit: {
        actorType: opts.by === "PORTAL" ? "SYSTEM" : "USER",
        actorId: opts.by === "PORTAL" ? null : opts.actorUserId ?? null,
        action: accepted ? "account.quotation.accept" : "account.quotation.reject",
        after: {
          accepted,
          by: opts.by,
          signer: opts.signer
            ? { name: opts.signer.name, ipHash: opts.signer.ipHash, userAgent: opts.signer.userAgent }
            : null,
          // CRM C3.5 ▸ มีเฉพาะเมื่อผู้เรียกส่งมา (ผู้เรียกเดิมได้แถว audit รูปเดิมเป๊ะ) ◂
          ...(opts.reason ? { reason: String(opts.reason).slice(0, 500) } : {}),
          ...(opts.portal ? { accessId: opts.portal.accessId, contactId: opts.portal.contactId } : {}),
        },
      },
      ...(opts.alsoEmit?.length ? { alsoEmit: opts.alsoEmit } : {}),
    });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกคำตอบใบเสนอราคาไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ลิงก์+QR เก็บเงินของเอกสาร 1 ใบ (ยอด = ยอดคงค้างจริง ณ ตอนนี้ · ด่านชนิด/สถานะ/ช่องทางอยู่ใน service)
export { createPaymentRequest as createPaymentRequestForDoc, type CreatePaymentRequestResult } from "./payment-request";

// ยอดค้างรับต่อผู้ติดต่อ (1 query ครอบทุกราย) · ข้อมูลเชื่อมโยงของเอกสาร (event บัญชีส่งมาแค่ documentId)
// · "หนึ่ง Party = หนึ่งผู้ติดต่อต่อสมุด" (idempotent + กันยิงพร้อมกันที่ฐานข้อมูล — X3)
// CRM C2.7 ▸ `listDocPayments` = การรับ/จ่ายชำระของเอกสาร 1 ใบ (อ่านล้วน · ของเดิมใน service.ts ไม่แตะ)
//   ทำไมต้องเปิดผ่าน facade: ทางเดินเงินของ CRM ต้องรู้ว่า "แถวเงินของดีลแถวไหนเป็นของเอกสารใบที่ถูกยกเลิก"
//   (มติผู้คุมงาน C2.7 รอบ 2 · SF-1) — ยกเลิกใบแจ้งหนี้ต้องไม่ไปถอนเงินมัดจำของอีกใบ · CRM อ่านตารางบัญชีเองไม่ได้
export {
  outstandingByContacts,
  docLinkInfo,
  listDocPayments,
  ensureAccountContact,
  type DocLinkInfo,
  type DocPaymentRow,
  type EnsureAccountContactInput,
} from "./service";

// CRM C2.7-fix ▸ (รอบ 3–4 · N9) สมุดการรับชำระของเอกสาร 1 ใบแบบผอม (อ่านล้วน · รวมยอดใน SQL · รับ tx ของผู้เรียกได้)
//   ทางเดินเงินของ CRM ตัดสิน "ยกเลิกแล้ว/ครบแล้ว/ส่วนต่าง WHT" ในธุรกรรมที่ถือล็อกเงิน — ของเดิมใน service.ts ไม่แตะ ◂
export { docPaymentLedger, type DocPaymentLedger } from "./service";

// รวมผู้ติดต่อซ้ำ (ใช้ตอน CRM รวมบริษัท/ผู้ติดต่อแล้วต้องรวมฝั่งบัญชีตาม) — ธุรกรรมเดียว ครบทุกตาราง
export { mergeContacts, type MergeContactsInput, type MergeResult } from "./contact-merge";
// CRM C3.3 ▸ ฐานคอมมิชชันก่อน VAT ของเอกสาร (subTotal − discountAmount · อ่านล้วน) — ผู้เรียก: crm/commissions.ts (เส้น crm→account เดิม) ◂
export { docNetBeforeVat, commissionDocRatios } from "./service";

// Payroll posting (WO-0036) — จุดเดียวที่ hr เรียกลงบัญชีเงินเดือน
// reverseEntry (WO Wave2-K) — hr เรียกกลับ JV เงินเดือนตาม journalEntryId (immutable ledger)
export { postPayrollJV, reverseEntry, type PayrollPostingInput } from "./gl";

// Perpetual inventory (WO Inventory→Account) — จุดเดียวที่ inventory เรียกลงบัญชีต้นทุนสต็อก
// (idempotent ต่อ movementId · Dr=Cr เสมอ · ไม่มีระบบ ACCOUNT → inventory ข้ามก่อนถึงที่นี่)
export { postInventoryGl, type GlCtx } from "./gl";

// รายงานอายุหนี้ (WO-0039) — ลูกหนี้/เจ้าหนี้ค้างชำระ (UI/รายงานเรียกผ่าน facade)
export {
  agingReport,
  type AgingReport,
  type AgingRow,
  type AgingGrand,
} from "./reports";

// ปิดงวดบัญชีอัตโนมัติ (WO-0039) — cron ระดับแพลตฟอร์มเรียก
export { sweepAutoClosePeriods } from "./period-sweep";

// ─────────────────────────────────────────────────────────────
// WO 5.5 — เก็บเงินผ่านลิงก์+QR PromptPay
//   · หน้าสาธารณะ `/pay/<token>` เรียก `getPublicPaymentPage` (ไม่มี auth — token คือ capability)
//   · webhook ของ Beam เรียก `handleAccountCharge` (จุดเดียวที่เงินเข้าจากภายนอกโมดูล)
//   · cron เรียก `expirePaymentRequests`
// ─────────────────────────────────────────────────────────────
export {
  getPublicPaymentPage,
  expireRequests as expirePaymentRequests,
  type PublicPaymentPage,
} from "./payment-request";

/**
 * ปลายทางของ webhook Beam เมื่อ referenceId ขึ้นต้นด้วย "acc:" — แปลงสถานะของผู้ให้บริการเป็นการกระทำ
 * จ่ายสำเร็จ → บันทึกรับชำระ + JV + จับคู่ statement · สถานะอื่น → แตะแค่สถานะคำขอ (ไม่ยุ่งกับเงิน)
 * 🔴 ไม่คืนข้อมูลลูกค้าใด ๆ กลับไปให้ route (route เอาไป log ได้อย่างปลอดภัย)
 */
export async function handleAccountCharge(input: {
  referenceId: string;
  chargeId: string;
  paidSatang: number;
  status: string;
}): Promise<{ ok: true; handled: "paid" | "closed" | "ignored" } | { ok: false; reason: string }> {
  const status = String(input.status ?? "").toUpperCase();
  if (["SUCCEEDED", "SUCCESS", "PAID", "COMPLETED"].includes(status)) {
    if (!input.chargeId) return { ok: false, reason: "ไม่มีเลขที่รายการชำระเงิน" };
    const res = await handleBeamPaid({
      referenceId: input.referenceId,
      chargeId: input.chargeId,
      paidSatang: input.paidSatang,
    });
    return res.ok ? { ok: true, handled: "paid" } : { ok: false, reason: res.reason };
  }
  if (["FAILED", "FAILURE", "EXPIRED", "CANCELLED", "CANCELED"].includes(status)) {
    const next = status === "EXPIRED" ? "EXPIRED" : status.startsWith("CANCEL") ? "CANCELLED" : "FAILED";
    const res = await handleBeamFailed({ referenceId: input.referenceId, status: next });
    return res.ok ? { ok: true, handled: "closed" } : { ok: false, reason: res.reason };
  }
  // PENDING/PROCESSING/สถานะที่ไม่รู้จัก — รับทราบเฉย ๆ (ห้ามเดาว่าจ่ายแล้ว)
  return { ok: true, handled: "ignored" };
}

// ประวัติการแก้ไข (WO Wave6-B) — writeAudit เปิดให้โมดูลอื่น (เช่น hr payroll) เขียน log
// ผ่าน facade เดียว + service อ่าน/ป้ายไทยสำหรับหน้า "ประวัติการแก้ไข"
export {
  writeAudit,
  listAuditLogs,
  listAuditActions,
  auditActionLabelTh,
  type AuditLogRow,
  type AuditLogPage,
  type ListAuditLogsInput,
} from "./access";

// ─────────────────────────────────────────────────────────────
// บันทึกค่าใช้จ่าย/ใบเสร็จเข้าบัญชี (facade — ผู้ช่วย AI เรียกผ่านที่นี่, feedback เจ้าของ #4)
// caller ส่งแค่ ยอด/ผู้ขาย/บันทึก — ไม่ต้องรู้เลขบัญชี/VAT · สร้างเป็น DRAFT (docType EXPENSE)
// user ตรวจแล้วออกเอกสารจริงในระบบบัญชีเอง (ยังไม่โพสต์ GL ที่นี่)
// ─────────────────────────────────────────────────────────────
export async function createExpenseDoc(input: {
  tenantId: string;
  systemId: string;
  vendor?: string | null;
  note: string;
  amountSatang: number;
  date?: string;
  createdById?: string | null;
}): Promise<{ docId: string; grandTotal: number }> {
  const parsed = input.date ? new Date(input.date) : new Date();
  const issueDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const vendor = input.vendor?.trim() ?? "";
  const note = input.note?.trim() ?? "";
  const description = note || vendor || "ค่าใช้จ่าย";
  const noteText = vendor ? `ผู้ขาย: ${vendor}${note ? ` — ${note}` : ""}` : note || null;
  const doc = await createExpenseDocRaw({
    tenantId: input.tenantId,
    systemId: input.systemId,
    docType: "EXPENSE",
    issueDate,
    note: noteText,
    lines: [{ description, qty: 1, unitPrice: Math.round(input.amountSatang) }],
    createdById: input.createdById ?? null,
  });
  return { docId: doc.id, grandTotal: doc.grandTotal };
}

// CRM C1.3 ▸ ระบบบัญชีของระบบ CRM (มติผู้คุมงาน C1.3 ข้อ 2) — **อ่านอย่างเดียว** ฟังก์ชันเดียว
//   = `AccountSystemLink{ linkedKind: "CRM", linkedId: crmSystemId, enabled, !archived }` ของร้านนี้ (null = ไม่ได้เชื่อม)
//   ตัวเลือกเสริม (อ่านในสมุดเล่มนั้นเท่านั้น · ไม่ใช่ของร้าน/สมุดอื่น):
//     • `partyId`    → ผู้ติดต่อฝั่งบัญชีที่ยังใช้งานของตัวตนนั้น (ตามสาย mergedIntoId ของ Party ก่อน) — ใช้ผูก accountContactId ตอนสร้างบริษัท
//     • `contactIds` → ข้อมูลย่อของผู้ติดต่อที่ขอ (ยังใช้งาน · ไม่ถูกรวม) — ใช้ตอน "นำเข้าจากบัญชี"
//   ผู้เรียก: `crm/companies.ts` (ผ่าน facade นี้เท่านั้น — ไม่มีโมดูลอื่นอ่านตาราง AccountSystemLink/AccountContact ตรง)
export type CrmAccountContactBrief = {
  id: string;
  name: string;
  taxId: string | null;
  branchCode: string | null;
  legalType: "PERSON" | "COMPANY";
  partyId: string | null;
  phone: string | null;
  email: string | null;
};
export async function accountSystemForCrm(
  tenantId: string,
  crmSystemId: string,
  opts: { partyId?: string | null; contactIds?: readonly string[]; bookId?: string | null } = {},
): Promise<{ systemId: string; contactOfParty: string | null; contacts: CrmAccountContactBrief[] } | null> {
  if (!tenantId || !crmSystemId) return null;
  let link: { systemId: string; createdAt: Date } | null = null;
  // CRM C3.6 ▸ `opts.bookId` = สมุดที่ CRM เลือกเป็นปลายทาง (`settings.crm.targets.accountSystemId` ผ่านตัวตัดสินของ CRM)
  //   ⇒ ใช้เล่มนั้นเมื่อ **ยังมี AccountSystemLink CRM ที่เปิดอยู่กับระบบ CRM นี้** (ด่าน §9.5 — ไม่เชื่อม = ไม่เขียนสมุด) ·
  //   AUDIT-CLASS X1: ต้องเป็นสมุด ACCOUNT ที่ active ของร้านนี้ · ไม่ผ่านข้อใด = null ◂
  const wantBook = typeof opts.bookId === "string" ? opts.bookId.trim() : "";
  if (wantBook) {
    const b = await crmTenantDb({ tenantId }).appSystem.findFirst({ where: { id: wantBook, tenantId, type: "ACCOUNT", active: true }, select: { id: true } });
    if (!b) return null;
    const l = await crmTenantDb({ tenantId, systemId: b.id }).accountSystemLink.findFirst({
      where: { tenantId, systemId: b.id, linkedKind: "CRM", linkedId: crmSystemId, enabled: true, archivedAt: null },
      select: { systemId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (!l) return null;
    link = l;
  } else {
    // สมุดที่ยังใช้งาน (AppSystem.active) ของร้านนี้ เรียงเก่า → ใหม่ แล้วหาลิงก์ CRM ที่เปิดอยู่ · หลายเล่มผูกระบบ CRM เดียวกันได้
    //   ⇒ เลือกลิงก์ที่สร้างก่อนสุด (ผลคงที่ทุกครั้ง ไม่ขึ้นกับลำดับที่ฐานคืนมา) · tenantDb ต่อเล่ม (AccountSystemLink = sys scope)
    const books = await crmTenantDb({ tenantId }).appSystem.findMany({
      where: { tenantId, type: "ACCOUNT", active: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    for (const b of books) {
      const l = await crmTenantDb({ tenantId, systemId: b.id }).accountSystemLink.findFirst({
        where: { tenantId, systemId: b.id, linkedKind: "CRM", linkedId: crmSystemId, enabled: true, archivedAt: null },
        select: { systemId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      if (l && (!link || l.createdAt < link.createdAt)) link = l;
    }
  } // ◂ CRM C3.6
  if (!link) return null;
  const db = crmTenantDb({ tenantId, systemId: link.systemId });
  let contactOfParty: string | null = null;
  const asked = (opts.partyId ?? "").trim();
  if (asked) {
    const partyId = await crmPartyFacade.resolveCanonical(tenantId, asked);
    const hit = await db.accountContact.findFirst({
      where: { tenantId, systemId: link.systemId, partyId, archivedAt: null, mergedIntoId: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    contactOfParty = hit?.id ?? null;
  }
  const ids = [...new Set((opts.contactIds ?? []).filter((x) => typeof x === "string" && x))].slice(0, 1_000);
  const contacts = ids.length
    ? await db.accountContact.findMany({
        where: { tenantId, systemId: link.systemId, id: { in: ids }, archivedAt: null, mergedIntoId: null },
        select: { id: true, name: true, taxId: true, branchCode: true, legalType: true, partyId: true, phone: true, email: true },
      })
    : [];
  return { systemId: link.systemId, contactOfParty, contacts };
}
// ◂ CRM C1.3

// CRM C3.6 ▸ สมุดบัญชีที่ "เชื่อมกับระบบ CRM นี้" (AccountSystemLink CRM ที่เปิดอยู่ · ไม่เก็บถาวร · สมุด active) เรียงตามลิงก์เก่า → ใหม่
//   = ตัวเลือกเดียวที่ CRM ตั้งเป็นปลายทางบัญชีได้ (ปลายทางต้องไม่ข้ามด่าน §9.5 "ไม่เชื่อม = ไม่ลงบัญชีให้") · อ่านอย่างเดียว
//   + `accountContactsInOtherBooks` — จำนวนผู้ติดต่อบัญชี (จาก id ที่ CRM ถืออยู่) ที่อยู่ในสมุดเล่มอื่นที่ไม่ใช่ `bookId`
//     (CRM ใช้ปฏิเสธการสลับสมุดเมื่อบริษัทผูกผู้ติดต่อของเล่มเดิมไว้แล้ว) · AUDIT-CLASS X1: ผูก tenantId ทุกคำสั่ง
/** ช่องทางอ่านที่รับ tx ของผู้เรียกได้ (CRM ตรวจการสลับสมุดใต้ล็อกแถวของตัวเอง) — ไม่ส่ง = client ที่ผูกร้าน */
type CrmReadDb = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function crmLinkedBooks(tenantId: string, crmSystemId: string, db?: CrmReadDb): Promise<string[]> {
  if (!tenantId || !crmSystemId) return [];
  // คำสั่งเดียวสำหรับทุกเล่ม (ไม่วนทีละสมุด) · เรียงลิงก์เก่า → ใหม่ แล้ว id (ผลคงที่) · ลิงก์ละหนึ่งแถวต่อเล่ม (unique systemId+kind+linkedId)
  const q = db ?? crmTenantDb({ tenantId });
  const rows = await q.$queryRaw<{ id: string }[]>`
    SELECT l."systemId" AS "id"
    FROM "AccountSystemLink" l JOIN "AppSystem" s ON s."id" = l."systemId"
    WHERE l."tenantId" = ${tenantId} AND s."tenantId" = ${tenantId} AND s."type" = 'ACCOUNT' AND s."active" = true
      AND l."linkedKind" = 'CRM' AND l."linkedId" = ${crmSystemId} AND l."enabled" = true AND l."archivedAt" IS NULL
    ORDER BY l."createdAt" ASC, l."id" ASC
    LIMIT 50`;
  return rows.map((r) => r.id);
}

export async function accountContactsInOtherBooks(tenantId: string, bookId: string, contactIds: readonly string[], db?: CrmReadDb): Promise<number> {
  const ids = [...new Set(contactIds.filter((x) => typeof x === "string" && x))].slice(0, 10_000);
  if (!tenantId || ids.length === 0) return 0;
  const q = db ?? crmTenantDb({ tenantId });
  const r = await q.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "AccountContact"
    WHERE "tenantId" = ${tenantId} AND "systemId" <> ${bookId} AND "id" = ANY(${ids}::text[])`;
  return Number(r[0]?.n ?? 0);
}
// ◂ CRM C3.6

// CRM C3.5 ▸ พอร์ทัลลูกค้าองค์กร (`crm/portal.ts`) — ทางอ่าน/เขียนของบัญชีที่พอร์ทัลใช้ **ผ่าน facade นี้ทางเดียว** (F2.2)
//   • listPortalDocs      — เอกสารขาออก (ไม่รวม DRAFT) ของ "บริษัทลูกค้า" = ผู้ติดต่อบัญชีที่ผูก Party เดียวกับบริษัท (ทุกสมุดของร้าน)
//                           ช่องครบที่พอร์ทัลต้องใช้ (validUntil · dueDate · paidTotal) — `listDocsByParty` ของ M3.7 ไม่มีช่องพวกนี้และรวม DRAFT
//   • firstReceiveFinanceId — ช่องทางรับเงินแรกของสมุด (ใช้ตัดสินลิงก์ `/pay/<token>` ผ่าน `createPaymentRequestForDoc` เดิม — ไม่มีทางเงินใหม่)
//   • attachPrivateFileToDoc — สลิปจากพอร์ทัลเข้า "คลังไฟล์แนบของเอกสาร" เดิม (AccountAttachment LINKED) โดย `fileUrl` เป็นค่าหมาย
//                           `private://…` ของไฟล์ส่วนตัว (C0.4) — ไม่ใช่ URL ที่เปิดได้ · `createAttachment` เดิมรับเฉพาะ http(s) จึงแยกทาง
//   AUDIT-CLASS X1: ทุกตัวกรอง tenantId (+ Party / id เอกสาร) · เอกสารของร้านอื่น/Party อื่น = ไม่พบ (ว่าง/null)
export type PortalDocRow = {
  id: string;
  systemId: string;
  docType: AccountDocType;
  docNo: string | null;
  status: string;
  issueDate: Date;
  validUntil: Date | null;
  dueDate: Date | null;
  grandTotal: number;
  paidTotal: number;
  createdAt: Date;
};

export async function listPortalDocs(
  tenantId: string,
  partyId: string,
  opts: { docTypes: readonly AccountDocType[]; id?: string | null; take?: number },
): Promise<PortalDocRow[]> {
  if (!tenantId || !partyId || opts.docTypes.length === 0) return [];
  const take = Math.min(Math.max(1, Math.trunc(opts.take ?? 200)), 500);
  // ทุกสมุดของร้าน (แบบเดียวกับ `listDocsByParty`) — tenantDb ต่อเล่ม เพราะ AccountDocument เป็น sys scope
  const books = await crmTenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "ACCOUNT" }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const out: PortalDocRow[] = [];
  for (const b of books) {
    const rows = await crmTenantDb({ tenantId, systemId: b.id }).accountDocument.findMany({
      where: {
        tenantId,
        systemId: b.id,
        direction: "OUT",
        docType: { in: [...opts.docTypes] },
        status: { notIn: ["DRAFT"] },
        contact: { partyId, tenantId },
        ...(opts.id ? { id: opts.id } : {}),
      },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take,
      select: { id: true, systemId: true, docType: true, docNo: true, status: true, issueDate: true, validUntil: true, dueDate: true, grandTotal: true, paidTotal: true, createdAt: true },
    });
    for (const r of rows) out.push({ ...r, status: String(r.status) });
  }
  return out.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime() || (a.id < b.id ? 1 : -1)).slice(0, take);
}

export async function firstReceiveFinanceId(ctx: AccountCtx): Promise<string | null> {
  if (!ctx.tenantId || !ctx.systemId) return null;
  const row = await crmTenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId }).accountFinance.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, useForReceive: true, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function attachPrivateFileToDoc(
  ctx: AccountCtx,
  documentId: string,
  file: { fileAssetId: string; fileName: string; mimeType: string; sizeBytes: number },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = crmTenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const doc = await db.accountDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, docType: true } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  const asset = await crmTenantDb({ tenantId: ctx.tenantId }).fileAsset.findFirst({ where: { id: file.fileAssetId, tenantId: ctx.tenantId }, select: { id: true, cdnUrl: true } });
  if (!asset || !asset.cdnUrl.startsWith("private://")) return { ok: false, reason: "ไม่พบไฟล์ที่อัปโหลด — ลองอัปโหลดใหม่อีกครั้ง" };
  const row = await db.accountAttachment.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      documentId: doc.id,
      // eslint-disable-next-line no-control-regex
      fileName: String(file.fileName ?? "").replace(/[\\/]+/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "slip",
      fileUrl: asset.cdnUrl,
      mimeType: file.mimeType,
      sizeBytes: Math.max(0, Math.round(file.sizeBytes || 0)),
      docTypeHint: doc.docType,
      status: "LINKED",
      source: "UPLOAD",
      folder: "สลิปจากพอร์ทัลลูกค้า",
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}
// ◂ CRM C3.5

// POS P1.18 ▸ R8 (CD2): สวิตช์ "ลงบัญชีบิลของ POS นี้" จากหน้าตั้งค่า POS — การ์ด ACCOUNT การ์ดเดียวที่ POS สลับได้ ·
//   ห่อ connect/disconnect ของ ./connections ตรง ๆ (soft: แถว · ตัวเลือก · บัญชีที่ผูกอยู่ครบ — แค่หยุด/เริ่มลงบัญชี) ·
//   ctx = ระบบบัญชีที่ผูก POS นี้ (ผู้เรียกหาแถว AccountSystemLink เอง) · สิทธิ์/ยืนยัน/audit ตรวจที่ผู้เรียก (composition root src/lib/pos-integrations.ts) ·
//   แก้รอบ 1 F7: POS ผูกได้หลายระบบบัญชี ⇒ ผู้เรียกวนทุกแถวใน transaction เดียวแล้วส่ง tx มา (connect/disconnect ใส่ขอบเขตร้าน+ระบบเอง)
import { connect as connectPosLink, disconnect as disconnectPosLink } from "./connections";
export async function setPosLinkEnabled(
  ctx: AccountCtx,
  posSystemId: string,
  enabled: boolean,
  actorUserId: string | null,
  tx?: Prisma.TransactionClient,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return enabled ? connectPosLink(ctx, "POS", posSystemId, actorUserId, tx) : disconnectPosLink(ctx, "POS", posSystemId, actorUserId, tx);
}
// ◂ POS P1.18
