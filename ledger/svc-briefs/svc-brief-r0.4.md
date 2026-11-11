# ใบสั่ง R0.4 — หน้าค่าตั้งสร้างจากทะเบียน (เบา · ตรวจรอบเดียว)

> อ้าง: MASTER-PLAN แถว R0.4 · CC §1.8 + **ภาคต่อ 28 ต.ค.** (ส่งเฉพาะคีย์ที่แตะ · สวิตช์ "ตามชั้นบน" = `resetSetting`) · CC §1.3–1.5 (เครื่องยนต์ R0.3 — **ด่านสิทธิ์จริงอยู่ใน service ไม่ย้าย**) · ภาพ `ledger/design-booking/08-settings.png` · `ledger/design-dorm/17-settings-policies.png` · `ledger/design-dorm/10-settings-law.png` (โครง/ป้าย — ภาพเทียบแบบเต็มอยู่ B.11 · D.7 · D.13) · หนี้ส่งมา: `svc-brief-r0.3.md` §11 ท้าย · `svc-brief-r0.6.md` §8 · `ledger/wo-notes/svc-r0.8-carry.md`
> ข้อสอบ «scripts/qc-svc-r0.4.mts» ผูกสัญญาข้างล่างตรงตัว · ฉากภาพ `SQC_VISUAL_SPECS["r0.4"]` (มีแล้ว)
> กติกาเหล็ก #16: หน้าตั้งค่าทุกหน้าของ RUN = หน้าห่อ + `SettingsForm` — ห้ามวาดฟอร์มค่าตั้งมือ

## 1. ไฟล์
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/core/settings/form.ts» | ใหม่ (server · prisma) | `loadSettingsForm` · `legalOverrideSummaries` (§3 §6.1) — export ผ่าน `src/lib/core/settings/index.ts` |
| «src/components/settings/settings-shared.ts» | ใหม่ (pure) | ชนิดโมเดลฟอร์ม + `submissionFor` `parseFieldInput` `formatFieldValue` (§2 §4) · import ได้เฉพาะ `import type` จาก `@/lib/core/settings/types` |
| «src/components/settings/SettingsForm.tsx» | ใหม่ (`"use client"`) | ตัววาด (§5) · รับ server actions ทาง **props** (ห้าม import `@/lib/core/settings` ใด ๆ นอกจาก `import type` · ห้าม `@/lib/core/db`) |
| `src/lib/core/settings/actions.ts` | แก้ | สำเร็จ (`ok:true`) ⇒ เรียก `refresh()` จาก `next/cache` (docs `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`) · ยังรับ actor/tenant จาก `requireTenant` เท่านั้น |
| `src/lib/core/settings/service.ts` · `types.ts` · `registry.ts` | แก้ (ชิ้นกลาง · ใบ R0.x) | หนี้ §6 · ฟังก์ชันตัดสินสิทธิ์ใช้ร่วม (§3.3) · `enumLabelsTh` / `groupLabelsTh` (§3.4) |
| `src/lib/core/settings/defs/payments.ts` · `messaging.ts` · `rooms.ts` · `_fixture.ts` | แก้ (เพิ่มอย่างเดียว) | ป้ายไทยตัวเลือก enum + ป้ายกลุ่ม · หนี้ §6.3 §6.4 — **ห้ามเปลี่ยน key/ค่าเริ่ม/chain/schema เดิม** (ยกเว้น §6.4) |
| «src/app/app/u/[unitSlug]/booking/settings/page.tsx» | ใหม่ | หน้าห่อจองคิว (§7) + แท็บ "ตั้งค่า" ใน `booking/layout.tsx` |
| «src/app/app/u/[unitSlug]/dorm/settings/page.tsx» | ใหม่ | หน้าห่อหอ (§7) |
| `src/app/app/approvals/page.tsx` | แก้ | การ์ดสรุปข้อเสนอ `settings.legal_override` (§6.1) |

ห้าม: migration/`prisma/schema` · แตะ POS/HR · `any` · build/commit/install · แก้ข้อสอบ/`scripts/svc-qc-data.mts` · import `defs/_fixture` ใน src (R0.3 S-3)

## 2. ชนิดโมเดล (ใน settings-shared.ts · ทุกค่า JSON ล้วน — ไม่มี function/Date/zod · วันที่เป็น ISO string)
```ts
type SettingsFieldOption = { value: string; labelTh: string };
type SettingsField = {
  key: string; domain: string; group: string; type: SettingValueType; labelTh: string; helpTh: string | null;
  value: unknown;               // ค่าที่มีผล ณ (scope, scopeId) รวมการสืบชั้น · masked ⇒ null
  hasOwn: boolean;              // มีแถว SettingValue ที่ (key, scope, scopeId) นี้เอง
  source: "TENANT"|"UNIT"|…|"TEMPLATE"|"FALLBACK"; sourceLabelTh: string;   // เช่น "ตั้งที่สาขานี้" "มาจากชั้น ทั้งร้าน" "ค่าจากแม่แบบ"
  templateValue: unknown; differsFromTemplate: boolean;
  overrideCount: number;        // แถวชั้นที่ลึกกว่า scope นี้ (ในสาขาเดียวกัน) ของคีย์นี้ ⇒ ป้าย "ปรับรายคน N"
  editable: boolean; lockedReasonTh: string | null;   // !editable ⇒ ข้อความไทยไม่ว่าง
  masked: boolean;              // sensitivity PRIVACY และผู้ดูไม่ใช่ OWNER
  pendingLegalReview: boolean;  // key ∈ PENDING_LEGAL_REVIEW_KEYS (rooms) — ป้ายเท่านั้น
  options: SettingsFieldOption[] | null;  // type enum: ครบทุกค่าใน schema · ป้ายไทย
  nullable: boolean; min: number | null; max: number | null;   // จาก schema (ตัวเลข) — ใช้ตรวจฝั่ง client
  templateVars: string[] | null; requiresIntegration: string | null; effectiveDated: boolean;
  sensitivity: "MONEY"|"LEGAL"|"PRIVACY"|null; ownerOnly: boolean;
};
type SettingsFormModel = {
  unitId: string; unitName: string; scope: ScopeKind; scopeId: string; domains: string[];
  templates: { domain: string; key: string | null; labelTh: string | null }[];
  groups: { domain: string; key: string; labelTh: string; fields: SettingsField[] }[];   // ลำดับตามทะเบียน
  differsCount: number;         // จำนวน field ที่ differsFromTemplate
  history: { id: string; key: string; labelTh: string; beforeTh: string; afterTh: string; at: string; legalLevel: string; masked: boolean }[]; // ≤ 50 ล่าสุด ของคีย์ใน domains · สาขานี้ (+TENANT เมื่อผู้ดูไม่จำกัดสาขา)
};
```

## 3. `loadSettingsForm(actor: SettingsActor, ctx: SettingsCtx, q: { domains: string[]; groups?: string[]; unitId: string; scope?: ScopeKind; scopeId?: string }) → Promise<SettingsFormModel | null>`
1. `scope` ปริยาย `"UNIT"` (scopeId = unitId) · `TENANT` ⇒ scopeId = tenantId · ชั้นอื่น ⇒ scopeId ต้องเป็นรายการของสาขา `unitId` ในร้านนี้ (ใช้ `refsFor`)
2. คืน `null` เมื่อ: unit ไม่ใช่ของร้าน (X1) · ผู้ดูเข้า unit ไม่ได้ (`canAccessUnit`) · scopeId ไม่อยู่ใน unit/ร้าน · scope ไม่รองรับ — ไม่ throw
3. field = ทุก def ใน `domains` (และ `groups` ถ้าระบุ) ที่ **ไม่มี `hiddenUntil`** และ `chain` มี `scope` นี้ · ค่าอ่านด้วย `resolveSettings` (query ต่อชุด ไม่ใช่ต่อคีย์)
   **`editable` ต้องเท่ากับผลจริงของ `setSettings`**: ข้อสอบยิง `setSettings(actor, ctx, [{key, scope, scopeId, value: field.value}])` ทุก field — ได้ `PERMISSION` ⇔ `editable === false` ⇒ แยกฟังก์ชันตัดสินสิทธิ์ของ service (`permissionIssue` + ชั้น TENANT) ออกมาใช้ร่วม ห้ามเขียนตรรกะซ้ำ
4. ป้ายไทย: `DefineSettingsOptions.groupLabelsTh?: Record<group, string>` + `SettingDef.enumLabelsTh?: Record<value, string>` (ทุก def ชนิด enum ที่ไม่ซ่อนใน payments/messaging/rooms/qcfx ต้องมีครบทุกค่า · ป้าย ≠ ค่าดิบ และไม่ใช่รูป `^[A-Z0-9_]+$`) · กลุ่มไม่มีป้าย = บั๊ก (ข้อสอบตรวจว่ามีอักษรไทย และป้ายกลุ่มไม่ซ้ำกันภายใน domain)
5. `masked` field: `value`/`templateValue` = null (ค่าดิบห้ามอยู่ในโมเดล = ห้ามอยู่ใน RSC payload)

## 4. pure (settings-shared.ts)
- `submissionFor(model, edits: Record<string, unknown>, follow: ReadonlySet<string>) → { changes: SettingChangeInput[]; resets: { key; scope; scopeId }[] }`
  - `edits` = เฉพาะคีย์ที่ผู้ใช้แตะ · changes = คีย์ใน edits ที่ (มีใน model · editable · ไม่ masked · ไม่อยู่ใน follow · ค่า **ไม่เท่า** `field.value` แบบ deep) — scope/scopeId จาก model · ไม่มีคีย์อื่นเด็ดขาด
  - resets = คีย์ใน follow ที่ `hasOwn && editable` (ไม่มีแถวของตัวเอง = ไม่ส่ง)
- `parseFieldInput(field, raw: string | boolean) → { ok: true; value } | { ok: false; messageTh }` — money: บาท "1,250.50" ⇒ 125050 (ทศนิยม > 2 ตำแหน่ง/ติดลบ/ไม่ใช่ตัวเลข ⇒ ไทย) · percent: "%" ⇒ basis point ("7.5" ⇒ 750) · int/minutes/days: จำนวนเต็ม · min/max ของ field (ข้อความไทยมีตัวเลขขอบ · หน่วยเดียวกับที่ผู้ใช้กรอก) · ว่าง + nullable ⇒ null · ว่าง + ไม่ nullable ⇒ ไทย · time `HH:MM` · bool รับ boolean · enum ต้องอยู่ใน options · text ส่งตามเดิม
- `formatFieldValue(field, value) → string` — money 125050 ⇒ "฿1,250.50" · percent 750 ⇒ "7.5%" · minutes ⇒ "10 นาที" · days ⇒ "7 วัน" · bool ⇒ "เปิด"/"ปิด" · enum ⇒ labelTh ของตัวเลือก · null ⇒ "—" · table/template ⇒ ข้อความสรุปที่ไม่ขึ้นต้น `{` `[` · masked ⇒ "ซ่อนไว้"

## 5. SettingsForm.tsx
`export default function SettingsForm({ model, actions }: { model: SettingsFormModel; actions: { save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>; reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult> } })` — หน้าห่อส่ง `saveSettingsAction`/`resetSettingAction` (Next อนุญาตส่ง server action เป็น prop) · ต้อง render ได้ด้วย `react-dom/server` `renderToStaticMarkup` (ข้อสอบเรียก) ⇒ ห้าม `useRouter`/hook ของ next ตอน render (รีเฟรชผ่าน `refresh()` ใน action)
- ต่อ field หนึ่งกล่อง `data-setting-key="<key>"` + `data-kind="<type>"` (ไม่ซ้อนกล่องกัน · หนึ่งกล่องต่อคีย์) · ตัวรับค่าตามชนิด: bool = `role="switch"` หรือ checkbox · enum = `<select>` หรือ `role="radiogroup"` · int/money/percent/minutes/days = `inputMode` numeric/decimal หรือ `type="number"` · time = `type="time"` · template = `<textarea>` + ตัวอย่างข้อความ + ปุ่มตัวแปร · table = ตัวแก้แบบแถว/ช่อง (ห้าม textarea JSON ดิบ) · text = input/textarea
- ป้าย: "ต่างจากแม่แบบ" (เฉพาะ differsFromTemplate) · `sourceLabelTh` · "ปรับรายคน N" เมื่อ overrideCount > 0 · "⚠️ รอที่ปรึกษากฎหมายตรวจ" (เฉพาะ pendingLegalReview) · ปุ่ม "คืนค่า" + สวิตช์ "ตามชั้นบน" เฉพาะ `hasOwn && editable` · ล็อก ⇒ ตัวรับค่า `disabled` + แสดง lockedReasonTh
- หัวฟอร์ม: แม่แบบที่ใช้ + "ปรับจากแม่แบบ N ข้อ" (differsCount) · ตัวกรอง "ดูเฉพาะที่ปรับ" · ปุ่ม "ประวัติ" (model.history · masked ⇒ "ซ่อนไว้")
- บันทึก = `actions.save(submissionFor(...).changes)` แล้ว `actions.reset` ทีละรายการ · ผล `VALIDATION`/`PERMISSION`/`LEGAL_BLOCK` แสดง `messageTh` ใต้ช่องตาม key · `NEEDS_APPROVAL` ⇒ กล่องติ๊กยอมรับ + เหตุผล (≥ 10 ตัวอักษร) แล้วส่งซ้ำ `{ ackLegalWarn: true }` (+ `reason` ในแต่ละ change) · มี `approvalId` ⇒ "ส่งให้เจ้าของอนุมัติแล้ว"
- ทุก `<button>` ≥ 44px: class มี `min-h-11` | `min-h-[44px]` | `h-11` | `h-12` | `min-h-12` | `min-h-[48px]` · 390px ไม่ล้นแนวนอน · ข้อความที่มองเห็นเป็นไทยทั้งหมด (ค่า enum ดิบห้ามเป็น text node)

## 6. หนี้ที่ปิดในใบนี้
1. **สรุปข้อเสนอในหน้าอนุมัติ**: `legalOverrideSummaries(ctx, requestIds: string[], viewer?: SettingsActor) → Promise<Map<requestId, { requestId; unitId; unitName; titleTh; codes: string[]; lines: { key; labelTh; beforeTh; afterTh; reasonTh: string | null }[] }>>` — อ่านข้อเสนอ (AuditLog `settings.legal_override.proposed` ที่ผูก requestId) · เฉพาะร้าน ctx (ร้านอื่น/คำขอชนิดอื่น ⇒ ไม่อยู่ใน Map) · ค่าผ่าน `formatFieldValue` · PRIVACY ⇒ "ซ่อนไว้" เมื่อ viewer ไม่ใช่ OWNER · `beforeTh` = ค่าฐานในข้อเสนอ (ไม่มีแถว ⇒ "ตามชั้นบน") · approvals/page.tsx ใช้แทนป้ายกลาง
2. **ปิดค่า PRIVACY ในประวัติ**: `settingHistory(ctx, { …, actor })` — actor ไม่ใช่ OWNER ⇒ แถวของ def PRIVACY มี `before: null, after: null, masked: true` (`SettingChangeRow.masked?: boolean`) · OWNER/ไม่ส่ง actor = ค่าจริง · model.history ทำแบบเดียวกัน
3. **ซ่อน `payments.slip.onVerifierDown`**: คง def (R0.3 R-6 ตรวจค่าเริ่ม) แต่ตั้ง `hiddenUntil: "RETIRED"` (ขยาย union ใน types.ts) — ซ้ำกับ `TenantIntegration.onFailure` · ไม่อยู่ในโมเดลใด
4. **ขยาย `payments.receiver`**: schema = `{ paymentProfileId: string(1..64), labelTh?: ≤80 }` **หรือ** `{ promptpayId: เบอร์ 10 หลักขึ้นต้น 0 | เลขผู้เสียภาษี 13 หลัก (ใช้ `isValidPromptPayId` ผ่าน refine — ไฟล์ defs ต้อง pure: import ได้ถ้า `src/lib/payment/promptpay.ts` pure ไม่งั้นเขียน regex ตรง), displayName?: ≤120, bankAccount?: ≤32 }` · หรือ null · รูปอื่น/พร้อมเพย์ผิดรูป ⇒ `VALIDATION` · ตัวแก้ชนิด table ของคีย์นี้ = ช่องเบอร์พร้อมเพย์ + ชื่อบัญชี + เลขบัญชี
5. ป้าย "ต่างจากแม่แบบ" + คืนค่า · ป้ายรอที่ปรึกษากฎหมาย · โหมดกฎหมาย 3 แบบ (`rooms.legal.mode` options ครบ 3 ป้ายไทย · แก้ได้เฉพาะ OWNER — ผู้จัดการเห็นแบบล็อก lockedReasonTh มีคำว่า "เจ้าของ") · ค่าซ่อนไม่แสดง

## 7. หน้าห่อ (server component)
- `booking/settings`: `requireUnit(unitSlug)` · unit.type ≠ BOOKING ⇒ `notFound()` · `loadSettingsForm(actor, ctx, { domains: ["payments", "messaging", ...(listDefs("booking").length ? ["booking"] : [])], unitId })` · null ⇒ `notFound()` · หัว "ตั้งค่าการจองและคิว · <ชื่อสาขา>" · B.11 เติมแม่แบบ/การ์ดเฉพาะ
- `dorm/settings`: unit.type ≠ DORM ⇒ `notFound()` · domains `["rooms", "payments", "messaging"]` · หัว "ตั้งค่าหอ · <ชื่อหอ>" · D.7/D.13 จัดกลุ่มเป็นภาพ 10/17
- actor จาก `auth.active` (role · unitAccess · permissions · userId) เหมือน `actions.ts` — ห้ามรับจาก searchParams

## 8. เกณฑ์รับ
1. `scripts/qc-svc-r0.4.mts` ผ่านทุกข้อ (SKIP ยอมได้เฉพาะ `VIS-2` เมื่อไม่มี QC server)
2. regression: `qc-svc-r0.3` · `qc-svc-r0.6` · `qc-svc-d.1` · `qc-svc-smoke` · approval ×3
3. typecheck (ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168) + fitness 2 โหมด
4. ภาพ (ผู้คุม): `visual-svc r0.4` owner 1440/390 · PARITY เทียบโครง 08/17 (ภาพจริงเต็มที่ B.11/D.13)

## 9. มติของใบนี้ (ผู้เขียนข้อสอบตัดสิน)
1. CC §1.8 เขียน `<SettingsForm domain group[] refs mode>` — **ใช้ `model` + `actions` แทน** (โหลดฝั่ง server ได้ query ต่อชุด · ทดสอบ render ได้โดยไม่มี Next) · `mode="entity"` = `scope/scopeId` ของ `loadSettingsForm`
2. MASTER-PLAN ให้ใช้ฟิกซ์เจอร์บน "หน้าทดสอบ QC" — ขัด R0.3 S-3 (ห้าม src import `_fixture`) ⇒ ข้อสอบโหลดฟิกซ์เจอร์ในโปรเซสเอง แล้วเรียก `loadSettingsForm` + render ตรง · ไม่มีหน้า QC ใน src
3. percent = basis point ทุก def (ตาม defs/rooms) · money = สตางค์ · UI แสดงบาท/%
4. ผู้จำกัดสาขาขอฟอร์มชั้น TENANT ได้ (เห็นค่า) แต่ทุกช่องล็อก (ตรงกับ service `TENANT_SCOPE_FORBIDDEN`)
5. ตัวเตือนข้ามค่าใช้ผลจาก server (`setSettings` VALIDATION issues ต่อ key) — ไม่ทำ dry-run แยก
