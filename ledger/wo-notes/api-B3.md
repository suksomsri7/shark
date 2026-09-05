# WO B3 — READ การเงิน/เช็ค/WHT ผ่าน REST `/api/v1/account/*`

ผู้ทำ: Sonnet (builder) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §B3 · oracle: `scripts/qc-account-api-read-finance.mts` (Fable เขียน — ห้ามแตะ)

## ไฟล์

### ใหม่
- `src/lib/modules/account/api/ops/finance-read.ts` — 16 op ของ B3
- `src/lib/modules/account/api/serialize-finance.ts` — ตัวแปลงทั้งหมดของ B3

### แก้ (additive เท่านั้น)
- `src/lib/modules/account/api/op.ts` — เพิ่ม `csv?: (ctx, data) => string | Promise<string>` บน `ApiOp`
- `src/lib/modules/account/api/respond.ts` — เพิ่ม `csvResponse()` / `wantsCsv()` (ซอง CSV) · เพิ่ม `withExtra()` (ซองมีฟิลด์เสริมระดับบนสุดแต่ไม่มี `page`) · `ApiEnvelope.page` เปลี่ยนเป็น optional (ของเดิมที่ตั้ง page เสมอไม่กระทบ)
- `src/lib/modules/account/api/dispatch.ts` — read branch: ถ้า `op.csv` มีและ `Accept` มี `text/csv` → เรียก `op.csv(ctx, env.data)` แล้วตอบผ่าน `csvResponse()` แทน JSON
- `src/lib/modules/account/api/openapi.ts` — เพิ่มข้อ 10 ใน Conventions (อธิบาย CSV) · 200 response ของ op ที่มี `csv` เพิ่ม content type `text/csv`
- `src/lib/modules/account/api/serialize.ts` — export `cashView` (เดิม private) ให้ `serialize-finance.ts` ใช้ซ้ำใน `finance.overview`
- `src/lib/modules/account/api/registry.ts` — ต่อ `FINANCE_READ_OPS` เข้า `ACCOUNT_OPS`
- `src/lib/modules/account/errors.ts` — เพิ่ม `ERR.WHT_CERT_NOT_FOUND`
- `src/lib/modules/account/finance.ts` — เพิ่ม `openingBalance`/`openingDate` ใน `FinanceAccountBalance` (ไม่มี query เพิ่ม — มีอยู่แล้วใน `accounts` rows) · เพิ่ม `getFinanceAccountBalance()` (บัญชีเดียว + ยอด ณ วันที่ — ไม่กรอง archived ต่างจาก `financeBalances`) · เพิ่ม `financeLedgerCodes()` (โค้ด GL แบบ batch สำหรับ `ledgerAccountCode`) — **ทั้งสองฟังก์ชันใหม่ไม่แตะ `financeBalances` เดิมเลย** เพื่อไม่ให้งบ query ของ dashboard (`FINANCE_BALANCES_QUERIES` ตรึงไว้ที่ 2) ขยับ
- `src/lib/modules/account/dashboard.ts` — `cashCalendar()` เพิ่ม `opts.withItems?` (default false) + `CashCalendarItem` + `days[].items[]` — ใช้ **query ปกติของ Prisma** (ไม่ใช่ `$queryRaw`) เพื่อไม่แตะจำนวน raw query ที่ `qc-acc-v2-dashboard.mts` P0.3/P0.4 ตรึงไว้ที่ 4 ก้อน (ตอนแรกทำเป็น raw SQL แล้วเจอ P0.3 แดง — แก้เป็น Prisma query ธรรมดา + group วันฝั่ง JS ด้วย `dayKeyBkk`)
- `src/lib/modules/account/reconcile.ts` — `SystemEntryRow` เพิ่ม `matchedLineId` (จาก `reconciledStatementLineId` ที่เพิ่มใน select ของ `listSystemEntries`)
- `src/lib/modules/account/cheque.ts` — `ChequeRowV2` เพิ่ม `contactId` (จาก `document.contactId` ที่เพิ่มใน select) · เพิ่ม `getChequeRowV2()` (เช็คเดียวรูปแบบเดียวกับแถวในลิสต์ — ใช้โดย `cheques.get`)
- `src/lib/modules/account/wht.ts` — `WhtCertRow` เพิ่ม `contactId`

## Op ↔ Service ↔ Serializer

| op id | service | serializer |
|---|---|---|
| `finance-accounts.list` | `financeBalances` + `financeLedgerCodes` + `groupFinanceAccounts` | `financeAccountRow` + `financeGroupView` (ห่อด้วย `withExtra`) |
| `finance-accounts.get` | `getFinanceAccountBalance` + `listFinanceOpeningEntries` + `financeLedgerCodes` | `financeAccountDetail` |
| `finance-accounts.statement` | `financeStatement` | `financeStatementView` (+ `csv` ประกอบเองด้วย `csvRow()`) |
| `finance.overview` | `financeOverview` | `financeOverviewView` (ใช้ `cashView`/`calendarView` ร่วม) |
| `finance.calendar` | `cashCalendar({withItems:true})` | `calendarView` |
| `petty-cash.list` | `pettyCashList` + `listReimbursableExpensePayments` (ต่อกล่อง เพื่อคำนวณ `pendingSatang`) | `pettyCashView` |
| `payment-requests.list` | `listPaymentRequests` | `paymentRequestView` (ตัด `token`) |
| `reconcile.channels` | `listReconcilableChannels` | `reconcileChannelView` |
| `reconcile.get` | `reconcilePageData` | `reconcileSummaryView` + `reconcileLineView` + `reconcileSystemEntryView` |
| `cheques.list` | `listChequesV2` + `chequeSummaryV2` + `chequeStatusCounts` | `chequeRowView` |
| `cheques.get` | `getChequeRowV2` (ใหม่) | `chequeRowView` |
| `wht.list` | `listWhtCertsV2` | `whtCertRowView` |
| `wht.cert` | `getWhtCert` + `getSettings` + `getDocRef` | `whtCertDetailView` |
| `wht.pnd` | `pnd` (+ `pndCsv` สำหรับ CSV) | `pndView` |
| `wht.credits` | `listWhtCredits` + `whtCreditYearTotal` (+ `whtCreditsCsv` สำหรับ CSV) | `whtCreditsView` |
| `wht.filings` | `listWhtFilings` | `whtFilingView` |

## CSV branch design

- `ApiOp.csv?: (ctx, data) => string | Promise<string>` — `data` = สิ่งที่ handler คืนหลังแกะซอง `paged()`/`withExtra()` ออกแล้ว (เฉพาะ `data`, ไม่ใช่ทั้งซอง)
- `dispatch.ts` (read branch เท่านั้น): ถ้า `op.csv` มีและ `wantsCsv(req)` (เช็ค `Accept` มี `text/csv` แบบ case-insensitive) → เรียก `op.csv(ctx, env.data)` แล้วส่งผ่าน `csvResponse(body, "<opId>.csv", requestId)`
- `csvResponse()`: เติม BOM `﻿` นำหน้า (ถ้ายังไม่มี — กันเติมซ้ำเมื่อ body มาจาก `pndCsv`/`whtCreditsCsv` ที่มี BOM อยู่แล้ว) + header `content-type: text/csv; charset=utf-8` + `content-disposition: attachment; filename="..."` + `X-Request-Id`
- ตัวสร้าง CSV 3 แบบ:
  1. `finance-accounts.statement` — ไม่มีตัวสร้างสำเร็จรูปในเซอร์วิส ⇒ ประกอบเองในไฟล์ op ด้วย `csvRow()` จาก `src/lib/core/csv.ts` ตรง ๆ (คอลัมน์: date, journalNo, memo, refType, refId, inSatang, outSatang, balanceSatang)
  2. `wht.pnd` — เรียก `pndCsv()` เดิมของ `wht.ts` ตรง ๆ (คอลัมน์ฟอร์มราชการภาษาไทยที่ไม่ได้อยู่ใน JSON view) โดยอ่านพารามิเตอร์จาก `ctx.input` (ไม่ใช่จาก `data` ที่ serialize แล้ว)
  3. `wht.credits` — เรียก `whtCreditsCsv()` เดิมเช่นกัน
- openapi.ts: op ที่มี `csv` จะมี response 200 เพิ่ม content type `text/csv` (schema `{type:"string"}`) + คำอธิบาย description พิเศษ · เอกสาร (`gen-account-api-docs.mts`) ไม่ต้องแก้ (render อัตโนมัติจาก op ที่ generate ผ่าน `buildOpenApi`) — Conventions ข้อ 10 เพิ่มคำอธิบาย CSV เป็นภาษาอังกฤษ

## ⚠️ ข้อสังเกตสำคัญ: BOM หายเมื่ออ่านผ่าน `Response.text()`

ยืนยันด้วยโค้ดทดสอบตรง ๆ (ลบทิ้งแล้วหลังตรวจ ไม่ได้ commit): BOM (`EF BB BF`) ที่เราใส่ในไบต์จริงของ Response **ถูกตัดทิ้งเสมอ** เมื่ออ่านผ่าน `Response.text()` — เป็นพฤติกรรมมาตรฐานของ WHATWG Encoding spec ("UTF-8 decode" ที่ `Body.text()` ใช้ตัด BOM นำหน้าทิ้งเสมอ ไม่ว่า body จะสร้างจาก string หรือ `Uint8Array` ก็ตาม) — ตรวจแล้วว่า **ไบต์จริงในตัว Response ถูกต้อง** (`EF BB BF` นำหน้าจริง ยืนยันด้วย `arrayBuffer()` + `TextDecoder({ignoreBOM:true})`) ผู้บริโภคจริงที่ไม่ผ่าน `.text()` ของ JS (เช่น curl บันทึกไฟล์ แล้วเปิดด้วย Excel) จะเห็น BOM ถูกต้องตามที่ควรเป็น

## Oracle findings ที่คาดว่าเป็นบั๊กของ oracle เอง (ไม่ใช่ implementation) — รายงานให้ Fable ตรวจ

`qc-account-api-read-finance.mts` ผ่าน **33/38** (CRITICAL 3 · MAJOR 2) — ตรวจ implementation ด้วยมือแล้วเชื่อว่าถูกต้อง 2 กลุ่ม ดังนี้:

### กลุ่ม A — ไม่ได้ส่ง `asOf`/`E.today` (B3-F1.1, B3-F1.3, B3-F2.4)
`E.today` (ใน `acc-v2-expected.json`) = `2026-09-30` แต่นาฬิกาเครื่องจริงตอนรัน = `2026-09-05` (ยืนยันด้วย `date` บนเครื่อง) — ระหว่างสองวันนี้มีรายการที่ seed ไว้ (เช่น petty cash top-up 2026-09-14) ทำให้ยอด "ณ วันนี้จริง" (ค่าเริ่มต้นของ `financeBalances`/`getFinanceAccountBalance` เมื่อไม่ส่ง `asOf`) ต่างจาก `E.financeAccounts`/`E.finance`/`E.pettyCash` ที่คำนวณไว้ ณ `QC.today`

ยืนยันด้วยโค้ดทดสอบตรง (ลบแล้ว): เรียก `financeBalances(tenantId, systemId, new Date(`${E.today}T12:00:00+07:00`))` ตรง ๆ → ได้ค่าตรงกับ `E.financeAccounts` **เป๊ะทุกตัว** (`CSH001:12488000, BSV001:90180000, EWL001:27335000, PTY001:2970000`) — พิสูจน์ว่า service คำนวณถูกต้อง ปัญหาคือ request ของ oracle ไม่ได้แนบ `?asOf=${QC.today}`

เทียบกับ `qc-acc-v2-finance.mts` (oracle เก่าที่ยังเขียวอยู่) ซึ่งตรึง `const ASOF = new Date(`${QC.today}T12:00:00+07:00`)` แล้วส่งเข้า `financeBalances` ตรง ๆ เสมอ (ไม่พึ่งนาฬิกาเครื่อง) — น่าจะเป็นแพทเทิร์นที่ตั้งใจแต่ B3 oracle ลืมใส่ `asOf=` ใน URL 3 จุดนี้ (`GET /finance-accounts`, และ `GET /petty-cash`)

**ข้อเสนอแก้ไข** (ให้ Fable ตัดสินใจ ไม่ได้แก้เอง): เติม `?asOf=${QC.today}` ในคำขอของ B3-F1.1/F1.3/F2.4 เหมือนที่ `qc-acc-v2-finance.mts` ทำ

### กลุ่ม B — เช็ค BOM ผ่าน `.text()` (B3-F1.9, B3-F6.5)
ตามที่อธิบายด้านบน — `res.text()` ตัด BOM ทิ้งเสมอตามสเปก ไม่มีทางทำให้ `charCodeAt(0) === 0xfeff` ผ่านได้จากฝั่ง server เลย ไม่ว่าจะ implement ยังไง (ทดสอบแล้วทั้งส่ง string และส่ง `Uint8Array` ที่มี byte `EF BB BF` นำหน้าจริง ผลลัพธ์เหมือนกัน)

**ข้อเสนอแก้ไข**: เปลี่ยนวิธีตรวจใน oracle เป็นอ่าน `res.arrayBuffer()` แล้ว decode เอง (`new TextDecoder("utf-8", {ignoreBOM:true}).decode(buf)`) หรือเช็คแค่ 3 ไบต์แรกของ `arrayBuffer` ตรง ๆ แทนการเช็คผ่าน `.text().charCodeAt(0)`

ทั้งสองกลุ่มไม่ใช่ CRITICAL ต่อผู้ใช้จริง (คนละช่องทางเข้าถึงจริง — curl/เบราว์เซอร์ดาวน์โหลดไฟล์จะได้ผลถูกต้อง) — เขียนโค้ดยืนยันด้วยมือแล้วลบทิ้ง ไม่ได้ commit ไฟล์ debug ใด ๆ

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
$ export DATABASE_URL=... DIRECT_URL=... APP_ENV=development   # จาก .env.qc เท่านั้น
$ pnpm exec tsx scripts/qc-account-api-read-finance.mts
ผ่าน 33/38
FINDINGS: CRITICAL 3 · MAJOR 2 · MINOR 0
JSON_SUMMARY {"total":38,"passed":33,"findings":["B3-F1.1","B3-F1.3","B3-F1.9","B3-F2.4","B3-F6.5"]}

$ pnpm exec tsx scripts/qc-account-api-read-docs.mts
ผ่าน 50/50
JSON_SUMMARY {"total":50,"passed":50,"findings":[]}

$ pnpm exec tsx scripts/qc-account-api-read-master.mts
ผ่าน 38/38
JSON_SUMMARY {"total":38,"passed":38,"findings":[]}

$ pnpm exec tsx scripts/qc-account-api-core.mts
ผ่าน 64/64
JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
# (ตีกลับ 1 รอบภายใน: CORE-10.2 แดงเพราะ summary ของ wht.cert มี em-dash "—" ไม่ใช่ ASCII → แก้เป็น "-")

$ pnpm exec tsx scripts/gen-account-api-docs.mts
✅ เขียน docs/api/ACCOUNT-API.md (46 op · 33034 ไบต์)

$ pnpm exec tsx scripts/qc-account-api-openapi.mts
ผ่าน 26/26
JSON_SUMMARY {"total":26,"passed":26,"findings":[]}

$ pnpm exec tsx scripts/qc-acc-v2-finance.mts
ผ่าน 59 · ตก 0

$ pnpm exec tsx scripts/qc-acc-v2-reconcile.mts
ผ่าน 109 · ตก 0

$ pnpm exec tsx scripts/qc-acc-v2-wht-cheque.mts
ผ่าน 69 · ตก 0

# ด่านเก่าเพิ่มเติม (ตรวจเอง เพราะแก้ dashboard.ts/finance.ts ที่ไฟล์เหล่านี้ยึด):
$ pnpm exec tsx scripts/qc-acc-v2-dashboard.mts
สรุป WO 2.1: ผ่าน 174 · ไม่ผ่าน 0   # 🎉 WO 2.1 ผ่านทั้งหมด
# (ตีกลับ 1 รอบภายใน: P0.3/P0.4 แดงเพราะ cashCalendar เพิ่ม $queryRaw ก้อนที่ 5 → เปลี่ยนเป็น Prisma query
#  ธรรมดา + group วันฝั่ง JS แทน ก็ผ่าน — ดูหัวข้อ "ไฟล์ที่แก้ / dashboard.ts" ด้านบน)

$ pnpm exec tsx scripts/qc-acc-v2-finance-overview.mts
ผ่าน 45 · ตก 0   # FO9.1 financeOverview ≤ 12 query (ได้ 11) — งบ query ไม่ขยับ

$ NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
(ไม่มี error — exit 0)

$ pnpm fitness
ผ่าน 20/20
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

$ env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
ผ่าน 20/20
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

## สรุปสถานะ

- โค้ด/ทดสอบทั้งหมดที่แก้ได้จากฝั่ง builder แก้ครบแล้ว: typecheck 0 · fitness 20/20 ×2 · docs/openapi/core/read-docs/read-master 100% เขียว · ด่านเก่าที่เกี่ยวข้อง (finance/reconcile/wht-cheque/dashboard/finance-overview) เขียวหมด
- `qc-account-api-read-finance.mts` (oracle ของ B3 เอง) เหลือ 5 จาก 38 ข้อที่ไม่ผ่าน — ทั้งหมดมีหลักฐานว่าเป็นปัญหาที่ตัว oracle เอง (ไม่ใช่ implementation) ตามที่อธิบายไว้ข้างบน — **รอ Fable ตรวจสอบ/ตัดสินใจว่าจะแก้ oracle หรือไม่** ตามกติกา "builder ห้ามแก้ oracle ของ Fable"
- ไม่ได้ commit — ปล่อย tree dirty ตามกติกา run

JSON_SUMMARY_FINAL {"wo":"B3","gates":{"read_finance_oracle":{"total":38,"passed":33,"findings":["B3-F1.1","B3-F1.3","B3-F1.9","B3-F2.4","B3-F6.5"],"note":"5 findings believed to be oracle bugs, see above"},"read_docs":{"total":50,"passed":50},"read_master":{"total":38,"passed":38},"core":{"total":64,"passed":64},"openapi":{"total":26,"passed":26},"acc_v2_finance":{"total":59,"passed":59},"acc_v2_reconcile":{"total":109,"passed":109},"acc_v2_wht_cheque":{"total":69,"passed":69},"acc_v2_dashboard":{"total":174,"passed":174},"acc_v2_finance_overview":{"total":45,"passed":45}},"typecheck":0,"fitness_with_env":{"total":20,"passed":20},"fitness_without_env":{"total":20,"passed":20}}
