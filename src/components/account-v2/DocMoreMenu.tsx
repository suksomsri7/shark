"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { RowActionItem } from "./RowActions";
import { PortalMenu } from "./PortalMenu";

// ─────────────────────────────────────────────────────────────
// DocMoreMenu — "⋯" ของหน้าเอกสาร V2 (§5.3 หัวเอกสาร) ตาม g4/f14: ปุ่มกลม "⋯" เสมอ — ต่างจากปุ่มข้อความ
// พร้อมลูกศรที่ RowActions ของหน้ารายการใช้ — และรองรับรายการทำลาย/ยกเลิกเป็น ConfirmDialog ตัวสุดท้ายในเมนู
// (Fable QC WO 1.5 รอบ 1: ปุ่ม "ยกเลิกเอกสาร" สีแดงห้ามอยู่ข้างปุ่มดำหลัก → ย้ายมาไว้ท้ายเมนูนี้)
// WO 7.1 round 2 — เมนูเรนเดอร์ผ่าน PortalMenu (ไป document.body) กัน overflow ของการ์ดตารางตัดเมนูของแถวท้าย ๆ
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
  const anchorRef = useRef<HTMLDivElement>(null);

  if (items.length === 0 && !danger) return null;

  const itemCls = "block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]";

  return (
    <div className="relative inline-block text-left" ref={anchorRef} data-testid={testId}>
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
      <PortalMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} testId={testId ? `${testId}-menu` : undefined}>
        {items.map((it, i) => {
          const cls = `${itemCls} ${it.danger ? "text-[color:var(--color-danger)]" : ""}`;
          // WO 1.9 — รายการที่กดไม่ได้: โชว์เป็นบรรทัดจาง + เหตุผลไทยใต้ป้าย
          // (ห้ามซ่อนทิ้งเงียบ ๆ — ผู้ใช้ต้องรู้ว่า "ทำไมเตือนชำระไม่ได้" ไม่ใช่หาปุ่มไม่เจอ)
          if (it.disabled) {
            return (
              <div key={i} className={`${itemCls} cursor-not-allowed opacity-60`} title={it.hint} role="menuitem">
                <div>{it.label}</div>
                {it.hint && <div className="text-xs text-[color:var(--color-muted)]">{it.hint}</div>}
              </div>
            );
          }
          // WO 1.9 — รายการที่ต้องยิง server action (หยุด/เปิดใช้ · สร้างรอบตอนนี้ · ลบ)
          // เรนเดอร์เหมือน DocMoreMenu เป๊ะ: <form action={…}> + hidden fields (ไม่มี JS ก็ยังทำงาน)
          if (it.submit) {
            return (
              <form key={i} action={it.submit.action}>
                {Object.entries(it.submit.fields ?? {}).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <button type="submit" role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {it.label}
                </button>
              </form>
            );
          }
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
              testId={testId ? `${testId}-danger` : undefined}
              danger
            />
          </div>
        )}
      </PortalMenu>
    </div>
  );
}

export default DocMoreMenu;
