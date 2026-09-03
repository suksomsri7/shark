"use client";

import { useEffect, useRef, useState } from "react";

// ซ่อนฟอร์มสร้างเอกสารไว้หลังปุ่มดำ "+ สร้าง…" ของ PageHeader (f3 mockup ไม่โชว์ฟอร์มค้างในหน้ารายการ)
// เปิดเอง 2 ทาง: (1) ผู้ใช้กดปุ่ม "+ สร้าง…" ในหน้าเดียวกัน (Link ไป #new — เราฟัง hashchange)
//               (2) เข้าหน้ามาพร้อม #new อยู่แล้ว (ลิงก์ "+ สร้าง…" จาก flyout เมนู V2 หน้าอื่นชี้มาที่ `${href}#new`)
// id="new" คงไว้เป็นเป้าหมายของ fragment เสมอ (แม้ยังไม่เปิด) — กันลิงก์เก่าที่ชี้มาที่นี่ตายเงียบ ๆ
export function CreateSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reveal = () => {
      if (window.location.hash !== "#new") return;
      setOpen(true);
      requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <div id="new" ref={ref} data-testid="create-section" data-open={open}>
      {open ? (
        children
      ) : (
        <button
          type="button"
          className="text-sm text-[color:var(--color-muted)] underline"
          onClick={() => setOpen(true)}
        >
          แสดงฟอร์มสร้าง
        </button>
      )}
    </div>
  );
}

export default CreateSection;
