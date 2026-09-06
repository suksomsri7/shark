"use client";

// SwipeEdge — "ปัดจากขอบซ้ายไปทางขวา = เปิดเมนู" (B3 · T7 · แบบ ledger/DESIGN-BRANDING.md §5 ภาพ 04)
//
// เจ้าของสั่ง 6 ก.ย.: มือถือ/แอปไม่มีปุ่ม ☰ อีกแล้ว ⇒ ท่านี้เป็น **ทางเดียว** ที่จะเปิดเมนูบนจอเล็กในแอป
// (เว็บบนจอเล็กยังมี ☰ สำรองไว้ — คนที่ปัดไม่ติดต้องไม่ติดกับดัก)
//
// กติกาของท่า (ตั้งใจให้แคบ — ท่าที่กว้างเกินจะไปแย่งการเลื่อนแนวนอนของเนื้อหา):
//   1. ต้องเริ่มแตะที่ **ขอบซ้าย ≤ 24px** เท่านั้น
//   2. ต้องลากไปทางขวา ≥ 60px และแนวนอนต้องชนะแนวตั้ง (กันคนตั้งใจ "เลื่อนหน้าลง" แล้วนิ้วเอียง)
//   3. ห้ามทำงานถ้าเริ่มใน input/textarea/select/[contenteditable] (คนกำลังลากเลือกข้อความ)
//   4. ห้ามทำงานถ้าเริ่มในของที่ "เลื่อนแนวนอนได้" (`[data-scroll-x]` เช่น แถบคอลัมน์บอร์ดงาน/แถบแท็บ)
//   5. จอ ≥ lg ที่มีแถบเมนูปักซ้าย/รางอยู่แล้ว ไม่ต้องใช้ท่านี้ (ยกเว้นในแอป เช่น iPad แนวนอน)
//
// 🔴 ไม่ผูก state ข้ามชั้น — ยิง callback ให้ AppShell เป็นคนเปิด drawer (แพตเทิร์นเดียวกับ `app:drawer-open`)

import { useEffect } from "react";

const EDGE_PX = 24;
const MIN_DX = 60;

export function SwipeEdge({ onOpen, alwaysOn = false }: { onOpen: () => void; alwaysOn?: boolean }) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let armed = false;

    const blocked = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-scroll-x]");
    };

    const onTouchStart = (e: TouchEvent) => {
      armed = false;
      // จอใหญ่ที่ไม่ได้อยู่ในแอป = มีแถบเมนู/รางให้กดอยู่แล้ว ไม่ต้องดักท่า
      if (!alwaysOn && window.innerWidth >= 1024) return;
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_PX) return;
      if (blocked(e.target)) return;
      startX = t.clientX;
      startY = t.clientY;
      armed = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx >= MIN_DX && dx > dy) {
        armed = false;
        onOpen();
      }
    };

    const disarm = () => {
      armed = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", disarm, { passive: true });
    window.addEventListener("touchcancel", disarm, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", disarm);
      window.removeEventListener("touchcancel", disarm);
    };
  }, [onOpen, alwaysOn]);

  return null;
}

export default SwipeEdge;
