// notify.ts — แจ้งเตือนของโมดูล "บอร์ดงาน" (พิมพ์เขียว §5.6/§7.4)
//
// 🔴 กติกาเหล็ก: ทุกใบเขียน `AppNotification.recipientUserId` เสมอ
//    ของเดิม (ก่อน K1.1) เขียนเป็นประกาศทั้งร้าน (recipientUserId = null) ⇒ ใครก็ตามที่เข้าแอปของร้านได้
//    เปิด /app/notifications แล้วเห็นชื่องาน+ชื่อบอร์ดของคนอื่นหมด (บั๊กความเป็นส่วนตัว)
//
// ย้ายออกมาจาก service.ts ใน K1.2 เพื่อให้ `cards.ts` เรียกได้โดยไม่เกิด import วงกลม
// (service.ts re-export `setCardAssignees` จาก cards.ts · cards.ts จึงห้าม import service.ts)

import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";

/**
 * แจ้ง "ได้รับมอบหมายงาน" ให้ผู้รับ 1 คน + ยิง outbox `kanban.card.assigned`
 *
 * idempotencyKey ของ outbox = `kanban.assign.<cardId>.<userId>` ⇒ มอบหมายคนเดิมซ้ำ (ถอดแล้วใส่กลับ)
 * จะไม่เพิ่ม event ใหม่ (emitOutbox เช็คก่อนสร้าง แล้วเงียบ) แต่ **แจ้งเตือนในแอปยังออกทุกครั้งที่เพิ่งถูกเพิ่ม**
 * — ตั้งใจ: คนถูกถอดออกแล้วใส่กลับต้องรู้ตัว ส่วน event ฝั่งระบบไม่ควรวิ่งซ้ำ
 */
export async function notifyCardAssigned(
  tenantId: string,
  systemId: string,
  card: { id: string; title: string; boardId: string },
  assigneeUserId: string,
): Promise<void> {
  const [board, membership] = await Promise.all([
    prisma.kanbanBoard.findFirst({ where: { id: card.boardId, tenantId }, select: { name: true } }),
    prisma.membership.findFirst({ where: { tenantId, userId: assigneeUserId }, include: { user: true } }),
  ]);
  const who = membership?.user.name ?? membership?.user.email ?? "พนักงาน";
  await prisma.$transaction(async (tx) => {
    await emitOutbox(tx, {
      tenantId,
      type: "kanban.card.assigned",
      idempotencyKey: `kanban.assign.${card.id}.${assigneeUserId}`,
      payload: { cardId: card.id, boardId: card.boardId, assigneeUserId },
      systemId,
    });
    await tx.appNotification.create({
      data: {
        tenantId,
        recipientUserId: assigneeUserId,
        title: "ได้รับมอบหมายงาน",
        body: `${who}: "${card.title}"${board ? ` · บอร์ด ${board.name}` : ""} · ดูงาน /app/sys/${systemId}/kanban/${card.boardId}`,
      },
    });
  });
  scheduleDrain();
}
