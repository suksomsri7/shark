// useBoardLive.ts — "บอร์ดใบนี้มีของใหม่ไหม" ฝั่งเบราว์เซอร์ (K1.14 · D13)
//
// ═══ 🔴 กติกา ═══
//  1. **polling คือทางหลัก · realtime คือตัวเร่ง** — ไม่มี `ABLY_API_KEY` (สภาพ QC/วันนี้) ก็ต้องทำงานครบ
//     ⇒ ตั้งรอบ poll ทุก 5 วิ ไว้ก่อนเสมอ แล้วค่อยลดรอบลงเมื่อ subscribe ติดจริง
//     (ไม่ปิดรอบ poll ทิ้ง — ผู้ให้บริการหลุดกลางทางแล้วจอจะค้างถาวรโดยไม่มีใครรู้ · RT-5 ของข้อสอบแชท)
//  2. **หยุดเมื่อแท็บถูกซ่อน** — แท็บที่ค้างไว้ 8 ชั่วโมงคือการยิงเซิร์ฟเวอร์ตัวเองฟรี ๆ ชั่วโมงละ 720 ครั้ง
//     กลับมาเห็นแท็บ = รีเฟรชทันที 1 ครั้ง (ไม่ต้องรอครบรอบ)
//  3. **ไม่ทำงานตอนกำลังลากการ์ด** — `router.refresh()` กลางการลากจะสลับ state ใต้มือผู้ใช้
//     ⇒ ผู้เรียกส่ง `paused` เข้ามาได้ (BoardView ส่ง true ตอนลาก/เปิดหลังการ์ด)

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeBoard } from "@/lib/realtime/client";

/** รอบ poll ตามสัญญา K1.14: "≤ 5 วิ" */
export const BOARD_POLL_MS = 5000;
/** เมื่อ realtime ติดแล้ว ยังคงรอบ poll ไว้แบบห่าง ๆ เป็นตาข่ายรองรับ (ข้อ 1) */
export const BOARD_POLL_SLOW_MS = 60_000;
/** สัญญาณรัว ๆ (คนย้ายการ์ดติดกัน 10 ใบ) ต้องกลายเป็น refresh ไม่กี่ครั้ง ไม่ใช่ 10 ครั้ง */
const REFRESH_DEBOUNCE_MS = 400;

/**
 * เฝ้าบอร์ด 1 ใบ แล้วสั่ง `router.refresh()` เมื่อมีของใหม่
 *
 * @param boardId บอร์ดที่กำลังเปิดอยู่ ("" = ไม่ทำอะไรเลย)
 * @param opts.paused true = พักทั้ง poll และ realtime ชั่วคราว (เช่นระหว่างลากการ์ด)
 */
export function useBoardLive(boardId: string, opts: { paused?: boolean } = {}): void {
  const router = useRouter();
  const paused = opts.paused ?? false;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!boardId || typeof window === "undefined") return;

    let stopped = false;
    let live = false; // subscribe ติดแล้วหรือยัง (มีสัญญาณจริงวิ่งเข้ามาอย่างน้อย 1 ครั้ง)
    let timer: ReturnType<typeof setTimeout> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (stopped || pausedRef.current) return;
      if (document.hidden) return; // ข้อ 2 — แท็บซ่อนอยู่ ไม่ต้องดึงอะไรทั้งนั้น
      router.refresh();
    };

    const refreshSoon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };

    // ── รอบ poll (ทางหลัก) — ใช้ setTimeout ต่อกันแทน setInterval เพื่อให้เปลี่ยนความถี่ได้ระหว่างทาง
    const tick = () => {
      if (stopped) return;
      if (!document.hidden && !pausedRef.current) refresh();
      timer = setTimeout(tick, live ? BOARD_POLL_SLOW_MS : BOARD_POLL_MS);
    };
    timer = setTimeout(tick, BOARD_POLL_MS);

    // ── โหมด realtime (ตัวเร่ง) — ต่อไม่ติด/ไม่มีกุญแจ = เงียบ แล้วอยู่กับรอบ poll ต่อไป
    const unsubscribe = subscribeBoard(boardId, () => {
      if (stopped) return;
      live = true;
      refreshSoon();
    });

    // ── หยุด/กลับมาทำงานตามการมองเห็นของแท็บ (ข้อ 2)
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      refresh(); // กลับมาเห็นแท็บ = ดึงของล่าสุดทันที ไม่ต้องรอครบรอบ
      if (!timer) timer = setTimeout(tick, live ? BOARD_POLL_SLOW_MS : BOARD_POLL_MS);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [boardId, router]);
}

export default useBoardLive;
