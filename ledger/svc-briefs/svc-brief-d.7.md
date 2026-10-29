# ใบสั่ง D.7 — ค่าน้ำไฟทุกโหมด + หน้ากฎหมาย/VAT (ภาพ หอ 10) · ตรวจ **เข้ม** (กฎหมาย สคบ. · เงิน)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.7 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §3 (แถวค่าน้ำ-ไฟ · วิธีคิด "อัตราที่การไฟฟ้าเรียกเก็บ" · VAT) · A4 · ภาคผนวก ก #9–15 #19–21 · ภาพ `ledger/design-dorm/10-settings-law.png` + README (ไฟ ฿19,824.00 ÷ 4,200 = ฿4.72 · น้ำ ฿3,840.00 ÷ 240 = ฿16.00 · ห้อง 204 125 หน่วย ฿590.00 · 6 หน่วย ฿96.00 · 207 126 หน่วย ฿594.72)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1.5 (`ownerOnly` · `LEGAL` = เจ้าของ) §1.7 (ตัวตรวจถูกเรียกซ้ำที่จุดต้นทุน = ใบนี้) §1.8 (หน้าห่อ + ทะเบียน) + **ภาคต่อ 28 ต.ค.** (ข้ามคำเตือนกฎหมายต้องผ่านเจ้าของ · ตรวจ OWNER จาก Membership สด)
> ส่งต่อจากใบก่อน: D.1 "ส่งต่อใบอื่น" (params กฎหมายระดับแพลตฟอร์มเท่านั้น · OUT_OF_SCOPE ต้องมีหลักฐานเมื่อ `legalScope` บอกว่าอยู่ในขอบเขต) · D.0 (`DormUtilityRate` unique NULLS NOT DISTINCT ⇒ findFirst+create ใน tx · `DormAuthorityTariff` global เขียนเฉพาะ backoffice) · D.6 §10 (อ่าน `periodUsage` · MAIN = ต้นทุนตึก) · R0.3 (`atCostPoint` ข้ามตอนบันทึกค่าตั้ง ⇒ ตรวจซ้ำที่นี่) · `ledger/wo-notes/svc-r0.8-carry.md` "ภาพเทียบแบบ R0.4" (หอ 10 ต้องเป็นหน้าการ์ดตามภาพ ไม่ใช่ฟอร์มยาว)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.7.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.7.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน) · ต่อท้าย `--no-regression` ข้ามหมวด G ระหว่างทำ (iso.sh ทิ้ง env) · SKIP ที่ยอมได้ระหว่างทำ = V-1/V-2 (ไม่มี QC_BASE) · Q-* (ร้าน svcqc ยังไม่ seed) · G-* (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/schema`** · เลน l3 · temp ขึ้นต้น `svc-d7-` · รายงานต่อข้อ (id → ผล)
> **ไม่มี migration**: ใช้ `DormUtilityRate` (บิลรายเดือน + `legalCheck` Json) · `DormAuthorityTariff` (อ่านอย่างเดียว) · `DormLease.coTenants` (นับคน) · `HotelRoomType.areaSqm` (พื้นที่) · `FileAsset` (รูปบิล/หลักฐาน) — ขาดคอลัมน์ = หยุดถามผู้คุม

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/dorm/utility.ts» (ใหม่) | §3.1–§3.5 บิลการไฟฟ้า/ประปา · ค่าน้ำไฟทุกโหมด · ตัวตรวจรายเดือน · ด่านออกบิล · ยอมรับคำเตือน — ผ่าน `tenantDb` เท่านั้น (ห้าม `import { prisma }` · F5.1) · **สูตรเงินทุกตัวเรียก D.1** (`actualCostRate` `utilityLine`/`utilityCharge` `allocateShared` `computeBill` `divRoundHalfUp`) · **ตัวตรวจทุกตัวผ่าน `evaluateLegal`** (ห้ามเขียนเงื่อนไขกฎหมายซ้ำ) |
| «src/lib/modules/dorm/law.ts» (ใหม่) | §3.6 `setDormLegalMode` · §3.7 `dormLawModel` (อ่าน `loadSettingsForm` + `legalScope`) |
| `src/lib/modules/dorm/index.ts` | เพิ่มบรรทัด export §3 (ของ D.6 ห้ามแตะ) |
| «src/components/dorm/UtilityLawSettings.tsx» (ใหม่) | จอ §5 · `'use client'` |
| «src/components/dorm/DormSettingsNav.tsx» (ใหม่) | เมนูซ้าย 5 หมวดตามภาพ 10 (หมวดที่ยังไม่มีหน้า ⇒ ลิงก์ `/dorm/settings` — D.13 ทำต่อ) |
| «src/app/app/u/[unitSlug]/dorm/settings/utility/page.tsx» (ใหม่) | หน้าห่อ §5 (server) |
| «src/app/app/u/[unitSlug]/dorm/settings/utility/actions.ts» (ใหม่) | `"use server"` §5 |
| `src/lib/core/permissions.ts` | คีย์ `dorm.bill.run` ป้ายไทย "เตรียมรอบบิล · ใส่บิลค่าน้ำไฟจากการไฟฟ้า/ประปา" (คีย์หออื่น = D.13 · ห้ามเพิ่มล่วงหน้า) |
| `src/lib/core/settings/defs/rooms.ts` | **เพิ่ม 2 def เท่านั้น** §4 + ต่อท้าย `SNAPSHOTS.bill` 2 คีย์นี้ (def เดิมห้ามแก้) |
| `scripts/fitness.mts` | เฉพาะบรรทัด `ALLOWED_EDGES` ที่ใช้จริง (คาดว่าไม่ต้องเพิ่ม: rooms มีแล้ว · core/storage ไม่ใช่โมดูล) + คอมเมนต์ `// SVC D.7` |
| «scripts/svc-qc-utility-scene.mts» (ใหม่) | ฉากภาพ §6 |

ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` — `SQC_VISUAL_SPECS["d.7"]` (หน้า `/dorm/settings/utility` · ถ่ายด้วย `owner` และ `fai`)

ห้าม: migration · เขียน `DormAuthorityTariff` (อ่านอย่างเดียว · ตารางรัฐใส่โดย backoffice/สคริปต์แพลตฟอร์ม) · แก้ `calc.ts` / `th-rental-2568.ts` (D.1 · สูตร/ตัวตรวจใช้ตามที่มี) · แก้ `meter.ts` / `MeterWalk.tsx` (D.6 — กล่อง "ประมาณค่าน้ำไฟ" ในจอ 03 = ส่งต่อ D.8 ดู §9) · แก้ชิ้นกลาง `core/settings/{service,form,registry,actions}.ts` · `components/settings/*` · ออกใบแจ้งหนี้/แตะ `DormBill` (D.8) · คำต้องห้าม สคบ. · `any` · `getDay()` ดิบ · params กฎหมายจากร้าน (ส่งให้ `evaluateLegal` เฉพาะ `mode`/`outOfScopeReason` — params = ค่าเริ่มของแพลตฟอร์ม)

## 2. ศัพท์ · กติกา
- **งวด** `periodKey` "YYYY-MM" = เดือนของบิลการไฟฟ้า/ประปา = งวดเลขมิเตอร์ของ D.6 (บิลรอบไหนใช้งวดไหน = `rooms.billing.utilityTiming` ของ D.8)
- **ห้องที่คิดเงินในงวด P** = ห้อง `active` ของหน่วยที่มี occupancy `LEASE`/`STAY` (active) ซ้อนช่วง `[P-01, วันแรกของงวดถัดไป)` (อ่านผ่าน `occupancyRange` ของ facade rooms) · ห้องว่างไม่มีแถว (ไม่ถูกเฉลี่ย ไม่ถูกคิด)
- **ขอบเขตบิล** ของห้อง = แถว `DormUtilityRate` (หน่วย, `room.buildingId`, kind, P) ถ้ามี · ไม่มี ⇒ แถว (หน่วย, `null`, kind, P) · **กลุ่ม** = (kind, buildingId ของขอบเขตที่ใช้ — ไม่มีบิลเลย ⇒ `room.buildingId`)
- **ค่าตั้งที่อ่าน** (ทุกครั้ง · ห้ามแคชข้ามการเรียก · refs ห้องมี `unitId/buildingId/roomTypeId/roomId`): `rooms.utility.<k>.metering` (ห้อง) · `.method` `.fixedRate` `.tariffRef` (อาคาร) · `.flat` (ประเภทห้อง) · `rooms.utility.minimum` · `rooms.utility.sharedBasis` (อาคาร) · `rooms.utility.tariffTable` · `rooms.vat.registered` `rooms.vat.pricesIncludeVat` `rooms.vat.taxKinds` · `rooms.legal.mode` `rooms.legal.outOfScopeReason` (หน่วย) — `k` = `elec`|`water`
- **VAT ของน้ำไฟ** `utilVat(kind)` = `{registered, pricesIncludeVat}` เมื่อ `taxKinds[kind] === "VAT7"` ไม่งั้น `null` (ตรง `buildDormBill` ของ D.1) · **ยอดที่ผู้เช่าจ่ายจริง** (`grossSatang`) = `computeBill({ lines: [{ code: kind, labelTh, amountSatang, taxKind: taxKinds[kind] }], vat }).totalSatang` (D.1)
- **คนในห้อง** (ฐาน PERSON) = ต่อ occupancy: `DormLease` ที่ `occupancyId` = occupancy นั้น หรือ (`refType "DormLease"`, `refId`) ⇒ `1 + coTenants.occupants.length` (รูปตามใบ D.5 §3: `{ occupants: {name, phone}[]; vehicles: {plate, kind, note}[] }` · รถไม่นับ · `coTenants` null/รูปผิด ⇒ 1) · ไม่มีสัญญา ⇒ 1 · **พื้นที่** (ฐาน AREA) = `round(HotelRoomType.areaSqm × 100)` (ไม่มี ⇒ 0 = ไม่แบก)
- **ตารางอัตรา**: `rooms.utility.tariffTable` (ชั้น TENANT · มีรายการของ kind นั้น) ชนะ ⇒ ใช้ tiers ของ kind นั้น (`ftE4` = ของรายการแรกที่มี ไม่มี = 0) · ไม่งั้น `rooms.utility.<k>.tariffRef` "AUTH:CODE" ⇒ `authorityTariffFor({authority, kind, tariffCode, at: "<P>-01"})` · ไม่มีทั้งคู่ ⇒ `TARIFF_MISSING` · `ftE4 < 0` ⇒ `TARIFF_NEGATIVE_FT` (calc D.1 ยังไม่รับ Ft ติดลบ — หนี้ §9) — ทั้งสองกรณี = ไม่มีฐานคิด (บล็อกทุกโหมด)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
export type UtilityCtx = { tenantId: string; actorUserId?: string | null };
type Kind = "ELEC" | "WATER";
type Fail = { ok: false; code: string; reason: string };   // reason ไทยไม่ว่าง ไม่โทษผู้ใช้ · ห้าม throw (ยกเว้นบั๊กจริง)
```
ทุกฟังก์ชัน: หน่วยต้องเป็น `BusinessUnit` ของ `ctx.tenantId` และ `type = "DORM"` ไม่ใช่ ⇒ `NOT_FOUND` (ฟังก์ชันเขียน/ด่าน) · ผลว่าง (`utilityCharges`) · `null` (`dormLawModel`) — **ไม่บอกว่ามีอยู่ (X1)**

### 3.1 ใส่บิลการไฟฟ้า/ประปา (ต้นทุนจริงต่ออาคาร)
```ts
recordAuthorityBill(ctx, input: { unitId: string; kind: Kind; periodKey: string; buildingId?: string | null;
                                   billSatang: number; units?: number | null; photo?: { data: Uint8Array; contentType: string } | null },
                    deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; now?: Date })
→ Promise<{ ok: true; rateId: string; status: "CREATED" | "UPDATED" | "UNCHANGED"; units: number; unitsSource: "BILL" | "MAIN_METER";
            costRateSatangPerUnit: number; legal: UtilityLegalGroup } | Fail>
```
- ตรวจ: kind นอก 2 ค่า · periodKey ผิดรูป · `billSatang` ไม่ใช่จำนวนเต็ม 0…1,000,000,000 · `units` ส่งมาแต่ไม่ใช่จำนวนเต็ม > 0 ⇒ `INVALID_INPUT` (ไม่มีแถว) · `buildingId` ไม่ใช่อาคารของหน่วย ⇒ `NOT_FOUND`
- `units` ไม่ส่ง ⇒ หน่วยของมิเตอร์ **MAIN** kind เดียวกัน `buildingId` ตรงกัน (`listMeters` + `periodUsage` ของ D.6) ที่ `units !== null && !held` ⇒ `unitsSource "MAIN_METER"` · ไม่มี ⇒ `UNITS_UNKNOWN` (ไม่มีแถว)
- **`costRateSatangPerUnit` = `actualCostRate({ billSatang, units })` (ไม่ส่ง vat · ปัดลง)** = "ต้นทุนจริงต่อหน่วย" ที่จอแสดง (฿4.72) → เก็บ `rateSatangPerUnit` · อัตราที่คิดผู้เช่าจริง (ถอด VAT/เศษ) คิดใน §3.2
- เขียนแถว (หน่วย, buildingId ?? null, kind, P): `authorityBillSatang` `authorityUnits` `rateSatangPerUnit` `mode` (= method ที่มีผลของอาคาร) `enteredById = ctx.actorUserId` · **idempotent**: ยังไม่มี ⇒ `CREATED` · บิล+หน่วยเท่าเดิมและไม่มีรูปใหม่ ⇒ `UNCHANGED` (ไม่เขียน · `updatedAt` ไม่ขยับ) · ต่าง ⇒ `UPDATED` + `writeAudit` action `dorm.utility.bill.updated` (before/after = บิล·หน่วย·อัตรา) — แถวที่ ยอมรับคำเตือน สร้างไว้ (บิล null) แล้วใส่บิล = `UPDATED`
- **ยิงพร้อมกัน N ทาง (X3) = แถวเดียว · `CREATED` ตัวเดียว · ไม่มี throw** (advisory lock ต่อคีย์ใน tx + จับ unique violation แล้วอ่านแถวผู้ชนะ)
- รูปบิล (X10): `uploadFile({tenantId}, { kind: "ATTACHMENT", visibility: "private", … }, deps.put ? {put} : undefined)` ⇒ `billPhotoFileId` · อัปไม่สำเร็จ = เก็บบิลต่อ · ผล/DTO ไม่มี URL
- หลังเขียน: คำนวณ `legal` (§3.3) ของกลุ่มนั้น แล้วเก็บลง `legalCheck` (§3.3 รูป) — **การใส่บิลไม่ถูกบล็อกเพราะกฎหมาย** (ที่บล็อกคือการออกบิล §3.4)

### 3.2 ค่าน้ำไฟทุกโหมด (อ่าน · ไม่เขียน)
```ts
utilityCharges(ctx, { unitId: string; periodKey: string }) → Promise<UtilityCharges>
type UtilityChargeRow = { roomId: string; roomNumber: string; buildingId: string | null; kind: Kind;
  metering: "ROOM_METER" | "SHARED_METER" | "NONE"; method: "ACTUAL_COST" | "TARIFF" | "FIXED_RATE" | "FLAT";
  status: "OK" | "HELD" | "NO_READING" | "NO_COST_BASIS" | "NONE"; code: string | null;
  units: number | null; rateSatangPerUnit: number | null; amountSatang: number | null; grossSatang: number | null;
  weight: number | null /* SHARED: น้ำหนักของห้อง */ };
type UtilityGroup = { kind: Kind; buildingId: string | null; metering: string; method: string;
  billSatang: number | null; billUnits: number | null; costRateSatangPerUnit: number | null;
  chargedRooms: number /* แถว OK */; chargedTotalSatang: number /* Σ grossSatang แถว OK */; allocatedSatang: number | null /* SHARED */;
  legal: UtilityLegalGroup };
type UtilityCharges = { periodKey: string; rows: UtilityChargeRow[]; groups: UtilityGroup[] };
```
แถว = ห้องที่คิดเงิน (§2) × kind · เรียง (เลขห้องแบบตัวเลข, ELEC ก่อน WATER) · ตัดสินตามลำดับนี้:
1. method `FLAT` (ไม่สนวิธีวัด): `flat` (ประเภทห้อง) ว่าง ⇒ `NO_COST_BASIS` `RATE_MISSING` · มี ⇒ `amountSatang = satang × (ROOM ? 1 : คน)` (`utilityLine({kind:"FLAT"})`) · `rateSatangPerUnit/units = null`
2. metering `NONE` ⇒ `status NONE` (ไม่มียอด · ไม่เข้ากลุ่มยอด)
3. metering `SHARED_METER`: บิลของขอบเขตไม่มี ⇒ `NO_COST_BASIS` `BILL_MISSING` · มี ⇒ ห้องในกลุ่มเรียงตามเลขห้อง น้ำหนักตาม `sharedBasis` (PERSON = คน · ROOM = 1 · AREA = พื้นที่×100) · ยอดที่เฉลี่ย `T` = บิล (ไม่มี VAT บวกเพิ่ม) · **VAT บวกเพิ่ม (จด + ราคาไม่รวม VAT + taxKind VAT7) ⇒ `T = floor((บิล×100 − 50×n) ÷ 107)`** (n = ห้องที่น้ำหนัก > 0 · หลักเดียวกับ `actualCostRate` ของ D.1 ⇒ Σgross ≤ บิล) · แบ่งด้วย `allocateShared({ totalSatang: T, basis, rooms })` (D.1 largest remainder) · `amountSatang` = ส่วนแบ่ง · `weight` = น้ำหนัก · น้ำหนักรวม 0 ⇒ ทุกแถว `NO_COST_BASIS` `NO_ALLOCATION_BASIS`
4. metering `ROOM_METER`: ห้องไม่มีมิเตอร์ kind นี้ / ยังไม่จดงวดนี้ ⇒ `NO_READING` · แถวพัก (`held` ของ `periodUsage`) ⇒ `HELD` (ไม่มียอด) · มีหน่วย ⇒ ตาม method:
   - `ACTUAL_COST`: บิลไม่มี ⇒ `NO_COST_BASIS` `BILL_MISSING` · มี ⇒ อัตรา = `actualCostRate({ billSatang, units: billUnits, vat: utilVat(kind), billedRooms })` (`billedRooms` = จำนวนแถวที่มีหน่วยของกลุ่ม ไม่รวม HELD/NO_READING)
   - `FIXED_RATE`: `fixedRate` ว่าง ⇒ `NO_COST_BASIS` `RATE_MISSING` · มี ⇒ อัตรานั้น
   - `TARIFF`: ตาราง §2 ไม่มี/Ft ติดลบ ⇒ `NO_COST_BASIS` `TARIFF_MISSING`/`TARIFF_NEGATIVE_FT`
   - ยอด = `utilityLine({ kind: "METERED", segments: periodUsage.segments, method, minimumSatang: rooms.utility.minimum }, utilVat(kind))` (D.1 · ขั้นต่ำถูกคำนวณตามจริงแม้ผิดกฎหมาย — ตัวตรวจเป็นคนห้าม) · `rateSatangPerUnit` = ของ D.1 (TARIFF = null)
- `grossSatang` ตาม §2 สำหรับแถว OK · แถวอื่น = null · README: ไฟ ฿19,824.00/4,200 หน่วย ⇒ 125 หน่วย = **59,000** · 126 หน่วย = **59,472** · น้ำ ฿3,840.00/240 ⇒ 6 หน่วย = **9,600** (ตรง D.1 D1-CL-UTIL-4)
- หน่วยไม่ใช่ DORM/ร้านอื่น/งวดผิดรูป ⇒ `{ periodKey, rows: [], groups: [] }`

### 3.3 ตัวตรวจรายเดือน (ต่อกลุ่ม · ผ่าน `evaluateLegal` เท่านั้น · โหมด/เหตุผล = ค่าตั้งปัจจุบันของหน่วย)
```ts
type UtilityLegalOutcome = { ruleId: LegalRuleId; level: "OK" | "WARN" | "BLOCK"; raw: "OK" | "WARN" | "BLOCK"; code: string; messageTh: string;
  needsAck: boolean; needsOwnerApproval: boolean; always?: boolean };
type UtilityLegalGroup = { kind: Kind; buildingId: string | null; mode: LegalMode; level: "OK" | "WARN" | "BLOCK";
  outcomes: UtilityLegalOutcome[]; fingerprint: string; accepted: boolean;
  acceptance: { byUserId: string; at: string; reason: string } | null };
```
กฎที่รันทุกเดือน (input ตรงชนิด `LegalRuleInputs` ของ D.1):
| เมื่อ | ruleId | input |
|---|---|---|
| ทุกกลุ่ม | `UTIL_NO_MINIMUM` | `{ enabled: minimum !== null, minSatang: minimum }` |
| method `FIXED_RATE` (มี fixedRate) | `UTIL_FIXED_RATE_LE_COST` | `{ rateSatangPerUnit: fixedRate, authorityBillSatang: บิล ?? null, authorityUnits: หน่วยบิล ?? null, vat: utilVat(kind) }` |
| method `FLAT` (มี flat) | `UTIL_FLAT_LE_COST` | `{ flatSatang, payerCount: Σ (ROOM ? 1 : คน) ของห้องในกลุ่ม, authorityBillSatang: บิล ?? null, vat: utilVat(kind) }` |
| กลุ่มที่มีแถว OK ≥ 1 (มีหรือไม่มีบิล) | `UTIL_TOTAL_LE_BILL` | `{ chargedTotalSatang: chargedTotalSatang, authorityBillSatang: บิล ?? null }` |
- `level` = แย่สุดของ outcomes (BLOCK > WARN > OK) · STRICT: เกิน ⇒ BLOCK · WARN: เกิน ⇒ WARN + `needsOwnerApproval` · OUT_OF_SCOPE: ไม่มีเหตุผล ≥ 10 ตัว ⇒ BLOCK `OUT_OF_SCOPE_REASON_REQUIRED` · มี ⇒ OK (raw คงเดิม) · ยังไม่มีบิล ⇒ `UTIL_COST_UNKNOWN` (WARN ต้องยอมรับ แม้ STRICT — ตาม D.1)
- **`fingerprint`** = sha256 ของ JSON `[mode, ...outcomes ที่ไม่ OK.map(o => [ruleId, code, input])]` ⇒ บิล/อัตรา/โหมดเปลี่ยน ⇒ การยอมรับเดิม **ไม่มีผล** (`accepted = false`)
- `accepted` = แถวขอบเขตมี `legalCheck.acceptance` ที่ `fingerprint` ตรง
- รูป `DormUtilityRate.legalCheck` = `{ v: 1, checkedAt: ISO, mode, level, outcomes: [{ ruleId, code, level, raw }], fingerprint, acceptance?: { byUserId, at, reason, fingerprint, codes } }`
- **ต้นทุนเปลี่ยนเดือนต่อเดือน**: อัตราคงที่ ฿4.50 ผ่านเมื่อต้นทุน ฿4.72 แต่บล็อกเมื่อเดือนถัดไปต้นทุนลดเป็น ฿4.40 — ตรวจด้วยค่าปัจจุบันทุกครั้ง (ไม่ใช้ผลเก่าใน `legalCheck` ตัดสิน)

### 3.4 ด่านก่อนออกบิล (D.8 เรียกก่อนสร้าง/ส่งรอบ)
```ts
utilityBillingGate(ctx, { unitId: string; periodKey: string })
→ Promise<{ ok: boolean; blocks: GateItem[]; needsAcceptance: GateItem[]; groups: UtilityGroup[] } | Fail>
type GateItem = { kind: Kind; buildingId: string | null; code: string; messageTh: string; ruleId?: string };
```
- `blocks` = outcome ระดับ BLOCK ทุกตัว + แถว `NO_COST_BASIS` (code ของแถว · **ทุกโหมด** — ไม่มีฐานคิด = ออกบิลไม่ได้แม้นอกขอบเขต) · `needsAcceptance` = outcome ระดับ WARN ของกลุ่มที่ `accepted = false` · `ok = blocks ว่าง && needsAcceptance ว่าง`
- แถว HELD / NO_READING ไม่บล็อกด่าน (D.8 พักบิลเอง) · คำนวณสดทุกครั้ง

### 3.5 ยอมรับคำเตือนรายเดือน (เจ้าของกิจการเท่านั้น)
```ts
acceptUtilityLegalWarn(ctx, { unitId: string; periodKey: string; kind: Kind; buildingId?: string | null; reason: string })
→ Promise<{ ok: true; fingerprint: string } | Fail>
```
- ผู้กระทำ = `ctx.actorUserId` อ่าน **Membership สด** (role `OWNER` · `acceptedAt` ไม่ null) ไม่ใช่ ⇒ `OWNER_ONLY` (ไม่เขียนอะไร) — ผู้จัดการ/พนักงานเห็น "รอเจ้าของยืนยัน"
- กลุ่ม (kind, buildingId) ไม่มี ⇒ `NOT_FOUND` · มี outcome BLOCK ⇒ `LEGAL_BLOCK` (STRICT ยอมรับไม่ได้) · ระดับ OK ⇒ `NOTHING_TO_ACCEPT` · `reason` ไม่ผ่าน `isValidOutOfScopeReason` (≥ 10 ตัว) ⇒ `REASON_REQUIRED`
- เขียน `legalCheck.acceptance` ที่แถวขอบเขตของกลุ่ม (ไม่มีแถว ⇒ สร้างแถวบิล null `mode` = method) + `writeAudit` action `dorm.utility.legal_accepted` (after: kind · buildingId · periodKey · codes · fingerprint · reason) · ยอมรับซ้ำ fingerprint เดิม ⇒ ok ไม่มี audit ใหม่
- ไม่มี approval core ในใบนี้ (มติ §8 ข้อ 3)

### 3.6 โหมดกฎหมาย — เจ้าของเท่านั้น
```ts
setDormLegalMode(actor: SettingsActor, ctx: { tenantId: string },
                 input: { unitId: string; mode: "STRICT" | "WARN" | "OUT_OF_SCOPE"; reason?: string | null; evidenceFileIds?: string[] })
→ Promise<{ ok: true } | Fail>
```
- ลำดับ: หน่วย DORM ของร้าน ⇒ ไม่ใช่ `NOT_FOUND` → `actor.role !== "OWNER"` ⇒ `OWNER_ONLY` → mode นอก 3 ค่า ⇒ `INVALID_INPUT` → OUT_OF_SCOPE: เหตุผล ≥ 10 ตัว ไม่งั้น `REASON_REQUIRED` · `legalScope({ roomCount: ห้อง active ของหน่วย, businessType: rooms.general.businessType })` **`inScope` ⇒ หลักฐาน ≥ 1** (ไม่มี ⇒ `EVIDENCE_REQUIRED`) · ทุก id ต้องเป็น `FileAsset` ของร้านนี้ที่ path มี `/private/` ไม่งั้น `EVIDENCE_INVALID`
- เขียนผ่าน `setSettings(actor, ctx, [...], {})` ที่ชั้น UNIT: `rooms.legal.mode` (+ OUT_OF_SCOPE: `rooms.legal.outOfScopeReason` + `rooms.legal.outOfScopeEvidence`) — ทั้งชุดใน 1 ครั้ง · ผลล้มของเครื่องยนต์ ⇒ `{ ok: false, code: <SetFailCode>, reason: issues[0].messageTh }`
- ⚠️ ทางลัดเดิม `saveSettingsAction` ยังตั้ง OUT_OF_SCOPE โดยไม่มีหลักฐานได้ (เจ้าของเท่านั้น · เครื่องยนต์ไม่รู้จำนวนห้อง) = หนี้ D.13 §9 — หน้า §5 และหน้านโยบาย D.13 ต้องใช้ `setDormLegalModeAction` เท่านั้น

### 3.7 โมเดลหน้า (server · JSON ล้วน)
```ts
dormLawModel(actor: SettingsActor, ctx: { tenantId: string }, input: { unitId: string; periodKey?: string }) → Promise<DormLawModel | null>
type DormLawModel = {
  unitId: string; unitName: string; periodKey: string;
  form: SettingsFormModel;                // loadSettingsForm(actor, ctx, { domains: ["rooms"], groups: ["general","legal","utility","vat","money"], unitId })
  scope: { roomCount: number; businessType: string; inScope: boolean; code: string; autoReasonTh: string | null };
  legal: { mode: LegalMode; editable: boolean; lockedReasonTh: string | null; outOfScopeReason: string | null; evidenceCount: number };
  bills: { kind: Kind; buildingId: string | null; periodKey: string; billSatang: number | null; units: number | null;
           costRateSatangPerUnit: number | null; hasPhoto: boolean }[];   // ต่อ kind: แถวล่าสุดที่ periodKey ≤ งวดของหน้า และมีบิล
  check: { ok: boolean; blocks: GateItem[]; needsAcceptance: GateItem[] };  // utilityBillingGate ของงวดหน้า
  canRecordBill: boolean;   // evaluate(actor, { module: "dorm", action: "dorm.bill.run", unitId })
  canAccept: boolean;       // actor.role === "OWNER"
};
```
- `periodKey` ไม่ส่ง ⇒ งวดล่าสุดที่หน่วยมี `DormUtilityRate` (มีบิล) · ไม่มี ⇒ เดือนก่อนของเดือนนี้ไทย (`bkkYmd`)
- `legal.editable` / `lockedReasonTh` = จาก field `rooms.legal.mode` ของ `form` (ด่าน `editIssueFor` ตัวเดียวกับเครื่องยนต์ — ผู้จัดการได้ "แก้ได้เฉพาะเจ้าของกิจการ")
- หน่วยไม่ใช่ DORM/ร้านอื่น/ผู้ดูเข้าหน่วยไม่ได้ ⇒ `null`

## 4. ค่าตั้งเพิ่ม 2 ตัว (`defs/rooms.ts` · group `utility`)
```ts
rooms.utility.elec.tariffRef · rooms.utility.water.tariffRef — type "text" · labelTh "ประเภทอัตราของการไฟฟ้า" / "ประเภทอัตราของการประปา"
schema z.string().regex(/^(PEA|MEA|PWA|MWA):[0-9A-Za-z._-]{1,20}$/).nullable() · defaults { _fallback: null } · chain U_B · sensitivity "MONEY"
helpTh "รูปแบบ ผู้ให้บริการ:รหัสประเภท เช่น PEA:1.1.2 — ใช้กับวิธีคิด 'ตามตารางอัตรา' (ตารางระบบ DormAuthorityTariff มีวันที่มีผล)"
```
+ ต่อท้าย `SNAPSHOTS.bill` ทั้ง 2 คีย์ (บิลจดว่าใช้ตารางไหน)

## 5. จอ (ภาพ หอ 10 · เดสก์ท็อป 1440 เป็นหลัก · 390 ไม่ล้น)
- «page.tsx» server component: `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `dormAccess(<membership>, unit.id).board` ไม่ผ่าน ⇒ `notFound()` (คนจดมิเตอร์ไม่เห็นเงิน) · actor จาก `auth.active` · `dormLawModel` ผ่าน facade `@/lib/modules/dorm` (ไม่แตะ prisma) · `searchParams.period` ถูกรูป ⇒ งวดนั้น · ส่ง `<UtilityLawSettings model={…} unitSlug={unitSlug} actions={{ save: saveSettingsAction, reset: resetSettingAction, setLegalMode, recordBill, accept }} />` (เมนูซ้าย `DormSettingsNav` วาดในคอมโพเนนต์)
- «actions.ts» `"use server"` · export async function เท่านั้น: `recordAuthorityBillAction(unitSlug, input)` (ด่าน `evaluate(..., "dorm.bill.run")` · รูป base64/dataURL ≤ 5 MB) · `acceptUtilityLegalAction(unitSlug, input)` · `setDormLegalModeAction(unitSlug, input)` — ทุกตัว `requireUnit` + DORM · ร้าน/ผู้กระทำจาก session เท่านั้น (ไม่รับ `tenantId`/`actorUserId` จาก input) · เงินในฟอร์มกรอกเป็นบาท แปลงเป็นสตางค์ฝั่งเซิร์ฟเวอร์ด้วยจำนวนเต็ม (ไม่ใช้ `parseFloat×100`)
- «UtilityLawSettings.tsx» (`'use client'` บรรทัดแรก · default export · props `{ model: DormLawModel; unitSlug: string; actions: {...} }` · import ได้เฉพาะ `import type` + `@/components/settings/settings-shared` + `./DormSettingsNav` + react · ลิงก์ใช้ `<a>` (ห้าม `next/link`) · **ไม่ import actions/prisma/โมดูล server · ไม่ใช้ hook ของ Next** — `renderToStaticMarkup` ได้) · **ป้าย/ตัวเลือก/สิทธิ์ทุกช่องค่าตั้งมาจาก `model.form` (field.labelTh · options[].labelTh · editable · lockedReasonTh)** — ห้ามฮาร์ดโค้ดตัวเลือก · บันทึกค่าตั้งผ่าน `actions.save` ด้วย `submissionFor` เดิม (ส่งเฉพาะคีย์ที่แตะ) ยกเว้นโหมดกฎหมาย = `actions.setLegalMode`
- DOM สัญญา (ข้อสอบ U ผูก):
  - ตัวห่อ `data-dorm-law` + `data-period="<P>"` · เมนูซ้าย `data-dorm-settings-nav` มีรายการ `data-nav-active="true"` ข้อความ "ค่าน้ำไฟ · กฎหมาย · VAT"
  - การ์ด `data-utility-card="ELEC"` (หัว "ค่าไฟฟ้า") · `data-utility-card="WATER"` (หัว "ค่าน้ำประปา") — ในการ์ด: ปุ่มวิธีวัด `data-metering-option="<ค่า>"` ครบตาม options (ข้อความ = labelTh ของทะเบียน · ตัวที่มีผล `data-selected="true"`) · วิธีคิด `data-method-option="<ค่า>"` ครบ 4 (เหมือนกัน) · กล่องบิล `data-authority-bill` ข้อความมี ยอดบิล (`฿19,824.00`) · หน่วย (`4,200 หน่วย`) · ต้นทุนต่อหน่วย (`฿4.72`) · งวด · สวิตช์ขั้นต่ำ `data-minimum` (`role="switch"` `aria-checked`) · ฐานเฉลี่ย `data-shared-basis="<ค่า>"` ครบ 3 (อย่างน้อยในการ์ดใดการ์ดหนึ่ง ตามภาพอยู่การ์ดน้ำ)
  - ฟอร์มใส่บิล `data-authority-bill-form="<kind>"` (เฉพาะ `canRecordBill`) มีช่อง `data-bill-input="amount"` · `data-bill-input="units"` · `<input type="file" accept="image/*">`
  - การ์ดโหมด `data-legal-card`: ข้อความผลขอบเขต "<roomCount> ห้อง" + "อยู่ในขอบเขต"/"นอกขอบเขต" · ตัวเลือก `data-legal-mode-option="STRICT|WARN|OUT_OF_SCOPE"` ครบ 3 (ตัวที่มีผล `data-selected="true"`) · `!legal.editable` ⇒ **ทุกตัวเลือก `disabled`** + ข้อความ `lockedReasonTh` · เจ้าของ ⇒ ไม่ disabled
  - ผลตรวจรายเดือน `data-legal-check` แถว `data-legal-row="<kind>"` + `data-level="OK|WARN|BLOCK"` + `messageTh` ของ outcome ที่ไม่ OK · ต้องยอมรับ + `canAccept` ⇒ ปุ่ม `data-accept-legal="<kind>"` พร้อมช่องเหตุผล · ไม่ใช่เจ้าของ ⇒ ไม่มีปุ่ม + ข้อความ "รอเจ้าของยืนยัน"
  - การ์ด `data-vat-card` `data-vat-registered="true|false"` + ตารางชนิดภาษี (ค่าห้อง "ยกเว้น VAT" · น้ำ/ไฟ "VAT 7%")
  - การ์ด "รอบบิล · ค่าปรับ" (สรุป · ลิงก์หน้านโยบาย) ตามภาพ — ไม่ตรวจ DOM
  - **ไม่มีคำต้องห้าม สคบ.** (ตัดไฟ/ตัดน้ำ/ล็อกห้อง/ระงับน้ำไฟ …)
- หน้าตาตามภาพ 10: เมนูซ้าย · คอลัมน์กลาง การ์ดไฟ/น้ำ · คอลัมน์ขวา โหมดกฎหมาย/VAT/รอบบิล (ภาพเทียบแบบ = ผู้คุม PARITY)

## 6. ฉากภาพ «scripts/svc-qc-utility-scene.mts»
- `loadSvcQcEnv("svc-qc-utility-scene")` ก่อนแตะฐาน · อ่าน `SQC` จาก `./svc-qc-data.mjs` · ร้าน svcqc หอ อาคาร A (`SQC_DORM_BUILDING.id`) งวดเดือนก่อน (ไทย): ไฟ ฿19,824.00 / 4,200 หน่วย · น้ำ ฿3,840.00 / 240 หน่วย (README) · `enteredById = "SvcQcScene"` · เขียนผ่าน `recordAuthorityBill` จริง (ctx actor = owner svcqc)
- idempotent `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะแถว `enteredById "SvcQcScene"` · ไม่แตะค่าตั้ง/ห้อง/มิเตอร์

## 7. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.7.mts»
S โครงสร้าง 13 · PC positive control 4 · B ใส่บิล 10 · C ค่าน้ำไฟ (ห้อง/ต้นทุนจริง/VAT) 8 · T ตารางอัตรา 5 · H มิเตอร์รวมเฉลี่ย 6 · L ตัวตรวจรายเดือน+ด่าน+ยอมรับ 16 · M โหมดกฎหมายเจ้าของเท่านั้น+โมเดล 11 · U จอ 9 · X ข้ามร้าน 5 · Q ฉาก 3 · V ภาพ 2 · G regression 3 · Z ล้าง 1 = **96 ข้อ** · สถานะสะสม (ข้อหลังใช้ผลข้อก่อน) · ฟังก์ชันขาด = FAIL ไม่ใช่ SKIP
- ตัวเลขคาดหวังมาจาก README/ข้อสอบ D.1 (472 · 1600 · 59,000 · 59,472 · 9,600 · 45,570 · 77,779 · [1667,3333,5000] · [3334,3333,3333] · [3000,3000,4001]) และ **เทียบกับฟังก์ชัน D.1 ตัวจริง** ทุกจุดที่มี VAT/ตาราง (positive control)
- positive control ที่เขียวตั้งแต่ก่อนทำ (ต้องคงเขียว): `PC-1` เครื่องยนต์ R0.3 ปฏิเสธผู้จัดการตั้ง `rooms.legal.mode` (OWNER_ONLY) · `PC-2` สูตร D.1 ให้ 472/1600/59,000 · `PC-3` `evaluateLegal` STRICT/WARN/OUT_OF_SCOPE บนอัตรา ฿4.50 vs ต้นทุน ฿4.40 · `PC-4` ฉากทดสอบถูก (`periodUsage` D.6 + `occupancyRange`)

## 8. มติผู้คุมในใบนี้ (ส่งที่ปรึกษากฎหมาย J3 พร้อมชุด)
1. **ต้นทุนจริงต่อหน่วย** = บิล ÷ หน่วยบิล ปัดลง (D.1 `utilityCostMethod BILL_DIV_UNITS` · PENDING_LEGAL_REVIEW) · หน่วยบิลไม่กรอก ⇒ มิเตอร์ MAIN ของอาคาร
2. **มิเตอร์รวม**: เฉลี่ย **ทั้งบิล** (รวมส่วนกลาง/ห้องว่าง) ให้ห้องที่มีผู้เช่าเท่านั้น · ฐานคน/ห้อง/พื้นที่ (#14) · ตัวตรวจ = ยอดรวมที่เก็บ ≤ บิล — ⚠️ ถามที่ปรึกษา
3. **ยอมรับคำเตือนรายเดือน** = เจ้าของกดเอง (Membership สด) แทน approval core — คำเตือนรายเดือนผูกงวด/บิล ไม่ใช่ค่าตั้ง · ถ้าเจ้าของอยากให้ผู้จัดการยื่นขอ = งาน D.13 (entityType ใหม่ลง 3 ที่)
4. ไม่มีบิลของงวด ⇒ อัตราคงที่/เหมา = `UTIL_COST_UNKNOWN` ต้องยอมรับ (แม้ STRICT) · ต้นทุนจริง/มิเตอร์รวม/ตารางที่ไม่มีฐาน = บล็อกทุกโหมด
5. ใส่บิลไม่ถูกบล็อก (บันทึกข้อเท็จจริงเสมอ) — บล็อกที่การออกบิล
6. อัตรา VAT บวกเพิ่ม: ถอด VAT จากบิลก่อน + เผื่อเศษครึ่งสตางค์ต่อห้อง (หลัก D.1) ⇒ Σ ที่ผู้เช่าจ่ายจริง ≤ บิล

## 9. regression · X · ส่งต่อ · หนี้
- ต้องเขียวเท่าเดิม: `qc-svc-d.1` (defs เพิ่ม 2 · calc ไม่แตะ) · `qc-svc-d.6 --no-regression` · `qc-svc-r0.4` (ฟอร์มค่าตั้งเห็น def ใหม่) · fitness 2 โหมด · typecheck (ISO_MEM=9000M · heap 7168)
- X: X1 (X-1..5 ข้ามร้าน/ข้ามหน่วย) · X3 (B-9 ใส่บิล 10 ทาง) · X9 (การกระทำอันตราย: ยอมรับคำเตือน = เจ้าของ + เหตุผล + audit · เปลี่ยนโหมด = เจ้าของ) · X10 (B-8 รูปบิลส่วนตัว · M-5 หลักฐานต้องเป็นไฟล์ส่วนตัวของร้าน) · อื่นไม่เกี่ยว (ไม่มี endpoint สาธารณะ/งานตามเวลา/นำเข้า/event ใหม่)
- ส่งต่อ: **D.8** กล่องประมาณค่าน้ำไฟในจอ 03 · เรียก `utilityBillingGate` ก่อนสร้าง/ส่งรอบ (ไม่ ok ⇒ ไม่ส่ง + ชี้หน้า 10) · บรรทัดน้ำไฟจาก `utilityCharges` (`input` → `buildDormBill`) · snapshot `rooms.utility.*.tariffRef` · **D.13** หน้า 17 + เมนูซ้ายจริง · คีย์ `dorm.settings.legal` · ขอยอมรับผ่าน approval core (ถ้าเจ้าของต้องการ) 
- หนี้: (1) **หนี้ D.13**: `saveSettingsAction` ยังตั้ง OUT_OF_SCOPE ไม่มีหลักฐานได้ (เจ้าของเท่านั้น · group rule ไม่รู้จำนวนห้อง) ⇒ หน้านโยบาย D.13 ต้องส่งการเปลี่ยนโหมดกฎหมายผ่าน `setDormLegalMode` เท่านั้น (ไม่ใช้ฟอร์มทั่วไป) (2) Ft ติดลบ: calc D.1 `count(ftE4)` ปฏิเสธ ⇒ `TARIFF_NEGATIVE_FT` บล็อก → แก้ calc เมื่อ Ft ติดลบจริง (3) กล่อง "ประมาณค่าน้ำไฟ" ในจอ 03 = ส่งต่อ D.8 (อ่าน `utilityCharges`) (4) แก้ค่าอัตราคงที่ในหน้าค่าตั้งยังไม่เตือนทันทีเทียบบิลล่าสุด (เครื่องยนต์ `atCostPoint`) — หน้า 10 แสดงผลตรวจรายเดือนแทน
