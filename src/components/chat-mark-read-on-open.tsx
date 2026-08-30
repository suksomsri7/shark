"use client";

import { useEffect, useRef } from "react";
import { markReadOnOpenAction } from "@/lib/modules/chat/actions";

/**
 * ตัดสินว่า "รอบนี้ต้องสั่งอ่านไหม" — แยกเป็นฟังก์ชันบริสุทธิ์ให้ข้อสอบเรียกตรง ๆ ได้
 *
 * 🔴 รอบแรกผมเขียน guard เป็น "ยิงครั้งเดียวต่อห้อง" ซึ่ง**แน่นเกินไป** (เจ้าของเจอจริง 30 ส.ค. 2026):
 *    ทีมเปิดห้องค้างไว้ → อ่านรอบแรกสำเร็จ → ลูกค้าส่งข้อความใหม่เข้ามา → ตัวนับขึ้นเป็น 1 อีก
 *    แต่ guard บล็อกไว้ ⇒ ไม่ถูกนับว่าอ่าน ⇒ ติ๊กค้างที่ ✓ ขีดเดียวทั้งที่ทีมกำลังมองอยู่
 * ⇒ กติกาที่ถูกคือ "ยิงหนึ่งครั้งต่อ **ช่วงที่มีข้อความค้าง** หนึ่งช่วง" — พอเคลียร์เป็น 0
 *    ต้องรีเซ็ตเพื่อรอรับรอบถัดไป
 */
export function nextMarkReadState(
  fired: string | null,
  key: string,
  unread: number,
): { fire: boolean; fired: string | null } {
  if (unread <= 0) return { fire: false, fired: fired === key ? null : fired };
  if (fired === key) return { fire: false, fired };
  return { fire: true, fired: key };
}

/**
 * เปิดห้องแชท = อ่านแล้ว (ไม่ต้องกดปุ่มอะไร) · รวมถึงข้อความที่เข้ามาระหว่างเปิดค้างไว้ด้วย
 *
 * 🔴 นี่คือจุดเดียวที่ทำให้พังสองอย่างพร้อมกันถ้าไม่มี:
 *    เดิม `markRead` ถูกเรียกแค่ "หลังทีมกดตอบ" กับ "ปุ่มทำเป็นอ่านแล้ว" ⇒ ทีมที่เปิดอ่านเฉย ๆ
 *    ไม่เคยถูกนับว่าอ่าน · `staffUnreadCount` ค้าง > 0 ตลอด แล้วลามเป็น
 *      1. แจ้งเตือนขาเข้า de-dup ที่ 0→1 ⇒ ค้างแล้วเงียบ
 *      2. `chat.conversation.read` ไม่เคยยิง ⇒ ติ๊กคู่ ✓✓ ฝั่งลูกค้าไม่เคยขึ้น
 *
 * หน้าแชทมี `<AutoRefresh>` ดึงข้อมูลใหม่เป็นระยะอยู่แล้ว ⇒ `unread` ที่ส่งเข้ามาจะขยับเองเมื่อ
 * มีข้อความใหม่ · effect จึงทำงานต่อได้โดยไม่ต้อง poll ซ้อนอีกชั้น
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
  const fired = useRef<string | null>(null);
  useEffect(() => {
    const key = `${systemId}:${conversationId}`;
    const next = nextMarkReadState(fired.current, key, unread);
    fired.current = next.fired;
    if (next.fire) void markReadOnOpenAction(systemId, conversationId);
  }, [systemId, conversationId, unread]);
  return null;
}

export default ChatMarkReadOnOpen;
