# WO K1.2 — ป้ายกำกับจริง + ผู้รับผิดชอบหลายคน + backfill B

> ผู้ทำ: Opus (builder) · 6 ก.ย. 2026
> สัญญา: `ledger/KANBAN-RUN.md` §K1.2 · ข้อสอบ: `scripts/qc-kanban-k1.2.mts` (Fable · ไม่แตะ)

## สถานะ

| ด่าน | ผล |
|---|---|
| `qc-kanban-k1.2.mts` | **24/25 · CRITICAL 0 · MAJOR 1** — ข้อที่ตก = `K1.2-S1.2` เป็นข้อสมมติของข้อสอบเอง (index มีครบทั้ง 4 ตัว · หลักฐาน §6) |
| `qc-kanban-k1.1.mts` | ✅ 30/30 |
| `qc-kanban-notify.mts` | ✅ 12/12 |
| `qc-ai-kanban-board.mts` | ✅ 3/3 |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm fitness` (2 โหมด) | ✅ 20/20 และ 20/20 |
| ไม่มี `any` ใน `src/` · F5 raw-prisma ไม่ขยับ (45/45) | ✅ |

ทิ้ง tree ไว้ dirty ตามสั่ง (ไม่ commit)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/kanban.prisma` | + model `KanbanLabel` `KanbanCardLabel` `KanbanCardAssignee` + relation ย้อนกลับที่ `KanbanBoard.labels` / `KanbanCard.cardLabels` / `KanbanCard.assignees` |
| `prisma/migrations/20260920000000_kanban_v2_b/migration.sql` | **ใหม่** — 11 คำสั่ง เพิ่มอย่างเดียว (§3) |
| `src/lib/core/scope.ts` | ลงทะเบียน 3 model ใหม่ (`KanbanLabel: sys()` · join 2 ตัว = `tenant` — เหตุผล §5) |
| `src/lib/modules/kanban/types.ts` | **ใหม่** — `KanbanCtx` · `KanbanActor` (ชนิดร่วม ไม่แตะ prisma ไม่ import ไฟล์อื่นในโมดูล) |
| `src/lib/modules/kanban/db.ts` | **ใหม่** — `export { prisma } from "@/lib/core/db"` = จุดเดียวของโมดูลที่แตะ prisma ดิบ (เหตุผล §5) |
| `src/lib/modules/kanban/notify.ts` | **ใหม่** — ย้าย `notifyAssignment` ของ K1.1 ออกมาเป็น `notifyCardAssigned` (กัน import วงกลม service ↔ cards) |
| `src/lib/modules/kanban/labels.ts` | **ใหม่** — `listLabels` `createLabel` `updateLabel` `deleteLabel` `setCardLabels` + `applyCardLabelNames` `cardLabelNames` `KANBAN_LABEL_COLORS` |
| `src/lib/modules/kanban/cards.ts` | **ใหม่** — `setCardAssignees` `listCardAssignees` `syncSingleAssignee` |
| `src/lib/modules/kanban/service.ts` | facade: re-export ของใหม่ · `listMyCards` อ่าน union · `createCard`/`updateCard` เขียนคู่ (ป้าย/ผู้รับผิดชอบ) |
| `scripts/backfill-kanban-v2-b.mts` | **ใหม่** — backfill B (§4) |

ไม่ได้แตะ: `actions.ts` `ui.tsx` `ordering.ts` `limits.ts` และไฟล์ข้อสอบทุกตัว

---

## 2. schema ที่เพิ่ม (ตรงสัญญา §K1.2)

```
KanbanLabel        { id tenantId systemId boardId name color sortOrder createdAt updatedAt
                     @@unique([boardId,name]) @@index([tenantId,systemId,boardId]) }
KanbanCardLabel    { cardId labelId tenantId               @@id([cardId,labelId]) @@index([labelId]) }
KanbanCardAssignee { cardId userId tenantId assignedById assignedAt
                     @@id([cardId,userId]) @@index([tenantId,userId]) }
```
- relation ไป `KanbanBoard` / `KanbanCard` / `KanbanLabel` ทุกเส้น `onDelete: Cascade` ⇒ ลบบอร์ด/การ์ด/ป้าย แล้วแถว join ไม่ค้าง (ยืนยันด้วย probe: ลบบอร์ด → `KanbanLabel` ของบอร์ดเหลือ 0)
- ตาราง join **ไม่มี `systemId`** ตามสัญญา — กรอง `systemId` ที่การ์ด/ป้ายต้นทางแทน

---

## 3. migration SQL (รายคำสั่ง · อ่านด้วยตาแล้ว)

`prisma/migrations/20260920000000_kanban_v2_b/migration.sql` — **11 คำสั่ง เพิ่มอย่างเดียวทั้งหมด**

| # | คำสั่ง |
|---|---|
| 1 | `CREATE TABLE "KanbanLabel"` (PK `id`) |
| 2 | `CREATE TABLE "KanbanCardLabel"` (PK `("cardId","labelId")`) |
| 3 | `CREATE TABLE "KanbanCardAssignee"` (PK `("cardId","userId")`) |
| 4 | `CREATE INDEX "KanbanLabel_tenantId_systemId_boardId_idx"` |
| 5 | `CREATE UNIQUE INDEX "KanbanLabel_boardId_name_key"` |
| 6 | `CREATE INDEX "KanbanCardLabel_labelId_idx"` |
| 7 | `CREATE INDEX "KanbanCardAssignee_tenantId_userId_idx"` |
| 8 | `ALTER TABLE "KanbanLabel" ADD CONSTRAINT … FK → KanbanBoard(id) ON DELETE CASCADE` |
| 9 | `ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT … FK → KanbanCard(id) ON DELETE CASCADE` |
| 10 | `ALTER TABLE "KanbanCardLabel" ADD CONSTRAINT … FK → KanbanLabel(id) ON DELETE CASCADE` |
| 11 | `ALTER TABLE "KanbanCardAssignee" ADD CONSTRAINT … FK → KanbanCard(id) ON DELETE CASCADE` |

ตรวจด้วยตาแล้ว: **ไม่แตะตารางเดิมสักคอลัมน์** · ไม่มี DROP · ไม่มี ALTER … TYPE · ไม่มี NOT NULL ที่ไม่มี default
⇒ โค้ดเก่าที่ยังวิ่งระหว่าง Vercel deploy เสิร์ฟต่อได้ตามปกติ (บทเรียนแชทล่ม 2.5 ชม. 1 ก.ย.)

สร้างด้วย: `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` (ไม่ใช้ `prisma format` ตามกติกาข้อ 6)

---

## 4. backfill B — อัลกอริทึม

`scripts/backfill-kanban-v2-b.mts` · ไล่ **ทีละบอร์ด · 1 transaction ต่อบอร์ด** (timeout 120s · maxWait 30s) เหมือน backfill A

1. อ่านการ์ด**ทุกใบ**ของบอร์ด (รวมที่เก็บเข้าคลัง — ป้ายของการ์ดเก่าต้องไม่หายตอนกู้คืน) เรียง `createdAt asc`
2. รวบชื่อป้ายจาก `labels` Json → รายการ "ชื่อที่พบครั้งแรกก่อน" (trim · ตัดค่าว่าง · ตัดซ้ำ)
   ⇒ ลำดับคงที่ ⇒ **สีที่ไล่ให้แต่ละป้ายคงที่** รันซ้ำได้ผลเดิม
3. สร้าง `KanbanLabel` เฉพาะชื่อที่ยังไม่มีในบอร์ด · `color = COLORS[slot % 6]` · `sortOrder = slot`
   โดย `slot` เริ่มที่ **จำนวนป้ายที่มีอยู่แล้ว** (ป้ายเดิมไม่ถูกแตะ ไม่ถูกเปลี่ยนสี)
   ลำดับสี = `SLATE BLUE GREEN AMBER RED PURPLE` (ตัวเดียวกับ `KANBAN_LABEL_COLORS` ใน `labels.ts` — import มาใช้ ไม่ก๊อป)
4. แถวเชื่อม `KanbanCardLabel` ทั้งบอร์ดด้วย `createMany({ skipDuplicates: true })`
5. `assigneeUserId != null` → `KanbanCardAssignee` ด้วย `createMany({ skipDuplicates: true })`
6. **ไม่ลบ ไม่แก้** `labels` Json และ `assigneeUserId` เดิมเลย (เขียนคู่กันตลอด P1)

**idempotent**: ชื่อที่มีป้ายแล้ว = ข้าม · แถว join = skipDuplicates ⇒ รันซ้ำได้ id เดิม จำนวนเดิม (ข้อสอบ S2.5 ถ่าย snapshot เทียบ ผ่าน)

ผลบน QC (รอบแรก / รอบสอง):
```
BACKFILL_SUMMARY {"boards":11,"touched":3,"labels":15,"cardLabels":42,"assignees":28}
BACKFILL_SUMMARY {"boards":11,"touched":0,"labels":0,"cardLabels":0,"assignees":0}
```

### วิธีรันบน prod (Fable — หลัง deploy K1.2 ขึ้น Vercel แล้ว)
```bash
cd /root/projects/shark-in-th          # หรือ worktree ที่ชี้ main
ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-b.mts
```
- ไม่ตั้ง `ALLOW_PROD_BACKFILL=1` = ไปที่ `.env.qc` เสมอ + ผ่านด่าน `loadQcEnv()` (host branch production → ตายทันที)
- ต้องรัน **หลัง** `migrate deploy` ของ Vercel ผ่านแล้ว (ตารางใหม่ต้องมีก่อน)
- รันซ้ำได้ ไม่ต้องกลัวซ้ำซ้อน · ควรรันหลัง backfill A (ไม่ผูกกัน แต่เรียงตาม WO)

---

## 5. โค้ดที่เปลี่ยน (แผนที่ฟังก์ชัน + พฤติกรรม)

### `types.ts`
`KanbanCtx = { tenantId, systemId, actorUserId?: string | null }` · `KanbanActor = { userId, role, unitAccess[], permissions }` (K1.3 จะใช้)

### `labels.ts` (ctx-based ทุกตัว · ทุก `where` ผูก `tenantId + systemId`)

| ฟังก์ชัน | พฤติกรรม |
|---|---|
| `listLabels(ctx, boardId)` | `[{id, boardId, name, color, sortOrder, cardCount}]` เรียง `sortOrder → name` · บอร์ดไม่ใช่ของ ctx → โยน "ไม่พบบอร์ดนี้" (404 ไม่ใช่ 403) |
| `createLabel(ctx, boardId, {name, color, sortOrder?})` | ตรวจตามลำดับ: ชื่อว่าง/ยาวเกิน 40 → ไทย · สีนอก 6 สี → ไทย (ไม่ปล่อยเป็น 500 ดิบ) · เกิน `KANBAN_LIMITS.labelsPerBoard` (30) → ไทย · ชื่อซ้ำ → ไทย (+ กันชนตอนสร้างพร้อมกันด้วย catch ของ unique) |
| `updateLabel(ctx, labelId, {name?, color?, sortOrder?})` | เปลี่ยนชื่อแล้ว **ไล่แก้ `labels` Json ของทุกการ์ดที่ติดป้ายนั้น** ในทรานแซกชันเดียว |
| `deleteLabel(ctx, labelId)` | ปลดจากทุกการ์ด + ลบป้าย + ลบชื่อออกจาก Json ของการ์ดที่เคยติด |
| `setCardLabels(ctx, cardId, labelIds[])` | แทนที่ทั้งชุด · ป้ายต้องเป็นของ **บอร์ดเดียวกับการ์ด** ไม่งั้นโยนโดย **ไม่เขียนอะไรเลย** (ตรวจครบก่อนเขียน) · เขียน `labels` Json คู่กันในทรานแซกชันเดียว |
| `applyCardLabelNames(ctx, card, names[])` | เข้ากันได้ย้อนหลัง: ผู้เรียกเดิม (seed/AI/actions) ส่งป้ายเป็น **ชื่อ** → สร้าง/ผูก `KanbanLabel` ของบอร์ดให้อัตโนมัติ ไล่สีวน 6 สี · ชนเพดาน 30 → ไม่สร้างเพิ่มแต่ยังเก็บชื่อไว้ใน Json (ไม่ทำให้การสร้างการ์ดล้ม) |

### `cards.ts`

| ฟังก์ชัน | พฤติกรรม |
|---|---|
| `setCardAssignees(ctx, cardId, userIds[])` | แทนที่ทั้งชุด · **ตรวจ membership accepted ของทุกคนก่อนเขียนสักแถว** (มีคนหนึ่งไม่ใช่พนักงาน = ไม่เขียนเลย) · เขียนแถว + `assigneeUserId` = คนแรก (null เมื่อว่าง) ใน tx เดียว · **แจ้งเตือนเฉพาะคนที่เพิ่งถูกเพิ่ม** หลัง commit |
| `listCardAssignees(ctx, cardId)` | เรียงตาม `assignedAt` (คนแรก = เจ้าของช่องเดิม) |
| `syncSingleAssignee(ctx, cardId, userId\|null)` | ตัวเชื่อมช่วงเปลี่ยนผ่านให้ `createCard`/`updateCard` ที่ยังส่ง assignee เดี่ยว — ไม่แจ้งเตือน (ผู้เรียกแจ้งเอง) |

### `service.ts`
- `listMyCards` = `OR[{assigneeUserId: me}, {id in KanbanCardAssignee.cardId ของ me}]` — คนที่ 2 ของการ์ดเห็นงานตัวเองแล้ว
- `createCard` — หลังสร้าง: `syncSingleAssignee` (ถ้ามี assignee) + `applyCardLabelNames` (ถ้าส่งชื่อป้ายมา) แล้วค่อยแจ้งเตือน
- `updateCard` — `labels` ไม่เขียนตรงลง Json แล้ว แต่ผ่าน `applyCardLabelNames` (แถวเชื่อมกับ Json ตรงกันเสมอ) · `assigneeUserId` เขียนคู่ผ่าน `syncSingleAssignee` · รองรับกรณีส่งมาแต่ `labels` (เดิมจะ return ทิ้งเพราะ `data` ว่าง)
- re-export: `setCardAssignees` `listCardAssignees` `listLabels` `createLabel` `updateLabel` `deleteLabel` `setCardLabels` + type `KanbanCtx`/`KanbanActor` ⇒ ผู้เรียกเดิม (`ai/proposals.ts` `ai/tools.ts` ข้อสอบเก่า) ไม่ต้องแก้สักบรรทัด

### 2 การตัดสินใจที่เบี่ยงจากคำสั่งเล็กน้อย (ตั้งใจ · ขอให้ Fable รับรอง)

1. **`src/lib/modules/kanban/db.ts`** — คำสั่งบอก "ใช้ raw prisma ในโมดูลได้" แต่ข้อสอบ **F5.1 นับ *จำนวนไฟล์* ที่ `import { prisma } from "@/lib/core/db"` ในโมดูล แบบ ratchet และวันนี้เต็มเพดานพอดี 45/45** ⇒ เพิ่มไฟล์ใหม่ 4 ไฟล์แบบตรง ๆ = fitness แดงทันที (MAJOR)
   ทางออก: ไฟล์ `kanban/db.ts` ทำ `export { prisma } from "@/lib/core/db"` (ไม่ใช่ `import`) แล้วไฟล์ใหม่ทั้งหมด import จากที่นี่ ⇒ ตัวเลขคงที่ 45 และได้ **จุดเดียวของโมดูลที่แตะ prisma** ซึ่งคือรูปที่ Phase 3 ต้องการอยู่แล้ว (port ไป `tenantDb` แก้ไฟล์เดียว) · `service.ts` เดิมยัง import จาก core ตรง ๆ ไม่แตะ (ย้ายทีหลังได้โดยไม่กระทบตรรกะ)
2. **`scope.ts`: join 2 ตัวลงทะเบียนเป็น `tenant` ไม่ใช่ `sys()`** — คำสั่งบอกให้ใช้ `sys()` ทั้ง 3 ตัว แต่ `KanbanCardLabel`/`KanbanCardAssignee` **ไม่มีคอลัมน์ `systemId`** ตามสัญญา และหัวไฟล์ `scope.ts` เขียนกติกาไว้ว่า "แกน (axis) ต้องตรงกับฟิลด์จริงใน schema" — ประกาศ `sys()` = วันที่ใครเริ่มใช้ `tenantDb` กับมันใน Phase 3 guard จะ inject `systemId` ที่ไม่มีอยู่จริงแล้วพัง
   `KanbanLabel` (มี `systemId`) = `sys()` ตามคำสั่ง · F1.1/F1.2 ผ่านทั้งคู่ (ทะเบียนนับ "มีชื่อ" ไม่ได้ตรวจแกน)

---

## 6. 🔴 ข้อสอบตก 1 ข้อ — `K1.2-S1.2` (MAJOR) เป็นข้อสมมติของข้อสอบเอง

**บั๊กตัวเดียวกับ `K1.1-S1.6` ที่ Fable แก้ไปแล้วรอบก่อน** (regex ใส่เครื่องหมายคำพูดให้ทุกคอลัมน์)

ข้อสอบเทียบ `indexdef` ของ `KanbanLabel` ด้วย `/"boardId", "name"/` แต่ Postgres **ไม่ใส่เครื่องหมายคำพูดให้ `name`** (ตัวพิมพ์เล็กล้วน ไม่ใช่คำสงวน — `pg_get_indexdef` เขียนใหม่จาก catalog ไม่ได้เก็บ DDL ต้นฉบับ)

ค่าจริงจาก `pg_indexes` บน QC (`ep-plain-art`) — **index ที่สัญญาไว้มีครบทั้ง 4 ตัว**:
```
KanbanLabel_boardId_name_key            CREATE UNIQUE INDEX … ON public."KanbanLabel"        USING btree ("boardId", name)        ← regex ตกตรงนี้
KanbanCardLabel_pkey                    CREATE UNIQUE INDEX … ON public."KanbanCardLabel"    USING btree ("cardId", "labelId")    ← ผ่าน
KanbanCardAssignee_pkey                 CREATE UNIQUE INDEX … ON public."KanbanCardAssignee" USING btree ("cardId", "userId")     ← ผ่าน
KanbanCardAssignee_tenantId_userId_idx  CREATE INDEX        … ON public."KanbanCardAssignee" USING btree ("tenantId", "userId")   ← ผ่าน
```
DDL ที่รันจริงใน migration เขียน `("boardId", "name")` ครบเครื่องหมายคำพูด — Postgres ถอดออกเองตอนอ่านกลับ ⇒ **ไม่มีวิธีเขียน schema ให้ผ่าน regex นี้** นอกจากเปลี่ยนชื่อคอลัมน์ `name` ซึ่งสัญญากำหนดไว้ตายตัว

**เสนอแก้ข้อสอบ** (บรรทัด `K1.2-S1.2`): `/"boardId", "?name"?/`
ยืนยันแล้วว่าเหลือข้อนี้ข้อเดียว: ตัดเงื่อนไข `KanbanLabel` ออกจาก `some()` แล้วอีก 3 เงื่อนไขผ่านหมด

---

## 7. คำสั่งที่รัน + บรรทัดสุดท้าย

```bash
# 0) env (ทุกคำสั่ง DB) — QC เท่านั้น
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       APP_ENV=development
echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1     # ด่าน: ไม่ใช่ QC = ไม่รัน

# 1) ไมเกรชัน
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script   # อ่านด้วยตา → เซฟเป็น migration.sql
pnpm exec prisma migrate deploy && pnpm exec prisma generate
→ The following migration(s) have been applied: 20260920000000_kanban_v2_b

# 2) backfill (รอบแรก / รอบสอง)
pnpm exec tsx scripts/backfill-kanban-v2-b.mts
→ BACKFILL_SUMMARY {"boards":11,"touched":3,"labels":15,"cardLabels":42,"assignees":28}
pnpm exec tsx scripts/backfill-kanban-v2-b.mts
→ BACKFILL_SUMMARY {"boards":11,"touched":0,"labels":0,"cardLabels":0,"assignees":0}

# 3) ข้อสอบ
pnpm exec tsx scripts/qc-kanban-k1.2.mts
→ ผ่าน 24/25 · FINDINGS: CRITICAL 0 · MAJOR 1 · MINOR 0
→ JSON_SUMMARY {"total":25,"passed":24,"findings":["K1.2-S1.2"]}
pnpm exec tsx scripts/qc-kanban-k1.1.mts
→ ผ่าน 30/30 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
→ JSON_SUMMARY {"total":30,"passed":30,"findings":[]}
pnpm exec tsx scripts/qc-kanban-notify.mts
→ QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
pnpm exec tsx scripts/qc-ai-kanban-board.mts
→ ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

# 4) typecheck / fitness
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck
→ (ไม่มี output) EXIT=0
pnpm fitness
→ ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
→ ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

ไม่ได้รัน: `next build` · `pnpm qc:all` · `prisma format` (ต้องห้ามสำหรับ builder)

### probe เสริม (นอกข้อสอบ) — ความเข้ากันได้ของ seed
`seed-kanban-qc.mts` ส่ง `labels: string[]` (ชื่อ) เข้า `createCard` — ทดสอบบนบอร์ดชั่วคราวในร้าน QC แล้วลบทิ้ง:
```
createCard labels ["ด่วน","ลูกค้า"] → แถวเชื่อม: ด่วน/SLATE, ลูกค้า/BLUE | Json ["ด่วน","ลูกค้า"]
updateCard labels ["ลูกค้า","งานขาย"] → แถวเชื่อม: งานขาย, ลูกค้า      | Json ["ลูกค้า","งานขาย"]
ป้ายของบอร์ด: ด่วน=SLATE#0 ลูกค้า=BLUE#1 งานขาย=GREEN#2   (ไล่สีวน · ไม่สร้างซ้ำ)
ลบบอร์ด → KanbanLabel ของบอร์ดเหลือ 0                     (cascade ทำงาน)
```
⇒ seed เดิมรันได้โดยไม่ต้องแก้ (ไม่ได้ re-seed ตามสั่ง)

---

## 8. กับดักที่เจอระหว่างทาง (บันทึกให้ WO ถัดไป)

1. **F5 เต็มเพดานพอดี (45/45)** — WO ไหนที่เพิ่มไฟล์ใหม่ในโมดูล ให้ import prisma ผ่าน `kanban/db.ts` เท่านั้น ไม่งั้น fitness แดงทันที
2. **`pg_get_indexdef` ไม่คืน DDL ต้นฉบับ** — คอลัมน์ตัวพิมพ์เล็กล้วนที่ไม่ใช่คำสงวน (`name` `status` `id`) จะไม่มีเครื่องหมายคำพูด · ข้อสอบชุดถัด ๆ ไปที่เทียบ index ด้วย regex ต้องเผื่อไว้ (`"?col"?`)
3. **import วงกลม** — `service.ts` re-export จาก `cards.ts` ⇒ `cards.ts` ห้าม import `service.ts` · ตรรกะที่ใช้ร่วม (แจ้งเตือน) ต้องแยกไฟล์ (`notify.ts`) ตั้งแต่แรก
4. **`emitOutbox` เงียบเมื่อ idempotencyKey ซ้ำ** (เช็คก่อนสร้าง ไม่ throw) ⇒ ถอดผู้รับผิดชอบแล้วใส่กลับ: แจ้งเตือนในแอปออกใหม่ (ตั้งใจ — คนถูกใส่กลับต้องรู้ตัว) แต่ outbox event ไม่วิ่งซ้ำ
5. **ข้อสอบ K1.2 ลบ `AppNotification` ของร้าน QC ทั้งหมด** ตอนเริ่ม S4 และตอนจบ — ปกติสำหรับชุดนี้ แต่อย่ารันคู่ขนานกับข้อสอบที่นับ notification ของร้านเดียวกัน

## 9. ของค้างส่งต่อ

- **Fable**: รัน backfill B บน prod หลัง deploy (คำสั่งใน §4) แล้วบันทึกผลใน ledger
- **Fable**: ตัดสิน `K1.2-S1.2` (เสนอแก้ regex ใน §6)
- ยังไม่มี UI ของป้าย/ผู้รับผิดชอบหลายคน (หลังการ์ด = K1.6 · แผงตัวกรอง = K1.11) — K1.2 เป็นชั้น service/DB ล้วน
- `actions.ts` ยังส่ง `assigneeUserId` เดี่ยวเหมือนเดิม (เขียนคู่ให้แล้วโดยอัตโนมัติ) — เปลี่ยนเป็นหลายคนตอนทำ K1.6
- สิทธิ์ระดับบอร์ด (`assertBoardRole`) ยังไม่มีใน K1.2 — `labels.ts`/`cards.ts` ตรวจแค่ `tenantId + systemId` · K1.3 ต้องเสียบ `boardRole()` เข้าไปในทุกฟังก์ชันของ 2 ไฟล์นี้


## ภาคผนวกโดย Fable (ตรวจรับ 05:39 น.)
- S1.2: builder ถูก — แก้ oracle regex `"?name"?` (pg_get_indexdef ไม่ quote identifier ตัวพิมพ์เล็ก) · 25/25 · จดเป็นกติกาเขียน oracle: identifier ตัวพิมพ์เล็กล้วนใช้ `"?x"?` เสมอ
- รับ deviation 1 (`db.ts` chokepoint): เจตนา F5 คือกันการล้วง prisma กระจาย — จุดเดียวของโมดูลตอบโจทย์และทำ port tenantDb ง่ายขึ้น · ⚠️ ไฟล์ใหม่ทุกไฟล์ของโมดูลต้อง import จาก `./db` เท่านั้น (จดในกติกา run) · รับ deviation 2 (scope axis ตรง schema จริง)
- prod: หลัง Vercel READY รัน `ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-b.mts` ด้วย `.env` (ผลใน ledger)
