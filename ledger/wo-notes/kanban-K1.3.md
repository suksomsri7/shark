# WO K1.3 — สมาชิกบอร์ด + ดาว + สิทธิ์ 2 ชั้น + คีย์สิทธิ์ใหม่ + 404-not-403 + AuditLog

> ผู้ทำ: Opus (builder) · 6 ก.ย. 2026
> สัญญา: `ledger/KANBAN-RUN.md` §K1.3 (+ D2) · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §4.3/§6 · ข้อสอบ: `scripts/qc-kanban-k1.3.mts` (Fable · ไม่แตะ)

## สถานะ

| ด่าน | ผล |
|---|---|
| `qc-kanban-k1.3.mts` | **28/29 · CRITICAL 1 · MAJOR 0** — ข้อที่ตก = `K1.3-S4.6` เป็นลำดับของข้อสอบเอง (ข้อสอบลบ AuditLog ทิ้งหลัง S3 เขียนแถวสมาชิกไปแล้ว · หลักฐาน + positive control §7) |
| `qc-kanban-k1.1.mts` | ✅ 30/30 |
| `qc-kanban-k1.2.mts` | ✅ 25/25 |
| `qc-kanban-notify.mts` | ✅ 12/12 (`QC_ENV_FILE=.env.qc`) |
| `qc-ai-kanban-board.mts` | ✅ 3/3 |
| `pnpm exec tsc --noEmit` | ✅ 0 error |
| `pnpm fitness` 2 โหมด | ✅ 20/20 และ 20/20 (F6 authz ยังเขียว — `actions.ts` ยังเรียก `assertCan` ตรง ๆ) |
| ไม่มี `any` ใน `src/` · F5 raw-prisma ไม่ขยับ (45 ไฟล์ · ไฟล์ใหม่ import จาก `./db`) | ✅ |

ทิ้ง tree ไว้ dirty ตามสั่ง (ไม่ commit) · migration ลงเฉพาะ QC (`ep-plain-art`) แล้ว · prod ลงตอน Vercel build

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/kanban.prisma` | + enum `KanbanBoardRole {VIEWER EDITOR ADMIN}` · + model `KanbanBoardMember` `KanbanBoardStar` · + relation ย้อนกลับ `KanbanBoard.members` / `KanbanBoard.stars` |
| `prisma/migrations/20260921000000_kanban_v2_c/migration.sql` | **ใหม่** — 8 คำสั่ง เพิ่มอย่างเดียว (§3) |
| `src/lib/core/scope.ts` | ลงทะเบียน `KanbanBoardMember: tenant` · `KanbanBoardStar: tenant` (มีแต่ `tenantId` จริง ๆ ไม่มี `systemId` — แกนต้องตรงคอลัมน์ เหมือน join ของ K1.2) |
| `src/lib/core/permissions.ts` | + คีย์ kanban 8 ตัวพร้อมป้ายไทย (§2) |
| `src/lib/core/audit.ts` | **ใหม่** — ยก `writeAudit()` ขึ้นมาเป็นของกลางแพลตฟอร์ม (เหตุผล §5) |
| `src/lib/modules/account/access.ts` | `writeAudit` เดิมถูกย้ายออก → `export { writeAudit } from "@/lib/core/audit"` (ผู้เรียกเดิม ~20 จุดไม่ต้องแก้) |
| `src/lib/modules/kanban/access.ts` | **ใหม่** — บริสุทธิ์ ไม่แตะ prisma: `boardRole` `canReadKanban` `hasBoardRole` `visibleBoardsWhere` `toActor` + `KanbanNotFoundError` (404) / `KanbanForbiddenError` (403) |
| `src/lib/modules/kanban/members.ts` | **ใหม่** — `boardRoleOf` `assertBoardRole` `assertColumnRole` `assertCardRole` `listMembers` `addMember` `setMemberRole` `removeMember` `leaveBoard` `starBoard` `unstarBoard` `listStarredBoardIds` `setBoardVisibility` (prisma จาก `./db`) |
| `src/lib/modules/kanban/service.ts` | + `listBoardsFor` `getBoardFor` · `listMyCards(…, actor?)` · re-export ของ K1.3 ออกทาง facade |
| `src/lib/modules/kanban/actions.ts` | ทุก action mutation เพิ่มด่านชั้นที่ 2 (§6) |
| `src/lib/modules/kanban/ui.tsx` | หน้าเดิมเปลี่ยนมาใช้ `listBoardsFor`/`getBoardFor`/`listMyCards(actor)` + ซ่อนปุ่มตามบทบาท (§6) |

ไม่ได้แตะ: `types.ts` (`KanbanActor` มีอยู่แล้วตั้งแต่ K1.2 ตรงสัญญาเป๊ะ) · `cards.ts` `labels.ts` `ordering.ts` `notify.ts` `limits.ts` · หน้า `src/app/app/sys/[id]/kanban/**` (component เดิมรับสิทธิ์เองแล้ว ไม่ต้องแก้ไฟล์หน้า) · ไฟล์ข้อสอบทุกตัว · ไม่มี outbox event/consumer ใหม่ตามสั่ง

---

## 2. คีย์สิทธิ์ที่เพิ่ม (บล็อก `module: "kanban"` ใน `permissions.ts`)

`kanban.board.read` เห็นบอร์ดงาน · `kanban.board.member.manage` จัดการสมาชิกบอร์ด · `kanban.card.comment` เขียนความเห็นในการ์ด · `kanban.card.attach` แนบไฟล์ในการ์ด · `kanban.label.manage` จัดการป้ายกำกับ · `kanban.automation.manage` ตั้งกฎอัตโนมัติของบอร์ด · `kanban.report.view` ดูรายงานบอร์ดงาน · `kanban.template.manage` จัดการเทมเพลตบอร์ด

`isPermissionKey()` รู้จักครบทั้ง 8 ตัวเอง (มาจาก `PERMISSIONS` ที่ generate จากบล็อกโมดูลเดียวกัน — ไม่มีลิสต์ที่สอง)

---

## 3. คำสั่งใน migration `20260921000000_kanban_v2_c` (ตรวจด้วยตา: เพิ่มอย่างเดียว)

1. `CREATE TYPE "KanbanBoardRole" AS ENUM ('VIEWER','EDITOR','ADMIN')`
2. `CREATE TABLE "KanbanBoardMember"` (`id` PK · `tenantId` · `boardId` · `userId` · `role` DEFAULT `'EDITOR'` · `invitedById` NULL · `createdAt` DEFAULT now)
3. `CREATE TABLE "KanbanBoardStar"` (PK รวม `("boardId","userId")` · `tenantId` · `createdAt` DEFAULT now)
4. `CREATE INDEX "KanbanBoardMember_tenantId_userId_idx"`
5. `CREATE UNIQUE INDEX "KanbanBoardMember_boardId_userId_key"`
6. `CREATE INDEX "KanbanBoardStar_tenantId_userId_idx"`
7. `ALTER TABLE "KanbanBoardMember" ADD FK boardId → KanbanBoard(id) ON DELETE CASCADE`
8. `ALTER TABLE "KanbanBoardStar" ADD FK boardId → KanbanBoard(id) ON DELETE CASCADE`

ไม่มี `DROP` · ไม่มี `ALTER … TYPE` · ไม่แตะคอลัมน์ของตารางเดิมเลย ⇒ โค้ดรุ่นก่อนที่ยังวิ่งระหว่าง deploy ทำงานต่อได้
**ไม่มี backfill**: บอร์ดเดิมไม่ต้องมีแถวสมาชิก เพราะสิทธิ์ของ OWNER/MANAGER/บอร์ด TENANT เป็น "โดยนัย" คิดในโค้ด ⇒ ไม่มีใครหลุดสิทธิ์ตอน deploy

คำสั่งที่ใช้ลง QC (ตามกติกาข้อ 5):
```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
pnpm exec prisma migrate deploy && pnpm exec prisma generate
→ Applying migration `20260921000000_kanban_v2_c` … All migrations have been successfully applied. · ✔ Generated Prisma Client (v7.8.0)
```

---

## 4. อัลกอริทึมสิทธิ์ที่ทำจริง (`access.ts` — บริสุทธิ์ ไม่แตะ DB)

`boardRole(actor, board, memberships?) → "ADMIN"|"EDITOR"|"VIEWER"|null`

0. **ชั้นที่ 1** `canReadKanban(actor)` — `evaluate(actor, {module:"kanban", action:"kanban.board.read"})`
   **หรือ** มีคีย์ `kanban.*` ตัวใดตัวหนึ่งเป็น `true` (backward compat §6.1: `kanban.board.read` เพิ่งมีวันนี้ ถ้าตรวจตรงตัวคนที่เจ้าของเคยติ๊ก `kanban.card.create` จะเข้าไม่ได้ทันทีที่ deploy) — ไม่ผ่าน = `null` ทุกบอร์ด แม้บอร์ด TENANT
1. `actor.role === "OWNER"` → `ADMIN` ทุกบอร์ด (ไม่ต้องเชิญ · D2)
2. เส้นทาง "ถูกเชิญไว้ชัด ๆ" = `memberships.find(m => m.userId === actor.userId)?.role`
3. เส้นทาง "MANAGER คุมสาขาของบอร์ด" = `role==="MANAGER" && board.unitId !== null && canAccessUnit(actor, board.unitId)` → `EDITOR` (บอร์ดกลางองค์กร `unitId=null` ไม่ให้โดยนัย)
4. เส้นทาง "บอร์ด TENANT" → `VIEWER`
5. คืน **บทบาทสูงสุด** ของ 3 เส้นทาง (ADMIN > EDITOR > VIEWER) · ไม่มีเลย = `null`

`visibleBoardsWhere(actor) → Prisma.KanbanBoardWhereInput` (where เดียวส่ง DB ไม่กรองใน JS):
- ไม่ผ่านชั้นที่ 1 → `{ id: "__none__" }` (fail-closed — ไม่ใช่ `{}` ที่แปลว่าเห็นหมด)
- OWNER → `{}`
- อื่น ๆ → `OR: [ {visibility:"TENANT"}, {members:{some:{userId}}}, (MANAGER: unitAccess มี "*" ? {unitId:{not:null}} : {unitId:{in:unitAccess}}) ]`
- ผู้เรียกต้อง AND กับ `{tenantId, systemId, status}` เสมอ (ทำให้แล้วใน `listBoardsFor`/`listMyCards`)

`assertBoardRole(ctx, boardId, need)` (ใน `members.ts`) — ลำดับห้ามสลับ: บอร์ดไม่อยู่ในร้าน/ระบบ **หรือ** `boardRole = null` → `KanbanNotFoundError` (404 "ไม่พบบอร์ดนี้") · เห็นแต่ยศไม่ถึง → `KanbanForbiddenError` (403 "คุณดูบอร์ดนี้ได้อย่างเดียว" / "ต้องเป็นผู้ดูแลบอร์ดนี้ถึงจะทำรายการนี้ได้")

**ADMIN คนสุดท้าย**: `assertNotLastAdmin()` นับจาก **แถวที่ประกาศไว้ชัด ๆ** เท่านั้น — ถอด/ลดขั้นคนที่เป็น ADMIN แถวสุดท้ายไม่ได้ แม้ OWNER จะเป็น ADMIN โดยนัยอยู่แล้ว (ตามสัญญา §K1.3: "OWNER แม้เป็น ADMIN โดยนัยก็ต้องตั้ง ADMIN ใหม่ก่อน") ข้อความไทย: "ต้องตั้งผู้ดูแลบอร์ดคนใหม่ก่อน — บอร์ดนี้เหลือผู้ดูแลคนสุดท้ายแล้ว"

---

## 5. AuditLog

`writeAudit()` ย้ายจาก `src/lib/modules/account/access.ts:63` → **`src/lib/core/audit.ts`** (ของกลางแพลตฟอร์ม) แล้ว account re-export ชื่อเดิมต่อ
เหตุผล: ถ้า kanban import จาก account จะเกิดเส้น `kanban→account` ที่ fitness **F2.1 ห้าม** และการก๊อปตรรกะไปไว้ในโมดูลตัวเองก็ผิดหลักเดียวกัน (ทั้งคู่ผิด → ยกขึ้น core) · พฤติกรรมเดิมทุกอย่าง (กลืน error ไม่ให้ audit ล้มทำ action หลักพัง)

แถวที่ K1.3 เขียน (ทุกตัว `actorType = USER` · `actorId = ctx.actorUserId` · `targetType = "KanbanBoard"` · `targetId = boardId` · `before`/`after` เป็น JSON เฉพาะที่เปลี่ยน + `boardName`):

| action | เมื่อไร |
|---|---|
| `kanban.board.member.add` | `addMember` (เชิญใหม่ หรือเชิญซ้ำ=เปลี่ยนบทบาท — `before` มีค่าเมื่อมีแถวเดิม) |
| `kanban.board.member.role` | `setMemberRole` |
| `kanban.board.member.remove` | `removeMember` · `leaveBoard` (`after.self = true`) |
| `kanban.board.visibility` | `setBoardVisibility` (ข้ามเมื่อค่าเดิมเท่าค่าใหม่) |

**ติดดาว/เอาดาวออกไม่เขียน audit** — เป็นความชอบส่วนตัวรายคน ไม่ใช่การเปลี่ยนสิทธิ์/ข้อมูลร่วม (สัญญาระบุ action ไว้ 4 ตัวข้างบนเท่านั้น · §6.5 ของพิมพ์เขียวก็ไม่ได้ลิสต์ดาว)
หมายเหตุชื่อ action: ใช้ `kanban.board.member.*` / `kanban.board.visibility` ตามสัญญา §K1.3 (พิมพ์เขียว §6.5 เขียนไว้เป็น `kanban.member.added` ฯลฯ — ข้อสอบรับทั้งสองแบบด้วย regex, ยึดสัญญาของ RUN)

---

## 6. หน้าเดิม (UI/actions) เปลี่ยนอะไร — ที่เหลือคงเดิมรอ K1.5

**`ui.tsx`**
- helper ใหม่ `authScope(systemId)` = `requireTenant()` → `{ctx, actor}` (`toActor(auth.user.id, auth.active)`)
- `KanbanBoardsSection` / `KanbanHub`: `listBoards` → **`listBoardsFor(ctx, actor)`** ⇒ บอร์ดที่มองไม่เห็นหายจากรายการและจากตัวนับ · บอร์ดติดดาวขึ้นก่อน + นำหน้าด้วย `★`
- `KanbanMyTasksSection` / `KanbanHub`: `listMyCards(tenantId, systemId, userId, **actor**)`
- `KanbanBoardView`: `getBoard` → **`getBoardFor`** · จับ `KanbanNotFoundError` → หน้าเดิม "ไม่พบบอร์ดนี้" (404 ไม่ใช่ 403 · ไม่บอกว่ามีบอร์ดอยู่)
- ซ่อนปุ่มตามบทบาท (§6.3 "ห้ามโชว์ปุ่มที่กดแล้วเด้ง 403"): VIEWER ไม่เห็นฟอร์มเพิ่มการ์ด/เพิ่มคอลัมน์/ปุ่มย้าย ◀▶/ปุ่มเก็บการ์ด/ปุ่มลบคอลัมน์ · ปุ่ม "เก็บบอร์ด" เห็นเฉพาะ ADMIN
- โครง/คลาส/ข้อความอื่นไม่แตะเลย (K1.5 จะรื้อทั้งหน้าตามแบบ)

**`actions.ts`** — ชั้นที่ 1 (`assertCan` เดิม) คงไว้ทุกตัว แล้วเพิ่มชั้นที่ 2:

| action | ด่านที่เพิ่ม |
|---|---|
| `renameBoardAction` · `archiveBoardAction` | `assertBoardRole(ctx, boardId, "ADMIN")` |
| `createColumnAction` | `assertBoardRole(ctx, boardId, "EDITOR")` |
| `archiveColumnAction` | `assertColumnRole(ctx, columnId, "EDITOR")` |
| `createCardAction` | `assertColumnRole(ctx, columnId, "EDITOR")` |
| `updateCardAction` · `moveCardAction` · `archiveCardAction` | `assertCardRole(ctx, cardId, "EDITOR")` |
| `createBoardAction` | คงเดิม (ยังไม่มีบอร์ดให้ตรวจบทบาท) |

- 🔴 `assertColumnRole`/`assertCardRole` **หาบอร์ดจาก columnId/cardId จริงใน DB ไม่เชื่อ `boardId` ในฟอร์ม** — ไม่งั้นคนที่เป็น ADMIN บอร์ดตัวเองยิง `columnId` ของบอร์ดลับพร้อม `boardId` ของตัวเองก็ผ่านด่านได้
- ⚠️ ต่างจากพิมพ์เขียว §6.4 ตรงหนึ่งจุด (จงใจ ตามใบสั่งงาน): ตาราง §6.4 ให้ "จัดการคอลัมน์" เป็น ADMIN เท่านั้น แต่ใบสั่ง K1.3 สั่ง "EDITOR สำหรับการ์ด/คอลัมน์" — ทำตามใบสั่ง (ถ้าจะเข้มตามตาราง แก้จุดเดียวที่ `createColumnAction`/`archiveColumnAction` ใน K1.4 ตอนคอลัมน์ย้ายไป `moves.ts`)
- F6 (fitness authz) ยังเขียว: `actions.ts` ยังมี `assertCan` ตรง ๆ ในไฟล์

---

## 7. ข้อที่ตก: `K1.3-S4.6` — ลำดับของข้อสอบเอง ไม่ใช่โค้ด

**ข้อสอบทำอะไร** (`scripts/qc-kanban-k1.3.mts` บล็อก S4):
1. S3 เรียก `addMember` ×2 · `setMemberRole` ×1 · `removeMember` ×1 → เขียน AuditLog 4 แถว
2. บรรทัดแรกของ S4: `await prisma.auditLog.deleteMany({ where: { tenantId: tid } })` → **ลบ 4 แถวนั้นทิ้ง**
3. หลังจากนั้น S4 ทำแต่ ดาว + `setBoardVisibility` ×2 (สำเร็จ) — ไม่มี mutation สมาชิกอีกเลย
4. แล้ว assert ว่า `actions` ต้องมีทั้ง `member.(add|added)` · `member.(role|changed)` · `member.(remove|removed)` **และ** visibility ×2

⇒ ข้อนี้ผ่านไม่ได้ด้วยพฤติกรรมที่ถูกต้อง เว้นแต่จะเขียนแถว audit สมาชิกปลอมตอนเปลี่ยน visibility (= ปลอมประวัติ) หรือปล่อย audit เป็น fire-and-forget ให้แถวเก่ามาลงหลังคำสั่งลบ (= race ที่ไม่แน่นอน) — ไม่ทำทั้งสองอย่าง

**ผลจริงที่ได้**: `act kanban.board.visibility,kanban.board.visibility` (2 แถว ตรงตามที่เหลืออยู่จริงหลังคำสั่งลบ · ทั้งคู่ `targetId = boardId` · action ขึ้นต้น `kanban.` ครบ)

**Positive control** (probe ชั่วคราว รันแล้วลบไฟล์ทิ้ง — ทำซ้ำได้ด้วยการเรียก 4 คำสั่งเดียวกันแล้วอ่าน AuditLog):
```
kanban.board.member.add    · targetType=KanbanBoard · targetId=cmtox1sgq000ghzkz6rtkcugr · ตรงบอร์ด=true · after={"role":"EDITOR","userId":…}
kanban.board.member.add    · targetType=KanbanBoard · targetId=cmtox1sgq000ghzkz6rtkcugr · ตรงบอร์ด=true · after={"role":"ADMIN","userId":…}
kanban.board.member.role   · targetType=KanbanBoard · targetId=cmtox1sgq000ghzkz6rtkcugr · ตรงบอร์ด=true · after={"role":"VIEWER","userId":…}
kanban.board.member.remove · targetType=KanbanBoard · targetId=cmtox1sgq000ghzkz6rtkcugr · ตรงบอร์ด=true · after={"removed":true,…}
มี add/role/remove ครบ: true
```
(`cmtox1sgq000ghzkz6rtkcugr` = `boards.patong.id` ใน `scripts/kanban-expected.json`)

**เสนอให้ Fable แก้ข้อสอบ** (ผู้สร้างข้อสอบแก้เอง ตามกติกาข้อ 1) — เลือกทางใดทางหนึ่ง:
- ย้าย `auditLog.deleteMany` ขึ้นไปไว้ **ก่อน** บล็อก S3 (แถว member + visibility จะอยู่ครบในชุดเดียว) หรือ
- แยก S4.6 เป็น 2 ข้อ: อ่าน audit ของสมาชิกท้าย S3 (ก่อนลบ) + อ่าน audit ของ visibility ใน S4

---

## 8. คำสั่งที่รัน + บรรทัดสุดท้าย

```
pnpm exec tsx scripts/qc-kanban-k1.3.mts
  ผ่าน 28/29
  FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":29,"passed":28,"findings":["K1.3-S4.6"]}

pnpm exec tsx scripts/qc-kanban-k1.1.mts
  ผ่าน 30/30 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":30,"passed":30,"findings":[]}

pnpm exec tsx scripts/qc-kanban-k1.2.mts
  ผ่าน 25/25 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":25,"passed":25,"findings":[]}

QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-kanban-notify.mts
  QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด

pnpm exec tsx scripts/qc-ai-kanban-board.mts
  ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit
  (ไม่มี output = 0 error)

pnpm fitness
  ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
  ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

---

## 9. probe เสริมที่รันเอง (นอกข้อสอบ · ไฟล์ชั่วคราว ลบแล้ว)

| ทดสอบ | ผล |
|---|---|
| owner ร้าน QC ใช้ `tenantId` ของร้านอื่น (`siamdive`) เพิ่มสมาชิกบอร์ดกะตะ | `KanbanNotFoundError: ไม่พบบอร์ดนี้` |
| owner ระบุ `systemId` มั่ว | `KanbanNotFoundError` |
| ธนายิง `columnId` ของบอร์ดลับ (ขอ EDITOR) | `KanbanNotFoundError` (ไม่ leak ว่าคอลัมน์มีจริง) |
| ปุ๊กยิง `cardId` ของบอร์ดลับ | `KanbanNotFoundError` |
| ธนา (VIEWER บอร์ด TENANT) ขอสิทธิ์แก้การ์ด | `KanbanForbiddenError: คุณดูบอร์ดนี้ได้อย่างเดียว` (403 ถูกต้อง — เห็นได้แต่ทำไม่ได้) |
| ธนาขอสิทธิ์ **อ่าน** การ์ดบอร์ด TENANT | ผ่าน (positive control — ด่านไม่ได้ปฏิเสธมั่ว) |
| ผู้จัดการป่าตองเปิดบอร์ดลับกะตะผ่าน `getBoardFor` | `KanbanNotFoundError` |
| ดาวของคนอื่นไม่โผล่ใน `listStarredBoardIds` ของเรา | ✅ |

---

## 10. ค้าง/ฝากต่อ

- **หน้าจอจัดการสมาชิก/ดาว/visibility ยังไม่มี** — WO นี้ทำเฉพาะ service + ด่านสิทธิ์ + หน้าเดิมที่ต้องไม่โชว์บอร์ดต้องห้าม (ตามสัญญา) · ปุ่ม/หน้าตั้งค่าบอร์ดอยู่ K1.5–K1.6
- `leaveBoard` มีแล้วแต่ยังไม่มีจุดเรียกใน UI
- `listMembers` คืนเฉพาะ "สมาชิกที่ถูกเชิญไว้ชัด ๆ" ไม่รวมคนที่มีสิทธิ์โดยนัย (OWNER/MANAGER สาขา/ทุกคนเมื่อบอร์ดเป็น TENANT) — หน้าจอ K1.6 ควรอธิบายให้ผู้ใช้เห็นทั้งสองแบบ (มี `tenantRole` ติดมาแล้วให้ใช้)
- `listBoards`/`getBoard` ตัวเดิม (ไม่กรองสิทธิ์) ยังอยู่เพราะ seed/AI/ข้อสอบเก่าเรียก — **ทุกจุดที่มี "คนกด" ต้องใช้ตัว `…For`** · ถ้าจะปิดถาวรควรทำตอนย้าย `boards.ts` ใน WO หลัง
- `AutomationRule`/รายงาน/ความเห็น/ไฟล์แนบ ที่จะมาใน P2 ต้องเรียก `assertBoardRole` ก่อนทุกครั้ง (คีย์สิทธิ์ของมัน `kanban.automation.manage` · `kanban.report.view` · `kanban.card.comment` · `kanban.card.attach` ลงทะเบียนไว้ให้แล้วใน WO นี้)


## ภาคผนวกโดย Fable (ตรวจรับ 05:59 น.)
- S4.6: builder ถูก — oracle ลบ AuditLog ต้น S4 ก่อนเช็คแถว member · ย้าย deleteMany ไปต้น S3 · 29/29
- รับ deviation: คอลัมน์ = EDITOR (บันทึกเป็น D16 · archive/WIP/done = ADMIN) · star ไม่เขียน audit (ถูก — เป็น preference ส่วนตัว)
- รับการย้าย `writeAudit` → `src/lib/core/audit.ts` (account re-export ชื่อเดิม · F2.1 ไม่แดง)
- รันซ้ำเอง: k1.3 29 · k1.2 25 · k1.1 30 · notify 12 · typecheck 0 · fitness 20/20 ×2 · migration C ดูตาแล้ว additive (ไม่ต้อง backfill)
