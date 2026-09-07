# K2.9 — ตัวสร้างกฎอัตโนมัติของบอร์ด 5 ชนิด (RULE · CARD_BUTTON · BOARD_BUTTON · SCHEDULED · DUE_DATE)

> ผู้ทำ: Opus (builder) · worktree `shark-kanban` branch `session/kanban` · ยังไม่ commit/push ตามคำสั่ง
> ข้อสอบ: `scripts/qc-kanban-k2.9.mts` (26 ข้อ · Fable เขียน · builder ไม่แตะ)

## ทำอะไรไปบ้าง

### 1) Prisma + migration (additive ล้วน)
- `prisma/schema/automation.prisma`
  - `AutomationRule` เพิ่ม `systemId? boardId? kind(default "RULE") conditions(Json []) actions(Json []) scheduleCron? dueOffsetDays? lastRunAt?` + `@@index([tenantId, boardId, enabled])`
  - `AutomationRun` เพิ่ม `boardId? cardId?` + `@@index([tenantId, ruleId, createdAt])`
  - **ไม่แตะคอลัมน์เดิม** (`minAmountSatang` / `actionType` / `actionConfig` ยังอยู่ครบ — กฎ POS/คลังของร้านอ่านอยู่)
- `prisma/migrations/20261005000000_kanban_v2_q/migration.sql` — มีแต่ `ADD COLUMN` (nullable/มี default ทุกตัว) + `CREATE INDEX` · อ่าน SQL ด้วยตาแล้ว ไม่มีคำสั่งทำลายข้อมูล · ลง QC ด้วย `prisma migrate deploy` + `prisma generate` (ไม่ได้รัน `prisma format`)
- `src/lib/core/scope.ts` — ไม่ต้องแก้ (`AutomationRule`/`AutomationRun` เป็น `tenant` อยู่แล้ว)

### 2) เอนจิน
- `src/lib/automation/engine.ts#runForEvent`
  - จำกัด `where { event, enabled, boardId: null }` = **กฎระดับร้านเท่านั้น** (ไม่งั้นเอนจินเดิมจะเห็นกฎบอร์ดแล้วยิงแจ้งเตือนทั้งร้านทุกครั้งที่การ์ดขยับ)
  - `evt.type.startsWith("kanban.")` → `await import("@/lib/modules/kanban/automation")` แล้วบวกค่าที่ `runForKanbanEvent(evt, deps)` คืน (lazy import กัน import วงกลม) · `withAutomation` ไม่ต้องแก้
- `src/lib/modules/kanban/automation.ts` (ใหม่ · ไม่มี `any`) — zod ของ `KanbanRuleInput` / เงื่อนไข 6 ชนิด / การกระทำ 13 ชนิด · `createRule updateRule toggleRule deleteRule listRules describeRule describeCondition describeAction describeCron parseKanbanCron dryRun runForKanbanEvent sweepScheduledRules sweepDueDateRules runButton listButtons listRuns usageThisMonth canManageAutomation matchesConditions readConditions readActions`
- `src/lib/modules/kanban/automation-actions.ts` (ใหม่ · `"use server"` · export เฉพาะ action 6 ตัว): `createRuleAction updateRuleAction toggleRuleAction deleteRuleAction dryRunAction runButtonAction`

### 3) ทะเบียน event + consumer + cron
- `src/lib/automation/labels.ts` — เพิ่ม `KANBAN_AUTOMATION_EVENTS` (8 ตัวของ §7.2 ป้ายไทย) แล้ว spread เข้า `AUTOMATION_EVENTS`
- `src/lib/webhooks/labels.ts` — **ถอด** `kanban.card.created` / `due_soon` / `overdue` ที่เคยประกาศซ้ำออก (ตอนนี้มาทาง `AUTOMATION_EVENTS` แล้ว) เหลือ `kanban.card.archived` ตัวเดียวที่ไม่ใช่ทริกเกอร์ของกฎ ⇒ `WEBHOOK_EVENTS` ยังมี `kanban.*` 9 ตัว (K1.15-S3.6 ต้องการ ≥ 9) และไม่มีตัวซ้ำอีกต่อไป
- ตรวจแล้ว: ทั้ง 8 event **มี consumer ครบ** ใน `src/lib/outbox-consumers.ts` อยู่ก่อนแล้ว (ไม่ต้องเพิ่มใหม่)
- `src/app/api/cron/hourly/route.ts` — เรียก `sweepScheduledRules(new Date())` best-effort (try/catch + logOps WARN)
- `src/lib/platform/cron.ts#runDailyCron` — เพิ่ม `kanbanDueRules = await sweepDueDateRules(now)` ใน try/catch ของตัวเอง · **ไม่แตะ `vercel.json`**

### 4) เพดาน + สิทธิ์
- `src/lib/modules/kanban/limits.ts` — `actionsPerRule: 20` · `automationRunsPerMonth: 1000`
- สิทธิ์จัดการกฎ = (OWNER **หรือ** คีย์ `kanban.automation.manage`) **และ** ADMIN ของบอร์ดใบนั้น · ปุ่มอัตโนมัติ = EDITOR ของบอร์ด
- `automation-actions.ts` มีด่านชั้นที่ 1 (`assertCan` ของ RBAC ร้าน) ก่อนเข้า service ทุกตัว (fitness F6.1)

### 5) UI
- `src/app/app/sys/[id]/kanban/automation/page.tsx` (ใหม่ · server) — `?board=` · ไม่มีคีย์/ไม่เป็น ADMIN ของบอร์ดไหนเลย/ระบุบอร์ดที่ไม่ได้เป็น ADMIN → `notFound()`
- `src/components/kanban/AutomationBuilder.tsx` (ใหม่ · client) ตามภาพ 08
- `src/components/kanban/CardBack.tsx` — ปุ่ม CARD_BUTTON อยู่ในรางขวา บล็อก "ทำต่ออัตโนมัติ" testid `card-button` (บล็อกนี้เคยเป็นข้อความ "เร็ว ๆ นี้" ค้างมาจาก K1.6 — แทนที่ด้วยปุ่มจริง ไม่ปล่อยให้จอบอกว่า "ยังไม่มี" ทั้งที่มีปุ่มอยู่)
- `src/components/kanban/BoardHeader.tsx` — ปุ่ม BOARD_BUTTON testid `board-button` + ปุ่ม "อัตโนมัติ" (เดิม disabled "เร็ว ๆ นี้") กลายเป็นลิงก์จริงของ ADMIN
- `src/lib/modules/kanban/nav.ts` — หมวด `automation` เป็น `ready`
- ตั้งค่าบอร์ด › แท็บ "อัตโนมัติ" — เดิม `SoonTab` → เป็นทางเข้าไปหน้าเต็ม (ลบ `SoonTab` ที่ไม่มีใครใช้แล้วออก)
- DTO: `BoardViewDto.automationButtons` + `CardDetailDto.cardButtons` (server ส่ง `[]` ให้ VIEWER — ปุ่มที่กดไม่ได้ไม่ต้องโผล่)

### 6) ของเดิมที่ถูกแก้ (เล็ก แต่ต้องรู้)
- `cards.ts#setCardAssignees(ctx, cardId, ids, opts?)` — เพิ่ม `opts.notify` (ปริยาย `true` = พฤติกรรมเดิมเป๊ะ) · กฎอัตโนมัติส่ง `false`
- `types.ts#KanbanCtx.automation?: { ruleId }` + `activity-log.ts#logActivity({ automation })` — ผสมเป็น `data.automation = { ruleId }` · `labels.ts` / `cards.ts` ส่ง `ctx.automation` ต่อให้
- `scripts/fitness.mts` — `ALLOWED_EDGES` เพิ่ม `"kanban→approval"` พร้อมคอมเมนต์อ้าง K2.9 (Fable อนุมัติล่วงหน้าใน KANBAN-RUN ท้าย §K3.2)
- `scripts/visual-kanban.mts` — spec `"2.9"` (5 ใบ) + บล็อกเตรียม/คืนสภาพกฎตัวอย่าง 4 ใบ + บันทึกการทำงาน 3 แถว
- `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/references/endpoints.md` — regenerate (ลำดับ event ใน `WEBHOOK_EVENTS` เปลี่ยนหลังถอดตัวซ้ำ)

## ผลด่าน (ตัวเลขจริง)

| ด่าน | ผล |
|---|---|
| `qc-kanban-k2.9.mts` | **26/26** (CRITICAL 0 · MAJOR 0 · MINOR 0) |
| typecheck `tsc --noEmit` | **0 error** |
| `fitness.mts` | **23/23** (F2.1 มีแค่เส้น `kanban→approval` เพิ่ม) |
| ภาพ spec `"2.9"` | **5 ใบ** ใน `.qc-shots/kanban/2.9/` · failures 0 |

### regressions รายชุด (ทุกชุดเขียว)

| ชุด | ผล | ชุด | ผล |
|---|---|---|---|
| k1.1 | 30/30 † | k2.1 | 22/22 |
| k1.2 | 25/25 | k2.2 | 16/16 |
| k1.3 | 29/29 | k2.4 | 12/12 |
| k1.4 | 30/30 | k2.5 | 15/15 |
| k1.5 | 17/17 | k2.6 | 17/17 |
| k1.6 | 20/20 | k2.7 | 31/31 |
| k1.7 | 21/21 | k2.8 | 17/17 |
| k1.8 | 18/18 | `qc-kanban-notify` | 12/12 |
| k1.9 | 18/18 | `qc-nav-functions` | 10/10 (KANBAN 6 ฟังก์ชันย่อย — เพิ่ม "อัตโนมัติ") |
| k1.10 | 16/16 | `qc-automation` (กฎร้านเดิม) | 13/13 |
| k1.11 | 21/21 | `qc-webhook` | 15/15 |
| k1.12 | 18/18 | `qc-webhook-ui` | 11/11 |
| k1.13 | 16/16 | | |
| k1.14 | 15/15 | | |
| k1.15 | 30/30 | | |

† k1.1 รอบแรกได้ 28/30 (`K1.1-S2.3` + `K1.1-S2.5`) ตอนรันคู่กับเซิร์ฟเวอร์ QC ที่เปิดค้างอยู่ · รันซ้ำทันที **30/30** — flake เดิมของชุดนั้น ไม่ใช่ของ K2.9

## ข้อแย้งกับ oracle

### K2.9-S1.1 — เงื่อนไข index ของ `AutomationRule` เขียนไว้แบบที่ Postgres ทำให้จริงไม่ได้ (✅ Fable แก้ oracle แล้ว 13:20)
ข้อนี้ตรวจ 2 อย่าง: (ก) คอลัมน์ครบ (ข) มี index ที่ `indexdef ilike '%"boardId"%' AND indexdef ilike '%"enabled"%'`

- (ก) **ผ่าน** — `act` ที่ข้อสอบพิมพ์ออกมาเองมีครบทั้ง 11 คอลัมน์: `id,tenantId,name,event,enabled,minAmountSatang,actionType,actionConfig,createdAt,updatedAt,actions,boardId,conditions,dueOffsetDays,kind,lastRunAt,scheduleCron,systemId`
- (ข) **เป็นไปไม่ได้** — migration เขียน `CREATE INDEX "AutomationRule_tenantId_boardId_enabled_idx" ON "AutomationRule"("tenantId", "boardId", "enabled");` (มีอัญประกาศครบทั้ง 3 คอลัมน์) แต่ `pg_indexes.indexdef` มาจาก `pg_get_indexdef()` ซึ่ง **normalize อัญประกาศทิ้ง** สำหรับ identifier ที่เป็นตัวพิมพ์เล็กล้วนและไม่ใช่คำสงวน · ผลจริงจาก DB QC:

```
CREATE INDEX "AutomationRule_tenantId_event_enabled_idx" ON public."AutomationRule" USING btree ("tenantId", event, enabled)
CREATE INDEX "AutomationRule_tenantId_boardId_enabled_idx" ON public."AutomationRule" USING btree ("tenantId", "boardId", enabled)
```

`"tenantId"` / `"boardId"` มีอัญประกาศ (camelCase) แต่ `enabled` ไม่มี ⇒ `ilike '%"enabled"%'` ไม่มีวันตรง ไม่ว่าจะสร้าง index แบบไหน (คอลัมน์ธรรมดา / partial / INCLUDE / expression ก็ถูก normalize เหมือนกัน)
S1.2 ผ่านเพราะบังเอิญคอลัมน์ที่ตรวจ (`ruleId` / `createdAt`) เป็น camelCase ทั้งคู่

**ไม่ได้แก้ข้อสอบและไม่ได้สร้าง index ปลอมให้สตริงตรง** — index ที่ต้องการมีอยู่จริงและ query ของเอนจินเดินเส้นนั้นจริง
**ผลสรุป**: Fable รับข้อแย้งและแก้ oracle เป็น `indexdef ilike '%"boardId"%' and indexdef ilike '%enabled%'` (13:20) ⇒ ข้อนี้ผ่านโดยไม่ต้องแตะโค้ด/สคีมา

## Deviation + เหตุผล

1. **`sweepDueDateRules(now)` คืน "จำนวนกฎ" ไม่ใช่ "จำนวนการ์ด"** — ชุดข้อมูล seed มีการ์ด `BCD Aqualung ตัวที่ 4 ปุ่มเติมลมค้าง` บนบอร์ดซ่อมบำรุงที่ `due: 2` (= วันเดียวกับ `cardE` ที่ข้อสอบสร้าง) ⇒ ถ้านับเป็น "การ์ด" จะได้ 2 ไม่ใช่ 1 ตามที่ข้อสอบคาด · การนับเป็น "กฎที่ทำงานในรอบนี้" ยังตรงกับ `sweepScheduledRules` (คืนจำนวนกฎเหมือนกัน) และตรงกับ `d2 === 0` (รันซ้ำวันเดียวกัน = ไม่มีกฎไหนทำอะไร)
2. **การกระทำ `assign` ไม่ยิงแจ้งเตือน "ได้รับมอบหมายงาน"** (`setCardAssignees(..., { notify: false })`) — กฎมีการกระทำ `notify` ของตัวเองให้ผู้ตั้งกฎเขียนข้อความเอง ปล่อยให้ยิงทั้งคู่ = ผู้รับได้ 2 ใบเรื่องเดียวกันทุกครั้งที่กฎวิ่ง (ข้อสอบ S4.1 ก็บังคับให้เหลือใบเดียว) · ผู้เรียกเดิมทุกจุดไม่กระทบ (ปริยายยังแจ้งเหมือนเดิม)
3. **การกระทำ `comment` เขียนแถว `KanbanComment` ตรง ไม่ผ่าน `comments.addComment`** — `authorUserId` เป็น NOT NULL และ `addComment` บังคับว่าผู้เขียนต้องเป็นคนที่ล็อกอินอยู่ · กฎอัตโนมัติไม่มีคน ⇒ ลงชื่อ "ผู้สร้างการ์ด" (ตกไปที่เจ้าของร้าน) แล้วบันทึกประวัติเป็น "ระบบทำ" (`actorUserId = null` + `data.automation`) · **จงใจไม่ยิง outbox `kanban.comment.added`** ไม่งั้นกฎที่ฟัง "มีความเห็นใหม่" จะวนใส่ตัวเอง
4. **ผู้เรียกที่ไม่ใช่คนของเอนจิน ใช้ `KanbanActor.apiRole = "ADMIN"`** — service เดิม (`moveCard`/`checklists`/`archiveCard`/`updateCardFields`) ตรวจบทบาทในบอร์ดของผู้เรียกเสมอ · ใช้ช่องทาง D18 (คีย์ API = ผู้เรียกที่ไม่ใช่คน) ที่มีอยู่แล้วแทนการเจาะด่าน · `actorUserId` ยังเป็น `null` ⇒ ประวัติขึ้นว่า "ระบบทำ"
5. **`AutomationRule.event` ของกฎที่ไม่ผูก event เก็บ `""`** — ช่องนี้ NOT NULL มาแต่เดิมและห้ามแก้คอลัมน์เดิม
6. **UI ยังไม่รองรับการกระทำ `add_link`** (ทางเลือกของ K3.1) — service ก็ยังไม่มี (สัญญาระบุว่าไม่บังคับใน oracle)

## หนี้ที่เหลือ

- `describeRule` ยกเงื่อนไข "คอลัมน์" เข้าประโยค `เมื่อ…` เฉพาะ event `kanban.card.moved` (ตามภาพ 08) — event อื่นเงื่อนไขคอลัมน์ยังอยู่ใน `และถ้า…`
- ความเห็นที่กฎเขียนขึ้นชื่อ "ผู้สร้างการ์ด" บนจอ (ยังไม่มีชิป "เขียนโดยกฎอัตโนมัติ" ในสาย `Comments.tsx`) — ข้อมูลจริงแยกได้จาก `KanbanActivity.data.automation` แล้ว
- แผง "คำแนะนำจาก AI" ว่างตามแผน (K3.6) · ประเภท "รายงานอีเมล" ปิดไว้ "เร็ว ๆ นี้"
- `dryRun` ของ kind `DUE_DATE` แสดงการ์ดที่ครบกำหนดใน N วันข้างหน้าที่ผ่านเงื่อนไข (ไม่ได้จำลอง offset รายวันย้อนหลัง)
