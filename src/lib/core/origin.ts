import { headers } from "next/headers";

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
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // ไม่ได้อยู่ในบริบท request — ตกไปใช้ค่าที่ตั้งไว้
  }
  return (await appUrlFallback()).replace(/\/$/, "");
}

/**
 * ค่าสำรองจาก `env.APP_URL` — โหลด **ตอนถูกเรียกจริง** เท่านั้น (M1.11)
 *
 * 🔴 ทำไมเป็น dynamic import: `@/lib/env` ตรวจ env ทั้งชุดตอน import (fail fast ตอน boot ของแอป
 *    ซึ่งถูกต้องสำหรับ runtime) — แต่ไฟล์นี้ถูกลากเข้าไปในสายของ **ทะเบียน op/tool** ผ่าน
 *    facade ของโมดูล ⇒ สคริปต์ที่ต้องรันโดยไม่มี env เลย (`scripts/fitness.mts` แบบไม่มี
 *    DATABASE_URL — บทเรียน `reference_shark_precommit_fitness_no_env`) จะตายตั้งแต่ import
 *    ทั้งที่ไม่ได้จะเรียกฟังก์ชันนี้เลยสักครั้ง
 *    ⇒ ย้ายการอ่าน env มาไว้ในตัวฟังก์ชัน: พฤติกรรมตอนรันจริงเหมือนเดิมทุกประการ
 */
async function appUrlFallback(): Promise<string> {
  const { env } = await import("@/lib/env");
  return env.APP_URL;
}
