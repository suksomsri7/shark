# trips-T0.3 — รอบเดินทาง · กฎซ้ำ · ทรัพยากร · ขั้นต่ำ · เวลาปิดรับ (✅ 12 พ.ย. 2569 · merge 8e9b616dd)

- ของที่ได้: `src/lib/modules/trips/{departures,departures-core,resources,departure-actions,jobs}.ts` · งานตามเวลา `trips.generateDepartures` (รายวัน) + `trips.minPaxCheck` (15 นาที) · สิทธิ์ 4 คีย์ · event 4 ตัว · seed: ทรัพยากร 10 · กฎรอบ 3 · รอบ 21 (สัปดาห์ 11–17 พ.ย.)
- รอบ: สร้าง 108/116 (กลุ่ม seed รอ T0.2) → ผู้ตรวจ FIX FIRST (1 BLOCKER · 5 MAJOR) + นักล่า FIX FIRST (2 BLOCKER · 4 MAJOR) → r2 (A–I + รวม T0.2) → ผู้ตรวจ r2: ปิดครบ เหลือ N1 → r3 (5 ข้อ) · **r3 ไม่ได้ผ่านผู้ตรวจรอบสาม** (ด่านผู้คุม + สคริปต์ตรวจของผู้สร้าง) — สูตรสถานะร่วมจะถูกทดสอบจริงด้วยข้อสอบ T0.4 (ถือ/ปล่อยที่พร้อมกัน)
- **ด่านผู้คุม @cefb366fe (เลน l1)**: seed ×2 · t0.3 115/116 + t0.2 83/84 (S-13/S-10 = ORACLE-EDIT S-8 ของผู้คุม หายเมื่อ merge) · t0.1 96/96 · p0.1 56/56 · SVC r0.3 94/94 · smoke 6/6 · probe นักล่า edge/conc/scale · fitness 53/53 ×2 · typecheck 0 → **หลัง merge บนฐานหลัก: seed ×2 · t0.3 116/116 · t0.2 84/84 · t0.1 96/96**
- ORACLE-EDIT: t0.1 S-8 (fitness baseline ≤ 51 แทนห้ามแก้ไฟล์) · fitness F5 50→51 (`trips/jobs.ts`)
- X: X1 (7 + 22 ฟังก์ชันของนักล่า) · X3 (ความจุ/ทรัพยากร/สร้างรอบขนาน) · X5 (งานซ้อน = ครั้งเดียว) · X9 · X8

## ของที่ T0.4 ต้องใช้ (จาก facade ของ trips)
- `departureStatusAfterCountersSql(c, {setFull})` + `departureGuaranteedAtAfterCountersSql(c, {setFull, nowIso})` โดย `c = {capacity, used, sold}` = **ค่าหลังเปลี่ยน** (SET ของ Postgres เห็นค่าเก่า) — T0.4 ส่ง `setFull: true` · ตัวอย่างการเรียกอยู่ใน doc comment · `departureCountersUnchangedSql(capacity)` สำหรับกรณีตัวนับไม่เปลี่ยน
- ลำดับล็อก: สินค้า (FOR SHARE ผ่าน `assertProductSellableInTx`) → กฎรอบ → รอบ → ทรัพยากร (เรียง id) → การใช้ทรัพยากร
- `trips/jobs.ts` มีอยู่แล้ว (T0.4 เพิ่มงานของตัวเองในบล็อกแยก · try/catch ต่อร้าน + `failed[]` ตามแบบ)

## มติที่จดไว้
- สินค้า ARCHIVED / ตัวเลือกปิด ⇒ สร้างกฎรอบ/รอบไม่ได้ (`PRODUCT_ARCHIVED` / `OPTION_INACTIVE`) · รอบที่ยกเลิกแล้วจบ · GUARANTEED ไม่ถอย (เว้นพนักงานถอนเอง) · เปิดรอบ CLOSED กลับมา: เคยยืนยัน ⇒ GUARANTEED · FULL→GUARANTEED เมื่อ `guaranteedAt` ตั้งอยู่ หรือ sold ≥ minPax (แม้ก่อนเวลาตัดสิน) · ปิดใช้ทรัพยากรไม่ได้ขณะมีรอบอนาคต/กฎที่เปิดอยู่อ้างถึง · ปุ่มสร้างรอบจากจอ ≤ 2 ชุด (31 วัน/ชุด) ต่อคำขอ

## หนี้
- ค่าตั้งอ่านก่อนเปิด tx ของแต่ละชุดวัน (ค้างได้ ≤ 1 ชุด · ระบบค่าตั้งไม่มีตัวอ่านใน tx) · อ่าน `SettingValue` ตรงผ่าน tenantDb เพื่อหา "รอบที่มีแถวค่าตั้ง" (หนี้แพลตฟอร์ม: ควรมีฟังก์ชันใน facade ค่าตั้ง)
- `listDepartures` ไม่มีเพดานแถว (T1.2 ใส่) · สร้างรอบครั้งแรก ~8 คิวรี/รอบ (730 วัน + 2 ทรัพยากร ≈ 135 วิ ในงานรายวัน) · ไม่มี index บางส่วนของ `startsAt` สำหรับรอบ OPEN ที่มีขั้นต่ำ
- probe `scripts/probe-trips-t0.3-mat.mts` ของนักล่ารันตามเดิมไม่ได้แล้ว (บล็อก a2 ถือล็อกกฎรอบเองแล้วเรียก pause ซึ่งต้องล็อกเดียวกัน) — ต้องแก้ probe ก่อนใช้เป็น regression
