# Subscription / สมาชิกรายเดือน-รายปี (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
แพ็กเกจสมาชิกรายงวด (fitness/สปา/คอร์ส) ภายในระบบ MEMBER — สร้างแผน + สมัคร + ตรวจ active + หมดอายุอัตโนมัติ (cron). ผู้ใช้: staff (ตั้งแผน/สมัครให้ลูกค้า). **Layer 4: Advanced** — เป็นส่วนหนึ่งของโมดูล Member (feature no.6), scope=system (ระบบ MEMBER). WO-0027.
โค้ด: `src/lib/modules/member/subscription.ts` · `subscription-actions.ts` · `subscription-ui.tsx` · schema `prisma/schema/subscription.prisma` · cron `src/lib/platform/cron.ts`.

## Data model (prisma/schema/subscription.prisma) — tenantId+systemId
- **MemberPlan** — `name` `priceSatang` `periodDays`(30/365) `active`. index `[tenantId,systemId,active]`.
- **MemberSubscription** — `customerId` `planId` `status`(ACTIVE/EXPIRED/CANCELLED) `startAt` `endAt` `autoRenew`(ธงไว้ก่อน — ตัดเงินจริงรอ gateway) `cancelledAt?`. index `[tenantId,systemId,status,endAt]`, `[tenantId,customerId]`.

## Service API (src/lib/modules/member/subscription.ts) — ctx {tenantId,systemId}
- `createPlan(ctx, {name, priceSatang, periodDays})` — periodDays ≥ 1 ไม่งั้น **throw ไทย**.
- `listPlans(ctx, activeOnly=true)` · `setPlanActive(ctx, planId, active)`.
- `subscribe(ctx, {customerId, planId, startAt?})` — endAt = start + periodDays. ลูกค้ามี ACTIVE plan เดิมซ้อน → **throw ไทย**.
- `cancelSubscription(ctx, subId)` — ACTIVE→CANCELLED + cancelledAt · อื่น → false.
- `isSubscriptionActive(ctx, customerId, at?)` — มี ACTIVE ที่ at อยู่ในช่วง start..end.
- `expireDue(ctx, now?)` — ACTIVE ที่ endAt < now → EXPIRED (คืนจำนวน) — idempotent cron-ready.
- `listSubscriptions(ctx, take=50)`.

## การเชื่อมต่อ
- **Member (Customer)**: subscription.customerId → Customer.id (ช่องทาง #4).
- **Cron (Kernel)**: `platform/cron.ts sweepExpiredSubscriptions(now)` กวาดทุกร้าน (prisma ตรง ระดับ platform) เรียกตรรกะเดียวกับ expireDue → EXPIRED — idempotent. รันผ่าน `runDailyCron` (API `/api/cron/tick`).
- ยังไม่เข้าเส้นเงิน (ตัดเงินจริงรอ payment gateway — autoRenew เป็นธง).

## Permissions (assertCan ใน subscription-actions.ts)
`member.plan.create` · `member.plan.update` · `member.subscription.create` · `member.subscription.cancel`.

## UI
- `SubscriptionSection` (subscription-ui.tsx) ฝังในหน้าระบบ MEMBER: `/app/sys/[id]` (type=MEMBER) — แผน + สมัคร + สถานะ.

## การทดสอบ
- `scripts/qc-subscription.mts` (Fable oracle, WO-0027) — createPlan(periodDays≥1) · subscribe(กันซ้อน ACTIVE) · isSubscriptionActive(ช่วงเวลา) · expireDue(idempotent). severity CRITICAL/MAJOR/MINOR.
- `scripts/qc-cron.mts` — sweepExpiredSubscriptions (idempotent ข้ามร้าน).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ตัดเงินอัตโนมัติ (autoRenew) รอ payment gateway → WO-0069 (Billing plans + quota) / WO-0070 (Beam).
- ไม่ post บัญชีรายรับ subscription (ยังไม่เข้าเส้นเงิน).
