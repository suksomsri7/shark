# ใบสั่ง D.13 — ผังห้องหอ + KPI (หอ 01) · ตั้งนโยบาย/สิทธิ์ (หอ 17) · คีย์สิทธิ์หอ · ผู้ดูแลเห็นเฉพาะอาคาร (เบา · ตรวจรอบเดียว — แต่ X1 ขอบเขตอาคาร/ร้าน + "ไม่เห็นเงิน" ต้องจริง)

> อ้าง: MASTER-PLAN แถว D.13 · DH A1 + ภาคผนวก ก #59–64 (#63 สิทธิ์ · #64 ผู้ดูแลเห็นเฉพาะอาคาร) · CC §1.8 §8 + ภาคต่อ 28 ต.ค. · ภาพ `ledger/design-dorm/01-floorplan.png` `17-settings-policies.png` (+ `.body.html`) · README หอ (ฉาก "3 พ.ย.")
> หนี้ที่ส่งมา: `ledger/wo-notes/svc-r0.8-carry.md` §"ภาพเทียบแบบ R0.4" (หอ 17 = 6 การ์ดกริด 3 คอลัมน์ + เมนูซ้าย ไม่ใช่ฟอร์มยาว) · `/root/svc-runs/fix/d7.md` (ช่องโหว่ `saveSettingsAction` ตั้ง OUT_OF_SCOPE ไม่มีหลักฐาน · ข้อสอบ U-11 data-fingerprint) · `/root/svc-runs/fix/d5.md` (N+1 ยอดถือในหน้าผู้เช่า · fai + `dorm.lease.manage`) · `svc-brief-d.6.md` (fai `dorm.view` · คนจดมิเตอร์ไม่เห็นเงิน) · `svc-brief-r0.9.md` (ช่องป้ายการเงิน/ชื่อผู้เช่าให้ผู้เรียกเติม · KPI = D.13) · `svc-brief-d.7.md` §3.6 §9 (DormSettingsNav · หนี้ D.13)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.13.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.13.mts` (ห้ามครอบ timeout · ห้าม kill) · ต่อท้าย `--no-regression` ข้ามหมวด G ระหว่างทำ · SKIP ที่ยอมได้ระหว่างทำ = V-2 (ไม่มี QC_BASE) · Q-* (ร้าน svcqc/ฉากก่อนหน้ายังไม่มี) · G-* (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` — fai + `dorm.lease.manage` `dorm.slip.review` · บล็อก "SVC D.13" ท้ายไฟล์ (`SQC_VISUAL_SPECS["d.13"]` · `SQC_DORM_HOME_SCENE` · `SQC_DORM_POLICY_SCENE`)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/`prisma/**`** · เลน l3 · temp ขึ้นต้น `svc-d13-` · รายงานต่อข้อ (id → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/dorm/home.ts» | ใหม่ (server) | `dormHomeModel` §4 · อ่านผ่าน `tenantDb` + facade rooms (ห้าม `import { prisma }`) |
| «src/lib/modules/dorm/scope.ts» | ใหม่ (server) | `dormBuildingScope` §3 |
| «src/lib/modules/dorm/policy.ts» | ใหม่ (server) | `loadDormPolicySettings` `applyDormRolePreset` §6 |
| `src/lib/modules/dorm/access.ts` | แก้ (เพิ่ม) | `dormAccess` คืนเพิ่ม `money` `lease` `settings` (คง `board` `meter` ตามเดิมทุกไบต์) · `DORM_ROLE_ROWS` `DORM_ROLE_COLUMNS` `dormPresetPermissions` §5 — pure (import ได้แค่ `@/lib/core/rbac`) |
| `src/lib/modules/dorm/lease.ts` | แก้ (เฉพาะ 2 เรื่อง) | ขอบเขตอาคารใน `gate`/อ่านสัญญา/ห้อง §3.2 · `listLeases` ใช้ `securityDepositHeldMany` ครั้งเดียว (หนี้ N+1) — พฤติกรรมอื่นห้ามเปลี่ยน |
| `src/lib/modules/dorm/index.ts` | แก้ | บล็อก export ของใบนี้ต่อท้าย (ของ D.5/D.6/D.7 ห้ามแตะ) |
| `src/lib/modules/account/index.ts` | แก้ (เพิ่มอย่างเดียว) | `securityDepositHeldMany` §7 (อ่านอย่างเดียว · ไม่แตะฟังก์ชันเดิม) — ตัวช่วย SQL อยู่ `gl.ts` ได้ (เพิ่มอย่างเดียว) |
| «src/components/dorm/dorm-home-shared.ts» | ใหม่ (pure) | `DORM_TABS` `dormTabsFor` `thaiMonthShort` `thaiShortDate` `bahtText` §8 |
| «src/components/dorm/dorm-policy-shared.ts» | ใหม่ (pure) | `DORM_POLICY_LAYOUT` `DORM_POLICY_GROUPS` `DORM_MSG_VAR_LABEL_TH` §6.1 — ตำแหน่ง/คีย์ค่าตั้งอยู่ไฟล์นี้ไฟล์เดียว |
| «src/components/dorm/DormHome.tsx» | ใหม่ `'use client'` | จอ 01 ส่วน KPI · ต้องทำวันนี้ · รอบบิล (ผังมาเป็น children) §4.4 |
| «src/components/dorm/DormPolicySettings.tsx» | ใหม่ `'use client'` | จอ 17 §6.3 |
| «src/components/dorm/DormTabs.tsx» | ใหม่ `'use client'` | แท็บโมดูลหอ §8 |
| `src/app/app/u/[unitSlug]/dorm/page.tsx` | แก้ | §4.5 |
| «src/app/app/u/[unitSlug]/dorm/layout.tsx» | ใหม่ | แท็บโมดูลหอ §8 |
| `src/app/app/u/[unitSlug]/dorm/settings/page.tsx` | แก้ (แทนฟอร์มยาว R0.4) | หน้า 17 §6.4 |
| «src/app/app/u/[unitSlug]/dorm/settings/actions.ts» | ใหม่ `"use server"` | `applyDormRolePresetAction` §6.4 |
| `src/app/app/u/[unitSlug]/page.tsx` | แก้ (เพิ่ม `UNIT_NAV.DORM`) | §8 |
| `src/lib/core/permissions.ts` | แก้ (เพิ่มอย่างเดียว) | คีย์หอ CC §8 ที่ยังขาด 12 ตัว + ป้ายไทย + `planned` §5.1 |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (3 จุดเท่านั้น) | `EDIT = "dorm.settings.edit"` · `writeVia` ให้ 3 คีย์ `rooms.legal.*` · def ใหม่ `rooms.access.buildingAssignments` §3.1 §2 ข้อ 5 |
| `src/lib/core/settings/types.ts` · `registry.ts` · `actions.ts` · `index.ts` | แก้ **เพิ่มอย่างเดียว** (มติผู้คุม · ปิดหนี้ D.7) | `SettingDef.writeVia?: string` · ทะเบียนตรวจ (ไทยไม่ว่าง) · `writeViaIssues` · `saveSettingsAction`/`resetSettingAction` เรียกก่อนเขียน §2 ข้อ 5 |
| «scripts/svc-qc-dorm-home-scene.mts» | ใหม่ (builder) | ฉากภาพ §9 |

ห้าม: migration · แก้ `service.ts`/`form.ts`/`template.ts` ของเครื่องยนต์ · `components/settings/*` · `RoomBoard.tsx` (R0.9 · ผู้เรียกเติมป้าย) · `meter.ts`/`utility.ts`/`law.ts`/`UtilityLawSettings.tsx`/`DormSettingsNav.tsx` · เขียน `DormBill*`/`PaymentSlip`/`DormRepair` (อ่านอย่างเดียว — D.8/D.10/D.16 เขียน) · `any` · `getDay()` ดิบ · คำต้องห้าม สคบ. (ตัดน้ำ/ตัดไฟ/ล็อกห้อง/ยึดของ …)

## 2. มติของใบนี้ (ผู้เขียนข้อสอบตัดสิน)
1. **ฉาก KPI = README "3 พ.ย."** ค่าทั้งหมดอยู่ `SQC_DORM_HOME_SCENE` · ข้อสอบสร้างบนร้านชั่วคราวแบบวันที่ตายตัวแล้วเรียก `dormHomeModel(..., { date: "2026-11-03" })` · โมเดลไม่อ่านนาฬิกาเมื่อได้ `date`
2. **รอบบิลยังไม่มี (D.8)**: แผงรอบบิล/ป้ายเงิน/KPI เงิน อ่านตาราง `DormBillRun` `DormBill` `PaymentSlip` (ของ D.0) ตรง ๆ แบบอ่านอย่างเดียว ⇒ D.8/D.10 เขียนแถวเมื่อไร หน้าเติมเองโดยไม่แก้ใบนี้ · ไม่มีรอบ ⇒ `billing: null` + ข้อความ "ยังไม่มีรอบบิล" (สัญญาที่ D.8 ต้องเคารพ = สถานะ/คอลัมน์ตาม schema D.0: `DormBill.status` · `totalSatang` · `paidSatang` · `dueDate` · `PaymentSlip(domain "DORM", refType "DORM_BILL", refId = DormBill.id)`)
3. **ใครเห็นเงิน** = `dormAccess(m, unitId).money` = evaluate ใดก็ได้ของ `dorm.bill.run` `dorm.bill.send` `dorm.slip.review` `dorm.payment.manual` (OWNER/MANAGER ที่คุมหน่วย = จริง) · ไม่เห็นเงิน ⇒ โมเดลไม่มีตัวเลขเงินเลย (§4.3) · คนจดมิเตอร์ (มีแค่ `dorm.meter.read`) ⇒ หน้า 01/17 = 404 · แท็บเหลือ "จดมิเตอร์"
4. **ผู้ดูแลเห็นเฉพาะอาคาร (#64)**: ค่าตั้งเดิม `rooms.access.managerScope` (UNIT|BUILDING · อ่านที่ refs `{unitId}` เท่านั้น) + def ใหม่ `rooms.access.buildingAssignments` (ชั้น UNIT · `Record<membershipId, buildingId[]>`) · ไม่ใช้ OWNER — ใช้กับทุกบทบาทอื่น (รวม MANAGER) · ไม่มีรายการ ⇒ ไม่เห็นห้องใด (fail closed) · ห้องไม่มีอาคาร ⇒ ซ่อนเมื่อถูกจำกัด · ผู้ดู = **Membership สด** ของ `(ctx.tenantId, actor.userId)` (ไม่เชื่อ role/permissions ใน actor) — ไม่มีสมาชิกภาพ ⇒ null
5. **ปิดหนี้ D.7 (ทางลัดโหมดกฎหมาย)**: `SettingDef.writeVia?: string` = ป้ายไทยของหน้าที่ต้องไปเปลี่ยน · ตั้งให้ `rooms.legal.mode` `rooms.legal.outOfScopeReason` `rooms.legal.outOfScopeEvidence` = มีคำว่า "ค่าน้ำไฟ · กฎหมาย · VAT" · `writeViaIssues(keys)` (export จาก `@/lib/core/settings`) คืน `{ key, code: "WRITE_VIA", messageTh }[]` · `saveSettingsAction` และ `resetSettingAction` เรียกก่อนเขียน — มีปัญหา ⇒ `{ ok:false, code:"VALIDATION", issues }` ไม่เขียน · `setSettings`/`setDormLegalMode` (ทางเฉพาะ) ทำงานเดิม · หน้า 17 ไม่มีคีย์ `rooms.legal.*` เลย (โหมดอยู่หน้า 10)
6. **หน้า 17 อยู่ที่ `/dorm/settings`** (แทนฟอร์มยาว R0.4 · เมนูซ้าย D.7 ชี้ที่นี่แล้ว) · หน้า 10 คงที่ `/dorm/settings/utility`
7. **คงสัญญาสแตติกของใบก่อน (ไม่ขอ ORACLE-EDIT)**: `dorm/page.tsx` ยังเรียก `roomBoard(` จาก `@/lib/modules/rooms` + import `@/components/rooms/RoomBoard` + `dormAccess(...).board` (r0.9 S-7 · d.6 S-8) ⇒ หน้าส่ง `cells` เข้าโมเดลให้ "ตัดขอบเขต + เติมป้าย" · `dorm/settings/page.tsx` ยังมี `requireUnit` `loadSettingsForm` `notFound` `saveSettingsAction` `resetSettingAction` `SettingsForm`(เช่น `SettingsFormModel`) `"DORM"` และสตริง domain `"rooms" "payments" "messaging"` (r0.4 F-6) ⇒ หน้าโหลดฟอร์มเครื่องยนต์เองแล้วส่ง `form` เข้า `loadDormPolicySettings`
8. **คีย์แก้ค่าตั้งหอ** = `dorm.settings.edit` (CC §8 · แทน `settings.rooms.edit` ที่ไม่เคยลงทะเบียน) · ทุก def rooms ใช้ค่านี้
9. **ชื่อบนผัง** = ชื่อแรกของ Party (คำแรกก่อนช่องว่าง · ไม่มีนามสกุล/เบอร์) · ห้องจองล่วงหน้า = `"<ชื่อแรก> (ใหม่)"`
10. **ตารางสิทธิ์ 17** = ชุดตามบทบาท 4 คอลัมน์ของภาพ (เจ้าของ · ผู้ดูแล · ช่าง · บัญชี) · "ขออนุมัติ" = ไม่ถือคีย์อนุมัติ (ยื่นขอผ่านงาน D.11/D.12) · แม่บ้าน/หน้าเคาน์เตอร์ (#63) = เฟสโรงแรม (หนี้)

## 3. ขอบเขตอาคาร
### 3.1 `dormBuildingScope(ctx: { tenantId }, input: { unitId: string; userId: string }) → Promise<{ all: true; buildingIds: null } | { all: false; buildingIds: string[] }>`
- หน่วยไม่ใช่ DORM ของร้าน / ไม่มีสมาชิกภาพ (acceptedAt ไม่ null) ⇒ `{ all:false, buildingIds: [] }`
- OWNER ⇒ all · `managerScope` (refs `{unitId}`) ≠ "BUILDING" ⇒ all · ไม่งั้น `buildingAssignments[membership.id]` ∩ อาคารของหน่วย (ไม่ซ้ำ เรียงตาม id)
- def ใหม่ (`defs/rooms.ts` กลุ่ม `access`): `rooms.access.buildingAssignments` type `table` labelTh "อาคารที่ผู้ดูแลแต่ละคนเห็น" schema `z.record(z.string().min(1).max(64), z.array(z.string().min(1).max(64)).max(50))` (≤ 500 คน) · defaults `{ _fallback: {} }` · chain `["UNIT"]` · `ownerOnly: true`
### 3.2 ใช้ที่ไหน (ทุกที่ต้องตัดฝั่งเซิร์ฟเวอร์)
- `dormHomeModel` (ห้อง/KPI/บิล/สลิป/ซ่อม/สัญญา/ป้าย — คิดเฉพาะห้องที่เห็น)
- `lease.ts`: `listLeases` แถว + `counts` + `heldTotalSatang` เฉพาะห้องที่เห็น · ทุกฟังก์ชันที่รับ `leaseId`/`roomId` (getLease · leaseContract · leaseFileLinks · createLease · receiveBookingFee · moveIn · signLease · addLeaseFiles · cancelLease · updateLeaseOccupants) ห้องนอกขอบเขต ⇒ ผลเดียวกับ "ไม่พบ" (null / `NOT_FOUND`) ไม่เขียนอะไร
- มิเตอร์ (D.6) ยังไม่ตัด = หนี้ D.14 (ไม่มีเงิน/ชื่อ)

## 4. หน้า 01 — `dormHomeModel`
### 4.1 สัญญา
```ts
dormHomeModel(actor: SettingsActor, ctx: { tenantId: string }, input: { unitId: string; date?: string /* YYYY-MM-DD ไม่ส่ง = วันนี้ไทย */; cells?: RoomBoardCell[] }) → Promise<DormHomeModel | null>
type DormHomeFinance = { tone: "overdue" | "pending" | "unpaid" | "paid"; text: string };
type DormHomeModel = {
  unitId; unitName; basePath /* /app/u/<slug>/dorm */; date;
  money: boolean; scope: { all: boolean; buildingIds: string[] | null };
  buildings: { id; name }[];                 // เฉพาะที่เห็น
  cells: RoomBoardCell[];                     // เฉพาะห้อง active ของหน่วยที่เห็น (ส่ง cells มา ⇒ ตัดตัวที่ไม่ใช่ห้องที่เห็นทิ้ง)
  occupantLabels: Record<string /*roomId*/, string>;
  finance: Record<string /*roomId*/, DormHomeFinance>;   // money=false ⇒ {}
  kpi: {
    rooms: { total: number; floors: number; byType: { name: string; count: number }[] /* count มาก→น้อย แล้วชื่อ */ };
    occupied: { count: number; pct: number; prevMonthCount: number; prevMonthPct: number };
    vacant: number; booked: number; repair: number;
    longestVacant: { roomNumber: string; days: number } | null;
    collected: { satang: number; paidBills: number; billCount: number; dueDate: string | null; periodKey: string } | null;  // money=false / ไม่มีรอบ ⇒ null
    overdue: { satang: number; rooms: string[]; maxDaysLate: number } | null;                                            // money=false ⇒ null · ไม่มี ⇒ {0,[],0}
  };
  todo: { kind: "overdue" | "slips" | "repairs" | "moveIns" | "expiring"; count: number; textTh: string; href: string }[];
  billing: { periodKey; status; sentAt: string | null /*YYYY-MM-DD ไทย*/; billCount; paid; slipPending; unpaid; held; draft;
             totalSatang; collectedSatang; outstandingSatang } | null;   // money=false / ไม่มีรอบ ⇒ null
};
```
- null เมื่อ: หน่วยไม่ใช่ DORM ของร้าน · ไม่มีสมาชิกภาพสด · `dormAccess(สด).board` ไม่ผ่าน
### 4.2 นิยาม (ข้อสอบผูกตัวเลข README)
- **ห้อง** = `HotelRoom.active` ของหน่วยที่เห็น · `floors` = จำนวนคู่ (อาคาร, ชั้น) ที่ไม่ว่าง · สถานะตาม RoomBoard (R0.9): LEASED/GUEST = มีผู้เช่า · VACANT+`next`(LEASE/STAY/HOLD) เริ่มภายใน 31 วัน = จอง · BLOCKED หรือ VACANT+hk OUT_OF_ORDER = ซ่อม · VACANT อื่น = ว่าง · `pct` = round(count×100/total)
- **เดือนก่อน** = ห้องมีผู้เช่า ณ **วันสุดท้ายของเดือนก่อน** (3 พ.ย. ⇒ 31 ต.ค. = 32 · 89%)
- **ว่างนานสุด** = ห้องสถานะว่างที่ `date − max(endDate ของ occupancy LEASE/STAY ที่ endDate ≤ date)` มากสุด (ไม่มีประวัติใน 400 วัน ⇒ ไม่นับ) — 108 = 34 วัน
- **รอบปัจจุบัน** = `DormBillRun` ของหน่วยที่ `periodKey` มากสุดที่ ≤ เดือนของ (date + 1 เดือน) · บิลที่นับ = ไม่ใช่ VOID · `paid` = PAID · `slipPending` = SENT/PARTIALLY_PAID ที่มีสลิป PENDING/NEEDS_REVIEW · `unpaid` = SENT/PARTIALLY_PAID ที่เหลือ · `held` = HELD · `draft` = DRAFT · `collectedSatang` = Σ paidSatang · `outstandingSatang` = Σ max(0,total−paid) ของบิลที่ไม่ PAID · `billCount` = จำนวนบิลที่นับ
- **ค้างเกินกำหนด** = บิล SENT/PARTIALLY_PAID `dueDate < date` คงค้าง > 0 (ทุกงวด) · KPI `overdue` = ของงวด < รอบปัจจุบัน (ไม่มีรอบ ⇒ < เดือนของ date) · `maxDaysLate` = date − dueDate เก่าสุด
- **ป้ายเงินต่อห้อง** (ลำดับชนะ): overdue `"ค้าง <เดือนสั้นของงวดเก่าสุด> ฿<บาทปัดลงมีจุลภาค>"` (106 ⇒ "ค้าง ต.ค. ฿5,214") > pending `"สลิปรอตรวจ"` > unpaid `"<เดือนสั้น> ยังไม่จ่าย"` > paid `"<เดือนสั้น> จ่ายแล้ว"` (เดือนสั้นของรอบปัจจุบัน) · ห้องไม่มีบิล ⇒ ไม่มีคีย์
- **todo** (ละรายการที่ count 0 · ลำดับตายตัว): `overdue` (บิลค้างเกินกำหนด · ข้อความมีเลขห้อง + ชื่อแรก + ยอด `฿5,214.00` + "เลยกำหนด N วัน") · `slips` (เลขห้อง) · `repairs` (`DormRepair` OPEN ของห้องที่เห็น · เลขห้อง + ข้อความ) · `moveIns` (DormLease DRAFT ที่ `date < startDate ≤ date+30` · เลขห้อง + ชื่อแรก + "15 พ.ย.") · `expiring` (ACTIVE/NOTICE ที่ `date ≤ endDate ≤ date+30` · เลขห้อง) · `href` ขึ้นต้น `basePath`
### 4.3 ไม่เห็นเงิน (money=false)
`finance = {}` · `kpi.collected = null` · `kpi.overdue = null` · `billing = null` · todo ไม่มี overdue/slips · ทั้งโมเดลไม่มี "฿" และไม่มีตัวเลขยอดเงิน
### 4.4 `DormHome.tsx` (`'use client'` · default export · props `{ model: DormHomeModel; unitSlug: string; children?: ReactNode }` · import ได้แค่ `import type` + react + `./dorm-home-shared` · ไม่มี hook ของ Next · `<a>`)
- ราก `data-dorm-home` `data-date` · KPI `data-dorm-kpi` การ์ด `data-kpi="rooms|occupied|vacancy|collected|overdue"` + `data-kpi-value` (rooms "36" · occupied "31" · vacancy "3·1·1" · collected = satang · overdue = satang) · ข้อความ: rooms มี "36" "3 ชั้น" และจำนวนต่อประเภท · occupied มี "86%" "32" "89%" · vacancy มี "108" "34 วัน" · collected มี "฿133,912.80" "24 จาก 31" "5 พ.ย." · overdue มี "฿10,200.40" "106" "305" "29 วัน" · money=false ⇒ ไม่มีการ์ด collected/overdue
- `children` (ผัง) อยู่หลัง KPI · todo `data-dorm-todo` แถว `data-todo="<kind>"` `data-count` + `<a href>` · รอบบิล `data-dorm-billing` `data-period` ส่วน `data-seg="paid|pending|unpaid"` `data-count` + ข้อความ "฿174,126.40" "฿40,213.60" "ส่งแล้ว 26 ต.ค." · ไม่มีรอบ (เห็นเงิน) ⇒ `data-billing-empty` "ยังไม่มีรอบบิล"
### 4.5 `dorm/page.tsx`
`requireUnit` · DORM · `dormAccess(m, unit.id).board` ⇒ ไม่ผ่าน `notFound()` · `date = bkkYmd(new Date())` · `cells = await roomBoard(ctx, { unitId, date })` (facade rooms) · `home = await dormHomeModel(actor, ctx, { unitId, date, cells })` · null ⇒ notFound · `<DormHome model unitSlug><RoomBoard cells={home.cells} date buildings={home.buildings} occupantLabels={home.occupantLabels} finance={home.finance} /></DormHome>` · actor จาก `auth.active` เท่านั้น · ไม่แตะ prisma

## 5. สิทธิ์
### 5.1 `permissions.ts` (โมดูล dorm · ป้ายไทยทุกคีย์ · 4 คีย์เดิมคงไว้)
ใหม่: `dorm.import` · `dorm.bill.send` · `dorm.slip.review` · `dorm.payment.manual` · `dorm.latefee.waive` · `dorm.moveout.manage` · `dorm.deposit.deduct.approve` · `dorm.repair.manage` · `dorm.announce` · `dorm.parcel.manage` · `dorm.settings.edit` · `dorm.settings.legal` (ป้ายมี "เจ้าของ") · `planned` ⊆ {import · latefee.waive · moveout.manage · deposit.deduct.approve · repair.manage · announce · parcel.manage · settings.legal} · คีย์หอที่ไม่อยู่ใน planned ต้องมีโค้ดเรียกจริงใน `src/` (นอก permissions.ts)
### 5.2 `access.ts`
```ts
dormAccess(m, unitId) → { board; meter; money; lease; settings }   // lease = dorm.lease.manage · settings = dorm.settings.edit
DORM_ROLE_COLUMNS = [{ role: "OWNER", labelTh: "เจ้าของ" }, { role: "CARETAKER", labelTh: "ผู้ดูแล" }, { role: "TECH", labelTh: "ช่าง" }, { role: "ACCOUNTANT", labelTh: "บัญชี" }]
DORM_ROLE_ROWS: { id; labelTh; keys: string[]; cells: Record<"OWNER"|"CARETAKER"|"TECH"|"ACCOUNTANT", "YES"|"NO"|"REQUEST"> }[]
dormPresetPermissions(role: "CARETAKER"|"TECH"|"ACCOUNTANT") → Record<string, boolean>  // ทุกคีย์ของทุกแถว: YES = true · NO/REQUEST = false
```
| id | labelTh (ต้องมีข้อความ) | keys | เจ้าของ | ผู้ดูแล | ช่าง | บัญชี |
|---|---|---|---|---|---|---|
| bill | ออก/ส่งบิล | bill.run bill.send | YES | YES | NO | YES |
| slip | ยืนยันสลิป | slip.review payment.manual | YES | YES | NO | YES |
| meter | จดมิเตอร์ | meter.read | YES | YES | YES | NO |
| deposit | หักประกัน | deposit.deduct.approve | YES | REQUEST | NO | NO |
| latefee | ยกเว้นค่าปรับ | latefee.waive | YES | REQUEST | NO | NO |
| legal | เปลี่ยนโหมดกฎหมาย | settings.legal | YES | NO | NO | NO |
| view | ดูผังห้อง | view | YES | YES | NO | YES |
| lease | สัญญา | lease.manage moveout.manage | YES | YES | NO | NO |
| repair | แจ้งซ่อม | repair.manage | YES | YES | YES | NO |
| notice | ประกาศ | announce parcel.manage | YES | YES | NO | NO |
| settings | ตั้งค่าหอ | settings.edit import | YES | NO | NO | NO |
(keys ย่อ = `dorm.<…>` · 6 แถวแรกเรียงตามภาพ 17) · ช่างไม่มีคีย์เงิน/`dorm.view` (คนจดมิเตอร์ไม่เห็นเงิน) · หัว/หมายเหตุใต้ตาราง: ระบบมี OWNER/MANAGER/STAFF — ชุดนี้ใช้กับ STAFF (MANAGER = ทุกข้อในหน่วยที่คุม)

## 6. หน้า 17
### 6.1 `dorm-policy-shared.ts` (ค่าล้วน)
`DORM_POLICY_LAYOUT.cards` (ลำดับ = ลำดับบนจอ · กริด 3 คอลัมน์ `col = (no−1) % 3 + 1`):
| no | key | หัว (ต้องมี) | กลุ่ม |
|---|---|---|---|
| 1 | billing | รอบบิล | rooms/billing |
| 2 | lateFee | ค่าปรับ | rooms/lateFee |
| 3 | services | ค่าบริการอื่น | rooms/services |
| 4 | notify | เตือน · ทวง | rooms/notify · rooms/msg · messaging/channel · messaging/quiet |
| 5 | deposit | เงินประกัน · สัญญา | rooms/deposit · rooms/lease · rooms/moveout |
| 6 | roles | สิทธิ์ผู้ใช้ | rooms/access (+ ตารางสิทธิ์ §5.2) |
| 7 | meter | จดมิเตอร์ | rooms/meter |
| 8 | payments | รับเงิน | payments/receiver · payments/slip · rooms/payment · rooms/tax |
| 9 | other | แจ้งซ่อม | rooms/repair · rooms/parcel · rooms/locale |
- `DORM_POLICY_GROUPS` = รายชื่อกลุ่มทั้งหมดข้างบน (ส่งเป็น `groups` ให้ `loadSettingsForm`) · `segmented: ["rooms.lateFee.kind"]` · `previewTemplateKey: "rooms.msg.bill"` · `DORM_MSG_VAR_LABEL_TH` ป้ายไทยครบทุก `templateVars` ของ def `rooms.msg.*`
- **ครอบคลุม**: ช่องชั้น UNIT (ไม่ซ่อน) ทุกช่องของ rooms ∪ payments ∪ messaging = (การ์ด 17) ∪ (กลุ่มหน้า 10: general · legal · utility · vat · money) · ไม่ซ้อนกัน · 17 ไม่มี `rooms.legal.*`
### 6.2 `loadDormPolicySettings(actor, ctx, { unitId; form?: SettingsFormModel }) → Promise<DormPolicyModel | null>`
null: ไม่ใช่ DORM ของร้าน · ผู้ดูเข้าหน่วยไม่ได้ · `dormAccess.board` ไม่ผ่าน · `form` ที่ส่งมาไม่ใช่ (unitId, UNIT) นี้ · ไม่ส่ง form ⇒ `loadSettingsForm(actor, ctx, { domains: ["rooms","payments","messaging"], groups: DORM_POLICY_GROUPS, unitId })` · ตัดกลุ่ม/ช่องที่ไม่อยู่ในการ์ดทิ้ง
```ts
type DormPolicyModel = { page: "policies"; unitId; unitName; basePath;
  form: SettingsFormModel; cards: { key; no; col; labelTh; fieldKeys: string[]; pendingLegalReview: boolean }[];
  template: { key; labelTh } | null; diffCount: number /* ช่องในการ์ดที่ differsFromTemplate */;
  roles: { columns; rows: { id; labelTh; cells }[]; applyTargets: { membershipId; nameTh }[] | null /* OWNER/MANAGER เท่านั้น · STAFF ที่เข้าหน่วยได้ · ไม่มีอีเมล/เบอร์ */ };
  depositThresholdSatang: number;  // ค่าที่มีผลของ rooms.deposit.approvalThreshold (ป้ายแถว deposit "หักประกัน > ฿2,000")
  buildingScope: { mode: "UNIT" | "BUILDING"; buildings: { id; name }[]; members: { membershipId; nameTh }[]; assignments: Record<string, string[]>; editable: boolean /* OWNER */ };
  canEdit: boolean };
```
`applyDormRolePreset(actor, ctx, { unitId; membershipId; role }) → { ok: true } | { ok: false; reason }` — เรียก `updateStaffAccess` (คีย์ทุกแถว: YES true · อื่น false · ด่านห้ามยกระดับเดิมตัดสิน) · membership ต่างร้าน/role อื่น ⇒ ปฏิเสธ · ไม่แก้ role/unitAccess
### 6.3 `DormPolicySettings.tsx` (`'use client'` · props `{ model; unitSlug; actions: { save; reset; applyRolePreset? } }` · render ด้วย `renderToStaticMarkup` ได้)
- ราก `data-dorm-policies` · เมนูซ้าย = `DormSettingsNav active="policies"` (`data-nav-active="true"` "นโยบาย · ข้อความ · สิทธิ์")
- กริด `data-dp-grid` `data-cols="3"` · การ์ด `data-dp-card="<key>"` `data-card-no` `data-col` ลำดับ 1–9 หัวมี labelTh · การ์ดที่มี pendingLegalReview ⇒ ป้าย `data-dp-chip="legal-review"` "รอตรวจกฎหมาย"
- แถวค่าตั้งทุกแถว `data-setting-key` (คีย์ละ 1 กล่องทั้งหน้า · ตรง `cards[].fieldKeys`) · ค่าเป็นเม็ด `data-dp-pill` = `formatFieldValue` · `differsFromTemplate` ⇒ `data-dp-chip="default"` มี "ค่าเริ่ม" + ค่าแม่แบบที่จัดรูปแล้ว · `!editable` ⇒ `data-locked="true"` + lockedReasonTh · ใน SSR ไม่มี `<textarea` · ไม่มีค่า enum ดิบเป็นข้อความ · `rooms.lateFee.kind` = ปุ่มแบ่งส่วน `data-dp-seg` ตัวเลือก `data-option` + `aria-pressed`
- แถบ `data-dp-diff` `data-diff-count="N"` ข้อความ "ปรับจากแม่แบบ N ข้อ" · การ์ด 4 มี `data-dp-msg-preview` (ข้อความ `rooms.msg.bill` ตัวแปรเป็นชิป `data-var` ข้อความไทย · ไม่มี `{` เหลือ)
- การ์ด 6: ตาราง `data-dp-roles` หัว `data-role` 4 ตัวตามลำดับ · แถว `data-role-row="<id>"` × 11 · เซลล์ `data-role-cell="<id>:<role>"` `data-cell` (YES "✓" · NO "—" · REQUEST "ขออนุมัติ") · แถว deposit มี "฿2,000" (จาก `depositThresholdSatang`) · ฟอร์ม `data-dp-role-apply` เฉพาะ `applyTargets` ไม่ null · ส่วน `data-dp-building-scope` `data-scope-mode` + `data-setting-key="rooms.access.buildingAssignments"` แถว `data-member` ช่อง `data-building` (`checked`)
- ไม่มีคำต้องห้าม สคบ.
### 6.4 หน้า + actions
- `settings/page.tsx`: `requireUnit` · DORM · `notFound` · `loadSettingsForm` (domains `"rooms","payments","messaging"` · groups `DORM_POLICY_GROUPS`) → `loadDormPolicySettings(..., { unitId, form })` → `<DormPolicySettings actions={{ save: saveSettingsAction, reset: resetSettingAction, applyRolePreset }}>` · ไม่อ่านสิทธิ์จาก searchParams
- `settings/actions.ts` `"use server"` export async function เท่านั้น: `applyDormRolePresetAction(unitSlug, input)` — `requireUnit` → DORM → evaluate `dorm.settings.edit` → `applyDormRolePreset` → `refresh()` · ไม่รับ tenantId/role/permissions

## 7. หนี้ N+1 (D.5)
`securityDepositHeldMany(input: { tenantId; unitId; leaseIds: string[] }) → Promise<Record<string, number>>` (account facade) = `securityDepositHeld` ต่อสัญญาทุกตัว (ทุกสมุดของร้าน · ต่างหน่วย/ไม่รู้จัก ⇒ 0) · อ่านด้วยคำสั่งเดียว (`refId in`) · ≤ 2,000 ตัว · `listLeases` เรียกครั้งเดียวนอกวน · ไม่มี `securityDepositHeld(` เหลือใน `listLeases`

## 8. เมนู
- `dorm-home-shared.ts`: `DORM_TABS` = board "ผังห้อง" `/dorm` · tenants "ผู้เช่า/สัญญา" `/dorm/tenants` · meter "จดมิเตอร์" `/dorm/meter` · settings "ตั้งค่า" `/dorm/settings` · `dormTabsFor(acc: { board; meter; leaseView }, base)` = board/settings ⇔ board · tenants ⇔ leaseView · meter ⇔ meter (บิล/แจ้งซ่อม/ประกาศ/รายงาน เพิ่มเมื่อมีหน้า)
- `dorm/layout.tsx`: `requireUnit` · DORM (อื่น notFound) · `<DormTabs>` แถบ `data-dorm-tabs` `print:hidden` · แท็บปัจจุบัน `aria-current`
- `u/[unitSlug]/page.tsx`: `UNIT_NAV.DORM` = `/dorm` "เปิดระบบหอพัก →" · `/dorm/meter` · `/dorm/settings`

## 9. ฉากภาพ «scripts/svc-qc-dorm-home-scene.mts» (builder · แบบ `svc-qc-lease-scene.mts`)
- `loadSvcQcEnv` · อ่านค่าจาก `SQC_DORM_HOME_SCENE` + `SQC_DORM_POLICY_SCENE` เท่านั้น · ต้องมีสัญญาฉาก D.5 (`createdById "SvcQcScene"`) ≥ 31 ไม่งั้น exit 3
- งวดปัจจุบัน P = (วันที่ไทยวันนี้ ≤ 5 ? เดือนนี้ : เดือนหน้า) · `dueDate` = P-05 · งวดก่อน P−1 (due (P−1)-05) · `sentAt` = min((P−1)-26, วันนี้)
- เขียน: `DormBillRun` P (SENT · 31 บิลตาม `bills`) และ P−1 (SENT · 2 บิลค้าง `prevUnpaid`) · สถานะ PAID (paid=total) / SENT · สลิป `PaymentSlip` NEEDS_REVIEW ของ `slipPending` (fileId = FileAsset private ของฉาก) · `DormRepair` OPEN ตาม `repairsOpen` · ค่าตั้งหอ `SQC_DORM_POLICY_SCENE` (แม่แบบ + 4 ค่า ผ่านเครื่องยนต์ในนามเจ้าของ)
- มีรอบของคนอื่น (createdById ≠ mark) ที่ P หรือ P−1 ⇒ exit 3 (เลน D.8 ใช้ร่วม) · idempotent `SCENE_SUMMARY` · รันซ้ำ 0/0/0 · `--clear` ลบเฉพาะแถวฉาก (คืนค่าตั้ง 4 ค่า)
- ⚠️ `DormBill.leaseId` เป็น FK Restrict ⇒ ล้างฉากต้องเรียง **D.13 `--clear` ก่อน** lease-scene `--clear` (สคริปต์ D.13 พิมพ์คำเตือนนี้ใน `--help`/ข้อความ exit)

## 10. เกณฑ์รับ · regression · X · หนี้
- «scripts/qc-svc-d.13.mts» ผ่านทุกข้อ · typecheck (ISO_MEM=9000M heap 7168) + fitness 2 โหมด · ภาพ (ผู้คุม): ฉาก R0.9 → D.5 → D.13 แล้ว `visual-svc d.13 --user owner` และ `--user fai` → PARITY หอ 01 · หอ 17 (ยอมล่วงหน้า: แท็บ บิล/แจ้งซ่อม/ประกาศ/รายงาน ยังไม่มี · ปุ่ม "ทวงทาง LINE"/"ผู้เช่าเข้าใหม่" = D.11/D.5 · การ์ด 7–9 ต่อท้าย)
- G (หลังล้างข้อมูล): qc-svc-r0.9 · qc-svc-d.6 · qc-svc-d.7 · qc-svc-d.5 (`--no-regression` ทั้งสาม) · qc-svc-r0.4 · qc-svc-r0.3 · qc-svc-d.1 · qc-svc-d.2 · qc-svc-smoke
- ⚠️ `qc-svc-b.11` S-8 ตรวจว่า types/registry/actions ไม่ถูกแก้นอก percentScale ด้วย `git diff HEAD` — รันบนทรีที่ยังไม่ commit ของใบนี้จะแดง (หลัง commit diff ว่าง) · ไม่อยู่ใน G
- X: X1 (ข้ามร้าน · ข้ามหน่วย · ข้ามอาคาร) · X9 (ชุดสิทธิ์ผ่าน updateStaffAccess · ownerOnly) · X10 (ไม่มีอีเมล/เบอร์ในโมเดล) · อื่นไม่เกี่ยว
- หนี้: มิเตอร์ยังไม่ตัดอาคาร (D.14) · แม่บ้าน/หน้าเคาน์เตอร์ (#63 · เฟส H) · หน้า "อาคาร·ชั้น·ห้อง" / "ประเภทห้อง·ค่าเช่า" ในเมนูซ้ายยังชี้ `/dorm/settings` · หน้าผู้เช่าโชว์ยอดประกันให้ผู้มี `dorm.view` (D.5 เดิม) · การยื่นขออนุมัติ (REQUEST) = D.11/D.12 · ป้ายนับบนแท็บ (บิล 3 · ซ่อม 2) = ใบที่ทำหน้านั้น

## 11. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.13.mts» · 98 ข้อ
PC 4 (ข้อมูลฉาก · เครื่องยนต์ · ฉากบนฐาน · ประกันจริง) · S 15 · R 8 · K 7 · B 8 (B-0 ตั้งขอบเขต + X1 ระดับอาคาร) · D 11 · M 4 · N 2 · P 10 · RT 1 · E 3 · U 8 (รวม U-11 หนี้ D.7) · X 2 · Q 3 · V 2 · Z 1 · G 9 (รันหลังล้าง)
- ฉากของข้อสอบ = ร้านชั่วคราว `svc-d13-*` · หน่วย UD (ฉาก README 36 ห้อง วันที่ตายตัว) · UX (2 อาคาร + ห้องไม่มีอาคาร · ประกันจริง) · UE (ไม่มีรอบบิล) · HOTEL · ร้าน B · แถวบิล/สลิป/ซ่อมเขียนตรง (ตาราง D.0) แทน D.8/D.10/D.16
- positive control ที่เขียวตั้งแต่ก่อนทำ: PC-1 PC-2 PC-3 PC-4 · S-8 S-10 S-14 S-15 · K-2 · V-1 · Z-1 (+ U-11 คาดว่าเขียวแล้วจาก D.7 ชุดแก้ N1)
