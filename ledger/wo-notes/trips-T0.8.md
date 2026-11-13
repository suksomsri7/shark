# T0.8 — บันทึกใบสั่ง (ผู้เดินทาง / ลบข้อมูล PDPA)

## r5 (มติผู้คุม: คำขอ ERASE สถานะ RECEIVED เลยกำหนดต้องแจ้งเตือน)
- แก้: `runPdpaPurge` (`src/lib/modules/trips/jobs.ts`) เพิ่มสาขาสแกน (ซ) — หน่วยที่มีคำขอ `ERASE` สถานะ `RECEIVED`/`IN_PROGRESS` ที่ `dueAt < now` ถูกค้นพบและไปถึงขั้นแจ้ง ops ใน `pdpa.ts` (`trips.pdpa` ERROR · detail = `{unitId, pendingObjects, overdueEraseRequests}` · ไม่เกินวันละครั้งต่อหน่วย — ไม่เปลี่ยน) · งานไม่แตะคำขอ `RECEIVED` (ขั้น 5 เลือกเฉพาะ `IN_PROGRESS`) · ไม่มี migration
- ดัชนีที่ใช้: `TripPdpaRequest_tenantId_status_dueAt_idx` (tenantId, status, dueAt) — ใช้ได้เต็มเมื่อเรียกแบบมีตัวกรองร้าน (`opts.tenantIds`)
- หนี้ (ดัชนีขาด): รอบงานจริงสแกนข้ามร้าน (ไม่มี tenantId นำ) ⇒ สาขา (ซ) และสาขา (ฉ) เดิมอ่านทั้งตาราง `TripPdpaRequest` · ตอนนี้ยอมรับได้เพราะตารางเล็ก (1 แถวต่อคำขอของเจ้าของข้อมูล) และผลถูกยุบเป็นหน่วย · ถ้าตารางโต ควรเพิ่มดัชนีบางส่วน `("status", "dueAt") WHERE "kind" = 'ERASE' AND "status" IN ('RECEIVED','IN_PROGRESS')` ใน migration ของใบถัดไป
