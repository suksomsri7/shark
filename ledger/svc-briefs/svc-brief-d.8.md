# ใบสั่ง D.8 — รอบบิลรายเดือน (ภาพ หอ 04) · ตรวจ **เข้ม (เงิน) + perf**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.8 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` A5 (+ A4 VAT · §8 แถวบัญชี/แชท/อนุมัติ) · ภาคผนวก ก หอ #23–30 · ภาพ `ledger/design-dorm/04-billing-run.png` (+ `.body.html`) · README หอ "รอบบิล พ.ย.: 31 บิล ··· **฿174,126.40**" + ห้อง 204/207 + ไฟ ฿4.72 · น้ำ ฿16.00
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1.6 (snapshot ลงเอกสาร — กติกาจากเอกสารที่มีแล้วอ่านจาก snapshot) §1.7 (ตัวตรวจกฎหมาย) §4.4 (`notifyCustomer` = D.9) §6.2 · §7 (`dorm.billrun.sent`) · §8 (`dorm.bill.run` · `dorm.bill.send`) + ภาคต่อ 28 ต.ค.
> ส่งต่อจากใบก่อน (อ่านก่อนเขียน): D.1 (`buildDormBill` · `prorate` · `occupiedDays` · `sumBills` · "D.8 ส่ง billedRooms" · minimum=null เมื่อปิด) · **D.2** (`createExternalInvoice` DORM idempotent ต่อ (สมุด, refType, refId) · `createExternalCreditNote/DebitNote` · `createPaymentRequestForDoc` · `dormBillInvoiceLines` · หนี้ N2 `/root/svc-runs/fix/d2.md`: **ล็อกระดับร้าน ⇒ เงินหอทั้งร้านคิวเดียว ~0.5 วิ/รายการ ⇒ ออกบิลทั้งตึกเรียกทีละใบ (ห้าม Promise.all) + รายงานความคืบหน้า** · ใบร่างของหอไม่มีทางออกเลข ⇒ ใช้ draft=false · ส่วนเกินลง 2110) · **D.5** (`policySnapshot` ของสัญญา: dueDay · prorate · catalog · ค่าปรับ · ค่าเช่าล่วงหน้าบิลแรก · MOVE_IN reading · `reservationAppliesTo FIRST_RENT` — `/root/svc-runs/fix/d5.md`) · **D.6** (`heldRooms` ⇒ `DormBill HELD` · `periodUsage`) · **D.7** (`utilityCharges` · `utilityBillingGate` ต้องผ่านก่อนออก · หนี้ (5): ห้อง HELD ปล่อยทีหลังเกินบิลได้ ⌊m/2⌋ สตางค์ ⇒ **ตรวจ Σ ตอนออกบิลจริงทุกครั้ง** · กล่องประมาณค่าน้ำไฟจอ 03 — `/root/svc-runs/fix/d7.md` · ใบสั่ง D.7 §9)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.8.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.8.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally · G รันหลังล้าง) · ต่อท้าย `--no-regression` ข้ามหมวด G · `--perf-rooms=N` ลดขนาด P-3 ระหว่างทำ (ค่าเริ่ม 300 · รับใบต้อง 300) · SKIP ที่ยอมได้ระหว่างทำ = V-1/V-2 (ไม่มี QC_BASE) · Q-* (ร้าน svcqc ยังไม่มีฉากผัง+สัญญา+มิเตอร์+ค่าน้ำไฟ) · G-* (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/schema`** · เลน l2 · temp ขึ้นต้น `svc-d8-` · รายงานต่อข้อ (id → ผล)
> **ไม่มี migration**: `DormBillRun` (status `DRAFT|REVIEW|SENT|CLOSED` · `progress Json` · `scheduledSendAt`) · `DormBill` (unique `(leaseId, periodKey)` · unique `accountDocumentId` · `lines Json` · `policySnapshot` · `holdReason` · `sentVia` · `paymentRequestId`) · `DormMoveOut` (อ่านอย่างเดียว) · `AuditLog` (ประวัติแก้หลังส่ง) — ขาดคอลัมน์ = หยุดถามผู้คุม

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/dorm/billing.ts» (ใหม่) | §3 ทั้งหมด — ผ่าน `tenantDb` เท่านั้น (ห้าม `import { prisma }` · F5.1) · **สูตรเงินทุกตัวเรียก D.1** (`buildDormBill` `prorate` `occupiedDays` `daysInMonth` `utilityLine`/`utilityCharge` `sumBills`) · ค่าน้ำไฟจาก D.7 (`utilityCharges`) + D.6 (`periodUsage` `heldRooms`) · ด่าน `utilityBillingGate` (D.7) · เงินผ่าน facade บัญชี (`createExternalInvoice` `createExternalCreditNote` `createExternalDebitNote` `createPaymentRequestForDoc` `firstReceiveFinanceId`) + `dormBillInvoiceLines` (D.2) · snapshot `snapshotPolicy(…, "bill", refs)` · ตัวตรวจผ่าน `evaluateLegal` |
| `src/lib/modules/dorm/index.ts` | เพิ่มบล็อก export §3 (บล็อกของ D.5/D.6/D.7 ห้ามแตะ) |
| «src/components/dorm/BillingRunScreen.tsx» (ใหม่) | จอ §5 · `'use client'` |
| «src/app/app/u/[unitSlug]/dorm/billing/page.tsx» (ใหม่) | หน้าห่อ §5 (server) |
| «src/app/app/u/[unitSlug]/dorm/billing/actions.ts» (ใหม่) | `"use server"` §5 |
| «src/app/app/u/[unitSlug]/dorm/billing/[billId]/print/page.tsx» (ใหม่) | ใบแจ้งหนี้พิมพ์ใส่ห้อง (ช่องทาง PRINT) §5 |
| `src/components/dorm/MeterWalk.tsx` · `src/app/app/u/[unitSlug]/dorm/meter/page.tsx` | **เพิ่มอย่างเดียว**: prop `estimates` + กล่อง "ประมาณค่าน้ำไฟเดือนนี้" §6 (ส่วนอื่นของ D.6 ห้ามแตะ) |
| `src/lib/core/permissions.ts` | คีย์ `dorm.bill.send` ป้ายไทย "ส่งบิลให้ผู้เช่า · แก้บิลหลังส่ง (ใบลดหนี้/เพิ่มหนี้)" (คีย์หออื่น = D.13 · ห้ามเพิ่มล่วงหน้า) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` (+ `webhooks/labels.ts` ถ้าไม่ได้จาก spread) | event `dorm.billrun.sent` (consumer `withAutomation(async () => {})` = hook ว่างให้ D.9 ใส่ `notifyCustomer` · ป้ายไทย) — **ห้ามลง `dorm.bill.paid/partially_paid/overdue` ล่วงหน้า** (D.10/D.11) |
| `src/lib/platform/minute-jobs.ts` | งาน `dorm.billing` (ทุก 5 นาที · import facade ตอนรัน) §3.9 + คอมเมนต์ `// SVC D.8` |
| `scripts/fitness.mts` | เฉพาะบรรทัด `ALLOWED_EDGES` ที่ใช้จริง (คาดว่ามีครบแล้ว: dorm→account · dorm→rooms) + คอมเมนต์ `// SVC D.8` |
| «scripts/svc-qc-billing-scene.mts» (ใหม่) | ฉากภาพ §7 |

ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` — `SQC_VISUAL_SPECS["d.8"]` (หน้า `/dorm/billing?room=204` · ถ่ายด้วย `owner` และ `fai`)

ห้าม: migration · แก้ `calc.ts` / `utility.ts` / `meter.ts` / `lease.ts` / `account-bridge.ts` / `law.ts` (ใช้ตามที่มี — ขาดอะไรเขียนคำขอใน wo-notes) · แตะ `account/*` นอก facade · ส่ง LINE/SMS จริง (D.9 — ใบนี้มีแค่ event hook) · รับเงิน/ตรวจสลิป (D.10) · คิดค่าปรับอัตโนมัติจากการจ่ายช้า (D.11 — ใบนี้มีแค่ช่องบรรทัดค่าปรับ §3.3) · ย้ายออก/คืนประกัน (D.12) · คำต้องห้าม สคบ. · `any` · `getDay()/getDate()/getMonth()` ดิบ · **ยิงเงินขนาน** (`Promise.all` กับ createExternalInvoice/ใบลด-เพิ่มหนี้/ลิงก์จ่าย)

## 2. ศัพท์ · กติกา
- **รอบ** `DormBillRun` 1 แถว/หน่วย/งวด (unique ของ D.0) · `periodKey` "YYYY-MM" = ชื่อรอบที่จอแสดง ("ออกบิลรอบ พ.ย. 2569" = `2026-11`) · `DormBill.periodKey` = ของรอบ
- **เดือนค่าห้อง** = งวดรอบ (`rooms.billing.rentTiming = ADVANCE` ค่าเริ่ม) หรือเดือนก่อน (`ARREARS`) · **งวดน้ำไฟ** = เดือนก่อนงวดรอบ (`rooms.billing.utilityTiming = ARREARS` ค่าเริ่ม) หรือเดือนเดียวกัน (`SAME_MONTH`) — ฉาก README: รอบ `2026-11` = ค่าห้อง พ.ย. + น้ำไฟ ต.ค. (เลขจด 25 ต.ค.)
- **สัญญาที่ออกบิล** = `DormLease` ของหน่วย สถานะ `ACTIVE` หรือ `NOTICE` ที่ช่วงสัญญา `[startDate, endDate]` ซ้อนเดือนค่าห้อง · **ไม่ออก** (ไม่มีแถว `DormBill` · อยู่ใน `skipped` ของโมเดล): สัญญาที่มี `DormMoveOut` สถานะ ≠ `CANCELLED` และ `moveOutDate` ≤ วันสุดท้ายของเดือนค่าห้อง (เหตุผล `MOVE_OUT` — "คิดในใบย้ายออก (จอ 07)") · DRAFT/ENDED/CANCELLED ไม่อยู่ในรอบ · ย้ายออกหลังเดือนค่าห้อง = ออกปกติ
- **กติกาจากสัญญาอ่านจาก `lease.policySnapshot.values` เท่านั้น** (CC §1.6): `rooms.billing.dueDay` · `rooms.billing.prorate` · `rooms.services.catalog` · `rooms.services.extraOccupantFee` · `rooms.lateFee.*` · `rooms.lease.reservationAppliesTo` — ค่าห้อง/ส่วนกลาง/ค่าเช่าล่วงหน้า/เงินจอง = คอลัมน์ของสัญญา · แก้ค่าตั้งหลังทำสัญญา ⇒ บิลของสัญญาเดิมไม่เปลี่ยน
- **วิธีคิดน้ำไฟ/VAT ณ ตอนออก** = ค่าตั้งปัจจุบันของหน่วย ⇒ จดลง `DormBill.policySnapshot = snapshotPolicy(ctx, "bill", { unitId, buildingId?, roomTypeId, roomId, leaseId })` (คีย์ `SNAPSHOT_KEYS.bill` ครบ)
- **ยอด/บรรทัดของบิล** = `buildDormBill` ของ D.1 เท่านั้น (ทุกสตางค์ · ลำดับ RENT · COMMON · ELEC · WATER · SERVICE:* · LATE_FEE):
  - `rentSatang` = `lease.rentSatang` ถ้าสัญญาคลุมทั้งเดือน · ไม่ครบเดือน ⇒ `prorate({ monthlySatang, days: occupiedDays(เดือน, start, end), daysInMonth, mode: snapshot prorate })`
  - `commonFeeSatang` = `lease.commonFeeSatang`
  - `electricity`/`water` = แถว `utilityCharges(งวดน้ำไฟ)` ของห้อง (สถานะ OK) ⇒ `qty` = `units` · `unitPriceSatang` = `rateSatangPerUnit` · `amountSatang` = `amountSatang` ของแถว (ทุกสตางค์) · meta มี `units/from/to/segments` (ห้องเปลี่ยนมิเตอร์ ⇒ `segments: 2`) — **MOVE_IN** (§2.1) · แถว `NONE` ⇒ ไม่มีบรรทัด · ห้องไม่มีแถว (ว่างทั้งงวดน้ำไฟ เช่น เข้าใหม่) ⇒ ไม่มีบรรทัด
  - `services` = รายการ `required: true` ใน snapshot catalog (`SERVICE:<code>` · taxKind ของรายการ) + `rooms.services.extraOccupantFee` × จำนวนผู้พักร่วม (`coTenants.occupants.length`) เป็น `SERVICE:EXTRA_OCCUPANT` (ค่าว่าง/0 คน ⇒ ไม่มีบรรทัด) + **บิลแรกของสัญญา** (ไม่มี `DormBill` อื่นของสัญญานี้ที่ไม่ VOID) และ `advanceRentSatang > 0` ⇒ `SERVICE:ADVANCE_RENT` "ค่าเช่าล่วงหน้า" taxKind `EXEMPT` + บรรทัดมือ `SERVICE:MANUAL_<n>` (§3.3)
  - `lateFeeSatang` = Σ บรรทัดมือชนิด `LATE_FEE` (§3.3 · D.11 จะเติมอัตโนมัติด้วยช่องเดียวกัน)
  - `vat` = `{ registered: rooms.vat.registered, pricesIncludeVat: rooms.vat.pricesIncludeVat }` · `taxKinds` = `rooms.vat.taxKinds`
- **วันครบกำหนด** = `<เดือนรอบ>-<dueDay ของ snapshot>` (ตัดที่สิ้นเดือน) · ถ้าก่อนวันออก ⇒ วันออก · **วันออก** = วันไทยของ `deps.now` ตอนเตรียมรอบ (`issueDate` ของรอบ)
- **พักบิล (HELD)** — แถวมี แต่ไม่ออกใบแจ้งหนี้ · ไม่นับในยอดรอบ (`billCount/totalSatang` = บิลที่ไม่ใช่ HELD/VOID) · `holdReason` ขึ้นต้นด้วยรหัส:
  - `METER_<flag>` — ห้องอยู่ใน `heldRooms(งวดน้ำไฟ)` (ป้าย D.6 ที่ยังไม่ยืนยัน · ห้องว่างไม่มีสัญญา ⇒ ไม่มีบิล ไม่นับ)
  - `NO_READING` — แถวน้ำไฟของห้องเป็น `NO_READING` (ยังไม่จด)
  - `BOOKING_FEE_FIRST_RENT` — บิลแรกของสัญญาที่ snapshot `reservationAppliesTo = FIRST_RENT` และ `bookingFeeSatang > 0` (ยังไม่มีทางรับเงินจองเข้าค่าห้อง — หนี้ D.5 · ห้ามเงียบ)
- **บรรทัดที่ผู้เช่าเห็น** = `dormBillInvoiceLines(bill)` ของ D.2 (หน่วย + อัตราบาท 2 ตำแหน่ง · กฎหมายให้แสดง)

### 2.1 MOVE_IN (หนี้ D.5)
ห้องที่สัญญามีแถว `DormMeterReading { kind: "MOVE_IN", leaseId }` ของมิเตอร์นั้น และ `readAt` อยู่หลัง `readAt` ของเลขงวดก่อน ⇒ หน่วยของสัญญานี้ = เลขงวดนี้ − เลข MOVE_IN (ไม่ใช่ − เลขงวดก่อน · ส่วนก่อนเข้าเป็นของผู้เช่าเก่า/ห้องว่าง) · ยอด = `utilityLine({ kind: "METERED", segments: [{ start: MOVE_IN, end: เลขงวดนี้ }], method: { kind: "FIXED_RATE", satangPerUnit: rateSatangPerUnit ของแถว } })` (ACTUAL_COST/FIXED_RATE) · TARIFF/SHARED/FLAT ⇒ ใช้ยอดของแถว (หนี้: ส่วนแบ่งตามวัน — D.12)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
export type BillingCtx = { tenantId: string; actorUserId: string };
type Fail = { ok: false; code: string; reason: string; blocks?: GateItem[] };   // reason ไทยไม่ว่าง ไม่โทษผู้ใช้ ไม่มีข้อความ Prisma · ห้าม throw
type RunStatus = "DRAFT" | "REVIEW" | "SENT" | "CLOSED";
type GateItem = { kind: "ELEC" | "WATER" | null; buildingId: string | null; code: string; messageTh: string; ruleId?: string };
type RunGate = { ok: boolean; blocks: GateItem[]; needsAcceptance: GateItem[] };
```
ทุกฟังก์ชัน: หน่วยต้องเป็น `BusinessUnit` ของ `ctx.tenantId` และ `type = "DORM"` · ผู้กระทำอ่าน **Membership สด** (`acceptedAt` ไม่ null) แล้ว `evaluate(m, { module: "dorm", action, unitId })`: อ่าน (`billRunModel` `getBill` `billRunCsv` `meterEstimates`) = `dorm.view` · เตรียม (`prepareBillRun` `setBillExtraLines` `releaseHeldBill`) = `dorm.bill.run` · ส่ง (`sendBillRun` `scheduleBillRun` `adjustSentBill`) = `dorm.bill.send` — ไม่ผ่านข้อใด ⇒ `NOT_FOUND` / `null` / `{}` / `null` (ไม่บอกว่ามีอยู่ — X1) · id ของรอบ/บิลต้องเป็นของหน่วยนั้น ไม่ใช่ ⇒ `NOT_FOUND`

### 3.1 เตรียมรอบ (สร้าง DRAFT · คำนวณใหม่ · เพิ่มสัญญาเข้าใหม่)
```ts
prepareBillRun(ctx, { unitId: string; periodKey: string }, deps?: { now?: Date })
→ Promise<{ ok: true; runId: string; created: boolean; status: RunStatus; utilityPeriodKey: string;
            billCount: number; heldCount: number; added: number; changed: number; totalSatang: number;
            skipped: { leaseId: string; roomNumber: string; reason: "MOVE_OUT" }[]; gate: RunGate } | Fail>
```
- ตรวจ: `periodKey` ผิดรูป ⇒ `INVALID_INPUT` · นอก `2020-01`…(เดือนไทยของ now + 2) ⇒ `BAD_PERIOD` — ไม่มีแถวเกิด
- รอบยังไม่มี ⇒ สร้าง `DRAFT` (`issueDate` = วันไทยของ now · `createdById` = ผู้กระทำ) — **ยิงพร้อมกัน N ทาง = รอบเดียว · ไม่มี throw** (unique (unitId, periodKey) + จับชนแล้วอ่านแถวผู้ชนะ / advisory lock ต่อหน่วย×งวด)
- รอบ `DRAFT`: คำนวณทุกสัญญาใหม่ · บิล DRAFT/HELD ที่ผลต่างจากเดิม ⇒ อัปเดต (`changed`) · เท่าเดิม ⇒ **ไม่เขียน** (`updatedAt` ไม่ขยับ) · บรรทัดมือ (§3.3) คงอยู่ · บิล HELD ที่หายพัก ⇒ DRAFT
- รอบ `REVIEW`/`SENT`: **ไม่แตะบิลที่ SENT/DRAFT รอส่งอยู่** · เพิ่มบิลให้สัญญาที่เข้าเงื่อนไขแต่ยังไม่มีบิล (ย้ายเข้าใหม่ · `added`) · บิล HELD ถูกประเมินใหม่ได้ · รอบ `SENT` ที่มีบิลใหม่ = ยังเป็น `SENT` (ส่งเพิ่มด้วย `sendBillRun`)
- คืน `gate` = `utilityBillingGate(งวดน้ำไฟ)` ของ D.7 (+ รายการของใบนี้ §3.5) — เตรียมรอบได้แม้ด่านไม่ผ่าน (จอแสดงเหตุผล) · ไม่ผ่าน = ส่งไม่ได้
- `DormBillRun.billCount/totalSatang` = Σ บิลที่ไม่ใช่ HELD/VOID (เขียนทุกครั้งที่บิลเปลี่ยน)

### 3.2 พักบิล
```ts
releaseHeldBill(ctx, { unitId: string; billId: string }, deps?: { now?: Date })
→ Promise<{ ok: true; status: "DRAFT"; totalSatang: number } | Fail>
```
- บิลต้อง HELD (ไม่ใช่ ⇒ `NOT_HELD`) · คำนวณใหม่ · ยังติดเหตุพัก ⇒ `STILL_HELD` (reason บอกเหตุ) ไม่เปลี่ยน · หาย ⇒ DRAFT + ยอดใหม่ (ส่งด้วย `sendBillRun` — ด่าน Σ §3.5 ทำงานตอนส่ง)

### 3.3 บรรทัดมือ (ค่าปรับเดือนก่อน · อื่น ๆ) — เฉพาะบิล DRAFT/HELD
```ts
setBillExtraLines(ctx, { unitId: string; billId: string;
  lines: { kind: "LATE_FEE" | "OTHER"; labelTh: string; amountSatang: number; note?: string | null; taxKind?: "EXEMPT" | "VAT7" | "NONE" }[] })
→ Promise<{ ok: true; totalSatang: number } | Fail>
```
- แทนที่บรรทัดมือทั้งชุด (`lines: []` = ล้าง) · ≤ 10 บรรทัด · `amountSatang` จำนวนเต็ม 1…100,000,000 · labelTh 1–80 ตัว · ไม่ผ่าน ⇒ `INVALID_INPUT`
- บิล SENT/PAID/… ⇒ `BILL_SENT` (แก้หลังส่ง = §3.7 เท่านั้น — ห้ามแก้ทับ)
- `LATE_FEE` รวม > `rooms.lateFee.capPerBill` **ของ snapshot สัญญา** (ไม่ null) ⇒ `LATE_FEE_OVER_CAP` ไม่เปลี่ยน · บรรทัดเก็บใน `DormBill.lines` (meta `manual: 1` · `note`) และอยู่รอดการคำนวณใหม่ · `OTHER` ⇒ `SERVICE:MANUAL_<n>` (taxKind ไม่ส่ง = ของ `SERVICE`)
- ฉาก README: 203 และ 211 `LATE_FEE` ฿200 "ปรับช้า ต.ค. 4 วัน" ⇒ ยอดรอบ ฿174,126.40

### 3.4 ตั้งเวลาส่ง
```ts
scheduleBillRun(ctx, { unitId: string; runId: string; at: string | null }, deps?: { now?: Date })
→ Promise<{ ok: true; status: RunStatus; scheduledSendAt: string | null } | Fail>
```
- `at` ISO ในอนาคต (≤ 60 วัน) ⇒ `scheduledSendAt` + รอบเป็น `REVIEW` (ล็อกการคำนวณใหม่ตาม §3.1) · อดีต/ผิดรูป ⇒ `INVALID_INPUT` · `null` ⇒ ยกเลิก (กลับ `DRAFT` ได้เฉพาะเมื่อยังไม่มีบิล SENT) · รอบ SENT ⇒ `RUN_SENT` · งานตามเวลา §3.9 เป็นคนส่ง

### 3.5 ส่งรอบ (ออกใบแจ้งหนี้ 1 ใบ/ห้อง · ทีละใบ · ทำต่อได้)
```ts
sendBillRun(ctx, { unitId: string; runId: string }, deps?: { now?: Date; budgetMs?: number /* ค่าเริ่ม 25,000 */; maxBills?: number })
→ Promise<{ ok: true; done: boolean; status: RunStatus; sent: number /* รอบเรียกนี้ */; alreadySent: number; held: number; remaining: number;
            failed: { billId: string; code: string; reason: string }[]; payLinkPending: number } | Fail>
```
ลำดับต่อการเรียก (ห้ามสลับ):
1. **ด่าน (ก่อนออกใบใด ๆ · สดทุกครั้ง)**: `utilityBillingGate(งวดน้ำไฟ)` ไม่ ok ⇒ `{ ok: false, code: "UTILITY_GATE_BLOCKED", blocks }` · **Σ ตอนออกจริง**: ต่อกลุ่มน้ำไฟ (kind × ขอบเขตบิล) ที่มีบิลการไฟฟ้า/ประปา — Σ `grossSatang` บรรทัด ELEC/WATER ของบิลในรอบที่ SENT + ที่จะส่ง ⇒ `evaluateLegal("UTIL_TOTAL_LE_BILL", …)` โหมดหน่วย · ไม่ OK ⇒ `UTIL_TOTAL_EXCEEDS_BILL` (ห้องที่ปล่อยจาก HELD ทีหลังต้องผ่านจุดนี้ — หนี้ D.7 (5)) · หน่วยไม่ผูกสมุด ⇒ `NOT_LINKED` · VAT ค่าตั้งหอ ≠ สมุด ⇒ `VAT_SETTING_MISMATCH` — ทุกกรณี = **ไม่มีใบแจ้งหนี้/event/ลิงก์ใหม่**
2. **สด**: คำนวณบิล DRAFT ที่จะส่งใหม่ (§2) เทียบกับที่เก็บ — ต่างแม้ 1 สตางค์ ⇒ `{ ok: false, code: "RUN_STALE" }` (reason บอกจำนวนห้อง · ให้กดเตรียมใหม่) ไม่ส่งอะไร · รอบ DRAFT ยังเตรียมใหม่ได้
3. รอบ `DRAFT` ⇒ `REVIEW` (ล็อก) · แล้วไล่บิล DRAFT ตามเลขห้อง **ทีละใบ (await ทีละตัว — ห้าม Promise.all · ล็อกเงินระดับร้านของ D.2)** จนหมด/ถึง `budgetMs`/`maxBills`:
   - จองบิล (อัปเดตแบบมีเงื่อนไข/ล็อกต่อบิล) → `createExternalInvoice({ sourceKind: "DORM", unitId, refType: "DormBill", refId: "<leaseId>:<periodKey>", customer: { name: ชื่อ Party }, partyId, lines: dormBillInvoiceLines(bill), vat, issueDate: รอบ, dueDate: บิล, createdById })` — **idempotent ต่อ ref** (ล้มกลางทาง/กดซ้ำ ⇒ ได้ใบเดิม) · ยอดใบ ≠ `bill.totalSatang` ⇒ บิลไม่ SENT + `failed` (`INVOICE_MISMATCH`)
   - ใน tx เดียว: `DormBill { status: SENT, accountDocumentId, sentAt, sentVia }` + `emitOutbox(tx, "dorm.billrun.sent", …)` (§4) — ชนะได้ตัวเดียว
   - ลิงก์จ่าย: `createPaymentRequestForDoc({ tenantId, systemId }, docId, { financeId: firstReceiveFinanceId, userId })` **best-effort** — สำเร็จ ⇒ `paymentRequestId` · ล้ม (ไม่มีช่องรับเงิน/พร้อมเพย์ · ติดเพดาน 60/ชม. ต่อสมุดของบัญชี) ⇒ บิลยัง SENT · นับ `payLinkPending` · เรียก `sendBillRun` ซ้ำ = ลองลิงก์ที่ค้างอีก (ไม่ออกใบซ้ำ)
   - `sentVia` = ช่องทางแรกตาม `rooms.billing.sendChannels` (refs หน่วย+สัญญา) ที่ใช้ได้: `LINE` เมื่อ Party ผูก LINE แล้ว · `SMS` เมื่อมีเบอร์ (= "ลิงก์ SMS" · ส่งจริงใน D.9) · ไม่งั้น `PRINT`
4. ไม่มีบิล DRAFT เหลือ ⇒ รอบ `SENT` (`sentAt`) · `done: true` · บิล HELD ไม่ถูกส่ง (นับ `held`)
- **กดซ้ำ/พร้อมกัน/หลายโพรเซส/งานตามเวลาซ้อน (X3 X5)** ⇒ ใบแจ้งหนี้ **1 ใบต่อสัญญา×งวด** · event 1 ต่อบิล · ลิงก์ 1 ต่อบิล · ไม่มี throw · ตัวที่แพ้ได้ `ok: true` (ผลที่เห็น) หรือ `{ ok: false, code: "RUN_BUSY" }`
- ส่งซ้ำรอบที่ SENT แล้ว ⇒ `ok: true, done: true, sent: 0` ไม่มีแถวใหม่

### 3.6 อ่าน · จอ · พิมพ์ · ส่งออก
```ts
billRunModel(ctx, { unitId: string; periodKey?: string; previewRoom?: string /* เลขห้อง */ }) → Promise<BillRunModel | null>
getBill(ctx, { unitId: string; billId: string }) → Promise<BillPreview | null>
billRunCsv(ctx, { unitId: string; runId: string }) → Promise<string | null>
type Money = number; // สตางค์
type BillRunModel = {
  unitId: string; unitName: string; periodKey: string; utilityPeriodKey: string; runId: string | null;
  status: "NONE" | RunStatus; issueDate: string | null; scheduledSendAt: string | null;
  meter: { rooms: number; done: number };                                   // meterWalk(งวดน้ำไฟ).progress
  kpi: { billCount: number; rentSatang: Money; commonSatang: Money; elecSatang: Money; elecUnits: number; elecRateSatang: number | null;
         waterSatang: Money; waterUnits: number; waterRateSatang: number | null; lateFeeSatang: Money; otherSatang: Money; totalSatang: Money };
  legal: RunGate & { elec: { billSatang: Money; units: number; rateSatang: number } | null; water: { billSatang: Money; units: number; rateSatang: number } | null };
  rows: { billId: string | null; leaseId: string; roomId: string; roomNumber: string; tenantName: string;
          status: "DRAFT" | "HELD" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID" | "SKIPPED"; skipReason: "MOVE_OUT" | null; holdReason: string | null;
          rentCommonSatang: Money | null; elec: { amountSatang: Money; units: number } | null; water: { amountSatang: Money; units: number } | null;
          otherSatang: Money; otherNote: string | null; totalSatang: Money | null; channel: "LINE" | "SMS" | "PRINT" | null;
          meterFlag: { flag: string; confirmed: boolean } | null; docNo: string | null;
          adjustments: { kind: "CREDIT" | "DEBIT"; docNo: string | null; totalSatang: Money }[] }[];   // เรียงเลขห้อง · รวมแถว SKIPPED
  preview: BillPreview | null;   // previewRoom ไม่ส่ง = ห้องแรกที่มีบิล
  counts: { total: number; reviewed: number; held: number };
  canPrepare: boolean; canSend: boolean;
};
type BillPreview = { billId: string; roomNumber: string; unitName: string; tenantName: string; status: string; docNo: string | null; issueDate: string; dueDate: string;
  lines: { code: string; labelTh: string; detail: string | null /* "1,287→1,412 125×4.72" */; amountSatang: Money }[];
  totalSatang: Money; vatSatang: Money; vatRegistered: boolean; lateFeeRule: string | null };
```
- KPI/แถว = ของบิลจริงในฐาน (ไม่คำนวณใหม่ในโมเดล) · `elecRateSatang` = อัตราเดียวทั้งรอบ (หลายอัตรา ⇒ null) · ห้อง 207 (ย้ายออก) อยู่ใน `rows` เป็น `SKIPPED`/`MOVE_OUT` · ห้องว่างไม่อยู่
- `billRunCsv`: แถวหัว + 1 แถวต่อบิล (ไม่รวม SKIPPED) — ทุกช่องผ่าน `csvRow` (`@/lib/core/csv`) · เงินเป็น `number` บาท (สองตำแหน่ง) · ชื่อผู้เช่าขึ้นต้น `=` `+` `-` `@` ถูกกันสูตร (X6)

### 3.7 แก้หลังส่ง = ใบลดหนี้/เพิ่มหนี้ (ไม่แก้ทับ)
```ts
adjustSentBill(ctx, { unitId: string; billId: string; kind: "CREDIT" | "DEBIT"; reason: string; idempotencyKey: string;
                      lines: { code: string; labelTh: string; amountSatang: number }[] })
→ Promise<{ ok: true; docId: string; docNo: string | null; created: boolean; totalSatang: number } | Fail>
```
- บิลต้อง SENT/PARTIALLY_PAID/PAID (มี `accountDocumentId`) ไม่ใช่ ⇒ `NOT_SENT` · `reason` ไม่ผ่าน ≥ 10 ตัวอักษรจริง ⇒ `REASON_REQUIRED` · บรรทัดว่าง/เงินไม่ใช่จำนวนเต็ม > 0 ⇒ `INVALID_INPUT`
- `createExternalCreditNote/DebitNote({ sourceDocId: บิล, refType: "DormBillAdjust", refId: "<billId>:<idempotencyKey>", reason, lines (taxKind = ของบรรทัดโค้ดเดียวกันในบิล · ไม่มี = SERVICE), vat: snapshot บิล })` — โค้ดของ D.2 (`EXCEEDS_REMAINING` · `IDEMPOTENCY_CONFLICT` · `NOT_PAYABLE`) ส่งต่อตรงตัว · ซ้ำคีย์เดิม = ใบเดิม (`created: false`) · พร้อมกัน 10 ทาง = 1 ใบ
- **`DormBill.lines/totalSatang` ไม่เปลี่ยน** (ของเดิมคือหลักฐาน) · `writeAudit` action `dorm.bill.adjusted` (after: billId · kind · docId · totalSatang · reason) · `billRunModel.rows[].adjustments` อ่านจากเอกสารที่ `sourceDocId` = ใบของบิล

### 3.8 กล่องประมาณค่าน้ำไฟ (จอ 03 · ส่งต่อจาก D.7)
```ts
meterEstimates(ctx, { unitId: string; periodKey: string /* งวดน้ำไฟ */ })
→ Promise<Record<string /* roomId */, { totalSatang: Money; elec: { units: number; rateSatangPerUnit: number | null; amountSatang: Money } | null;
                                        water: { units: number; rateSatangPerUnit: number | null; amountSatang: Money } | null }>>
```
- จาก `utilityCharges` (แถว OK เท่านั้น) · `totalSatang` = Σ `grossSatang` · ไม่มีสิทธิ์ `dorm.view` (คนจดมิเตอร์) ⇒ `{}` — **คนจดมิเตอร์ไม่เห็นเงิน**

### 3.9 งานตามเวลา (`minute-jobs` ชื่อ `dorm.billing` · ทุก 5 นาที)
```ts
runDormBillingJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number }) → Promise<{ prepared: number; sent: number }>
```
- (ก) รอบ `REVIEW` ที่ `scheduledSendAt ≤ now` ⇒ ส่ง (§3.5 · ผู้กระทำระบบ)
- (ข) หน่วย DORM ที่ยังไม่มีรอบของ **เดือนถัดไป (ไทย)** และ (วันไทย ≥ `rooms.billing.issueDay` **หรือ** มิเตอร์ห้องของงวดน้ำไฟจดครบ (`meterWalk.progress.done === rooms` · rooms > 0)) ⇒ เตรียมรอบ · `rooms.billing.autoSend = true` และด่านผ่าน ⇒ ส่งต่อทันที (บิล HELD ค้างไว้)
- `opts.tenantId` = จำกัดร้าน (ข้อสอบ) · ผู้กระทำระบบเรียกทางภายใน (ไม่เปิด ctx ปลอมใน facade) · **รอบซ้อนกัน 2 รอบ (X5) = เตรียมครั้งเดียว ส่งครั้งเดียว**

## 4. event `dorm.billrun.sent` (ต่อบิล · hook ของ D.9)
- `emitOutbox(tx, …)` ใน tx เดียวกับการตั้ง SENT · `idempotencyKey = "dorm.billrun.sent:<billId>"` · `unitId` ของแถว outbox = หน่วย
- payload **ตรง 6 คีย์**: `{ unitId, runId, billId, leaseId, periodKey, amountSatang }` — ไม่มีชื่อ/เบอร์/อีเมล
- consumer = `withAutomation(async () => {})` (D.9 แทนด้วย `notifyCustomer` ผ่าน outbox concurrency — ห้าม loop ส่งใน request · R0.7 carry)

## 5. จอ (ภาพ หอ 04 · เดสก์ท็อป 1440 · 390 ไม่ล้น)
- «page.tsx» server: `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `dormAccess(<membership>, unit.id).board` ไม่ผ่าน ⇒ `notFound()` · `billRunModel` ผ่าน facade (`searchParams.period` ถูกรูป ⇒ งวดนั้น · ไม่ส่ง ⇒ รอบล่าสุดของหน่วย · ไม่มีรอบ ⇒ เดือนถัดไป status `NONE`) · `searchParams.room` ⇒ `previewRoom` · ส่ง `<BillingRunScreen model unitSlug actions={{ prepare, extraLines, release, schedule, send, adjust, exportCsv }} />`
- «actions.ts» `"use server"` · export async function เท่านั้น: `prepareBillRunAction` `setBillExtraLinesAction` `releaseHeldBillAction` `scheduleBillRunAction` `sendBillRunAction` (เรียก `sendBillRun` วนจน `done` หรือใกล้ 50 วิ แล้วคืนความคืบหน้า — จอเรียกต่อ) `adjustSentBillAction` `exportBillRunCsvAction` — ทุกตัว `requireUnit` + DORM · ร้าน/ผู้กระทำจาก session (ไม่รับ `tenantId`/`actorUserId` จาก input) · เงินจากฟอร์มบาท ⇒ `parseBahtToSatang` (D.7) ตัวเดียว
- «print/page.tsx» server: ด่านเดียวกับหน้า (board) · `getBill` · ใบแจ้งหนี้ A5 พิมพ์ใส่ห้อง (เลขที่ · บรรทัด · ยอด · ครบกำหนด) · ไม่มีคำต้องห้าม
- «BillingRunScreen.tsx» (`'use client'` บรรทัดแรก · default export · props `{ model: BillRunModel; unitSlug: string; actions: {...} }` · import ได้เฉพาะ `import type` + react + ไฟล์ใน `src/components/dorm/` ที่เป็น client ล้วน · ลิงก์ `<a>` (ห้าม `next/link`) · **ไม่ import actions/prisma/โมดูล server · ไม่ใช้ hook ของ Next** — `renderToStaticMarkup` ได้)
- DOM สัญญา (ข้อสอบ U ผูก):
  - ตัวห่อ `data-billing-run` + `data-period="<P>"` + `data-run-status="<status>"` · หัว "ออกบิลรอบ <เดือนย่อไทย> <พ.ศ.>" (เช่น "ออกบิลรอบ พ.ย. 2569")
  - ขั้น `data-run-step="1|2|3|4"` + `data-step-state="done|current|todo"` (1 ข้อความ "จดมิเตอร์ <done>/<rooms>" · 2 "ตรวจบิล" · 3 "ส่ง" · 4 "เก็บเงิน") · DRAFT ⇒ ขั้น 2 current · SENT ⇒ ขั้น 4 current
  - KPI `data-run-kpi="count|rentCommon|elec|water|total"`: count "31" · rentCommon "฿153,000" + "143,700 + 9,300" · elec "฿17,558.40" + "3,720 หน่วย × ฿4.72" · water "฿3,168.00" + "198 หน่วย × ฿16.00" · total "฿174,126.40" + "฿400" (ค่าปรับ)
  - กล่องกฎหมาย `data-run-legal` + `data-level="OK|WARN|BLOCK"`: ผ่าน ⇒ "฿4.72" "฿19,824.00" "4,200 หน่วย" "฿16.00" "฿3,840.00" "240 หน่วย" · ไม่ผ่าน ⇒ `messageTh` ของ blocks/needsAcceptance + ลิงก์ `<a href=".../dorm/settings/utility…">`
  - ตาราง: แถว `data-bill-row="<เลขห้อง>"` + `data-bill-status` · เซลล์ `data-col="rentCommon|elec|water|other|total|channel"` (เงินไม่มี ฿ รูป `5,500.00` · ไฟ/น้ำมี "<n> หน่วย" · อื่น ๆ มี `otherNote`) · แถว SKIPPED มี "ไม่ออกบิล" + "ย้ายออก" · แถว HELD มี `holdReason` เป็นข้อความไทย + ปุ่ม `data-release-bill="<billId>"` (เมื่อ `canPrepare`) · ห้องที่มิเตอร์ผิดปกติแต่ยืนยันแล้ว `data-meter-flag="<flag>"` + "ยืนยันแล้ว" · ช่องทาง LINE/"ลิงก์ SMS"/"พิมพ์"
  - ท้ายตาราง `data-run-footer`: "<n> บิล · ฿<รวม>" · แถบล่าง "ตรวจครบแล้ว <reviewed>/<total> · พักไว้ <held>"
  - ตัวอย่างบิล `data-bill-preview="<เลขห้อง>"`: บรรทัด `data-preview-line="<code>"` (ไฟมี "1,287→1,412" · "125×4.72") · "ยอดชำระ" · ยอด "5,486.00" · "ครบกำหนด" + วันไทย "5 พ.ย. 2569" · ไม่จด VAT ⇒ "ไม่มี VAT"
  - "เมื่อกดส่ง ระบบจะ" `data-send-effects` (ใบแจ้งหนี้ N ใบ · QR · LINE/SMS · เตือนอัตโนมัติ)
  - ปุ่ม `data-run-action="save|schedule|send|export"` · `send` ข้อความ "ส่งบิล <n> ใบตอนนี้" · `!canSend` ⇒ ไม่มีปุ่ม send/schedule · ด่านไม่ผ่าน ⇒ ปุ่ม send `disabled`
  - **ไม่มีคำต้องห้าม สคบ.** · ไม่มีเบอร์โทรผู้เช่า
- หน้าตาตามภาพ 04 (ผู้คุม PARITY)

## 6. กล่องประมาณในจอ 03 (เพิ่มอย่างเดียว)
- `MeterWalk` รับ prop `estimates?: Record<roomId, …> | null` (ชนิด §3.8) · มีค่าของห้องที่เปิดอยู่ ⇒ กล่อง `data-meter-estimate="<roomId>"` "ประมาณค่าน้ำไฟเดือนนี้ ฿686.00 · ไฟ 125 × ฿4.72 · น้ำ 6 × ฿16.00" · ไม่มี prop ⇒ ไม่มีกล่อง ไม่มี "฿" เลย (จอเดิมของ D.6 ต้องเหมือนเดิม)
- `meter/page.tsx` เรียก `meterEstimates` **เฉพาะเมื่อ** `dormAccess(...).board` (ไม่งั้นส่ง `null`)

## 7. ฉากภาพ «scripts/svc-qc-billing-scene.mts»
- `loadSvcQcEnv("svc-qc-billing-scene")` ก่อนแตะฐาน · ต้องมีฉาก roomboard → lease → meter → utility ก่อน · ร้าน svcqc หอ · งวดรอบ = เดือนนี้ไทย (น้ำไฟ = เดือนก่อน — ฉากมิเตอร์มีประวัติครบทุกห้อง · ฉากค่าน้ำไฟใส่บิลเดือนก่อนแล้ว)
- `prepareBillRun` จริง (ผู้กระทำ owner svcqc) + `setBillExtraLines` 203/211 `LATE_FEE` ฿200 "ปรับช้า 4 วัน" · **ไม่ส่ง** (ภาพ = ขั้นตรวจบิล)
- idempotent `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` ลบรอบ+บิลของหน่วยงวดนั้นเฉพาะเมื่อไม่มีบิล SENT (มี ⇒ exit 3 พร้อมเหตุผล) · ไม่แตะห้อง/สัญญา/มิเตอร์/ค่าตั้ง

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.8.mts»
S โครงสร้าง 13 · PC positive control 5 · R รอบ พ.ย. ฿174,126.40 13 · U จอ 12 · E กล่องประมาณจอ 03 3 · H พัก/ด่าน/กฎหมาย 8 · N ส่ง/ซ้ำ/พร้อมกัน 13 · A แก้หลังส่ง 6 · F บิลแรก/เศษวัน/บริการ 5 · C CSV 2 · X ข้ามร้าน/สิทธิ์ 6 · J งานตามเวลา 3 · P perf 4 · Q ฉาก 3 · V ภาพ 2 · G regression 10 · Z ล้าง 1 = **109 ข้อ** · สถานะสะสม (ข้อหลังใช้ผลข้อก่อน) · ฟังก์ชันขาด = FAIL ไม่ใช่ SKIP
- ตัวเลขคาดหวัง = README + ข้อสอบ D.1 (`RAW` ชุดเดียวกัน · 17,412,640 · 14,370,000 · 930,000 · 1,755,840 · 316,800 · 40,000 · ห้อง 201/202/203/204/205/206/309/104 · 112 = 173 หน่วย 2 มิเตอร์) **เทียบกับ `buildDormBill` ตัวจริงทุกห้อง** (ไม่ฮาร์ดโค้ดยอดที่คำนวณได้)
- positive control เขียวตั้งแต่ก่อนทำ (ต้องคงเขียว): PC-1 สูตร D.1 ฉาก พ.ย. · PC-2 `utilityCharges`/`utilityBillingGate` ของฉาก (D.7) · PC-3 `createExternalInvoice` DORM idempotent + ลิงก์จ่าย (D.2) · PC-4 `heldRooms`/`periodUsage` ของฉาก (D.6 · 112 = 173 หน่วย) · PC-5 ตัวยิง 4 โพรเซส (ใบแจ้งหนี้ ref เดียว 12 ทาง = 1)
- **perf** (ค่าคงที่หัวไฟล์ · ผู้คุมปรับได้): P-1 เตรียมรอบ 36 ห้อง < 5 วิ · P-2 ส่ง 31 บิล: ทุกการเรียก ≤ 30 วิ · รวม ≤ 60 วิ · P-3 300 ห้อง: เตรียม < 30 วิ · ส่งเป็นชุด (ทุกการเรียก ≤ 30 วิ · `done:false` แล้วเรียกต่อ) + โพรเซสที่สองยิงซ้อนกลางทาง ⇒ ใบแจ้งหนี้ = 300 พอดี · P-4 `maxBills` หยุดกลางทางแล้วทำต่อไม่ซ้ำ

## 9. มติผู้คุมในใบนี้ (ส่งผู้ตรวจบัญชี J4 / ที่ปรึกษา J3 พร้อมชุด)
1. **perf ตีความ**: แถวแผน "36 ห้อง < 5 วิ · 300 ห้อง < 30 วิ" ⇒ 5 วิ = **ขั้นเตรียม/ตรวจ** (คำนวณ+เขียนร่าง) · การส่ง = ทีละใบตามล็อกเงินระดับร้านของ D.2 (~0.5–0.7 วิ/ใบบน QC) ⇒ **ทุกการเรียกจบใน 30 วิ + ทำเป็นชุด ทำต่อได้** · 31 ใบรวม ≤ 60 วิ (ตัวเลขของ D.2 คิดแล้ว 5 วิไม่มีทางได้โดยไม่รื้อล็อกเงิน)
2. **ref ใบแจ้งหนี้** = `DormBill` / `<leaseId>:<periodKey>` (คงที่ — ล้มกลางทาง/ลบแถวบิลแล้วสร้างใหม่ยังได้ใบเดิม) · ใบลด/เพิ่มหนี้ ref `DormBillAdjust` / `<billId>:<คีย์>`
3. **ยอดยกมา/ยกไป**: ค้าง ต.ค. ยังอยู่ในใบ ต.ค. (ลูกหนี้ไม่ซ้ำ) ⇒ บิล พ.ย. **ไม่บวกค้างเข้าใบใหม่** (ฉาก README ฿174,126.40 ไม่รวม ฿10,200.40) · เงินเกิน (2110) ยังไม่หักบิลถัดไป ⇒ D.10/J4 · `DormBill.carriedSatang` = 0 ในใบนี้
4. **ค่าเช่าล่วงหน้า** = บรรทัด `SERVICE:ADVANCE_RENT` EXEMPT ในบิลแรก — ⚠️ J4: ลงรายได้ตามใบแจ้งหนี้ (ทางเดิมของบัญชี) หรือควรเป็นหนี้สินรับล่วงหน้าจนเดือนสุดท้าย
5. **ห้องแจ้งย้ายออก** ไม่ออกเมื่อ `moveOutDate` ≤ สิ้นเดือนค่าห้อง (ส่วนที่เหลือคิดในใบย้ายออก D.12)
6. **ลิงก์จ่าย best-effort**: เพดาน `paymentRequest` 60/ชม./สมุด ของบัญชี ⇒ หอเกิน 60 ห้องได้ลิงก์ไม่ครบในรอบเดียว (บิลยังออก · ลองซ้ำได้) — ⚠️ ขอใบแก้ชิ้นกลางบัญชี: ข้ามเพดานสำหรับผู้เรียกภายใน/ตรวจใบเดิมก่อนนับเพดาน
7. **พักบิล** ไม่นับในยอดรอบ · ห้องว่างที่มิเตอร์ผิดปกติไม่ใช่ "พักไว้" (ไม่มีบิล)
8. บรรทัดค่าปรับมือไม่เกินเพดานของสัญญา (snapshot) — ค่าปรับอัตโนมัติ/ยกเว้น/อนุมัติ = D.11
9. แก้หลังส่งไม่ผ่าน approval core (เหตุผล + audit + สิทธิ์ `dorm.bill.send`) — ถ้าเจ้าของต้องการอนุมัติเกินวงเงิน = D.13
10. `FIRST_RENT` ยังไม่รองรับ ⇒ บิลแรกพักด้วยรหัสชัด (ไม่เงียบ) — ทางรับเงินจองเข้าค่าห้อง = ใบแก้ D.5 + J4

## 10. regression · X · ส่งต่อ · หนี้
- ต้องเขียวเท่าเดิม (G รันหลังล้างข้อมูล — บทเรียน D.5): `qc-svc-d.2` · `qc-svc-d.7 --no-regression` · `qc-svc-d.6 --no-regression` · `qc-svc-d.5 --no-regression` · `qc-svc-d.1` · `qc-acc-v2-gl-inclvat` · `qc-acc-v2-payments` · `qc-acc-v2-guard` · `qc-account-api-write-docs` · `qc-svc-smoke` (ชุด acc-v2 security/coa/journal + crm-c2.7 แดงตั้งแต่ฐาน = SVC-D4 ไม่อยู่ใน G) · typecheck (ISO_MEM=9000M · heap 7168) · fitness 2 โหมด
- X: X1 (X-1..6) · X3 (N-7 N-8 R-11 A-2) · X5 (J-2 J-3 P-3) · X6 (C-2) · X8 (N-5 payload ไม่มี PII · U-10) · X9 (A-* เหตุผล+audit) · ไม่เกี่ยว: X4 (consumer = hook ว่าง) · X7 (ไม่มี endpoint สาธารณะ — พอร์ทัล D.9) · X10 (ไม่มีไฟล์ใหม่)
- ส่งต่อ: **D.9** consumer `dorm.billrun.sent` ⇒ `notifyCustomer` (dedupeKey `rooms:bill:<billId>`) + ลิงก์เซ็น + `sentVia` จริง · **D.10** `paidSatang`/สถานะบิลจากรับชำระ + ยอดเกินยกไป (`carriedSatang`) · **D.11** ค่าปรับอัตโนมัติผ่านช่อง `LATE_FEE` ของ §3.3 · **D.12** ค่าห้อง/น้ำไฟเศษเดือนในใบย้ายออก + เดือนสุดท้ายหักค่าเช่าล่วงหน้า · **D.13** ความคืบหน้ารอบบิลในผังห้อง (`billRunModel`) · **D.19** รายได้แยกประเภทจาก `DormBill.lines`
- หนี้ที่รู้แล้ว: (1) เพดานลิงก์จ่าย 60/ชม. (มติ 6) (2) ล็อกเงินระดับร้าน ⇒ ส่งทั้งตึกช้า (มติ 1) (3) MOVE_IN กับวิธี TARIFF/SHARED/FLAT ใช้ยอดเต็มของแถว (4) บริการ `required: false` ยังไม่มีทางเลือกต่อสัญญา (D.13) (5) `FIRST_RENT` (มติ 10)
