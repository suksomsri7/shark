# WO K2.10 — รายงานในแอป `/kanban/reports`

> ผู้ทำ: Sonnet (builder) · worktree `shark-kanban` branch `session/kanban` · ยังไม่ commit/push ตามคำสั่ง
> ข้อสอบ: `scripts/qc-kanban-k2.10.mts` (22 ข้อ · Fable เขียน · builder ไม่แตะ)

## 1. ทำอะไรไปบ้าง

### 1.1 บริการ (`src/lib/modules/kanban/reports.ts` — ต่อจากไฟล์ K2.1 ที่มี `exportCardsCsv` อยู่แล้ว)

- `assertReportAccess(actor)` — ด่านสิทธิ์เดียวของทุกรายงาน เรียก `canViewReports()` ของ `access.ts`
- `canViewReports(actor)` (ใหม่ใน `access.ts` — บริสุทธิ์ ไม่แตะ prisma): OWNER ผ่านเสมอ · อื่น ๆ ต้อง
  `canReadKanban(actor)` **และ** `actor.permissions["kanban.report.view"] === true` ตรง ๆ (ไม่ผ่าน `evaluate()`
  ของ RBAC ทั่วไป — ถ้าใช้ `evaluate()` แล้ว MANAGER จะได้สิทธิ์รายงานฟรีจากการเป็น MANAGER ซึ่งผิดสัญญา
  ที่ต้องมีคีย์ `kanban.report.view` ชัด ๆ — แพตเทิร์นเดียวกับ `canManageAutomation()` ของ K2.9)
- `scopedBoards(ctx, actor, boardId?)` — บอร์ด ACTIVE ที่ actor มองเห็นผ่าน `visibleBoardsWhere(actor)`
  (`AND: [{tenantId,systemId,status:"ACTIVE"}, visibleBoardsWhere(actor)]` แบบเดียวกับ `boardsHome.ts`) ·
  ระบุ `boardId` ที่มองไม่เห็น/ไม่มีจริง → `KanbanNotFoundError`
- `openCards(ctx, actor, {now, boardId?})` → ค้างต่อบอร์ด (open/overdue/dueToday/dueWeek) ผ่าน `dueBucketOf`
  ของ `filters.ts` (ปฏิทินไทยเดียวกับ K1.13/K2.4)
- `overdue(ctx, actor, {now, boardId?})` → เรียงเลยนานสุดก่อน `take:500` · `total` มาจาก `count()` แยก (ไม่ผูก
  กับ `rows.length` ที่ถูกตัด) · `daysOverdue` จาก `dayIndexOf` (วันไทยเต็ม ไม่ใช่ ms หาร)
- `workload(ctx, actor, {now, boardId?})` → การ์ดหลายคนนับให้ทุกคน (fallback `"none"`) · `done30d` จาก
  ช่วง `[now-30วัน, now]`
- `throughput(ctx, actor, {now, boardId?, weeks=12})` → จันทร์ไทยของแต่ละสัปดาห์ (สูตรเดียวกับ
  `summary.ts`/`my-tasks.ts`) · ตัดที่ 52
- `aging(ctx, actor, {now, boardId?})` → อายุ = วันเต็มจาก `createdAt` ถึง `now` (ms หาร DAY_MS ตรง ๆ — **ไม่**
  ใช้สูตรปฏิทินไทยแบบ `dueBucketOf`/`daysOverdue` เพราะ oracle นิยาม "อายุ" เป็นระยะเวลา ไม่ใช่วันปฏิทิน —
  ดู §4 ข้อแย้ง/deviation)
- `exportReportCsv(ctx, actor, kind, opts)` — 4 ชนิด (overdue/workload/throughput/aging — **ไม่รวม "ค้าง"**
  เพราะเป็นภาพรวมของอีก 4 อยู่แล้ว ไม่มีนิยาม CSV ของตัวเอง) BOM + หัวไทย ผ่าน `csvRow`/`csvCell` ของ
  `@/lib/core/csv`
- ทุกคิวรี `KanbanCard` มี `where tenantId+systemId+status:"ACTIVE"` **และ** `board:{status:"ACTIVE"}`
  ซ้อนอีกชั้น (กันหลุดแม้ `scopedBoards` พลาด) + `select` เฉพาะคอลัมน์ที่ใช้ — ไม่มี raw SQL ใหม่

### 1.2 สิทธิ์ + เมนู

- `kanban.report.view` มีอยู่แล้วใน `permissions.ts` (K2.9/พิมพ์เขียวเตรียมไว้ล่วงหน้า) — ไม่ต้องเพิ่ม
- `nav.ts`: `reports` → `status: "ready"` · เพิ่ม `visibleNavEntries()`/กรอง `kanbanNavItems()` ด้วย
  `canViewReports(actor)` — "รายงาน" หายทั้งชุดสำหรับคนไม่มีคีย์ (ไม่ใช่แค่จาง + "เร็ว ๆ นี้")
- `kanbanNavChildren(base, actor?)` (drawer ☰) กรองเหมือนกัน → `src/app/app/layout.tsx` ส่ง
  `toActor(auth.user.id, auth.active)` เข้าไปตอนสร้างเมนู `KANBAN`
- `KanbanTabs.tsx` (client) รับ prop `actor?: KanbanActor` ใหม่ ส่งต่อ `kanbanNavItems(systemId, actor)` —
  import `canViewReports`/`KanbanActor` ได้ตรง ๆ เพราะ `access.ts`/`types.ts` เป็นไฟล์บริสุทธิ์ (ไม่แตะ
  prisma) ไม่ลาก `db.ts` เข้าบันเดิลฝั่ง browser
- แก้ 3 หน้าเดิมที่เรียก `<KanbanTabs>` ให้ส่ง `actor` เข้าไปด้วย: `boards/page.tsx` · `my-tasks/page.tsx` ·
  `settings/page.tsx` (ตัวหลังนี้เดิมไม่เก็บ `actor` เป็นตัวแปร — แก้ให้เก็บแล้วใช้ซ้ำ)

### 1.3 หน้าจอ

- `src/app/app/sys/[id]/kanban/reports/page.tsx` (server, ใหม่): 404 ก่อนคิว DB ใด ๆ ถ้า `!canViewReports`
  · เรียก 5 รายงานพร้อมรายชื่อบอร์ดใน `Promise.all` เดียว · `?board=` ที่มองไม่เห็น → `scopedBoards` โยน
  → จับใน `catch` → `notFound()` (ไม่ยืนยันว่าบอร์ดลับมีจริง)
- `src/components/kanban/ReportsPage.tsx` (client, ใหม่): 5 แท็บสลับฝั่ง client ล้วน (ไม่ยิง server ซ้ำ) —
  เปลี่ยนเฉพาะ `?board=` ที่ navigate ใหม่จริง · KPI 4 ค่า (มือถือ = ชิปเลื่อนแนวนอนผ่าน CSS breakpoint ล้วน
  แบบเดียวกับ `SummaryView.tsx` — ไม่ใช้ `useSyncExternalStore` เพราะไม่มีการโต้ตอบต่างกันระหว่างจอ) ·
  กราฟ SVG ล้วน 3 ตัว (`WorkloadSvg`/`ThroughputSvg`/`AgingSvg`) โทนสีผ่าน `var(--color-*)` ทั้งหมด · แถว
  เลยกำหนดคลิก → `/kanban/b/{boardId}?card={cardId}` จริง
- ใช้ `min-h-[calc(100dvh-3.5rem)]` (ปล่อย scroll ธรรมชาติ) — **ไม่ก็อป fixed-viewport ของ Table/Calendar**
  ตามบทเรียนที่ K2.4 ฝากไว้ตรง ๆ ให้ WO นี้ (`ledger/wo-notes/kanban-K2.4.md` §4.1/§6.3)

### 1.4 actions + types + ภาพ

- `exportReportCsvAction(kind, boardId?)` ใน `actions.ts` — ด่านชั้น 1 `assertKanbanCan(auth,
  "kanban.report.view")` (coarse gate — MANAGER ผ่านได้ผ่าน `evaluate()`) แล้ว `assertReportAccess` ใน
  service เป็นผู้ตัดสินจริง (แพตเทิร์นเดียวกับ `exportBoardCsvAction`/`automation-actions.ts#scope`)
- `types.ts` เพิ่ม DTO บริสุทธิ์ 12 ตัว (`ReportOpenCardsDto`/`ReportOverdueDto`/`ReportWorkloadDto`/
  `ReportThroughputWeekDto`/`ReportAgingDto`/ฯลฯ) — `ReportsPage.tsx` `import type` ได้โดยไม่ลาก `./db`
- `scripts/visual-kanban.mts` เพิ่ม `SPECS["2.10"]` (5 สเปค: ค้าง · เลยกำหนด · ภาระงาน · อายุงาน · มือถือ)
  ไม่มีขั้นเตรียม/คืนสภาพ seed (อ่านอย่างเดียวล้วนเหมือน `2.4`)

ไม่มี migration · ไม่มี route `/api/kanban/reports` สาธารณะ · ไม่มี edge ข้ามโมดูลใหม่ (import ในไฟล์ใหม่
ทั้งหมดอยู่ในโมดูล kanban เอง + `@/lib/core/csv` ที่มีอยู่แล้ว)

## 2. ไฟล์ที่แตะ

ใหม่:
- `src/lib/modules/kanban/reports.ts` (ต่อจากของเดิม — ไม่ใช่ไฟล์ใหม่ทั้งไฟล์)
- `src/app/app/sys/[id]/kanban/reports/page.tsx`
- `src/components/kanban/ReportsPage.tsx`

แก้:
- `src/lib/modules/kanban/access.ts` (+`canViewReports`)
- `src/lib/modules/kanban/types.ts` (+DTO รายงาน 12 ตัว)
- `src/lib/modules/kanban/actions.ts` (+`exportReportCsvAction`)
- `src/lib/modules/kanban/nav.ts` (reports → ready + กรองด้วยสิทธิ์)
- `src/components/kanban/KanbanTabs.tsx` (+prop `actor`)
- `src/app/app/layout.tsx` (ส่ง actor เข้า `kanbanNavChildren`)
- `src/app/app/sys/[id]/kanban/boards/page.tsx` / `my-tasks/page.tsx` / `settings/page.tsx` (ส่ง `actor`
  ให้ `<KanbanTabs>`)
- `scripts/visual-kanban.mts` (+`SPECS["2.10"]`)

## 3. ผลด่าน (ตัวเลขจริง)

| ด่าน | ผล |
|---|---|
| `qc-kanban-k2.10.mts` | **22/22** (CRITICAL 0 · MAJOR 0 · MINOR 0) |
| typecheck `tsc --noEmit` | **0 error** |
| `fitness.mts` | **23/23** |
| ภาพ spec `"2.10"` | **5 ใบ** ใน `.qc-shots/kanban/2.10/` · failures 0 |

### regressions รายชุด (ทุกชุดเขียว)

| ชุด | ผล | ชุด | ผล |
|---|---|---|---|
| k1.1 | 29/30 † | k2.1 | 22/22 |
| k1.2 | 25/25 | k2.2 | 16/16 |
| k1.3 | 29/29 | k2.4 | 12/12 |
| k1.4 | 30/30 | k2.5 | 15/15 |
| k1.5 | 17/17 | k2.6 | 17/17 |
| k1.6 | 20/20 | k2.7 | 31/31 |
| k1.7 | 21/21 | k2.8 | 17/17 |
| k1.8 | 18/18 | k2.9 | 26/26 |
| k1.9 | 18/18 | `qc-kanban-notify` | 12/12 |
| k1.10 | 16/16 | `qc-ai-kanban-board` | 3/3 |
| k1.11 | 21/21 | `qc-nav-functions` | 10/10 (KANBAN 7 ฟังก์ชันย่อย — เพิ่ม "รายงาน") |
| k1.12 | 18/18 | `qc-automation` | 13/13 |
| k1.13 | 16/16 | `qc-webhook` | 15/15 |
| k1.14 | 15/15 | `qc-webhook-ui` | 11/11 |
| k1.15 | 30/30 | | |

† `K1.1-S2.3` = flake เดิมของชุดนั้น (บันทึกไว้ตั้งแต่ K1.1/K2.9 — ไม่เกี่ยวกับ WO นี้ ไม่ได้รันซ้ำเพื่อยืนยัน
เพิ่มเพราะรู้อยู่แล้วว่าเป็น flake เดิม)

## 4. ภาพจริงที่เห็น (Fable/builder เปิดดูทุกใบ)

1. `reports-open-desktop.png` — แท็บ "ค้าง" (ปริยาย): ตัวเลขใหญ่ 4 ค่า (34/4/0/1) + รายการต่อบอร์ด 3 แถว
   (งานร้าน—สาขาป่าตอง 24/4/0/1 · ซ่อมบำรุงอุปกรณ์ 7/0/0/0 · บอร์ดลับสาขากะตะ 3/0/0/0) — ตรงกับสัญญา
2. `reports-overdue-desktop.png` — แท็บ "เลยกำหนด": 4 แถวเรียงเลยนานสุดก่อน (6/5/4/3 วัน) พร้อมชื่อบอร์ด·
   คอลัมน์·วันครบกำหนด — **สังเกต**: คอลัมน์ที่โผล่คือ "เสร็จแล้ว" (ชื่อคอลัมน์บนบอร์ดป่าตอง ไม่ใช่สถานะ)
   เพราะ 7 ใบนั้นยังไม่มี `completedAt`/คอลัมน์ยังไม่ตั้ง `isDoneColumn` — ตรงกับหนี้ seed ที่ KANBAN-RUN.md
   §K2.10 บันทึกไว้ล่วงหน้าแล้วว่า "ถูกต้องตามข้อมูล ไม่ใช่บั๊กของ WO นี้" — ยืนยันด้วยภาพว่าโค้ดยึดนิยาม
   `completedAt` ไม่ดูชื่อคอลัมน์จริงตามสัญญา
3. `reports-workload-desktop.png` — แท็บ "ภาระงาน": กราฟแท่งนอน 4 คน (ไม่มีผู้รับผิดชอบ 10 · ธนา 9(เลย 2) ·
   กิตติ 8(เลย 1) · ปุ๊ก 7(เลย 1)) ตัวเลขไม่ถูกตัดขอบ (แก้บั๊ก §5.1 แล้ว) + ตารางตัวเลขด้านล่างครบ 4 คอลัมน์
4. `reports-throughput-aging-desktop.png` — แท็บ "อายุงาน": กราฟแท่ง 4 ช่วง (34/0/0/0) ตัวเลข "34" ไม่ชนขอบบน
   แล้ว (แก้บั๊ก §5.1) + ตารางต่อคอลัมน์ 10 แถว (ชื่อคอลัมน์·บอร์ด·ค้าง·เฉลี่ย·สูงสุด)
5. `reports-mobile-mobile.png` — ตัวเลขใหญ่เป็นชิปเลื่อนแนวนอน (เห็นขอบชิปที่ 3 โดนตัด = เลื่อนได้จริง) ·
   แท็บเลื่อนแนวนอน (เห็น "ผลงานร..."/"ปฏิทิ..." โดนตัดขอบจอ) · ตัวกรองบอร์ดเต็มความกว้าง · รายการอ่านง่าย

## 5. บั๊กที่เจอระหว่างพัฒนา + วิธีแก้

### 5.1 ตัวเลขท้ายแท่งกราฟ SVG ถูกตัดขอบขวา/บน เมื่อค่าเป็นค่าสูงสุด

**อาการ**: ถ่ายภาพรอบแรก แท่งที่ยาว/สูงสุดของ `WorkloadSvg`/`AgingSvg` มีตัวเลขกำกับที่ดูเหมือนถูกตัดครึ่ง
ตัวอักษร (`"10"` ดูคล้าย `"1C"` ที่ปลายแท่งยาวสุด · `"34"` ชิดขอบบนของ `AgingSvg` จนดูเหมือนถูกกดทับ)

**สาเหตุ**: `WorkloadSvg` วางตัวเลขที่ `x = labelW + openW + 6` — เมื่อ `openW` เท่ากับความกว้างพล็อตเต็ม
(ค่าสูงสุด) ตำแหน่งข้อความจะไปอยู่ห่างจากขอบขวาของ `viewBox` (640) แค่ ~10px ซึ่งไม่พอสำหรับเลข 2 หลัก ·
`AgingSvg` วาง `padTop = 10` ซึ่งไม่พอเผื่อความสูงตัวอักษรของ label ที่วางเหนือแท่งที่สูงสุด (`barH = plotH`
เต็ม ⇒ `y = H - padBottom - barH - 6` ใกล้ 0 เกินไป)

**วิธีแก้**: เพิ่ม `numW = 34` แยกออกจาก padding เดิมของ `plotW` ใน `WorkloadSvg` (`plotW = W - labelW -
numW`) และเพิ่ม `AgingSvg.padTop` จาก 10 → 20 — build ใหม่ + ถ่ายภาพซ้ำ ยืนยันด้วยตาว่าเลขไม่ถูกตัดแล้ว
(ภาพ §4 ข้อ 3–4)

**บทเรียนที่ฝากไว้**: กราฟ SVG ที่วางตัวเลขกำกับติดปลายแท่ง/เหนือแท่ง ต้องกันระยะสำหรับ "กรณีค่าที่มากที่สุด
พอดีเต็มความกว้าง/สูงของพล็อต" ไว้ตั้งแต่ตอนคำนวณ padding — ทดสอบด้วยตาจากข้อมูลจริงเท่านั้นถึงจะเจอ (oracle
เช็คแค่ว่ามี `<svg>` ไม่เช็คว่าตัวเลขอ่านออก)

## 6. deviation จากสัญญา (พร้อมเหตุผล)

1. **`aging` คำนวณอายุจากระยะเวลาจริง (`Math.floor((now-createdAt)/86400000)`) ไม่ใช่ผลต่างวันปฏิทินไทย
   แบบ `dueBucketOf`/`overdue.daysOverdue`** — ตรงกับสูตรที่ oracle S5.1/S5.2 คำนวณเทียบเอง (`ageDays` ของ
   ข้อสอบใช้สูตรเดียวกันเป๊ะ ไม่ผ่าน `dayIndexOf`) และตรงกับถ้อยคำสัญญา "อายุ = วันเต็มจาก createdAt ถึง
   now" (ระยะเวลา ไม่ใช่ปฏิทิน) ส่วน `overdue.daysOverdue` ใช้ `dayIndexOf` (ปฏิทินไทย) ตามถ้อยคำ "จำนวนวัน
   ไทยที่เลย" — สองฟังก์ชันจงใจใช้สูตรต่างกันเพราะนิยามคนละความหมาย ไม่ใช่ความไม่สอดคล้องกัน
2. **`exportReportCsv` ไม่มี kind `"open"`** — สัญญาระบุ kind ไว้แค่ 4 ชนิด (overdue/workload/throughput/
   aging) UI จึงซ่อนปุ่ม "ส่งออก CSV" ตอนอยู่แท็บ "ค้าง" (ไม่มีอะไรให้กดพัง)
3. **`overdue.total` มาจาก `count()` แยกจาก `rows.length`** — ป้องกันเลขไม่ตรงเมื่อเกิน `take:500` ในอนาคต
   (ชุดข้อมูล QC มี 9 ใบ ไม่ชนเพดาน จึงพิสูจน์แยกสองค่าไม่ได้จากชุดนี้ — deviation เชิงป้องกัน ไม่ใช่ผลต่าง
   ที่วัดได้จริงตอนนี้)
4. **เพิ่มลิงก์ที่แถว "ค้าง" ต่อบอร์ด → `?view=table` ของบอร์ดนั้น** — สัญญาไม่ได้บังคับ แต่เพิ่มให้กดแล้ว
   เจาะลงได้จริง (แนวเดียวกับ `SummaryView.tsx` K2.4) เป็นการเพิ่มล้วน ไม่กระทบข้อสอบ
5. **ขยายขอบเขตนอกสัญญาจุดเดียว**: กรองเมนู "รายงาน" ในทั้ง `KanbanTabs.tsx` (แถบแท็บ) **และ**
   `kanbanNavChildren` (drawer ☰ ของทั้งแอป ผ่าน `layout.tsx`) ทั้งที่สัญญาพูดถึงแค่ "nav.ts/KanbanTabs กรอง
   ด้วยสิทธิ์" — ทำเพราะ drawer เป็นทางเข้าอีกทางที่ผู้ใช้เห็นเมนู "รายงาน" ได้เหมือนกัน ถ้าไม่กรองด้วยจะมี
   ช่องโหว่ที่ทางหนึ่งซ่อนแต่อีกทางไม่ซ่อน (`layout.tsx` มี `auth` อยู่ในสโคปอยู่แล้ว ไม่ต้องคิว DB เพิ่ม)

## 7. หนี้ที่เหลือ

1. **ไม่มี REST API op ของรายงาน (K2.10) ในทะเบียน K1.15** — เหมือนหนี้ที่ K2.6/K2.7/K2.8 บันทึกไว้แล้วว่า
   "มุมมอง/ฟิลด์/ปฏิทิน/สรุป/รายงานยังไม่มี REST op + AI tool (ทำเป็น WO รวบตอนปิด P2/P3)" — ไม่ใช่หนี้ใหม่
   ของ WO นี้ เป็นหนี้สะสมเดิมที่ยังไม่ถึงคิว
2. **ชื่อคนในกราฟ `WorkloadSvg` ตัดที่ 16 ตัวอักษร (`…`)** — พอสำหรับชื่อไทยทั่วไปในชุด QC แต่ชื่อยาวมาก ๆ
   ในโปรดักชันจริงอาจดูรวบมากไป (ไม่ใช่บั๊ก — ค่ากราฟอ่านได้จากตารางด้านล่างเต็ม ๆ อยู่แล้ว)
3. **`throughput` ไม่มีตารางข้อมูลกำกับกราฟ** (มีแต่กราฟแท่งคู่) — ตามแนวเดียวกับ `SummaryView.tsx` (K2.4)
   ที่ไม่มีตารางกำกับ throughput เช่นกัน — ถ้า Fable อยากได้ตารางด้วยเพิ่มทีหลังได้ไม่กระทบ schema/service

## 8. ข้อแย้ง oracle

ไม่มี — รันครั้งแรกได้ 20/22 (พลาดจากคอมเมนต์ของตัวเองที่มีคำว่า `getDay()`/`toLocaleDateString` ในไฟล์
`reports.ts` ทำให้ข้อสอบ S7.2 (regex สแกนทั้งไฟล์รวมคอมเมนต์) ตกเอง — ไม่ใช่ oracle ผิด เป็นความผิดของ
ผู้เขียนโค้ดเองที่ใส่คำต้องห้ามไว้ในคำอธิบาย) แก้คำอธิบายให้ไม่มีคำเหล่านั้น (ความหมายเดิมครบ) → 21/22 →
ถ่ายภาพจริงแล้วครบ → **22/22**

## 9. ไทม์ไลน์ที่ควรบันทึก (สำหรับ Fable ต่อ ledger)

อ่านสัญญา §K2.10 + oracle + พิมพ์เขียว §3.7/§5.6/§6.1/§11.10 + บทเรียน K2.4/K2.9 + โค้ดเดิม (table.ts/
summary.ts/my-tasks.ts/access.ts/filters.ts/nav.ts/automation.ts) → เขียน `canViewReports` (access.ts) →
เขียน 5 ฟังก์ชันรายงาน + `exportReportCsv` ใน `reports.ts` → เพิ่ม DTO ใน `types.ts` → oracle 20/22 (ขาด
ภาพ + คอมเมนต์ตัวเองชนคำต้องห้าม) → แก้คอมเมนต์ 3 จุด → 21/22 → เขียน `ReportsPage.tsx` + `page.tsx` →
ต่อ `actions.ts`/`nav.ts`/`KanbanTabs.tsx`/`layout.tsx`/3 หน้าเดิม → เพิ่ม spec `"2.10"` ใน
`visual-kanban.mts` → typecheck 0 error → regressions ทุกชุดเขียว → build+serve ถ่ายภาพรอบแรก 5 ใบ → พบ
บั๊กตัวเลขชนขอบ SVG 2 จุด (§5.1) → แก้ CSS/padding → rebuild+serve ถ่ายภาพรอบสอง ยืนยันแก้แล้ว → oracle
22/22 → typecheck ซ้ำ 0 error → fitness 23/23 → regressions ซ้ำรอบสุดท้ายเขียวครบ → เขียน wo-notes นี้
