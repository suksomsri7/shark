# Storage · Domain · i18n (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
สามฟีเจอร์แนวขวางของแพลตฟอร์ม: **Storage** (อัปโหลดไฟล์ร้าน → Bunny CDN), **Domain** (custom domain ลูกค้า resolve ที่ชั้น app), **i18n** (dictionary กลาง th/en หน้า public). **Layer 2: Core**. WO-0024/0025/0034.
โค้ด: `src/lib/storage/{service,actions}.ts` · `src/lib/domain/{service,actions}.ts` · `src/lib/i18n/{dict,index}.ts` · schema `prisma/schema/storage.prisma` + `core.prisma`(Tenant.customDomain/domainStatus). i18n = ไม่มี DB.

## Data model
- **FileAsset** (storage.prisma) — `tenantId` `kind`(LOGO/ATTACHMENT) `path`(t/<tenantId>/<kind>/<id>.<ext>) `cdnUrl` `contentType` `bytes`. scope=tenant. index `[tenantId,kind,createdAt]`.
- **Domain** — ใช้ field ใน `Tenant` (core.prisma): `customDomain?`(unique) `domainStatus`(NONE/PENDING_DNS/VERIFYING/ACTIVE/FAILED).
- **i18n** — ไม่มีตาราง (dictionary in-code).

## Service API
- **storage/service.ts**: `storageEnabled()` — env SHARK_BUNNY_ZONE+KEY+CDN ครบ · `uploadFile(ctx, {kind,filename,contentType,data}, deps?:{put?})` → `{ok:true,cdnUrl,assetId}|{ok:false,error}`(ไทย, **ไม่ throw**). ปิดอยู่ (ไม่มี env/deps.put) → ok:false. ตรวจชนิด image/jpeg|png|webp|gif + application/pdf, ขนาด ≤ 5MB. path = t/<tenantId>/<kind>/<id>.<ext>. สำเร็จ → FileAsset row. ของจริง PUT `https://sg.storage.bunnycdn.com/<zone>/<path>` header AccessKey · `listAssets(ctx, kind?, take=50)`.
- **storage/actions.ts**: `uploadLogoAction` · `storageEnabledAction`.
- **domain/service.ts**: `domainEnabled()` · `requestDomain(...)` — ตั้ง customDomain + PENDING_DNS, addDomain ผ่าน VercelDomainClient · `checkDomain(ctx, deps?)` — poll สถานะ (pending/active/error → domainStatus) · `removeDomain(ctx, deps?)` · `resolveTenantByHost(host)` → {slug} (host-routing ชั้น app, ADR A6) · `realVercelClient()` — VercelDomainClient (addDomain/getDomainStatus/removeDomain).
- **domain/actions.ts**: `requestDomainAction/checkDomainAction/removeDomainAction`.
- **i18n/dict.ts**: `DICT: Record<"th"|"en", Record<string,string>>` — key ชุดเดียวกันทั้งสองภาษา (parity 100%). **index.ts**: helper แปล/เลือกภาษา.

## การเชื่อมต่อ
- **Storage → Account/โมดูล**: cdnUrl ใช้แทน URL-paste (โลโก้ AccountSettings.logoUrl, ไฟล์แนบ). ปิดอยู่ = วาง URL เองยังใช้ได้เหมือนเดิม.
- **Domain → routing**: resolveTenantByHost map host → tenant slug (แทน proxy จนกว่าจะย้าย adapter-neon).
- **Billing**: custom domain มีค่าบริการ → PlatformInvoice (ดู payment-billing).
- **i18n → public pages**: หน้า storefront/error ฝั่งลูกค้า.

## Permissions
- Storage/Domain actions ผ่าน requireTenant (owner). Domain มีค่าใช้จ่าย → gate ที่แพลตฟอร์ม (PlatformInvoice).

## UI
- `/app/settings/domain` (custom domain) · การอัปโหลด storage อยู่ในฟอร์มที่เกี่ยว (โลโก้/แนบ). i18n = ไม่มีหน้า config (in-code).

## การทดสอบ
- `scripts/qc-storage.mts` (WO-0024) — storageEnabled/uploadFile (ปิด→ok:false ไทย, ตรวจ mime/ขนาด 5MB, path/cdnUrl ถูก, deps.put inject) — ไม่ throw.
- `scripts/qc-domain.mts` (WO-0025) — VercelDomainClient stub: requestDomain/checkDomain/removeDomain + resolveTenantByHost + domainStatus transitions.
- `scripts/qc-i18n.mts` (WO-0034) — DICT parity th/en 100% + typecheck standalone (dynamic import).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- 🔑 needs-owner: SHARK_BUNNY_* (storage ยังปิด → โลโก้/แนบไฟล์ยัง URL-paste).
- host-routing ทำที่ชั้น app (ADR A6 — ข้อจำกัด Vercel runtime + pg TCP) → WO-0065 (ย้าย adapter-neon แล้วทำใน proxy) ขึ้นกับ WO-0064.
- **WO-0066** i18n v2 (เมนูร้าน/จอคิว TV/EN หลังบ้าน + เลือกภาษาต่อ user) · **WO-0064** White label (โลโก้/สี/ชื่อต่อ tenant).
