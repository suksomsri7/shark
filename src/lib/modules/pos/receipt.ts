// receipt.ts — ข้อมูลใบเสร็จของบิล POS (P1.10 · มติ R5 + CD3–CD5) = สัญญาเนื้อหาที่ตัวเรนเดอร์ (receipt-render.ts) พิมพ์ตาม
// สัญญา = scripts/qc-pos-p1.10.mts (P1–P6 · A3 · RS2) · ภาพ ledger/design-pos/11-customer-display.png แผง B
//
// 🔴 อ่านอย่างเดียว — ไม่เขียนบิล ไม่มี event (R8) · copy:true = AuditLog "pos.receipt.reprint" 1 แถวต่อการเรียก (T8) · ปฏิเสธ = ไม่มี audit
//    ยกเว้น P1.11 (มติผู้คุมงาน 4): บิลเก่าที่ยังไม่มี publicToken + qrEReceipt เปิด = เขียนโทเคนครั้งเดียว (ensureReceiptToken · UPDATE เดียว · ไม่มี event)
// 🔴 สิทธิ์ pos.sale.read (มติ CD3 — ผู้มี pos.sale.create ได้โดยนัย) · บิลต้องอยู่ในขอบเขตสาขาของผู้เรียก (posSaleWhere) ·
//    บิลของสาขา/ระบบ/ร้านอื่น หรือ id มั่ว = SALE_NOT_FOUND (ไม่บอกว่ามีอยู่)
// 🔴 kind = TAX_INVOICE_ABB เฉพาะเมื่อสมุดบัญชีที่ผูก POS จด VAT + เปิดใบกำกับอย่างย่อจาก POS + มีเลขผู้เสียภาษี (T2) + บิลมี VAT จริง
//    (sale.vatSatang > 0 · แก้รอบ 1 F1 — บิลก่อนจด VAT / สินค้ายกเว้น VAT ห้ามออกเป็นใบกำกับ) · อื่น = RECEIPT · vatRateBp = อัตราของสมุด
//    เฉพาะบิลที่มี VAT · อื่น = 0
// 🔴 status = PosSale.status (PAID · VOIDED · REFUNDED — แก้รอบ 1 F2) · VOIDED = renderer ประทับ "ยกเลิก / VOID" · สถานะอื่น = SALE_NOT_FOUND
// 🔴 ต้นฉบับ (copy:false) ออกได้เฉพาะภายใน 30 นาทีนับจาก sale.createdAt (แก้รอบ 1 F3) · เกินนั้น = ยกเป็นสำเนาเงียบ ๆ
//    (copy:true + "สำเนา" + AuditLog pos.receipt.reprint) — ไม่ปฏิเสธ · ทั้งสอง action ได้กฎนี้เพราะอยู่ในบริการ
//    ข้อมูลหัวใบ: ค่าตั้งใบเสร็จ (settings.pos.receipt.header) ก่อน · ว่าง = โปรไฟล์ของสมุด (orgName · address · phone · logoUrl) ·
//    เลขผู้เสียภาษี/สาขา มาจากสมุดเสมอ (ไม่ใช่ค่าตั้ง)
// 🔴 เงินทุกตัวเป็นสตางค์จำนวนเต็มจากแถว DB — subtotal − ส่วนลดรายการ − ส่วนลดท้ายบิล − คูปอง − ส่วนลดระดับ + ค่าบริการ = ยอดสุทธิ ·
//    ฐานภาษี + VAT = ยอดสุทธิ (VAT ที่เก็บบนบิล · P1.6 splitIncludedVat) · ทิปอยู่นอกยอด (Σ จ่าย = ยอด + ทิป)
import type { Prisma, PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
// POS P1.11 ▸ R3: QR ใบเสร็จออนไลน์ = โดเมนของคำขอ (core/origin · ไม่ใช้ APP_URL ตรง) + โทเคนของบิล (สร้างแบบขี้เกียจให้บิลเก่า · มติ 4) ◂
import { publicOrigin } from "@/lib/core/origin";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import * as account from "@/lib/modules/account";
import { posSaleWhere, type PosUnitScope } from "./access";
import { prisma } from "./db";
import { RECEIPT_LABELS, type ReceiptDocType, type ReceiptKind, type ReceiptPayload, type ReceiptSaleStatus } from "./receipt-render";
import { receiptSettingsOf } from "./receipt-settings";
// POS P1.16 ▸ R2: กติกาชนิดใบเสร็จตัวเดียวกับหน้าบิลวันนี้ (billDetail.receiptKind) ◂
import { receiptKindOf } from "./receipt-shared";
import { ensureReceiptToken } from "./receipt-token";
import type { RegisterActor } from "./register-shared";

// ── POS P1.12 ▸ R9 R15: สำเนาสมาชิก/สิทธิ์บนบิล (อ่านอย่างปลอดภัยจาก Json · ผิดรูป = ไม่มี) — ใบเสร็จ · หน้าบิล · ใบเสร็จออนไลน์ใช้ชุดเดียว ◂
export type SaleMemberSnapshot = { name: string | null; memberCode: string | null; phoneMasked: string | null; tierKey: string | null; tierName: string | null };
export type SaleMemberBenefitLine = { kind: string; label: string; discountSatang: number };
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
export function saleMemberSnapshot(v: unknown): SaleMemberSnapshot | null {
  if (!isRecord(v)) return null;
  return { name: strOrNull(v.name), memberCode: strOrNull(v.memberCode), phoneMasked: strOrNull(v.phoneMasked), tierKey: strOrNull(v.tierKey), tierName: strOrNull(v.tierName) };
}
/** บรรทัดสิทธิ์ของบิล (ไม่รวมคูปอง) · null = บิลไม่มีสำเนาสิทธิ์ (walk-in / ก่อน P1.12) */
export function saleMemberBenefits(v: unknown): SaleMemberBenefitLine[] | null {
  if (!isRecord(v) || !Array.isArray(v.lines)) return null;
  return (v.lines as unknown[]).flatMap((l) =>
    isRecord(l) && typeof l.kind === "string" && typeof l.discountSatang === "number" && Number.isInteger(l.discountSatang)
      ? [{ kind: l.kind, label: typeof l.label === "string" ? l.label : l.kind, discountSatang: l.discountSatang }]
      : [],
  );
}
/**
 * ยอดแต้มสด "ของระบบแต้มที่ผูกสาขาของบิล" (แก้บั๊ก: เดิมอ่าน PointBalance ใดก็ได้ที่อัปเดตล่าสุด) — ผ่าน facade สมาชิกเท่านั้น (มติ 6) ·
 * สาขาไม่มีระบบแต้ม / ลูกค้าไม่อยู่ในระบบสมาชิก = null
 */
export async function salePointBalance(tenantId: string, unitId: string, customer: { id: string; memberSystemId: string | null }): Promise<number | null> {
  if (!customer.memberSystemId) return null;
  const member = await import("@/lib/modules/member");
  const r = await member.pointBalanceForUnit({ tenantId, systemId: customer.memberSystemId, actorUserId: null }, { customerId: customer.id, unitId });
  return r ? r.balance : null;
}

type Db = PrismaClient | Prisma.TransactionClient;
export type ReceiptCtx = { tenantId: string; systemId: string; unitId?: string; deviceId?: string };
export type ReceiptRefusalCode = "PERMISSION_DENIED" | "SALE_NOT_FOUND" | "VALIDATION" | "INTERNAL";
export type ReceiptRefusal = { ok: false; code: ReceiptRefusalCode; message: string };
export type ReceiptPayloadResult = { ok: true; payload: ReceiptPayload } | ReceiptRefusal;
/** P1.11U F1: ลิงก์ใบเสร็จออนไลน์ของบิล (คัดลอกลิงก์ในลิ้นชักบิล) — null = ปิด QR ใบเสร็จออนไลน์ในค่าตั้ง */
export type ReceiptLinkResult = { ok: true; url: string | null } | ReceiptRefusal;

const MSG: Record<ReceiptRefusalCode, string> = {
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/พิมพ์ใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ (อาจเป็นของสาขาอื่น)",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  INTERNAL: "ระบบใบเสร็จขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: ReceiptRefusalCode, message?: string): ReceiptRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const nonEmpty = (v: string | null | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
/** ต้นฉบับออกได้ภายในกี่มิลลิวินาทีหลังสร้างบิล (F3) — เกิน = สำเนา */
export const RECEIPT_ORIGINAL_WINDOW_MS = 30 * 60_000;

/** ผู้กระทำจากค่าที่ส่งมา (รูปผิด = null) · P1.11 sendReceipt ใช้ตัวเดียวกัน */
export function receiptActorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

/** อ่านบิลได้ไหม (มติ CD3: pos.sale.read · pos.sale.create ได้โดยนัย) — ที่สาขา unitId หรือระดับร้าน */
const canRead = (a: RegisterActor, unitId?: string) =>
  evaluate(a, { module: "pos", action: "pos.sale.read", unitId }) || evaluate(a, { module: "pos", action: "pos.sale.create", unitId });

/** ขอบเขตสาขาที่อ่านบิลได้ (แบบ posSalesScope แต่ใช้สิทธิ์อ่าน) — null = ไม่มีสิทธิ์ที่สาขาใดเลย */
export function receiptReadScope(a: RegisterActor): PosUnitScope | null {
  if (!canRead(a)) return null;
  if (a.role === "OWNER" || a.unitAccess.includes("*")) return { allUnits: true };
  const unitIds = a.unitAccess.filter((u) => canAccessUnit(a, u) && canRead(a, u));
  return unitIds.length ? { allUnits: false, unitIds } : null;
}

/**
 * ข้อมูลใบเสร็จของบิล (R5) — `copy: true` = พิมพ์สำเนา (renderer ประทับ "สำเนา") + AuditLog pos.receipt.reprint
 * ctx = { tenantId (session), systemId (ระบบ POS ของบิล) } · unitId ไม่บังคับ (ขอบเขตมาจากสิทธิ์ของผู้เรียก)
 */
export async function receiptPayload(ctx: ReceiptCtx, actor: RegisterActor, input: { saleId: string; copy?: boolean }, client?: Db): Promise<ReceiptPayloadResult> {
  try {
    const db = client ?? prisma;
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return refuse("SALE_NOT_FOUND");
    const a = receiptActorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const scope = receiptReadScope(a);
    if (!scope) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !Object.keys(input).every((k) => k === "saleId" || k === "copy")) return refuse("VALIDATION");
    if (input.copy !== undefined && typeof input.copy !== "boolean") return refuse("VALIDATION");
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const { tenantId, systemId } = ctx;

    const sale = await db.posSale.findFirst({
      where: { id: input.saleId, ...posSaleWhere(tenantId, systemId, scope) },
      include: SALE_INCLUDE,
    });
    if (!sale) return refuse("SALE_NOT_FOUND");
    // F3: ต้นฉบับเฉพาะบิลสด (≤ 30 นาที) · เก่ากว่า = สำเนา + audit (ไม่ปฏิเสธ)
    const copy = input.copy === true || Date.now() - sale.createdAt.getTime() > RECEIPT_ORIGINAL_WINDOW_MS;
    const built = await buildReceipt(db, tenantId, systemId, sale, copy);
    if (!built) return refuse("SALE_NOT_FOUND");
    const { payload, kind } = built;

    if (copy) {
      await writeAudit({
        tenantId,
        actorId: a.userId,
        action: "pos.receipt.reprint",
        targetType: "PosSale",
        targetId: sale.id,
        after: { receiptNo: sale.receiptNo, kind, unitId: sale.unitId, requestedCopy: input.copy === true },
      });
    }
    return { ok: true, payload };
  } catch (e) {
    console.error("[pos/receipt] receiptPayload INTERNAL", e);
    return refuse("INTERNAL");
  }
}

/**
 * POS P1.11U F1 ▸ ลิงก์ใบเสร็จออนไลน์ของบิล (ปุ่ม "คัดลอกลิงก์ใบเสร็จ") — อ่านอย่างเดียว:
 *   สิทธิ์/ขอบเขตเดียวกับ receiptPayload (receiptReadScope + posSaleWhere) · เลือกแค่ id/publicToken · ไม่ประกอบใบเสร็จ · ไม่เขียน audit
 *   (receiptPayload ยกบิลเก่ากว่า 30 นาทีเป็นสำเนา + audit reprint — การคัดลอกลิงก์ไม่ใช่การพิมพ์) · บิลเก่าไม่มีโทเคน = ensureReceiptToken (lazy · R1)
 *   rs.qrEReceipt ปิด ⇒ url null ◂
 */
export async function receiptLink(ctx: ReceiptCtx, actor: RegisterActor, input: { saleId: string }, client?: Db): Promise<ReceiptLinkResult> {
  try {
    const db = client ?? prisma;
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return refuse("SALE_NOT_FOUND");
    const a = receiptActorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const scope = receiptReadScope(a);
    if (!scope) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !Object.keys(input).every((k) => k === "saleId")) return refuse("VALIDATION");
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const { tenantId, systemId } = ctx;
    const sale = await db.posSale.findFirst({ where: { id: input.saleId, ...posSaleWhere(tenantId, systemId, scope) }, select: { id: true, publicToken: true } });
    if (!sale) return refuse("SALE_NOT_FOUND");
    const posSys = await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { settings: true } });
    if (!posSys) return refuse("SALE_NOT_FOUND");
    return { ok: true, url: receiptSettingsOf(posSys.settings).qrEReceipt ? await eReceiptUrl(db, tenantId, sale) : null };
  } catch (e) {
    console.error("[pos/receipt] receiptLink INTERNAL", e);
    return refuse("INTERNAL");
  }
}

// POS P1.11 ▸ ตัวประกอบใบเสร็จร่วม: receiptPayload (หลังตรวจสิทธิ์/ขอบเขต) · publicReceipt (หน้าใบเสร็จออนไลน์ · ค้นจากโทเคน) ·
//   sendReceipt (อีเมล) — ใช้สูตรบรรทัด/ส่วนลด/VAT ชุดเดียวกัน ไม่ derive เงินซ้ำ · ไม่ตรวจสิทธิ์ ไม่เขียน audit (ผู้เรียกทำเอง) ◂
const SALE_INCLUDE = {
  lines: { orderBy: { id: "asc" }, include: { options: { orderBy: { id: "asc" } } } },
  payments: { orderBy: { id: "asc" } },
} as const satisfies Prisma.PosSaleInclude;
export type ReceiptSaleRow = Prisma.PosSaleGetPayload<{ include: typeof SALE_INCLUDE }>;
export type ReceiptBuild = { payload: ReceiptPayload; kind: ReceiptKind; sale: ReceiptSaleRow; bookId: string | null };

/**
 * ใบเสร็จของบิลตาม id (ร้าน + ระบบ POS ของบิล) โดยไม่ตรวจสิทธิ์ผู้ใช้ — ผู้เรียกต้องตัดสินสิทธิ์/ขอบเขตก่อนเสมอ
 * (หน้าใบเสร็จออนไลน์: โทเคนคือสิทธิ์ · ส่งใบเสร็จ: ตรวจ pos.sale.read + ขอบเขตสาขาเองแล้ว) · null = ไม่พบ/สถานะใช้ไม่ได้
 */
export async function receiptForSale(tenantId: string, systemId: string, saleId: string, opts: { copy?: boolean } = {}, client?: Db): Promise<ReceiptBuild | null> {
  if (!isId(tenantId) || !isId(systemId) || !isId(saleId)) return null;
  const db = client ?? prisma;
  const sale = await db.posSale.findFirst({ where: { id: saleId, tenantId, systemId }, include: SALE_INCLUDE });
  if (!sale) return null;
  return buildReceipt(db, tenantId, systemId, sale, opts.copy === true);
}

async function buildReceipt(db: Db, tenantId: string, systemId: string, sale: ReceiptSaleRow, copy: boolean): Promise<ReceiptBuild | null> {
  const status: ReceiptSaleStatus | null = sale.status === "PAID" || sale.status === "VOIDED" || sale.status === "REFUNDED" ? sale.status : null;
  if (!status) return null;

  // ── ระบบ POS · สาขา · ค่าตั้งใบเสร็จ · สมุดบัญชีที่ผูก ──
  const [posSys, unit, tenant, bookId] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { settings: true } }),
    db.businessUnit.findFirst({ where: { id: sale.unitId, tenantId }, select: { name: true } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    account.posAccountSystemId(tenantId, systemId),
  ]);
  if (!posSys) return null;
  const rs = receiptSettingsOf(posSys.settings);
  const book = bookId
    ? await db.accountSettings.findFirst({
        where: { systemId: bookId, tenantId },
        select: { orgName: true, taxId: true, branchCode: true, address: true, phone: true, logoUrl: true },
      })
    : null;
  const vat = bookId ? await account.vatConfigOf(bookId) : null;
  const taxId = nonEmpty(book?.taxId);
  const hasVat = sale.vatSatang > 0; // F1: บิลที่ไม่มี VAT จริงไม่ใช่ใบกำกับ
  // POS P1.13 ▸ R7: บิลที่ออกใบกำกับเต็มรูปแล้ว (taxInvoiceDocId) = TAX_INVOICE_FULL + เลขใบกำกับ (facade · ใบเต็มรูปชนะ ABB) ◂
  const fullDoc = sale.taxInvoiceDocId && bookId ? await account.posSaleAccountingRef({ tenantId, sourceSystemId: systemId, refId: sale.id }) : null;
  const fullTaxInvoiceNo = fullDoc && fullDoc.docId === sale.taxInvoiceDocId ? nonEmpty(fullDoc.docNo) : undefined;
  const kind: ReceiptKind = sale.taxInvoiceDocId ? "TAX_INVOICE_FULL" : receiptKindOf({ vatRegistered: !!vat?.vatRegistered, posAbbreviatedInvoice: !!vat?.posAbbreviatedInvoice, taxId: book?.taxId, vatSatang: sale.vatSatang });

  // ── เครื่อง/กะ ของบิล (PosSale.shiftId → PosShift.deviceId → PosDevice ของสาขาเดียวกัน) ──
  const shift = sale.shiftId
    ? await db.posShift.findFirst({ where: { id: sale.shiftId, tenantId, unitId: sale.unitId }, select: { shiftNo: true, deviceId: true, deviceLabel: true } })
    : null;
  const device = shift
    ? await db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: sale.unitId, deviceCode: shift.deviceId } }, select: { tenantId: true, name: true, posRegNo: true } })
    : null;
  const dev = device && device.tenantId === tenantId ? device : null;

  // ── ผู้ขาย · สมาชิก · คูปอง ──
  const [seller, customer, coupons] = await Promise.all([
    rs.showCashier && sale.soldByUserId ? db.user.findUnique({ where: { id: sale.soldByUserId }, select: { name: true } }) : null,
    sale.memberId ? db.customer.findFirst({ where: { id: sale.memberId, tenantId }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true, tierDefId: true, phone: true, memberSystemId: true } }) : null,
    db.couponRedemption.findMany({
      where: { tenantId, status: { not: "RELEASED" }, OR: [{ saleId: sale.id }, { refType: "PosSale", refId: sale.id }] },
      select: { discountSatang: true, coupon: { select: { code: true } } },
    }),
  ]);
  // POS P1.12 ▸ R15: สมาชิกจากสำเนาตอนขาย (บิลเก่าไม่มีสำเนา = ข้อมูลสด) · ยอดแต้มสดของระบบแต้มของสาขา (แก้บั๊ก "ระบบแต้มที่อัปเดตล่าสุด") ◂
  const snap = saleMemberSnapshot((sale as { memberSnapshot?: unknown }).memberSnapshot);
  const benefitLines = saleMemberBenefits((sale as { memberBenefits?: unknown }).memberBenefits);
  const [tier, balance] = customer
    ? await Promise.all([
        !snap && customer.tierDefId ? db.memberTierDef.findFirst({ where: { id: customer.tierDefId, tenantId }, select: { name: true } }) : null,
        salePointBalance(tenantId, sale.unitId, customer),
      ])
    : [null, null];

  // ── ยอด (สตางค์จากแถว DB) ──
  const subtotalSatang = sale.lines.reduce((t, l) => t + l.qty * l.unitPriceSatang, 0);
  const lineDiscountSatang = sale.lines.reduce((t, l) => t + l.discountSatang, 0);
  const couponDiscountSatang = coupons.reduce((t, c) => t + c.discountSatang, 0);
  const tierDiscountSatang = sale.tierDiscountSatang;
  // PosSale.discountSatang = ส่วนลดท้ายบิล + คูปอง + สิทธิ์สมาชิก — POS P1.12: บิลที่มีสำเนาสิทธิ์ หัก Σ สิทธิ์ (ระดับ/ว่อชเชอร์/แต้ม แยกบรรทัด) ·
  //   บิลเก่า = หักเฉพาะระดับ (สูตรเดิม) ◂
  const memberBenefitsSatang = benefitLines ? benefitLines.reduce((t, b) => t + b.discountSatang, 0) : tierDiscountSatang;
  const billDiscountSatang = sale.discountSatang - couponDiscountSatang - memberBenefitsSatang;
  const vatSatang = sale.vatSatang;

  const anySale = sale as unknown as Record<string, unknown>;
  const docType: ReceiptDocType = anySale.docType === "REFUND" ? "REFUND" : "SALE"; // P1.8 เพิ่มคอลัมน์ docType — ก่อนนั้น = SALE เสมอ
  // F4: P1.8 เพิ่ม refSaleId (ยังไม่มีใน client ของต้นไม้นี้ ⇒ อ่านแบบไดนามิก) → เลขใบเสร็จของบิลต้นทาง (ร้าน + ระบบเดียวกัน)
  const refSaleId = docType === "REFUND" && isId(anySale.refSaleId) ? anySale.refSaleId : undefined;
  const refSale = refSaleId ? await db.posSale.findFirst({ where: { id: refSaleId, tenantId, systemId }, select: { receiptNo: true } }) : null;
  const refReceiptNo = nonEmpty(refSale?.receiptNo);

  const shopName = nonEmpty(rs.header.name) ?? nonEmpty(book?.orgName) ?? nonEmpty(tenant?.name) ?? nonEmpty(unit?.name) ?? "-";
  const logoUrl = rs.header.logoUrl ?? nonEmpty(book?.logoUrl);
  const memberName = snap
    ? (nonEmpty(snap.name ?? undefined) ?? "-")
    : customer
      ? (nonEmpty(customer.name) ?? nonEmpty([customer.firstName, customer.lastName].filter(Boolean).join(" ")) ?? nonEmpty(customer.memberCode) ?? "-")
      : "";
  const memberCode = snap ? nonEmpty(snap.memberCode ?? undefined) : nonEmpty(customer?.memberCode);
  const phoneMasked = snap ? nonEmpty(snap.phoneMasked ?? undefined) : customer?.phone ? (await import("@/lib/modules/member")).maskPhone(customer.phone) : undefined;
  const tierName = snap ? nonEmpty(snap.tierName ?? undefined) : nonEmpty(tier?.name);
  const couponCode = coupons.map((c) => c.coupon?.code).filter((c): c is string => !!c).join(", ");

  const payload: ReceiptPayload = {
    docType,
    kind,
    status,
    copy,
    paper: null,
    shop: {
      name: shopName,
      branchName: unit?.name ?? "",
      address: nonEmpty(rs.header.address) ?? nonEmpty(book?.address) ?? "",
      phone: nonEmpty(rs.header.phone) ?? nonEmpty(book?.phone) ?? "",
      ...(kind === "TAX_INVOICE_ABB" || kind === "TAX_INVOICE_FULL" ? { taxId, branchNo: nonEmpty(book?.branchCode) ?? "00000" } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
    device: {
      ...(dev?.posRegNo ? { posRegNo: dev.posRegNo } : {}),
      ...((dev?.name ?? shift?.deviceLabel) ? { name: (dev?.name ?? shift?.deviceLabel)! } : {}),
    },
    doc: {
      receiptNo: sale.receiptNo ?? "",
      issuedAt: (sale.paidAt ?? sale.createdAt).toISOString(),
      ...(nonEmpty(seller?.name) ? { cashierName: nonEmpty(seller?.name)! } : {}),
      ...(shift ? { shiftNo: shift.shiftNo } : {}),
      ...(refReceiptNo ? { refReceiptNo } : {}),
      ...(kind === "TAX_INVOICE_FULL" && fullTaxInvoiceNo ? { fullTaxInvoiceNo } : {}),
    },
    lines: sale.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      lineTotalSatang: l.lineTotalSatang,
      discountSatang: l.discountSatang,
      options: l.options.map((o) => o.choiceName),
      ...(nonEmpty(l.note) ? { note: nonEmpty(l.note)! } : {}),
      ...(l.weightGrams !== null ? { weightGrams: l.weightGrams } : {}),
    })),
    totals: {
      subtotalSatang,
      lineDiscountSatang,
      billDiscountSatang,
      couponDiscountSatang,
      ...(couponCode ? { couponCode } : {}),
      tierDiscountSatang,
      ...(benefitLines ? { memberBenefits: benefitLines } : {}),
      serviceChargeSatang: sale.serviceChargeSatang,
      grandTotalSatang: sale.grandTotalSatang,
      vatBaseSatang: sale.grandTotalSatang - vatSatang,
      vatSatang,
      vatRateBp: hasVat && vat && vat.vatRegistered ? vat.vatRateBp : 0,
      tipSatang: sale.tipSatang,
    },
    payments: sale.payments.map((p) => ({
      type: p.type,
      amountSatang: p.amountSatang,
      ...(p.tenderedSatang !== null ? { tenderedSatang: p.tenderedSatang } : {}),
      ...(p.changeSatang !== null ? { changeSatang: p.changeSatang } : {}),
      ...(nonEmpty(p.reference) ? { reference: nonEmpty(p.reference)! } : {}),
    })),
    // showPoints ปิด = ไม่พิมพ์ส่วนสมาชิก/แต้ม
    ...(customer && rs.showPoints
      ? {
          member: {
            name: memberName,
            ...(memberCode ? { memberCode } : {}),
            ...(phoneMasked ? { phoneMasked } : {}),
            ...(tierName ? { tierName } : {}),
            pointEarned: sale.pointEarned,
            ...(balance !== null ? { pointBalance: balance } : {}),
          },
        }
      : {}),
    // POS P1.11 ▸ R3: qrEReceipt เปิด (ค่าปริยาย) = `${origin}/r/<token>` · บิลเก่าไม่มีโทเคน = สร้างตอนนี้ (UPDATE เดียว · client เดียวกัน) ◂
    footer: { text: rs.footer, qrEReceiptUrl: rs.qrEReceipt ? await eReceiptUrl(db, tenantId, sale) : null, fullTaxInvoiceHint: kind === "TAX_INVOICE_ABB" && docType === "SALE" && status === "PAID" }, // R2: บิลยกเลิก/คืนแล้วไม่ชวนขอใบกำกับเต็มรูป
    labels: { th: RECEIPT_LABELS.th, en: RECEIPT_LABELS.en },
  };
  return { payload, kind, sale, bookId: bookId ?? null };
}

/** URL ใบเสร็จออนไลน์ของบิล (R3) — null เมื่อหาโทเคนไม่ได้ (บิลหายระหว่างทาง) */
export async function eReceiptUrl(db: Db, tenantId: string, sale: { id: string; publicToken: string | null }): Promise<string | null> {
  const token = sale.publicToken ?? (await ensureReceiptToken(tenantId, sale.id, db));
  if (!token) return null;
  return `${(await publicOrigin()).replace(/\/+$/, "")}/r/${token}`;
}
