"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type SubNavGroup = { title: string; items: { href: string; label: string; badge?: string }[] };

// เมนูรองของโมดูลใหญ่ (account) — desktop sidebar / mobile accordion
export function SubNav({ groups }: { groups: SubNavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    <nav className="flex flex-col gap-3">
      {groups.map((g) => (
        <Group key={g.title} group={g} isActive={isActive} />
      ))}
    </nav>
  );
}

function Group({ group, isActive }: { group: SubNavGroup; isActive: (h: string) => boolean }) {
  const hasActive = group.items.some((i) => isActive(i.href));
  const [open, setOpen] = useState(hasActive);
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-2 py-1 text-xs font-medium text-[color:var(--color-muted)]"
      >
        {group.title}
        <span className="md:hidden">{open ? "▾" : "▸"}</span>
      </button>
      <div className={`${open ? "flex" : "hidden"} flex-col gap-0.5 md:flex`}>
        {group.items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]"
            style={isActive(it.href) ? { background: "var(--color-surface-2)", fontWeight: 500 } : undefined}
          >
            {it.label}
            {it.badge && <span className="text-xs text-[color:var(--color-muted)]">{it.badge}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default SubNav;
