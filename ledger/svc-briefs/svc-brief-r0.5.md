# ใบสั่ง R0.5 — ศูนย์เชื่อมต่อ (Integrations) · ตรวจ **เข้ม** (ความลับ · ข้ามร้าน)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.5 · `ledger/SVC-CORE-CONTRACT.md` §2 (+ §7 event · §8 สิทธิ์) · `ledger/DESIGN-BOOKING-QUEUE.md` §4.6 · `ledger/DESIGN-DORM-HOTEL.md` §5.3 · ภาพ `ledger/design-booking/10-integrations.png` = `ledger/design-dorm/11-integrations.png` (หน้าเดียว — parity กับทั้งสอง) · `ledger/wo-notes/svc-r0.8-carry.md` (ข้อ R0.5) · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): `scripts/qc-svc-r0.5.mts` — 69 ข้อ (F4 S4 K4 C7 A5 X1 T3 G3 L7 E2 V4 FK2 D1 J2 R12 P4 Z4) · รับใบ = **ไม่มี FAIL** · SKIP ที่ยอมได้มีชนิดเดียว: `P-4` ถ่ายภาพจริง (ไม่มี QC server — ผู้คุม build + ถ่ายเองตอนรับงาน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แก้ `prisma/`** (ตารางมีแล้วจาก R0.1) · รายงานต่อข้อ (id → ผล)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.5.mts` (เขียนฐาน qc-svc · ห้ามรันขนานกับข้อสอบอื่นที่เขียนฐาน · ห้ามครอบ timeout)
> regression ที่ผู้คุมรันตอนรับ: `qc-svc-smoke.mts` · `qc-chat-security.mts` · `qc-chat-security-scope.mts` (การเชื่อม LINE) · `qc-payment.mts` · `qc-svc-r0.1.mts` (ตาราง)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/core/integrations/types.ts» (บริสุทธิ์) | `IntegrationKind` · interface ต่อชนิด (CC §2.4) · `IntegrationHandle` · `CallResult` |
| «src/lib/core/integrations/registry.ts» (บริสุทธิ์ · อ่าน env ตอนเรียก) | แค็ตตาล็อก 9 ชนิด + ผู้ให้บริการต่อชนิด `{code,label,fields[{name,label,secret,required}]}` |
| «src/lib/core/integrations/secret-box.ts» | AES-256-GCM (ลอกรูปแบบ `src/lib/modules/pos/secret-box.ts` — **ห้าม import POS/แชท**) |
| «src/lib/core/integrations/service.ts» | save/test/disable/list/get/call/purge (§3) |
| «src/lib/core/integrations/providers/fake.ts» | ผู้ให้บริการ `FAKE` (§4) |
| «src/lib/core/integrations/index.ts» | facade — ส่งออกทุกชื่อใน §3 |
| «src/app/app/settings/integrations/page.tsx» (+ ไฟล์ลูกในโฟลเดอร์เดียวกัน · actions `"use server"`) | หน้าศูนย์เชื่อมต่อ (§6) |
| `src/lib/core/permissions.ts` (เพิ่ม) | คีย์ `settings.integrations.manage` ป้ายไทย ในโมดูล `settings` |
| `src/lib/platform/minute-jobs.ts` (เพิ่ม) | งาน `integrations.calllog.purge` (§5) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` (เพิ่ม) | event `integration.connected` · `integration.failed` (3 ทะเบียน · consumer ว่าง/no-op ได้) |
| `scripts/svc-qc-data.mts` (เพิ่มคีย์เดียว) | `SQC_VISUAL_SPECS["r0.5"] = [{ name: "integrations", path: "/app/settings/integrations" }]` |
| `.env.example` (เพิ่ม) | `INTEGRATIONS_CREDENTIALS_KEY=` (คอมเมนต์ `openssl rand -hex 32` · ห้ามใส่ `INTEGRATIONS_FAKE`) |

## 2. ค่าลับ (secret-box.ts) — ข้อสอบเปิดกล่องเอง
- ส่งออก: `INTEGRATIONS_CREDENTIALS_ENV = "INTEGRATIONS_CREDENTIALS_KEY"` · `integrationSecretKeyConfigured(): boolean` · `sealIntegrationSecret(obj): string` · `openIntegrationSecret(box): Record<string,unknown> | null`
- รูปแบบ `b64(iv 12B).b64(tag 16B).b64(cipher)` · iv สุ่มทุกครั้ง · กุญแจ = SHA-256(`"integrations:" + env`) · **อ่าน env ทุกครั้งที่เรียก** (ไม่แคชตอนโหลดโมดูล — ข้อสอบสลับ env ในโปรเซส)
- env ว่าง/สั้นกว่า 32 ตัว (หลัง trim) = ไม่มีกุญแจ · **ไม่มีกุญแจสำรองทั้ง dev/prod** · seal ไม่มีกุญแจ = throw · open: ทุกกรณีที่ไม่สำเร็จ (ไม่มีกุญแจ/ผิด/ถูกแก้/ขยะ/ไม่ใช่ string) = `null` **ไม่ throw**

## 3. สัญญา service (ส่งออกจาก `@/lib/core/integrations`)
```ts
type IntegrationCtx   = { tenantId: string };
type IntegrationActor = { userId: string; role: "OWNER"|"MANAGER"|"STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
// actor มาจากผู้เรียก (action อ่าน session/membership) — service ไม่อ่าน Membership ซ้ำ (แบบ POS integration-creds)
type Refusal = { ok: false; code: "NOT_FOUND"|"PERMISSION_DENIED"|"VALIDATION"|"NOT_CONFIGURED"|"UNKNOWN"; message: string /* ไทย */ };
type FieldView = { name: string; label: string; secret: boolean; required: boolean; filled: boolean; masked: string };
type IntegrationView = { id; kind; provider; label; unitIds: string[]; status: "DRAFT"|"CONNECTED"|"ERROR"|"DISABLED";
  onFailure: "MANUAL"|"REJECT"; fields: FieldView[]; lastTestAt: string|null; lastTestOk: boolean|null; lastError: string|null;
  consecutiveFailures: number; virtual: false };
type VirtualView = { id: string; kind: "LINE_OA"|"PROMPTPAY"; label: string; status: "CONNECTED"|"ERROR"|"DISABLED"|"NOT_CONNECTED";
  summary: string; manageHref: string; virtual: true };
type CatalogEntry = { kind: string; label: string; ready: boolean; virtual: boolean; providers: { code: string; label: string }[] };

saveIntegration(ctx, actor, input: { id?: string; kind: string; provider: string; label?: string; unitIds?: string[];
                onFailure?: "MANUAL"|"REJECT"; fields?: Record<string, string> }) → { ok: true; integration: IntegrationView } | Refusal
testIntegration(ctx, actor, { id }) → { ok: true; passed: boolean; code: string | null; integration: IntegrationView } | Refusal
disableIntegration(ctx, actor, { id }) → { ok: true; integration: IntegrationView } | Refusal
listIntegrations(ctx, actor) → { ok: true; keyConfigured: boolean; items: (IntegrationView|VirtualView)[]; catalog: CatalogEntry[] } | Refusal
getIntegration({ tenantId, unitId? }, kind) → Promise<IntegrationHandle | null>     // ไม่ throw
callIntegration(handle, op, fn, opts?: { timeoutMs?: number /* 8000 */ }) → CC §2.3                // ไม่ throw
purgeIntegrationCallLogs(now: Date) → Promise<{ deleted: number }>
INTEGRATION_CALL_LOG_RETENTION_DAYS = 30
```
**คำปฏิเสธคืนเป็นข้อมูลเสมอ ไม่ throw** · ข้อความไทย ไม่โทษผู้ใช้ · ไม่มีค่าลับใน message ใด ๆ

### 3.1 save (patch)
- ไม่มี `id` + (kind,provider,label) ซ้ำของร้านเดิม = แก้แถวนั้น · ไม่มี = สร้าง status `DRAFT` · มี `id` ของร้านอื่น/ไม่มี ⇒ `NOT_FOUND`
- `fields`: ไม่ส่ง = คงเดิม · `""` = ล้าง (secret: เอาชื่อออกจาก `secretNames` · public: ลบคีย์) · ไม่รู้จักชื่อฟิลด์ ⇒ `VALIDATION` · label/unitIds/onFailure ไม่ส่ง = คงเดิม · label ว่างตอนสร้าง ⇒ `VALIDATION`
- ค่าลับเข้า `secretBox` ก้อนเดียว (รวมค่าลับเดิม + ใหม่ แล้วปิดใหม่) · ค่าสาธารณะเข้า `publicFields` · `secretNames` = ชื่อที่มีค่า
- **ไม่มีกุญแจ (หรือ < 32) และ `fields` มีค่าลับที่ไม่ว่าง ⇒ `NOT_CONFIGURED`** ข้อความมี "ยังไม่ตั้งกุญแจ" · ไม่สร้าง/ไม่แก้แถว (ห้ามเก็บ plaintext)
- กุญแจเปลี่ยน (กล่องเดิมเปิดไม่ได้) แล้ว save ค่าลับใหม่ = ปิดกล่องใหม่เฉพาะค่าที่ส่ง (ค่าลับเดิมหาย) — ไม่ throw
- kind ต้องเป็นชนิดเก็บ (`SLIP_VERIFY · PAYMENT_GATEWAY · SMS · CHANNEL_MANAGER · METER · CALENDAR · EDC`) · `LINE_OA`/`PROMPTPAY`/อื่น ⇒ `VALIDATION` · provider ไม่รู้จัก (รวม FAKE เมื่อปิด) ⇒ `VALIDATION` · `onFailure` อื่น ⇒ `VALIDATION`
- `unitIds`: ทุกตัวต้องเป็น `BusinessUnit` ของร้านนี้ ⇒ ไม่ใช่ = `VALIDATION` (หน่วยร้านอื่น) · `[]` = ทุกหน่วย
- **บันทึกไม่เปลี่ยน status** (ยกเว้นแถวใหม่ = DRAFT) · ทางเดียวที่ DRAFT/ERROR → CONNECTED คือ test/call ที่ผ่าน
- audit `settings.integration.save` · targetType `TenantIntegration` · targetId = id · before/after = **ชื่อฟิลด์ที่เปลี่ยน** + label/unitIds/onFailure/status (ห้ามค่าลับ · ห้าม 4 ตัวท้าย)

### 3.2 สิทธิ์ (`settings.integrations.manage` — เจ้าของ)
- save/test/disable: `role === "OWNER"` **หรือ** `permissions["settings.integrations.manage"] === true` ตรงตัว (MANAGER ไม่ได้โดยปริยาย · `settings.*` ไม่นับ) ⇒ อื่น ๆ `PERMISSION_DENIED` ไม่แตะแถว
- ผู้ที่ไม่ใช่ OWNER และ `unitAccess` ไม่มี `"*"`: แตะได้เฉพาะแถวที่ `unitIds` ไม่ว่างและอยู่ในหน่วยที่เข้าถึงได้ทั้งหมด (สร้าง/แก้ให้ `unitIds=[]` หรือหน่วยอื่น ⇒ `PERMISSION_DENIED`)
- list: OWNER · ผู้มีคีย์ · MANAGER (อ่านอย่างเดียว) · STAFF ไม่มีคีย์ ⇒ `PERMISSION_DENIED`

### 3.3 การแสดง (ทุกผลคืน · list · หน้า)
- ค่าลับ: `masked = "••••" + 4 ตัวท้าย` (ค่ายาว ≤ 8 = `"••••"`) · กล่องเปิดไม่ได้ (กุญแจผิด) = `filled:true` `masked:"••••"` ไม่ throw · public: masked = ค่าเต็ม
- ห้ามมี `secretBox` / ค่าลับเต็ม / 8 ตัวแรก ในผลคืน (DTO/RSC) ใด ๆ · `lastError` = ข้อความไทยสั้น ≤ 200 ตัวที่**ไม่ได้มาจาก** `error.message` ของผู้ให้บริการ (carry R0.8: ห้ามข้อความดิบที่สะท้อนคีย์)
- `catalog`: 9 ชนิด = `LINE_OA · PROMPTPAY` (virtual) + `SLIP_VERIFY · PAYMENT_GATEWAY · SMS · CHANNEL_MANAGER · METER · CALENDAR · EDC` · `ready` = true เฉพาะ `LINE_OA · PROMPTPAY · SLIP_VERIFY` (ที่เหลือ "เร็ว ๆ นี้")

### 3.4 ชนิดเสมือน (อ่านจากของเดิม · ไม่เก็บซ้ำ · ไม่มีแถว TenantIntegration kind LINE_OA/PROMPTPAY)
- `LINE_OA`: 1 รายการต่อ `ChatChannelConnection` type LINE ของร้าน · label มี `displayName` · status ตาม connection · `manageHref` ไปหน้าตั้งค่าแชท · **ห้ามอ่าน/ส่งออก `credentials` และ `webhookKey`**
- `PROMPTPAY`: จาก `PaymentProfile` ของร้าน (มี `promptpayId` = CONNECTED · summary ปิดบังเหลือ 4 ตัวท้าย ห้ามเลขเต็ม · ไม่มี = NOT_CONNECTED) · `manageHref` = `/app/settings/payment` · ค่าตั้ง `payments.receiver` ระดับหน่วย = รอ R0.3/R0.6 (ยังไม่ต้องอ่าน)
- ร้านอื่นไม่เห็นของร้านนี้

### 3.5 get / call
- `getIntegration`: แถวของร้าน · kind ตรง · status `CONNECTED` หรือ `ERROR` (ERROR ต้องเรียกได้ เพื่อฟื้น) · `DRAFT`/`DISABLED` = ไม่นับ · ครอบคลุมหน่วย: `unitIds=[]` หรือ `unitId ∈ unitIds` · **ไม่ส่ง unitId = นับเฉพาะ `unitIds=[]`** · หลายแถวตรง: แถวที่ระบุหน่วยชนะแถวทุกหน่วย → แล้ว updatedAt ล่าสุด · provider ปิดอยู่ (FAKE ไม่เปิด) / ไม่มีกุญแจ / กล่องเปิดไม่ได้ ⇒ `null` · handle = `{ integrationId, kind, provider, onFailure, adapter }` — **`JSON.stringify(handle)` ต้องไม่มีค่าลับ** (เก็บใน closure)
- `callIntegration`: ไม่ throw · fn throw ⇒ `PROVIDER_ERROR` (error ที่มี `code === "QUOTA"` ⇒ `QUOTA`) · เกิน timeout ⇒ `TIMEOUT` (คืนภายใน ~timeout) · `fallback = handle.onFailure` · เขียน `IntegrationCallLog` **ทุกครั้ง** `{tenantId, integrationId, op, ok, ms ≥ 0, code: null|รหัส}` (code ∈ TIMEOUT/PROVIDER_ERROR/QUOTA/NOT_READY — ไม่มีข้อความดิบ)
- ล้ม: `consecutiveFailures` +1 แบบ atomic (ยิงพร้อมกัน 10 = +10 พอดี) · ถึง 5 ⇒ status `ERROR` + outbox `integration.failed` **ครั้งเดียวต่อการตกเป็น ERROR** · ผ่าน: `consecutiveFailures=0` · ถ้าเดิมไม่ใช่ CONNECTED ⇒ `CONNECTED` + `integration.connected` (ครั้งเดียวต่อการเปลี่ยน)
- `testIntegration` = `callIntegration(handle, "test", a => a.test())` บนแถวนั้น (ใช้ได้กับ DRAFT/ERROR/CONNECTED · DISABLED ⇒ `VALIDATION`) · ตั้ง `lastTestAt/lastTestOk/lastError` · ผ่าน ⇒ CONNECTED (+event เมื่อเปลี่ยน) · ไม่มีกุญแจ/กล่องเปิดไม่ได้ ⇒ `NOT_CONFIGURED` (ข้อความมี "กุญแจ") · audit `settings.integration.test`
- event payload = `{ integrationId, kind, provider }` **พอดี** (ไม่มีคีย์อื่น) · `emitOutbox` (unitId null)
- `disableIntegration`: status `DISABLED` · `secretBox = null` · `secretNames = []` (ลบค่าลับทิ้ง) · แถวคงไว้ · get ⇒ null · audit `settings.integration.disable`

## 4. ผู้ให้บริการ FAKE (providers/fake.ts)
- เปิดเมื่อ `INTEGRATIONS_FAKE === "1"` **และ** `APP_ENV !== "production"` (อ่านตอนเรียก) · ปิด = ไม่อยู่ใน registry/catalog · save ⇒ `VALIDATION` · get แถวเดิม ⇒ null
- มีทุกชนิดเก็บ · ฟิลด์: `apiKey` (secret · required) · `accountId` (public) · `mode` (public · `OK`(ค่าเริ่ม)/`FAIL`/`QUOTA`)
- `test()`: OK ⇒ ผ่าน · FAIL ⇒ `throw new Error("fake provider failure apiKey=" + apiKey)` (**จงใจสะท้อนคีย์ — positive control ของตัวกรอง**) · QUOTA ⇒ throw error ที่ `code = "QUOTA"`
- SLIP_VERIFY: `verify(input, expect)` ⇒ `{ status: "VALID", amountSatang: expect.amountSatang, transRef: "FAKE-…" }` (mode เดียวกับ test) · `quota()` ⇒ `{ remaining: 100 }`

## 5. งานลบ call log
- `purgeIntegrationCallLogs(now)` ลบแถว `at < now − 30 วัน` (ทุกร้าน · แบ่งก้อนได้) · รันซ้ำ = 0 · ลงทะเบียน `registerMinuteJob({ name: "integrations.calllog.purge", everyMinutes: 1440, cadence: "daily", run })` ใน `minute-jobs.ts` (import แบบ dynamic เหมือนงาน CRM)

## 6. หน้า `/app/settings/integrations` (ภาพ จอง 10 · หอ 11)
- RSC เรียก `listIntegrations` ผ่าน session · หมวดตามภาพ (รับเงิน · ส่งข้อความ · ช่องทางขาย/อุปกรณ์) · การ์ดทุกชนิดใน catalog · ไม่พร้อม = "เร็ว ๆ นี้" · การ์ด LINE/พร้อมเพย์ = ลิงก์ไปที่จัดการเดิม · **การ์ด POS แบบลิงก์** ("ตัวเชื่อมของ POS ตั้งที่หน้าตั้งค่า POS" → `/app/sys/<id>/pos/settings` — ไม่อ่านค่า POS)
- แผงข้าง: ผู้ให้บริการ · ฟิลด์ (ลับ = `••••3f9a` + ปุ่ม "เปลี่ยน") · ทดสอบ + ผลล่าสุด · ใช้กับ (หน่วย) · เมื่อล่ม (ส่งเข้าคิวมือ/ปฏิเสธ) · ใครแก้ได้ · ถอดการเชื่อมต่อ · ไม่มีกุญแจ = แถบ "ยังไม่ตั้งกุญแจ" ปุ่มบันทึกปิด
- ไฟล์ `'use client'` ห้าม import `@/lib/core/integrations` (facade/service/secret-box) — ใช้ type/registry หรือ props · ไม่มีคำว่า `secretBox` ในโฟลเดอร์หน้า
- ความต่างจาก `/app/settings/connections` (เชื่อมระบบภายใน) — คงหน้านั้นไว้

## 7. ห้าม
- import POS/แชท จาก core/integrations (อ่านตาราง ChatChannelConnection/PaymentProfile ด้วย prisma ได้ — ห้ามเรียก service แชท) · แตะ `PosIntegrationCredential`/`pos/secret-box.ts`
- log/ops/audit/event/ผลคืน ที่มีค่าลับหรือ `error.message` ดิบของผู้ให้บริการ · console.log ค่าลับ
- `any` · `vercel.json` cron ใหม่ · ใช้ค่า `CHAT_CREDENTIALS_KEY`/`POS_CREDENTIALS_KEY` เป็นกุญแจสำรอง

## 8. ข้อที่ผู้คุมตัดสินเอง (CC ไม่ได้ระบุ — ข้อสอบยึดตามนี้)
1. service รับ `(ctx, actor, input)` คืน Refusal แบบ POS integration-creds · actor เชื่อผู้เรียก
2. MANAGER ไม่ได้ `settings.integrations.manage` โดยปริยาย (ภาพ: "เจ้าของร้านเท่านั้น") แต่ list ได้ · ผู้ได้รับคีย์ที่จำกัดหน่วยแตะได้เฉพาะแถวในหน่วยตน
3. ERROR ยังคืน handle (ให้ฟื้นได้) · DRAFT/DISABLED ไม่คืน · ไม่ส่ง unitId = นับเฉพาะแถวทุกหน่วย · แถวระบุหน่วยชนะ
4. disable = ลบค่าลับทิ้ง (ไม่มีลบแถว) · save ไม่เปลี่ยน status
5. FAKE ต้อง `APP_ENV !== "production"` ด้วย (กันเปิดบน prod แม้ตั้ง env ผิด)
6. ชนิดที่ 9 = `EDC` (ภาพจอง 10) · รายการเดินบัญชีธนาคาร (ภาพหอ 11) = ไม่อยู่ในใบนี้
7. PROMPTPAY รอบนี้อ่าน `PaymentProfile` อย่างเดียว (ค่าตั้ง `payments.receiver` มากับ R0.3/R0.6)
10. **ด่านให้สิทธิ์ต่อ** (ORACLE-EDIT R0.5-A-5 · ผู้คุม 27 ต.ค.): `settings.integrations.manage` = คีย์ owner-only แบบ `CRM_OWNER_ONLY_KEYS` — ผู้ที่ไม่ใช่ OWNER (รวม MANAGER ที่ถือคีย์เอง) ให้คีย์นี้แก่คนอื่นผ่าน `updateStaffAccess`/`grantStaffAccess` ไม่ได้ · OWNER ให้ได้ · builder เพิ่มคีย์เข้าชุด owner-only ใน `src/lib/core/permissions.ts` + ด่านใน `src/lib/staff/service.ts` (ไฟล์เพิ่มในขอบเขตใบ)

## 9. มติหลังผู้ตรวจ 27 ต.ค. (ORACLE-EDIT R0.5-R1..R12 · ข้อสอบหมวด R · ทับข้อที่ขัดกันข้างบน)
1. **R-1** `saveIntegration` รับ `create: true` (ไม่มี id) = สร้างอย่างเดียว · label ชนแถวเดิม (kind+provider) ⇒ `{ ok:false, code:"VALIDATION", detail:"DUPLICATE_LABEL", message }` แถวเดิมไม่เปลี่ยน · ไม่ส่ง `create` = พฤติกรรม upsert ตาม §3.1 เดิม
2. **R-2** `updateStaffAccess`/`grantStaffAccess`: ผู้ที่ไม่ใช่ OWNER **ขยาย `unitAccess`** ของคนที่ถือ `settings.integrations.manage` ไม่ได้ (แม้ตัวเองเป็น `*` + `settings.staff.write`) · OWNER ได้ · คนไม่ถือคีย์ = กติกาเดิม
3. **R-3** ลำดับเลือกของ `getIntegration`: แถวระบุหน่วย > แถวทุกหน่วย · แล้ว CONNECTED ก่อน ERROR · แล้ว updatedAt ล่าสุด
4. **R-4** save ค่าลับใหม่บนแถว `DISABLED` ⇒ `DRAFT` · `consecutiveFailures 0` · `lastTestOk/lastError/lastTestAt = null` (ทับ "save ไม่เปลี่ยน status" สำหรับกรณีนี้) · DRAFT ล้มไม่เป็น ERROR จนครบ 5
5. **R-5** `callIntegration` เรียก `fn(adapter, { signal })` · หมดเวลา ⇒ `signal` ถูก abort · adapter ของ FAKE รับ/เคารพ signal
6. **R-6** `integration.failed` ออกเฉพาะแถวที่เคย CONNECTED (แถว DRAFT ล้มครบ 5 ⇒ ERROR แต่ไม่มี event)
7. **R-7** handle ที่ไม่ได้มาจาก `getIntegration` (สำเนา `{...h}` หรือประกอบเอง) ⇒ `NOT_READY` · ไม่เรียก fn · ไม่แตะแถว · ไม่เขียน call log
8. **R-8** กล่องผูก AAD: `sealIntegrationSecret(obj, aad?)` / `openIntegrationSecret(box, aad?)` — `setAAD(utf8(aad))` เมื่อส่ง · service ใช้ `aad = \`${tenantId}:${integrationId}\`` เสมอ (ข้อสอบเปิดเองด้วยสูตรนี้) · ย้ายกล่องไปแถวอื่น ⇒ เปิดไม่ได้ (get null · masked "••••")
9. **R-9** ค่าลับหลายบรรทัด (PEM · `\n`) บันทึกได้ เปิดคืนตรงทุกตัวอักษร (ห้าม trim ภายใน · ห้ามปฏิเสธ `\n`/`\r`)
10. **R-10** FAKE เพิ่ม `mode: "SLOW"` = รอ 1500 ms แล้วผ่าน (เคารพ signal) · test ที่ผ่านด้วยคีย์ที่ไม่ใช่คีย์ปัจจุบันของแถว (คีย์ถูกเปลี่ยนระหว่าง test) ⇒ ไม่ตั้ง CONNECTED / ไม่ออก event (เทียบ secretBox/เวอร์ชันก่อนเขียนผล)
11. **R-11** `purgeIntegrationCallLogs(now, opts?: { deadline?: number /* ms epoch */ })` ลบเป็นก้อน ≤ 1000 · ตรวจ deadline ก่อนแต่ละก้อน · เกินเวลา = หยุด คืน `{ deleted }` · รันซ้ำลบต่อ · minute-job ส่ง `ctrl.deadline`
12. **R-12** NavDrawer เพิ่มเมนู "ศูนย์เชื่อมต่อ" → `/app/settings/integrations` · หน้ามีการ์ด "รายการเดินบัญชีธนาคาร" เป็นลิงก์ไปบัญชี (`/app/sys/<id>/account/…` · ไม่ใช่ "เร็ว ๆ นี้" · ไม่อยู่ใน catalog 9 ชนิด) · ข้อความไม่มีกุญแจ (หน้า + ข้อความปฏิเสธ) ไม่มีชื่อ env `INTEGRATIONS_CREDENTIALS_KEY` (ทับ §8 ข้อ 6 เรื่องการ์ดบัญชี)

