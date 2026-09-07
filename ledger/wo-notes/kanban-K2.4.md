# WO K2.4 — มุมมองสรุป `?view=summary`

## 1. สิ่งที่ทำ (ภาพรวม)

- `src/lib/modules/kanban/summary.ts` (ใหม่): `boardSummary(ctx, actor, boardId, {now, filters?})` — สรุป
  การ์ด active ของบอร์ดเป็น `totals` 5 ค่า (ค้าง/เลยกำหนด/ถึงกำหนดวันนี้/สัปดาห์นี้/เสร็จ) + 4 มิติ
  (`byColumn`/`byAssignee`/`byDue`/`byLabel`) + `throughput` 8 สัปดาห์ล่าสุด (จันทร์ไทย)
  - นิยาม "ค้าง/เสร็จ" ตามอนุสัญญาเดียวกับ K2.10 (`completedAt` null/ไม่ null)
  - `byColumn`/`byAssignee`/`byLabel` นับการ์ดทุกใบที่ผ่านตัวกรองฐาน (ค้าง+เสร็จรวมกัน — ตรงกับที่
    `listBoardTable`/oracle คำนวณจาก `active` ทั้งหมดไม่กรอง completedAt)
  - `byDue`/`totals.overdue|dueToday|dueWeek` นับเฉพาะใบที่ "ค้าง" (แบบเดียวกับ `myTasksOverview` ของ K1.13)
    ⇒ `sum(byDue) === totals.open` เสมอ
  - ทุกไทล์มี `href = "?view=table&..."` ประกอบจากตัวกรองฐาน (`opts.filters`) + มิติที่ไทล์นั้นเจาะจง
    (ทับค่าเดิมของแกนเดียวกัน) — นับด้วย `filterBoardCards` ตัวเดียวกับ `listBoardTable` (K2.1) เพื่อให้
    "กดไทล์แล้วเจาะลงได้จำนวนเท่ากันเป๊ะ" เป็นจริงเสมอ (หัวใจของ WO — ข้อสอบ S1.5)
- `src/lib/modules/kanban/filters.ts`: เพิ่ม `column?: string` ใน `BoardFilters` (กรอง `columnId`) +
  `FilterableCard.columnId?: string` (optional — ผู้เรียกที่ไม่ผูก columnId มาให้ ไม่ถูกกรองออกเงียบ ๆ) +
  `boardFiltersFromParams`/`hasAnyFilter` รองรับ `column` + เพิ่ม sentinel `"none"` สำหรับ `assignee`/`label`
  (กรอง "ไม่มีผู้รับผิดชอบ"/"ไม่มีป้ายกำกับ" — additive ล้วน ไม่มี oracle เดิมใช้ค่านี้มาก่อน)
- `src/components/kanban/SummaryView.tsx` (ใหม่ · client): ตัวเลขใหญ่ 5 ค่า + 4 กล่องไทล์ (แต่ละแถวเป็น
  `<Link>` ไปตารางที่กรองแล้ว) + กราฟ throughput SVG ล้วน (แท่งคู่ สร้าง/เสร็จ ไม่เพิ่ม dependency)
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx`: เพิ่มสาขา `view === "summary"` เรียก `boardSummary`
  แล้วส่ง `<SummaryView>`
- `src/components/kanban/BoardHeader.tsx`: เปิดแท็บ "สรุป" (`ready: true`) + `currentView`/`hrefForView`
  รู้จัก `"summary"` + `activeFilterCount` นับ `column` ด้วย
- `src/components/kanban/FilterBar.tsx`: เพิ่ม prop `columns` (แปล columnId → ชื่อ) + ชิป "คอลัมน์: X" +
  แปล `assignee=none`/`label=none` เป็นข้อความไทย
- `src/components/kanban/BoardView.tsx`/`TableView.tsx`/`CalendarView.tsx`: ส่ง `columns={board.columns}`
  ให้ `FilterBar` ทุกจุดเรียก · `BoardView.tsx` ผูก `columnId` ให้การ์ดก่อนกรอง (เพื่อให้ `?column=` ซ่อน
  คอลัมน์อื่นได้จริงแม้ตอนอยู่ในมุมมองบอร์ด ไม่ใช่แค่ตาราง) · `TableView.tsx` เพิ่ม `filters.column` ใน
  เงื่อนไข `hasFilters` ของ empty state ทั้ง 2 จุด
- `src/lib/modules/kanban/service.ts`: re-export `boardSummary` + DTO types (facade เดิม)
- `src/lib/modules/kanban/types.ts`: เพิ่ม `SummaryTileDto` / `SummaryLabelTileDto` /
  `SummaryThroughputWeekDto` / `BoardSummaryDto` (ไฟล์บริสุทธิ์ — เหตุผลเดียวกับ K2.1/K2.2)
- `scripts/visual-kanban.mts`: เพิ่ม `SPECS["2.4"]` (3 สเปค: สรุป desktop · กดไทล์ "ด่วน" → ตารางกรอง ·
  สรุปมือถือ) — ไม่มีขั้นเตรียม/คืนสภาพ seed เหมือน 2.1/2.2 เพราะมุมมองสรุปอ่านอย่างเดียวล้วน (คลิกไทล์แค่
  navigate ไป `?view=table&...` ไม่มีการเขียน DB)

ไม่มี migration · ไม่มี edge ข้ามโมดูลใหม่ (import เดิมทั้งหมด: `./db` `./members` `./filters`)

## 2. ไฟล์ที่แตะ

ใหม่:
- `src/lib/modules/kanban/summary.ts`
- `src/components/kanban/SummaryView.tsx`

แก้:
- `src/lib/modules/kanban/filters.ts`
- `src/lib/modules/kanban/service.ts`
- `src/lib/modules/kanban/types.ts`
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx`
- `src/components/kanban/BoardHeader.tsx`
- `src/components/kanban/FilterBar.tsx`
- `src/components/kanban/BoardView.tsx`
- `src/components/kanban/TableView.tsx`
- `src/components/kanban/CalendarView.tsx`
- `scripts/visual-kanban.mts`

## 3. ผลด่าน (ตัวเลขจริง)

- oracle `scripts/qc-kanban-k2.4.mts`: **12/12** (ไฟล์มี 12 check id จริง ไม่ใช่ 13 ตามที่ตารางใน
  `KANBAN-RUN.md` ระบุไว้ตอนแรก — ดู §7 ข้อแย้ง oracle)
- regressions ทุกชุดเขียว: k1.1 29/30 (K1.1-S2.3 = flake เดิมที่ทราบอยู่แล้ว ไม่เกี่ยวกับ WO นี้) ·
  k1.2 25/25 · k1.3 29/29 · k1.4 30/30 · k1.5 17/17 · k1.6 20/20 · k1.7 21/21 · k1.8 18/18 · k1.9 18/18 ·
  k1.10 16/16 · k1.11 21/21 · k1.12 18/18 · k1.13 16/16 · k1.14 15/15 · k1.15 30/30 · k2.1 22/22 ·
  k2.2 16/16 · qc-kanban-notify 12/12 · qc-ai-kanban-board 3/3
- typecheck: `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error** (รันหลังเขียน
  oracle ด้วย ก่อนเริ่มเขียนโค้ดจริง — ผ่านตั้งแต่แรก ไม่ต้องแก้ oracle)
- fitness: `pnpm exec tsx scripts/fitness.mts` → **23/23** (F2.1 import ข้ามโมดูล 50/53 อนุญาต — ไม่เพิ่ม
  เส้นใหม่ เพราะ `summary.ts` import แค่ `./db`/`./members`/`./filters` เดิม)
- ภาพจริง 3 ใบใน `.qc-shots/kanban/2.4/`:
  1. `summary-view-desktop.png` — ตัวเลขใหญ่ 5 ค่า (24/4/0/1/0) + 4 กล่องไทล์ (คอลัมน์ 5/6/3/3/7=24 ·
     คน ปุ๊ก7/กิตติ4/ธนา8/ไม่มี5=24 · กำหนดส่ง เลย4/วันนี้0/สัปดาห์1/ภายหลัง12/ไม่กำหนด7=24 · ป้าย 11 ป้าย
     รวมทับซ้อนได้ 29) + กราฟ throughput (แท่งเดียวสัปดาห์ 31 ส.ค. = 24 การ์ดสร้างพร้อมกันตอน seed)
  2. `summary-tile-clicked-table-desktop.png` — กดไทล์ป้าย "ด่วน" (count 3) → ไปตาราง `?view=table&label=ด่วน`
     จริง เห็นชิป "ป้าย: ด่วน" + "แสดง 3 จาก 24 การ์ด" + ตาราง 3 แถวที่มีป้าย "ด่วน" ทุกแถว — **ตัวเลขไทล์ (3)
     = จำนวนแถวจริง (3) ตรงกันเป๊ะ**
  3. `summary-view-mobile.png` — ไทล์เรียง 1 คอลัมน์ · ตัวเลขใหญ่ 2 คอลัมน์ · กราฟ throughput อยู่ท้ายสุด
  ยืนยันด้วยตา (เปิดภาพจริงทั้ง 3 ใบ) ตรงกับสัญญา §K2.4 และเกณฑ์ §3.7/§13

## 4. บั๊กที่เจอระหว่างพัฒนา + วิธีแก้

### 4.1 ภาพแรกไม่เห็นกราฟ throughput เลย (เนื้อหาถูกตัดที่ขอบจอ)

**อาการ**: รอบแรกที่ถ่ายภาพ `summary-view-desktop.png` เห็นแค่ตัวเลขใหญ่ + 4 กล่องไทล์ กราฟ throughput
หายไปทั้งหมด ทั้งที่ตรวจ oracle ผ่านครบ (oracle เช็คแค่ว่ามี `<svg data-testid=summary-chart>` ในซอร์ส
ไม่ได้เช็คว่าภาพเห็นจริง)

**สาเหตุ**: ก็อปโครง wrapper มาจาก `TableView.tsx`/`CalendarView.tsx` ตรง ๆ
(`height: calc(100dvh - 3.5rem)` + `overflowY: auto` บนตัวห่อนอกสุด) — แบบนั้นถูกต้องสำหรับสองมุมมองนั้น
เพราะเป็น "เวทีบอร์ด" ที่ต้องคงหัว/แถบเครื่องมือนิ่งแล้วให้ "พื้นที่เนื้อหาส่วนใน" scroll เองส่วนเดียว
แต่มุมมองสรุปเป็นหน้ารายงานอ่านอย่างเดียว เนื้อหายาวกว่าจอแน่นอน (5 กล่อง + กราฟ) — พอ constrain ความสูง
เอาไว้แล้วให้ตัวห่อนอกสุด scroll เอง, `document.body`/`html` เองมีความสูงแค่เท่าวิวพอร์ต (เพราะลูกของมันถูก
บังคับความสูงตายตัว) ⇒ `page.screenshot({fullPage:true})` ของ Puppeteer อ่าน `document` ความสูงจริง ไม่ใช่
ความสูงของ div ที่ scroll ข้างในเอง จึงเห็นแค่สิ่งที่พอดีวิวพอร์ตแรก

**วิธีแก้**: เปลี่ยน wrapper นอกสุดของ `SummaryView.tsx` จาก `height: calc(100dvh - 3.5rem)` (fixed +
`overflowY:auto`) เป็น `min-h-[calc(100dvh-3.5rem)]` (ไม่บังคับเพดานความสูง แค่บังคับพื้นสูงสุดกันดูโล่งตอน
เนื้อหาสั้น) แล้วปล่อยให้หน้าทั้งหน้า (`<main>` ของ `AppMain.tsx` เอง ไม่ได้ล็อกความสูงสำหรับ
`boardFullscreen`) scroll ตามปกติ — ยืนยันด้วยภาพซ้ำ (`summary-view-desktop.png` รอบสองเห็นกราฟครบ)

**บทเรียนที่ฝากไว้**: มุมมองรายงาน/อ่านอย่างเดียว (K2.4 สรุป · น่าจะรวมถึง K2.10 รายงานในแอปด้วย) ไม่ควร
ก็อปแพตเทิร์น "fixed viewport + internal scroll" จาก TableView/CalendarView มาเลย เพราะแพตเทิร์นนั้นออกแบบ
มาสำหรับ "เวทีเครื่องมือ" ที่อยากให้หัว/แถบเครื่องมือนิ่งระหว่างเลื่อนเนื้อหาย่อย ไม่ใช่หน้ารายงานที่ยาวกว่า
จอปกติ — ควรปล่อยให้ทั้งหน้า scroll ตามธรรมชาติแทน (แบบเดียวกับ `MyTasks.tsx`)

## 5. deviation จากสัญญา (พร้อมเหตุผล)

1. **`byDue`/`totals.overdue|dueToday|dueWeek` นับเฉพาะการ์ด "ค้าง"** (ไม่รวมที่เสร็จแล้ว) ในขณะที่
   `byColumn`/`byAssignee`/`byLabel` นับทุกใบ (ทั้งค้างและเสร็จ) — สัญญาเขียนกว้าง ๆ ว่า "นับจากการ์ด active
   ของบอร์ด" ไม่ได้ระบุจุดนี้ชัดเจน แต่ oracle S1.3 ยืนยันด้วยประโยค "byDue... ผลรวม = open" ซึ่งเป็นจริง
   ก็ต่อเมื่อ byDue คำนวณจากเซตเดียวกับ `totals.open` (completedAt null) เท่านั้น — เลือกแนวทางนี้ให้ตรง
   กับ `myTasksOverview` (K1.13) ที่ทำแบบเดียวกันอยู่แล้ว (การ์ดที่เสร็จแล้วไม่มีความหมายเรื่อง "ใกล้ถึง
   กำหนด" อีกต่อไป) — ข้อมูลจริงบนบอร์ดป่าตองมี completedAt=null ทั้ง 24 ใบ (หนี้ seed เดิมที่ Fable บันทึก
   ไว้ใน KANBAN-RUN.md ก่อนหน้านี้แล้ว) จึงพิสูจน์แยกสองแนวทางไม่ได้จากข้อมูลชุดนี้ — บันทึกไว้ให้ Fable
   ตรวจทานตอนรับงาน
2. **เพิ่ม sentinel `"none"` ให้ `filters.assignee`/`filters.label`** (กรอง "ไม่มีผู้รับผิดชอบ"/"ไม่มีป้าย
   กำกับ") ทั้งที่สัญญา K2.4 ไม่ได้สั่งไว้ตรง ๆ — ทำเพื่อให้ไทล์ "ไม่มีผู้รับผิดชอบ"/"ไม่มีป้ายกำกับ" ของ
   มุมมองสรุปกดแล้วเจาะลงได้ถูกต้องจริง (ไม่ใช่แค่โชว์ตัวเลขเฉย ๆ โดยไม่มีอะไรรองรับตอนกด) — เป็นการเพิ่ม
   ล้วน (additive) ไม่กระทบพฤติกรรมเดิม เพราะไม่มีที่ไหนเคยส่งค่าตัวอักษร `"none"` เป็น `assignee`/`label`
   มาก่อน (regressions K1.11/K2.1/K2.10/K2.3/K3.8 ที่ใช้ key `"none"` ล้วนเป็นคนละแกน — `group`/`workload`
   ไม่ใช่ `filters.assignee`/`filters.label`) — ยืนยันด้วย grep ก่อนแก้ (§ด้านบน) และ regressions ยังเขียว
   ครบ
3. **ไทล์ "ภายหลัง" (later) ของ `byDue` ไม่มีตัวกรองที่ตรงตัวในตาราง** — href ชี้ไป `?view=table` (+ตัวกรอง
   ฐานถ้ามี) โดยไม่ใส่ `due=` เพราะระบบตัวกรองที่มีอยู่ (`DueBucket = overdue|today|week|none`) ไม่มีค่า
   "later" (เพิ่มเข้าไปจะกระทบ `FilterBar`/`parseSearchQuery`/K1.11 ทั้งระบบ นอกขอบเขต WO นี้) — จุดนี้
   oracle S1.5 ก็จงใจไม่เช็ค (`byDue.filter(d => d.key !== "later")`) ตรงกับที่คาดไว้
4. **ไทล์ "ไม่มีป้ายกำกับ" ของ `byLabel` ก็ไม่ถูกเช็คจำนวนเทียบตารางเช่นกัน** (oracle
   `byLabel.filter(l => l.key !== "none")`) แต่ implement ให้กดได้จริงแล้ว (deviation #2) เผื่ออนาคต

## 6. หนี้ที่ฝากไว้

1. ยังไม่มี "แกน" ตัวกรอง `due=later` ในระบบ (deviation #3) — ถ้าอยากให้ไทล์ "ภายหลัง" เจาะลงตรงเป๊ะ ต้อง
   ขยาย `DueBucket`/`FilterBar`/`parseSearchQuery` (กระทบ K1.11 ทั้งระบบ) เป็น WO แยก
2. `byAssignee`/`byLabel` นับรวมการ์ดที่เสร็จแล้วด้วย (deviation #1) — ถ้า Fable ตัดสินว่าอยากให้เหมือน
   K2.10 `workload` (นับเฉพาะที่ยังไม่เสร็จ) ต้องแก้จุดนี้คู่กับปรับ oracle S1.4 (ด่วน=3 ยังคงเป็น 3 เพราะ
   ไม่มีใบไหนเสร็จ แต่ตรรกะควรตรงกับที่ตั้งใจจริง ๆ)
3. `min-h-[calc(100dvh-3.5rem)]` ของ `SummaryView.tsx` (§4.1) เป็น pattern ใหม่ที่ยังไม่มีที่อื่นในโมดูลใช้ —
   ถ้า K2.10 (รายงานในแอป) จะทำหน้าคล้ายกัน ควรใช้ pattern เดียวกันนี้ (ปล่อย scroll ธรรมชาติ) ไม่ใช่
   fixed-viewport ของ Table/Calendar

## 7. ข้อแย้ง oracle

`scripts/qc-kanban-k2.4.mts` มี **12 check id จริง** (`K2.4-S1.1`–`S1.7`, `S2.1`, `S3.1`–`S3.4`) แต่ตาราง
WO ใน `ledger/KANBAN-RUN.md` แถว K2.4 เขียนว่า "oracle พร้อม 13 ข้อ" — เช็คด้วยตาและด้วย
`grep -c 'chk("K2.4' scripts/qc-kanban-k2.4.mts` แล้วได้ 12 เส้นจริง ไม่ใช่ความผิดพลาดของการรัน — ไม่ใช่
oracle ผิด (ไม่มีเหตุผลที่ต้องมี 13) เข้าใจว่าเป็นแค่ตัวเลขในตารางสรุป WO ที่ไม่ตรงกับไฟล์จริง — รายงานให้
Fable ทราบ ไม่ได้แตะ oracle

## 8. ไทม์ไลน์ที่ควรบันทึก (สำหรับ Fable ต่อ ledger)

- อ่านสัญญา + oracle + พิมพ์เขียว + โค้ดเดิม (table.ts/calendar.ts/my-tasks.ts/filters.ts) → เขียน
  `summary.ts` + ต่อ `filters.ts`/`types.ts`/`service.ts` → oracle 11/12 (ขาดแค่ภาพ) → เขียน
  `SummaryView.tsx` + ต่อ `page.tsx`/`BoardHeader.tsx`/`FilterBar.tsx`/`BoardView.tsx` → typecheck 0 error →
  regressions ทุกชุดเขียว → build+serve ถ่ายภาพรอบแรก พบบั๊ก §4.1 (กราฟหาย) → แก้ CSS layout → build+serve
  ใหม่ ถ่ายภาพรอบสอง ครบ 3 ใบ ตรงสัญญา → oracle 12/12 → typecheck ซ้ำ 0 error → fitness 23/23 →
  regressions ซ้ำรอบสุดท้ายเขียวครบ → เขียน wo-notes นี้
