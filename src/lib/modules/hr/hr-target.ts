// HR PRIV-3 ▸ R6 (CONTROLLER RULINGS r2): resolver เดียวของ action เงินเดือน — ระบบ HR ต้องเป็นของร้านผู้กด (id · tenant ของผู้กด · type HR)
//   และแถวที่ระบุ (พนักงาน · รอบจ่าย · รายการเพิ่ม/หัก) ต้องอยู่ในระบบนั้น — อ่านผ่าน tenantDb(ctx) เท่านั้น (ตัวกรอง tenant/system ของ core)
//   ไม่พบ/ข้ามร้าน/ข้ามระบบ = false ⇒ action คืนคำปฏิเสธเดียวกับรหัสระบบที่ไม่มีอยู่ · ไม่เขียนอะไร · ไม่มีกติกาสิทธิ์ในไฟล์นี้ (ด่านคีย์อยู่ที่ action) ◂
import { tenantDb } from "@/lib/core/db";

export type HrTargetIds = { employeeId?: string | null; runId?: string | null; adjustmentId?: string | null };

/** HR PRIV-3 ▸ true เมื่อระบบ HR + ทุกแถวที่ส่งมาอยู่ในร้านของผู้กด (ctx.tenantId มาจาก session เสมอ) ◂ */
export async function hrTargetOwned(ctx: { tenantId: string; systemId: string }, ids: HrTargetIds = {}): Promise<boolean> {
  if (!ctx?.tenantId || !ctx.systemId) return false;
  const db = tenantDb(ctx);
  if (!(await db.appSystem.findFirst({ where: { id: ctx.systemId, type: "HR" }, select: { id: true } }))) return false;
  if (ids.employeeId !== undefined && !(ids.employeeId && (await db.hrEmployee.findFirst({ where: { id: ids.employeeId }, select: { id: true } })))) return false;
  if (ids.runId !== undefined && !(ids.runId && (await db.hrPayrollRun.findFirst({ where: { id: ids.runId }, select: { id: true } })))) return false;
  if (ids.adjustmentId !== undefined && !(ids.adjustmentId && (await db.hrPayAdjustment.findFirst({ where: { id: ids.adjustmentId }, select: { id: true } })))) return false;
  return true;
}
