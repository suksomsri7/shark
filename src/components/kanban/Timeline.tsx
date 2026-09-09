// Timeline.tsx — บล็อก "ความเห็นและกิจกรรม" ของหลังการ์ด (K1.10)
// แบบที่เคาะ: `ledger/design-kanban/03-card-back.png` บล็อกล่างสุด —
//   หัวข้อ 💬 ความเห็นและกิจกรรม · แท็บ [ทั้งหมด] [ความเห็น] [กิจกรรม] ชิดขวา
//   → สายรวมเรียงล่าสุดก่อน (ความเห็น = รูปคน+ข้อความ · กิจกรรม = ไอคอน+ประโยคไทย+เวลาแบบสัมพัทธ์)
//   → ปุ่ม "โหลดเพิ่ม" (cursor) → ช่องเขียนความเห็นติดล่างสุด
//
// 🔴 ช่องเขียน/แถวความเห็นใช้ชิ้นส่วนจาก `Comments.tsx` (K1.8) ตรง ๆ — ไม่ทำสำเนา
//    (`comment-input` / `mention-menu` จึงยังเป็นของไฟล์เดิมเหมือนที่ข้อสอบ K1.8 ตรวจ)
// 🔴 เวลาแบบ "3 ชั่วโมงที่แล้ว" คิดจาก `nowMs` ที่ server ส่งมา ไม่ใช่ `Date.now()` ฝั่ง client
//    (ไม่งั้น HTML ของ server กับ client ต่างกัน = hydration error — บทเรียน K1.5)
// 🔴 ประโยคไทยมาจาก `activity-text.ts` (ไฟล์บริสุทธิ์) ไม่ใช่ `activity.ts` ที่มี prisma ติดมา
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CommentComposer, CommentRow, useMentionPeople } from "./Comments";
import { KanbanIcon } from "./KanbanIcon";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  listBoardActivityAction,
  listCardTimelineAction,
} from "@/lib/modules/kanban/actions";
import { activityIconName, describeActivity, relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import type {
  KanbanActivityDto,
  KanbanCommentDto,
  KanbanTimelineFilter,
  KanbanTimelineItemDto,
} from "@/lib/modules/kanban/types";

const TABS: { key: KanbanTimelineFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "comments", label: "ความเห็น" },
  { key: "activity", label: "กิจกรรม" },
];

const PAGE_SIZE = 20;

const EMPTY_TEXT: Record<KanbanTimelineFilter, string> = {
  all: "ยังไม่มีความเห็นหรือกิจกรรมในการ์ดนี้",
  comments: "ยังไม่มีความเห็นในการ์ดนี้",
  activity: "ยังไม่มีกิจกรรมในการ์ดนี้",
};

export type TimelineProps = {
  systemId: string;
  boardId: string;
  cardId: string;
  /** เขียน/แก้ความเห็นได้ไหม (EDITOR+ ของบอร์ด) */
  editable: boolean;
  /** ผู้ดูแลบอร์ด — ลบความเห็นของคนอื่นได้ */
  isBoardAdmin: boolean;
  currentUserId: string;
  /** ความเห็นที่มากับ `getCardDetail` — ใช้วาดทันทีระหว่างรอสายรวมจาก server (ไม่ให้บล็อกกะพริบ) */
  comments: KanbanCommentDto[];
  /** เวลาอ้างอิงจาก server (`BoardViewDto.now`) — ใช้คิด "x นาทีที่แล้ว" ให้ 2 ฝั่งตรงกัน */
  nowMs: number;
  /**
   * K3.5 — ตัวนับที่ "คนอื่นในหลังการ์ด" ขยับเมื่อเขียนความเห็น/กิจกรรมจากนอกบล็อกนี้
   * (ปุ่มผู้ช่วย AI เขียนความเห็นผ่าน action ของตัวเอง) ⇒ สายรวมต้องโหลดใหม่
   * ** บล็อกนี้เก็บ `items` ของตัวเองจาก server ไม่ได้อ่านจาก prop `comments` หลังเรนเดอร์แรก
   *    ⇒ ถ้าไม่มีตัวนับนี้ กดปุ่ม AI แล้ว "ไม่มีอะไรเกิดขึ้นบนจอ" จนกว่าจะสลับแท็บ (บั๊กที่ภาพ K3.5 จับได้)
   */
  reloadKey?: number;
  onCommentsChange: (comments: KanbanCommentDto[]) => void;
  onToast: (message: string) => void;
};

function commentsToItems(comments: KanbanCommentDto[]): KanbanTimelineItemDto[] {
  return [...comments]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((comment) => ({ kind: "comment" as const, id: comment.id, createdAt: comment.createdAt, comment }));
}

export function Timeline({
  systemId,
  boardId,
  cardId,
  editable,
  isBoardAdmin,
  currentUserId,
  comments,
  nowMs,
  reloadKey = 0,
  onCommentsChange,
  onToast,
}: TimelineProps) {
  const people = useMentionPeople(systemId, boardId);
  const [filter, setFilter] = useState<KanbanTimelineFilter>("all");
  const [items, setItems] = useState<KanbanTimelineItemDto[]>(() => commentsToItems(comments));
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // กันผลลัพธ์ของคำขอเก่ามาทับของใหม่ (สลับแท็บเร็ว ๆ)
  const requestRef = useRef(0);

  const load = useCallback(
    async (next: KanbanTimelineFilter) => {
      const token = ++requestRef.current;
      setLoading(true);
      const res = await listCardTimelineAction({ systemId, cardId, filter: next, take: PAGE_SIZE });
      if (token !== requestRef.current) return;
      setLoading(false);
      if (!res.ok) {
        onToast(res.message || "โหลดประวัติกิจกรรมไม่สำเร็จ");
        return;
      }
      setItems(res.items);
      setCursor(res.nextCursor);
    },
    [systemId, cardId, onToast],
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    const token = ++requestRef.current;
    setLoading(true);
    const res = await listCardTimelineAction({ systemId, cardId, filter, take: PAGE_SIZE, cursor });
    if (token !== requestRef.current) return;
    setLoading(false);
    if (!res.ok) {
      onToast(res.message || "โหลดเพิ่มไม่สำเร็จ");
      return;
    }
    setItems((prev) => [...prev, ...res.items.filter((x) => !prev.some((p) => p.id === x.id))]);
    setCursor(res.nextCursor);
  }, [cursor, loading, systemId, cardId, filter, onToast]);

  /** ทุกการเปลี่ยนความเห็นสำเร็จ → sync ตราบนการ์ด + โหลดสายใหม่ (กิจกรรมใบใหม่โผล่ด้วย) */
  const afterCommentChange = useCallback(
    (nextComments: KanbanCommentDto[]) => {
      onCommentsChange(nextComments);
      void load(filter);
    },
    [onCommentsChange, load, filter],
  );

  const submit = useCallback(
    async (body: string): Promise<boolean> => {
      const res = await addCommentAction({ systemId, boardId, cardId, body });
      if (!res.ok) {
        onToast(res.message || "ส่งความเห็นไม่สำเร็จ");
        return false;
      }
      afterCommentChange(res.comments);
      return true;
    },
    [systemId, boardId, cardId, onToast, afterCommentChange],
  );

  const saveEdit = useCallback(
    (comment: KanbanCommentDto, body: string) => {
      setEditingId(null);
      if (body.trim() === comment.body.trim()) return;
      const before = items;
      // optimistic: แปะข้อความใหม่ลงแถวก่อน แล้วค่อยยืนยันกับ server (แพตเทิร์นเดียวกับ K1.7/K1.8)
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "comment" && it.id === comment.id
            ? { ...it, comment: { ...it.comment, body, editedAt: new Date().toISOString() } }
            : it,
        ),
      );
      editCommentAction({ systemId, boardId, cardId, commentId: comment.id, body }).then((res) => {
        if (res.ok) {
          afterCommentChange(res.comments);
          return;
        }
        setItems(before);
        onToast(res.message || "แก้ความเห็นไม่สำเร็จ");
      });
    },
    [items, systemId, boardId, cardId, onToast, afterCommentChange],
  );

  const remove = useCallback(
    (comment: KanbanCommentDto) => {
      if (typeof window !== "undefined" && !window.confirm("ลบความเห็นนี้?")) return;
      const before = items;
      setItems((prev) => prev.filter((it) => !(it.kind === "comment" && it.id === comment.id)));
      deleteCommentAction({ systemId, boardId, cardId, commentId: comment.id }).then((res) => {
        if (res.ok) {
          afterCommentChange(res.comments);
          return;
        }
        setItems(before);
        onToast(res.message || "ลบความเห็นไม่สำเร็จ");
      });
    },
    [items, systemId, boardId, cardId, onToast, afterCommentChange],
  );

  return (
    // testid `comments` คงไว้จาก K1.8 (harness ภาพเดิมชี้ที่บล็อกนี้) — บล็อกเดียวกัน แค่มีกิจกรรมเพิ่มเข้ามา
    <div className="flex flex-col gap-3" data-testid="comments">
      <div className="flex flex-wrap items-center gap-2">
        <KanbanIcon name="chat" size="sm" className="text-[color:var(--color-muted)]" />
        <span style={{ fontSize: 13, fontWeight: 700 }}>ความเห็นและกิจกรรม</span>
        <span className="flex-1" />
        <div
          data-testid="timeline-filter"
          role="tablist"
          aria-label="ตัวกรองสายความเห็นและกิจกรรม"
          className="flex items-center"
          style={{ gap: 4 }}
        >
          {TABS.map((tab) => {
            const active = tab.key === filter;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid="timeline-tab"
                onClick={() => setFilter(tab.key)}
                className="rounded-lg border"
                style={{
                  height: 26,
                  padding: "0 11px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  borderColor: active ? "var(--color-ink)" : "var(--color-line)",
                  background: active ? "var(--color-ink)" : "var(--color-surface)",
                  color: active ? "var(--color-surface)" : "var(--color-ink-soft)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-lg border border-dashed px-3 py-2"
          style={{ fontSize: 12.5, color: "var(--color-muted)", borderColor: "var(--color-line)" }}
        >
          {EMPTY_TEXT[filter]}
          {filter !== "activity" && editable ? " — เขียนความเห็นแรกได้เลย" : ""}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="timeline">
          {items.map((item) =>
            item.kind === "comment" ? (
              <CommentRow
                key={item.id}
                comment={item.comment}
                people={people}
                currentUserId={currentUserId}
                /* K3.5 — ความเห็นของผู้ช่วย AI แก้ไม่ได้ (แก้ได้ = ปลอมคำพูดของ AI ได้) · ลบได้ตามเดิม */
                canEdit={editable && item.comment.author.userId === currentUserId && !item.comment.aiGenerated}
                canDelete={(editable && item.comment.author.userId === currentUserId) || isBoardAdmin}
                editing={editingId === item.id}
                nowMs={nowMs}
                onStartEdit={() => setEditingId(item.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(body) => saveEdit(item.comment, body)}
                onDelete={() => remove(item.comment)}
              />
            ) : (
              <ActivityRow key={item.id} activity={item.activity} nowMs={nowMs} />
            ),
          )}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          data-testid="timeline-more"
          onClick={loadMore}
          disabled={loading}
          className="self-start rounded-lg border px-3 disabled:opacity-45"
          style={{ height: 28, fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
        >
          {loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}
        </button>
      )}

      {editable && <CommentComposer people={people} onSubmit={submit} />}
    </div>
  );
}

/** กิจกรรม 1 บรรทัด — ไอคอนกลม + "ชื่อคน ประโยคไทย" + เวลาแบบสัมพัทธ์ (ตามภาพ 03) */
export function ActivityRow({
  activity,
  nowMs,
  showCard = false,
}: {
  activity: KanbanActivityDto;
  nowMs: number;
  /** สายของ "ทั้งบอร์ด" ต้องบอกด้วยว่าเป็นการ์ดใบไหน (ในหลังการ์ดไม่ต้อง — รู้อยู่แล้ว) */
  showCard?: boolean;
}) {
  return (
    <li className="flex items-start gap-2" data-testid="activity">
      <span
        className="grid flex-none place-items-center rounded-lg border"
        style={{
          width: 26,
          height: 26,
          borderColor: "var(--color-line)",
          background: "var(--color-surface-2)",
          color: "var(--color-muted)",
        }}
      >
        <KanbanIcon name={activityIconName(activity.type)} size="xs" />
      </span>
      <div className="min-w-0 flex-1" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--color-ink-soft)" }}>
        {activity.actor && <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>{activity.actor.name} </span>}
        {!activity.actor && <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>ระบบ </span>}
        <span>{describeActivity(activity)}</span>
        {showCard && activity.names.card && (
          <span style={{ color: "var(--color-muted)" }}> · การ์ด {activity.names.card}</span>
        )}
        <span style={{ color: "var(--color-muted)" }}> · {relativeThaiTime(activity.createdAt, nowMs)}</span>
      </div>
    </li>
  );
}

// ───────────────────────── แผงประวัติกิจกรรมของทั้งบอร์ด ─────────────────────────

/**
 * แผงด้านขวาที่เปิดจากเมนู ⋯ ของหัวบอร์ด ("ประวัติกิจกรรมของบอร์ด")
 * โหลดหน้าแรกตอนเปิด · "โหลดเพิ่ม" ใช้ cursor ตัวเดียวกับสายของการ์ด
 */
export function BoardActivityPanel({
  systemId,
  boardId,
  nowMs,
  onClose,
}: {
  systemId: string;
  boardId: string;
  nowMs: number;
  onClose: () => void;
}) {
  const [items, setItems] = useState<KanbanActivityDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (from: string | null) => {
      setLoading(true);
      const res = await listBoardActivityAction({ systemId, boardId, take: 30, cursor: from });
      setLoading(false);
      if (!res.ok) {
        setError(res.message || "โหลดประวัติกิจกรรมของบอร์ดไม่สำเร็จ");
        return;
      }
      setError(null);
      setItems((prev) => (from ? [...prev, ...res.items.filter((x) => !prev.some((p) => p.id === x.id))] : res.items));
      setCursor(res.nextCursor);
    },
    [systemId, boardId],
  );

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  return (
    <>
      <span className="fixed inset-0 z-40" style={{ background: "rgba(10,10,10,.22)" }} onClick={onClose} />
      <aside
        data-testid="board-activity"
        aria-label="ประวัติกิจกรรมของบอร์ด"
        className="fixed right-0 top-0 z-50 flex h-full w-full flex-col sm:w-[380px]"
        style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)" }}
      >
        <header
          className="flex flex-none items-center gap-2 px-4"
          style={{ height: 52, borderBottom: "1px solid var(--color-line)" }}
        >
          <KanbanIcon name="clock" size="sm" className="text-[color:var(--color-muted)]" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>ประวัติกิจกรรมของบอร์ด</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="ปิดแผงประวัติกิจกรรม" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="x" size="sm" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <div className="rounded-lg border px-3 py-2" style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}>
              {error}
            </div>
          )}
          {!error && items.length === 0 && !loading && (
            <div
              className="rounded-lg border border-dashed px-3 py-2"
              style={{ fontSize: 12.5, color: "var(--color-muted)", borderColor: "var(--color-line)" }}
            >
              ยังไม่มีกิจกรรมในบอร์ดนี้
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} nowMs={nowMs} showCard />
            ))}
          </ul>
          {cursor && (
            <button
              type="button"
              onClick={() => fetchPage(cursor)}
              disabled={loading}
              className="mt-3 rounded-lg border px-3 disabled:opacity-45"
              style={{ height: 28, fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
            >
              {loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default Timeline;
