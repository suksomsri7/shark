# ใบสั่ง R0.2 — ข้อมูล QC + เครื่องมือ (seed · smoke · visual · แม่แบบ wo-notes) · ตรวจ **เบา**

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.2 · `ledger/design-booking/README.md` (+ ภาพ 11/12 สำหรับร้านนวด) · `ledger/design-dorm/README.md` · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): `scripts/qc-svc-r0.2.mts` — 49 ข้อ (F9 · G3 · I5 · O3 · D16 · U4 · SM3 · V6) · รับใบ = **ไม่มี FAIL** · SKIP ที่ยอมได้มีชนิดเดียว: ข้อที่ต้องมี QC server (`V-6`) เมื่อยังไม่มี server — ผู้คุม build+ถ่ายเองตอนรับงาน
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้ามแก้ `src/` และ `prisma/`** · รายงานต่อข้อ (id → ผล)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.2.mts` (ข้อสอบรัน seed เอง 3 รอบ · ห้ามรันขนานกับข้อสอบอื่นที่เขียนฐาน qc-svc)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «scripts/svc-qc-data.mts» (ใหม่) | สัญญาข้อมูล `SQC` (id · slug · อีเมล · ตัวเลขร้าน) — seed/smoke/visual อ่านจากที่นี่ที่เดียว · ห้าม import prisma/`@/…` |
| «scripts/seed-svc-qc.mts» (ใหม่) | seed ร้านตัวอย่าง (§3) · find-or-create + ปรับค่าที่เพี้ยนกลับ |
| «scripts/qc-svc-smoke.mts» (ใหม่) | smoke โครง (§5) · ทุกใบหลังเติมข้อของตัวเอง |
| «scripts/visual-svc.mts» (ใหม่) | ลอกโครง `scripts/visual-crm.mts` / `visual-pos.mts` (§6) |
| «ledger/wo-notes/TEMPLATE-svc.md» (ใหม่) | แม่แบบ wo-notes ของ SVC (ลอก `TEMPLATE-pos.md` ให้ตรงกติกา SVC-RUN §1.4/§2: ข้อสอบใบ · ชุดโมดูลที่แตะ · smoke · fitness 2 โหมด · `PARITY:` · X1–X10 · หนี้) |

## 2. กติกาทั้ง 3 สคริปต์ (seed · smoke · visual)
- บรรทัดแรกที่ทำงาน = `loadSvcQcEnv("<ชื่อ>")` จาก `./svc-qc-env.mts` **ก่อน** `await import("@/lib/core/db")` (ข้อสอบยิง URL ปลอม prod/QC อื่น/host อื่น/`QC_ENV_FILE=.env` ⇒ ต้อง exit 4 · ห้ามพิมพ์ URL/รหัสผ่าน) · ห้ามใช้ `acc-v2-env`/`pos-qc-env`/`.env.qc`
- seed **ไม่ถือ gate lock เอง** (ผู้เรียกครอบ `with-gate-lock.sh` — ซ้อนไฟล์เดียวกัน = ล็อกตัวเอง) · ไม่เรียก `drainAll`
- ไม่แตะแถวของร้านอื่นเลย (ข้อสอบเทียบลายนิ้วมือทุกตารางที่มี `tenantId` ก่อน/หลัง) · ห้าม `deleteMany` ที่ไม่ผูก tenant SVC
- 🔴 ลำดับลบ (ถ้าวันหน้าต้องลบ): `roomOccupancy` ก่อน `hotelRoom` (FK RESTRICT — `ledger/wo-notes/svc-r0.8-carry.md`)

## 3. seed — ข้อมูลที่ต้องได้ (ข้อสอบ D/U ตรวจตามนี้ตรงตัว)
**รันซ้ำ = ไม่มีแถวเพิ่ม และไม่มีการเขียน (`updatedAt` ไม่ขยับ)** · ค่าเพี้ยน (เช่น ราคา/active/rentMode/role) ⇒ รันแล้วกลับเป็นค่าตาม SQC · เงินเป็นสตางค์

### 3.1 ร้าน A — `Tenant{ id "svcqc-tenant", slug "svc-qc", name "SVC QC" }`
| unit id | type | slug | name |
|---|---|---|---|
| `svcqc-unit-barber` | BOOKING | `barber-ari` | บาร์เบอร์ลุงหนวด สาขาอารีย์ |
| `svcqc-unit-massage` | BOOKING | `massage-baitoey` | บ้านนวดใบเตย สุขุมวิท 49 |
| `svcqc-unit-dorm` | DORM | `bansuan-apartment` | บ้านสวนอพาร์ตเมนต์ |
| `svcqc-unit-hotel` | HOTEL | `bansuan-hotel` | บ้านสวน โฮเทล |

ระบบ: `AppSystem` INVENTORY id `svcqc-sys-inv` + POS id `svcqc-sys-pos` ผูก (`sys.linkUnit`) กับ barber + massage

**บาร์เบอร์** (README จองคิว)
- `BookingHours` 7 แถว: weekday 1 (จ.) `closed=true` · วันอื่น 600–1200
- `BookingStaff` 4 แถวพอดี (employeeId null — ผูก HR ภายหลัง) sortOrder = เก้าอี้: ช่างเอก 1 · ช่างบอย 2 · ช่างนุ่น 3 · ช่างแจ๊ค 4 · `BookingStaffHours` เอก/บอย/นุ่น อ.–อา. (weekday ≠ 1) 600–1200 · แจ๊ค อ.–อา. 780–1200
- บริการ 6: ต้นฉบับ = `InvItem` kind SERVICE ใน `svcqc-sys-inv` (`inventory.createItem` · sku ตายตัว) → projection `BookingService` ผ่าน `booking.setServiceOffered` (itemId ชี้ InvItem · ค่าเท่ากัน)

| ชื่อ (ตามภาพ) | นาที | ราคา | มัดจำ |
|---|---|---|---|
| ตัดผมชาย | 45 | 25000 | 0 |
| ตัด + สระ | 60 | 35000 | 0 |
| ตัดเด็ก | 30 | 18000 | 0 |
| โกน/แต่งหนวด | 20 | 12000 | 0 |
| ทำสีผม | 90 | 90000 | 20000 |
| ดัดผม | 120 | 150000 | 30000 |

- % จองออนไลน์ 60/70/50/0 · เวลาเปิด อ.–อา. = เก็บใน SQC เท่านั้น (ไม่มีคอลัมน์ — B.0 ทำเป็นค่าตั้ง · CC §6.1)

**ร้านนวด** (README + ภาพ 11/12)
- `BookingStaff` 6 แถวพอดี: พี่แดง · พี่นก · พี่จันทร์ · น้องฝ้าย · น้องเมย์ · พี่ศรี (ลา = B.1/HR · ไม่ seed)
- บริการ 6 (ทาง InvItem → setServiceOffered แบบเดียวกัน · `bufferMin` = เก็บห้อง)

| ชื่อ | นาที | ราคา | มัดจำ | buffer |
|---|---|---|---|---|
| นวดไทย | 60 | 35000 | 0 | 5 |
| นวดไทย+ประคบ | 120 | 80000 | 0 | 10 |
| นวดเท้า | 60 | 35000 | 0 | 0 |
| น้ำมันอโรมา | 90 | 90000 | 0 | 15 |
| คู่รัก VIP | 90 | 200000 | 50000 | 20 |
| หินร้อน | 90 | 120000 | 30000 | 15 |

- เตียง/ห้อง/โซฟา/ชุดหินร้อน = ยังไม่มีตาราง (`SvcResource` ใบ B.0/B.13) ⇒ เก็บใน SQC รอ · นวดเท้า 30 นาที ฿200 = รอหลายระยะเวลา (B.0) · คอร์สอโรมา 10 ครั้ง ฿7,900 = รอ

**หอ** (README หอ): `RoomBuilding` "อาคาร A" floors 3 · `HotelRoomType` "ห้องมาตรฐาน" (monthlyRateSatang 450000 · areaSqm 24 · rentMode MONTHLY) + "ห้องใหญ่ (หัวมุม)" (520000 · MONTHLY) · `HotelRoom` 36: 101–112 · 201–212 · 301–312 · `floorNo` = ชั้น · `floor` = "1"/"2"/"3" · buildingId = อาคาร A · x01/x12 (6 ห้อง) = ห้องใหญ่ · ที่เหลือ 30 = มาตรฐาน · ส่วนกลาง ฿300 / ประกัน 2 เดือน / ครบกำหนดวันที่ 5 = SQC เท่านั้น (ค่าตั้ง R0.3/D.x)

**โรงแรม** (README หอ): `RoomBuilding` "อาคาร B" floors 2 · `HotelRoomType` rentMode NIGHTLY: "ซูพีเรีย" baseRate 99000 (B101–B104) · "ดีลักซ์" 129000 (B105–B107, B201–B205) · "แฟมิลี" 189000 (B206–B207) · ห้อง 14 floorNo 1/2 ตามเลข · **B205 `HotelRoom.rentMode = "MONTHLY"`** · อีก 13 ห้อง rentMode null · ราคา ศ.–ส. = SQC เท่านั้น
- ไม่มี `RoomOccupancy`/`HotelReservation`/`Appointment` ในใบนี้ (ธุรกรรม = ใบหลังเติม)

### 3.2 ผู้ใช้ร้าน A (id `svcqc-user-<key>` · membership `svcqc-mb-<key>` · อีเมล `svc-qc-<key>@shark.local` · acceptedAt ตั้งแล้ว · 1 membership ต่อคน)
| key | ชื่อ | role | unitAccess | สิทธิ์ขั้นต่ำ (ข้อสอบตรวจ) |
|---|---|---|---|---|
| owner | เจ้าของ (SVC QC) | OWNER | `["*"]` | — |
| manager | ผู้จัดการร้าน (SVC QC) | MANAGER | barber · massage | — |
| ek | ช่างเอก | STAFF | barber | `booking.appointment.setStatus` |
| cashier | แคชเชียร์ (SVC QC) | STAFF | barber · massage | `pos.sale.create` |
| fai | พี่ฝ้าย (ผู้ดูแลหอ) | STAFF | dorm | `hotel.room.setStatus` |
| meter | คนจดมิเตอร์ (SVC QC) | STAFF | dorm | — (`dorm.meter.read` มาใน D.6) |
| accountant | ฝ่ายบัญชี (SVC QC) | STAFF | ทั้ง 4 หน่วย | `account.report.view` |
| frontdesk | ต้อม (หน้าเคาน์เตอร์) | STAFF | hotel | `hotel.reservation.checkIn` |

### 3.3 ร้าน B (เจ้าของคนอื่น — ตรวจข้ามร้าน) `Tenant{ id "svcqc-other-tenant", slug "svc-qc-other" }`
- unit `svcqc-other-unit-barber` BOOKING slug **`barber-ari`** (ซ้ำ slug ร้าน A โดยตั้งใจ) · BookingStaff "ช่างเอก" 1 · BookingService "ตัดผมชาย" 1 (legacy itemId null ได้)
- unit `svcqc-other-unit-hotel` HOTEL slug **`bansuan-hotel`** · ประเภท "ดีลักซ์" 1 · ห้อง "B205" 1
- ผู้ใช้ `svc-qc-other-owner@shark.local` (id `svcqc-other-user-owner`) OWNER `["*"]` ในร้าน B เท่านั้น · ผู้ใช้ร้าน A ไม่มี membership ในร้าน B และกลับกัน

## 4. ความถูกต้องข้ามแถว (ข้อสอบ D-16)
ทุกแถว BookingService/BookingStaff/BookingStaffHours/BookingHours/HotelRoomType/HotelRoom/RoomBuilding ของร้าน SVC: `unitId` เป็นหน่วยของ tenant เดียวกัน · `HotelRoom.roomTypeId`/`buildingId` อยู่หน่วยเดียวกับห้อง · `BookingService.itemId` ชี้ InvItem ของ tenant เดียวกัน

## 5. smoke «scripts/qc-svc-smoke.mts»
- รูปแบบข้อสอบเดียวกับ `qc-svc-r0.1.mts` (✅/❌/⏭️ + `JSON_SUMMARY {total,passed,failed[],skipped[]}` · exit 0 เมื่อไม่มี FAIL/SKIP) · **อ่านอย่างเดียว หรือคืนสภาพใน finally** (ข้อสอบเทียบลายนิ้วมือร้าน SVC ก่อน/หลัง)
- ขั้นต่ำ ≥ 5 ข้อ: ร้าน A มี 4 หน่วย **ชนิดตามตาราง §3.1** (ข้อสอบเปลี่ยนชนิดหน่วย barber ชั่วคราว ⇒ smoke ต้องแดง) · โมดูลจองอ่านช่าง 4/บริการ 6 ของ barber ผ่านฟังก์ชันจริง (`getBookingData` หรือ `serviceRoster`) · ห้องโรงแรม 14 / หอ 36 · ข้ามร้าน: `tenantDb({tenantId: ร้าน B, unitId: svcqc-unit-barber})` อ่านได้ 0 แถว · ด่าน env
- ใบหลังเติมข้อต่อท้าย (คงข้อเดิม)

## 6. visual «scripts/visual-svc.mts»
- `pnpm exec tsx scripts/visual-svc.mts <wo> [--user <key>] [--base http://127.0.0.1:<port>] [--list]`
- **ไม่มี base ปริยาย**: ไม่ส่ง `--base`/`QC_BASE` ⇒ exit 2 · `:3215` ⇒ exit 2 · ต่อ server ไม่ได้ ⇒ exit 2 ภายใน ≤ 30 วิ **ก่อน mint session**
- `--user` รับ: owner manager ek cashier fai meter accountant frontdesk other-owner · อื่น ⇒ exit 2
- `--list` ⇒ พิมพ์บรรทัด `VISUAL_SPECS <JSON [{name,path}]>` ของ wo นั้นแล้ว exit 0 (ไม่ต่อ server · ไม่ mint session)
- wo `r0.2` = หน้าเดิม 3 หน้า: `/app/u/barber-ari/booking` · `/app/u/barber-ari/booking/services` · `/app/u/bansuan-hotel/hotel`
- 1440×900 + 390×844 fullPage → `.qc-shots/svc/<wo>/*.png` · overflow แนวนอน = ❌ exit 1 · HTTP ≥ 400 = ❌
- session ที่ mint: `userAgent` ขึ้นต้น `qc-visual-svc` · ลบเฉพาะแถวของรอบนี้ใน finally (ห้าม `process.exit` ระหว่าง mint/ถ่าย)
- ภาพจริงต้องมี QC server (production build บน `.env.qc-svc`) — builder ห้าม build ⇒ ข้อ V-6 SKIP ได้ · ผู้คุมรันเอง

## 7. เกณฑ์รับ (ผู้คุมรันเอง)
1. `qc-svc-r0.2` ไม่มี FAIL · SKIP ได้เฉพาะ V-6 (ไม่มี server) → แล้วผู้คุม build QC + `QC_BASE=… ` รันซ้ำให้ V-6 ผ่าน
2. `qc-svc-r0.1` ยังเขียว · smoke เขียว · typecheck + fitness 2 โหมด
3. ผู้คุมเปิดภาพ 3 หน้า (ไม่ใช่จอใหม่ — ไม่ต้อง PARITY)

## 8. ห้าม
- แตะ `src/` `prisma/` `scripts/svc-qc-env.mts` `scripts/qc-svc.sh` · ใช้ `.env`/`.env.qc`/ฐานอื่น · สร้าง HR employee/กะ (HR แตะได้จุดเดียวของ B.1) · แก้ `scripts/qc-svc-r0.2.mts`
