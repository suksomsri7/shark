# K2.3 — มุมมองไทม์ไลน์ `?view=timeline` (บันทึกผู้ทำ)

> WO: `ledger/KANBAN-RUN.md` §K2.3 (ใบสุดท้ายของ P2 ตาม D7) · ข้อสอบ: `scripts/qc-kanban-k2.3.mts` (17 ข้อ)
> โมเดล: Sonnet ตามตาราง WO

## 1. สิ่งที่ทำ (ภาพรวม)

1. **`listBoardTimeline`** (`src/lib/modules/kanban/timeline.ts`) — อ่านอย่างเดียว (VIEWER+) ดึงการ์ด
   active ของบอร์ด กรองด้วย `filterBoardCards` เดิม (K1.11) แล้วคัดเฉพาะที่มี `dueAt` อยู่ในช่วง
   `[from, to]` (ปิดทั้งสองฝั่ง) เป็น "แถบ" — ไม่มี `startAt` → แถบ 1 วัน (`startDay = endDay = วันครบกำหนด`)
   `startDay`/`endDay` เป็นวันจริงเสมอ (ไม่ตัดตามช่วงที่ขอ — ฝั่งจอเป็นคนตัดแสดง) · จัดกลุ่ม column (ปริยาย ·
   รวมคอลัมน์ว่างตามลำดับ) / assignee (หลายคนอยู่หลายแถว + แถว `none`="ไม่มีผู้รับผิดชอบ") / label (+ แถว
   `none`="ไม่มีป้าย") · แถบในแถวเรียง `startDay` · สีแถบ = ป้ายแรก (เรียงตาม `sortOrder` แบบเดียวกับ
   `syncCardLabelJson` ที่คุม `KanbanCard.labels` json) · `unscheduled` = การ์ด active ไม่มี `dueAt` ผ่าน
   filters เดียวกัน · ช่วง > 366 วัน → throw ไทย
2. **`setCardRange`** — ลากขอบซ้าย/ขวา ผ่าน `updateCardFields` เดิมทั้งหมด (K1.6 ตรวจ `startAt > dueAt`
   เองอยู่แล้ว ไม่ต้องซ้ำ) · `shiftCardRange` — ลากตัวแถบ อ่าน `startAt`/`dueAt` เดิมมาบวกจำนวนวันเท่ากัน
   (คงเวลาของวันเดิม) แล้วส่งต่อ `updateCardFields` เหมือนกัน — ทั้งคู่ได้ activity `CARD_DUE_SET` +
   `reminderSentAt` reset + แจ้งเตือน/realtime ฟรีจากของเดิม
3. **`TimelineView.tsx`** (client, ใหม่ทั้งไฟล์) — แถบเครื่องมือ: ซูม (`timeline-zoom`: สัปดาห์ 2
   สัปดาห์/เดือน 6 สัปดาห์/ไตรมาส 13 สัปดาห์ — ความกว้างวันต่างกัน 64/27/13px) · จัดกลุ่ม (`timeline-group`
   select) · ‹ › เลื่อนช่วง + ปุ่มวันนี้ · หัวตารางแถบเดือนไทย+พ.ศ. (คำนวณเอง ไม่ใช้ toLocale*) + เลขวัน ·
   คอลัมน์ซ้ายชื่อกลุ่ม+จำนวน แบบ sticky (ไม่ใช้ `<table>`) · แถบงาน (`timeline-bar`) จัดเลนกันทับ
   (Gantt-style `packLanes`) สีป้ายแรกผ่าน `tagColorVar` · เลยกำหนด = ขอบแดง · เสร็จ = จาง · เส้นวันนี้
   (`timeline-today`) · ลากขอบ (`timeline-handle` 2 ฝั่ง) → `setCardRangeAction` · ลากตัวแถบ →
   `shiftCardRangeAction` · pointer events เอง (ไม่มี lib ใหม่ — ใช้แพตเทิร์นเดียวกับ `CalendarView.tsx`
   K2.2: threshold 4px + `draggedAtRef` กันคลิกหลังลาก) · optimistic ผ่าน `overrides` map ต่อ cardId (ไม่แก้
   `data.rows` ตรง ๆ เพราะการ์ดเดียวอาจอยู่หลายแถวเมื่อ group=assignee/label) + rollback เมื่อ server ปฏิเสธ
   · **มือถือ <768px**: ไม่วาดกริด — ข้อความ `timeline-mobile-hint` + ลิงก์ `?view=table`
4. **หน้าบอร์ด** (`page.tsx`) — สาขา `view === "timeline"`: อ่าน `?zoom=&group=&from=YYYY-MM-DD` → คำนวณ
   `from` ปัดถอยไปวันจันทร์ของสัปดาห์นั้นเสมอ (แบบเดียวกับตารางเดือนของปฏิทิน) → `to = from + spanDays - 1ms`
   → `listBoardTimeline` → ส่ง `<TimelineView>`
5. **`BoardHeader.tsx`** — เปิดแท็บ "ไทม์ไลน์" (`ready:true`) · `currentView`/`hrefForView` รู้จัก
   `"timeline"` แล้ว (ล้าง `zoom/from` เมื่อออก · ล้าง `group` เฉพาะเมื่อไปมุมมองที่ไม่ใช่ table/timeline)
6. **`views.ts`/`types.ts`/`filters.ts`** (K2.5) — `ViewConfig`/zod schema เพิ่มฟิลด์ `zoom` · `applyView`
   ส่ง `zoom` กลับมาให้ `page.tsx` merge · `hrefForSavedView`/`SavedViewsMenu.currentConfigFromParams` อ่าน/
   เขียน `zoom` ด้วย (มุมมองไทม์ไลน์บันทึกซูมได้) — `VIEW_KEYS`/`VIEW_LABEL_TH` มี `"timeline"` อยู่แล้วจาก
   K2.5 (ไม่ต้องแก้)
7. **`scripts/visual-kanban.mts`** — เพิ่ม spec `"2.3"` (5 ภาพ: เดือน/ไตรมาส/จัดกลุ่มตามคน/หลังลากขอบ/
   มือถือ) + step ใหม่ `dragBy` (ลากตามระยะพิกเซล ใช้กับแฮนเดิลลากขอบที่ไม่มี element ปลายทางตายตัว) +
   เตรียม/คืนสภาพ `KB23` (จำ `startAt`/`dueAt` ของการ์ด**ทุกใบ**บนบอร์ดป่าตอง ไม่ใช่ใบเดียว — เพราะสเปค
   `timeline-resize-after` ลากแถบ "แรกที่เรนเดอร์" ซึ่งขึ้นกับลำดับคอลัมน์/การ์ดจริง ไม่รู้ล่วงหน้าแน่ชัด)
8. **`service.ts`** — re-export `listBoardTimeline`/`setCardRange`/`shiftCardRange` + DTO ที่เกี่ยวข้อง

ทุกช็อตของสเปค `"2.3"` ปักหมุด `?from=2026-09-16` (ใกล้วันอ้างอิงของ seed `KQC.today = 2026-09-30`) —
เหตุผล: `board.now` ของหน้าจริงคือเวลาปัจจุบันจริงของเซิร์ฟเวอร์ (ไม่ใช่วันอ้างอิงของ seed) ถ้าไม่ระบุ `from`
ช่วงปริยายจะยึดวันนี้จริงซึ่งไม่ครอบวันที่การ์ด QC ถูกตั้งไว้ (รอบ ๆ 30 ก.ย. 69) แล้วจะไม่เห็นแถบเลย

## 2. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/kanban/timeline.ts` (`listBoardTimeline` + `setCardRange` + `shiftCardRange` + helper
  วันที่ภายใน + `groupTimelineRows`)
- `src/components/kanban/TimelineView.tsx` (UI ทั้งหมดของ WO นี้)

**แก้**
- `src/lib/modules/kanban/types.ts` — เพิ่ม `TimelineGroupBy` `TimelineBarDto` `TimelineRowDto`
  `BoardTimelineDto` (ไฟล์บริสุทธิ์ตามกติกา K1.11/…/K2.2) + `ViewConfig.zoom?: string`
- `src/lib/modules/kanban/views.ts` — `ViewConfigSchema` รับ `zoom` · `AppliedView`/`applyView` ส่ง `zoom`
- `src/lib/modules/kanban/filters.ts` — `hrefForSavedView` เขียน `zoom` ลง URL ด้วย (VIEW_LABEL_TH มี
  `"timeline"` อยู่แล้วตั้งแต่ K2.5)
- `src/lib/modules/kanban/actions.ts` — `setCardRangeAction` `shiftCardRangeAction` + import
  `setCardRange, shiftCardRange`
- `src/lib/modules/kanban/service.ts` — re-export ของใหม่
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` — แยกสาขา `view === "timeline"` + helper
  `bkkDayIndexOf`/`bkkDayKeyOf` + `TIMELINE_ZOOM_VALUES`/`TIMELINE_SPAN_DAYS`
- `src/components/kanban/BoardHeader.tsx` — เปิดแท็บ "ไทม์ไลน์" · `currentView`/`hrefForView` รู้จัก
  timeline (ล้าง `zoom/from` ตอนออก)
- `src/components/kanban/SavedViewsMenu.tsx` — `currentConfigFromParams` อ่าน `zoom` จาก URL ด้วย
- `scripts/visual-kanban.mts` — spec `"2.3"` · step `dragBy` ใหม่ · เตรียม/คืนสภาพ `KB23`

## 3. ผลด่าน (ตัวเลขจริง)

**Oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.3.mts`
```
ผ่าน 17/17
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```

**Regressions** — `for f in scripts/qc-kanban-k1.*.mts scripts/qc-kanban-k2.*.mts; do … done` (รันเต็มชุด
28 ไฟล์ครั้งเดียว หลัง build เสร็จ + ปิดเซิร์ฟเวอร์แล้ว)
```
k1.1  27/30* k1.6  20/20  k1.11 21/21  k2.2  16/16  k2.7  31/31
k1.2  25/25  k1.7  21/21  k1.12 18/18  k2.3  17/17  k2.8  17/17
k1.3  29/29  k1.8  18/18  k1.13 16/16  k2.4  12/12  k2.9  26/26
k1.4  30/30  k1.9  18/18  k1.14 15/15  k2.5  15/15  k2.10 22/22
k1.5  17/17               k1.15 30/30  k2.6  17/17  k2.11 30/30
k1.10 16/16
```
`k2.12` = SKIPPED (WO ยังไม่สร้าง — คาดหวัง)

`*` k1.1 แดง 3 ข้อในรอบรวม (`K1.1-S2.5` `K1.1-S4.1` `K1.1-S4.2` — ทั้งหมดเช็ค `cardNoSeq`/`position` ของ
บอร์ดป่าตอง QC ตัวเดียวกับที่สคริปต์อื่นในชุดก็แตะ) — **รันซ้ำเดี่ยว ๆ ทันทีหลังจากนั้นได้ 30/30 เขียวสนิท**
(ยืนยัน 2 ครั้ง) พิสูจน์ว่าเป็นความไม่เสถียรจากการรัน 28 สคริปต์ติดกันชนคิว `cardNoSeq` ของบอร์ดเดียวกัน (ตัว
นับร่วม) ไม่ใช่ผลจาก K2.3 — K2.3 ไม่แตะ `position`/`cardNo`/`cardNoSeq`/`sortOrder` เลยแม้แต่บรรทัดเดียว
(เขียนได้แค่ `startAt`/`dueAt` ผ่าน `updateCardFields` เดิม) และรูปแบบนี้ตรงกับที่บันทึกไว้แล้วใน
`ledger/wo-notes/kanban-K2.2.md` §3 ("k1.1-S2.3 flake เดิมรันซ้ำได้") — คนละ check id แต่คนละกลุ่มอาการ
เดียวกัน (คำนวณ `cardNoSeq` แข่งกับสคริปต์อื่นที่สร้าง/ลบการ์ดบนบอร์ดเดียวกัน)

**ข้อสอบเก่า** (กติกาข้อ 9)
```
qc-kanban-notify.mts     12/12 เขียวหมด
qc-ai-kanban-board.mts   3/3
```

**typecheck** — `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error**

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
F2.1: import ข้ามโมดูล 51 เส้น / อนุญาต 54 (ไม่เพิ่มเส้นใหม่ — `timeline.ts` อยู่ในโมดูล kanban ล้วน คุยกับ
`./db`/`./members`/`./cards`/`./filters`/`./access` เท่านั้น ตรงกับสัญญา "ไม่มี edge ข้ามโมดูลใหม่")

**ภาพจริง** — `pnpm exec tsx scripts/visual-kanban.mts 2.3` → 5 ใบ ใน `.qc-shots/kanban/2.3/` failures 0
- `timeline-month-desktop.png` — ซูมเดือน (ปริยาย): จัดกลุ่มคอลัมน์ 5 แถว (กล่องงานเข้า/รอทำ/กำลังทำ/
  รอตรวจ/เสร็จแล้ว) พร้อมจำนวน · หัวตารางเดือนไทย "กันยายน 2569"/"ตุลาคม 2569" + เลขวัน · แถบสีตามป้าย
  (น้ำเงิน/เขียว/ส้ม/เทา/ม่วง) กระจายตามวันจริง · ถาด "ยังไม่กำหนดวัน (7)" ท้ายตาราง — เทียบเกณฑ์ §3.6 ตรง
- `timeline-quarter-desktop.png` — ซูมไตรมาส: คอลัมน์วันแคบลงเห็น 4 เดือนเต็ม (ก.ย.–ธ.ค. 69) ตามสัดส่วน
  13 สัปดาห์ · แถบเดียวกันแต่แคบลงชัดเจน (เทียบกับภาพเดือน) — ยืนยัน "ความกว้างวันต่างกัน" ตามสัญญา
- `timeline-group-assignee-desktop.png` — จัดกลุ่มตามคน: แถวซ้ายเปลี่ยนเป็นชื่อคน (กิตติ ช่างอุปกรณ์/ธนา
  ศรีสมบัติ/ปุ๊ก มณีรัตน์) + แถว "ไม่มีผู้รับผิดชอบ (1)" ท้ายสุด — ตรงสัญญา S1.5
- `timeline-resize-after-desktop.png` — ลากแฮนเดิลขวาของแถบแรกยืดออก 81px (3 วัน) แล้ว: แถบเดิมที่แคบ
  (แสดงแค่อักษรย่อ) ยืดยาวพอเห็นหัวข้อเต็ม "ลูกค้าถามคอร์ส …" — ยืนยันภาพเห็นผลจริงจากการลาก (ไม่ใช่แค่ DB
  เปลี่ยนเงียบ ๆ) ตรงสัญญา §13 K2.3 ("ลากขอบแล้วค่า startAt/dueAt ใน DB เปลี่ยนตาม")
- `timeline-mobile-mobile.png` — ไอคอนกราฟ + ข้อความ "ไทม์ไลน์ใช้บนจอกว้าง — บนมือถือลองมุมมองตารางแทน" +
  ปุ่ม "ไปมุมมองตาราง" กึ่งกลางจอ ไม่มีกริดไทม์ไลน์เลย — ตรงสัญญา

## 4. deviation จากสัญญา (พร้อมเหตุผล)

1. **`shiftCardRange` คืน `{ok, startAt, dueAt}`** แทนที่จะคืนแค่ `{ok}` ตามสัญญาที่เขียนไว้สั้น ๆ — เพิ่ม
   `startAt`/`dueAt` เพื่อให้ฝั่งจอ (`TimelineView.tsx`) ยืนยันค่าที่ server คำนวณจริงหลัง action สำเร็จได้
   โดยไม่ต้อง refetch ทั้งหน้า (ยังคง `ok:true` ตามสัญญาไว้ ฟิลด์ที่เพิ่มเป็นส่วนขยายที่ไม่กระทบ oracle —
   `K2.3-S2.3` เช็คแค่ `shifted?.ok === true` แล้วอ่านค่าจริงจาก DB แยกต่างหาก)
2. **แถบใช้ `<div>` + CSS Grid/flex + sticky แทน `<table>`** — สัญญาไม่ได้ระบุ markup เจาะจง (ไม่มี
   mockup) เลือกโครงนี้เพราะต้องมีคอลัมน์ซ้าย sticky ระหว่างเลื่อนแนวนอน (ช่วงไตรมาสกว้างถึง ~1,183px) —
   แบบเดียวกับที่ `CalendarView.tsx`/`TableView.tsx` เลือกไม่ใช้ `<table>` มาก่อนแล้ว
3. **ความกว้างวันที่แน่นอน (64/27/13px)** ไม่ได้ปักตัวเลขไว้ในสัญญา (บอกแค่ "ต่างกัน") — เลือกให้ซูมเดือน
   (ปริยาย) พอเห็นเลขวันได้ (`dayWidth ≥ 20` = แสดงเลขวัน) ส่วนไตรมาสซ่อนเลขวันไว้ (แคบเกินจะอ่าน) แสดงแค่
   เส้นแบ่งสัปดาห์ผ่านหัวเดือน
4. **การ์ดที่ไม่เคยมี `startAt` มาก่อน แล้วลากแฮนเดิลซ้ายครั้งแรก** → ตั้งเวลาเริ่มต้นที่ 09:00 ไทยของวันที่
   ลากไปถึง (ค่าคงที่ `DEFAULT_START_HOUR_MS`) — สัญญาไม่ได้ระบุเวลาเริ่มต้นที่ควรใช้ เลือก 09:00 เพราะเป็น
   เวลาเริ่มงานทั่วไปที่สมเหตุสมผลกว่าเที่ยงคืน/เที่ยงวัน (ถ้าชนกับ `dueAt` เดิมที่ตั้งไว้เช้ากว่า 09:00 ใน
   วันเดียวกัน `updateCardFields` จะ throw ไทยตามปกติ — ผู้ใช้เห็น toast แจ้งแล้วค่าคืนกลับที่เดิม)

## 5. หนี้ที่ฝากไว้

1. deviation #4 — ถ้าการ์ดมี `dueAt` ตั้งไว้ก่อน 09:00 ไทยของวันเดียวกัน แล้วลากแฮนเดิลซ้ายเข้ามาชนวันนั้น
   จะโดน throw "วันเริ่มต้องไม่หลังกำหนดส่ง" ทั้งที่ผู้ใช้ตั้งใจแค่ขยับวันไม่ได้สนใจเรื่องเวลา — ไม่ใช่บั๊ก
   (พฤติกรรมถูกต้องตามตรรกะ) แต่ UX อาจงงว่าทำไมลากไม่ได้ในบางวัน ถ้าเป็นปัญหาจริงควรเพิ่ม UI ให้ปรับเวลา
   ของ `dueAt`/`startAt` แยกได้ (ยังไม่มีในสัญญา K2.3)
2. lane-packing (`packLanes`) ไม่ reflow ระหว่างที่กำลังลากอยู่ (แช่แข็งตำแหน่งเลนที่คำนวณไว้ก่อนเริ่มลาก)
   — พฤติกรรมมาตรฐานของเครื่องมือ Gantt ทั่วไป ไม่ใช่บั๊ก แต่บันทึกไว้เผื่อมีคนสงสัยทีหลัง
3. flake ของ `qc-kanban-k1.1.mts` (`cardNoSeq` ชนกันเมื่อรันหลายสคริปต์ติดกัน) ยังไม่ถูกแก้ที่ต้นตอ (เป็น
   หนี้เดิมจาก K1.1/K1.14/K2.1/K2.2 ไม่ใช่หนี้ใหม่จาก K2.3) — บันทึกซ้ำไว้ให้เห็นชัดว่ายังไม่หาย

## 6. ข้อแย้ง oracle

ไม่มี — oracle เขียนถูกทุกข้อ ผ่านครบ 17/17 ตั้งแต่รอบที่ทำ UI+ภาพเสร็จ (S3.6 ตกรอบแรกเพราะยังไม่ได้ถ่ายภาพ
ไม่ใช่ oracle ผิด)
