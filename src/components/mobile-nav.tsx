"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";

type Unit = { id: string; name: string; slug: string; type: string; status: string };
type ModuleItem = { key: string; label: string; href: string; status: string };

const TYPE_ICON: Record<string, string> = {
  HOTEL: "🏨",
  RESTAURANT: "🍜",
  BOOKING: "📅",
  QUEUE: "🎫",
  TICKET: "🎟️",
  SHOP: "🛍️",
};

export function MobileNav({
  tenantName,
  userEmail,
  units,
  modules,
}: {
  tenantName: string;
  userEmail: string;
  units: Unit[];
  modules: ModuleItem[];
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
        <span className="ml-auto truncate text-xs text-[color:var(--color-muted)]">
          {tenantName}
        </span>
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

            {/* กิจการ */}
            <nav className="flex flex-col gap-0.5 text-sm">
              <Link href="/app" onClick={close} className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
                ภาพรวม
              </Link>
              {units.map((u) => (
                <Link
                  key={u.id}
                  href={`/app/u/${u.slug}`}
                  onClick={close}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
                >
                  <span>{TYPE_ICON[u.type] ?? "•"}</span>
                  <span className="truncate">{u.name}</span>
                </Link>
              ))}
            </nav>

            <div className="my-3 border-t" />

            {/* โมดูลองค์กร */}
            <nav className="flex flex-col gap-0.5 text-sm">
              {modules.map((m) =>
                m.status === "available" ? (
                  <Link key={m.key} href={m.href} onClick={close} className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
                    {m.label}
                  </Link>
                ) : (
                  <div key={m.key} className="flex items-center justify-between rounded-lg px-2 py-2 opacity-45">
                    <span>{m.label}</span>
                    <span className="rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
                  </div>
                ),
              )}
            </nav>

            <div className="mt-auto flex flex-col gap-2 border-t pt-3">
              <Link href="/app/settings/units/new" onClick={close} className="btn btn-ghost w-full text-sm">
                + เพิ่มกิจการ
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
