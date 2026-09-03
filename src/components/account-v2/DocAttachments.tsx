"use client";

import { useRef, useState, useTransition } from "react";
import {
  deleteDocAttachmentAction,
  uploadDocAttachmentAction,
} from "@/lib/modules/account/editor-actions";
import type { AttachmentView } from "./doc-editor-types";

// ─────────────────────────────────────────────────────────────
// DocAttachments — ส่วน H ของ DESIGN-SPEC-V2 §5.2 (g1: "ลากไฟล์มาวาง หรือ + เพิ่มไฟล์" + การ์ดไฟล์)
// อัปโหลดจริงผ่าน storage service → AccountAttachment ผูกกับเอกสาร (เข้าคลังเอกสาร §12 อัตโนมัติ)
// ต้องมีร่างก่อนถึงจะแนบได้ (ไฟล์ต้องผูก documentId) — ยังไม่มีร่าง = ปุ่มบอกให้บันทึกร่างก่อน
// ─────────────────────────────────────────────────────────────

function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function DocAttachments({
  systemId,
  documentId,
  storageEnabled,
  initial,
  onNeedDraft,
  onCountChange,
}: {
  systemId: string;
  documentId?: string;
  storageEnabled: boolean;
  initial: AttachmentView[];
  /**
   * ยังไม่มีร่าง → ให้ฟอร์มบันทึกร่างก่อนแล้วคืน docId กลับมา
   * ไม่ระบุ = เอกสารมีอยู่แล้วแน่นอน (หน้าเอกสาร V2 WO 1.5 — documentId เสมอ) — ไม่ต้องส่ง closure
   * ข้ามขอบเขต server/client component (function พล็อตธรรมดาส่งข้ามไม่ได้นอกจาก server action)
   */
  onNeedDraft?: () => Promise<string | null>;
  /** รายงานจำนวนไฟล์กลับให้ฟอร์ม (ใช้ติ๊ก ✓ ที่หัว section) */
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<AttachmentView[]>(initial);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    setError("");
    let docId = documentId;
    if (!docId) docId = (await onNeedDraft?.()) ?? undefined;
    if (!docId) {
      setError("บันทึกร่างก่อนจึงจะแนบไฟล์ได้");
      return;
    }
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("systemId", systemId);
      fd.set("documentId", docId);
      fd.set("file", file);
      const res = await uploadDocAttachmentAction(fd);
      if (res.ok) {
        setItems((prev) => {
          const next = [
            ...prev,
            { id: res.id, fileName: res.fileName, fileUrl: res.fileUrl, mimeType: res.mimeType, sizeBytes: res.sizeBytes },
          ];
          onCountChange?.(next.length);
          return next;
        });
      } else {
        setError(res.reason);
      }
    }
  };

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteDocAttachmentAction(systemId, id);
      if (res.ok)
        setItems((prev) => {
          const next = prev.filter((x) => x.id !== id);
          onCountChange?.(next.length);
          return next;
        });
      else setError(res.reason);
    });

  return (
    <div className="flex flex-col gap-2" data-testid="attachments">
      <div
        className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm"
        style={dragOver ? { background: "var(--color-surface-2)", borderColor: "var(--color-ink)" } : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
      >
        <span aria-hidden>⬆</span>
        <span className="text-[color:var(--color-muted)]">ลากไฟล์มาวาง หรือ</span>
        <button
          type="button"
          className="text-[color:var(--color-accent)]"
          onClick={() => inputRef.current?.click()}
          disabled={!storageEnabled}
          data-testid="attachments-add"
        >
          + เพิ่มไฟล์
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {!storageEnabled && (
        <p className="text-xs text-[color:var(--color-muted)]">
          ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (storage) ของร้าน — ติดต่อผู้ดูแลระบบเพื่อเปิดใช้การแนบไฟล์
        </p>
      )}
      {error && <p className="text-xs text-[color:var(--color-danger)]">{error}</p>}
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm" data-testid="attachment-row">
          {a.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- thumbnail จาก CDN ของ tenant (ขนาดไม่รู้ล่วงหน้า)
            <img src={a.fileUrl} alt="" className="h-10 w-10 rounded object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded bg-[color:var(--color-surface-2)]">📄</span>
          )}
          <span className="min-w-0 flex-1">
            <a href={a.fileUrl} target="_blank" rel="noreferrer" className="block truncate font-medium">
              {a.fileName}
            </a>
            <span className="text-xs text-[color:var(--color-muted)]">{sizeText(a.sizeBytes)}</span>
          </span>
          <button
            type="button"
            className="text-[color:var(--color-muted)]"
            aria-label={`ลบไฟล์ ${a.fileName}`}
            disabled={pending}
            onClick={() => remove(a.id)}
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}

export default DocAttachments;
