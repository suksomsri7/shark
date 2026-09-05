"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { AccountIcon } from "./AccountIcon";
import { PortalMenu } from "./PortalMenu";

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

/** WO 7.1 round 2 — รายการทำลาย/ยกเลิกที่ต้องมี ConfirmDialog เป็นตัวสุดท้ายในเมนู (เหมือน DocMoreMenu) */
export type RowActionsDangerItem = {
  triggerLabel: string;
  title: string;
  detail?: string;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  reasonField?: { name: string; label: string; required?: boolean };
  icon?: string;
};

// เมนู "ทำรายการ ▾" ต่อแถว (DESIGN-SPEC-V2 §1/§3)
// เดสก์ท็อป (f3): ปุ่มรอง "ทำรายการ ▾" · มือถือ (f13): ปุ่มกลม "⋯" 44px มุมขวาการ์ด (ไม่ใช่ปุ่มยาว)
// ปุ่มทั้งสองใช้ state เดียวกัน (สลับด้วย CSS breakpoint ไม่ใช่ instance คนละตัว) — เมนู dropdown ใช้ร่วมกัน
// WO 7.1 round 2 — เมนูเรนเดอร์ผ่าน PortalMenu (ไป document.body) กัน overflow ของการ์ดตารางตัดเมนูของแถวท้าย ๆ
export function RowActions({
  items,
  testId,
  label = "ทำรายการ",
  defaultOpen = false,
  trigger = "label",
  danger,
}: {
  items: RowActionItem[];
  testId?: string;
  label?: string;
  /** เปิดเมนูไว้ตั้งแต่แรก — ใช้เฉพาะหน้า gallery สำหรับถ่ายภาพ QC */
  defaultOpen?: boolean;
  /** WO 5.1 — "icon": ปุ่ม "⋯" เปล่า (ไม่มีกรอบ) ทั้งเดสก์ท็อป/มือถือ ตาม g9-finance-channels.png
   * (การ์ดช่องทางการเงิน) — ค่าเริ่มต้น "label" = ปุ่ม "ทำรายการ ▾" เดสก์ท็อป + วงกลม "⋯" มือถือ (ของเดิม ไม่กระทบหน้าอื่น) */
  trigger?: "label" | "icon";
  /** WO 7.1 round 2 — รายการทำลาย/ยกเลิก (ConfirmDialog) ท้ายเมนูเสมอ — ไม่ส่ง = ไม่มี */
  danger?: RowActionsDangerItem;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const anchorRef = useRef<HTMLDivElement>(null);

  if (items.length === 0 && !danger) return null;

  const itemCls = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]";

  return (
    <div className="relative inline-block text-left" ref={anchorRef} data-testid={testId}>
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
      <PortalMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} testId={testId ? `${testId}-menu` : undefined}>
        {items.map((it, i) => {
          const cls = `${itemCls} ${it.danger ? "text-[color:var(--color-danger)]" : ""}`;
          // WO 3.2 รอบแก้ 2 — เส้นคั่นจัดกลุ่มย่อย (f5-contacts-menu.png: 4 สร้าง | ดูประวัติ/แก้ไข/เพิ่มเข้ากลุ่ม | ปิดใช้งาน)
          const sep = it.sepBefore && <div role="separator" className="my-1 border-t" style={{ borderColor: "var(--color-line)" }} />;
          const iconNode = it.icon && <AccountIcon name={it.icon} className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />;
          // WO 1.9 — รายการที่กดไม่ได้: บรรทัดจาง + เหตุผลไทย (ห้ามซ่อนทิ้งเงียบ ๆ)
          if (it.disabled) {
            return (
              <div key={i}>
                {sep}
                <div className={`${itemCls} cursor-not-allowed opacity-60`} title={it.hint} role="menuitem" data-testid={testId ? `${testId}-item-${i}` : undefined}>
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
          if (it.submit) {
            return (
              <div key={i}>
                {sep}
                <form action={it.submit.action}>
                  {Object.entries(it.submit.fields ?? {}).map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={v} />
                  ))}
                  <button type="submit" role="menuitem" className={cls} onClick={() => setOpen(false)} data-testid={testId ? `${testId}-item-${i}` : undefined}>
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
                <Link href={it.href} role="menuitem" className={cls} onClick={() => setOpen(false)} data-testid={testId ? `${testId}-item-${i}` : undefined}>
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
                data-testid={testId ? `${testId}-item-${i}` : undefined}
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
        {danger && (
          <div className="mt-1 border-t pt-1" role="menuitem">
            <ConfirmDialog
              action={danger.action}
              fields={danger.fields}
              reasonField={danger.reasonField}
              triggerLabel={
                <span className="flex items-center gap-2">
                  {danger.icon && <AccountIcon name={danger.icon} className="h-4 w-4 shrink-0" />}
                  {danger.triggerLabel}
                </span>
              }
              triggerClassName={`${itemCls} text-[color:var(--color-danger)]`}
              title={danger.title}
              detail={danger.detail}
              confirmLabel={danger.confirmLabel}
              danger
            />
          </div>
        )}
      </PortalMenu>
    </div>
  );
}

export default RowActions;
