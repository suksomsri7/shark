# ใบสั่ง H.1 — ราคาโรงแรม (แผนราคา · ฤดู · วัน/วันหยุด · แก้มือรายวัน) + นโยบาย (มัดจำ · ขั้นบันไดยกเลิก · ภาษี) + จอ ราคา (ภาพ 15) + จอ ตั้งค่าโรงแรม (`/hotel/settings` · แบบหอ 17) · ตรวจ **เข้ม (เงิน)** · ผู้ตรวจ 2 รอบ

> แหล่งความจริง: `ledger/SVC-HOTEL-PLAN.md` ร่าง 2 (§2 ข้อ 4–5 · §5.1 Q1–Q2) · MASTER-PLAN แถว H.1 · สเปก S §3.2 §4 (HotelRate*) §5.2 (API) §7.1 (rate resolution) §11 (S:1114) §12 (S:1133, 1154) · DH §7 บรรทัดแรก · ภาพ `ledger/design-dorm/15-hotel-rates.png` (+ `.body.html`) · หอ 17 เป็นแบบจอตั้งค่า · ใบ H.0 (ตาราง/คีย์)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.1.mts» — ผู้เขียนข้อสอบเขียนก่อนเปิดเลน · รัน `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.1.mts` (`--no-regression` ระหว่างทำ) · probe ผู้ตรวจ `probe-h1-b.mts`
> ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก "SVC H.1" (`SQC_HOTEL_RATES` · `SQC_VISUAL_SPECS["h.1"]` · ผู้ใช้ `frontdesk` + `hotel.rates.read`)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/`prisma/**`** · เลนตามผู้คุมกำหนด · temp ขึ้นต้น `svc-h1-` · รายงานต่อข้อ

## 0. หลักของใบ
- **ราคาเป็นเงิน**: ทุกฟังก์ชันคิดราคาเป็น pure (`pricing.ts` ไม่แตะ DB) รับข้อมูลที่โหลดมาแล้ว ⇒ ข้อสอบยิงได้พันกรณี · สตางค์ Int ทุกจุด · ปัดตาม `rooms.money.rounding`
- **ร้านตั้งได้/ปิดได้ทุกข้อ** (มติเจ้าของ Q1–Q3): ไม่มี magic number ในโค้ด · ทุกค่าเริ่มอยู่ใน registry (H.0 §6.1)
- สิ่งที่ใบนี้ **ไม่ทำ**: จอง (H.3) · folio/ภาษีบนบิลจริง (H.5 ใช้ `taxLines()` ของใบนี้) · storefront (H.8 ใช้ `quoteStay()`) · OTA markup (H.10 ใช้ `ChannelRateMap.formula`)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/hotel/pricing.ts» | ใหม่ (pure) | `resolveSeason` `resolveNightPrice` `quoteStay` `depositFor` `refundFor` `taxLines` §3 — import ได้แค่ type + `@/lib/core/settings` (type) · **ไม่มี Date เวลาเครื่อง** (รับ `today` เป็น YYYY-MM-DD) |
| «src/lib/modules/hotel/rates.ts» | ใหม่ (server) | CRUD แผนราคา/ฤดู/วันหยุด/matrix/override + `loadPricingContext` + `ratePreview` §4 · ด่าน type HOTEL + สิทธิ์ทุกฟังก์ชัน · ผ่าน `tenantDb` |
| «src/lib/modules/hotel/hotel-settings.ts» | ใหม่ (server) | `loadHotelSettings` `saveHotelSettings` §6 (ครอบ settings core `loadSettingsForm`/`setSettings` ตามแบบ `dorm/policy.ts`) |
| `src/lib/core/settings/types.ts` · `form.ts` · `defs/rooms.ts` | เพิ่มอย่างเดียว | §6.1 `unitTypes` + `enumLabelsTh` + helper hotel() (ห้ามแตะคีย์หอ) |
| `src/lib/modules/hotel/index.ts` | ใหม่/เพิ่ม | facade: export ของ 3 ไฟล์ข้างบน (โมดูลอื่น import ผ่านนี่เท่านั้น) |
| `src/lib/modules/hotel/actions.ts` | เพิ่ม | actions §4.4 ต่อท้าย (บล็อก `// SVC H.1 ▸ … ◂`) · ของเดิมห้ามแตะ |
| «src/components/hotel/RatesScreen.tsx» + `rates-shared.ts` | ใหม่ (`'use client'`) | จอราคา §5 (ภาพ 15) |
| «src/components/hotel/HotelSettings.tsx» + `hotel-settings-shared.ts` | ใหม่ | จอตั้งค่าโรงแรม §6 (แบบหอ 17: การ์ดกริด 3 คอลัมน์) |
| «src/app/app/u/[unitSlug]/hotel/rates/page.tsx» · «…/hotel/settings/page.tsx» | ใหม่ | หน้า + ด่าน HOTEL |
| `src/components/hotel/hotel-tabs-shared.ts` + `HotelTabs.tsx` + `src/app/app/u/[unitSlug]/hotel/layout.tsx` | ใหม่ | แถบแท็บโรงแรมตามภาพ 08/09/15: ปฏิทินห้อง · การจอง · หน้าเคาน์เตอร์ · แม่บ้าน · **ราคา** · รายงาน · **ตั้งค่า** (แท็บที่ยังไม่มีหน้า = ซ่อนจนใบนั้นมา · ตามสิทธิ์ · แบบ `DormTabs`) |
| `src/app/app/u/[unitSlug]/page.tsx` | เพิ่ม | `UNIT_NAV.HOTEL` + `/hotel/rates` `/hotel/settings` |
| «scripts/svc-qc-hotel-rates-scene.mts» | ใหม่ | ฉากภาพ §8 |
| «docs/sds/modules/hotel.md» | ใหม่ (ผู้คุมเติมทีหลังได้) | §ราคา: สูตร resolution + ภาษี + ตัวอย่างตัวเลขฉาก |

ห้ามแตะ: `hotel/service.ts` (ยกเว้น **ไม่ต้อง** — ใบนี้ไม่เปลี่ยนการจอง) · `modules/rooms/**` · settings core (ใช้ API ที่มี) · `prisma/**` · oracle/ข้อสอบ · defs/rooms.ts (คีย์ครบจาก H.0 — ขาดอะไร = ตีกลับไปผู้คุม ไม่เพิ่มเอง)

## 2. มติของใบนี้ (ผู้เขียนข้อสอบตัดสิน)
1. **ลำดับคิดราคา 1 คืน** (S:826 + override): (1) `HotelRateOverride` ตรง (roomType, ratePlan, date) → ไม่มี → (roomType, null, date) ⇒ `priceSource=OVERRIDE` (2) ฤดู ACTIVE ครอบวัน priority สูงสุด (เสมอ → dateStart ล่าสุด) → `HotelRate(plan, type, season)` → ไม่มี → `HotelRate(plan, type, null)` ⇒ ช่อง: วันอยู่ใน `HotelHoliday` และ `priceHolidaySatang` ≠ null → holiday · `dayOfWeek ∈ rooms.hotel.weekendDays` → weekend · อื่น weekday ⇒ `RATE` (3) ไม่มีแถว HotelRate เลย → `rooms.hotel.baseRate` (chain RT_RP) + `dayOfWeekAdjustBp[dow]` ⇒ `FALLBACK` · baseRate null ⇒ `null` = **ขายไม่ได้** (storefront ซ่อน · จอราคาเตือน) (4) + `extraBedPriceSatang × extraBeds`
2. dayOfWeek คิดจากวันที่ YYYY-MM-DD แบบ pure (ไม่ใช้ `getDay()` ของ Date เวลาเครื่อง — กับดัก getDay ไทย) · ฤดู `dateStart ≤ d ≤ dateEnd` รวมวันจบ
3. **quoteStay** = ราคาทุกคืน `[checkIn, checkOut)` + `nightsTotal` · คืนใดเป็น null ⇒ `{ok:false, error:"NO_RATE", dates:[…]}` · `minNights` (แผน > ค่าตั้ง RP) ไม่ถึง ⇒ `MIN_NIGHTS` · `maxNights` เกิน ⇒ `MAX_NIGHTS` · `closedToArrival` วันเข้า ⇒ `CLOSED_TO_ARRIVAL` · `maxAdvanceBookingDays` ⇒ `TOO_FAR`
4. **มัดจำ** `depositFor(quote, policy)`: แผนราคาเป็นผู้กำหนด (`HotelRatePlan.depositKind/Value`) · แผนไม่ระบุ (kind null) → ค่าตั้ง `rooms.hotel.deposit` (chain U_RP) · FIRST_NIGHT = ราคาคืนแรก**รวมทุกห้องในกลุ่ม** (S:218 — รับ quotes[]) · PERCENT = bp ของยอดรวม ปัดตาม rounding · FIXED_AMOUNT = amountSatang · FULL = ยอดรวม · NONE = 0
5. **คืนเงินเมื่อยกเลิก** `refundFor({paidSatang, checkInDate, cancelAt(YYYY-MM-DD ไทย), rules})`: daysBefore = จำนวนวันจาก cancelAt ถึง checkInDate (ปัดลง · วันเดียวกัน = 0) · เลือกกฎ `daysBefore ≥ rule.daysBefore` ที่ daysBefore มากสุด · ไม่มีกฎเข้า ⇒ 0 · กฎว่าง ⇒ 0 · คืน = `paid × refundBp / 10000` ปัดลง · กฎมาจาก `HotelCancelRule` ของแผน → ไม่มี → ค่าตั้ง `rooms.hotel.cancelPolicy` (RP) · **snapshot**: H.3 จดกฎลง `policySnapshot` — `refundFor` รับ rules ที่ส่งมา ไม่อ่าน DB
6. **ภาษี** `taxLines(subtotalSatang, tax)` (Q1): `mode=INCLUSIVE` ⇒ บรรทัดเดียว ยอดรวม · `vatIncludedSatang = round(subtotal × vat / (10000+vat))` รายงานเฉย ๆ (ไม่บวก) · `mode=EXCLUSIVE` ⇒ `SERVICE_CHARGE = subtotal × scBp/10000` → `TAX = (subtotal + sc) × vatBp/10000` → total · ปัดทุกขั้นตาม rounding · ค่ามาจาก `taxSnapshot` ของการจอง (H.3 จด) ไม่ใช่ค่าตั้งสด · จอราคาแสดงหมายเหตุ "ราคารวมภาษี" / "ยังไม่รวม VAT 7% + SC 10%" ตามโหมด
7. **แก้มือรายวัน** = `HotelRateOverride` · ใส่ `reason` + `setById` · ภาพ 15 ช่อง "แก้มือ" ไฮไลต์ · ลบ override = กลับราคาตาราง · ไม่มีการแก้ "ย้อนหลัง" กระทบการจองเดิม (S:1114 — nights snapshot แล้ว)
8. **แผนราคาเริ่มต้น**: ทุกหน่วย HOTEL ต้องมีแผน `isDefault` 1 แผน · ไม่มี ⇒ `rates.ts` สร้าง `STANDARD` ให้อัตโนมัติครั้งแรกที่เปิดจอราคา (code จาก `rooms.hotel.defaultRatePlan`) · archive แผน default ⇒ ปฏิเสธ `DEFAULT_PLAN` · archive แผน/ฤดูที่มี nights อ้าง = archive เท่านั้น ไม่ลบ (S:1114)
9. **matrix บันทึกทั้งชุด** `saveRates(ratePlanId, rows[])` = upsert ใน tx (unique NULLS NOT DISTINCT ⇒ findFirst+create/update ใน tx · ไม่ใช้ upsert ของ Prisma) · ราคาลบ ⇒ `INVALID_PRICE`
10. **ห้องเหลือขาย** ในจอราคา (ภาพ 15 "เหลือขาย") = `availability` สูตร S §4.2 ผ่าน facade rooms (`occupancyRange`) + `HotelBookingNight.counted` — ใบนี้แสดงอย่างเดียว ไม่เขียน

## 3. `pricing.ts` (pure · ข้อสอบยิงตรง)
```ts
export type PricingContext = {
  weekendDays: number[]; rounding: RoundingMode; today: string;          // วันที่ทุกตัว = "YYYY-MM-DD" ไทย
  roomTypes: Record<string, { baseOccupancy: number; maxOccupancy: number | null; extraBedAllowed: boolean; extraBedPriceSatang: number }>; // คีย์ roomTypeId (มติ 7 พ.ย. #2)
  plans: RatePlanRow[]; seasons: SeasonRow[] /* +minNights */; holidays: Set<string>; rates: RateRow[]; overrides: OverrideRow[]; // ชื่อฟิลด์ = คอลัมน์ prisma
  fallback: Record<string, { baseRateSatang: number | null; dayOfWeekAdjustBp: number[] }>;                  // คีย์ roomTypeId (ค่าตั้ง chain RT_RP แก้ด้วยค่าแผนที่ขอ · มติ #3)
};
// limits ของ quoteStay = { minNights: number|null; maxNights: number|null; closedToArrival: boolean; maxAdvanceBookingDays: number } · ขั้นต่ำคืนที่ใช้จริง = max(แผน, ฤดูที่ครอบคืนแรก, limits.minNights) (มติ #4)
// policy ของ depositFor = รูปค่าตั้ง { kind, percentBp?, amountSatang? } · resolveNightPrice คืน seasonId ของฤดูที่พบ (null เมื่อตกแถวปกติ · ไม่บังคับในข้อสอบ #7)
export function resolveSeason(seasons, date): SeasonRow | null
export function resolveNightPrice(ctx, { roomTypeId, ratePlanId, date, extraBeds? }): { priceSatang: number; source: "RATE"|"OVERRIDE"|"FALLBACK"; seasonId: string|null; bucket: "weekday"|"weekend"|"holiday"|null } | null
export function quoteStay(ctx, { roomTypeId, ratePlanId, checkIn, checkOut, extraBeds?, limits }): QuoteOk | QuoteFail
export function depositFor(quotes: QuoteOk[], policy: DepositPolicy, rounding): number
export function refundFor(i: { paidSatang; checkInDate; cancelAt; rules: CancelRule[] }): { refundSatang; ruleUsed: CancelRule|null; daysBefore: number }
export function taxLines(subtotalSatang, tax: { mode; vatBp; serviceChargeBp }, rounding): { lines: {type:"SERVICE_CHARGE"|"TAX"; amountSatang}[]; totalSatang; vatIncludedSatang }
```
ตัวเลขฉาก (README ข้อสอบ · ฟิกซ์เจอร์ bansuan-hotel · **`expect.superiorHoliday` = สงกรานต์ 13 เม.ย. นอกฤดู 99,000 · ซูพีเรีย 5 ธ.ค. (วันหยุดในไฮซีซัน · holiday null ⇒ ช่องเสาร์อาทิตย์ ×1.2) = 118,800** — มติ #1): STANDARD · ดีลักซ์ weekday 1,290 / weekend 1,490 · แฟมิลี 1,890 / 2,190 · ซูพีเรีย 990 ทุกวัน · ฤดู "ไฮซีซัน" 1 ธ.ค.–28 ก.พ. +20% ทุกประเภท (priority 10) · "ปีใหม่" 29 ธ.ค.–2 ม.ค. ราคาเฉพาะ (priority 20 · minNights 2) · วันหยุด 5 ธ.ค. · override ดีลักซ์ 14 พ.ย. = 1,690 (ภาพ 15) · แผน "รวมอาหารเช้า" +200/คน/คืน (`includeBreakfast` + ราคาแยก matrix) · แผน "จ่ายก่อนไม่คืนเงิน" −10% refund 0 ทุก tier

## 4. `rates.ts` (server · ทุกฟังก์ชันรับ `(actor, ctx, input)` · ด่าน HOTEL + สิทธิ์ · ข้ามร้าน/หน่วย ⇒ NOT_FOUND)
- สัญญาร่วม (มติ 7 พ.ย. #6): ทุกฟังก์ชันเขียน `(actor, ctx: {tenantId}, input: {unitId,…})` · ล้มเหลว `{ok:false, code, reason}` (reason ไทย) · ไม่มีสิทธิ์ = code `FORBIDDEN` · `loadPricingContext`/`ratePreview` รับ `(ctx, unitId, …)` ไม่รับ actor (หน้าเรียกหลังตรวจสิทธิ์เอง) · `listRatePlans` คืน `cancelRules[]` ต่อแผน
- `listRatePlans` · `saveRatePlan` (สร้าง/แก้ · code unique ต่อหน่วย · `setDefault`) · `archiveRatePlan` · `saveCancelRules(ratePlanId, rules[])` (แทนทั้งชุด · ตรวจ daysBefore ไม่ซ้ำ · refundBp 0..10000)
- `listSeasons` · `saveSeason` · `archiveSeason` · `saveHolidays(dates[], name)` bulk + `removeHoliday`
- `getRateMatrix(ratePlanId)` → rows ประเภทห้อง × ฤดู(+null) · `saveRates(ratePlanId, rows[])` (มติ 9)
- `setOverride({roomTypeId, ratePlanId?, date, priceSatang, reason})` · `clearOverride`
- `loadPricingContext(ctx, unitId, {from, to})` → `PricingContext` (โหลดครั้งเดียวต่อคำขอ · N+1 ห้าม · ข้อสอบนับคิวรี ≤ 8)
- `ratePreview(ctx, unitId, {from, to, ratePlanId?})` → `{days: [{date, byType: {roomTypeId: {priceSatang, source, remaining}}}]}` (ปฏิทินราคา 14 วัน · remaining ผ่าน facade rooms)
- สิทธิ์: อ่าน = `hotel.rates.read` · เขียนทุกตัว = `hotel.rates.write` · AuditLog ทุกการเขียน (before/after ตาม CC §8)
- 4.4 actions: `saveRatePlanAction` `archiveRatePlanAction` `saveCancelRulesAction` `saveSeasonAction` `archiveSeasonAction` `saveHolidaysAction` `removeHolidayAction` `saveRatesAction` `setOverrideAction` `clearOverrideAction` `saveHotelSettingsAction` `resetHotelSettingAction` — `assertHotelCan` เดิม + ด่าน HOTEL

## 5. จอ ราคา (ภาพ 15 · `/hotel/rates` · desktop หลัก + มือถือ 390 เลื่อนแนวนอนมีตัวบอก)
- แท็บย่อย 4: **ปฏิทินราคา** (ประเภท × 14 วัน · ช่อง = ราคา + เหลือขาย · ช่องแก้มือไฮไลต์ · "เต็ม" สีแดง · คลิกช่อง = แก้มือ (ราคา+เหตุผล) / ล้าง) · **แผนราคา** (การ์ดต่อแผน: ชื่อ · สูตรจากมาตรฐาน · มัดจำ · ขั้นบันได · ช่องทาง · ปุ่มเพิ่มแผน) · **ฤดู · วันพิเศษ** (รายการฤดูเรียง priority · วันหยุดนักขัตฤกษ์ไทยปุ่ม "ใช้ปฏิทินวันหยุดไทย" = bulk ปีปัจจุบัน จากรายการคงที่ใน `rates-shared.ts` แก้ได้) · **กติกา** (minNights/closedToArrival/weekendDays/วิธีปัด — ลิงก์ไปตั้งค่า)
- ตารางเลื่อนแนวนอนบนมือถือต้องมี attribute **`data-scroll-hint`** บนกล่องที่เลื่อน + ข้อความ "เลื่อนดูวันถัดไป →" (หนี้ B.12 · มติ #9 ชื่อตายตัว)
- ปุ่ม "ปรับราคาหลายวัน" = ตั้ง override ช่วงวัน (loop ใน tx เดียว ≤ 62 วัน)
- ป้ายโหมดภาษีใต้หัวข้อ (มติ 6) · ไทยทั้งหมด · ตัวเลขมีจุลภาค ไม่มีทศนิยมถ้า .00
- สิทธิ์ read อย่างเดียว ⇒ ช่องกดไม่ได้ + ไม่มีปุ่มเขียน (ไม่ใช่แค่ 403 ตอนกด)

## 6.1 เปิดคีย์โรงแรม "ตามประเภทหน่วย" (ย้ายจาก H.0 · มติ 7 พ.ย.)
- settings core (`src/lib/core/settings/{types.ts,form.ts}` — เพิ่ม**อย่างเดียว**): `SettingDef.unitTypes?: ("HOTEL"|"DORM"|"BOOKING"|"POS")[]` · `loadSettingsForm` รับ `unitType` และข้ามคีย์ที่ `unitTypes` ไม่รวมประเภทหน่วยนั้น · คีย์ที่ไม่ประกาศ unitTypes = ทุกประเภท (พฤติกรรมเดิมคงทุกไบต์)
- `defs/rooms.ts`: helper `hotel()` เปลี่ยนจาก `hiddenUntil: "PHASE_H"` เป็น `unitTypes: ["HOTEL"]` (คีย์หอไม่ประกาศ = เดิม) · ใส่ `enumLabelsTh` ครบทุกคีย์ enum ของโรงแรม (noShow · ota.roomScope · ota.onConflict · bookingMode · tax.mode · deposit.kind · notify.channel · securityDeposit.appliesTo …)
- หน้าหอ `/dorm/settings` ส่ง `unitType: "DORM"` ⇒ ไม่เห็นคีย์โรงแรม (r0.4 D-1 คงเขียว) · หน้าโรงแรม `/hotel/settings` ส่ง `"HOTEL"` ⇒ เห็นเฉพาะกลุ่ม hotel/ota + คีย์ร่วม (rooms.money.rounding · rooms.locale.docLanguage · rooms.legal.mode แสดงอ่านอย่างเดียว)
- ชั้น RATE_PLAN เปิดได้จากจอโรงแรมเท่านั้น (ช่อง "ตั้งเฉพาะแผนราคา" เลือกแผน ACTIVE ของหน่วย)
- regression ที่ต้องเขียว: qc-svc-r0.3 · r0.4 · d.13 (หน้าหอไม่เปลี่ยน)

## 6. จอ ตั้งค่าโรงแรม (`/hotel/settings` · แบบหอ 17 = การ์ดกริด 3 คอลัมน์ + เมนูซ้าย)
การ์ด: **เช็กอิน/เอาต์** (เวลา · dailyHousekeeping · inspectionRequired) · **การจอง** (bookingMode · hold 2 ค่า · maxAdvance · codePrefix · noShow) · **มัดจำ & ยกเลิก** (deposit kind/ค่า · cancelPolicy ตาราง · ป้าย "แผนราคาทับค่านี้ได้") · **ภาษี** (tax.mode · vatBp · scBp · invoiceFromPos — เตือนเมื่อสลับโหมด: "การจองเดิมใช้ค่าตอนจอง") · **เงินประกันห้อง** (enabled · จำนวน · appliesTo) · **ผู้เข้าพัก/PDPA** (retainYears · maskIdForStaff · aiIdReader (ปิด+บอกต้องเชื่อมตัวต่อ) · rr3OnScreen · tm30ReminderHours) · **แจ้งแขก** (notify.channel) · **หน้าจอง** (storefront.customDomain + ลิงก์ `/app/settings/domain`) · **แม่บ้าน** (checklist ต่อประเภท · minibar — แสดงเฉย ๆ H.6 เปิดแก้)
- `loadHotelSettings(actor, ctx, {unitId})` → `{cards: [{labelTh, fieldKeys}], form, canEdit}` · `saveHotelSettings(actor, ctx, {unitId, changes: SettingChangeInput[]})` (มติ #6) = `loadSettingsForm(domain "rooms", group "hotel"/"ota")` + diff จากแม่แบบ · `saveHotelSettings` = `setSettings` ชั้น UNIT (ROOM_TYPE/RATE_PLAN ผ่านช่อง "ตั้งเฉพาะ…" เหมือนหอ) · ทุกค่ามีปุ่ม "คืนค่าเริ่มต้น" (`resetSetting`) · สิทธิ์ `hotel.settings.edit` · ownerOnly ตาม def
- ค่า MONEY/LEGAL แสดงป้าย + ประวัติ (`settingHistory`) ตามแบบหอ 17

## 7. เมนู/แท็บ
`HotelTabs` (แบบ `DormTabs` ทุกประการ · `data-hotel-tabs`) ลำดับตามภาพ: ปฏิทินห้อง `/hotel/calendar` (H.2) · การจอง `/hotel/reservations` (มี) · หน้าเคาน์เตอร์ `/hotel` (มี · ป้ายใหม่) · แม่บ้าน `/hotel/housekeeping` (H.6) · ราคา `/hotel/rates` · รายงาน `/hotel/reports` (H.7) · ตั้งค่า `/hotel/settings` · แท็บที่หน้ายังไม่มี = ไม่แสดง (ทะเบียน `HOTEL_TABS` มี `available: boolean` ใบหลังเปิด) · ตามสิทธิ์: ราคา ⇔ rates.read · ตั้งค่า ⇔ settings.edit

## 8. ฉากภาพ «scripts/svc-qc-hotel-rates-scene.mts» (builder · แบบ `svc-qc-dorm-home-scene.mts`)
- `loadSvcQcEnv` · อ่าน `SQC_HOTEL_RATES` เท่านั้น · เขียน: แผน STANDARD(default)/BREAKFAST/NONREF + กฎยกเลิก · ฤดู 2 · วันหยุด · matrix ครบ 3 ประเภท · override 14 พ.ย. (วันที่ของฉาก = เดือนปัจจุบันไทย เหมือนฉากหอ: คำนวณ "14 ของเดือนหน้า" ถ้าวันนี้ > 14) · การจองจำลองเพื่อ "เหลือขาย" ไม่สร้าง (H.3) — ใช้การจองที่มีจากฟิกซ์เจอร์/oracle
- idempotent `SCENE_SUMMARY` · `--clear` ลบเฉพาะแถวฉาก — ตาราง H.0 ไม่มี createdById ⇒ ระบุแถวฉากจาก code/ชื่อ/reason ตามฟิกซ์เจอร์ (`SQC_HOTEL_RATES.mark` ใส่ใน `reason` ของ override · `description` ของแผน · `name` ของฤดู/วันหยุดตรงฟิกซ์เจอร์) (มติ #8)
- ภาพ: `visual-svc h.1 --user owner` (rates ×4 แท็บย่อย · settings) + `--user frontdesk` (read-only) → PARITY ภาพ 15 ผู้คุมตัดสิน

## 9. เกณฑ์รับ · regression · X · หนี้
- «qc-svc-h.1.mts» ผ่านทุกข้อ · probe-h1-b breach 0 · typecheck + fitness 2 โหมด · ภาพ PARITY 15 (+ settings เทียบหอ 17 เชิงโครง)
- G: `qc-svc-h.0` · `qc-hotel-money` `qc-hotel-public` `qc-hotel-refund` (เส้นจองเดิมไม่เปลี่ยน — ยังคิด baseRate×คืน จนถึง H.3) · `qc-svc-r0.3` `r0.4` (settings) · `qc-svc-d.13` (แท็บหอไม่เปลี่ยน) · `qc-svc-smoke`
- X: X1 ข้ามร้าน/หน่วย (แผนราคาร้าน B · roomType หน่วยอื่น ⇒ NOT_FOUND) · X9 สิทธิ์ read/write แยก · X10 ไม่มี PII ในโมเดลราคา
- ผู้ตรวจ 2 รอบ (เงิน): รอบ 1 = pricing pure (ขอบ: ฤดูทับ · วันหยุดในฤดู · override ทับฤดู · ปีใหม่ข้ามปี · ปัดเศษ PERCENT/EXCLUSIVE · refund วันเดียวกัน/ก่อนวันเข้า 0 วัน/ยกเลิกหลังเช็กอิน) · รอบ 2 = rates.ts (tx/unique/N+1/สิทธิ์/AuditLog)
- หนี้ที่รู้: ราคาตามจำนวนผู้เข้าพัก (occupancy-based) 🔜 · โปรโมโค้ดระดับแผน 🔜 · ภาษีแยกบนบิล POS จริง = H.5

## 10. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-h.1.mts» · เป้า ≥ 90 ข้อ
PC (ฟิกซ์เจอร์ · H.0 ตาราง · ฉาก) · **P (pricing pure) ≥ 30**: resolution 4 กรณี S:1133 + override + fallback + null · dow ไม่ใช้ getDay · ฤดูรวมวันจบ · quote ขอบ (MIN/MAX/CTA/TOO_FAR/NO_RATE) · deposit 5 kind + กลุ่ม FIRST_NIGHT รวมทุกห้อง · refund ขั้นบันได 3 tier + ขอบ · tax 2 โหมด + round-trip 1,234.50 (S:1154) · **R (rates.ts) ≥ 20**: CRUD · default plan auto/ห้าม archive · unique NULLS NOT DISTINCT · saveRates tx ล้มทั้งชุด · override set/clear · N+1 ≤ 8 คิวรี · AuditLog · **B/X ≥ 8**: ด่าน HOTEL · ข้ามร้าน · สิทธิ์ · **S (ค่าตั้ง) ≥ 8**: scope RATE_PLAN ใช้ได้จริง · reset · ownerOnly · history · **U (UI สถิต) ≥ 10**: ไทยทั้งหมด · แท็บตามสิทธิ์ · read-only ไม่มีปุ่มเขียน · มือถือมีตัวบอกเลื่อน (หนี้ B.12 ห้ามซ้ำ) · **V/Z**: ฉาก idempotent · ภาพ 2 บทบาท

## 11. มติผู้คุมต่อคำถามผู้เขียนข้อสอบ (7 พ.ย. · ข้อสอบ 120 ข้อ @e3c0c32f9)
1 superiorHoliday = 13 เม.ย. · 5 ธ.ค. ซูพีเรีย 118,800 (§3) · 2 เตียงเสริมผ่าน `ctx.roomTypes` (§3) · 3 fallback ต่อ roomTypeId (§3) · 4 `HotelSeason.minNights` เพิ่มใน H.0 §2.5 + quote ใช้ max(แผน, ฤดู, limits) · 5–7 รูปข้อมูลตามที่ข้อสอบตั้ง (§3/§4) · 8 mark ฉากจาก code/ชื่อ/reason · 9 `data-scroll-hint` ชื่อตายตัว · 10 แท็บ available ตาม §7 · PC-4 = reseed l1 (ผู้คุมทำ)
