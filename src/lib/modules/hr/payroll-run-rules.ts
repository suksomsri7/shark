// HR H3.4 ▸ เครื่องคิดเงินเดือนรุ่น 2 ต่อพนักงาน 1 คน 1 งวด (engineVersion 2) — สูตรเต็มอยู่ที่ ledger/wo-notes/hr-H3.4-design.md §1
//
// 🔴 pure ล้วน: ข้อมูลเข้า + ชุดแถวกฎหมาย → ผลออก · ไม่มีฐานข้อมูล/นาฬิกา/สุ่ม/env/async · import ได้แค่ ./payroll-rules-v2 และ ./ot-rules ·
//    ไม่แก้ค่าที่รับเข้ามา (เรียง/กรองบนสำเนา)
// 🔴 เงิน = สตางค์จำนวนเต็มทุกขั้น · ผลคูณระหว่างทางคิดด้วย BigInt · ปัด "ครั้งเดียวต่อบรรทัด" ตามตาราง design §1.6
//    (PRORATION · DAY_WAGE · HOUR_WAGE · HOLIDAY_PAY · HOLIDAY_WORK = ครึ่งขึ้น · UNPAID_LEAVE และเพดานหัก = ปัดลง · ปสส./ภาษี = H3.3)
// 🔴 ไม่คิดเงินจากนาที OT ที่วัดได้ (ไม่มีช่อง OT ทำงาน/OT วันหยุด ในข้อมูลเข้า) — OT จ่ายผ่านคำขอ OT (H2.9) อย่างเดียว
// ตัวตั้ง (Thai law tags จาก skill shark-thai-law · [V] = ยืนยันแล้ว · [U] = ต้องให้นักบัญชี/ที่ปรึกษาตรวจ — เตือน ไม่บล็อก):
//   ม.68 ค่าจ้างต่อชั่วโมง = ค่าจ้างเดือน ÷ (30 × ชั่วโมงปกติเฉลี่ยต่อวัน) [V] · ÷30 สำหรับเข้า/ออกกลางเดือนและลาไม่รับค่าจ้าง [U]
//   ม.56 วันหยุดประจำสัปดาห์ของรายวัน/รายชั่วโมงไม่ได้ค่าจ้าง · วันหยุดตามประเพณีได้ค่าจ้าง [V] · ม.62 ทำงานในวันหยุด 1×/2× [V]
//   ม.76 หักค่าเสียหาย/เรียกคืนได้ประเภทละ ≤ 10 % รวม ≤ 20 % ของค่าจ้างงวด — เกินได้เมื่อลูกจ้างยินยอมเป็นหนังสือ (ม.77) [V]
//   ปสส. ฐาน/อัตราจากแถวกฎหมายที่มีผล (กฎกระทรวง 2568) [V] · ภาษีหัก ณ ที่จ่าย ป.96/2543 ข้อ 1(1) และ 1(5) [V]
import {
  LawEngineError,
  parseDeductionJson,
  parseSsoJson,
  parseTaxJson,
  ssoV2,
  whtYtdV2,
  type LawSetV2,
  type PriorV2,
} from "./payroll-rules-v2";
import { OT_LAW_DEFAULT, raised } from "./ot-rules";

// ═════════════ ค่าตั้งต้น + ชนิด ═════════════
/** ค่าตั้งต้นของร้าน (settings.hrPayroll) · เพดานหักตามกฎหมาย ม.76 = 10 % ต่อประเภท · 20 % รวม */
export const RUN_V2_DEFAULTS = { normalDayMin: 480, catCapBp: 1000, totalCapBp: 2000 } as const;
/** เพดานตามกฎหมาย — เกินได้เฉพาะรายการที่มีหนังสือยินยอม (ม.77) */
export const LEGAL_CAT_CAP_BP = 1000;
export const LEGAL_TOTAL_CAP_BP = 2000;
/** ส่วนของค่าจ้างที่แถวกฎหมาย ปสส. ระบุได้ (r3) */
export const SSO_WAGE_TOKENS = ["BASE", "HOLIDAY_WORK", "OT", "COMMISSION", "BONUS", "ALLOWANCE", "LATE_REFUND"] as const;
export type SsoWageToken = (typeof SSO_WAGE_TOKENS)[number];
/** แถว ปสส. ที่ไม่มีกุญแจ wageComponents = รายการนี้ (law file T-HR-09: OT · เบี้ยวันหยุด · โบนัส ไม่ใช่ค่าจ้างฐาน · ค่าคอมฯ นับ [U]) */
export const SSO_WAGE_DEFAULT: readonly SsoWageToken[] = ["BASE", "ALLOWANCE", "LATE_REFUND", "COMMISSION"];

export type RunPayType = "MONTHLY" | "DAILY" | "HOURLY";
export type RunDayClass = "WORKDAY" | "DAY_OFF" | "HOLIDAY" | "UNSCHEDULED";
export type RunHolidayKind = "PUBLIC" | "SHOP";
export type RunDayInput = {
  workDayId: string;
  day: string;
  dayClass: RunDayClass;
  holidayKind?: RunHolidayKind | null;
  workMin?: number;
  paidLeaveMin?: number;
  unpaidLeaveMin?: number;
  holidayWorkMin?: number;
  holidayPaidMin?: number;
  unplannedMin?: number;
  review?: readonly string[];
  /** Σ นาที HOLIDAY_WORK ของคำขอ OT ที่อนุมัติ+คิดเงินแล้วของวันนั้น (H2.9 segmentsJson) — ส่วนที่คำขอ OT จ่ายแล้ว */
  otHolidayWorkMin?: number;
};
export type RunAdjustmentKind = "OT" | "COMMISSION" | "BONUS" | "ALLOWANCE" | "REFUND" | "DEDUCTION" | "ADVANCE";
export type CarryClass = "ADVANCE" | "DAMAGES" | "OVERPAY";
export type RunAdjustmentInput = {
  id: string;
  kind: RunAdjustmentKind | string;
  sourceType?: string | null;
  amountSatang: number;
  /** มีหนังสือยินยอมให้หัก (ม.77) */
  consent?: boolean;
  /** ประเภทของแถวยกยอดหัก (sourceType CARRY_FORWARD) */
  carryCls?: "DAMAGES" | "OVERPAY" | null;
  /** เงินได้ครั้งเดียว (ป.96 ข้อ 1(5)) — BONUS นับเป็นครั้งเดียวเสมอ */
  oneOff?: boolean;
};
export type RunItemInputV2 = {
  employeeId?: string;
  payType: RunPayType;
  baseSalarySatang: number;
  dailyRateSatang?: number | null;
  hourlyRateSatang?: number | null;
  ssoEligible?: boolean;
  deductions?: { spouse?: unknown; children?: unknown } | null;
  periodKey: string;
  startDate?: string | null;
  endDate?: string | null;
  normalDayMin?: number;
  catCapBp?: number;
  totalCapBp?: number;
  monthIndex: number;
  prior?: Partial<PriorV2> | null;
  days?: readonly RunDayInput[];
  adjustments?: readonly RunAdjustmentInput[];
};
export type RunLineCode =
  | "BASE"
  | "PRORATION"
  | "DAY_WAGE"
  | "HOUR_WAGE"
  | "HOLIDAY_PAY"
  | "HOLIDAY_WORK"
  | "UNPAID_LEAVE"
  | "UNPAID_CAP"
  | "OT"
  | "COMMISSION"
  | "BONUS"
  | "ALLOWANCE"
  | "REFUND"
  | "LATE_RULE"
  | "ABSENT_RULE"
  | "ADVANCE"
  | "DEDUCTION";
export type RunLine = { code: RunLineCode; ref: string; day: string | null; minutes: number | null; amountSatang: number; requestedSatang?: number };
export type CarryEntry = { cls: CarryClass; amountSatang: number };
export type RunFlagV2 =
  | "PARTIAL_MONTH"
  | "HOLIDAY_LEAVE"
  | "SHOP_HOLIDAY"
  | "UNPLANNED"
  | "WORKED_ON_LEAVE"
  | "UNPAID_CAPPED"
  | "UNWORKED_CAPPED"
  | "SSO_MIN_BASE"
  | "SSO_ZERO_WAGE"
  | "SSO_COMMISSION_U"
  | "NEGATIVE_NET"
  | "CLAIM_CAPPED"
  | "CAP_NEEDS_CONSENT"
  | "CARRY_FORWARD"
  | "RECEIVABLE";
export type RunYtdJson = {
  monthIndex: number;
  prior: PriorV2;
  projectedIncomeSatang: number;
  projectedSsoSatang: number;
  projectedNetSatang: number;
  annualTaxSatang: number;
  remainingMonths: number;
};
export type RunItemV2 = {
  ok: true;
  engineVersion: 2;
  lines: RunLine[];
  /** ผลรวมบรรทัดค่าจ้าง (ก่อนรายการเพิ่ม/หัก) · E = E0 − ส่วนหักมาสาย/ขาดงานที่ใช้จริง */
  e0Satang: number;
  eSatang: number;
  whtIncomeSatang: number;
  ssoWageSatang: number;
  ssoBaseSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  whtOneOffSatang: number;
  availableSatang: number;
  advanceAppliedSatang: number;
  claimAppliedSatang: number;
  catCapSatang: number;
  totalCapSatang: number;
  carry: CarryEntry[];
  receivable: CarryEntry[];
  addSatang: number;
  deductSatang: number;
  /** = ยอดจ่ายก่อน ปสส./ภาษี (ความหมายเดียวกับรุ่น 1) = netSatang + ssoEmployeeSatang + whtSatang */
  grossSatang: number;
  netSatang: number;
  blocked: "NET_NEGATIVE" | null;
  flags: RunFlagV2[];
  lawRowIds: string[];
  ytdJson: RunYtdJson;
  ssoWageComponents: SsoWageToken[];
  finalPeriod: boolean;
};
export type RunRefusalCode = "LAW_MISSING" | "BAD_INPUT" | "BAD_MONTH" | "NO_RATE" | "BAD_KIND" | "LAW_SHAPE" | "BAD_DEDUCTION" | "BAD_SATANG" | "BAD_DAY";
export type RunItemResultV2 = RunItemV2 | { ok: false; code: RunRefusalCode };

// ═════════════ ตัวช่วยจำนวนเต็ม ═════════════
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const nonNeg = (v: unknown): v is number => isInt(v) && v >= 0;
const minuteOk = (v: unknown): boolean => v === undefined || v === null || (isInt(v) && v >= 0 && v <= 1440);
const B2 = BigInt(2);
const toNum = (b: bigint, what: string): number => {
  const n = Number(b);
  if (!Number.isSafeInteger(n)) throw new LawEngineError("BAD_SATANG", `${what} exceeds safe integer range`);
  return n;
};
/** a/b ปัดครึ่งขึ้น (a ≥ 0, b > 0) */
const halfUp = (a: bigint, b: bigint, what: string): number => toNum((B2 * a + b) / (B2 * b), what);
/** a/b ปัดลง (a ≥ 0, b > 0) */
const floorDiv = (a: bigint, b: bigint, what: string): number => toNum(a / b, what);
const big = (...xs: number[]): bigint => xs.reduce((acc, x) => acc * BigInt(x), BigInt(1));
const add = (what: string, ...xs: number[]): number => {
  const s = xs.reduce((acc, x) => acc + x, 0);
  if (!Number.isSafeInteger(s)) throw new LawEngineError("BAD_SATANG", `${what} exceeds safe integer range`);
  return s;
};
/** ลบโดยไม่ให้เกิด −0 */
const neg = (n: number): number => (n === 0 ? 0 : -n);
const minutesOf = (v: number | undefined): number => (isInt(v) ? v : 0);

// ═════════════ วันที่ (สตริง YYYY-MM-DD ล้วน — ไม่ใช้นาฬิกา) ═════════════
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const daysInMonth = (y: number, m: number): number => (m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
function validDay(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DAY_RE.exec(v);
  return !!m && Number(m[3]) <= daysInMonth(Number(m[1]), Number(m[2]));
}
function periodBounds(periodKey: string): { first: string; last: string; days: number } {
  const m = PERIOD_RE.exec(periodKey)!;
  const days = daysInMonth(Number(m[1]), Number(m[2]));
  return { first: `${periodKey}-01`, last: `${periodKey}-${String(days).padStart(2, "0")}`, days };
}

// ═════════════ ตรวจข้อมูลเข้า ═════════════
const PAY_TYPES = new Set(["MONTHLY", "DAILY", "HOURLY"]);
const DAY_CLASSES = new Set(["WORKDAY", "DAY_OFF", "HOLIDAY", "UNSCHEDULED"]);
const ADJ_KINDS = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND", "DEDUCTION", "ADVANCE"]);
const ADD_KINDS = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND"]);
const UNWORKED_SOURCES = new Set(["LATE_RULE", "ABSENT_RULE"]);
/** แหล่งของรายการหักที่เป็น "เรียกคืนค่าจ้างที่จ่ายเกิน" (ค่าคอมฯ ถูกถอน · OT ส่วนต่างติดลบ) — ไม่ได้อยู่ในรายการ ม.76 ตรงตัว [U] ⇒ เพดานประเภทของตัวเอง */
const OVERPAY_SOURCES = new Set(["CRM_COMMISSION", "POS_SALE_LINE", "OT_REQUEST"]);
const MINUTE_KEYS = ["workMin", "paidLeaveMin", "unpaidLeaveMin", "holidayWorkMin", "holidayPaidMin", "unplannedMin", "otHolidayWorkMin"] as const;

function badInput(i: RunItemInputV2): boolean {
  if (!isObj(i)) return true;
  if (!PAY_TYPES.has(i.payType as string)) return true;
  if (!nonNeg(i.baseSalarySatang)) return true;
  for (const r of [i.dailyRateSatang, i.hourlyRateSatang]) if (r !== undefined && r !== null && !nonNeg(r)) return true;
  if (i.ssoEligible !== undefined && typeof i.ssoEligible !== "boolean") return true;
  if (i.normalDayMin !== undefined && !(isInt(i.normalDayMin) && i.normalDayMin >= 60 && i.normalDayMin <= 720)) return true;
  for (const c of [i.catCapBp, i.totalCapBp]) if (c !== undefined && !(isInt(c) && c >= 0 && c <= 10_000)) return true;
  if (typeof i.periodKey !== "string" || !PERIOD_RE.test(i.periodKey)) return true;
  for (const d of [i.startDate, i.endDate]) if (d !== undefined && d !== null && !validDay(d)) return true;
  if (i.prior !== undefined && i.prior !== null) {
    if (!isObj(i.prior)) return true;
    for (const k of ["incomeSatang", "whtSatang", "ssoSatang"] as const) if (i.prior[k] !== undefined && !nonNeg(i.prior[k])) return true;
  }
  const b = periodBounds(i.periodKey);
  if (i.days !== undefined && !Array.isArray(i.days)) return true;
  const seenDay = new Set<string>();
  for (const d of i.days ?? []) {
    if (!isObj(d) || typeof d.workDayId !== "string" || !d.workDayId) return true;
    if (!validDay(d.day) || d.day < b.first || d.day > b.last || seenDay.has(d.day)) return true;
    seenDay.add(d.day);
    if (!DAY_CLASSES.has(d.dayClass as string)) return true;
    if (d.holidayKind !== undefined && d.holidayKind !== null && d.holidayKind !== "PUBLIC" && d.holidayKind !== "SHOP") return true;
    for (const k of MINUTE_KEYS) if (!minuteOk(d[k])) return true;
    if (d.review !== undefined && !(Array.isArray(d.review) && d.review.every((x) => typeof x === "string"))) return true;
  }
  if (i.adjustments !== undefined && !Array.isArray(i.adjustments)) return true;
  const seenAdj = new Set<string>();
  for (const a of i.adjustments ?? []) {
    if (!isObj(a) || typeof a.id !== "string" || !a.id || seenAdj.has(a.id)) return true;
    seenAdj.add(a.id);
    if (!isInt(a.amountSatang) || a.amountSatang <= 0) return true;
    if (a.sourceType !== undefined && a.sourceType !== null && typeof a.sourceType !== "string") return true;
    if (a.consent !== undefined && typeof a.consent !== "boolean") return true;
    if (a.oneOff !== undefined && typeof a.oneOff !== "boolean") return true;
    if (a.carryCls !== undefined && a.carryCls !== null && a.carryCls !== "DAMAGES" && a.carryCls !== "OVERPAY") return true;
  }
  return false;
}

function lawRow(set: unknown, kind: keyof LawSetV2): { id: string; json: unknown } | null {
  const r = isObj(set) ? set[kind] : undefined;
  return isObj(r) && typeof r.id === "string" && r.id ? { id: r.id, json: r.json } : null;
}

const byId = (a: RunAdjustmentInput, b: RunAdjustmentInput): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** แถวยกยอดก่อน แล้วตาม id */
const carryFirst = (a: RunAdjustmentInput, b: RunAdjustmentInput): number => {
  const ca = a.sourceType === "CARRY_FORWARD" ? 0 : 1;
  const cb = b.sourceType === "CARRY_FORWARD" ? 0 : 1;
  return ca !== cb ? ca - cb : byId(a, b);
};
const claimClass = (a: RunAdjustmentInput): "DAMAGES" | "OVERPAY" =>
  a.sourceType === "CARRY_FORWARD" ? (a.carryCls === "OVERPAY" ? "OVERPAY" : "DAMAGES") : a.sourceType && OVERPAY_SOURCES.has(a.sourceType) ? "OVERPAY" : "DAMAGES";

// ═════════════ เครื่องคิด ═════════════
/**
 * รายการเงินเดือนรุ่น 2 ของพนักงาน 1 คนใน 1 งวด — ลำดับปฏิเสธ: LAW_MISSING · BAD_INPUT · BAD_MONTH · NO_RATE · BAD_KIND ·
 * รหัสของ H3.3 (LAW_SHAPE · BAD_DEDUCTION · BAD_SATANG) ส่งผ่าน · ยอดสุทธิติดลบ = blocked NET_NEGATIVE (ไม่หักอะไรเพิ่ม · ผู้อนุมัติถูกปฏิเสธ)
 */
export function computeRunItemV2(input: RunItemInputV2, lawSet: LawSetV2): RunItemResultV2 {
  const ssoRow = lawRow(lawSet, "SSO");
  const taxRow = lawRow(lawSet, "TAX_BRACKET");
  const dedRow = lawRow(lawSet, "DEDUCTION");
  if (!ssoRow || !taxRow || !dedRow) return { ok: false, code: "LAW_MISSING" };
  if (badInput(input)) return { ok: false, code: "BAD_INPUT" };
  if (!isInt(input.monthIndex) || input.monthIndex < 1 || input.monthIndex > 12) return { ok: false, code: "BAD_MONTH" };
  const payType = input.payType;
  const daily = input.dailyRateSatang ?? 0;
  const hourly = input.hourlyRateSatang ?? 0;
  if ((payType === "DAILY" && !(daily > 0)) || (payType === "HOURLY" && !(hourly > 0))) return { ok: false, code: "NO_RATE" };
  if ((input.adjustments ?? []).some((a) => !ADJ_KINDS.has(a.kind))) return { ok: false, code: "BAD_KIND" };
  try {
    return compute(input, { sso: ssoRow, tax: taxRow, ded: dedRow });
  } catch (e) {
    if (e instanceof LawEngineError) return { ok: false, code: e.code as RunRefusalCode };
    throw e;
  }
}

type Rows = { sso: { id: string; json: unknown }; tax: { id: string; json: unknown }; ded: { id: string; json: unknown } };

function compute(input: RunItemInputV2, law: Rows): RunItemV2 {
  const ssoJson = parseSsoJson(law.sso.json);
  parseTaxJson(law.tax.json);
  parseDeductionJson(law.ded.json);
  const rawComponents = (law.sso.json as { wageComponents?: SsoWageToken[] }).wageComponents;
  const components: SsoWageToken[] = [...(rawComponents ?? SSO_WAGE_DEFAULT)];

  const payType = input.payType;
  const monthly = payType === "MONTHLY";
  const base = input.baseSalarySatang;
  const daily = input.dailyRateSatang ?? 0;
  const hourly = input.hourlyRateSatang ?? 0;
  const N = input.normalDayMin ?? RUN_V2_DEFAULTS.normalDayMin;
  const dayMin = Math.min(480, N); // ม.68: ÷30÷min(8 ชม., ชั่วโมงปกติเฉลี่ย) — เหมือน H2.9 otDayMinutes
  const catCapBp = input.catCapBp ?? RUN_V2_DEFAULTS.catCapBp;
  const totalCapBp = input.totalCapBp ?? RUN_V2_DEFAULTS.totalCapBp;
  const eligible = input.ssoEligible !== false;
  const prior: PriorV2 = { incomeSatang: input.prior?.incomeSatang ?? 0, whtSatang: input.prior?.whtSatang ?? 0, ssoSatang: input.prior?.ssoSatang ?? 0 };
  const otLaw = raised(OT_LAW_DEFAULT); // ตัวคูณทำงานในวันหยุด (ม.62) — ไม่ต่ำกว่าค่าตามกฎหมาย
  const pb = periodBounds(input.periodKey);
  const finalPeriod = !!input.endDate && input.endDate <= pb.last;
  const flags = new Set<RunFlagV2>();
  const lines: RunLine[] = [];

  // ── 1–2 เงินเดือน + เข้า/ออกกลางเดือน (÷30 · เพดาน = เงินเดือน · เต็มเดือนปฏิทิน = เงินเดือน) ──
  if (monthly) {
    lines.push({ code: "BASE", ref: "profile", day: null, minutes: null, amountSatang: base });
    const s = input.startDate && input.startDate > pb.first ? input.startDate : pb.first;
    const e = input.endDate && input.endDate < pb.last ? input.endDate : pb.last;
    if (s !== pb.first || e !== pb.last) {
      const outside = (input.startDate && input.startDate > pb.last) || (input.endDate && input.endDate < pb.first);
      const d = outside || s > e ? 0 : Number(e.slice(8)) - Number(s.slice(8)) + 1;
      const earned = Math.min(base, halfUp(big(base, d), BigInt(30), "proration"));
      lines.push({ code: "PRORATION", ref: "employment", day: null, minutes: d, amountSatang: neg(base - earned) });
      flags.add("PARTIAL_MONTH");
    }
  }

  // ── 3 รายวันตามลำดับวัน ──
  const days = [...(input.days ?? [])].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let holidayWorkSum = 0;
  for (const d of days) {
    const isHoliday = d.dayClass === "HOLIDAY";
    const kind: RunHolidayKind = d.holidayKind ?? "PUBLIC";
    const publicHoliday = isHoliday && kind === "PUBLIC";
    const shopDay = isHoliday && kind === "SHOP" && !monthly; // L4: วันปิดร้านของรายวัน/รายชั่วโมง = วันธรรมดา [U]
    const work = minutesOf(d.workMin);
    const paidLeaveRaw = minutesOf(d.paidLeaveMin);
    const paidLeave = isHoliday ? 0 : paidLeaveRaw; // ไม่จ่ายค่าวันหยุด + ค่าลาซ้อนวันเดียวกัน
    if (isHoliday && paidLeaveRaw > 0) flags.add("HOLIDAY_LEAVE");
    if (shopDay) flags.add("SHOP_HOLIDAY");
    const hwNet = Math.max(0, minutesOf(d.holidayWorkMin) - minutesOf(d.otHolidayWorkMin)); // ส่วนที่คำขอ OT จ่ายแล้วไม่จ่ายซ้ำ
    const hp = minutesOf(d.holidayPaidMin);
    const shopWork = shopDay ? hwNet : 0;
    if (payType === "DAILY") {
      const m = Math.min(N, work + paidLeave + shopWork);
      if (m > 0) lines.push({ code: "DAY_WAGE", ref: d.workDayId, day: d.day, minutes: m, amountSatang: halfUp(big(daily, m), BigInt(N), "day wage") });
      if (publicHoliday && hp > 0) {
        const hm = Math.min(N, hp);
        lines.push({ code: "HOLIDAY_PAY", ref: d.workDayId, day: d.day, minutes: hm, amountSatang: halfUp(big(daily, hm), BigInt(N), "holiday pay") });
      }
    } else if (payType === "HOURLY") {
      const m = work + paidLeave + shopWork;
      if (m > 0) lines.push({ code: "HOUR_WAGE", ref: d.workDayId, day: d.day, minutes: m, amountSatang: halfUp(big(hourly, m), BigInt(60), "hour wage") });
      if (publicHoliday && hp > 0) lines.push({ code: "HOLIDAY_PAY", ref: d.workDayId, day: d.day, minutes: hp, amountSatang: halfUp(big(hourly, hp), BigInt(60), "holiday pay") });
    }
    if (hwNet > 0 && !shopDay) {
      const bp = monthly || publicHoliday ? otLaw.holidayWorkPaidBp : otLaw.holidayWorkUnpaidBp; // ม.62(1) 1× · ม.62(2) 2×
      const [rate, den] = monthly ? [base, big(30, dayMin, 10_000)] : payType === "DAILY" ? [daily, big(dayMin, 10_000)] : [hourly, big(60, 10_000)];
      const amt = halfUp(big(rate, hwNet, bp), den, "holiday work");
      holidayWorkSum = add("holiday work", holidayWorkSum, amt);
      lines.push({ code: "HOLIDAY_WORK", ref: d.workDayId, day: d.day, minutes: hwNet, amountSatang: amt });
    }
    const unpaid = minutesOf(d.unpaidLeaveMin);
    if (monthly && unpaid > 0) {
      lines.push({ code: "UNPAID_LEAVE", ref: d.workDayId, day: d.day, minutes: unpaid, amountSatang: neg(floorDiv(big(base, unpaid), big(30, N), "unpaid leave")) });
    }
    if (minutesOf(d.unplannedMin) > 0) flags.add("UNPLANNED");
    if ((d.review ?? []).includes("WORKED_ON_LEAVE")) flags.add("WORKED_ON_LEAVE");
  }

  // ── 4–5 เพดานลาไม่รับค่าจ้าง: ค่าจ้างงวดไม่ติดลบ ──
  const payLinesSum = add("pay lines", ...lines.map((l) => l.amountSatang));
  if (payLinesSum < 0) {
    lines.push({ code: "UNPAID_CAP", ref: "employment", day: null, minutes: null, amountSatang: -payLinesSum });
    flags.add("UNPAID_CAPPED");
  }
  const e0 = Math.max(0, payLinesSum);

  // ── รายการเพิ่ม/หัก ──
  const adjs = [...(input.adjustments ?? [])];
  const adds = adjs.filter((a) => ADD_KINDS.has(a.kind)).sort(byId);
  const unworked = adjs.filter((a) => a.kind === "DEDUCTION" && !!a.sourceType && UNWORKED_SOURCES.has(a.sourceType)).sort(byId);
  const advances = adjs.filter((a) => a.kind === "ADVANCE").sort(carryFirst);
  const claims = adjs.filter((a) => a.kind === "DEDUCTION" && !(a.sourceType && UNWORKED_SOURCES.has(a.sourceType))).sort(carryFirst);

  const sumKind = (k: string, pred: (a: RunAdjustmentInput) => boolean = () => true) => add(k, ...adds.filter((a) => a.kind === k && pred(a)).map((a) => a.amountSatang));
  const isLateRefund = (a: RunAdjustmentInput) => !!a.sourceType && UNWORKED_SOURCES.has(a.sourceType);
  const ot = sumKind("OT");
  const commission = sumKind("COMMISSION");
  const bonus = sumKind("BONUS");
  const lateRefund = sumKind("ALLOWANCE", isLateRefund);
  const allowance = sumKind("ALLOWANCE", (a) => !isLateRefund(a));
  const refund = sumKind("REFUND");
  const taxableAdds = add("additions", ot, commission, bonus, lateRefund, allowance);
  const oneOff = add("one-off", ...adds.filter((a) => a.kind !== "REFUND" && (a.kind === "BONUS" || a.oneOff === true)).map((a) => a.amountSatang));
  for (const a of adds) lines.push({ code: a.kind as RunLineCode, ref: a.id, day: null, minutes: null, amountSatang: a.amountSatang });

  // มาสาย/ขาดงาน (H3.2): ลดค่าจ้างที่ต้องเสียภาษี + ฐาน ปสส. · ไม่เกินค่าจ้างงวด · ส่วนเกินทิ้ง ไม่ยกไป
  let unworkedApplied = 0;
  for (const a of unworked) {
    const applied = Math.min(a.amountSatang, e0 - unworkedApplied);
    if (applied < a.amountSatang) flags.add("UNWORKED_CAPPED");
    unworkedApplied += applied;
    lines.push({ code: a.sourceType as "LATE_RULE" | "ABSENT_RULE", ref: a.id, day: null, minutes: null, amountSatang: neg(applied), requestedSatang: a.amountSatang });
  }
  const E = e0 - unworkedApplied;

  // ── ฐาน ปสส. จากรายการในแถวกฎหมาย (r3) ──
  const whtIncome = add("40(1) income", E, taxableAdds);
  const part: Record<SsoWageToken, number> = {
    BASE: Math.max(0, E - holidayWorkSum),
    HOLIDAY_WORK: holidayWorkSum,
    OT: ot,
    COMMISSION: commission,
    BONUS: bonus,
    ALLOWANCE: allowance,
    LATE_REFUND: lateRefund,
  };
  const ssoWageAll = add("SSO wage", ...components.map((c) => part[c]));
  // r4 (fix round 1 F4): ไม่มีค่าจ้างฐาน ปสส. ในงวด (ลาไม่รับค่าจ้างทั้งเดือน · ฐาน 0 · หักสาย/ขาดเท่าค่าจ้าง) ⇒ ไม่มีเงินสมทบ + เตือน SSO_ZERO_WAGE [U] ·
  //   มีค่าจ้างแต่ต่ำกว่าฐานขั้นต่ำ ⇒ ฐานขั้นต่ำ (83 ฿) + เตือน SSO_MIN_BASE (ไม่บล็อกเอง — L5)
  const zeroWage = eligible && ssoWageAll === 0;
  const sso = eligible && !zeroWage ? ssoV2(ssoWageAll, ssoJson) : { baseSatang: 0, employeeSatang: 0, employerSatang: 0 };
  if (zeroWage) flags.add("SSO_ZERO_WAGE");
  else if (eligible && ssoWageAll < ssoJson.minBaseSatang) flags.add("SSO_MIN_BASE");
  if (eligible && commission > 0 && components.includes("COMMISSION")) flags.add("SSO_COMMISSION_U");

  // ── ภาษีหัก ณ ที่จ่าย: ปกติแบบสะสมทั้งปี (ป.96 ข้อ 1(1)) + เงินได้ครั้งเดียว (ข้อ 1(5)) ──
  const regular = monthly ? base : E; // รายวัน/รายชั่วโมง: ตัวแทนจนกว่า NA-11
  const regularSso = eligible && regular > 0 ? ssoV2(regular, ssoJson).employeeSatang : 0;
  const dIn = input.deductions;
  const deductions = isObj(dIn) ? { spouse: dIn.spouse === true, children: (dIn.children ?? 0) as number } : (dIn as undefined); // D-9: spouse เป็น boolean ก่อนเข้า H3.3
  const ytdIn = {
    monthIndex: input.monthIndex,
    regularMonthlySatang: regular,
    priorIncomeSatang: prior.incomeSatang,
    priorWhtSatang: prior.whtSatang,
    currentSsoSatang: sso.employeeSatang,
    regularSsoSatang: regularSso,
    priorSsoSatang: prior.ssoSatang,
    deductions,
  };
  const y0 = whtYtdV2({ ...ytdIn, currentIncomeSatang: whtIncome - oneOff }, law.tax.json, law.ded.json);
  const whtOneOff = oneOff > 0 ? Math.max(0, whtYtdV2({ ...ytdIn, currentIncomeSatang: whtIncome }, law.tax.json, law.ded.json).annualTaxSatang - y0.annualTaxSatang) : 0;
  const wht = add("WHT", y0.whtSatang, whtOneOff);

  // ── ยอดที่หักได้ + เพดาน ม.76 ──
  const available = add("available", E, taxableAdds, refund) - sso.employeeSatang - wht;
  const lpaWage = add("s.76 wage", E, ot, commission, allowance, lateRefund);
  const capOf = (bp: number) => floorDiv(big(lpaWage, bp), BigInt(10_000), "s.76 cap");
  const catCapSatang = capOf(catCapBp);
  const totalCapSatang = capOf(totalCapBp);
  const uncollected: Record<CarryClass, number> = { ADVANCE: 0, DAMAGES: 0, OVERPAY: 0 };
  let advanceApplied = 0;
  let claimApplied = 0;
  const blocked = available < 0 ? ("NET_NEGATIVE" as const) : null;
  if (blocked) {
    flags.add("NEGATIVE_NET");
    for (const a of [...advances, ...claims]) lines.push({ code: a.kind as "ADVANCE" | "DEDUCTION", ref: a.id, day: null, minutes: null, amountSatang: 0, requestedSatang: a.amountSatang });
  } else {
    // เบิกล่วงหน้า = ค่าจ้างที่จ่ายก่อน หักคืนได้ไม่เกินยอดสุทธิ [U]
    for (const a of advances) {
      const applied = Math.min(a.amountSatang, available - advanceApplied);
      advanceApplied += applied;
      uncollected.ADVANCE += a.amountSatang - applied;
      lines.push({ code: "ADVANCE", ref: a.id, day: null, minutes: null, amountSatang: neg(applied), requestedSatang: a.amountSatang });
    }
    const used: Record<"DAMAGES" | "OVERPAY", number> = { DAMAGES: 0, OVERPAY: 0 };
    let usedTotal = 0;
    for (const a of claims) {
      const cls = claimClass(a);
      const consent = a.consent === true;
      const effCat = consent ? catCapBp : Math.min(catCapBp, LEGAL_CAT_CAP_BP);
      const effTot = consent ? totalCapBp : Math.min(totalCapBp, LEGAL_TOTAL_CAP_BP);
      const availLeft = available - advanceApplied - claimApplied;
      const capLeft = Math.max(0, Math.min(capOf(effCat) - used[cls], capOf(effTot) - usedTotal));
      const applied = Math.max(0, Math.min(a.amountSatang, capLeft, availLeft));
      if (capLeft < a.amountSatang && capLeft < availLeft) flags.add("CLAIM_CAPPED");
      if (!consent && (catCapBp > LEGAL_CAT_CAP_BP || totalCapBp > LEGAL_TOTAL_CAP_BP)) {
        const shopLeft = Math.max(0, Math.min(catCapSatang - used[cls], totalCapSatang - usedTotal));
        if (Math.max(0, Math.min(a.amountSatang, shopLeft, availLeft)) > applied) flags.add("CAP_NEEDS_CONSENT");
      }
      used[cls] += applied;
      usedTotal += applied;
      claimApplied += applied;
      uncollected[cls] += a.amountSatang - applied;
      lines.push({ code: "DEDUCTION", ref: a.id, day: null, minutes: null, amountSatang: neg(applied), requestedSatang: a.amountSatang });
    }
  }
  const owed: CarryEntry[] = (["ADVANCE", "DAMAGES", "OVERPAY"] as const).filter((c) => uncollected[c] > 0).map((c) => ({ cls: c, amountSatang: uncollected[c] }));
  // L8: งวดสุดท้ายของคนที่ออก — ไม่ยกไป (ค่าจ้างงวดสุดท้ายจ่ายภายใน 3 วัน ม.70) ⇒ ลูกหนี้พนักงาน (H3.7)
  const carry = finalPeriod ? [] : owed;
  const receivable = finalPeriod ? owed : [];
  if (carry.length) flags.add("CARRY_FORWARD");
  if (receivable.length) flags.add("RECEIVABLE");

  const net = available - advanceApplied - claimApplied;
  const addSatang = add("add", taxableAdds, refund);
  const deductSatang = add("deduct", unworkedApplied, advanceApplied, claimApplied);
  const gross = e0 + addSatang - deductSatang;
  return {
    ok: true,
    engineVersion: 2,
    lines,
    e0Satang: e0,
    eSatang: E,
    whtIncomeSatang: whtIncome,
    ssoWageSatang: eligible ? ssoWageAll : 0,
    ssoBaseSatang: sso.baseSatang,
    ssoEmployeeSatang: sso.employeeSatang,
    ssoEmployerSatang: sso.employerSatang,
    whtSatang: wht,
    whtOneOffSatang: whtOneOff,
    availableSatang: available,
    advanceAppliedSatang: advanceApplied,
    claimAppliedSatang: claimApplied,
    catCapSatang,
    totalCapSatang,
    carry,
    receivable,
    addSatang,
    deductSatang,
    grossSatang: gross,
    netSatang: net,
    blocked,
    flags: [...flags].sort(),
    lawRowIds: [law.sso.id, law.tax.id, law.ded.id].sort(),
    ytdJson: {
      monthIndex: input.monthIndex,
      prior,
      projectedIncomeSatang: y0.projectedIncomeSatang,
      projectedSsoSatang: y0.projectedSsoSatang,
      projectedNetSatang: y0.projectedNetSatang,
      annualTaxSatang: y0.annualTaxSatang,
      remainingMonths: y0.remainingMonths,
    },
    ssoWageComponents: components,
    finalPeriod,
  };
}
// ◂ HR H3.4
