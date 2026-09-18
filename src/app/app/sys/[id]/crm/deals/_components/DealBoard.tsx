"use client";

// DealBoard.tsx — กระดานดีล (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.2 · ภาพ 02)
//   • คอลัมน์ต่อขั้น: ชื่อ · % · จำนวน · ยอดรวม · ถ่วงน้ำหนัก (ตัวเลขจากบริการ — รวมใน SQL) · คอลัมน์ ชนะ/แพ้ พับได้
//   • การ์ด 8 องค์ประกอบ: ชื่อ · บริษัท · มูลค่า · ผู้ดูแล · วันปิดคาด · ป้ายนิ่ง · คะแนน · กิจกรรม/ขั้นถัดไป
//   • ลากวางด้วย hook กลาง `usePointerBoardDrag` (ตัวเดียวกับบอร์ดงาน · pointer events — มือถือกดค้างแล้วลาก)
//   • มือถือ (< 640px): คอลัมน์กว้างเต็มจอเลื่อนทีละขั้น (scroll-snap) + แถบแท็บขั้นด้านบน (swipe ต่อขั้น)
//   • ย้ายแบบ optimistic → บริการปฏิเสธ = คืนที่เดิม + ข้อความไทย · แพ้/เปิดใหม่/เงื่อนไขก่อนเข้าขั้น → หน้าต่างของ `useDealMover`

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePointerBoardDrag } from "@/components/shared/usePointerBoardDrag";
import { formatBaht, formatThaiDay, type BoardColumnDto, type DealCardDto, type DealKind } from "@/lib/modules/crm/deals-shared";
import { useDealMover } from "./DealMoveDialogs";

/** ระยะห่างการ์ดในกอง (ต้องตรงกับ gap ของกองการ์ด — `gap-2` = 8px) */
const CARD_GAP = 8;
const DRAG_THRESHOLD_PX = 4;
/** นิ้ว/ปากกา: กดค้าง 300 ms ก่อนยกการ์ด (เลื่อนจอได้ตามปกติ) */
const HOLD_MS = 300;

type Col = BoardColumnDto & { id: string };

const initials = (name: string | null) => (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";

function DealCard({
  card,
  base,
  nowKey,
  onPointerDown,
  registerRef,
  ghost = false,
  onOpen,
}: {
  card: DealCardDto;
  base: string;
  nowKey: string;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  registerRef?: (el: HTMLElement | null) => void;
  ghost?: boolean;
  onOpen?: () => void;
}) {
  const overdue = card.kind === "OPEN" && !!card.expectedCloseAt && card.expectedCloseAt < nowKey;
  return (
    <div
      ref={registerRef}
      onPointerDown={onPointerDown}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onOpen) onOpen();
      }}
      aria-label={`ดีล ${card.title}`}
      className="card flex cursor-grab select-none flex-col gap-1.5 p-3 text-sm active:cursor-grabbing"
      style={{ boxShadow: ghost ? "0 12px 28px rgba(0,0,0,.18)" : undefined, transform: ghost ? "rotate(1.5deg)" : undefined, touchAction: "manipulation" }}
      data-testid={`deal-card-${card.id}`}
    >
      <Link href={`${base}/${card.id}`} className="font-medium leading-snug hover:underline" data-testid={`deal-card-link-${card.id}`} onClick={(e) => e.stopPropagation()}>
        {card.title}
      </Link>
      <span className="text-xs text-[color:var(--color-muted)]">
        {card.companyName ?? card.contactName} · {formatBaht(card.valueSatang)}
      </span>
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {card.stale && (
          <span className="rounded-md border px-1.5 py-0.5 font-semibold" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
            นิ่ง
          </span>
        )}
        <span className="rounded-md border px-1.5 py-0.5 text-[color:var(--color-muted)]">คะแนน {card.score.toLocaleString("th-TH")}</span>
        {card.expectedCloseAt && (
          <span className="rounded-md border px-1.5 py-0.5" style={overdue ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" } : { color: "var(--color-muted)" }}>
            ปิดคาด {formatThaiDay(card.expectedCloseAt)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-[color:var(--color-muted)]">
          {card.nextStep ? `ถัดไป: ${card.nextStep}` : card.nextActivityAt ? `นัดถัดไป ${formatThaiDay(card.nextActivityAt.slice(0, 10))}` : "ยังไม่มีขั้นถัดไป"}
        </span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold" title={card.ownerName ?? "ยังไม่มีผู้ดูแล"} aria-label={`ผู้ดูแล ${card.ownerName ?? "ยังไม่มี"}`}>
          {initials(card.ownerName)}
        </span>
      </div>
    </div>
  );
}

export function DealBoard({
  systemId,
  pipelineId,
  columns: initial,
  canDrag,
  canReopen,
  lostReasons,
  fieldLabels,
  nowKey,
}: {
  systemId: string;
  pipelineId: string;
  columns: BoardColumnDto[];
  canDrag: boolean;
  canReopen: boolean;
  lostReasons: { id: string; label: string }[];
  fieldLabels: Record<string, string>;
  /** วันนี้ตามปฏิทินไทย "YYYY-MM-DD" (เซิร์ฟเวอร์ส่งมา — กัน hydration ต่างกัน) */
  nowKey: string;
}) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/deals`;
  const toCols = (cs: BoardColumnDto[]): Col[] => cs.map((c) => ({ ...c, id: c.stageId }));
  const [columns, setColumns] = useState<Col[]>(() => toCols(initial));
  const columnsRef = useRef<Col[]>(columns);
  const setCols = useCallback((next: Col[]) => {
    columnsRef.current = next;
    setColumns(next);
  }, []);
  // ข้อมูลใหม่จากเซิร์ฟเวอร์ (router.refresh หลังย้ายสำเร็จ) → ใช้ตัวเลขจริงแทน optimistic
  useEffect(() => {
    setCols(toCols(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เทียบเฉพาะข้อมูลที่เซิร์ฟเวอร์ส่งลงมาใหม่
  }, [initial, setCols]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string>(initial[0]?.stageId ?? "");
  const scroller = useRef<HTMLDivElement | null>(null);

  const mover = useDealMover({ systemId, lostReasons, fieldLabels, canReopen, onMoved: () => router.refresh() });

  const onDrop = useCallback(
    (card: DealCardDto, fromColumnId: string, toColumnId: string) => {
      if (fromColumnId === toColumnId) return; // ดีลไม่มีลำดับในคอลัมน์ — วางที่เดิม = ไม่ทำอะไร
      const snapshot = columnsRef.current;
      const to = snapshot.find((c) => c.id === toColumnId);
      const from = snapshot.find((c) => c.id === fromColumnId);
      if (!to || !from) return;
      const moved = { ...card, stageId: to.stageId, kind: to.kind, probability: to.probability };
      setCols(
        snapshot.map((c) =>
          c.id === fromColumnId
            ? { ...c, cards: c.cards.filter((x) => x.id !== card.id), count: Math.max(0, c.count - 1), sumSatang: c.sumSatang - card.valueSatang }
            : c.id === toColumnId
              ? { ...c, cards: [moved, ...c.cards], count: c.count + 1, sumSatang: c.sumSatang + card.valueSatang }
              : c,
        ),
      );
      mover.requestMove({
        dealId: card.id,
        fromKind: from.kind,
        to: { id: to.stageId, name: to.name, kind: to.kind },
        onDone: (ok) => {
          if (!ok) setCols(snapshot); // บริการปฏิเสธ/ยกเลิก = คืนที่เดิม
        },
      });
    },
    [mover, setCols],
  );

  const { drag, onCardPointerDown, draggedAt, columnEls, cardEls, indicatorEl } = usePointerBoardDrag<DealCardDto>({
    columnsRef,
    canDrag,
    gapPx: CARD_GAP,
    thresholdPx: DRAG_THRESHOLD_PX,
    holdMs: HOLD_MS,
    onDrop,
  });

  const open = (id: string) => {
    if (Date.now() - draggedAt.current < 250) return; // เพิ่งลากเสร็จ ไม่ใช่การคลิกเปิด
    router.push(`${base}/${id}`);
  };

  const scrollToStage = (stageId: string) => {
    setActive(stageId);
    const el = columnEls.current.get(stageId);
    if (el && scroller.current) scroller.current.scrollTo({ left: el.offsetLeft - scroller.current.offsetLeft, behavior: "smooth" });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="deal-board" style={{ userSelect: drag ? "none" : undefined, touchAction: drag ? "none" : undefined }}>
      {/* มือถือ: แท็บขั้น (swipe ต่อขั้น) */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 sm:hidden" aria-label="เลือกขั้นของดีล" data-testid="deal-stage-tabs">
        {columns.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => scrollToStage(c.stageId)}
            className="whitespace-nowrap rounded-full border px-3 py-1 text-xs"
            style={active === c.stageId ? { background: "var(--color-ink, #111)", color: "#fff" } : undefined}
            data-testid={`deal-stage-tab-${c.stageId}`}
          >
            {c.name} · {c.count.toLocaleString("th-TH")}
          </button>
        ))}
      </nav>
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:snap-none"
        onScroll={(e) => {
          const box = e.currentTarget;
          let best = active;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const c of columnsRef.current) {
            const el = columnEls.current.get(c.id);
            if (!el) continue;
            const d = Math.abs(el.offsetLeft - box.offsetLeft - box.scrollLeft);
            if (d < bestDist) {
              bestDist = d;
              best = c.id;
            }
          }
          if (best !== active) setActive(best);
        }}
      >
        {columns.map((c) => {
          const closed = c.kind !== "OPEN";
          const isCollapsed = closed && !!collapsed[c.id];
          const list = drag ? c.cards.filter((x) => x.id !== drag.card.id) : c.cards;
          const indicatorAt = drag?.over && drag.over.columnId === c.id && drag.fromColumnId !== c.id ? 0 : null;
          return (
            <section
              key={c.id}
              ref={(el) => {
                if (el) columnEls.current.set(c.id, el);
                else columnEls.current.delete(c.id);
              }}
              className="flex w-[86vw] shrink-0 snap-start flex-col gap-2 rounded-xl p-2 sm:w-[272px]"
              style={{ background: "var(--color-surface-2)", minHeight: 160 }}
              aria-label={`ขั้น ${c.name}`}
              data-testid={`deal-column-${c.stageId}`}
            >
              <header className="flex flex-col gap-0.5 px-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {c.kind === "WON" ? "✓ " : c.kind === "LOST" ? "✕ " : ""}
                    <span className="truncate">{c.name}</span>
                    <span className="rounded-md border px-1 text-[11px] font-normal text-[color:var(--color-muted)]">{c.probability}%</span>
                    <span className="text-xs font-normal text-[color:var(--color-muted)]">{c.count.toLocaleString("th-TH")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {c.kind === "OPEN" && (
                      <Link
                        href={`${base}/new?pipeline=${encodeURIComponent(pipelineId)}&stage=${encodeURIComponent(c.stageId)}`}
                        className="px-1 text-lg leading-none text-[color:var(--color-muted)]"
                        aria-label={`เพิ่มดีลในขั้น ${c.name}`}
                        data-testid={`deal-column-add-${c.stageId}`}
                      >
                        +
                      </Link>
                    )}
                    {closed && (
                      <button
                        type="button"
                        className="px-1 text-xs text-[color:var(--color-muted)] underline"
                        onClick={() => setCollapsed((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        aria-expanded={!isCollapsed}
                        data-testid={`deal-column-collapse-${c.stageId}`}
                      >
                        {isCollapsed ? "แสดง" : "พับ"}
                      </button>
                    )}
                  </span>
                </div>
                <span className="text-xs text-[color:var(--color-muted)]">
                  รวม {formatBaht(c.sumSatang)}
                  {c.kind === "OPEN" ? ` · ถ่วงน้ำหนัก ${formatBaht(c.weightedSatang)}` : ""}
                </span>
              </header>
              {!isCollapsed && (
                <div className="flex flex-col gap-2">
                  {indicatorAt !== null && (
                    <div
                      ref={(el) => {
                        indicatorEl.current = el;
                      }}
                      className="rounded-lg border-2 border-dashed"
                      style={{ height: Math.min(drag?.height ?? 80, 120), borderColor: "var(--color-accent)" }}
                      aria-hidden
                    />
                  )}
                  {list.map((card) => (
                    <DealCard
                      key={card.id}
                      card={card}
                      base={base}
                      nowKey={nowKey}
                      onPointerDown={(e) => onCardPointerDown(e, card, c.id)}
                      registerRef={(el) => {
                        if (el) cardEls.current.set(card.id, el);
                        else cardEls.current.delete(card.id);
                      }}
                      onOpen={() => open(card.id)}
                    />
                  ))}
                  {list.length === 0 && indicatorAt === null && <p className="px-1 py-3 text-center text-xs text-[color:var(--color-muted)]">ยังไม่มีดีลในขั้นนี้</p>}
                  {c.count > c.cards.length && (
                    <Link href={`${base}?view=table&pipeline=${encodeURIComponent(pipelineId)}&stage=${encodeURIComponent(c.stageId)}`} className="px-1 text-xs underline" data-testid={`deal-column-more-${c.stageId}`}>
                      ดูทั้งหมด {c.count.toLocaleString("th-TH")} ดีล
                    </Link>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {drag && (
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }} aria-hidden>
          <DealCard card={drag.card} base={base} nowKey={nowKey} ghost />
        </div>
      )}
      {mover.dialogs}
    </div>
  );
}
