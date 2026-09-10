// MemberTabs.tsx — แถบเมนู 9 หมวดของระบบสมาชิก v2 (M1.3 · แบบ KanbanTabs.tsx)
//
// 🔴 ทะเบียนเดียวกับ drawer ☰ (`src/lib/modules/member/nav.ts`) — เมนู 2 ที่ห้ามพิมพ์แยกกัน
// 🔴 หมวดที่ยังไม่มา (M1.5 เป็นต้นไป) โชว์จาง + ป้าย "เร็ว ๆ นี้" และกดไม่ได้
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memberNavItems } from "@/lib/modules/member/nav";
import type { MemberActor } from "@/lib/modules/member/access";

/** `actor` (ถ้าส่งมา) ใช้กรองแท็บ "ตั้งค่า" ออกสำหรับคนที่ไม่มี `member.settings.manage` — ไม่ส่ง = ไม่กรอง */
export function MemberTabs({ systemId, actor }: { systemId: string; actor?: MemberActor }) {
  const pathname = usePathname();
  const hub = `/app/sys/${systemId}`;
  const items = [
    { key: "home", href: hub, label: "หน้าหลัก", status: "ready" as const, wo: undefined },
    ...memberNavItems(systemId, actor),
  ];

  return (
    <div data-testid="member-tabs" className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
      {items.map((it) => {
        if (it.status !== "ready") {
          return (
            <span
              key={it.key}
              data-testid={`member-tab-${it.key}`}
              aria-disabled="true"
              title={`เร็ว ๆ นี้${it.wo ? ` (${it.wo})` : ""}`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2 text-sm"
              style={{ color: "var(--color-muted)", opacity: 0.6, cursor: "default" }}
            >
              {it.label}
              <span
                style={{
                  fontSize: 10,
                  lineHeight: "14px",
                  padding: "1px 5px",
                  borderRadius: 999,
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                }}
              >
                เร็ว ๆ นี้
              </span>
            </span>
          );
        }
        const active = pathname === it.href;
        return (
          <Link
            key={it.key}
            data-testid={`member-tab-${it.key}`}
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

export default MemberTabs;
