"use client";

import { useEffect, useRef } from "react";

// Modal กลางจอ (g5-contact-modal.png): หัว title ตัวหนา + ✕ มุมขวา (ปุ่มสี่เหลี่ยมมน) · Esc/คลิกฉากหลังปิด · focus trap
export type ModalSize = "sm" | "md" | "lg";
const SIZE_CLS: Record<ModalSize, string> = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({
  open,
  onClose,
  title,
  actions,
  size = "md",
  children,
  testId,
  sheetOnMobile,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  actions?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  testId?: string;
  /** WO 3.3 (SPEC §13 · มือถือ 390): บนจอแคบให้กลายเป็นแผ่นเต็มจอ ไม่ใช่กล่องลอยที่มีขอบรอบด้าน */
  sheetOnMobile?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // 🔴 บั๊กจริงที่เจอตอนถ่ายภาพ WO 3.3 (4 ก.ย.) — ห้ามรวม 2 effect นี้กลับเป็นก้อนเดียว:
  //    ของเดิมเป็น effect เดียวที่ dependency = [open, onClose] และเรียก `el.focus()` ข้างใน
  //    ผู้เรียกเกือบทุกที่ส่ง `onClose={() => ...}` (arrow ใหม่ทุกครั้งที่ render)
  //    ⇒ ทุกครั้งที่ state ใน modal เปลี่ยน (= ทุกตัวอักษรที่ผู้ใช้พิมพ์) effect ถูกล้างแล้วรันใหม่
  //      → `el.focus()` **ดึงโฟกัสออกจากช่องที่กำลังพิมพ์** ไปไว้ที่กล่อง dialog
  //      → พิมพ์ได้ตัวเดียวแล้วหยุด (วัดจริง: พิมพ์ "AB CD" ได้ "A")
  //    แก้: โฟกัสครั้งเดียวตอนเปิด (dep = [open]) · ตัวจับคีย์เก็บ onClose ผ่าน ref (ไม่ผูกกับ dependency)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusables = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${sheetOnMobile ? "p-0 md:p-4" : "p-4"}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`flex w-full flex-col bg-[color:var(--color-surface)] shadow-[0_8px_24px_rgba(10,10,10,.16)] outline-none ${SIZE_CLS[size]} ${
          sheetOnMobile ? "h-full max-h-full rounded-none md:h-auto md:max-h-[90vh] md:rounded-2xl" : "max-h-[90vh] rounded-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {actions && <div className="flex justify-end gap-2 border-t px-5 py-4">{actions}</div>}
      </div>
    </div>
  );
}

export default Modal;
