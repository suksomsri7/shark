// tax-invoice.ts — ใบกำกับภาษีเต็มรูปของบิล POS (P1.13 · R3–R6 · CD1–CD6) · ผู้เขียนเดียวของ PosBuyerProfile
//
// 🔴 POS แตะบัญชีผ่าน facade `@/lib/modules/account` เท่านั้น (F2.2) — ไม่เขียน AccountDocument/AccountContact/Customer เอง
// 🔴 ปฏิเสธเป็นข้อมูล {ok:false, code, message ไทย} — ไม่ throw (รหัสทั้งหมดอยู่ที่ tax-invoice-shared.ts)
// 🔴 ออกทีหลัง (R3): บิล SALE สถานะ PAID ที่ยังไม่มีการคืนเงิน (มติ 15 — มีคืนแล้ว = HAS_REFUNDS) · ภายใน 7 วันนับจาก paidAt ·
//    POS ผูกสมุดจด VAT ที่ออกใบกำกับอย่างย่อ (ชนิดใบเสร็จ TAX_INVOICE_ABB) · สิทธิ์ pos.sale.read + pos.taxinvoice.issue ที่สาขาของบิล
//    ABB → CANCELLED + supersededByDocId · TAX_INVOICE ยอด/บรรทัด/วันที่เดิม · GL ไม่แตะ (facade supersedeAbbWithTaxInvoice · มติ 4)
//    ยิงซ้ำด้วยผู้ซื้อเดิม = เอกสารเดิม (ไม่มี audit/event ใหม่ · มติ 5) · ผู้ซื้อคนอื่น = ALREADY_ISSUED · สำเนาผู้ซื้อไม่เปลี่ยนหลังออกแล้ว (R1)
// 🔴 event pos.sale.taxInvoiceIssued {saleId, docId} ทุกการออก "ครั้งแรก" (ตอนชำระ = account-bridge · ทีหลัง/จากคำขอ = ที่นี่ · มติ 12)
// 🔴 ค้นกรมพัฒน์ฯ (R5): ผ่าน facade lookupJuristic (ฉีด deps.lookup ได้ · ไม่มีกุญแจ = DBD_NOT_CONFIGURED ไม่แตะเครือข่าย) ·
//    ตรวจสาขา↔ระบบ POS ก่อน · 30 ครั้ง/นาที/สาขา + 100/นาที/ร้าน (ตรวจก่อนเขียน audit ใด ๆ) นับจาก AuditLog pos.taxinvoice.dbd_lookup (targetId = สาขา) · audit ทุกครั้งด้วยเลขที่ปิดแล้ว (ห้ามเลขดิบ)
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate } from "@/lib/core/rbac";
import * as account from "@/lib/modules/account";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";
import { receiptActorOf } from "./receipt";
import { receiptKindOf } from "./receipt-shared";
import type { RegisterActor } from "./register-shared";
import {
  TAX_INVOICE_DBD_PER_MINUTE,
  TAX_INVOICE_DBD_PER_MINUTE_TENANT,
  TAX_INVOICE_LATE_DAYS,
  buyerKindFromTaxId,
  isValidThaiTaxIdChecksum,
  maskTaxId,
  parseTaxInvoiceBuyer,
  sameTaxInvoiceBuyer,
  snapshotBuyer,
  taxInvoiceRefuse,
  type TaxInvoiceBuyer,
  type TaxInvoiceRefusal,
  type TaxInvoiceSnapshot,
} from "./tax-invoice-shared";

type Db = typeof prisma | Prisma.TransactionClient;
/** ctx ของจอขาย/บิล — สาขาบังคับ (สิทธิ์และขอบเขตคิดที่สาขานี้) */
export type TaxInvoiceCtx = { tenantId: string; systemId: string; unitId: string };
export type TaxInvoiceIssueResult = { ok: true; docId: string; docNo: string | null } | TaxInvoiceRefusal;
export type TaxInvoiceRejectResult = { ok: true } | TaxInvoiceRefusal;
export type DbdBuyer = { kind: "JURISTIC"; name: string; taxId: string; branchCode: "00000"; address: string; status: string | null };
export type TaxInvoiceLookupResult = { ok: true; found: true; buyer: DbdBuyer } | { ok: true; found: false } | TaxInvoiceRefusal;
export type BuyerProfile = { kind: "PERSON" | "JURISTIC"; name: string; taxId: string; branchCode: string; address: string; email: string | null };
export type BuyerProfileResult = { ok: true; profile: BuyerProfile | null } | TaxInvoiceRefusal;
type DbdLookup = (taxId: string) => Promise<account.DbdLookupResult>;

const DAY_MS = 86_400_000;
const REASON_MAX = 500;
const PERM_ISSUE = "pos.taxinvoice.issue";
const AUDIT_ISSUED = "pos.taxinvoice.issued";
const AUDIT_REJECTED = "pos.taxinvoice.rejected";
const AUDIT_DBD = "pos.taxinvoice.dbd_lookup";
const EV_ISSUED = "pos.sale.taxInvoiceIssued";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const onlyKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k) || v[k] === undefined);
const ctxOf = (c: unknown): TaxInvoiceCtx | null => (isRecord(c) && isId(c.tenantId) && isId(c.systemId) && isId(c.unitId) ? { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId } : null);
const canRead = (a: RegisterActor, unitId: string) =>
  evaluate(a, { module: "pos", action: "pos.sale.read", unitId }) || evaluate(a, { module: "pos", action: "pos.sale.create", unitId });
/** สิทธิ์ออก/ปฏิเสธใบกำกับเต็มรูป (R3 R4): อ่านบิล + pos.taxinvoice.issue ที่สาขานี้ (เจ้าของ/ผู้จัดการได้โดยปริยาย) */
const canIssue = (a: RegisterActor, unitId: string) => canRead(a, unitId) && evaluate(a, { module: "pos", action: PERM_ISSUE, unitId });
const toBuyerArg = (b: TaxInvoiceBuyer) => ({ kind: b.kind, name: b.name, taxId: b.taxId, branchCode: b.branchCode, address: b.address, email: b.email });

function internal(where: string, e: unknown): TaxInvoiceRefusal {
  console.error(`[pos/tax-invoice] ${where} INTERNAL`, e instanceof Error ? e.name : "Error");
  return taxInvoiceRefuse("INTERNAL");
}

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

// ═══════════ R3 ออกทีหลัง ═══════════

/** ชนิดใบเสร็จของบิล (สูตรเดียวกับใบที่พิมพ์ · receipt-shared) — ออกเต็มรูปได้เฉพาะบิลที่เป็นใบกำกับอย่างย่อ */
async function abbEligible(tenantId: string, systemId: string, vatSatang: number): Promise<boolean> {
  const bookId = await account.posAccountSystemId(tenantId, systemId);
  if (!bookId) return false;
  const [vat, book] = await Promise.all([account.vatConfigOf(bookId), prisma.accountSettings.findFirst({ where: { systemId: bookId, tenantId }, select: { taxId: true } })]);
  return receiptKindOf({ vatRegistered: !!vat?.vatRegistered, posAbbreviatedInvoice: !!vat?.posAbbreviatedInvoice, taxId: book?.taxId, vatSatang }) === "TAX_INVOICE_ABB";
}

/** เลขเอกสารของใบกำกับที่ผูกกับบิล (อ่านผ่าน facade — ใบเต็มรูปชนะ ABB) */
async function docNoOf(ctx: TaxInvoiceCtx, saleId: string, docId: string): Promise<string | null> {
  const ref = await account.posSaleAccountingRef({ tenantId: ctx.tenantId, sourceSystemId: ctx.systemId, refId: saleId });
  return ref && ref.docId === docId ? ref.docNo : null;
}

type IssueCore = { ctx: TaxInvoiceCtx; actor: RegisterActor; saleId: string; buyer: TaxInvoiceBuyer; requestId: string | null; rememberBuyer: boolean; via: "LATER" | "REQUEST" };

/** แกนของ R3 (ผ่านด่านสิทธิ์ + ตัวแกะผู้ซื้อมาแล้ว) */
async function issueCore(x: IssueCore): Promise<TaxInvoiceIssueResult> {
  const { ctx, saleId, buyer } = x;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId, docType: "SALE" },
    select: { id: true, unitId: true, status: true, memberId: true, vatSatang: true, refundedSatang: true, paidAt: true, createdAt: true, taxInvoice: true, taxInvoiceDocId: true },
  });
  if (!sale) return taxInvoiceRefuse("SALE_NOT_FOUND");
  if (sale.status === "VOIDED") return taxInvoiceRefuse("SALE_VOIDED");
  // ออกแล้ว: ผู้ซื้อเดิม = เอกสารเดิม (มติ 5) · คนอื่น = ALREADY_ISSUED (สำเนาไม่เปลี่ยน · R1)
  if (sale.taxInvoiceDocId) {
    const prev = snapshotBuyer(sale.taxInvoice);
    if (prev && sameTaxInvoiceBuyer(prev, buyer)) return { ok: true, docId: sale.taxInvoiceDocId, docNo: await docNoOf(ctx, sale.id, sale.taxInvoiceDocId) };
    return taxInvoiceRefuse("ALREADY_ISSUED");
  }
  // มติ 15: มีการคืนเงินแล้ว (บางส่วน/ทั้งบิล) = ไม่ออกเต็มรูปจากหน้าร้าน
  if (sale.refundedSatang > 0 || sale.status === "REFUNDED") return taxInvoiceRefuse("HAS_REFUNDS");
  if (sale.status !== "PAID") return taxInvoiceRefuse("NOT_ELIGIBLE");
  if ((sale.paidAt ?? sale.createdAt).getTime() < Date.now() - TAX_INVOICE_LATE_DAYS * DAY_MS) return taxInvoiceRefuse("TOO_LATE");
  if (!(await abbEligible(ctx.tenantId, ctx.systemId, sale.vatSatang))) return taxInvoiceRefuse("NOT_ELIGIBLE");

  let request: { id: string } | null = null;
  if (x.requestId) {
    request = await prisma.posTaxInvoiceRequest.findFirst({ where: { id: x.requestId, tenantId: ctx.tenantId, unitId: ctx.unitId, saleId: sale.id, status: "REQUESTED" }, select: { id: true } });
    if (!request) return taxInvoiceRefuse("NOT_FOUND");
  }

  // บัญชี: ABB → TAX_INVOICE (ไม่มี ABB = consumer ยังไม่ทำงาน → ACCOUNT_PENDING · ไม่เขียนอะไรฝั่ง POS)
  const conv = await account.supersedeAbbWithTaxInvoice({ tenantId: ctx.tenantId, sourceSystemId: ctx.systemId, refId: sale.id, buyer: toBuyerArg(buyer) });
  if (!conv.ok) {
    if (conv.code === "NO_ABB") return taxInvoiceRefuse("ACCOUNT_PENDING");
    if (conv.code === "INTERNAL") return internal("supersede", conv.reason);
    return taxInvoiceRefuse("NOT_ELIGIBLE");
  }
  // fix F1: ABB ถูกแทนไปแล้วด้วยใบของผู้ซื้อคนอื่น (คำขอแข่งกัน) ⇒ ALREADY_ISSUED และไม่เขียนอะไรฝั่ง POS
  if (!conv.created && conv.buyerMatches === false) return taxInvoiceRefuse("ALREADY_ISSUED");

  const snapshot: TaxInvoiceSnapshot = { ...buyer, requestedAt: new Date().toISOString() };
  // ธุรกรรมเดียว: สำเนา + เลขเอกสาร (เฉพาะเมื่อยังว่าง — แข่งกันได้ผู้ชนะคนเดียว) · คำขอ P1.11 → ISSUED · event
  const won = await prisma.$transaction(async (tx) => {
    const n = await tx.posSale.updateMany({
      // fix F1: ยึดเลขเอกสารได้เฉพาะบิลที่ยัง PAID และไม่มีการคืนเงิน (ปิดช่องแข่งกับการคืนเงิน)
      where: { id: sale.id, tenantId: ctx.tenantId, taxInvoiceDocId: null, status: "PAID", refundedSatang: 0 },
      data: { taxInvoice: snapshot as unknown as Prisma.InputJsonValue, taxInvoiceDocId: conv.docId },
    });
    if (n.count !== 1) return false;
    // คำขอจากใบเสร็จออนไลน์ของบิลนี้ที่ยังเปิดอยู่ = ได้เอกสารแล้ว (มติ 8: เลขเอกสารอยู่ที่ accountDocId)
    await tx.posTaxInvoiceRequest.updateMany({
      where: { tenantId: ctx.tenantId, saleId: sale.id, status: "REQUESTED", ...(request ? { id: request.id } : {}) },
      data: { status: "ISSUED", accountDocId: conv.docId },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: EV_ISSUED,
      idempotencyKey: `${EV_ISSUED}:${sale.id}`,
      systemId: ctx.systemId,
      unitId: sale.unitId,
      payload: { tenantId: ctx.tenantId, saleId: sale.id, docId: conv.docId, unitId: sale.unitId, via: x.via, ...(request ? { requestId: request.id } : {}) },
    });
    return true;
  });
  if (!won) {
    // อีกคำขอออกให้บิลนี้ไปก่อนเสี้ยววินาที / บิลถูกคืนเงิน-ยกเลิกระหว่างทาง — ตัดสินจากแถวล่าสุด
    const again = await prisma.posSale.findFirst({ where: { id: sale.id, tenantId: ctx.tenantId }, select: { taxInvoice: true, taxInvoiceDocId: true, status: true, refundedSatang: true } });
    if (again?.taxInvoiceDocId) {
      const prev = snapshotBuyer(again.taxInvoice);
      if (prev && sameTaxInvoiceBuyer(prev, buyer)) return { ok: true, docId: again.taxInvoiceDocId, docNo: await docNoOf(ctx, sale.id, again.taxInvoiceDocId) };
      return taxInvoiceRefuse("ALREADY_ISSUED");
    }
    if (again?.status === "VOIDED") return taxInvoiceRefuse("SALE_VOIDED");
    if (again && (again.refundedSatang > 0 || again.status === "REFUNDED")) return taxInvoiceRefuse("HAS_REFUNDS");
    return taxInvoiceRefuse("ALREADY_ISSUED");
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: x.actor.userId,
    action: AUDIT_ISSUED,
    targetType: "PosSale",
    targetId: sale.id,
    after: { saleId: sale.id, unitId: sale.unitId, docId: conv.docId, docNo: conv.docNo, kind: buyer.kind, buyerName: buyer.name, taxId: maskTaxId(buyer.taxId), branchCode: buyer.branchCode, via: x.via, ...(request ? { requestId: request.id } : {}) },
  });
  if (x.rememberBuyer && sale.memberId) await rememberBuyerForMember(ctx.tenantId, sale.memberId, buyer);
  scheduleDrain();
  return { ok: true, docId: conv.docId, docNo: conv.docNo };
}

/**
 * R3 — ออกใบกำกับภาษีเต็มรูปให้บิลที่ชำระแล้ว (แทนใบกำกับอย่างย่อ) · {ok:true, docId, docNo} | ปฏิเสธเป็นข้อมูล
 * input = {saleId, buyer, requestId?, rememberBuyer?} · ไม่ throw
 */
export async function issueFullTaxInvoice(ctx: TaxInvoiceCtx, actor: RegisterActor, input: { saleId: string; buyer: unknown; requestId?: string; rememberBuyer?: boolean }): Promise<TaxInvoiceIssueResult> {
  try {
    const c = ctxOf(ctx);
    const a = receiptActorOf(actor);
    if (!c) return taxInvoiceRefuse("SALE_NOT_FOUND");
    if (!a || !canIssue(a, c.unitId)) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["saleId", "buyer", "requestId", "rememberBuyer"])) return taxInvoiceRefuse("VALIDATION");
    if (input.rememberBuyer !== undefined && input.rememberBuyer !== null && typeof input.rememberBuyer !== "boolean") return taxInvoiceRefuse("VALIDATION");
    if (input.requestId !== undefined && input.requestId !== null && !isId(input.requestId)) return taxInvoiceRefuse("NOT_FOUND");
    const b = parseTaxInvoiceBuyer(input.buyer);
    if (!b.ok) return taxInvoiceRefuse(b.code, b.message);
    if (!isId(input.saleId)) return taxInvoiceRefuse("SALE_NOT_FOUND");
    return await issueCore({ ctx: c, actor: a, saleId: input.saleId, buyer: b.buyer, requestId: isId(input.requestId) ? input.requestId : null, rememberBuyer: input.rememberBuyer === true, via: "LATER" });
  } catch (e) {
    return internal("issueFullTaxInvoice", e);
  }
}

// ═══════════ R4 จากคำขอ P1.11 ═══════════

/** คำขอของสาขานี้ (อื่น/มั่ว = null ⇒ NOT_FOUND) */
async function requestOf(ctx: TaxInvoiceCtx, requestId: unknown) {
  if (!isId(requestId)) return null;
  const r = await prisma.posTaxInvoiceRequest.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, unitId: ctx.unitId } });
  if (!r) return null;
  // คำขอต้องเป็นของบิลในระบบ POS ของ ctx ด้วย
  const sale = await prisma.posSale.findFirst({ where: { id: r.saleId, tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId }, select: { id: true, taxInvoiceDocId: true } });
  return sale ? { req: r, sale } : null;
}

/**
 * R4 — ออกเต็มรูปจากคำขอของลูกค้า (ผู้ซื้อ = แถวคำขอ · kind จากเลข: ขึ้นต้น 0 = นิติบุคคล · source MANUAL — มติ 7)
 * {ok:true, docId, docNo} | NOT_FOUND (สาขาอื่น/มั่ว) | ปฏิเสธของ R3 · ไม่ throw
 */
export async function issueFromTaxInvoiceRequest(ctx: TaxInvoiceCtx, actor: RegisterActor, input: { requestId: string; rememberBuyer?: boolean }): Promise<TaxInvoiceIssueResult> {
  try {
    const c = ctxOf(ctx);
    const a = receiptActorOf(actor);
    if (!c) return taxInvoiceRefuse("NOT_FOUND");
    if (!a || !canIssue(a, c.unitId)) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["requestId", "rememberBuyer"])) return taxInvoiceRefuse("VALIDATION");
    if (input.rememberBuyer !== undefined && input.rememberBuyer !== null && typeof input.rememberBuyer !== "boolean") return taxInvoiceRefuse("VALIDATION");
    const found = await requestOf(c, input.requestId);
    if (!found) return taxInvoiceRefuse("NOT_FOUND");
    const { req, sale } = found;
    const b = parseTaxInvoiceBuyer({ kind: buyerKindFromTaxId(req.taxId), name: req.name, taxId: req.taxId, branchCode: req.branchCode, address: req.address, email: req.email, source: "MANUAL" });
    if (!b.ok) return taxInvoiceRefuse(b.code, b.message);
    // คำขอที่ออกแล้ว = ยิงซ้ำ (ได้เอกสารเดิมเมื่อผู้ซื้อตรง) · ถูกปฏิเสธแล้ว = ออกจากคำขอนี้ไม่ได้
    if (req.status === "REJECTED") return taxInvoiceRefuse("NOT_ELIGIBLE", "คำขอนี้ถูกปฏิเสธไปแล้ว — ให้ลูกค้าส่งคำขอใหม่");
    return await issueCore({ ctx: c, actor: a, saleId: sale.id, buyer: b.buyer, requestId: req.status === "REQUESTED" ? req.id : null, rememberBuyer: input.rememberBuyer === true, via: "REQUEST" });
  } catch (e) {
    return internal("issueFromTaxInvoiceRequest", e);
  }
}

/** R4 — ปฏิเสธคำขอ (เหตุผลบังคับ ≤ 500) → REJECTED + audit pos.taxinvoice.rejected · ไม่มีเอกสาร · ABB ไม่เปลี่ยน · ไม่ throw */
export async function rejectTaxInvoiceRequest(ctx: TaxInvoiceCtx, actor: RegisterActor, input: { requestId: string; reason: string }): Promise<TaxInvoiceRejectResult> {
  try {
    const c = ctxOf(ctx);
    const a = receiptActorOf(actor);
    if (!c) return taxInvoiceRefuse("NOT_FOUND");
    if (!a || !canIssue(a, c.unitId)) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["requestId", "reason"])) return taxInvoiceRefuse("VALIDATION");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason || Array.from(reason).length > REASON_MAX) return taxInvoiceRefuse("VALIDATION", `ใส่เหตุผลที่ปฏิเสธ (1–${REASON_MAX} ตัวอักษร)`);
    const found = await requestOf(c, input.requestId);
    if (!found) return taxInvoiceRefuse("NOT_FOUND");
    const { req } = found;
    if (req.status !== "REQUESTED") return taxInvoiceRefuse("NOT_ELIGIBLE", "คำขอนี้ดำเนินการไปแล้ว");
    const n = await prisma.posTaxInvoiceRequest.updateMany({ where: { id: req.id, tenantId: c.tenantId, status: "REQUESTED" }, data: { status: "REJECTED" } });
    if (n.count !== 1) return taxInvoiceRefuse("NOT_ELIGIBLE", "คำขอนี้ดำเนินการไปแล้ว");
    await writeAudit({
      tenantId: c.tenantId,
      actorId: a.userId,
      action: AUDIT_REJECTED,
      targetType: "PosTaxInvoiceRequest",
      targetId: req.id,
      before: { status: "REQUESTED" },
      after: { status: "REJECTED", saleId: req.saleId, unitId: req.unitId, reason, taxId: maskTaxId(req.taxId) },
    });
    return { ok: true };
  } catch (e) {
    return internal("rejectTaxInvoiceRequest", e);
  }
}

// ═══════════ R5 ค้นกรมพัฒน์ฯ ═══════════

const joinAddress = (x: { addressLine: string | null; subdistrict: string | null; district: string | null; province: string | null; postcode: string | null } | null | undefined) =>
  [x?.addressLine, x?.subdistrict, x?.district, x?.province, x?.postcode].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean).join(" ");

/**
 * R5 — ค้นนิติบุคคลจากเลขผู้เสียภาษี (สิทธิ์ pos.sale.create ที่สาขา · มติ 11)
 * {ok:true, found:true, buyer} | {ok:true, found:false} | DBD_NOT_CONFIGURED · TAX_ID_INVALID · DBD_UNAVAILABLE · RATE_LIMITED (มติ 10) · ไม่ throw
 * opts.deps.lookup = ตัวค้นปลอมของข้อสอบ (ไม่ส่ง = facade lookupJuristic — ไม่มีกุญแจ = noKey ไม่แตะเครือข่าย)
 */
export async function lookupBuyerByTaxId(ctx: TaxInvoiceCtx, actor: RegisterActor, input: { taxId: string }, opts?: { deps?: { lookup?: DbdLookup } }): Promise<TaxInvoiceLookupResult> {
  try {
    const c = ctxOf(ctx);
    const a = receiptActorOf(actor);
    if (!c) return taxInvoiceRefuse("PERMISSION_DENIED");
    // fix F2: สาขาต้องผูกกับระบบ POS ของ ctx ในร้านนี้ก่อนอย่างอื่นทั้งหมด (กันนับ/เขียน audit ใส่สาขาของคนอื่น)
    const link = await prisma.appSystemUnit.findFirst({ where: { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, type: "POS" }, select: { unitId: true } });
    if (!link) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!a || !evaluate(a, { module: "pos", action: "pos.sale.create", unitId: c.unitId })) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["taxId"])) return taxInvoiceRefuse("VALIDATION");
    const taxId = typeof input.taxId === "string" ? input.taxId.replace(/[\s-]/g, "") : "";
    const audit = (outcome: string) =>
      writeAudit({ tenantId: c.tenantId, actorId: a.userId, action: AUDIT_DBD, targetType: "BusinessUnit", targetId: c.unitId, after: { unitId: c.unitId, taxId: maskTaxId(taxId), outcome } });
    // fix F2: เพดานก่อนทุกอย่างที่เขียน audit — 30 ครั้ง/นาที/สาขา + 100 ครั้ง/นาที/ร้าน (นับแถว audit ของหนึ่งนาทีล่าสุด)
    const since = new Date(Date.now() - 60_000);
    const [perUnit, perTenant] = await Promise.all([
      prisma.auditLog.count({ where: { tenantId: c.tenantId, action: AUDIT_DBD, targetType: "BusinessUnit", targetId: c.unitId, createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { tenantId: c.tenantId, action: AUDIT_DBD, createdAt: { gte: since } } }),
    ]);
    if (perUnit >= TAX_INVOICE_DBD_PER_MINUTE || perTenant >= TAX_INVOICE_DBD_PER_MINUTE_TENANT) {
      await audit("RATE_LIMITED");
      return taxInvoiceRefuse("RATE_LIMITED");
    }
    if (!isValidThaiTaxIdChecksum(taxId)) {
      await audit("TAX_ID_INVALID");
      return taxInvoiceRefuse("TAX_ID_INVALID");
    }
    const lookup: DbdLookup = opts?.deps?.lookup ?? ((id: string) => account.lookupJuristic(id));
    let res: account.DbdLookupResult;
    try {
      res = await lookup(taxId);
    } catch {
      await audit("DBD_UNAVAILABLE");
      return taxInvoiceRefuse("DBD_UNAVAILABLE");
    }
    if (!res || typeof res !== "object") {
      await audit("DBD_UNAVAILABLE");
      return taxInvoiceRefuse("DBD_UNAVAILABLE");
    }
    if (res.ok !== true) {
      const reason = (res as { reason?: unknown }).reason;
      if (reason === account.DBD_REASON.notFound) {
        await audit("NOT_FOUND");
        return { ok: true, found: false };
      }
      const code = reason === account.DBD_REASON.noKey ? "DBD_NOT_CONFIGURED" : reason === account.DBD_REASON.badTaxId ? "TAX_ID_INVALID" : "DBD_UNAVAILABLE";
      await audit(code);
      return taxInvoiceRefuse(code);
    }
    const name = typeof res.name === "string" ? res.name.trim() : "";
    if (!name) {
      await audit("NOT_FOUND");
      return { ok: true, found: false };
    }
    await audit("FOUND");
    return { ok: true, found: true, buyer: { kind: "JURISTIC", name, taxId, branchCode: "00000", address: joinAddress(res.address), status: res.status ?? null } };
  } catch (e) {
    return internal("lookupBuyerByTaxId", e);
  }
}

// ═══════════ R6 ผู้ซื้อที่จำไว้ ═══════════

/** R6 — ผู้ซื้อที่จำไว้ของสมาชิก (เติมฟอร์ม) · ไม่มี/สมาชิกร้านอื่น = profile null · ไม่มีผู้กระทำ — action ตรวจสิทธิ์ (มติ 14) · ไม่ throw */
export async function buyerProfileForMember(ctx: { tenantId: string }, input: { memberId: string }): Promise<BuyerProfileResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId)) return taxInvoiceRefuse("NOT_FOUND");
    if (!isRecord(input) || !isId(input.memberId)) return taxInvoiceRefuse("VALIDATION");
    const row = await prisma.posBuyerProfile.findFirst({
      where: { tenantId: ctx.tenantId, customerId: input.memberId },
      select: { kind: true, name: true, taxId: true, branchCode: true, address: true, email: true },
    });
    if (!row) return { ok: true, profile: null };
    return { ok: true, profile: { kind: row.kind === "PERSON" ? "PERSON" : "JURISTIC", name: row.name, taxId: row.taxId, branchCode: row.branchCode, address: row.address, email: row.email ?? null } };
  } catch (e) {
    return internal("buyerProfileForMember", e);
  }
}
