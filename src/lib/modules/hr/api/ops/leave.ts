// ops/leave.ts — ประเภทการลา · ใบลา · ยอดวันลา · ยื่นใบลาแทนพนักงาน (ใบ H4.8 · brief §4 ข้อ 8–11 · มติ Q4/Q5)
//   ตัวอ่านเดียวกับหน้าจอ: settings.ts listLeavePolicies · privacy.ts leaveItemsForViewer (+ leave.ts leaveDetailsMany) · leave.ts teamLeaveBalances
//   ยื่นใบลา = service.ts requestLeave ทางเดียวกับหน้าจอ (ตรวจวัน/ประเภท/ครึ่งวัน/ชั่วโมง/ซ้อน/คงเหลือ · ล็อกต่อพนักงาน · สายอนุมัติ)
//   🔴 รับเฉพาะใบ "รออนุมัติ": พนักงานที่ผูกบัญชีเจ้าของร้าน (ใบของเจ้าของอนุมัติทันที — F6) หรือผูกผู้ออกคีย์ = 403 ไม่เขียนอะไร
//   🔴 ไม่มีช่องเหตุผล (อาจเป็นข้อมูลสุขภาพ — Q5) · ไม่มีไฟล์แนบ · ช่องที่ไม่รู้จัก = 422 · ต้องมี Idempotency-Key (แกน)
import { z } from "zod";
import { withExtra } from "@/lib/api/respond";
import { endedEmployeeIds, hrIssuerId, hrKeyCan, hrKeyViewer, isEndedEmployee, isShopOwner } from "../actor";
import { hrForbidden, hrNotFound, hrScopeMissing, hrValidation, leaveRefusalHttp } from "../http-errors";
import { defineHrOp, HR_DAY, type ApiOp } from "../op";
import { serializeLeave, serializeLeavePolicy, serializeLeaveBalances } from "../serialize";
import { leaveDetailsMany, teamLeaveBalances, LEAVE_TEXT } from "../../leave";
import { leaveItemsForViewer } from "../../privacy";
import { employeeUnitsOf, hrScopeOf, unitTargetOf } from "../../scope";
import { getEmployee, HrLeaveRequestError, requestLeave } from "../../service";
import { listLeavePolicies } from "../../settings";

const TEST = "qc-hr-h4.8";
const ID = z.string().min(1).max(64);
const DAY = HR_DAY;
/** เพดานของตัวอ่าน leaveItemsForViewer (pendingLeaves/listLeaves take 100) — เต็มเพดาน = อาจมีมากกว่านี้ */
const LEAVE_CAP = 100;
/** เพดานของ teamLeaveBalances (TEAM_MAX ใน leave.ts) */
const TEAM_CAP = 1000;
const CATEGORIES = ["SICK", "PERSONAL", "VACATION", "OTHER"] as const;

const policiesList = defineHrOp({
  id: "leavePolicies.list",
  method: "GET",
  path: "/leave-policies",
  kind: "read",
  action: "hr.leave.read",
  summary: "Active leave types of the HR system (category, quota, half-day and hour rules). Use id as policyId when filing a leave.",
  label: "ประเภทการลา",
  test: TEST,
  input: z.object({}).strict(),
  async handler({ actor }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    return (await listLeavePolicies(ctx, { scope: hrScopeOf(hrKeyViewer(actor)) })).map(serializeLeavePolicy);
  },
});

const leavesList = defineHrOp({
  id: "leaves.list",
  method: "GET",
  path: "/leaves",
  kind: "read",
  action: "hr.leave.read",
  summary: "Leave requests. status=PENDING (default): the requests waiting for a decision. status=HISTORY: the 100 most recently filed requests of any status. Ordered by fromDate (newest first) then id. Leave of ended employees, reasons, who filed and attachments are never returned. truncated: true when the list hit its limit of 100.",
  label: "ใบลา",
  test: TEST,
  input: z.object({ status: z.enum(["PENDING", "HISTORY"]).optional().describe("PENDING (default) or HISTORY.") }).strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const viewer = hrKeyViewer(actor);
    const all = await leaveItemsForViewer(ctx, viewer);
    const items = input.status === "HISTORY" ? all.history : all.pending;
    const details = await leaveDetailsMany(ctx, viewer, items.map((i) => i.id));
    const ended = await endedEmployeeIds(ctx);
    const out = items.flatMap((i) => {
      const d = details.get(i.id);
      return d && d.ok && !ended.has(d.item.employeeId) ? [serializeLeave(i, d.item)] : [];
    });
    out.sort((a, b) => ((a.fromDate ?? "") > (b.fromDate ?? "") ? -1 : (a.fromDate ?? "") < (b.fromDate ?? "") ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return items.length >= LEAVE_CAP ? withExtra(out, { truncated: true }) : out;
  },
});

const balancesList = defineHrOp({
  id: "leaveBalances.list",
  method: "GET",
  path: "/leave-balances",
  kind: "read",
  action: "hr.leave.read",
  summary: "Leave balances of every working employee for one leave year, per leave type: granted, carried, used, adjusted, expired, balance, pending and available days (decimal strings).",
  label: "ยอดวันลาคงเหลือ",
  test: TEST,
  input: z
    .object({
      year: z.coerce.number().int().min(2000).max(2600).optional().describe("Leave year, e.g. 2026. Default this year."),
      unitId: ID.optional().describe("Only employees whose home branch is this unit."),
    })
    .strict(),
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const year = input.year ?? Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));
    const t = await teamLeaveBalances(ctx, hrKeyViewer(actor), { year, unitId: input.unitId ?? null });
    if (!t) throw hrNotFound();
    const data = serializeLeaveBalances(t);
    return t.rows.length >= TEAM_CAP ? withExtra(data, { truncated: true }) : data;
  },
});

const createInput = z
  .object({
    employeeId: ID.describe("Employee id (from GET /employees)."),
    policyId: ID.optional().describe("Leave type id (from GET /leave-policies). Send policyId or type."),
    type: z.enum(CATEGORIES).optional().describe("Leave category when no policyId is sent: SICK, PERSONAL, VACATION or OTHER."),
    fromDate: DAY.describe("First day of leave, YYYY-MM-DD (Asia/Bangkok)."),
    toDate: DAY.describe("Last day of leave, YYYY-MM-DD."),
    halfDay: z.enum(["AM", "PM"]).optional().describe("Half day (one day only, when the leave type allows it)."),
    hours: z.number().int().min(1).max(7).optional().describe("Hours (1 to 7, one day only, when the leave type allows it)."),
  })
  .strict();

const OWNER_TH = "ยื่นใบลาของเจ้าของร้านผ่าน API ไม่ได้ — ใบลาของเจ้าของร้านอนุมัติทันที ให้ทำในแอป";
const OWNER_EN = "Leave of the shop owner cannot be filed through the API (it would be approved at once). Use the app.";
const NEED_KIND_TH = "ต้องระบุประเภทการลา (policyId) หรือหมวดการลา (type)";
const KIND_MISMATCH_TH = "หมวดการลา (type) ไม่ตรงกับประเภทการลาที่เลือก (policyId)";

const leavesCreate = defineHrOp({
  id: "leaves.create",
  method: "POST",
  path: "/leaves",
  kind: "write",
  action: "hr.leave.request",
  summary: "File a leave request for an employee. It is created PENDING (the answer carries the stored status) and goes through the shop's normal approval; nothing is approved here. Needs hr.leave.request and hr.leave.decide (the app's rule for filing on someone's behalf). No reason field: medical details stay out of the API. Requires Idempotency-Key and Content-Type: application/json (415 otherwise).",
  label: "ยื่นใบลาแทนพนักงาน",
  test: TEST,
  input: createInput,
  auditTarget: ({ data }) => {
    const id = data && typeof data === "object" ? (data as { id?: unknown }).id : null;
    return typeof id === "string" ? { targetType: "HrLeave", targetId: id } : null;
  },
  async handler({ actor, input }) {
    // กติกายื่นแทนของหน้าจอ (actions.ts requestLeaveAction): hr.leave.request + (hr.employee.create | hr.leave.decide) + สาขา ณ วันเริ่มลา
    if (!hrKeyCan(actor, "hr.leave.decide")) throw hrScopeMissing("hr.leave.decide");
    if (!input.policyId && !input.type) throw hrValidation(NEED_KIND_TH, "Send policyId or type.", "policyId");
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const issuer = hrIssuerId(actor);
    const emp = await getEmployee(ctx, input.employeeId);
    // พ้นสภาพแล้ว = 404 เหมือน id ที่ไม่มี (มติรอบแก้ ข้อ 5 — ไม่ใช่ 422 "พ้นสภาพ")
    if (!emp || isEndedEmployee(emp)) throw hrNotFound();
    if (emp.linkedUserId && (emp.linkedUserId === issuer || (await isShopOwner(actor.tenantId, emp.linkedUserId)))) throw hrForbidden(OWNER_TH, OWNER_EN);
    const units = await employeeUnitsOf(ctx, emp.id);
    if (!units) throw hrNotFound();
    const t = unitTargetOf(hrScopeOf(hrKeyViewer(actor)), units, new Date(`${input.fromDate}T00:00:00Z`));
    if (!t.ok) throw hrNotFound();
    let type = input.type;
    if (input.policyId) {
      const pol = (await listLeavePolicies(ctx, { scope: hrScopeOf(hrKeyViewer(actor)) })).find((p) => p.id === input.policyId);
      if (!pol) throw leaveRefusalHttp(LEAVE_TEXT.policyNf);
      if (type && type !== pol.category) throw hrValidation(KIND_MISMATCH_TH, "type does not match the category of policyId.", "type");
      type = pol.category;
    }
    try {
      const made = await requestLeave(ctx, {
        employeeId: emp.id,
        type: type!,
        policyId: input.policyId ?? null,
        fromDate: input.fromDate,
        toDate: input.toDate,
        halfDay: input.halfDay ?? null,
        hours: input.hours ?? null,
        reason: null,
        actorUserId: issuer,
      });
      // สถานะที่บันทึกจริง (ไม่ใช่ค่าคงที่ — มติรอบแก้ ข้อ 6) · ผู้ดูสังเคราะห์ถือ hr.leave.decide ⇒ เห็นแถวนี้เสมอ
      const stored = (await leaveDetailsMany(ctx, hrKeyViewer(actor), [made.id])).get(made.id);
      return { id: made.id, status: stored && stored.ok ? String(stored.item.status) : "PENDING" };
    } catch (e) {
      if (e instanceof HrLeaveRequestError) throw leaveRefusalHttp(e.message);
      throw e;
    }
  },
});

export const LEAVE_OPS: ApiOp[] = [policiesList, leavesList, balancesList, leavesCreate];
