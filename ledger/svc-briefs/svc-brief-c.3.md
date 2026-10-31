# ใบสั่ง C.3 — สุขภาพตัวต่อ (เตือนเจ้าของเมื่อ ERROR/โควตาเหลือ ≤ ค่าตั้ง #83 · หน้าแสดงผลเรียกล่าสุด + กราฟเล็ก · ลบ call log 30 วันทำงานจริง · เมื่อล่มตั้งได้ต่อหน่วย) · ตรวจ: **เบา (รอบเดียว)** — แต่ X1 ข้ามร้าน · X3/X4/X5 เตือนครั้งเดียว · X10 ไม่มีค่าลับ **ห้ามตัด**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` C.3 (ขึ้นกับ R0.5 · Sonnet · 1 วัน · ภาพ "จอง 10/หอ 11 สถานะ") · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §5.3 ("ทุกตัวต่อมี: สถานะ · ผลเรียกครั้งล่าสุด · โควตา/ค่าใช้ · พฤติกรรมเมื่อล่ม (ตั้งได้) · บันทึกการเรียกทุกครั้ง") · `ledger/DESIGN-BOOKING-QUEUE.md` §4.6 · ภาคผนวก ก หอ **#83** ("เตือนเหลือ 10%" · ชั้น ก = กิจการ · แก้ได้เฉพาะเจ้าของกิจการ)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §2 (K5 K6 · `TenantIntegration.quota Json?` มีแล้วยังไม่มีผู้ใช้ · `onFailure`) §1.3 (ค่าตั้งจากทะเบียน) §7 (`integration.failed` · ไม่มี event ใหม่) · ใบก่อน (โค้ดชนะเอกสาร): `svc-brief-r0.5.md` §3.5 + §9 R-6 (`integration.failed` ออกเฉพาะ CONNECTED → ERROR · ครั้งเดียวต่อการตก) R-11 (purge เป็นก้อน + deadline) · `/root/svc-runs/fix/r0.5.md` · `svc-brief-r0.6.md` (slip-verify ใช้ `handle.onFailure` — `payments.slip.onVerifierDown` = RETIRED)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-c.3.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `SC-*` (ไม่มีร้าน svcqc) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-c.3.mts [--no-regression]` (ห้ามครอบ `timeout` · ห้าม kill กลางคัน — ล้างใน `finally`) · ข้อสอบตั้ง `INTEGRATIONS_FAKE=1` + กุญแจสุ่มในโพรเซสตัวเอง · สร้างร้านทดสอบเอง (`qc-svc-c3-*`) — **ไม่เขียนค่าตั้งของ svcqc** · บล็อกคำขอออกนอกเครื่อง
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-integration-health-scene.mts»** · temp ขึ้นต้น `svc-c3-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบตั้งให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC C.3` (`SQC_C3` · `SQC_INTEGRATION_HEALTH_SCENE` · `SQC_VISUAL_SPECS["c.3"]`)
> **ไม่มี migration** — ใช้ `TenantIntegration.quota` (Json? มีแล้วจาก R0.1) เก็บสถานะโควตา + `OpsAlertState` (source unique มีแล้ว) กันเตือนซ้ำของ ERROR · ไม่มี event ใหม่

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/` ตอนรับใบ)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/core/integrations/health.ts» | ใหม่ (server) | §3 ทั้งหมด — อ่าน/เขียน `TenantIntegration.quota` · อ่าน `IntegrationCallLog` · เขียน `AppNotification` + `OpsAlertState` · ค่าตั้งผ่าน `@/lib/core/settings` (facade) · ห้าม import POS/แชท/โมดูลโดเมน |
| `src/lib/core/integrations/index.ts` | แก้ (เพิ่มอย่างเดียว) | ส่งออกชื่อใน §3 + ชนิด §3.1 |
| `src/lib/core/integrations/types.ts` | แก้ (เพิ่ม) | `SlipVerifyAdapter.quota()` คืน `{ remaining?; limit?; resetsAt? }` (เพิ่ม `limit?`) · ชนิด §3.1 |
| `src/lib/core/integrations/service.ts` | แก้ (**เพิ่มอย่างเดียว** · ลบ 0 บรรทัด) | ส่งออกตัวช่วยภายในที่ health.ts ต้องใช้ (เช่น `integrationHandleForRow(row)` = `buildAdapter`+`makeHandle` ของแถวที่ระบุ) — **ไม่ส่งออกจาก facade** · ห้ามเปลี่ยนพฤติกรรมเดิม (R0.5 ทั้งชุดต้องเขียว) |
| `src/lib/core/integrations/providers/fake.ts` | แก้ (เพิ่ม) | ฟิลด์สาธารณะ `quotaRemaining` · `quotaLimit` (ไม่บังคับ · ป้ายไทย) · `quota()` คืน `{ remaining: <quotaRemaining> ?? 100, limit?: <quotaLimit> }` (ไม่ตั้งทั้งคู่ = `{ remaining: 100 }` เท่าเดิม) |
| «src/lib/core/settings/defs/integrations.ts» | ใหม่ (pure) | ค่าตั้ง #83 (§2.1) |
| `src/lib/core/settings/types.ts` | แก้ 1 บรรทัด | `SettingDomain` เพิ่ม `"integrations"` |
| `src/lib/core/settings/index.ts` | แก้ 1 บรรทัด | `import "./defs/integrations";` |
| «src/app/app/settings/integrations/IntegrationHealthPanel.tsx» | ใหม่ `'use client'` (default export) | §4 |
| `src/app/app/settings/integrations/page.tsx` · `IntegrationsHub.tsx` · `actions.ts` | แก้ | §5 |
| `src/lib/outbox-consumers.ts` | แก้ 1 บรรทัด (+คอมเมนต์) | `"integration.failed": withAutomation(async (evt) => (await import("@/lib/core/integrations")).onIntegrationFailed(evt))` · `integration.connected` คง no-op |
| `src/lib/platform/minute-jobs.ts` | แก้ (บล็อกเดียว `// SVC C.3`) | งาน `integrations.health` ทุก 60 นาที cadence `"minute"` · lazy import facade → `runIntegrationHealthJob(now, { deadline: ctrl.deadline, signal: ctrl.signal })` · งาน `integrations.calllog.purge` เดิมห้ามแตะ |
| «scripts/svc-qc-integration-health-scene.mts» | ใหม่ (builder) | ฉาก §7 |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` **ถ้า fitness แดงจริง** | คอมเมนต์ `// SVC C.3` |

**ห้ามแตะ**: `prisma/**` · `src/lib/core/**` นอกรายการข้างบน (โดยเฉพาะ `secret-box.ts` `registry.ts` `settings/service.ts` `settings/registry.ts` `settings/defs/payments.ts` `ops.ts`) · `src/lib/payment/**` (slip-verify ใช้ `handle.onFailure` อยู่แล้ว) · `src/lib/modules/**` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` (ไม่มี event ใหม่) · `any` · `getDay()/getDate()/getHours()` ดิบ (ใช้ `bkkYmd`/`bkkParts` ของ `src/lib/core/quiet-hours.ts`)

## 2. มติของใบนี้ (ผู้เขียนข้อสอบเลือก · ผู้คุมเคาะได้ใน §10 · เปลี่ยน = ORACLE-EDIT)

### 2.1 ค่าตั้ง #83 (เครื่องยนต์ค่าตั้ง · หน้าตั้งค่าจากทะเบียน)
`integrations.quota.alertPercent` · domain `integrations` · group `alerts` (ป้ายกลุ่ม "แจ้งเตือนตัวเชื่อม") · type `percent` · labelTh "เตือนเจ้าของเมื่อโควตาของตัวเชื่อมเหลือไม่เกิน (%)" · schema `z.number().int().min(1).max(99)` · `defaults._fallback = 10` · chain `["TENANT"]` (ชั้น ก) · `editPermission: "settings.integrations.manage"` · `ownerOnly: true` · ไม่มี `onFailure`/"เมื่อล่ม" ในค่าตั้ง (มีแล้วที่ `TenantIntegration.onFailure` — ห้ามทำซ้ำ)
- อ่านค่า: `resolveSetting({ tenantId }, KEY, { unitId })` — `unitId` = หน่วยแรกของแถว (`unitIds[0]`) หรือ BusinessUnit แรกของร้าน (เรียง createdAt) · ร้านไม่มีหน่วย/อ่านไม่ได้ = 10

### 2.2 "เหตุ" (incident) และการเตือนครั้งเดียว
| เหตุ | เริ่มเมื่อ | จบ (เปิดรับเหตุใหม่) | กันซ้ำ |
|---|---|---|---|
| **ERROR** | event `integration.failed` (R0.5 ออกครั้งเดียวต่อการตก CONNECTED → ERROR) | แถวกลับ CONNECTED (การตกครั้งต่อไป = event ใหม่) | แถว `OpsAlertState` source **`integration-alert:failed:<outboxEventId>`** สร้างใน tx เดียวกับ `AppNotification` · ชน unique (P2002) = มีคนเตือนไปแล้ว ⇒ จบเงียบ |
| **QUOTA** | งานรายชั่วโมงอ่าน `quota()` แล้ว `quotaIsLow` = true และ `quota.lowAlertedAt` ว่าง | อ่านได้ครั้งถัดไปแล้ว `quotaIsLow` = false ⇒ `lowAlertedAt = null` | ใต้ล็อกแถว (`SELECT … FOR UPDATE`) ตัดสิน + เขียน `quota` + `AppNotification` ใน tx เดียว |

- ผู้รับ = ทุก `Membership` ของร้านที่ `role = OWNER` และ `acceptedAt` ไม่ว่าง · **1 แถว `AppNotification` ต่อเจ้าของ (`recipientUserId`)** · ไม่มีแถวทั้งร้าน (`recipientUserId = null`) · MANAGER/STAFF (แม้ถือ `settings.integrations.manage`) ไม่ได้รับ
- ERROR: ตอนรับ event แถวต้องเป็นของ `evt.tenantId` และ **ยัง ERROR อยู่** (ฟื้นแล้ว/ถอดแล้ว/ไม่พบ/payload ผิด ⇒ ไม่เตือน ไม่ throw) · DRAFT ล้มครบ 5 (ไม่มี event ตาม R-6) ⇒ ไม่เตือน
- ข้อความ (ไทย · ไม่มีค่าลับ · ไม่มี `error.message` ของผู้ให้บริการ · ไม่มีชื่อ env · ไม่มีรหัสอังกฤษ):
  - ERROR: title มี `«<label>»` + คำ "ขัดข้อง" · body บอกว่าระหว่างนี้ระบบทำอะไร: `MANUAL` ⇒ มีคำ "ตรวจมือ" (เช่น "ส่งเข้าคิวตรวจมือ") · `REJECT` ⇒ มีคำ "ปฏิเสธ" · ชี้ไป "ตั้งค่า › ศูนย์เชื่อมต่อ"
  - QUOTA: title มี `«<label>»` + คำ "โควตา" · body มีเลขคงเหลือ (+ "จาก <limit>" เมื่อรู้) และเกณฑ์ `%` ที่ใช้
- `quotaIsLow(q, percent)` (pure): `remaining` ไม่ใช่ตัวเลข ⇒ false · `remaining ≤ 0` ⇒ true · `limit > 0` ⇒ `remaining * 100 ≤ limit * percent` (ขอบเท่ากับเกณฑ์ = ต่ำ) · ไม่มี limit และ remaining > 0 ⇒ false

### 2.3 รูป `TenantIntegration.quota` (Json · ผู้เขียนเดียว = health.ts)
`{ remaining: number|null, limit: number|null, resetsAt: string|null, checkedAt: string /* ISO = now ของรอบ */, lowAlertedAt: string|null }` — ข้อสอบอ่าน/ตั้งค่าตามรูปนี้ตรงตัว · อ่านล้ม ⇒ คงค่า remaining/limit/resetsAt เดิม (แถวใหม่ = null) แต่ **ตั้ง `checkedAt` เสมอ** (กันอดอยาก)

### 2.4 งานรายชั่วโมง (minute-jobs lesson D.17/D.18: กรองใน SQL · หมุนเวียน · หยุดตามงบ · ซ้อนกันได้)
- เลือกแถว: `status = 'CONNECTED'` · `kind ∈ QUOTA_KINDS` (= `["SLIP_VERIFY"]` ชนิดที่ adapter มี `quota()` — **กรองใน SQL** ไม่ใช่เลือกมาแล้วข้าม) · ถึงรอบ = `quota.checkedAt` ว่าง หรือ `≤ now − 60 นาที` · เรียง `checkedAt` ว่างก่อน → เก่าสุด → id · `LIMIT maxRows` (ค่าเริ่ม 200) · `opts.tenantId` = จำกัดร้าน (ข้อสอบ) · DRAFT/ERROR/DISABLED ไม่ถูกเรียก
- ต่อแถว: ตรวจ `deadline`/`signal` ก่อนเริ่ม (เลย = หยุด คืนผลที่ทำได้) → handle ของแถว (ไม่มีกุญแจ/กล่องเปิดไม่ได้ ⇒ ตั้ง `checkedAt` แล้วข้าม) → `callIntegration(h, "quota", (a, ctl) => a.quota(ctl))` (call log/ตัวนับล้มเป็นของ R0.5) → tx ล็อกแถว: แถวยัง CONNECTED → เขียน `quota` → เตือนตาม §2.2
- คืน `{ checked: number /* แถวที่เรียก quota() */, alerted: number /* แถวที่เกิดเหตุ QUOTA ใหม่ในรอบนี้ */ }` · ไม่ throw
- รันซ้อน N โพรเซสพร้อมกัน (route + crontab) ⇒ เหตุละ 1 ชุดการเตือน (เรียกผู้ให้บริการซ้ำได้ — ไม่เป็นไร)

### 2.5 ลบ call log 30 วัน (มีแล้วจาก R0.5 — ใบนี้ **ยืนยันว่าทำงานจริง** ไม่ต้องเขียนใหม่)
`purgeIntegrationCallLogs(now, { deadline?, signal? })` + งาน `integrations.calllog.purge` (รายวัน) ต้องผ่านกลุ่ม J: ลบเฉพาะ `at < now − 30 วัน` (ขอบ = เก็บ) · แถวอายุน้อยของทุกร้านไม่ถูกแตะ · ค้าง 2,345 แถว = หมดในรอบเดียว · deadline เลย/signal abort = 0 · รันพร้อมกัน 6 ทาง = ลบรวมพอดี ไม่ throw · รันซ้ำ = 0 — ถ้า builder แก้ purge ต้องยังเป็นก้อน ≤ 1000 และเคารพงบ (ข้อสอบ R0.5 J/R-11 ต้องเขียว)

### 2.6 เมื่อล่มตั้งได้ต่อหน่วย = `TenantIntegration.onFailure` ต่อแถว + `unitIds` (มีแล้ว)
ร้านที่อยากให้สาขา A "ปฏิเสธ" สาขา B "ตรวจมือ" = 2 แถวระบุหน่วย (แถวระบุหน่วยชนะ · R-3) · ใบนี้**ไม่เพิ่ม**ที่เก็บใหม่ (ค่าตั้ง/คอลัมน์) — แค่แสดง `onFailure` + `unitIds` ในมุมมองสุขภาพ (§3.1) และในการเตือน (§2.2)

### 2.7 สิทธิ์ · ขอบเขต (เหมือน `listIntegrations`)
อ่านสุขภาพ: OWNER · ผู้ถือ `settings.integrations.manage` ตรงตัว · MANAGER (อ่าน) · STAFF ไม่มีคีย์ ⇒ `PERMISSION_DENIED` (ข้อความไทย) · ผู้จำกัดหน่วย (ไม่ใช่ OWNER และไม่มี `"*"`) เห็นแถว `unitIds=[]` หรือแตะหน่วยตน · id ของร้านอื่น / ไม่มี / รูปผิด / แถวที่มองไม่เห็น ⇒ **`NOT_FOUND` ผลเดียวกันทุกตัวอักษร** · ค่าตั้ง #83 แก้ได้เฉพาะ OWNER (`ownerOnly`)

## 3. สัญญาโค้ด — export จาก `@/lib/core/integrations` (ข้อสอบเรียกตามชื่อ/รูปนี้)

### 3.1 ชนิด (types.ts)
```ts
type IntegrationHealthCall = { op: string; ok: boolean; ms: number; code: CallCode | null; at: string /* ISO */ };
type IntegrationHealthDay  = { day: string /* "YYYY-MM-DD" ไทย */; ok: number; fail: number; avgMs: number | null /* Math.round(เฉลี่ย ms ทุกครั้งของวัน) · ไม่มี = null */ };
type IntegrationQuotaView  = { remaining: number | null; limit: number | null; percent: number | null /* limit>0 && remaining!=null ? Math.round(remaining*100/limit) : null */;
                               low: boolean /* quotaIsLow(quota, เกณฑ์ของร้าน) */; checkedAt: string | null; resetsAt: string | null };
type IntegrationHealthView = { id: string; kind: StoredIntegrationKind; provider: string; label: string; status: IntegrationStatus;
                               onFailure: IntegrationOnFailure; unitIds: string[]; quota: IntegrationQuotaView | null /* แถว quota ว่าง = null */;
                               recent: IntegrationHealthCall[]; daily: IntegrationHealthDay[] };
```
**คีย์ต้องตรงชุดนี้พอดี** (ข้อสอบเทียบชุดคีย์ — ไม่มี `fields`/`publicFields`/`secretNames`/`secretBox`/`lastError` ฯลฯ)
- `recent` = ≤ 20 แถวล่าสุดของ **(tenantId ของแถว, integrationId)** เรียงใหม่ → เก่า (`at` desc, `id` desc) — แถว log ที่ tenantId ไม่ตรง (ปลอม/ข้ามร้าน) ไม่นับ
- `daily` = 14 วันไทยพอดี เรียงเก่า → ใหม่ · วันสุดท้าย = `bkkYmd(now)` · นับจาก log ชุดเดียวกับ `recent` · วันที่ไม่มี = `{ ok:0, fail:0, avgMs:null }`

### 3.2 ฟังก์ชัน
```ts
INTEGRATION_QUOTA_ALERT_KEY = "integrations.quota.alertPercent"
INTEGRATION_HEALTH_RECENT = 20 · INTEGRATION_HEALTH_DAYS = 14 · INTEGRATION_QUOTA_CHECK_MINUTES = 60
quotaIsLow(q: { remaining?: number | null; limit?: number | null } | null | undefined, percent: number): boolean      // pure (§2.2)
getIntegrationHealth(ctx: IntegrationCtx, actor: IntegrationActor, input: { id: string; now?: Date })
  → Promise<{ ok: true; thresholdPercent: number; health: IntegrationHealthView } | Refusal>
listIntegrationHealth(ctx: IntegrationCtx, actor: IntegrationActor, opts?: { now?: Date })
  → Promise<{ ok: true; thresholdPercent: number; items: IntegrationHealthView[] } | Refusal>     // แถวเก็บที่มองเห็นทั้งหมด (ไม่มีชนิดเสมือน)
runIntegrationHealthJob(now: Date, opts?: { tenantId?: string; maxRows?: number; deadline?: number; signal?: AbortSignal })
  → Promise<{ checked: number; alerted: number }>                                                   // §2.4 · ไม่ throw
onIntegrationFailed(evt: { id: string; tenantId: string; type: string; payload: unknown }) → Promise<void>  // §2.2 · ข้อมูลผิดถาวร = จบเงียบ (ไม่ throw — ไม่งั้นขวางคิว)
```
- ทุกตัวไม่ throw · คำปฏิเสธเป็นข้อมูล `{ ok:false, code, message(ไทย) }` · ctx/actor ขยะ ⇒ `NOT_FOUND`/`PERMISSION_DENIED` · `thresholdPercent` = ค่าตั้ง #83 ของร้าน

## 4. สัญญา DOM — «IntegrationHealthPanel.tsx» (`'use client'` บรรทัดแรก · default export · props `{ health: IntegrationHealthView; thresholdPercent: number }` · `import type` เท่านั้นจาก `@/lib/core/integrations/types` · ห้าม import facade/service/secret-box/`@/lib/core/db`/`@prisma/client`/`next/*` · `renderToStaticMarkup` ได้)
- รากมี `data-testid="integration-health"` + `data-status="<status>"`
- โควตา (เมื่อ `health.quota` ไม่ null): ธาตุ `data-testid="integration-health-quota"` + `data-low="true|false"` · ข้อความ "เหลือ <percent>%" (percent มี) หรือ "เหลือ <remaining>" (ไม่มี limit) · quota null = ไม่มีธาตุนี้
- กราฟเล็ก: `<svg data-testid="integration-health-chart">` ภายในมีธาตุ `data-testid="integration-health-bar"` **14 ตัว** (ต่อ `daily`) แต่ละตัวมี `data-day` `data-ok` `data-fail` · ไม่ใช้ไลบรารีกราฟ
- เรียกล่าสุด: แถวละ `data-testid="integration-health-call"` + `data-ok="true|false"` (ตาม `recent`) · ป้ายไทย: สำเร็จ = "สำเร็จ" · `TIMEOUT` = "หมดเวลา" · `PROVIDER_ERROR` = "ผู้ให้บริการขัดข้อง" · `QUOTA` = "โควตาหมด" · `NOT_READY` = "ยังไม่พร้อม" — **ไม่มีรหัสอังกฤษในข้อความที่เห็น** · `recent` ว่าง ⇒ ข้อความ "ยังไม่มีการเรียก"

## 5. หน้า `/app/settings/integrations` (ภาพ จอง 10 = หอ 11 · ส่วน "สถานะ/ผลเรียกล่าสุด")
- `page.tsx` (RSC) เรียก `listIntegrationHealth` ผ่าน session (actor แบบเดียวกับ `listIntegrations`) ส่ง `items`+`thresholdPercent` ให้ hub · แผงข้างของแถวเก็บแสดง `<IntegrationHealthPanel>` · การ์ดแสดงจุดสถานะ + "เหลือ N%" เมื่อโควตาต่ำ
- ค่าตั้ง #83 แสดงด้วย `SettingsForm` + `loadSettingsForm(actor, ctx, { domains: ["integrations"], scope: "TENANT", scopeId: tenantId, unitId: <หน่วยแรกที่เข้าถึงได้> })` (กติกาเหล็กข้อ 16 — ห้ามวาดฟอร์มเอง) · ไม่มีหน่วย = ไม่แสดงฟอร์ม · ผู้ที่ไม่ใช่ OWNER เห็นอ่านอย่างเดียวตามเครื่องยนต์
- ไฟล์ `'use client'` ในโฟลเดอร์ห้าม import `@/lib/core/integrations` (นอกจาก `/types`) · ไม่มีคำว่า `secretBox` ในโฟลเดอร์ (R0.5 P-*)

## 6. ไม่ใช่ของใบนี้ / หนี้ส่งต่อ
- อีเมล/LINE ถึงเจ้าของ (ใบนี้ = แจ้งในแอป `AppNotification` เท่านั้น) · เตือน DRAFT ที่ตกเป็น ERROR · หมุนเวียน `OpsAlertState` เก่า (แถวละเหตุ · เล็ก) · ชนิดอื่นที่มีโควตา (SMS ใบ S.1)

## 7. ฉาก svcqc «scripts/svc-qc-integration-health-scene.mts» (builder · ค่าจาก `SQC_INTEGRATION_HEALTH_SCENE` เท่านั้น · สำหรับภาพ `SQC_VISUAL_SPECS["c.3"]` ด้วยผู้ใช้ `other-owner`)
- ร้าน `SQC_OTHER.tenant` (ร้าน B ของ svcqc — **ไม่แตะร้าน A** · ไม่เขียน SettingValue/OutboxEvent/AppNotification) · 1 แถว `TenantIntegration`: kind `CALENDAR` (ไม่มี `quota()` ⇒ งานรายชั่วโมงไม่เรียก · ไม่มีใครใช้ ⇒ ไม่กวนข้อสอบอื่น) · provider `FAKE` · label = `scene.label` · status `CONNECTED` · `unitIds []` · `onFailure MANUAL` · ไม่มีค่าลับ (`secretBox null` · `secretNames []`) · `quota` = §2.3 จาก `scene.quota` (`checkedAt` = เวลาที่รัน · `lowAlertedAt` = เวลาที่รัน) · createdById/updatedById = `SQC_OTHER.owner.userId`
- call log ตาม `scene.days` (`[วันย้อนหลังไทย, ok, fail]` · เวลา 10:00+i นาที ไทยของวันนั้น · ms = 120+i*7 · fail ใช้ code `PROVIDER_ERROR`/`TIMEOUT` สลับ)
- รันซ้ำ = `SCENE_SUMMARY {"created":0,"updated":0,"removed":0}` (มีแถว+log ครบ = ไม่สร้างซ้ำ) · `--clear` ลบเฉพาะแถวฉาก + log ของแถวนั้น · พิมพ์ `SCENE_SUMMARY <json>` บรรทัดสุดท้าย

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-c.3.mts»
S โครงสร้าง/ทะเบียน/ค่าตั้ง/งาน/สุขอนามัย (+ S-1/S-2/S-13 git ท้ายไฟล์) · PC ตัวควบคุม (เขียวก่อนมีงาน: ฉาก · R0.5 save/test/ERROR+event · ตัวสแกนรั่ว · บล็อกเน็ต) · E เตือน ERROR (ครั้งเดียว · ซ้ำ/พร้อมกัน 10 · ฟื้นแล้วตกใหม่ · replay เก่า · ฟื้นก่อนรับ · DRAFT · ถอด · event ปลอมข้ามร้าน · payload ขยะ · ผู้รับ · ข้อความ) · QA เตือนโควตา (ขอบ · ถี่ไม่เกิน 60 นาที · ครั้งเดียวต่อเหตุ · ฟื้น/ตกใหม่ · ค่าตั้ง #83 ของร้าน · พร้อมกัน 8 ทาง · ไม่เรียก DRAFT/ERROR/DISABLED · จำกัดร้าน · งบ · หมุนเวียนไม่อดอยาก · ชนิดไม่มีโควตาไม่บัง) · H มุมมองสุขภาพ (ชุดคีย์ · recent/daily · ไม่นับ log ปลอม · X1 NOT_FOUND เดียวกัน · สิทธิ์ · ไม่มีค่าลับ) · P เมื่อล่มต่อหน่วย · J ลบ call log (positive control ของ R0.5) · U DOM · M รั่ว/เน็ต · Z ล้าง · SC ฉาก svcqc · G regression (r0.5 · r0.6 · smoke)

## 9. X ที่เกี่ยว
X1 (H-6/H-7 · E-9 · QA-12) · X3 (E-4 · QA-10 · J-5) · X4 (E-3 · E-6) · X5 (QA-10 · QA-14) · X8 (ข้อความไม่มี PII — ไม่มีข้อมูลลูกค้าเลย) · X10 (H-8 · M-*) · ไม่เกี่ยว: X6 X7 X9 (ไม่มีนำเข้า/ลิงก์สาธารณะ/การกระทำอันตรายใหม่)

## 10. คำขอให้ผู้คุมเคาะ (ค่าปลอดภัยใช้ไปก่อน · ข้อสอบเขียนตามค่าปลอดภัย)
- **K1 แตะชิ้นกลาง** (CC กติกาข้อ 4): ใบนี้เป็นเจ้าของ "สุขภาพ" ของศูนย์ฯ ตามแถวแผน ⇒ ค่าปลอดภัย = แก้ชิ้นกลางแบบ**เพิ่มอย่างเดียว**ตาม §1 (health.ts ใหม่ · service.ts ส่งออกตัวช่วยภายใน · types/fake เพิ่มฟิลด์ · settings `SettingDomain` +1 · index +1) — ตรวจด้วย S-13 (จำนวนบรรทัดที่ลบ) + G-1 R0.5 ทั้งชุด · ทางเลือก: ออกใบแก้ชิ้นกลางแยก (ตรวจเข้ม)
- **K2 ค่าตั้ง #83 = domain ใหม่ `integrations`** ชั้น TENANT อย่างเดียว · ทางเลือก: ใส่ใน `payments` (ไม่ต้องแก้ `SettingDomain` แต่ชื่อผิดที่ — SMS ก็มีโควตา)
- **K3 ช่องทางเตือน = `AppNotification` รายเจ้าของ** (ไม่ใช่ `logOps` — นั่นเตือนทีม SHARK · ไม่ใช่ประกาศทั้งร้าน — MANAGER ไม่ต้องรู้เรื่องคีย์) · ทางเลือก: + อีเมลเจ้าของ (ใบเลื่อน)
- **K4 เหตุ ERROR ผูก event `integration.failed`** (R0.5 รับประกันครั้งเดียวต่อการตกใต้ล็อกแถวแล้ว) + กันซ้ำด้วย `OpsAlertState` ต่อ event id · ไม่เตือนเมื่อฟื้นก่อน consumer ได้รับ · ไม่เตือน DRAFT
- **K5 โควตาเป็น %** ต้องรู้ `limit` (adapter คืนได้ · เพิ่ม `limit?` ใน interface) · ไม่รู้ limit = เตือนเฉพาะ `remaining ≤ 0` · ทางเลือก: ให้เจ้าของกรอก "แพ็กเกจที่ซื้อ" เป็นฟิลด์สาธารณะของแถว
- **K6 งานรายชั่วโมงเรียกเฉพาะ CONNECTED** (ERROR ไม่ถูก probe — ฟื้นด้วยการใช้งานจริง/ปุ่มทดสอบตาม R0.5) · ถี่สุด 60 นาที/แถว
- **K7 ลบ call log** = ของ R0.5 ใช้ได้จริงแล้ว ⇒ ใบนี้ล็อกด้วยข้อสอบกลุ่ม J (เขียวตั้งแต่ต้น) ไม่เขียนใหม่ · "ร้านอื่นไม่เห็น" ในแถวแผน = H (มุมมอง) ไม่ใช่การลบรายร้าน — งานลบเป็นงานข้ามร้านตามอายุ
- **K8 ฉาก svcqc อยู่ร้าน B ชนิด CALENDAR** (ไม่กวน slip-verify/R0.5/R0.6 ของร้าน A) — ภาพถ่ายด้วย `other-owner`

## มติผู้คุม (31 ต.ค. 2569)
- K1 ✅ แตะชิ้นกลาง R0.5 แบบเพิ่มอย่างเดียว (ลบบรรทัดเดิม 0 · S-13) — ⚠️ ชิ้นกลางตาม CC กติกาข้อ 4 ⇒ **ยกระดับรีวิวส่วนชิ้นกลางเป็นเข้ม** (ผู้ตรวจอ่านโค้ด + probe) · r0.5 + r0.6 ทั้งชุดต้องเขียว
- K2 ✅ `integrations.quota.alertPercent` domain `integrations` · TENANT · ค่าเริ่ม 10 · ownerOnly
- K3 ✅ AppNotification ต่อเจ้าของที่ acceptedAt ไม่ว่าง · ไม่ logOps · ไม่ประกาศทั้งร้าน
- K4 ✅ เหตุ ERROR ผูก event integration.failed + OpsAlertState กันซ้ำ · ฟื้นก่อนรับ = ไม่เตือน · DRAFT = ไม่เตือน
- K5 ✅ ไม่รู้ limit ⇒ เตือนเมื่อเหลือ ≤ 0 · เท่ากับเกณฑ์ = ต่ำ
- K6 ✅ งานรายชั่วโมง CONNECTED · ≤ 1 ครั้ง/60 นาที/แถว · เรียงตรวจนานสุดก่อน · ตั้ง checkedAt แม้ล้ม (กันอดอยาก) · เก็บใน TenantIntegration.quota (ไม่มี migration)
- K7 ✅ ใช้งานลบของ R0.5 · K8 ✅ ฉากร้าน B ชนิด CALENDAR
- เรื่อง AppNotification ค้างบน svcqc เมื่อมีคน drain outbox ก่อน cleanup ของ r0.5/r0.6 ⇒ ผู้คุมดูตอนด่านรวม
