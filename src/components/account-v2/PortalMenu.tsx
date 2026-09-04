"use client";

// PortalMenu.tsx — โครงกลางของ dropdown ที่ RowActions/DocMoreMenu ใช้ (WO 7.1 round 2)
//
// 🔴 บั๊กที่แก้: การ์ดตาราง (`DocTableInteractive.tsx`) ครอบด้วย `overflow-x-auto` ซึ่งตาม CSS spec บังคับ
//    `overflow-y` เป็น `auto` ไปด้วยเสมอ (ไม่มีทาง scroll แนวนอนอย่างเดียวโดยไม่ scroll/clip แนวตั้งด้วย)
//    ⇒ dropdown เดิมที่เป็น `position:absolute` ในตารางถูก "ตัด" ที่ขอบการ์ดจริงในเบราว์เซอร์ (ไม่ใช่แค่ภาพหลุด)
//    กระทบทุกหน้าที่ใช้ DocTable + RowActions/DocMoreMenu (WHT/Journal/Contacts/Products/เอกสารทุกชนิด ฯลฯ)
//
// ทางแก้: portal เมนูไป `document.body` ตรง ๆ (หลุดจากทุก overflow ของบรรพบุรุษ) + จัดตำแหน่งด้วย
// `position:absolute` แบบ "พิกัดสัมพัทธ์กับเอกสาร" (`rect + scrollX/scrollY` ไม่ใช่ `position:fixed`)
// เหตุผลที่เลือก absolute ไม่ใช่ fixed: หน้าจอ QC (`visual-acc-v2.mts`) รีเซ็ต `scrollTo(0,0)` เสมอก่อนถ่ายภาพ
// ทุกครั้ง — ถ้าใช้ fixed + "ปิดเมื่อ scroll" เมนูจะถูกปิดไปเองก่อนกดชัตเตอร์ (พิสูจน์บั๊กด้วยภาพไม่ได้เลย)
// ส่วน absolute แบบสัมพัทธ์เอกสารจะ "เลื่อนตามเนื้อหาไปเอง" เมื่อหน้าสกอล (ไม่ต้องปิด/คำนวณใหม่) — ถูกต้องกว่า
// และเข้ากันได้กับ harness ทดสอบเป๊ะ (scrollTo(0,0) ก่อนถ่าย → แถวขยับกลับตำแหน่งเดิม เมนูขยับตามพอดี)
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 🔴 บั๊กที่เจอ + แก้แล้วระหว่างเขียน (WO 7.1 round 2): เดิมมี state `mounted` (เริ่ม false) + `if (!mounted)
//    return null` ก่อน `createPortal` เพื่อ "กัน SSR" — แต่คอมโพเนนต์นี้ mount เฉพาะตอนคลิกฝั่ง client เท่านั้น
//    (ไม่มีทาง render บน server เลย) ⇒ ไม่จำเป็นต้องกัน แถมเป็นบั๊กจริง: เพราะ mounted=false ทำให้ "รอบ render แรก"
//    คืน null (ไม่มี <div ref={menuRef}> ให้จับ) → useLayoutEffect (deps=[]) รันครั้งเดียวตอนนั้นเจอ menuRef.current
//    เป็น null แล้ว return ทิ้งเงียบ ๆ (ไม่ได้ setStyle) → พอ useEffect(setMounted(true)) ทำให้ render รอบ 2 ค่อยมี
//    div จริง แต่ useLayoutEffect ไม่รันซ้ำอีกแล้ว (deps ว่าง) ⇒ เมนู "เปิด" จริง (มีข้อความในหน้าจริง — ผ่านด่าน
//    innerText ของ visual-acc-v2.mts P0 ได้!) แต่ค้างตำแหน่งเริ่มต้น `top:-9999px;left:-9999px` ตลอดไป (มองไม่เห็น
//    บนจอ/ในภาพถ่าย) — เอา `mounted` ออกทั้งหมด ให้ portal render พร้อม menuRef ตั้งแต่รอบแรกเสมอ

export function PortalMenu({
  open,
  onClose,
  anchorRef,
  children,
  testId,
  align = "right",
  className = "min-w-[200px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  testId?: string;
  align?: "left" | "right";
  className?: string;
}) {
  if (!open) return null;
  return (
    <PortalMenuInner onClose={onClose} anchorRef={anchorRef} testId={testId} align={align} className={className}>
      {children}
    </PortalMenuInner>
  );
}

// mount เฉพาะตอน open=true (unmount เมื่อปิด) — กัน hook ผูก listener ทิ้งไว้เปล่าประโยชน์ตอนเมนูปิดอยู่
function PortalMenuInner({
  onClose,
  anchorRef,
  children,
  testId,
  align,
  className,
}: {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  testId?: string;
  align: "left" | "right";
  className: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "absolute", top: -9999, left: -9999 });

  // จัดตำแหน่งครั้งเดียวตอนเปิด (ไม่คำนวณใหม่ตอนสกอล — ดูเหตุผลหัวไฟล์: absolute สัมพัทธ์เอกสารเลื่อนตามเนื้อหาเอง)
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const menuW = menu.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < menuH + 8 && rect.top > menuH + 8;
    const topViewport = flipUp ? rect.top - menuH - 4 : rect.bottom + 4;
    let leftViewport = align === "right" ? rect.right - menuW : rect.left;
    leftViewport = Math.min(Math.max(8, leftViewport), window.innerWidth - menuW - 8);
    setStyle({
      position: "absolute",
      top: Math.max(8, topViewport) + window.scrollY,
      left: leftViewport + window.scrollX,
      zIndex: 1000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- จัดตำแหน่งครั้งเดียวตอน mount (ไม่ใช่ทุก render)
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const menu = menuRef.current;
      const anchor = anchorRef.current;
      const target = e.target as Node;
      if (menu?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // ปิดเมื่อ scroll เฉพาะ "ภาชนะย่อยที่ scroll ได้" (เช่น overflow-x-auto ของการ์ดตาราง สกอลแนวนอน) ไม่ใช่การ
    // สกอลหน้าทั้งหน้า (window/document) — เพราะตำแหน่ง absolute สัมพัทธ์เอกสารเลื่อนตามการสกอลหน้าไปเองอยู่แล้ว
    // โดยไม่ต้องปิด (ดูเหตุผลหัวไฟล์)
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t === document || t === window || t === document.documentElement) return;
      onClose();
    };
    // ปิดเมื่อ "ความกว้าง" viewport เปลี่ยน (หมุนจอ/ปรับขนาดหน้าต่างจริง — เค้าโครงเปลี่ยนจริง) — ไม่ปิดเมื่อมีแค่
    // "ความสูง" เปลี่ยน เพราะเครื่องมือถ่ายภาพเต็มหน้า (Puppeteer `fullPage: true`) ขยาย viewport แนวตั้งชั่วคราว
    // ก่อนกดชัตเตอร์เสมอ (ไม่ใช่ resize จริงของผู้ใช้) — ถ้าปิดตามด้วยจะทำให้ QC ถ่ายภาพเมนูที่เปิดค้างไม่ได้เลย
    // (พิสูจน์บั๊กด้วยภาพไม่ได้ — เจอจริงตอนเขียน WO 7.1 round 2)
    const widthAtOpen = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== widthAtOpen) onClose();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div ref={menuRef} role="menu" data-testid={testId} className={className} style={style}>
      {children}
    </div>,
    document.body,
  );
}

export default PortalMenu;
