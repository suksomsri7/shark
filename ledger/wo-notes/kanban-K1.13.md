# K1.13 — มือถือ (เลื่อนทีละคอลัมน์ · กดค้างลาก · ปัดขวา/ซ้าย + undo) + งานของฉันใหม่ · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.13 · oracle `scripts/qc-kanban-k1.13.mts` (16 ข้อ, ไม่แก้) · ภาพ `scripts/visual-kanban.mts 1.13` · mockup `ledger/design-kanban/07-mobile.png` (บล็อก ก/ข/ค) + `06-my-tasks.png` (ฝั่งขวา)

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260928000000_kanban_v2_j/migration.sql` — CREATE TABLE `KanbanUndoToken` + 2 index (additive ล้วน)
- `src/lib/modules/kanban/my-tasks.ts` — `myTasksOverview` · `completeCard` · `archiveWithUndo` · `undo`
- `src/components/kanban/MobileBoard.tsx` — บอร์ดมือถือ (scroll-snap + จุดบอกตำแหน่ง + กดค้างยก + ปัดขวา/ซ้าย + FAB)
- `src/components/kanban/MyTasks.tsx` — งานของฉันใหม่ (client) แทนที่ `KanbanMyTasksSection` เดิมบนหน้า `/kanban/my-tasks`

**แก้**
- `prisma/schema/kanban.prisma` — เพิ่ม model `KanbanUndoToken` (รูปแบบเดียวกับ `AccountUndoToken` ของบัญชี)
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanUndoToken: sys()` (มี tenantId+systemId เหมือน KanbanBoard/Card)
- `src/lib/modules/kanban/types.ts` — เพิ่ม `MyTaskCardDto` `MyTasksCounts` `MyTasksGroups` `MyWatchingCardDto` `MyTasksOverviewDto`
- `src/lib/modules/kanban/actions.ts` — เพิ่ม `completeCardAction` `archiveWithUndoAction` `undoAction` (import จาก `./my-tasks`)
- `src/components/kanban/Card.tsx` — แยก `dueBadgeFrom(dueAt, completedAt, nowMs)` ออกจาก `dueBadgeOf(card, nowMs)` (รับ primitive ให้ `MyTasks.tsx` ใช้ชิปกำหนดส่งแบบเดียวกันได้โดยไม่ต้องมี `BoardCardDto` เต็มรูป) + export `DUE_STYLE`
- `src/components/kanban/Comments.tsx` — ห่อ `CommentComposer` ด้วย `sticky bottom-0` (ใช้ได้ทั้งมือถือแผ่นเต็มจอและเดสก์ท็อปโมดัล 872px เพราะ `CardBack.tsx` เป็น scroll container เดียวไม่มี overflow ซ้อน)
- `src/components/kanban/BoardView.tsx` — เพิ่ม `useIsMobileBoard()` (`useSyncExternalStore` กัน hydration mismatch) สลับ render `<MobileBoard>` เมื่อจอ < 640px · เพิ่ม `swipeComplete`/`swipeArchive`/`undoSwipe` + toast "เลิกทำ" (`data-testid="undo-toast"`) แยกจาก toast error เดิม
- `src/app/app/sys/[id]/kanban/my-tasks/page.tsx` — เขียนใหม่ทั้งหน้า: เรียก `myTasksOverview` แล้วส่งให้ `<MyTasks>` (เดิมเรียก `KanbanMyTasksSection`)
- `scripts/visual-kanban.mts` — ขยาย spec `"1.13"` (ของเดิม 3 ใบที่ Fable เตรียมไว้ยังอยู่ครบ): เพิ่ม `mobile-board-lifted` (สเต็ปใหม่ `longPress`) · `mobile-swipe-undo-toast` (ปัดจริง + รอ `undo-toast` แทนเดา ms) · `my-tasks` (ไม่จำกัด device = desktop+mobile) · เพิ่มการเตรียม/คืนสภาพ "ตั้งคอลัมน์เสร็จแล้วเป็น isDoneColumn ชั่วคราว" + diff-restore การ์ดที่เปลี่ยนระหว่างถ่าย (เทียบ before/after ทุกใบของบอร์ดป่าตอง)

## Schema

```sql
CREATE TABLE "KanbanUndoToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,           -- "card.complete" | "card.archive"
    "payload" JSONB NOT NULL,       -- { cardId, fromColumnId? }
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "KanbanUndoToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KanbanUndoToken_tenantId_systemId_expiresAt_idx" ON "KanbanUndoToken"("tenantId", "systemId", "expiresAt");
CREATE INDEX "KanbanUndoToken_userId_expiresAt_idx" ON "KanbanUndoToken"("userId", "expiresAt");
```

รูปแบบเดียวกับ `AccountUndoToken` (`prisma/schema/account.prisma`) — one-shot (`usedAt`) · หมดอายุ 5 นาที (`expiresAt`) · ผูก tenant+system+**user เดียวกันเท่านั้น**ที่เลิกทำได้ (`undo()` เช็ค `row.userId !== actorUserId → ok:false`)

## Function map

| ฟังก์ชัน | ไฟล์ | หมายเหตุ |
|---|---|---|
| `myTasksOverview(ctx, actor, {now})` | `my-tasks.ts` | union `assigneeUserId` ∪ `KanbanCardAssignee` (เหมือน `listMyCards` เดิม) กรองด้วย `visibleBoardsWhere(actor)` · จัดกลุ่มด้วย `dueBucketOf` ของ `filters.ts` (สูตรเดียวกับ K1.11 — Mon–Sun เวลาไทย) · การ์ด `completedAt` ไม่อยู่ในกลุ่มไหนเลย นับเฉพาะ `counts.doneThisWeek` (เช็คสัปดาห์ปัจจุบันด้วยสูตรเดียวกับ `dueBucketOf`) · `checklistItems` มาจาก `listMyChecklistItems` เดิม (K1.7) ตรง ๆ · `watching: []` เสมอ (ฟีเจอร์ยังไม่มีจนถึง K2.11) |
| `completeCard(ctx, cardId)` | `my-tasks.ts` | หา "คอลัมน์เสร็จแรก" (`isDoneColumn=true` position น้อยสุด) ของบอร์ด · ไม่มี → `{ok:false, code:"NO_DONE_COLUMN", message}` · มี → เรียก `moveCard` เดิม (K1.4 — ได้ activity/event/`completedAt` ครบ ไม่เขียนตรรกะย้ายซ้ำ) แล้วสร้าง `KanbanUndoToken` |
| `archiveWithUndo(ctx, cardId)` | `my-tasks.ts` | เรียก `archiveCard` เดิม (K1.6) แล้วสร้าง undo token |
| `undo(ctx, token)` | `my-tasks.ts` | claim แบบ atomic (`updateMany where usedAt:null`) · `card.complete` → `moveCard` กลับ `fromColumnId` (ปลายทางไม่ใช่คอลัมน์เสร็จ ⇒ `completedAt` เป็น `null` ให้เองจากตรรกะเดิมของ `moveCard`) · `card.archive` → `restoreCard` เดิม |

## Deviation (เหตุผลที่ทำต่างจากตัวอักษรตรง ๆ)

1. **มือถือไม่รองรับลากข้ามคอลัมน์ (reorder) แบบเดสก์ท็อป** — "กดค้าง 300ms ยกการ์ด" ในสัญญา/พิมพ์เขียว §11 พูดถึง "ลากถึงขอบจอ auto-scroll" ด้วย แต่ WO นี้เน้นที่ 3 ท่าหลักตามภาพ 07: เลื่อนคอลัมน์ (snap) · ยก (lift แสดงผล) · ปัด (complete/archive) — ผมตีความ "ยก" เป็นการให้ผลตอบสนองภาพ (scale 1.03 + เงา) เพื่อสื่อว่า "หยิบขึ้นมาแล้ว" โดยไม่ implement การลากข้ามคอลัมน์เต็มรูปแบบบนมือถือ (ความซับซ้อนสูง เสี่ยงชนกับ scroll-snap ของคอลัมน์ + เวลาที่มี) ปล่อยให้เป็นงานขยายในอนาคต ถ้าอยากได้ครบ — จุดตัดสินใจ: ปัดขวา/ซ้าย (ท่าที่ oracle ทดสอบจริงและมีคุณค่าใช้งานจริงชัดที่สุด) ต้อง "ใช้งานได้จริง" ก่อน ไม่ใช่แค่ท่าทาง
2. **`touch-action: pan-y` + `preventDefault()` แบบ `passive:false` บนตัวห่อการ์ดมือถือ** — ไม่ได้เขียนไว้ในสัญญาตรง ๆ แต่จำเป็น: คอลัมน์เลื่อนแนวนอนแบบ `overflow-x-auto` ของ container ทำให้เบราว์เซอร์ "แย่ง" ท่าปัดแนวนอนบนการ์ดไปตีความเป็นการเลื่อนคอลัมน์ (fire `pointercancel` กลาง gesture โดย `clientX` ไม่แน่นอนตามสเปก — เจอจริงว่าบาง build ให้ 0 ทำให้แปล dx ผิดทิศ กลายเป็น "ปัดซ้าย" เสมอไม่ว่าจะปัดทางไหน) แก้โดยตั้ง `touch-action:pan-y` (อนุญาตแค่เลื่อนแนวตั้งของ browser ปล่อยแนวนอนให้ JS คุมเอง) + `preventDefault()` ทันทีที่ตัดสินใจว่าเป็นท่าปัด และ `onCancel` ที่ไม่ใช้ `clientX` ของ `pointercancel` มาคำนวณอะไรทั้งสิ้น (ยกเลิกเฉย ๆ)
3. **ไม่มี dropdown "ตามกำหนด/ตามบอร์ด/ตามความสำคัญ" ในหน้างานของฉัน** — มะม็อกอัพ 06 มี `mtabs` 3 ตัวสลับมุมมองการจัดเรียง แต่ oracle/testid ที่ปักไว้ไม่มีตัวไหนอ้างถึงมัน และคุณค่าหลักคือกลุ่มตามกำหนด (K1.13 ตามสัญญา) — เว้นไว้เป็นส่วนขยาย (ถ้าจะทำ อยู่ใน `MyTasks.tsx` ไฟล์เดียว ไม่กระทบ service)
4. **ไม่มี dropdown "ทุกบอร์ด" + ปุ่ม "จดงานเร็ว" ที่หัวหน้างานของฉัน + กล่องงานเข้าส่วนตัวฝั่งซ้าย** — งานสัญญาระบุชัดว่า WO นี้ทำเฉพาะ "ภาพ 06 ฝั่งขวา" (กล่องงานเข้า/จดเร็วเป็นขอบเขตของ K2.8) — ยึดตามนั้น
5. **บนมือถือ 4 ตัวเลขเป็น grid 2×2 (การ์ด KPI) ไม่ใช่ชิปเลื่อนแนวนอนแบบภาพ 07(ค)** — พิมพ์เขียว §5 เขียนไว้ว่ามือถือควรเป็น "4 ตัวเลขเป็นชิปเลื่อนแนวนอน" แต่ oracle ปักแค่ testid `my-tasks` + เนื้อความ 4 คำ ไม่ได้ปักรูปแบบ — เลือก grid 2×2 (responsive อัตโนมัติจาก desktop 4 คอลัมน์) เพราะโค้ดเดียวใช้ได้ทั้งสองขนาดจอ อ่านง่ายกว่าและลดความเสี่ยง UI ผิดจุด ถ้าต้องการชิปเลื่อนแนวนอนแบบภาพจริง ทำได้ในไฟล์เดียว (`MyTasks.tsx`)
6. **หนี้ UI เดิมจาก K1.6 (ช่องวันที่เป็น native `datetime-local`/`date` ไม่ใช่ชิปไทย) ยังไม่แก้ในรอบนี้** — เห็นชัดในภาพ `.qc-shots/kanban/1.13/mobile-card-back-mobile.png`/`1.6/card-back-desktop.png` (ช่อง "10/11/2026, 06:00 PM") งานนี้เป็น component เปลี่ยนแทนที่ input ทั้งชุด (ปฏิทินชิปไทย + ตัวเลือกเวลา) ซึ่งเป็นงาน UI ใหม่ทั้งชิ้น ไม่ใช่ "ถ้าพอมีเวลาแตะได้" ระดับเล็ก — ปล่อยให้ K1.14 ตามที่สัญญาระบุทางเลือกไว้ (เขียนแจ้งไว้ตรงนี้ตามที่ WO สั่ง)
7. **`MobileBoard.tsx` ไม่ใช้ `data-testid="column"` ของเดสก์ท็อป** — ใช้ `mobile-board`/`mobile-column`/`column-dots` แทน (ตามสัญญา K1.13 ปักชื่อ testid ไว้ตรง ๆ) — ผลข้างเคียงที่ยอมรับ: สเปกเก่า `"1.5"` รายการ `board-patong` (ไม่มี `onlyDevice`) มี `expect: [...,"[data-testid=column]",...]` ซึ่งเขียนไว้ **ก่อน** K1.13 จะเปลี่ยนหน้าตามือถือ — รันแล้วฝั่ง mobile ของสเปกนี้ไม่พบ `column` (คาดหมาย เพราะมือถือเปลี่ยนเป็น `MobileBoard` แล้วจริง ๆ ตามที่ WO นี้สั่ง) ส่วนเดสก์ท็อปของสเปกเดียวกันและทุกสเปกอื่นของ `"1.5"`/`"1.6"` (10 + 3 ใบ) ผ่านหมด `failures:0` เห็นได้จาก oracle จริง (`qc-kanban-k1.5.mts` 17/17) — ไม่ได้แก้ไฟล์ `visual-kanban.mts` ส่วนสเปก `"1.5"` (กติกาห้ามแก้สเปกเดิม) รายงานเป็น deviation ที่ยอมรับแทน

## ⚠️ Finding ที่ต้องรายงาน — ไม่แก้ oracle (ตามกติกา §1)

**K1.13-S1.2 และ K1.13-S1.4 (CRITICAL ทั้งคู่)** — เชื่อว่า oracle ผิด/สมมติฐานไม่ตรงกับ seed จริง มีหลักฐานดังนี้:

- `myTasksOverview` คำนวณกลุ่มด้วย `dueBucketOf` ตัวเดียวกับ K1.11 (Mon–Sun เวลาไทย) — ตรวจสอบอิสระด้วยคำสั่ง `date -d "2026-09-30" +%A` → **Wednesday** · `date -d "2026-10-06" +%A` → **Tuesday** (สัปดาห์ถัดไป) ยืนยันว่าวันที่ `KQC.today=2026-09-30` เป็นวันพุธ ⇒ สัปดาห์นี้ (จันทร์–อาทิตย์) = 28 ก.ย.–4 ต.ค. เท่านั้น การ์ด "โอริงชุดใหญ่ Scubapro" (`due: 6` = 6 ต.ค. อังคารสัปดาห์หน้า) จึงตกกลุ่ม `later` ไม่ใช่ `week` ตามนิยาม Mon–Sun ที่สัญญา K1.13 เองระบุ (ledger บรรทัดคำสั่งงาน: "Thai-calendar day/week boundaries (Asia/Bangkok, week = Mon–Sun)") — แต่ oracle คอมเมนต์คาดหวัง week=4 (นับ "โอริง 6" รวมด้วย) → ทำให้ต้องการ week=4 แต่ระบบให้ 3 อย่างถูกต้องตามนิยาม
- `myTasksOverview` แยกการ์ด "เสร็จ" ด้วย `completedAt !== null` เท่านั้น (ตามสัญญา §K1.13: "การ์ด completedAt ไม่อยู่ในกลุ่ม") ตรวจสอบตรงจาก DB (สคริปต์ชั่วคราวที่ลบแล้ว): การ์ด "เปลี่ยนแบตเตอรี่คอมพิวเตอร์ดำน้ำ 5 เครื่อง" (`due:-3`) และ "ล้างถังอากาศประจำปี ชุด A" (`due:-12`) อยู่ในคอลัมน์ "เสร็จ" ของบอร์ด **ซ่อมบำรุงอุปกรณ์** (ชื่อคอลัมน์เฉย ๆ) แต่ `isDoneColumn=false` และ `completedAt=null` จริง (ยืนยันจาก `seed-kanban-qc.mts` — ไม่มีบรรทัดไหนเรียก `setColumnDone`/ตั้ง `completedAt` เลยทั้งไฟล์) เพราะ oracle เอง (`qc-kanban-k1.13.mts`) ตั้งค่า `isDoneColumn=true` เฉพาะคอลัมน์ "เสร็จแล้ว" ของบอร์ด**ป่าตอง**เท่านั้น (บรรทัด 42–43) ไม่ได้ตั้งให้บอร์ดซ่อมบำรุงด้วย ⇒ ทั้งสองใบนี้ยังนับเป็น "ยังไม่เสร็จ" จริง ๆ ตามข้อมูลที่ระบบมี และเลยกำหนดจริง (offset ติดลบ) ⇒ ตกกลุ่ม `overdue` อย่างถูกต้อง แต่ oracle คอมเมนต์คาดหวัง overdue=0 (นับว่าทั้งสองใบนี้ "เสร็จแล้ว")
- ผลคือ S1.2 ได้ `{"overdue":2,"today":2,"week":3}` (คาดหวัง `2/4/0`) และ S1.4 (หลังถอด kitti จากบอร์ดป่าตอง) ได้ `{"overdue":2,"today":1,"week":2}` (คาดหวัง `1/3`) — ส่วนต่าง (`today`/`week` ก่อน-หลังถอด) **ตรงกัน** กับที่ oracle คาด (2→1, 4→3 หรือ 3→2 แล้วแต่ baseline) ยืนยันว่า logic การกรองบอร์ดที่มองเห็นทำถูกต้อง ตัวเลข "ฐาน" ต่างกันเพราะสมมติฐานเรื่อง overdue/week เท่านั้น
- **ข้อเสนอสำหรับ Fable**: (ก) แก้ oracle ให้ตั้ง `setColumnDone` ให้คอลัมน์ "เสร็จ" ของบอร์ดซ่อมบำรุงด้วย (ให้ตรงกับคอมเมนต์ "(done)" ในสคริปต์) และ/หรือ (ข) แก้ตัวเลข week ที่คาดหวังจาก 4 เป็น 3 (ตัด "โอริง") ให้ตรงกับนิยาม Mon–Sun จริงของ `KQC.today` — ไม่ได้แก้ไฟล์ oracle เองตามกติกา §1

## Verify — ภาพจริง (เปิดดูเองทีละใบ · เทียบ mockup 07/06)

`bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-kanban.mts 1.13` → `.qc-shots/kanban/1.13/` (7 ใบ)

- `mobile-board-mobile.png` — เทียบภาพ 07(ก): จุดบอกตำแหน่ง 5 จุด + ข้อความ "คอลัมน์ 1 จาก 5 · ปัดซ้าย-ขวาเพื่อเปลี่ยนคอลัมน์" · คอลัมน์กว้าง 270px เห็นคอลัมน์ถัดไปโผล่ริมขวา · แถบคำอธิบายท่าทาง "กดค้าง 0.3 วิ = ยกการ์ด · ปัดขวา = เสร็จ · ปัดซ้าย = เก็บ" ล่างสุด · FAB วงกลมดำมุมขวาล่าง
- `mobile-board-lifted-mobile.png` — กดค้างการ์ดใบแรก 450ms (ไม่ปล่อยนิ้ว) แล้วถ่าย: ซูมดูจะเห็นการ์ดใบแรกมีเงาใต้การ์ดต่างจากใบถัดไป (สเกล 1.03 + shadow) — ยืนยันด้วย `cmp` ไฟล์ต่างกันจริง (ไม่ใช่ภาพซ้ำ)
- `mobile-swipe-undo-toast-mobile.png` — ปัดขวาการ์ดใบแรกจริงผ่าน `page.touchscreen` → toast ดำล่างจอ "ทำเครื่องหมาย '...' เสร็จแล้ว" + ปุ่ม "เลิกทำ" ขึ้นจริง (คืนสภาพการ์ดที่ถูกปัดหลังถ่ายเสร็จทั้งชุดผ่าน diff-restore ใน `visual-kanban.mts`)
- `mobile-card-back-mobile.png` — เทียบภาพ 07(ข): แผ่นเต็มจอ หัว/breadcrumb/ชื่อ/ชิปเพิ่ม/ผู้รับผิดชอบ/ป้าย/กำหนดส่ง/รายละเอียด/เช็คลิสต์/ไฟล์แนบ/ความเห็น ครบ + ช่องเขียนความเห็นติดขอบล่างจริง (sticky)
- `my-tasks-desktop.png` / `my-tasks-mobile.png` — เทียบภาพ 06 ฝั่งขวา: 4 การ์ด KPI (เลยกำหนด/ถึงกำหนดวันนี้/สัปดาห์นี้/ปิดไปสัปดาห์นี้) + การ์ด "งานที่มอบหมายให้ฉัน" + empty state "วันนี้ไม่มีงานค้าง" (owner ไม่มีงานที่มอบหมาย — ทดสอบ populated list ผ่าน oracle S1.2/S1.3 แล้วแยกกัน)
- `mobile-my-tasks-mobile.png` — เทียบภาพ 07(ค): grid 2×2 บนจอแคบ + การ์ดสรุปเดียวกัน
- ทั้ง 7 ใบ: `failures: 0`

**เดสก์ท็อปยังใช้ได้ปกติ** — `visual-kanban.mts 1.5` (10 ใบ desktop+mobile, `failures:1` เฉพาะ `board-patong` ฝั่ง **mobile** เพราะ testid เปลี่ยนตามที่ตั้งใจ ดู deviation #7 — ฝั่ง **desktop** ทุกใบผ่านหมดรวมทั้งลาก+โหลดใหม่คงตำแหน่ง) · `visual-kanban.mts 1.6` (3 ใบ, `failures:0`) การ์ดหลังยังเปิด/แก้ชื่อได้ปกติทั้งเดสก์ท็อปและมือถือ

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… SESSION_SECRET=…   (grep|cut บรรทัดเดียว · host = ep-plain-art ยืนยันแล้ว)
pnpm exec prisma generate → ✔ Generated Prisma Client
pnpm exec prisma migrate deploy → Applying migration `20260928000000_kanban_v2_j` → All migrations have been successfully applied.

pnpm exec tsx scripts/qc-kanban-k1.13.mts
  → ผ่าน 14/16 · FINDINGS: CRITICAL 2 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":16,"passed":14,"findings":["K1.13-S1.2","K1.13-S1.4"]}   (ดูหัวข้อ "Finding ที่ต้องรายงาน")

regressions (รอบสุดท้ายหลังแก้บั๊กทั้งหมด):
  k1.1  {"total":30,"passed":30,"findings":[]}   k1.2  {"total":25,"passed":25,"findings":[]}
  k1.3  {"total":29,"passed":29,"findings":[]}   k1.4  {"total":30,"passed":30,"findings":[]}
  k1.5  {"total":17,"passed":17,"findings":[]}   k1.6  {"total":20,"passed":20,"findings":[]}
  k1.7  {"total":21,"passed":21,"findings":[]}   k1.8  {"total":18,"passed":18,"findings":[]}
  k1.9  {"total":18,"passed":18,"findings":[]}   k1.10 {"total":16,"passed":16,"findings":[]}
  k1.11 {"total":21,"passed":21,"findings":[]}   k1.12 {"total":18,"passed":18,"findings":[]}
  qc-kanban-notify   → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → EXIT=0 (ไม่มี error)
env -i (ไม่ export env) pnpm exec tsx scripts/fitness.mts → ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

bash scripts/acc-v2-serve.sh → build สำเร็จ (4 รอบ ระหว่างไล่บั๊ก touch/pointercancel + NO_DONE_COLUMN — ดูหัวข้อ deviation #2)
pnpm exec tsx scripts/visual-kanban.mts 1.13 → JSON_SUMMARY {"wo":"1.13","shots":[...7 ใบ...],"failures":0}
pnpm exec tsx scripts/visual-kanban.mts 1.5  → JSON_SUMMARY {"wo":"1.5","shots":[...10 ใบ...],"failures":1}  (mobile board-patong เท่านั้น — ดู deviation #7)
pnpm exec tsx scripts/visual-kanban.mts 1.6  → JSON_SUMMARY {"wo":"1.6","shots":[...3 ใบ...],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว
```

## 🔴 เหตุการณ์ระหว่างทางที่ Fable ควรรู้ (แก้ไขเองแล้ว ไม่ใช่ finding ค้าง)

1. **บั๊กจริงที่พบและแก้แล้ว**: ท่าปัดบนมือถือ (`page.touchscreen` ของ puppeteer) ชนกับ native horizontal scroll ของคอลัมน์ (`overflow-x-auto`) ทำให้เบราว์เซอร์ยิง `pointercancel` กลาง gesture ด้วย `clientX` ที่ไม่น่าเชื่อถือ (เจอ 0 จริง) → ตีความทิศทางปัดผิดเสมอ (กลายเป็น "ปัดซ้าย"/เก็บ ไม่ว่าจะปัดทางไหน) แก้ด้วย `touch-action:pan-y` + `preventDefault()` (passive:false) + `onCancel` ที่ไม่ใช้ `clientX` ของ cancel event เลย — ไล่บั๊กด้วยสคริปต์ debug ชั่วคราว (`page.on("console")` + listener แนบตรงบน DOM) ยืนยันว่า native touch/pointer event dispatch ถูกต้องสมบูรณ์ (8 pointermove ครบ dx=20→160 ไม่มี cancel) ก่อนพบว่าที่แท้ปัญหาคือ `NO_DONE_COLUMN` (ข้อ 2)
2. **เหตุขัดข้องจริงที่พบและแก้แล้ว**: ชุดข้อมูล QC ปกติไม่มีคอลัมน์ไหนตั้งธง `isDoneColumn` เลยสักบอร์ด (ตั้งชั่วคราวเฉพาะตอน `qc-kanban-k1.13.mts` รันเอง แล้วปลดคืน) ⇒ การถ่ายภาพปัดขวาจริงบนบอร์ดป่าตองต้องตั้งคอลัมน์ "เสร็จแล้ว" เป็น `isDoneColumn` ชั่วคราวก่อนถ่ายด้วย (เพิ่มใน `visual-kanban.mts`) ไม่งั้นจะได้ `NO_DONE_COLUMN` เสมอ (พฤติกรรมถูกต้องของโค้ด ไม่ใช่บั๊ก)
3. **อุบัติเหตุที่แก้แล้ว**: การรัน `visual-kanban.mts 1.13` รอบหนึ่งเจอ `TargetCloseError` (หน้าเว็บ/เบราว์เซอร์หลุดกลางสเปก "my-tasks") **หลังจาก** ท่าปัดสำเร็จไปแล้ว 1 ใบ — สคริปต์ `visual-kanban.mts` ไม่ได้ห่อบล็อกคืนสภาพ (K1.9/1.10/1.12/1.13) ด้วย `try/finally` ระดับบนสุด (ครอบแค่ `browser.close()`) ⇒ ถ้าเบราว์เซอร์ล่มกลางสเปก บล็อกคืนสภาพจะไม่ถูกเรียกเลย ทำให้การ์ดที่ถูกปัดค้างอยู่ในคอลัมน์ผิด (แถวเดียว ไม่กระทบ `completedAt` เพราะรอบถัดไปที่รันสำเร็จบังเอิญไปล้าง `completedAt` ของมันด้วยตอนปลดธง `isDoneColumn` — แต่ **column ไม่ได้ถูกย้ายกลับ**) ตรวจพบทางอ้อมจาก regression `qc-kanban-k1.11.mts` (S2.6 คาดหวัง done=7/open=17 แต่ได้ 8/16 เพราะคอลัมน์ "เสร็จแล้ว" มี 8 ใบไม่ใช่ 7) ตามรอยด้วยสคริปต์ตรวจ column-by-column เจอการ์ด "ลูกค้าถามคอร์ส Open Water รอบเสาร์นี้ — ยังไม่ตอบ" ค้างอยู่ในคอลัมน์ผิด → ย้ายคืนด้วย `moves.moveCard` จริง (`force:true`, `beforeCardId`= การ์ดที่อยู่ถัดจากตำแหน่งเดิม) กลับที่เดิมเป๊ะ แล้วยืนยันซ้ำด้วย regression เต็มชุดอีกรอบ (ทุกอย่างเขียวหมดตามหัวข้อ "คำสั่งที่รันจริง") — **หนี้ MINOR ที่ควรพิจารณา**: `visual-kanban.mts` ควรห่อบล็อกคืนสภาพทั้งหมด (K1.9/1.10/1.12/1.13) ด้วย `try/finally` ระดับบนสุดร่วมกับ `browser.close()` กันเหตุแบบนี้เกิดซ้ำกับ WO ในอนาคต (ไม่ได้แก้ตอนนี้เพราะเป็นการปรับโครงสร้างที่กระทบทุก WO เดิม นอกขอบเขตของ K1.13)

## จุดที่อยากให้ Fable ลองแหย่

- **ลองปัดขวา/ซ้ายจริงบนมือถือจริง (ไม่ใช่ headless)** — ตรรกะผ่าน puppeteer touchscreen แล้ว แต่คำแนะนำในพิมพ์เขียว §K1.13 บอกให้ทดสอบบนเครื่องจริง (iOS Safari + Android Chrome) ด้วย เผื่อพฤติกรรม `touch-action`/`preventDefault` ต่างจาก headless Chromium
- **ลองกดค้าง (lift) แล้วลากจริง** — ตอนนี้ "ยก" เป็นแค่ผลตอบสนองภาพ ไม่รองรับการลากจัดเรียง/ย้ายคอลัมน์บนมือถือ (deviation #1) — ถ้ากดค้างแล้วลากไปทางขวา อาจสับสนกับท่าปัด (ทั้งสองเริ่มจาก pointerdown เดียวกัน ตัดสินด้วย "ขยับก่อน 300ms ครบ = ปัด" ดังนั้นถ้ากดค้างจนครบ 300ms ก่อนแล้วค่อยลาก จะกลายเป็นแค่ "ยกค้าง" ไม่ขยับตาม เพราะโค้ดไม่ผูก transform กับตำแหน่งนิ้วในสถานะ lifted) — ควรลองแล้วดูว่าเจ้าของ/ผู้ใช้จริงคาดหวังพฤติกรรมนี้ไหม
- **ลอง "เลิกทำ" หลัง 5 วินาทีผ่านไปแล้ว** — token จริงอยู่ได้ 5 นาที (คนละอันกับ toast ที่หายไปหลัง 5 วิ) ตอนนี้ปุ่ม "เลิกทำ" หายไปพร้อม toast แต่ token ยังใช้ได้ — ถ้าอยากให้กดเลิกทำได้นานกว่านั้น (มี UI อื่นเข้าถึง token) ทำได้ แต่ตอนนี้ยังไม่มีที่เก็บ token ไว้ให้กดซ้ำหลัง toast หาย
- **ลองแตะการ์ดตอนกำลัง lifted อยู่ (ไม่ขยับเลย ปล่อยนิ้วเฉย ๆ)** — ควรกลับสภาพปกติไม่มีอะไรเกิดขึ้น (ไม่เปิดการ์ด ไม่ปัด) — ตรวจแล้วว่า `phase="lifted"` ไม่ตรงเงื่อนไข `phase==="swiping"` ใน `onUp` จึงไม่ทำอะไร แต่ `suppressClickUntil` ก็ถูกตั้งไว้ (300ms) กันคลิกเปิดการ์ดโดยไม่ตั้งใจหลังปล่อยนิ้วจากการยกค้างด้วย — ควรลองว่าดีเลย์นี้รู้สึกหน่วงไปไหมในการใช้งานจริง
- **ตรวจ K1.11-S2.6/S2.4 เรื่องนิยาม "สัปดาห์"** — ดูหัวข้อ Finding ด้านบน (S1.2/S1.4) เกี่ยวโยงกับ `dueBucketOf` ตัวเดียวกับที่ K1.11 ใช้อยู่แล้ว ถ้าแก้นิยาม/oracle ของ K1.13 อาจต้องย้อนดู K1.11 บางเคสด้วยว่าตั้งใจให้ "week" ครอบคลุมแค่ Mon-Sun จริงไหม (ตอนนี้ทั้งสอง WO ใช้สูตรเดียวกันและตรงกันเอง เพียงแต่ oracle K1.13 ตั้งความคาดหวังไม่ตรงกับสูตรนี้)
