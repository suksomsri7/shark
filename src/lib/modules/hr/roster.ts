// HR H2.1 ▸ ตารางกะรายวัน (HrRosterEntry): สร้างจากตารางประจำสัปดาห์ · เพิ่ม/ย้าย/ลบเอง · คัดลอกสัปดาห์ · ตรวจกติกา (เตือนเท่านั้น) ·
//   เผยแพร่ → event `hr.roster.published` · ตัวอ่านของโมดูลอื่น rosterOnDay / rosterAt
//
// กติกา (brief H2.1 R1–R13 · มติ Q1–Q15 · มติธงข้อสอบ 1–9 วันที่ 22 ต.ค.):
//   • ยังไม่มีอะไรตอนรันจริง "เชื่อ" ตารางกะ — clock() / kioskRoster / ตัดสินสาย ยังใช้ HrWorkSchedule (หนี้ D1 → H2.4/H2.5)
//   • ใครเขียนได้ = OWNER หรือ hr.employee.create (Q5 — ไม่มีคีย์ใหม่) · ใครอ่านบอร์ด/คำเตือนได้ = กลุ่มเดียวกัน + บทบาท MANAGER
//   • สาขา (H1.1): ผู้ดูทุกสาขา = ทุกแถว · ผู้ดูรายสาขา = เฉพาะแถวที่ "สาขาของวันนั้น" (entry.unitId) อยู่ในขอบเขต (มติธง 5) ·
//     แถวไม่ระบุสาขา (null) = ของผู้ดูแลทุกสาขาเท่านั้น · งานแบบช่วง (สร้าง/คัดลอก/เผยแพร่) แตะเฉพาะแถวในขอบเขต — นอกขอบเขต = เงียบ (ไม่นับให้เห็น)
//   • สาขาของวัน (R3) = ยืมตัวที่ครอบวันนั้น (หลายแถว ⇒ fromDate ล่าสุด แล้ว id) ไม่งั้นสาขาประจำ — เขียนครั้งเดียวตอนสร้าง/ย้าย ไม่คำนวณใหม่ภายหลัง
//   • เวลาในแถว = สำเนาของกะตอนเขียน (snapshot) — แก้กะภายหลังไม่กระทบแถวเดิม · addEntry ระบุเวลาเองได้ (Q7)
//   • ห้ามเพิ่ม/ย้าย/ลบวันที่ผ่านมาแล้ว (Q10 — แก้ย้อนหลังใช้คำขอแก้เวลา H2.6) · สร้างจากตารางประจำไม่เขียนวันที่ผ่านมาแล้ว (มติธง 2)
//   • ช่วงวันต่อครั้ง ≤ 31 วัน (Q11) · คัดลอก = ครั้งละ 1 สัปดาห์ (จันทร์–อาทิตย์)
//   • ไม่มีชั้นร่าง (Q4): published=false = "ยังไม่ประกาศ" · แถวที่เคยประกาศ (publishedAt ไม่ว่าง) ยังให้โมดูลอื่นเห็นหลังแก้ไข
//   • ล็อก (R11 · COMMON §C.8): pg_advisory_xact_lock ต่อ (ระบบ, พนักงาน, วัน) เรียงจากน้อยไปมากเสมอ ภายใน tenantDb(ctx).$transaction ·
//     unique (employeeId, date, shiftId) เป็นด่านสุดท้ายของการชนกัน · ทุกคำสั่งใน tx ใช้ client ของ tx (HF-HR-0 5d)
//   • audit = id/จำนวนล้วน และเขียนเฉพาะเมื่อมีแถวถูกเขียนจริง ≥ 1 แถว (มติธง 6) · เขียนหลัง tx commit (ไม่ใช้ connection ที่สองระหว่างถือล็อก)
//   • ผลลัพธ์ = { ok: true, … } | { ok: false, reason } — reason เป็นข้อความไทยคงที่เสมอ (ไม่ส่ง e.message ของระบบ · ไม่มีชื่อ/id) ◂
import { randomUUID } from "node:crypto";
import { Prisma, type HrRosterSource } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { HR_OTHER_BRANCH_TEXT, HR_UNASSIGNED_TEXT, hrScopeOf, type HrScope } from "./scope";
import { canManageHrSettings, SETTINGS_TEXT, type SettingsViewer } from "./settings";
import { addDays, bkkDayKey, paidMinutes, shiftTimesProblem, shiftWindow, TimeRuleError } from "./time-rules";
import { daysBetween, ROSTER_RULE_DEFAULTS, rosterWarnings, weekdayOfDay, weekStartOf, type RosterWarning } from "./roster-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
export type RosterViewer = SettingsViewer;
export type RosterSkip = { reason: string; employeeId: string; date: string };
export type RosterFail = { ok: false; reason: string };
export type { RosterWarning } from "./roster-rules";

/** event ที่ยิงตอนเผยแพร่ (consumer ใน outbox-consumers.ts · ป้ายใน automation/labels.ts) */
export const ROSTER_PUBLISHED_EVENT = "hr.roster.published";
/** เพดานช่วงวันต่อครั้ง (Q11) */
export const ROSTER_MAX_RANGE_DAYS = 31;
/** เพดานแถวต่อการเผยแพร่ 1 ครั้ง (payload entryIds ≤ 2000 — Q13) */
const PUBLISH_MAX_ROWS = 2000;

// ── ข้อความคงที่ (ห้ามต่อชื่อ/id) ──
export const ROSTER_TEXT = {
  noPermission: "คุณไม่มีสิทธิ์จัดตารางกะ",
  ended: "พนักงานคนนี้พ้นสภาพแล้ว — จัดกะไม่ได้",
  outOfEmployment: "วันนี้อยู่นอกช่วงการจ้างของพนักงานคนนี้",
  shiftArchived: "กะนี้ปิดใช้แล้ว — เลือกกะอื่น",
  shiftNotFound: "ไม่พบกะนี้ — กรุณารีเฟรช",
  shiftOtherUnit: "กะนี้เป็นของสาขาอื่น — เลือกกะของสาขานี้หรือกะที่ใช้ทั้งร้าน",
  duplicate: "พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว",
  past: "จัดกะย้อนหลังไม่ได้ — ใช้คำขอแก้เวลาแทน",
  sameWeek: "สัปดาห์ต้นทางกับปลายทางต้องไม่ใช่สัปดาห์เดียวกัน",
  publishRace: "ตารางกะมีการแก้ไขระหว่างเผยแพร่ — กรุณากดเผยแพร่อีกครั้ง",
  employeeNotFound: "ไม่พบพนักงานคนนี้ — กรุณารีเฟรช",
  entryNotFound: "ไม่พบกะนี้ในตาราง — กรุณารีเฟรช",
  entryChanged: "กะนี้เพิ่งถูกแก้ไข — กรุณารีเฟรชแล้วลองใหม่",
  range: "เลือกช่วงวันได้ไม่เกิน 31 วัน",
  rangeOrder: "วันเริ่มต้องไม่หลังวันสิ้นสุด",
  date: "วันที่ไม่ถูกต้อง",
  note: "หมายเหตุยาวเกินไป (ไม่เกิน 200 ตัวอักษร)",
  tooMany: "รายการมากเกินไปสำหรับการเผยแพร่ครั้งเดียว — กรุณาเลือกช่วงวันให้สั้นลง",
  failed: "บันทึกตารางกะไม่สำเร็จ — กรุณาลองใหม่",
} as const;

class RosterRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterRefusal";
  }
}
const refuse = (reason: string): RosterFail => ({ ok: false, reason });

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } } | null;
  if (!x) return false;
  return x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505";
}
/** ข้อผิดพลาดใด ๆ → ข้อความไทยคงที่ */
function reasonOf(e: unknown, dupText: string = ROSTER_TEXT.duplicate): string {
  if (e instanceof RosterRefusal || e instanceof TimeRuleError) return e.message;
  if (isUniqueViolation(e)) return dupText;
  return ROSTER_TEXT.failed;
}

// ── วันที่ ──
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`); // รูปเดียวกับคอลัมน์ @db.Date
const dayOf = (d: Date) => d.toISOString().slice(0, 10); // คอลัมน์ @db.Date → "YYYY-MM-DD"
/** ตรวจ "YYYY-MM-DD" (วันจริง) — ผิด = ข้อความไทยคงที่ */
function dayKey(v: unknown): string {
  const s = v instanceof Date && Number.isFinite(v.getTime()) ? dayOf(v) : typeof v === "string" ? v.trim().slice(0, 10) : "";
  try {
    return addDays(s, 0);
  } catch {
    throw new RosterRefusal(ROSTER_TEXT.date);
  }
}
/** วันนี้ตามปฏิทินไทย (ใช้ตัดสิน "ย้อนหลัง" เท่านั้น) */
const todayKey = () => bkkDayKey(new Date());
/** ช่วงวัน [from, to] ≤ 31 วัน */
function rangeOf(input: { from?: unknown; to?: unknown } | null | undefined): { from: string; to: string } {
  const from = dayKey(input?.from);
  const to = dayKey(input?.to);
  if (from > to) throw new RosterRefusal(ROSTER_TEXT.rangeOrder);
  if (daysBetween(from, to) + 1 > ROSTER_MAX_RANGE_DAYS) throw new RosterRefusal(ROSTER_TEXT.range);
  return { from, to };
}
function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ── สิทธิ์ + สาขา ──
const scopeOfViewer = (v: RosterViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
const membershipOf = (v: RosterViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
/** เขียนตารางกะได้ไหม (Q5: OWNER หรือ hr.employee.create — MANAGER ผ่านตาม evaluate) */
const canWrite = (v: RosterViewer | null | undefined): boolean => !!v && canManageHrSettings(v);
/** อ่านบอร์ด/คำเตือนได้ไหม (R2: ผู้เขียน + บทบาท MANAGER) */
const canRead = (v: RosterViewer | null | undefined): boolean => !!v && (canWrite(v) || v.role === "MANAGER");
/**
 * สาขาของวันนั้นอยู่ในขอบเขตผู้กดไหม (null = ผ่าน) — R12 ของ H1.1: ส่ง unitId เข้า evaluate เฉพาะผู้ดูรายสาขา
 * ผู้ดูทุกสาขาไม่ส่ง unitId (core canAccessUnit รู้จักแค่ "*"/id)
 */
function dayUnitRefusal(v: RosterViewer, scope: HrScope, unitOfDay: string | null): string | null {
  if (scope.unitIds === "*") return null;
  if (unitOfDay && scope.unitIds.includes(unitOfDay) && evaluate(membershipOf(v), { module: "hr", action: "hr.employee.create", unitId: unitOfDay })) return null;
  return unitOfDay ? HR_OTHER_BRANCH_TEXT : HR_UNASSIGNED_TEXT;
}
/** อาร์กิวเมนต์ unitId (ตัวกรอง) ต้องอยู่ในขอบเขต — นอกขอบเขต = SETTINGS_TEXT.otherUnit */
function unitArg(scope: HrScope, unitId: unknown): string | null {
  const u = typeof unitId === "string" && unitId.trim() ? unitId.trim() : null;
  if (u && scope.unitIds !== "*" && !scope.unitIds.includes(u)) throw new RosterRefusal(SETTINGS_TEXT.otherUnit);
  return u;
}
/** ตัวกรองแถวตามขอบเขต (แกน = entry.unitId · มติธง 5) + ตัวกรองสาขาที่ผู้เรียกเลือก */
function entryScopeWhere(scope: HrScope, unitId: string | null): Prisma.HrRosterEntryWhereInput {
  const and: Prisma.HrRosterEntryWhereInput[] = [];
  if (scope.unitIds !== "*") and.push({ unitId: { in: scope.unitIds } });
  if (unitId) and.push({ unitId });
  return and.length ? { AND: and } : {};
}
const entryInScope = (scope: HrScope, unitId: string | null, entryUnit: string | null): boolean =>
  (scope.unitIds === "*" || (!!entryUnit && scope.unitIds.includes(entryUnit))) && (!unitId || entryUnit === unitId);

// ── พนักงาน ──
type EmpRow = {
  id: string;
  unitId: string | null;
  active: boolean;
  employmentStatus: string | null;
  linkedUserId?: string | null;
  startDate: Date | null;
  endDate: Date | null;
  contractEndAt: Date | null;
  units: { id: string; unitId: string; fromDate: Date; toDate: Date | null }[];
};
const EMP_SELECT = {
  id: true,
  unitId: true,
  active: true,
  employmentStatus: true,
  startDate: true,
  endDate: true,
  contractEndAt: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const satisfies Prisma.HrEmployeeSelect;
const isEnded = (e: EmpRow) => !e.active || e.employmentStatus === "ENDED";
/** วันนั้นอยู่ในช่วงการจ้างไหม: startDate ≤ วัน ≤ (endDate ?? contractEndAt ?? ไม่มีกำหนด) */
function inEmployment(e: EmpRow, day: string): boolean {
  if (e.startDate && day < dayOf(e.startDate)) return false;
  const last = e.endDate ?? e.contractEndAt;
  if (last && day > dayOf(last)) return false;
  return true;
}
/** R3 สาขาของวัน: ยืมตัวที่ครอบวันนั้น (fromDate ล่าสุด แล้ว id) ไม่งั้นสาขาประจำ */
export function unitOfDay(emp: Pick<EmpRow, "unitId" | "units">, day: string): string | null {
  const cover = emp.units
    .filter((b) => dayOf(b.fromDate) <= day && (!b.toDate || dayOf(b.toDate) >= day))
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return cover[0]?.unitId ?? emp.unitId ?? null;
}

// ── วันหยุด ──
type HolidayRow = { unitId: string | null; date: Date; shopOpen: boolean };
/** วันหยุดที่ใช้กับสาขานั้นในวันนั้น (แถวของสาขาชนะแถวทั้งร้าน — H1.2 Q12) */
function holidayOf(hs: HolidayRow[], unitId: string | null, day: string): HolidayRow | null {
  const sameDay = hs.filter((h) => dayOf(h.date) === day);
  return (unitId ? sameDay.find((h) => h.unitId === unitId) : undefined) ?? sameDay.find((h) => h.unitId === null) ?? null;
}

// ── ล็อก ──
type LockKey = { employeeId: string; date: string };
/** ล็อก (ระบบ, พนักงาน, วัน) เรียงจากน้อยไปมาก ในคำสั่งเดียว (unnest ตามลำดับ) — ต้องเรียกก่อนอ่านแถวใน tx */
async function lockKeys(tx: Tx, systemId: string, keys: LockKey[]): Promise<void> {
  const uniq = [...new Map(keys.map((k) => [`${k.employeeId}|${k.date}`, k])).values()].sort((a, b) =>
    a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  if (uniq.length === 0) return;
  const names = uniq.map((k) => `hr:roster:${systemId}:${k.employeeId}:${k.date}`);
  await tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtextextended(s.k, 0)))::int AS n FROM (SELECT t.k FROM unnest(${names}::text[]) WITH ORDINALITY AS t(k, i) ORDER BY t.i) s`;
}

// ── audit (id/จำนวนล้วน — ไม่มีชื่อคน/ชื่อกะ) ──
async function audit(ctx: Ctx, v: RosterViewer, action: string, targetType: string, targetId: string, after: Record<string, unknown>) {
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: v.userId ? "USER" : "SYSTEM",
    actorId: v.userId ?? null,
    action,
    targetType,
    targetId,
    after: { systemId: ctx.systemId, ...after },
  });
}

// ── แถว → รูปที่คืน ──
const ENTRY_SELECT = {
  id: true,
  employeeId: true,
  date: true,
  shiftId: true,
  unitId: true,
  startMin: true,
  endMin: true,
  breakMin: true,
  crossesMidnight: true,
  published: true,
  publishedAt: true,
  source: true,
  note: true,
} as const satisfies Prisma.HrRosterEntrySelect;
type EntryRow = Prisma.HrRosterEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

/** แถวของบอร์ด (R7 — ไม่มีชื่อ: บอร์ดเอาชื่อจาก listEmployees ตามขอบเขตเอง) */
export type RosterBoardEntry = {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  unitId: string | null;
  startMin: number;
  endMin: number;
  breakMin: number;
  crossesMidnight: boolean;
  window: { start: Date; end: Date } | null;
  paidMin: number;
  published: boolean;
  publishedAt: Date | null;
  source: HrRosterSource;
  note: string | null;
};
function boardEntry(r: EntryRow): RosterBoardEntry {
  const day = dayOf(r.date);
  const t = { startMin: r.startMin, endMin: r.endMin, crossesMidnight: r.crossesMidnight };
  let window: { start: Date; end: Date } | null = null;
  let paidMin = 0;
  try {
    window = shiftWindow(day, t);
    paidMin = paidMinutes({ ...t, breakMin: r.breakMin });
  } catch {
    /* แถวเวลาเสีย (ไม่ควรเกิด) ⇒ ไม่มีช่วงเวลา */
  }
  return {
    id: r.id,
    employeeId: r.employeeId,
    date: day,
    shiftId: r.shiftId,
    unitId: r.unitId,
    startMin: r.startMin,
    endMin: r.endMin,
    breakMin: r.breakMin,
    crossesMidnight: r.crossesMidnight,
    window,
    paidMin,
    published: r.published,
    publishedAt: r.publishedAt,
    source: r.source,
    note: r.note,
  };
}

// ── กะ ──
type ShiftRow = { id: string; unitId: string | null; startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean; active: boolean; sortOrder: number };
const SHIFT_SELECT = { id: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true, active: true, sortOrder: true } as const satisfies Prisma.HrShiftSelect;
/** กะของแถว (เพิ่ม/ย้าย): มีในระบบนี้ · ยังใช้อยู่ · เป็นกะทั้งร้านหรือของสาขาของวันนั้น */
function shiftRefusal(s: ShiftRow | null, unitOfTheDay: string | null): string | null {
  if (!s) return ROSTER_TEXT.shiftNotFound;
  if (!s.active) return ROSTER_TEXT.shiftArchived;
  if (s.unitId !== null && s.unitId !== unitOfTheDay) return ROSTER_TEXT.shiftOtherUnit;
  return null;
}
/** Q2: กะที่ตรงกับวันในตารางประจำ = เริ่ม/เลิกเท่ากันเป๊ะ · ไม่ข้ามเที่ยงคืน · ของสาขาก่อนทั้งร้าน · sortOrder น้อยสุด แล้ว id */
function templateShift(shifts: ShiftRow[], unitOfTheDay: string | null, startMin: number, endMin: number): ShiftRow | null {
  const same = shifts.filter((s) => s.active && !s.crossesMidnight && s.startMin === startMin && s.endMin === endMin);
  const pick = (xs: ShiftRow[]) => xs.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
  return (unitOfTheDay ? pick(same.filter((s) => s.unitId === unitOfTheDay)) : null) ?? pick(same.filter((s) => s.unitId === null));
}

function optNote(v: unknown): string | null {
  const s = typeof v === "string" && v.trim() ? v.trim() : null;
  if (s && s.length > 200) throw new RosterRefusal(ROSTER_TEXT.note);
  return s;
}
const optInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : null);

// ═══════════════════════════ สร้างจากตารางประจำสัปดาห์ (R4) ═══════════════════════════
export type GenerateResult = { ok: true; created: number; skipped: RosterSkip[] } | RosterFail;

export async function generateFromTemplate(ctx: Ctx, viewer: RosterViewer, input: { from: string; to: string; unitId?: string | null }): Promise<GenerateResult> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const { from, to } = rangeOf(input);
    const unitId = unitArg(scope, input?.unitId);
    const today = todayKey();
    if (to < today) return refuse(ROSTER_TEXT.past); // มติธง 2: ทั้งช่วงอยู่ในอดีต ⇒ ปฏิเสธ (ไม่เขียนอะไร)
    const db = tenantDb(ctx);
    const emps = (await db.hrEmployee.findMany({ where: { active: true }, select: EMP_SELECT, orderBy: { id: "asc" }, take: 5000 })) as EmpRow[];
    const live = emps.filter((e) => !isEnded(e));
    if (live.length === 0) return { ok: true, created: 0, skipped: [] };
    const ids = live.map((e) => e.id);
    const [templates, shifts, holidays] = await Promise.all([
      db.hrWorkSchedule.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, weekday: true, dayOff: true, startMin: true, endMin: true } }),
      db.hrShift.findMany({ where: { active: true, crossesMidnight: false }, select: SHIFT_SELECT, take: 1000 }),
      db.hrHoliday.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) } }, select: { unitId: true, date: true, shopOpen: true } }),
    ]);
    const tplOf = new Map(templates.map((t) => [`${t.employeeId}|${t.weekday}`, t]));
    const days = daysIn(from, to);
    const skipped: RosterSkip[] = [];
    let created = 0;
    for (const emp of live) {
      // วันที่จะลองสร้างของคนนี้ (ตรวจนอก tx ได้ — ไม่ขึ้นกับแถวตารางกะ)
      const cands: { day: string; unitId: string | null; shift: ShiftRow }[] = [];
      for (const day of days) {
        if (!inEmployment(emp, day)) continue; // นอกช่วงการจ้าง = ไม่มีวันทำงาน (ไม่ใช่การข้าม)
        const u = unitOfDay(emp, day);
        if (scope.unitIds !== "*" && dayUnitRefusal(viewer, scope, u)) continue; // นอกขอบเขต = เงียบ
        if (unitId && u !== unitId) continue;
        const tpl = tplOf.get(`${emp.id}|${weekdayOfDay(day)}`);
        if (!tpl || tpl.dayOff) continue; // ไม่มีตาราง / วันหยุดประจำ = ไม่มีกะ
        if (day < today) {
          skipped.push({ reason: "PAST", employeeId: emp.id, date: day });
          continue;
        }
        const h = holidayOf(holidays, u, day);
        if (h && !h.shopOpen) {
          skipped.push({ reason: "HOLIDAY", employeeId: emp.id, date: day });
          continue;
        }
        const s = templateShift(shifts, u, tpl.startMin, tpl.endMin);
        if (!s) {
          skipped.push({ reason: "NO_SHIFT", employeeId: emp.id, date: day }); // ไม่สร้างกะให้เอง (Q2)
          continue;
        }
        cands.push({ day, unitId: u, shift: s });
      }
      if (cands.length === 0) continue;
      // 1 tx ต่อพนักงาน (R11) — ล็อกทุกวันของคนนี้ก่อนอ่าน · มีแถวอยู่แล้ว (ทุกที่มา/ประกาศหรือยัง) ⇒ ข้าม EXISTS (Q8 ไม่แตะแถวเดิม)
      const out = await db.$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await lockKeys(tx, ctx.systemId, cands.map((c) => ({ employeeId: emp.id, date: c.day })));
        const have = await tx.hrRosterEntry.findMany({ where: { employeeId: emp.id, date: { in: cands.map((c) => dbDate(c.day)) } }, select: { date: true } });
        const taken = new Set(have.map((h) => dayOf(h.date)));
        const exists: string[] = [];
        let n = 0;
        for (const c of cands) {
          if (taken.has(c.day)) {
            exists.push(c.day);
            continue;
          }
          await tx.hrRosterEntry.create({
            data: {
              tenantId: ctx.tenantId,
              systemId: ctx.systemId,
              employeeId: emp.id,
              date: dbDate(c.day),
              shiftId: c.shift.id,
              unitId: c.unitId,
              startMin: c.shift.startMin,
              endMin: c.shift.endMin,
              breakMin: c.shift.breakMin,
              crossesMidnight: c.shift.crossesMidnight,
              source: "TEMPLATE",
              createdById: viewer.userId ?? null,
            },
            select: { id: true },
          });
          taken.add(c.day);
          n++;
        }
        return { n, exists };
      });
      created += out.n;
      for (const d of out.exists) skipped.push({ reason: "EXISTS", employeeId: emp.id, date: d });
    }
    if (created > 0) await audit(ctx, viewer, "hr.roster.generate", "HrRosterEntry", ctx.systemId, { unitId, from, to, created, skipped: skipped.length });
    return { ok: true, created, skipped };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ เพิ่ม / ย้าย / ลบ เอง (R5) ═══════════════════════════
export type EntryResult = { ok: true; id: string } | RosterFail;

/** ตรวจพนักงาน + วัน + ขอบเขต (ใช้ทั้งเพิ่มและย้าย) — คืนสาขาของวันนั้น */
async function employeeDayCheck(ctx: Ctx, viewer: RosterViewer, scope: HrScope, employeeId: unknown, day: string): Promise<{ emp: EmpRow; unitId: string | null }> {
  const id = typeof employeeId === "string" ? employeeId.trim() : "";
  const emp = id ? ((await tenantDb(ctx).hrEmployee.findFirst({ where: { id }, select: EMP_SELECT })) as EmpRow | null) : null;
  if (!emp) throw new RosterRefusal(ROSTER_TEXT.employeeNotFound);
  if (isEnded(emp)) throw new RosterRefusal(ROSTER_TEXT.ended);
  if (!inEmployment(emp, day)) throw new RosterRefusal(ROSTER_TEXT.outOfEmployment);
  const u = unitOfDay(emp, day);
  const r = dayUnitRefusal(viewer, scope, u);
  if (r) throw new RosterRefusal(r);
  return { emp, unitId: u };
}
async function shiftCheck(ctx: Ctx, shiftId: unknown, unitOfTheDay: string | null): Promise<ShiftRow> {
  const id = typeof shiftId === "string" ? shiftId.trim() : "";
  const s = id ? ((await tenantDb(ctx).hrShift.findFirst({ where: { id }, select: SHIFT_SELECT })) as ShiftRow | null) : null;
  const r = shiftRefusal(s, unitOfTheDay);
  if (r) throw new RosterRefusal(r);
  return s!;
}

export async function addEntry(
  ctx: Ctx,
  viewer: RosterViewer,
  input: { employeeId: string; date: string; shiftId: string; note?: string | null; startMin?: number; endMin?: number },
): Promise<EntryResult> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const day = dayKey(input?.date);
    if (day < todayKey()) return refuse(ROSTER_TEXT.past);
    const { unitId } = await employeeDayCheck(ctx, viewer, scope, input?.employeeId, day);
    const shift = await shiftCheck(ctx, input?.shiftId, unitId);
    const note = optNote(input?.note);
    // Q7: เวลาเองได้ (ไม่ส่ง = ตามกะ) · ข้ามเที่ยงคืนคิดจากเวลา · พักตามกะ
    const sIn = optInt(input?.startMin);
    const eIn = optInt(input?.endMin);
    const override = sIn !== null || eIn !== null;
    const startMin = sIn ?? shift.startMin;
    const endMin = eIn ?? shift.endMin;
    const crossesMidnight = override ? endMin < startMin : shift.crossesMidnight;
    const problem = shiftTimesProblem({ startMin, endMin, crossesMidnight });
    if (problem) return refuse(problem);
    const employeeId = String(input.employeeId).trim();
    const id = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockKeys(tx, ctx.systemId, [{ employeeId, date: day }]);
      const dup = await tx.hrRosterEntry.findFirst({ where: { employeeId, date: dbDate(day), shiftId: shift.id }, select: { id: true } });
      if (dup) throw new RosterRefusal(ROSTER_TEXT.duplicate);
      const row = await tx.hrRosterEntry.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          employeeId,
          date: dbDate(day),
          shiftId: shift.id,
          unitId,
          startMin,
          endMin,
          breakMin: shift.breakMin,
          crossesMidnight,
          source: "MANUAL",
          note,
          createdById: viewer.userId ?? null,
        },
        select: { id: true },
      });
      return row.id;
    });
    await audit(ctx, viewer, "hr.roster.entry.add", "HrRosterEntry", id, { entryId: id, employeeId, date: day, shiftId: shift.id, unitId, wasPublished: false });
    return { ok: true, id };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

/** แถวเดิม + ตรวจย้อนหลัง/ขอบเขต (ย้าย · ลบ) */
async function ownEntry(ctx: Ctx, viewer: RosterViewer, scope: HrScope, entryId: unknown): Promise<EntryRow> {
  const id = typeof entryId === "string" ? entryId.trim() : "";
  const row = id ? await tenantDb(ctx).hrRosterEntry.findFirst({ where: { id }, select: ENTRY_SELECT }) : null;
  if (!row) throw new RosterRefusal(ROSTER_TEXT.entryNotFound);
  if (dayOf(row.date) < todayKey()) throw new RosterRefusal(ROSTER_TEXT.past);
  const r = dayUnitRefusal(viewer, scope, row.unitId);
  if (r) throw new RosterRefusal(r);
  return row;
}

export async function moveEntry(ctx: Ctx, viewer: RosterViewer, entryId: string, patch: { date?: string; shiftId?: string; employeeId?: string }): Promise<EntryResult> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const row = await ownEntry(ctx, viewer, scope, entryId);
    const oldDay = dayOf(row.date);
    const day = patch?.date !== undefined ? dayKey(patch.date) : oldDay;
    if (day < todayKey()) return refuse(ROSTER_TEXT.past);
    const employeeId = typeof patch?.employeeId === "string" && patch.employeeId.trim() ? patch.employeeId.trim() : row.employeeId;
    const { unitId } = await employeeDayCheck(ctx, viewer, scope, employeeId, day);
    const shiftChanged = typeof patch?.shiftId === "string" && patch.shiftId.trim() !== "" && patch.shiftId.trim() !== row.shiftId;
    const shift = await shiftCheck(ctx, shiftChanged ? patch.shiftId : row.shiftId, unitId);
    // เวลา: เปลี่ยนกะ ⇒ สำเนาเวลาใหม่จากกะ · กะเดิม ⇒ คงเวลาเดิมของแถว (รวมเวลาที่ระบุเอง)
    const times = shiftChanged
      ? { startMin: shift.startMin, endMin: shift.endMin, breakMin: shift.breakMin, crossesMidnight: shift.crossesMidnight }
      : { startMin: row.startMin, endMin: row.endMin, breakMin: row.breakMin, crossesMidnight: row.crossesMidnight };
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockKeys(tx, ctx.systemId, [
        { employeeId: row.employeeId, date: oldDay },
        { employeeId, date: day },
      ]);
      const cur = await tx.hrRosterEntry.findFirst({ where: { id: row.id }, select: { employeeId: true, date: true } });
      if (!cur) throw new RosterRefusal(ROSTER_TEXT.entryNotFound);
      if (cur.employeeId !== row.employeeId || dayOf(cur.date) !== oldDay) throw new RosterRefusal(ROSTER_TEXT.entryChanged);
      const dup = await tx.hrRosterEntry.findFirst({ where: { employeeId, date: dbDate(day), shiftId: shift.id, id: { not: row.id } }, select: { id: true } });
      if (dup) throw new RosterRefusal(ROSTER_TEXT.duplicate);
      // แก้ในที่ (คง id ไว้ให้ลิงก์ลงเวลา/แลกกะในอนาคต) · ยังไม่ประกาศจนกว่าจะเผยแพร่ครั้งถัดไป (publishedAt คงไว้ — R7)
      const res = await tx.hrRosterEntry.updateMany({
        where: { id: row.id },
        data: { employeeId, date: dbDate(day), shiftId: shift.id, unitId, ...times, source: "MANUAL", published: false },
      });
      if (res.count !== 1) throw new RosterRefusal(ROSTER_TEXT.entryNotFound);
    });
    await audit(ctx, viewer, "hr.roster.entry.move", "HrRosterEntry", row.id, {
      entryId: row.id,
      employeeId,
      date: day,
      shiftId: shift.id,
      unitId,
      wasPublished: row.publishedAt !== null,
      fromEmployeeId: row.employeeId,
      fromDate: oldDay,
      fromShiftId: row.shiftId,
    });
    return { ok: true, id: row.id };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

export async function removeEntry(ctx: Ctx, viewer: RosterViewer, entryId: string): Promise<{ ok: true } | RosterFail> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const row = await ownEntry(ctx, viewer, scope, entryId);
    const day = dayOf(row.date);
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockKeys(tx, ctx.systemId, [{ employeeId: row.employeeId, date: day }]);
      const res = await tx.hrRosterEntry.deleteMany({ where: { id: row.id, employeeId: row.employeeId, date: row.date } });
      if (res.count !== 1) throw new RosterRefusal(ROSTER_TEXT.entryNotFound);
    });
    // wasPublished = โมดูลอื่นเคยเห็นแถวนี้ ⇒ บอร์ดนับเป็น "แก้ N จุด" จนกว่าจะเผยแพร่ครั้งถัดไป (R7)
    await audit(ctx, viewer, "hr.roster.entry.remove", "HrRosterEntry", row.id, { entryId: row.id, employeeId: row.employeeId, date: day, shiftId: row.shiftId, unitId: row.unitId, wasPublished: row.publishedAt !== null });
    return { ok: true };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ คัดลอกสัปดาห์ (R6 · Q6) ═══════════════════════════
export type CopyResult = { ok: true; created: number; skipped: RosterSkip[]; warnings: RosterWarning[] } | RosterFail;

export async function copyWeek(ctx: Ctx, viewer: RosterViewer, input: { fromWeek: string; toWeek: string; unitId?: string | null }): Promise<CopyResult> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const fromWeek = weekStartOf(dayKey(input?.fromWeek));
    const toWeek = weekStartOf(dayKey(input?.toWeek));
    if (fromWeek === toWeek) return refuse(ROSTER_TEXT.sameWeek);
    const unitId = unitArg(scope, input?.unitId);
    const today = todayKey();
    const toEnd = addDays(toWeek, 6);
    if (toEnd < today) return refuse(ROSTER_TEXT.past);
    const delta = daysBetween(fromWeek, toWeek);
    const db = tenantDb(ctx);
    const src = await db.hrRosterEntry.findMany({
      where: { date: { gte: dbDate(fromWeek), lte: dbDate(addDays(fromWeek, 6)) }, ...entryScopeWhere(scope, unitId) },
      select: ENTRY_SELECT,
      orderBy: [{ employeeId: "asc" }, { date: "asc" }, { startMin: "asc" }, { id: "asc" }],
      take: 5000,
    });
    if (src.length === 0) return { ok: true, created: 0, skipped: [], warnings: [] };
    const empIds = [...new Set(src.map((r) => r.employeeId))];
    const [emps, shifts, holidays, leaves] = await Promise.all([
      db.hrEmployee.findMany({ where: { id: { in: empIds } }, select: EMP_SELECT }) as Promise<EmpRow[]>,
      db.hrShift.findMany({ where: { id: { in: [...new Set(src.map((r) => r.shiftId))] } }, select: SHIFT_SELECT }),
      db.hrHoliday.findMany({ where: { date: { gte: dbDate(toWeek), lte: dbDate(toEnd) } }, select: { unitId: true, date: true, shopOpen: true } }),
      db.hrLeave.findMany({ where: { employeeId: { in: empIds }, status: "APPROVED", fromDate: { lte: dbDate(toEnd) }, toDate: { gte: dbDate(toWeek) } }, select: { employeeId: true, fromDate: true, toDate: true } }),
    ]);
    const empOf = new Map(emps.map((e) => [e.id, e]));
    const shiftOf = new Map(shifts.map((s) => [s.id, s as ShiftRow]));
    const onLeave = (emp: string, day: string) => leaves.some((l) => l.employeeId === emp && dayOf(l.fromDate) <= day && day <= dayOf(l.toDate));
    const skipped: RosterSkip[] = [];
    const warnings: RosterWarning[] = [];
    let created = 0;
    for (const empId of empIds) {
      const emp = empOf.get(empId);
      const mine = src.filter((r) => r.employeeId === empId);
      const cands: { row: EntryRow; day: string; unitId: string | null; shift: ShiftRow; openHoliday: boolean }[] = [];
      for (const r of mine) {
        const day = addDays(dayOf(r.date), delta);
        if (!emp || isEnded(emp)) {
          skipped.push({ reason: "ENDED", employeeId: empId, date: day });
          continue;
        }
        if (!inEmployment(emp, day)) {
          skipped.push({ reason: "OUT_OF_EMPLOYMENT", employeeId: empId, date: day });
          continue;
        }
        const u = unitOfDay(emp, day);
        if (scope.unitIds !== "*" && dayUnitRefusal(viewer, scope, u)) continue; // วันปลายทางอยู่นอกขอบเขต = เงียบ
        if (unitId && u !== unitId) continue;
        if (day < today) {
          skipped.push({ reason: "PAST", employeeId: empId, date: day });
          continue;
        }
        const h = holidayOf(holidays, u, day);
        if (h && !h.shopOpen) {
          skipped.push({ reason: "HOLIDAY", employeeId: empId, date: day });
          continue;
        }
        // มติธง 7: กะของสาขาอื่นที่ยังใช้อยู่ = คัดลอกตามเดิม · กะที่ปิดใช้แล้ว = ข้าม SHIFT_ARCHIVED
        const s = shiftOf.get(r.shiftId);
        if (!s || !s.active) {
          skipped.push({ reason: "SHIFT_ARCHIVED", employeeId: empId, date: day });
          continue;
        }
        cands.push({ row: r, day, unitId: u, shift: s, openHoliday: !!h && h.shopOpen });
      }
      if (cands.length === 0) continue;
      const made = await db.$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await lockKeys(tx, ctx.systemId, cands.map((c) => ({ employeeId: empId, date: c.day })));
        // วันปลายทางที่มีแถวอยู่ก่อนแล้ว (ก่อนคัดลอกรอบนี้) ⇒ ข้ามทั้งวัน EXISTS
        const have = await tx.hrRosterEntry.findMany({ where: { employeeId: empId, date: { in: cands.map((c) => dbDate(c.day)) } }, select: { date: true } });
        const taken = new Set(have.map((h) => dayOf(h.date)));
        const out: { id: string; day: string; openHoliday: boolean }[] = [];
        const exists: string[] = [];
        for (const c of cands) {
          if (taken.has(c.day)) {
            exists.push(c.day);
            continue;
          }
          const row = await tx.hrRosterEntry.create({
            data: {
              tenantId: ctx.tenantId,
              systemId: ctx.systemId,
              employeeId: empId,
              date: dbDate(c.day),
              shiftId: c.shift.id,
              unitId: c.unitId,
              // Q6: เวลาจากกะ "ปัจจุบัน" (ไม่ลอกเวลาเก่าของต้นทาง)
              startMin: c.shift.startMin,
              endMin: c.shift.endMin,
              breakMin: c.shift.breakMin,
              crossesMidnight: c.shift.crossesMidnight,
              source: "MANUAL",
              note: c.row.note,
              createdById: viewer.userId ?? null,
            },
            select: { id: true },
          });
          out.push({ id: row.id, day: c.day, openHoliday: c.openHoliday });
        }
        return { out, exists };
      });
      created += made.out.length;
      for (const d of made.exists) skipped.push({ reason: "EXISTS", employeeId: empId, date: d });
      for (const m of made.out) {
        if (m.openHoliday) warnings.push({ rule: "HOLIDAY_WORK", employeeId: empId, day: m.day, entryIds: [m.id] });
        if (onLeave(empId, m.day)) warnings.push({ rule: "ON_LEAVE", employeeId: empId, day: m.day, entryIds: [m.id] });
      }
    }
    if (created > 0) await audit(ctx, viewer, "hr.roster.copy", "HrRosterEntry", ctx.systemId, { unitId, fromWeek, toWeek, created, skipped: skipped.length });
    return { ok: true, created, skipped, warnings };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ ตรวจกติกา (R9 — เตือนเท่านั้น) ═══════════════════════════
/**
 * คำเตือนของช่วง [from, to] ตามขอบเขต — นับแถวของคนนั้นทุกสาขา (คนยืมตัวชั่วโมงรวมกัน) + วันก่อน/หลังช่วง + สัปดาห์เต็มที่ครอบช่วง ·
 * ไม่คืนคำเตือนของคนนอกขอบเขต · entryIds เหลือเฉพาะแถวในขอบเขต · นับทั้งแถวที่ประกาศแล้วและยังไม่ประกาศ
 */
async function warningsOf(ctx: Ctx, scope: HrScope, unitId: string | null, from: string, to: string): Promise<RosterWarning[]> {
  const db = tenantDb(ctx);
  const inRange = await db.hrRosterEntry.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) }, ...entryScopeWhere(scope, unitId) }, select: { employeeId: true }, take: 10000 });
  const empIds = [...new Set(inRange.map((r) => r.employeeId))];
  if (empIds.length === 0) return [];
  const wFrom = addDays(weekStartOf(from), -1);
  const wTo = addDays(weekStartOf(to), 7);
  const [rows, leaves, holidays] = await Promise.all([
    db.hrRosterEntry.findMany({
      where: { employeeId: { in: empIds }, date: { gte: dbDate(wFrom), lte: dbDate(wTo) } },
      select: { id: true, employeeId: true, date: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
      take: 20000,
    }),
    db.hrLeave.findMany({ where: { employeeId: { in: empIds }, status: "APPROVED", fromDate: { lte: dbDate(to) }, toDate: { gte: dbDate(from) } }, select: { employeeId: true, fromDate: true, toDate: true } }),
    db.hrHoliday.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) } }, select: { unitId: true, date: true, shopOpen: true } }),
  ]);
  const dateOf = new Map(rows.map((r) => [r.id, dayOf(r.date)]));
  const ok = new Set(rows.filter((r) => entryInScope(scope, unitId, r.unitId)).map((r) => r.id));
  const w0 = weekStartOf(from);
  const w1 = weekStartOf(to);
  const inR = (d: string | undefined) => !!d && d >= from && d <= to;
  const out: RosterWarning[] = [];
  for (const w of rosterWarnings(
    rows.map((r) => ({ id: r.id, employeeId: r.employeeId, date: dayOf(r.date), startMin: r.startMin, endMin: r.endMin, breakMin: r.breakMin, crossesMidnight: r.crossesMidnight })),
    ROSTER_RULE_DEFAULTS,
  )) {
    const relevant = w.weekStart ? w.weekStart >= w0 && w.weekStart <= w1 : w.rule === "MAX_DAY" ? inR(w.day) : w.entryIds.some((id) => inR(dateOf.get(id)));
    if (!relevant) continue;
    const ids = w.entryIds.filter((id) => ok.has(id));
    if (ids.length) out.push({ ...w, entryIds: ids });
  }
  // INFO: ทำงานวันหยุด · ลาอนุมัติแล้ว (แถวในช่วง + ในขอบเขต)
  for (const r of rows) {
    const day = dayOf(r.date);
    if (!inR(day) || !ok.has(r.id)) continue;
    if (holidayOf(holidays, r.unitId, day)) out.push({ rule: "HOLIDAY_WORK", employeeId: r.employeeId, day, entryIds: [r.id] });
    if (leaves.some((l) => l.employeeId === r.employeeId && dayOf(l.fromDate) <= day && day <= dayOf(l.toDate))) out.push({ rule: "ON_LEAVE", employeeId: r.employeeId, day, entryIds: [r.id] });
  }
  return out;
}

export async function checkRules(ctx: Ctx, viewer: RosterViewer, input: { from: string; to: string; unitId?: string | null }): Promise<{ ok: true; warnings: RosterWarning[] } | RosterFail> {
  if (!canRead(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const { from, to } = rangeOf(input);
    const unitId = unitArg(scope, input?.unitId);
    return { ok: true, warnings: await warningsOf(ctx, scope, unitId, from, to) };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ บอร์ด (R7) ═══════════════════════════
/** แถวที่ "เคยประกาศ" แล้วถูกลบหลังการเผยแพร่ครั้งล่าสุดของระบบนี้ (นับจาก audit — ไม่มีคอลัมน์ tombstone · Q4) */
async function removedSinceLastPublish(ctx: Ctx, scope: HrScope, unitId: string | null, from: string, to: string): Promise<number> {
  const db = tenantDb({ tenantId: ctx.tenantId });
  const sys = { path: ["systemId"], equals: ctx.systemId };
  const last = await db.auditLog.findFirst({ where: { action: "hr.roster.publish", after: sys }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const rows = await db.auditLog.findMany({
    where: { action: "hr.roster.entry.remove", after: sys, ...(last ? { createdAt: { gt: last.createdAt } } : {}) },
    select: { after: true },
    take: 5000,
  });
  let n = 0;
  for (const r of rows) {
    const a = (r.after ?? {}) as { wasPublished?: unknown; date?: unknown; unitId?: unknown };
    const d = typeof a.date === "string" ? a.date : "";
    if (a.wasPublished === true && d >= from && d <= to && entryInScope(scope, unitId, typeof a.unitId === "string" ? a.unitId : null)) n++;
  }
  return n;
}

export type ListRosterResult = { ok: true; entries: RosterBoardEntry[]; unpublishedCount: number; warnings: RosterWarning[] } | RosterFail;

export async function listRoster(ctx: Ctx, viewer: RosterViewer, input: { from: string; to: string; unitId?: string | null }): Promise<ListRosterResult> {
  if (!canRead(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const { from, to } = rangeOf(input);
    const unitId = unitArg(scope, input?.unitId);
    const rows = await tenantDb(ctx).hrRosterEntry.findMany({
      where: { date: { gte: dbDate(from), lte: dbDate(to) }, ...entryScopeWhere(scope, unitId) },
      select: ENTRY_SELECT,
      orderBy: [{ date: "asc" }, { employeeId: "asc" }, { startMin: "asc" }, { id: "asc" }],
      take: 5000,
    });
    const entries = rows.map(boardEntry);
    const [removed, warnings] = await Promise.all([removedSinceLastPublish(ctx, scope, unitId, from, to), warningsOf(ctx, scope, unitId, from, to)]);
    return { ok: true, entries, unpublishedCount: entries.filter((e) => !e.published).length + removed, warnings };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ เผยแพร่ (R10 — ทั้งชุดหรือไม่เลย · event 1 ตัวต่อครั้ง) ═══════════════════════════
export type PublishResult = { ok: true; published: number; eventId: string | null } | RosterFail;

export async function publishRoster(ctx: Ctx, viewer: RosterViewer, input: { from: string; to: string; unitId?: string | null }): Promise<PublishResult> {
  if (!canWrite(viewer)) return refuse(ROSTER_TEXT.noPermission);
  try {
    const scope = scopeOfViewer(viewer);
    const { from, to } = rangeOf(input);
    const unitId = unitArg(scope, input?.unitId);
    const db = tenantDb(ctx);
    const cand = await db.hrRosterEntry.findMany({
      where: { date: { gte: dbDate(from), lte: dbDate(to) }, published: false, ...entryScopeWhere(scope, unitId) },
      select: { id: true, employeeId: true, date: true },
      orderBy: { id: "asc" },
      take: PUBLISH_MAX_ROWS + 1,
    });
    if (cand.length === 0) return { ok: true, published: 0, eventId: null }; // ไม่มีอะไรใหม่ ⇒ ไม่มี event ไม่มี audit
    if (cand.length > PUBLISH_MAX_ROWS) return refuse(ROSTER_TEXT.tooMany);
    const ids = cand.map((c) => c.id);
    const employeeIds = [...new Set(cand.map((c) => c.employeeId))].sort();
    const publishId = randomUUID();
    const at = new Date();
    const idempotencyKey = `${ROSTER_PUBLISHED_EVENT}#${publishId}`;
    const eventId = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockKeys(tx, ctx.systemId, cand.map((c) => ({ employeeId: c.employeeId, date: dayOf(c.date) })));
      // ใต้ล็อก: ชุดที่ขอต้องยังครบ — แถวหาย/ถูกประกาศไปแล้ว ⇒ ย้อนทั้งหมด (มติธง 4 — ไม่เผยแพร่ n−1 เงียบ ๆ)
      const still = await tx.hrRosterEntry.count({ where: { id: { in: ids }, published: false } });
      if (still !== ids.length) throw new RosterRefusal(ROSTER_TEXT.publishRace);
      const upd = await tx.hrRosterEntry.updateMany({ where: { id: { in: ids }, published: false }, data: { published: true, publishedAt: at } });
      if (upd.count !== ids.length) throw new RosterRefusal(ROSTER_TEXT.publishRace);
      // payload = id/ช่วงวันล้วน (Q13 · COMMON §C.1) — ไม่มีชื่อ/เวลา/เงิน
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        unitId,
        type: ROSTER_PUBLISHED_EVENT,
        idempotencyKey,
        payload: { publishId, systemId: ctx.systemId, unitId, from, to, entryIds: ids, employeeIds },
      });
      const ev = await tx.outboxEvent.findFirst({ where: { idempotencyKey }, select: { id: true } });
      return ev?.id ?? publishId;
    });
    await audit(ctx, viewer, "hr.roster.publish", "HrRosterEntry", publishId, { publishId, count: ids.length, unitId, from, to });
    return { ok: true, published: ids.length, eventId };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ ตัวอ่านของโมดูลอื่น (R8 — ไม่มีผู้ดู ⇒ id + เวลาเท่านั้น) ═══════════════════════════
// ผู้เรียก: POS seam (หลังสองสายงานมาบรรจบ — Q1) · ลงเวลา v2 H2.4/H2.5 · การจองภายหลัง — 🔴 ห้ามเรียกจากหน้า/action โดยตรง
// แถวที่เห็น = เคยประกาศ (publishedAt ไม่ว่าง) · พนักงานยังทำงาน (active และไม่ ENDED) · ไม่มีใบลา APPROVED ครอบวันนั้น (ทั้งวัน — ครึ่งวัน = H2.7)
// unitId = entry.unitId ตรงกัน หรือแถวไม่ระบุสาขา (Q12) · กะดึกของวัน D อยู่ในรายการของวัน D เท่านั้น
export type RosterDayEntry = {
  systemId: string;
  employeeId: string;
  userId: string | null;
  entryId: string;
  shiftId: string;
  date: string;
  unitId: string | null;
  startMin: number;
  endMin: number;
  breakMin: number;
  crossesMidnight: boolean;
  start: Date;
  end: Date;
};
export type RosterDayResult = { hrLinked: boolean; entries: RosterDayEntry[] };

async function hrSystemsOf(tenantId: string, systemId?: string | null): Promise<string[]> {
  const sid = typeof systemId === "string" && systemId.trim() ? systemId.trim() : null;
  const rows = await tenantDb({ tenantId }).appSystem.findMany({
    where: { tenantId, type: "HR", ...(sid ? { id: sid } : {}) },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  return rows.map((r) => r.id);
}

async function dayEntries(tenantId: string, systems: string[], day: string, unitId: string | null): Promise<RosterDayEntry[]> {
  const out: RosterDayEntry[] = [];
  const d = dbDate(day);
  for (const systemId of systems) {
    const db = tenantDb({ tenantId, systemId });
    const rows = await db.hrRosterEntry.findMany({
      where: { date: d, publishedAt: { not: null }, employee: { active: true }, ...(unitId ? { OR: [{ unitId }, { unitId: null }] } : {}) },
      select: {
        id: true,
        employeeId: true,
        shiftId: true,
        unitId: true,
        startMin: true,
        endMin: true,
        breakMin: true,
        crossesMidnight: true,
        employee: { select: { linkedUserId: true, employmentStatus: true } },
      },
      take: 5000,
    });
    const live = rows.filter((r) => r.employee.employmentStatus !== "ENDED");
    if (live.length === 0) continue;
    const away = await db.hrLeave.findMany({
      where: { employeeId: { in: [...new Set(live.map((r) => r.employeeId))] }, status: "APPROVED", fromDate: { lte: d }, toDate: { gte: d } },
      select: { employeeId: true },
    });
    const awaySet = new Set(away.map((a) => a.employeeId));
    for (const r of live) {
      if (awaySet.has(r.employeeId)) continue;
      let w: { start: Date; end: Date };
      try {
        w = shiftWindow(day, { startMin: r.startMin, endMin: r.endMin, crossesMidnight: r.crossesMidnight });
      } catch {
        continue; // แถวเวลาเสีย (ไม่ควรเกิด) ⇒ ไม่ส่งต่อ
      }
      out.push({
        systemId,
        employeeId: r.employeeId,
        userId: r.employee.linkedUserId ?? null,
        entryId: r.id,
        shiftId: r.shiftId,
        date: day,
        unitId: r.unitId,
        startMin: r.startMin,
        endMin: r.endMin,
        breakMin: r.breakMin,
        crossesMidnight: r.crossesMidnight,
        start: w.start,
        end: w.end,
      });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || (a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : 0) || (a.entryId < b.entryId ? -1 : 1));
}

/** ตารางกะที่ประกาศแล้วของวัน (วันที่กะเริ่ม · เวลาไทย) ของทุกระบบ HR ในร้าน (หรือระบบที่ระบุ) */
export async function rosterOnDay(input: { tenantId: string; date: string | Date; unitId?: string | null; systemId?: string | null }): Promise<RosterDayResult> {
  const day = input?.date instanceof Date ? bkkDayKey(input.date) : addDays(String(input?.date ?? "").trim().slice(0, 10), 0);
  const systems = await hrSystemsOf(input.tenantId, input.systemId);
  if (systems.length === 0) return { hrLinked: false, entries: [] };
  const unitId = typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : null;
  return { hrLinked: true, entries: await dayEntries(input.tenantId, systems, day, unitId) };
}

/** กะ (ที่ประกาศแล้ว) ที่ครอบเวลา `at` ± toleranceMin นาที — 02:00 ของวัน D+1 เจอกะดึกที่เริ่มวัน D (D13b) */
export async function rosterAt(input: { tenantId: string; at: Date; unitId?: string | null; systemId?: string | null; toleranceMin?: number }): Promise<RosterDayResult> {
  const at = input?.at;
  const day = bkkDayKey(at); // เวลาเสีย = TimeRuleError
  const tolMin = Number.isInteger(input?.toleranceMin) && (input.toleranceMin as number) > 0 ? Math.min(input.toleranceMin as number, 720) : 0;
  const systems = await hrSystemsOf(input.tenantId, input.systemId);
  if (systems.length === 0) return { hrLinked: false, entries: [] };
  const unitId = typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : null;
  const days = [addDays(day, -1), day, ...(tolMin > 0 ? [addDays(day, 1)] : [])];
  const tol = tolMin * 60_000;
  const t = at.getTime();
  const all: RosterDayEntry[] = [];
  for (const d of days) all.push(...(await dayEntries(input.tenantId, systems, d, unitId)));
  return { hrLinked: true, entries: all.filter((e) => t >= e.start.getTime() - tol && t < e.end.getTime() + tol) };
}
// ◂ HR H2.1
