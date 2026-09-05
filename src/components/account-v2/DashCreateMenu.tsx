"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import type { CreateDocMenu } from "@/lib/modules/account/dashboard-home";
import { openQuickCreate } from "./QuickCreate";

// ปุ่มดำ "+ สร้างเอกสาร ▾" บนหัวหน้าหลัก (§4 ข้อ 1) เปิด dropdown 2 คอลัมน์ (รายรับ | รายจ่าย) ตาม f2
// เดสก์ท็อป = แผงลอยใต้ปุ่ม · มือถือ (<lg) = แผงเต็มความกว้างใต้ปุ่ม (แทนที่ bottom sheet เต็มจอ — เรียบง่ายกว่า
// แต่ยังกดใช้งานได้ครบ เพราะปุ่มเองก็ full-width บนมือถืออยู่แล้วตาม f11)
//
// 🔴 AccountContent เรนเดอร์คอมโพเนนต์นี้ 2 ชุด (เดสก์ท็อป + มือถือ) ซ่อนกันด้วย CSS (`hidden`/`lg:hidden`)
// เพราะตำแหน่งในหน้าต่างกันจริง (มุมขวาบน vs เต็มความกว้างใต้ h1) ไม่ใช่แค่สไตล์ — ต่างจาก AccountTabBar ที่ตัดสิน
// จาก matchMedia แล้ว render ทางเดียว ⇒ ทั้ง 2 ชุดยังอยู่ใน DOM พร้อมกันเสมอ (คนละ testid กันชนกัน — ตัว visual QC
// (`scripts/visual-acc-v2.mts`) หา element ด้วย querySelector ตัวแรกที่เจอ **ไม่ดู CSS visibility** เหมือนที่ WO 1.6
// ใช้ `ref-row-`/`ref-card-` แยกกัน — ถ้าใช้ testid เดียวกันทั้งคู่ คลิกที่มือถือจะไปโดนปุ่มเดสก์ท็อปที่ซ่อนอยู่แทน)
export function DashCreateMenu({
  menu,
  fullWidth,
  testId = "btn-create-doc",
  menuTestId = "create-doc-menu",
}: {
  menu: CreateDocMenu;
  fullWidth?: boolean;
  testId?: string;
  menuTestId?: string;
}) {
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
    <div ref={rootRef} className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        type="button"
        className={`btn btn-primary text-sm ${fullWidth ? "w-full" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        // WO 9.1/2.2 (f2): ปุ่มนี้ (เดสก์ท็อป + มือถือ) เปิด dropdown/แผงเดิมเสมอ ค้างอยู่จนกว่าจะเลือก/ปิดเอง
        // ทางเข้า "สร้างด่วน" (⌘K) เป็นทางเข้า**รอง** แยกต่างหาก — ลิงก์ท้าย dropdown ด้านล่าง (ทุกจอ) หรือกด ⌘K/Ctrl+K
        onClick={() => setOpen((v) => !v)}
      >
        + สร้างเอกสาร <span aria-hidden>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          data-testid={menuTestId}
          className="absolute right-0 top-full z-30 mt-1.5 grid w-[min(560px,90vw)] grid-cols-1 gap-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 shadow-[0_14px_34px_rgba(10,10,10,0.12)] sm:grid-cols-2"
        >
          <CreateCol title="รายรับ" items={menu.revenue} onPick={() => setOpen(false)} />
          <CreateCol title="รายจ่าย" items={menu.expense} onPick={() => setOpen(false)} />
          {/* WO 9.4 — ทางเข้ารองสู่แผง "สร้างด่วน" (⌘K): พิมพ์ชนิด+ผู้ติดต่อ+จำนวนเงินรวดเดียวแทนไล่เมนู */}
          <button
            type="button"
            className="col-span-full mt-1 flex items-center gap-2 rounded-lg border-t px-2 pt-2 text-left text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            style={{ borderColor: "var(--color-line)" }}
            data-testid="create-doc-menu-quickcreate-link"
            onClick={() => {
              setOpen(false);
              openQuickCreate();
            }}
          >
            <AccountIcon name="spark" className="h-3.5 w-3.5" /> หรือพิมพ์คำสั่งสร้างด่วน (⌘K) — เช่น &quot;ใบแจ้งหนี้ ณัฐพล 24900&quot;
          </button>
        </div>
      )}
    </div>
  );
}

function CreateCol({
  title,
  items,
  onPick,
}: {
  title: string;
  items: CreateDocMenu["revenue"];
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 py-1 text-xs font-medium text-[color:var(--color-muted)]">{title}</div>
      {items.map((it) => (
        <Link
          key={it.testId}
          href={it.href}
          role="menuitem"
          data-testid={`create-doc-item-${it.testId}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]"
          onClick={onPick}
        >
          <AccountIcon name={it.icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export default DashCreateMenu;
