// legal-gate.ts — ด่านคำเตือนกฎหมายของโมดูลบัญชี (T0.4)
//
// หลัก SHARK: ไม่บล็อกด้วยเหตุผลกฎหมาย — คำเตือนที่ `ack=true` ต้องกดยืนยันก่อนทำต่อ แล้วบันทึกว่าใครยืนยัน
//   ยังไม่ยืนยัน ⇒ โยน LegalAckRequiredError ในธุรกรรม (ยังไม่ได้เขียนอะไร) → ฟังก์ชันชั้นนอกแปลงเป็น `{ ok:false, reason, legal }`
//   ยืนยันแล้ว   ⇒ เขียน AuditLog `legal.warning.ack` ในธุรกรรมเดียวกับการกระทำ
// ข้อความ/มาตรา/ป้าย มาจากทะเบียนกลาง `src/lib/core/settings/legal/warnings.ts` เท่านั้น
import type { Prisma } from "@prisma/client";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import {
  LEGAL_ACK_REASON_TH,
  LEGAL_ACK_REQUIRED,
  LegalAckRequiredError,
  legalWarning,
  legalWarningsText,
  unacknowledged,
  type LegalAck,
  type LegalAckRequired,
  type LegalWarning,
} from "@/lib/core/settings/legal/warnings";

const ADJUST_TYPES = new Set(["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"]);

const blank = (v: string | null | undefined) => !v || v.trim().length === 0;
/** เดียวกับด่านเดิม (normalizeTaxId ว่าง = ไม่มีเลข) */
const noTaxId = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").length === 0;

/** คำเตือนตอนออกเอกสาร (ขาย/ซื้อ) — pure */
export function issueLegalWarnings(
  doc: { docType: string; adjustReason?: string | null },
  /** null = ฝั่งซื้อ (ไม่มีด่านของผู้ขาย) */
  settings: { vatRegistered: boolean; taxId?: string | null } | null,
): LegalWarning[] {
  const out: LegalWarning[] = [];
  if (settings && doc.docType === "TAX_INVOICE") {
    if (!settings.vatRegistered) out.push(legalWarning("TAX_INVOICE_NOT_VAT_REGISTERED"));
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
