// Payroll ไทย — กติกาคำนวณ pure (WO-0036) · สเปคเต็ม docs/sds/modules/future-payroll-tax.md §A
// ⚠️ สมอง FREEZE: oracle (scripts/qc-payroll.mts) ยิงตรงฟังก์ชันเหล่านี้ — แก้สูตรต้องตรงทุกสตางค์
// หน่วยเงินเป็น "สตางค์" (Int) ตลอด · ช่วงกฎหมายเป็นบาท → คูณ 100 เป็นสตางค์
// ไม่มี I/O — deterministic (input เดิม → ผลเดิมเสมอ)

const BAHT = 100; // 1 บาท = 100 สตางค์

// ── 1) ประกันสังคม (สปส.1-10 · มาตรา 33) ──
// ฐาน = clamp(ค่าจ้าง, ขั้นต่ำ 1,650, เพดาน 15,000) บาท/เดือน (เพดานปี 2567)
// เงินสมทบ = ปัดเป็น "บาทเต็ม" ตามแนว สปส. → Math.round(ฐาน×อัตรา / 100) × 100
// ต่ำสุด 83 / สูงสุด 750 บาท (ที่อัตรา 5%) · นายจ้างสมทบเท่ากับลูกจ้าง
export type SsoConfig = {
  rateBp?: number; // อัตรา basis points (500 = 5%)
  minBaseSatang?: number; // ฐานขั้นต่ำ (165000 = 1,650 บาท)
  maxBaseSatang?: number; // เพดานฐาน (1500000 = 15,000 บาท)
};

export function ssoContribution(
  monthlySalarySatang: number,
  cfg?: SsoConfig,
): { baseSatang: number; employeeSatang: number; employerSatang: number } {
  const rateBp = cfg?.rateBp ?? 500;
  const minBase = cfg?.minBaseSatang ?? 1650 * BAHT;
  const maxBase = cfg?.maxBaseSatang ?? 15000 * BAHT;

  const baseSatang = Math.min(Math.max(monthlySalarySatang, minBase), maxBase);
  // ฐาน×อัตรา (สตางค์) → ปัดเป็นบาทเต็ม (÷100 ปัด ×100)
  const rawSatang = (baseSatang * rateBp) / 10000;
  const roundedSatang = Math.round(rawSatang / BAHT) * BAHT;

  return { baseSatang, employeeSatang: roundedSatang, employerSatang: roundedSatang };
}

// ── 2) ภาษีเงินได้บุคคลธรรมดา — ขั้นบันไดต่อปี (เงินได้สุทธิ) ──
// ช่วงเป็นบาท (× BAHT เป็นสตางค์) · อัตรา % · ปัด Math.round เป็นสตางค์
const TAX_BANDS: { upToSatang: number; ratePct: number }[] = [
  { upToSatang: 150_000 * BAHT, ratePct: 0 },
  { upToSatang: 300_000 * BAHT, ratePct: 5 },
  { upToSatang: 500_000 * BAHT, ratePct: 10 },
  { upToSatang: 750_000 * BAHT, ratePct: 15 },
  { upToSatang: 1_000_000 * BAHT, ratePct: 20 },
  { upToSatang: 2_000_000 * BAHT, ratePct: 25 },
  { upToSatang: 5_000_000 * BAHT, ratePct: 30 },
  { upToSatang: Number.POSITIVE_INFINITY, ratePct: 35 },
];

export function annualTaxSatang(netIncomeSatang: number): number {
  if (netIncomeSatang <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const band of TAX_BANDS) {
    if (netIncomeSatang <= prev) break;
    const taxableInBand = Math.min(netIncomeSatang, band.upToSatang) - prev;
    tax += (taxableInBand * band.ratePct) / 100;
    prev = band.upToSatang;
  }
  return Math.round(tax);
}

// ── 3) ภาษีหัก ณ ที่จ่ายเงินเดือน (ภ.ง.ด.1 · มาตรา 40(1)) วิธี "ทำให้เต็มปี" ──
// 1) เงินได้ทั้งปี = เงินเดือน × 12
// 2) หักค่าใช้จ่าย 50% เพดาน 100,000 บาท
// 3) ลดหย่อน: ส่วนตัว 60,000 + คู่สมรส 60,000 + บุตร 30,000/คน + ปสส.จ่ายจริงทั้งปี (เพดาน 9,000)
// 4) เงินได้สุทธิ → annualTaxSatang → ÷ 12 (Math.round) · ติดลบ = 0
const EXPENSE_CAP_SATANG = 100_000 * BAHT;
const PERSONAL_ALLOWANCE_SATANG = 60_000 * BAHT;
const SPOUSE_ALLOWANCE_SATANG = 60_000 * BAHT;
const CHILD_ALLOWANCE_SATANG = 30_000 * BAHT;
const SSO_ALLOWANCE_CAP_SATANG = 9_000 * BAHT;

export type WhtDeductions = { spouse?: boolean; children?: number };

export function monthlyWhtSatang(input: {
  monthlySalarySatang: number;
  ssoEmployeeYearSatang: number;
  deductions?: WhtDeductions;
}): number {
  const annualIncome = input.monthlySalarySatang * 12;

  const expense = Math.min(annualIncome * 0.5, EXPENSE_CAP_SATANG);
  const spouse = input.deductions?.spouse ? SPOUSE_ALLOWANCE_SATANG : 0;
  const children = Math.max(0, input.deductions?.children ?? 0) * CHILD_ALLOWANCE_SATANG;
  const sso = Math.min(Math.max(0, input.ssoEmployeeYearSatang), SSO_ALLOWANCE_CAP_SATANG);

  const netIncome = Math.max(
    0,
    annualIncome - expense - PERSONAL_ALLOWANCE_SATANG - spouse - children - sso,
  );

  const annualTax = annualTaxSatang(netIncome);
  return Math.max(0, Math.round(annualTax / 12));
}

// ── 4) OT + รายการเพิ่ม/หักในงวด (13 ส.ค. 2026 · เจ้าของสั่งข้อ 5+7) ──
// ⚠️ pure ทั้งหมด — oracle ยิงตรง (scripts/qc-hr-payadjust.mts)
//
// อัตรา OT: กฎหมายแรงงานไทยให้ค่าล่วงเวลาวันทำงานปกติ 1.5 เท่าของค่าจ้างต่อชั่วโมง
//   ค่าจ้างต่อชั่วโมง (ลูกจ้างเงินเดือน) = เงินเดือน ÷ 30 วัน ÷ 8 ชั่วโมง
//   ร้านตั้งอัตราเองได้ (otHourlyRateSatang ในโปรไฟล์) — ไม่ตั้งจึงใช้สูตรนี้
export function otHourlyRateSatang(
  monthlySalarySatang: number,
  opts?: { daysPerMonth?: number; hoursPerDay?: number; multiplier?: number },
): number {
  const days = opts?.daysPerMonth ?? 30;
  const hours = opts?.hoursPerDay ?? 8;
  const mult = opts?.multiplier ?? 1.5;
  if (monthlySalarySatang <= 0 || days <= 0 || hours <= 0) return 0;
  return Math.round((monthlySalarySatang / days / hours) * mult);
}

/** เงิน OT จากชั่วโมง × อัตรา (ปัดเป็นสตางค์เต็ม) */
export function otAmountSatang(hours: number, hourlyRateSatang: number): number {
  if (hours <= 0 || hourlyRateSatang <= 0) return 0;
  return Math.round(hours * hourlyRateSatang);
}

// ทิศทางของรายการ: เพิ่มเงิน (OT/คอม/โบนัส/เบี้ยเลี้ยง) vs หักเงิน (หักเงิน/เบิกล่วงหน้า)
const ADD_KINDS = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE"]);
export function isAddKind(kind: string): boolean {
  return ADD_KINDS.has(kind);
}

/**
 * รวมรายการเพิ่ม/หักของพนักงาน 1 คนในงวดหนึ่ง (นับเฉพาะที่อนุมัติแล้ว — ผู้เรียกกรองมาก่อน)
 * 🔴 amountSatang เป็นบวกเสมอ · ทิศทางมาจาก kind (กันบั๊กเครื่องหมายกลับด้าน)
 */
export function sumAdjustments(rows: { kind: string; amountSatang: number }[]): {
  addSatang: number;
  deductSatang: number;
} {
  let addSatang = 0;
  let deductSatang = 0;
  for (const r of rows) {
    const amt = Math.max(0, Math.round(r.amountSatang));
    if (isAddKind(r.kind)) addSatang += amt;
    else deductSatang += amt;
  }
  return { addSatang, deductSatang };
}

/**
 * ค่าจ้างที่จ่ายจริงก่อนหักตามกฎหมาย = เงินเดือน + รายการเพิ่ม − รายการหัก
 * 🔴 ฐาน ปสส./ภงด.1 ยังคิดจาก "เงินเดือนประจำ" เท่านั้น (ไม่ใช่ยอดนี้) — ตั้งใจ:
 *    รายการผันแปรแต่ละเดือนไม่ควรทำให้ภาษีหักต่อเดือนแกว่ง และเป็นวิธีที่ร้านเล็กใช้จริง
 *    (ถ้าจะทำภาษีตามยอดจริงทั้งปี ต้องปรับที่ ภงด.91 ปลายปี — คนละเรื่องกับหักรายเดือน)
 * ไม่ปล่อยให้ติดลบ: หักมากกว่าที่ได้ = จ่าย 0 (ส่วนเกินร้านต้องยกไปงวดหน้าเอง)
 */
export function payableGrossSatang(input: {
  baseSalarySatang: number;
  addSatang: number;
  deductSatang: number;
}): number {
  return Math.max(0, input.baseSalarySatang + input.addSatang - input.deductSatang);
}
