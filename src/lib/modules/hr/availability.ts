// HR H4.1 ▸ ตารางกะ → เวลาจองของพนักงาน (X-HR.1 ตัวจริงหลัง seam SVC B.1) · คำใบ้หาคนแทนเมื่อมีใบลา · แจ้งครั้งเดียวต่อใบลาที่อนุมัติ
//
// staffWindows(StaffWindowsInput) → StaffWindowsRow[] (ลายเซ็นของ SVC B.1 — 🔴 ห้ามเปลี่ยน · hr/index.ts re-export ล้วน)
//   R6 แถวต่อพนักงานที่ส่งมา (ลำดับเดิม · ตัดซ้ำ) ที่เป็นพนักงานของร้านนี้ในระบบ HR ที่ active:
//      "จัดกะด้วยตาราง" = มีแถวประกาศแล้วในสัปดาห์ (จ.–อา. ไทย) ของวันนั้น หรือกะดึกที่เริ่ม D−1 ⇒ { employeeId, windows, breaks: [] } ·
//      หรือเป็นผู้ยกกะในสัปดาห์นั้นที่อนุมัติแล้ว (H2.3) · ไม่ใช่ ⇒ ไม่มีแถว (booking ใช้แหล่งถัดไปเหมือนเดิม) · R7 ENDED / active=false / นอกช่วงจ้าง ⇒ windows [] เสมอ
//   R8 ร้านอื่น · ไม่รู้จัก · ระบบปิด · วันเสีย · ไม่มี id ⇒ ไม่มีแถว (ไม่มี id = ไม่แตะฐาน) · ประกาศแล้ว = publishedAt ≠ null (Q3) · อ่านอย่างเดียว
//   หน้าต่างคิดด้วย availability-rules.ts#dayWindows (ล้วน) · breaks [] (Q4 — ตารางเก็บแค่จำนวนนาทีพัก)
//   r2: แถวตารางกะที่ไม่ระบุสาขา = สาขาของวันนั้นของพนักงาน (ยืมตัว/สาขาประจำ) — ไม่เปิดเวลาทุกสาขาพร้อมกัน (กันจองซ้อนข้ามสาขา) ·
//   ชนเพดานการอ่าน ⇒ ทุกแถว windows [] (ปิดไว้ก่อน ไม่จองซ้อน)
// leaveDutyHints / leaveDutyHintsMany(ctx, viewer, …) R9/R11 — กะของคนลาในช่วงใบลา (PENDING/APPROVED) + คนที่อยู่กะเดียวกัน + คนที่ว่างมาแทน ·
//   r2 ขอบเขต = สาขาของ "กะ" (สาขาของวันนั้น) ไม่ใช่สาขาประจำ: ผู้ดูเห็นเฉพาะกะ/คนแทนในสาขาที่ตัวเองดูแล ·
//   หลายใบในหน้าเดียว = อ่านครั้งเดียว (จำนวนคำสั่งคงที่ ไม่โตตามจำนวนใบ) · ชนเพดาน ⇒ `incomplete: true` (ไม่บอกว่า "ไม่ต้องหาคนแทน" ผิด ๆ) ·
//   ผู้ไม่มีสิทธิ์/ไม่พบ/ร้านอื่น = ข้อความเดียวกันทุกไบต์ · ไม่มีเหตุผล/ประเภทการลา
// leaveDutyNotify({ tenantId, systemId, leaveId }) R10 — ผู้บริโภค hr.leave.decided (APPROVED) เรียก · คำนวณนอกล็อก แล้วธุรกรรมสั้นใต้ล็อก hr-leave-hint:<id>
//   (ตรวจสถานะ + audit กันซ้ำ + เขียน) · ผู้รับ = ผู้ดูที่ขอบเขตครอบสาขาของกะที่ขาดคน (ยกเว้นคนลา) · audit hr.leave.duty_hint = กุญแจกันซ้ำ
//   (ส่งซ้ำ/พร้อมกัน/ถอนอนุมัติภายหลัง = ไม่เขียนเพิ่ม · ไม่ถอนข้อความ Q10)
// 🔴 ไม่ยกเลิก/ไม่ย้ายนัดจองใด ๆ (R13) · ไม่ import โมดูลอื่น · เขียนได้แค่ appNotification + auditLog (createMany ใน tx เดียว)
// ◂ HR H4.1
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { dayWindows, isValidDay, prevDayOf, type AvailabilityLeave } from "./availability-rules";
import { addDays, paidMinutes } from "./time-rules";
import { weekStartOf } from "./roster-rules";
import { hrScopeOf, type HrScope } from "./scope";

type Ctx = { tenantId: string; systemId: string };
// ตัวอ่านที่ใช้ร่วมกันระหว่าง tenantDb(ctx) กับ tx ของมัน (เฉพาะ delegate ที่ใช้)
type Db = Pick<ReturnType<typeof tenantDb>, "hrRosterEntry" | "hrEmployee" | "hrLeave">;

// SVC B.1 — field lists byte-identical (re-export จาก hr/index.ts)
export type StaffWindowsInput = { tenantId: string; unitId: string; date: string; employeeIds: string[] };
export type StaffWindowsRow = {
  employeeId: string;
  windows: { startMin: number; endMin: number }[];
  breaks: { startMin: number; endMin: number }[];
};

/** ข้อความคงที่ (ห้ามต่อชื่อ/id/ประเภทการลา) */
export const DUTY_HINT_TEXT = {
  hintNo: "ไม่พบใบลานี้ หรือคุณไม่มีสิทธิ์ดูผลกระทบต่อกะ",
  notifyTitle: "มีกะที่ต้องหาคนแทน",
  notifyBody: "ใบลาที่อนุมัติแล้วทำให้กะ {n} กะยังไม่มีคนแทน — เปิดหน้าการลาเพื่อดูคนที่ว่าง",
} as const;
export const DUTY_HINT_AUDIT = "hr.leave.duty_hint";

const DAY_MS = 86_400_000;
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`); // รูปเดียวกับคอลัมน์ @db.Date
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const dayIndex = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type EmpLife = { active: boolean; employmentStatus: string | null; startDate: Date | null; endDate: Date | null; contractEndAt: Date | null };
const isEnded = (e: EmpLife) => !e.active || e.employmentStatus === "ENDED";
/** วันนั้นอยู่ในช่วงการจ้าง: startDate ≤ วัน ≤ (endDate ?? contractEndAt ?? ไม่มีกำหนด) — สูตรเดียวกับ roster.ts */
function inEmployment(e: EmpLife, day: string): boolean {
  if (e.startDate && day < dayOf(e.startDate)) return false;
  const last = e.endDate ?? e.contractEndAt;
  return !(last && day > dayOf(last));
}
const leaveRule = (l: { fromDate: Date; toDate: Date; status: string; halfDay: string | null; hours: unknown }): AvailabilityLeave => ({
  fromDate: dayOf(l.fromDate),
  toDate: dayOf(l.toDate),
  status: l.status,
  halfDay: l.halfDay,
  hours: l.hours === null || l.hours === undefined ? null : String(l.hours),
});
/** ใบลาครึ่งวัน = AM/PM ที่ไม่มีชั่วโมง · อื่น ๆ (เต็มวัน · ชั่วโมง Q5) = ทั้งวัน */
const isWholeDay = (l: { halfDay: string | null; hours: unknown }) => !(l.hours === null && (l.halfDay === "AM" || l.halfDay === "PM"));
const covers = (l: { fromDate: Date; toDate: Date }, day: string) => dayOf(l.fromDate) <= day && day <= dayOf(l.toDate);

// ═══════════════════════════ staffWindows (R6–R8) ═══════════════════════════
/** เพดานการอ่าน (เกิน = ผลไม่ครบ — ตัวเรียกปิดไว้ก่อน/บอกว่าไม่ครบ) */
const CAP = { entries: 20_000, leaves: 20_000, swaps: 5000, own: 2000, emps: 5000, members: 2000, ids: 200 } as const;
type UnitRow = { id: string; unitId: string; fromDate: Date; toDate: Date | null };
const UNITS_SELECT = { select: { id: true, unitId: true, fromDate: true, toDate: true }, orderBy: { id: "asc" }, take: 200 } as const;

/** R3 ของ H2.1: สาขาของวัน = ยืมตัวที่ครอบวันนั้น (fromDate ล่าสุด แล้ว id) ไม่งั้นสาขาประจำ (สูตรเดียวกับ roster.ts#unitOfDay) */
function unitOfDayOf(emp: { unitId: string | null; units: UnitRow[] }, day: string): string | null {
  const cover = emp.units
    .filter((b) => dayOf(b.fromDate) <= day && (!b.toDate || dayOf(b.toDate) >= day))
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime() || byCode(b.id, a.id));
  return cover[0]?.unitId ?? emp.unitId ?? null;
}
function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const cur = m.get(k);
    if (cur) cur.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export async function staffWindows(i: StaffWindowsInput): Promise<StaffWindowsRow[]> {
  const tenantId = typeof i?.tenantId === "string" ? i.tenantId : "";
  const unitId = typeof i?.unitId === "string" ? i.unitId.trim() : "";
  const day = typeof i?.date === "string" ? i.date.trim() : "";
  const ids = [...new Set((Array.isArray(i?.employeeIds) ? i.employeeIds : []).filter((x): x is string => typeof x === "string" && x !== ""))];
  if (!tenantId || !unitId || !isValidDay(day) || ids.length === 0) return [];
  const prev = prevDayOf(day) as string;
  const week0 = weekStartOf(day);
  const week6 = addDays(week0, 6);
  const from = prev < week0 ? prev : week0;
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR", active: true }, orderBy: { id: "asc" }, select: { id: true }, take: 50 });
  const rows = new Map<string, StaffWindowsRow>();
  for (const { id: systemId } of systems) {
    const db = tenantDb({ tenantId, systemId });
    const emps = await db.hrEmployee.findMany({
      where: { tenantId, systemId, id: { in: ids } },
      orderBy: { id: "asc" },
      select: { id: true, unitId: true, active: true, employmentStatus: true, startDate: true, endDate: true, contractEndAt: true, units: UNITS_SELECT },
    });
    if (emps.length === 0) continue;
    const empIds = emps.map((e) => e.id);
    const [entries, leaves, gaveAway] = await Promise.all([
      db.hrRosterEntry.findMany({
        where: { tenantId, systemId, employeeId: { in: empIds }, publishedAt: { not: null }, date: { gte: dbDate(from), lte: dbDate(week6) } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: { employeeId: true, date: true, unitId: true, startMin: true, endMin: true, crossesMidnight: true },
        take: CAP.entries + 1,
      }),
      db.hrLeave.findMany({
        where: { tenantId, systemId, employeeId: { in: empIds }, status: "APPROVED", fromDate: { lte: dbDate(day) }, toDate: { gte: dbDate(prev) } },
        orderBy: { id: "asc" },
        select: { employeeId: true, fromDate: true, toDate: true, status: true, halfDay: true, hours: true },
        take: CAP.leaves + 1,
      }),
      // ยกกะให้คนอื่นแล้ว (H2.3 อนุมัติ) = ยังจัดกะด้วยตารางในสัปดาห์นั้น — วันนั้นว่างเพราะตารางกะ ไม่ใช่เพราะไม่มีตาราง (ไม่ตกไปเวลาร้านทั้งวัน)
      db.hrShiftSwapRequest.findMany({
        where: { tenantId, systemId, status: "APPROVED", requesterEmployeeId: { in: empIds }, fromEntry: { publishedAt: { not: null }, date: { gte: dbDate(week0), lte: dbDate(week6) } } },
        orderBy: { id: "asc" },
        select: { requesterEmployeeId: true },
        take: CAP.swaps + 1,
      }),
    ]);
    const incomplete = entries.length > CAP.entries || leaves.length > CAP.leaves || gaveAway.length > CAP.swaps;
    const gave = new Set(gaveAway.map((g) => g.requesterEmployeeId));
    const entriesOf = groupBy(entries, (r) => r.employeeId);
    const leavesOf = groupBy(leaves, (l) => l.employeeId);
    for (const e of emps) {
      if (incomplete || isEnded(e) || !inEmployment(e, day)) {
        rows.set(e.id, { employeeId: e.id, windows: [], breaks: [] }); // R7 / อ่านไม่ครบ — ปิดไว้ก่อน ไม่ปล่อยให้ตกไปแหล่งถัดไป
        continue;
      }
      // r2: แถวไม่ระบุสาขา = สาขาของวันนั้นของพนักงานคนนี้
      const mine = (entriesOf.get(e.id) ?? []).map((r) => {
        const d = dayOf(r.date);
        return { date: d, unitId: r.unitId ?? unitOfDayOf(e, d), startMin: r.startMin, endMin: r.endMin, crossesMidnight: r.crossesMidnight };
      });
      const managed = gave.has(e.id) || mine.some((r) => (r.date >= week0 && r.date <= week6) || (r.date === prev && r.crossesMidnight));
      if (!managed) continue; // R6 ไม่มีตารางกะ ⇒ ไม่มีแถว
      const windows = dayWindows({
        day,
        unitId,
        entries: mine.filter((r) => r.date === day || r.date === prev),
        leaves: (leavesOf.get(e.id) ?? []).map(leaveRule),
      });
      rows.set(e.id, { employeeId: e.id, windows, breaks: [] });
    }
  }
  return ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
}

// ═══════════════════════════ คำใบ้หาคนแทน (R9 · R11) ═══════════════════════════
export type DutyHintViewer = Pick<MembershipCtx, "role" | "permissions"> & { unitAccess: unknown; userId?: string | null };
export type DutyHintCandidate = { employeeId: string; name: string; weekMin: number; weekMinAfter: number };
export type DutyHintItem = {
  entryId: string;
  date: string;
  unitId: string | null;
  startMin: number;
  endMin: number;
  crossesMidnight: boolean;
  part: "FULL" | "AM" | "PM" | "HOURS";
  others: number;
  candidates: DutyHintCandidate[];
};
/** incomplete = อ่านชนเพดาน — รายการอาจไม่ครบ (หน้าจอห้ามสรุปว่า "ไม่ต้องหาคนแทน") */
export type DutyHintResult = { ok: true; items: DutyHintItem[]; incomplete?: true } | { ok: false; reason: string };

type LeaveEmp = { unitId: string | null; linkedUserId: string | null };
/** R11 ผู้ดูคำใบ้: OWNER · MANAGER · STAFF ที่มี hr.leave.decide — ไม่ใช่ตัวคนลาเอง ⇒ ขอบเขตสาขาของผู้ดู · ไม่ใช่ ⇒ null */
function hintScopeOf(v: DutyHintViewer | null | undefined, emp: LeaveEmp): HrScope | null {
  if (!v || typeof v !== "object") return null;
  if (emp.linkedUserId && v.userId && v.userId === emp.linkedUserId) return null;
  const p = (v.permissions ?? {}) as Record<string, unknown>;
  const allowed = v.role === "OWNER" || v.role === "MANAGER" || (v.role === "STAFF" && (p["hr.leave.decide"] === true || p["hr.*"] === true));
  return allowed ? hrScopeOf({ role: v.role, unitAccess: v.unitAccess }) : null;
}
const coversUnit = (scope: HrScope, unit: string | null) => scope.unitIds === "*" || (!!unit && scope.unitIds.includes(unit));

type HintLeave = { id: string; employeeId: string; fromDate: Date; toDate: Date; status: string; halfDay: string | null; hours: unknown; employee: LeaveEmp };
type CandRow = DutyHintCandidate & { home: string | null; dayUnit: string | null };
/** รายการภายใน: scopeUnit = สาขาของกะ (แถวไม่ระบุสาขา = สาขาของวันนั้นของคนลา) — ใช้กรองผู้ดู แล้วตัดทิ้งก่อนส่งออก */
type RawItem = Omit<DutyHintItem, "candidates"> & { scopeUnit: string | null; candidates: CandRow[] };
const partOf = (l: Pick<HintLeave, "halfDay" | "hours">): DutyHintItem["part"] => (l.hours !== null && l.hours !== undefined ? "HOURS" : l.halfDay === "AM" ? "AM" : l.halfDay === "PM" ? "PM" : "FULL");

/** ช่วงวันที่ไม่ซ้อนกัน (รวมช่วงที่ซ้อน/ติดกัน) */
function mergeRanges(rs: { from: string; to: string }[]): { from: string; to: string }[] {
  const s = [...rs].sort((a, b) => byCode(a.from, b.from));
  const out: { from: string; to: string }[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.from <= addDays(last.to, 1)) last.to = r.to > last.to ? r.to : last.to;
    else out.push({ ...r });
  }
  return out;
}

/** คำใบ้ของหลายใบในครั้งเดียว — คำสั่งอ่านคงที่ (กะของคนลา 1 + พนักงาน/กะ/ใบลา 3) ไม่ว่ากี่ใบ · Map ตาม employeeId ไม่กรองซ้ำในลูป */
async function hintBatch(db: Db, ctx: Ctx, leaves: HintLeave[]): Promise<{ items: Map<string, RawItem[]>; incomplete: boolean }> {
  const out = new Map<string, RawItem[]>();
  const live = leaves.filter((l) => l.status === "PENDING" || l.status === "APPROVED");
  if (live.length === 0) return { items: out, incomplete: false };
  const { tenantId, systemId } = ctx;
  const ownRaw = await db.hrRosterEntry.findMany({
    where: { tenantId, systemId, publishedAt: { not: null }, OR: live.map((l) => ({ employeeId: l.employeeId, date: { gte: l.fromDate, lte: l.toDate } })) },
    orderBy: [{ date: "asc" }, { startMin: "asc" }, { id: "asc" }],
    select: { id: true, employeeId: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
    take: CAP.own + 1,
  });
  let incomplete = ownRaw.length > CAP.own;
  const own = ownRaw.slice(0, CAP.own).map((r) => ({ ...r, day: dayOf(r.date) }));
  if (own.length === 0) return { items: out, incomplete };
  const ranges = mergeRanges(own.map((r) => ({ from: addDays(weekStartOf(r.day), -1), to: addDays(weekStartOf(r.day), 7) })));
  const [emps, entriesRaw, leavesRaw] = await Promise.all([
    db.hrEmployee.findMany({
      where: { tenantId, systemId },
      orderBy: { id: "asc" },
      select: { id: true, name: true, unitId: true, active: true, employmentStatus: true, startDate: true, endDate: true, contractEndAt: true, units: UNITS_SELECT },
      take: CAP.emps + 1,
    }),
    db.hrRosterEntry.findMany({
      where: { tenantId, systemId, publishedAt: { not: null }, OR: ranges.map((r) => ({ date: { gte: dbDate(r.from), lte: dbDate(r.to) } })) },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, employeeId: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
      take: CAP.entries + 1,
    }),
    db.hrLeave.findMany({
      where: { tenantId, systemId, status: "APPROVED", OR: ranges.map((r) => ({ fromDate: { lte: dbDate(r.to) }, toDate: { gte: dbDate(r.from) } })) },
      orderBy: { id: "asc" },
      select: { employeeId: true, fromDate: true, toDate: true, halfDay: true, hours: true },
      take: CAP.leaves + 1,
    }),
  ]);
  incomplete ||= emps.length > CAP.emps || entriesRaw.length > CAP.entries || leavesRaw.length > CAP.leaves;
  const staff = emps.slice(0, CAP.emps);
  const empById = new Map(staff.map((e) => [e.id, e]));
  const rows = entriesRaw.slice(0, CAP.entries).map((r) => ({ ...r, day: dayOf(r.date) }));
  const rowsOf = groupBy(rows, (r) => r.employeeId);
  const rowsAt = groupBy(rows, (r) => `${r.day}|${r.shiftId}|${r.unitId ?? ""}`);
  const leavesOf = groupBy(leavesRaw.slice(0, CAP.leaves), (l) => l.employeeId);
  const fullLeaveOn = (id: string, day: string) => (leavesOf.get(id) ?? []).some((l) => isWholeDay(l) && covers(l, day));
  const anyLeaveOn = (id: string, day: string) => (leavesOf.get(id) ?? []).some((l) => covers(l, day));
  const abs = (r: { day: string; startMin: number; endMin: number; crossesMidnight: boolean }) => {
    const base = dayIndex(r.day) * 1440;
    return { s: base + r.startMin, e: base + (r.crossesMidnight ? r.endMin + 1440 : r.endMin) };
  };
  const paid = (r: { startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean }) => {
    try {
      return paidMinutes(r);
    } catch {
      return 0;
    }
  };
  // ชั่วโมงสัปดาห์ต่อ (พนักงาน, วันจันทร์) — คิดครั้งเดียว
  const weekMinCache = new Map<string, number>();
  const weekMinOf = (id: string, week0: string) => {
    const k = `${id}|${week0}`;
    const hit = weekMinCache.get(k);
    if (hit !== undefined) return hit;
    const week6 = addDays(week0, 6);
    const n = (rowsOf.get(id) ?? []).filter((r) => r.day >= week0 && r.day <= week6 && !fullLeaveOn(id, r.day)).reduce((a, r) => a + paid(r), 0);
    weekMinCache.set(k, n);
    return n;
  };
  const ownOf = groupBy(own, (r) => r.employeeId);
  for (const leave of live) {
    const from = dayOf(leave.fromDate);
    const to = dayOf(leave.toDate);
    const lead = empById.get(leave.employeeId);
    const items: RawItem[] = [];
    for (const it of (ownOf.get(leave.employeeId) ?? []).filter((r) => r.day >= from && r.day <= to)) {
      const others = new Set(
        (rowsAt.get(`${it.day}|${it.shiftId}|${it.unitId ?? ""}`) ?? [])
          .filter((r) => r.unitId === it.unitId && r.employeeId !== leave.employeeId)
          .map((r) => r.employeeId)
          .filter((id) => {
            const e = empById.get(id);
            return !!e && !isEnded(e) && !fullLeaveOn(id, it.day);
          }),
      ).size;
      const unit = it.unitId ?? (lead ? unitOfDayOf(lead, it.day) : null);
      const w = abs(it);
      const week0 = weekStartOf(it.day);
      const thisPaid = paid(it);
      const candidates: CandRow[] = [];
      for (const e of staff) {
        if (e.id === leave.employeeId || isEnded(e) || !inEmployment(e, it.day)) continue;
        const dayUnit = unitOfDayOf(e, it.day);
        if (dayUnit !== unit || anyLeaveOn(e.id, it.day)) continue;
        const busy = (rowsOf.get(e.id) ?? []).some((r) => {
          const x = abs(r);
          return x.s < w.e && w.s < x.e;
        });
        if (busy) continue;
        const weekMin = weekMinOf(e.id, week0);
        candidates.push({ employeeId: e.id, name: e.name, weekMin, weekMinAfter: weekMin + thisPaid, home: e.unitId, dayUnit });
      }
      candidates.sort((a, b) => a.weekMin - b.weekMin || byCode(a.name, b.name) || byCode(a.employeeId, b.employeeId));
      items.push({ entryId: it.id, date: it.day, unitId: it.unitId, startMin: it.startMin, endMin: it.endMin, crossesMidnight: it.crossesMidnight, part: partOf(leave), others, candidates, scopeUnit: unit });
    }
    out.set(leave.id, items);
  }
  return { items: out, incomplete };
}

/** มุมมองของผู้ดูหนึ่งคน: เฉพาะกะในสาขาที่ดูแล · คนแทนที่ผู้ดูเห็นได้ (H1.1 R8) · ไม่มีอะไรในขอบเขตเลย ⇒ null (= hintNo) */
function viewOf(scope: HrScope, emp: LeaveEmp, raw: RawItem[]): DutyHintItem[] | null {
  const visible = raw.filter((i) => coversUnit(scope, i.scopeUnit));
  if (visible.length === 0 && !coversUnit(scope, emp.unitId)) return null;
  return visible.map((i) => ({
    entryId: i.entryId,
    date: i.date,
    unitId: i.unitId,
    startMin: i.startMin,
    endMin: i.endMin,
    crossesMidnight: i.crossesMidnight,
    part: i.part,
    others: i.others,
    candidates: i.candidates
      .filter((c) => coversUnit(scope, c.dayUnit) || coversUnit(scope, c.home))
      .map((c) => ({ employeeId: c.employeeId, name: c.name, weekMin: c.weekMin, weekMinAfter: c.weekMinAfter })),
  }));
}

const LEAVE_SELECT = {
  id: true,
  employeeId: true,
  fromDate: true,
  toDate: true,
  status: true,
  halfDay: true,
  hours: true,
  employee: { select: { unitId: true, linkedUserId: true } },
} as const satisfies Prisma.HrLeaveSelect;
const asHintLeave = (l: Prisma.HrLeaveGetPayload<{ select: typeof LEAVE_SELECT }>): HintLeave => ({ ...l, hours: l.hours === null ? null : String(l.hours) });

/** คำใบ้ของหลายใบ (หน้า /hr/leave) — อ่านครั้งเดียว · ทุก id ได้ผล (ไม่พบ/ไม่มีสิทธิ์ = hintNo) */
export async function leaveDutyHintsMany(ctx: Ctx, viewer: DutyHintViewer | null, input: { leaveIds: string[] }): Promise<Map<string, DutyHintResult>> {
  const no: DutyHintResult = { ok: false, reason: DUTY_HINT_TEXT.hintNo };
  const ids = [...new Set((Array.isArray(input?.leaveIds) ? input.leaveIds : []).filter((x): x is string => typeof x === "string" && x !== ""))].slice(0, CAP.ids);
  const res = new Map<string, DutyHintResult>(ids.map((id) => [id, no]));
  if (!ctx?.tenantId || !ctx?.systemId || ids.length === 0) return res;
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const found = await db.hrLeave.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: { id: "asc" }, select: LEAVE_SELECT });
  const mine = found.map(asHintLeave).filter((l) => hintScopeOf(viewer, l.employee) !== null);
  if (mine.length === 0) return res;
  const batch = await hintBatch(db, ctx, mine);
  for (const l of mine) {
    const items = viewOf(hintScopeOf(viewer, l.employee)!, l.employee, batch.items.get(l.id) ?? []);
    if (items) res.set(l.id, batch.incomplete ? { ok: true, items, incomplete: true } : { ok: true, items });
  }
  return res;
}

export async function leaveDutyHints(ctx: Ctx, viewer: DutyHintViewer | null, input: { leaveId: string }): Promise<DutyHintResult> {
  const id = typeof input?.leaveId === "string" ? input.leaveId : "";
  const r = await leaveDutyHintsMany(ctx, viewer, { leaveIds: [id] });
  return r.get(id) ?? { ok: false, reason: DUTY_HINT_TEXT.hintNo };
}

// ═══════════════════════════ แจ้งครั้งเดียวต่อใบลาที่อนุมัติ (R10) ═══════════════════════════
export type DutyNotifyResult = { notified: number; uncovered: number };

export async function leaveDutyNotify(input: { tenantId: string; systemId: string; leaveId: string }): Promise<DutyNotifyResult> {
  const none = { notified: 0, uncovered: 0 };
  const { tenantId, systemId, leaveId } = input ?? ({} as typeof input);
  if (typeof tenantId !== "string" || !tenantId || typeof systemId !== "string" || !systemId || typeof leaveId !== "string" || !leaveId) return none;
  const ctx = { tenantId, systemId };
  const db = tenantDb(ctx);
  // นอกล็อก: อ่าน + คำนวณ (คำใบ้ = ข้อมูลประกอบ ไม่ใช่เงิน · ใต้ล็อกตรวจสถานะ/กันซ้ำอีกครั้งก่อนเขียน)
  const row = await db.hrLeave.findFirst({ where: { id: leaveId, tenantId, systemId }, select: LEAVE_SELECT });
  if (!row || row.status !== "APPROVED") return none;
  if (await db.auditLog.findFirst({ where: { tenantId, action: DUTY_HINT_AUDIT, targetId: leaveId }, select: { id: true } })) return none;
  const leave = asHintLeave(row);
  const raw = (await hintBatch(db, ctx, [leave])).items.get(leave.id) ?? [];
  const short = raw.filter((x) => x.others === 0);
  if (short.length === 0) return none;
  const members = await db.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    orderBy: { userId: "asc" },
    select: { userId: true, role: true, unitAccess: true, permissions: true },
    take: CAP.members,
  });
  const notes: { recipientUserId: string; n: number }[] = [];
  for (const m of members) {
    const scope = hintScopeOf({ role: m.role, unitAccess: m.unitAccess, permissions: (m.permissions ?? {}) as Record<string, unknown>, userId: m.userId }, leave.employee);
    if (!scope) continue;
    const n = short.filter((x) => coversUnit(scope, x.scopeUnit)).length;
    if (n > 0) notes.push({ recipientUserId: m.userId, n });
  }
  // ใต้ล็อก: สั้น — ตรวจสถานะ + audit กันซ้ำ + เขียน
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-leave-hint:${leaveId}`}, 0))::text AS k`;
    const still = await tx.hrLeave.findFirst({ where: { id: leaveId, tenantId, systemId, status: "APPROVED" }, select: { id: true } });
    if (!still) return none;
    if (await tx.auditLog.findFirst({ where: { tenantId, action: DUTY_HINT_AUDIT, targetId: leaveId }, select: { id: true } })) return none;
    if (notes.length) {
      await tx.appNotification.createMany({
        data: notes.map((x) => ({ tenantId, recipientUserId: x.recipientUserId, title: DUTY_HINT_TEXT.notifyTitle, body: DUTY_HINT_TEXT.notifyBody.replace("{n}", String(x.n)) })),
      });
    }
    await tx.auditLog.createMany({
      data: [{ tenantId, actorType: "SYSTEM", actorId: null, action: DUTY_HINT_AUDIT, targetType: "HrLeave", targetId: leaveId, after: { leaveId, uncovered: short.length, recipients: notes.length } }],
    });
    return { notified: notes.length, uncovered: short.length };
  });
}
