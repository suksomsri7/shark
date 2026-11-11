// hr/pos-seam-read.ts — ตัวอ่านของ HR ที่รอยต่อ POS (C-8 v2 · POS P3.5 · มติ 5) ต้องใช้ แต่ยังไม่มีฟังก์ชันของ HR ตัวไหนให้
//
// 🔴 อ่านอย่างเดียว (findMany/findFirst ล้วน) · ไม่มีการเขียนตาราง HR ที่นี่ — ทางเขียนเดียวของรอยต่อคือ `clock()` (pos-seam.ts)
// 🔴 ผ่าน `tenantDb` (scope ของเคอร์เนล) ทุกคำสั่ง · ผูก tenantId (+ systemId ของระบบ HR) เสมอ · ไม่มี prisma ดิบ
// 🔴 ทำไมแยกไฟล์: pos-seam.ts (ไฟล์ของ 4 ชื่อที่แช่แข็ง) ต้องประกอบจากฟังก์ชันของ HR ล้วน ไม่เปิดทางเข้า DB เอง (ข้อสอบ qc-pos-p3.5 ST1) ·
//    ตัวอ่านที่ HR ยังไม่มี (ระบบ HR ของร้าน · active ของพนักงาน · การลงเวลาช่วงหนึ่ง · สถานะรายการปรับเงินตาม id) จึงอยู่ที่นี่ —
//    HR (H1.1/H2.1/H2.4) ย้ายเข้า service.ts/clock.ts ได้โดย POS ไม่ต้องแก้ (POS เห็นแค่ 4 ชื่อผ่าน hr/index.ts)
import { tenantDb } from "@/lib/core/db";
import type { HrTx } from "./service";

type Ctx = { tenantId: string; systemId: string };

/** ระบบ HR ของร้าน (เก่าสุดก่อน · ไม่เกิน 50) — ไม่มี = [] */
export async function hrSystemIdsOf(tenantId: string): Promise<string[]> {
  if (!tenantId) return [];
  const rows = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
  return rows.map((r) => r.id);
}

/** active ของพนักงานคนนี้ในระบบ HR นี้ · ไม่พบ = null */
export async function employeeActiveOf(ctx: Ctx, employeeId: string): Promise<boolean | null> {
  const row = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId }, select: { active: true } });
  return row ? row.active : null;
}

/** การลงเวลาของพนักงานในช่วง [from, to] (เรียงตามเวลา · ไม่เกิน 2,000 แถว) — เฉพาะชนิดกับเวลา */
export async function attendanceBetween(ctx: Ctx, employeeId: string, from: Date, to: Date): Promise<{ kind: string; at: Date }[]> {
  const rows = await tenantDb(ctx).hrAttendance.findMany({
    where: { employeeId, at: { gte: from, lte: to } },
    select: { kind: true, at: true },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    take: 2_000,
  });
  return rows.map((r) => ({ kind: String(r.kind), at: r.at }));
}

/** การลงเวลาล่าสุดที่ไม่เกิน `upTo` · IN แรกของช่วง [dayStart, upTo] — ใช้สรุปสถานะลงเวลา (ไม่มี note/คำตัดสิน) */
export async function attendanceMarks(ctx: Ctx, employeeId: string, dayStart: Date, upTo: Date): Promise<{ firstInAt: Date | null; lastKind: string | null; lastAt: Date | null }> {
  const db = tenantDb(ctx);
  const [firstIn, last] = await Promise.all([
    db.hrAttendance.findFirst({ where: { employeeId, kind: "IN", at: { gte: dayStart, lte: upTo } }, select: { at: true }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
    db.hrAttendance.findFirst({ where: { employeeId, at: { lte: upTo } }, select: { kind: true, at: true }, orderBy: [{ at: "desc" }, { id: "desc" }] }),
  ]);
  return { firstInAt: firstIn?.at ?? null, lastKind: last ? String(last.kind) : null, lastAt: last?.at ?? null };
}

/** สถานะของรายการปรับเงินตาม id (ทุกระบบ HR ของร้าน · ไม่เกิน 1,000 id) — id ที่ไม่ใช่ของร้านนี้ไม่ถูกคืน */
export async function adjustmentStatusRows(tenantId: string, ids: string[]): Promise<{ id: string; status: string; runId: string | null; periodKey: string }[]> {
  const want = [...new Set(ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 200))].slice(0, 1_000);
  if (!tenantId || want.length === 0) return [];
  const out: { id: string; status: string; runId: string | null; periodKey: string }[] = []; // POS P3.5 ▸ fix2 N1: + periodKey (ย้ายงวดตอนอนุมัติ/กวาด) ◂
  for (const systemId of await hrSystemIdsOf(tenantId)) {
    const rows = await tenantDb({ tenantId, systemId }).hrPayAdjustment.findMany({ where: { id: { in: want } }, select: { id: true, status: true, runId: true, periodKey: true }, take: 1_000 });
    out.push(...rows.map((r) => ({ id: r.id, status: String(r.status), runId: r.runId ?? null, periodKey: r.periodKey })));
  }
  return out;
}

/**
 * POS P3.5 ▸ fix2 F4: พนักงานที่ผูกกับผู้ใช้ (กติกาเดียวกับ service.employeeOfUser: ระบบ HR เก่าสุดก่อน · active มาก่อน · สร้างก่อนมาก่อน) + active ·
 * อ่านผ่าน tx ของผู้เรียกได้ (ไม่เปิด connection ที่สองใต้ล็อก) · ไม่พบ = null ◂
 */
export async function linkedEmployeeOf(tenantId: string, userId: string, tx?: HrTx): Promise<{ employeeId: string; systemId: string; active: boolean } | null> {
  if (!tenantId || !userId) return null;
  const systems = tx
    ? await tx.appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 })
    : await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
  for (const s of systems) {
    const where = { tenantId, systemId: s.id, linkedUserId: userId };
    const orderBy = [{ active: "desc" as const }, { createdAt: "asc" as const }];
    const row = tx
      ? await tx.hrEmployee.findFirst({ where, orderBy, select: { id: true, systemId: true, active: true } })
      : await tenantDb({ tenantId, systemId: s.id }).hrEmployee.findFirst({ where, orderBy, select: { id: true, systemId: true, active: true } });
    if (row) return { employeeId: row.id, systemId: row.systemId, active: row.active };
  }
  return null;
}
