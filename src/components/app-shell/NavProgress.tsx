"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// overlay ระหว่างเปลี่ยนหน้า — หน้าเดิมยังอยู่ (เทา + disable) + AI orb หมุนเร็วทับกลางจอ
// (แทน loading.tsx เดิมที่เปลี่ยนเป็นหน้าขาวว่าง — feedback เจ้าของ)
// ⚠️ ต้องดักที่ capture phase (true) — เพราะ Next <Link> เรียก preventDefault() ก่อน
//    ถ้าดัก bubble phase จะเจอ defaultPrevented=true แล้วพลาดทุกลิงก์
export function NavProgress() {
  const [active, setActive] = useState(false);
  const pathname = usePathname();

  // นำทางเสร็จ (path เปลี่ยน) → ปิด overlay
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || a.target === "_blank" || a.hasAttribute("download")) return;
      if (href.split(/[?#]/)[0] === pathname) return; // หน้าเดิม ไม่ต้องแสดง
      setActive(true);
    }
    // capture=true → รันก่อน Next Link (ยังไม่ preventDefault) จับได้ทุกลิงก์
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // safety: กันค้างถ้านำทางล้ม
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 10000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--color-surface-2)]/75 backdrop-blur-[2px]"
      aria-busy="true"
      aria-label="กำลังเปลี่ยนหน้า"
    >
      <div className="ai-orb-breathe relative h-14 w-14">
        <span aria-hidden className="ai-orb ai-orb-fast" />
      </div>
    </div>
  );
}
