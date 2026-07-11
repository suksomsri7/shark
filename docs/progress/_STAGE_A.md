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
- [x] **Auth passwordless email** ✅ — hash.ts (sha256+timing-safe), email.ts (dev fallback console + Resend), session.ts (`shark_session`/`__Host-` prod, idle 8h/abs 30d, sliding), auth.ts (requestLogin=OTP+magic link, verifyOtp lockout 5, consumeMagicLink), interstitial `/auth/verify` POST. **ทดสอบจริงกับ Neon ผ่าน** (verify/reuse-block/attempt)
- [x] **Tenant/session context** ✅ — context.ts `getAuth/requireAuth/requireTenant/requireUnit/setActiveTenant`
- [x] **Onboarding** ✅ — `/signup`,`/login`,`/onboarding` + actions/onboarding.ts (tx: Tenant+Membership(OWNER)+BusinessUnit, wizard 6 ประเภท, enabledModules ตาม type). ทดสอบ tx จริงผ่าน
- [x] **Unit route** ✅ — `/app/u/[unitSlug]` + requireUnit (404 แทน 403). dashboard shell โหลด units จริง + logout. **HTTP guard ทดสอบผ่าน** (/app,/onboarding → 307 /login)
- [ ] **Unit Switcher (client)** — ตอนนี้ sidebar list ยังไม่มี dropdown สลับ tenant/unit แบบไม่ reload + cookie active
- [ ] เชิญพนักงาน + จำกัด unitAccess (invite flow + accept)
- [ ] หน้า settings/units/new (ปุ่มมีแล้ว ยังไม่มีหน้า) + settings ร้าน
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
