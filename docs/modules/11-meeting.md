# โมดูล 11 — Meeting (แชท + ประสานงานภายในองค์กร)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **tenant** (เครื่องมือองค์กร — ห้อง/บอร์ดอาจ link `unitId?` optional ตาม BLUEPRINT_BUSINESS_UNITS §2)
> ยึด: `../BLUEPRINT.md` · `../BLUEPRINT_BUSINESS_UNITS.md` · `_CONVENTIONS.md`
> คู่แฝดคนละตัว: โมดูล 10 Chat = แชทกับ**ลูกค้า** — คนละ inbox คนละ data model **ห้ามปนกันเด็ดขาด** (ตารางเทียบ §1.3)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 ทำอะไร (v1)

Meeting คือ **พื้นที่สื่อสารภายในทีมงานของ 1 องค์กร (tenant)** — คล้าย Slack ฉบับ SME ไทย ใช้ identity `User`/`Membership` เดิมของแพลตฟอร์ม ไม่ต้องสมัครอะไรเพิ่ม:

- **ห้องแชท (channel)** ต่อทีม/หน่วยธุรกิจ/หัวข้อ เช่น `#โรงแรม-a-front`, `#จัดซื้อ`, `#ทั่วไป`
- **DM 1:1** และ **group DM** ระหว่างพนักงาน
- **ประกาศ (announcement channel)** — staff อ่านอย่างเดียว, OWNER/MANAGER โพสต์
- mention `@user` / `@all`, แชร์ไฟล์/รูป, pin ข้อความ, ค้นหาข้อความ
- **link preview การ์ด Kanban**: วางลิงก์การ์ด → แสดงชื่องาน/คอลัมน์/ผู้รับผิดชอบในแชท
- **นัดประชุมแบบเบา**: โพสต์นัด (หัวข้อ+เวลา+สถานที่) ในห้อง + สมาชิกกด RSVP — **ไม่มี video call ใน v1** (🔜 ชัดเจน §1.2)
- Realtime SSE, unread badge, เก็บประวัติ**ถาวร** (ไม่มี retention purge — ต่างจาก Chat)

### 1.2 ไม่ทำอะไร (v1)

| เรื่อง | สถานะ | หมายเหตุ |
|---|---|---|
| **Video / voice call** | 🔜 ระบุชัด: v1 ไม่มีโดยเจตนา — นัดประชุม = โพสต์นัด+RSVP แล้วไปคุยกันเอง (ห้องจริง/โทร/Meet) ฟิลด์ `location` ใส่ลิงก์ Meet ภายนอกได้ | เผื่อโครง: `MeetingEvent.meta Json` รองรับ call provider ภายหลัง |
| Web push notification | 🔜 | v1 มี in-app (SSE + badge) + EMAIL ผ่าน contract 2.5; schema ไม่ต้องแก้ตอนเพิ่ม push |
| ปฏิทินรวม / sync Google Calendar | 🔜 | v1 มีแค่ list นัดในห้อง + "นัดของฉัน" |
| Thread ย่อย (reply thread แบบ Slack) | 🔜 | v1 มี reply-quote ธรรมดา (`replyToId`) |
| Reaction emoji | 🔜 | |
| Guest ภายนอก / ลูกค้าเข้าห้อง | ❌ ตลอดไป | ลูกค้า = โมดูล 10 เท่านั้น |
| ส่งข้อความหาลูกค้า | ❌ | ห้ามมี bridge ใด ๆ ไปโมดูล 10 |

### 1.3 ความต่างจาก Chat (โมดูล 10) — ห้ามปน

| | **11 Meeting** | **10 Chat** |
|---|---|---|
| คู่สนทนา | staff ↔ staff (User ใน tenant) | ลูกค้า ↔ ทีมร้าน |
| หน่วยข้อมูล | `MeetingRoom` ถาวร ไม่มีสถานะงาน/SLA | `ChatConversation` มี OPEN/PENDING/RESOLVED + SLA |
| สมาชิก | หลายคนต่อห้อง, invite/auto ตาม unitAccess | ลูกค้า 1 คนต่อเธรดเสมอ |
| ตาราง | prefix `Meeting*` | prefix `Chat*` |
| Retention | **ถาวร** | purge ตาม setting |
| UI / SSE | `/app/meeting` · `/api/meeting/stream` | `/app/chat` · `/api/chat/stream` |

จุดเชื่อมเดียวที่อนุญาต: วาง**ลิงก์** conversation ลูกค้า (`/app/chat/...`) ใน Meeting เป็น link preview (ตัวหนังสือ+ลิงก์) — ไม่ embed เนื้อหาข้อความลูกค้า, คนกดต้องมีสิทธิ์ Chat เองถึงจะเปิดอ่านได้

---

## 2. Persona & User Stories

| Persona | เกี่ยวข้องอย่างไร |
|---|---|
| **Owner** | สร้าง/จัดการทุกห้อง, โพสต์ประกาศ, เห็นทุกห้อง PUBLIC, ตั้งค่าโมดูล |
| **Manager** | สร้างห้องทีมตน, โพสต์ประกาศ, ดูแลห้องที่ตนเป็น room admin |
| **Staff** | เข้าห้องที่ถูกเชิญ/ห้อง PUBLIC/ห้องหน่วยตน, DM เพื่อนร่วมงาน, อ่านประกาศ, RSVP นัด |
| **Customer** | ❌ ไม่เกี่ยวข้องเด็ดขาด |

User stories หลัก:

1. **Owner:** "ฉันโพสต์ประกาศ 'ปรับเวลาเปิดร้านช่วงสงกรานต์' ลงห้องประกาศ — staff ทุกคนเห็น badge, อ่านได้แต่ตอบไม่ได้ และฉันเห็นว่ามีใครอ่านแล้วกี่คน"
2. **Manager โรงแรม A:** "ฉันสร้างห้อง `#โรงแรม-a-แม่บ้าน` ผูกกับหน่วยโรงแรม A — พนักงานที่มี unitAccess โรงแรม A เข้าเองได้เลยไม่ต้องเชิญทีละคน"
3. **Staff:** "หัวหน้า @เมย์ ในห้องจัดซื้อ ฉันได้ badge mention เด้งทันที กดเข้าไปเห็นข้อความ พร้อมไฟล์ใบเสนอราคาแนบ"
4. **Staff:** "ฉัน DM หาช่างอีกคนถามคิวพรุ่งนี้ แล้วแปะลิงก์การ์ด Kanban 'ซ่อมแอร์ห้อง 204' — ลิงก์แสดงเป็นการ์ดชื่องาน+สถานะ ไม่ต้องเปิดหน้าใหม่"
5. **Manager:** "ฉันโพสต์นัดประชุมทีม ศุกร์ 14:00 ที่ห้องหลังครัว ในห้องทีม — ทุกคนกดมา/ไม่มา ได้ เห็นยอดรวมใต้การ์ดนัด และคนที่ยังไม่ตอบ"
6. **Staff:** "ฉันค้นคำว่า 'รหัสตู้เซฟ' เจอข้อความปีที่แล้วในห้องที่ฉันเป็นสมาชิก — ห้องที่ฉันไม่ได้อยู่ค้นไม่เจอ"
7. **Staff (มือถือ):** "ระหว่างยืนหน้างานฉันเปิดจากมือถือ ห้อง list เป็น drawer พิมพ์ตอบได้ลื่นเหมือน LINE"

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 ห้อง (Rooms)
- ✅ ประเภทห้อง 4 แบบ: `CHANNEL` (ห้องหัวข้อ/ทีม) · `DM` (1:1) · `GROUP_DM` (3–20 คน) · `ANNOUNCEMENT` (ประกาศ)
- ✅ CHANNEL: ชื่อ + คำอธิบาย + visibility `PUBLIC` (staff ทุกคนในสิทธิ์เห็น+เข้าร่วมเองได้) / `PRIVATE` (invite เท่านั้น มองไม่เห็นจากภายนอก)
- ✅ ผูกหน่วย (`unitId?` optional): ห้องที่ผูกหน่วย + เปิด `autoJoinByUnit` → staff ที่มี unitAccess หน่วยนั้นเป็นสมาชิกอัตโนมัติ (sync เมื่อ unitAccess เปลี่ยน §7.6)
- ✅ ห้อง default ตอนเปิดโมดูล: `#ทั่วไป` (PUBLIC, auto-join ทุกคน) + `#ประกาศ` (ANNOUNCEMENT, auto-join ทุกคน)
- ✅ DM: หา-หรือ-สร้างจากคู่ userId (`dmKey` กันซ้ำ) — DM ปิด/ลบไม่ได้ แค่ mute/ซ่อนจาก list
- ✅ จัดการห้อง: เปลี่ยนชื่อ/คำอธิบาย, archive (read-only ทั้งห้อง, ค้นหายังเจอ), room admin เพิ่ม/ถอดสมาชิก
- ✅ ANNOUNCEMENT: โพสต์ได้เฉพาะ OWNER/MANAGER (หรือผู้ได้ `meeting.announce`), สมาชิกอื่น read-only, แสดงจำนวนผู้อ่านต่อโพสต์ (นับจาก read state)
- 🔜 หมวดหมู่/จัดกลุ่มห้องใน sidebar, ห้องข้าม tenant (ไม่มีแผน)

### 3.2 ข้อความ
- ✅ ตัวอักษร ≤ 8,000 ตัวอักษร, ขึ้นบรรทัด, ลิงก์ auto-detect
- ✅ Mention: `@ชื่อ` (autocomplete จากสมาชิกห้อง) + `@all` (เฉพาะ room admin/OWNER/MANAGER ในห้องใหญ่ >20 คน — กัน spam) → ผู้ถูก mention ได้ badge + notification
- ✅ แชร์รูป (≤10MB) / ไฟล์ (≤25MB) หลายไฟล์ต่อข้อความ (สูงสุด 5), presigned upload เหมือน Chat แต่ bucket/prefix แยก (`meeting/`)
- ✅ Reply-quote: อ้างข้อความเดิม (`replyToId`) แสดงกล่อง quote ย่อ กดแล้วเลื่อนไปต้นทาง
- ✅ แก้ไขข้อความตัวเอง (ภายใน 24 ชม., ติดป้าย "แก้ไขแล้ว" + เก็บ `editedAt`) และลบข้อความตัวเอง (soft delete → tombstone "ข้อความถูกลบ"; room admin ลบของคนอื่นได้)
- ✅ Pin: room admin/ผู้โพสต์ pin ข้อความสำคัญ (สูงสุด 50/ห้อง), แผง "ข้อความที่ปักหมุด" ต่อห้อง
- ✅ System message: เข้าห้อง/ออก/เปลี่ยนชื่อห้อง/pin (แบบเส้นกลางจอ)
- ✅ Typing indicator + read state ต่อสมาชิก (แสดง "อ่านแล้ว n คน" — รายชื่อคนอ่านดูได้ในห้อง ≤ 20 คน)
- 🔜 reaction, thread ย่อย, forward ข้อความข้ามห้อง, voice note

### 3.3 Link preview (unfurl)
- ✅ **การ์ด Kanban** (โมดูล 13): วางลิงก์ `/app/kanban/boards/[boardId]/cards/[cardId]` → embed การ์ด: ชื่องาน, บอร์ด/คอลัมน์, ผู้รับผิดชอบ, due date, ป้ายสี — snapshot ตอนโพสต์ + ปุ่ม refresh (กดดึงสถานะล่าสุด); ผู้กดลิงก์ต้องมีสิทธิ์ Kanban เองถึงเปิดหน้าเต็มได้ (§8.2)
- ✅ ลิงก์ภายในอื่น (`/app/chat/...`, `/app/members/...`): preview แบบ title-only ("💬 แชทลูกค้า #a1b2" / "👤 สมาชิก: สมชาย") — ไม่ leak เนื้อหา
- 🔜 unfurl ลิงก์ภายนอก (OG tags) — ระวัง SSRF, ทำหลัง proxy fetch พร้อม allowlist

### 3.4 นัดประชุม (Event + RSVP) — v1 แบบเบา
- ✅ โพสต์นัดในห้อง: หัวข้อ, วัน-เวลาเริ่ม(-จบ), สถานที่/ลิงก์ภายนอก, รายละเอียด → เป็นข้อความชนิดพิเศษ (การ์ดนัด) ในเธรด
- ✅ RSVP: มา / ไม่มา / ไม่แน่ใจ — เปลี่ยนใจได้จนถึงเวลานัด, การ์ดแสดงยอด + avatar, ผู้สร้างเห็นรายชื่อ "ยังไม่ตอบ"
- ✅ แก้/ยกเลิกนัด (ผู้สร้าง หรือ room admin) → system message + notification ถึงคน RSVP "มา"
- ✅ เตือนก่อนนัด 30 นาที ผ่าน contract 2.5 (WEB + EMAIL) ถึงคน RSVP "มา" + ผู้สร้าง
- ✅ มุมมอง "นัดของฉัน": list นัดที่กำลังมาถึงจากทุกห้องของฉัน
- 🔜 นัดซ้ำประจำ (recurring), เชิญข้ามห้อง, sync ปฏิทินภายนอก, video call ในตัว (**ยืนยัน: ไม่มีใน v1**)

### 3.5 ค้นหา
- ✅ Full-text search ข้อความ (Postgres `tsvector` + `pg_trgm` สำหรับไทย/อังกฤษ — ไทยไม่ตัดคำใน v1 ใช้ trigram match, 🔜 ตัวตัดคำไทย) **เฉพาะห้องที่ user เป็นสมาชิก**
- ✅ ตัวกรอง: ห้อง, ผู้ส่ง, มีไฟล์แนบ, ช่วงวันที่ · ผลลัพธ์กดแล้ว jump ไปข้อความในบริบทห้อง
- ✅ ค้นชื่อห้อง/ชื่อคน ใน quick switcher (Cmd/Ctrl+K)
- 🔜 ค้นในไฟล์แนบ (OCR/parse)

### 3.6 Realtime + Notification + Badge
- ✅ SSE `/api/meeting/stream` ต่อ user: event `message.new`, `message.updated`(แก้/ลบ/pin), `room.updated`, `member.updated`, `typing`, `read`, `event.updated`(นัด), `badge` · **topic ตาม scheme กลาง (D14 / _CONVENTIONS §2.8): `t:{tenantId}:meeting:{topic}`** (Meeting เป็น tenant-scoped)
- ✅ Unread ต่อห้อง (นับจาก `lastReadMessageId`) + badge mention แยก (เลขบนชื่อห้อง = mention, จุด = unread ธรรมดา)
- ✅ Badge รวมบน sidebar dashboard (เมนู "📢 Meeting"): จำนวนห้องที่มี mention/unread — ผ่าน SSE + poll fallback 60 วิ
- ✅ ระดับแจ้งเตือนต่อห้องต่อคน: `ALL` / `MENTIONS` (default ห้อง >20 คน) / `MUTED`
- ✅ Notification contract 2.5: ถูก mention หรือ DM ใหม่ + offline > 10 นาที → `EMAIL` สรุป (throttle รวม 1 ฉบับ/15 นาที/user); ประกาศใหม่ → `WEB` ทุกสมาชิก
- 🔜 Web Push (service worker) — ต่อจาก notify กลาง ไม่แก้ schema

### 3.7 มือถือ
- ✅ Responsive เต็มรูป: room list = drawer ซ้าย, ห้อง = เต็มจอ, แผง pin/สมาชิก = bottom sheet, ช่องพิมพ์ sticky เหนือคีย์บอร์ด, แนบรูปจากกล้อง/แกลเลอรี
- 🔜 web push บนมือถือ (มากับ 3.6)

---

## 4. Data Model (Prisma)

> tenant-scoped ทุกตาราง (`tenantId`) — ประวัติเก็บ**ถาวร** ไม่มี retention purge — ลบข้อความ = soft delete tombstone — id cuid, `createdAt/updatedAt` ครบ

```prisma
// ───────────────────────── enums ─────────────────────────

enum MeetingRoomType {
  CHANNEL
  DM
  GROUP_DM
  ANNOUNCEMENT
}

enum MeetingRoomVisibility {
  PUBLIC    // staff ทุกคนเห็นใน directory + join เองได้
  PRIVATE   // invite เท่านั้น (DM/GROUP_DM เป็น PRIVATE เสมอ)
}

enum MeetingMemberRole {
  ADMIN     // จัดการห้อง: เชิญ/ถอด/เปลี่ยนชื่อ/pin/ลบข้อความคนอื่น
  MEMBER
}

enum MeetingNotifyLevel {
  ALL
  MENTIONS
  MUTED
}

enum MeetingMessageType {
  TEXT
  IMAGE
  FILE
  SYSTEM      // เข้าห้อง/เปลี่ยนชื่อ/pin ฯลฯ
  EVENT_POST  // การ์ดนัดประชุม (meta.eventId)
}

enum MeetingRsvpResponse {
  GOING
  DECLINED
  MAYBE
}

// ───────────────────────── Room ─────────────────────────

model MeetingRoom {
  id             String                @id @default(cuid())
  tenantId       String
  type           MeetingRoomType
  name           String?               // CHANNEL/ANNOUNCEMENT; DM/GROUP_DM = null (UI ประกอบชื่อจากสมาชิก)
  description    String?
  visibility     MeetingRoomVisibility @default(PRIVATE)
  unitId         String?               // ผูกหน่วยธุรกิจ (optional ตาม BUSINESS_UNITS §2)
  autoJoinByUnit Boolean               @default(false) // true = staff ที่มี unitAccess หน่วยนี้เข้าอัตโนมัติ
  isDefault      Boolean               @default(false) // #ทั่วไป/#ประกาศ — archive/ลบไม่ได้
  dmKey          String?               // DM/GROUP_DM: sha256 ของ userId เรียงแล้ว join ":" — กันสร้างซ้ำ
  createdByUserId String
  lastMessageAt  DateTime?             // เรียง room list
  archivedAt     DateTime?             // read-only ทั้งห้อง
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  members  MeetingRoomMember[]
  messages MeetingMessage[]
  events   MeetingEvent[]

  @@unique([tenantId, dmKey])            // DM คู่เดิม = ห้องเดิมเสมอ
  @@unique([tenantId, type, name])       // ชื่อ channel ไม่ซ้ำในองค์กร (name null ไม่ติด constraint)
  @@index([tenantId, type, archivedAt])
  @@index([tenantId, unitId])
  @@index([tenantId, lastMessageAt(sort: Desc)])
}

model MeetingRoomMember {
  id                String             @id @default(cuid())
  tenantId          String
  roomId            String
  room              MeetingRoom        @relation(fields: [roomId], references: [id])
  userId            String
  role              MeetingMemberRole  @default(MEMBER)
  notifyLevel       MeetingNotifyLevel @default(ALL)
  autoJoined        Boolean            @default(false) // มาจาก autoJoinByUnit → ถูก sync ถอนได้ (§7.6)
  hiddenAt          DateTime?          // ซ่อน DM จาก list (ไม่ใช่ออกจากห้อง)
  lastReadMessageId String?
  lastReadAt        DateTime?
  joinedAt          DateTime           @default(now())
  leftAt            DateTime?          // ออกจากห้อง (ประวัติ member คงไว้ — ข้อความเก่าอ้างถึงได้)
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@unique([roomId, userId])
  @@index([tenantId, userId, leftAt])   // room list ของ user
  @@index([roomId, leftAt])
}

// ───────────────────────── Message ─────────────────────────

model MeetingMessage {
  id             String             @id @default(cuid())
  tenantId       String
  roomId         String
  room           MeetingRoom        @relation(fields: [roomId], references: [id])
  senderUserId   String             // SYSTEM ใช้ userId ผู้ trigger หรือ "system"
  type           MeetingMessageType @default(TEXT)
  body           String?            @db.Text
  // ค้นหา: migration raw เพิ่ม generated column `search tsvector` (simple config) + GIN index
  // + GIN pg_trgm บน body สำหรับภาษาไทย — Prisma ไม่ declare ตรงนี้ (ดูหมายเหตุใต้ schema)
  replyToId      String?
  replyTo        MeetingMessage?    @relation("MeetingReply", fields: [replyToId], references: [id])
  replies        MeetingMessage[]   @relation("MeetingReply")
  mentions       Json               @default("[]")   // ["usr_x"] หรือ ["@all"] — ใช้ render highlight
  embeds         Json?              // link preview: [{kind:'KANBAN_CARD', cardId, snapshot:{title,column,assignee,dueDate}, refreshedAt}]
  clientMessageId String?           // idempotency จาก client
  editedAt       DateTime?
  deletedAt      DateTime?          // soft delete → tombstone (body ล้างเป็น null, attachment ลบจาก storage)
  deletedByUserId String?
  pinnedAt       DateTime?
  pinnedByUserId String?
  meta           Json?              // SYSTEM payload / EVENT_POST: { eventId }
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  attachments MeetingAttachment[]
  mentionRows MeetingMention[]

  @@unique([roomId, clientMessageId])
  @@index([roomId, createdAt])
  @@index([roomId, pinnedAt])           // แผง pin
  @@index([tenantId, createdAt])
}
// Raw migration แนบท้าย (นอก Prisma):
//   ALTER TABLE "MeetingMessage" ADD COLUMN search tsvector
//     GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body,''))) STORED;
//   CREATE INDEX meeting_msg_search ON "MeetingMessage" USING GIN (search);
//   CREATE INDEX meeting_msg_trgm   ON "MeetingMessage" USING GIN (body gin_trgm_ops);

model MeetingAttachment {
  id         String         @id @default(cuid())
  tenantId   String
  messageId  String
  message    MeetingMessage @relation(fields: [messageId], references: [id])
  kind       MeetingMessageType // IMAGE | FILE
  storageKey String
  url        String
  fileName   String
  mimeType   String
  sizeBytes  Int
  width      Int?
  height     Int?
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  @@index([messageId])
  @@index([tenantId, createdAt])
}

// mention inbox — ทำ badge/"@ ที่ค้าง" query ถูก (ไม่ scan Json)
model MeetingMention {
  id               String         @id @default(cuid())
  tenantId         String
  roomId           String
  messageId        String
  message          MeetingMessage @relation(fields: [messageId], references: [id])
  mentionedUserId  String         // แตก @all เป็นรายคน ณ เวลาโพสต์ (สมาชิกขณะนั้น)
  isAll            Boolean        @default(false)
  readAt           DateTime?      // เซ็ตเมื่อ user อ่านห้องผ่านข้อความนี้
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  @@unique([messageId, mentionedUserId])
  @@index([tenantId, mentionedUserId, readAt])   // badge mention ค้าง
}

// ───────────────────── นัดประชุม + RSVP ─────────────────────

model MeetingEvent {
  id              String      @id @default(cuid())
  tenantId        String
  roomId          String
  room            MeetingRoom @relation(fields: [roomId], references: [id])
  messageId       String?     // EVENT_POST การ์ดในเธรด (สร้างพร้อมกัน)
  title           String
  startsAt        DateTime    // UTC — แสดงตาม timezone ร้าน
  endsAt          DateTime?
  location        String?     // ห้องประชุมจริง หรือลิงก์ Meet/Zoom ภายนอก (v1 ไม่มี call ในตัว)
  detail          String?     @db.Text
  createdByUserId String
  canceledAt      DateTime?
  cancelReason    String?
  reminderSentAt  DateTime?   // cron เตือนก่อน 30 นาที — กันส่งซ้ำ
  meta            Json?       // เผื่อ call provider 🔜
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  rsvps MeetingEventRsvp[]

  @@index([tenantId, startsAt])          // "นัดของฉัน" + cron เตือน
  @@index([roomId, startsAt])
}

model MeetingEventRsvp {
  id        String              @id @default(cuid())
  tenantId  String
  eventId   String
  event     MeetingEvent        @relation(fields: [eventId], references: [id])
  userId    String
  response  MeetingRsvpResponse
  note      String?             // "เข้าช้า 15 นาที"
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  @@unique([eventId, userId])   // เปลี่ยนใจ = update แถวเดิม (ประวัติผ่าน updatedAt)
  @@index([tenantId, userId])
}
```

**หมายเหตุ schema:**
- ไม่มีตารางร่วม/ FK ใด ๆ ไปยัง `Chat*` — บังคับด้วย convention + code review (§11.9)
- `userId` อ้าง `User` กลางของแพลตฟอร์ม; การเป็นพนักงานตรวจผ่าน `Membership` ที่ service layer (user ที่ถูกถอด Membership → ทุกห้อง read ไม่ได้ทันที §11.4)
- read state เก็บบน `MeetingRoomMember` (แถวเดียวต่อคนต่อห้อง) — ไม่ทำ per-message receipt (ห้องใหญ่จะบวม); "อ่านแล้ว n คน" คำนวณจาก `lastReadMessageId >= messageId` (เทียบ createdAt)

---

## 5. API Endpoints

> ทุกเส้นตรวจ session staff + `can(user, { tenantId, module:'MEETING', action })` + ตรวจ "เป็นสมาชิกห้อง" (ยกเว้น directory ห้อง PUBLIC) — ลูกค้า/guest ไม่มีทางเข้าโมดูลนี้

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 1 | `GET /api/meeting/rooms` | room list ของฉัน (เรียง lastMessageAt, รวม unread/mention count) + directory PUBLIC ที่ยังไม่ join (`?directory=1`) | — | `meeting.use` |
| 2 | `POST /api/meeting/rooms` | สร้าง CHANNEL/ANNOUNCEMENT | `{ type, name, description?, visibility, unitId?, autoJoinByUnit?, memberUserIds? }` | CHANNEL: `meeting.create_room` · ANNOUNCEMENT: `meeting.announce` |
| 3 | `POST /api/meeting/dm` | หา-หรือ-สร้าง DM/GROUP_DM | `{ userIds: [..] }` (รวมตัวเอง 2 คน=DM, 3–20=GROUP_DM) | `meeting.use` |
| 4 | `GET /api/meeting/rooms/:id` | รายละเอียดห้อง + สมาชิก + pins count | — | สมาชิก (PUBLIC: staff ใดก็ได้ดู meta เพื่อตัดสินใจ join) |
| 5 | `PATCH /api/meeting/rooms/:id` | เปลี่ยนชื่อ/คำอธิบาย/visibility/unitId/autoJoinByUnit/archive | ฟิลด์ที่แก้ | room ADMIN (default ห้าม archive; `isDefault` ห้ามแตะ) |
| 6 | `POST /api/meeting/rooms/:id/join` | join ห้อง PUBLIC เอง | — | `meeting.use` |
| 7 | `POST /api/meeting/rooms/:id/members` | เชิญสมาชิก | `{ userIds }` | room ADMIN (CHANNEL PUBLIC: สมาชิกใดก็เชิญได้) |
| 8 | `DELETE /api/meeting/rooms/:id/members/:userId` | ถอด/ออกเอง (set leftAt) | — | room ADMIN หรือเจ้าตัว |
| 9 | `PATCH /api/meeting/rooms/:id/members/:userId` | เปลี่ยน role/notifyLevel/hidden | `{ role?, notifyLevel?, hiddenAt? }` | role: room ADMIN · notify/hidden: เจ้าตัว |
| 10 | `GET /api/meeting/rooms/:id/messages` | ข้อความ (cursor สองทิศ: ก่อน/หลัง เพื่อ jump จาก search/pin) | `cursor, direction, limit≤50` | สมาชิก |
| 11 | `POST /api/meeting/rooms/:id/messages` | ส่งข้อความ | `{ type, body?, attachmentIds?, replyToId?, mentions?, clientMessageId }` — server แตก `@all`, สร้าง embeds จากลิงก์ (§8.2) | สมาชิก (ANNOUNCEMENT: `meeting.announce`) |
| 12 | `PATCH /api/meeting/messages/:id` | แก้ข้อความตัวเอง (≤24 ชม.) | `{ body }` (re-parse mentions/embeds) | ผู้ส่ง |
| 13 | `DELETE /api/meeting/messages/:id` | soft delete → tombstone | — | ผู้ส่ง หรือ room ADMIN |
| 14 | `POST /api/meeting/messages/:id/pin` · `DELETE .../pin` | pin/unpin (limit 50/ห้อง → 409) | — | room ADMIN หรือผู้ส่ง |
| 15 | `GET /api/meeting/rooms/:id/pins` | list ข้อความที่ pin | — | สมาชิก |
| 16 | `POST /api/meeting/rooms/:id/read` | อัปเดต lastRead + เคลียร์ mention (`readAt`) ถึงข้อความนั้น | `{ lastReadMessageId }` | สมาชิก |
| 17 | `POST /api/meeting/rooms/:id/typing` | typing ephemeral (TTL 5 วิ) | — | สมาชิก |
| 18 | `POST /api/meeting/uploads` | presigned upload (prefix `meeting/`) | `{ fileName, mimeType, sizeBytes }` | `meeting.use` |
| 19 | `GET /api/meeting/search` | FTS เฉพาะห้องที่เป็นสมาชิก | `q, roomId?, senderUserId?, hasAttachment?, from?, to?, cursor` | `meeting.use` |
| 20 | `GET /api/meeting/stream` | **SSE** ต่อ user (ทุกห้องที่เป็นสมาชิก, resume ด้วย Last-Event-ID) | — | `meeting.use` |
| 21 | `GET /api/meeting/unread-count` | badge poll fallback `{ rooms: n, mentions: n }` | — | `meeting.use` |
| 22 | `POST /api/meeting/rooms/:id/events` | สร้างนัด (+EVENT_POST ในเธรด transaction เดียว) | `{ title, startsAt, endsAt?, location?, detail? }` | สมาชิก (ANNOUNCEMENT: `meeting.announce`) |
| 23 | `GET /api/meeting/rooms/:id/events` | นัดในห้อง (upcoming/past) | — | สมาชิก |
| 24 | `PATCH /api/meeting/events/:id` | แก้/ยกเลิกนัด | `{ ...fields, canceledAt?, cancelReason? }` | ผู้สร้าง หรือ room ADMIN |
| 25 | `POST /api/meeting/events/:id/rsvp` | ตอบรับ (upsert) | `{ response, note? }` | สมาชิกห้องของนัด |
| 26 | `GET /api/meeting/my-events` | นัดของฉันทุกห้อง (upcoming) | `from?, to?` | `meeting.use` |
| 27 | `GET /api/meeting/link-preview` | resolve ลิงก์ภายใน → embed payload (ใช้ตอน compose ให้เห็นตัวอย่าง) | `url` | `meeting.use` |

---

## 6. UI Screens

> TH/EN · B&W minimal · mobile-first · empty/loading/error ครบทุกจอ

### 6.1 `/app/meeting` — จอหลัก 2 คอลัมน์ (tenant-level, ไม่มี `/u/`)

- **คอลัมน์ซ้าย — room list:** ช่องค้นหา + quick switcher (Cmd/Ctrl+K) · แบ่ง section: 📢 ประกาศ (ตรึงบน) / ห้อง (channel) / ข้อความส่วนตัว (DM) · แต่ละแถว: ชื่อห้อง (DM = ชื่อคู่สนทนา + จุดสถานะออนไลน์), preview ล่าสุด, เวลา, **badge เลขดำ = mention / จุดดำ = unread** / ไอคอน 🔕 = MUTED · ปุ่ม "+ ห้องใหม่" (modal: ประเภท, ชื่อ, visibility, ผูกหน่วย + toggle auto-join, เชิญสมาชิก) · ลิงก์ "สำรวจห้อง" (directory PUBLIC พร้อมปุ่ม join)
- **คอลัมน์ขวา — ห้องแชท:**
  - header: ชื่อห้อง + ชิปหน่วย (ถ้าผูก) + จำนวนสมาชิก (กด = แผงสมาชิก) + ไอคอน 📌 (แผง pin) + 📅 (นัดในห้อง) + ⋯ (ตั้งค่าห้อง/แจ้งเตือน/ออกจากห้อง)
  - เธรด: จัดกลุ่มตามวัน (เส้นคั่น "วันนี้/เมื่อวาน/12 ก.ค."), เส้น "ยังไม่ได้อ่าน" ณ จุด lastRead, ข้อความ: avatar+ชื่อ+เวลา, mention highlight (พื้นเทาอ่อน+ตัวหนา), quote box, embed การ์ด Kanban (กรอบ hairline: ชื่องาน/คอลัมน์/ผู้รับ/due + ปุ่ม refresh), การ์ดนัด (หัวข้อ+เวลา+สถานที่+ปุ่ม RSVP 3 ปุ่ม+แถว avatar ผู้ตอบ), tombstone "ข้อความถูกลบ", ป้าย "แก้ไขแล้ว"
  - hover/long-press เมนูต่อข้อความ: ตอบกลับ / pin / แก้ไข / ลบ / คัดลอกลิงก์ข้อความ
  - composer: textarea + แนบไฟล์ (สูงสุด 5, แสดง chip ก่อนส่ง) + `@` autocomplete + Enter ส่ง / Shift+Enter ขึ้นบรรทัด + ปุ่ม 📅 "นัดประชุม" (modal ฟอร์มนัด)
  - ANNOUNCEMENT: สมาชิกธรรมดาเห็น banner "ห้องประกาศ — อ่านอย่างเดียว" แทน composer; ใต้โพสต์แสดง "อ่านแล้ว 12/17"
  - ห้อง archived: banner "ห้องนี้ถูกเก็บถาวร — อ่านได้อย่างเดียว"
- **แผงข้าง (slide-over):** สมาชิก (รายชื่อ+role+ปุ่มเชิญ/ถอด), ข้อความที่ปักหมุด, นัดในห้อง (upcoming/past)
- **Empty states:** ยังไม่มีห้อง → "สร้างห้องแรกของทีมคุณ" + ปุ่ม; ห้องว่าง → "ทักทายทีมของคุณได้เลย 👋"

### 6.2 `/app/meeting/search` — ผลค้นหา: แถบกรอง (ห้อง/ผู้ส่ง/ไฟล์แนบ/วันที่) + ผลลัพธ์ highlight คำค้น + ปุ่ม "ดูในห้อง" (jump พร้อม context สองทิศ)

### 6.3 `/app/meeting/my-events` — นัดของฉัน: list การ์ดนัด upcoming (วันนี้/สัปดาห์นี้/ถัดไป) + สถานะ RSVP ของฉัน + กดเข้าห้องต้นทาง

### 6.4 Mobile behavior
- room list = จอแรก → tap เข้าห้องเต็มจอ (ปุ่ม back), แผงสมาชิก/pin/นัด = bottom sheet, quick switcher = ปุ่มค้นหาบน header, แนบรูปจากกล้องได้, typing/badge realtime เท่ากับ desktop

### 6.5 จุดแสดงผลบน dashboard อื่น
- sidebar เมนู "📢 Meeting": badge = mention ค้าง (เลข) หรือจุด unread
- Overview "ทุกกิจการ": การ์ด "ประกาศล่าสุด" (โพสต์ ANNOUNCEMENT ล่าสุด 1 รายการ + ลิงก์)

---

## 7. Business Flows

### 7.1 สร้างห้องทีมผูกหน่วย + auto-join
1. Manager สร้างห้อง `{ type: CHANNEL, name: "โรงแรม-a-แม่บ้าน", visibility: PUBLIC, unitId: unit_a, autoJoinByUnit: true }`
2. Service ตรวจ: `can(meeting.create_room)` + `unit_a ∈ tenant` + ชื่อไม่ซ้ำ (`@@unique`) → สร้างห้อง + ผู้สร้างเป็น ADMIN
3. Query Membership ทุกคนที่ `unitAccess ⊇ unit_a` หรือ `["*"]` → insert `MeetingRoomMember { autoJoined: true }` (batch) + system message "สร้างห้องแล้ว"
4. SSE `room.updated` → ห้องโผล่ใน list สมาชิกทุกคน
   - **Failure:** ชื่อซ้ำ → 409 + inline error (ตาม feedback validation inline) · unit ARCHIVED → 422 "หน่วยนี้ถูกเก็บถาวร"

### 7.2 ส่งข้อความ + mention + Kanban embed
1. Staff พิมพ์ "@เมย์ ช่วยดูงานนี้ /app/kanban/boards/b1/cards/c9" กดส่ง → `POST .../messages { body, mentions:["usr_may"], clientMessageId }`
2. Server (transaction): ตรวจสมาชิก+ไม่ archived → parse ลิงก์ภายใน → เรียก `kanban.getCardPreview(tenantId, cardId)` (§8.2) → ได้ snapshot → insert message (`embeds`, `mentions`) + `MeetingMention` แถวของ usr_may + อัปเดต `room.lastMessageAt`
3. SSE `message.new` ถึงสมาชิกทุกคน + badge mention ของ usr_may
4. usr_may offline > 10 นาที → `notify({ channel: EMAIL, template: 'meeting.mentioned', data: { roomName, preview, url } })` (throttle 1/15 นาที)
   - **Failure:** การ์ด Kanban ไม่มีสิทธิ์/ถูกลบ → embed fallback `{kind:'LINK', title:'การ์ด Kanban'}` ไม่ leak ชื่องาน · ส่งซ้ำ retry → `@@unique(roomId, clientMessageId)` คืนข้อความเดิม

### 7.3 @all ในห้องใหญ่
- ห้อง ≤ 20 คน: สมาชิกใดใช้ `@all` ได้ · > 20 คน: เฉพาะ room ADMIN/OWNER/MANAGER — ฝ่าฝืน → 403 + ข้อความ "ห้องนี้จำกัด @all เฉพาะผู้ดูแล"
- `@all` แตกเป็น `MeetingMention` รายคน (สมาชิก ณ เวลาโพสต์, `isAll: true`) — คน join ทีหลังไม่ได้ mention ย้อนหลัง

### 7.4 โพสต์นัด + RSVP + เตือน
1. ผู้สร้างกด 📅 กรอกฟอร์ม → `POST .../events` → transaction: insert `MeetingEvent` + `MeetingMessage { type: EVENT_POST, meta:{eventId} }`
2. สมาชิกกด "มา/ไม่มา/ไม่แน่ใจ" → upsert RSVP → SSE `event.updated` → การ์ดอัปเดตยอดสด
3. Cron ทุก 5 นาที: หา event `startsAt - 30m ≤ now` และ `reminderSentAt IS NULL` และไม่ cancel → notify (WEB+EMAIL) ถึง RSVP=GOING + ผู้สร้าง → set `reminderSentAt` (กันส่งซ้ำแบบ atomic `UPDATE ... WHERE reminderSentAt IS NULL RETURNING`)
4. แก้เวลา/ยกเลิก → system message ในเธรด + notify ผู้ RSVP GOING
   - **Failure:** RSVP หลังเวลาเริ่ม → 422 "นัดเริ่มไปแล้ว" · แก้นัดพร้อมกัน 2 คน → last-write-win + `updatedAt` (การ์ดรีเฟรชจาก SSE)

### 7.5 แก้/ลบข้อความ
- แก้: เจ้าของ ภายใน 24 ชม. → set `editedAt`, re-parse mention (mention ที่เพิ่มใหม่ → แจ้งเตือนใหม่; ที่ถูกลบออก → ลบแถว mention ที่ยัง unread)
- ลบ: soft → `deletedAt/deletedByUserId`, `body=null`, ลบไฟล์จาก storage, ลบแถว `MeetingMention` unread, embed ถูกล้าง — tombstone แสดง "ข้อความถูกลบ" · **ประวัติถาวร = ไม่ hard delete แถว**

### 7.6 Sync สมาชิก auto-join เมื่อ unitAccess เปลี่ยน
- Event hook จากโมดูล settings/team: `membership.unitAccessChanged(userId)` → ทุกห้อง `autoJoinByUnit=true`:
  - ได้สิทธิ์หน่วยเพิ่ม → insert member (`autoJoined: true`) ถ้ายังไม่มี
  - เสียสิทธิ์ → เฉพาะแถว `autoJoined: true` → set `leftAt` (คนที่ถูกเชิญ manual ไม่โดนถอน)
- ถูกถอด Membership ทั้ง tenant → set `leftAt` ทุกห้อง + ตัด SSE ทันที (ข้อความเก่าของเขายังอยู่ครบ ชื่อยัง render ได้)

### 7.7 Read state + badge
- เปิดห้อง/เลื่อนถึงล่าสุด → `POST .../read { lastReadMessageId }` → update member row + `MeetingMention.readAt` ที่ ≤ ข้อความนั้น → SSE `read` (ให้จอนับ "อ่านแล้ว n คน") + `badge` กลับหา user เอง (ทุกแท็บ sync)
- Badge รวม sidebar = `count(rooms: unread)` + `count(mentions: readAt IS NULL)` — คำนวณฝั่ง server ส่งผ่าน SSE, poll fallback 60 วิ

---

## 8. Integration (contracts `_CONVENTIONS` §2)

### 8.1 Notification — contract 2.5 (จุดเดียว ไม่ส่งเอง)
```
notify({ tenantId, to: { userId }, channel: 'WEB'|'EMAIL', template:
  'meeting.mentioned' | 'meeting.dm_new' | 'meeting.announcement' | 'meeting.event_reminder' | 'meeting.event_changed',
  data: { roomId, roomName, preview, url, eventTitle?, startsAt? } })
```
กติกา throttle ฝั่ง Meeting: EMAIL รวมไม่เกิน 1 ฉบับ/15 นาที/user (รวม mention+DM เป็น digest), `MUTED` = ไม่ notify ทุกชนิด, `MENTIONS` = เฉพาะ mention/DM/นัด
· **class ของ template (D15):** ทุก template ของ Meeting (`meeting.mentioned` / `meeting.dm_new` / `meeting.announcement` / `meeting.event_reminder` / `meeting.event_changed`) = **`TRANSACTIONAL`** (แจ้งเตือนภายในทีม — ส่งได้เสมอ ไม่ติด consent gate)

### 8.2 Kanban (โมดูล 13) — read-only preview
```
kanban.getCardPreview(tenantId, cardId) → { cardId, title, boardName, columnName, assigneeName?, dueDate?, labels[] } | null
```
- Meeting เรียกตอนโพสต์/กด refresh เท่านั้น (snapshot เก็บใน `embeds` — ไม่ subscribe การเปลี่ยนแปลง)
- **ไม่ตรวจสิทธิ์รายคนตอนโพสต์** (คนโพสต์เห็นการ์ดอยู่แล้ว) แต่การกดเปิดหน้าเต็มตรวจสิทธิ์ Kanban ปกติ; บอร์ด PRIVATE ที่ผู้โพสต์ไม่มีสิทธิ์ → คืน null → fallback ลิงก์เปล่า
- Kanban อาจ deep-link กลับ ("คุยเรื่องการ์ดนี้ใน Meeting") 🔜 — ระบุฝั่ง Kanban

### 8.3 User/Membership (แกนกลาง)
- ชื่อ/avatar staff อ่านสดจาก `User` + `Membership` — Meeting ไม่ copy เก็บ
- subscribe event `membership.unitAccessChanged`, `membership.removed` (§7.6)
- สถานะออนไลน์: presence กลางจาก SSE hub (user มี stream ต่ออยู่ = ออนไลน์) — แชร์ logic กับโมดูล Chat ได้ที่ชั้น infra (SSE hub เดียว) **แต่ event/topic แยก namespace เด็ดขาด** (`t:{tenantId}:meeting:*` vs `t:{tenantId}:chat:*` — scheme กลาง D14)

### 8.4 AuditLog กลาง
บันทึก: สร้าง/archive ห้อง, เปลี่ยน visibility/unitId, ถอดสมาชิก, ลบข้อความโดยคนที่ไม่ใช่ผู้ส่ง, แก้/ยกเลิกนัด — who/what/when/before/after

### 8.5 สิ่งที่ไม่ integrate (by design)
- ❌ โมดูล 10 Chat (ห้ามทุกชั้น — ลิงก์ preview title-only เท่านั้น)
- ❌ Point/POS/Account — Meeting ไม่มีธุรกรรมเงิน/แต้ม

---

## 9. Permissions

RBAC 4 มิติ: Meeting เป็น tenant-scoped — มิติ unit ใช้เฉพาะกลไก `autoJoinByUnit` (การมองเห็นจริงคุมด้วย**การเป็นสมาชิกห้อง**) + สิทธิ์ระดับห้อง (room ADMIN) ซ้อนอีกชั้น

| Action | คำอธิบาย | OWNER | MANAGER | STAFF | Custom |
|---|---|---|---|---|---|
| `meeting.use` | เข้าโมดูล, DM, join ห้อง PUBLIC, ส่งข้อความในห้องที่เป็นสมาชิก, RSVP, ค้นหา | ✅ | ✅ | ✅ (default ทุกคนที่มี Membership) | ✅ ปิดได้รายคน |
| `meeting.create_room` | สร้าง CHANNEL/GROUP_DM | ✅ | ✅ | ✅ (default — ปิดได้) | ✅ |
| `meeting.announce` | สร้าง/โพสต์ในห้อง ANNOUNCEMENT | ✅ | ✅ | ❌ | ✅ |
| `meeting.admin` | จัดการห้องใด ๆ ทั้ง tenant (แก้/archive/ถอดสมาชิก/ลบข้อความ แม้ไม่เป็นสมาชิก — ใช้กู้สถานการณ์) | ✅ | ❌ (default) | ❌ | ✅ |
| room `ADMIN` (ระดับห้อง) | เชิญ/ถอด, เปลี่ยนชื่อ, pin, ลบข้อความคนอื่น, แก้นัดในห้อง | ผู้สร้างห้อง + ผู้ที่ถูกตั้ง | | | |

กติกาเพิ่ม:
- ห้อง PRIVATE: มองไม่เห็นใน directory/search สำหรับคนนอก แม้เป็น OWNER — OWNER ที่จำเป็นต้องเข้า ใช้ `meeting.admin` (มี AuditLog กำกับทุกครั้ง — โปร่งใสต่อทีม: system message "เจ้าของร้านเข้าร่วมห้อง")
- DM: สองคนเท่านั้น เชิญเพิ่มไม่ได้ (สร้าง GROUP_DM ใหม่แทน), ไม่มี room ADMIN
- Search/SSE/badge: บังคับ filter "ห้องที่ฉันเป็นสมาชิก (`leftAt IS NULL`)" ที่ service layer ทุกเส้น

---

## 10. Reports & Metrics

> Meeting เป็นเครื่องมือภายใน — รายงานเบากว่าโมดูลลูกค้า เน้น adoption + การรับรู้ประกาศ (ไม่ทำ surveillance รายคน)

| รายงาน/Metric | นิยาม | ใครเห็น |
|---|---|---|
| **Adoption รายสัปดาห์** | active user (ส่ง ≥1 ข้อความ/สัปดาห์) ÷ staff ทั้งหมด, จำนวนข้อความ/วัน (กราฟ 30 วัน) | OWNER |
| **การรับรู้ประกาศ** | ต่อโพสต์ ANNOUNCEMENT: อ่านแล้ว n/ทั้งหมด + รายชื่อยังไม่อ่าน (ไว้ตามงานเรื่องสำคัญ) | OWNER/MANAGER + ผู้โพสต์ |
| **RSVP summary** | ต่อนัด: มา/ไม่มา/ไม่แน่ใจ/ยังไม่ตอบ (การ์ดในห้อง — ไม่มีหน้ารายงานแยก) | สมาชิกห้อง |
| **ห้อง active** | ห้องเรียงตามข้อความ 7 วันล่าสุด + ห้องเงียบ >30 วัน (ชวน archive) | OWNER |
| **Storage** | พื้นที่ไฟล์แนบรวมของ Meeting (MB) — ประกอบ quota แผนฟรีระดับ tenant | OWNER |
| Export | 🔜 export transcript ห้องเป็นไฟล์ (ทำพร้อมเครื่องมือ compliance) | |

หน้า `/app/meeting/insights` (OWNER): การ์ด 4 ใบ (active users, ข้อความ/วัน, ประกาศล่าสุด+%อ่าน, ห้องเงียบ) — ไม่มี per-user message count ละเอียด (by design กัน micro-surveillance, ระบุใน spec เพื่อไม่ให้ dev เผลอทำ)

---

## 11. Edge Cases & Rules

1. **DM ซ้ำ** — 2 คนกดสร้าง DM หาคู่เดียวกันพร้อมกัน: `dmKey = sha256(sorted userIds)` + `@@unique([tenantId, dmKey])` → แพ้ constraint → fetch ห้องเดิมคืน (find-or-create idempotent)
2. **ส่งซ้ำ/สองแท็บ** — `@@unique([roomId, clientMessageId])` + SSE ทุกแท็บของ user เดียว sync read state ผ่าน event `read`
3. **ห้องใหญ่ + @all spam** — จำกัด @all ตาม §7.3; แตก mention เป็นแถวมี cost → cap สมาชิก GROUP_DM 20, CHANNEL ไม่ cap แต่ @all fan-out ทำใน background job ถ้า >200 สมาชิก
4. **ถูกถอด Membership ระหว่างเปิดจอ** — SSE hub ตัด connection ทันทีที่รับ event `membership.removed`; ทุก API ตรวจ Membership สด → 403; ข้อความเก่าคงอยู่ (ประวัติถาวร) ชื่อผู้ส่ง render จาก User ได้แม้พ้นสภาพ
5. **แก้ mention ย้อนหลัง** — แก้ข้อความแล้วเพิ่ม mention ใหม่ = แจ้งเตือนเฉพาะคนใหม่; ห้ามใช้แก้ไขเพื่อ "ดึงคนเข้าห้อง PRIVATE" (mention คนนอกห้อง = render ตัวหนังสือเฉย ๆ ไม่แจ้งเตือน ไม่เชิญ)
6. **นัดเวลาข้าม timezone** — เก็บ UTC เสมอ แสดงตาม `unit.settings.timezone`/tenant default (Asia/Bangkok); ฟอร์มนัดโชว์ timezone กำกับเมื่อ tenant มี unit ต่าง timezone
7. **ไฟล์แนบ** — whitelist MIME เดียวกับ Chat (§ Chat 11.9), จำกัดโควตารวม tenant (แผนฟรี 2GB — เกิน → 422 บอกให้ลบไฟล์เก่า/อัปเกรด); ลบข้อความ → ลบไฟล์จาก storage จริง (tombstone ไม่ถือไฟล์)
8. **ประวัติถาวร ≠ เก็บทุกอย่าง** — ยกเว้นเดียวที่ลบจริง: ไฟล์ของข้อความที่ถูก soft delete และ tenant ถูก terminate (นโยบายลบข้อมูลระดับแพลตฟอร์ม อยู่นอกโมดูลนี้)
9. **ห้ามปนกับ Chat** — ไม่มี FK/JOIN/import ข้าม `Meeting*` ↔ `Chat*`; SSE hub ใช้ infra ร่วมได้แต่ topic แยก (`t:{tenantId}:meeting:*` vs `t:{tenantId}:chat:*` — scheme กลาง D14); reviewer ต้อง reject PR ที่ฝ่าฝืน
10. **ห้อง default** — `#ทั่วไป`/`#ประกาศ` (`isDefault: true`): archive/เปลี่ยน type/ลบ ไม่ได้ (409), เปลี่ยนชื่อได้
11. **race: pin เกิน 50 / เชิญคนซ้ำ / join พร้อม archive** — pin นับใน transaction (SELECT count FOR UPDATE ระดับห้อง) → 409; เชิญซ้ำ → upsert เงียบ (ถ้า `leftAt` มีค่า → re-join ล้าง leftAt); join ห้องที่เพิ่ง archived → 422
12. **การค้นหาภาษาไทย** — v1 ใช้ trigram (`pg_trgm`) เพราะ tsvector 'simple' ตัดคำไทยไม่ได้ — ผลลัพธ์ = substring match ยาว ≥3 ตัวอักษร; ระบุ limitation นี้ใน release note, 🔜 dictionary ไทย (icu/thai tokenizer)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] สร้างห้องครบ 4 ประเภท; DM find-or-create ไม่เกิดห้องซ้ำ (ยิงพร้อมกัน 10 request → 1 ห้อง)
- [ ] ห้อง `autoJoinByUnit`: staff ได้/เสีย unitAccess → เข้า/หลุดห้องอัตโนมัติ, สมาชิก manual invite ไม่โดนถอน
- [ ] ANNOUNCEMENT: staff โพสต์ → 403; OWNER โพสต์ → ทุกสมาชิกได้ WEB notification + ตัวเลข "อ่านแล้ว n/ทั้งหมด" ถูกต้อง
- [ ] Mention: @user badge+อีเมล (offline, throttle 15 นาที), @all ในห้อง >20 คนโดย staff ธรรมดา → 403, mention คนนอกห้อง → ไม่แจ้งเตือน
- [ ] Pin ครบวงจร: pin/unpin/แผง pin/เกิน 50 → 409; แก้ข้อความ ≤24 ชม. เท่านั้น; ลบ → tombstone + ไฟล์หายจาก storage
- [ ] Kanban embed: การ์ดจริงแสดง snapshot ถูกต้อง + refresh ดึงสถานะใหม่; การ์ดไม่มีสิทธิ์/ลบแล้ว → fallback ไม่ leak ชื่องาน
- [ ] นัดประชุม: สร้าง/RSVP/แก้/ยกเลิก + เตือนก่อน 30 นาที ครั้งเดียว (รัน cron ซ้ำไม่ส่งซ้ำ) + "นัดของฉัน" รวมทุกห้อง
- [ ] Search: เจอเฉพาะห้องที่เป็นสมาชิก (สร้าง user 2 คนคนละห้องทดสอบไขว้), jump ไปข้อความพร้อม context, ค้นไทย ≥3 ตัวอักษรเจอ
- [ ] Read state: เส้น "ยังไม่ได้อ่าน" ถูกตำแหน่ง, "อ่านแล้ว n คน" ตรง, badge sidebar sync ทุกแท็บผ่าน SSE + fallback poll
- [ ] แก้ mention ย้อนหลัง → คนใหม่ได้แจ้งเตือน คนถูกถอนไม่ค้าง badge

**Isolation & Security**
- [ ] ทุก endpoint ด้วย id ของ tenant อื่น → 404/403 (รวม search, stream, upload, link-preview)
- [ ] Non-member เข้าห้อง PRIVATE: get/messages/search/SSE → มองไม่เห็นแม้รู้ id; OWNER ใช้ `meeting.admin` เข้าได้แต่เกิด AuditLog + system message
- [ ] ลูกค้า/guest (session storefront) เรียก API Meeting ทุกเส้น → 401/403
- [ ] ไม่มี import/FK/JOIN ระหว่าง `Meeting*` กับ `Chat*` (ตรวจ schema + grep module boundary)
- [ ] ถอด Membership → SSE หลุดทันที + ทุก API 403 ภายใน request ถัดไป
- [ ] AuditLog ครบทุกรายการใน §8.4

**i18n & UI**
- [ ] ทุก string TH/EN รวมอีเมล digest + system message + tombstone
- [ ] Mobile: drawer/bottom sheet/sticky composer ทำงานบนจอ ≤390px; desktop 2 คอลัมน์
- [ ] Empty/loading/error ครบ: room list ว่าง, ห้องว่าง, search ไม่เจอ, SSE reconnect banner
- [ ] B&W minimal: mention/badge/การ์ดนัด ใช้น้ำหนัก+เส้น ไม่พึ่งสี; ไม่มี jargon (ใช้คำว่า "ห้อง", "ประกาศ", "นัดประชุม")
