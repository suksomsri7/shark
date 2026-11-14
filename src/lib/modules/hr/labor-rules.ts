// HR H4.2 ▸ กติกาล้วนของ "ค่าแรงต่อยอดขาย (labor %)" + "ความต้องการคน" — ไม่มีฐานข้อมูล/นาฬิกา/สุ่ม (brief hr-brief-H4.2 §4 D1–D13 · R3)
//   เงิน = สตางค์จำนวนเต็ม · ปัดครึ่งขึ้นด้วย BigInt · วันที่ = สตริง YYYY-MM-DD ตามปฏิทินไทย · ชั่วโมง = คีย์เดียวกับ pos/reports.ts#reportHourly
//   มติผู้คุม Q4/Q4b: เต็มเดือน = เงินเดือน ÷ วันในเดือนปฏิทิน (Σ = เงินเดือน) · เข้า/ออกกลางเดือน = ยอดของเครื่องคิดเงินเดือน
//   min(เงินเดือน, ปัดครึ่งขึ้น(เงินเดือน × d / 30)) (payroll-run-rules.ts:333) เกลี่ยเท่า ๆ กันบนวันที่จ้าง ◂

export type LaborPayType = "MONTHLY" | "DAILY" | "HOURLY";
export type LaborSettings = { targetTenths: number; splhSatang: number | null; minStaff: number };

/** ค่าตั้งต้นของร้าน (AppSystem.settings.hrLabor) — splh ไม่ตั้ง = ไม่แสดงความต้องการคน (Q12) */
export const LABOR_DEFAULTS: LaborSettings = { targetTenths: 280, splhSatang: null, minStaff: 1 };
/** ขอบเขตของค่าตั้ง (R4) */
export const LABOR_BOUNDS = { targetTenths: [50, 600], splhSatang: [10_000, 100_000_000], minStaff: [0, 20] } as const;

// ═════════════ ข้อความคงที่ (ไทยเป็นหลัก · ไม่มีชื่อ/รหัส/ตัวเลข) ═════════════
export const LABOR_TEXT = {
  no: "คุณไม่มีสิทธิ์ดูข้อมูลค่าแรงของสาขานี้",
  unitRequired: "ร้านนี้มีหลายสาขา — เลือกสาขาก่อนดูค่าแรงต่อยอดขาย",
  bad: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองเลือกวันหรือสาขาใหม่",
  settingsNo: "คุณไม่มีสิทธิ์แก้ค่าตั้งค่าแรงต่อยอดขาย",
  settingsBad: "ค่าตั้งไม่อยู่ในช่วงที่กำหนด — ตรวจเป้าหมาย ยอดขายต่อคนต่อชั่วโมง และจำนวนคนขั้นต่ำอีกครั้ง",
  settingsFailed: "บันทึกค่าตั้งไม่สำเร็จ — ลองอีกครั้ง",
} as const;
export const LABOR_TEXT_EN: Record<keyof typeof LABOR_TEXT, string> = {
  no: "You do not have access to labour figures for this branch",
  unitRequired: "This shop has many branches — choose a branch first",
  bad: "The request is not valid — choose another day or branch",
  settingsNo: "You cannot change the labour-cost settings",
  settingsBad: "A setting is out of range — check the target, sales per staff-hour and minimum staff",
  settingsFailed: "The settings were not saved — please try again",
};
export type LaborText = Record<keyof typeof LABOR_TEXT, string>;
export function laborTextFor(locale: string | null | undefined): LaborText {
  return locale === "en" ? LABOR_TEXT_EN : LABOR_TEXT;
}

// ═════════════ ตัวช่วยเลข/วัน ═════════════
const B = (n: number) => BigInt(Math.trunc(n));
/** ปัดครึ่งขึ้นของ a ÷ b (a ≥ 0 · b > 0) */
function halfUp(a: bigint, b: bigint): number {
  return Number((2n * a + b) / (2n * b));
}
const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const isDayKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(utc(v)) && new Date(utc(v)).toISOString().slice(0, 10) === v;
export const addDays = (day: string, n: number): string => new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysInMonth = (day: string): number => {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};
export const dayDiff = (a: string, b: string): number => Math.round((utc(a) - utc(b)) / DAY_MS);
export const monthDays = (periodKey: string): string[] => {
  const n = daysInMonth(`${periodKey}-01`);
  return Array.from({ length: n }, (_, i) => `${periodKey}-${String(i + 1).padStart(2, "0")}`);
};
export const prevPeriod = (periodKey: string): string => addDays(`${periodKey}-01`, -1).slice(0, 7);
/** จันทร์ของสัปดาห์ (วันอาทิตย์ = วันสุดท้าย) */
export const mondayOf = (day: string): string => addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7));
/** วันธุรกิจของ POS (เวลาไทย − นาทีตัดวัน) ของเวลา ms */
export const businessDateAt = (atMs: number, cutoffMin: number): string => new Date(atMs + (7 * 60 - cutoffMin) * 60_000).toISOString().slice(0, 10);
/** คีย์ชั่วโมงของเวลา ms ในวันธุรกิจของมัน (กติกา reportHourly) */
export function hourKeyAt(atMs: number, cutoffMin: number): { date: string; hour: number } {
  const date = businessDateAt(atMs, cutoffMin);
  const first = Math.floor(cutoffMin / 60);
  let hour = Math.floor((atMs + 7 * 3_600_000 - utc(date)) / 3_600_000);
  if (hour > first + 23) hour = first;
  return { date, hour };
}

// ═════════════ D4 ค่าจ้างต่อวัน ═════════════
/**
 * ส่วนของเงินเดือนรายเดือนในวันหนึ่ง (มติ Q4/Q4b) — นอกช่วงจ้าง = 0
 *   ทั้งเดือน: ⌊base/D⌋ + (วันที่ ≤ base mod D ? 1 : 0) · บางส่วน: E = min(base, ปัดครึ่งขึ้น(base × d / 30)) เกลี่ยบน d วัน (วันต้น ๆ ได้เศษ)
 */
export function monthlyShare(i: { baseSatang: number; day: string; startDate?: string | null; endDate?: string | null }): number {
  const base = Math.max(0, Math.trunc(i.baseSatang || 0));
  const day = i.day;
  const first = `${day.slice(0, 7)}-01`;
  const D = daysInMonth(day);
  const last = `${day.slice(0, 7)}-${String(D).padStart(2, "0")}`;
  const s0 = i.startDate ? i.startDate.slice(0, 10) : null;
  const e0 = i.endDate ? i.endDate.slice(0, 10) : null;
  if ((s0 && day < s0) || (e0 && day > e0)) return 0;
  const s = s0 && s0 > first ? s0 : first;
  const e = e0 && e0 < last ? e0 : last;
  if (s === first && e === last) {
    const dom = Number(day.slice(8));
    return Math.floor(base / D) + (dom <= base % D ? 1 : 0);
  }
  const d = dayDiff(e, s) + 1;
  if (d <= 0) return 0;
  const E = Math.min(base, halfUp(B(base) * B(d), 30n));
  const k = dayDiff(day, s) + 1;
  return Math.floor(E / d) + (k <= E % d ? 1 : 0);
}

/** ค่าจ้างธรรมดาของวัน — MONTHLY = monthlyShare · DAILY = ปัดครึ่งขึ้น(อัตรา × min(N, m) / N) · HOURLY = ปัดครึ่งขึ้น(อัตรา × m / 60) */
export function dayWage(i: {
  payType: LaborPayType | string;
  baseSatang: number;
  dailySatang: number | null;
  hourlySatang: number | null;
  day: string;
  paidMin: number;
  normalMin: number;
  startDate?: string | null;
  endDate?: string | null;
}): number {
  const m = Math.max(0, Math.trunc(i.paidMin || 0));
  if (i.payType === "MONTHLY") return monthlyShare({ baseSatang: i.baseSatang, day: i.day, startDate: i.startDate, endDate: i.endDate });
  if (i.payType === "DAILY") {
    const N = Math.max(1, Math.trunc(i.normalMin || 480));
    const rate = Math.max(0, Math.trunc(i.dailySatang ?? 0));
    return halfUp(B(rate) * B(Math.min(N, m)), B(N));
  }
  if (i.payType === "HOURLY") return halfUp(B(Math.max(0, Math.trunc(i.hourlySatang ?? 0))) * B(m), 60n);
  return 0;
}

/**
 * ค่าทำงานในวันหยุด (ม.62 · ตัวหารเดียวกับเครื่องคิดเงินเดือน payroll-run-rules.ts:369) — bp null = ไม่มีกฎหมาย OT ⇒ 0
 *   PUBLIC: ทุกแบบค่าจ้าง · SHOP: รายเดือนเท่านั้น (รายวัน/ชั่วโมง = วันธรรมดา)
 */
export function holidayPremium(i: { payType: LaborPayType | string; rateSatang: number; paidMin: number; normalMin: number; kind: "PUBLIC" | "SHOP" | string; holidayWorkPaidBp: number | null }): number {
  if (i.holidayWorkPaidBp === null || i.holidayWorkPaidBp === undefined) return 0;
  if (i.kind === "SHOP" && i.payType !== "MONTHLY") return 0;
  if (i.kind !== "SHOP" && i.kind !== "PUBLIC") return 0;
  const m = Math.max(0, Math.trunc(i.paidMin || 0));
  const dayMin = Math.min(480, Math.max(1, Math.trunc(i.normalMin || 480)));
  const rate = Math.max(0, Math.trunc(i.rateSatang || 0));
  const den = i.payType === "MONTHLY" ? 30n * B(dayMin) * 10_000n : i.payType === "DAILY" ? B(dayMin) * 10_000n : 60n * 10_000n;
  return halfUp(B(rate) * B(m) * B(i.holidayWorkPaidBp), den);
}

/** D5 ประกันสังคมส่วนนายจ้างของวัน = ปัดครึ่งขึ้น(min(ค่าจ้าง × D, เพดาน) × อัตรา ÷ (10000 × D)) */
export function ssoEstimate(i: { wageSatang: number; daysInMonth: number; rateBp: number; maxBaseSatang: number }): number {
  const w = Math.max(0, Math.trunc(i.wageSatang || 0));
  const D = Math.max(1, Math.trunc(i.daysInMonth || 30));
  if (w === 0) return 0;
  const baseM = B(w) * B(D);
  const cap = B(Math.max(0, Math.trunc(i.maxBaseSatang || 0)));
  return halfUp((baseM < cap ? baseM : cap) * B(Math.max(0, Math.trunc(i.rateBp || 0))), 10_000n * B(D));
}

// ═════════════ D7 D8 แบ่งยอด ═════════════
/** แบ่ง total ตามน้ำหนัก — เศษให้ส่วนที่เศษมากก่อน · เท่ากัน = ตำแหน่งต้นก่อน · Σ = total (น้ำหนักรวม 0 ⇒ ทั้งหมดที่ตำแหน่งแรก) */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const T = B(total);
  const w = weights.map((x) => B(Math.max(0, x || 0)));
  const W = w.reduce((a, b) => a + b, 0n);
  if (W === 0n) return weights.map((_, i) => (i === 0 ? Number(T) : 0));
  const neg = T < 0n;
  const t = neg ? -T : T;
  const q = w.map((x) => (t * x) / W);
  const r = w.map((x) => (t * x) % W);
  let left = t - q.reduce((a, b) => a + b, 0n);
  const order = r.map((x, i) => [x, i] as const).sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : a[1] - b[1]));
  for (const [, i] of order) {
    if (left <= 0n) break;
    q[i] = q[i]! + 1n;
    left -= 1n;
  }
  return q.map((x) => Number(neg ? -x : x));
}

/**
 * D1 นาทีของกะวันที่ day (เวลาไทย) ⇒ คีย์ชั่วโมงของ POS [{date วันธุรกิจ, hour, minutes}] เรียงตามเวลา
 *   ชั่วโมง = นับจากเที่ยงคืนของวันธุรกิจ (หลังเที่ยงคืนก่อนเวลาตัดวัน = 24, 25 …) · ตัดวันไม่ลงชั่วโมงพอดี = เศษท้ายวันรวมในชั่วโมงแรก
 */
export function hourSlots(i: { day: string; startMin: number; endMin: number; crossesMidnight: boolean; cutoffMin: number }): { date: string; hour: number; minutes: number }[] {
  const start = Math.trunc(i.startMin);
  const end = Math.trunc(i.endMin) + (i.crossesMidnight ? 1440 : 0);
  const cutoff = Math.max(0, Math.trunc(i.cutoffMin || 0));
  const first = Math.floor(cutoff / 60);
  const base = utc(i.day);
  const out: { date: string; hour: number; minutes: number }[] = [];
  for (let L = start; L < end; L++) {
    const off = Math.floor((L - cutoff) / 1440);
    const date = new Date(base + off * DAY_MS).toISOString().slice(0, 10);
    let hour = Math.floor((L - off * 1440) / 60);
    if (hour > first + 23) hour = first;
    const last = out[out.length - 1];
    if (last && last.date === date && last.hour === hour) last.minutes += 1;
    else out.push({ date, hour, minutes: 1 });
  }
  return out;
}

// ═════════════ D11 D12 D13 ═════════════
/** คาดการณ์ยอดชั่วโมงของวัน day = ปัดครึ่งขึ้นของค่าเฉลี่ย 4 วันเดียวกันของสัปดาห์ล่าสุดที่ "ก่อนวันนี้" (ไม่มีขาย = 0) */
export function forecastHour(i: { day: string; today: string; valueOf: (date: string) => number }): number {
  let sum = 0;
  let got = 0;
  for (let k = 1; got < 4 && k < 400; k++) {
    const d = addDays(i.day, -7 * k);
    if (d >= i.today) continue;
    sum += Math.trunc(i.valueOf(d) || 0);
    got += 1;
  }
  return Math.floor((sum + 2) / 4);
}
/** วันที่ที่ forecastHour ใช้ (4 วัน) */
export function forecastDates(day: string, today: string): string[] {
  const out: string[] = [];
  for (let k = 1; out.length < 4 && k < 400; k++) {
    const d = addDays(day, -7 * k);
    if (d < today) out.push(d);
  }
  return out;
}
/** ค่าแรง ÷ ยอดขาย เป็นทศนิยม 1 ตำแหน่งของ % (‰) — ยอดขาย ≤ 0 = null */
export function pctTenths(cost: number, sales: number): number | null {
  if (!(sales > 0)) return null;
  return halfUp(B(Math.max(0, cost)) * 1000n, B(sales));
}
/** คนที่ต้องการในชั่วโมงนั้น — splh ไม่ตั้ง = null · คาดการณ์ ≤ 0 = 0 · อื่น ๆ = max(ขั้นต่ำ, ⌈คาดการณ์ ÷ splh⌉) */
export function needed(i: { forecastSatang: number; splhSatang: number | null; minStaff: number }): number | null {
  if (i.splhSatang === null || i.splhSatang === undefined || !(i.splhSatang > 0)) return null;
  if (!(i.forecastSatang > 0)) return 0;
  const f = B(i.forecastSatang);
  const s = B(i.splhSatang);
  return Math.max(Math.max(0, Math.trunc(i.minStaff || 0)), Number((f + s - 1n) / s));
}
/** จำนวนคนที่อยู่ในชั่วโมงนั้นอย่างน้อย 30 นาที (รวมทุกช่วงของคนเดียวกัน) */
export function scheduledAt(slots: readonly { employeeId: string; hour: number; minutes: number }[], hour: number): number {
  const by = new Map<string, number>();
  for (const s of slots) if (s.hour === hour) by.set(s.employeeId, (by.get(s.employeeId) ?? 0) + s.minutes);
  let n = 0;
  for (const m of by.values()) if (m >= 30) n += 1;
  return n;
}

// ═════════════ ค่าตั้ง ═════════════
const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
/** ค่าที่เก็บไว้ (เสีย/ไม่มี = ค่าตั้งต้นทีละคีย์) */
export function laborSettingsOf(raw: unknown): LaborSettings {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const s = o.splhSatang;
  return {
    targetTenths: intIn(o.targetTenths, ...LABOR_BOUNDS.targetTenths) ?? LABOR_DEFAULTS.targetTenths,
    splhSatang: s === null ? null : (intIn(s, ...LABOR_BOUNDS.splhSatang) ?? LABOR_DEFAULTS.splhSatang),
    minStaff: intIn(o.minStaff, ...LABOR_BOUNDS.minStaff) ?? LABOR_DEFAULTS.minStaff,
  };
}
/** ตรวจค่าที่ผู้ใช้ส่ง (ครบ 3 คีย์ · จำนวนเต็มในช่วง) — null = ไม่ผ่าน */
export function laborSettingsInput(raw: unknown): LaborSettings | null {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const t = intIn(o.targetTenths, ...LABOR_BOUNDS.targetTenths);
  const m = intIn(o.minStaff, ...LABOR_BOUNDS.minStaff);
  const s = o.splhSatang === null ? null : intIn(o.splhSatang, ...LABOR_BOUNDS.splhSatang);
  if (t === null || m === null || (o.splhSatang !== null && s === null)) return null;
  return { targetTenths: t, splhSatang: s, minStaff: m };
}
// ◂ HR H4.2
