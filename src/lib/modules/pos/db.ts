// db.ts — จุดเดียวของโค้ดใหม่ในโมดูล POS (แคตตาล็อกเดียว P1.1a เป็นต้นไป) ที่แตะ prisma ดิบ
//
// 🔴 แบบเดียวกับ `member/db.ts` · `kanban/db.ts` · `crm/db.ts`: ข้อสอบสถาปัตยกรรม F5.1 นับไฟล์ในโมดูลที่
//    `import { prisma }` จาก `@/lib/core/db` ตรง ๆ แบบ ratchet (เต็มเพดาน 45/45) ⇒ ไฟล์ใหม่ของ POS ผ่านทางนี้ทางเดียว
// 🔴 ทำไมไม่ใช้ `tenantDb`: catalog.ts ต้องอ่านข้ามแกน (AppSystemUnit · InvItem แกนระบบคลัง · MenuItem แกนสาขา ·
//    AccountProduct แกนระบบบัญชี) ในธุรกรรมเดียว + รับ client/tx ของผู้เรียก (สัญญา "trailing client")
//    ⇒ ใช้ client ดิบ + ใส่ tenantId/systemId เองทุก query (AUDIT-CLASS X2 ทุกจุดใน catalog.ts)
//    ตอน port ไป `tenantDb` (Phase 3) แก้ที่ไฟล์นี้ไฟล์เดียว
export { prisma } from "@/lib/core/db";
