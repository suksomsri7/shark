// Rate limiter ของ Chat public surface (M9 · แก้ B2 ใน WO-C3)
//
// เดิมเป็น sliding window ใน memory ต่อ process → บน Vercel หลาย instance เพดานจริง
// = ที่ตั้งไว้ × จำนวน instance ⇒ แทบไม่กันอะไร · ตอนนี้นับบนแถวจริงใน `ChatRateBucket`
// (ตัวนับอยู่ที่ `core/rate-limit-db.ts` — โมดูลห้าม import prisma ตรง ๆ ตามกติกา F5)
//
// 🔴 interface เดิมคงชื่อ/ลำดับอาร์กิวเมนต์ไว้ทั้งหมด แต่ **กลายเป็น async**
//    (การนับบน DB เป็น I/O จะทำให้เป็น sync ไม่ได้) ⇒ ผู้เรียกต้องใส่ `await`
//    ห้ามลืม: `if (!rateLimit(...))` ที่ไม่ await จะได้ Promise ซึ่ง truthy เสมอ
//    = ด่านเปิดโล่งแบบเงียบ ๆ (ข้อสอบ qc-chat-api-v1 ข้อ CA-6.6 คอยจับให้)
//
// key แนะนำ: `${scope}:${ip|guest}:${connectionId}` — คนละ IP/connection คนละถัง

import { checkRateLimitDb, resetRateLimitDb } from "@/lib/core/rate-limit-db";

/** คืน true = ผ่าน (ยังไม่ถึงลิมิต), false = โดนจำกัด — นับ 1 ครั้งเมื่อผ่าน */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await checkRateLimitDb(key, { limit, windowMs })).ok;
}

/** เหมือน rateLimit แต่บอกเวลาที่ควรลองใหม่ด้วย (ใช้ตั้ง header retry-after) */
export async function rateLimitVerdict(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec?: number }> {
  return checkRateLimitDb(key, { limit, windowMs });
}

/** ดึง client IP จาก proxy headers (Vercel/nginx) — fallback "unknown" */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** เฉพาะ test/dev — ล้างถังของ key เดียว · 🔴 ไม่ส่ง key = ไม่ทำอะไร (ห้ามล้างทั้งตารางบน prod) */
export async function __resetRateLimit(key?: string): Promise<void> {
  await resetRateLimitDb(key);
}
