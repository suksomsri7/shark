# ใบสั่ง D.12 — ย้ายออก · ย้ายห้อง · ต่อสัญญา + คืนเงินประกัน · ตรวจ **เข้ม** (เงิน · สคบ. · ข้อมูลข้ามร้าน)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.12 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` A9 (ย้ายออก/คืนประกัน) + A2 (ต่อสัญญา/ย้ายห้อง) + ภาคผนวก ก หอ #46–49 · ภาพ `ledger/design-dorm/07-moveout-deposit.png` (+ `.body.html` · README "ห้อง 207 ธนพล … ฿9,000 − 594.72 − 96.00 − 350 − 200 = ฿7,759.28")
> สัญญากลาง: CC §1.6 (snapshot) §1.7 (ตัวตรวจกฎหมาย) §4.4 (`notifyCustomer`) §5.3 (`resizeOccupancy` `moveOccupancy` `claimRoom`) §6.2 (`settleSecurityDeposit`) §7 (event) §8 (`dorm.moveout.manage` `dorm.deposit.deduct.approve`) + ภาคต่อ 28 ต.ค.
> ส่งต่อจากใบก่อน (อ่านก่อนเขียน): **D.5** ใบสั่ง §2.2 (endDate รวมวันจบ · occupancy ไม่รวม) §3.10 K1 (รุ่น InTx · ลำดับล็อก advisory สัญญา → Tenant · ห้าม connection ที่สอง) · `/root/svc-runs/fix/d5.md` (หนี้: คืน/ริบเงินจอง · สัญญาไม่มีวันจบ) · **D.8** §9 มติ 5 (สัญญาที่มี DormMoveOut ไม่ CANCELLED และ `moveOutDate ≤ สิ้นเดือนค่าห้อง` ⇒ รอบบิลข้าม · คิดในใบย้ายออก) + ส่งต่อ "ค่าห้อง/น้ำไฟเศษเดือน · เดือนสุดท้ายหักค่าเช่าล่วงหน้า" · `/root/svc-runs/fix/d8.md` (จองบิล · ref idempotent · CAS · 40P01 ⇒ BUSY) · **D.11** มติ 5 (ค่าปรับของสัญญาที่ไม่มีบิลปลายทาง ⇒ ใบย้ายออก) + `/root/svc-runs/fix/d11.md` (ล็อก `dorm.latefee:<leaseId>`) · **D.3** `/root/svc-runs/fix/d3.md` (ส่วน VAT ของใบย้ายออก) · **D.9** (เลน l2 · `ledger/svc-briefs/svc-brief-d.9.md` §3.0 นิยาม live · Q4: เลย endDate = ไม่ live · หนี้ D.13 "สัญญาเลยวันจบแต่ยังมีคนอยู่") · **D.13** (todo หน้าแรก · ตารางสิทธิ์ "หักประกัน" ผู้ดูแล = ขออนุมัติ)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.12.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.12.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally · G รันหลังล้าง) · `--no-regression` ข้ามหมวด G · SKIP ที่ยอมได้ระหว่างทำ = V-1 (ไม่มี QC_BASE) · Q-* (svcqc ยังไม่มีฉากก่อนหน้า) · G-* (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**`** · temp ขึ้นต้น `svc-d12-` · รายงานต่อข้อ (id → ผล) · **ไม่มี migration** — สถานะทั้งหมดอยู่ในคอลัมน์ของ D.0 (`DormMoveOut.*` · `DormLease.previousLeaseId/endReason/endedAt`) + รูปทรง JSON §2.4 · ขาดอะไร = หยุดถามผู้คุม

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/moveout.ts» | ใหม่ (server) | §3 แจ้งย้ายออก · ตรวจห้อง · ไฟล์หลักฐาน · สรุปเงิน · ส่งให้ผู้เช่า (ตรึง) · เปิดใบสรุปใหม่ · ปิดประกัน · โมเดลจอ · งานตามเวลา — ผ่าน `tenantDb` + `runDormMoneyTx` (ห้าม `import { prisma }` · F5.1) |
| «src/lib/modules/dorm/lease-change.ts» | ใหม่ (server) | §4 ย้ายห้อง · ต่อสัญญา · `depositLeaseIdOf` (ต้นสายประกัน) |
| «src/lib/modules/dorm/moveout-access.ts» | ใหม่ (pure · import ได้แค่ `@/lib/core/rbac`) | `moveOutAccess(m, unitId) → { manage: boolean; approve: boolean; lease: boolean }` (manage = `dorm.moveout.manage` · approve = `dorm.deposit.deduct.approve` · lease = `dorm.lease.manage`) |
| `src/lib/modules/dorm/index.ts` | แก้ | บล็อก export ของใบนี้ต่อท้าย (บล็อกใบอื่นห้ามแตะ) |
| `src/lib/modules/dorm/lease.ts` | แก้ **1 เรื่อง** (คอมเมนต์ `// SVC D.12`) | ยอดถือ/ใบรับประกัน (`getLease.heldSatang` `receipts` · `listLeases.heldSatang` `heldTotalSatang`) อ่านตาม **ต้นสายประกัน** `depositLeaseIdOf` (§4.1) — สัญญาที่สายเดียวกันนับยอดครั้งเดียว · พฤติกรรมอื่นของ D.5 ห้ามเปลี่ยน (G d.5) |
| `src/lib/modules/dorm/latefee.ts` | แก้ **1 จุด** | `waiveLateFee`: ใต้ล็อก `dorm.latefee:<leaseId>` เดิม — สัญญามี DormMoveOut ที่ **ตรึงแล้ว** (§2.3) หรือปิดแล้ว ⇒ `MOVEOUT_FROZEN` (ไม่บันทึกอะไร) |
| `src/lib/modules/dorm/home.ts` | แก้ (เพิ่มอย่างเดียว) | todo ใหม่ 2 ชนิดต่อท้ายลำดับเดิม: `expired` (สัญญา ACTIVE ที่ `endDate < วันนี้` ไม่มีสัญญาต่อ/ไม่มีใบย้ายออก — หนี้ D.9 Q4) · `refundDue` (ใบย้ายออกที่ยังไม่คืนเงิน + `moveOutDate ≤ วันนี้`) · `DormHomeTodoKind` เพิ่ม 2 ค่า · ข้อความไทยมีเลขห้อง · href `…/dorm/moveout?room=<เลข>` / `…/dorm/tenants?tab=CURRENT` |
| `src/lib/modules/account/index.ts` + `service.ts` | แก้ (เพิ่มอย่างเดียว · **รอมติ R1**) | `settleSecurityDepositInTx(tx, input)` = ตรรกะเดียวกับ `dormSettleSecurityDeposit` แต่ใช้ tx ของผู้เรียก (แยกตัวในเป็นฟังก์ชันรับ tx แล้วให้ของเดิมเรียกผ่าน `prisma.$transaction` เหมือนเดิมทุกไบต์ — แบบ D.5 K1) · ห้ามเพิ่มทางเงินอื่น · G `qc-svc-d.2` ต้องเขียวเท่าเดิม |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่มอย่างเดียว · บล็อก `// SVC D.12`) | §2.2 def ใหม่ 2 ตัว — #46–49 เดิมห้ามเปลี่ยน |
| `src/lib/core/permissions.ts` | แก้ | เอา `dorm.moveout.manage` `dorm.deposit.deduct.approve` ออกจาก `planned` |
| `src/lib/modules/approval/labels.ts` · `src/lib/modules/approval/actions.ts` | แก้ 1 บรรทัดต่อไฟล์ | entityType `dorm.moveout.deduction` ป้าย "หักเงินประกันเกินวงเงิน (หอพัก)" + allowlist — **ไม่มีกิ่งใน approval-effects** (ปิดประกันอ่านสถานะสดเอง แบบ D.5) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` (+ `webhooks/labels.ts` ถ้าไม่ได้จาก spread) | แก้ | event 4 ตัว §6 (consumer `withAutomation(async () => {})` · ป้ายไทย) |
| `src/lib/platform/minute-jobs.ts` | แก้ | งาน `dorm.moveout` ทุก 15 นาที (import facade ตอนรัน · เรียก `runDormMoveOutJobs`) |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` ที่ใช้จริง | คอมเมนต์ `// SVC D.12` |
| «src/components/dorm/MoveOutScreen.tsx» | ใหม่ `'use client'` | จอ 07 §7 (render ได้ด้วย `renderToStaticMarkup` · ไม่ import prisma/โมดูล server/actions/`next/*` — ยกเว้น `import type`) |
| «src/app/app/u/[unitSlug]/dorm/moveout/page.tsx» | ใหม่ (server) | §7.2 |
| «src/app/app/u/[unitSlug]/dorm/moveout/actions.ts» | ใหม่ `"use server"` | §7.3 |
| «scripts/svc-qc-moveout-scene.mts» | ใหม่ | ฉากภาพ §8 |

ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อกท้าย "SVC D.12" (`SQC_DORM_MOVEOUT_SCENE` · `SQC_VISUAL_SPECS["d.12"]`)

ห้าม: migration · แก้ `calc.ts` `law.ts` `utility.ts` `meter.ts` `billing.ts` `dunning.ts` `tax-invoice.ts` `account-bridge.ts` (ใช้ตามที่มี) · แตะ `rooms/*` `party/*` `approval/service.ts` `platform/notify-customer.ts` · **ทางเงินใหม่** (ห้ามเรียก `postSecurityDeposit*` `recordExternalPayment` `applyExternal*` `reverseEntry` `reverseSecurityDepositSettlement` จากไฟล์ของใบ — เงินออกจากประกันได้ทาง `settleSecurityDeposit(InTx)` ทางเดียว · ค่าใช้จ่ายวันออกเป็น **ใบแจ้งหนี้** `createExternalInvoice` · แก้ใบสรุปเป็น **ใบลดหนี้** `createExternalCreditNote`) · ลบ/แก้ทับเอกสารหรือ JV · `any` · `getDay()/getDate()/getMonth()` ดิบ (ใช้ `bkkYmd`/`bkkParts`) · ยิงเงินขนาน (`Promise.all`/`map(async)` ครอบ facade บัญชี) · ข้อความ/ปุ่ม ตัดน้ำไฟ ล็อกห้อง ยึดของ · ตัวเลือก "หักค่าเสื่อมปกติ" ในจอ

## 2. ศัพท์ · มติ
### 2.1 สถานะ (CHECK ของ D.0 · ไม่เพิ่มค่า)
- `DormMoveOut.status`: `NOTICE` (แจ้งแล้ว) → `INSPECTED` (บันทึกตรวจห้อง+มิเตอร์วันออก) → ปิด: `REFUNDED` (ปิดประกันแล้ว มียอดคืน > 0 — JV ปิดลง Cr เงินคืนในตัว) **หรือ** `SETTLED` (ปิดแล้ว ยอดคืน = 0 — ไม่มีประกัน หรือหักหมด/ผู้เช่าค้าง) · `CANCELLED` (ยกเลิกการแจ้ง — แถวเดิมใช้ซ้ำเมื่อแจ้งใหม่ · `leaseId` unique)
- `DormLease.status`: `ACTIVE` → `NOTICE` (มีใบย้ายออก) → `ENDED` เมื่อ **วันย้ายออกผ่านไปแล้ว** (งานตามเวลา) หรือเมื่อปิดประกัน (อันไหนก่อน) — `endReason` ∈ `MOVED_OUT` `TRANSFER` `RENEWED` · `endedAt` ไม่ null ⇒ D.9 ตัดพอร์ทัล/LINE (นิยาม live ของ D.9) · **การคืนประกันเป็นงานหลังจบสัญญา** (ไม่ทำให้สัญญาค้าง NOTICE)
### 2.2 ค่าตั้ง
ค่าเดิม (#46–49 · ห้ามเปลี่ยนนิยาม): `rooms.moveout.noticeDays` (30 · **อ่านจาก snapshot สัญญา**) · `rooms.deposit.returnDays` (7 · **snapshot สัญญา** · ตัวตรวจ `DEPOSIT_RETURN_DAYS`) · `rooms.deposit.approvalThreshold` (฿2,000 · **ค่าปัจจุบันของหน่วย** ณ ตอนตรึง) · `rooms.deposit.damageCatalog` (ค่าปัจจุบันของหน่วย)
ใหม่ (บล็อก `// SVC D.12`):
| คีย์ | ชนิด | ค่าเริ่ม | ชั้น | หมายเหตุ |
|---|---|---|---|---|
| `rooms.moveout.checklist` | table `[{ key: /^[a-z0-9_]{1,24}$/, labelTh ≤ 60 }]` ≤ 30 | 5 แถวตามภาพ 07: `wall` "ผนัง · สี" · `screen` "มุ้งลวดหน้าต่าง" · `keys` "กุญแจห้อง" · `appliance` "แอร์ · ตู้เย็น · ทีวี" · `furniture` "เฟอร์นิเจอร์" | UNIT | รายการตั้งต้นของจอตรวจห้อง (เพิ่มรายการเองได้ตอนตรวจ) |
| `rooms.msg.moveOutSummary` | template (ผ่าน `tpl(...)` · `TEMPLATE_NO_THREAT`) | ไทย/อังกฤษสุภาพ: ห้อง · วันย้ายออก · ประกัน · รายการหัก · ยอดคืน · กำหนดคืน | UNIT | ตัวแปร `tenantName roomNo unitName moveOutDate depositAmount deductAmount refundAmount owesAmount refundDueDate lines` · ไม่มีคำขู่ |
### 2.3 มติผู้เขียนข้อสอบ (ส่งผู้คุม · J3/J4)
1. **ไม่มี migration** · ใบย้ายออก 1 แถว/สัญญา (`leaseId` unique) · ข้อมูลตรวจ/ไฟล์/มิเตอร์/การตรึงอยู่ใน `inspection`/`deductions` (§2.4)
2. **ประกันไม่ย้ายเงินเมื่อย้ายห้อง/ต่อสัญญา (ต้นสายประกัน)**: สัญญาใหม่ชี้ `previousLeaseId` · ประกันยังอยู่ที่ ref GL ของสัญญา **ต้นสาย** (ตัวแรกสุดในสาย `previousLeaseId` ร้าน/หน่วย/ผู้เช่าเดียวกัน) · ทุกการอ่านยอดถือ/ปิดประกันใช้ `depositLeaseIdOf(leaseId)` ⇒ **ไม่มี JV ใหม่ ไม่มีทางเงินใหม่ ประกันไม่ซ้อน** (ผู้เช่าไม่ต้องโอนออก-โอนเข้า) · ย้ายห้องข้ามหน่วย = ไม่รองรับ (`NOT_FOUND`)
3. **ใบแจ้งหนี้วันย้ายออก 1 ใบ/รุ่น** = `createExternalInvoice(sourceKind "DORM", refType "DormMoveOut", refId <moveOutId> (รุ่น 1) / "<moveOutId>#<rev>" (รุ่นถัดไป))` บรรทัดตาม §3.4 (ไม่มีบรรทัดเงินเลย ⇒ ไม่ออกใบ · `invoiceDocId null`) · ปิดประกัน = `settleSecurityDeposit(InTx)` คีย์ `dorm.moveout:<moveOutId>:settle:<rev>` `applyToDocIds` = [ใบวันออก, …หนี้ค้างของสายสัญญา เรียงวันครบเก่าก่อน] — ค่าน้ำไฟ/ค่าเสียหาย/ค่าห้องค้าง **ลงรายได้ผ่านใบแจ้งหนี้** แล้วถูกหักด้วยประกัน (JV ปิด = Dr ประกัน / Cr ลูกหนี้ / Cr เงินคืน)
4. **ตรึง (freeze) ก่อนปิดเสมอ**: `sendMoveOutSummary` = ตรวจก่อน (precheck — ไม่ผ่านไม่มีอะไรเกิด) → ออกใบวันออก (idempotent) → เก็บ `frozen` (hash ของบรรทัด + ชุดเอกสารที่จะหัก) → คำขออนุมัติถ้าต้อง → ส่งข้อความ (ช่องทางไม่มี ⇒ ยังตรึง · พนักงานพิมพ์ให้) · หลังตรึงแก้ตรวจห้องไม่ได้ (`FROZEN`) · ต้องแก้ = `reopenMoveOutSummary` (ใบลดหนี้เต็มใบเดิม · `rev + 1` · คำขออนุมัติเดิมถูกยกเลิก) · **ปิดประกันโดยไม่ตรึง ⇒ `NOT_FROZEN`** (ผู้เช่าต้องได้เห็นใบสรุปก่อน — A9)
5. **หักต้องมีหลักฐานทุกโหมด** (เข้มกว่าตัวตรวจ: `DEDUCTION_EVIDENCE` ใน OUT_OF_SCOPE คืน OK แต่ใบนี้ยังบล็อก): รายการ `DAMAGE` ยอด > 0 ต้องมีไฟล์ ≥ 1 ที่ **แนบกับใบย้ายออกนี้** (`addMoveOutFiles`) — ไฟล์ร้านอื่น/ไฟล์ที่ไม่ได้แนบใบนี้ = ไม่นับ ⇒ `DEDUCT_NO_EVIDENCE` · รายการ `NORMAL` ยอด > 0 ⇒ `DEDUCT_NORMAL_WEAR` ทุกโหมด (`always`) · ทั้งคู่คืน `{ ok:false, code:"LEGAL_BLOCK", legal:{ code, messageTh, citation } }` ไม่เขียนอะไร
6. **อนุมัติเกินวงเงิน** = ตามสูตร D.1 `settleDeposit.needsApproval` (ค่าเสียหายรวม > `approvalThreshold` ค่าปัจจุบันของหน่วย ณ ตอนตรึง) · ผู้ถือ `dorm.deposit.deduct.approve` (เจ้าของ/ผู้จัดการที่คุมหน่วย ผ่าน `evaluate`) ปิดได้เลย · คนอื่น: ตอนตรึงยื่น `submitForApproval(entityType "dorm.moveout.deduction", entityId "<moveOutId>:<rev>")` — ต้องมีนโยบายที่มีขั้น `OWNER` ไม่งั้น `NEEDS_APPROVAL` (ไม่ตรึง ไม่มีคำขอ · แบบ D.5/D.11) · ปิดประกันอ่านสถานะคำขอสด (`requestStatuses`) — ไม่ APPROVED ⇒ `NEEDS_APPROVAL` · ถูกปฏิเสธ ⇒ `DEDUCTION_REJECTED` (ต้อง reopen)
7. **ค่าน้ำไฟถึงวันออก**: ต่อมิเตอร์ห้อง (active) — **เลขฐาน** = `meta.to` ของบรรทัด ELEC/WATER ในบิลล่าสุด (ตาม `periodKey`) ที่ไม่ VOID ของสายสัญญา (= เลขที่ถูกเก็บเงินไปแล้ว) · ไม่มีบิล ⇒ เลข `MOVE_IN` ของสัญญา (`leaseId`) · ไม่มี ⇒ `BASE_READING_MISSING` · เลขจดงวด (PERIOD) ที่ยังไม่ถูกออกบิล **ไม่ใช้เป็นฐาน** (README: 2,000 → 2,126 ไม่ใช่ 2,104) · หน่วย = MOVE_OUT − ฐาน (< 0 ⇒ `METER_BACKWARDS`) · ราคา = `utilityCharge`/`utilityLine` ของ D.1 ด้วยวิธีคิด **ค่าตั้งปัจจุบันของหน่วย** (แบบ D.8 "วิธีคิด ณ ตอนออก") — `FIXED_RATE` = `rooms.utility.*.fixedRate` · `ACTUAL_COST` = อัตราของ `DormUtilityRate` งวด = เดือนของวันออก (ไม่มี ⇒ งวดล่าสุดก่อนหน้า + `warnings ["RATE_FROM:<periodKey>"]` · ไม่มีเลย ⇒ `RATE_MISSING`) · หน่วย 0 ⇒ ไม่มีบรรทัด (แสดงในตารางมิเตอร์) · มิเตอร์ NONE ⇒ ไม่มีบรรทัด · ⚠️ J3: อัตราเดือนวันออกใช้ได้ไหม
8. **ค่าห้องเศษเดือน**: วันที่ยังไม่ถูกออกบิลค่าห้องจนถึงวันออก ⇒ บรรทัด `RENT` (+ `COMMON` ถ้ามีส่วนกลาง) = D.1 `prorate` ด้วย `rooms.billing.prorate` **ของ snapshot สัญญา** · "ถูกออกบิลแล้ว" = เดือนค่าห้องของบิลที่ไม่ VOID ของสายสัญญา (ตาม `rooms.billing.rentTiming` ของหน่วย) · เดือนที่ออกบิลแล้วแต่ออกกลางเดือน ⇒ **ใบลดหนี้** ส่วนเกินที่บิลนั้น (โหมด FULL_MONTH ⇒ ไม่คืน) — ⚠️ J3 · ค่าเช่าล่วงหน้า (`advanceRentSatang` > 0) ⇒ บรรทัด `ADVANCE_RENT` ติดลบไม่เกินยอดค่าห้องในใบ · ส่วนที่เหลือแสดง `warnings ["ADVANCE_RENT_LEFT:<สตางค์>"]` (ไม่มีทางคืนเงินนอกประกัน — หนี้ J4/D.10)
9. **ค่าปรับค้าง** (ปิดหนี้ D.11 มติ 5): บรรทัด `LATE_FEE` = `lateFeeLedger(...).totalDueSatang − totalChargedSatang` ณ วันตรึง (> 0 เท่านั้น · การยกเว้นนับแล้ว) · หลังตรึง `waiveLateFee` ⇒ `MOVEOUT_FROZEN`
10. **หนี้ค้าง** = เอกสาร DORM ที่ยังค้างของ **สายสัญญา** (ใบแจ้งหนี้ของบิลที่ไม่ VOID + ใบเพิ่มหนี้ `DormBillAdjust` ของบิลเหล่านั้น + ใบวันออก/ใบย้ายห้องรุ่นที่ยังมีผล) — ใช้ยอดค้างจริงจากบัญชี (ไม่ใช่ `DormBill.paidSatang`)
11. **กำหนดคืน** `refundDueDate` = `moveOutDate` + `returnDays` ของ snapshot — โหมด **STRICT** และค่าเกินพารามิเตอร์กฎหมาย (`depositReturnMaxDays` 7) ⇒ ตัดเหลือ 7 + ผล `legal.code "DEPOSIT_RETURN_DAYS"` · WARN/OUT_OF_SCOPE ⇒ ใช้ค่าของสัญญา · `DormMoveOut.refundDueAt` = **00:00 เวลาไทยของวันถัดจากวันครบ** (เช่น ครบ 7 พ.ย. ⇒ `2026-11-07T17:00:00.000Z`) · `daysLeft` = `refundDueDate − วันนี้ไทย` (วันปฏิทิน) · `refundOverdue` = `now ≥ refundDueAt` และยังไม่ปิด · ⚠️ J3 ข้อ 1 (วันปฏิทิน/วันทำการ/14 วัน)
12. **แจ้งย้ายออกสั้นกว่า N วัน** (`noticeDays` ของ snapshot) ⇒ `SHORT_NOTICE` เว้นแต่ส่ง `shortNoticeReason` (≥ 10 ตัวอักษร · `isValidOutOfScopeReason`) ⇒ บันทึกได้ + `AuditLog dorm.moveout.short_notice` · **ไม่มีค่าปรับ/ริบประกันอัตโนมัติ** (⚠️ J3)
13. **แจ้งแล้วห้องว่างตามวันออก**: `resizeOccupancy(end = moveOutDate + 1)` + `DormLease.endDate = moveOutDate` ใน tx เดียวกับแถวใบย้ายออก (ผู้เช่าใหม่จองต่อได้ทันที — README เบญจา 15 พ.ย.) · วันจบเดิมเก็บใน `inspection.originalEndDate` · ยกเลิก = คืนทั้งคู่ (ห้องถูกจองแล้ว ⇒ `CANCEL_BLOCKED` ไม่เปลี่ยนอะไร)
14. **ห้อง ⇒ ทำความสะอาด**: หลัง commit ของการปิดประกัน เรียก `setHkStatus(DIRTY)` (facade rooms · ไม่อยู่ใน tx — ห้าม connection ที่สอง) แล้วจด `inspection.hkMarkedAt` · ไม่สำเร็จ/โพรเซสตาย ⇒ เรียกปิดซ้ำ (duplicate) หรืองานตามเวลาเติมให้ (ครั้งเดียว · ไม่ทับห้องที่ทำความสะอาดแล้วหลังจากนั้น)
15. **ย้ายห้องรุ่นแรก = วันที่ 1 ของเดือนค่าห้องที่ยังไม่ออกบิล** (§4.2) · กลางเดือน ⇒ `TRANSFER_DATE` (⚠️ มติ R3) · ห้องใหม่ได้สัญญาใหม่ (ค่าห้องตามห้องใหม่ · snapshot ใหม่ · ยินยอมตอนย้าย) · ไม่ใช่ "ขึ้นราคากลางสัญญา"
16. **ต่อสัญญา** = สัญญาใหม่ต่อท้ายวันจบเดิม (ค่าห้องใหม่ได้ — `evaluateLegal("RENT_LOCKED_IN_LEASE", { context: "RENEWAL" })`) · สัญญาเดิม ACTIVE ต่อจนวันจบ แล้วงานตามเวลาปิด `ENDED/RENEWED` · กลางสัญญาไม่มีทางขึ้นค่าห้อง (ไม่มี API · D.5 ไม่มี)
17. **ข้อความถึงผู้เช่าเก่า**: ใบสรุปส่งผ่าน `notifyCustomer` (`messageKey "moveOutSummary"` · `dedupeKey "rooms:moveOutSummary:<moveOutId>:<rev>"` · ไม่มีลิงก์พอร์ทัล — พอร์ทัลตัดตาม D.9) · ⚠️ J5: ส่งข้อความบริการหลังจบสัญญาได้ไหม

### 2.4 รูปทรง JSON (ไม่มี migration)
```ts
DormMoveOut.inspection = {
  originalEndDate: string; noticeDate: string; shortNoticeReason: string | null;
  files: { fileId: string; contentType: string; at: string }[];                // ไฟล์หลักฐานที่แนบใบนี้ (private)
  items: { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; damageCode: string | null; amountSatang: number; evidenceFileIds: string[]; note: string | null }[];
  meters: { meterId: string; kind: "ELEC" | "WATER"; baseValue: number; value: number; units: number }[];
  inspectedAt: string | null; inspectedById: string | null; hkMarkedAt: string | null;
}
DormMoveOut.deductions = {
  rev: number;                                                                  // 1 เริ่ม · reopen ⇒ +1
  frozen: { hash: string; at: string; invoiceDocId: string | null; docIds: string[]; approvalId: string | null;
            lines: SummaryLine[]; heldSatang: number; refundSatang: number; tenantOwesSatang: number; needsApproval: boolean } | null;
  history: { rev: number; invoiceDocId: string | null; creditNoteDocId: string | null; reason: string; at: string }[];
  settle: { key: string; entryId: string | null; at: string } | null;
}
```
คอลัมน์: `depositSatang` `deductSatang` (Σ ค่าเสียหาย) `refundSatang` อัปเดตตอนตรึงและตอนปิด · `refundDueAt` ตอนแจ้ง · `approvalId` = คำขอของรุ่นปัจจุบัน · `settlementDocumentId` = entryId ของ JV ปิด (null เมื่อไม่มีประกัน) · `refundedAt` = เวลาปิด

## 3. ย้ายออก — ออกทาง `@/lib/modules/dorm` (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก)
```ts
export type MoveOutCtx = { tenantId: string; actorUserId: string };
type Fail = { ok: false; code: string; reason: string; legal?: { code: string; messageTh: string; citation: string } };
type Money = number; // สตางค์
export type SummaryLine = { code: "ELEC" | "WATER" | "RENT" | "COMMON" | "ADVANCE_RENT" | "LATE_FEE" | "DAMAGE" | "UNPAID";
  labelTh: string; amountSatang: Money; qty?: number; unitPriceSatang?: number | null; evidenceCount?: number; docId?: string | null; itemKey?: string };
```
**ด่านทุกฟังก์ชัน** (ลำดับนี้ · แบบ D.5): หน่วยเป็น DORM ของ `ctx.tenantId` · Membership **สด** (acceptedAt ไม่ null) · สิทธิ์ `dorm.moveout.manage` (§4 ใช้ `dorm.lease.manage`) ผ่าน `evaluate` ของหน่วย + ขอบเขตอาคาร (`dormVisibleRoomsFor` ของ D.13) · สัญญา/ใบย้ายออก/ห้อง/มิเตอร์/ไฟล์ต้องเป็นของหน่วยนั้น — **ไม่ผ่านข้อใด ⇒ `NOT_FOUND` (เขียน) / `null` (อ่าน) ด้วย reason เดียวกันทุกกรณี** (X1) · ห้าม throw · reason ไทยไม่โทษผู้ใช้ ไม่มีข้อความ Prisma · `deps.now` ฉีดเวลาได้ทุกฟังก์ชัน · 40P01/P2034 ⇒ ลองใหม่ 1 ครั้ง ⇒ `BUSY` · tx `maxWait ≤ 20s` `timeout ≤ 30s`
**ลำดับล็อก (ทุกทางที่เขียนของใบนี้ ห้ามสลับ)**: advisory `dorm.lease:<leaseId>` (ของ D.5 · ใช้ **ต้นสาย** ถ้าต่างกันให้ล็อกต้นสายก่อน แล้วตัวเอง) → advisory `dorm.latefee:<leaseId>` (เฉพาะตรึง/ปิด) → (รุ่น InTx ของบัญชี: แถว Tenant → ลิงก์หน่วย → เอกสาร) → แถวใบย้ายออก/สัญญา (CAS) · **ไม่มี connection ที่สองระหว่างถือ tx** (ไม่เรียก facade ที่เปิด tx เองข้างใน — `createExternalInvoice`/`createExternalCreditNote`/`notifyCustomer`/`setHkStatus` เรียก **นอก** tx)

### 3.1 `giveMoveOutNotice(ctx, { unitId, leaseId, moveOutDate: "YYYY-MM-DD", shortNoticeReason?: string | null }, deps?: { now?: Date })`
→ `{ ok: true; moveOutId; duplicate: boolean; noticeDate; moveOutDate; noticeDays: number; shortNotice: boolean; refundDueDate: string; legal: { code: string; messageTh: string } | null } | Fail`
- สัญญาต้อง `ACTIVE` (มีใบย้ายออก NOTICE/INSPECTED อยู่แล้ว **วันเดียวกัน** ⇒ ok `duplicate:true` · วันต่าง ⇒ `ALREADY_NOTICED` · สถานะอื่น ⇒ `NOT_EDITABLE`) · มีสัญญาต่อ (สัญญาที่ `previousLeaseId` = นี้) ⇒ `HAS_RENEWAL`
- `moveOutDate` รูปแบบผิด/ก่อน `startDate` ⇒ `INVALID_INPUT` · หลัง `endDate` ⇒ `AFTER_LEASE_END` · `noticeDate` = วันนี้ไทย · ช่วง < noticeDays ⇒ §2.3 ข้อ 12
- tx: แถว NOTICE (แถว CANCELLED เดิม ⇒ ใช้แถวเดิม · `inspection/deductions` เริ่มใหม่) · สัญญา `NOTICE` + `endDate = moveOutDate` · `resizeOccupancy` (§2.3 ข้อ 13 · ROOM_TAKEN ไม่น่าเกิดเพราะหดเท่านั้น) · `refundDueAt` · AuditLog `dorm.moveout.noticed` — **พร้อมกัน 12 ทาง ⇒ แถวเดียว ok 1 ตัว `duplicate:false`**
### 3.2 `cancelMoveOut(ctx, { unitId, moveOutId, reason })` → `{ ok: true } | Fail`
- เฉพาะ NOTICE/INSPECTED ที่ยังไม่ตรึง (ตรึงแล้ว ⇒ `FROZEN` · ปิดแล้ว ⇒ `NOT_EDITABLE`) · เหตุผล < 3 ตัว ⇒ `INVALID_INPUT` · คืน `endDate`/occupancy เดิม — ห้องถูกจองต่อแล้ว ⇒ `CANCEL_BLOCKED` (ไม่เปลี่ยนอะไร) · ok ⇒ CANCELLED + สัญญา ACTIVE + ลบแถวมิเตอร์ MOVE_OUT ของใบนี้ได้ (ไม่ใช่เงิน)
### 3.3 ตรวจห้อง
```ts
addMoveOutFiles(ctx, { unitId, moveOutId, files: { data: Uint8Array; contentType: string; filename?: string }[] }, deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> })
  → { ok: true; added: { fileId: string }[] } | Fail
recordMoveOutInspection(ctx, { unitId, moveOutId,
  items: { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; damageCode?: string | null; amountSatang?: number; evidenceFileIds?: string[]; note?: string | null }[];
  meterReadings: { meterId: string; value: number; photoFileId?: string | null }[] }, deps?: { now?: Date })
  → { ok: true; status: "INSPECTED"; deductSatang: Money; needsApproval: boolean } | Fail
```
- ไฟล์: jpeg/png/webp/heic/heif/pdf · ≤ 10 MB · 1–20 ไฟล์/ครั้ง · ≤ 60/ใบ · ผิด ⇒ `INVALID_FILE` ทั้งคำขอ · `uploadFile(... visibility "private")` **ก่อน** tx · ต่อท้าย `inspection.files` ใต้ล็อก
- รายการ: `key` ซ้ำ ⇒ `INVALID_INPUT` · ≤ 50 รายการ · `damageCode` ต้องอยู่ใน `damageCatalog` (ไม่มี ⇒ `INVALID_INPUT`) · ไม่ส่ง `amountSatang` + มี damageCode ⇒ ราคาจากแคตตาล็อก · เงินจำนวนเต็ม 0..฿1,000,000 · §2.3 ข้อ 5 (หลักฐาน/ค่าเสื่อม)
- มิเตอร์: ต้องเป็นมิเตอร์ห้อง active ของห้องนี้ (ไม่ใช่ ⇒ `NOT_FOUND`) · ฐาน §2.3 ข้อ 7 · `DormMeterReading { kind "MOVE_OUT", leaseId, periodKey = เดือนวันออก, source MANUAL, readById }` **1 แถวต่อ (มิเตอร์, สัญญา)** — ส่งซ้ำ = แทนค่าเดิม (ไม่เพิ่มแถว)
- ตรึงแล้ว ⇒ `FROZEN` · ปิดแล้ว/ยกเลิก ⇒ `NOT_EDITABLE` · ok ⇒ INSPECTED (ส่งซ้ำได้จนตรึง)
### 3.4 สรุปเงิน — `moveOutSummary(ctx, { unitId, moveOutId }, deps?: { now?: Date }) → Promise<MoveOutSummary | null>`
```ts
type MoveOutSummary = {
  moveOutId: string; leaseId: string; depositLeaseId: string; roomId: string; roomNumber: string; tenantName: string;
  status: "NOTICE" | "INSPECTED" | "SETTLED" | "REFUNDED" | "CANCELLED"; rev: number;
  noticeDate: string; moveOutDate: string; refundDueDate: string; daysLeft: number; refundOverdue: boolean;
  heldSatang: Money; lines: SummaryLine[];                   // ไม่มีบรรทัดยอด 0
  chargesSatang: Money;                                      // Σ บรรทัดที่จะออกใบวันออก (ไม่รวม UNPAID)
  unpaidSatang: Money; deductSatang: Money;                  // deduct = Σ DAMAGE
  refundSatang: Money; tenantOwesSatang: Money;              // = settleDeposit ของ D.1 กับชุดเดียวกัน
  needsApproval: boolean; approval: { id: string | null; status: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };
  frozen: { hash: string; invoiceDocId: string | null; at: string } | null; sentAt: string | null;
  meters: { meterId: string; kind: "ELEC" | "WATER"; baseValue: number; value: number | null; units: number | null }[];
  items: { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE"; amountSatang: Money; evidenceCount: number }[];
  moveInPhotos: { fileId: string; url: string }[];           // privateFileUrl ผูกผู้ดู (≤ 15 นาที) · ไม่มี path/private://
  warnings: string[]; settled: { entryId: string | null; appliedSatang: Money; refundSatang: Money; at: string } | null;
};
```
- ก่อนตรึง = คิดสด · หลังตรึง = บรรทัดของ `frozen` (ยอดค้างอ่านสดจากบัญชีได้) · ลำดับบรรทัด: ELEC WATER RENT COMMON ADVANCE_RENT LATE_FEE DAMAGE… UNPAID · `refundSatang/tenantOwesSatang/needsApproval` ต้องเท่ากับ `settleDeposit` (D.1) ที่ป้อน `depositSatang = heldSatang` · ไม่มีเบอร์/เลขบัตร (X8)
- `moveOutModel(ctx, { unitId, moveOutId?: string; roomNumber?: string }, deps?: { now?: Date }) → Promise<MoveOutModel | null>` = summary + ชื่อหน่วย + checklist (`rooms.moveout.checklist` เติมรายการที่ยังไม่ตรวจ verdict null) + `canSettle: { ok: boolean; code: string | null }` (ใช้ทำปุ่ม) · `roomNumber` ⇒ ใบล่าสุดที่ไม่ CANCELLED ของห้อง
### 3.5 `sendMoveOutSummary(ctx, { unitId, moveOutId }, deps?: { now?: Date })`
→ `{ ok: true; duplicate: boolean; rev: number; invoiceDocId: string | null; approvalId: string | null; channel: "LINE" | "SMS" | "NONE"; status: string } | Fail`
1. **precheck (ไม่ผ่าน = ไม่มีอะไรเกิด ทั้งใบแจ้งหนี้ คำขอ log และ frozen)**: สถานะ INSPECTED (NOTICE ⇒ `NOT_INSPECTED`) · มิเตอร์ห้อง active ทุกตัวมี MOVE_OUT ⇒ ไม่งั้น `METER_MISSING` · บิลของสายสัญญาที่เป็น DRAFT/HELD หรือถูกจองส่ง ⇒ `BILL_PENDING` · render แม่แบบ `rooms.msg.moveOutSummary` ด้วยค่าจริงแล้ว `findForbiddenTerms` ⇒ เจอ ⇒ `TEMPLATE_BLOCKED` · ต้องอนุมัติแต่ยื่นไม่ได้ ⇒ `NEEDS_APPROVAL`
2. ตรึงแล้วรุ่นเดียวกัน ⇒ ส่งข้อความซ้ำด้วย dedupe เดิม คืน `duplicate:true` ใบเดิม
3. `createExternalInvoice` (นอก tx · idempotent ต่อ ref) → tx ใต้ล็อก: ตรวจ hash สดเท่าเดิม (ไม่เท่า ⇒ `STALE`) · เขียน `frozen` · `submitForApproval` (ถ้าต้อง · ใน tx) — **12 ทางพร้อมกัน ⇒ ใบแจ้งหนี้ 1 ใบ frozen 1 ครั้ง**
4. `notifyCustomer` (นอก tx · `partyId` ของสัญญา · vars ไม่มีเบอร์) · `sentAt`
### 3.6 `reopenMoveOutSummary(ctx, { unitId, moveOutId, reason })` → `{ ok: true; rev: number; creditNoteDocId: string | null } | Fail`
- ตรึงแล้ว ยังไม่ปิด · เหตุผล < 3 ⇒ `INVALID_INPUT` · ใบวันออกรุ่นนี้ ⇒ `createExternalCreditNote` เต็มใบ (ref `DormMoveOutReopen` / `<moveOutId>:<rev>`) · `cancelRequest(approvalId)` · `rev + 1` · `frozen null` · history · ปิดแล้ว ⇒ `NOT_EDITABLE` · ไม่ลบอะไร
### 3.7 `settleMoveOut(ctx, { unitId, moveOutId, refund?: { channel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null }; date?: string }, deps?: { now?: Date })`
→ `{ ok: true; duplicate: boolean; status: "REFUNDED" | "SETTLED"; entryId: string | null; heldSatang; appliedSatang; refundSatang; tenantOwesSatang } | Fail`
- ปิดแล้ว ⇒ ok `duplicate:true` ผลเดิม (เติม hkStatus ถ้ายังไม่ได้) · ยังไม่ตรึง ⇒ `NOT_FROZEN` · วันนี้ไทย < `moveOutDate` ⇒ `NOT_MOVED_OUT` · ต้องอนุมัติ §2.3 ข้อ 6 ⇒ `NEEDS_APPROVAL` / `DEDUCTION_REJECTED`
- **tx เดียว** (`runDormMoneyTx` · ลำดับล็อก §3): อ่านใบสด → CAS สถานะ ∈ {NOTICE, INSPECTED} → hash สด = frozen (เอกสารใหม่ของสาย/ค่าปรับเปลี่ยน/บิลใหม่ ⇒ `STALE`) → `BILL_PENDING` → ยอดถือ (ต้นสาย) > 0 ⇒ `settleSecurityDepositInTx` · = 0 ⇒ ไม่มี JV → CAS ใบ ⇒ REFUNDED/SETTLED + คอลัมน์ §2.4 → สัญญา (ยัง NOTICE ⇒ ENDED MOVED_OUT) → outbox `dorm.moveout.settled` (+ `dorm.lease.ended` ถ้าเพิ่งจบ) · หลัง commit: `setHkStatus(DIRTY)` + `hkMarkedAt`
- **12 ทาง/4 โพรเซสพร้อมกัน ⇒ JV ปิด 1 รายการ** · โพรเซสตายกลางทาง ⇒ ไม่มีสถานะครึ่งเดียว (มี JV ⇔ สถานะปิด) · เรียกซ้ำ ⇒ duplicate
### 3.8 `runDormMoveOutJobs(now: Date, opts?: { tenantId?: string }) → Promise<{ reminders: number; overdue: number; ended: number; hkFixed: number }>`
1. สัญญา `NOTICE` ที่ `moveOutDate < วันนี้ไทย` ⇒ `ENDED/MOVED_OUT` + `dorm.lease.ended` (ครั้งเดียว · CAS) · สัญญา ACTIVE ที่มีสัญญาต่อแล้ว และ `endDate < วันนี้` ⇒ `ENDED/RENEWED` + event
2. ใบย้ายออกที่ยังไม่ปิด (NOTICE/INSPECTED) และ `moveOutDate ≤ วันนี้ไทย` ⇒ outbox `dorm.deposit.refund_due` **วันละ 1 ครั้งต่อใบ** (idempotencyKey `dorm.deposit.refund_due:<moveOutId>:<วันไทย>`) · ก่อนวันออก ⇒ ไม่เตือน · `now ≥ refundDueAt` ⇒ AuditLog `dorm.deposit.refund_overdue` **ครั้งเดียวต่อใบ** (targetType DormMoveOut)
3. ปิดแล้วแต่ไม่มี `hkMarkedAt` ⇒ เติม (§2.3 ข้อ 14)
- งานซ้อน (X5 · 4 โพรเซส) ⇒ ผลครั้งเดียว · ทีละร้าน ≤ 200 แถว/รอบ · ร้านที่ล้มไม่ขวางร้านอื่น

## 4. ย้ายห้อง · ต่อสัญญา (`dorm.lease.manage`)
### 4.1 `depositLeaseIdOf(tx | null, { tenantId, leaseId }) → Promise<string>` (ภายในโมดูล · export จาก lease-change.ts)
ไล่ `previousLeaseId` จนสุด (ร้าน/หน่วย/ผู้เช่าเดียวกันเท่านั้น · กันวน ≤ 50 ขั้น) — ใช้ทุกที่ที่อ่าน/ปิดประกัน (§1 lease.ts)
### 4.2 `transferRoom(ctx, { unitId, leaseId, toRoomId, effectiveDate: "YYYY-MM-DD", rentSatang?: number; meterReadings?: { meterId: string; value: number }[] }, deps?: { now?: Date })`
→ `{ ok: true; duplicate: boolean; mode: "IN_PLACE" | "NEW_LEASE"; leaseId: string; previousLeaseId: string | null; carriedDepositSatang: Money } | Fail`
- สัญญาต้อง ACTIVE ไม่มีใบย้ายออก (ไม่ CANCELLED) ⇒ ไม่งั้น `NOT_EDITABLE` · ห้องปลายทางต้องเป็นของหน่วยเดียวกัน (ไม่ใช่ ⇒ `NOT_FOUND`) · ไม่ว่างตลอด [effectiveDate, endDate] ⇒ `ROOM_TAKEN` (ไม่บอก ref คนอื่น)
- `effectiveDate == startDate` และสัญญายังไม่มีบิลที่ไม่ VOID ⇒ **IN_PLACE**: `moveOccupancy` + `DormLease.roomId` (สัญญาเดิม · ประกันเดิม · ไม่มีสัญญาใหม่)
- ไม่งั้น **NEW_LEASE**: `effectiveDate` ต้องเป็นวันที่ 1 ของเดือน (`TRANSFER_DATE`) ที่สัญญายังไม่ถูกออกบิลค่าห้อง (`ALREADY_BILLED`) · มีบิล DRAFT/HELD/ถูกจองของเดือนนั้น ⇒ `BILL_PENDING` — tx: `resizeOccupancy(old, end = effectiveDate)` → `claimRoom(new room, [effectiveDate, oldEnd + 1))` → สัญญาใหม่ ACTIVE (`previousLeaseId` · ผู้เช่า/ผู้พักร่วมเดิม · `startDate = effectiveDate` · `endDate` เดิม · ค่าห้อง = `rentSatang` ?? ค่าห้องของห้องใหม่ (resolver แบบ D.5) · `depositSatang` = ยอดถือที่ยกมา · `policySnapshot` ใหม่ · `signedAt` = เดิม · `occupancyId`) → สัญญาเดิม `ENDED/TRANSFER` `endDate = effectiveDate − 1` → `DormMeterReading MOVE_OUT` ห้องเดิม / `MOVE_IN` ห้องใหม่ (จาก `meterReadings`) → `dorm.lease.ended` (เดิม) · **ไม่มี JV/เงินใหม่** (ประกันตามต้นสาย)
- ค่าน้ำไฟห้องเดิมถึงวันย้าย (ห้องมีมิเตอร์) ⇒ ใบแจ้งหนี้ ref `DormTransfer` / `<oldLeaseId>` (นอก tx · idempotent · สูตร §2.3 ข้อ 7) — นับเป็นหนี้ของสาย (ข้อ 10)
- พร้อมกัน 12 ทาง ⇒ สัญญาใหม่ 1 · ซ้ำ (คำขอเดิม) ⇒ ok `duplicate:true` ตัวเดิม
### 4.3 `renewLease(ctx, { unitId, leaseId, months: number; rentSatang?: number }, deps?: { now?: Date })`
→ `{ ok: true; duplicate: boolean; leaseId: string; startDate: string; endDate: string; rentSatang: Money; legal: { code: string | null } } | Fail`
- สัญญา ACTIVE ไม่มีใบย้ายออก (NOTICE ⇒ `NOT_EDITABLE`) · มีสัญญาต่ออยู่แล้ว ⇒ ok `duplicate:true` ตัวเดิม · months 1–360 จำนวนเต็ม · `startDate = endDate + 1` · `endDate` ตามสูตร D.5 §2.2 · `claimRoom` (ห้องถูกจองหลังวันจบ ⇒ `ROOM_TAKEN`) · ค่าห้อง = `rentSatang` ?? ค่าห้องปัจจุบันของห้อง · ตัวกั้นประกัน (`DEPOSIT_ADVANCE_LIMIT` กับยอดถือของสาย · แบบ D.5) · `policySnapshot` ใหม่ (ค่าตั้งปัจจุบัน) · สัญญาเดิมไม่แตะ (snapshot เดิมเหมือนเดิมทุกไบต์) · สัญญาใหม่ `ACTIVE` · outbox `dorm.lease.renewed` · พร้อมกัน 12 ทาง ⇒ สัญญาใหม่ 1

## 5. สิทธิ์ · อนุมัติ
- `dorm.moveout.manage` = ทุกฟังก์ชัน §3 · `dorm.lease.manage` = §4 · `dorm.deposit.deduct.approve` = ปิดเกินวงเงินได้เลย (§2.3 ข้อ 6) · เอาทั้ง 2 คีย์ออกจาก `planned`
- entityType `dorm.moveout.deduction` (labels + allowlist · ไม่มี effect)

## 6. event (ลง 3 ทะเบียน · payload ตรงตัว ไม่มีชื่อ/เบอร์)
| event | idempotencyKey | payload |
|---|---|---|
| `dorm.moveout.settled` | `dorm.moveout.settled:<moveOutId>` | `{ unitId, leaseId, moveOutId, refundSatang, dueAt }` (dueAt = ISO ของ refundDueAt) |
| `dorm.deposit.refund_due` | `dorm.deposit.refund_due:<moveOutId>:<YYYY-MM-DD>` | `{ unitId, leaseId, moveOutId, refundSatang, dueAt, daysLeft }` |
| `dorm.lease.renewed` | `dorm.lease.renewed:<newLeaseId>` | `{ unitId, leaseId, previousLeaseId, roomId }` |
| `dorm.lease.ended` | `dorm.lease.ended:<leaseId>` | `{ unitId, leaseId, roomId, reason }` (`MOVED_OUT` · `TRANSFER` · `RENEWED`) |

## 7. จอ 07 (เดสก์ท็อป 1440 · 390 ไม่ล้นแนวนอน)
### 7.1 «MoveOutScreen.tsx» props `{ unitSlug: string; model: MoveOutModel; actions?: Record<string, (...a: never[]) => Promise<unknown>> }` — DOM สัญญา
- ตัวห่อ `data-dorm-moveout="<moveOutId>"` · หัว "ย้ายออก · ห้อง <เลข> · <ชื่อผู้เช่า>"
- ขั้น 4 อัน `data-moveout-step="NOTICE|INSPECT|SUMMARY|REFUND"` `data-state="done|current|todo"` ข้อความ "แจ้งล่วงหน้า <วันที่>" · "ตรวจห้อง" · "สรุปเงิน" · "คืนเงิน" (NOTICE/INSPECTED ไม่ตรึง ⇒ INSPECT current · ตรึงแล้ว ⇒ SUMMARY current · ปิด ⇒ ทุกขั้น done)
- แถบนับถอยหลัง `data-refund-countdown` `data-days-left="<n>"` `data-overdue="true|false"`: ปกติ "ต้องคืนเงินประกันภายใน <วันไทยย่อ วันที่ เดือนย่อ พ.ศ.>" + "(<N> วันหลังย้ายออก)" + "เหลือ <n> วัน" · เลย ⇒ "เลยกำหนดคืนเงินประกัน <n> วัน" · ปิดแล้วไม่แสดง
- ตรวจห้อง: แถว `data-inspect-item="<key>"` `data-verdict="NORMAL|DAMAGE|"` · NORMAL ⇒ ข้อความ "หักไม่ได้" และ **ไม่มีช่องยอด/ยอดเงิน** · DAMAGE ⇒ ยอด `฿350.00` + จำนวนหลักฐาน · **ไม่มี element ใดที่ให้เลือกหักค่าเสื่อม** (`data-deduct-normal` ห้ามมี)
- มิเตอร์ `data-moveout-meter="<ELEC|WATER>"` "ไฟ 2,000 → 2,126 (126 หน่วย)" · "น้ำ 383 → 389 (6 หน่วย)"
- แผงสรุป `data-moveout-summary`: "เงินประกันที่ถือไว้" `9,000.00` · บรรทัด `data-summary-line="<code>"` ยอดติดลบ `−594.72` · ยอดคืน `data-refund-amount` `฿7,759.28` (ค้าง ⇒ `data-owes-amount` "ผู้เช่าต้องจ่ายเพิ่ม") · กล่องยืนยัน "ไม่หักค่าทาสี/ทำความสะอาดทั่วไป" · "ทุกรายการที่หักมีรูป/ใบเสร็จแนบ"
- ปุ่ม `data-action="send-summary"` "ส่งใบสรุปให้ดูก่อน" · `data-action="settle"` "ยืนยัน · โอนคืน" — ปิดไม่ได้ ⇒ `disabled` + `data-blocked="<code>"` (NEEDS_APPROVAL ⇒ ข้อความ "รออนุมัติ")
- ไม่มีเบอร์เต็ม/เลขบัตร · ไม่มีคำต้องห้าม สคบ. · หน้าตาตามภาพ 07 (ซ้ายตรวจห้อง · ขวาแผงสรุป · แถบนับถอยหลังบน)
### 7.2 «moveout/page.tsx» server · `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `moveOutAccess(m, unit.id).manage` ไม่ผ่าน ⇒ `notFound()` · `?room=<เลข>` หรือ `?id=<moveOutId>` · `?at=` = นาฬิกา QC **เฉพาะ `SVC_QC_CLOCK=1`** (แบบ B.10 `qcNowOf`) · ข้อมูลผ่าน facade (`moveOutModel`) ไม่แตะ prisma
### 7.3 «moveout/actions.ts» `"use server"` export async function เท่านั้น: `giveMoveOutNoticeAction` `recordMoveOutInspectionAction` `addMoveOutFilesAction` `sendMoveOutSummaryAction` `settleMoveOutAction` `reopenMoveOutSummaryAction` `cancelMoveOutAction` `transferRoomAction` `renewLeaseAction` — `requireUnit` + DORM · ร้าน/ผู้กระทำจาก session · ไม่รับ tenantId/actorUserId จาก input

## 8. ฉากภาพ «scripts/svc-qc-moveout-scene.mts»
- ด่าน `loadSvcQcEnv("svc-qc-moveout-scene")` · ต้องมีฉาก R0.9 + D.5 (lease-scene) ไม่งั้น exit 3 พร้อมบอกลำดับ
- ห้อง 207 ร้าน svcqc: **ธนพล ศรีสุข** สัญญา 12 เดือนจบ = `SQC_DORM_MOVEOUT_SCENE.moveOutDate` (สัมพัทธ์วันนี้ · §ค่าใน svc-qc-data) · `createdById "SvcQcScene"` · occupancy: มีแถวของฉากเดิมที่จบ `moveOutDate + 1` ของห้อง 207 ⇒ ชี้ไปแถวนั้น (ไม่สร้างซ้อน) · ไม่มี ⇒ สร้าง · ประกัน ฿9,000 ผ่าน `postSecurityDeposit` (คีย์ `svcqc-scene:moveout:207`) · บิลงวดก่อนวันออก (ELEC `meta.to` 2,000 · WATER 383 · จ่ายครบ) · เลข MOVE_OUT 2,126 / 389 · ไฟล์หลักฐาน 2 ไฟล์ (FileAsset private เขียนตรง) · ตรวจห้อง 5 รายการตามภาพ (มุ้งลวด ฿350 · กุญแจ ฿200 · ที่เหลือ NORMAL) ⇒ ใบ INSPECTED **ไม่ตรึง** ⇒ คืน ฿7,759.28
- สัญญาธนพลอยู่สถานะ `ENDED/MOVED_OUT` (วันออกผ่านไปแล้ว — §2.1) ⇒ **ไม่กระทบ** ยอดถือทั้งตึก ฿296,400 / CURRENT 31 ของ D.5 และ KPI ของ D.13 · เบญจา (DRAFT 15 พ.ย.) ไม่แตะ
- idempotent `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0 · ซ่อมเองเมื่อมีแถวหาย · `--clear` ลบเฉพาะแถวฉากนี้ (JV ประกันของฉากลบตรงได้แบบ D.5)

## 9. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.12.mts»
S โครงสร้าง · PC positive control (เขียวตั้งแต่ก่อนทำ: D.1 settleDeposit 207 · ตัวตรวจกฎหมาย · settleSecurityDeposit · D.8 ข้ามสัญญาย้ายออก · lateFeeLedger · ตัวยิง 4 โพรเซส · setHkStatus · notifyCustomer) · N แจ้งย้ายออก · I ตรวจห้อง/หลักฐาน · M สรุปเงิน (207 = ฿7,759.28 ทุกสตางค์) · L ส่ง/ตรึง · A อนุมัติ · T ปิดประกัน · R เปิดใบสรุปใหม่ · C นับถอยหลัง/เตือน (เที่ยงคืนไทย) · P แข่งหลายโพรเซส · X ย้ายห้อง · W ต่อสัญญา · H หน้าแรก · U จอ · Y ข้ามร้าน/สิทธิ์ · K บัญชี (สมดุล · ไม่ลบ) · Q ฉาก · V ภาพ · Z ล้าง · G regression
- ร้านชั่วคราว slug `qc-svc-d12-*` · ผู้ใช้ `svc-d12-*@shark.local` · หน่วย DM (มิเตอร์ · OUT_OF_SCOPE+เหตุผล · FIXED_RATE ไฟ ฿4.72 น้ำ ฿16) · DN (ไม่มีมิเตอร์ · STRICT · รอบบิล ต.ค./พ.ย. ผ่าน D.8 จริง) · DW (WARN) · DT (ย้ายห้อง) · DS (ต่อสัญญา) · ร้าน B · เวลาฉีดผ่าน `deps.now` / `runDormMoveOutJobs(now)`
- พร้อมกัน: 4 โพรเซสลูก (`--child`) × 3 คำขอ · ฆ่ากลางทาง: โพรเซสลูกถูก SIGKILL หลัง START 6 จังหวะ

## 10. รายการแข่งที่ผู้ตรวจ B ต้อง probe (หลายโพรเซส · ฐาน QC จริง)
1. **ปิด ∥ ปิด**: 4 โพรเซส × 3 + ในโพรเซส 30 ทาง (เกิน pool) ⇒ JV ปิด 1 · ไม่มี P2028/throw/UNAVAILABLE · สถานะปิด 1 ครั้ง · event 1
2. **ปิด ∥ รอบบิล D.8** (prepare + send รอบที่คร่อมวันออก ในโพรเซสอื่น): สัญญาที่ย้ายออกไม่มีบิลเดือนที่ `moveOutDate ≤ สิ้นเดือนค่าห้อง` · สัญญาอื่นได้บิลครั้งเดียว · ไม่มี deadlock ค้าง (40P01 ⇒ BUSY แล้วลองซ้ำได้) · หน่วยมิเตอร์ไม่ถูกเก็บซ้ำ (บิล + ใบวันออก)
3. **ปิด ∥ ค่าปรับ D.11**: (ก) ตรึง ∥ `waiveLateFee` ⇒ ไม่มีทาง "ยกเว้นแล้ว + ใบวันออกยังมีค่าปรับนั้น" (ข) ปิด ∥ `adjustSentBill` DEBIT LATE_FEE ⇒ ปิดสำเร็จต้องไม่มีใบเพิ่มหนี้ที่เกิด **ก่อน** JV ปิดแต่ไม่อยู่ในชุดที่หัก (ต้อง STALE) (ค) ปิด ∥ `prepareBillRun` ที่ลงค่าปรับอัตโนมัติ
4. **ย้ายห้อง ∥ รอบบิล D.8**: เดือน `effectiveDate` ถูกเก็บค่าห้องครั้งเดียว (สัญญาเดิมหรือใหม่ ไม่ทั้งคู่ ไม่หายทั้งคู่) · ย้ายห้อง ∥ ย้ายห้อง (ปลายทางเดียวกัน/ต่างกัน) ⇒ สัญญาใหม่ 1
5. **ฆ่ากลางการปิด** (SIGKILL ที่จังหวะต่าง ๆ รวมระหว่าง JV กับ CAS): มี JV ⇔ สถานะปิด ⇔ แถวรับชำระ DEPOSIT_APPLY · เรียกซ้ำ ⇒ duplicate ผลเดิม + hkStatus DIRTY
6. ตรึง ∥ ตรึง (ใบแจ้งหนี้ 1) · ตรึง ∥ บันทึกตรวจห้อง (ไม่มีใบที่ตรึงด้วยข้อมูลเก่าแต่สถานะบอกข้อมูลใหม่) · reopen ∥ ปิด (ปิดไม่ใช้ใบที่ถูกลดหนี้แล้ว)
7. แจ้งย้ายออก ∥ ต่อสัญญา (ห้ามได้ทั้งคู่) · แจ้ง ∥ แจ้ง (แถวเดียว) · ยกเลิกแจ้ง ∥ สัญญาใหม่จองห้องช่วงที่ว่าง (ไม่มี occupancy ซ้อน)
8. งานตามเวลา ∥ งานตามเวลา (X5) ข้ามเที่ยงคืนไทย · งาน ∥ ปิด (ไม่มี refund_due หลังปิดในวันเดียวกันที่เกิดหลัง commit)
9. ข้ามร้าน: เดา id ใบย้ายออก/สัญญา/มิเตอร์/ไฟล์ร้านอื่น ⇒ NOT_FOUND เหมือนกันทุกกรณี · ไฟล์หลักฐานร้านอื่นไม่ถูกนับ
10. สิทธิ์สด: ถอนสิทธิ์ระหว่างตรึงแล้วก่อนปิด ⇒ ปิดไม่ได้

## 11. regression · X · ส่งต่อ · หนี้
- G (หลังล้างข้อมูล · ข้อสอบรันเอง): `qc-svc-d.2` (facade บัญชี + `settleSecurityDepositInTx`) · `qc-svc-d.5` · `qc-svc-d.6` · `qc-svc-d.8 --no-regression` · `qc-svc-d.11 --no-regression` · `qc-svc-d.13 --no-regression` · `qc-svc-d.9 --no-regression` (เมื่อมีบน tip · ไม่มี ⇒ SKIP) · `qc-svc-smoke` + ผู้คุม: typecheck (ISO_MEM=9000M · heap 7168) · fitness 2 โหมด · ตรวจเข้ม 2 รอบ
- แดงตั้งแต่ฐาน 788cdeb0 (ไม่ใช่ของใบนี้ · ข้อสอบยอมไว้พร้อมเหตุผล): d.6 S-5 (กล่องประมาณเงินของ D.7 ในจอมิเตอร์) · d.6 G-2 (r0.2 D-6/D-7/D-14 ข้อมูล seed บาร์เบอร์) · d.13 Q-2 (diffCount 5≠4 บน svcqc · ORACLE-EDIT ค้างของผู้คุม) — ผู้คุมลบออกจากรายการยอมเมื่อแก้แล้ว
- X: X1 (Y-*) · X3 (N-7 L-2 P-1 X-4 W-4) · X4 (T-7 ปิดซ้ำ · event ครั้งเดียว) · X5 (C-4) · X6 (I-1 ไฟล์) · X8 (M-8 U-2 payload T-5 C-3) · X9 (เหตุผล: สั้นกว่า N วัน · ยกเลิก · reopen · อนุมัติ) · X10 (I-1 ไฟล์ private · M-8 ลิงก์รูปวันเข้า) · ไม่เกี่ยว: X7 (ไม่มี endpoint สาธารณะ — ผู้เช่าเห็นใบสรุปทาง LINE)
- ส่งต่อ: **D.9** สัญญาใหม่จากย้ายห้อง/ต่อสัญญา ⇒ ลิงก์พอร์ทัลเก่า (subject = leaseId เดิม) ตาย · ผูก LINE ใหม่/หาสัญญา live ด้วย Party · **D.10** คืนเงินค่าเช่าล่วงหน้าส่วนเกิน (`ADVANCE_RENT_LEFT`) · **D.13** todo `expired`/`refundDue` · **D.15** UAT ย้ายออก 207 · **D.4** นำเข้าสัญญาที่ต่อแล้ว (สาย `previousLeaseId`)
- หนี้ที่รู้: (1) ย้ายห้องกลางเดือน (มติ R3) (2) ย้ายห้องข้ามหน่วย (3) ใบกำกับภาษีเต็มรูปของส่วน VAT ในใบวันออก (D.3 · ใช้ facade เดียวกัน — รอมติ R5) (4) คืน/ริบเงินจองของสัญญา DRAFT (`cancelLease DEPOSIT_HELD` ของ D.5) — ไม่อยู่ในใบนี้ (5) สัญญาไม่มีวันจบ (D.5) (6) แก้หลังปิดประกัน = `reverseSecurityDepositSettlement` ของ D.2 + ทางหอ (ยังไม่มีจอ)

## 12. คำถามกฎหมาย/บัญชี (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J3: คืนประกัน 7 วันปฏิทินนับจากวันย้ายออก (ไม่ใช่วันตรวจ/วันส่งใบสรุป) ถูกไหม · กรณีมีหัก 14 วันได้ไหม (ค่าเริ่ม STRICT ตัด 7)
- J3: แจ้งย้ายออกสั้นกว่า 30 วัน — ริบ/หักประกันได้ไหม (ระบบ: ไม่หักอัตโนมัติ · บันทึกเหตุผล)
- J3: หลักฐานความเสียหาย "รูปถ่ายหรือใบเสร็จ 1 ชิ้น" พอไหม · ต้องให้ผู้เช่าลงชื่อรับรู้ใบตรวจห้องไหม
- J3: คิดค่าน้ำไฟถึงวันออกด้วยอัตราเดือนวันออก (หรืองวดล่าสุดที่มี) ได้ไหม เมื่อบิลการไฟฟ้าเดือนนั้นยังไม่มา
- J3: ออกกลางเดือนหลังเก็บค่าห้องเต็มเดือนแล้ว ต้องคืนค่าห้องส่วนเกินไหม (ระบบ: ใบลดหนี้ตามโหมด prorate ของสัญญา)
- J4: ค่าน้ำไฟ/ค่าเสียหายวันออกลงรายได้ผ่านใบแจ้งหนี้แล้วหักด้วยประกัน (JV ปิด Dr ประกัน / Cr ลูกหนี้ / Cr เงินคืน) ถูกไหม · ค่าเสียหายมี VAT ไหม (ค่าเริ่ม NONE)
- J4: ย้ายห้อง/ต่อสัญญาไม่ย้ายยอดประกันใน GL (อยู่ที่สัญญาต้นสาย) — รายงานยอดประกันต่อผู้เช่ารับได้ไหม
- J5: ส่งใบสรุปทาง LINE หลังสัญญาจบ (ข้อความบริการ) ได้ไหม

## 13. มติที่ขอจากผู้คุม (ค่าปลอดภัยในวงเล็บ — builder ทำตามค่าปลอดภัยจนผู้คุมตอบ)
- **R1** อนุญาตแตะ `account/index.ts` + `service.ts` เพิ่ม `settleSecurityDepositInTx` (รุ่นรับ tx ของทางเดิม · แบบ D.5 K1) — จำเป็นสำหรับ "ถือล็อกข้าม ตรวจ→เขียน" และ "มี JV ⇔ สถานะปิด" (ค่าปลอดภัย: อนุญาต · ไม่อนุญาต ⇒ ข้อสอบ P-5 แดงโดยเจตนา และต้องออกแบบใหม่เป็นสองขั้น + งานกู้)
- **R2** ประกันตามต้นสาย (มติ 2) แทนการย้ายยอดใน GL — แตะ `lease.ts` จุดเดียว (ค่าปลอดภัย: รับ)
- **R3** ย้ายห้องเฉพาะวันที่ 1 ของเดือนที่ยังไม่ออกบิล (ค่าปลอดภัย: รับ · กลางเดือน = หนี้)
- **R4** สัญญาจบ (ENDED) เมื่อวันออกผ่าน — ก่อนคืนประกัน (มติ §2.1 · ทำให้ฉาก 207 อยู่ร่วมกับ ฿296,400 ของ D.5/D.13 ได้) (ค่าปลอดภัย: รับ)
- **R5** ใบกำกับเต็มรูปของส่วน VAT ในใบวันออก (หอจด VAT) — ทำในใบนี้ผ่าน `issueTaxForBill`-แบบเดียวกัน หรือเป็นหนี้ (ค่าปลอดภัย: หนี้ · ใบนี้ออกใบแจ้งหนี้มีบรรทัด VAT7 ตาม `rooms.vat.taxKinds` เท่านั้น)
- **R6** แตะ `latefee.ts` (guard `MOVEOUT_FROZEN`) และ `home.ts` (todo 2 ชนิด) — ไฟล์ของ D.11/D.13 (ค่าปลอดภัย: อนุญาต · G d.11/d.13 ต้องเขียวเท่าเดิม)
- **R7** ผู้ถือ `dorm.deposit.deduct.approve` (รวมผู้จัดการที่คุมหน่วย) ปิดเกินวงเงินได้เลย (ค่าปลอดภัย: รับ · ถ้าเจ้าของต้องการ "เจ้าของเท่านั้น" ⇒ เปลี่ยนเป็นตรวจ OWNER สด)

## มติผู้คุม (30 ต.ค.)
- **R1 อนุมัติ** เพิ่ม `settleSecurityDepositInTx` ใน account facade/service แบบเพิ่มอย่างเดียว (แบบ D.5 K1) · ผู้ตรวจ A อ่านเส้นเงินทุกบรรทัด
- **R2 อนุมัติ** ประกันตามต้นสาย (`depositLeaseIdOf`) · ย้ายห้อง/ต่อสัญญาไม่สร้าง JV
- **R3 อนุมัติ** ย้ายห้องรุ่นแรกเฉพาะวันที่ 1 ของเดือนที่ยังไม่ออกบิล (หรือ in-place ก่อนเริ่มสัญญา) · กรณีอื่น = หนี้
- **R4 อนุมัติ** สัญญา ENDED เมื่อวันออกผ่าน (ก่อนคืนประกัน) · พอร์ทัล/LINE ของ D.9 ตัดตาม live
- **R5** ใบกำกับภาษีเต็มรูปของส่วน VAT ในใบวันออก = หนี้ (จดใน §หนี้)
- **R6 อนุมัติ** แตะ latefee.ts (`MOVEOUT_FROZEN`) / home.ts (todo `expired`/`refundDue`) แบบเพิ่ม · d.13 ต้องคงเขียว
- **R7** ปิดเกินวงเงินได้เฉพาะผู้ถือ `dorm.deposit.deduct.approve` (ผู้จัดการต้องมีคีย์นี้ ไม่ใช่เพราะคุมหน่วย) · อนุมัติตัวเองต้องจด audit
- มติ 1–11 ของผู้เขียนข้อสอบ = รับทั้งหมด
- G-3 (d.6 S-5 / G-2 r0.2) แดงตั้งแต่ฐาน 788cdeb0 — ยอมในใบนี้ · ผู้คุมจะแก้ใน B.12/D.15
- ระดับตรวจ = เข้ม · ผู้ตรวจ 2 คน
