"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { findActiveNav, type AccountNavGroup } from "@/lib/modules/account/nav";
import { useBreadcrumbTail } from "./breadcrumb-tail";

// breadcrumb ใต้แถบเมนูบัญชี — "บัญชี › รายรับ › ใบแจ้งหนี้" (SPEC §1) — ลิงก์ทุกระดับยกเว้นตัวสุดท้าย
export function AccountBreadcrumb({ groups, base }: { groups: AccountNavGroup[]; base: string }) {
  const pathname = usePathname();
  const active = findActiveNav(pathname, base, groups);
  // WO 3.4: หน้ารายละเอียดเติมชื่อของแถวที่เปิดอยู่ต่อท้าย (g6: "บัญชี › ผู้ติดต่อ › ปิยธิดา อินสุ่ม")
  const tail = useBreadcrumbTail();

  const crumbs: { label: string; href?: string }[] = [{ label: "บัญชี", href: base }];
  if (!active || active.group.key === "home") {
    crumbs.push({ label: "หน้าหลัก" });
  } else {
    crumbs.push({ label: active.group.label, href: active.group.href });
    // WO 3.4: ชื่อหมวดกับชื่อเมนูซ้ำกัน (เช่น "ผู้ติดต่อ › ผู้ติดต่อ") = ไม่ต้องซ้ำ — f5/g6 วาดไว้ระดับเดียว
    if (active.item && active.item.label !== active.group.label)
      crumbs.push({ label: active.item.label, href: active.item.href });
  }
  if (tail) crumbs.push({ label: tail });

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
