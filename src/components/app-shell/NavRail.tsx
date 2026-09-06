"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import type { NavItem } from "./NavDrawer";

// NavRail — "รางไอคอน" 56px แทนแถบเมนูปักซ้าย 288px เฉพาะหน้าที่ต้องการพื้นที่จอเต็ม
// วันนี้ใช้ที่เดียว: หน้าบอร์ดงาน `/app/sys/{id}/kanban/b/{boardId}` (แบบ `ledger/design-kanban/02-board.png`
// + พิมพ์เขียว §3.2 "เมนูซ้ายเป็นรางไอคอน 56px") — 5 คอลัมน์ 240px ไม่พอถ้ายังกางเมนู 288px ไว้
//
// 🔴 ตัวราง **ไม่รู้จักโมดูลไหนเลย** — รับ items ชุดเดียวกับ NavDrawer จาก layout (DB-driven)
//    ⇒ เพิ่มหน้าที่อยากใช้รางในอนาคตแค่เพิ่มเงื่อนไข path ที่ AppShell ไม่ต้องแก้ไฟล์นี้
// 🔴 ปุ่มล่างสุด "กางเมนู" ยิง CustomEvent `app:drawer-open` ที่ AppShell ฟังอยู่แล้ว (ไม่ผูก state ข้ามชั้น)
export function isRailPath(pathname: string): boolean {
  return /^\/app\/sys\/[^/]+\/kanban\/b\//.test(pathname);
}

export function NavRail({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      data-qc="app-rail"
      aria-label="เมนูระบบ (รางไอคอน)"
      className="fixed bottom-0 left-0 top-14 z-30 hidden w-14 flex-col items-center gap-1 border-r border-[color:var(--color-border)] py-2.5 lg:flex"
      style={{ background: "var(--color-surface-2)" }}
    >
      <Link
        href="/app"
        title="หน้าหลัก"
        aria-label="หน้าหลัก"
        className={`grid h-9 w-9 place-items-center rounded-[9px] ${
          pathname === "/app"
            ? "border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"
            : "text-[color:var(--color-muted)]"
        }`}
      >
        <NavIcon emoji="🏠" />
      </Link>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          title={it.label}
          aria-label={it.label}
          className={`grid h-9 w-9 place-items-center rounded-[9px] ${
            isActive(it.href)
              ? "border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"
              : "text-[color:var(--color-muted)]"
          }`}
        >
          <NavIcon emoji={it.icon} />
        </Link>
      ))}
      <span className="flex-1" />
      <button
        type="button"
        title="กางเมนูเต็ม"
        aria-label="กางเมนูเต็ม"
        onClick={() => window.dispatchEvent(new CustomEvent("app:drawer-open"))}
        className="grid h-9 w-9 place-items-center rounded-[9px] text-[color:var(--color-muted)]"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9.5 5 7 7-7 7" />
        </svg>
      </button>
    </aside>
  );
}

export default NavRail;
