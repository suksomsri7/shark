// Card.tsx — การ์ด 1 ใบบนบอร์ด (K1.5) · แบบที่เคาะ: `ledger/design-kanban/02-board.png` (.kc ใน _kb.part)
// โครง: ปก → ชิปที่มา → ชื่อ → ป้ายกำกับ → แถวท้าย (กำหนดส่ง · ตราเช็คลิสต์/ไฟล์/ความเห็น · รูปคน)
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> (สไปรต์ที่คัดจากแบบ)
"use client";

import { KanbanIcon } from "./KanbanIcon";
import type { BoardCardDto, KanbanTagColor } from "@/lib/modules/kanban/types";

// ── วันเวลาแบบไทย: คำนวณเองทั้งหมด (ไม่พึ่ง toLocaleString) ──
// ⚠️ เหตุผล: หน้านี้เรนเดอร์ทั้งฝั่ง server (Node ICU) และ hydrate ฝั่ง browser (Chromium ICU)
//    ถ้าใช้ toLocaleDateString("th-TH") แล้ว ICU สองฝั่งให้สตริงต่างกัน จะได้ hydration error
//    (= console error ⇒ ข้อสอบภาพตก) และปี พ.ศ./ค.ศ. ก็ต่างกันได้ตามเวอร์ชัน
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_WDAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST)

type BkkParts = { day: number; month: number; year: number; hour: number; minute: number; weekday: number; dayIndex: number };

function bkk(ms: number): BkkParts {
  const d = new Date(ms + BKK_OFFSET_MS);
  return {
    day: d.getUTCDate(),
    month: d.getUTCMonth(),
    year: d.getUTCFullYear(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    dayIndex: Math.floor((ms + BKK_OFFSET_MS) / 86_400_000),
  };
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const fmtDay = (p: BkkParts) => `${p.day} ${TH_MONTH[p.month]}`;

/** "พฤ. 11 ก.ย. 2569 · 17:00" (ปี พ.ศ. — K1.6 หลังการ์ด) */
export function formatCardDateTime(iso: string): string {
  const p = bkk(Date.parse(iso));
  return `${TH_WDAY[p.weekday]} ${p.day} ${TH_MONTH[p.month]} ${p.year + 543} · ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "11 ก.ย. 2569" (ไม่มีเวลา — ใช้กับวันเริ่ม) */
export function formatCardDate(iso: string): string {
  const p = bkk(Date.parse(iso));
  return `${p.day} ${TH_MONTH[p.month]} ${p.year + 543}`;
}

export type DueBadge = { text: string; tone: "gray" | "amber" | "red" | "green"; icon?: string };

/**
 * ป้ายกำหนดส่งตามความหมายแบบ Trello (พิมพ์เขียว §3.2):
 *   เสร็จแล้ว = เขียว · เลยกำหนด = แดง · ภายใน 24 ชม. = อำพัน · ไกลกว่านั้น = เทา
 * `nowMs` มาจาก server (DTO.now) เพื่อให้ HTML ของ server กับ client ตรงกันเป๊ะ
 *
 * ⚠️ K1.13: รับ primitive (`dueAt`/`completedAt`) แยกจากทั้งการ์ด — `MyTasks.tsx` มี `MyTaskCardDto`
 *    ที่ไม่ใช่ `BoardCardDto` เต็มรูป (ไม่มี `completedAt`/`assignees`/ฯลฯ) แต่อยากได้ชิปกำหนดส่งแบบเดียวกัน
 */
export function dueBadgeFrom(dueAt: string | null, completedAt: string | null, nowMs: number): DueBadge | null {
  if (completedAt) {
    return { text: `เสร็จ ${fmtDay(bkk(Date.parse(completedAt)))}`, tone: "green", icon: "check" };
  }
  if (!dueAt) return null;
  const dueMs = Date.parse(dueAt);
  const diff = dueMs - nowMs;
  const due = bkk(dueMs);
  const now = bkk(nowMs);
  if (diff < 0) {
    const hours = Math.floor(-diff / 3_600_000);
    return {
      text: hours < 24 ? `เลย ${Math.max(hours, 1)} ชม.` : `เลย ${Math.floor(hours / 24)} วัน`,
      tone: "red",
      icon: "clock",
    };
  }
  if (diff <= 86_400_000) {
    const sameDay = due.dayIndex === now.dayIndex;
    return {
      text: sameDay ? `วันนี้ ${due.hour}:${pad2(due.minute)}` : "พรุ่งนี้",
      tone: "amber",
      icon: "clock",
    };
  }
  const daysAway = due.dayIndex - now.dayIndex;
  return { text: daysAway <= 6 ? `${TH_WDAY[due.weekday]} ${fmtDay(due)}` : fmtDay(due), tone: "gray" };
}

export function dueBadgeOf(card: BoardCardDto, nowMs: number): DueBadge | null {
  return dueBadgeFrom(card.dueAt, card.completedAt, nowMs);
}

export const DUE_STYLE: Record<DueBadge["tone"], { color: string; border: string; background: string }> = {
  gray: { color: "var(--color-muted)", border: "var(--color-line)", background: "var(--color-surface)" },
  amber: { color: "var(--color-tag-amber)", border: "var(--color-tag-amber)", background: "var(--color-due-soon-bg)" },
  red: { color: "var(--color-tag-red)", border: "var(--color-tag-red)", background: "var(--color-due-late-bg)" },
  green: { color: "var(--color-tag-green)", border: "var(--color-tag-green)", background: "var(--color-due-done-bg)" },
};

/** สีป้ายกำกับ 6 สี (D9) → โทเคน `--color-tag-*` (ห้ามพิมพ์ hex ในคอมโพเนนต์) */
export function tagColorVar(color: KanbanTagColor): string {
  return `var(--color-tag-${color.toLowerCase()})`;
}

/** ชิป "ที่มา" ของการ์ด — MANUAL (คนพิมพ์เอง) ไม่โชว์ชิป */
const SOURCE_LABEL: Record<BoardCardDto["sourceType"], { text: string; icon: string } | null> = {
  MANUAL: null,
  TEMPLATE: { text: "จากเทมเพลต", icon: "copy" },
  CHAT: { text: "จากแชท", icon: "line" },
  FORM: { text: "จากฟอร์ม", icon: "mail" },
  EMAIL: { text: "จากอีเมล", icon: "mail" },
  AUTOMATION: { text: "จากกฎอัตโนมัติ", icon: "spark" },
  AI: { text: "จากผู้ช่วย AI", icon: "spark" },
};

/** ตัวย่อชื่อคน (อักษรแรก) — ใช้ทั้งบนการ์ดและหัวบอร์ด */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      className="grid shrink-0 place-items-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
        fontSize: 11,
        color: "var(--color-ink-soft)",
      }}
    >
      {initialOf(name)}
    </span>
  );
}

export function Card({
  card,
  nowMs,
  dragging = false,
  ghost = false,
  onPointerDown,
  onOpen,
  onKeyDown,
  registerRef,
}: {
  card: BoardCardDto;
  nowMs: number;
  /** การ์ดใบนี้กำลังถูกยกอยู่ (ทำจาง) */
  dragging?: boolean;
  /** ใบที่ลอยตามเมาส์ (เอียง+เงาตามแบบ `.kc.drag`) */
  ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onOpen?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const due = dueBadgeOf(card, nowMs);
  const source = SOURCE_LABEL[card.sourceType];
  const badges: { icon: string; text: string }[] = [];
  if (card.checklistTotal > 0) badges.push({ icon: "cklist", text: `${card.checklistDone}/${card.checklistTotal}` });
  if (card.attachmentCount > 0) badges.push({ icon: "clip", text: String(card.attachmentCount) });
  if (card.commentCount > 0) badges.push({ icon: "chat", text: String(card.commentCount) });

  return (
    <article
      data-testid="card"
      data-card-id={card.id}
      ref={registerRef}
      tabIndex={0}
      role="button"
      aria-label={`การ์ด ${card.title}`}
      title={card.cardNo ? `#${card.cardNo} · ${card.title}` : card.title}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      className="flex cursor-pointer flex-col gap-1.5 outline-none focus-visible:ring-2"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: 10,
        padding: "8px 9px 7px",
        boxShadow: ghost ? "0 10px 24px rgba(10,10,10,.18)" : "0 1px 1px rgba(10,10,10,.05)",
        transform: ghost ? "rotate(2.4deg)" : undefined,
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {card.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ปกการ์ดเป็น URL จาก CDN ของร้าน (K1.9 จะย้ายไป next/image พร้อม loader)
        <img
          src={card.coverUrl}
          alt=""
          style={{ height: 64, borderRadius: 7, objectFit: "cover", margin: "-2px 0 1px" }}
        />
      )}
      {source && (
        <span
          className="inline-flex items-center gap-1 self-start"
          style={{
            fontSize: 10.5,
            color: "var(--color-accent)",
            background: "var(--color-out)",
            borderRadius: 5,
            padding: "1px 6px",
          }}
        >
          <KanbanIcon name={source.icon} size="xs" />
          {source.text}
        </span>
      )}
      <div style={{ fontSize: 12.8, lineHeight: 1.4, fontWeight: 500 }}>{card.title}</div>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 4 }}>
          {card.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center font-semibold"
              style={{
                height: 18,
                padding: "0 6px",
                borderRadius: 5,
                fontSize: 10.5,
                color: tagColorVar(l.color),
                border: `1px solid ${tagColorVar(l.color)}`,
                background: "var(--color-surface)",
              }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center" style={{ gap: 9, fontSize: 11, color: "var(--color-muted)" }}>
        {due && (
          <span
            className="inline-flex items-center whitespace-nowrap font-semibold"
            title={card.dueAt ? "กำหนดส่ง" : undefined}
            style={{
              gap: 4,
              height: 19,
              padding: "0 6px",
              borderRadius: 5,
              fontSize: 10.5,
              color: DUE_STYLE[due.tone].color,
              border: `1px solid ${DUE_STYLE[due.tone].border}`,
              background: DUE_STYLE[due.tone].background,
            }}
          >
            {due.icon && <KanbanIcon name={due.icon} size="xs" />}
            {due.text}
          </span>
        )}
        <span className="flex-1" />
        {badges.map((b) => (
          <span key={b.icon} className="inline-flex items-center tabular-nums" style={{ gap: 3 }}>
            <KanbanIcon name={b.icon} size="xs" />
            {b.text}
          </span>
        ))}
        {card.assignees.slice(0, 3).map((a) => (
          <Avatar key={a.userId} name={a.name} />
        ))}
      </div>
    </article>
  );
}

export default Card;
