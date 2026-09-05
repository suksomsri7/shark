# WO D2 — WRITE บัญชี/งวด/สินทรัพย์ (15 op → รวม 160)

> oracle: `scripts/qc-account-api-write-gl.mts` (Fable · builder ไม่แตะ) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §D2
> สถานะ: **32/34 · CRITICAL 2 (D2-G3.6 / D2-G3.7)** — ทั้งคู่มาจาก **ข้อสอบขัดกับชุดสิทธิ์ของ A1** ไม่ใช่โค้ด D2 (ดู §6)

## 1. ไฟล์

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/lib/modules/account/api/ops/gl-write.ts` | **ใหม่** · 15 op ทั้งหมดของ D2 |
| `api/registry.ts` | `GL_WRITE_OPS` เข้าทะเบียน (ต่อจาก `GL_READ_OPS`) |
| `api/serialize-gl.ts` | **+`chartRowView(detail, meta)`** — แถวผังบัญชีแบบแบนหน้าตาเดียวกับ `chart.list` แต่ประกอบจาก `LedgerDetail` (ของที่ได้จาก "สร้าง/แก้" = ของที่ได้ตอนไป GET อ่านทีหลัง) |
| `api/respond.ts` | **+`ApiError.details`** (ส่งต่อไปที่ `MappedError.details`) — service ฝั่งผังบัญชีคืน `fields:{code,name,…}` มา ต้องออกทาง `error.details[{path,message}]` แบบเดียวกับ zod ไม่งั้นผู้เรียกไม่รู้ว่าช่องไหนผิด |
| `api/dispatch.ts` | catch สุดท้ายส่ง `details` ต่อ (1 บรรทัด) |
| `journal-v2.ts` | **+`journalNumbersOf(ctx, entryIds)`** — entryId → เลขที่ใบสำคัญเป็นชุดเดียว (ค่าเสื่อม 100 ตัวไม่ต้องยิง `journalEntryDetail` 100 รอบ) |
| `gl.ts` · `period-close.ts` | ขยายชนิด `userId` เป็น `string \| null` (ดู §4) — additive ผู้เรียกเดิมส่ง string ได้เหมือนเดิม |
| `docs/api/ACCOUNT-API.md` | regenerate (160 op) |

## 2. op → service

| op | REST | kind · scope | service |
|---|---|---|---|
| `journal.create` | POST `/journal` | write · journal.adjust | `createManualEntry` → ตอบด้วย `journalEntryDetail`+`journalDetail` (= shape ของ `journal.get`) |
| `journal.reverse` | POST `/journal/{id}/reverse` | danger · journal.adjust | `reverseJournalEntry` |
| `journal.flag` | POST `/journal/{id}/flag` | write · journal.adjust | `toggleNeedsReview` |
| `chart.create` | POST `/chart` | write · chart.manage | `createLedgerV2` → `chartRowResponse` |
| `chart.update` | PATCH `/chart/{id}` | write · chart.manage | `ledgerDetail` (ค่าเดิม) + merge + `updateLedgerV2` |
| `chart.set-active` | POST `/chart/{id}/active` | write · chart.manage | `setLedgerActive` |
| `mappings.set` | PUT `/mappings/{key}` | write · mapping.manage | `setMapping` → `listMappings`+`mappingView` |
| `doc-type-accounts.set` | PUT `/doc-type-accounts/{docType}` | write · mapping.manage | `setDocTypeAccount` → `listDocTypeAccounts`+`docTypeAccountView` |
| `periods.close` | POST `/periods/{key}/close` | write · period.close | `closePeriodWithChecklist(ctx,key,null)` → `checklistView` |
| `periods.reopen` | POST `/periods/{key}/reopen` | danger · period.reopen | `reopenPeriodV2(ctx,key,reason,null)` |
| `periods.vat-filed` | POST `/periods/{key}/vat-filed` | write · period.close | `markVatFiled({…,userId:null})` |
| `periods.vat-unfiled` | DELETE `/periods/{key}/vat-filed` | danger · period.reopen | `unmarkVatFiled` |
| `assets.register` | POST `/assets` | write · asset.register | `registerAsset` → `assetDetail`+`assetDetailView` |
| `assets.depreciation-run` | POST `/assets/depreciation/run` | write · asset.manage | `runDepreciation` + `journalNumbersOf` |
| `assets.dispose` | POST `/assets/{id}/dispose` | danger · asset.dispose (+`asset.writeoff` เมื่อ mode=WRITE_OFF) | `disposeAsset` + `journalNumbersOf` + `getAsset` (สถานะจริง) |

ไม่มี op ซ้ำกับ B4: grep ทะเบียนก่อนเขียนแล้ว (B4 มี `chart.list/get` · `mappings.list` · `doc-type-accounts.list` · `journal.list/get` · `periods.list/checklist` · `assets.list/get` · `assets.depreciation-preview`)

## 3. ตารางแปลง error (ข้อความจาก service → HTTP)

| จุด | ข้อความ/เหตุ | ผลลัพธ์ |
|---|---|---|
| `journal.create` | เดบิต ≠ เครดิต · < 2 บรรทัด · บรรทัดเดียวลงทั้ง 2 ฝั่ง · ยอดรวม 0 | **422 `validation`** + `details[{path:"lines"}]` (ด่านอยู่ที่ schema ⇒ ผู้เรียกรู้ว่าผิดที่ก้อนไหน · service ตรวจซ้ำอีกชั้น) |
| `journal.create` | `งวด … ปิดแล้ว — โพสต์บัญชีไม่ได้` (จาก `gl.assertPeriodOpen`) | **409 `period_locked`** (`mapError` จับคำ "ปิดแล้ว") |
| `journal.create` | บัญชีนอกร้าน/ถูกปิดใช้งาน · ผู้ติดต่อนอกร้าน | 422 `unprocessable` (ข้อความไทยเดิม) |
| `journal.reverse` | `… ถูกกลับรายการไปแล้ว` / `กลับรายการไม่ได้ (สถานะ…)` | **409 `state_conflict`** (โยนเอง — `mapError` จับคำเหล่านี้ไม่ได้) |
| `journal.reverse` / `.flag` | `ไม่พบใบสำคัญนี้` | 404 `not_found` |
| `chart.create` / `.update` | `fields.code` มีคำว่า "อยู่แล้ว" | **409 `duplicate`** + `details[{path:"code"}]` |
| `chart.create` / `.update` | `fields` อื่น (รูปแบบรหัส · ชื่อว่าง · บัญชีระบบเปลี่ยนรหัสไม่ได้ · WHT/VAT ผิด) | **422 `validation`** + `details[]` ทุกช่อง · `message_th` = ข้อความของช่องแรก |
| `chart.create` / `.update` | `groupPrefix` หลักแรกไม่ตรงกับรหัส | 422 `validation` + `details[{path:"groupPrefix"}]` (ดู §5.1) |
| `chart.set-active` | `ไม่พบบัญชีนี้` | 404 |
| `chart.set-active` | `บัญชีระบบ ปิดใช้งานไม่ได้ …` / `…มีรายการเคลื่อนไหวแล้ว` / ผูก mapping/ช่องทางเงิน | **409 `state_conflict`** (ทั้งหมดคือ "สถานะข้อมูลไม่ให้ทำ" ไม่ใช่คำขอผิดรูป) |
| `mappings.set` | key ไม่อยู่ใน `MAPPING_KEYS` | 422 `validation` + `details[{path:"key"}]` |
| `mappings.set` | `ไม่พบบัญชีปลายทาง` | 404 |
| `doc-type-accounts.set` | docType ไม่อยู่ใน `NUMBERED_DOC_TYPES` | 422 `validation` + `details[{path:"docType"}]` |
| `doc-type-accounts.set` | บัญชีปลายทางถูกปิดใช้งาน | 422 (ข้อความไทยเดิม) |
| `periods.*` | `key` ไม่ใช่ `YYYY-MM` | 422 `validation` (path param ไม่ผ่าน zod ⇒ ตรวจมือ) |
| `periods.close` | `ปิดงวดไม่ได้ — <ข้อเช็กลิสต์>: <รายละเอียด>` | **409 `period_locked`** (`mapError` จับคำ "ปิดงวด") |
| `periods.reopen` | `ไม่พบงวด …` | 404 · ล็อกก่อนวันที่ → 409 `period_locked` |
| `periods.vat-filed` | `งวด … ทำเครื่องหมายยื่นไปแล้ว` | **409 `duplicate`** |
| `periods.vat-unfiled` | `งวดนี้ยังไม่ได้ทำเครื่องหมายยื่น` | **404 `not_found`** (เหมือน `wht.unmark-filed` ของ D1) |
| `assets.register` | ซาก < 100 สตางค์ · ซาก ≥ ต้นทุน · ต้นทุน ≤ 0 · อายุ < 1 เดือน | 422 `validation` + `details[]` (ด่านที่ schema · service ตรวจซ้ำ) |
| `assets.register` | `เอกสารนี้ขึ้นทะเบียนสินทรัพย์ไปแล้ว` | **409 `duplicate`** |
| `assets.register` | `บัญชีที่เลือกไม่อยู่ในผังบัญชีของระบบนี้` · `ไม่พบเอกสารซื้อสินทรัพย์ต้นทาง` | 422 / 404 |
| `assets.dispose` | `mode: WRITE_OFF` แต่คีย์ไม่มี `account.asset.writeoff` | **403 `scope_missing`** + hint (ตรวจใน handler ด้วย `actorCan`) |
| `assets.dispose` | `ไม่พบสินทรัพย์` | 404 |
| `assets.dispose` | `สินทรัพย์นี้จำหน่าย/ตัดบัญชีไปแล้ว` | **409 `state_conflict`** |
| ทุก danger | ไม่มี `confirm:true` / `reason` < 5 ตัว | 409 `confirm_required` / 422 `validation` (ของ `dispatch.ts` เดิม) |
| สิทธิ์ไม่พอ | — | 403 `scope_missing` (ของ `require.ts` · ตรวจก่อน confirm/schema) |

## 4. `userId` ที่ service ขอ

คีย์ API **ไม่ใช่ผู้ใช้** ⇒ ส่ง `null` ทุกจุด (เหมือน D1) · ผู้ลงมือจริงอยู่ที่ `AuditLog`
(`actorType: API_KEY` · `actorId: keyId` · `after.keyName/requestId` · danger เพิ่ม `after.reason`)

| service | ช่อง | คอลัมน์ | ค่าที่ส่ง |
|---|---|---|---|
| `closePeriodWithChecklist` → `gl.closePeriod` | `userId` | `AccountPeriod.closedById` **nullable · ไม่มี FK** | `null` |
| `reopenPeriodV2` → `gl.reopenPeriod` | `userId` | `AccountPeriod.reopenLog[].by` (JSON) | `null` |
| `markVatFiled` | `userId` | `AccountVatFiling.filedById` **nullable · ไม่มี FK** | `null` |

ชนิดเดิมเป็น `userId: string` (บังคับ) ⇒ **ขยายเป็น `string \| null`** ที่ `gl.closePeriod` · `gl.reopenPeriod` ·
`closePeriodWithChecklist` · `reopenPeriodV2` · `markVatFiled` — additive ล้วน (ผู้เรียกเดิม 8 จุดในหน้าจอ/cron/ข้อสอบ
ส่ง string เหมือนเดิมได้) และคอลัมน์ปลายทาง nullable อยู่แล้วทั้ง 3 จุด · `listPeriods` แสดง "—" เมื่อไม่มีผู้ปิด

## 5. การตัดสินใจที่ต่างจาก service เดิม (ต้องรู้)

1. **`groupPrefix` ใช้แค่ตรวจ "หมวดบัญชี" แล้วคิดหมวดย่อยจากรหัสเอง** (`groupPrefixFor()`)
   `validateLedgerInput` บังคับให้รหัสอยู่ในช่วงของ prefix พอดี (`codeRangeOf("610") = 6100–6109`) เพราะ
   ฟอร์มบนหน้าจอเลือกหมวดย่อยจาก dropdown ก่อนแล้วค่อยเสนอ "รหัสว่างถัดไป" ในช่วงนั้น · ผู้เรียก REST
   ไม่มี dropdown นั้น และ **หมวดย่อยที่เก็บจริงถูกคิดจากรหัสอยู่แล้ว** (`ledgerDetail.group3 = prefixOf(code,3)` ·
   ต้นไม้ผังบัญชีก็จัดกลุ่มด้วยรหัส) ⇒ ความหมายเดียวที่เหลือของ `groupPrefix` คือหลักแรก = หมวดบัญชี
   (ตัวกำหนดชนิดบัญชี) ⇒ REST ตรวจว่าหลักแรกไม่ขัดกับรหัส (6199 คู่กับ 110 = ผู้เรียกสับสน → 422)
   แล้วส่ง `code.slice(0,3)` ลงไป · **ผลที่เก็บใน DB เท่ากันเป๊ะกับที่หน้าจอทำ**
   (ถ้าไม่ทำแบบนี้ `POST /chart {code:"6199", groupPrefix:"610"}` = 422 ทั้งที่รหัสถูกต้องทุกอย่าง — ข้อสอบ D2-G2.1 ยิงแบบนี้)
2. **ด่านสมดุล/ด่านมูลค่าซากอยู่ที่ schema ด้วย** ไม่ใช่แค่ที่ service — เพื่อให้ผู้เรียกได้ `details[{path}]`
   ชี้ก้อนที่ผิด (service คืนข้อความรวมอย่างเดียว) · service ยังตรวจซ้ำเหมือนเดิม ไม่ได้ถอดด่านออก
3. **`account.asset.writeoff` ตรวจใน handler** — op เดียวทำได้ 2 อย่างที่ความเสี่ยงต่างกันมาก (ขาย = มีเงินเข้า
   มีหลักฐาน · ตัดบัญชีทิ้ง = ของหายไปเฉย ๆ) ด่านคงที่ต่อ op ตัวเดียวแยกไม่ได้ ⇒ `actorCan(actor,"account.asset.writeoff")`
   ในตัว handler แล้วโยน `ApiError 403 scope_missing` + hint รูปแบบเดียวกับ `require.ts`
4. **`chart.update` = PATCH จริง** — `undefined` = ไม่แตะ · `null` = ล้างค่า · ค่าเดิมอ่านจาก `ledgerDetail`
   แล้ว merge ก่อนส่งเข้า `updateLedgerV2` (service ตัวนั้นรับ input เต็มใบเสมอ ถ้าส่งครึ่งใบ = ล้างของเดิมทิ้ง)
5. **คำตอบของ `assets.dispose.status` อ่านจาก DB จริง** (`getAsset`) ไม่ใช่เดาจาก `mode`

## 6. 🔴 ข้อสอบขัดกับชุดสิทธิ์ของ A1 — D2-G3.6 / D2-G3.7 (ไม่ได้แก้ ทั้ง oracle และ scopes)

**D2-G3.6** คาดว่า "คีย์ชุด `accountant` ไม่มี `account.asset.dispose` ⇒ 403" · วัดจริงแล้ว **มี**:

```
$ pnpm exec tsx -e 'import {expandBundles,API_SCOPE_BUNDLES} from "./src/lib/api-keys/scopes.ts"; …'
accountant.includes(account.asset.dispose) = true
danger = account.doc.void account.doc.approve account.payment.void account.period.reopen
         account.wht.unmark account.contact.merge account.cheque.void account.asset.writeoff
```

`src/lib/api-keys/scopes.ts:55-71` (`ACCOUNTANT_SCOPES`) มี `"account.asset.dispose"` อยู่ ตรงกับสเปค A1 ใน
`ACCOUNT-API-RUN.md` เป๊ะ ("accountant … asset.manage · asset.register · **asset.dispose** …" · danger = "… asset.writeoff")
⇒ คีย์ `A` ของข้อสอบ **มีสิทธิ์จำหน่ายจริง** → ได้ 200 (สินทรัพย์ถูกจำหน่ายไปจริงในนั้น)
**D2-G3.7 แดงตาม** เพราะพอ G3.6 จำหน่ายสำเร็จ ใบเดิมก็ถูกจำหน่ายไปแล้ว → G3.7 ได้ 409 `state_conflict` ตามที่ควรเป็น
(ตรรกะ 409 ของ D2 ทำงานถูก — ข้อสอบ D2-G3.8 ที่ตรวจ "จำหน่ายซ้ำ → 409" ผ่าน)

ทางเลือกให้ Fable ตัดสิน (builder ไม่แตะทั้งคู่ตามกติกาข้อ 4):
* **(ก)** แก้ข้อสอบ: ใช้คีย์ที่ไม่มี `account.asset.dispose` (เช่น bundle `issue-and-collect`) ในการตรวจ 403 ของ G3.6 — โค้ด D2 ไม่ต้องแก้
* **(ข)** ถ้าเจ้าของ/Fable เห็นว่า "จำหน่ายสินทรัพย์" ควรเป็นสิทธิ์ danger จริง ๆ → ย้าย `account.asset.dispose`
  จาก `ACCOUNTANT_SCOPES` ไปชุด `danger` (แก้สเปค A1 ด้วย) · โค้ด D2 ไม่ต้องแก้เช่นกัน แต่กระทบคีย์ที่ออกไปแล้ว

## 7. คำสั่ง + บรรทัดสุดท้าย

env ทุกคำสั่ง (บรรทัดเดียวกัน):
`export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development QC_ENV_FILE=.env.qc; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1`

| คำสั่ง | บรรทัดสุดท้าย |
|---|---|
| `pnpm exec tsx scripts/qc-account-api-write-gl.mts` | `ผ่าน 32/34` · `FINDINGS: CRITICAL 2 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":34,"passed":32,"findings":["D2-G3.6","D2-G3.7"]}` |
| `… qc-account-api-read-gl.mts` | `JSON_SUMMARY {"total":55,"passed":55,"findings":[]}` |
| `… qc-account-api-write-finance.mts` | `JSON_SUMMARY {"total":33,"passed":33,"findings":[]}` |
| `… qc-account-api-write-docs.mts` | `JSON_SUMMARY {"total":52,"passed":52,"findings":[]}` |
| `… qc-account-api-core.mts` | `JSON_SUMMARY {"total":64,"passed":64,"findings":[]}` |
| `… qc-account-api-openapi.mts` | `JSON_SUMMARY {"total":26,"passed":26,"findings":[]}` |
| `… qc-account-cpa.mts` | `JSON_SUMMARY {"total":107,"passed":107,"findings":[]}` |
| `… qc-acc-v2-journal.mts` | `✅ ผ่าน 94 ข้อ · พบปัญหา 0 ข้อ` |
| `… qc-acc-v2-period-assets.mts` | `✅ ผ่าน 121 ข้อ · พบปัญหา 0 ข้อ` |
| `… qc-acc-v2-coa.mts` | `✅ ผ่าน 105 ข้อ · พบปัญหา 0 ข้อ` |
| `… qc-acc-v2-policy.mts` | `✅ ผ่าน 150 ข้อ · พบปัญหา 0 ข้อ` |
| `pnpm exec tsx scripts/gen-account-api-docs.mts` แล้ว `--check` | `✅ เขียน docs/api/ACCOUNT-API.md (160 op · 137205 ไบต์)` → `✅ docs/api/ACCOUNT-API.md ตรงกับทะเบียน (160 op)` |
| `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` | (ไม่มี output = 0 error) |
| `pnpm fitness` | `ผ่าน 20/20` · `JSON_SUMMARY {"total":20,"passed":20,"findings":[]}` |
| `env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness` | `ผ่าน 20/20` · `JSON_SUMMARY {"total":20,"passed":20,"findings":[]}` |

ไม่ commit · ไม่แตะ `.env` · ไม่แก้ oracle · ไม่เพิ่ม `any` · ไม่มี prisma import ใหม่ในโมดูล (F5 เขียว)


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. ~22:20 UTC)
- **G3.6/G3.7**: builder ถูก — สเปค A1 ให้ `account.asset.dispose` อยู่ชุด accountant (ขาย = มีเงินเข้า) ส่วน `asset.writeoff` อยู่ชุด danger ⇒ แก้ oracle ให้ G3.6 ใช้คีย์ issue-and-collect (ไม่มี asset.*) และ **เพิ่ม G3.6b**: WRITE_OFF ด้วยคีย์ accountant → 403 + สินทรัพย์ยัง ACTIVE (ยืนยันด่านใน handler ข้อ 3 ของ §5) · 35/35
- รับข้อ 1–5 ของ §5 (groupPrefix คิดจากรหัส · details[] · writeoff ใน handler · PATCH merge · status อ่านจาก DB)
- probe ของ Fable (ลบแล้ว): ร้านอื่น reverse/flag JV · แก้/ปิดผังบัญชี · ตั้ง mapping ชี้บัญชีเรา · จำหน่ายสินทรัพย์เรา → 404 ทุกจุด DB ไม่ขยับ · ปิดงวด 2026-08 → ลง JV ในงวด → 409 period_locked · reopen ไม่มี confirm → 409 confirm_required · JV ไม่สมดุล → 422 details path=lines
- รันซ้ำเอง: write-gl 35 · read-gl 55 · write-finance 33 · core 64 · openapi 26 · cpa 107 · docs --check 160 op · typecheck 0 · fitness 20/20 ×2
