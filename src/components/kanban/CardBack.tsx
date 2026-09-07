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
import { useRouter } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar, dueBadgeFrom, tagColorVar } from "./Card";
import { Attachments } from "./Attachments";
import { Checklist, checklistBadgeOf } from "./Checklist";
import { CustomFields } from "./CustomFields";
import { Timeline } from "./Timeline";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  archiveCardAction,
  createChecklistAction,
  createLabelAction,
  duplicateCardAction,
  getCardDetailAction,
  restoreCardAction,
  saveCardTemplateAction,
  setCardAssigneesAction,
  setCardLabelsAction,
  setCardRecurrenceAction,
  updateCardFieldsAction,
} from "@/lib/modules/kanban/actions";
// K2.9 — ปุ่มอัตโนมัติของบอร์ด (แยกไฟล์ action ของตัวเอง)
import { runButtonAction } from "@/lib/modules/kanban/automation-actions";
import { renderDescription } from "@/lib/modules/kanban/sanitize";
import type {
  BoardCardDto,
  BoardLabelDto,
  BoardPersonDto,
  CardFieldValueDto,
  KanbanAttachmentDto,
  KanbanChecklistDto,
  KanbanCommentDto,
  KanbanTagColor,
} from "@/lib/modules/kanban/types";

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

// K2.7 — กำหนดส่งซ้ำ (ไม่มี mockup) — ตัวเลือกคงที่ 5 แบบแปลงเป็น RRULE subset ตามวันของ dueAt ฝั่ง client
type RecurOption = "none" | "daily" | "weekly" | "biweekly" | "monthly";
const WDAY_TH_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

type Fields = {
  title: string;
  description: string | null;
  dueAt: string | null;
  startAt: string | null;
  reminderMinutesBefore: number | null;
  labels: BoardLabelDto[];
  assignees: BoardPersonDto[];
  status: "ACTIVE" | "ARCHIVED";
  checklists: KanbanChecklistDto[];
  comments: KanbanCommentDto[];
  attachments: KanbanAttachmentDto[];
  customFields: CardFieldValueDto[];
  /** K2.7: null = ไม่ซ้ำ (ตั้งได้เฉพาะการ์ดที่ไม่ใช่ลูกของงานประจำ) */
  recurrenceRule: string | null;
  recurrenceLabel: string | null;
  recurrenceParentId: string | null;
  recurrenceParentTitle: string | null;
  /** K2.9: ปุ่มอัตโนมัติของบอร์ด (CARD_BUTTON ที่เปิดอยู่) — server ส่ง [] ให้ VIEWER อยู่แล้ว */
  cardButtons: { id: string; name: string }[];
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
  initialPanel = null,
  columnId,
  columnName,
  boardId,
  boardName,
  systemId,
  canEdit,
  boardRole,
  currentUserId,
  labels,
  members,
  columns,
  nowMs,
  handlers,
}: {
  card: BoardCardDto;
  /** K1.14 — ปุ่มลัด t/d/l เปิดหลังการ์ดพร้อมแผงที่ต้องการเลย (null = เปิดเปล่า ๆ เหมือนคลิกเมาส์) */
  initialPanel?: "title" | "due" | "labels" | null;
  columnId: string;
  columnName: string;
  boardId: string;
  boardName: string;
  systemId: string;
  canEdit: boolean;
  /** บทบาทของผู้ที่กำลังดูในบอร์ดใบนี้ — ADMIN ลบความเห็นของคนอื่นได้ (K1.8) */
  boardRole: "VIEWER" | "EDITOR" | "ADMIN";
  /** ผู้ใช้ที่กำลังดู — ใช้ตัดสินว่าแก้/ลบความเห็นใบไหนได้ + เน้นชิป @ ของตัวเอง */
  currentUserId: string;
  labels: BoardLabelDto[];
  members: BoardPersonDto[];
  columns: { id: string; name: string }[];
  nowMs: number;
  handlers: CardBackHandlers;
}) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(initialPanel === "title");
  const [titleDraft, setTitleDraft] = useState(card.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(initialPanel === "labels");
  const [membersOpen, setMembersOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<KanbanTagColor>("BLUE");
  const [moveTarget, setMoveTarget] = useState("");
  const [dueOpen, setDueOpen] = useState(initialPanel === "due");
  const [startOpen, setStartOpen] = useState(false);
  // K2.9 — ปุ่มอัตโนมัติที่กำลังทำงานอยู่ (กันกดรัว: กฎ 1 ใบทำหลายอย่าง กดซ้ำ = ทำซ้ำจริง ๆ)
  const [runningButton, setRunningButton] = useState<string | null>(null);
  const router = useRouter();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocus = useRef(true);

  const editable = canEdit && fields?.status === "ACTIVE";

  /**
   * K2.9 — กดปุ่มอัตโนมัติ: กฎวิ่งฝั่งเซิร์ฟเวอร์แล้วค่อย `router.refresh()`
   * 🔴 ไม่ทำ optimistic: กฎ 1 ใบทำได้หลายอย่าง (ย้าย/ติดป้าย/สร้างการ์ดอีกบอร์ด) — เดาผลลัพธ์บนจอ
   *    แล้วเดาผิดคือจอโกหก · รอผลจริงแล้วโหลดใหม่ตรงไปตรงมากว่า
   */
  const runCardButton = async (ruleId: string, name: string) => {
    setRunningButton(ruleId);
    const res = await runButtonAction({ systemId, boardId, ruleId, cardId: card.id });
    setRunningButton(null);
    if (!res.ok) {
      handlers.onToast(res.message);
      return;
    }
    handlers.onToast(`ทำรายการ “${name}” แล้ว`);
    router.refresh();
  };

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
        checklists: res.detail.checklists,
        comments: res.detail.comments,
        attachments: res.detail.attachments,
        customFields: res.detail.customFields,
        recurrenceRule: res.detail.recurrenceRule,
        recurrenceLabel: res.detail.recurrenceLabel,
        recurrenceParentId: res.detail.recurrenceParentId,
        recurrenceParentTitle: res.detail.recurrenceParentTitle,
        cardButtons: res.detail.cardButtons,
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

  // ───────────────────────── เช็คลิสต์ (K1.7) ─────────────────────────

  const onChecklistsChange = useCallback(
    (checklists: KanbanChecklistDto[]) => {
      setFields((f) => (f ? { ...f, checklists } : f));
      const { done, total } = checklistBadgeOf(checklists);
      handlers.onPatch(card.id, { checklistDone: done, checklistTotal: total });
    },
    [card.id, handlers],
  );

  const addChecklist = useCallback(() => {
    if (typeof window === "undefined") return;
    const title = window.prompt("ชื่อเช็คลิสต์", "ขั้นตอนงาน");
    if (title === null) return;
    createChecklistAction({ systemId, boardId, cardId: card.id, title }).then((res) => {
      if (!res.ok) {
        toast(res.message || "สร้างเช็คลิสต์ไม่สำเร็จ");
        return;
      }
      onChecklistsChange(res.checklists);
    });
  }, [boardId, card.id, systemId, onChecklistsChange, toast]);

  // ───────────────────────── ความเห็น (K1.8) ─────────────────────────

  const onCommentsChange = useCallback(
    (comments: KanbanCommentDto[]) => {
      setFields((f) => (f ? { ...f, comments } : f));
      handlers.onPatch(card.id, { commentCount: comments.length });
    },
    [card.id, handlers],
  );

  // ───────────────────────── ไฟล์แนบ + ปก (K1.9) ─────────────────────────

  const onAttachmentsChange = useCallback(
    (attachments: KanbanAttachmentDto[]) => {
      setFields((f) => (f ? { ...f, attachments } : f));
      const cover = attachments.find((a) => a.isCover);
      handlers.onPatch(card.id, { attachmentCount: attachments.length, coverUrl: cover?.url ?? null });
    },
    [card.id, handlers],
  );

  // ───────────────────────── ฟิลด์กำหนดเอง (K2.6) ─────────────────────────

  const onCustomFieldsChange = useCallback(
    (customFields: CardFieldValueDto[]) => {
      setFields((f) => (f ? { ...f, customFields } : f));
      // ชิปบนตัวการ์ด = เฉพาะ showOnCard ที่มีค่าแล้ว เรียงตาม sortOrder (ตรงกับ service.ts/table.ts)
      const fieldsOnCard = customFields
        .filter((cf) => cf.showOnCard && cf.value !== null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cf) => ({ name: cf.name, display: cf.display }));
      handlers.onPatch(card.id, { fieldsOnCard });
    },
    [card.id, handlers],
  );

  // ───────────────────────── กำหนดส่งซ้ำ (K2.7) ─────────────────────────
  // ตัวเลือกคงที่ 5 แบบ (ไม่มี mockup — เกณฑ์ §13 K2.7) แปลงเป็น RRULE subset ตาม "วันของ dueAt" ฝั่ง client
  // (คิดวันไทย +07:00 เอง — ห้าม toLocale*/getDay ตรง ๆ ตามกติกาทั้งโมดูล)
  const BKK_MS = 7 * 3_600_000;
  const WEEK_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

  const dueAtParts = useMemo(() => {
    if (!fields?.dueAt) return null;
    const d = new Date(Date.parse(fields.dueAt) + BKK_MS);
    return { weekdayCode: WEEK_CODES[d.getUTCDay()]!, weekdayLabel: WDAY_TH_FULL[d.getUTCDay()]!, day: d.getUTCDate() };
  }, [fields?.dueAt, BKK_MS]);

  const recurOptionOf = (rule: string | null): RecurOption => {
    if (!rule) return "none";
    if (/^FREQ=DAILY$/.test(rule)) return "daily";
    if (/^FREQ=WEEKLY;BYDAY=[A-Z]{2}$/.test(rule)) return "weekly";
    if (/^FREQ=WEEKLY;INTERVAL=2;BYDAY=[A-Z]{2}$/.test(rule)) return "biweekly";
    if (/^FREQ=MONTHLY;BYMONTHDAY=\d+$/.test(rule)) return "monthly";
    return "none";
  };

  const setRecurrence = useCallback(
    (option: RecurOption) => {
      if (!fields || !dueAtParts) return;
      const rule =
        option === "none"
          ? null
          : option === "daily"
            ? "FREQ=DAILY"
            : option === "weekly"
              ? `FREQ=WEEKLY;BYDAY=${dueAtParts.weekdayCode}`
              : option === "biweekly"
                ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dueAtParts.weekdayCode}`
                : `FREQ=MONTHLY;BYMONTHDAY=${dueAtParts.day}`;
      const before = fields.recurrenceRule;
      setFields((f) => (f ? { ...f, recurrenceRule: rule } : f));
      handlers.onPatch(card.id, { isRecurring: rule !== null });
      setCardRecurrenceAction({ systemId, boardId, cardId: card.id, rule }).then((res) => {
        if (!res.ok) {
          setFields((f) => (f ? { ...f, recurrenceRule: before } : f));
          handlers.onPatch(card.id, { isRecurring: before !== null });
          toast(res.message || "ตั้งกำหนดส่งซ้ำไม่สำเร็จ ลองใหม่อีกครั้ง");
          return;
        }
        setFields((f) => (f ? { ...f, recurrenceLabel: res.recurrenceLabel } : f));
      });
    },
    [boardId, card.id, dueAtParts, fields, systemId, handlers, toast],
  );

  // ───────────────────────── บันทึกเป็นเทมเพลตการ์ด (K2.7) ─────────────────────────

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const submitSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    saveCardTemplateAction({ systemId, boardId, cardId: card.id, name }).then((res) => {
      if (!res.ok) {
        toast(res.message || "บันทึกเทมเพลตไม่สำเร็จ");
        return;
      }
      toast(`บันทึกเทมเพลต "${res.template.name}" แล้ว`);
      setSavingTemplate(false);
      setTemplateName("");
    });
  }, [boardId, card.id, systemId, templateName, toast]);

  // ปุ่ม "ไฟล์แนบ" ในเมนู "เพิ่ม:" เปิดกล่องเลือกไฟล์ของ <Attachments> ที่อยู่ใต้เช็คลิสต์ (ตัวเดียวในหน้านี้)
  const openAttachmentPicker = useCallback(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLInputElement>('[data-testid="attachment-upload"]')?.click();
  }, []);

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
                <AddChip icon="clock" label="กำหนดวัน" onClick={() => setDueOpen(true)} />
                <AddChip icon="cklist" label="เช็คลิสต์" onClick={addChecklist} />
                <AddChip icon="clip" label="ไฟล์แนบ" onClick={openAttachmentPicker} />
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
                    <ThaiDatePicker
                      value={fields.dueAt}
                      onChange={(dueAt) => patchDates({ dueAt })}
                      editable={editable}
                      withTime
                      open={dueOpen}
                      onOpenChange={setDueOpen}
                      nowMs={nowMs}
                      ariaLabel="กำหนดส่ง"
                      chipTestId="due-chip"
                      pickerTestId="due-picker"
                      tone={fields.dueAt ? (dueBadgeFrom(fields.dueAt, null, nowMs)?.tone ?? "gray") : undefined}
                    />
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
                    <ThaiDatePicker
                      value={fields.startAt}
                      onChange={(startAt) => patchDates({ startAt })}
                      editable={editable}
                      open={startOpen}
                      onOpenChange={setStartOpen}
                      nowMs={nowMs}
                      ariaLabel="วันเริ่ม"
                      chipTestId="start-chip"
                      pickerTestId="start-picker"
                    />
                  </div>

                  {/* K2.7 — กำหนดส่งซ้ำ: ลูกของงานประจำไม่มีกฎของตัวเอง (แสดงลิงก์กลับหาแม่แทน) */}
                  <div data-testid="card-recurrence" className="mt-2">
                    <SectionLabel>กำหนดส่งซ้ำ</SectionLabel>
                    {fields.recurrenceParentId ? (
                      <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
                        เกิดจากงานประจำ:{" "}
                        <a href={`?card=${fields.recurrenceParentId}`} style={{ color: "var(--color-accent)", fontWeight: 600 }}>
                          {fields.recurrenceParentTitle ?? "การ์ดแม่"}
                        </a>
                      </p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="กำหนดส่งซ้ำ"
                          disabled={!editable || !fields.dueAt}
                          value={recurOptionOf(fields.recurrenceRule)}
                          onChange={(e) => setRecurrence(e.target.value as RecurOption)}
                          className="rounded border px-1.5 py-1"
                          style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
                        >
                          <option value="none">ไม่ซ้ำ</option>
                          <option value="daily">ทุกวัน</option>
                          <option value="weekly">ทุกสัปดาห์{dueAtParts ? ` (วัน${dueAtParts.weekdayLabel})` : ""}</option>
                          <option value="biweekly">ทุก 2 สัปดาห์</option>
                          <option value="monthly">ทุกเดือน{dueAtParts ? ` (วันที่ ${dueAtParts.day})` : ""}</option>
                        </select>
                        {fields.recurrenceRule && (
                          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{fields.recurrenceLabel}</span>
                        )}
                      </div>
                    )}
                    {!fields.recurrenceParentId && !fields.dueAt && (
                      <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ตั้งกำหนดส่งก่อน จึงตั้งกำหนดส่งซ้ำได้</p>
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

              {/* เช็คลิสต์ (K1.7) */}
              <Checklist
                systemId={systemId}
                boardId={boardId}
                cardId={card.id}
                editable={editable}
                checklists={fields.checklists}
                members={members}
                nowMs={nowMs}
                onChange={onChecklistsChange}
                onToast={toast}
              />

              {/* ไฟล์แนบ + ปก (K1.9) */}
              <Attachments
                systemId={systemId}
                boardId={boardId}
                cardId={card.id}
                editable={editable}
                attachments={fields.attachments}
                onChange={onAttachmentsChange}
                onToast={toast}
              />

              {/* ความเห็น + กิจกรรม (K1.8 + K1.10) — แท็บ ทั้งหมด/ความเห็น/กิจกรรม ตามภาพ 03
                  ชิ้นส่วนแถวความเห็น/ช่องเขียนยังเป็นของ `Comments.tsx` เดิม (Timeline แค่คุมสาย) */}
              <Timeline
                systemId={systemId}
                boardId={boardId}
                cardId={card.id}
                editable={editable}
                isBoardAdmin={boardRole === "ADMIN"}
                currentUserId={currentUserId}
                comments={fields.comments}
                nowMs={nowMs}
                onCommentsChange={onCommentsChange}
                onToast={toast}
              />
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
                  {/* K2.7 — บันทึกเป็นเทมเพลตการ์ด: ADMIN ของบอร์ดเท่านั้น (สัญญา K2.7) */}
                  {boardRole === "ADMIN" &&
                    (savingTemplate ? (
                      <div className="flex items-center gap-1.5 rounded-lg border p-1.5" style={{ borderColor: "var(--color-line)" }}>
                        <input
                          autoFocus
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitSaveTemplate();
                            if (e.key === "Escape") {
                              setSavingTemplate(false);
                              setTemplateName("");
                            }
                          }}
                          placeholder="ชื่อเทมเพลต"
                          data-testid="save-card-template-name"
                          className="input min-w-0 flex-1"
                          style={{ fontSize: 12.5 }}
                        />
                        <button type="button" onClick={submitSaveTemplate} style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 600 }}>
                          บันทึก
                        </button>
                        <button
                          type="button"
                          aria-label="ยกเลิก"
                          onClick={() => {
                            setSavingTemplate(false);
                            setTemplateName("");
                          }}
                          style={{ color: "var(--color-muted)" }}
                        >
                          <KanbanIcon name="x" size="xs" />
                        </button>
                      </div>
                    ) : (
                      <RailButton
                        icon="doc"
                        label="บันทึกเป็นเทมเพลตการ์ด"
                        testid="save-card-template"
                        onClick={() => {
                          setTemplateName(card.title);
                          setSavingTemplate(true);
                        }}
                      />
                    ))}
                  <RailButton icon="eye" label="ติดตามการ์ด" disabled />
                </RailGroup>
              )}

              {/* K2.9 — ปุ่มอัตโนมัติของบอร์ด (kind CARD_BUTTON) · กดแล้วกฎทำงานกับการ์ดใบนี้ทันที
                  server ส่ง [] ให้ VIEWER อยู่แล้ว (ปุ่มที่กดไม่ได้ไม่ต้องโผล่) */}
              <RailGroup title="ทำต่ออัตโนมัติ">
                <span data-testid="card-button" className="flex flex-col gap-1.5">
                  {fields.cardButtons.length === 0 ? (
                    <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                      ยังไม่มีปุ่มอัตโนมัติที่ตั้งไว้ — ตั้งได้ที่ ตั้งค่าบอร์ด › อัตโนมัติ
                    </p>
                  ) : (
                    fields.cardButtons.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        data-testid="card-button-run"
                        disabled={!editable || runningButton !== null}
                        onClick={() => runCardButton(b.id, b.name)}
                        className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left"
                        style={{ fontSize: 12.5, borderColor: "var(--color-line)", background: "var(--color-surface)" }}
                      >
                        <KanbanIcon name="bolt" size="sm" />
                        {runningButton === b.id ? "กำลังทำ…" : b.name}
                      </button>
                    ))
                  )}
                </span>
              </RailGroup>

              <RailGroup title="ผู้ช่วย AI">
                <RailButton icon="spark" label="สรุปการ์ดนี้" disabled />
                <RailButton icon="spark" label="แตกเป็นเช็คลิสต์" disabled />
                <RailButton icon="spark" label="ร่างข้อความตอบลูกค้า" disabled />
              </RailGroup>

              <RailGroup title="ฟิลด์กำหนดเอง">
                <CustomFields
                  systemId={systemId}
                  boardId={boardId}
                  cardId={card.id}
                  editable={editable}
                  fields={fields.customFields}
                  nowMs={nowMs}
                  onChange={onCustomFieldsChange}
                  onToast={toast}
                />
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
