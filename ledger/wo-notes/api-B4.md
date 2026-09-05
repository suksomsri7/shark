# WO B4 — READ บัญชี/งบ/งวด/สินทรัพย์/ตั้งค่า ผ่าน REST `/api/v1/account/*`

ผู้ทำ: Opus (builder) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §B4 · oracle: `scripts/qc-account-api-read-gl.mts` (Fable เขียน — ไม่ได้แตะ)

**สถานะ: 54/55 · CRITICAL 1 (`B4-G3.1`) — เชื่อว่าเป็นข้อสอบผิด ไม่ใช่โค้ดผิด (หลักฐานวัดจริงอยู่ท้ายไฟล์) จึงไม่แก้ oracle ตามกติกา**

## ไฟล์

### ใหม่
- `src/lib/modules/account/api/ops/gl-read.ts` — 18 op (ผังบัญชี · mapping · สมุดรายวัน · รายงาน 7 ตัว · งวด · สินทรัพย์)
- `src/lib/modules/account/api/ops/settings-read.ts` — 8 op (audit · ตั้งค่า · นโยบาย · เอกสาร · เชื่อมต่อ · คลังเอกสาร · กล่องขาเข้า · อภิธานศัพท์)
- `src/lib/modules/account/api/serialize-gl.ts` — ตัวแปลงทั้งหมดของ B4

### แก้ (additive ทั้งหมด — ไม่มีการเปลี่ยนพฤติกรรมของผู้เรียกเดิม)
- `api/registry.ts` — ต่อ `GL_READ_OPS` + `SETTINGS_READ_OPS` เข้า `ACCOUNT_OPS` (รวม 72 op)
- `errors.ts` — เพิ่ม `ERR.JOURNAL_ENTRY_NOT_FOUND` · `ERR.ASSET_NOT_FOUND`
- `journal-v2.ts` — **ใหม่ `generalLedger()`** (ดูหัวข้อถัดไป) · `JournalListRow` เพิ่ม `periodKey` · `postedById` · `refType`/`refId`/`refDocNo` · `JournalLineRow` เพิ่ม `accountId` (ทั้งหมดมาจาก select ที่มีอยู่แล้ว/เพิ่ม 2 คอลัมน์ — ไม่มี query เพิ่ม)
- `coa.ts` + `coa-v2.ts` — `LedgerDetail` เพิ่ม `monthDebitSatang`/`monthCreditSatang` (มาจาก `monthSum` ที่ query อยู่แล้ว — `monthDeltaSatang` เป็นยอดสุทธิตามธรรมชาติของหมวด แยก 2 ขาไม่ได้) · `LedgerRunningRow` เพิ่ม `refType`/`refId`
- `period-close.ts` — `PeriodRow` เพิ่ม `closedById` (REST ส่ง `closedBy{id,name}`)
- `asset.ts` — `AssetRow` เพิ่ม `accounts{asset,accum,expense}` (+1 query ต่อคำขอ ดึง ledger เป็นชุดเดียว ไม่ใช่ต่อสินทรัพย์)
- `asset-v2.ts` — `AssetDetail` เพิ่ม `sourceDocument{id,docNo,docType}` (query เพิ่มเฉพาะเมื่อมี `sourceDocumentId`)
- `access.ts` — `AuditLogRow` เพิ่ม `before`/`after` (คอลัมน์มีอยู่แล้วใน `AuditLog`)
- `connections.ts` — `ConnectionCard` เพิ่ม `lastPostedAt: Date | null` (REST ส่ง ISO · หน้าจอยังใช้ `lastPostedText` เดิม)
- `attachment.ts` — `AttachmentRowView` เพิ่ม `sha256` · `AttachmentTab` เพิ่มค่า `"archived"` (base where กรอง `archivedAt: null` เสมอ ⇒ กลับด้าน**เฉพาะแท็บนี้** + นับ total ด้วย count แยก · 3 แท็บเดิมได้ where/ตัวนับเท่าเดิมเป๊ะ)
- `inbox.ts` — ใหม่ `inboxEmailAddressOf(ctx)` (REST ไม่มี session ⇒ ดึง `tenant.slug` เอง · `Tenant` เป็น global-scope model ⇒ ระบุ id เองใน where)
- `src/app/app/sys/[id]/account/ledger/page.tsx` — เรียก `generalLedger()` แทน `coa.ledgerRunning()`
- `docs/api/ACCOUNT-API.md` — regenerate (`pnpm exec tsx scripts/gen-account-api-docs.mts` · 72 op)

## `generalLedger` — สิ่งที่ทำจริง vs สิ่งที่สเปคเขียนไว้

สเปค §B4 เขียนว่า "ย้าย query ของ `ledger/page.tsx` เป็น service" — **ข้อสมมตินี้เก่าไปแล้ว**: query ถูกย้ายออกจากหน้าไปที่ `coa.ledgerRunning` ตั้งแต่ WO 6.1 รอบ 2 (หน้าไม่ได้ import `@/lib/core/db` มาก่อนที่ผมจะแตะ ⇒ **`B4-G8.3` เขียวอยู่แล้วตั้งแต่ HEAD 8d30808**) และ `ledgerRunning` มีข้อสอบคุมอยู่ (`qc-acc-v2-coa` T15 · `qc-acc-v2-reports-drill` T3/T4 ใช้เป็นชั้น ② ของ drill-down)

ทำแบบนี้แทน (เจตนาเดิมของสเปค = "หน้าจอกับ API ต้องได้ตัวเลขจากสูตรเดียวกัน"):
- เพิ่ม `generalLedger(ctx, { accountId, from, to })` ใน `journal-v2.ts` = **ประตูเดียว** ของบัญชีแยกประเภท — resolve บัญชีผ่าน `tenantDb` (id ของร้านอื่น = `account: null` ⇒ REST ตอบ 404) แล้วเรียก `coa.ledgerRunning` ซึ่งเป็นเจ้าของคิวรียอดสะสมตัวเดิม
- หน้า `/account/ledger` เรียก `generalLedger` (พฤติกรรมเท่าเดิม: ไม่เลือกบัญชี = ก้อนศูนย์เหมือน branch เดิม)
- **ไม่** ก๊อปคิวรียอดสะสมไปเขียนใหม่ในไฟล์ที่ 2 (สองสูตรวันหนึ่งจะเดินคนละทางแล้วไม่มีใครรู้ว่าอันไหนถูก · และจะทำให้ข้อสอบ T15/T3/T4 คุมของที่ไม่มีใครใช้)
- ไม่มี raw `prisma` import เพิ่มในโมดูล (journal-v2 ใช้ `tenantDb` อยู่แล้ว) — F5 นิ่ง

## Op ↔ Service ↔ Serializer

| op id | REST | service | serializer |
|---|---|---|---|
| `chart.list` | `GET /chart` | `chartTree` + `listLedgers` (meta: parentId/level/VAT/WHT) | `chartView` (`chartAccountRow` + tree ซ้อน + `totalsByType`) |
| `chart.get` | `GET /chart/{id}` | `ledgerDetail` + `mappingKeyLabel` | `ledgerDetailView` |
| `mappings.list` | `GET /mappings` | `listMappings` + `mappingKeyLabel` | `mappingView` |
| `doc-type-accounts.list` | `GET /doc-type-accounts` | `listDocTypeAccounts` + `docTypeLabel` | `docTypeAccountView` |
| `journal.list` | `GET /journal` | `listJournalPaged` (+ `journalRangeOf` เมื่อส่ง preset) | `journalRow` ใน `paged()` + `byBook` + `totals` |
| `journal.get` | `GET /journal/{id}` | `journalEntryDetail` | `journalDetail` |
| `reports.general-ledger` | `GET /reports/general-ledger` | **`generalLedger`** | `generalLedgerView` + CSV |
| `reports.trial-balance` | `GET /reports/trial-balance` | `trialBalance` | `trialBalanceView` + CSV |
| `reports.profit-loss` | `GET /reports/profit-loss` | `profitLoss` | `profitLossView` + CSV |
| `reports.balance-sheet` | `GET /reports/balance-sheet` | `getPolicy` → `fiscalYearEndMonth` → `balanceSheet` | `balanceSheetView` + CSV |
| `reports.cash-flow` | `GET /reports/cash-flow` | `cashFlow` | `cashFlowView` + CSV |
| `reports.vat-pp30` | `GET /reports/vat-pp30` | `pp30` / `pp30Csv` | `pp30View` + CSV = `pp30Csv` ตรง ๆ |
| `reports.aging` | `GET /reports/aging` | `agingReport` (AR→OUT · AP→IN) | `agingView` + CSV |
| `periods.list` | `GET /periods` | `listPeriods` + `listVatFilings` | `periodRowView` |
| `periods.checklist` | `GET /periods/{key}/checklist` | `isPeriodKey` (ผิด → 422) + `periodChecklist` | `checklistView` |
| `assets.list` | `GET /assets` | `listAssets` | `assetRowView` (`monthlySatang` = `nextDepreciationAmount` สูตรเดียวกับตอนลงบัญชีจริง) |
| `assets.get` | `GET /assets/{id}` | `assetDetail` | `assetDetailView` |
| `assets.depreciation-preview` | `GET /assets/depreciation/preview` | `previewDepreciation` | `depreciationPreviewView` |
| `audit.list` | `GET /audit` | `listAuditLogs` | `auditRowView` ใน `withExtra({nextCursor})` |
| `settings.get` | `GET /settings` | `getSettings` | `settingsView` (**ไม่มี** stampUrl/signatureUrl/นโยบาย) |
| `settings.policy` | `GET /settings/policy` | `getPolicy` | `policyView` (`lockBeforeDate` เป็น `YYYY-MM-DD`\|null) |
| `settings.documents` | `GET /settings/documents` | `getDocSettings` + `docNumberingRows` | `docSettingRowView` (`example` มาจาก `docNumberingRows` = สูตรออกเลขจริง) |
| `links.list` | `GET /links` | `buildConnectionCards` | `linkCardView` |
| `files.list` | `GET /files` | `listAttachmentsPaged` + `listFolders` | `fileRowView` ใน `paged()` + `folders` + `tabCounts` |
| `inbox.get` | `GET /inbox` | `inboxStats` + `listAttachmentsPaged(tab=unlinked)` + `inboxEmailAddressOf` | `inboxItemView` |
| `help.glossary` | `GET /help/glossary` | `HELP_TEXTS` | — (`[{key,text}]` · 50 คำ) |

## กับดักที่เจอระหว่างทำ (จดไว้ให้ WO ถัดไป)

1. **หน่วยของช่วงเวลาไม่เท่ากัน**: `reports.ts` คิดที่ระดับงวด (`periodKey` "YYYY-MM" เทียบแบบ lexicographic) แต่สมุดรายวัน/แยกประเภทคิดที่ระดับ "วันไทย" ⇒ ส่ง `"2026-09-01"` เข้า `trialBalance` ตรง ๆ จะได้ `gte "2026-09-01"` ซึ่ง **มากกว่า** `"2026-09"` ⇒ งวดหายทั้งงวดโดยไม่มี error (ยอดออกมา 0 เฉย ๆ) → ตัดเหลือ `YYYY-MM` ที่ `periodOf()` จุดเดียว และรับได้ทั้ง 2 รูปแบบตามสัญญา (`B4-G3.5` เขียว)
2. `journal.list` ค่าเริ่มต้น `range` = `all` ไม่ใช่ "เดือนนี้" ของหน้าจอ — ผู้เรียก REST ที่ไม่ส่งตัวกรองต้องไม่โดนนาฬิกาเซิร์ฟเวอร์ตัดผลลัพธ์เงียบ ๆ
3. `ref` ของแถวสมุดรายวันในชั้น service มี `href` ของหน้าจอติดมาด้วย ⇒ ต้องแปลงเป็น `ref{type,id,docNo}` จากฟิลด์ดิบ (ห้ามส่งของหน้าจอออก API — กติกาข้อ 1 ของ serialize)
4. `AccountAssetStatus` มี 4 ค่า (มี `FULLY_DEPRECIATED` ด้วย) — enum ของ input ต้องครบ ไม่งั้นกรองสถานะนี้ไม่ได้เลย
5. `inboxEmailAddress(slug)` เดิมรับ slug จาก session ⇒ REST ต้องมีตัวห่อที่ดึง slug เอง (`Tenant` เป็น global-scope ของ `tenantDb` — ไม่มีการยัด tenantId ให้ ต้องใส่ `where.id` เอง)

## คำสั่งที่รัน + บรรทัดสุดท้าย

ทุกคำสั่งที่แตะ DB export env QC บรรทัดเดียวกัน (`.env.qc` · ด่าน `ep-plain-art`):
```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
```

| ด่าน | คำสั่ง | บรรทัดสุดท้าย |
|---|---|---|
| B4 (oracle) | `pnpm exec tsx scripts/qc-account-api-read-gl.mts` | `ผ่าน 54/55` · `FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0` |
| B1 | `scripts/qc-account-api-read-docs.mts` | `ผ่าน 50/50` · CRITICAL 0 |
| B2 | `scripts/qc-account-api-read-master.mts` | `ผ่าน 38/38` · CRITICAL 0 |
| B3 | `scripts/qc-account-api-read-finance.mts` | `ผ่าน 38/38` · CRITICAL 0 |
| A3 | `scripts/qc-account-api-core.mts` | `ผ่าน 64/64` · CRITICAL 0 |
| A4 | `scripts/qc-account-api-openapi.mts` | `ผ่าน 26/26` · CRITICAL 0 |
| 6.2 | `scripts/qc-acc-v2-journal.mts` | `✅ ผ่าน 94 ข้อ · พบปัญหา 0 ข้อ` |
| 6.1 | `scripts/qc-acc-v2-coa.mts` | `✅ ผ่าน 105 ข้อ · พบปัญหา 0 ข้อ` |
| 6.3 | `scripts/qc-acc-v2-period-assets.mts` | `✅ ผ่าน 121 ข้อ · พบปัญหา 0 ข้อ` |
| 6.2 drill | `scripts/qc-acc-v2-reports-drill.mts` | `✅ ผ่าน 57 ข้อ · พบปัญหา 0 ข้อ` |
| CPA | `scripts/qc-account-cpa.mts` | `ผ่าน 107/107` · CRITICAL 0 |
| 7.1 (เพิ่มเอง — แก้ attachment.ts) | `scripts/qc-acc-v2-attachments.mts` | `ผ่าน 66 · ตก 0` |
| 7.2 (เพิ่มเอง — แก้ inbox.ts) | `scripts/qc-acc-v2-inbox.mts` | `ผ่าน 128 · ตก 0` |
| 8.1 (เพิ่มเอง — doc-settings) | `scripts/qc-acc-v2-doc-settings.mts` | `✅ ผ่าน 116 ข้อ · พบปัญหา 0 ข้อ` |
| 8.2 (เพิ่มเอง — policy) | `scripts/qc-acc-v2-policy.mts` | `✅ ผ่าน 150 ข้อ · พบปัญหา 0 ข้อ` |

```
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   → ไม่มี error (tsc เงียบ)
pnpm fitness                                            → ผ่าน 20/20 · CRITICAL 0
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness → ผ่าน 20/20 · CRITICAL 0
```

## `B4-G3.1` — ข้อสอบผิด ไม่ใช่โค้ดผิด (หลักฐานวัดจริง)

ข้อสอบยิง `GET /reports/general-ledger?accountId=<6100>&from=2026-09-01&to=2026-09-30` แล้วเทียบกับเฉลย `E.wo62.drill["6100"]` = `{debit: 4163551, credit: 0, lines: 2}`

แต่เฉลยก้อนนั้นเป็นของ **ทั้งปี 2026** ไม่ใช่เดือนกันยายน — `scripts/qc-acc-v2-reports-drill.mts` ซึ่งเป็นเจ้าของเฉลยนี้ ใช้ `FROM = "2026-01"` / `TO = "2026-12"` แล้วเรียก `coa.ledgerRunning(ctx, id, rangeDates)` เทียบ (T3.4–T3.6)

วัดจาก DB QC (`ep-plain-art`) — บัญชี 6100 "ค่าเช่า" มีบรรทัดในสมุดรายวัน **2 บรรทัดตลอดกาล คนละเดือนกัน**:
```
2026-07-05  งวด 2026-07  PV-2026-07-0001  POSTED  dr 2,663,551
2026-09-29  งวด 2026-09  PY-2026-09-0009  POSTED  dr 1,500,000
รวม 2 บรรทัด · Σdr 4,163,551
```

positive control ผ่าน service ตัวเดียวกับที่ REST เรียก:
```
2026-09-01..2026-09-30   rows=1  openingDr=2663551  sumDr=1500000  closing=4163551
2026-01-01..2026-12-31   rows=2  openingDr=0        sumDr=4163551  closing=4163551   ← ตรงเฉลยเป๊ะ
```

⇒ endpoint คำนวณถูก: ช่วง ก.ย. ต้องได้ 1 บรรทัด / Dr 1,500,000 / ยกมา 2,663,551 / ยกไป 4,163,551 (`B4-G3.2` "running balance ต่อเนื่อง + closing = แถวสุดท้าย" เขียว ยืนยันความต่อเนื่อง)

ทางแก้ที่เสนอ (Fable ตัดสิน — ผมไม่แตะ oracle เอง) เลือกอย่างใดอย่างหนึ่ง:
1. เปลี่ยนช่วงในข้อสอบเป็น `from=2026-01-01&to=2026-12-31` แล้วเทียบ `rows.length`/`Σdr` กับเฉลยเดิมได้ครบ (ตรงกับที่เฉลยถูกสร้างมา) — **แนะนำข้อนี้**
2. คงช่วง ก.ย. ไว้ แล้วเทียบ `closingSatang === W.drill["6100"].debit` + `rows.length === 1` (ต้องเติมเฉลยรายเดือนใหม่ถ้าอยากเทียบ Σdr)
