"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavPerms, visibleTabs } from "./nav-perms";

// แท็บฟังก์ชันย่อยในหน้าโมดูล (ต้นแบบแตกหน้า) — สลับไปมาโดยไม่ต้องเปิดเมนูแฮมเบอร์เกอร์
// active = path ตรงตัว (หน้า hub ใช้ exact เพื่อไม่ค้างสว่างตอนอยู่หน้าย่อย)
// POS P1.17 U ▸ data-testid (ไม่บังคับ) ส่งต่อไปที่กรอบแท็บ — ทะเบียนปุ่ม POS (F15.3) ต้องการ testid ของแท็บในหน้าใหม่ ◂
// CRM C5.5-fix2 ▸ รีวิว RV2-7: แท็บที่มี `perm` ขึ้นเมื่อผู้ใช้ถือคีย์นั้น (รายการคีย์มาจาก layout ของโมดูลทาง `NavPermsProvider`) ◂
// HR VIS-5b ▸ `wrap` (ไม่บังคับ · เปิดเฉพาะ HR): จอ ≥ md ขึ้นบรรทัดใหม่แทนการตัดแท็บท้าย · จอเล็กยังเลื่อนแถวเดียว (ประกาศ data-scroll="x") ·
//   ไม่ส่ง wrap = markup เดิมทุกไบต์ (โมดูลอื่น) · รายการว่าง = ไม่วาดแถบ (ผู้ดูที่ไม่มีแท็บ เช่น บัญชีจอลงเวลา) ◂
// HR VIS-5c ▸ `activeHref` (ไม่บังคับ · เปิดเฉพาะหน้าโปรไฟล์พนักงาน HR): แท็บที่ href ตรงค่านี้สว่างด้วย แม้ path ไม่ตรงตัว · ไม่ส่ง = เหมือนเดิมทุกไบต์ ◂
export function ModuleTabs({ items, "data-testid": testId, wrap, activeHref }: { items: { href: string; label: string; perm?: string }[]; "data-testid"?: string; wrap?: boolean; activeHref?: string /* HR VIS-5c ◂ */ }) {
  const pathname = usePathname();
  const perms = useNavPerms();
  if (!items.length) return null; // HR VIS-5b ◂
  return (
    <div className={wrap ? "-mx-1 flex gap-1 overflow-x-auto border-b pb-px md:flex-wrap md:overflow-visible" : "-mx-1 flex gap-1 overflow-x-auto border-b pb-px"} data-scroll={wrap ? "x" : undefined} data-testid={testId} /* HR VIS-5b ◂ */>
      {visibleTabs(items, perms).map((it) => {
        const active = pathname === it.href || (!!activeHref && it.href === activeHref); // HR VIS-5c ◂
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
