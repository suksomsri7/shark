# แผน — รื้อหน้า "แชทลูกค้า" ให้เป็นกล่องแชทแบบ WhatsApp (ชุด WO-CW)

> เขียน 31 ส.ค. 2026 · ผู้วางแผน+QC: Fable · ผู้ลงมือ: Opus 5 (sub agent)
> 🔴 อ่าน `ledger/PLAN-CHAT-PLATFORM.md` ก่อนเสมอ — ไฟล์นี้ต่อยอด **ไม่ทับ** แผนนั้น
> สถานะสดอยู่ท้ายไฟล์ (§9)

---

## §0 คำสั่งเจ้าของ (31 ส.ค. 2026) + มติที่เคาะแล้ว

**คำสั่ง 9 ข้อ**
1. เปลี่ยนเมนู "แชทลูกค้า / ภาพรวม" ให้เป็นหน้าตาระบบ Chat
2. ออกแบบใหม่ให้เหมือน WhatsApp มากที่สุด
3. มีหน้ารวมสมาชิกที่ติดต่อเข้ามาจากทุกช่องทาง
4. มีไอคอนเล็กบอกช่องทาง — LINE · WhatsApp · เว็บ · แอป · Messenger · IG · TikTok
5. ระบบแจ้งเตือน
6. ใส่รูป / แนบไฟล์ / ถ่ายรูปได้
7. ระบบผู้ใช้งาน — กำหนดว่าพนักงานคนไหนใช้งานได้บ้าง
8. ระบบแนะนำคำตอบด้วย AI ที่วิเคราะห์จากข้อมูลทั้งกิจการ
9. วิธีเก็บบันทึกคำตอบ เพื่อให้ระบบแนะนำแม่นขึ้นในอนาคต

**มติที่เจ้าของเคาะ 31 ส.ค. (ห้ามรื้อโดยไม่คุย)**

| # | คำตัดสิน | เหตุผล |
|---|---|---|
| W1 | **เลย์เอาต์ WhatsApp + โทนสี SHARK** — เหมือน WhatsApp ทุกอย่างที่เป็น *การใช้งาน* (2 คอลัมน์ · ฟองมีหาง · ติ๊ก ✓✓ · ตัวคั่นวันที่ · composer ติดล่าง · avatar กลม + badge ช่องทาง) แต่สีอยู่ในระบบโทนเดิม (ขาว-ดำ + accent น้ำเงิน) | ไม่ให้หน้าแชทกลายเป็นคนละแอปกับอีก 27 ระบบ |
| W2 | **ไม่มีพิธี "เชิญพนักงาน"** — แอดมินกดให้สิทธิ์พนักงานที่มีอยู่ในระบบ HR ได้เลย | คำพูดเจ้าของ: "เรามีระบบพนักงาน HR อยู่แล้ว ทำไมต้องเชิญ คนที่ใช้งาน SHARK เป็น admin กำหนดสิทธิได้เลย" |
| W3 | **แปลภาษา = กดแปลเมื่อต้องการ** ไม่ใช่อัตโนมัติ | คุมค่า AI (~$0.008/ข้อความ) |

---

## §1 สภาพจริงวันนี้ (สำรวจจากโค้ด 31 ส.ค. 2026 — ไม่ใช่จากบันทึกเก่า)

### 1.1 ของที่มีอยู่และต้องไม่ทำหาย
- API v1 ครบ 8 เส้น + `/replies` · `CHAT_BACKEND=dual` กับ SiamDive **เปิดใช้จริงบน prod แล้ว**
- ข้อสอบ **275 ข้อเขียว** (`qc-chat-api-v1` 89 · `qc-chat-core-v2` 41 · `qc-chat-replies` 60 · `qc-chat-retention` 37 · `qc-chat-push-badge` 28 · `qc-chat-notify` 23 · `qc-chat-security` 23 · `qc-chat-security-scope` 20 · `qc-chat-business-hours` 73)
- `announceInbound` → `sendPushToTenant` + แบดจ์ที่หัว NavGroup (WO-C14 · 29 ส.ค.)
- `markCustomerRead` / `customerUnreadCount` — **มีข้อมูลพอทำติ๊ก ✓✓ ได้แล้ว** แค่ยังไม่มีใครวาด
- `uploadFile()` + `CHAT_ATTACHMENT_MAX_BYTES` (10 MB) + `ChatAttachment` — โครงอัปโหลดพร้อม
- `searchKb()` · `runTool` (read-only 5 ตัว) · `OpenRouterProvider` (`FAST_MODEL` haiku-4.5 / `SMART_MODEL` sonnet-5) · `chargeUsageSafe` — วัตถุดิบ AI ครบ

### 1.2 ช่องว่างที่วัดได้ (หลักฐานทุกข้อ)

| ID | เรื่อง | หลักฐาน |
|---|---|---|
| G1 | **หน้า "ภาพรวม" ของระบบแชท = การ์ด 2 ใบ** ไม่ใช่กล่องแชท | `ui.tsx:84-131` `ChatHub` · เรียกจาก `app/sys/[id]/page.tsx:72` |
| G2 | หน้า inbox เป็น server-only ล้วน + `AutoRefresh ms={7000}` รีเฟรชทั้งหน้า | `chat/page.tsx:31` |
| G3 | **ทีมส่งรูป/ไฟล์ไม่ได้เลย** — `sendReply` รับแค่ `body: string` | `service.ts:1033-1042` |
| G4 | **ไม่มีไอคอนช่องทาง** — เป็นตัวหนังสือล้วน | `ui.tsx:50-58` `CHANNEL_LABEL` |
| G5 | **enum ไม่มี `APP` และ `TIKTOK`** — ข้อ 4 ของเจ้าของทำไม่ได้ถ้าไม่เพิ่ม | `chat.prisma:9-17` |
| G6 | 🔴 **ไม่มีหน้าจอจัดการผู้ใช้งานเลยทั้งระบบ** — `prisma.membership.create/update` ไม่มีที่ไหนนอกจาก `account-deletion.ts:90` (ส่งมอบ OWNER) ⇒ ร้านมีได้แค่คนที่สมัครเอง | grep ทั้ง repo |
| G7 | 🔴 **`HrEmployee.linkedUserId` มีในสคีมาแต่ไม่มีโค้ดไหนอ่าน/เขียนเลย** — ฟิลด์ตายมาตลอด ⇒ ทะเบียนพนักงาน HR กับ "คนที่ล็อกอินได้" **ยังไม่เชื่อมกัน** | `hr.prisma:74` · grep = 0 hit |
| G8 | 🔴 **แก้แล้ว 31 ส.ค. — ฉบับแรก Fable เขียนผิด** · ~~ไม่มี action ของแชทใน RBAC เลย~~ ของจริง `chat/actions.ts` มี `assertChatCan` **ครบทุก export** (10 เส้น: `chat.message.send` · `chat.conversation.setStatus/assign/markRead` · `chat.customer.link` · `chat.connection.create/disable` · `chat.setting.setRetention/setBusinessHours/setMemberSystem`)<br>**ช่องโหว่จริงคือ _ขาอ่าน_ อย่างเดียว**: `ChatInboxSection` (`ui.tsx:137`) เรียก `listConversations`/`getThread`/`listStaff` ตรง ๆ ใน server component โดย**ไม่มี `assertCan` สักตัว** (grep = 0) — กันแค่ `unitAccess` ⇒ STAFF ที่เข้าถึงสาขานั้นได้ **อ่านแชทลูกค้าทุกห้องในสาขาได้ แม้ไม่มีสิทธิ์แชทเลย** | `chat/actions.ts:25-300` เทียบ `ui.tsx:137-160` |
| G9 | `sendPushToTenant` ยิงทุกเครื่องในร้าน ไม่ดูสิทธิ์/ผู้รับผิดชอบ | `core/push.ts:34` |
| G10 | ไม่มีที่เก็บผลแปล / คำแนะนำ AI / คำตอบที่ใช้จริง | `chat.prisma` ทั้งไฟล์ |

🔴 **G6+G7+G8 รวมกันคือช่องโหว่ ไม่ใช่แค่ฟีเจอร์ขาด** — วันนี้ถ้าร้านมีพนักงานคนที่ 2 ได้จริง คนนั้นจะอ่านแชทลูกค้าทุกห้องได้ทันทีโดยไม่มีอะไรกั้น (ยกเว้นด่าน unit ของ `canAccessConvUnit`)

---

## §2 สถาปัตยกรรมของรอบนี้

```
┌ หน้าจอ ─────────────────────────────────────────────────────────────┐
│ /app/sys/<id>            = กล่องแชทเต็มจอ (แทน ChatHub การ์ด 2 ใบ)    │
│ /app/sys/<id>/chat       = redirect ไปหน้าเดียวกัน (ลิงก์เก่าไม่ตาย)   │
│ /app/sys/<id>/chat/channels = เชื่อมช่องทาง + ตั้งค่า (เดิม + ของใหม่)  │
│ /app/settings/staff      = ผู้ใช้งาน + สิทธิ์ (ใหม่ทั้งหน้า)            │
└──────────────┬──────────────────────────────────────────────────────┘
               │ server action เท่านั้น (ไม่เปิด REST ใหม่ให้ทีมงาน)
┌──────────────▼──────────────────────────────────────────────────────┐
│ chat/actions.ts  ← ทุกเส้นผ่าน assertCan() ก่อน (G8)                  │
│ chat/service.ts  ← sendReply(+attachments) · markCustomerRead (มีแล้ว)│
│ chat/ai-suggest.ts (ใหม่) · chat/translate.ts (ใหม่)                  │
└──────────────┬──────────────────────────────────────────────────────┘
               │
   storage/service.uploadFile · ai/provider · ai/credit · modules/kb
```

**กฎเหล็กของรอบนี้ (ต่อจากกฎเดิม 3 ข้อใน PLAN-CHAT-PLATFORM §2)**
4. **AI และการแปลต้องพังแล้วไม่ทำให้ตอบแชทไม่ได้** — ทุกเส้นทาง fail-soft คืน `{ok:false,reason}` ห้าม throw ขึ้นไปถึงฟอร์มส่งข้อความ
5. **network call (OpenRouter / Bunny / LINE) ห้ามอยู่ในทรานแซกชัน** — กติกาเดิมของ repo (pool ของ Neon)
6. **ปุ่มที่คนต้องกดเอง ต้องเดินถึงจากเมนูจริง** — บทเรียน 29 ส.ค. (บั๊ก 5 ตัวผ่านข้อสอบ 400+ ข้อ เพราะไม่มีข้อไหนวัด "คนใช้งานไปถึงได้ไหม")

---

## §3 WO-CW1 — Schema รอบ 3 (additive ล้วน)

**ไฟล์:** `prisma/schema/chat.prisma` · `src/lib/core/scope.ts` · migration ใหม่ 1 ตัว
**⛔ ห้ามแตะ:** `core.prisma` (แช่แข็ง) · `hr.prisma`

| # | เปลี่ยน | เหตุผล |
|---|---|---|
| N1 | `ChatChannelType` += `APP` , `TIKTOK` | G5 — ข้อ 4 ของเจ้าของ · `APP` = แอปมือถือของลูกค้า (วันนี้ SiamDive RN ส่งเข้ามาเป็น WEBCHAT ปนกัน) |
| N2 | `ChatMessage` += `detectedLang String?` · `translatedBody String? @db.Text` · `translatedLang String?` · `translatedAt DateTime?` | W3 — แปลครั้งเดียวเก็บถาวร กดซ้ำไม่จ่ายซ้ำ |
| N3 | ใหม่ `ChatAiSuggestion` | ข้อ 9 — บันทึก "AI เสนออะไร / คนใช้จริงไหม" |
| N4 | ใหม่ `ChatAnswerExample` | ข้อ 9 — คลังคำตอบที่ผ่านมนุษย์แล้ว ใช้เป็นแหล่งอ้างอิงรอบถัดไป |
| N5 | `ChatSetting` += `aiSuggestEnabled Boolean @default(false)` · `translateEnabled Boolean @default(false)` · `staffLang String @default("th")` | เปิด/ปิดต่อร้าน · ภาษาที่ทีมอ่าน |

```prisma
model ChatAiSuggestion {
  id              String   @id @default(cuid())
  tenantId        String
  systemId        String
  conversationId  String
  sourceMessageId String            // ข้อความลูกค้าที่ AI ใช้ตั้งต้น
  suggestedBody   String   @db.Text
  rank            Int      @default(0)   // 0..2 (เสนอได้สูงสุด 3 ตัวเลือกต่อครั้ง)
  model           String
  costMicro       Int      @default(0)
  sourcesUsed     Json     @default("[]") // ["kb:<id>","example:<id>","tool:sales_today"] — ตรวจย้อนได้ว่าเอามาจากไหน
  outcome         String   @default("PENDING") // PENDING | IGNORED | SENT_AS_IS | SENT_EDITED
  sentMessageId   String?
  similarity      Int?     // 0..100 · ความเหมือนของที่ส่งจริงกับที่เสนอ (ใช้แยก AS_IS/EDITED และวัดคุณภาพรายเดือน)
  createdByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([systemId, conversationId, createdAt])
  @@index([systemId, outcome, createdAt])
}

model ChatAnswerExample {
  id               String    @id @default(cuid())
  tenantId         String
  systemId         String
  question         String    @db.Text   // ข้อความลูกค้าที่นำไปสู่คำตอบนี้
  answer           String    @db.Text   // คำตอบที่ "ส่งจริง" (ของมนุษย์ = ความจริงเสมอ)
  channel          ChatChannelType
  lang             String?
  tags             Json      @default("[]")
  sourceMessageId  String?              // ChatMessage.id ของคำตอบที่ส่งจริง
  fromSuggestionId String?              // มาจาก AI ที่ถูกแก้แล้วส่ง (null = พิมพ์เองล้วน)
  useCount         Int       @default(0)
  lastUsedAt       DateTime?
  archivedAt       DateTime?            // แอดมินถอดตัวอย่างที่ไม่ดีออกได้ โดยไม่ลบประวัติ
  createdByUserId  String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([systemId, archivedAt, createdAt])
  @@index([systemId, channel, lang])
}
```

🔴 **กับดักที่ต้องรู้ก่อนลงมือ**
1. ~~`ALTER TYPE … ADD VALUE` ของ Postgres รันในทรานแซกชันไม่ได้~~ **← ข้อนี้ Fable เขียนผิด แก้แล้ว 31 ส.ค.**
   สาย A ทดสอบบน Neon จริง (**PostgreSQL 18.6**) แล้ว: `BEGIN; ALTER TYPE ADD VALUE; CREATE TABLE(...)` **สำเร็จ**
   ข้อจำกัดจริงของ PG12+ คือ **ห้าม _ใช้_ ค่าใหม่ในทรานแซกชันเดียวกับที่เพิ่ม** (`SELECT 'APP'::"ChatChannelType"`
   → `unsafe use of new value`) · ข้อความเตือนที่ Prisma generate ให้เป็นเรื่องของ **PG ≤ 11**
   ⇒ ยังแยก 2 migration ไว้ตามเดิม เพราะไม่มีต้นทุนและกันวันที่ต้อง backfill ข้อมูลด้วยค่าใหม่ (เช่น `WEBCHAT → APP`)
   ซึ่งจะชนกฎ "unsafe use" ทันทีถ้าอยู่ไฟล์เดียวกัน
   🔴 **บทเรียน**: อย่ารับข้อจำกัดของ DB มาจากความจำ — เวอร์ชันจริงบนเครื่องเป็นตัวตัดสิน
2. ตารางใหม่ทุกตัว **ต้องลงทะเบียนใน `src/lib/core/scope.ts`** ไม่งั้น `pnpm fitness` แดง F1.1 และ query throw ตอน runtime (บทเรียน 28 ส.ค. `ChatRateBucket`)
3. `CHANNEL_LABEL` / adapter registry / ที่ไหนก็ตามที่ `switch` บน `ChatChannelType` ต้องรับค่าใหม่ครบ ไม่งั้น typecheck แดงหรือได้ป้ายว่าง

**เสร็จเมื่อ:** `prisma validate` + `generate` + `pnpm typecheck` + `pnpm drift` + `pnpm fitness 17/17` เขียว
**⚠️ ยังไม่ `migrate deploy` บน prod** — Fable สั่งเองตอนประกอบ (`reference_shark_migrate_deploy`)

---

## §4 WO-CW2 — ระบบผู้ใช้งาน + สิทธิ์ (ข้อ 7)

**ไฟล์:** `src/app/app/settings/staff/**` (ใหม่) · `src/lib/staff/service.ts` + `actions.ts` (ใหม่) · `src/lib/core/rbac.ts` (เพิ่ม registry เท่านั้น) · `src/app/app/layout.tsx` (ลิงก์เมนู)
**⛔ ห้ามแตะ:** `src/lib/modules/chat/**` (สาย D ถือ) · `prisma/schema/**` (สาย A ถือ)

### 4.1 ทะเบียน action (ใหม่ — ยังไม่เคยมีในระบบ)
🔴 **แก้แล้ว 31 ส.ค. — ฉบับแรก Fable ตั้งชื่อ action ใหม่ทับของที่มีอยู่จริง 5 ตัว**
ถ้าปล่อยไว้จะได้ทะเบียนที่มีคีย์ 2 ชุดซ้อนกัน แล้วแอดมินติ๊ก `chat.reply.send` ให้พนักงาน →
**พนักงานยังตอบแชทไม่ได้** เพราะโค้ดจริงตรวจ `chat.message.send` = บั๊กแบบเดียวกับที่กฎ AS-6.1 ห้ามเป๊ะ

| ที่ Fable เขียนผิด | **คีย์จริงในโค้ด (ใช้ตัวนี้)** |
|---|---|
| ~~`chat.reply.send`~~ | `chat.message.send` |
| ~~`chat.conversation.resolve`~~ | `chat.conversation.setStatus` |
| ~~`chat.contact.link`~~ | `chat.customer.link` |
| ~~`chat.setting.write`~~ | `chat.setting.setRetention` · `chat.setting.setBusinessHours` · `chat.setting.setMemberSystem` (3 ตัวแยก) |
| ~~`chat.conversation.assign`~~ (บังเอิญตรง) | `chat.conversation.assign` ✅ |

**ของใหม่จริง ๆ มีแค่ 3 ตัว** (สาย C ใส่ทะเบียนแล้ว ติดธง `planned: true` รอ D/F มาใช้ → **ถอดธงเมื่อ wire เสร็จ**)
```
chat.conversation.read   ดูกล่องแชทลูกค้า      ← สาย D/F ต้องใส่ (ปิด G8 ขาอ่าน)
chat.ai.suggest          ใช้ AI แนะนำคำตอบ     ← สาย D (มีค่าใช้จ่าย)
chat.translate.use       ใช้การแปล             ← สาย D (มีค่าใช้จ่าย)
```
ทะเบียนกลางอยู่ที่ **`src/lib/core/permissions.ts`** (256 action · 39 โมดูล — สกัดจากซอร์สจริงด้วย grep ไม่ใช่พิมพ์มือ)
🔴 หน้า UI ต้องอ่านจากทะเบียนนี้ที่เดียว ห้ามพิมพ์ลิสต์ซ้ำ (บทเรียน AS-6.1)

### 4.2 หน้า `/app/settings/staff`
- ตาราง Membership ปัจจุบัน (ชื่อ · อีเมล · role · สาขาที่เข้าถึง · เข้าใช้ล่าสุด)
- ปุ่ม **"ให้พนักงานเข้าใช้งาน"** → เลือกจาก `HrEmployee` ที่ `active=true` (ทุกระบบ HR ของร้าน) → กรอก/ยืนยันอีเมล →
  1. `upsert User` ตามอีเมล (ระบบเป็น passwordless — ไม่ต้องตั้งรหัส)
  2. `create Membership { role: STAFF, unitAccess: [], permissions: {} }` — **เริ่มจากไม่มีสิทธิ์อะไรเลย** (fail-closed)
  3. `HrEmployee.linkedUserId = user.id` ← **ปิดหนี้ G7 ไปในตัว**
  - พนักงานล็อกอินเองด้วย magic link/OTP ที่มีอยู่แล้ว — ไม่มีพิธีเชิญ (มติ W2)
- หน้าแก้รายคน: role · สาขา · ติ๊กสิทธิ์รายโมดูล (อ่านจากทะเบียน §4.1 + ของโมดูลอื่นที่มีอยู่)
- ถอนสิทธิ์ = ปิดการเข้าถึง (`acceptedAt=null` หรือฟิลด์ระงับ) **ไม่ลบแถว** — ประวัติ `senderUserId` ในแชทต้องยังอ้างชื่อได้

### 4.3 กติกาความปลอดภัย (fail-closed ทุกข้อ)
- 🔴 **OWNER คนสุดท้ายห้ามถูกลดสิทธิ์/ถอนออก** — ล็อกตัวเองออกจากร้านถาวร (แบบเดียวกับมติ "OWNER คนสุดท้าย" ใน account-deletion)
- 🔴 **คนแก้สิทธิ์ต้องมีสิทธิ์มากกว่าหรือเท่ากับที่กำลังจะให้** — MANAGER ห้ามตั้งใครเป็น OWNER และห้ามให้สิทธิ์ที่ตัวเองไม่มี (ไม่งั้น STAFF คนเดียวยกระดับตัวเองได้)
- 🔴 **ห้ามแก้สิทธิ์ตัวเอง** (ยกเว้น OWNER)
- ทุก action ผ่าน `assertCan({ module:"settings", action:"settings.staff.write" })`

### 4.4 บังคับใช้กับแชท (ปิด G8)
- `chat/actions.ts` ทุกเส้น + `ChatInbox` UI → `assertCan` ก่อนเสมอ
- ไม่มี `chat.conversation.read` → **ไม่เห็นเมนูแชทเลย** (ซ่อนใน `layout.tsx` + ด่านจริงที่ action)
- 🔴 ซ่อนเมนูอย่างเดียวไม่พอ — ต้องกั้นที่ action ด้วยเสมอ (UI คือความสะดวก ไม่ใช่ความปลอดภัย)

---

## §5 WO-CW3 — Core: แนบไฟล์ + แปล + AI แนะนำ (ข้อ 6, 8, 9 ครึ่งหลัง)

**ไฟล์:** `src/lib/modules/chat/service.ts` (สายเดียวที่แตะ) · `chat/ai-suggest.ts` + `chat/translate.ts` + `chat/learning.ts` (ใหม่) · `chat/actions.ts`

### 5.1 แนบไฟล์ฝั่งทีม (G3)
- `sendReply` += `attachments?: ExternalAttachmentInput[]` — **ใช้ type เดิมของ `receiveExternalInbound`** (`service.ts:804`) ห้ามสร้างชนิดใหม่
- อัปโหลดเกิด**ก่อน**เข้าทรานแซกชัน (Bunny = network) → ได้ url แล้วค่อยเขียน `ChatMessage` + `ChatAttachment` ในทรานแซกชันเดียว
- ข้อความที่มีแต่ไฟล์ (ไม่มีข้อความ) ต้องส่งได้ — ของเดิม `if (!body) return {ok:false}` จะบล็อก ⇒ เงื่อนไขใหม่คือ "ต้องมีอย่างน้อย body หรือ attachment"
- `type` ของข้อความ: รูป → `IMAGE` · อื่น → `FILE` (ตาม `ChatAttachment.kind` เดิม)
- ส่งออก LINE: adapter ต้องส่ง image message ไม่ใช่ทิ้งไฟล์เงียบ ๆ · ช่องทางที่ยังไม่มี adapter → บันทึกในระบบตามปกติ
- allowlist + เพดาน 10 MB ใช้ `storage/service.ts` ตัวเดิม (`CHAT_ATTACHMENT_MAX_BYTES`)

### 5.2 แปลภาษา (ข้อ 10 · มติ W3 = กดแปล)
```
translateMessage({ tenantId, systemId, messageId, targetLang, userId })
  → มีผลแปลเดิมที่ targetLang เดียวกัน? คืนของเดิม (ไม่จ่ายซ้ำ)
  → FAST_MODEL · prompt เป็นภาษาอังกฤษ (reference_llm_thai_token_cost)
  → chargeUsageSafe(source:"chat_translate")
  → เก็บ translatedBody/translatedLang/translatedAt/detectedLang
```
- **ขาไป (ลูกค้า→ทีม)**: ปุ่ม "แปล" ใต้ฟองขาเข้า → แสดงคำแปลใต้ต้นฉบับ (ไม่ทับต้นฉบับ)
- **ขากลับ (ทีม→ลูกค้า)**: ปุ่ม "แปลก่อนส่ง" ในกล่องพิมพ์ → แปลเป็น `ChatContact.lang` → **ให้ทีมเห็นและยืนยันก่อนส่ง** ห้ามส่งอัตโนมัติ
  - ข้อความที่ส่งออกจริง = คำแปล · ต้นฉบับเก็บใน `ChatMessage.meta.originalBody` (ทีมย้อนดูได้ว่าตัวเองพิมพ์อะไร)
- ไม่มีเครดิต / provider ล่ม → ปุ่มบอกเหตุผลเป็นภาษาไทย **แชทยังใช้ได้ปกติ** (กฎเหล็กข้อ 4)
- 🔴 **PDPA — สาย A จับได้ ต้องทำในรอบนี้ ห้ามลืม**: `translatedBody` คือ **สำเนาเนื้อความอีกชุด**
  วันนี้ `chat/retention.ts:132` ล้างแค่ `body / stickerMeta / orderContext / meta / senderName`
  ⇒ ไม่เพิ่ม `translatedBody` + `detectedLang` + `translatedLang` + `translatedAt` เข้าไปด้วย
  = ข้อความที่ "ปกปิดแล้ว" ยังอ่านได้จากช่องคำแปล · **แพตเทิร์นเดียวกับบั๊ก `lastMessagePreview` 28 ส.ค. เป๊ะ**

### 5.3 AI แนะนำคำตอบ (ข้อ 8)
```
suggestReply({ tenantId, systemId, conversationId, userId }) → { options: [{id, body, sources[]}] }
บริบทที่ประกอบเข้า prompt (ทั้งหมดผ่าน tenantDb — ห้ามหลุดข้ามร้าน):
  1. ข้อความ 10 รายการล่าสุดของเธรด
  2. ChatAnswerExample ที่ใกล้เคียง (คลังของ §5.4)  ← แม่นขึ้นตามการใช้งาน
  3. searchKb() — คลังความรู้ของร้าน
  4. โปรไฟล์ลูกค้าถ้าผูก Member แล้ว (ยอดซื้อ/แต้ม/นัดหมายที่ยังไม่ถึง)
  5. เวลาทำการ + greeting/offline ของร้าน (business-hours.ts)
  6. ชื่อร้าน + ระบบที่ร้านเปิดใช้ (systemDef)
```
- SMART_MODEL · เสนอ **สูงสุด 3 ตัวเลือก** · ทุกตัวบันทึกเป็น `ChatAiSuggestion` พร้อม `sourcesUsed`
- 🔴 **เป็นข้อเสนอเท่านั้น ห้ามส่งเอง** — ทีมกดใส่กล่องพิมพ์ แก้ได้ แล้วค่อยกดส่ง
- 🔴 **ห้ามแต่งข้อมูล** ([[feedback_no_fabricated_trip_data]]) — prompt ต้องสั่งว่าอะไรไม่รู้ให้บอกว่าไม่รู้ ห้ามเดาราคา/วันที่/ที่ว่าง · `sourcesUsed` ว่าง = ต้องขึ้นป้ายเตือนบนตัวเลือกนั้น
- 🔴 **ห้ามสัญญาว่า "จะติดต่อกลับ"** ([[feedback_no_callback_promise]])
- หักเครดิต `chargeUsageSafe(source:"chat_suggest")` · เครดิตหมด = ปุ่มบอกตรง ๆ ไม่ใช่เงียบ

### 5.4 คลังเรียนรู้ (ข้อ 9 — หัวใจของ "อนาคตตอบได้ตรงที่สุด")
```
เส้นทางที่ 1 — ทีมกดใช้คำแนะนำ
  กด "ใส่ในกล่องพิมพ์" → ผูก suggestionId ไว้กับร่าง → กดส่งจริง
  → recordOutcome(): เทียบข้อความที่ส่งกับที่เสนอ → similarity 0..100
     · ≥95  → SENT_AS_IS
     · <95  → SENT_EDITED  (ข้อความที่ "ส่งจริง" คือความจริง ไม่ใช่ที่ AI เสนอ)
  → สร้าง ChatAnswerExample { question = ข้อความลูกค้าที่ตั้งต้น, answer = ที่ส่งจริง }

เส้นทางที่ 2 — ทีมพิมพ์เองล้วน (ไม่ได้ใช้ AI)
  → ยังเก็บเป็น ChatAnswerExample ได้ แต่ **ต้องให้คนกดยืนยัน** ("บันทึกเป็นตัวอย่างคำตอบ")
     เพราะคำตอบเฉพาะกิจ ("ครับ" / "เดี๋ยวเช็คให้") ถ้าเก็บทุกอันจะทำให้คลังเน่า

เส้นทางที่ 3 — ทีมกดข้ามคำแนะนำ
  → outcome = IGNORED (สัญญาณลบ · ใช้วัดคุณภาพรายเดือน)
```
- 🔴 **ไม่ทำ fine-tune ไม่เก็บ embedding ในรอบนี้** — ใช้ retrieval จาก `ChatAnswerExample` ด้วยวิธีเดียวกับ `searchKb` (hybrid keyword) ก่อน · การอัปเกรดเป็น embedding เป็น WO แยก ไม่ใช่รอบนี้
- 🔴 **PDPA**: `ChatAnswerExample` เป็นสำเนาเนื้อความอีกที่หนึ่ง ⇒ **ต้องถูกกวาดด้วย `retentionDays` เหมือน `lastMessagePreview`** (บทเรียน 28 ส.ค. — ปกปิดข้อความอย่างเดียวแล้วเนื้อหายังโผล่ที่อื่น) → ต้องต่อเข้า `chat/retention.ts`
- หน้าจัดการคลังอยู่ใน `chat/channels` (ดู · ถอด · แก้) — ของที่คนแก้ไม่ได้ = ของที่เน่าแล้วซ่อมไม่ได้

---

## §6 WO-CW4 — หน้าจอ WhatsApp (ข้อ 1–4, 6)

**ไฟล์:** `src/lib/modules/chat/ui.tsx` (รื้อ) · `chat/inbox-client.tsx` + `chat/bubble.tsx` + `chat/channel-icon.tsx` (ใหม่) · `src/app/app/sys/[id]/page.tsx` · `src/app/app/sys/[id]/chat/page.tsx`

### 6.1 เส้นทางหน้า
- `/app/sys/<id>` (ภาพรวม) → **กล่องแชทเต็มจอ** แทนการ์ด 2 ใบ (G1 · คำสั่งข้อ 1)
- `/app/sys/<id>/chat` → `redirect` มาที่เดียวกัน (ลิงก์เก่าใน push/แบดจ์/เอกสารต้องไม่ตาย)
- แท็บย่อยเหลือ **ภาพรวม(=แชท)** + **เชื่อมช่องทาง** · ต้องแก้ `chatTabs()` **และ** `childrenFor("CHAT")` ใน `app/layout.tsx:179` พร้อมกัน (มีข้อสอบ `qc-nav-functions` เฝ้าอยู่)

### 6.2 หน้าตา (เทียบ WhatsApp Web ตรง ๆ)

| ส่วน | WhatsApp | ของเรา |
|---|---|---|
| ซ้าย | รายชื่อแชท | รายชื่อ + ช่องค้นหา + แท็บ `ทั้งหมด · ยังไม่อ่าน · ของฉัน · ปิดแล้ว` |
| แถวรายชื่อ | avatar กลม + ชื่อ + preview + เวลา + badge | เหมือนกัน **+ ไอคอนช่องทางเป็น badge เล็กมุมล่างขวาของ avatar** |
| ขวา-หัว | avatar + ชื่อ + สถานะ | + ป้ายช่องทาง · ผู้รับผิดชอบ · ปุ่มมอบหมาย/ปิดเธรด · ลิงก์โปรไฟล์สมาชิก |
| ขวา-กลาง | ฟองมีหาง · คั่นวันที่ · ติ๊ก | เหมือนกัน — ขาเข้าชิดซ้ายพื้นขาว · ขาออกชิดขวาพื้นเทาอ่อน (โทน SHARK ตามมติ W1) · คั่น "วันนี้/เมื่อวาน/31 ส.ค." · ✓ = ส่งแล้ว · ✓✓ = ลูกค้าอ่านแล้ว (`markCustomerRead` มีข้อมูลอยู่แล้ว) · ✗ = ส่งไม่สำเร็จ + ปุ่มลองใหม่ |
| ขวา-ล่าง | composer | 📎 แนบไฟล์ · 📷 ถ่ายรูป · ช่องพิมพ์ยืดอัตโนมัติ · ปุ่มส่ง · **✨ AI แนะนำ** · **🌐 แปลก่อนส่ง** · สลับโหมด "โน้ตภายใน" |

- **ถ่ายรูป** = `<input type="file" accept="image/*" capture="environment">` — บนมือถือเปิดกล้องจริง บนเดสก์ท็อปตกเป็นเลือกไฟล์ (ไม่ต้องขอสิทธิ์กล้อง ไม่ต้องเขียน getUserMedia)
- แสดงตัวอย่างรูปก่อนส่ง + ลบออกได้ + บอกขนาดเมื่อเกิน 10 MB **ก่อน**อัป (ไม่ใช่ให้อัปแล้วค่อยเด้ง error)
- 🔴 `uploadFile` ในเทส headless: **chromium บนเครื่องนี้เป็น snap มี /tmp ส่วนตัว** วางไฟล์ทดสอบใต้ `/root/projects/...` เท่านั้น (บทเรียน 31 ส.ค.)

### 6.3 ไอคอนช่องทาง (ข้อ 4)
- ไฟล์เดียว `channel-icon.tsx` — `ChatChannelType → { icon, label, color }` **ทะเบียนเดียวในระบบ** ห้ามพิมพ์ลิสต์ซ้ำที่อื่น (บทเรียน AS-6.1/6.3)
- ครอบทุกค่าใน enum: `LINE · WHATSAPP · WEBCHAT(เว็บ) · APP(แอป) · FACEBOOK(Messenger) · INSTAGRAM · TIKTOK · SHOPEE · LAZADA`
- SVG inline (ไม่ดึงจาก CDN ภายนอก — โหลดช้า/หายได้/เป็นการส่งข้อมูลออกนอก)
- ⚠️ **ไอคอนมี ≠ ช่องทางใช้ได้** — WhatsApp/Messenger/IG/TikTok ยังไม่มี adapter (คอขวดคือการอนุมัติของแพลตฟอร์ม ไม่ใช่โค้ด — PLAN-CHAT-PLATFORM §9 F4-F6) ⇒ ในหน้า "เชื่อมช่องทาง" ต้องขึ้นชัดว่า "ยังไม่เปิด" ห้ามทำให้เจ้าของเข้าใจว่าเชื่อมได้แล้ว

### 6.4 ความสด (แทน AutoRefresh ทั้งหน้า)
- client component + server action `loadInboxAction` / `loadThreadAction` ทุก 5 วิ (เฉพาะห้องที่เปิดอยู่ + รายการซ้าย)
- 🔴 **ห้ามถอยหลังจาก G2**: ของเดิม `router.refresh()` ทุก 7 วิ ทำให้ตัวนับ `staffUnreadCount` และติ๊ก ✓✓ สดตามไปด้วย — ตัวใหม่ต้องพา 3 อย่างนี้มาครบ (ข้อความ · ตัวนับ · ติ๊ก)
- 🔴 **ห้ามเด้งคนที่กำลังพิมพ์** — ร่างข้อความ + ไฟล์แนบที่เลือกไว้ต้องรอดทุกรอบ poll
- ไม่ทำ SSE ในรอบนี้ (ต้นทุน connection ค้างบน Vercel — F3 ของแผนเดิม)

---

## §7 WO-CW5 — ระบบแจ้งเตือน (ข้อ 5)

**ไฟล์:** `src/lib/core/push.ts` · `src/lib/modules/chat/notify.ts` (ใหม่) · `src/components/chat-notify-client.tsx` (ใหม่) · `/app/app/notifications`

1. **ตอนไม่ได้เปิดหน้า** — push (มีแล้ว 29 ส.ค.) + `AppNotification` แถวในระบบ
   - 🔴 **แก้ G9**: `sendPushToTenant` ยิงทุกเครื่องในร้าน → ต้องยิงเฉพาะ **คนที่มี `chat.conversation.read`** และถ้าเธรดถูก assign แล้ว ให้ยิงผู้รับผิดชอบก่อน
2. **ตอนเปิดหน้าอยู่** — เสียงเตือนสั้น + เลข unread บน `document.title` + ไฮไลต์แถว
   - เสียงต้องปิดได้และจำค่าไว้ (localStorage) · ห้ามเล่นเสียงก่อนผู้ใช้มีปฏิสัมพันธ์กับหน้า (เบราว์เซอร์บล็อกอยู่แล้ว — ต้องไม่โยน error ขึ้นคอนโซล)
3. **Web Notification API** — ขออนุญาตเฉพาะตอนผู้ใช้กดเปิดเอง ไม่ใช่เด้งขอทันทีที่เข้าหน้า
4. เงื่อนไขไม่แจ้ง: ห้องที่กำลังเปิดดูอยู่ · ข้อความของตัวเอง · โน้ตภายใน
5. 🔴 `sendPushToTenant` เคยคืน `{sent:1}` ทั้งที่ Expo ปฏิเสธทุกใบ — **ตัวเลขที่โกหกแพงกว่าไม่มีตัวเลข** ตัวนับใหม่ต้องนับเฉพาะที่ Expo รับจริง

---

## §8 WO-CW6 — ข้อสอบ (เขียน "ก่อน" โค้ด)

โครงบังคับตามแบบ repo: header `// QC — … · Fable oracle, Builder ห้ามแตะ` + `สัญญา:` + `process.loadEnvFile` + `chk()` + `JSON_SUMMARY` + `exit(CRITICAL>0)` · `await import("@/path" as string).catch(() => null)`
🔴 `ls scripts/qc-*.mts` ก่อนตั้งชื่อทุกครั้ง (บทเรียน 28 ส.ค. — เกือบเขียนทับด่านเดิมทั้งชุด)
🔴 ทุกข้อต้องพิสูจน์ **fail-before** · ข้อสอบแนว "ต้องไม่เกิด X" **ต้องมีคู่บวก** ที่พิสูจน์ว่าโค้ดเดินไปถึงจุดนั้นจริง (บทเรียน WO-C3b)

| ไฟล์ | คุม |
|---|---|
| `qc-chat-staff-perms.mts` | G6/G7/G8 · STAFF ไม่มีสิทธิ์ต้องอ่าน/ตอบไม่ได้ · OWNER คนสุดท้ายลดสิทธิ์ไม่ได้ · MANAGER ยกตัวเองเป็น OWNER ไม่ได้ · แก้สิทธิ์ตัวเองไม่ได้ · `linkedUserId` ถูกเซ็ตจริง |
| `qc-chat-attachments.mts` | ส่งไฟล์อย่างเดียวไม่มีข้อความได้ · เกิน 10 MB ปฏิเสธ · MIME นอก allowlist ปฏิเสธ · อัปโหลดอยู่นอกทรานแซกชัน · LINE ได้ image message |
| `qc-chat-translate.mts` | แปลซ้ำไม่จ่ายซ้ำ · ต้นฉบับไม่ถูกทับ · ไม่มีเครดิต → แชทยังส่งได้ · provider ล่ม → ไม่ throw |
| `qc-chat-ai-suggest.mts` | ไม่ส่งเอง · ข้อมูลข้ามร้านไม่หลุดเข้า prompt · `sourcesUsed` บันทึกจริง · เครดิตหมดบอกตรง ๆ · outcome/similarity บันทึกถูก · IGNORED ไม่เข้าคลัง |
| `qc-chat-learning.mts` | คลังโตเฉพาะจากคำตอบที่ส่งจริง · พิมพ์เองต้องกดยืนยันก่อนเข้าคลัง · `retentionDays` กวาด `ChatAnswerExample` ด้วย |
| `qc-chat-inbox-ui.mts` | เมนู/แท็บ/`childrenFor("CHAT")` ตรงกัน · `/chat` redirect ไม่ตาย · ไอคอนครบทุกค่าใน enum จากทะเบียนเดียว · ปุ่มถ่ายรูป/แนบไฟล์มีจริงและกดถึงจากเมนู · ร่างไม่หายตอน poll |
| `qc-chat-notify-v2.mts` | ยิงเฉพาะคนมีสิทธิ์ · ไม่แจ้งห้องที่เปิดอยู่/ข้อความตัวเอง/โน้ตภายใน · ตัวนับ `sent` ไม่โกหก |

---

## §9 การแบ่งงาน sub agent (กันชนไฟล์)

| รอบ | สาย | WO | ไฟล์ที่ถือ (ห้ามคนอื่นแตะ) |
|---|---|---|---|
| 1 | **A** | CW1 schema | `prisma/schema/chat.prisma` · `src/lib/core/scope.ts` · `prisma/migrations/**` |
| 1 | **B** | CW6 ข้อสอบ | `scripts/qc-chat-*.mts` (ไฟล์ใหม่เท่านั้น) |
| 1 | **C** | CW2 สิทธิ์ | `src/lib/staff/**` · `src/lib/core/permissions.ts` · `src/app/app/settings/staff/**` |
| 2 | **D** | CW3 core | `src/lib/modules/chat/{service,actions,ai-suggest,translate,learning}.ts` |
| 2 | **E** | CW5 แจ้งเตือน | `src/lib/core/push.ts` · `src/lib/modules/chat/notify.ts` · `src/components/chat-notify-client.tsx` |
| 3 | **F** | CW4 หน้าจอ | `src/lib/modules/chat/{ui,inbox-client,bubble,channel-icon}.tsx` · `src/app/app/sys/[id]/**` |

- `src/app/app/layout.tsx` แตะได้ **สายเดียว = F** (สาย C ส่งชื่อลิงก์ให้ Fable ใส่แทน)
- **หน้าที่ Fable ทุกรอบ**: ประกอบ → `pnpm typecheck` + `pnpm fitness` + `pnpm qc:all` → ตรวจว่าข้อสอบที่เขียวเป็นด่านจริง (fail-before) → **เดินเส้นทางจริงจากเมนูบนเบราว์เซอร์** (กฎเหล็กข้อ 6) → เขียนสถานะลง §10

---

## §10 สถานะสด

| WO | สถานะ | หมายเหตุ |
|---|---|---|
| **CW1 schema** | ✅ **เสร็จ 31 ส.ค.** | N1–N5 ครบ · migration 2 ตัว (`…044050_chat_channel_app_tiktok` · `…044121_chat_ai_suggest_answer_example_translate`) additive ล้วน · `validate`/`generate`/`typecheck` EXIT=0 · `fitness 17/17` · `drift` No difference · **ยังไม่ `migrate deploy` บน prod** (prod pending 2 ตัว) |
| CW6 ข้อสอบ | 🔵 กำลังทำ (รอบ 1) | 7 ไฟล์เขียนแล้ว · ⚠️ `qc-chat-staff-perms.mts` + `qc-chat-notify-v2.mts` **ทำ `pnpm typecheck` แดง 11 error** — ต้องปิดก่อนประกอบ |
| **CW2 สิทธิ์** | ✅ **เสร็จ 31 ส.ค.** | `core/permissions.ts` (256 action) · `staff/service.ts`+`actions.ts` · `/app/settings/staff` (+หน้าแก้รายคน) · `rbac.ts` เพิ่ม `canAssignRole`/`canGrantPermission`/… (ไม่แตะ `evaluate()`) · ลิงก์เมนูใส่ที่ `NavDrawer.tsx` แล้ว · `fitness 17/17` · `qc-chat-staff-perms` **44/49** (5 ที่แดง = SP-3.x ขาอ่านของสาย D/F) |
| **CW3 core** | ✅ **เสร็จ 31 ส.ค.** | `sendReply` รับไฟล์แนบ (อัปนอก tx · ส่งไฟล์ล้วนได้) · `translate.ts` · `ai-suggest.ts` · `learning.ts` · `guard.ts` · 6 action ใหม่ · ปิดหนี้ **H1/H2** (retention ล้างคำแปล + กวาดคลัง) · **IU-4.7** · ตัด preview ออกจาก `AppNotification` (M-2)<br>`qc-chat-attachments` **30/30** · `translate` **34/34** · `ai-suggest` **44/44** · `learning` 31/32 (LN-9.1 = หน้าจอสาย F) · ของเดิมไม่พัง: `core-v2` 41/41 · `retention` 37/37 · `api-v1` 89/89 · `security-scope` 20/20 |
| **CW5 แจ้งเตือน** | ✅ **เสร็จ 31 ส.ค.** | `chat/notify.ts` (กติกาเลือกผู้รับแบบ pure) · `push.ts` += `sendPushToChatStaff` (กรองด้วย `evaluate()` + `unitAccess` · assignee ขึ้นหัวคิว) · `chat-notify-client.tsx` · **`qc-chat-notify-v2` 30/30** · `qc-push` 7/7 (ของเดิมไม่พัง) · `typecheck` EXIT=0 · `fitness 17/17` |
| **CW4 หน้าจอ** | ✅ **เสร็จ 31 ส.ค.** | `inbox-client.tsx` · `bubble.tsx` · `channel-icon.tsx` · `inbox-actions.ts` · รื้อ `ui.tsx` · `/app/sys/<id>` = กล่องแชทเต็มจอ · `/chat` redirect พา `?c=` ไปด้วย<br>⚠️ **สาย F ตายกลางทาง ไม่ได้ส่งรายงาน** — Fable เก็บงานต่อเอง 4 จุด (ดูบันทึกท้ายไฟล์) |

**หนี้ที่ส่งต่อจาก CW1 → สายอื่น (ห้ามตกหล่น)**
| # | เรื่อง | ใครรับ |
|---|---|---|
| H1 | `retention.ts` ต้องล้าง `translatedBody`/`detectedLang`/`translatedLang`/`translatedAt` ด้วย (§5.2) | **สาย D** |
| H2 | `retention.ts` ต้องกวาด `ChatAnswerExample` ด้วย (§5.4) | **สาย D** |
| H3 | `ChatAiSuggestion`/`ChatAnswerExample` **ไม่มี FK ที่ระดับ DB** (ตามแบบ `ChatWebhookLog`/`ChatQuickReply` เดิม) ⇒ ต้องตรวจ `conversationId`/`sourceMessageId` ในโค้ดเอง | **สาย D** |
| H4 | `CHANNEL_LABEL` (ui.tsx) · `CHAT_CHANNEL_TH` (ai/tools.ts) · `CHANNEL_LABEL_TH` (chat/service.ts) เป็น `Record<string,string>` ⇒ **typecheck ไม่แดง แต่ `APP`/`TIKTOK` จะได้ป้ายว่าง** · ทั้ง 3 ที่คือลิสต์ที่พิมพ์มือซ้ำกัน → ยุบเหลือทะเบียนเดียวตาม §6.3 | **สาย F** (D แก้เฉพาะของตัวเอง) |
| H5 | สาย A แตะ `src/app/api/chat/webhook/[connectionId]/route.ts` (3 บรรทัด — เลิกพิมพ์ union ช่องทางด้วยมือ ใช้ `ChatChannelType` จาก enum) | แจ้งไว้กัน **สาย D/F** ชน |
| H6 | `ChatAiSuggestion.outcome` เป็น `String` ไม่ใช่ enum (ตามแบบ `ChatWebhookLog.status` เดิม) ⇒ ไม่มีด่านที่ระดับ DB · ค่าที่ใช้ได้ต้องคุมในโค้ด + ข้อสอบ | **สาย D** |

## §11 มติของ Fable ระหว่างทาง (สายงานต้องทำตาม)

### M-1 · ชนกันเชิงสเปค: CP-1.7 (WO-C14 เดิม) ปะทะ NV-3.3 (WO-CW5 ใหม่)
- **CP-1.7** บอก: ทีมกดอ่านแล้วลูกค้าทักใหม่ → **ต้อง** push อีกครั้ง (de-dup ต้องรีเซ็ต ไม่ใช่เงียบตลอดกาล)
- **NV-3.3** บอก: คนที่ `lastReadAt` สด = กำลังเปิดห้องอยู่ → **ห้าม** push
- ในฉากของ CP-1.7 เครื่องเดียวในร้านเป็นของคนที่เพิ่งกดอ่าน ⇒ กติกาใหม่กลืนกติกาเก่า
- 🔴 **ความเสี่ยงจริง**: ร้านคนเดียว — อ่านแล้วปิดแอป ลูกค้าตอบกลับใน 60 วิ = **ไม่ได้แจ้งเตือนเลย**

**มติ (ทั้ง 3 ข้อต้องทำคู่กัน ทำข้อเดียวไม่ปิดความเสี่ยง)**
1. `VIEWING_WINDOW_MS` **60 วิ → 20 วิ**
2. 🔴 **สาย F: การ poll ห้องที่เปิดอยู่ต้องรีเฟรช `ChatReadState.lastReadAt` ทุกรอบ (heartbeat)**
   — นี่คือสิ่งที่ทำให้ 20 วิ ถูกต้อง: เปิดหน้าอยู่ = ค่าสดตลอด (poll ทุก 5 วิ) · ปิดหน้า = ค่าเก่าเกิน 20 วิ แล้ว push กลับมาเอง
   **ถ้าไม่ทำข้อนี้ `lastReadAt` จะเป็นแค่ "เคยกดอ่านเมื่อไหร่" ไม่ใช่ "กำลังดูอยู่ไหม" = ตัวชี้วัดผิดตัว**
3. **CP-1.7 ต้อง seed พนักงานคนที่ 2 ที่ไม่ได้เปิดห้อง** — คืนเจตนาเดิมของข้อสอบ (วัด **de-dup รีเซ็ต**) ไม่ให้ไปวัดเรื่อง presence ที่เป็นคนละเรื่อง
🔴 **เหตุผลที่แก้ข้อสอบไม่ใช่แก้โค้ด**: CP-1.7 เขียนตอนที่ยังไม่มีแนวคิด "กำลังเปิดดูอยู่" ⇒ ฉากของมันบังเอิญวัด 2 เรื่องพร้อมกัน · แต่ **ห้ามลดการรับประกันเดิม** — de-dup ต้องยังรีเซ็ตจริง แค่ให้คนที่วัดเป็นคนที่ไม่ได้เปิดห้อง

### M-2 · 🔴 G11 (ใหม่ · สาย E พบ) — ช่องโหว่ตัวที่ 2 ของแพตเทิร์นเดียวกับ G9
`announceInbound` เขียน**ตัวอย่างข้อความลูกค้า**ลง `AppNotification` ซึ่งเป็น **tenant-wide** (สคีมาไม่มี `userId`/`role`)
และ `/app/notifications` เรียก `listNotifications({tenantId})` **ไม่มี `assertCan` เลย**
⇒ ปิดทาง push ให้คนไม่มีสิทธิ์แล้ว แต่คนเดิม**ยังเปิดศูนย์แจ้งเตือนอ่านข้อความลูกค้าได้อยู่ดี**
- **รอบนี้ (สาย D)**: ตัดตัวอย่างเนื้อความออกจาก `AppNotification.body` เหลือชื่อ/ช่องทาง/ลิงก์ — **ไม่ตัดของ push** (push กรองผู้รับด้วยสิทธิ์จริงแล้ว จึงยังใส่ตัวอย่างได้ = ประโยชน์หลักของการแจ้งเตือน)
- **WO ถัดไป (ยังไม่ทำรอบนี้)**: `AppNotification` ต้องมีช่องผู้รับ/สิทธิ์ที่ต้องใช้ + หน้า `/app/notifications` ต้องกรอง — ต้องใช้ 3 สาย (schema → ผู้สร้าง → หน้าจอ)

---

**บันทึกความคืบหน้า**
- 31 ส.ค. 2026 — Fable สำรวจโค้ดจริง เขียนแผนฉบับนี้ · เจ้าของเคาะ W1/W2/W3
- 31 ส.ค. 2026 — 🔴 **บทเรียนของรอบนี้: แผนที่เขียนจาก grep ผิดได้ 3 จุดในไฟล์เดียว**
  Fable เขียน G8 ผิด (ของจริงมี `assertChatCan` ครบแล้ว ช่องโหว่อยู่ขาอ่าน) · ตั้งชื่อ action ทับของเดิม 5 ตัว ·
  อ้างข้อจำกัดของ Postgres จากความจำแทนที่จะวัดเวอร์ชันจริง · และ**ตกเรื่อง `AiCreditSource` ทั้งหมด**
  ⇒ ทั้ง 4 จุดถูกจับโดย **builder ที่ถูกสั่งให้รายงานความไม่ตรง แทนที่จะดัดโค้ดให้เข้าแผน**
  **คำสั่งที่ทำให้เจอ**: "จุดที่แผนไม่ตรงกับโค้ดจริง — ข้อนี้สำคัญที่สุด ห้ามเงียบ" · ต้องใส่ทุกครั้ง
- 31 ส.ค. 2026 — 🔴 **ข้อสอบ 2 ชุดวัดผิดตัวเพราะ seed ไม่เหมือนของจริง** (เจอ 2 ชุดในวันเดียว)
  `qc-chat-notify-v2` — `chatContact` ไม่มี `channelConnectionId` ⇒ `findOrCreateContact` สร้างห้องใหม่ทุกครั้ง
  แถวที่ seed ไว้ (assignee/ChatReadState) ไม่เคยถูกใช้ ⇒ **2 ข้อเขียวไม่ได้ไม่ว่าโค้ดถูกแค่ไหน** (แก้แล้ว **30/30**)
  `qc-chat-push-badge` — seed มี `pushDevice` แต่**ไม่มีแถว `membership` เลย** ⇒ พอ push กรองด้วยสิทธิ์จริง
  ผู้รับเหลือ 0 คนอย่างถูกต้อง แล้ว 10 ข้อแดง · เติม membership แล้วกลับมา 45/48
  **บทเรียน: fake ที่ "พอใช้" กับสเปคเก่า จะกลายเป็นไม้บรรทัดที่โกหกทันทีที่สเปคเข้มขึ้น**
- 31 ส.ค. 2026 — **Fable ปิดงานฝั่งไม้บรรทัดเอง** (สายงานห้ามแตะข้อสอบ จึงเป็นหน้าที่ผู้คุม):
  · `qc-chat-notify-v2` **30/30** (แก้ seed `channelConnectionId`)
  · `qc-chat-push-badge` 35/48 → **48/48** — แก้ 3 อย่าง: เติมแถว `membership` ใน seed ·
    CP-1.14/1.15 เลิกล็อกชื่อ `sendPushToTenant` เปลี่ยนเป็น `sendPushToChatStaff` (เจตนาเดิมไม่เปลี่ยน:
    ทางเข้าทุกทางต้องผ่านจุดยิงเดียว) · CP-1.7 ดันเวลาอ่านให้พ้นหน้าต่าง = จำลอง "อ่านแล้วปิดหน้าไป"
    ซึ่งเป็นฉากที่ข้อนั้นตั้งใจวัดจริง ๆ (de-dup รีเซ็ต) ไม่ใช่เรื่อง presence ที่เพิ่งเกิด
  · `VIEWING_WINDOW_MS` 60 → **20 วิ** ตามมติ M-1 + เขียนคำเตือนผูกไว้กับ heartbeat ของ WO-CW4
    (ถ้าวันไหนหน้าจอเลิกทำ heartbeat ค่านี้จะกลายเป็นตัวชี้วัดผิดตัวทันที)
  · เพิ่ม `chat.example.manage` แยกจาก `chat.message.send` — "ตอบลูกค้า 1 ครั้ง" เป็นของชั่วคราว
    แต่ "บันทึก/ถอดตัวอย่างคำตอบ" ไปแก้แหล่งอ้างอิงถาวรที่ AI ใช้ตอบให้ทุกคนในร้าน · ถอดธง `planned`
    ของ `chat.conversation.read`/`ai.suggest`/`translate.use` (ถูก wire จริงแล้ว)
- 31 ส.ค. 2026 — 🔴 **สาย F (หน้าจอ) ตายกลางทางโดยไม่ส่งรายงาน** (เขียนไฟล์ครั้งสุดท้าย 06:07 · session ถูกรีเซ็ต)
  Fable ตรวจของบนดิสก์เองแล้วเก็บงานต่อ 4 จุด:
  1. `chatTabs()` ยังเหลือ 3 แท็บ — "สนทนา" ชี้กลับมาที่เดิม = แท็บซ้ำ · ตัดออกจาก **ทั้ง 2 ทะเบียนพร้อมกัน**
  2. `qc-chat-inbox-ui` อ่านแค่ `chat/actions.ts` แต่ F แยก action ไป `inbox-actions.ts` (สมเหตุผล ไฟล์เดิมยาวมาก)
     → เจตนาของด่านคือ "ปุ่มต้องผูกกับ action จริง" ไม่ใช่ที่อยู่ไฟล์ ⇒ อ่านทั้ง 2 ไฟล์ ความเข้มไม่ลด
  3. `qc-nav-functions` S5 (กันหน้ากำพร้า) ชนกับหน้า `/chat` ที่ต้องคงอยู่เพื่อลิงก์เก่า
     🔴 ลองเขียนเป็นฮิวริสติก "หน้าที่ redirect อย่างเดียว" ก่อน **แล้วพบว่าใช้ไม่ได้** เพราะหน้านั้นมี JSX
     อธิบายกรณีไม่มีสิทธิ์อยู่ด้วย (ดีไซน์ที่ถูก) ⇒ เปลี่ยนเป็น `COMPAT_REDIRECTS` รายชื่อที่ต้องเขียนเหตุผลกำกับ
     **ฮิวริสติกจะกลืนหน้าจริงในอนาคตโดยไม่มีใครรู้ · รายชื่อบังคับให้ต้องอธิบายทุกครั้ง**
  4. `qc-chat-push-badge` CP-3.9 วัดความสดจาก `<AutoRefresh ms=…>` ซึ่งถูกถอดไปแล้ว → วัด "จังหวะสั้นสุดที่เจอ" แทน
- 31 ส.ค. 2026 — 🔴🔴 **`pnpm build` ล้ม ทั้งที่ข้อสอบ 171 ชุด + typecheck เขียวหมด**
  `src/lib/staff/actions.ts` (`"use server"`) `export const staffFormInitial = {...}` →
  `A "use server" file can only export async functions, found object.`
  **`tsc --noEmit` จับไม่ได้ · ข้อสอบทุกชุดจับไม่ได้ · เห็นตอน build เท่านั้น** (type ไม่เป็นไร เพราะถูกลบตอนคอมไพล์ — ค่าจริงเป็นไร)
  → ย้ายไป `src/lib/staff/form-state.ts` · สแกนทั้งรีโปแล้วไม่มีที่อื่นพลาดแบบเดียวกัน
  **บทเรียน: `pnpm build` เป็นด่านที่ข้อสอบแทนไม่ได้ ต้องรันก่อนบอกว่าเสร็จเสมอ**
- 31 ส.ค. 2026 — 🔴 **ภาพหน้าจอจริงจับสิ่งที่ข้อสอบ 402 ข้อจับไม่ได้: กล่องพิมพ์ตกใต้ขอบจอ**
  วัดได้เป็นตัวเลข: `textarea` อยู่ที่ **933px บนจอสูง 900px** · หน้าสูง 1096px = เลื่อนทั้งหน้า
  ⇒ ทีมต้องเลื่อนผ่านรายการ 13 ห้องก่อนถึงจะพิมพ์ได้ = ผิดหลัก WhatsApp (มติ W1)
  เหตุ: การ์ดห้องแชทใช้ `min-h-[60vh]` (สูงตามเนื้อหา) แทนความสูงตายตัว
  → `h-[calc(100dvh-13rem)] sm:h-[calc(100vh-19rem)]` ให้พื้นที่ข้อความเลื่อนข้างในตัวเอง · วัดซ้ำ = อยู่ในจอแล้ว
  🔴 และตอนวินิจฉัยต้องแยกให้ออกว่า **หน้าสูงเพราะเปลือกแอป (`main.pb-24`) ไม่ใช่เพราะกล่องแชท**
  (section ของกล่องแชท = 792px < จอ 900px) ⇒ ด่านต้องวัด section ไม่ใช่ทั้งหน้า ไม่งั้นโทษผิดตัว
- 31 ส.ค. 2026 — ⚠️ **`visual-qc-chat.mts` จงใจไม่ขึ้นต้นด้วย `qc-`**
  ครั้งแรกตั้งชื่อ `qc-visual-chat.mts` แล้ว `qc:all` ดูดเข้าเป็นด่านทันที → **CI จะแดงถาวร**
  เพราะชุดนี้ต้องมี build + เซิร์ฟเวอร์ + chromium ซึ่ง CI ไม่มีสักอย่าง
  🔴 ทางเลือก "ไม่มีเซิร์ฟเวอร์ = ข้ามแล้วเขียว" **ห้ามทำ** — ด่านที่เขียวตอนวัดอะไรไม่ได้คือไม้บรรทัดที่โกหก
  ⇒ รันมือด้วย `pnpm qc:visual`
- 31 ส.ค. 2026 — ✅ **ปิดงานทั้งชุด**: `migrate deploy` ลง prod ครบ 3 migration (ข้อมูลเดิมรอด: ข้อความ 79 ·
  ห้องแชท 13 · ผู้ติดต่อ 13 · ตั้งค่า 4 ร้าน) · `drift` = No difference · `typecheck` EXIT=0 · `fitness 17/17` ·
  **`qc:all` 171/171 ชุด** · `pnpm build` EXIT=0 · `qc:visual` ผ่านทั้งหมด (ถ่ายจอจริง 3 ใบ)
  ✅ **commit + push + deploy ขึ้น prod แล้ว** (`8264d57` → `c05d2a4` → `ce0e353`) · ยืนยันด้วย commit SHA ของ deployment
- 1 ก.ย. 2026 — 🔴🔴 **เจ้าของรายงาน "รับข้อความได้ แต่ส่งข้อความไม่ออก" — และมันคือบั๊กจริง**
  **ผมพลาดเอง: ตรวจแค่ว่ากล่องพิมพ์แสดงผลถูก ไม่เคยกดปุ่มส่งจริงสักครั้ง**
  (ข้อสอบ 402 ข้อ + `qc:visual` 11 ข้อ ไม่มีข้อไหนกดส่ง — ช่องว่างเดียวกับบทเรียน "ต้องเดินครบวงกลม")
  🔴 **และระหว่างวินิจฉัยผมอ่านผลของตัวเองผิด 1 รอบ** — สั่ง `tail` กับรายการที่เรียงใหม่ไปเก่า
  แล้วสรุปว่า "ไม่มีข้อความขาออกวันนี้เลย" ทั้งที่ของใหม่อยู่ **บนสุด** · ต้องแก้คำพูดกับเจ้าของ
  ⇒ **บทเรียน: คำสั่งตัดบรรทัดต้องเข้ากับทิศทางการเรียง ไม่งั้นได้ข้อสรุปกลับด้าน**

  **สิ่งที่วัดได้จริงบน prod**
  · ข้อความของทีมลง DB ครบทุกใบ · `deliveryStatus=SENT` ทั้งหมด ไม่มี FAILED สักใบ
  · แต่ event `chat.message.sent` **ค้างในคิว 557–600 วินาที** ก่อนถูกประมวลผล (ของเดิมหน่วง 0 วิ)
  · ⇒ ลูกค้าบนเว็บไม่เห็นคำตอบจนกว่าคิวจะถูกระบาย · กรณีแย่สุดรอ cron รายชั่วโมง ≈ เกือบ 1 ชม.
  · ยืนยันปลายทางแล้วว่าเมื่อคิวถูกระบาย ข้อความถึง `SupportMessage` ของ siamdive2 จริง

  **เหตุ**: `void drainAll().catch(() => {})` เป็น floating promise ·
  บน Vercel แลมบ์ดา **ถูกแช่แข็งทันทีที่ response จบ** งานที่ยังค้างจึงถูกตัดกลางคัน
  🔴 **ไม่ใช่บั๊กของแชทอย่างเดียว** — ท่าเดียวกันอยู่ใน `pos`/`forms`/`kanban` ด้วย รวม 9 จุด

  **แก้**: `scheduleDrain()` ห่อด้วย `after()` ของ Next (บอกรันไทม์ว่ายังมีงานค้าง อย่าเพิ่งตัด ·
  บน Vercel ผูกกับ waitUntil) · ผู้ใช้ไม่ต้องรอเพราะไม่ได้ await ก่อนตอบ แต่ของไม่หาย ·
  นอกบริบทคำขอ (สคริปต์/ข้อสอบ/cron) `after()` โยน error → ตกกลับท่าเดิมซึ่งใช้ได้ดี
  **วัดซ้ำหลังแก้บน prod: หน่วง 557 วิ → 1 วิ**
- 1 ก.ย. 2026 — 🔴🔴 **บั๊กตัวที่ 2 ของอาการเดียวกัน (เจ้าของส่งภาพหน้าจอมา)**
  ข้อความ "S" ขึ้นในห้องพร้อมติ๊ก ✓ เรียบร้อย **แต่จอขึ้นแถบแดง "ส่งข้อความไม่สำเร็จ"
  และเอาข้อความกลับเข้าช่องพิมพ์** ⇒ ถ้าเชื่อแล้วกดซ้ำ ลูกค้าได้ข้อความซ้ำ
  **เหตุ**: `sendReplyAction` จบด้วย `redirect()` ซึ่ง Next ใช้ **การโยน error พิเศษ** เป็นกลไก ·
  หน้าจอใหม่เรียก action ตรง ๆ (ไม่ผ่าน `<form action>`) แล้วครอบ try/catch
  ⇒ catch คว้า error ของ redirect ไปตีความว่าล้ม
  🔴 **คอมเมนต์ในโค้ดเขียนข้อสมมติผิดไว้ตรง ๆ** ("redirect ถูก Next จัดการเอง ที่ตกมาถึงนี่คือความผิดพลาดจริง")
  และไม่มีข้อสอบข้อไหนวัดมัน — **ข้อสมมติที่เขียนเป็นคอมเมนต์ ไม่ใช่ข้อสอบ ไม่มีใครตรวจให้**
  **แก้**: คืน `{ ok, reason, messageId }` ไม่ redirect · จอตัดสินจากค่าที่คืนมา ·
  คืนร่างเฉพาะตอนไม่ได้บันทึกจริง **และ**ผู้ใช้ยังไม่พิมพ์อะไรใหม่ทับ
  · เพิ่ม **🕐 ฟองสถานะ "กำลังส่ง"** ตามที่เจ้าของสั่ง (ของเดิมข้อความหายจากช่องพิมพ์แล้วเงียบ
  จนกว่ารอบ poll ถัดไปจะดึงมา ⇒ ไม่รู้ว่ากำลังส่งอยู่หรือหายไปแล้ว)
  · ด่านใหม่ **IU-11** 6 ข้อ: ห้าม redirect ในเส้นทางส่ง · ต้องคืนผลลัพธ์ · จอต้องอ่านค่าที่คืนมา
    ไม่ใช่เดาจาก exception · ต้องมีสถานะกำลังส่งทั้งฝั่ง state และ bubble
  🔴 **บทเรียนเครื่องมือ**: `pnpm build` จับ `chk()` ที่ส่งพารามิเตอร์ไม่ครบในไฟล์ข้อสอบเอง
  ซึ่ง **รันผ่านตอน tsx แต่ typecheck ไม่ผ่าน** — build เป็นด่านคนละชั้นกับข้อสอบ ต้องรันทุกครั้ง

  **ไม้บรรทัด**: CP-5.1/CP-1.15 เคยล็อกชื่อ `drainAll()` ตรง ๆ ⇒ ถ้าปล่อยไว้จะ**บังคับให้กลับไปใช้
  ท่าที่ทำให้หน่วง 10 นาที** · เปลี่ยนเป็นรับทั้ง `scheduleDrain`/`drainAll` เจตนาของด่านไม่เปลี่ยน
  · เพิ่ม **`pnpm qc:send`** — กดปุ่มส่งจริงบนเบราว์เซอร์แล้วตรวจว่าแถวลง DB (ส่งเป็นโน้ตภายในได้
  เพื่อไม่ให้ข้อความทดสอบหลุดถึงลูกค้า) · เครื่องมือ `diag-outbox-lag` วัดหน่วงคิวได้ตลอด
  (ข้อสอบ 3 ชุดที่ต่อ Neon จริง — `qc-chat-notify` · `qc-chat-security` · `qc-chat-member-autolink` —
  แดงหมดด้วย `ChatMessage.detectedLang does not exist` **นี่คืออาการที่ถูกต้อง** ของ prod ที่ยังไม่รับ migration)
  🔴 **สิ่งที่พบและสำคัญกว่าคำสั่ง**: ระบบไม่มีหน้าจอจัดการผู้ใช้งานเลย (G6) · `HrEmployee.linkedUserId`
  เป็นฟิลด์ตายที่ไม่มีโค้ดไหนใช้ (G7) · และ **การกระทำของแชทไม่ผ่าน RBAC สักเส้น** (G8)
  ⇒ ข้อ 7 ของเจ้าของไม่ใช่ "เพิ่มสวิตช์" แต่เป็นการปิดช่องโหว่ที่เปิดอยู่
