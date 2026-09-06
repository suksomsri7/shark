# K2.1 — มุมมองตาราง `?view=table` (บันทึกผู้ทำ)

> WO: `ledger/KANBAN-RUN.md` §K2.1 · ข้อสอบ: `scripts/qc-kanban-k2.1.mts` (22 ข้อ · Fable เขียน · builder ไม่แตะ)
> โมเดล: Sonnet ตามตาราง WO (K2.1–K2.8, K2.10–K2.11 = UI ตามแบบ/เอกสาร)

## 1. สิ่งที่ทำ (ภาพรวม)

1. **`listBoardTable`** (`src/lib/modules/kanban/table.ts`) — อ่านอย่างเดียว (VIEWER+) กรองการ์ดของบอร์ดเดียว
   ด้วย `filterBoardCards` เดิม (K1.11) แล้วจัดกลุ่ม (`column`/`assignee`/`label`) · เรียง (`position`/`due`/`created`/`updated`) ·
   แบ่งหน้า ปริยาย 50 (`KANBAN_LIMITS.tablePageSize`)
2. **`cards.bulkUpdate`** (`src/lib/modules/kanban/cards.ts`) — ย้าย/มอบหมาย/ติดป้าย/ตั้งกำหนดส่ง/เก็บเข้าคลัง
   หลายใบพร้อมกัน ผ่านฟังก์ชันย่อยเดิมทั้งหมด (`moveCard`/`setCardAssignees`/`setCardLabels`/`updateCardFields`/`archiveCard`)
   ไม่เขียน query ใหม่นอกจากอ่านค่าปัจจุบันก่อนรวม add/remove
3. **`exportCardsCsv`** (`src/lib/modules/kanban/reports.ts` — ไฟล์ใหม่สำหรับ K2.10 มาต่อยอด) — ดึงจาก `listBoardTable`
   (pageSize 1,000,000 = "ทุกแถวที่กรองได้") แล้วแปลงเป็น CSV ผ่าน `csvRow`/`csvCell` ของ `@/lib/core/csv` + BOM
4. **`KANBAN_LIMITS.bulkMax = 200`** + `tablePageSize = 50` (`limits.ts`)
5. **`TableView.tsx`** (client) — แถบเครื่องมือ (ค้นในบอร์ดนี้/จัดกลุ่ม/เรียง/ส่งออก CSV/เพิ่มการ์ด) · ตาราง 8 คอลัมน์
   แก้ในช่องทุกคอลัมน์ (คอลัมน์/ผู้รับผิดชอบ/กำหนดส่ง/ป้าย/ชื่อ) · แถบเลือกหลายรายการ (bulk-bar) · จัดกลุ่ม ·
   มือถือ = รายการ 2 บรรทัด (useSyncExternalStore กัน hydration แบบ K1.13)
6. **หน้าบอร์ด** (`page.tsx`) — `?view=table&group=&sort=&page=` → เรียก `getBoardView` (โครงบอร์ด/หัวบอร์ด/ป้าย/สมาชิก
   ใช้ร่วมกับมุมมองบอร์ด) + `listBoardTable` (ข้อมูลตาราง) แล้วเรนเดอร์ `TableView` แทน `BoardView`
7. **`BoardHeader.tsx`** — เปิดแท็บ "ตาราง" ในตัวสลับมุมมอง (เดิม "เร็ว ๆ นี้") เป็นลิงก์จริงคงตัวกรองไว้ ·
   ตัวอื่น (ปฏิทิน/ไทม์ไลน์/สรุป) ยังปิดรอ WO ของตัวเอง
8. **`scripts/visual-kanban.mts`** — เพิ่ม spec `"2.1"` (5 ภาพ: ตาราง/เลือกหลาย/จัดกลุ่ม/แก้ชื่อ/มือถือ) + คืนสภาพชื่อการ์ด
   ที่ถูกแก้ระหว่างถ่ายภาพใน `finally`
9. **`service.ts`** — re-export `listBoardTable`/`bulkUpdate`/`exportCardsCsv` + type ที่เกี่ยวข้อง (facade เดิม)
10. **เอกสาร** — แก้ `docs/modules/13-kanban-v2.md` §5.4 (เพดาน bulkUpdate 100→200 ให้ตรงสัญญา WO + oracle)

## 2. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/kanban/table.ts` (`listBoardTable` + `sortRows`/`groupRows` ภายใน)
- `src/lib/modules/kanban/reports.ts` (`exportCardsCsv` — เริ่มไฟล์นี้ให้ K2.10 มาต่อ)
- `src/components/kanban/TableView.tsx` (ใหญ่สุดของ WO — toolbar/ตาราง/bulk-bar/มือถือ/popover เล็ก)
- `scripts/pending/diag-k21-labels.mts` · `scripts/pending/fix-k21-label-json-drift.mts` (ดู §6 — ซ่อมข้อมูลดริฟต์
  ที่เกิดจาก finally ของ oracle ไม่ resync `KanbanCard.labels` — ไม่ใช่ของถาวรของโมดูล เป็นเครื่องมือซ่อม QC dataset)

**แก้**
- `src/lib/modules/kanban/types.ts` — เพิ่ม `TableSort` `TableGroupBy` `TableCardLinkDto` `TableRowDto` `TableGroupDto`
  `BoardTableDto` (ไฟล์บริสุทธิ์ตามกติกา K1.11/12/13 — `TableView.tsx` import ชนิดจากที่นี่ ไม่ผ่าน `table.ts`
  ที่แตะ `db.ts`→`pg`)
- `src/lib/modules/kanban/limits.ts` — `bulkMax: 200` · `tablePageSize: 50`
- `src/lib/modules/kanban/cards.ts` — เพิ่ม `bulkUpdate`/`applyBulkPatch`/`BulkUpdatePatch`/`BulkUpdateResult`
  + import `moveCard`(`./moves`) `setCardLabels`(`./labels`) `KANBAN_LIMITS`(`./limits`) (ไม่มี import วน — ตรวจแล้ว)
- `src/lib/modules/kanban/service.ts` — re-export ของใหม่ทั้ง 3 ไฟล์
- `src/lib/modules/kanban/actions.ts` — `bulkUpdateAction` `exportBoardCsvAction` (+ `BulkUpdateActionPatch` ชนิด
  เฉพาะฝั่ง client ที่ dueAt เป็น string ไม่ใช่ Date — ดู deviation #1)
- `src/components/kanban/BoardHeader.tsx` — ตัวสลับมุมมองอ่าน `?view=` จริง + ลิงก์ "ตาราง" ใช้งานได้
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` — แยกสาขา `view === "table"`
- `scripts/visual-kanban.mts` — spec `"2.1"` + เตรียม/คืนสภาพ `KB21`
- `docs/modules/13-kanban-v2.md` — บรรทัดเพดาน bulkUpdate (100→200)

## 3. ผลด่าน (ตัวเลขจริง)

**Oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.1.mts`
```
ผ่าน 22/22
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
(รอบแรกตก 2 ข้อจากของที่ผมพลาดเอง ไม่ใช่ oracle ผิด — แก้แล้วเขียวทั้งคู่:
- `S4.3` ("ห้ามใช้ `confirm(`") ตกเพราะ**คอมเมนต์ของผมเอง**ในหัวไฟล์เขียนว่า `window.confirm()` ซึ่งมีสตริง
  `confirm(` ตรงตัว → regex `/\bconfirm\(/` จับคอมเมนต์ ไม่ใช่โค้ดจริง — แก้คำในคอมเมนต์
- `S1.5` (label "ด่วน" → total 3) ตกเป็น 4 ครั้งแรก — ไม่ใช่บั๊กของผม ดู §6)

**Regressions** — `qc-kanban-k1.1`…`k1.15` + `notify` + `ai-kanban-board` (รันหลัง K2.1 เสร็จสมบูรณ์)
```
k1.1  30/30*  k1.6  20/20   k1.11 21/21          notify 12/12
k1.2  25/25   k1.7  21/21   k1.12 18/18          ai-kanban-board 3/3
k1.3  29/29   k1.8  18/18   k1.13 16/16
k1.4  30/30   k1.9  18/18   k1.14 15/15
k1.5  17/17                 k1.15 30/30
```
`*` k1.1 แดง 1 ครั้ง (`K1.1-S2.3` ลำดับ position≠sortOrder) ระหว่างรันเป็นชุดยาวครั้งเดียว แล้วรันซ้ำทันทีเขียว
30/30 — ตรงกับที่บันทึกไว้แล้วใน `ledger/KANBAN-RUN.md` (เหตุการณ์ K1.14: "k1.1 เคยแดง 1 ครั้งหาไม่เจอ (flaky? จับตา)")
ไม่ใช่ของใหม่จาก WO นี้ — รันซ้ำเป็นหลักฐานว่าไม่ใช่การถดถอยจริง

**typecheck** — `next build`'s type-check step ผ่าน (Fable แก้ oracle .mts ที่บล็อกอยู่ 13:58 UTC หลังผมรายงาน
พบ error ที่ `qc-kanban-k2.1.mts:89` — ดู §7) · `tsc --noEmit` แยกก่อนหน้านั้นยืนยันแล้วว่าไฟล์ในสโคป WO นี้
(`table.ts` `reports.ts` `cards.ts` `types.ts` `limits.ts` `service.ts` `actions.ts` `TableView.tsx` `BoardHeader.tsx`
`page.tsx`) **ไม่มี error สักบรรทัด** — error ทั้งหมดที่เจอ (8 จุด) อยู่ใน `scripts/qc-kanban-{k2.1,k2.2,k2.9,k3.1,k3.2}.mts`
ซึ่งเป็นไฟล์ oracle ของ Fable (WO อื่นที่ยังไม่ถึงคิว) — ผมรายงานแล้ว Fable แก้เอง ไม่ได้แตะเอง

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```

**ภาพจริง** — `pnpm exec tsx scripts/visual-kanban.mts 2.1` → 5 ใบ ใน `.qc-shots/kanban/2.1/` failures 0
- `table-view-desktop.png` — ตาราง 8 คอลัมน์ครบ (การ์ด/คอลัมน์/ผู้รับผิดชอบ/กำหนดส่ง/เช็คลิสต์/ป้ายกำกับ/เชื่อมระบบ/
  แก้ไขล่าสุด) · แท็บ "ตาราง" ไฮไลต์ในตัวสลับมุมมอง · แถบเครื่องมือ (ค้นหา/จัดกลุ่ม/เรียง/ส่งออก CSV/เพิ่มการ์ด) ·
  ท้ายตาราง "แสดง 24 จาก 24 การ์ด · แก้ค่าในช่องได้ทันที (คลิกที่ช่อง)" — เทียบ `04-table.png` ตรงโครงเป๊ะ
- `table-bulk-selected-desktop.png` — ติ๊ก 2 แถว → แถบล่าง "เลือก 2 การ์ด · ย้ายไปคอลัมน์ · มอบหมาย · ติดป้าย ·
  ตั้งกำหนดส่ง · เก็บเข้าคลัง" ตรงมะ็อกอัพ
- `table-grouped-column-desktop.png` — จัดกลุ่มตามคอลัมน์ หัวกลุ่ม "กล่องงานเข้า (5)"/"รอทำ (6)"/... + แถว
  "+ เพิ่มการ์ดใหม่ในคอลัมน์ กล่องงานเข้า" ต่อท้ายแต่ละกลุ่ม
- `table-edit-title-desktop.png` — แก้ชื่อการ์ด #5 ในช่องเป็น "แก้ชื่อผ่านตาราง (ทดสอบ QC ภาพ)" แล้วเห็นผลทันที
  (คืนชื่อเดิมใน `finally` ของ harness แล้ว — ยืนยันจาก log `🧹 คืนสภาพ K2.1`)
- `table-view-mobile.png` — รายการ 2 บรรทัด (ชื่อ+เลข / คอลัมน์+ชิปกำหนดส่ง+avatar) ไม่มีแก้ในช่อง

Fable ดูภาพแล้วยืนยันตรงกับ mockup ทั้ง 5 ใบ (ดูในบทสนทนา — ไม่ได้จดซ้ำตัวเลขพิกเซลที่นี่)

## 4. deviation จากสัญญา (พร้อมเหตุผล)

1. **`bulkUpdateAction`/`exportBoardCsvAction` รับ `dueAt`/`filters` เป็น string ไม่ใช่ `Date`** — `BulkUpdatePatch`
   ของ `cards.ts` (`dueAt?: Date|null`) เป็นชนิดฝั่ง service แต่ `TableView.tsx` (client) ห้าม import type จากไฟล์ที่
   แตะ prisma (กติกา K1.11/12/13) ⇒ นิยาม `BulkUpdateActionPatch` แยกในชั้น `actions.ts` (`dueAt?: string|null`)
   แล้วแปลงเป็น `Date` ก่อนเรียก `bulkUpdate` จริง — รูปแบบเดียวกับ `updateCardFieldsAction` เดิม
2. **`TableSort`/`TableGroupBy`/`TableRowDto`/`TableGroupDto`/`BoardTableDto` อยู่ใน `types.ts`** ไม่ใช่ `table.ts`
   — เหตุผลเดียวกับ K1.11 deviation #1 (Turbopack ลากทั้งไฟล์ที่ import `./db` เข้าบันเดิลฝั่ง browser แม้ import
   แค่ type) `table.ts` re-export `TableSort`/`TableGroupBy` กลับออกไปให้ผู้เรียกฝั่ง server ใช้ชื่อเดิมได้
3. **`sort=created`** ไม่มีนิยามชัดในสัญญา (ไม่มี `createdAt` ใน `TableRowDto` ตามงบประสิทธิภาพ §12.1) — ใช้ `cardNo`
   แทน (เรียงตามลำดับสร้างเป๊ะตาม D14) เรียง **ใหม่สุดก่อน** (descending) ตามสัญชาตญาณผู้ใช้ตาราง ต่างจาก `sort=due`
   ที่สัญญาระบุไว้ชัดว่าน้อย→มาก
4. **`sort=updated`** ก็ไม่ระบุทิศทางในสัญญา — เลือก **ใหม่สุดก่อน** เหตุผลเดียวกับข้อ 3
5. **จัดกลุ่มแล้วขยาย `pageSize` เป็น 2000** (`page.tsx`) แทนค่าปริยาย 50 — กลุ่มควรโชว์ครบทุกใบของกลุ่ม ไม่ใช่แค่
   หน้าแรก 50 ใบ (แบ่งหน้าไม่มีความหมายเมื่อดูเป็นกลุ่มตามมะ็อกอัพ) · ยังไม่ทำ virtualization/infinite-scroll —
   บอร์ดที่มีการ์ด active เกิน 2000 ใบต่อครั้งจะเห็นกลุ่มไม่ครบ (ยังไม่มีบอร์ดจริงขนาดนี้ในระบบวันนี้)
6. **"เปิดการ์ดเต็มจอ" จากตาราง** (ไอคอนลูกศรข้างชื่อ + คลิกแถวบนมือถือ) นำไปที่ `?card=<id>` **โดยตัด `view=table`
   ออก** (กลับไปแสดงผลผ่าน `BoardView`/`CardBack` เดิม) แทนที่จะฝัง `CardBack` ไว้ใน `TableView.tsx` เอง — ประหยัด
   เวลา/ความเสี่ยงจากการย้าย handler ทั้งชุดของ `CardBackHandlers` (14+ callback) มาใช้ซ้ำ · ผู้ใช้เห็นกระพริบสลับ
   มุมมองแวบเดียวตอนคลิก (ไม่ใช่ smooth modal) — จดเป็นหนี้ UI ให้ WO ถัดไปถ้าต้องการ modal ในตัวตาราง
7. **bulk "มอบหมาย"/"ติดป้าย" ทำได้แค่ "เพิ่ม" ไม่มีปุ่ม "เอาออก" ในหน้าจอ** — `cards.bulkUpdate` รองรับ
   `removeAssigneeUserIds`/`removeLabelIds` อยู่แล้ว (service ครบตามสัญญา) แต่ popover ของแถบเลือกหลายรายการ v1
   มีแค่คลิกเพื่อ "เพิ่ม" (ตรงกับสิ่งที่ oracle ทดสอบจริง S2.2/S2.3 ซึ่งทดสอบแค่ add) — เป็นหนี้ UI ไม่ใช่หนี้ service
8. **CSV คอลัมน์ "#" = `cardNo`** (ไม่ใช่เลขลำดับแถวที่ 1,2,3…) — ตีความจากภาพ 04 ที่โชว์ "การ์ด (+#131)" ว่า `#`
   หมายถึงเลขที่การ์ด ไม่ใช่ index แถว (contract เขียนหัวคอลัมน์แยก `#,การ์ด,...` เป็นสองคอลัมน์ต่างกัน)

## 5. ⚠️ พบ + ซ่อม: ดริฟต์ข้อมูล QC จาก oracle เอง (ไม่ใช่บั๊กโค้ดผม)

`scripts/qc-kanban-k2.1.mts` (S2.3) ทำ `bulkUpdate(..., {addLabelIds:[...]})` จริงกับ 2 การ์ดของบอร์ดป่าตอง แล้ว
`finally` คืนสภาพด้วยการ `deleteMany`/`create` ตรงกับตาราง `KanbanCardLabel` (join table) **โดยไม่เรียก
`syncCardLabelJson`** (ฟังก์ชัน private ใน `labels.ts` ที่เขียน `KanbanCard.labels` Json denormalized field ให้
ตรงกับ join table เสมอ — หัวใจ dual-write ของ K1.2) ⇒ ทุกครั้งที่ oracle นี้รันแล้ว "คืนสภาพ" ตาราง join กลับสำเร็จ
แต่ **`KanbanCard.labels` (Json) ของ 2 การ์ดที่ถูกทดสอบยังค้างชื่อป้ายที่เพิ่งลบออกไปแล้ว** เพราะ

- `filterBoardCards`/`labelNamesOf` (K1.11) กรองป้ายจาก `card.labels` (Json) **ไม่ใช่** join table โดยตั้งใจ
  (ประหยัด join เวลากรองฝั่ง client/server ร่วมกัน — ดูคอมเมนต์หัว `filters.ts`)
- ผลคือ `K2.1-S1.5` (filters label="ด่วน" → total 3) เจอ 4 ในรอบที่สอง (มีการ์ดที่ label หลุดจาก join table แล้ว
  แต่ Json ยังค้างชื่อ "ด่วน" อยู่) — พิสูจน์ด้วย diagnostic (`scripts/pending/diag-k21-labels.mts`): join table
  มี 3 แถวจริง แต่ `filterBoardCards` นับได้ 4 เพราะอ่าน Json

**ผมไม่แก้ oracle** (กติกาข้อ 1) — เขียน `scripts/pending/fix-k21-label-json-drift.mts` (สคริปต์ซ่อมข้อมูลเปล่า ๆ
ไม่แตะ business logic: ไล่ทุกการ์ดของ tenant QC แล้วเขียน `labels` Json ใหม่จาก join table จริง) รันไปแล้ว 2 ครั้ง
ระหว่างเซสชันนี้ (พบซ่อม 2 ใบ แล้ว 1 ใบ) ข้อมูล QC ตอนนี้สะอาด (ตรวจแล้วก่อนส่งงาน)

**ข้อเสนอถึง Fable**: ถ้าจะให้ oracle นี้รันซ้ำได้เรื่อย ๆ โดยไม่ต้องมีคนคอยรันสคริปต์ซ่อม ควรเพิ่มใน `finally` ของ
`qc-kanban-k2.1.mts` ให้ resync `KanbanCard.labels` ของการ์ดใน `bulkIds` หลังคืน join table (เช่น query ชื่อป้าย
ปัจจุบันแล้ว `kanbanCard.update({data:{labels: names}})` ตรง ๆ ไม่ต้อง export `syncCardLabelJson` ก็ได้) — ไม่ใช่
เรื่องเร่งด่วน (ไม่กระทบผลของ K2.1 เอง เพราะรอบสุดท้ายที่ส่งงานเขียว 22/22 หลังซ่อมแล้ว) แต่จะกวนข้อสอบตัวอื่นที่
กรองด้วยป้ายถ้าไม่มีใครสังเกต

## 6. หนี้ที่ฝากไว้ (นอกเหนือจาก deviation §4)

1. `sort=created`/`sort=updated` ทิศทางเป็นการตัดสินใจของผู้ทำ (ดู deviation #3/#4) — ถ้า K2.4/K2.10 (สรุป/รายงาน)
   ต้องการทิศทางอื่น ควรคุยให้ตรงกันก่อนอ้างอิงลำดับนี้
2. จัดกลุ่ม + แบ่งหน้า: ใช้ pageSize=2000 ชั่วคราว (deviation #5) — ยังไม่มี virtualization ถ้าบอร์ดใหญ่มาก
3. "เปิดการ์ดเต็มจอ" จากตาราง สลับไป `BoardView`/`CardBack` เดิม แทนที่จะมี modal ในตัว (deviation #6)
4. bulk มอบหมาย/ติดป้าย ยังไม่มีปุ่ม "เอาออก" ในหน้าจอ (deviation #7) — service พร้อมอยู่แล้ว
5. ดริฟต์ `KanbanCard.labels` จาก oracle เอง (§5) — เสนอแก้ที่ oracle แต่ไม่ได้แก้เอง

## 7. ไทม์ไลน์ที่ควรบันทึก (สำหรับ Fable ต่อ ledger)

- ระหว่างงาน `next build` แรกล้มเพราะ `qc-kanban-k2.1.mts:89` (`(l) =>` ไม่มี `: Any` เหมือนจุดอื่นในไฟล์เดียวกัน)
  — รายงานแล้ว Fable แก้ทั้ง 5 ไฟล์ + อีก 7 จุดที่ยังไม่ถึงคิว (K2.2/K2.9/K3.1/K3.2) เวลา 13:58 UTC จากนั้น build
  ผ่านตามปกติ (49s compile) — ไม่มีอะไรในโค้ด `src/` ของ WO นี้เกี่ยวข้องกับบั๊กที่บล็อก build ครั้งนั้น
