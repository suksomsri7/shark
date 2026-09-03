"use client";

import { useEffect, useRef } from "react";

// แผงเลื่อนขวา (§7.1 โปรไฟล์ 360°) — desktop w-560 ชิดขวา · มือถือเต็มจอแบบ bottom-sheet (g18-sheet-l2.png: มือจับบน + ✕ มุมขวา)
export function SlideOver({
  open,
  onClose,
  title,
  actions,
  children,
  testId,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** ปุ่มเพิ่มเติมทางซ้ายของ ✕ บนหัวแผง (WO 3.4: ✏ แก้ไข ตาม f5) — optional ผู้เรียกเดิมไม่กระทบ */
  headerExtra?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="flex h-full w-full flex-col rounded-t-2xl bg-[color:var(--color-surface)] shadow-[0_8px_24px_rgba(10,10,10,.16)] outline-none sm:my-0 sm:h-full sm:w-[560px] sm:rounded-none"
        style={{ marginTop: "auto" }}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full" style={{ background: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
          <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]"
          >
            ✕
          </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {actions && <div className="flex justify-end gap-2 border-t px-5 py-4">{actions}</div>}
      </div>
    </div>
  );
}

export default SlideOver;
