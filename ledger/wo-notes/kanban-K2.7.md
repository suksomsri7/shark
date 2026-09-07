# WO K2.7 — เทมเพลตการ์ด + กำหนดส่งซ้ำ (recurring · cron รายวัน)

## 1. สิ่งที่ทำ (ภาพรวม)

- **migration `20261003000000_kanban_v2_o`** (additive — สร้างด้วย `prisma migrate diff
  --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` เทียบ DB จริงบน QC):
  `KanbanCard` เพิ่ม `recurrenceRule String?` `recurrenceParentId String?` `recurrenceKey String?` +
  `@@unique([recurrenceParentId, recurrenceKey])` (ด่าน DB กัน cron ซ้อนสร้างซ้ำ) + `@@index([tenantId,
  systemId, status, recurrenceRule])` · `model KanbanCardTemplate` (`tenantId systemId boardId name
  title description? labelIds(Json) checklists(Json) fieldValues(Json) reminderMinutesBefore sortOrder
  createdById` · `@@index([boardId, sortOrder])` · FK `boardId → KanbanBoard.id` cascade) — ตรวจ SQL
  ด้วยตาแล้ว มีแต่ `ALTER TABLE ADD COLUMN`(nullable)/`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` ไม่มี
  DROP/ALTER…TYPE/NOT NULL ไม่มี default บนตารางเดิม · ลงทะเบียน `KanbanCardTemplate: sys()` ใน
  `scope.ts` (มีทั้ง tenantId+systemId ต่างจาก join table อื่นที่เป็น `tenant`) · เพิ่ม back-relation
  `KanbanBoard.cardTemplates[]` · `prisma generate` แล้ว (ห้าม `prisma format`)
- **`src/lib/modules/kanban/card-templates.ts`** (ใหม่ — server-only, `import { prisma } from "./db"`):
  `listCardTemplates` (VIEWER+) · `saveAsCardTemplate(ctx, actor, cardId, {name})` (ADMIN — เก็บ
  title/description/labelIds/checklists(ข้อความอย่างเดียว ไม่เก็บ done/ผู้รับมอบ/วันที่)/fieldValues(จาก
  `getCardFieldValues` กรองเฉพาะที่มีค่า)/reminderMinutesBefore · เพดาน `KANBAN_LIMITS.
  cardTemplatesPerBoard = 30` ใบที่ 31 → throw ไทย code `LIMIT_REACHED`) · `createCardFromTemplate(ctx,
  actor, {templateId, columnId, title?, dueAt?, assigneeUserIds?})` (EDITOR ผ่าน `assertColumnRole` —
  หาบอร์ดจาก columnId จริงไม่เชื่อ boardId จากฟอร์ม · ป้ายกรองเฉพาะที่ยังมีอยู่จริง (ป้ายที่ถูกลบไปแล้ว
  ข้าม) · เช็คลิสต์คัดลอกทุกข้อเป็น "ยังไม่ทำ" · ค่าฟิลด์คัดลอกทีละตัวผ่าน `setCardFieldValue` (ฟิลด์ที่
  ถูกลบไปแล้วตั้งแต่บันทึกเทมเพลต → ข้าม) · **คืนการ์ดเต็มใบ (`KanbanCard`) แบบเดียวกับ
  `duplicateCard`/`restoreCard` ใน `cards.ts`** แทนที่จะคืนแค่ `{cardId}` ตามตัวอักษรของสัญญา — เพื่อให้
  `createCardFromTemplateAction` ประกอบ `BoardCardDto` ต่อได้เองโดยไม่ต้องแตะ prisma ตรง ๆ ใน actions.ts
  (กติกา F5 ratchet) · oracle รองรับทั้งสองรูปแบบอยู่แล้ว (`made?.cardId ?? made?.id`) — ดู §4 ข้อ 1) ·
  `updateCardTemplate`/`deleteCardTemplate`(ADMIN)/`reorderCardTemplates`(ADMIN) แบบเดียวกับ
  `fields.ts` (K2.6)
- **`src/lib/modules/kanban/recurrence.ts`** (ใหม่): ส่วน **pure** `parseRecurrenceRule` (subset RRULE:
  `FREQ=DAILY[;INTERVAL=n]` · `FREQ=WEEKLY;BYDAY=MO,TH[;INTERVAL=n]` · `FREQ=MONTHLY;
  BYMONTHDAY=d[;INTERVAL=n]` — INTERVAL ต้องเป็นจำนวนเต็ม ≥1 · WEEKLY ไม่มี BYDAY/BYDAY ไม่ถูกต้อง/
  BYMONTHDAY นอกช่วง 1-31/FREQ อื่น/รูปว่าง → throw ไทย) · `describeRecurrence` (ประโยคไทย: "ทุกวัน" ·
  "ทุก n วัน" · "ทุกวัน{วัน}" · "ทุกวัน{วัน1}และ{วัน2}" (หลายวัน) · "ทุก n สัปดาห์ วัน{วัน}" ·
  "ทุกวันที่ d ของเดือน") · `nextOccurrence(rule, after)` หาแบบ brute-force วันไทยทีละวัน (≤400 วัน) โดยใช้
  `after` เองเป็นทั้งจุดเริ่มค้นหาและ "จุดอ้างอิง" ของ interval (DAILY: `after`+n วัน · WEEKLY: หาแรกที่
  weekday ตรงและ weeksDiff%interval==0 นับจากสัปดาห์ของ `after` · MONTHLY: หาแรกที่ day-of-month ตรง
  (clamp เดือนสั้น) และ monthsDiff%interval==0) — คิดวันไทย +07:00 ด้วยมือ (`getUTCDate/Month/FullYear/
  Day` บน `Date` ที่เลื่อน +7 ชม.แล้ว — แพตเทิร์นเดียวกับ `Card.tsx`/`fields.ts`/`ThaiDatePicker.tsx` **ไม่ใช่
  `getDay()` ตรง ๆ** ตาม `reference_thai_date_getday_trap`) — ทดสอบยืนยันครบ 4 กรณีของ oracle (จันทร์
  ถัดไปจากพุธ = +5 วัน · วันที่ 15 ถัดไปข้ามเดือน · ทุก 2 วัน · BYDAY=WE จากพุธเอง = สัปดาห์หน้าไม่ใช่วัน
  เดียวกัน) ตัวเดียวกัน (`matchesRule`) ใช้ทั้งใน `nextOccurrence` (anchor=`after`) และ
  `sweepRecurringCards` (anchor=`dueAt`ของแม่)
  - `setCardRecurrence(ctx, actor, cardId, rule|null)` (EDITOR ผ่าน `assertCardRole` — การ์ดไม่มี dueAt →
    throw ไทยก่อนเช็ครูปกฎ · กฎผิดรูป → throw จาก `parseRecurrenceRule` · เขียน + `logActivity`
    `CARD_UPDATED {recurrence: rule}` ในทรานแซกชันเดียวกัน · `publishBoardSignal`)
  - `sweepRecurringCards(now: Date)` (**ไม่มีค่า default — ห้าม `new Date()` ภายในตามกติกา**): ดึงการ์ด
    แม่ทุกใบทุกร้าน (`status ACTIVE · recurrenceRule not null · recurrenceParentId null · board ACTIVE`
    · `take: 500`) → ต่อใบ parse กฎ (parse พังข้าม ไม่ throw ทั้ง sweep) → `matchesRule(anchor=dueAt ของ
    แม่, candidate=now)` → สร้างลูก: คอลัมน์แรก (active) ของบอร์ด · ก๊อป
    ชื่อ/รายละเอียด/ป้าย/**ผู้รับผิดชอบ**(D19)/เช็คลิสต์(ยังไม่ทำ)/ค่าฟิลด์/reminderMinutesBefore ·
    `recurrenceParentId`/`recurrenceKey = kanban.recur.{parentId}.{yyyy-mm-dd ไทย}` · `cardNo` ใหม่ผ่าน
    `UPDATE…RETURNING` ใน tx เดียวกัน · `sourceType AUTOMATION sourceId=parentId` · `logActivity
    CARD_CREATED {recurrenceParentId}` + `emitOutbox kanban.card.created` ในทรานแซกชันเดียวกัน ·
    แจ้งผู้รับผิดชอบหลัง commit (best-effort) · ชนกัน unique (`P2002`) → จับแล้วนับเป็น 0 ไม่ throw ·
    บอร์ดไม่มีคอลัมน์ active เหลือ → ข้าม (ไม่ throw) · คืนจำนวนที่สร้างสำเร็จจริง
- **DTO ใหม่/แก้ (`types.ts`)**: `CardTemplateDto{id,name,title,labelCount,checklistItemCount,
  sortOrder}` · `BoardCardDto`/`TableRowDto` เพิ่ม `isRecurring: boolean` · `CardDetailDto` เพิ่ม
  `recurrenceRule`/`recurrenceLabel`(ไทย)/`recurrenceParentId`/`recurrenceParentTitle`
- **`cards.ts`**: `getCardDetail` โหลด `recurrenceRule`/`recurrenceParentId` ของการ์ด + ชื่อการ์ดแม่ (ถ้า
  เป็นลูก) เพิ่มใน `Promise.all` เดิม แล้วคำนวณ `recurrenceLabel` ผ่าน `describeRecurrence`
- **`service.ts`**: `toBoardCardDto` เพิ่ม `isRecurring: card.recurrenceRule != null` (แม่ที่มีกฎเท่านั้น
  — ลูกไม่มี `recurrenceRule` ของตัวเอง) · เพิ่ม facade re-export ของ `card-templates.ts`/`recurrence.ts`
  ทั้งหมด (ตามแพตเทิร์น K2.5/K2.6)
- **`table.ts`**: `RawTableCard` เพิ่มฟิลด์ `recurrenceRule` (การ์ดดิบมาจาก prisma เต็มโมเดลอยู่แล้ว แค่
  เปิดชนิดให้ TS อ่านได้) → `TableRowDto.isRecurring`
- **`src/lib/platform/cron.ts`**: `runDailyCron` เพิ่ม `recurringCards = await
  sweepRecurringCards(now)` ใน try/catch ของตัวเอง (ล้ม → -1 ไปต่อ เหมือนงานย่อยอื่นทั้งหมด) + คืนใน
  ผลลัพธ์ · **ไม่แก้ `vercel.json`** (ยังใช้ cron เดิม `/api/cron/tick` วันละครั้ง)
- **`actions.ts`**: 6 action ใหม่ `saveCardTemplateAction createCardFromTemplateAction
  updateCardTemplateAction deleteCardTemplateAction reorderCardTemplatesAction setCardRecurrenceAction`
  — `createCardFromTemplateAction` ประกอบ `BoardCardDto` จากการ์ดเต็มที่ได้คืนมา (แบบเดียวกับ
  `duplicateCardAction`) · `setCardRecurrenceAction` คำนวณ `recurrenceLabel` (ไทย) กลับไปด้วยผ่าน
  `describeRecurrence` (server-only) ให้ฝั่ง client ไม่ต้อง import `recurrence.ts` เข้าบันเดิล (กันปัญหา
  ลาก `./db`→`pg` เข้าฝั่ง browser เหมือนบทเรียน K1.11/K1.12/…)
- **`KanbanIcon.tsx`**: เพิ่มไอคอน `repeat` (ลูกศรวนสองทาง — ไม่มีใน `_kb.part`/มี mockup เพราะ K2.7 ไม่มี
  mockup เฉพาะ วาดตามสไตล์ stroke เดียวกับไอคอนอื่นทั้งหมด)
- **`Card.tsx`**: ชิป 🔁 testid `card-recurring` (ไอคอน `repeat` + ข้อความ "ประจำ") วางแถวเดียวกับชิป
  "ที่มา" (source) หัวการ์ด · **`TableView.tsx`**: ไอคอน `repeat` testid `card-recurring` ข้างชื่อการ์ด
  ในเซลล์ชื่อ
- **`CardBack.tsx`**: บล็อก "กำหนดส่งซ้ำ" testid `card-recurrence` ใต้ "วันเริ่ม" — select 5 ตัวเลือก (ไม่
  ซ้ำ/ทุกวัน/ทุกสัปดาห์/ทุก 2 สัปดาห์/ทุกเดือน) คำนวณ BYDAY/BYMONTHDAY จาก `dueAt` ปัจจุบันฝั่ง client
  (คิดวันไทยเองแบบเดียวกับ `Card.tsx` — `getUTCDay()` บน `Date` ที่เลื่อน +7 ชม. **ไม่ใช่** `getDay()`
  ตรง ๆ) แล้วส่ง rule ไป `setCardRecurrenceAction` (optimistic + revert เมื่อ error) · disabled เมื่อไม่มี
  dueAt (มีคำอธิบายกำกับ) · การ์ดลูก (`recurrenceParentId` ไม่ null) แสดง "เกิดจากงานประจำ: {ชื่อแม่}"
  ลิงก์ `?card=` แทนตัวเลือกตั้งค่า (ลูกไม่มีกฎของตัวเอง) · เมนู "บันทึกเป็นเทมเพลตการ์ด" testid
  `save-card-template` — **ADMIN เท่านั้น** (`boardRole === "ADMIN"`) แทนปุ่ม disabled เดิม — คลิกแล้ว
  เปิดช่องชื่อ inline (prefill ชื่อการ์ด) กด Enter/บันทึก → `saveCardTemplateAction` → toast
- **`Column.tsx`**: รับ prop `cardTemplates: CardTemplateDto[]` ใหม่ + `handlers.onCreateFromTemplate` —
  วางปุ่ม `<CardTemplatePicker>` ข้าง "+ เพิ่มการ์ด" (ซ่อนเองเมื่อบอร์ดไม่มีเทมเพลต — เช็คซ้ำสองชั้นทั้งที่
  `Column.tsx` และในตัว `CardTemplatePicker.tsx` เอง)
- **`CardTemplatePicker.tsx`** (ใหม่ — testid `card-template-picker`): ปุ่ม "จากเทมเพลต ▾" → เปิด
  dropdown รายชื่อเทมเพลต (ชื่อ + ชื่อการ์ดที่จะได้) → เลือกแล้วเปิดกล่องชื่อ inline (prefill จาก
  `template.title` แก้ได้ก่อนสร้าง) → Enter/ปุ่ม "สร้างการ์ด" → `onCreate(templateId, title)` (ผู้เรียก
  จัดการ action + patch state บอร์ดเอง — แบบเดียวกับ `onCreateCard`/`insertDuplicatedCard` เดิม)
- **`BoardView.tsx`**: prop `cardTemplates` ใหม่ (ปริยาย `[]`) → ส่งต่อให้ทุก `<Column>` · handler
  `onCreateFromTemplate` เรียก `createCardFromTemplateAction` แล้วแทรกการ์ดที่ได้ท้ายคอลัมน์ปลายทาง
  (แบบเดียวกับ `onCreateCard`)
- **`CardTemplatesSettings.tsx`** (ใหม่ — testid `card-templates-settings`): "n / 30" + รายการ (คลิกชื่อ
  แก้ inline + เลื่อนขึ้น/ลง + ลบ) — แพตเทิร์นเดียวกับ `settings/CustomFieldsSettings.tsx` (K2.6) แต่ 🔴
  **อยู่ที่ `src/components/kanban/CardTemplatesSettings.tsx` (ระดับบนสุด ไม่ใช่ใต้ `settings/`)** —
  ตาม path ที่ oracle ตรวจตรง ๆ (ดู §4 ข้อ 2)
- **`settings/[tab]/page.tsx`**: เพิ่มแท็บ `"card-templates"` เข้า `BOARD_SETTINGS_TABS` (`BoardSettingsNav.
  tsx`) + component `CardTemplatesTab` (`listCardTemplates` → `CardTemplatesSettings`)
- **`src/app/.../b/[boardId]/page.tsx`**: โหลด `listCardTemplates(ctx, actor, boardId)` (VIEWER อ่านได้ —
  `.catch(() => [])` กันพังทั้งหน้าถ้าล้ม) → prop `cardTemplates` ให้ `<BoardView>` (เฉพาะมุมมองบอร์ด —
  ตาราง/ปฏิทิน/สรุปไม่ต้องใช้เพราะไม่มีปุ่ม "+ เพิ่มการ์ด" ต่อคอลัมน์)
- **`scripts/visual-kanban.mts`**: เพิ่ม `SPECS["2.7"]` (3 สเปค) + เตรียมเทมเพลต 1 ใบ (จากการ์ด #7 —
  `cardIds[6]`) + ตั้งกำหนดส่งซ้ำการ์ด #8 (`cardIds[7]`) ตรงผ่าน `card-templates.ts`/`recurrence.ts`
  ตรง ๆ ก่อนถ่าย (เหตุผลเดียวกับ KB25/KB26 — `*Action` เรียก `revalidatePath` ชนจังหวะ puppeteer) — คำนวณ
  BYDAY จาก `dueAt` จริงของการ์ด #8 (ไม่ hardcode วันจันทร์) ให้ป้ายในดรอปดาวน์กับคำอธิบายที่บันทึกไว้ตรง
  กันในภาพ · คืนสภาพ (ลบเทมเพลต + คืน dueAt/recurrenceRule เดิม + ลบกิจกรรมที่เพิ่งเกิด) ใน `KB27`

## 2. ไฟล์ที่แตะ

ใหม่:
- `prisma/migrations/20261003000000_kanban_v2_o/migration.sql`
- `src/lib/modules/kanban/card-templates.ts`
- `src/lib/modules/kanban/recurrence.ts`
- `src/components/kanban/CardTemplatePicker.tsx`
- `src/components/kanban/CardTemplatesSettings.tsx`

แก้:
- `prisma/schema/kanban.prisma` (KanbanCard 3 ฟิลด์ใหม่ + unique/index ใหม่ · model
  `KanbanCardTemplate` ใหม่ + back-relation บน `KanbanBoard`)
- `src/lib/core/scope.ts` (ลงทะเบียน `KanbanCardTemplate: sys()`)
- `src/lib/modules/kanban/limits.ts` (`cardTemplatesPerBoard: 30`)
- `src/lib/modules/kanban/types.ts` (DTO ใหม่ `CardTemplateDto` + ฟิลด์ใหม่ใน
  `BoardCardDto`/`TableRowDto`/`CardDetailDto`)
- `src/lib/modules/kanban/cards.ts` (`getCardDetail` แนบ recurrence fields)
- `src/lib/modules/kanban/service.ts` (`toBoardCardDto` แนบ `isRecurring` + facade re-export ของ
  `card-templates.ts`/`recurrence.ts`)
- `src/lib/modules/kanban/table.ts` (`RawTableCard`/แถวตาราง แนบ `isRecurring`)
- `src/lib/modules/kanban/actions.ts` (6 action ใหม่ + import)
- `src/lib/platform/cron.ts` (`runDailyCron` เรียก `sweepRecurringCards` + คืน `recurringCards`)
- `src/components/kanban/KanbanIcon.tsx` (ไอคอน `repeat` ใหม่)
- `src/components/kanban/Card.tsx` (ชิป `card-recurring`)
- `src/components/kanban/TableView.tsx` (ชิป `card-recurring` ในเซลล์ชื่อ)
- `src/components/kanban/CardBack.tsx` (บล็อก `card-recurrence` + เมนู `save-card-template` + แสดง
  "เกิดจากงานประจำ")
- `src/components/kanban/Column.tsx` (prop `cardTemplates` + วาง `<CardTemplatePicker>`)
- `src/components/kanban/BoardView.tsx` (prop `cardTemplates` + handler `onCreateFromTemplate`)
- `src/components/kanban/settings/BoardSettingsNav.tsx` (แท็บ "เทมเพลตการ์ด" ใหม่)
- `src/app/app/sys/[id]/kanban/b/[boardId]/settings/[tab]/page.tsx` (`CardTemplatesTab` จริง)
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` (โหลด `cardTemplates` ส่งลง `<BoardView>`)
- `scripts/visual-kanban.mts` (`SPECS["2.7"]` + เตรียม/คืนสภาพ `KB27`)

## 3. ผลด่าน (ตัวเลขจริง — รันจริงทุกชุด)

**oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.7.mts`
```
ผ่าน 31/31
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
(รอบแรกก่อนถ่ายภาพ: 30/31 — ตกเฉพาะ S4.6 เพราะยังไม่มีภาพ ไม่ใช่ oracle ผิด — ถ่ายแล้วรันซ้ำเขียวหมด)

**regressions (ทุกชุดเขียว ยกเว้น flake เดิมที่รู้จักอยู่แล้ว)**
```
k1.1  29/30 (K1.1-S2.3 flake เดิม — รันซ้ำได้ ไม่เกี่ยวกับ K2.7 · รอบแรกมี K1.1-S2.5 แดงด้วยชั่วคราว
      แต่รันซ้ำเดี่ยว ๆ เขียว 29/30 ปกติ ยืนยันเป็น flake ไม่ใช่ผลจาก K2.7)
k1.2  25/25 · k1.3  29/29 · k1.4  30/30 · k1.5  17/17 · k1.6  20/20 · k1.7  21/21
k1.8  18/18 · k1.9  18/18 · k1.10 16/16 · k1.11 21/21 · k1.12 18/18 · k1.13 16/16
k1.14 15/15 · k1.15 30/30 · k2.1  22/22 · k2.2  16/16 · k2.4  12/12 · k2.5  15/15 · k2.6 17/17
qc-kanban-notify 12/12 · qc-ai-kanban-board 3/3 · qc-cron 4/4
```

**typecheck** — `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error** (พังรอบแรก
ตอน `next build` ของ QC server เจอ — `publishBoardSignal` รับแค่ `Pick<KanbanCtx,"tenantId">` ไม่ใช่
`KanbanCtx` เต็ม ส่ง `systemId` เกินมาใน object literal → แก้ตัดออก แล้ว 0 error ทุกรอบถัดไป)

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23 — F1.1 model 228 ตัวลงทะเบียนครบ (227 เดิม + KanbanCardTemplate) · F5.1 raw prisma ไม่เพิ่ม
(baseline 45 คงเดิม — card-templates.ts/recurrence.ts import ผ่าน ./db) · F8.1 migration ครอบ 228 model
· F13.4-6 ทะเบียน API/AI เดิมไม่กระทบ (K2.7 ไม่เพิ่ม REST op — ดู §4 ข้อ 3)
```

**ภาพจริง** — `scripts/visual-kanban.mts 2.7` → 3 ใบ (`.qc-shots/kanban/2.7/`), failures=0
1. `column-template-picker-desktop.png` — คอลัมน์แรกของบอร์ด: เปิด "จากเทมเพลต ▾" เห็น dropdown แสดง
   "ตรวจถังอากาศ (ภาพ)" + ชื่อการ์ดที่จะได้ (subtitle) — ตำแหน่งอยู่ข้าง "+ เพิ่มการ์ด" ตรงสัญญา
2. `card-back-recurrence-desktop.png` — หลังการ์ด #8: บล็อก "กำหนดส่งซ้ำ" ใต้ "วันเริ่ม" — select แสดง
   "ทุกสัปดาห์ (วันพฤหัสบดี)" (ตรงกับวันของ dueAt การ์ดจริง "พฤ. 10 ก.ย. 2569") + คำอธิบายไทย "ทุกวัน
   พฤหัสบดี" ทางขวา ตรงกัน · แถบขวายังเห็น "บันทึกเป็นเทมเพลตการ์ด" ในกลุ่ม "การ์ดนี้"
3. `board-settings-card-templates-desktop.png` — ตั้งค่าบอร์ด 8 แท็บ (เพิ่ม "เทมเพลตการ์ด" — active):
   "1 / 30" + แถวเทมเพลต "ตรวจถังอากาศ (ภาพ)" พร้อม subtitle ชื่อการ์ด/จำนวนป้าย/จำนวนรายการเช็คลิสต์ +
   ปุ่มเลื่อนขึ้น/ลง/ลบ ตรงโครงเดียวกับ K2.5/K2.6

Fable ตรวจภาพเทียบ mockup ไม่ได้ (K2.7 ไม่มี mockup เฉพาะ ตามสัญญา §13 K2.7) — ใช้เกณฑ์ข้อความ/ตำแหน่ง/
โทเคนสีเดียวกับ WO อื่นแทน

## 4. เบี่ยงจากสัญญา / จุดตัดสินใจ

1. **`createCardFromTemplate` คืน `KanbanCard` เต็มใบ ไม่ใช่ `{ cardId }` ตามตัวอักษรของสัญญา** — สัญญา
   §5.4/§13 เขียน `→ { cardId }` แต่ทำตามนั้นตรง ๆ จะบังคับให้ `createCardFromTemplateAction`
   (`actions.ts`) ต้องแตะ `prisma` ตรงเพื่อดึงการ์ดเต็มมาประกอบ `BoardCardDto` (ผิดกติกา "raw prisma ใน
   `src/lib/modules/**` ไม่เพิ่ม — F5 ratchet" เพราะ `actions.ts` ไม่เคย import `./db` มาก่อน) ⇒ เปลี่ยน
   ให้คืนการ์ดเต็มใบแบบเดียวกับ `duplicateCard`/`restoreCard` ที่มีอยู่แล้วใน `cards.ts` — oracle ทดสอบ
   ด้วย `made?.cardId ?? made?.id` (รองรับทั้งสองรูปแบบอยู่แล้ว) จึงผ่านทั้งคู่โดยไม่ต้องแก้ oracle
2. **`CardTemplatesSettings.tsx` อยู่ที่ `src/components/kanban/` ระดับบนสุด ไม่ใช่ใต้
   `src/components/kanban/settings/` เหมือน `CustomFieldsSettings.tsx`/`SavedViewsSettings.tsx` ของ
   K2.5/K2.6** — สัญญา `KANBAN-RUN.md` §K2.7 ไม่ได้ระบุ path ชัดเจน (บอกแค่ชื่อไฟล์) แต่ oracle S4.4 อ่าน
   จาก `read("src/components/kanban/CardTemplatesSettings.tsx")` ตรง ๆ (ไม่ใช่ path ใต้ `settings/`) —
   ทำตาม path ที่ oracle ตรวจจริงเพื่อให้ผ่าน (ลองวางไว้ใต้ `settings/` ก่อนแล้วพบว่า oracle จะได้
   string ว่างจากทั้ง 3 ไฟล์ที่ตรวจ (`CardTemplatesSettings.tsx` ระดับบน · `settings/page.tsx` ที่ไม่มี
   จริง (ใช้ dynamic route `[tab]`) · `settings/card-templates/page.tsx` ที่ไม่มีจริงเช่นกัน) → S4.4 ตก
   แน่นอน) — ย้ายไฟล์มาตำแหน่งที่ oracle ต้องการแล้วแก้ import ใน `settings/[tab]/page.tsx` ให้ตรง
3. **ไม่เพิ่ม REST API op / AI tool สำหรับเทมเพลตการ์ด/กำหนดส่งซ้ำ** — สัญญา K2.7 ในตาราง
   `KANBAN-RUN.md` §K2.7 ไม่ได้ระบุ deliverable นี้ (เหมือน K2.1/K2.2/K2.4/K2.5/K2.6 ที่ไม่มี op ใหม่เช่น
   กัน — `src/lib/modules/kanban/api/ops/` ไม่มีไฟล์ของมุมมอง P2 เลย) ตัดสินว่าเป็นแพตเทิร์นเดียวกัน (P2
   ยังไม่เข้าทะเบียน API จนกว่าจะมี WO รวบทีหลัง) · fitness F13 ยืนยันไม่กระทบ (23/23)
4. **ปุ่ม "จากเทมเพลต ▾" ไม่มีบนมือถือ (`MobileBoard.tsx`)** — มือถือใช้ FAB + แผ่นเพิ่มการ์ดเร็วของตัวเอง
   (คนละ component จาก `Column.tsx`) สัญญา K2.7 พูดถึง "ปุ่มเพิ่มการ์ดในคอลัมน์" ซึ่ง oracle ตรวจเฉพาะ
   `Column.tsx`/`BoardView.tsx`/`CardTemplatePicker.tsx` (เดสก์ท็อป) — ไม่ได้ทำเวอร์ชันมือถือในรอบนี้
   (หนี้ — ดู §6)
5. **`nextOccurrence` ไม่มีพารามิเตอร์ anchor แยกจาก `after`** — ใช้ `after` เองเป็นทั้งจุดเริ่มค้นหาและ
   ฐานคำนวณ interval (สัญญาก็เขียนแค่ `nextOccurrence(rule, after)` 2 พารามิเตอร์) — ตรวจสอบแล้วว่า
   ครอบคลุมทั้ง 4 กรณีทดสอบของ oracle (S3.3) ถูกต้อง ส่วน `sweepRecurringCards` ไม่ได้เรียก
   `nextOccurrence` เลย (ใช้ `matchesRule` internal ตัวเดียวกันแต่ anchor=dueAt ของแม่ตรง ๆ) — ทั้งสอง
   จุดใช้ predicate เดียวกันจึงคิดวันตรงกันเป๊ะเสมอ

## 5. ข้อแย้ง/พบเจอ ที่อยากให้ Fable ตัดสิน

ไม่มีข้อแย้งกับ oracle รอบนี้ — oracle ผ่าน 31/31 โดยไม่ต้องให้ Fable แก้อะไร (ต่างจาก K2.6 ที่ builder
เจอ oracle ผิดสมมติฐานสิทธิ์) จุดเดียวที่พบระหว่างทำงานคือ type error ของตัวเอง (`publishBoardSignal`
รับ `Pick<KanbanCtx,"tenantId">`) ซึ่งแก้เองแล้วก่อนส่ง (ดู §3 "typecheck")

**สังเกตที่อยากแจ้ง (ไม่ใช่บั๊ก แต่น่าสนใจ)**: ภาพ `column-template-picker-desktop.png` แสดง subtitle ของ
เทมเพลต "ตรวจถังอากาศ (ภาพ)" เป็น "ทำใบเสนอราคาทริปเรือ Sea Fox" ซึ่งดูไม่เข้ากับชื่อเทมเพลต — เป็นเพราะ
สคริปต์เตรียมภาพเลือกการ์ด #7 (`cardIds[6]`) เป็นต้นแบบเพื่อบันทึกเป็นเทมเพลต แต่ตั้งชื่อเทมเพลตเอง
("ตรวจถังอากาศ (ภาพ)") ไม่ตรงกับ `title` จริงของการ์ดต้นแบบ — พฤติกรรมถูกต้องตามสัญญา (เทมเพลตเก็บ `title`
จริงของการ์ดต้นฉบับเป็น "ชื่อการ์ดที่จะสร้าง" แยกจาก "ชื่อเทมเพลต" ที่ตั้งเอง) แค่เลือกการ์ดตัวอย่างมาถ่าย
ภาพได้ไม่สอดคล้องกันทางความหมาย — ไม่กระทบการทำงานจริง ไม่ต้องแก้

## 6. หนี้ที่ฝากไว้

1. ปุ่ม "จากเทมเพลต ▾" ยังไม่มีบนมือถือ (`MobileBoard.tsx`) — ใช้ FAB+แผ่นเพิ่มการ์ดเร็วแบบเดิมเท่านั้น
   (§4 ข้อ 4)
2. ไม่มี REST API op / AI tool สำหรับเทมเพลตการ์ด/กำหนดส่งซ้ำ (ตามแพตเทิร์น K2.1/K2.2/K2.4/K2.5/K2.6 —
   §4 ข้อ 3) — ถ้าจะทำ ควรรวมเป็น WO เดียวกับมุมมอง P2 อื่น ๆ ที่ยังไม่มี op
3. `CardTemplatesSettings.tsx` แก้ได้แค่ "ชื่อเทมเพลต" (คลิก inline) — ยังไม่มี UI แก้ "ชื่อการ์ด"/
   "รายละเอียด" ของเทมเพลตหลังบันทึกแล้ว (`updateCardTemplate`/`updateCardTemplateAction` รองรับ
   `title`/`description` อยู่แล้วในชั้นเซอร์วิส/action แค่ยังไม่มีปุ่มเรียกในฟอร์ม — ต้องลบแล้วบันทึกใหม่
   ถ้าอยากเปลี่ยนชื่อการ์ด/รายละเอียด)
4. จัดลำดับเทมเพลตเป็นปุ่ม ↑/↓ ไม่ใช่ลากเมาส์จริง (ตามแพตเทิร์นเดิมของ `Checklist.tsx`/
   `CustomFieldsSettings.tsx` — เหมือนหนี้เดิมของ K2.6)
5. ภาพมือถือของหลังการ์ด (ทุก WO ตั้งแต่ K1.6) ไม่เคยครอบคลุมเนื้อหาลึกในแถบขวา (บล็อก "กำหนดส่งซ้ำ" ก็
   เช่นกัน) — ข้อจำกัดเดิมของ harness ที่ K2.6 บันทึกไว้แล้ว ไม่ใช่สิ่งที่ K2.7 ทำให้เกิดใหม่ ไม่ได้ถ่าย
   ภาพมือถือของบล็อกนี้แยกต่างหากด้วยเหตุผลเดียวกัน
