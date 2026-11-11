# ใบสั่ง D.1 — กฎหมาย สคบ. 2568 + สูตรเงินหอ (pure) · ตรวจเข้ม (กฎหมาย · เงิน)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.1 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §3 · §6 A4 A5 A8 A9 · ภาคผนวก ก #1–58 · สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1.3 §1.6 §1.7 · ตัวเลข: `ledger/design-dorm/README.md` + ภาพ 04 05 07 10 17
> ข้อสอบ: «scripts/qc-svc-d.1.mts» (ไม่มี DB) — รัน `bash scripts/iso.sh pnpm exec tsx scripts/qc-svc-d.1.mts` · **ห้ามแก้ข้อสอบ** (แย้ง = เขียนใน wo-notes · SVC-RUN §1.3 ข้อ 11)

## 1. ไฟล์ของใบ
| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| «src/lib/core/settings/legal/th-rental-2568.ts» | ใหม่ · pure | ตัวตรวจ + พารามิเตอร์กฎหมาย + โหมด |
| «src/lib/modules/dorm/calc.ts» | ใหม่ · pure | สูตรเงินทั้งหมด |
| «src/lib/core/settings/defs/rooms.ts» | ใหม่ · **ทำเมื่อ R0.3 ลงแล้วเท่านั้น** | 83 ค่า + แม่แบบ 4 แบบ + `SNAPSHOT_KEYS.lease/bill` (§4) · ถ้า R0.3 ยังไม่ลง ⇒ ข้ามส่วนนี้ (ข้อสอบ SKIP) แล้วจดใน wo-notes |

ห้าม: แตะ prisma/schema · แตะไฟล์ชิ้นกลางอื่น (registry/types/service ของ R0.3) · build · commit · install
**pure จริง**: ทั้งสองไฟล์ import ได้เฉพาะ `zod` · ไฟล์กันเองในสองไฟล์นี้ · `@/lib/modules/account/totals` (pure) · ห้าม `@/lib/core/db` `@prisma/client`(ค่า) `next/*` `server-only` · ห้าม `Date.now(` `Math.random(` `new Date()` (ไม่มีอาร์กิวเมนต์) `toFixed(` `parseFloat(` (ข้อสอบตรวจข้อความไฟล์)
ถ้า R0.3 ลงแล้วและมี `LegalVerdict` ใน «core/settings/types.ts» ให้ re-export ชนิดเดียวกัน (รูปร่างต้องตรง §2.1)

## 2. สัญญา «legal/th-rental-2568.ts»

### 2.1 ชนิด
```ts
export type LegalMode = "STRICT" | "WARN" | "OUT_OF_SCOPE";
export type LegalLevel = "OK" | "WARN" | "BLOCK";
export type LegalVerdict = { level: LegalLevel; code: string; messageTh: string; citation: string; always?: boolean };
export type LegalOutcome = LegalVerdict & { raw: LegalLevel; mode: LegalMode; needsAck: boolean; needsOwnerApproval: boolean };
export type BusinessType = "APARTMENT" | "STUDENT_DORM" | "SMALL_HOTEL" | "SERVICED_APT";
export type LegalParam<T> = { value: T; review: "CONFIRMED" | "PENDING_LEGAL_REVIEW"; noteTh: string };
```

### 2.2 พารามิเตอร์กฎหมาย (ไม่ฮาร์ดโค้ดในตัวตรวจ · มติเจ้าของ: ค่าที่ยังไม่ชัด = ค่าตั้ง + ป้ายรอตรวจ)
`export const TH_RENTAL_2568_PARAMS` มีอย่างน้อย:
| คีย์ | value | review |
|---|---|---|
| `scopeMinRooms` | 3 | ตามแหล่ง |
| `shortLeaseMaxMonths` | 36 | ตามแหล่ง |
| `longLeaseMaxMonths` | 360 | ตามแหล่ง |
| `depositAdvanceMaxMonthsShort` | 3 | ตามแหล่ง |
| `depositAdvanceMaxMonthsLong` | 12 | ตามแหล่ง |
| `depositReturnMaxDays` | 7 | **PENDING_LEGAL_REVIEW** (7 วันปฏิทิน/ทำการ · 14 วันถ้ามีหัก?) |
| `utilityCostMethod` | `"BILL_DIV_UNITS"` | **PENDING_LEGAL_REVIEW** (วิธีคิด "อัตราที่การไฟฟ้าเรียกเก็บ") |
| `lateFeeCapSatang` | `null` | **PENDING_LEGAL_REVIEW** (ไม่พบเพดานในตัวบท) |
ทุกตัวตรวจอ่านค่าจาก params ที่รวม `ctx.params` (override รายคีย์ด้วยค่า value ล้วน) — ที่ปรึกษา (J3) เปลี่ยนค่าได้โดยไม่แก้ตรรกะ · หน้าจอ (D.7/D.13) ใช้ `review` แสดงป้าย "รอตรวจ"

### 2.3 ตัวตรวจ (`TH_RENTAL_2568_RULES[ruleId](input, params) → LegalVerdict` · ระดับดิบ)
| ruleId | ภาคผนวก ก | input | ดิบ |
|---|---|---|---|
| `UTIL_FIXED_RATE_LE_COST` | #11 (#10) | `{ rateSatangPerUnit, authorityBillSatang: number\|null, authorityUnits: number\|null }` | `rate × units > bill` ⇒ BLOCK · เท่ากัน = OK · ไม่มีบิล/หน่วย ≤ 0 ⇒ **WARN** code `UTIL_COST_UNKNOWN` |
| `UTIL_TOTAL_LE_BILL` | #10 (ทุกวิธี รวมตารางอัตรา) | `{ chargedTotalSatang, authorityBillSatang: number\|null }` | เก็บจากผู้เช่ารวมทั้งงวด > บิล ⇒ BLOCK · ไม่มีบิล ⇒ WARN `UTIL_COST_UNKNOWN` |
| `UTIL_FLAT_LE_COST` | #12 | `{ flatSatang, payerCount, authorityBillSatang: number\|null }` | `flat × payerCount > bill` ⇒ BLOCK · ไม่มีบิล ⇒ WARN `UTIL_COST_UNKNOWN` |
| `UTIL_NO_MINIMUM` | #13 | `{ enabled: boolean, minSatang: number\|null }` | เปิดและ > 0 ⇒ BLOCK |
| `DEPOSIT_ADVANCE_LIMIT` | #43 #44 (ตอนทำสัญญา) | `{ leaseKind: "SHORT"\|"LONG", monthlyRentSatang, depositSatang, advanceRentSatang }` | `deposit + advance > rent × max` ⇒ BLOCK (ฐาน = ค่าห้องอย่างเดียว ไม่รวมส่วนกลาง — ตรงตัวอย่าง ประกัน ฿9,000 = 2 × 4,500) |
| `DEPOSIT_ADVANCE_MONTHS_LIMIT` | #43 #44 (ค่าตั้ง) | `{ leaseKind, depositMonths, advanceMonths }` | ผลรวม > max ⇒ BLOCK |
| `DEPOSIT_RETURN_DAYS` | #47 | `{ days }` | `days > depositReturnMaxDays` ⇒ BLOCK |
| `TEMPLATE_NO_THREAT` | #38 | `{ text }` | พบคำต้องห้าม ⇒ BLOCK **always** |
| `CONTRACT_MANDATORY_CLAUSES` | #50 | `{ clauses: {id, text}[] }` | ขาด id ใน `MANDATORY_CLAUSES` ⇒ BLOCK code `CONTRACT_MANDATORY_REMOVED` (ตามโหมด) · ข้อใดมีคำต้องห้าม ⇒ BLOCK code `CONTRACT_FORBIDDEN_TERM` **always** |
| `DEDUCTION_EVIDENCE` | #49 · A9 | `{ kind: "DAMAGE"\|"NORMAL_WEAR", evidenceCount }` | `NORMAL_WEAR` ⇒ BLOCK `DEDUCT_NORMAL_WEAR` **always** · DAMAGE + หลักฐาน 0 ⇒ BLOCK `DEDUCT_NO_EVIDENCE` (ตามโหมด) |
| `RENT_LOCKED_IN_LEASE` | #6 | `{ context: "MID_LEASE"\|"RENEWAL", oldSatang, newSatang }` | MID_LEASE และขึ้นราคา ⇒ BLOCK · ลดราคา/ต่อสัญญา = OK |
- `code` ของผลดิบ OK = `"OK"` · ผล BLOCK/WARN ใช้ `code` = ruleId เว้นแต่ตารางระบุโค้ดอื่น (`UTIL_COST_UNKNOWN` · `CONTRACT_*` · `DEDUCT_*`) · ทุกผล `messageTh` ภาษาไทยไม่ว่าง ไม่โทษผู้ใช้ · `citation` ไม่ว่าง (ข้อจากประกาศ 2568 ต้องมีคำ "2568")
- **คำต้องห้าม** `FORBIDDEN_TERMS` (ส่งออก) อย่างน้อย: ตัดไฟ · ตัดน้ำ · ตัดน้ำไฟ · ล็อกห้อง/ล็อคห้อง · ยึดของ · ยึดทรัพย์ · ขนของออก · cut off · lock out/lockout · seize — ตรวจหลัง **ตัดช่องว่างและอักขระความกว้างศูนย์ (U+200B–U+200D, U+FEFF) + ตัวพิมพ์เล็ก** · `findForbiddenTerms(text): string[]` ส่งออกด้วย (D.11/D.17 ใช้)
- `MANDATORY_CLAUSES: readonly {id, titleTh, textTh}[]` — ร่างข้อบังคับตามประกาศ (≥ 1 ข้อ · id ไม่ซ้ำ · **ร่าง รอที่ปรึกษา J3**) — ข้อสอบไม่ผูก id เฉพาะ
- `leaseKind(months): "SHORT" | "LONG" | null` — ≤ 36 SHORT · ≤ 360 LONG · เกิน/≤ 0/ไม่ใช่จำนวนเต็ม = null

### 2.4 โหมด — `evaluateLegal(ruleId, input, ctx: { mode, outOfScopeReason?, params? }) → LegalOutcome`
| ดิบ | STRICT | WARN | OUT_OF_SCOPE (มีเหตุผล) |
|---|---|---|---|
| OK | OK | OK | OK |
| WARN | WARN · needsAck | WARN · needsAck | OK |
| BLOCK | BLOCK | WARN · needsAck · **needsOwnerApproval** | OK |
| BLOCK + always | BLOCK | BLOCK | BLOCK |
- OUT_OF_SCOPE แต่เหตุผลว่าง/มีแต่ช่องว่าง ⇒ BLOCK code `OUT_OF_SCOPE_REASON_REQUIRED` (#3) ทุกกฎ
- `raw` = ระดับดิบ · `mode` = โหมดที่ใช้ · ระดับ OK ⇒ needsAck/needsOwnerApproval = false
- `legalScope({roomCount, businessType}) → { inScope, code, defaultMode, autoReasonTh }` (#1): inScope = ห้อง ≥ `scopeMinRooms` และเป็น APARTMENT/SERVICED_APT · `defaultMode` = STRICT ทุกแบบเมื่อห้อง ≥ 3 (หอนักศึกษา/โรงแรมใช้กฎเดียวกันเพราะปลอดภัยกว่า · แบบ §3) · ห้อง < 3 ⇒ OUT_OF_SCOPE + `autoReasonTh` ไม่ว่าง (อื่น ๆ null)
- การเปลี่ยนโหมด = เจ้าของเท่านั้น (#2) ไม่ใช่ pure → D.7/D.13

## 3. สัญญา «modules/dorm/calc.ts» — เงินเป็น **สตางค์จำนวนเต็ม** ทุกตัว · วันที่เป็นข้อความ `"YYYY-MM-DD"` (ห้าม Date ตามเขตเวลาเครื่อง)
- อินพุตเงิน/หน่วย/วัน/เลขมิเตอร์ที่ไม่ใช่จำนวนเต็ม ⇒ throw `DormCalcError` (`code`: `NON_INTEGER_SATANG` สำหรับเงิน · `INVALID_READING` สำหรับเลขมิเตอร์) — ไม่ปัดให้เงียบ ๆ
- `export class DormCalcError extends Error { code: string }`
- **ปัดเศษ** (#4 ทศนิยม 2 ตำแหน่ง = ระดับสตางค์): `divRoundHalfUp(n, d)` จำนวนเต็ม · d > 0 · ครึ่งปัดออกจากศูนย์ · คิดด้วยจำนวนเต็มเท่านั้น (ห้ามหาร float แล้ว Math.round) — ยกเว้นอัตราต้นทุนจริงที่ **ปัดลง** (ไม่ให้เกินต้นทุน)

| ฟังก์ชัน | สัญญา |
|---|---|
| `actualCostRate({billSatang, units}) → number \| null` | `floor(bill/units)` สตางค์/หน่วย · units ≤ 0 ⇒ null · (1,982,400/4,200 = 472 · 384,000/240 = 1,600) |
| `meterUnits(segments: {start, end, rolloverDigits?}[]) → number` | Σ(end − start) · เปลี่ยนมิเตอร์กลางรอบ = 2 ช่วง (ตัวเก่า prev→เลขตอนถอด · ตัวใหม่ เลขเริ่ม→เลขจด) · end < start: มี rolloverDigits ⇒ `end + 10^digits − start` · ไม่มี ⇒ throw `METER_BACKWARDS` · ว่าง ⇒ throw `NO_SEGMENTS` |
| `utilityCharge({method, units, minimumSatang?}) → {amountSatang, units, rateSatangPerUnit, minimumApplied}` | `method` = `{kind:"ACTUAL_COST", billSatang, billUnits}` (อัตรา = actualCostRate) · `{kind:"TARIFF", tiers:{uptoUnits:number\|null, rateE4}[], ftE4}` (ขั้นบันไดสะสม · rateE4/ftE4 = บาท×10⁴ · รวม Σ units×rateE4 + units×ftE4 แล้ว `divRoundHalfUp(·,100)` **ครั้งเดียวท้ายสุด** · rateSatangPerUnit = null) · `{kind:"FIXED_RATE", satangPerUnit}` · `{kind:"FLAT", per:"ROOM"\|"PERSON", satang, persons?}` (ไม่ขึ้นกับหน่วย · PERSON = satang × persons) · `minimumSatang` > ยอด ⇒ ยอด = ขั้นต่ำ + minimumApplied (ความถูกกฎหมายเป็นหน้าที่ตัวตรวจ) |
| `allocateShared({totalSatang, basis:"PERSON"\|"ROOM"\|"AREA", rooms:{roomId, persons?, areaSqmE2?}[]}) → {roomId, amountSatang}[]` | มิเตอร์รวมเฉลี่ย (#14) · น้ำหนัก ROOM=1 · PERSON=persons · AREA=ตร.ม.×100 · largest remainder ด้วยจำนวนเต็ม (`floor(total×w/W)` + เศษ) · เศษเท่ากันให้ลำดับอินพุตก่อน · ผลรวม = total เป๊ะ · น้ำหนักรวม 0 ⇒ throw `NO_ALLOCATION_BASIS` · คืนตามลำดับอินพุต |
| `daysInMonth(year, month)` | ปี ค.ศ. · เดือน 1–12 · อธิกสุรทินแบบเกรกอเรียน |
| `addDaysYmd(ymd, n) → string` | ข้ามเดือน/ปีถูก |
| `occupiedDays({periodStart, periodEnd, moveIn?, moveOut?})` | นับ **รวมทั้งสองปลาย** ตัดกับช่วงงวด · ไม่ทับ ⇒ 0 |
| `prorate({monthlySatang, days, daysInMonth, mode})` | #27 · `ACTUAL_DAYS` = monthly×days/daysInMonth · `DIV_30` = monthly×min(days,30)/30 · `FULL_MONTH` = monthly (days > 0) · ปัด half-up |
| `lateFee({policy, dueDate, paidDate, overdueSatang}) → {feeSatang, daysLate, chargeableDays, capped}` | #31–34 · `policy = {kind:"NONE"\|"PER_DAY"\|"ONCE"\|"PERCENT", amountSatang?, percentBp?, capSatang?, graceDays}` · daysLate = วันหลังครบกำหนด (จ่ายวันครบ = 0) · **daysLate ≤ grace ⇒ 0** · chargeableDays = daysLate − grace (วันผ่อนผันไม่คิดเงินเลย) · PER_DAY = amount × chargeableDays · ONCE = amount · PERCENT = half-up(overdue × bp / 10,000) · แล้ว `min(cap)` ⇒ capped |
| `computeBill({lines, vat:{registered, pricesIncludeVat}}) → DormBillResult` | ชนิดภาษีต่อบรรทัด (#19–21) · ไม่จด VAT ⇒ ทุกบรรทัด taxKind `"NONE"` vat 0 · จด VAT: `EXEMPT`/`NONE` vat 0 · `VAT7` รวม VAT: net = half-up(amount×100/107), vat = amount − net · ไม่รวม VAT: vat = half-up(amount×7/100), gross = amount + vat · **คิดต่อบรรทัด = ตรงกับ `computeTotals` ของบัญชี V2** (`account/totals.ts`) ที่ D.2 จะออกใบแจ้งหนี้ |
| `buildDormBill(input) → DormBillResult` | ดู §3.1 |
| `sumBills(bills) → {count, totalSatang, vatSatang, byCode: Record<string, number>}` | byCode รวม `grossSatang` ตาม code (SERVICE:* แยกตามโค้ดเต็ม) |
| `settleDeposit(input)` | ดู §3.2 |

```ts
type TaxKind = "EXEMPT" | "VAT7" | "NONE";
type DormBillLine = { code: string; labelTh: string; qty: number; unitPriceSatang: number | null; amountSatang: number;
  taxKind: TaxKind; netSatang: number; vatSatang: number; grossSatang: number; meta?: Record<string, string | number> };
type DormBillResult = { lines: DormBillLine[]; subtotalSatang: number /*Σnet*/; vatSatang: number /*Σvat*/; totalSatang: number /*Σgross*/ };
```

### 3.1 `buildDormBill`
```ts
type UtilityInput =
  | { kind: "METERED"; segments: MeterSegment[]; method: ACTUAL_COST | TARIFF | FIXED_RATE; minimumSatang?: number | null }
  | { kind: "FLAT"; method: FLAT }
  | { kind: "ALLOCATED"; amountSatang: number };          // จาก allocateShared
buildDormBill({ rentSatang, commonFeeSatang, electricity?: UtilityInput | null, water?: UtilityInput | null,
  lateFeeSatang?, services?: {code, labelTh, amountSatang, taxKind?}[],
  taxKinds?: Partial<Record<"RENT"|"COMMON"|"ELEC"|"WATER"|"SERVICE"|"LATE_FEE", TaxKind>>,
  vat: { registered: boolean; pricesIncludeVat: boolean } })
```
- ลำดับบรรทัด: `RENT` · `COMMON` · `ELEC` · `WATER` · `SERVICE:<code>`… · `LATE_FEE` · ยอด 0 ของ COMMON/LATE_FEE/SERVICE ไม่ออกบรรทัด (RENT ออกเสมอ)
- ชนิดภาษีเริ่ม (#21): RENT `EXEMPT` · COMMON/ELEC/WATER/SERVICE `VAT7` · LATE_FEE `NONE` (⚠️ รอที่ปรึกษา/ผู้ตรวจบัญชี) · `taxKinds`/`services[].taxKind` ทับได้
- บรรทัดมิเตอร์ (กฎหมาย: แสดงหน่วย + ราคาต่อหน่วย): `qty` = หน่วย · `unitPriceSatang` = อัตรา (TARIFF = null) · `meta` = `{ units, from, to, segments }` (from = start ช่วงแรก · to = end ช่วงสุดท้าย) · FLAT: qty 1 (ROOM) หรือ persons · ALLOCATED: qty 1 · บรรทัดอื่น qty 1 · unitPrice = amount
- ค่าห้องเศษวันให้ผู้เรียก `prorate` ก่อน (D.8)

### 3.2 `settleDeposit` (A9 · ภาพ 07)
```ts
settleDeposit({ depositSatang, utilities: { code: "ELEC" | "WATER"; labelTh?; input: UtilityInput }[],
  damages: { labelTh; amountSatang; kind: "DAMAGE" | "NORMAL_WEAR"; evidenceCount }[], unpaidSatang,
  approvalThresholdSatang, legal: { mode: LegalMode; outOfScopeReason?: string | null } })
→ { ok: true; lines: { code: "DEPOSIT"|"ELEC"|"WATER"|"DAMAGE"|"UNPAID"; labelTh; amountSatang }[];
    utilitiesSatang; damagesSatang; unpaidSatang; refundSatang; tenantOwesSatang; needsApproval: boolean; legal: LegalOutcome[] }
  | { ok: false; code: string; index: number }
```
- ทุกรายการ damages ผ่าน `evaluateLegal("DEDUCTION_EVIDENCE", …, legal)` · ผล BLOCK ⇒ `{ok:false, code, index}` · ผล WARN เก็บใน `legal`
- lines: `DEPOSIT` +ประกัน · ELEC/WATER/DAMAGE ลบ · `UNPAID` ลบ (ออกเสมอแม้ 0 — ภาพ 07 "ค่าห้องค้าง 0.00") · `Σ lines.amountSatang = refundSatang − tenantOwesSatang`
- หักเกินประกัน ⇒ refund 0 + tenantOwes = ส่วนขาด · `needsApproval` = damagesSatang > approvalThresholdSatang (#48)

## 4. defs/rooms.ts (เมื่อ R0.3 ลง) — ชื่อคีย์ที่ข้อสอบผูก (ค่าที่เหลือในภาคผนวก ก ตั้งชื่อได้เองตามรูปแบบ `rooms.<group>.<name>`)
CC §1.3 ยกตัวอย่าง "dorm.deposit.months" แต่ domain = `rooms` และ §1.7 ใช้ `rooms.legal.mode` ⇒ **ใช้ prefix `rooms.` ทั้งหมด**
| key | ค่าเริ่ม APARTMENT | legal |
|---|---|---|
| `rooms.legal.mode` (ownerOnly · LEGAL) | `"STRICT"` | — |
| `rooms.legal.outOfScopeReason` | `null` | — |
| `rooms.utility.elec.method` · `rooms.utility.water.method` | `"ACTUAL_COST"` | `UTIL_TOTAL_LE_BILL` |
| `rooms.utility.elec.fixedRate` · `rooms.utility.water.fixedRate` | `null` | `UTIL_FIXED_RATE_LE_COST` |
| `rooms.utility.minimum` | `null` (= ปิด) | `UTIL_NO_MINIMUM` |
| `rooms.utility.sharedBasis` | `"PERSON"` | — |
| `rooms.vat.registered` / `rooms.vat.pricesIncludeVat` | `false` / `true` | — |
| `rooms.vat.taxKinds` (table) | `{RENT:"EXEMPT", COMMON:"VAT7", ELEC:"VAT7", WATER:"VAT7", SERVICE:"VAT7", LATE_FEE:"NONE"}` | — |
| `rooms.billing.issueDay` / `dueDay` | 25 / 5 | — |
| `rooms.billing.prorate` | `"ACTUAL_DAYS"` | — |
| `rooms.lateFee.kind` / `amount` / `capPerBill` / `graceDays` | `"PER_DAY"` / 5000 / 50000 / 3 | — |
| `rooms.deposit.months` / `rooms.lease.advanceMonths` | 2 / 0 | `DEPOSIT_ADVANCE_MONTHS_LIMIT` |
| `rooms.deposit.returnDays` | 7 | `DEPOSIT_RETURN_DAYS` |
| `rooms.deposit.approvalThreshold` | 200000 | — |
| `rooms.moveout.noticeDays` | 30 | — |
| ทุก def type `template` ของ rooms | — | มี `TEMPLATE_NO_THREAT` |
- แม่แบบ `APARTMENT` `STUDENT_DORM` `SMALL_HOTEL` `SERVICED_APT` · ค่าโรงแรม (`rooms.hotel.*`) `hiddenUntil: "PHASE_H"` · `listDefs("rooms").length ≥ 83`
- `SNAPSHOT_KEYS.lease` ⊇ lateFee×4 + `rooms.deposit.months` + `rooms.billing.dueDay` · `SNAPSHOT_KEYS.bill` ⊇ elec/water method + `rooms.vat.registered` `pricesIncludeVat` `taxKinds`
- ทุก `legal` ใน def ต้องเป็น ruleId ที่มีจริงใน `TH_RENTAL_2568_RULES` · ค่าเริ่มของทุกแม่แบบต้องผ่านตัวตรวจในโหมด STRICT

## 5. ข้อมูลฉาก (ข้อสอบ)
- ห้อง 204, 207 · อัตรา ฿4.72/฿16.00 · รวมรอบ ฿174,126.40 · แยกกลุ่ม 24/3/4 = README + ภาพ 01 03 04 06 07 10 17
- **fixture 31 ห้อง**: ภาพ 04 ให้ครบเฉพาะ 201–206 · 309 · ภาพ 06 ให้ยอด 104 · ส่วนที่เหลือ (หน่วยรายห้อง 23 ห้อง · ห้องที่โดนค่าปรับใบที่ 2 = 211 · เลขถอด 112 = 8,951) **ผู้คุมแต่งให้ตรงทุกยอดรวมในจอ** (หน่วยไฟรวม 3,720 · น้ำ 198 · ค่าปรับ 2 × ฿200 · กลุ่มจ่ายแล้ว ฿133,912.80 · สลิป ฿17,785.36 · ยังไม่จ่าย ฿22,428.24 · ต้นทุนหอแบก ฿2,937.60 ภาพ 14) — ค่าแต่งจดไว้ในข้อสอบช่อง `src:"fixture"`
- ค่าปรับ 203/211: ครบ 5 ต.ค. จ่าย 9 ต.ค. · นโยบายหอตัวอย่าง (ภาพ 17) ฿50/วัน เพดาน ฿500 ผ่อนผัน 0 ⇒ ฿200

## 6. เกณฑ์รับ
ข้อสอบเขียวทุกข้อ (ส่วน defs เขียวเมื่อ R0.3 ลง · ก่อนนั้น SKIP ได้) · typecheck · fitness 2 โหมด · ไม่มี `any` · ตรวจเข้ม 2 รอบ (SVC-RUN §1.4) · ชุด regression: `qc-acc-v2-gl-inclvat` (เพราะเทียบสูตร VAT กับ `account/totals.ts` — ห้ามแก้ไฟล์นั้น)
wo-notes: X ที่เกี่ยว = ไม่มี (pure · ไม่มีขอบเขตร้าน/ส่งซ้ำ/สาธารณะ) · จดข้อกฎหมายที่ยัง PENDING ส่งที่ปรึกษา (J3) พร้อมชุดข้อสอบนี้

## 7. มติหลังผู้ตรวจ 27 ต.ค. (ผู้คุม · ORACLE-EDIT D.1-R1 · ข้อสอบหมวด "ญ" `D1-R1-*`) — **ทับ §2–§3 เมื่อขัดกัน**
1. **[BLOCKER] เงินติดลบ** ทุกอินพุต (ค่าห้อง · ส่วนกลาง · services · ค่าปรับ · ALLOCATED · อัตรา FIXED/FLAT · ขั้นต่ำ · บิลการไฟฟ้า · ค่าเสียหาย · ค้างชำระ · ประกัน · วงเงินอนุมัติ · cap · overdue · total ของ allocate · monthly ของ prorate · amount ของ computeBill) ⇒ throw `NEGATIVE_SATANG` · ส่วนลด = ใบลดหนี้ของบัญชี ไม่ใช่บรรทัดติดลบ (`divRoundHalfUp` ยังรับลบได้ — เป็นคณิตล้วน)
2. **[BLOCKER] VAT ซ้อน**: `billSatang` ของการไฟฟ้า/ประปา = ยอดรวม VAT แล้ว · `actualCostRate({billSatang, units, vat?})` — จด VAT + ราคาไม่รวม VAT ⇒ `floor(bill×100 / (107×units))` (1,982,400/4,200 ⇒ 441) · โหมดอื่น/ไม่ส่ง vat ⇒ เดิม (472) · `buildDormBill` ใช้ vat ของบิลคิดอัตรา ACTUAL_COST เอง · **กติกา (บังคับ · ผู้คุมเคาะ R2): ยอดที่ผู้เช่าจ่ายจริง (gross) รวมทุกห้อง ≤ บิล ทุกโหมด VAT — แม้ห้องใช้ครบ 100% ของหน่วยในบิล และแม้อัตราลงตัวพอดี (VAT ปัดขึ้นต่อบรรทัดห้ามดันยอดรวมเกินแม้ 1 สตางค์)**
   - วิธีเป็นของ builder (ปรับอัตราลงเผื่อปัด หรือรับจำนวนห้อง ฯลฯ) — ข้อสอบตรวจผลลัพธ์ผ่าน `buildDormBill` ทีละห้องโดย **ไม่ส่งข้อมูลอื่นนอกจาก method เดิม** ⇒ ถ้าเพิ่มช่องใหม่ต้องเป็น optional และค่าเริ่มต้องปลอดภัยกรณีเลวสุด (ห้อง = หน่วย)
   - อัตราแบบจด VAT ไม่รวม ต้องอยู่ในช่วง `[floor((bill×100 − 50×U)/(107×U)), floor(bill×100/(107×U))]` (ไฟตัวอย่าง 440–441 · น้ำ 1,494–1,495) · Σgross ≥ 99% ของบิลในฉากขอบ (ห้ามกดอัตราเกินจำเป็น)
   - ข้อสอบ: `D1-R2-VAT-EDGE` (บิล 1,981,854 = 441×4,200×1.07 · 1,400 ห้อง × 3 หน่วย ถ้าใช้ 441 ตรง ๆ เกิน ฿5.46 · 4,200 × 1 หน่วย · ผสม · บิลเล็ก) · `D1-R2-VAT-PROP100` (สุ่ม 400 ตึก ใช้ 100% · ครึ่งหนึ่งอัตราลงตัว)
   - ตัวตรวจ `UTIL_FIXED_RATE_LE_COST` `UTIL_FLAT_LE_COST` รับ `vat?: {registered, pricesIncludeVat}` (ไม่ส่ง = ไม่จด) แล้วเทียบ gross ด้วยจำนวนเต็ม: จด+ไม่รวม ⇒ `rate×units×107 > bill×100` / `flat×payers×107 > bill×100` ⇒ BLOCK · `UTIL_TOTAL_LE_BILL.chargedTotalSatang` = **gross** ที่ผู้เช่าจ่าย (รับ vat ได้แต่ไม่ต้องใช้)
3. ตัวตรวจได้ค่าผิด (NaN · Infinity · ติดลบ · undefined · ไม่ใช่จำนวนเต็ม ในช่องตัวเลข) ⇒ BLOCK code `INVALID_INPUT` **ทุกโหมด** (เหมือน always) · `DEDUCTION_EVIDENCE` ผ่านเฉพาะ `kind === "DAMAGE"` ตรงตัว + `evidenceCount` จำนวนเต็ม ≥ 1 (0 = `DEDUCT_NO_EVIDENCE` · kind อื่นใด = BLOCK)
4. `mode` ไม่รู้จัก/undefined/null ⇒ ถือเป็น `STRICT` (outcome.mode = "STRICT")
5. ข้อบังคับในสัญญา: id ครบ **และ** เนื้อความตรง `MANDATORY_CLAUSES[].textTh` หลัง normalize (ข้อ 6) ไม่งั้น BLOCK `CONTRACT_MANDATORY_REMOVED`
6. normalize คำต้องห้าม (และข้อ 5): `NFKC` → ตัดทุกอักขระที่ไม่ใช่ `\p{L}\p{N}` (รวม soft hyphen U+00AD · U+2060 · U+200B–U+200D · U+FEFF · ขีด/จุด/ขีดล่าง/ทับ) → `ํ` (+วรรณยุกต์) + `า` ⇒ (วรรณยุกต์) + `ำ` (เช่น "นํ้า" ⇒ "น้ำ") · `๊` ⇒ `็` (ล๊อค ⇒ ล็อค) → ตัวพิมพ์เล็ก · เพิ่มคำพ้อง: งดจ่ายไฟ · ระงับการจ่ายไฟฟ้า · ปิดน้ำปิดไฟ · เปลี่ยนกุญแจห้อง · ล็อกประตูห้อง/ล็อคประตู · ไม่ให้เข้าห้อง · ขนย้ายทรัพย์สินออก · shut off · disconnect · evict · cut off · lock out — รูปหลบทั้งหมดจาก `/tmp/svc-d1rA-probe.mts` อยู่ในข้อสอบ `D1-R1-THREAT-EVASION`
7. ตัวตรวจใหม่ `LATE_FEE_CAP` input `{ feeSatang }` (ค่าปรับต่อบิล/เพดานที่ร้านตั้ง): param `lateFeeCapSatang` = null ⇒ OK + `pendingReview: true` บน outcome · ตั้งค่าแล้ว fee > cap ⇒ BLOCK code `LATE_FEE_CAP` ตามโหมด · ลงทะเบียนใน `TH_RENTAL_2568_RULES`
8. ค่าห้อง EXEMPT เสมอ: `computeBill` ต้องมี `taxKind` ทุกบรรทัด (ไม่มี ⇒ throw `MISSING_TAX_KIND` แม้ไม่จด VAT) · บรรทัด code `RENT` ที่ไม่ใช่ EXEMPT หรือ `taxKinds.RENT ≠ EXEMPT` ⇒ throw `RENT_MUST_BE_EXEMPT` (ยกเลิกการทับค่าห้องใน §3.1)
9. `settleDeposit.needsApproval` = damages > วงเงิน **หรือ** legal ใดมี `needsOwnerApproval`
10. `outOfScopeReason`: ตัดอักขระความกว้างศูนย์ (ชุดในข้อ 6) + trim แล้วนับ code point ≥ 10 ไม่งั้น `OUT_OF_SCOPE_REASON_REQUIRED`
11. ผลคูณที่อาจเกิน `Number.MAX_SAFE_INTEGER` (units×rate · units×rateE4 · amount×days · overdue×bp · VAT amount×100 / ×7) ⇒ throw `OVERFLOW` (ตรวจก่อนคูณ ไม่ใช่ NON_INTEGER/INVALID_DIVISION)

**ส่งต่อใบอื่น (ไม่สอบใน D.1):** D.2 แมปบรรทัดบิลเข้าใบแจ้งหนี้เป็น `qty 1 × amountSatang` (หน่วย/อัตราอยู่ใน meta/คำอธิบาย) ให้ VAT ตรง `computeTotals` · D.7 พารามิเตอร์กฎหมาย (`params`) มาจากระดับแพลตฟอร์มเท่านั้น ร้านแก้ไม่ได้ + เลือก OUT_OF_SCOPE ต้องแนบหลักฐานเมื่อ `legalScope` บอกว่าอยู่ในขอบเขต · D.8 ส่ง `minimumSatang: null` เมื่อปิดค่าขั้นต่ำ


## หมายเหตุผู้คุมตอนรับใบ (27 ต.ค.)
- normalize คำต้องห้าม: เก็บ `\p{M}` ไว้ (ตัดเฉพาะที่ไม่ใช่ \p{L}\p{M}\p{N}) — ถ้าตัด \p{M} สระ/วรรณยุกต์ไทยหาย ('ตัดไฟ'→'ตดไฟ') ⇒ ทับข้อความ §7 ข้อ 6
- **หนี้ D-phase (ย้ายออก)**: `settleDeposit` ยังไม่รับ vat ⇒ ค่าน้ำไฟตอนย้ายออกของหอที่จด VAT แบบไม่รวม VAT ต้องใช้อัตราเดียวกับ buildDormBill (ถอด VAT) — ใบที่ทำจอย้ายออกต้องแก้ + ข้อสอบ
- `billedRooms` ไม่ส่ง = ใช้จำนวนหน่วย (กรณีเลวสุด อัตราต่ำลงเล็กน้อย) ⇒ D.8 รอบบิลควรส่งจำนวนห้องที่ออกบิลจริง
