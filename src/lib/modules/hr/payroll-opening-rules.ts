// HR H3.4-YTD ▸ ยอดยกมาต้นปี (ก่อนใช้ระบบ) — กฎล้วน (pure · ไม่มีฐานข้อมูล/นาฬิกา · import แบบ type เท่านั้น) · brief hr-brief-H3.4-YTD R2
//   ยอดยกมา = เงินได้ 40(1) · ภาษีหัก ณ ที่จ่าย · เงินสมทบประกันสังคมฝั่งลูกจ้าง · จำนวนเดือน ที่นายจ้างนี้จ่ายในปีภาษีก่อนรอบแรกใน SHARK
//   (ไม่ใช่ของนายจ้างเดิม — Q1) · เงิน = สตางค์จำนวนเต็ม · วันที่ = "YYYY-MM-DD" ตามปฏิทินไทย (ผู้เรียกแปลงด้วย bkkParts ก่อน)
//   ใช้ที่: เครื่องคิดรุ่น 2 (withOpening → ytdPriorV2 เดิม) · คำเตือนยังไม่กรอก (openingMissing) · 50 ทวิ / ภ.ง.ด.1ก (openingFilingItem)
import type { FilingItem } from "./filings/rd";

export type OpeningCode = "NO" | "OWN" | "FIELDS" | "WHT_OVER" | "AS_OF" | "OVERLAP" | "CERT_ISSUED" | "REV_CHANGED" | "YEAR" | "OPENING_OVERLAP" | "BUSY";
/** ข้อความคงที่ของทุกคำปฏิเสธ (ไทย · ไม่มีตัวเลข/รหัส/ชื่อ — ผู้ไม่มีสิทธิ์ทุกแบบได้ไบต์เดียวกัน) */
export const OPENING_TEXT: Record<OpeningCode, string> = {
  NO: "ไม่มีสิทธิ์ใช้งานส่วนนี้",
  OWN: "บันทึกยอดยกมาของตัวเองไม่ได้ — ให้เจ้าของร้านหรือผู้ดูแลเงินเดือนคนอื่นบันทึกให้",
  FIELDS: "ข้อมูลยอดยกมาไม่ถูกต้อง — จำนวนเงินต้องเป็นจำนวนเต็มไม่ติดลบ และจำนวนเดือนต้องไม่เกินเดือนของวันที่ยอดถึง",
  WHT_OVER: "ภาษีหัก ณ ที่จ่ายมากกว่าเงินได้ — ตรวจตัวเลขอีกครั้ง",
  AS_OF: "วันที่ยอดถึงต้องอยู่ในปีภาษีที่เลือก และไม่เลยวันนี้",
  OVERLAP: "มีรอบจ่ายในระบบที่จ่ายภายในช่วงของยอดยกมานี้แล้ว — เลือกวันที่ยอดถึงก่อนวันจ่ายของรอบแรกในระบบ",
  CERT_ISSUED: "ออกหนังสือรับรอง 50 ทวิ ของปีนี้แล้ว — ยกเลิกใบก่อนแก้ยอดยกมา",
  REV_CHANGED: "ยอดยกมานี้ถูกแก้ไปแล้วโดยผู้อื่น — เปิดดูใหม่แล้วบันทึกอีกครั้ง",
  YEAR: "ปีภาษีไม่ถูกต้อง",
  OPENING_OVERLAP: "มีพนักงานที่ยอดยกมาครอบคลุมวันจ่ายของรอบนี้แล้ว — แก้วันที่ยอดถึงของยอดยกมาก่อนสร้างรอบ",
  BUSY: "ระบบกำลังบันทึกงานอื่นของปีนี้อยู่ — รอสักครู่แล้วบันทึกอีกครั้ง (ยังไม่มีอะไรถูกบันทึก)",
};
export type OpeningInput = { asOfDay: string; months: number; incomeSatang: number; whtSatang: number; ssoSatang: number };
export type OpeningRow = OpeningInput & { id: string; rev: number; employeeId: string; taxYear?: number };
export type OpeningPrior = { incomeSatang: number; whtSatang: number; ssoSatang: number };
export type ParseOpening = ({ ok: true } & OpeningInput) | { ok: false; code: OpeningCode; reason: string };

const INT_MAX = 2_147_483_647;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const refuse = (code: OpeningCode): { ok: false; code: OpeningCode; reason: string } => ({ ok: false, code, reason: OPENING_TEXT[code] });
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= INT_MAX;
/** วันที่จริงตามปฏิทิน "YYYY-MM-DD" */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DAY_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const last = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]!;
  return d <= last;
}
export const yearOk = (y: unknown): y is number => typeof y === "number" && Number.isInteger(y) && y >= 2000 && y <= 2400;

/**
 * ตรวจค่าที่กรอก (สตางค์แล้ว) — ลำดับ: ปี → ชนิด/ช่วงของตัวเลข → วันที่ → วันที่อยู่ในปีและไม่เลยวันนี้ → เดือน ≤ เดือนของวันที่ → ภาษี ≤ เงินได้
 * `todayBkk` = วันนี้ตามปฏิทินไทย (ผู้เรียกส่ง — ไฟล์นี้ไม่อ่านนาฬิกา) · `startDay` (fix round MINOR-4) = วันเริ่มงาน — วันที่ยอดถึงก่อนวันเริ่มงาน ⇒ FIELDS
 */
export function parseOpening(raw: unknown, at: { taxYear: unknown; todayBkk: string; startDay?: string | null }): ParseOpening {
  if (!yearOk(at?.taxYear)) return refuse("YEAR");
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const { asOfDay, months, incomeSatang, whtSatang, ssoSatang } = r;
  if (!money(incomeSatang) || !money(whtSatang) || !money(ssoSatang)) return refuse("FIELDS");
  if (typeof months !== "number" || !Number.isInteger(months) || months < 0 || months > 12) return refuse("FIELDS");
  if (!isDay(asOfDay)) return refuse("FIELDS");
  if (Number(asOfDay.slice(0, 4)) !== at.taxYear || !isDay(at.todayBkk) || asOfDay > at.todayBkk) return refuse("AS_OF");
  if (months > Number(asOfDay.slice(5, 7))) return refuse("FIELDS");
  if (typeof at.startDay === "string" && isDay(at.startDay) && asOfDay < at.startDay) return refuse("FIELDS");
  if (whtSatang > incomeSatang) return refuse("WHT_OVER");
  return { ok: true, asOfDay, months, incomeSatang, whtSatang, ssoSatang };
}

/** ยอดสะสมก่อนงวด + ยอดยกมา — บวกเฉพาะเมื่อปีภาษีเดียวกับวันจ่าย (เวลาไทย) และวันที่ยอดถึง < วันจ่าย · ไม่แก้ค่าที่ส่งเข้ามา */
export function withOpening<T extends OpeningPrior>(prior: T, opening: Pick<OpeningRow, "asOfDay" | "incomeSatang" | "whtSatang" | "ssoSatang"> | null | undefined, at: { onDay: string }): T {
  if (!opening || typeof at?.onDay !== "string" || typeof opening.asOfDay !== "string") return { ...prior };
  if (opening.asOfDay.slice(0, 4) !== at.onDay.slice(0, 4) || !(opening.asOfDay < at.onDay)) return { ...prior };
  return { ...prior, incomeSatang: prior.incomeSatang + opening.incomeSatang, whtSatang: prior.whtSatang + opening.whtSatang, ssoSatang: prior.ssoSatang + opening.ssoSatang };
}

/**
 * Q15 เตือน "ยังไม่กรอกยอดยกมา" = ไม่มียอดยกมา ∧ ไม่มีรอบก่อนหน้าในปีภาษีนี้ ∧ max(วันเริ่มงาน, 1 ม.ค. ของปีวันจ่าย) < วันแรกของงวด
 * (ไม่รู้วันเริ่มงาน ⇒ เตือน · งวดมกราคมไม่เตือน · เริ่มงานตั้งแต่วันแรกของงวด ⇒ ไม่เตือน)
 */
export function openingMissing(x: { payDay: string; periodKey: string; startDay: string | null; hasOpening: boolean; hasEarlierRun: boolean }): boolean {
  if (x.hasOpening || x.hasEarlierRun) return false;
  const jan1 = `${String(x.payDay).slice(0, 4)}-01-01`;
  const from = x.startDay && x.startDay > jan1 ? x.startDay : jan1;
  return from < `${x.periodKey}-01`;
}

/** ยอดยกมา → แถวของแบบยื่นทั้งปี (50 ทวิ · ภ.ง.ด.1ก) — ไม่มีค่าจ้างฐานประกันสังคม/ส่วนนายจ้าง (ไม่เข้า สปส.1-10 / ภ.ง.ด.1 รายเดือน) */
export function openingFilingItem(o: Pick<OpeningRow, "id" | "employeeId" | "asOfDay" | "incomeSatang" | "whtSatang" | "ssoSatang">): FilingItem {
  return {
    employeeId: o.employeeId, runId: `opening:${o.id}`, engineVersion: 2, runStatus: "APPROVED", payDate: o.asOfDay,
    incomeSatang: o.incomeSatang, taxSatang: o.whtSatang, ssoWageActualSatang: 0, ssoWageClampedSatang: 0, ssoEmployeeSatang: o.ssoSatang, ssoEmployerSatang: 0,
  };
}

/** SSO_HIGH (Q13 เตือนเท่านั้น): เงินสมทบที่กรอก > จำนวนเดือน × เงินสมทบสูงสุดต่อเดือนตามกฎหมาย (ปัดบาทแบบ half-up) · ไม่มีตารางกฎหมาย = ไม่เตือน */
export function ssoHigh(o: Pick<OpeningInput, "months" | "ssoSatang">, law: { rateBp: number; maxBaseSatang: number } | null): boolean {
  if (!law || !Number.isSafeInteger(law.rateBp) || !Number.isSafeInteger(law.maxBaseSatang)) return false;
  const perMonth = Math.floor((2 * law.maxBaseSatang * law.rateBp + 1_000_000) / 2_000_000) * 100;
  return o.ssoSatang > o.months * perMonth;
}
