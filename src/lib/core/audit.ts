// audit.ts — ทางเดียวของแพลตฟอร์มในการเขียน `AuditLog`
//
// 🔴 ทำไมย้ายมาที่นี่ (K1.3): ต้นฉบับอยู่ `src/lib/modules/account/access.ts` — โมดูลอื่นที่อยาก
//    เขียน audit ต้อง import ข้ามโมดูล (`kanban→account`) ซึ่งข้อสอบสถาปัตยกรรม F2 ห้าม และ
//    "ก๊อปตรรกะไปไว้ในโมดูลตัวเอง" ก็ผิดหลักเดียวกัน ⇒ ยกขึ้น core ให้เป็นของกลาง
//    `account/access.ts` re-export ตัวเดิมต่อ ⇒ ผู้เรียกเดิม 20 กว่าจุดไม่ต้องแก้สักบรรทัด
import type { ActorType } from "@prisma/client";
import { prisma } from "./db";

/**
 * เขียน AuditLog (fire-and-forget ปลอดภัย — ไม่ throw ล้ม action หลัก)
 * 🔴 audit ล้มเหลวห้ามทำให้การกระทำหลักพัง (จงใจกลืน error) — แต่ยัง `await` เสมอ
 *    เพื่อให้ลำดับแถวใน DB ตรงกับลำดับที่เกิดจริง (ข้อสอบ/หน้าประวัติอ่านตามเวลา)
 */
export async function writeAudit(input: {
  tenantId: string;
  actorId?: string | null;
  /** ใครเป็นคนทำ — ค่าปริยาย USER · REST ผ่าน API key ส่ง "API_KEY" (actorId = ApiKey.id) */
  actorType?: ActorType;
  action: string; // "account.doc.issue" | "kanban.board.member.add" | ...
  targetType?: string; // "AccountDocument" | "KanbanBoard" | ...
  targetId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorType: input.actorType ?? "USER",
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
      },
    });
  } catch {
    // audit ล้มเหลวห้ามทำ action หลักพัง
  }
}
