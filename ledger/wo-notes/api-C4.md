# WO C4 — webhook events ชุดแรก (11 ตัว) · builder Opus

สถานะ: **โค้ดเสร็จ · ด่านผ่านหมด ยกเว้น C4-E5.2 / C4-E5.6 ที่ผมเชื่อว่าเป็นเลขในข้อสอบผิดเอง (ดู §6)**
ไม่ commit · ไม่แตะ oracle · ไม่มี migration (สคีมาไม่เปลี่ยน)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/account/events.ts` (**ใหม่**) | ที่เดียวของ payload + idempotencyKey + `eventDay()` (วันปฏิทินไทย) ของ event บัญชีทุกตัว · ไม่ import prisma (F5 ไม่ขยับ) |
| `src/lib/webhooks/labels.ts` | ป้ายไทยของ event ใหม่ 11 ตัว |
| `src/lib/outbox-consumers.ts` | consumer `withAutomation(async () => {})` ครบ 11 ตัว (ขาด 1 = คิวตันทั้งระบบ) |
| `src/lib/modules/account/service.ts` | issue · quotation response · void doc · void payment · contact create/update · expire payment requests · `markPaymentRequestPaid()` ใหม่ |
| `src/lib/modules/account/expense.ts` | issueExpenseDoc · submitForApproval · approvePurchaseOrder · voidExpenseDoc · voidVendorPayment |
| `src/lib/modules/account/product.ts` | createProduct · updateProduct · approveGoodsMovement |
| `src/lib/modules/account/contact-merge.ts` | mergeContacts |
| `src/lib/modules/account/payment-request.ts` | `handleBeamPaid` + `confirmStaticPaymentRequest` → เรียก `markPaymentRequestPaid` (ไฟล์นี้ห้ามแตะ prisma ดิบ) |
| `src/lib/modules/account/api/openapi.ts` | `info.description` ข้อ 11 = รายชื่อ event `account.*` (ดึงจาก labels) + วิธีตรวจลายเซ็น (ASCII ล้วน — OA-1.5 ยังเขียว) |
| `scripts/gen-account-api-docs.mts` | หัวข้อ **Webhooks** (รายชื่อจาก labels · ขั้นตอนตรวจ `X-Shark-Signature` + โค้ดตัวอย่าง TS · ตัวอย่าง body ครบทุก event) |
| `docs/api/ACCOUNT-API.md` | regenerate (105,574 ไบต์ · `--check` เขียว) |

## 2. แผนที่ event → จุดยิง (ไฟล์:บรรทัด)

| event | จุดยิง |
|---|---|
| `account.document.issued` | `service.ts:2244` (`issueDocument`) · `expense.ts:1002` (`issueExpenseDoc`) · `expense.ts:1447` (`submitForApproval` PO/APO — ใบสั่งซื้อได้เลขที่ตอนนี้) · `product.ts:1161` (`approveGoodsMovement`) |
| `account.document.approved` | `expense.ts:1504` (`approvePurchaseOrder` — ย้ายมาที่ **service** ตามสั่ง · action เดิมยังยิงซ้ำได้ คีย์เดียวกัน = ข้ามเงียบ) |
| `account.document.voided` | `service.ts:3111` (`voidDocument`) · `expense.ts:1378` (`voidExpenseDoc`) |
| `account.quotation.responded` | `service.ts:2283` (`setQuotationResponse`) — ตรวจแล้ว **ไม่มีทางลัดหน้า public**: ผู้เรียกทั้งหมดคือ `actions.ts:256` + `api/ops/documents-write.ts:595` |
| `account.payment.voided` | `service.ts:2769` (`voidPayment`) · `expense.ts:1325` (`voidVendorPayment`) ⇒ `voidPaymentAny` ครอบทั้งคู่ (มันส่งต่อไป 2 ตัวนี้) |
| `account.payment_request.paid` | `service.ts:3265` ผ่าน `markPaymentRequestPaid()` · เรียกจาก `payment-request.ts:498` (`handleBeamPaid`, provider `BEAM`) และ `:587` (`confirmStaticPaymentRequest`, provider `PROMPTPAY_STATIC`) |
| `account.payment_request.expired` | `service.ts:3226` (`expirePaymentRequestsAll` — `expireRequests` ห่อตัวนี้อยู่) |
| `account.contact.created` / `.updated` | `service.ts:967` / `service.ts:1050` |
| `account.contact.merged` | `contact-merge.ts:443` |
| `account.product.created` / `.updated` | `product.ts:533` / `product.ts:607` |

ทุกตัว: `emitOutboxMany(tx, …)` **ใน tx เดียวกับงานหลัก** · มี `systemId` · payload ไม่มี `tenantId`/`systemId`
(ทั้งคู่อยู่ที่ "ซอง" ของ `OutboxEvent` แล้ว — `dispatchWebhooks` ส่งเฉพาะ payload ออกนอกร้าน)
เงิน `…Satang` (int) · `issueDate` = `YYYY-MM-DD` เวลาไทย (`Intl.DateTimeFormat("en-CA", TZ=Asia/Bangkok)`).

### จุดที่ต้องเปิด tx ใหม่ (เดิมไม่มี)
`setQuotationResponse` · `createContact` · `updateContact` · `createProduct` · `updateProduct` ·
`approvePurchaseOrder` · `expirePaymentRequestsAll` — ของเดิมเป็น `update/updateMany` เดี่ยว ๆ
ห่อเป็น `$transaction` เพื่อให้ "งานหลัก + event" เกิด/ไม่เกิดพร้อมกันตามสัญญา

## 3. นโยบาย idempotency

| แบบ | ใช้กับ | เหตุผล |
|---|---|---|
| `<type>#<id>` | issued · approved · voided · payment.voided · payment_request.paid/.expired · contact.created · contact.merged (`#<mergedId>`) · product.created | เหตุการณ์เกิดได้ครั้งเดียวต่อ id นั้นตลอดชีวิต |
| `<type>#<id>#<accepted>` | quotation.responded | ตอบรับแล้วเปลี่ยนใจเป็นปฏิเสธ = คนละเหตุการณ์ที่ปลายทางต้องรู้ทั้งคู่ |
| `<type>#<id>#<updatedAt ms>` | contact.updated · product.updated | "แก้" เกิดซ้ำไม่จำกัดครั้ง · 🔴 อ่าน `updatedAt` **หลังเขียน ใน tx เดียวกัน** (อ่านก่อน = ได้ค่าเก่า → แก้ 2 ครั้งติดกันจะได้ event ใบเดียว) |

## 4. กันยิงซ้ำอย่างไร

1. **คีย์ผูกกับ id ของสิ่งที่เกิด ไม่ใช่ทางเข้า** ⇒ UI / REST / สกิล AI ที่ลงเอยที่ service เดียวกันได้ใบเดียว
2. **ห่อกันเป็นชั้นไม่ซ้ำ**: `createGroupDoc` → `issueDocument`/`issueExpenseDoc` ⇒ ยิงที่ตัวในสุดที่เดียว
   คีย์ = `account.document.issued#<docId>` เอกสารกลุ่มใบเดียว = event ใบเดียว (ยืนยันด้วย probe §6)
3. **`emitOutboxMany` + `createMany({skipDuplicates:true})` = 1 คำสั่ง** อาศัย `@@unique(tenantId,idempotencyKey)`
   ⇒ ชนคีย์เดิม **ข้ามเงียบ ๆ ไม่ abort tx หลัก** (ต่างจาก `create` ที่ P2002 จะพา tx ทั้งก้อนพัง)
   เลือกตัวนี้แทน `emitOutbox` (findUnique+create = 2 คำสั่ง) เพราะบาง tx ถือ row-lock ของเอกสารอยู่
4. **`approvePurchaseOrder` ยิงคีย์เดียวกับ `approvePOAction`** ⇒ กดผ่านจอ = service ยิงก่อน · action ยิงตามแล้วถูกข้าม
5. **ลูป retry เลขที่เอกสาร (contact/product)** ห่อ **เฉพาะครั้งที่สำเร็จ** ไม่ใช่ทั้งลูป — ชนเลข = tx นั้น
   abort แล้วลูปเปิด tx ใหม่ (ถ้าห่อทั้งลูป P2002 ใบแรกจะทำให้คำสั่งถัดไปใน tx เดิมพังหมด)
6. **`expirePaymentRequestsAll` (cron ข้ามร้าน)** อ่านแถวก่อนปิด → event ผูก `tenantId/systemId` ของ **แต่ละแถว**
   รัน 2 โปรเซสพร้อมกัน: อีกตัวปิดไปก่อน = `updateMany` นับน้อยกว่า แต่ event ไม่ซ้ำ (คีย์ = requestId)

## 5. คำสั่ง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… APP_ENV=development   (Neon QC ep-plain-art · ยืนยัน host ทุกครั้ง)
```

| ด่าน | ผล |
|---|---|
| `qc-account-api-webhooks` (C4 oracle) | `ผ่าน 20/22` · `CRITICAL 1 · MAJOR 1` → `["C4-E5.2","C4-E5.6"]` (ดู §6) |
| `qc-account-api-write-docs` | `ผ่าน 52/52` · CRITICAL 0 MAJOR 0 |
| `qc-account-api-write-payments` | `ผ่าน 32/32` · CRITICAL 0 MAJOR 0 |
| `qc-account-api-write-master` | `ผ่าน 44/44` · CRITICAL 0 MAJOR 0 |
| `qc-account-api-core` | `ผ่าน 64/64` · CRITICAL 0 MAJOR 0 |
| `qc-account-api-openapi` | `ผ่าน 26/26` · CRITICAL 0 MAJOR 0 |
| `qc-account-cpa` | `ผ่าน 107/107` · CRITICAL 0 MAJOR 0 |
| `qc-webhook` | `ผ่าน 15/15` · CRITICAL 0 MAJOR 0 |
| `qc-webhook-ui` | `ผ่าน 11/11` · CRITICAL 0 MAJOR 0 |
| `gen-account-api-docs --check` | `✅ ตรงกับทะเบียน (130 op)` |

> ไม่มี `qc-acc-v2-webhooks*.mts` / `qc-acc-v2-outbox*.mts` ในโฟลเดอร์ (`ls scripts | grep -iE "webhook|outbox"` →
> `diag-outbox-lag.mts` · `qc-account-api-webhooks.mts` · `qc-webhook.mts` · `qc-webhook-ui.mts`) → รัน 2 ตัวหลังแทน
> ⚠️ `qc-webhook.mts` ใช้ `process.loadEnvFile(".env")` = **แตะ prod ถ้าไม่ export env ก่อน** ·
> พิสูจน์แล้วว่า `loadEnvFile` ไม่ทับตัวแปรที่ตั้งไว้แล้ว (`FOO=fromenv node -e 'loadEnvFile(...)'` → `fromenv`)
> จึงรันบน QC ได้ปลอดภัยเมื่อ export ในบรรทัดเดียวกัน

```
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   → ไม่มี output (0 error)
pnpm fitness                                            → ผ่าน 20/20 · CRITICAL 0 MAJOR 0 MINOR 0
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness → ผ่าน 20/20 · CRITICAL 0 MAJOR 0 MINOR 0
```

ไม่มี `any` ใน `src/` ที่เพิ่ม · F5 (raw prisma ในโมดูล) ไม่ขยับ — `events.ts` ตั้งใจไม่ import prisma
(รับ `tx` จากผู้เรียก) และ `payment-request.ts` ยังไม่แตะ prisma ดิบ (เลยต้องมี `markPaymentRequestPaid` ใน service)

## 6. 🔴 2 ข้อที่ตก — ผมคิดว่าเลขในข้อสอบผิด ไม่ได้แก้อะไร (ตามกติกา "หยุดแล้วรายงาน")

```
❌ [C4-E5.2] ปลายทางที่สมัคร document.issued ได้รับ 2 ครั้ง (QT+IV) — exp 2 | act 4
❌ [C4-E5.6] WebhookDelivery OK = 4 แถว — exp 4 | act 6
```

**ข้อสอบเองออกเอกสารที่ต้อง issue 4 ใบ ไม่ใช่ 2 ใบ** — ตัว oracle เรียก `acc.issueDocument` 4 ครั้งกับ
เอกสาร 4 ใบที่ต่างกัน:

| # | เอกสาร | บรรทัดใน oracle |
|---|---|---|
| 1 | `qt` (QUOTATION) | E3 `await acc.issueDocument(tid, SYS, qt.id)` |
| 2 | `conv.newId` (INVOICE ที่แปลงมา) | E3.4 |
| 3 | `iv2` (INVOICE) | **E4.1** — ต้อง issue ก่อนจึงสร้าง payment request ได้ |
| 4 | `iv3` (INVOICE) | **E4.2** — ต้อง issue ก่อนจึงสร้าง payment request ให้หมดอายุได้ |

endpoint ทั้ง 2 ตัวถูกสร้างใน E5 **หลัง** ทั้ง 4 ใบ และ `dispatchWebhooks` หา endpoint ตอน drain
(ไม่ใช่ตอน emit) ⇒ ปลายทางย่อมได้ครบ 4 · deliveries = 4 (issued) + 2 (contact.created) = 6
E5.2/E5.6 นับเฉพาะ E3 ลืม 2 ใบของ E4 · สังเกตว่า E3.4 (`= 2`) ผ่าน และ E5.3 (contacts `= 2`) ผ่าน
ตัวเลขจึงสอดคล้องกันทั้งหมดยกเว้น 2 ข้อนี้

**พิสูจน์ว่าไม่ใช่การยิงซ้ำ** (probe ชั่วคราว เดินลำดับเดียวกับ E3+E4 เป๊ะ แล้วลบไฟล์ทิ้งแล้ว):

```
หลัง E3 (qt + conv): issued = 2
หลัง E4 (iv2 + iv3): issued = 4
  · account.document.issued#cmtodb5v2004l35kzvlwk0ur4  docNo=QT-2026-09-0001
  · account.document.issued#cmtodb65e006u35kzfp1o50f1  docNo=IV-2026-09-0001
  · account.document.issued#cmtodb6jb009835kzzwn32zo4  docNo=IV-2026-09-0002
  · account.document.issued#cmtodb6vw00bn35kz7vfmmf4o  docNo=IV-2026-09-0003
documentId ไม่ซ้ำกัน = 4 ⇒ 1 event ต่อ 1 เอกสาร (ไม่มียิงซ้ำ)
```

(และ E3.1 ที่เรียก `issueDocument` ซ้ำใบเดิม ยังได้ 1 event → กันซ้ำทำงานจริง)

**ข้อเสนอถึง Fable**: แก้ตัวเลขใน oracle เป็น `issuedHooks.length === 4` และ `deliveries === 6`
(หรือย้ายการสร้าง endpoint ขึ้นไปก่อน E3 ถ้าอยากได้เจตนาเดิม "endpoint เห็นเฉพาะที่สมัคร") —
ผมไม่แตะไฟล์ข้อสอบตามกติกาข้อ 4

## 7. หมายเหตุ/หนี้ที่ฝากไว้

- `expirePaymentRequestsAll` ใส่ `take: 500` ต่อรอบ (เดิม `updateMany` ไม่มีเพดาน) — cron รายชั่วโมง
  ค้างเกิน 500 ใบ/ชั่วโมงคือผิดปกติ แต่ถ้าจริงจะเก็บตกรอบถัดไป · ทำเพื่อไม่ให้ tx เดียวถือแถวเป็นหมื่น
- `submitForApproval` ถูกนับเป็น `document.issued` ตามตารางในใบสั่งงาน (PO ได้เลขที่จริงตอนนี้)
  ⇒ ปลายทางที่สมัคร issued จะเห็น PO สถานะ `AWAITING_APPROVAL` ด้วย — ตั้งใจ (payload มี `status`)
- event ที่เหลือของแผน (D4 "events ที่เหลือ") ยังไม่ทำ · เพิ่มตัวใหม่ = ต้องแตะ 3 ที่เสมอ:
  `events.ts` + `webhooks/labels.ts` + `outbox-consumers.ts`

## 8. JSON_SUMMARY (บรรทัดจริงจากการรัน)

```
qc-account-api-webhooks    JSON_SUMMARY {"total":22,"passed":20,"findings":["C4-E5.2","C4-E5.6"]}
qc-account-api-write-docs  JSON_SUMMARY {"total":52,"passed":52,"findings":[]}
qc-account-api-write-payments JSON_SUMMARY {"total":32,"passed":32,"findings":[]}
qc-account-api-write-master   JSON_SUMMARY {"total":44,"passed":44,"findings":[]}
qc-account-api-core        JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
qc-account-api-openapi     JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
qc-account-cpa             JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
qc-webhook                 JSON_SUMMARY {"total":15,"passed":15,"findings":[]}
qc-webhook-ui              JSON_SUMMARY {"total":11,"passed":11,"findings":[]}
typecheck (NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck)  → 0 error (ไม่มี output)
fitness                    JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
fitness (env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET)      JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. ~20:15 UTC)
- **C4-E5.2 / E5.6**: builder ถูก — oracle ของ Fable นับผิดเอง (ข้อสอบออกเอกสาร 4 ใบก่อนสร้าง endpoint และ `dispatchWebhooks` resolve endpoint ตอน drain ไม่ใช่ตอนเกิด event ⇒ issued 4 + contact.created 2 = 6 deliveries) → แก้ oracle เป็น 4/6 · **22/22**
- Fable ตรวจเพิ่ม: ไม่มีผู้เรียก `createContact`/`createProduct`/`updateContact`/`updateProduct` ที่อยู่ใน `$transaction` ชั้นนอก (import-actions/inbox/service/forms/crm) ⇒ tx ใหม่ที่ห่อไม่ซ้อนกัน · `expirePaymentRequestsAll` อ่านแถวก่อนปิดใน tx เดียว คีย์ = requestId กันซ้ำข้ามโปรเซส
- รันซ้ำเอง: webhooks 22/22 · write-docs 52 · write-payments 32 · write-master 44 · core 64 · openapi 26 · cpa 107 · qc-webhook 15 · qc-webhook-ui 11 · docs --check ตรง · typecheck 0 · fitness 20/20 (มี env/ไม่มี env)
