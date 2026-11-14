// HR HF-SSO-2569 ▸ กติกาประกันสังคม "ตามงวดค่าจ้าง" + ค่าลดหย่อนเงินสมทบตามปีภาษี (pure · ไม่มี I/O · ไม่อ่านเวลาเครื่อง)
// ทำไม: payroll-rules.ts (FREEZE) ใช้เพดานฐาน 15,000 บาทตายตัว · กฎกระทรวงกำหนดค่าจ้างขั้นต่ำและขั้นสูงที่ใช้เป็นฐานคำนวณเงินสมทบ ม.33 พ.ศ. 2568
//   (ใช้บังคับ 1 ม.ค. 2569) เปลี่ยนเพดานเป็นช่วงวันที่ — shark-thai-law domain-labour-payroll §ซ [V] · test-rules T-HR-08 [V] / T-HR-10 [V]
//   (๑) 1 ม.ค. 2569 – 31 ธ.ค. 2571: 1,650–17,500 · (๒) 2572–2574: ≤ 20,000 · (๓) ตั้งแต่ 1 ม.ค. 2575: ≤ 23,000 · ก่อน 2569 = 15,000 (ค่าเดิมของรุ่น 1)
//   อัตรา 5 % (ลูกจ้าง = นายจ้าง) · ปัดเศษ ม.46 "ตั้งแต่ห้าสิบสตางค์ขึ้นไปให้นับเป็นหนึ่งบาท" — สูตรเดียวกับ payroll-rules.ssoContribution ทุกตัวอักษร
// 🔴 ตัวตัดสินช่วง = งวดค่าจ้าง (periodKey "YYYY-MM") ไม่ใช่วันจ่าย/วันนี้ (T-HR-08 อิง "งวด") · งวดหาย/ผิดรูป = throw (ไม่มีค่าสำรอง)
// 🔴 ลดหย่อนภาษี ม.47(1)(ฌ) "ตามจำนวนที่จ่ายจริง" ⇒ เพดานต่อปีภาษี = ผลรวมเงินสมทบสูงสุดของ 12 งวดในปีนั้น (2568 9,000 · 2569–2571 10,500 · 2572–2574 12,000 · 2575+ 13,800)
// ผู้เรียก: payroll.ts (รุ่น 1 สร้าง/คำนวณใหม่/ตรวจก่อนอนุมัติ) · labor.ts (H4.2 ประมาณการ) · payroll-opening.ts (SSO_HIGH)
import { annualTaxSatang, type WhtDeductions } from "./payroll-rules";

const BAHT = 100; // 1 บาท = 100 สตางค์
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type SsoLaw = { rateBp: number; minBaseSatang: number; maxBaseSatang: number };

/** ตารางเพดานฐานตามงวด (งวดแรกที่มีผล "YYYY-MM" · เรียงจากเก่าไปใหม่) — ตัวเลขจากกฎกระทรวง 2568 ข้อ 3 */
const SSO_BANDS: readonly { fromPeriod: string; maxBaseSatang: number }[] = [
  { fromPeriod: "0000-01", maxBaseSatang: 15_000 * BAHT }, // ก่อน ม.ค. 2569 = ค่าที่รุ่น 1 ใช้มาตลอด
  { fromPeriod: "2026-01", maxBaseSatang: 17_500 * BAHT }, // (๑) 1 ม.ค. 2569 – 31 ธ.ค. 2571
  { fromPeriod: "2029-01", maxBaseSatang: 20_000 * BAHT }, // (๒) 1 ม.ค. 2572 – 31 ธ.ค. 2574
  { fromPeriod: "2032-01", maxBaseSatang: 23_000 * BAHT }, // (๓) ตั้งแต่ 1 ม.ค. 2575
];
const SSO_RATE_BP = 500;
const SSO_MIN_BASE_SATANG = 1_650 * BAHT;

function periodOf(periodKey: unknown): string {
  if (typeof periodKey !== "string" || !PERIOD_RE.test(periodKey)) throw new Error("HF-SSO: periodKey must be a YYYY-MM wage period");
  return periodKey;
}
function taxYearOf(taxYear: unknown): number {
  if (typeof taxYear !== "number" || !Number.isSafeInteger(taxYear) || taxYear < 1 || taxYear > 9999) throw new Error("HF-SSO: taxYear must be an integer year (ค.ศ.)");
  return taxYear;
}

/** กฎประกันสังคมที่มีผลกับงวดค่าจ้างหนึ่ง */
export function ssoLawForPeriod(periodKey: string): SsoLaw {
  const p = periodOf(periodKey);
  let max = SSO_BANDS[0]!.maxBaseSatang;
  for (const b of SSO_BANDS) if (b.fromPeriod <= p) max = b.maxBaseSatang;
  return { rateBp: SSO_RATE_BP, minBaseSatang: SSO_MIN_BASE_SATANG, maxBaseSatang: max };
}

/** เงินสมทบของงวด: ฐาน = clamp(ค่าจ้าง, ต่ำสุด, เพดานของงวด) · ปัดเป็นบาทเต็มครึ่งขึ้น · นายจ้าง = ลูกจ้าง (สูตรเดียวกับรุ่น 1) */
export function ssoContributionForPeriod(wageSatang: number, periodKey: string): { baseSatang: number; employeeSatang: number; employerSatang: number } {
  const law = ssoLawForPeriod(periodKey);
  const baseSatang = Math.min(Math.max(wageSatang, law.minBaseSatang), law.maxBaseSatang);
  const rawSatang = (baseSatang * law.rateBp) / 10000;
  const roundedSatang = Math.round(rawSatang / BAHT) * BAHT;
  return { baseSatang, employeeSatang: roundedSatang, employerSatang: roundedSatang };
}

/** เพดานค่าลดหย่อนเงินสมทบของปีภาษี (ค.ศ.) = Σ เงินสมทบสูงสุดของ 12 งวดในปีนั้น (ลูกจ้างจ่ายได้ไม่เกินนี้ = "ตามจำนวนที่จ่ายจริง") */
export function ssoAllowanceCapSatang(taxYear: number): number {
  const y = String(taxYearOf(taxYear)).padStart(4, "0");
  let cap = 0;
  for (let m = 1; m <= 12; m++) {
    const law = ssoLawForPeriod(`${y}-${String(m).padStart(2, "0")}`);
    cap += Math.round((law.maxBaseSatang * law.rateBp) / 10000 / BAHT) * BAHT;
  }
  return cap;
}

// ภาษีหัก ณ ที่จ่ายรายเดือน วิธี "ทำให้เต็มปี" — สูตรเดียวกับ payroll-rules.monthlyWhtSatang ทุกขั้น ยกเว้นเพดานลดหย่อนเงินสมทบ = ssoAllowanceCapSatang(ปีภาษี)
// (ค่าคงที่ด้านล่างเท่ากับของ payroll-rules.ts ซึ่ง FREEZE และไม่ export)
const EXPENSE_CAP_SATANG = 100_000 * BAHT;
const PERSONAL_ALLOWANCE_SATANG = 60_000 * BAHT;
const SPOUSE_ALLOWANCE_SATANG = 60_000 * BAHT;
const CHILD_ALLOWANCE_SATANG = 30_000 * BAHT;

/** ปีภาษี = ปี ค.ศ. ตามปฏิทินกรุงเทพของวันจ่าย (ผู้เรียกส่งมา) */
export function monthlyWhtForTaxYear(
  input: { monthlySalarySatang: number; ssoEmployeeYearSatang: number; deductions?: WhtDeductions },
  taxYear: number,
): number {
  const ssoCap = ssoAllowanceCapSatang(taxYear);
  const annualIncome = input.monthlySalarySatang * 12;

  const expense = Math.min(annualIncome * 0.5, EXPENSE_CAP_SATANG);
  const spouse = input.deductions?.spouse ? SPOUSE_ALLOWANCE_SATANG : 0;
  const children = Math.max(0, input.deductions?.children ?? 0) * CHILD_ALLOWANCE_SATANG;
  const sso = Math.min(Math.max(0, input.ssoEmployeeYearSatang), ssoCap);

  const netIncome = Math.max(0, annualIncome - expense - PERSONAL_ALLOWANCE_SATANG - spouse - children - sso);

  const annualTax = annualTaxSatang(netIncome);
  return Math.max(0, Math.round(annualTax / 12));
}
