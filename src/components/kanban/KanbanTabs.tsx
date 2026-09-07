// KanbanTabs.tsx — แถบเมนู 7 หมวดของระบบบอร์ดงาน (K1.14 · แบบ §5.2)
//
// 🔴 ทะเบียนเดียวกับ drawer ☰ (`src/lib/modules/kanban/nav.ts`) — เมนู 2 ที่ห้ามพิมพ์แยกกัน
// 🔴 หมวดที่ยังไม่มา (P2) โชว์จาง + ป้าย "เร็ว ๆ นี้" และ **กดไม่ได้** — ซ่อนทิ้งแล้วทีมจะไม่รู้ว่า
//    ของกำลังมา (แพตเทิร์นเดียวกับเมนูบัญชี V2 ที่ติดป้ายไว้ 20 กว่ารายการ)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { kanbanNavItems } from "@/lib/modules/kanban/nav";
import type { KanbanActor } from "@/lib/modules/kanban/types";

/**
 * K2.10: `actor` (ถ้าส่งมา) ใช้กรองแท็บ "รายงาน" ออกทั้งชุดสำหรับคนที่ไม่มีคีย์ `kanban.report.view`
 * (OWNER ผ่านเสมอ) — page.tsx แต่ละหน้าที่เรียก `<KanbanTabs>` ส่ง actor ของ session มาให้ (คำนวณสิทธิ์
 * server-side ผ่าน `canViewReports()` ของ access.ts ซึ่งไม่แตะ prisma จึง import ที่นี่ได้ปลอดภัย)
 * ไม่ส่ง actor มา = ไม่กรอง (เผื่อจุดเรียกเดิมที่ยังไม่ผ่านการแก้ในรอบนี้)
 */
export function KanbanTabs({ systemId, actor }: { systemId: string; actor?: KanbanActor }) {
  const pathname = usePathname();
  const overview = `/app/sys/${systemId}`;
  const items = [
    { key: "overview", href: overview, label: "ภาพรวม", status: "ready" as const, wo: undefined },
    ...kanbanNavItems(systemId, actor),
  ];

  return (
    <div data-testid="kanban-tabs" className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
      {items.map((it) => {
        if (it.status !== "ready") {
          return (
            <span
              key={it.key}
              data-testid={`kanban-tab-${it.key}`}
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
            data-testid={`kanban-tab-${it.key}`}
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

export default KanbanTabs;
