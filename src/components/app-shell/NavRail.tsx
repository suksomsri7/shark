"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import type { NavItem } from "./NavDrawer";

// NavRail — "รางไอคอน" 56px แทนแถบเมนูปักซ้าย 288px
//
// B3 (T6 · แบบ §5 ภาพ 03): รางใช้ได้ **ทุกหน้า** แล้ว ไม่ใช่เฉพาะบอร์ดงาน —
//   · โทนเดียวกับแถบเมนูที่ร้านเลือกเสมอ (`--nav-bg` — เลือกสีแบรนด์ = รางสีแบรนด์ ไม่ใช่ดำ)
//   · **ไม่มีตราสัญลักษณ์บนราง** (เจ้าของ 6 ก.ย. รอบ 4 — มันอยู่บนแถบบนแล้ว รางเริ่มที่ไอคอนหน้าหลัก)
//   · คลิกไอคอน = เปิดหน้าระบบนั้นทันที ไม่มี flyout/เมนูย่อย (เจ้าของรอบ 3 — แท็บย่อยอยู่ในหน้าระบบแล้ว)
//   · tooltip = ชื่อระบบ (title/aria) · จุดแดง = มีแจ้งเตือนค้าง
//   · ปุ่มท้ายราง › = ขยายเป็นแถบเต็ม (จำสถานะต่อผู้ใช้ผ่าน preferences.navCollapsed)
//
// 🔴 ตัวราง **ไม่รู้จักโมดูลไหนเลย** — รับ items ชุดเดียวกับ NavDrawer จาก layout (DB-driven)
export function isRailPath(pathname: string): boolean {
  return /^\/app\/sys\/[^/]+\/kanban\/b\//.test(pathname);
}

export function NavRail({
  items,
  navTone,
  badges,
  onExpand,
}: {
  items: NavItem[];
  /** โทนแถบเมนูของร้าน — ใช้ตัดสินเฉพาะ "หน้าตาของรายการที่เลือก" (สีมาจาก CSS var ทั้งหมด) */
  navTone: "LIGHT" | "BRAND" | "DARK";
  /** ตัวเลขยังไม่ได้อ่านต่อรายการ (คีย์ = NavItem.key) — บนรางแสดงเป็น "จุดแดง" ไม่ใช่ตัวเลข (ที่ไม่พอ) */
  badges?: Record<string, number>;
  onExpand: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const cell = (active: boolean) =>
    `nav-row relative grid h-9 w-9 place-items-center rounded-[9px] ${active ? "nav-row-on" : ""}`;

  return (
    <aside
      data-qc="app-rail"
      data-nav-tone={navTone}
      aria-label="เมนูระบบ (รางไอคอน)"
      className="fixed bottom-0 left-0 top-14 z-30 hidden w-14 flex-col items-center gap-1 py-2.5 lg:flex"
      style={{
        background: "var(--nav-bg)",
        color: "var(--nav-fg)",
        // เส้นคั่นเฉพาะโทนสว่าง — โทนสี/เข้มแยกตัวเองจากเนื้อหาได้ด้วยสีอยู่แล้ว (เส้นเทาบนพื้นเข้ม = สกปรก)
        borderRight: navTone === "LIGHT" ? "1px solid var(--color-line)" : "none",
      }}
    >
      <Link href="/app" title="หน้าหลัก" aria-label="หน้าหลัก" className={cell(pathname === "/app")}>
        <NavIcon emoji="🏠" />
      </Link>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          title={it.label}
          aria-label={it.label}
          className={cell(isActive(it.href))}
        >
          <NavIcon emoji={it.icon} />
          {(badges?.[it.key] ?? 0) > 0 && (
            <span
              aria-label={`${badges?.[it.key]} รายการยังไม่ได้อ่าน`}
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500"
            />
          )}
        </Link>
      ))}
      <span className="flex-1" />
      <button
        type="button"
        data-testid="nav-expand"
        title="ขยายแถบเมนู"
        aria-label="ขยายแถบเมนู"
        onClick={onExpand}
        className="nav-row grid h-9 w-9 place-items-center rounded-[9px]"
        style={{ color: "var(--nav-fg2)" }}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9.5 5 7 7-7 7" />
        </svg>
      </button>
    </aside>
  );
}

export default NavRail;
