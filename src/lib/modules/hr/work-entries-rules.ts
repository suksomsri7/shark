// HR H3.1 ▸ ชั่วโมงทำงานรายวัน (work entries) — ฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา · จำนวนเต็มทุกตัว · ปัดลงเป็นนาที)
//
// ที่มาของทุกรายการเงินเดือนรุ่น 2: ตารางกะ + ผลลงเวลาที่บันทึก (HrAttendanceDay) + ใบลา + วันหยุด → 1 แถวต่อพนักงานต่อวัน
// กติกา (brief hr-brief-H3.1 R3 · มติผู้คุม Q1–Q16 · A4 แก้: เก็บนาทีดิบ ไม่ปัดเป็นขั้น OT):
//   • ใช้เฉพาะช่องที่บันทึกแล้ว (stored && final) · ช่องสดยังไม่ปิดวัน = NOT_FINAL · ปิดแล้วยังไม่บันทึก = NOT_STORED (ไม่นับนาที)
//   • ชนิดวัน: วันหยุด ⇒ HOLIDAY · มีกะ/ไม่มีตาราง ⇒ WORKDAY · ช่อง DAY_OFF ⇒ DAY_OFF · ไม่มีช่อง ⇒ UNSCHEDULED
//   • พักตามตาราง (Q3 · ม.27): หักส่วนพักที่ไม่ได้ลงเวลา เมื่อทำงานเกิน 5 ชม. เท่านั้น ไม่ให้เหลือต่ำกว่า 5 ชม. ไม่หักซ้ำ — breakDeduction()
//   • OT = นาทีที่วัดได้เท่านั้น (ไม่สร้างรายการเงิน — OT ที่อนุมัติจ่ายผ่าน HrPayAdjustment ของ H2.9 ที่เดียว)
// ไม่มีเงินในไฟล์นี้ ◂
import { createHash } from "node:crypto";
import { addDays } from "./time-rules";

export const WORK_ENTRY_ENGINE_VERSION = 1;
export type WorkBreakRule = "PLANNED_AFTER_5H" | "CLOCKED_ONLY";
export type WorkRules = { normalDayMin: number; breakRule: WorkBreakRule; breakAfterMin: number };
/** ค่าตั้งต้น — normalDayMin มาจากค่าตั้ง HR `normalMinutesPerDay` (60–720 · ค่าปริยาย 480) ที่ผู้เรียกส่งมา */
export const WORK_RULES_DEFAULT: WorkRules = { normalDayMin: 480, breakRule: "PLANNED_AFTER_5H", breakAfterMin: 300 };
export const NORMAL_DAY_RANGE = { min: 60, max: 720 } as const;

/** รายการที่ต้องตรวจก่อนอนุมัติรอบรุ่น 2 (บล็อก) */
export const WE_BLOCKING = ["LEAVE_MISMATCH", "MISSING_OUT", "NOT_FINAL", "NOT_STORED", "ORPHAN", "OVER_1440", "PENDING_LEAVE", "STALE", "STRAY_IN", "WORKED_ON_LEAVE"] as const;
/** แจ้งให้รู้เท่านั้น */
export const WE_INFO = ["HOLIDAY_LEAVE", "HOURLY_LEAVE_UNUSED", "LEGACY_LEAVE", "OT_VIA_ADJUSTMENT"] as const;
export type WorkReview = (typeof WE_BLOCKING)[number] | (typeof WE_INFO)[number];

export type WorkDayClass = "WORKDAY" | "DAY_OFF" | "HOLIDAY" | "UNSCHEDULED";
export type WorkDayStatus = "WORKED" | "LEAVE" | "ABSENT" | "DAY_OFF" | "HOLIDAY" | "UNSCHEDULED" | "PENDING";
export const WORK_KIND_ORDER = ["WORK", "OT_WORKDAY", "HOLIDAY_WORK", "OT_HOLIDAY", "HOLIDAY_PAID", "LEAVE_PAID", "LEAVE_UNPAID", "ABSENT", "LATE", "EARLY_OUT"] as const;
export type WorkKind = (typeof WORK_KIND_ORDER)[number];
export const WORK_MIN_KEYS = [
  "plannedMin",
  "workMin",
  "otWorkdayMin",
  "holidayWorkMin",
  "otHolidayMin",
  "holidayPaidMin",
  "paidLeaveMin",
  "unpaidLeaveMin",
  "absentMin",
  "lateMin",
  "earlyOutMin",
  "unplannedMin",
  "breakDeductMin",
] as const;
export type WorkMinKey = (typeof WORK_MIN_KEYS)[number];
const KIND_COL: Record<WorkKind, WorkMinKey> = {
  WORK: "workMin",
  OT_WORKDAY: "otWorkdayMin",
  HOLIDAY_WORK: "holidayWorkMin",
  OT_HOLIDAY: "otHolidayMin",
  HOLIDAY_PAID: "holidayPaidMin",
  LEAVE_PAID: "paidLeaveMin",
  LEAVE_UNPAID: "unpaidLeaveMin",
  ABSENT: "absentMin",
  LATE: "lateMin",
  EARLY_OUT: "earlyOutMin",
};
export const workKindColumn = (k: WorkKind): WorkMinKey => KIND_COL[k];

export type WorkSlot = {
  dayId: string | null;
  version: number;
  slotKey: string;
  stored: boolean;
  final: boolean;
  stale: boolean;
  orphan: boolean;
  status: string;
  startMin: number | null;
  endMin: number | null;
  crossesMidnight: boolean | null;
  plannedBreakMin: number;
  workedMin: number;
  breakMin: number;
  lateMin: number;
  earlyOutMin: number;
  /** นาที OT ดิบ (ปัดลงเป็นนาที ไม่ปัดเป็นขั้น — มติ A4) */
  otMin: number;
  missingOut: boolean;
  leaveId: string | null;
  leaveFraction: string | number | null;
  rosterEntryId: string | null;
};
export type WorkLeave = { id: string; status: "APPROVED" | "PENDING"; halfDay: "AM" | "PM" | null; hours: number | null; paid: boolean; legacy: boolean };
/** otRequestIds = คำขอ OT ที่อนุมัติแล้ว (H2.9) ของวันนั้น — อ้างอิงเท่านั้น: OT จ่ายผ่าน HrPayAdjustment (OT_REQUEST) ที่เดียว */
export type WorkDayInput = { day: string; unitId: string | null; holiday: { id: string } | null; slots: WorkSlot[]; leaves: WorkLeave[]; otRequestIds?: string[] };
export type BuildWorkDaysInput = {
  employeeId: string;
  startDate: string | null;
  endDate: string | null;
  from: string;
  to: string;
  days: WorkDayInput[];
  rules?: Partial<WorkRules>;
};
export type WorkSources = { attendanceDays: { id: string; version: number; slotKey: string }[]; rosterEntryIds: string[]; leaveIds: string[]; holidayId: string | null; otRequestIds: string[] };
export type WorkEntryOut = { kind: WorkKind; minutes: number };
export type WorkDay = {
  employeeId: string;
  day: string;
  periodKey: string;
  unitId: string | null;
  dayClass: WorkDayClass;
  dayStatus: WorkDayStatus;
  leaveDays: string;
  review: WorkReview[];
  sources: WorkSources;
  entries: WorkEntryOut[];
  digest: string;
} & Record<WorkMinKey, number>;

// ═══════════════════════════ ตัวช่วย ═══════════════════════════
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const nat = (v: unknown): number => (isInt(v) && v > 0 ? v : 0);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** "0.5" | 0.5 → 5 (ส่วนสิบ จำนวนเต็ม) */
export function tenthsOf(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) : 0;
}
export const fmtTenths = (t: number) => `${Math.floor(t / 10)}.${t % 10}`;
/** ค่าตั้งที่ส่งมา (บางคีย์) → กติกาที่ใช้จริง — ผิดรูป = ค่าตั้งต้นของคีย์นั้น */
export function workRulesOf(raw: unknown): WorkRules {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = WORK_RULES_DEFAULT;
  return {
    normalDayMin: isInt(o.normalDayMin) && o.normalDayMin >= NORMAL_DAY_RANGE.min && o.normalDayMin <= NORMAL_DAY_RANGE.max ? o.normalDayMin : d.normalDayMin,
    breakRule: o.breakRule === "CLOCKED_ONLY" || o.breakRule === "PLANNED_AFTER_5H" ? o.breakRule : d.breakRule,
    breakAfterMin: isInt(o.breakAfterMin) && o.breakAfterMin >= 0 && o.breakAfterMin <= 1440 ? o.breakAfterMin : d.breakAfterMin,
  };
}
/** นาทีของช่วงกะ (ข้ามเที่ยงคืน = end + 1440 − start) */
export function windowMin(s: Pick<WorkSlot, "startMin" | "endMin" | "crossesMidnight">): number {
  if (!isInt(s.startMin) || !isInt(s.endMin)) return 0;
  return Math.max(0, s.crossesMidnight ? s.endMin + 1440 - s.startMin : s.endMin - s.startMin);
}

/**
 * Q3 (ม.27): หักพักตามตารางส่วนที่ไม่ได้ลงเวลา — d = worked > breakAfter ? min(max(0, plannedBreak − clockedBreak), worked − breakAfter) : 0 ·
 * ไม่ทำให้วันเหลือต่ำกว่า breakAfter (5 ชม.) · ไม่หักซ้ำส่วนที่ลงเวลาพักแล้ว · CLOCKED_ONLY ⇒ 0
 */
export function breakDeduction(workedMin: number, plannedBreakMin: number, clockedBreakMin: number, rules: Pick<WorkRules, "breakRule" | "breakAfterMin">): number {
  if (rules.breakRule !== "PLANNED_AFTER_5H") return 0;
  const w = nat(workedMin);
  if (w <= rules.breakAfterMin) return 0;
  return Math.min(Math.max(0, nat(plannedBreakMin) - nat(clockedBreakMin)), w - rules.breakAfterMin);
}

const ATTENDED = new Set(["ON_TIME", "LATE", "EARLY_OUT"]);
const isShift = (s: WorkSlot) => isInt(s.startMin) && isInt(s.endMin);

/** ค่ารวมเป็นสตริงตามลำดับคีย์ (ไม่ขึ้นกับลำดับคีย์ของวัตถุ) */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}
export const sha256Hex = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : canon(v)).digest("hex");

// ═══════════════════════════ หนึ่งวัน ═══════════════════════════
function buildDay(employeeId: string, d: WorkDayInput, rules: WorkRules): WorkDay {
  const N = rules.normalDayMin;
  const review = new Set<WorkReview>();
  const leaves = [...(d.leaves ?? [])].sort((a, b) => cmp(a.id, b.id));
  const approved = new Map(leaves.filter((l) => l.status === "APPROVED").map((l) => [l.id, l]));
  if (leaves.some((l) => l.status === "PENDING")) review.add("PENDING_LEAVE");
  let slots = [...(d.slots ?? [])].sort((a, b) => cmp(a.slotKey, b.slotKey) || cmp(a.dayId ?? "", b.dayId ?? ""));
  // มติ r2 C ของ H2.5: วันที่มีแถวกำพร้า ⇒ ใช้เฉพาะแถวที่บันทึก (ไม่นับนาทีซ้ำจนกว่าจะคิดผลใหม่)
  if (slots.some((s) => s.stored && s.orphan)) slots = slots.filter((s) => s.stored);
  const hasShiftAny = slots.some(isShift);
  const dayClass: WorkDayClass = d.holiday ? "HOLIDAY" : hasShiftAny || slots.some((s) => s.status === "NO_SCHEDULE") ? "WORKDAY" : slots.some((s) => s.status === "DAY_OFF") ? "DAY_OFF" : "UNSCHEDULED";
  let pending = false;
  for (const s of slots) {
    if (!s.stored) {
      pending = true;
      review.add(s.final ? "NOT_STORED" : "NOT_FINAL");
    }
    if (s.stored && s.stale) review.add("STALE");
    if (s.stored && s.orphan) review.add("ORPHAN");
    if (s.stored && s.missingOut) review.add("MISSING_OUT");
    if (s.stored && s.status === "LEAVE" && nat(s.workedMin) > 0) review.add("WORKED_ON_LEAVE");
  }
  const used = slots.filter((s) => s.stored && s.final !== false);
  // ช่อง DAY คู่กับกะในวันเดียว (hunter F7) — นาทีของช่อง DAY ไม่นับ
  const stray = slots.some((s) => s.slotKey !== "DAY") && slots.some((s) => s.slotKey === "DAY");
  if (stray) review.add("STRAY_IN");
  const counted = stray ? used.filter((s) => s.slotKey !== "DAY") : used;
  const shiftSlots = counted.filter(isShift);
  const noShift = counted.filter((s) => !isShift(s));

  const m: Record<WorkMinKey, number> = Object.fromEntries(WORK_MIN_KEYS.map((k) => [k, 0])) as Record<WorkMinKey, number>;
  const plannedOf = (s: WorkSlot) => Math.max(0, windowMin(s) - nat(s.plannedBreakMin));
  m.plannedMin = shiftSlots.reduce((a, s) => a + plannedOf(s), 0);
  // r2 (4d): กะซ้อนกันจนเวลาตามแผนเกิน 1 วัน ⇒ แจ้ง OVER_1440 (บล็อก) และคิดต่อบนเพดาน 1 440 (ขาด/สาย/ลาไม่เกินเพดานเดียวกัน)
  if (m.plannedMin > 1440) {
    review.add("OVER_1440");
    m.plannedMin = 1440;
  }

  // ── ใบลา (ไม่รวมลาเป็นชั่วโมง) ──
  const hourlyIds = new Set(leaves.filter((l) => l.hours !== null && l.hours !== undefined).map((l) => l.id));
  const fracBy = new Map<string, number>();
  for (const s of counted) {
    if (!s.leaveId) continue;
    const lv = approved.get(s.leaveId);
    if (!lv) {
      review.add("LEAVE_MISMATCH"); // แถวอ้างใบลาที่ไม่อนุมัติแล้ว (F3)
      continue;
    }
    if (hourlyIds.has(lv.id)) continue;
    fracBy.set(lv.id, (fracBy.get(lv.id) ?? 0) + tenthsOf(s.leaveFraction));
  }
  const fullOf = (l: WorkLeave) => (l.halfDay ? 5 : 10);
  const dayLeaves = [...approved.values()].filter((l) => !hourlyIds.has(l.id));
  const leaveDay = dayClass === "WORKDAY" || dayClass === "UNSCHEDULED" || (dayClass === "HOLIDAY" && shiftSlots.length > 0);
  // r2 (4a): วันไม่มีกะ (ไม่มีตาราง/ไม่มีช่อง) ที่มีใบลาอนุมัติ ⇒ บันทึกการลาจากใบลา (ฐาน = นาทีปกติต่อวัน) — ไม่ทิ้งเงียบ ๆ
  if (!hasShiftAny && (dayClass === "UNSCHEDULED" || dayClass === "WORKDAY")) {
    fracBy.clear();
    for (const l of dayLeaves) fracBy.set(l.id, fullOf(l));
  } else if (!shiftSlots.length) fracBy.clear(); // วันหยุด/วันพักที่ไม่มีกะ ไม่มีนาทีลา (H2.7 R4)
  let f = 0;
  const capped = new Map<string, number>();
  for (const [id, t] of [...fracBy.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const use = Math.min(t, 10 - f);
    if (use > 0) capped.set(id, use);
    f += Math.max(0, use);
  }
  if (shiftSlots.length && !pending) {
    const expected = Math.min(10, dayLeaves.reduce((a, l) => a + fullOf(l), 0));
    if (expected !== f) review.add("LEAVE_MISMATCH");
  }
  const basis = m.plannedMin > 0 ? m.plannedMin : N;
  const usedLeaves = new Set<string>();
  if (leaveDay) {
    for (const [id, t] of capped) {
      const lv = approved.get(id)!;
      const min = Math.floor((t * basis) / 10);
      if (lv.paid || lv.legacy) m.paidLeaveMin += min;
      else m.unpaidLeaveMin += min;
      usedLeaves.add(id);
    }
  }
  const leaveMin = m.paidLeaveMin + m.unpaidLeaveMin;

  // ── นาทีทำงาน ──
  let worked = 0;
  let plannedBreak = 0;
  let clockedBreak = 0;
  let beforeOt = 0;
  let otShift = 0;
  let attendedPlanned = 0;
  let absentPlanned = 0;
  let late = 0;
  let early = 0;
  for (const s of shiftSlots) {
    if (ATTENDED.has(s.status)) attendedPlanned += plannedOf(s);
    if (s.status === "ABSENT") absentPlanned += plannedOf(s);
    if (s.status === "LEAVE") continue; // นาทีของช่องที่ลาไม่นับ (WORKED_ON_LEAVE)
    const w = nat(s.workedMin);
    const ot = Math.min(nat(s.otMin), w);
    worked += w;
    plannedBreak += nat(s.plannedBreakMin);
    clockedBreak += nat(s.breakMin);
    beforeOt += w - ot;
    otShift += ot;
    late += nat(s.lateMin);
    early += nat(s.earlyOutMin);
  }
  // r2 (5): กติกาพัก (Q3) ทั้งวันครั้งเดียว — ชั่วโมงทำงานรวม · พักตามตารางรวม · พักที่ลงเวลารวม
  const dd = Math.min(breakDeduction(worked, plannedBreak, clockedBreak, rules), beforeOt);
  m.breakDeductMin = dd;
  const pool = beforeOt - dd;
  const reg = Math.min(pool, Math.max(0, m.plannedMin - leaveMin));
  m.unplannedMin = pool - reg;
  // r2 (4b): วันลาครึ่งวัน/บางส่วนที่ทำงานเกินส่วนที่ต้องมา ⇒ WORKED_ON_LEAVE · นาทีที่ทับเวลาลาไม่เป็น OT (ย้ายไป unplanned) — ไม่จ่ายซ้ำกับค่าลา
  if (leaveMin > 0) {
    const overlap = pool + otShift - Math.max(0, m.plannedMin - leaveMin);
    if (overlap > 0 && shiftSlots.some((s) => s.status !== "LEAVE" && nat(s.workedMin) > 0)) {
      review.add("WORKED_ON_LEAVE");
      const cut = Math.min(otShift, overlap, leaveMin);
      otShift -= cut;
      m.unplannedMin += cut;
    }
  }
  // r2 (1): ขาด/สาย/ออกก่อน ไม่เกินเวลาที่ขาดจริง = max(0, เวลาตามแผน − ลา − ทำงานตามแผน) (ขาด → สาย → ออกก่อน)
  const shortfall = Math.max(0, m.plannedMin - leaveMin - reg);
  let absent = Math.min(Math.max(0, Math.min(absentPlanned, m.plannedMin - leaveMin - attendedPlanned)), shortfall);
  late = Math.min(late, shortfall - absent);
  early = Math.min(early, shortfall - absent - late);

  // ── ลาเป็นชั่วโมง: หักสาย → ออกก่อน → ขาด ไม่เกิน ชม.×60 ──
  let hourlyTenths = 0;
  if (leaveDay) {
    for (const lv of [...approved.values()].filter((l) => hourlyIds.has(l.id)).sort((a, b) => cmp(a.id, b.id))) {
      const h = nat(lv.hours);
      hourlyTenths += Math.floor((h * 10) / 8);
      const want = h * 60;
      const L = Math.min(want, Math.max(0, basis - (m.paidLeaveMin + m.unpaidLeaveMin) - reg));
      if (want > L) review.add("HOURLY_LEAVE_UNUSED");
      let rest = L;
      const a = Math.min(rest, late);
      late -= a;
      rest -= a;
      const b = Math.min(rest, early);
      early -= b;
      rest -= b;
      absent -= Math.min(rest, absent);
      if (lv.paid || lv.legacy) m.paidLeaveMin += L;
      else m.unpaidLeaveMin += L;
      usedLeaves.add(lv.id);
    }
  }
  for (const id of usedLeaves) if (approved.get(id)?.legacy) review.add("LEGACY_LEAVE");

  // ── ชนิดวัน → คอลัมน์ ──
  if (dayClass === "HOLIDAY") {
    m.holidayWorkMin += reg;
    m.otHolidayMin += otShift;
    m.holidayPaidMin = N;
  } else {
    m.workMin += reg;
    m.otWorkdayMin += otShift;
    m.lateMin = late;
    m.earlyOutMin = early;
    m.absentMin = absent;
  }
  for (const s of noShift) {
    const net = nat(s.workedMin);
    if (dayClass === "DAY_OFF" || dayClass === "HOLIDAY") {
      m.holidayWorkMin += Math.min(net, N);
      m.otHolidayMin += Math.max(0, Math.min(nat(s.otMin), net) - N);
    } else m.workMin += net;
  }
  if (dayClass === "HOLIDAY" && m.paidLeaveMin + m.unpaidLeaveMin > 0) review.add("HOLIDAY_LEAVE"); // r2 (4c): มติ Q16 คงเดิม — แจ้งให้ H3.4/ผู้ทำบัญชีเห็น
  // r2 (4d): กะซ้อนกันจนเกิน 1 วัน — ไม่ตัดเงียบ ๆ
  if (WORK_MIN_KEYS.some((k) => m[k] > 1440)) review.add("OVER_1440");
  for (const k of WORK_MIN_KEYS) m[k] = Math.min(1440, Math.max(0, m[k]));

  const leaveTenths = Math.min(10, f * (leaveDay ? 1 : 0) + hourlyTenths * (leaveDay ? 1 : 0));
  const attended = shiftSlots.some((s) => ATTENDED.has(s.status));
  const workedAny = m.workMin + m.holidayWorkMin + m.otWorkdayMin + m.otHolidayMin + m.unplannedMin > 0;
  const dayStatus: WorkDayStatus = pending
    ? "PENDING"
    : attended || workedAny
      ? "WORKED"
      : dayClass === "HOLIDAY"
        ? "HOLIDAY"
        : leaveTenths >= 10
          ? "LEAVE"
          : m.absentMin > 0
            ? "ABSENT"
            : dayClass === "DAY_OFF"
              ? "DAY_OFF"
              : dayClass === "UNSCHEDULED"
                ? "UNSCHEDULED"
                : "WORKED";

  const sources: WorkSources = {
    attendanceDays: used
      .filter((s) => s.dayId)
      .map((s) => ({ id: s.dayId!, version: nat(s.version), slotKey: s.slotKey }))
      .sort((a, b) => cmp(a.id, b.id)),
    rosterEntryIds: [...new Set(slots.map((s) => s.rosterEntryId).filter((x): x is string => !!x))].sort(cmp),
    leaveIds: leaves.map((l) => l.id),
    holidayId: d.holiday?.id ?? null,
    otRequestIds: [...new Set(d.otRequestIds ?? [])].sort(cmp),
  };
  if (sources.otRequestIds.length) review.add("OT_VIA_ADJUSTMENT"); // H3.1 r3: OT ของวันนี้จ่ายผ่านคำขอ OT (H2.9) — H3.4 ห้ามคิดเงินจาก otWorkdayMin/otHolidayMin
  const entries: WorkEntryOut[] = WORK_KIND_ORDER.filter((k) => m[KIND_COL[k]] > 0).map((k) => ({ kind: k, minutes: m[KIND_COL[k]] }));
  const out = {
    employeeId,
    day: d.day,
    periodKey: d.day.slice(0, 7),
    unitId: d.unitId ?? null,
    dayClass,
    dayStatus,
    ...m,
    leaveDays: fmtTenths(leaveTenths),
    review: [...review].sort(cmp),
    sources,
    entries,
  };
  return { ...out, digest: sha256Hex({ v: WORK_ENTRY_ENGINE_VERSION, rules, out }) };
}

/**
 * พนักงานหนึ่งคน ช่วงวัน [from, to] ∩ ช่วงจ้าง → 1 แถวต่อวัน (เรียงวัน) · วันใน `days` ที่อยู่นอกช่วงไม่ใช้ ·
 * วันที่ไม่มีข้อมูล = UNSCHEDULED · ไม่แก้ input · ไม่อ่านนาฬิกา
 */
export function buildWorkDays(input: BuildWorkDaysInput): WorkDay[] {
  const rules = workRulesOf({ ...WORK_RULES_DEFAULT, ...(input?.rules ?? {}) });
  const from = input.startDate && input.startDate > input.from ? input.startDate : input.from;
  const to = input.endDate && input.endDate < input.to ? input.endDate : input.to;
  const byDay = new Map((input.days ?? []).map((d) => [d.day, d]));
  const out: WorkDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const d = byDay.get(day) ?? { day, unitId: null, holiday: null, slots: [], leaves: [] };
    out.push(buildDay(input.employeeId, d, rules));
  }
  return out;
}

/** วันที่บล็อกการอนุมัติ (มีรายการต้องตรวจแบบบล็อก) */
export const isBlocking = (review: readonly string[]) => review.some((r) => (WE_BLOCKING as readonly string[]).includes(r));
