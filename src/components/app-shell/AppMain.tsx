"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useInApp } from "./use-in-app";
import { isRailPath } from "./NavRail";

// พื้นที่เนื้อหาของแอป — เว้นที่ให้ topbar (สูง 56px) + แถบเมนู/รางไอคอนทางซ้าย
//
// B3: ระยะเว้นซ้ายตัดสินจาก **สถานะจริงของแถบเมนู** ไม่ใช่จาก path อย่างเดียวอีกต่อไป
//   · แถบเต็ม 288px (18rem) → `lg:pl-[calc(18rem+1.5rem)]`
//   · รางไอคอน 56px (3.5rem) → `lg:pl-14`
//   สถานะเริ่มต้นมาจาก server (`preferences.navCollapsed` ของผู้ใช้) แล้วฟัง `app:nav-collapsed`
//   ที่ AppShell ยิงตอนคนกด ‹/› — 🔴 ทั้งสองตัวเป็นพี่น้องกันใน layout ไม่ใช่พ่อลูก จึงคุยกันด้วย
//   event ชื่อเดียว (แพตเทิร์นเดียวกับ `app:drawer-open`) แทนการยก state ขึ้นไปไว้ที่ layout ซึ่งเป็น server
//   · หน้าบอร์ดงาน (isRailPath) บังคับรางเสมอ ไม่ว่าผู้ใช้ตั้งค่าไว้แบบไหน (K1.5)
//
// เปิดจากแอป (WebView) ไม่มีแถบปักซ้าย/ราง → ไม่เว้นซ้ายเลย
//
// WO-CV12 (มติเจ้าของ 1 ก.ย. 2026) — หน้ากล่องแชทเต็มจอ:
//   จอ < lg ไม่มีแถบบนแล้ว (Topbar ซ่อนตัวเอง) ⇒ ถ้ายังเว้น `pt-[calc(3.5rem+1rem)]` ไว้
//   จะได้ "ช่องว่างโหว่ 3.5rem" แทนแถบที่หายไป · และการ์ดต้องชิดขอบซ้าย-ขวาตามแบบร่าง (px-0)
//   🔴 lg ขึ้นไปยังมีแถบบน + แถบเมนู/ราง ⇒ ระยะขอบเดิมทั้งชุด
export function AppMain({
  children,
  chatSystemIds = [],
  navCollapsed = false,
}: {
  children: React.ReactNode;
  /** id ของระบบแชทที่ร้านเปิดใช้ (จาก layout) — ใช้ตัดสิน "หน้าแชทเต็มจอ" แบบเดียวกับ AppShell */
  chatSystemIds?: string[];
  /** ค่าที่ผู้ใช้จำไว้ (server) — ย่อแถบเมนูเป็นรางไอคอนอยู่หรือเปล่า */
  navCollapsed?: boolean;
}) {
  const inApp = useInApp();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(navCollapsed);
  // ค่าจาก server เปลี่ยน (เช่น router.refresh หลังบันทึก) = แหล่งความจริง
  useEffect(() => setCollapsed(navCollapsed), [navCollapsed]);
  useEffect(() => {
    const onToggle = (e: Event) => setCollapsed(!!(e as CustomEvent<{ collapsed: boolean }>).detail?.collapsed);
    window.addEventListener("app:nav-collapsed", onToggle);
    return () => window.removeEventListener("app:nav-collapsed", onToggle);
  }, []);

  const chatFullscreen = chatSystemIds.some((id) => pathname === `/app/sys/${id}`);
  // K1.5 — หน้าบอร์ดงาน: เต็มจอจริง (ไม่มีขอบ) + เว้นซ้ายเท่ารางไอคอน 56px (3.5rem) แทนเมนู 288px
  const boardFullscreen = isRailPath(pathname);
  const railMode = collapsed || boardFullscreen;
  // ระยะเว้นซ้ายบนจอ ≥ lg — ราง 3.5rem / แถบเต็ม 18rem (+1.5rem ระยะขอบเนื้อหา)
  const leftPad = inApp ? "" : railMode ? "lg:pl-[calc(3.5rem+1.5rem)]" : "lg:pl-[calc(18rem+1.5rem)]";
  // 🔴 เขียนคลาสแยกเป็นชุดเต็ม ๆ โดยตั้งใจ — ไม่ผสม `px-*` กับ `pl-*` ในเบรกพอยต์เดียวกัน
  //    (ลำดับที่ Tailwind สร้างให้เป็นตัวตัดสิน ไม่ใช่ลำดับตัวอักษรในสตริง = อ่านแล้วเดาผิดง่าย)
  if (boardFullscreen) {
    return <main className={`px-0 pb-0 pt-14 ${inApp ? "" : "lg:pl-14"}`}>{children}</main>;
  }
  const pad = chatFullscreen
    ? `px-0 pb-2 pt-2 sm:px-6 lg:pr-6 lg:pt-[calc(3.5rem+1rem)] ${
        // ในแอปไม่มีแถบเมนูซ้าย ⇒ ไม่ต้องเว้นซ้าย · ขอบล่างไม่ต้องเผื่อ orb อีกแล้ว (orb ย้ายขึ้นแถบบน B3)
        inApp ? "lg:pb-2 lg:pl-6" : `lg:pb-2 ${leftPad}`
      }`
    : `px-4 pb-10 pt-[calc(3.5rem+1rem)] sm:px-6 ${leftPad}`;
  return <main className={pad}>{children}</main>;
}
