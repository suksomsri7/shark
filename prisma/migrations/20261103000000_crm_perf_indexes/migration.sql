-- crm_perf_indexes — CRM v2 ใบ C5.1-fix (ผู้คุมงานอนุมัติ I1 + I2 · F7 ใช้ดัชนีนิพจน์ + GIN ในไฟล์เดียวกัน)
-- additive ล้วน: CREATE INDEX IF NOT EXISTS (ไม่ใช่ CONCURRENTLY — ตาราง CRM บน prod ยังเล็ก · ล็อกการเขียนระหว่างสร้างไม่กี่วินาที)
-- ไม่มี constraint ⇒ สร้างไม่ล้มเพราะแถวเดิม · รันซ้ำได้ (IF NOT EXISTS) — ถ้าสร้างมือบน QC ไปก่อน migrate deploy เป็น no-op
-- ตัวเลขวัด (ร้าน crm-perf-qc · 200k ผู้ติดต่อ · 300k รายการ) อยู่ที่ ledger/wo-notes/crm-C5.1.md

-- I1: รายการผู้ติดต่อ เรียงปริยาย "-createdAt" (contacts.ts SORTS) — เดิม seq scan + sort ทั้งระบบ
CREATE INDEX IF NOT EXISTS "CrmContact_systemId_createdAt_id_idx" ON "CrmContact"("systemId", "createdAt" DESC, "id" DESC);

-- I2: รายการวัตถุกำหนดเอง เรียงปริยาย "-createdAt" (objects.ts) — เดิม seq scan + sort ทั้งวัตถุ
CREATE INDEX IF NOT EXISTS "CustomRecord_objectId_createdAt_id_idx" ON "CustomRecord"("objectId", "createdAt" DESC, "id" DESC);

-- F7a: อีเมลขาเข้า จับคู่ผู้ติดต่อด้วยอีเมลแบบไม่สนตัวพิมพ์ (emails.ts contactByAddress: lower("email") = lower($1))
--   ดัชนีนิพจน์ — schema ของ Prisma เขียนไม่ได้ (ไม่มี @@index บรรทัดคู่) · ผู้ตรวจ C5.1-fix ยืนยันบน QC2: Prisma 7.8 `migrate diff` มองข้ามดัชนีนิพจน์ ("empty migration") ⇒ ไม่เกิด drift · ถ้าเวอร์ชันหน้าเสนอ DROP INDEX นี้ ให้ลบบรรทัดนั้นทิ้ง
CREATE INDEX IF NOT EXISTS "CrmContact_systemId_lower_email_idx" ON "CrmContact"("systemId", lower("email"));

-- F7b: อีเมลเดิมของผู้ติดต่อ (previousEmails && ARRAY[...]) — ทางสำรองของผู้ส่งที่ไม่รู้จัก เดิม seq scan ทุกฉบับ
CREATE INDEX IF NOT EXISTS "CrmContact_previousEmails_idx" ON "CrmContact" USING GIN ("previousEmails");
