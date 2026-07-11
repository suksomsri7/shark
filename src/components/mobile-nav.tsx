"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";

export type NavItem = { key: string; href: string; icon: string; label: string };

export function MobileNav({
  tenantName,
  userEmail,
  items,
}: {
  tenantName: string;
  userEmail: string;
  items: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* แถบบนมือถือ */}
      <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เมนู"
          className="rounded-lg border px-2.5 py-1.5 text-lg leading-none"
        >
          ☰
        </button>
        <span className="text-sm font-bold tracking-widest">SHARK</span>
        <span className="ml-auto truncate text-xs text-[color:var(--color-muted)]">{tenantName}</span>
      </div>

      {/* drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={close} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col overflow-y-auto border-r bg-[color:var(--color-surface)] px-3 py-4">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <div className="text-sm font-bold tracking-widest">SHARK</div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">{tenantName}</div>
              </div>
              <button type="button" onClick={close} aria-label="ปิด" className="text-xl leading-none">
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 text-sm">
              <Link href="/app" onClick={close} className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
                ระบบทั้งหมด
              </Link>
              {items.map((it) => (
                <Link
                  key={it.key}
                  href={it.href}
                  onClick={close}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
                >
                  <span>{it.icon}</span>
                  <span className="truncate">{it.label}</span>
                </Link>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-2 border-t pt-3">
              <Link href="/app/settings/systems" onClick={close} className="btn btn-primary w-full text-sm">
                + เพิ่มระบบ
              </Link>
              <div className="flex items-center justify-between px-2">
                <span className="truncate text-xs text-[color:var(--color-muted)]">{userEmail}</span>
                <form action={logoutAction}>
                  <button type="submit" className="text-xs underline">
                    ออก
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
