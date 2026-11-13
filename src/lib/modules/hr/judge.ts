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
import { lockHrSettings, writeHrSettingsKeys } from "./settings-lock"; // HR-SET-1 ◂
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
import { holidayOfDay } from "./holidays"; // HR H2.8 ◂
import { hourlyLeaveDays } from "./leave-rules"; // HR H2.7 ◂
import type { MembershipCtx } from "@/lib/core/rbac";
import {
  OPEN_SESSION_CAP_MIN,
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

// ═══════════════════════════ ตะเข็บใบลา (seam เดียว — ตามแบบ H2.7) ═══════════════════════════
export type JudgeLeave = { id: string; employeeId: string; from: string; to: string; status: "APPROVED" | "PENDING"; halfDay: "AM" | "PM" | null; hours: number | null; type: string; policyName: string | null };
/**
 * ใบลาที่ตัดสินผลต้องรู้ (แบบ H2.7 — hr/leave.ts · leave-rules.ts): APPROVED (มีผลต่อคำตัดสิน) + PENDING (แสดงเท่านั้น) ที่ทับช่วงวัน ·
 * REJECTED/CANCELLED (ไม่อนุมัติ · ถอน · ยกเลิกใบที่อนุมัติแล้ว) ไม่นับเลย — ถอนหลังปิดวัน ⇒ ค่าสดเปลี่ยน ⇒ แถวที่บันทึกขึ้น stale ·
 * ครึ่งวัน = halfDay AM/PM · ลาเป็นชั่วโมง = hours (1–7 · H2.7 ไม่เก็บเวลาเริ่ม/จบ)
 */
export async function leavesForJudge(db: Db, ctx: Ctx, employeeIds: string[], from: string, to: string): Promise<JudgeLeave[]> {
  if (!employeeIds.length) return [];
  const rows = await db.hrLeave.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: employeeIds }, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: dbDate(to) }, toDate: { gte: dbDate(from) } },
    select: { id: true, employeeId: true, fromDate: true, toDate: true, status: true, halfDay: true, hours: true, type: true, policy: { select: { name: true } } },
    orderBy: [{ fromDate: "asc" }, { id: "asc" }],
    take: LEAVE_TAKE,
  });
  return rows.map((r) => {
    const h = r.hours === null ? null : Number(r.hours);
    return {
      id: r.id,
      employeeId: r.employeeId,
      from: dayOf(r.fromDate),
      to: dayOf(r.toDate),
      status: r.status === "APPROVED" ? "APPROVED" : "PENDING",
      halfDay: r.halfDay === "AM" || r.halfDay === "PM" ? r.halfDay : null,
      hours: h !== null && Number.isFinite(h) && h > 0 ? h : null,
      type: r.type,
      policyName: r.policy?.name?.trim() || null,
    };
  });
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
type HolRow = Parameters<typeof holidayOfDay>[0][number];
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
      where: { ...scope, employeeId: { in: empIds }, voidedAt: null, at: { gte: new Date(dbDate(addDays(from, -1)).getTime() - 7 * 3_600_000), lt: new Date(dbDate(addDays(to, 2)).getTime() - 7 * 3_600_000) } }, // HR H2.6 ▸ ไม่นับแถวที่ถูกยกเลิก ◂
      select: { id: true, employeeId: true, kind: true, at: true, rosterEntryId: true, source: true },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: EVENT_TAKE,
    }) as Promise<EventRow[]>,
    leavesForJudge(db, ctx, empIds, from, to),
    db.hrWorkSchedule.findMany({ where: { ...scope, employeeId: { in: empIds } }, select: { employeeId: true, weekday: true, dayOff: true, startMin: true, endMin: true, graceMin: true, createdAt: true } }) as Promise<SchedRow[]>,
    // HR H2.8 ▸ แถววันหยุดทุกสาขา + ทั้งร้านของช่วงวัน (คอลัมน์เดียวกับ holidays.ts#holidayRowsInRange) · เลือกต่อวันด้วย holidays.ts#holidayOfDay ◂
    db.hrHoliday.findMany({ where: { ...scope, date: { gte: dbDate(from), lte: dbDate(to) } }, select: { id: true, unitId: true, date: true, name: true, kind: true, shopOpen: true }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 2000 }) as Promise<HolRow[]>,
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
  let openUntil = 0; // มติ r3 (2): ตาม IN ได้ถึง IN + OPEN_SESSION_CAP_MIN เท่านั้น
  for (const e of events) {
    if (!rest.has(e.id)) {
      if (e.kind === "IN") openDay = null;
      continue;
    }
    let d: string;
    if (e.kind === "IN") {
      d = bkkDayKey(e.at);
      openDay = d;
      openUntil = e.at.getTime() + OPEN_SESSION_CAP_MIN * MIN_MS;
    } else {
      if (openDay && e.at.getTime() > openUntil) openDay = null;
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
  if (!lv || lv.hours !== null) return windows.map(() => null); // ลาเป็นชั่วโมง: H2.7 ไม่มีเวลาเริ่ม/จบ ⇒ ไม่ครอบช่องใด (ตัดสินตามเวลาจริง) — บันทึกส่วนวันลาแยก
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
  const judge = (day: string, shift: JudgeShift | null, dayOff: boolean, evs: EventRow[], leave: SlotLeave | null, daySlot = false): JudgeOutput =>
    judgeEntry({ day, shift, dayOff, events: evs.map((e) => ({ kind: e.kind, at: e.at })), leave, policy: pol.att, closeGraceMin: pol.clock.closeGraceMin, now, ...(daySlot ? { openCapMin: OPEN_SESSION_CAP_MIN } : {}) });
  for (const day of days) {
    if (!employedOn(emp, day)) continue;
    const unitOf = unitOfDay(emp, day);
    const onDay = leaves.filter((l) => l.from <= day && day <= l.to);
    const approved = onDay.find((l) => l.status === "APPROVED") ?? null;
    const shown = approved ?? onDay[0] ?? null;
    const hol = holidayOfDay(data.hols, unitOf, day); // HR H2.8 ▸ แถวสาขาชนะแถวทั้งร้าน ◂
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
      list.push({ slotKey: e.id, day, entry: e, shift, shiftName: e.shift.name, dayOff: false, holidayId: hol?.id ?? null, unitId: e.unitId ?? unitOf, leave: sl ? approved : null, slotLeave: sl, leaveFraction: null, shownLeave: shown, events: evs, out: judge(day, shift, false, evs, sl) });
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
      list.push({ slotKey: "DAY", day, entry: null, shift, shiftName: shift ? SCHEDULE_NAME_TH : null, dayOff, holidayId: hol?.id ?? null, unitId: unitOf, leave: sl ? approved : null, slotLeave: sl, leaveFraction: null, shownLeave: shown, events: rest, out: judge(day, shift, dayOff, rest, sl, true) });
    } else if (rest.some((e) => e.kind === "IN")) {
      // รอบที่ไม่เข้ากะใดเลยในวันที่มีกะ — ไม่ทิ้งนาทีทำงาน: ช่อง DAY แบบไม่มีตาราง (วันหยุด = DAY_OFF)
      list.push({ slotKey: "DAY", day, entry: null, shift: null, shiftName: null, dayOff: !!hol, holidayId: hol?.id ?? null, unitId: unitOf, leave: null, slotLeave: null, leaveFraction: null, shownLeave: shown, events: rest, out: judge(day, null, !!hol, rest, null, true) });
    }
    // ส่วนวันลาเก็บครั้งเดียวต่อวัน — ช่องแรกที่ใบลาครอบจริง (มติ r3 3) · ช่องอื่นที่ครอบ 0 · ช่องที่ไม่ครอบไม่มีใบลา
    const withLeave = list.filter((x) => x.slotLeave);
    for (const [i, x] of withLeave.entries()) x.leaveFraction = i === 0 ? (x.leave!.halfDay ? "0.5" : "1.0") : "0.0";
    // HR H2.7 ▸ ลาเป็นชั่วโมง: ไม่มีเวลา ⇒ ไม่ครอบช่อง แต่บันทึกใบลา + ส่วนวัน (hourlyLeaveDays = floor(ชม./8, 0.1)) ที่ช่องแรกของวันที่เป็นกะ/ตาราง ◂
    const hourly = approved && approved.hours !== null ? (list.find((x) => x.shift) ?? null) : null;
    if (hourly && approved) {
      hourly.leave = approved;
      try {
        hourly.leaveFraction = hourlyLeaveDays(approved.hours);
      } catch {
        hourly.leaveFraction = (Math.floor((approved.hours! * 10) / 8) / 10).toFixed(1);
      }
    }
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
  leaveId: true,
  leaveFraction: true,
  version: true,
} as const;
type DayRow = { id: string; employeeId: string; date: Date; slotKey: string; unitId: string | null; status: string; lateMin: number; earlyOutMin: number; workedMin: number; breakMin: number; otMin: number; missingOut: boolean; leaveId: string | null; leaveFraction: unknown; version: number };

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
/** มติ r4 (1): ใบลา/ส่วนวันลาที่เปลี่ยนหลังปิดวัน (ถอน · อนุมัติภายหลัง · ลาชั่วโมง) ก็ทำให้แถว stale แม้สถานะไม่เปลี่ยน */
const fracOf = (v: unknown) => (v === null || v === undefined ? null : Number(v as never).toFixed(1));
const isStale = (live: LiveSlot | null, row: DayRow) =>
  !live ||
  STALE_KEYS.some((k) => (live.out as unknown as Record<string, unknown>)[k] !== (row as unknown as Record<string, unknown>)[k]) ||
  (live.leave?.id ?? null) !== row.leaveId ||
  fracOf(live.leaveFraction) !== fracOf(row.leaveFraction);

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

/** ขนาดหน้าพนักงานต่อรอบโหลด (ค่าปริยาย) — ข้อสอบส่ง pageSize เล็กเพื่อพิสูจน์การแบ่งหน้า */
const PAGE_SIZE = 200;
const ROTATE_MS = 5 * MIN_MS;

/**
 * งานตามเวลา: วัน D−7…D (D = วันไทยของ now) ทุกระบบ HR — ต่อระบบเดินพนักงานตาม id เป็นวง ทีละชุด pageSize คน (โหลดต่อชุด) ·
 * ต่อคน: เตือน → ปิดวัน · ตรวจ deadline ทุกคน (มติ r4 2) · ถูกตัด ⇒ จำ "คนถัดไป" ไว้ที่ AppSystem.settings.hrAttendanceCursor
 * (ใต้ล็อกเดียวกับค่าตั้ง hr:clockpolicy:<ระบบ> · เขียนเฉพาะตอนถูกตัด/ล้างเมื่อเดินครบวง) ⇒ รอบหน้าเริ่มที่คนนั้น ไม่ข้ามส่วนที่เหลือ ·
 * ไม่มีจุดค้าง ⇒ จุดเริ่มหมุนตามช่วง 5 นาทีของ now · ลำดับระบบหมุนแบบเดียวกัน · ถูกตัด = WARN ครั้งเดียวต่อรอบ (มติ r4 3) ·
 * ข้อมูลของชุดถึงเพดาน take ⇒ แบ่งครึ่งทำซ้ำ · ปิดใช้/พ้นสภาพ ไม่ถูกเตือน/ปิดวัน (มติ r2 E) · ไม่มีอะไรถึงเวลา = ไม่เขียนอะไรเลย ·
 * `tenantId` = จำกัดร้านเดียว · `pageSize` / `maxPages` = ตัวควบคุมของข้อสอบ (maxPages จำลองรอบที่ถูกตัด) · คืนจำนวนแถวที่เพิ่มจริง
 */
export async function runAttendanceJobs(input: { now: Date; tenantId?: string | null; deadline?: Date | null; pageSize?: number; maxPages?: number }): Promise<{ finalized: number; late: number; absent: number }> {
  const now = input?.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : nowOf(undefined);
  const deadline = input?.deadline instanceof Date ? input.deadline.getTime() : Number.POSITIVE_INFINITY;
  const pageSize = Number.isInteger(input?.pageSize) && input.pageSize! > 0 ? input.pageSize! : PAGE_SIZE;
  const maxPages = Number.isInteger(input?.maxPages) && input.maxPages! > 0 ? input.maxPages! : Number.POSITIVE_INFINITY;
  const D = bkkDayKey(now);
  const from = addDays(D, -WINDOW_DAYS);
  const days = Array.from({ length: WINDOW_DAYS + 1 }, (_, i) => addDays(from, i));
  const res = { finalized: 0, late: 0, absent: 0 };
  const rot = Math.floor(now.getTime() / ROTATE_MS);
  const st = { didWork: false, deadline };
  const systems = await hrSystems(input?.tenantId);
  const s0 = systems.length ? rot % systems.length : 0;
  const order = [...systems.slice(s0), ...systems.slice(0, s0)];
  const cut: string[] = [];
  for (const [si, ctx] of order.entries()) {
    if (st.didWork && Date.now() >= deadline) {
      cut.push(...order.slice(si).map((c) => c.systemId));
      break;
    }
    const db = dbOf(ctx);
    const ids = (
      await db.hrEmployee.findMany({
        where: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          active: true,
          AND: [{ OR: [{ employmentStatus: null }, { employmentStatus: { not: "ENDED" } }] }, { OR: [{ startDate: null }, { startDate: { lte: dbDate(D) } }] }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(from) } }] }],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      })
    ).map((r) => r.id);
    if (!ids.length) continue;
    const saved = await cursorOf(db, ctx);
    const at = saved ? ids.findIndex((x) => x >= saved) : -1;
    const start = at >= 0 ? at : saved ? 0 : (rot * pageSize) % ids.length;
    let done = 0;
    let pages = 0;
    let stopped = false;
    while (done < ids.length) {
      if (pages >= maxPages) {
        stopped = true;
        break;
      }
      const chunk = Array.from({ length: Math.min(pageSize, ids.length - done) }, (_, k) => ids[(start + done + k) % ids.length]!);
      const n = await runChunk(ctx, chunk, { now, from, D, days, res }, st);
      done += n;
      pages++;
      if (n < chunk.length) {
        stopped = true;
        break;
      }
    }
    if (stopped && done < ids.length) {
      await saveCursor(ctx, ids[(start + done) % ids.length]!);
      cut.push(ctx.systemId);
    } else if (saved) await saveCursor(ctx, null);
  }
  if (cut.length) {
    await logOps("WARN", "hr.attendance", "runAttendanceJobs: หมดเวลาของรอบ — ส่วนที่เหลือทำรอบถัดไป (เริ่มที่จุดค้าง)", { tenantId: input?.tenantId ?? undefined, detail: `systems=${cut.length} first=${cut[0]}` });
  }
  return res;
}

const CURSOR_KEY = "hrAttendanceCursor";
async function cursorOf(db: Db, ctx: Ctx): Promise<string | null> {
  const s = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  const o = s?.settings && typeof s.settings === "object" && !Array.isArray(s.settings) ? (s.settings as Record<string, unknown>) : {};
  return typeof o[CURSOR_KEY] === "string" && o[CURSOR_KEY] ? (o[CURSOR_KEY] as string) : null;
}
/** จำ/ล้างจุดค้างของตัวงาน — ล็อกเดียวกับการบันทึกค่าตั้ง (clock-settings.ts) · spread ค่าตั้งเดิม */
async function saveCursor(ctx: Ctx, next: string | null): Promise<void> {
  await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Db;
    // HR-SET-1 ▸ hr:clockpolicy → แถว AppSystem · เปลี่ยนเฉพาะคีย์ hrAttendanceCursor (null = ลบคีย์) บนค่าที่อ่านใหม่ใต้ล็อก ◂
    const sys = await lockHrSettings(tx, ctx);
    if (!sys) return;
    await writeHrSettingsKeys(tx, ctx, { [CURSOR_KEY]: next || undefined }); // HR-SET-1 ◂
  }, TX_OPTS);
}

/**
 * หนึ่งชุดพนักงาน (ตามลำดับที่ส่งมา): ต่อคน เตือน → ปิดวัน · deadline ตรวจก่อนทุกคน (รอบหนึ่งต้องทำได้อย่างน้อยหนึ่งคน) ·
 * ข้อมูลถึงเพดาน ⇒ แบ่งครึ่งทำซ้ำ (คนเดียวยังเกิน = WARN ข้ามคนนั้น) · คืนจำนวนคนที่ทำเสร็จตั้งแต่ต้นชุด
 */
async function runChunk(ctx: Ctx, ids: string[], o: { now: Date; from: string; D: string; days: string[]; res: { finalized: number; late: number; absent: number } }, st: { didWork: boolean; deadline: number }): Promise<number> {
  const { now, from, D, days, res } = o;
  const db = dbOf(ctx);
  const data = await loadData(db, ctx, ids, from, D);
  if (data.truncated) {
    if (ids.length > 1) {
      const half = Math.ceil(ids.length / 2);
      const a = await runChunk(ctx, ids.slice(0, half), o, st);
      if (a < half) return a;
      return a + (await runChunk(ctx, ids.slice(half), o, st));
    }
    await logOps("WARN", "hr.attendance", "runAttendanceJobs: ข้อมูลของพนักงานคนเดียวถึงเพดาน — ข้ามการเตือน/ปิดวันของคนนี้ในรอบนี้", { tenantId: ctx.tenantId, detail: `system=${ctx.systemId} employee=${ids[0]}` });
    return 1;
  }
  const empById = new Map((await employeesOf(db, ctx, { id: { in: ids } })).map((e) => [e.id, e]));
  const [stored, fired] = await Promise.all([
    db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, date: { gte: dbDate(from), lte: dbDate(D) } }, select: { employeeId: true, date: true, slotKey: true } }),
    db.hrAttendanceAlert.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, date: { gte: dbDate(from), lte: dbDate(D) } }, select: { employeeId: true, rosterEntryId: true, kind: true } }),
  ]);
  const have = new Set(stored.map((r) => `${r.employeeId}|${dayOf(r.date)}|${r.slotKey}`));
  const storedByDay = new Map<string, { slotKey: string }[]>();
  for (const r of stored) {
    const k = `${r.employeeId}|${dayOf(r.date)}`;
    storedByDay.set(k, [...(storedByDay.get(k) ?? []), r]);
  }
  const sent = new Set(fired.map((a) => `${a.employeeId}|${a.rosterEntryId}|${a.kind}`));
  const graceMs = data.pol.clock.closeGraceMin * MIN_MS;
  let n = 0;
  for (const id of ids) {
    if (st.didWork && Date.now() >= st.deadline) return n;
    const e = empById.get(id);
    if (e) {
      const byDay = slotsOf(e, days, data, now);
      // ── การเตือน (R7) ──
      if (data.pol.att.alertsOn) {
        for (const s of [...byDay.values()].flat()) {
          if (!s.entry || !s.shift) continue;
          if (s.events.some((x) => x.kind === "IN") || leaveSilences(s)) continue;
          const end = shiftWindow(s.day, s.shift).end.getTime();
          const t = now.getTime();
          const due: ("NOT_IN" | "ABSENT")[] = [];
          if (s.out.alertAt && s.out.alertAt.getTime() <= t && t < end) due.push("NOT_IN");
          if (s.out.absentAt && s.out.absentAt.getTime() <= t && t < end + graceMs) due.push("ABSENT");
          for (const kind of due) {
            if (sent.has(`${e.id}|${s.entry.id}|${kind}`)) continue;
            const k = await fireAlert(ctx, e, s, kind, now);
            sent.add(`${e.id}|${s.entry.id}|${kind}`);
            if (kind === "NOT_IN") res.late += k;
            else res.absent += k;
          }
        }
      }
      // ── ปิดวัน (R4) ──
      for (const [day, slots] of byDay) {
        if (hasOrphan(slots, storedByDay.get(`${e.id}|${day}`) ?? [])) continue; // มติ r2 C
        for (const s of slots) {
          if (!s.out.final || have.has(`${e.id}|${s.day}|${s.slotKey}`)) continue;
          res.finalized += await finalizeSlot(ctx, e, s.day, s.slotKey, now);
        }
      }
    }
    st.didWork = true;
    n++;
  }
  return n;
}

// ═══════════════════════════ วันที่ต้องคิดผลใหม่ (มติ r3 5) ═══════════════════════════
const NEEDS_DAYS = 35;
/**
 * วันของพนักงานที่มีแถวกำพร้า (กะของแถวถูกย้าย/ลบ/ถอนประกาศหลังปิดวัน — ตัวปิดวันข้ามวันนั้นไว้) ในช่วง 35 วันล่าสุด ·
 * เฉพาะแถวที่สาขาอยู่ในขอบเขตผู้ดู · null = ไม่ใช่ผู้อ่านตารางกะ — ใช้ทำแถบ "ต้องคิดผลใหม่" บนบอร์ด
 */
export async function attendanceNeedsRecompute(ctx: Ctx, viewer: JudgeViewer, opts: { now?: Date } = {}): Promise<{ count: number; days: { day: string; employeeId: string; name: string }[] } | null> {
  if (!canReadRoster(viewer)) return null;
  const now = nowOf(opts);
  const D = bkkDayKey(now);
  const from = addDays(D, -NEEDS_DAYS);
  const scope = scopeOfViewer(viewer);
  const db = dbOf(ctx);
  const rows = (await db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: { gte: dbDate(from), lte: dbDate(D) } }, select: { employeeId: true, date: true, slotKey: true, unitId: true }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 20_000 })).filter((r) => covers(scope, r.unitId));
  if (!rows.length) return { count: 0, days: [] };
  const empIds = [...new Set(rows.map((r) => r.employeeId))];
  const out: { day: string; employeeId: string; name: string }[] = [];
  for (let i = 0; i < empIds.length; i += PAGE_SIZE) {
    const page = empIds.slice(i, i + PAGE_SIZE);
    const emps = await employeesOf(db, ctx, { id: { in: page } });
    const data = await loadData(db, ctx, page, from, D);
    for (const e of emps) {
      const mine = rows.filter((r) => r.employeeId === e.id);
      const days = [...new Set(mine.map((r) => dayOf(r.date)))];
      const live = slotsOf(e, days, data, now);
      for (const d of days) if (hasOrphan(live.get(d) ?? [], mine.filter((r) => dayOf(r.date) === d))) out.push({ day: d, employeeId: e.id, name: e.name });
    }
  }
  out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.name.localeCompare(b.name)));
  return { count: out.length, days: out };
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
 * มติ r2 H + r3 (1): งวดเงินเดือนตรวจใน tx ใต้ล็อกงวด `hr:payroll:run:<ระบบ>:<งวด>` — คีย์เดียวกับที่ hr/payroll.ts ถือตอนสร้าง/คำนวณใหม่/ลบร่าง/กลับรายการ
 *   และ (ตั้งแต่ H2.5 r3) อนุมัติรอบ (claimApproveExpected) กับบันทึกจ่าย (markPaid) ที่ล็อกงวดก่อนล็อกแถว · ฝั่งเงินเดือนไม่ถือล็อก hr:clock/hr:roster ⇒ ไม่วนรอ
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

// ═══════════════════════════ HR H2.6 ▸ คิดผลแถวที่บันทึกใหม่ในธุรกรรมของผู้เรียก (คำขอแก้เวลาที่อนุมัติ · Q6) ═══════════════════════════
/**
 * แถว HrAttendanceDay ที่มีอยู่แล้วของพนักงานในวันที่ส่งมา (ผู้เรียกกรองเหลือวันของงวดที่ถือล็อกงวดแล้ว) คิดใหม่ "ในที่เดิม" ด้วยตัวตัดสินชุดเดียวกับ
 * recomputeAttendanceDay (loadData · slotsOf · judgedColumns · มติ r2 C แถวกำพร้า: ย้ายไปช่องสดที่ยังไม่มีแถว ไม่งั้นลบ) — version+1 ·
 * recomputedById = ผู้ตัดสิน · recomputeReason = ข้อความคงที่ · วันที่ไม่มีแถวคงไม่มีแถว (ไม่นับซ้ำ — ตัวปิดวันเขียนเองภายหลัง) · ไม่ยิง event ·
 * ลำดับล็อก (ต่อจากผู้เรียกที่ถือ hr:payroll:run → hr-corr → hr:clock แล้ว): hr:judge:<dayId> เรียง id → hr:roster:<ระบบ>:<พนักงาน>:<วัน> เรียงวัน ·
 * คืนรายการที่เปลี่ยน (ผู้เรียกเขียน audit หลัง commit) ◂
 */
export type StoredDayRecompute = { dayId: string; date: string; voided: boolean; version: number; before: Record<string, unknown>; after: Record<string, unknown> | null };
//   r2 ▸ dryRun = ไม่ถือล็อก ไม่เขียน — คืนรายการที่ "จะเปลี่ยน" (ผู้เรียกใช้ตรวจวันข้างเคียงในงวดที่จ่ายแล้ว/ไม่ได้ถือล็อก แล้วปฏิเสธทั้งธุรกรรม) ◂
export async function recomputeStoredDaysInTx(tx: Prisma.TransactionClient, ctx: Ctx, input: { employeeId: string; days: string[]; now: Date; deciderId: string | null; reason: string; dryRun?: boolean }): Promise<StoredDayRecompute[]> {
  const dry = input.dryRun === true;
  const days = [...new Set(input.days.filter(isDay))].sort();
  if (!days.length) return [];
  const where = { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: input.employeeId };
  const found = await tx.hrAttendanceDay.findMany({ where: { ...where, date: { in: days.map(dbDate) } }, select: { id: true }, orderBy: { id: "asc" } });
  if (!found.length) return [];
  if (!dry) for (const r of found) await lock(tx, `hr:judge:${r.id}`);
  if (!dry) for (const d of days) await lock(tx, `hr:roster:${ctx.systemId}:${input.employeeId}:${d}`);
  const emp = (await employeesOf(tx, ctx, { id: input.employeeId }))[0];
  if (!emp) return [];
  const data = await loadData(tx, ctx, [emp.id], days[0]!, days[days.length - 1]!);
  const live = slotsOf(emp, days, data, input.now);
  const out: StoredDayRecompute[] = [];
  for (const day of days) {
    const rows = await tx.hrAttendanceDay.findMany({ where: { ...where, date: dbDate(day) }, orderBy: [{ slotKey: "asc" }, { id: "asc" }] });
    const slots = live.get(day) ?? [];
    const taken = new Set(rows.map((r) => r.slotKey));
    for (const cur of rows) {
      const curRec = cur as unknown as Record<string, unknown>;
      const before = Object.fromEntries(SNAP_KEYS.map((k) => [k, curRec[k]]));
      let s = slots.find((x) => x.slotKey === cur.slotKey) ?? null;
      if (!s) {
        s = slots.find((x) => !taken.has(x.slotKey)) ?? null;
        if (!s) {
          if (dry) {
            out.push({ dayId: cur.id, date: day, voided: true, version: cur.version + 1, before, after: null });
            continue;
          }
          const del = await tx.hrAttendanceDay.deleteMany({ where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: cur.version } });
          if (del.count === 1) out.push({ dayId: cur.id, date: day, voided: true, version: cur.version + 1, before, after: null });
          continue;
        }
        taken.add(s.slotKey);
      }
      const next = { slotKey: s.slotKey, ...judgedColumns(s) };
      const nextRec = next as unknown as Record<string, unknown>;
      if (next.slotKey === cur.slotKey && CMP_KEYS.every((k) => cmpVal(curRec[k]) === cmpVal(nextRec[k]))) continue;
      if (dry) {
        out.push({ dayId: cur.id, date: day, voided: false, version: cur.version + 1, before, after: Object.fromEntries(SNAP_KEYS.map((k) => [k, nextRec[k]])) });
        continue;
      }
      const upd = await tx.hrAttendanceDay.updateMany({
        where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId, version: cur.version },
        data: { ...next, version: cur.version + 1, judgedAt: input.now, recomputedAt: input.now, recomputedById: input.deciderId, recomputeReason: input.reason },
      });
      if (upd.count === 1) out.push({ dayId: cur.id, date: day, voided: false, version: cur.version + 1, before, after: Object.fromEntries(SNAP_KEYS.map((k) => [k, nextRec[k]])) });
    }
  }
  return out;
}
// ◂ HR H2.6

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

// HR H3.1 ▸ ตัวอ่านของชั่วโมงทำงาน (work entries) — อ่านผ่าน tx ที่ผู้เรียกถือล็อกงวดอยู่แล้ว · แถวที่บันทึก (HrAttendanceDay) เป็นที่มาของนาที ·
//   stale/orphan = isStale/hasOrphan ตัวเดียวกับบอร์ด (ไม่มีกติกาซ้ำ) · ช่องสดที่ยังไม่บันทึก = {final} เท่านั้น (นาทีไม่นับ) ·
//   มติ A4 (ผู้คุม): OT ดิบ = คำตัดสินชุดเดียวกันที่ขั้นปัด 1 นาที — ใช้เฉพาะเมื่อแถวไม่ stale (ปัดเป็นขั้นแล้วเท่ากับค่าที่บันทึกพอดี) ·
//   แถว stale ใช้ otMin ที่บันทึก (วันนั้นถูกบล็อกด้วย STALE อยู่แล้ว) · truncated = ข้อมูลถึงเพดาน take
export type WorkEntryReadSlot = {
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
  otMin: number;
  missingOut: boolean;
  leaveId: string | null;
  leaveFraction: string | null;
  rosterEntryId: string | null;
};
export type WorkEntryReadDay = { employeeId: string; day: string; unitId: string | null; holiday: { id: string } | null; slots: WorkEntryReadSlot[]; leaves: JudgeLeave[] };
export type WorkEntryReadEmployee = { id: string; unitId: string | null; startDate: string | null; endDate: string | null };
export async function workEntryDaysInTx(
  tx: Db,
  ctx: Ctx,
  employeeIds: string[],
  from: string,
  to: string,
  now: Date,
): Promise<{ employees: WorkEntryReadEmployee[]; days: WorkEntryReadDay[]; truncated: boolean }> {
  const ids = [...new Set(employeeIds)].sort();
  if (!ids.length) return { employees: [], days: [], truncated: false };
  const emps = await employeesOf(tx, ctx, { id: { in: ids } });
  const data = await loadData(tx, ctx, ids, from, to);
  const raw: Data = { ...data, pol: { ...data.pol, att: { ...data.pol.att, otStepMin: 1 } } };
  const rows = await tx.hrAttendanceDay.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, date: { gte: dbDate(from), lte: dbDate(to) } },
    select: { ...DAY_SELECT, rosterEntryId: true, startMin: true, endMin: true, crossesMidnight: true },
    orderBy: [{ employeeId: "asc" }, { date: "asc" }, { slotKey: "asc" }],
    take: ENTRY_TAKE,
  });
  const entryIds = [...new Set(rows.map((r) => r.rosterEntryId).filter((x): x is string => !!x))];
  const breaks = new Map(
    (entryIds.length ? await tx.hrRosterEntry.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: entryIds } }, select: { id: true, breakMin: true } }) : []).map((e) => [e.id, e.breakMin]),
  );
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const out: WorkEntryReadDay[] = [];
  for (const e of emps) {
    const live = slotsOf(e, days, data, now);
    const live1 = slotsOf(e, days, raw, now);
    const mine = rows.filter((r) => r.employeeId === e.id) as (DayRow & { rosterEntryId: string | null; startMin: number | null; endMin: number | null; crossesMidnight: boolean | null })[];
    for (const day of days) {
      if (!employedOn(e, day)) continue;
      const ls = live.get(day) ?? [];
      const rs = mine.filter((r) => dayOf(r.date) === day);
      const orphanDay = hasOrphan(ls, rs);
      const slots: WorkEntryReadSlot[] = rs.map((r) => {
        const l = ls.find((x) => x.slotKey === r.slotKey) ?? null;
        const stale = isStale(l, r);
        const l1 = (live1.get(day) ?? []).find((x) => x.slotKey === r.slotKey) ?? null;
        return {
          dayId: r.id,
          version: r.version,
          slotKey: r.slotKey,
          stored: true,
          final: true,
          stale,
          orphan: !l,
          status: r.status,
          startMin: r.startMin,
          endMin: r.endMin,
          crossesMidnight: r.crossesMidnight,
          plannedBreakMin: r.rosterEntryId ? (breaks.get(r.rosterEntryId) ?? 0) : 0,
          workedMin: r.workedMin,
          breakMin: r.breakMin,
          lateMin: r.lateMin,
          earlyOutMin: r.earlyOutMin,
          otMin: !stale && l1 ? l1.out.otMin : r.otMin,
          missingOut: r.missingOut,
          leaveId: r.leaveId,
          leaveFraction: fracOf(r.leaveFraction),
          rosterEntryId: r.rosterEntryId,
        };
      });
      // มติ r2 C: วันที่มีแถวกำพร้า แสดง/นับเฉพาะแถวที่บันทึก (ช่องสดอื่นไม่นับจนกว่าจะคิดผลใหม่)
      if (!orphanDay) {
        for (const s of ls) {
          if (rs.some((r) => r.slotKey === s.slotKey)) continue;
          slots.push({
            dayId: null,
            version: 0,
            slotKey: s.slotKey,
            stored: false,
            final: s.out.final,
            stale: false,
            orphan: false,
            status: s.out.status,
            startMin: s.shift?.startMin ?? null,
            endMin: s.shift?.endMin ?? null,
            crossesMidnight: s.shift ? s.shift.crossesMidnight : null,
            plannedBreakMin: 0,
            workedMin: 0,
            breakMin: 0,
            lateMin: 0,
            earlyOutMin: 0,
            otMin: 0,
            missingOut: false,
            leaveId: null,
            leaveFraction: null,
            rosterEntryId: s.entry?.id ?? null,
          });
        }
      }
      const unitId = unitOfDay(e, day);
      const hol = holidayOfDay(data.hols, unitId, day);
      out.push({ employeeId: e.id, day, unitId, holiday: hol ? { id: hol.id } : null, slots, leaves: data.leaves.filter((l) => l.employeeId === e.id && l.from <= day && day <= l.to) });
    }
  }
  return {
    employees: emps.map((e) => ({ id: e.id, unitId: e.unitId ?? null, startDate: e.startDate ? dayOf(e.startDate) : null, endDate: e.endDate ? dayOf(e.endDate) : null })),
    days: out,
    truncated: data.truncated || rows.length >= ENTRY_TAKE,
  };
}
/**
 * HR H3.1 r4 ▸ ปิดผลวันที่ค้าง (เก่ากว่าหน้าต่าง 7 วันของงานตามเวลา) ของพนักงานชุดหนึ่งในช่วงวัน — ใช้ตัวปิดวันตัวเดียวกับงานตามเวลา (finalizeSlot:
 *   ล็อก hr:clock → hr:roster · ON CONFLICT DO NOTHING · ข้ามวันที่มีแถวกำพร้า) · ไม่มีกติกาตัดสินชุดที่สอง · ข้อมูลถึงเพดาน = ข้ามชุดนั้น (truncated) ·
 *   ผู้เรียกต้องไม่ถือล็อกงวดอยู่ (ตัวปิดวันเปิดธุรกรรมของตัวเอง) · คืนจำนวนแถวที่เพิ่ม
 */
export async function finalizeStoredGaps(ctx: Ctx, employeeIds: string[], from: string, to: string, now: Date): Promise<{ finalized: number; truncated: boolean }> {
  const db = dbOf(ctx);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const ids = [...new Set(employeeIds)].sort();
  let finalized = 0;
  let truncated = false;
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const page = ids.slice(i, i + PAGE_SIZE);
    const data = await loadData(db, ctx, page, from, to);
    if (data.truncated) {
      truncated = true;
      continue;
    }
    const emps = await employeesOf(db, ctx, { id: { in: page } });
    const stored = await db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: page }, date: { gte: dbDate(from), lte: dbDate(to) } }, select: { employeeId: true, date: true, slotKey: true } });
    const byDay = new Map<string, { slotKey: string }[]>();
    for (const r of stored) {
      const k = `${r.employeeId}|${dayOf(r.date)}`;
      byDay.set(k, [...(byDay.get(k) ?? []), r]);
    }
    for (const e of emps) {
      for (const [day, slots] of slotsOf(e, days, data, now)) {
        const have = byDay.get(`${e.id}|${day}`) ?? [];
        if (hasOrphan(slots, have)) continue;
        for (const s of slots) if (s.out.final && !have.some((h) => h.slotKey === s.slotKey)) finalized += await finalizeSlot(ctx, e, day, s.slotKey, now);
      }
    }
  }
  return { finalized, truncated };
}
/** HR H3.1 r2 ▸ แถวลงเวลาที่ยังมีผล (ตัวกรองเดียวกับ loadData — แถวที่ถูกยกเลิกไม่นับ) สำหรับ inputHash ของชั่วโมงทำงาน · อ่านเป็นหน้า ๆ ตาม id */
export async function workEntryPunchesInTx(tx: Db, ctx: Ctx, employeeIds: string[], from: Date, to: Date, after: string | null, take: number) {
  return tx.hrAttendance.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: employeeIds }, voidedAt: null, at: { gte: from, lt: to } },
    select: { id: true, employeeId: true, kind: true, at: true, rosterEntryId: true },
    orderBy: { id: "asc" },
    take,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });
}
// ◂ HR H3.1
// HR H2.9 ▸ ตัวอ่านของการจ่าย OT (hr/ot.ts#settle) — แถว HrAttendanceDay ที่บันทึกของวันที่ส่งมา + stale/กำพร้า (กติกาเดียวกับหน้าจอ: isStale · hasOrphan) +
//   ช่องสดที่ยังไม่บันทึก · ผู้เรียกถือล็อกงวด hr:payroll:run:<ระบบ>:<งวด> แล้ว hr:judge:<dayId> ของทุกแถวก่อนเรียก และส่ง tx ของตัวเอง (ทุกคำสั่งใช้ tx นี้) ·
//   from = เวลาเลิกกะของแถว (มีกะ) หรือเวลาเข้า (ไม่มีกะ) · outAt = เวลาออกของแถว (outMissing = แถวชี้เวลาออกที่ถูกลบไปแล้ว) · ไม่แก้แถวใด ไม่ยิง event
//   r2: worked = ช่วงที่ทำงานจริงของช่อง (IN เริ่ม · BREAK_START หยุด · BREAK_END นับต่อ · OUT จบ — สูตรเดียวกับ judge-rules.workedMinutesFloor ไม่ปัด) ·
//   ลืมออก/ไม่มีช่องสด = [] · leaveFull = แถวสถานะ LEAVE (ลาเต็มวันที่อนุมัติ)
export type OtPayStoredRow = { id: string; day: string; slotKey: string; status: string; otMin: number; version: number; hasShift: boolean; holidayId: string | null; unitId: string | null; from: Date | null; outAt: Date | null; outMissing: boolean; stale: boolean; worked: { start: Date; end: Date }[]; leaveFull: boolean };
function workedIntervals(events: readonly { kind: string; at: Date }[]): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  let from: number | null = null;
  let inSession = false;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const t = e.at.getTime();
    if (e.kind === "IN") {
      inSession = true;
      from = t;
    } else if (e.kind === "BREAK_START") {
      if (from !== null && t > from) out.push({ start: new Date(from), end: new Date(t) });
      from = null;
    } else if (e.kind === "BREAK_END") {
      if (inSession) from = t;
    } else if (e.kind === "OUT") {
      if (from !== null && t > from) out.push({ start: new Date(from), end: new Date(t) });
      from = null;
      inSession = false;
    }
  }
  return out;
}
export type OtPayDays = { rows: OtPayStoredRow[]; pending: { day: string; slotKey: string; final: boolean }[] };
export async function otPayDaysInTx(tx: Db, ctx: Ctx, employeeId: string, days: string[], now: Date): Promise<OtPayDays> {
  const emp = (await employeesOf(tx, ctx, { id: employeeId }))[0];
  const want = [...new Set(days.filter(isDay))].sort();
  if (!emp || !want.length) return { rows: [], pending: [] };
  const data = await loadData(tx, ctx, [emp.id], want[0]!, want[want.length - 1]!);
  const live = slotsOf(emp, want, data, now);
  const stored = (await tx.hrAttendanceDay.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, date: { in: want.map(dbDate) } },
    select: { ...DAY_SELECT, startMin: true, endMin: true, crossesMidnight: true, holidayId: true, inAttendanceId: true, outAttendanceId: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })) as (DayRow & { startMin: number | null; endMin: number | null; crossesMidnight: boolean | null; holidayId: string | null; inAttendanceId: string | null; outAttendanceId: string | null })[];
  // r3.2: เวลาเข้า/ออกของแถวมาจาก loadData ตัวเดียวกับคำตัดสิน (ตัวกรองการลงเวลาที่ถูกยกเลิกของ H2.6 มาถึงที่นี่เอง) — ไม่ query การลงเวลาเอง
  const evAt = new Map(data.events.map((e) => [e.id, e.at] as const));
  const rows: OtPayStoredRow[] = stored.map((r) => {
    const day = dayOf(r.date);
    const liveDay = live.get(day) ?? [];
    const slot = liveDay.find((x) => x.slotKey === r.slotKey) ?? null;
    const orphan = hasOrphan(liveDay, stored.filter((x) => dayOf(x.date) === day));
    const hasShift = r.startMin !== null && r.endMin !== null;
    let from: Date | null = r.inAttendanceId ? (evAt.get(r.inAttendanceId) ?? null) : null;
    if (hasShift) {
      try {
        from = shiftWindow(day, { startMin: r.startMin!, endMin: r.endMin!, crossesMidnight: !!r.crossesMidnight }).end;
      } catch {
        from = null;
      }
    }
    const outMissing = !!r.outAttendanceId && !evAt.has(r.outAttendanceId);
    const worked = slot && !r.missingOut ? workedIntervals(slot.events) : [];
    return { id: r.id, day, slotKey: r.slotKey, status: r.status, otMin: r.otMin, version: r.version, hasShift, holidayId: r.holidayId, unitId: r.unitId, from, outAt: r.outAttendanceId ? (evAt.get(r.outAttendanceId) ?? null) : null, outMissing, stale: orphan || isStale(slot, r), worked, leaveFull: r.status === "LEAVE" };
  });
  const pending = want.flatMap((day) => (live.get(day) ?? []).filter((s) => !stored.some((r) => dayOf(r.date) === day && r.slotKey === s.slotKey)).map((s) => ({ day, slotKey: s.slotKey, final: s.out.final })));
  return { rows, pending };
}
/** r4: เวลาเข้า/ออกของแถว HrAttendanceDay ที่บันทึกแล้ว (พนักงานชุดหนึ่ง · ช่วงวัน) ผ่าน loadData ตัวเดียวกับคำตัดสิน (กรองการลงเวลาที่ยกเลิกแล้ว — H2.6) ·
 *  ผู้เรียก: hr/ot.ts#settleOtRequests (เลือกคำขอ 0 บาทที่ต้องคิดใหม่ — ไม่ใช่การจ่าย) · hr/ot.ts ไม่อ่านตารางการลงเวลาเอง */
export async function otDaySpans(ctx: Ctx, employeeIds: string[], from: string, to: string): Promise<{ employeeId: string; day: string; inAt: Date | null; outAt: Date | null }[]> {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (!ids.length || !isDay(from) || !isDay(to) || from > to) return [];
  const db = dbOf(ctx);
  const rows = await db.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, date: { gte: dbDate(from), lte: dbDate(to) } }, select: { employeeId: true, date: true, inAttendanceId: true, outAttendanceId: true }, take: 20_000 });
  if (!rows.length) return [];
  const data = await loadData(db, ctx, [...new Set(rows.map((r) => r.employeeId))], from, to);
  const at = new Map(data.events.map((e) => [e.id, e.at] as const));
  return rows.map((r) => ({ employeeId: r.employeeId, day: dayOf(r.date), inAt: r.inAttendanceId ? (at.get(r.inAttendanceId) ?? null) : null, outAt: r.outAttendanceId ? (at.get(r.outAttendanceId) ?? null) : null }));
}
// ◂ HR H2.9
// HR H3.4 ▸ (รีวิว H3.2 minor) พนักงานที่มีแถวลงเวลาที่ยังมีผลในช่วงเวลา — distinct ตาม employeeId (ไม่โหลดแถวลงเวลาเต็ม · ไม่มีเพดาน TAKE ที่ตัดคนท้าย ๆ ทิ้ง) ·
//   ผู้อ่าน: work-entries.ts#workEntrySourceEmployeesInTx (ด่านอนุมัติรอบของ H3.2) · อ่านอย่างเดียว · ตารางลงเวลาอ่านผ่าน judge.ts ตามเดิม
export async function workEntryPunchEmployeesInTx(tx: Db, ctx: Ctx, employeeIds: string[], from: Date, to: Date): Promise<string[]> {
  if (!employeeIds.length) return [];
  const rows = await tx.hrAttendance.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: employeeIds }, voidedAt: null, at: { gte: from, lt: to } },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return rows.map((r) => r.employeeId);
}
// ◂ HR H3.4
