# T1.6a1 — ร้านยกเลิกรอบที่มีคนจอง (a1) · บันทึกผู้สร้าง

- ใบ `ledger/trips-briefs/T1.6.md` ร่างรอบ 2 · ข้อสอบ `scripts/qc-trips-t1.6.mts` (68 ข้อ) · เลน l2 · `wip/trips-t1.6` @c069bdf62
- **สถานะ: หยุดที่ชิ้นแรก (migration + schema + ทะเบียน scope + ตัวช่วยบริสุทธิ์)** — เหตุ 2 ข้อ: (1) งบบรรทัดของ `trips.prisma` เกิน (ข้อหยุดของผู้คุม: เกินงบ ⇒ หยุดรายงาน) (2) session ของผู้สร้างนี้ใช้บริบทไปกับ T1.7a2 สามรอบแล้ว — เส้นเงิน ~1,500 บรรทัดที่เหลือควรให้ session ใหม่ทำต่อจากบันทึกนี้ ไม่ทำครึ่ง ๆ บนทางเงิน

## ที่ทำแล้ว
- `prisma/migrations/20270201000300_trips_t16a_departure_cancel/migration.sql` = §3 ตรงตัว (SQL ด้านล่าง) · ลำดับโฟลเดอร์ต่อจาก `20270201000200_agency` (l1 W1.4a ไม่มี migration)
- ลงฐาน QC ของเลนนี้เท่านั้น: `bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` ⇒ applied · wrapper เลือกฐานจาก `.env.qc-trips` ของทรีนี้ (ตรวจ host allowlist · ปฏิเสธ prod) · `prisma.config.ts` โหลด `.env` เฉพาะถ้ามี — ทรีนี้ไม่มี `.env` และทดลองแล้วว่า `process.loadEnvFile` ไม่ทับตัวแปรที่ wrapper ตั้ง (Node 20.20.2)
- **ฐาน QC อีก 2 ฐานของ TRIPS ยังไม่ได้ลง** (คำสั่งผู้คุม: ฐานของเลนนี้เท่านั้น)
- `pnpm drift` (ผ่าน wrapper): exit 2 แต่ 23 ตารางที่ต่างเป็นของเดิมทั้งหมด (unique/FK ที่เป็น SQL มือ เช่น TripDeparture (productId, optionId, startsAt) NULLS NOT DISTINCT · HrWorkEntry FK) — **ไม่มีรายการของ T1.6a** (ไม่มี TripDepartureCancelOutcome · cancelKind/cancelDecideBy/cancelOptions · ดัชนีบางส่วนไม่ถูกรายงาน) ⇒ เกณฑ์ "diff ว่าง" ใช้ได้เฉพาะของใบนี้ ไม่ใช่ทั้งฐาน (ความหมายของ `pnpm drift` = เทียบฐานจริงกับ schema ทั้ง repo)
- `prisma/schema/trips.prisma`: 3 คอลัมน์ + model `TripDepartureCancelOutcome` (FK 2 ตัว `onDelete: Restrict, onUpdate: NoAction` ให้ตรงกับ REFERENCES ของ SQL · `createdAt` ไม่มี default ตาม SQL — บริการต้องตั้งเอง) + relation ย้อนกลับบน TripDeparture และ TripBooking · `prisma validate` ผ่าน · `prisma generate` แล้ว (ไม่ได้รัน `prisma format` ทั้ง repo — format เปลี่ยน 25 ไฟล์ของคนอื่น จึงย้อนแล้วแก้มือ)
- `src/lib/core/scope.ts`: `TripDepartureCancelOutcome: unit,` 1 บรรทัด (C12)
- `src/lib/modules/trips/cancel-departure-core.ts` (CANCEL_KINDS · CANCEL_OUTCOMES · CONSENT_CHANNELS · decideByOf · cancelOptionsOf · cancelOutcomeOf · fullRefundSplitOf) + บล็อก facade `// ── T1.6a1 cancel-departure ──` ใน index.ts

## ผลข้อสอบ (รันครั้งเดียว)
`qc-trips-t1.6` **15/68** — PC 9/9 · S 1/8 (S-2 เขียว: migration ตรง §3 · FK RESTRICT 2 · ดัชนี · ทะเบียน scope) · P 5/5 · CD/GD/RF/NM/RC/AC/PG/PM 0 (ยังไม่มีบริการ/action/จอ — แดงตามคาด)
- S-3 แดงเพราะ **`trips.prisma` +26/−0 (งบ +22/−0)** — ขั้นต่ำที่ทำได้: 3 คอลัมน์ + model 20 บรรทัด (12 ช่อง + 2 relation + 3 ดัชนี + เปิด/ปิด/บรรทัดว่าง) + relation ย้อนกลับ 2 บรรทัด (Prisma บังคับเมื่อมี FK ที่ S-2 ตรวจ) + บรรทัดว่างคั่น model 1 · งบ +22 ไม่ได้นับ relation ย้อนกลับ/FK ⇒ **ขอผู้คุมขยายงบเป็น +26** (ไม่ตัด FK เพราะ S-2 และ §3 บังคับ)
- ไม่ได้รัน t0.7 / t1.2 / w1.3 / typecheck / fitness (หยุดก่อนชิ้นบริการ)

## SQL ของ migration
```sql
ALTER TABLE "TripDeparture" ADD COLUMN "cancelKind" TEXT, ADD COLUMN "cancelDecideBy" TIMESTAMP(3), ADD COLUMN "cancelOptions" JSONB;
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_cancelKind_check"
  CHECK ("cancelKind" IS NULL OR "cancelKind" IN ('EXTERNAL','MIN_NOT_MET','SHOP_FAULT'));
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_cancelWithBookings_check"
  CHECK (("cancelKind" IS NULL AND "cancelDecideBy" IS NULL AND "cancelOptions" IS NULL)
      OR ("cancelKind" IS NOT NULL AND "cancelDecideBy" IS NOT NULL AND "status" = 'CANCELLED' AND jsonb_typeof("cancelOptions") = 'array'));
CREATE INDEX "TripDeparture_cancelDecideBy_idx" ON "TripDeparture" ("tenantId", "cancelDecideBy") WHERE "cancelKind" IS NOT NULL;
CREATE TABLE "TripDepartureCancelOutcome" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
  "departureId" TEXT NOT NULL REFERENCES "TripDeparture"("id") ON DELETE RESTRICT,
  "bookingId" TEXT NOT NULL REFERENCES "TripBooking"("id") ON DELETE RESTRICT,
  "choice" TEXT NOT NULL, "by" TEXT NOT NULL, "refundRequestId" TEXT, "consent" JSONB,
  "at" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripDepartureCancelOutcome_choice_check" CHECK ("choice" IN ('PENDING','MOVED','REFUND','NO_MONEY','AGENCY_MONEY_HELD')),
  CONSTRAINT "TripDepartureCancelOutcome_by_check" CHECK ("by" IN ('STAFF','SYSTEM_DEFAULT')),
  CONSTRAINT "TripDepartureCancelOutcome_consent_check" CHECK (("choice" = 'MOVED') = ("consent" IS NOT NULL AND jsonb_typeof("consent") = 'object')),
  CONSTRAINT "TripDepartureCancelOutcome_refund_check" CHECK ("choice" <> 'REFUND' OR "refundRequestId" IS NOT NULL)
);
CREATE UNIQUE INDEX "TripDepartureCancelOutcome_departureId_bookingId_key" ON "TripDepartureCancelOutcome" ("departureId", "bookingId");
CREATE INDEX "TripDepartureCancelOutcome_tenantId_unitId_choice_idx" ON "TripDepartureCancelOutcome" ("tenantId", "unitId", "choice");
CREATE INDEX "TripDepartureCancelOutcome_bookingId_idx" ON "TripDepartureCancelOutcome" ("bookingId");
```

## ข้อสังเกตถึง session ถัดไป (ยังไม่ได้ตรวจลึก)
- `createdAt` ของแถวผลไม่มี default ⇒ ทุก INSERT ต้องใส่ `createdAt`/`at` จาก `now` ที่ฉีด
- ลำดับรันของข้อสอบหลัง migration: CD → GD → RF → NM → RC → AC → PG → PM (GD ต้องมาก่อนงวดของ dC ถูกปิด)
- ยังไม่ได้อ่าน refund.ts / money.ts / booking.ts / capacity*.ts / jobs.ts / departure-desk.ts / departure-screens.ts / booking-screens.ts / trips-self*.ts สำหรับรั้ว §6 — ไม่มีข้อแย้งต่อสัญญา §5.4 จากส่วนที่อ่าน

---
## ส่วนที่ 2 — ผู้สร้างคนที่สอง (26 พ.ย. · ต่อจากชิ้นแรก)
**สถานะ: a1 สร้างครบ (บริการ · รั้ว §6 · action · จอ · ข้อความ) · ยังไม่ commit/push/build**

### ไฟล์ (เทียบ BASE 5953d5061 · งบ §1)
ใหม่: `cancel-departure.ts` 580 (ใบ ≈520 · เกินเพราะรวมตัวอ่านของจอ departureCancelSummaryOf/bookingCancelChoiceOf ~110 บรรทัด ที่ใบเรียก loadCancelChoicesVM) · `cancel-departure-actions.ts` 54 · `src/components/trips/DepartureCancel.tsx` 153 · `cancel-departure-core.ts` 38 (ชิ้นแรก 50 → ย้ายตัวคิด fullRefundSplitOf ไป money-core แล้ว re-export)
เดิม (+/−): refund.ts +51/−4 (งบ +70/−4) · money-core.ts +25/−0 (+35) · money.ts +10/−0 (+25) · booking.ts +5/−1 (+25/−2) · capacity-service.ts +9/−0 (รวม capacity* +16) · jobs.ts +2/−1 (+8/−1) · departure-desk.ts +5/−0 (+14/−2) · departures.ts 0 (ไม่ต้อง export — lockDeparture/releaseUsesTx มาจาก resources.ts อยู่แล้ว) · departure-screens.ts +8/−1 (+45/−2) · booking-screens.ts +11/−0 (+30) · trips-self.ts +2/−1 (+20/−2) · 4 คอมโพเนนต์ +19/−1 (+70/−6) · outbox-consumers +2 · labels +2 · index.ts +4 · th/en +31 · trips.prisma +26 (ชิ้นแรก) · scope.ts +1 (ชิ้นแรก)

### การตัดสินใจ / ข้อเบี่ยง (ตามลำดับความสำคัญ)
1. **ป้าย N4** อยู่ใน computed ของคำขอเอง (ใบเสนอ fullRefundQuoteFromReceipts คืน `path:"DEPARTURE_CANCEL", fullRefund:true, refundBp:10000` แล้ว `...quote` ของ fileRefundRequestInTx/requoteApproved พาไป) · ตัวอ่านป้าย `fullRefundOf(computed)` ใน refund.ts
2. **อนุมัติให้เอง** ผ่านกิ่ง X12 เดิมของ fileRefundRequestInTx โดยผู้เรียกส่ง `autoApproveUpTo = INT4` (ไม่อ่านค่าตั้ง X12) — เพื่อให้ refund.ts อยู่ในงบลบ −4 · **ข้อเบี่ยง:** audit อนุมัติใช้ผู้กระทำ SYSTEM `trips.refund.autoApprove` เดิม (ไม่ใช่ `trips.departureCancel.autoApprove` ตาม §4.1) — แยกได้จาก after.auto + คำขอมีป้าย · ถ้าผู้คุมต้องการชื่องานใหม่ ต้องลบ/แก้ 1 บรรทัด (งบลบ refund.ts เต็มแล้ว)
3. requoteApproved บนคำขอมีป้าย: คิดใหม่ด้วยสูตรเต็ม แล้ว CAS APPROVED → **APPROVED** (gen+1) + อีเวนต์ requoted + approved + audit requote + approve (SYSTEM) ในธุรกรรมเดียว · ผลยังเป็น STATE_CONFLICT QUOTE_REFRESHED (ยอดใหม่) ให้ผู้กดบันทึกโอนอีกครั้ง (RF-4 ยอมรับ)
4. decideTripRefund บนคำขอมีป้าย: delta ≠ 0 หรือมี deductions ⇒ VALIDATION DEPARTURE_CANCEL_FULL_REFUND (ก่อนตรวจอื่น) · ปฏิเสธคำขอ (REJECT) ⇒ แถวผลกลับ PENDING · withdrawTripRefund ⇒ แถวผลกลับ PENDING (refundRequestId = NULL · ประวัติอยู่ใน audit)
5. **รั้ว requestCore** อ่าน cancelKind ใต้ล็อกแถวการจอง (อ่านไม่ล็อก · N14) ก่อนด่านอื่นใน tx · cancelTripBooking (QUOTE/EXECUTE ของการจองที่ขายแล้ว) ตรวจก่อนด้วย (ครอบ quoteBookSelfCancel) · trips-self mapService: เหตุ DEPARTURE_CANCELLED_USE_RESOLVE ⇒ `NOT_ALLOWED` + `reason` (หน้าลูกค้าแสดงสถานะ = b)
6. **ยกเลิกรอบไม่ขยับ version ของการจองที่ยืนยันแล้ว** (ถ้าขยับ คำขอลูกค้าที่อ่านรุ่นไว้ก่อนจะได้ STATE_CONFLICT เปล่าแทน DEPARTURE_CANCELLED_USE_RESOLVE — CD-11) · ผลคือ resolve รับ expectedVersion ติดลบได้ (ผิดรุ่นใด ๆ ⇒ STATE_CONFLICT ไม่ใช่ VALIDATION · NM-1)
7. **version ของรอบ**: การปล่อยถือที่ใน tx ขยับ version ทุกครั้ง (statusAfter ของ capacity.ts) — UPDATE สุดท้ายตั้ง `version = ที่ผู้ยกเลิกเห็น + 1` (ถือแถวรอบตลอด ค่าระหว่างทางไม่มีใครเห็น) ⇒ CD-2 "version +1" และ CAS ของจอทำงานตามเดิม
8. รายการรอ WAITING ปิดก่อนปล่อยถือที่ (ไม่งั้น releaseCoreTx เสนอที่ว่างให้รายการรอ ⇒ ถือที่ WAITLIST_OFFER ACTIVE ค้างบนรอบยกเลิก) แล้วกวาด WAITING/OFFERED อีกครั้งหลังปล่อย
9. N13: payTx (money.ts) เมื่อรอบมี cancelKind ⇒ ถอนคำขอเปิดก่อนบรรทัด openRefundOf เดิม (ไม่แตะบรรทัดเดิม · งบลบ money.ts = 0) แล้วยื่นใหม่หลัง CAS การจอง ผ่าน `withdrawForPaymentInTx` ของ cancel-departure.ts (import แบบ dynamic ในฟังก์ชัน — กันวง import money ↔ cancel-departure) · ไม่มีคำขอเปิด ⇒ รับเงินอย่างเดียว (นับเข้ายอดคืนตอนร้านกดคืน)
10. ทางไม่มีเงิน `settleNoMoneyInTx`: ลำดับล็อกเดียวกับบันทึกโอนคืน (1a คืนที่นั่ง → 2b การจอง → แถวผล FOR UPDATE) · การจอง CANCELLED ผ่าน transitionBookingInTx · audit `trips.booking.cancel_choice` ใช้ auditTx (actor USER)
11. **ตัวกรองรายการการจอง** ผ่านช่อง `dep` เดิมของ URL (`dep=cancel:pending|cancel:overdue` + `when=all`) — หน้า `bookings/page.tsx` และ `BOOKING_LIST_CHIPS` (booking-view-core) อยู่นอกขอบเขต แก้ไม่ได้ · ตัวโหลดแปลงค่าแล้วล้าง dep/หน้าต่างวัน · "ป้ายแถว" ในตารางยังไม่ทำ (BookingsTable อยู่นอกงบ)
12. **กล่องตัดสินต่ำกว่าขั้นต่ำ (DecideDialog) ไม่แก้**: ปุ่ม CANCEL ของกล่องนี้ปิดอยู่แล้วเมื่อรอบมีคน (cancelBlocked) ⇒ จอไม่ส่งฟิลด์ใหม่ · ผู้ใช้ยกเลิกรอบต่ำกว่าขั้นต่ำที่มีคนผ่านปุ่มใหม่ (เลือกเหตุ "คนไม่ครบขั้นต่ำ") · บริการ/ action decideBelowMin รับฟิลด์ใหม่ครบ (CD-12 AC-4)
13. ข้อความอังกฤษใช้ "THB {x}" (อักษร ฿ อยู่ในช่วงอักษรไทย U+0E3F ⇒ S-8/PG "อังกฤษไม่มีอักษรไทย")
14. คำเตือนโอนค้าง: เวลาอนุมัติ = `computed.requotedAt ?? computed.quotedAt` ของคำขอมีป้าย (อนุมัติพร้อมยื่น/คิดใหม่เสมอ · นาฬิกาที่ฉีด) — ไม่ใช้ AuditLog.createdAt (นาฬิกาฐาน) · 3 วันเป็นค่าคงที่ตามมติ N5 (ซ้ำในคอมโพเนนต์ 1 จุดเพื่อแสดงข้อความ)
15. ผู้ไม่มีเงินใน action FORBIDDEN: action คืน `{ ok:false, code:"FORBIDDEN" }` ก่อนอ่านข้อมูลใด · บริการตรวจสิทธิ์ซ้ำเอง (N3) · action ใช้ `auth.active` เป็น MembershipCtx ตรง ๆ

### ผลข้อสอบ (รันสุดท้าย)
- `qc-trips-t1.6` **66/68** (PC 9/9 · S 8/8 · P 5/5 · CD 13/13 · GD 4/5 · RF 9/9 · NM 5/5 · RC 3/3 · AC 4/4 · PG 4/4 · PM 2/3)
  - **GD-1 — ข้อสอบผิด (ตัวควบคุม):** การจอง qa ถูกจองก่อนข้อสอบตั้ง `trips.pay.overdueAction = AUTO_RELEASE` ⇒ snapshot ของ qa จด NOTIFY_SHOP · markTripDueOverdue อ่าน T17 จาก snapshot (money.ts `snapshotValue(... "trips.pay.overdueAction")`) ⇒ qa ได้ OVERDUE แต่ไม่มีคำขอ AUTO_RELEASE ไม่ว่าโค้ดใบนี้ทำอะไร · ส่วนที่เป็นของใบ (งวด b2 b3 b11 ไม่เปลี่ยน · ไม่มี outbox/คำขอใหม่) ผ่าน · แก้ได้โดยตั้งค่าก่อนจอง qa
  - **PM-3 — ข้อสอบขัดกับ §7 และ rbac เดิม:** `checkNoEscalation` (staff/service.ts:206) ให้ MANAGER แจกคีย์ใดก็ได้ เพราะ rbac ให้ MANAGER ผ่านทุกคีย์ (rbac.ts ~:127) — PM-1 ก็ต้องการให้ MANAGER ยกเลิกรอบได้ (= มี refund.approve โดยปริยาย) · §7 ช่อง "แจก" เขียนว่า "คีย์ปกติ" · ทำให้เขียวต้องแก้ `src/lib/staff/**` (ห้าม) ⇒ ไม่แตะ · เสนอผู้คุม: ตัดข้อ หรือออกมติให้ trips.refund.approve เป็นคีย์เฉพาะเจ้าของ (ใบอื่น)
- ข้างเคียง (รันครั้งเดียว):
  - `qc-trips-t0.7` 148/150 — **S-3** (money-core import ได้แค่ zod/money-math/snapshot/booking-core) แดงในรันนั้นเพราะ money-core import ./cancel-departure-core → **แก้แล้วหลังรัน** (ย้าย fullRefundSplitOf เข้า money-core · cancel-departure-core re-export) — ยังไม่ได้รัน t0.7 ซ้ำ (คำสั่งรันครั้งเดียว) · **S-15** ขอบเขต (migration · trips.prisma · capacity-service.ts) = ORACLE-EDIT ที่คาด (C9 ขอบเขต)
  - `qc-trips-t1.2` 96/98 — **DA-5** CANCEL รอบที่มีถือที่ ⇒ ได้ FORBIDDEN (ทางใหม่ N3 ตรวจ refund.approve) แทน HAS_BOOKINGS = ORACLE-EDIT ที่คาด (C9 HAS_BOOKINGS ของตัวตัดสิน) · **S-13** ขอบเขต capacity-service/jobs = ORACLE-EDIT ขอบเขต (ไฟล์อยู่ในงบ §1)
  - `qc-trips-w1.3` 118/120 — **S-5** "changeImpl ต้องไม่เปลี่ยนจาก BASE" (รั้ว §6 ใน changeImpl ตามใบ) · **S-10** ขอบเขตไฟล์ = ORACLE-EDIT ขอบเขต (C9)
  - ไม่มีข้อแดงประเภท "โค้ดขัดมติ" ใน t0.7 (รั้ว requote/decide/withdraw และ "คำขอเปิด ⇒ รับเงินไม่ได้" ยังเขียวบนรอบปกติ)
- typecheck (ครั้งเดียว): 1 error `cancel-departure.ts:363` (`tr.value` หลัง `abort()` ที่ TS ไม่ narrow) → แก้เป็น `return abort(...)` หลังรัน · **ยังไม่ได้ typecheck ซ้ำ** (คำสั่ง: ครั้งเดียว) — การแก้เป็นบรรทัดเดียว ชนิดถูกแน่นอน แต่ผู้คุมควรรันซ้ำ
- fitness (ครั้งเดียว · หลังแก้ money-core แต่ก่อนแก้บรรทัด abort): **54/54** · CRITICAL 0 MAJOR 0 MINOR 0
- รัน qc-trips-t1.6 ครั้งสุดท้ายบนสถานะปัจจุบัน (หลังทุกการแก้): 66/68 เหมือนเดิม (GD-1 · PM-3) · ร้าน/ผู้ใช้ชั่วคราวค้าง 0

### ยังไม่ได้ทำ/ตรวจ
- ภาพ (1440/390 th/en) · กดจริง 2 แท็บ · migration ลงฐาน QC TRIPS อีก 2 ฐาน · `prisma migrate diff` · ป้ายแถวในตาราง · DecideDialog (ข้อ 12) · scripts/trips-ui-inventory.json (ไม่ได้เพิ่ม testid ใหม่)
- การยกเลิกพร้อมถือที่โควตาเอเจนซี่ (qtyAllot > 0) — releaseCoreTx ปฏิเสธ AGENCY_NOT_ENABLED ⇒ ยกเลิกรอบล้มทั้งก้อน (วันนี้สร้างไม่ได้จน A1.4)

---
## ส่วนที่ 3 — มติรอบ 3 (F1–F6) · ฐาน 3e0bf00ba (wip 939ba6bb6) · ไม่ได้รันข้อสอบตามคำสั่ง · typecheck เต็ม 1 ครั้ง = **สะอาด (exit 0)**
- **F1 (ก)** `money.ts:484–486` payTx บนรอบที่ร้านยกเลิก: รับเมื่อมี `slipId` (สลิปที่ slipGate ตรวจแล้ว) **หรือ** tender กลุ่ม BANK (PROMPTPAY/TRANSFER) + `reference` (หลักฐานโอน) ไม่ว่าง · อื่น (เงินสด · บัตร · โอนไม่มีอ้างอิง) ⇒ `STATE_CONFLICT DEPARTURE_CANCELLED_SLIP_ONLY` · **การตีความ:** "หลักฐานโอน" = ช่อง `reference` ที่มีอยู่ (ไม่มีคอลัมน์ไฟล์หลักฐานใน TripMoneyEvent) — ถ้าผู้คุมต้องการเฉพาะ slipId ตัด 1 เงื่อนไข · ข้อสอบเดิม NM-3 ใช้ PROMPTPAY ไม่มี reference จะถูกปฏิเสธ (ผู้เขียนข้อสอบปรับ)
- **F1 (ข)** ตัวคิด `receivedAfterCancelOf` (`money.ts:151–156`): มีแถว `TripMoneyEvent` kind RECEIVED ของการจองที่ `createdAt` > `TripDepartureCancelOutcome.createdAt` ของ (รอบ, การจอง) — ทั้งคู่จดด้วยนาฬิกาของคำขอ (payTx `${iso}` · cancel `${iso}`) ไม่ต้องมี migration · ใช้ที่ `cancel-departure.ts:371` (fileFullRefundInTx — ทั้ง resolve REFUND และการยื่นใหม่ใน payTx ⇒ `autoApproveUpTo = 0` ⇒ QUOTED ติดป้าย) และ `refund.ts:884` (requote: ป้าย ∧ ไม่มีเงินเข้าหลังยกเลิก ⇒ อนุมัติซ้ำเอง · มี ⇒ กลับ QUOTED รอผู้อนุมัติ) · decideTripRefund อนุมัติคำขอ QUOTED ที่ติดป้ายได้โดยไม่มี delta (RF-6 เดิม) · delta/หัก ⇒ DEPARTURE_CANCEL_FULL_REFUND ตามเดิม
- **F2** `cancel-departure.ts:484–492` การยื่นใหม่หลังรับเงิน: ลำดับใหม่จากจำนวน audit ทางเลือก + เขียน audit `trips.booking.cancel_choice` (refundRequestId ใหม่ · refiledFrom · requestStatus) ⇒ กุญแจอีเวนต์ไม่ซ้ำของเดิม
- **F3** `refund.ts` requote: `after.status` = สถานะจริง (APPROVED/QUOTED) · ผู้อนุมัติให้เองของทางนี้ = SYSTEM `trips.departureCancel.autoApprove` ทั้งตอนยื่น (`refund.ts:337` — เลือกตาม `a.fullRefund`) และตอน requote
- **F4** `cancel-departure.ts:413–421` คีย์เดิม ⇒ อ่านแถวผลปัจจุบัน: ยังเป็นทางเดิม ⇒ ok replayed พร้อม refundRequestId/ยอด **ปัจจุบัน** (เช่นหลังยื่นใหม่จากสลิป) · ถูกถอน/ปฏิเสธจนกลับ PENDING ⇒ `STATE_CONFLICT CHOICE_CHANGED` · ลิ้นชักออกกุญแจใหม่ทุกครั้งที่กด (ไม่เก็บในหน้า) — เข้มกว่า "ต่อการเรนเดอร์"
- **F5** เวลาอนุมัติเก็บเป็น `computed.approvedAt` (คอลัมน์ jsonb เดิม): อนุมัติให้เองตอนยื่น (`cancel-departure.ts:385`) · อนุมัติมือใน decideTripRefund (`refund.ts:571` · ทุกคำขอ) · requote คงค่าเดิม (`refund.ts:889`) · คำเตือนใช้ **ค่าน้อยสุด** ของคำขอติดป้ายทุกใบของการจอง (`cancel-departure.ts:570`) ⇒ ยื่นใหม่/requote ไม่รีเซ็ต
- **F6** resolve REFUND บนการจองที่ไม่ใช่ THB ⇒ `CURRENCY_NOT_ALLOWED` reason `CURRENCY_NOT_THB` (รหัสเดียวกับ moneyBookingGate) ทั้งก่อน tx และใต้ล็อก
- งบ (เทียบ BASE): refund.ts **+58/−6** (งบ +70/−6) · money.ts +19/−0 (+25) · cancel-departure.ts 596 · ไฟล์อื่นไม่เปลี่ยนจากรอบ 2
- ยังไม่ทำ: จอไม่มีป้าย "รอผู้อนุมัติ" สำหรับคำขอ QUOTED ของ F1(ข) (ลิ้นชักแสดง "บันทึกคืนเงินเต็มแล้ว ฿x" · ผู้อนุมัติใช้ทางอนุมัติคำขอคืนเงินเดิม)

## ส่วนที่ 4 — รอบ 4 (RF-10 · F3)
- auditMoney จดผู้กระทำ SYSTEM เป็น actorId null (ชื่องานจดเฉพาะ trips.public.self) ⇒ เพิ่ม `after.approvedBy = "trips.departureCancel.autoApprove"` เฉพาะทางนี้: อนุมัติให้เองตอนยื่นเมื่อ `a.fullRefund` (refund.ts:343) และอนุมัติซ้ำใน requote (refund.ts:918) · ค่าคงที่ refund.ts:87 · ไม่แตะ money.ts / audit ของทางอื่น
- refund.ts รวม +60/−6 (งบ +70/−6) · money.ts +19 (ไม่เปลี่ยน)
- qc-trips-t1.6 82/82 · qc-trips-t0.7 150/150 · typecheck สะอาด

## ส่วนที่ 5 — รอบ 5 (H1–H7 · ฐาน d0e809100)
- **H7** ตัดสินจากข้อเท็จจริงว่าเข้ากิ่ง: payTx เขียน `after.departureCancelled: true` ใน audit `trips.payment.record` เมื่อรอบมี cancelKind (money.ts · บรรทัดใน after ของ auditMoney ของ payTx) · `receivedAfterCancelOf` (money.ts:151–158) = เทียบเวลา (เดิม) **หรือ** มี audit นั้นของการจอง ⇒ ไม่ขึ้นกับนาฬิกาของคำขอ · การยื่นใหม่ใน payTx (audit ยังไม่เขียนตอนนั้น) ส่ง `lateMoney: true` ตรง (cancel-departure.ts fileFullRefundInTx/withdrawForPaymentInTx) ⇒ QUOTED เสมอ · ไม่มี migration
- **H5** departure-desk: CANCEL + idempotencyKey + รอบ CANCELLED ⇒ เรียกบริการ (กันซ้ำของบริการตอบ replayed) ก่อนด่าน NOT_BELOW_MIN · ผลมี `replayed`
- **H1** ลิ้นชัก (ก้อน trips-bk-depcancel): ป้าย `trips-bk-depcancel-state` (รออนุมัติ / อนุมัติแล้ว รอโอน / คืนแล้ว) · ฟอร์ม SSR `trips-bk-depcancel-approve` (hidden requestId · decision=APPROVE · idempotencyKey) เรียก decideTripRefundAction เดิม · `trips-bk-depcancel-transfer` (hidden requestId · select bankTender TRANSFER/PROMPTPAY · idempotencyKey) เรียก executeTripRefundAction เดิม · สิทธิ์จาก VM (refund.approve / refund.execute) · การ์ดรอบแยก "รออนุมัติ n (฿x)" กับ "อนุมัติแล้วรอโอน n (ต้องโอน ฿y)" · คำเตือน 3 วันชี้ปุ่ม "บันทึกว่าโอนคืนแล้ว"
  - **ข้อเบี่ยง:** ฟอร์มโอนคืนไม่มีช่อง `reference` (ช่องว่างจะไม่ผ่าน MONEY_REFERENCE ของ action ที่เป็น strict) และไม่มีตัวเลือก "ตามช่องทางที่รับ" (select ต้องมีค่า · bankTender ใช้เฉพาะใบรับกลุ่มธนาคาร ใบรับเงินสดคืนเป็นเงินสดตามเดิม)
- **H2** ปุ่มทางออก/ฟอร์มใช้ `useRef` กันกดซ้ำ + กุญแจ `useState(() => newKey())` ต่อปุ่มที่เรนเดอร์ · ล้ม ⇒ router.refresh · กล่องยืนยันมี `trips-depcancel-mismatch`
- **H3** REASON_CODES ของ BookingParts +3 รหัส + ข้อความ bookings.reason.* (th/en) · ลิ้นชักไม่แสดง trips-bk-qr บนรอบที่ร้านยกเลิก · **ข้อเบี่ยง:** กล่องรับเงิน (BookingDialogs.tsx · นอกงบ) ไม่ได้แก้ — ยังเลือกเงินสด/บัตรได้และช่องอ้างอิงไม่บังคับในจอ · บริการปฏิเสธ (SLIP_ONLY) พร้อมข้อความเฉพาะ · ปุ่มรับเงินยังเปิดด้วยเงินสดเป็นค่าเริ่ม (งบลบกลุ่มคอมโพเนนต์ −6 ใช้หมดกับ H4)
- **H4** แผงรอบซ่อน `trips-dep-cancel` เมื่อรอบมีคน (cancelBlocked) · กล่องเดิม/กล่องตัดสินชี้ปุ่มใหม่ (`depCancel.useNewButton`) · ข้อความ cancelDialog.blockedLong / decide.peopleOnly แก้ให้ชี้ปุ่มใหม่
- **H6** "ยังไม่มีเงินในระบบ {k}" · "ปิดแบบไม่มีเงิน {e}" · ไม่มี "ย้ายแล้ว"
- งบเทียบ BASE: money.ts +21/−0 (+25) · departure-desk +12/−1 (+14/−2) · booking-screens +11 (+30) · cancel-departure.ts 608 (read-model +17 ในรอบนี้ · งบ +30) · DepartureCancel.tsx 231 (+97 ในรอบนี้ · งบ +110) · กลุ่ม Panel/Dialogs/BookingsScreen/Drawer +24/−6 (+70/−6) · BookingParts +3 (+12) · ข้อความ +13 คีย์ต่อภาษา (+14) · th −2 / en −1
- typecheck สะอาด (exit 0)
- qc-trips-t1.6 (ครั้งเดียว): **90/91** · แดงเดียว S-3 "แตะไฟล์ต้องห้าม BookingParts.tsx" = ข้อสอบยังไม่ได้เพิ่ม BookingParts.tsx (+12) เข้า LIMITED ตามมติ H3 (ORACLE-EDIT ที่คาด · ไฟล์ +3/−0)

## ส่วนที่ 6 — รอบ 6 (H8)
- `BookingDialogs.tsx` +7/−4 (งบ +14/−4) · PayDialog: `shopCancelled = vm.cancelChoice !== null` · ค่าเริ่ม TRANSFER (เว้นเปิดมาด้วย PROMPTPAY) · ปุ่มวิธีจ่ายเหลือ TRANSFER/PROMPTPAY · พร้อมเพย์บนรอบที่ร้านยกเลิกเป็นการกรอกยอดเอง (ไม่ออก QR) · ช่องอ้างอิง `required` + ป้ายใหม่ `depCancel.payReferenceRequired` ("บังคับ") · กดบันทึกโดยไม่มีอ้างอิง ⇒ ข้อความ SLIP_ONLY ไม่ส่งคำขอ · รอบปกติไม่เปลี่ยน
- ข้อความ +1 คีย์ต่อภาษา (รวม 14) · qc-trips-t1.6 **91/91** · typecheck สะอาด
