// MobileBoard.tsx — บอร์ดบนมือถือ (K1.13 · แบบที่เคาะ: `ledger/design-kanban/07-mobile.png` บล็อก (ก))
//
// ต่างจาก `BoardView.tsx`/`Column.tsx` (เดสก์ท็อป — ลากวางข้ามคอลัมน์ด้วย pointer events) โดยตั้งใจ:
//   · เลื่อนทีละคอลัมน์แบบ scroll-snap (270px ต่อคอลัมน์ตามแบบ) + จุดบอกตำแหน่งใต้แถบเลื่อน
//   · กดค้าง 300ms บนการ์ด = "ยก" (แสดงผลยกเฉย ๆ — การจัดเรียงข้ามคอลัมน์บนมือถือยังไม่ทำในรอบนี้ ดู wo-notes)
//   · ปัดขวา = เสร็จ (`completeCardAction` ผ่าน `onSwipeComplete`) / ปัดซ้าย = เก็บ (`onSwipeArchive`)
//   · FAB มุมขวาล่างเพิ่มการ์ดเข้าคอลัมน์ที่กำลังเลื่อนดูอยู่ (`activeIndex`)
//
// ⚠️ ท่าทั้งหมดตัดสินจาก pointerdown ตัวเดียวกัน: ขยับแนวนอนก่อน 300ms ครบ = ปัด (swipe) ·
//    อยู่นิ่งจนครบ 300ms = ยก (lift) · ขยับแนวตั้งก่อน = ปล่อยให้จอเลื่อนตามปกติ (ไม่ใช่ท่าของเรา)
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { CardTemplatePicker } from "./CardTemplatePicker";
import { KanbanIcon } from "./KanbanIcon";
import type { BoardCardDto, BoardColumnDto, CardTemplateDto } from "@/lib/modules/kanban/types";

const LIFT_MS = 300;
const SWIPE_THRESHOLD_PX = 90;
const MOVE_CANCEL_PX = 10;
const COLUMN_WIDTH = 270; // ตรง `.frame.m .kl{width:270px}` ของแบบ 07-mobile

type SwipeState = { cardId: string; dx: number; phase: "swiping" | "lifted" };

export function MobileBoard({
  columns,
  nowMs,
  canEdit,
  onOpenCard,
  onCreateCard,
  onSwipeComplete,
  onSwipeArchive,
  cardTemplates = [],
  onCreateFromTemplate,
}: {
  columns: BoardColumnDto[];
  nowMs: number;
  canEdit: boolean;
  onOpenCard: (card: BoardCardDto) => void;
  onCreateCard: (columnId: string, title: string) => void;
  onSwipeComplete: (card: BoardCardDto, columnId: string) => void;
  onSwipeArchive: (card: BoardCardDto, columnId: string) => void;
  /** K2.12 (หนี้ K2.7): เทมเพลตการ์ดของบอร์ด — ปุ่ม "จากเทมเพลต ▾" ในแผ่นเพิ่มการ์ดเร็ว (ว่าง = ไม่มีเทมเพลต ไม่โชว์ปุ่ม) */
  cardTemplates?: CardTemplateDto[];
  onCreateFromTemplate?: (columnId: string, templateId: string, title: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [swipe, setSwipe] = useState<SwipeState | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const suppressClickUntil = useRef(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const gap = 9;
    const idx = Math.round(el.scrollLeft / (COLUMN_WIDTH + gap));
    setActiveIndex(Math.max(0, Math.min(idx, columns.length - 1)));
  }, [columns.length]);

  // คอลัมน์หายไป (เก็บ/ย้าย) ระหว่างเลื่อนดูอยู่ — กันจุดชี้เกินขอบ
  useEffect(() => {
    if (activeIndex > columns.length - 1) setActiveIndex(Math.max(0, columns.length - 1));
  }, [activeIndex, columns.length]);

  const openGuarded = useCallback(
    (card: BoardCardDto) => {
      if (Date.now() < suppressClickUntil.current) return;
      onOpenCard(card);
    },
    [onOpenCard],
  );

  const onCardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, card: BoardCardDto, columnId: string) => {
      if (!canEdit) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let phase: "pending" | "swiping" | "lifted" | "cancelled" = "pending";

      const liftTimer = setTimeout(() => {
        if (phase !== "pending") return;
        phase = "lifted";
        setSwipe({ cardId: card.id, dx: 0, phase: "lifted" });
      }, LIFT_MS);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (phase === "pending") {
          if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
            phase = "swiping";
            clearTimeout(liftTimer);
            ev.preventDefault(); // กันเบราว์เซอร์แย่งไปเลื่อนจอแนวนอน (ต้อง passive:false ที่ listener ด้านล่าง)
            setSwipe({ cardId: card.id, dx, phase: "swiping" });
          } else if (Math.abs(dy) > MOVE_CANCEL_PX) {
            phase = "cancelled"; // กำลังเลื่อนจอแนวตั้ง — ไม่ใช่ท่าปัด/ยกของเรา
            clearTimeout(liftTimer);
          }
          return;
        }
        if (phase === "swiping") {
          ev.preventDefault();
          setSwipe({ cardId: card.id, dx, phase: "swiping" });
        }
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };

      const onUp = (ev: PointerEvent) => {
        clearTimeout(liftTimer);
        detach();
        const dx = ev.clientX - startX;
        if (phase !== "pending") suppressClickUntil.current = Date.now() + 300;
        if (phase === "swiping" && Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
          if (dx > 0) onSwipeComplete(card, columnId);
          else onSwipeArchive(card, columnId);
        }
        setSwipe(null);
      };

      // ⚠️ `pointercancel` (เบราว์เซอร์แย่งไปทำอย่างอื่น เช่น เลื่อนจอ) ไม่มี clientX/clientY ที่เชื่อถือได้
      // ตามสเปก — ห้ามเอาไปคำนวณ dx แล้วตัดสินใจปัด/เก็บ (เจอจริง: บาง build ส่ง clientX=0 มาทำให้เข้าใจว่า
      // "ปัดซ้ายสุดขั้ว" ทั้งที่ผู้ใช้แค่ถูกเบราว์เซอร์ยึดจอไปเลื่อนแนวนอน) — cancel = ยกเลิกเฉย ๆ ไม่ทำอะไรทั้งสิ้น
      const onCancel = () => {
        clearTimeout(liftTimer);
        detach();
        setSwipe(null);
      };

      // passive:false — ต้องเรียก preventDefault() ได้ตอนตัดสินใจว่าเป็นท่าปัดแนวนอน (กันเบราว์เซอร์แย่งไปเลื่อนจอ)
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [canEdit, onSwipeArchive, onSwipeComplete],
  );

  const activeColumn = columns[activeIndex] ?? columns[0] ?? null;

  return (
    <div data-testid="mobile-board" className="flex min-h-0 flex-1 flex-col" style={{ position: "relative" }}>
      {/* ── จุดบอกตำแหน่ง (ตรง `.pgd` ของแบบ) ── */}
      {columns.length > 1 && (
        <div data-testid="column-dots" className="flex items-center justify-center gap-[5px]" style={{ padding: "8px 0 2px" }}>
          {columns.map((c, i) => (
            <span
              key={c.id}
              aria-hidden
              style={{
                width: i === activeIndex ? 16 : 5,
                height: 5,
                borderRadius: i === activeIndex ? 3 : "50%",
                background: i === activeIndex ? "var(--color-ink)" : "var(--color-line-strong,var(--color-line))",
                transition: "width 150ms ease",
              }}
            />
          ))}
        </div>
      )}
      {activeColumn && columns.length > 1 && (
        <p className="text-center" style={{ fontSize: 11, color: "var(--color-muted)", padding: "0 0 6px" }}>
          คอลัมน์ {activeIndex + 1} จาก {columns.length} · ปัดซ้าย-ขวาเพื่อเปลี่ยนคอลัมน์
        </p>
      )}

      {/* ── คอลัมน์เลื่อน snap ทีละใบ ── */}
      {/* scroll-snap: คลาส Tailwind (snap-x snap-mandatory / snap-center) + inline style คู่กันกันเวอร์ชัน utility ไม่ตรง */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 items-start overflow-x-auto snap-x snap-mandatory"
        style={{ gap: 9, padding: "0 12px 12px", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            data-testid="mobile-column"
            className="flex shrink-0 snap-center flex-col gap-1.5 overflow-y-auto"
            style={{
              width: COLUMN_WIDTH,
              maxHeight: "100%",
              background: "var(--color-surface-2)",
              borderRadius: 12,
              padding: 8,
              scrollSnapAlign: "center",
            }}
          >
            <div className="flex items-center gap-1.5" style={{ padding: "2px 4px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{col.name}</span>
              <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>({col.cards.length})</span>
            </div>
            <div className="flex flex-col" style={{ gap: 7 }}>
              {col.cards.map((card) => {
                const active = swipe?.cardId === card.id ? swipe : null;
                const dx = active?.dx ?? 0;
                const lifted = active?.phase === "lifted";
                return (
                  <div
                    key={card.id}
                    data-testid="mobile-card-swipe"
                    className="relative"
                    // ⚠️ ห้ามให้เบราว์เซอร์เลื่อนจอแนวนอน (คอลัมน์) แย่งจากท่าปัดของเรา — ปล่อยเลื่อนแนวตั้งได้ปกติ
                    style={{ touchAction: "pan-y" }}
                  >
                    {/* ── พื้นหลังบอกท่าปัด (เขียว=เสร็จ/แดง=เก็บ) — โผล่เฉพาะตอนกำลังปัด ── */}
                    {dx !== 0 && (
                      <div
                        aria-hidden
                        className="absolute inset-0 flex items-center"
                        style={{
                          borderRadius: 10,
                          justifyContent: dx > 0 ? "flex-start" : "flex-end",
                          padding: "0 12px",
                          background: dx > 0 ? "var(--color-due-done-bg)" : "var(--color-due-late-bg)",
                          color: dx > 0 ? "var(--color-tag-green)" : "var(--color-tag-red)",
                        }}
                      >
                        <KanbanIcon name={dx > 0 ? "check" : "trash"} size="sm" />
                      </div>
                    )}
                    <div
                      style={{
                        transform: `translateX(${dx}px) ${lifted ? "scale(1.03)" : ""}`,
                        boxShadow: lifted ? "0 10px 24px rgba(10,10,10,.18)" : undefined,
                        transition: dx === 0 ? "transform 160ms ease" : undefined,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <Card
                        card={card}
                        nowMs={nowMs}
                        onPointerDown={(e) => onCardPointerDown(e, card, col.id)}
                        onOpen={() => openGuarded(card)}
                      />
                    </div>
                  </div>
                );
              })}
              {col.cards.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--color-muted)", padding: "6px 2px" }}>ยังไม่มีการ์ดในคอลัมน์นี้</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── คำอธิบายท่าทาง (ตรงตัวอักษรของแบบ 07-mobile ล่างสุด) ── */}
      {canEdit && (
        <p className="text-center" style={{ fontSize: 10.5, color: "var(--color-muted)", padding: "2px 60px 8px" }}>
          กดค้าง 0.3 วิ = ยกการ์ด · ปัดขวา = เสร็จ · ปัดซ้าย = เก็บ
        </p>
      )}

      {/* ── FAB เพิ่มการ์ด (เข้าคอลัมน์ที่กำลังเลื่อนดูอยู่) ── */}
      {canEdit && activeColumn && (
        <button
          type="button"
          data-testid="fab-add"
          aria-label="เพิ่มการ์ด"
          onClick={() => setQuickAddOpen(true)}
          className="grid place-items-center"
          style={{
            position: "absolute",
            right: 14,
            bottom: 14,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--color-ink)",
            color: "var(--color-surface)",
            boxShadow: "0 6px 18px rgba(10,10,10,.24)",
            zIndex: 20,
          }}
        >
          <KanbanIcon name="plus" />
        </button>
      )}

      {/* ── แผ่นเพิ่มการ์ดเร็ว (เข้าคอลัมน์ที่เห็นอยู่) ── */}
      {quickAddOpen && activeColumn && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" role="presentation">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(10,10,10,.28)" }}
            onClick={() => setQuickAddOpen(false)}
          />
          <div
            data-testid="mobile-quick-add"
            className="relative flex flex-col gap-2"
            style={{ background: "var(--color-surface)", borderRadius: "16px 16px 0 0", padding: "14px 14px 20px", boxShadow: "0 -8px 30px rgba(10,10,10,.2)" }}
          >
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--color-line)", margin: "0 auto 6px" }} />
            <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>เพิ่มการ์ดใหม่ใน &ldquo;{activeColumn.name}&rdquo;</p>
            {/* K2.12 (หนี้ K2.7): "จากเทมเพลต ▾" — เหมือนปุ่มบนเดสก์ท็อป (Column.tsx) ใช้ CardTemplatePicker ตัวเดียวกัน */}
            {cardTemplates.length > 0 && onCreateFromTemplate && (
              <CardTemplatePicker
                templates={cardTemplates}
                onCreate={(templateId, title) => {
                  onCreateFromTemplate(activeColumn.id, templateId, title);
                  setQuickAddOpen(false);
                }}
              />
            )}
            <input
              autoFocus
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              placeholder="ชื่อการ์ด…"
              className="input"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const title = quickAddTitle.trim();
                if (!title) return;
                onCreateCard(activeColumn.id, title);
                setQuickAddTitle("");
                setQuickAddOpen(false);
              }}
            />
            <button
              type="button"
              className="btn"
              style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
              onClick={() => {
                const title = quickAddTitle.trim();
                if (!title) return;
                onCreateCard(activeColumn.id, title);
                setQuickAddTitle("");
                setQuickAddOpen(false);
              }}
            >
              เพิ่มการ์ด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileBoard;
