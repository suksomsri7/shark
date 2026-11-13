"use client";
// TRIPS T1.1 ▸ แถบนำทางโมดูลทัวร์ (ภาพ 11/16/17/18 แถบบน · แบบ HotelTabs) — รายการแท็บมาจาก loadTripsNav ฝั่งเซิร์ฟเวอร์ (เห็นตามสิทธิ์)
//   แท็บปัจจุบัน = href ยาวสุดที่เป็นต้นทางของ path (อ่าน location หลัง mount) · แท็บที่ยังไม่เปิด = ลิงก์จริงไปหน้า "ยังไม่เปิดใช้" + ป้าย "เร็ว ๆ นี้" (เส้นประ)
//   ป้ายสถานะแยกด้วยรูปทรง: แท็บปัจจุบัน = พื้นทึบ · ยังไม่เปิด = กรอบเส้นประ
import { useSyncExternalStore, type ComponentProps } from "react";
import type { TripsNavKey } from "./trips-shared";

export type TripsNavLink = { key: TripsNavKey; href: string; available: boolean; label: string; soon: string | null };

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const currentPath = () => window.location.pathname;
const serverPath = () => "";

function activeKey(entries: TripsNavLink[], path: string): TripsNavKey | undefined {
  let best: TripsNavLink | undefined;
  for (const e of entries) {
    if (path !== e.href && !path.startsWith(`${e.href}/`)) continue;
    if (!best || e.href.length > best.href.length) best = e;
  }
  return best?.key;
}

function Tab({ entry, active, ...rest }: { entry: TripsNavLink | undefined; active: TripsNavKey | undefined } & ComponentProps<"a">) {
  if (!entry) return null;
  const on = entry.key === active;
  return (
    <a
      {...rest}
      href={entry.href}
      data-tab={entry.key}
      data-available={entry.available ? "true" : "false"}
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm ${
        on ? "bg-[color:var(--color-surface-2)] font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      {entry.label}
      {entry.soon ? <span className="rounded-md border border-dashed border-[color:var(--color-line)] px-1.5 text-sm text-[color:var(--color-muted)]">{entry.soon}</span> : null}
    </a>
  );
}

export default function TripsNav({ unitName, entries, ariaLabel }: { unitName: string; entries: TripsNavLink[]; ariaLabel: string }) {
  const path = useSyncExternalStore(subscribe, currentPath, serverPath);
  const active = activeKey(entries, path);
  const by = (k: TripsNavKey) => entries.find((e) => e.key === k);
  const initials = unitName.trim().slice(0, 2).toUpperCase();
  return (
    <nav data-testid="trips-nav" aria-label={ariaLabel} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[color:var(--color-line)] pb-2 print:hidden">
      <span className="mr-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[color:var(--color-ink)]">
        <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--color-ink)] text-sm text-[color:var(--color-surface)]">
          {initials}
        </span>
        {unitName}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Tab entry={by("products")} active={active} data-testid="trips-nav-products" />
        <Tab entry={by("departures")} active={active} data-testid="trips-nav-departures" />
        <Tab entry={by("bookings")} active={active} data-testid="trips-nav-bookings" />
        <Tab entry={by("agents")} active={active} data-testid="trips-nav-agents" />
        <Tab entry={by("channels")} active={active} data-testid="trips-nav-channels" />
        <Tab entry={by("settings")} active={active} data-testid="trips-nav-settings" />
      </div>
    </nav>
  );
}
