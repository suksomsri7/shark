"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import { NavIcon } from "./NavIcon";

// drawer เมนูระบบ — เลื่อนออกจากซ้าย เปิดจากปุ่มแฮมเบอร์เกอร์บน topbar
// รวม "ระบบทั้งหมด" (grid เดิมที่ย้ายมาจากหน้า /app) + ระบบที่กำลังจะมา + เพิ่มระบบ + ออกจากระบบ
// nav item data ยังมาจาก layout (DB-driven) เหมือนเดิม — เปลี่ยนแค่การนำเสนอ

export type NavChild = { href: string; label: string };
export type NavItem = { key: string; href: string; icon: string; label: string; children?: NavChild[] };
export type SoonItem = { code: string; icon: string; label: string };

// ระบบที่แตกฟังก์ชันย่อย — หัวข้อกดพับ/กาง (accordion) + ลิงก์ฟังก์ชันย่อยใต้ระบบ
// auto-กาง เมื่ออยู่ในฟังก์ชันย่อยของระบบนั้น · ฟังก์ชัน active = เทียบ path ตรงตัว
function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const children = item.children ?? [];
  const anyActive = children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
  const [open, setOpen] = useState(anyActive);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
          anyActive ? "font-medium" : ""
        }`}
      >
        <NavIcon emoji={item.icon} />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="ml-3.5 flex flex-col gap-0.5 border-l pl-2">
          {children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={onNavigate}
              className={`rounded-lg px-2 py-2 text-sm hover:bg-[color:var(--color-surface-2)] ${
                pathname === c.href ? "font-medium text-[color:var(--color-accent)]" : ""
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavDrawer({
  open,
  onClose,
  tenantName,
  userEmail,
  items,
  soon,
  addHref,
}: {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  addHref: string;
}) {
  const pathname = usePathname();
  // เปิดจากแอปมือถือ (WebView UA "SharkApp") → ซ่อนแถวอีเมล+ปุ่มออกจากระบบของเว็บ
  // (แอปมี logout native ของตัวเอง · กันบั๊ก session เว็บตายแต่แอปยัง login → หน้า error ค้าง)
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkApp")) setInApp(true);
  }, []);
  // ลิงก์ active = จุดเน้นด้วย --color-accent (ปุ่ม primary ยังเป็น ink)
  const isActive = (href: string) =>
    pathname === href || (href !== "/app" && pathname.startsWith(href + "/")) || pathname.startsWith(href);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* ฉากหลังคลุมจอ แตะเพื่อปิด */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-[2px_0_12px_rgba(0,0,0,0.08)]">
        {/* หัว drawer — ชื่อกิจการ · เอาปุ่ม ✕ ออกตามคำสั่งเจ้าของ (ปิดด้วยแตะฉากหลัง) */}
        <div className="flex items-center px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{tenantName}</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <Link
            href="/app"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
              pathname === "/app" ? "font-medium text-[color:var(--color-accent)]" : ""
            }`}
          >
            <NavIcon emoji="🏠" />
            <span className="truncate">หน้าหลัก</span>
          </Link>

          <Link
            href="/app/calendar"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
              isActive("/app/calendar") ? "font-medium text-[color:var(--color-accent)]" : ""
            }`}
          >
            <NavIcon emoji="📅" />
            <span className="truncate">ปฏิทิน</span>
          </Link>

          {items.length > 0 && (
            <div className="px-2 pb-1 pt-3 text-xs text-[color:var(--color-muted)]">ระบบทั้งหมด</div>
          )}
          {items.map((it) =>
            it.children && it.children.length > 0 ? (
              <NavGroup key={it.key} item={it} onNavigate={onClose} />
            ) : (
              <Link
                key={it.key}
                href={it.href}
                onClick={onClose}
                className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
                  isActive(it.href) ? "font-medium text-[color:var(--color-accent)]" : ""
                }`}
              >
                <NavIcon emoji={it.icon} />
                <span className="truncate">{it.label}</span>
              </Link>
            ),
          )}

          <div className="my-2 border-t" />
          <div className="px-2 pb-1 text-xs text-[color:var(--color-muted)]">ตั้งค่า</div>
          {[
            { href: "/app/marketplace", icon: "🧩", label: "ตลาดเทมเพลต" },
            { href: "/app/reports", icon: "📊", label: "รายงาน" },
            { href: "/app/forms", icon: "📝", label: "ฟอร์ม" },
            { href: "/app/notifications", icon: "🔔", label: "ศูนย์แจ้งเตือน" },
            { href: "/app/approvals", icon: "✅", label: "รออนุมัติของฉัน" },
            { href: "/app/settings/approval", icon: "🧾", label: "สายอนุมัติ" },
            { href: "/app/settings/automation", icon: "⚙️", label: "ระบบอัตโนมัติ" },
            { href: "/app/settings/payment", icon: "💳", label: "ช่องรับเงิน" },
            { href: "/app/settings/domain", icon: "🌐", label: "โดเมนของร้าน" },
            { href: "/app/settings/api", icon: "🔑", label: "API สำหรับนักพัฒนา" },
            { href: "/app/settings/billing", icon: "🧾", label: "บิลจากแพลตฟอร์ม" },
            { href: "/app/audit", icon: "🕓", label: "ประวัติการแก้ไข" },
            { href: "/app/settings/privacy", icon: "🔒", label: "ความเป็นส่วนตัว (PDPA)" },
          ].map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={onClose}
              className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
                isActive(s.href) ? "font-medium text-[color:var(--color-accent)]" : ""
              }`}
            >
              <NavIcon emoji={s.icon} />
              <span className="truncate">{s.label}</span>
            </Link>
          ))}

          {soon.length > 0 && (
            <>
              <div className="my-2 border-t" />
              <div className="px-2 pb-1 text-xs text-[color:var(--color-muted)]">กำลังจะมา</div>
              {soon.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs opacity-45"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <NavIcon emoji={s.icon} className="h-4 w-4" /> {s.label}
                  </span>
                  <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-4 pb-4 pt-3">
          <div className="border-t pt-3">
            <Link
              href={addHref}
              onClick={onClose}
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              + เพิ่มระบบ
            </Link>
          </div>
          {/* ซ่อนอีเมล+ออกจากระบบเมื่อเปิดจากแอป — แอปมี logout native เอง (กัน session เว็บตายแต่แอปยัง login) */}
          {!inApp && (
            <div className="flex items-center justify-between px-1">
              <span className="truncate text-xs text-[color:var(--color-muted)]">{userEmail}</span>
              <form action={logoutAction}>
                <button type="submit" className="text-xs underline">
                  ออกจากระบบ
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
