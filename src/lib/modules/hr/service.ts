import { tenantDb } from "@/lib/core/db";
import type { HrAttendanceKind, HrLeaveType } from "@prisma/client";
import * as approval from "@/lib/modules/approval/service";
import { isAvailable as rulesIsAvailable, workedMinutes } from "./rules";

// HR (ระบบที่ 17) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกา availability + ชั่วโมงทำงาน มาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่โหลด DB แล้วเรียกใช้
//    contract C-2: availability เป็นของ HR เท่านั้น (ระบบอื่นถาม ห้าม copy สูตร)
// scope: ทุก query ผ่าน tenantDb({ tenantId, systemId }) — inject tenantId+systemId อัตโนมัติ

export type Ctx = { tenantId: string; systemId: string };

// แปลง "YYYY-MM-DD" → Date เที่ยงคืน UTC (ตรงกับ @db.Date + rules ที่ตัด ISO 10 ตัวแรก)
//   รับ Date มาแล้วก็ได้ (เช่น จาก server action ที่ parse เอง) → ใช้ตรง ๆ
const toDbDate = (s: string | Date): Date => (s instanceof Date ? s : new Date(`${s}T00:00:00Z`));

// ── พนักงาน ──
export type CreateEmployeeInput = {
  name: string;
  phone?: string | null;
  position?: string | null;
  pinCode?: string | null;
};

export async function createEmployee(ctx: Ctx, input: CreateEmployeeInput): Promise<{ id: string }> {
  const e = await tenantDb(ctx).hrEmployee.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      position: input.position?.trim() || null,
      pinCode: input.pinCode?.trim() || null,
      // active = true (default ใน schema)
    },
  });
  return { id: e.id };
}

export async function listEmployees(ctx: Ctx, take = 200) {
  return tenantDb(ctx).hrEmployee.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}

// ── ลงเวลา (IN/OUT) ──
export async function clock(
  ctx: Ctx,
  input: { employeeId: string; kind: HrAttendanceKind; note?: string | null },
): Promise<{ id: string }> {
  const a = await tenantDb(ctx).hrAttendance.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      kind: input.kind,
      note: input.note?.trim() || null,
      // at = now() (default ใน schema)
    },
  });
  return { id: a.id };
}

// ── ลา ──
export type RequestLeaveInput = {
  employeeId: string;
  type: HrLeaveType;
  fromDate: string | Date; // "YYYY-MM-DD" หรือ Date สำเร็จรูป
  toDate: string | Date;
  reason?: string | null;
};

export async function requestLeave(ctx: Ctx, input: RequestLeaveInput): Promise<{ id: string }> {
  const l = await tenantDb(ctx).hrLeave.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      type: input.type,
      fromDate: toDbDate(input.fromDate),
      toDate: toDbDate(input.toDate),
      reason: input.reason?.trim() || null,
      // status = PENDING (default ใน schema)
    },
  });
  // WO-0049b: มีสายอนุมัติใบลา → ยื่นเข้าสาย (ใบลาคง PENDING จน effect ตัดสินหลังอนุมัติ/ปฏิเสธ)
  //   ไม่มีสายอนุมัติ → พฤติกรรมเดิม (ใบลารอ decideLeave ด้วยมือตามเดิม)
  const policy = await approval.resolvePolicy(
    { tenantId: ctx.tenantId },
    { entityType: "HrLeave", systemId: ctx.systemId },
  );
  if (policy) {
    await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      { entityType: "HrLeave", entityId: l.id, systemId: ctx.systemId, requestedById: input.employeeId },
    );
  }
  return { id: l.id };
}

// อนุมัติ/ปฏิเสธการลา — availability เปลี่ยนเฉพาะเมื่อ APPROVED (C-2)
export async function decideLeave(
  ctx: Ctx,
  leaveId: string,
  status: "APPROVED" | "REJECTED",
  decidedById?: string | null,
): Promise<void> {
  await tenantDb(ctx).hrLeave.update({
    where: { id: leaveId },
    data: { status, decidedById: decidedById ?? null },
  });
}

// อนุมัติ/ปฏิเสธใบลาหลายใบพร้อมกัน (bulk) — วน decideLeave() ทีละใบ (แต่ละใบ scope tenant+system เดิม)
// ไม่ atomic ทั้งชุด: ใบไหน id ข้ามร้าน/ไม่พบ → guard tenantDb โยน (P2025) → บันทึก failed แล้วไปต่อ
export type BulkLeaveResult = { done: number; failed: { id: string; reason: string }[] };
export async function bulkDecideLeave(
  ctx: Ctx,
  leaveIds: string[],
  status: "APPROVED" | "REJECTED",
  decidedById?: string | null,
): Promise<BulkLeaveResult> {
  const result: BulkLeaveResult = { done: 0, failed: [] };
  for (const id of leaveIds) {
    try {
      await decideLeave(ctx, id, status, decidedById ?? null);
      result.done += 1;
    } catch {
      // id ข้ามร้าน/ไม่พบ → guard โยน P2025 (ข้อความอังกฤษ) → ใช้เหตุผลไทยแทน
      result.failed.push({ id, reason: "ไม่พบใบลา หรืออยู่นอกร้านนี้" });
    }
  }
  return result;
}

// ── availability (contract C-2) ──
// โหลดใบลาของพนักงาน แล้วให้ rules ตัดสิน — rules นับเฉพาะ APPROVED (PENDING ไม่ทำให้ไม่ว่าง)
export async function isAvailable(ctx: Ctx, employeeId: string, date: Date): Promise<boolean> {
  const leaves = await tenantDb(ctx).hrLeave.findMany({
    where: { employeeId },
    select: { fromDate: true, toDate: true, status: true },
  });
  return rulesIsAvailable(leaves, date);
}

// ── reads (สำหรับ UI) ──
export async function listLeaves(ctx: Ctx, take = 100) {
  return tenantDb(ctx).hrLeave.findMany({
    include: { employee: true },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export async function pendingLeaves(ctx: Ctx, take = 100) {
  return tenantDb(ctx).hrLeave.findMany({
    where: { status: "PENDING" },
    include: { employee: true },
    orderBy: [{ fromDate: "asc" }, { createdAt: "asc" }],
    take,
  });
}

export async function listAttendance(ctx: Ctx, take = 50) {
  return tenantDb(ctx).hrAttendance.findMany({
    include: { employee: true },
    orderBy: { at: "desc" },
    take,
  });
}

// ชั่วโมงทำงานของพนักงานในเดือน (คิดเป็นนาที) — จับคู่ IN/OUT ด้วยกติกา rules.workedMinutes
export async function monthlyMinutes(ctx: Ctx, employeeId: string, monthStart: Date): Promise<number> {
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const events = await tenantDb(ctx).hrAttendance.findMany({
    where: { employeeId, at: { gte: start, lt: end } },
    select: { kind: true, at: true },
    orderBy: { at: "asc" },
  });
  return workedMinutes(events);
}
