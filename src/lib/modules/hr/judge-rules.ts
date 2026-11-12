// HR H2.5 ▸ กติกาตัดสินผลการลงเวลารายวันจากตารางกะ — ฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่ง `now` มาเอง)
//
// ทำไมแยกไฟล์: ตัวปิดวัน (finaliser) · การคิดผลใหม่ · บอร์ดทีมรายวัน · ปฏิทินรายคน · การเตือน ต้องตัดสินด้วยสูตรเดียวกันทุกไบต์ ·
//   ข้อสอบ qc-hr-h2.5 S1 เรียกไฟล์นี้ตรง ๆ (brief hr-brief-H2.5 R1 · R3)
// กติกา (R1):
//   • ช่วงกะ = shiftWindow · ลาครึ่งวัน: M = เริ่ม + floor((เลิก − เริ่ม)/2) · ลาเช้า ⇒ ควรเข้า M · ลาบ่าย ⇒ ควรเลิก M
//   • ปิดวัน (final) ⇔ now ≥ เลิกกะ + closeGraceMin (ไม่มีกะ: เที่ยงคืนของวันถัดไป + closeGraceMin)
//   • สาย ⇔ นาทีหลังเวลาเข้า (ปัดลง) > graceMin ของกะ · ออกก่อน ⇔ flagEarlyOut ∧ นาทีก่อนเวลาเลิก > earlyOutGraceMin ·
//     OT = นาทีหลังเวลาเลิก ปัดลงเป็นขั้น otStepMin (วัดอย่างเดียว — อนุมัติ = H2.9)
//   • ลำดับ: ลาทั้งวัน ⇒ LEAVE (นาทีทำงานคงไว้ · ไม่มีสาย/ออกก่อน/OT) · ไม่เข้างานและเลยเวลาขาด ⇒ ABSENT · ไม่เข้างาน ⇒ PENDING ·
//     เข้างาน ⇒ LATE › EARLY_OUT › ON_TIME (สาย+ออกก่อน = LATE เก็บนาทีออกก่อนไว้ — มติ Q1) ·
//     ปิดวันแล้วไม่มีเวลาออก ⇒ ผลของการเข้างาน + missingOut · นาทีทำงาน/ออกก่อน/OT = 0
//   • ไม่มีกะ: วันหยุด ⇒ DAY_OFF (มาทำงาน ⇒ OT = นาทีทำงานปัดเป็นขั้น) · อื่น ๆ ⇒ NO_SCHEDULE
// การผูกรอบเข้ากะ (R3): attributeSessions — ปิดหนี้ D-H24-adopt / r2d / m1 ◂
import { bkkDayKey, bkkMidnight, addDays, shiftWindow, type ShiftTimes } from "./time-rules";
import { pickRosterEntry, workedMinutesWithBreaks } from "./clock-rules";

const MIN_MS = 60_000;

// ═══════════════════════════ นโยบาย (AppSystem.settings.hrAttendance) ═══════════════════════════
export type AttendancePolicy = {
  /** เตือน "ยังไม่เข้างาน" เมื่อเลยเวลาเริ่มกะกี่นาที */
  notInAlertMin: number;
  /** นับว่า "ไม่มา" เมื่อเลยเวลาเริ่มกะกี่นาที (null = ถึงเวลาเลิกกะ) */
  absentAfterMin: number | null;
  /** ออกก่อนเวลาได้กี่นาทีโดยไม่นับ */
  earlyOutGraceMin: number;
  /** นับ "ออกก่อน" ไหม */
  flagEarlyOut: boolean;
  /** ขั้นปัด OT (นาที) */
  otStepMin: number;
  /** เปิดการเตือน */
  alertsOn: boolean;
  /** เตือนตัวพนักงานด้วย (ยังไม่เข้างานเท่านั้น — มติ Q12 ค่าปริยายปิด) */
  alertEmployee: boolean;
};
export const ATTENDANCE_POLICY_DEFAULT: AttendancePolicy = { notInAlertMin: 10, absentAfterMin: null, earlyOutGraceMin: 0, flagEarlyOut: true, otStepMin: 15, alertsOn: true, alertEmployee: false };
/** ช่วงที่ร้านตั้งได้ (รวมปลายทั้งสองข้าง) */
export const ATTENDANCE_POLICY_RANGE = {
  notInAlertMin: { min: 0, max: 240 },
  absentAfterMin: { min: 30, max: 720 },
  earlyOutGraceMin: { min: 0, max: 60 },
  otStepMin: [1, 5, 10, 15, 30] as readonly number[],
} as const;
/** รุ่นของเครื่องตัดสิน (เก็บติดแถว HrAttendanceDay — แถวเดิมไม่ถูกคิดใหม่ด้วยรุ่นอื่นเอง) */
export const JUDGE_ENGINE_VERSION = 1;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const inRange = (v: unknown, r: { min: number; max: number }): v is number => isInt(v) && v >= r.min && v <= r.max;

/** ค่าตั้งที่เก็บไว้ (JSON) → นโยบายที่ใช้จริง — คีย์หาย/ผิดรูป/ผิดช่วง = ค่าตั้งต้นของคีย์นั้น (ไม่ throw) */
export function attendancePolicyOf(raw: unknown): AttendancePolicy {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = ATTENDANCE_POLICY_DEFAULT;
  const R = ATTENDANCE_POLICY_RANGE;
  return {
    notInAlertMin: inRange(o.notInAlertMin, R.notInAlertMin) ? o.notInAlertMin : d.notInAlertMin,
    absentAfterMin: o.absentAfterMin === null ? null : inRange(o.absentAfterMin, R.absentAfterMin) ? o.absentAfterMin : d.absentAfterMin,
    earlyOutGraceMin: inRange(o.earlyOutGraceMin, R.earlyOutGraceMin) ? o.earlyOutGraceMin : d.earlyOutGraceMin,
    flagEarlyOut: typeof o.flagEarlyOut === "boolean" ? o.flagEarlyOut : d.flagEarlyOut,
    otStepMin: isInt(o.otStepMin) && R.otStepMin.includes(o.otStepMin) ? o.otStepMin : d.otStepMin,
    alertsOn: typeof o.alertsOn === "boolean" ? o.alertsOn : d.alertsOn,
    alertEmployee: typeof o.alertEmployee === "boolean" ? o.alertEmployee : d.alertEmployee,
  };
}

// ═══════════════════════════ ตัดสินหนึ่งช่อง (R1) ═══════════════════════════
export type JudgeStatus = "ON_TIME" | "LATE" | "EARLY_OUT" | "ABSENT" | "LEAVE" | "DAY_OFF" | "NO_SCHEDULE" | "PENDING";
export type JudgePhase = "FINAL" | "UPCOMING" | "NOT_IN" | "OPEN" | "ON_BREAK" | "CLOSED";
export type JudgeShift = ShiftTimes & { graceMin: number };
export type JudgeEvent = { kind: string; at: Date };
export type JudgeInput = {
  day: string;
  shift: JudgeShift | null;
  dayOff?: boolean;
  events: readonly JudgeEvent[];
  leave: { halfDay: "AM" | "PM" | null } | null;
  policy: AttendancePolicy;
  closeGraceMin: number;
  now: Date;
};
export type JudgeOutput = {
  status: JudgeStatus;
  phase: JudgePhase;
  final: boolean;
  lateMin: number;
  earlyOutMin: number;
  workedMin: number;
  breakMin: number;
  otMin: number;
  missingOut: boolean;
  alertAt: Date | null;
  absentAt: Date | null;
};

const floorMin = (ms: number) => Math.floor(ms / MIN_MS);
const floorStep = (min: number, step: number) => (step > 0 ? Math.floor(Math.max(0, min) / step) * step : Math.max(0, min));

/** นาทีพัก: BREAK_START → BREAK_END | OUT | ถึง `until` (null = ไม่นับพักที่ยังไม่จบ) */
function breakMinutes(sorted: readonly JudgeEvent[], until: Date | null): number {
  let total = 0;
  let from: number | null = null;
  for (const e of sorted) {
    const t = e.at.getTime();
    if (e.kind === "BREAK_START") {
      if (from === null) from = t;
    } else if (e.kind === "BREAK_END" || e.kind === "OUT" || e.kind === "IN") {
      if (from !== null) total += t - from;
      from = null;
    }
  }
  if (from !== null && until && until.getTime() > from) total += until.getTime() - from;
  return Math.round(total / MIN_MS);
}

/** ตัดสินหนึ่งช่อง (กะหนึ่งกะ หรือวันที่ไม่มีกะ) — คืน 11 คีย์เสมอ · ไม่แก้ input */
export function judgeEntry(input: JudgeInput): JudgeOutput {
  const { day, shift, policy, now } = input;
  const closeGrace = (isInt(input.closeGraceMin) && input.closeGraceMin >= 0 ? input.closeGraceMin : 240) * MIN_MS;
  const sorted = [...(input.events ?? [])].filter((e) => e?.at instanceof Date && Number.isFinite(e.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());
  const ins = sorted.filter((e) => e.kind === "IN");
  const outs = sorted.filter((e) => e.kind === "OUT");
  const firstIn = ins[0] ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const openNow = !!last && (last.kind === "IN" || last.kind === "BREAK_END" || last.kind === "BREAK_START");
  const sessionPhase: JudgePhase = !last ? "CLOSED" : last.kind === "BREAK_START" ? "ON_BREAK" : last.kind === "OUT" ? "CLOSED" : "OPEN";
  const window = shift ? shiftWindow(day, shift) : null;
  const endMs = window ? window.end.getTime() : bkkMidnight(addDays(day, 1)).getTime();
  const final = now.getTime() >= endMs + closeGrace;
  const missingOut = final && !!firstIn && openNow;
  // นาทีทำงาน · พัก (ยังไม่ปิดวันและรอบยังเปิด ⇒ นับถึง now)
  let workedMin = 0;
  let breakMin = 0;
  if (!missingOut) {
    const live = !final && openNow && last && last.kind !== "BREAK_START" ? [...sorted, { kind: "OUT", at: now }] : sorted;
    workedMin = firstIn ? workedMinutesWithBreaks(live) : 0;
    breakMin = breakMinutes(sorted, !final && openNow ? now : null);
  } else {
    breakMin = breakMinutes(sorted, null);
  }
  const lastOut = outs[outs.length - 1] ?? null;

  if (!shift || !window) {
    const dayOff = input.dayOff === true;
    const otMin = dayOff && !missingOut ? floorStep(workedMin, policy.otStepMin) : 0;
    return {
      status: dayOff ? "DAY_OFF" : "NO_SCHEDULE",
      phase: final ? "FINAL" : firstIn ? sessionPhase : "CLOSED",
      final,
      lateMin: 0,
      earlyOutMin: 0,
      workedMin,
      breakMin,
      otMin,
      missingOut,
      alertAt: null,
      absentAt: null,
    };
  }

  const startMs = window.start.getTime();
  const half = input.leave?.halfDay ?? null;
  const fullLeave = !!input.leave && !half;
  const midMs = startMs + Math.floor(floorMin(endMs - startMs) / 2) * MIN_MS;
  const dueStart = half === "AM" ? midMs : startMs;
  const dueEnd = half === "PM" ? midMs : endMs;
  const alertAt = new Date(startMs + policy.notInAlertMin * MIN_MS);
  const absentAt = new Date(policy.absentAfterMin === null ? endMs : Math.min(startMs + policy.absentAfterMin * MIN_MS, endMs));

  let lateMin = 0;
  let earlyOutMin = 0;
  let otMin = 0;
  let status: JudgeStatus;
  if (firstIn) {
    const after = floorMin(firstIn.at.getTime() - dueStart);
    const late = after > shift.graceMin;
    lateMin = late ? after : 0;
    if (lastOut && !missingOut) {
      const early = floorMin(dueEnd - lastOut.at.getTime());
      earlyOutMin = policy.flagEarlyOut && early > policy.earlyOutGraceMin ? early : 0;
      otMin = floorStep(floorMin(Math.max(0, lastOut.at.getTime() - dueEnd)), policy.otStepMin);
    }
    status = late ? "LATE" : earlyOutMin > 0 ? "EARLY_OUT" : "ON_TIME";
  } else {
    status = now.getTime() >= absentAt.getTime() ? "ABSENT" : "PENDING";
  }
  if (fullLeave) {
    status = "LEAVE";
    lateMin = 0;
    earlyOutMin = 0;
    otMin = 0;
  }
  const phase: JudgePhase = final ? "FINAL" : firstIn ? sessionPhase : now.getTime() < startMs ? "UPCOMING" : "NOT_IN";
  return { status, phase, final, lateMin, earlyOutMin, workedMin, breakMin, otMin, missingOut, alertAt, absentAt };
}

// ═══════════════════════════ ผูกรอบเข้ากะ (R3) ═══════════════════════════
export type AttrEntry = { id: string; employeeId: string; date: string; startMin: number; endMin: number; crossesMidnight: boolean };
export type AttrEvent = { id: string; kind: string; at: Date; rosterEntryId?: string | null };
/** รับกะ (adopt) ได้เมื่อเข้างานไม่เกินกี่นาทีก่อนเวลาเริ่ม (= ADOPT_BEFORE_MIN ของ clock.ts) */
export const ADOPT_BEFORE_MIN = 360;

/**
 * รอบ (session) = IN + แถวถัดไปจนถึง OUT (รวม) หรือ IN ถัดไป · รอบเป็นของกะ E เมื่อ
 *   (ก) IN ผูก E · E เป็นของพนักงานคนนี้ · E.start − earlyInMin ≤ IN ≤ E.end + closeGraceMin (id ดิบไม่เชื่อเปล่า ๆ) หรือ
 *   (ข) E.start − 360 ≤ IN < E.end และ E เริ่มวันไทยเดียวกับ IN (ใกล้เวลาเริ่มที่สุด · ตัวตัดสินเสมอ = pickRosterEntry)
 * แถวที่หลัง E.end + closeGraceMin ไม่ใช่ของ E (กะแยก) · ที่เหลือ (รวมแถวที่ไม่มี IN นำ) = rest
 */
export function attributeSessions(
  entries: readonly AttrEntry[],
  events: readonly AttrEvent[],
  opts: { employeeId: string; earlyInMin: number; closeGraceMin: number },
): { byEntry: Record<string, string[]>; rest: string[] } {
  const own = (entries ?? []).filter((e) => e && e.employeeId === opts.employeeId);
  const wins = own.flatMap((e) => {
    try {
      const w = shiftWindow(e.date, { startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight });
      return [{ id: e.id, start: w.start, end: w.end }];
    } catch {
      return [];
    }
  });
  const byId = new Map(wins.map((w) => [w.id, w]));
  const early = (isInt(opts.earlyInMin) && opts.earlyInMin >= 0 ? opts.earlyInMin : 120) * MIN_MS;
  const grace = (isInt(opts.closeGraceMin) && opts.closeGraceMin >= 0 ? opts.closeGraceMin : 240) * MIN_MS;
  const byEntry: Record<string, string[]> = {};
  for (const w of wins) byEntry[w.id] = [];
  const rest: string[] = [];
  const sorted = [...(events ?? [])].filter((e) => e?.at instanceof Date).sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let cur: { id: string; end: number } | null = null;
  let open = false;
  for (const ev of sorted) {
    const t = ev.at.getTime();
    if (ev.kind === "IN") {
      const linked = ev.rosterEntryId ? byId.get(ev.rosterEntryId) : undefined;
      let pick: { id: string; start: Date; end: Date } | null = null;
      if (linked && t >= linked.start.getTime() - early && t <= linked.end.getTime() + grace) pick = linked;
      else {
        const d = bkkDayKey(ev.at);
        pick = pickRosterEntry("IN", ev.at, wins.filter((w) => bkkDayKey(w.start) === d), { earlyMin: ADOPT_BEFORE_MIN });
      }
      cur = pick ? { id: pick.id, end: pick.end.getTime() + grace } : null;
      open = true;
      if (cur) byEntry[cur.id]!.push(ev.id);
      else rest.push(ev.id);
      continue;
    }
    if (open && cur && t <= cur.end) byEntry[cur.id]!.push(ev.id);
    else rest.push(ev.id);
    if (ev.kind === "OUT") {
      open = false;
      cur = null;
    }
  }
  return { byEntry, rest };
}

// ═══════════════════════════ DTO ของจอ (ไม่มีข้อมูลอ่อนไหว — R9) ═══════════════════════════
export type AttendanceSlotDto = {
  slotKey: string;
  dayId: string | null;
  shift: { name: string; startMin: number; endMin: number; crossesMidnight: boolean } | null;
  inAt: string | null;
  outAt: string | null;
  method: string | null;
  breaks: { from: string; to: string | null }[];
  status: JudgeStatus;
  phase: JudgePhase;
  final: boolean;
  stored: boolean;
  stale: boolean;
  lateMin: number;
  earlyOutMin: number;
  workedMin: number;
  otMin: number;
  missingOut: boolean;
  leave: { label: string; pending: boolean } | null;
};
export type AttendanceRowDto = { employeeId: string; name: string; initial: string; position: string | null; borrowed: boolean; slots: AttendanceSlotDto[] };
export type AttendanceAlertDto = { employeeId: string; name: string; shiftName: string; startMin: number; kind: "NOT_IN" | "ABSENT"; firedAt: string };
export type AttendanceBoardDto = {
  day: string;
  prevDay: string;
  nextDay: string;
  todayKey: string;
  unitSel: string;
  units: { id: string; name: string }[];
  canClockFor: boolean;
  alerts: AttendanceAlertDto[];
  totals: { workedMin: number; counts: Partial<Record<JudgeStatus, number>> };
  rows: AttendanceRowDto[];
};
export type AttendanceSummary = {
  workDays: number;
  onTime: number;
  lateCount: number;
  lateMin: number;
  earlyOutCount: number;
  absentDays: number;
  leaveDays: number;
  dayOffDays: number;
  missingOut: number;
  otMin: number;
  workedMin: number;
  pendingDays: number;
};
export type AttendanceMonthDto = {
  month: string;
  employee: { id: string; name: string; position: string | null };
  days: { day: string; slots: AttendanceSlotDto[] }[];
  summary: AttendanceSummary;
};

/** สรุปเดือนจากช่องที่แสดง (ค่าที่บันทึกแล้วถ้ามี) — workDays = วันที่มีช่อง ON_TIME/LATE/EARLY_OUT · ที่เหลือนับเป็นช่อง */
export function summarizeSlots(days: readonly { day: string; slots: readonly AttendanceSlotDto[] }[]): AttendanceSummary {
  const s: AttendanceSummary = { workDays: 0, onTime: 0, lateCount: 0, lateMin: 0, earlyOutCount: 0, absentDays: 0, leaveDays: 0, dayOffDays: 0, missingOut: 0, otMin: 0, workedMin: 0, pendingDays: 0 };
  for (const d of days) {
    if (d.slots.some((x) => x.status === "ON_TIME" || x.status === "LATE" || x.status === "EARLY_OUT")) s.workDays++;
    for (const x of d.slots) {
      if (x.status === "ON_TIME") s.onTime++;
      else if (x.status === "LATE") s.lateCount++;
      else if (x.status === "ABSENT") s.absentDays++;
      else if (x.status === "LEAVE") s.leaveDays++;
      else if (x.status === "DAY_OFF") s.dayOffDays++;
      else if (x.status === "PENDING") s.pendingDays++;
      if (x.earlyOutMin > 0) s.earlyOutCount++;
      if (x.missingOut) s.missingOut++;
      s.lateMin += x.lateMin;
      s.otMin += x.otMin;
      s.workedMin += x.workedMin;
    }
  }
  return s;
}
