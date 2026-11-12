// HR H2.5 ▸ ตัดสินผลการลงเวลารายวันจากตารางกะ (server เท่านั้น) — ช่องของวัน · snapshot HrAttendanceDay · การเตือน · บอร์ด 04A · ปฏิทิน 04B
//
// กติกา (brief hr-brief-H2.5 R2–R12 · มติผู้คุม Q1–Q12):
//   • ช่อง (slot) ของพนักงานวัน D: 1 ช่องต่อกะที่ประกาศแล้ว (publishedAt ไม่ว่าง · กะข้ามเที่ยงคืน = วันเริ่ม) · ไม่มีกะ ⇒ ช่อง "DAY":
//     สัปดาห์นั้นใช้ตารางกะอยู่ ⇒ DAY_OFF · ไม่งั้นตารางประจำสัปดาห์ (HrWorkSchedule ตั้งแต่วันที่ตั้ง) · ไม่งั้นมีลงเวลา ⇒ NO_SCHEDULE · ไม่งั้นไม่มีช่อง ·
//     นอกช่วงวันเริ่ม/สิ้นสุดงาน ⇒ ไม่มีช่อง · วันหยุดร้าน + ไม่มีกะ ⇒ DAY_OFF + holidayId
//   • ผลตัดสิน = judge-rules.judgeEntry (ฟังก์ชันล้วน) · การผูกรอบเข้ากะ = judge-rules.attributeSessions
//   • HrAttendanceDay / HrAttendanceAlert เขียนในไฟล์นี้ที่เดียว (ข้อสอบ S9.4): ตัวปิดวัน (ON CONFLICT DO NOTHING ใต้ล็อก
//     hr:clock:<emp> → hr:roster:<sys>:<emp>:<วัน>) · การคิดผลใหม่ (hr:judge:<dayId> ก่อน) · การเตือน (unique ต่อกะต่อชนิด) · ตัวรับ outbox (notifiedAt)
//   • ตัวอ่าน: มีแถว ⇒ แสดงค่าที่บันทึก (stored) · ไม่มี ⇒ คิดสด · stale = ค่าสดต่างจากที่บันทึก (แสดงเฉย ๆ ไม่แก้เอง)
//   • ใบลา: อ่านผ่านตะเข็บเดียว `leavesForJudge` (H2.7 แก้ที่ฟังก์ชันนี้ที่เดียว) · ลาครึ่งวันอีกครึ่งไม่มา = ABSENT แต่เก็บ leaveFraction 0.5 (มติ Q4)
//   • เวลา `opts.now` = ข้อสอบ/ฝั่งเซิร์ฟเวอร์เท่านั้น — action/หน้า/UI ไม่ส่ง (R13) · DTO ไม่มีพิกัด/อุปกรณ์/หมายเหตุ/เหตุผล/เงิน ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { formatThaiDate } from "@/lib/ui/date";
import { logOps } from "@/lib/core/ops";
import { CLOCK_TEXT } from "./clock";
import { clockPolicyOf, type ClockPolicy } from "./clock-rules";
import { employeeOfUser, leaveRowScopeOf } from "./service";
import { hrScopeOf, unitsForScope, type HrScope } from "./scope";
import { canManageHrSettings, type SettingsViewer } from "./settings";
import { canReadRoster } from "./roster-board";
import { unitOfDay } from "./roster";
import { addDays, bkkDayKey, shiftWindow } from "./time-rules";
import type { MembershipCtx } from "@/lib/core/rbac";
import {
  attendancePolicyOf,
  attributeSessions,
  judgeEntry,
  summarizeSlots,
  JUDGE_ENGINE_VERSION,
  type AttendanceAlertDto,
  type AttendanceBoardDto,
  type AttendanceMonthDto,
  type AttendancePolicy,
  type AttendanceRowDto,
  type AttendanceSlotDto,
  type JudgeOutput,
  type JudgeShift,
  type JudgeStatus,
} from "./judge-rules";

type Ctx = { tenantId: string; systemId: string };
type Db = Prisma.TransactionClient;
export type JudgeViewer = SettingsViewer & { userId?: string | null };

export const ATTENDANCE_LATE_EVENT = "hr.attendance.late";
export const ATTENDANCE_ABSENT_EVENT = "hr.attendance.absent";

/** ข้อความคงที่ (ไทยทุกไบต์ — ห้ามต่อชื่อ/id) */
export const JUDGE_TEXT = {
  rNoPerm: "คุณไม่มีสิทธิ์คิดผลการลงเวลาใหม่",
  rNotFound: "ไม่พบผลการลงเวลาของวันนี้ — กรุณารีเฟรช",
  rOwn: "คิดผลการลงเวลาของตัวเองไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการคนอื่นทำ",
  rReason: "ใส่เหตุผลที่คิดผลใหม่ (3–200 ตัวอักษร)",
  rPaid: "เดือนนี้อนุมัติเงินเดือนแล้ว — คิดผลการลงเวลาย้อนหลังไม่ได้",
  nLate: "ยังไม่ลงเวลาเข้างาน",
  nLateSelf: "คุณยังไม่ได้ลงเวลาเข้างาน",
  nAbs: "ไม่พบการลงเวลาเข้างาน",
  stale: "ข้อมูลเปลี่ยนหลังบันทึกผล",
} as const;

const MIN_MS = 60_000;
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const nowOf = (opts: { now?: Date } | undefined): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? new Date(opts.now.getTime()) : new Date());
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const isDay = (d: unknown): d is string => typeof d === "string" && DAY_RE.test(d) && dayOf(new Date(`${d}T00:00:00Z`)) === d;
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const LEAVE_PLAIN_TH = "ลา";
const LEAVE_CATEGORY_TH: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน", OTHER: "ลาอื่น ๆ" };
const SCHEDULE_NAME_TH = "เวลาทำงานประจำ";
const THAI_LEADING_VOWELS = new Set(["เ", "แ", "โ", "ใ", "ไ"]);
const lock = (tx: Db, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;

// ═══════════════════════════ ตะเข็บใบลา (seam เดียว — H2.7 แก้ที่นี่ที่เดียว) ═══════════════════════════
export type JudgeLeave = { id: string; employeeId: string; from: string; to: string; status: "APPROVED" | "PENDING"; halfDay: "AM" | "PM" | null; type: string; policyName: string | null };
/**
 * ใบลาที่ตัดสินผลต้องรู้: APPROVED (มีผลต่อคำตัดสิน) + PENDING (แสดงเท่านั้น) ที่ทับช่วงวัน · ใบลาครึ่งวัน = halfDay ·
 * วันนี้ใช้ HrLeave ตรง ๆ (H2.7 ยังไม่ merge — สมุดวันลา/ชั่วโมงลามาเปลี่ยนที่ฟังก์ชันนี้ที่เดียว)
 */
export async function leavesForJudge(db: Db, ctx: Ctx, employeeIds: string[], from: string, to: string): Promise<JudgeLeave[]> {
  if (!employeeIds.length) return [];
  const rows = await db.hrLeave.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: employeeIds }, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: dbDate(to) }, toDate: { gte: dbDate(from) } },
    select: { id: true, employeeId: true, fromDate: true, toDate: true, status: true, halfDay: true, type: true, policy: { select: { name: true } } },
    orderBy: [{ fromDate: "asc" }, { id: "asc" }],
    take: LEAVE_TAKE,
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    from: dayOf(r.fromDate),
    to: dayOf(r.toDate),
    status: r.status === "APPROVED" ? "APPROVED" : "PENDING",
    halfDay: r.halfDay === "AM" || r.halfDay === "PM" ? r.halfDay : null,
    type: r.type,
    policyName: r.policy?.name?.trim() || null,
  }));
}

// ═══════════════════════════ โหลดข้อมูลของช่วงวัน ═══════════════════════════
const EMP_SELECT = {
  id: true,
  name: true,
  position: true,
  unitId: true,
  linkedUserId: true,
  startDate: true,
  endDate: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const satisfies Prisma.HrEmployeeSelect;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const ENTRY_SELECT = { id: true, employeeId: true, date: true, unitId: true, startMin: true, endMin: true, crossesMidnight: true, shift: { select: { name: true, graceMin: true } } } as const;
type EntryRow = { id: string; employeeId: string; date: Date; unitId: string | null; startMin: number; endMin: number; crossesMidnight: boolean; shift: { name: string; graceMin: number } };
type EventRow = { id: string; employeeId: string; kind: string; at: Date; rosterEntryId: string | null; source: string | null };
type SchedRow = { employeeId: string; weekday: number; dayOff: boolean; startMin: number; endMin: number; graceMin: number; createdAt: Date };
type HolRow = { id: string; unitId: string | null; date: Date };
type Policies = { att: AttendancePolicy; clock: ClockPolicy };
type Data = { entries: EntryRow[]; events: EventRow[]; leaves: JudgeLeave[]; sched: SchedRow[]; hols: HolRow[]; pol: Policies; truncated: boolean };
const LEAVE_TAKE = 5000;
const ENTRY_TAKE = 20_000;
const EVENT_TAKE = 50_000;
const EMP_TAKE = 2000;

async function policiesOf(db: Db, ctx: Ctx): Promise<Policies> {
  const s = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  const o = s?.settings && typeof s.settings === "object" && !Array.isArray(s.settings) ? (s.settings as Record<string, unknown>) : {};
  return { att: attendancePolicyOf(o.hrAttendance), clock: clockPolicyOf(o.hrClock) };
}

/** ข้อมูลทั้งหมดที่ตัดสินวัน from..to ของพนักงานชุดหนึ่งต้องใช้ (ผ่าน client ที่ได้มา — tx หรือ tenantDb) */
async function loadData(db: Db, ctx: Ctx, empIds: string[], from: string, to: string): Promise<Data> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const pol = await policiesOf(db, ctx);
  if (!empIds.length) return { entries: [], events: [], leaves: [], sched: [], hols: [], pol, truncated: false };
  const eFrom = addDays(mondayOf(from), -1);
  const eTo = addDays(mondayOf(to), 7);
  const [entries, events, leaves, sched, hols] = await Promise.all([
    db.hrRosterEntry.findMany({
      where: { ...scope, employeeId: { in: empIds }, publishedAt: { not: null }, date: { gte: dbDate(eFrom), lte: dbDate(eTo) } },
      select: ENTRY_SELECT,
      orderBy: [{ date: "asc" }, { startMin: "asc" }, { id: "asc" }],
      take: ENTRY_TAKE,
    }) as Promise<EntryRow[]>,
    db.hrAttendance.findMany({
      where: { ...scope, employeeId: { in: empIds }, at: { gte: new Date(dbDate(addDays(from, -1)).getTime() - 7 * 3_600_000), lt: new Date(dbDate(addDays(to, 2)).getTime() - 7 * 3_600_000) } },
      select: { id: true, employeeId: true, kind: true, at: true, rosterEntryId: true, source: true },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: EVENT_TAKE,
    }) as Promise<EventRow[]>,
    leavesForJudge(db, ctx, empIds, from, to),
    db.hrWorkSchedule.findMany({ where: { ...scope, employeeId: { in: empIds } }, select: { employeeId: true, weekday: true, dayOff: true, startMin: true, endMin: true, graceMin: true, createdAt: true } }) as Promise<SchedRow[]>,
    db.hrHoliday.findMany({ where: { ...scope, date: { gte: dbDate(from), lte: dbDate(to) } }, select: { id: true, unitId: true, date: true }, orderBy: { id: "asc" } }) as Promise<HolRow[]>,
  ]);
  // มติ r2 I: ถึงเพดาน take = ข้อมูลอาจขาด — ตัวงานตามเวลาไม่เตือน/ไม่ปิดวันบนข้อมูลที่ขาด
  const truncated = entries.length >= ENTRY_TAKE || events.length >= EVENT_TAKE || leaves.length >= LEAVE_TAKE;
  return { entries, events, leaves, sched, hols, pol, truncated };
}

// ═══════════════════════════ ช่องของวัน (R2 · R3) ═══════════════════════════
type SlotLeave = { halfDay: "AM" | "PM" | null; splitAt?: Date };
type LiveSlot = {
  slotKey: string;
  day: string;
  entry: EntryRow | null;
  shift: JudgeShift | null;
  shiftName: string | null;
  dayOff: boolean;
  holidayId: string | null;
  unitId: string | null;
  leave: JudgeLeave | null; // ใบลา APPROVED ของวัน (บันทึก leaveId/leaveHalf)
  slotLeave: SlotLeave | null; // ส่วนของใบลาที่ครอบช่องนี้ตามช่วงเวลา (มีผลต่อคำตัดสิน)
  leaveFraction: string | null; // เก็บครั้งเดียวต่อวัน (ช่องแรก) — ช่องอื่น "0.0" (มติ r2 D)
  shownLeave: JudgeLeave | null; // ที่แสดง (APPROVED ชนะ PENDING)
  events: EventRow[];
  out: JudgeOutput;
};

const employedOn = (e: Pick<EmpRow, "startDate" | "endDate">, day: string) => !(e.startDate && day < dayOf(e.startDate)) && !(e.endDate && day > dayOf(e.endDate));

/**
 * มติ r2 A: รอบที่ไม่เข้ากะใด (rest) เป็นของ "วันไทยของ IN ที่เปิดรอบ" — OUT/พักตาม IN ของมันแม้ข้ามเที่ยงคืน ·
 * แถวที่ไม่มี IN เปิดรอบ (OUT ลอย) อยู่วันของตัวเอง · IN ที่เข้ากะแล้วปิดรอบ rest ที่ค้างอยู่
 */
function restByOpeningDay(events: readonly EventRow[], rest: ReadonlySet<string>): Map<string, EventRow[]> {
  const out = new Map<string, EventRow[]>();
  let openDay: string | null = null;
  for (const e of events) {
    if (!rest.has(e.id)) {
      if (e.kind === "IN") openDay = null;
      continue;
    }
    let d: string;
    if (e.kind === "IN") {
      d = bkkDayKey(e.at);
      openDay = d;
    } else {
      d = openDay ?? bkkDayKey(e.at);
      if (e.kind === "OUT") openDay = null;
    }
    out.set(d, [...(out.get(d) ?? []), e]);
  }
  return out;
}

/**
 * มติ r2 D: ใบลาครึ่งวันคิดตามช่วงเวลาของทั้งวัน (เริ่มกะแรก → เลิกกะสุดท้าย · M = จุดกึ่งกลาง) ·
 * ช่องที่อยู่ในครึ่งที่ลาทั้งช่อง = ลาเต็มช่อง · นอกครึ่งที่ลา = ไม่มีลา · คร่อม M = กติกาครึ่งวัน (ควรเข้า/เลิก = M) · ลาทั้งวัน = ทุกช่อง
 */
function slotLeaves(windows: readonly { start: Date; end: Date }[], lv: JudgeLeave | null): (SlotLeave | null)[] {
  if (!lv) return windows.map(() => null);
  if (!lv.halfDay) return windows.map(() => ({ halfDay: null }));
  const s0 = Math.min(...windows.map((w) => w.start.getTime()));
  const e0 = Math.max(...windows.map((w) => w.end.getTime()));
  const M = s0 + Math.floor(Math.floor((e0 - s0) / MIN_MS) / 2) * MIN_MS;
  return windows.map((w) => {
    const s = w.start.getTime();
    const e = w.end.getTime();
    if (lv.halfDay === "AM") return e <= M ? { halfDay: null } : s >= M ? null : { halfDay: "AM", splitAt: new Date(M) };
    return s >= M ? { halfDay: null } : e <= M ? null : { halfDay: "PM", splitAt: new Date(M) };
  });
}

/** ช่องคิดสดของพนักงานหนึ่งคนในวันที่ส่งมา (Map วัน → ช่อง เรียงตามเวลาเริ่ม) */
function slotsOf(emp: EmpRow, days: readonly string[], data: Data, now: Date): Map<string, LiveSlot[]> {
  const out = new Map<string, LiveSlot[]>();
  const { pol } = data;
  const entries = data.entries.filter((e) => e.employeeId === emp.id);
  const events = data.events.filter((e) => e.employeeId === emp.id);
  const leaves = data.leaves.filter((l) => l.employeeId === emp.id);
  const attr = attributeSessions(
    entries.map((e) => ({ id: e.id, employeeId: e.employeeId, date: dayOf(e.date), startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight })),
    events.map((e) => ({ id: e.id, kind: e.kind, at: e.at, rosterEntryId: e.rosterEntryId })),
    { employeeId: emp.id, earlyInMin: pol.clock.earlyInMin, closeGraceMin: pol.clock.closeGraceMin },
  );
  const evById = new Map(events.map((e) => [e.id, e]));
  const restByDay = restByOpeningDay(events, new Set(attr.rest));
  const judge = (day: string, shift: JudgeShift | null, dayOff: boolean, evs: EventRow[], leave: SlotLeave | null): JudgeOutput =>
    judgeEntry({ day, shift, dayOff, events: evs.map((e) => ({ kind: e.kind, at: e.at })), leave, policy: pol.att, closeGraceMin: pol.clock.closeGraceMin, now });
  for (const day of days) {
    if (!employedOn(emp, day)) continue;
    const unitOf = unitOfDay(emp, day);
    const onDay = leaves.filter((l) => l.from <= day && day <= l.to);
    const approved = onDay.find((l) => l.status === "APPROVED") ?? null;
    const shown = approved ?? onDay[0] ?? null;
    const hol = data.hols.find((h) => dayOf(h.date) === day && h.unitId !== null && h.unitId === unitOf) ?? data.hols.find((h) => dayOf(h.date) === day && h.unitId === null) ?? null;
    const list: LiveSlot[] = [];
    const dayEntries = entries
      .filter((e) => dayOf(e.date) === day)
      .flatMap((e) => {
        const shift: JudgeShift = { startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight, graceMin: e.shift.graceMin };
        try {
          return [{ e, shift, w: shiftWindow(day, shift) }];
        } catch {
          return []; // แถวเวลาเสีย (ก่อนกติกา H1.2) — ไม่ตัดสิน
        }
      });
    const eLeaves = slotLeaves(dayEntries.map((x) => x.w), approved);
    for (const [i, { e, shift }] of dayEntries.entries()) {
      const evs = (attr.byEntry[e.id] ?? []).map((id) => evById.get(id)!).filter(Boolean);
      const sl = eLeaves[i] ?? null;
      list.push({ slotKey: e.id, day, entry: e, shift, shiftName: e.shift.name, dayOff: false, holidayId: hol?.id ?? null, unitId: e.unitId ?? unitOf, leave: approved, slotLeave: sl, leaveFraction: null, shownLeave: shown, events: evs, out: judge(day, shift, false, evs, sl) });
    }
    const rest = restByDay.get(day) ?? [];
    if (!dayEntries.length) {
      const mon = mondayOf(day);
      const sun = addDays(mon, 6);
      const inUse = entries.some((e) => dayOf(e.date) >= mon && dayOf(e.date) <= sun);
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
      const sch = data.sched.find((s) => s.employeeId === emp.id && s.weekday === wd && day >= bkkDayKey(s.createdAt)) ?? null;
      let shift: JudgeShift | null = null;
      let dayOff = false;
      if (inUse) dayOff = true;
      else if (sch) {
        if (hol || sch.dayOff || sch.startMin === sch.endMin) dayOff = true;
        else shift = { startMin: sch.startMin, endMin: sch.endMin, crossesMidnight: sch.endMin < sch.startMin, graceMin: sch.graceMin };
      } else if (!rest.length) {
        if (list.length) out.set(day, list);
        continue;
      } else if (hol) dayOff = true; // มติ r2 G: มาทำงานวันหยุดโดยไม่มีตาราง = DAY_OFF + holidayId
      let sl: SlotLeave | null = null;
      if (shift) {
        try {
          sl = slotLeaves([shiftWindow(day, shift)], approved)[0] ?? null;
        } catch {
          shift = null;
        }
      }
      list.push({ slotKey: "DAY", day, entry: null, shift, shiftName: shift ? SCHEDULE_NAME_TH : null, dayOff, holidayId: hol?.id ?? null, unitId: unitOf, leave: shift ? approved : null, slotLeave: sl, leaveFraction: null, shownLeave: shown, events: rest, out: judge(day, shift, dayOff, rest, sl) });
    } else if (rest.some((e) => e.kind === "IN")) {
      // รอบที่ไม่เข้ากะใดเลยในวันที่มีกะ — ไม่ทิ้งนาทีทำงาน: ช่อง DAY แบบไม่มีตาราง (วันหยุด = DAY_OFF)
      list.push({ slotKey: "DAY", day, entry: null, shift: null, shiftName: null, dayOff: !!hol, holidayId: hol?.id ?? null, unitId: unitOf, leave: null, slotLeave: null, leaveFraction: null, shownLeave: shown, events: rest, out: judge(day, null, !!hol, rest, null) });
    }
    // ส่วนวันลาเก็บครั้งเดียวต่อวัน (ช่องแรกที่มีใบลา) — ช่องอื่นของวันเดียวกัน 0
    const withLeave = list.filter((x) => x.leave);
    for (const [i, x] of withLeave.entries()) x.leaveFraction = i === 0 ? (x.leave!.halfDay ? "0.5" : "1.0") : "0.0";
    if (list.length) out.set(day, list);
  }
  return out;
}

// ═══════════════════════════ แถว snapshot ═══════════════════════════
const DAY_SELECT = {
  id: true,
  employeeId: true,
  date: true,
  slotKey: true,
  unitId: true,
  status: true,
  lateMin: true,
  earlyOutMin: true,
  workedMin: true,
  breakMin: true,
  otMin: true,
  missingOut: true,
  version: true,
} as const;
type DayRow = { id: string; employeeId: string; date: Date; slotKey: string; unitId: string | null; status: string; lateMin: number; earlyOutMin: number; workedMin: number; breakMin: number; otMin: number; missingOut: boolean; version: number };

/** คอลัมน์ผลตัดสินของแถว (ตัวปิดวัน/คิดผลใหม่ใช้ชุดเดียวกัน) */
function judgedColumns(s: LiveSlot) {
  const ins = s.events.filter((e) => e.kind === "IN");
  const outs = s.events.filter((e) => e.kind === "OUT");
  const lv = s.leave;
  return {
    rosterEntryId: s.entry?.id ?? null,
    unitId: s.unitId,
    startMin: s.shift?.startMin ?? null,
    endMin: s.shift?.endMin ?? null,
    crossesMidnight: s.shift ? s.shift.crossesMidnight : null,
    graceMin: s.shift?.graceMin ?? null,
    status: s.out.status as Exclude<JudgeStatus, "PENDING">,
    lateMin: s.out.lateMin,
    earlyOutMin: s.out.earlyOutMin,
    workedMin: s.out.workedMin,
    breakMin: s.out.breakMin,
    otMin: s.out.otMin,
    missingOut: s.out.missingOut,
    leaveId: lv?.id ?? null,
    leaveHalf: lv?.halfDay ?? null,
    leaveFraction: s.leaveFraction,
    holidayId: s.holidayId,
    inAttendanceId: ins[0]?.id ?? null,
    outAttendanceId: s.out.missingOut ? null : (outs[outs.length - 1]?.id ?? null),
  };
}
const STALE_KEYS = ["status", "lateMin", "earlyOutMin", "otMin", "workedMin", "missingOut"] as const;
const isStale = (live: LiveSlot | null, row: DayRow) => !live || STALE_KEYS.some((k) => (live.out as unknown as Record<string, unknown>)[k] !== (row as unknown as Record<string, unknown>)[k]);

// ═══════════════════════════ DTO ═══════════════════════════
const leaveLabel = (l: JudgeLeave, wide: boolean) => (wide ? l.policyName || LEAVE_CATEGORY_TH[l.type] || LEAVE_PLAIN_TH : LEAVE_PLAIN_TH);
function slotDto(live: LiveSlot | null, row: DayRow | null, wideLeave: boolean): AttendanceSlotDto {
  const evs = live?.events ?? [];
  const firstIn = evs.find((e) => e.kind === "IN") ?? null;
  const outs = evs.filter((e) => e.kind === "OUT");
  const breaks: { from: string; to: string | null }[] = [];
  for (const [i, e] of evs.entries()) {
    if (e.kind !== "BREAK_START") continue;
    const end = evs.slice(i + 1).find((x) => x.kind === "BREAK_END" || x.kind === "OUT" || x.kind === "IN") ?? null;
    breaks.push({ from: e.at.toISOString(), to: end ? end.at.toISOString() : null });
  }
  const base = {
    slotKey: live?.slotKey ?? row!.slotKey,
    dayId: row?.id ?? null,
    shift: live?.shift ? { name: live.shiftName ?? "", startMin: live.shift.startMin, endMin: live.shift.endMin, crossesMidnight: live.shift.crossesMidnight } : null,
    inAt: firstIn ? firstIn.at.toISOString() : null,
    outAt: outs.length ? outs[outs.length - 1]!.at.toISOString() : null,
    method: firstIn?.source ?? null,
    breaks,
    leave: live?.shownLeave ? { label: leaveLabel(live.shownLeave, wideLeave), pending: live.shownLeave.status !== "APPROVED" } : null,
  };
  if (row) {
    return { ...base, status: row.status as JudgeStatus, phase: "FINAL", final: true, stored: true, stale: isStale(live, row), lateMin: row.lateMin, earlyOutMin: row.earlyOutMin, workedMin: row.workedMin, otMin: row.otMin, missingOut: row.missingOut };
  }
  const o = live!.out;
  return { ...base, status: o.status, phase: o.phase, final: o.final, stored: false, stale: false, lateMin: o.lateMin, earlyOutMin: o.earlyOutMin, workedMin: o.workedMin, otMin: o.otMin, missingOut: o.missingOut };
}
/** ช่องของวัน (คิดสด + แถวที่บันทึก — แถวที่ไม่มีช่องสดคู่กันยังแสดง พร้อม stale) */
function mergeDay(live: LiveSlot[], rows: DayRow[], wideLeave: boolean): AttendanceSlotDto[] {
  const used = new Set<string>();
  // มติ r2 C: มีแถวกำพร้า (กะของแถวถูกย้าย/ลบ/ถอนประกาศ) ⇒ แสดงเฉพาะแถวที่บันทึก (stale) — นาทีทำงานไม่ถูกนับซ้ำจนกว่าจะคิดผลใหม่
  if (hasOrphan(live, rows)) live = live.filter((s) => rows.some((r) => r.slotKey === s.slotKey));
  const out = live.map((s) => {
    const r = rows.find((x) => x.slotKey === s.slotKey) ?? null;
    if (r) used.add(r.id);
    return slotDto(s, r, wideLeave);
  });
  for (const r of rows) if (!used.has(r.id)) out.push(slotDto(null, r, wideLeave));
  return out;
}

/** แถวที่บันทึกของวันที่ไม่มีช่องสดคู่กันแล้ว (กำพร้า) */
const hasOrphan = (live: readonly { slotKey: string }[], rows: readonly { slotKey: string }[]) => rows.some((r) => !live.some((s) => s.slotKey === r.slotKey));

const viewerMembership = (v: JudgeViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
const scopeOfViewer = (v: JudgeViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
const covers = (scope: HrScope, unitId: string | null) => scope.unitIds === "*" || (unitId !== null && scope.unitIds.includes(unitId));
function initialOf(name: string): string {
  for (const ch of Array.from(name.trim())) if (!THAI_LEADING_VOWELS.has(ch) && ch.trim()) return ch;
  return "·";
}
async function employeesOf(db: Db, ctx: Ctx, where: Prisma.HrEmployeeWhereInput = {}): Promise<EmpRow[]> {
  return (await db.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...where }, select: EMP_SELECT, orderBy: [{ name: "asc" }, { id: "asc" }], take: EMP_TAKE })) as EmpRow[];
}
const dbOf = (ctx: Ctx) => tenantDb(ctx) as unknown as Db;

// ═══════════════════════════ บอร์ดทีมรายวัน 04A (R9) ═══════════════════════════
export async function loadAttendanceBoard(ctx: Ctx, viewer: JudgeViewer, input: { day?: unknown; unit?: unknown }, opts: { now?: Date } = {}): Promise<AttendanceBoardDto | null> {
  if (!canReadRoster(viewer)) return null;
  const now = nowOf(opts);
  const todayKey = bkkDayKey(now);
  const day = isDay(input?.day) ? input.day : todayKey;
  const scope = scopeOfViewer(viewer);
  const units = await unitsForScope(ctx.tenantId, scope);
  const unitSel = typeof input?.unit === "string" && units.some((u) => u.id === input.unit) ? input.unit : "all";
  const db = dbOf(ctx);
  const emps = await employeesOf(db, ctx);
  const data = await loadData(db, ctx, emps.map((e) => e.id), day, day);
  const wide = "all" in leaveRowScopeOf(viewerMembership(viewer), viewer.userId ?? "");
  const rowsDb = (await db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: dbDate(day) }, select: DAY_SELECT })) as DayRow[];
  const rows: AttendanceRowDto[] = [];
  const counts: Partial<Record<JudgeStatus, number>> = {};
  let workedMin = 0;
  for (const e of emps) {
    const live = slotsOf(e, [day], data, now).get(day) ?? [];
    const mine = rowsDb.filter((r) => r.employeeId === e.id);
    if (!live.length && !mine.length) continue;
    const unit = live[0]?.unitId ?? mine[0]?.unitId ?? unitOfDay(e, day);
    if (!covers(scope, unit)) continue;
    if (unitSel !== "all" && unit !== unitSel) continue;
    const slots = mergeDay(live, mine, wide);
    for (const s of slots) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      workedMin += s.workedMin;
    }
    rows.push({ employeeId: e.id, name: e.name, initial: initialOf(e.name), position: e.position ?? null, borrowed: !!e.unitId && unitOfDay(e, day) !== e.unitId, slots });
  }
  const shown = new Set(rows.map((r) => r.employeeId));
  const alertRows = await db.hrAttendanceAlert.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: dbDate(day), employeeId: { in: [...shown] } }, select: { employeeId: true, rosterEntryId: true, kind: true, firedAt: true }, orderBy: [{ firedAt: "asc" }, { id: "asc" }], take: 500 });
  const alerts: AttendanceAlertDto[] = alertRows.flatMap((a) => {
    const en = data.entries.find((x) => x.id === a.rosterEntryId);
    const emp = emps.find((x) => x.id === a.employeeId);
    return en && emp ? [{ employeeId: a.employeeId, name: emp.name, shiftName: en.shift.name, startMin: en.startMin, kind: a.kind, firedAt: a.firedAt.toISOString() }] : [];
  });
  return {
    day,
    prevDay: addDays(day, -1),
    nextDay: addDays(day, 1),
    todayKey,
    unitSel,
    units,
    canClockFor: canManageHrSettings(viewer),
    alerts,
    totals: { workedMin, counts },
    rows,
  };
}

// ═══════════════════════════ ปฏิทินรายคน 04B (R10) + ของตัวเอง (R11) ═══════════════════════════
function monthDays(month: string): string[] {
  const m = MONTH_RE.exec(month)!;
  const first = `${m[1]}-${m[2]}-01`;
  const out: string[] = [];
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
  return out;
}
const monthOf = (v: unknown, now: Date): string => (typeof v === "string" && MONTH_RE.test(v) && Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12 ? v : bkkDayKey(now).slice(0, 7));

async function monthDto(ctx: Ctx, emp: EmpRow, month: string, wide: boolean, now: Date, scope: HrScope | null = null): Promise<AttendanceMonthDto> {
  const db = dbOf(ctx);
  const days = monthDays(month);
  const data = await loadData(db, ctx, [emp.id], days[0]!, days[days.length - 1]!);
  const live = slotsOf(emp, days, data, now);
  const rowsDb = (await db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, date: { gte: dbDate(days[0]!), lte: dbDate(days[days.length - 1]!) } }, select: DAY_SELECT })) as DayRow[];
  // ช่องที่สาขาอยู่นอกขอบเขตผู้ดู (ยืมตัวไปสาขาอื่น) ไม่แสดง
  const ok = (u: string | null) => !scope || covers(scope, u);
  const out = days.map((day) => ({ day, slots: mergeDay((live.get(day) ?? []).filter((x) => ok(x.unitId)), rowsDb.filter((r) => dayOf(r.date) === day && ok(r.unitId)), wide) }));
  return { month, employee: { id: emp.id, name: emp.name, position: emp.position ?? null }, days: out, summary: summarizeSlots(out) };
}

/** ปฏิทินเดือนของพนักงานหนึ่งคน · null = ไม่ใช่ผู้อ่าน / ไม่พบ / นอกขอบเขตสาขา */
export async function loadAttendanceMonth(ctx: Ctx, viewer: JudgeViewer, input: { employeeId?: unknown; month?: unknown }, opts: { now?: Date } = {}): Promise<AttendanceMonthDto | null> {
  if (!canReadRoster(viewer)) return null;
  const now = nowOf(opts);
  const id = typeof input?.employeeId === "string" ? input.employeeId.trim() : "";
  if (!id) return null;
  const emp = (await employeesOf(dbOf(ctx), ctx, { id }))[0];
  if (!emp) return null;
  const scope = scopeOfViewer(viewer);
  if (scope.unitIds !== "*" && !covers(scope, emp.unitId) && !covers(scope, unitOfDay(emp, bkkDayKey(now)))) return null;
  const wide = "all" in leaveRowScopeOf(viewerMembership(viewer), viewer.userId ?? "");
  return monthDto(ctx, emp, monthOf(input?.month, now), wide, now, scope);
}

/** ปฏิทินของตัวเอง — พนักงานจากบัญชีผู้ใช้เท่านั้น (ไม่รับ id จากผู้เรียก) · เห็นประเภทลาของตัวเอง */
export async function myAttendanceMonth(
  actor: { tenantId: string; userId: string },
  input: { month?: unknown },
  opts: { now?: Date } = {},
): Promise<({ ok: true; systemId: string } & AttendanceMonthDto) | { ok: false; reason: string }> {
  const link = await employeeOfUser(actor?.tenantId ?? "", actor?.userId ?? "");
  if (!link) return { ok: false, reason: CLOCK_TEXT.mNoEmp };
  const ctx: Ctx = { tenantId: actor.tenantId, systemId: link.systemId };
  const emp = (await employeesOf(dbOf(ctx), ctx, { id: link.employeeId }))[0];
  if (!emp) return { ok: false, reason: CLOCK_TEXT.mNoEmp };
  const now = nowOf(opts);
  return { ok: true, systemId: ctx.systemId, ...(await monthDto(ctx, emp, monthOf(input?.month, now), true, now)) };
}

// ═══════════════════════════ ตัวปิดวัน + การเตือน (R4 · R6 · R7) ═══════════════════════════
const LIMIT = { slotsPerSystem: 200, alertsPerSystem: 100, slots: 2000, alerts: 500 } as const;
const WINDOW_DAYS = 7;

/**
 * ปิดช่องเดียว (ใต้ล็อก — อ่านใหม่ทั้งหมดใน tx) · คืนจำนวนแถวที่เพิ่ม (0/1) ·
 * มติ r2 C: วันของพนักงานที่มีแถวกำพร้า (กะของแถวถูกย้าย/ลบ/ถอนประกาศหลังปิดวัน) ⇒ ไม่เขียนแถวใหม่ (นาทีทำงานอยู่ในแถวเดิมแล้ว — ต้องคิดผลใหม่)
 */
async function finalizeSlot(ctx: Ctx, emp: EmpRow, day: string, slotKey: string, now: Date): Promise<number> {
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:clock:${emp.id}`);
    await lock(tx, `hr:roster:${ctx.systemId}:${emp.id}:${day}`);
    const data = await loadData(tx, ctx, [emp.id], day, day);
    const live = slotsOf(emp, [day], data, now).get(day) ?? [];
    const s = live.find((x) => x.slotKey === slotKey);
    if (!s || !s.out.final) return 0;
    const stored = await tx.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, date: dbDate(day) }, select: { slotKey: true } });
    if (hasOrphan(live, stored)) return 0;
    const r = await tx.hrAttendanceDay.createMany({
      data: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, date: dbDate(day), slotKey, ...judgedColumns(s), engineVersion: JUDGE_ENGINE_VERSION, version: 1, judgedAt: now }],
      skipDuplicates: true,
    });
    return r.count;
  }, TX_OPTS);
}

/** ช่องนี้ไม่ต้องเตือน: ลาเต็มช่อง หรือลาเช้าที่คร่อมช่อง (R7) */
const leaveSilences = (s: LiveSlot) => !!s.slotLeave && s.slotLeave.halfDay !== "PM";

/**
 * ยิงการเตือนหนึ่งครั้ง (unique ต่อกะต่อชนิด) + event ใน tx เดียวกันเฉพาะเมื่อเพิ่มแถวจริง ·
 * มติ r2 I: ถือ hr:clock:<emp> แล้วคิดช่องใหม่ — มีการเข้างานแล้ว (หรือช่องเปลี่ยน) ⇒ ไม่ยิง
 */
async function fireAlert(ctx: Ctx, emp: EmpRow, s0: LiveSlot, kind: "NOT_IN" | "ABSENT", now: Date): Promise<number> {
  const entryId = s0.entry!.id;
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:clock:${emp.id}`);
    const data = await loadData(tx, ctx, [emp.id], s0.day, s0.day);
    const s = (slotsOf(emp, [s0.day], data, now).get(s0.day) ?? []).find((x) => x.slotKey === entryId);
    if (!s || !s.entry || s.events.some((x) => x.kind === "IN") || leaveSilences(s)) return 0;
    const r = await tx.hrAttendanceAlert.createMany({
      data: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, rosterEntryId: entryId, date: dbDate(s.day), kind, firedAt: now }],
      skipDuplicates: true,
    });
    if (r.count !== 1) return 0;
    const a = await tx.hrAttendanceAlert.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, rosterEntryId: entryId, kind }, select: { id: true } });
    if (!a) return 0;
    const type = kind === "NOT_IN" ? ATTENDANCE_LATE_EVENT : ATTENDANCE_ABSENT_EVENT;
    await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: s.unitId, type, idempotencyKey: `${type}#${a.id}`, payload: { alertId: a.id, employeeId: emp.id, rosterEntryId: entryId, systemId: ctx.systemId } });
    return 1;
  }, TX_OPTS);
}

async function hrSystems(tenantId: string | null | undefined): Promise<Ctx[]> {
  if (tenantId) {
    const rows = await tenantDb({ tenantId }).appSystem.findMany({ where: { type: "HR" }, select: { id: true }, orderBy: { id: "asc" } });
    return rows.map((r) => ({ tenantId, systemId: r.id }));
  }
  // ทุกร้าน (cron) — อ่านอย่างเดียว · ทางเดียวกับ purgeClockPrivacy (H2.4)
  const rows = await tenantDb({ tenantId: "" }).$queryRaw<{ id: string; tenantId: string }[]>`SELECT "id", "tenantId" FROM "AppSystem" WHERE "type"::text = 'HR' ORDER BY "id"`;
  return rows.map((r) => ({ tenantId: r.tenantId, systemId: r.id }));
}

/**
 * งานตามเวลา: วัน D−7…D (D = วันไทยของ now) ทุกระบบ HR (เรียงตาม id) — เตือนก่อน แล้วปิดวัน ·
 * ต่อระบบ ≤ 200 ช่อง + ≤ 100 การเตือน · รวม ≤ 2 000 / 500 · หยุดเมื่อถึง deadline · ไม่มีอะไรถึงเวลา = ไม่เขียนอะไรเลย ·
 * พนักงานที่ปิดใช้ (active=false) หรือพ้นสภาพ (ENDED) ไม่ถูกเตือน/ปิดวัน (มติ r2 E) · ข้อมูลถึงเพดาน take ⇒ ข้ามระบบนั้นในรอบนี้ + WARN (มติ r2 I) ·
 * `tenantId` = จำกัดร้านเดียว (ข้อสอบ) · คืนจำนวนแถวที่เพิ่มจริง
 */
export async function runAttendanceJobs(input: { now: Date; tenantId?: string | null; deadline?: Date | null }): Promise<{ finalized: number; late: number; absent: number }> {
  const now = input?.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : nowOf(undefined);
  const deadline = input?.deadline instanceof Date ? input.deadline.getTime() : Number.POSITIVE_INFINITY;
  const D = bkkDayKey(now);
  const from = addDays(D, -WINDOW_DAYS);
  const days = Array.from({ length: WINDOW_DAYS + 1 }, (_, i) => addDays(from, i));
  const res = { finalized: 0, late: 0, absent: 0 };
  let slotBudget: number = LIMIT.slots;
  let alertBudget: number = LIMIT.alerts;
  for (const ctx of await hrSystems(input?.tenantId)) {
    if (Date.now() >= deadline || (slotBudget <= 0 && alertBudget <= 0)) break;
    const db = dbOf(ctx);
    const emps = (await employeesOf(db, ctx, {
      active: true,
      AND: [{ OR: [{ employmentStatus: null }, { employmentStatus: { not: "ENDED" } }] }, { OR: [{ startDate: null }, { startDate: { lte: dbDate(D) } }] }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(from) } }] }],
    })) as EmpRow[];
    if (!emps.length) continue;
    const data = await loadData(db, ctx, emps.map((e) => e.id), from, D);
    if (data.truncated || emps.length >= EMP_TAKE) {
      await logOps("WARN", "hr.attendance", "runAttendanceJobs: ข้อมูลถึงเพดาน (truncated) — ข้ามการเตือน/ปิดวันของระบบนี้ในรอบนี้", { tenantId: ctx.tenantId, detail: `system=${ctx.systemId} employees=${emps.length} entries=${data.entries.length} events=${data.events.length} leaves=${data.leaves.length}` });
      continue;
    }
    const [stored, fired] = await Promise.all([
      db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: { gte: dbDate(from), lte: dbDate(D) } }, select: { employeeId: true, date: true, slotKey: true } }),
      db.hrAttendanceAlert.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: { gte: dbDate(from), lte: dbDate(D) } }, select: { employeeId: true, rosterEntryId: true, kind: true } }),
    ]);
    const have = new Set(stored.map((r) => `${r.employeeId}|${dayOf(r.date)}|${r.slotKey}`));
    const storedByDay = new Map<string, { slotKey: string }[]>();
    for (const r of stored) {
      const k = `${r.employeeId}|${dayOf(r.date)}`;
      storedByDay.set(k, [...(storedByDay.get(k) ?? []), r]);
    }
    const sent = new Set(fired.map((a) => `${a.employeeId}|${a.rosterEntryId}|${a.kind}`));
    const graceMs = data.pol.clock.closeGraceMin * MIN_MS;
    const live = emps.map((e) => ({ e, byDay: slotsOf(e, days, data, now) }));
    // ── การเตือน (R7) ──
    let alerts = 0;
    if (data.pol.att.alertsOn) {
      for (const { e, byDay } of live) {
        for (const s of [...byDay.values()].flat()) {
          if (!s.entry || !s.shift || alerts >= LIMIT.alertsPerSystem || alertBudget <= 0 || Date.now() >= deadline) continue;
          if (s.events.some((x) => x.kind === "IN") || leaveSilences(s)) continue;
          const end = shiftWindow(s.day, s.shift).end.getTime();
          const t = now.getTime();
          const due: ("NOT_IN" | "ABSENT")[] = [];
          if (s.out.alertAt && s.out.alertAt.getTime() <= t && t < end) due.push("NOT_IN");
          if (s.out.absentAt && s.out.absentAt.getTime() <= t && t < end + graceMs) due.push("ABSENT");
          for (const kind of due) {
            if (sent.has(`${e.id}|${s.entry.id}|${kind}`)) continue;
            const n = await fireAlert(ctx, e, s, kind, now);
            sent.add(`${e.id}|${s.entry.id}|${kind}`);
            alerts++;
            alertBudget--;
            if (kind === "NOT_IN") res.late += n;
            else res.absent += n;
          }
        }
      }
    }
    // ── ปิดวัน (R4) ──
    let n = 0;
    for (const { e, byDay } of live) {
      for (const [day, slots] of byDay) {
        if (hasOrphan(slots, storedByDay.get(`${e.id}|${day}`) ?? [])) continue; // มติ r2 C
        for (const s of slots) {
          if (!s.out.final || have.has(`${e.id}|${s.day}|${s.slotKey}`)) continue;
          if (n >= LIMIT.slotsPerSystem || slotBudget <= 0 || Date.now() >= deadline) break;
          res.finalized += await finalizeSlot(ctx, e, s.day, s.slotKey, now);
          n++;
          slotBudget--;
        }
      }
    }
  }
  return res;
}

// ═══════════════════════════ คิดผลใหม่ (R5) ═══════════════════════════
type RecomputeResult = { ok: true; id: string; changed: boolean; version: number } | { ok: false; reason: string };
const CMP_KEYS = ["rosterEntryId", "unitId", "startMin", "endMin", "crossesMidnight", "graceMin", "status", "lateMin", "earlyOutMin", "workedMin", "breakMin", "otMin", "missingOut", "leaveId", "leaveHalf", "leaveFraction", "holidayId", "inAttendanceId", "outAttendanceId"] as const;
const cmpVal = (v: unknown) => (v === null || v === undefined ? null : typeof v === "object" && "toFixed" in (v as object) ? Number(v as never).toFixed(1) : typeof v === "string" && /^\d+\.\d$/.test(v) ? v : v);
const SNAP_KEYS = ["slotKey", "status", "lateMin", "earlyOutMin", "workedMin", "breakMin", "otMin", "missingOut", "startMin"] as const;

/**
 * คิดผลของแถวเดียวใหม่จากข้อมูลปัจจุบัน (ตารางกะ/ลงเวลา/ใบลาที่แก้หลังปิดวัน) — ไม่แตะแถวอื่น ไม่ยิง event ·
 * มติ r2 C: แถวกำพร้า (กะถูกย้าย/ลบ/ถอนประกาศ) ⇒ ย้ายแถวไปที่ช่องสดของวันเดียวกันที่ยังไม่มีแถว (slotKey ใหม่ · version+1) ·
 *   ไม่มีช่องว่างให้ย้าย ⇒ ลบแถวนั้น (audit เก็บค่าก่อนลบ · voided) — วันหนึ่งไม่มีนาทีทำงานซ้ำ ·
 * มติ r2 H: งวดเงินเดือนตรวจใน tx ใต้ล็อกงวด `hr:payroll:run:<ระบบ>:<งวด>` (คีย์เดียวกับสร้าง/อนุมัติ/จ่ายรอบใน hr/payroll.ts)
 */
export async function recomputeAttendanceDay(ctx: Ctx, viewer: JudgeViewer, input: { dayId?: unknown; reason?: unknown }, opts: { now?: Date } = {}): Promise<RecomputeResult> {
  if (!viewer || !canManageHrSettings(viewer)) return { ok: false, reason: JUDGE_TEXT.rNoPerm };
  const dayId = typeof input?.dayId === "string" ? input.dayId.trim() : "";
  const db = dbOf(ctx);
  const row = dayId ? await db.hrAttendanceDay.findFirst({ where: { id: dayId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, employeeId: true, date: true, slotKey: true, unitId: true } }) : null;
  if (!row) return { ok: false, reason: JUDGE_TEXT.rNotFound };
  const scope = scopeOfViewer(viewer);
  if (!covers(scope, row.unitId)) return { ok: false, reason: JUDGE_TEXT.rNotFound };
  const emp = (await employeesOf(db, ctx, { id: row.employeeId }))[0];
  if (!emp) return { ok: false, reason: JUDGE_TEXT.rNotFound };
  if (viewer.role !== "OWNER" && !!viewer.userId && emp.linkedUserId === viewer.userId) return { ok: false, reason: JUDGE_TEXT.rOwn };
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (Array.from(reason).length < 3 || Array.from(reason).length > 200) return { ok: false, reason: JUDGE_TEXT.rReason };
  const day = dayOf(row.date);
  const now = nowOf(opts);
  type Out = { paid: true } | { changed: boolean; voided: boolean; version: number; before: Record<string, unknown>; after: Record<string, unknown> | null } | null;
  const out: Out = await tenantDb(ctx).$transaction(async (t): Promise<Out> => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:payroll:run:${ctx.systemId}:${day.slice(0, 7)}`);
    const paid = await tx.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: day.slice(0, 7), status: { in: ["APPROVED", "PAID"] } }, select: { id: true } });
    if (paid) return { paid: true };
    await lock(tx, `hr:judge:${row.id}`);
    await lock(tx, `hr:clock:${emp.id}`);
    await lock(tx, `hr:roster:${ctx.systemId}:${emp.id}:${day}`);
    const cur = await tx.hrAttendanceDay.findFirst({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!cur) return null;
    const data = await loadData(tx, ctx, [emp.id], day, day);
    const live = slotsOf(emp, [day], data, now).get(day) ?? [];
    const curRec = cur as unknown as Record<string, unknown>;
    const before = Object.fromEntries(SNAP_KEYS.map((k) => [k, curRec[k]]));
    let s = live.find((x) => x.slotKey === cur.slotKey) ?? null;
    if (!s) {
      const taken = new Set((await tx.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, date: dbDate(day) }, select: { slotKey: true } })).map((r) => r.slotKey));
      s = live.find((x) => !taken.has(x.slotKey)) ?? null;
      if (!s) {
        const del = await tx.hrAttendanceDay.deleteMany({ where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: cur.version } });
        if (del.count !== 1) return null;
        return { changed: true, voided: true, version: cur.version + 1, before, after: null };
      }
    }
    const next = { slotKey: s.slotKey, ...judgedColumns(s) };
    const nextRec = next as unknown as Record<string, unknown>;
    const same = next.slotKey === cur.slotKey && CMP_KEYS.every((k) => cmpVal(curRec[k]) === cmpVal(nextRec[k]));
    if (same) return { changed: false, voided: false, version: cur.version, before, after: before };
    const upd = await tx.hrAttendanceDay.updateMany({
      where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: cur.version },
      data: { ...next, version: cur.version + 1, judgedAt: now, recomputedAt: now, recomputedById: viewer.userId ?? null, recomputeReason: reason },
    });
    if (upd.count !== 1) return null;
    return { changed: true, voided: false, version: cur.version + 1, before, after: Object.fromEntries(SNAP_KEYS.map((k) => [k, nextRec[k]])) };
  }, TX_OPTS);
  if (out && "paid" in out) return { ok: false, reason: JUDGE_TEXT.rPaid };
  if (!out) return { ok: false, reason: JUDGE_TEXT.rNotFound };
  if (out.changed) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorType: viewer.userId ? "USER" : "SYSTEM",
      actorId: viewer.userId ?? null,
      action: "hr.attendance.day_recomputed",
      targetType: "HrAttendanceDay",
      targetId: row.id,
      after: { dayId: row.id, employeeId: row.employeeId, date: day, systemId: ctx.systemId, before: out.before, after: out.after, ...(out.voided ? { voided: true, reason } : {}) },
    });
  }
  return { ok: true, id: row.id, changed: out.changed, version: out.version };
}

// ═══════════════════════════ ตัวรับ outbox ของการเตือน (R7) ═══════════════════════════
type AlertEvent = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null };
const MEMBER_TAKE = 2000;
/**
 * แจ้งเตือนรายผู้รับ: เจ้าของร้าน + ผู้จัดการ/ผู้มีคีย์ hr.employee.create ที่ขอบเขตสาขาครอบสาขาของกะ (กะไม่มีสาขา = ผู้ดูแลทุกสาขาเท่านั้น) ·
 * ไม่ส่งถึงบัญชีของพนักงานคนนั้นเอง · NOT_IN + alertEmployee ⇒ ส่งข้อความของตัวเองถึงพนักงานด้วย ·
 * ล็อกการเตือน + notifiedAt ⇒ ส่งซ้ำ/พร้อมกันกี่ครั้งก็ได้แจ้งเตือนชุดเดียว
 */
export async function notifyAttendanceAlert(evt: AlertEvent): Promise<void> {
  const p = (evt?.payload ?? {}) as { alertId?: unknown; systemId?: unknown };
  const alertId = typeof p.alertId === "string" ? p.alertId : "";
  const systemId = typeof p.systemId === "string" ? p.systemId : (evt.systemId ?? "");
  if (!alertId || !systemId || !evt.tenantId) return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId };
  await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:alert:${alertId}`);
    const a = await tx.hrAttendanceAlert.findFirst({ where: { id: alertId, tenantId: ctx.tenantId, systemId }, select: { id: true, employeeId: true, rosterEntryId: true, kind: true, firedAt: true, notifiedAt: true } });
    if (!a || a.notifiedAt) return;
    const [emp, entry, pol] = await Promise.all([
      tx.hrEmployee.findFirst({ where: { id: a.employeeId, tenantId: ctx.tenantId, systemId }, select: EMP_SELECT }) as Promise<EmpRow | null>,
      tx.hrRosterEntry.findFirst({ where: { id: a.rosterEntryId, tenantId: ctx.tenantId, systemId }, select: ENTRY_SELECT }) as Promise<EntryRow | null>,
      policiesOf(tx, ctx),
    ]);
    const notes: { tenantId: string; recipientUserId: string; title: string; body: string }[] = [];
    if (emp && entry) {
      const day = dayOf(entry.date);
      const unit = entry.unitId ?? unitOfDay(emp, day);
      const w = shiftWindow(day, { startMin: entry.startMin, endMin: entry.endMin, crossesMidnight: entry.crossesMidnight });
      const members = await tx.membership.findMany({ where: { tenantId: ctx.tenantId, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true }, orderBy: { userId: "asc" }, take: MEMBER_TAKE });
      const recipients = members.filter((m) => {
        if (emp.linkedUserId && m.userId === emp.linkedUserId) return false;
        const v = { role: m.role, unitAccess: m.unitAccess, permissions: (m.permissions ?? {}) as Record<string, unknown> } as SettingsViewer;
        if (m.role !== "OWNER" && !canManageHrSettings(v)) return false;
        return covers(hrScopeOf({ role: m.role, unitAccess: m.unitAccess }), unit);
      });
      const start = hhmm(entry.startMin);
      if (a.kind === "NOT_IN") {
        const n = Math.max(0, Math.floor((a.firedAt.getTime() - w.start.getTime()) / MIN_MS));
        const body = `${emp.name} ยังไม่ลงเวลาเข้า${entry.shift.name} (เริ่ม ${start}) — เลยเวลาเริ่ม ${n} นาที`;
        for (const r of recipients) notes.push({ tenantId: ctx.tenantId, recipientUserId: r.userId, title: JUDGE_TEXT.nLate, body });
        if (pol.att.alertEmployee && emp.linkedUserId) notes.push({ tenantId: ctx.tenantId, recipientUserId: emp.linkedUserId, title: JUDGE_TEXT.nLateSelf, body: `${entry.shift.name} เริ่ม ${start} — ถ้ามาถึงแล้ว ลงเวลาที่เครื่องหน้าร้านหรือมือถือ` });
      } else {
        const body = `${emp.name} ไม่มีการลงเวลาเข้า${entry.shift.name} วันที่ ${formatThaiDate(entry.date, { long: true })} (${start}–${hhmm(entry.endMin)}) และไม่มีใบลาที่อนุมัติ`;
        for (const r of recipients) notes.push({ tenantId: ctx.tenantId, recipientUserId: r.userId, title: JUDGE_TEXT.nAbs, body });
      }
    }
    if (notes.length) await tx.appNotification.createMany({ data: notes });
    await tx.hrAttendanceAlert.updateMany({ where: { id: a.id, tenantId: ctx.tenantId, systemId, notifiedAt: null }, data: { notifiedAt: new Date() } });
  }, TX_OPTS);
}

