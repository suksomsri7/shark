# Marketplace + White Label (DESIGN — สำหรับ WO-0063 + WO-0064)

> Marketplace โครง (0063): ทะเบียน template/plugin · install ต่อ tenant · เริ่มจาก DNA presets อุตสาหกรรม · White label (0064): โลโก้/สี/ชื่อ ต่อ tenant บน storefront+อีเมล · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **Marketplace:** ทะเบียน template อุตสาหกรรม (DNA presets) ที่ร้าน install ได้ในคลิกเดียว → เปิดชุดระบบ+ตั้งค่าตามแม่แบบ · โครงรองรับ plugin/theme ภายนอกอนาคต
- **White label:** ร้านปรับแบรนด์ตัวเอง (โลโก้/สี/ชื่อ) บนหน้าสาธารณะ (storefront/portal/booking) + อีเมล ต่อ custom domain ที่มี
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` — Ecosystem (Marketplace + partners) คือ 1 ใน 5 เกณฑ์ "สมบูรณ์ระดับโลก" · DNA presets เร่ง onboarding (ต่อยอดเส้น DNA ที่มี)

## Data model เสนอ
axis = **platform** (ทะเบียน template กลางข้ามร้าน · เขียนผ่าน backoffice) + **tenant** (การ install/branding ต่อร้าน).

### Marketplace
- `MarketplaceTemplate` (axis: platform) — แม่แบบในทะเบียนกลาง
  - `id` · `key` (slug unique) · `name` · `industry` · `description` · `iconUrl`
  - `blueprintJson` Json (DNA facts/blueprint preset — ป้อนเส้น DNA compile) · `version` Int · `published` Boolean
  - เขียนผ่าน `src/lib/platform/**` เท่านั้น + PlatformAuditLog (ตามมาตรฐาน backoffice)
- `TenantInstall` (axis: tenant) — ร้าน install อะไรไปแล้ว
  - `id` · `tenantId` · `templateKey` · `templateVersion` · `installedById` · `status` (`INSTALLED | REMOVED`) · `idempotencyKey`
  - `@@unique([tenantId, idempotencyKey])` · `@@unique([tenantId, templateKey])` · `@@index([tenantId, status])`

### White label
- `TenantBranding` (axis: tenant, 1/tenant) — แบรนด์ร้าน
  - `id` · `tenantId` @unique · `logoUrl` · `primaryColorHint` (ใช้จำกัด — ต้องผ่าน token guard, ดู 🔑) · `displayName` · `emailFromName` · `emailFooter` · `customDomain` String? (ต่อ Domain เดิม)
  - `updatedAt`

## Service API เสนอ
- **Marketplace** (ไฟล์อนาคต src/lib/modules/marketplace/service.ts + ฝั่ง platform ใน src/lib/platform):
  - `listTemplates()` — template published (public read)
  - `installTemplate(m, ctx, templateKey)` — assertCan → **เดินเส้น DNA เดิม** (`src/lib/dna/*`): blueprintJson → compile (deterministic!) → apply idempotent ต่อ step (CREATE_SYSTEM/LINK_UNIT/ACCOUNT_SETTINGS) → บันทึก TenantInstall
  - `removeTemplate(m, ctx, templateKey)` — mark REMOVED (ไม่ลบข้อมูลที่สร้างไปแล้ว — ปลอดภัย)
- **White label** (ไฟล์อนาคต src/lib/modules/branding/service.ts):
  - `getBranding(tenantId)` (public — ใช้ render หน้าสาธารณะ) · `saveBranding(ctx, {...})` (assertCan)
- **Edge cases:** install ซ้ำ (idempotencyKey/unique) → ไม่ apply ซ้ำ (DNA apply idempotent อยู่แล้ว) · template version ใหม่กว่า → เสนอ upgrade (apply ส่วนต่าง) · branding โลโก้ = URL (Storage/Bunny เป็น 🔑 owner) · customDomain → ต่อ host-routing (ADR A6 / WO-0065)

## การเชื่อมต่อ
- **ไม่มีเงินโดยตรง** (install/branding = config) · ถ้า marketplace มี plugin คิดเงิน (อนาคต) → ผ่าน Billing (WO-0069) ไม่ใช่เส้น POS ร้าน
- **เส้น DNA (สำคัญ):** installTemplate เดินเส้น DNA เดิม (interview/wizard → facts → compile → blueprint → apply) — Marketplace = อีก entry point ของ blueprint (อ้าง `docs/sds/02_ARCHITECTURE.md` เส้น DNA) · **ไม่ลัด createSystem ตรง** (ผ่าน compile+apply เพื่อ idempotent+ตรวจสอบได้)
- **เส้น Platform:** template ทะเบียนกลาง เขียนผ่าน backoffice + audit (แยกขาดจากร้าน)
- **White label → storefront/portal/booking/email** (ช่องทาง render สาธารณะ) · custom domain ต่อ Domain module เดิม
- **Outbox ใหม่:** `marketplace.template.installed` (ให้ onboarding/analytics เกาะ)

## AI actions
- **read:** `list_templates` — "มีแม่แบบธุรกิจอะไรบ้าง"
- **action:** `install_template` → ProposalKind `install_template` → dispatch `marketplaceSvc.installTemplate` (AI แนะนำแม่แบบตาม DNA → เสนอ → user ยืนยัน → apply) — สอดคล้องหลักการ "AI = Business Architect" ใน `docs/sds/01_VISION.md`
- KIND_ACCESS `{ module: "marketplace", action: "marketplace.template.install" }`

## Permissions เสนอ
- `marketplace.template.install` (OWNER) · `branding.settings.manage` (OWNER) · ฝั่ง platform: role backoffice จัดการ template (audit)

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **หน้า Marketplace** — grid การ์ดแม่แบบ (ไอคอน+ชื่อ+อุตสาหกรรม) · ปุ่ม "ติดตั้ง" ผ่าน `ConfirmDialog` (บอกจะเปิดระบบอะไรบ้าง) · แสดง "ติดตั้งแล้ว"
- **หน้า White label** — อัปโลโก้ (URL), ตั้งชื่อแสดง, footer อีเมล, custom domain · preview
- ทุก UI ยังคุมสีด้วย token — **สีแบรนด์ลูกค้าใช้เฉพาะจุด accent ที่อนุญาต ไม่ทำลายระบบ token** (ดู 🔑)

## ข้อสอบ oracle ที่ต้องมี
1. installTemplate → เดินเส้น DNA compile+apply, เปิดระบบตาม blueprint, บันทึก TenantInstall
2. install ซ้ำ (idempotencyKey/unique) → ไม่ apply ซ้ำ, ไม่เปิดระบบซ้ำ (DNA apply idempotent)
3. template ที่ published เท่านั้นที่ listTemplates คืน
4. template เขียน/แก้ผ่าน backoffice เท่านั้น + เกิด PlatformAuditLog
5. cross-tenant: TenantInstall/Branding ร้าน A ไม่รั่วไป B
6. saveBranding/getBranding ต่อ tenant, หน้าสาธารณะ render โลโก้/ชื่อถูกร้าน
7. removeTemplate → REMOVED, ไม่ลบข้อมูลที่ระบบสร้างไว้ (ปลอดภัย)
8. AI install_template เดินเส้น proposal, assertCan install
9. blueprint compile deterministic (input เดิม → ผลเดิม — อ้าง ADR A4)

## ความเสี่ยง / คำถามเปิด
- 🔑 **สี White label vs token system** — มาตรฐาน UI ห้ามสีนอก token/hex ดิบ. ต้องตัดสินขอบเขต: ให้ลูกค้าเปลี่ยนแค่ accent (น้ำเงิน→สีแบรนด์) บนหน้าสาธารณะเท่านั้น? หรือกว้างกว่า → กระทบ fitness สี
- 🔑 plugin ภายนอก (third-party dev) = ความเสี่ยงความปลอดภัยสูง — v1 จำกัดแค่ DNA template presets (ภายใน) เท่านั้น ไม่รับโค้ดภายนอก · plugin runtime จริง = เลื่อนหลัง Public API (0061) + pentest (0043)
- 🔑 marketplace คิดเงิน/revenue share = โมเดลธุรกิจเจ้าของ (ต่อ Billing 0069)
- custom domain ต่อ storefront = ขึ้นกับ ADR A6 / WO-0065
