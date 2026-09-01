"use client";

import { usePathname } from "next/navigation";
import { useInApp } from "./use-in-app";

// พื้นที่เนื้อหาของแอป — เว้นที่ให้ topbar (สูง 56px) + ปุ่มผู้ช่วย AI มุมขวาล่าง
// เว็บบนจอใหญ่ (≥ lg) มีแถบเมนูปักซ้ายกว้าง 18rem → เว้นซ้ายเพิ่มไม่ให้เมนูทับเนื้อหา
// เปิดจากแอป (WebView) ไม่มีแถบปักซ้าย → ไม่เว้น
//
// WO-CV12 (มติเจ้าของ 1 ก.ย. 2026) — หน้ากล่องแชทเต็มจอ:
//   จอ < lg ไม่มีแถบบนแล้ว (Topbar ซ่อนตัวเอง) ⇒ ถ้ายังเว้น `pt-[calc(3.5rem+1rem)]` ไว้
//   จะได้ "ช่องว่างโหว่ 3.5rem" แทนแถบที่หายไป · และการ์ดต้องชิดขอบซ้าย-ขวาตามแบบร่าง (px-0)
//   🔴 lg ขึ้นไปยังมีแถบบน + แถบเมนูปักซ้าย ⇒ ระยะขอบเดิมทั้งชุด
//
//   ✅ ขอบล่างบนจอแคบเป็น `pb-2` — orb ผู้ช่วย AI ถูกซ่อนบนหน้าแชท <lg แล้ว (AiDock hideOnMobile) · เดิมเคยเป็น `pb-16` — ปุ่มผู้ช่วย AI (AiDock) เป็น `fixed bottom-4 right-4`
//      ขนาด 40px + z-40 ⇒ ถ้าการ์ดยาวชนขอบจอ ปุ่มจะไปทับ "ปุ่มส่ง" ของกล่องพิมพ์พอดี
//      (แบบร่างของเจ้าของไม่ได้วาดปุ่ม AI ไว้ — ถ้าตัดสินใจซ่อน orb บนหน้าแชทเต็มจอเมื่อไหร่
//       ค่อยลด `pb-16` → `pb-2` และแก้ความสูงการ์ดใน inbox-client เป็น `100dvh-1rem` พร้อมกัน)
export function AppMain({
  children,
  chatSystemIds = [],
}: {
  children: React.ReactNode;
  /** id ของระบบแชทที่ร้านเปิดใช้ (จาก layout) — ใช้ตัดสิน "หน้าแชทเต็มจอ" แบบเดียวกับ AppShell */
  chatSystemIds?: string[];
}) {
  const inApp = useInApp();
  const pathname = usePathname();
  const chatFullscreen = chatSystemIds.some((id) => pathname === `/app/sys/${id}`);
  // 🔴 เขียนคลาสแยกเป็น 2 ชุดเต็ม ๆ โดยตั้งใจ — ไม่ผสม `px-*` กับ `pl-*` ในเบรกพอยต์เดียวกัน
  //    (ลำดับที่ Tailwind สร้างให้เป็นตัวตัดสิน ไม่ใช่ลำดับตัวอักษรในสตริง = อ่านแล้วเดาผิดง่าย)
  const pad = chatFullscreen
    ? `px-0 pb-2 pt-2 sm:px-6 lg:pb-24 lg:pr-6 lg:pt-[calc(3.5rem+1rem)] ${
        inApp ? "lg:pl-6" : "lg:pl-[calc(18rem+1.5rem)]"
      }`
    : `px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6 ${inApp ? "" : "lg:pl-[calc(18rem+1.5rem)]"}`;
  return <main className={pad}>{children}</main>;
}
