"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// overlay ระหว่างเปลี่ยนหน้า — หน้าเดิมยังอยู่ (เทา + disable) + โลโก้ Lekaa เคลื่อนไหวทับกลางจอ (17 พ.ย. เดิม = AI orb หมุนเร็ว)
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
      {/* 17 พ.ย. (เจ้าของสั่ง): ตัวโหลด = โลโก้ Lekaa เคลื่อนไหว (loading-A · public/lekaa-loading.svg) แทนวงกลม orb */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lekaa-loading.svg" alt="" aria-hidden width={72} height={72} />
    </div>
  );
}
