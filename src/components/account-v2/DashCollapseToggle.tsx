"use client";

import { useEffect, useState } from "react";
import { DASH_COLLAPSE_COOKIE } from "./dash-collapse-shared";

const STORAGE_KEY = "acc.dash.collapsed";
// ทุกการ์ดที่ "ย่อ/ขยาย" คุมอยู่ (DashBlock.tsx) — ติดธงนี้ไว้เสมอ
const SECTION_SELECTOR = '[data-dash-collapsible="1"]';

function applyToSections(collapsed: boolean) {
  document.querySelectorAll<HTMLDetailsElement>(SECTION_SELECTOR).forEach((el) => {
    el.open = !collapsed;
  });
}

/**
 * ปุ่มรอง "ย่อ/ขยาย" บนหัวหน้าหลัก (f1) — ยุบทุกการ์ดใต้ KPI ให้เหลือแค่หัวข้อ (DashBlock ใช้ <details> จริง
 * ของเบราว์เซอร์อยู่แล้ว ⇒ ปุ่มนี้แค่ตั้งค่า `.open` ของทุกตัวพร้อมกัน ไม่ต้องมี state กลาง/context)
 * จำสถานะต่อผู้ใช้ผ่าน localStorage + cookie (เหมือน EasyModeToggle) — ssrCollapsed มาจาก cookie ที่ server อ่าน
 */
export function DashCollapseToggle({ ssrCollapsed }: { ssrCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(ssrCollapsed);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === "1" ? true : stored === "0" ? false : ssrCollapsed;
    setCollapsed(initial);
    applyToSections(initial);
    // ตั้งใจรันครั้งเดียวตอน mount เท่านั้น — ssrCollapsed เป็นค่าตั้งต้นจาก server ไม่ใช่ dependency ที่ควรรีรัน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    applyToSections(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    document.cookie = `${DASH_COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <button
      type="button"
      className="btn btn-ghost text-sm"
      onClick={toggle}
      aria-pressed={collapsed}
      aria-label={collapsed ? "ขยายรายละเอียดทุกการ์ด" : "ย่อรายละเอียดทุกการ์ด"}
      data-testid="btn-dash-collapse"
    >
      {collapsed ? "ขยาย" : "ย่อ/ขยาย"}
    </button>
  );
}

export default DashCollapseToggle;
