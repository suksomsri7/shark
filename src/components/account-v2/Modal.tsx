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
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  actions?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  testId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${SIZE_CLS[size]} flex-col rounded-2xl bg-[color:var(--color-surface)] shadow-[0_8px_24px_rgba(10,10,10,.16)] outline-none`}
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
