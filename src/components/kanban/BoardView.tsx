// BoardView.tsx — เวทีบอร์ด + ลากวางด้วย pointer events (K1.5 · client component ตัวแรกของโมดูล)
//
// หน้าที่: ถือ state ของบอร์ดทั้งใบ · ลากการ์ด/คอลัมน์ · ย้ายแบบ optimistic แล้ว rollback + toast เมื่อ
// server ปฏิเสธ · เพิ่มการ์ดท้ายคอลัมน์ · เปิด "หลังการ์ด" ผ่าน `?card=` (ตัวจริงอยู่ K1.6)
//
// ⚠️ ทำไม pointer events ไม่ใช่ HTML5 drag-and-drop: มือถือไม่ยิง dragstart เลย (K1.13 ใช้ท่าเดียวกันนี้ต่อ)
// ⚠️ หน้านี้อยู่ที่ `/app/sys/{systemId}/kanban/b/{boardId}` และเป็นหน้าเดียวที่เมนูซ้ายยุบเป็น
//    "รางไอคอน" 56px (ดู `src/components/app-shell/NavRail.tsx` — ตัดสินจาก pathname ที่ขึ้นต้น `/kanban/b/`)
// ⚠️ ห้ามคิดเลขตำแหน่งเอง — ส่งแค่ id ของเพื่อนบ้าน (beforeCardId/afterCardId) ให้ `moves.ts` เป็นคนคิด
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { Card } from "./Card";
import { CardBack, type CardBackHandlers } from "./CardBack";
import { Column, type ColumnHandlers } from "./Column";
import { FilterBar } from "./FilterBar";
import { KanbanIcon } from "./KanbanIcon";
import { MobileBoard } from "./MobileBoard";
// K1.14 — ปุ่มลัดคีย์บอร์ด (§5.6) + "บอร์ดนี้มีของใหม่" (realtime/polling · D13)
import { Shortcuts, type ShortcutCommand } from "./Shortcuts";
import { useBoardLive } from "./useBoardLive";
import {
  archiveColumnAction,
  archiveWithUndoAction,
  completeCardAction,
  createCardAction,
  createCardFromTemplateAction,
  moveAllCardsAction,
  moveCardAction,
  moveColumnAction,
  renameBoardAction,
  renameColumnAction,
  setColumnDoneAction,
  setColumnWipAction,
  starBoardAction,
  undoAction,
  unwatchAction,
  watchAction,
} from "@/lib/modules/kanban/actions";
import { filterBoardCards, hasAnyFilter, type BoardFilters } from "@/lib/modules/kanban/filters";
import type { BoardCardDto, BoardColumnDto, BoardLabelDto, BoardViewDto, CardTemplateDto, SavedViewDto } from "@/lib/modules/kanban/types";

/** ระยะหว่างการ์ดในคอลัมน์ (ต้องตรงกับ `gap` ของกองการ์ดใน Column.tsx — ใช้คิดเรขาคณิตตอนลาก) */
const CARD_GAP = 7;
/** เมาส์: ขยับเกินนี้ = เริ่มลาก (กันคลิกเปิดการ์ดกลายเป็นลาก) */
const DRAG_THRESHOLD_PX = 4;
/** นิ้ว/ปากกา: กดค้างเท่านี้ก่อนถึงจะยกการ์ด (ไม่งั้นเลื่อนจอไม่ได้) */
const HOLD_MS = 300;

type CardDrag = {
  card: BoardCardDto;
  fromColumnId: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  over: { columnId: string; index: number } | null;
};

type Pending =
  | { kind: "card"; card: BoardCardDto; columnId: string; startX: number; startY: number; rect: DOMRect; touch: boolean }
  | { kind: "column"; columnId: string; startX: number; startY: number; touch: boolean };

const TOAST_MS = 4200;
/** toast ปัดเสร็จ/เก็บ (K1.13) — โชว์ปุ่ม "เลิกทำ" 5 วิ ตามสัญญา (token จริงอยู่ได้ 5 นาที — `my-tasks.ts`) */
const UNDO_TOAST_MS = 5000;

// ── K1.13: จอ < 640px = มือถือ (MobileBoard.tsx) — `useSyncExternalStore` กัน hydration mismatch
// (SSR/ครั้งแรกที่ hydrate ใช้ snapshot ปลอม `false` เสมอ แล้วค่อยอ่านค่าจริงหลัง mount) ──
const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileBoard(): boolean {
  return useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
}

export function BoardView({
  board,
  initialCardId = null,
  filters = {},
  shortcutsEnabled = true,
  savedViews = [],
  cardTemplates = [],
}: {
  board: BoardViewDto;
  initialCardId?: string | null;
  /** K1.11 — ตัวกรองที่มาจาก URL (`page.tsx` parse `searchParams` แล้วส่งลงมา) */
  filters?: BoardFilters;
  /** K1.14 — user preference `kanbanShortcuts` (server อ่านให้แล้วส่งลงมา) · false = ไม่ผูกตัวฟังคีย์เลย */
  shortcutsEnabled?: boolean;
  /** K2.5 — มุมมองที่บันทึกไว้ของบอร์ดนี้ (ทั้งทีม + ของตัวเอง) ส่งลง `BoardHeader` */
  savedViews?: SavedViewDto[];
  /** K2.7 — เทมเพลตการ์ดของบอร์ด (ปุ่ม "จากเทมเพลต ▾" ในทุกคอลัมน์) */
  cardTemplates?: CardTemplateDto[];
}) {
  const nowMs = Date.parse(board.now);
  const router = useRouter();
  const pathname = usePathname();
  const [columns, setColumns] = useState<BoardColumnDto[]>(board.columns);
  const [boardName, setBoardName] = useState(board.name);
  const [starred, setStarred] = useState(board.starred);
  // K2.11 — คอลัมน์ที่ฉันติดตาม (ของส่วนตัว · โหลดมากับบอร์ด แล้วอัปเดตแบบ optimistic)
  const [watchedColumns, setWatchedColumns] = useState<string[]>(board.watchedColumnIds);
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const [colDragId, setColDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(initialCardId);
  // K1.6: `getBoardView` ไม่ส่งการ์ดที่ ARCHIVED มาด้วย — เก็บ "ภาพตอนเปิด" ไว้ต่างหากจาก `columns`
  // เพื่อให้หลังการ์ดยังโชว์ต่อได้ (แถบ "อยู่ในคลัง" + ปุ่มกู้คืน) แม้การ์ดใบนั้นเพิ่งถูกเก็บออกจากกองบนบอร์ด
  const [openCardSnapshot, setOpenCardSnapshot] = useState<BoardCardDto | null>(null);
  const [openColumnMeta, setOpenColumnMeta] = useState<{ id: string; name: string } | null>(null);
  const [labels, setLabels] = useState<BoardLabelDto[]>(board.labels);
  // K1.13: toast "เลิกทำ" ของปัดขวา/ซ้ายบนมือถือ — คนละอันจาก `toast` ทั่วไป (มีปุ่มกดของตัวเอง)
  const [undoToast, setUndoToast] = useState<{ message: string; token: string; snapshot: BoardColumnDto[] } | null>(null);
  // K1.14 — "การ์ดที่ชี้อยู่" ของปุ่มลัด (j/k เลื่อน · t/d/l/c/n ทำงานกับใบนี้) · ผูกกับโฟกัสจริงของ DOM
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  /** แผงที่ต้องเปิดทันทีเมื่อหลังการ์ดโผล่ (มาจากปุ่มลัด t/d/l) */
  const [cardBackPanel, setCardBackPanel] = useState<"title" | "due" | "labels" | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobileBoard();
  const [, startTransition] = useTransition();

  const columnsRef = useRef<BoardColumnDto[]>(board.columns);
  const setCols = useCallback((next: BoardColumnDto[]) => {
    columnsRef.current = next;
    setColumns(next);
  }, []);

  const columnEls = useRef(new Map<string, HTMLElement>());
  const cardEls = useRef(new Map<string, HTMLElement>());
  const indicatorEl = useRef<HTMLElement | null>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<CardDrag | null>(null);
  const colDragRef = useRef<{ columnId: string; order: string[] } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  /** เวลาที่เพิ่งวางการ์ดเสร็จ — กัน `click` ที่ตามหลัง pointerup ไปเปิดหลังการ์ดโดยไม่ได้ตั้งใจ */
  const draggedAt = useRef(0);

  // เปิดตรงจาก URL (`?card=`) ตอนโหลดหน้าครั้งแรก — หา snapshot + คอลัมน์ปัจจุบันจากข้อมูลที่ได้มาตอนโหลด
  useEffect(() => {
    if (!initialCardId) return;
    for (const col of board.columns) {
      const found = col.cards.find((c) => c.id === initialCardId);
      if (found) {
        setOpenCardSnapshot(found);
        setOpenColumnMeta({ id: col.id, name: col.name });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ใช้ค่าตอน mount ครั้งแรกเท่านั้น (deep link)
  }, []);

  const canEdit = board.role === "EDITOR" || board.role === "ADMIN";
  const isAdmin = board.role === "ADMIN";
  const systemId = board.systemId;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  /** คืนบอร์ดกลับสภาพก่อนหน้า (rollback) — ใช้ทุกครั้งที่ server ปฏิเสธหรือเน็ตล่ม */
  const rollback = useCallback(
    (snapshot: BoardColumnDto[], message: string) => {
      setCols(snapshot);
      showToast(message);
    },
    [setCols, showToast],
  );

  // ───────────────────────── K1.13: ปัดขวา=เสร็จ / ปัดซ้าย=เก็บ (มือถือ) + undo 5 วิ ─────────────────────────
  // เอาการ์ดออกจาก state ทันที (optimistic) แล้วยิง action จริง — เก็บ "ภาพก่อนปัด" (snapshot) ไว้ในตัว
  // undo toast เอง ⇒ กด "เลิกทำ" = คืนอาเรย์เดิมตรง ๆ (ตำแหน่ง/ลำดับเป๊ะ) ไม่ต้องคำนวณ index ใหม่
  const showUndoToast = useCallback((message: string, token: string, snapshot: BoardColumnDto[]) => {
    setUndoToast({ message, token, snapshot });
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    undoToastTimer.current = setTimeout(() => setUndoToast(null), UNDO_TOAST_MS);
  }, []);

  const swipeComplete = useCallback(
    (card: BoardCardDto, columnId: string) => {
      const snapshot = columnsRef.current;
      setCols(snapshot.map((c) => (c.id === columnId ? { ...c, cards: c.cards.filter((x) => x.id !== card.id) } : c)));
      startTransition(async () => {
        try {
          const res = await completeCardAction({ systemId, boardId: board.id, cardId: card.id });
          if (!res.ok) {
            rollback(snapshot, res.message || "ปัดเสร็จไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          showUndoToast(`ทำเครื่องหมาย "${card.title}" เสร็จแล้ว`, res.undoToken, snapshot);
        } catch {
          rollback(snapshot, "ปัดเสร็จไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    [board.id, rollback, setCols, showUndoToast, systemId],
  );

  const swipeArchive = useCallback(
    (card: BoardCardDto, columnId: string) => {
      const snapshot = columnsRef.current;
      setCols(snapshot.map((c) => (c.id === columnId ? { ...c, cards: c.cards.filter((x) => x.id !== card.id) } : c)));
      startTransition(async () => {
        try {
          const res = await archiveWithUndoAction({ systemId, boardId: board.id, cardId: card.id });
          if (!res.ok) {
            rollback(snapshot, res.message || "เก็บการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          showUndoToast(`เก็บ "${card.title}" เข้าคลังแล้ว`, res.undoToken, snapshot);
        } catch {
          rollback(snapshot, "เก็บการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    [board.id, rollback, setCols, showUndoToast, systemId],
  );

  /** ปุ่ม "เลิกทำ" ของ toast — คืนอาเรย์คอลัมน์ตามภาพก่อนปัด (`snapshot`) เมื่อ server ยืนยันเลิกทำสำเร็จ */
  const undoSwipe = useCallback(() => {
    const current = undoToast;
    if (!current) return;
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast(null);
    startTransition(async () => {
      try {
        const res = await undoAction({ systemId, boardId: board.id, token: current.token });
        if (res.ok) setCols(current.snapshot);
        else showToast("เลิกทำไม่ได้แล้ว (อาจใช้ไปแล้วหรือหมดเวลา)");
      } catch {
        showToast("เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  }, [board.id, setCols, showToast, systemId, undoToast]);

  // ───────────────────────── ตัวช่วยกับ state ─────────────────────────

  const cloneWithCardMoved = (
    prev: BoardColumnDto[],
    cardId: string,
    toColumnId: string,
    index: number,
  ): BoardColumnDto[] => {
    let moving: BoardCardDto | null = null;
    const stripped = prev.map((col) => {
      const found = col.cards.find((c) => c.id === cardId);
      if (!found) return col;
      moving = found;
      return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
    });
    if (!moving) return prev;
    return stripped.map((col) => {
      if (col.id !== toColumnId) return col;
      const cards = [...col.cards];
      cards.splice(Math.min(index, cards.length), 0, moving!);
      return { ...col, cards };
    });
  };

  const patchCard = (cardId: string, patch: Partial<BoardCardDto>) => {
    setCols(
      columnsRef.current.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
      })),
    );
  };

  const messageOf = (code: string, message: string, toColumnId: string): string => {
    if (code === "WIP_LIMIT") {
      const limit = columnsRef.current.find((c) => c.id === toColumnId)?.wipLimit;
      return `คอลัมน์นี้เต็มแล้ว${limit ? ` (จำกัด ${limit} งาน)` : ""} — ย้ายงานอื่นออกก่อน`;
    }
    if (code === "CARD_ARCHIVED") return "การ์ดนี้ถูกเก็บเข้าคลังไปแล้ว";
    return message || "ย้ายการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง";
  };

  /** ยิงคำสั่งย้ายจริง — optimistic ไปแล้วจากผู้เรียก · ไม่ผ่าน = คืนค่ากลับ snapshot + toast */
  const commitMove = useCallback(
    (input: {
      cardId: string;
      toColumnId: string;
      beforeCardId: string | null;
      afterCardId: string | null;
      snapshot: BoardColumnDto[];
    }) => {
      startTransition(async () => {
        try {
          const res = await moveCardAction({
            systemId,
            boardId: board.id,
            cardId: input.cardId,
            toColumnId: input.toColumnId,
            beforeCardId: input.beforeCardId,
            afterCardId: input.afterCardId,
          });
          if (!res.ok) {
            rollback(input.snapshot, messageOf(res.code, res.message, input.toColumnId));
            return;
          }
          // สำเร็จ: รับ position จริงที่ server คิดให้ (rebalance อาจเปลี่ยนคีย์) กลับมาเก็บไว้
          patchCard(input.cardId, { position: res.position });
        } catch {
          rollback(input.snapshot, "ย้ายการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patchCard/rollback อ่านจาก ref ที่คงที่ตลอดอายุคอมโพเนนต์
    [board.id, systemId, rollback],
  );

  /** ย้ายการ์ดไปคอลัมน์ปลายทางที่ตำแหน่ง index (ใช้ทั้งตอนวางเมาส์และปุ่มลัด Shift+←/→) */
  const moveCardTo = useCallback(
    (card: BoardCardDto, fromColumnId: string, toColumnId: string, index: number) => {
      const snapshot = columnsRef.current;
      const target = snapshot.find((c) => c.id === toColumnId);
      if (!target) return;
      const list = target.cards.filter((c) => c.id !== card.id);
      const bounded = Math.max(0, Math.min(index, list.length));
      const currentIndex = snapshot.find((c) => c.id === fromColumnId)?.cards.findIndex((c) => c.id === card.id) ?? -1;
      if (fromColumnId === toColumnId && currentIndex === bounded) return; // วางที่เดิม = ไม่ต้องยิงอะไร
      const afterCardId = bounded > 0 ? list[bounded - 1]!.id : null;
      const beforeCardId = bounded < list.length ? list[bounded]!.id : null;
      setCols(cloneWithCardMoved(snapshot, card.id, toColumnId, bounded));
      commitMove({ cardId: card.id, toColumnId, beforeCardId, afterCardId, snapshot });
    },
    [commitMove, setCols],
  );

  // ───────────────────────── เรขาคณิตของการลาก ─────────────────────────

  /**
   * หา "คอลัมน์ + ช่องที่จะตกลง" จากตำแหน่งเมาส์
   * ⚠️ ชดเชยความสูงของเส้นวางที่แทรกอยู่ในกองแล้ว (ไม่งั้นการ์ดใต้เส้นถูกดันลง → index กระพริบสลับไปมา)
   */
  const targetAt = useCallback((x: number, y: number, cardId: string, current: CardDrag["over"]): CardDrag["over"] => {
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
        ? indicatorEl.current.getBoundingClientRect().height + CARD_GAP
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
  }, []);

  const endPointer = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    cleanup.current?.();
    cleanup.current = null;
    pending.current = null;
  }, []);

  const beginCardDrag = useCallback((p: Extract<Pending, { kind: "card" }>, x: number, y: number) => {
    const next: CardDrag = {
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
        index: (columnsRef.current.find((c) => c.id === p.columnId)?.cards.findIndex((c) => c.id === p.card.id) ?? 0),
      },
    };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onCardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, card: BoardCardDto, columnId: string) => {
      if (!canEdit || e.button !== 0) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select")) return; // ปุ่มบนการ์ดยังกดได้ตามปกติ
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.pointerType !== "mouse";
      pending.current = { kind: "card", card, columnId, startX: e.clientX, startY: e.clientY, rect, touch };
      if (touch) {
        holdTimer.current = setTimeout(() => {
          const p = pending.current;
          if (p?.kind === "card") beginCardDrag(p, p.startX, p.startY);
        }, HOLD_MS);
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
            clearTimeout(holdTimer.current); // นิ้วเลื่อนก่อนครบ 0.3 วิ = คนกำลังเลื่อนจอ ไม่ใช่จะลาก
            holdTimer.current = null;
            pending.current = null;
          }
          return;
        }
        if (moved > DRAG_THRESHOLD_PX) beginCardDrag(p, ev.clientX, ev.clientY);
      };

      const onUp = (ev: PointerEvent) => {
        const active = dragRef.current;
        endPointer();
        if (!active) return; // ไม่ได้ลาก = ปล่อยให้ onClick เปิดหลังการ์ดตามปกติ
        draggedAt.current = Date.now();
        dragRef.current = null;
        setDrag(null);
        const over = targetAt(ev.clientX, ev.clientY, active.card.id, active.over) ?? active.over;
        if (over) moveCardTo(active.card, active.fromColumnId, over.columnId, over.index);
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
    [beginCardDrag, canEdit, endPointer, moveCardTo, targetAt],
  );

  // ── ลากคอลัมน์ (จับที่หัวคอลัมน์) — สลับลำดับสด ๆ แล้วยิง moveColumnAction ตอนปล่อย ──
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, columnId: string) => {
      if (!canEdit || e.button !== 0) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select")) return;
      const startX = e.clientX;
      const snapshot = columnsRef.current;

      const onMove = (ev: PointerEvent) => {
        if (!colDragRef.current) {
          if (Math.abs(ev.clientX - startX) <= DRAG_THRESHOLD_PX) return;
          colDragRef.current = { columnId, order: snapshot.map((c) => c.id) };
          setColDragId(columnId);
        }
        // หาว่าตอนนี้ลอยอยู่เหนือคอลัมน์ไหน แล้วสลับที่ทันที (คอลัมน์มีไม่กี่ช่อง — สลับสดอ่านง่ายกว่าเส้นวาง)
        const cur = columnsRef.current;
        const fromIdx = cur.findIndex((c) => c.id === columnId);
        let overIdx = fromIdx;
        cur.forEach((c, i) => {
          const node = columnEls.current.get(c.id);
          if (!node) return;
          const r = node.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right) overIdx = i;
        });
        if (overIdx !== fromIdx) {
          const next = [...cur];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(overIdx, 0, moved!);
          setCols(next);
        }
      };

      const onUp = () => {
        endPointer();
        const dragging = colDragRef.current;
        colDragRef.current = null;
        setColDragId(null);
        if (!dragging) return;
        const order = columnsRef.current;
        const idx = order.findIndex((c) => c.id === columnId);
        if (idx < 0 || order.map((c) => c.id).join() === dragging.order.join()) return;
        const beforeColumnId = idx + 1 < order.length ? order[idx + 1]!.id : null;
        const afterColumnId = idx > 0 ? order[idx - 1]!.id : null;
        startTransition(async () => {
          try {
            const res = await moveColumnAction({ systemId, boardId: board.id, columnId, beforeColumnId, afterColumnId });
            if (!res.ok) rollback(snapshot, "ย้ายคอลัมน์ไม่สำเร็จ ลองใหม่อีกครั้ง");
          } catch {
            rollback(snapshot, "ย้ายคอลัมน์ไม่สำเร็จ ลองใหม่อีกครั้ง");
          }
        });
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
    [board.id, canEdit, endPointer, rollback, setCols, systemId],
  );

  // ───────────────────────── ปุ่มลัด/คลิก ─────────────────────────

  const openCard = useCallback((card: BoardCardDto) => {
    if (Date.now() - draggedAt.current < 250) return; // เพิ่งลากเสร็จ ไม่ใช่การคลิกเปิดการ์ด
    setOpenCardId(card.id);
    setOpenCardSnapshot(card);
    const col = columnsRef.current.find((c) => c.cards.some((cc) => cc.id === card.id));
    setOpenColumnMeta(col ? { id: col.id, name: col.name } : null);
    // K1.6: ปักไว้ใน URL ผ่าน history (ไม่ navigate ⇒ ไม่ยิง RSC ซ้ำ) — `CardBack` อ่านสถานะจาก React state นี้
    const url = new URL(window.location.href);
    url.searchParams.set("card", card.id);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const closeCard = useCallback(() => {
    const id = openCardId;
    setCardBackPanel(null); // ปุ่มลัด t/d/l สั่งเปิดแผงไว้ — ปิดการ์ดแล้วต้องลืม ไม่งั้นเปิดใบถัดไปแผงเด้งเอง
    setOpenCardId(null);
    setOpenCardSnapshot(null);
    setOpenColumnMeta(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("card");
    window.history.replaceState({}, "", url.toString());
    // §12.2: ปิดหลังการ์ด → คืนโฟกัสให้การ์ดใบเดิมบนบอร์ด
    if (id) cardEls.current.get(id)?.focus();
  }, [openCardId]);

  /** เอาการ์ดออกจากกองบนบอร์ด (เก็บเข้าคลังจากหลังการ์ด) — โมดัลยังเปิดต่อได้ผ่าน `openCardSnapshot` */
  const removeCardFromBoard = useCallback(
    (cardId: string) => {
      setCols(columnsRef.current.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== cardId) })));
    },
    [setCols],
  );

  /** แทรกการ์ด "สำเนา" ใหม่ ท้ายคอลัมน์ที่ระบุ (ไม่แตะหัวโมดัล — เป็นคนละใบกับการ์ดที่เปิดอยู่) */
  const insertDuplicatedCard = useCallback(
    (card: BoardCardDto, columnId: string) => {
      setCols(columnsRef.current.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, card] } : c)));
    },
    [setCols],
  );

  /** การ์ดที่เปิดอยู่ถูกกู้คืน — ใส่กลับบนบอร์ด + ปรับหัวโมดัลให้ตรงคอลัมน์ปลายทาง */
  const insertRestoredCard = useCallback(
    (card: BoardCardDto, columnId: string) => {
      const col = columnsRef.current.find((c) => c.id === columnId);
      setCols(columnsRef.current.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, card] } : c)));
      if (col) setOpenColumnMeta({ id: col.id, name: col.name });
    },
    [setCols],
  );

  /** ย้ายการ์ดจากหลังการ์ด (แถบขวา "ย้ายไปคอลัมน์") — เดินท่อ optimistic เดียวกับการลาก (K1.5) */
  const moveOpenCardToColumn = useCallback(
    (card: BoardCardDto, toColumnId: string) => {
      const fromColumnId = columnsRef.current.find((c) => c.cards.some((cc) => cc.id === card.id))?.id;
      if (!fromColumnId || fromColumnId === toColumnId) return;
      const target = columnsRef.current.find((c) => c.id === toColumnId);
      if (!target) return;
      setOpenColumnMeta({ id: target.id, name: target.name });
      moveCardTo(card, fromColumnId, toColumnId, target.cards.length);
    },
    [moveCardTo],
  );

  const cardBackHandlers: CardBackHandlers = {
    onClose: closeCard,
    onPatch: patchCard,
    onRemove: removeCardFromBoard,
    onDuplicated: insertDuplicatedCard,
    onRestored: insertRestoredCard,
    onMoveToColumn: moveOpenCardToColumn,
    onLabelCreated: (label) => setLabels((prev) => [...prev, label]),
    onToast: showToast,
  };

  const onCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, card: BoardCardDto, columnId: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openCard(card);
        return;
      }
      // ปุ่มลัดของเรา (§5.6): Shift+←/→ ย้ายการ์ดข้ามคอลัมน์ด้วยคีย์บอร์ด (สำหรับคนที่ลากไม่ถนัด)
      if (!canEdit || !e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = columnsRef.current.findIndex((c) => c.id === columnId);
      const targetIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
      const target = columnsRef.current[targetIdx];
      if (!target) return;
      moveCardTo(card, columnId, target.id, target.cards.length);
    },
    [canEdit, moveCardTo, openCard],
  );

  // ───────────────────────── คำสั่งอื่น (การ์ด/คอลัมน์/บอร์ด) ─────────────────────────

  const handlers: ColumnHandlers = {
    onCardPointerDown,
    onCardKeyDown,
    onCardOpen: openCard,
    onHeaderPointerDown,
    registerColumnRef: (id, el) => {
      if (el) columnEls.current.set(id, el);
      else columnEls.current.delete(id);
    },
    registerCardRef: (id, el) => {
      if (el) cardEls.current.set(id, el);
      else cardEls.current.delete(id);
    },
    registerIndicatorRef: (el) => {
      indicatorEl.current = el;
    },
    onCreateCard: (columnId, title) => {
      const snapshot = columnsRef.current;
      startTransition(async () => {
        try {
          const res = await createCardAction({ systemId, boardId: board.id, columnId, title });
          if (!res.ok) {
            rollback(snapshot, res.message);
            return;
          }
          const created = res.card;
          setCols(
            columnsRef.current.map((col) =>
              col.id === columnId ? { ...col, cards: [...col.cards, created] } : col,
            ),
          );
        } catch {
          showToast("เพิ่มการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    // K2.7 — สร้างการ์ดจากเทมเพลต (`CardTemplatePicker.tsx`) — แทรกท้ายคอลัมน์เหมือน onCreateCard
    onCreateFromTemplate: (columnId, templateId, title) => {
      startTransition(async () => {
        try {
          const res = await createCardFromTemplateAction({ systemId, boardId: board.id, templateId, columnId, title });
          if (!res.ok) {
            showToast(res.message);
            return;
          }
          const created = res.card;
          setCols(columnsRef.current.map((col) => (col.id === columnId ? { ...col, cards: [...col.cards, created] } : col)));
        } catch {
          showToast("สร้างการ์ดจากเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    onRenameColumn: (columnId, name) => {
      const snapshot = columnsRef.current;
      setCols(columnsRef.current.map((c) => (c.id === columnId ? { ...c, name } : c)));
      startTransition(async () => {
        try {
          await renameColumnAction({ systemId, boardId: board.id, columnId, name });
        } catch {
          rollback(snapshot, "เปลี่ยนชื่อคอลัมน์ไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    onSetWip: (columnId, wipLimit) => {
      const snapshot = columnsRef.current;
      setCols(columnsRef.current.map((c) => (c.id === columnId ? { ...c, wipLimit } : c)));
      startTransition(async () => {
        try {
          await setColumnWipAction({ systemId, boardId: board.id, columnId, wipLimit });
        } catch {
          rollback(snapshot, "ตั้งจำนวนงานพร้อมกันไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    onSetDone: (columnId, isDone) => {
      const snapshot = columnsRef.current;
      setCols(columnsRef.current.map((c) => (c.id === columnId ? { ...c, isDoneColumn: isDone } : c)));
      startTransition(async () => {
        try {
          await setColumnDoneAction({ systemId, boardId: board.id, columnId, isDone });
        } catch {
          rollback(snapshot, "ตั้งคอลัมน์เสร็จไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    onMoveAllCards: (fromColumnId, toColumnId) => {
      const snapshot = columnsRef.current;
      const moving = snapshot.find((c) => c.id === fromColumnId)?.cards ?? [];
      setCols(
        snapshot.map((col) =>
          col.id === fromColumnId
            ? { ...col, cards: [] }
            : col.id === toColumnId
              ? { ...col, cards: [...col.cards, ...moving] }
              : col,
        ),
      );
      startTransition(async () => {
        try {
          await moveAllCardsAction({ systemId, boardId: board.id, fromColumnId, toColumnId });
        } catch {
          rollback(snapshot, "ย้ายการ์ดทั้งคอลัมน์ไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    onArchiveColumn: (columnId) => {
      const snapshot = columnsRef.current;
      setCols(columnsRef.current.filter((c) => c.id !== columnId));
      startTransition(async () => {
        try {
          await archiveColumnAction({ systemId, boardId: board.id, columnId });
        } catch {
          rollback(snapshot, "เก็บคอลัมน์เข้าคลังไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    },
    // K2.11 — ติดตาม/เลิกติดตามคอลัมน์ (ของส่วนตัว · ไม่แตะข้อมูลบอร์ด ⇒ ไม่ต้อง rollback กองการ์ด)
    onToggleWatchColumn: (columnId, next) => {
      setWatchedColumns((prev) => (next ? [...new Set([...prev, columnId])] : prev.filter((id) => id !== columnId)));
      startTransition(async () => {
        const res = next
          ? await watchAction({ systemId, targetType: "COLUMN", targetId: columnId })
          : await unwatchAction({ systemId, targetType: "COLUMN", targetId: columnId });
        if (!res.ok) {
          setWatchedColumns((prev) => (next ? prev.filter((id) => id !== columnId) : [...new Set([...prev, columnId])]));
          showToast(res.message);
          return;
        }
        showToast(next ? "ติดตามคอลัมน์นี้แล้ว" : "เลิกติดตามคอลัมน์นี้แล้ว");
      });
    },
  };

  const boardColumnsMeta = columns.map((c) => ({ id: c.id, name: c.name }));

  // ───────────────────────── K1.11: ตัวกรอง (URL → filterBoardCards) ─────────────────────────
  // กรองที่นี่ (client) ต่อยอด state ที่โหลดมาแล้ว — ไม่ยิง DB ซ้ำทุกครั้งที่เปลี่ยนตัวกรอง เพราะ
  // `filterBoardCards` เป็นฟังก์ชันบริสุทธิ์ตัวเดียวกับที่ oracle/service ฝั่ง server ใช้ (§11.8)
  const activeFilters = hasAnyFilter(filters);
  const totalCardCount = columns.reduce((n, c) => n + c.cards.length, 0);
  const filterCtx = { now: new Date(nowMs), userId: board.viewerUserId || null };
  // K2.4: ผูก `columnId` ให้การ์ดแต่ละใบก่อนกรอง (`BoardCardDto` เดิมไม่มีฟิลด์นี้ — คอลัมน์คือ context
  // ของ `col` เอง) เพื่อให้ `?column=` (จากไทล์ "การ์ดต่อคอลัมน์" ของมุมมองสรุป K2.4) ซ่อนคอลัมน์อื่นได้จริง
  const filteredColumns = activeFilters
    ? columns.map((col) => ({
        ...col,
        cards: filterBoardCards(
          col.cards.map((c) => ({ ...c, columnId: col.id })),
          filters,
          filterCtx,
        ),
      }))
    : columns;
  const visibleCardCount = activeFilters
    ? filteredColumns.reduce((n, c) => n + c.cards.length, 0)
    : totalCardCount;
  const clearFilters = () => router.replace(pathname, { scroll: false });

  // ═════════ K1.14 — realtime/polling: บอร์ดนี้มีของใหม่ ═════════
  // ⚠️ พักไว้ระหว่างลาก/เปิดหลังการ์ด — `router.refresh()` กลางการลากจะสลับ state ใต้มือผู้ใช้
  useBoardLive(board.id, { paused: !!drag || !!colDragId || !!openCardId });

  // ═════════ K1.14 — ปุ่มลัดคีย์บอร์ด (§5.6) ═════════
  // การ์ดทุกใบเป็น element ที่โฟกัสได้อยู่แล้ว (K1.5) ⇒ "การ์ดที่ชี้อยู่" = การ์ดที่โฟกัส
  // ⇒ j/k แค่ย้ายโฟกัส แล้วปุ่มอื่นทำงานกับใบที่โฟกัสอยู่ (คนใช้คีย์บอร์ดล้วนได้ผลเหมือนเมาส์)
  const flatVisible = filteredColumns.flatMap((col) => col.cards.map((card) => ({ card, columnId: col.id })));
  const selectCard = (id: string | null) => {
    setSelectedCardId(id);
    if (id) cardEls.current.get(id)?.focus();
  };
  const currentPick = () => {
    const id = selectedCardId ?? openCardId;
    const found = id ? flatVisible.find((x) => x.card.id === id) : undefined;
    return found ?? flatVisible[0] ?? null;
  };
  const openWithPanel = (panel: "title" | "due" | "labels") => {
    const pick = currentPick();
    if (!pick) return;
    setCardBackPanel(panel);
    openCard(pick.card);
  };
  const stepSelection = (delta: 1 | -1) => {
    if (flatVisible.length === 0) return;
    const id = selectedCardId;
    const idx = id ? flatVisible.findIndex((x) => x.card.id === id) : -1;
    const next = idx < 0 ? (delta === 1 ? 0 : flatVisible.length - 1) : (idx + delta + flatVisible.length) % flatVisible.length;
    selectCard(flatVisible[next]!.card.id);
  };
  const moveSelectedSideways = (dir: -1 | 1) => {
    if (!canEdit) {
      showToast("คุณดูบอร์ดนี้ได้อย่างเดียว");
      return;
    }
    const pick = currentPick();
    if (!pick) return;
    const idx = columnsRef.current.findIndex((c) => c.id === pick.columnId);
    const target = columnsRef.current[idx + dir];
    if (!target) return;
    moveCardTo(pick.card, pick.columnId, target.id, target.cards.length);
  };
  /**
   * ปุ่มที่ "เปิดแผงที่มีอยู่แล้วบนหน้าจอ" (ตัวกรอง/ค้นหา/เพิ่มการ์ด) สั่งผ่านการกดปุ่มจริงใน DOM
   * ⚠️ ตั้งใจ: แผงพวกนี้ถือ state ของตัวเองอยู่ใน `BoardHeader`/`Column` ⇒ ยกขึ้นมาไว้ที่นี่เพื่อให้
   *    ปุ่มลัดสั่งได้ = ต้องรื้อ 3 คอมโพเนนต์ · การกดปุ่มเดียวกับที่ผู้ใช้กดเองให้ผลเหมือนกันเป๊ะ
   *    และไม่มีทางที่ปุ่มลัดจะทำงานได้ในขณะที่ปุ่มจริงหายไป (ซึ่งจะเป็นบั๊กที่มองไม่เห็น)
   */
  const clickTestId = (testId: string): boolean => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!el) return false;
    el.click();
    return true;
  };

  const onShortcut = (command: ShortcutCommand) => {
    const sysBase = `/app/sys/${systemId}/kanban`;
    switch (command) {
      case "boards":
      case "go-boards":
        router.push(`${sysBase}/boards`);
        return;
      case "go-my-tasks":
        router.push(`${sysBase}/my-tasks`);
        return;
      case "go-inbox":
        showToast("กล่องงานเข้ากำลังจะมา (เร็ว ๆ นี้)");
        return;
      case "search":
        clickTestId("search-open");
        return;
      case "filter":
        if (!clickTestId("filter-button")) showToast("ตัวกรองอยู่ที่หัวบอร์ด");
        return;
      case "filter-clear":
        if (activeFilters) clearFilters();
        return;
      case "new-card": {
        const pick = currentPick();
        const columnId = pick?.columnId ?? filteredColumns[0]?.id;
        if (!columnId) return;
        const btn = document.querySelector<HTMLElement>(`[data-column-id="${columnId}"] [data-testid="add-card"]`);
        if (btn) btn.click();
        else clickTestId("add-card");
        return;
      }
      case "rename-card":
        openWithPanel("title");
        return;
      case "due":
        openWithPanel("due");
        return;
      case "labels":
        openWithPanel("labels");
        return;
      case "archive-card": {
        const pick = currentPick();
        if (!pick) return;
        if (!canEdit) {
          showToast("คุณดูบอร์ดนี้ได้อย่างเดียว");
          return;
        }
        setSelectedCardId(null);
        swipeArchive(pick.card, pick.columnId);
        return;
      }
      case "card-next":
        stepSelection(1);
        return;
      case "card-prev":
        stepSelection(-1);
        return;
      case "move-left":
        moveSelectedSideways(-1);
        return;
      case "move-right":
        moveSelectedSideways(1);
        return;
      case "undo":
        if (undoToast) undoSwipe();
        else showToast("ไม่มีรายการให้เลิกทำ");
        return;
      case "escape":
        if (openCardId) closeCard();
        else setSelectedCardId(null);
        return;
      default:
        return;
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{
        height: "calc(100dvh - 3.5rem)",
        background: "var(--color-stage)",
        userSelect: drag || colDragId ? "none" : undefined,
        touchAction: drag ? "none" : undefined,
      }}
    >
      <BoardHeader
        board={{ ...board, name: boardName }}
        starred={starred}
        filters={filters}
        savedViews={savedViews}
        onToggleStar={() => {
          const next = !starred;
          setStarred(next);
          startTransition(async () => {
            try {
              await starBoardAction({ systemId, boardId: board.id, starred: next });
            } catch {
              setStarred(!next); // คืนค่าดาวกลับเมื่อบันทึกไม่ผ่าน
              showToast("บันทึกดาวไม่สำเร็จ ลองใหม่อีกครั้ง");
            }
          });
        }}
        onRename={(name) => {
          const before = boardName;
          setBoardName(name);
          startTransition(async () => {
            try {
              await renameBoardAction({ systemId, boardId: board.id, name });
            } catch {
              setBoardName(before);
              showToast("เปลี่ยนชื่อบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
            }
          });
        }}
      />

      {/* ── แถบตัวกรองที่เปิดอยู่ (K1.11) — ซ่อนเองเมื่อไม่มีตัวกรองทำงาน ── */}
      <FilterBar filters={filters} totalCount={totalCardCount} visibleCount={visibleCardCount} members={board.members} columns={board.columns} />

      {/* ── กรองแล้วไม่เจอสักใบ — แทนที่กองคอลัมน์ด้วย empty state (§5.7) ── */}
      {activeFilters && visibleCardCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3" style={{ color: "var(--color-muted)" }}>
          <KanbanIcon name="filter" size="lg" />
          <p style={{ fontSize: 13 }}>ไม่มีการ์ดตรงกับตัวกรอง</p>
          <button
            type="button"
            onClick={clearFilters}
            className="underline"
            style={{ fontSize: 13, color: "var(--color-accent)" }}
          >
            ล้างตัวกรอง
          </button>
        </div>
      ) : isMobile ? (
        /* ── K1.13: มือถือ — เลื่อนทีละคอลัมน์ + ปัดขวา/ซ้าย + FAB (ดู MobileBoard.tsx) ── */
        <MobileBoard
          columns={filteredColumns}
          nowMs={nowMs}
          canEdit={canEdit}
          onOpenCard={openCard}
          onCreateCard={handlers.onCreateCard}
          onSwipeComplete={swipeComplete}
          onSwipeArchive={swipeArchive}
        />
      ) : (
      /* ── เวทีบอร์ด (เดสก์ท็อป) ── */
      <div className="flex min-h-0 flex-1 items-start overflow-x-auto" style={{ gap: 12, padding: "12px 20px 18px" }}>
        {filteredColumns.map((col, i) => (
          <Column
            key={col.id}
            column={col}
            cards={drag ? col.cards.filter((c) => c.id !== drag.card.id) : col.cards}
            siblings={columns.filter((c) => c.id !== col.id).map((c) => ({ id: c.id, name: c.name }))}
            cardTemplates={cardTemplates}
            nowMs={nowMs}
            canEdit={canEdit}
            isAdmin={isAdmin}
            watched={watchedColumns.includes(col.id)}
            draggingCardId={drag?.card.id ?? null}
            indicatorIndex={drag?.over && drag.over.columnId === col.id ? drag.over.index : null}
            indicatorHeight={drag?.height ?? 58}
            columnDragging={colDragId === col.id}
            handlers={handlers}
          />
        ))}
        {columns.length === 0 && (
          <div className="flex flex-col items-start gap-2" style={{ color: "var(--color-muted)" }}>
            <p style={{ fontSize: 13 }}>บอร์ดนี้ยังว่าง ลองเพิ่มงานแรกในคอลัมน์ &ldquo;รอทำ&rdquo;</p>
            {canEdit && (
              <button
                type="button"
                data-testid="empty-board-add-card"
                className="btn btn-primary text-sm"
                onClick={() => onShortcut("new-card")}
              >
                <KanbanIcon name="plus" size="sm" />
                เพิ่มการ์ด
              </button>
            )}
          </div>
        )}
        {canEdit && columns.length > 0 && (
          <button
            type="button"
            title="เพิ่มคอลัมน์ (เร็ว ๆ นี้)"
            aria-label="เพิ่มคอลัมน์"
            disabled
            className="grid flex-none place-items-center"
            style={{
              width: 76,
              height: 44,
              borderRadius: 12,
              border: "1.5px dashed var(--color-line)",
              background: "rgba(236,238,241,.55)",
              color: "var(--color-muted)",
            }}
          >
            <KanbanIcon name="plus" size="sm" />
          </button>
        )}
      </div>
      )}

      {/* ── การ์ดที่กำลังยก (ลอยตามเมาส์ · เอียง 2.4° ตามแบบ) ── */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[60]"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
          aria-hidden
        >
          <Card card={drag.card} nowMs={nowMs} ghost />
        </div>
      )}

      {/* ── หลังการ์ด (K1.6) — key={id} กันไม่ให้ state ภายในเลอะข้ามการ์ดเวลาสลับใบเร็ว ๆ ── */}
      {openCardId && openCardSnapshot && (
        <CardBack
          key={openCardSnapshot.id}
          initialPanel={cardBackPanel}
          card={openCardSnapshot}
          columnId={openColumnMeta?.id ?? ""}
          columnName={openColumnMeta?.name ?? ""}
          boardId={board.id}
          boardName={boardName}
          systemId={systemId}
          canEdit={canEdit}
          boardRole={board.role}
          currentUserId={board.viewerUserId}
          labels={labels}
          members={board.members}
          columns={boardColumnsMeta}
          nowMs={nowMs}
          handlers={cardBackHandlers}
        />
      )}

      {/* ── toast: ข้อความไทย บอกสิ่งที่เกิดขึ้นกับงาน ไม่โทษคนกด ── */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="board-toast"
            className="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, boxShadow: "0 8px 24px rgba(10,10,10,.24)" }}
          >
            <KanbanIcon name="warn" size="sm" />
            {toast}
          </div>
        </div>
      )}

      {/* ── K1.14: ปุ่มลัดคีย์บอร์ด (ปิดได้จากตั้งค่าส่วนตัว) + หน้ารายการปุ่มลัด (`?`) ── */}
      <Shortcuts enabled={shortcutsEnabled} onCommand={onShortcut} />

      {/* ── K1.13: toast ปัดเสร็จ/เก็บ — ปุ่ม "เลิกทำ" ใช้ได้ 5 วิ (token จริงยังไม่หมดอายุ 5 นาที) ── */}
      {undoToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="undo-toast"
            className="pointer-events-auto flex items-center gap-3 rounded-full px-4 py-3"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, boxShadow: "0 8px 24px rgba(10,10,10,.24)" }}
          >
            <KanbanIcon name="check" size="sm" />
            <span>{undoToast.message}</span>
            <button type="button" data-testid="undo-toast-action" onClick={undoSwipe} className="font-semibold underline">
              เลิกทำ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BoardView;
