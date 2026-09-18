// usePointerBoardDrag.ts — ลากการ์ดข้ามคอลัมน์ด้วย pointer events (ของกลาง · CRM v2 ใบ C1.5)
//
// ที่มา: ถอดออกมาจาก `src/components/kanban/BoardView.tsx` (K1.5) **ทั้งตรรกะเดิมทุกบรรทัด** — กระดานบอร์ดงานกับ
// กระดานดีลของ CRM ใช้ท่าลากตัวเดียวกัน (พิมพ์เขียว CRM §3.2 "dnd เดียวกับบอร์ดงาน") ไม่มีสองสำเนาให้เพี้ยนกัน
//
// ⚠️ ทำไม pointer events ไม่ใช่ HTML5 drag-and-drop: มือถือไม่ยิง dragstart เลย
// ⚠️ พฤติกรรมต้องเหมือนเดิมทุกจุด (บอร์ดงานเป็นผู้ใช้แรก):
//    เมาส์ขยับเกิน `thresholdPx` = เริ่มลาก · นิ้ว/ปากกากดค้าง `holdMs` = ยกการ์ด (เลื่อนเกิน 12px ก่อนครบ = เลื่อนจอ) ·
//    ปุ่ม/ลิงก์/ช่องกรอกบนการ์ดยังกดได้ · ลากออกนอกแถวคอลัมน์ = คงตำแหน่งเดิม · เส้นวางชดเชยความสูงของตัวเอง
// 🔴 hook นี้ไม่รู้จักโมดูลไหนเลย: รู้แค่ "คอลัมน์มี id + รายการการ์ดที่มี id" · การย้ายจริงเป็นของผู้เรียก (`onDrop`)
"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type BoardDragColumn<C extends { id: string }> = { id: string; cards: C[] };

export type BoardCardDrag<C> = {
  card: C;
  fromColumnId: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  over: { columnId: string; index: number } | null;
};

type PendingCard<C> = { kind: "card"; card: C; columnId: string; startX: number; startY: number; rect: DOMRect; touch: boolean };

export type UsePointerBoardDragOptions<C extends { id: string }> = {
  /** สถานะคอลัมน์ล่าสุด (ref ของผู้เรียก — อ่านตอนลากทุกครั้ง ไม่ผูกกับรอบ render) */
  columnsRef: { readonly current: readonly BoardDragColumn<C>[] };
  /** ลากได้ไหม (สิทธิ์) */
  canDrag: boolean;
  /** ระยะห่างระหว่างการ์ดในกอง (px) — ต้องตรงกับ `gap` ของคอลัมน์ ใช้คิดเรขาคณิตตอนลาก */
  gapPx: number;
  /** เมาส์: ขยับเกินนี้ = เริ่มลาก */
  thresholdPx: number;
  /** นิ้ว/ปากกา: กดค้างเท่านี้ก่อนยกการ์ด */
  holdMs: number;
  /** ปล่อยการ์ด — ผู้เรียกตัดสินเองว่าย้ายอย่างไร (optimistic + rollback) */
  onDrop: (card: C, fromColumnId: string, toColumnId: string, index: number) => void;
};

export function usePointerBoardDrag<C extends { id: string }>(opts: UsePointerBoardDragOptions<C>) {
  const { columnsRef, canDrag, gapPx, thresholdPx, holdMs, onDrop } = opts;
  const [drag, setDrag] = useState<BoardCardDrag<C> | null>(null);

  const columnEls = useRef(new Map<string, HTMLElement>());
  const cardEls = useRef(new Map<string, HTMLElement>());
  const indicatorEl = useRef<HTMLElement | null>(null);
  const pending = useRef<PendingCard<C> | null>(null);
  const dragRef = useRef<BoardCardDrag<C> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ตัวถอดตัวฟังของการลากที่ค้างอยู่ (ผู้เรียกใช้ช่องเดียวกันกับการลากชนิดอื่น เช่น ลากคอลัมน์) */
  const cleanup = useRef<(() => void) | null>(null);
  /** เวลาที่เพิ่งวางการ์ดเสร็จ — กัน `click` ที่ตามหลัง pointerup ไปเปิดการ์ดโดยไม่ได้ตั้งใจ */
  const draggedAt = useRef(0);

  /**
   * หา "คอลัมน์ + ช่องที่จะตกลง" จากตำแหน่งเมาส์
   * ⚠️ ชดเชยความสูงของเส้นวางที่แทรกอยู่ในกองแล้ว (ไม่งั้นการ์ดใต้เส้นถูกดันลง → index กระพริบสลับไปมา)
   */
  const targetAt = useCallback(
    (x: number, y: number, cardId: string, current: BoardCardDrag<C>["over"]): BoardCardDrag<C>["over"] => {
      let columnId: string | null = null;
      for (const [id, el] of columnEls.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left - 8 && x <= r.right + 8) {
          columnId = id;
          break;
        }
      }
      if (!columnId) return current; // ลากออกนอกแถวคอลัมน์ = คงตำแหน่งเดิมไว้
      const col = columnsRef.current.find((c) => c.id === columnId);
      if (!col) return current;
      const list = col.cards.filter((c) => c.id !== cardId);
      const shift =
        current && current.columnId === columnId && indicatorEl.current
          ? indicatorEl.current.getBoundingClientRect().height + gapPx
          : 0;
      const shiftFrom = current && current.columnId === columnId ? current.index : Number.POSITIVE_INFINITY;
      let index = list.length;
      for (let i = 0; i < list.length; i++) {
        const el = cardEls.current.get(list[i]!.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const top = i >= shiftFrom ? r.top - shift : r.top;
        if (y < top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { columnId, index };
    },
    [columnsRef, gapPx],
  );

  const endPointer = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    cleanup.current?.();
    cleanup.current = null;
    pending.current = null;
  }, []);

  const beginCardDrag = useCallback(
    (p: PendingCard<C>, x: number, y: number) => {
      const next: BoardCardDrag<C> = {
        card: p.card,
        fromColumnId: p.columnId,
        width: p.rect.width,
        height: p.rect.height,
        offsetX: p.startX - p.rect.left,
        offsetY: p.startY - p.rect.top,
        x,
        y,
        over: {
          columnId: p.columnId,
          index: columnsRef.current.find((c) => c.id === p.columnId)?.cards.findIndex((c) => c.id === p.card.id) ?? 0,
        },
      };
      dragRef.current = next;
      setDrag(next);
    },
    [columnsRef],
  );

  const onCardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, card: C, columnId: string) => {
      if (!canDrag || e.button !== 0) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select")) return; // ปุ่มบนการ์ดยังกดได้ตามปกติ
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.pointerType !== "mouse";
      pending.current = { kind: "card", card, columnId, startX: e.clientX, startY: e.clientY, rect, touch };
      if (touch) {
        holdTimer.current = setTimeout(() => {
          const p = pending.current;
          if (p?.kind === "card") beginCardDrag(p, p.startX, p.startY);
        }, holdMs);
      }

      const onMove = (ev: PointerEvent) => {
        const p = pending.current;
        const active = dragRef.current;
        if (active) {
          ev.preventDefault();
          const over = targetAt(ev.clientX, ev.clientY, active.card.id, active.over);
          const next = { ...active, x: ev.clientX, y: ev.clientY, over };
          dragRef.current = next;
          setDrag(next);
          return;
        }
        if (!p || p.kind !== "card") return;
        const moved = Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY);
        if (p.touch) {
          if (moved > 12 && holdTimer.current) {
            clearTimeout(holdTimer.current); // นิ้วเลื่อนก่อนครบเวลา = คนกำลังเลื่อนจอ ไม่ใช่จะลาก
            holdTimer.current = null;
            pending.current = null;
          }
          return;
        }
        if (moved > thresholdPx) beginCardDrag(p, ev.clientX, ev.clientY);
      };

      const onUp = (ev: PointerEvent) => {
        const active = dragRef.current;
        endPointer();
        if (!active) return; // ไม่ได้ลาก = ปล่อยให้ onClick ทำงานตามปกติ
        draggedAt.current = Date.now();
        dragRef.current = null;
        setDrag(null);
        const over = targetAt(ev.clientX, ev.clientY, active.card.id, active.over) ?? active.over;
        if (over) onDrop(active.card, active.fromColumnId, over.columnId, over.index);
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      cleanup.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
    },
    [beginCardDrag, canDrag, endPointer, holdMs, onDrop, targetAt, thresholdPx],
  );

  return {
    /** การ์ดที่กำลังลาก (null = ไม่ได้ลาก) — ใช้วาดเงาการ์ด + เส้นวาง */
    drag,
    onCardPointerDown,
    endPointer,
    cleanup,
    draggedAt,
    columnEls,
    cardEls,
    indicatorEl,
  };
}
