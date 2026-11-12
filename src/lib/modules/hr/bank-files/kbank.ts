// HR H3.5 ▸ KBank K-Cash Connect Plus "PCT – KBANK PAYROLL" (โอนเข้าบัญชีกสิกรไทยเท่านั้น) — brief R5 · research A1
//   header 178 · detail 487 · CRLF ท้ายทุกบรรทัด (รวมบรรทัดสุดท้าย) — ผู้ประกอบไฟล์ (build.ts) ต่อ CRLF
//   ตำแหน่ง [V2-weak] (DLJ) · วันที่ yyMMdd ค.ศ. / ยอดสตางค์ 15 หลัก / จำนวน+ยอดรวมใน header [V] (KBank FAQ v2.4)
//   ช่อง 151 ช่องว่าง · "0000000000.00" ×3 · ธง N = เหมือน DLJ ทุกตัว (ไม่อ้างว่าธนาคารยืนยัน — oracle notes §5) ◂
import { left, spaces, zero } from "./encode";

export const PCT_HEADER_LEN = 178;
export const PCT_DETAIL_LEN = 487;
export const PCT_NAME_LEN = 50;
export const PCT_COMPANY_LEN = 50;
/** เพดานต่อรายการ 3,000,000.00 บาท [V] (FAQ) — เกิน = เตือน OVER_LIMIT (ไม่ปฏิเสธ) */
export const PCT_ITEM_LIMIT_SATANG = 300_000_000;

export type PctHeader = { batchRef: string; debitAccountNo: string; totalSatang: number; fileDate: string; companyName: string; effectiveDate: string; count: number };
export type PctDetail = { seq: number; accountNo: string; amountSatang: number; name: string };

export function pctHeader(h: PctHeader): string {
  return [
    "H",
    "PCT",
    left(h.batchRef, 16),
    "000000",
    spaces(14),
    h.debitAccountNo,
    " ",
    zero(h.totalSatang, 15),
    " ",
    h.fileDate,
    spaces(25),
    left(h.companyName, PCT_COMPANY_LEN),
    h.effectiveDate,
    zero(h.count, 18),
    "N",
    spaces(5),
  ].join("");
}

export function pctDetail(d: PctDetail, h: Pick<PctHeader, "fileDate" | "effectiveDate">): string {
  return [
    "D",
    zero(d.seq, 6),
    spaces(14),
    d.accountNo,
    " ",
    zero(d.amountSatang, 15),
    " ",
    h.fileDate,
    spaces(25),
    left(d.name, PCT_NAME_LEN),
    h.effectiveDate,
    "000",
    zero(d.seq, 16),
    spaces(50 + 1 + 50 + 50),
    "0000000000.00".repeat(3),
    spaces(10 + 13),
    spaces(30 * 4),
  ].join("");
}
