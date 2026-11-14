// ops/employees.ts — สาขา · รายชื่อพนักงาน · พนักงานรายคน (ใบ H4.8 · brief §4 ข้อ 1–3)
//   ตัวอ่านเดียวกับหน้าจอ: scope.ts unitsForScope · service.ts listEmployees · privacy.ts loadEmployeeProfileForViewer
//   ผู้ดู = ผู้ดูสังเคราะห์ของคีย์ (ทุกสาขา · ไม่เห็นข้อมูลอ่อนไหว) · คำตอบผ่าน serializeEmployee (allow-list R4)
import { z } from "zod";
import { paged } from "@/lib/api/respond";
import { hrKeyViewer, isEndedEmployee } from "../actor";
import { hrNotFound } from "../http-errors";
import { defineHrOp, type ApiOp } from "../op";
import { serializeEmployee, serializeUnit } from "../serialize";
import { loadEmployeeProfileForViewer } from "../../privacy";
import { hrScopeOf, unitNamesOf, unitsForScope } from "../../scope";
import { listEmployees } from "../../service";

const TEST = "qc-hr-h4.8";
/** เพดานของตัวอ่าน listEmployees ที่ API ใช้ (อ่าน +1 แถวเพื่อรู้ว่าเกิน) — เกิน = truncated */
const EMP_CAP = 500;
export const HR_PAGE_SIZES = [10, 20, 50] as const;
const ID = z.string().min(1).max(64);

const unitsList = defineHrOp({
  id: "units.list",
  method: "GET",
  path: "/units",
  kind: "read",
  action: "hr.employee.read",
  summary: "Branches (business units) of the shop, oldest first. Use an id as unitId in the other operations.",
  label: "สาขาของร้าน",
  test: TEST,
  input: z.object({}).strict(),
  async handler({ actor }) {
    const units = await unitsForScope(actor.tenantId, hrScopeOf(hrKeyViewer(actor)));
    return units.map(serializeUnit);
  },
});

const listInput = z
  .object({
    unitId: ID.optional().describe("Only employees whose home branch is this unit."),
    status: z.enum(["PROBATION", "ACTIVE"]).optional().describe("Only employees in this employment status."),
    page: z.coerce.number().int().min(1).max(100_000).optional().describe("Page number, from 1. Default 1."),
    pageSize: z.coerce
      .number()
      .int()
      .refine((n) => (HR_PAGE_SIZES as readonly number[]).includes(n), { message: `pageSize ต้องเป็น ${HR_PAGE_SIZES.join(" / ")}` })
      .optional()
      .describe(`Employees per page: ${HR_PAGE_SIZES.join(", ")}. Default 20.`),
  })
  .strict();

const byNameId = (a: { name: string; id: string }, b: { name: string; id: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const employeesList = defineHrOp({
  id: "employees.list",
  method: "GET",
  path: "/employees",
  kind: "read",
  action: "hr.employee.read",
  paged: true,
  summary: "Employees still working (no ended staff), ordered by name then id, paged with page and pageSize. Sensitive fields (national id, bank, address, phone, e-mail, PIN, photos) are never returned. truncated: true means the shop has more than 500 working employees and only the first 500 (by registration) were ordered.",
  label: "รายชื่อพนักงาน",
  test: TEST,
  input: listInput,
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const rows = await listEmployees(ctx, EMP_CAP + 1, hrScopeOf(hrKeyViewer(actor)));
    const truncated = rows.length > EMP_CAP;
    const kept = rows.slice(0, EMP_CAP).filter((r) => (!input.unitId || r.unitId === input.unitId) && (!input.status || r.employmentStatus === input.status));
    kept.sort(byNameId);
    const pageSize = input.pageSize ?? 20;
    const page = input.page ?? 1;
    const slice = kept.slice((page - 1) * pageSize, page * pageSize);
    const names = await unitNamesOf(actor.tenantId, slice.map((r) => r.unitId));
    const data = slice.map((r) =>
      serializeEmployee({
        id: r.id, code: r.code, name: r.name, nickname: r.nickname, position: r.position, department: r.department, unitId: r.unitId,
        unitName: r.unitId ? (names.get(r.unitId) ?? null) : null, employmentType: r.employmentType, employmentStatus: r.employmentStatus,
        startDate: r.startDate, endDate: r.endDate, probationEndAt: r.probationEndAt, contractEndAt: r.contractEndAt, active: r.active,
      }),
    );
    const pageCount = Math.max(1, Math.ceil(kept.length / pageSize));
    return paged(data, { page, pageSize, pageCount, total: kept.length, hasMore: page < pageCount }, truncated ? { truncated: true } : undefined);
  },
});

const employeesGet = defineHrOp({
  id: "employees.get",
  method: "GET",
  path: "/employees/{employeeId}",
  kind: "read",
  action: "hr.employee.read",
  summary: "One working employee (same fields as the list). An ended employee, an employee of another HR system or shop, and an unknown id answer the same 404 not_found.",
  label: "พนักงานรายคน",
  test: TEST,
  input: z.object({}).strict(),
  async handler({ actor, params }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = await loadEmployeeProfileForViewer(ctx, hrKeyViewer(actor), params.employeeId ?? "");
    // พนักงานที่พ้นสภาพแล้ว = 404 ไบต์เดียวกับ id ที่ไม่มี (รายการก็ไม่แสดง — มติรอบแก้ ข้อ 5)
    if (!r || isEndedEmployee(r.profile)) throw hrNotFound();
    return serializeEmployee(r.profile);
  },
});

export const EMPLOYEES_OPS: ApiOp[] = [unitsList, employeesList, employeesGet];
