# K1.8 — ความเห็น + @mention + แจ้งเตือนตรงคน · Opus builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.8 · oracle `scripts/qc-kanban-k1.8.mts` (**18 ข้อ** ไม่ใช่ 19 ตามที่ WO เขียน — ไม่ได้แก้ไฟล์ oracle) · ภาพ `scripts/visual-kanban.mts 1.8` · mockup `ledger/design-kanban/03-card-back.png` (บล็อกล่าง "ความเห็นและกิจกรรม")

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260924000000_kanban_v2_f/migration.sql` — CREATE TABLE `KanbanComment` + 2 index + FK (additive ล้วน)
- `src/lib/modules/kanban/comments.ts` — service เต็มของความเห็น (function map ด้านล่าง)
- `src/components/kanban/Comments.tsx` — UI client (สายความเห็น + ช่องเขียน + เมนู `@`)

**แก้**
- `prisma/schema/kanban.prisma` — model `KanbanComment` + relation `KanbanCard.comments`
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanComment: tenant` (ไม่มี `systemId` ในตาราง — เหตุผลเดียวกับ `KanbanChecklist` ของ K1.7: การ์ดต้นทางรู้ระบบของตัวเอง)
- `src/lib/core/push.ts` — **เพิ่ม `sendPushToUser(userId, msg, opts?)`** (ยิงรายคน · กรอง `tenantId` เมื่อผู้เรียกส่งมา · best-effort ห้าม throw · นับ `sent` เฉพาะ ticket `status:"ok"` ตามกติกาเดิมของไฟล์)
- `src/lib/modules/kanban/notify.ts` — กลายเป็น **ตัวช่วยกลาง**: `notifyKanbanUser()` (in-app `AppNotification` + `sendPushToUser` + อีเมลเมื่อ `emailEnabled`) + `cardLink()` · `notifyCardAssigned` (K1.1) เดินผ่านตัวกลางนี้แล้ว ⇒ การมอบหมายงานได้ push รายคน + อีเมล ฟรีโดยไม่ต้องแก้ผู้เรียก
- `src/lib/modules/kanban/members.ts` — เพิ่ม `grantViewerForMention(ctx, boardId, userId)` (ระบบเป็นคนเพิ่ม VIEWER ให้คนที่ถูก mention) + import `canReadKanban`
- `src/lib/modules/kanban/limits.ts` — เพิ่ม `commentMaxChars: 5000`
- `src/lib/modules/kanban/types.ts` — `KanbanCommentDto` · `CardDetailDto.comments` · `BoardViewDto.viewerUserId`
- `src/lib/modules/kanban/cards.ts` — `getCardDetail` โหลดความเห็นคู่กับเช็คลิสต์ใน `Promise.all` เดียว
- `src/lib/modules/kanban/service.ts` — `getBoardView` ดึงจำนวนความเห็นของทุกการ์ดด้วย 1 raw query (group by `cardId`, `deletedAt IS NULL`) แล้วส่งเข้า `toBoardCardDto` (พารามิเตอร์ที่ 5 `commentCount`) ⇒ ตราไอคอนแชทบนการ์ด (`Card.tsx` มีโค้ดรออยู่แล้วตั้งแต่ K1.5) มีค่าจริง · เพิ่ม `viewerUserId` ลง DTO
- `src/lib/modules/kanban/actions.ts` — 4 action ใหม่ + `assertKanbanCanAny()` (ดูหัวข้อสิทธิ์)
- `src/lib/outbox-consumers.ts` — ลงทะเบียน `"kanban.comment.added": withAutomation(async () => {})`
- `src/lib/automation/labels.ts` — `{ value: "kanban.comment.added", label: "เมื่อมีความเห็นใหม่ในการ์ด" }`
- `src/components/kanban/CardBack.tsx` — mount `<Comments>` ใต้เช็คลิสต์ · รับ prop ใหม่ `boardRole` + `currentUserId` · `fields.comments` sync กับตรา `commentCount` บนตัวการ์ดผ่าน `handlers.onPatch`
- `src/components/kanban/BoardView.tsx` — ส่ง `boardRole={board.role}` + `currentUserId={board.viewerUserId}` ให้ `CardBack`
- `scripts/visual-kanban.mts` — เพิ่ม spec `"1.8"` 2 ใบ (ไม่แตะ spec เดิม)

## Schema

```sql
CREATE TABLE "KanbanComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KanbanComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KanbanComment_cardId_createdAt_idx" ON "KanbanComment"("cardId", "createdAt");
CREATE INDEX "KanbanComment_tenantId_idx" ON "KanbanComment"("tenantId");
-- FK cardId → KanbanCard(id) ON DELETE CASCADE
```

additive ล้วน · ตรวจ SQL ด้วยตาแล้ว: ไม่มี `DROP` / ไม่มี `ALTER … TYPE` / ไม่แตะตารางเดิม · `authorUserId` ไม่ทำ FK ไป `User` (แพตเทิร์นเดียวกับ `KanbanCardAssignee`) · ลบเป็น soft (`deletedAt`) เสมอ เพราะ K1.10 ต้องอ้างถึงความเห็นที่ถูกลบได้

## Function map (`comments.ts`)

| ฟังก์ชัน | สิทธิ์ | หน้าที่ |
|---|---|---|
| `addComment(ctx, cardId, body) → KanbanComment` | EDITOR (ผ่าน `assertCardRole`) | trim ว่าง/ยาวเกิน 5000 → error ไทย · ถอด mention จาก `@[ชื่อ](userId)` → กรองเหลือพนักงาน accepted ของร้าน · สร้างแถว + `emitOutbox` ใน tx เดียว · แจ้งคนที่ถูก mention (ยกเว้นตัวเอง) |
| `editComment(ctx, id, body)` | EDITOR + **ต้องเป็นผู้เขียน** | `editedAt` + คำนวณ `mentions` ใหม่ · คนที่ "เพิ่งถูกเพิ่มเข้ามาใน mention" ได้แจ้งเตือนเหมือนเขียนใหม่ |
| `deleteComment(ctx, id)` | ผู้เขียน **หรือ** ADMIN ของบอร์ด | soft delete · ลบซ้ำไม่ error |
| `listComments(ctx, cardId) → KanbanCommentDto[]` | VIEWER | ไม่รวมที่ลบ · เรียงเก่า→ใหม่ · `author{userId,name}` |
| `commentCountOfCard(ctx, cardId)` | VIEWER | จำนวนที่ยังไม่ลบ (ใช้ตอนคืนการ์ดเดี่ยว) |
| `listMentionTargets(ctx, boardId)` | VIEWER ของบอร์ด | รายชื่อพนักงาน accepted ของร้าน สำหรับเมนู `@` (ผูกกับบอร์ดเสมอ — ไม่ใช่ช่องดูดรายชื่อทั้งร้าน) |
| `parseMentionIds(body)` (export) | — | ตัวถอด markup แบบบริสุทธิ์ (ฝั่งจอใช้ regex ชุดเดียวกัน) |

**ลำดับด่านห้ามสลับ**: `assertCardRole` (404 ถ้ามองไม่เห็นบอร์ด · 403 ถ้ายศไม่ถึง) มาก่อนการตรวจ "เป็นผู้เขียนไหม" เสมอ ⇒ คนนอกไม่ได้รับคำตอบที่ยืนยันว่าความเห็น/บอร์ดมีอยู่จริง

## mention → แจ้งเตือน → auto-VIEWER

1. `mentions` เก็บเฉพาะ userId ที่เป็น **Membership accepted ของร้านนี้** — ด่านนี้สำคัญเพราะ `mentions` ถูกใช้เป็นรายชื่อ "คนที่จะได้สิทธิ์ดูบอร์ดอัตโนมัติ" ถ้าปล่อยให้ยัด id มั่ว ๆ ในเนื้อความได้ ก็เท่ากับเปิดบอร์ดลับให้ id ที่เดาไว้ล่วงหน้า
2. แจ้งทีละคน (`recipientUserId` ตรงคนเสมอ · ไม่แจ้งผู้เขียนแม้ mention ตัวเอง)
   - title `"มีคนพูดถึงคุณในการ์ด"` · body = `<ชื่อผู้เขียน> พูดถึงคุณในการ์ด "<ชื่อการ์ด>" · บอร์ด <ชื่อบอร์ด> · /app/sys/<sys>/kanban/b/<board>?card=<card>`
   - ต่อท้าย `" · คุณได้รับสิทธิ์ดูบอร์ดนี้แล้ว (ผู้ดู)"` เมื่อเพิ่งถูกเพิ่มเป็น VIEWER
3. `grantViewerForMention` เพิ่ม VIEWER **ก่อน** ส่งแจ้งเตือน (ไม่งั้นลิงก์ในแจ้งเตือนพาไป 404) · เพิ่มเฉพาะเมื่อ: เป็นพนักงานของร้าน + มีสิทธิ์โมดูล (`canReadKanban`) + `boardRole` ปัจจุบัน = `null` + บอร์ดยังไม่ถึงเพดาน `membersPerBoard` · ไม่แตะบทบาทของคนที่เป็นสมาชิกอยู่แล้ว (mention ต้องไม่กลายเป็นช่องเลื่อน/ลดขั้น) · เขียน `AuditLog` `kanban.board.member.add` พร้อม `after.reason = "mention"`

## Event + idempotency

```ts
type: "kanban.comment.added"
idempotencyKey: `kanban.comment.added#${comment.id}`     // ความเห็น 1 ใบ = event 1 ใบตลอดกาล
payload: { commentId, cardId, boardId, authorUserId, mentions }   // ❗ ไม่มี tenantId (อยู่ในตัว OutboxEvent แล้ว)
```
ยิงใน tx เดียวกับการสร้างแถว · consumer เป็น no-op ปิด event เป็น DONE + เป็นจุดให้ automation/webhook ยิงต่อ (บทเรียน 30 ส.ค.: ไม่มี consumer = คิวทั้งระบบตันเงียบ ๆ) · `editComment` **ไม่** ยิง event ใหม่ (สัญญาไม่ได้ระบุ · event "ความเห็นใหม่" ควรหมายถึงใบใหม่เท่านั้น)

## Actions (`actions.ts` · `*Action` เท่านั้น)

`addCommentAction` `editCommentAction` `deleteCommentAction` — คืน `{ok:true, comments: KanbanCommentDto[], commentCount}` (ทั้งชุดของการ์ด แพตเทิร์นเดียวกับเช็คลิสต์ K1.7) หรือ `{ok:false, message}` · `listMentionTargetsAction` คืนรายชื่อสำหรับเมนู `@`

**สิทธิ์ชั้นที่ 1**: `assertKanbanCanAny(auth, ["kanban.card.comment", "kanban.card.update"])` — คีย์ `kanban.card.comment` เพิ่งมีจริงใน WO นี้ ร้านที่ตั้งสิทธิ์ไว้ก่อนหน้าติ๊กแค่ `kanban.card.update` ⇒ ถ้าตรวจตรงตัวคีย์เดียว พนักงานเดิมจะคอมเมนต์ไม่ได้ทันทีที่ deploy (เหตุผลเดียวกับ backward compat ของ `canReadKanban` ใน K1.3) · ชั้นที่ 2 (EDITOR+ ของบอร์ด) ยังตรวจใน service เสมอ

## UI (`Comments.tsx` + `CardBack.tsx`)

- testid: `comments` (บล็อก) · `comment` (แถว) · `comment-input` (ช่องเขียน) · `comment-send` · `mention-menu` / `mention-option` · `mention-chip` · `comment-edit-input`
- ช่องเขียน: placeholder **"เขียนความเห็น… พิมพ์ @ เพื่อกล่าวถึงเพื่อนร่วมทีม"** (ตามพิมพ์เขียว §5.5 บรรทัด "ช่องเขียน") + ปุ่ม **"ส่ง"** สีหมึกเข้ม · `Enter` = ส่ง · `Shift+Enter` = ขึ้นบรรทัด (§5.6) · เมนู `@` เปิดอยู่ → `Enter/Tab` = เลือกคน · `↑/↓` เลื่อน · `Esc` ปิดเมนู (ไม่ปิดหลังการ์ด)
- เมนู `@`: จับ "กำลังพิมพ์ @อะไรอยู่" จากข้อความก่อนเคอร์เซอร์ (`/(?:^|\s)@([^\s@[\]()]{0,30})$/`) → กรองรายชื่อ ≤ 8 คน · เลือกแล้วแทรก markup `@[ชื่อ](userId) ` แล้วคืนเคอร์เซอร์ท้าย token
- เรนเดอร์ mention เป็นชิปสีเน้น (`--color-accent`) — **แปลงฝั่ง client เท่านั้น** ไม่มี HTML จาก server (เนื้อความผู้ใช้ห้ามกลายเป็น HTML ที่ browser เชื่อ)
- แถวความเห็น: avatar + ชื่อ + เวลาไทย (`formatCardDateTime`) + "· แก้ไขแล้ว" + ปุ่ม "แก้ไข"/"ลบ" (แก้ = ของตัวเองเท่านั้น · ลบ = ของตัวเอง หรือ ADMIN ของบอร์ด) · แก้ในที่ด้วย textarea + ปุ่ม บันทึก/ยกเลิก · ลบมี `confirm`
- empty state: "ยังไม่มีความเห็นในการ์ดนี้ — เขียนความเห็นแรกได้เลย"
- ทุกการแก้/ลบเป็น optimistic แล้ว revert + toast เมื่อ action ตีกลับ (แพตเทิร์นเดียวกับ `Checklist.tsx`)

## Deviation จากสัญญา (+เหตุผล)

1. **`authorUserId` เป็น NOT NULL** ⇒ `addComment` ที่ไม่มี `ctx.actorUserId` (คีย์ API / cron) โยน `KanbanForbiddenError` ไทย — สัญญาเขียนคอลัมน์ไว้แบบไม่ nullable และ D18 ให้คีย์ API มีบทบาทบนบอร์ดแต่ไม่มี "ผู้เขียน" ⇒ ปล่อยไว้ให้ K1.15 ตัดสิน (จะทำเป็น `authorApiKeyId` หรือผูกผู้ใช้ระบบก็ได้ · ตอนนี้ยังไม่มีเส้นทางไหนเรียกโดยไม่มี user)
2. **`editComment` ไม่ยิง `kanban.comment.added` ซ้ำ** แต่ **แจ้งเตือน mention ที่เพิ่งเพิ่ม** — สัญญาไม่ได้พูดถึงเคสนี้ เลือกตามหลัก "ถูกพูดถึงแล้วต้องรู้ตัว" (พิมพ์เขียว §7.4 แถว mention = ปิดไม่ได้) โดยไม่ทำให้ event ฝั่งระบบวิ่งซ้ำ
3. **แท็บ "ทั้งหมด / ความเห็น / กิจกรรม" ตามภาพ 03 ยังไม่ทำ** — เป็นของ K1.10 (`Timeline.tsx` testid `timeline-filter` ตามสัญญา §K1.10) · WO นี้เรนเดอร์หัวข้อ "ความเห็น n" ตรง ๆ แทนที่จะวาดแท็บปลอมที่ยังกดไม่ได้
4. **`sendPushToUser(userId, msg, opts?)`** รับ `tenantId` ผ่าน `opts` (ไม่ใช่พารามิเตอร์บังคับ) — คอมเมนต์ใน oracle เขียนลำดับ `(userId, …)` จึงคง userId เป็นตัวแรก แต่ผู้เรียกในโมดูลนี้ส่ง `tenantId` ทุกครั้ง เพราะผู้ใช้ 1 คนเป็นพนักงานได้หลายร้าน ถ้าไม่กรองร้าน เรื่องของร้าน ก. จะไปโผล่บนเครื่องที่ลงทะเบียนไว้กับร้าน ข.
5. **เพิ่ม `BoardViewDto.viewerUserId`** (ไม่ได้อยู่ในสัญญา) — จอต้องรู้ว่า "ฉันคือใคร" ถึงจะรู้ว่าแก้/ลบความเห็นใบไหนได้ และเน้นชิป @ ของตัวเอง
6. **oracle มี 18 ข้อ ไม่ใช่ 19** ตามที่ WO/ledger เขียน — ไม่ได้แก้ไฟล์ oracle (ตรวจแล้ว: S1×2 · S2×9 · S3×5 · S4×2 = 18)

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… APP_ENV=development  (grep|cut · ตรวจ host = ep-plain-art ก่อน)
pnpm exec prisma migrate deploy
  → Applying migration `20260924000000_kanban_v2_f` … All migrations have been successfully applied.
pnpm exec prisma generate → Generated Prisma Client (v7.8.0)

pnpm exec tsx scripts/qc-kanban-k1.8.mts
  → ผ่าน 18/18 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":18,"passed":18,"findings":[]}

regressions (รันซ้ำ **หลัง** ล้างข้อมูลจากการถ่ายภาพ):
  k1.1 {"total":30,"passed":30,"findings":[]}   k1.2 {"total":25,"passed":25,"findings":[]}
  k1.3 {"total":29,"passed":29,"findings":[]}   k1.4 {"total":30,"passed":30,"findings":[]}
  k1.5 {"total":17,"passed":17,"findings":[]}   k1.6 {"total":20,"passed":20,"findings":[]}
  k1.7 {"total":21,"passed":21,"findings":[]}   k1.8 {"total":18,"passed":18,"findings":[]}
  qc-kanban-notify → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → exit 0 (ไม่มี error)
pnpm exec tsx scripts/fitness.mts → JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
  (ต้อง export DATABASE_URL/DIRECT_URL/SESSION_SECRET ของ .env.qc ก่อน ไม่งั้น F10.1 ตกเพราะ env ว่าง ไม่ใช่เพราะโค้ด)

bash scripts/acc-v2-serve.sh → ✅ พร้อมใช้งานที่ http://127.0.0.1:3215
pnpm exec tsx scripts/visual-kanban.mts 1.8
  → JSON_SUMMARY {"wo":"1.8","user":"owner","shots":[".qc-shots/kanban/1.8/comment-mention-menu-desktop.png",".qc-shots/kanban/1.8/comment-posted-desktop.png",".qc-shots/kanban/1.8/comment-posted-mobile.png"],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว
```

## Verify — ภาพจริง (เปิดดูเองทีละใบ)

- `comment-mention-menu-desktop.png` — พิมพ์ "… @ธ" แล้วเมนู `mention-menu` เด้งเหนือช่องเขียน 2 รายชื่อ (ธนา ศรีสมบัติ ไฮไลต์บนสุด · "พนักงานไม่มีสิทธิ์บอร์ด" ที่มี "ธ" ในคำว่า *สิทธิ์*) พร้อม avatar อักษรย่อ ตรงแบบ popover ของโมดูล
- `comment-posted-desktop.png` — บล็อก "ความเห็น 1" ใต้เช็คลิสต์: avatar + ชื่อผู้เขียน + เวลาไทย "อา. 6 ก.ย. 2569 · 09:07" + ปุ่ม แก้ไข/ลบ + เนื้อความที่มีชิป `@ธนา ศรีสมบัติ` สีน้ำเงิน + ช่องเขียน placeholder ตามแบบ + ปุ่ม "ส่ง" (สีจางเพราะช่องว่าง = disabled) — โครงตรงบล็อกล่างของ mockup 03 (ต่างที่ยังไม่มีแท็บ/บรรทัดกิจกรรม = K1.10)
- `comment-posted-mobile.png` (390px) — สแต็กแนวตั้งอ่านครบ ไม่ล้นจอ · ช่องเขียนกว้างเต็ม + ปุ่มส่งข้างขวา
- **คืนสภาพ seed หลังถ่าย**: ลบความเห็น 2 ใบ + สมาชิกบอร์ดที่ถูกเพิ่มอัตโนมัติ 1 คน (ธนา จากการ mention) + AppNotification 3 + OutboxEvent 3 ผ่าน one-off `scripts/tmp-k18-cleanup.mts` (ลบไฟล์ทิ้งแล้ว) → ตรวจซ้ำ: `leftComments=0 · leftMembers=0 · cardTitle` เดิม · การ์ด ACTIVE บอร์ดป่าตอง 24 ใบ → แล้วรัน oracle ทั้งชุดใหม่อีกรอบ (เขียวหมดตามด้านบน)

## จุดที่อยากให้ Fable ลองแหย่

- **mention ข้ามร้าน / ข้ามระบบ**: ยัด `@[x](userId ของร้านอื่น)` — ควรถูกกรองทิ้งตั้งแต่ `resolveMentions` (ไม่มีแถว Membership) ⇒ ไม่มีทั้งแจ้งเตือนและ auto-VIEWER
- **auto-VIEWER กับคนที่ไม่มีสิทธิ์โมดูล** (`noPerm`): ตั้งใจ **ไม่เพิ่ม** ให้ (เพิ่มไปก็เปิดบอร์ดไม่ได้) แต่ยัง "แจ้งเตือน" อยู่ — ถ้าถือว่าไม่ควรแจ้งเลย บอกได้ แก้บรรทัดเดียวใน `notifyMentions`
- **บอร์ดสมาชิกเต็ม 50**: mention คนที่ 51 → ไม่ได้สิทธิ์ (ไม่ throw) แต่ยังได้แจ้งเตือน (ลิงก์จะ 404 สำหรับเขา) — เลือกทางนี้เพราะการคอมเมนต์ไม่ควรล้มเพราะโควตาสมาชิก
- **แข่งกันคอมเมนต์พร้อมกัน**: ไม่มีตัวนับ/ธงที่ต้องล็อก (ต่างจาก `toggleItem` ของ K1.7) — ตราจำนวนความเห็นคำนวณสด ๆ ตอนอ่าน
- **PDPA**: `deleteComment` เป็น soft delete ⇒ เนื้อความยังอยู่ในตาราง (ตั้งใจ เพื่อ K1.10) · `listComments` เท่านั้นที่กรองออก — ถ้าอยากให้ล้างจริงต้องมีนโยบาย retention เหมือน chat

ความคืบหน้า P1: 8/15
