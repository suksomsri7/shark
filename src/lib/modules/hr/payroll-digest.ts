import { createHash } from "node:crypto";

// H0.1 ▸ CR16: ลายนิ้วมือของแถวพนักงานในรอบจ่าย (ไม่ใช่ "use server" — ใช้ได้ทั้งฝั่ง server ของหน้า · service · สคริปต์ตรวจ)
//   ยอดรวม/จำนวนคนเท่าเดิมแต่คนหรือยอดรายคนเปลี่ยน (สลับพนักงานเงินเท่ากัน · โยกเงินเพิ่ม/หักระหว่างสองคน) ⇒ ลายนิ้วมือเปลี่ยน
//   ⇒ การอนุมัติที่ถือตัวเลขก่อนคำนวณใหม่ถูกปฏิเสธ (STALE) · บรรทัดละคน เรียงตาม employeeId:
//   `employeeId:gross:add:deduct:ssoEmployee:ssoEmployer:wht:net` ต่อกันด้วย "\n" → sha256 hex (64 ตัว)
//   (ปสส. มี 2 คอลัมน์ในแถวพนักงาน — ใส่ทั้งคู่ ⇒ ครบ 7 ตัวเลขที่ประกอบเป็นยอดรวมของรอบ) ◂
export type PayrollDigestItem = {
  employeeId: string;
  grossSatang: number;
  addSatang: number;
  deductSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
};

export function payrollItemsDigest(items: readonly PayrollDigestItem[]): string {
  const rows = items.map((i) => ({
    employeeId: String(i.employeeId),
    line: [
      String(i.employeeId),
      Number(i.grossSatang),
      Number(i.addSatang),
      Number(i.deductSatang),
      Number(i.ssoEmployeeSatang),
      Number(i.ssoEmployerSatang),
      Number(i.whtSatang),
      Number(i.netSatang),
    ].join(":"),
  }));
  rows.sort((a, b) => (a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : a.line < b.line ? -1 : a.line > b.line ? 1 : 0));
  return createHash("sha256").update(rows.map((r) => r.line).join("\n"), "utf8").digest("hex");
}

/** คอลัมน์ที่ต้อง select เพื่อคำนวณลายนิ้วมือ (Prisma select) */
export const PAYROLL_DIGEST_SELECT = {
  employeeId: true,
  grossSatang: true,
  addSatang: true,
  deductSatang: true,
  ssoEmployeeSatang: true,
  ssoEmployerSatang: true,
  whtSatang: true,
  netSatang: true,
} as const;
