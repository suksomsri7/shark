"use client";
// SVC D.13 ▸ แท็บโมดูลหอ (ภาพ หอ 01/17 แถบบน) — รายการแท็บมาจาก dormTabsFor ฝั่งเซิร์ฟเวอร์ (ตามสิทธิ์)
//   แท็บปัจจุบัน = href ยาวสุดที่เป็นต้นทางของ path ในเบราว์เซอร์ (อ่าน location หลัง mount · ไม่ใช้ hook ของ Next) · print:hidden
import { useSyncExternalStore } from "react";
import type { DormTabLink } from "./dorm-home-shared";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const currentPath = () => window.location.pathname;
const serverPath = () => "";

export default function DormTabs({ tabs }: { tabs: DormTabLink[] }) {
  const path = useSyncExternalStore(subscribe, currentPath, serverPath);
  const active = tabs
    .filter((t) => path === t.href || path.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key;
  if (!tabs.length) return null;
  return (
    <nav data-dorm-tabs="" aria-label="เมนูหอพัก" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b border-[color:var(--color-line)] px-1 print:hidden">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <a
            key={t.key}
            href={t.href}
            data-tab={t.key}
            aria-current={on ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm ${
              on ? "border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]" : "border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {t.labelTh}
          </a>
        );
      })}
    </nav>
  );
}
