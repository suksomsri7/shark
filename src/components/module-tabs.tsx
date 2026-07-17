"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// แท็บฟังก์ชันย่อยในหน้าโมดูล (ต้นแบบแตกหน้า) — สลับไปมาโดยไม่ต้องเปิดเมนูแฮมเบอร์เกอร์
// active = path ตรงตัว (หน้า hub ใช้ exact เพื่อไม่ค้างสว่างตอนอยู่หน้าย่อย)
export function ModuleTabs({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
      {items.map((it) => {
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
