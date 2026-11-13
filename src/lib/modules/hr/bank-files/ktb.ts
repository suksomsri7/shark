// HR H3.5 ▸ Krungthai Corporate Online iPay — brief R6 · research A4 (OCA l10n_th_bank_payment_export_ktb ktb_format_01…44 [V2])
//   header 498 · detail 498 · CRLF ท้ายทุกบรรทัด · batch 000001 · ยอดสตางค์ · บัญชี zero-pad 11
//   service 01 = STANDARD (บัญชีธนาคารอื่น) · 02 = DIRECT (บัญชีกรุงไทย) · ชื่อผู้รับตัด 100 (NAME_CUT)
//   สิ่งที่หลักฐานไม่บอก = ตัวเลือก ทดสอบทั้งสองทาง: ปีของวันที่ CE (ค่าตั้งต้น · OCA) | BE · สาขาผู้รับ SPACES (ค่าตั้งต้น · OCA ไม่มีรหัสสาขา) | ZEROS ◂
import { left, spaces, zero } from "./encode";

export const KTB_LINE_LEN = 498;
export const KTB_NAME_LEN = 100;
export const KTB_REF_LEN = 18;

export type KtbHeader = { count: number; totalSatang: number; effectiveDate: string; companyId: string };
export type KtbCommon = { effectiveDate: string; debitBranchCode: string; debitAccountNo: string; senderName: string; service: "01" | "02"; receivingBranch: "SPACES" | "ZEROS" };
export type KtbDetail = { bankCode: string; accountNo: string; amountSatang: number; name: string; ref: string; running: number };

export function ktbHeader(h: KtbHeader): string {
  return ["10", "1", "000001", "006", zero(h.count, 7), zero(h.totalSatang, 19), h.effectiveDate, "C", "00000000", left(h.companyId, 16), spaces(20), spaces(407)].join("");
}

export function ktbDetail(d: KtbDetail, c: KtbCommon): string {
  return [
    "10",
    "2",
    "000001",
    d.bankCode,
    c.receivingBranch === "ZEROS" ? "0000" : spaces(4),
    zero(d.accountNo, 11),
    "006",
    c.debitBranchCode,
    zero(c.debitAccountNo, 11),
    c.effectiveDate,
    c.service,
    "00",
    zero(d.amountSatang, 17),
    spaces(8),
    "0000000000",
    left(d.name, KTB_NAME_LEN),
    left(c.senderName, 100),
    spaces(40),
    spaces(18),
    spaces(2),
    left(d.ref, KTB_REF_LEN),
    spaces(2),
    spaces(20),
    zero(d.running, 6),
    "09",
    spaces(40),
    spaces(20),
    "0000",
    spaces(34),
  ].join("");
}
