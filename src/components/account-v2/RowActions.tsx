"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";

export type RowActionItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  /** WO 1.9 — รายการที่ต้อง "ส่งฟอร์ม" ไป server action (เตือนชำระ · หยุด/เปิดกฎ · ลบ) — รองรับทั้ง RowActions และ DocMoreMenu */
  submit?: {
    action: (formData: FormData) => void | Promise<void>;
    fields?: Record<string, string>;
  };
  /** ปิดใช้งานพร้อมเหตุผลไทย (โชว์เป็นบรรทัดจาง — ห้ามซ่อนเงียบ ๆ ให้ผู้ใช้งงว่าปุ่มหายไปไหน) */
  disabled?: boolean;
  /** เหตุผลไทยที่กดไม่ได้ (แสดงใต้ป้าย + เป็น title) */
  hint?: string;
  /** WO 3.2 รอบแก้ 2 — ไอคอนเส้นบางนำหน้าป้าย (คีย์ของ AccountIcon) ตาม f5-contacts-menu.png — ไม่ส่ง = ไม่มีไอคอน */
  icon?: string;
  /** WO 3.2 รอบแก้ 2 — เส้นคั่นเหนือรายการนี้ (จัดกลุ่มย่อยใน dropdown ตาม f5-contacts-menu.png) */
  sepBefore?: boolean;
};

// เมนู "ทำรายการ ▾" ต่อแถว (DESIGN-SPEC-V2 §1/§3)
// เดสก์ท็อป (f3): ปุ่มรอง "ทำรายการ ▾" · มือถือ (f13): ปุ่มกลม "⋯" 44px มุมขวาการ์ด (ไม่ใช่ปุ่มยาว)
// ปุ่มทั้งสองใช้ state เดียวกัน (สลับด้วย CSS breakpoint ไม่ใช่ instance คนละตัว) — เมนู dropdown ใช้ร่วมกัน
export function RowActions({
  items,
  testId,
  label = "ทำรายการ",
  defaultOpen = false,
  trigger = "label",
}: {
  items: RowActionItem[];
  testId?: string;
  label?: string;
  /** เปิดเมนูไว้ตั้งแต่แรก — ใช้เฉพาะหน้า gallery สำหรับถ่ายภาพ QC */
  defaultOpen?: boolean;
  /** WO 5.1 — "icon": ปุ่ม "⋯" เปล่า (ไม่มีกรอบ) ทั้งเดสก์ท็อป/มือถือ ตาม g9-finance-channels.png
   * (การ์ดช่องทางการเงิน) — ค่าเริ่มต้น "label" = ปุ่ม "ทำรายการ ▾" เดสก์ท็อป + วงกลม "⋯" มือถือ (ของเดิม ไม่กระทบหน้าอื่น) */
  trigger?: "label" | "icon";
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
      {trigger === "icon" ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((o) => !o)}
          className="flex h-6 w-6 items-center justify-center rounded text-base leading-none text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
        >
          ⋯
        </button>
      ) : (
        <>
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
        </>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
        >
          {items.map((it, i) => {
            const cls = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)] ${
              it.danger ? "text-[color:var(--color-danger)]" : ""
            }`;
            // WO 3.2 รอบแก้ 2 — เส้นคั่นจัดกลุ่มย่อย (f5-contacts-menu.png: 4 สร้าง | ดูประวัติ/แก้ไข/เพิ่มเข้ากลุ่ม | ปิดใช้งาน)
            const sep = it.sepBefore && <div role="separator" className="my-1 border-t" style={{ borderColor: "var(--color-line)" }} />;
            const iconNode = it.icon && <AccountIcon name={it.icon} className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />;
            // WO 1.9 — รายการที่กดไม่ได้: บรรทัดจาง + เหตุผลไทย (ห้ามซ่อนทิ้งเงียบ ๆ)
            if (it.disabled) {
              return (
                <div key={i}>
                  {sep}
                  <div className={`${cls} cursor-not-allowed opacity-60`} title={it.hint} role="menuitem">
                    {iconNode}
                    <div>
                      <div>{it.label}</div>
                      {it.hint && <div className="text-xs text-[color:var(--color-muted)]">{it.hint}</div>}
                    </div>
                  </div>
                </div>
              );
            }
            // WO 1.9 — รายการที่ต้องยิง server action (หยุด/เปิดใช้ · สร้างรอบตอนนี้ · ลบ)
            // เรนเดอร์เหมือน DocMoreMenu เป๊ะ: <form action={…}> + hidden fields (ไม่มี JS ก็ยังทำงาน)
            if (it.submit) {
              return (
                <div key={i}>
                  {sep}
                  <form action={it.submit.action}>
                    {Object.entries(it.submit.fields ?? {}).map(([k, v]) => (
                      <input key={k} type="hidden" name={k} value={v} />
                    ))}
                    <button type="submit" role="menuitem" className={cls} onClick={() => setOpen(false)}>
                      {iconNode}
                      {it.label}
                    </button>
                  </form>
                </div>
              );
            }
            if (it.href) {
              return (
                <div key={i}>
                  {sep}
                  <Link href={it.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                    {iconNode}
                    {it.label}
                  </Link>
                </div>
              );
            }
            return (
              <div key={i}>
                {sep}
                <button
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {iconNode}
                  {it.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RowActions;
