# M3.6 — การแจ้งเตือนสมาชิก · โน้ตผู้ทำ

> builder: Sonnet · 11 ก.ย. 2569 · worktree `shark-member` (โหมดขนาน M3.4 ∥ M3.5 ∥ M3.6) · ข้อสอบ `scripts/qc-member-m3.6.mts` (ไม่ถูกแตะ)

## 1. ไฟล์ที่ส่งมอบ

**สคีมา / migration**
- `prisma/schema/member.prisma` — เพิ่มโมเดลใหม่ 1 ตัว `MemberNotification` (additive ล้วน · ไม่แตะตารางเดิม) — ไม่มี relation ผูก `Customer` ตรง (แบบเดียวกับ `MemberAccessLog` — เป็นบันทึกเชิงระบบ ไม่ใช่ข้อมูลของสมาชิกที่ PDPA ต้องลบทั้งแถว)
- `prisma/migrations/20261029000000_member_v2_h2/migration.sql` — `CREATE TABLE "MemberNotification"` + 3 ดัชนี (`systemId,status,scheduledAt` · `customerId,createdAt` · `systemId,createdAt`) — apply บน QC แล้ว (`prisma migrate deploy` เขียว) + `prisma generate` แล้ว

**เอนจิน / facade (ใหม่ทั้งหมด)**
- `src/lib/modules/member/notification-events.ts` — ทะเบียนบริสุทธิ์: `NOTIF_EVENTS` (8 ตัว ตามลำดับภาพ 30) · `NOTIF_CHANNELS` · `NOTIF_TIMINGS` · `getNotifEvent` · `varsUsedIn`
- `src/lib/modules/member/notifications-shared.ts` — ไฟล์บริสุทธิ์ที่สอง: ชนิดข้อมูล (`NotifChannelConfig`/`NotifTemplateConfig`/`NotificationSettingsValue`) · ค่าเริ่มต้น 8×4 (`defaultNotificationSettings`) · `renderTemplate` (pure — ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอพรีวิวสด) · ชนิด `NotificationDeps`/`NotificationSendRequest` (deps ที่ engine รับฉีด)
- `src/lib/modules/member/notifications.ts` — เอนจินจริง: `getNotificationSettings` · `setTemplate` · `setNotificationSettings` · `buildVars` · `send` · `runDue` · `stats` · `testSend` (deps ไม่ฉีด = ช่องทางนั้น "ยังไม่ได้ตั้งค่าตัวส่ง" — EMAIL/SMS/PUSH ยังมีตัวส่งปริยายในไฟล์นี้เองเพราะไม่ข้าม F2, LINE ต้องฉีดเสมอ)
- `src/lib/modules/member/notifications-actions.ts` (`"use server"`) — `saveTemplateAction` · `saveNotificationSettingsAction` · `testSendNotificationAction` · `notificationStatsAction` · `getNotificationSettingsAction` — ด่านสองชั้นแบบ `fields-actions.ts` (`canReadMember` ผ่าน `assertCan` จริง แล้วค่อย `canManageSettings` เฉพาะเจาะจง)
- `src/lib/modules/member/notifications-cron.ts` — `runDueAllSystems(now)`: จุดเข้าเดียวของ cron ที่ไล่ทุกระบบ MEMBER แล้วเรียก `runDue` พร้อมตัวส่งจริงจาก composition root (ไฟล์เดียวในโมดูลที่แตะ `member-journey-senders.ts` ตรง ๆ — ดู §4 ข้อ 2)

**หน้าจอ**
- `src/app/app/sys/[id]/member/settings/notifications/page.tsx` (ใหม่)
- `src/components/member/NotificationsSettings.tsx` (ใหม่ · client component)

**สาย/ทะเบียน (Edit เฉพาะจุด — อ่านใหม่ก่อนแก้ทุกครั้งตามกติกาขนาน)**
- `src/lib/modules/member/index.ts` — เพิ่ม `export * as notifications from "./notifications";` ท้ายไฟล์
- `src/lib/modules/member/nav.ts` — `MEMBER_SETTINGS_NAV.notifications.status` = `"soon"` → `"ready"` (ตัด `wo: "M3.6"`)
- `src/lib/outbox-consumers.ts` — เพิ่ม helper `notifyMember()` + ต่อสาย 6 event: `member.created`→WELCOME · `point.earned`→POINTS_EARNED · `point.expiring`→POINTS_EXPIRING · `member.tier.changed`→TIER_UP (เฉพาะเลื่อน**ขึ้น** — เทียบ `sortOrder`) · `member.tier.at_risk`→TIER_AT_RISK · `voucher.issued`→VOUCHER_NEW (ข้าม origin CAMPAIGN/JOURNEY) · `stamp.completed`→STAMP_COMPLETE · เพิ่ม import `formatThaiDate` จาก `@/lib/ui/date`
- `src/lib/platform/cron.ts` — เพิ่ม `notificationsDue(now)` (เรียก `notifications-cron.ts#runDueAllSystems`)
- `src/app/api/cron/hourly/route.ts` — เรียก `notificationsDue` ทุกชั่วโมง (best-effort เหมือนตัวอื่นในไฟล์เดียวกัน)
- `src/lib/core/scope.ts` — ลงทะเบียน `MemberNotification: tenant` (แขวนกับ customerId แบบเดียวกับ `MemberConsent`/`MemberAccessLog`)
- `src/lib/member-journey-senders.ts` — เพิ่ม export `notificationSenders` (ตัวส่งจริง 4 ช่องทาง — **ใช้ประตูเดิมซ้ำทั้งหมด**: `chat.pushToContact` · `core/email.sendEmail` · `core/sms.getSmsProvider` · `core/push.sendPushToCustomerTokens` — ไม่มีตรรกะส่งใหม่ ต่างจาก `journeySenders` แค่ไม่มี precheck ซ้ำเพราะเอนจินนี้เช็คยินยอม/ปลายทางเองครบแล้วก่อนเรียก deps)

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.6` (ตัวจริง ไม่แตะ) | **2/4** — ค้างที่ S2.2 เพราะบั๊กในข้อสอบเอง (ดู §3 ข้อ 1) ทำให้ script โยน uncaught exception หยุดทั้งชุดตั้งแต่ S2.2 เป็นต้นไป · S1.1/S1.2 ผ่าน · S2.1 ตก (บั๊กข้อสอบ ดู §3 ข้อ 2) |
| **หลักฐาน**: รันสำเนา `scripts/tmp-m36-probe.mts` (ลบทิ้งแล้ว ไม่ใช่ของส่งมอบ) แก้ 3 จุดที่เป็นบั๊กของข้อสอบเอง (§3) → **14/19** เหลือ 5: S2.1 (บั๊กข้อสอบ §3.2) · S4.1/S5.1 (บั๊กข้อสอบ §3.3 — เงื่อนไข self-contradiction) · S8.3/S8.4 (ภาพ/parity = งาน Fable) | |
| `pnpm exec tsc --noEmit` | ✅ ผ่าน (0 error) |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (ไม่มี env) | ✅ 26/26 |
| `qc-member-m3.2` | ✅ 27/27 |
| `qc-member-m2.2` | ✅ 15/15 |
| `qc-member-m2.5` | ✅ 26/26 |
| `qc-member-m1.12` | ✅ 14/14 |
| `prisma migrate deploy` (QC) | ✅ applied `20261029000000_member_v2_h2` |
| `prisma migrate diff` หลัง deploy | ✅ `-- This is an empty migration.` (schema.prisma กับ DB ตรงกันครบ ณ ตอนส่งมอบ — M3.4/M3.5 migrate ของตัวเองไปแล้วเช่นกัน) |

## 3. ข้อแย้ง / จุดที่สัญญาชนกับข้อสอบ (Fable ตัดสิน)

### 3.1 🔴 CRITICAL — `mkCust()` สร้าง `MemberChannelIdentity` ไม่ครบฟิลด์บังคับ → ไม่มี LINE identity ให้ทดสอบเลยทั้งไฟล์ + ทำให้ script ล้มกลางทาง
บรรทัด 73 ของข้อสอบ:
```js
if (o.line) await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: c.customerId, channel: "LINE", externalId: `U-nt-${tag}-...` } }).catch(() => null);
```
`MemberChannelIdentity.linkedBy` เป็น `MemberLinkMethod` **ไม่มี default ไม่ nullable** (`prisma/schema/member.prisma:550`) แต่ค่าที่ส่งไม่มีฟิลด์นี้เลย ⇒ Prisma โยน validation error ทุกครั้ง ถูกกลืนเงียบด้วย `.catch(() => null)` ⇒ **ไม่มีลูกค้าคนไหนในทั้งไฟล์มี LINE identity จริงเลยสักคน** (X/Y/Z/W ทุกคนที่ `o.line: true`)
- หลักฐานตรง ๆ: สร้างสคริปต์ probe แยก (`scripts/tmp-probe-identity.mts`, ลบแล้ว) เรียก `prisma.memberChannelIdentity.create()` ด้วยชุดข้อมูลเดียวกัน (ไม่มี `linkedBy`) บน QC DB จริง → ได้ `Invalid prisma.memberChannelIdentity.create() invocation ... Argument linkedBy is missing`
- ผลที่ตามมา: ทุกช่อง LINE ของทุกคนกลายเป็น SKIPPED "ไม่มีช่องทาง" แทนที่จะ SENT/QUEUED ตามที่ข้อสอบคาดหวัง (S2.2 เป็นข้อแรกที่พังชัดเจน) และ S2.2's message string (`JSON.stringify(dX.calls.line[0]).slice(...)`) ทำให้เกิด `TypeError: Cannot read properties of undefined (reading 'slice')` เพราะ `dX.calls.line[0]` เป็น `undefined` (ไม่เคยถูกเรียกเลย) — exception นี้ไม่ถูกจับใน `chk()` (คำนวณ `act` string ก่อนเรียก) ⇒ **หลุดออกจาก try/catch ใหญ่ ทำให้ทั้งไฟล์หยุดตั้งแต่ S2.2** (เห็นเป็น `M3.6-ERR`)
- **ทำสำเนาทดสอบ**: เติม `linkedBy: "MANUAL"` ใน `mkCust` ของสำเนา (`scripts/tmp-m36-probe.mts`, ลบทิ้งแล้วหลังใช้งาน) → LINE ทำงานถูกต้องทันที ผ่านต่อไปถึง S3–S7 ครบ (ดู §2)
- **ข้อเสนอ**: เพิ่ม `linkedBy: "MANUAL"` ที่บรรทัด 73 ของข้อสอบจริง — ไม่กระทบเจตนาของข้อสอบข้อไหนเลย (แค่ทำให้การสร้างข้อมูลทดสอบสำเร็จตามที่ตั้งใจ)

### 3.2 🟠 MAJOR — S2.1 เทียบ `vars.ชื่อ` กับ `E.members[0].firstName` แต่ `member-expected.json` ไม่มีคีย์ `firstName`
`scripts/member-expected.json` §`members[]` มีเฉพาะ `{index, id, memberCode, partyId, phone, email, tier, unit, tierDefId}` — ไม่มี `firstName` เลยสักแถว (ตรวจแล้วทั้งไฟล์) ⇒ `E.members[0].firstName` เป็น `undefined` เสมอ ในขณะที่ `buildVars()` ของผมคืนค่าจริงจาก DB (เช่น `"ธนกร"`) ⇒ `vars.ชื่อ === E.members[0].firstName` เป็น `false` เสมอไม่ว่า implementation จะถูกแค่ไหน (ยืนยัน: rerun 2 ครั้งได้ `vars.ชื่อ` ตรงกับ DB จริงทุกครั้ง แต่เทียบกับ `undefined` ไม่มีทางผ่าน)
- **ข้อเสนอ**: เติม `firstName` ลงใน `member-expected.json` (ให้ตรงกับ seed จริง) หรือแก้ S2.1 ให้เทียบกับ `firstName` ที่ query จาก DB ตรง ๆ แทน `E.members[0].firstName`

### 3.3 🟠 MAJOR — S4.1/S5.1: เงื่อนไข `dQ.calls.line.length < 1` และ `dQ.calls.line.length === 1` ถูก AND กันในเช็คเดียว (self-contradiction — ไม่มี implementation ไหนผ่านได้)
`rq`/`early`/`rqA`/`late`/`rqB` (S4.1) และ `dq`/`dig`/`dqA`/`digRow` (S5.1) ถูก `await` คำนวณเป็น **statement แยกก่อนถึงบรรทัด `chk()`** ทั้งหมด (ไม่ใช่ lazy ภายใน boolean expression) ⇒ ตอนที่ตัวแปรถูกอ้างในเงื่อนไข ทั้ง `early`/`late` (หรือ `dig`) ได้รันจบไปแล้วจริง แปลว่า ณ จุดเดียวกันนั้น `dQ.calls.line.length` มีค่าเดียวคงที่ค่าหนึ่ง แต่ข้อสอบเช็คทั้ง `< 1` (ต้องเป็น 0) **และ** `=== 1` (ต้องเป็น 1) พร้อมกันในเช็คเดียวกัน — เป็นไปไม่ได้พร้อมกันเสมอ
- หลักฐาน: เพิ่ม `console.log` แยกทีละเงื่อนไขในสำเนา (`scripts/tmp-m36-probe.mts`, ลบแล้ว) พบ `c4 (length<1) = false, c9 (length===1) = true` เสมอ — ระบบทำงานถูกต้องตามสัญญา (เลื่อน/รวม/ส่งจริงครบตามลำดับ 7 ขั้น) เพียงแต่ตัวเช็คขัดกันเอง
- **ข้อเสนอ**: แยกเช็ค `dQ.calls.line.length < 1` ไปไว้ "ทันทีหลัง `sq`" (ก่อน `early`/`late`) เป็นคนละ `chk()` หรือคนละตัวแปรอ่านค่า ณ จุดนั้นเก็บไว้ก่อน แล้วค่อยเทียบ `===1` หลัง `late`

### 3.4 🟠 MAJOR — W ("ไม่มีเบอร์") สร้างด้วย `phone:false` โดยไม่ให้ `email` → ชน validation จริงของ `createMember` ("ต้องมีเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง")
`mkCust("ไม่มีเบอร์", { line: true, phone: false, consents: ["LINE", "SMS"] })` ไม่ส่ง `email` เลย ⇒ `createMember` (`profile.ts:656`) throw ทันที (กติกาที่มีอยู่แล้วของระบบ ไม่ใช่ของใหม่ที่ผมเพิ่ม) — พิสูจน์แล้วว่าเป็นเหตุผลจริงจาก stack trace ตรง ๆ (`at Object.createMember (profile.ts:656:11)`)
- **ทำสำเนาทดสอบ**: เติม `email: true` ให้ W ในสำเนา → ผ่านต่อจน S7.2/S7.3/S8.1 ครบ (ดู §2) — ยืนยันว่า SMS "ไม่มีช่องทาง" ทำงานถูกต้องตามสัญญา
- **ข้อเสนอ**: เติม `email: true` ให้ W ในข้อสอบจริง (ไม่กระทบเจตนาทดสอบ "ไม่มีเบอร์" เลย เพราะ SMS อ่านจาก `phone` ไม่ใช่ `email`)

### 3.5 🟡 MINOR — S8.3 คาดหวัง thana ได้ 403/302/307 แต่หน้าตั้งค่าอื่นทั้งโมดูล (fields/privacy/points/sources/api) ใช้ `notFound()` (404) เป็นกติกาตายตัว §6.4 "404-not-403"
ผมเลือกทำหน้า `/member/settings/notifications` ด้วย `notFound()` เหมือนหน้าตั้งค่าพี่น้องทุกหน้า (`fields/page.tsx`/`points/settings/page.tsx` เป็นต้น — comment มาตรฐาน "404-not-403 (§6.4)") แทนที่จะฝืนทำ 403/redirect เฉพาะหน้านี้หน้าเดียว เพราะ (1) การใช้ `redirect()` จริงจะได้ 307 ก็จริง แต่ Playwright ของ `visual-member.mts` (ใช้ `page.goto()`) จะรายงานสถานะของหน้าปลายทางหลังตามรีไดเรกต์ ไม่ใช่ 307 ดิบ ⇒ วัดไม่ได้ตามที่ข้อสอบเขียนไว้จริง ๆ อยู่ดี (2) การได้ 403 จริงต้องเปิด `experimental.authInterrupts` ใน `next.config.ts` ซึ่งไม่มีในโปรเจกต์วันนี้และไม่อยู่ในขอบเขตไฟล์ของใบนี้ (3) ทำให้หน้านี้ต่างกฎกับพี่น้องทั้งโมดูลโดยไม่มีเหตุผลทางธุรกิจ
- **ข้อตัดสิน**: คงกติกา 404 ไว้เหมือนเดิม ยอมรับว่า S8.3 ส่วน thana จะไม่ผ่านตามตัวอักษร — ถ้า Fable ต้องการ 403/redirect จริงต้องตัดสินระดับแพลตฟอร์ม (เปิด `authInterrupts` หรือแก้ข้อสอบให้ยอมรับ 404 เหมือนหน้าอื่น) ไม่ใช่เรื่องที่ควรแก้เฉพาะหน้าเดียว

## 4. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด)

1. **ค่าเริ่มต้นช่องทางต่อเหตุการณ์เป็น "LINE/EMAIL/PUSH = true, SMS = false" ทุกเหตุการณ์ (ไม่ตามภาพ 30 เป๊ะทุกแถว)** — ภาพ 30 วาดให้ "ได้แต้ม" มีอีเมล ✗ และ "ใกล้ลดระดับ"/"ขอรีวิว" มี push ✗ แต่หัวข้อสอบ (บรรทัด comment) เขียนชัดว่าค่าเริ่มต้นคือ "LINE/EMAIL/PUSH enabled true · SMS enabled false" และคณิตของ S5.1 (digest) ต้องการ `digested >= 4` (LINE 2 + EMAIL 2) จากเหตุการณ์ POINTS_EARNED โดยเฉพาะ ซึ่งเป็นไปไม่ได้ถ้า EMAIL ปิดอยู่ ⇒ ยึดคำอธิบายข้อสอบ+คณิตที่วัดได้จริงเป็นหลัก ไม่ใช่ภาพประกอบ (ที่อาจแค่โชว์ตัวอย่าง "หลังตั้งค่าเอง" ไม่ใช่ค่าเริ่มต้นจริง) — เก็บที่เดียวใน `notifications-shared.ts#DEFAULTS` แก้ภายหลังได้ง่ายถ้า Fable ต้องการให้ตรงภาพเป๊ะ (แค่สลับ `enabled` ต่อแถว)
2. **`notifyMember()` (composition root ใน outbox-consumers.ts) resolve ระบบสมาชิกจาก `Customer.memberSystemId` เสมอ ไม่ใช้ `evt.systemId` ตรง ๆ** — เหตุการณ์ `point.earned`/`point.expiring` ถูกยิงด้วย systemId ของ**ระบบแต้ม** (SystemType.POINT แยกจาก MEMBER) แบบเดียวกับที่ `journeys.ts#runForEvent` จัดการอยู่แล้ว (ไม่พึ่ง `evt.systemId`) — คัดลอกแพทเทิร์นเดียวกัน
3. **`voucher.issued` ข้าม origin `CAMPAIGN`/`JOURNEY`** ไม่ส่ง `VOUCHER_NEW` ซ้ำ เพราะทั้งสองที่มานี้ส่งข้อความของตัวเองที่ฝัง voucher อยู่แล้ว (M3.2 แคมเปญ/M3.3 journey) — ส่งซ้ำ = ลูกค้าได้ 2 ข้อความสำหรับ voucher ใบเดียว ที่มาอื่น (TIER/STAMP/REDEEM/COMPENSATION/REFERRAL/MANUAL/API) แจ้งตามปกติ
4. **`member.tier.changed` แจ้งเฉพาะ "เลื่อนขึ้น"** (เทียบ `MemberTierDef.sortOrder` เดิม/ใหม่) ไม่แจ้งตอนลด/คงระดับ/ตั้งระดับแรกเริ่ม (ไม่มี `from`) — ตรงกับ label ภาพ 30 "เลื่อนระดับ" (ความหมายเชิงบวก)
5. **`send()` ไม่ผูก `refId` ให้แถวที่ SKIPPED** (ผูกเฉพาะ QUEUED/SENT/FAILED) — SKIPPED (ไม่มีช่องทาง/ไม่ยินยอม/ปิดเทมเพลต) ไม่ใช่ "ความพยายามส่งที่แท้จริง" ของ refId นั้น ผู้เรียกที่กรองผลตาม refId จะไม่ปนกับช่องทางอื่นที่แค่ไม่มีทางส่งของ event เดียวกัน (แก้ปัญหา S4.1/S5.1's `rq`/`dq` ปนแถว PUSH SKIPPED จริง — ไม่เกี่ยวกับบั๊ก §3.3)
6. **`testSend()` ไม่ผ่านด่านยินยอม/quiet hours/สวิตช์เปิดปิด และไม่เขียนแถวลง `MemberNotification`** — เป็นการพรีวิวทันทีสำหรับผู้ตั้งค่า ไม่ใช่การส่งจริงที่ต้องนับสถิติ (ไม่ปนกับตัวเลข `stats()`) · ใช้ข้อมูลตัวอย่างสมมติ (สมชาย/Gold/1200 แต้ม) ไม่ใช่ข้อมูลลูกค้าจริง
7. **cron ทำงานทุก "ชั่วโมง" ไม่ใช่ทุก "15 นาที" ตามที่พิมพ์เขียวเขียน** — โปรเจกต์นี้มี Vercel Cron แค่ 2 ตาราง (รายวัน 20:00 UTC / รายชั่วโมง) ตาม §7.6 "ห้ามเพิ่ม cron ตัวใหม่" · digest/quiet-hours คลาดได้ไม่กี่สิบนาทีโดยไม่เสียหายเชิงธุรกิจ (ผู้ใช้ไม่รู้สึกต่าง) — จดเป็นหนี้ใน §5
8. **`MemberNotification` ไม่มี relation ผูก `Customer`** (ไม่มี `onDelete: Cascade`) — เป็นบันทึกเชิงระบบ (คล้าย log) ไม่ใช่ "ทรัพย์สิน" ของสมาชิกที่ PDPA ต้องลบตามตัว erase — แบบเดียวกับ `MemberAccessLog` ที่มีอยู่แล้ว
9. **`notifications-cron.ts` เป็นไฟล์เดียวในโมดูลสมาชิกที่ import composition root (`member-journey-senders.ts`) ตรง ๆ** (ไม่ผ่าน deps ที่ฉีดจากภายนอกเหมือนไฟล์อื่นในโมดูล) — เพราะเป็น "จุดเข้าของ cron" ไม่ใช่เอนจิน ไม่ข้ามเส้น F2 (composition root อยู่นอก `src/lib/modules/*` อยู่แล้ว ไม่ถูกสแกน) และตรงกับสัญญาที่ข้อสอบ S8.1 ตรวจหา (`src/lib/modules/member/notifications-cron.ts` ต้องมี `runDue` จริง)
10. **`stats()` เดือนไทยนี้นับรวมแถว `event="DIGEST"` เป็นส่วนหนึ่งของ `sent`/`byChannel`** (ไม่แยกนับต่างหาก) — แถว DIGEST คือการส่งจริง 1 ครั้งที่เกิดขึ้นจริงในเดือนนั้น สมควรนับเป็น "ส่งแล้ว" เหมือนกัน

## 5. หนี้ / เรื่องที่ยังค้าง

- 🔴 **3 บั๊กในข้อสอบ (§3.1–3.4) ทำให้ `qc-member-m3.6` ตัวจริงรันได้แค่ 2/4** (หยุดกลางทางจาก uncaught exception) — ต้องแก้ 4 จุดเล็ก ๆ ในข้อสอบก่อนถึงจะวัด implementation ได้ครบ (หลักฐาน/ข้อเสนอใน §3 พร้อมแล้ว)
- S8.1 ส่วน `/REVIEW_REQUEST/.test(rvsrc)` ต้องรอ M3.4 ส่งมอบ `src/lib/modules/member/reviews.ts` ก่อน (ยังไม่มีไฟล์นี้ในโครงการ ณ ตอนที่ส่งมอบใบนี้ — คนละ WO ทำงานขนานกันอยู่) — export/ทะเบียนของผม (`send`, `NOTIF_EVENTS.REVIEW_REQUEST`) พร้อมให้ M3.4 เรียกแล้ว
- SMS ยังไม่มีผู้ให้บริการจริง (ตามที่ M2.9/M3.2 จดไว้แล้ว) — ช่องทาง SMS ปิดทั้งระบบจนกว่าจะตั้ง `SMS_PROVIDER`/`SMS_API_KEY`/`SMS_ENDPOINT`
- PUSH ยังไม่มีทางให้ลูกค้าลงทะเบียนอุปกรณ์ (`MemberPushDevice`) จนกว่าจะถึง M3.11 (แอปลูกค้า) — ช่องทาง push วันนี้จะ SKIPPED "ไม่มีช่องทาง" เสมอในทางปฏิบัติ
- cron รอบความละเอียด 1 ชั่วโมงแทน 15 นาที (เหตุผล §4 ข้อ 7) — ถ้าธุรกิจต้องการเร่งจริง ต้องเพิ่มตาราง cron ใหม่ใน `vercel.json` (มติระดับ Fable/เจ้าของ ไม่ใช่ตัดสินเอง)
- ไม่มีหน้า/ปุ่มให้แก้ "เวลา" ของ quiet hours (from/to) ในหน้าตั้งค่า — วันนี้ล็อกที่ 21:00–08:00 ตามค่าเริ่มต้น แม้เอนจิน `setNotificationSettings` รองรับ from/to กำหนดเองแล้ว (UI ยังไม่มีอินพุตแก้เวลา — เพิ่มได้ง่ายทีหลัง)
- ตัวอย่าง "ตัวอย่างบน LINE" ในแผงขวาไม่ได้ทำเป็นบับเบิลแชทเหมือนภาพ 30 เป๊ะ (การ์ดข้อความล้วน ไม่มีวงกลม avatar ชื่อร้าน) — โครงถูกต้อง (ข้อความ+หัวเรื่องอีเมลเมื่อแท็บ EMAIL) แต่ยังไม่ตกแต่งเป็นบับเบิลจริง (หนี้ UI เล็ก รอ Fable ตัดสินว่าต้องปรับก่อน parity หรือไม่)
- แถบสรุปเดือนไม่มี "อัตราเปิด LINE" ตามภาพ 30 (ผมไม่ได้ทำ open-tracking ให้การแจ้งเตือน — มีแต่แคมเปญ M3.2 ที่มี pixel — ใส่ตัวเลขที่ไม่มีข้อมูลจริงรองรับ = แต่งข้อมูล จึงตัดออกแทนที่จะ mock)

## 6. ก่อน deploy prod (ฝากผู้คุมงาน)

Migration additive ล้วน (สร้างตารางใหม่ 1 ตาราง ไม่มี ALTER/DROP ของตารางเดิม) — ไม่มีความเสี่ยงข้อมูลเดิม ไม่ต้อง backfill (ตารางใหม่เริ่มว่าง)
```sql
-- ตรวจหลัง Vercel migrate deploy
SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20261029000000_member_v2_h2';
SELECT count(*) FROM "MemberNotification"; -- ต้อง 0 ตอน deploy ครั้งแรก
```
`migrate diff` บน QC ตอนส่งมอบได้ผล **empty** แล้ว (M3.4/M3.5 migrate ของตัวเองไปพร้อมกันแล้ว ณ ตอนที่ผมรันเช็ค) — ไม่มีรายการค้าง

## 7. ข้อมูลสำหรับถ่ายภาพ

ภาพที่ต้องถ่าย (ภาพ 30): `notifications-owner` (desktop + mobile) · `notifications-edit-owner` (desktop — คลิกแถว "แต้มใกล้หมดอายุ" ก่อนถ่าย) · `notifications-thana` (desktop)

สิ่งที่ตั้งใจให้ตรงภาพ 30:
- ตาราง 8 แถว: เหตุการณ์ (ป้ายไทยจาก `NOTIF_EVENTS`) · ชิป 4 ช่องทาง (LINE/อีเมล/SMS/push) พร้อมไอคอน ✓/✗ (`MemberIcon`) · คอลัมน์ "ส่งเมื่อ" (ทันที / รวมรายวัน HH:00) · คอลัมน์ "สถานะ" (ใช้งาน/ปิดอยู่)
- แถบใต้ตาราง: ข้อความ "ช่องทาง SMS: ยังไม่ได้ตั้งค่าผู้ให้บริการ SMS" (โชว์เมื่อ `smsAvailable=false` เท่านั้น) + แถบสรุปเดือนนี้ (ส่งแล้วต่อช่องทาง 4 ตัวเลข — ไม่มี "อัตราเปิด LINE" ดู §5)
- แผงขวา 480px: หัว "แก้เทมเพลต — <ชื่อเหตุการณ์>" + แท็บ 4 ช่องทาง + สวิตช์เปิด/ปิดเทมเพลตและช่องทาง + ช่องหัวเรื่อง/หัวข้อ (เฉพาะ EMAIL/PUSH) + textarea ข้อความ + แถวชิปตัวแปร (`{ชื่อ}` ฯลฯ) + กล่องตัวอย่างเรนเดอร์สด + (เฉพาะแต้มใกล้หมดอายุ) ปุ่ม "30 วันก่อน"/"7 วันก่อน" + สวิตช์ "ห้ามส่งช่วง HH:MM–HH:MM" + สวิตช์ "เคารพความยินยอมต่อช่องทาง" + ปุ่ม "ทดสอบส่งหาตัวเอง"/"บันทึก"
- มือถือ: กริดยุบเป็นคอลัมน์เดียว (`grid-cols-1 md:grid-cols-[minmax(0,1fr)_480px]` + `min-w-0` ทั้งสองฝั่ง) ตารางเลื่อนแนวนอนได้ในกรอบของตัวเอง (`overflow-x-auto` + `min-w-[640px]`) ไม่ดันหน้าล้น
- thana (ไม่มี `member.settings.manage`): `notFound()` → 404 (ดูข้อตัดสิน §3.5 — ต่างจากที่ S8.3 คาดหวัง 403/302/307)

จุดที่รู้ตัวว่าต่างจาก mockup (ยังไม่ได้เห็นภาพจริง — builder ห้าม build):
1. ค่าเริ่มต้นเปิด/ปิดต่อช่องทางไม่ตรงภาพทุกแถว (ดู §4 ข้อ 1)
2. "ตัวอย่างบน LINE" เป็นการ์ดข้อความ ไม่ใช่บับเบิลแชทมี avatar
3. ไม่มี "อัตราเปิด LINE" ในแถบสรุปเดือน (§5)
4. ไม่มีอินพุตแก้เวลา quiet hours (from/to) ในหน้าจอ — มีแต่สวิตช์เปิด/ปิด

ยังไม่ได้เห็นภาพจริง (builder ห้าม build) — เมื่อเทียบกับ mockup แล้วผ่าน ให้เติมบรรทัดผลตรวจ parity ตามรูปแบบของ common.md ไว้ใต้หัวข้อนี้

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~11:00 UTC · build QC หลังรวมทั้งชุด 3.4/3.5/3.6/3.9 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- รอบแรก **ตีกลับ** (desktop คอลัมน์สถานะถูกตัด · มือถือตารางถูกตัดทั้งแถบ · ปุ่มบันทึกไม่ใช่ปุ่มหลัก · ตัวอย่าง LINE ไม่เป็นบับเบิล + ใช้ "ร้านตัวอย่าง"/slug demo · ชิปเวลาส่งพื้นดำ · แถบสรุปไม่มีอัตราเปิด) → builder แก้แล้ว · ผู้คุมงานแก้ลิงก์ย้อนกลับที่ชี้หน้าไม่มีอยู่ (prefetch 404) เอง
- **notifications-edit-owner desktop (ภาพ 30)**: ตรง — ตาราง 8 เหตุการณ์ × ชิป 4 ช่อง (LINE/อีเมล/SMS/push ✓/✗) · ส่งเมื่อ (ทันที/รวมรายวัน 09:00) · สถานะ (ใช้งาน/ปิดอยู่) ครบ 4 คอลัมน์ · แถวที่เลือกเน้น · แผงขวา "แก้เทมเพลต — แต้มใกล้หมดอายุ" แท็บ 4 ช่อง · ข้อความ + ตัวแปร · ตัวอย่างบน LINE เป็นบับเบิล + วงกลม SD + "เปิดกระเป๋าสิทธิ์ →" · เวลาส่ง 30/7 วันก่อน (ชิปฟ้า) · ห้ามส่ง 21:00–08:00 · เคารพยินยอม · ทดสอบส่งหาตัวเอง + บันทึก (ดำ) · แถบล่าง LINE/อีเมล/SMS/push/อัตราเปิด LINE
- ต่างจาก mockup (ยอมรับ): แถบแท็บตั้งค่าย่อยของโมดูล (ฟิลด์ · ความเป็นส่วนตัว · … · API) · บรรทัดแจ้ง "SMS ยังไม่ได้ตั้งค่าผู้ให้บริการ" (D กติกา SMS ไม่มี provider = ปิด) · ช่องใช้งาน/ส่งทาง LINE เป็นเช็กบ็อกซ์บนแผง
- **notifications-owner mobile**: ไม่ล้น · ตารางกลายเป็นการ์ดต่อเหตุการณ์ (ชื่อ · ชิป 4 · ส่งเมื่อ · สถานะ) · แผงแก้ไขอยู่ใต้ตาราง
- **notifications-thana**: 404 (ไม่มี member.settings.manage · กติกา 404-not-403)
- **PARITY: ผ่าน**
