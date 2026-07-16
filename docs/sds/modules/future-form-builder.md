# Form Builder (DESIGN — สำหรับ WO-0054)

> ฟอร์ม config → public link → submissions ไหลเข้า Customer/CRM lead · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** สร้างฟอร์มเก็บข้อมูล (ติดต่อ/สมัคร/สำรวจ/รับลูกค้า) โดยไม่เขียนโค้ด · แชร์ public link · คำตอบไหลเข้าเป็น Customer หรือ CRM lead อัตโนมัติ
- **ผู้ใช้:** ทุกธุรกิจที่รับ lead/ลงทะเบียนงาน/แบบสอบถาม (SME ไทย)
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` Layer 4 builder · เป็น input funnel ที่ป้อน CRM/Member โดยไม่ต้องพึ่ง Google Forms ภายนอก (ข้อมูลอยู่ในระบบเดียว → PDPA คุมได้)

## Data model เสนอ
โมดูลใหม่ `formbuilder` — axis = **tenant** (ฟอร์มใช้ข้ามระบบย่อยได้ · submission เป็นข้อมูลกลาง) หรือ system ถ้าผูก CRM/Member เฉพาะ. เสนอ **tenant** ให้ยืดหยุ่น (เหมือน AutomationRule).

- `FormDefinition` (axis: tenant) — นิยามฟอร์ม
  - `id` · `tenantId` · `createdAt` · `updatedAt`
  - `title` · `slug` (path สาธารณะ unique ต่อ tenant) · `description` String?
  - `fieldsJson` Json (array ของ field: `{key, label, type, required, options[]}` — type: `text|textarea|number|email|phone|select|checkbox|date`)
  - `active` Boolean · `submitAction` enum (`NONE | CREATE_CUSTOMER | CREATE_CRM_LEAD`) · `targetSystemId` String? (ระบบ Member/CRM ปลายทาง)
  - `@@unique([tenantId, slug])` · `@@index([tenantId, active])`
- `FormSubmission` (axis: tenant, append-only) — 1 การส่ง
  - `id` · `tenantId` · `formId` · `dataJson` Json (ค่าตาม field key)
  - `customerId` String? (ถ้า submitAction สร้าง/จับคู่ Customer) · `crmContactId` String?
  - `ip` String? · `userAgent` String? · `createdAt`
  - `idempotencyKey` String? (กัน double-submit จาก client token) · `@@index([tenantId, formId, createdAt])`

**Idempotency:** client ส่ง submit token → `idempotencyKey` `form-<token>` กันส่งซ้ำจากปุ่มรัว. Submission append-only.

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/formbuilder/service.ts)
- `getPublicForm(tenantSlug, formSlug)` — public no-auth resolve ฟอร์ม active (แบบ `resolveUnit` booking)
- `submitForm(publicCtx, formSlug, data, { token })` — validate ตาม fieldsJson (Zod สร้างจาก schema ที่ boundary — อ้าง `docs/sds/04_CORE_PLATFORM.md`) → สร้าง FormSubmission → ถ้า submitAction:
  - `CREATE_CUSTOMER` → member.findOrCreate (dedup phone/email) ผ่าน composition root
  - `CREATE_CRM_LEAD` → crm.createContact/deal
- `listForms(ctx)` · `getSubmissions(ctx, formId)` · `exportSubmissions(ctx, formId)` (csv)
- `saveForm(ctx, {...})` — create/update definition (สิทธิ์ manage)
- **Edge cases:** field required ขาด → 400 (validation inline) · double-submit → idempotent · ฟอร์มปิด (active=false) → public 404 · phone ซ้ำ → dedup Customer ไม่สร้างซ้ำ · spam/bot → rate limit (ต่อ WO-0043)

## การเชื่อมต่อ
- **ไม่มีเงิน** — ไม่เข้าเส้นเงิน (form เก็บข้อมูล ไม่ขาย · ถ้าต้องรับเงินให้ต่อ E-commerce/POS)
- **Customer กลาง:** submitAction=CREATE_CUSTOMER → Customer + MemberActivity `FORM_SUBMITTED` (ช่องทาง 4 ใน `docs/sds/02_ARCHITECTURE.md`)
- **CRM:** CREATE_CRM_LEAD → CrmContact/CrmDeal ผ่าน composition root (ช่องทาง 2)
- **Outbox ใหม่:** `form.submission.received` (ให้ Automation ส่งอีเมล/แจ้งเตือน/notify เจ้าของ)

## AI actions
- **read:** `form_submissions_summary` (จำนวน/ล่าสุดต่อฟอร์ม)
- **action:** `form_create` → ProposalKind `form_create` → dispatch `formSvc.saveForm` (AI ร่างฟอร์มจากคำสั่ง "สร้างฟอร์มรับลูกค้ามีชื่อ/เบอร์/ความสนใจ" → เสนอ → user ยืนยัน)
- KIND_ACCESS `{ module: "formbuilder", action: "formbuilder.form.manage" }`

## Permissions เสนอ
- `formbuilder.form.manage` · `formbuilder.submission.view` · `formbuilder.submission.export`

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้ารายการฟอร์ม** — `DataList` + จำนวน submission + สถานะเปิด/ปิด
- **หน้าสร้าง/แก้ฟอร์ม** — เพิ่ม field (เลือก type), ตั้ง required, กำหนด submitAction/ปลายทาง · ปุ่มคัดลอก public link
- **ฟอร์มสาธารณะ** (`max-w-md mx-auto`) — render จาก fieldsJson ผ่าน `FormField`, validation inline (ไม่ใช้ alert — อ้างมาตรฐาน)
- **หน้า submissions** — `DataTable` คำตอบ + export

## ข้อสอบ oracle ที่ต้องมี
1. submitForm ผ่าน validate → FormSubmission ถูกสร้าง, dataJson ตรง
2. field required ขาด → ถูกปฏิเสธ ไม่สร้าง submission
3. submitAction=CREATE_CUSTOMER → Customer ถูก findOrCreate (dedup phone), ผูก customerId
4. double-submit (token เดิม) → 1 submission (idempotent)
5. ฟอร์ม active=false → getPublicForm คืน null (404)
6. tenant อื่นมองไม่เห็นฟอร์ม/submission (cross-tenant)
7. slug ซ้ำใน tenant → ถูกกันด้วย unique
8. submission append-only (ไม่มี path update ค่าเดิม)
9. AI form_create เดินเส้น proposal, assertCan manage
10. export submissions คืนครบทุกแถวของฟอร์มนั้นเท่านั้น

## ความเสี่ยง / คำถามเปิด
- 🔑 axis tenant vs system — เสนอ tenant. ยืนยัน (กระทบว่า submission ต้องผูก systemId ไหมเมื่อปลายทางเป็น CRM/Member ที่เป็น system-scoped)
- 🔑 field types ชุดแรก (จบที่ text/select/date/checkbox พอไหม หรือต้อง file upload → ผูก Storage/Bunny ซึ่งเป็น 🔑 owner)
- spam/bot protection: ต้อง captcha ไหม (ต่อ WO-0043 rate limit)
