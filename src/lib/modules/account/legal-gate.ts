// legal-gate.ts — ด่านคำเตือนกฎหมายของโมดูลบัญชี (T0.4)
//
// หลัก SHARK: ไม่บล็อกด้วยเหตุผลกฎหมาย — คำเตือนที่ `ack=true` ต้องกดยืนยันก่อนทำต่อ แล้วบันทึกว่าใครยืนยัน
//   ยังไม่ยืนยัน ⇒ โยน LegalAckRequiredError ในธุรกรรม (ยังไม่ได้เขียนอะไร) → ฟังก์ชันชั้นนอกแปลงเป็น `{ ok:false, reason, legal }`
//   ยืนยันแล้ว   ⇒ เขียน AuditLog `legal.warning.ack` ในธุรกรรมเดียวกับการกระทำ
// ข้อความ/มาตรา/ป้าย มาจากทะเบียนกลาง `src/lib/core/settings/legal/warnings.ts` เท่านั้น
import type { Prisma } from "@prisma/client";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import { withLegalAck } from "@/lib/core/legal-ambient";
import {
  LEGAL_ACK_REASON_TH,
  LEGAL_ACK_REQUIRED,
  LegalAckRequiredError,
  isLegalAckRequiredError,
  legalWarning,
  legalWarningsText,
  unacknowledged,
  type LegalAck,
  type LegalAckRequired,
  type LegalWarning,
} from "@/lib/core/settings/legal/warnings";

const ADJUST_TYPES = new Set(["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"]);

const blank = (v: string | null | undefined) => !v || v.trim().length === 0;
/** สตางค์ → "1,234.56" (pure · ใช้ทั้ง server/client) */
const satangTh = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** เดียวกับด่านเดิม (normalizeTaxId ว่าง = ไม่มีเลข) */
const noTaxId = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").length === 0;

/** คำเตือนตอนออกเอกสาร (ขาย/ซื้อ) — pure */
export function issueLegalWarnings(
  /** `vatAmount` (สตางค์) = ยอด VAT ของใบ — ใส่ในข้อความ TAX_INVOICE_NOT_VAT_REGISTERED (T0.4b) */
  doc: { docType: string; adjustReason?: string | null; vatAmount?: number | null },
  /** null = ฝั่งซื้อ (ไม่มีด่านของผู้ขาย) */
  settings: { vatRegistered: boolean; taxId?: string | null } | null,
): LegalWarning[] {
  const out: LegalWarning[] = [];
  if (settings && doc.docType === "TAX_INVOICE") {
    if (!settings.vatRegistered)
      out.push(legalWarning("TAX_INVOICE_NOT_VAT_REGISTERED", typeof doc.vatAmount === "number" ? { vat: satangTh(doc.vatAmount) } : {}));
    if (noTaxId(settings.taxId)) out.push(legalWarning("TAX_INVOICE_SELLER_TAX_ID_MISSING"));
  }
  if (ADJUST_TYPES.has(doc.docType) && blank(doc.adjustReason)) out.push(legalWarning("ADJUST_NOTE_REASON_MISSING"));
  return out;
}

/**
 * ด่านในธุรกรรม: มีคำเตือนต้องยืนยันที่ยังไม่ยืนยัน ⇒ โยน (ผู้เรียกชั้นนอกแปลงด้วย `legalAckResult`)
 * ยืนยันครบ ⇒ บันทึกผู้ยืนยัน (เฉพาะคำเตือนที่ต้องยืนยัน) แล้วทำต่อ
 */
export async function legalGateInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  warnings: readonly LegalWarning[],
  ack: LegalAck | null | undefined,
  target: { op: string; targetType: string; targetId: string },
): Promise<void> {
  const need = warnings.filter((w) => w.ack);
  if (need.length === 0) return;
  const missing = unacknowledged(need, ack?.codes);
  if (missing.length > 0) throw new LegalAckRequiredError(need);
  await recordLegalAckInTx(tx, { tenantId, ack: ack as LegalAck, op: target.op, targetType: target.targetType, targetId: target.targetId, warnings: need });
}

/** แปลง LegalAckRequiredError → ผลมาตรฐาน `{ ok:false, reason, legal }` */
export function legalAckResult(e: LegalAckRequiredError): { ok: false; reason: string; legal: LegalAckRequired } {
  return { ok: false, reason: `${LEGAL_ACK_REASON_TH}: ${legalWarningsText(e.warnings)}`, legal: { code: LEGAL_ACK_REQUIRED, warnings: e.warnings } };
}

/** รหัสที่ผู้ใช้ยืนยันจากฟอร์ม (`formData.getAll("ack")`) — กรองเหลือข้อความ */
export function ackCodesOf(values: readonly unknown[]): string[] {
  return values.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64);
}

/**
 * ACC T1.7 — ตัวห่อของ server action (จอ): เปิดบริบทการยืนยันรอบการเรียก service · ด่านลึก (เดือนที่ยื่นแล้ว) ค้างยืนยัน
 * ⇒ ได้ `{ ok:false, reason, legal }` เสมอ (แม้ service จะกลืน error) · ห้ามห่อโค้ดที่ redirect()
 */
export async function withScreenLegal<T>(
  ack: LegalAck,
  fn: () => Promise<T>,
): Promise<T | { ok: false; reason: string; legal: LegalAckRequired }> {
  try {
    return await withLegalAck(ack, fn);
  } catch (e) {
    if (isLegalAckRequiredError(e)) return legalAckResult(e);
    throw e;
  }
}

/** รหัสยืนยัน + ผู้ยืนยันของจอ */
export function screenAck(codes: readonly unknown[], userId: string | null): LegalAck {
  return { codes: ackCodesOf(codes), actorId: userId, via: "screen" };
}

// ─────────────────── ACC T1.9 ขายไม่มี VAT ในสมุดที่จด VAT ───────────────────

/** เอกสารขายที่เป็นรายได้ (ใบที่ออกจากใบแจ้งหนี้ — ใบเสร็จ/ใบกำกับ — ไม่ใช่รายได้ใหม่) */
const SALE_REVENUE_TYPES = new Set(["INVOICE", "RECEIPT", "TAX_INVOICE", "DEPOSIT_RECEIPT", "DEBIT_NOTE"]);

/**
 * คำเตือน SALE_WITHOUT_VAT_REGISTERED — pure (จอแสดงล่วงหน้า · service ใช้ตัวเดียวกัน)
 * ใบไม่คิด VAT (vatMode NONE) ที่มีบรรทัดไม่ได้ติดป้ายยกเว้น (vatRateBp < 0) ในสมุดที่จด VAT
 * บรรทัด 0% ในใบที่มี VAT = ติดป้าย 0% แล้ว ไม่เตือน
 */
export function saleWithoutVatWarnings(
  doc: { docType: string; vatMode: string; sourceDocId?: string | null; lines: readonly { vatRateBp: number; qty: number | { toString(): string }; unitPrice: number; discount?: number | null }[] },
  settings: { vatRegistered: boolean } | null,
): LegalWarning[] {
  if (!settings?.vatRegistered || !SALE_REVENUE_TYPES.has(doc.docType)) return [];
  if ((doc.docType === "RECEIPT" || doc.docType === "TAX_INVOICE") && doc.sourceDocId) return [];
  if (doc.vatMode !== "NONE") return [];
  const untaxed = doc.lines.filter((l) => l.vatRateBp >= 0);
  if (untaxed.length === 0) return [];
  const amount = untaxed.reduce((n, l) => n + Math.max(0, Math.round((Number(l.qty) || 0) * (l.unitPrice || 0)) - (l.discount || 0)), 0);
  return [legalWarning("SALE_WITHOUT_VAT_REGISTERED", { amount: `(ยอด ${satangTh(amount)} บาท)`, lines: untaxed.length })];
}
