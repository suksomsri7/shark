# T0.8 — บันทึกใบสั่ง (ผู้เดินทาง / เอกสาร / ความยินยอม / ลบข้อมูล PDPA)

## สรุปการรับ (ผู้คุม 13 พ.ย. 2569)
- รับที่ merge `8954ae8c8` (เลน l3 tip `fccb81112`) · 5 รอบสร้าง (r1–r5) · ผู้ตรวจ 3 รอบ (`scratchpad/t0.8-review/REVIEW{,-R2,-R3}.md`) · นักล่า (`t0.8-hunt/HUNT{,-NEXT}.md`) · ผู้เขียนข้อสอบแยก +25 ข้อ (กลุ่ม ER · MN · PJ · PQ-7)
- ด่านเลน `/root/trips-runs/gate-t0.8/`: t0.8 160/160 · probe a 112/112 · b 23/23 · nokey 7/7 · fitness 54/54 ×2 · typecheck 0 · ข้อขอบเขตของชุดอื่นแดงบนเลนตามคาด (เขียวหลัง merge)
- ฐานหลัก `/root/trips-runs/post-t0.8/`: seed ×2 ไม่เขียน · t0.8 160/160 · t0.7 150/150 · a1.1 125/125 · t1.2 97/97 · t1.1 100/100 · t0.6 126/126 · t0.5 130/130 · t0.4 110/110 · t0.3 116/116 · t0.2 84/84 · t0.1 96/96 · fitness 54/54 · probe a 112/112 · b 23/23 · nokey 7/7 · typecheck 0
- ORACLE-EDIT (ผู้คุม): S-8 (booking-core เทียบ session/trips · อนุญาต export `text` 1 บรรทัด)
- ข้อสอบข้ามเพราะบังคับให้เกิดแน่นอนไม่ได้: เพดานเวลา 3 วินาทีข้ามหลายหน่วย · phase ที่ fetch โยน · รหัส `ERASE_FINISH_FAILED` ตรง ๆ · สาขา "แพ้การแข่ง idempotency" ของอัปโหลด
- **หนี้ส่งต่อ:** (1) ดัชนี `TripPdpaRequest (status, dueAt)` สำหรับสแกนข้ามร้าน + ดัชนีงานลบที่จดไว้รอบ r3 (ใบ migration L1.1) (2) ตัวกันแจ้งซ้ำ 24 ชม. ใช้นาฬิกาจริงไม่ใช่ `now` ของงาน (3) `probe-trips-t0.8-next` ต้องมีเซิร์ฟเวอร์ ไม่อยู่ในด่าน (4) W1.3 ต้องคิดกุญแจอุปกรณ์ฝั่งเซิร์ฟเวอร์ · ตัวจำกัด OTP ของข้อมูลสุขภาพต้อง fail closed (5) URL ไฟล์ของพนักงานใช้ได้ ≤ 300 วินาทีหลังทำเครื่องหมายลบ (6) OQ23 (ถ้อยคำยินยอม/ทนาย) ยังรอเจ้าของ

## r5 (มติผู้คุม: คำขอ ERASE สถานะ RECEIVED เลยกำหนดต้องแจ้งเตือน)
- แก้: `runPdpaPurge` (`src/lib/modules/trips/jobs.ts`) เพิ่มสาขาสแกน (ซ) — หน่วยที่มีคำขอ `ERASE` สถานะ `RECEIVED`/`IN_PROGRESS` ที่ `dueAt < now` ถูกค้นพบและไปถึงขั้นแจ้ง ops ใน `pdpa.ts` (`trips.pdpa` ERROR · detail = `{unitId, pendingObjects, overdueEraseRequests}` · ไม่เกินวันละครั้งต่อหน่วย — ไม่เปลี่ยน) · งานไม่แตะคำขอ `RECEIVED` (ขั้น 5 เลือกเฉพาะ `IN_PROGRESS`) · ไม่มี migration
- ดัชนีที่ใช้: `TripPdpaRequest_tenantId_status_dueAt_idx` (tenantId, status, dueAt) — ใช้ได้เต็มเมื่อเรียกแบบมีตัวกรองร้าน (`opts.tenantIds`)
- หนี้ (ดัชนีขาด): รอบงานจริงสแกนข้ามร้าน (ไม่มี tenantId นำ) ⇒ สาขา (ซ) และสาขา (ฉ) เดิมอ่านทั้งตาราง `TripPdpaRequest` · ตอนนี้ยอมรับได้เพราะตารางเล็ก (1 แถวต่อคำขอของเจ้าของข้อมูล) และผลถูกยุบเป็นหน่วย · ถ้าตารางโต ควรเพิ่มดัชนีบางส่วน `("status", "dueAt") WHERE "kind" = 'ERASE' AND "status" IN ('RECEIVED','IN_PROGRESS')` ใน migration ของใบถัดไป
