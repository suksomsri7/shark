// ops/roster.ts — กะ · ตารางกะ (เผยแพร่แล้วเท่านั้น) · การมาทำงานรายวัน/รายเดือน (ใบ H4.8 · brief §4 ข้อ 4–7 · มติ Q6)
//   ตัวอ่านเดียวกับหน้าจอ: settings.ts listShifts · roster.ts listRoster · judge.ts loadAttendanceBoard / loadAttendanceMonth
//   ไม่มีพิกัด · รูป · อุปกรณ์ · หมายเหตุ · คำเตือนของตารางร่าง (serializer R4)
import { z } from "zod";
import { endedEmployeeIds, hrKeyViewer } from "../actor";
import { hrNotFound, hrUnprocessable } from "../http-errors";
import { defineHrOp, HR_DAY, HR_MONTH, type ApiOp } from "../op";
import { serializeAttendanceDay, serializeAttendanceMonth, serializeRosterEntry, serializeShift } from "../serialize";
import { loadAttendanceBoard, loadAttendanceMonth } from "../../judge";
import { listRoster } from "../../roster";
import { hrScopeOf } from "../../scope";
import { listShifts } from "../../settings";

const TEST = "qc-hr-h4.8";
const ID = z.string().min(1).max(64);
const DAY = HR_DAY;

const shiftsList = defineHrOp({
  id: "shifts.list",
  method: "GET",
  path: "/shifts",
  kind: "read",
  action: "hr.roster.read",
  summary: "Active shifts of the HR system. With unitId: the shifts of that branch plus the shop-wide ones. Times are minutes after midnight.",
  label: "กะทำงาน",
  test: TEST,
  input: z.object({ unitId: ID.optional().describe("Branch id: its shifts plus the shop-wide ones.") }).strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const rows = await listShifts(ctx, { scope: hrScopeOf(hrKeyViewer(actor)) });
    return rows.filter((r) => !input.unitId || r.unitId === null || r.unitId === input.unitId).map(serializeShift);
  },
});

const rosterList = defineHrOp({
  id: "roster.list",
  method: "GET",
  path: "/roster",
  kind: "read",
  action: "hr.roster.read",
  summary: "Published roster entries between from and to (Thai dates, inclusive, at most 31 days), ordered by date and employee. Draft (unpublished) entries are never returned.",
  label: "ตารางกะที่ประกาศแล้ว",
  test: TEST,
  input: z
    .object({
      from: DAY.describe("First day, YYYY-MM-DD (Asia/Bangkok)."),
      to: DAY.describe("Last day, YYYY-MM-DD, at most 31 days after from."),
      unitId: ID.optional().describe("Only entries of this branch."),
    })
    .strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = await listRoster(ctx, hrKeyViewer(actor), { from: input.from, to: input.to, unitId: input.unitId ?? null });
    if (!r.ok) throw hrUnprocessable(r.reason);
    return r.entries.filter((e) => e.published === true).map(serializeRosterEntry);
  },
});

const attendanceDay = defineHrOp({
  id: "attendance.day",
  method: "GET",
  path: "/attendance/day",
  kind: "read",
  action: "hr.roster.read",
  summary: "Attendance board of one day: per employee the shift slots with clock in/out times (ISO UTC), status and minutes, plus totals. No GPS, photos, devices or notes.",
  label: "การมาทำงานรายวัน",
  test: TEST,
  input: z
    .object({
      day: DAY.optional().describe("YYYY-MM-DD (Asia/Bangkok). Default today."),
      unitId: ID.optional().describe("Only this branch."),
    })
    .strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const b = await loadAttendanceBoard(ctx, hrKeyViewer(actor), { day: input.day, unit: input.unitId });
    if (!b) throw hrNotFound();
    // สาขาที่ขอแต่บอร์ดไม่รู้จัก (สาขาของร้านอื่น/ไม่มีจริง) = ไม่พบ — ไม่ตกไปเป็น "ทุกสาขา" เงียบ ๆ
    if (input.unitId && b.unitSel !== input.unitId) throw hrNotFound();
    const ended = await endedEmployeeIds(ctx);
    const out = serializeAttendanceDay(b, input.unitId ?? null);
    // พนักงานที่พ้นสภาพแล้วไม่อยู่ในคำตอบ (มติรอบแก้ ข้อ 5) — ยอดรวมคิดใหม่จากแถวที่เหลือ
    out.rows = out.rows.filter((r) => !ended.has(r.employeeId));
    const counts: Record<string, number> = {};
    let workedMin = 0;
    for (const r of out.rows) for (const sl of r.slots) {
      if (sl.status) counts[sl.status] = (counts[sl.status] ?? 0) + 1;
      workedMin += sl.workedMin ?? 0;
    }
    out.totals = { workedMin, counts };
    return out;
  },
});

const attendanceMonth = defineHrOp({
  id: "attendance.month",
  method: "GET",
  path: "/attendance/month",
  kind: "read",
  action: "hr.roster.read",
  summary: "Attendance calendar of one employee for one month (YYYY-MM) with the monthly summary. An ended employee or an employee of another HR system or shop answers 404 not_found like an unknown id.",
  label: "การมาทำงานรายเดือนของพนักงาน",
  test: TEST,
  input: z
    .object({
      employeeId: ID.describe("Employee id (from GET /employees)."),
      month: HR_MONTH.describe("YYYY-MM (Asia/Bangkok)."),
    })
    .strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    if ((await endedEmployeeIds(ctx)).has(input.employeeId)) throw hrNotFound();
    const m = await loadAttendanceMonth(ctx, hrKeyViewer(actor), { employeeId: input.employeeId, month: input.month });
    if (!m) throw hrNotFound();
    return serializeAttendanceMonth(m);
  },
});

export const ROSTER_OPS: ApiOp[] = [shiftsList, rosterList, attendanceDay, attendanceMonth];
