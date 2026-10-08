-- HR H0.5 — PIN เก็บเป็น hash + PIN ไม่ซ้ำทั้งร้าน (migration แรกของ RUN HR V2)
--
-- เพิ่มคอลัมน์อย่างเดียว (additive): โค้ดเก่าไม่อ่านคอลัมน์ใหม่ ⇒ deploy ก่อน/หลังโค้ดก็ไม่พัง · "pinCode" ยังอยู่ (ลบใน RUN ถัดไป)
--   "pinHash"  = hex HMAC-SHA256(key = HR_PIN_PEPPER, msg = tenantId + U+001F + pin) — คำนวณที่ src/lib/modules/hr/pin.ts ที่เดียว
--   "pinSetAt" = เวลาที่ตั้ง PIN ล่าสุด
--
-- partial unique: PIN (hash) ไม่ซ้ำ "ทั้งร้าน" (ข้ามทุกระบบ HR) เฉพาะคนที่ยังทำงาน (active = true)
--   · คนพ้นสภาพไม่อยู่ในดัชนี ⇒ ปล่อย PIN ให้คนอื่นใช้ได้ · กลับมาทำงานแล้วชน = โค้ดล้าง PIN ของคนที่กลับมา (ต้องตั้งใหม่)
--   · ดัชนีเป็นผู้ตัดสินตัวเดียว (กันแข่งกันตั้ง PIN พร้อมกัน) — ไม่มีการ select ตรวจซ้ำก่อนเขียน
--   · Prisma schema ประกาศ WHERE ไม่ได้ ⇒ ประกาศที่นี่ด้วย SQL ดิบ (แบบเดียวกับ 20261102000000_crm_v2_c)
--   · แถวเดิมทุกแถวมี "pinHash" = NULL ⇒ ไม่เข้าดัชนี สร้างได้ไม่มีทางชน
--
-- ลำดับ rollout บน prod (runbook ใน ledger/wo-notes/hr-H0.5.md):
--   0 เจ้าของตั้ง HR_PIN_PEPPER ใน Vercel → 1 deploy (migration นี้ + โค้ด) → 2 scripts/hr-backfill-pin-hash.mts dry-run →
--   เจ้าของได้รายชื่อ PIN ซ้ำ → --apply (แปลง PIN ตัวเปล่าเป็น hash แล้วลบตัวเปล่า · PIN ซ้ำถูกล้างให้ตั้งใหม่) → 3 ตรวจว่าไม่เหลือ PIN ตัวเปล่า

-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN "pinHash" TEXT, ADD COLUMN "pinSetAt" TIMESTAMP(3);

-- CreateIndex (partial unique — ดูหัวไฟล์)
CREATE UNIQUE INDEX "HrEmployee_tenantId_pinHash_active_key" ON "HrEmployee"("tenantId","pinHash") WHERE "active" = true AND "pinHash" IS NOT NULL;
