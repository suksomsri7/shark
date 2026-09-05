# WO C1 — WRITE เอกสาร ผ่าน REST `/api/v1/account/*`

ผู้ทำ: Opus (builder) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §C1 · oracle: `scripts/qc-account-api-write-docs.mts` (Fable เขียน — **ไม่ได้แตะ**)

**สถานะ: 50/52 · CRITICAL 2 (`C1-W7.1`, `C1-W8.3`) — ทั้งคู่พิสูจน์แล้วว่าเป็นข้อสอบ ไม่ใช่โค้ด (positive control วัดผ่าน route จริงอยู่ท้ายไฟล์) จึงไม่แก้ oracle ตามกติกา**
ด่านอื่นเขียวหมด: read-docs 50 · read-master 38 · read-finance 38 · read-gl 55 · core 64 · openapi 26 · cpa 107 · editor 200 · payments 162 · groups 174 · recurring 163 · attachments 66 · drift 0 · typecheck 0 · fitness 20/20 (ทั้งมี env และไม่มี env)

## ไฟล์

### ใหม่
- `src/lib/modules/account/api/ops/documents-write.ts` — 23 op ของ C1 ทั้งหมด (ไม่มี raw prisma · ทุกก้อนผ่าน `../serialize.ts`)
- `prisma/migrations/20260918000000_account_doc_source_api/migration.sql`

### แก้ (additive ทั้งหมด — ผู้เรียกเดิมไม่มีใครเปลี่ยนพฤติกรรม)
- `prisma/schema/account.prisma` — `enum AccountDocSource` เพิ่มค่า `API`
- `api/registry.ts` — ต่อ `DOCUMENTS_WRITE_OPS` เข้า `ACCOUNT_OPS` (รวม **95 op**)
- `api/respond.ts` — `ApiError` รับ `hint?` (พารามิเตอร์ที่ 5) · `MappedError` มี `hint?` · `mapError` ส่งต่อ
- `api/dispatch.ts` + `api/idempotency.ts` — ส่ง `hint` ของ `ApiError` ลงซอง `failBody` (ก่อนหน้านี้ hint หายที่ทางออกทั้งสองทาง ⇒ 409 `duplicate` บอก id เดิมไม่ได้)
- `service.ts` — **ใหม่ `setDocumentTags(tenantId, systemId, id, tags)`** (แตะคอลัมน์ `tags` คอลัมน์เดียว · ห้ามแก้เอกสาร CANCELLED/VOIDED) · `createGroupDocument` รับ `source?`/`tags?`
- `group.ts` — `CreateGroupInput` รับ `source?`/`tags?` แล้วส่งต่อ `createGroupDocument`
- `expense.ts` — `createPurchaseOrder` รับ `dueDate?`/`source?`/`tags?`/`refType?`/`refId?` (ส่งต่อ `createExpenseDoc` ผ่าน spread เดิม)
- `attachment-shared.ts` — `AttachmentSource` เพิ่มค่า `"API"` (คอลัมน์เป็น `String?` ในฐาน ⇒ ไม่มี migration · หน้าจอ inbox กรองด้วย allowlist ของตัวเองอยู่แล้ว ไม่กระทบ)
- `docs/api/ACCOUNT-API.md` — regenerate (`pnpm exec tsx scripts/gen-account-api-docs.mts` · 95 op)

## Migration (verbatim)

`prisma/migrations/20260918000000_account_doc_source_api/migration.sql`
```sql
-- AlterEnum
ALTER TYPE "AccountDocSource" ADD VALUE 'API';
```
สร้างด้วย `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` (DIRECT_URL ชี้ QC) · apply ด้วย `prisma migrate deploy` บน QC แล้ว · `pnpm db:generate` แล้ว · `pnpm drift` = "No difference detected."

## Op ↔ Service ↔ ผลลัพธ์

| op id | REST | kind · scope | service | คำตอบ |
|---|---|---|---|---|
| `documents.create` | `POST /documents` | write · doc.create | `createGroupDoc` (BN/CP) · `createPurchaseOrder` (PO/APO) · `createExpenseDoc` (ฝั่งจ่าย) · `createDocument` (ฝั่งขาย) | `DocRow` + `note` |
| `documents.update` | `PATCH /documents/{id}` | write · doc.create | `updateExpenseDoc`/`updateDocument` (+ `setDocumentTags` เมื่อส่ง `tags`) | `DocRow` + `note` |
| `documents.delete` | `DELETE /documents/{id}` | write · doc.create | `cancelDraft` | `{id,status,type}` |
| `documents.issue` | `POST /documents/{id}/issue` | write · doc.issue | `submitForApproval` (PO/APO) · `issueExpenseDoc` · `issueDocument` | `{id,docNo,status,type}` |
| `documents.convert` | `POST /documents/{id}/convert` | write · doc.create | `convertPurchaseOrder` (PO/APO ไม่ต้องส่ง `toType`) · `convertDocument` | `DocRow` + `sourceDocument{id,docNo,type}` |
| `documents.respond` | `POST …/respond` | write · doc.create | `setQuotationResponse` | `{id,docNo,status,type}` |
| `documents.approve` | `POST …/approve` | write · doc.approve | `approvePurchaseOrder(…, approvedById = actor.keyId)` — **ไม่ส่ง `maxSatang`** | `{id,docNo,status,type}` |
| `documents.reject` | `POST …/reject` | write · doc.approve | `rejectPurchaseOrder` | `{id,docNo,status,type}` |
| `documents.void` | `POST …/void` | **danger** · doc.void | `voidExpenseDoc`/`voidDocument` | `{id,docNo,status,type}` |
| `documents.receive` | `POST …/receive` | write · payment.record | `receivePurchaseTaxInvoice` (PTX) · `markAssetReceived` (AP) · ชนิดอื่น → 409 | `{id,docNo,status,type}` |
| `documents.deposits` | `GET …/deposits` | read · doc.view | `listDeductiblePaidDeposits`/`listDeductibleDeposits` (ส่ง `excludeDocId` = ใบนี้) | `[{id,docNo,issueDate,availableSatang,appliedSatang}]` |
| `documents.set-deposits` | `PUT …/deposits` | write · doc.create | `setExpenseDocDeposits`/`setDocDeposits` | `{depositDeductedSatang,grandTotalSatang}` |
| `documents.public-link` | `POST …/public-link` | write · doc.public_link | `ensurePublicTaxInvoiceLink` | `{url}` (ไม่คืน token แยก) |
| `documents.set-tags` | `PUT …/tags` | write · doc.create | `setDocumentTags` (ใหม่) | `{id,tags}` |
| `documents.add-attachment` | `POST …/attachments` | write · doc.create | `createAttachment` (`source: "API"`, `uploadedById: null`) | `{id,fileName,url,duplicate?}` |
| `documents.delete-attachment` | `DELETE …/attachments/{attId}` | write · doc.create | `listDocumentAttachmentFiles` (พิสูจน์ว่าไฟล์อยู่ใบนี้) → `unlinkAttachment` + `archiveAttachment` | `{id}` |
| `documents.remind` | `POST …/remind` | write · doc.view | `sendPaymentReminder(…, { actorId: null, origin })` | `{email,link}` |
| `favorites.save` | `POST /favorites` | write · doc.create | `saveDocFavorite` | `{ok,name}` |
| `recurring.create` | `POST /recurring` | write · doc.create | `validateRuleInput` → `createRecurringRule(…, createdByUserId: null)` | rule view (`id,name,active,nextRunAt`, …) |
| `recurring.update` | `PATCH /recurring/{id}` | write · doc.create | `getRecurringRule` → merge → `updateRecurringRule` | rule view |
| `recurring.set-active` | `POST /recurring/{id}/active` | write · doc.create | `setRecurringRuleActive` | `{id,active}` |
| `recurring.delete` | `DELETE /recurring/{id}` | write · doc.create | `deleteRecurringRule` | `{id}` |
| `recurring.run` | `POST /recurring/{id}/run` | write · doc.create | `runRecurringRules(new Date(), { tenantId, systemId, ruleId })` | `{processed,created,issued,skipped,finished,errors[]}` |

`test` id ของ op ทั้ง 23 ตัวชี้ไปที่ข้อสอบจริงในไฟล์ oracle (F13.2/OA-5.2 เขียว) · 3 ตัวที่ oracle ไม่ได้ยิงเส้นทางจริง (`documents.receive` · `documents.deposits` · `documents.set-deposits`) ใช้ `C1-W10.1` ซึ่งเป็นข้อที่ตรวจ kind/scope ของมันจริง ๆ

## การตัดสินใจเรื่อง error mapping (ทำไมบางที่ throw เอง ไม่ปล่อยให้ `mapError` เดา)

`mapError` แปลข้อความไทยเป็นรหัสด้วย "คำสำคัญ" — ข้อความของ service 3 ชุดนี้ **ไม่มีคำที่มันจับได้** จึงจะกลายเป็น 422 ทั้งที่ความจริงคือ 409:

| service | ข้อความจริง | ถ้าปล่อย | ทำแทน |
|---|---|---|---|
| `updateDocument`/`updateExpenseDoc` | "เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่" | 422 | อ่าน `getDocRef` ก่อน · ไม่ใช่ DRAFT → `ApiError(409,"state_conflict")` |
| `issueDocument`/`issueExpenseDoc` | "เอกสารนี้ออกแล้ว" | 422 | เหมือนกัน (บอกเลขที่ใบเดิมใน message ด้วย) |
| `voidDocument`/`voidExpenseDoc` | "เอกสารถูกยกเลิกแล้ว" | 422 | สถานะ VOIDED/CANCELLED → `ApiError(409,"state_conflict")` |

**ไม่แก้ข้อความใน service** ตามคำสั่ง WO — ข้อความพวกนี้มีคนอ่านบนหน้าจออยู่ และการเติมคำลง keyword list ของ `mapError` จะทำให้ข้อความอื่นที่บังเอิญมีคำเดียวกันเปลี่ยนรหัสตามไปด้วย

เส้นทางที่ **ปล่อยให้ `mapError` ทำงาน** (ข้อความไทยเดิมส่งต่อได้ตรง ๆ):
- ล็อกงวด: `assertNotLockedWith` → `lockedMessage` มีคำว่า "ล็อก" → **409 `period_locked`** (วัดจริงแล้ว — ดู positive control ① ท้ายไฟล์) ⇒ ไม่ต้องเติม keyword ใด ๆ
- แปลงเป็นชนิดที่ไม่อนุญาต: "แปลงเป็นเอกสารชนิดนี้ไม่ได้" → 422 `unprocessable` + ข้อความไทย (ตรงสัญญา "422/409 ไทย")
- เตือนชำระเมื่อผู้ติดต่อไม่มีอีเมล: "ผู้ติดต่อยังไม่มีอีเมล — …" → 422 `unprocessable` ไทย
- ผู้ติดต่อ/เอกสาร/ไฟล์/กฎ ของร้านอื่น = **404** เสมอ (ไม่ใช่ 403 — 403 จะยืนยันให้คนนอกรู้ว่า id นั้นมีอยู่จริง)

รหัสอื่นที่เพิ่มเข้ามาโดยตั้งใจ:
- `refType`+`refId` ซ้ำ → `ApiError(409,"duplicate", …, hint = id เดิม)` — ต้องแก้ `respond/dispatch/idempotency` ให้ `hint` ไหลออกซองได้ (ของเดิมมี `hint` เฉพาะทาง `fail()` ตรง ๆ เท่านั้น)
- ชนิดเอกสารที่สร้างตรงไม่ได้ → 422 `validation` (สคีมา `z.enum(DIRECT_DOC_TYPES)` ปิดไว้ชั้นแรก + ด่านที่สองใน handler)

## หมายเหตุการออกแบบ

- **`source: "API"` + `createdById: null` ทุกใบ** — รวมเอกสารกลุ่ม (ต้องเติม `source`/`tags` ให้ `createGroupDocument` ซึ่งเดิมไม่มีช่องให้ส่ง) · เอกสารที่เกิดจาก `convertDocument`/`convertPurchaseOrder` ยังเป็น `MANUAL` ตามพฤติกรรมเดิมของ service (ไม่มีช่องส่ง `source` และการแก้ต้องแตะเส้นทางที่หน้าจอใช้ร่วม — จดไว้เป็นหนี้ ถ้า Fable ต้องการให้แปลงผ่าน API ติดธง `API` ด้วยจะทำใน C2)
- **`DIRECT_DOC_TYPES` 16 ชนิดตามตาราง §C1** — ต่างจาก `canCreateDirect()` ของฟอร์มตรงที่ **API สร้าง `PURCHASE_TAX_INVOICE` ตรงได้** (ตารางสัญญากำหนดไว้ · ทะเบียนใบกำกับซื้อของผู้เชื่อมต่อไม่ได้ไหลมาจากบันทึกซื้อเสมอไป) ส่วน `RECEIPT`/`TAX_INVOICE` ยัง "แปลงเท่านั้น" เหมือนหน้าจอ
- **`documents.update` ไม่รับ `type`/`childIds`/`refType`/`refId`** — 3 ตัวหลังคือ "ตัวตนของเอกสาร" ถ้าแก้ได้ กุญแจกันซ้ำจะย้ายเจ้าของได้
- **แท็กใน `documents.update`** เขียนผ่าน `setDocumentTags` (ไม่ใช่ `applyEditorExtras` ซึ่งจะล้างอีก 7 ฟิลด์ของฟอร์ม V2 ที่ผู้เรียก REST ไม่รู้จัก)
- **`appOrigin()` import `@/lib/env` แบบ dynamic** — `@/lib/env` `parse(process.env)` ตอนโหลดโมดูล ⇒ import ที่หัวไฟล์ = `pnpm fitness` แบบไม่มี env แดงทันที (บทเรียน B2 `contact-profile`) · fallback `https://shark.in.th`
- **`documents.remind` เป็น `kind: "write"` แต่ scope `account.doc.view`** ตามตาราง — มันส่งอีเมลจริง ⇒ ต้องกันซ้ำ + ลง audit เหมือนงานเขียน

## คำสั่งที่รัน + บรรทัดสุดท้าย

env ของทุกคำสั่งที่แตะ DB (ชี้ Neon branch QC `ep-plain-art` เสมอ · ไม่แตะ `.env`):
```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
```

| ด่าน | คำสั่ง | บรรทัดสุดท้าย |
|---|---|---|
| C1 (oracle) | `pnpm exec tsx scripts/qc-account-api-write-docs.mts` | `ผ่าน 50/52` · `FINDINGS: CRITICAL 2 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":52,"passed":50,"findings":["C1-W7.1","C1-W8.3"]}` |
| B1 | `pnpm exec tsx scripts/qc-account-api-read-docs.mts` | `ผ่าน 50/50` · CRITICAL 0 |
| B2 | `… qc-account-api-read-master.mts` | `ผ่าน 38/38` · CRITICAL 0 |
| B3 | `… qc-account-api-read-finance.mts` | `ผ่าน 38/38` · CRITICAL 0 |
| B4 | `… qc-account-api-read-gl.mts` | `ผ่าน 55/55` · CRITICAL 0 |
| A3 | `… qc-account-api-core.mts` | `ผ่าน 64/64` · CRITICAL 0 |
| A4 | `… qc-account-api-openapi.mts` | `ผ่าน 26/26` · CRITICAL 0 |
| WO ที่ยังไม่สร้าง | ทุกชุดที่เหลือของ `qc-account-api-*` | ยัง `⚠️ SKIPPED` ครบ (write-payments/master/finance/gl/ops/settings · webhooks · ai-skill · ai-external · docs) |
| CPA | `… qc-account-cpa.mts` | `ผ่าน 107/107 ข้อตรวจ` · CRITICAL 0 |
| 1.3 | `… qc-acc-v2-editor.mts` | `===== สรุป: ผ่าน 200 · ไม่ผ่าน 0 =====` |
| 1.4 | `… qc-acc-v2-payments.mts` | `===== สรุป WO 1.4: ผ่าน 162 · ไม่ผ่าน 0 =====` |
| 1.7 | `… qc-acc-v2-groups.mts` | `===== สรุป WO 1.7: ผ่าน 174 · ไม่ผ่าน 0 =====` |
| 1.9 | `… qc-acc-v2-recurring.mts` | `===== สรุป WO 1.9: ผ่าน 163 · ไม่ผ่าน 0 =====` |
| 7.1 | `… qc-acc-v2-attachments.mts` | `ผ่าน 66 · ตก 0 (รวม 66 ข้อ)` |
| drift | `pnpm drift` | `No difference detected.` |
| typecheck | `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` | (ไม่มี output = 0 error) |
| fitness | `pnpm fitness` | `ผ่าน 20/20` · CRITICAL 0 |
| fitness (ไม่มี env) | `env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness` | `ผ่าน 20/20` · CRITICAL 0 |

## 2 ข้อที่ตก — หลักฐานว่าเป็นข้อสอบ ไม่ใช่โค้ด

รันด้วยสคริปต์ probe ชั่วคราว (ยิงผ่าน `route.POST` ตัวเดียวกับ oracle · tenant ของตัวเอง · ลบทิ้งแล้วทั้ง tenant และไฟล์สคริปต์)

### ① `C1-W7.1` — ล็อกงวด: oracle ส่ง `lockBeforeDate` เป็น **สตริง** ⇒ นโยบายไม่เคยถูกบันทึก

`PolicyPatch.lockBeforeDate` ประกาศเป็น `Date | null` แต่ oracle ส่ง `ymd()` (สตริง `"2026-09-06"`) — ในไฟล์ oracle โมดูล policy ถูก cast เป็น `Record<string, (...a: any[]) => Promise<any>>` ⇒ TypeScript ไม่ทัก · Prisma ปฏิเสธค่าสตริง → `savePolicy` catch แล้วคืน `{ ok:false }` → **ไม่มีการล็อกเกิดขึ้นเลย** ⇒ การที่ API ตอบ 200 คือคำตอบที่ถูก
(สังเกต: `pol?.ok !== false` ที่อยู่ในเงื่อนไขของข้อนี้เองก็เป็นเท็จ ⇒ ข้อนี้แดงแม้โค้ดจะถูก 100%)

วัดจริง (route เดียวกัน · ต่างกันแค่ชนิดของ `lockBeforeDate`):
```
① savePolicy(Date) => {"ok":true}
① POST /documents ระหว่างล็อก => 409 period_locked ข้อมูลก่อนวันที่ 6 ก.ย. 2026 ถูกล็อกไว้ — ไปที่ ตั้งค่า › นโยบายบัญชี เพื่อปลดล็อก
① savePolicy(string ตามที่ oracle ส่ง) => {"ok":false,"reason":"บันทึกนโยบายบัญชีไม่สำเร็จ"}
```
⇒ เส้นทาง 409 `period_locked` + ข้อความไทยทำงานครบตามสัญญา · แก้ข้อสอบบรรทัดเดียว: `savePolicy(ctx, { lockBeforeDate: new Date(`${tomorrow}T00:00:00.000Z`) })`

### ② `C1-W8.3` — เอกสารประจำ: กฎที่ oracle สร้าง "ยังไม่ถึงรอบ" ในวันที่รัน

กฎของ oracle = MONTHLY · `dayOfMonth: 1` · `startDate: today` · `leadDays: 0` ⇒ `firstRunAt` = **1 ต.ค.** (วันที่ 1 ของเดือนนี้ผ่านไปแล้ว) · `runRecurringRules` มีด่าน `dueAt = nextRunAt − leadDays` ถ้า `> now` ให้ข้าม (นั่นคือความหมายของ "สร้างล่วงหน้า n วัน") ⇒ `created: 0` โดยตั้งใจ · ปุ่ม "สร้างตอนนี้" บนหน้าจอก็ได้ผลเดียวกันและขึ้นข้อความ "ยังไม่ถึงรอบของเอกสารประจำใด"
ข้อนี้จะเขียวเฉพาะวันที่รันตรงกับวันนัดของกฎ (= วันที่ 1 ของเดือน) ⇒ เป็นข้อสอบที่ผูกกับวันจริง (บทเรียน "ข้อสอบเน่าตามเวลา")

วัดจริง (endpoint เดียวกันทั้ง 3 กรณี):
```
② กฎแบบ oracle: nextRunAt = 2026-10-01T00:00:00.000Z leadDays = 0 now = 2026-09-05T11:16:56.007Z
② run => 200 {"processed":0,"created":0,"issued":0,"skipped":0,"finished":0,"errors":[]}
② กฎที่ถึงรอบวันนี้: nextRunAt = 2026-09-05T00:00:00.000Z
② run => 200 {"processed":1,"created":1,"issued":0,"skipped":0,"finished":0,"errors":[]} · เอกสาร source=RECURRING = 1
② กฎ leadDays 60 (แบบ oracle แต่สร้างล่วงหน้า) run => 200 {"processed":1,"created":1,"issued":0,"skipped":0,"finished":0,"errors":[]}
```
⇒ `POST /recurring/{id}/run` สร้างเอกสารได้จริงและซองผลลัพธ์ตรงสัญญา

ทางเลือกให้ Fable เคาะ (ผมไม่ตัดสินเอง เพราะมันเปลี่ยน "ความหมาย" ของ endpoint):
1. แก้ข้อสอบให้กฎถึงรอบวันที่รัน (`dayOfMonth` = วันของ `today` **หรือ** `leadDays: 60`) — เก็บสัญญาเดิมไว้ ผมเชียร์ทางนี้
2. เปลี่ยนความหมายของ `recurring.run` เมื่อระบุ `ruleId` เป็น "ออกงวดที่ค้างอยู่เดี๋ยวนี้ ไม่สนใจ leadDays" — จะทำให้ API กับปุ่มบนหน้าจอทำงานไม่เหมือนกัน และออกเอกสารลงวันที่ล่วงหน้าโดยที่เจ้าของร้านไม่ได้สั่ง

## หนี้/ข้อสังเกตที่ส่งต่อ

- เอกสารที่เกิดจาก **convert** ผ่าน API ยังได้ `source: MANUAL` (service ไม่มีช่องส่ง) — ถ้าต้องการธง `API` ครบทุกทาง ต้องเติมพารามิเตอร์ที่ `convertDocument`/`convertPurchaseOrder` (แตะเส้นทางที่หน้าจอใช้ร่วม → ควรทำพร้อม C2 ที่แตะไฟล์เดียวกันอยู่แล้ว)
- `documents.refund-deposit` (ตาราง C2) **ไม่ได้ทำ** ตามที่ WO สั่งข้าม
- `recurring.runs` (B1) 404 เมื่อกฎถูกลบอยู่แล้วตั้งแต่ต้น (มีด่าน `getRecurringRule` อยู่ก่อน) — ไม่ต้องแก้อะไร (`C1-W8.5` เขียว)
- `documents.add-attachment` ตั้ง `AttachmentSource = "API"` ⇒ ตัวกรอง "แหล่งที่มา" ของหน้ากล่องขาเข้ายังไม่มีตัวเลือกนี้ (allowlist 4 ค่าเดิม) — ไฟล์ยังแสดงในคลังตามปกติ แค่กรองด้วยปุ่ม "API" ไม่ได้ · ถ้าอยากได้ ให้เพิ่มใน `inbox/page.tsx` (งาน UI นอกขอบเขต C1)
