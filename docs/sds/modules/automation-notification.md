# Automation & Notification (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
Automation v1: Trigger (outbox event) → Condition (ยอดขั้นต่ำ) → Action (แจ้งเตือนในแอป AppNotification / ยิง webhook). + ศูนย์แจ้งเตือนในแอป. ผู้ใช้: เจ้าของร้าน (ตั้ง rule). WO-0026. **Layer 4: Advanced** — scope=tenant.
โค้ด: `src/lib/automation/{engine,service,actions,labels}.ts` · schema `prisma/schema/automation.prisma` · hook ใน `src/lib/outbox-consumers.ts`.

## Data model (prisma/schema/automation.prisma) — scope=tenant
- **AutomationRule** — `name` `event`("pos.sale.paid"/"pos.sale.voided"/...) `enabled` `minAmountSatang?`(เงื่อนไข v1: ยอด ≥, เฉพาะ event ที่มี amountSatang) `actionType`(NOTIFY/WEBHOOK) `actionConfig`(NOTIFY:{title?} · WEBHOOK:{url}). index `[tenantId,event,enabled]`.
- **AutomationRun** — `ruleId` `status`(OK/FAILED) `detail?` (log การยิง).
- **AppNotification** — `title` `body` `readAt?` (ปลายทาง action NOTIFY). index `[tenantId,readAt,createdAt]`.

## Service API
- **engine.ts**: `runForEvent(evt:{tenantId,type,payload}, deps?:{post?})` → **จำนวน rule ที่ยิง**. หา rule enabled ตรง event, ตรวจ minAmountSatang กับ payload.amountSatang, ทำ action (NOTIFY = สร้าง AppNotification / WEBHOOK = post URL ผ่าน deps.post หรือ fetch จริง), log AutomationRun. deps.post ฉีดได้ (ข้อสอบ).
- **service.ts**: `createRule(ctx, input)` · `listRules(ctx)` · `setRuleEnabled(ctx,...)` · `deleteRule(ctx, id)` · `listNotifications(ctx)` · `countUnread(ctx)` · `markNotificationRead(ctx, id)`.
- **actions.ts**: `createRuleAction/toggleRuleAction/deleteRuleAction/markReadAction`.
- **labels.ts**: label เหตุการณ์/action เป็นไทย.

## การเชื่อมต่อ
- **Outbox (ช่องทาง #1)**: `outbox-consumers.ts` ห่อ handler หลักด้วย `withAutomation` → หลัง handler สำเร็จเรียก `runForEvent` แบบ **best-effort** (try/catch เงียบ — automation พังห้ามล้ม consumer หลัก ไม่งั้น post บัญชีซ้ำ). ทุก event ที่ drain (pos.sale.paid/voided) วิ่งเข้า engine.
- **Notification → UI**: AppNotification แสดงในศูนย์แจ้งเตือน.
- Alert เจ้าของผ่าน email/LINE = แผน (WO-0041 ใช้ AppNotification+webhook เดิม).

## Permissions
Rule/notification action ผ่าน requireTenant (owner/manager). ไม่มี permission string เฉพาะ (grep automation = ว่าง).

## UI
- `/app/settings/automation` (ตั้ง rule) · `/app/notifications` (ศูนย์แจ้งเตือน + mark read).

## การทดสอบ
- `scripts/qc-automation.mts` (Fable oracle, WO-0026) — runForEvent: match event/minAmount, NOTIFY สร้าง AppNotification, WEBHOOK ยิง (deps.post inject), นับ rule ที่ยิง, log run. best-effort (engine พังไม่ล้ม consumer หลัก — ทดสอบผ่าน outbox path).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- v1 trigger = outbox event เท่านั้น (pos.sale.*). event ใหม่ (เช่น `inventory.lot.expiring`) มากับ WO-0038.
- **WO-0041** Observability (alert → email/LINE) · **WO-0062** Webhooks ขาออก (สมัคร URL ต่อ event + HMAC + retry) · **WO-0072** Onboarding drip.
- Condition v1 = ยอดขั้นต่ำ (ยังไม่มี condition ซับซ้อน).
