# ใบสั่ง R0.3 — เครื่องยนต์ค่าตั้ง (Settings core) · ตรวจเข้ม (กฎหมาย · ข้ามร้าน/ข้ามสาขา)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` R0.3 · สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` **§1 ทั้งหมด** (+ §3.4 · §4.4 · §7 · §8) · แบบ: `ledger/DESIGN-BOOKING-QUEUE.md` §4.5 · `ledger/DESIGN-DORM-HOTEL.md` §5.2 · ภาคผนวก ก ทั้งสองแบบ
> schema มีแล้ว (R0.1): `prisma/schema/settings.prisma` (`SettingValue` `SettingProfile` `SettingChange`) · ตัวตรวจกฎหมายมีแล้ว (D.1): `src/lib/core/settings/legal/th-rental-2568.ts`
> ข้อสอบ: «scripts/qc-svc-r0.3.mts» — รัน `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.3.mts` · **ห้ามแก้ข้อสอบ** (แย้ง = wo-notes · SVC-RUN §1.3 ข้อ 11)
> ส่งต่อที่ต้องอ่าน: `ledger/wo-notes/svc-r0.8-carry.md` บรรทัด R0.3/R0.4 (SettingChange แกน tenant ⇒ กรอง unitId เอง)

## 1. ไฟล์ของใบ
| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| «src/lib/core/settings/types.ts» | ใหม่ · **pure** | ชนิดทั้งหมด (§2) · `LegalVerdict` re-export จาก legal/th-rental-2568.ts (ห้ามประกาศซ้ำ) |
| «src/lib/core/settings/registry.ts» | ใหม่ · **pure** | `defineSettings` `getDef` `listDefs` `TEMPLATES` `SNAPSHOT_KEYS` `validateGroup` + ตัวตรวจทะเบียน (§3) |
| «src/lib/core/settings/template.ts» | ใหม่ · **pure** | `renderTemplate` + `checkTemplate` (ตัวแปรที่ไม่อนุญาต) |
| «src/lib/core/settings/service.ts» | ใหม่ (prisma) | อ่าน/เขียน/คืนค่า/แม่แบบ/ประวัติ/snapshot (§4–§6) |
| «src/lib/core/settings/index.ts» | ใหม่ | facade — re-export ทุกอย่างที่ข้อสอบเรียก + import `./defs/payments` `./defs/messaging` (ลงทะเบียนตอนโหลด) · **ห้าม import `./defs/_fixture`** |
| «src/lib/core/settings/actions.ts» | ใหม่ · `"use server"` | `saveSettingsAction` `resetSettingAction` `applyTemplateAction` — export async function เท่านั้น (ไม่มี type/const) · สร้าง actor จาก `requireTenant()` แล้วเรียก service |
| «src/lib/core/settings/defs/payments.ts» | ใหม่ · pure | CC §3.4 (§7.1) |
| «src/lib/core/settings/defs/messaging.ts» | ใหม่ · pure | CC §4.4 (§7.2) |
| «src/lib/core/settings/defs/_fixture.ts» | ใหม่ · pure · **QC เท่านั้น** | ตาม §8 **ตรงตัว** (ข้อสอบผูกทุกค่า) · ไม่มีไฟล์ใดใน `src/` import ไฟล์นี้ |
| `src/lib/approval-effects.ts` | แก้ (เพิ่มกิ่ง) | entityType `settings.legal_override` (§5.4) |
| `src/lib/modules/approval/labels.ts` · `src/lib/modules/approval/actions.ts` | แก้ (เพิ่ม 1 ค่า) | `settings.legal_override` ป้าย "ข้ามคำเตือนกฎหมายในค่าตั้ง" |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | แก้ (เพิ่ม 1 ค่า) | event `settings.changed` (consumer = `withAutomation(async () => {})`) |
| `src/lib/core/permissions.ts` | แก้ (เพิ่ม 2 คีย์ในโมดูล `settings`) | `settings.payments.edit` "แก้ค่าตั้งรับเงินและตรวจสลิป" · `settings.messaging.edit` "แก้ค่าตั้งการส่งข้อความหาลูกค้า" |

ห้าม: แตะ `prisma/schema` / migration (R0.3 ไม่มี migration) · แตะ legal/th-rental-2568.ts · build · commit · install · `any` · แคชข้ามคำขอ
**pure** (types/registry/template/defs/*): import ได้เฉพาะ `zod` · ไฟล์ pure ในโฟลเดอร์นี้ · `./legal/th-rental-2568` · `@/lib/core/permissions` · `import type` อะไรก็ได้ — ห้าม (ตรง/อ้อม) `@prisma/client`(ค่า) `@/lib/core/db` `next*` `server-only` `@/lib/modules/*` `@/lib/platform/*` `./service` (ข้อสอบไล่ import graph)

## 2. ชนิด (types.ts) — ส่วนที่ CC §1.3 ไม่ได้ระบุ = มติใบนี้
```ts
type ScopeKind = "TENANT"|"UNIT"|"BUILDING"|"ROOM_TYPE"|"ROOM"|"LEASE"|"RATE_PLAN"|"STAFF"|"SERVICE"|"RESOURCE"|"DEVICE"|"COURSE";
type SettingDomain = "booking"|"rooms"|"payments"|"messaging"|"qcfx";   // "qcfx" = ฟิกซ์เจอร์ QC เท่านั้น
type SettingDef = CC §1.3 + { labelTh: string; helpTh?: string;
  legal?: LegalRuleId[];                                      // ruleId ล้วน (D.1 oracle ผูกรูปนี้)
  legalInput?: (value: unknown, get: (key: string) => unknown) => Partial<Record<LegalRuleId, unknown | null>> };
type TemplateDef = { key: string; version: number; labelTh: string };
type GroupIssue  = { key: string; code: string; messageTh: string };
type GroupRule   = { group: string; check: (values: Record<string, unknown>) => GroupIssue[] };
type SettingsActor = MembershipCtx & { userId: string };      // จาก core/rbac (import type)
type ScopeRefs = CC §1.4 (unitId บังคับ)
type Resolved = { value; source: ScopeKind|"TEMPLATE"|"FALLBACK"; scopeId?: string; templateKey: string|null; differsFromTemplate: boolean };
type SetResult = { ok: true; saved: number }
               | { ok: false; code: "PERMISSION"|"VALIDATION"|"LEGAL_BLOCK"|"NEEDS_APPROVAL"|"CONFLICT"|"REQUIRES_INTEGRATION"|"NOT_FOUND";
                   issues: { key?: string; code: string; messageTh: string }[]; approvalId?: string|null };
```
- **`NOT_FOUND` เพิ่มจาก CC** (X1): scopeId ไม่มี / เป็นของร้านอื่น / อยู่สาขาที่ผู้กระทำเข้าไม่ได้ ⇒ คำตอบเดียวกันทุกกรณี (ไม่บอกว่ามีอยู่)
- ตัวแปลง legal ปริยาย (ไม่มี `legalInput`): `DEPOSIT_RETURN_DAYS`→`{days:v}` · `LATE_FEE_CAP`→`{feeSatang:v}` · `TEMPLATE_NO_THREAT`→`{text: ข้อความทุกช่องใน v ต่อกัน}` · rule อื่นที่ไม่ได้ input ⇒ ส่ง `undefined` ให้ evaluateLegal (= BLOCK INVALID_INPUT · fail closed) · `legalInput` คืน `null` ให้ rule ใด = "ตรวจตอนบันทึกค่าตั้งไม่ได้" ⇒ ข้าม (ตรวจซ้ำที่จุดต้นทุน D.7 ตาม CC §1.7)

## 3. registry.ts (pure)
- `defineSettings(domain, defs, opts?: { templates?: TemplateDef[]; snapshots?: Record<string, string[]>; groupRules?: GroupRule[] })` — **ตรวจทั้งชุดก่อนลงทะเบียนสักตัว** (โยน = ไม่มีอะไรลง): key ซ้ำ (กับของที่ลงแล้ว/ในชุด) · `key` ขึ้นต้น `${domain}.` · chain ว่าง/ScopeKind ไม่รู้จัก/ซ้ำ/`TENANT` ไม่อยู่ตัวแรก/`UNIT` ไม่อยู่ตัวแรกหรือถัดจาก TENANT · ค่าเริ่ม `_fallback` และทุกแม่แบบ (ที่ระบุ) ผ่าน `schema` · `labelTh` ว่าง · snapshot อ้าง key ที่ไม่มี (รวม defs ในชุดเดียวกัน) · `legal` อ้าง ruleId ไม่มีใน `TH_RENTAL_2568_RULES`
- เรียกซ้ำต่อ domain ได้ (D.1 `defs/rooms.ts` · B.0 `defs/booking.ts`) — แม่แบบ/snapshot/groupRules **ต่อท้าย**
- `TEMPLATES: Record<domain, readonly TemplateDef[]>` · `SNAPSHOT_KEYS: Record<kind, readonly string[]>` (ออบเจกต์สด อ่านได้หลังลงทะเบียน · kind เป็นข้อความตรวจกับทะเบียน แบบ K3 — CC 4 ชนิด + ฟิกซ์เจอร์ `"qcfx.doc"`)
- `getDef(key)` · `listDefs(domain, group?)` · `validateGroup(domain, group, values: Record<key, unknown>) → GroupIssue[]` (รวมทุก rule ของกลุ่ม)
- โหมดกฎหมายของ domain = ค่าตั้ง `${domain}.legal.mode` + `${domain}.legal.outOfScopeReason` (มีเฉพาะ rooms/qcfx) · domain ไม่มีคีย์โหมด แต่ def มี `legal` ⇒ ใช้ STRICT
- `sensitivity: "LEGAL"` ⇒ **เจ้าของเท่านั้นเสมอ** แม้ไม่ใส่ `ownerOnly` · `sensitivity: "MONEY"` = ใช้ `editPermission` ของ def (ให้ def ชี้คีย์สิทธิ์เงินเอง)

## 4. อ่าน (service.ts) — CC §1.4 + มติ
- `resolveSetting(ctx, key, refs, at?)` · `resolveSettings(ctx, keys, refs, at?)` (query เดียวต่อชุด · ผลเท่ากับเรียกทีละตัว) · `settingsDiff(ctx, { unitId, domain, actor? })` → `{key, scope, scopeId, value, templateValue}[]`
- ทุกคิวรีกรอง `tenantId = ctx.tenantId` (แถวร้านอื่นที่ scopeId ซ้ำกันห้ามมีผล) · ไม่มีแคชข้ามการเรียก
- ชั้นที่ใช้ได้ = เฉพาะใน `def.chain` และมี ref ส่งมา (TENANT ใช้ ctx.tenantId · UNIT ใช้ refs.unitId) · ต่อชั้นเลือกแถว `effectiveFrom ≤ at` ล่าสุด แล้วชั้นเจาะจงสุดชนะ (ชั้นเจาะจงที่เก่ากว่า ชนะชั้นกว้างที่ใหม่กว่า)
- ไม่มี `SettingProfile(unitId, domain)` ⇒ `_fallback` (source FALLBACK · templateKey null) · มี ⇒ ค่าของแม่แบบนั้น (ไม่มีคีย์แม่แบบใน defaults ⇒ `_fallback`) · `differsFromTemplate` = deepEqual(value, ค่าแม่แบบ/fallback) ไม่จริง

## 5. เขียน — CC §1.5 + มติ (ทั้งชุดใน tx เดียว · ล้มข้อเดียว = ไม่มีอะไรลงเลย: ไม่มี SettingValue/SettingChange/audit/outbox)
### 5.1 ลำดับตรวจ → โค้ดที่คืน
1. key ไม่รู้จัก · scope ไม่รู้จัก/ไม่อยู่ใน chain · zod ไม่ผ่าน · `effectiveFrom` บน def ที่ไม่ใช่ `effectiveDated` · ตัวแปรแม่แบบไม่อนุญาต (`checkTemplate`) ⇒ `VALIDATION` (messageTh ไทย · ไม่โทษผู้ใช้)
2. key+scope+scopeId+effectiveFrom ซ้ำในชุดเดียว ⇒ `CONFLICT`
3. **scopeId เป็นของร้าน** (อ่านในtx · `tenantId` ตรง): TENANT = ctx.tenantId · UNIT=`BusinessUnit` · BUILDING=`RoomBuilding` · ROOM_TYPE=`HotelRoomType` · ROOM=`HotelRoom` · STAFF=`BookingStaff` · SERVICE=`BookingService` · ชั้นที่ยังไม่มีตาราง (LEASE RATE_PLAN RESOURCE DEVICE COURSE) ⇒ ปฏิเสธ (fail closed · ใบที่สร้างตารางยื่นขอเพิ่ม) · ไม่พบ/ร้านอื่น/**สาขาของ entity ที่ actor เข้าไม่ได้** (`canAccessUnit`) ⇒ `NOT_FOUND` · unitId ของ change = สาขาของ entity (TENANT = null)
4. สิทธิ์ ⇒ `PERMISSION`: `evaluate(actor, {module: editPermission ส่วนหน้าจุดแรก, action: editPermission, unitId})` · `ownerOnly` หรือ `sensitivity LEGAL` ⇒ OWNER เท่านั้น · ชั้น TENANT ⇒ OWNER หรือ unitAccess มี `"*"` เท่านั้น (พนักงานจำกัดสาขาแก้ค่าทั้งร้านไม่ได้)
5. ตรวจข้ามค่า: ต่อ (domain, group, refs ของ change) คำนวณค่าหลังชุด แล้ว `validateGroup` ⇒ `VALIDATION` (ชุดเดียวที่แก้คู่ค่าพร้อมกันต้องผ่าน) · TENANT scope = ตรวจกับทุกสาขาของร้านที่มี profile ใน domain นั้น
6. `requires.integration` และค่าเป็น truthy ⇒ ต้องมี `TenantIntegration` ของร้านนี้ `kind` ตรง `status "CONNECTED"` และ (`unitIds` ว่าง หรือมีสาขาของ change · TENANT scope ต้อง `unitIds` ว่าง) — ไม่มี ⇒ `REQUIRES_INTEGRATION` (อ่านตารางตรง + comment ว่าเปลี่ยนเป็น `getIntegration` เมื่อ R0.5 ลง)
7. กฎหมาย (§5.2) ⇒ `LEGAL_BLOCK` / `NEEDS_APPROVAL`
8. เขียน: upsert `SettingValue` (setById · overrideReason) · `SettingChange` (before = ค่าแถวเดิมของ key/scope/scopeId/effectiveFrom หรือ null · after · unitId · legalLevel/legalCode/reason/approvalId · actorId) · `writeAudit` action **`settings.set`** (targetType `SettingValue` · before/after) · outbox `settings.changed` **1 event ต่อ (domain, scope, scopeId) ต่อการเรียก** payload = `{tenantId, unitId, domain, keys[], scope, scopeId}` เท่านั้น (ไม่มีค่า) · idempotencyKey ต่อ SettingChange id
- **กันเขียนพร้อมกัน (X3)**: ล็อกต่อ (tenantId,key,scope,scopeId) ใน tx (`pg_advisory_xact_lock(hashtext(...))` หรือเทียบเท่า) ⇒ 10 ทางพร้อมกัน = ok ครบ 10 · แถวเดียว · ประวัติ 10 แถวต่อกันเป็นสาย before→after
- ค่าเท่ากับค่าที่สืบจากชั้นบน (def ไม่ใช่ effectiveDated) ⇒ **ไม่เก็บแถว** (ลบแถวเดิมถ้ามี) ตาม CC §1.2 · คืน ok
- `SettingChange` เขียนต่อท้ายอย่างเดียว: ห้าม `settingChange.update/updateMany/delete/deleteMany/upsert` ทั้ง src

### 5.2 กฎหมาย (ใช้ `evaluateLegal` ของ legal/th-rental-2568.ts เท่านั้น · ห้ามเขียนตรรกะโหมดซ้ำ)
- โหมด = resolve `${domain}.legal.mode` ที่สาขาของ change (ค่าก่อนชุดนี้) + เหตุผล `${domain}.legal.outOfScopeReason` · **change ระดับ TENANT ใช้ STRICT เสมอ** (มีผลทุกสาขา)
- outcome `BLOCK` ⇒ `LEGAL_BLOCK` (issues มี code ของ verdict + messageTh) — รวม `always` ทุกโหมด
- outcome `needsAck` แต่ `opts.ackLegalWarn` ไม่ true ⇒ `NEEDS_APPROVAL` (issues มี verdict · ไม่สร้างคำขอ · ไม่เขียน)
- ack แล้ว: ต้องมี `reason` (≥10 ตัวอักษรหลัง trim · ใช้ `isValidOutOfScopeReason`) ไม่งั้น `VALIDATION` code `REASON_REQUIRED`
  - ไม่ต้องให้เจ้าของอนุมัติ (`needsOwnerApproval` false) หรือ actor = OWNER ⇒ บันทึกทันที · legalLevel `"WARN"` · legalCode = code ของ verdict · reason · approvalId null (เจ้าของกดเอง = อนุมัติ · แกนอนุมัติห้ามอนุมัติตัวเองอยู่แล้ว)
  - ไม่ใช่ OWNER ⇒ `submitForApproval({entityType: "settings.legal_override", entityId: <id ข้อเสนอ>, unitId, requestedById: actor.userId})` (ผ่าน facade `@/lib/modules/approval`) ⇒ ได้ `requestId` ⇒ คืน `{ok:false, code:"NEEDS_APPROVAL", approvalId: requestId}` ค่ายังไม่เปลี่ยน · ได้ `autoApproved` (ไม่มีนโยบาย) ⇒ **ห้ามบันทึก** คืน `NEEDS_APPROVAL` + issue `OWNER_MUST_APPROVE` · approvalId null
  - ที่เก็บข้อเสนอ (ไม่มี migration): แนะนำ `AuditLog` action `settings.legal_override.proposed` targetType `SettingProposal` targetId = id ข้อเสนอ (cuid) after = changes ทั้งชุด + unitId + reason — เขียนใน tx ตรง (writeAudit กลืน error/ไม่คืน id) · ข้อสอบไม่ผูกที่เก็บ ผูกแค่พฤติกรรม
- OUT_OF_SCOPE (มีเหตุผล) ⇒ บันทึก legalLevel `"OK"` (legalCode = code ดิบถ้าไม่ OK ก็ได้)

### 5.3 คืนค่า/แม่แบบ/ประวัติ
- `resetSetting(actor, ctx, {key, scope, scopeId})` → `{ok:true, removed}` | `{ok:false, code}` — ตรวจ 1/3/4 เหมือนเขียน · ลบทุกแถว effectiveFrom ของ key/scope/scopeId · ต่อแถว: SettingChange after=null · audit **`settings.reset`** · outbox `settings.changed`
- `applyTemplate(actor, ctx, {unitId, domain, templateKey, overwrite})` → `{ok:true, removed}` | `{ok:false, code}` — **OWNER เท่านั้น** (แม่แบบเปลี่ยนค่าเงิน/กฎหมาย) · แม่แบบไม่รู้จัก ⇒ VALIDATION · unitId ไม่ใช่ของร้าน ⇒ NOT_FOUND · upsert `SettingProfile` (templateVersion = version ของแม่แบบ) · `KEEP_CUSTOM` ไม่ลบอะไร · `RESET_ALL` ลบแถว **domain นั้น** ที่ชั้น UNIT ของสาขานี้ + ชั้นที่ลึกกว่าซึ่ง entity อยู่สาขานี้ (คงแถว TENANT · คงแถวสาขาอื่น · คงแถว domain อื่น) ต่อแถว SettingChange after=null · audit **`settings.template.apply`** (targetType `SettingProfile`) · outbox `settings.changed` scope UNIT scopeId unitId keys = ทุกคีย์ของ domain
- `settingHistory(ctx, {unitId?, key?, actor?})` → แถว SettingChange ของร้าน · actor ที่ไม่ใช่ OWNER และไม่มี `"*"` ⇒ **เห็นเฉพาะ unitId ที่เข้าได้** (แถว TENANT = null ไม่เห็น · ขอ unitId สาขาอื่น ⇒ `[]`) · `settingsDiff` กรองแบบเดียวกัน (สาขาที่เข้าไม่ได้ ⇒ `[]`)

### 5.4 ผลอนุมัติ (approval-effects.ts)
- `settings.legal_override` APPROVED ⇒ อ่านข้อเสนอแล้วเขียนตาม §5.1 ข้อ 8 (actorId = ผู้ยื่น · legalLevel "WARN" · approvalId = requestId · reason) ข้ามตรวจกฎหมาย (อนุมัติแล้ว) แต่ยังตรวจ zod/scope · **idempotent**: มี SettingChange approvalId นี้แล้ว ⇒ เงียบ · REJECTED ⇒ ไม่ทำอะไร
- ป้าย/allowlist 3 ที่ (labels · approval/actions · approval-effects) ตาม CC §1.7

## 6. Snapshot
- `snapshotPolicy(ctx, kind, refs, at?) → PolicySnapshot` (CC §1.6 · v 1 · domain ของ kind · template = profile {key, version} หรือ `{key:"_fallback", version:0}` · values/sources ครบเฉพาะ `SNAPSHOT_KEYS[kind]`) · kind ไม่รู้จัก ⇒ throw
- `fromSnapshot(snapshot, key)` → ค่าจาก snapshot · key ไม่มีใน snapshot ⇒ throw (เอกสารห้ามตกไปอ่าน resolver)
- ผลเป็น JSON ล้วน (เก็บลงคอลัมน์ Json ได้ตรง ๆ)

## 7. defs ร่วม
### 7.1 defs/payments.ts (domain payments · chain `["TENANT","UNIT"]` · editPermission `settings.payments.edit`)
| key | type | `_fallback` | หมายเหตุ |
|---|---|---|---|
| `payments.receiver` | table | `null` | `ownerOnly` · `sensitivity MONEY` (บัญชีรับเงิน · CC §2.3 PROMPTPAY) |
| `payments.slip.autoApprove` | bool | `false` | `requires: {integration: "SLIP_VERIFY"}` (หอ #54) |
| `payments.slip.toleranceSatang` | money | `0` | ≥0 (#55) |
| `payments.slip.payerNameMatch` | enum `OFF|WARN|BLOCK` | `"WARN"` | (#56) |
| `payments.slip.maxAgeHours` | int | `72` | 1..720 |
| `payments.slip.onVerifierDown` | enum `MANUAL|REJECT` | `"MANUAL"` | (#57) |
### 7.2 defs/messaging.ts (domain messaging · editPermission `settings.messaging.edit`)
| key | type | `_fallback` | chain |
|---|---|---|---|
| `messaging.channelOrder` | table (array ของ `LINE|SMS|WEB_LINK` ไม่ซ้ำ ≥1) | `["LINE","WEB_LINK"]` | TENANT→UNIT |
| `messaging.lineConnectionId` | text nullable | `null` | UNIT |
| `messaging.quietHours` | table `{start:"HH:MM", end:"HH:MM"} | null` | `{start:"21:00", end:"08:00"}` | TENANT→UNIT |
ทุก def ของ payments/messaging: `editPermission` ∈ `PERMISSION_KEYS`

## 8. ฟิกซ์เจอร์ «defs/_fixture.ts» (ตรงตัว · ข้อสอบผูก) — `defineSettings("qcfx", DEFS, {templates, snapshots, groupRules})`
- templates: `{key:"QCFX_A", version:1, labelTh:"แม่แบบทดสอบ ก"}` · `{key:"QCFX_B", version:2, labelTh:"แม่แบบทดสอบ ข"}`
- ทุก def: `domain "qcfx"` · `editPermission "qcfx.settings.edit"` · `labelTh` ไทยไม่ว่าง
| key | group | type | schema | QCFX_A | QCFX_B | `_fallback` | chain | อื่น |
|---|---|---|---|---|---|---|---|---|
| `qcfx.general.label` | general | text | string 1..40 | "ช่าง" | "หมอนวด" | "พนักงาน" | TENANT UNIT | |
| `qcfx.late.graceMin` | late | minutes | int 0..120 | 10 | 15 | 5 | TENANT UNIT SERVICE STAFF | |
| `qcfx.late.noShowAfterMin` | late | minutes | int 0..240 | 20 | 30 | 15 | TENANT UNIT SERVICE STAFF | |
| `qcfx.fee.rentSatang` | fee | money | int 0..10,000,000 | 350000 | 420000 | 0 | TENANT UNIT BUILDING ROOM_TYPE ROOM | `effectiveDated` · `sensitivity MONEY` |
| `qcfx.legal.mode` | legal | enum | STRICT/WARN/OUT_OF_SCOPE | "STRICT" | "STRICT" | "STRICT" | UNIT | `sensitivity LEGAL` · **ไม่ใส่ ownerOnly** (ทดสอบว่า LEGAL = เจ้าของเท่านั้นเอง) |
| `qcfx.legal.outOfScopeReason` | legal | text | string ≤500 nullable | null | null | null | UNIT | `sensitivity LEGAL` |
| `qcfx.deposit.returnDays` | deposit | days | int 0..60 | 7 | 7 | 7 | TENANT UNIT ROOM_TYPE | `legal ["DEPOSIT_RETURN_DAYS"]` (ตัวแปลงปริยาย) |
| `qcfx.deposit.autoVerify` | deposit | bool | boolean | false | false | false | TENANT UNIT | `requires {integration:"SLIP_VERIFY"}` |
| `qcfx.msg.reminder` | msg | template | `{th: string 1..1000, en?: string ≤1000 \| null}` | `{th:"เรียน {ชื่อ} ห้อง {ห้อง} ยอด {ยอด} บาท"}` | เหมือน A | เหมือน A | TENANT UNIT | `templateVars ["ชื่อ","ห้อง","ยอด"]` · `legal ["TEMPLATE_NO_THREAT"]` |
| `qcfx.owner.payoutNote` | owner | text | string ≤200 | "" | "" | "" | TENANT UNIT | `ownerOnly` · `sensitivity MONEY` |
- groupRules: `late` — noShowAfterMin ≤ graceMin ⇒ issue `{key:"qcfx.late.noShowAfterMin", code:"NO_SHOW_BEFORE_GRACE"}` · `legal` — mode OUT_OF_SCOPE และเหตุผลไม่ผ่าน `isValidOutOfScopeReason` ⇒ `{key:"qcfx.legal.outOfScopeReason", code:"OUT_OF_SCOPE_REASON_REQUIRED"}`
- snapshots: `{"qcfx.doc": ["qcfx.late.graceMin","qcfx.late.noShowAfterMin","qcfx.fee.rentSatang","qcfx.deposit.returnDays"]}`
- `renderTemplate(def, value, vars, locale)`: แทน `{ตัวแปร}` · ตัวแปรที่ไม่ส่ง = "" · locale `"en"` แต่ไม่มี en ⇒ ใช้ th

## 9. เกณฑ์รับ
1. ข้อสอบ «qc-svc-r0.3.mts» ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน) — ผู้คุมรันเอง
2. regression (ผู้คุมรัน): `qc-approval.mts` `qc-approval-edit.mts` `qc-approval-wiring.mts` `qc-automation.mts` `qc-webhook.mts` + `qc-svc-d.1.mts` (ส่วน defs ยัง SKIP จน D.1 ทำ defs/rooms.ts) + `qc-svc-r0.1.mts`
3. typecheck (ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168) + fitness 2 โหมด (มี env / `env -u DATABASE_URL`) — โมเดลใหม่ไม่ต้องลง scope เพิ่ม (R0.1 ลงแล้ว)
4. ตรวจเข้ม 2 รอบ (กฎหมาย · ข้ามร้าน/ข้ามสาขา)

## 10. มติของใบนี้ (ผู้เขียนข้อสอบตัดสิน · ผู้คุมยืนยันตอนรับ)
1. `NOT_FOUND` เพิ่มในชุดโค้ด (X1 = 404) · ข้ามสาขาที่เข้าไม่ได้ = NOT_FOUND เหมือนข้ามร้าน
2. ชั้น TENANT: เขียนได้เฉพาะ OWNER/`"*"` · ตรวจกฎหมายแบบ STRICT · integration ต้องครอบคลุมทุกสาขา
3. WARN override: OWNER ack+เหตุผล = บันทึกทันที · ผู้อื่น = ผ่านสายอนุมัติ · ไม่มีนโยบาย = ห้ามบันทึก (ไม่ autoApprove) — เจ้าของควรมีนโยบาย `settings.legal_override` ⇒ ให้ D.13 สร้างนโยบายปริยาย (OWNER 1 ขั้น) ตอนเปิดหอ
4. `applyTemplate` = OWNER เท่านั้น · RESET_ALL ไม่แตะแถว TENANT/สาขาอื่น/domain อื่น
5. `def.legal` = ruleId[] (รูปที่ D.1 oracle ผูก) + `legalInput` เป็นตัวแปลง · domain ฟิกซ์เจอร์ `qcfx` + snapshot kind เป็นข้อความตรวจกับทะเบียน
6. `SettingDef.labelTh` บังคับ (R0.4 ต้องใช้ · CC §1.3 ไม่ได้ระบุ)
7. คีย์สิทธิ์ใหม่ `settings.payments.edit` · `settings.messaging.edit` (CC §8 ยังไม่มีคีย์สำหรับค่าตั้งร่วม)
