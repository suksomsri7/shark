// HR H3.4-YTD ▸ ตัวอ่านยอดยกมาต้นปี + ล็อก hr:ytd — ที่เดียวของทุกผู้เรียก (payroll.ts · filings/service.ts · reports.ts · payslip.ts · payroll-opening.ts)
//   DB ล้วน: import แค่ type ของ Prisma — ไม่ import payroll.ts / filings / self (ไม่มีวงโหลด) · ทุกคำสั่งใช้ client/tx ที่ผู้เรียกส่งมา
//   "ยังมีผล" = supersededAt IS NULL (partial unique 1 แถวต่อ ระบบ·พนักงาน·ปี) · ยอดยกมาศูนย์ก็เป็นยอดยกมา (มติ fix round 1a) ◂
import type { Prisma } from "@prisma/client";

type Ctx = { tenantId: string; systemId: string };
type Reader = Pick<Prisma.TransactionClient, "hrPayrollOpeningYtd">;
export type LiveOpeningRow = { id: string; rev: number; employeeId: string; taxYear: number; asOfDay: string; months: number; incomeSatang: number; whtSatang: number; ssoSatang: number };

/** แถวที่ยังมีผล (ปีเดียว หรือทุกปี · ทุกคน หรือเฉพาะ employeeIds) — asOfDay เป็น "YYYY-MM-DD" */
export async function liveOpeningsIn(db: Reader, ctx: Ctx, q: { taxYear?: number; employeeIds?: readonly string[] } = {}): Promise<LiveOpeningRow[]> {
  if (q.employeeIds && !q.employeeIds.length) return [];
  const rows = await db.hrPayrollOpeningYtd.findMany({
    where: {
      tenantId: ctx.tenantId, systemId: ctx.systemId, supersededAt: null,
      ...(q.taxYear === undefined ? {} : { taxYear: q.taxYear }),
      ...(q.employeeIds ? { employeeId: { in: [...q.employeeIds] } } : {}),
    },
    select: { id: true, rev: true, employeeId: true, taxYear: true, asOfDay: true, months: true, incomeSatang: true, whtSatang: true, ssoSatang: true },
    orderBy: [{ employeeId: "asc" }, { taxYear: "asc" }],
  });
  return rows.map((r) => ({ ...r, asOfDay: r.asOfDay.toISOString().slice(0, 10) }));
}

/** hr:ytd:<ระบบ>:<ปีภาษี> (seed 0) — ล็อกสุดท้ายของผู้เขียนยอดยกมา · ผู้สร้าง/คิดใหม่/อนุมัติรอบ · ผู้ออก 50 ทวิ */
export async function lockYtdInTx(tx: Pick<Prisma.TransactionClient, "$queryRaw">, ctx: Ctx, taxYear: number): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "x" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`hr:ytd:${ctx.systemId}:${taxYear}`}, 0))) AS "l"`;
}
