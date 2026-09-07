// task-from-chat-panel.tsx — แผงขวา "สร้างงานจากบทสนทนานี้" (K3.2)
// แบบที่เคาะ: `ledger/design-kanban/09-from-chat.png` — ลำดับบล็อกในไฟล์นี้เรียงตามภาพจากบนลงล่าง
// ⚠️ ห้ามอีโมจิ — ไอคอนทุกตัวมาจาก <Icon> ของโมดูลแชท (ทะเบียนเดียว `icons.tsx`)
// ⚠️ วัน/เวลาไทยใช้ <ThaiDatePicker> ตัวเดียวกับหลังการ์ด — ห้าม <input type="date"> (หนี้ UI K1.6)
"use client";

import { useEffect, useState, useTransition } from "react";
import { ThaiDatePicker } from "@/components/kanban/ThaiDatePicker";
import { Icon } from "./icons";
import {
  createTaskFromChatAction,
  draftTaskFromChatAction,
  type TaskFromChatDraftView,
} from "./task-from-chat-actions";

/** ความกว้างแผงตามภาพ 09 (เดสก์ท็อป) — จอแคบกางเต็มจอ */
const PANEL_WIDTH_PX = 380;

export type TaskFromChatPanelProps = {
  conversationId: string;
  onClose: () => void;
  /** เรียกเมื่อสร้างการ์ดสำเร็จ — หน้าห้องแชทเอาไปขึ้น toast "สร้างการ์ด #n แล้ว" + ลิงก์เปิดการ์ด */
  onCreated: (result: { cardNo: number | null; cardHref: string; created: boolean }) => void;
};

type FormState = {
  title: string;
  boardId: string;
  columnId: string;
  assigneeUserId: string;
  dueAtIso: string | null;
  labelIds: string[];
  description: string;
  linkConversation: boolean;
  linkParty: boolean;
  copyAttachments: boolean;
};

export function TaskFromChatPanel({ conversationId, onClose, onCreated }: TaskFromChatPanelProps) {
  const [view, setView] = useState<TaskFromChatDraftView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  // ร่างถูกเตรียมครั้งเดียวตอนเปิดแผง — ระหว่างที่คนกำลังแก้ ห้ามมีอะไรมาเขียนทับสิ่งที่พิมพ์ไปแล้ว
  useEffect(() => {
    let alive = true;
    setView(null);
    setErr(null);
    setForm(null);
    void draftTaskFromChatAction(conversationId).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      const boardId = res.boards.some((b) => b.id === res.defaults.boardId)
        ? res.defaults.boardId
        : (res.boards[0]?.id ?? "");
      const board = res.boards.find((b) => b.id === boardId);
      const columnId = board?.columns.some((c) => c.id === res.defaults.columnId)
        ? (res.defaults.columnId ?? "")
        : (board?.columns[0]?.id ?? "");
      setView(res);
      setForm({
        title: res.draft.title,
        boardId,
        columnId,
        assigneeUserId: "",
        dueAtIso: res.draft.dueAtIso,
        labelIds: [],
        description: res.draft.summary,
        linkConversation: true,
        linkParty: true,
        copyAttachments: res.meta.attachmentCount > 0,
      });
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const board = view && form ? view.boards.find((b) => b.id === form.boardId) : undefined;

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const pickBoard = (boardId: string) => {
    const next = view?.boards.find((b) => b.id === boardId);
    // เปลี่ยนบอร์ด = คอลัมน์/ป้ายของบอร์ดเดิมใช้ไม่ได้อีกแล้ว ต้องรีเซ็ต ไม่ใช่ปล่อยค่าเก่าค้าง
    patch({ boardId, columnId: next?.columns[0]?.id ?? "", labelIds: [] });
  };

  const toggleLabel = (labelId: string) =>
    setForm((f) =>
      f
        ? { ...f, labelIds: f.labelIds.includes(labelId) ? f.labelIds.filter((x) => x !== labelId) : [...f.labelIds, labelId] }
        : f,
    );

  const submit = () => {
    if (!form) return;
    setErr(null);
    startSaving(async () => {
      const res = await createTaskFromChatAction({
        conversationId,
        title: form.title,
        description: form.description ? `<p>${form.description.replace(/[<>]/g, " ")}</p>` : null,
        boardId: form.boardId,
        columnId: form.columnId || null,
        assigneeUserIds: form.assigneeUserId ? [form.assigneeUserId] : [],
        dueAtIso: form.dueAtIso,
        labelIds: form.labelIds,
        checklist: view?.draft.checklist ?? [],
        linkConversation: form.linkConversation,
        linkParty: form.linkParty,
        copyAttachments: form.copyAttachments,
      });
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      onCreated({ cardNo: res.cardNo, cardHref: res.cardHref, created: res.created });
    });
  };

  return (
    <aside
      data-testid="task-from-chat-panel"
      aria-label="สร้างงานจากบทสนทนานี้"
      style={{ ["--task-panel-w" as string]: `${PANEL_WIDTH_PX}px` }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden border-[color:var(--color-line)] bg-[color:var(--color-surface)] shadow-[0_10px_40px_rgba(15,23,42,0.24)] sm:absolute sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[var(--task-panel-w)] sm:rounded-2xl sm:border"
    >
      {/* ── หัวแผง ── */}
      <div className="flex items-center gap-2 border-b border-[color:var(--color-line)] px-3.5 py-2.5">
        <Icon name="bookmark" className="text-[color:var(--color-accent)]" />
        <h2 className="flex-1 truncate text-[15px] font-bold">สร้างงานจากบทสนทนานี้</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดแผงสร้างงาน"
          data-testid="task-from-chat-close"
          className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[#3f4652] hover:bg-[color:var(--color-surface-2)]"
        >
          <Icon name="x" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-2.5">
        {/* ── กล่องฟ้า "ผู้ช่วย AI เตรียมให้แล้ว" ── */}
        <div className="rounded-xl border border-[#cddafc] bg-[#eef3fe] p-2.5">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-[color:var(--color-accent)]">
            <Icon name="sparkle" size="sm" />
            ผู้ช่วย AI เตรียมให้แล้ว
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-[#3f4652]">
            อ่าน {view?.draft.readCount ?? 0} ข้อความล่าสุด → ตั้งชื่อการ์ด สรุปรายละเอียด เดากำหนดส่ง
            และร่างเช็คลิสต์ให้ · แก้ไขได้ก่อนบันทึก
          </p>
        </div>

        {err && (
          <p data-testid="task-from-chat-error" className="rounded-lg bg-[#fdeceb] px-3 py-2 text-[12.5px] text-[#b42318]">
            {err}
          </p>
        )}

        {!view || !form ? (
          <p className="px-1 py-6 text-center text-[13px] text-[color:var(--color-muted)]">กำลังเตรียมร่างการ์ด…</p>
        ) : (
          <>
            {/* ── ชื่อการ์ด ── */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">ชื่อการ์ด</span>
              <input
                data-testid="task-from-chat-title"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={200}
                className="input h-9 text-[13.5px]"
              />
            </label>

            {/* ── ลงบอร์ด · คอลัมน์ ── */}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#3f4652]">ลงบอร์ด</span>
                <select
                  data-testid="task-from-chat-board"
                  value={form.boardId}
                  onChange={(e) => pickBoard(e.target.value)}
                  className="input h-9 py-0 text-[13px]"
                >
                  {view.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#3f4652]">คอลัมน์</span>
                <select
                  data-testid="task-from-chat-column"
                  value={form.columnId}
                  onChange={(e) => patch({ columnId: e.target.value })}
                  className="input h-9 py-0 text-[13px]"
                >
                  {(board?.columns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* ── ผู้รับผิดชอบ · กำหนดส่ง ── */}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#3f4652]">ผู้รับผิดชอบ</span>
                <select
                  data-testid="task-from-chat-assignee"
                  value={form.assigneeUserId}
                  onChange={(e) => patch({ assigneeUserId: e.target.value })}
                  className="input h-9 py-0 text-[13px]"
                >
                  <option value="">ยังไม่ระบุ</option>
                  {view.staff.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#3f4652]">กำหนดส่ง</span>
                <div className="flex items-center gap-1.5">
                  <ThaiDatePicker
                    value={form.dueAtIso}
                    onChange={(next) => patch({ dueAtIso: next })}
                    editable
                    withTime
                    open={dueOpen}
                    onOpenChange={setDueOpen}
                    nowMs={view.nowMs}
                    ariaLabel="กำหนดส่งของการ์ดที่จะสร้าง"
                    chipTestId="task-from-chat-due"
                    pickerTestId="task-from-chat-due-picker"
                  />
                  {view.draft.dueGuessed && (
                    <span
                      data-testid="task-from-chat-due-ai"
                      title="วันนี้มาจากการอ่านข้อความของลูกค้า — ตรวจอีกครั้งก่อนบันทึก"
                      className="shrink-0 rounded-md bg-[#eef3fe] px-1.5 py-0.5 text-[10.5px] font-bold text-[color:var(--color-accent)]"
                    >
                      AI
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── ป้ายกำกับของบอร์ดที่เลือก ── */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">ป้ายกำกับ</span>
              {board && board.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {board.labels.map((l) => {
                    const on = form.labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        data-testid="task-from-chat-label"
                        aria-pressed={on}
                        onClick={() => toggleLabel(l.id)}
                        style={{ color: `var(--color-tag-${l.color.toLowerCase()})`, borderColor: `var(--color-tag-${l.color.toLowerCase()})` }}
                        className={`rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${on ? "bg-[color:var(--color-surface-2)]" : "bg-transparent"}`}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-[color:var(--color-muted)]">บอร์ดนี้ยังไม่มีป้ายกำกับ</p>
              )}
            </div>

            {/* ── รายละเอียด (สรุปจากแชท) ── */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">รายละเอียด (สรุปจากแชท)</span>
              <textarea
                data-testid="task-from-chat-description"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                rows={4}
                className="input min-h-[76px] py-1.5 text-[13px] leading-[1.5]"
              />
            </label>

            {/* ── เชื่อมอัตโนมัติ (4 ติ๊กตามภาพ 09) ── */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">เชื่อมอัตโนมัติ</span>

              <LinkRow
                testId="task-from-chat-link-conversation"
                icon="globe"
                checked={form.linkConversation}
                onChange={(v) => patch({ linkConversation: v })}
                label={`บทสนทนา ${view.meta.channelLabel} นี้`}
                hint="ที่มาของการ์ด"
              />
              <LinkRow
                testId="task-from-chat-link-party"
                icon="users"
                checked={form.linkParty}
                onChange={(v) => patch({ linkParty: v })}
                label={`ผู้ติดต่อ: ${view.meta.contactName}`}
                hint="CRM / Party"
              />
              <LinkRow
                testId="task-from-chat-copy-attachments"
                icon="clip"
                checked={form.copyAttachments}
                onChange={(v) => patch({ copyAttachments: v })}
                label={`คัดลอกไฟล์แนบในแชท (${view.meta.attachmentCount} ไฟล์)`}
              />
              <LinkRow
                testId="task-from-chat-link-quotation"
                icon="bookmark"
                checked={false}
                onChange={() => undefined}
                disabled
                label="สร้างใบเสนอราคาร่างในระบบบัญชีด้วย"
                hint="เร็ว ๆ นี้"
              />

              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[color:var(--color-muted)]">
                เมื่อการ์ดถูกปิด ระบบจะกลับมาแปะบันทึกในบทสนทนานี้ให้อัตโนมัติ
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── ท้ายแผง ── */}
      <div className="flex items-center gap-2 border-t border-[color:var(--color-line)] px-3.5 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-[1.4] text-[color:var(--color-muted)]">
          ปุ่มนี้เปิด/ปิดได้ที่ ตั้งค่า › การเชื่อมต่อ
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[color:var(--color-line)] px-3 py-1.5 text-[12.5px] font-semibold"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          data-testid="task-from-chat-submit"
          onClick={submit}
          disabled={saving || !form || !form.title.trim() || !form.boardId}
          className="rounded-lg bg-[#111827] px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-45"
        >
          {saving ? "กำลังสร้าง…" : "สร้างการ์ด"}
        </button>
      </div>
    </aside>
  );
}

/** แถวติ๊ก 1 บรรทัดของบล็อก "เชื่อมอัตโนมัติ" (ไอคอน + ข้อความ + คำอธิบายชิดขวา) */
function LinkRow({
  testId,
  icon,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  testId: string;
  icon: "globe" | "users" | "clip" | "bookmark";
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      data-testid={testId}
      className={`flex items-center gap-2 rounded-lg border border-[color:var(--color-line)] px-2.5 py-1.5 text-[12.5px] ${disabled ? "opacity-55" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-[color:var(--color-accent)]"
      />
      <Icon name={icon} size="sm" className="shrink-0 text-[color:var(--color-muted)]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-[color:var(--color-muted)]">{hint}</span>}
    </label>
  );
}

export default TaskFromChatPanel;
