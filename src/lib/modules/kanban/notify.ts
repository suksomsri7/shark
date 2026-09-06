// notify.ts — ตัวช่วยกลางของการแจ้งเตือนโมดูล "บอร์ดงาน" (พิมพ์เขียว §5.6/§7.4 · D5)
//
// 🔴 กติกาเหล็ก: ทุกใบเขียน `AppNotification.recipientUserId` เสมอ
//    ของเดิม (ก่อน K1.1) เขียนเป็นประกาศทั้งร้าน (recipientUserId = null) ⇒ ใครก็ตามที่เข้าแอปของร้านได้
//    เปิด /app/notifications แล้วเห็นชื่องาน+ชื่อบอร์ดของคนอื่นหมด (บั๊กความเป็นส่วนตัว)
// 🔴 K1.8: push ก็ต้อง "ยิงรายคน" ด้วย (`sendPushToUser`) — ยิงทั้งร้านคือช่องโหว่เดียวกันบนจอล็อกมือถือ
//
// ช่องทางตาม D5 = ในแอป (AppNotification) + push รายคน + อีเมล (เฉพาะเมื่อเสียบ RESEND แล้ว)
// ทุกช่องทางที่ "ออกนอกเครื่อง" (push/อีเมล) เป็น best-effort: ล้มแล้วต้องไม่ทำให้งานหลักล้มตาม
// และต้องเรียกจาก **นอกทรานแซกชัน** เสมอ (network call ขัง Neon pool)
//
// ย้ายออกมาจาก service.ts ใน K1.2 เพื่อให้ `cards.ts` เรียกได้โดยไม่เกิด import วงกลม
// (service.ts re-export `setCardAssignees` จาก cards.ts · cards.ts จึงห้าม import service.ts)

import { emitOutbox } from "@/lib/core/outbox";
import { sendPushToUser } from "@/lib/core/push";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";

/** ลิงก์ลึกไปหลังการ์ดใบนั้นโดยตรง (หน้าบอร์ดอ่าน `?card=` แล้วเปิดหลังการ์ดให้เลย · K1.6) */
export function cardLink(systemId: string, boardId: string, cardId: string): string {
  return `/app/sys/${systemId}/kanban/b/${boardId}?card=${cardId}`;
}

export type KanbanNotifyInput = {
  tenantId: string;
  systemId: string;
  /** ผู้รับ 1 คน — ห้ามเป็น null (ประกาศทั้งร้านไม่ใช่ธุรกิจของโมดูลนี้) */
  recipientUserId: string;
  title: string;
  body: string;
  /** payload ของ push (แอปมือถือใช้เปิดหน้าตรง) */
  data?: Record<string, string>;
  /** ส่งอีเมลด้วยไหม — ส่งจริงเฉพาะเมื่อ `RESEND_API_KEY` ถูกตั้งค่าแล้วเท่านั้น */
  email?: boolean;
};

/**
 * แจ้งเตือน "คนเดียว" ครบทุกช่องทางของโมดูล — จุดเดียวที่โมดูลนี้สร้าง `AppNotification`
 *
 * ในแอป = ต้องสำเร็จ (โยนต่อถ้าเขียนไม่ได้ — ผู้เรียกรู้ว่าแจ้งไม่ถึง)
 * push/อีเมล = best-effort (ล้มแล้วกลืน ไม่พางานหลักล้ม · ตัวส่งเองก็ log ให้แล้ว)
 */
export async function notifyKanbanUser(input: KanbanNotifyInput): Promise<void> {
  await prisma.appNotification.create({
    data: {
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      title: input.title,
      body: input.body,
    },
  });

  try {
    await sendPushToUser(
      input.recipientUserId,
      { title: input.title, body: input.body, data: input.data },
      { tenantId: input.tenantId },
    );
  } catch {
    // ตัวส่ง push กลืน error ของตัวเองอยู่แล้ว — ด่านนี้กันแค่กรณี import/โค้ดพัง
  }

  if (input.email) {
    try {
      // 🔴 โหลด env/email แบบ lazy — import static ทำให้ทุกที่ที่ import โมดูล kanban (รวม fitness F10.1 / AI tools) ต้องมี env ครบ
      const { emailEnabled } = await import("@/lib/env");
      if (!emailEnabled) return;
      const { sendEmail } = await import("@/lib/core/email");
      // B4: หัวเรื่องขึ้นต้นด้วยชื่อกิจการ — ผู้ใช้หลายร้านแยกอีเมลออกจากกันได้ในกล่องจดหมายเดียว
      const { getBrandingTokens } = await import("@/lib/branding/service");
      const [user, tokens] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.recipientUserId },
          select: { email: true },
        }),
        getBrandingTokens(input.tenantId),
      ]);
      if (user?.email) {
        await sendEmail(user.email, `[${tokens.displayName}] ${input.title}`, input.body);
      }
    } catch {
      // อีเมลเป็นช่องทางเสริม — ล้มแล้วเงียบ (sendEmail ลง OpsEvent ให้เองเมื่อ Resend ตอบไม่ ok)
    }
  }
}

/**
 * แจ้ง "ได้รับมอบหมายงาน" ให้ผู้รับ 1 คน + ยิง outbox `kanban.card.assigned`
 *
 * idempotencyKey ของ outbox = `kanban.assign.<cardId>.<userId>` ⇒ มอบหมายคนเดิมซ้ำ (ถอดแล้วใส่กลับ)
 * จะไม่เพิ่ม event ใหม่ (emitOutbox เช็คก่อนสร้าง แล้วเงียบ) แต่ **แจ้งเตือนในแอปยังออกทุกครั้งที่เพิ่งถูกเพิ่ม**
 * — ตั้งใจ: คนถูกถอดออกแล้วใส่กลับต้องรู้ตัว ส่วน event ฝั่งระบบไม่ควรวิ่งซ้ำ
 *
 * K1.8: ตัวนี้เดินผ่าน `notifyKanbanUser` แล้ว ⇒ ได้ push รายคน + อีเมลไปด้วยโดยไม่ต้องแก้ผู้เรียก
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
  const link = cardLink(systemId, card.boardId, card.id);
  await prisma.$transaction(async (tx) => {
    await emitOutbox(tx, {
      tenantId,
      type: "kanban.card.assigned",
      idempotencyKey: `kanban.assign.${card.id}.${assigneeUserId}`,
      payload: { cardId: card.id, boardId: card.boardId, assigneeUserId },
      systemId,
    });
  });
  await notifyKanbanUser({
    tenantId,
    systemId,
    recipientUserId: assigneeUserId,
    title: "ได้รับมอบหมายงาน",
    body: `${who}: "${card.title}"${board ? ` · บอร์ด ${board.name}` : ""} · ดูงาน ${link}`,
    data: { cardId: card.id, boardId: card.boardId, systemId },
  });
  scheduleDrain();
}
