# WO B1 — READ เอกสาร/แดชบอร์ด/ภาพรวม (builder: Opus)

สถานะ: **ครบทุกข้อ · ด่านเขียวหมด** (รอบ 2 หลัง Fable ตัดสิน 3 ข้อค้าง — ดูท้ายไฟล์) · ไม่ commit (tree dirty ตามกติกา ข้อ 4)

| ด่าน | ผล |
|---|---|
| `qc-account-api-read-docs` | **50/50** · CRITICAL 0 · MAJOR 0 |
| `qc-account-api-core` | **64/64** · CRITICAL 0 |
| `qc-account-api-openapi` | **26/26** · CRITICAL 0 |
| `qc-acc-v2-list` | ✅ ผ่านทั้งหมด **159** เช็ก |
| `qc-acc-v2-dashboard` | ✅ ผ่าน **174** · ไม่ผ่าน 0 |
| `pnpm typecheck` | **0** |
| `pnpm fitness` | **20/20** (F13.1 15 op มีข้อสอบครบ · F13.2 คู่มือไม่ stale · F5.1 ไม่เพิ่ม) |

## ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/account/api/ops/documents-read.ts` | **ใหม่** | 11 op ของ B1 (`documents.list/get/attachments/parse` · `tags.list` · `favorites.list` · `recurring.list/runs` · `dashboard.get/series` · `overview.get`) — ทุกตัว `kind: "read"` · `action: "account.doc.view"` |
| `src/lib/modules/account/api/serialize.ts` | **ใหม่** | ตัวแปลงชัดเจนทุกก้อน (`docRow` · `docDetail` · `attachmentView` · `dashboardView` · `seriesView` · `overviewView`) — ห้าม spread แถว prisma · เงินลงท้าย `Satang` · วันที่ = วันไทย |
| `src/lib/modules/account/api/respond.ts` | แก้ | เพิ่ม `ENVELOPE` (symbol) · `paged(data, page, extra?)` · `unwrapEnvelope()` · `okBody()` · `ok()` รับ `extra` |
| `src/lib/modules/account/api/dispatch.ts` | แก้ | แกะซองจาก handler ทั้งเส้นทาง read และเส้นทาง write (ที่เก็บลง idempotency) — `{ data, page, ...extra, requestId }` |
| `src/lib/modules/account/api/op.ts` | แก้ | เพิ่มธง `paged?: boolean` บน `ApiOp` |
| `src/lib/modules/account/api/openapi.ts` | แก้ | (1) แก้ข้อ 8 ของ `info.description` จาก cursor → page/pageSize ของจริง (2) `PAGE_SCHEMA` + `page` ใน response 200 ของ op ที่ `paged: true` (+`additionalProperties: true` เผื่อ `tabCounts`) (3) **read ที่เป็น POST ก็ต้องมี `requestBody`** (ไม่งั้นคู่มือของ `documents.parse` บอกว่า "ไม่มีช่องให้ส่ง") |
| `src/lib/modules/account/api/registry.ts` | แก้ | `ACCOUNT_OPS = [...CORE_OPS, ...DOCUMENTS_READ_OPS]` (15 op) |
| `scripts/gen-account-api-docs.mts` | แก้ | บูลเล็ต **Pagination** เขียนใหม่ให้ตรงของจริง (page/pageSize · `page{page,pageSize,pageCount,total,hasMore}` · เกิน 100 = clamp ไม่ error · ฟิลด์เสริมเช่น `tabCounts`) |
| `docs/api/ACCOUNT-API.md` | generate | 15 op · 18,731 ไบต์ (`pnpm exec tsx scripts/gen-account-api-docs.mts`) |
| `src/lib/modules/account/service.ts` | แก้ (additive ล้วน) | `ListDocumentsInput` + `refType`/`refId` (+where ของ `listDocumentsPaged` — C1 ต้องใช้) · `DocPaymentRow` + `financeAccountId` · `listRecurringRuns` คืน `id` ของรอบ |
| `src/lib/modules/account/doc-detail.ts` | แก้ (additive) | `JvEntryView` + `book` (REST คืน `jv[].book`) |

> ไม่แตะพฤติกรรมของ service ตัวใดเลย — ที่เพิ่มคือ "ฟิลด์ที่ select อยู่แล้วแต่ไม่ได้ส่งออก" กับตัวกรองใหม่ที่ไม่ส่ง = พฤติกรรมเดิมเป๊ะ (ยืนยันด้วย `qc-acc-v2-list` 159 + `qc-acc-v2-dashboard` 174 ที่ยังเขียวทั้งคู่)

## ซองแบ่งหน้า (`paged`)

`handler` คืนค่าเดียว ⇒ ต้องมีวิธีบอก dispatch ว่า "ก้อนนี้คือซอง ไม่ใช่ data":

```ts
return paged(rows.map(docRow), { page, pageSize, pageCount, total, hasMore }, { tabCounts });
// dispatch → { data: [...], page: {...}, tabCounts: {...}, requestId }
```

- marker เป็น **symbol** ไม่ใช่คีย์สตริง — `JSON.stringify` ไม่เก็บ symbol ⇒ ต่อให้มีบั๊กปล่อยซองดิบออกไป ผู้เรียกก็ไม่เห็นคีย์ประหลาด และ handler ที่คืน object ธรรมดา (`{ ok: true }` ของ `/ping`) ไม่มีทางชนโดยบังเอิญ
- `okBody()` แยกออกมาเพราะ idempotency ต้องเก็บ body ลง DB ไว้ตอบซ้ำ ⇒ เส้นทาง write ก็แกะซองเป็น (generic ไว้ล่วงหน้าให้ C1/C2 · read ไม่เคยผ่านทางนั้น)
- `extra` ห้ามทับ `data`/`page`/`requestId` (กันไว้ใน `okBody`)

## ตารางเปลี่ยนชื่อฟิลด์ (สัญญาที่ผู้เรียกยึด)

**เอกสาร (`docRow` / `docDetail`)**

| ภายใน | ออก API |
|---|---|
| `docType` | `type` |
| `subTotal` · `discountAmount` · `vatAmount` · `whtAmount` · `depositDeducted` | `subTotalSatang` · `discountSatang` · `vatSatang` · `whtSatang` · `depositDeductedSatang` |
| `grandTotal` · `paidTotal` · `remain` | `grandTotalSatang` · `paidSatang` · `remainSatang` |
| `line.unitPrice` · `line.discount` · `line.amount` | `unitPriceSatang` · `discountSatang` · `amountSatang` |
| `payment.amount/whtAmount/feeAmount` · `financeAccountId`+`financeName` | `amountSatang`/`whtSatang`/`feeSatang` · `financeAccount { id, name }` |
| `jv[].docNo` | `jv[].journalNo` (กันสับสนกับเลขที่เอกสารการค้า) |
| `attachment.mimeType` · `fileUrl` | `mime` · `url` |
| `groupChildren[].grandTotal` · `outstanding` | `grandTotalSatang` · `remainSatang` |

ตัดทิ้ง: `auditLogs` (มี endpoint แยก) · `publicToken` · `paymentRequests` · `contactSnapshot` · ทุก `tenantId`/`systemId`
วันที่ `issueDate`/`dueDate`/`validUntil`/`jv[].date` = `YYYY-MM-DD` (วันไทย ผ่าน `dayKeyBkk` ตัวเดียวกับหน้าจอ) · `createdAt`/`updatedAt`/`paidAt`/`voidedAt`/`nextRunAt`/`lastRunAt` = ISO

**แดชบอร์ด (`dashboardView`)** — เปลี่ยนชื่อทุกช่องที่เป็นเงิน:

| ภายใน | ออก API |
|---|---|
| `kpi.receivable.amount` · `payable.amount` · `overdue.amount` | `…​.amountSatang` |
| `kpi.overdue` (เดิมมีแค่ยอดรวม 2 ฝั่ง) | `{ count, amountSatang, receivable{count,amountSatang}, payable{count,amountSatang} }` — ยอดรวมเท่าไทล์บนหน้าจอ **พร้อมตัวแยก** (ทวงหนี้ใช้ฝั่งรับ · ตั้งจ่ายใช้ฝั่งจ่าย · แยกเองจากยอดรวมไม่ได้) ตัวแยกมาจากก้อน `arap` ของ snapshot เดิม ⇒ **ไม่มี query เพิ่ม** |
| `kpi.cashTotal` | `kpi.cashTotalSatang` |
| `arap.{receivable,payable}.amount` · `.overdueAmount` | `.amountSatang` · `.overdueAmountSatang` (ช่อง `aging.*Satang` ชื่อเดิมอยู่แล้ว) |
| `income/expense.total` · `rows[].amount` | `totalSatang` · `rows[].amountSatang` |
| `cash.total` · `accounts[].balance` · `.monthDelta` | `totalSatang` · `balanceSatang` · `monthDeltaSatang` |
| `issued.docType` · `total.amount` · `rows[].amount` | `type` · `total.amountSatang` · `rows[].amountSatang` |
| `recent[].docType/docTypeLabel/grandTotal` | `type`/`typeLabel`/`grandTotalSatang` (+`dueDate`/`validUntil` แปลง ISO → วันไทย) |
| `topCustomers/topVendors[].amount` · `topProducts[].amount` | `amountSatang` |
| `topExpenseCategories.total` | `totalSatang` |

ตัดทิ้งจากแดชบอร์ด: **`glRows`** (บรรทัดบัญชีดิบหลายพันแถว — ไปอยู่ B4) · `queryCount` · `calendar` · `series` (มี `GET /dashboard/series` ของตัวเอง ไม่ส่งซ้ำให้ payload บวม) · `cash.accounts[].ledgerAccountId`/`holderUserId`/`promptpayId` (id ภายใน/เลขพร้อมเพย์ ไม่จำเป็นกับผู้เรียก)

**series** `periodKey→period` · `revenue/expense/profit → incomeSatang/expenseSatang/profitSatang` (ยอดรวม/ปีก่อน = `revenueSatang/expenseSatang/profitSatang`) · `yoyBp` เป็น basis point ไม่ใช่เงิน ⇒ ชื่อเดิม
**overview** `series.months[].periodKey→period` · `paid/awaiting/overdue → …Satang` · `total.grand→grandSatang` · `issued.rows[].docType→type` · `tracked[].outstanding→outstandingSatang` · ตัด `base`/`now`/`queryCount`

## จุดตัดสินใจที่ควรรู้

1. **`documents.parse` เป็น POST แต่ `kind: "read"`** — dispatch แยกทางที่ `op.kind` ไม่ใช่ method อยู่แล้ว ⇒ ไม่ต้องมี `Idempotency-Key` ไม่เขียน audit (ยืนยันด้วย B1-D5.1/5.2 ที่ยิงโดยไม่ส่งหัวนี้แล้วได้ 200)
2. **`pageSize` เกิน 100 ไม่ใช่ error** — ปล่อยให้ `clampPageSize` ของ service หนีบเอง (schema ไม่ตั้ง `.max()`) ⇒ `pageSize=1000` ได้ 100 · `page` ต่ำกว่า 1 = 422 (คนละเจตนา: ขอเยอะ = อยากได้ครบ · หน้า 0 = พิมพ์ผิด)
3. **`tab` ใช้ได้เมื่อ `type` ชนิดเดียว** และต้องเป็นคีย์ที่มีจริงใน `LIST_TABS[type]` ไม่งั้น 422 พร้อมรายชื่อแท็บที่ใช้ได้ (`tabToFilter` เดิม fallback เป็น "ทั้งหมด" เงียบ ๆ ซึ่งเหมาะกับหน้าจอ แต่ไม่เหมาะกับ API)
4. **`tabCounts` มาจาก `computeListTabCounts`** เมื่อระบุชนิดเดียว (ตัวเดียวกับหน้ารายการ) · หลายชนิด/ไม่ระบุ = `{}`
5. **op ที่ไม่มี query เลย ประกาศ `z.object({}).strict()`** (`documents.get` · `documents.attachments` · `recurring.runs`) — ข้อสอบ B1-D7.3 บังคับให้มี `input` และมันได้ผลพลอยได้: `?statuss=PAID` ที่พิมพ์ผิดเด้ง 422 แทนที่จะถูกเมินเงียบ ๆ
6. **`dashboard.get` คิด "ณ วันที่"** — `asOf=YYYY-MM-DD` (ผิดรูป = 422) ชนะทุกอย่าง → ไม่ส่งก็ใช้ `period` (สิ้นเดือนนั้น แต่ไม่ล้ำวันนี้) → ไม่มีทั้งคู่ = **วันนี้ตามเวลาไทย** · instant ที่ใช้จริง = **เที่ยงวันเวลาไทย** ของวันนั้น (แนวเดียวกับ `financeBalances`/เฉลย seed — เที่ยงวันอยู่กลางวัน ⇒ `dayKeyBkk` ไม่มีทางตกไปวันข้างเคียงไม่ว่านาฬิกาเครื่องจะโซนไหน) · `data.asOf` สะท้อนวันที่ที่ใช้จริงเสมอ · ⚠️ `asOf` อนาคตทำได้ แต่ "พ้นกำหนด" จะนับใบที่ยังไม่ถึงกำหนดในวันนี้ด้วย
7. **ข้ามร้าน = 404 ไม่ใช่ 403** (`getDocDetailData` กรอง tenant/system ให้อยู่แล้ว → null → `ERR.DOC_NOT_FOUND` → `mapError` 404) — 403 จะยืนยันให้คนนอกรู้ว่า id นี้มีตัวตน

## 3 ข้อที่เคยค้าง — คำตัดสินของ Fable + สิ่งที่ทำ (รอบ 2)

| # | เดิม (รอบ 1) | คำตัดสิน | สิ่งที่ทำ |
|---|---|---|---|
| 1 | `B1-D1.3` `kpi.overdue` (6 ใบ/20,590,000 = AR+AP) ไม่ตรงเฉลยที่เป็นฝั่งรับล้วน (4 ใบ/12,840,000) | **ช่องว่างของสัญญา ไม่ใช่บั๊กข้อสอบ** — ต้องคืนทั้งยอดรวมและตัวแยก | `serialize.ts` `kpi.overdue` = `{ count, amountSatang, receivable{…}, payable{…}` } · ตัวแยกดึงจาก `s.arap.{receivable,payable}.overdueCount/overdueAmount` ของ snapshot เดียวกัน (0 query เพิ่ม) |
| 2 | `B1-D1.4` `cashTotalSatang` @นาฬิกาจริง = 116,442,000 · เฉลยตรึงที่ `QC.today` = 132,973,000 | **ช่องว่างของสัญญา** — endpoint ต้องรับ "ณ วันที่" ได้ | `dashboard.get` เพิ่ม query `asOf?` (`^\d{4}-\d{2}-\d{2}$` · ผิดรูป = 422 · ค่าเริ่มต้น = วันนี้เวลาไทย) → ใช้เป็น `now` ของ `dashboardSnapshot` (เที่ยงวัน +07) ⇒ ยอดเงิน/ค้างรับ/ค้างจ่าย/พ้นกำหนด คิด ณ วันเดียวกันหมด · `data.asOf` สะท้อนวันที่ที่ใช้จริง |
| 3 | `OA-5.2` รายชื่อไฟล์ข้อสอบฮาร์ดโค้ด 3 ไฟล์ (ไม่มี `read-docs`) | **เห็นด้วย — Fable แก้ oracle เอง** (glob `scripts/qc-account-api-*.mts`) | ไม่ต้องแก้ฝั่งโค้ด · ด่านเขียว 26/26 |

หลักฐานที่ใช้ตัดสินรอบแรก (วัดบน DB QC จริง · เก็บไว้เผื่ออ้างอิงภายหลัง):

```
overdue @now      AR 4ใบ/12840000 · AP 2ใบ/7750000 · รวม 6ใบ/20590000
overdue @QC.today AR 4ใบ/12840000 · AP 2ใบ/7750000 · รวม 6ใบ/20590000   ← พ้นกำหนดไม่ขึ้นกับเวลาในชุดนี้
เฉลย finance.total 132973000 · @now 116442000 · @QC.today 132973000      ← ยอดเงิน "ณ วันที่" ขึ้นกับเวลาจริง
```
(เฉลย `E.overdueAmount/overdueDocs` มาจาก `svc.overviewStats()` = ฝั่งรับล้วน — `seed-acc-v2-qc.mts:2074` · `E.finance.total` ตรึงที่ `QC_ASOF` — บรรทัด 2069)

## คำสั่ง + บรรทัดสุดท้ายที่รันจริง

env ทุกคำสั่งที่แตะ DB: `export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(...)" APP_ENV=development; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1`

```
$ pnpm exec tsx scripts/qc-account-api-read-docs.mts
ผ่าน 50/50
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":50,"passed":50,"findings":[]}

$ pnpm exec tsx scripts/qc-account-api-core.mts
ผ่าน 64/64
JSON_SUMMARY {"total":64,"passed":64,"findings":[]}

$ pnpm exec tsx scripts/gen-account-api-docs.mts
✅ เขียน docs/api/ACCOUNT-API.md (15 op · 18731 ไบต์)

$ pnpm exec tsx scripts/qc-account-api-openapi.mts
ผ่าน 26/26
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":26,"passed":26,"findings":[]}

$ QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-acc-v2-list.mts
✅ ผ่านทั้งหมด — 159 เช็ก

$ QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-acc-v2-dashboard.mts
===== สรุป WO 2.1: ผ่าน 174 · ไม่ผ่าน 0 =====

$ NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
(ไม่มี output = 0 error)

$ pnpm fitness
ผ่าน 20/20
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```
