# Stage A (CORE) — Progress Tracker

> อ่านก่อนต่อ: `qc/RESOLUTIONS.md` → `modules/_CONVENTIONS.md` → `qc/QC4-core-platform.md §ข` (47 รายการ) → ไฟล์นี้
> Gate: ผ่าน 12 ข้อใน QC4 ก่อนแตกขนาน Stage B

## Stack ที่ล็อกแล้ว (verified build ผ่าน)
- Next.js **16.2** (App Router, Turbopack default, **`proxy.ts` ไม่ใช่ middleware**) · React 19.2 · TS 5.9
- Prisma **7.8** — schema แบบ multi-file (`prisma/schema/*.prisma`), connection ผ่าน **driver adapter** (`@prisma/adapter-pg`), URL อยู่ `prisma.config.ts` (`env()` + `process.loadEnvFile`)
- Tailwind **4** (CSS-first `@theme` ใน globals.css) · next-intl **4** (ไม่ prefix URL, locale จาก cookie)
- ฟอนต์ IBM Plex Sans Thai (ไทย+อังกฤษ)

## เสร็จแล้ว ✅
- [x] scaffold + build/typecheck ผ่าน (`pnpm build`, `pnpm typecheck`)
- [x] `prisma/schema/core.prisma` — Tenant, BusinessUnit, User, Membership, AuthToken, Session, PlatformUser, AuditLog + enums (FROZEN)
- [x] `src/lib/core/scope.ts` — registry scope ต่อ model + `registerScopes()`
- [x] `src/lib/core/db.ts` — prisma singleton + **`tenantDb(ctx)`** inject tenantId/unitId + unit guard + findUnique post-verify (404 ข้าม tenant)
- [x] `src/lib/core/rbac.ts` — `can()` 4 มิติ (evaluate/assertCan/permissionValue) pure+testable
- [x] `src/lib/contracts.ts` — stub 7 contracts (createSale/point/coupon/notify/member/activity) + `registerContracts()`
- [x] `src/lib/env.ts` — zod validate env
- [x] i18n TH/EN (`src/i18n/`, `src/messages/`), design system B&W, root layout
- [x] route: `/` landing + `/app` dashboard shell (sidebar 3 โซน placeholder) + `proxy.ts` (tenant/surface resolve + security headers)

## ค้าง / ทำต่อ (Stage A ที่เหลือ — เรียงลำดับ)
### A1 (block ทุกอย่าง)
- [ ] **Auth passwordless email** — AuthToken hash+consume race-safe, magic link interstitial POST, OTP lockout, Session `__Host-` cookie + rotation + revoke; interstitial กัน email scanner (SECURITY §1)
- [ ] **Tenant/session context** — อ่าน session ใน server → membership → `getCtx()` ให้ handler + `assertCan()`
- [ ] **Onboarding** — สมัคร→ยืนยันอีเมล→สร้าง Tenant+Membership(OWNER)→สร้าง BusinessUnit แรก (wizard 6 ประเภท) → `/app`
- [ ] **Unit Switcher** (client) + URL `/app/u/[unitSlug]/...` + resolver `unitId` จาก slug + `withUnitCtx` (404 แทน 403)
- [ ] เชิญพนักงาน + จำกัด unitAccess
- [ ] permissions JSON schema + STAFF preset · event bus + `core.membership.unitAccessChanged/removed` · naming standards (event/SSE/notify) · `bizDate()`
- [ ] isolation CI gate (2 tenants × 2 units) — route manifest
### A2a (block Stage B) : AuditLog writer · notify()+consent gate+NotificationLog · cron runner+X-Cron-Secret · **outbox/retry queue กลาง** · DailyStat+statUpsert · Tenant.limits enforce
### A2b (block Stage C+BO) : SSE hub · object storage+upload service (2 โหมด) · feature flags · platformPrisma · ExportService · backoffice slots
### A3 : contract stubs ครบ (มี 7 แล้ว) + getUnitKpi registry + StatProvider

## ⚠️ Gotchas ที่เจอจริง (อย่าพลาดซ้ำ)
1. Next 16: `middleware.ts` → **`proxy.ts`** (export `proxy`); Turbopack เป็น default
2. Prisma 7: datasource ใน schema มีแค่ `provider`; url ย้ายไป `prisma.config.ts`; **ไม่มี `datasourceUrl`** → ต้องใช้ driver adapter; config ไม่ auto-load .env → `process.loadEnvFile()`
3. Route group `(x)/page.tsx` ห้ามชน path `/` กัน → dashboard อยู่ใต้ segment `/app` จริง

## รอ user
Neon (Singapore) · Resend + verify domain · ImprovMX — เสียบ `.env` เมื่อได้ key แล้ว `pnpm db:migrate` ครั้งแรก
