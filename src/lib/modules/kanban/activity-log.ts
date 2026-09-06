// activity-log.ts — ตัวเขียนประวัติกิจกรรม (K1.10) แยกจาก `activity.ts` ที่เป็นตัวอ่าน
//
// 🔴 ทำไมต้องแยกไฟล์: ตัว **อ่าน** ต้องตรวจสิทธิ์ ⇒ `activity.ts` import `members.ts`
//    แต่ `members.ts` เองก็ต้องเขียนกิจกรรม (เพิ่ม/ถอดสมาชิก) ⇒ ถ้าเขียนรวมไฟล์เดียวจะเกิด import
//    วนกลับ (activity ↔ members) ซึ่ง bundler ฝั่ง client/server แก้ไม่เหมือนกัน = ระเบิดเวลา
//    ⇒ ตัวเขียนอยู่ที่นี่ (ไม่ import อะไรในโมดูลเลย) · `activity.ts` re-export ออกไปให้ผู้เรียกใช้
//    ชื่อเดียวกับสัญญา §K1.10 (`logActivity` จาก `activity.ts` ก็ยังใช้ได้เหมือนเดิม)
// 🔴 append-only: ไฟล์นี้มีแต่ `create` — ไม่มี update/delete ที่ไหนเลยในโมดูล

import type { KanbanActivityType, Prisma } from "@prisma/client";

/**
 * ตัวเชื่อมฐานข้อมูลที่ `logActivity` รับได้ — ทั้ง `prisma` และ `tx` ของทรานแซกชัน
 * (ประกาศเป็น structural type ⇒ ไม่ต้อง import PrismaClient เต็มตัวเข้ามาในโมดูล)
 */
export type ActivityDb = Pick<Prisma.TransactionClient, "kanbanActivity">;

export type LogActivityInput = {
  tenantId: string;
  boardId: string;
  /** null/ไม่ส่ง = กิจกรรมระดับบอร์ด (คอลัมน์/สมาชิก/บอร์ดเอง) */
  cardId?: string | null;
  /** null = ระบบเป็นคนทำ (cron/automation/นำเข้า) */
  actorUserId?: string | null;
  type: KanbanActivityType;
  /** รายละเอียดต่อชนิด — เก็บ **id** ไม่ใช่ชื่อ (ชื่อ resolve สดตอนอ่าน) */
  data?: Prisma.InputJsonValue;
  /** ตั้งเวลาเอง (ใช้ตอน backfill/นำเข้า) — ปกติไม่ต้องส่ง */
  createdAt?: Date;
};

// ── นาฬิกาที่ "ไม่ย้อนและไม่ซ้ำ" ภายในโปรเซสเดียว ──
// 🔴 หนึ่งการกระทำเขียนได้หลายแถวใน tx เดียว (แก้ชื่อ + ตั้งกำหนดส่ง = UPDATED แล้ว DUE_SET)
//    ถ้าปล่อยให้ทั้งคู่ได้ `now()` ของ DB เท่ากันเป๊ะ (TIMESTAMP(3) = ระดับมิลลิวินาที) ลำดับที่ผู้ใช้เห็น
//    จะสลับไปมาแบบสุ่มตามที่ Postgres คืนแถวมา ⇒ ประวัติอ่านแล้วงง
//    ⇒ ประทับเวลาจากฝั่งแอป และบังคับให้ห่างกันอย่างน้อย 1 มิลลิวินาทีเสมอ
let lastStampMs = 0;
function stamp(): Date {
  const now = Date.now();
  lastStampMs = now > lastStampMs ? now : lastStampMs + 1;
  return new Date(lastStampMs);
}

/**
 * บันทึกกิจกรรม 1 รายการ — **เรียกใน tx เดียวกับงานจริงเสมอ**
 *
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   const card = await tx.kanbanCard.update(…);
 *   await logActivity(tx, { tenantId, boardId, cardId: card.id, actorUserId, type: "CARD_UPDATED", data: { fields } });
 * });
 * ```
 */
export async function logActivity(db: ActivityDb, input: LogActivityInput): Promise<void> {
  await db.kanbanActivity.create({
    data: {
      tenantId: input.tenantId,
      boardId: input.boardId,
      cardId: input.cardId ?? null,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      data: input.data ?? {},
      createdAt: input.createdAt ?? stamp(),
    },
  });
}

