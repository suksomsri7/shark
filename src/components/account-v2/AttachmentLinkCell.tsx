"use client";

// AttachmentLinkCell.tsx — คอลัมน์ "เอกสารที่ผูก" ของคลังเอกสาร V2 (f9)
// ผูกแล้ว: ลิงก์น้ำเงินเลขที่เอกสาร · ยังไม่ผูก: ปุ่ม "+ สร้าง/แนบเอกสาร" เปิด dropdown เล็ก 2 ทาง
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { AttachDocumentModal } from "./AttachmentModals";

export function AttachmentLinkCell({
  systemId,
  attachmentId,
  fileName,
  linkedHref,
  linkedDocNo,
  createExpenseHref,
}: {
  systemId: string;
  attachmentId: string;
  fileName: string;
  linkedHref: string | null;
  linkedDocNo: string | null;
  /** ลิงก์ "สร้างบันทึกค่าใช้จ่าย" prefill `?attachmentId=` — WO 7.2 จะอ่านค่านี้ต่อ */
  createExpenseHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (linkedHref) {
    return (
      <Link href={linkedHref} className="whitespace-nowrap font-medium" style={{ color: "var(--color-accent)" }} data-testid="attachment-linked-doc">
        {linkedDocNo ?? "ดูเอกสาร"}
      </Link>
    );
  }

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        className="btn-sm whitespace-nowrap"
        onClick={() => setOpen((o) => !o)}
        data-testid="attachment-link-cell-btn"
      >
        + สร้าง/แนบเอกสาร
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-1 min-w-[220px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
        >
          <Link
            href={createExpenseHref}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => setOpen(false)}
            data-testid="attachment-create-expense"
          >
            <AccountIcon name="plus" className="h-4 w-4 text-[color:var(--color-muted)]" />
            สร้างบันทึกค่าใช้จ่าย
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              setOpen(false);
              setAttachOpen(true);
            }}
            data-testid="attachment-attach-existing"
          >
            <AccountIcon name="link" className="h-4 w-4 text-[color:var(--color-muted)]" />
            แนบกับเอกสารที่มีอยู่
          </button>
        </div>
      )}
      <AttachDocumentModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        systemId={systemId}
        attachmentId={attachmentId}
        fileName={fileName}
      />
    </div>
  );
}

export default AttachmentLinkCell;
