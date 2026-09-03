"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type RowActionItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
};

// เมนู "ทำรายการ ▾" ต่อแถว (DESIGN-SPEC-V2 §1/§3) — ⋯/"ทำรายการ ▾"
export function RowActions({
  items,
  testId,
  label = "ทำรายการ",
  defaultOpen = false,
}: {
  items: RowActionItem[];
  testId?: string;
  label?: string;
  /** เปิดเมนูไว้ตั้งแต่แรก — ใช้เฉพาะหน้า gallery สำหรับถ่ายภาพ QC */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative inline-block text-left" ref={ref} data-testid={testId}>
      <button
        type="button"
        className="btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
        >
          {items.map((it, i) => {
            const cls = `block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)] ${
              it.danger ? "text-[color:var(--color-danger)]" : ""
            }`;
            if (it.href) {
              return (
                <Link key={i} href={it.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {it.label}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RowActions;
