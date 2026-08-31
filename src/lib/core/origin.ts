import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * โดเมนสาธารณะของร้าน สำหรับ "ลิงก์ที่เอาไปแปะให้ลูกค้า" (แชทหน้าเว็บ · ฟอร์ม · หน้าเพจ · จอคิว · พอร์ทัลผู้ขาย)
 *
 * 🔴 ทำไมไม่ใช้ `env.APP_URL` ตรง ๆ (31 ส.ค. 2026):
 * ค่านั้นบน prod ค้างเป็น `https://shark.suksomsri.cloud` ซึ่งเป็นโดเมน VPS ที่ **ปิดไปแล้ว**
 * → ลิงก์แชทหน้าเว็บที่ระบบให้เจ้าของไปแปะ เปิดแล้วขึ้น 502 (เจ้าของแจ้ง "url ผิด")
 * ค่าที่ตั้งด้วยมือแบบนี้เน่าเงียบ ไม่มีอะไรฟ้อง — เอาโดเมนจาก "คำขอที่กำลังเปิดอยู่" แทน
 * ผู้ใช้เปิดหน้าจากโดเมนไหน ลิงก์ก็เป็นโดเมนนั้น ตรงกันเสมอโดยไม่ต้องพึ่งใครมาตั้งค่า
 *
 * ⚠️ ใช้ได้เฉพาะในบริบทที่มี request (server component / server action / route handler)
 * งานเบื้องหลังที่ไม่มี request (อีเมล · cron) ยังต้องใช้ `env.APP_URL` — จึง fallback ไปที่นั่น
 */
export async function publicOrigin(): Promise<string> {
  const fallback = env.APP_URL.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return fallback;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return fallback; // ไม่ได้อยู่ในบริบท request
  }
}
