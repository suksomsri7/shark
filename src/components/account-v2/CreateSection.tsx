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

  // เปิดได้ทางเดียวคือปุ่ม "+ สร้าง…" ของ PageHeader (ผ่าน #new) — ไม่มีลิงก์สำรอง "แสดงฟอร์มสร้าง"
  // อีกต่อไป (WO 1.3 จะแทนบล็อกนี้ทั้งหมดด้วยฟอร์มหน้าเต็ม) — ปิดอยู่ = ไม่ render อะไรเลยนอกจาก anchor เปล่า
  return <div id="new" ref={ref} data-testid="create-section" data-open={open}>{open ? children : null}</div>;
}

export default CreateSection;
