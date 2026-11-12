// hr-pos-evidence.ts — HR H2.6 ▸ R11 หลักฐานจาก POS สำหรับคำขอแก้เวลา (composition root นอก src/lib/modules — อ่านอย่างเดียว)
//
// 🔴 ทำไมอยู่ที่นี่: บนฐานนี้ POS ไม่มี facade/export ที่บอก "กะเครื่องขายที่ผู้ใช้คนนี้เปิด/ปิด" (pos/index.ts ไม่มีตัวอ่านกะต่อผู้ใช้ ·
//    pos-seam*.ts เป็นของ HR ฝั่งเดียว) และ hr ห้าม import pos (fitness F2) ⇒ ตัวอ่านเล็กที่สุดอยู่ที่นี่
// 🔴 ทำไม prisma ตรง (แบบ approval-effects.ts / pos-board-bridges.ts): PosShift เป็นตารางแกนระบบ (systemId = ระบบ POS) แต่ผู้ถาม (HR) ไม่รู้ระบบ POS
//    ⇒ tenantDb ต้องการ systemId · อ่านอย่างเดียวและผูก tenantId เองทุกครั้ง (ข้ามร้านไม่ได้)
// 🔴 คืนเฉพาะ เลขกะ · เวลาเปิด · เวลาปิด · ปิดโดยระบบ — ไม่มีเงิน (ยอดเงินทอน/นับเงิน/ส่วนต่าง) · ไม่มีเครื่อง · ไม่มีสาขา · ไม่มีผู้ใช้อื่น
// 🔴 หลักฐานประกอบการตัดสินเท่านั้น: ไม่อนุมัติเอง ไม่บล็อก — hr/correction.ts เก็บ snapshot ตอนยื่น (evidenceJson) และตอนใช้ผลไม่อ่านไฟล์นี้
// 🔴 หนี้ D1: ไม่มีบันทึกการออกจากระบบของเครื่อง POS ⇒ deviceLogout = null เสมอ
import { prisma } from "@/lib/core/db";

export type PosShiftEvidence = { shiftNo: number; openedAt: string; closedAt: string | null; forced: boolean };
const MAX_SHIFTS = 5;

/** กะเครื่องขายที่ผู้ใช้คนนี้เปิดหรือปิด ซึ่งทับช่วง [from, to) — เรียงตามเวลาเปิด ไม่เกิน 5 กะ */
export async function posShiftEvidence(input: { tenantId: string; userId: string | null; from: Date; to: Date }): Promise<PosShiftEvidence[]> {
  const tenantId = typeof input?.tenantId === "string" ? input.tenantId : "";
  const userId = typeof input?.userId === "string" ? input.userId : "";
  const { from, to } = input ?? {};
  if (!tenantId || !userId || !(from instanceof Date) || !(to instanceof Date) || !(from.getTime() < to.getTime())) return [];
  const rows = await prisma.posShift.findMany({
    where: {
      tenantId,
      OR: [{ openedByUserId: userId }, { closedByUserId: userId }],
      openedAt: { lt: to },
      AND: [{ OR: [{ closedAt: null }, { closedAt: { gte: from } }] }],
    },
    select: { shiftNo: true, openedAt: true, closedAt: true, closedByUserId: true, status: true },
    orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    take: MAX_SHIFTS,
  });
  return rows.map((r) => ({
    shiftNo: r.shiftNo,
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    forced: String(r.status) === "FORCE_CLOSED" || (!!r.closedAt && !r.closedByUserId),
  }));
}
