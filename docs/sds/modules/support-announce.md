# Support Desk & Announce (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
สองระบบฝั่งแพลตฟอร์ม↔ร้าน: (1) **Support Desk** — ร้านเปิดเคส/คุยต่อ, backoffice เห็นทุกร้าน+ตอบ+ปิดเคส+ระงับร้าน. (2) **Announce** — แพลตฟอร์มประกาศ → ทุกร้านเห็น banner จนกด "รับทราบ" (dismiss ต่อร้าน). WO-0021/0031. **Layer 2/Platform**. Support case=tenant-scoped ฝั่งร้าน; ฝั่ง platform prisma ตรง (ข้ามร้าน).
โค้ด: `src/lib/support/{service,actions}.ts` · `src/lib/announce/{service,actions}.ts` · `src/lib/platform/{support,announce}.ts` · schema `prisma/schema/support.prisma` + `announcement.prisma`.

## Data model
support.prisma:
- **SupportCase** — `tenantId` `openedByUserId` `subject` `status`(OPEN/PENDING/RESOLVED) `assigneePlatformUserId?`. index `[tenantId,status,updatedAt]`, `[status,updatedAt]`(backoffice กวาดทุกร้าน).
- **SupportMessage** — `caseId` `authorSide`(SHOP/PLATFORM) `authorId` `body`.
- **PlatformAuditLog** (append-only) — `platformUserId` `action`("tenant.suspend"/"tenant.reactivate"/"support.status"/...) `targetType/targetId` `detail?`.
announcement.prisma:
- **PlatformAnnouncement** — `title` `body` `publishedAt?`(null=ร่าง) `createdByPlatformUserId`.
- **AnnouncementDismiss** — `tenantId` `announcementId` unique `[tenantId,announcementId]` (รับทราบต่อร้าน).

## Service API
- **support/service.ts** (ฝั่งร้าน, tenant-scoped): `createCase(ctx, {userId,subject,body})` — เคส OPEN + ข้อความแรก SHOP · `listMyCases(ctx, take=50)` · `listCaseMessages(ctx, caseId)` · `addShopMessage(ctx, caseId, userId, body)` — RESOLVED → เปิดใหม่ OPEN; เคสไม่ใช่ของ tenant → false.
- **support/actions.ts**: `loadMyCasesAction/loadCaseThreadAction/openCaseAction/addMessageAction`.
- **platform/support.ts** (prisma ตรง): `listAllCases(filter?)`(+tenantName) · `caseDetail` · `setCaseStatus(pu,...)`(+audit "support.status") · `addPlatformMessage(pu,...)`(+ตั้งเคส PENDING) · `suspendTenant(pu,tenantId,reason)`(SUPER_ADMIN → SUSPENDED + audit "tenant.suspend") · `reactivateTenant(pu,tenantId)` · `listTenantAudit(tenantId, take=10)`.
- **announce/service.ts** (ฝั่งร้าน): `activeAnnouncements(ctx)` — ประกาศ published ที่ยังไม่ dismiss · `dismissAnnouncement(ctx, announcementId)`.
- **platform/announce.ts**: `createAnnouncement(pu,...)`(ร่าง + audit) · `publishAnnouncement(pu,id)`(ตั้ง publishedAt) · `unpublishAnnouncement` · `listAnnouncements`.

## การเชื่อมต่อ
- **Tenant lifecycle**: suspendTenant/reactivateTenant เปลี่ยน Tenant.status → context.requireTenant gate (SUSPENDED → /suspended).
- **Backoffice session แยกขาด** (PlatformUser/bo_session) — ทุก mutation platform ผ่าน audit (PlatformAuditLog).
- ไม่มี outbox event · ไม่มีเส้นเงิน.

## Permissions
- ฝั่งร้าน: requireTenant (ownership check เคส = ของ tenant).
- ฝั่ง platform: `requirePlatformRole` — suspend/reactivate = SUPER_ADMIN เท่านั้น; setCaseStatus/addPlatformMessage = ทุก role ที่ผ่าน requireBackoffice.

## UI
- ร้าน: ปุ่ม help (support widget) ในแอป (support/actions).
- Backoffice: `/backoffice/cases` + `/backoffice/cases/[id]` (เคส) · `/backoffice/tenants` + `/backoffice/tenants/[id]` (ระงับ/audit) · `/backoffice/announcements`.

## การทดสอบ
- `scripts/qc-support.mts` (Fable oracle, WO-0021) — createCase/addShopMessage(RESOLVED→reopen/ownership) + platform setCaseStatus/addPlatformMessage(PENDING) + suspend/reactivate (SUPER_ADMIN + audit).
- `scripts/qc-announce.mts` (WO-0031) — create/publish (idempotent) + activeAnnouncements + dismiss ต่อร้าน.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Support Desk เคสแทรกคิวก่อนงานอื่นเสมอ (กติกา 10_MASTER_QUEUE).
- **WO-0047** AI triage support (backoffice AI สรุปเคส+ร่างคำตอบ — คนกดส่ง ไม่ auto).
