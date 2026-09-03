"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { findActiveNav, type AccountNavGroup } from "@/lib/modules/account/nav";

// breadcrumb ใต้แถบเมนูบัญชี — "บัญชี › รายรับ › ใบแจ้งหนี้" (SPEC §1) — ลิงก์ทุกระดับยกเว้นตัวสุดท้าย
export function AccountBreadcrumb({ groups, base }: { groups: AccountNavGroup[]; base: string }) {
  const pathname = usePathname();
  const active = findActiveNav(pathname, base, groups);

  const crumbs: { label: string; href?: string }[] = [{ label: "บัญชี", href: base }];
  if (!active || active.group.key === "home") {
    crumbs.push({ label: "หน้าหลัก" });
  } else {
    crumbs.push({ label: active.group.label, href: active.group.href });
    if (active.item) crumbs.push({ label: active.item.label });
  }

  return (
    <nav data-testid="acc-breadcrumb" aria-label="breadcrumb" className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>›</span>}
          {c.href && i < crumbs.length - 1 ? (
            <Link href={c.href} className="hover:text-[color:var(--color-ink)] hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className={i === crumbs.length - 1 ? "text-[color:var(--color-ink-soft)]" : ""}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default AccountBreadcrumb;
