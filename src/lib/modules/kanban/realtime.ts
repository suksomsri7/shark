// realtime.ts — สัญญาณ "บอร์ดนี้มีของใหม่" ของโมดูลบอร์ดงาน (K1.14 · D13)
//
// ═══ 🔴 กติกาที่ไฟล์นี้ถือไว้ ═══
//  1. **realtime ไม่ใช่เงื่อนไขของความถูกต้อง** — มันคือ "ตัวเร่ง" เท่านั้น
//     ไม่มี `ABLY_API_KEY` / ผู้ให้บริการล่ม / โควตาหมด ⇒ จอยังเห็นของใหม่จากรอบ poll 5 วิ เหมือนเดิม
//     ⇒ `publishBoardSignal()` **ห้าม throw ไม่ว่ากรณีใด** และห้ามบล็อกผู้เรียก
//  2. ทุก callsite อยู่ **หลัง commit** (นอก `$transaction`) เสมอ — ยิงสัญญาณใน tx แล้ว tx ถูก rollback
//     = จอทุกเครื่องรีเฟรชไปเห็น "ของที่ไม่มีจริง" · และถ้ามันโยน error ขึ้นไป งานที่บันทึกสำเร็จแล้ว
//     จะถูกรายงานกลับว่า "ไม่สำเร็จ" แล้วผู้ใช้กดซ้ำ ⇒ ของซ้ำ (บทเรียนเดียวกับ `sendReplyAction` 1 ก.ย.)
//  3. **ห้ามส่งเนื้อหางานออกนอกบ้าน** — payload มีแค่ `{type, ids…, at}` ไม่มีชื่อการ์ด/รายละเอียด/ชื่อคน
//     กรองซ้ำอีกชั้นที่ขอบ (`sanitizeSignal` ใน `src/lib/realtime/events.ts`) ⇒ ผู้เรียกเผลอยัดชื่อมาก็ไม่รั่ว
//  4. ชื่อช่อง **ต้องมี tenantId เสมอ** — คนละร้านคนละช่อง (กันฟังข้ามร้านด้วยการเดา boardId)
//
// ไฟล์นี้ไม่แตะฐานข้อมูลเลย (ไม่ต้อง import `./db`) — มันแค่ประกอบชื่อช่องกับ payload

import { publish, EV_KANBAN_BOARD } from "@/lib/realtime";
import type { KanbanCtx } from "./types";

/** ชนิดสัญญาณของบอร์ด — ตั้งชื่อชุดเดียวกับ activity/outbox เพื่อให้อ่านลอกกันได้ */
export type BoardSignalType =
  | "card.created"
  | "card.updated"
  | "card.moved"
  | "card.archived"
  | "card.restored"
  | "card.labels"
  | "card.assignees"
  | "card.comment"
  | "card.checklist"
  | "column.changed";

// ชื่อ event ที่วิ่งบนช่องประกาศอยู่ที่ `src/lib/realtime/events.ts` (ไฟล์ pure ที่ทั้งเซิร์ฟเวอร์และ
// เบราว์เซอร์ import ร่วมกัน) — re-export ให้ผู้เรียกในโมดูลนี้ใช้ชื่อเดียวโดยไม่ต้องรู้ว่าอยู่ไฟล์ไหน
export { EV_KANBAN_BOARD };

/**
 * payload ขั้นต่ำที่ยอมให้ออกไปนอกบ้าน — "ตัวชี้" ล้วน ๆ
 * 🔴 ห้ามเพิ่มสนามที่เป็นข้อความของผู้ใช้ (title/description/body/ชื่อคน) ลงในชนิดนี้เด็ดขาด
 *    จอที่ได้สัญญาณจะไป `router.refresh()` แล้วดึงเนื้อหาจากเซิร์ฟเวอร์เราเองอยู่แล้ว
 */
export type BoardSignal = {
  type: BoardSignalType;
  boardId?: string;
  columnId?: string;
  cardId?: string;
  /** เวลาที่สัญญาณเกิด (ISO) — จอใช้ทิ้งสัญญาณเก่าค้างท่อ */
  at: string;
};

/**
 * ชื่อช่องของบอร์ดหนึ่งใบ — `kanban:<tenantId>:<boardId>`
 * 🔴 มี tenantId เสมอ: boardId เป็น cuid ที่เดาไม่ได้ก็จริง แต่ "เดาไม่ได้" ไม่ใช่ระบบสิทธิ์
 *    (และ token ที่ออกให้เบราว์เซอร์ผูก capability กับชื่อช่องนี้ตัวเดียว)
 */
export function kanbanChannel(tenantId: string, boardId: string): string {
  return `kanban:${tenantId}:${boardId}`;
}

/** ประกอบ payload — ตัดสนามที่ไม่ได้ประกาศทิ้งทั้งหมด (บัญชีขาว ไม่ใช่บัญชีดำ) */
export function boardSignal(input: {
  type: BoardSignalType;
  boardId?: string | null;
  columnId?: string | null;
  cardId?: string | null;
}): BoardSignal {
  const out: BoardSignal = { type: input.type, at: new Date().toISOString() };
  if (input.boardId) out.boardId = input.boardId;
  if (input.columnId) out.columnId = input.columnId;
  if (input.cardId) out.cardId = input.cardId;
  return out;
}

/**
 * ยิงสัญญาณขึ้นช่องของบอร์ด — **เรียกหลัง commit เท่านั้น** และ **ไม่มีวัน throw**
 *
 * ผู้เรียกไม่ต้อง `await` ก็ได้ (fire-and-forget) แต่ถ้า await ก็ไม่เสียหาย — ชั้นล่าง
 * (`src/lib/realtime/index.ts`) คืนทันทีเมื่อยังไม่มีกุญแจ ซึ่งเป็นสภาพปกติของ QC/dev วันนี้
 */
export async function publishBoardSignal(
  ctx: Pick<KanbanCtx, "tenantId">,
  boardId: string,
  signal: BoardSignal,
): Promise<void> {
  try {
    if (!ctx?.tenantId || !boardId) return;
    await publish(kanbanChannel(ctx.tenantId, boardId), EV_KANBAN_BOARD, {
      ...signal,
      boardId: signal.boardId ?? boardId,
    });
  } catch {
    // ผู้ให้บริการล่ม · โควตาหมด · เน็ตขาด — เงียบทั้งหมด (ข้อ 1 ด้านบน)
  }
}
