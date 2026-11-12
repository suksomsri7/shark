// HR H2.9 ▸ กติกาล้วนของคำขอ OT (ไม่มีฐานข้อมูล · ไม่มีนาฬิกา · ไม่มีทศนิยมของเงิน) — ผู้เรียกส่ง "เวลา" เข้ามาเองทุกครั้ง
//
// กติกา (brief hr-brief-H2.9 R2–R4 · มติผู้คุม Q6 · Q7 · Q12):
//   • เงิน = สตางค์จำนวนเต็ม · คูณด้วย BigInt แล้วปัดครึ่งขึ้น "ครั้งเดียวต่อส่วน" (ไม่ปัดอัตราต่อชั่วโมงก่อน — ต่างจาก v1 ที่ปัดอัตราก่อน)
//   • ส่วน (ม.61–63 พ.ร.บ.คุ้มครองแรงงาน): มีกะ + วันทำงาน = OT_WORKDAY × workdayOtBp · มีกะ + วันหยุด (ร้านเปิด) = OT_HOLIDAY × holidayOtBp ·
//     ไม่มีกะ (วันหยุดประจำสัปดาห์/วันหยุด) = ชั่วโมงทำงานปกติแรก (hoursPerDay×60 นาที) เป็น HOLIDAY_WORK
//     (รายเดือน หรือวันหยุดนักขัตฤกษ์ = holidayWorkPaidBp · รายวัน/รายชั่วโมงในวันหยุดประจำสัปดาห์ = holidayWorkUnpaidBp) ส่วนที่เกิน = OT_HOLIDAY
//   • ฐานรายเดือน = เงินเดือน ÷ (daysPerMonth × hoursPerDay) (ม.68) — มติ Q6: ตัวหารห้ามทำให้อัตราต่ำกว่า ÷30 ÷8
//     ⇒ ใช้ min(daysPerMonth, 30) และ min(hoursPerDay, 8) ทุกจุด (ร้านยังไม่มีค่าตั้ง "ชั่วโมงทำงานปกติต่อวัน" — หนี้ D-H29-normal-hours)
//   • อัตรา OT ที่ตั้งเอง (otHourlyRateSatang = อัตรา OT วันทำงานต่อชั่วโมง ×1.5 แล้ว) ใช้กับ OT_WORKDAY เท่านั้น (Q12) และต้อง ≥ otLegalRateFloor
//   • นาทีที่จ่าย (มติ Q7 — ไม่ปัดเงียบ ๆ ให้ลูกจ้างเสีย): min(ช่วงที่ขอ ∩ เวลาที่ทำจริง, otMin ที่วัดได้) ปัดลงเป็นขั้น otRoundMin (1 · 15 · 30 · ค่าตั้งต้น 1)
//   • ช่วงยื่น: ก่อนเริ่ม หรือไม่เกิน afterHours ชม. หลังเลิก (0–72 · ตั้งต้น 24) · ล่วงหน้าไม่เกิน maxAheadDays วัน (1–90 · ตั้งต้น 31) · 15–960 นาที ◂

/** ตารางกฎหมาย OT ที่ใช้คิด (bp = ส่วนหมื่น · 15000 = ×1.5) */
export type OtLaw = { workdayOtBp: number; holidayWorkPaidBp: number; holidayWorkUnpaidBp: number; holidayOtBp: number; daysPerMonth: number; hoursPerDay: number };
/** ค่าตั้งต้นเมื่อยังไม่มีแถว OT ที่ ACTIVE (มติ Q6) */
export const OT_LAW_DEFAULT: OtLaw = { workdayOtBp: 15000, holidayWorkPaidBp: 10000, holidayWorkUnpaidBp: 20000, holidayOtBp: 30000, daysPerMonth: 30, hoursPerDay: 8 };
/** ตัวหารที่กฎหมายใช้เป็นเพดาน (ม.68: ÷30 ÷8) — ตัวหารของร้าน/ตารางห้ามใหญ่กว่านี้ */
const LEGAL_DAYS_MAX = 30;
const LEGAL_HOURS_MAX = 8;
const INT_MAX = 2_147_483_647;
const BP = 10_000;

export type OtSegmentClass = "OT_WORKDAY" | "OT_HOLIDAY" | "HOLIDAY_WORK";
export type OtSegment = { cls: OtSegmentClass; minutes: number; multiplierBp: number; amountSatang: number };
export type OtDayClass = "HOLIDAY" | "WORKDAY";
export type OtTiming = "BEFORE" | "AFTER";
export type OtPolicy = { afterHours: number; maxAheadDays: number; otRoundMin: number };
export const OT_POLICY_DEFAULT: OtPolicy = { afterHours: 24, maxAheadDays: 31, otRoundMin: 1 };
export const OT_POLICY_RANGE = { afterHours: { min: 0, max: 72 }, maxAheadDays: { min: 1, max: 90 }, otRoundMin: [1, 15, 30] as readonly number[] } as const;
export const OT_MIN_MINUTES = 15;
export const OT_MAX_MINUTES = 960;
/** ชั่วโมง OT ต่อสัปดาห์ที่กฎหมายกำหนด (36 ชม. — Q9 เตือนอย่างเดียว) */
export const OT_WEEK_WARN_MIN = 2160;

/** ข้อความคงที่ (ไทยทุกไบต์ — brief §3) · {n} = ค่าตั้ง · {d} = วันที่ไทย (พ.ศ.) */
export const OT_TEXT = {
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  noPermRequest: "คุณไม่มีสิทธิ์ยื่นคำขอ OT แทนพนักงานคนนี้",
  range: "เวลาเริ่มและเลิก OT ไม่ถูกต้อง — ตรวจวันที่และเวลาอีกครั้ง",
  tooShort: "คำขอ OT ต้องยาวอย่างน้อย 15 นาที",
  tooLong: "คำขอ OT ยาวได้ไม่เกิน 16 ชั่วโมงต่อครั้ง",
  late: "เลยกำหนดยื่นคำขอ OT แล้ว — ยื่นได้ก่อนทำหรือภายใน {n} ชั่วโมงหลังทำ",
  tooFar: "ยื่นคำขอ OT ล่วงหน้าได้ไม่เกิน {n} วัน",
  outOfEmployment: "วันที่ขอ OT อยู่นอกช่วงการจ้างงาน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว",
  overlap: "ช่วงเวลานี้มีคำขอ OT ที่รออนุมัติหรืออนุมัติแล้ว — ยกเลิกคำขอเดิมก่อน",
  dayOffOne: "วันหยุดยื่นคำขอ OT ได้วันละ 1 คำขอ — ยกเลิกคำขอเดิมแล้วยื่นใหม่ให้ครอบคลุมทั้งวัน",
  notFound: "ไม่พบคำขอ OT นี้ หรือคุณไม่มีสิทธิ์ดำเนินการ",
  self: "ตัดสินคำขอ OT ของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน",
  fourEyes: "อนุมัติคำขอ OT ที่คุณยื่นแทนพนักงานเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน",
  decided: "คำขอ OT นี้ตัดสินไปแล้ว",
  cancelNo: "ยกเลิกได้เฉพาะคำขอ OT ที่ยังรออนุมัติของคุณ",
  revokeReason: "ใส่เหตุผลที่ยกเลิก OT ที่อนุมัติแล้ว (3–200 ตัวอักษร)",
  listNo: "คุณไม่มีสิทธิ์ดูคำขอ OT",
  rateBad: "อัตรา OT ต่อชั่วโมงต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0",
  rateBelowLaw: "อัตรา OT ต่อชั่วโมงต้องไม่ต่ำกว่า 1.5 เท่าของค่าจ้างต่อชั่วโมงตามกฎหมาย",
  sAfter: "ระยะยื่นหลังทำต้องอยู่ระหว่าง 0 ถึง 72 ชั่วโมง",
  sAhead: "ยื่นล่วงหน้าได้ 1 ถึง 90 วัน",
  sRound: "หน่วยปัดนาที OT ที่จ่ายต้องเป็น 1, 15 หรือ 30 นาที",
  nTitleA: "คำขอ OT ได้รับอนุมัติ",
  nTitleR: "คำขอ OT ไม่ได้รับอนุมัติ",
  nTitleC: "OT ที่อนุมัติแล้วถูกยกเลิก",
  nBody: "คำขอ OT วันที่ {d}",
  adjNote: "ค่าล่วงเวลา (คำขอ OT) {d}",
  revNote: "ปรับค่าล่วงเวลา (คำขอ OT) {d}",
  failed: "บันทึกคำขอ OT ไม่สำเร็จ — กรุณาลองอีกครั้ง",
  // r2 (มติผู้คุม 12 พ.ย.)
  noRate: "ยังไม่ได้ตั้งค่าจ้างของพนักงานคนนี้ — ตั้งค่าจ้างก่อนจึงขอ OT ได้",
  leaveDay: "วันนี้มีใบลาเต็มวันที่อนุมัติแล้ว — ยกเลิกใบลาก่อนจึงขอ OT ได้",
  rateRecheck: "อัตรา OT ที่ตั้งไว้ต่ำกว่าเกณฑ์ตามกฎหมายของค่าจ้างใหม่ — แก้อัตรา OT ให้สูงขึ้นหรือล้างค่าก่อนบันทึก",
  rateNoBase: "ค่าจ้างฐานเป็น 0 — ตั้งอัตรา OT เองไม่ได้ ล้างอัตรา OT ก่อนบันทึก",
  otRow: "รายการนี้มาจากคำขอ OT — แก้ที่คำขอ OT (ยกเลิก OT ที่อนุมัติแล้ว) แล้วระบบจะปรับยอดให้เอง",
} as const;

/** รายการในหน้าคำขอ OT (R11) — ฐาน (ทุกผู้ดู) · amountSatang/segments เฉพาะเจ้าของร้าน/ผู้ดูเงินเดือน/ตัวพนักงานเอง (Q11) */
export type OtItemBase = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startAt: string;
  endAt: string;
  requestedMin: number;
  paidMin: number | null;
  timing: OtTiming;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  dayClass: OtDayClass;
  multiplierBp: number | null;
  warnWeek: boolean;
  settled: boolean;
  reason: string | null;
};
export type OtItemMoney = OtItemBase & { amountSatang: number | null; segments: OtSegment[] };
export type OtItem = OtItemBase | OtItemMoney;

// ═════════════ ตัวช่วยจำนวนเต็ม ═════════════
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const posInt = (v: unknown): v is number => isInt(v) && v > 0;
/** a/b ปัดครึ่งขึ้น (a ≥ 0, b > 0) */
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B60 = BigInt(60);
const divHalfUp = (a: bigint, b: bigint): bigint => (B2 * a + b) / (B2 * b);
/** a/b ปัดขึ้น (a ≥ 0, b > 0) */
const divCeil = (a: bigint, b: bigint): bigint => (a + b - B1) / b;
const floorStep = (n: number, step: number): number => (step > 1 ? n - (n % step) : n);
const MIN_MS = 60_000;

/** r2.5: ตัวคูณจากแถวกฎหมายยกขึ้นได้อย่างเดียว — ต่ำกว่าค่าตั้งต้นตามกฎหมาย = ใช้ค่าตั้งต้น (ทุกตัวคูณ) */
export function raised(law: OtLaw): OtLaw {
  const up = (v: number, d: number) => (posInt(v) && v > d ? v : d);
  return {
    ...law,
    workdayOtBp: up(law.workdayOtBp, OT_LAW_DEFAULT.workdayOtBp),
    holidayWorkPaidBp: up(law.holidayWorkPaidBp, OT_LAW_DEFAULT.holidayWorkPaidBp),
    holidayWorkUnpaidBp: up(law.holidayWorkUnpaidBp, OT_LAW_DEFAULT.holidayWorkUnpaidBp),
    holidayOtBp: up(law.holidayOtBp, OT_LAW_DEFAULT.holidayOtBp),
  };
}
/** ตัวหารที่ใช้จริง — ไม่ให้อัตราต่ำกว่า ÷30 ÷8 (มติ Q6) */
export function otDivisors(law: Pick<OtLaw, "daysPerMonth" | "hoursPerDay">): { days: number; hours: number } {
  const days = posInt(law.daysPerMonth) ? Math.min(law.daysPerMonth, LEGAL_DAYS_MAX) : LEGAL_DAYS_MAX;
  const hours = posInt(law.hoursPerDay) ? Math.min(law.hoursPerDay, LEGAL_HOURS_MAX) : LEGAL_HOURS_MAX;
  return { days, hours };
}

// ═════════════ ตารางกฎหมาย (Q6) ═════════════
export type OtLawRowIn = { id: string; kind: string; effectiveFrom: string | Date; status: string; json: unknown };
export type OtLawResult = { ok: true; law: OtLaw; lawRowId: string | null } | { ok: false; code: "LAW_AMBIGUOUS" | "LAW_SHAPE" };
const dayStr = (v: string | Date): string => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/**
 * กฎหมาย OT ที่มีผล ณ วันที่ทำงาน (`day` = "YYYY-MM-DD" ไทย): แถว kind OT สถานะ ACTIVE ที่ effectiveFrom มากสุด ≤ day ·
 * ไม่มี = OT_LAW_DEFAULT (lawRowId null) · สองแถววันเดียวกัน = LAW_AMBIGUOUS · ค่าไม่ใช่จำนวนเต็มบวก/ขาดคีย์บังคับ = LAW_SHAPE ·
 * json {workdayMultiplierBp, daysPerMonth, hoursPerDay} บังคับ · {holidayWorkPaidBp, holidayWorkUnpaidBp, holidayOtBp} ไม่มี = ค่าตั้งต้น
 */
export function otLawOf(rows: readonly OtLawRowIn[], day: string): OtLawResult {
  let best: OtLawRowIn[] = [];
  let bestDay = "";
  for (const r of rows ?? []) {
    if (!r || r.kind !== "OT" || r.status !== "ACTIVE") continue;
    const d = dayStr(r.effectiveFrom);
    if (d > day) continue;
    if (d > bestDay) {
      bestDay = d;
      best = [r];
    } else if (d === bestDay) best.push(r);
  }
  if (best.length === 0) return { ok: true, law: { ...OT_LAW_DEFAULT }, lawRowId: null };
  if (best.length > 1) return { ok: false, code: "LAW_AMBIGUOUS" };
  const row = best[0]!;
  const j = row.json && typeof row.json === "object" && !Array.isArray(row.json) ? (row.json as Record<string, unknown>) : null;
  if (!j) return { ok: false, code: "LAW_SHAPE" };
  const req = (k: string): number | null => (posInt(j[k]) ? (j[k] as number) : null);
  const opt = (k: string, d: number): number | null => (j[k] === undefined ? d : posInt(j[k]) ? (j[k] as number) : null);
  const law = {
    workdayOtBp: req("workdayMultiplierBp"),
    holidayWorkPaidBp: opt("holidayWorkPaidBp", OT_LAW_DEFAULT.holidayWorkPaidBp),
    holidayWorkUnpaidBp: opt("holidayWorkUnpaidBp", OT_LAW_DEFAULT.holidayWorkUnpaidBp),
    holidayOtBp: opt("holidayOtBp", OT_LAW_DEFAULT.holidayOtBp),
    daysPerMonth: req("daysPerMonth"),
    hoursPerDay: req("hoursPerDay"),
  };
  if (Object.values(law).some((v) => v === null)) return { ok: false, code: "LAW_SHAPE" };
  return { ok: true, law: raised(law as OtLaw), lawRowId: row.id };
}

// ═════════════ นาทีที่จ่าย (Q7) ═════════════
/**
 * นาทีที่จ่าย = ปัดลงเป็นขั้น stepMin ของ min(ช่วงที่ขอ ∩ [from, outAt], otMin ที่วัดได้) · ไม่มีเวลาออก = 0 ·
 * from = เวลาเลิกกะ (ช่องที่มีกะ) หรือเวลาเข้า (ช่องที่ไม่มีกะ) · otMin = HrAttendanceDay.otMin (H2.5)
 */
export function otPaidMinutes(i: { reqStart: Date; reqEnd: Date; from: Date | null; outAt: Date | null; otMin: number; stepMin: number }): number {
  if (!i?.outAt || !i.from || !(i.reqStart instanceof Date) || !(i.reqEnd instanceof Date)) return 0;
  const s = Math.max(i.reqStart.getTime(), i.from.getTime());
  const e = Math.min(i.reqEnd.getTime(), i.outAt.getTime());
  const overlap = e > s ? Math.floor((e - s) / MIN_MS) : 0;
  const measured = isInt(i.otMin) && i.otMin > 0 ? i.otMin : 0;
  const step = posInt(i.stepMin) ? i.stepMin : 1;
  return floorStep(Math.min(overlap, measured), step);
}

/**
 * r2.2 นาทีที่จ่ายจากช่วงที่ "ทำงานจริง" (รอบเข้า–ออก หักพัก/ช่องว่าง — ไม่ปัดด้วยขั้น otStepMin ของการลงเวลา):
 * Σ (ช่วงที่ขอ ∩ [from, ∞) ∩ ช่วงทำงาน) เป็นมิลลิวินาที → นาทีเต็ม → ปัดลงด้วย stepMin (otRoundMin) · from null = ทั้งวัน (ไม่มีกะ)
 */
export function otWorkedPaidMinutes(i: { reqStart: Date; reqEnd: Date; from: Date | null; worked: readonly { start: Date; end: Date }[]; stepMin: number }): number {
  if (!i || !(i.reqStart instanceof Date) || !(i.reqEnd instanceof Date) || !Array.isArray(i.worked)) return 0;
  const lo = Math.max(i.reqStart.getTime(), i.from ? i.from.getTime() : -Infinity);
  const hi = i.reqEnd.getTime();
  let ms = 0;
  for (const w of i.worked) {
    if (!(w?.start instanceof Date) || !(w?.end instanceof Date)) continue;
    const a = Math.max(lo, w.start.getTime());
    const b = Math.min(hi, w.end.getTime());
    if (b > a) ms += b - a;
  }
  const step = posInt(i.stepMin) ? i.stepMin : 1;
  return floorStep(Math.floor(ms / MIN_MS), step);
}

// ═════════════ เงิน (R3 · R4) ═════════════
export type OtProfile = { payType: "MONTHLY" | "DAILY" | "HOURLY" | string; baseSalarySatang: number; dailyRateSatang: number | null; hourlyRateSatang: number | null; otHourlyRateSatang: number | null };
export type OtAmountInput = OtProfile & { hasShift: boolean; dayClass: OtDayClass; minutes: number; law: OtLaw };
export type OtAmountResult = { ok: true; segments: OtSegment[]; amountSatang: number } | { ok: false; code: "NO_RATE" | "OVERFLOW" | "BAD_MINUTES" };

/** ค่าจ้างฐาน "ต่อนาที × หมื่น" เป็นเศษส่วน (ตัวตั้งต่อ bp·นาที, ตัวหาร) — ไม่มีอัตรา = null */
function baseRate(p: OtProfile, law: OtLaw): { num: bigint; den: bigint } | null {
  const { days, hours } = otDivisors(law);
  if (p.payType === "MONTHLY") return posInt(p.baseSalarySatang) ? { num: BigInt(p.baseSalarySatang), den: BigInt(days * hours * 60 * BP) } : null;
  if (p.payType === "DAILY") return posInt(p.dailyRateSatang) ? { num: BigInt(p.dailyRateSatang), den: BigInt(hours * 60 * BP) } : null;
  if (p.payType === "HOURLY") return posInt(p.hourlyRateSatang) ? { num: BigInt(p.hourlyRateSatang), den: BigInt(60 * BP) } : null;
  return null;
}

/** ค่า OT ของหนึ่งคำขอ — ส่วนตามอัตรา + ยอดรวม (สตางค์) · ฟังก์ชันล้วน (ไม่แก้ค่าที่ส่งเข้า) */
export function otAmount(i: OtAmountInput): OtAmountResult {
  if (!i || !isInt(i.minutes) || i.minutes < 0) return { ok: false, code: "BAD_MINUTES" };
  const law = raised(i.law ?? OT_LAW_DEFAULT);
  const { hours } = otDivisors(law);
  const parts: { cls: OtSegmentClass; minutes: number; multiplierBp: number }[] = [];
  if (i.hasShift) parts.push(i.dayClass === "HOLIDAY" ? { cls: "OT_HOLIDAY", minutes: i.minutes, multiplierBp: law.holidayOtBp } : { cls: "OT_WORKDAY", minutes: i.minutes, multiplierBp: law.workdayOtBp });
  else {
    const normal = Math.min(i.minutes, hours * 60);
    const paidDay = i.payType === "MONTHLY" || i.dayClass === "HOLIDAY";
    parts.push({ cls: "HOLIDAY_WORK", minutes: normal, multiplierBp: paidDay ? law.holidayWorkPaidBp : law.holidayWorkUnpaidBp });
    parts.push({ cls: "OT_HOLIDAY", minutes: i.minutes - normal, multiplierBp: law.holidayOtBp });
  }
  const live = parts.filter((x) => x.minutes > 0);
  if (!live.length) return { ok: true, segments: [], amountSatang: 0 };
  const rate = baseRate(i, law);
  const override = posInt(i.otHourlyRateSatang) ? BigInt(i.otHourlyRateSatang) : null;
  const segments: OtSegment[] = [];
  let total = B0;
  for (const x of live) {
    // r2.1a: อัตราที่ตั้งเองต่ำกว่าเกณฑ์ตามกฎหมาย (ข้อมูลเดิม/ค่าจ้างขึ้นภายหลัง) ⇒ จ่ายตามกฎหมาย — max(อัตราที่ตั้ง, ตามกฎหมาย) ไม่ต่ำกว่าเด็ดขาด
    const legal = rate ? divHalfUp(rate.num * BigInt(x.minutes) * BigInt(x.multiplierBp), rate.den) : null;
    let amt: bigint;
    if (x.cls === "OT_WORKDAY" && override !== null) {
      const own = divHalfUp(override * BigInt(x.minutes), B60);
      amt = legal !== null && legal > own ? legal : own;
    } else {
      if (legal === null) return { ok: false, code: "NO_RATE" };
      amt = legal;
    }
    if (amt > BigInt(INT_MAX)) return { ok: false, code: "OVERFLOW" };
    total += amt;
    segments.push({ ...x, amountSatang: Number(amt) });
  }
  if (total > BigInt(INT_MAX)) return { ok: false, code: "OVERFLOW" };
  return { ok: true, segments, amountSatang: Number(total) };
}

/** อัตรา OT วันทำงานต่อชั่วโมงขั้นต่ำตามกฎหมาย (ปัดขึ้น) = ค่าจ้างต่อชั่วโมง × workdayOtBp — ไม่มีค่าจ้างฐาน = null (R13 · Q12) */
export function otLegalRateFloor(p: OtProfile, law: OtLaw = OT_LAW_DEFAULT): number | null {
  const { days, hours } = otDivisors(law);
  const bp = BigInt(Math.max(posInt(law.workdayOtBp) ? law.workdayOtBp : 0, OT_LAW_DEFAULT.workdayOtBp));
  if (p?.payType === "MONTHLY") return posInt(p.baseSalarySatang) ? Number(divCeil(BigInt(p.baseSalarySatang) * bp, BigInt(days * hours * BP))) : null;
  if (p?.payType === "DAILY") return posInt(p.dailyRateSatang) ? Number(divCeil(BigInt(p.dailyRateSatang) * bp, BigInt(hours * BP))) : null;
  if (p?.payType === "HOURLY") return posInt(p.hourlyRateSatang) ? Number(divCeil(BigInt(p.hourlyRateSatang) * bp, BigInt(BP))) : null;
  return null;
}

// ═════════════ ช่วงยื่น (Q2) ═════════════
export type OtWindowCode = "RANGE" | "TOO_SHORT" | "TOO_LONG" | "LATE" | "TOO_FAR";
/** ตรวจช่วงเวลาที่ขอ ณ เวลา now — เวลาต้องลงตัวนาที · 15–960 นาที · ไม่เกิน afterHours หลังเลิก · ไม่เกิน maxAheadDays ล่วงหน้า */
export function otWindow(i: { startAt: Date; endAt: Date; now: Date; afterHours: number; maxAheadDays: number }): { ok: true; timing: OtTiming } | { ok: false; code: OtWindowCode } {
  const ok = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime());
  if (!i || !ok(i.startAt) || !ok(i.endAt) || !ok(i.now)) return { ok: false, code: "RANGE" };
  const s = i.startAt.getTime();
  const e = i.endAt.getTime();
  if (s % MIN_MS !== 0 || e % MIN_MS !== 0 || e <= s) return { ok: false, code: "RANGE" };
  const min = (e - s) / MIN_MS;
  if (min < OT_MIN_MINUTES) return { ok: false, code: "TOO_SHORT" };
  if (min > OT_MAX_MINUTES) return { ok: false, code: "TOO_LONG" };
  const now = i.now.getTime();
  const after = isInt(i.afterHours) && i.afterHours >= 0 ? i.afterHours : OT_POLICY_DEFAULT.afterHours;
  const ahead = posInt(i.maxAheadDays) ? i.maxAheadDays : OT_POLICY_DEFAULT.maxAheadDays;
  if (now > e + after * 3_600_000) return { ok: false, code: "LATE" };
  if (s - now > ahead * 86_400_000) return { ok: false, code: "TOO_FAR" };
  return { ok: true, timing: now < s ? "BEFORE" : "AFTER" };
}

/** ค่าตั้งที่เก็บไว้ (AppSystem.settings.hrOt) → นโยบายที่ใช้จริง — คีย์หาย/ผิดรูป/ผิดช่วง = ค่าตั้งต้นของคีย์นั้น (ไม่ throw) */
export function otPolicyOf(raw: unknown): OtPolicy {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const R = OT_POLICY_RANGE;
  const inR = (v: unknown, r: { min: number; max: number }): v is number => isInt(v) && v >= r.min && v <= r.max;
  return {
    afterHours: inR(o.afterHours, R.afterHours) ? o.afterHours : OT_POLICY_DEFAULT.afterHours,
    maxAheadDays: inR(o.maxAheadDays, R.maxAheadDays) ? o.maxAheadDays : OT_POLICY_DEFAULT.maxAheadDays,
    otRoundMin: isInt(o.otRoundMin) && R.otRoundMin.includes(o.otRoundMin) ? o.otRoundMin : OT_POLICY_DEFAULT.otRoundMin,
  };
}

/** ส่วนที่ตัวคูณสูงสุด (เก็บใน HrOtRequest.multiplierBp) — ไม่มีส่วน = null */
export const topMultiplierBp = (segments: readonly OtSegment[]): number | null => (segments.length ? Math.max(...segments.map((s) => s.multiplierBp)) : null);
/** เติม {n}/{d} ในข้อความคงที่ */
export const otText = (t: string, v: { n?: number | string; d?: string }): string => t.replace("{n}", String(v.n ?? "")).replace("{d}", v.d ?? "");
