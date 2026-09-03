"use client";

import { useEffect, useRef, useState } from "react";

// เวอร์ชันทั่วไปของ CreateSection.tsx (ผูก id="new" ตายตัว) — WO 3.2 ต้องการหลายส่วนที่ซ่อน/โผล่ด้วยคนละ
// hash ในหน้าเดียวกัน (#new-contact · #edit-contact · #bulk-group · #popular-vendors) จึงรับ `hash` เป็น prop
// พฤติกรรมเดียวกันทุกอย่าง: เปิดเมื่อ URL มี #<hash> อยู่ (ตอนโหลดหรือกดลิงก์ในหน้าเดียวกัน) แล้วเลื่อนเข้าหา
export function HashSection({ hash, children, defaultOpen = false }: { hash: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reveal = () => {
      if (window.location.hash !== `#${hash}`) return;
      setOpen(true);
      requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [hash]);

  return (
    <div id={hash} ref={ref} data-testid={`hash-section-${hash}`} data-open={open}>
      {open ? children : null}
    </div>
  );
}

export default HashSection;
