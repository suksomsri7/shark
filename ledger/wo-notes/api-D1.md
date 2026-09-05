# WO D1 — WRITE การเงิน / เช็ค / WHT (`api/ops/finance-write.ts`)

สถานะ: **เสร็จ · ทุกด่านเขียว · ยังไม่ commit (ต้นไม้ dirty ตามกติกา)**
ทะเบียนรวม **145 op** (เดิม 130 + 15 ของ D1)

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/account/api/ops/finance-write.ts` (**ใหม่**) | 15 op ของ D1 ทั้งหมด |
| `src/lib/modules/account/api/registry.ts` | `import { FINANCE_WRITE_OPS }` + ต่อเข้า `ACCOUNT_OPS` (ต่อจาก `FINANCE_READ_OPS`) |
| `src/lib/modules/account/api/serialize-finance.ts` | **เพิ่ม** `financeAccountWriteView()` (ไม่แตะของเดิม) |
| `src/lib/modules/account/finance-overview.ts` | `reimbursePettyCash` คืน `{ ok: true; pettyId }` เพิ่ม (additive) |
| `src/lib/modules/account/api/ops/payments-write.ts` | **ถอดกฎ** "หัก WHT แล้วต้องส่ง `whtIncomeType`" (เหตุผลข้อ 5) |
| `docs/api/ACCOUNT-API.md` | regenerate (`gen-account-api-docs.mts` → `--check` ผ่าน) |

ไม่มี migration · ไม่แตะ prisma ตรงในโมดูล (raw prisma baseline ไม่ขยับ) · ไม่มี `any` ใน `src/`

## 2. op → service

| op id | REST | kind · scope | service ที่เรียก | test id |
|---|---|---|---|---|
| `finance-accounts.create` | `POST /finance-accounts` | write · `account.finance.manage` | `createFinanceAccount` → `getFinanceAccountBalance`+`listFinanceOpeningEntries`+`financeLedgerCodes` | D1-F1.1 |
| `finance-accounts.update` | `PATCH /finance-accounts/{id}` | write · finance.manage | `updateFinanceAccount` | D1-F1.6 |
| `finance-accounts.archive` | `DELETE /finance-accounts/{id}` | write · finance.manage | `archiveFinanceAccount` | D1-F1.14 |
| `finance-accounts.add-opening` | `POST /finance-accounts/{id}/opening` | write · finance.manage | `addFinanceOpeningEntry` | D1-F1.7 |
| `finance.transfer` | `POST /finance-transfers` | write · finance.manage | `getFinanceAccountBalance` (ด่านยอด) → `transferBetweenFinance({ transferId })` | D1-F1.8 |
| `petty-cash.top-up` | `POST /petty-cash/top-up` | write · finance.manage | `topUpPettyCash({ transferId })` | D1-F1.12 |
| `petty-cash.reimburse` | `POST /petty-cash/reimburse` | write · finance.manage | `reimbursePettyCash` | D1-F1.13 |
| `cheques.create` | `POST /cheques` | write · `account.cheque.manage` | `createCheque` → `getChequeRowV2` | D1-F2.1 |
| `cheques.deposit` | `POST /cheques/{id}/deposit` | write · `account.cheque.deposit` | `getChequeRowV2` (ด่านสถานะ) → `depositCheque` | D1-F2.4 |
| `cheques.clear` | `POST /cheques/{id}/clear` | write · `account.cheque.clear` | ด่านสถานะ → `clearCheque` | D1-F2.5 |
| `cheques.bounce` | `POST /cheques/{id}/bounce` | write · `account.cheque.bounce` | ด่านสถานะ → `bounceCheque` | D1-F2.7 |
| `cheques.void` | `POST /cheques/{id}/void` | **danger** · `account.cheque.void` | ด่านสถานะ → `voidCheque` | D1-F2.9 |
| `wht.issue-cert` | `POST /wht/certs` | write · `account.wht.manage` | `issueWhtCert` (ประเภทเงินได้ผ่าน `api/wht-income.ts`) | D1-F3.2 |
| `wht.mark-filed` | `POST /wht/filings` | write · wht.manage | `markFiled` | D1-F3.4 |
| `wht.unmark-filed` | `DELETE /wht/filings/{form}/{period}` | **danger** · `account.wht.unmark` | `unmarkFiled` | D1-F3.7 |

`wht.issue-cert` รับทั้งชื่ออ่านออก (`SERVICE`, `RENT`, …) และรหัสดิบ (`M40_1`…`M40_8`) ผ่าน
`whtIncomeTypeField` / `toWhtIncomeType` ของ `api/wht-income.ts` (**import ตารางเดียวกับ C2 ไม่ก็อป**)

## 3. ตารางแปลง error → HTTP

ค่าปริยาย = `throw new Error(reason)` แล้วให้ `mapError` จับคำไทย (`ไม่พบ…`→404 · `…สถานะ/ร่าง…`→409
`state_conflict` · `…ซ้ำ…`→409 `duplicate` · ไทยอื่น→422) · ที่เหลือคือจุดที่ **บังคับเอง** เพราะข้อความ
ของ service จับคำไม่ถึง (ห้ามไปแก้ข้อความ service — ข้อความเดียวกันขึ้นบนหน้าจอผู้ใช้):

| จุด | เหตุผลจาก service | ตอบ |
|---|---|---|
| ทุก op ที่ต้องอ่านแถวกลับมา | หา `AccountFinance`/`AccountCheque` ไม่เจอ | 404 `not_found` |
| `finance-accounts.archive` | `ปิดใช้งานไม่ได้ — ยอดคงเหลือยังไม่เป็นศูนย์ (฿…)` · `…มีรายการชำระเงินผ่านช่องทางนี้ในเดือนนี้ n รายการ` | **409 `state_conflict`** |
| `finance.transfer` / `petty-cash.top-up` | ด่านของ REST เอง: ยอดต้นทางไม่พอ | **409 `state_conflict`** (ข้อ 5) |
| `finance.transfer` | `fromId === toId` | 422 `validation` (zod `superRefine`) |
| `petty-cash.reimburse` | `รายการนี้เบิกชดเชยไปแล้ว` · `รายการจ่ายนี้ถูกยกเลิกแล้ว` | **409 `state_conflict`** |
| `cheques.deposit/.clear/.bounce/.void` | direction/status ไม่ตรงที่คำสั่งต้องการ | **409 `state_conflict`** + บอกสถานะปัจจุบันเป็นไทย |
| `wht.issue-cert` | `ออก 50 ทวิ ให้รายการนี้แล้ว` | **409 `duplicate`** |
| `wht.issue-cert` | `รายการชำระถูกยกเลิกแล้ว` | **409 `state_conflict`** |
| `wht.unmark-filed` | `งวดนี้ยังไม่ได้ทำเครื่องหมายนำส่ง` | **404 `not_found`** |
| `wht.unmark-filed` | `{form}` ไม่ใช่ 3/53 · `{period}` ไม่ใช่ `YYYY-MM` | 422 `validation` (path param ไม่ผ่าน zod ⇒ ตรวจมือ) |
| ทุก danger | ไม่มี `confirm: true` / `reason` < 5 ตัว | 409 `confirm_required` / 422 `validation` (ของ `dispatch.ts` เดิม) |
| สิทธิ์ไม่พอ | — | 403 `scope_missing` (ของ `require.ts` เดิม · ตรวจก่อน confirm/schema) |

## 4. userId / actor ที่ service ขอ

คีย์ API **ไม่ใช่ผู้ใช้** และคอลัมน์เหล่านี้เป็น FK ไปที่ `User` ⇒ ส่ง `null` ทุกจุด
ผู้ลงมือจริงถูกบันทึกไว้ที่ `AuditLog` แล้ว (`actorType: "API_KEY"`, `actorId: keyId`, `after.keyName`,
`after.requestId`, danger เพิ่ม `after.reason`) โดย `dispatch.ts`:

| service | ช่อง | ค่าที่ส่ง |
|---|---|---|
| `transferBetweenFinance` | `createdById` | `null` |
| `issueWhtCert` | `createdById` | `null` |
| `markFiled` | `filedById` | `null` |
| `createFinanceAccount` / `updateFinanceAccount` | `holderUserId` | ค่าที่ผู้เรียกส่งมา (เป็น "พนักงานผู้ถือกล่อง" ไม่ใช่ผู้ลงมือ) |
| `pettyCashReplenish` / `topUpPettyCash` | — | ไม่มีช่อง user |

## 5. การตัดสินใจที่ต้องรู้ (จุดที่ต่างจาก service เดิม)

1. **โอนเกินยอด → 409 (ไม่ปล่อยติดลบ)** — `transferBetweenFinance` ไม่ตรวจยอดคงเหลือเลย ยอมให้
   ติดลบได้ (หน้าจอมีคนมองตัวเลขอยู่) · ผ่าน API แปลว่าสคริปต์ของผู้เชื่อมต่อคำนวณผิด ⇒ REST
   กันไว้ก่อน (`assertSourceHasFunds`) ทั้ง `finance.transfer` และ `petty-cash.top-up`
   ⚠️ ด่านนี้เป็น read-then-write ไม่ได้ล็อกแถว ⇒ **กันความผิดพลาดของผู้เรียก ไม่ใช่กันการแข่งกัน**
   (ยิงพร้อมกัน 2 ใบยังผ่านได้ทั้งคู่) · หลักประกันจริงยังเป็นงบทดลอง GL เหมือนเดิม
   `petty-cash.reimburse` **ไม่มี** ด่านนี้ (จำนวนเงินมาจาก payment ที่จ่ายไปแล้ว ไม่ใช่ค่าที่ผู้เรียกพิมพ์)
2. **ลำดับสถานะเช็คเข้มกว่า service** — service ยอมทางลัดที่หน้าจอต้องการ: `clearCheque` เคลียร์
   เช็ครับที่ยัง `ON_HAND` ได้ · `bounceCheque` ทำเช็คที่ `CLEARED` ให้เด้งได้ · REST ปิดทั้งสองทาง
   (แอปภายนอกไม่ได้ถือเช็คอยู่ในมือ — ยิงผิดลำดับคือบั๊ก ไม่ใช่การแก้ข้อมูลให้ตรงความจริง):
   deposit = IN+`ON_HAND` · clear = IN+`DEPOSITED` หรือ OUT+`ISSUED` · bounce = IN+(`ON_HAND`|`DEPOSITED`)
   · void = OUT+`ISSUED` · นอกนั้น 409 `state_conflict` (D1-F2.3 / F2.6 ยึดข้อนี้)
   ⇒ **หน้าจอในแอปไม่เปลี่ยน** (ยังเรียก service ตรง) — ข้อจำกัดนี้อยู่ที่ชั้น REST เท่านั้น
3. **`transferId` = sha256(`acct-transfer:<keyId>:<Idempotency-Key>`) 40 ตัว** ไม่ใช่ค่า header ดิบ:
   `AccountFinanceTransfer.id` เป็น PK ของทั้งตาราง (ไม่แยกตามร้าน) ⇒ สองร้านที่ใช้ค่า
   `Idempotency-Key` เหมือนกัน (เช่น `transfer-1`) จะชนกัน แล้ว service เห็นว่า "โพสต์ไปแล้ว" →
   ตอบสำเร็จโดยไม่โอนจริง = เงินหายเงียบ ๆ · hash คู่ (keyId, idemKey) คงที่ต่อคำขอเดิม (retry ได้
   ผลเดิม) แต่ไม่ชนข้ามคีย์ · กันซ้ำจึงมี 2 ชั้นเหมือน C2 (ชั้น API 24 ชม. + ชั้น service ถาวร)
4. **`financeAccountWriteView` แยกจาก `financeAccountRow`** — คำตอบของ create/update ต้องมี
   `accountName`/`bankBranch`/`note`/`useForReceive`/`useForPay`/`limitSatang`/`holderUserId`
   (ไม่งั้นผู้เรียกยืนยันสิ่งที่เพิ่ง PATCH ไม่ได้) แต่ **ไม่ขยายคำตอบของ B3** ซึ่งถูกดึงบ่อยจากหน้าจอ
   (ช่องเพิ่มที่ไม่มีใครใช้ = ข้อมูลอ่อนไหวรั่วฟรี) ⇒ `GET /finance-accounts*` เหมือนเดิมเป๊ะ
5. **ถอดกฎ "หัก WHT แล้วต้องส่ง `whtIncomeType`" ออกจาก `payments.record` (C2)** — 🔴 นี่คือการแก้ของ
   WO อื่น จงใจ: ประเภทเงินได้ ม.40 เป็นของ **ใบ 50 ทวิ** ไม่ใช่ของ **การจ่ายเงิน** · ทางเดินจริงคือ
   จ่ายเงินวันนี้ (หัก 3% ไว้) แล้วค่อยตกลงประเภทเงินได้กับผู้ขาย แล้วออกใบด้วย `POST /wht/certs`
   ทีหลัง — กฎเดิมปิดทางนี้ทั้งเส้น (D1-F3.1 ยึดข้อนี้ตรง ๆ) · ส่ง `whtIncomeType` มาที่
   `payments.record` ยังได้ผลเดิมเป๊ะ (ออกใบให้เลย) · ด่าน `write-payments` 32/32 ยังเขียว
6. **`reimbursePettyCash` คืน `pettyId` เพิ่ม** — REST ต้องรายงาน `balanceSatang` ของกล่องกลับไป
   แต่ input มีแค่ `paymentId` · ค่านี้ service อ่านมาแล้วในตัว (ไม่มี query เพิ่ม) · ผู้เรียกเดิมที่ดูแค่
   `res.ok` ไม่กระทบ (ทางเลือกอื่นคือให้ REST ไล่หา payment เอง = query เพิ่ม + ชั้น API แตะ prisma)
7. **วันที่** `YYYY-MM-DD` → `T12:00:00+07:00` (เที่ยงวันไทย) ก่อนส่งเข้า service ทุกจุด — กันวันเพี้ยน
   1 วันตอนแปลงกลับไปกลับมาบน UTC
8. `qc-cheque-audit.mts` **ไม่ได้รัน**: หัวไฟล์เรียก `process.loadEnvFile(".env")` ตรง ๆ = ชี้ prod
   (ไม่ผ่าน `qc-env-guard`) — ผิดกติกาข้อ 2 ของ run นี้ ⇒ ปล่อยให้ Fable ตัดสินว่าจะรันเองไหม

## 6. คำสั่ง + บรรทัดสุดท้ายที่รันจริง

env ของทุกคำสั่งที่แตะ DB: `export DATABASE_URL=… DIRECT_URL=… APP_ENV=development` จาก `.env.qc`
(+ ด่าน `echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1`) · ชุด `qc-acc-v2-*` ใช้ `QC_ENV_FILE=.env.qc`

### ด่านที่ 1 — oracle ของ WO
```
pnpm exec tsx scripts/qc-account-api-write-finance.mts
ผ่าน 33/33
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
```

### ด่านที่ 2 — regression
```
qc-account-api-read-finance    ผ่าน 38/38    JSON_SUMMARY {"total":38,"passed":38,"findings":[]}
qc-account-api-write-payments  ผ่าน 32/32    JSON_SUMMARY {"total":32,"passed":32,"findings":[]}
qc-account-api-write-docs      ผ่าน 52/52    JSON_SUMMARY {"total":52,"passed":52,"findings":[]}
qc-account-api-core            ผ่าน 64/64    JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
qc-account-api-openapi         ผ่าน 26/26    JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
qc-account-cpa                 ผ่าน 107/107  JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
qc-acc-v2-finance              ผ่าน 59 · ตก 0  JSON_SUMMARY {"total":59,"passed":59,"findings":[]}
qc-acc-v2-finance-overview     ผ่าน 45 · ตก 0  JSON_SUMMARY {"total":45,"passed":45,"findings":[]}
qc-acc-v2-wht-cheque           ผ่าน 69 · ตก 0  JSON_SUMMARY {"total":69,"passed":69,"findings":[]}
```
(`qc-cheque-audit.mts` ข้าม — เหตุผลข้อ 5.8)

### คู่มือ/OpenAPI
```
pnpm exec tsx scripts/gen-account-api-docs.mts
✅ เขียน docs/api/ACCOUNT-API.md (145 op · 121909 ไบต์)
pnpm exec tsx scripts/gen-account-api-docs.mts --check
✅ docs/api/ACCOUNT-API.md ตรงกับทะเบียน (145 op)
```

### ด่านที่ 3 — typecheck
```
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
> tsc --noEmit          (ไม่มี output = 0 error)
```

### ด่านที่ 4 — fitness (ทั้ง 2 แบบ)
```
pnpm fitness
ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

## 7. ต้นไม้ที่ทิ้งไว้ (dirty · ยังไม่ commit)
```
 M docs/api/ACCOUNT-API.md
 M src/lib/modules/account/api/ops/payments-write.ts
 M src/lib/modules/account/api/registry.ts
 M src/lib/modules/account/api/serialize-finance.ts
 M src/lib/modules/account/finance-overview.ts
?? src/lib/modules/account/api/ops/finance-write.ts
```


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. ~21:30 UTC)
- รับ 3 ประเด็นของ builder: (1) ถอดกฎ whtIncomeType — ตรงกับสัญญา §C2 ที่เขียน `whtIncomeType?` อยู่แล้ว (2) REST เข้มกว่า service (เคลียร์เช็คที่ยัง ON_HAND / โอนเกินยอด → 409) — รับ · ⚠️ ด่านโอนเกินยอดเป็น read-then-write กันพิมพ์ผิดไม่กันยิงพร้อมกัน (3) transferId = sha256 — ถูกต้อง เพราะ PK ทั้งตาราง
- probe ของ Fable (ลบแล้ว): โอนไปช่องทางร้านอื่น → 404 ยอดร้านอื่นไม่ขยับ · ร้านอื่นโอนออกจากบัญชีเรา → 404 · โอนซ้ำ Idempotency-Key เดิม → transferId เท่ากัน แถวโอน 1 ยอด 950,000 ถูก · เช็ค: ร้านอื่น deposit/void → 404 สถานะคง ON_HAND · เติมเงินสดย่อยจากบัญชีร้านอื่น → 404 · ปิดช่องทางที่มียอด → 409 ไทย
- `qc-cheque-audit.mts` โหลด `.env` ตรง (prod) — ไม่รัน ถูกต้องตามกติกา · ควรย้ายไป qc-env-guard ในโอกาสหน้า (ไม่ใช่ขอบเขต run นี้)
- รันซ้ำเอง: write-finance 33 · read-finance 38 · write-payments 32 · core 64 · openapi 26 · acc-v2-wht-cheque 69 · docs --check 145 op · typecheck 0 · fitness 20/20 ×2
