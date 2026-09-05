# WO C2 — WRITE การชำระเงิน ผ่าน REST `/api/v1/account/*`

ผู้ทำ: Opus (builder) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §C2 · oracle: `scripts/qc-account-api-write-payments.mts` (Fable เขียน — **ไม่ได้แตะ**)

**สถานะ: เขียวหมด 32/32 · CRITICAL 0 · MAJOR 0** (ตั้งแต่รอบแรก ไม่มีข้อไหนต้องโต้แย้ง oracle)
ทะเบียนรวม **105 op** (จาก 95 ของ C1 + 10 ตัวของ C2)

## ไฟล์

### ใหม่
- `src/lib/modules/account/api/ops/payments-write.ts` — 10 op ของ C2 (ไม่มี raw prisma · ทุกก้อนออกผ่าน `../serialize.ts` / `../serialize-finance.ts`)
- `src/lib/modules/account/api/wht-income.ts` — ตารางชื่อประเภทเงินได้ ม.40 ที่ผู้เรียกส่งได้ (`SERVICE` → `M40_8` ฯลฯ) + `whtIncomeTypeField` (zod) + `toWhtIncomeType()`
  · **แหล่งเดียว** — D1 (`POST /wht/certs`) ยิง `whtIncomeType: "SERVICE"` เหมือนกัน ให้ import ตัวนี้ ห้ามก็อปตาราง

### แก้ (additive ทั้งหมด — ผู้เรียก/หน้าจอเดิมไม่มีใครเปลี่ยนพฤติกรรม)
- `api/op.ts` — `ApiOpCtx` เพิ่ม `idempotencyKey: string | null`
- `api/dispatch.ts` — เติม `idempotencyKey` จาก header `Idempotency-Key` เข้า ctx (read = null เพราะไม่มี header)
- `api/registry.ts` — ต่อ `PAYMENTS_WRITE_OPS` เข้า `ACCOUNT_OPS`
- `api/serialize.ts` — ใหม่ `paymentPanelView()` · `groupCandidateView()` · ขยายพารามิเตอร์ของ `paymentView` เป็นชนิดโครงสร้าง `PaymentRowLike` (รับได้ทั้ง `DocPaymentRow` ของหน้ารายละเอียด และแถวของแผงการชำระ ⇒ `GET /documents/{id}` กับ `GET /documents/{id}/payments` คืน "แถวการชำระ" รูปเดียวกันเป๊ะ)
- `payment.ts` — `RecordPaymentsResult.ok` เพิ่ม `paymentIds: string[]` · `PaymentRowView` เพิ่ม `financeAccountId: string | null` (ค่านี้ `listDocPayments` คืนมาอยู่แล้ว แค่ type ไม่ได้ประกาศไว้)
- `docs/api/ACCOUNT-API.md` — regenerate (`pnpm exec tsx scripts/gen-account-api-docs.mts` · 105 op)

**ไม่มี migration** (ไม่แตะ schema เลย)

## Op ↔ Service ↔ ผลลัพธ์

| op id | REST | kind · scope | service | คำตอบ |
|---|---|---|---|---|
| `payments.record` | `POST /payments` | write · payment.record | `recordPayments(…, { userId: null, keyBase })` | `{documentId (=targetDocId), status, paidSatang, outstandingSatang, payments: [paymentId], whtCertNos}` |
| `payments.list` | `GET /documents/{id}/payments` | read · doc.view | `paymentPanelData` | `{panel{documentId,type,docNo,direction,contactName,grandTotalSatang,paidSatang,outstandingSatang,whtBaseSatang}, rows[…]}` |
| `payments.void` | `POST /payments/{paymentId}/void` | **danger** · payment.void | `voidPaymentAny` + `getDocRef` | `{documentId, status}` |
| `documents.refund-deposit` | `POST /documents/{id}/refund-deposit` | **danger** · doc.void | `refundDeposit` + `getDocRef` | `{refundedSatang, status}` |
| `payment-requests.create` | `POST /payment-requests` | write · payment.record | `createPaymentRequest` | `paymentRequestView` (ตัด `token`) + `reused` |
| `payment-requests.confirm` | `POST /payment-requests/{id}/confirm` | write · payment.record | `confirmStaticPaymentRequest` | `{paymentId, duplicated}` |
| `payment-requests.cancel` | `POST /payment-requests/{id}/cancel` | write · payment.record | `cancelPaymentRequest` | `{id, status: "CANCELLED"}` |
| `documents.group-candidates` | `GET /documents/group-candidates?type&contactId` | read · doc.view | `listGroupCandidates` | `[{id,docNo,type,issueDate,dueDate,grandTotalSatang,outstandingSatang,eligible,blockedReason}]` |
| `payments.record-group` | `POST /payments/group` | write · payment.record | `recordGroupPayment(…, { userId: null, clientKey })` | `{batchKey, recorded, allocations[{childDocumentId,docNo,tieOffSatang,whtSatang,cashSatang}], status, outstandingSatang, whtCertNos}` |
| `payments.void-group` | `POST /payments/group/{batchKey}/void` | **danger** · payment.void | `voidGroupPayment` | `{voided}` |

### `GET /payment-requests` (รายการลิงก์ของเอกสาร)
**ไม่ได้สร้างใหม่** — B3 `ops/finance-read.ts` มี `payment-requests.list` (GET `/payment-requests`, read · doc.view, `test: B3-F3.1`) อยู่แล้ว และใช้ `serialize-finance.paymentRequestView` ตัวเดียวกัน
⇒ C2-P6.7 ของ oracle ยิงผ่านตัวเดิม · ตอนแรกเผลอสร้างซ้ำ → `CORE-10.3` (id/method+path ห้ามซ้ำ) แดง แล้วลบทิ้ง
🔴 **บทเรียนสำหรับ WO ถัดไป**: ก่อนเพิ่ม op ให้ grep `id:`/`path:` ในทะเบียนก่อน — ด่านที่จับได้คือ `qc-account-api-core.mts` CORE-10.3 ไม่ใช่ typecheck

## payment id กลับมาทางไหน

`recordPayments` เดิมไม่คืน id ของรายการชำระที่สร้าง (คืนแค่ `certNos`/`recorded`) ⇒ ผู้เรียกยิง `POST /payments/{paymentId}/void` ต่อไม่ได้ ต้องไปเดาจากรายการชำระของเอกสาร
แก้แบบ additive ใน `payment.ts` — **ไม่ query เพิ่มสักคำสั่ง**:
- ทางปกติ: `recordPayment`/`recordVendorPayment` คืน `paymentId` อยู่แล้วในแต่ละรอบ → เก็บใส่ `paymentIds` ตามลำดับ `drafts`
- ทางกันซ้ำ (ยิง `keyBase` เดิมซ้ำ): แถวเดิมถูกอ่านด้วย `findPaymentsByKeys` อยู่แล้ว → ทำ map `idempotencyKey → id` แล้วเรียง id **ตามลำดับคีย์** (`<keyBase>:0,1,2…`) ไม่ใช่ตามลำดับที่ฐานคืนมา ⇒ retry ได้ผลลัพธ์เท่าเดิมทุกตำแหน่ง

## คีย์กันซ้ำ 2 ชั้น

| ชั้น | ค่า | อายุ | กันอะไร |
|---|---|---|---|
| API (`api/idempotency.ts`) | header `Idempotency-Key` ต่อ 1 คีย์ | 24 ชม. | "คำขอเดิมที่ยิงซ้ำ" (ตอบซองเดิมกลับ) |
| บริการ | `keyBase = api:<keyId>:<Idempotency-Key>` | ตลอดไป (คอลัมน์ `AccountDocumentPayment.idempotencyKey`) | "รายการชำระซ้ำ" — retry ที่มาหลังแถวชั้น API หมดอายุ ยังไม่งอกเงินใบที่สอง |

- **การชำระกลุ่ม** ใช้ `clientKey = sha256("api:<keyId>:<Idempotency-Key>").slice(0,40)`
  เหตุผล: `group.groupBatchKey()` หนีบ clientKey ที่ **60 ตัวอักษร** (batchKey ต้องใส่ลง path ของ endpoint ยกเลิกได้) — ส่ง `api:<cuid 25>:<idem>` ดิบเข้าไปเสี่ยงถูกตัดจนส่วนที่แยก "คนละคำขอ" หายไป แล้วคำขอที่ 2 ได้ batchKey เดียวกับที่ 1 = คืนผลของใบแรกเงียบ ๆ · hash ยาวคงที่ + ยังเป็นฟังก์ชันของคำขอเดิม ⇒ retry ได้ batchKey เดิมเป๊ะ
- ไม่มี `Idempotency-Key` เป็นไปไม่ได้ในทาง write (dispatch เด้ง 400 ก่อน) — โค้ดยังถอยไปใช้ `requestId` เพื่อไม่ให้เกิดคีย์ว่างซ้ำกันข้ามคำขอ

## การแปลง error

**หลักที่ยึด: ห้ามอ่านสถานะเอกสารมาตัดสินก่อนเรียก service** — ด่านกันจ่ายเกิน/จ่ายซ้ำอยู่ใน transaction ที่ `SELECT … FOR UPDATE` แถวเอกสารแล้ว (`service.recordPayment` WO 9.2 ข้อ 12) ถ้าชั้น API ตรวจเองก่อน คำขอ 2 ใบที่มาพร้อมกันจะผ่านด่านของเราทั้งคู่ ⇒ ชั้นนี้ทำได้อย่างเดียวคือ **แปลผลที่ service ตัดสินแล้ว**
(วัดจริง: C2-P2.2 ยิงชำระเต็มยอดพร้อมกัน 2 คำขอคนละ Idempotency-Key → 200 ใบเดียว · `paidTotal == grandTotal` พอดี)

| เหตุผลจาก service | HTTP | ทางไหน |
|---|---|---|
| `ไม่พบเอกสาร` / `ไม่พบรายการชำระ` / `ไม่พบคำขอชำระเงิน` / `ไม่พบรายการชำระของครั้งนี้` | 404 `not_found` | `mapError` (ขึ้นต้น "ไม่พบ") |
| `เอกสารนี้รับ/จ่ายชำระไม่ได้ในสถานะปัจจุบัน` · `เอกสารนี้ไม่อยู่ในสถานะที่เก็บเงินได้…` · `ยกเลิกไม่ได้ — คำขอนี้ไม่อยู่ในสถานะรอชำระแล้ว` | 409 `state_conflict` | `mapError` (มีคำว่า "สถานะ") |
| `ยอดชำระเกินยอดคงเหลือ` · `รายการชำระนี้ถูกยกเลิกแล้ว` · `เอกสารนี้ไม่มียอดคงค้างแล้ว` | 409 `state_conflict` | **`failPayment()` ของ op นี้บังคับเอง** — ข้อความไม่มีคำที่ `mapError` จับได้ แต่ความหมายคือ "สถานะไม่ให้ทำ" (ห้ามไปแก้ข้อความใน service — มีคนอ่านบนหน้าจออยู่) |
| `ช่องทาง “…” ยังไม่ได้กรอกพร้อมเพย์ …` · `ช่องทางการเงินไม่ถูกต้อง` · `คีย์การชำระไม่ตรงกับเอกสารนี้` | 422 `unprocessable` (ข้อความไทยเดิม) | `mapError` (ไทยอื่น ๆ) |
| คีย์ไม่มี scope | 403 `scope_missing` | ด่านหน้า `require.ts` |
| danger ไม่ส่ง `confirm`/`reason` | 409 `confirm_required` / 422 `validation` | `dispatch.ts` |

จุดที่ต้องรู้:
- **ข้ามร้าน = 404 ไม่ใช่ 403** — `voidPaymentAny` หา `documentId` ในสมุดของคีย์ก่อน ไม่เจอ = "ไม่พบเอกสาร" (C2-P4.4)
- `payment-requests.confirm` ยิงซ้ำ = **200 `duplicated: true`** (ไม่ใช่ 409) — service จำด้วยคีย์ `pp-manual:<requestId>` ⇒ ไม่บันทึกเงินซ้ำ
- เพดาน 60 คำขอ/ชม./ระบบ ของ `createPaymentRequest` (`accountRateGuard`) ยังอยู่ตามเดิม ไม่ได้ปิด

## ของที่ตัดออกจากคำตอบโดยตั้งใจ
- `PaymentRequestView.token` — capability ของหน้าสาธารณะ `/pay/<token>` ใครถือก็เปิดได้ · ผู้เรียกได้ `url` ที่ประกอบเสร็จแล้ว
- `PaymentPanelData.channels` (รายการช่องทางของทั้งร้าน — มี `/finance-accounts` ของตัวเอง) · `targetDocId`/`canRecord` (เรื่องของปุ่มบนหน้าจอ)

## คำสั่ง + บรรทัดสุดท้าย

env ทุกคำสั่ง: `export QC_ENV_FILE=.env.qc DATABASE_URL=… DIRECT_URL=… APP_ENV=development` (จาก `.env.qc` · ตรวจ `ep-plain-art` ก่อนทุกครั้ง)

```
pnpm exec tsx scripts/qc-account-api-write-payments.mts
  ผ่าน 32/32 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":32,"passed":32,"findings":[]}

pnpm exec tsx scripts/qc-account-api-write-docs.mts
  JSON_SUMMARY {"total":52,"passed":52,"findings":[]}
pnpm exec tsx scripts/qc-account-api-read-docs.mts
  JSON_SUMMARY {"total":50,"passed":50,"findings":[]}
pnpm exec tsx scripts/qc-account-api-read-finance.mts
  JSON_SUMMARY {"total":38,"passed":38,"findings":[]}
pnpm exec tsx scripts/qc-account-api-core.mts
  JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
pnpm exec tsx scripts/qc-account-api-openapi.mts
  JSON_SUMMARY {"total":26,"passed":26,"findings":[]}

pnpm exec tsx scripts/qc-account-cpa.mts
  JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
pnpm exec tsx scripts/qc-acc-v2-payments.mts      → ===== สรุป WO 1.4: ผ่าน 162 · ไม่ผ่าน 0 =====
pnpm exec tsx scripts/qc-acc-v2-promptpay.mts     → ผ่าน 84 · ตก 0 · JSON_SUMMARY {"total":84,"passed":84,"findings":[]}
pnpm exec tsx scripts/qc-acc-v2-groups.mts        → ===== สรุป WO 1.7: ผ่าน 174 · ไม่ผ่าน 0 =====
pnpm exec tsx scripts/qc-acc-v2-security.mts      → ===== สรุป: ผ่าน 298 · ไม่ผ่าน 0 =====   (S12 row-lock เขียว)

pnpm exec tsx scripts/gen-account-api-docs.mts
  ✅ เขียน docs/api/ACCOUNT-API.md (105 op · 73939 ไบต์)

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
  > tsc --noEmit      (ไม่มี error — 0)

pnpm fitness
  ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
  ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

ไม่ commit · tree dirty ตามกติกา (`git status`: M `docs/api/ACCOUNT-API.md`, `api/dispatch.ts`, `api/op.ts`, `api/registry.ts`, `api/serialize.ts`, `payment.ts` · ?? `api/ops/payments-write.ts`, `api/wht-income.ts`)
