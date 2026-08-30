"use client";

import { useEffect, useRef } from "react";
import { markReadOnOpenAction } from "@/lib/modules/chat/actions";

/**
 * เปิดห้องแชท = อ่านแล้ว (ไม่ต้องกดปุ่มอะไร)
 *
 * 🔴 เจ้าของเจอจริง 30 ส.ค. 2026 — **บั๊กเดียวที่ทำให้พังสองอย่างพร้อมกัน**:
 *    เดิม `markRead` ถูกเรียกแค่ 2 ที่ คือ "หลังทีมกดตอบ" กับ "ปุ่มทำเป็นอ่านแล้ว" ⇒ ทีมที่
 *    เปิดอ่านเฉย ๆ ไม่เคยถูกนับว่าอ่าน ตัวนับ `staffUnreadCount` จึงค้างมากกว่า 0 ตลอด
 *      1. แจ้งเตือนขาเข้า de-dup ที่ "0 → 1" ⇒ ค้างแล้วไม่แจ้งอีกเลย
 *         (อาการ: "ข้อความมา แต่ไม่ได้รับ notification")
 *      2. `chat.conversation.read` ยิงเฉพาะตอนมี unread ค้าง ⇒ ไม่เคยยิงเลยสักครั้ง
 *         (อาการ: ติ๊กคู่ ✓✓ ฝั่งลูกค้าไม่เคยขึ้น)
 *
 * ⚠️ ยิงครั้งเดียวต่อการเปิดห้องหนึ่งครั้ง (`done` ref) — หน้านี้ revalidate หลัง action
 *    ถ้าไม่กัน จะกลายเป็นวงวน action → revalidate → action
 */
export function ChatMarkReadOnOpen({
  systemId,
  conversationId,
  unread,
}: {
  systemId: string;
  conversationId: string;
  /** 0 = ไม่มีอะไรค้าง ⇒ ไม่ต้องยิงอะไรเลย */
  unread: number;
}) {
  const done = useRef("");
  useEffect(() => {
    if (unread <= 0) return;
    if (done.current === conversationId) return;
    done.current = conversationId;
    void markReadOnOpenAction(systemId, conversationId);
  }, [systemId, conversationId, unread]);
  return null;
}

export default ChatMarkReadOnOpen;
