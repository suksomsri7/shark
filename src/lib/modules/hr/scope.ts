// HR H1.1 ▸ ขอบเขตสาขาของผู้ดู/ผู้กดในระบบ HR (HQ20 สาขา HR = BusinessUnit · HQ21 ผู้จัดการสาขาเห็น/จัดการเฉพาะสาขาตัวเอง)
//
// กติกา (มติผู้คุมงาน H1.1 ข้อ 2–7):
//   • ผู้ดูทุกสาขา = OWNER หรือสมาชิกภาพที่ unitAccess มี "*" ⇒ เห็นทุกแถว รวมพนักงานที่ยังไม่ระบุสาขา (unitId null)
//   • อื่น ๆ = เฉพาะสาขาใน unitAccess · unitAccess [] หรือรูปแบบเสีย ⇒ ไม่มีสาขา ⇒ 0 แถว (fail closed · ตรงกับ core canAccessUnit)
//   • พนักงานอยู่ในสาขา X เมื่อ สาขาประจำ = X หรือมีแถวยืมตัว (HrEmployeeUnit) ไป X ที่ครอบ "วันนี้" (ทะเบียน/โปรไฟล์/สลิป)
//   • แถวที่มีวันที่ (ใบลา · ลงเวลา) ⇒ ช่วงยืมตัวต้องครอบวันที่ของแถว (ใบลาใช้ fromDate) — ยืมตัวที่ปิดแล้วยังเห็นแถวในช่วงนั้น
//   • ข้อมูลเงินไม่ได้มาจากที่นี่ — สาขาเป็นตัวกรองเพิ่ม ไม่เคยขยายสิทธิ์ (canViewPayroll เดิม)
// ฟังก์ชันล้วน: hrScopeOf · unitWhere · unitTargetOf (ทดสอบตรงได้) · ตัวช่วย DB: borrowingsInto · employeeUnitsOf · scoped*Where
// ข้อความคงที่ภาษาไทย ไม่มีชื่อพนักงาน/ชื่อสาขา/id ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { thaiDateKey } from "@/lib/ui/date";

type Ctx = { tenantId: string; systemId: string };

/** "*" = ทุกสาขา · รายการ = เฉพาะสาขาเหล่านี้ ([] = ไม่มีสาขา ⇒ 0 แถว) */
export type HrScope = { unitIds: "*" | string[] };
export const HR_ALL_BRANCHES: HrScope = { unitIds: "*" };

/** ข้อความปฏิเสธ (คงที่ทุกไบต์ — ห้ามต่อชื่อ/id) */
export const HR_OTHER_BRANCH_TEXT = "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ";
export const HR_UNASSIGNED_TEXT = "พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ";
export const HR_CREATE_NEEDS_UNIT_TEXT = "เลือกสาขาประจำของพนักงานก่อน — คุณจัดการได้เฉพาะสาขาของคุณ";
export const HR_UNIT_NOT_FOUND_TEXT = "ไม่พบสาขานี้ในร้าน — กรุณาเลือกสาขาใหม่";
/** ทะเบียน: พนักงานที่ยังไม่มีสาขาประจำ (ร้านหลายสาขาหลัง backfill) */
export const HR_NO_UNIT_PROMPT = "ยังไม่ระบุสาขาประจำ";

/** ปฏิเสธเพราะอยู่นอกสาขา — message = ข้อความไทยคงที่ (action ส่งต่อถึงจอได้) */
export class HrBranchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HrBranchError";
  }
}

/** ขอบเขตสาขาของสมาชิกภาพ (pure) */
export function hrScopeOf(v: Pick<MembershipCtx, "role"> & { unitAccess: unknown }): HrScope {
  if (!v) return { unitIds: [] };
  if (v.role === "OWNER") return HR_ALL_BRANCHES;
  const ua = Array.isArray(v.unitAccess) ? v.unitAccess.filter((u): u is string => typeof u === "string" && u.trim() !== "") : [];
  if (ua.includes("*")) return HR_ALL_BRANCHES;
  return { unitIds: [...new Set(ua.map((u) => u.trim()))] };
}

export const isAllBranches = (s: HrScope | null | undefined): boolean => !!s && s.unitIds === "*";

/** วันที่ (เที่ยงคืน UTC ของวันตามปฏิทินไทย = รูปเดียวกับคอลัมน์ @db.Date) */
export const bkkDay = (at: Date = new Date()): Date => new Date(`${thaiDateKey(at)}T00:00:00Z`);

/**
 * ตัวกรอง HrEmployee ตามขอบเขต (pure — "วันนี้" ตามเวลาไทย หรือ `at`):
 * "*" ⇒ {} (ทุกแถว รวม unitId null) · [] ⇒ ไม่มีแถว · รายการ ⇒ สาขาประจำในรายการ หรือยืมตัวเข้ารายการที่ครอบวันนั้น
 */
export function unitWhere(scope: HrScope, at?: Date): Prisma.HrEmployeeWhereInput {
  if (scope.unitIds === "*") return {};
  const ids = Array.isArray(scope.unitIds) ? scope.unitIds : [];
  if (ids.length === 0) return { id: { in: [] } };
  const day = bkkDay(at);
  return {
    OR: [
      { unitId: { in: ids } },
      { units: { some: { unitId: { in: ids }, fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gte: day } }] } } },
    ],
  };
}

export type Borrowing = { employeeId: string; unitId: string; fromDate: Date; toDate: Date | null };

/** แถวยืมตัวเข้าสาขาเหล่านี้ของระบบ HR นี้ (ทุกช่วง — ผู้เรียกเทียบวันที่ของแถวเอง) */
export async function borrowingsInto(ctx: Ctx, unitIds: string[]): Promise<Borrowing[]> {
  if (unitIds.length === 0) return [];
  return tenantDb(ctx).hrEmployeeUnit.findMany({
    where: { unitId: { in: unitIds } },
    select: { employeeId: true, unitId: true, fromDate: true, toDate: true },
    take: 5000,
  });
}

const nextDay = (d: Date) => new Date(d.getTime() + 86_400_000);
const bkkStartOf = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00+07:00`);

/** ตัวกรองใบลาตามขอบเขต — null = ไม่มีแถวแน่นอน (ไม่ต้องถาม DB) · ยืมตัวต้องครอบ fromDate ของใบลา (มติ 7) */
export async function scopedLeaveWhere(ctx: Ctx, scope: HrScope | undefined): Promise<Prisma.HrLeaveWhereInput | null> {
  if (!scope || scope.unitIds === "*") return {};
  const ids = scope.unitIds;
  if (ids.length === 0) return null;
  const bs = await borrowingsInto(ctx, ids);
  return {
    OR: [
      { employee: { unitId: { in: ids } } },
      ...bs.map((b) => ({ employeeId: b.employeeId, fromDate: { gte: b.fromDate, ...(b.toDate ? { lte: b.toDate } : {}) } })),
    ],
  };
}

/** ตัวกรองการลงเวลาตามขอบเขต — ยืมตัวต้องครอบวันที่ (เวลาไทย) ของแถว */
export async function scopedAttendanceWhere(ctx: Ctx, scope: HrScope | undefined): Promise<Prisma.HrAttendanceWhereInput | null> {
  if (!scope || scope.unitIds === "*") return {};
  const ids = scope.unitIds;
  if (ids.length === 0) return null;
  const bs = await borrowingsInto(ctx, ids);
  return {
    OR: [
      { employee: { unitId: { in: ids } } },
      ...bs.map((b) => ({ employeeId: b.employeeId, at: { gte: bkkStartOf(b.fromDate), ...(b.toDate ? { lt: bkkStartOf(nextDay(b.toDate)) } : {}) } })),
    ],
  };
}

/** id พนักงานในขอบเขต (วันนี้) — ใช้กับตารางที่ไม่มี relation ไป HrEmployee (รายการเพิ่ม/หัก) · null = ทุกคน */
export async function scopedEmployeeIds(ctx: Ctx, scope: HrScope | undefined): Promise<string[] | null> {
  if (!scope || scope.unitIds === "*") return null;
  if (scope.unitIds.length === 0) return [];
  const rows = await tenantDb(ctx).hrEmployee.findMany({ where: unitWhere(scope), select: { id: true }, take: 5000 });
  return rows.map((r) => r.id);
}

export type EmployeeUnits = { unitId: string | null; borrowings: { unitId: string; fromDate: Date; toDate: Date | null }[] };

/** สาขาประจำ + แถวยืมตัวของพนักงาน 1 คน (ระบบ HR นี้) — null = ไม่พบ */
export async function employeeUnitsOf(ctx: Ctx, employeeId: string): Promise<EmployeeUnits | null> {
  if (!employeeId) return null;
  const e = await tenantDb(ctx).hrEmployee.findFirst({
    where: { id: employeeId },
    select: { unitId: true, units: { select: { unitId: true, fromDate: true, toDate: true }, take: 200 } },
  });
  return e ? { unitId: e.unitId, borrowings: e.units } : null;
}

export type UnitTarget = { ok: true; unitId?: string } | { ok: false; reason: string };

/**
 * ผู้กดในขอบเขตนี้จัดการพนักงานคนนี้ได้ไหม (pure) — คืน unitId ที่ส่งต่อให้ assertCan
 *   ระดับพนักงาน (ไม่มี `day`) = ตามสาขาประจำเท่านั้น (มติ 4) · แถวที่มีวันที่ (`day`) = สาขาประจำ หรือยืมตัวที่ครอบวันนั้น
 *   ทุกสาขา ⇒ ผ่าน (unitId = สาขาประจำถ้ามี) · ยังไม่ระบุสาขา ⇒ เฉพาะผู้ดูแลทุกสาขา (มติ 3/5)
 */
export function unitTargetOf(scope: HrScope, emp: EmployeeUnits, day?: Date): UnitTarget {
  if (scope.unitIds === "*") return emp.unitId ? { ok: true, unitId: emp.unitId } : { ok: true };
  const ids = scope.unitIds;
  if (emp.unitId && ids.includes(emp.unitId)) return { ok: true, unitId: emp.unitId };
  if (day) {
    const d = bkkDay(day).getTime();
    const b = emp.borrowings.find((x) => ids.includes(x.unitId) && x.fromDate.getTime() <= d && (!x.toDate || x.toDate.getTime() >= d));
    if (b) return { ok: true, unitId: b.unitId };
  }
  return { ok: false, reason: emp.unitId ? HR_OTHER_BRANCH_TEXT : HR_UNASSIGNED_TEXT };
}

/** พนักงานคนนี้อยู่ในขอบเขต "วันนี้" ไหม (อ่าน: โปรไฟล์ · สลิป) — สาขาประจำ หรือยืมตัวที่เปิดวันนี้ */
export async function employeeInScope(ctx: Ctx, scope: HrScope, employeeId: string): Promise<boolean> {
  if (scope.unitIds === "*") return true;
  if (scope.unitIds.length === 0 || !employeeId) return false;
  const n = await tenantDb(ctx).hrEmployee.count({ where: { AND: [{ id: employeeId }, unitWhere(scope)] } });
  return n > 0;
}

/**
 * สาขาประจำของพนักงานใหม่ / ที่ย้ายไป — ต้องอยู่ในสาขาของผู้กด (ทุกสาขา = สาขาใดของร้านก็ได้ หรือไม่ระบุ)
 * และต้องเป็น BusinessUnit ของร้านนี้จริง
 */
export async function homeUnitTarget(ctx: Ctx, scope: HrScope, unitId: string | null): Promise<UnitTarget> {
  const u = typeof unitId === "string" ? unitId.trim() : "";
  if (!u) return scope.unitIds === "*" ? { ok: true } : { ok: false, reason: HR_CREATE_NEEDS_UNIT_TEXT };
  if (scope.unitIds !== "*" && !scope.unitIds.includes(u)) return { ok: false, reason: HR_OTHER_BRANCH_TEXT };
  const row = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: u }, select: { id: true } });
  return row ? { ok: true, unitId: u } : { ok: false, reason: HR_UNIT_NOT_FOUND_TEXT };
}

/** เป้าหมายของการตัดสินใบลา = พนักงาน + วันเริ่มลา (มติ 4/7) — null = ไม่พบในระบบนี้ */
export async function leaveTargetOf(ctx: Ctx, leaveId: string): Promise<{ employeeId: string; fromDate: Date } | null> {
  if (!leaveId) return null;
  return tenantDb(ctx).hrLeave.findFirst({ where: { id: leaveId }, select: { employeeId: true, fromDate: true } });
}

/** เจ้าของเอกสารแนบ (จาก DB — ไม่เชื่อ employeeId ของฟอร์ม) */
export async function employeeIdOfDoc(ctx: Ctx, docId: string): Promise<string | null> {
  if (!docId) return null;
  return (await tenantDb(ctx).hrEmployeeDoc.findFirst({ where: { id: docId }, select: { employeeId: true } }))?.employeeId ?? null;
}

/** เจ้าของรายการเพิ่ม/หัก (จาก DB) */
export async function employeeIdOfAdjustment(ctx: Ctx, id: string): Promise<string | null> {
  if (!id) return null;
  return (await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id }, select: { employeeId: true } }))?.employeeId ?? null;
}

/** ชื่อสาขา (BusinessUnit ของร้านนี้) ตาม id — ใช้ใน DTO/ทะเบียน */
export async function unitNamesOf(tenantId: string, unitIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(unitIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const rows = await tenantDb({ tenantId }).businessUnit.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** สาขาของร้าน (สำหรับตัวเลือกในฟอร์ม/ชิปกรอง) — กรองตามขอบเขต */
export async function unitsForScope(tenantId: string, scope: HrScope): Promise<{ id: string; name: string }[]> {
  if (scope.unitIds !== "*" && scope.unitIds.length === 0) return [];
  return tenantDb({ tenantId }).businessUnit.findMany({
    where: scope.unitIds === "*" ? {} : { id: { in: scope.unitIds } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}
// ◂ HR H1.1
