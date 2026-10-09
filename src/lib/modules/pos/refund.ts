// POS P1.8 ▸ คืนเงินบางส่วน/ทั้งบิล — ใบคืน = เอกสารใหม่ (PosSale docType REFUND) ไม่ใช่การแก้บิลเดิม (มติ R1–R6 · R9) ◂
// สัญญา = scripts/qc-pos-p1.8.mts · brief ledger/pos-briefs/pos-brief-P1.8.md (§2 R1–R10 · §7 CD1–CD8) · โน้ต ledger/wo-notes/pos-P1.8.md
//
// ในtx ของใบคืน (อะตอมมิกกับการจ่ายเงินคืน): ล็อกบิลเดิม FOR UPDATE (สองคนคืนบรรทัดเดียวกันพร้อมกัน = ผ่านคนเดียว) ·
//   จำนวนที่เหลือคืนได้ · ยอดคืนตามสูตร (refund-math) · เลขใบคืน CN${YYYYMM}-NNNN จาก PosDocCounter (ตัวนับใหม่ · ใบเสร็จขายไม่ขยับ · O2) ·
//   ใบคืน + บรรทัด + แถวจ่าย · refundedSatang/สถานะของบิลเดิม · คูปองคืนสิทธิ์เฉพาะคืนครบ · outbox pos.sale.refunded · AuditLog
// นอกtx ทางคิว `pos.sale.refunded` (refund-consumer.ts): ใบลดหนี้ + JV · แต้ม/ยอดสะสม/ตรา (member-bridges) · รับของคืนเข้าคลังที่ต้นทุนเดิม (O12)
// 🔴 คำปฏิเสธ "คืน" {ok:false, code, message} ข้อความไทย — ไม่ throw ข้ามขอบ action (ขัดข้องที่ไม่คาดคิด = UNKNOWN)
// 🔴 ยอดบนใบคืนเป็นบวกทั้งหมด ตีความตาม docType · ทิปไม่คืน · VAT ระดับเอกสาร (splitIncludedVat ของยอดใบคืน)
import { randomUUID } from "node:crypto";
import type { PosPayType, PosSale, PosSaleLine, PosPayment, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import * as coupon from "@/lib/modules/coupon/service";
import { posSaleAccountingRef } from "@/lib/modules/account";
import { splitIncludedVat } from "@/lib/money/vat";
import { posVatRateBp } from "./service";
import { isShiftDeviceId, parseShiftSettings, resolveRegisterShift } from "./shift";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import { lineNets, refundLineAmount, refundServiceCharge } from "./refund-math";
// POS P1.11 ▸ R1: ใบคืนก็มีโทเคน (เปิดแล้วพาไปหน้าบิลต้นทาง) ◂
import { newReceiptToken } from "./receipt-token";
// POS P1.15 ▸ R5/R6: คืนเงินผ่านสายอนุมัติ (POS_REFUND) · PIN ผู้จัดการ · ตัวรับคิวคืนเงินที่อนุมัติแล้ว (นอกกะ · มติ 13) ◂
import { POS_APPROVAL_MESSAGE, auditPinOverride, cancelOpenPosRequest, submitPosApproval } from "./pos-approval";
import { staffActorFromToken, verifyManagerPin } from "./staff-pin";
import {
  REFUND_PAY_TYPES,
  REFUND_PREFIX_DEFAULT,
  REFUND_REASON_CODES,
  REFUND_REASON_MAX,
  type RefundDoc,
  type RefundPayType,
  type RefundReasonCode,
  type RefundRefusal,
  type RefundRefusalCode,
  type RefundSaleInput,
  type RefundSaleResult,
  type SaleForRefundLine,
  type SaleForRefundResult,
} from "./refund-shared";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** สิทธิ์คืนเงิน (มติ R5 · Q2: OWNER/MANAGER โดยปริยาย · STAFF ต้องได้คีย์นี้ตรง ๆ — P1.15 เพิ่มสายอนุมัติ) */
export const REFUND_PERMISSION = "pos.sale.refund";
const MAX_LINES = 200;
const MAX_PAY = 10;
const MAX_REFERENCE = 100;
const MAX_KEY = 200;

const MSG: Record<RefundRefusalCode, string> = {
  NO_PERMISSION: "บัญชีนี้ยังไม่มีสิทธิ์คืนเงิน — ขอให้เจ้าของร้านหรือผู้จัดการทำรายการ",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ในสาขานี้",
  SALE_NOT_REFUNDABLE: "บิลนี้คืนเงินที่ POS ไม่ได้ (ถูกยกเลิก คืนครบแล้ว เป็นบิลขายบัตรกำนัล หรือเป็นบิลของระบบอื่น — คืนที่ระบบนั้น)",
  REFUND_EXCEEDS: "จำนวนที่คืนเกินจำนวนที่ยังคืนได้ของรายการนี้",
  REFUND_EMPTY: "เลือกรายการที่จะคืนอย่างน้อย 1 รายการ",
  PAYMENT_MISMATCH: "ยอดเงินที่คืนแยกตามวิธีไม่เท่ากับยอดคืน",
  REFUND_METHOD_INVALID: "คืนเงินเป็นมัดจำหรือลงบิลห้องพักไม่ได้ — เลือกเงินสด โอน พร้อมเพย์ หรือบัตร",
  SHIFT_REQUIRED: "คืนเงินสดต้องเปิดกะบนเครื่องนี้ก่อน",
  REASON_REQUIRED: "ระบุเหตุผลการคืนเงิน",
  IDEMPOTENCY_CONFLICT: "มีรายการคืนเงินของรหัสนี้อยู่แล้วแต่รายการ/ยอดไม่ตรงกัน — ตรวจใบคืนเดิมก่อน",
  VALIDATION: "ข้อมูลการคืนเงินไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: RefundRefusalCode, message?: string): RefundRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRefusal = (v: unknown): v is RefundRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต (ร้าน + ระบบ POS ที่ใช้งาน + สาขาที่ผูกระบบ + ผู้ใช้เข้าสาขาได้) ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor; settings: unknown; canRefund: boolean; canView: boolean };
async function scopeOf(db: Db | Tx, ctx: unknown, actorRaw: unknown): Promise<Scope | RefundRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("SALE_NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("NO_PERMISSION");
  const [sys, link] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { settings: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId) return refuse("SALE_NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("SALE_NOT_FOUND");
  const canRefund = evaluate(actor, { module: "pos", action: REFUND_PERMISSION, unitId });
  const canView = canRefund || evaluate(actor, { module: "pos", action: "pos.sale.create", unitId });
  return { tenantId, systemId, unitId, actor, settings: sys.settings, canRefund, canView };
}

/** คำนำหน้าเลขใบคืน (settings.pos.receipt.refundPrefix) — ว่าง/ผิดรูป = "CN" (กันชนกับเลขใบเสร็จขาย YYYYMM-NNNN) */
function refundPrefixOf(settings: unknown): string {
  const s = isRecord(settings) && isRecord(settings.pos) && isRecord(settings.pos.receipt) ? settings.pos.receipt : null;
  const p = s && typeof s.refundPrefix === "string" ? s.refundPrefix.trim() : "";
  return /^[A-Za-z][A-Za-z0-9-]{0,9}$/.test(p) ? p : REFUND_PREFIX_DEFAULT;
}

function bkkPeriod(): string {
  const d = new Date(Date.now() + 7 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ═══════════ ตรวจรูปคำขอ (ก่อนแตะ DB · ลำดับรหัสตามมติ CD7) ═══════════
type CleanInput = {
  saleId: string;
  lines: { lineId: string; qty: number; restock: boolean | null }[];
  payMethods: { type: RefundPayType; amountSatang: number; reference: string | null }[];
  reasonCode: RefundReasonCode;
  reason: string | null;
  deviceId: string | undefined;
  idempotencyKey: string;
};
function cleanInput(raw: unknown, ctx: RegisterCtx): CleanInput | RefundRefusal {
  if (!isRecord(raw)) return refuse("VALIDATION");
  if (!isId(raw.saleId)) return refuse("SALE_NOT_FOUND");
  if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey.trim() || raw.idempotencyKey.length > MAX_KEY) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
  // เหตุผล (CD7): ไม่ส่งรหัส = REASON_REQUIRED · รหัสแปลก = VALIDATION · OTHER ต้องมีข้อความ · ยาวเกิน 200 = VALIDATION
  if (raw.reasonCode === undefined || raw.reasonCode === null || raw.reasonCode === "") return refuse("REASON_REQUIRED");
  if (typeof raw.reasonCode !== "string" || !(REFUND_REASON_CODES as readonly string[]).includes(raw.reasonCode)) return refuse("VALIDATION", "ไม่รู้จักเหตุผลการคืนเงินนี้");
  if (raw.reason !== undefined && raw.reason !== null && typeof raw.reason !== "string") return refuse("VALIDATION", "เหตุผลต้องเป็นข้อความ");
  const reasonRaw = typeof raw.reason === "string" ? raw.reason : "";
  if (reasonRaw.length > REFUND_REASON_MAX) return refuse("VALIDATION", `เหตุผลยาวได้ไม่เกิน ${REFUND_REASON_MAX} ตัวอักษร`);
  const reason = reasonRaw.trim() || null;
  if (raw.reasonCode === "OTHER" && !reason) return refuse("REASON_REQUIRED", "เลือก \"อื่น ๆ\" ต้องพิมพ์เหตุผลด้วย");
  // บรรทัด
  if (!Array.isArray(raw.lines)) return refuse("VALIDATION");
  if (raw.lines.length === 0) return refuse("REFUND_EMPTY");
  if (raw.lines.length > MAX_LINES) return refuse("VALIDATION", `คืนได้ไม่เกิน ${MAX_LINES} รายการต่อครั้ง`);
  const seen = new Set<string>();
  const lines: CleanInput["lines"] = [];
  for (const l of raw.lines as unknown[]) {
    if (!isRecord(l) || !isId(l.lineId)) return refuse("VALIDATION", "ไม่พบรายการนี้ในบิล");
    if (typeof l.qty !== "number" || !Number.isInteger(l.qty) || l.qty < 1) return refuse("VALIDATION", "จำนวนที่คืนต้องเป็นจำนวนเต็มตั้งแต่ 1");
    if (l.restock !== undefined && l.restock !== null && typeof l.restock !== "boolean") return refuse("VALIDATION");
    if (seen.has(l.lineId)) return refuse("VALIDATION", "มีรายการซ้ำในคำขอคืนเงิน");
    seen.add(l.lineId);
    lines.push({ lineId: l.lineId, qty: l.qty, restock: typeof l.restock === "boolean" ? l.restock : null });
  }
  // วิธีคืน
  // F4 ▸ [] ผ่านด่านรูปแบบได้ — ตัดสินในtx หลังคิดยอด: ยอดคืน 0 เท่านั้นที่ไม่มีวิธีคืน (ยอด > 0 + [] = VALIDATION) ◂
  if (!Array.isArray(raw.payMethods)) return refuse("VALIDATION", "ระบุวิธีคืนเงิน");
  if (raw.payMethods.length > MAX_PAY) return refuse("VALIDATION", `แบ่งคืนได้ไม่เกิน ${MAX_PAY} รายการ`);
  const payMethods: CleanInput["payMethods"] = [];
  for (const p of raw.payMethods as unknown[]) {
    if (!isRecord(p)) return refuse("VALIDATION");
    if (p.type === "DEPOSIT" || p.type === "ROOM_CHARGE") return refuse("REFUND_METHOD_INVALID");
    if (typeof p.type !== "string" || !(REFUND_PAY_TYPES as readonly string[]).includes(p.type)) return refuse("VALIDATION", "ไม่รู้จักวิธีคืนเงินนี้");
    if (typeof p.amountSatang !== "number" || !Number.isInteger(p.amountSatang) || p.amountSatang < 1) return refuse("VALIDATION", "ยอดคืนต้องเป็นจำนวนเต็มสตางค์มากกว่า 0");
    if (p.reference !== undefined && p.reference !== null && (typeof p.reference !== "string" || p.reference.length > MAX_REFERENCE)) return refuse("VALIDATION", `เลขอ้างอิงยาวเกิน ${MAX_REFERENCE} ตัวอักษร`);
    payMethods.push({ type: p.type as RefundPayType, amountSatang: p.amountSatang, reference: typeof p.reference === "string" && p.reference.trim() ? p.reference.trim() : null });
  }
  const dev = raw.deviceId !== undefined ? raw.deviceId : ctx.deviceId;
  if (dev !== undefined && dev !== null && !isShiftDeviceId(dev)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
  return {
    saleId: raw.saleId,
    lines,
    payMethods,
    reasonCode: raw.reasonCode as RefundReasonCode,
    reason,
    deviceId: typeof dev === "string" ? dev : undefined,
    idempotencyKey: raw.idempotencyKey,
  };
}

type DocRow = PosSale & { lines: PosSaleLine[]; payments: PosPayment[] };
function docView(r: DocRow): RefundDoc {
  return {
    id: r.id,
    receiptNo: r.receiptNo,
    saleId: r.refSaleId ?? "",
    status: r.status,
    subtotalSatang: r.subtotalSatang,
    serviceChargeSatang: r.serviceChargeSatang,
    vatSatang: r.vatSatang,
    grandTotalSatang: r.grandTotalSatang,
    reasonCode: r.reasonCode,
    reason: r.note,
    shiftId: r.shiftId,
    soldByUserId: r.soldByUserId,
    createdAt: r.createdAt.toISOString(),
    lines: [...r.lines]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((l) => ({ id: l.id, refLineId: l.refLineId, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, restock: l.restock })),
    payments: [...r.payments]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => ({ type: p.type, amountSatang: p.amountSatang, reference: p.reference })),
  };
}

/** payload ของคีย์ซ้ำเท่ากันไหม (P1.6 R6 shape) — บิลเดิม · สาขา/ระบบ · ถุงบรรทัด (บรรทัด|จำนวน|รับคืน) · ถุงวิธีจ่าย (ชนิด|ยอด) */
function samePayload(dup: DocRow, s: Scope, x: CleanInput): boolean {
  const bag = (xs: string[]) => [...xs].sort().join(",");
  return (
    dup.docType === "REFUND" &&
    dup.refSaleId === x.saleId &&
    dup.unitId === s.unitId &&
    dup.systemId === s.systemId &&
    bag(dup.lines.map((l) => `${l.refLineId}|${l.qty}|${l.restock ?? ""}`)) === bag(x.lines.map((l) => `${l.lineId}|${l.qty}|${l.restock ?? ""}`)) &&
    bag(dup.payments.map((p) => `${p.type}|${p.amountSatang}`)) === bag(x.payMethods.map((p) => `${p.type}|${p.amountSatang}`))
  );
}

/** ยอดที่คืนไปแล้วต่อบรรทัดของบิล (จำนวน + สตางค์) + ค่าบริการที่คืนไปแล้ว — จากใบ REFUND ทุกใบของบิลนี้ */
async function priorRefunds(db: Db | Tx, sale: { id: string; tenantId: string; unitId: string }) {
  // refSaleId ยังไม่มี index (P6.1) — กรอง tenantId + unitId ⇒ ใช้ดัชนี (tenantId, unitId, createdAt)
  const docs = await db.posSale.findMany({
    where: { tenantId: sale.tenantId, unitId: sale.unitId, docType: "REFUND", refSaleId: sale.id },
    include: { lines: true, payments: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const qty = new Map<string, number>();
  const amt = new Map<string, number>();
  let sc = 0;
  for (const d of docs) {
    sc += d.serviceChargeSatang;
    for (const l of d.lines) {
      if (!l.refLineId) continue;
      qty.set(l.refLineId, (qty.get(l.refLineId) ?? 0) + l.qty);
      amt.set(l.refLineId, (amt.get(l.refLineId) ?? 0) + l.lineTotalSatang);
    }
  }
  return { docs, qty, amt, sc };
}

/** บิลของระบบอื่น (โรงแรม/ตั๋ว/จอง/ร้านค้าออนไลน์ …) คืนที่ระบบนั้นเอง (คืนเงินของโมดูล + voidSale) — POS คืนเฉพาะบิลของ POS (F1) */
const notPosOwned = (sale: Pick<PosSale, "docType" | "sourceModule" | "giftCardId">) => sale.docType !== "SALE" || sale.sourceModule !== "POS" || !!sale.giftCardId;

/** เหตุที่บิลคืนไม่ได้ (null = คืนได้) — ใบคืน/ยกเลิก/คืนครบ/บิลขายบัตรกำนัล/บิลของระบบอื่น */
function notRefundable(sale: Pick<PosSale, "docType" | "status" | "giftCardId" | "sourceModule">): RefundRefusalCode | null {
  if (notPosOwned(sale) || sale.status !== "PAID") return "SALE_NOT_REFUNDABLE";
  return null;
}

// ═══════════ refundSale (R5 · R6) ═══════════
export async function refundSale(ctx: RegisterCtx, actor: RegisterActor, input: RefundSaleInput, client?: Db): Promise<RefundSaleResult> {
  try {
    const db = client ?? prisma;
    const s0 = await scopeOf(db, ctx, actor);
    if (isRefusal(s0)) return s0;
    let sTok = s0;
    // POS P1.15U ▸ มติ 2: staffToken = ผู้ขอคือคนในโทเคนของเครื่องนี้ (กติกาเดียวกับ submit) · ผิด/หมดอายุ/เครื่องอื่น = STAFF_TOKEN_INVALID ไม่ถอยไปใช้ session ◂
    const tok = isRecord(input) ? input.staffToken : undefined;
    if (tok !== undefined && tok !== null) {
      const dev = isRecord(input) && typeof input.deviceId === "string" ? input.deviceId : isRecord(ctx) && typeof ctx.deviceId === "string" ? ctx.deviceId : undefined;
      const ta = dev ? await staffActorFromToken({ tenantId: s0.tenantId, unitId: s0.unitId, deviceId: dev }, tok, db) : null;
      const st = ta ? await scopeOf(db, ctx, ta) : null;
      if (!st || isRefusal(st)) return { ok: false, code: "STAFF_TOKEN_INVALID", message: "การเข้าใช้งานของพนักงานบนเครื่องนี้หมดอายุหรือไม่ถูกต้อง — ใส่ PIN อีกครั้ง" };
      sTok = st;
    }
    const s = sTok;
    // POS P1.15 ▸ มติ 11: PIN ผู้จัดการ (มี pos.sale.refund) อนุญาตแทนผู้ขอที่ไม่มีสิทธิ์คืน — ผู้ขอต้องยังมี pos.sale.create ◂
    const raw: Record<string, unknown> = isRecord(input) ? input : {};
    const hasPin = raw.managerPin !== undefined && raw.managerPin !== null;
    // fix รอบ 1 F2: PIN ผู้จัดการต้องมาคู่ managerUserId เสมอ
    if (hasPin && (typeof raw.managerUserId !== "string" || !isId(raw.managerUserId))) return refuse("VALIDATION", "เลือกผู้จัดการก่อนใส่ PIN");
    if (!s.canRefund && !(hasPin && evaluate(s.actor, { module: "pos", action: "pos.sale.create", unitId: s.unitId }))) return refuse("NO_PERMISSION");
    const x = cleanInput(input, ctx);
    if (isRefusal(x)) return x;
    // กะของเครื่อง (S5 ของ P1.9) — หาก่อนเปิด tx (อาจบังคับปิดกะค้างเกินเวลา) แล้วล็อกซ้ำในtx
    const shiftSettings = parseShiftSettings(s.settings);
    const sh = await resolveRegisterShift(db, s, x.deviceId);
    const preShiftId = sh.ok ? sh.shiftId : null;
    const commit = (opts: RefundTxOpts) => runRefundTx(db, s, x, preShiftId, shiftSettings.requiredRegister, opts);

    // POS P1.15 ▸ R5 + CD4: PIN ผู้จัดการ = คืนทันที (แม้มีกติกา) · ยกเลิกคำขอคืนเงินที่รอของบิลนี้ · audit pin_override ◂
    if (hasPin) {
      const dup = await commit({ mode: "plan" });
      if (dup.kind === "result") return dup.result;
      const v = await verifyManagerPin({ tenantId: s.tenantId, unitId: s.unitId, deviceId: x.deviceId ?? null }, { managerPin: raw.managerPin, managerUserId: raw.managerUserId });
      if (v.ok === false) return pinRefusal(v);
      if (!evaluate(v.actor, { module: "pos", action: REFUND_PERMISSION, unitId: s.unitId })) return refuse("NO_PERMISSION", "PIN นี้ไม่มีสิทธิ์คืนเงิน — ใช้ PIN ของผู้จัดการ");
      const done = await commit({ mode: "commit", auditActorId: v.actor.userId, auditExtra: { via: "pin_override", requestedByUserId: s.actor.userId } });
      if (done.kind !== "result" || !done.result.ok || done.result.duplicated) return done.kind === "result" ? done.result : refuse("UNKNOWN");
      const cancelled = await cancelOpenPosRequest(s.tenantId, "POS_REFUND", x.saleId);
      await auditPinOverride({ tenantId: s.tenantId, action: "POS_REFUND", requestId: cancelled, byUserId: v.actor.userId, forUserId: s.actor.userId, targetType: "PosSale", targetId: done.result.refund.id, extra: { saleId: x.saleId } });
      return done.result;
    }

    // POS P1.15 ▸ R5: กติกา POS_REFUND (ยอดคืน) = ยื่นคำขอพร้อม snapshot · มีคำขอรออยู่ของบิลนี้ = PENDING_APPROVAL · ไม่มีกติกา = ทางเดิม ◂
    const plan = await commit({ mode: "plan" });
    if (plan.kind === "result") return plan.result;
    const ap = await submitPosApproval({
      tenantId: s.tenantId,
      unitId: s.unitId,
      systemId: s.systemId,
      kind: "POS_REFUND",
      ref: x.saleId,
      entityIdOf: (n) => (n === 1 ? `${x.saleId}:${x.idempotencyKey}` : `${x.saleId}:${x.idempotencyKey}:${n}`),
      amountSatang: plan.grandSatang,
      requestedById: s.actor.userId,
      payload: {
        saleId: x.saleId,
        lines: x.lines,
        payMethods: x.payMethods,
        reasonCode: x.reasonCode,
        reason: x.reason,
        idempotencyKey: x.idempotencyKey,
        deviceId: x.deviceId ?? null,
        refundSatang: plan.grandSatang,
        title: `คืนเงิน ฿${(plan.grandSatang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`,
      },
    });
    if (ap.status !== "AUTO") {
      const code = ap.status === "PENDING" ? "PENDING_APPROVAL" : "APPROVAL_REQUIRED";
      return { ok: false, code, message: POS_APPROVAL_MESSAGE[code], requestId: ap.requestId };
    }
    const done = await commit({ mode: "commit" });
    return done.kind === "result" ? done.result : refuse("UNKNOWN");
  } catch (e) {
    console.error("[pos/refund] refundSale", e);
    return refuse("UNKNOWN");
  }
}

/** P1.15: โหมดของธุรกรรมคืนเงิน — plan = ตรวจครบ + คิดยอด แล้วไม่เขียน (ยอดสำหรับคำขออนุมัติ) · commit = ออกใบคืน */
type RefundTxOpts = {
  mode: "plan" | "commit";
  /** ผู้กระทำใน AuditLog pos.sale.refund (PIN ผู้จัดการ / ผู้ตัดสิน) — ไม่ส่ง = ผู้ทำรายการ */
  auditActorId?: string;
  auditExtra?: Record<string, unknown>;
};
type RefundTxOut = { kind: "result"; result: RefundSaleResult } | { kind: "plan"; grandSatang: number };

async function runRefundTx(db: Db, s: Scope, x: CleanInput, preShiftId: string | null, shiftRequired: boolean, opts: RefundTxOpts): Promise<RefundTxOut> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await db.$transaction((tx) => refundInTx(tx, s, x, preShiftId, shiftRequired, opts), { timeout: 20_000, maxWait: 10_000 });
      if (res.kind === "result" && res.result.ok && !res.result.duplicated) scheduleDrain();
      return res;
    } catch (e) {
      if (attempt < 2 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

/**
 * POS P1.15 ▸ R6 + มติ 13: ออกใบคืนของคำขอ POS_REFUND ที่อนุมัติแล้ว (ผู้เรียก: pos-approval-consumer.ts) — คีย์ `approval-<requestId>` ·
 * นอกกะ (shiftId null แบบคืนเงินนอกหน้าขาย) · ผู้ทำรายการบนใบ = ผู้ขอเดิม · audit actor = ผู้ตัดสิน + via approval ·
 * สิทธิ์ = การอนุมัติ (ไม่ตรวจสิทธิ์ของผู้ตัดสินซ้ำ) · เล่นซ้ำ = ใบเดิม (คีย์กันซ้ำ)
 */
export async function refundApproved(
  target: { tenantId: string; systemId: string; unitId: string },
  input: RefundSaleInput,
  by: { requestId: string; deciderId: string; requestedById: string },
  client?: Db,
): Promise<RefundSaleResult> {
  try {
    const db = client ?? prisma;
    const sys = await db.appSystem.findFirst({ where: { id: target.systemId, tenantId: target.tenantId, type: "POS" }, select: { settings: true } });
    if (!sys) return refuse("SALE_NOT_FOUND");
    const s: Scope = {
      tenantId: target.tenantId,
      systemId: target.systemId,
      unitId: target.unitId,
      actor: { userId: by.requestedById, role: "STAFF", unitAccess: [target.unitId], permissions: {} },
      settings: sys.settings,
      canRefund: true,
      canView: true,
    };
    const x = cleanInput({ ...input, idempotencyKey: `approval-${by.requestId}`, deviceId: undefined }, { tenantId: target.tenantId, systemId: target.systemId, unitId: target.unitId });
    if (isRefusal(x)) return x;
    const out = await runRefundTx(db, s, x, null, false, { mode: "commit", auditActorId: by.deciderId, auditExtra: { via: "approval", requestId: by.requestId, requestedByUserId: by.requestedById } });
    return out.kind === "result" ? out.result : refuse("UNKNOWN");
  } catch (e) {
    console.error("[pos/refund] refundApproved", e);
    return refuse("UNKNOWN");
  }
}

async function refundInTx(tx: Tx, s: Scope, x: CleanInput, preShiftId: string | null, shiftRequired: boolean, opts: RefundTxOpts = { mode: "commit" }): Promise<RefundTxOut> {
  const r = await refundInTxInner(tx, s, x, preShiftId, shiftRequired, opts);
  return "kind" in r ? r : { kind: "result", result: r };
}

async function refundInTxInner(tx: Tx, s: Scope, x: CleanInput, preShiftId: string | null, shiftRequired: boolean, opts: RefundTxOpts): Promise<RefundSaleResult | RefundTxOut> {
  // คีย์เดียวกันพร้อมกัน = เรียงคิว (แบบ createSale R2 F4) ก่อนค้นคีย์ซ้ำ
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${s.tenantId}::text || ':' || ${x.idempotencyKey}::text))) l`;
  const dup = await tx.posSale.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey: x.idempotencyKey } },
    include: { lines: true, payments: true },
  });
  if (dup) {
    if (!samePayload(dup, s, x)) return refuse("IDEMPOTENCY_CONFLICT");
    const orig = await tx.posSale.findFirst({ where: { id: x.saleId, tenantId: s.tenantId }, select: { id: true, status: true, refundedSatang: true } });
    return { ok: true, refund: docView(dup), sale: { id: x.saleId, status: orig?.status ?? "PAID", refundedSatang: orig?.refundedSatang ?? 0 }, duplicated: true };
  }

  // สิทธิ์คืนของบิล ณ ตอนรับคำขอ (อ่านก่อนล็อก): ใบคืน/ยกเลิก/คืนครบแล้ว/บิลขายบัตรกำนัล = SALE_NOT_REFUNDABLE
  const pre = await tx.posSale.findFirst({
    where: { id: x.saleId, tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId },
    select: { docType: true, status: true, giftCardId: true, sourceModule: true },
  });
  if (!pre) return refuse("SALE_NOT_FOUND");
  const nr0 = notRefundable(pre);
  if (nr0) return refuse(nr0);
  // ล็อกบิลเดิม (R5): สองคนคืนบรรทัดเดียวกันพร้อมกัน — คนหลังเห็นจำนวนที่คืนไปแล้วหลังคนแรก commit
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PosSale" WHERE id = ${x.saleId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "systemId" = ${s.systemId} FOR UPDATE`;
  if (!locked.length) return refuse("SALE_NOT_FOUND");
  const sale = await tx.posSale.findUnique({ where: { id: x.saleId }, include: { lines: { orderBy: { id: "asc" } } } });
  if (!sale) return refuse("SALE_NOT_FOUND");
  // หลังล็อก: ถูกยกเลิกระหว่างรอ = คืนไม่ได้ · ถูกคืนครบระหว่างรอ (REFUNDED) = เดินต่อ ⇒ จำนวนที่เหลือ 0 = REFUND_EXCEEDS (คนที่แพ้การแข่ง)
  const nr = sale.status === "REFUNDED" && !notPosOwned(sale) ? null : notRefundable(sale);
  if (nr) return refuse(nr);

  const prior = await priorRefunds(tx, sale);
  const byId = new Map(sale.lines.map((l) => [l.id, l]));
  for (const r of x.lines) if (!byId.has(r.lineId)) return refuse("VALIDATION", "ไม่พบรายการนี้ในบิล");
  for (const r of x.lines) {
    const l = byId.get(r.lineId)!;
    if (r.qty > l.qty - (prior.qty.get(l.id) ?? 0)) return refuse("REFUND_EXCEEDS", `"${l.name}" คืนได้อีก ${Math.max(0, l.qty - (prior.qty.get(l.id) ?? 0))} หน่วย`);
  }

  // ── ยอดคืน (R5 · CD4 · CD5) ──
  const nets = lineNets(
    sale.lines.map((l) => l.lineTotalSatang),
    sale.serviceChargeSatang,
    sale.grandTotalSatang,
  );
  const netOf = new Map(sale.lines.map((l, i) => [l.id, nets[i]!]));
  const netTotal = nets.reduce((a, b) => a + b, 0);
  const reqQty = new Map(x.lines.map((r) => [r.lineId, r.qty]));
  const full = sale.lines.every((l) => (prior.qty.get(l.id) ?? 0) + (reqQty.get(l.id) ?? 0) >= l.qty);
  const amounts = x.lines.map((r) => {
    const l = byId.get(r.lineId)!;
    return refundLineAmount(netOf.get(l.id)!, l.qty, prior.qty.get(l.id) ?? 0, prior.amt.get(l.id) ?? 0, r.qty);
  });
  const linesSum = amounts.reduce((a, b) => a + b, 0);
  const sc = refundServiceCharge(sale.serviceChargeSatang, linesSum, netTotal, prior.sc, full);
  const grand = linesSum + sc;
  if (x.payMethods.length === 0 && grand !== 0) return refuse("VALIDATION", "ระบุวิธีคืนเงิน");
  const paySum = x.payMethods.reduce((t, p) => t + p.amountSatang, 0);
  if (paySum !== grand) return refuse("PAYMENT_MISMATCH", `ยอดเงินที่คืน ${paySum} ไม่เท่ากับยอดคืน ${grand} (สตางค์)`);
  // POS P1.15 ▸ โหมดวางแผน: ตรวจครบแล้วคืนยอด (ไม่เขียนอะไร · กะไม่บังคับ — คำขออนุมัติคืนนอกกะ มติ 13) ◂
  if (opts.mode === "plan") return { kind: "plan", grandSatang: grand };

  // ── กะ (R5): กะเปิดของเครื่องนี้ (ล็อก FOR SHARE แบบ createSale ⇒ ปิดกะรอใบคืนที่กำลังบันทึก) · ไม่มี + บังคับกะ + คืนเงินสด = SHIFT_REQUIRED ──
  let shiftId: string | null = null;
  if (preShiftId) {
    const rows = await tx.$queryRaw<{ status: string; tenantId: string; unitId: string; systemId: string }[]>`
      SELECT status::text AS status, "tenantId", "unitId", "systemId" FROM "PosShift" WHERE id = ${preShiftId} FOR SHARE`;
    const r = rows[0];
    if (r && r.status === "OPEN" && r.tenantId === s.tenantId && r.unitId === s.unitId && r.systemId === s.systemId) shiftId = preShiftId;
  }
  if (!shiftId && shiftRequired && x.payMethods.some((p) => p.type === "CASH")) return refuse("SHIFT_REQUIRED");

  // ── VAT ระดับเอกสาร (COMMON 1): อัตราของ POS ตอนนี้ · บิลเดิมไม่มี VAT = ใบคืนไม่มี VAT ──
  //   F6 ▸ ใบที่ทำให้ครบทั้งบิล = VAT ที่เหลือของบิล (VAT บิล − Σ VAT ใบคืนก่อนหน้า · ไม่ติดลบ) ⇒ Σ VAT ใบคืน = VAT บิลเป๊ะ ◂
  let vat = 0;
  if (sale.vatSatang > 0 && full) {
    vat = Math.min(grand, Math.max(0, sale.vatSatang - prior.docs.reduce((t, d) => t + d.vatSatang, 0)));
  } else if (sale.vatSatang > 0) {
    vat = splitIncludedVat(grand, await posVatRateBp(tx, s.tenantId, s.systemId)).vatSatang;
  }

  // ── เลขใบคืน (R4 · O2): ตัวนับใหม่ต่อสาขา/ชนิด/เดือน — INSERT … ON CONFLICT ⇒ คืนพร้อมกันหลายใบบนแถวใหม่ไม่ชน unique ──
  const period = bkkPeriod();
  const ctr = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "PosDocCounter" ("id", "tenantId", "unitId", "docType", "period", "seq")
    VALUES (${randomUUID()}, ${s.tenantId}, ${s.unitId}, 'REFUND'::"PosSaleDocType", ${period}, 1)
    ON CONFLICT ("unitId", "docType", "period") DO UPDATE SET "seq" = "PosDocCounter"."seq" + 1
    RETURNING "seq"`;
  const receiptNo = `${refundPrefixOf(s.settings)}${period}-${String(Number(ctr[0]!.seq)).padStart(4, "0")}`;

  const refund = await tx.posSale.create({
    data: {
      tenantId: s.tenantId,
      unitId: s.unitId,
      systemId: s.systemId,
      // 🔴 ไม่ผูกสมาชิก/ต้นทาง: ตัวอ่านเดิมที่กรอง memberId / sourceId (ประวัติสมาชิก · ระดับ · บิลของการจอง) ต้องไม่เห็นใบคืนเป็น "การซื้อ"
      memberId: null,
      sourceModule: sale.sourceModule,
      sourceId: null,
      idempotencyKey: x.idempotencyKey,
      receiptNo,
      publicToken: newReceiptToken(), // POS P1.11 ▸ R1 ◂
      status: "PAID",
      docType: "REFUND",
      refSaleId: sale.id,
      reasonCode: x.reasonCode,
      subtotalSatang: linesSum,
      discountSatang: 0,
      vatSatang: vat,
      grandTotalSatang: grand,
      serviceChargeSatang: sc,
      tipSatang: 0,
      note: x.reason,
      paidAt: new Date(),
      shiftId,
      soldByUserId: s.actor.userId,
    },
  });
  const lineRows = x.lines.map((r, i) => {
    const l = byId.get(r.lineId)!;
    const amt = amounts[i]!;
    // ราคาต่อหน่วยเดิม · ส่วนต่าง = ส่วนลด (ไม่ติดลบ — ถ้าเศษทำให้ยอดเกินราคาเต็มให้ยกราคาต่อหน่วยขึ้นแทน)
    const unit = l.unitPriceSatang * r.qty >= amt ? l.unitPriceSatang : Math.ceil(amt / r.qty);
    return {
      tenantId: s.tenantId,
      unitId: s.unitId,
      saleId: refund.id,
      name: l.name,
      qty: r.qty,
      unitPriceSatang: unit,
      discountSatang: unit * r.qty - amt,
      lineTotalSatang: amt,
      itemId: l.itemId,
      serviceId: l.serviceId,
      productId: l.productId,
      weightGrams: l.weightGrams,
      refLineId: l.id,
      restock: r.restock,
    };
  });
  await tx.posSaleLine.createMany({ data: lineRows });
  await tx.posPayment.createMany({
    data: x.payMethods.map((p) => ({ tenantId: s.tenantId, unitId: s.unitId, saleId: refund.id, type: p.type as PosPayType, amountSatang: p.amountSatang, reference: p.reference })),
  });
  const updated = await tx.posSale.update({
    where: { id: sale.id },
    data: { refundedSatang: { increment: grand }, ...(full ? { status: "REFUNDED" as const } : {}) },
    select: { status: true, refundedSatang: true },
  });

  // คูปอง (spec :913): คืนสิทธิ์เฉพาะคืนครบทั้งบิล · คืนบางส่วนไม่คืน
  if (full) {
    const redeemed = await tx.couponRedemption.findMany({
      where: { tenantId: s.tenantId, refType: "PosSale", refId: sale.id, status: { in: ["RESERVED", "REDEEMED"] } },
      select: { systemId: true },
      distinct: ["systemId"],
    });
    for (const { systemId } of redeemed) await coupon.release({ tenantId: s.tenantId, systemId, refType: "PosSale", refId: sale.id, reason: "คืนเงินครบทั้งบิล POS" }, tx);
  }

  await emitOutbox(tx, {
    tenantId: s.tenantId,
    type: "pos.sale.refunded",
    idempotencyKey: `PosSale#${refund.id}#REFUNDED`,
    payload: {
      saleId: sale.id,
      refundSaleId: refund.id,
      sourceModule: sale.sourceModule,
      full,
      lines: x.lines.map((r, i) => ({ refLineId: r.lineId, qty: r.qty, amountSatang: amounts[i]!, restock: r.restock, itemId: byId.get(r.lineId)!.itemId })),
      payMethods: x.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
    },
    systemId: s.systemId,
    unitId: s.unitId,
  });
  // AuditLog (เงินออกจากร้าน) — ในtx เดียวกับใบคืน (แบบ stock-count/held-cart ของ POS)
  await tx.auditLog.create({
    data: {
      tenantId: s.tenantId,
      actorType: "USER",
      actorId: opts.auditActorId ?? s.actor.userId, // POS P1.15 ▸ PIN ผู้จัดการ / ผู้ตัดสินของสายอนุมัติ ◂
      action: "pos.sale.refund",
      targetType: "PosSale",
      targetId: refund.id,
      after: {
        saleId: sale.id,
        receiptNo,
        saleReceiptNo: sale.receiptNo,
        grandTotalSatang: grand,
        full,
        reasonCode: x.reasonCode,
        payMethods: x.payMethods.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
        ...(opts.auditExtra ?? {}),
      } as Prisma.InputJsonValue,
    },
  });

  const doc = await tx.posSale.findUnique({ where: { id: refund.id }, include: { lines: true, payments: true } });
  return { ok: true, refund: docView(doc!), sale: { id: sale.id, status: updated.status, refundedSatang: updated.refundedSatang } };
}

// ═══════════ saleForRefund (R9) — read model ของจอคืนเงิน (P1.16) · อ่านอย่างเดียว ═══════════
export async function saleForRefund(ctx: RegisterCtx, actor: RegisterActor, input: { saleId: string }, client?: Db): Promise<SaleForRefundResult> {
  try {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.canView) return refuse("NO_PERMISSION");
    const saleId = isRecord(input) ? input.saleId : undefined;
    if (!isId(saleId)) return refuse("SALE_NOT_FOUND");
    const sale = await db.posSale.findFirst({
      where: { id: saleId, tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, docType: "SALE" },
      include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } },
    });
    if (!sale) return refuse("SALE_NOT_FOUND");
    // F1 ▸ บิลของระบบอื่นไม่เปิดจอคืนเงินของ POS เลย (คืนที่ระบบต้นทาง) ◂
    if (sale.sourceModule !== "POS") return refuse("SALE_NOT_REFUNDABLE");
    const prior = await priorRefunds(db, sale);
    const nets = lineNets(
      sale.lines.map((l) => l.lineTotalSatang),
      sale.serviceChargeSatang,
      sale.grandTotalSatang,
    );
    const lines: SaleForRefundLine[] = sale.lines.map((l, i) => {
      const rq = prior.qty.get(l.id) ?? 0;
      const comps = Array.isArray(l.components) && l.components.length > 0;
      return {
        lineId: l.id,
        name: l.name,
        qty: l.qty,
        unitPriceSatang: l.unitPriceSatang,
        discountSatang: l.discountSatang,
        lineTotalSatang: l.lineTotalSatang,
        netSatang: nets[i]!,
        refundedQty: rq,
        refundedSatang: prior.amt.get(l.id) ?? 0,
        refundableQty: Math.max(0, l.qty - rq),
        itemId: l.itemId,
        productId: l.productId,
        serviceId: l.serviceId,
        weightGrams: l.weightGrams,
        isBundle: comps,
        stocked: !!l.itemId || comps,
      };
    });
    const nr = notRefundable(sale);
    const accounting = await posSaleAccountingRef({ tenantId: s.tenantId, sourceSystemId: s.systemId, refId: sale.id });
    return {
      ok: true,
      sale: {
        id: sale.id,
        receiptNo: sale.receiptNo,
        status: sale.status,
        sourceModule: sale.sourceModule,
        createdAt: sale.createdAt.toISOString(),
        grandTotalSatang: sale.grandTotalSatang,
        refundedSatang: sale.refundedSatang,
        serviceChargeSatang: sale.serviceChargeSatang,
        serviceChargeRefundedSatang: prior.sc,
        tipSatang: sale.tipSatang,
        vatSatang: sale.vatSatang,
        netTotalSatang: nets.reduce((a, b) => a + b, 0),
        shiftId: sale.shiftId,
        refundable: !nr,
        notRefundableCode: nr,
      },
      lines,
      payments: sale.payments.map((p) => ({ type: p.type, amountSatang: p.amountSatang, reference: p.reference })),
      refunds: prior.docs.map((d) => ({ id: d.id, receiptNo: d.receiptNo, grandTotalSatang: d.grandTotalSatang, createdAt: d.createdAt.toISOString(), reasonCode: d.reasonCode, reason: d.note, soldByUserId: d.soldByUserId })),
      member: sale.memberId ? { memberId: sale.memberId, pointsEarned: sale.pointEarned } : null,
      accounting,
      canRefund: s.canRefund,
    };
  } catch (e) {
    console.error("[pos/refund] saleForRefund", e);
    return refuse("UNKNOWN");
  }
}

/** POS P1.15 ▸ คำปฏิเสธของ PIN ผู้จัดการ → ชนิดผลของไฟล์นี้ (PIN_* / DEVICE_REVOKED ส่งต่อ · ไม่ระบุผู้จัดการ = VALIDATION · อื่น = UNKNOWN) ◂ */
function pinRefusal(v: { code: string; message: string }): { ok: false; code: "PIN_INVALID" | "PIN_LOCKED" | "DEVICE_REVOKED"; message: string } | ReturnType<typeof refuse> {
  if (v.code === "PIN_INVALID" || v.code === "PIN_LOCKED" || v.code === "DEVICE_REVOKED") return { ok: false, code: v.code, message: v.message };
  return v.code === "VALIDATION" ? refuse("VALIDATION", v.message) : refuse("UNKNOWN");
}
