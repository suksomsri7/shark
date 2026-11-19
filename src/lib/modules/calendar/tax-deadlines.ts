// tax-deadlines.ts — กำหนดยื่นภาษี/นำส่ง ปกส. (CAL1.3 · สัญญา §4.4 · R-CAL-15 · มติ Q4) — **บริสุทธิ์ล้วน**
//   ตารางคงที่แบบมีช่วงวันที่ (ไม่อ่านฐาน · ไม่อ่านนาฬิกา) — agenda.ts ตัดตามเงื่อนไขแสดง/สิทธิ์เอง
//   ที่มา: skill shark-thai-law (common-vat-invoice §18–19 · common-withholding-tax §8 · domain-labour-payroll) — ไม่ใช่คำปรึกษากฎหมาย
//   🔴 ไม่เลื่อนตามวันหยุด/เสาร์-อาทิตย์ ([U] skill ไม่มีข้อมูล ⇒ แสดงวันตามกฎ = เร็วกว่า ปลอดภัยกว่า)
//   ช่วงขยายเวลายื่นทางอินเทอร์เน็ต: แบบที่ "ครบกำหนดยื่น (กระดาษ)" 1 ก.พ. 2567 – 31 ม.ค. 2570 (ประกาศ กค. ฉ.7) — หลังนั้นใช้วันกระดาษ + "ตรวจประกาศขยายเวลา"
import { dayNoToYmd, ymdToDayNo } from "./next-fire";

export type TaxForm = "PP30" | "PND3_53" | "PND1" | "SSO";

export type TaxDeadline = {
  form: TaxForm;
  /** งวด (เดือนที่เกิดภาษี/จ่าย) "YYYY-MM" — กำหนดยื่นอยู่ในเดือนถัดไป */
  period: string;
  /** วันหลักที่แสดง "YYYY-MM-DD" (วันไทย) — ออนไลน์เมื่ออยู่ในช่วงขยาย · ไม่งั้นวันกระดาษ */
  day: string;
  /** วันกระดาษ (วันที่ของเดือน) เมื่อวันหลักเป็นวันออนไลน์ · null = ไม่มีบรรทัดรอง */
  paperDay: number | null;
  /** อยู่ในช่วงขยายเวลายื่นออนไลน์ */
  extended: boolean;
  title: string;
  sub: string;
};

export const EXTENSION_FROM = "2024-02-01";
export const EXTENSION_TO = "2027-01-31";

const RULES: { form: TaxForm; name: string; paper: number; online: number | null; agency: "สรรพากร" | "ประกันสังคม" }[] = [
  { form: "PP30", name: "ภ.พ.30", paper: 15, online: 23, agency: "สรรพากร" },
  { form: "PND3_53", name: "ภ.ง.ด.3/53", paper: 7, online: 15, agency: "สรรพากร" },
  { form: "PND1", name: "ภ.ง.ด.1", paper: 7, online: 15, agency: "สรรพากร" },
  { form: "SSO", name: "ปกส.", paper: 15, online: null, agency: "ประกันสังคม" },
];
export const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;

const ymd = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * กำหนดยื่นทุกแบบที่วันหลักตกในช่วง `from..to` (วันไทย "YYYY-MM-DD" รวมปลาย) · เรียงตามวัน → ลำดับแบบ
 * ช่วงผิด = []
 */
export function taxDeadlines(from: string, to: string): TaxDeadline[] {
  const f = ymdToDayNo(from), t = ymdToDayNo(to);
  if (f === null || t === null || t < f) return [];
  const out: TaxDeadline[] = [];
  const start = new Date(f * 86_400_000);
  // เดือนที่กำหนดยื่นอยู่ = เดือนของ from .. เดือนของ to
  for (let y = start.getUTCFullYear(), m0 = start.getUTCMonth(); ; ) {
    const monthStart = ymdToDayNo(ymd(y, m0, 1))!;
    if (monthStart > t) break;
    const py = m0 === 0 ? y - 1 : y, pm0 = m0 === 0 ? 11 : m0 - 1;
    for (const r of RULES) {
      const paperYmd = ymd(y, m0, r.paper);
      const extended = r.online !== null && paperYmd >= EXTENSION_FROM && paperYmd <= EXTENSION_TO;
      const dayNum = extended ? r.online! : r.paper;
      const dn = ymdToDayNo(ymd(y, m0, dayNum))!;
      if (dn < f || dn > t) continue;
      const check = `กำหนดยื่น (ตรวจสอบกับ${r.agency})`;
      const sub = r.online === null ? check : extended ? `${check} · ยื่นกระดาษภายในวันที่ ${r.paper}` : `${check} · ตรวจประกาศขยายเวลา`;
      out.push({
        form: r.form,
        period: `${py}-${String(pm0 + 1).padStart(2, "0")}`,
        day: dayNoToYmd(dn),
        paperDay: extended ? r.paper : null,
        extended,
        title: `ยื่น ${r.name} เดือน ${TH_MONTH_SHORT[pm0]}`,
        sub,
      });
    }
    m0 += 1;
    if (m0 === 12) {
      m0 = 0;
      y += 1;
    }
  }
  const order: TaxForm[] = ["PP30", "PND3_53", "PND1", "SSO"];
  return out.sort((a, b) => a.day.localeCompare(b.day) || order.indexOf(a.form) - order.indexOf(b.form));
}
