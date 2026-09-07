// Column.tsx — คอลัมน์ 1 ช่องบนบอร์ด (K1.5) · แบบ: `.kl` ใน `ledger/design-kanban/_kb.part`
//   กว้าง 240px · พื้น #eceef1 (โทเคน --color-kb-column) · หัวคอลัมน์ = ชื่อ + จำนวน + ชิป WIP + `+` + `⋯`
//   ท้ายคอลัมน์ = "เพิ่มการ์ด" (พิมพ์ชื่อ + Enter แล้วช่องยังเปิดอยู่ให้พิมพ์ใบต่อไป — พิมพ์เขียว §3.2)
// ⚠️ element ราก = <section data-testid="column"> และการ์ด = <article data-testid="card">
//    (harness ภาพนับด้วย :nth-of-type ⇒ ห้ามเอา element ชนิดเดียวกันไปแทรกในกองเดียวกัน)
"use client";

import { useEffect, useRef, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { Card } from "./Card";
import { CardTemplatePicker } from "./CardTemplatePicker";
import type { BoardCardDto, BoardColumnDto, CardTemplateDto } from "@/lib/modules/kanban/types";

export type ColumnHandlers = {
  onCardPointerDown: (e: React.PointerEvent<HTMLElement>, card: BoardCardDto, columnId: string) => void;
  onCardKeyDown: (e: React.KeyboardEvent<HTMLElement>, card: BoardCardDto, columnId: string) => void;
  onCardOpen: (card: BoardCardDto) => void;
  onHeaderPointerDown: (e: React.PointerEvent<HTMLElement>, columnId: string) => void;
  registerColumnRef: (columnId: string, el: HTMLElement | null) => void;
  registerCardRef: (cardId: string, el: HTMLElement | null) => void;
  registerIndicatorRef: (el: HTMLElement | null) => void;
  onCreateCard: (columnId: string, title: string) => void;
  /** K2.7 — สร้างการ์ดจากเทมเพลต (`CardTemplatePicker.tsx`) */
  onCreateFromTemplate: (columnId: string, templateId: string, title: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onSetWip: (columnId: string, wipLimit: number | null) => void;
  onSetDone: (columnId: string, isDone: boolean) => void;
  onMoveAllCards: (fromColumnId: string, toColumnId: string) => void;
  onArchiveColumn: (columnId: string) => void;
  /** K2.11 — ติดตาม/เลิกติดตามคอลัมน์นี้ (ของส่วนตัว) */
  onToggleWatchColumn: (columnId: string, next: boolean) => void;
};

export function Column({
  column,
  cards,
  siblings,
  cardTemplates,
  nowMs,
  canEdit,
  isAdmin,
  watched,
  draggingCardId,
  indicatorIndex,
  indicatorHeight,
  columnDragging,
  handlers,
}: {
  column: BoardColumnDto;
  /** การ์ดที่จะเรนเดอร์จริง (BoardView ตัดใบที่กำลังยกออกไปแล้ว) */
  cards: BoardCardDto[];
  /** คอลัมน์อื่นในบอร์ด (เมนู "ย้ายการ์ดทั้งหมดไป…") */
  siblings: { id: string; name: string }[];
  /** K2.7 — เทมเพลตการ์ดของบอร์ด (ปุ่ม "จากเทมเพลต ▾" ข้าง "+ เพิ่มการ์ด" — ว่าง = ไม่แสดงปุ่ม) */
  cardTemplates: CardTemplateDto[];
  nowMs: number;
  canEdit: boolean;
  isAdmin: boolean;
  /** K2.11 — ฉันติดตามคอลัมน์นี้อยู่ไหม (มาจาก `watch.boardWatchState` ตอนโหลดบอร์ด) */
  watched: boolean;
  draggingCardId: string | null;
  /** ตำแหน่งเส้นวาง (index ในกองการ์ดของคอลัมน์นี้) — null = ไม่ได้ลากอยู่เหนือคอลัมน์นี้ */
  indicatorIndex: number | null;
  indicatorHeight: number;
  columnDragging: boolean;
  handlers: ColumnHandlers;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [wipOpen, setWipOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (composing) inputRef.current?.focus();
  }, [composing]);

  const count = column.cards.length;
  const full = column.wipLimit !== null && count >= column.wipLimit;

  const submitDraft = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    handlers.onCreateCard(column.id, title);
    setDraft("");
    inputRef.current?.focus(); // ช่องยังเปิดอยู่ให้พิมพ์ใบต่อไปทันที (§3.2)
  };

  const indicator = (
    <div
      key="drop-indicator"
      data-testid="drop-indicator"
      ref={handlers.registerIndicatorRef}
      aria-hidden
      style={{
        height: indicatorHeight,
        borderRadius: 10,
        border: "1.5px dashed var(--color-accent)",
        background: "var(--color-out)",
      }}
    />
  );

  const list: React.ReactNode[] = [];
  cards.forEach((card, i) => {
    if (indicatorIndex === i) list.push(indicator);
    list.push(
      <Card
        key={card.id}
        card={card}
        nowMs={nowMs}
        dragging={draggingCardId === card.id}
        registerRef={(el) => handlers.registerCardRef(card.id, el)}
        onPointerDown={canEdit ? (e) => handlers.onCardPointerDown(e, card, column.id) : undefined}
        onKeyDown={(e) => handlers.onCardKeyDown(e, card, column.id)}
        onOpen={() => handlers.onCardOpen(card)}
      />,
    );
  });
  if (indicatorIndex !== null && indicatorIndex >= cards.length) list.push(indicator);

  return (
    <section
      data-testid="column"
      data-column-id={column.id}
      ref={(el) => handlers.registerColumnRef(column.id, el)}
      className="flex max-h-full flex-none flex-col"
      style={{
        width: 240,
        background: "var(--color-kb-column)",
        borderRadius: 12,
        padding: 8,
        gap: 7,
        opacity: columnDragging ? 0.5 : 1,
      }}
    >
      {/* ── หัวคอลัมน์ (จับลากเพื่อสลับลำดับคอลัมน์ได้) ── */}
      <div
        className="flex items-center"
        style={{ gap: 7, padding: "2px 4px 0" }}
        onPointerDown={canEdit ? (e) => handlers.onHeaderPointerDown(e, column.id) : undefined}
      >
        {column.isDoneColumn && <KanbanIcon name="check" size="xs" className="text-[color:var(--color-tag-green)]" />}
        {renaming ? (
          <input
            autoFocus
            defaultValue={column.name}
            aria-label="ชื่อคอลัมน์"
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== column.name) handlers.onRenameColumn(column.id, v);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded px-1"
            style={{ fontSize: 13, fontWeight: 700, border: "1px solid var(--color-accent)" }}
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && setRenaming(true)}
            title={canEdit ? "เปลี่ยนชื่อคอลัมน์" : undefined}
            style={{ fontSize: 13, fontWeight: 700 }}
          >
            {column.name}
          </button>
        )}
        <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
          {count}
        </span>
        {column.wipLimit !== null && (
          <span
            title="จำกัดงานพร้อมกัน"
            style={{
              fontSize: 10.5,
              borderRadius: 5,
              padding: "0 5px",
              background: "var(--color-surface)",
              border: `1px solid ${full ? "var(--color-danger)" : "var(--color-line)"}`,
              color: full ? "var(--color-danger)" : "var(--color-muted)",
              fontWeight: full ? 700 : 400,
            }}
          >
            {count}/{column.wipLimit}
            {full ? " เต็ม" : ""}
          </span>
        )}
        <span className="flex-1" />
        {canEdit && !full && (
          <button
            type="button"
            aria-label="เพิ่มการ์ด"
            title="เพิ่มการ์ด"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setComposing(true)}
            style={{ color: "var(--color-muted)" }}
          >
            <KanbanIcon name="plus" size="xs" />
          </button>
        )}
        {/* K2.11 — เมนู ⋯ เปิดให้ทุกบทบาท: VIEWER ต้อง "ติดตามคอลัมน์" ได้ (รายการที่ต้องแก้งานยังกันด้วย canEdit/isAdmin เหมือนเดิม) */}
        <span className="relative">
            <button
              type="button"
              aria-label="เมนูคอลัมน์"
              title="เมนูคอลัมน์"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenuOpen((o) => !o)}
              style={{ color: "var(--color-muted)" }}
            >
              <KanbanIcon name="more" size="xs" />
            </button>
            {menuOpen && (
              <>
                <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 z-20 mt-1 flex w-56 flex-col rounded-xl p-1 text-left"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-line)",
                    boxShadow: "0 14px 34px rgba(10,10,10,.12)",
                    fontSize: 12.5,
                  }}
                >
                  {/* K2.11 — ติดตามคอลัมน์: การ์ดทุกใบในคอลัมน์นี้ (ใบที่ย้ายเข้ามาทีหลังด้วย) จะแจ้งถึงฉัน */}
                  <button
                    type="button"
                    data-testid="column-watch"
                    className="rounded-lg px-2 py-2 text-left"
                    onClick={() => { setMenuOpen(false); handlers.onToggleWatchColumn(column.id, !watched); }}
                  >
                    {watched ? "เลิกติดตามคอลัมน์นี้" : "ติดตามคอลัมน์นี้"}
                  </button>
                  {canEdit && (
                    <button type="button" className="rounded-lg px-2 py-2 text-left" onClick={() => { setMenuOpen(false); setRenaming(true); }}>
                      เปลี่ยนชื่อคอลัมน์
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="rounded-lg px-2 py-2 text-left" onClick={() => { setMenuOpen(false); setWipOpen(true); }}>
                      จำกัดงานพร้อมกัน…
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="rounded-lg px-2 py-2 text-left"
                      onClick={() => { setMenuOpen(false); handlers.onSetDone(column.id, !column.isDoneColumn); }}
                    >
                      {column.isDoneColumn ? "เลิกเป็นคอลัมน์เสร็จ" : "ตั้งเป็นคอลัมน์เสร็จ"}
                    </button>
                  )}
                  {canEdit && siblings.length > 0 && count > 0 && (
                    <>
                      <span className="px-2 pt-2" style={{ fontSize: 11, color: "var(--color-muted)" }}>
                        ย้ายการ์ดทั้งหมดไป
                      </span>
                      {siblings.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="rounded-lg px-2 py-2 text-left"
                          onClick={() => { setMenuOpen(false); handlers.onMoveAllCards(column.id, s.id); }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </>
                  )}
                  {canEdit && <span style={{ height: 1, background: "var(--color-line)", margin: "5px 9px" }} />}
                  {!canEdit ? null : isAdmin && count === 0 ? (
                    <button
                      type="button"
                      className="rounded-lg px-2 py-2 text-left"
                      onClick={() => { setMenuOpen(false); handlers.onArchiveColumn(column.id); }}
                    >
                      เก็บคอลัมน์เข้าคลัง
                    </button>
                  ) : (
                    <span className="px-2 py-2" style={{ color: "var(--color-muted)" }}>
                      {isAdmin ? "ย้ายการ์ดออกให้หมดก่อนถึงจะเก็บคอลัมน์เข้าคลังได้" : "เก็บคอลัมน์เข้าคลังได้เฉพาะผู้ดูแลบอร์ด"}
                    </span>
                  )}
                </div>
              </>
            )}
        </span>
      </div>

      {wipOpen && (
        <form
          className="flex items-center gap-2 rounded-lg p-2"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
          onSubmit={(e) => {
            e.preventDefault();
            const raw = String(new FormData(e.currentTarget).get("wipLimit") ?? "").trim();
            handlers.onSetWip(column.id, raw === "" ? null : Number(raw));
            setWipOpen(false);
          }}
        >
          <input
            name="wipLimit"
            type="number"
            min={1}
            defaultValue={column.wipLimit ?? ""}
            placeholder="ไม่จำกัด"
            aria-label="จำกัดงานพร้อมกัน"
            className="min-w-0 flex-1 rounded px-1"
            style={{ fontSize: 12, border: "1px solid var(--color-line)" }}
          />
          <button type="submit" style={{ fontSize: 12, fontWeight: 700 }}>
            บันทึก
          </button>
          <button type="button" style={{ fontSize: 12, color: "var(--color-muted)" }} onClick={() => setWipOpen(false)}>
            ยกเลิก
          </button>
        </form>
      )}

      {/* ── กองการ์ด (drop indicator แทรกอยู่ในกองนี้) ── */}
      <div className="flex min-h-0 flex-col overflow-y-auto" style={{ gap: 7 }} data-column-list={column.id}>
        {list}
        {cards.length === 0 && indicatorIndex === null && (
          <div
            className="grid place-items-center"
            style={{
              minHeight: 58,
              borderRadius: 10,
              border: "1.5px dashed var(--color-line2, #d4d4d4)",
              color: "var(--color-muted)",
              fontSize: 12,
            }}
          >
            ลากการ์ดมาวางที่นี่
          </div>
        )}
      </div>

      {/* ── ท้ายคอลัมน์ ── */}
      {composing && canEdit ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitDraft();
              }
              if (e.key === "Escape") {
                setDraft("");
                setComposing(false);
              }
            }}
            placeholder="ชื่องาน แล้วกด Enter"
            aria-label="ชื่อการ์ดใหม่"
            className="w-full rounded-[10px] p-2"
            style={{ fontSize: 12.8, background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitDraft}
              className="rounded-lg px-3 py-1.5"
              style={{ fontSize: 12.5, background: "var(--color-ink)", color: "var(--color-surface)" }}
            >
              เพิ่มการ์ด
            </button>
            <button
              type="button"
              aria-label="ปิดช่องเพิ่มการ์ด"
              onClick={() => {
                setDraft("");
                setComposing(false);
              }}
              style={{ color: "var(--color-muted)" }}
            >
              <KanbanIcon name="x" size="sm" />
            </button>
          </div>
        </div>
      ) : full ? (
        <div className="flex items-center" style={{ gap: 7, height: 32, padding: "0 6px", fontSize: 12.5, color: "var(--color-muted)" }}>
          <KanbanIcon name="lock" size="sm" />
          คอลัมน์เต็ม — ปิดงานก่อน
        </div>
      ) : (
        canEdit && (
          <div className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="add-card"
              onClick={() => setComposing(true)}
              className="flex items-center"
              style={{ gap: 7, height: 32, padding: "0 6px", borderRadius: 8, fontSize: 12.5, color: "var(--color-muted)" }}
            >
              <KanbanIcon name="plus" size="sm" />
              เพิ่มการ์ด
            </button>
            {/* K2.7 — "จากเทมเพลต ▾" ข้าง "+ เพิ่มการ์ด" (ซ่อนเมื่อบอร์ดไม่มีเทมเพลต — ซ่อนอยู่ในตัว CardTemplatePicker เอง) */}
            {cardTemplates.length > 0 && (
              <CardTemplatePicker templates={cardTemplates} onCreate={(templateId, title) => handlers.onCreateFromTemplate(column.id, templateId, title)} />
            )}
          </div>
        )
      )}
    </section>
  );
}

export default Column;
