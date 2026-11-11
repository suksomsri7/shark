# ใบสั่ง D.19 — รายงานหลักหอ (ลูกหนี้ตามอายุ · อัตราเข้าพักรายเดือน · รายได้แยกประเภท · ส่งออก CSV) · ตรวจ: **เบา (รอบเดียว)** — แต่ **ยอดเงินตรงบัญชี V2 ทุกสตางค์** · X1 ขอบเขตร้าน/หน่วย/อาคาร · X6 CSV กันสูตร **ห้ามตัด**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.19 ("ส่วนพื้นฐาน" — ส่วนลึก ต้นทุนส่วนต่างน้ำไฟ · ผู้เช่าจ่ายช้าซ้ำ · แนวโน้ม 6 เดือน · รายได้ที่เสียจากห้องว่าง = **ใบเลื่อน RP.2** ไม่ทำในใบนี้) · แบบ: `ledger/DESIGN-DORM-HOTEL.md` A10 ("รายงาน: อัตราเข้าพักรายเดือน · รายได้แยกประเภท · ค้างจ่ายตามอายุหนี้ · … · ส่งออก Excel") · ภาพ: `ledger/design-dorm/14-dorm-reports.png` (+ `.body.html`) **เฉพาะส่วนที่ทำ** (การ์ดอัตราเข้าพัก · เก็บแล้ว % · ค้างเกินกำหนด · กราฟ/ตารางรายเดือน · ลูกหนี้ตามอายุ 4 การ์ด "ดึงจากบัญชี V2 (ลูกหนี้)" · ปุ่มส่งออก) — การ์ด "ต้นทุนน้ำไฟที่หอแบก" "รายได้ที่เสียจากห้องว่าง" ตาราง "ผู้เช่าจ่ายช้าซ้ำ" "ต้นทุนน้ำไฟ ต.ค." **ไม่วาด** (ไม่มีตัวเลขปลอม)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1 (ค่าตั้งจากทะเบียน) §8 (คีย์หอ — ไม่มีคีย์รายงาน ⇒ §2 ข้อ 2) + ภาคต่อ · กติกา `ledger/SVC-RUN.md` §1.4 (ใบเบา แต่ "ความถูกต้องเงิน ยอดตรงทุกสตางค์" ห้ามตัด)
> ใบก่อนที่ต้องอ่าน (โค้ดชนะเอกสาร): `svc-brief-d.10.md` §3.1 (**`billBalances` = นิยามยอดค้างเดียว** · `ownOutstandingSatang` vs `dueSatang` · ยกยอดไม่ย้ายลูกหนี้ · ใบเพิ่มหนี้) · `svc-brief-d.11.md` §7.1 (`overdueModel`: daysLate = วันไทย(วันนี้) − วันไทย(dueDate) · ด่าน `dorm.view` + `dormAccess().money`) · `svc-brief-d.8.md` §3 (รอบ/บิล · `DormBill.lines` = snapshot ต่อบรรทัดมี `code` `netSatang` `vatSatang` `grossSatang` · `adjustSentBill` ⇒ ใบลด/เพิ่มหนี้ refType `DormBillAdjust` refId `<billId>:<คีย์>`) · `svc-brief-d.3.md` §2 (VAT ต่อบรรทัด = `computeTotals` · RENT EXEMPT เสมอ) · `svc-brief-d.13.md` §2 ข้อ 4 + §3 (`dormVisibleRoomsFor` · Membership สด · fail closed) §2 ข้อ 9 (ชื่อแรกเท่านั้น) · `src/lib/core/csv.ts` (`csvRow` = ตัวเดียวที่ทุกตัวส่งออกใช้ · `neutralizeFormula`) · `src/lib/modules/dorm/calc.ts` (`occupiedDays` เข้า/ออกนับรวมทั้งสองวัน · `daysInMonth`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.19.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `Q-*` (svcqc ยังไม่มีฉาก D.13) · `V-1` (ไม่มี QC_BASE) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.19.mts [--no-regression]` (ห้ามครอบ `timeout` · ห้าม kill กลางคัน — ล้างข้อมูลใน `finally`) · `APP_URL=https://qc-d19.invalid` ในโพรเซสตัวเอง · บล็อกคำขอออกนอกเครื่อง · ข้อสอบสร้างร้านของตัวเอง (slug `qc-svc-d19-*`) — ฉากเงินผ่าน D.8/D.2/D.10 จริง (ไม่ปลอมแถวบัญชี) ยกเว้นฉาก perf (แถวจำนวนมากด้วย `createMany` — PC-10)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-report-scene.mts»** · temp ขึ้นต้น `svc-d19-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.19` (`SQC_DORM_REPORT_SCENE` + `SQC_VISUAL_SPECS["d.19"]`)
> **ไม่มี migration · ไม่มี event ใหม่ · ไม่มีคีย์สิทธิ์ใหม่ · อ่านอย่างเดียว** (ไม่มี create/update/delete/emitOutbox/audit ในทางรายงาน — W-1 นับแถวก่อน/หลัง)
> ใบที่วิ่งขนานอยู่: **D.12** (ย้ายออก — อาจแตะ `dorm/index.ts` · `defs/rooms.ts` · หน้าแรกหน่วย) ⇒ แก้ไฟล์ร่วมเป็น **บล็อกของตัวเองที่มีคอมเมนต์ `// SVC D.19`** ไม่แก้บรรทัดของใบอื่น

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/` ตอนรับใบ)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/report.ts» | ใหม่ (server) | §3 ทั้งหมด — ผ่าน `tenantDb` (**ห้าม `import { prisma }`** · F5.1) · ยอดค้างจาก `billBalances` (`./balance`) เท่านั้น · ขอบเขตอาคารจาก `dormVisibleRoomsFor`/`dormScopeFor` (`./scope`) · ด่านจาก `dormAccess` (`./access`) + Membership สด · วันไทยจาก `bkkYmd`/`bkkParts` · นับวันจาก `occupiedDays`/`daysInMonth` (`./calc`) · CSV จาก `csvRow` (`@/lib/core/csv`) |
| `src/lib/modules/dorm/index.ts` | แก้ (บล็อกต่อท้าย `// SVC D.19`) | export ชื่อใน §3 (บล็อกของใบอื่นห้ามแตะ) |
| «src/app/app/u/[unitSlug]/dorm/reports/page.tsx» | ใหม่ (server) | จอ §5.1 |
| «src/app/app/u/[unitSlug]/dorm/reports/actions.ts» | ใหม่ `"use server"` | §5.2 |
| «src/components/dorm/DormReports.tsx» | ใหม่ `'use client'` (default export) | §4 |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่มอย่างเดียว · บล็อก `// SVC D.19`) | ค่าตั้ง 2 ตัว §2.1 |
| `src/app/app/u/[unitSlug]/page.tsx` | แก้ 1 บรรทัด | `UNIT_NAV.DORM` เพิ่ม `{ href: "/dorm/reports", label: "รายงาน" }` (แท็บหอล็อกโดย d.13 K-6 = 4 แท็บ — §10 R7) |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` **ถ้า fitness แดงจริง** | คอมเมนต์ `// SVC D.19` (ส่วนใหญ่ไม่ต้อง) |
| «scripts/svc-qc-report-scene.mts» | ใหม่ (builder) | ฉาก svcqc §7 |

**ห้ามแตะ**: `prisma/**` · `src/lib/core/**` นอก `settings/defs/rooms.ts` (รวม `permissions.ts` · `csv.ts` · `rbac.ts`) · `src/lib/modules/account/**` (**ห้ามแก้ `outstandingByContacts`/`agingReport`** — ช่องว่างของบัญชีเป็นหนี้ส่งต่อ §6) · โมดูลหอเดิม `dorm/{balance,billing,dunning,latefee,lease,meter,utility,law,home,policy,access,scope,portal,import*,tax-invoice,account-bridge,calc,parcel,announce,repair}.ts` (เรียกได้ ห้ามแก้) · `src/components/dorm/dorm-home-shared.ts` (แท็บล็อก d.13 K-6) · `src/components/dorm/dorm-policy-shared.ts` (การ์ด 17 ล็อก d.13 R-6/R-7) · `src/app/app/u/[unitSlug]/dorm/layout.tsx` · `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` · `src/lib/platform/**` · ไฟล์ของ D.12 · `any` · `getDay()/getDate()/getMonth()/getHours()/getFullYear()` ดิบ · คำต้องห้าม สคบ.

## 2. มติของใบนี้ (ผู้เขียนข้อสอบเลือก · ผู้คุมเคาะได้ใน §10 · เปลี่ยน = ORACLE-EDIT)

1. **ยอดลูกหนี้ = `billBalances(...).ownOutstandingSatang` ต่อบิล** (นิยามเดียว D.10 · รวมใบเพิ่มหนี้ · หักใบลดหนี้ · ใบแจ้งหนี้ยกเลิก = 0 · **ไม่ใช้ `dueSatang`** เพราะยอดยกมาเป็นป้าย — ลูกหนี้ยังอยู่ที่บิลต้นทาง ⇒ นับซ้ำ) · **ความจริงฝั่งบัญชีที่ข้อสอบเทียบ = GL 1100 (ลูกหนี้) ของเอกสารบิล** = Σ เดบิต − เครดิต ของบรรทัด 1100 ในใบสำคัญที่อ้างเอกสารของบิล (`refType "AccountDocument"` · ใบแจ้งหนี้ + ใบลด/เพิ่มหนี้ + เอกสารที่อ้างใบแจ้งหนี้) + ใบสำคัญของรายการรับชำระของเอกสารเหล่านั้น + ใบกลับรายการ — ข้อสอบ PC-3 พิสูจน์ก่อนว่า GL นี้ = Σ `billBalances` ทุกสัญญาในฉาก (เขียวตั้งแต่ก่อนมีงาน) · ⚠️ ข้อเท็จจริงบัญชี V2 ณ tip (PC-5): (ก) `outstandingByContacts` ที่แถวแผนอ้าง **ไม่หักใบลดหนี้ และไม่นับใบเพิ่มหนี้สถานะ ISSUED** (ข) `agingReport` ไม่นับใบเพิ่มหนี้ ISSUED (ค) **บรรทัด AR ตอนออกใบแจ้งหนี้/ใบลด/เพิ่มหนี้ไม่มี `contactId`** (มีเฉพาะบรรทัดรับชำระ) ⇒ บัญชีย่อยลูกหนี้ "ต่อผู้ติดต่อ" ของ GL ใช้ไม่ได้ ⇒ ทั้งสามอย่างใช้เป็นความจริงไม่ได้เมื่อมีใบลด/เพิ่มหนี้ — **ห้ามเรียกมาเป็นยอดรายงาน** (§10 R1)
2. **ด่าน (X1)** = Membership สด (`acceptedAt` ไม่ null) + หน่วย `DORM` ของ `ctx.tenantId` + `dormAccess(m, unitId).board && .money` (ด่านเดียวกับ `overdueModel` D.11 — "เห็นเงิน") · ไม่ผ่านทุกกรณี ⇒ `{ ok:false, code:"NOT_FOUND", reason: DORM_REPORT_NF_REASON }` **ทุกไบต์เดียวกัน** (ร้านอื่น · หน่วยไม่ใช่ DORM · ไม่มีหน่วย · id ไม่ใช่สตริง · ไม่มีสิทธิ์ · ไม่มีสมาชิกภาพ) · ตรวจด่าน **ก่อน** ตรวจรูปแบบอินพุต · ไม่มีคีย์สิทธิ์ใหม่ (§10 R2)
3. **ขอบเขตอาคาร (#64)**: ทุกฟังก์ชันใช้ห้องที่ `dormVisibleRoomsFor` เห็น (null = ทั้งหน่วย) — ลูกหนี้ (บิลของห้องในขอบเขต) · เข้าพัก (ห้องในขอบเขตทั้งตัวตั้งและตัวหาร) · รายได้ (บิลของห้องในขอบเขต) · CSV · ขอบเขตว่าง ⇒ `ok:true` ยอด 0 ทุกตัว (ไม่ใช่ NOT_FOUND)
4. **อายุหนี้**: `daysLate = วันไทย(now) − dueDate` (วันปฏิทิน · แบบ `overdueModel`) · ถังเดียวกับบัญชี V2 `agingBucket`: ≤ 0 `notDue` · 1–30 · 31–60 · 61–90 · > 90 · `dueDate` null ⇒ `notDue` · ทุกเอกสารของบิล (ใบแจ้งหนี้ + ใบเพิ่มหนี้) ใช้ `dueDate` ของบิล · จอแสดง 4 การ์ดตามภาพ ("เกิน 60 วัน" = 61–90 + > 90) · ข้อมูล/CSV เก็บ 5 ถัง
5. **ยอดเป็น "ตอนนี้"** (ไม่มี asOf ย้อนหลัง — `billBalances` อ่านสด) · `opts.now` มีผลกับการนับวันเท่านั้น · บิลที่นับ = `DormBill` ของหน่วย สถานะ `SENT|PARTIALLY_PAID|PAID` (**รวม PAID** — ใบเพิ่มหนี้ที่ออกหลังจ่ายครบไม่เปลี่ยนสถานะบิล) · บิลไม่มีเอกสารบัญชี (`accountDocumentId` null · ฉาก svcqc) = `total − paid` ตามนิยามเดิม + นับแยกใน `noDocSatang`
6. **อัตราเข้าพัก = ห้อง-วันที่มีผู้เช่า ÷ ห้อง-วันทั้งหมด** ต่อเดือนปฏิทินไทย · **ที่มา = `DormLease`** สถานะ `ACTIVE|NOTICE|ENDED` (`DRAFT`/`CANCELLED` ไม่นับ) · วันเข้า = `startDate` · วันออก (นับรวม): `ENDED` ⇒ `DormMoveOut.moveOutDate` (ถ้ามีและไม่ `CANCELLED`) ไม่งั้นวันไทยของ `endedAt` · `ACTIVE|NOTICE` ⇒ ยังอยู่ (ไม่ดู `endDate`) · ห้องเดียวกันหลายสัญญาวันเดียวกัน = นับ 1 (union ต่อห้อง) · ตัวหาร = ห้อง `active` ของหน่วยในขอบเขต × จำนวนวันที่นับ · เดือนปัจจุบันนับถึงวันนี้ไทย (รวมวันนี้) · เดือนอนาคต `days = 0` · `rateBp = round_half_up(occupied × 10000 / roomDays)` (0 เมื่อ roomDays 0) · ค่าเฉลี่ยช่วง = Σ occupied ÷ Σ roomDays (ถ่วงวัน) · **ไม่ใช้ `RoomOccupancy`** (D.12 อาจปล่อยแถวตอนย้ายออก ⇒ ประวัติหาย — §10 R3)
7. **รายได้แยกประเภท = ตามงวดบิล (`periodKey`)** จากบิลที่ "ลงบัญชีแล้ว": บิล `SENT|PARTIALLY_PAID|PAID` ที่ใบแจ้งหนี้ยังมีผล (ไม่ `DRAFT|VOIDED|CANCELLED`) — **ใบแจ้งหนี้ถูกยกเลิก ⇒ ไม่นับทั้งบิล** · บิลไม่มีเอกสาร = นับ + `noDocBills` · ประเภทจาก `DormBill.lines[].code`: `RENT` `COMMON` `ELEC` `WATER` `LATE_FEE` ตรงตัว · อื่นทั้งหมด (`SERVICE:*` · บรรทัดเพิ่ม `OTHER` · …) ⇒ `OTHER` · ยอดต่อบรรทัด `netSatang`/`vatSatang`/`grossSatang` ของบรรทัด (= `computeTotals` D.3) · **`ADJUST`** = Σ ใบเพิ่มหนี้ − Σ ใบลดหนี้ที่มีผล (`refType "DormBillAdjust"` · บิลจาก refId ก่อน `:`) ใส่งวดของบิลนั้น (subTotal / vatAmount / grandTotal ของเอกสาร · ติดลบได้) — แยกประเภทของใบปรับยอดไม่ได้เพราะบรรทัดบัญชีไม่เก็บ code (§10 R4) · `collectedSatang` ต่องวด = Σ `billPaidSatang` ของบิลที่นับ (นิยามเดียว D.10) · **VAT ชัดทุกแถว**: net (ไม่รวม VAT) · vat · gross (รวม VAT) และ `net + vat = gross`
8. **CSV ("ส่งออก Excel")**: UTF-8 มี BOM (`﻿`) · ทุกแถวผ่าน `csvRow` (กันสูตร X6) · เงินเป็นบาททศนิยม 2 ตำแหน่ง (สตริงตัวเลขล้วน เช่น `4800.00` `-50.00` — `neutralizeFormula` ไม่แตะตัวเลขล้วน) · ชื่อผู้เช่า = **ชื่อแรกเท่านั้น** · ไม่มีเบอร์ · `filename` ASCII ลงท้าย `.csv` · ไม่ใช่ .xlsx (§10 R5) · แถวข้อมูล > `rooms.report.exportMaxRows` ⇒ `TOO_LARGE` (ไม่มีไฟล์ครึ่ง ๆ) · ช่วงเดือนเกิน `rooms.report.maxMonths` ⇒ `INVALID_INPUT`
9. **ชื่อ/PII**: แถวลูกหนี้แสดงชื่อแรกของ Party (มติ D.13 ข้อ 9) · ไม่มีเบอร์/นามสกุล/อีเมลใน DTO/HTML/CSV
10. **อ่านอย่างเดียว**: ไม่มี `create/createMany/update/updateMany/upsert/delete/deleteMany/$executeRaw/emitOutbox/auditLog` ในทางรายงาน · ไม่เขียน ServiceMessageLog/SettingValue · ไม่มี event
11. **perf (ฉาก P: 300 ห้อง × 12 งวด = 3,600 บิล + 3,600 ใบแจ้งหนี้)**: `dormAgingReport` + `dormOccupancyReport(12 เดือน)` + `dormRevenueReport(12 เดือน)` รวม **≤ 10 วิ** · CSV `AGING` (3,600 แถว) + `REVENUE` รวม **≤ 10 วิ** (ดีที่สุดใน 2 รอบ · ฐาน QC Neon) — เหตุผล: เป็นการโหลดหน้าเดียว/ปุ่มเดียว ต้องจบในงบฟังก์ชันเซิร์ฟเวอร์ (≤ 10–15 วิ) · Neon RTT ~30–80 ms ⇒ เพดาน 10 วิ ยอมได้ ~100 รอบคิวรี + คำนวณในหน่วยความจำ · ถ้าคิวรีต่อบิล/ต่อสัญญา (N+1: 3,600 × ~40 ms ≈ 144 วิ) จะตกชัด ๆ เป็นสิบเท่า · คิวรีชุด (`ANY($ids)` · `billBalances` ทั้งชุดครั้งเดียว) ผ่านสบาย

### 2.1 ค่าตั้งใหม่ (`defs/rooms.ts` · ชั้น **TENANT เท่านั้น** — เพดานความปลอดภัยของร้าน ไม่ใช่นโยบายหน่วย ⇒ ไม่ขึ้นการ์ดหน้า 17 · d.13 R-7 ไม่กระทบ)
| คีย์ | ชนิด | ป้ายไทย (ตัวอย่าง) | schema | ค่าเริ่ม |
|---|---|---|---|---|
| `rooms.report.exportMaxRows` | `int` | แถวสูงสุดต่อไฟล์ส่งออกรายงานหอ | `z.number().int().min(1).max(50000)` | 5000 |
| `rooms.report.maxMonths` | `int` | ช่วงรายงานหอยาวสุด (เดือน) | `z.number().int().min(1).max(36)` | 24 |
- `chain: ["TENANT"]` (ค่าคงที่ `T` ในไฟล์) · group `report` (จาก key) · `helpTh` ไทย · อ่านต่อคำขอ (`resolveSettings` · refs `{ unitId }`) · **ห้ามฝังเลข 5000 / 24** ใน report.ts (S-5)

## 3. สัญญาโค้ด — export จาก `@/lib/modules/dorm` (ข้อสอบเรียกตามชื่อ/ฟิลด์นี้)

```ts
export const DORM_REPORT_NF_REASON: string;  // ข้อความไทยเดียว เช่น "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ดูรายงานการเงินของหอ"
export const DORM_REVENUE_TYPES: readonly ["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE", "OTHER", "ADJUST"];
export type DormRevenueType = (typeof DORM_REVENUE_TYPES)[number];
export type DormReportCtx = { tenantId: string; actorUserId: string };
export type DormReportFailCode = "NOT_FOUND" | "INVALID_INPUT" | "TOO_LARGE";
export type DormReportFail = { ok: false; code: DormReportFailCode; reason: string };
export type DormAgingBucket = "notDue" | "d1_30" | "d31_60" | "d61_90" | "d90plus";
export type DormAgingBuckets = { notDueSatang: number; d1_30Satang: number; d31_60Satang: number; d61_90Satang: number; d90plusSatang: number; totalSatang: number };
export type DormAgingBill = { billId: string; periodKey: string; dueDate: string | null /* YYYY-MM-DD */; daysLate: number; bucket: DormAgingBucket; outstandingSatang: number; hasDoc: boolean };
export type DormAgingRow = { leaseId: string; partyId: string; roomId: string; roomNumber: string; buildingId: string | null; tenantFirstName: string | null; buckets: DormAgingBuckets; bills: DormAgingBill[] };
export type DormAgingReport = { asOf: string /* วันไทย */; buckets: DormAgingBuckets; rows: DormAgingRow[]; noDocSatang: number };
export type DormOccupancyMonth = { month: string /* YYYY-MM */; rooms: number; days: number; roomDays: number; occupiedRoomDays: number; rateBp: number };
export type DormOccupancyReport = { months: DormOccupancyMonth[]; averageBp: number };
export type DormMoney3 = { netSatang: number; vatSatang: number; grossSatang: number };
export type DormRevenueMonth = { periodKey: string; bills: number; noDocBills: number; types: Record<DormRevenueType, DormMoney3>; total: DormMoney3; collectedSatang: number };
export type DormRevenueReport = { months: DormRevenueMonth[]; grand: { types: Record<DormRevenueType, DormMoney3>; total: DormMoney3; collectedSatang: number } };
export type DormReportRange = "MONTH" | "6M" | "YEAR";
export type DormReportModel = {
  unitId: string; unitName: string; range: DormReportRange; fromMonth: string; toMonth: string; asOf: string;
  aging: DormAgingReport; occupancy: DormOccupancyReport; revenue: DormRevenueReport;
  kpi: {
    occupancyAvgBp: number;                 // = occupancy.averageBp
    occupancyCurrentBp: number;             // = rateBp ของเดือน toMonth
    collected: { periodKey: string; billedGrossSatang: number; collectedSatang: number; rateBp: number }; // งวด toMonth: billed = total.gross · rateBp ปัดครึ่งขึ้น (0 เมื่อ billed 0)
    overdue: { satang: number; rooms: number }; // Σ ถัง 1–30..>90 ของ aging · rooms = จำนวนแถวที่มียอดเลยกำหนด > 0
  };
};
```
### 3.1 `dormAgingReport(ctx: DormReportCtx, i: { unitId: string }, opts?: { now?: Date }) → Promise<({ ok: true } & DormAgingReport) | DormReportFail>`
- ด่าน §2 ข้อ 2 → ห้องในขอบเขต → บิลตาม §2 ข้อ 5 → `billBalances` **ครั้งเดียวทั้งชุด** → `own > 0` เท่านั้นเข้าแถว · `rows` = สัญญาที่ Σ > 0 เรียงเลขห้อง (ตัวเลขก่อน · `localeCompare` numeric) · `bills` เรียงงวด · `buckets` รวม = Σ แถว · `asOf` = วันไทยของ now
### 3.2 `dormOccupancyReport(ctx, i: { unitId: string; fromMonth: string; toMonth: string }, opts?: { now?: Date }) → Promise<({ ok: true } & DormOccupancyReport) | DormReportFail>`
- `YYYY-MM` ทั้งคู่ · `from ≤ to` · `to ≤ เดือนถัดไปของวันนี้ไทย` · จำนวนเดือน ≤ `rooms.report.maxMonths` ⇒ ไม่ผ่าน `INVALID_INPUT` · คืนทุกเดือนในช่วง (เรียง · เดือนไม่มีผู้เช่า = 0) · §2 ข้อ 6
### 3.3 `dormRevenueReport(ctx, i: { unitId: string; fromMonth: string; toMonth: string }, opts?: { now?: Date }) → Promise<({ ok: true } & DormRevenueReport) | DormReportFail>`
- ตรวจช่วงเหมือน 3.2 · คืนทุกงวดในช่วง (งวดไม่มีบิล = ศูนย์ทุกช่อง · `types` มีครบ 7 คีย์เสมอ) · §2 ข้อ 7 · `grand` = Σ ทุกงวด
### 3.4 `dormReportModel(ctx, i: { unitId: string; range?: DormReportRange }, opts?: { now?: Date }) → Promise<({ ok: true } & DormReportModel) | DormReportFail>`
- `range` ค่าเริ่ม `"6M"` · `MONTH` = เดือนนี้ไทย · `6M` = เดือนนี้ −5 … เดือนนี้ · `YEAR` = ม.ค. ของปีนี้ไทย … เดือนนี้ · ช่วงยาวกว่า `maxMonths` ⇒ ตัดต้นช่วงให้พอดี (ไม่ error) · ค่าอื่น ⇒ `INVALID_INPUT` · `aging`/`occupancy`/`revenue` = ผลเดียวกับ 3.1–3.3 ของช่วงนั้นทุกไบต์ (ยกเว้น `ok`)
### 3.5 `dormReportCsv(ctx, i: { unitId: string; kind: "AGING" | "OCCUPANCY" | "REVENUE"; fromMonth?: string; toMonth?: string }, opts?: { now?: Date }) → Promise<{ ok: true; filename: string; csv: string; rows: number } | DormReportFail>`
- `AGING` (ไม่ใช้ช่วง): 1 แถวต่อบิลที่ค้าง · คอลัมน์ `ห้อง, ผู้เช่า, งวด, ครบกำหนด, เลยกำหนด (วัน), อายุหนี้, ค้าง (บาท)` · `OCCUPANCY`: `เดือน, ห้อง, วัน, ห้อง-วัน, ห้อง-วันที่มีผู้เช่า, อัตราเข้าพัก (%)` (เปอร์เซ็นต์ 2 ตำแหน่งจาก rateBp) · `REVENUE`: 1 แถวต่อ (งวด × ประเภท) ครบ 7 ประเภท `งวด, ประเภท, ไม่รวม VAT (บาท), VAT (บาท), รวม VAT (บาท)` · ช่วงค่าเริ่ม = ช่วง `6M` · `rows` = จำนวนแถวข้อมูล (ไม่นับหัว) · ด่าน/ขอบเขต/ช่วงเหมือนกัน

## 4. สัญญา DOM — «DormReports.tsx» (`'use client'` บรรทัดแรก · default export · props `{ model: <ผลสำเร็จของ dormReportModel>; unitSlug: string; actions: { exportCsv: (kind, fromMonth, toMonth) => Promise<…> } }` · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` · `renderToStaticMarkup` ได้)
- ราก `data-dorm-reports` + `data-from="<fromMonth>"` + `data-to="<toMonth>"` · หัว "รายงานหอ"
- ช่วง: `a[data-range="MONTH|6M|YEAR"]` ป้าย "เดือนนี้" "6 เดือน" "ปีนี้" (`href` `?range=…`) · ตัวที่เลือก `aria-current="page"`
- KPI: `[data-report-kpi="occupancy"]` (เปอร์เซ็นต์ 1 ตำแหน่งจาก `occupancyAvgBp` เช่น "90.7%") · `[data-report-kpi="collected"]` ("เก็บแล้ว 76.9%" + "฿133,912.80 จาก ฿174,126.40") · `[data-report-kpi="overdue"]` ("฿10,200.40" + "N ห้อง")
- รายเดือน: `[data-report-month="<YYYY-MM>"]` ต่อเดือนของช่วง + `data-occupancy-bp="<rateBp>"` (ยอดบิลรวม VAT ของงวดนั้นในแถว)
- ลูกหนี้: 4 การ์ด `[data-aging-bucket="notDue|d1_30|d31_60|d60plus"]` เงินรูป "฿10,200.40" (d60plus = d61_90 + d90plus) · ข้อความ "ดึงจากบัญชี V2" · แถว `[data-aging-row="<leaseId>"]` (เลขห้อง · ชื่อแรก · ยอด)
- รายได้: แถว `[data-revenue-row="<periodKey>"]` · เซลล์ `[data-rev="<TYPE>|TOTAL"]` (รวม VAT) · หัวตารางมีคำ "ไม่รวม VAT" และ "รวม VAT" · แถวรวมมี net / VAT / gross แยกช่อง `[data-rev-total="net|vat|gross"]`
- ส่งออก: ปุ่ม `[data-report-export="AGING|OCCUPANCY|REVENUE"]` ข้อความมี "Excel" (เช่น "ส่งออก Excel (CSV)") · ≥ 44px
- รูปตัวเลข (ข้อสอบ U ผูก): เงิน = `฿` + คั่นหลักพัน + 2 ตำแหน่ง (`฿10,200.40` · ศูนย์ = `฿0.00` · ติดลบ = `-฿300.00`) · ทุกเซลล์ `data-rev` แสดงเงินเสมอแม้เป็น 0 · เปอร์เซ็นต์ = `(bp / 100).toFixed(1)` + `%`
- **HTML ไม่มี**: เบอร์ · นามสกุล · อีเมล · `private://` · ตัวเลขของส่วน RP.2

## 5. หน้า
1. `/app/u/[unitSlug]/dorm/reports` (server · `export const dynamic = "force-dynamic"`): `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `range` จาก `searchParams` (ค่าไม่รู้จัก ⇒ `6M`) · `dormReportModel(...)` ไม่ ok ⇒ `notFound()` · ส่ง action
2. actions.ts `"use server"` · export async function เท่านั้น: `exportDormReportCsvAction(unitSlug: string, kind: string, fromMonth: string | null, toMonth: string | null)` — ร้าน/ผู้กระทำจาก session (`requireUnit` → `auth.active`) เท่านั้น · **ไม่รับ tenantId/unitId/actorUserId จาก client** · คืน `{ ok, filename, csv }` หรือ `{ ok:false, reason }` (จอสร้าง Blob ดาวน์โหลด) · ไม่ `revalidatePath` (อ่านอย่างเดียว)

## 6. ส่วนที่ไม่ใช่ของใบนี้ / หนี้ส่งต่อ
- **RP.2**: ต้นทุนส่วนต่างน้ำไฟ (ส่วนกลาง+ห้องว่าง) · ผู้เช่าจ่ายช้าซ้ำ · แนวโน้ม 6 เดือน · รายได้ที่เสียจากห้องว่าง · ห้องว่างนาน · .xlsx จริง · แยกประเภทของใบลด/เพิ่มหนี้ (ต้องเก็บ code ในบรรทัดบัญชี) · ลูกหนี้ ณ วันที่ย้อนหลัง · เงินรับล่วงหน้า 2110 ต่อผู้เช่า · รายงานพัสดุค้าง
- **หนี้บัญชี (แจ้งเจ้าของโมดูลบัญชี · ไม่ทำในใบนี้)**: `outstandingByContacts`/`outstandingBothByContacts` ไม่หักใบลดหนี้ · ไม่นับใบเพิ่มหนี้ ISSUED · `agingReport` ไม่นับใบเพิ่มหนี้ ISSUED (ป้าย "ค้างรับ" ในฟอร์มเอกสาร/CRM สูงหรือต่ำกว่าจริง) · บรรทัด AR ตอนออกเอกสาร (`gl.ts` ใบแจ้งหนี้/ใบลดหนี้/ใบเพิ่มหนี้) ไม่ใส่ `contactId` ⇒ งบลูกหนี้รายตัวจาก GL ผิด (ขัด M8) — หลักฐาน PC-5
- หนี้: หน้าตั้งค่าระดับร้านของ `rooms.report.*` (ตอนนี้แก้ได้ทางเครื่องยนต์ค่าตั้งเท่านั้น) · ชั้น ROOM_TYPE/อาคารในรายงาน · กราฟแท่งจริง (ใบนี้ = แถบ CSS/ตาราง)

## 7. ฉาก svcqc «scripts/svc-qc-report-scene.mts» (builder · ค่าจาก `SQC_DORM_REPORT_SCENE` เท่านั้น)
- ต้องมีฉาก D.13 ก่อน (หน่วยหอ svcqc · สัญญา ACTIVE ≥ 1 · บิลงวด P/PP ของ mark `SvcQcScene`) · ไม่พร้อม ⇒ exit 3 + เหตุผล
- เดือนนี้ไทย M · งวดประวัติ = M + `historyOffsets` (−5 … −2 · **ไม่ชน** PP = M−1 · M = ฉาก D.8 · P = M+1) · ต่องวด: `DormBillRun` (status `SENT` · `createdById = SQC_DORM_REPORT_SCENE.mark`) + `DormBill` ต่อสัญญา ACTIVE ของหน่วยที่ `startDate ≤ วันสุดท้ายของงวด`: `lines` = สำเนาบรรทัดของบิลงวด P ของสัญญานั้น (ไม่มี ⇒ RENT + COMMON จากสัญญา `netSatang = grossSatang = amount` · `taxKind` EXEMPT/NONE) · ยอดรวมจากบรรทัด · `status "PAID"` · `paidSatang = totalSatang` · `paidAt` = วันที่ 4 ของงวด 12:00 ไทย · `dueDate` = วันที่ 5 ของงวด · `accountDocumentId null`
- **ไม่เขียน SettingValue ใด ๆ** (ฉาก 17 ของ D.13 นับ "ปรับจากแม่แบบ 4 ข้อ") · ไม่ยิง event/ข้อความ/เอกสารบัญชี · ไม่แตะรอบ/บิลของฉากอื่น
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะรอบ+บิลของ mark นี้
- ภาพ: `SQC_VISUAL_SPECS["d.19"]` = `/app/u/<หอ svcqc>/dorm/reports` (`6M`) · ถ่าย `--user owner` · ลำดับก่อนถ่าย: roomboard → lease → billing (D.8) → dorm-home (D.13) → report (D.19)

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.19.mts»
S โครงสร้าง/ไฟล์/ค่าตั้ง/ชิ้นเดิม/อ่านอย่างเดียว (static) · PC ตัวควบคุม (เขียวก่อนมีงาน: ฉากเงินผ่าน D.8 · GL 1100 ของเอกสารบิล = billBalances · ยอดต่อเอกสารอิสระ = billBalances · ข้อเท็จจริง outstandingByContacts/agingReport · บรรทัดบิล = ยอดใบแจ้งหนี้ · ขอบเขตอาคาร · csvRow) · A ลูกหนี้ (= GL ทุกสตางค์ · ถัง · บางส่วน · ใบลดหนี้ · ใบเพิ่มหนี้หลังจ่ายครบ · ยกเลิก · ยกยอด · จ่ายเกิน · ขอบวันไทย · สมุดร่วม 2 หน่วย · หอ VAT · อ่านสด) · O เข้าพัก (ขอบเดือนไทย · ย้ายออก · ส่งต่อวันเดียวกัน · DRAFT/CANCELLED · ห้องปิด · เดือนปัจจุบัน/อนาคต · ค่าเฉลี่ยถ่วงวัน · ขอบเขตอาคาร) · R รายได้ (ต่อประเภท = บรรทัดบิล · ADJUST = DN − CN · รวม = บัญชี · ใบยกเลิก · VAT ชัด · เก็บแล้ว · ช่วง) · M โมเดลจอ (ช่วง · KPI · เท่ากับฟังก์ชันย่อย) · E ส่งออก (BOM · ยอดตรง · กันสูตร X6 · เพดานจากค่าตั้ง · ชื่อแรก · ขอบเขต) · X ด่าน (ไม่พบเดียวกัน · ขอบเขตอาคาร · Membership สด · ร้าน B) · W อ่านอย่างเดียว · P perf · U DOM · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression
- regression (G · หลังล้างข้อมูล): `qc-svc-d.8 --no-regression` · `qc-svc-d.10 --no-regression` (S-1/S-2 ของ d.10 = "ไฟล์ของใบ D.10" ไม่นับ) · `qc-svc-d.11 --no-regression` · `qc-svc-smoke`
- ผู้คุม: typecheck + fitness 2 โหมด · ตรวจรอบเดียว (อ่าน diff เอง หรือ Sonnet 1 ตัว) — **ผู้ตรวจต้องยิง probe X1 (ร้านอื่น/ผู้ดูแลอาคารอื่น/ผู้ไม่มีคีย์เงิน) + X6 (ชื่อ/เลขห้องเป็นสูตร) + ยอดเงิน (ใบลดหนี้บางส่วน + ใบเพิ่มหนี้ ISSUED + รับชำระแล้วยกเลิก ⇒ = GL 1100)**

## 9. X ที่เกี่ยว
X1 (X-1 X-2 X-4 X-5 · ไม่พบเดียวกัน · ขอบเขตอาคาร) · X6 (E-2 CSV กันสูตร · เพดานแถว) · X8 (A-8 E-5 U-2 ไม่มีเบอร์/นามสกุล · ชื่อแรก) · ไม่เกี่ยว: X3/X4/X5 (อ่านอย่างเดียว ไม่มีตัวนับ/consumer/งานตามเวลา) · X7 (ไม่มี endpoint สาธารณะ) · X9 (ไม่มีการกระทำอันตราย) · X10 (ไม่มีไฟล์ส่วนตัว)

## 10. คำขอให้ผู้คุมเคาะ (ค่าปลอดภัยใช้ไปก่อน · ข้อสอบเขียนตามค่าปลอดภัย)
- **R1 ความจริงฝั่งบัญชี**: แถวแผนเขียน "`outstandingByContacts`" แต่ฟังก์ชันนั้นไม่หักใบลดหนี้/ไม่นับใบเพิ่มหนี้ ISSUED และบัญชีย่อย GL ต่อผู้ติดต่อขาด `contactId` ที่บรรทัดออกเอกสาร (PC-5) ⇒ ค่าปลอดภัย = เทียบ **GL 1100 ของเอกสารบิล** (ใบสำคัญอ้างเอกสาร + รับชำระ + กลับรายการ · §2 ข้อ 1) — สูตรเดียวกับงบ ไม่ขึ้นกับ `billBalances` · ข้อสอบยืนยันด้วยว่า `outstandingByContacts` = GL เมื่อไม่มีใบลด/เพิ่มหนี้ (PC-5 ข้อเท็จจริง) · ทางเลือก: ใบแก้บัญชี (นอกขอบเขต RUN · แตะบัญชี V2): `outstandingByContacts` หักใบลดหนี้ + นับ DN ISSUED · ใส่ `contactId` ในบรรทัด AR ตอนออกเอกสาร (gl.ts 609/687/694) — PC-5 จะแดงเมื่อบัญชีแก้ ⇒ ผู้คุมทบทวน
- **R2 สิทธิ์**: ไม่มีคีย์รายงานใน CC §8/planned ⇒ ค่าปลอดภัย = `dorm.view` + เห็นเงิน (`dormAccess.money` — แบบ D.11 overdue) ไม่เพิ่มคีย์ · ทางเลือก: คีย์ใหม่ `dorm.report.view` + แถวในตารางบทบาท (ต้อง ORACLE-EDIT d.13 K-3 "11 แถว")
- **R3 ที่มาอัตราเข้าพัก** = `DormLease` (+ `DormMoveOut.moveOutDate`) ไม่ใช่ `RoomOccupancy` · วันออกนับเป็นวันเข้าพัก (ตาม `occupiedDays` D.1) · ห้อง BLOCK/ซ่อมยังอยู่ในตัวหาร (ภาพ 01: 31/36 = 86% นับห้องซ่อมในตัวหาร)
- **R4 ADJUST**: ใบลด/เพิ่มหนี้เป็นประเภทแยก "ปรับยอด" (บรรทัดบัญชีไม่มี code) · ทางเลือก: แยก LATE_FEE ส่วนหนึ่งจาก audit `dorm.bill.adjusted.after.lateFeeSatang` (ไม่แม่นเรื่อง VAT)
- **R5 "Excel"** = CSV UTF-8 + BOM (Excel เปิดภาษาไทยได้) · .xlsx = RP.2
- **R6 ค่าตั้งเพดาน** ชั้น TENANT (ไม่ขึ้นหน้า 17) · ทางเลือก: ชั้น UNIT + การ์ดใหม่ในหน้า 17 (ORACLE-EDIT d.13 R-6/R-7)
- **R7 ทางเข้าจอ** = ลิงก์ใน `UNIT_NAV.DORM` (แท็บหอล็อก 4 แท็บ d.13 K-6 — แบบ D.18 R8)
- **R8 รายได้ตามงวดบิล** (`periodKey`) ไม่ใช่วันที่ออกเอกสาร (เจ้าของคิดเป็น "บิล พ.ย.") · ADJUST ใส่งวดของบิลที่ถูกปรับ
- **R9 ฉาก svcqc** ไม่มีเอกสารบัญชี (ฉาก D.13 เป็นแถวบิลตรง) ⇒ บนภาพ "ดึงจากบัญชี V2" แสดงยอดจาก `billBalances` สาขาไม่มีเอกสาร — ความถูกต้องเทียบบัญชีพิสูจน์ในร้านทดสอบของข้อสอบ (A-*)
- **R10 perf** เกณฑ์ §2 ข้อ 11 (≤ 10 วิ · 300 × 12) — ใบแผนไม่ได้ติด perf แต่ผู้สั่งขอ · ใช้แถวสร้างด้วย `createMany` (ไม่ผ่าน D.8) เพื่อให้ข้อสอบจบในเวลา

## 11. คำถามกฎหมาย/บัญชี (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J4: รายงานรายได้ตามงวดบิล vs จุดรับรู้รายได้ทางบัญชี (ออกใบแจ้งหนี้ล่วงหน้า 26 ต.ค. สำหรับงวด พ.ย.) — ใช้ตัวเลขไหนยื่นภาษี (ภ.พ.30 ใช้ของบัญชี V2 อยู่แล้ว · รายงานหอเป็นข้อมูลบริหาร)
- J5: ไฟล์ส่งออกลูกหนี้มีชื่อผู้เช่า (ชื่อแรก) + เลขห้อง + ยอดค้าง = ข้อมูลส่วนบุคคล — ต้องบันทึกการส่งออก (audit) ไหม (ใบนี้: ไม่บันทึก · อ่านอย่างเดียว)

## มติผู้คุม (31 ต.ค. 2569)
- R1 ✅ ความจริงฝั่งบัญชี = GL 1100 ของเอกสารบิล (PC-3 พิสูจน์ = billBalances) · ⚠️ บั๊กบัญชี V2 (นอก SVC): `outstandingByContacts` ไม่หักใบลดหนี้ + ไม่นับใบเพิ่มหนี้ ISSUED · `agingReport` ไม่นับใบเพิ่มหนี้ ISSUED · บรรทัด 1100 ตอนออกเอกสารไม่มี contactId ⇒ จดใน SVC-OWNER-QUESTIONS + หนี้ §3.2 (ใบแก้โมดูลบัญชีแยก)
- R2 ✅ dorm.view + dormAccess().money (ไม่เพิ่มคีย์) · R3 ✅ จาก DormLease + DormMoveOut · R4 ✅ ADJUST · R5 ✅ CSV UTF-8+BOM (.xlsx → RP.2)
- R6 ✅ exportMaxRows 5000 / maxMonths 24 ระดับ TENANT · R7 ✅ UNIT_NAV.DORM · R8 ✅ ตามงวดบิล · R9 ✅ · R10 ✅ ≤ 10 วิ (300×12)
