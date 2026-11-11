"use client";

// use-idle-lock.ts — ล็อกจอเมื่อไม่ใช้งาน (POS P1.15U · มติผู้คุมงาน 8)
//   กิจกรรม = pointer / keyboard / touch / wheel · ไม่มีกิจกรรมครบ N นาที ⇒ onIdle() · แท็บถูกซ่อนนานเกิน N นาที ⇒ onIdle() ตอนกลับมา
//   minutes 0 หรือ enabled false = ปิด · ตรวจทุก 10 วินาที (ไม่ใช่ timer ยาวตัวเดียว — เครื่องหลับ/แท็บพักแล้วตื่นยังจับได้)
import { useEffect, useRef } from "react";

export function useIdleLock(minutes: number, enabled: boolean, onIdle: () => void): void {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    if (!enabled || !(minutes > 0)) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    let hiddenAt: number | null = null;
    const touch = () => {
      last = Date.now();
    };
    const fire = () => {
      last = Date.now();
      cb.current();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - last >= limit) fire();
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else {
        const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
        hiddenAt = null;
        if (away >= limit || Date.now() - last >= limit) fire();
      }
    };
    const evs = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    for (const e of evs) window.addEventListener(e, touch, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      for (const e of evs) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [minutes, enabled]);
}
