// private-targets.ts — สวิตช์ "ยอมให้ส่ง webhook เข้าเครื่องภายใน" ตัวเดียวของระบบ (ย้ายมาจาก webhooks/service.ts · C4.4-fix I3)
// 🔴 ไฟล์บริสุทธิ์ (ไม่มี prisma/node:*) — ด่าน SSRF (`service.ts`) และตัวตรวจที่อยู่ของ CRM (`crm/api/webhook-events.ts`) อ่านสวิตช์เดียวกัน
//    ช่องทดสอบเดียวที่เปิดได้: `WEBHOOK_ALLOW_PRIVATE=1` **และ** ไม่ใช่ production (บน prod ต่อให้ env หลุดไปก็ไม่เปิด)

/** เปิดช่องทดสอบ (dev/QC) อยู่ไหม — อ่าน env ทุกครั้งที่เรียก (ไม่แคช) */
export function privateTargetsAllowed(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE === "1" && process.env.APP_ENV !== "production";
}

/**
 * ชื่อโฮสต์ของ URL (ตามที่ `new URL().hostname` คืน) เป็น "เครื่องนี้" แบบตรงตัวไหม — `localhost` · 127.0.0.0/8 · `[::1]`
 * 🔴 ตรงตัวเท่านั้น: `127.0.0.1.nip.io` · `localhost.evil.com` ไม่นับ (เป็นชื่อโดเมนที่ DNS ชี้ไปไหนก็ได้)
 */
export function isLoopbackHostname(hostname: string): boolean {
  const h = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  if (h === "localhost") return true;
  if (h === "[::1]" || h === "::1") return true;
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return !!m && m.slice(1).every((x) => Number(x) <= 255);
}
