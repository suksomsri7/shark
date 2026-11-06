"use client";
// SVC H.1 ▸ แท็บโมดูลโรงแรม (ภาพ 08/09/15 แถบบน) — แบบ DormTabs ทุกประการ · รายการแท็บมาจาก hotelTabsFor ฝั่งเซิร์ฟเวอร์ (ตามสิทธิ์)
//   แท็บปัจจุบัน = href ยาวสุดที่เป็นต้นทางของ path ในเบราว์เซอร์ (อ่าน location หลัง mount · ไม่ใช้ hook ของ Next) · print:hidden
import { useSyncExternalStore } from "react";
import type { HotelTabLink } from "./hotel-tabs-shared";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const currentPath = () => window.location.pathname;
const serverPath = () => "";

/** href ยาวสุดที่เป็นต้นทางของ path */
function activeKey(tabs: HotelTabLink[], path: string): string | undefined {
  let best: HotelTabLink | undefined;
  for (const t of tabs) {
    if (path !== t.href && !path.startsWith(`${t.href}/`)) continue;
    if (!best || t.href.length > best.href.length) best = t;
  }
  return best?.key;
}

export default function HotelTabs({ tabs }: { tabs: HotelTabLink[] }) {
  const path = useSyncExternalStore(subscribe, currentPath, serverPath);
  const active = activeKey(tabs, path);
  if (!tabs.length) return null;
  return (
    <nav data-hotel-tabs="" aria-label="เมนูโรงแรม" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b border-[color:var(--color-line)] px-1 print:hidden">
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
