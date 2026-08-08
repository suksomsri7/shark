"use client";

import { useEffect, useState } from "react";

// เปิดจากแอปมือถือหรือเปล่า — WebView ของแอปส่ง UA ที่มีคำว่า "SharkApp"
// เช็คใน effect เสมอ กัน hydration mismatch (ฝั่ง server ไม่รู้จัก UA ของ client)
// ค่าเริ่มต้น false = "ถือว่าเป็นเว็บ" → ผู้ใช้เว็บเห็นเลย์เอาต์ถูกตั้งแต่เฟรมแรก ไม่กระพริบ
export function useInApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkApp")) setInApp(true);
  }, []);
  return inApp;
}
