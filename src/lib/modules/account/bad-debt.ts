// bad-debt.ts — หนี้สูญ / ค่าเผื่อหนี้สงสัยจะสูญ (ACC T5.7 · เลน 2 · ปิด D7)
//
//   ตัดหนี้สูญ = แถว AccountDocumentPayment ช่องทาง BAD_DEBT (ไม่มีบัญชีเงิน) — ไม่ผ่าน recordPayment ⇒ ไม่ออกใบเสร็จ/ใบกำกับอัตโนมัติ
//     GL (gl.postPayment): VAT บริการที่พักส่วนของยอดตัด → ค่าเผื่อคงเหลือ → หนี้สูญ / Cr ลูกหนี้ · ไม่แตะรายได้ (NPAEs 18.10 [V])
//     ยกเลิก = ยกเลิกรายการชำระเดิม (voidPayment → กลับรายการ ไม่แก้แถว)
//   เงื่อนไขทางภาษี (กฎกระทรวง 186/374 [V]) = คำเตือนที่ต้องกดยืนยัน — ไม่บล็อก · ค่าเผื่อ = รายจ่ายต้องห้าม ม.65 ตรี (1) [V] (บัญชีติดธงบวกกลับ)
//   เกณฑ์ยอดต่อรายจากตาราง (BAD_DEBT_TIER1_MAX / TIER2_MAX) ร้านทับได้
// design note: ledger/wo-notes/T5.7.md
import { randomUUID } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import { LEGAL_ACK_REQUIRED, legalWarning, unacknowledged, type LegalAck, type LegalAckRequired, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { accountNow } from "./clock";
import { doubtfulAllowanceBalance, ensureAccounting, postDoubtfulAllowance, postPayment, runAccountTx } from "./gl";
import { bkkYmd, bookRuleFrom, loadBookLegal, type BookCtx } from "./legal-values";
import { liveCreditTotalInTx, lockDocumentRow, receivableStatusOf } from "./service";

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OPEN = ["AWAITING_PAYMENT", "PARTIAL"] as const;
const AR_TYPES = ["INVOICE", "DEBIT_NOTE", "BILLING_NOTE"] as const;

export type BadDebtCandidate = { documentId: string; docType: string; docNo: string | null; contactId: string | null; contactName: string; issueDate: string; dueDate: string | null; daysOverdue: number; outstanding: number };
export type BadDebtWriteOff = { paymentId: string; documentId: string; docNo: string | null; contactName: string; date: string; amount: number; voided: boolean; note: string | null };
export type BadDebtSummary = {
  asOf: string;
  allowance: number;
  receivable: number;
  candidates: BadDebtCandidate[];
  writeOffs: BadDebtWriteOff[];
  tiers: { tier1Max: number | null; tier2Max: number | null };
};

/** pure: ข้อความเงื่อนไขตามยอดรวมต่อราย */
export function badDebtTierTh(total: number, t1: number | null, t2: number | null): string {
  if (t1 !== null && total <= t1) return `ยอดต่อรายไม่เกิน ${baht(t1)} บาท — มีหลักฐานการติดตามทวงถามตามสมควร และค่าใช้จ่ายในการฟ้องร้องไม่คุ้มกับหนี้ที่จะได้รับชำระ`;
  if (t2 !== null && total <= t2) return `ยอดต่อรายไม่เกิน ${baht(t2)} บาท — ได้ฟ้องลูกหนี้แล้วและศาลมีคำสั่งรับคำฟ้อง`;
  return `ยอดต่อรายเกิน ${t2 !== null ? baht(t2) : "-"} บาท — ต้องดำเนินคดีจนมีหมายบังคับคดีหรือหลักฐานอื่นตามกฎกระทรวง`;
}

export async function badDebtSummary(ctx: BookCtx, asOfDate: Date = accountNow()): Promise<BadDebtSummary> {
  const db = tenantDb(ctx);
  const asOf = bkkYmd(asOfDate);
  const [legal, allowance, ar, docs, wos] = await Promise.all([
    loadBookLegal(ctx),
    doubtfulAllowanceBalance(ctx, asOfDate),
    db.accountMapping.findFirst({ where: { systemId: ctx.systemId, key: "AR" }, select: { accountId: true } }).then((m) =>
      m ? db.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, accountId: m.accountId, entry: { date: { lte: asOfDate } } }, _sum: { debit: true, credit: true } }) : null,
    ),
    db.accountDocument.findMany({
      where: { systemId: ctx.systemId, direction: "OUT", docType: { in: [...AR_TYPES] }, status: { in: [...OPEN] }, dueDate: { lt: new Date(`${asOf}T00:00:00+07:00`) } },
      select: { id: true, docType: true, docNo: true, contactId: true, issueDate: true, dueDate: true, grandTotal: true, paidTotal: true, contact: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 200,
    }),
    db.accountDocumentPayment.findMany({
      where: { systemId: ctx.systemId, channel: "BAD_DEBT" },
      select: { id: true, documentId: true, paidAt: true, amount: true, voidedAt: true, note: true, document: { select: { docNo: true, contact: { select: { name: true } } } } },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  const t0 = Date.parse(`${asOf}T00:00:00Z`);
  return {
    asOf,
    allowance,
    receivable: ar ? (ar._sum.debit ?? 0) - (ar._sum.credit ?? 0) : 0,
    candidates: docs
      .map((d) => ({
        documentId: d.id,
        docType: d.docType,
        docNo: d.docNo,
        contactId: d.contactId,
        contactName: d.contact?.name ?? "-",
        issueDate: bkkYmd(d.issueDate),
        dueDate: d.dueDate ? bkkYmd(d.dueDate) : null,
        daysOverdue: d.dueDate ? Math.round((t0 - Date.parse(`${bkkYmd(d.dueDate)}T00:00:00Z`)) / 86_400_000) : 0,
        outstanding: d.grandTotal - d.paidTotal,
      }))
      .filter((c) => c.outstanding > 0),
    writeOffs: wos.map((w) => ({ paymentId: w.id, documentId: w.documentId, docNo: w.document.docNo, contactName: w.document.contact?.name ?? "-", date: bkkYmd(w.paidAt), amount: w.amount, voided: !!w.voidedAt, note: w.note })),
    tiers: { tier1Max: bookRuleFrom(legal, "BAD_DEBT_TIER1_MAX", asOfDate).value, tier2Max: bookRuleFrom(legal, "BAD_DEBT_TIER2_MAX", asOfDate).value },
  };
}

export type WriteOffInput = { documentId: string; amount?: number | null; date?: Date; note?: string | null; createdById?: string | null; idempotencyKey?: string | null; ack?: LegalAck | null };
export type WriteOffResult =
  | { ok: true; paymentId: string; entryId: string | null; status: string; amount: number; duplicate: boolean; warnings: LegalWarning[] }
  | { ok: false; reason: string; legal?: LegalAckRequired };

/** คำเตือนก่อนตัดหนี้สูญ (จอ/REST/AI ใช้ตัวเดียวกัน) */
export async function writeOffWarnings(ctx: BookCtx, documentId: string, amount: number | null, at: Date): Promise<{ warnings: LegalWarning[]; amount: number; outstanding: number; contactName: string } | { reason: string }> {
  const db = tenantDb(ctx);
  const d = await db.accountDocument.findFirst({ where: { id: documentId, systemId: ctx.systemId }, select: { id: true, direction: true, docType: true, status: true, grandTotal: true, paidTotal: true, contactId: true, contact: { select: { name: true } } } });
  if (!d) return { reason: "ไม่พบเอกสาร" };
  if (d.direction !== "OUT" || !(AR_TYPES as readonly string[]).includes(d.docType)) return { reason: "ตัดหนี้สูญได้เฉพาะใบแจ้งหนี้/ใบเพิ่มหนี้/ใบวางบิลฝั่งขาย" };
  if (!(OPEN as readonly string[]).includes(d.status)) return { reason: "เอกสารนี้ไม่มียอดค้างให้ตัด" };
  const outstanding = d.grandTotal - d.paidTotal;
  const amt = amount ?? outstanding;
  if (!(amt > 0) || amt > outstanding) return { reason: `ยอดที่ตัดต้องมากกว่า 0 และไม่เกินยอดค้าง ${baht(outstanding)} บาท` };
  const legal = await loadBookLegal(ctx);
  const prev = d.contactId
    ? await db.accountDocumentPayment.aggregate({ where: { systemId: ctx.systemId, channel: "BAD_DEBT", voidedAt: null, document: { contactId: d.contactId } }, _sum: { amount: true } })
    : null;
  const total = (prev?._sum.amount ?? 0) + amt;
  const t1 = bookRuleFrom(legal, "BAD_DEBT_TIER1_MAX", at);
  const t2 = bookRuleFrom(legal, "BAD_DEBT_TIER2_MAX", at);
  const name = d.contact?.name ?? "ลูกหนี้ไม่ระบุชื่อ";
  const warnings = [
    legalWarning("BAD_DEBT_TAX_CONDITIONS", { contact: name, amount: baht(amt), total: baht(total), tier: badDebtTierTh(total, t1.value, t2.value) }),
    ...[...t1.warnings, ...t2.warnings].filter((w) => w.code === "SHOP_DIFFERS_FROM_DEFAULT"),
  ];
  return { warnings, amount: amt, outstanding, contactName: name };
}

export async function writeOffBadDebt(ctx: BookCtx, input: WriteOffInput): Promise<WriteOffResult> {
  const at = input.date ?? accountNow();
  if (input.idempotencyKey) {
    const dup = await tenantDb(ctx).accountDocumentPayment.findFirst({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, documentId: true, amount: true, entryId: true, document: { select: { status: true } } } });
    if (dup) {
      if (dup.documentId !== input.documentId) return { ok: false, reason: "คีย์กันซ้ำนี้ถูกใช้กับเอกสารอื่นแล้ว" };
      return { ok: true, paymentId: dup.id, entryId: dup.entryId, status: dup.document.status, amount: dup.amount, duplicate: true, warnings: [] };
    }
  }
  const pre = await writeOffWarnings(ctx, input.documentId, input.amount ?? null, at);
  if ("reason" in pre) return { ok: false, reason: pre.reason };
  const need = unacknowledged(pre.warnings, input.ack?.codes);
  if (need.length) return { ok: false, reason: "มีคำเตือนตามกฎหมายที่ต้องกดยืนยันก่อนทำต่อ", legal: { code: LEGAL_ACK_REQUIRED, warnings: pre.warnings } };
  await ensureAccounting(ctx);
  const res = await runAccountTx(async (tx) => {
    await lockDocumentRow(tx, ctx.tenantId, ctx.systemId, input.documentId);
    const doc = await tx.accountDocument.findFirst({ where: { id: input.documentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, status: true, grandTotal: true, paidTotal: true } });
    if (!doc || !(OPEN as readonly string[]).includes(doc.status)) throw new Error("เอกสารนี้ไม่มียอดค้างให้ตัด");
    const cn = await liveCreditTotalInTx(tx, ctx.systemId, doc.id);
    const remain = Math.max(0, doc.grandTotal - doc.paidTotal - cn);
    if (pre.amount > remain) throw new Error(`ยอดที่ตัดเกินยอดค้าง ${baht(remain)} บาท`);
    const pay = await tx.accountDocumentPayment.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, documentId: doc.id, paidAt: at, channel: "BAD_DEBT", financeAccountId: null, amount: pre.amount, note: input.note?.trim() || "ตัดหนี้สูญ", createdById: input.createdById ?? null, idempotencyKey: input.idempotencyKey ?? null },
    });
    const newPaid = doc.paidTotal + pre.amount;
    const status = receivableStatusOf(doc.grandTotal, newPaid, cn);
    await tx.accountDocument.update({ where: { id: doc.id }, data: { paidTotal: newPaid, status } });
    const gl = await postPayment(ctx, pay.id, tx);
    await recordLegalAckInTx(tx, { tenantId: ctx.tenantId, ack: input.ack as LegalAck, op: "account.bad-debt.write-off", targetType: "AccountDocument", targetId: doc.id, warnings: pre.warnings.filter((w) => w.ack) });
    return { paymentId: pay.id, entryId: "entryId" in gl ? gl.entryId : null, status };
  });
  return { ok: true, ...res, amount: pre.amount, duplicate: false, warnings: pre.warnings };
}

export type AllowanceResult = { ok: true; entryId: string | null; before: number; after: number; delta: number; warnings: LegalWarning[] } | { ok: false; reason: string };

/** ตั้งยอดค่าเผื่อหนี้สงสัยจะสูญที่ต้องการ ณ วันที่ — ระบบลงส่วนต่าง (เพิ่ม = ค่าใช้จ่าย · ลด = กลับข้าง) */
export async function setDoubtfulAllowance(ctx: BookCtx, input: { target: number; date?: Date; note?: string | null; postedById?: string | null }): Promise<AllowanceResult> {
  if (!Number.isInteger(input.target) || input.target < 0) return { ok: false, reason: "ยอดค่าเผื่อต้องเป็นจำนวนเงินตั้งแต่ 0 ขึ้นไป" };
  const at = input.date ?? accountNow();
  await ensureAccounting(ctx);
  const before = await doubtfulAllowanceBalance(ctx, at);
  const delta = input.target - before;
  if (delta === 0) return { ok: true, entryId: null, before, after: before, delta: 0, warnings: [] };
  const r = await postDoubtfulAllowance(ctx, { key: randomUUID(), date: at, delta, memo: input.note?.trim() || (delta > 0 ? "ตั้งค่าเผื่อหนี้สงสัยจะสูญเพิ่ม" : "ลดค่าเผื่อหนี้สงสัยจะสูญ"), postedById: input.postedById ?? undefined });
  const warnings = delta > 0 ? [legalWarning("BAD_DEBT_ALLOWANCE_ADD_BACK", { amount: baht(delta), balance: baht(input.target) })] : [];
  return { ok: true, entryId: "entryId" in r ? r.entryId : null, before, after: input.target, delta, warnings };
}
