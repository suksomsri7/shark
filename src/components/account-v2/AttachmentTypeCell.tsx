"use client";

// AttachmentTypeCell.tsx — คอลัมน์ "ประเภท" ของคลังเอกสาร V2 (f9): ป้าย + ✏ แก้ได้
// เนื้อโมดัล (ChangeTypeModal) อยู่ใน AttachmentModals.tsx — ใช้ร่วมกับรายการ "เปลี่ยนประเภท" ใน ทำรายการ ▾
import { useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { ChangeTypeModal } from "./AttachmentModals";

export function AttachmentTypeCell({
  systemId,
  attachmentId,
  label,
  docTypeHint,
  linked,
}: {
  systemId: string;
  attachmentId: string;
  label: string;
  docTypeHint: string | null;
  /** ผูกกับเอกสารแล้วหรือยัง — true = แก้ประเภทไม่ได้ (ป้ายมาจากเอกสารจริง) */
  linked: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex max-w-[220px] items-center gap-1 whitespace-nowrap text-sm"
        onClick={() => setOpen(true)}
        data-testid="attachment-type-edit"
      >
        <span className="truncate">{label}</span>
        <AccountIcon name="edit" className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-muted)]" />
      </button>
      <ChangeTypeModal open={open} onClose={() => setOpen(false)} systemId={systemId} attachmentId={attachmentId} initialValue={docTypeHint} linked={linked} />
    </>
  );
}

export default AttachmentTypeCell;
