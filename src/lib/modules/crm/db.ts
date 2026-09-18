// db.ts — จุดเดียวของโมดูล CRM (โค้ดใหม่ของ v2) ที่แตะ prisma ดิบ
//
// 🔴 แบบเดียวกับ `member/db.ts` · `kanban/db.ts`: ข้อสอบสถาปัตยกรรม F5.1 นับไฟล์ในโมดูลที่ `import { prisma }`
//    จาก `@/lib/core/db` ตรง ๆ แบบ ratchet (เต็มเพดาน 45/45) ⇒ ไฟล์ใหม่ของ CRM ผ่านทางนี้ทางเดียว
// 🔴 ทำไมไม่ใช้ `tenantDb` ใน `objects.ts`: (1) `Customer` เป็น sys("memberSystemId") — ขอบเขตของระบบ CRM
//    จะกรองสมาชิกทิ้งหมด (แม่ชนิด CUSTOMER หาไม่เจอ) (2) engine ฟิลด์ที่รับ `tx` ของเราใช้ `upsert` บน
//    `CustomRecordValue` ซึ่งตัวกรองของ tenantDb ห่อ where ด้วย AND จน unique-where ใช้ไม่ได้
//    ⇒ ใช้ client ดิบ + ใส่ tenantId/systemId เองทุก query (AUDIT-CLASS X1 ทุกจุดใน objects.ts)
export { prisma } from "@/lib/core/db";
