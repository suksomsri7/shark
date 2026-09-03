"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import type { CreateDocItem } from "@/lib/modules/account/dashboard-home";

// ปุ่มดำ "+ บันทึกค่าใช้จ่าย ▾" / "+ สร้างใบแจ้งหนี้ ▾" บนหัวหน้าภาพรวม (§6, f4) — เหมือน DashCreateMenu ของ
// หน้าหลัก (WO 2.2) แต่คอลัมน์เดียว (เฉพาะฝั่งของหน้านี้) ไม่ใช่ 2 คอลัมน์ รายรับ|รายจ่าย
export function OvCreateMenu({ label, items, testId = "ov-create-doc" }: { label: string; items: CreateDocItem[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn btn-primary text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
      >
        + {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          data-testid={`${testId}-menu`}
          className="absolute right-0 top-full z-30 mt-1.5 flex w-[min(280px,90vw)] flex-col gap-0.5 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-2 shadow-[0_14px_34px_rgba(10,10,10,0.12)]"
        >
          {items.map((it) => (
            <Link
              key={it.testId}
              href={it.href}
              role="menuitem"
              data-testid={`${testId}-item-${it.testId}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]"
              onClick={() => setOpen(false)}
            >
              <AccountIcon name={it.icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default OvCreateMenu;
