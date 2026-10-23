// POS P3.6 ▸ credit.ts — วางบิล (เครดิตเทอม) ของลูกค้าองค์กร (R4 R6 R14 · มติ 1 2 6 · CD-2 CD-4 CD-9) ◂
//
// 🔴 ผู้เขียนเดียวของตาราง PosCreditAccount (ข้อสอบ ST3) · สิทธิ์ตั้งวงเงิน = `pos.credit.manage` (OWNER/MANAGER ตามบทบาท · STAFF ต้องได้คีย์)
// 🔴 ภาพหนี้ (exposure · CD-9) = เอกสารค้างของบริษัทในสมุดที่ผูก (หักใบลดหนี้ที่มีผล · อ่านผ่าน facade บัญชี) + บิล ON_ACCOUNT ที่ "ยังไม่มีเอกสาร"
//    (คิวยังไม่ระบาย) − ยอดคืน ON_ACCOUNT ของบิลเหล่านั้น · บิล VOIDED ที่เอกสารยังไม่ถูกยกเลิก (คิวช้า) ไม่นับ
// 🔴 ความเป็นส่วนตัว (R14): audit/ผลลัพธ์มีแต่ id + สตางค์ · ไม่มีชื่อ/เบอร์/อีเมล/ที่อยู่/เลขภาษี/หมายเหตุ · ตัวเลขวงเงินเฉพาะผู้ถือ pos.credit.manage
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { evaluate, canAccessUnit } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { posCreditBook, posCreditExposureParts } from "@/lib/modules/account";
import { posCreditRefundRoom } from "@/lib/modules/account"; // POS P3.6 fix2 H2 ◂
import { posCreditSettings } from "./settings-shared";
import { canOnAllLinkedUnits } from "./settings-general"; // POS P5.2 ▸ H6b ◂
import {
  POS_CREDIT_LIMIT_MAX,
  POS_CREDIT_NOTE_MAX,
  POS_CREDIT_PERMISSION,
  POS_CREDIT_TERM_MAX,
  creditDueDate,
  posCreditLockKey,
  resolveCreditTermDays,
  type ListCreditAccountsResult,
  type PosCreditAccountView,
  type PosCreditRefusal,
  type PosCreditRefusalCode,
  type PosCreditTerms,
  type RegisterCreditStatusResult,
  type SaveCreditAccountInput,
  type SaveCreditAccountResult,
} from "./credit-shared";
import type { RegisterActor } from "./register-shared";

type Db = PrismaClient | Prisma.TransactionClient;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const MSG: Record<PosCreditRefusalCode, string> = {
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งวงเงินลูกค้าเครดิต — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลวงเงิน/เทอมไม่ถูกต้อง — วงเงินต้องมากกว่า 0 และเทอม 0–365 วัน",
  NOT_FOUND: "ไม่พบจุดขายนี้ในร้านที่เปิดอยู่",
  CUSTOMER_INVALID: "ลูกค้ารายนี้ไม่ใช่บริษัท/นิติบุคคลของร้านนี้",
  INTERNAL: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: PosCreditRefusalCode, message?: string): PosCreditRefusal => ({ ok: false, code, message: message ?? MSG[code] });
function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}
async function guard<T>(name: string, body: () => Promise<T>): Promise<T | PosCreditRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/credit] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}
/** ผู้ถือ pos.credit.manage (ที่สาขาเมื่อระบุ) — OWNER/MANAGER ตามบทบาท (evaluate) */
export function canManageCredit(actor: RegisterActor | null, unitId?: string): boolean {
  return !!actor && evaluate(actor, { module: "pos", action: POS_CREDIT_PERMISSION, ...(unitId ? { unitId } : {}) });
}
const viewOf = (r: { id: string; partyId: string; limitSatang: number; termDays: number | null; active: boolean; note: string | null; updatedAt: Date }): PosCreditAccountView => ({
  id: r.id,
  partyId: r.partyId,
  limitSatang: r.limitSatang,
  termDays: r.termDays,
  active: r.active,
  note: r.note,
  updatedAt: r.updatedAt.toISOString(),
});

/** Party ของร้านนี้ที่เป็นบริษัท (kind COMPANY · ยังไม่ถูกรวม) — R5 CUSTOMER_INVALID */
export async function isCompanyParty(db: Db, tenantId: string, partyId: unknown): Promise<boolean> {
  if (!isId(partyId)) return false;
  const p = await db.party.findFirst({ where: { id: partyId, tenantId }, select: { kind: true, mergedIntoId: true } });
  return !!p && p.kind === "COMPANY" && !p.mergedIntoId;
}

async function posSystemOk(db: Db, tenantId: string, systemId: unknown): Promise<boolean> {
  return isId(systemId) && !!(await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }));
}

// ═══════════ R4 ตั้งวงเงิน (ผู้เขียนเดียว) ═══════════
/** บันทึกบัญชีเครดิตของบริษัท (upsert ต่อ (ระบบ POS · Party)) · audit pos.credit.account_updated (id + ตัวเลขเท่านั้น) */
export async function saveCreditAccount(ctx: { tenantId: string; systemId: string }, actorRaw: RegisterActor, input: SaveCreditAccountInput): Promise<SaveCreditAccountResult> {
  return guard("saveCreditAccount", async (): Promise<SaveCreditAccountResult> => {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !(await posSystemOk(prisma, ctx.tenantId, ctx.systemId))) return refuse("NOT_FOUND");
    const actor = actorOf(actorRaw);
    if (!canManageCredit(actor)) return refuse("PERMISSION_DENIED");
    // POS P5.2 ▸ H6b (มติ H6/F6): บัญชีเครดิตใช้ทั้งระบบ POS ⇒ ต้องมี pos.credit.manage ครบทุกสาขาที่ผูก (OWNER / "*" / ทุกสาขา) — ผู้จัดการสาขาเดียว = PERMISSION_DENIED ◂
    if (!(await canOnAllLinkedUnits(prisma, { tenantId: ctx.tenantId, systemId: ctx.systemId }, actor!, POS_CREDIT_PERMISSION))) return refuse("PERMISSION_DENIED");
    if (!isRecord(input)) return refuse("VALIDATION");
    const limit = input.limitSatang;
    const term = input.termDays === undefined ? null : input.termDays;
    if (!(typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= POS_CREDIT_LIMIT_MAX)) return refuse("VALIDATION");
    if (term !== null && !(typeof term === "number" && Number.isInteger(term) && term >= 0 && term <= POS_CREDIT_TERM_MAX)) return refuse("VALIDATION");
    if (input.active !== undefined && typeof input.active !== "boolean") return refuse("VALIDATION");
    const note = input.note === undefined || input.note === null ? null : typeof input.note === "string" && input.note.length <= POS_CREDIT_NOTE_MAX ? input.note.trim() || null : undefined;
    if (note === undefined) return refuse("VALIDATION", `หมายเหตุยาวได้ไม่เกิน ${POS_CREDIT_NOTE_MAX} ตัวอักษร`);
    if (!(await isCompanyParty(prisma, ctx.tenantId, input.partyId))) return refuse("CUSTOMER_INVALID");
    const partyId = input.partyId;
    const out = await prisma.$transaction(async (tx) => {
      const before = await tx.posCreditAccount.findUnique({ where: { systemId_partyId: { systemId: ctx.systemId, partyId } } });
      if (before && before.tenantId !== ctx.tenantId) return null; // ระบบของร้านอื่น (เป็นไปไม่ได้เพราะตรวจระบบแล้ว) — กันไว้
      const data = { limitSatang: limit, termDays: term, active: input.active ?? before?.active ?? true, note, updatedById: actor!.userId };
      const row = before
        ? await tx.posCreditAccount.update({ where: { id: before.id }, data })
        : await tx.posCreditAccount.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, partyId, ...data } });
      return { before, row };
    });
    if (!out) return refuse("NOT_FOUND");
    const nums = (r: { id: string; partyId: string; limitSatang: number; termDays: number | null; active: boolean }) => ({ accountId: r.id, partyId: r.partyId, limitSatang: r.limitSatang, termDays: r.termDays, active: r.active });
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: actor!.userId,
      action: "pos.credit.account_updated",
      targetType: "PosCreditAccount",
      targetId: out.row.id,
      ...(out.before ? { before: nums(out.before) } : {}),
      after: nums(out.row),
    });
    return { ok: true, account: viewOf(out.row) };
  });
}

/** รายการบัญชีเครดิตของระบบ POS นี้ (ผู้ถือ pos.credit.manage เท่านั้น) */
export async function listCreditAccounts(ctx: { tenantId: string; systemId: string }, actorRaw: RegisterActor): Promise<ListCreditAccountsResult> {
  return guard("listCreditAccounts", async (): Promise<ListCreditAccountsResult> => {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !(await posSystemOk(prisma, ctx.tenantId, ctx.systemId))) return refuse("NOT_FOUND");
    if (!canManageCredit(actorOf(actorRaw))) return refuse("PERMISSION_DENIED");
    const rows = await prisma.posCreditAccount.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 1000 });
    return { ok: true, items: rows.map(viewOf) };
  });
}

// ═══════════ CD-9 ภาพหนี้ ═══════════
/**
 * ภาพหนี้ (สตางค์) ของบริษัทบนระบบ POS นี้ — null = POS ไม่ผูกสมุดบัญชี · db = tx ของ createSale (ผู้เรียกถือล็อกวงเงินแล้ว) หรือ prisma
 * ลำดับอ่าน: บิล ON_ACCOUNT ของบริษัท (ทุกสถานะ) → คำสั่งเดียวของสมุด (เอกสารค้าง + บิลที่มีเอกสารแล้ว) ⇒ บิลที่ถูกระบายระหว่างนั้นนับครั้งเดียว
 */
/** fix2 H6: หน้าต่างบิลวางบิลที่อ่านตอนคิดภาพหนี้ (บิลค้างระบาย/ใบแจ้งหนี้ที่ผูกผิดคนก่อน F1) — ใบแจ้งหนี้ที่ค้างของผู้ติดต่อบริษัทนับทุกอายุอยู่แล้ว */
export const CREDIT_EXPOSURE_WINDOW_DAYS = 90;
export async function creditExposureSatang(db: Db, s: { tenantId: string; systemId: string; partyId: string }): Promise<number | null> {
  // fix2 H6: อ่านเฉพาะบิล 90 วันล่าสุด (เดิมทุกบิลของบริษัท ⇒ IN (…) ใหญ่เกินขีด bind ของ Postgres ที่ ~32k บิล = ขายวางบิลไม่ได้)
  const since = new Date(Date.now() - CREDIT_EXPOSURE_WINDOW_DAYS * 86_400_000);
  const bills = await db.$queryRaw<{ id: string; status: string; amt: number }[]>`
    SELECT s.id, s.status::text AS status, COALESCE(SUM(p."amountSatang"), 0)::int AS amt
    FROM "PosSale" s JOIN "PosPayment" p ON p."saleId" = s.id AND p."type"::text = 'ON_ACCOUNT'
    WHERE s."tenantId" = ${s.tenantId} AND s."systemId" = ${s.systemId} AND s."customerPartyId" = ${s.partyId} AND s."docType"::text = 'SALE' AND s."createdAt" >= ${since}
    GROUP BY s.id, s.status`;
  const parts = await posCreditExposureParts({ tenantId: s.tenantId, sourceSystemId: s.systemId, partyId: s.partyId, saleRefIds: bills.map((b) => b.id) }, db as Prisma.TransactionClient);
  if (!parts) return null;
  const voided = new Set(bills.filter((b) => b.status === "VOIDED").map((b) => b.id));
  const withDoc = new Set(parts.docRefIds);
  let exposure = parts.open.filter((d) => !(d.refType === "PosSale" && d.refId && voided.has(d.refId))).reduce((t, d) => t + d.outstandingSatang, 0);
  const lag = bills.filter((b) => b.status !== "VOIDED" && !withDoc.has(b.id));
  if (lag.length) {
    const ids = lag.map((b) => b.id);
    const back = await db.posSale.findMany({ where: { tenantId: s.tenantId, docType: "REFUND", refSaleId: { in: ids } }, select: { refSaleId: true, payments: { where: { type: "ON_ACCOUNT" }, select: { amountSatang: true } } } });
    const refunded = new Map<string, number>();
    for (const r of back) if (r.refSaleId) refunded.set(r.refSaleId, (refunded.get(r.refSaleId) ?? 0) + r.payments.reduce((t, p) => t + Math.abs(p.amountSatang), 0));
    for (const b of lag) exposure += Math.max(0, b.amt - (refunded.get(b.id) ?? 0));
  }
  return exposure;
}

// ═══════════ R6 ตรวจวงเงินในธุรกรรมของบิล (createSale เรียก · ไม่โยน — ผู้เรียกแปลงเป็น PosSaleError) ═══════════
export type SaleCreditDecision =
  | { ok: true; creditTerms: PosCreditTerms; override: { byUserId: string; overSatang: number } | null }
  | { ok: false; code: "CREDIT_NOT_ALLOWED" | "CREDIT_TERM_ZERO" | "CREDIT_LIMIT_EXCEEDED"; message: string; limitSatang?: number; exposureSatang?: number };
/**
 * บัญชีเครดิต active ของ (ระบบ · Party) + POS ผูกสมุด (ไม่ผูก = CREDIT_NOT_ALLOWED — ลูกหนี้ต้องมีสมุด) → เทอม (มติ 6 · 0 = CREDIT_TERM_ZERO) →
 * ล็อกวงเงิน `pos:credit:<ร้าน>:<party>` (advisory xact) → ภาพหนี้ → เกิน = CREDIT_LIMIT_EXCEEDED {limit, exposure} เว้นแต่ผู้อนุญาต (CD-2:
 * สมาชิกของร้านที่ถือ pos.credit.manage ที่สาขานี้ — แคชเชียร์/คนนอก = ยังเกิน)
 */
export async function decideSaleCredit(
  tx: Prisma.TransactionClient,
  s: { tenantId: string; systemId: string; unitId: string; partyId: string; amountSatang: number; overrideByUserId?: string | null; sellerUserId?: string | null; at: Date },
): Promise<SaleCreditDecision> {
  const acct = await tx.posCreditAccount.findUnique({ where: { systemId_partyId: { systemId: s.systemId, partyId: s.partyId } } });
  if (!acct || acct.tenantId !== s.tenantId || !acct.active) return { ok: false, code: "CREDIT_NOT_ALLOWED", message: "บริษัทนี้ยังไม่ได้เปิดวงเงินวางบิล — เลือกวิธีชำระอื่น หรือให้ผู้จัดการตั้งวงเงินก่อน" };
  const book = await posCreditBook({ tenantId: s.tenantId, sourceSystemId: s.systemId, partyId: s.partyId });
  if (!book.linked) return { ok: false, code: "CREDIT_NOT_ALLOWED", message: "จุดขายนี้ยังไม่ผูกสมุดบัญชี — วางบิลไม่ได้ (ลูกหนี้ต้องอยู่ในสมุดบัญชี)" };
  if (acct.termDays === 0) return { ok: false, code: "CREDIT_TERM_ZERO", message: "บริษัทนี้ตั้งเทอมเครดิตไว้ 0 วัน — วางบิลไม่ได้ ให้ชำระทันที" };
  const termDays = resolveCreditTermDays(acct.termDays, book.contactTermDays, book.defaultDueDays);
  if (termDays <= 0) return { ok: false, code: "CREDIT_TERM_ZERO", message: "เทอมเครดิตของบริษัทนี้เป็น 0 วัน — วางบิลไม่ได้ ให้ชำระทันที" };
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${posCreditLockKey(s.tenantId, s.partyId)}))) l`;
  const exposure = (await creditExposureSatang(tx, { tenantId: s.tenantId, systemId: s.systemId, partyId: s.partyId })) ?? 0;
  let override: { byUserId: string; overSatang: number } | null = null;
  if (exposure + s.amountSatang > acct.limitSatang) {
    const by = s.overrideByUserId && isId(s.overrideByUserId) ? await approverOf(tx, s.tenantId, s.overrideByUserId, s.unitId, s.sellerUserId ?? null) : null;
    if (!by) return { ok: false, code: "CREDIT_LIMIT_EXCEEDED", message: "ยอดนี้เกินวงเงินวางบิลของบริษัท — ให้ผู้จัดการอนุญาต หรือเลือกวิธีชำระอื่น", limitSatang: acct.limitSatang, exposureSatang: exposure };
    override = { byUserId: by, overSatang: exposure + s.amountSatang - acct.limitSatang };
  }
  return {
    ok: true,
    creditTerms: { termDays, dueDate: creditDueDate(s.at, termDays), limitSatang: acct.limitSatang, exposureSatang: exposure, ...(override ? { overrideBy: override.byUserId } : {}) },
    override,
  };
}
/**
 * CD-2: ผู้อนุญาตเกินวงเงิน = สมาชิกที่ยอมรับแล้วของร้านนี้ เข้าสาขาได้ และถือ pos.credit.manage ที่สาขา ·
 * fix2 H4 (CD-2 = บทบาท): ต้องเป็น OWNER/MANAGER **และ** ไม่ใช่ผู้ขายของบิลเอง (อนุญาตบิลตัวเองไม่ได้ · STAFF ที่ได้คีย์มาก็ไม่ได้)
 */
async function approverOf(db: Db, tenantId: string, userId: string, unitId: string, sellerUserId: string | null): Promise<string | null> {
  if (sellerUserId && sellerUserId === userId) return null;
  const m = await db.membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m || (m.role !== "OWNER" && m.role !== "MANAGER")) return null;
  const a: RegisterActor = { userId, role: m.role as RegisterActor["role"], unitAccess: Array.isArray(m.unitAccess) ? m.unitAccess.filter((u): u is string => typeof u === "string") : [], permissions: isRecord(m.permissions) ? m.permissions : {} };
  return canAccessUnit(a, unitId) && canManageCredit(a, unitId) ? userId : null;
}

// ═══════════ fix2 H2 คืนบิลวางบิล ≤ ยอดค้างของใบแจ้งหนี้ ═══════════
/**
 * ใน tx ของการคืน (ผู้เรียกล็อกบิลเดิมแล้ว): ล็อกวงเงินของบริษัท (คีย์เดียวกับตอนขาย) → ล็อก + อ่านใบแจ้งหนี้ผ่าน facade →
 *   ที่ว่าง = ค้างของใบ − ใบคืนวางบิลก่อนหน้าที่ยังไม่มีใบลดหนี้ (ยังไม่ระบาย) · ขอคืนเกิน = { remainingSatang } (ผู้เรียกปฏิเสธ CREDIT_REFUND_EXCEEDS_REMAINING) ·
 *   ยังไม่มีใบแจ้งหนี้ (ยังไม่ระบาย = ยังรับเงินไม่ได้) / ไม่ผูกสมุด = null (เพดานเดิม Σ คืน ≤ ยอดบิล ใช้อยู่แล้ว) · ส่วนที่เกิน = นักบัญชีคืนในระบบบัญชี
 */
export async function creditRefundExcess(
  tx: Prisma.TransactionClient,
  s: { tenantId: string; systemId: string; saleId: string; partyId: string | null; askSatang: number },
): Promise<{ remainingSatang: number } | null> {
  if (s.partyId) await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${posCreditLockKey(s.tenantId, s.partyId)}))) l`;
  const prior = await tx.posSale.findMany({ where: { tenantId: s.tenantId, docType: "REFUND", refSaleId: s.saleId }, select: { id: true, payments: { where: { type: "ON_ACCOUNT" }, select: { amountSatang: true } } } });
  const room = await posCreditRefundRoom(tx, { tenantId: s.tenantId, sourceSystemId: s.systemId, refId: s.saleId, refundRefIds: prior.map((r) => r.id) });
  if (!room) return null;
  const drained = new Set(room.docRefundIds);
  const pending = prior.filter((r) => !drained.has(r.id)).reduce((t, r) => t + r.payments.reduce((u, p) => u + Math.abs(p.amountSatang), 0), 0);
  const remainingSatang = Math.max(0, room.remainingSatang - pending);
  return s.askSatang > remainingSatang ? { remainingSatang } : null;
}

// ═══════════ R14 สถานะเครดิตที่หน้าขาย ═══════════
/**
 * สถานะเครดิตของบริษัท (ไทล์ "วางบิล (เครดิตเทอม)" · P3.6U) — ผู้ขายได้ (pos.sale.create ที่สาขา) · ไม่เปิดเครดิต = enabled false ·
 * ตัวเลขวงเงินเฉพาะผู้ถือ pos.credit.manage (CD-4) · amountSatang = ยอดที่จะวางบิล (ไม่ส่ง = 0)
 */
export async function registerCreditStatus(
  ctx: { tenantId: string; systemId: string; unitId: string },
  actorRaw: RegisterActor,
  input: { customerPartyId: string; amountSatang?: number },
): Promise<RegisterCreditStatusResult> {
  return guard("registerCreditStatus", async (): Promise<RegisterCreditStatusResult> => {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    const actor = actorOf(actorRaw);
    if (!actor || !canAccessUnit(actor, ctx.unitId) || !evaluate(actor, { module: "pos", action: "pos.sale.create", unitId: ctx.unitId })) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้");
    const [sys, link] = await Promise.all([
      prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS", active: true }, select: { settings: true } }),
      prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId: ctx.unitId, type: "POS" } }, select: { systemId: true } }),
    ]);
    if (!sys || link?.systemId !== ctx.systemId) return refuse("NOT_FOUND");
    const amount = input?.amountSatang ?? 0;
    if (!(typeof amount === "number" && Number.isInteger(amount) && amount >= 0 && amount <= POS_CREDIT_LIMIT_MAX)) return refuse("VALIDATION", "ยอดไม่ถูกต้อง");
    const off = { ok: true as const, enabled: false, allowed: false, sufficient: false, termDays: null, dueDate: null };
    if (!posCreditSettings(sys.settings).enabled) return off;
    const partyId = input?.customerPartyId;
    if (!(await isCompanyParty(prisma, ctx.tenantId, partyId))) return refuse("CUSTOMER_INVALID");
    const acct = await prisma.posCreditAccount.findUnique({ where: { systemId_partyId: { systemId: ctx.systemId, partyId } } });
    const book = acct && acct.active && acct.tenantId === ctx.tenantId ? await posCreditBook({ tenantId: ctx.tenantId, sourceSystemId: ctx.systemId, partyId }) : null;
    if (!acct || !book || !book.linked) return { ...off, enabled: true };
    const termDays = resolveCreditTermDays(acct.termDays, book.contactTermDays, book.defaultDueDays);
    const exposure = (await creditExposureSatang(prisma, { tenantId: ctx.tenantId, systemId: ctx.systemId, partyId })) ?? 0;
    const allowed = termDays > 0;
    const sufficient = allowed && exposure + amount <= acct.limitSatang;
    return {
      ok: true,
      enabled: true,
      allowed,
      sufficient,
      termDays,
      dueDate: allowed ? creditDueDate(new Date(), termDays) : null,
      ...(canManageCredit(actor, ctx.unitId) ? { limitSatang: acct.limitSatang, exposureSatang: exposure, remainingSatang: acct.limitSatang - exposure } : {}),
    };
  });
}
