// account/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// เงินทุกบาทจากระบบภายนอก (POS) เข้าบัญชีผ่านที่นี่ — โมดูลอื่นไม่รู้เลขบัญชี/gl เลย
// WO-0002 (contract 2.4): applyExternalSale (ขายสด) + reverseExternalSale (void)
//
// 🔴 ห้าม import raw prisma ที่นี่ (F5 baseline freeze) — query ผ่าน service.ts / gl.ts เท่านั้น

import { handleBeamPaid, handleBeamFailed } from "./payment-request";
import {
  createDocument,
  findAccountLinkFor,
  findAccountLinkForPos,
  findDocByRef,
  findOrCreateCustomerContact,
  resolveProductIdsForExternalSale,
  setDocExternalRef,
  upsertExternalSaleDocument,
  vatConfigOf,
  voidExternalSaleDocument,
  type ExternalSaleDocLine,
} from "./service";

// ราคาขายสินค้า POS (master data — ไม่กระทบ GL) เปิดผ่าน facade ให้โมดูล pos เรียก
export {
  updateAccountProductSalePrice,
  createAccountProductWithSalePrice,
} from "./service";

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
import { postExternalSale, reverseFor, type GlCtx } from "./gl";
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
  payMethods: { channel: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE"; amountSatang: number }[];
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
}): Promise<{ posted: boolean; reason?: string; docId?: string }> {
  const link = await findAccountLinkForPos(input.tenantId, input.sourceSystemId);
  if (!link) return { posted: false, reason: "unlinked" };

  const ctx: GlCtx = { tenantId: input.tenantId, systemId: link.systemId };
  const { vatRegistered, vatRateBp } = await vatConfigOf(link.systemId);

  const gross = input.grossSatang;
  const base = vatRegistered ? Math.round(gross / (1 + vatRateBp / 10000)) : gross;
  const vat = gross - base;

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
  const channelToKey = (
    ch: "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE",
  ): "CASH" | "BANK" | "DEPOSIT_RECEIVED" | "AR" => {
    switch (ch) {
      case "CASH":
        return "CASH";
      case "DEPOSIT":
        return "DEPOSIT_RECEIVED";
      case "ROOM_CHARGE":
        return "AR";
      default:
        return "BANK";
    }
  };
  const drLines = input.payMethods.map((p) => ({
    key: channelToKey(p.channel),
    amountSatang: p.amountSatang,
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
  if (!lines || lines.length === 0) return { posted };

  const contactId = await resolveExternalSaleContact(ctx, input.customer);
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
  });
  if (!doc.ok) return { posted, reason: doc.reason };
  // WO 4.3 (§8.2): บิล POS ที่ขาย "รายการจัดชุด" → ตัดสต็อกส่วนประกอบ
  //   ตัดเฉพาะตอนเอกสารถูก "สร้างใหม่" (created) — ยิงซ้ำด้วย refId เดิม upsert คืนใบเดิม ⇒ ไม่ตัดซ้ำ
  //   (ตัวที่ผูกคลังยังมีคีย์ idempotent ต่อบรรทัดซ้อนอีกชั้น)
  if (doc.created) await consumeBundleComponentsForDoc(ctx, doc.docId);
  return { posted, docId: doc.docId };
}

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
