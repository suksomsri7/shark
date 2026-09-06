// Attachments.tsx — ไฟล์แนบ + ปกการ์ด ในหลังการ์ด (K1.9) · แบบ: `ledger/design-kanban/03-card-back.png` บล็อก "ไฟล์แนบ"
// หัวข้อ + จำนวน + ปุ่ม "+ อัปโหลด" (input ซ่อนไว้ คลิกปุ่มเพื่อเปิด) → รายการไฟล์: thumbnail/ไอคอน · ชื่อ ·
// ขนาด · ผู้อัป · วันที่ · ปุ่ม "ตั้งเป็นปก"/"เอาออกจากปก" (เฉพาะรูป) · ลบ (ยืนยันก่อนลบเสมอ)
//
// ทุกการแก้ไข = optimistic ก่อน (แพตเทิร์นเดียวกับ Checklist.tsx/Comments.tsx) แล้วค่อยยิง action จริง
// ผิดพลาด → revert + toast แบบข้อความในหน้า (ห้าม alert()) — [[feedback_validation_inline_not_alert]]
"use client";

import { useCallback, useRef, useState } from "react";
import { formatCardDateTime } from "./Card";
import { KanbanIcon } from "./KanbanIcon";
import { removeAttachmentAction, setCoverAction, uploadAttachmentAction } from "@/lib/modules/kanban/actions";
import type { KanbanAttachmentDto } from "@/lib/modules/kanban/types";

/** ตัวกรองไฟล์ในกล่องเลือกไฟล์ (UX เท่านั้น — เซิร์ฟเวอร์ตรวจซ้ำด้วยไบต์จริงเสมอ ดู `attachments.ts`) */
const ATTACHMENT_ACCEPT = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*";

function humanFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type AttachmentsProps = {
  systemId: string;
  boardId: string;
  cardId: string;
  /** แนบ/ลบ/ตั้งปกได้ไหม (EDITOR+ ของบอร์ด) */
  editable: boolean;
  attachments: KanbanAttachmentDto[];
  onChange: (attachments: KanbanAttachmentDto[]) => void;
  onToast: (message: string) => void;
};

export function Attachments({ systemId, boardId, cardId, editable, attachments, onChange, onToast }: AttachmentsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      const fd = new FormData();
      fd.set("systemId", systemId);
      fd.set("boardId", boardId);
      fd.set("cardId", cardId);
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await uploadAttachmentAction(fd);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (res.attachments) onChange(res.attachments);
      if (!res.ok) onToast(res.message || "แนบไฟล์ไม่สำเร็จ");
    },
    [systemId, boardId, cardId, onChange, onToast],
  );

  const remove = useCallback(
    (att: KanbanAttachmentDto) => {
      if (typeof window !== "undefined" && !window.confirm(`ลบไฟล์แนบ "${att.name}"?`)) return;
      const before = attachments;
      onChange(attachments.filter((a) => a.id !== att.id));
      removeAttachmentAction({ systemId, boardId, cardId, attachmentId: att.id }).then((res) => {
        if (res.ok) {
          onChange(res.attachments);
          return;
        }
        onChange(res.attachments ?? before);
        onToast(res.message || "ลบไฟล์แนบไม่สำเร็จ");
      });
    },
    [attachments, systemId, boardId, cardId, onChange, onToast],
  );

  const toggleCover = useCallback(
    (att: KanbanAttachmentDto) => {
      const before = attachments;
      const nextId = att.isCover ? null : att.id;
      onChange(attachments.map((a) => ({ ...a, isCover: a.id === att.id && !att.isCover })));
      setCoverAction({ systemId, boardId, cardId, attachmentId: nextId }).then((res) => {
        if (!res.ok) {
          onChange(before);
          onToast(res.message || "ตั้งปกไม่สำเร็จ");
        }
      });
    },
    [attachments, systemId, boardId, cardId, onChange, onToast],
  );

  if (attachments.length === 0 && !editable) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="attachment-list">
      <div className="flex items-center gap-2">
        <KanbanIcon name="clip" size="sm" className="text-[color:var(--color-muted)]" />
        <span style={{ fontSize: 13, fontWeight: 700 }}>ไฟล์แนบ</span>
        {attachments.length > 0 && <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{attachments.length}</span>}
        <span className="flex-1" />
        {editable && (
          <>
            <input
              ref={inputRef}
              data-testid="attachment-upload"
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={uploading}
              onChange={(e) => upload(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border disabled:opacity-50"
              style={{ height: 27, padding: "0 9px", fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-ink-soft)", background: "var(--color-surface)" }}
            >
              <KanbanIcon name="upload" size="xs" />
              {uploading ? "กำลังอัปโหลด…" : "+ อัปโหลด"}
            </button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <div
          className="rounded-lg border border-dashed px-3 py-2"
          style={{ fontSize: 12.5, color: "var(--color-muted)", borderColor: "var(--color-line)" }}
        >
          ยังไม่มีไฟล์แนบในการ์ดนี้{editable ? " — อัปโหลดไฟล์แรกได้เลย" : ""}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              attachment={att}
              editable={editable}
              onRemove={() => remove(att)}
              onToggleCover={() => toggleCover(att)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── ไฟล์แนบ 1 รายการ ─────────────────────────

function AttachmentRow({
  attachment,
  editable,
  onRemove,
  onToggleCover,
}: {
  attachment: KanbanAttachmentDto;
  editable: boolean;
  onRemove: () => void;
  onToggleCover: () => void;
}) {
  const isImage = attachment.contentType.startsWith("image/");
  return (
    <li
      data-testid="attachment-item"
      className="flex items-center gap-2.5 rounded-lg border px-2 py-1.5"
      style={{ borderColor: "var(--color-line)" }}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnail จาก CDN ของร้าน (ตัวเดียวกับ Card.tsx cover)
        <img src={attachment.url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <span
          className="grid shrink-0 place-items-center"
          style={{ width: 36, height: 36, borderRadius: 6, background: "var(--color-surface-2)", color: "var(--color-muted)" }}
        >
          <KanbanIcon name="doc" size="sm" />
        </span>
      )}
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1"
        style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}
      >
        <div className="truncate" style={{ fontWeight: 600 }}>
          {attachment.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
          {humanFileSize(attachment.bytes)} · อัปโดย {attachment.uploadedBy.name} · {formatCardDateTime(attachment.createdAt)}
        </div>
      </a>
      {editable && (
        <div className="flex shrink-0 items-center gap-2.5">
          {isImage && (
            <button
              type="button"
              data-testid="attachment-cover-toggle"
              onClick={onToggleCover}
              style={{
                fontSize: 11.5,
                color: attachment.isCover ? "var(--color-accent)" : "var(--color-muted)",
                textDecoration: "underline",
                whiteSpace: "nowrap",
              }}
            >
              {attachment.isCover ? "เอาออกจากปก" : "ตั้งเป็นปก"}
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label="ลบไฟล์แนบ" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="trash" size="xs" />
          </button>
        </div>
      )}
    </li>
  );
}

export default Attachments;
