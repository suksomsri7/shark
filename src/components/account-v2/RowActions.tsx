"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type RowActionItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  /** WO 1.9 — รายการที่ต้อง "ส่งฟอร์ม" ไป server action (เช่น "เตือนชำระ") · รองรับเฉพาะใน DocMoreMenu */
  submit?: {
    action: (formData: FormData) => void | Promise<void>;
    fields?: Record<string, string>;
  };
  /** ปิดใช้งานพร้อมเหตุผลไทย (โชว์เป็นบรรทัดจาง — ห้ามซ่อนเงียบ ๆ ให้ผู้ใช้งงว่าปุ่มหายไปไหน) */
  disabled?: boolean;
  /** เหตุผลไทยที่กดไม่ได้ (แสดงใต้ป้าย + เป็น title) */
  hint?: string;
};

// เมนู "ทำรายการ ▾" ต่อแถว (DESIGN-SPEC-V2 §1/§3)
// เดสก์ท็อป (f3): ปุ่มรอง "ทำรายการ ▾" · มือถือ (f13): ปุ่มกลม "⋯" 44px มุมขวาการ์ด (ไม่ใช่ปุ่มยาว)
// ปุ่มทั้งสองใช้ state เดียวกัน (สลับด้วย CSS breakpoint ไม่ใช่ instance คนละตัว) — เมนู dropdown ใช้ร่วมกัน
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
        className="btn-sm hidden md:inline-flex"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full border text-lg leading-none md:hidden"
        style={{ borderColor: "var(--color-line)" }}
      >
        ⋯
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
