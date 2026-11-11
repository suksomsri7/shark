# SVC-CORE-CONTRACT — สัญญาชิ้นกลางของ RUN "SVC" (จองคิว+บัตรคิว V2 · หอพัก+โรงแรม V2)

> เขียน 27 ต.ค. 2569 · ผู้วางแผน RUN · ⚠️ เอกสารเท่านั้น — ยังไม่แตะโค้ด
> **ไฟล์นี้อยู่เหนือ** `ledger/DESIGN-BOOKING-QUEUE.md` และ `ledger/DESIGN-DORM-HOTEL.md` ในทุกเรื่อง "ชื่อ/ที่อยู่/สัญญาของชิ้นกลาง" — แบบทั้งสองยังเป็นแหล่งของ **พฤติกรรม หน้าจอ ค่าเริ่ม** ตามเดิม · ขัดกันเมื่อไรยึดไฟล์นี้ (ตาราง §9 บอกจุดที่ต้องอ่านแทน)
> ชื่อไฟล์/ตารางที่ **ยังไม่มี** เขียนใน «…» · ของที่มีจริงแล้วเขียนใน backtick (ตรวจกับ worktree `shark-svc` @18d9d11c + branch `session/pos` @d9e22152 วันนี้)
> เจ้าของชิ้นกลางทั้งหมด = **เฟส R0** ของ `ledger/SVC-MASTER-PLAN.md` · ใบในเฟส B/D/C/H **ห้ามแก้ไฟล์ชิ้นกลาง** — ต้องการเพิ่มความสามารถ = เขียนคำขอใน wo-notes → ผู้คุมตัดสินว่า (ก) เพิ่มในใบ R0 ที่ยังไม่ปิด หรือ (ข) ออกใบแก้ชิ้นกลางแยก (ตรวจเข้ม)

---

## 0. สรุปการเคาะ 12 ข้อ (อ่านข้อนี้พอถ้ารีบ)

| # | เรื่อง | แบบจองคิวเรียก | แบบหอเรียก | **เคาะ (ใช้ชื่อนี้)** |
|---|---|---|---|---|
| K1 | ที่อยู่ระบบค่าตั้ง | `booking/settings-registry.ts` | `src/lib/core/settings` | «src/lib/core/settings/» (ทะเบียน + ตัวอ่าน + ตัวเขียน) · นิยามค่าแยกไฟล์ต่อโดเมนใน «src/lib/core/settings/defs/» |
| K2 | ตารางค่าตั้ง | `BookingSetting` + `BookingProfile` | `SettingValue` + `SettingAudit` | «SettingValue» + «SettingProfile» + «SettingChange» (ตารางเดียวทุกโดเมน) |
| K3 | ชั้นค่าตั้ง | แม่แบบ→ร้าน→สาขา→ช่าง/บริการ/ทรัพยากร/อุปกรณ์/คอร์ส | กิจการ→หน่วย→อาคาร→ประเภทห้อง→ห้อง→สัญญา (+แผนราคา) | ชนิดชั้นเป็น **ข้อความตรวจกับทะเบียน** (ไม่ใช่ enum) · ลำดับชนะประกาศ **ต่อค่า** ในทะเบียน (§1.3) |
| K4 | ค่าที่จดลงเอกสาร | `Appointment.policySnapshot` | `settingsSnapshot` | ชื่อคอลัมน์ «policySnapshot» (Json) ทุกตาราง · รูปแบบ «PolicySnapshot v1» (§1.6) |
| K5 | ศูนย์เชื่อมต่อ (ตาราง) | `TenantIntegration` | `IntegrationConnection` + `IntegrationSecret` | «TenantIntegration» (ค่าลับอยู่ในแถวเป็นกล่องปิด แบบ POS `PosIntegrationCredential`) + «IntegrationCallLog» |
| K6 | ศูนย์เชื่อมต่อ (ประตู) | `integrations.forTenant(tenantId, kind)` (BQ-7) | `integrations.get(tenant, kind, unit)` | «getIntegration({tenantId, unitId}, kind)» → handle หรือ `null` (= ทางมือ) |
| K7 | ตรวจสลิป | BQ-8 ใช้ของเลนหอ (D1.9) | `payment/slip-verify` + `DormSlip` | «src/lib/payment/slip-verify.ts» + ตาราง «PaymentSlip» ใช้ทุกโดเมน · **ย้ายมาอยู่ R0.6** (ไม่ใช่ D1.9) · `DormSlip` ไม่สร้าง |
| K8 | LINE Flex/เมนูล่าง/postback | "ชิ้นเดียวกับเลนหอ" | `pushFlexToParty` · rich menu · postback `dorm.*` | ของโมดูลแชท (R0.7): «chat/line-flex.ts» «chat/line-richmenu.ts» · ตัวแจก postback อยู่ชั้น platform «src/lib/platform/postback-routes.ts» |
| K9 | รหัสผูก LINE | QR เปิดแชท OA พร้อมรหัสบัตร | `DormLinkCode` | ตารางเดียว «ChatLinkCode» (purpose: `DORM_LEASE` · `QUEUE_TICKET` · `APPOINTMENT`) |
| K10 | ส่งข้อความหาลูกค้า | `chat.pushToContact` / `sendLineToParty` + ด่านยินยอม | `pushFlexToParty` · SMS · พิมพ์ | ประตูเดียว «notifyCustomer()» ชั้น platform (§4.4) — โดเมนห้ามเรียกแชทตรงเพื่อส่งข้อความบริการ |
| K11 | แกนห้อง | (ไม่เกี่ยว) | rename `HotelRoom*`→`Room*` ด้วย `@@map` | **ไม่เปลี่ยนชื่อโมเดล Prisma** (`HotelRoomType` `HotelRoom` คงชื่อ) · ชื่อ `RoomType`/`Room` มีเฉพาะใน facade «src/lib/modules/rooms/index.ts» · เพิ่ม «RoomBuilding» «RoomOccupancy» |
| K12 | ทรัพยากรร้านนวด vs ห้องหอ/โรงแรม | `SvcResource` | `RoomOccupancy` | **แยกกันโดยตั้งใจ** — `SvcResource` จองเป็นนาทีผ่านตัววางคิว · ห้องจองเป็นวันผ่าน `RoomOccupancy` · ไม่รวมตาราง |

เหตุผลย่อ: K5 ใช้รูปแบบ POS เพราะ POS พิสูจน์ผ่านนักล่าแล้ว (กล่องปิด · ไม่มีกุญแจสำรอง · audit เก็บแค่ชื่อฟิลด์) · K7 ย้ายมา R0 เพราะจองคิว (มัดจำ) ใช้ก่อนหอ · K11 การ rename ทำให้ `prisma.hotelRoom` ทั้งโมดูลโรงแรม + ข้อสอบ 3 ชุดต้องแก้โดยไม่ได้อะไรเพิ่ม (แบบหอ §13 ข้อ 9 ให้ผู้คุมเคาะ) → เก็บเป็นใบเลื่อน «X-MIG.1»

---

## 1. ระบบค่าตั้งแบบชั้น (Settings core) — เจ้าของ R0.3 (เครื่องยนต์) · R0.4 (หน้าจอ)

### 1.1 ไฟล์
| ไฟล์ | บริสุทธิ์? | เนื้อหา |
|---|---|---|
| «src/lib/core/settings/types.ts» | ✅ (ห้าม import prisma/next/โมดูล — แบบ `src/lib/core/channels.ts`) | ชนิด `SettingDef` · `ScopeKind` · `ScopeRefs` · `PolicySnapshot` · `LegalVerdict` · `SettingValueType` |
| «src/lib/core/settings/registry.ts» | ✅ | `defineSettings(domain, defs[])` · `getDef(key)` · `listDefs(domain, group?)` · `TEMPLATES` (ต่อโดเมน) · `SNAPSHOT_KEYS` · ตัวตรวจทะเบียนตอนโหลด (key ซ้ำ · chain ไม่ถูกต้อง · ค่าเริ่มของทุกแม่แบบผ่าน zod) |
| «src/lib/core/settings/defs/payments.ts» | ✅ | ค่าร่วมเรื่องรับเงิน/สลิป (R0.6) |
| «src/lib/core/settings/defs/messaging.ts» | ✅ | ลำดับช่องทาง · เวลาเงียบ · OA ต่อหน่วย (R0.7) |
| «src/lib/core/settings/defs/booking.ts» | ✅ | 66 ค่าในภาคผนวก ก ของแบบจองคิว + แม่แบบ `BARBER` `SPA` `CLINIC` (ใบ B.0) |
| «src/lib/core/settings/defs/rooms.ts» | ✅ | 83 ค่าในภาคผนวก ก ของแบบหอ (หอ+โรงแรม · ค่าโรงแรมนิยามไว้แต่ซ่อนจนเฟส H) + แม่แบบ `APARTMENT` `STUDENT_DORM` `SMALL_HOTEL` `SERVICED_APT` (ใบ D.1) |
| «src/lib/core/settings/legal/th-rental-2568.ts» | ✅ | ตัวตรวจกฎหมายประกาศ สคบ. 2568 (ใบ D.1 · ตรวจเข้ม) |
| «src/lib/core/settings/template.ts» | ✅ | `renderTemplate(def, value, vars, locale)` + ตัวตรวจตัวแปร/คำต้องห้าม |
| «src/lib/core/settings/service.ts» | ❌ (prisma) | อ่าน/เขียน/คืนค่า/ประวัติ/snapshot (§1.4–1.6) |
| «src/lib/core/settings/index.ts» | — | facade ทางเดียวที่โมดูลอื่น import |
| «src/lib/core/settings/actions.ts» | server actions | `saveSettingsAction` · `resetSettingAction` · `applyTemplateAction` |
| «src/components/settings/SettingsForm.tsx» + «src/components/settings/settings-shared.ts» | client (ห้าม import service) | หน้าตั้งค่าที่สร้างจากทะเบียน (R0.4) |

### 1.2 ตาราง (schema ใหม่ «prisma/schema/settings.prisma» · migration ในใบ R0.1)
```
SettingValue   id · tenantId · key String · scope String · scopeId String · value Json
               · effectiveFrom DateTime  (NOT NULL · ค่าปริยาย 1970-01-01 = "มีผลตลอด")
               · setById String? · overrideReason String? · createdAt · updatedAt
               @@unique([tenantId, key, scope, scopeId, effectiveFrom]) · @@index([tenantId, scope, scopeId])
SettingProfile id · tenantId · unitId · domain String ("booking"|"rooms") · templateKey String · templateVersion Int
               · appliedById · appliedAt   @@unique([unitId, domain])
SettingChange  id · tenantId · unitId? · key · scope · scopeId · before Json? · after Json? · effectiveFrom
               · legalLevel String ("OK"|"WARN"|"BLOCK") · legalCode String? · reason String? · approvalId String?
               · actorId String · at   (เขียนต่อท้ายอย่างเดียว · ไม่มี update/delete)
```
- `scope` = หนึ่งใน `TENANT · UNIT · BUILDING · ROOM_TYPE · ROOM · LEASE · RATE_PLAN · STAFF · SERVICE · RESOURCE · DEVICE · COURSE` — **ข้อความ** ตรวจกับ `ScopeKind` ในทะเบียน (เพิ่มชั้นใหม่ไม่ต้อง migrate · บทเรียน `core/channels.ts`)
- `scopeId` ของ TENANT = tenantId · ตรวจตอนเขียนว่า scopeId เป็นของ tenant นี้จริง (กันชี้ข้ามร้าน — ข้อสอบ X1)
- เก็บ **เฉพาะค่าที่ต่างจากชั้นบน** · คืนค่า = ลบแถว (ลง `SettingChange` ด้วย after=null)

### 1.3 นิยามค่า (`SettingDef`)
```ts
key: string                       // "<domain>.<group>.<name>" เช่น "booking.late.graceMin" · "dorm.deposit.months"
domain: "booking" | "rooms" | "payments" | "messaging"
group: string                     // กลุ่มบนจอ (ตรงหัวข้อในภาพ 08 / 17 / 10)
type: "int" | "money" | "percent" | "bool" | "enum" | "text" | "template" | "table" | "minutes" | "days" | "time"
schema: ZodType                   // zod v4 — ช่วงค่าที่ยอมรับ
defaults: Record<TemplateKey, Json> & { _fallback: Json }   // ค่าเริ่มต่อแม่แบบ ("—" = ปิด ⇒ ค่า null/false ตาม type)
chain: ScopeKind[]                // ชั้นที่ยอมให้ตั้ง เรียง **ทั่วไป→เจาะจง** เช่น ["TENANT","UNIT","SERVICE","STAFF"]
editPermission: string            // คีย์สิทธิ์ใน core/permissions.ts
ownerOnly?: true                  // เงิน/กฎหมาย/ความลับ
sensitivity?: "MONEY" | "LEGAL" | "PRIVACY"
legal?: LegalRuleId[]             // ตัวตรวจใน legal/*.ts
requires?: { integration?: IntegrationKind }   // เช่น มัดจำโหมดตรวจสลิปอัตโนมัติต้องมี SLIP_VERIFY
effectiveDated?: true             // เฉพาะค่าที่ต้องมี "วันที่มีผล" (ค่าส่วนกลางขึ้นเดือนหน้า · ตารางอัตรา กฟภ.)
templateVars?: string[]           // type=template: ตัวแปรที่อนุญาต {ชื่อ}{ห้อง}{ยอด}{วันครบ}{เลขคิว}{เวลา}{ช่าง}{บริการ}{ลิงก์บัตร}…
hiddenUntil?: "PHASE_H" | …       // นิยามไว้แต่ไม่โชว์/ไม่อ่าน จนเฟสนั้นเปิด
```
- ค่าเดียวที่มี 2 มิติเจาะจง (เช่น ค่าคอมฯ #61 "สาขา → บริการ → ช่าง") ใช้ลำดับใน `chain` ตัดสิน: ตัวท้ายชนะ
- ค่าเริ่มของแม่แบบ = ภาคผนวก ก ของแบบทั้งสอง **ตามตัวเลขในตาราง** (ทีมขายปรับได้ภายหลังด้วยการเพิ่ม `templateVersion`)

### 1.4 อ่าน
```ts
resolveSetting(ctx: {tenantId}, key, refs: ScopeRefs, at?: Date)
  → { value, source: ScopeKind | "TEMPLATE" | "FALLBACK", scopeId?, templateKey, differsFromTemplate: boolean }
resolveSettings(ctx, keys[], refs, at?) → Record<key, …>        // ใช้ในลูปใหญ่ (ตัววางคิว · รอบบิลทั้งตึก) — query เดียวต่อชุด
settingsDiff(ctx, {unitId, domain}) → { key, scope, scopeId, value, templateValue }[]   // ป้าย "ปรับจากแม่แบบ N ข้อ"
```
- `ScopeRefs` = `{ unitId, buildingId?, roomTypeId?, roomId?, leaseId?, ratePlanId?, staffId?, serviceId?, resourceId?, deviceId?, courseId? }`
- ลำดับ: ไล่ `chain` จากเจาะจงสุดที่ผู้เรียกส่ง ref มา → ... → TENANT → ค่าแม่แบบของ `SettingProfile(unitId, domain)` → `_fallback`
- `effectiveDated`: เลือกแถวที่ `effectiveFrom ≤ at` มากสุด **ต่อชั้น** ก่อนไล่ชั้น
- 🔴 ไม่มีแคชข้ามคำขอ (บทเรียน "ให้สิทธิ์ห้ามใช้คำตอบแคช") · แคชได้เฉพาะภายในคำขอ/งาน cron หนึ่งรอบ

### 1.5 เขียน
```ts
setSettings(actor, ctx, changes: {key, scope, scopeId, value, effectiveFrom?, reason?}[], opts?: {ackLegalWarn?: boolean})
  → { ok: true, saved: n } | { ok: false, code: "PERMISSION"|"VALIDATION"|"LEGAL_BLOCK"|"NEEDS_APPROVAL"|"CONFLICT"|"REQUIRES_INTEGRATION", issues[] }
resetSetting(actor, ctx, {key, scope, scopeId})          // คืนค่าแม่แบบ = ลบแถว
applyTemplate(actor, ctx, {unitId, domain, templateKey, overwrite: "KEEP_CUSTOM"|"RESET_ALL"})
settingHistory(ctx, {unitId?, key?}) → SettingChange[]
```
- ลำดับตรวจ (ทั้งชุดใน tx เดียว): สิทธิ์ (`editPermission` + `ownerOnly`) → zod → scopeId เป็นของร้าน → **ตรวจข้ามค่า** (`validateGroup` ต่อกลุ่ม เช่น "ไม่มาหลัง < ผ่อนผัน" · ค่ามัดจำโหมดตรวจสลิปแต่ยังไม่เชื่อม → `REQUIRES_INTEGRATION`) → **ตัวตรวจกฎหมาย** (§1.7) → เขียน `SettingValue` + `SettingChange` + `writeAudit` (`src/lib/core/audit.ts`) → outbox `settings.changed`
- ค่า `sensitivity: MONEY` แก้ได้เฉพาะบทบาทที่มีสิทธิ์เงิน · `LEGAL` (เช่น `dorm.legal.mode`) = เจ้าของกิจการเท่านั้น

### 1.6 Snapshot ลงเอกสาร
```ts
type PolicySnapshot = { v: 1; domain: string; at: string /*ISO*/; template: { key: string; version: number };
                        values: Record<string, Json>; sources: Record<string, string> }
snapshotPolicy(ctx, kind: "appointment"|"lease"|"bill"|"reservation", refs) → PolicySnapshot
```
- `SNAPSHOT_KEYS` ในทะเบียนกำหนดว่าเอกสารชนิดไหนจดค่าอะไร (นัด: มัดจำ · เลื่อน/ยกเลิกฟรี · ผ่อนผัน · ไม่มา · ร้านยืนยันก่อน / สัญญา: ค่าห้อง · ส่วนกลาง · ค่าปรับ · ประกัน · วันครบ · บริการอื่น / บิล: อัตราน้ำไฟ · วิธีคิด · VAT · ชนิดภาษีต่อรายการ / การจองโรงแรม (H): นโยบายยกเลิก · มัดจำ)
- คอลัมน์ `policySnapshot Json?` บน `Appointment` (B.0) · «DormLease» «DormBill» (D.0) · `HotelReservation` (H.0)
- กติกาที่อ่านจากเอกสารที่มีแล้ว **ต้องอ่านจาก snapshot** ไม่ใช่ resolver (ข้อสอบทุกใบที่มีเอกสาร: แก้ค่าตั้งหลังจอง → นัด/สัญญาเดิมใช้ค่าเก่า)

### 1.7 ตัวตรวจกฎหมาย + โหมด
- `LegalRule = (value, ctx: {defs, resolved, unitFacts:{roomCount, businessType}}) → { level: "OK"|"WARN"|"BLOCK", code, messageTh, citation }`
- โหมดต่อหน่วย = ค่าตั้ง `rooms.legal.mode` (`STRICT` · `WARN` · `OUT_OF_SCOPE`) + `rooms.legal.outOfScopeReason` (บังคับเมื่อ OUT_OF_SCOPE)
- ผลจริง: STRICT → BLOCK บันทึกไม่ได้ · WARN → BLOCK ลดเป็น "ต้องติ๊กยอมรับ + เจ้าของกิจการอนุมัติ" ผ่าน approval core (entityType «settings.legal_override» ลง 3 ที่: labels · actions allowlist · `src/lib/approval-effects.ts`) + แถว `SettingChange.legalLevel="WARN"` + ป้ายในรายงาน · OUT_OF_SCOPE → ไม่ตรวจ แต่ต้องมีเหตุผล+หลักฐานที่ตัวโหมด
- ตัวตรวจถูกเรียกซ้ำในจุดที่ต้นทุนเปลี่ยน (ใส่บิล กฟภ./ประปารายเดือน — ใบ D.7) ไม่ใช่แค่ตอนบันทึกค่าตั้ง
- โดเมนจองคิวไม่มีโหมดกฎหมาย (ใช้แค่ `validateGroup`)

### 1.8 หน้าตั้งค่า "สร้างจากทะเบียน" (R0.4 · กติกาเหล็กของ RUN)
- `<SettingsForm domain group[] refs mode="unit"|"entity">` วาดทุกค่าในกลุ่มจาก def: ป้าย "ต่างจากแม่แบบ" · "มาจากชั้น …" · "ปรับรายคน N คน" · ปุ่มคืนค่า · ตัวกรอง "ดูเฉพาะที่ปรับ" · เตือนข้ามค่าก่อนบันทึก · กล่องยอมรับ/ส่งอนุมัติเมื่อ WARN · ปุ่มประวัติ
- ชนิด `table` (รายการค่าบริการ · รายการค่าเสียหาย · ตารางสิทธิ์) และ `template` (ตัวแก้ข้อความ + ตัวอย่าง LINE) มีตัววาดเฉพาะชนิด — **ไม่มีหน้าวาดมือทีละหน้า** · หน้าโดเมน (ภาพ จอง 08/11/12/14 · หอ 10/17) = หน้าห่อที่จัดกลุ่ม + ส่วนเฉพาะที่ไม่ใช่ค่าตั้ง (เช่น ตารางช่าง↔บริการ)

---

## 2. ศูนย์เชื่อมต่อ (Integrations) — เจ้าของ R0.5

### 2.1 ไฟล์
| ไฟล์ | เนื้อหา |
|---|---|
| «src/lib/core/integrations/types.ts» (บริสุทธิ์) | `IntegrationKind` · interface ต่อชนิด (§2.4) · `IntegrationHandle` |
| «src/lib/core/integrations/registry.ts» (บริสุทธิ์) | ผู้ให้บริการต่อชนิด: `code · label · fields[{name,label,secret,required}] · ready` |
| «src/lib/core/integrations/secret-box.ts» | AES-256-GCM รูปแบบ `b64(iv).b64(tag).b64(cipher)` · กุญแจ = SHA-256("integrations:" + env `INTEGRATIONS_CREDENTIALS_KEY`) · ยาว ≥ 32 · **ไม่มีกุญแจสำรองทั้ง dev/prod** (ไม่มี = บันทึกไม่ได้ "ยังไม่ตั้งกุญแจ") · ห้าม import POS/แชท (ลอกรูปแบบจาก `session/pos` `src/lib/modules/pos/secret-box.ts` — ไม่ใช่ import) |
| «src/lib/core/integrations/service.ts» | `saveIntegration` (patch: ฟิลด์ไม่ส่ง = คงเดิม · "" = ล้าง) · `testIntegration` · `disableIntegration` · `listIntegrations` (ปิดบังค่าลับ 4 ตัวท้าย) · `getIntegration` · `callIntegration` · งานลบ call log |
| «src/lib/core/integrations/providers/fake.ts» | ผู้ให้บริการ `FAKE` ทุกชนิด — เปิดได้เฉพาะเมื่อ env `INTEGRATIONS_FAKE=1` (ไฟล์ QC เท่านั้น · ข้อสอบตรวจว่า prod build ไม่มีค่านี้) · ใช้เป็นข้อสอบสัญญา adapter |
| «src/lib/core/integrations/providers/slip/<เจ้า>.ts» | adapter ตรวจสลิปเจ้าแรก (ใบ C.1) |
| «src/lib/core/integrations/index.ts» | facade |
| «src/app/app/settings/integrations/page.tsx» | หน้าศูนย์เชื่อมต่อ (ภาพ จอง 10 = หอ 11 · หน้าเดียว) |

### 2.2 ตาราง (schema ใหม่ «prisma/schema/integration.prisma» · R0.1)
```
TenantIntegration  id · tenantId · kind String · provider String · label String
                   · unitIds String[] @default([])  ([] = ทุกหน่วย)
                   · status String @default("DRAFT")  ("DRAFT"|"CONNECTED"|"ERROR"|"DISABLED")
                   · publicFields Json @default("{}") · secretBox String? · secretNames String[] @default([])
                   · onFailure String @default("MANUAL") ("MANUAL" = ตกไปทางมือ | "REJECT")
                   · lastTestAt DateTime? · lastTestOk Boolean? · lastError String? · consecutiveFailures Int @default(0)
                   · quota Json? · createdById · updatedById · createdAt · updatedAt
                   @@unique([tenantId, kind, provider, label]) · @@index([tenantId, kind])
IntegrationCallLog id · tenantId · integrationId · op String · ok Boolean · ms Int · code String? · at
                   @@index([tenantId, integrationId, at])  — ไม่มีข้อมูลส่วนตัว (ไม่มีเลขบัญชี/ชื่อผู้โอน/รูป) · ลบเมื่อเกิน 30 วัน (งานรายวัน)
```

### 2.3 ประตู
```ts
getIntegration(ctx: { tenantId: string; unitId?: string }, kind: IntegrationKind)
  → Promise<IntegrationHandle | null>     // null = ไม่เชื่อม/ปิด/ไม่ครอบคลุมหน่วยนี้ ⇒ ผู้เรียกใช้ทางมือ (ไม่มีฟีเจอร์ไหนพังเพราะไม่ได้สมัคร)
type IntegrationHandle = { integrationId; kind; provider; onFailure: "MANUAL"|"REJECT"; adapter: AdapterOf<kind> }
callIntegration<T>(handle, op: string, fn: (adapter, ctl: { signal: AbortSignal }) => Promise<T>, opts?: { timeoutMs?: number /*8000*/ })
  → { ok: true, value: T } | { ok: false, code: "TIMEOUT"|"PROVIDER_ERROR"|"QUOTA"|"NOT_READY", fallback: "MANUAL"|"REJECT" }
```
- `callIntegration` เขียน `IntegrationCallLog` ทุกครั้ง · ล้มติดกัน 5 ครั้ง → status ERROR + outbox `integration.failed` · ผ่านครั้งแรกหลังล้ม → CONNECTED
- **signal (R0.5 มติผู้ตรวจ ข้อ 5):** `fn` ได้ `{ signal }` เป็นอาร์กิวเมนต์ที่ 2 — หมดเวลา ⇒ `signal` ถูก abort แล้ว `callIntegration` คืน `TIMEOUT` ทันที · ทุกเมธอดของ adapter รับ `opts?: { signal }` (ส่งต่อให้ `fetch`) · adapter ที่มี**ผลข้างเคียง** (createCharge · send SMS · pushAri · ackReservation) ต้องเคารพ signal **และ**ส่ง idempotency ref ให้ผู้ให้บริการ (abort ไม่รับประกันว่าฝั่งผู้ให้บริการไม่ได้ทำ) · ผู้เรียกที่ได้ `TIMEOUT` ห้ามสรุปว่า "ไม่ได้ทำ" — ใช้ ref เดิมตอนลองซ้ำ
- handle ต้องมาจาก `getIntegration` เท่านั้น (สำเนา/ประกอบเอง ⇒ `NOT_READY` ไม่เรียก fn) · ผลของคีย์เก่า (คีย์ถูกเปลี่ยนระหว่างเรียก) ไม่เปลี่ยนสถานะแถว · `integration.failed` ออกเฉพาะแถวที่ CONNECTED อยู่ (DRAFT ล้มครบ 5 ⇒ ERROR เงียบ)
- **ชนิดเสมือน** (แสดงในหน้าเดียวกัน ไม่เก็บซ้ำ): `LINE_OA` = แถว `ChatChannelConnection` (type LINE) ของร้าน — จัดการที่ระบบแชทเหมือนเดิม · `PROMPTPAY` = `PaymentProfile` ระดับร้าน + ค่าตั้ง `payments.receiver` ระดับหน่วย (§3)
- ความต่างจาก `AppSystem.settings.integrations` เดิม (สวิตช์เชื่อมระบบภายใน) และหน้า `src/app/app/settings/connections/page.tsx` (เชื่อมระบบกับสาขา) — คงไว้ทั้งคู่ ศูนย์ฯ นี้ = ผู้ให้บริการภายนอกเท่านั้น

### 2.4 ชนิดและ interface (รอบนี้สร้างจริงแค่ SLIP_VERIFY)
| kind | interface | รอบนี้ |
|---|---|---|
| `SLIP_VERIFY` | `verify({ image?: Buffer; qrPayload?: string }, expect: { amountSatang: number; receiver: { promptpayId?: string; bankAccount?: string } }) → { status: "VALID"|"INVALID"|"DUPLICATE"|"UNKNOWN"; amountSatang?; transRef?; payerName?; receiverMasked?; transferredAt?; providerRef? }` · `quota() → { remaining?, resetsAt? }` · `test()` | ✅ โครง R0.5 + FAKE · adapter จริงเจ้าแรก ใบ C.1 (เจ้าที่ลูกค้าหอรายแรกสมัคร) |
| `PAYMENT_GATEWAY` | `createCharge({amountSatang, ref, returnUrl}) → {chargeId, payUrl|qr}` · `verifyWebhook(raw, headers) → {chargeId, paid}` | ⏸ นิยามเท่านั้น · Beam รายร้าน = ใบเลื่อน «P.1» (`src/lib/payment/beam.ts` ระดับแพลตฟอร์มคงเดิม) |
| `SMS` | `send({toE164, text, ref}) → {ok, externalId}` | ⏸ ใบเลื่อน «S.1» (ห่อ `src/lib/core/sms.ts` เดิมเป็น adapter ได้) |
| `CHANNEL_MANAGER` | `pushAri(map, dates, ari)` · `pullReservations(since)` · `ackReservation(externalId)` | ⏸ โครงในเฟส H (H.10) · ตัวต่อจริง H2 |
| `METER` · `CALENDAR` | `readings(meterIds, period)` · (ภายหลัง) | ⏸ แสดง "เร็ว ๆ นี้" |

### 2.5 POS
- `session/pos` มี `PosIntegrationCredential` (+ `slip-verify.ts` โครง SLIPOK/EASYSLIP · `secret-box.ts` กุญแจ `POS_CREDENTIALS_KEY`) — **RUN นี้ไม่แตะ** (เจ้าของอนุญาต POS แค่ 2 จุดใน B.10) · หน้าศูนย์ฯ แสดงการ์ด "ตัวเชื่อมของ POS ตั้งที่หน้าตั้งค่า POS" (ลิงก์ ไม่อ่านค่า)
- รวม POS เข้าศูนย์กลาง = ใบเลื่อน «X-POS.1» (ต้องให้เจ้าของอนุญาตแตะ POS จุดที่ 3)

### 2.6 env ที่เจ้าของต้องตั้งก่อนขึ้น prod
`INTEGRATIONS_CREDENTIALS_KEY` (≥ 32 ตัว · `openssl rand -hex 32`) · ไม่ตั้ง = หน้าศูนย์ฯ บอก "ยังไม่ตั้งกุญแจ" บันทึกคีย์ไม่ได้ (ไม่มีอะไรพัง) · ห้ามใช้ค่าเดียวกับ `CHAT_CREDENTIALS_KEY`/`POS_CREDENTIALS_KEY`

---

## 3. รับเงิน: QR + ตรวจสลิปกลาง — เจ้าของ R0.6

### 3.1 ไฟล์
«src/lib/payment/slip-verify.ts» (ชื่อตามแบบ BQ-8) · «src/lib/payment/receiver.ts» · ใช้ `src/lib/payment/promptpay.ts` เดิมสร้าง QR · ไฟล์สลิปเก็บแบบส่วนตัวผ่านระบบไฟล์เดิม (route ตรวจสิทธิ์+หมดอายุของ CRM C0.4)

### 3.2 ตาราง (เพิ่มใน `prisma/schema/payment.prisma` · R0.1)
```
PaymentSlip  id · tenantId · unitId · domain String ("BOOKING"|"DORM"|"HOTEL") · refType String ("APPT_DEPOSIT"|"DORM_BILL"|"HOTEL_DEPOSIT")
             · refId String · partyId String? · fileId String · imageHash String · transRef String?
             · expectedSatang Int · amountSatang Int? · payerName String? · bankCode String? · transferredAt DateTime?
             · checks Json  (ผลตรวจในระบบรายข้อ) · verifierIntegrationId String? · verifierResult Json?
             · status String ("PENDING"|"AUTO_APPROVED"|"NEEDS_REVIEW"|"APPROVED"|"REJECTED")
             · reviewReason String? · decidedById String? · decidedAt DateTime? · createdAt
             @@index([tenantId, unitId, status, createdAt]) · @@index([refType, refId])
             + unique บางส่วน (SQL เขียนมือ): (tenantId, imageHash) WHERE status <> 'REJECTED'
                                              (tenantId, transRef) WHERE transRef IS NOT NULL AND status <> 'REJECTED'
```

### 3.3 ฟังก์ชัน
```ts
receiverFor(ctx, unitId) → { promptpayId, displayName, bankAccount? } | null     // ค่าตั้ง payments.receiver (UNIT) → PaymentProfile (ร้าน)
promptpayQrFor(ctx, { unitId, amountSatang, ref }) → { payload, svgDataUrl }     // ห่อ promptpay.ts
submitSlip(ctx, { unitId, domain, refType, refId, partyId?, fileId, expectedSatang, idempotencyKey })
  → { slipId, status, reasons: SlipReason[] }
decideSlip(actor, ctx, slipId, { decision: "APPROVE"|"APPROVE_PARTIAL"|"REJECT", amountSatang?, reason })
slipQueue(ctx, { unitId, domain?, status? })
```
- ลำดับตรวจใน `submitSlip`: แฮชรูปซ้ำ → อ่าน QR ในสลิป (ถ้ามี) → เรียก `getIntegration(SLIP_VERIFY)` (มี = ตรวจกับผู้ให้บริการ · ไม่มี/ล่ม = ตามค่าตั้ง) → ตรวจในระบบ: ยอด (± `payments.slip.toleranceSatang`) · เลขอ้างอิงซ้ำ · ผู้รับตรง `receiverFor` · เวลาโอนไม่เก่ากว่า `payments.slip.maxAgeHours` · ชื่อผู้โอน (`payments.slip.payerNameMatch` = OFF/WARN/BLOCK)
- ผ่านทุกข้อ + `payments.slip.autoApprove` = AUTO_APPROVED · ไม่ผ่าน = NEEDS_REVIEW (เหตุผลแยกข้อ — ชื่อไม่ตรง · ยอดขาด/เกิน · ซ้ำ · ผู้รับผิด · ตัวต่อล่ม) · ซ้ำชัดเจน = REJECTED
- **ผลเงินไม่เกิดในไฟล์นี้**: อนุมัติ (อัตโนมัติ/คน) → outbox `payment.slip.approved {slipId, domain, refType, refId, amountSatang}` → consumer ของโดเมน (จองคิว: `moduleTakeDeposit` ของ POS · หอ: `recordExternalPayment` ของบัญชี) — idempotent ต่อ slipId (ข้อสอบ X4)
- ข้อจำกัดที่รู้: สลิปเดียวกันใช้ซ้ำข้าม POS (`PosPaymentSlip`) กับหอ **จับไม่ได้** จนกว่าใบ «X-POS.1»

### 3.4 ค่าตั้งร่วม (defs/payments.ts · ชั้น TENANT→UNIT)
`payments.receiver` · `payments.slip.autoApprove` (ค่าเริ่ม: เปิดเมื่อมีตัวต่อ / ปิดเมื่อไม่มี) · `payments.slip.toleranceSatang` (0) · `payments.slip.payerNameMatch` (WARN) · `payments.slip.maxAgeHours` (72) · `payments.slip.onVerifierDown` (MANUAL) — ตรงภาคผนวก ก หอ #53–#57 · หอ #58 (รับบางส่วน) อยู่ใน defs/rooms.ts

---

## 4. LINE · ผูกตัวตน · ส่งข้อความบริการ — เจ้าของ R0.7

### 4.1 โมดูลแชท (additive · ออกทาง `src/lib/modules/chat/index.ts`)
| ฟังก์ชัน | ไฟล์ | หมายเหตุ |
|---|---|---|
| `pushFlexToParty(ctx, { partyId, connectionId?, altText, contents })` | «src/lib/modules/chat/line-flex.ts» | หาห้องแชท LINE ของ Party แบบ `sendLineToParty` · ไม่ throw · เหตุผลปฏิเสธแยกกรณี |
| `replyFlex(ctx, { replyToken, connectionId, … })` | เดียวกัน | ใช้ตอบ postback/ข้อความ (ไม่กินโควตา push) |
| `syncRichMenu(ctx, connectionId, spec: RichMenuSpec)` | «src/lib/modules/chat/line-richmenu.ts» | สร้าง/อัปโหลดรูป/ตั้งเป็นค่าเริ่ม/ผูกรายคน · spec มาจากโดเมน (หอ: บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา · พัสดุ · ติดต่อหอ) |
| `issueLinkCode(ctx, { purpose, refId, ttlMin, connectionId? })` → `{ code, deepLink }` | «src/lib/modules/chat/link-code.ts» | `deepLink` = ลิงก์เปิดแชท OA พร้อมข้อความ (⚠️ ต้องทดสอบเครื่องจริง ใบ C.2) |
| `consumeLinkCode(ctx, { connectionId, chatContactId, text })` → `{ purpose, refId, partyId } \| null` | เดียวกัน | เรียกจาก webhook ขาเข้า · สำเร็จ = `linkChatContactParty` (มีแล้ว) |
| webhook postback → `dispatchPostback` | ของเดิมใน webhook LINE + ทะเบียนชั้น platform | ข้อมูล postback รูปแบบ `<domain>.<action>?k=v` (เช่น `dorm.bills` · `booking.checkin?a=<id>`) |

### 4.2 ตาราง (เพิ่มใน `prisma/schema/chat.prisma` · R0.1)
```
ChatLinkCode  id · tenantId · connectionId String? · purpose String ("DORM_LEASE"|"QUEUE_TICKET"|"APPOINTMENT")
              · refId String · codeHash String · codeLast4 String · expiresAt DateTime · usedAt DateTime?
              · usedByChatContactId String? · createdAt   @@unique([tenantId, codeHash])
ServiceMessageLog  id · tenantId · unitId · domain · messageKey · dedupeKey String · channel String ("LINE"|"SMS"|"NONE")
              · status String ("SENT"|"SKIPPED_CONSENT"|"SKIPPED_QUIET"|"NO_CHANNEL"|"FAILED") · partyId String? · at
              @@unique([tenantId, dedupeKey])     — กันส่งซ้ำเมื่อ cron/outbox รันซ้ำ (X4/X5)
```

### 4.3 ทะเบียน postback/ผูกรหัส (ชั้น platform — import โมดูลได้ แบบ `src/lib/platform/kanban-bridges.ts`)
«src/lib/platform/postback-routes.ts»: `{ prefix: "booking." | "dorm." | "hotel.", onPostback(ctx, evt) , onLinked(ctx, {purpose, refId, partyId}) }` — webhook แชทเรียกแบบ synchronous (ต้องตอบด้วย replyToken ทัน) · โดเมนลงทะเบียนตัวจัดการในใบของตัวเอง (B.9 · D.9) โดยแก้ไฟล์นี้เฉพาะบรรทัดลงทะเบียน (ผู้คุมรวมไฟล์)

### 4.4 ประตูส่งข้อความบริการ
«src/lib/platform/notify-customer.ts»
```ts
notifyCustomer(ctx, { unitId, domain: "booking"|"rooms", messageKey, partyId?, chatContactId?, phone?, vars, buttons?, flex?,
                      dedupeKey, at?: Date })
  → { channel: "LINE"|"SMS"|"NONE", status, webLink? }
```
- ข้อความ = ค่าตั้งชนิด `template` (`booking.msg.<ชนิด>` 10 ชนิด · `rooms.msg.<ชนิด>`) — เปิด/ปิด · ช่องทาง · ถ้อยคำ · ภาษา (ไทย/อังกฤษต่อคน)
- ลำดับช่องทาง = ค่าตั้ง `messaging.channelOrder` (ค่าเริ่ม `["LINE","WEB_LINK"]` — SMS ใส่ได้เมื่อมีใบ S.1) · OA ที่ใช้ต่อหน่วย = `messaging.lineConnectionId` (UNIT)
- เวลาเงียบ `messaging.quietHours` (ใช้ `src/lib/core/quiet-hours.ts` เดิม) — ข้อความที่ลูกค้ารอทันที (ถึงคิว/ใบเสร็จ) ข้ามเวลาเงียบได้ (ธงในนิยาม)
- ความยินยอม: ข้อความ **บริการ** ส่งได้โดยไม่ต้องยินยอมการตลาด แต่ห้ามมีเนื้อหาการตลาด (รอที่ปรึกษา PDPA ยืนยัน — จุดเจ้าของ J5) · optOut ของช่องทางยังบล็อก
- ลิงก์ส่วนตัว = `signLink` (§4.5) · payload outbox/log ห้ามมีเบอร์/ชื่อเต็ม

### 4.5 ลิงก์ส่วนตัวที่เซ็นแล้ว
«src/lib/core/signed-link.ts» `signLink({ tenantId, purpose, subjectId, expMin }) → token` · `verifyLink(token, purpose) → { tenantId, subjectId } | null` — HMAC-SHA256 · token ≥ 128 บิต · หมดอายุ · ถ้ามีตัว HMAC ของไฟล์ส่วนตัว (CRM C0.4) อยู่แล้ว **ใช้ร่วม** แทนการเขียนใหม่ (R0.7 ตรวจก่อน) · ใช้กับ: ลิงก์จัดการนัด (B.7) · หน้าบัตรคิว · พอร์ทัลผู้เช่า/หน้าจ่าย (D.9)

---

## 5. แกนห้อง (Rooms) — เจ้าของ R0.8 · R0.9

### 5.1 ไฟล์
«src/lib/modules/rooms/index.ts» (facade — หอ/โรงแรมเรียกผ่านทางนี้เท่านั้น · กติกา F2) · «src/lib/modules/rooms/service.ts» · «src/lib/modules/rooms/occupancy.ts» · «src/components/rooms/RoomBoard.tsx» (ผังห้องร่วม R0.9)

### 5.2 ตาราง (`prisma/schema/hotel.prisma` · R0.1 · additive ล้วน)
```
HotelRoomType  + monthlyRateSatang Int? · areaSqm Decimal? · rentMode String @default("NIGHTLY") ("NIGHTLY"|"MONTHLY"|"BOTH") · amenities Json?
HotelRoom      + buildingId String? · floorNo Int? (คง `floor` ข้อความเดิม) · rentMode String? (null = ตามประเภท) · hkStatus String @default("CLEAN") ("CLEAN"|"DIRTY"|"INSPECTED"|"OUT_OF_ORDER")
RoomBuilding   id · tenantId · unitId · name · floors Int · sortOrder Int
RoomOccupancy  id · tenantId · unitId · roomId · startDate DATE · endDate DATE (ไม่รวมวันจบ)
               · kind String ("LEASE"|"STAY"|"HOLD"|"BLOCK"|"CHANNEL_HOLD") · refType String · refId String
               · active Boolean @default(true) · holdExpiresAt DateTime? · createdAt · updatedAt
               + SQL เขียนมือ: CREATE EXTENSION IF NOT EXISTS btree_gist;
                 EXCLUDE USING gist ("roomId" WITH =, daterange("startDate","endDate",'[)') WITH &&) WHERE (active)
enum UnitType  + DORM   (ALTER TYPE ADD VALUE — ต่อท้าย)
```
- ถ้า Neon ไม่มี `btree_gist` (ตรวจใน R0.1 ก่อนเขียน migration) → ทางสำรอง: `pg_advisory_xact_lock(hashtext(roomId))` + ตรวจซ้อนใน tx (ข้อสอบชนพร้อมกันชุดเดียวกันต้องผ่าน) — ผู้คุมบันทึกเหตุผล
- ชื่อในโค้ดนอก facade: ใช้ `rooms.*` เท่านั้น · Prisma ยังเรียก `prisma.hotelRoom` ภายในโมดูล rooms/hotel

### 5.3 ฟังก์ชัน
```ts
claimRoom(tx, { tenantId, unitId, roomId, start, end, kind, refType, refId, holdExpiresAt? })
  → { ok: true, occupancyId } | { ok: false, code: "ROOM_TAKEN", conflict: { kind, refType } }   // ไม่บอก refId ของคนอื่น
releaseOccupancy(tx, occupancyId, reason) · moveOccupancy(tx, occupancyId, toRoomId) · resizeOccupancy(tx, occupancyId, {start?, end?})
expireHolds(now)                                  // minute-job: HOLD/CHANNEL_HOLD หมดเวลา → active=false
roomBoard(ctx, { unitId, date }) → RoomBoardCell[] // ผังห้อง: กายภาพ (hkStatus) + การใช้งาน (คำนวณจาก RoomOccupancy) + ป้ายการเงิน (ผู้เรียกเติม)
availability(ctx, { unitId, roomTypeId?, start, end, rentMode }) → { roomId, free }[]
```
- โรงแรม P1 เดิม (`src/lib/modules/hotel/service.ts` `createReservation` · `cancelReservation` · `checkIn` · `checkOut`) เขียน/ปล่อย `RoomOccupancy` ใน tx เดียวกัน (R0.8) · `qc-hotel-money` `qc-hotel-public` `qc-hotel-refund` ต้องเขียวเท่าเดิม
- event `rooms.occupancy.changed { unitId, roomId, from, to }` (H.10 ใช้ส่ง ARI)

---

## 6. ชิ้นของโดเมนที่สัญญากลางอ้าง (ชื่อสุดท้าย · เจ้าของ = ใบโดเมน)

### 6.1 จองคิว (เฟส B)
- ตารางใหม่/คอลัมน์ตาม `DESIGN-BOOKING-QUEUE.md` §9 **ยกเว้น**: ไม่มี `BookingSetting`/`BookingProfile`/`BookingPolicy` (ใช้ §1) · คอลัมน์นโยบายบน `BookingStaff`/`BookingService` ที่แบบเสนอรอบแรก (`onlineSharePct` `commissionBp` `walkInAllowed` `rebookAfterDays` `staffCount`) **ไม่สร้าง** — อ่านผ่าน resolver (ทางเลือกของแบบเอง) · คง `BookingStaffService` · `SvcResource` · `Appointment`+คอลัมน์ · `QueueTicket.etaAt`
- คิวบนหน่วย BOOKING: เปิดโหมดแถวเดียว (`booking.queue.singleLine`) แล้วตาราง `Queue*` ใช้ `unitId` ของหน่วย BOOKING ได้ · หน้า/ทางสาธารณะของคิว (`src/lib/modules/queue/service.ts` `resolvePublicUnit(…, "QUEUE")` · `src/app/app/u/[unitSlug]/queue/page.tsx` `unit.type !== "QUEUE"`) ยอมรับ BOOKING เมื่อเปิดโหมดนี้ · หน่วย QUEUE เดิมทำงานเหมือนเดิมทุกไบต์
- POS 2 จุด (ใบ B.10 เท่านั้น): `PosHeldCart.serviceJobId String?` (partial unique ตอน HELD แบบ `tableSessionId`) · `PosSaleLine.performerEmployeeId String?` → ค่าคอมฯ ลงตามผู้ให้บริการ (รายละเอียด/ข้อเคาะใน MASTER-PLAN ใบ B.10) · ฟังก์ชัน «pos.openServiceBill» ตาม BQ-2 · มัดจำใช้ `moduleTakeDeposit` `moduleDepositForBill` `moduleForfeitDeposit` `moduleRefundDeposit` ของ `session/pos` (ไม่แก้)
- HR: เพิ่ม `staffWindows()` ใน `src/lib/modules/hr/index.ts` ที่คืน `[]` (ยังไม่มีกะบน main) — RUN HR เติมของจริงจาก `HrRosterEntry` (ใบ «X-HR.1» ของ RUN HR)

### 6.2 หอ (เฟส D)
- ตารางตาม `DESIGN-DORM-HOTEL.md` §10 **ยกเว้น**: ไม่มี `DormSlip` (→ `PaymentSlip`) · ไม่มี `DormLinkCode` (→ `ChatLinkCode`) · `settingsSnapshot` → `policySnapshot` · `SettingValue/SettingAudit/IntegrationConnection/IntegrationSecret` → §1/§2
- บัญชี (ใบ D.2 เป็นเจ้าของการขยาย facade `src/lib/modules/account/index.ts`): `createExternalInvoice` รับ `sourceKind: "CRM" | "DORM"` + บรรทัด `{ qty, unitPriceSatang, taxKind: "EXEMPT"|"VAT7"|"NONE", meta }` · «recordExternalPayment» (ห่อ `recordPayment` ใน `src/lib/modules/account/service.ts`) · «postSecurityDeposit» / «settleSecurityDeposit» · ใบลดหนี้/เพิ่มหนี้ผ่านของเดิม · `AccountDocSource` + `DORM` · ผังบัญชี "เงินประกันรับจากผู้เช่า" (หนี้สิน · รหัสเคาะใน D.2)

---

## 7. Event ใหม่ (ทุกตัวลง 3 ทะเบียนในใบเดียวกัน: `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` · payload ห้ามมีเบอร์/อีเมล/ชื่อเต็ม)
| event | ใบ | payload (ย่อ) |
|---|---|---|
| `settings.changed` | R0.3 | tenantId · unitId? · domain · keys[] · scope · scopeId |
| `integration.connected` · `integration.failed` | R0.5 | integrationId · kind · provider |
| `payment.slip.submitted` · `payment.slip.approved` · `payment.slip.rejected` | R0.6 | slipId · domain · refType · refId · amountSatang · status |
| `rooms.occupancy.changed` | R0.8 | unitId · roomId · from · to |
| `booking.created` · `booking.rescheduled` · `booking.cancelled` · `booking.checked_in` · `booking.late` · `booking.started` (+ เดิม `booking.completed` `booking.no_show`) · `queue.ticket.called` · `queue.ticket.done` | B.4 · B.7 | appointmentId · unitId · staffId · kind · channel |
| `dorm.lease.signed` · `dorm.lease.renewed` · `dorm.lease.ended` | D.5 · D.12 | leaseId · roomId |
| `dorm.meter.flagged` | D.6 | meterId · periodKey · flag |
| `dorm.billrun.sent` · `dorm.bill.paid` · `dorm.bill.partially_paid` · `dorm.bill.overdue` | D.8 · D.10 · D.11 | billId · leaseId · periodKey · amountSatang |
| `dorm.moveout.settled` · `dorm.deposit.refund_due` | D.12 | leaseId · refundSatang · dueAt |
| `dorm.repair.created` · `dorm.repair.done` | D.16 | repairId · roomId · category |
| `dorm.announcement.published` · `dorm.parcel.received` · `dorm.parcel.picked_up` | D.17 · D.18 | id · roomId? |
| hotel.* · channel.* (ตามแบบหอ §8) | เฟส H | — |

---

## 8. สิทธิ์ (คีย์ใหม่ใน `src/lib/core/permissions.ts` · ป้ายไทยทุกคีย์ · ค่าเริ่มต่อบทบาทตามแม่แบบ)
- กลาง: `settings.integrations.manage` (เจ้าของ) · `payments.slip.review`
- จองคิว (B.11): `booking.settings.edit` · `booking.settings.money` · `booking.queue.operate` · `booking.checkin` · `booking.walkin.create` · `booking.job.run` (เรียก/เริ่ม/เสร็จของตัวเอง) · `booking.job.runAny` · `booking.deposit.confirm` · `booking.devices.manage` (+ ของเดิม `booking.*` คงไว้ทั้งหมด)
- หอ (D.13 รวบ · ใบที่สร้างฟังก์ชันเพิ่มคีย์ของตัวเอง): `dorm.view` · `dorm.import` · `dorm.lease.manage` · `dorm.meter.read` · `dorm.bill.run` · `dorm.bill.send` · `dorm.slip.review` · `dorm.payment.manual` · `dorm.latefee.waive` · `dorm.moveout.manage` · `dorm.deposit.deduct.approve` · `dorm.repair.manage` · `dorm.announce` · `dorm.parcel.manage` · `dorm.settings.edit` · `dorm.settings.legal` (เจ้าของกิจการเท่านั้น)

---

## 9. จุดที่แบบทั้งสองต้อง "อ่านตามสัญญานี้" (ใช้แทนข้อความเดิม)

| เอกสาร · หัวข้อ | ข้อความเดิม | อ่านเป็น |
|---|---|---|
| จองคิว §1 ข้อ 1–3 · §4.5 | `booking/settings-registry.ts` · `BookingSetting` · `BookingProfile` · `resolveSetting(key,{unitId,…})` | §1: «core/settings» · `SettingValue`/`SettingProfile`/`SettingChange` · `resolveSetting(ctx, key, refs)` · นิยามค่าจองคิวอยู่ «defs/booking.ts» |
| จองคิว §1 ข้อ 7 · §4.6 · BQ-7 · I.1 | `integrations.forTenant(tenantId, kind)` · kind PAYMENT_GATEWAY/SLIP_VERIFY/SMS/CALENDAR/BOOKING_CHANNEL | §2.3 `getIntegration({tenantId, unitId}, kind)` · kind ตาม §2.4 (`BOOKING_CHANNEL` = `CHANNEL_MANAGER`/`CALENDAR` ภายหลัง) · I.1 = R0.5 · I.2 = C.1 (ตรวจสลิป) + ใบเลื่อน P.1 (Beam) S.1 (SMS) |
| จองคิว BQ-8 · B1.9 | "ใช้ตัวกลางที่เลนหอวาง (D1.9)" | §3 · เจ้าของ R0.6 · มัดจำ "พร้อมเพย์ + ตรวจสลิป" = `submitSlip(refType "APPT_DEPOSIT")` → อนุมัติ → consumer จองคิวเรียก `moduleTakeDeposit` (payType PROMPTPAY) |
| จองคิว BQ-6 · R9 | "Flex/rich menu/postback ชิ้นเดียวกับเลนหอ" · `chat.pushToContact` | §4: `notifyCustomer` เป็นประตูเดียว (ข้างในใช้ `pushToContact`/`pushFlexToParty`) · ผูก walk-in ด้วย `ChatLinkCode(QUEUE_TICKET)` |
| จองคิว §9 | `BookingPolicy` 1 แถว/สาขา · คอลัมน์นโยบายบน BookingStaff/Service · `TenantIntegration (credentials Json · usedBy[])` | ไม่สร้าง `BookingPolicy` (ทุกค่าอยู่ใน defs) · `TenantIntegration` ตาม §2.2 (`unitIds` แทน `usedBy` · `secretBox` แทน `credentials`) |
| จองคิว §10 B1.2 | "schema + ทะเบียนค่าตั้ง + resolver + snapshot + แม่แบบ 3 แบบ" | แยก: เครื่องยนต์ = R0.3 · หน้าจอสร้างจากทะเบียน = R0.4 · นิยาม 66 ค่า + แม่แบบ = B.0 |
| หอ §1 ข้อ 5 · §5.1 · §10 แกนห้อง | Prisma model `RoomType`/`Room` ด้วย `@@map` | §5: **ไม่ rename** · ชื่อ Room/RoomType อยู่ใน facade เท่านั้น |
| หอ §5.2 · §10 ค่าตั้ง | `SettingValue`(…overrideReason) + `SettingAudit` · scope enum TENANT/UNIT/BUILDING/ROOM_TYPE/ROOM/LEASE · `settingsSnapshot` | §1.2 (`SettingChange` แทน `SettingAudit` · scope เป็นข้อความ · เพิ่ม `RATE_PLAN`) · `policySnapshot` |
| หอ §5.3 · §10 ศูนย์ฯ · §8 แถวชำระเงิน | `IntegrationConnection` + `IntegrationSecret` + `IntegrationCallLog` · `integrations.get(tenant, kind, unit)` · kind CHAT/PAYMENT_QR/… | §2: `TenantIntegration` (กล่องปิดในแถว) + `IntegrationCallLog` · `getIntegration` · CHAT → ชนิดเสมือน `LINE_OA` · PAYMENT_QR → ชนิดเสมือน `PROMPTPAY` |
| หอ §6 A7 · §10 `DormSlip` · D1.9 | `DormSlip` + `verifierConnectionId` · "D1.9 interface + ตรวจในระบบ + คิวมือ" | §3 `PaymentSlip(domain DORM, refType DORM_BILL)` + `verifierIntegrationId` · เครื่องยนต์ = R0.6 · ใบหอเหลือ: คิวตรวจของหอ + รับบางส่วน/ยกยอด + เงินสด (D.10) |
| หอ §6 A6 · §10 `DormLinkCode` · §8 แถวแชท | `DormLinkCode` · `pushFlexToParty` (ใหม่) · rich menu · postback `dorm.*` | §4: `ChatLinkCode(DORM_LEASE)` · ชื่อ `pushFlexToParty` คงเดิม · ตัวแจก postback ชั้น platform |
| หอ §11 R0.1–R0.6 · D1.x · D2.x | หมายเลขใบเดิม | ตารางเทียบเลขใบใน MASTER-PLAN §6.0 |
| หอ §13 ข้อ 5 · จองคิว §12 ข้อ 3 | "ใครเป็นเจ้าของศูนย์เชื่อมต่อ/ค่าตั้ง" | เฟส R0 ของ RUN นี้ (ผู้คุมเคาะแล้ว) |

---

## 10. ข้อที่สัญญานี้ยังไม่ตัดสิน (ผู้คุมเคาะตอนเปิดใบ — มีค่าปลอดภัยให้)
1. **รหัสผังบัญชี "เงินประกันรับจากผู้เช่า"** — ค่าปลอดภัย: หมวดหนี้สินหมุนเวียนถัดจาก 2110 เงินมัดจำรับ (D.2 ตรวจผังจริงก่อน) — ให้ผู้ตรวจบัญชีดู (J4)
2. **ค่าคอมฯ ตามผู้ให้บริการ** เมื่อผู้ให้บริการไม่มีบัญชีผู้ใช้ (`PosStaffCommission.userId` บังคับ) — ค่าปลอดภัย: เพิ่ม `PosStaffCommission.employeeId String?` และใช้ `userId` = ผู้ใช้ที่ผูกกับพนักงาน (ไม่มี = ไม่ลงค่าคอมฯ + เตือนในจอตั้งค่าช่าง) · ต้องให้ผู้คุม POS รับทราบ
3. **`btree_gist` บน Neon** — ตรวจใน R0.1 · ไม่มี = ทางสำรอง §5.2
4. **ตัวเชื่อม LINE เปิดแชทพร้อมข้อความ** ทำงานไม่เหมือนกันทุกเครื่อง — ค่าปลอดภัย: ลูกค้าพิมพ์รหัส 6 ตัวเอง + ลิงก์เว็บเสมอ (C.2 ทดสอบจริง)
5. **ข้อความบริการ vs การตลาด (PDPA)** — ค่าปลอดภัย: ข้อความบริการไม่มีโปรโมชันเลย · ส่งเฉพาะคนที่ผูก LINE เอง (เจ้าของถามที่ปรึกษา J5)


## ภาคต่อ 28 ต.ค. (มติหลังผู้ตรวจ R0.3)
- ค่าเท่าชั้นบน: ไม่สร้างแถวใหม่ แต่ **ไม่ลบแถวที่มีอยู่** · R0.4 ต้องส่งเฉพาะคีย์ที่ผู้ใช้แตะ และมีสวิตช์ "ตามชั้นบน" (= resetSetting) แยก
- override คำเตือนกฎหมาย: ต้องมีขั้น OWNER ในสายอนุมัติ · apply ตรวจ OWNER (Membership สด) + กฎหมายโหมดปัจจุบัน + ด่าน 3–6 + STALE
- `refsFor(ctx, scope, id)` · `snapshotPolicy` รับ `{scope, scopeId}` · `resolveSettingsMany(ctx, keys, refsList)`
