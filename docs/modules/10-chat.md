# โมดูล 10 — Chat รวม (ลูกค้า ↔ ร้าน)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **tenant** (inbox เดียวต่อองค์กร, ข้อความ/บทสนทนา tag `unitId?` ตามช่องทางที่ลูกค้าทักเข้ามา)
> ยึด: `../BLUEPRINT.md` · `../BLUEPRINT_BUSINESS_UNITS.md` · `_CONVENTIONS.md`
> คู่แฝดคนละตัว: โมดูล 11 Meeting = แชท**ภายในองค์กร** — คนละ inbox คนละ data model **ห้ามปนกันเด็ดขาด** (ดูตารางเทียบใน §1.3)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 ทำอะไร (v1)

Chat คือ **Inbox รวมของทั้งองค์กร** สำหรับคุยกับ "ลูกค้า" (Customer/Member) ทุกช่องทาง ทุกกิจการ (BusinessUnit) ในจอเดียว:

- ลูกค้าทักจาก **webchat widget** บน storefront (หน้ารวมองค์กร หรือหน้าหน่วย เช่น หน้าโรงแรม A) → เกิด conversation ใน inbox กลาง พร้อม tag `unitId` ของหน้าที่ทักเข้ามา
- ทีมงานเห็น inbox เดียว: กรองตามหน่วย/สถานะ/ผู้รับผิดชอบ, มอบหมายให้ staff หรือทีม, ตอบด้วย canned response, ส่งรูป/ไฟล์
- ระหว่างคุย เห็น **โปรไฟล์ Member ข้างจอ**: แต้มคงเหลือ, tier, ประวัติซื้อ/จอง — โดยไม่ต้องสลับหน้า
- Realtime ผ่าน **SSE** (ตาม _CONVENTIONS §5): ข้อความใหม่, typing indicator, read receipt, unread badge
- วัด SLA: first response time, เวลาตอบเฉลี่ย, resolved rate + รายงานรายวัน

### 1.2 ไม่ทำอะไร (v1) — ประกาศชัดกันหลง

| เรื่อง | สถานะ | หมายเหตุ |
|---|---|---|
| LINE OA / FB Messenger / IG | 🔜 Phase ถัดไป | **ออกแบบ `ChannelAdapter` interface + ตาราง `ChatChannelConnection` ไว้แล้วใน v1** (§4, §8.5) — เพิ่ม adapter ได้โดยไม่แตะ core |
| Chatbot / AI ตอบอัตโนมัติ | 🔜 | โครง senderType `SYSTEM` รองรับไว้ |
| Voice / Video call กับลูกค้า | ❌ ไม่อยู่ใน roadmap โมดูลนี้ |
| แชทภายในทีมงาน | ❌ → ใช้โมดูล 11 Meeting |
| Broadcast / campaign message หาลูกค้าเป็นกลุ่ม | 🔜 | เป็นงาน Marketing — วางคิวไว้หลังมี LINE OA |
| ลูกค้าคุยกันเอง / group chat ลูกค้า | ❌ | conversation = ลูกค้า 1 คน ↔ ร้าน เสมอ |

### 1.3 ความต่างจาก Meeting (โมดูล 11) — ห้ามปน

| | **10 Chat** | **11 Meeting** |
|---|---|---|
| คู่สนทนา | ลูกค้า (Member/guest) ↔ ทีมร้าน | ทีมงานภายใน ↔ ทีมงานภายใน |
| หน่วยข้อมูล | `ChatConversation` (มีสถานะ OPEN/PENDING/RESOLVED, SLA) | `MeetingRoom` (channel/DM ถาวร ไม่มีสถานะงาน) |
| ตาราง Prisma | prefix `Chat*` ทั้งหมด | prefix `Meeting*` ทั้งหมด |
| ตัวตนฝั่งส่ง | `memberId`/`guestId` + `userId` (staff) | `userId` เท่านั้น |
| UI | `/app/chat` (inbox 3 คอลัมน์) | `/app/meeting` (room list + ห้อง) |
| SSE stream | `/api/chat/stream` | `/api/meeting/stream` |
| Retention | มีนโยบาย purge (§11.6) | เก็บถาวร |

ห้าม: ใช้ตารางร่วม, ยิงข้อความข้าม inbox, แสดง conversation ลูกค้าใน Meeting หรือกลับกัน — ถ้าอยาก "ส่งต่อเคสลูกค้าให้ทีมคุยกัน" ให้แชร์ **ลิงก์** conversation ลง Meeting (link preview, ดูโมดูล 11 §8) ไม่ใช่ย้ายข้อความ

---

## 2. Persona & User Stories

| Persona | เกี่ยวข้องอย่างไร |
|---|---|
| **Owner** | เห็นทุก conversation ทุกหน่วย, ดูรายงาน SLA, ตั้งค่า widget/retention/canned กลาง |
| **Manager** (คุมบางหน่วย) | เห็น conversation ที่ tag หน่วยตน + ที่ไม่ tag หน่วย (ดู §9 กติกา), มอบหมายงานในทีมตน |
| **Staff** (มีสิทธิ์โมดูล Chat) | รับมอบหมาย, ตอบลูกค้า, ใช้ canned, เปลี่ยนสถานะ, ผูก guest → member |
| **Customer (Member)** | ทักร้านจาก storefront, เห็นประวัติแชทตัวเองข้ามอุปกรณ์ (login), ได้ notification เมื่อร้านตอบ |
| **Guest** (ยังไม่ login) | ทักได้ทันทีไม่ต้องสมัคร (ผูก session cookie), ภายหลัง login/ให้อีเมล → ระบบ merge เข้า member |

User stories หลัก:

1. **ลูกค้า (guest):** "ฉันเปิดหน้าโรงแรม A บน storefront กดปุ่มแชท พิมพ์ถามห้องว่างได้เลยโดยไม่ต้องสมัคร และเมื่อร้านตอบ ฉันเห็นข้อความเด้งทันทีถ้ายังเปิดหน้าอยู่"
2. **ลูกค้า (member):** "ฉัน login แล้วทักจากหน้าร้านอาหาร 2 — ร้านเห็นชื่อ แต้ม และประวัติออเดอร์ของฉันทันที ฉันกลับมาอ่านประวัติแชทเดิมได้จากทุกอุปกรณ์"
3. **Staff:** "ฉันเปิด inbox เห็นเฉพาะคิวที่ยังไม่ปิด เรียงตามรอนานสุด กด conversation แล้วเห็นโปรไฟล์ลูกค้าข้างจอ ตอบด้วย canned `/สวัสดี` แนบรูปเมนู แล้ว mark RESOLVED"
4. **Manager โรงแรม A:** "ฉันกรอง inbox เฉพาะโรงแรม A มอบหมายแชทสอบถามห้องพักให้พนักงาน front แล้วเห็นว่าใครตอบช้ากว่า SLA"
5. **Owner:** "ทุกเช้าฉันดูรายงาน: เมื่อวานมีแชทเข้ากี่เรื่อง ตอบครั้งแรกเฉลี่ยกี่นาที ปิดได้กี่ % แยกต่อหน่วย"
6. **Staff (guest→member):** "ลูกค้า guest แจ้งเบอร์โทร ฉันค้นเจอ member เดิม กด 'ผูกกับสมาชิก' — ประวัติแชทติดไปอยู่ใต้ member คนนั้น แต้ม/ประวัติซื้อโผล่ข้างจอทันที"

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 ช่องทาง (Channels)
- ✅ **Webchat widget** บน storefront ทุกหน้า (`/s/[tenantSlug]`, `/s/[tenantSlug]/[unitSlug]`, custom domain) — ปุ่มลอยมุมขวาล่าง เปิดเป็นหน้าต่างแชท (mobile = full-screen sheet)
- ✅ Widget บนหน้าหน่วย → conversation tag `unitId` หน่วยนั้นอัตโนมัติ; หน้ารวมองค์กร → `unitId = null`
- ✅ Guest mode: ทักได้ทันที (สร้าง `ChatGuest` + token cookie httpOnly อายุ 90 วัน) + pre-chat form ขอชื่อ/อีเมลแบบ optional (เปิด/ปิดได้ใน settings)
- ✅ Customer login (OTP/magic link เดิมของแพลตฟอร์ม) → conversation ผูก `memberId`, sync ประวัติทุกอุปกรณ์
- ✅ Merge guest → member: อัตโนมัติเมื่อ guest login ด้วยอีเมลเดียวกับที่กรอก pre-chat, หรือ staff กดผูกเอง (§7.4)
- 🔜 **LINE OA** ผ่าน `ChannelAdapter` (webhook receive + push API, ผูก LINE userId ↔ member)
- 🔜 **FB Messenger** ผ่าน `ChannelAdapter` (Meta webhook + Send API, กติกา 24-hour window อยู่ในความรับผิดชอบ adapter)
- 🔜 IG DM, อีเมล-to-chat

### 3.2 Inbox & Conversation
- ✅ Inbox รวม 3 คอลัมน์: รายการ conversation / ห้องแชท / โปรไฟล์ member (จอเล็กพับได้)
- ✅ กติกา conversation: **ลูกค้า 1 ตัวตน × 1 ช่องทาง มี conversation "ยังไม่ปิด" ได้ 1 อันเสมอ** — ทักซ้ำ = ต่อเรื่องเดิม; ทักหลังปิด (RESOLVED) = เปิด conversation ใหม่ (เก็บเธรดเก่าเป็นประวัติ)
- ✅ สถานะ: `OPEN` (รอทีมตอบ/กำลังคุย) → `PENDING` (รอลูกค้า/รอข้อมูลภายนอก — หยุดนับ SLA ฝั่งร้าน) → `RESOLVED` (จบเรื่อง) + reopen อัตโนมัติเมื่อลูกค้าพิมพ์เข้ามาใน PENDING/RESOLVED (§7.5)
- ✅ มอบหมาย: ให้ staff รายคน (`assigneeUserId`) และ/หรือทีม (`teamId`) — ทีมสร้าง/จัดการได้ใน settings (เช่น "ทีม Front โรงแรม A")
- ✅ เปลี่ยน/แก้ tag `unitId` ของ conversation ได้ (เช่น ลูกค้าทักจากหน้ารวมแต่ถามเรื่องโรงแรม B → staff ย้าย tag)
- ✅ Label/tag อิสระต่อ conversation (Json array เช่น `["ร้องเรียน","จองห้อง"]`) + กรองตาม tag
- ✅ ตัวกรอง inbox: สถานะ · ผู้รับผิดชอบ (ของฉัน/ยังไม่มอบหมาย/ทีม) · หน่วย · ช่องทาง · tag · ค้นหาชื่อลูกค้า
- ✅ เรียงลำดับ: ข้อความล่าสุด (default) / รอนานสุด (oldest unanswered ก่อน)
- ✅ หมายเหตุภายใน (**internal note**): ข้อความ senderType `STAFF` ที่ `isInternal = true` — เห็นเฉพาะทีม ลูกค้าไม่เห็น (พื้นหลังเหลืองอ่อน/ขีดเส้นแยกใน UI)
- 🔜 snooze (`PENDING` พร้อมเวลาตั้งปลุก), SLA escalation อัตโนมัติ, round-robin auto-assign

### 3.3 การส่งข้อความ
- ✅ ข้อความตัวอักษร (จำกัด 4,000 ตัวอักษร/ข้อความ)
- ✅ รูปภาพ (jpg/png/webp/gif ≤ 10MB, แสดง thumbnail + lightbox) และไฟล์ (pdf/doc/xls/zip ≤ 20MB) — อัปโหลดขึ้น object storage ผ่าน presigned URL, virus-scan hook 🔜
- ✅ Canned responses: คลัง per-tenant, เรียกด้วย `/` ในช่องพิมพ์ (autocomplete จาก shortcut), รองรับตัวแปร `{{member.name}}`, `{{unit.name}}`, `{{staff.name}}`
- ✅ Typing indicator สองทาง (ephemeral ผ่าน SSE — ไม่ลง DB)
- ✅ Read receipt: ลูกค้าเห็นเมื่อร้าน "อ่านแล้ว" และร้านเห็นว่าลูกค้าอ่านถึงข้อความไหน (เก็บ `ChatReadReceipt` ต่อฝั่ง)
- ✅ System message ในเธรด: มอบหมาย/เปลี่ยนสถานะ/ผูก member/ย้ายหน่วย (เห็นเฉพาะฝั่ง staff)
- 🔜 reply-quote ข้อความเดิม, reaction, ส่ง location, ส่งลิงก์จองห้อง/เมนูแบบ rich card

### 3.4 Member context (ข้างจอ)
- ✅ แผงขวาแสดง (อ่านอย่างเดียว, ดึงสดจากโมดูลต้นทาง — ไม่ copy เก็บ):
  - โปรไฟล์: ชื่อ, เบอร์, อีเมล, tier, วันที่เป็นสมาชิก (โมดูล 6 Member)
  - แต้มคงเหลือ + 5 รายการ ledger ล่าสุด (โมดูล 9 Point)
  - ประวัติซื้อ/ใช้บริการ 10 รายการล่าสุดข้ามหน่วย: ใบเสร็จ POS, การจองโรงแรม, นัดหมาย Booking (ผ่าน read service ของแต่ละโมดูล ตาม §8.4)
  - conversation เก่าของลูกค้าคนนี้ (ทุกช่องทาง)
- ✅ ปุ่มลัด: เปิดหน้า member เต็ม (`/app/members/[id]`), ผูก/เปลี่ยน member ของ conversation
- 🔜 ปุ่ม action ในแชท: สร้างนัด Booking / ออกคูปองให้ลูกค้า จากข้างจอ

### 3.5 Realtime + Notification + Badge
- ✅ SSE ฝั่ง staff: `/api/chat/stream` — event: `message.new`, `conversation.updated`, `typing`, `read`, `badge` (นับ unread รวม) · **topic ตาม scheme กลาง (D14 / _CONVENTIONS §2.8): `t:{tenantId}:chat:{topic}`** (Chat เป็น tenant-scoped)
- ✅ SSE ฝั่งลูกค้า: `/api/store/chat/stream` — เฉพาะ conversation ของตัวเอง (topic scope ต่อ conversation ภายใต้ namespace `t:{tenantId}:chat:*` เดียวกัน)
- ✅ Unread badge บน dashboard sidebar (เมนู 💬 แชท): จำนวน conversation ที่มีข้อความลูกค้ายังไม่อ่าน **ตามสิทธิ์ของ user คนนั้น** (Manager เห็นเฉพาะหน่วยตน) — push ผ่าน SSE + poll fallback ทุก 60 วิ
- ✅ Notification ตาม contract 2.5:
  - staff: มีแชทใหม่ยังไม่มีคนรับ > X นาที (default 5) → `WEB`; ถูกมอบหมาย → `WEB` (+`EMAIL` ถ้า offline > 10 นาที)
  - ลูกค้า (member มีอีเมล): ร้านตอบแล้วแต่ลูกค้า offline > 5 นาที → `EMAIL` สรุปข้อความ + ลิงก์กลับเข้าแชท (ส่งไม่เกิน 1 ฉบับ/ชม./conversation กัน spam)
- 🔜 Web Push, LINE notify ลูกค้า (มากับ LINE adapter)

### 3.6 SLA & รายงาน
- ✅ เก็บ timestamp อัตโนมัติ: `firstCustomerMessageAt`, `firstResponseAt` (ข้อความ staff แรกที่ไม่ใช่ internal note), `resolvedAt`, ประวัติ event ทุกจุด (`ChatConversationEvent`)
- ✅ ตั้งเป้า SLA ใน settings: first response ภายใน N นาที (default 15) — inbox โชว์นาฬิกาถอยหลัง/ป้ายแดงเมื่อเกิน
- ✅ รายงาน (§10): volume ต่อวัน, first response time (avg/median/P90), resolved rate, per-agent, per-unit, per-channel
- 🔜 CSAT (ให้ลูกค้ากดดาวหลังปิดเคส), business-hours-aware SLA (หยุดนับนอกเวลาทำการ)

### 3.7 Settings
- ✅ Widget: ข้อความทักทาย, pre-chat form เปิด/ปิด, ข้อความนอกเวลาทำการ (เวลาทำการอ่านจาก `unit.settings` ถ้าเป็นหน้าหน่วย, ตั้ง fallback ระดับ tenant), เปิด/ปิด widget รายหน่วย
- ✅ Canned responses: CRUD + จำกัดขอบเขต (ทั้งองค์กร หรือเฉพาะหน่วย)
- ✅ ทีม: CRUD ทีม + สมาชิก
- ✅ Retention: เลือกอายุเก็บข้อความ (ดู §11.6)
- 🔜 หน้าเชื่อมช่องทาง LINE/FB (กรอก credentials, สถานะ webhook)

---

## 4. Data Model (Prisma)

> ทุก model มี `tenantId` (tenant-scoped) + `createdAt`/`updatedAt` — เงินไม่มีในโมดูลนี้ — id = cuid — ไม่มี hard delete ข้อความ (ลบ = tombstone/purge ตาม retention เท่านั้น)

```prisma
// ───────────────────────── enums ─────────────────────────

enum ChatChannelType {
  WEBCHAT        // ✅ v1
  LINE_OA        // 🔜 schema พร้อม, adapter ยังไม่ทำ
  FB_MESSENGER   // 🔜
}

enum ChatConversationStatus {
  OPEN       // รอทีมตอบ / กำลังคุย
  PENDING    // รอลูกค้า / รอเรื่องภายนอก (หยุดนับ SLA ฝั่งร้าน)
  RESOLVED   // ปิดเรื่อง
}

enum ChatSenderType {
  CUSTOMER   // member หรือ guest
  STAFF      // user ฝั่งร้าน
  SYSTEM     // ข้อความระบบ (มอบหมาย/เปลี่ยนสถานะ/auto-reply)
}

enum ChatMessageType {
  TEXT
  IMAGE
  FILE
  SYSTEM
}

enum ChatConnectionStatus {
  ACTIVE
  DISABLED
  ERROR      // webhook/credential พัง — โชว์เตือนใน settings
}

// ─────────────────── ช่องทาง (Channel) ───────────────────

// การเชื่อมช่องทางภายนอก 1 แถว = 1 การเชื่อม (เช่น LINE OA 1 บัญชี)
// WEBCHAT ไม่ต้องมีแถว (built-in) — ตารางนี้มีตั้งแต่ v1 เพื่อไม่ต้อง migrate ตอนทำ LINE/FB
model ChatChannelConnection {
  id          String               @id @default(cuid())
  tenantId    String
  type        ChatChannelType
  unitId      String?              // เชื่อมช่องทางผูกกับหน่วยไหน (LINE OA ของโรงแรม A) — null = ระดับองค์กร
  displayName String               // "LINE OA บ้านทะเล หัวหิน"
  credentials Json                 // เก็บเข้ารหัส (channel secret / access token) — เขียนผ่าน service เท่านั้น
  webhookKey  String               @unique @default(cuid())  // ใช้ประกอบ webhook URL กันเดาสุ่ม
  status      ChatConnectionStatus @default(ACTIVE)
  lastErrorAt DateTime?
  lastError   String?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  conversations ChatConversation[]

  @@unique([tenantId, type, unitId])   // 1 หน่วย เชื่อมช่องทางชนิดเดียวกันได้ 1 บัญชี (v1)
  @@index([tenantId, status])
}

// ───────────────────── ตัวตนลูกค้า ─────────────────────

// guest ที่ยังไม่ login — 1 แถวต่อ browser session (token ใน cookie)
model ChatGuest {
  id               String    @id @default(cuid())
  tenantId         String
  token            String    @unique @default(cuid()) // httpOnly cookie, อายุ 90 วัน
  displayName      String?                            // จาก pre-chat form
  email            String?
  phone            String?
  mergedToMemberId String?                            // ถูกผูกกับ member แล้ว → conversation ทั้งหมดย้าย memberId
  mergedAt         DateTime?
  lastSeenAt       DateTime  @default(now())
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  conversations ChatConversation[]

  @@index([tenantId, email])
  @@index([tenantId, lastSeenAt])   // สำหรับ cron purge guest ร้าง (§11.6)
}

// ───────────────────── Conversation ─────────────────────

model ChatConversation {
  id                    String                 @id @default(cuid())
  tenantId              String
  channel               ChatChannelType        @default(WEBCHAT)
  channelConnectionId   String?                // null = webchat
  channelConnection     ChatChannelConnection? @relation(fields: [channelConnectionId], references: [id])
  externalThreadId      String?                // id เธรดฝั่ง provider (LINE userId ฯลฯ) 🔜
  unitId                String?                // หน่วยที่ลูกค้าทักเข้ามา / staff ย้าย tag ได้
  memberId              String?                // CustomerProfile (contract 2.6) — nullable ระหว่างเป็น guest
  guestId               String?
  guest                 ChatGuest?             @relation(fields: [guestId], references: [id])

  status                ChatConversationStatus @default(OPEN)
  assigneeUserId        String?                // staff ผู้รับผิดชอบ
  teamId                String?
  team                  ChatTeam?              @relation(fields: [teamId], references: [id])
  tags                  Json                   @default("[]")   // ["ร้องเรียน","จองห้อง"]

  // denormalized เพื่อ inbox list เร็ว (อัปเดตใน transaction เดียวกับ insert message)
  lastMessageAt         DateTime?
  lastMessagePreview    String?                // ตัด 140 ตัวอักษร, ไม่รวม internal note
  lastMessageSender     ChatSenderType?
  staffUnreadCount      Int                    @default(0)  // ข้อความลูกค้าที่ทีมยังไม่อ่าน
  customerUnreadCount   Int                    @default(0)

  // SLA timestamps
  firstCustomerMessageAt DateTime?
  firstResponseAt        DateTime?             // ข้อความ STAFF แรก (ไม่นับ internal/system)
  resolvedAt             DateTime?
  reopenedCount          Int                   @default(0)

  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt

  messages ChatMessage[]
  events   ChatConversationEvent[]
  receipts ChatReadReceipt[]

  @@index([tenantId, status, lastMessageAt(sort: Desc)])   // inbox หลัก
  @@index([tenantId, assigneeUserId, status])
  @@index([tenantId, unitId, status])
  @@index([tenantId, memberId])
  @@index([tenantId, guestId])
  @@index([channelConnectionId, externalThreadId])         // map webhook เข้าเธรด 🔜
}
// ⚠️ กติกา "1 ตัวตน × 1 ช่องทาง = 1 conversation ที่ยังไม่ RESOLVED" บังคับ 2 ชั้น:
//   (1) service layer: หา conversation active ก่อนสร้างใหม่ ภายใน transaction + advisory lock ต่อ (tenantId, memberId|guestId, channel)
//   (2) partial unique index (raw SQL migration — Prisma ไม่รองรับ):
//       CREATE UNIQUE INDEX chat_conv_active_member ON "ChatConversation" ("tenantId","channel","memberId")
//         WHERE status <> 'RESOLVED' AND "memberId" IS NOT NULL;
//       CREATE UNIQUE INDEX chat_conv_active_guest  ON "ChatConversation" ("tenantId","channel","guestId")
//         WHERE status <> 'RESOLVED' AND "guestId" IS NOT NULL;

// ───────────────────── Message ─────────────────────

model ChatMessage {
  id              String           @id @default(cuid())
  tenantId        String
  conversationId  String
  conversation    ChatConversation @relation(fields: [conversationId], references: [id])
  senderType      ChatSenderType
  senderUserId    String?          // เมื่อ STAFF
  senderMemberId  String?          // เมื่อ CUSTOMER ที่ login
  senderGuestId   String?          // เมื่อ CUSTOMER แบบ guest
  type            ChatMessageType  @default(TEXT)
  body            String?          @db.Text      // TEXT/SYSTEM; null สำหรับ IMAGE/FILE ล้วน
  isInternal      Boolean          @default(false) // internal note — ลูกค้าไม่เห็น ไม่นับ SLA/preview
  clientMessageId String?          // idempotency key จาก client กันส่งซ้ำตอน retry
  meta            Json?            // system message payload / canned id ที่ใช้ / delivery result ของ adapter
  purgedAt        DateTime?        // retention purge แล้ว (body+attachment ถูกลบ เหลือ tombstone)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  attachments ChatAttachment[]

  @@unique([conversationId, clientMessageId])   // idempotent send
  @@index([conversationId, createdAt])
  @@index([tenantId, createdAt])                // retention cron + รายงาน volume
}

model ChatAttachment {
  id         String      @id @default(cuid())
  tenantId   String
  messageId  String
  message    ChatMessage @relation(fields: [messageId], references: [id])
  kind       ChatMessageType   // IMAGE | FILE
  storageKey String            // path บน object storage (ลบจริงตอน purge)
  url        String            // CDN URL (signed ถ้า private bucket)
  fileName   String
  mimeType   String
  sizeBytes  Int
  width      Int?              // รูปภาพ
  height     Int?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@index([tenantId, createdAt])
  @@index([messageId])
}

// ─────────────── Read receipt (ต่อผู้อ่าน) ───────────────

// ฝั่งลูกค้า: 1 แถว (readerType CUSTOMER) · ฝั่ง staff: 1 แถวต่อ user ที่เปิดอ่าน
// "ร้านอ่านแล้ว" ที่โชว์ลูกค้า = max(lastReadAt ของ STAFF ทุกแถว)
model ChatReadReceipt {
  id                String           @id @default(cuid())
  tenantId          String
  conversationId    String
  conversation      ChatConversation @relation(fields: [conversationId], references: [id])
  readerType        ChatSenderType   // CUSTOMER | STAFF
  readerUserId      String?          // เมื่อ STAFF
  lastReadMessageId String?
  lastReadAt        DateTime         @default(now())
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@unique([conversationId, readerType, readerUserId])
  @@index([tenantId])
}

// ─────────────── Event log (SLA + audit เธรด) ───────────────

enum ChatEventType {
  CREATED
  ASSIGNED        // meta: { fromUserId?, toUserId?, toTeamId? }
  STATUS_CHANGED  // meta: { from, to }
  UNIT_CHANGED    // meta: { fromUnitId, toUnitId }
  MEMBER_LINKED   // meta: { guestId, memberId }
  REOPENED
}

model ChatConversationEvent {
  id             String           @id @default(cuid())
  tenantId       String
  conversationId String
  conversation   ChatConversation @relation(fields: [conversationId], references: [id])
  type           ChatEventType
  actorUserId    String?          // null = ระบบ/ลูกค้า trigger
  meta           Json?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([conversationId, createdAt])
  @@index([tenantId, type, createdAt])   // รายงาน
}

// ─────────────── ทีม + canned + settings ───────────────

model ChatTeam {
  id        String   @id @default(cuid())
  tenantId  String
  name      String                 // "ทีม Front โรงแรม A"
  unitId    String?                // ทีมประจำหน่วย (optional)
  memberUserIds Json @default("[]") // ["usr_x","usr_y"] — v1 เก็บ Json พอ (ทีมเล็ก), 🔜 แตกตาราง join ถ้าต้อง query กลับด้าน
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  conversations ChatConversation[]

  @@unique([tenantId, name])
  @@index([tenantId])
}

model ChatCannedResponse {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String?           // null = ใช้ได้ทุกหน่วย
  shortcut      String            // "สวัสดี" → พิมพ์ /สวัสดี
  title         String
  body          String   @db.Text // รองรับ {{member.name}} {{unit.name}} {{staff.name}}
  usageCount    Int      @default(0)
  createdByUserId String
  archivedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, shortcut])
  @@index([tenantId, unitId])
}

// ตั้งค่า widget/SLA/retention — 1 แถวต่อ tenant (สร้างตอนเปิดโมดูล)
model ChatSetting {
  id                  String   @id @default(cuid())
  tenantId            String   @unique
  widgetEnabled       Boolean  @default(true)
  widgetDisabledUnitIds Json   @default("[]")  // ปิดรายหน่วย
  greetingMessage     Json     @default("{}")   // { th: "...", en: "..." }
  offlineMessage      Json     @default("{}")
  preChatFormEnabled  Boolean  @default(false)  // ขอชื่อ/อีเมลก่อนแชท
  businessHours       Json?                     // fallback ระดับ tenant; หน้าหน่วยใช้ unit.settings ก่อน
  slaFirstResponseMin Int      @default(15)
  unassignedAlertMin  Int      @default(5)      // แจ้งเตือนแชทไร้เจ้าของ
  retentionDays       Int      @default(365)    // §11.6 (ขั้นต่ำ 90)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

// ─────────────── สถิติรายวัน ───────────────

// (D11 — RESOLUTIONS) ตาราง ChatDailyStat เดิมถูก**ยุบเข้า DailyStat กลาง** (REPORTS.md §7.1 — module=CHAT)
// — โมดูลห้ามสร้างตาราง summary เอง (_CONVENTIONS §2.8; ยกเว้นเดียว = Hotel night audit)
// Chat implement `StatProvider.collectDailyStats()` ป้อน metric กลาง:
//   conversations_new, conversations_resolved, messages_in, messages_out,
//   frt_sum_sec, frt_count, frt_within_sla_count
//   (breakdown ต่อ channel เก็บใน DailyStat.meta — avg FRT = frt_sum_sec/frt_count)
// เขียนผ่าน statUpsert()/StatRunner ของ CORE เท่านั้น — ไม่มี cron สรุปของตัวเอง
```

**หมายเหตุ schema:**
- `memberId`, `unitId`, `assigneeUserId` ไม่ใส่ relation ข้ามโมดูล (Member/BusinessUnit/User) แบบ FK แข็งใน Prisma ที่นี่ — อ้างด้วย id + ตรวจใน service ตาม pattern กลางของแพลตฟอร์ม (ลด coupling ระหว่างไฟล์ schema โมดูล; ทีม implement เลือกใส่ FK จริงได้ถ้า schema รวมไฟล์เดียว)
- ทุก query ผ่าน Prisma extension inject `tenantId` (BLUEPRINT §2) — Chat เป็น tenant-scoped จึงไม่ต้องมี unitId guard, แต่การ**กรองสิทธิ์ราย unit ของ Manager ทำที่ service layer** (§9)

---

## 5. API Endpoints

> ทั้งหมดอยู่ใต้ tenant context (session/resolver) — ตรวจ `can(user, { tenantId, module:'CHAT', action })` ก่อนทุกเส้น ฝั่ง storefront ตรวจ session ลูกค้า/guest token แทน
> รูปแบบ error กลาง: `{ error: { code, message } }` — 401/403/404/409/422/429

### 5.1 ฝั่ง Dashboard (staff)

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ (action) |
|---|---|---|---|---|
| 1 | `GET /api/chat/conversations` | list inbox | query: `status, assignee(me\|none\|userId), teamId, unitId, channel, tag, q, sort(latest\|longest_wait), cursor, limit≤50` | `chat.read` |
| 2 | `GET /api/chat/conversations/:id` | รายละเอียด + receipts + events ล่าสุด | — | `chat.read` |
| 3 | `GET /api/chat/conversations/:id/messages` | ข้อความ (cursor ย้อนหลัง) | `cursor, limit≤50` | `chat.read` |
| 4 | `POST /api/chat/conversations/:id/messages` | ส่งข้อความ/โน้ต | `{ type, body?, attachmentIds?, isInternal?, clientMessageId }` | `chat.reply` |
| 5 | `PATCH /api/chat/conversations/:id` | เปลี่ยน status / assignee / team / tags / unitId | `{ status?, assigneeUserId?, teamId?, tags?, unitId? }` (บันทึก `ChatConversationEvent` ทุกฟิลด์ที่เปลี่ยน) | `chat.manage` (เปลี่ยน status ตัวเองที่ได้รับมอบหมาย = `chat.reply`) |
| 6 | `POST /api/chat/conversations/:id/read` | mark read ถึงข้อความล่าสุด (อัปเดต receipt + reset `staffUnreadCount`) | `{ lastReadMessageId }` | `chat.read` |
| 7 | `POST /api/chat/conversations/:id/typing` | ส่ง typing ephemeral (TTL 5 วิ, rate limit 1/2วิ) | — | `chat.reply` |
| 8 | `POST /api/chat/conversations/:id/link-member` | ผูก guest ↔ member (§7.4) | `{ memberId }` | `chat.manage` |
| 9 | `GET /api/chat/stream` | **SSE** ฝั่ง staff (event ตาม §3.5, กรองตามสิทธิ์ unit) | `Last-Event-ID` รองรับ resume | `chat.read` |
| 10 | `GET /api/chat/unread-count` | badge (poll fallback) | — | `chat.read` |
| 11 | `POST /api/chat/uploads` | ขอ presigned URL อัปไฟล์ → คืน `attachmentId` (สถานะ pending จนถูกอ้างในข้อความภายใน 1 ชม. ไม่งั้น cron ลบ) | `{ fileName, mimeType, sizeBytes }` | `chat.reply` |
| 12 | `GET/POST /api/chat/canned` · `PATCH/DELETE /api/chat/canned/:id` | CRUD canned (DELETE = archive) | `{ shortcut, title, body, unitId? }` | อ่าน `chat.read` / เขียน `chat.settings` |
| 13 | `GET/POST /api/chat/teams` · `PATCH/DELETE /api/chat/teams/:id` | CRUD ทีม | `{ name, unitId?, memberUserIds }` | `chat.settings` |
| 14 | `GET/PATCH /api/chat/settings` | ตั้งค่า widget/SLA/retention | body = ฟิลด์ `ChatSetting` | `chat.settings` |
| 15 | `GET /api/chat/reports/summary` | รายงานรวม (§10) | `from, to, unitId?, channel?` | `chat.reports` |
| 16 | `GET /api/chat/reports/agents` | per-agent | `from, to` | `chat.reports` |
| 17 | 🔜 `GET/POST /api/chat/connections` · `PATCH/DELETE /:id` | เชื่อม LINE/FB | credentials | `chat.settings` (OWNER เท่านั้น) |

### 5.2 ฝั่ง Storefront (ลูกค้า/guest) — public API ภายใต้ tenant resolver (custom domain / `/s/[slug]`)

| # | Method + Path | ทำอะไร | หมายเหตุ |
|---|---|---|---|
| 18 | `POST /api/store/chat/session` | เริ่ม session: มี login → ผูก member; ไม่มี → สร้าง/อ่าน `ChatGuest` จาก cookie, รับ pre-chat `{ displayName?, email? }` | คืน `{ conversationId?, guestToken(set-cookie) }` |
| 19 | `GET /api/store/chat/conversation` | conversation active + ประวัติ (member เห็นเธรดเก่าทั้งหมด, guest เห็นเฉพาะของ token ตน) | |
| 20 | `POST /api/store/chat/messages` | ลูกค้าส่งข้อความ `{ type, body?, attachmentIds?, clientMessageId, unitSlug? }` — `unitSlug` จากหน้าที่ widget ฝังอยู่ → map เป็น `unitId` | rate limit 10 ข้อความ/นาที/ตัวตน |
| 21 | `POST /api/store/chat/uploads` | presigned upload ฝั่งลูกค้า (จำกัดชนิด/ขนาดเข้มกว่า staff) | |
| 22 | `POST /api/store/chat/read` · `POST /api/store/chat/typing` | receipt + typing ฝั่งลูกค้า | |
| 23 | `GET /api/store/chat/stream` | **SSE** เฉพาะ conversation ของตัวตนนี้ | |
| 24 | 🔜 `POST /api/webhooks/chat/:channelType/:webhookKey` | inbound จาก LINE/FB → `ChannelAdapter.parseInbound` | verify signature ต่อ adapter |

---

## 6. UI Screens

> ทุกหน้า: TH/EN, B&W minimal, mobile-first, มี empty/loading/error state ครบ (ตาม _CONVENTIONS §5)

### 6.1 Dashboard `/app/chat` — Inbox หลัก (tenant-level, ไม่มี `/u/` ใน path)

- **คอลัมน์ซ้าย — รายการ conversation:** แถบกรองบน (สถานะ 3 ปุ่ม + dropdown: ผู้รับผิดชอบ/หน่วย/ช่องทาง/tag + ช่องค้นหา), การ์ดละ 1 conversation: avatar อักษรย่อ, ชื่อลูกค้า (guest = "ผู้เยี่ยมชม #หมายเลขสั้น"), preview ข้อความล่าสุด, เวลา, ป้ายหน่วย (ชิปชื่อหน่วย), ป้าย unread (จุดดำ + เลข), นาฬิกา SLA (เปลี่ยนเป็นตัวหนา/ขีดเส้นใต้เมื่อเกินเป้า — B&W ไม่ใช้สีแดง ใช้ badge `เกิน SLA`), infinite scroll
- **คอลัมน์กลาง — ห้องแชท:** header (ชื่อลูกค้า + ชิปหน่วย + สถานะ dropdown + ปุ่มมอบหมาย), เธรดข้อความ (ฟองซ้าย=ลูกค้า ขวา=ร้าน, internal note พื้นลายจุด + ป้าย "โน้ตภายใน", system message แบบเส้นกลางจอ), read receipt ("อ่านแล้ว HH:mm" ใต้ฟองสุดท้ายที่ถูกอ่าน), typing indicator, ช่องพิมพ์: textarea + ปุ่มแนบไฟล์ + toggle "โน้ตภายใน" + `/` เปิด canned autocomplete + Enter ส่ง (Shift+Enter ขึ้นบรรทัด)
- **คอลัมน์ขวา — Member panel (§3.4):** พับเก็บได้; guest ที่ยังไม่ผูก → แสดงข้อมูล pre-chat + ปุ่ม "ผูกกับสมาชิก" (เปิด modal ค้น member ด้วยชื่อ/เบอร์/อีเมล)
- **Mobile:** เหลือทีละคอลัมน์ (list → tap → ห้องแชทเต็มจอ → member panel เป็น bottom sheet จากปุ่ม ℹ️)
- **Empty state:** "ยังไม่มีแชทเข้ามา — widget เปิดอยู่บน storefront ของคุณแล้ว" + ลิงก์ตั้งค่า

### 6.2 `/app/chat/settings` — แท็บ 4 อัน
1. **Widget:** toggle รวม + รายหน่วย, ข้อความทักทาย/นอกเวลา (TH/EN), pre-chat form toggle, ปุ่ม "ดูตัวอย่าง widget"
2. **ข้อความสำเร็จรูป (canned):** ตาราง shortcut/title/ขอบเขตหน่วย/ครั้งที่ใช้ + CRUD modal
3. **ทีม:** รายการทีม + สมาชิก + หน่วยประจำ
4. **SLA & Retention:** เป้า first response (นาที), เตือนแชทไร้เจ้าของ (นาที), อายุเก็บข้อความ (dropdown 90/180/365/730 วัน + คำอธิบายผลของการลด §11.6)
5. 🔜 แท็บ "ช่องทาง" (LINE/FB connections)

### 6.3 `/app/chat/reports` — รายงาน (§10): การ์ด KPI แถวบน + กราฟเส้น volume รายวัน + ตาราง per-agent / per-unit + ตัวเลือกช่วงวันที่ (7/30/90 วัน/กำหนดเอง) + ปุ่ม export CSV

### 6.4 Storefront — Webchat widget (ฝังทุกหน้า `(store)`)
- **Launcher:** ปุ่มกลมดำมุมขวาล่าง (ไอคอนแชทขาว) + badge เลข unread ลูกค้า; ซ่อนเมื่อ widget ปิดสำหรับหน่วย/tenant นั้น
- **หน้าต่างแชท (desktop 380×600 มุมขวาล่าง / mobile full-screen sheet):**
  - header: ชื่อร้านหรือชื่อหน่วย (ตามหน้าที่ฝัง) + สถานะ "ปกติตอบภายใน ~N นาที" (คำนวณจาก FRT median 7 วันล่าสุด, ไม่มีข้อมูล → ซ่อน) / นอกเวลาทำการ → แสดง `offlineMessage`
  - pre-chat form (ถ้าเปิด): ชื่อ + อีเมล (optional ทั้งคู่) + ปุ่ม "เริ่มแชท"
  - เธรด + typing + "ร้านอ่านแล้ว" + ช่องพิมพ์ + แนบรูป/ไฟล์
  - ลูกค้า login แล้ว: เห็น "ประวัติแชท" (เธรดเก่า RESOLVED แบบ read-only)
  - แถบชวน login แบบไม่บังคับ: "เข้าสู่ระบบเพื่อเก็บประวัติแชทและแต้มของคุณ"
- **สถานะพิเศษ:** ส่งไม่สำเร็จ → ฟองข้อความมีปุ่ม "ลองอีกครั้ง" (ใช้ `clientMessageId` เดิม), offline → banner "การเชื่อมต่อหลุด กำลังเชื่อมใหม่…"

### 6.5 Unread badge บน dashboard
- sidebar เมนู "💬 แชท" มี badge เลข = จำนวน conversation ที่ `staffUnreadCount > 0` **ภายใต้สิทธิ์ user** — อัปเดตผ่าน SSE event `badge` + title จำนวนบน tab เบราว์เซอร์ (`(3) SHARK`)

---

## 7. Business Flows

### 7.1 ลูกค้า guest ทักครั้งแรกจากหน้าโรงแรม A

1. ลูกค้าเปิด `/s/banthale/huahin-hotel` → widget โหลด config (`unitSlug=huahin-hotel`, เวลาทำการจาก `unit.settings`)
2. กด launcher → `POST /api/store/chat/session` (ไม่มี login, ไม่มี cookie) → สร้าง `ChatGuest` + set cookie token → (pre-chat form ถ้าเปิด)
3. พิมพ์ข้อความแรก → `POST /api/store/chat/messages { unitSlug, clientMessageId }` → service:
   a. resolve `unitId` จาก slug + ตรวจ unit ∈ tenant และ ACTIVE
   b. advisory lock ตัวตน → ไม่พบ conversation active → สร้าง `ChatConversation { unitId, guestId, status: OPEN }` + `firstCustomerMessageAt=now` + event `CREATED`
   c. insert `ChatMessage` + อัปเดต denormalized fields + `staffUnreadCount+1` (transaction เดียว)
4. broadcast SSE `message.new` + `badge` ให้ staff ที่มีสิทธิ์เห็นหน่วยนี้
5. ครบ `unassignedAlertMin` ยังไม่มีคนรับ → `notify({ channel: WEB, template: 'chat.unassigned', ... })` หา staff ที่มี `chat.reply` ในหน่วยนั้น
   - **Failure path:** unit PAUSED → widget ยังใช้ได้ (แชทไม่ใช่ธุรกรรมจอง) แต่ถ้า tenant SUSPENDED → widget ซ่อน, API คืน 403 · ส่งซ้ำเพราะ network retry → `@@unique(conversationId, clientMessageId)` กันข้อความซ้ำ คืน 200 พร้อมข้อความเดิม

### 7.2 Staff รับเรื่อง–ตอบ–ปิด

1. Staff เห็น badge → เปิด inbox → กด conversation → `POST .../read` (reset unread, ลูกค้าเห็น "อ่านแล้ว")
2. กด "รับเรื่อง" (มอบหมายตัวเอง) → `PATCH { assigneeUserId: me }` → event `ASSIGNED` + system message ในเธรด
3. ตอบ (canned/พิมพ์/แนบรูป) → ข้อความ STAFF แรก → set `firstResponseAt` (ถ้ายัง null) → SSE + notify ลูกค้า (ถ้า offline เกิน 5 นาที → EMAIL, throttle 1/ชม.)
4. รอลูกค้ายืนยันข้อมูล → เปลี่ยนเป็น `PENDING` (หยุดนาฬิกา SLA ฝั่งร้าน)
5. จบเรื่อง → `RESOLVED` → set `resolvedAt` + system message "ปิดการสนทนา" ฝั่งลูกค้าเห็น "การสนทนาจบแล้ว — พิมพ์เพื่อเริ่มเรื่องใหม่ได้เลย"
   - **Failure path:** สอง staff ตอบพร้อมกัน → ได้ทั้งคู่ (ไม่ lock การพิมพ์) แต่มอบหมายเป็น last-write-win + event log บอกประวัติ · staff ถูกถอนสิทธิ์หน่วยระหว่างเปิดจอ → SSE ยิง `conversation.updated` แล้ว API ถัดไปคืน 403 → UI เด้งกลับ inbox

### 7.3 Reopen อัตโนมัติ

- ลูกค้าพิมพ์เข้ามาใน conversation ที่ `PENDING` → status กลับ `OPEN` (event `STATUS_CHANGED`)
- พิมพ์ใส่เธรด `RESOLVED` **ภายใน 24 ชม.** → reopen เธรดเดิม (`reopenedCount+1`, event `REOPENED`, ล้าง `resolvedAt` — FRT ไม่นับใหม่)
- เกิน 24 ชม. → เปิด conversation ใหม่ (เธรดเก่าเป็นประวัติ) — กันเธรดยาวเป็นปี ๆ และทำ resolved rate ตรงความจริง

### 7.4 ผูก guest → member (identity merge)

ทริกเกอร์ 2 ทาง: (ก) guest login ด้วยอีเมลตรงกับที่กรอก pre-chat → auto (ข) staff กด "ผูกกับสมาชิก" เลือก member → `POST .../link-member`

ขั้นตอน (transaction เดียว): ตรวจ `memberId ∈ tenant` → ตั้ง `guest.mergedToMemberId` → ย้าย `memberId` ให้ conversation ทุกอันของ guest นี้ → **ถ้า member มี conversation active ช่องทางเดียวกันอยู่แล้ว → merge: ย้ายข้อความเธรด guest ต่อท้ายเธรด member (เรียง createdAt) แล้วปิดเธรด guest เป็น RESOLVED พร้อม system message "รวมกับเธรดสมาชิก"** (กัน partial unique index ชน) → event `MEMBER_LINKED` → `AuditLog` (แตะตัวตนลูกค้า) → SSE refresh panel
- **Failure path:** ผูกผิดคน → staff ผูกใหม่ได้ (`chat.manage`) — event log เก็บประวัติทุกครั้ง; ข้อความที่ย้ายแล้วไม่ย้ายกลับ (ยอมรับใน v1, เตือน confirm ก่อนผูก)

### 7.5 SSE lifecycle

- ต่อ stream พร้อม `Last-Event-ID` → server replay event ที่พลาด (buffer ในหน่วยความจำ/Redis 5 นาที) — เกิน buffer → client refetch inbox เต็ม
- Heartbeat comment ทุก 25 วิ กัน proxy ตัด · reconnect exponential backoff 1s→30s · จอที่ไม่ active (visibilitychange) หยุด typing แต่คง stream

### 7.6 Retention purge (cron รายวัน 04:00 ตาม timezone ร้าน)

1. หา `ChatMessage` ที่ `createdAt < now - retentionDays` และ conversation `RESOLVED` (เธรด active ไม่ purge)
2. ลบไฟล์บน object storage (`ChatAttachment.storageKey`) → ลบแถว attachment → ตั้ง `message.purgedAt`, ล้าง `body` เป็น null (tombstone คงไว้ให้ count รายงานย้อนหลังตรง)
3. `ChatGuest` ที่ไม่ merge และ `lastSeenAt < now - 90d` และไม่มีเธรด active → ลบ PII (displayName/email/phone → null)
4. สรุปผลลง `AuditLog` (จำนวนที่ purge)

---

## 8. Integration (contracts จาก `_CONVENTIONS` §2)

### 8.1 Notification — contract 2.5 (ใช้จุดเดียว)
```
notify({ tenantId, to: { userId },   channel: 'WEB'|'EMAIL', template: 'chat.unassigned'|'chat.assigned_to_you', data: { conversationId, preview, unitName } })
notify({ tenantId, to: { memberId }, channel: 'EMAIL',        template: 'chat.staff_replied',                    data: { conversationId, preview, storeUrl } })
```
กติกา: Chat ไม่ส่งอีเมลเอง ไม่แตะ template engine เอง — ยิง notify อย่างเดียว; throttle ฝั่ง Chat (1 อีเมล/ชม./conversation)
· **class ของ template (D15):** `chat.unassigned` / `chat.assigned_to_you` / `chat.staff_replied` = **`TRANSACTIONAL`** ทั้งหมด (ส่งได้เสมอ ไม่ติด consent gate ฝั่ง marketing)

### 8.2 Member identity — contract 2.6
- อ้างลูกค้าด้วย `memberId` เท่านั้น ไม่ copy ชื่อ/เบอร์มาเก็บใน Chat (ยกเว้น `ChatGuest` ซึ่งเป็นตัวตนชั่วคราวก่อนเป็น member)
- แผงข้างจออ่านสดจาก Member ทุกครั้ง (ชื่อเปลี่ยนที่ Member → ข้างจอเปลี่ยนตาม)

### 8.3 Point / POS / Hotel / Booking (read-only)
แผง member panel เรียก **read service ภายใน** (function call ในโมดูล ไม่ใช่ HTTP): `member.getProfile(tenantId, memberId)`, `point.getBalance(...)+getRecentLedger(...,5)`, `pos.getRecentSales(tenantId, memberId, 10)`, `hotel.getRecentBookings(...)`, `booking.getRecentAppointments(...)` — โมดูลต้นทางเป็นเจ้าของ shape; โมดูลไหนยังไม่ enable ใน tenant → ซ่อน section นั้น (ไม่ error)

### 8.4 AuditLog กลาง (_CONVENTIONS §5)
บันทึกเมื่อ: link/unlink member, เปลี่ยน retention setting, เชื่อม/ถอด channel connection, retention purge run — who/what/when/before/after

### 8.5 ChannelAdapter interface (วางตั้งแต่ v1 — LINE/FB 🔜 มา plug)

```ts
// lib/modules/chat/channel-adapter.ts
export interface InboundMessage {
  externalThreadId: string          // LINE userId / FB PSID
  externalMessageId: string         // idempotency ฝั่ง provider
  profile?: { displayName?: string; avatarUrl?: string }
  type: 'TEXT' | 'IMAGE' | 'FILE'
  body?: string
  attachments?: { url: string; mimeType: string; fileName?: string }[]
  sentAt: Date
}

export interface ChannelAdapter {
  readonly type: ChatChannelType

  /** ตรวจ signature ของ webhook (LINE: x-line-signature, FB: x-hub-signature-256) */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>, credentials: Json): boolean

  /** แปลง payload → ข้อความมาตรฐาน (1 webhook อาจมีหลายข้อความ) */
  parseInbound(payload: unknown, credentials: Json): InboundMessage[]

  /** ส่งข้อความออก — โยน ChannelDeliveryError พร้อม retryable flag เมื่อพัง */
  sendMessage(args: {
    credentials: Json
    externalThreadId: string
    message: { type: ChatMessageType; body?: string; attachments?: ChatAttachment[] }
  }): Promise<{ externalMessageId?: string }>

  /** ตรวจ credentials ตอนตั้งค่า (กด "ทดสอบการเชื่อมต่อ") */
  healthCheck(credentials: Json): Promise<{ ok: boolean; detail?: string }>
}
```

Core routing (ทำใน v1 ให้ webchat วิ่งผ่านเส้นเดียวกัน): inbound → หา/สร้าง conversation จาก `(channelConnectionId, externalThreadId)` → insert message (idempotent ด้วย `externalMessageId` เก็บใน `meta`) → SSE/notify ตามปกติ; outbound → ถ้า conversation.channel ≠ WEBCHAT → `adapter.sendMessage` + retry with backoff (สูงสุด 3 ครั้ง) → พังถาวร → mark `meta.deliveryFailed` + system message แจ้ง staff + `connection.status=ERROR` เมื่อพังต่อเนื่อง

---

## 9. Permissions (RBAC 4 มิติ — Chat เป็น tenant-scoped แต่กรอง "การมองเห็น" ด้วย unitAccess)

**กติกาการมองเห็น (สำคัญ):** conversation มองเห็นได้เมื่อ `user.unitAccess = ["*"]` **หรือ** `conversation.unitId ∈ unitAccess` **หรือ** `conversation.unitId = null` (เธรดหน้ารวมองค์กร — ทุกคนที่มีสิทธิ์โมดูล Chat เห็น เพื่อไม่ให้เธรดตกหล่นไร้เจ้าของ) — บังคับที่ service layer ทุกเส้น (list/get/SSE/badge/report)

| Action | คำอธิบาย | OWNER | MANAGER | STAFF (มีสิทธิ์ Chat) | Custom |
|---|---|---|---|---|---|
| `chat.read` | เห็น inbox/อ่านเธรด (ตาม unitAccess) | ✅ | ✅ หน่วยตน | ✅ หน่วยตน | ✅ กำหนดได้ |
| `chat.reply` | ส่งข้อความ/โน้ต/แนบไฟล์/typing | ✅ | ✅ | ✅ | ✅ |
| `chat.manage` | มอบหมายให้คนอื่น, เปลี่ยน unit tag, ผูก member, เปลี่ยนสถานะเธรดของคนอื่น | ✅ | ✅ หน่วยตน | ❌ (default) | ✅ |
| `chat.settings` | widget/canned/ทีม/SLA/retention/connections | ✅ | ❌ (default) | ❌ | ✅ |
| `chat.reports` | ดูรายงาน | ✅ | ✅ หน่วยตน | ❌ | ✅ |

- STAFF เปลี่ยนสถานะ conversation **ที่ตัวเองเป็น assignee** ได้ด้วย `chat.reply` (ไม่ต้อง manage)
- ลูกค้า/guest: ไม่มี RBAC — ตรวจ ownership (session member / guest token) ต่อ conversation เท่านั้น
- Connections (credentials ช่องทาง): OWNER เท่านั้น แม้มี `chat.settings`

---

## 10. Reports & Metrics

แหล่งข้อมูล: **`DailyStat` กลาง (module=CHAT — D11, ดู REPORTS.md §7)** + query สดจาก raw สำหรับวันปัจจุบัน/median/P90 — ทุกรายงานกรอง `unitId` / `channel` (จาก meta) / ช่วงวันที่ได้ และเคารพ unitAccess ของผู้ดู

| รายงาน | นิยาม/สูตร |
|---|---|
| **Volume ต่อวัน** | conversations ใหม่/วัน + ข้อความเข้า-ออก/วัน (กราฟเส้น 2 ชุด) |
| **First Response Time** | avg = `frtSumSec/frtCount` · median + P90 คำนวณจาก raw (`firstResponseAt - firstCustomerMessageAt`) เฉพาะเธรดที่มี response แล้ว · แสดง % ภายใน SLA (`frtWithinSlaCount/frtCount`) |
| **เวลาตอบเฉลี่ยระหว่างบทสนทนา** | avg ของ (เวลาข้อความ staff − เวลาข้อความลูกค้าก่อนหน้า) ต่อคู่ ในช่วงวันที่เลือก (คำนวณจาก raw, ไม่นับ internal/system, ไม่นับช่วง PENDING) |
| **Resolved rate** | เธรดที่ `resolvedAt` ในช่วง ÷ เธรดใหม่ในช่วง + avg resolution time (`resolvedAt - createdAt`) + reopen rate (`reopenedCount>0` ÷ resolved) |
| **Per-agent** | จำนวนเธรดที่รับ, ข้อความที่ส่ง, FRT เฉลี่ยของเธรดที่ตน first-respond, resolved count |
| **Per-unit / per-channel** | ตารางเทียบทุก metric ข้างต้น แยกหน่วย/ช่องทาง |
| **แชทค้าง (สด)** | การ์ดบน Overview "ทุกกิจการ" (BLUEPRINT_BUSINESS_UNITS §4): เธรด OPEN ไร้ assignee + เกิน SLA ตอนนี้ |
| Export | CSV ทุกตาราง (`chat.reports`) |

---

## 11. Edge Cases & Rules

1. **Race สร้าง conversation ซ้ำ** — ลูกค้าเปิด 2 แท็บส่งพร้อมกัน: advisory lock ต่อตัวตน+ช่องทาง ใน transaction + partial unique index (§4) เป็น safety net; แพ้ lock → ใช้ conversation ที่ผู้ชนะสร้าง
2. **ส่งข้อความซ้ำจาก retry** — `@@unique([conversationId, clientMessageId])`; ชน → คืนข้อความเดิม 200 (idempotent)
3. **Unread count เพี้ยน** — `staffUnreadCount` denormalized: อัปเดตเฉพาะใน transaction เดียวกับ insert/read เท่านั้น + cron reconcile รายคืนเทียบ receipt (แก้ drift เงียบ ๆ + log)
4. **Guest ลบ cookie / เปลี่ยนเครื่อง** — เธรดเดิมเข้าไม่ได้ (by design, กันสวมรอย) → สร้าง guest ใหม่; ทางกู้คือ login เป็น member แล้ว staff ผูกเธรดเก่าให้ (§7.4)
5. **Widget โดน spam/bot** — rate limit: สร้าง session 5/นาที/IP, ข้อความ 10/นาที/ตัวตน, upload 5/ชม./guest; เกิน → 429 + widget แสดง "ส่งเร็วเกินไป กรุณารอสักครู่" · 🔜 ปุ่ม block ตัวตน
6. **Retention** — ค่า default 365 วัน (ต่ำสุด 90, สูงสุด 730 ช่วงฟรี): purge เฉพาะเธรด RESOLVED; ลดค่าลง = มีผลรอบ cron ถัดไป + confirm modal บอกจำนวนข้อความที่จะหาย; tombstone คงอยู่เพื่อรายงาน; ไฟล์แนบลบจริงจาก storage; เธรด/สถิติรายวัน (`DailyStat` กลาง module=CHAT)/`ChatConversationEvent` ไม่ purge (ไม่มี PII เนื้อหา)
7. **หน่วยถูก PAUSED/ARCHIVED** — เธรด tag หน่วยนั้นยังอยู่ครบ ตอบต่อได้ (แชทไม่ใช่ธุรกรรม); widget บนหน้าหน่วย PAUSED หายตาม storefront; ตัวกรองหน่วยยังแสดงหน่วย archived (ป้าย "เก็บถาวร")
8. **ลูกค้าทักตอนไม่มี staff ออนไลน์** — นอกเวลาทำการ: widget แสดง `offlineMessage` + ยังส่งข้อความได้ (เก็บเข้า inbox ปกติ, SLA ยังนับ — 🔜 business-hours-aware ค่อยหยุดนับ)
9. **ไฟล์อันตราย** — whitelist MIME + นามสกุลตรงกัน, บังคับ `Content-Disposition: attachment` ไฟล์ที่ไม่ใช่รูป, ห้าม svg/html/js; upload ที่ไม่ถูกอ้างในข้อความภายใน 1 ชม. → cron ลบ
10. **ข้อความ system/internal ไม่กระทบ SLA** — `firstResponseAt` และ "เวลาตอบเฉลี่ย" นับเฉพาะ STAFF ที่ `isInternal=false`; internal note ไม่ไปอยู่ `lastMessagePreview` และไม่ notify ลูกค้า
11. **Cross-tenant isolation** — guest token/member session ผูก tenant เดียว; SSE stream ตรวจ tenant ทุก event ก่อน push; attachment URL เป็น signed URL อายุสั้นถ้า bucket private
12. **การย้าย unit tag** — เปลี่ยนได้เฉพาะไปหน่วยใน tenant เดียวกัน + ผู้ย้ายต้องมีสิทธิ์เห็น**ทั้งหน่วยต้นทางและปลายทาง** (กัน "โยนเธรดทิ้ง" ไปหน่วยที่ตัวเองมองไม่เห็น)
13. **ห้ามปนกับ Meeting** — ไม่มี FK/JOIN ข้าม `Chat*` ↔ `Meeting*`; code review ต้อง reject ทุก import ข้าม module boundary สองตัวนี้

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] Guest ทักจากหน้าหน่วย → conversation เกิดพร้อม `unitId` ถูกต้อง; หน้ารวม → `unitId=null`
- [ ] ทักซ้ำระหว่าง OPEN/PENDING → ต่อเธรดเดิม; หลัง RESOLVED>24ชม. → เธรดใหม่; ≤24ชม. → reopen (`reopenedCount+1`)
- [ ] ส่งรูป/ไฟล์: type/size ผิด → 422 พร้อมข้อความไทย/อังกฤษ; สำเร็จ → thumbnail แสดงทั้งสองฝั่ง
- [ ] Canned: `/` autocomplete, ตัวแปร `{{member.name}}` แทนค่าจริง, canned จำกัดหน่วยไม่โผล่ในเธรดหน่วยอื่น
- [ ] มอบหมาย/เปลี่ยนสถานะ/ย้ายหน่วย/ผูก member → เกิด `ChatConversationEvent` + system message ครบทุกครั้ง
- [ ] `firstResponseAt` เซ็ตครั้งเดียวจากข้อความ staff แรกที่ไม่ internal; internal note ไม่ notify ลูกค้า ไม่ขึ้น preview
- [ ] Typing + read receipt เห็นสองฝั่งภายใน 2 วิ; SSE reconnect แล้ว resume ด้วย Last-Event-ID ไม่มีข้อความหาย
- [ ] Badge sidebar ตรงกับจำนวนจริงหลัง: ข้อความใหม่ / mark read / reconcile cron
- [ ] Notification: unassigned เกิน N นาที → WEB ถึง staff ที่มีสิทธิ์; ลูกค้า offline → EMAIL ไม่เกิน 1/ชม./เธรด
- [ ] Merge guest→member: เธรดย้าย, panel โชว์แต้ม/ประวัติ, เธรดซ้ำถูก merge ไม่ชน partial index
- [ ] รายงาน: FRT avg/median/P90, resolved rate, per-agent/unit/channel ตรงกับข้อมูลดิบชุดทดสอบ; `DailyStat` (module=CHAT) จาก StatProvider/StatRunner ตรง timezone ร้าน (D11)
- [ ] Retention cron: purge เฉพาะ RESOLVED เกินอายุ, ไฟล์หายจาก storage จริง, tombstone อยู่, guest PII ถูกล้าง

**Isolation & Security**
- [ ] User tenant B เรียกทุก endpoint ด้วย id ของ tenant A → 404/403 หมด (รวม SSE, upload, attachment URL)
- [ ] Manager หน่วย A ไม่เห็นเธรดหน่วย B ใน list/get/badge/report/SSE (ทดสอบทั้ง 5 ทาง)
- [ ] Guest token คนหนึ่งอ่านเธรด guest อื่น → 403; member อ่านเธรดคนอื่น → 403
- [ ] Rate limit ทำงาน (session/message/upload) + audit log ครบทุก action ใน §8.4
- [ ] ไม่มี import/JOIN ใด ๆ ระหว่าง `Chat*` กับ `Meeting*`

**i18n & UI**
- [ ] ทุก string มี TH/EN (dashboard + widget + อีเมล notification)
- [ ] Widget responsive: desktop popup / mobile full-sheet, ปุ่ม launcher ไม่ทับ UI storefront อื่น
- [ ] Inbox 3 คอลัมน์ → mobile ทีละคอลัมน์ ครบ empty/loading/error ทุกจอ
- [ ] B&W minimal: สถานะ/SLA ใช้ badge+น้ำหนักตัวอักษร ไม่พึ่งสี
