"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { RowActionItem } from "./RowActions";

// ─────────────────────────────────────────────────────────────
// DocMoreMenu — "⋯" ของหน้าเอกสาร V2 (§5.3 หัวเอกสาร) ตาม g4/f14: ปุ่มกลม "⋯" เสมอ — ต่างจากปุ่มข้อความ
// พร้อมลูกศรที่ RowActions ของหน้ารายการใช้ — และรองรับรายการทำลาย/ยกเลิกเป็น ConfirmDialog ตัวสุดท้ายในเมนู
// (Fable QC WO 1.5 รอบ 1: ปุ่ม "ยกเลิกเอกสาร" สีแดงห้ามอยู่ข้างปุ่มดำหลัก → ย้ายมาไว้ท้ายเมนูนี้)
// ─────────────────────────────────────────────────────────────

export type DangerMenuItem = {
  triggerLabel: string;
  title: string;
  detail?: string;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  reasonField?: { name: string; label: string; required?: boolean };
};

export function DocMoreMenu({ items, danger, testId }: { items: RowActionItem[]; danger?: DangerMenuItem; testId?: string }) {
  const [open, setOpen] = useState(false);
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

  if (items.length === 0 && !danger) return null;

  const itemCls = "block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]";

  return (
    <div className="relative inline-block text-left" ref={ref} data-testid={testId}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ทำรายการ"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg leading-none"
        style={{ borderColor: "var(--color-line)" }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
        >
          {items.map((it, i) => {
            const cls = `${itemCls} ${it.danger ? "text-[color:var(--color-danger)]" : ""}`;
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
          {danger && (
            <div className="mt-1 border-t pt-1" role="menuitem">
              <ConfirmDialog
                action={danger.action}
                fields={danger.fields}
                reasonField={danger.reasonField}
                triggerLabel={danger.triggerLabel}
                triggerClassName={`${itemCls} text-[color:var(--color-danger)]`}
                title={danger.title}
                detail={danger.detail}
                confirmLabel={danger.confirmLabel}
                danger
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocMoreMenu;
