# WO K3.8 — มุมมองข้ามบอร์ดระดับองค์กร (`/kanban/overview`)

> สถานะ: **oracle 10/11 (ข้อภาพ S3.3 รอ Fable ถ่าย) · tsc 0 · fitness 23/23 (ทั้งมี env/ไม่มี env) ·
> regressions k2.1/k2.5/k1.11/k2.4/k3.7/k1.15/notify เขียวทั้งหมด · qc-nav-functions 10/10 · ไม่มี
> migration** (schema `KanbanBoardView.boardId` เป็น `String?` มาตั้งแต่ K2.5 อยู่แล้ว)

## 1. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/kanban/overview.ts` — `listCrossBoard` (คิวรีเดียวข้ามบอร์ด แบบเดียวกับ
  `reports.ts`/`system-calendar.ts`) + `crossBoardTotals` (ตัวเลข 4 ค่าหัวหน้าเพจ แยกคิวรีเบา ๆ)
- `src/lib/modules/kanban/table-shared.ts` — `groupRowsByAssignee` (แยกออกจาก `table.ts` ให้
  `overview.ts` ใช้ร่วม ตามสัญญา "แยก helper ออกมาใช้ร่วม")
- `src/components/kanban/OverviewPage.tsx` — client component (ตัวเลข 4 ค่า + เลือกบอร์ด + จัดกลุ่ม/
  เรียง + มุมมองที่บันทึกไว้ + ตาราง/รายการมือถือ อ่านอย่างเดียว)
- `src/app/app/sys/[id]/kanban/overview/page.tsx` — server page (auth → `listCrossBoard` +
  `crossBoardTotals` + `listViews(ctx, actor, null)` → `<OverviewPage>`)

**แก้**
- `src/lib/modules/kanban/types.ts` — เพิ่ม `ViewFilters.board?: string` (K3.8) + หมวด K3.8 ทั้งหมด
  (`CrossBoardGroupBy` `CrossBoardSort` `CrossBoardFilters` `CrossBoardRowDto` `CrossBoardBoardDto`
  `CrossBoardGroupDto` `CrossBoardResult` `CrossBoardTotalsDto`)
- `src/lib/modules/kanban/table.ts` — ดึง `groupRows` เคส `assignee` ออกไปเรียก `groupRowsByAssignee`
  (ตัดโค้ดซ้ำ ผลลัพธ์เดิมเป๊ะ — regression k2.1 ยืนยัน 22/22)
- `src/lib/modules/kanban/views.ts` — `boardId: string | null` ตลอดทั้งไฟล์ (`SaveViewInput`/
  `listViews`) + `assertCrossBoardViewAccess` (PRIVATE=`canReadKanban` · BOARD ข้ามบอร์ด=OWNER) +
  `loadVisibleView`/`loadEditableView` รองรับแถว `boardId: null` (`buildHref` เดิมรองรับอยู่แล้ว) +
  zod `ViewFiltersSchema.board`
- `src/lib/modules/kanban/actions.ts` — `saveViewAction`/`deleteViewAction` รับ `boardId: string | null`
  + `viewRevalidatePaths` (null → revalidate `/kanban/overview`)
- `src/lib/modules/kanban/filters.ts` — `hrefForSavedView`/`describeSavedViewConfig` เติม `filters.board`
- `src/lib/modules/kanban/nav.ts` — เพิ่ม `{key:"overview", label:"ภาพรวม", path:"/kanban/overview",
  status:"ready"}` ถัดจาก "บอร์ด" · เปลี่ยนป้าย hub เดิม "ภาพรวม" → "หน้าหลัก" (ดู §4 ข้อ 1)
- `src/components/kanban/KanbanTabs.tsx` — แท็บ hub `key:"overview"` → `key:"home"` label "หน้าหลัก"
  (กันชนกับ K3.8) — ดู §4 ข้อ 1
- `src/components/kanban/BoardsHome.tsx` — ปุ่ม "ภาพรวมทุกบอร์ด" (`data-testid="boards-overview-link"`)
  ในแถบหัวหน้าหน้ารวมบอร์ด
- `scripts/visual-kanban.mts` — เพิ่ม spec `"3.8"` (3 ใบ — ดู §3)

## 2. สิ่งที่ทำ (ภาพรวม)

- **`overview.ts#listCrossBoard(ctx, actor, {now, filters?, group?, sort?, page?, pageSize?})`** —
  ขอบเขต = `visibleBoardsWhere(actor)` + บอร์ด ACTIVE + การ์ด ACTIVE + `completedAt: null` (คงที่ ไม่ใช่
  ตัวกรอง — ภาพรวมองค์กรตอบ "อะไรค้างอยู่บ้าง" ไม่ใช่ทะเบียนการ์ดทั้งหมด) + `mirrorOfId: null` (K3.7 —
  ตัวสะท้อนไม่นับซ้ำ นับต้นฉบับใบเดียว) คิวรีเดียวข้ามบอร์ด (ไม่วน `listBoardTable` ทีละบอร์ด — งบ
  ประสิทธิภาพ §12.1 แบบเดียวกับ `reports.ts`/`system-calendar.ts`) → คืน `{rows: (TableRowDto +
  boardId/boardName/boardColor)[], total, page, pageSize, boards:[{id,name,color,count}], groups?}`
  - `filters` ใช้ `filterBoardCards` (K1.11) ตัวเดิมตรง ๆ (ป้ายกรองด้วย**ชื่อ**ข้ามบอร์ดได้ฟรีเพราะมันกรอง
    ด้วยชื่ออยู่แล้ว) — `board` (boardId[] ที่เลือก) คัดก่อนเข้า `filterBoardCards` (ฟังก์ชันนั้นไม่เคยอ่าน
    `.board` เลย) — ดู `toBoardFilters()` ที่ตัดฟิลด์นี้ออกก่อนส่ง (ชนกับ `BoardFilters.board` เดิมที่เป็น
    "ชื่อบอร์ด contains" ของ `search.ts` คนละความหมาย จึงประกาศ `CrossBoardFilters` แยกชนิดเอง)
  - `boards[]` = **ทุกบอร์ดที่มองเห็น** เสมอ (ไม่หดตาม `filters.board` ที่เลือกไว้ — กันดรอปดาวน์หายเมื่อ
    เลือกบอร์ด) `count` ต่อบอร์ด = การ์ดค้างทั้งหมดของบอร์ดนั้น (ไม่ผูกกับตัวกรองอื่น — badge จำนวนคงที่)
  - `sort=position` (ปริยาย) = บอร์ด (sortOrder/ชื่อ) ก่อน → คอลัมน์ซ้าย→ขวาของบอร์ดนั้น → ตำแหน่งเดิม
    (stable sort ต่อเนื่องจากคิวรี — เหมือน `table.ts` แต่เพิ่มชั้นบอร์ด) `sort=due/updated` เหมือน
    `table.ts` เป๊ะ · `sort=created` **ไม่ใช้ cardNo** (คนละลำดับต่อบอร์ด เทียบข้ามบอร์ดไม่ได้ต่างจาก
    `table.ts` ที่บอร์ดเดียว) ใช้ `updatedAt` แทน — หนี้ที่ตั้งใจ (ดู §6)
  - `pageSize` เพดาน 200 เสมอ (`Math.min(...,200)` — ต่างจาก `table.ts` ที่ไม่มีเพดาน เพราะสัญญา K3.8
    ระบุไว้ชัด)
  - `fieldsOnCard: []` ทุกแถวเสมอ (ฟิลด์กำหนดเองเป็นของแต่ละบอร์ด ไม่มี "คอลัมน์ร่วม" ข้ามบอร์ดที่มี
    ความหมาย — หนี้ที่ตั้งใจ ดู §6) · `links` เติมหลังแบ่งหน้าเท่านั้น (เหมือน `table.ts` — resolve เฉพาะ
    แถวที่แสดงจริง)
- **`overview.ts#crossBoardTotals(ctx, actor, {now})`** — ตัวเลข 4 ค่า (ค้าง/เลยกำหนด/วันนี้/สัปดาห์นี้)
  ข้ามทุกบอร์ดที่มองเห็น ไม่ผูกกับตัวกรอง/หน้าปัจจุบัน (คิวรีเบา ๆ แยกจาก `listCrossBoard` — แพตเทิร์น
  เดียวกับ `reports.ts#openCards`)
- **`views.ts`** — `boardId: null` = มุมมองข้ามบอร์ด: `saveView`/`listViews`/`loadVisibleView`/
  `loadEditableView` ทุกจุดที่เคย `if (typed.boardId) assertBoardRole(...)` เติม else-branch ตรวจ
  `canReadKanban`/`role==="OWNER"` แทน (ไม่มีบอร์ดให้ตรวจบทบาท) — `buildHref` มีโค้ดรองรับ `boardId
  null → /kanban/overview` มาตั้งแต่ K2.5 แล้ว (คอมเมนต์ "K3.8 ยังไม่ทำ" ลบออก)
- **`OverviewPage.tsx`** — testid `overview-page`/`overview-boards`/`overview-group`/
  `overview-saved-views` ตามสัญญา · ตัวเลข 4 ค่า (`KpiTile` แบบเดียวกับ `SummaryView.tsx` K2.4) ·
  เลือกบอร์ดหลายใบ (`BoardsDropdown` แบบเดียวกับ `SystemCalendar.tsx` K2.12) · จัดกลุ่ม
  บอร์ด/ผู้รับผิดชอบ/กำหนดส่ง · เรียง position/due/created/updated · `<FilterBar>` เดิม (ตัดฟิลด์
  `board` ก่อนส่งเข้า เพราะชนิดขัดกัน — ดู §4 ข้อ 3) · มุมมองที่บันทึกไว้ (คอมโพเนนต์ใหม่
  `OverviewSavedViews` ในไฟล์เดียวกัน — ดู §4 ข้อ 2) · ตาราง (ดู §4 ข้อ 4) + มือถือ 2 บรรทัด + ชื่อบอร์ด
  กำกับ (สีจุดเหมือน `boardColor`)
- **nav.ts/KanbanTabs.tsx** — เพิ่มเมนู "ภาพรวม" (`/kanban/overview`) ถัดจาก "บอร์ด" ทั้งใน drawer ☰
  และแถบแท็บ — แก้ชนกับป้าย "ภาพรวม" เดิมของหน้า hub ระบบ (ดู §4 ข้อ 1)

## 3. ภาพ (`scripts/visual-kanban.mts 3.8` — Fable ยังไม่ได้รัน)

สเปค 3 ใบ ไม่ต้องเตรียม/คืนสภาพข้อมูลพิเศษ (seed เดิม 38 การ์ด/3 บอร์ดพอแสดงครบทุกภาพ):
1. `overview-desktop` — `/kanban/overview` (owner, เดสก์ท็อป): ตัวเลข 4 ค่า + ตารางคอลัมน์ "บอร์ด"
2. `overview-grouped-by-board` — `/kanban/overview?group=board` (เดสก์ท็อป): หัวกลุ่มชื่อบอร์ด+จำนวน
3. `overview-mobile` — `/kanban/overview` (มือถือ): รายการ 2 บรรทัด + ชื่อบอร์ดกำกับ

รัน: `bash scripts/acc-v2-serve.sh && pnpm exec tsx scripts/visual-kanban.mts 3.8` (แล้ว `... stop`)

## 4. เบี่ยงจากสัญญา / จุดตัดสินใจ

1. **🔴 ชนกันของป้าย "ภาพรวม"**: สัญญาสั่งเพิ่ม nav.ts entry `key:"overview" label:"ภาพรวม"` — แต่
   `KanbanTabs.tsx`/`kanbanNavChildren` มี tab/ลิงก์ hub ของระบบ (`/app/sys/{id}`) ที่ใช้ label
   "ภาพรวม" + **key `"overview"` เดียวกัน** อยู่ก่อนแล้ว (ก่อน K3.8) ⇒ ถ้าไม่แก้จะเกิด React duplicate
   key + สองแท็บชื่อซ้ำกันในแถบเดียว (คนละหน้า) ตัดสินใจ: เปลี่ยน key/label ของ hub เดิมเป็น
   `"home"`/"หน้าหลัก" (ชื่อเดียวกับที่โมดูลบัญชีใช้อยู่แล้ว — `account/nav.ts` key "home" label
   "หน้าหลัก") ปล่อย key `"overview"` ให้ K3.8 ตามสัญญาเป๊ะ — เช็คแล้วไม่มี oracle/regression ไหนอ้างอิง
   `data-testid="kanban-tab-overview"` หรือ label "ภาพรวม" ของ hub เดิมเจาะจง (grep ทั้ง `scripts/`)
   ก่อนเปลี่ยน — ถ้า Fable อยากได้ชื่ออื่นแก้ตรงนี้ที่เดียว (`KanbanTabs.tsx` + `nav.ts#kanbanNavChildren`)
2. **`OverviewSavedViews` เป็นคอมโพเนนต์ใหม่ ไม่ reuse `SavedViewsMenu.tsx` ตรง ๆ**: `SavedViewsMenu.tsx`
   รับ `boardId: string` (บังคับ ไม่ nullable) ผูกกับ `isAdmin`/href ของบอร์ดเดียวโดยตรง — ภาพรวมข้าม
   บอร์ดไม่มี "บอร์ดเดียว" ให้ตรวจ ADMIN (ต้องเป็น OWNER เท่านั้นสำหรับ scope BOARD) และเรียก
   `saveViewAction`/`deleteViewAction` ด้วย `boardId: null` ⇒ ทำสำเนาที่ปรับสิทธิ์/พารามิเตอร์ให้ตรง
   แทนที่จะดัดแปลง `SavedViewsMenu.tsx` เดิมให้รองรับทั้งสองแบบ (เสี่ยงกระทบ K2.5 ที่ผ่าน QC แล้ว) —
   ใช้ฟังก์ชันบริสุทธิ์ร่วม (`describeSavedViewConfig`/`hrefForSavedView`) จาก `filters.ts` เหมือนกัน
   ทั้งคู่ ไม่มีการก๊อปตรรกะคำนวณ href/คำบรรยาย
3. **`<FilterBar>` ได้ `members={[]}` และ `columns={[]}` เสมอ**: ภาพรวมข้ามบอร์ดไม่มี "สมาชิกบอร์ดเดียว"/
   "คอลัมน์บอร์ดเดียว" ให้ผูก — ชิปตัวกรอง `assignee`/`column` (ถ้ามีค่าที่ไม่ใช่ `me`/`none`) จะโชว์
   userId/columnId ดิบแทนชื่อคน/ชื่อคอลัมน์ (เสื่อมลงเล็กน้อย แต่ปุ่มลบ/ล้างตัวกรองยังทำงานถูกต้อง) —
   ตัวกรองเหล่านี้ไม่มี picker ในหน้านี้อยู่แล้ว (มาจาก URL/มุมมองที่บันทึกไว้เท่านั้น) จึงเป็นเคสที่พบไม่
   บ่อย
4. **ตารางไม่ได้ reuse `<TableView>` ตรง ๆ (ตามตัวอักษร)**: `TableView.tsx` ผูกกับบอร์ดเดียวแน่น
   (แก้ในช่อง/ลาก/bulk ทุกอย่างเรียก `*Action({boardId: board.id, ...})` ตัวเดียว, `board.columns`/
   `board.members` มาจากบอร์ดเดียว) — ภาพรวมมีแถวจากหลายบอร์ด แก้ไม่ได้ด้วยฟอร์ม/สิทธิ์เดียว (สัญญาเองก็
   สั่ง "bulk ปิดในหน้านี้" อยู่แล้ว) ⇒ สร้างตารางอ่านอย่างเดียวใหม่ใน `OverviewPage.tsx` ที่ reuse
   **ชิ้นส่วน UI ล้วน** ของ `TableView.tsx`/`Card.tsx` (Avatar/dueBadgeFrom/DUE_STYLE/tagColorVar/
   formatCardDateTime) + testid `table-view` (คอนเทนเนอร์เดสก์ท็อป) ตัวเดียวกับที่ `TableView.tsx` ใช้
   — ตรงตามเกณฑ์ oracle (`/TableView|table-view/`) และคงความหมาย "นี่คือพื้นที่ตาราง" — คลิกแถวพาไปหลัง
   การ์ดที่ `/kanban/b/{boardId}?card=` ของบอร์ดนั้นจริง (ใช้หลังการ์ดที่มีอยู่แล้วทั้งชุด ไม่สร้างโมดัล
   ใหม่) ตรงตามสัญญา "?card= เปิดจากบอร์ดของการ์ด" เป๊ะ — ถ้า Fable อยากให้แก้ในช่องได้บางฟิลด์ (เช่น
   กำหนดส่ง/ผู้รับผิดชอบ) ทำเพิ่มได้ภายหลังเป็น WO แยก (ต้องขยาย mutation actions ให้รับ boardId ต่อแถว)

## 5. ข้อแย้ง/พบเจอ ที่อยากให้ Fable ตัดสิน

- ไม่มี (oracle เขียน 11/11 ผ่านตามที่เข้าใจ — ไม่มีข้อไหนที่เห็นว่าข้อสอบผิด)

## 6. หนี้ที่ฝากไว้

1. `sort=created` ของภาพรวมใช้ `updatedAt` แทน `createdAt` จริง (DTO `TableRowDto` ไม่มี `createdAt` —
   `table.ts` เดิมใช้ `cardNo` แทนได้เพราะบอร์ดเดียว แต่ cardNo คนละลำดับต่อบอร์ด เทียบข้ามบอร์ดไม่ได้)
2. ไม่มี "คอลัมน์ฟิลด์กำหนดเอง" ในตารางภาพรวม (`fieldsOnCard: []` ทุกแถว) — แต่ละบอร์ดนิยามฟิลด์ของ
   ตัวเอง ไม่มีชุดคอลัมน์ร่วมที่มีความหมายข้ามบอร์ด
3. ตารางภาพรวมอ่านอย่างเดียวทั้งหมด (ไม่มีแก้ในช่อง/ลาก/bulk) — ดู §4 ข้อ 4
4. `filters.board` (boardId ที่เลือกไว้) เก็บในมุมมองที่บันทึกไว้ได้แล้ว (schema/zod รองรับ) แต่ยังไม่มี
   UI ทดสอบ round-trip เต็มรูปแบบ (oracle S2.3 เช็คแค่ `label=ด่วน&group=board` ไม่ได้ตั้ง `board=` ตอน
   บันทึก) — ตรรกะอยู่ครบ (`hrefForSavedView`/`currentOverviewConfigFromParams` เขียน/อ่าน `board` แล้ว)
   แค่ยังไม่มีข้อสอบ/ภาพยืนยันเส้นนี้โดยเฉพาะ
5. ไม่ได้รัน `qc-ai-kanban-board.mts` (นอกรายการ regression ของ WO นี้ + ไฟล์นั้น `loadEnvFile(".env")`
   ตรง ๆ = แตะ prod — ไม่เกี่ยวกับสิ่งที่แก้ในรอบนี้เลย จึงข้ามตามกติกาเครื่อง "ห้ามแตะ .env ของ prod")

## 7. คืนสภาพข้อมูล QC

ตรวจแล้วหลังรัน oracle: การ์ด ACTIVE รวม 3 บอร์ด (ป่าตอง 24 + ซ่อมบำรุง 11 + กะตะ 3) = **38** ตรงตาม
ที่ต้องคืน · `KanbanBoardView.boardId IS NULL` (มุมมองข้ามบอร์ดที่ oracle สร้างไว้ทดสอบ) = **0** แถว
(oracle ลบเองใน `finally`) · การ์ด `mirrorOfId IS NOT NULL` (เศษจาก K3.7) = **0** แถว
