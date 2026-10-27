// ─────────────────────────────────────────────────────────────
// dorm/calc.ts — สูตรเงินของหอพัก **ที่เดียว** (ใบสั่ง D.1 §3)
//
// 🔴 pure ล้วน: ไม่ import db/prisma/next · ไม่อ่านนาฬิกา · ไม่สุ่ม
// 🔴 เงิน = สตางค์จำนวนเต็มทุกตัว · อินพุตไม่ใช่จำนวนเต็ม ⇒ throw DormCalcError (ไม่ปัดเงียบ)
// 🔴 วันที่ = ข้อความ "YYYY-MM-DD" คิดด้วยเลขวันล้วน (ไม่ใช้ Date ตามเขตเวลาเครื่อง)
// ปัดเศษ = half-up ระดับสตางค์ด้วยจำนวนเต็ม (divRoundHalfUp) · ยกเว้นอัตราต้นทุนจริง = ปัดลง
// VAT ต่อบรรทัด = สูตรเดียวกับ computeTotals ของบัญชี V2 (account/totals.ts) — ข้อสอบเทียบสุ่ม
// ─────────────────────────────────────────────────────────────

import { evaluateLegal, type LegalMode, type LegalOutcome } from "../../core/settings/legal/th-rental-2568";

export class DormCalcError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "DormCalcError";
    this.code = code;
  }
}

// ─────────────────── ตัวช่วยตรวจอินพุต ───────────────────

function satang(n: number, label: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new DormCalcError("NON_INTEGER_SATANG", `${label} ต้องเป็นสตางค์จำนวนเต็ม ได้ ${String(n)}`);
  }
  if (n < 0) throw new DormCalcError("NEGATIVE_SATANG", `${label} ติดลบไม่ได้ ได้ ${n}`);
  return n;
}
/** คูณจำนวนเต็ม — ผลเกิน Number.MAX_SAFE_INTEGER ⇒ throw OVERFLOW (ไม่ยอมให้เงินคลาดเงียบ ๆ) */
function mul(a: number, b: number, label: string): number {
  const r = a * b;
  if (!Number.isSafeInteger(r)) throw new DormCalcError("OVERFLOW", `${label} ใหญ่เกินคำนวณจำนวนเต็มได้แม่นยำ (${a} × ${b})`);
  return r;
}
function add(a: number, b: number, label: string): number {
  const r = a + b;
  if (!Number.isSafeInteger(r)) throw new DormCalcError("OVERFLOW", `${label} ใหญ่เกินคำนวณจำนวนเต็มได้แม่นยำ`);
  return r;
}
function optSatang(n: number | null | undefined, label: string): number | null {
  return n === null || n === undefined ? null : satang(n, label);
}
function reading(n: number, label: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
    throw new DormCalcError("INVALID_READING", `${label} ต้องเป็นเลขมิเตอร์จำนวนเต็มไม่ติดลบ ได้ ${String(n)}`);
  }
  return n;
}
function count(n: number, label: string, code = "INVALID_COUNT"): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
    throw new DormCalcError(code, `${label} ต้องเป็นจำนวนเต็มไม่ติดลบ ได้ ${String(n)}`);
  }
  return n;
}

// ─────────────────── ปัดเศษ ───────────────────

/** n/d ปัด half-up (ครึ่งปัดออกจากศูนย์) ด้วยจำนวนเต็มล้วน · d > 0 */
export function divRoundHalfUp(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) {
    throw new DormCalcError("INVALID_DIVISION", `divRoundHalfUp ต้องการจำนวนเต็ม และตัวหาร > 0 (n=${String(n)}, d=${String(d)})`);
  }
  const neg = n < 0;
  const a = neg ? -n : n;
  let q = Math.trunc(a / d);
  let r = a - q * d;
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
    r -= d;
  }
  if (2 * r >= d) q += 1;
  return neg && q !== 0 ? -q : q;
}

/** floor(n/d) จำนวนเต็ม · n ≥ 0 · d > 0 */
function divFloor(n: number, d: number): number {
  let q = Math.trunc(n / d);
  let r = n - q * d;
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
  }
  return q;
}

// ─────────────────── ค่าน้ำไฟ ───────────────────

export type VatConfig = { registered: boolean; pricesIncludeVat: boolean };

/** ราคาที่กรอกจะถูกบวก VAT 7% ทีหลัง (จด VAT + ราคาไม่รวม VAT) */
const vatAddedOnTop = (vat: VatConfig | null | undefined): boolean => !!vat && vat.registered && !vat.pricesIncludeVat;

/**
 * อัตราต้นทุนจริง สตางค์/หน่วย (ปัดลง ไม่ให้เกินต้นทุน) · หน่วย ≤ 0 ⇒ null
 * บิลการไฟฟ้า/ประปา (`billSatang`) = ยอดรวม VAT แล้ว
 * - ไม่จด VAT / ราคารวม VAT: floor(บิล ÷ หน่วย)
 * - จด VAT + ราคาไม่รวม VAT: floor(บิล × 100/107 ÷ หน่วย) — กัน VAT ซ้อน (ผู้เช่าจ่าย อัตรา×1.07 ≤ ต้นทุน)
 *   เผื่อเศษ VAT: ปัด half-up ต่อบรรทัดเพิ่มได้ ≤ ครึ่งสตางค์ต่อห้อง
 *     ⇒ floor((บิล×100 − 50×ห้อง) ÷ (107×หน่วย)) ให้ Σgross ≤ บิล จริงแม้ห้องใช้ครบ 100% ของหน่วย
 *     ห้อง = `billedRooms` ถ้าส่ง (จำนวนบิลห้องที่แชร์บิลนี้ · เพดาน = หน่วย) · ไม่ส่ง = หน่วย (กรณีเลวสุด)
 */
export function actualCostRate(i: { billSatang: number; units: number; vat?: VatConfig | null; billedRooms?: number | null }): number | null {
  const bill = satang(i.billSatang, "billSatang");
  if (typeof i.units !== "number" || Number.isNaN(i.units)) throw new DormCalcError("INVALID_READING", "units ต้องเป็นตัวเลข");
  if (i.units <= 0) return null;
  const units = count(i.units, "units", "INVALID_READING");
  if (vatAddedOnTop(i.vat)) {
    // ห้องที่มีบรรทัด VAT ≠ 0 ใช้อย่างน้อย 1 หน่วย ⇒ จำนวนห้อง ≤ หน่วย · ไม่ส่ง billedRooms = เผื่อกรณีเลวสุด (ห้องละ 1 หน่วย)
    const rooms = i.billedRooms === undefined || i.billedRooms === null ? units : Math.min(units, count(i.billedRooms, "billedRooms"));
    const room = mul(bill, 100, "billSatang×100") - mul(rooms, 50, "rooms×50");
    return room <= 0 ? 0 : divFloor(room, mul(units, 107, "units×107"));
  }
  return divFloor(bill, units);
}

export type MeterSegment = { start: number; end: number; rolloverDigits?: number };

/** หน่วยรวมจากช่วงมิเตอร์ (เปลี่ยนมิเตอร์กลางรอบ = หลายช่วง) */
export function meterUnits(segments: MeterSegment[]): number {
  if (!Array.isArray(segments) || segments.length === 0) throw new DormCalcError("NO_SEGMENTS", "ไม่มีช่วงมิเตอร์");
  let total = 0;
  segments.forEach((s, i) => {
    const start = reading(s.start, `segments[${i}].start`);
    const end = reading(s.end, `segments[${i}].end`);
    if (end >= start) {
      total += end - start;
      return;
    }
    if (s.rolloverDigits === undefined) {
      throw new DormCalcError("METER_BACKWARDS", `เลขมิเตอร์ถอยหลัง ${start} → ${end} (ถ้าเปลี่ยนมิเตอร์ให้แยกเป็น 2 ช่วง)`);
    }
    const digits = s.rolloverDigits;
    if (!Number.isInteger(digits) || digits <= 0 || digits > 12) throw new DormCalcError("INVALID_READING", "rolloverDigits ไม่ถูกต้อง");
    const mod = 10 ** digits;
    if (start >= mod || end >= mod) throw new DormCalcError("INVALID_READING", "เลขมิเตอร์เกินจำนวนหลักที่กำหนด");
    total += end + mod - start;
  });
  return total;
}

export type TariffTier = { uptoUnits: number | null; rateE4: number };
/** `billedRooms` = จำนวนบิลห้องที่แชร์บิลต้นทุนนี้ (กันเศษ VAT ต่อบรรทัดทำให้ Σgross เกินบิล — ดู actualCostRate) */
export type ActualCostMethod = { kind: "ACTUAL_COST"; billSatang: number; billUnits: number; billedRooms?: number | null };
export type TariffMethod = { kind: "TARIFF"; tiers: TariffTier[]; ftE4: number };
export type FixedRateMethod = { kind: "FIXED_RATE"; satangPerUnit: number };
export type FlatMethod = { kind: "FLAT"; per: "ROOM" | "PERSON"; satang: number; persons?: number };
export type UtilityMethod = ActualCostMethod | TariffMethod | FixedRateMethod | FlatMethod;

export type UtilityChargeResult = { amountSatang: number; units: number; rateSatangPerUnit: number | null; minimumApplied: boolean };

function flatPersons(m: FlatMethod): number {
  return m.per === "PERSON" ? count(m.persons ?? 1, "persons") : 1;
}

/** ค่าน้ำ/ไฟ 4 วิธี (ความถูกกฎหมายเป็นหน้าที่ตัวตรวจ ไม่ใช่สูตร) */
export function utilityCharge(i: { method: UtilityMethod; units: number; minimumSatang?: number | null; vat?: VatConfig | null }): UtilityChargeResult {
  const units = count(i.units, "units", "INVALID_READING");
  const minimum = optSatang(i.minimumSatang, "minimumSatang");
  const m = i.method;
  let amount: number;
  let rate: number | null;
  switch (m.kind) {
    case "ACTUAL_COST": {
      const r = actualCostRate({ billSatang: m.billSatang, units: m.billUnits, vat: i.vat, billedRooms: m.billedRooms });
      if (r === null) throw new DormCalcError("NO_COST_BASIS", "หน่วยรวมของบิลต้องมากกว่า 0");
      rate = r;
      amount = mul(units, r, "units×rate");
      break;
    }
    case "TARIFF": {
      const ft = count(m.ftE4, "ftE4", "INVALID_RATE");
      let sumE4 = 0;
      let prev = 0;
      let covered = false;
      for (const t of m.tiers) {
        const rateE4 = count(t.rateE4, "rateE4", "INVALID_RATE");
        const cap = t.uptoUnits === null ? units : Math.min(units, count(t.uptoUnits, "uptoUnits", "INVALID_RATE"));
        if (cap > prev) {
          sumE4 = add(sumE4, mul(cap - prev, rateE4, "units×rateE4"), "ΣrateE4");
          prev = cap;
        }
        if (prev >= units) {
          covered = true;
          break;
        }
      }
      if (!covered && units > 0) throw new DormCalcError("TARIFF_INCOMPLETE", "ตารางอัตราไม่ครอบคลุมจำนวนหน่วย (ขั้นสุดท้ายต้อง uptoUnits = null)");
      sumE4 = add(sumE4, mul(units, ft, "units×ftE4"), "ΣrateE4");
      amount = divRoundHalfUp(sumE4, 100); // ปัดครั้งเดียวท้ายสุด
      rate = null;
      break;
    }
    case "FIXED_RATE": {
      const r = satang(m.satangPerUnit, "satangPerUnit");
      rate = r;
      amount = mul(units, r, "units×satangPerUnit");
      break;
    }
    case "FLAT": {
      const s = satang(m.satang, "satang");
      amount = mul(s, flatPersons(m), "flat×persons");
      rate = null;
      break;
    }
    default: {
      const never: never = m;
      throw new DormCalcError("UNKNOWN_METHOD", `ไม่รู้จักวิธีคิด ${String(never)}`);
    }
  }
  let minimumApplied = false;
  if (minimum !== null && minimum > amount) {
    amount = minimum;
    minimumApplied = true;
  }
  return { amountSatang: amount, units, rateSatangPerUnit: rate, minimumApplied };
}

/** มิเตอร์รวมเฉลี่ย (#14) — largest remainder จำนวนเต็ม · ผลรวมตรงเป๊ะ · คืนตามลำดับอินพุต */
export function allocateShared(i: {
  totalSatang: number;
  basis: "PERSON" | "ROOM" | "AREA";
  rooms: { roomId: string; persons?: number; areaSqmE2?: number }[];
}): { roomId: string; amountSatang: number }[] {
  const total = satang(i.totalSatang, "totalSatang");
  if (total < 0) throw new DormCalcError("NEGATIVE_SATANG", "ยอดรวมติดลบ");
  const weights = i.rooms.map((r, idx) =>
    i.basis === "ROOM" ? 1 : i.basis === "PERSON" ? count(r.persons ?? 0, `rooms[${idx}].persons`) : count(r.areaSqmE2 ?? 0, `rooms[${idx}].areaSqmE2`),
  );
  const W = weights.reduce((s, w) => add(s, w, "Σweight"), 0);
  if (W <= 0) throw new DormCalcError("NO_ALLOCATION_BASIS", "น้ำหนักรวมเป็น 0 — ไม่มีฐานเฉลี่ย");
  const base: number[] = [];
  const rem: number[] = [];
  weights.forEach((w) => {
    const prod = mul(total, w, "total×weight");
    const q = divFloor(prod, W);
    base.push(q);
    rem.push(prod - q * W);
  });
  let left = total - base.reduce((s, x) => s + x, 0);
  const order = rem.map((r, idx) => ({ r, idx })).sort((a, b) => b.r - a.r || a.idx - b.idx);
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k].idx] += 1;
  return i.rooms.map((r, idx) => ({ roomId: r.roomId, amountSatang: base[idx] }));
}

// ─────────────────── วันที่ (ข้อความ YYYY-MM-DD) ───────────────────

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new DormCalcError("INVALID_DATE", `ปี/เดือนไม่ถูกต้อง ${String(year)}-${String(month)}`);
  }
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!mt) throw new DormCalcError("INVALID_DATE", `วันที่ต้องเป็น YYYY-MM-DD ได้ ${String(ymd)}`);
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new DormCalcError("INVALID_DATE", `วันที่ไม่มีจริง ${ymd}`);
  return { y, m, d };
}

/** เลขวันนับจาก 1970-01-01 (proleptic Gregorian · อัลกอริทึม days-from-civil) */
function dayNumber(ymd: string): number {
  const { y: y0, m, d } = parseYmd(ymd);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function addDaysYmd(ymd: string, n: number): string {
  if (!Number.isInteger(n)) throw new DormCalcError("INVALID_DAYS", `จำนวนวันต้องเป็นจำนวนเต็ม ได้ ${String(n)}`);
  return fromDayNumber(dayNumber(ymd) + n);
}

/** จำนวนวันที่พักในงวด — นับรวมทั้งสองปลาย · ไม่ทับงวด ⇒ 0 */
export function occupiedDays(i: { periodStart: string; periodEnd: string; moveIn?: string | null; moveOut?: string | null }): number {
  let start = dayNumber(i.periodStart);
  let end = dayNumber(i.periodEnd);
  if (i.moveIn) start = Math.max(start, dayNumber(i.moveIn));
  if (i.moveOut) end = Math.min(end, dayNumber(i.moveOut));
  return end < start ? 0 : end - start + 1;
}

/** ค่าห้องเศษวัน (#27) */
export function prorate(i: { monthlySatang: number; days: number; daysInMonth: number; mode: "ACTUAL_DAYS" | "DIV_30" | "FULL_MONTH" }): number {
  const monthly = satang(i.monthlySatang, "monthlySatang");
  const days = count(i.days, "days", "INVALID_DAYS");
  const dim = count(i.daysInMonth, "daysInMonth", "INVALID_DAYS");
  if (days === 0) return 0;
  switch (i.mode) {
    case "ACTUAL_DAYS":
      if (dim === 0) throw new DormCalcError("INVALID_DAYS", "daysInMonth ต้องมากกว่า 0");
      return divRoundHalfUp(mul(monthly, Math.min(days, dim), "monthly×days"), dim);
    case "DIV_30":
      return divRoundHalfUp(mul(monthly, Math.min(days, 30), "monthly×days"), 30);
    case "FULL_MONTH":
      return monthly;
    default: {
      const never: never = i.mode;
      throw new DormCalcError("UNKNOWN_MODE", `ไม่รู้จักวิธีคิดเศษวัน ${String(never)}`);
    }
  }
}

// ─────────────────── ค่าปรับชำระล่าช้า (#31–34) ───────────────────

export type LateFeePolicy = {
  kind: "NONE" | "PER_DAY" | "ONCE" | "PERCENT";
  amountSatang?: number;
  percentBp?: number;
  capSatang?: number | null;
  graceDays: number;
};

export function lateFee(i: { policy: LateFeePolicy; dueDate: string; paidDate: string; overdueSatang: number }): {
  feeSatang: number;
  daysLate: number;
  chargeableDays: number;
  capped: boolean;
} {
  const p = i.policy;
  const amount = satang(p.amountSatang ?? 0, "amountSatang");
  const cap = optSatang(p.capSatang, "capSatang");
  const overdue = satang(i.overdueSatang, "overdueSatang");
  const bp = count(p.percentBp ?? 0, "percentBp", "INVALID_PERCENT");
  const grace = count(p.graceDays, "graceDays", "INVALID_DAYS");
  const daysLate = Math.max(0, dayNumber(i.paidDate) - dayNumber(i.dueDate));
  const chargeableDays = Math.max(0, daysLate - grace);
  let fee = 0;
  if (chargeableDays > 0) {
    switch (p.kind) {
      case "NONE":
        fee = 0;
        break;
      case "PER_DAY":
        fee = mul(amount, chargeableDays, "amount×days");
        break;
      case "ONCE":
        fee = amount;
        break;
      case "PERCENT":
        fee = divRoundHalfUp(mul(overdue, bp, "overdue×bp"), 10_000);
        break;
      default: {
        const never: never = p.kind;
        throw new DormCalcError("UNKNOWN_POLICY", `ไม่รู้จักชนิดค่าปรับ ${String(never)}`);
      }
    }
  }
  let capped = false;
  if (cap !== null && fee > cap) {
    fee = cap;
    capped = true;
  }
  return { feeSatang: fee, daysLate, chargeableDays, capped };
}

// ─────────────────── บิล + VAT ต่อบรรทัด ───────────────────

export type TaxKind = "EXEMPT" | "VAT7" | "NONE";
export type DormBillLine = {
  code: string;
  labelTh: string;
  qty: number;
  unitPriceSatang: number | null;
  amountSatang: number;
  taxKind: TaxKind;
  netSatang: number;
  vatSatang: number;
  grossSatang: number;
  meta?: Record<string, string | number>;
};
export type DormBillResult = { lines: DormBillLine[]; subtotalSatang: number; vatSatang: number; totalSatang: number };

export type BillLineInput = {
  code: string;
  labelTh: string;
  qty?: number;
  unitPriceSatang?: number | null;
  amountSatang: number;
  /** บังคับทุกบรรทัด (ไม่มี ⇒ throw MISSING_TAX_KIND) · RENT ต้อง EXEMPT */
  taxKind: TaxKind;
  meta?: Record<string, string | number>;
};

const VAT_PERCENT = 7;
const TAX_KINDS: readonly TaxKind[] = ["EXEMPT", "VAT7", "NONE"];

/** ค่าเช่าที่อยู่อาศัยยกเว้น VAT เสมอ (#21) — ตั้งเป็นอย่างอื่น ⇒ throw */
function assertRentExempt(code: string, taxKind: TaxKind | undefined): void {
  if (code === "RENT" && taxKind !== undefined && taxKind !== "EXEMPT") {
    throw new DormCalcError("RENT_MUST_BE_EXEMPT", `ค่าเช่าที่อยู่อาศัยต้องเป็นชนิดภาษี EXEMPT ได้ ${String(taxKind)}`);
  }
}

/** VAT ต่อบรรทัด — ตรงกับ computeTotals ของบัญชี V2 (INCLUDE: net = round(amount/1.07) · EXCLUDE: vat = round(amount×7%)) */
export function computeBill(i: { lines: BillLineInput[]; vat: VatConfig }): DormBillResult {
  const lines: DormBillLine[] = i.lines.map((l, idx) => {
    const amount = satang(l.amountSatang, `lines[${idx}].amountSatang`);
    const unitPrice = l.unitPriceSatang === undefined ? amount : optSatang(l.unitPriceSatang, `lines[${idx}].unitPriceSatang`);
    if (!TAX_KINDS.includes(l.taxKind)) throw new DormCalcError("MISSING_TAX_KIND", `lines[${idx}] (${l.code}) ต้องระบุชนิดภาษี EXEMPT/VAT7/NONE`);
    assertRentExempt(l.code, l.taxKind);
    const taxKind: TaxKind = i.vat.registered ? l.taxKind : "NONE";
    let net = amount;
    let vat = 0;
    if (taxKind === "VAT7") {
      if (i.vat.pricesIncludeVat) {
        net = divRoundHalfUp(mul(amount, 100, "amount×100"), 100 + VAT_PERCENT);
        vat = amount - net;
      } else {
        vat = divRoundHalfUp(mul(amount, VAT_PERCENT, "amount×7"), 100);
      }
    }
    const line: DormBillLine = {
      code: l.code,
      labelTh: l.labelTh,
      qty: l.qty ?? 1,
      unitPriceSatang: unitPrice,
      amountSatang: amount,
      taxKind,
      netSatang: net,
      vatSatang: vat,
      grossSatang: net + vat,
    };
    if (l.meta) line.meta = l.meta;
    return line;
  });
  return {
    lines,
    subtotalSatang: lines.reduce((s, l) => s + l.netSatang, 0),
    vatSatang: lines.reduce((s, l) => s + l.vatSatang, 0),
    totalSatang: lines.reduce((s, l) => s + l.grossSatang, 0),
  };
}

export type UtilityInput =
  | { kind: "METERED"; segments: MeterSegment[]; method: ActualCostMethod | TariffMethod | FixedRateMethod; minimumSatang?: number | null }
  | { kind: "FLAT"; method: FlatMethod }
  | { kind: "ALLOCATED"; amountSatang: number };

type UtilityLine = { qty: number; unitPriceSatang: number | null; amountSatang: number; meta?: Record<string, string | number> };

/** แปลงอินพุตน้ำ/ไฟ 3 แบบ → ข้อมูลบรรทัด (หน่วย · ราคาต่อหน่วย · ยอด · meta) */
export function utilityLine(u: UtilityInput, vat?: VatConfig | null): UtilityLine {
  switch (u.kind) {
    case "METERED": {
      const units = meterUnits(u.segments);
      const r = utilityCharge({ method: u.method, units, minimumSatang: u.minimumSatang, vat });
      const meta: Record<string, string | number> = {
        units,
        from: u.segments[0].start,
        to: u.segments[u.segments.length - 1].end,
        segments: u.segments.length,
      };
      if (r.minimumApplied) meta.minimumSatang = r.amountSatang;
      return { qty: units, unitPriceSatang: r.rateSatangPerUnit, amountSatang: r.amountSatang, meta };
    }
    case "FLAT": {
      if (u.method.kind !== "FLAT") throw new DormCalcError("UNKNOWN_METHOD", "อินพุตเหมาจ่ายต้องใช้วิธี FLAT");
      const r = utilityCharge({ method: u.method, units: 0 });
      return { qty: flatPersons(u.method), unitPriceSatang: satang(u.method.satang, "satang"), amountSatang: r.amountSatang };
    }
    case "ALLOCATED": {
      const a = satang(u.amountSatang, "amountSatang");
      return { qty: 1, unitPriceSatang: a, amountSatang: a };
    }
    default: {
      const never: never = u;
      throw new DormCalcError("UNKNOWN_METHOD", `ไม่รู้จักอินพุตค่าน้ำไฟ ${String(never)}`);
    }
  }
}

export type DormTaxSlot = "RENT" | "COMMON" | "ELEC" | "WATER" | "SERVICE" | "LATE_FEE";

/** ชนิดภาษีเริ่ม (#21) — ⚠️ LATE_FEE = NONE รอที่ปรึกษา/ผู้ตรวจบัญชี */
export const DEFAULT_DORM_TAX_KINDS: Readonly<Record<DormTaxSlot, TaxKind>> = {
  RENT: "EXEMPT",
  COMMON: "VAT7",
  ELEC: "VAT7",
  WATER: "VAT7",
  SERVICE: "VAT7",
  LATE_FEE: "NONE",
};

export type BuildDormBillInput = {
  rentSatang: number;
  commonFeeSatang: number;
  electricity?: UtilityInput | null;
  water?: UtilityInput | null;
  lateFeeSatang?: number;
  services?: { code: string; labelTh: string; amountSatang: number; taxKind?: TaxKind }[];
  taxKinds?: Partial<Record<DormTaxSlot, TaxKind>>;
  vat: VatConfig;
};

/** บิลรายเดือนของห้อง — ลำดับ RENT · COMMON · ELEC · WATER · SERVICE:* · LATE_FEE */
export function buildDormBill(input: BuildDormBillInput): DormBillResult {
  const tk = (slot: DormTaxSlot): TaxKind => input.taxKinds?.[slot] ?? DEFAULT_DORM_TAX_KINDS[slot];
  assertRentExempt("RENT", input.taxKinds?.RENT);
  // ค่าน้ำไฟคิดจากบิลต้นทุน (รวม VAT แล้ว) — ถอด VAT ก่อนคิดอัตราเฉพาะเมื่อบรรทัดนั้นจะถูกบวก VAT 7%
  const utilVat = (slot: "ELEC" | "WATER"): VatConfig | null => (tk(slot) === "VAT7" ? input.vat : null);
  const rent = satang(input.rentSatang, "rentSatang");
  const common = satang(input.commonFeeSatang, "commonFeeSatang");
  const late = satang(input.lateFeeSatang ?? 0, "lateFeeSatang");
  const lines: BillLineInput[] = [];
  lines.push({ code: "RENT", labelTh: "ค่าห้อง", qty: 1, unitPriceSatang: rent, amountSatang: rent, taxKind: tk("RENT") });
  if (common !== 0) lines.push({ code: "COMMON", labelTh: "ค่าส่วนกลาง", qty: 1, unitPriceSatang: common, amountSatang: common, taxKind: tk("COMMON") });
  if (input.electricity) {
    const u = utilityLine(input.electricity, utilVat("ELEC"));
    lines.push({ code: "ELEC", labelTh: "ค่าไฟฟ้า", ...u, taxKind: tk("ELEC") });
  }
  if (input.water) {
    const u = utilityLine(input.water, utilVat("WATER"));
    lines.push({ code: "WATER", labelTh: "ค่าน้ำประปา", ...u, taxKind: tk("WATER") });
  }
  for (const [idx, s] of (input.services ?? []).entries()) {
    const a = satang(s.amountSatang, `services[${idx}].amountSatang`);
    if (a === 0) continue;
    lines.push({ code: `SERVICE:${s.code}`, labelTh: s.labelTh, qty: 1, unitPriceSatang: a, amountSatang: a, taxKind: s.taxKind ?? tk("SERVICE") });
  }
  if (late !== 0) lines.push({ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", qty: 1, unitPriceSatang: late, amountSatang: late, taxKind: tk("LATE_FEE") });
  return computeBill({ lines, vat: input.vat });
}

/** รวมหลายบิล (รอบบิล) — byCode รวม grossSatang ตามโค้ดบรรทัด */
export function sumBills(bills: DormBillResult[]): { count: number; totalSatang: number; vatSatang: number; byCode: Record<string, number> } {
  const byCode: Record<string, number> = {};
  let total = 0;
  let vat = 0;
  for (const b of bills) {
    total += b.totalSatang;
    vat += b.vatSatang;
    for (const l of b.lines) byCode[l.code] = (byCode[l.code] ?? 0) + l.grossSatang;
  }
  return { count: bills.length, totalSatang: total, vatSatang: vat, byCode };
}

// ─────────────────── คืนเงินประกัน (A9 · ภาพ 07) ───────────────────

export type SettleDepositInput = {
  depositSatang: number;
  utilities: { code: "ELEC" | "WATER"; labelTh?: string; input: UtilityInput }[];
  damages: { labelTh: string; amountSatang: number; kind: "DAMAGE" | "NORMAL_WEAR"; evidenceCount: number }[];
  unpaidSatang: number;
  approvalThresholdSatang: number;
  legal: { mode: LegalMode; outOfScopeReason?: string | null };
};
export type SettleLineCode = "DEPOSIT" | "ELEC" | "WATER" | "DAMAGE" | "UNPAID";
export type SettleDepositResult =
  | {
      ok: true;
      lines: { code: SettleLineCode; labelTh: string; amountSatang: number }[];
      utilitiesSatang: number;
      damagesSatang: number;
      unpaidSatang: number;
      refundSatang: number;
      tenantOwesSatang: number;
      needsApproval: boolean;
      legal: LegalOutcome[];
    }
  | { ok: false; code: string; index: number };

export function settleDeposit(input: SettleDepositInput): SettleDepositResult {
  const deposit = satang(input.depositSatang, "depositSatang");
  const unpaid = satang(input.unpaidSatang, "unpaidSatang");
  const threshold = satang(input.approvalThresholdSatang, "approvalThresholdSatang");

  const legal: LegalOutcome[] = [];
  for (const [idx, d] of input.damages.entries()) {
    satang(d.amountSatang, `damages[${idx}].amountSatang`);
    const o = evaluateLegal("DEDUCTION_EVIDENCE", { kind: d.kind, evidenceCount: d.evidenceCount }, input.legal);
    if (o.level === "BLOCK") return { ok: false, code: o.code, index: idx };
    legal.push(o);
  }

  const lines: { code: SettleLineCode; labelTh: string; amountSatang: number }[] = [];
  lines.push({ code: "DEPOSIT", labelTh: "เงินประกัน", amountSatang: deposit });
  let utilities = 0;
  for (const u of input.utilities) {
    const a = utilityLine(u.input).amountSatang;
    utilities = add(utilities, a, "Σutilities");
    lines.push({ code: u.code, labelTh: u.labelTh ?? (u.code === "ELEC" ? "ค่าไฟฟ้า (มิเตอร์วันย้ายออก)" : "ค่าน้ำประปา (มิเตอร์วันย้ายออก)"), amountSatang: 0 - a });
  }
  let damages = 0;
  for (const d of input.damages) {
    damages = add(damages, d.amountSatang, "Σdamages");
    lines.push({ code: "DAMAGE", labelTh: d.labelTh, amountSatang: 0 - d.amountSatang });
  }
  lines.push({ code: "UNPAID", labelTh: "ค่าห้องค้างชำระ", amountSatang: 0 - unpaid });

  const net = deposit - utilities - damages - unpaid;
  return {
    ok: true,
    lines,
    utilitiesSatang: utilities,
    damagesSatang: damages,
    unpaidSatang: unpaid,
    refundSatang: net > 0 ? net : 0,
    tenantOwesSatang: net < 0 ? 0 - net : 0,
    // #48 เกินวงเงิน หรือมีรายการที่ตัวตรวจลดเป็น WARN ซึ่งต้องให้เจ้าของอนุมัติ
    needsApproval: damages > threshold || legal.some((o) => o.needsOwnerApproval),
    legal,
  };
}
