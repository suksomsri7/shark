# ใบสั่ง B.11 — จอตั้งค่าจองคิว (สร้างจากทะเบียน) + สิทธิ์ต่อบทบาท + ความเป็นส่วนตัว (เบา · ตรวจรอบเดียว — แต่แยกร้าน/สิทธิ์ต้องจริง)

> อ้าง: MASTER-PLAN แถว B.11 · BQ R10 + ภาคผนวก ก #65 #66 · CC §1.8 §8 + ภาคต่อ 28 ต.ค. · ภาพ `ledger/design-booking/08-settings.png` `11-services.png` `12-staff-resources.png` (ส่วนคน) `14-messages-devices-roles.png` (+ `.body.html` = โครงจริง) · README (ร้าน 2 แห่ง · "ปรับจากแม่แบบ 6 ข้อ")
> หนี้ที่ส่งมา: `ledger/wo-notes/svc-r0.8-carry.md` §"ภาพเทียบแบบ R0.4" (B.11 สองข้อ) · `/root/svc-runs/fix/b3.md` (Customer/Party ค้าง PDPA) · `svc-brief-b.0.md` §9 (applyTemplate แม่แบบซ่อน · สิทธิ์เงินรายฟิลด์ · scope DEVICE) · `svc-brief-b.1.md` §95–106 (จอผูกบริการ) · `docs/sds/modules/booking.md` (assertCan)
> ข้อสอบ «scripts/qc-svc-b.11.mts» ผูกสัญญาข้างล่างตรงตัว · ฉากภาพ `SQC_VISUAL_SPECS["b.11"]` + ค่าฉาก `SQC_BOOKING_SETTINGS_SCENE` ใน `scripts/svc-qc-data.mts` (ผู้คุมเขียนแล้ว)
> กติกาเหล็ก #16: ทุกแถวค่าตั้งมาจาก `loadSettingsForm` (R0.4) — **ห้ามวาดแถวค่าตั้งทีละคีย์** · หน้าห่อจัดกลุ่ม/วางตำแหน่งด้วยตาราง §3 ที่อยู่ในไฟล์ pure ไฟล์เดียว

## 1. ไฟล์
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/components/booking/settings/booking-settings-shared.ts» | ใหม่ (pure) | `BOOKING_SETTINGS_LAYOUT` (§3) · ชนิดโมเดล 4 หน้า (§4) · import ได้เฉพาะ `import type` จาก `@/lib/core/settings/types` · `@/components/settings/settings-shared` |
| «src/components/booking/settings/BookingPolicySettings.tsx» | ใหม่ `"use client"` | จอง 08 (§5.1) |
| «src/components/booking/settings/BookingServicesSettings.tsx» | ใหม่ `"use client"` | จอง 11 (§5.2) |
| «src/components/booking/settings/BookingStaffSettings.tsx» | ใหม่ `"use client"` | จอง 12 ส่วนคน (§5.3) |
| «src/components/booking/settings/BookingMessagesSettings.tsx» | ใหม่ `"use client"` | จอง 14 (§5.4) |
| «src/lib/modules/booking/settings-model.ts» | ใหม่ (server) | `loadBookingSettingsPage` · `applyBookingTemplate` · `setStaffService` · `setServiceBooking` · `applyBookingRolePreset` (§6) |
| «src/lib/modules/booking/access.ts» | ใหม่ (pure) | `BOOKING_ACTIONS` · `bookingActionKeys` · `canBookingAction` (§7.2) |
| «src/lib/modules/booking/privacy-shared.ts» | ใหม่ (pure) | `maskPhone` · `canSeeFullPhone` · `phoneForViewer` (§8.2) |
| «src/lib/modules/booking/privacy.ts» | ใหม่ (server) | `purgeBookingPersonalData` (§8.1) |
| `src/lib/modules/booking/index.ts` | แก้ (เพิ่ม export) | re-export §6 + `purgeBookingPersonalData` + ทั้ง access/privacy-shared |
| `src/lib/core/permissions.ts` | แก้ (เพิ่มอย่างเดียว) | คีย์ใหม่ + ป้ายไทย + `planned` + `BOOKING_ROLE_ROWS` `BOOKING_ROLE_PRESETS` `bookingPresetPermissions` (§7.1) |
| `src/lib/actions/booking.ts` | แก้ | ทุก action ใช้ `assertBookingAction(auth, unitId, "<ชื่อ export>", input?)` แทน `assertBookingCan` (§7.3) |
| «src/lib/actions/booking-settings.ts» | ใหม่ `"use server"` | `applyBookingTemplateAction` `setStaffServiceAction` `setServiceBookingAction` `applyBookingRolePresetAction` (§7.3) |
| `src/lib/core/settings/defs/booking.ts` | แก้ (เพิ่มป้ายอย่างเดียว) | `groupLabelsTh` ทุกกลุ่ม + `enumLabelsTh` ทุก def enum — **ห้ามแตะ key/ค่าเริ่ม/chain/schema/editPermission** (B.0 D-PERM ตรวจ) |
| `src/lib/platform/minute-jobs.ts` | แก้ | งาน `booking.privacy.purge` (§8.1) |
| `src/lib/core/settings/types.ts` · `registry.ts` · `form.ts` · `src/components/settings/settings-shared.ts` | แก้ **เพิ่มอย่างเดียว** (มติผู้คุม 29 ต.ค. · §2 ข้อ 13) | `SettingDef.percentScale?: 100 \| 10000` (ไม่ตั้ง = 10000 = bp · พฤติกรรมเดิม) · ทะเบียนตอนโหลด: ตั้งได้เฉพาะ `type: "percent"` และค่า 100/10000 เท่านั้น (ไม่งั้น throw) · `SettingsField.percentScale` (form.ts คัดลอกจาก def) · settings-shared แสดง/แปลง/ค่าในช่องกรอกตาม `percentScale` — **ห้าม heuristic จาก max** · ข้อสอบ S-8: ไม่มีบรรทัดถูกลบ และบรรทัดที่เพิ่มต้องเกี่ยว percentScale |
| `src/app/app/u/[unitSlug]/booking/layout.tsx` | แก้ | แท็บชุดแบบ (§5.0) · เลิก `max-w-2xl` ที่ครอบทั้งโมดูล |
| `…/booking/settings/page.tsx` | แก้ | หน้า 08 |
| «…/booking/settings/messages/page.tsx» | ใหม่ | หน้า 14 |
| `…/booking/services/page.tsx` · `…/booking/staff/page.tsx` | แก้ | หน้า 11 · 12 (คงปุ่มเดิม: ติ๊กเปิดรับจองจากแคตตาล็อก · ย้ายบริการเก่า · รับคิวที่สาขานี้ · รวมช่างเข้า HR) |
| `…/booking/page.tsx` | แก้ | เบอร์ผ่าน `phoneForViewer` (§8.2) |
| `src/lib/modules/booking/service.ts` | แก้ (จุดเดียว) | ติด source BOOKING/WALK_IN ให้ลูกค้าที่ทางจองสร้างใหม่ (§2 ข้อ 11 · ข้อสอบ S-13) |
| «scripts/svc-qc-booking-settings-scene.mts» | ใหม่ (สคริปต์ฉาก · builder เขียน) | §10 |

ห้าม: migration/`prisma/**` · แก้เครื่องยนต์ `src/lib/core/settings/{service,actions,template}.ts` และ `src/components/settings/SettingsForm.tsx` (ชิ้นกลาง R0.3/R0.4) · types/registry/form/settings-shared แก้ได้เฉพาะ percentScale ตามตาราง · แตะ POS/HR · `any` · build/commit/install · แก้ข้อสอบ / `scripts/svc-qc-data.mts`

## 2. มติของใบนี้ (ผู้เขียนข้อสอบตัดสิน)
1. **เส้นทาง**: 08 = `/booking/settings` · 14 = `/booking/settings/messages` (เมนูซ้าย "ข้อความ" `#messages` · "จอทีวี · ตู้ · บัตร" `#devices` · "สิทธิ์ผู้ใช้" `#roles`) · 11 = `/booking/services` · 12 = `/booking/staff` · `?service=` / `?staff=` รับ id **หรือชื่อตรงตัว** ในสาขา (ฉากภาพใช้ชื่อ) · `?msg=<kind>`
2. **ป้าย "ปรับจากแม่แบบ N ข้อ"** = จำนวนช่องในฟอร์มชั้น UNIT (domain `booking` · ทุกกลุ่ม · ทุกหน้า) ที่ `differsFromTemplate` · ค่ารายคน/รายบริการ **ไม่นับ** (ขึ้นเป็นป้าย "ปรับรายคน N" ที่แถว) · domain payments/messaging ไม่นับ · ฉาก README "6 ข้อ" = `SQC_BOOKING_SETTINGS_SCENE.barber.unitDiffs` (6 คีย์ — 2 อยู่บนการ์ด 08 · 3 ข้อความบน 14 · 1 ค่าร้านบน 12)
3. **"ดูเฉพาะที่ปรับ"** บน 08 = รายการเดียว `data-bk-changed-list` ของทุกช่องที่นับใน N (ทุกหน้า) พร้อมลิงก์ไปหน้าที่ช่องนั้นอยู่ — ไม่ใช่กรองการ์ด
4. **แม่แบบ**: เลือกได้เฉพาะเจ้าของ (เครื่องยนต์) · แม่แบบที่มี `hiddenUntil` (คลินิก) โชว์การ์ดแบบปิด "เร็ว ๆ นี้" และ **`applyBookingTemplate` ปฏิเสธ** (หนี้ B.0 §9 — ปิดที่ตัวห่อ · ตัว `applyTemplateAction` กลางยังรับได้ = หนี้ core-fix) · เปลี่ยนแม่แบบ/คืนค่าแม่แบบ **ต้องเลือก** KEEP_CUSTOM หรือ RESET_ALL ทุกครั้ง (ไม่มีค่าปริยาย) · สาขาที่ยังไม่มี `SettingProfile` = หน้า 08 แสดงแถบ "ยังไม่ได้เลือกแม่แบบ" (ค่าที่ใช้ = `_fallback` รุ่นแรก)
5. **คอลัมน์เดิมชนะค่าตั้ง** (มติ B.0/B.3): แผงบริการแก้ "เก็บห้อง" = `BookingService.bufferMin` · "จองออนไลน์" = `bookable` · "มัดจำ" = `depositSatang` ผ่าน `setServiceBooking` — แถวค่าตั้งชั้น SERVICE ของ `booking.service.cleanupMin` และ `booking.service.onlineBookable` **ไม่แสดง**ในแผง (ทำให้เข้าใจผิด) · ราคา/เวลาต้นฉบับยังอยู่แคตตาล็อก (มติเจ้าของ 13 ส.ค.)
6. **ใครทำได้** (B.1 §106): ช่างที่ไม่มีแถว `BookingStaffService` = ตาม `booking.staff.servicesMode` ชั้น STAFF (ALL ⇒ ทำได้ทุกบริการ) · มีแถว = เฉพาะแถว · `setStaffService` เก็บกติกานี้ให้ (§6.4)
7. **scope DEVICE ยังไม่รองรับในเครื่องยนต์** (B.0 §9) ⇒ ค่าทีวี/ตู้ (`booking.display.*` `booking.kiosk.*` chain DEVICE อย่างเดียว) บนหน้า 14 = แถว **อ่านอย่างเดียว** ค่าจากแม่แบบ + เหตุผล "ตั้งต่อเครื่อง…" (มีคำว่า "เครื่อง") · ยกเว้น `booking.queue.walkInPickStaff` (มี UNIT) แก้ได้ในการ์ดตู้ · เปิดแก้จริง = B.6 + ใบ core-fix
8. **บทบาท 4 คอลัมน์ของภาพ 14** = เจ้าของ (OWNER · ติ๊กครบ ล็อก) · หัวหน้าร้าน (`LEAD`) · ผู้ให้บริการ (`PROVIDER` · หัวคอลัมน์ = `booking.general.providerLabel`) · แคชเชียร์ (`CASHIER`) — 3 ตัวหลังเป็น **ชุดสิทธิ์ของบทบาท STAFF** (ระบบมี OWNER/MANAGER/STAFF เท่านั้น · MANAGER = ทุกข้อในสาขาที่คุมตาม `evaluate` · เขียนหมายเหตุใต้ตาราง) · ตารางแสดงชุดตามแม่แบบของสาขา (#65 "ไม่ใช่ def") · แก้รายคน = ปุ่ม "ใช้ชุดสิทธิ์กับพนักงาน" (`applyBookingRolePreset` ผ่าน `updateStaffAccess` เดิม — ด่านห้ามยกระดับเดิมทำงาน) + ลิงก์หน้าพนักงาน · ไม่มีที่เก็บตารางแก้ระดับร้าน (หนี้ ถ้าเจ้าของต้องการ)
9. **เงินของช่าง/แคชเชียร์**: ชุด PROVIDER/CASHIER ไม่มีคีย์เงินใด ๆ (`booking.settings.money` `booking.service.setDeposit` `booking.deposit.refund|waive|forfeit`) · ราคาเฉพาะคน/มัดจำบริการในฟังก์ชันใหม่ต้อง `booking.settings.money`
10. **`setStatusAction`** แยกสิทธิ์ตามสถานะปลายทาง (§7.2) — คง `booking.appointment.setStatus` เดิมเป็นทางเลือก (ร้านเดิมไม่พัง) · "งานของตัวเอง" ยังไม่ตรวจความเป็นเจ้าของ (ไม่มีทางผูกช่าง↔ผู้ใช้ที่เชื่อถือได้) = หนี้ B.5
11. **ความเป็นส่วนตัว**: ลูกค้าที่ทางจองสร้างใหม่ต้องติด `Customer.source = "BOOKING"` (walk-in = `"WALK_IN"`) ใน `src/lib/modules/booking/service.ts` (อัปเดตหลัง `findOrCreate` เฉพาะแถวที่ source ยังว่างและเพิ่งสร้างในคำขอนี้ · ไม่แก้ member) — ไม่งั้นแถวค้างจากแข่งจอง (หนี้ B.3) เป็น source ว่างซึ่งงานลบไม่แตะ · "ลบข้อมูล walk-in" = **ลบเบอร์/ชื่อออกจากแถว** (นัด/บัตรคิวอยู่ต่อเพื่อรายงาน/บิล) · Customer/Party ที่ไม่มีอะไรอ้างถึงเลย = ลบแถว (§8.1)
12. `?service=` ที่ไม่อยู่ในสาขา/ร้าน ⇒ โมเดล `null` (หน้า `notFound()`) — ไม่ถอยไปแถวแรก (กันเดา id ข้ามร้าน)
13. **บั๊กหน่วย %** (มติผู้คุม 29 ต.ค.): def จองคิวชนิด `percent` เก็บเป็น % เต็ม 0–100 (schema B.0) แต่ R0.4 ถือ percent = bp ⇒ เม็ดค่าแสดง "0.6%" และกรอก "70" ได้ 7000 · แก้ด้วยฟิลด์เสริม `percentScale` (ดูตาราง §1) · def ที่ต้องตั้ง `percentScale: 100` = **ทุก def percent ของ booking ตอนนี้: `booking.booking.onlineSharePct` `booking.deposit.forfeitPct`** (ข้อสอบ R-4 ล็อกรายการนี้ — เพิ่ม def percent ใหม่ต้องตั้ง scale) · rooms/payments/messaging ไม่ตั้ง (= bp) · การเพิ่มฟิลด์ใน def booking ไม่เปลี่ยน key/ค่าเริ่ม/chain/schema/editPermission (B.0 ยังเขียว)

## 3. `BOOKING_SETTINGS_LAYOUT` (booking-settings-shared.ts · ค่าล้วน)
```ts
type BookingCardKey = "booking" | "late" | "deposit" | "queue" | "money" | "notify" | "general" | "course" | "payments";
BOOKING_SETTINGS_LAYOUT = {
  policyCards: { key: BookingCardKey; no: number; column: "left" | "right"; labelTh: string; groups: { domain: string; group: string }[]; extraKeys?: string[]; excludeKeys?: string[] }[];
  messagesKeys: { messages: { domain; group }[]; msgSettingsKeys: string[]; kioskEditableKeys: string[] };
  servicesShopGroups: { domain; group }[]; staffShopGroups: { domain; group }[];
  servicePanelExclude: string[];   // ["booking.service.cleanupMin", "booking.service.onlineBookable"]
}
```
ตำแหน่งที่ข้อสอบตรวจ (ลำดับ = ลำดับบนจอ):
| no | key | คอลัมน์ | หัว (ต้องมีข้อความนี้) | ช่อง |
|---|---|---|---|---|
| 1 | booking | left | เวลาและการจอง | กลุ่ม `booking` |
| 2 | late | left | มาสาย · ไม่มา · ยกเลิก | กลุ่ม `late` |
| 3 | deposit | right | มัดจำ | กลุ่ม `deposit` |
| 4 | queue | left | walk-in และลำดับคิว | กลุ่ม `queue` **ยกเว้น** `booking.queue.walkInPickStaff` |
| 5 | money | right | ค่าคอมมิชชัน | กลุ่ม `money` |
| 6 | notify | right | แจ้งเตือนและหน้าจอ | กลุ่ม `notify` + `messaging.channelOrder` + แถวลิงก์ "แก้ข้อความ · ตั้งจอทีวี/ตู้ · สิทธิ์ผู้ใช้" → หน้า 14 |
| 7 | general | left | ทั่วไป | กลุ่ม `general` |
| 8 | course | right | คอร์ส | กลุ่ม `course` |
| 9 | payments | right | รับเงินและตรวจสลิป | domain `payments` ทุกกลุ่ม |
- หน้า 14: ข้อความ = กลุ่ม `msg` (11 คีย์) + `messaging.lineConnectionId` `messaging.quietHours` · การ์ดตู้ = `booking.queue.walkInPickStaff` (แก้ได้) + `booking.kiosk.*` (ล็อก) · การ์ดทีวี = `booking.display.*` (ล็อก) · สิทธิ์ = ตารางบทบาท + การ์ดความเป็นส่วนตัว (ชั้น TENANT · `booking.privacy.walkInRetentionDays`)
- หน้า 11 กล่องค่าร้าน = ช่องชั้น UNIT ของกลุ่ม `service` (+ ยอมให้มี `booking.money.commissionRate` `booking.deposit.amount` ซ้ำได้) · หน้า 12 กล่องค่าร้าน = ช่องชั้น UNIT ของกลุ่ม `staff` (+ `booking.booking.onlineSharePct` ซ้ำได้)
- **ข้อสอบ**: ช่อง UNIT ทุกช่อง (ไม่ซ่อน) ของ booking/payments/messaging = 08 ∪ 14 ∪ กล่องค่าร้าน 11 ∪ กล่องค่าร้าน 12 · 08 ∩ 14 = ∅ · ไม่มีคีย์ซ้ำในหน้าเดียว (ยกเว้นรายการ "ดูเฉพาะที่ปรับ")
- ข้อความ "booking.<กลุ่ม>.<ชื่อ>" ในไฟล์ `.tsx` ทั้ง 4 ห้ามมี (ตำแหน่งอยู่ในไฟล์นี้ไฟล์เดียว)

## 4. โมเดล (JSON ล้วน · ไม่มี function/Date/zod — ส่งเป็น prop ของ client ได้)
ทุกหน้ามี `page` · `unitId` · `unitName` · `basePath` (`/app/u/<slug>/booking`) · `providerLabel` (ค่า `booking.general.providerLabel` ที่มีผล) · `canEdit: boolean` (มีช่องแก้ได้อย่างน้อย 1)
- **policy**: `form: SettingsFormModel` (UNIT · domains booking+payments+messaging) · `template: { key; labelTh } | null` · `templates: { key; labelTh; active: boolean; hidden: boolean; summaryTh: string[] /*1–3 บรรทัดไทย*/ }[]` (ไม่ซ่อนก่อน · ซ่อนท้าย) · `diffCount` · `diffKeys: string[]` · `diffLinks: Record<key, "policy"|"messages"|"services"|"staff">` · `cards: { key; no; column; labelTh; fieldKeys: string[] }[]` · `canApplyTemplate` (OWNER)
- **messages**: `form` (UNIT) · `tenantForm: SettingsFormModel | null` (TENANT · กลุ่ม privacy) · `msgKinds: { kind; labelTh; enabled: boolean; key: string /*booking.msg.<kind>*/ }[]` (ลำดับ MSG_KINDS) · `selectedKind` · `preview: { th: string }` (render ข้อความ selectedKind ด้วยค่าตัวอย่างทุกตัวแปร) · `devices: { tv: Row[]; kiosk: Row[] }` (`Row = { key; labelTh; valueTh; editable: false; lockedReasonTh } | SettingsField`) · `roles: { columns: { role: "OWNER"|"LEAD"|"PROVIDER"|"CASHIER"|"ASSISTANT"; labelTh }[]; rows: { id; labelTh; cells: Record<role, boolean> }[]; applyTargets: { membershipId; nameTh }[] | null }` (`applyTargets` = เฉพาะผู้ดู OWNER/MANAGER · ไม่มีอีเมล/เบอร์)
- **services**: `shopForm` (UNIT · groups service) · `serviceForm: SettingsFormModel | null` (SERVICE · scopeId = BookingService.id) · `rows: { id; name; durationMin; bufferMin; priceSatang; depositSatang; requiresTh: string; canCount: number; staffTotal: number; bookable: boolean; walkIn: boolean }[]` (BookingService active ของสาขา · `sortOrder,name`) · `selectedId` · `who: { staffId; name; can: boolean; priceSatang: number | null; durationMin: number | null }[]` (ช่าง active ทั้งหมด)
  - `walkIn` = `booking.service.walkIn` ที่มีผลของบริการ: `enabled && (closeAtOrAboveMin === null || durationMin < closeAtOrAboveMin)`
- **staff**: `shopForm` (UNIT · groups staff) · `staffForm` (STAFF) · `rows: { id; name; hoursSource: "HR_SHIFT"|"STAFF_WEEKLY"|"UNIT_HOURS"; onlinePct: number; servicesTh: string; commissionBp: number | null; linked: boolean }[]` · `selectedId` · `week: { weekday: 0..6; startMin: number | null; endMin: number | null }[]` (7 วัน ของช่างที่เลือก · null = หยุด)
  - `hoursSource` = ตัวแรกตามลำดับ `booking.staff.hoursSource` (STAFF) ที่ "มีข้อมูล": HR_SHIFT ⇔ `employeeId` ไม่ว่าง · STAFF_WEEKLY ⇔ มีแถว `BookingStaffHours` · UNIT_HOURS เสมอ · `week` = แถวของช่าง (STAFF_WEEKLY) ไม่งั้นเวลาร้าน (`BookingHours`)
  - `linked` = `employeeId` ไม่ว่าง (ไม่ผูก ⇒ เตือนค่าคอมฯ ไม่ถูกบันทึก — CC §10 ข้อ 2)

## 5. DOM (ข้อสอบ render ด้วย `react-dom/server` `renderToStaticMarkup(<C model actions view?/>)` — ห้าม hook ของ next ตอน render)
props: `{ model; actions: { save; reset; applyTemplate?; setStaffService?; setServiceBooking?; applyRolePreset? }; view?: { onlyChanged?: boolean } }`
### 5.0 ร่วม
- ราก `data-bk-settings-page="policy|messages|services|staff"` · แถวค่าตั้งทุกแถว = `data-setting-key` (กล่องเดียวต่อคีย์ต่อส่วน) · ช่องที่ `!editable` ⇒ `data-locked="true"` + ข้อความ `lockedReasonTh`
- แถวกะทัดรัด: ป้าย+คำอธิบายซ้าย · ค่าเป็นเม็ด `data-bk-pill` (ข้อความ = `formatFieldValue(field, field.value)`) · bool = `role="switch"` + `aria-checked` · ตัวแก้ (input/select/textarea) โผล่เมื่อกดเม็ด — **ใน SSR การ์ด 1–9 ไม่มี `<textarea`**
- ป้าย `data-bk-chip="changed"` (มีคำว่า "ปรับแล้ว" และ "แม่แบบ") เฉพาะช่อง `differsFromTemplate` · `data-bk-chip="override"` (มีตัวเลข `overrideCount`) เมื่อ `overrideCount > 0`
- ปุ่มทุกปุ่ม ≥ 44px ตามกติกา R0.4 · ข้อความที่มองเห็นเป็นไทย (ค่า enum ดิบห้ามเป็น text node) · ค่าลับ (masked) ไม่อยู่ใน HTML
- แท็บโมดูล (layout): ลำดับ "คิววันนี้" (`/booking`) · `<providerLabel>` (`/booking/staff`) · "บริการ" (`/booking/services`) · "เวลาทำการ" (`/booking/hours`) · "ตั้งค่า" (`/booking/settings`) — ปฏิทิน/รายงาน เพิ่มเมื่อมีหน้า (B.14/B3)
### 5.1 จอง 08 (`BookingPolicySettings`)
- เมนูซ้าย `<nav data-bk-nav>` · รายการ `data-bk-nav-item` ลำดับ `policy` "แม่แบบและนโยบาย" · `messages` "ข้อความแจ้งเตือน" · `devices` "จอทีวี · ตู้ · บัตร" · `roles` "สิทธิ์ผู้ใช้" · `integrations` "ศูนย์เชื่อมต่อ" (href `/app/settings/integrations`) · หน้าปัจจุบัน `aria-current="page"` (ใช้ร่วมหน้า 14)
- แถวการ์ดแม่แบบ `data-bk-templates` · การ์ด `data-template-card="<KEY>"` `data-active` `data-hidden` · การ์ดที่ใช้อยู่มีป้าย "ใช้อยู่" · ซ่อน = "เร็ว ๆ นี้" ไม่มีปุ่มเลือก · ปุ่มเลือก `data-template-pick="<KEY>"` (เฉพาะ `canApplyTemplate` และไม่ใช่การ์ดที่ใช้อยู่)
- กล่องยืนยัน `data-template-confirm` (อยู่ใน markup ได้แบบ `hidden`) มีปุ่ม `data-overwrite="KEEP_CUSTOM"` ("คงค่าที่ปรับไว้") และ `data-overwrite="RESET_ALL"` ("ล้างค่าที่ปรับ") — เฉพาะ `canApplyTemplate`
- ไม่มีแม่แบบ: `data-bk-no-template` มีคำ "ยังไม่ได้เลือกแม่แบบ" · ไม่มีการ์ด `data-active="true"` · ไม่มีแถบ diff
- แถบ `data-bk-diff-bar` `data-diff-count="N"` ข้อความมี labelTh แม่แบบ + `ปรับจากแม่แบบแล้ว N ข้อ` · ปุ่ม `data-bk-action="only-changed"` "ดูเฉพาะที่ปรับ" · `data-bk-action="reset-template"` "คืนค่าแม่แบบ" (เฉพาะ `canApplyTemplate`)
- การ์ด `data-bk-group="<card key>"` `data-group-no="<no>"` หัวมีเลข + labelTh · ตู้สองคอลัมน์ `data-bk-cols="2"` > `data-bk-col="left"` / `data-bk-col="right"` ตาม §3 · การ์ดว่าง (ไม่มีช่อง) ไม่ต้องแสดง
- `view.onlyChanged` ⇒ แสดง `data-bk-changed-list` แทนการ์ด: แถว `data-setting-key` = `diffKeys` พอดี · แต่ละแถวมีลิงก์ไปหน้าของมัน
### 5.2 จอง 11 (`BookingServicesSettings`)
- ตาราง `data-bk-services-table` · แถว `data-service-id` (`data-selected="true"` ที่เลือก) · เซลล์ `data-col` = `name` · `minutes` ("<duration> · <buffer>") · `price` ("฿…") · `deposit` ("—" เมื่อ 0) · `requires` · `staff` ("<can>/<total>") · `online` ("✓"/"—" จาก `bookable`) · `walkin` ("✓"/"—")
- แผงขวา `data-bk-service-panel` `data-service-id` หัว "<ชื่อ> · ตั้งค่าการจอง" · แถวคอลัมน์ `data-bk-col-field="bufferMin|bookable|depositSatang"` · แถวค่าตั้งชั้น SERVICE (`serviceForm` ยกเว้น §2 ข้อ 5)
- รายการ "ใครทำได้ (ราคา/เวลาเฉพาะคน)" `data-bk-who` · แถว `data-staff-id` `data-can` `data-price-satang` (ราคาเฉพาะคน หรือว่าง) `data-duration-min` (หรือว่าง) · ข้อความ: ทำไม่ได้ ⇒ "ไม่รับบริการนี้" · ไม่มีค่าเฉพาะ ⇒ "ตามค่าบริการ" · ราคาเฉพาะ ⇒ มี "฿" · เวลาเฉพาะ ⇒ มี "<n> นาที"
- กล่องค่าร้าน `data-bk-shop-defaults` (§3)
### 5.3 จอง 12 (`BookingStaffSettings`)
- ตาราง `data-bk-staff-table` · แถว `data-staff-id` `data-hours-source` · เซลล์ `data-col` = `name` · `hours` · `online` ("<n>%") · `services` · `commission` · คนที่ไม่ผูก ⇒ `data-bk-warn="no-user"` มีคำว่า "ค่าคอม"
- แผง `data-bk-staff-panel` `data-staff-id` หัว "<ชื่อ> · ตั้งค่าการรับงาน" · แถวชั้น STAFF ทุกแถวของ `staffForm` · แถบสัปดาห์ `data-bk-week` · ชิป `data-weekday="0".."6"` (หยุด ⇒ "หยุด" · ไม่หยุด ⇒ มีชั่วโมงเริ่ม/จบ เช่น "13–22")
- กล่องค่าร้าน `data-bk-shop-defaults`
### 5.4 จอง 14 (`BookingMessagesSettings`)
- เมนูซ้ายเดียวกับ 08 (`messages` เป็น `aria-current`)
- `data-bk-messages` · แถว `data-msg-kind` ×10 ลำดับ MSG_KINDS · สวิตช์ `role="switch"` `aria-checked` = `booking.msg.enabled[kind]`
- ตัวแก้ `data-bk-msg-editor` `data-msg-kind="<selected>"`: แถวค่าตั้ง `booking.msg.<kind>` (template) · ปุ่มตัวแปร `data-var="{<ชื่อ>}"` ครบ `templateVars` · ตัวอย่าง LINE `data-bk-line-preview` = `model.preview.th` (ไม่มี `{` เหลือ)
- `id="devices"` `data-bk-devices`: `data-bk-device-card="tv"` · `data-bk-device-card="kiosk"` · แถว DEVICE ล็อก (§2 ข้อ 7)
- `id="roles"` `data-bk-roles`: หัว `data-role` (ลำดับ OWNER LEAD PROVIDER CASHIER · CLINIC เพิ่ม ASSISTANT) · แถว `data-role-row="<id>"` ×10 · เซลล์ `data-role-cell="<id>:<role>"` `data-checked` · การ์ดความเป็นส่วนตัว `data-bk-privacy` (แถว `booking.privacy.walkInRetentionDays` จาก `tenantForm`) · ฟอร์มใช้ชุดสิทธิ์ `data-bk-role-apply` เฉพาะเมื่อ `applyTargets` ไม่ null

## 6. ฟังก์ชัน server (settings-model.ts · ไม่ throw ในทางปกติ · ข้อความไทยไม่โทษผู้ใช้)
`actor: SettingsActor` (`{ role; unitAccess; permissions; userId }` จาก `auth.active` เท่านั้น) · `ctx: { tenantId }`
1. `loadBookingSettingsPage(actor, ctx, q: { unitId; page; serviceId?; staffId?; msgKind? }) → Promise<Model | null>` — `null` เมื่อ: unit ไม่ใช่ของร้าน/ไม่ใช่ BOOKING (X1) · ผู้ดูเข้า unit ไม่ได้ · `serviceId`/`staffId` ระบุแต่ไม่พบในสาขา (id หรือชื่อ) · `msgKind` ไม่รู้จัก · ไม่ระบุ ⇒ แถวแรก / `confirmation` · ใช้ `loadSettingsForm` เท่านั้นสำหรับช่องค่าตั้ง
2. `applyBookingTemplate(actor, ctx, { unitId; templateKey; overwrite }) → RemoveResult` — แม่แบบซ่อน/ไม่รู้จัก ⇒ `{ ok:false, code:"VALIDATION" }` (ไม่เขียน) · overwrite ไม่ใช่ 2 ค่า ⇒ VALIDATION · ที่เหลือ = `applyTemplate` ของเครื่องยนต์ (domain "booking")
3. `setServiceBooking(actor, ctx, { unitId; serviceId; bufferMin?; bookable?; depositSatang? }) → { ok:true } | { ok:false; code: "NOT_FOUND"|"PERMISSION"|"BAD_INPUT"; reason }` — สิทธิ์ `booking.service.update` (+ `booking.settings.money` ถ้าส่ง depositSatang) ผ่าน `evaluate` · bufferMin int 0–240 · depositSatang int 0–100,000,000 · บริการต่างสาขา/ร้าน ⇒ NOT_FOUND (ไม่เขียน) · audit `booking.service.settings`
4. `setStaffService(actor, ctx, { unitId; staffId; serviceId; can: boolean; priceSatang: number | null; durationMin: number | null }) → { ok:true } | { ok:false; code: "NOT_FOUND"|"PERMISSION"|"BAD_INPUT"|"LAST_SERVICE"; reason }`
   - สิทธิ์ `booking.staff.create` · ราคาเปลี่ยนจากเดิม (รวม null→ค่า) ⇒ ต้อง `booking.settings.money` ด้วย · price int 0–100,000,000 | null · duration int 5–600 | null · `can=false` พร้อม price/duration ไม่ null ⇒ BAD_INPUT
   - ช่างไม่มีแถว (ทำทุกบริการเพราะ servicesMode ALL) แล้ว `can=false` หรือใส่ค่าเฉพาะ ⇒ สร้างแถวให้ **ทุกบริการ active อื่นที่เขาทำได้** ก่อน (ผลลัพธ์ "ทำได้" ของบริการอื่นไม่เปลี่ยน) · `can=false` ลบแถวบริการนี้ · ถ้าจะเหลือ 0 แถว ⇒ LAST_SERVICE (ไม่เปลี่ยนอะไร) · `can=true` ไม่มีค่าเฉพาะบนช่างที่มีแถว ⇒ upsert แถว null/null · ทั้งหมดใน tx เดียว · staff/service ต่างสาขา/ร้าน/ไม่ active ⇒ NOT_FOUND
5. `applyBookingRolePreset(actor, ctx, { unitId; membershipId; role: "LEAD"|"PROVIDER"|"CASHIER" }) → { ok:true } | { ok:false; reason }` — ชุดตามแม่แบบของสาขา (ไม่มีแม่แบบ = BARBER) · เรียก `updateStaffAccess` (คีย์ใน `BOOKING_ROLE_ROWS` ทุกตัว: ในชุด = true · ไม่อยู่ = false) — ด่านเดิม (ห้ามยกระดับ · ห้ามแก้ตัวเอง) ตัดสิน · membership ต่างร้าน ⇒ ปฏิเสธ · ไม่แก้ role/unitAccess

## 7. สิทธิ์
### 7.1 `permissions.ts` (โมดูล booking · ป้ายไทยทุกคีย์ · คีย์ที่ยังไม่มีโค้ดเรียก `assertCan`/`evaluate`/`canBookingAction` ต้องอยู่ใน `planned`)
ใหม่ (CC §8): `booking.queue.operate` · `booking.checkin` · `booking.walkin.create` · `booking.job.run` · `booking.job.runAny` · `booking.deposit.confirm` · `booking.devices.manage` · ใหม่ (ใบนี้ — แถวของภาพ 14): `booking.appointment.reschedule` (ยกเลิก/เลื่อนนัดแทนลูกค้า) · `booking.deposit.waive` · `booking.deposit.forfeit` · `booking.customer.phoneFull` · `booking.report.view` · ของเดิม 13 คีย์คงไว้ทั้งหมด
```ts
export const BOOKING_ROLE_ROWS: readonly { id: string; labelTh: string; keys: readonly string[] }[]  // 10 แถว: 9 แถวภาพ 14 + "รับมัดจำ" แถวที่ 4 (มติผู้คุม 29 ต.ค. — มัดจำไม่ให้ช่างโดยปริยาย)
export type BookingRolePreset = "LEAD" | "PROVIDER" | "CASHIER" | "ASSISTANT";
export const BOOKING_ROLE_PRESETS: Record<"BARBER" | "SPA" | "CLINIC", Partial<Record<BookingRolePreset, readonly string[] /*row ids*/>>>;
export function bookingPresetPermissions(templateKey: string, role: BookingRolePreset): Record<string, boolean>; // ทุกคีย์ของ ROWS: true/false · แม่แบบไม่รู้จัก = BARBER
```
| id | labelTh (ตรงตัว) | keys | LEAD | PROVIDER | CASHIER |
|---|---|---|---|---|---|
| job.own | เรียก · เริ่ม · เสร็จ งานของตัวเอง | `booking.job.run` | ✓ | ✓ | — |
| job.any | เรียก/ย้ายงานของช่างคนอื่น | `booking.job.runAny` `booking.queue.operate` | ✓ | — | — |
| counter | จองให้ลูกค้า · เช็กอิน · ออกบัตร | `booking.appointment.create` `booking.checkin` `booking.walkin.create` | ✓ | ✓ | ✓ |
| deposit.take | รับมัดจำ · ยืนยันสลิปมัดจำ | `booking.deposit.record` `booking.deposit.confirm` | ✓ | — | ✓ |
| reschedule | ยกเลิกนัด · เลื่อนนัดแทนลูกค้า | `booking.appointment.reschedule` | ✓ | — | ✓ |
| deposit.waive | ยกเว้นมัดจำ / คืนมัดจำ | `booking.deposit.waive` `booking.deposit.refund` | ✓ | — | — |
| deposit.forfeit | ยึดมัดจำเมื่อไม่มา (ระบบทำอัตโนมัติ) | `booking.deposit.forfeit` | ✓ | — | — |
| phone | เห็นเบอร์โทรลูกค้าเต็ม | `booking.customer.phoneFull` | ✓ | — | ✓ |
| settings | แก้ตั้งค่า · บริการ · ช่าง | `booking.settings.edit` `booking.settings.money` `booking.service.create` `booking.service.update` `booking.service.setDeposit` `booking.staff.create` `booking.staff.delete` `booking.hours.set` `booking.devices.manage` | — | — | — |
| report | ดูรายงาน · ยอดเงิน | `booking.report.view` | ✓ | — | — |
BARBER = SPA (#65 "เหมือนกัน") · CLINIC = ชุดเดียวกัน + `ASSISTANT` = counter · reschedule · phone (ไม่มี deposit.take) (ซ่อนจนเฟสคลินิก — นิยามไว้)
หมายเหตุ: `booking.appointment.setStatus` (คีย์เดิม) ไม่อยู่ในชุดใด — ร้านเดิมที่ถืออยู่ยังทำงาน (§7.2)
### 7.2 `access.ts` (pure · import `evaluate` จาก `@/lib/core/rbac` ได้)
- `BOOKING_ACTIONS: Record<string, readonly string[]>` — ชื่อ export ของ action ทุกตัวใน `src/lib/actions/booking.ts` + `booking-settings.ts` → คีย์ (ผ่านเมื่อมี **อย่างน้อยหนึ่ง**):
  `setServiceDepositAction` [service.setDeposit] · `recordDepositAction` [deposit.record, deposit.confirm] · `refundDepositAction` [deposit.refund] · `addStaffAction` `setStaffReceivingAction` `linkStaffToHrAction` [staff.create] · `removeStaffAction` [staff.delete] · `setBookingHoursAction` `addClosureAction` `removeClosureAction` [hours.set] · `setServiceOfferedAction` [service.update] · `importServicesToCatalogAction` [service.create] · `setStatusAction` (ตามสถานะ ↓) · `applyBookingTemplateAction` [settings.edit] · `setStaffServiceAction` [staff.create] · `setServiceBookingAction` [service.update] · `applyBookingRolePresetAction` [settings.edit]
- `bookingActionKeys("setStatusAction", { status })`: CANCELLED ⇒ [appointment.setStatus, appointment.reschedule] · NO_SHOW ⇒ [appointment.setStatus, job.runAny] · PENDING/CONFIRMED ⇒ [appointment.setStatus, appointment.reschedule] · ARRIVED ⇒ [appointment.setStatus, checkin] · DONE ⇒ [appointment.setStatus, job.run, job.runAny] · อื่น/ไม่ส่ง ⇒ [appointment.setStatus]
- `canBookingAction(m: MembershipCtx, unitId, action, input?) → boolean` = มีคีย์ใดผ่าน `evaluate(m, { module: "booking", action: key, unitId })` · ชื่อ action ไม่รู้จัก ⇒ false
### 7.3 actions
- `src/lib/actions/booking.ts`: ทุก `export async function` เรียก `assertBookingAction(auth, unit.id, "<ชื่อตัวเอง>"[, { status }])` (ตัวช่วยในไฟล์ · ใช้ `canBookingAction` · ไม่ผ่าน ⇒ throw แบบ `assertCan`) **ก่อน**อ่าน/เขียนฐาน · ห้ามเหลือ `assertBookingCan(`
- `booking-settings.ts`: `"use server"` · export async function เท่านั้น · รับ `(unitSlug, input)` · `requireUnit` → `assertBookingAction` → เรียกฟังก์ชัน §6 (actor จาก `auth.active`) → `refresh()` เมื่อสำเร็จ · ไม่รับ tenantId/role/permissions จาก client

## 8. ความเป็นส่วนตัว
### 8.1 `purgeBookingPersonalData(now: Date, opts?: { tenantIds?: string[] }) → Promise<{ appointments: number; tickets: number; customers: number; parties: number }>`
- ต่อสาขา BOOKING: N = `booking.privacy.walkInRetentionDays` ที่มีผล (refs `{ unitId }`) · **N = null ⇒ ไม่แตะสาขานั้น** (`_fallback` = ไม่ลบ) · cutoff = now − N วัน
- (ก) `Appointment` ของสาขา: `kind = 'WALKIN'` · `customerId IS NULL` · `startAt < cutoff` · ยังมีชื่อ/เบอร์ ⇒ `customerName = "ลูกค้า walk-in"` · `customerPhone = ""` · `note = null` · `partyId = null` (นับ appointments)
- (ข) `QueueTicket` ของสาขา: `memberId IS NULL` · `createdAt < cutoff` · ยังมี contact ⇒ `contactName/contactPhone/contactEmail = null` · `partyId = null` (นับ tickets)
- (ค) `Customer` ที่ค้างจากการแข่งจอง (หนี้ B.3): อยู่ในระบบสมาชิกที่ผูก (`AppSystemUnit` MEMBER) กับสาขาที่มี N · `createdAt < cutoff` ของสาขานั้น (ผูกหลายสาขา ⇒ ใช้ N มากสุด) · **`source` ∈ {BOOKING, WALK_IN} เท่านั้น** (มติผู้คุม 29 ต.ค.: source ว่าง/ช่องทางสมัครเอง/IMPORT ฯลฯ **ไม่ลบเด็ดขาด**) · `visitCount = 0` · `totalSpentSatang = 0` · `tierPoints = 0` · `marketingConsent = false` · `consentAt`/`email`/`lineUserId`/`note`/`referralCode`/`mergedIntoId` ว่าง · **ไม่มีแถวใดในฐานอ้างถึง** — ตรวจทุกโมเดลจาก `Prisma.dmmf` ที่มีคอลัมน์สตริงชื่อ `customerId` `memberId` `referredById` `mergedIntoId` หรือลงท้าย `CustomerId`/`MemberId` (ห้ามพิมพ์รายชื่อตารางมือ) ⇒ **ลบแถว**
- (ง) `Party` ที่หลุดจาก (ก)–(ค) (เฉพาะ id ที่ถูกตัด/ลบในรอบนี้): `createdAt < cutoff` · ไม่มีโมเดลใดอ้าง (คอลัมน์ `partyId` หรือลงท้าย `PartyId` + `Party.mergedIntoId`) ⇒ ลบแถว
- ร้าน/สาขาอื่นไม่ถูกแตะ (`opts.tenantIds` จำกัดร้าน · ไม่ส่ง = ทุกร้าน) · รันซ้ำ = 0 ทุกตัว · 2 รอบพร้อมกัน (X5) ไม่ throw และผลรวมเท่ารอบเดียว (ล็อก advisory ต่อร้าน/`SKIP LOCKED`) · AuditLog `booking.privacy.purged` ต่อร้านเมื่อมีอะไรถูกตัด (จำนวนเท่านั้น · ไม่มีชื่อ/เบอร์ — X8) · ทำทีละชุด ≤ 500 แถว/ชนิด/รอบ
- minute-job `booking.privacy.purge` · `everyMinutes` 60 · ไม่ vpsOnly · lazy import facade (แบบ `booking.depositHolds.expire`)
### 8.2 ซ่อนเบอร์ (privacy-shared.ts · pure)
- `maskPhone(p)`: เอาเฉพาะตัวเลข · ว่าง/null ⇒ `""` · < 4 หลัก ⇒ `"•••"` · อื่น ⇒ `"•••-•••-" + 4 หลักท้าย` (ไม่มีเลขหน้าเหลือ)
- `canSeeFullPhone(m: MembershipCtx, unitId)` = `evaluate(booking.customer.phoneFull)` · `phoneForViewer(m, unitId, phone)` = เต็มหรือ `maskPhone`
- หน้า `booking/page.tsx` แสดงเบอร์ผ่าน `phoneForViewer` เท่านั้น (ห้าม `{a.customerPhone}` ตรง)

## 9. เกณฑ์รับ
1. «scripts/qc-svc-b.11.mts» ผ่านทุกข้อ (SKIP ยอมได้: `V-*` ไม่มี QC_BASE · `Q-*` ร้าน svcqc ยังไม่ seed · `G-*` เมื่อ `--no-regression` — ผู้คุมรันครบก่อนรับ)
2. regression (หมวด G): `qc-svc-r0.3` · `qc-svc-r0.4` · `qc-svc-b.0` · `qc-svc-b.1` · `qc-svc-b.3` · `qc-booking-deposit` · `qc-booking-race` · `qc-booking-edit-schedule` · `qc-hr-leave-booking` · `qc-svc-smoke`
3. typecheck (ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168) + fitness 2 โหมด
4. ภาพ (ผู้คุม): รันฉาก §10 → `visual-svc b.11` owner 1440/390 → PARITY 08 · 11 · 12 (ส่วนคน) · 14 เทียบ PNG ในแบบ (ส่วนต่างที่ยอมรับล่วงหน้า: แท็บปฏิทิน/รายงานยังไม่มี · ตารางทรัพยากรของ 12 = B.13 · วิธีเก็บมัดจำมี 2 แบบ (Beam = P.1) · การ์ด 7–9 ต่อท้าย)

## 10. สคริปต์ฉาก «scripts/svc-qc-booking-settings-scene.mts» (builder · แบบ `svc-qc-utility-scene.mts`)
- ด่าน env qc-svc (`loadSvcQcEnv`) · อ่านค่าจาก `SQC_BOOKING_SETTINGS_SCENE` + `SQC` เท่านั้น · ผู้กระทำ = ผู้ใช้ owner ของ svcqc ผ่านเครื่องยนต์ (`applyTemplate` · `setSettings`) + `setStaffService` ของใบนี้
- barber: แม่แบบ BARBER (KEEP_CUSTOM) · `unitDiffs` 6 ข้อ · `noise` (ค่าเท่าแม่แบบ 1 แถว) · `staffOnlinePct` (3 แถวชั้น STAFF) · massage: SPA · `unitValues` · `staffOnlinePct` · `staffCommissionBp` · `serviceValues` · `staffServices` (ชื่อบริการ/ช่างตามฉาก)
- พิมพ์ `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0 · `--clear` คืนค่าที่ฉากตั้ง (ไม่ลบโปรไฟล์แม่แบบ)

## 11. หนี้ที่ส่งต่อ (ไม่ทำในใบนี้)
- core-fix (มติผู้คุม: ปิดที่ตัวห่ออย่างเดียวพอสำหรับใบนี้): `applyTemplate`/`applyTemplateAction` กลางปฏิเสธแม่แบบซ่อน · scope DEVICE/RESOURCE/COURSE ใน `SUPPORTED_SCOPES` (ก่อน B.6/B.13) · สิทธิ์เงินรายฟิลด์ `booking.course.policy.refund.feeBp` (ทั้งตารางเป็นสิทธิ์ทั่วไปตาม B.0 D-PERM — ใบคอร์ส)
- B.5: ตรวจ "งานของตัวเอง" (`booking.job.run`) ด้วยการผูกช่าง↔ผู้ใช้ · WARN `pos.deposit.forfeit_failed` ผิดเรื่อง (b3.md)
- ที่เก็บตารางสิทธิ์ที่ร้านแก้เอง (ถ้าเจ้าของต้องการเกิน "ชุดตามแม่แบบ + แก้รายคน")
