// POS P3.6 ▸ credit-shared.ts — วางบิล (เครดิตเทอม) ของลูกค้าองค์กร: ชนิด + ค่าคงที่ + คณิตบริสุทธิ์ (R4 R6 · มติ 1 6 · CD-3 CD-4) ◂
//
// 🔴 ไฟล์นี้ client component import ได้: ห้าม import prisma / db / ไฟล์ฝั่งเซิร์ฟเวอร์ (ข้อสอบ ST3)
// 🔴 คำว่า credit* ในโมดูล POS = เครดิตเทอมของลูกค้าองค์กร (ลูกหนี้ · ใบแจ้งหนี้) — ไม่ใช่ "เครดิตร้าน" ของสมาชิก (STORE_CREDIT · บัตรเงินสด)

/** เทอมเครดิต (วัน) ที่ตั้งได้ต่อบัญชีเครดิต — 0 = ตั้งไว้ว่าไม่ให้เทอม (CREDIT_TERM_ZERO) · null = ตามผู้ติดต่อสมุด → ค่าปริยายของสมุด */
export const POS_CREDIT_TERM_MAX = 365;
/** วงเงิน (สตางค์) ต่อบัญชีเครดิต — จำนวนเต็ม 1 … ค่านี้ (Int ของ Postgres) */
export const POS_CREDIT_LIMIT_MAX = 2_000_000_000;
/** สิทธิ์ของผู้ตั้งวงเงิน/ผู้อนุญาตเกินวงเงิน (OWNER/MANAGER ได้ตามบทบาท) */
export const POS_CREDIT_PERMISSION = "pos.credit.manage";
/** ล็อกวงเงินต่อ (ร้าน · Party) ใน tx ของบิล — สองบิลพร้อมกันเกินวงเงิน = ผ่านใบเดียว */
export const posCreditLockKey = (tenantId: string, partyId: string): string => `pos:credit:${tenantId}:${partyId}`;

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;

/** วันครบกำหนด = วันไทยของ paidAt + termDays → "YYYY-MM-DD" (16 ต.ค. 17:30Z = 17 ต.ค. ไทย · + 30 = 16 พ.ย.) */
export function creditDueDate(paidAt: Date, termDays: number): string {
  const days = Number.isInteger(termDays) && termDays > 0 ? termDays : 0;
  const bkk = new Date(paidAt.getTime() + BKK_MS).toISOString().slice(0, 10);
  return new Date(Date.parse(`${bkk}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * มติ 6 + CD-3 — ลำดับเทอม: บัญชีเครดิต (termDays) → ผู้ติดต่อสมุด (creditTermDays · 0/null = ไม่ตั้ง) → ค่าปริยายของสมุด (defaultDueDays)
 * บัญชีเครดิตตั้ง 0 = 0 (ผู้เรียกปฏิเสธ CREDIT_TERM_ZERO) · ค่าที่ไม่ใช่จำนวนเต็มไม่ติดลบ = ไม่ตั้ง
 */
export function resolveCreditTermDays(account: number | null | undefined, contact: number | null | undefined, bookDefault: number): number {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= POS_CREDIT_TERM_MAX;
  if (ok(account)) return account;
  if (ok(contact) && contact > 0) return contact;
  return ok(bookDefault) ? bookDefault : 0;
}

/** สำเนาเงื่อนไขเครดิตบนบิล (PosSale.creditTerms · เขียนครั้งเดียวใน tx ของ createSale) */
export type PosCreditTerms = { termDays: number; dueDate: string; limitSatang: number; exposureSatang: number; overrideBy?: string };

/** บัญชีเครดิต 1 แถว (หน้าตั้งค่า · ผู้ถือ pos.credit.manage เท่านั้น) */
export type PosCreditAccountView = { id: string; partyId: string; limitSatang: number; termDays: number | null; active: boolean; note: string | null; updatedAt: string };

export type PosCreditRefusalCode = "PERMISSION_DENIED" | "VALIDATION" | "NOT_FOUND" | "CUSTOMER_INVALID" | "INTERNAL";
export type PosCreditRefusal = { ok: false; code: PosCreditRefusalCode; message: string };
export type SaveCreditAccountInput = { partyId: string; limitSatang: number; termDays?: number | null; active?: boolean; note?: string | null };
export type SaveCreditAccountResult = { ok: true; account: PosCreditAccountView } | PosCreditRefusal;
export type ListCreditAccountsResult = { ok: true; items: PosCreditAccountView[] } | PosCreditRefusal;
/**
 * สถานะเครดิตของบริษัทที่หน้าขาย — ทุกคนที่ขายได้เห็น enabled/allowed/sufficient/เทอม/ครบกำหนด ·
 * ตัวเลขวงเงิน (limit/exposure/remaining) เฉพาะผู้ถือ pos.credit.manage (CD-4 · R14)
 */
export type RegisterCreditStatus = {
  ok: true;
  enabled: boolean;
  allowed: boolean;
  sufficient: boolean;
  termDays: number | null;
  dueDate: string | null;
  limitSatang?: number;
  exposureSatang?: number;
  remainingSatang?: number;
};
export type RegisterCreditStatusResult = RegisterCreditStatus | PosCreditRefusal;
/** หมายเหตุภายในของบัญชีเครดิตยาวได้ไม่เกิน (ไม่ลง audit · ไม่ออกหน้าขาย) */
export const POS_CREDIT_NOTE_MAX = 500;
