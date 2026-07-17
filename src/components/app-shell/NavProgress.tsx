"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// overlay ระหว่างเปลี่ยนหน้า — หน้าเดิมยังอยู่ (เทา + disable) + AI orb หมุนเร็วทับกลางจอ
// (แทน loading.tsx เดิมที่เปลี่ยนเป็นหน้าขาวว่าง — ดู feedback เจ้าของ)
// กลไก: คลิกลิงก์ภายในไปหน้าอื่น → แสดง overlay · path เปลี่ยน (หน้าใหม่พร้อม) → ปิด
export function NavProgress() {
  const [active, setActive] = useState(false);
  const pathname = usePathname();

  // นำทางเสร็จ (path เปลี่ยน) → ปิด overlay
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  // ดักคลิกลิงก์ภายใน → เปิด overlay ทันที (หน้าเดิมยังค้างให้เห็น)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || a.target === "_blank" || a.hasAttribute("download")) return;
      if (href.split(/[?#]/)[0] === pathname) return; // หน้าเดิม ไม่ต้องแสดง
      setActive(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  // safety: กันค้างถ้านำทางล้ม
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 8000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--color-ink)]/15 backdrop-blur-[1px]"
      aria-busy="true"
      aria-label="กำลังเปลี่ยนหน้า"
    >
      <div className="ai-orb-breathe relative h-14 w-14">
        <span aria-hidden className="ai-orb ai-orb-fast" />
      </div>
    </div>
  );
}
