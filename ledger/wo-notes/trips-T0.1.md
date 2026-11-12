# trips-T0.1 — migration trips + ทะเบียนค่าตั้งโดเมน trips + กฎทัวร์ (✅ 12 พ.ย. 2569 · merge 836080029)

- ของที่ได้: migration `20270201000000_trips_enum` (ADD VALUE 4) + `20270201000100_trips` (1,070 บรรทัด · 34 ตารางใหม่ · `AccountDocument.passThroughSatang`) · `prisma/schema/trips.prisma` `sellable.prisma` · ค่าตั้ง trips 104 คีย์ × 4 แม่แบบ · scope ใหม่ · `legal/th-tour-2569.ts` (สูงสุด WARN) · severity + ป้ายนักบัญชี + รับทราบไม่ต้องมีเหตุผล (เฉพาะ trips/agency/ticket) · `core/sellable.ts` · สิทธิ์ `trips.settings.edit/.money`
- รอบ: สร้าง 94/96 → ORACLE-EDIT T-4 F-1 → ผู้ตรวจ FIX FIRST (4 MAJOR) + นักล่า FIX FIRST (1 MAJOR: เกินเพดานพารามิเตอร์ที่ ~16,400 รอบ) → r2 (+คอลัมน์จาก T0.2–T0.5) → ORACLE-EDIT U-1 M-4 R-9 RS-4 S-12 → ผู้ตรวจ r2 MERGE → r3 (ลำดับ settingsDiff · แยกบริบททัวร์ · tenantId ใน EXCLUDE)
- **ด่านผู้คุม @0ef49c129 (เลน l1)**: oracle 96/96 · probe นักล่า 4 ชุด (20k/40k รอบ RESET_ALL เหลือ 0) · fitness 53/53 ×2 · typecheck 0 · SVC r0.3 94/94 · r0.4 45/46 (VIS-2 ข้ามได้) · d.1 122/122 · smoke 6/6 · b.0 แดง 4 (M-1 G-7 G-8 G-9) **เท่ากับทรีก่อนแก้** → **หลัง merge บนฐานหลัก: oracle 96/96** · migration ลงฐานหลัก + l1 + l2 แล้ว
- X: X1 (กลุ่ม X1 + tenantDb 34 ตารางของนักล่า) · X3 (SellCounter 50/200 ขนาน · บันทึกค่าตั้ง 20 ขนาน) · X9 (WARN ต้องรับทราบ) · อื่น ๆ ยังไม่เกี่ยว
- รายงาน: `trips-T0.1-review.md` · `-review-r2.md` · `-hunt.md` · log ด่าน `/root/trips-runs/gate-t0.1/` (+`-r2/`) · probe ถาวร `scripts/probe-trips-t0.1-*.mts`

## สำหรับวันขึ้น production (HANDOVER)
- ลง 2 migration ตามลำดับ · `_trips` มี `SET lock_timeout='5s'` ก่อน ALTER `AccountDocument` — ถ้าชน timeout: `prisma migrate resolve --rolled-back 20270201000100_trips` แล้วลองใหม่ช่วงเงียบ
- 🔴 `prisma migrate diff` จะเสนอ `DROP INDEX` ของ unique NULLS NOT DISTINCT 3 ตัว (`TripDeparture_productId_optionId_startsAt_key` · `TripPrice_dims_key` · `TripLinkStat_unitId_day_channel_linkId_key`) ทุกครั้ง — **ห้ามรับ** (ใบ A1.1/K1.1/L1.1 ต้องลบบรรทัดนี้ออกจาก SQL ที่ได้)

## หนี้
- ยังไม่ได้ดูจอค่าตั้งจริง (ป้าย/ลำดับคำเตือน/ติ๊กรับทราบ) — ถ่ายภาพคู่กับจอ 17 ในใบ T1.1
- คำเตือน HIGHEST บังคับติ๊กแยกข้อเฉพาะฝั่ง client · `unitTypes:["TRIPS"]` กรองแค่ในฟอร์ม (setSettings ยังเขียนคีย์ trips ลงหน่วยชนิดอื่นได้ เหมือน HOTEL/DORM เดิม) · `PARK_SCHEMA` อ่านนาฬิกา (W29 FUTURE_DATE ไปไม่ถึงจากหน้าค่าตั้ง) · legalCode เก็บรหัสเดียวเมื่อสองกฎเข้า
- T0.3 ต้องถือว่าระยะเวลา ≤ 0 = `NO_DURATION` (CHECK `endsAt > startsAt`) · ใบที่จองทรัพยากรต้องตรวจว่าทรัพยากรเป็นของร้านก่อน
- ORACLE-EDIT RS-4 ทำให้ข้อนั้นอ่อนลง (ตรวจแค่ไม่มีของร้านอื่น) — การคืนครบเมื่อมีแถวพึ่ง probe scale
