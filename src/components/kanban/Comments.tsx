// Comments.tsx — ชิ้นส่วนของ "ความเห็น" ในหลังการ์ด (K1.8 · จัดใหม่ใน K1.10)
// แบบ: `ledger/design-kanban/03-card-back.png` บล็อกล่างสุด
//
// 🔴 K1.10: บล็อกล่างของหลังการ์ดกลายเป็น "ความเห็นและกิจกรรม" (`Timeline.tsx`) — ตัวคุมสาย/แท็บ/
//    การโหลดเพิ่มย้ายไปอยู่ที่นั่น ส่วนไฟล์นี้เหลือ **ชิ้นส่วนที่ใช้ซ้ำ**: แถวความเห็น 1 ใบ (`CommentRow`)
//    ช่องเขียน (`CommentComposer`) และ hook รายชื่อสำหรับเมนู `@` — ไม่ทำสำเนาช่องเขียนไว้ 2 ที่
//    (ช่องเขียนยังอยู่ล่างสุดของบล็อกเหมือนภาพ 03 เป๊ะ)
//
// markup ที่เก็บใน DB = `@[ชื่อ](userId)` — ไฟล์นี้แปลงเป็น "ชิป @ชื่อ" ตอนเรนเดอร์เท่านั้น
// (ไม่ให้ server ประกอบ HTML ส่งมา — เนื้อความของผู้ใช้ห้ามกลายเป็น HTML ที่ browser เชื่อ)
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, formatCardDateTime } from "./Card";
import { KanbanIcon } from "./KanbanIcon";
import { listMentionTargetsAction } from "@/lib/modules/kanban/actions";
import { relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import type { KanbanCommentDto } from "@/lib/modules/kanban/types";

/** ต้องตรงกับ `MENTION_RE` ใน `src/lib/modules/kanban/comments.ts` (ฝั่ง server เป็นตัวตัดสิน) */
const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;
/** ข้อความก่อนเคอร์เซอร์ที่กำลัง "พิมพ์ @ ค้างอยู่" — จับคำหลัง @ ตัวสุดท้ายที่ยังไม่จบด้วยช่องว่าง */
const TYPING_MENTION_RE = /(?:^|\s)@([^\s@[\]()]{0,30})$/;

export type MentionPerson = { userId: string; name: string };

/**
 * รายชื่อ "คนที่ mention ได้" ของบอร์ดนี้ — โหลดครั้งเดียวต่อการเปิดหลังการ์ด (เล็กมาก)
 * ไม่รอให้ผู้ใช้พิมพ์ `@` ก่อน ไม่งั้นเมนูจะกะพริบตอนพิมพ์ตัวแรก
 */
export function useMentionPeople(systemId: string, boardId: string): MentionPerson[] {
  const [people, setPeople] = useState<MentionPerson[]>([]);
  useEffect(() => {
    let alive = true;
    listMentionTargetsAction({ systemId, boardId }).then((res) => {
      if (alive && res.ok) setPeople(res.people);
    });
    return () => {
      alive = false;
    };
  }, [systemId, boardId]);
  return people;
}

// ───────────────────────── ความเห็น 1 ใบ ─────────────────────────

export function CommentRow({
  comment,
  people,
  currentUserId,
  canEdit,
  canDelete,
  editing,
  nowMs,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  comment: KanbanCommentDto;
  people: MentionPerson[];
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  editing: boolean;
  /**
   * K1.10 — เวลาอ้างอิงจาก server: มีค่า = แสดงเวลาแบบสัมพัทธ์ ("5 นาทีที่แล้ว") ให้เข้าชุดกับแถว
   * กิจกรรมในสายเดียวกันตามภาพ 03 · ไม่ส่ง = วันเวลาเต็มแบบเดิม (K1.8) · เวลาเต็มยังอยู่ใน title เสมอ
   */
  nowMs?: number;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(comment.body);
  useEffect(() => {
    if (editing) setDraft(comment.body);
  }, [editing, comment.body]);

  // K3.5 — ความเห็นที่ผู้ช่วย AI เขียน: ชื่อบนหัวแถวคือ "ผู้ช่วย AI" ตามภาพ 03 (ห้ามขึ้นชื่อคนกด
  // เป็นคนพูด — §8.3) · ชื่อคนที่สั่งยังบอกไว้ข้าง ๆ เพื่อให้รู้ว่าใครเป็นคนกดปุ่ม
  const byAi = comment.aiGenerated;

  return (
    <li className="flex items-start gap-2" data-testid="comment">
      {byAi ? (
        <span
          className="flex flex-none items-center justify-center rounded-full"
          style={{
            width: 26,
            height: 26,
            color: "var(--color-accent)",
            border: "1px solid var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
          }}
        >
          <KanbanIcon name="spark" size="sm" />
        </span>
      ) : (
        <Avatar name={comment.author.name} size={26} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span style={{ fontSize: 12.5, fontWeight: 700 }} data-testid={byAi ? "comment-ai-author" : undefined}>
            {byAi ? "ผู้ช่วย AI" : comment.author.name}
          </span>
          {byAi && (
            <span data-testid="comment-ai-chip" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
              · สั่งโดย {comment.author.name}
            </span>
          )}
          {/* K2.12: ความเห็นที่กฎอัตโนมัติเขียน (ไม่ใช่คน) — ชิปบอกที่มา ห้ามให้ดูเหมือนคนพิมพ์เอง */}
          {comment.automationRuleId && (
            <span
              data-testid="comment-automation-chip"
              className="inline-flex items-center rounded-full"
              style={{ height: 17, padding: "0 7px", fontSize: 10.5, fontWeight: 600, color: "var(--color-accent)", border: "1px solid var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}
            >
              โดยกฎอัตโนมัติ
            </span>
          )}
          <span
            title={formatCardDateTime(comment.createdAt)}
            style={{ fontSize: 11.5, color: "var(--color-muted)" }}
          >
            {nowMs === undefined ? formatCardDateTime(comment.createdAt) : relativeThaiTime(comment.createdAt, nowMs)}
          </span>
          {comment.editedAt && (
            <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>· แก้ไขแล้ว</span>
          )}
          <span className="flex-1" />
          {canEdit && !editing && (
            <button
              type="button"
              onClick={onStartEdit}
              aria-label="แก้ความเห็น"
              className="rounded-md px-1"
              style={{ fontSize: 11.5, color: "var(--color-muted)" }}
            >
              แก้ไข
            </button>
          )}
          {canDelete && !editing && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="ลบความเห็น"
              className="rounded-md px-1"
              style={{ fontSize: 11.5, color: "var(--color-muted)" }}
            >
              ลบ
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              people={people}
              placeholder="แก้ความเห็น…"
              testId="comment-edit-input"
              onSubmit={() => onSaveEdit(draft)}
              rows={3}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSaveEdit(draft)}
                className="rounded-lg"
                style={{ height: 27, padding: "0 12px", fontSize: 12, background: "var(--color-ink)", color: "var(--color-surface)" }}
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border"
                style={{ height: 27, padding: "0 10px", fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-ink-soft)", whiteSpace: "pre-wrap" }}>
            <CommentBody body={comment.body} currentUserId={currentUserId} />
          </div>
        )}
      </div>
    </li>
  );
}

/** เนื้อความ → ข้อความธรรมดา + ชิป `@ชื่อ` (ของตัวเอง = เน้นสีเข้ม) */
function CommentBody({ body, currentUserId }: { body: string; currentUserId: string }) {
  const parts = useMemo(() => {
    const out: { key: string; text: string; userId?: string }[] = [];
    let last = 0;
    let i = 0;
    for (const m of body.matchAll(MENTION_RE)) {
      const at = m.index ?? 0;
      if (at > last) out.push({ key: `t${i}`, text: body.slice(last, at) });
      out.push({ key: `m${i}`, text: `@${m[1]}`, userId: m[2] });
      last = at + m[0].length;
      i += 1;
    }
    if (last < body.length) out.push({ key: `t${i}`, text: body.slice(last) });
    return out;
  }, [body]);

  return (
    <>
      {parts.map((p) =>
        p.userId ? (
          <span
            key={p.key}
            data-testid="mention-chip"
            className="rounded px-1"
            style={{
              color: "var(--color-accent)",
              background: p.userId === currentUserId ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
              fontWeight: 600,
            }}
          >
            {p.text}
          </span>
        ) : (
          <span key={p.key}>{p.text}</span>
        ),
      )}
    </>
  );
}

// ───────────────────────── ช่องเขียน ─────────────────────────

export function CommentComposer({
  people,
  onSubmit,
}: {
  people: MentionPerson[];
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSubmit(body);
    setSending(false);
    if (ok) setValue("");
  }, [value, sending, onSubmit]);

  // K1.13: ติดขอบล่าง (`position: sticky`) — CardBack.tsx เป็น scroll container เดียวของทั้งแผง
  // (ไม่มี overflow ซ้อนระหว่างที่นี่กับ panel นอกสุด) ⇒ sticky ใช้ได้ทั้งมือถือ (แผ่นเต็มจอ) และ
  // เดสก์ท็อป (โมดัล 872px) โดยไม่ต้องแยกโค้ดสองชุด
  return (
    <div
      data-testid="comment-composer"
      className="sticky bottom-0 flex items-start gap-2 border-t px-0.5 pt-2.5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }}
    >
      <div className="min-w-0 flex-1">
        <MentionTextarea
          value={value}
          onChange={setValue}
          people={people}
          placeholder="เขียนความเห็น… พิมพ์ @ เพื่อกล่าวถึงเพื่อนร่วมทีม"
          testId="comment-input"
          onSubmit={send}
          rows={2}
        />
      </div>
      <button
        type="button"
        data-testid="comment-send"
        onClick={send}
        disabled={sending || value.trim().length === 0}
        className="rounded-lg disabled:opacity-45"
        style={{ height: 32, padding: "0 14px", fontSize: 12.5, background: "var(--color-ink)", color: "var(--color-surface)" }}
      >
        ส่ง
      </button>
    </div>
  );
}

/**
 * textarea + เมนู `@` (autocomplete)
 * Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ (พิมพ์เขียว §5.6) — ตอนเมนูเปิดอยู่ Enter = เลือกคน
 */
function MentionTextarea({
  value,
  onChange,
  people,
  placeholder,
  testId,
  onSubmit,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  people: MentionPerson[];
  placeholder: string;
  testId: string;
  onSubmit: () => void;
  rows: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    return people.filter((p) => (q ? p.name.toLowerCase().includes(q) : true)).slice(0, 8);
  }, [query, people]);
  const menuOpen = query !== null && matches.length > 0;

  /** อ่าน "กำลังพิมพ์ @อะไรอยู่" จากข้อความก่อนเคอร์เซอร์ */
  const refreshQuery = useCallback((el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = before.match(TYPING_MENTION_RE);
    setQuery(m ? (m[1] ?? "") : null);
    setHighlight(0);
  }, []);

  const pick = useCallback(
    (person: MentionPerson) => {
      const el = ref.current;
      if (!el) return;
      const caret = el.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const m = before.match(TYPING_MENTION_RE);
      if (!m) return;
      const start = caret - m[0].length + (m[0].startsWith("@") ? 0 : 1); // เว้นช่องว่างนำหน้าไว้
      const token = `@[${person.name}](${person.userId}) `;
      const next = value.slice(0, start) + token + value.slice(caret);
      onChange(next);
      setQuery(null);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [value, onChange],
  );

  return (
    <div className="relative">
      <textarea
        ref={ref}
        data-testid={testId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target);
        }}
        onClick={(e) => refreshQuery(e.currentTarget)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) refreshQuery(e.currentTarget);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const person = matches[highlight];
              if (person) pick(person);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full rounded-lg border px-2.5 py-2"
        style={{ fontSize: 13, lineHeight: 1.6, borderColor: "var(--color-line)", background: "var(--color-surface)" }}
      />
      {menuOpen && (
        <div
          data-testid="mention-menu"
          role="listbox"
          className="absolute left-2 z-30 w-56 overflow-hidden rounded-xl border shadow-lg"
          style={{ bottom: "calc(100% + 4px)", borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          {matches.map((p, i) => (
            <button
              key={p.userId}
              type="button"
              role="option"
              aria-selected={i === highlight}
              data-testid="mention-option"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setHighlight(i)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
              style={{ fontSize: 12.5, background: i === highlight ? "var(--color-surface-2)" : "transparent" }}
            >
              <Avatar name={p.name} size={22} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
