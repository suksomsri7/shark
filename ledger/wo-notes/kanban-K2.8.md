# K2.8 — กล่องงานเข้าส่วนตัว (KanbanInboxItem) · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K2.8 · oracle `scripts/qc-kanban-k2.8.mts` (17 ข้อ, ไม่แก้) · ภาพ `scripts/visual-kanban.mts 2.8` · mockup `ledger/design-kanban/06-my-tasks.png` (ฝั่งซ้าย + หัวจอ) + `07-mobile.png` (จอ ค)

## 1. สิ่งที่ทำ (ภาพรวม)

- **migration `20261004000000_kanban_v2_n`** (additive — `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` เทียบ DB จริงบน QC แล้วเติมพาร์เชียลยูนีคด้วยมือ): `enum KanbanInboxStatus {OPEN MOVED DISMISSED}` · `CREATE TABLE "KanbanInboxItem"` (`tenantId systemId ownerUserId title note source sourceKey fileIds status movedCardId createdAt updatedAt`) · `CREATE INDEX` `(tenantId, systemId, ownerUserId, status, createdAt)` · `CREATE UNIQUE INDEX ... ("tenantId","sourceKey") WHERE "sourceKey" IS NOT NULL` (partial — เขียนมือเหมือน `KanbanBoardTemplate_scope_key_key` ของ K1.12 เพราะ Prisma schema ไม่รองรับ `WHERE` บน `@@unique`) — อ่าน SQL ด้วยตาแล้ว มีแต่ `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX` ไม่มี DROP/ALTER ตารางเดิม · ลงทะเบียน `KanbanInboxItem: sys()` ใน `scope.ts` · `prisma generate` แล้ว (ห้าม `prisma format`)
- **`src/lib/modules/kanban/inbox.ts`** (ใหม่ — server-only, `import { prisma } from "./db"`): `listInbox(ctx,userId)` (บังคับ `userId === ctx.actorUserId` แม้ OWNER) · `quickAdd(ctx,{title})` (trim · ว่าง throw · เพดาน `KANBAN_LIMITS.inboxOpenMax=200` ต่อคนต่อระบบ) · `addFromSource(ctx,{ownerUserId,source,sourceKey,title,note?,fileIds?})` (idempotent `(tenantId,sourceKey)` — ชนกันจากยิงพร้อมกันจับด้วย catch แล้วอ่านซ้ำ · ตรวจ `ownerUserId` ต้องเป็นสมาชิกร้านจริง) · `moveToBoard(ctx,{itemId,boardId,columnId,dueAt?,assigneeUserIds?})` (ของตัวเองเท่านั้น · claim อะตอมมิกในทรานแซกชันเดียวกับสร้างการ์ด กันกดซ้ำ 2 แท็บ · **override ตามหมายเหตุ WO**: `sourceType` ตาม `item.source` + `sourceId = item.sourceKey ?? item.id` (`service.createCard` ยังไม่มีพารามิเตอร์ `sourceKey` — K3.1 จะเพิ่ม) · ผู้ส่ง=assignee ปริยาย · ไฟล์ใน `fileIds` ผูกเป็น `KanbanAttachment` อ้าง `FileAsset` เดิมตรง ๆ ไม่อัปซ้ำ · `logActivity`+`emitOutbox kanban.card.created` ในทรานแซกชันเดียวกับสร้างการ์ด+ปิดรายการเป็น MOVED+`movedCardId`) · `dismiss(ctx,itemId)` · `listInboxTargets(ctx,actor)` (เพิ่มเอง ไม่ได้ปักในสัญญา — บอร์ด ACTIVE ที่ actor เป็น EDITOR+ พร้อมคอลัมน์ ACTIVE ของบอร์ดนั้น ใช้เป็นตัวเลือกใน popover "ส่งเข้าบอร์ด")
- **`src/lib/outbox-consumers.ts`**: ลงทะเบียน `"kanban.inbox.requested": withAutomation(async (evt) => { ... addFromSource ... })` (§9.2 — ตัวยิงจริงจากแชท/อีเมลมาใน K3.3 แต่ลงทะเบียนไว้ก่อนกันคิวตันเงียบ ๆ ตามบทเรียน 30 ส.ค.) — payload validate ชนิดก่อนเรียก · ล้มแล้ว `logOps WARN` ไม่ throw ต่อ (best-effort เหมือน `chat.message.received` handler ข้างเคียง)
- **`src/components/kanban/InboxPanel.tsx`** (ใหม่ — client): testid `inbox-panel`/`inbox-quick-add`/`inbox-item` ตามภาพ 06 ฝั่งซ้าย — หัวข้อ+จำนวน (แดง) + คำอธิบาย · ช่อง Enter จด · รายการ = ชื่อ+เวลา (นาทีที่แล้ว/ชม.ที่แล้ว/เวลาไทย) + ชิปที่มา + ป้าย "AI ตั้งชื่อ + สรุปให้แล้ว" (เมื่อมี note) + ปุ่ม "ส่งเข้าบอร์ด" (popover เลือกบอร์ด→คอลัมน์→กำหนดส่งไม่บังคับ testid `inbox-move-popover`/`inbox-move-board`/`inbox-move-column`/`inbox-move-due`/`inbox-move-confirm`/`inbox-move-cancel`) + "ไม่เอาแล้ว" (optimistic + rollback ถ้าล้ม) · empty state ตามสัญญา · บรรทัดท้าย
- **`src/components/kanban/MyTasks.tsx`** (แก้ — ยังเป็นไฟล์ client เดิมของ K1.13 แต่ตอนนี้เป็น wrapper ของทั้งหน้า): เพิ่มหัวจอ "สวัสดีตอน{เช้า/บ่าย/เย็น} {ชื่อ}" (คำนวณเวลาไทยเองด้วย `BKK_OFFSET_MS`+`getUTCHours` — ห้าม `toLocale*`) + "{วันไทยเต็ม} {วันที่} {เดือนไทยเต็ม} {ปี พ.ศ.} · มีงานถึงกำหนดวันนี้ n งาน · เลยกำหนด n งาน" + dropdown "ทุกบอร์ด" (กรองรายการ "งานที่มอบหมายให้ฉัน" ตามบอร์ด — ฟีเจอร์เสริมที่ไม่ได้ปักในสัญญา แต่ตรงกับภาพ 06 และไม่กระทบ KPI/checklist/watching) + ปุ่ม "+ จดงานเร็ว" (เลื่อน+โฟกัสช่อง `#inbox-quick-add-input` ของ `<InboxPanel>`) · จัด layout 2 คอลัมน์ desktop (`lg:grid-cols-[340px_1fr]`) ซ้าย=`<InboxPanel>` ขวา=เนื้อหาเดิมของ K1.13 · มือถือ `flex-col` + `order-1`/`order-2` สลับ (งานของฉันบนสุด กล่องงานเข้าถัดลงมา — ตรงสัญญา §3.8)
- **`src/app/app/sys/[id]/kanban/my-tasks/page.tsx`**: เรียก `listInbox`+`listInboxTargets` คู่กับ `myTasksOverview` (`Promise.all`) แล้วส่ง `userName`/`inboxItems`/`inboxBoards` ให้ `<MyTasks>` · ขยาย `max-w-3xl` → `max-w-5xl` ให้ 2 คอลัมน์ไม่บีบ
- **`src/lib/modules/kanban/actions.ts`**: `quickAddInboxAction` (`kanban.board.read`) · `moveInboxToBoardAction` (`kanban.card.create`) · `dismissInboxAction` (`kanban.board.read`) — ทุกตัว `revalidatePath(myTasksPath)` (+ `boardPath` สำหรับ moveInboxToBoardAction)
- **`src/lib/modules/kanban/nav.ts`**: `inbox` เปลี่ยนจาก `status:"soon"` → `status:"ready", path:"/kanban/my-tasks#inbox"` (กล่องงานเข้าเป็นคอลัมน์ของหน้า "งานของฉัน" ไม่ใช่หน้าแยก — ตรงตามที่ WO สั่ง "ready ที่หน้า my-tasks")
- **`src/lib/modules/kanban/limits.ts`**: เพิ่ม `inboxOpenMax: 200`
- **`src/lib/modules/kanban/types.ts`**: เพิ่ม `KanbanInboxSource`/`InboxItemDto` (DTO บริสุทธิ์ — มี `ownerUserId`/`status`/`movedCardId` เพิ่มจากที่ร่างไว้ตอนแรก เพราะ oracle S2.1 ตรวจสองฟิลด์นี้จากค่าที่ `quickAdd` คืน)
- **`scripts/visual-kanban.mts`**: เพิ่ม spec `"2.8"` (4 ใบ: `my-tasks-inbox` desktop · `inbox-quick-add` desktop (พิมพ์+Enter จริง) · `inbox-move-popover` desktop (คลิกเปิด popover จริง) · `mobile-my-tasks-inbox` mobile) + บล็อกเตรียม/คืนสภาพ `KB28` (จดเร็ว 1 ใบ + `addFromSource` อีเมล 1 ใบ ก่อนถ่าย แล้วลบทั้งคู่ + รายการที่สเปค quick-add จดจริงผ่านหน้าเว็บใน `finally`)

## 2. Function map

| ฟังก์ชัน | ไฟล์ | หมายเหตุ |
|---|---|---|
| `listInbox(ctx,userId)` | `inbox.ts` | OPEN เท่านั้น ใหม่ก่อน · `userId !== ctx.actorUserId` → Forbidden เสมอ (แม้ OWNER) |
| `quickAdd(ctx,{title})` | `inbox.ts` | source MANUAL เสมอ · เพดาน 200/คน/ระบบ |
| `addFromSource(ctx,input)` | `inbox.ts` | idempotent ด้วย `(tenantId,sourceKey)` · `ctx.actorUserId` เป็น `null` ได้ (เรียกจาก consumer) |
| `moveToBoard(ctx,{itemId,boardId,columnId,dueAt?,assigneeUserIds?})` | `inbox.ts` | EDITOR+ ของบอร์ดปลายทาง (`assertColumnRole`) · claim อะตอมมิก + สร้างการ์ด + ผูกไฟล์แนบ + ปิดรายการ MOVED ใน tx เดียว |
| `dismiss(ctx,itemId)` | `inbox.ts` | ของตัวเอง + ยัง OPEN เท่านั้น |
| `listInboxTargets(ctx,actor)` | `inbox.ts` | บอร์ด EDITOR+ พร้อมคอลัมน์ ให้ popover เลือก |
| consumer `kanban.inbox.requested` | `outbox-consumers.ts` | เรียก `addFromSource` แบบ best-effort |

## 3. ผลด่านตัวเลขจริง

- **oracle `qc-kanban-k2.8.mts`: 7/8 ที่รันได้ก่อนชน CRASH ที่ S2.6** (ดู §4 — เชื่อว่าเป็นช่องโหว่ของ setup ใน oracle เอง ไม่แก้ไฟล์ oracle ตามกติกา) — S1.1, S1.2, S2.1–S2.5 ผ่านหมด ✅
- **regressions**: `qc-kanban-k1.1` 29/30 (K1.1-S2.3 flake เดิม รันซ้ำได้ — ไม่เกี่ยวกับ K2.8) · `k1.2` 25/25 · `k1.3` 29/29 · `k1.4` 30/30 · `k1.5` 17/17 · `k1.6` 20/20 · `k1.7` 21/21 · `k1.8` 18/18 · `k1.9` 18/18 · `k1.10` 16/16 · `k1.11` 21/21 · `k1.12` 18/18 · `k1.13` 16/16 · `k1.14` 15/15 · `k1.15` 30/30 · `k2.1` 22/22 · `k2.2` 16/16 · `k2.4` 12/12 · `k2.5` 15/15 · `k2.6` 17/17 · `k2.7` 31/31 — **ทุกชุดเขียว 100% ยกเว้น flake เดิม**
- `qc-nav-functions.mts`: **10/10 ผ่านทั้งหมด** (S0.2 นับ `inbox` เป็น ready path ตัวที่ 4 ของ KANBAN ถูกต้อง)
- `qc-kanban-notify.mts`: **12/12 ผ่านทั้งหมด**
- `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit`: **0 error**
- `pnpm exec tsx scripts/fitness.mts`: **23/23 ผ่านทั้งหมด** (F13.4/F13.6 ไม่กระทบ — K2.8 ไม่เพิ่ม REST op ตามหนี้รวม P2 ที่ K2.5/K2.6/K2.7 ยอมรับไว้แล้ว)
- ภาพจริง: `bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-kanban.mts 2.8` → **4 ใบ ทุกใบ HTTP 200 + expect ครบ + ไม่มี console error (`failures:0`)** ใน `.qc-shots/kanban/2.8/`

## 4. ⚠️ ข้อแย้ง oracle — ไม่แก้ไฟล์ (ตามกติกา §1)

**K2.8-S2.6 เป็นต้นไป (CRASH)** — `moveToBoard` โยน `KanbanForbiddenError: คุณดูบอร์ดนี้ได้อย่างเดียว` ตอน `ctxP` (pook) เรียก `moveToBoard` เข้าบอร์ด "ซ่อมบำรุงอุปกรณ์" (`E.boards.maint`, visibility `TENANT`)

**หลักฐาน**:
- สัญญา K2.8 เขียนไว้ตรง ๆ: `moveToBoard(...)` "**ของตัวเอง + EDITOR ของบอร์ด**" — implementation ผมตรวจผ่าน `assertColumnRole(ctx, columnId, "EDITOR")` ตรงตามตัวอักษร
- oracle `qc-kanban-k2.8.mts` ไม่มีขั้นเชิญ/ตั้ง `KanbanBoardMember` ให้ `pook` เป็น EDITOR ของบอร์ด maint ที่ไหนเลย (grep `EDITOR`/`boardMember`/`Member` ในไฟล์ oracle = ไม่เจอ) ก่อนเรียก `inbox.moveToBoard(ctxP, {...boardId: board /* = maint */...})`
- ตรวจ DB จริงบน QC: `KanbanBoardMember` ของบอร์ด maint = **ว่างเปล่า** (`[]`) · `pook` เป็น `STAFF` (ไม่ใช่ MANAGER ที่จะได้ EDITOR โดยนัยผ่าน unit) · บอร์ด maint เป็น `visibility TENANT` ⇒ ตาม `boardRole()` (`access.ts` บรรทัด `byVisibility: board.visibility === "TENANT" ? "VIEWER" : null`) pook ได้แค่ **VIEWER** โดยปริยาย ไม่ใช่ EDITOR
- นี่คือบั๊กคลาสเดียวกับที่เจอใน **K2.6** (บันทึกใน `ledger/KANBAN-RUN.md` แถว K2.6: "thana = VIEWER บนบอร์ด TENANT ไม่ใช่ EDITOR → เชิญเป็น EDITOR ชั่วคราวใน setup") — K2.6's oracle ถูกแก้ให้เชิญ thana เป็น EDITOR ชั่วคราวก่อนทดสอบ แต่ K2.8's oracle ไม่ได้ทำแบบเดียวกันให้ pook
- **ยืนยันว่า implementation ถูกต้องตามสัญญา**: เขียนสคริปต์ทดสอบชั่วคราว (ลบแล้ว) เชิญ `pook` เป็น `KanbanBoardMember` role `EDITOR` ของบอร์ด maint ก่อน แล้วเรียก `quickAdd`→`moveToBoard`→ยิงซ้ำ→`dismiss` ผ่าน `inbox.ts` จริงทั้งหมด — **ทุกจุดทำงานถูกต้องครบ**: การ์ดถูกสร้างในคอลัมน์ที่ระบุ (`title`/`description`=note/`sourceType`/`sourceId`=sourceKey∥id/`createdById`/`assigneeUserId` ถูกต้องทุกฟิลด์) · รายการ → `status:"MOVED"` + `movedCardId` ตรงกับการ์ดที่สร้าง · เรียกซ้ำครั้งที่สอง → throw ไทย "รายการนี้ถูกจัดการไปแล้ว — ส่งเข้าบอร์ดซ้ำไม่ได้" (ไม่สร้างการ์ดใบที่สอง) · `dismiss` ของรายการอื่นทำงานถูกต้อง — คืนสภาพ DB ครบ (ลบการ์ด/กิจกรรม/รายการที่สร้างทดสอบ + ถอด `KanbanBoardMember` + คืน `cardNoSeq`) หลังพิสูจน์เสร็จ

**ข้อเสนอสำหรับ Fable**: เติมขั้น "เชิญ `pook` เป็น `KanbanBoardMember` role `EDITOR` ของ `E.boards.maint` ชั่วคราว" ในไฟล์ oracle (แบบเดียวกับที่ K2.6 ทำกับ thana) ก่อนบรรทัดที่เรียก `moveToBoard` ครั้งแรก แล้วถอดใน `finally` — เมื่อแก้แล้วคาดว่า S2.6 เป็นต้นไปจะผ่านหมด (พิสูจน์แล้วด้วย EDITOR ชั่วคราวข้างต้น ผลตรงกับที่ oracle คาดหวังทุกจุดที่ตรวจสอบได้)

## 5. deviation อื่น (ยอมรับ/บันทึกไว้)

1. **`InboxItemDto` เพิ่ม `ownerUserId`/`status`/`movedCardId`** เกินจากที่ร่างไว้ตอนแรกในสัญญา (`{id,title,note,source,sourceLabel,createdAt,fileIds}`) — จำเป็นเพราะ oracle S2.1 ตรวจ `i1.status === "OPEN" && i1.ownerUserId === pook.userId` จากค่าที่ `quickAdd` คืนตรง ๆ ไม่ใช่แค่ผ่าน `listInbox`
2. **dropdown "ทุกบอร์ด" ทำงานจริง** (กรองรายการฝั่งขวาตามบอร์ด) — ไม่ได้ปักไว้ในสัญญา/oracle แต่ตรงกับภาพ 06 และ implement ในไฟล์เดียว (`MyTasks.tsx`) ไม่กระทบ service — ไม่กรอง KPI/เช็คลิสต์/ที่ฉันติดตาม (ตั้งใจ: ตัวเลขสรุปหัวจอควรคงที่ไม่ขยับตามตัวกรองรายการ)
3. **ปุ่ม "จดงานเร็ว" เป็น `<a href="#inbox-quick-add-input">` + โฟกัสด้วย `setTimeout`** ไม่ใช่ modal/flyout แยก — สัญญาบอกแค่ "ปุ่ม จดงานเร็ว" ไม่ได้ปักพฤติกรรม เลือกทางที่ตรงไปตรงมาที่สุด (เลื่อน+โฟกัสช่องที่มีอยู่แล้วในกล่องงานเข้า แทนการสร้าง modal ซ้อน)
4. **`listInboxTargets`** เป็นฟังก์ชันที่เพิ่มเองนอกสัญญา (ไม่มีชื่อนี้ใน §K2.8) — จำเป็นสำหรับ popover "ส่งเข้าบอร์ด" ต้องมีรายชื่อบอร์ด/คอลัมน์ให้เลือก (สัญญาพูดถึง popover แต่ไม่ได้ระบุแหล่งข้อมูล)
5. **หนี้ P2 เดิม (K2.5/K2.6/K2.7)**: K2.8 ไม่เพิ่ม REST op/AI tool ให้ inbox (ทำเป็น WO รวบตอนปิด P2/P3 ตามที่ K2.6 บันทึกไว้)
6. **แถบล่างมือถือ 5 เมนู (บอร์ด/งานฉัน/กล่องเข้า/ปฏิทิน/รายงาน) ในภาพ 07 จอ ค ยังไม่มี** — ไม่มี WO ก่อนหน้า (K1.13/K1.14) สร้างไว้เลย เป็นงานระดับ app-shell (กระทบทั้งแอปไม่ใช่แค่โมดูล kanban) — ปล่อยเป็นหนี้เดียวกับที่ K1.13 ไม่ได้ทำ ไม่ใช่ของใหม่จาก WO นี้

## 6. Verify — ภาพจริง (เปิดดูเองทีละใบ · เทียบ mockup 06/07)

`.qc-shots/kanban/2.8/` (4 ใบ):
- `my-tasks-inbox-desktop.png` — เทียบภาพ 06: หัว "สวัสดีตอนบ่าย เจ้าของร้าน (KB QC)" + "จันทร์ 7 กันยายน 2569 · มีงานถึงกำหนดวันนี้ 0 งาน · เลยกำหนด 0 งาน" + dropdown "ทุกบอร์ด" + ปุ่ม "+ จดงานเร็ว" ตรงตำแหน่ง · ซ้าย = กล่องงานเข้า (2 รายการเตรียมไว้: "ใบแจ้งหนี้ค่าอากาศอัดเดือนนี้" ชิป "ส่งต่อทางอีเมล"+"AI ตั้งชื่อ + สรุปให้แล้ว" · "โทรยืนยันคิวซ่อมพรุ่งนี้" ชิป "จดไว้เอง") + ปุ่ม "ส่งเข้าบอร์ด"/"ไม่เอาแล้ว" ทุกใบ + บรรทัดท้าย · ขวา = 4 ตัวเลข + "งานที่มอบหมายให้ฉัน" (ว่าง เพราะ owner ไม่มีการ์ดที่รับผิดชอบ — ถูกต้องตามข้อมูลจริง)
- `inbox-quick-add-desktop.png` — พิมพ์ "ทดสอบจดงานเร็ว QC" + Enter จริงผ่าน puppeteer → รายการใหม่โผล่ **บนสุด** ทันที + ตัวนับหัวข้อขยับ 2→3 (ยืนยันว่า optimistic update + server เขียนจริงตรงกัน)
- `inbox-move-popover-desktop.png` — คลิก "ส่งเข้าบอร์ด" ของรายการแรกจริง → popover เปิดในที่ (inline ใต้ปุ่ม ไม่ใช่ modal ลอย) มีดรอปดาวน์บอร์ด (prefill "งานร้าน — สาขาป่าตอง") + คอลัมน์ (prefill "กล่องงานเข้า") + ช่องวันที่ (native, ไม่บังคับ) + ปุ่ม "ส่งเข้าบอร์ด"/"ยกเลิก"
- `mobile-my-tasks-inbox-mobile.png` — เทียบภาพ 07 จอ ค: ลำดับบนลงล่าง = หัวจอ → dropdown+ปุ่ม → 4 ตัวเลข (grid 2×2) → "งานที่มอบหมายให้ฉัน" → "กล่องงานเข้าของฉัน" (ถัดลงมาจริงตามสัญญา "งานของฉันบนสุด กล่องงานเข้าถัดลงมา")

ทุกใบ HTTP 200 · `expect` selector ครบ · ไม่มี console error · คืนสภาพ DB ครบหลังถ่าย (ลบรายการกล่องงานเข้าที่เตรียม/จดผ่านหน้าเว็บระหว่างถ่าย 3 แถว — ตรวจแล้ว `KanbanInboxItem` เหลือ 0 แถวใน QC DB)

## 7. หนี้ที่รู้อยู่

- ข้อแย้ง oracle §4 (S2.6 เป็นต้นไป 10 ข้อยังไม่ถูกตรวจจริงโดย oracle — ตรวจแทนด้วยสคริปต์ชั่วคราวที่ลบแล้ว ผลตรงตามที่คาด)
- เมนูล่างมือถือ 5 ปุ่มของภาพ 07(ค) — หนี้ระดับ app-shell ไม่ใช่ของ K2.8 (ดู deviation #6)
- ไม่มี REST op/AI tool สำหรับ inbox (หนี้รวม P2 ตาม K2.5/K2.6/K2.7)
