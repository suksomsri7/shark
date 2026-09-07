# K2.12 — หนี้ P2: ตาราง parity ภาพ 04 · ไทม์ไลน์ label · ปฏิทินรวมระบบ · REST op + AI tool ของ P2 · UI ค้าง · ชิป "โดยกฎอัตโนมัติ" (บันทึกผู้ทำ)

> WO: `ledger/KANBAN-RUN.md` §K2.F/§K2.12 (ปิด P2 — ทำหลัง K2.3) · ข้อสอบ: `scripts/qc-kanban-k2.12.mts` (13 ข้อ · Fable เขียน · builder ไม่แตะ)
> โมเดล: Sonnet ตามตาราง WO

## 1. สิ่งที่ทำ (ภาพรวม)

1. **ตาราง (K2.1 parity ภาพ 04)** — ย้ายแถบเลือกหลายรายการ (`bulk-bar`) จาก pill ลอยล่างจอ (fixed) ขึ้นมาเป็น
   แถบฟ้าอ่อนบนหัวตาราง (เหนือ `table-view`) ตามภาพ 04 · คอลัมน์ "แก้ไขล่าสุด" เปลี่ยนจากวันที่เต็มเป็น
   `relativeThaiTime` (สัมพัทธ์ "37 นาทีที่แล้ว") · **ช่อง "กำหนดส่ง"** (รอบสอง — Fable ตรวจรับแล้วพบว่ายัง
   ไม่ parity: ตอนปิด popover ยังโชว์วันที่เต็ม "พฤ. 1 ต.ค. 2569 · 18:00 น." สีเทาทุกแถวแทนชิปสัมพัทธ์+สีตาม
   ความเร่ง) — เพิ่ม prop `chipText?: string` ให้ `ThaiDatePicker.tsx` (ไม่กระทบผู้เรียกเดิม — ไม่ใส่ = พฤติกรรม
   เดิมเป๊ะ ใช้ที่ `CardBack.tsx`/บล็อกลาก bulk ในไฟล์เดียวกัน) แล้วส่ง `chipText={due?.text}` (ตัวเดียวกับ
   `dueBadgeFrom` ที่คำนวณ `tone` อยู่แล้ว) จาก `TableRowView` — ตอนปิด popover เป็นชิปสัมพัทธ์สีตามความเร่ง
   เหมือนการ์ดบนบอร์ด ตอนเปิด popover ยังกางเป็นปฏิทิน/วันที่เต็มตามปกติ (ไม่กระทบการแก้ไข) — ดู §6
2. **ไทม์ไลน์ (K2.3 หนี้ UI)** — แถบแคบกว่า 80px (การ์ด 1 วันที่ dayWidth เล็ก) แสดงชื่อการ์ดเต็มไว้ "ข้างแถบ"
   (`timeline-bar-label`) แทนตัวหนังสือที่ถูก `truncate` เหลือแทบไม่เห็นในตัวแถบ · ช่วงปริยาย (ไม่มี `?from=`)
   ตรวจสอบแล้วว่า **ครอบวันนี้อยู่แล้ว** จากโค้ดเดิม (`anchorMs = fromMatch ? … : nowMs` ใน `page.tsx`) —
   พิสูจน์ด้วย node script จริง (ดู §6) ไม่ต้องแก้ตรรกะช่วงปริยาย
3. **ปฏิทินรวมระบบ** — `src/lib/modules/kanban/system-calendar.ts#listSystemCalendar(ctx, actor, {from,to,now,boardIds?})`
   คิวรีข้ามบอร์ดเที่ยวเดียว (ไม่วน `listBoardCalendar` ทีละบอร์ด — งบประสิทธิภาพ §12.1) ผ่าน `visibleBoardsWhere`
   เดียวกับ reports.ts/search.ts · หน้า `/kanban/calendar` (`page.tsx` ใหม่) + `SystemCalendar.tsx` (reuse
   โครงกริดเดือน/สัปดาห์ของ `CalendarView.tsx` แต่อ่านอย่างเดียว ไม่มีถาดลาก) · `nav.ts` ปลด "ปฏิทินงาน" จาก
   `soon` → `ready`
4. **REST op ของ P2 ครบ 26 ตัว** ไฟล์ใหม่ 7 ไฟล์ (`api/ops/{views,fields,templates,inbox,automation,reports,watch}.ts`)
   + เพิ่มใน `ops/boards.ts` (`boards.table`/`boards.calendar`) และ `ops/cards.ts`
   (`cards.fields.set`/`cards.recurrence.set`) — ทุกตัวเรียก service เดิม ไม่เขียน query เอง
5. **AI tool 4 ตัว** — `kanban_inbox_add` (เขียน→ข้อเสนอ) · `kanban_overdue_report` · `kanban_workload_report` ·
   `kanban_list_rules` (อ่าน) ประกาศผ่าน `tool:` ในทะเบียน (ไม่มีรายชื่อชุดที่สอง) · เพิ่มชื่อทั้ง 4 ใน
   `SKILLS.tasks.tools` + ปรับ `summary` — 🔴 ต้องขยาย `ASSISTANT_READ_SCOPES` ใน `kanban-ops.ts` เพิ่ม
   `kanban.report.view` (ดู §4 เหตุผล)
6. **docs/skill regen** — `pnpm exec tsx scripts/gen-kanban-api-docs.mts` → 82 op (56 เดิม + 26 ใหม่) ·
   `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/references/endpoints.md` + copy ไป
   `/root/.claude/skills/shark-kanban-api/`
7. **UI ค้าง 4 จุด**:
   - มือถือ: `MobileBoard.tsx` รับ prop `cardTemplates`/`onCreateFromTemplate` ใหม่ → แผ่นเพิ่มการ์ดเร็ว
     เรียก `<CardTemplatePicker>` ตัวเดียวกับเดสก์ท็อป (K2.7) เมื่อบอร์ดมีเทมเพลต
   - `CustomFieldsSettings.tsx`: ปุ่ม `field-edit-options` แก้ตัวเลือก SELECT / หน่วย NUMBER **หลังสร้างฟิลด์แล้ว**
     (ก่อนหน้านี้ตั้งได้แค่ตอนสร้าง)
   - `CardTemplatesSettings.tsx`: ปุ่ม `template-edit-title` แก้ "ชื่อการ์ด/รายละเอียด" ของเทมเพลต (สิ่งที่การ์ด
     ใหม่จะได้รับตอนสร้างจากเทมเพลตนี้ — ต่างจาก `name` ที่แก้ได้อยู่แล้ว)
   - `SavedViewsSettings.tsx`: ปุ่ม ↑↓ (`view-reorder`) จัดลำดับมุมมอง → action ใหม่ `reorderViewsAction`
     (`actions.ts`) เรียก `views.ts#reorderViews` (ฟังก์ชันมีอยู่แล้วตั้งแต่ K2.5 แต่ไม่เคยมี action/UI ห่อ)
8. **ชิป "โดยกฎอัตโนมัติ"** — migration additive `kanban_v2_p2`: `KanbanComment.automationRuleId String?` ·
   `automation.ts#writeAutomationComment` ตั้งค่าตอนเขียน (action `comment` ของกฎ) · `comments.ts#listComments`
   + `activity.ts` (สาย timeline รวม) คืนฟิลด์นี้ · `Comments.tsx#CommentRow` แสดงชิปฟ้า "โดยกฎอัตโนมัติ"
   ข้างชื่อผู้เขียนเมื่อ `automationRuleId` ไม่ null (ใช้ร่วมกับ `Timeline.tsx` เพราะ reuse `CommentRow` ตัวเดียวกัน)

## 2. ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20261007000000_kanban_v2_p2/migration.sql`
- `src/lib/modules/kanban/system-calendar.ts`
- `src/app/app/sys/[id]/kanban/calendar/page.tsx`
- `src/components/kanban/SystemCalendar.tsx`
- `src/lib/modules/kanban/api/ops/{views,fields,templates,inbox,automation,reports,watch}.ts`

**แก้**
- `prisma/schema/kanban.prisma` (`KanbanComment.automationRuleId`)
- `src/lib/modules/kanban/types.ts` (`SystemCal*Dto`/`SystemCalendarDto` + `KanbanCommentDto.automationRuleId`)
- `src/lib/modules/kanban/service.ts` (re-export `listSystemCalendar`)
- `src/lib/modules/kanban/nav.ts` (calendar → ready)
- `src/lib/modules/kanban/comments.ts` · `activity.ts` (automationRuleId ในทุกจุดที่ประกอบ `KanbanCommentDto`)
- `src/lib/modules/kanban/automation.ts` (`writeAutomationComment` ตั้ง `automationRuleId`)
- `src/lib/modules/kanban/actions.ts` (`reorderViewsAction` ใหม่)
- `src/lib/modules/kanban/api/registry.ts` (ต่อ op ใหม่ทั้งหมดเข้า `KANBAN_OPS`)
- `src/lib/modules/kanban/api/ops/boards.ts` (`boards.table`/`boards.calendar`)
- `src/lib/modules/kanban/api/ops/cards.ts` (`cards.fields.set`/`cards.recurrence.set`)
- `src/lib/ai/kanban-ops.ts` (`ASSISTANT_READ_SCOPES` เพิ่ม `kanban.report.view`)
- `src/lib/ai/skills.ts` (`SKILLS.tasks` เพิ่ม 4 tool + summary)
- `src/components/kanban/TableView.tsx` (bulk-bar ย้ายตำแหน่ง+ปรับสไตล์ · `TimeAgo` ใช้ `relativeThaiTime` ·
  ช่อง "กำหนดส่ง" ส่ง `chipText={due?.text}` ให้ `ThaiDatePicker`)
- `src/components/kanban/ThaiDatePicker.tsx` (เพิ่ม prop `chipText?: string` เสริม — ไม่ใส่ = พฤติกรรมเดิม)
- `src/components/kanban/TimelineView.tsx` (`timeline-bar-label`)
- `src/components/kanban/MobileBoard.tsx` (`cardTemplates`/`onCreateFromTemplate` + picker ในแผ่นเพิ่มการ์ดเร็ว)
- `src/components/kanban/BoardView.tsx` (ส่ง `cardTemplates`/`onCreateFromTemplate` ให้ `<MobileBoard>`)
- `src/components/kanban/settings/CustomFieldsSettings.tsx` (`field-edit-options`)
- `src/components/kanban/CardTemplatesSettings.tsx` (`template-edit-title`)
- `src/components/kanban/settings/SavedViewsSettings.tsx` (`view-reorder`)
- `src/components/kanban/Comments.tsx` (ชิป "โดยกฎอัตโนมัติ")
- `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/references/endpoints.md` (regen) +
  สำเนาไป `/root/.claude/skills/shark-kanban-api/`
- `scripts/visual-kanban.mts` (spec `"2.12"` 3 ภาพ + ขยายเงื่อนไขเตรียม/คืนสภาพเทมเพลตของ K2.7 ให้ครอบ `2.12` ด้วย)

## 3. รายการ op ใหม่ 26 ตัว (K2.12-S3.1)

| op id | method + path | kind | action | AI tool |
|---|---|---|---|---|
| `boards.table` | GET `/boards/{id}/table` | read | `kanban.board.read` | — |
| `boards.calendar` | GET `/boards/{id}/calendar` | read | `kanban.board.read` | — |
| `cards.fields.set` | PUT `/cards/{id}/fields/{fieldId}` | write | `kanban.card.update` | — |
| `cards.recurrence.set` | PUT `/cards/{id}/recurrence` | write | `kanban.card.update` | — |
| `views.list` | GET `/boards/{id}/views` | read | `kanban.board.read` | — |
| `views.create` | POST `/boards/{id}/views` | write | `kanban.board.read` | — |
| `views.delete` | DELETE `/views/{id}` | write | `kanban.board.read` | — |
| `fields.list` | GET `/boards/{id}/fields` | read | `kanban.board.read` | — |
| `fields.create` | POST `/boards/{id}/fields` | write | `kanban.board.read` | — |
| `fields.update` | PATCH `/fields/{id}` | write | `kanban.board.read` | — |
| `fields.delete` | DELETE `/fields/{id}` | write | `kanban.board.read` | — |
| `templates.cards.list` | GET `/boards/{id}/card-templates` | read | `kanban.board.read` | — |
| `templates.cards.create` | POST `/cards/{id}/card-templates` | write | `kanban.template.manage` | — |
| `inbox.list` | GET `/inbox` | read | `kanban.board.read` | — |
| `inbox.quickAdd` | POST `/inbox` | write | `kanban.card.create` | `kanban_inbox_add` |
| `inbox.move` | POST `/inbox/{id}/move` | write | `kanban.card.create` | — |
| `automation.rules.list` | GET `/boards/{id}/automation/rules` | read | `kanban.board.read` | `kanban_list_rules` |
| `automation.rules.create` | POST `/boards/{id}/automation/rules` | write | `kanban.automation.manage` | — |
| `automation.rules.toggle` | PUT `/automation/rules/{id}/toggle` | write | `kanban.automation.manage` | — |
| `automation.rules.dryRun` | POST `/boards/{id}/automation/rules/dry-run` | read | `kanban.automation.manage` | — |
| `reports.overdue` | GET `/reports/overdue` | read | `kanban.report.view` | `kanban_overdue_report` |
| `reports.workload` | GET `/reports/workload` | read | `kanban.report.view` | `kanban_workload_report` |
| `reports.throughput` | GET `/reports/throughput` | read | `kanban.report.view` | — |
| `reports.aging` | GET `/reports/aging` | read | `kanban.report.view` | — |
| `cards.watch` | PUT `/cards/{id}/watch` | write | `kanban.board.read` | — |
| `cards.unwatch` | DELETE `/cards/{id}/watch` | write | `kanban.board.read` | — |

ทะเบียนรวม 82 op (56 เดิม K1.15 + 26 ใหม่) · AI tool รวม 20 ตัว (16 เดิม + 4 ใหม่)

## 4. จุดตัดสินใจ / deviation (พร้อมเหตุผล)

1. **`ASSISTANT_READ_SCOPES` ต้องเพิ่ม `kanban.report.view`** — ไม่ได้เขียนไว้ตรง ๆ ในสัญญา แต่จำเป็นทางเทคนิค:
   `reports.overdue`/`reports.workload` เรียก `reports.ts#assertReportAccess` → `canViewReports()` ซึ่งต้องมีคีย์
   `kanban.report.view` ชัด ๆ เสมอ (ไม่ได้มาฟรีจาก `kanban.board.read` เหมือนคีย์อื่นของโมดูล — ออกแบบไว้ตั้งแต่
   K2.10 ให้รายงานเป็นสิทธิ์แยก) ผู้ช่วย AI ในแอป (`assistantActor`) เดิมมีแค่ scope `kanban.board.read` ⇒ เรียก
   tool รายงานไม่ได้เลยถ้าไม่เพิ่ม (พิสูจน์ด้วย node script จริง — ดู §6) เพิ่มให้แล้วเพราะผู้ช่วย AI ในแอปคุยกับ
   คนที่ล็อกอินอยู่ในร้านตัวเองอยู่แล้ว อ่านรายงานแทนเจ้าของร้านได้สมเหตุสมผล (คีย์ API ภายนอกยังต้องขอ
   scope `kanban.report.view` เองอยู่ดี ไม่กระทบ)
2. **`templates.cards.create` ใช้ action `kanban.template.manage`** (ไม่ใช่ `kanban.board.read`) — มี scope นี้
   อยู่แล้วใน `KANBAN_WRITE_SCOPES`/`KANBAN_ADMIN_SCOPES` (D18) ตรงความหมาย "จัดการเทมเพลต" ที่สุด
3. **`automation.rules.dryRun` เป็น `kind: "read"` แม้ใช้ `method: POST`** — มีบรรทัดฐานจาก
   `documents-read.ts#POST /documents/parse` ของบัญชี (K1.15/E1) — ไม่เขียน DB จริง แค่ต้องรับ body ก้อนใหญ่
   (กฎที่ยังไม่บันทึก) ซึ่ง GET query string ทำไม่ได้
4. **`cards.fields.set` แปลงสตริงวันที่เป็น `Date` โดยเรียก `getCardFieldValues` ก่อน 1 ครั้งเพื่อรู้ชนิดฟิลด์** —
   ไม่ query prisma ตรง (กติกาข้อ 1 ของ `ops/*.ts`) แต่แลกด้วยการอ่านฟิลด์ทั้งชุดของการ์ดก่อนเขียน 1 ค่า
   (ยอมรับได้ — ฟิลด์กำหนดเอง ≤ 20/บอร์ด ไม่ใช่คิวรีหนัก)
5. **ปฏิทินรวมระบบใช้ช่วง `[from,to]` ปิดทั้งสองฝั่ง** ต่างจาก `calendar.ts` ของบอร์ดใบเดียว (ครึ่งเปิด) — ไฟล์
   ใหม่ ไม่มีสัญญาผูกรูปแบบเดิม เลือกแบบที่ oracle ใช้ตรง ๆ (`dueAt: {gte: FROM, lte: TO}`) เพื่อให้ตัวเลข
   ตรงกับที่ oracle คำนวณเทียบ (S2.1 ผ่าน)
6. **ไม่ได้แก้ตรรกะช่วงปริยายของไทม์ไลน์** — ตรวจแล้วด้วย node script จริงว่า `anchorMs = fromMatch ? … : nowMs`
   ใน `page.tsx` (ของ K2.3) ครอบวันนี้อยู่แล้วเสมอเมื่อไม่ส่ง `?from=` (มอนเดย์ของสัปดาห์นี้ถึง +42 วัน) — สิ่งที่
   ขาดจริงมีแค่ `timeline-bar-label` (ข้อ 2 ใน §1) ส่วนคำว่า "ช่วงปริยายไม่รวมวันนี้" ในหนี้เดิมของ K2.3 น่าจะ
   หมายถึงภาพตัวอย่างที่ปักหมุด `?from=2026-09-16` (ใกล้ seed anchor) ไม่ใช่พฤติกรรมจริงของหน้า — บันทึกไว้
   เผื่อ Fable อยากยืนยันซ้ำ

## 5. ผลด่าน (ตัวเลขจริง)

**Oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.12.mts` (รอบแรกก่อน Fable ตรวจรับ)
```
ผ่าน 12/13
FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":13,"passed":12,"findings":["K2.12-S3.3"]}
```
(S1.1/S1.2/S1.3/S2.1/S2.2/S3.1/S3.2/S3.4/S4.1/S4.2/S4.3/S4.4 ผ่านหมด — S3.3 เป็นข้อแย้ง ดู §6)

**รอบสอง — หลัง Fable ตรวจรับ**: (1) แก้ oracle S3.3 ให้เทียบด้วย `now` จริง (ยืนยันข้อแย้งถูกต้อง) (2) พบ
parity gap เพิ่ม 1 จุด (ช่อง "กำหนดส่ง" ในตารางยังเป็นวันที่เต็มสีเทาทุกแถว ไม่ใช่ชิปสัมพัทธ์+สีตามความเร่ง) —
แก้แล้วตามที่บันทึกใน §1 ข้อ 1 → build ใหม่ → ถ่ายภาพ spec `2.12` ซ้ำ + ภาพยืนยันสี (ดูด้วยตา §6) → ปิด
เซิร์ฟเวอร์ → tsc 0 error → รัน `qc-kanban-k2.1.mts` (22/22 ไม่กระทบ) + `qc-kanban-k2.12.mts`:
```
ผ่าน 13/13
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":13,"passed":13,"findings":[]}
```

**Regressions** (รอบแรก หลัง build เสร็จ + ปิดเซิร์ฟเวอร์แล้ว — รันทีละไฟล์ ก่อนแก้ parity gap รอบสอง)
```
k1.1  30/30* k1.6  20/20  k1.11 21/21  k2.2  16/16  k2.7  31/31  k2.12 12/13**
k1.2  25/25  k1.7  21/21  k1.12 18/18  k2.3  17/17  k2.8  17/17
k1.3  29/29  k1.8  18/18  k1.13 16/16  k2.4  12/12  k2.9  26/26
k1.4  30/30  k1.9  18/18  k1.14 15/15  k2.5  15/15  k2.10 22/22
k1.5  17/17               k1.15 30/30  k2.6  17/17  k2.11 30/30
k1.10 16/16
```
`*` k1.1 แดง 3 ข้อ (`K1.1-S2.5`/`K1.1-S4.1`/`K1.1-S4.2`) ตอนรันรวมทั้งชุด 28 ไฟล์ติดกัน — รันซ้ำเดี่ยว ๆ ทันที
ได้ 30/30 เขียวสนิท (ยืนยัน 2 ครั้ง) — ตรงกับ flake ที่บันทึกไว้แล้วใน `kanban-K2.2.md`/`kanban-K2.3.md`
(ชนคิว `cardNoSeq`/`position` ของบอร์ดป่าตอง QC เดียวกันที่สคริปต์อื่นในชุดแตะพร้อมกัน — ไม่ใช่ผลจาก K2.12)
`**` k2.12: 1 ข้อแดง = `K2.12-S3.3` ก่อนแก้ oracle — รอบสองหลังแก้ oracle + parity gap ได้ 13/13 (ด้านบน)
รอบสองรัน `qc-kanban-k2.1.mts`/`qc-kanban-k2.12.mts` เฉพาะ 2 ไฟล์ตามที่ Fable สั่ง (ไม่ได้รันรวมทั้งชุดซ้ำ —
การแก้รอบสองแตะเฉพาะ `ThaiDatePicker.tsx`/`TableView.tsx` ที่ผ่าน `qc-kanban-k2.1.mts`/K1.6(card-back due
chip)/K2.2(calendar drag ใช้ `setCardDueFromCalendarAction` คนละทาง) แล้ว ความเสี่ยงกระทบไฟล์อื่นต่ำ)

**ข้อสอบเก่า (กติกาข้อ 9)**
```
qc-ai-skills.mts        23/23
qc-nav-functions.mts    10/10 (KANBAN 8 ฟังก์ชันย่อย — calendar ขึ้นทะเบียนแล้ว)
qc-kanban-notify.mts    12/12
qc-ai-kanban-board.mts  3/3
```

**typecheck** — `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error**

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
F13.4: op ของบอร์ดงาน 82 ตัวมี test id ครบ · F13.5: docs ไม่ stale · F13.6: tool 20 ตัวมีบ้านในสกิลครบ ·
F2.1: import ข้ามโมดูล 51 เส้น / อนุญาต 54 (ไม่เพิ่มเส้นใหม่ — ไฟล์ใหม่ทั้งหมดอยู่ในโมดูล kanban ล้วน)

**ภาพจริง** — `pnpm exec tsx scripts/visual-kanban.mts 2.12` → 3 ใบ ใน `.qc-shots/kanban/2.12/` failures 0
- `table-bulk-selected-desktop.png` — ติ๊ก 2 แถวแรก: แถบฟ้าอ่อนอยู่บนหัวตาราง (ไม่ใช่ pill ลอยดำล่างจอ) ตรง
  ตำแหน่ง/โทนสีของภาพ 04 · "เลือก 2 การ์ด" ตัวหนา + ลิงก์ 5 การกระทำทางขวา (ย้ายไปคอลัมน์ · มอบหมาย · ติดป้าย ·
  ตั้งกำหนดส่ง · เก็บเข้าคลัง) · ชิปกำหนดส่ง/คอลัมน์ "แก้ไขล่าสุด" แสดง "37 นาทีที่แล้ว" (สัมพัทธ์)
- `system-calendar-desktop.png` — ปฏิทินรวมทุกบอร์ดที่มองเห็น: กริดเดือนกันยายน 2569 เต็ม 7×5 · การ์ดสีตาม
  บอร์ด (น้ำเงิน=งานร้าน–สาขาป่าตอง เขียว=ซ่อมบำรุงอุปกรณ์ แดง=บอร์ดลับสาขากะตะ) + ชื่อบอร์ดกำกับใต้ชื่อการ์ด ·
  วันที่ 7 (วันนี้จริง) ไฮไลต์วงกลมฟ้า · ปุ่ม "บอร์ดทั้งหมด" มุมขวาบน · แท็บ "ปฏิทินงาน" active ในหัวบอร์ดงาน
- `mobile-template-create-mobile.png` — มือถือ: กด FAB → แผ่นเพิ่มการ์ดเร็วเลื่อนขึ้น → กด "จากเทมเพลต ▾" →
  รายการเทมเพลต ("ตรวจถังอากาศ (ภาพ)" + คำบรรยาย) โผล่เป็น popover เหนือปุ่ม — ตรงสัญญา S4.1

## 6. ข้อแย้ง oracle — K2.12-S3.3 (ขอให้ Fable ตัดสิน)

ข้อสอบเปรียบเทียบผลลัพธ์จาก 2 ทาง ที่คำนวณด้วย **"เวลาอ้างอิง" (`now`) ต่างกัน**:
```js
const od = await rp.overdue(ctxO, owner, { now: NOW });                 // NOW = kq.dayFromToday(0, 10)
const tOd = await kops.runKanbanTool(tid, "kanban_overdue_report", {}, { systemId: SYS }); // ใช้ new Date() ข้างใน
chk(..., tOd.result?.total === od.total, ...);
```
`NOW` มาจาก `KQC.today = "2026-09-30"` (ค่าคงที่ตายตัวใน `kanban-qc-env.mts`) → `NOW = 2026-09-30T03:00:00.000Z`
ส่วน `runKanbanTool`/op `reports.overdue` (เหมือน op อื่นทุกตัวในทะเบียนทั้งบัญชีและบอร์ดงาน — ไม่มี op ไหน
รับ `now` จากผู้เรียกเลย) ใช้เวลาจริงของเซิร์ฟเวอร์ (`new Date()`) เสมอ — ถูกต้องตามหลักการของ REST/AI tool ที่
ใช้งานจริง (ไม่มีทางให้ผู้เรียกภายนอก "แต่งเวลาปัจจุบัน" ของ API ได้)

**หลักฐาน 3 ชั้น** (probe จริงบน DB เดียวกับที่ oracle ใช้ — ลบสคริปต์ทิ้งหลังรันแล้ว):
```
NOW (seed anchor): 2026-09-30T03:00:00.000Z
real now:           2026-09-07T09:54:49.030Z
total with seed NOW: 9
total with real now: 4
```
ต่างกันเพราะการ์ด QC ถูกตั้ง `dueAt` ไว้รอบ ๆ `KQC.today` (30 ก.ย. 69) ผ่าน `dayFromToday(n)` — ณ เวลาจริงวันนี้
(7 ก.ย. 69) มีการ์ดที่เลยกำหนดจริงแค่ 4 ใบ แต่ถ้ายืนอยู่ที่ "วันนี้" ของ seed (30 ก.ย.) จะนับได้ 9 ใบ (อีก 5 ใบ
จะเลยกำหนดในอนาคตแต่ยังไม่เลยกำหนดจริง ณ วันนี้)

⇒ ไม่มีทางทำให้ `tOd.total === od.total` ได้ด้วยการแก้โค้ด op (การใช้เวลาจริงคือพฤติกรรมที่ถูกต้องของ API ·
ทุก op อื่นในทะเบียนก็ทำแบบเดียวกัน) เว้นแต่จะเปิดช่องให้ tool รับ `now` มาจากผู้เรียก ซึ่งเป็นช่องโหว่ (agent
ภายนอก/ผู้ใช้แต่งเวลาปัจจุบันเพื่อบิดตัวเลขรายงานได้) — **builder ไม่แก้ oracle ตามกติกาข้อ 1** หยุดไว้ที่ข้อนี้
และรายงาน ทางแก้ที่เสนอ (เลือกอย่างใดอย่างหนึ่ง): (ก) แก้ oracle ให้เทียบด้วย `now` เดียวกัน (เรียก `overdue()`
ตรงด้วย `now: new Date()` แทน `NOW`) หรือ (ข) ยอมรับว่าข้อนี้เทียบได้แค่ "mode ถูกต้อง" (`read`) ไม่เทียบตัวเลข
เป๊ะ (เหมือนบางข้อสอบอื่นที่เทียบ shape ไม่เทียบค่า) — เหมือนกรณี `K1.15-S2.16` (BOM) ที่เจอมาก่อนหน้านี้

## 7. หนี้ที่ฝากไว้

1. `CardTemplatesSettings.tsx` — ช่องแก้ "รายละเอียด" (`description`) ของเทมเพลตพรีฟิลเป็นค่าว่างเสมอตอนเปิด
   แก้ไข (ไม่ใช่ค่าเดิม) เพราะ `CardTemplateDto` (DTO สาธารณะ) ไม่มีฟิลด์ `description` — เขียนทับได้ (เขียน
   ค่าใหม่จริง) แต่ยังไม่เห็นค่าเดิมก่อนแก้ ถ้าต้องพรีฟิลจริง ๆ ต้องเพิ่ม `description` เข้า `CardTemplateDto`
   (กระทบ `card-templates.ts#toDto`) — ยังไม่ทำใน WO นี้ (ไม่ได้ทดสอบโดย oracle)
2. ความเห็นที่กฎอัตโนมัติเขียน (`automationRuleId` ไม่ null) ยัง "แก้ไข/ลบได้" ตามเงื่อนไขเดิม
   (`comment.author.userId === currentUserId` — ตกที่ผู้สร้างการ์ด/เจ้าของร้านที่ถูกใช้เป็น `authorUserId`
   ภายใน) — ตามหลักการควรล็อกไม่ให้แก้/ลบความเห็นที่ระบบเขียน แต่ไม่มีในสัญญา K2.12 และ oracle ไม่ตรวจ จดไว้
   เป็นหนี้เผื่อ P3
3. K2.12-S3.3 (ข้อแย้ง oracle §6) — ยังไม่ปิด รอ Fable ตัดสิน

## 8. ข้อสอบเก่าที่ยังมีหนี้ (ไม่ใช่ของ WO นี้)

ไม่มีเพิ่มจาก K2.12 — regressions ทั้งหมดเขียว (ยกเว้น k1.1 flake ที่พิสูจน์แล้วว่าไม่เกี่ยว)
