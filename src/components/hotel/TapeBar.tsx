"use client";
// SVC H.2 ▸ แถบ 1 รายการบนปฏิทินห้อง (ภาพ 08) — เริ่มกลางวันเข้า จบกลางวันออก · สี/ลายตามคำอธิบาย 6 แบบ
//   ลากด้วย pointer events (ไม่ใช้ไลบรารี): ตัวแถบ = data-drag-handle (ย้ายห้อง/เลื่อนวัน) · ขอบขวา = data-resize-handle (ยืด/ย่นคืน)
//   ผู้ดูอย่างเดียว (canEdit = false) ⇒ ไม่ render data-tape-bar / data-drag-handle / data-resize-handle (มติ 7 · §7 ข้อ 10) — กดดูสรุปได้อย่างเดียว
import type { PointerEvent as ReactPointerEvent } from "react";
import { BAR_CLASS, barSpan, isDraggable, timeTh, type TapeBarDto } from "./tape-shared";

export type GrabEvent = ReactPointerEvent<HTMLElement>;

type Props = {
  bar: TapeBarDto;
  gridFrom: string;
  nDays: number;
  canEdit: boolean;
  /** ระหว่างลาก: เลื่อนแถบ (px) และยืดขอบขวา (วัน) */
  offsetX: number;
  offsetY: number;
  resizeDays: number;
  active: boolean;
  onGrab: (e: GrabEvent, bar: TapeBarDto, mode: "move" | "resize") => void;
  onOpen: (bar: TapeBarDto) => void;
};

export default function TapeBar({ bar, gridFrom, nDays, canEdit, offsetX, offsetY, resizeDays, active, onGrab, onOpen }: Props) {
  const span = barSpan({ from: bar.from, to: resizeDays ? shiftTo(bar.to, resizeDays) : bar.to }, gridFrom, nDays);
  const canDrag = canEdit && isDraggable(bar.kind);
  const hold = bar.kind === "HOLD" && bar.holdExpiresAt ? ` · ถึง ${timeTh(bar.holdExpiresAt)}` : "";
  const style = {
    left: `calc(${span.left * 100}% + 2px)`,
    width: `calc(${span.width * 100}% - 4px)`,
    transform: offsetX || offsetY ? `translate(${offsetX}px, ${offsetY}px)` : undefined,
    zIndex: active ? 20 : undefined,
  };
  const body = (
    <span className="block truncate">
      <b>{bar.guestName ?? bar.label.split(" · ")[0]}</b>
      <small className="opacity-80">{restOf(bar.label)}{hold}</small>
    </span>
  );
  if (!canEdit) {
    return (
      <div className={`absolute top-1.5 h-8 rounded-lg px-2 text-xs leading-8 ${BAR_CLASS[bar.kind]}`} style={style}>
        <button type="button" onClick={() => onOpen(bar)} className="h-full w-full text-left" aria-label={`ดูรายละเอียด ${bar.label}`}>
          {body}
        </button>
      </div>
    );
  }
  return (
    <div data-tape-bar={bar.kind} data-ref={bar.refId} className={`absolute top-1.5 h-8 rounded-lg px-2 text-xs leading-8 ${BAR_CLASS[bar.kind]} ${active ? "shadow-lg ring-2 ring-[color:var(--color-accent)]" : ""}`} style={style}>
      {canDrag ? (
        <button
          type="button"
          data-drag-handle=""
          onPointerDown={(e) => onGrab(e, bar, "move")}
          className="h-full w-full cursor-grab touch-none text-left active:cursor-grabbing"
          aria-label={`ลากเพื่อย้ายห้องหรือเลื่อนวัน ${bar.label}`}
        >
          {body}
        </button>
      ) : (
        <button type="button" onClick={() => onOpen(bar)} className="h-full w-full text-left" aria-label={`ดูรายละเอียด ${bar.label}`}>
          {body}
        </button>
      )}
      {canDrag && !span.clipR ? (
        <span
          data-resize-handle=""
          role="separator"
          aria-label="ลากขอบขวาเพื่อยืดหรือย่นคืน"
          onPointerDown={(e) => onGrab(e, bar, "resize")}
          className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize touch-none rounded-r-lg bg-black/10"
        />
      ) : null}
    </div>
  );
}

function restOf(label: string): string {
  const i = label.indexOf(" · ");
  return i === -1 ? "" : label.slice(i);
}
function shiftTo(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
