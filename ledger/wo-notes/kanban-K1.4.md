# WO K1.4 — ย้ายการ์ด/คอลัมน์ (fractional · concurrency · neighbor fallback · rebalance) + คอลัมน์เสร็จ/`completedAt` + WIP + `cardNo` unique

> ผู้ทำ: Opus (builder) · 6 ก.ย. 2026
> สัญญา: `ledger/KANBAN-RUN.md` §K1.4 (+ D10/D14/D16) · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §5.5 · §7.1–7.2 · §11.1–11.4
> ข้อสอบ: `scripts/qc-kanban-k1.4.mts` (Fable · ไม่แตะ)

## สถานะ

| ด่าน | ผล |
|---|---|
| `qc-kanban-k1.4.mts` | **27/28 · CRITICAL 1 · MAJOR 0** — ข้อที่ตก = `K1.4-S4.1` เป็นข้อสมมติของข้อสอบเอง 2 จุด (§7 มีหลักฐาน + positive control) |
| `qc-kanban-k1.1.mts` | ✅ 30/30 |
| `qc-kanban-k1.2.mts` | ✅ 25/25 |
| `qc-kanban-k1.3.mts` | ✅ 29/29 |
| `qc-kanban-notify.mts` | ✅ 12/12 (`QC_ENV_FILE=.env.qc`) |
| `qc-ai-kanban-board.mts` | ✅ 3/3 |
| `pnpm exec tsc --noEmit` | ✅ 0 error |
| `pnpm fitness` 2 โหมด | ✅ 20/20 และ 20/20 (`env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET`) |
| ไม่มี `any` ใน `src/` · F5 raw-prisma ไม่ขยับ (`moves.ts` import จาก `./db`) | ✅ |

migration ลงเฉพาะ QC (`ep-plain-art`) แล้ว · prod ลงตอน Vercel build · ทิ้ง tree ไว้ dirty ตามสั่ง (ไม่ commit)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/kanban/moves.ts` | **ใหม่ (แกนของ WO)** — `moveCard` `moveCardSideways` `moveColumn` `setColumnDone` `setColumnWip` `renameColumn` `archiveColumn` `moveAllCards` (prisma จาก `./db` เท่านั้น) |
| `prisma/schema/kanban.prisma` | + `@@unique([boardId, cardNo])` บน `KanbanCard` (คง `@@index([boardId, cardNo])` ของ K1.1 ไว้ ไม่ลบ) |
| `prisma/migrations/20260922000000_kanban_v2_d/migration.sql` | **ใหม่** — 1 คำสั่ง เพิ่มอย่างเดียว (§4) |
| `src/lib/outbox-consumers.ts` | + consumer `kanban.card.moved` / `kanban.card.completed` (`withAutomation(no-op)` → ถูกห่อ `withWebhooks` อัตโนมัติเหมือนตัวอื่น) |
| `src/lib/automation/labels.ts` | + `AUTOMATION_EVENTS` 3 ตัว: `kanban.card.moved` / `kanban.card.assigned` / `kanban.card.completed` (spread ต่อเข้า `WEBHOOK_EVENTS` ให้เอง) |
| `src/lib/modules/kanban/actions.ts` | `moveCardAction` (รับ before/after + คืนผลลัพธ์) · `moveCardSidewaysAction` · `moveColumnAction` · `renameColumnAction` · `setColumnWipAction` · `setColumnDoneAction` · `moveAllCardsAction` · `archiveColumnAction` เปลี่ยนไปใช้ตัวใหม่ (ต้องว่างก่อน) |
| `src/lib/modules/kanban/ui.tsx` | ปุ่ม ◀ ▶ เดิมชี้ไป `moveCardSidewaysAction` (form action ต้องคืน void — `moveCardAction` คืนค่าให้ตัวลากวางของ K1.5) |
| `scripts/probe-kanban-k1.4.mts` | **ใหม่ (ของ builder ไม่ใช่ oracle)** — positive control ของ rebalance + วัดอัตราโตคีย์ + concurrency (§7) · ลบทิ้งได้ |

ไม่ได้แตะ: `ordering.ts` (K1.1 ครบแล้ว) · `service.ts` (ตัวเดิม `moveCard`/`moveCardSideways`/`archiveColumn`/`renameColumn` ยังอยู่ให้ผู้เรียกเก่า/AI/ข้อสอบเก่าเรียกได้เหมือนเดิม) · `permissions.ts` (ใช้คีย์เดิม §6) · ไฟล์ข้อสอบทุกตัว

---

## 2. สัญญาที่ implement (`moves.ts`)

```ts
moveCard(ctx, { cardId, toColumnId, beforeCardId?, afterCardId?, force? })
  → { ok:true, position, placedAt:"between"|"end", card }
  | { ok:false, code:"CARD_ARCHIVED"|"WIP_LIMIT"|"NOT_FOUND"|"CROSS_BOARD", message }
moveCardSideways(ctx, { cardId, direction })         // ปุ่ม ◀ ▶ เดิม → ต่อท้ายคอลัมน์ข้าง ๆ ผ่าน moveCard
moveColumn(ctx, { columnId, beforeColumnId?, afterColumnId? }) → { ok:true, position, placedAt }
setColumnDone(ctx, columnId, boolean) · setColumnWip(ctx, columnId, n|null)
renameColumn(ctx, columnId, name) · archiveColumn(ctx, columnId)        // ต้องว่างก่อน
moveAllCards(ctx, { fromColumnId, toColumnId }) → { moved }
```

- **`{ok:false}` vs throw**: "โลกเปลี่ยนไประหว่างลาก" (การ์ดถูกเก็บ · คอลัมน์เต็ม · คอลัมน์ของบอร์ดอื่น · หาไม่เจอ) = คืนค่า ไม่ throw → UI ลากวางเอาไป rollback + toast ได้โดยไม่ต้อง try/catch · ส่วน **สิทธิ์** ยัง throw ตามกติกา §6.3 (มองไม่เห็น = 404 · ยศไม่ถึง = 403)
- **สิทธิ์ (D16)**: ย้ายการ์ด/ย้ายคอลัมน์/เปลี่ยนชื่อคอลัมน์/`moveAllCards` = **EDITOR** · `force` (ข้าม WIP)/`setColumnWip`/`setColumnDone`/`archiveColumn` = **ADMIN** — ผ่าน `assertBoardRole`/`assertColumnRole` ของ K1.3 (หาบอร์ดจาก id จริงเสมอ ไม่เชื่อ `boardId` ที่ client ส่ง)
- **client ส่งได้แค่ id เพื่อนบ้าน** — server อ่าน `position` จริงใน tx แล้ว `generateKeyBetween()` เอง (§11.1)

## 3. concurrency: ล็อกอะไร · แตกเสมออย่างไร

**ล็อก** — ทุก tx ของการย้ายเปิดด้วย `SELECT "id" FROM "KanbanColumn" WHERE id=$1 AND tenantId=$2 AND systemId=$3 FOR UPDATE`
บนคอลัมน์ **ต้นทาง + ปลายทาง** โดย**เรียงตาม id ก่อนล็อกเสมอ** (ล็อกสลับทาง A→B พร้อม B→A = deadlock)
⇒ การอ่านเพื่อนบ้าน + gen คีย์ + เขียน อยู่หลังล็อกทั้งหมด ⇒ คนที่ 2 อ่านเห็นคีย์ของคนที่ 1 แล้วเสมอ = **คีย์ไม่ซ้ำโดยโครงสร้าง** ไม่ใช่โดยบังเอิญ
(ย้ายคอลัมน์ = ล็อกแถว `KanbanBoard` แทน เพราะ "ลำดับคอลัมน์" เป็นของบอร์ด)

**อ่านซ้ำหลังได้ล็อก** — ระหว่างรอคิว คนอื่นอาจ archive การ์ด/คอลัมน์ไปแล้ว ⇒ ในทุก tx อ่าน `KanbanCard`/`KanbanColumn` ใหม่แล้วตัดสินอีกครั้ง (นอก tx อ่านไว้แค่เพื่อตอบเร็ว/ตรวจสิทธิ์)

**tie-break** — ยอมให้ `position` ซ้ำได้ตามสเปค §11.1 (ไม่มี unique) ทุกจุดที่อ่านลำดับใช้ `ORDER BY position ASC NULLS FIRST, sortOrder ASC, createdAt ASC` เหมือนกันหมด (`getBoard` เดิม · SQL renumber · rebalance) ⇒ ต่อให้ซ้ำ ทุกจอเห็นลำดับเดียวกัน

**หลักฐานที่วัดได้** — `qc-kanban-k1.4` S3.1/S3.2/S3.3 เขียว (20 ย้ายพร้อมกันหลัง B1: ครบ 23 ใบ · B1 ยังอยู่หัว · โหลดใหม่ผ่าน `getBoard` ลำดับตรงกัน)
probe C1: `20 ย้ายพร้อมกัน สำเร็จ 20/20 ใน 2798 ms · คีย์ไม่ซ้ำ 20/20 · sortOrder ไม่ซ้ำ`
`$transaction` ตั้ง `{ maxWait: 30_000, timeout: 30_000 }` (20 tx ยืนต่อคิวล็อกบน pool ~5 connection ต้องไม่ตกเพราะ default 2 วิ)

**dual-write `sortOrder` (D10)** — หลังเขียน `position` เสร็จ renumber 0..n ของคอลัมน์ที่กระทบด้วย SQL **คำสั่งเดียว**:
`WITH ord AS (SELECT id, row_number() OVER (ORDER BY position …)-1 AS rn FROM "KanbanCard" WHERE columnId/tenantId/systemId AND status='ACTIVE') UPDATE … WHERE c.id=ord.id AND c."sortOrder" <> ord.rn`
🔴 ทำไมต้องเป็น SQL คำสั่งเดียว: ลูป S4 ของข้อสอบย้ายเข้าคอลัมน์ที่มี 262 ใบ 260 รอบ — ถ้า update ทีละแถวจาก JS = 68,000 round trip (ประมาณ 40 นาที)

## 4. rebalance: ยิงเมื่อไหร่ · เขียนกลับอย่างไร

- หลังเขียนคีย์ใหม่ ถามค่าเดียว: `SELECT max(length(position)) FROM "KanbanCard" WHERE columnId=… AND status='ACTIVE'` — เกิน `KANBAN_LIMITS.positionRebalanceLength` (= 50) → rebalance **ใน tx เดียวกันทันที** (ไม่ต้องมีคิวงานใน P1 ตามสัญญา)
- rebalance = อ่านลำดับปัจจุบันทั้งคอลัมน์ → `rebalanceKeys(n)` (= `a0, a1, …` จาก `ordering.ts` ห้าม gen เอง) → เขียนกลับด้วย `UPDATE "KanbanCard" SET position=v.pos FROM (VALUES …) v(id,pos)` **คำสั่งเดียว** → แล้ว renumber `sortOrder` ตามปกติ
- `position` ที่คืนใน response คือคีย์ **หลัง** rebalance (map จาก id) และแถวที่คืนกลับอ่านจาก DB จริงหลังเขียนทุกอย่างเสร็จ (SQL ดิบไม่ผ่าน Prisma ⇒ ห้ามคืนค่าที่ค้างอยู่ใน object เดิม)

## 5. เหตุการณ์ (outbox)

| event | ยิงเมื่อ | idempotencyKey | payload |
|---|---|---|---|
| `kanban.card.moved` | ย้าย **ข้ามคอลัมน์** สำเร็จ (ขยับในคอลัมน์เดิมไม่ยิง — พิมพ์เขียว §5.5 กันประวัติ/คิวท่วม: ลูป 260 รอบของข้อสอบไม่สร้าง event สักตัว) | `kanban.card.moved#<cardId>#<updatedAt ms>` | `{cardId, boardId, fromColumnId, toColumnId, cardNo, title}` |
| `kanban.card.completed` | การ์ดเข้าคอลัมน์ `isDoneColumn` แล้ว `completedAt` เปลี่ยนจาก null → มีค่า | `kanban.card.completed#<cardId>#<completedAt ms>` | `{cardId, boardId, columnId, cardNo, completedAt(ISO)}` |

- ยิงด้วย `emitOutbox(tx, …)` **ใน tx เดียวกับการย้าย** (การย้ายรอด = event รอด) · ใส่ `systemId` + `unitId` ของบอร์ดไปด้วยเพื่อให้ฮุค/กฎกรองรายสาขาได้ · **ไม่ใส่ `tenantId` ใน payload** (ตัว outbox มีคอลัมน์อยู่แล้ว)
- consumer ลงทะเบียนพร้อมกันทั้งคู่ที่ `outbox-consumers.ts` (`withAutomation(no-op)` + ห่อ `withWebhooks` อัตโนมัติ) — กติกา `reference_outbox_new_event_needs_consumer`
- `AUTOMATION_EVENTS` เพิ่ม 3 ตัว (moved/assigned/completed) ⇒ ตั้งกฎอัตโนมัติ + สมัครเว็บฮุคได้ทันที (`WEBHOOK_EVENTS` spread ต่อให้เอง) · ที่เหลือของ §7.2 (created/due_soon/overdue/checklist/comment) รอ WO ที่ยิง event นั้นจริง ไม่ใส่ล่วงหน้าให้เมนูมีตัวเลือกที่ไม่มีวันเกิด

## 6. กติกาที่ตัดสินระหว่างทาง (ต่างจากพิมพ์เขียวเดิม — ขอ Fable รับทราบ)

1. **ปลดธง `isDoneColumn` → ล้าง `completedAt` ของการ์ดในคอลัมน์นั้น** และ **ติดธง → ตั้ง `completedAt` ให้การ์ดที่อยู่แล้ว** = ตามสัญญา §K1.4 + ข้อสอบ S5.3 · พิมพ์เขียว §11.3 เขียนตรงข้าม ("คงค่าเดิม/ไม่ย้อนตั้ง") — ยึดสัญญา WO ไว้ก่อน ถ้า Fable ต้องการตามพิมพ์เขียวเป็นการแก้ 6 บรรทัดใน `setColumnDone`
2. **คีย์สิทธิ์โมดูล**: ไม่เพิ่มคีย์ใหม่ใน `permissions.ts` (จะได้ไม่ไปแตะข้อสอบ K1.3/หน้าตั้งค่าสิทธิ์) — `renameColumnAction`/`moveColumnAction`/`setColumnWipAction`/`setColumnDoneAction` ใช้คีย์เดิม `kanban.column.create` · `archiveColumnAction` ใช้ `kanban.column.delete` · `moveAllCardsAction` ใช้ `kanban.card.move` · **ตัวคุมจริงคือบทบาทบอร์ด (D16)** ที่อยู่ใน service
3. **`archiveColumn` ตัวใหม่ block คอลัมน์ที่ยังมีการ์ด** (พิมพ์เขียว §5.3) ⇒ ปุ่ม "เก็บคอลัมน์" ของหน้าเดิมจะขึ้น error ไทยแทนที่จะกลืนการ์ดหายไปเงียบ ๆ · กล่อง "ย้ายการ์ดไปคอลัมน์ไหน" (ใช้ `moveAllCards`) เป็นงานของ K1.5 · เพิ่มด่าน "เก็บคอลัมน์สุดท้ายของบอร์ดไม่ได้" ตามพิมพ์เขียวด้วย
4. **`moveAllCards` ไม่บังคับ WIP** — เป็นงานจัดบ้านของผู้ดูแล ไม่ใช่การลากงานเข้าทีละใบ (§11.4 พูดถึงเฉพาะ "ย้าย/สร้างการ์ดเข้าคอลัมน์ที่เต็ม")
5. **collation**: DB ของ run นี้เป็น `C.UTF-8` (`select datcollate from pg_database` → `C.UTF-8`) ⇒ `ORDER BY position` = byte order = string compare ของ JS พอดี · ถ้าย้ายไป instance ที่เป็น `en_US.UTF-8` เมื่อไหร่ คีย์ที่ขึ้นต้นด้วยตัวใหญ่ (`Zz` ของการแทรกหัว) จะเรียงผิดทันที — ต้องบังคับ `COLLATE "C"` ทุกจุด (บันทึกไว้หัวไฟล์ `moves.ts` ด้วย)

## 7. ข้อสอบที่ตก: `K1.4-S4.1` — ข้อสมมติของข้อสอบเอง 2 จุด (ไม่ใช่บั๊กของโค้ด)

บรรทัดผลจริง:
```
❌ [K1.4-S4.1] แทรกหัวคอลัมน์ 260 ครั้ง → rebalance ทำงาน: key ยาวสุด ≤ 50 และลำดับ R259..R0,A4,A2 (ไม่สลับ)
   — exp ≤50 · R259 หัว | act maxLen=3 หัว=R259 ท้าย=A4
```
เงื่อนไขที่ข้อสอบตรวจ: `maxLen <= 50 && afterA[0]="R259" && afterA[259]="R0" && afterA.at(-2)="A4" && afterA.at(-1)="A2"`
**3 ข้อแรกผ่าน** ตกที่ท้ายคอลัมน์อย่างเดียว

**(ก) `A2` ไม่ได้อยู่คอลัมน์ A แล้วตั้งแต่ S2.1 — ข้อสอบย้ายมันออกไปเอง**
- บรรทัด S2.1 ของข้อสอบ: `moveCard(ctx, { cardId: a2.id, toColumnId: cB.id, afterCardId: b2.id })` แล้ว **ตรวจว่าคอลัมน์ B = `B1,A1,A2`** (ข้อนี้เขียว)
- S3.1 ตรวจต่อว่าคอลัมน์ B มี **23 ใบ** = `B1,A1,A2` + 20 ใบที่ย้ายพร้อมกัน (ข้อนี้ก็เขียว)
- S2.3 ย้าย `a2` ไปบอร์ดอื่นแล้วตรวจว่า **ยังอยู่คอลัมน์ B** (`columnId === cB.id`) — เขียวเช่นกัน
⇒ ตอนถึง S4 คอลัมน์ A เหลือ **`A4` ใบเดียว** (A1→B, A2→B, A3→C) ลำดับสุดท้ายที่ถูกต้องคือ `R259…R0, A4` (261 ใบ) ⇒ `at(-1)` เป็น `A4` เสมอ ไม่มีทางเป็น `A2` ในทุก implementation
→ ถ้า Fable แก้เป็น `afterA.at(-1) === "A4" && afterA.length === 261` ข้อนี้จะเขียวทันที (ค่าที่วัดได้ตอนนี้ตรงทุกตัว)

**(ข) การ "แทรกหัวคอลัมน์" ไม่ทำให้คีย์ยาวเกิน 50 — S4 จึงไม่เคยแตะ rebalance เลย**
วัดจาก `fractional-indexing` ตรง ๆ (probe A · JS ล้วน ไม่แตะ DB):
```
A1 แทรกหัวคอลัมน์ 260 ครั้ง → คีย์ยาวสุด 3 ตัวอักษร (เพดาน rebalance = 50)
A2 แทรก "ระหว่างคู่เดิม" ต้องทำ 288 ครั้งกว่าคีย์จะเกิน 50 (ยาวสุด 51)
```
เหตุผล: แทรกหัว = `generateKeyBetween(null, head)` ซึ่ง **ลดค่าตัวอักษร** (`a0 → Zz → Zy → …`) ยาวขึ้นทีละตัวทุก ~62 ครั้ง — คนละอัตรากับ "แทรกระหว่างคู่เดิม" (~1 ตัวอักษร/6 ครั้ง) ที่ K1.1 วัดไว้
⇒ `maxLen=3` ที่ข้อสอบเห็น **ไม่ได้แปลว่า rebalance ทำงาน** แต่แปลว่าคีย์ไม่เคยยาวพอ · ข้อ S4.2 (`needsRebalance=false`) ก็ผ่านฟรีด้วยเหตุผลเดียวกัน
→ ถ้าอยากให้ข้อสอบวัด rebalance จริง: เปลี่ยนเป็นแทรก **ก่อนใบที่ 2 ของคอลัมน์** (ระหว่างคู่เดิม) ~300 รอบ หรือปลูกคีย์ยาวลง DB ก่อน 1 ครั้งแล้วย้าย 1 ครั้ง (ถูกกว่ามาก — ตามที่ probe B ทำ)

**positive control ว่าโค้ด rebalance ทำงานจริง** (`scripts/probe-kanban-k1.4.mts` — ปลูกคีย์ยาว 51 ตัวอักษรที่ generate จาก `generateKeyBetween` จริง แล้วสั่งย้าย 1 ครั้ง):
```
B1 ก่อนย้าย: ลำดับ P1,P2,P3 · คีย์ยาวสุด 51 · needsRebalance=true
B2 หลังย้าย 1 ครั้ง: ลำดับ P1,P3,P2 (คาด P1,P3,P2) · คีย์ยาวสุด 2 · sortOrder 0,1,2 · needsRebalance=false
B3 response.position = a1 · ตรงกับแถวจริง = true
B4 สรุป: rebalance ทำงานถูกต้อง ✅
```

## 8. ไมเกรชัน D (`20260922000000_kanban_v2_d`)

คำสั่งเดียว เพิ่มอย่างเดียว (D10):
```sql
CREATE UNIQUE INDEX "KanbanCard_boardId_cardNo_key" ON "KanbanCard"("boardId", "cardNo");
```
- คง `KanbanCard_boardId_cardNo_idx` ของ K1.1 ไว้ (ไม่ DROP — schema จึงมีทั้ง `@@unique` และ `@@index` คู่นี้ ตรงกับ DB จริง ไม่เกิด drift)
- แถวที่ `cardNo` เป็น NULL ไม่ติด unique (NULL ≠ NULL ตามมาตรฐาน Postgres) ⇒ การ์ดเก่าที่ยังไม่ backfill ไม่พัง
- **ตรวจก่อนลง (QC · `ep-plain-art`)**:
  `select "boardId","cardNo",count(*) from "KanbanCard" where "cardNo" is not null group by 1,2 having count(*)>1;` → **(0 rows)**
  บน prod การันตีด้วย backfill A ของ K1.1 (Fable รันแล้ว) + ทุกทางสร้างการ์ดจองเลขด้วย `UPDATE "KanbanBoard" SET "cardNoSeq"="cardNoSeq"+1 … RETURNING` คำสั่งเดียวใน tx (D14) — ถ้า prod มีของค้าง `migrate deploy` จะแดงตอน build ให้เห็นก่อน ไม่ใช่เงียบ
- ข้อสอบ S7.1 (สร้าง 30 ใบพร้อมกัน → เลขไม่ซ้ำ ต่อเนื่อง seq+1..seq+30) + S7.2 (`pg_indexes` เห็น UNIQUE) เขียวทั้งคู่

## 9. คำสั่งที่ใช้ + บรรทัดสุดท้าย

```bash
# migration → QC เท่านั้น
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
pnpm exec prisma migrate deploy && pnpm exec prisma generate

pnpm exec tsx scripts/qc-kanban-k1.4.mts
pnpm exec tsx scripts/qc-kanban-k1.1.mts
pnpm exec tsx scripts/qc-kanban-k1.2.mts
pnpm exec tsx scripts/qc-kanban-k1.3.mts
QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-kanban-notify.mts
pnpm exec tsx scripts/qc-ai-kanban-board.mts
pnpm exec tsx scripts/probe-kanban-k1.4.mts          # probe ของ builder (§7)
NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit
pnpm fitness
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
```

บรรทัดสุดท้ายจริง:

```
===== QC Kanban K1.4 =====
ผ่าน 27/28
FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":28,"passed":27,"findings":["K1.4-S4.1"]}

JSON_SUMMARY {"total":30,"passed":30,"findings":[]}        ← qc-kanban-k1.1
JSON_SUMMARY {"total":25,"passed":25,"findings":[]}        ← qc-kanban-k1.2
JSON_SUMMARY {"total":29,"passed":29,"findings":[]}        ← qc-kanban-k1.3
QC Kanban Notify: 12/12 ผ่าน  ✅ เขียวหมด                   ← qc-kanban-notify (ไม่มีบรรทัด JSON_SUMMARY)
JSON_SUMMARY {"total":3,"passed":3,"findings":[]}          ← qc-ai-kanban-board

$ pnpm exec tsc --noEmit
(ไม่มี output · exit 0)

===== FITNESS =====
ผ่าน 20/20
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

===== FITNESS =====   (env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET)
ผ่าน 20/20
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

## 10. งานต่อที่ฝากไว้ให้ K1.5

- `moveCardAction` คืน `{ok, position, placedAt}` / `{ok:false, code, message}` พร้อมให้ optimistic UI rollback + toast ข้อความไทยได้เลย (ข้อความ WIP บอกจำนวนจริง เช่น "คอลัมน์เต็ม (3/3) — ปิดงานที่ค้างก่อน")
- `moveColumnAction` รับ `beforeColumnId`/`afterColumnId` แล้ว · `moveAllCardsAction` พร้อมให้กล่อง "เก็บคอลัมน์นี้ → ย้ายการ์ดไปไหน"
- ยังไม่มี: กิจกรรม `CARD_MOVED`/`CARD_COMPLETED` (ตาราง `KanbanActivity` มาใน K1.10) · สัญญาณ realtime หลัง rebalance (K1.14)


## ภาคผนวกโดย Fable (ตรวจรับ 06:33 น.)
- S4.1: builder ถูกทั้ง 2 ข้อ (A2 อยู่คอลัมน์ B · head-insert ไม่ทำคีย์ยาว) → เขียน S4 ใหม่: คอลัมน์ D · แทรกระหว่างคู่เดิม 300 ครั้ง (X1,R299..R0,X2 · maxLen ≤ 50) + S4.3/S4.4 ปลูกคีย์ 51 ตัวอักษรแล้วย้าย 1 ครั้ง → rebalance ทั้งคอลัมน์ ลำดับคง · S5/S6 ปรับตาม (D) · 30/30 · ลบ `probe-kanban-k1.4.mts` ของ builder (ยกท่าเข้า oracle แล้ว)
- รับการตัดสินใจ: completedAt ล้างตามสัญญา (D17) · archiveColumn ต้องว่าง (UI เดิมได้ error ไทย · dialog ย้ายก่อน = K1.5) · collation C.UTF-8 จดเป็น dependency
- รันซ้ำเอง: k1.4 30 · k1.3 29 · k1.2 25 · k1.1 30 · notify 12 · migration D ดูตาแล้ว (unique index เดียว) · typecheck 0 · fitness 20/20 ×2
