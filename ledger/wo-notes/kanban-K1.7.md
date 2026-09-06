# K1.7 — เช็คลิสต์ · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.7 · oracle `scripts/qc-kanban-k1.7.mts` (21 ข้อ, ไม่แก้) · ภาพ `scripts/visual-kanban.mts 1.6` (ใช้ spec เดิมของ K1.6 ตามคำสั่ง WO) · mockup `ledger/design-kanban/03-card-back.png`

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260923000000_kanban_v2_e/migration.sql` — CREATE TABLE `KanbanChecklist`/`KanbanChecklistItem` + index + FK (additive ล้วน)
- `src/lib/modules/kanban/checklists.ts` — service เต็มของโมดูล (schema ด้านล่าง)
- `src/components/kanban/Checklist.tsx` — UI client component (mount ใน `CardBack`)

**แก้**
- `prisma/schema/kanban.prisma` — เพิ่ม model `KanbanChecklist`/`KanbanChecklistItem` + relation field `KanbanCard.checklists`
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanChecklist: tenant` · `KanbanChecklistItem: tenant` (ไม่มี `systemId` ในตาราง — เหตุผลเดียวกับ `KanbanCardLabel`/`KanbanBoardMember`: การ์ด/บอร์ดต้นทางรู้ระบบของตัวเองอยู่แล้ว)
- `src/lib/modules/kanban/members.ts` — `export` ให้ `loadActor` (เดิม private) เพราะ `checklists.ts#listMyChecklistItems` ต้องคำนวณ "บอร์ดที่ผู้เรียกมองเห็น" เอง (ดูส่วน "การตัดสินใจ" ด้านล่าง)
- `src/lib/modules/kanban/types.ts` — เพิ่ม `KanbanChecklistItemDto` `KanbanChecklistDto` `MyChecklistItemDto` · ขยาย `CardDetailDto` ด้วยฟิลด์ `checklists: KanbanChecklistDto[]`
- `src/lib/modules/kanban/cards.ts` — `getCardDetail` เรียก `getCardChecklists` เพิ่มเข้า DTO · `duplicateCard` ก็อปเช็คลิสต์ทั้งหมด (รายการ "ยังไม่ทำ" ทั้งหมด ไม่มีผู้รับมอบหมาย — คง `dueAt` เดิมไว้)
- `src/lib/modules/kanban/service.ts` — `toBoardCardDto` รับพารามิเตอร์ที่ 4 `checklist?: {done,total}` (ค่าเริ่มต้น 0/0) · `getBoardView` ดึงผลรวม n/m ของทุกการ์ดด้วย 1 raw query (join+group by `cardId`) ไม่ใช่ต่อการ์ด (กัน N+1)
- `src/lib/modules/kanban/actions.ts` — เพิ่ม 8 action ของเช็คลิสต์ (ท้ายไฟล์) + import `checklistProgressOfCard` มาใช้ใน `duplicateCardAction`/`restoreCardAction` (ให้ตรา n/m ของการ์ดที่เพิ่งคืนค่าถูกต้องทันที)
- `src/lib/modules/kanban/ui.tsx` — `KanbanMyTasksSection` เพิ่มบล็อก "รายการเช็คลิสต์ที่มอบหมายให้ฉัน" (ใช้ `listMyChecklistItems`) คู่กับ "งานของฉัน" เดิม
- `src/lib/outbox-consumers.ts` — ลงทะเบียน `"kanban.checklist.completed": withAutomation(async () => {})` (no-op ปิด event เป็น DONE + จุดให้ automation/webhook ยิงต่อ)
- `src/lib/automation/labels.ts` — เพิ่ม `{ value: "kanban.checklist.completed", label: "เมื่อเช็คลิสต์ครบทุกข้อ" }` ใน `AUTOMATION_EVENTS` (spread เข้า `WEBHOOK_EVENTS` อัตโนมัติ)
- `src/components/kanban/CardBack.tsx` — เปิดใช้ชิป "เช็คลิสต์" (เดิม `disabled`) → `window.prompt` ชื่อ default "ขั้นตอนงาน" → `createChecklistAction` · mount `<Checklist>` ใต้บล็อกรายละเอียด · `onChecklistsChange` sync `fields.checklists` + คำนวณ `checklistDone/checklistTotal` ผ่าน `checklistBadgeOf` แล้ว `handlers.onPatch` ให้ตัวการ์ดบนบอร์ดอัปเดตทันที (ไม่ต้องรอ reload)

## Schema

```sql
CREATE TABLE "KanbanChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KanbanChecklist_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KanbanChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KanbanChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KanbanChecklist_cardId_idx" ON "KanbanChecklist"("cardId");
CREATE INDEX "KanbanChecklistItem_checklistId_idx" ON "KanbanChecklistItem"("checklistId");
CREATE INDEX "KanbanChecklistItem_tenantId_assigneeUserId_done_idx" ON "KanbanChecklistItem"("tenantId", "assigneeUserId", "done");
-- FK cardId → KanbanCard(id) ON DELETE CASCADE · checklistId → KanbanChecklist(id) ON DELETE CASCADE
```

ไม่มี `systemId` บนตารางใด (ตรงสัญญา K1.7 เป๊ะ — ตรวจ `systemId` ผ่านการ์ด/เช็คลิสต์ต้นทางเสมอในทุก `requireChecklist`/`requireItem`) · additive ล้วน ไม่แตะตารางเดิม · ตรวจด้วยตาแล้วไม่มี `DROP`/`ALTER … TYPE`

## Function map (`checklists.ts`)

ทุกฟังก์ชันเขียนผ่าน `assertCardRole(ctx, cardId, "EDITOR")` (มองไม่เห็นบอร์ด → `KanbanNotFoundError` 404 · เห็นแต่ต่ำกว่า EDITOR → `KanbanForbiddenError` 403) — อ่านอย่างเดียวใช้ `"VIEWER"`:

| ฟังก์ชัน | สิทธิ์ | หน้าที่ |
|---|---|---|
| `createChecklist(ctx, cardId, title)` | EDITOR | สร้างชุดใหม่ท้ายการ์ด (ชื่อว่าง → "ขั้นตอนงาน") |
| `renameChecklist(ctx, id, title)` | EDITOR | เปลี่ยนชื่อชุด (ว่าง → error ไทย) |
| `deleteChecklist(ctx, id)` | EDITOR | ลบทั้งชุด (cascade รายการข้างใน) |
| `addItem(ctx, checklistId, text, {assigneeUserId?, dueAt?})` | EDITOR | เพิ่มรายการท้ายชุด · assignee ต้องเป็น Membership accepted ของร้าน (ไม่งั้น error ไทย) · รวมทุกชุดของการ์ดเดียวกัน ≤ `KANBAN_LIMITS.checklistItemsPerCard` (50) |
| `editItem(ctx, itemId, {text?, assigneeUserId?, dueAt?})` | EDITOR | แก้ทีละฟิลด์ (optional) |
| `deleteItem(ctx, itemId)` | EDITOR | ลบรายการ |
| `toggleItem(ctx, itemId, done)` | EDITOR | ติ๊ก/ปลด — ดู "event" ด้านล่าง |
| `moveItem(ctx, itemId, {beforeItemId?, afterItemId?})` | EDITOR | เรียงลำดับใหม่ด้วย `ordering.ts#keyBetween` (ไม่ระบุ = ไปท้ายสุด) |
| `getCardChecklists(ctx, cardId)` | VIEWER | `[{id,title,position,items[],progress:{done,total}}]` เรียงตาม position |
| `checklistProgressOfCard(ctx, cardId)` | VIEWER (ผ่าน getCardChecklists) | ผลรวม `{done,total}` ทุกชุดของการ์ด — ใช้ตอนคืนการ์ดเดี่ยวจาก action |
| `listMyChecklistItems(ctx, userId)` | — (ไม่ใช่ mutation) | รายการที่มอบหมายให้ `userId` เฉพาะ `done=false` และเฉพาะบอร์ดที่ **ผู้เรียก** (`ctx.actorUserId`) มองเห็น — ดูเหตุผลด้านล่าง |

## การตัดสินใจที่ไม่ได้เขียนตรง ๆ ในสัญญา

**`listMyChecklistItems` กรองด้วยการมองเห็นของใคร?** สัญญาระบุแค่ "(เฉพาะ done=false บอร์ดที่ actor มองเห็น)" โดยไม่ชัดว่า "actor" คือผู้เรียก (`ctx.actorUserId`) หรือเจ้าของงาน (`userId` พารามิเตอร์) เมื่อสองค่านี้ต่างกัน oracle S4.1/S4.2 เรียกด้วย `owner` ctx แต่ขอรายการของ `pook` (พนักงานที่ไม่ได้เป็นสมาชิกบอร์ด PRIVATE ใบนั้นโดยตรง) และคาดหวังให้เห็นรายการ — ตัดสินใจกรองด้วย **ผู้เรียก** (`loadActor(ctx)`) ไม่ใช่เจ้าของงาน เพราะ (1) ตรงกับพฤติกรรมที่ oracle ต้องการจริง (ลองกรองด้วยเจ้าของงานก่อน → S4.2 ตก เพราะ pook ไม่เห็นบอร์ดป่าตองเป็นบอร์ดสมาชิกโดยตรง) (2) สมเหตุสมผลกับการใช้งานจริงคือหน้า "งานของฉัน" ที่ `ctx.actorUserId === userId` เสมอ (ผลลัพธ์เหมือนเดิมทุกกรณีปกติ) แต่ยังเปิดช่องให้ OWNER/ผู้ดูแลเปิดดูแทนพนักงานคนอื่นได้ในขอบเขตบอร์ดที่ตัวเองมองเห็น (สอดคล้องกับที่ OWNER เห็นทุกบอร์ดอยู่แล้ว)

**เพดาน 50 รายการ**: นับรวมทุกชุดของการ์ดเดียวกัน (ไม่ใช่ต่อชุด) ตรงกับ oracle S5.1 ที่เติมชุดแรก 3 รายการ + ชุดที่สอง 47 รายการ = 50 พอดี แล้วรายการที่ 51 ถูกปฏิเสธ

**ทำสำเนาการ์ด**: คัดลอกเช็คลิสต์ด้วย raw prisma ตรง ๆ ใน tx เดียวกับตัวการ์ด (ไม่เรียกผ่าน `createChecklist`/`addItem` ของ `checklists.ts`) เพื่อเลี่ยง (1) ยิง assertion สิทธิ์ซ้ำโดยไม่จำเป็น (2) เผลอ trigger completion-detection/outbox ของ `toggleItem` ตอนสร้างรายการที่ "done" (เราตั้งใจ reset เป็น false เสมอ) · ตำแหน่ง (`position`) เอาค่าเดิมมาใช้ตรง ๆ ได้เพราะ fractional index เทียบกันแค่ภายในขอบเขตเดียวกัน (checklist/card เดียวกัน) — checklist/รายการใหม่มี id ใหม่ จึงไม่ชนกับของเดิม

## Event + idempotency

`toggleItem` ตรวจ **transition** ไม่ใช่ทุกครั้งที่ toggle: อ่านสถานะ done ของทุกรายการในชุดก่อนอัปเดต (`preComplete`) → อัปเดตรายการ → คำนวณสถานะหลังอัปเดตจากตัวเลขเดิม (`postComplete`) → ยิง outbox เฉพาะเมื่อ `!preComplete && postComplete` (จากไม่ครบ → ครบ) ทั้งหมดในทรานแซกชันเดียว กันกรณี toggle รายการอื่นตอนชุดครบอยู่แล้วไม่ให้ยิงซ้ำ และให้ "ครบใหม่" หลังติ๊กออกแล้วติ๊กกลับยิง event ใบใหม่เสมอ

```ts
idempotencyKey: `kanban.checklist.completed#${item.checklistId}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`
payload: { checklistId, cardId }
```

มี checklistId ฝังในคีย์เสมอ (oracle เช็ค `.includes(l1.id)`) + เวลา + สุ่มท้ายกันชนกันเวลา 2 ครั้งอยู่ในมิลลิวินาทีเดียวกัน — consumer ที่ `outbox-consumers.ts` เป็น no-op (ผลข้างเคียงเกิดในทรานแซกชันไปแล้ว) แค่ปิด event เป็น DONE + เปิดทางให้ automation/webhook ยิงต่อ · ป้ายไทยลงทะเบียนที่ `automation/labels.ts` → "เมื่อเช็คลิสต์ครบทุกข้อ"

## Actions (`actions.ts`, object args, `*Action` เท่านั้น)

`createChecklistAction` `renameChecklistAction` `deleteChecklistAction` `addChecklistItemAction` `toggleChecklistItemAction` `editChecklistItemAction` `deleteChecklistItemAction` `moveChecklistItemAction` — ทุกตัวคืน `{ok:true, checklists: KanbanChecklistDto[]}` (เช็คลิสต์**ทั้งชุด**ของการ์ด ไม่ใช่ patch ย่อย เพราะข้อมูลเล็ก ≤50 รายการ/การ์ด อ่านใหม่ทั้งหมดปลอดภัยกว่าประกอบ patch เองฝั่ง client) หรือ `{ok:false, message}`

## UI (`Checklist.tsx` + `CardBack.tsx`)

testid: `checklist` (ทั้ง container และแต่ละชุด) `checklist-item` `checklist-progress` — ข้อความ "ซ่อนรายการที่ทำแล้ว" ตรงตัว (สลับเป็น "แสดงรายการที่ทำแล้ว" เมื่อเปิดซ่อนอยู่)

- ต่อชุด: หัวข้อ (คลิกแก้ในที่, blur/Enter บันทึก) + `n/m` + แถบความคืบหน้า (สีเขียวเมื่อ 100%) + ปุ่มลบชุด (confirm) + "ซ่อนรายการที่ทำแล้ว"
- ต่อรายการ: checkbox (optimistic) · ข้อความ (คลิกแก้ในที่) · ชิปกำหนดวัน (แดงถ้าเลยกำหนดและยังไม่เสร็จ / อำพันถ้ายังไม่ถึง / ไอคอนนาฬิกาจาง ๆ ถ้ายังไม่ตั้ง) คลิกแก้ได้ · avatar ผู้รับมอบหมาย (popover เลือกจากสมาชิกบอร์ด) · ปุ่ม ↑↓ ย้ายลำดับ (ปิดเมื่อซ่อนรายการที่ทำแล้วอยู่ — กันสับสนเรื่องเพื่อนบ้านที่ถูกซ่อน) · ปุ่มลบ
- เพิ่มรายการ: input ท้ายรายการ, Enter เพิ่มแล้ว refocus (พิมพ์ต่อได้ทันที)
- เพิ่มเช็คลิสต์: ชิป "เช็คลิสต์" ที่แถว "เพิ่ม:" ของ `CardBack` (prompt ชื่อ default "ขั้นตอนงาน") + ปุ่ม "+ เพิ่มเช็คลิสต์" ท้ายบล็อกใน `Checklist.tsx` เอง (ทำให้เพิ่มชุดที่ 2/3/… ได้โดยไม่ต้องเลื่อนกลับขึ้นไปบนสุด)
- ทุกการแก้ไข optimistic (แปะ state ก่อนยิง action) → error → revert + toast (แพตเทิร์นเดียวกับ `CardBack.tsx` เดิม)
- `Card.tsx` (K1.5) มีตรา `n/m` อยู่แล้วจากพิมพ์เขียวเดิม (`card.checklistDone/checklistTotal`) — งานนี้แค่ทำให้ `service.getBoardView` ป้อนค่าจริงแทน `0/0` ที่ hardcode ไว้

## ai-my-tasks (`ui.tsx`)

`KanbanMyTasksSection` เพิ่ม `Section` ที่สอง "รายการเช็คลิสต์ที่มอบหมายให้ฉัน (n)" ใต้ "งานของฉัน" เดิม — แถวละ 1 รายการ ลิงก์ `/app/sys/{id}/kanban/b/{boardId}?card={cardId}` (เปิดหลังการ์ดตรง) · secondary = ชื่อการ์ด + `#cardNo` · trailing = กำหนดส่งถ้ามี

## Verify — ภาพจริง

`bash scripts/acc-v2-serve.sh` (production build :3215) → สร้างเช็คลิสต์ 5 รายการ (3 เสร็จ, 2 รายการมีกำหนดวัน+ผู้รับมอบหมาย) บนการ์ดที่ 7 ของบอร์ดป่าตอง ผ่าน one-off tsx เรียก `checklists.ts` ตรง ๆ (`scripts/tmp-k17-visual-seed.mts` + `tmp-k17-visual-due.mts` — ลบทิ้งหลังใช้แล้ว ไม่ commit) → `pnpm exec tsx scripts/visual-kanban.mts 1.6` → เปิดภาพ PNG ด้วย Read เทียบ `03-card-back.png`:

- `.qc-shots/kanban/1.6/card-back-desktop.png` — บล็อก "ขั้นตอนงาน 3/5" + แถบความคืบหน้าสีน้ำเงิน (60%) + 3 รายการ strikethrough สีเทา+ติ๊กเขียว + 2 รายการยังไม่ทำมีชิปกำหนดวันสีอำพัน + avatar อักษรย่อ (ธ/ป) + input "+ เพิ่มรายการ" + ปุ่ม "+ เพิ่มเช็คลิสต์" + บรรทัดอธิบายท้ายบล็อก ตรงโครง mockup ทุกจุด
- `.qc-shots/kanban/1.6/card-back-mobile.png` — บล็อกเดียวกัน layout สแต็กแนวตั้งอ่านง่าย ไม่ล้นจอ 390px
- `.qc-shots/kanban/1.6/card-back-edit-title-desktop.png` — แก้ชื่อการ์ดยังทำงานปกติ (regression K1.6) เช็คลิสต์ไม่หาย
- `.qc-shots/kanban/path/custom-desktop.png` (หน้าบอร์ด `/kanban/b/{patong}`) — การ์ด "ทำใบเสนอราคาทริปเรือ Sea Fox" ในคอลัมน์ "รอทำ" โชว์ตรา "3/5" พร้อมไอคอนเช็คลิสต์ ยืนยันว่า `getBoardView`→`toBoardCardDto`→`Card.tsx` ต่อกันจริงแบบ end-to-end ไม่ใช่แค่ผ่าน oracle

หลังถ่ายภาพ: ลบเช็คลิสต์ที่สร้างไว้ (`deleteChecklist` ทุกชุดของการ์ด) + คืนชื่อการ์ดกลับเป็น "ทำใบเสนอราคาทริปเรือ Sea Fox — 3 วัน 2 คืน" (harness เปลี่ยนชื่อระหว่างสเต็ป `card-back-edit-title`) → ตรวจซ้ำด้วย query ตรง (`title` ตรง, `checklists=0`) → ลบ one-off scripts ทั้งหมด → `bash scripts/acc-v2-serve.sh stop`

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… APP_ENV=development && pnpm exec prisma migrate deploy
  → Applying migration `20260923000000_kanban_v2_e` … All migrations have been successfully applied.
pnpm exec prisma generate → Generated Prisma Client (v7.8.0)

pnpm exec tsx scripts/qc-kanban-k1.7.mts
  → ผ่าน 21/21 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":21,"passed":21,"findings":[]}

bash scripts/acc-v2-serve.sh   → ✅ พร้อมใช้งานที่ http://127.0.0.1:3215
pnpm exec tsx scripts/visual-kanban.mts 1.6
  → 3 shots, failures 0
  → JSON_SUMMARY {"wo":"1.6","user":"owner","shots":[".qc-shots/kanban/1.6/card-back-desktop.png",".qc-shots/kanban/1.6/card-back-mobile.png",".qc-shots/kanban/1.6/card-back-edit-title-desktop.png"],"failures":0}
pnpm exec tsx scripts/visual-kanban.mts path "/app/sys/<sys>/kanban/b/<patong>" → failures 0 (ตรวจตรา n/m บนบอร์ด)
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว

pnpm exec tsx scripts/qc-kanban-k1.6.mts  → ผ่าน 20/20 (static+action) · ส่วนภาพ (spec เดิม) → ผ่าน 20/20 · CRITICAL 0 · MAJOR 0
  → JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
pnpm exec tsx scripts/qc-kanban-k1.5.mts  → ผ่าน 17/17 · JSON_SUMMARY {"total":17,"passed":17,"findings":[]}
pnpm exec tsx scripts/qc-kanban-k1.3.mts  → ผ่าน 29/29 · JSON_SUMMARY {"total":29,"passed":29,"findings":[]}
pnpm exec tsx scripts/qc-kanban-k1.2.mts  → ผ่าน 25/25 · JSON_SUMMARY {"total":25,"passed":25,"findings":[]}
pnpm exec tsx scripts/qc-kanban-k1.1.mts  → ผ่าน 30/30 · JSON_SUMMARY {"total":30,"passed":30,"findings":[]}
pnpm exec tsx scripts/qc-kanban-notify.mts → QC Kanban Notify: 12/12 ผ่าน · เขียวหมด
pnpm exec tsx scripts/qc-ai-kanban-board.mts → ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

pnpm exec tsc --noEmit → (ไม่มี error)

pnpm exec tsx scripts/fitness.mts → ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
  (หมายเหตุ: fitness.mts ไม่แตะ DB/env — รันครั้งเดียวเท่ากับทุกโหมด ไม่มี branch ตาม APP_ENV ในสคริปต์)
```

## หนี้/หมายเหตุที่จดไว้

- `assertAssigneeIsMember` ใน `checklists.ts` ซ้ำกับ `assertMembers` (private) ใน `cards.ts` โดยเจตนา — ไม่ export ตัวเดิมออกมาใช้ร่วมเพราะ logic สั้นมาก (≤10 บรรทัด) และเลี่ยงพึ่งพาไฟล์อื่นเพิ่มโดยไม่จำเป็น
- assignee picker ของรายการเช็คลิสต์ใช้รายชื่อจาก `members` prop เดียวกับตัวการ์ด (= สมาชิกบอร์ด ∪ ผู้รับผิดชอบการ์ดทั้งบอร์ด) ไม่ใช่ "พนักงานทั้งร้าน" แม้ backend (`assertAssigneeIsMember`) ยอมรับพนักงานทั้งร้าน — จำกัดเจตนาให้ตรงกับ UX เดิมของ "ผู้รับผิดชอบ" การ์ดใน K1.6 (คนละพฤติกรรมกับ backend ตรง ๆ แต่เป็น pattern เดิมที่มีอยู่แล้ว ไม่ใช่สิ่งใหม่จาก WO นี้)
- ปุ่มย้ายลำดับ ↑↓ ปิดเมื่อ "ซ่อนรายการที่ทำแล้ว" เปิดอยู่ (กันสับสนเรื่องเพื่อนบ้านจริงที่ถูกซ่อน) — ตามสัญญาที่ระบุว่าปุ่มลูกศรแทนลากวางเป็นทางเลือกที่ยอมรับได้อยู่แล้ว
- ยังไม่ได้ทำ K1.15 (REST/AI ops ของเช็คลิสต์) — ตาม D15 ของแผน จะรวมทำหลัง K1.10

ความคืบหน้า P1: 7/15
