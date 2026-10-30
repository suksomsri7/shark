# SVC — เช็กลิสต์ deploy prod (สะสมจากผู้ตรวจ)
- migration ทุกไฟล์ของ SVC (svc_r0 · svc_r0b · svc_b · …) Prisma 7.8 รัน **ทีละคำสั่ง ไม่ใช่ tx เดียว** และคำสั่งส่วนใหญ่ไม่มี IF NOT EXISTS ⇒ ล้มกลางไฟล์ = P3009 · ขั้นกู้: ดูว่าคำสั่งไหนลงแล้ว (pg_catalog) → รันที่เหลือด้วยมือ → `prisma migrate resolve --applied <ชื่อ>` (แบบ runbook P6.1)
- deploy ช่วงคนน้อย · ก่อน push เช็ก `pg_stat_activity` ไม่มี query/tx ยาวบน PosSaleLine/Appointment (ADD COLUMN ต้องรอล็อก · ไม่มี lock_timeout)
- btree_gist บน prod: role ใน DIRECT_URL ต้องเป็น owner (neon_superuser) และ pg_available_extensions มี btree_gist
- ลำดับ: migrate deploy ก่อน next build (vercel-build.sh ทำอยู่แล้ว) · enum ใหม่ (DORM · QUEUED/IN_SERVICE/LATE) ลงก่อน client ที่เขียนค่า
- backfill occupancy โรงแรมเดิม `--apply` ทุกร้าน conflicts=0 ก่อนเปิด DORM/ผังห้อง
- env ใหม่: INTEGRATIONS_CREDENTIALS_KEY (≥32 ตัว · ไม่มีกุญแจสำรอง) · ห้ามตั้ง INTEGRATIONS_FAKE / LINE_API_BASE บน prod
- ใบหลังที่ใส่ CHECK บนตารางใหญ่: ใช้ NOT VALID แล้ว VALIDATE CONSTRAINT แยกคำสั่ง
- (D.0) `migrate diff --from-config-datasource` จะเสนอ `DROP INDEX "DormUtilityRate_unitId_buildingId_kind_periodKey_key"` (NULLS NOT DISTINCT ที่ Prisma ไม่รู้จัก) — **ห้ามรับบรรทัดนี้** ในใบ migration ถัดไป · ก่อนสร้าง unique STAY/idempotencyKey บน prod รัน SQL ตรวจซ้ำในคอมเมนต์ของ migration svc_d ก่อน

## B.4 queue.housekeeping (29 ต.ค.)
- งานรายนาที `queue.housekeeping` เรียก resetDaily/expireSkipped ซึ่งบน prod ไม่เคยถูกเรียก ⇒ รอบแรกหลัง deploy จะยกเลิก/ปิดบัตรคิวเก่าค้างของทุกร้านแบบไม่มี event · ก่อนเปิด: นับบัตรค้างต่อร้าน (dry-run) แจ้งเจ้าของ · deploy ช่วงเงียบ

- 🔴 (D.3 · 29 ต.ค.) unique index `AccountDocument_taxinvoice_source_uniq` (systemId, sourceDocId · TAX_INVOICE ที่มีผล ไม่มี sourcePaymentId) มีในฐาน QC แต่ไม่พบใน prisma/migrations ⇒ ตรวจ prod ก่อน deploy · ถ้าไม่มี ต้องสร้าง (โค้ดออกใบแทนพึ่ง index นี้)
- 🔴 (B.7 · 29 ต.ค.) จองออนไลน์ (B.7) เปิดให้ลูกค้าจริงพร้อม B.8 มัดจำเท่านั้น — นัดที่ถือช่องมัดจำหมดเวลาใน 15 นาทีถ้ายังไม่มีทางจ่าย
