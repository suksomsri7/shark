"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavPerms, visibleTabs } from "./nav-perms";

// แท็บฟังก์ชันย่อยในหน้าโมดูล (ต้นแบบแตกหน้า) — สลับไปมาโดยไม่ต้องเปิดเมนูแฮมเบอร์เกอร์
// active = path ตรงตัว (หน้า hub ใช้ exact เพื่อไม่ค้างสว่างตอนอยู่หน้าย่อย)
// POS P1.17 U ▸ data-testid (ไม่บังคับ) ส่งต่อไปที่กรอบแท็บ — ทะเบียนปุ่ม POS (F15.3) ต้องการ testid ของแท็บในหน้าใหม่ ◂
// CRM C5.5-fix2 ▸ รีวิว RV2-7: แท็บที่มี `perm` ขึ้นเมื่อผู้ใช้ถือคีย์นั้น (รายการคีย์มาจาก layout ของโมดูลทาง `NavPermsProvider`) ◂
export function ModuleTabs({ items, "data-testid": testId }: { items: { href: string; label: string; perm?: string }[]; "data-testid"?: string }) {
  const pathname = usePathname();
  const perms = useNavPerms();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" data-testid={testId}>
      {visibleTabs(items, perms).map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "border-b-2 border-[color:var(--color-accent)] font-medium text-[color:var(--color-accent)]"
                : "text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

export default ModuleTabs;
