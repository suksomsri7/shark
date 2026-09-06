# K1.10 — ประวัติกิจกรรม (activity log + สายรวมความเห็น/กิจกรรม) · Opus builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.10 · oracle `scripts/qc-kanban-k1.10.mts` (16 ข้อ · ไม่แตะ) · ภาพ `scripts/visual-kanban.mts 1.10` (สเปคใหม่ 4 รายการ → 6 ใบ) · mockup `ledger/design-kanban/03-card-back.png` บล็อกล่าง ("ความเห็นและกิจกรรม" + แท็บ ทั้งหมด/ความเห็น/กิจกรรม)

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260926000000_kanban_v2_h/migration.sql` — `CREATE TYPE KanbanActivityType` (24 ค่า) + `CREATE TABLE KanbanActivity` + 3 index + FK 2 เส้น (additive ล้วน)
- `src/lib/modules/kanban/activity.ts` — **ตัวอ่าน**: `listCardActivity` · `listBoardActivity` · `listCardTimeline` + cursor + resolve ชื่อแบบ batch · re-export `logActivity` / `describeActivity` ตามสัญญา
- `src/lib/modules/kanban/activity-log.ts` — **ตัวเขียน** `logActivity(db|tx, …)` (แยกไฟล์ กัน import วนกลับ — ดู deviation ข้อ 1)
- `src/lib/modules/kanban/activity-text.ts` — บริสุทธิ์: `describeActivity` (ประโยคไทย) · `relativeThaiTime` · `thaiDayTime` · `activityIconName` (client component import ได้ — ไม่มี prisma ติดมา)
- `src/components/kanban/Timeline.tsx` — บล็อก "ความเห็นและกิจกรรม" (แท็บ + สายรวม + โหลดเพิ่ม + ช่องเขียน) · `ActivityRow` · `BoardActivityPanel` (แผงขวาของบอร์ด)

**แก้**
- `prisma/schema/kanban.prisma` — enum + model + back-relation `KanbanBoard.activities` / `KanbanCard.activities`
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanActivity: tenant` (ไม่มี `systemId` ในตาราง — เหตุผลเดียวกับ `KanbanComment`/`KanbanAttachment`)
- `src/lib/modules/kanban/types.ts` — `KanbanActivityKind` (union 24 ค่า ฝั่ง client ไม่ต้องรู้จัก prisma) · `KanbanActivityNames` · `KanbanActivityDto` · `KanbanTimelineItemDto` · `KanbanTimelineFilter` · `KanbanPage<T>`
- `src/lib/modules/kanban/{service,cards,moves,members,labels,checklists,comments,attachments}.ts` — ฝัง `logActivity` ในทรานแซกชันของงานจริง (ตารางเต็มด้านล่าง)
- `src/lib/modules/kanban/actions.ts` — `listCardTimelineAction` · `listBoardActivityAction` (+ ส่ง `auth.user.id` ให้ service เดิมที่เพิ่งรับ `actorUserId`)
- `src/components/kanban/Comments.tsx` — แตกเป็น "ชิ้นส่วน": `CommentRow` · `CommentComposer` · `useMentionPeople` (คอมโพเนนต์ `Comments` ตัวเดิมถูกแทนที่ด้วย `Timeline` — ไม่ทำสำเนาช่องเขียน)
- `src/components/kanban/CardBack.tsx` — `<Comments>` → `<Timeline>` (+ `nowMs`)
- `src/components/kanban/BoardHeader.tsx` — เมนู ⋯ เพิ่ม "ประวัติกิจกรรมของบอร์ด" (`board-activity-open`) → เปิด `BoardActivityPanel`
- `scripts/visual-kanban.mts` — สเปค `"1.10"` + ขั้นเตรียมข้อมูล (ย้าย+มอบหมายผ่าน service จริง) + ขั้นคืนสภาพ seed

## Schema

```sql
CREATE TYPE "KanbanActivityType" AS ENUM ('BOARD_CREATED', …24 ค่า…);
CREATE TABLE "KanbanActivity" (
    "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "boardId" TEXT NOT NULL,
    "cardId" TEXT, "actorUserId" TEXT, "type" "KanbanActivityType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON "KanbanActivity"("cardId", "createdAt" DESC);   -- สายของการ์ด
CREATE INDEX ON "KanbanActivity"("boardId", "createdAt" DESC);  -- สายของบอร์ด
CREATE INDEX ON "KanbanActivity"("tenantId");
-- FK boardId → KanbanBoard(id) CASCADE · cardId → KanbanCard(id) CASCADE
```

additive ล้วน · ตรวจ SQL ด้วยตาแล้ว: ไม่มี `DROP` / `ALTER … TYPE` / ไม่แตะตารางเดิมสักคอลัมน์
`actorUserId` ไม่ทำ FK ไป `User` (แพตเทิร์นเดียวกับ `authorUserId`/`assigneeUserId` ทั้งโมดูล) · `boardId`/`cardId` ทำ FK **CASCADE** เพราะประวัติที่อ้างการ์ดที่ไม่มีอยู่แล้วไม่มีความหมาย และการ์ดปกติถูก "เก็บเข้าคลัง" ไม่ใช่ลบ

## Function map

### `activity-log.ts` (ตัวเขียน)
| ฟังก์ชัน | หมายเหตุ |
|---|---|
| `logActivity(db \| tx, { tenantId, boardId, cardId?, actorUserId?, type, data?, createdAt? })` | พารามิเตอร์แรกเป็น `Pick<Prisma.TransactionClient,"kanbanActivity">` ⇒ ส่ง `prisma` หรือ `tx` ก็ได้ · **ทุกจุดเรียกส่ง `tx` ของงานจริง** |
| `stamp()` (ภายใน) | นาฬิกาที่ไม่ย้อน/ไม่ซ้ำภายในโปรเซส — 1 การกระทำเขียนได้หลายแถวใน tx เดียว (UPDATED แล้ว DUE_SET) ถ้าเวลาชนกันเป๊ะระดับมิลลิวินาที ลำดับที่ผู้ใช้เห็นจะสุ่มตามที่ Postgres คืนแถว |

### `activity.ts` (ตัวอ่าน · ตรวจสิทธิ์ทุกเส้น)
| ฟังก์ชัน | สิทธิ์ | หน้าที่ |
|---|---|---|
| `listCardActivity(ctx, cardId, {take=50, cursor?})` | `assertCardRole … VIEWER` | กิจกรรมของการ์ด ล่าสุดก่อน + `nextCursor` |
| `listBoardActivity(ctx, boardId, {take=50, cursor?})` | `assertBoardRole … VIEWER` | ทั้งบอร์ด (ระดับบอร์ด + ทุกการ์ด) |
| `listCardTimeline(ctx, cardId, {filter, take?, cursor?})` | `assertCardRole … VIEWER` | ผสม `KanbanComment` + `KanbanActivity` เป็น `{kind:"comment"\|"activity"}` |
| `toDtos()` (ภายใน) | — | resolve ชื่อคน/คอลัมน์/ป้าย/การ์ด **4 คิวรีคงที่ต่อหน้า** ไม่ว่าจะกี่แถว (กัน N+1) |
| `encodeCursor/olderThan` (ภายใน) | — | cursor = base64url ของ `(createdAt, id)` แบบ keyset — ใช้ตัวเดียวกันได้ทั้ง 2 ตาราง |

`describeActivity(item) → string` (จาก `activity-text.ts` · re-export ที่ `activity.ts`) เช่น "ย้ายจาก รอทำ ไป กำลังทำ" · "มอบหมายให้ ปุ๊ก มณีรัตน์" · "ตั้งกำหนดส่ง 10 ก.ย. 17:00" · "ติดป้าย ด่วน" · "เพิ่ม ธนา เข้าบอร์ด เป็นผู้ดู"

## รายการ mutation ที่ฝังกิจกรรม (service → ชนิด)

| ไฟล์ · ฟังก์ชัน | ชนิดกิจกรรม | `data` |
|---|---|---|
| `service.createBoard` | `BOARD_CREATED` | `{name, visibility, unitId}` |
| `service.renameBoard` | `BOARD_UPDATED` | `{fields:["name"], from, name}` |
| `service.archiveBoard` | `BOARD_ARCHIVED` | — |
| `service.unarchiveBoard` | `BOARD_UPDATED` | `{fields:["status"], status:"ACTIVE"}` (ไม่มีชนิด RESTORED ในสัญญา) |
| `members.setBoardVisibility` | `BOARD_UPDATED` | `{fields:["visibility"], from, visibility}` |
| `members.addMember` (คนใหม่) | `MEMBER_ADDED` | `{userId, role}` |
| `members.addMember` (คนเดิม) | `MEMBER_ROLE_CHANGED` | `{userId, from, to}` |
| `members.grantViewerForMention` | `MEMBER_ADDED` | `{userId, role:"VIEWER", reason:"mention"}` |
| `members.setMemberRole` | `MEMBER_ROLE_CHANGED` | `{userId, from, to}` |
| `members.removeMember` | `MEMBER_REMOVED` | `{userId, role}` |
| `members.leaveBoard` | `MEMBER_REMOVED` | `{userId, role, self:true}` |
| `service.createColumn` | `COLUMN_CREATED` | `{columnId, name}` |
| `service.renameColumn` (เดิม) · `moves.renameColumn` | `COLUMN_UPDATED` | `{columnId, fields:["name"], from, name}` |
| `moves.setColumnDone` | `COLUMN_UPDATED` | `{columnId, fields:["isDoneColumn"], isDoneColumn}` |
| `moves.setColumnWip` | `COLUMN_UPDATED` | `{columnId, fields:["wipLimit"], wipLimit}` |
| `moves.moveColumn` | `COLUMN_MOVED` | `{columnId, placedAt}` |
| `service.archiveColumn` (เดิม · เก็บการ์ดตาม) · `moves.archiveColumn` | `COLUMN_ARCHIVED` | `{columnId, name}` |
| `service.createCard` | `CARD_CREATED` | `{title, columnId, sourceType}` |
| `cards.duplicateCard` | `CARD_CREATED` | `{title, columnId, duplicatedFromCardId}` |
| `cards.updateCardFields` | `CARD_UPDATED` (+ `CARD_DUE_SET` ถ้าส่ง `dueAt`) | `{fields}` · `{dueAt ISO\|null}` |
| `service.updateCard` (เส้นเดิม/AI) | `CARD_UPDATED` (+ `CARD_DUE_SET`) | เหมือนกัน |
| `moves.moveCard` (ข้ามคอลัมน์) | `CARD_MOVED` (+ `CARD_COMPLETED` เมื่อเข้าคอลัมน์เสร็จครั้งแรก) | `{fromColumnId, toColumnId}` · `{toColumnId, completedAt}` |
| `service.moveCard` (เส้นเดิม) | `CARD_MOVED` | `{fromColumnId, toColumnId}` |
| `moves.moveAllCards` | `CARD_MOVED` (ใบละแถว) | `{fromColumnId, toColumnId, bulk:true}` |
| `cards.setCardAssignees` · `cards.syncSingleAssignee` | `CARD_ASSIGNED` / `CARD_UNASSIGNED` | `{userIds}` (เฉพาะส่วนต่าง) |
| `labels.setCardLabels` · `labels.applyCardLabelNames` | `CARD_LABELED` / `CARD_UNLABELED` | `{labelIds}` (เฉพาะส่วนต่าง) |
| `cards.archiveCard` · `service.archiveCard` | `CARD_ARCHIVED` | — |
| `cards.restoreCard` | `CARD_RESTORED` | `{columnId}` |
| `checklists.toggleItem` (เฉพาะ false→true) | `CHECKLIST_ITEM_DONE` | `{checklistId, itemId, text}` |
| `comments.addComment` | `COMMENT_ADDED` | `{commentId}` |
| `attachments.addAttachment` | `ATTACHMENT_ADDED` | `{attachmentId, name, contentType, bytes}` |

**ทุกแถวเขียนใน `prisma.$transaction` เดียวกับงานจริง** — จุดที่ของเดิมเป็น `update`/`updateMany` เดี่ยว ๆ ถูกห่อ tx เพิ่มให้ (พฤติกรรมเดิมทุกอย่าง · ข้อสอบ k1.1–k1.9 เขียวครบ)

## UI

- **`Timeline.tsx`** (client) — `data-testid`: `comments` (บล็อกนอก · คงชื่อเดิมจาก K1.8 ให้ harness ภาพเดิมชี้ได้) · `timeline-filter` (แถบแท็บ) · `timeline-tab` (ปุ่มแท็บ) · `timeline` (`<ul>` ของสาย) · `activity` (แถวกิจกรรม) · `timeline-more` (ปุ่ม "โหลดเพิ่ม")
- โครงตาม mockup 03: หัวข้อ 💬 "ความเห็นและกิจกรรม" ซ้าย · แท็บ [ทั้งหมด][ความเห็น][กิจกรรม] ชิดขวา · สายเรียงล่าสุดบน · ช่องเขียนติดล่างสุด
- แถวกิจกรรม = กล่องไอคอน 26px + **ชื่อคน (ตัวหนา)** + ประโยคไทย + "· เมื่อครู่ / 5 นาทีที่แล้ว / เมื่อวาน" — คนทำเป็น `null` แสดงว่า "ระบบ"
- แถวความเห็นใช้ `CommentRow` เดิมของ K1.8 (avatar + ชื่อ + เวลา + ปุ่มแก้/ลบ + ชิป `@`) — K1.10 เพิ่ม prop `nowMs` ให้แสดงเวลาแบบสัมพัทธ์เข้าชุดกับแถวกิจกรรม (เวลาเต็มยังอยู่ใน `title` ของ element)
- **`BoardActivityPanel`** — แผงขวา 380px (มือถือเต็มจอ) `data-testid="board-activity"` เปิดจากเมนู ⋯ › "ประวัติกิจกรรมของบอร์ด" · แถวบอกชื่อการ์ดด้วย (`showCard`) · "โหลดเพิ่ม" ใช้ cursor เดียวกัน
- ทุก error เป็นข้อความในหน้า/`onToast` ไม่มี `alert()` [[feedback_validation_inline_not_alert]]

## Deviation จากสัญญา (+เหตุผล)

1. **`logActivity` อยู่ไฟล์ `activity-log.ts` แล้ว re-export จาก `activity.ts`** — ตัวอ่านต้องตรวจสิทธิ์จึง import `members.ts` แต่ `members.ts` ก็ต้องเขียนกิจกรรม (เพิ่ม/ถอดสมาชิก) ⇒ เขียนรวมไฟล์เดียว = import วนกลับ `activity ↔ members` ซึ่ง bundler ฝั่ง server/client แก้ไม่เหมือนกัน (ระเบิดเวลา) · ผู้เรียกยังเขียน `import { logActivity } from "./activity"` ได้ตามสัญญาทุกประการ และ oracle S3.7 (append-only) ยังตรวจ `activity.ts` ได้ตรง ๆ เพราะไม่มี `kanbanActivity.update/delete` ที่ไหนเลยในโมดูล
2. **`describeActivity` อยู่ `activity-text.ts`** (re-export จาก `activity.ts`) — `Timeline.tsx` เป็น client component จึง import `activity.ts` (มี prisma) ไม่ได้ · ไฟล์นี้บริสุทธิ์ ไม่ import อะไรนอกจาก `types.ts`
3. **`filter:"all"` ไม่รวมกิจกรรมชนิด `COMMENT_ADDED`** — ตัวความเห็นอยู่ในสายอยู่แล้ว การโชว์ "เขียนความเห็น" ซ้อนอีกบรรทัดคือข้อมูลซ้ำ (Trello ก็ไม่โชว์) · แท็บ "กิจกรรม" ยังเห็น เพราะแท็บนั้นซ่อนตัวความเห็นไปแล้ว ประวัติจึงต้องบอกว่าเคยมีความเห็นเกิดขึ้น
4. **เวลาประทับมาจากฝั่งแอป (`stamp()`) ไม่ใช่ `now()` ของ DB** — บังคับให้แถวในทรานแซกชันเดียวกันห่างกัน ≥ 1 มิลลิวินาที ไม่งั้นลำดับ "แก้ชื่อ → ตั้งกำหนดส่ง" จะสลับแบบสุ่ม (oracle S2.1 ตรวจลำดับตรง ๆ)
5. **คอมโพเนนต์ `Comments` ถูกยุบ** — `Comments.tsx` เหลือชิ้นส่วน (`CommentRow` / `CommentComposer` / `useMentionPeople`) ให้ `Timeline` ประกอบ · ทำแบบนี้เพราะ "สายรวม" ต้องเรียงความเห็นกับกิจกรรมสลับกันตามเวลา จะ delegate ทั้งบล็อกให้ `Comments` ไม่ได้ · `data-testid="comments"` ย้ายไปอยู่บล็อกนอกของ `Timeline` (สเปคภาพ 1.8 ที่ `expect: [data-testid=comments]` ยังเขียว) และ `comment-input`/`mention-menu` ยังอยู่ใน `Comments.tsx` ตามที่ข้อสอบ K1.8 S4.2 ตรวจ
6. **`moveAllCards` เขียน `CARD_MOVED` ใบละแถว** — สัญญาไม่ได้ระบุ แต่ประวัติของ "การ์ดใบนั้น" ต้องตอบได้ว่าเคยย้ายจากไหนไปไหน แม้จะเกิดจากคำสั่งเดียวของผู้ดูแล (ใบละ ≤1 แถว ไม่ทำให้สายท่วม)
7. **`checklists.toggleItem` บันทึกเฉพาะ false→true** — ปลดติ๊ก/ติ๊กซ้ำไม่ใช่สิ่งที่ทีมย้อนดู และจะทำให้สายกิจกรรมเต็มไปด้วยเสียงรบกวน (สัญญาระบุชนิด `CHECKLIST_ITEM_DONE` เท่านั้น ไม่มี UNDONE)
8. **`service.updateCard` เส้นเดิม (AI/actions เก่า) ใช้ `actorUserId: null`** — เส้นนั้นไม่รับ actor มาแต่ไหนแต่ไร (proposals ของ AI เรียกโดยไม่มีผู้ใช้) · จอจะขึ้นว่า "ระบบ …" ซึ่งตรงความจริง · เส้นที่มีผู้ใช้จริง (`cards.updateCardFields` จาก UI) บันทึกชื่อคนครบ
9. **`ATTACHMENT_ADDED` อยู่ใน tx ของ "แถวไฟล์แนบ" ไม่ใช่ของการอัปโหลด** — ไฟล์ขึ้น storage ไปก่อนแล้วและย้อนกลับไม่ได้อยู่ดี · สิ่งที่ต้องเกิด/ไม่เกิดพร้อมกันคือแถวในฐานข้อมูล 2 ใบ ซึ่งอยู่ทรานแซกชันเดียวกันแล้ว

## Verify — ภาพจริง (เปิดดูเองทีละใบ · เทียบ mockup 03 บล็อกล่าง)

`bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-kanban.mts 1.10` → `.qc-shots/kanban/1.10/`

- `timeline-all-desktop.png` — หัวข้อ "ความเห็นและกิจกรรม" + แท็บ 3 ปุ่ม (ทั้งหมด = ปุ่มดำ) ชิดขวา · ความเห็นที่เพิ่งเขียน (avatar + ชื่อ + "เมื่อครู่" + ปุ่มแก้ไข/ลบ) · ตามด้วยกิจกรรม 3 บรรทัด: "ปลด ธนา ศรีสมบัติ ออกจากการ์ด" · "มอบหมายให้ ปุ๊ก มณีรัตน์" · "ย้ายจาก รอทำ ไป กล่องงานเข้า" · ช่องเขียนติดล่างสุด — **ตรงโครง mockup 03 ทุกจุด**
- `timeline-comments-desktop.png` — แท็บ "ความเห็น" ดำ · เหลือเฉพาะแถวความเห็น (ไม่มีแถวกิจกรรมปน)
- `timeline-activity-desktop.png` — แท็บ "กิจกรรม" ดำ · เหลือเฉพาะประโยคไทย รวม "เขียนความเห็น" (deviation ข้อ 3 เห็นผลตรงนี้)
- `timeline-all-mobile.png` (390px) — แท็บตกลงมาอยู่บรรทัดของตัวเอง อ่านครบ ไม่ล้นจอ · ช่องเขียนเต็มความกว้าง
- `board-activity-panel-desktop.png` — เมนู ⋯ › "ประวัติกิจกรรมของบอร์ด" → แผงขวา หัวข้อ + ปุ่มปิด · แถวมีชื่อการ์ดต่อท้าย ("· การ์ด #7 ทำใบเสนอราคา…") · เห็นทั้งกิจกรรมของการ์ดและระดับบอร์ด (เพิ่ม/ถอดสมาชิก · เพิ่ม/เก็บคอลัมน์) · แถวที่ระบบทำเองขึ้นว่า "ระบบ เพิ่มคอลัมน์ …"
- `board-activity-panel-mobile.png` — แผงเต็มจอ อ่านครบ
- **คืนสภาพ seed หลังถ่าย** (โค้ดอยู่ในสคริปต์เอง): ย้ายการ์ด #7 กลับคอลัมน์เดิม · คืนผู้รับผิดชอบเดิม · ลบความเห็น 2 ใบที่เขียนระหว่างถ่าย · ลบแถวกิจกรรมทุกใบที่เกิดในรอบนั้น (8 แถว) → ยืนยันด้วย regression `k1.5` (บอร์ดป่าตองยังมี 24 การ์ด ACTIVE) และ `k1.8` (จำนวนความเห็น)

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… SESSION_SECRET=…   (grep|cut บรรทัดเดียว · ตรวจ host = ep-plain-art ก่อน)
pnpm exec prisma migrate deploy
  → Applying migration `20260926000000_kanban_v2_h` … All migrations have been successfully applied.
pnpm exec prisma generate → Generated Prisma Client (v7.8.0)

pnpm exec tsx scripts/qc-kanban-k1.10.mts
  → ผ่าน 16/16 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":16,"passed":16,"findings":[]}

regressions (รอบสุดท้าย หลังคืนสภาพข้อมูลจากการถ่ายภาพ):
  k1.1  {"total":30,"passed":30,"findings":[]}   k1.2  {"total":25,"passed":25,"findings":[]}
  k1.3  {"total":29,"passed":29,"findings":[]}   k1.4  {"total":30,"passed":30,"findings":[]}
  k1.5  {"total":17,"passed":17,"findings":[]}   k1.6  {"total":20,"passed":20,"findings":[]}
  k1.7  {"total":21,"passed":21,"findings":[]}   k1.8  {"total":18,"passed":18,"findings":[]}
  k1.9  {"total":18,"passed":18,"findings":[]}   k1.10 {"total":16,"passed":16,"findings":[]}
  qc-kanban-notify   → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → EXIT=0 (ไม่มี error)
pnpm exec tsx scripts/fitness.mts (ไม่ export env) → ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

bash scripts/acc-v2-serve.sh → ✅ พร้อมใช้งานที่ http://127.0.0.1:3215
pnpm exec tsx scripts/visual-kanban.mts 1.10
  → JSON_SUMMARY {"wo":"1.10","user":"owner","shots":[…6 ใบ…],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว
```

## จุดที่อยากให้ Fable ลองแหย่

- **แถวกิจกรรมค้างจาก oracle เอง**: `qc-kanban-k1.10.mts` ล้าง `kanbanActivity` ของ **การ์ดทดสอบ** ตอนจบ แต่แถว **ระดับบอร์ด** (COLUMN_*/MEMBER_* จาก S2.4) ไม่ถูกล้าง ⇒ รัน oracle ทุกครั้งจะทิ้งกิจกรรมสะสมบนบอร์ดป่าตอง (เห็นได้ในภาพ `board-activity-panel-*`) · ไม่กระทบข้อสอบข้อไหน (S3.3 ตรวจ "≥ 18") แต่ทำให้ภาพ QC รอบหลัง ๆ รกขึ้นเรื่อย ๆ — ถ้าอยากให้สะอาด ต้องเพิ่ม `deleteMany({ boardId, cardId: null })` ท้าย oracle (ไฟล์ของ Fable — builder ไม่แตะ)
- **นาฬิกา `stamp()` เป็นของ "ต่อโปรเซส"**: 2 อินสแตนซ์ (Vercel หลายตัว) เขียนพร้อมกันแล้วเวลาชนกันระดับมิลลิวินาที ยังมีโอกาสสลับลำดับได้ · ในทางปฏิบัติสองคนกดพร้อมกันเป๊ะระดับ ms แล้วลำดับสลับ ไม่ใช่ปัญหาที่ผู้ใช้เห็น แต่ถ้าอยากแน่นอน 100% ต้องเพิ่มคอลัมน์ `seq bigserial` (ไม่ใช่ additive-only ที่ราคาถูก — ยกไป WO อื่น)
- **cursor ของสายรวมดึงมาฝั่งละ `take+1`**: หน้าที่ความเห็นเยอะมากจะอ่าน 2×(take+1) แถวแล้วทิ้งครึ่งหนึ่ง — ถูกต้องเสมอ แต่เปลืองกว่าคิวรีเดียว · ลองเปิดการ์ดที่มีความเห็น 200 ใบดูว่าช้าไหม (ถ้าช้า ทางแก้คือ UNION ใน SQL ดิบ ซึ่งจะไปชน F5 ratchet)
- **สิทธิ์อ่านกิจกรรม = VIEWER**: คนที่เพิ่งถูกเพิ่มเข้าบอร์ดวันนี้ เห็นประวัติย้อนหลังทั้งหมดของบอร์ด (รวมชื่อคนที่ถูกถอดออกไป) — ตั้งใจให้เป็นแบบ Trello · ถ้าเจ้าของร้านคิดว่านี่คือข้อมูลไว รบกวนเคาะว่าให้จำกัดที่ ADMIN หรือตัดประวัติก่อนวันที่เข้าร่วม
- **`applyCardLabelNames` (เส้นเดิมของ AI/seed) บันทึก LABELED/UNLABELED ด้วย** ⇒ การ์ดที่สร้างจาก AI/เทมเพลตจะมี 2 แถว (CREATED + LABELED) · ลองสร้างการ์ดผ่าน AI แล้วดูว่าสายอ่านรู้เรื่องไหม หรือควรยุบเป็นแถวเดียว
- **แผงบอร์ดใช้ `position: fixed` ที่เรนเดอร์อยู่ใน `<header>` ที่มี `overflow-x-auto`** — ทดสอบบน Chromium แล้วไม่ถูกคลิป (ภาพยืนยัน) แต่ถ้าวันหน้ามีใครใส่ `transform` ให้หัวบอร์ด แผงจะกลายเป็น absolute ในกล่องที่ scroll ได้ทันที · ถ้าอยากกันไว้ก่อน ให้ย้ายไปเรนเดอร์ที่ `BoardView` ระดับบนสุด
