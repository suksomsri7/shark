// db.ts — จุดเดียวของโมดูล "voucher" ที่แตะ prisma ดิบ (แบบเดียวกับ giftcard/db.ts · stamp/db.ts)
//
// 🔴 ข้อสอบสถาปัตยกรรม F5 นับ "จำนวนไฟล์ในโมดูลที่ `import { prisma }` จาก `@/lib/core/db` ตรง ๆ"
//    แบบ ratchet (ลดได้อย่างเดียว) ⇒ ไฟล์ใหม่ของโมดูลนี้ผ่านทางนี้ทางเดียว
//    ผลพลอยได้: ตอน port ไป `tenantDb` (Phase 3) แก้ที่ไฟล์นี้ไฟล์เดียว
export { prisma } from "@/lib/core/db";
