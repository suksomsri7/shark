// pay-channel-label.ts — ป้ายช่องทางชำระภาษาไทย ครบทุกค่า AccountPayChannel (WO 9.4 §0.3 ข้อ 9)
//
// 🔴 ทำไมแยกไฟล์นี้ออกจาก service.ts (บั๊กจริงตอน build WO 9.4): service.ts import `prisma`/`pg` ตรง ๆ
//    (server-only) — DocDetailPage/PaymentPanel/GroupPaymentPanel เป็น "use client" ⇒ import ฟังก์ชันนี้จาก
//    service.ts ดึง prisma/pg เข้า client bundle ทั้งก้อน → `next build` ล้มทันที (module-not-found ของ `pg`
//    ในฝั่ง browser) ⇒ ไฟล์นี้ต้อง **client-safe ล้วน** ไม่ import prisma/service/db ใด ๆ
//
// `AccountPayChannel` import แบบ `type` เท่านั้น — ถูกลบตอน compile (erased) ไม่ดึง `@prisma/client` รันไทม์
// เข้า client bundle (ต่างจาก `import { AccountPayChannel }` แบบค่าจริงซึ่งจะดึงเข้ามา)
import type { AccountPayChannel } from "@prisma/client";
import { PAY_CHANNEL_LABEL as RAW } from "@/lib/ui/status-labels";

// `PAY_CHANNEL_LABEL` ที่ status-labels.ts เป็น `Record<string,string>` (ตั้งใจหลวม — ใช้ข้ามหลายโดเมนที่ไม่มี
// Prisma type เดียวกัน) ⇒ TypeScript ตรวจความครบไม่ได้ที่นั่น ⇒ ห่อด้วย `Record<AccountPayChannel,string>` ที่นี่
// (TS บังคับครบทุกค่า enum ที่ compile time — เพิ่ม enum ใหม่แล้วลืมเติมที่นี่ = build แดงทันที ไม่ใช่ enum ดิบหลุด UI)
const PAY_CHANNEL_LABEL_COMPLETE: Record<AccountPayChannel, string> = {
  CASH: RAW.CASH ?? "เงินสด",
  TRANSFER: RAW.TRANSFER ?? "โอน",
  PROMPTPAY: RAW.PROMPTPAY ?? "พร้อมเพย์",
  CARD: RAW.CARD ?? "บัตร",
  E_WALLET: RAW.E_WALLET ?? "อีวอลเล็ต",
  CHEQUE: RAW.CHEQUE ?? "เช็ค",
  DEPOSIT_APPLY: RAW.DEPOSIT_APPLY ?? "หักมัดจำ",
  CREDIT_APPLY: RAW.CREDIT_APPLY ?? "หักเครดิต",
  OTHER: RAW.OTHER ?? "อื่น ๆ",
};

/** ป้ายช่องทางชำระภาษาไทย — ไม่พบคีย์ (ไม่ควรเกิด) = "ช่องทางอื่น" (ไม่ใช่ enum ดิบ) */
export function payChannelLabel(channel: string): string {
  return (PAY_CHANNEL_LABEL_COMPLETE as Record<string, string>)[channel] ?? "ช่องทางอื่น";
}

export default payChannelLabel;
