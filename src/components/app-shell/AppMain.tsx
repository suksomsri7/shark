"use client";

import { useInApp } from "./use-in-app";

// พื้นที่เนื้อหาของแอป — เว้นที่ให้ topbar (สูง 56px) + ปุ่มผู้ช่วย AI มุมขวาล่าง
// เว็บบนจอใหญ่ (≥ lg) มีแถบเมนูปักซ้ายกว้าง 18rem → เว้นซ้ายเพิ่มไม่ให้เมนูทับเนื้อหา
// เปิดจากแอป (WebView) ไม่มีแถบปักซ้าย → ไม่เว้น
export function AppMain({ children }: { children: React.ReactNode }) {
  const inApp = useInApp();
  return (
    <main
      className={`px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6 ${
        inApp ? "" : "lg:pl-[calc(18rem+1.5rem)]"
      }`}
    >
      {children}
    </main>
  );
}
