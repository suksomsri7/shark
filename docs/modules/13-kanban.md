# โมดูล 13: Kanban — บอร์ดงาน

> scope: **tenant** (บอร์ด link `unitId?` ได้ — optional) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> Phase ตาม roadmap: Phase 5 (Communication & Ops)
> สถานะเอกสาร: SPEC FINAL — พร้อม implement

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1)
เครื่องมือจัดการงานภายในองค์กร (คล้าย Trello) สำหรับทีมงานของร้าน:
- หลายบอร์ดต่อร้าน (tenant) — บอร์ดผูกกับ BusinessUnit ได้แบบ optional (เช่น บอร์ด "งานซ่อมบำรุง โรงแรม A") หรือเป็นบอร์ดกลางองค์กร (unitId = null)
- คอลัมน์ custom ต่อบอร์ด, การ์ดพร้อม assignee หลายคน / due date + เตือน / checklist / labels สี / ไฟล์แนบ / comments + mention
- Drag & drop จัดลำดับด้วย **fractional indexing** (ระบุ algorithm ชัดในข้อ 11) — ไม่พังเมื่อ concurrent
- มุมมอง: Board ✅ · List ✅ · My Tasks (รวมทุกบอร์ด) ✅ · Calendar 🔜
- Template บอร์ดสำเร็จรูป, archive การ์ด/บอร์ด, activity log ต่อการ์ด, รายงานงานค้าง/เลยกำหนด/ต่อคน

### ไม่ทำอะไร (v1)
- ❌ Gantt / dependency ระหว่างการ์ด / sub-card ซ้อนการ์ด
- ❌ Automation rules (ถ้าการ์ดเข้า column X ให้ทำ Y) — 🔜 Phase ถัดไป
- ❌ Time tracking / estimate points
- ❌ ให้ **Customer** (ระดับ 4) เห็นหรือแตะบอร์ด — Kanban เป็นเครื่องมือภายในเท่านั้น
- ❌ Recurring cards (การ์ดเกิดซ้ำทุกสัปดาห์) — 🔜
- ❌ Custom fields ต่อการ์ด — 🔜

### หลักการ scope ข้อมูล (ห้ามเถียง — ตามตาราง _CONVENTIONS ข้อ 1)
- ทุกตารางมี `tenantId`, unique = `@@unique([tenantId, ...])` หรือแคบกว่า (ระดับ board/card)
- `KanbanBoard.unitId` เป็น **metadata สำหรับกรอง/จัดกลุ่ม/สิทธิ์เสริม** เท่านั้น — ไม่ใช่ unit-scoped isolation, Prisma guard ฝั่ง unit ไม่บังคับกับโมดูลนี้
- URL อยู่โซน tenant-level: `/app/kanban/...` (ไม่มี `/u/`)

---

## 2. Persona & User Stories

| Persona | เกี่ยวข้องอย่างไร |
|---|---|
| **Owner** | เห็นทุกบอร์ดในร้าน, สร้าง/ลบ/archive บอร์ด, ดูรายงานภาระงานทีม |
| **Manager** (คุมบางหน่วย) | สร้างบอร์ดของหน่วยตัวเอง, มอบหมายงานทีมในหน่วย, ตาม due date |
| **Staff** | ทำงานบนบอร์ดที่ถูกเชิญ, ย้ายการ์ดของตัวเอง, ติ๊ก checklist, comment |
| **Customer** | ❌ ไม่เกี่ยว (ไม่มี storefront surface) |

User stories หลัก:
1. (Owner) ฉันเปิดสาขาใหม่ → สร้างบอร์ดจาก template "เปิดร้านสาขาใหม่" ได้การ์ดงานครบชุดใน 1 คลิก แล้วมอบหมายทีมทันที
2. (Manager โรงแรม A) ฉันมีบอร์ด "ซ่อมบำรุง" ผูกกับโรงแรม A — แม่บ้านรายงานแอร์เสียใน Meeting แล้วแปะลิงก์การ์ดให้ช่างตามงานได้
3. (Staff) เช้ามาเปิด **My Tasks** เห็นการ์ดทุกบอร์ดที่ assign ฉัน เรียงตาม due date — ไม่ต้องไล่เปิดทีละบอร์ด
4. (Staff) ฉันถูก mention ใน comment → ได้ notification ทั้งใน web และ email กดเข้าการ์ดนั้นตรงๆ
5. (Owner) สิ้นสัปดาห์ดูรายงาน: ใครงานค้างเยอะ, การ์ดไหนเลยกำหนด, บอร์ดไหนไม่ขยับ
6. (Manager) จัดอีเวนต์ → สร้างบอร์ดจาก template "จัดอีเวนต์" มี column เตรียมงาน/ระหว่างงาน/หลังงาน + checklist มาตรฐาน
7. (Staff มือถือ) หน้างานถือมือถือ — ลากการ์ดด้วยนิ้ว (long-press) หรือ swipe การ์ดเพื่อ done/archive เร็วๆ ได้

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 บอร์ด (Board)
- ✅ หลายบอร์ดต่อ tenant (soft limit ช่วงฟรี: 20 บอร์ด ACTIVE/tenant — config ที่ `Tenant.limits.kanbanBoards`)
- ✅ ผูก `unitId?` optional ตอนสร้าง/แก้ไข — แสดง badge ชื่อหน่วยบนการ์ดบอร์ด, ใช้กรองในหน้า list
- ✅ Visibility 2 แบบ: `PRIVATE` (เฉพาะสมาชิกบอร์ด) / `TENANT` (ทุกคนในร้านที่มีสิทธิ์โมดูล kanban เห็นแบบ view ได้)
- ✅ สมาชิกบอร์ด + สิทธิ์ 3 ระดับ: `VIEWER` (ดูอย่างเดียว) / `EDITOR` (สร้าง-แก้-ย้ายการ์ด, comment) / `ADMIN` (จัดการคอลัมน์/สมาชิก/label/ตั้งค่า/archive บอร์ด)
- ✅ Owner ของ tenant = implicit ADMIN ทุกบอร์ด (bypass — ดูข้อ 9)
- ✅ Archive บอร์ด (read-only ทั้งบอร์ด, ซ่อนจาก list หลัก, กู้คืนได้) — ไม่มี hard delete
- ✅ เปลี่ยนชื่อ/คำอธิบาย/สี accent ของบอร์ด (สีจากชุด label palette เดียวกัน — B&W minimal ใช้เป็นแถบเล็กเท่านั้น)
- 🔜 Duplicate บอร์ด (โครง column+label โดยไม่ก๊อปการ์ด)
- 🔜 บอร์ด favorite/pin ต่อ user

### 3.2 คอลัมน์ (Column)
- ✅ Custom column ต่อบอร์ด: เพิ่ม/เปลี่ยนชื่อ/ลบ(archive)/จัดลำดับซ้าย-ขวา (fractional indexing เดียวกับการ์ด)
- ✅ Flag `isDoneColumn` (ติ๊กได้หลาย column) — การ์ดที่อยู่ column นี้นับเป็น "เสร็จ" ใน My Tasks และรายงาน, set `completedAt` อัตโนมัติ
- ✅ Soft limit: 20 columns/บอร์ด
- 🔜 **WIP limit** ต่อ column (`wipLimit Int?`): เกิน limit → block การย้ายเข้า + toast บอกเหตุผล, ADMIN override ได้ (บันทึก activity)
- 🔜 Collapse column (พับเก็บ ฝั่ง UI per-user)

### 3.3 การ์ด (Card)
- ✅ `title` (บังคับ, ≤ 300 ตัวอักษร)
- ✅ `description` rich text พื้นฐาน: **bold / italic / strikethrough / bullet & numbered list / link / heading 1 ระดับ / code inline** — เก็บเป็น Tiptap/ProseMirror JSON ใน `description Json?`, sanitize ด้วย node-type allowlist ฝั่ง server (ข้อ 11.6)
- ✅ Assignees หลายคน (user ที่เป็น Membership ของ tenant) — assign แล้ว notify
- ✅ Due date (`dueAt` DateTime UTC) + เตือนล่วงหน้า (`reminderMinutesBefore`: none/0/60/1440/2880 นาที) ผ่าน notify contract 2.5 — cron กวาดทุก 5 นาที (ข้อ 7.4)
- ✅ Checklist แบบ flat ต่อการ์ด: เพิ่ม/ติ๊ก/แก้/ลบ/จัดลำดับ item, แสดง progress `3/7` บนหน้าการ์ด (soft limit 50 items/card)
- ✅ Labels สี: label เป็นของ **บอร์ด** (name + color จาก palette 10 สีคงที่), การ์ดติดได้หลาย label
- ✅ แนบไฟล์/รูป: อัปเข้า object storage (Bunny/S3) — จำกัด 20MB/ไฟล์, 20 ไฟล์/การ์ด, mime allowlist (image/*, pdf, office docs, zip, csv, txt), รูปแสดง thumbnail ใน card detail
- ✅ Comments + **mention** (`@ชื่อ`): เก็บ mention เป็น token `@[userId]` ใน body, mention → notify 2.5 (ข้อ 8.1), แก้/ลบ comment ตัวเองได้ (soft delete, โชว์ "ความคิดเห็นถูกลบ")
- ✅ เลขการ์ดอ้างอิงต่อบอร์ด `cardNo` (running per board: `#1, #2, ...`) — ใช้อ้างในแชท/ลิงก์
- ✅ Archive การ์ด (หายจาก board/list/my tasks, ค้นเจอใน archive ของบอร์ด, กู้คืนได้)
- 🔜 Cover image (เลือก attachment รูปเป็นหน้าปกการ์ด)
- 🔜 Watchers (ติดตามการ์ดโดยไม่ถูก assign — ได้ notification ทุกความเคลื่อนไหว)
- 🔜 Copy การ์ด / ย้ายการ์ดข้ามบอร์ด

### 3.4 Drag & Drop + Ordering
- ✅ ลากการ์ดจัดลำดับใน column เดียวกัน และย้ายข้าม column
- ✅ ลากจัดลำดับ column
- ✅ **Fractional indexing** (สเปคเต็มข้อ 11.1): client ส่ง `beforeCardId/afterCardId` — server generate position key เอง, กัน concurrent ด้วย tie-break + retry, มี rebalance job
- ✅ Optimistic UI + rollback เมื่อ server ปฏิเสธ (เช่น WIP limit 🔜, สิทธิ์ไม่พอ, column ถูก archive ไปแล้ว)
- ✅ Realtime sync ผ่าน SSE ต่อบอร์ด: คนอื่นย้ายการ์ด → บอร์ดเราอัปเดตโดยไม่ refresh

### 3.5 Activity Log
- ✅ ต่อการ์ด: created / moved (from→to column) / title-desc changed / assignee ±, due date set/changed/removed, label ±, checklist add/done, attachment ±, comment added, archived/unarchived — เก็บ actor + timestamp + diff ย่อใน `data Json`
- ✅ ต่อบอร์ด (board-level): board created/renamed/archived, column ±/renamed/moved, member ±/role changed
- ✅ แสดงใน card detail (tab กิจกรรม, ล่าสุดก่อน, paginate 30 รายการ) — activity เป็น append-only ห้ามแก้/ลบ
- 🔜 Board activity feed รวม (sidebar ของบอร์ด)

### 3.6 Filter / Search
- ✅ ใน board + list view กรองแบบผสม (AND): assignee (หลายคน, รวม "ไม่มีผู้รับผิดชอบ"), label (หลาย, OR ภายใน label), due (เลยกำหนด / วันนี้ / 7 วัน / ไม่มี due), keyword ใน title + cardNo
- ✅ Filter state อยู่ใน URL query (`?assignee=..&label=..&due=overdue&q=..`) — แชร์ลิงก์ได้
- ✅ ค้นหาการ์ดข้ามบอร์ด (ในหน้า /app/kanban ช่อง search: title + cardNo, เฉพาะบอร์ดที่มีสิทธิ์เห็น)
- 🔜 Full-text search ใน description/comments (Postgres `tsvector`)

### 3.7 มุมมอง (Views)
- ✅ **Board** — คอลัมน์แนวนอน (default)
- ✅ **List** — ตารางแบน: title, column, assignees, labels, due, checklist progress · sort ได้ (due/created/column)
- ✅ **My Tasks** — รวมการ์ดที่ assign ฉันจาก**ทุกบอร์ด**ที่ฉันเข้าถึง, จัดกลุ่ม: เลยกำหนด / วันนี้ / สัปดาห์นี้ / ถัดไป / ไม่มีกำหนด, ซ่อนการ์ดใน done column, ติ๊ก checklist + เปิด card detail ได้จากหน้านี้
- 🔜 **Calendar** — การ์ดที่มี due วางบนปฏิทินเดือน/สัปดาห์, ลากเปลี่ยนวัน = เปลี่ยน dueAt
- View ที่เลือกจำต่อ user ต่อบอร์ด (localStorage + `?view=` ใน URL)

### 3.8 Templates
- ✅ System templates (seed มากับแพลตฟอร์ม, ทุก tenant เห็น): อย่างน้อย 4 ชุด —
  1. **"เปิดร้านสาขาใหม่"** (columns: เตรียมการ/กำลังทำ/รอตรวจ/เสร็จ + การ์ดตัวอย่าง: หาทำเล, จดทะเบียน, ตกแต่งร้าน, จ้างทีม, ตั้งค่าระบบ SHARK, ซ้อมเปิดร้าน — พร้อม checklist ในแต่ละการ์ด)
  2. **"จัดอีเวนต์"** (เตรียมงาน/ระหว่างงาน/หลังงาน + การ์ด: จองสถานที่, ทำตั๋ว, โปรโมท, สรุปยอด)
  3. **"งานประจำสัปดาห์"** (To do/Doing/Done)
  4. **"ซ่อมบำรุง"** (แจ้งเข้า/กำลังซ่อม/รออะไหล่/เสร็จ — เหมาะผูก unit โรงแรม/ร้าน)
- ✅ โครง template = `structure Json` (columns + cards + checklist + labels) — instantiate เป็นข้อมูลจริงตอนสร้างบอร์ด, การ์ดจาก template ไม่มี assignee/due (ให้ทีมเติมเอง)
- 🔜 Tenant template: "บันทึกบอร์ดนี้เป็น template ของร้าน"

### 3.9 การเชื่อมระบบอื่น
- ✅ Mention/assign/due-reminder → **notify contract 2.5** (WEB เสมอ + EMAIL)
- ✅ **Link การ์ดใน Meeting chat**: วางลิงก์การ์ด (`/app/kanban/[boardId]?card=[cardId]` หรือพิมพ์ `#cardNo`) → Meeting เรียก internal contract `kanban.getCardSummary()` แสดง card chip (title, สถานะ column, due, assignees) — ผู้ที่ไม่มีสิทธิ์เห็นบอร์ดจะเห็นแค่ "การ์ดใน Kanban (ไม่มีสิทธิ์เข้าถึง)" (ข้อ 8.2)
- 🔜 **สร้างการ์ดจากเคสแชทลูกค้า** (โมดูล 10 Chat): ปุ่ม "สร้างงาน" ในหน้าสนทนา → การ์ดพร้อม link กลับไป conversation (`sourceType: 'CHAT'`, `sourceId`) (ข้อ 8.3)
- 🔜 สร้างการ์ดจาก Support case ของ backoffice ที่ forward มาให้ร้าน

### 3.10 มือถือ (mobile-first)
- ✅ Board view: เลื่อนดู column แนวนอนแบบ snap ทีละ column, **long-press 300ms เพื่อยกการ์ด** แล้วลาก — ลากถึงขอบจอซ้าย/ขวา auto-scroll ไป column ถัดไป, haptic ตอนยก/วาง (ที่ browser รองรับ)
- ✅ **Swipe actions** บนการ์ด (board + list + my tasks): ปัดขวา = ย้ายเข้า done column แรกของบอร์ด (ถ้าไม่มี done column → ปุ่ม disabled), ปัดซ้าย = archive — ทั้งคู่มี undo toast 5 วินาที
- ✅ Card detail เป็น bottom sheet เต็มจอ, filter เป็น bottom sheet
- ✅ แนบรูปจากกล้อง/แกลเลอรีมือถือได้ตรง

### 3.11 รายงาน (สรุป — รายละเอียดข้อ 10)
- ✅ งานค้าง / เลยกำหนด / ภาระงานต่อคน / throughput ต่อสัปดาห์

---

## 4. Data Model (Prisma)

> ทุก model มี `tenantId` (tenant-scoped) — Prisma extension inject `where: { tenantId }` อัตโนมัติ · เงินไม่เกี่ยวกับโมดูลนี้ · id = cuid()

```prisma
// ───────────────────────── Enums ─────────────────────────

enum KanbanBoardVisibility {
  PRIVATE   // เฉพาะสมาชิกบอร์ด
  TENANT    // ทุกคนในร้านที่มีสิทธิ์โมดูล kanban เห็นแบบ VIEWER
}

enum KanbanBoardRole {
  VIEWER
  EDITOR
  ADMIN
}

enum KanbanEntityStatus {
  ACTIVE
  ARCHIVED
}

enum KanbanLabelColor {
  GRAY
  RED
  ORANGE
  YELLOW
  GREEN
  TEAL
  BLUE
  PURPLE
  PINK
  BROWN
}

enum KanbanCardSourceType {
  MANUAL     // สร้างมือ
  TEMPLATE   // มาจาก template ตอนสร้างบอร์ด
  CHAT       // 🔜 จากเคสแชทลูกค้า (โมดูล 10)
}

enum KanbanActivityType {
  BOARD_CREATED
  BOARD_UPDATED        // rename / description / unitId / visibility
  BOARD_ARCHIVED
  BOARD_UNARCHIVED
  MEMBER_ADDED
  MEMBER_ROLE_CHANGED
  MEMBER_REMOVED
  COLUMN_CREATED
  COLUMN_UPDATED       // rename / wipLimit / isDoneColumn
  COLUMN_MOVED
  COLUMN_ARCHIVED
  CARD_CREATED
  CARD_UPDATED         // title / description
  CARD_MOVED           // data: { fromColumnId, toColumnId }
  CARD_ASSIGNED
  CARD_UNASSIGNED
  CARD_DUE_SET         // data: { dueAt, reminderMinutesBefore }
  CARD_DUE_REMOVED
  CARD_LABEL_ADDED
  CARD_LABEL_REMOVED
  CHECKLIST_ITEM_ADDED
  CHECKLIST_ITEM_DONE
  CHECKLIST_ITEM_UNDONE
  CHECKLIST_ITEM_REMOVED
  ATTACHMENT_ADDED
  ATTACHMENT_REMOVED
  COMMENT_ADDED
  CARD_ARCHIVED
  CARD_UNARCHIVED
}

enum KanbanTemplateScope {
  SYSTEM   // seed กลาง ทุก tenant เห็น (tenantId = null)
  TENANT   // 🔜 template ของร้าน
}

// ───────────────────────── Board ─────────────────────────

model KanbanBoard {
  id          String                @id @default(cuid())
  tenantId    String
  tenant      Tenant                @relation(fields: [tenantId], references: [id])
  unitId      String?               // optional link ไป BusinessUnit (metadata ไม่ใช่ isolation)
  unit        BusinessUnit?         @relation(fields: [unitId], references: [id])
  name        String                // ≤ 120 ตัวอักษร
  description String?               // plain text ≤ 500
  color       KanbanLabelColor      @default(GRAY)   // แถบ accent เล็กบน board card
  visibility  KanbanBoardVisibility @default(PRIVATE)
  status      KanbanEntityStatus    @default(ACTIVE)
  archivedAt  DateTime?
  cardNoSeq   Int                   @default(0)      // running counter ของ cardNo (เพิ่มใน transaction)
  createdById String                // User.id
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  members     KanbanBoardMember[]
  columns     KanbanColumn[]
  cards       KanbanCard[]
  labels      KanbanLabel[]
  activities  KanbanActivity[]

  @@index([tenantId, status])
  @@index([tenantId, unitId])
}

model KanbanBoardMember {
  id        String          @id @default(cuid())
  tenantId  String
  boardId   String
  board     KanbanBoard     @relation(fields: [boardId], references: [id])
  userId    String          // ต้องเป็น Membership ของ tenant นี้ (ตรวจใน service)
  role      KanbanBoardRole @default(EDITOR)
  addedById String
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([boardId, userId])
  @@index([tenantId, userId])   // สำหรับ "บอร์ดของฉัน" + My Tasks
}

// ───────────────────────── Column ─────────────────────────

model KanbanColumn {
  id           String             @id @default(cuid())
  tenantId     String
  boardId      String
  board        KanbanBoard        @relation(fields: [boardId], references: [id])
  name         String             // ≤ 60 ตัวอักษร
  position     String             // fractional index key (base62) — ดูข้อ 11.1
  isDoneColumn Boolean            @default(false)
  wipLimit     Int?               // 🔜 null = ไม่จำกัด
  status       KanbanEntityStatus @default(ACTIVE)
  archivedAt   DateTime?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  cards KanbanCard[]

  @@index([boardId, status, position])
}

// ───────────────────────── Card ─────────────────────────

model KanbanCard {
  id                    String                @id @default(cuid())
  tenantId              String
  boardId               String
  board                 KanbanBoard           @relation(fields: [boardId], references: [id])
  columnId              String
  column                KanbanColumn          @relation(fields: [columnId], references: [id])
  cardNo                Int                   // running ต่อบอร์ด — "#42"
  title                 String                // ≤ 300 ตัวอักษร
  description           Json?                 // Tiptap JSON (sanitize allowlist — ข้อ 11.6)
  position              String                // fractional index ภายใน column
  dueAt                 DateTime?             // UTC
  reminderMinutesBefore Int?                  // null = ไม่เตือน · 0/60/1440/2880
  reminderSentAt        DateTime?             // กันเตือนซ้ำ — reset เป็น null เมื่อ dueAt/reminder เปลี่ยน
  completedAt           DateTime?             // set เมื่อย้ายเข้า isDoneColumn, clear เมื่อย้ายออก
  sourceType            KanbanCardSourceType  @default(MANUAL)
  sourceId              String?               // เช่น chatConversationId (🔜)
  status                KanbanEntityStatus    @default(ACTIVE)
  archivedAt            DateTime?
  archivedById          String?
  createdById           String
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  assignees      KanbanCardAssignee[]
  labels         KanbanCardLabel[]
  checklistItems KanbanChecklistItem[]
  attachments    KanbanAttachment[]
  comments       KanbanComment[]
  activities     KanbanActivity[]

  @@unique([boardId, cardNo])
  @@index([columnId, status, position])   // โหลด board view
  @@index([boardId, status])
  @@index([tenantId, status, dueAt])      // cron เตือน + รายงาน overdue
}

model KanbanCardAssignee {
  id           String     @id @default(cuid())
  tenantId     String
  cardId       String
  card         KanbanCard @relation(fields: [cardId], references: [id])
  userId       String
  assignedById String
  createdAt    DateTime   @default(now())

  @@unique([cardId, userId])
  @@index([tenantId, userId])   // My Tasks + รายงานต่อคน
}

// ───────────────────────── Label ─────────────────────────

model KanbanLabel {
  id        String           @id @default(cuid())
  tenantId  String
  boardId   String
  board     KanbanBoard      @relation(fields: [boardId], references: [id])
  name      String           // ≤ 40 ตัวอักษร
  color     KanbanLabelColor
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  cards KanbanCardLabel[]

  @@unique([boardId, name])
  @@index([tenantId])
}

model KanbanCardLabel {
  id       String      @id @default(cuid())
  tenantId String
  cardId   String
  card     KanbanCard  @relation(fields: [cardId], references: [id])
  labelId  String
  label    KanbanLabel @relation(fields: [labelId], references: [id])

  @@unique([cardId, labelId])
  @@index([labelId])   // ลบ label → กวาด join rows
}

// ───────────────────────── Checklist ─────────────────────────

model KanbanChecklistItem {
  id        String     @id @default(cuid())
  tenantId  String
  cardId    String
  card      KanbanCard @relation(fields: [cardId], references: [id])
  title     String     // ≤ 300 ตัวอักษร
  position  String     // fractional index ภายในการ์ด
  isDone    Boolean    @default(false)
  doneById  String?
  doneAt    DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([cardId, position])
}

// ───────────────────────── Attachment ─────────────────────────

model KanbanAttachment {
  id           String     @id @default(cuid())
  tenantId     String
  cardId       String
  card         KanbanCard @relation(fields: [cardId], references: [id])
  fileName     String     // ชื่อเดิมของไฟล์ (sanitize path traversal)
  fileKey      String     // key ใน object storage: kanban/{tenantId}/{cardId}/{cuid}.{ext}
  mimeType     String
  sizeBytes    Int
  width        Int?       // เฉพาะรูป — ทำ thumbnail
  height       Int?
  uploadedById String
  createdAt    DateTime   @default(now())

  @@index([cardId])
  @@index([tenantId])   // คิด storage usage ต่อร้าน
}

// ───────────────────────── Comment ─────────────────────────

model KanbanComment {
  id        String     @id @default(cuid())
  tenantId  String
  cardId    String
  card      KanbanCard @relation(fields: [cardId], references: [id])
  authorId  String
  body      String     // plain text ≤ 5000 + mention token "@[userId]"
  mentions  Json       @default("[]")   // ["userId1","userId2"] — denormalize เพื่อ query/notify
  editedAt  DateTime?
  deletedAt DateTime?  // soft delete — โชว์ "ความคิดเห็นถูกลบ"
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([cardId, createdAt])
}

// ───────────────────────── Activity (append-only) ─────────────────────────

model KanbanActivity {
  id        String             @id @default(cuid())
  tenantId  String
  boardId   String
  board     KanbanBoard        @relation(fields: [boardId], references: [id])
  cardId    String?            // null = board-level event
  card      KanbanCard?        @relation(fields: [cardId], references: [id])
  actorId   String             // User.id (system action เช่น cron → "system")
  type      KanbanActivityType
  data      Json               @default("{}")   // diff ย่อ เช่น { fromColumnId, toColumnId } / { field, old, new }
  createdAt DateTime           @default(now())

  @@index([cardId, createdAt(sort: Desc)])
  @@index([boardId, createdAt(sort: Desc)])
}

// ───────────────────────── Template ─────────────────────────

model KanbanBoardTemplate {
  id          String              @id @default(cuid())
  scope       KanbanTemplateScope @default(SYSTEM)
  tenantId    String?             // null = SYSTEM template
  name        String              // "เปิดร้านสาขาใหม่"
  nameEn      String              // i18n ชื่อ template
  description String?
  icon        String?             // ชื่อ icon (lucide)
  structure   Json                // { columns: [{name, isDoneColumn, cards: [{title, description?, checklist: [..], labelRefs: [..]}]}], labels: [{name, color}] }
  sortOrder   Int                 @default(0)
  isActive    Boolean             @default(true)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@index([scope, isActive])
  @@index([tenantId])
}
```

> หมายเหตุ: `KanbanBoardTemplate` scope SYSTEM เป็นตาราง platform-level (tenantId null) — เป็น**ข้อยกเว้น**ของ Prisma tenant-inject เหมือน `Tenant`/`PlatformUser` ต้อง whitelist ใน extension · การอ้าง `userId` ทุกจุดตรวจใน service ว่าเป็น Membership ของ tenant (ไม่ทำ FK ไป User ตรงเพื่อกัน cross-tenant join ผิดชั้น — ตามแนวเดียวกับโมดูลอื่น)

---

## 5. API Endpoints

> ทุก endpoint อยู่หลัง auth + tenant resolver + `can(user, { tenantId, module: 'KANBAN', action })` + board-level role check (ข้อ 9)
> สิทธิ์ในตาราง: **V** = board VIEWER ขึ้นไป, **E** = EDITOR ขึ้นไป, **A** = board ADMIN ขึ้นไป (OWNER ของ tenant = A เสมอ)

### 5.1 Boards

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 1 | `GET /api/kanban/boards` | list บอร์ดที่ฉันเห็น (member หรือ visibility TENANT) | `?status=&unitId=&q=` | มีสิทธิ์โมดูล |
| 2 | `POST /api/kanban/boards` | สร้างบอร์ด (เปล่า/จาก template) | `{ name, description?, unitId?, visibility, color?, templateId? }` | `kanban.board.create` |
| 3 | `GET /api/kanban/boards/:boardId` | โหลดบอร์ดเต็ม: columns + cards (summary: title, cardNo, position, labels, assignees, due, checklist progress, attachment count, comment count) | `?includeArchived=false` | V |
| 4 | `PATCH /api/kanban/boards/:boardId` | แก้ name/description/unitId/visibility/color | field ที่เปลี่ยน | A |
| 5 | `POST /api/kanban/boards/:boardId/archive` | archive บอร์ด | — | A |
| 6 | `POST /api/kanban/boards/:boardId/unarchive` | กู้คืน (ตรวจ soft limit ก่อน) | — | A |
| 7 | `GET /api/kanban/boards/:boardId/members` | list สมาชิก + role | — | V |
| 8 | `POST /api/kanban/boards/:boardId/members` | เพิ่มสมาชิก (ทีละหลายคน) | `{ userIds: [], role }` | A |
| 9 | `PATCH /api/kanban/boards/:boardId/members/:userId` | เปลี่ยน role | `{ role }` | A |
| 10 | `DELETE /api/kanban/boards/:boardId/members/:userId` | เอาออกจากบอร์ด (ไม่ auto-unassign — ข้อ 11.4) | — | A (หรือตัวเองออกเอง) |
| 11 | `GET /api/kanban/boards/:boardId/events` | **SSE** stream realtime ของบอร์ด | — | V |
| 12 | `GET /api/kanban/boards/:boardId/activity` | board-level activity feed 🔜 | `?cursor=` | V |

### 5.2 Columns

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 13 | `POST /api/kanban/boards/:boardId/columns` | เพิ่ม column (ต่อท้าย) | `{ name, isDoneColumn? }` | A |
| 14 | `PATCH /api/kanban/columns/:columnId` | rename / isDoneColumn / wipLimit 🔜 | field ที่เปลี่ยน | A |
| 15 | `POST /api/kanban/columns/:columnId/move` | จัดลำดับ column | `{ beforeColumnId?, afterColumnId? }` | A |
| 16 | `POST /api/kanban/columns/:columnId/archive` | archive column — **ต้องว่าง** (ให้ย้าย/archive การ์ดก่อน — ข้อ 11.3) | — | A |

### 5.3 Cards

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 17 | `POST /api/kanban/columns/:columnId/cards` | สร้างการ์ด (ต่อท้าย column) | `{ title, description?, assigneeUserIds?, labelIds?, dueAt?, reminderMinutesBefore? }` | E |
| 18 | `GET /api/kanban/cards/:cardId` | card detail เต็ม (checklist, attachments, comments page แรก, activity page แรก) | — | V |
| 19 | `PATCH /api/kanban/cards/:cardId` | แก้ title/description/dueAt/reminder | field ที่เปลี่ยน | E |
| 20 | `POST /api/kanban/cards/:cardId/move` | ย้าย/จัดลำดับ (ใน/ข้าม column) — core DnD | `{ toColumnId, beforeCardId?, afterCardId? }` | E |
| 21 | `POST /api/kanban/cards/:cardId/archive` | archive การ์ด | — | E |
| 22 | `POST /api/kanban/cards/:cardId/unarchive` | กู้คืน (ถ้า column เดิม archived → ลง column แรก) | — | E |
| 23 | `POST /api/kanban/cards/:cardId/assignees` | เพิ่ม assignee → notify | `{ userId }` | E |
| 24 | `DELETE /api/kanban/cards/:cardId/assignees/:userId` | ถอด assignee | — | E |
| 25 | `POST /api/kanban/cards/:cardId/labels` | ติด label | `{ labelId }` | E |
| 26 | `DELETE /api/kanban/cards/:cardId/labels/:labelId` | ปลด label | — | E |
| 27 | `GET /api/kanban/boards/:boardId/cards` | list/ค้นในบอร์ด (list view + filter) | `?assignee=&label=&due=&q=&archived=&sort=&cursor=` | V |
| 28 | `GET /api/kanban/cards/:cardId/activity` | activity ของการ์ด (paginate) | `?cursor=` | V |
| 29 | `GET /api/kanban/cards/:cardId/summary` | **internal contract** สำหรับ Meeting chip (ข้อ 8.2) | — | ตรวจสิทธิ์ผู้เรียกเป็นรายคน |

### 5.4 Checklist / Attachments / Comments

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 30 | `POST /api/kanban/cards/:cardId/checklist` | เพิ่ม item | `{ title }` | E |
| 31 | `PATCH /api/kanban/checklist/:itemId` | แก้ title / toggle isDone | `{ title?, isDone? }` | E |
| 32 | `POST /api/kanban/checklist/:itemId/move` | จัดลำดับ item | `{ beforeItemId?, afterItemId? }` | E |
| 33 | `DELETE /api/kanban/checklist/:itemId` | ลบ item (hard delete ได้ — ไม่ใช่ธุรกรรม) | — | E |
| 34 | `POST /api/kanban/cards/:cardId/attachments` | อัปไฟล์ (multipart, ≤20MB, mime allowlist) | file | E |
| 35 | `DELETE /api/kanban/attachments/:attachmentId` | ลบไฟล์ (soft: ลบ record + ลบ object แบบ async) | — | E (ผู้อัป) / A (ทุกไฟล์) |
| 36 | `GET /api/kanban/cards/:cardId/comments` | list comments (paginate เก่า→ใหม่) | `?cursor=` | V |
| 37 | `POST /api/kanban/cards/:cardId/comments` | comment + mentions → notify | `{ body, mentions: [] }` | E |
| 38 | `PATCH /api/kanban/comments/:commentId` | แก้ (เจ้าของเท่านั้น, set editedAt) | `{ body, mentions }` | เจ้าของ |
| 39 | `DELETE /api/kanban/comments/:commentId` | soft delete | — | เจ้าของ / A |

### 5.5 Labels / Templates / Views / Reports

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 40 | `GET /api/kanban/boards/:boardId/labels` | list labels ของบอร์ด | — | V |
| 41 | `POST /api/kanban/boards/:boardId/labels` | สร้าง label | `{ name, color }` | A |
| 42 | `PATCH /api/kanban/labels/:labelId` | แก้ name/color | field | A |
| 43 | `DELETE /api/kanban/labels/:labelId` | ลบ label (ปลดจากทุกการ์ด + activity) | — | A |
| 44 | `GET /api/kanban/templates` | list templates (SYSTEM + TENANT 🔜) | — | มีสิทธิ์โมดูล |
| 45 | `GET /api/kanban/my-tasks` | การ์ดที่ assign ฉัน ทุกบอร์ด จัดกลุ่มตาม due | `?includeDone=false` | มีสิทธิ์โมดูล |
| 46 | `GET /api/kanban/search` | ค้นการ์ดข้ามบอร์ด (title + cardNo) | `?q=` | มีสิทธิ์โมดูล |
| 47 | `GET /api/kanban/reports/summary` | รายงาน (ข้อ 10) | `?boardId?=&unitId?=&range=` | `kanban.report.view` |
| 48 | `POST /api/kanban/cards/from-chat` 🔜 | สร้างการ์ดจากเคสแชท (เรียกจากโมดูล 10) | `{ boardId, columnId, conversationId, title, description? }` | E |

กติการ่วมของ API:
- Mutation ทุกตัว: rate limit 60 req/นาที/user (upload 10/นาที), คืน error shape เดียวกัน `{ error: { code, message } }` — code สำคัญ: `BOARD_ARCHIVED`, `COLUMN_ARCHIVED`, `CARD_ARCHIVED`, `WIP_LIMIT_EXCEEDED` 🔜, `POSITION_CONFLICT_RETRY`, `LIMIT_REACHED`, `FORBIDDEN`
- Mutation บนบอร์ด/การ์ดที่ `ARCHIVED` → 409 `BOARD_ARCHIVED`/`CARD_ARCHIVED` (ยกเว้น unarchive)
- ทุก mutation broadcast event เข้า SSE ของบอร์ด: `{ type, boardId, cardId?, actorId, payload }` — client ที่เป็นคน action เอง ignore ด้วย `actorClientId`

---

## 6. UI Screens

> ทั้งหมดอยู่โซน tenant-level ใน sidebar (📋 Kanban) — i18n TH/EN, B&W minimal, empty/loading/error state ครบทุกหน้า · ไม่มี storefront surface

### 6.1 `/app/kanban` — หน้ารวมบอร์ด
- Grid การ์ดบอร์ด: ชื่อ + แถบสี + badge หน่วย (ถ้า link unit) + จำนวนการ์ดค้าง + สมาชิก (avatar stack) + updated ล่าสุด
- Tab: **บอร์ดของฉัน** (เป็น member) / **ทั้งหมด** (รวม visibility TENANT) / **Archived**
- Filter ตามหน่วย (dropdown BusinessUnit), ช่องค้นหาการ์ดข้ามบอร์ด (endpoint 46 — ผลลัพธ์ dropdown กดเข้า card detail ตรง)
- ปุ่ม "+ สร้างบอร์ด" → modal 2 step: (1) เลือก "บอร์ดเปล่า" หรือ template (การ์ด preview โครง columns) (2) ชื่อ + หน่วย (optional) + visibility
- Empty state: ภาพ + "ยังไม่มีบอร์ด — เริ่มจาก template" + ปุ่ม template ยอดนิยม
- มือถือ: grid → list 1 คอลัมน์

### 6.2 `/app/kanban/[boardId]` — Board view (หน้าหลัก)
- Header: ชื่อบอร์ด (คลิกแก้ inline ถ้า ADMIN) · badge หน่วย · avatar สมาชิก + ปุ่มเชิญ · view switcher (Board/List/Calendar 🔜) · ปุ่ม filter · เมนู ⋯ (ตั้งค่าบอร์ด, labels, archived cards, archive board)
- คอลัมน์แนวนอน scroll ได้, แต่ละ column: ชื่อ + จำนวนการ์ด (+ `4/5` เมื่อมี WIP limit 🔜 — เกินแล้วเลขแดง), ปุ่ม + เพิ่มการ์ดเร็ว (พิมพ์ title แล้ว Enter ต่อเนื่อง), เมนู column (rename, done flag, WIP 🔜, archive)
- การ์ด: title + cardNo จาง ๆ + แถว label (จุดสี/แถบ) + avatar assignees + due chip (เขียว=ไกล, เหลือง=ภายใน 24 ชม., แดง=เลยกำหนด) + icon 📎/💬/☑︎ 3/7
- DnD: mouse = ลากตรง, touch = long-press ยก (ข้อ 3.10) — placeholder เส้นประ + auto-scroll ขอบจอ
- Filter bar (เมื่อ active): chip เงื่อนไข + ปุ่มล้าง — state ใน URL query
- SSE: การ์ดที่คนอื่นขยับ animate เข้าไปตำแหน่งใหม่ + highlight 1 วินาที
- `?card=[cardId]` เปิด card detail ทับ (deep link จาก notification/Meeting)

### 6.3 Card Detail (modal desktop / bottom sheet mobile — ไม่ใช่หน้าแยก)
- แถวบน: cardNo + ชื่อบอร์ด/column (dropdown ย้าย column ได้ตรงนี้) + ปุ่ม archive + ปิด
- Title (แก้ inline), description rich text editor (toolbar minimal: B/I/S, list, link) — autosave debounce 800ms + สถานะ "บันทึกแล้ว"
- Sidebar ขวา (desktop) / section (mobile): assignees (picker ค้นชื่อทีม), due date + เวลา + dropdown เตือน (ไม่เตือน/ตรงเวลา/1 ชม./1 วัน/2 วัน), labels (toggle + จัดการ label ถ้า ADMIN)
- Checklist: progress bar + รายการ (ติ๊ก, ลากเรียง, แก้ inline, ลบ) + ช่องเพิ่ม
- Attachments: grid thumbnail (รูป) + แถวไฟล์ (icon + ชื่อ + ขนาด) + ปุ่มอัป/ถ่ายรูป (mobile) — คลิกรูป = lightbox
- Comments: list เก่า→ใหม่ + composer รองรับ `@` autocomplete (ค้นสมาชิก tenant) — Enter ส่ง, Shift+Enter ขึ้นบรรทัด
- Tab "กิจกรรม": activity ล่าสุดก่อน, paginate
- VIEWER เห็นทุกอย่างแบบ read-only (composer ซ่อน)

### 6.4 `/app/kanban/[boardId]?view=list` — List view
- ตาราง: ☐ (🔜 bulk) · title+labels · column (dropdown เปลี่ยนได้=move) · assignees · due · ☑︎ progress · updated
- Sort: due / created / column · filter ชุดเดียวกับ board view · คลิกแถว = card detail
- มือถือ: แถวย่อเป็น 2 บรรทัด + swipe actions (ข้อ 3.10)

### 6.5 `/app/kanban/my-tasks` — My Tasks (รวมทุกบอร์ด)
- จัดกลุ่ม: 🔴 เลยกำหนด / วันนี้ / สัปดาห์นี้ / ถัดไป / ไม่มีกำหนด — แต่ละแถวโชว์ชื่อบอร์ด (+หน่วย) กำกับ
- Toggle "แสดงงานที่เสร็จแล้ว" (การ์ดใน done column, default ซ่อน)
- ติ๊ก checklist inline, กดแถว = card detail (โหลดข้ามบอร์ดได้)
- เป็น **landing default** ของเมนู Kanban สำหรับ Staff (Owner/Manager default = หน้ารวมบอร์ด)

### 6.6 `/app/kanban/[boardId]?view=calendar` 🔜 — Calendar view
- ปฏิทินเดือน/สัปดาห์ วางการ์ดตาม dueAt (timezone tenant) — ลากเปลี่ยนวัน = `PATCH dueAt`
- การ์ดไม่มี due แสดงใน tray ข้าง ลากเข้าปฏิทินเพื่อกำหนด due

### 6.7 Board Settings (modal/section ใต้เมนู ⋯)
- Tab สมาชิก: list + role dropdown + ลบ + ปุ่มเชิญ (ค้นจากทีม tenant, เลือกหลายคน + role)
- Tab labels: CRUD + ตัวอย่างสี (palette 10 สีคงที่)
- Tab ทั่วไป: ชื่อ/คำอธิบาย/หน่วย/visibility/สี + zone อันตราย (archive board — confirm พิมพ์ชื่อบอร์ด)
- Tab archived: การ์ดที่ archive (ค้นได้, ปุ่มกู้คืน)

### 6.8 `/app/kanban/reports` — รายงาน
- Filter: ช่วงเวลา (7/30/90 วัน) + บอร์ด (multi) + หน่วย
- การ์ดสรุป + ตาราง + กราฟแท่ง minimal (ข้อ 10) — export CSV
- เห็นเฉพาะผู้มีสิทธิ์ `kanban.report.view` (default: OWNER/MANAGER)

**สรุปหน้าจอ: 8 surface** (6.1–6.8; card detail เป็น modal นับเป็น surface หลักตัวหนึ่ง; calendar 🔜)

---

## 7. Business Flows

### 7.1 สร้างบอร์ดจาก template
1. User เลือก template + ตั้งชื่อ + unit? + visibility → `POST /boards { templateId }`
2. Server ตรวจ: สิทธิ์ `kanban.board.create` · soft limit บอร์ด ACTIVE (`LIMIT_REACHED` → บอกให้ archive บอร์ดเก่า) · `unitId` (ถ้าส่งมา) เป็นของ tenant + ไม่ ARCHIVED
3. Transaction เดียว: สร้าง Board → Labels จาก `structure.labels` → Columns (position gen ไล่ลำดับ) → Cards (+cardNo running, checklist, ผูก labelRefs, `sourceType: TEMPLATE`) → ผู้สร้างเป็น member role ADMIN → activity `BOARD_CREATED`
4. Redirect เข้า board view
- Failure: template ไม่มี/inactive → 404 · transaction ล้ม → ไม่มีบอร์ดครึ่งเดียว (atomic)

### 7.2 ลากการ์ด (ใน column เดียว / ข้าม column) — flow สำคัญที่สุด
1. Client (optimistic): วางการ์ดตำแหน่งใหม่ทันที → ส่ง `POST /cards/:id/move { toColumnId, beforeCardId?, afterCardId? }` (id เพื่อนบ้าน ณ สายตา client — **ไม่ส่ง position เอง**)
2. Server ใน transaction (isolation READ COMMITTED + retry):
   a. โหลด card FOR UPDATE → ตรวจ ACTIVE, board ACTIVE, สิทธิ์ E
   b. ตรวจ `toColumnId` อยู่บอร์ดเดียวกัน + ACTIVE (ไม่ใช่ → 409 `COLUMN_ARCHIVED`)
   c. 🔜 ตรวจ WIP limit ของ column ปลายทาง (นับการ์ด ACTIVE) → เกิน = 409 `WIP_LIMIT_EXCEEDED` (ADMIN ส่ง `override: true` ได้ → activity บันทึก override)
   d. อ่าน position ของ before/after จริงจาก DB (**ไม่เชื่อ client**): ถ้า neighbor ถูกย้าย/archive ไปแล้ว → fallback แทรกท้าย column ปลายทาง
   e. `newPos = generateKeyBetween(afterPos, beforePos)` (ข้อ 11.1) → update card (columnId, position, completedAt ตาม isDoneColumn)
   f. Activity `CARD_MOVED { fromColumnId, toColumnId }` (ข้าม log ถ้าจัดลำดับใน column เดิม — กัน log ท่วม, ยังอัปเดต updatedAt)
3. Broadcast SSE `card.moved` → client อื่น sync, client ตัวเอง reconcile position จริงจาก response
4. Failure: server ปฏิเสธ → client rollback การ์ดกลับที่เดิม + toast เหตุผล · `POSITION_CONFLICT_RETRY` → client retry อัตโนมัติ 1 ครั้ง (refresh เพื่อนบ้านก่อน)

### 7.3 Mention ใน comment
1. User พิมพ์ `@` → autocomplete สมาชิก tenant (ไม่จำกัดเฉพาะสมาชิกบอร์ด — จะได้เรียกคนนอกบอร์ดเข้ามาดูได้)
2. `POST /comments { body: "ฝากดูด้วย @[usr_123]", mentions: ["usr_123"] }` → server validate: ทุก id ใน mentions มี token ในบอดี้จริง + เป็น Membership ของ tenant
3. บันทึก comment + activity `COMMENT_ADDED` → per mentioned user:
   - ถ้าเห็นบอร์ดได้อยู่แล้ว (member/TENANT visibility) → notify ตรง
   - ถ้าเป็นบอร์ด PRIVATE และไม่ใช่สมาชิก → **auto-add เป็น VIEWER** + activity `MEMBER_ADDED (via mention)` แล้วค่อย notify (จะได้กดลิงก์แล้วไม่เจอ 403)
4. `notify({ tenantId, to: { userId }, channel: WEB (+EMAIL), template: 'kanban.mention', data: { boardName, cardTitle, cardNo, actorName, excerpt, url } })`
5. คน comment เอง mention ตัวเอง → ไม่ notify

### 7.4 เตือน due date (cron ทุก 5 นาที)
1. Query: `status=ACTIVE AND completedAt IS NULL AND reminderMinutesBefore IS NOT NULL AND reminderSentAt IS NULL AND dueAt - reminderMinutesBefore*60s <= now()` (index `[tenantId, status, dueAt]`; batch 500)
2. ต่อการ์ด: notify assignees ทุกคน (`kanban.due_reminder` — WEB+EMAIL) → set `reminderSentAt = now()` (atomic `updateMany ... WHERE reminderSentAt IS NULL` กัน cron ซ้อนยิงซ้ำ)
3. แก้ dueAt/reminder ภายหลัง → reset `reminderSentAt = null` (เตือนรอบใหม่ได้)
4. การ์ดไม่มี assignee → เตือนผู้สร้างการ์ดแทน
5. Failure: notify ล้มรายคน → log แล้วไปต่อ, ไม่ block batch (การ์ดนั้นถือว่าส่งแล้ว — ยึด at-most-once กันสแปมซ้ำ)

### 7.5 Archive บอร์ด
1. ADMIN กด archive → confirm พิมพ์ชื่อบอร์ด (กันพลาด)
2. Set `status=ARCHIVED, archivedAt` — การ์ด/column ไม่แตะ (คง state เดิมไว้เพื่อกู้คืนตรงเป๊ะ)
3. ผลทันที: หายจาก list หลัก + **การ์ดทั้งบอร์ดหายจาก My Tasks/รายงาน/ค้นหา** (query กรอง `board.status=ACTIVE` เสมอ) · SSE `board.archived` → คนที่เปิดค้างเห็น banner "บอร์ดถูกเก็บถาวร" (read-only)
4. Unarchive: ตรวจ soft limit ก่อน → กลับมาครบทุกอย่าง

### 7.6 My Tasks aggregation
1. `GET /my-tasks`: การ์ด ACTIVE ที่ `KanbanCardAssignee.userId = me` JOIN board `status=ACTIVE` และ (me เป็น board member หรือ visibility=TENANT — กันเคสถูกถอดจากบอร์ด PRIVATE แต่ assignee ค้าง ข้อ 11.4)
2. จัดกลุ่มฝั่ง server ตาม timezone ของ tenant (default Asia/Bangkok): overdue / today / this week / later / no due — ซ่อนการ์ดที่ `completedAt != null` (toggle เปิดดูได้)
3. จำกัด 500 การ์ด (เกิน = แสดง banner ให้ไปกรองรายบอร์ด)

### 7.7 สร้างการ์ดจากเคสแชทลูกค้า 🔜
1. Staff ในโมดูล Chat กด "สร้างงาน" บน conversation → sheet เลือกบอร์ด (ที่ตัวเองมีสิทธิ์ E) + column + title (prefill จากข้อความล่าสุด)
2. `POST /cards/from-chat` → การ์ด `sourceType: CHAT, sourceId: conversationId` + description ใส่ excerpt 3 ข้อความล่าสุด + ลิงก์ conversation
3. บนการ์ดแสดง chip "จากแชท: [ชื่อลูกค้า]" กดกลับไป conversation ได้ (ตรวจสิทธิ์โมดูล Chat ตอนกด)

---

## 8. Integration (contracts ข้อ 2 ของ _CONVENTIONS)

| Contract | ใช้ตรงไหน |
|---|---|
| **2.5 notify** | จุดเดียวที่ Kanban ยิงออก — 4 template: `kanban.mention` (7.3) · `kanban.assigned` (ถูก assign — actor assign ตัวเองไม่ notify) · `kanban.due_reminder` (7.4) · `kanban.comment_on_assigned_card` (มี comment ใหม่บนการ์ดที่ฉัน assign, ไม่รวมคนที่ถูก mention ไปแล้ว — กัน notify ซ้ำ 2 ใบ) — ทุกใบ channel WEB + EMAIL, `data.url` = deep link `/app/kanban/[boardId]?card=[cardId]` |
| **2.1 Payment / 2.2 Point / 2.3 Coupon / 2.4 Account** | ❌ ไม่เกี่ยว — Kanban ไม่มีธุรกรรมเงิน/แต้ม |
| **2.6 Member identity** | ❌ ไม่เกี่ยวตรง — การ์ดอ้าง `userId` (ทีมงาน) ไม่ใช่ `memberId` (ลูกค้า) · 🔜 การ์ดจากแชทเก็บ `sourceId=conversationId` ไม่ copy ข้อมูลลูกค้า |
| **AuditLog กลาง** | action ที่แตะสิทธิ์: member add/remove/role change + เปลี่ยน visibility ของบอร์ด → เขียน AuditLog (who/what/before/after) เพิ่มจาก KanbanActivity |

### 8.2 Contract ที่ Kanban **เปิดให้โมดูลอื่นเรียก** (internal service function ไม่ใช่ HTTP)
```ts
kanban.getCardSummary({ tenantId, cardId, viewerUserId })
→ { ok: true, card: { id, boardId, cardNo, title, columnName, isDone, dueAt, assignees: [{userId, name}] } }
| { ok: false, reason: 'NOT_FOUND' | 'NO_ACCESS' }   // Meeting แสดง chip "ไม่มีสิทธิ์เข้าถึง"
```
- ผู้ใช้: **Meeting (โมดูล 11)** — เมื่อข้อความมีลิงก์การ์ด/`#cardNo` render เป็น card chip · ตรวจสิทธิ์ราย viewer ทุกครั้ง (ห้าม cache ข้าม user)

```ts
kanban.createCard({ tenantId, boardId, columnId, title, description?, sourceType, sourceId, actorUserId })  // 🔜
```
- ผู้ใช้: Chat (7.7), backoffice case forward — ตรวจสิทธิ์ actor เป็น E ของบอร์ดเสมอ

### 8.3 ทิศทางข้อมูล
- Kanban **ไม่ subscribe event** จากโมดูลอื่นใน MVP — ทุก integration เป็น pull (คนกดปุ่ม) หรือ Kanban ยิง notify ออก → ไม่มี coupling วน

---

## 9. Permissions

### 9.1 สองชั้น: tenant RBAC → board role
1. **ชั้น tenant** (Membership.permissions): มีสิทธิ์โมดูล `KANBAN` หรือไม่ + action พิเศษ
2. **ชั้นบอร์ด** (KanbanBoardMember.role): VIEWER / EDITOR / ADMIN — สิทธิ์จริงต่อบอร์ด
- Resolve: `boardRole(user, board) = OWNER ของ tenant → ADMIN · เป็น member → role ที่ระบุ · ไม่เป็น member แต่ board.visibility=TENANT → VIEWER · นอกนั้น → ไม่เห็นบอร์ด (404 ไม่ใช่ 403 — ไม่ leak ว่ามีบอร์ด)`
- `unitId` ของบอร์ด **ไม่ให้สิทธิ์อัตโนมัติ**แก่ MANAGER ของหน่วยนั้น (บอร์ดเป็น tenant-level, สิทธิ์มาจาก membership ของบอร์ดเท่านั้น) — เลี่ยง edge case สิทธิ์ 2 ทาง; Manager ถูกเชิญเข้าบอร์ดเหมือนคนอื่น

### 9.2 ตาราง action × role

| Action | OWNER | MANAGER/STAFF ที่มีสิทธิ์โมดูล | board ADMIN | board EDITOR | board VIEWER |
|---|---|---|---|---|---|
| เห็นบอร์ดใน list (member/TENANT vis.) | ✅ ทุกบอร์ด | ✅ ตามเงื่อนไข | ✅ | ✅ | ✅ |
| สร้างบอร์ด (`kanban.board.create`) | ✅ | ✅ default (ปิดรายคนได้) | — | — | — |
| แก้ตั้งค่าบอร์ด / archive บอร์ด | ✅ | ❌ | ✅ | ❌ | ❌ |
| จัดการสมาชิก + role | ✅ | ❌ | ✅ | ❌ | ❌ |
| จัดการ columns / labels | ✅ | ❌ | ✅ | ❌ | ❌ |
| สร้าง/แก้/ย้าย/archive การ์ด, checklist, แนบไฟล์ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Assign / due / label การ์ด | ✅ | ❌ | ✅ | ✅ | ❌ |
| Comment + mention | ✅ | ❌ | ✅ | ✅ | ❌ |
| แก้/ลบ comment ตัวเอง | ✅ | — | ✅ | ✅ | — |
| ลบ comment คนอื่น | ✅ | ❌ | ✅ | ❌ | ❌ |
| ดู card detail / activity | ✅ | — | ✅ | ✅ | ✅ |
| My Tasks | ✅ | ✅ (ของตัวเอง) | — | — | — |
| ดูรายงาน (`kanban.report.view`) | ✅ | MANAGER ✅ / STAFF ❌ default | — | — | — |
| ออกจากบอร์ดเอง | — | — | ✅* | ✅ | ✅ |

\* ADMIN คนสุดท้ายออกเอง/ถูกลบไม่ได้ — ต้องตั้ง ADMIN คนใหม่ก่อน (OWNER นับเป็น implicit ADMIN เสมอ จึงไม่มีทางไร้คนคุม)

- Custom permission ราย Membership: `permissions.kanban = { enabled, boardCreate, reportView }` — UI ตั้งค่าอยู่หน้า team settings กลาง
- ทุกจุดตรวจผ่าน `can(user, { tenantId, module: 'KANBAN', action })` + `boardRole()` — ใช้ร่วม API/UI (ซ่อนปุ่มที่ทำไม่ได้)

---

## 10. Reports & Metrics

หน้า `/app/kanban/reports` (filter: ช่วงเวลา 7/30/90 วัน · บอร์ด multi-select · หน่วย):

| รายงาน | นิยาม | แสดงผล |
|---|---|---|
| **งานค้าง (Open cards)** | การ์ด ACTIVE, ไม่อยู่ done column | ตัวเลขรวม + แยกต่อบอร์ด + แยกต่อ column (เห็น bottleneck) |
| **เลยกำหนด (Overdue)** | `dueAt < now` และยังไม่ done | ตัวเลข + ตารางการ์ด (บอร์ด, ผู้รับผิดชอบ, เลยมากี่วัน) เรียงเลยนานสุดก่อน — คลิกเข้าการ์ด |
| **ภาระงานต่อคน (Workload)** | นับการ์ดค้างต่อ assignee (การ์ดหลายคน = นับให้ทุกคน, การ์ดไม่มีคน = แถว "ยังไม่มอบหมาย") | ตารางต่อคน: ค้างทั้งหมด / เลยกำหนด / ครบกำหนดสัปดาห์นี้ + กราฟแท่งแนวนอน |
| **Throughput** | การ์ดที่ `completedAt` อยู่ในช่วง vs การ์ดสร้างใหม่ในช่วง | กราฟแท่งรายสัปดาห์ สร้าง/เสร็จ — เห็นว่างานเข้าเร็วกว่าออกไหม |
| **อายุงานค้าง (Aging)** | การ์ดค้างเกิน 14 วันไม่ขยับ (updatedAt เก่า) | ตาราง "การ์ดนิ่ง" ให้ไปเคลียร์ |
| 🔜 Cycle time | เวลาเฉลี่ยจากสร้าง → done | ตัวเลข + trend |
| 🔜 Checklist completion | % item ติ๊กแล้วต่อบอร์ด | progress ต่อบอร์ด |

- ทั้งหมด query สด (ไม่ทำ snapshot ใน MVP — ปริมาณระดับ SME ไหว), นับเฉพาะบอร์ด ACTIVE, timezone tenant
- Export CSV ทุกตาราง
- Metrics ฝั่ง platform (backoffice): จำนวนบอร์ด/การ์ด active ต่อ tenant — ใช้ดู adoption ของโมดูล

---

## 11. Edge Cases & Rules

### 11.1 Fractional Indexing (สเปคบังคับ — ห้าม implement เอง)
- ใช้ algorithm ตามไลบรารี **`fractional-indexing`** (Figma-style, base-62 alphabet `0-9A-Za-z`): `generateKeyBetween(a: string | null, b: string | null): string` — `null,null → "a0"`, แทรกหัว/ท้าย/ระหว่างได้เสมอ, เทียบลำดับด้วย string compare ธรรมดา (`ORDER BY position ASC`)
- **Server generate เท่านั้น** — client ส่งได้แค่ `beforeCardId/afterCardId`, server อ่าน position จริงของเพื่อนบ้านใน transaction แล้ว gen (กัน client เก่า/ค้าง cache เขียน key มั่ว)
- **Concurrent insert จุดเดียวกัน** (2 คนวางการ์ดระหว่างคู่เดียวกันพร้อมกัน): position ซ้ำกันได้ — **ยอมให้ซ้ำ** (ไม่มี unique constraint บน position) แล้ว tie-break ด้วย `ORDER BY position ASC, id ASC` → ลำดับ deterministic ทุก client เห็นเหมือนกัน; การลากครั้งถัดไปจะ gen key ใหม่ที่แยกออกจากกันเอง
- **Neighbor หาย** (ถูกย้าย/archive ระหว่างลาก): server fallback แทรกท้าย column ปลายทาง + response บอกตำแหน่งจริง → client reconcile (ไม่ error ใส่ผู้ใช้)
- **Key ยาวขึ้นเรื่อยๆ** (แทรกจุดเดิมซ้ำๆ): เมื่อ key ใดใน column ยาว > 50 ตัวอักษร → enqueue **rebalance job**: transaction เดียว rewrite position ทั้ง column เป็น key ห่างเท่ากัน (`a0, a1, a2, ...`) — ทำนอก peak (cron กลางคืน) + broadcast SSE `column.rebalanced` ให้ client reload column
- Column position และ checklist item position ใช้กติกาเดียวกันทุกประการ

### 11.2 Concurrency อื่นๆ
- ย้ายการ์ดที่เพิ่งถูก archive โดยคนอื่น → 409 `CARD_ARCHIVED` → client เอาการ์ดออกจากบอร์ด + toast
- 2 คนแก้ description พร้อมกัน → last-write-wins ใน MVP (autosave debounce ลดโอกาสชน) + SSE `card.updated` เตือนอีกฝ่ายว่ามีเวอร์ชันใหม่ · 🔜 field-level version check (`updatedAt` เป็น precondition)
- `cardNo`: gen ด้วย `UPDATE KanbanBoard SET cardNoSeq = cardNoSeq + 1 ... RETURNING` ใน transaction เดียวกับ create card — กันเลขซ้ำเมื่อสร้างพร้อมกัน
- Cron เตือนซ้อนรอบ (รอบก่อนยังไม่จบ): `updateMany WHERE reminderSentAt IS NULL` เป็น claim แบบ atomic ต่อ batch — การ์ดหนึ่งถูกเตือนรอบเดียว

### 11.3 กติกาธุรกิจ
- Archive column ได้เฉพาะ **column ว่าง** (นับการ์ด ACTIVE) — UI ชวน "ย้ายการ์ดทั้งหมดไป column อื่นก่อน" (ปุ่ม bulk move ให้ใน dialog เดียวกัน) · ห้าม archive column สุดท้ายของบอร์ด
- ย้ายเข้า done column → `completedAt = now()` · ย้ายออก → `completedAt = null` · ปลด flag `isDoneColumn` ออกจาก column → การ์ดใน column นั้น**คง completedAt เดิม** (ประวัติไม่ย้อน) แต่การ์ดใหม่ที่เข้ามาไม่ set
- Unarchive การ์ดที่ column เดิมถูก archive → วางท้าย column แรก (ตาม position) ของบอร์ด + activity บอก
- บอร์ด link `unitId` ที่ต่อมาถูก PAUSED/ARCHIVED → บอร์ดใช้ต่อได้ปกติ (เป็นแค่ metadata), badge หน่วยขึ้นสถานะจางๆ
- ลบ label → ปลดจากทุกการ์ด (kanban activity ไม่ log รายการ์ด — log board-level ครั้งเดียว)
- Due date เก็บ UTC, แสดง/จัดกลุ่ม/ปฏิทินตาม timezone tenant (default `Asia/Bangkok`) — วัน "วันนี้" ตัดเที่ยงคืนเวลาไทย

### 11.4 คน/สิทธิ์เปลี่ยนกลางทาง
- ถอด user ออกจากบอร์ด → **ไม่ auto-unassign** การ์ด (งานยังเป็นของเขา) แต่บอร์ด PRIVATE จะไม่โชว์ใน My Tasks ของเขาแล้ว (7.6) — dialog ตอนถอดเตือน "ยังมี n การ์ดที่มอบหมายคนนี้" + ปุ่ม "ถอด assign ทั้งหมด" ให้เลือก
- User ถูกลบจาก tenant (Membership ลบ): แสดงชื่อใน assignee/comment/activity เป็น "อดีตทีมงาน (ชื่อ)" — ไม่ลบข้อมูลย้อนหลัง, mention เขาไม่ได้อีก, ไม่ notify
- Mention user ที่ไม่มีสิทธิ์โมดูล kanban → เพิ่มเป็น VIEWER ได้ (7.3) แต่ notification บอก "ขอสิทธิ์โมดูลจากเจ้าของร้าน" ถ้าโมดูลถูกปิดสำหรับเขา
- เปลี่ยน visibility TENANT → PRIVATE: คนที่ไม่ใช่ member หลุดทันที (การ์ดหายจาก My Tasks เขา) — confirm dialog บอกผลกระทบ

### 11.5 Limits (soft — config ที่ `Tenant.limits`)
| อะไร | ค่า default |
|---|---|
| บอร์ด ACTIVE / tenant | 20 |
| Columns / บอร์ด | 20 |
| การ์ด ACTIVE / บอร์ด | 1,000 (เกิน → บังคับ archive ก่อน) |
| Checklist items / การ์ด | 50 |
| Attachments / การ์ด · ขนาด/ไฟล์ | 20 ไฟล์ · 20MB |
| สมาชิก / บอร์ด | 50 |
| Storage รวมโมดูล / tenant | 2GB ช่วงฟรี (นับจาก `KanbanAttachment.sizeBytes`) |

### 11.6 Security
- Rich text: sanitize ฝั่ง server ด้วย ProseMirror node/mark **allowlist** (paragraph, heading lv.1, bulletList, orderedList, listItem, bold, italic, strike, code, link) — ตัด node แปลกทิ้ง, link บังคับ `https?:` เท่านั้น (กัน `javascript:`), render มี `rel="noopener noreferrer"`
- Upload: ตรวจ mime จริงจาก magic bytes (ไม่เชื่อนามสกุล), เสิร์ฟไฟล์ผ่าน signed URL อายุสั้น (15 นาที) — ห้าม public bucket, กัน hotlink ข้าม tenant
- ทุก id ใน payload (boardId/columnId/cardId/labelId/userId) ตรวจ belongs-to-tenant ก่อนใช้ — id เป็น cuid เดายาก แต่**ห้ามพึ่งความเดายากแทน check**
- SSE endpoint ตรวจสิทธิ์ V ตอน connect + ตัด connection เมื่อถูกถอดจากบอร์ด (re-check ทุก 5 นาที)
- ไม่เห็นบอร์ด → ตอบ 404 (ไม่ leak การมีอยู่)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

### Functional
- [ ] สร้างบอร์ดเปล่า + จาก template ทั้ง 4 ชุด — columns/cards/checklist/labels ตรง structure, atomic (kill กลางคันแล้วไม่มีบอร์ดครึ่งเดียว)
- [ ] CRUD column + จัดลำดับ, archive column ว่างได้ / ไม่ว่างถูก block พร้อม bulk move
- [ ] การ์ด: title/description rich text (พิมพ์ไทย+อังกฤษ+ลิงก์), assignee หลายคน, due+เตือน, checklist, labels, แนบรูป+pdf, comment+mention — ครบทุก field แล้ว reload ข้อมูลไม่หาย
- [ ] DnD: ลากใน column, ข้าม column, ลาก column — ตำแหน่งคงอยู่หลัง refresh; เปิด 2 browser ลากพร้อมกันจุดเดียวกัน → ทั้งคู่จบด้วยลำดับเดียวกัน (tie-break) ไม่มี error ใส่ผู้ใช้
- [ ] Position rebalance: แทรกการ์ดจุดเดิม 60 ครั้ง → key ยาวเกิน threshold → job rewrite แล้วลำดับไม่เปลี่ยน
- [ ] Archive/unarchive การ์ดและบอร์ด + กู้คืน column-fallback ถูกต้อง
- [ ] My Tasks: รวมทุกบอร์ด, จัดกลุ่ม due ตามเวลาไทย, ซ่อน done, ซ่อนบอร์ด archived, ซ่อนบอร์ด PRIVATE ที่ถูกถอด
- [ ] Filter ทุกแกน (assignee/label/due/keyword) + state ใน URL แชร์แล้วเปิดตรงกัน
- [ ] Cron เตือน: การ์ด due ใกล้ถึง → notify ครั้งเดียว (รัน cron ซ้ำไม่ยิงซ้ำ), แก้ due แล้วเตือนใหม่ได้
- [ ] Mention: autocomplete, notify WEB+EMAIL, auto-add VIEWER บนบอร์ด PRIVATE, mention ตัวเองไม่ notify
- [ ] Meeting chip: ลิงก์การ์ดใน Meeting แสดง summary ถูกคน / คนไม่มีสิทธิ์เห็น "ไม่มีสิทธิ์เข้าถึง"
- [ ] รายงานทั้ง 5 ตัวเลขตรงกับข้อมูลจริง (ทำ fixture นับมือเทียบ) + export CSV
- [ ] SSE: 2 client เปิดบอร์ดเดียวกัน — ย้ายการ์ด/comment/archive เห็นอีกฝั่งภายใน 2 วินาที

### Isolation & Permissions
- [ ] Tenant A มองไม่เห็น/แตะบอร์ด-การ์ด-ไฟล์ของ tenant B ทุก endpoint (รวม attachment signed URL, SSE, card summary contract) — เทสยิงตรงด้วย id ข้าม tenant ต้องได้ 404
- [ ] Board PRIVATE: non-member ได้ 404, ค้นหาไม่เจอ, My Tasks ไม่โชว์
- [ ] VIEWER: UI ไม่มีปุ่มแก้ + ยิง API ตรงทุก mutation ได้ 403 · EDITOR แตะ column/member/label settings ไม่ได้ · ADMIN คนสุดท้ายลบตัวเองไม่ได้
- [ ] OWNER เข้าทุกบอร์ดรวม PRIVATE ที่ไม่ได้เป็น member
- [ ] AuditLog เกิดครบเมื่อ: member add/remove/role change, เปลี่ยน visibility

### UX / i18n / Mobile
- [ ] ทุกหน้า TH/EN สลับได้ ไม่มี string hardcode, empty/loading/error state ครบ 8 surface
- [ ] B&W minimal: สี label เป็น accent เดียวที่มีสี, ไม่มี jargon (ใช้ "บอร์ดงาน/การ์ด/คอลัมน์")
- [ ] มือถือจริง (iOS Safari + Android Chrome): long-press ลากการ์ดได้ + auto-scroll ขอบจอ, swipe done/archive + undo ทำงาน, card detail bottom sheet, แนบรูปจากกล้อง
- [ ] Optimistic UI rollback เมื่อ server ปฏิเสธ (จำลอง 409 ทุก code) + toast ภาษาถูก

### Performance & Data
- [ ] บอร์ด 20 columns × 1,000 การ์ด: โหลด board view < 2s (card summary ไม่ดึง description/comments), ลากลื่น 60fps
- [ ] Query My Tasks/รายงาน ใช้ index ที่ประกาศ (ตรวจ EXPLAIN ไม่มี seq scan บนตารางใหญ่)
- [ ] Rich text ที่มี script/js-link/iframe ถูก sanitize ทิ้ง — ยิง payload XSS ชุดมาตรฐานแล้ว render ปลอดภัย
- [ ] Upload: ไฟล์ 21MB ถูกปฏิเสธ, .exe ปลอม mime ถูกปฏิเสธ (magic bytes), signed URL หมดอายุแล้ว 403
- [ ] ไม่มี hard delete: บอร์ด/การ์ด/comment ใช้ archive/soft delete — ตรวจ schema + โค้ดไม่มี `delete()` บนตารางเหล่านี้ (ยกเว้น checklist item, card-label join, attachment record ตามสเปค)
