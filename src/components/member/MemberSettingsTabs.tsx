// MemberSettingsTabs.tsx — แถบแท็บย่อยของหมวด "ตั้งค่า" ในระบบสมาชิก (M1.7 · แบบ MemberTabs.tsx)
//
// 🔴 ทะเบียนเดียวกับ drawer ☰ (`src/lib/modules/member/nav.ts#MEMBER_SETTINGS_NAV`)
// 🔴 หน้าที่ยังไม่มาตามแผน RUN โชว์จาง + ป้าย "เร็ว ๆ นี้" และกดไม่ได้ (เหมือนแท็บหลัก)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memberSettingsNavItems } from "@/lib/modules/member/nav";
import type { MemberActor } from "@/lib/modules/member/access";

export function MemberSettingsTabs({ systemId, actor }: { systemId: string; actor?: MemberActor }) {
  const pathname = usePathname();
  const items = memberSettingsNavItems(systemId, actor);

  return (
    <div data-testid="member-settings-tabs" className="-mx-1 flex gap-1 overflow-x-auto">
      {items.map((it) => {
        if (it.status !== "ready") {
          return (
            <span
              key={it.key}
              data-testid={`member-settings-tab-${it.key}`}
              aria-disabled="true"
              title={`เร็ว ๆ นี้${it.wo ? ` (${it.wo})` : ""}`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm"
              style={{ color: "var(--color-muted)", opacity: 0.6, cursor: "default", border: "1px solid var(--color-line)" }}
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
            data-testid={`member-settings-tab-${it.key}`}
            href={it.href}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors"
            style={
              active
                ? { color: "var(--color-accent)", fontWeight: 600, background: "var(--color-surface-2)", border: "1px solid var(--color-accent)" }
                : { color: "var(--color-muted)", border: "1px solid var(--color-line)" }
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

export default MemberSettingsTabs;
