# ใบสั่ง B.8 — มัดจำรุ่นแรก (จองคิว) · ตรวจ: **เข้ม** (เงิน · สคบ. · ข้ามร้าน · ทางสาธารณะ) · ห้ามตัด: GL สมดุล+ยอดตรงทุกสตางค์ · เงินไม่ซ้ำข้ามโพรเซส (X3/X4/X5) · แยกร้าน (X1) · token ผิด = คำตอบเดียว (X7) · ไม่มี PII ใน event/หน้า (X8) · สิทธิ์สด · UI ตรงแบบ (03ค)

> อ้างอิง: MASTER-PLAN แถว B.8 · `DESIGN-BOOKING-QUEUE.md` R3 §1 ข้อ 6 (BQ-3) · ภาคผนวก ก #33–37 · CC §3 (สลิป/ทางรับเงิน) §1.6 (snapshot ชนะ) · ภาพ `ledger/design-booking/03-online-booking.png` (ค: "จ่ายมัดจำตอนนี้ ฿300 · PromptPay ฿300 สแกนจ่ายภายใน 15 นาที · ปุ่ม จ่ายมัดจำ ฿300 · ยืนยันนัด") + `08-settings.png` (มัดจำ: QR พร้อมเพย์ · ร้านกดยืนยัน หรือตรวจสลิปอัตโนมัติ · "ไม่มา / ยกเลิกช้า ร้านเก็บมัดจำ 100%") + `07-done-to-pos.png` (หักมัดจำในบิล = B.10)
> ใบก่อน: B.3 (`holdMinutesOf` · `expireDepositHolds` · `recordDeposit`/`refundDeposit` · `forfeitNoShowDeposit`) · B.7 (`/bq/m/<token>` · `cancelOnline` · `data-bk-deposit-slot` · มติ Q1 → คีย์ `booking.late.lateCancelMode` ย้ายมาใบนี้) · `/root/svc-runs/fix/b7.md` (O1: เลื่อนแล้วคงสถานะเมื่อมัดจำค้าง — ใบนี้ห้ามทำให้ถอย) · R0.6 (`submitSlip` · `decideSlip` · `payment.slip.approved` · `promptpayQrFor` · ตัวต่อ SLIP_VERIFY สลับได้ผ่านศูนย์เชื่อมต่อ) · POS P5.1 (`moduleTakeDeposit` · `moduleRefundDeposit` · `moduleForfeitDeposit` · `moduleUnforfeitDeposit` · `moduleDepositForBill` · O8b "ยกเลิก = มัดจำ OPEN ให้คนตัดสิน")
> บทเรียนเงิน: `/root/svc-runs/fix/d8.md` (เอกสารลอยเมื่อแข่งกัน · ยอดต้องเทียบตรงตัว · ห้ามสร้างเอกสารการเงินซ้ำเมื่อ ref มีอยู่แล้ว) · `/root/svc-runs/fix/d3.md` (ทางเลี่ยงที่ออกเอกสารซ้ำได้ต้องปิดทุกทาง)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.8.mts» — รับใบ = **ผ่านทุกข้อ** · SKIP ที่ยอมได้ระหว่างทำ: `H-*` `V-*` (ไม่มี QC_BASE) · `Q-*` (svcqc ยังไม่ seed) · `G-*` (`--no-regression`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.8.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally · ล็อกหมดเวลา = รันซ้ำ)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/svc-qc-data.mts`/สคริปต์อื่นใน `scripts/`** · temp ขึ้นต้น `svc-b8-` · รายงานต่อข้อ (id → ผล)
> **ไม่มี migration** — ใช้คอลัมน์เดิม (`depositSatang` · `depositPaidAt` · `depositSaleId` · `policySnapshot` · `cancelReason` · `PaymentSlip` · `PosDeposit`) · สถานะมัดจำ "คิดจากข้อมูล" (§3.1) ไม่เก็บคอลัมน์ใหม่
> **POS ห้ามแตะ** (กติกาเหล็กข้อ 3: POS แตะได้ 2 จุดของ B.0/B.10 เท่านั้น) — ใช้ฟังก์ชันโมดูลของ POS ที่มีอยู่ + `createSale` จุดเดียวของ booking (`bookingTxSale`)
> ผู้คุมแก้ให้แล้วในใบนี้ (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก B.8 ท้ายไฟล์ (`SQC_VISUAL_SPECS["b.8"]`)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/ ตอนรับใบ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/deposit.ts» (ใหม่ · **ห้าม import `prisma` ดิบ** — F5 · ใช้ `tenantDb` + ตัวช่วยใน service.ts) | §3 ทั้งหมด: สถานะมัดจำ · หน้าจ่าย (QR/สลิป) · consumer สลิปอนุมัติ · จอร้าน (คิวมัดจำ · ยืนยัน · คืน) · ริบ (ไม่มา/ยกเลิกช้า) · `depositForBill` (B.10) |
| `src/lib/modules/booking/service.ts` | §3.7: `expireDepositHolds` (ข้ามนัดที่มีสลิปค้าง · ยิง `booking.cancelled` DEPOSIT_TIMEOUT ใน tx เดียว) · `forfeitNoShowDeposit` อ่าน `forfeitPct` ของ snapshot · `bookAppointment` ยกเว้นสมาชิกระดับ (#37) · ตัวช่วย SQL/ล็อกที่ deposit.ts ต้องใช้ · **`busyRowsOf` `slotClear` `selfQuotaOk` `openCountForPhone` `replayOf` `holdMinutesOf` ห้ามแก้** (ข้อสอบเทียบ HEAD ทุกไบต์) |
| `src/lib/modules/booking/online.ts` | §3.5: `cancelOnline` รับ `acceptForfeit` (ยกเลิกช้าตาม `lateCancelMode`) · `loadOnlineBooking` แสดงมัดจำ 0 เมื่อสมาชิกยกเว้น (ตัวตน LINE) — เพิ่มบรรทัด/ทางแยกเท่านั้น |
| `src/lib/modules/booking/index.ts` · `access.ts` | re-export · ชื่อ action ใหม่ → คีย์สิทธิ์ (§5) |
| `src/lib/core/settings/defs/booking.ts` | **ORACLE-EDIT b.0 D-KEYS อนุญาตแล้ว**: คีย์ใหม่ `booking.late.lateCancelMode` (§2) + ใส่ใน `SNAPSHOTS.appointment` + ป้าย enum — **ห้ามแตะคีย์อื่น** |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | event ใหม่ 3 ตัว (§3.6) ลง 3 ทะเบียน · compose consumer เงินเข้ากับ `payment.slip.approved` · `booking.cancelled` · `booking.no_show` (ต่อท้าย · ห้ามทำของเดิมหาย) |
| `src/lib/core/permissions.ts` | เอา `booking.deposit.forfeit` ออกจาก `planned` (ใช้จริงในใบนี้ · §5) — บรรทัดเดียว |
| `src/components/public-booking.tsx` · `src/components/booking/online/**` | §4 ขั้น 3 (กล่องจ่ายมัดจำ + ปุ่ม) · หน้าจัดการนัด (QR · นับถอยหลัง · แนบสลิป · ยกเลิกช้า) |
| `src/app/(store)/bq/m/[token]/page.tsx` · `src/app/(store)/bq/m/actions.ts` | ส่ง `pay` + action แนบสลิป/ยกเลิกช้า เข้า ManageCard (action สาธารณะอยู่ใต้ app/(store) ตาม F6) |
| `src/lib/actions/booking.ts` (ไฟล์เดิม · **เพิ่ม function เท่านั้น** · F6 ห้ามไฟล์ใหม่ใน src/lib/actions) · `src/app/app/u/[unitSlug]/booking/page.tsx` | จอร้าน: ปุ่มยืนยันรับมัดจำ / คืนมัดจำที่ค้างคืน + ป้ายสถานะมัดจำ (§5) |
| `src/lib/platform/minute-jobs.ts` | เฉพาะถ้ายังไม่มีงานเรียก `expireDepositHolds` ทุกนาที (มีแล้ว = ห้ามแตะ) |
| `src/lib/i18n/dict.ts` | เพิ่มคีย์เท่านั้น (th/en คู่กัน) |

ห้ามแตะ: `src/lib/modules/pos/**` · `src/lib/payment/**` (ใช้ API เดิมของ R0.6) · `src/lib/core/**` นอกรายการข้างบน · `planner*.ts` `queue-line.ts` `today-line.ts` `line-ops.ts` `devices.ts` `settings-model.ts` `public-line.ts` · prisma

## 2. ค่าตั้ง (นโยบายร้านทุกข้อผ่านทะเบียน · อ่านต่อคำขอ · นัดที่จองแล้วใช้ snapshot)
| คีย์ | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|
| `booking.deposit.method` (#33) | `NONE` = ไม่เก็บ · `PROMPTPAY_SLIP` = QR พร้อมเพย์ยอดล็อก + ลูกค้าแนบสลิป (มีตัวต่อ SLIP_VERIFY + `payments.slip.autoApprove` ⇒ ระบบตรวจเอง · ไม่มี ⇒ ร้านตรวจในคิวสลิป) **และ** ร้านกดยืนยันรับเงินเองได้ | **ไม่เพิ่ม enum PROMPTPAY_CONFIRM** (มติ §8 ข้อ 1) |
| `booking.deposit.amount` (#34) · `payWithinMin` (#35) | ยอด · เวลาถือช่อง (B.3 เดิม) | |
| `booking.deposit.forfeitPct` (#36) | % ที่ร้านเก็บเมื่อ **ไม่มา** และเมื่อ **ยกเลิกช้า** (ภาพ 08 "ไม่มา / ยกเลิกช้า ร้านเก็บมัดจำ 100%") · `null` ⇒ ไม่ริบอัตโนมัติ (คงค้างคืน) | อ่านจาก snapshot · แถวเก่าไม่มีคีย์ ⇒ resolver ปัจจุบัน |
| `booking.deposit.memberExemptTier` (#37) | ระดับสมาชิกขั้นต่ำที่ไม่ต้องมัดจำ (`MEMBER` < `SILVER` < `GOLD` < `PLATINUM` ตาม `Customer.tier`) · ค่าที่ไม่ใช่ 4 ตัวนี้ = ไม่ยกเว้นใคร | ยกเว้นเฉพาะลูกค้าที่ **ยืนยันตัวตนแล้ว** (ช่อง LINE/STAFF/PHONE ที่ได้ `customerId`) · ช่อง ONLINE (เบอร์ไม่ผ่าน OTP) **ไม่ยกเว้น** |
| **ใหม่** `booking.late.lateCancelMode` | `BLOCK` = เลยเวลาฟรีแล้วยกเลิกเองไม่ได้ (พฤติกรรม B.7) · `FORFEIT` = ยกเลิกเองได้โดยยอมให้ร้านเก็บ `forfeitPct` ของมัดจำที่จ่ายแล้ว | type enum · chain `["UNIT"]` · ค่าเริ่ม BARBER/SPA/CLINIC = `BLOCK` · `_fallback` = `BLOCK` · ป้ายไทย `{ BLOCK: "ห้ามยกเลิกเอง (ติดต่อร้าน)", FORFEIT: "ยกเลิกได้ · ร้านเก็บมัดจำตามที่ตั้ง" }` · labelTh "เมื่อลูกค้ายกเลิกหลังเวลาฟรี" · **อยู่ใน `SNAPSHOTS.appointment`** |
| `payments.slip.*` · `payments.receiver` (R0.6) | นโยบายตรวจสลิป · ผู้รับเงิน | ใบนี้ไม่แตะ — อ่านผ่าน `submitSlip`/`promptpayQrFor` |
- ห้ามฮาร์ดโค้ดค่านโยบาย (15 นาที · 100% · ระดับ) ในไฟล์ใหม่ — ข้อสอบแก้ค่าตั้งแล้วต้องเห็นผลกับนัดใหม่ทันที และนัดเก่ายังใช้ snapshot

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง) — ทั้งหมดใน «deposit.ts» เว้นที่ระบุ

### 3.1 สถานะมัดจำ (คิดจากข้อมูล · pure + อ่าน)
```ts
export type DepositState =
  | "NONE"        // depositSatang 0 (ไม่มีมัดจำ / ยกเว้นสมาชิก)
  | "AWAITING"    // ยังไม่จ่าย · ไม่มีสลิปค้าง · นัด PENDING/CONFIRMED
  | "IN_REVIEW"   // มีสลิป PENDING/NEEDS_REVIEW ของนัดนี้ (ถือช่องหยุดนับ)
  | "UNDERPAID"   // มีใบรับแต่ยอด < depositSatang (อนุมัติบางส่วน) · นัดยังถือช่อง
  | "PAID"        // ใบรับ OPEN ครบยอด · นัดยังไม่จบ (PENDING/CONFIRMED/LATE/ARRIVED/QUEUED/IN_SERVICE)
  | "USED"        // มัดจำถูกใช้กับบิลค่าบริการ (PosDeposit USED · ไม่ใช่บิลริบ)
  | "FORFEITED"   // ถูกริบครบ (บิลริบ PAID · คงเหลือ 0)
  | "REFUND_DUE"  // นัดจบแบบไม่ใช้บริการ (CANCELLED/NO_SHOW) และใบรับยังมีคงเหลือ > 0 (รวมส่วนที่เหลือหลังริบบางส่วน · รวมเงินเข้าหลังปล่อยช่อง)
  | "REFUNDED"    // คืนแล้ว (ใบคืน CN) — ถ้าริบบางส่วนก่อน ยอดริบอยู่ใน forfeitedSatang
  | "EXPIRED";    // CANCELLED DEPOSIT_TIMEOUT และไม่มีเงินเข้า
export type DepositInfo = {
  state: DepositState; method: "NONE" | "PROMPTPAY_SLIP"; exempt: "MEMBER_TIER" | null;
  requiredSatang: number;   // = Appointment.depositSatang
  paidSatang: number;       // ยอดใบรับ (PosDeposit.amountSatang) · 0 ถ้าไม่มี
  usedSatang: number; forfeitedSatang: number; refundedSatang: number;
  refundDueSatang: number;  // คงเหลือที่ต้องคืน (เฉพาะ REFUND_DUE) อื่น 0
  holdUntilMs: number | null; // เมื่อ AWAITING และถือช่อง (สูตร holdUntilOf) · อื่น null
  receiptNo: string | null; slipStatus: "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | null; // สลิปล่าสุดของนัด
};
export async function depositInfo(ctx: { tenantId: string; unitId: string }, appointmentId: string): Promise<DepositInfo | null>; // นัดของหน่วยอื่น/ร้านอื่น ⇒ null
```
- ยอด `forfeitedSatang` = Σ บิลริบ PAID ของนัด (คีย์ `dep-forfeit:` · sourceModule BOOKING · sourceId = appointmentId) · `refundedSatang`/`usedSatang` จาก `PosDeposit`

### 3.2 หน้าจ่าย (สาธารณะ · token ลิงก์จัดการนัดของ B.7 = สิทธิ์)
```ts
export type DepositPay = {
  state: DepositState; amountSatang: number; holdUntilMs: number | null;
  qr: { svgDataUrl: string; displayName: string } | null; // เฉพาะ AWAITING และร้านตั้งผู้รับแล้ว (promptpayQrFor ยอด = depositSatang)
  noReceiver: boolean;            // AWAITING แต่ร้านยังไม่ตั้งบัญชีพร้อมเพย์
  canSubmitSlip: boolean;         // AWAITING (รวมกรณีสลิปล่าสุดถูกปฏิเสธ แล้วยังถือช่อง)
  slip: { status: string } | null;
  forfeitedSatang: number; refundDueSatang: number;
  lateCancel: { allowed: boolean; forfeitSatang: number } | null; // เลยเวลาฟรี + นัด PENDING/CONFIRMED: allowed = snapshot lateCancelMode FORFEIT · forfeitSatang = floor(คงเหลือใบรับ × forfeitPct / 100) · ก่อนเวลาฟรี/สถานะอื่น ⇒ null
};
export async function loadDepositPay(token: unknown, opts?: { now?: Date; ip?: string })
  : Promise<{ ok: true; pay: DepositPay } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }>;
export type SlipSubmitFail = "NOT_FOUND" | "RATE_LIMITED" | "EXPIRED" | "ALREADY_PAID" | "IN_REVIEW" | "NO_DEPOSIT" | "BAD_STATE" | "BAD_INPUT" | "NO_RECEIVER" | "BUSY";
export async function submitDepositSlip(
  token: unknown,
  input: { file: { data: Uint8Array; contentType: string }; qrPayload?: string; idempotencyKey: string },
  opts?: { now?: Date; ip?: string; deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> } }, // deps = UploadDeps/DeleteDeps ของ storage (ข้อสอบ/เซิร์ฟเวอร์เท่านั้น · route/action ห้ามส่ง)
): Promise<{ ok: true; status: string; state: DepositState } | { ok: false; code: SlipSubmitFail; reason: string }>;
```
- token: ลำดับ/คำตอบเดียวแบบ B.7 (rate limit IP → รูป token → แถว → อายุ) — token เสียทุกแบบ ⇒ `NOT_FOUND` ข้อความเดียวกันทุกไบต์ (X7)
- rate limit: ถัง `bq:manage:ip:<ip>` (ONLINE_RATE.manageIp) ก่อนแตะฐาน + ถัง `bq:manage:tk:<hash32>` (manageToken) **ทันทีหลังหา token เจอ — ก่อนตรวจสถานะ/ผู้รับ/อัปไฟล์** (นับทุกครั้งไม่ว่าผลเป็นอะไร) — เกิน ⇒ `RATE_LIMITED` และ **ไม่เรียก put** (ข้อสอบ RL-1 ยิง 11 ครั้งบนร้านที่ไม่มีผู้รับ)
- `submitDepositSlip` ลำดับ: token → `depositSatang 0` ⇒ `NO_DEPOSIT` → จ่ายแล้ว ⇒ `ALREADY_PAID` → มีสลิปค้าง (PENDING/NEEDS_REVIEW) ⇒ `IN_REVIEW` → สถานะไม่ใช่ PENDING/CONFIRMED (รวมปล่อยช่องแล้ว) ⇒ `EXPIRED` (CANCELLED DEPOSIT_TIMEOUT) / `BAD_STATE` (อื่น) → ถือช่องแต่ `now > holdUntil` ⇒ `EXPIRED` → `submitSlip(ctx, { unitId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: appointmentId, partyId?, file, qrPayload, expectedSatang: depositSatang (จากแถว · ไม่รับจาก client), expectedPayerNames: [customerName] (ใช้เทียบเท่านั้น), idempotencyKey: "bq-slip:" + idempotencyKey }, { put, del, now })` — **ห้ามส่ง `policy` จาก request** · คำปฏิเสธของ R0.6 (VALIDATION/DUPLICATE/STORAGE…) ⇒ `BAD_INPUT` + ข้อความไทยของ R0.6 · `NO_RECEIVER` เมื่อร้านไม่มีผู้รับ
- ผล `AUTO_APPROVED` ⇒ เรียก §3.3 ทันที (ไม่รอคิว — ลูกค้าเห็น CONFIRMED เลย) แล้วคืน `state` หลังเรียก · consumer ที่ตามมาไม่มีผล (idempotent)
- ไม่มีชื่อ/เบอร์/ชื่อผู้โอน/URL ไฟล์ ในผลคืนและ `DepositPay` (X8 · X10)

### 3.3 consumer เงินเข้า — สลิปอนุมัติ (X4)
```ts
export async function onDepositSlipApproved(evt: { tenantId: string; unitId?: string | null; payload: unknown }): Promise<void>; // ไม่ throw ในทางปกติ
```
- compose ต่อท้าย `"payment.slip.approved"` ใน outbox-consumers (domain อื่น = ไม่ทำอะไร)
- **อ่านสลิปจากฐานใหม่เสมอ** (`slipId` ของ payload + `tenantId` ของ event) — ไม่เชื่อ `refId/amountSatang` ใน payload · ต้อง `domain BOOKING` · `refType APPT_DEPOSIT` · สถานะ `APPROVED`/`AUTO_APPROVED` · นัด = `{ id: slip.refId, tenantId: evt.tenantId, unitId: slip.unitId, kind: "BOOKED" }` ไม่พบ ⇒ logOps WARN แล้วจบ (ร้านอื่น/หน่วยอื่น ⇒ ไม่แตะ)
- ยอดรับ = `checks.decided.amountSatang` (คนอนุมัติ) ?? `slip.amountSatang` ?? `slip.expectedSatang`
- ใบรับ = `moduleTakeDeposit({ keyBase: "booking-deposit-" + id, amountSatang: ยอดรับ, payType: "PROMPTPAY", customerId, customerName, createdBy: "module:booking" }, bookingTxSale…)` — **คีย์ฐานเดียวกับทุกทางรับมัดจำของนัด** (ร้านกดยืนยัน · `recordDeposit`) ⇒ ยิงซ้ำ/พร้อมกัน/สองทาง = ใบรับเดียว
- กรณี (ตัดสินใต้ CAS ของแถวนัด · ห้ามมีใบรับที่ไม่มีนัดอ้าง):
  | นัดตอนเงินเข้า | ผล |
  |---|---|
  | PENDING/CONFIRMED · ยังไม่จ่าย · ยอด ≥ depositSatang | ใบรับ + `depositPaidAt`/`depositSaleId` · PENDING ⇒ CONFIRMED เว้นแต่ snapshot `requireConfirm = true` (คง PENDING ให้ร้านยืนยัน · ไม่ถือช่องแล้ว) · event `booking.deposit_paid` |
  | PENDING/CONFIRMED · ยังไม่จ่าย · ยอด < depositSatang (อนุมัติบางส่วน) | ใบรับยอดจริง + `depositPaidAt`/`depositSaleId` · สถานะคงเดิม (ไม่ยืนยันเอง) ⇒ `UNDERPAID` · event `booking.deposit_paid` (`partial: true`) |
  | CANCELLED (DEPOSIT_TIMEOUT · ปล่อยช่องก่อนสลิปอนุมัติ) · ยังไม่จ่าย | **ไม่ปลุกนัด** · ใบรับยอดจริง (เงินเข้าจริง) + `depositPaidAt`/`depositSaleId` บนแถว CANCELLED ⇒ `REFUND_DUE` · audit `booking.deposit.late_money` · event `booking.deposit_paid` (`late: true`) |
  | จ่ายแล้ว (มี `depositPaidAt` จากทางอื่น) | **ไม่ออกใบรับที่สอง** · logOps WARN + audit `booking.deposit.slip_after_paid` (ให้คนตรวจว่าเป็นโอนซ้ำจริงไหม · คำถาม J4) |
  | สถานะอื่น (DONE/NO_SHOW/…) · ยังไม่จ่าย | เหมือนแถว CANCELLED (ใบรับ + REFUND_DUE) |
- ใบรับสำเร็จแต่ CAS แถวนัดแพ้ทุกทาง (ไม่ควรเกิด) ⇒ ห้ามทิ้งใบรับลอย: ผูกกับแถวตามกรณีข้างบนใหม่ (ลองซ้ำ) — ข้อสอบนับใบรับ = 1 และแถวนัดต้องอ้างใบรับนั้น

### 3.4 จอร้าน (ctx = `{ tenantId, actorUserId }` · **Membership สด** จากฐานทุกคำขอ แบบ D.8/D.13 · ไม่มีสิทธิ์/หน่วยอื่น/ร้านอื่น/ยังไม่ตอบรับ ⇒ `NOT_FOUND` คำตอบเดียว)
```ts
export type ShopCtx = { tenantId: string; actorUserId: string };
export type DepositQueueItem = {
  appointmentId: string; startMs: number; serviceName: string; staffName: string | null;
  customerName: string; phoneMasked: string; // จอร้านเห็นชื่อได้ · เบอร์ปิดเสมอ (สิทธิ์ booking.customer.phoneFull ไม่เกี่ยวกับใบนี้)
  info: DepositInfo; slipId: string | null;
};
export async function depositQueue(ctx: ShopCtx, input: { unitId: string; states?: DepositState[]; now?: Date })
  : Promise<{ ok: true; items: DepositQueueItem[] } | { ok: false; code: "NOT_FOUND" }>;
export async function confirmDepositByShop(ctx: ShopCtx, input: { unitId: string; appointmentId: string; payType?: "PROMPTPAY" | "TRANSFER" | "CASH" })
  : Promise<{ ok: true; info: DepositInfo; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "NO_DEPOSIT" | "SLIP_IN_REVIEW" | "BAD_STATE" | "SHIFT_REQUIRED" | "BUSY"; reason: string }>;
export async function refundDepositByShop(ctx: ShopCtx, input: { unitId: string; appointmentId: string; reason: string })
  : Promise<{ ok: true; info: DepositInfo; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "BAD_INPUT" | "SHIFT_REQUIRED" | "BUSY"; reason: string }>;
```
- `depositQueue`: สิทธิ์ = มีคีย์ใดคีย์หนึ่งของ `booking.deposit.confirm` · `booking.deposit.record` · `booking.deposit.refund` ที่หน่วยนั้น · ค่าเริ่ม states = `["AWAITING","IN_REVIEW","UNDERPAID","REFUND_DUE"]` · เรียง startAt
- `confirmDepositByShop` (สิทธิ์ `booking.deposit.confirm` หรือ `booking.deposit.record`): AWAITING ⇒ ใบรับยอด `depositSatang` (payType ค่าเริ่ม PROMPTPAY · คีย์ฐานเดียวกับ §3.3) + CONFIRMED (ร้านกด = ร้านยืนยันนัดด้วย) · UNDERPAID ⇒ ไม่ออกใบรับเพิ่ม · CONFIRMED (ร้านยอมรับยอดที่ได้) · PAID ⇒ ok `duplicated` · IN_REVIEW ⇒ `SLIP_IN_REVIEW` (ตัดสินที่คิวสลิป) · NONE ⇒ `NO_DEPOSIT` · นัดปล่อยช่อง/จบแล้ว ⇒ `BAD_STATE` (ไม่มีใบรับ) · audit `booking.deposit.confirm` (actor · ยอด · payType) · event `booking.deposit_paid`
- `refundDepositByShop` (สิทธิ์ `booking.deposit.refund`): เฉพาะ `REFUND_DUE` (PAID ของนัดที่ยังใช้บริการ ⇒ `BAD_STATE` — ต้องยกเลิกนัดก่อน) · เหตุผล 1–200 ตัว ไม่งั้น `BAD_INPUT` · `moduleRefundDeposit` (คืนคงเหลือทั้งหมด · ใบคืน CN) · กดซ้ำ/พร้อมกัน ⇒ ใบคืนเดียว (`duplicated`) · audit `booking.deposit.refund` · event `booking.deposit_refunded`
- `recordDeposit`/`refundDeposit` เดิม (ปุ่มรับ/คืนมัดจำของจอเดิม · ข้อสอบใช้ตั้งฉาก "จ่ายแล้ว") **คงพฤติกรรมเดิม** (ไม่เปลี่ยนสถานะนัด · TRANSFER) — ห้ามทำให้ qc-booking-deposit / qc-pos-p5.1 ถอย
- server action ใน `src/lib/actions/booking.ts`: `confirmDepositAction(unitSlug, fd)` · `refundDueDepositAction(unitSlug, fd)` → `BOOKING_ACTIONS` ใน access.ts = `["booking.deposit.confirm", "booking.deposit.record"]` / `["booking.deposit.refund"]` · ผลล้ม ⇒ `?err=` แบบ setStatusAction

### 3.5 ริบ · คืน · ยกเลิกช้า
- **ไม่มา** (`setAppointmentStatus NO_SHOW` · tick · consumer `booking.no_show` ซ้ำ): pct = snapshot `forfeitPct` (แถวเก่าไม่มีคีย์ ⇒ resolver ปัจจุบัน) · `100` ⇒ `moduleForfeitDeposit` เดิม (บิล "มัดจำริบ — ไม่มาตามนัด") · `0 < pct < 100` ⇒ บิลริบยอด `floor(คงเหลือ × pct / 100)` ผ่าน `bookingTxSale` (บรรทัด `FORFEIT_LINE_NAME` · จ่ายแถว `{ DEPOSIT, refSaleId: ใบรับ }` · **คีย์ `dep-forfeit:<PosDeposit.id>`** — คีย์เดียวกับ POS ⇒ `moduleUnforfeitDeposit`/`forfeitAfterNoShow` ใช้ได้ตามเดิม · sourceModule BOOKING · sourceId appointmentId) แล้วคงเหลือ ⇒ `REFUND_DUE` · `0`/`null` ⇒ ไม่ริบ ⇒ `REFUND_DUE` ทั้งหมด · event `booking.deposit_forfeited` (ครั้งเดียวต่อบิลริบ)
- **ยกเลิกในเวลาฟรี** (ลูกค้า `cancelOnline` · ร้าน setStatus CANCELLED): **ไม่ออกใบคืนอัตโนมัติ** — มัดจำ OPEN ⇒ `REFUND_DUE` ในคิวมัดจำ · ร้านโอนคืนแล้วกด `refundDepositByShop` (ใบคืน = วันที่เงินออกจริง · ตรง POS O8b)
- **ยกเลิกช้า** `cancelOnline(token, { now?, ip?, acceptForfeit?: boolean })` (online.ts): เลยเวลาฟรี + PENDING/CONFIRMED:
  - snapshot `lateCancelMode` ≠ `FORFEIT` (รวมไม่มีคีย์) ⇒ `LATE_CHANGE` (พฤติกรรม B.7 ทุกไบต์)
  - `FORFEIT` + `acceptForfeit !== true` ⇒ `{ ok:false, code: "FORFEIT_CONFIRM_REQUIRED", reason }` (ข้อความมียอดที่ร้านจะเก็บ) · ไม่เปลี่ยนอะไร
  - `FORFEIT` + `acceptForfeit === true` ⇒ CAS CANCELLED `cancelReason "CUSTOMER_LATE"` + `booking.cancelled` (payload `reason: "CUSTOMER_LATE"` + `depositPaid`) ใน tx เดียว → หลัง commit ริบตาม pct (สูตรเดียวกับไม่มา · บรรทัดบิล "มัดจำริบ — ยกเลิกช้า" ได้) · ยังไม่จ่าย ⇒ ยกเลิกเฉย ๆ (ไม่มีอะไรให้ริบ) · consumer `booking.cancelled` (reason CUSTOMER_LATE) ทำซ้ำได้ไม่ซ้ำเงิน (กู้กรณีโพรเซสตายหลัง commit)
  - `ManageFail` เพิ่ม `"FORFEIT_CONFIRM_REQUIRED"`
- ก่อนเวลาฟรี `acceptForfeit` ไม่มีผล (ยกเลิกฟรีแบบ B.7 · `cancelReason "CUSTOMER"`)

### 3.6 event ใหม่ (3 ทะเบียน · payload ไม่มีชื่อ/เบอร์/ชื่อผู้โอน/token)
| type | คีย์ | payload |
|---|---|---|
| `booking.deposit_paid` | `booking.deposit_paid#<appointmentId>#<receiptSaleId>` | `{ appointmentId, unitId, amountSatang, requiredSatang, via: "SLIP" \| "SHOP", partial, late, status }` |
| `booking.deposit_forfeited` | `booking.deposit_forfeited#<forfeitSaleId>` | `{ appointmentId, unitId, forfeitSatang, pct, reason: "NO_SHOW" \| "CUSTOMER_LATE" }` |
| `booking.deposit_refunded` | `booking.deposit_refunded#<refundSaleId>` | `{ appointmentId, unitId, refundSatang }` |
- `booking.cancelled` จาก `expireDepositHolds`: คีย์ `booking.cancelled#<id>` (เดียวกับทางอื่น) payload `{ appointmentId, unitId, staffId, kind, channel, serviceId, reason: "DEPOSIT_TIMEOUT", from: "PENDING", depositSatang, depositPaid: false }`

### 3.7 service.ts
- `expireDepositHolds(now)`: เงื่อนไขเดิม **และ** ไม่มี `PaymentSlip` ของ `(tenantId, domain BOOKING, refType APPT_DEPOSIT, refId = id)` สถานะ ∈ {PENDING, NEEDS_REVIEW, AUTO_APPROVED, APPROVED} (สลิปค้าง = หยุดนับ · สลิปถูกปฏิเสธ = นับต่อ และถ้าเลยเวลา ⇒ ปล่อยรอบถัดไป) · ยิง `booking.cancelled` (§3.6) ใน tx เดียวกับ UPDATE ต่อแถวที่ปล่อยจริง · ซ้อนกันหลายโพรเซส = ปล่อยครั้งเดียว event เดียว (X5) · คืน `{ expired }` เดิม
- `forfeitNoShowDeposit` ตาม §3.5 (อ่าน pct) — pct 100 = ทางเดิมทุกไบต์ของผลเงิน (regression qc-pos-p5.1 MA12)
- `bookAppointment`: หลังได้ `customerId` (ไม่ใช่ช่อง ONLINE) และ snapshot/ค่าตั้ง `memberExemptTier` ≠ null และ `Customer.tier` ≥ ระดับนั้น ⇒ `depositSatang = 0` · snapshot เพิ่มคีย์ระดับบน `deposit: { exempt: "MEMBER_TIER", tier }` (additive แบบ `job`) · ไม่ถือช่อง (status ตาม requireConfirm) — `loadOnlineBooking` (ตัวตน LINE ที่ผูกสมาชิกระดับนั้น) แสดง `depositSatang 0` ทั้งการ์ดบริการและสรุป
- ตัวช่วย SQL/ล็อกที่ deposit.ts ต้องใช้ (หาแถวนัดข้ามร้านจาก consumer · CAS) เพิ่มที่นี่ · **ห้ามแก้** `holdMinutesOf` `busyRowsOf` `slotClear` `selfQuotaOk` `openCountForPhone` `replayOf` · บรรทัดเดิมที่ลบ/แก้ ≤ 40

### 3.8 ใช้มัดจำในบิล (เชื่อม B.10)
```ts
export async function depositForBill(ctx: { tenantId: string; unitId: string }, appointmentId: string, billSatang: number): Promise<{ refSaleId: string; satang: number } | null>;
```
- = `moduleDepositForBill(tenantId, unitId, depositSaleId (เมื่อ depositPaidAt ≠ null), billSatang)` ของนัดในหน่วยนั้น · นัดหน่วยอื่น/ร้านอื่น/ไม่มีใบรับ/ใบรับไม่ OPEN ⇒ null · B.10 ใส่แถว `{ type: "DEPOSIT", amountSatang: satang, refSaleId }` ในบิลพัก (ข้อสอบจำลองด้วย `createSale` ตรง: รายได้ = ราคา · 2110 สุทธิ 0 · VAT ครั้งเดียว)

## 4. สัญญา DOM (ข้อสอบ U/H · คอมโพเนนต์ห้าม import ค่าจาก `@/lib/modules/**` · `@/lib/core/db` · `@prisma/client`)
- **PublicBooking ขั้น 3** (มัดจำ > 0 · ภาพ 03ค): ใน `[data-bk-deposit-slot]` มี `[data-bk-pay-method="PROMPTPAY"]` ข้อความมียอดมัดจำ (฿ไทย / THB อังกฤษ) และตัวเลข `policy.payWithinMin` (นาที) · ปุ่ม `[data-bk-submit]` ข้อความมียอดมัดจำ ("จ่ายมัดจำ ฿300 · ยืนยันนัด") · มัดจำ 0 ⇒ ไม่มี slot และปุ่มไม่มียอด · หลังจองสำเร็จไป `manageUrl` (ที่นั่นมี QR จริง — ขั้น 3 ยังไม่มีนัด จึงไม่สร้าง QR จ่ายเงินก่อนมีนัด)
- **ManageCard** + prop ใหม่ `pay?: DepositPay | null` และใน `actions` เพิ่ม (optional) `slip?: (fd: FormData) => Promise<void>` · `lateCancel?: (fd: FormData) => Promise<void>` (props เดิมของ B.7 คงเดิม · ไม่ส่ง `pay` ⇒ หน้าตาเดิมทุกไบต์):
  - `[data-bk-deposit-state]` + `data-state = pay.state` (มี pay เสมอเมื่อ depositSatang > 0)
  - AWAITING + qr ⇒ ใน `[data-bk-deposit-slot]`: `img[data-bk-qr]` (`src` = `qr.svgDataUrl`) · `[data-bk-pay-until]` + `data-ms = holdUntilMs` · ยอด
  - `canSubmitSlip` ⇒ `form[data-bk-slip-form]` + `input[type=file][name=slip]` (accept image/jpeg,image/png,image/webp) + `input[type=hidden][name=idempotencyKey]` (ค่าไม่ว่าง)
  - `noReceiver` ⇒ `[data-bk-no-receiver]` (ข้อความ "ติดต่อร้าน") ไม่มี img
  - `lateCancel.allowed` ⇒ `form[data-bk-late-cancel]` + hidden `acceptForfeit=1` + `[data-bk-forfeit]` `data-satang = forfeitSatang` · ไม่ allowed ⇒ ไม่มีฟอร์มนี้
  - REFUND_DUE ⇒ `[data-bk-refund-due]` `data-satang` · ข้อความทั้งหมดจาก dict ตามภาษา · ไม่มีชื่อ/เบอร์ลูกค้า
- หน้า `/bq/m/[token]` ส่ง `pay` จาก `loadDepositPay` · action สาธารณะ `submitDepositSlipAction(token, fd)` (อ่านไฟล์ `slip` ≤ 5MB · `idempotencyKey`) · `lateCancelBookingAction(token, fd)` (`acceptForfeit` = "1") → `redirect("/bq/m/<token>")` / `?err=<CODE>` (ไม่มี session · ip จาก headers)

## 5. สิทธิ์ (permissions.ts มีครบแล้ว)
| ทำอะไร | คีย์ |
|---|---|
| เห็นคิวมัดจำ | `booking.deposit.confirm` / `booking.deposit.record` / `booking.deposit.refund` (อย่างใดอย่างหนึ่ง) |
| ร้านยืนยันรับมัดจำ | `booking.deposit.confirm` / `booking.deposit.record` |
| คืนมัดจำที่ค้างคืน | `booking.deposit.refund` |
| ตัดสินสลิป | ของ R0.6 (`payments.slip.review`) — ไม่เปลี่ยน |
| ริบอัตโนมัติ (ไม่มา/ยกเลิกช้า) | ระบบทำ (`booking.deposit.forfeit` ออกจาก planned · ป้ายตาราง "ระบบทำอัตโนมัติ" คงเดิม) |

## 6. เงิน + บัญชี (ข้อสอบตรวจทุกสตางค์ · สมุดที่จด VAT)
| เหตุการณ์ | เอกสาร | GL ที่ต้องได้ (ยอด D = มัดจำ · VAT = round(D·7/107)) |
|---|---|---|
| เงินเข้า (สลิป/ร้านกด) | ใบรับมัดจำ POS_DEPOSIT (`moduleTakeDeposit`) | Dr เงิน (1xxx) D · Cr 2110 D−VAT · Cr 2200 VAT |
| ใช้กับบิลค่าบริการ (B.10) | บิลขาย แถว DEPOSIT | รายได้ (4xxx) รวมตามราคา · 2110 สุทธิ 0 · 2200 ไม่ซ้ำ |
| ไม่มา/ยกเลิกช้า ริบ p% | บิลริบ (แถว DEPOSIT) | รายได้ + 2200 = ยอดริบ · 2110 ลดเท่าส่วนที่ริบ |
| คืน (REFUND_DUE → ร้านกด) | ใบคืน CN (`moduleRefundDeposit`) | กลับรายการส่วนคงเหลือ ⇒ หลังคืนครบ: 2110 สุทธิ 0 · เงิน (1xxx) สุทธิ = ยอดที่ริบ |
- ทุก journal entry Σdr = Σcr · ใบรับต่อนัด ≤ 1 (ยกเว้นรับใหม่หลังคืนแล้ว ตามคีย์ -r<n> ของ POS) · บิลริบต่อมัดจำ ≤ 1 ที่ยัง PAID · ใบคืนต่อใบรับ ≤ 1

## 7. เกณฑ์รับ
- «scripts/qc-svc-b.8.mts» เขียวทุกข้อ — หมวด **T** ข้อมูล · **PC** ตัวควบคุม (เขียวก่อนมีงาน: ใบรับ/GL ของ POS · สลิป R0.6 + ตัวต่อ FAKE · บิลแถว DEPOSIT บางส่วน · ถือช่องเดิม · ตัวตรวจ PII) · **K** ค่าตั้ง/แม่แบบ (คีย์ใหม่ · snapshot) · **P** หน้าจ่าย + แนบสลิป · **A** เงินเข้า (consumer) · **E** หมดเวลา · **S2** จอร้าน (คิว · ยืนยัน · คืน · สิทธิ์สด) · **F** ริบ/คืน/ยกเลิกช้า · **M** ยกเว้นสมาชิก · **L** บัญชีทุกสตางค์ · **BL** ใช้มัดจำในบิล · **X** ยิงพร้อมกันข้ามโพรเซส · **XS** ข้ามร้าน/ข้ามหน่วย · **EV** event + PII · **RL** rate limit · **U** DOM · **H** server จริง · **S** ไฟล์/สัญญาโค้ด · **V** ภาพ 03ค · **G** regression · **Z** ล้าง
- regression (G · หลังล้างข้อมูล): `qc-svc-b.7 --no-regression` · `qc-svc-b.3` (SVC_B3_NO_REGRESSION=1) · `qc-svc-b.4 --no-regression` · `qc-svc-b.9 --no-regression` · `qc-svc-r0.6` · `qc-booking-deposit` · `qc-pos-p5.1` · `qc-pos-p2.9b` · `qc-svc-smoke` — ไม่มี FAIL ยกเว้นข้อ "แตะเฉพาะไฟล์ของใบ" ของชุดนั้นระหว่างงานยังไม่ commit (b.3/b.4 ST-1 · b.7/b.9 S-1 · r0.6 ข้อ F ที่ไล่ไฟล์ทะเบียน event ถ้าเป็นเฉพาะการเพิ่ม)
- typecheck + fitness 2 โหมด (F5 ต้องไม่เพิ่ม · F6 ไม่มีไฟล์ใหม่ใน src/lib/actions) · ตรวจ 2 รอบ (เข้ม) · build QC + ภาพ 03ค (PARITY: กล่อง PromptPay + ปุ่ม "จ่ายมัดจำ ฿300 · ยืนยันนัด")

## 8. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ไม่เพิ่มโหมด PROMPTPAY_CONFIRM** — ภาพ 08 เป็นโหมดเดียว "QR พร้อมเพย์ · ร้านกดยืนยัน หรือตรวจสลิปอัตโนมัติ (ถ้าเชื่อมตัวต่อ)" ⇒ `PROMPTPAY_SLIP` = ลูกค้าแนบสลิปได้ + ร้านกดยืนยันได้เสมอ · ไม่มีตัวต่อ = ร้านตรวจสลิปในคิว (R0.6) · Beam/ลิงก์จ่าย = P.1 (enum เพิ่มตอนนั้น)
2. **คืนมัดจำไม่ออกใบคืนอัตโนมัติ** — ยกเลิก/ไม่มาส่วนเหลือ/เงินเข้าหลังปล่อยช่อง ⇒ `REFUND_DUE` ในคิว · ร้านโอนคืนแล้วกด (ใบคืนลงวันที่เงินออกจริง · ตรง POS O8b · ไม่ให้สมุดบอกว่าคืนแล้วทั้งที่ยังไม่โอน)
3. **สลิปอนุมัติหลังปล่อยช่อง ⇒ ไม่ปลุกนัด** (ช่องอาจถูกจองไปแล้ว · ลูกค้าเห็นว่าหมดเวลา) — บันทึกใบรับ (เงินเข้าจริง) + `REFUND_DUE`
4. **สลิปค้างตรวจ = หยุดนับเวลาถือช่อง** (ลูกค้าโอนทันเวลาแต่ร้านตรวจช้า ต้องไม่โดนปล่อย) · ปฏิเสธแล้วนับต่อ (เลยเวลาแล้ว = ปล่อยรอบถัดไป)
5. **เงินเข้าซ้ำ (จ่ายแล้วมีสลิปอนุมัติอีกใบ) ⇒ ไม่ออกใบรับที่สอง** + เตือนคน (ไม่รู้ว่าโอนซ้ำจริงหรือเป็นโอนเดียวกับที่ร้านกดยืนยัน) ⇒ คำถาม J4
6. **อนุมัติบางส่วน ⇒ ใบรับยอดจริง · ไม่ยืนยันนัดเอง** (`UNDERPAID` ร้านตัดสิน: กดยืนยัน = ยอมรับ · ยกเลิก = ค้างคืน)
7. **ริบบางส่วน ปัดลงเข้าทางลูกค้า** `floor(คงเหลือ × pct / 100)` · `forfeitPct null` = ไม่ริบอัตโนมัติ (คลินิก)
8. **ยกเลิกช้าใช้ % เดียวกับไม่มา** (ภาพ 08) · ค่าเริ่ม `lateCancelMode = BLOCK` ทุกแม่แบบ (ไม่เปลี่ยนพฤติกรรม B.7 · ร้านเปิดเองได้) · ลูกค้าต้องกดยอมรับยอดที่ถูกเก็บก่อน (`acceptForfeit`)
9. **requireConfirm ใน snapshot = true ⇒ จ่ายแล้วยังไม่ยืนยันเอง** (PENDING · หยุดถือช่องเพราะจ่ายแล้ว) · ร้านกดยืนยันรับมัดจำ = ยืนยันนัดด้วย
10. **ยกเว้นสมาชิกเฉพาะตัวตนที่ยืนยันแล้ว** — ช่อง ONLINE (เบอร์ไม่ผ่าน OTP · มติ B.7) ไม่ยกเว้น แม้เบอร์ตรงสมาชิก Gold (กันสวมเบอร์เลี่ยงมัดจำ)
11. **ร้านกดยืนยันขณะมีสลิปค้าง ⇒ SLIP_IN_REVIEW** (ตัดสินที่คิวสลิปทางเดียว · กันเงินก้อนเดียวลงสองทาง)
12. **คีย์ใบรับต่อนัดเดียวทุกทาง** (`booking-deposit-<id>`) ⇒ สลิป ∥ ร้านกด ∥ consumer ซ้ำ = ใบรับเดียว

## 9. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- **B.9**: ข้อความถึงลูกค้าเมื่อ `booking.deposit_paid` (ภาพ 06 "ยืนยันนัดแล้ว · รับมัดจำ ฿300 ✓") · เตือนก่อนหมดเวลาจ่าย · แจ้งปล่อยช่อง (`booking.cancelled` DEPOSIT_TIMEOUT)
- **B.10**: ใส่ `depositForBill` ในบิลพัก (แทนทาง DONE เดิมใน setStatusAction)
- **B.17**: ไม่มาซ้ำ ⇒ บังคับมัดจำ (`repeatNoShow.action REQUIRE_DEPOSIT`)
- **P.1**: ลิงก์จ่าย Beam (`PAYMENT_GATEWAY`) ยืนยันอัตโนมัติ
- **B.12**: ภาพจริงหน้าจัดการนัด (QR/สลิป) ให้เจ้าของดู (ไม่มีภาพแบบ · มติ Q3 ของ B.7)
- `booking.deposit.waive` (ยกเว้นมัดจำรายนัด) ยังเป็น planned

## 10. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- Q1 ค่าเริ่ม `lateCancelMode` ของ BARBER/SPA: BLOCK (ค่าปลอดภัย) หรือ FORFEIT ตามภาพ 08 ("ยกเลิกช้า ร้านเก็บมัดจำ 100%")
- Q2 ข้อ §8.2: คืนมัดจำรอร้านกด (ค่าปลอดภัย) หรืออยากให้ระบบออกใบคืนทันทีเมื่อลูกค้ายกเลิกในเวลาฟรี (ต้องมีทางโอนคืนจริง — Beam/P.1)
- Q3 เวลาถือช่องสูงสุดเมื่อสลิปค้างตรวจ — ตอนนี้ไม่จำกัด (จนร้านตัดสิน) · ต้องมีเพดาน (เช่น ถึงเวลานัด) ไหม

## 11. คำถามกฎหมาย/บัญชีใหม่ (ลง `ledger/wo-notes/svc-legal-questions.md` — ผู้คุมย้ายเอง)
- J3 สคบ.: ยกเลิกช้า "ร้านเก็บมัดจำ X%" ที่ลูกค้ากดยอมรับตอนยกเลิก (และเห็นกติกาตอนจองขั้น 3) — พอเป็นการแจ้งเงื่อนไขไหม · มัดจำ 100% ของบริการ ≥ 90 นาที (20% ของราคา) สูงเกินส่วนไหม
- J4 บัญชี: (1) เงินเข้าหลังปล่อยช่อง ⇒ ใบรับมัดจำ (หนี้สิน 2110) แล้วค้างคืน — ถูกไหม หรือควรลงเป็นเงินรับรอคืน/เจ้าหนี้อื่น · (2) สลิปอนุมัติซ้ำกับที่ร้านกดยืนยัน ⇒ ระบบไม่ลงซ้ำแต่เตือน — ทางปฏิบัติที่ถูก · (3) ใบคืนลงวันที่ร้านกด (วันที่โอนจริง) ไม่ใช่วันที่ลูกค้ายกเลิก — ถูกไหม · (4) ริบบางส่วน: VAT ของส่วนที่ริบรับรู้ตอนรับมัดจำแล้ว ส่วนที่คืนกลับรายการด้วยใบคืน — ถูกไหม · (5) ปัดเศษส่วนที่ริบลง (เข้าทางลูกค้า) รับได้ไหม
- J5 PDPA: ชื่อลูกค้าใช้เทียบชื่อผู้โอนบนสลิป (ไม่เก็บ) — ต้องแจ้งในนโยบายความเป็นส่วนตัวไหม

## มติผู้คุม (30 ต.ค.)
- Q1: lateCancelMode ค่าเริ่ม BLOCK ทุกแม่แบบ (คุ้มครองผู้บริโภค · ร้านเปลี่ยนเป็น FORFEIT เองได้) · ORACLE-EDIT b.0 แถว 32b แล้ว (enum UNIT · _fallback = BLOCK)
- Q2: คืนมัดจำ = REFUND_DUE รอร้านโอนคืนแล้วกดคืน (ยังไม่มีทางโอนคืนจริง)
- Q3: สลิปค้างตรวจถือช่องได้ไม่เกินเวลาเริ่มนัด (startAt) — เลยแล้วปล่อยช่องตามปกติ + สลิปที่อนุมัติทีหลัง ⇒ ใบรับ + REFUND_DUE (มติ 3)
- G-5 (r0.6) เกณฑ์หลวม "ไม่มี ❌ นอกหมวด F" = ยอมรับ
- คำถาม §11 ลง ledger/wo-notes/svc-legal-questions.md แล้ว
