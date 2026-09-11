# M3.3 — journey อัตโนมัติ · โน้ตผู้ทำ

> builder: Opus 5 · 11 ก.ย. 2569 · worktree `shark-member` · ข้อสอบ `scripts/qc-member-m3.3.mts` (ไม่ถูกแตะ)
> รับช่วงไฟล์ค้างของ builder ก่อนหน้า (schema/migration/presets/shared/senders) — ตรวจกับข้อสอบทีละข้อแล้ว **แก้ 3 จุดใหญ่** (ดู §3.1–3.3)

## 1. ไฟล์ที่ส่งมอบ

**สคีมา / migration**
- `prisma/schema/automation.prisma` — enum `AutomationRunStatus` +`WAITING HOLDOUT SKIPPED CANCELLED` · `AutomationRule` +`holdoutPct` `reentryDays` `trigger` + relation `journeyRuns` · `AutomationRun` +`customerId journeyId stepIndex scheduledAt finishedAt payload eventKey` + relation `rule` (ผ่าน `journeyId` · Cascade) · `@@unique([ruleId, customerId, eventKey])` · index `[tenantId,status,scheduledAt]` `[ruleId,customerId,createdAt]`
- `prisma/migrations/20261027000000_member_v2_g3/migration.sql` — additive ทั้งใบ (ADD VALUE IF NOT EXISTS · ADD COLUMN · CREATE INDEX · FK บนคอลัมน์ใหม่ `journeyId`) · **ไม่มี DELETE แล้ว** · deploy บน QC แล้ว · `migrate diff` = `-- This is an empty migration.`

**เอนจิน / ไฟล์บริสุทธิ์ / action**
- `src/lib/modules/member/journeys.ts` (ใหม่) — `createJourney` `updateJourney` `toggleJourney` `deleteJourney` `duplicateJourney` `getJourney` `listJourneys` `createFromPreset` `runForEvent` `runDueWaits` `emitJourneyCronEvents` `dryRun` `dryRunDraft` `journeyStats` `journeyDetail` `journeyBuilderOptions` `canManageJourneys`
- `src/lib/modules/member/journeys-shared.ts` (บริสุทธิ์) — ทะเบียนทริกเกอร์/การกระทำ/ป้ายไทย · `flattenActions` (เลขขั้น = `stepIndex`) · ชนิดตัวส่ง (`consent`) · `JourneyActionResult`
- `src/lib/modules/member/journey-presets.ts` (บริสุทธิ์) — 6 สำเร็จรูป + `presetToDraft` + `JourneyBuilderInitial`
- `src/lib/modules/member/journeys-actions.ts` (`"use server"` · export เฉพาะ async function) — save / createFromPreset / toggle / duplicate / delete / dryRun (ทั้งตัวที่บันทึกแล้วและร่าง)
- `src/lib/member-journey-senders.ts` (ใหม่ · **composition root**) — ตัวส่งจริงปริยาย 5 ทาง (LINE `chat.pushToContact` · อีเมล `core/email` · SMS `core/sms` · push `sendPushToCustomerTokens` · การ์ด `kanban/links.createCardFromExternal`) — ย้ายมาจาก `member/journey-senders.ts` (ลบแล้ว) เหตุผล §3.2

**สาย/ทะเบียน (Edit เฉพาะจุด)**
- `src/lib/modules/member/index.ts` — facade export journey ทั้งชุด + ชนิด
- `src/lib/modules/member/limits.ts` — `automationRunsPerMonth: 5_000`
- `src/lib/outbox-consumers.ts` — `withAutomation` เรียก `runForEvent` ของ journey แบบ best-effort (try/catch + WARN · ส่ง `evt.id` ให้เอนจินอ่าน idempotencyKey · ตัวส่งโหลด dynamic) · consumer ใหม่ `booking.no_show` `member.birthday.upcoming` `member.inactive` `member.tier.review_due`
- `src/lib/automation/labels.ts` — 4 event ใหม่ (spread เข้า `WEBHOOK_EVENTS` เอง ⇒ ครบ 3 ทะเบียน)
- `src/lib/platform/cron.ts` — `journeyWaits(now)` (รายชั่วโมง) · `journeyCronEvents(now)` (รายวัน · เรียก **ก่อน** drain ใน `runDailyCron` · field ใหม่ `journeyEvents`)
- `src/app/api/cron/hourly/route.ts` — เรียก `journeyWaits` (field `journeyWaitsRan`)
- `src/lib/modules/booking/service.ts` — `setAppointmentStatus` NO_SHOW ยิง `booking.no_show` (idempotencyKey ผูกตัวนัด)
- `src/lib/modules/kanban/automation.ts` — `listRuns` แคบ status กลับเป็น `"OK" | "FAILED"` (enum ได้ค่าเพิ่มแล้ว DTO เดิม tsc แดง · แถวบอร์ดงานมีแค่ 2 ค่าเสมอ)
- `src/lib/modules/member/nav.ts` — `journeys` ใน `MEMBER_CAMPAIGN_NAV` · `journeys-new` + `campaigns-new` ใน `MEMBER_DEEP_NAV` (ตัวหลังคือหนี้ของ M3.2 ที่ `qc-nav-functions` S5 จับได้)
- `src/app/app/sys/[id]/member/promotions/page.tsx` — การ์ด Journey ลิงก์ไป `/member/journeys` (เดิม "เร็ว ๆ นี้")
- `scripts/gen-member-api-docs.mts` — คำอธิบาย webhook 3 event รอบเวลา · `docs/api/MEMBER-API.md` regen (F13.8)

**หน้าจอ**
- `src/app/app/sys/[id]/member/journeys/page.tsx` (ภาพ 07 บน) · `new/page.tsx` · `[journeyId]/page.tsx` (ภาพ 22 · `?edit=1` = ตัวสร้างแก้ไข)
- `src/components/member/JourneyBuilder.tsx` · `JourneysTable.tsx` · `JourneyDetail.tsx` (client ทั้ง 3 — import เฉพาะไฟล์บริสุทธิ์ + server action · grep แล้ว)

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.3` (ตัวจริง ไม่แตะ) | **2/3 → M3.3-ERR** — ข้อสอบตายที่ `mkCust` ตั้งแต่คนแรก (บั๊กข้อสอบ 2 จุด §4.1) |
| สำเนาชั่วคราวที่แก้ **เฉพาะ** 2 จุดของ §4.1 (`scripts/.qc33-local.mts` · ลบแล้ว) | **28/32** ×3 รอบ — เหลือ S8.2 (บั๊กข้อสอบ §4.2) + S9.2/S9.3/S9.4 (ภาพ/PARITY ของผู้คุมงาน) |
| `pnpm exec tsc --noEmit` | ✅ ของใบนี้สะอาด · เหลือ error เดิม `scripts/qc-crm-c1.1.mts(151)` หา `@/lib/core/teams` ไม่เจอ (มากับ commit `5cc4100` ชุดส่งต่อ CRM — ไม่เกี่ยวกับใบนี้) |
| `fitness.mts` (มี env / `env -u DATABASE_URL -u DIRECT_URL`) | ✅ 26/26 · ✅ 26/26 |
| `qc-member-m3.2` / `m3.1` / `m2.5` / `m2.2` | ✅ 27/27 · 20/20 · 26/26 · 15/15 |
| `qc-automation` (loadQcEnv) | ✅ 13/13 |
| `qc-kanban-k2.9` | ✅ 25/26 — S10.2 (ลบกฎแล้ว run เก่ายังอยู่) **ผ่าน** · ตกข้อเดียว S11.7 ภาพ (อยู่คนละ worktree — แดงเดิม) |
| `qc-member-m1.11` / `m1.3` / `m2.3` / `m2.8` | ✅ 26/26 · 14/14 · 22/22 · 30/30 |
| `qc-nav-functions` | ✅ 11/11 (ก่อนแก้ nav ตก S5 เพราะ `/member/campaigns/new` ของ M3.2) |
| `prisma migrate diff` หลัง deploy QC | ✅ empty migration |
| ของค้างบน QC หลังรันทุกรอบ (อ่านอย่างเดียว) | journey 0 · run ที่มี journeyId 0 · JOURNEY_STEP/REVIEW_REQUESTED 0 · PointLedger JOURNEY 0 · voucher JOURNEY 0 · event รอบเวลา/no_show 0 |

## 3. ข้อตัดสินใหญ่ที่เปลี่ยนจากไฟล์ค้างของ builder ก่อนหน้า

### 3.1 🔴 FK ย้ายจาก `ruleId` → `journeyId` (และ migration ไม่ต้อง DELETE อะไรบน prod อีกแล้ว)
ไฟล์ค้างผูก `AutomationRun.ruleId → AutomationRule ON DELETE CASCADE` + `DELETE` run กำพร้าก่อนผูก — **หักสัญญา K2.9**: `qc-kanban-k2.9` S10.2 บังคับ "deleteRule → กฎหาย · run เก่ายังอยู่ (ประวัติ)" (`automationRun.count({ruleId: rule2.id}) === 1` หลังลบกฎ) · Cascade จะลบประวัติบอร์ดงานทิ้ง
ข้อสอบ M3.3 S6.1 ต้องการ relation ชื่อ `rule` บน AutomationRun (`count({ where: { rule: { memberSystemId } } })`) ⇒ ผูก relation `rule` ผ่านคอลัมน์ใหม่ `journeyId` (nullable · ทุกแถวเดิม NULL) + Cascade:
- แถวบอร์ดงาน/POS ไม่ถูกผูก → พฤติกรรมเดิมเป๊ะ (ยืนยันด้วย k2.9 S10.2 ผ่าน)
- ลบ journey = run ของ journey หายตาม · โควตาเดือนนับ "run ที่ผูกกฎของระบบสมาชิกนี้" ได้ในคำสั่งเดียว
- migration ไม่มีแถวเดิมให้ตรวจ/ลบเลย

### 3.2 🔴 ตัวส่งจริงย้ายออกจากโมดูลสมาชิก → `src/lib/member-journey-senders.ts`
`member/journey-senders.ts` เดิม import `@/lib/modules/chat` + `@/lib/modules/kanban/links` = เส้น `member→chat` / `member→kanban` **ไม่อยู่ใน allowlist F2** (fitness แดง) ⇒ ย้ายไป composition root แบบเดียวกับ `member-bridges.ts`/`member-hooks.ts` แล้วฉีดผ่าน `deps` จาก 2 ทางเข้าจริง (คิว `withAutomation` + cron `journeyWaits`) · เรียกเอนจินตรงโดยไม่ส่ง `deps` = ขั้นส่งถูกบันทึก "ข้าม — ยังไม่ได้เชื่อมตัวส่งของช่องทางนี้" (ไม่ throw)
แก้บั๊กในไฟล์เดิมด้วย: `pushToContact({ systemId: memberSystemId })` ผิด — ช่องนั้นคือระบบ **แชท** (ChatChannelConnection.systemId) ⇒ ส่ง LINE ไม่ออกทุกครั้ง · ใช้ `null` แบบแคมเปญ M3.2

### 3.3 🔴 ยิง event รอบเวลา: ไม่คัดด้วยเงื่อนไขล่วงหน้า แต่หน่วงคนที่เพิ่งถูกข้าม 7 วัน
ข้อสอบ S2.5 ต้องการแถว SKIPPED (conditions) ของ I2/I3 ⇒ cron ต้องยิง event ให้คนที่ไม่เข้าเงื่อนไขด้วย · กันโควตาไหม้: คัดออกเฉพาะ (ก) เข้าไปแล้วในหน้าต่างเข้าซ้ำ (ข) เพิ่งถูก "ข้าม" ในเส้นนั้นภายใน 7 วัน (ตรวจใหม่สัปดาห์ละครั้ง) — ดูหนี้ §5 ข้อ 1

## 4. ข้อแย้งข้อสอบ (หลักฐาน) — ผู้คุมงานตัดสิน

### 4.1 🔴 `mkCust` (บรรทัด 78) + คนแรก X (บรรทัด 110) ตายตั้งแต่ S2.1 ⇒ ข้อสอบตัวจริงวัดได้แค่ S1.x
1. `birthDate: new Date(Date.UTC(...))` — `createSchema` ของ `member/profile.ts` บรรทัด 570 เป็น `z.string()` ⇒ `safeParse` ล้ม → `MemberInputError("ข้อมูลที่ส่งมายังไม่ครบตามแบบฟอร์มสมัครสมาชิก…")` (stack: `profile.ts:642` ← `qc-member-m3.3.mts:78` ← `:110`)
2. `source: "STAFF"` ไม่ใช่ `MemberSource` (enum: WALK_IN POS BOOKING …) — บั๊กเดียวกับที่แก้ใน M2.6/M3.1 (MEMBER-RUN §4 · 10 ก.ย. 19:45)
**แก้ที่เสนอ**: `source: "WALK_IN"` · `birthDate: new Date(Date.UTC(1990, in7.getUTCMonth(), in7.getUTCDate())).toISOString().slice(0, 10)` — สำเนาที่แก้แค่ 2 จุดนี้ได้ 28/32

### 4.2 🟠 S8.2 `holdout.entered === expHold.length` — ค่าคาดหวังถูกคิดตอน S4 แต่ข้อต่อจากนั้นยิง event ใส่ journey เดียวกันเพิ่ม
`jh` (at_risk · ไม่มีเงื่อนไข · holdout 50% · เปิดอยู่ตลอด) ได้ event `member.tier.at_risk` เพิ่มจาก S5 (R1 ×5) · S6.1 (Q1/Q2) · S6.2 (L1) ⇒ คนใหม่เหล่านี้ตกกลุ่มเทียบได้ตาม hash (โอกาสผ่านราว 1 ใน 4)
หลักฐาน (สำเนาชั่วคราว + บรรทัด debug): `jh HOLDOUT rows: hs,hs,hs,L1 | expHold 3` และอีกรอบ `hs,hs,hs,hs,R1 | expHold 4` · S4.1/S4.2 (วัดตอนนั้น) ผ่านทุกรอบ
**แก้ที่เสนอ**: เทียบกับ `(await runs(jh.id, { status: "HOLDOUT" })).length` ณ S8 หรือปิด `jh` หลัง S4 (`J.toggleJourney(ctx, owner, jh.id, false)`)

### 4.3 🟡 S2.1/S2.2/S7.2 เปราะช่วง 17:00–24:00 UTC
ข้อสอบคิด "วันเกิดอีก 7 วัน" จากวัน **UTC** (`in7.getUTCDate()`) แต่สัญญาให้ cron ใช้ **วันไทย** (idempotencyKey `…:${วันไทย}`) — ช่วงที่วันไทยล้ำวัน UTC ไป 1 วัน เป้าหมายจะห่างกัน 1 วัน ⇒ event ไม่เกิด · เสนอคิด `in7` จาก `Date.now() + 7h + 7d`

### 4.4 ⚪ S6.1 ต้นเดือนตามเวลาเครื่อง vs เดือนไทยของเอนจิน
ข้อสอบนับ `createdAt >= new Date(y, m, 1)` (เวลาเครื่อง = UTC) · เอนจินนับจากต้นเดือนไทย (เร็วกว่า 7 ชม.) — ต่างกันเฉพาะเมื่อมี run ของระบบนี้ในช่วง 17:00–24:00 UTC ของวันสิ้นเดือน · วันนี้ไม่มีผล จดไว้เฉย ๆ

### 4.5 ข้อสังเกตการเก็บกวาดของข้อสอบ
`finally` ลบของ journey เฉพาะของ `made.customers` · ถ้าชุด seed มีคนวันเกิดตรง 7 วันพอดี/หายไปนาน ≥ 60 วัน วันที่รันข้อสอบ `emitJourneyCronEvents` จะยิงให้คนใน seed ด้วย แล้ว drain ใน S2.3 จะให้แต้ม (PointLedger refType JOURNEY) + ไทม์ไลน์ JOURNEY_STEP ค้างกับคนใน seed · รอบนี้ตรวจแล้ว **ไม่มีค้าง** (§2) · เสนอเพิ่มใน finally: `pointLedger/pointLot refType JOURNEY` + `memberActivity type in [JOURNEY_STEP, REVIEW_REQUESTED]` ของ tenant

## 5. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด)

1. **ความยินยอม 2 ชั้น**: เอนจินหยุดเองเฉพาะ `REVOKED` (มีแถวแต่ถอน) · ตัวส่งจริงปริยายส่งเฉพาะ `GRANTED` (§7.1 เงียบ ≠ ยินยอม) + ต้องมีที่อยู่ — เหตุ: S2.6 บังคับ `deps.sms` ถูกเรียกให้ I1 และ S2.12 บังคับ `deps.email/push` ให้ N ทั้งที่ `mkCust` ให้ยินยอมแค่ LINE และไม่มีอีเมล/เครื่อง ⇒ ถ้าเอนจินบังคับ GRANTED+ที่อยู่เอง ข้อสอบ 2 ข้อนี้ตกแน่ · ของจริงยังเคารพ PDPA เพราะผ่านตัวส่งปริยายเสมอ · request มี `consent` + `to` ให้ตัวส่งตัดสิน
2. **แถวหลัก OK แม้บางขั้นส่งไม่ถึง** — S2.3 (ตัวส่ง LINE ปริยายบน QC ไม่มี LINE OA → ส่งไม่ออก) ต้องการ run OK · ผลรายขั้นอยู่ใน `detail` ("ทำแล้ว n/m ขั้น — ส่งข้อความ LINE: ไม่สำเร็จ (…)") และ `payload.steps` · FAILED เฉพาะเอนจินพังกลางทาง
3. **ลำดับด่าน** = กันวน → เข้าซ้ำ → โควตา → เงื่อนไข → กลุ่มเทียบ (ตามหัวข้อสอบ) · กันวน = unique(ruleId, customerId, eventKey) + insert ก่อนลงมือ (ชนกัน = ถอย) · คิว outbox ส่ง `id` มา เอนจินอ่าน `idempotencyKey` เอง ⇒ เรียกตรง/ผ่านคิวได้กุญแจเดียวกัน (S2.2 + drain ต่อมาไม่เบิ้ล)
4. **เข้าซ้ำ** นับเฉพาะแถวหลัก (stepIndex null) สถานะ OK/HOLDOUT/FAILED · `reentryDays` ต่ำสุด 1 (0 = วนได้ทุก event → เสี่ยงลูปกับ event ที่ journey ยิงเอง เช่น voucher.issued)
5. **โควตานับทุกแถว** (เข้า/ข้าม/กลุ่มเทียบ/ขั้นที่รอ) ของ journey ในระบบนี้ เดือนไทย — S6.1 ตั้งเพดาน = "นับทุกแถว + 1" ถ้าไม่นับแถวข้าม Q2 จะหลุดไปรัน
6. **ลูกค้าของ event** = `customerId` → `memberId` → `ownerCustomerId` → `buyerCustomerId` → `saleId` (PosSale.memberId) → `appointmentId` → `giftCardId` — `pos.sale.paid` มีแค่ `saleId` และห้ามแตะ tx POS (กติกา 0.2)
7. **ทะเบียนทริกเกอร์**: ตัด `campaign.sent`/`chat.contact.linked` (ไม่มีลูกค้าต่อ event / นอกตระกูลในสัญญา) · `review.*`/`referral.*` จะลงตอน M3.4/M3.5 ที่ยิงจริง (ทริกเกอร์ที่ไม่มีใครยิง = ร้านตั้งแล้วรอเก้อ) · `member.tier.review_due` ได้พารามิเตอร์ `daysBefore` (ค่าปริยาย 30 · อ่าน `Customer.tierReviewAt`)
8. **หายไปนาน** = `coalesce(lastActivityAt, createdAt) ≤ now − days` (คนสมัครเมื่อวานยังไม่มีกิจกรรมต้องไม่ถูกนับว่าหาย) · วันเกิด 29 ก.พ. ปีไม่อธิกสุรทิน = ได้วันที่ 28
9. **idempotencyKey ของ cron** = `journey-cron:${type}:${customerId}:${วันไทย}` + `:${ค่าพารามิเตอร์}` ต่อท้าย (ต่างจากรูปในสัญญาเล็กน้อย) — 2 journey "หายไป 60" กับ "หายไป 90" ต้องได้ event คนละใบในวันเดียวกัน · ข้อสอบนับจำนวน ไม่ได้ตรวจรูปกุญแจ
10. **WAIT_THEN**: ขั้นถัดไประดับเดียวกันทำต่อทันที (new_member ได้ WAITING +7 และ +30 จาก "ตอนนี้" ตาม S2.3) · ขั้นซ้อนตั้งเวลาจากเวลาที่ขั้นแม่ถูกทำจริง · `stepIndex` = เลขขั้นแบบไล่ลึกก่อน (`flattenActions`) ชุดเดียวกับสถิติ/การ์ด · จองแถวด้วย `updateMany(status WAITING, finishedAt null)` ⇒ cron ซ้อนไม่ทำซ้ำ (S3.3) · ifVoucherUnused ใช้ voucher ใบล่าสุดที่ออกก่อนถึงขั้นรอ
11. **NOTIFY_STAFF** ไม่ระบุ role/userIds = ใบเดียวแบบทั้งร้าน (S2.7 นับ +1 เป๊ะ) · ระบุ = รายผู้รับ (`recipientUserId`) · body มีแค่ชื่อ+รหัสสมาชิก ไม่มีเบอร์
12. **ADD/REMOVE_TAG เขียนตรง ไม่ยิง member.updated** — กัน journey ที่ฟัง member.updated วนตัวเอง · ลงไทม์ไลน์ JOURNEY_STEP แทน
13. **REQUEST_REVIEW = stub** (MemberActivity `REVIEW_REQUESTED` refType PosSale/Appointment ตาม event ต้นทาง) — M3.4 S7.2 จะเปลี่ยนเป็น `reviews.requestReview`
14. **สถิติ**: "ใช้สิทธิ์" = voucher ของ journey ถูกใช้หลังเข้า หรือซื้อ (PosSale PAID) ภายใน 30 วันหลังเข้า**ครั้งแรกในหน้าต่าง** · ยอด = บิลแรกในหน้าต่างนั้น · ต้นทุน = มูลค่า voucher ที่ถูกใช้ (FIXED = มูลค่าใบ · อื่น ๆ = `usedRef.discountSatang`) + ค่าส่งข้อความที่ส่งสำเร็จ (`JOURNEY_CHANNEL_COST_SATANG`) · **แต้มยังไม่คิดเป็นต้นทุน** · `usedPct` ฐาน = คนที่ได้รับจริง · กลุ่มเทียบ ฐาน = คนในกลุ่ม (สูตรเดียวกับแคมเปญ M3.2)
15. **ตาราง "ส่งเดือนนี้"** (`listJourneys.stats30d`) นับตั้งแต่ต้นเดือนไทยให้ตรงหัวคอลัมน์ภาพ 07 · `entered` ในแถว = คนที่ได้รับจริง (OK) · หน้ารายละเอียดใช้ 30 วันตามหัว "ผลลัพธ์ 30 วัน"
16. **ทดลองรัน**: ทริกเกอร์รอบเวลา = วันเกิดที่ตกในหน้าต่างย้อนหลัง N วัน / หายไปนาน ณ ตอนนี้ / รอบทบทวนภายใน daysBefore · ทริกเกอร์เหตุการณ์ = OutboxEvent ย้อนหลัง N วัน (≤ 5,000 ใบ) · ไล่ด่านเงื่อนไข → เข้าซ้ำ → กลุ่มเทียบ · คืน field เพิ่ม `skippedByReentry` `days` · `dryRunDraft` = ทดลองร่างที่ยังไม่บันทึก (ปุ่ม "ทดลองรัน" ในตัวสร้าง)
17. **ไม่ reuse `AutomationBuilder` ของบอร์ดงาน** — ไวยากรณ์คนละชุด (เงื่อนไข = engine กลุ่มลูกค้า · ทริกเกอร์มีพารามิเตอร์ · ขั้นซ้อน) และแก้ component บอร์ดงานเสี่ยง regression K2.9 · ใช้หน้าตาประโยคแบบเดียวกัน (ชิปดำ "เมื่อ" · ชิปเทา "และถ้า" · ชิปฟ้า "ให้ทำ/และ")
18. **ตัวสร้างบนหน้ารายการเติมตัวอย่างตามภาพ 07** (วันเกิด 7 วัน · ระดับ ≥ Silver · ยินยอม LINE · voucher + LINE + 100 แต้ม) — เป็นแค่ค่าเริ่มในจอ · preset `birthday` จริงไม่มีเงื่อนไข (ถ้ามี S2.1 ตก เพราะ X เป็นสมาชิกใหม่ระดับต่ำสุด)
19. **สิทธิ์**: เขียน = `member.promo.manage` เท่านั้น (ไม่รวม `marketing.campaign.create` แบบแคมเปญ — สัญญาระบุคีย์เดียว) · อ่าน/ทดลองรัน = read-โดยนัยของโมดูลสมาชิก · หน้า `/new` ไม่มีสิทธิ์เขียน = 404
20. **แก้ไข** = `/member/journeys/{id}?edit=1` (ตัวสร้างโหมดแก้) · **ทำสำเนา** = ใบใหม่ "(สำเนา)" ปิดไว้ก่อนแล้วพาเข้าโหมดแก้

## 6. หนี้ / เรื่องที่ยังค้าง

1. 🔴 **โควตาไหม้จากแถว "ข้าม"**: โควตา 5,000/เดือนนับแถวข้ามด้วย (ข้อสอบ S6.1 บังคับ) · ร้านที่มีคนหายไปนานแต่ไม่เข้าเงื่อนไข N คน = ~N×4 แถว/เดือน (หน่วง 7 วันแล้ว) · ถ้าผู้คุมงานเห็นว่าแถวข้ามไม่ควรนับโควตา ต้องแก้ S6.1 ก่อน แล้วสลับได้ใน `enterJourney` บรรทัดเดียว
2. แถว WAITING ที่ถูกจองแล้วเครื่องดับกลางทาง ค้าง WAITING+finishedAt ตลอด (ไม่ถูกหยิบซ้ำ — ตั้งใจเพื่อไม่ส่งซ้ำ) · ควรมีตัวกวาด "จองเกิน 1 ชม." → FAILED ให้เห็นในหน้า
3. `journeyDetail` เขียน `AutomationRule.journeyStats` ทุกครั้งที่เปิดหน้า (สรุปแคช) · `listJourneys` คิวรี ~4 คำสั่ง/journey (เพดาน 50 = ~200) — ย้ายไปคำนวณใน cron รายชั่วโมงได้ถ้าช้า
4. REQUEST_REVIEW stub → M3.4 · REST/AI op ของ journey → M3.10 (ข้อสอบ M3.10 เรียก `/member/journeys/presets` ฯลฯ)
5. อีเมลยังเป็นข้อความล้วน · SMS ไม่มีผู้ให้บริการ (ช่องปิด) · push ยังไม่มีทางลงทะเบียนเครื่อง (M3.11) — เหมือนแคมเปญ M3.2
6. แต้มจาก GIVE_POINTS ยังไม่คิดเป็นต้นทุนใน ROI (ต้องใช้อัตราแลกแต้มของร้าน — M3.8 รายงาน)
7. ข้อสอบ M3.7 วางแผนเพิ่ม `booking.no_show` เอง — ใบนี้ทำไปแล้ว (ครบ 3 ทะเบียน) ⇒ M3.7 ไม่ต้องทำซ้ำ
8. tsc แดงเดิม `scripts/qc-crm-c1.1.mts` (ไฟล์ `@/lib/core/teams` ยังไม่มี — งาน CRM Codex)

## 7. ก่อน push/deploy prod (ฝากผู้คุมงาน · อ่านอย่างเดียว · ห้าม builder แตะ prod)

migration **ไม่ลบ/ไม่ตรวจแถวเดิม** แล้ว (FK อยู่บนคอลัมน์ใหม่ `journeyId` ที่ทุกแถวเดิมเป็น NULL) ⇒ ไม่มีเงื่อนไขก่อน push · ชุด SQL ไว้ยืนยัน:
```sql
-- (ก่อน push · ข้อมูลประกอบเท่านั้น) run กำพร้าที่มีอยู่ — ใบนี้ "ไม่" ลบ/ไม่พึ่งค่านี้แล้ว
SELECT count(*) AS orphan_runs
FROM "AutomationRun" r
WHERE NOT EXISTS (SELECT 1 FROM "AutomationRule" u WHERE u."id" = r."ruleId");

-- (หลัง Vercel migrate deploy) ต้องได้ 1 แถว + ค่า enum ครบ 6 + ยังไม่มี run ของ journey
SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20261027000000_member_v2_g3';
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AutomationRunStatus' ORDER BY e.enumsortorder;
SELECT conname FROM pg_constraint WHERE conname = 'AutomationRun_journeyId_fkey';
SELECT count(*) AS journey_runs FROM "AutomationRun" WHERE "journeyId" IS NOT NULL;
```
หมายเหตุ: `ALTER TYPE … ADD VALUE IF NOT EXISTS` รันในทรานแซกชันได้บน PG 12+ และใบนี้ไม่ได้ **ใช้** ค่าใหม่ในไฟล์เดียวกัน (แบบเดียวกับ g2)

## 8. ข้อมูลสำหรับถ่ายภาพ

- harness มี `TMP33` แล้ว (สร้างสำเร็จรูป 6 เส้น · หน้า detail = เส้น `inactive` → การ์ดขั้นตอน 5 ใบ: เมื่อ · ถ้า · ให้ทำ (voucher + LINE) · รอ 7 วัน · หลังรอ 7 วัน (SMS))
- ภาพ 07 บน: หัว "โปรโมชัน — Journey อัตโนมัติ" + ชิป "holdout กลุ่มเทียบ 10%" + ปุ่มดำ "สร้าง Journey ใหม่" · กล่องตัวสร้าง (หัว "Journey ใหม่ — …" + ชิปฟ้า "ทดลองรันย้อนหลังได้" · แถวสำเร็จรูป 6 ปุ่ม · แถว เมื่อ/และถ้า/และ/ให้ทำ/และ/และ · "+ เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ" · ชื่อ journey + ทดลองรัน/ยกเลิก/บันทึก Journey) · ตาราง "Journey ที่เปิดใช้อยู่ · n แบบ · เดือนนี้" คอลัมน์ ส่งเดือนนี้/ใช้สิทธิ์/ยอดที่เกิด/ต้นทุน/ROI/สถานะ (สวิตช์)
- จุดที่รู้ตัวว่าต่างจาก mockup: มีแถว "เริ่มจากสำเร็จรูป" (ข้อสอบบังคับ testid `journeys-presets` บนหน้านี้) และแถวตั้งค่า holdout/เข้าซ้ำ/เปิดใช้ทันที เหนือแถวชื่อ journey · ตัวเลขตารางบน QC จะเป็น 0/— เพราะ journey ของ TMP33 เพิ่งสร้าง
- ภาพ 22: หัว "Journey: …" + ชิปสถานะ + สร้าง/แก้ไขล่าสุด + ปุ่ม แก้ไข/หยุดชั่วคราว/ทำสำเนา · ผลลัพธ์ 30 วัน 5 ช่อง · กล่องฟ้ากลุ่มเทียบ · ใช้สิทธิ์รายวัน (แท่ง 30 วัน) · เข้าล่าสุด (ตารางว่างบน QC = ข้อความ "ยังไม่มีใครเข้า journey นี้ใน 30 วันที่ผ่านมา")
- มือถือ: ทุกกริด `grid-cols-1`/`grid-cols-2` + `min-w-0` · select ในตัวสร้างเป็น `w-auto max-w-full` (คลาส `.input` เดิมเป็น `w-full`)

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. 07:55 UTC · build QC ครั้งที่ 2 หลังแก้ · เปิดดูทุกภาพเทียบ `07-promotion-journey.png` บน + `22-journey-detail.png`)_
- **journeys-owner desktop (ภาพ 07 บน)**: ตรง — หัว "โปรโมชัน — Journey อัตโนมัติ" + ชิป "holdout กลุ่มเทียบ 10%" + ปุ่มดำ "สร้าง Journey ใหม่" · กล่องตัวสร้าง (สายฟ้า + หัว + ชิปฟ้า "ทดลองรันย้อนหลังได้") · แถว เมื่อ(ชิปดำ)/และถ้า/และ/ให้ทำ/และ · "+ เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ" · ชื่อ journey + ทดลองรัน/ยกเลิก/บันทึก Journey · ตาราง "Journey ที่เปิดใช้อยู่ · 6 แบบ · เดือนนี้" คอลัมน์ครบ 7 + สวิตช์
- ต่างจาก mockup (ยอมรับ): แถว "เริ่มจากสำเร็จรูป" 6 ปุ่ม + แถว holdout/เข้าซ้ำ/เปิดใช้ทันที (ข้อสอบบังคับ testid) · เงื่อนไขเป็น select 3 ช่อง (ระดับ / เป็น / ≥ Silver) แทนชิปเดียว · **ไม่มีแถว "ออก voucher"** เพราะร้าน QC ไม่มีแบบ voucher ตอนถ่าย (`presetToDraft` ตัดขั้น voucher เมื่อร้านไม่มีแบบ — หนี้ UX: ควรโชว์แถวพร้อมคำชวน "สร้างแบบ voucher ก่อน" แทนตัดเงียบ) · ตัวเลขตาราง 0/— (journey เพิ่งสร้าง)
- **journey-detail-owner (ภาพ 22)**: ตรง — หัว "Journey: หายไปนาน — ดึงกลับ" + ชิปเปิดใช้งาน + สร้าง/แก้ไขล่าสุด · ปุ่มกรอบ แก้ไข/หยุดชั่วคราว/ทำสำเนา · ขั้นตอน 5 การ์ด + ลูกศร (เมื่อ · ถ้า · ให้ทำ · รอ 7 วัน · หลังรอ 7 วัน SMS) · ผลลัพธ์ 30 วัน 5 ช่อง · กล่องฟ้ากลุ่มเทียบ · ใช้สิทธิ์รายวัน 30 แท่ง · เข้าล่าสุด (ว่าง = ข้อความ)
- **แก้โดยผู้คุมงาน (รอบแรกต่างชัด 3 จุด)**: (1) 🔴 บั๊กจริง `numOr(undefined, 30)` คืน 0 (`Number("")`=0) ⇒ journeyDetail/journeyStats ที่ไม่ส่ง days คิดแค่ **1 วัน** (ภาพ 22 โชว์ "ใช้สิทธิ์รายวัน 1 วัน") → ว่าง/ไม่ส่ง = ค่าปริยาย (2) ปุ่ม `btn` ไม่มีกรอบ → `btn btn-ghost` 5 ปุ่ม (แก้ไข/หยุดชั่วคราว/ทำสำเนา/ทดลองรัน/ยกเลิก) ตาม mockup (3) มือถือ: ช่องข้อความ LINE หดเหลือกล่อง "สุ" → `basis-full sm:basis-0` · ช่องชื่อ journey เต็มแถวบนมือถือ
- **journeys-owner mobile**: ไม่ล้น (harness ไม่รายงาน overflow) · ตัวสร้างยุบเป็นแถวซ้อน · ช่องข้อความเต็มกว้าง · ตารางกลายเป็นการ์ดต่อ journey (ส่ง/ใช้สิทธิ์/ยอด/ต้นทุน/ROI + สวิตช์)
- **journeys-thana** (STAFF ไม่มี promo.manage): เห็นเฉพาะตาราง ไม่มีตัวสร้าง/ปุ่มสร้าง · สวิตช์ disabled · **noperm**: 404 ทั้ง desktop/mobile
- **PARITY: ผ่าน**
