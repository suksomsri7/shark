# RESOLUTIONS — คำตัดสินของผู้คุมหลังสำรวจ S0.1 (4 พ.ย. 2026) · ผูกทุกใบ S1.x/S2.x

ที่มา: `ledger/REVIEW-SECRETARY-DESIGN-2026-11-04.md` §3 K1–K20 + หมายเหตุ 8 ข้อ + §5 Q1–Q10 · §1.18 สิ่งที่แผนเขียนผิด
กติกา: **โค้ดชนะแบบ** · ทุกข้อด้านล่างมีผลเหนือข้อความในแผน §3 / แบบ §10 ที่ขัดกัน · ใบสั่งทุกใบต้องอ้างข้อที่เกี่ยว (R-K#) · builder ห้ามตีความใหม่

## A. คำตัดสิน K1–K20

| # | คำตัดสิน (บังคับ) | ใบที่รับไป |
|---|---|---|
| **R-K1** การมองเห็นห้อง | ขยาย `ConvSight` ใน `conversation-owner.ts` (ไฟล์เบา · ไม่มี db) เป็น `{own; ownerExtras; tenantAll: boolean; memberOf: ReadonlySet<string>}` · `sightOf`/`sightOfConfirmer` รับ `memberOf` (+ `tenantAll`) จากผู้เรียก · DB อ่านครั้งเดียวต่อ request ใน `secretary/rooms.ts` (`sightForUser(tenantId, membership)` = memberOf จาก `AiRoomMember` + tenantAll = role OWNER) · `visibleConversationWhere` เพิ่ม `OR id IN memberOf` และ (tenantAll) `OR id IN (AiRoom.conversationId where tenantId)` · OWNER เห็นทุกห้อง **เฉพาะห้องที่มีแถว `AiRoom`** — ห้อง `u~` เดิมของคนอื่นยังมองไม่เห็น ⇒ baseline `qc-ai-*` ไม่เปลี่ยน · รหัสห้องยังเป็นแหล่งความจริงของ "ผู้สร้าง" · `AiRoom.startedById` = denormalize ต้องเท่ากับ `conversationCreatorOf(id).id` (ข้อสอบ S1.4 ตรวจ) | S1.4 (+S1.6 ใช้ memberOf) |
| **R-K2** ผู้เขียนข้อความ | เพิ่มคอลัมน์ `AiMessage.authorUserId String?` (Q3 = ใช่ · Q9 ไม่มีร้านจริง) · เขียนใน `sendMessage` เฉพาะ `ctx.actor.kind === "member"` · ห้องเดิม = null · **ลำดับ deploy: migration ก่อนโค้ดเสมอ** (จดใน runbook S3a.2) | S1.1 · S1.5 |
| **R-K3** ชั้นความเสี่ยง | ไฟล์ pure `src/lib/ai/secretary/kind-class.ts`: `classOfKind(kind) → {destructive, money, customerFacing, piiExport}` derive จาก `DESTRUCTIVE_KINDS` + `kindAccessOf(kind).module` (account.* / pos refund = money · chat.send / crm email / member campaign = customerFacing · ไม่รู้จัก = money+customerFacing fail-closed) · **ไม่เพิ่มคอลัมน์ใน `AiProposal`** · `ALWAYS_APPROVE` = ค่าคงที่ในโค้ด (ปิดไม่ได้) · `AiApprovalRule` เก็บเฉพาะ 3 กฎตั้งค่าได้ (`chat.send` · `money.limit` + `limitSatang` · `pii.export`) · ในห้องเลขา `remember_fact/forget_fact/kb_auto_save` → ข้อเสนอ (`AiMemory.status = "PENDING"`) · `support_open_case` ยังเขียนทันที | S1.7 · S1.10 |
| **R-K4** ผู้อนุมัติ | ด่าน "role ≥ MANAGER + `membershipCan`" ใช้ **เฉพาะข้อเสนอที่ห้องมี `AiRoom`** (Q6 = ใช่) · hook เดียว `secretary/approval-gate.ts` เรียกใน `executeProposal` หลังด่านเดิม (proposals.ts ≈:400) · ผู้อนุมัติยังต้องผ่าน `assertCan` เดิมด้วยสิทธิ์ตัวเอง · ห้องเดิม = พฤติกรรมเดิม (`qc-ai-proposals` คงเขียว) | S1.7 |
| **R-K5** งานประจำ | `AiScheduledTask.ownerUserId String?` · `dispatch(ai_schedule_task)` ส่ง `userId` ที่มีอยู่แล้วเป็น `ownerUserId` · `runScheduledTasks`: แถวมี `ownerUserId` → โหลด `Membership` สด (`acceptedAt ≠ null` ไม่งั้นข้าม+จด) → `aiMemberActor` → `startRoom` (S1.4) → push `sendPushToUser(owner)` · แถว null = ทางเดิมทุกตัวอักษร · claim ก่อนรัน `updateMany({id, lastRunDay: {not: today}}) → {lastRunDay: today}` (X5) · **ตัด `minute` ออก** (R-K8) · `frequency DAILY/WEEKLY/MONTHLY` + `days Int[]` + `channels String[]` คงไว้ · รันที่รอบ `hourly` ของชั่วโมงที่ตั้ง (`hourBkk` เดิม) | S1.1 · S1.9 |
| **R-K6** โควตา = scope ที่สาม | ไม่ลบ `usage.ts` · เพิ่ม `scope: "jobs"` ใน `SendResult` + `quotaMessage` (ไทย "โควตางานเดือนนี้หมด…") · `AiUsage` รายวัน = ตาข่ายชั้นนอกคงเดิม · **ตัวนับงานอยู่ที่ `startRoom` ไม่ใช่ `sendMessage`** (Q3 ของเจ้าของ: สั่งเพิ่มในห้องเดิมไม่นับ) | S0.3 (สัญญา) · S1.13 |
| **R-K7** เงิน/แพ็กฟรี (Q1 = ใช่) | ด่านชั้นเดียวใน `credit.ts`: `canRunAi(tenantId, {scope: "job" \| "assist"}) → {ok, reason?}` = `(FREE_PACK.enabled && scope==="assist") \|\| (scope==="job" && jobsLeft > 0) \|\| balance > 0` · `sendMessage` :127 ใช้ `canRunAi` (ห้องเลขา = "job" ผ่าน `startRoom` ที่นับแล้ว · ห้องเดิม = "assist") · ผู้เรียกอื่น 20 จุดคงชื่อ `canSpend` แต่ภายใน = `canRunAi(…, "assist")` · ยังเขียน `AiCreditTxn` เป็นบันทึกต้นทุน (ยอดติดลบได้ตาม `chargeUsage` เดิม) · `ensureWallet` **ไม่สร้าง GRANT** เมื่อ `tenant.createdAt >= SECRETARY_LAUNCH_AT` (ค่าคงที่ใน `pack.ts`; ร้านเดิมคงยอด) · `GET api/mobile/usage` เปลี่ยนเป็นอ่านอย่างเดียว (`canSpendPeek`) | S0.4 (ค่าคงที่) · S1.13 |
| **R-K8** ราง worker (Q2) | **ตอบใน request + `after()`**: `POST …/rooms/[id]/send` สร้าง `AiRoomJob` แล้วรันทันทีใน request เดียวกัน (Next `after()` · Vercel ≤ 300 วิ) · job ค้าง (lease หมด) เก็บตกโดย `runRoomJobs()` ที่ผูกใน `api/cron/hourly` **และ** `api/cron/outbox` (S1.5 ต้องตรวจความถี่จริงของ outbox ใน deploy แล้วจดใน wo-notes) · SSE เดิม (`sendMobileChat`) คงไว้ · SLA ยกระดับ (S1.24) = คำนวณตอนอ่าน (`waitingMin` จาก `firstCustomerMessageAt`) + sweep ใน `outbox` · ไม่มี cron รายนาที | S1.5 · S1.9 · S1.24 |
| **R-K9/K10** OTP + เบอร์ (Q5 = ยืนยัน) | **ไม่แตะ core.prisma**: ตาราง `PhoneOtp(phone, codeHash, expiresAt, consumedAt?, attempts, ip?, createdAt)` + `UserPhone(userId @unique, phone @unique, verifiedAt?)` ใน `secretary.prisma` · axis **global** `g(...)` ใน `scope.ts` · โค้ดใน `src/lib/core/phone-auth.ts` (ไม่ import `@/lib/env` ตามแบบ `sms.ts`): `requestPhoneOtp(phone, ip) → {ok, resendAfterSec}` (6 หลัก · 10 นาที · 5 ครั้ง · rate-limit ต่อเบอร์+ip ด้วย `rate-limit-db.ts`) · `verifyPhoneOtp(phone, code) → {ok:true; userId: string \| null} \| {ok:false; reason}` · สมัครใหม่ = `prisma.user.create({email, name})` + `UserPhone` ใน tx เดียว · เบอร์ตรงบัญชีเดิม → เข้าใช้ · อีเมลซ้ำแต่เบอร์ใหม่ → ปฏิเสธข้อความไทย "อีเมลนี้มีบัญชีแล้ว เข้าด้วยอีเมลแล้วผูกเบอร์" (R8) · `sms.ts` เพิ่มโหมด `SMS_PROVIDER=mock` (เขียน code ลง `logOps` · คืน ok) · `GET api/mobile/me` เพิ่ม `phone` (nullable) ให้แอปบังคับผูกเบอร์ | S1.1 · S1.19 · S2.12 |
| **R-K11** เชิญพนักงาน | **ไม่สร้าง Membership จนกว่าจะรับ**: ตาราง `StaffInvite(tenantId, phone, name, role, unitAccess Json, permissions Json, codeHash, expiresAt (7 วัน), acceptedAt?, acceptedUserId?, invitedById, createdAt)` axis tenant · ลิงก์ `https://shark.in.th/i/<code>` ส่งด้วย `sendSms` · รับ = เข้าแอปด้วยเบอร์นั้น (R-K9) → หา `StaffInvite` phone ตรง + ยังไม่หมดอายุ → สร้าง `Membership(acceptedAt=now)` ผ่านตัวตรวจเดียวกับ `updateStaffAccess` (`validatePermissionInput` · `canAssignRole` · `canGrantUnitAccess` · `canGrantPermission`) ใน tx เดียว · **ไม่ต้องมี HrEmployee** · D1 แสดง "รอรับคำเชิญ" จาก `StaffInvite` · `UserPhone` ไม่มีฟิลด์เชิญ (ย้ายมาที่นี่ทั้งหมด) | S1.1 · S1.25 |
| **R-K12** Support จากแอป (Q7 = ใช่) | คอลัมน์ nullable บน `SupportCase`: `source String?` ("APP"/"WEB"/"AI") · `category String?` · `roomId String?` (อ้างอิง `AiRoom.id` · **ไม่ใช่** `conversationId`) · `addPlatformMessage` แทรกลงห้อง AI เฉพาะเคสที่ `source !== "APP"` (bridge เดิมคง · `qc-help-v2`/`qc-mobile-help` เขียว) · ใหม่ `listCasesForUser(ctx, userId, role)` = `openedByUserId = userId OR role === "OWNER"` (เคส `ai-assistant` → OWNER เห็น) · `listAllCases` รับ `{status?, source?, category?, assignee?}` · push ถึงผู้แจ้งจริง `sendPushToUser(openedByUserId)` · ในห้องเลขา `support_open_case` ส่ง `aiActorUserId(actor)` แทน sentinel `"ai-assistant"` · H4 "รับเรื่อง" = `assignCase(caseId, platformUserId)` ใหม่ · H4 "ระงับเลขาของร้าน" = ตั้ง `AiSystemAccess` ทุกโมดูล = OFF ผ่าน `setAccess` (ไม่มีธงใหม่ · ไม่ใช้ `suspendTenant`) | S1.1 · S1.17 · S2.16 |
| **R-K13** แชทลูกค้าหลายระบบ | route มือถือรับ `systemId?` (ไม่ส่ง = `resolveChatSystemId` ตัวแรก) + `GET api/mobile/inbox/systems` ให้แอปสลับ · ด่าน Bearer = `assertCan(membership, {module:"chat", action})` ด้วยค่าคงที่ `CHAT_READ_ACTION` และ `"chat.message.send"` ที่ **import จาก `guard.ts`/`permissions.ts`** (ห้ามพิมพ์สตริงซ้ำ) · cursor = พารามิเตอร์ `before?: Date` nullable ใน `listConversations`/`getThread` (ผู้เรียกเดิมไม่กระทบ) · แนบไฟล์ = route Bearer ใหม่ห่อตัวเดียวกับ `api/v1/chat/attachments` | S1.21 |
| **R-K14** คีย์สิทธิ์ (Q8 = แก้เอกสาร) | คีย์ตอบแชท = **`chat.message.send`** (ไม่สร้างคีย์ใหม่) · แก้แบบ §10 + แผน S1.24/S1.25/S2.10 · `eligibleResponders(tenantId, unitId)` = `listStaffAccess` ∩ `evaluate(m, {chat, "chat.message.send"})` ∩ `canAccessConvUnit` · `assign` รับ `opts.requireReplyPermission` (ปริยาย false = เดิม) · ผู้ช่วย/ส่งต่อ = `ChatConversationHelper` + ข้อความ `isInternal` (ไม่แตะ enum `ChatEventType`) | S1.24 · S2.10 |
| **R-K15** ส่งถึงลูกค้าโดยเลขา | `dispatch("chat.send")` → `sendReply({senderUserId: approverUserId, senderName: "Shark (ผู้ช่วย AI)", meta: {ai: {roomId, proposalId, approvedBy}}, body, clientMessageId: proposalId})` (unique `[conversationId, clientMessageId]` กันส่งซ้ำ) · เฉพาะผู้ติดต่อที่ `ChatContact.customerId` ผูกแล้ว · kind อยู่ใน `ALWAYS_APPROVE` ค่าเริ่มต้นเปิด (กฎ `chat.send` ปิดได้โดย OWNER) · ป้ายในห้องลูกค้าอ่านจาก `meta.ai` | S1.12 · S1.22 · S2.18 |
| **R-K16** เส้นสาธิตที่ 3 (Q4 = booking) | เปลี่ยนจาก "คืนมัดจำหอพัก" เป็น **"คืนมัดจำนัดหมาย (booking)"** = kind ใหม่ `booking.refund_deposit` เขียนมือ → `bookingSvc.refundDeposit` (`qc-booking-deposit` รองรับ) · dorm เลื่อนรุ่นถัดไป (จดแผน §7) · เส้นสาธิต 3 เส้น = (1) ใบเสนอราคา → ส่ง LINE ลูกค้า (`account.*` + `chat.send`) (2) ขายหน้าร้าน POS v2 + สมาชิกสะสมแต้ม (`pos.*`) (3) คืนมัดจำนัดหมาย | S1.12 · S1.14 |
| **R-K17** POS/SVC v2 | เครื่องมือเดิน v2 แล้ว · ไม่ต้องแก้ · S0.3 ระบุในสัญญา "เครื่องมือ SVC v2 ใหม่ (deposit/online/planner/no-show/dorm) = นอกขอบเขตรุ่นแรก ยกเว้น `booking.refund_deposit`" | S0.3 |
| **R-K18** Anthropic ตรง | `class AnthropicProvider(key, model) implements AiProvider` (Messages API · `system` แยก · tools → `input_schema` · `cache_control` บน system/tools · `usage.{input,output,cache_read_input,cache_creation_input}_tokens` รวมเข้า `tokensIn/tokensOut` เดิม) · `MODEL_IDS = {fast: {openrouter, anthropic}, smart: {…}}` · `pickModel` คืน **tier** (`"fast"\|"smart"`) · ผู้เรียกที่เทียบ `=== FAST_MODEL` เปลี่ยนเป็นเทียบ tier · env `AI_PROVIDER=anthropic\|openrouter` (ปริยาย openrouter จนกว่าเจ้าของส่งคีย์) + `SHARK_ANTHROPIC_KEY` · `pricing.priceOf` รู้จัก id Anthropic ตรง · ข้อสอบ mock ทั้ง 2 รูปแบบให้ผลเท่ากัน · `qc-ai-brain` ห้ามเปลี่ยน | S1.20 |
| **R-K19** แอป | ตามแผน S0.2/S2.13/S3a.2 · `EXPO_PUBLIC_API_URL` override เฉพาะ dev | S0.2 · S2.13 |
| **R-K20** push + prefs | `PushMsg` เพิ่ม `badge?: number` (ส่งต่อใน payload · hunk เดียวใน `core/push.ts`) · prefs = ตาราง `AiNotifyPref(userId, tenantId?, kind, mode)` axis global (ไม่แตะ `AppNotification`) · deep-link `data.link` ("/secretary/room/<id>" · "/inbox/<convId>" · "/help/<caseId>") + คง `data.conversationId` ให้ build เก่า · push ห้องเลขา = `sendPushToUser(userId)` ไม่กรอง tenant (A6 ข้ามร้าน) | S1.1 · S1.5 · S1.23 · S2.6 |

## B. หมายเหตุ 8 ข้อ → คำสั่ง
1. ทุกตารางใหม่ลง `src/lib/core/scope.ts` (F1) · axis **global** `g(...)`: `AiSecretary`, `UserPhone`, `PhoneOtp`, `AiNotifyPref` · ที่เหลือ axis tenant · ตาราง chat ใหม่ (`ChatRoutingRule`, `ChatShift`, `ChatConversationHelper`) axis tenant
2. ไม่เพิ่มค่า `AiCreditSource` — ห้องเลขาใช้ `CHAT` + แยกด้วย `AiCreditTxn.conversationId` (G5/B8 คำนวณจากนี้)
3. `plans.ts:148` ส่ง `userId` เข้า `runKind` (S1.8 — ไม่งั้น `AiActionLog.userId` ว่าง)
4. `AiTrainingSample` เพิ่ม `outcome String?`, `editedReply String?`, `stepsJson Json?`, `roomId String?`, `proposalId String?` (S1.1) · S1.15 ติดป้าย
5. `proposals.dispatch` handler ของ kinds ในห้องเลขาคืน `{note, entity?: {type, id, unitId?}}` — S1.8 รวม (A5 "ลิงก์ของจริง") · handler เดิมที่คืน string ยังรับได้ (normalize ใน hook)
6. endpoint โควตาใหม่ (S1.14 `GET …/secretary/quota`) **อ่านอย่างเดียว** ห้ามเขียนตอน GET
7. (รวมใน R-K12)
8. `core.prisma` คง FROZEN — ไม่ขอข้อยกเว้นในรุ่นนี้ (`User.phone` ❌ → `UserPhone`)

## C. คำตอบ Q1–Q10 (สรุป)
Q1 ใช่ (R-K7) · Q2 ตอบใน request + after() (R-K8) · Q3 เพิ่มคอลัมน์ (R-K2) · Q4 booking (R-K16) · Q5 ยืนยัน global (R-K9) · Q6 ใช่ (R-K4) · Q7 ใช่ (R-K12) · Q8 แก้เอกสาร (R-K14) · Q9 **`editProposal(id, byUserId, payloadPatch)` ใส่ใน S1.10** เฉพาะ kinds ของทะเบียน op (มี zod schema) · kind เขียนมือ = ตีกลับ+สั่งใหม่ · Q10 ใช่ทั้งสอง: S1.14 เพิ่ม `POST api/mobile/account/delete` → `deleteAccount` (+ `GET …/account/delete/preview`) · S1.25 เพิ่ม `moduleLevel(permissions, module) → "OFF"|"VIEW"|"USE"` นิยาม: OFF = ไม่มีคีย์ของโมดูล · VIEW = มีเฉพาะคีย์ลงท้าย `.read`/`.view` · USE = `<module>.*` หรือมีคีย์เขียน ≥ 1 (+ `setModuleLevel` ย้อนกลับ)

## D. แก้แผน/แบบ (ผู้คุมแก้เอง · ใบไม่ต้องทำ)
- แผน S1.1: `User.phone` ❌ → `UserPhone` · เพิ่ม `PhoneOtp`, `StaffInvite`, `AiNotifyPref` · `AiJobCounter(tenantId, month)` · ตัด `minute`
- แผน S1.19: ไม่ใช้ `AuthToken`/purpose ใหม่ → `PhoneOtp` + `core/phone-auth.ts` · `core/sms.ts` มีแล้ว (เพิ่ม mock)
- แผน S1.5/S1.9/S1.24: ไม่มี cron รายนาที (R-K8)
- แผน S1.25: `StaffInvite` แทน Membership ค้าง (R-K11) · `moduleLevel`
- แผน S1.12/S1.14: เส้นสาธิต 3 = booking (R-K16)
- แผน S1.17: ฝั่งร้าน = `src/lib/support/service.ts` · `listCasesForUser`
- แผน S1.10: + `editProposal` · S1.14: + `account/delete` · S1.23: `AiNotifyPref` + `badge`
- แบบ §10 + แผน S1.24/S1.25/S2.10: `chat.conversation.reply` → `chat.message.send`
- แผน S2.12: "OTP อีเมล 6 ช่อง" → "OTP SMS 6 ช่อง" (มติ 13)
- แผน §0: `proposals.ts` 1,451 · `tools.ts` 2,426 + `tools-pos.ts` · `usage.ts` ยังมีผู้เรียก (`quotaMessage`)
- แผน §7 (ตัดออก): dorm ในห้องเลขา · cron รายนาที

## E. ลำดับ deploy ที่ R-K2 บังคับ (ใส่ runbook S3a.2)
1. `prisma migrate deploy` (secretary_a) → 2. ตรวจ `_prisma_migrations` → 3. deploy โค้ด → 4. ตั้ง `SECRETARY_LAUNCH_AT` = เวลาที่ deploy จริง (pack.ts ค่าคงที่ · แก้ก่อน build prod) → 5. `SMS_PROVIDER` จริง · `AI_PROVIDER=anthropic` เมื่อมีคีย์

## F. คำตัดสิน UI (หลังรับ S0.2 · 4 พ.ย.)
- **R-UI1 สเกลจอ:** จอในภาพแบบกว้าง 536 px = 1.37× ของเครื่อง 390 dp · ทุกจอ S2 ใช้กติกาเดียวกับ C3 ของ S0.2: มุมโค้ง/ตัวอักษร = ค่าตาม `tokens.radii`/`tokens.type` (px ของแบบ) · ขนาดชิ้นส่วนจาก `tokens.size` (ปุ่มไอคอน 44 · ช่องสั่งงาน 56 · ปุ่มส่ง 44 · orb hero 76) · ตำแหน่ง/ระยะแนวตั้ง = แบบ × 0.73 (ค่าคงที่ `F` ใน `src/theme/index.ts` — S2.1 ย้ายจากไฟล์จอมาไว้ที่ธีม) · ตัวอักษรไม่ย่อต่ำกว่า `tokens.type` (อ่านได้บนเครื่องจริงสำคัญกว่าพิกเซลตรง) · ภาพคู่ตัดสินด้วยตา: ลำดับ/สัดส่วน/สี/ระยะตรงแบบ ±10 dp
- **R-UI2 ไอคอน:** `@expo/vector-icons` Feather (ไม่มี react-native-svg) · กระจก/ไล่สี = JS ล้วน (เว็บ backgroundImage+backdropFilter · มือถือ experimental_backgroundImage + boxShadow) · ไม่มี expo-blur · จอใหม่ import `@/src/theme/index` (ไม่ใช่ `@/src/theme` ที่ชี้ shim)
- **R-UI3 ธีม:** theme-store คีย์ `shark_theme` (เว็บ localStorage · มือถือ expo-secure-store) · S2.13 โหมดมืดใช้ store นี้ · S2.7 B2 ตั้งค่า

## G. ข้อยกเว้นหลัง S1.1 (4 พ.ย.)
- **R-S1.1a** core.prisma FROZEN ยกเว้น back-relation field 2 บรรทัดบน `User` (`secretary AiSecretary?` · `userPhone UserPhone?`) — ไม่มีคอลัมน์/SQL · เพื่อให้ FK Cascade ของ AiSecretary/UserPhone อยู่ใน schema (ไม่งั้น `pnpm drift` ขอ DROP)
- **R-S1.1b** ชื่อ migration ใช้ timestamp อนาคตต่อจากของ SVC (`20261227000000_secretary_a`) — migration ใบถัดไปของ RUN นี้ต้องชื่อ > 20261227000000 (เช่น 20261228000000_secretary_b)
- **R-S1.1c** `AiRoomMember`/`AiRoomJob` มี `tenantId` (tenantDb inject) — ใบ S1.4/S1.5/S1.6 ต้องใส่ตอน create
- **R-K8b (แก้ R-K8 หลังสำรวจเพิ่ม 4 พ.ย.)** มีราง "รายนาที" อยู่แล้ว = `src/lib/platform/minute-jobs.ts` (`registerMinuteJob` · รันโดย `scripts/crm-cron.mts minute` บน crontab VPS + hook ใน `/api/cron/outbox`) — S1.5 ลงทะเบียน `secretary.roomJobs` everyMinutes 1 เป็นตัวเก็บตก · ทางหลักยังเป็นตอบใน request + `after()` · S1.24 SLA sweep ใช้รางเดียวกัน (everyMinutes 5) · ไม่แตะ vercel.json
- **R-K3b (4 พ.ย.)** กฎ `AiApprovalRule` 3 ข้อ (`chat.send` · `money.limit`+limitSatang · `pii.export`) ในรุ่นแรก = เก็บ+แสดง+ใช้ในข้อความ "ทำไมต้องอนุมัติ" เท่านั้น — ไม่มีทางอัตโนมัติ (ทุกข้อเสนอยังต้องอนุมัติ · AUTO รุ่นถัดไป) · ผู้อนุมัติในห้องเลขา = OWNER/MANAGER (R-K4) · ห้องเดิมพฤติกรรมเดิม
- **R-S1.8a** UNDOABLE รุ่นแรก = kanban card create/move · crm deal move · booking appointment create (ก่อนเริ่ม) — ไม่มีของที่ส่งข้อความ/เงินออก · `dispatch` คืน entity ผ่าน out-param (ไม่เปลี่ยนชนิดคืนของ handler)
- **R-K18b (4 พ.ย.)** ไม่มี `@anthropic-ai/sdk` ใน node_modules และห้ามติดตั้ง ⇒ `AnthropicProvider` ใช้ raw fetch (Messages API 2023-06-01) · **คง `FAST_MODEL/SMART_MODEL` เป็น slug OpenRouter** (ผู้เรียกเทียบ `=== FAST_MODEL`) และแม็ปเป็น id ตรงตอน resolve (`claude-haiku-4-5` · `claude-sonnet-5`) · ไม่ส่ง temperature/thinking/tool_choice · refusal ⇒ throw ไทย · หนี้: pricing sonnet 5 ของเราคิด 3/15 (จริง 2/10) แก้ตอน S3a.2

## H. คำตัดสินหลังรีวิว S1.19 (2 ผู้ตรวจ · 4 พ.ย. ~19Z) — บังคับก่อน merge
- **R-S1.19a อีเมลตอนสมัครด้วยเบอร์ = ยังไม่ยืนยัน (CRITICAL A1/B5):** ห้ามสร้าง `User.email` = อีเมลที่ผู้ใช้พิมพ์ (ทุกทางที่หา user ด้วยอีเมล — OTP อีเมล · Apple/Google · grantStaffAccess — จะตกไปบัญชีของคนที่อ้างอีเมลนั้นก่อน) · สร้าง `User.email = "<E.164 ไม่มี +>@phone.shark.in.th"` (placeholder ที่ไม่มีใครเป็นเจ้าของ) + เก็บอีเมลที่พิมพ์ใน `User.prefs.pendingEmail` (ยังไม่ยืนยัน) · `core/email.ts sendEmail` ข้ามปลายทาง `@phone.shark.in.th` (ไม่ยิง Resend) · ยืนยันอีเมลภายหลัง = ใบย่อย S1.19b (OTP อีเมล → ย้าย pendingEmail เป็น User.email ถ้ายังว่าง) · `GET /me` คืน `email: null` + `pendingEmail` สำหรับบัญชีแบบนี้ · ยังตรวจ email_taken ตอนสมัคร (UX ตามแบบ R8) แต่ **นับเป็น attempt** (A6)
- **R-S1.19b** verify แบบขนาน: จอง attempt ก่อนเทียบ (`updateMany({id, consumedAt:null, attempts:{lt:5}}, {attempts:{increment:1}})` count 0 ⇒ locked) · รหัสถูก ⇒ ไม่คืน attempt (ลบ 1 คืนได้) — เอาแบบจองก่อนแล้วค่อยเทียบ
- **R-S1.19c** `SMS_PROVIDER=mock` ถูกเมินเมื่อ `APP_ENV === "production"` (คืน null)
- **R-S1.19d** เบอร์ = identity ต้องผ่าน normalizer เข้ม `normalizeThaiMobile(raw) → "+66[689]\d{8}" | null` (พับ `+660`/`660` → `+66` · ปฏิเสธรหัสประเทศอื่น) ใช้ในทุกฟังก์ชัน phone-auth · `toE164Thai` เดิมคงไว้ให้แคมเปญ
- **R-S1.19e** ผูกเบอร์ (link): ได้เฉพาะเมื่อบัญชียังไม่มีเบอร์ หรือเบอร์เดิมของตัวเอง · มีเบอร์อื่นอยู่แล้ว ⇒ 409 `phone_change_locked` "เปลี่ยนเบอร์ต้องติดต่อทีมงาน" (step-up = รุ่นถัดไป)
- **R-S1.19f** ขอรหัสซ้ำภายใน 60 วิ (มีแถวที่ยังไม่ใช้และยังไม่หมดอายุ) ⇒ ok โดยไม่สร้างแถว/ไม่ส่ง · `resendAfterSec` = วินาทีที่เหลือ · เพดานต่อเบอร์ต่อวัน 20 แถว ⇒ rate_limited · แถวที่ส่งล้มเก็บไว้ (consumedAt ตั้ง · นับใน rate-limit)
- **R-S1.19g** ไม่มีผู้ให้บริการ SMS (prod ยังไม่ตั้ง) ⇒ `POST sms/request` ตอบ **503 `sms_unavailable`** ข้อความไทย (สถานะรวมทั้งระบบ ไม่รั่วข้อมูลต่อเบอร์) — แอปสลับไปทางอีเมล
- **R-S1.19h** `code` ตัดให้เหลือตัวเลขก่อนเทียบ · consume + สร้างบัญชี/ผูกเบอร์ใน `$transaction` เดียว · doc แก้ตามรีวิว B12 · หนี้: index `PhoneOtp(ip, createdAt)` → migration `secretary_b` · ทางตัน phone_taken ตอน link → S2.12 แสดงข้อความติดต่อทีมงาน
## I. หนี้จากรีวิวย้อนหลัง S1-2 (ผู้ตรวจ D · 4 พ.ย.)
- FIX-NOW: `service.ts` `secretaryOf(...).catch(() => null)` → ฝากใบ S1.5 (กำลังแตะไฟล์)
- ก่อน S1.14: (1) `upcoming_schedule`/`growth_recommendations` อ่านข้ามโมดูล — ต้องเคารพ access (ส่ง ctx.access เข้า tool หรือ extra-modules list) (2) `propose_plan`/executePlan ตรวจ `kindAllowedByAccess` ทุกขั้นก่อน claim (ไม่งั้นแผนรันครึ่งเดียวแล้ว FAILED) (3) route คีย์ API `/api/v1/ai/tools*` ส่ง access · ข้อเสนอประตู CRM ผ่านด่านระดับ
- ต่อมา: identity.ts ปฏิเสธ zero-width/RTL + นับ grapheme · accessLevelGate ห่อ error เป็นไทย

## J. คำตัดสินหลังรีวิว S1.6 (2 ผู้ตรวจ · 4 พ.ย. ~23Z)
- **R-S1.6a** ข้อเสนอ/แผน PENDING ที่ `createdAt < addedAt` ของสมาชิก seeHistory=false = มองไม่เห็น (listPendingProposals · listPendingPlans · rejectProposal · executeProposal/executePlan ตอบเหมือนไม่มี)
- **R-S1.6b** ข้อความระบบในห้อง (🔔/🔁) เขียน `authorUserId = "system"` (ไม่ใช่ null) · ไม่นับ unread (listRooms · mobile/conversations) · ไม่ป้อนเข้า history ของโมเดล
- **R-S1.6c** สมาชิกที่ Membership `acceptedAt = null`: ไม่ได้ push (`roomPushRecipients(tenantId, roomId)` ใน members.ts = ผู้เปิด ∪ สมาชิกที่ accepted — worker ใช้ตัวนี้) · ไม่โผล่ใน listMembers · ไม่นับ cap · roomSightFor ไม่รวมห้องของ membership ที่ถูกถอน (ถอนแล้วเข้าไม่ได้อยู่แล้ว — บันทึกไว้)
- **R-S1.6d** ข้อความ: OWNER เพิ่มตัวเอง = self ด้วยข้อความ "คุณเห็นทุกห้องอยู่แล้ว" · ผู้เปิดห้องออกเอง = forbidden "ผู้เปิดห้องออกไม่ได้ — ปิดห้องแทน" · เพิ่มซ้ำหลังถูกเอาออก = แถวใหม่ (seeHistory ตามที่เลือก) — จดใน D3
- หนี้: ตอบหลังถูกเอาออกกลางทาง (re-check ก่อนบันทึก) · title/contextJson ของห้องเห็นได้โดยสมาชิก seeHistory=false (ยอมรับ · แจ้งใน D3) · event `ai.room.member_added` → ใบ S1.23 (notify) ส่ง push ผู้ถูกเพิ่ม

## K. รีวิว S1-6 (S1.7+S1.8) ผู้ตรวจ G/H — มติรอบ 2 (4 พ.ย. ~23:3xZ)
- **R-S1.7a (G-1) แผนต้องผ่านด่านอนุมัติ** — `executePlan` ในห้องที่มี `AiRoom`: ก่อน claim ให้เรียก `approvalGate` ต่อทุก step (ผู้กดต้องเป็น OWNER/MANAGER ที่เห็นห้อง ตาม R-K4 · ใช้ `userId` ที่ส่งมา) · ไม่ผ่าน ⇒ ไม่ทำสักขั้น · แผน **คง PENDING** · คืน `{ ok:false, results:[], doneCount:0, note }` (`note` ไทย มี 'เจ้าของ'/'ผู้จัดการ' — เพิ่มฟิลด์ optional เท่านั้น) · ห้องเดิม (ไม่มี AiRoom) ไม่เปลี่ยน.
- **R-S1.7b (H-5/G-8) ด่านอนุมัติ fail-closed และไม่รบกวนห้องเดิม** — `secApprovalGate`: ห้องที่ไม่มี `AiRoom` ต้อง **ไม่อ่าน `listRules`/คำนวณ `why`** (0 query เพิ่ม) · ห้องเลขา: ครอบ try/catch — DB ล้ม ⇒ `{ ok:false, note:"ตรวจกฎอนุมัติไม่ได้ ลองใหม่อีกครั้ง" }` (ไม่ throw ออกจาก executeProposal) · `why` คำนวณเฉพาะห้องเลขาและคืนใน `approval` (ไม่ทิ้ง).
- **R-S1.7c (H-4/G-10) ชั้นความเสี่ยงครบ** — `kind-class.ts`: prefix เงิน `member.points.` `member.giftcards.` `member.wallet.` `member.rewards.` `member.vouchers.` · prefix ถึงลูกค้า `member.journeys.` `member.notifications.` `crm.sequences.` · kind ไม่รู้จัก ⇒ `destructive:true` ด้วย (fail-closed ทั้ง 3 ชั้น) · ลบคีย์ตาย `point`/`reward` ใน MONEY_MODULES ได้.
- **R-S1.7d (H-7) kind-class ต้องปลอด server จริง** — ย้าย `DESTRUCTIVE_KINDS` + `KIND_ACCESS` (+ `kindAccessOf` `isKnownKind` ถ้า pure) ไป `src/lib/ai/kind-tables.ts` (ห้าม import prisma/db/service ใด) · `proposals.ts` import จากนั้นแล้ว re-export ชื่อเดิม (ผู้เรียกเดิมไม่แตะ) · `kind-class.ts` import จาก `kind-tables` เท่านั้น (ห้าม `../proposals`).
- **R-S1.7e (G-9) `setRule` ผูก tenant** — ถ้า `by.tenantId !== tenantId` ⇒ ForbiddenError (ก่อนอ่าน role).
- **R-S1.8b (G-2/H-3) สิทธิ์ย้อน = สิทธิ์ของ "การกลับทาง"** — เพิ่ม `undoPermission` ต่อรายการใน `UNDOABLE_KINDS`: `kanban_create_card`/`kanban.cards.create` → `kanban.card.delete` · `kanban.cards.move` → `kanban.card.move` · `crm.deals.move` → `crm.deal.move` · `booking_create_appointment` → `booking.appointment.setStatus` · ตรวจด้วย `assertCan` ของผู้ย้อน + ขอบเขต (บอร์ด: ผู้ย้อนเห็นบอร์ด · นัด: `appt.unitId` ใน unitAccess) + `accessLevelGate` ของโมดูล · **แถวที่มี `roomId` (ห้องเลขา): ผู้ย้อนต้องเป็น OWNER/MANAGER** (R-K4 · STAFF ⇒ note มี 'เจ้าของ'/'ผู้จัดการ') · แถวห้องเดิม (`roomId` null): ผู้สั่ง/ผู้อนุมัติ/OWNER/MANAGER ที่มีสิทธิ์กลับทาง (เหมือนเดิม + คีย์ใหม่).
- **R-S1.8c (G-3/H-1/H-2/G-6) ย้อนต้องไม่ทับของคน** — `recordAction` เก็บ **สภาพหลังทำ** ใน `payload.after` (ids เท่านั้น: `{ columnId }` การ์ด · `{ stageId }` ดีล · `{ status }` นัด) · ตอน undo: ค่าปัจจุบัน ≠ `after` ⇒ ปฏิเสธ note มี 'ถูกย้าย' (การ์ด/ดีล) หรือ 'สถานะ' (นัด) และปล่อย claim · ดีลที่ `after.stage` เป็น WON/LOST ⇒ ปฏิเสธ note มี 'ปิดการขาย' · การย้อนการ์ด/ดีลต้องวิ่งผ่านทะเบียน op (`runOpAsActor` ด้วยตัวตนผู้ย้อน) ให้ completedAt/กิจกรรม/webhook ตรงของเดิม · ตำแหน่งการ์ดย้อน = ท้ายคอลัมน์ (รับ G-5 · เขียนในเอกสาร) · ย้อน `create` การ์ดที่ถูกแก้ทีหลัง = เก็บได้ตามเดิม.
- **R-S1.8d (H-3/G-7) ย้อนนัด** — ต้อง `status ∈ {PENDING, CONFIRMED}` และ `startAt > now` ไม่งั้นปฏิเสธ note มี 'สถานะ'/'เริ่มไปแล้ว'.
- **R-S1.8e (G-4) log ห้ามมี PII แม้ลงท้าย Id** — `payloadIdsOf`/`idsOnly`: denylist คีย์ `/taxId|lineId|lineUserId|promptpayId|phone|mobile|email|citizen|passport/i` (export `isPiiKey`) · ค่าที่เป็นตัวเลขล้วน ≥9 หลัก หรือมี `@` ไม่เก็บ.
- **R-S1.8f (H-8) `summary` ผ่าน `maskPiiPatterns`** (`@/lib/modules/crm/api/serialize.ts`) ก่อนเขียน log.
- **R-S1.8g (H-9) แผน log สรุปของ step** — `plans.ts` ส่ง `summary` ของ step เข้า `runKind` (พารามิเตอร์ optional ท้าย) · log ใช้ summary ของ step ไม่ใช่ชื่อแผน.
- **R-S1.8h (G-11)** `dispatchKanbanKind` ตั้ง entity เฉพาะ `cards.create`/`cards.move`.
- เอกสาร (ไม่มีโค้ด): `undoAction(now)` = ใช้เฉพาะทดสอบ — S1.14 ห้ามรับจากไคลเอนต์ · B5: MANAGER เห็น log เฉพาะห้องตัวเอง+แถวที่ตัวเองสั่ง/อนุมัติ (ไม่ใช่ทั้งร้าน) · หนี้ → S1.25/S3: purge `Ai*` ตอนลบร้าน/ลบผู้ใช้ (G-12) · CRM door kinds ข้ามด่าน+log (H-6 · หนี้เดิม).
- oracle รอบ 2 `qc-sec-s1.7.mts`: G-4 · U-6 · U-7 · L-5 · C-5 · D-3 เข้ม (ห้าม import `../proposals`) — รวม 28 ข้อ.

## L. S1.13 DECISION-1 — assist ฟรี vs ชุดทดสอบเดิม (ผู้คุมตัดสิน 5 พ.ย. ~01:2xZ)
- **R-S1.13a คง R-K7 ตามมติเจ้าของ 7.1/7.3**: ขณะ `FREE_PACK.enabled` ทุกทางเข้า assist (canSpend 20 จุด) = ผ่าน และยังบันทึกต้นทุนลง `AiCreditTxn` (ยอดติดลบได้ = บันทึกต้นทุนจริง ไม่ใช่หนี้ลูกค้า) · ชุดทดสอบเดิมที่ยืนยัน "ไม่มีเครดิต ⇒ ปฏิเสธ" ล้าสมัยโดยเจตนา ⇒ **ORACLE-EDIT โดยผู้คุมอนุญาตให้ builder S1.13 แก้ชุดเดิม** ตามกติกาเดียว: ทุกข้อที่คาด "ปฏิเสธเพราะไม่มีเครดิต" ให้เขียนเป็น `FREE_PACK.enabled ? <คาดผ่าน+มีแถว USAGE> : <คาดเดิม>` (import `FREE_PACK` จาก `@/lib/ai/secretary/pack` · ห้ามลบข้อ · ห้าม SKIP ถาวร) · `qc-ai-credit` สร้าง tenant ทดสอบด้วย `createdAt = SECRETARY_LAUNCH_AT − 1 วัน` (ร้านเดิม) เฉพาะข้อที่ทดสอบกระเป๋าต้อนรับ · `qc-ai-usage` AU-4.1 ตรวจ `canRunAi` แทนคำว่า `canSpend` · ชุดที่รันบนฐานอื่น (`qc-svc-d.14` PC-4/P-13 · `qc-crm-c2.4` S2.4/S8.4 · `qc-crm-c3.4` CR.3 · `qc-acc-v2-inbox` T11.4) แก้ด้วยกติกาเดียวกันโดยอ่านโค้ดข้อนั้น (รันไม่ได้บนฐาน sec — จดไว้ว่า "แก้แล้ว ยังไม่ได้รัน" · S1.14 ด่านเต็ม `qc:all` จะรันจริง)
- **R-S1.13b เพดานต้นทุน assist ต่อวัน (ใหม่ · กันวิ่งไม่หยุด)**: `FREE_PACK.assistDailyMicro = 500_000` (≈ $0.50/วัน/ร้าน) ใน `pack.ts` · `canRunAi(scope:"assist")` ผ่านก็ต่อเมื่อ Σ|amountMicro| ของ `AiCreditTxn.kind=USAGE` ของร้าน **ในวันไทยของ `now`** < `assistDailyMicro` ไม่งั้น `{ ok:false, reason:"credit", resetAt: เที่ยงคืนไทยถัดไป, message: ไทยมี 'วันนี้' }` · ห้องเลขา (scope job) ไม่ใช้เพดานนี้ (มีโควตางานแล้ว) · `quotaStatus` เพิ่ม `assist: { usedMicro, capMicro }` · oracle C-6 เพิ่ม
- หนี้จด RUN: `creditView` (เว็บ actions.ts) ยังเขียนกระเป๋าตอนอ่าน (นอกใบ) · `startRoom` อ่าน balancePeek นอก tx (ชนกันได้ 1 งาน — ยอมรับ)
- **R-S1.13c ห้องเลขาไม่ผ่านด่าน assist** (จาก open item ของ builder รอบ 2): บทสนทนาที่มี `AiRoom` — `sendMessage`/worker **ไม่เรียก `canRunAi`** (ห้องถูกนับและอนุญาตแล้วที่ `startRoom` · ข้อความต่อในห้องไม่นับ Q3 · ไม่ติดเพดาน assist/วัน · ไม่ติดเครดิต) · ยังบันทึกต้นทุน AiCreditTxn/AiUsage ตามเดิม · ห้องเดิมคง scope "assist"
- ORACLE-EDIT S1.13-C-6 (5 พ.ย. ~02:3xZ): fixture AiCreditTxn ต้องมี `source`/`balanceAfter` (ผู้คุมผิดเอง) · 653d5a06

### L.2 รีวิว S1.13 ผู้ตรวจ I/J — มติรอบ 3 (5 พ.ย. ~04:1xZ)
- **R-S1.13d (I-1)** ข้ามด่านเฉพาะ `deps.userMessageId && conv.room && !conv.room.closedAt` (ทาง worker ของห้องที่ยังเปิด) · ประตูเดิม (`api/mobile/chat/send` · `sendAiMessageAction`) ที่ชี้ conversation ของห้องเลขา ⇒ ผ่าน `canRunAi("assist")` ตามปกติ · oracle C-8
- **R-S1.13e (I-2/J-2)** เพิ่ม `canSpendWhy(tenantId, now?) → CanRun` ใน credit.ts · ผู้เรียก `outOfCreditMessage()` 8 จุด (translate.ts ×2 · ai-suggest.ts · inbox-ai.ts · crm/calls.ts ×2 · crm/ai-bridges.ts · kanban/ai.ts) เปลี่ยนเป็นข้อความจาก `CanRun.message` (วันนี้/เครดิต) — `canSpend()` คงชื่อ/สัญญาเดิม
- **R-S1.13f (I-3/J-1 มติผู้คุม)** ต้นทุนห้องเลขา **ไม่นับ** ในเพดาน assist/วัน: ผลรวม USAGE ตัดแถวที่ `conversationId` มี `AiRoom` (subquery เดียว) · ห้องเลขาคุมด้วยโควตางานอยู่แล้ว
- **R-S1.13g (I-3/J-3 มติผู้คุม)** เมื่อถึงเพดาน **ไม่** fall-through ไป `balance > 0` (ยุคแพ็กฟรี: เพดานคุมต้นทุนก่อน · เติมเงินปิด 7.3) · ยอด $10 ร้านเดิมเป็นบัญชีต้นทุน ไม่ใช่สิทธิ์ใช้เกินเพดาน · ✍️ จดในบันทึกมติเจ้าของ (B8) ให้เจ้าของเห็นตอน CP
- **R-S1.13h (I-4)** overflow ด้วยกระเป๋า (Q4) ต้อง `balancePeek ≥ LOW_BALANCE_MICRO` (ไม่ใช่ > 0) · แก้ wo-notes ว่าเป็น burst ไม่ใช่ 1 งาน
- **R-S1.13i (I-6/J-5)** `canSpendPeek` รวมเพดานวัน (blocked ไม่ null ตอนถึงเพดาน) · `getsWelcomeGrant`: ไม่มี Tenant ⇒ false (I-9) · route usage ใช้ `getsWelcomeGrant` export เดียว (I-7) · **wire shape quota สำหรับ S1.14 = ใบ S1.14** `{ jobs:{used,limit,left,resetAt}, assist:{usedMicro,capMicro}, pack }` ไม่มี balanceMicro (§C.6) · B8 cap แถบ 100%
- **J-4** docs §8 แก้: ห้องเลขาไม่อยู่ใต้ assist · scope "jobs" = reserved · "day" ตอนถึงเพดาน
- หนี้ (ไม่ทำรอบนี้): oracle Q-3 month rollover / createdAt===LAUNCH (ผู้คุมเพิ่มทีหลัง) · qc-ai-credit ใช้ร้านเดิมทั้งชุด (J-7 ยอมรับ) · `creditView` เขียนตอนอ่าน

## M. รีวิว S1.12 ผู้ตรวจ K — มติรอบ 2 (5 พ.ย. ~04:1xZ)
- **R-S1.12a (K-1)** summary ของ `chat.send` = "ส่งข้อความถึง <ชื่อ> (<ช่องทาง>):\n<body เต็ม>" (ผู้อนุมัติต้องเห็นทั้งฉบับ · ≤1000) · ชื่อผ่าน `maskPiiDeep` (K-7)
- **R-S1.12b (K-2)** `chat.send` + `booking_refund_deposit` เข้า `PLAN_HUMAN_ONLY` (เสนอเป็นแผนไม่ได้) · export `isPlanHumanOnly(kind)` · เพิ่ม tool `refund_booking_deposit` ของตัวเอง (summary จากเซิร์ฟเวอร์: จำนวนเงิน + ชื่อลูกค้า (mask) + วันนัด · payload ids) · oracle P-1
- **R-S1.12c (K-3)** `dispatchChatSend` ต่อท้าย body ด้วยบรรทัดลงชื่อคงที่ "\n— ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน" (สำรองที่ใน 1000 ตัว · ช่องทางที่ไม่แสดง senderName ยังเห็น) · oracle E-2 แก้แล้ว
- **R-S1.12d (K-4)** ข้อความใน persona/tool description = "ต้องผ่านการอนุมัติจากผู้มีสิทธิ์" (ไม่สัญญา OWNER/MANAGER) · กติกา chat ฉีดเฉพาะเมื่อเครื่องมือถูกเสนอ (ไม่ใช่ `!ctx.access`)
- **R-S1.12e (K-5/K-6)** `clientMessageId = "ai:" + proposalId` · lookup ซ้ำกรอง `direction: "OUT"` · ตรวจ `canAccessConvUnit` ด้วย unitAccess ผู้อนุมัติ **ก่อน claim** (ไม่ผ่าน ⇒ คง PENDING + note สิทธิ์) · `chat.send` ไม่ editable (S1.10)
- **K-8** จด docs: `kind:"followup"` = ติดตามงานบริการ ไม่ใช่การตลาด (ไม่ตรวจ consent รุ่นแรก)

## N. รีวิว S1.21+S1.24 ผู้ตรวจ L/M — มติรอบ 2 (5 พ.ย. ~06:4xZ)
- **R-S1.21a (L-F2)** `assign` ต้องมีคีย์ `chat.conversation.assign` (เหมือนเว็บ) · ยกเว้น "รับห้องที่ยังไม่มีผู้ดูแลให้ตัวเอง" ใช้ `chat.message.send` ได้ (assigneeUserId = ตัวเอง และห้อง assignee null)
- **R-S1.21b (L-F1)** `handoff` ทำได้เฉพาะ ผู้ดูแลปัจจุบัน หรือ helper ของห้อง หรือผู้มีคีย์ assign · `toUserId === byUserId` ⇒ ปฏิเสธ
- **R-S1.21c (L-F3/M-4/M-5)** SLA sweep: ผู้ดูแลที่ไม่ผ่าน `canRespond(unit)` (ถูกถอน/หลุดหน่วย) ⇒ ถือว่าไม่มีผู้ดูแล เตือน OWNER/MANAGER · นอกเวลาทำการไม่เตือน "ไม่มีผู้ดูแล" และ sweep เรียก `assignIncoming` ให้ห้อง OPEN ที่ยังไม่มีผู้ดูแลเมื่ออยู่ในเวลาทำการ (ล้าง backlog ตอนเปิดร้าน) · `assignIncoming` สำเร็จ ⇒ push "assigned" ถึงผู้รับ (notify pref) · `assign` ใน assignIncoming/escalation ใช้ `updateMany where assigneeUserId: null` (L-7)
- **R-S1.21d (L-F4)** rate-limit `checkRateLimitDb` บน helpers/handoff (20/นาที/ร้าน+ผู้ใช้) และ assign/status/contact/shift (60/นาที) · shift สลับซ้ำไม่สร้างแถวใหม่
- **R-S1.21e (M-1)** `POST /api/mobile/inbox/attachments` (Bearer · ≤10 MB · ห่อ handler เดียวกับ `api/v1/chat/attachments` · คืน `{url, mimeType, size, durationMs?}`) — อยู่ใน R-K13 ไม่ใช่ deferred
- **R-S1.21f (M-3/M-6)** message DTO เพิ่ม `deliveryStatus`, `stickerMeta`, attachments `{name,url,kind,mimeType,durationMs?}` · `POST quick-replies/[id]/apply` `{conversationId}` → `{body}` (render ตัวแปร + usageCount)
- **R-S1.21g (L-8/L-9/L-5/L-6)** owner fallback เลือก OWNER ที่เห็นหน่วย · `GET routing` `onDuty` กรองด้วย eligibleResponders ของหน่วยผู้ดู · sweep ข้ามห้องที่มีโน้ต `sla:` แล้ว (ไม่ติด 200 แถวเดิม) · โหลด membership ครั้งเดียวต่อร้าน
- **R-S1.21h (L-11/M-7)** cursor แบบคู่ `before=<iso>|<id>` ทั้ง conversations และ thread (แถวเวลาเท่ากันไม่หาย · lastMessageAt null ไม่ตัดหน้า)
- **R-S1.21i (L-12/M-8)** `CHAT_REPLY_ACTION` + คีย์เว็บที่แอปใช้ ย้ายไป `chat/guard.ts` (import ไม่พิมพ์ซ้ำ) · รายการคืน `{items, canReply}` / `{items}` ตาม COMMON ข้อ 6 (แก้ docs)
- **R-S1.25a (M-9b → S1.25)** `CHAT_LEVELS.VIEW = read+markRead` · `REPLY = read+markRead+send+setStatus` · assign/customer.link ให้รายคีย์ (extraPermissions) หรือ MANAGER
- รับ (ไม่แก้): `?e=` ใน push link · bucket reply ต่อร้าน+ผู้ใช้ · contact POST ตรวจสมาชิก · 429 ก่อน de-dup (แอปถือว่า retry ได้ — จด docs)
- หนี้/ตั๋ว (ก่อน S2.18/S2.19): `GET …/[id]/contact` · `inbox/settings` · tags/prefs/unread filter (M-2) · กฎเฉพาะช่องทางไม่ชนะ order (เอกสาร K5) · LAST_ASSIGNEE ไม่ดูกะ · แจ้ง S2 fixture lane เรื่อง `{items}`
- oracle รอบ 2 `qc-sec-s1.21.mts`: A-6 cross-tenant 404 · A-7 assign/handoff สิทธิ์ · A-8 attachments route · S-2 SLA ผู้ดูแลถูกถอน (ผู้คุมเพิ่ม)

## O. รีวิว S1.22 ผู้ตรวจ N — มติรอบ 2 (5 พ.ย. ~07:3xZ)
- **R-S1.22a (N1)** `sendReply` รับ `aiAfterHours?: true` ⇒ **ไม่** แตะ `staffUnreadCount`/`firstResponseAt` (ข้อความกลางคืนยังค้างคิวให้คนดูตอนเช้า · SLA ไม่ถูกนับว่าตอบแล้ว)
- **R-S1.22b (N2/N4/N5)** ลำดับใน `afterHoursAutoReply`: disabled → in_hours → **human/money/complaint (regex)** → "มีคนตอบแล้ว" (นับเฉพาะ OUT ที่ไม่ใช่ `meta.ai_afterHours` และ `senderUserId` ไม่ null) → โมเดล → **ตรวจคำตอบ**: ตรง MONEY_RE หรือมีจำนวนเงิน (บาท/฿/ตัวเลข+บาท) ⇒ handoff `money` · reason ใหม่ `human` (ขอคุยกับคน/พนักงาน/แอดมิน/human/agent/real person) และ `answered` (แทนการใช้ in_hours เมื่อมีคนตอบแล้ว) · ขยาย MONEY_RE (เท่าไร/เท่าไหร/ค่าส่ง/ค่าบริการ/ค่าธรรมเนียม/แพง/baht/THB/fee/charge/rate/quote) และ COMPLAINT_RE (เคลม/ชำรุด/พัง/ของไม่มา/ไม่ได้รับ/ช้า/broken/damaged/wrong/never arrived)
- **R-S1.22c (N3)** ข้อมูลร้านที่เข้า prompt กลางคืน (`memoryBlock` + DNA facts) ต้องผ่าน `maskPiiDeep` + mask ตัวเลข ≥8 หลัก และ system prompt สั่ง "ห้ามไล่รายการ/อ้างอิงข้อมูลภายในร้าน ตอบเฉพาะคำถามที่ถาม · ไม่รู้ = UNKNOWN" · หนี้: แหล่ง FAQ คัดกรอง (S3)
- **R-S1.22d (N6)** ข้อความที่ส่ง = `"Shark (ผู้ช่วย AI): " + คำตอบ + "\n" + disclosure` (คำนำหน้าคงที่ แก้ไม่ได้) · disclosure ต้องมี /AI|เอไอ|ผู้ช่วย/ ไม่งั้น throw ไทย
- **R-S1.22e (N7/N8/N9/N10/N12)** ข้าม hook เมื่อ body = `LINK_CODE_MASK` · `docNo`/`tier` ผ่าน mask · เหตุการณ์ handoff เขียนครั้งแรกของห้องต่อวันเท่านั้น (ไม่สะสม) · `setAfterHours` ต้องมี `by.tenantId` ตรง (required) · context ที่มีแต่ `contactId` ไม่มี `chatConversationId` ⇒ ทิ้ง
- รับ: deviations 1–8 ของ builder (deviation 2 ใช้ reason `answered`) · N11 push ทุก OWNER/MANAGER · หนี้: ที่อยู่/เบอร์ต่างประเทศใน recent (N8) · เลขาอ้างข้อมูลลูกค้าในห้องร่วม (N13 → ใบเชิญสมาชิก)
- oracle: A-3 แก้วงเล็บ (ผู้คุมผิด · N14) · เพิ่ม A-6 (unread/firstResponseAt ไม่เปลี่ยน · เงินหลังมี AI ตอบ ⇒ money) · A-7 (human · คำตอบมีราคา ⇒ money) · ส่วน A-3 ตรวจ body ขึ้นต้น "Shark (ผู้ช่วย AI):"

## P. รีวิว S1.25 ผู้ตรวจ O/P — มติรอบ 2 (5 พ.ย. ~08:2xZ)
- **R-S1.25b (O-2 ความยินยอม)** auto-join เฉพาะ hook `signupWithPhone` (คนใหม่สมัครผ่านลิงก์เชิญ = ยินยอม) · ผู้ใช้เดิม (hook OTP login / linkPhoneToUser) **ไม่สร้าง Membership** — hook แค่ทำให้ `pendingInvitesForUser(userId) → [{inviteId, tenantName, role, expiresAt}]` มองเห็น · สร้าง Membership ด้วย `acceptInvite(userId, inviteId)` (เบอร์ verified ต้องตรง) หรือ `acceptInviteByCode` เท่านั้น · S2.12 แสดงการ์ด "คุณได้รับคำเชิญจาก <ร้าน>" · ชื่อ/อีเมลผู้ถูกเชิญไม่โชว์ให้ร้านจนกว่าจะรับ
- **R-S1.25c (O-1)** rate-limit ด้วย `checkRateLimitDb` ไม่ขึ้นกับแถว: ต่อ (ร้าน,เบอร์) 5/วัน · ต่อร้าน 50/วัน · ต่อผู้เชิญ 30/วัน · cancel ไม่รีเซ็ต · resend นับรวม · reason `rate_limited`
- **R-S1.25d (O-3/O-6)** MANAGER ทำได้เฉพาะเป้าหมาย STAFF (invite/resend/cancel/setStaffLevels/suspend/remove) · invite/claim ปฏิเสธเมื่อ Membership ที่ถูกถอนของเบอร์นั้นมี role สูงกว่า role ผู้เชิญ หรือสูงกว่า role ในใบ (ไม่ให้ใบเชิญฟื้น OWNER/MANAGER ที่ถูกระงับ)
- **R-S1.25e (O-4/O-5/P-2)** `levels.ts` export `isSensitiveKey(key)`: เงิน (`.money` `.refund` `.void` `.payment.record` `.doc.approve` `.period.close` `.journal.adjust` `.point.adjust` `.giftcard.` `.priceOverride` `.setPrice` `.sell`) · ทำลาย (`.delete` `.merge` `.cancel` `.import` `.export`) · แอดมิน (`api.key.` `webhook.` `.api.manage` `.object.manage` `.visibility.manage` `.team.manage` `settings.` `branding.` `privacy.manage` `payadjust` `payroll`) — ไม่มีระดับใดให้ · `hr.payroll.*` ใน extraPermissions ต้อง `canViewPayroll(actor)` ใน `checkNoEscalation` · oracle L-6 กวาดทุกโมดูล
- **R-S1.25f (P-1)** คีย์ตัวเลข/ลิมิตของโมดูล (ขึ้นต้น `_` เช่น `_maxApproveSatang` `crm._maxReassignPerDay`) **คงไว้ทุกระดับ** (OFF/VIEW/USE ไม่ลบ)
- **R-S1.25g (P-3)** export `levelsAvailableFor(module): ModuleLevel[]` (ไม่มีคีย์อ่าน ⇒ ไม่มี VIEW · มีแต่คีย์อ่าน ⇒ ไม่มี USE · มีแต่คีย์อ่อนไหว ⇒ OFF เท่านั้น) · docs §5.23 ตารางต่อโมดูล · S2.22 แสดงเฉพาะระดับที่มี
- **R-S1.25h (P-4/P-7)** `levels.chat` ⇒ ok:false (ต้องใช้ `chat:`) · `staffViewOf().levels` ไม่มี chat · chat = REPLY เฉพาะมีครบ 4 คีย์
- **R-S1.25i (P-5/P-9)** claim ที่ re-check ไม่ผ่าน ⇒ ตั้ง `expiresAt = now` + แจ้งผู้เชิญ (ไม่ค้าง 7 วัน) · reason แยก: `pending_cap` (เพดาน 20) · resend: `accepted`/`not_found` · นับเพดานใต้ล็อกระดับร้าน
- **R-S1.25j (O-7/O-8/O-10/P-6/P-8)** suspend/remove ล้าง `PushDevice.tenantId` ของผู้ใช้ในร้านนั้น · SMS = "SHARK: " + ข้อความ · ชื่อร้าน/ชื่อผู้ถูกเชิญตัด URL และตัวเลขติดกัน ≥4 · tenants: สร้างระบบต่อรายการใน try/catch (logOps) · export `TenantRuleError` · type lower-case · เพดาน 3 ร้านนับ OWNER ที่ถูกระงับด้วย · `listStaffAccess(tenantId, { includeInvites?: true })` คืนแถว `pending: true` (ปริยาย false ชุดเดิมไม่เปลี่ยน)
- รับ: deviations 1–3, 5, 7–9, 11, 13–14 · หนี้: route S2.21 ต้องมี IP rate-limit บน previewInvite/acceptInviteByCode (O-9) · คีย์เก่าไม่หายตอน OFF · revokeStaffAccess เดิม MANAGER ถอน OWNER
- oracle รอบ 2: I-7 (ผู้ใช้เดิม link เบอร์ ⇒ ไม่ auto-join · pendingInvitesForUser 1 · acceptInvite ⇒ สมาชิก) · I-8 (invite→cancel→invite ×6 ⇒ rate_limited) · L-6 (กวาด USE ทุกโมดูลไม่มีคีย์อ่อนไหว · คีย์ตัวเลขคงอยู่) · L-7 (levels.chat ⇒ ok:false · levelsAvailableFor settings = [OFF] · staffViewOf ไม่มี levels.chat) → 19 ข้อ
- **P.2 re-check S1.25 (5 พ.ย. ~09:3xZ)**: N1 ขยาย SENSITIVE_PARTS (`.sensitive.` `.phoneFull` `.period.` `.wht.` `.markPaid` `.payment.manual` `.deposit.` `.waive` `.forfeit` `.writeoff` `.dispose` `.commission.approve` `.point.transfer` `.credit.manage` `.finance.manage` `system.system.`) · oracle L-6 ใช้รายการตายตัว + กวาด VIEW ด้วย · N2 `inviteRateOk` fail-closed (count ต้องเป็นตัวเลขทุก bucket) · N3 resend อยู่ใน tx ล็อกร้านเดียวกับ cap · N4 `smsSafe` ใช้ `\p{Nd}{4,}`/u และ normalise `[.。]` · N5 `detachPushDevices` ย้ายเข้า `revokeStaffAccess` (เว็บด้วย)
- **N.2 re-check S1.21 (5 พ.ย. ~09:5xZ)**: N1 โน้ต `sla:escalated:` เขียน **หลัง** assign แบบมีเงื่อนไขสำเร็จเท่านั้น (ไม่สำเร็จ = ไม่เขียน ไม่ตัดห้องออกจากรอบถัดไป) · N3 sweep ในเวลาทำการเรียก `assignIncoming` ให้ห้องว่างเสมอ (ไม่ขึ้นกับ unassignedAlertMin) · lookback 72 ชม. · N4 handoff ใช้ `onlyIfAssignee: conv.assigneeUserId` · N5 push "assigned" ใน `after()`/best-effort ไม่บล็อก webhook · หนี้: N2 sweep 200 แถวค้างกรณีไม่มีหัวหน้าคนอื่น · N6 อัปโหลดไม่มี Content-Length buffer ก่อนตรวจ (เหมือน v1)

## Q. รีวิว S2.1 ผู้ตรวจ Q — fix-forward ในใบ S2-2 (5 พ.ย. ~14:1xZ)
- **R-S2.1a (Q-1)** `secretary/_layout.tsx` + `customers/_layout.tsx` ใส่ `export const unstable_settings = { initialRouteName: "index" }` (deep link/push เปิดแล้วกดกลับต้องถึงรากโซน ไม่ใช่หน้าแรก 1.0)
- **R-S2.1b (Q-2)** `src/api/secretary.ts`: cache `me` คีย์ด้วย `user.id` · export `resetSecretaryMe()` เรียกตอน signOut/switchTenant · ล้ม (offline/401) ⇒ ไม่ cache (inflight = null)
- **R-S2.1c (Q-4)** `BusinessSwitcherSheet.pick()` หลัง `switchTenant` สำเร็จ ⇒ `router.dismissAll()` แล้วไปรากโซน (`/secretary` หรือ `/customers`)
- **R-S2.1d (Q-5)** `/secretary`: แยก 403 (ไม่มีสิทธิ์ใช้เลขา ⇒ จอ "ยังเปิดใช้ไม่ได้" ไม่ใช่ C3) จาก ว่าง · refetch ด้วย `useFocusEffect` (กลับจากห้องต้องสด)
- **R-S2.1e (Q-6)** badge 3 ไอคอน = store กลางในชั้น layout ของโซน (โหลดตอน focus/foreground · ไม่ยิงทุก mount) · `GET secretary/inbox/count` อยู่ในสัญญา S1.14 (ยืนยัน)
- **R-S2.1f (Q-7)** `airy/Sheet` รองรับ `BackHandler` (Android) ปิดชีตเมื่อ visible
- จด: Q-3 ปุ่ม "เลขา AI" ลอยทับ WebView หน้าแรก 1.0 → **เจ้าของตรวจบนเครื่องจริงที่ CP2** (QC เว็บโหลด WebView ไม่ได้) · Q-8 ชื่อร้านตัด → S2.20 · Q-9 ภาษากระพริบ → S2.13 (cache ภาษาใน SecureStore) · Q-10 `_gallery` มี Redirect นอก dev แล้ว (S0.2) — ยืนยันตอน S2.14 · Q-11 oracle s2.1 ขาด back-path/cache reset → ผู้คุมเพิ่มใน spec s2.2 (X-3)

## R. รีวิว S2.12 ผู้ตรวจ R — มติรอบ 2 (5 พ.ย. ~14:5xZ)
- **R-S2.12a (F1)** gate หลังสมัครใหม่ไม่มีร้าน: ไปที่ `/dna` ตามเดิม (จนกว่า S2.21 ส่ง G1 จริง · `/business/new` ยังเป็นโครง) · อนุญาต `/business/new` เพิ่มได้แต่ห้ามบังคับ · เมื่อ S2.21 merge ค่อยสลับ (จดใน S2.21)
- **R-S2.12b (F2)** ธง post-signup ผูกกับ `user.id` และล้างใน `signOut` + ตอนเริ่ม `signIn`
- **R-S2.12c (F4/F5/F6)** `/phone`: reset busy ใน finally + ปุ่มลองใหม่เมื่อ refreshMe ล้ม · `locked` ⇒ ตัวนับยังเดิน ไม่ขอส่งใหม่ทันที · `needSignup` → `/signup` ไม่ขอรหัสซ้ำ (ใช้รหัสเดิม) · signup ที่เบอร์มีบัญชีอยู่แล้ว ⇒ แจ้ง "เบอร์นี้มีบัญชีแล้ว — เข้าสู่ระบบให้แล้ว"
- **F3 (ของเจ้าของ — release gate)**: ก่อน build/OTA ใด ๆ ต้องมี SMS provider บน prod + บัญชี reviewer ของ App Store มีเบอร์ (หรือเบอร์ทดสอบ+รหัสคงที่ฝั่ง server — ตัดสินใน S3a) · F7 type email `string|null` · F8 R8 บังคับเฉพาะแอป (server ไม่ตรวจ) → S3 · F9 oracle gate เป็น pure function + เคส → S2.14

## S. รีวิว S2.4 ผู้ตรวจ S — fix-forward ในใบ S2-10 (ห้อง) + สัญญา S1.14 (5 พ.ย. ~17:5xZ)
- **R-S2.4a (S-1)** ย้อน: ปุ่มย้อนอยู่ต่อแถวของ "สิ่งที่เปลี่ยนในระบบ" (ไม่ใช่ปุ่มรวม) · กดแล้วมีชีตยืนยันบอกชื่อรายการ · ใช้ `canUndo` จาก server (ไม่คำนวณจากนาฬิกาเครื่อง)
- **R-S2.4b (S-2/S-7)** หลัง approve/reject/edit/send: ถ้า poll กำลังวิ่งให้ตั้งธง re-run (ไม่ทิ้ง) · ok ⇒ เอาการ์ดออกทันที · ok:false/409/expired ⇒ reload ทันที
- **R-S2.4c (S-3)** แผน: แสดง "ทำแล้ว N/M" + note ของขั้นที่ล้มตัวแรก · doneCount>0 ⇒ reload
- **R-S2.4d (S-4/S-6)** แก้ข้อเสนอ: การ์ดแสดงฟิลด์ที่แก้ (จาก `res.input`) · EditSheet แสดงเฉพาะคีย์ที่มี label `sec.field.*` (ห้ามโชว์ id ดิบ)
- **R-S2.4e (S-8/S-9/S-10/S-11)** polling หยุดเมื่อ AppState background + backoff ตอน offline · `clientMessageId` ใหม่เมื่อแก้ร่างหลังส่งล้ม + แจ้งเมื่อ duplicate · ปิดห้องมีชีตยืนยัน · guard กดซ้ำใช้ ref
- **R-S2.4f (S-13)** การ์ด chat.send แสดงบรรทัดลงชื่อที่จะต่อท้ายจริง (R-S1.12c) ใต้ข้อความ
- **สัญญา S1.14 เพิ่ม (S-5)**: proposals items มี `canApprove` (approvalGate แบบ dry-run สำหรับผู้ดู) · log items มี `canUndo` (สิทธิ์+เวลา server) · เอกสาร `RoomStatus` ค่าจริงจาก `roomStatusOf` (แอป S2.10 ปรับ fixture/สถานะให้ตรง · ไม่มี WAITING_APPROVAL ถ้า server ไม่ส่ง)

## T. รีวิว S1.14 ผู้ตรวจ T/U — มติรอบ 2 (5 พ.ย. ~21:0xZ)
- **R-S1.14a (T-1/U-1 CRITICAL)** `POST rooms` รับ `clientMessageId` (optional · Id) · claim key `sec:cmid:<tenant>:new:<user>:<id>` ก่อน `startRoom` · ซ้ำ ⇒ 200 `{ duplicate:true, roomId, conversationId }` ของห้องเดิม (ไม่นับงานซ้ำ) · oracle H-3
- **R-S1.14b (T-2)** `server-actions.ts` ทุก action เรียก `checkRateLimitDb` คีย์เดียวกับ route (send 10/นาที · อื่น 30/นาที) · (T-8) GET หนัก `inbox` `log` `digest` 60/นาที
- **R-S1.14c (T-3/T-4)** `support/upload`: อนุญาตเฉพาะ jpeg/png/webp/heic/heif/gif · ตรวจ magic bytes · ไม่มี svg · ไม่มี content-length ⇒ 411 · เพดาน 4 MB (Vercel 4.5) จดใน docs · แอป (S2.15) บีบอัดก่อนส่ง
- **R-S1.14d (U-2)** lib `listMessages(ctx, conv, { before?, take })` เรียงใหม่→เก่าแล้ว reverse · route `messages` ใช้ตัวนี้ (cursor คู่ `<iso>|<id>`) · docs row 36 แก้
- **R-S1.14e (U-3 REQ-4)** inbox item มี `classes` (`classOfKind`) · แผนมี `kinds[]` + `classes` รวม
- **R-S1.14f (U-4 REQ-6)** lib `updateTask(ctx, id, patch:{instruction?, hourBkk?, frequency?, days?, channels?, active?})` ใน `scheduled.ts` (cleanDays/cleanChannels เดิม · คง ownerUserId/lastRunDay · เจ้าของงานหรือ OWNER) · `PUT scheduled/[id]` รับ patch เต็ม
- **R-S1.14g (U-6/U-7/U-8/U-9/T-7)** 429 ทุกที่ = `{ error:"rate_limited", retryAfterSec }` + header · `roomCardDto` มี `pendingProposals` · cursor คู่ใน rooms list · `planCardDto` มี `hasDestructive` + `createdAt` · ข้อความ gate ไทยตาม `g.error` · `decodeURIComponent` ครอบ try/catch ⇒ 404
- **R-S1.14h (T-5/U-10)** `account/delete`: ลบสำเร็จก่อนแล้วค่อย revoke sessions · (หนี้ S3: step-up OTP)
- **R-S1.14i (T-6)** `proposals/[id]/edit` เฉพาะผู้ที่อนุมัติได้ (OWNER/MANAGER ตาม canApprove) · lib `editProposal` ต่อท้าย summary ด้วย "(แก้แล้ว: <field>=<value> …)" ของฟิลด์ที่เปลี่ยน · route คืน `summary` ใหม่
- **R-S1.14j (REQ-5 + S2.7/S2.10 asks)** `notifyUser` ใส่ `data.tenantId` ทุก push (notify.ts — ผู้คุมอนุญาตแตะ) · `GET access` คืนเฉพาะโมดูลของระบบที่ร้านเปิด (+ `ai` เสมอ) · proposal DTO มี `approvers: [{userId, name}]` (OWNER/MANAGER สมาชิกห้องที่ canApprove) และ `signature: CHAT_SEND_SIGNATURE` สำหรับ chat.send · staff row มี `units: [{id, name}]`
- **T-9 (ข้อมูล)** support attachments data-URL ตัดออกจาก docs (readBody 64 KB) · **หนี้ S3**: `AiMessage.clientMessageId` คอลัมน์ (secretary_c) แทนตาราง rate · step-up ลบบัญชี
- oracle รอบ 2 `qc-sec-s1.14.mts`: H-3 (POST rooms + clientMessageId ซ้ำ ⇒ duplicate ห้องเดิม · job นับ 1) · A-2 (STAFF PUT access/rules ⇒ 403 · STAFF GET after-hours ⇒ 403 · MANAGER invite role MANAGER ⇒ 4xx) · X-1 ขยาย regex (balanceMicro|costMicro|codeHash|phone":"\+66|@example) → 14 ข้อ

## U. รีวิว S2.17–S2.19 ผู้ตรวจ V — มติรอบ 2 (5 พ.ย. ~23:0xZ)
- **R-S2.17a (F3)** K3 ซ่อน/ปิดปุ่ม link/unlink · assign · helpers · status · handoff · close เมื่อ `inbox/systems.canReply=false` (อ่านจาก store) · ปุ่มรับเรื่อง/ส่งต่อ ตาม role
- **R-S2.17b (F2/F5)** K2: เก็บข้อความทั้งหมดที่โหลดใน map เดียว · cursor "เก่ากว่า" จากข้อความเก่าสุดที่แสดงจริง · poll รวมด้วย id ไม่ทับ · K1: poll เมื่อมีมากกว่า 1 หน้า ⇒ รวมด้วย id (ไม่ทิ้งหน้าที่เลื่อนมา)
- **R-S2.17c (F6/F7/F8/F9/F11)** ล้างข้อความ 429 เมื่อสำเร็จ · id ของ resend แยกจาก id ของข้อความพิมพ์ · บันทึกภายในแสดงไฟล์แนบ · ข้อความระบบตัดสินจาก senderUserId เท่านั้น · เปิดลิงก์เฉพาะ https · 403 จาก K2/K3 ⇒ setCustomersAccess(false) · currentSystemId ล้างตอนสลับร้าน
- **ตั๋ว server (→ S3a / S1.14 follow-up)**: `linkedMember.phone` ต้องส่ง `phoneMasked` (เต็มเฉพาะมี booking.customer.phoneFull) · DTO ห้องลูกค้า: `canAssign/canSetStatus/canLinkCustomer` · `replyWindowEndsAt` · route ai-suggest แบบ Bearer + `suggestionId` ใน reply · `tags`/deals ใน DTO · task-from-chat route
- รับ: ไฟล์ใหญ่ไม่มี fileSize บน native ให้ server ปัด (F12)

## V. รีวิว S2.21+S2.22 ผู้ตรวจ W — มติรอบ 2 (5 พ.ย. ~00:5xZ)
- **R-S2.21a (W-2)** `unitAccess []` = "ยังไม่มีสาขา" · เฉพาะ `["*"]` = ทุกสาขา (ชิป/หัวเรื่อง)
- **R-S2.21b (W-3)** โมดูล OFF-only ที่ server บอกระดับสูงกว่าที่แอปแสดง ⇒ ป้าย "ให้รายคีย์ไว้" (ไม่โชว์เป็นปิด)
- **R-S2.21c (W-4/W-5)** PUT ส่ง `unitIds`/`role` เฉพาะเมื่อเปลี่ยน · ลดบทบาท MANAGER→STAFF ⇒ รีเซ็ตกริดเป็นระดับที่เก็บจริง (ไม่ใช่ staffViewOf ของผู้จัดการ) ให้เจ้าของเลือกใหม่
- **R-S2.21d (W-6/W-7/W-8/W-9/W-10)** ค่าเริ่มต้นสาขาในคำเชิญ: OWNER ที่มี >1 สาขา ต้องเลือก · MANAGER = สาขาตัวเอง · `bad_units` ใส่ใน REASON map · ลิงก์ /i/<code> แสดงเฉพาะ sms ≠ sent · MANAGER ไม่เห็นปุ่ม resend/cancel ของคำเชิญ role ≠ STAFF · `ready` รวม denied · G1 กันกดซ้ำด้วย ref · G1 ครั้งแรก (fresh signup) มีลิงก์ออกจากระบบ
- **W-11** preview ลบบัญชีแสดง newOwner ของร้านที่โอน
- **ตั๋ว server (S1.14 follow-up / S3a)**: `staff/invite` รับ `levels` + `chat` (server แปลงเอง) และปฏิเสธคีย์ที่ `isSensitiveKey` ⇒ ลบตาราง LevelGrid ฝั่งแอปใน S2.14 · พิจารณาเพิ่ม SENSITIVE_PARTS: `pos.staff.manage` `pos.device.manage` `booking.service.setDeposit` `account.approve.limit` `account.chart.manage` `crm.quota.manage` `crm.report.all` `booking.job.runAny` (W-12) · fixture เบอร์ใช้รูปแบบปลอมชัด (W-13)

## W. รับ S2.13+S2.20 (ผู้คุมดูภาพคู่มืด 35 แผ่น · 6 พ.ย. ~07:3xZ)
- **R-S2.13a (Q1)** แถบบน 3 โซน + ปุ่ม ? เฉพาะหน้ารากโซน 5 หน้า (A1 · A6 · D1 · H1 · K1) · หน้าย่อยใช้แถบย้อนกลับตามภาพแบบ — ภาพแบบชนะใบงาน (กติกา "UI ต้องตรงแบบ") · ใบ S2.20 ข้อ "ทุกหน้า" ถือว่าแก้แล้ว
- **R-S2.13b (Q2)** badge ทีม = คำเชิญที่ร้านส่งแล้วรอรับ (OWNER/MANAGER) + `support/cases.unread` ไปก่อน · ตั๋ว server S3a: เส้นนับ "ขอความช่วยเหลือค้าง" (ChatConversationHelper ที่ฉันถูกเรียก + ยังเปิด) → แอปรวมเข้า badge ทีมเมื่อมี
- **R-S2.13c (Q3)** push deep-link: แอปรับทั้ง `/customers/<id>` และ `/inbox/<id>?e=` ต่อไป · ตั๋ว server S3a: `chat/routing.ts` เปลี่ยน `data.link` เป็น `/customers/<id>?e=…` (ไม่แตะในใบ S1.14b เพราะห้าม builder แตะ chat/**) · `qc/push-link-test.mjs` P-6/P-8/P-10/P-11 ที่ builder แก้ = ยอมรับ (ไม่ใช่ oracle ผู้คุม)
- **R-S2.13d (Q4)** `userInterfaceStyle: "automatic"` ⇒ คีย์บอร์ด/Alert ของจอ 1.0 ตามเครื่อง — เจ้าของดูในเครื่องจริงที่ CP2 (จดใน RESUME ของเจ้าของ)
- **R-S2.13e (Q5)** trailer commit ของ builder ไม่มีชื่อโมเดล = ถูกต้องตาม COMMON
- **fix-forward → ใบ S2.14 (ผู้คุมเห็นจากภาพคู่):**
  - F1 แถบ/ปุ่มลอยล่าง (ช่องพิมพ์ A1/A2/A4/H1/H2/K2 · ปุ่ม "เพิ่มพนักงาน" D1 · "ส่งคำเชิญทาง SMS" G2 · "สร้างและเริ่มใช้" G1) **พื้นหลังโปร่งจนข้อความการ์ดใต้แถบทะลุขึ้นมา** ทั้ง 2 ธีม (ภาพแบบ = แถบทึบ/เบลอ) → ใช้ surface token ทึบ + blur ใต้แถบ (ไม่แก้ padding ที่ทำไว้แล้ว)
  - F2 A6 รออนุมัติ: แถวชิป "ทั้งหมด/เงิน/ส่งลูกค้า/ลบ-ยกเลิก" ล้นจอ (ชิปที่ 4 ถูกตัด) → ลด padding/ฟอนต์ให้พอดีจอ 390 หรือแถวเลื่อนได้แบบมีขอบจาง
  - F3 K2 ห้องลูกค้า: ข้อความรูปของลูกค้าแสดงเป็นกล่องเขียวสว่างเต็ม (fixture ไม่มีรูปจริง) → placeholder ต้องเป็น surface token กลาง + ไอคอนรูป (ห้ามสีสด) · ตรวจแหล่งสีเขียวนั้นว่ามาจากไหน
  - F4 ยืนยันซ้ำว่า D1/G2 ตอนเลื่อนสุดไม่ถูกปุ่มทับ (padding.json บอก ok แล้ว · แค่ถ่ายภาพคู่ตอนเลื่อนสุดแนบใน wo-note S2.14)

### W.2 รีวิว S2.13+S2.20 ผู้ตรวจ X — มติรอบ 2 (6 พ.ย. ~07:5xZ)
- **R-S2.13f (M1 · แก้ก่อน merge)** `secretary/support/cases/[id]` ออกจากชุด `BADGE_AFTER` · จอ H2 เรียก `scheduleZoneBadges()` เองเฉพาะโหลดครั้งแรกหรือเมื่อจำนวนข้อความ/สถานะอ่านเปลี่ยน — ห้ามให้ poll 15 วิ ของ H2 ลาก badge 3–4 request ตามทุกรอบ
- **R-S2.13g (m2)** `CTA_BOTTOM`/`LIST_BOTTOM` ประกาศที่เดียวใน theme tokens/helper · G1 (`business/new.tsx`) ใช้ค่าเดียวกัน (เลิก 120/26 ฝัง) · เพิ่ม G1 ใน padding.json
- **R-S2.13h (m3/m4/L1/L2/L4)** ชีตสลับกิจการ `setQuota(null)` ต้น effect · note จาก `?e=` แสดงครั้งเดียวต่อ id ด้วย ref (ไม่ผูก `t`) · three-chats ok ต้องรวม `unmocked.length === 0` · เกณฑ์ padding `gap >= cardGap` (ไม่ใช่ ≥0) · ปุ่ม + ใช้สถานะ 3 ค่า (ไม่รู้/อนุญาต/ปฏิเสธ) ซ่อนจนกว่าจะรู้
- **R-S2.13i (m1 · Android)** `expo-system-ui` ต้องแตะ package.json ⇒ ไม่ทำใน RUN นี้ (ห้ามติดตั้งแพ็กเกจ) · เป้าหมายรุ่นแรก = iOS TestFlight · จด S3a: "Android ต้องเพิ่ม expo-system-ui ก่อน Internal testing" · CP2 เจ้าของดูโหมดมืดบน iOS รวมจอ 1.0 (คีย์บอร์ด/Alert) · ตัวห่อ Text ของ 1.0 ไม่มีสีตั้งต้น — builder ตรวจ `src/components/ui/text.tsx` ใส่สีตั้งต้นตามธีมสว่างของ 1.0 เพื่อกันตัวอักษรเปลี่ยนตามเครื่อง (ใบนี้ · ขอบเขตแคบ 1 ไฟล์)
- **R-S2.13j (M2 · ตั๋ว server → S3a)** `sendPushToChatStaff` (chat/service.ts) ใส่ `data.tenantId` + `link=/customers/<id>` (รวมกับ R-S2.13c) · ฝั่งแอปไม่แก้ · builder จดใน wo-note ข้อ 7 ว่าพฤติกรรมใหม่ = เปิดห้องในกิจการ active แล้วเจอ "ไม่พบ" (ไม่รั่ว)
- **m5** = R-S2.13b (ยืนยันนิยาม badge ทีมชั่วคราว + ตั๋ว `secretary/badges` เส้นเดียวใน S3a) · L3/L5 รับทราบ ไม่แก้ในใบนี้

## X. รับ S1.14b (ตั๋ว server) — มติรอบ 2 (6 พ.ย. ~08:1xZ)
- **R-S1.14b-a (Q1)** ด่าน `POST inbox/conversations/[id]/ai-suggest` = คีย์ `chat.ai.suggest` (ตรงเว็บ · least privilege) ไม่ใช่ `chat.message.send` · ORACLE-EDIT: STAFF ในข้อสอบได้ `chat.ai.suggest` รายคีย์ · S-3 (ไม่มีคีย์) ยัง 403 · หมายเหตุ S3a/เจ้าของ: จะรวม `chat.ai.suggest` เข้าระดับ REPLY ของ CHAT_LEVELS หรือไม่ (กระทบ S1.25 L-*) — ยังไม่ทำ
- **R-S1.14b-b (Q2)** reply ไม่มี `clientMessageId` แต่มี `suggestionId` ⇒ ใช้คีย์กันซ้ำ `sugg:<suggestionId>` ได้ (ยอมรับ) · ไม่มีทั้งคู่ ⇒ 422 เดิม
- **R-S1.14b-c (Q3)** อนุญาตแก้ `inbox/_shared.ts` `limited()` 1 บรรทัด: body `{ error:"rate_limited", message, retryAfterSec }` + header เดิม (ให้ตรง R-S1.14g)
- **R-S1.14b-d (Q4)** `sensitive_key` ตัดสินจากชื่อคีย์ ไม่ดูค่า (false ก็ปฏิเสธ) และใช้กับ `permissions` เดิมด้วย — ยอมรับ (ไคลเอนต์เก่า = เว็บไม่ใช้เส้นนี้)
- **R-S1.14b-e (Q5)** `replyWindowEndsAt` = `ChatConversation.replyWindowExpiresAt` (คอลัมน์มีอยู่แล้ว · FB/IG/WA) แปลง iso หรือ null — เลิกคำนวณจาก adapter · LINE/WEBCHAT ยัง null (C-1 เดิม)
- รับ: `permissionsForChat` export + default base (ข้อ 1) · `PATH_ID` task (ข้อ 3) · docs ที่ `docs/api/SECRETARY-API.md` (ข้อ 4) · shift แถวเปิดแถวแรก (ข้อ 5) · phoneMasked null เมื่อไม่มีเบอร์ (ข้อ 6)
- ส่งต่อ S2.14: `customers/[id]/info.tsx` ใช้ `phoneMasked` · K2 เช็ก `ok` ของ ai-suggest + ส่ง `suggestionId` ตอนส่งคำตอบ (เพิ่มในใบ S2.14)

### X.2 รีวิว S1.14b ผู้ตรวจ Y — มติรอบ 3 (6 พ.ย. ~08:3xZ)
- **R-S1.14b-f (MAJOR-2 · แก้ก่อน merge)** คีย์ wildcard `<module>.*` ใน `extraPermissions`/`permissions` ของ `staff/invite` = `sensitive_key` เสมอ (422 · ไม่สร้างใบ) — ใส่ใน `buildPermissions` ของ route (ไม่แตะ `isSensitiveKey` เพื่อไม่กระทบ S1.25) · oracle V-5 ใหม่
- **R-S1.14b-g (LOW-4 + MINOR-3)** `suggestionId` ที่ไม่ใช่ของห้อง/ร้าน/ระบบเดียวกัน ⇒ 422 `bad_suggestion` ก่อนส่ง (ไม่เงียบ) · oracle S-4 ใหม่ · บันทึกภายใน (`isInternal:true`) ห้ามใช้ `suggestionId` แทน `clientMessageId` ⇒ 422 เดิม (คีย์ `sugg:` เฉพาะคำตอบจริง)
- **R-S1.14b-h (MINOR-4)** `task`: error จาก lib ที่มี `status` 403/404 ให้คืนตามนั้น (`{error:"forbidden"|"not_found", message}`) · อื่น ⇒ 422 `task_failed` · docs ตาม
- MAJOR-1/MINOR-1/MINOR-2 = รอบ 2 ที่กำลังทำ (commit แล้วรัน oracle) · LOW-1 → S2.14 (ใบมีแล้ว) · LOW-2 รับทราบ (รูปแบบเดียวกับ thrown()) · LOW-3 → S3a: `can.aiSuggest` ใน DTO (จดใน RESUME)

## Y. รับ S1.14c (ตั๋ว server ชุด 2) — มติรอบ 2 (6 พ.ย. ~10:0xZ)
- **R-S1.14c-a** `badges.customers` = จำนวน**ห้อง**ที่มี unread (ตัวเดียวกับ `inbox/unread` ที่แอปใช้) ไม่ใช่จำนวนข้อความ · ORACLE-EDIT B-3 = 1
- **R-S1.14c-b** `badges.approvals` ต้องเป็นของกิจการที่เรียก (x-tenant-id) เท่านั้น: `inboxForUser(userId, { tenantId, take })` แล้วนับ canApprove — ห้ามปนกิจการอื่น (badge เดิม `inbox/count` ข้ามกิจการคงไว้สำหรับหน้าเลขา "ทุกกิจการ")
- **R-S1.14c-c** push "ลูกค้าทักเข้ามา" ไม่ใส่ `conversationId` (NV-6.5/CP-1.3 · แอป 1.0 อ่านคีย์นี้เปิดห้อง AI) — ยอมรับ · ใช้ `chatConversationId` + `link` แทน · ใบ S2.14/S3a: handler แอปอ่าน `link` เป็นหลัก
- ORACLE-EDIT: s1.14c L-3 mock `post(payloads)` อาร์กิวเมนต์เดียว · s1.17 N-4 link = `/customers/<id>` (ตาม R-S2.13j)
### Y.2 รีวิว S1.14c ผู้ตรวจ Z — MERGE (6 พ.ย. ~10:3xZ)
- MINOR-1 docs "แอปรับ /inbox/" — ถูกต้องหลัง S2.13 merge (push-register ของ S2.13 รับทั้งสองแบบ) · ทรีเลน b ยังไม่มี S2.13 จึงเห็นเป็นไม่ตรง — ไม่แก้
- **MINOR-2 → S2.14**: `handleSecretaryPush` ต่อ `?s=<data.systemId>` ท้ายลิงก์ห้องลูกค้า (กิจการที่มีหลายระบบแชท) · LOW-3 (ค่าคงที่ AI_SUGGEST ซ้ำ 2 ไฟล์ → `inbox/_shared.ts`) · LOW-1/LOW-2/LOW-4/LOW-5 → S3a (help ตรวจ READ+unit · approvals ตัวนับแยก · routing push `conversationId` → `chatConversationId` · oracle ครอบ approvals ไม่ปนกิจการ/customers 0 เมื่อไม่มี READ/help เฉพาะ OPEN/429)

## AA. รับ S2.14 (ปิด S2) — มติรอบ 2 (6 พ.ย. ~13:5xZ · ผู้คุมดูภาพคู่ A1/G2/A6/K3 มืด: F1–F3 แก้จริง)
- **R-S2.14a (Q1 ทะเบียนปุ่ม)** ยืนยันนิยาม: `kind=view` ok = เห็นจริงบนจออย่างน้อย 1 fixture · `kind=button/input` ok = กดแล้วเกิด request/route/state จริง (effect ไม่ใช่ "visible") · ไฟล์ `clicks-sec.json` ต้องมาจากรอบเต็มรอบเดียว (ผู้คุมรันซ้ำเองเพื่อยืนยัน · ห้ามรวม RESUME ข้ามรอบในไฟล์ส่งมอบ)
- **R-S2.14b (Q2 ไอคอนลูกค้า)** ยอมรับซ่อนเมื่อเจอ 403 ไปก่อน · ตั๋ว S3a: `GET secretary/badges` เพิ่ม `can: { customers: boolean }` (จาก `can(READ)`) → แอปซ่อนไอคอนตั้งแต่โหลด badge
- **R-S2.14c (Q3 ปุ่มสร้างงานบอร์ด)** ตั๋ว S3a: `conversation.can.task` = `chatTaskButtonConfig(tenantId) !== null && สิทธิ์ kanban.card.create` · ระหว่างนี้แสดงปุ่มแล้วรับ not_configured ได้
- **R-S2.14d (Q4 แท็ก K3 เป็นชิป)** ยอมรับ (ตาม §X) · ภาพแบบแถวข้อความ = ล้าสมัย · ไม่ต้องแก้แบบ
- **ตั๋ว server S3a (จาก S2.14 T1–T4)**: badges.can.customers · `levelsAvailable` ใน `GET secretary/staff` (หรือ `/access`) · `cardHref` ของ task เป็น path แอป (`/kanban/<boardId>/<cardId>`? → เจ้าของตัดสินว่าแอป 1.0 มีจอบอร์ด) · เส้นแก้แท็กห้อง `PUT inbox/conversations/[id]/tags`

### AA.2 รีวิว S2.14 ผู้ตรวจ AA (UX) + BB (security/QC tools) — มติรอบ 2 (6 พ.ย. ~15:1xZ) · FIX-FIRST
- **R-S2.14e (BB MAJOR-1)** `click-sec.mjs`: ก่อนกดตรวจ `document.elementFromPoint(กลางปุ่ม)` ต้องเป็นปุ่มนั้นหรือลูกของมัน · ถูกบัง ⇒ บันทึก `blocked` ไม่นับ ok · CASES กดเฉพาะ testID ที่เพิ่งโผล่ · รันเต็มใหม่ 1 รอบ **ห้าม RESUME** ในไฟล์ส่งมอบ
- **R-S2.14f (BB MAJOR-2 + m1)** ทะเบียนรวมชุด template เป็น `prefix-*` (จาก `testID={\`prefix-${…}\`}`) และต้องกดจริง ≥1 ตัวต่อชุด · รากคอมโพเนนต์รวมที่ DOM เป็น View ต้องมีลูก `${id}-*` ok ≥1 · `clicks-sec.json` = `{ meta: { generatedAt, registryHash, distHash, resumed:false }, items: [...] }` · RESUME ปฏิเสธเมื่อ hash ไม่ตรง · ORACLE-EDIT B-1 ตาม (รับรูปแบบใหม่ + template + meta + ปุ่มต้องมี effect)
- **R-S2.14g (AA MAJOR-1)** B4 กฎอนุมัติ: ห้ามแสดง/แก้ค่าปริยายก่อนได้ค่าจริง — `Loading` → ค่าจริง · ล้ม ⇒ `LoadError`+retry · ซ่อนสวิตช์/ช่องวงเงินจนกว่าจะโหลด
- **R-S2.14h (AA MINOR-1/2 · BB m3)** ใช้ `LoadError` เดียวกันทุกจอ (B8 · K3 · B7/K4 · G2 · G4 · B2) · ไม่วาดตัวเลข/ค่าปริยายก่อนได้ผล · 403 เป็นการ์ดล็อกแบบ A1/D1/K1 ใน A6 · A7 · H2 · A2 ล็อกช่องพิมพ์เมื่อ denied · `states-sec.mjs` ok ต้องเห็น testID `*-loading`/`*-error`/`*-denied` ของจอนั้นจริง
- **R-S2.14i (AA MINOR-3 · BB m2)** OTP/ผูกเบอร์/ยืนยันอีเมล: คงรหัสเมื่อ `ApiError.status >= 500` (ยกเว้น 503 sms_unavailable) หรือ network — เหมือน login
- **R-S2.14j (AA MINOR-5 · BB L1)** K3: ป้ายปุ่มสั้นลง/ขึ้นบรรทัดได้ · fixture ทางสำเร็จ task 200 `{cardNo}` · K2 `applyQuick` ล้าง `fromSuggestion` · 422 `bad_suggestion` ⇒ ทิ้ง suggestionId แล้วส่งใหม่ครั้งเดียว
- **R-S2.14k (AA MINOR-6 · story 10)** A1 (OWNER เท่านั้น): ชิปขอบเขต "ของฉัน / ทุกคนในกิจการ" ในแถวตัวกรอง → `GET rooms?scope=tenant` · การ์ดของคนอื่นแสดง "สั่งโดย <ชื่อ>" · ภาพคู่ A1 เพิ่ม 1 แผ่น (สว่าง/มืด) · spec s2.2 ไม่แก้
- **R-S2.14l (AA/BB LOW)** fixture หลัก s2.1/s2.17/s2.20 → `linkedMember.phoneMasked` + `conversation.can.*` ตามสัญญา (ภาพคู่ K2/K3 ถ่ายใหม่) · docs §2.3b แถว /phone = `POST auth/phone/link` · ลบคอมเมนต์ค้าง auth-context.tsx · `ImageAtt` ผ่าน `isSafeLink` ก่อนโหลด · i18n ข้อความ server ไทยในโหมด en = หนี้ S3a
- **รับทราบไม่แก้:** MINOR-4/L2 (badges.can.customers → S3a ตาม §AA) · L3 sec-harness (QC เท่านั้น)
- บทเรียนผู้คุม: `pgrep -f … | xargs kill` ฆ่าเชลล์ตัวเอง (exit 144) ⇒ ใช้ `systemctl stop iso-*` อย่างเดียว
