// CardBack.tsx — หลังการ์ด (K1.6) · แบบ: `ledger/design-kanban/03-card-back.png` + `_kb.part` (.modal/.mh/.mmain/.mside)
// เดสก์ท็อป: โมดัลกลางจอกว้าง 872px มุมโค้ง 14px · < lg (มือถือ/แท็บเล็ต): แผ่นเต็มจอ (`fixed inset-0`)
//
// สถาปัตยกรรม: หน้าบอร์ด (`getBoardView` K1.5) จงใจไม่ส่ง description/comment มาด้วย (งบประสิทธิภาพ §12.1)
// ⇒ เปิดการ์ดแล้วขอ "ส่วนที่เหลือ" เพิ่มด้วย `getCardDetailAction` ก่อน ค่อยเรนเดอร์บล็อกที่เหลือ (skeleton ระหว่างรอ)
// ทุกการแก้ไข = optimistic ในนี้ก่อน แล้วค่อยยิง action จริง · ผิดพลาด → revert + toast (ผ่าน `handlers.onToast`)
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้าม toLocaleDateString("th-TH") (บทเรียน K1.5)
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar, formatCardDate, formatCardDateTime, tagColorVar } from "./Card";
import {
  archiveCardAction,
  createLabelAction,
  duplicateCardAction,
  getCardDetailAction,
  restoreCardAction,
  setCardAssigneesAction,
  setCardLabelsAction,
  updateCardFieldsAction,
} from "@/lib/modules/kanban/actions";
import { renderDescription } from "@/lib/modules/kanban/sanitize";
import type { BoardCardDto, BoardLabelDto, BoardPersonDto, KanbanTagColor } from "@/lib/modules/kanban/types";

const TAG_COLORS: { value: KanbanTagColor; name: string }[] = [
  { value: "SLATE", name: "เทา" },
  { value: "BLUE", name: "น้ำเงิน" },
  { value: "GREEN", name: "เขียว" },
  { value: "AMBER", name: "อำพัน" },
  { value: "RED", name: "แดง" },
  { value: "PURPLE", name: "ม่วง" },
];

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ไม่เตือน" },
  { value: "0", label: "ตอนถึงกำหนด" },
  { value: "60", label: "1 ชั่วโมงก่อน" },
  { value: "1440", label: "1 วันก่อน" },
  { value: "2880", label: "2 วันก่อน" },
  { value: "10080", label: "1 สัปดาห์ก่อน" },
];

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** ISO (UTC) → ค่าให้ `<input type="datetime-local">` แสดงเป็นเวลากรุงเทพฯ */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + BKK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
function isoToDateLocal(iso: string | null): string {
  return isoToDateTimeLocal(iso).slice(0, 10);
}
/** ค่าจาก input (ตีความเป็นเวลากรุงเทพฯ) → ISO (UTC) — คืน `null` เมื่อเคลียร์ช่อง */
function localToIso(value: string): string | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart!.split("-").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0) - BKK_OFFSET_MS).toISOString();
}

type Fields = {
  title: string;
  description: string | null;
  dueAt: string | null;
  startAt: string | null;
  reminderMinutesBefore: number | null;
  labels: BoardLabelDto[];
  assignees: BoardPersonDto[];
  status: "ACTIVE" | "ARCHIVED";
};

export type CardBackHandlers = {
  onClose: () => void;
  /** แปะการแก้ไขกลับไปที่การ์ดใบเดียวกันบนบอร์ด (ชื่อ/กำหนดส่ง/ป้าย/ผู้รับผิดชอบ — สิ่งที่โชว์บนตัวการ์ด) */
  onPatch: (cardId: string, patch: Partial<BoardCardDto>) => void;
  /** เอาการ์ดออกจากกองบนบอร์ด (เก็บเข้าคลัง) */
  onRemove: (cardId: string) => void;
  /** แทรกการ์ด "สำเนา" ใหม่ (คนละใบกับการ์ดที่เปิดอยู่) เข้ากองท้ายคอลัมน์ที่ระบุ */
  onDuplicated: (card: BoardCardDto, columnId: string) => void;
  /** การ์ดที่เปิดอยู่ถูกกู้คืน — ใส่กลับเข้ากองท้ายคอลัมน์ปลายทาง + ปรับหัวโมดัลให้ตรงคอลัมน์ใหม่ */
  onRestored: (card: BoardCardDto, columnId: string) => void;
  /** ย้ายการ์ดไปอีกคอลัมน์ — ใช้เส้นทาง optimistic เดียวกับการลาก (K1.5) */
  onMoveToColumn: (card: BoardCardDto, toColumnId: string) => void;
  onLabelCreated: (label: BoardLabelDto) => void;
  onToast: (message: string) => void;
};

export function CardBack({
  card,
  columnId,
  columnName,
  boardId,
  boardName,
  systemId,
  canEdit,
  labels,
  members,
  columns,
  nowMs,
  handlers,
}: {
  card: BoardCardDto;
  columnId: string;
  columnName: string;
  boardId: string;
  boardName: string;
  systemId: string;
  canEdit: boolean;
  labels: BoardLabelDto[];
  members: BoardPersonDto[];
  columns: { id: string; name: string }[];
  nowMs: number;
  handlers: CardBackHandlers;
}) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<KanbanTagColor>("BLUE");
  const [moveTarget, setMoveTarget] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const dueInputRef = useRef<HTMLInputElement | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocus = useRef(true);

  const editable = canEdit && fields?.status === "ACTIVE";

  // ── โหลดส่วนที่หน้าบอร์ดไม่ได้ส่งมา (รายละเอียด/วันเริ่ม/เตือนล่วงหน้า/สถานะคลัง) ──
  useEffect(() => {
    let cancelled = false;
    getCardDetailAction({ systemId, cardId: card.id }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.message);
        return;
      }
      setFields({
        title: card.title,
        description: res.detail.description,
        dueAt: res.detail.dueAt,
        startAt: res.detail.startAt,
        reminderMinutesBefore: res.detail.reminderMinutesBefore,
        labels: card.labels,
        assignees: card.assignees,
        status: res.detail.status,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวต่อการ์ด (คอมโพเนนต์ถูก key={card.id} จาก BoardView)
  }, [card.id]);

  // ── Esc ปิด · โฟกัสกักในโมดัล (§12.2) ──
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.onClose();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    titleInputRef.current?.focus();
    panel.focus();
    return () => panel.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูกครั้งเดียวตอนเปิดการ์ดใบนี้
  }, []);

  const toast = handlers.onToast;

  // ───────────────────────── ชื่อการ์ด ─────────────────────────

  const startEditTitle = useCallback(() => {
    if (!editable) return;
    setTitleDraft(fields?.title ?? card.title);
    setEditingTitle(true);
  }, [card.title, editable, fields?.title]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const saveTitle = useCallback(() => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!fields || !next || next === fields.title) return;
    const before = fields.title;
    setFields((f) => (f ? { ...f, title: next } : f));
    handlers.onPatch(card.id, { title: next });
    updateCardFieldsAction({ systemId, boardId, cardId: card.id, title: next }).then((res) => {
      if (res.ok) return;
      setFields((f) => (f ? { ...f, title: before } : f));
      handlers.onPatch(card.id, { title: before });
      toast(res.message || "แก้ชื่อการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
    });
  }, [boardId, card.id, fields, systemId, titleDraft, handlers, toast]);

  // ───────────────────────── รายละเอียด ─────────────────────────

  const startEditDesc = useCallback(() => {
    if (!editable || !fields) return;
    setDescDraft(fields.description ?? "");
    setEditingDesc(true);
  }, [editable, fields]);

  const flushDesc = useCallback(
    (text: string) => {
      if (descTimer.current) clearTimeout(descTimer.current);
      const html = renderDescription(text);
      setFields((f) => (f ? { ...f, description: html } : f));
      updateCardFieldsAction({ systemId, boardId, cardId: card.id, description: html }).then((res) => {
        if (res.ok) {
          setFields((f) => (f ? { ...f, description: res.description } : f));
          return;
        }
        toast(res.message || "บันทึกรายละเอียดไม่สำเร็จ ลองใหม่อีกครั้ง");
      });
    },
    [boardId, card.id, systemId, toast],
  );

  const onDescChange = useCallback(
    (text: string) => {
      setDescDraft(text);
      if (descTimer.current) clearTimeout(descTimer.current);
      descTimer.current = setTimeout(() => flushDesc(text), 800);
    },
    [flushDesc],
  );

  // ───────────────────────── กำหนดส่ง / วันเริ่ม / เตือนล่วงหน้า ─────────────────────────

  const patchDates = useCallback(
    (patch: { dueAt?: string | null; startAt?: string | null; reminderMinutesBefore?: number | null }) => {
      if (!fields) return;
      const before = fields;
      setFields((f) => (f ? { ...f, ...patch } : f));
      if (patch.dueAt !== undefined) handlers.onPatch(card.id, { dueAt: patch.dueAt });
      updateCardFieldsAction({ systemId, boardId, cardId: card.id, ...patch }).then((res) => {
        if (!res.ok) {
          setFields(before);
          if (patch.dueAt !== undefined) handlers.onPatch(card.id, { dueAt: before.dueAt });
          toast(res.message || "แก้กำหนดวันไม่สำเร็จ ลองใหม่อีกครั้ง");
          return;
        }
        // เอาค่าจริงจาก server กลับมาทับ (เคลียร์กำหนดส่ง = server เคลียร์เตือนล่วงหน้าให้ด้วย · §K1.6)
        setFields((f) => (f ? { ...f, dueAt: res.dueAt, startAt: res.startAt, reminderMinutesBefore: res.reminderMinutesBefore } : f));
        if (patch.dueAt !== undefined) handlers.onPatch(card.id, { dueAt: res.dueAt });
      });
    },
    [boardId, card.id, fields, systemId, handlers, toast],
  );

  // ───────────────────────── ป้ายกำกับ ─────────────────────────

  const toggleLabel = useCallback(
    (label: BoardLabelDto) => {
      if (!fields) return;
      const has = fields.labels.some((l) => l.id === label.id);
      const nextLabels = has ? fields.labels.filter((l) => l.id !== label.id) : [...fields.labels, label];
      const before = fields.labels;
      setFields((f) => (f ? { ...f, labels: nextLabels } : f));
      handlers.onPatch(card.id, { labels: nextLabels });
      setCardLabelsAction({ systemId, boardId, cardId: card.id, labelIds: nextLabels.map((l) => l.id) }).then((res) => {
        if (res.ok) return;
        setFields((f) => (f ? { ...f, labels: before } : f));
        handlers.onPatch(card.id, { labels: before });
        toast(res.message || "ตั้งป้ายกำกับไม่สำเร็จ ลองใหม่อีกครั้ง");
      });
    },
    [boardId, card.id, fields, systemId, handlers, toast],
  );

  const submitNewLabel = useCallback(() => {
    const name = newLabelName.trim();
    if (!name) return;
    createLabelAction({ systemId, boardId, name, color: newLabelColor }).then((res) => {
      if (!res.ok) {
        toast(res.message || "สร้างป้ายกำกับไม่สำเร็จ");
        return;
      }
      handlers.onLabelCreated(res.label);
      setNewLabelName("");
      toggleLabel(res.label);
    });
  }, [boardId, newLabelColor, newLabelName, systemId, handlers, toast, toggleLabel]);

  // ───────────────────────── ผู้รับผิดชอบ ─────────────────────────

  const toggleAssignee = useCallback(
    (person: BoardPersonDto) => {
      if (!fields) return;
      const has = fields.assignees.some((a) => a.userId === person.userId);
      const nextAssignees = has ? fields.assignees.filter((a) => a.userId !== person.userId) : [...fields.assignees, person];
      const before = fields.assignees;
      setFields((f) => (f ? { ...f, assignees: nextAssignees } : f));
      handlers.onPatch(card.id, { assignees: nextAssignees });
      setCardAssigneesAction({ systemId, boardId, cardId: card.id, userIds: nextAssignees.map((a) => a.userId) }).then((res) => {
        if (res.ok) return;
        setFields((f) => (f ? { ...f, assignees: before } : f));
        handlers.onPatch(card.id, { assignees: before });
        toast(res.message || "ตั้งผู้รับผิดชอบไม่สำเร็จ ลองใหม่อีกครั้ง");
      });
    },
    [boardId, card.id, fields, systemId, handlers, toast],
  );

  // ───────────────────────── ย้าย / ทำสำเนา / เก็บ / กู้คืน ─────────────────────────

  const otherColumns = useMemo(() => columns.filter((c) => c.id !== columnId), [columns, columnId]);

  const doMove = useCallback(() => {
    if (!moveTarget) return;
    handlers.onMoveToColumn(card, moveTarget);
    setMoveTarget("");
  }, [card, handlers, moveTarget]);

  const doDuplicate = useCallback(() => {
    duplicateCardAction({ systemId, boardId, cardId: card.id }).then((res) => {
      if (!res.ok) {
        toast(res.message || "ทำสำเนาการ์ดไม่สำเร็จ");
        return;
      }
      handlers.onDuplicated(res.card, res.columnId);
      toast(`ทำสำเนา "${res.card.title}" แล้ว`);
    });
  }, [boardId, card.id, systemId, handlers, toast]);

  const doArchive = useCallback(() => {
    archiveCardAction({ systemId, boardId, cardId: card.id }).then((res) => {
      if (!res.ok) {
        toast(res.message || "เก็บการ์ดเข้าคลังไม่สำเร็จ");
        return;
      }
      setFields((f) => (f ? { ...f, status: "ARCHIVED" } : f));
      handlers.onRemove(card.id);
    });
  }, [boardId, card.id, systemId, handlers, toast]);

  const doRestore = useCallback(() => {
    restoreCardAction({ systemId, boardId, cardId: card.id }).then((res) => {
      if (!res.ok) {
        toast(res.message || "กู้คืนการ์ดไม่สำเร็จ");
        return;
      }
      setFields((f) => (f ? { ...f, status: "ACTIVE" } : f));
      handlers.onRestored(res.card, res.columnId);
      toast("กู้คืนการ์ดแล้ว");
    });
  }, [boardId, card.id, systemId, handlers, toast]);

  const close = useCallback(() => {
    returnFocus.current = true;
    handlers.onClose();
  }, [handlers]);

  return (
    <>
      {/* backdrop — เดสก์ท็อปเท่านั้น (มือถือแผ่นเต็มจอทับพอดี ไม่ต้องมี) */}
      <div className="fixed inset-0 z-40 hidden lg:block" style={{ background: "rgba(10,10,10,.28)" }} onClick={close} aria-hidden />

      <div
        ref={panelRef}
        data-testid="card-back"
        role="dialog"
        aria-modal="true"
        aria-label={`หลังการ์ด ${card.title}`}
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto outline-none lg:inset-auto lg:left-1/2 lg:top-6 lg:h-auto lg:max-h-[calc(100vh-48px)] lg:w-[872px] lg:-translate-x-1/2 lg:rounded-2xl lg:border"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 22px 60px rgba(10,10,10,.26)" }}
      >
        {/* ── หัว ── */}
        <div className="flex flex-none items-start gap-2.5 border-b p-4" style={{ borderColor: "var(--color-line)" }}>
          <KanbanIcon name="doc" size="md" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              {card.cardNo ? `การ์ด #${card.cardNo}` : "การ์ด"} · อยู่ในคอลัมน์{" "}
              <b style={{ color: "var(--color-ink)" }}>{columnName}</b>
              <span style={{ color: "var(--color-muted)" }}>›</span> บอร์ด {boardName}
            </div>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                data-testid="card-title-input"
                aria-label="ชื่อการ์ด"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingTitle(false);
                  }
                }}
                className="w-full rounded-md border px-2 py-1"
                style={{ fontSize: 17.5, fontWeight: 700, borderColor: "var(--color-accent)" }}
              />
            ) : (
              <div
                data-testid="card-title"
                onClick={startEditTitle}
                title={editable ? "คลิกเพื่อแก้ชื่อการ์ด" : undefined}
                className="min-w-0"
                style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.35, cursor: editable ? "text" : "default" }}
              >
                {fields?.title ?? card.title}
              </div>
            )}

            {/* เมนู "เพิ่ม:" — ปุ่มที่ WO ถัดไปยังไม่มา = disabled + tooltip "เร็ว ๆ นี้" */}
            {editable && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>เพิ่ม:</span>
                <AddChip icon="users" label="สมาชิก" onClick={() => setMembersOpen(true)} />
                <AddChip icon="tag" label="ป้ายกำกับ" onClick={() => setLabelsOpen(true)} />
                <AddChip icon="clock" label="กำหนดวัน" onClick={() => dueInputRef.current?.focus()} />
                <AddChip icon="cklist" label="เช็คลิสต์" disabled />
                <AddChip icon="clip" label="ไฟล์แนบ" disabled />
                <AddChip icon="link" label="เชื่อมข้อมูล SHARK" disabled accent />
              </div>
            )}
          </div>
          <button type="button" disabled title="เร็ว ๆ นี้" aria-label="เมนูเพิ่มเติม" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="more" size="sm" />
          </button>
          <button type="button" data-testid="card-close" aria-label="ปิดหลังการ์ด" onClick={close} style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="x" size="sm" />
          </button>
        </div>

        {!fields ? (
          <div className="flex flex-1 flex-col gap-3 p-4">
            {loadError ? (
              <p style={{ fontSize: 13, color: "var(--color-danger)" }}>{loadError}</p>
            ) : (
              [0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl" style={{ height: 64, background: "var(--color-surface-2)" }} />
              ))
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* ── เนื้อหาหลัก ── */}
            <div className="flex flex-1 flex-col gap-4 p-4">
              {fields.status === "ARCHIVED" && (
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--color-due-late-bg)", color: "var(--color-danger)", fontSize: 13 }}
                >
                  <KanbanIcon name="box" size="sm" />
                  <span className="flex-1">การ์ดนี้อยู่ในคลัง — ทุกอย่างอ่านได้อย่างเดียว</span>
                  {canEdit && (
                    <button type="button" onClick={doRestore} className="underline" style={{ fontWeight: 600 }}>
                      กู้คืน
                    </button>
                  )}
                </div>
              )}

              {/* แถวสรุป: ผู้รับผิดชอบ / ป้ายกำกับ / กำหนดส่ง */}
              <div className="flex flex-wrap gap-6">
                <div data-testid="card-members" className="relative">
                  <SectionLabel>ผู้รับผิดชอบ</SectionLabel>
                  <div className="flex items-center" style={{ height: 26 }}>
                    {fields.assignees.map((a, i) => (
                      <span key={a.userId} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--color-surface)", borderRadius: 999 }}>
                        <Avatar name={a.name} size={26} />
                      </span>
                    ))}
                    {fields.assignees.length === 0 && <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มี</span>}
                    {editable && (
                      <button
                        type="button"
                        aria-label="เพิ่มผู้รับผิดชอบ"
                        onClick={() => setMembersOpen((o) => !o)}
                        className="grid place-items-center"
                        style={{ marginLeft: fields.assignees.length ? -6 : 6, width: 26, height: 26, borderRadius: 7, border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
                      >
                        <KanbanIcon name="plus" size="xs" />
                      </button>
                    )}
                  </div>
                  {membersOpen && editable && (
                    <Popover onClose={() => setMembersOpen(false)}>
                      {members.length === 0 && <p style={{ fontSize: 12.5, color: "var(--color-muted)", padding: "4px 8px" }}>บอร์ดนี้ยังไม่มีสมาชิก</p>}
                      {members.map((m) => (
                        <PopoverRow key={m.userId} onClick={() => toggleAssignee(m)} checked={fields.assignees.some((a) => a.userId === m.userId)}>
                          <Avatar name={m.name} size={22} /> {m.name}
                        </PopoverRow>
                      ))}
                    </Popover>
                  )}
                </div>

                <div data-testid="card-labels" className="relative">
                  <SectionLabel>ป้ายกำกับ</SectionLabel>
                  <div className="flex flex-wrap items-center gap-1" style={{ minHeight: 26 }}>
                    {fields.labels.map((l) => (
                      <LabelChip key={l.id} label={l} />
                    ))}
                    {fields.labels.length === 0 && <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มี</span>}
                    {editable && (
                      <button
                        type="button"
                        aria-label="เพิ่มป้ายกำกับ"
                        onClick={() => setLabelsOpen((o) => !o)}
                        className="inline-flex items-center justify-center"
                        style={{ height: 18, width: 22, borderRadius: 5, border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
                      >
                        <KanbanIcon name="plus" size="xs" />
                      </button>
                    )}
                  </div>
                  {labelsOpen && editable && (
                    <Popover onClose={() => setLabelsOpen(false)}>
                      {labels.map((l) => (
                        <PopoverRow key={l.id} onClick={() => toggleLabel(l)} checked={fields.labels.some((x) => x.id === l.id)}>
                          <LabelChip label={l} />
                        </PopoverRow>
                      ))}
                      <div className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--color-line)" }}>
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            aria-label={c.name}
                            onClick={() => setNewLabelColor(c.value)}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              background: tagColorVar(c.value),
                              outline: newLabelColor === c.value ? "2px solid var(--color-ink)" : "none",
                              outlineOffset: 1,
                            }}
                          />
                        ))}
                        <input
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitNewLabel()}
                          placeholder="ชื่อป้ายใหม่"
                          className="min-w-0 flex-1 rounded border px-1.5 py-0.5"
                          style={{ fontSize: 12, borderColor: "var(--color-line)" }}
                        />
                        <button type="button" onClick={submitNewLabel} style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 600 }}>
                          เพิ่ม
                        </button>
                      </div>
                    </Popover>
                  )}
                </div>

                <div data-testid="card-due">
                  <SectionLabel>กำหนดส่ง</SectionLabel>
                  <div className="flex items-center gap-2" style={{ height: 26 }}>
                    <span
                      title="ทำเครื่องหมายเสร็จโดยย้ายการ์ดเข้าคอลัมน์เสร็จ"
                      style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--color-line)", display: "inline-block" }}
                    />
                    {editable ? (
                      <input
                        ref={dueInputRef}
                        type="datetime-local"
                        aria-label="กำหนดส่ง"
                        value={isoToDateTimeLocal(fields.dueAt)}
                        onChange={(e) => patchDates({ dueAt: localToIso(e.target.value) })}
                        className="rounded border px-1.5 py-0.5"
                        style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
                      />
                    ) : fields.dueAt ? (
                      <span style={{ fontSize: 12.5 }}>{formatCardDateTime(fields.dueAt)}</span>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่กำหนด</span>
                    )}
                    {editable && fields.dueAt && (
                      <select
                        aria-label="เตือนล่วงหน้า"
                        value={fields.reminderMinutesBefore ?? ""}
                        onChange={(e) => patchDates({ reminderMinutesBefore: e.target.value ? Number(e.target.value) : null })}
                        className="rounded border px-1 py-0.5"
                        style={{ fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-muted)" }}
                      >
                        {REMINDER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="mt-2">
                    <SectionLabel>วันเริ่ม</SectionLabel>
                    {editable ? (
                      <input
                        type="date"
                        aria-label="วันเริ่ม"
                        value={isoToDateLocal(fields.startAt)}
                        onChange={(e) => patchDates({ startAt: e.target.value ? localToIso(e.target.value) : null })}
                        className="rounded border px-1.5 py-0.5"
                        style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
                      />
                    ) : fields.startAt ? (
                      <span style={{ fontSize: 12.5 }}>{formatCardDate(fields.startAt)}</span>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่กำหนด</span>
                    )}
                  </div>
                </div>
              </div>

              {/* รายละเอียด */}
              <div data-testid="card-description" className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <KanbanIcon name="list" size="sm" className="text-[color:var(--color-muted)]" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>รายละเอียด</span>
                  <span className="flex-1" />
                  {editingDesc && <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>บันทึกอัตโนมัติ…</span>}
                </div>
                {editingDesc ? (
                  <div className="flex flex-col gap-1">
                    <textarea
                      autoFocus
                      value={descDraft}
                      onChange={(e) => onDescChange(e.target.value)}
                      onBlur={() => {
                        setEditingDesc(false);
                        flushDesc(descDraft);
                      }}
                      rows={5}
                      className="w-full rounded-lg border p-2"
                      style={{ fontSize: 13, borderColor: "var(--color-line)", lineHeight: 1.6 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--color-muted)" }}>รองรับ &ldquo;- รายการ&rdquo; และ &ldquo;**ตัวหนา**&rdquo;</span>
                  </div>
                ) : fields.description ? (
                  <div
                    onClick={startEditDesc}
                    className="prose-kb rounded-lg"
                    style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-ink-soft)", cursor: editable ? "text" : "default" }}
                    dangerouslySetInnerHTML={{ __html: fields.description }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startEditDesc}
                    disabled={!editable}
                    className="rounded-lg border border-dashed px-3 py-2 text-left"
                    style={{ fontSize: 12.5, color: "var(--color-muted)", borderColor: "var(--color-line)" }}
                  >
                    ยังไม่มีรายละเอียด{editable ? " — คลิกเพื่อเพิ่ม" : ""}
                  </button>
                )}
              </div>
            </div>

            {/* ── แถบขวา ── */}
            <div
              className="flex flex-none flex-col gap-4 border-t p-3.5 lg:w-[228px] lg:border-l lg:border-t-0"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
            >
              {editable && (
                <RailGroup title="การ์ดนี้">
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="ย้ายไปคอลัมน์"
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border px-2"
                      style={{ height: 32, fontSize: 12.5, borderColor: "var(--color-line)" }}
                    >
                      <option value="">ย้ายไปคอลัมน์…</option>
                      {otherColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <RailButton icon="swap" onClick={doMove} disabled={!moveTarget} aria-label="ย้าย" />
                  </div>
                  <RailButton icon="copy" label="ทำสำเนา" onClick={doDuplicate} />
                  <RailButton icon="grid" label="สะท้อนการ์ด (Mirror)" disabled />
                  <RailButton icon="doc" label="บันทึกเป็นเทมเพลตการ์ด" disabled />
                  <RailButton icon="eye" label="ติดตามการ์ด" disabled />
                </RailGroup>
              )}

              <RailGroup title="ทำต่ออัตโนมัติ">
                <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ยังไม่มีปุ่มอัตโนมัติที่ตั้งไว้ — ตั้งได้ในเมนูอัตโนมัติของบอร์ด (เร็ว ๆ นี้)</p>
              </RailGroup>

              <RailGroup title="ผู้ช่วย AI">
                <RailButton icon="spark" label="สรุปการ์ดนี้" disabled />
                <RailButton icon="spark" label="แตกเป็นเช็คลิสต์" disabled />
                <RailButton icon="spark" label="ร่างข้อความตอบลูกค้า" disabled />
              </RailGroup>

              <RailGroup title="ฟิลด์กำหนดเอง">
                <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>เร็ว ๆ นี้</p>
              </RailGroup>

              {canEdit && (
                <>
                  <div style={{ height: 1, background: "var(--color-line)" }} />
                  {fields.status === "ACTIVE" ? (
                    <RailButton icon="box" label="เก็บเข้าคลัง" onClick={doArchive} testid="card-archive" tone="danger" />
                  ) : (
                    <RailButton icon="box" label="กู้คืนจากคลัง" onClick={doRestore} testid="card-archive" />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ───────────────────────── ชิ้นส่วนย่อยของ UI ─────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", letterSpacing: ".02em", marginBottom: 6 }}>{children}</div>
  );
}

function AddChip({ icon, label, onClick, disabled, accent }: { icon: string; label: string; onClick?: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "เร็ว ๆ นี้" : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg border"
      style={{
        height: 27,
        padding: "0 9px",
        fontSize: 12,
        borderColor: accent ? "var(--color-accent)" : "var(--color-line)",
        color: disabled ? "var(--color-muted)" : accent ? "var(--color-accent)" : "var(--color-ink-soft)",
        background: "var(--color-surface)",
      }}
    >
      <KanbanIcon name={icon} size="xs" />
      {label}
    </button>
  );
}

function LabelChip({ label }: { label: BoardLabelDto }) {
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{ height: 18, padding: "0 6px", borderRadius: 5, fontSize: 10.5, border: `1px solid ${tagColorVar(label.color)}`, color: tagColorVar(label.color) }}
    >
      {label.name}
    </span>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-0 top-full z-50 mt-1 flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
      >
        {children}
      </div>
    </>
  );
}

function PopoverRow({ children, onClick, checked }: { children: React.ReactNode; onClick: () => void; checked: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
      style={{ fontSize: 12.5, background: checked ? "var(--color-surface-2)" : "transparent" }}
    >
      <span className="flex-1">{children}</span>
      {checked && <KanbanIcon name="check" size="xs" />}
    </button>
  );
}

function RailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", letterSpacing: ".02em" }}>{title}</div>
      {children}
    </div>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  disabled,
  testid,
  tone,
  ...rest
}: {
  icon: string;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  testid?: string;
  tone?: "danger";
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "เร็ว ๆ นี้" : undefined}
      aria-label={rest["aria-label"] ?? label}
      className="flex items-center gap-2 rounded-lg border"
      style={{
        height: 32,
        padding: "0 10px",
        fontSize: 12.5,
        borderColor: tone === "danger" ? "var(--color-danger)" : "var(--color-line)",
        color: disabled ? "var(--color-muted)" : tone === "danger" ? "var(--color-danger)" : "var(--color-ink-soft)",
        background: "var(--color-surface)",
        justifyContent: label ? "flex-start" : "center",
        width: label ? "100%" : 32,
      }}
    >
      <KanbanIcon name={icon} size="sm" />
      {label}
    </button>
  );
}

export default CardBack;
