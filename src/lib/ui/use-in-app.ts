"use client";

import { useEffect, useState } from "react";

// เปิดจากแอปมือถือหรือเปล่า — WebView ของแอปส่ง UA ที่มีคำว่า "SharkApp"
// อยู่ใน lib/ui (ไม่ใช่ app-shell) เพราะโมดูล (แชท ฯลฯ) ต้องใช้ได้โดยไม่ import app-shell (กติกา SH-4.5)
// เช็คใน effect เสมอ กัน hydration mismatch (ฝั่ง server ไม่รู้จัก UA ของ client)
// ค่าเริ่มต้น false = "ถือว่าเป็นเว็บ" → ผู้ใช้เว็บเห็นเลย์เอาต์ถูกตั้งแต่เฟรมแรก ไม่กระพริบ
export function useInApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkApp")) setInApp(true);
  }, []);
  return inApp;
}

// 14 พ.ย. (เจ้าของสั่ง): แอปรุ่นใหม่วางแถบบน native เอง (แบบหน้าเลขา) เหนือ WebView และส่ง UA เพิ่ม "SharkTopBar"
//   ⇒ เว็บไม่ต้องวาด Topbar ของตัวเองและไม่เว้นที่ 56px · แอปรุ่นเก่า (ไม่มีคำนี้) = แถบเว็บเหมือนเดิม
export function useNativeTopBar(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkTopBar")) setOn(true);
  }, []);
  return on;
}
