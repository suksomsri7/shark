# ใบสั่ง R0.6 — QR + ตรวจสลิปกลาง (เข้ม · เงิน)

> อ้าง: MASTER-PLAN แถว R0.6 · CC §3 (ไฟล์ · ตาราง · ลำดับตรวจ) · CC §2.3 (`getIntegration`/`callIntegration` · signal · ห้ามสรุปว่า "ไม่ได้ทำ" เมื่อ TIMEOUT) · CC §7 (event) · CC §8 (`payments.slip.review`) · แบบหอ §6 A7 + ภาพ `ledger/design-dorm/06-slip-payments.png` · `ledger/wo-notes/svc-r0.8-carry.md` (R0.6) · ข้อสอบ «scripts/qc-svc-r0.6.mts» (ผูกสัญญาข้างล่างตรงตัว)
> มติเจ้าของ: ตรวจสลิปอัตโนมัติ = ตัวต่อที่ร้านสมัครเอง (ค่าบริการร้านจ่ายเอง) · **ไม่เชื่อม = ตรวจมือเสมอ** (ไม่มีวันอนุมัติอัตโนมัติ/ปฏิเสธเองนอกจากซ้ำชัดเจน)
> 🔴 ไม่มีผลเงินในใบนี้ — อนุมัติ = outbox `payment.slip.approved` เท่านั้น (consumer เงินอยู่ B.8 / D.10)

## 1. ไฟล์
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/payment/slip-verify.ts» | ใหม่ | `submitSlip` `decideSlip` `slipQueue` `slipFileUrl` + pure `parseSlipQr` `maskPayerName` `payerNameMatches` `receiverMatches` + ค่าคงที่/ชนิด |
| «src/lib/payment/receiver.ts» | ใหม่ | `receiverFor` `promptpayQrFor` (ห่อ `promptpay.ts` เดิม · svg จาก `qrcode` ที่มีแล้ว) |
| `src/lib/core/integrations/providers/fake.ts` | แก้ (ไฟล์ชิ้นกลาง R0.5 · ใบ R0.x แก้ได้) | §6 สคริปต์สลิป FAKE + transRef ปริยายไม่ชนกัน |
| `src/lib/core/permissions.ts` | แก้ | โมดูล `payments` คีย์ `payments.slip.review` "ตรวจ/อนุมัติสลิปโอนเงิน" (MANAGER ได้ในสาขาที่คุมตาม `evaluate` · STAFF ต้องได้คีย์) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | แก้ | 3 event `payment.slip.submitted` `.approved` `.rejected` (consumer ปล่อยว่าง `withAutomation(async () => {})` แบบ R0.5) |

ห้าม: migration/แตะ `prisma/schema` (ตารางมีแล้วจาก R0.1 รวม unique บางส่วน 2 ตัว) · import `@/lib/modules/pos*` `@/lib/modules/account*` หรือเรียก `moduleTakeDeposit`/`recordExternalPayment` · import `providers/fake` ตรง (ผ่าน `@/lib/core/integrations` เท่านั้น) · แตะ `PosPaymentSlip` (X-POS.1) · `any` · build/commit/install · แก้ข้อสอบ

## 2. ชนิดร่วม
```ts
type SlipCtx = { tenantId: string };
type SlipActor = { userId: string };            // 🔴 สิทธิ์อ่านจาก Membership สด (tenantId,userId) — role/unitAccess/permissions ที่ส่งมาไม่นับ
type SlipStatus = "PENDING"|"AUTO_APPROVED"|"NEEDS_REVIEW"|"APPROVED"|"REJECTED";
type SlipReason = "DUPLICATE_IMAGE"|"DUPLICATE_TRANSREF"|"AMOUNT_SHORT"|"AMOUNT_OVER"|"RECEIVER_MISMATCH"|"RECEIVER_NOT_SET"
  |"TOO_OLD"|"FUTURE_TIME"|"PAYER_NAME_MISMATCH"|"DATA_MISSING"|"UNVERIFIED"|"VERIFIER_DOWN"|"VERIFIER_INVALID"
  |"VERIFIER_DUPLICATE"|"VERIFIER_UNKNOWN"|"TRANSREF_MISMATCH";
type SlipRefusal = { ok: false; code: "NOT_FOUND"|"PERMISSION_DENIED"|"VALIDATION"|"INVALID_STATE"|"IDEMPOTENCY_CONFLICT"|"STORAGE_NOT_CONFIGURED"|"NO_RECEIVER"|"UNKNOWN"; message: string }; // ไทย ไม่โทษผู้ใช้ · คืนเสมอ ไม่ throw
type SlipPolicy = { autoApprove: boolean; toleranceSatang: number; payerNameMatch: "OFF"|"WARN"|"BLOCK"; maxAgeHours: number };
```
- `SLIP_POLICY_DEFAULTS = { autoApprove: false, toleranceSatang: 0, payerNameMatch: "WARN", maxAgeHours: 72 }` (ตรง `_fallback` ของ R0.3 defs/payments.ts — autoApprove ร้านต้องเปิดเอง และ R0.3 บังคับว่าต้องมีตัวต่อ)
- อ่านนโยบาย: ถ้ามี `@/lib/core/settings` (R0.3 · ยังอยู่เลน 2) ใช้ `resolveSettings(ctx, keys, { unitId })` คีย์ `payments.slip.*` · ไม่มี ⇒ ค่าปริยาย (import แบบที่ build ผ่านทั้งก่อน/หลัง R0.3 ลง — เช่นแยก `slip-policy.ts` เล็ก ๆ ที่ผู้คุมต่อสายหลัง merge ก็ได้ · ข้อสอบกลุ่ม ST จะ SKIP จนกว่า R0.3 ลง) · `deps.policy` (Partial) ทับผลสุดท้าย — สำหรับข้อสอบ/ผู้เรียกฝั่งเซิร์ฟเวอร์ ห้ามรับจาก client
- `payments.slip.onVerifierDown` **ไม่ใช้ในใบนี้** — ตัวต่อล่มใช้ `fallback` ของ `callIntegration` (= `TenantIntegration.onFailure` ที่ร้านตั้งต่อการเชื่อม) · บันทึกให้ R0.3/R0.4 ตัดสินว่าค่าตั้งนี้ซ้ำซ้อน (wo-notes)

## 3. receiver.ts
- `receiverFor(ctx, unitId) → Promise<{ promptpayId: string; displayName: string; bankAccount?: string } | null>`
  - unitId ไม่ใช่ของร้าน ⇒ `null` · ลำดับ: ค่าตั้ง `payments.receiver` (UNIT→TENANT · มีเมื่อ R0.3 ลง) → `PaymentProfile` ของร้าน (`promptpayId` ว่าง ⇒ ไม่นับ) → `null`
  - รูปค่าของ `payments.receiver` (มติใบนี้): `{ promptpayId: string; displayName?: string; bankAccount?: string }` **หรือ** `{ paymentProfileId: string }` — `paymentProfileId` ต้องเป็นของ `ctx.tenantId` (อ่าน `tenantId` ของแถว) ไม่ใช่ ⇒ ไม่นับ ตกไปชั้นถัดไป (carry R0.3) · `promptpayId` ไม่ผ่าน `isValidPromptPayId` ⇒ ไม่นับ
- `promptpayQrFor(ctx, { unitId, amountSatang, ref }) → Promise<{ ok: true; payload: string; svgDataUrl: string; displayName: string } | SlipRefusal>`
  - `amountSatang` จำนวนเต็ม 1..9,999,999,999 (≤ ฿99,999,999.99) ไม่งั้น `VALIDATION` · unit ร้านอื่น/ไม่มี ⇒ `NOT_FOUND` · ไม่มีผู้รับ ⇒ `NO_RECEIVER`
  - payload = `promptpayPayload({ id: receiver.promptpayId, amountSatang })` (dynamic `01=12` + `54` ยอดล็อก · CRC เดิม) · `ref` ไม่ฝังใน payload (QR พร้อมเพย์บุคคลไม่รับประกัน ref) — ผู้เรียกเก็บเอง · `svgDataUrl` ขึ้นต้น `data:image/svg+xml`

## 4. slip-verify.ts — pure
- `parseSlipQr(payload) → { bankCode: string; transRef: string } | null` — QR สั้นบนสลิปธนาคารไทย: TLV ชั้นบน tag `00` = TLV ย่อย { `00` = `"000001"` · `01` = รหัสธนาคาร 3 หลัก · `02` = เลขอ้างอิง [A-Za-z0-9]{6,64} } (+ `51` `TH` · `91` CRC — **ไม่ตรวจ CRC** เพราะผู้ส่งคำนวณใหม่ได้อยู่แล้ว) · อ่านไม่ได้/ขาด tag ⇒ `null` ไม่ throw
- `maskPayerName(name) → string | null` — NFKC · ตัดคำนำหน้า (`นาย` `นาง` `นางสาว` `น.ส.` `ด.ช.` `ด.ญ.` `MR` `MRS` `MS` `MISS` มี/ไม่มีจุด ไม่สนตัวพิมพ์) · คืน `ชื่อต้น` + (มีคำถัดไป ? `" " + อักษรแรกของคำถัดไป + "."` : "") · ว่าง ⇒ `null` · เช่น `"นางสาว สมพร ชัยดีเลิศ"` ⇒ `"สมพร ช."` · `"MR. JOHN SMITH"` ⇒ `"JOHN S."`
- `payerNameMatches(slipName, expectedNames[]) → boolean | null` — ไม่มีชื่อฝั่งใดฝั่งหนึ่ง ⇒ `null` · ตรง = ชื่อต้น (หลังตัดคำนำหน้า · NFKC · ไม่สนตัวพิมพ์) เท่ากัน **และ** ถ้าทั้งคู่มีคำที่สอง อักษรแรกเท่ากัน (รองรับสลิปที่ธนาคารตัดนามสกุล `"น.ส. สมพร ช"`)
- `receiverMatches(receiverMasked, receiver) → boolean | null` — ตัวเลขชุดยาวสุดที่เห็นใน masked (≥4 หลัก) ต้องเป็น substring ของเลขใน `promptpayId` (รวมรูป `66`+ตัด 0 นำ) หรือ `bankAccount` · ไม่มี masked / เห็น <4 หลัก ⇒ `null`

## 5. slip-verify.ts — ฟังก์ชันฐานข้อมูล
### 5.1 `submitSlip(ctx, input, deps?)`
```ts
input = { unitId; domain: "BOOKING"|"DORM"|"HOTEL"; refType: "APPT_DEPOSIT"|"DORM_BILL"|"HOTEL_DEPOSIT"; refId; partyId?;
          file: { data: Uint8Array; contentType: string }; qrPayload?: string; expectedSatang: number;
          expectedPayerNames?: string[]; idempotencyKey: string }
deps   = { put?: UploadDeps["put"]; now?: Date; policy?: Partial<SlipPolicy>; verifyTimeoutMs?: number /* ปริยาย 8000 */ }
→ { ok: true; slipId; status: SlipStatus; reasons: SlipReason[]; replayed?: true } | SlipRefusal
```
**มติ (ต่างจาก CC §3.3 ที่เขียน `fileId`)**: รับ **ไบต์ไฟล์** แล้วอัปเองแบบส่วนตัว — เพราะต้องแฮชไบต์จริง (เปิดไฟล์จาก storage ใน QC/prod ไม่ได้เสมอ) · `fileId` = `FileAsset.id` ที่ได้ · QR ในรูปอ่านฝั่ง client (`@zxing/browser` มีแล้ว) ส่งมาเป็น `qrPayload` — เซิร์ฟเวอร์ไม่ถอดรูป
ลำดับ (ล้มข้อไหน = คืนทันที ไม่มีแถว/ไฟล์/event):
1. ตรวจ input: `domain`↔`refType` ต้องคู่กัน (BOOKING↔APPT_DEPOSIT · DORM↔DORM_BILL · HOTEL↔HOTEL_DEPOSIT) · `refId` 1..64 · `expectedSatang` จำนวนเต็ม >0 · `idempotencyKey` `[A-Za-z0-9_:-]{8,128}` · ไฟล์: mime `image/jpeg|png|webp` **และ** ไบต์หัวไฟล์ตรง · ≤ 5 MB (`SLIP_MAX_BYTES`) ⇒ ไม่ผ่าน `VALIDATION`
2. unit ไม่ใช่ของร้าน ⇒ `NOT_FOUND`
3. `imageHash` = sha256 hex ของไบต์ · **replay**: มีแถวในร้านที่ `checks.idempotencyKey` = key ⇒ แฮชเท่ากัน คืนแถวเดิม `replayed: true` (ไม่มีแถว/ไฟล์/event ใหม่ · ไม่เรียกตัวต่อ) · แฮชต่าง ⇒ `IDEMPOTENCY_CONFLICT`
4. ไม่มี storage (ไม่มี `deps.put` และ `storageEnabled()` false) ⇒ `STORAGE_NOT_CONFIGURED` · อัป `uploadFile(ctx, { kind: "ATTACHMENT", visibility: "private", … }, { put })`
5. ซ้ำชัดเจน (สถานะ `REJECTED` ทันที · ไม่เรียกตัวต่อ): แฮชรูปซ้ำแถวที่ไม่ใช่ REJECTED ในร้าน (ทุกสาขา) ⇒ `DUPLICATE_IMAGE` · `parseSlipQr(qrPayload).transRef` ซ้ำ ⇒ `DUPLICATE_TRANSREF`
6. ตัวต่อ: `getIntegration({ tenantId, unitId }, "SLIP_VERIFY")` · `null` ⇒ ทางมือ `NEEDS_REVIEW` เหตุผล `["UNVERIFIED"]` (ข้อ 7 ข้ามหมด · state `UNKNOWN`) · มี ⇒ `callIntegration(h, "slip.verify", (a, { signal }) => a.verify({ image: Buffer, qrPayload }, { amountSatang: expectedSatang, receiver }, { signal }), { timeoutMs })`
   - `ok:false` ⇒ `fallback` MANUAL ⇒ `NEEDS_REVIEW ["VERIFIER_DOWN"]` · REJECT ⇒ `REJECTED ["VERIFIER_DOWN"]`
   - `INVALID` ⇒ `NEEDS_REVIEW ["VERIFIER_INVALID"]` · `DUPLICATE` ⇒ `["VERIFIER_DUPLICATE"]` · `UNKNOWN` ⇒ `["VERIFIER_UNKNOWN"]` (คนตัดสิน — ไม่ปฏิเสธตามคำผู้ให้บริการ)
   - `VALID` ⇒ ข้อ 7 ด้วยข้อมูลที่ได้ · `transRef` = ของตัวต่อ ?? ของ QR (ต่างกัน ⇒ เพิ่ม `TRANSREF_MISMATCH`) · transRef ซ้ำแถวอื่น ⇒ `REJECTED ["DUPLICATE_TRANSREF"]`
7. ตรวจในระบบ 5 ข้อ ⇒ `checks.items.{amount,transRef,receiver,age,payerName}.state ∈ OK|FAIL|UNKNOWN|SKIP`
   - amount: `|ได้−คาด| ≤ toleranceSatang` OK · ขาด `AMOUNT_SHORT` · เกิน `AMOUNT_OVER`
   - transRef: ไม่ซ้ำ OK (ซ้ำจัดการข้อ 5/6 แล้ว)
   - receiver: `receiverFor` null ⇒ FAIL `RECEIVER_NOT_SET` · `receiverMatches` false ⇒ `RECEIVER_MISMATCH`
   - age: `transferredAt` เก่ากว่า `maxAgeHours` ⇒ `TOO_OLD` · ล้ำ `now` เกิน 10 นาที ⇒ `FUTURE_TIME`
   - payerName: OFF ⇒ SKIP · ไม่ตรง ⇒ `PAYER_NAME_MISMATCH` (WARN = เตือนอย่างเดียว ยังอนุมัติอัตโนมัติได้ · BLOCK = ต้องให้คน) · ไม่รู้ (`null`) ⇒ WARN: SKIP · BLOCK: UNKNOWN
   - ข้อไหน UNKNOWN (ตัวต่อไม่ส่งยอด/ผู้รับ/เวลา) ⇒ เพิ่ม `DATA_MISSING` ครั้งเดียว
   - ผล: มีเหตุผลที่ไม่ใช่คำเตือน ⇒ `NEEDS_REVIEW` · ไม่มี + `autoApprove` ⇒ `AUTO_APPROVED` · ไม่มี + ไม่ autoApprove ⇒ `PENDING`
8. เขียนใน tx เดียว: แถว `PaymentSlip` (`reviewReason` = เหตุผลคั่น `,` หรือ null · `checks = { idempotencyKey, items, … }` · `verifierIntegrationId`) + outbox (§5.5) · **P2002 จาก unique บางส่วน** (ยิงพร้อมกัน/ต่างสาขา — carry R0.6) ⇒ อ่านใหม่: แถวที่ชนมี idempotencyKey เดียวกัน ⇒ replay · ไม่ใช่ ⇒ เขียนเป็น `REJECTED` เหตุผล `DUPLICATE_IMAGE`/`DUPLICATE_TRANSREF` ตามดัชนีที่ชน (ห้ามโยนออกไปหาผู้เรียก)
- **PII (carry R0.6 · X8)**: `payerName` เก็บ `maskPayerName(...)` เท่านั้น · `verifierResult` เก็บเฉพาะคีย์ `status amountSatang transRef transferredAt receiverMasked providerRef` (ไม่มีชื่อ · ไม่มีรูป) · ชื่อเต็ม/`expectedPayerNames` ห้ามลง DB/log/event/console · `bankCode` จาก QR
- ผลคืนห้ามมี URL/`private://`/path ไฟล์

### 5.2 `decideSlip(actor, ctx, slipId, { decision: "APPROVE"|"APPROVE_PARTIAL"|"REJECT"; amountSatang?; reason })`
→ `{ ok: true; slipId; status: "APPROVED"|"REJECTED" } | SlipRefusal`
- แถวไม่ใช่ของร้าน ⇒ `NOT_FOUND` · สิทธิ์ = `evaluate(Membership สด, { module: "payments", action: "payments.slip.review", unitId: slip.unitId })` ไม่ผ่าน/ไม่มี membership ⇒ `PERMISSION_DENIED`
- `reason` trim ไม่ว่าง ≤ 500 · `APPROVE_PARTIAL` ต้องมี `amountSatang` จำนวนเต็ม 1..expectedSatang−1 ⇒ ไม่ผ่าน `VALIDATION`
- ตัดสินได้เฉพาะ `PENDING`/`NEEDS_REVIEW` อื่น ⇒ `INVALID_STATE` · **กันพร้อมกัน**: `updateMany where { id, status in [PENDING, NEEDS_REVIEW] }` count 1 = ชนะ (10 ทางพร้อมกัน = สำเร็จ 1 · event 1)
- ยอดที่อนุมัติ: APPROVE = `amountSatang ?? slip.amountSatang ?? slip.expectedSatang` · PARTIAL = `amountSatang` · เก็บใน `checks.decided = { decision, amountSatang }` · `decidedById` `decidedAt`
- tx เดียว: เปลี่ยนสถานะ + outbox + `AuditLog` action `payments.slip.decide` targetType `PaymentSlip` targetId slipId (ไม่มีชื่อเต็ม)

### 5.3 `slipQueue(actor, ctx, { unitId, domain?, status? })` (มติ: เพิ่ม actor จาก CC — คิวมีข้อมูลผู้โอน)
→ `{ ok: true; items: SlipView[] } | SlipRefusal` · unit ร้านอื่น ⇒ `NOT_FOUND` · สิทธิ์เหมือน decide · `status` ไม่ส่ง = `PENDING`+`NEEDS_REVIEW` (ส่งตัวเดียวหรืออาร์เรย์ได้) · ใหม่สุดก่อน
`SlipView = { id, unitId, domain, refType, refId, status, reasons: SlipReason[], expectedSatang, amountSatang, payerName /* masked */, bankCode, transferredAt, createdAt, hasFile }` — ห้ามมี URL/path/`private://`

### 5.4 `slipFileUrl(actor, ctx, slipId) → { ok: true; url: string; expiresAt: string } | SlipRefusal`
- สิทธิ์เหมือน decide · ใช้ `privateFileUrl(fileId, { kind: "STAFF", id: actor.userId }, SLIP_VIEW_TTL_SEC /* 300 */)` (route `/api/files/[id]` เดิมตรวจลายเซ็น) · ไม่มี URL ถาวรที่ไหนเลย (X10)

### 5.5 event (CC §7 · idempotencyKey `payment.slip.<ชนิด>:<slipId>` · tx เดียวกับการเขียน)
- payload **พอดี** `{ slipId, domain, refType, refId, amountSatang, status }` (amountSatang = ยอดอ่านได้/ยอดที่อนุมัติ · `null` ได้เมื่อยังไม่รู้)
- แถวใหม่ทุกแถว ⇒ `payment.slip.submitted` 1 ครั้ง · เกิดเป็น `AUTO_APPROVED` ⇒ `approved` เพิ่ม · เกิดเป็น `REJECTED` ⇒ `rejected` เพิ่ม · decide ⇒ `approved`/`rejected` 1 ครั้ง · replay ⇒ ไม่มี event

## 6. FAKE (providers/fake.ts · SLIP_VERIFY.verify)
- `qrPayload` ขึ้นต้น `"FAKESLIP:"` + base64url(JSON) ⇒ คืน JSON นั้น (`status` ไม่ใส่ = `"VALID"` · คีย์ตาม `SlipVerifyResult`) — ยังผ่าน `gate` ตาม mode (FAIL/QUOTA/SLOW/HANG) เหมือนเดิม
- ไม่ใช่สคริปต์ ⇒ พฤติกรรมเดิม แต่ `transRef` = `FAKE-` + `randomUUID()` (ของเดิม `Date.now()` ชนกันเมื่อยิงพร้อมกัน ⇒ ซ้ำปลอม)
- ข้อสอบ R0.5 ต้องยังเขียว (ผู้คุมรันซ้ำ)

## 7. เกณฑ์รับ · regression
- `qc-svc-r0.6.mts` (66 ข้อ) ไม่มี FAIL · SKIP ที่ยอมได้ = ST-1..3 (รอ R0.3 ลง — ผู้คุมรันซ้ำหลัง merge R0.3) · R-4 (เฉพาะเมื่อร้าน B มี PaymentProfile อยู่แล้ว) · ข้อสอบปฏิเสธรันนอก gate lock (exit 4)
- regression: `qc-svc-r0.5.mts` · `qc-svc-smoke.mts` · tsc · fitness 2 โหมด
- ตรวจเข้ม 2 รอบ (เงิน · ข้ามร้าน · PII)
- หนี้ที่รู้ (ไม่ใช่ของใบนี้): ระยะเก็บไฟล์/ชื่อผู้โอน (PDPA J5 · งานลบตามอายุ) · สลิปซ้ำข้าม POS (X-POS.1) · หน้าคิวตรวจ = D.10/B.8
