"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";

// drawer เมนูระบบ — เลื่อนออกจากซ้าย เปิดจากปุ่มแฮมเบอร์เกอร์บน topbar
// รวม "ระบบทั้งหมด" (grid เดิมที่ย้ายมาจากหน้า /app) + ระบบที่กำลังจะมา + เพิ่มระบบ + ออกจากระบบ
// nav item data ยังมาจาก layout (DB-driven) เหมือนเดิม — เปลี่ยนแค่การนำเสนอ

export type NavItem = { key: string; href: string; icon: string; label: string };
export type SoonItem = { code: string; icon: string; label: string };

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
  // ลิงก์ active = จุดเน้นด้วย --color-accent (ปุ่ม primary ยังเป็น ink)
  const isActive = (href: string) =>
    pathname === href || (href !== "/app" && pathname.startsWith(href + "/")) || pathname.startsWith(href);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* ฉากหลังคลุมจอ แตะเพื่อปิด */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-[2px_0_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-widest text-[color:var(--color-muted)]">SHARK</div>
            <div className="truncate text-sm font-semibold">{tenantName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <Link
            href="/app"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
              pathname === "/app" ? "font-medium text-[color:var(--color-accent)]" : ""
            }`}
          >
            <span aria-hidden>🏠</span>
            <span className="truncate">หน้าหลัก</span>
          </Link>

          {items.length > 0 && (
            <div className="px-2 pb-1 pt-3 text-xs text-[color:var(--color-muted)]">ระบบทั้งหมด</div>
          )}
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              onClick={onClose}
              className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
                isActive(it.href) ? "font-medium text-[color:var(--color-accent)]" : ""
              }`}
            >
              <span aria-hidden>{it.icon}</span>
              <span className="truncate">{it.label}</span>
            </Link>
          ))}

          <div className="my-2 border-t" />
          <div className="px-2 pb-1 text-xs text-[color:var(--color-muted)]">ตั้งค่า</div>
          {[
            { href: "/app/notifications", icon: "🔔", label: "ศูนย์แจ้งเตือน" },
            { href: "/app/approvals", icon: "✅", label: "รออนุมัติของฉัน" },
            { href: "/app/settings/approval", icon: "🧾", label: "สายอนุมัติ" },
            { href: "/app/settings/automation", icon: "⚙️", label: "ระบบอัตโนมัติ" },
            { href: "/app/settings/payment", icon: "💳", label: "ช่องรับเงิน" },
            { href: "/app/settings/domain", icon: "🌐", label: "โดเมนของร้าน" },
            { href: "/app/settings/billing", icon: "🧾", label: "บิลจากแพลตฟอร์ม" },
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
              <span aria-hidden>{s.icon}</span>
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
                  <span className="truncate">
                    <span aria-hidden>{s.icon}</span> {s.label}
                  </span>
                  <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-4 pb-4 pt-3">
          <div className="border-t pt-3">
            <Link href={addHref} onClick={onClose} className="btn btn-primary w-full text-sm">
              + เพิ่มระบบ
            </Link>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="truncate text-xs text-[color:var(--color-muted)]">{userEmail}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-xs underline">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </aside>
    </div>
  );
}
