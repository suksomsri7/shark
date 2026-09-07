# WO K2.5 — มุมมองที่บันทึกไว้ (`KanbanBoardView` ส่วนตัว/ทั้งทีม)

## 1. สิ่งที่ทำ (ภาพรวม)

- **migration `20261001000000_kanban_v2_l`** (additive): `enum KanbanViewScope {PRIVATE BOARD}` +
  `model KanbanBoardView` (`tenantId systemId boardId? ownerUserId? name scope config sortOrder
  createdAt updatedAt` · `@@index([boardId,scope])` · `@@index([tenantId,systemId,ownerUserId])` · FK
  `boardId → KanbanBoard.id` nullable ON DELETE CASCADE) — `boardId` เป็น `String?` ตั้งแต่วันนี้ตามสัญญา
  (K3.8 จะใช้ `null` = มุมมองข้ามบอร์ด ไม่ต้อง migration ใหม่) · ลงทะเบียน `KanbanBoardView: sys()` ใน
  `src/lib/core/scope.ts` · เพิ่ม `views KanbanBoardView[]` ใน `KanbanBoard` (back-relation)
- **`src/lib/modules/kanban/views.ts`** (ใหม่ — server-only, `import { prisma } from "./db"`):
  - `ViewConfig`/`ViewFilters`/`ViewScope`/`SavedViewDto` ประกาศจริงที่ `types.ts` (ไฟล์บริสุทธิ์ —
    เหตุผลเดียวกับ K1.11/K1.12/K2.1/K2.2/K2.4: `SavedViewsMenu.tsx`/`SavedViewsSettings.tsx` ต้อง
    `import type` ได้โดยไม่ลาก `db.ts`→`pg` เข้าบันเดิลฝั่ง browser) · `views.ts` `export type {...} from
    "./types"` ให้ผู้เรียกยัง `import type { ViewConfig } from ".../views"` ได้ตามสัญญา
  - zod schema (`ViewConfigSchema`/`ViewFiltersSchema`) ตรวจรูป config ก่อนเขียนทุกครั้ง — `view` ต้อง ∈
    5 ค่า · คีย์แปลกถูก strip (zod default ไม่ `.strict()`) · ผิดรูป/ชื่อว่าง → throw ข้อความไทย
  - `listViews` (BOARD มาก่อนเสมอ แล้วตามด้วย PRIVATE ของ actor — เรียงด้วย `orderBy scope:"desc"` ใช้
    ประโยชน์จากอันดับ enum PRIVATE=0/BOARD=1 ที่ประกาศไว้ในสคีมา) · `saveView` (PRIVATE=VIEWER+ ·
    BOARD=ADMIN ผ่าน `assertBoardRole` เดิม) · `updateView`/`deleteView` (PRIVATE=เจ้าของ ·
    BOARD=ADMIN — ของคนอื่น/ไม่มีสิทธิ์ = 404 ไทย ไม่ใช่ 403 ตามกติกา §6.3) · `applyView` (คืน
    `{view,filters,sort,group,href}` — href เขียนตัวกรองลง query จริงตาม §2.3 + `savedView=<id>`
    ท้ายสุดเสมอ) · `reorderViews` (เผื่อไว้ — ยังไม่มี UI เรียก ดู §4 ข้อ 3)
  - เพดาน `KANBAN_LIMITS.viewsPerBoard = 20` (เพิ่มใน `limits.ts`) — PRIVATE นับเฉพาะของ actor เอง ·
    BOARD นับรวมเป็นโควตาเดียวของบอร์ด (ตัดสินเอง — ดู §4 ข้อ 1)
  - `buildHref`/`hrefForSavedView` ตัวเดียวกันกับที่ `SavedViewsMenu.tsx` ใช้คำนวณ href ฝั่ง client
    (อยู่ใน `filters.ts` ที่ไม่แตะ prisma — `views.ts` import ตรง ๆ ได้เพราะเป็นทิศทาง server→pure ที่
    ไม่เสี่ยงบันเดิลฝั่ง browser) — กันตรรกะสร้าง query string ซ้ำสองที่
- **`src/lib/modules/kanban/actions.ts`**: `saveViewAction` `updateViewAction` `deleteViewAction` (ตรวจ
  `kanban.board.read` ระดับโมดูลที่ชั้น action · บทบาทบอร์ดจริงตรวจใน `views.ts`) + `revalidatePath`
  ทั้งหน้าบอร์ดและ `settings/views`
- **`src/components/kanban/SavedViewsMenu.tsx`** (ใหม่ — client): dropdown testid `saved-views` ใน
  หัวบอร์ด แยกหมวด "ทั้งทีม"/"ส่วนตัว" (บรรยายเงื่อนไขด้วย `describeSavedViewConfig`) + ปุ่ม
  "บันทึกมุมมองนี้" (โมดัลชื่อ + เลือก scope ถ้า ADMIN) + ปุ่มลบต่อแถว (เฉพาะแถวที่ actor แก้ได้)
  - 🔴 **บั๊กที่เจอ+แก้ (สำคัญ — ไม่ใช่แค่ของ K2.5)**: แผงดรอปดาวน์ตัวแรกที่ทำเป็น `position:absolute`
    ธรรมดา **มองไม่เห็นเลย 100%** ทั้งในภาพที่ถ่ายและ (สันนิษฐานว่า) ในเบราว์เซอร์จริงด้วย เพราะ
    `<header data-testid="board-header">` มี `overflow-x-auto` — ตาม CSS spec ถ้าตั้ง `overflow-x`
    เป็นค่าที่ไม่ใช่ `visible` แล้ว `overflow-y` ยังเป็น `visible` (ปริยาย) เบราว์เซอร์จะ**บังคับคำนวณ
    `overflow-y` เป็น `auto` ไปด้วยเสมอ** (ไม่ว่าจะตั้ง `overflow-y: visible` ชัดเจนแค่ไหนก็ตาม — เป็น
    "used value" ไม่ใช่ authored value) ⇒ อะไรก็ตามที่เป็น `position:absolute` แล้วโผล่พ้นความสูงจริง
    ของ `<header>` (~51px) จะถูกครอบตัดจนเหลือ 0 พิกเซล ไม่ใช่แค่โดนตัดครึ่ง — พิสูจน์แล้วว่า **เมนู "⋯"
    เดิม (K1.5) ก็โดนปัญหาเดียวกัน** (ทดสอบเปิดเมนูแล้วถ่ายภาพ ก็มองไม่เห็นเหมือนกันเป๊ะ) แค่ไม่เคยมี WO
    ไหนถ่ายภาพตอนเปิดมันมาก่อนจึงไม่มีใครจับได้ (ดู §5 "ข้อแย้ง/พบเจอ")
    ⇒ **แก้เฉพาะจุดของ `SavedViewsMenu.tsx`**: เปลี่ยนแผงจาก `position:absolute` เป็น `position:fixed`
    คำนวณพิกัดจาก `triggerRef.current.getBoundingClientRect()` ตอนเปิด (escape จาก containing block
    ของ header ไปอิง viewport แทน — วิธีเดียวกับที่ `SearchPalette.tsx` ใช้อยู่แล้วโดยบังเอิญ) — **ไม่ได้
    แก้ที่ `BoardHeader.tsx`/เมนู "⋯"/แผงตัวกรองเดิม** (นอกสัญญา K2.5 · เสี่ยงกระทบ UI ที่ Fable เซ็นรับ
    ไปแล้วใน K1.5/K1.11 โดยไม่มีข้อสอบ/ภาพชุดเดิมมายืนยันว่าไม่พัง) — จดเป็นหนี้ให้ Fable ตัดสินว่าจะแก้
    รากที่ `BoardHeader.tsx` (ปรับเป็น wrapper ซ้อน scroll แนวนอนแยกจากกล่องที่ห้ามครอบตัดแนวตั้ง หรือ
    ย้ายทุกดรอปดาวน์ไป portal) ในภาพรวมทีหลังไหม
- **`src/components/kanban/BoardHeader.tsx`**: วาง `<SavedViewsMenu>` ระหว่างปุ่ม "ตัวกรอง"/"อัตโนมัติ"
  · เปลี่ยนข้อความ "ตั้งค่าบอร์ด · ป้ายกำกับ — เร็ว ๆ นี้" ในเมนู ⋯ เป็นลิงก์จริง `board-settings-link`
  ไป `/settings/general` (เฉพาะ ADMIN — เดิมไม่ได้ผูก isAdmin ก็แก้ให้ผูกด้วย)
- **หน้าบอร์ด `page.tsx`**: อ่าน `?savedView=` → `applyView` → **merge**: พารามิเตอร์ที่ผู้ใช้ส่งมาใน URL
  เอง (`assignee/label/due/status/q/column/view/sort/group`) ทับค่าจาก config เสมอ (ตามสัญญา) —
  ไม่ redirect เปลี่ยน URL จริง แค่ใช้ค่าที่ merge แล้วเป็นพารามิเตอร์ประมวลผลของ request นั้น (มุมมองที่ยัง
  ไม่มี/ถูกลบ/ไม่มีสิทธิ์เห็น → `.catch(() => null)` เพิกเฉยเงียบ ๆ ใช้ URL ปกติ ไม่ทำให้ทั้งหน้าเด้ง 404) ·
  โหลด `listViews` ส่งเป็น prop `savedViews` ให้ทุกมุมมองย่อย (Board/Table/Calendar/Summary → BoardHeader)
- **โครงหน้าตั้งค่าบอร์ด** `src/app/app/sys/[id]/kanban/b/[boardId]/settings/[tab]/page.tsx` (ใหม่ — ตาม
  ภาพ 10 · 7 แท็บ): `BoardSettingsNav.tsx` (sidebar 240px + ปุ่มอันตราย "เก็บบอร์ดเข้าคลัง" ยืนยัน 2 ขั้น
  inline — `ArchiveBoardButton.tsx`) · แท็บ **มุมมองที่บันทึกไว้** = ของจริงเต็มรูปแบบ (`SavedViewsSettings.tsx`
  testid `saved-views-settings`) · แท็บ **ทั่วไป/สมาชิกและสิทธิ์/ป้ายกำกับ** = อ่านข้อมูลจริงจาก service ที่
  มีอยู่แล้ว (`getBoardView`/`listMembers`/`listLabels`) แบบอ่านอย่างเดียว (แก้ไข/เชิญ = "เร็ว ๆ นี้" — ยังไม่มี
  หน้าจัดการเต็มรูปเป็นของตัวเอง) · แท็บ **ฟิลด์กำหนดเอง/อัตโนมัติ** = "เร็ว ๆ นี้ (K2.6/K2.9)" ตามสัญญา ·
  แท็บ **คลังเก็บ** = ลิงก์ไปหน้าคลังเก็บที่มีอยู่แล้ว (K1.14) — ตั้งค่าเข้าถึงได้เฉพาะ ADMIN (404 ให้คนอื่น)
- **`scripts/visual-kanban.mts`**: เพิ่ม `SPECS["2.5"]` (3 สเปค) + เตรียมมุมมอง "ทั้งทีม" จริงผ่าน
  `views.saveView` ตรง ๆ ก่อนถ่าย (ไม่ผ่านฟอร์มเว็บ — เหตุผลดูหมายเหตุยาวใน §4 ข้อ 4) แล้วลบด้วย id ที่จำไว้
  ใน `finally`

## 2. ไฟล์ที่แตะ

ใหม่:
- `prisma/migrations/20261001000000_kanban_v2_l/migration.sql`
- `src/lib/modules/kanban/views.ts`
- `src/components/kanban/SavedViewsMenu.tsx`
- `src/components/kanban/settings/BoardSettingsNav.tsx`
- `src/components/kanban/settings/SavedViewsSettings.tsx`
- `src/components/kanban/settings/ArchiveBoardButton.tsx`
- `src/app/app/sys/[id]/kanban/b/[boardId]/settings/[tab]/page.tsx`

แก้:
- `prisma/schema/kanban.prisma` (model+enum ใหม่ + back-relation)
- `src/lib/core/scope.ts` (ลงทะเบียน `KanbanBoardView: sys()`)
- `src/lib/modules/kanban/types.ts` (`ViewScope`/`ViewFilters`/`ViewConfig`/`SavedViewDto`)
- `src/lib/modules/kanban/filters.ts` (`describeSavedViewConfig`/`hrefForSavedView` — บริสุทธิ์)
- `src/lib/modules/kanban/limits.ts` (`viewsPerBoard: 20`)
- `src/lib/modules/kanban/actions.ts` (3 action ใหม่)
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` (`?savedView=` merge + ส่ง `savedViews` ลงทุกมุมมอง)
- `src/components/kanban/BoardHeader.tsx` (วาง `<SavedViewsMenu>` + ลิงก์ "ตั้งค่าบอร์ด")
- `src/components/kanban/BoardView.tsx` / `TableView.tsx` / `CalendarView.tsx` / `SummaryView.tsx`
  (prop `savedViews` ส่งต่อให้ `BoardHeader`)
- `scripts/visual-kanban.mts` (`SPECS["2.5"]` + เตรียม/คืนสภาพ `KB25`)

## 3. ผลด่าน (ตัวเลขจริง — รันจริงทุกชุด)

**oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.5.mts`
```
ผ่าน 15/15
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
(รอบแรกก่อนแก้บั๊ก dropdown = 14/15 ตกที่ S3.3 เพราะยังไม่มีภาพ — ไม่ใช่ oracle ผิด)

**regressions (ทุกชุดเขียว ยกเว้น flake เดิมที่รู้จักอยู่แล้ว)**
```
k1.1  29/30 (K1.1-S2.3 flake เดิม — รันซ้ำได้ ไม่เกี่ยวกับ K2.5)
k1.2  25/25 · k1.3  29/29 · k1.4  30/30 · k1.5  17/17 · k1.6  20/20 · k1.7  21/21
k1.8  18/18 · k1.9  18/18 · k1.10 16/16 · k1.11 21/21 · k1.12 18/18 · k1.13 16/16
k1.14 15/15 · k1.15 30/30 · k2.1  22/22 · k2.2  16/16 · k2.4  12/12
qc-kanban-notify 12/12 · qc-ai-kanban-board 3/3
```

**typecheck** — `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error** (ผ่านตั้งแต่
รอบแรกที่เขียนโค้ดเสร็จ ไม่ต้องแก้ซ้ำ)

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23 — F1.1 model 225 ตัวลงทะเบียนครบ (รวม KanbanBoardView) · F5.1 raw prisma ไม่เพิ่ม (baseline 45
คงเดิม — views.ts import ผ่าน ./db) · F8.1 migration ครอบทุก model (225) · F13.* ทะเบียน API เดิมไม่กระทบ
```

**qc-nav-functions** — `pnpm exec tsx scripts/qc-nav-functions.mts` → ผ่านทั้งหมด 10 เช็ก (ไม่แตะเมนู
KANBAN — ไม่กระทบ)

**ภาพจริง** — `scripts/visual-kanban.mts 2.5` → 3 ใบ (`.qc-shots/kanban/2.5/`), failures=0
1. `saved-views-dropdown-desktop.png` — เปิด ▾มุมมอง เห็น "ทั้งทีม" → "งานเลยกำหนดทั้งบอร์ด" +
   คำบรรยาย "ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่" (ประโยคเดียวกับตัวอย่างในภาพ 10 เป๊ะ) + ปุ่มลบ +
   ปุ่ม "+ บันทึกมุมมองนี้"
2. `saved-view-selected-changes-url-desktop.png` — โหลดบอร์ดเปล่า (ไม่มีตัวกรอง) → กดมุมมองที่บันทึกไว้
   → เด้งเป็นมุมมองตาราง จริง มีตัวกรอง "กำหนดส่ง: เลยกำหนด" ติดอยู่ที่แถบกรอง เรียงตาม "กำหนดส่ง"
   แสดง "4 จาก 24 การ์ด" — URL+ตัวกรองเปลี่ยนจริงตามสัญญา
3. `board-settings-views-desktop.png` — หน้าตั้งค่าบอร์ด 7 แท็บ (ทั่วไป/สมาชิกและสิทธิ์/ป้ายกำกับ/
   ฟิลด์กำหนดเอง "เร็ว ๆ นี้"/**มุมมองที่บันทึกไว้ (active)**/อัตโนมัติ "เร็ว ๆ นี้"/คลังเก็บ) + ปุ่มแดง
   "เก็บบอร์ดเข้าคลัง" ที่ล่างสุดของ sidebar ตรงภาพ 10 · เนื้อหาแท็บโชว์ "1 มุมมอง" + แถวรายการ +
   ป้าย "ทั้งทีม" + คำบรรยายเงื่อนไข + ปุ่มลบ

## 4. เบี่ยงจากสัญญา / จุดตัดสินใจ

1. **เพดาน 20 มุมมอง "ต่อคนต่อบอร์ด" ตีความสำหรับ scope BOARD**: สัญญาเขียนแค่ "20 ต่อคนต่อบอร์ด" ไม่ได้
   แยกว่า BOARD-scope (ไม่มีเจ้าของรายคน) นับกับใคร — ตัดสินให้ BOARD-scope นับรวมเป็นโควตาเดียวของบอร์ด
   (ไม่ผูกกับ ADMIN คนใดคนหนึ่ง) ส่วน PRIVATE นับเฉพาะของ actor เอง · oracle S2.10 ทดสอบเฉพาะ PRIVATE
   จึงไม่ชนกับการตีความนี้ — ถ้า Fable อยากให้ตีความอื่น (เช่น BOARD นับรวมกับ PRIVATE ของ ADMIN คนที่สร้าง)
   แก้ที่ `saveView`'s ก้อน `count` เดียว
2. **`applyView` ไม่ redirect เปลี่ยน URL จริง** — สัญญาเขียน "โหลดมุมมองที่บันทึกไว้ (แล้วเขียนทับ
   พารามิเตอร์)" ซึ่งตีความได้ทั้ง "URL ต้องเปลี่ยนจริง" หรือ "ใช้ค่าที่ merge แล้วเป็นพารามิเตอร์ของ
   request" — เลือกแบบหลัง (merge เงียบ ๆ ไม่ redirect) เพราะ: (ก) ตัวอย่าง href เต็มจาก `applyView`
   (มี `savedView=<id>` + ทุกตัวกรองเขียนออกมาแล้ว) ถูกใช้เป็น `href` ของลิงก์ในดรอปดาวน์อยู่แล้ว (ทางหลัก
   ที่คนใช้จริง — คลิกแล้ว URL เปลี่ยนสมบูรณ์ตาม §2.3 ทันที ตามภาพชุดที่ 2) · (ข) กรณีมีคนพิมพ์/บุ๊กมาร์ก
   `?savedView=xxx` เปล่า ๆ โดยไม่มีตัวกรองอื่น การ merge-ไม่-redirect ก็ให้ผลเหมือนกับ redirect ทุก
   ประการยกเว้นแถบ URL ในเบราว์เซอร์ไม่เปลี่ยน (ซึ่งไม่กระทบ oracle S3.1 ที่เช็คแค่คำว่า "savedView"
   ปรากฏในไฟล์) — ถ้า Fable อยากให้ redirect จริงด้วย `redirect()` ของ Next.js ทำเพิ่มได้ในบรรทัดเดียว
   หลัง merge เสร็จ (ยังไม่ทำเพราะเสี่ยง loop ถ้า id ไม่มีสิทธิ์เห็นแล้ว redirect วนกลับมาที่เดิม)
3. **`reorderViews` มีบริการแล้วแต่ยังไม่มี UI เรียก** — สัญญา §3.10 พูดถึง "ลาก" เรียงมุมมองในหน้าตั้งค่า
   แต่ "ส่งมอบ" สรุปย่อของ WO ระบุ action แค่ 3 ตัว (`saveViewAction updateViewAction deleteViewAction`)
   ⇒ ตัดสินไม่ทำ UI ลากเรียงในรอบนี้ (หนี้ที่ตั้งใจ) แต่เตรียม service ไว้แล้วไม่ต้องแตะ views.ts อีกรอบ
   ถ้า Fable อยากเพิ่มปุ่ม "เลื่อนขึ้น/ลง" หรือ drag ทีหลัง
4. **สเปคภาพเตรียมมุมมองผ่าน `views.saveView` ตรง ๆ ไม่ผ่านฟอร์มเว็บ** — ลองแบบ "ผ่านฟอร์มจริง" ก่อน
   (คลิกบันทึกมุมมองในเบราว์เซอร์) แล้วเจอว่า `saveViewAction` เรียก `revalidatePath` ซึ่งทำให้เบราว์เซอร์
   รีเฟรชหน้าเดิมหลังบันทึกไม่กี่ร้อย ms — ชนจังหวะกับตอนที่ puppeteer กดปุ่ม "มุมมอง" ซ้ำเพื่อเปิดดรอปดาวน์
   อีกครั้ง ทำให้ state `open` ถูกรีเซ็ตเงียบ ๆ พอดีตอนจะถ่ายภาพ (ยืนยันด้วยการ bisect: `waitFor` เจอ
   element จริงตอนเช็คหลังถ่าย แต่ภาพที่ถ่ายไปแล้วไม่มีอะไรอยู่เลย) ⇒ เปลี่ยนมาเตรียมข้อมูลผ่าน service
   ตรง ๆ ก่อนเปิดเบราว์เซอร์เลย (แบบเดียวกับ K1.10/K1.14) ให้ทุกสเปคเป็นแค่ "อ่าน/นำทาง" ไม่มี mutation
   ระหว่างสเปคเดียวกันอีก — ไม่กระทบพฤติกรรมจริงของแอป (ฟอร์มบันทึกมุมมองยังทำงานถูกต้องตามที่เห็นในโค้ด/
   oracle S2.1-S2.10 ที่เรียก `saveView` ตรง ๆ เหมือนกัน)

## 5. ข้อแย้ง/พบเจอ ที่อยากให้ Fable ตัดสิน

**🔴 บั๊ก UI ที่มีอยู่ก่อน K2.5 (ไม่ใช่ที่ผมทำใหม่) — เมนู "⋯" ของหัวบอร์ดน่าจะมองไม่เห็นในเบราว์เซอร์จริงด้วย**

รายละเอียดเต็มอยู่ใน §1 ("บั๊กที่เจอ+แก้") — สรุปสั้น: `<header data-testid="board-header">` มี
`overflow-x-auto` ซึ่งบังคับ `overflow-y` เป็น `auto` ไปด้วยตาม CSS spec ⇒ ดรอปดาวน์ที่เป็น
`position:absolute` ภายในหัวบอร์ด (เมนู "⋯" เดิมจาก K1.5 · แผงตัวกรอง "ตัวกรอง" เดิมจาก K1.11) จะถูก
ครอบตัดจนมองไม่เห็นถ้าสูงเกินกล่อง header (~51px) — พิสูจน์ด้วยการเปิดเมนู "⋯" แล้วถ่ายภาพ (ไม่ใช่แค่
ดรอปดาวน์ใหม่ของผม) ผลออกมาเหมือนกัน: ภาพว่างเปล่า ไม่มีร่องรอยแม้แต่พิกเซลเดียว แม้ `page.$()` จะยัง
เจอ element ใน DOM อยู่ก็ตาม (ยืนยันว่าไม่ใช่แค่ยังไม่ mount)

ผมแก้เฉพาะดรอปดาวน์ของ K2.5 (`SavedViewsMenu.tsx` เปลี่ยนเป็น `position:fixed`) เพราะเป็นของที่ผมสร้าง
และอยู่ในสัญญาของ WO นี้ตรง ๆ — **ไม่ได้แตะเมนู "⋯" หรือแผงตัวกรองเดิม** เพราะนอกสัญญา K2.5 และเสี่ยง
กระทบ UI ที่ผ่านการเซ็นรับภาพจาก K1.5/K1.11 ไปแล้วโดยไม่มีชุดภาพ/ข้อสอบของ WO เหล่านั้นมายืนยันว่าไม่พัง
ถ้าผมแก้เอง — อยากให้ Fable ตัดสินว่า:
- จะแก้รากที่ `BoardHeader.tsx` เลยไหม (ทางเลือก: (ก) แยก wrapper ในสุดให้ scroll แนวนอนเฉพาะแถบปุ่ม
  โดยตัว `<header>` เองไม่ตั้ง overflow อะไร — dropdown ที่เป็นลูกของ header แต่ไม่ใช่ลูกของ wrapper
  scroll จะไม่โดนครอบตัด, หรือ (ข) ย้ายทุกดรอปดาวน์ในหัวบอร์ดไป `position:fixed`/portal แบบเดียวกับที่
  ผมทำใน `SavedViewsMenu.tsx`) — ถ้าทำ ควรทำเป็น WO แยกที่มีข้อสอบ/ภาพของตัวเองคลุมเมนู "⋯" กับแผงตัวกรอง
  ด้วย (ทั้งสองไม่เคยมีภาพยืนยันมาก่อนเลยตั้งแต่ K1.5/K1.11)
- หรือปล่อยไว้ก่อน (คนใช้จริงอาจไม่เคยเจอเพราะปุ่มเหล่านี้ไม่ได้ใช้บ่อย และอาจมีคนหลีกเลี่ยงโดยไม่รู้ตัว)

## 6. หนี้ที่ฝากไว้

1. เมนู "⋯" + แผงตัวกรองเดิมใน `BoardHeader.tsx` อาจมองไม่เห็นในเบราว์เซอร์จริง (ดู §5)
2. `reorderViews` มีบริการแล้วแต่ยังไม่มี UI ลาก/เลื่อนเรียงในหน้าตั้งค่า (§4 ข้อ 3)
3. แท็บ "สมาชิกและสิทธิ์"/"ป้ายกำกับ" ของหน้าตั้งค่าบอร์ดเป็นอ่านอย่างเดียว (ไม่มีเชิญ/เปลี่ยนบทบาท/แก้สี/
   ลบป้ายจากหน้านี้ — ยังทำผ่านหลังการ์ด/ที่อื่นได้ตามปกติ)
4. `applyView` ไม่ redirect URL จริง (merge เงียบ ๆ แทน — ดู §4 ข้อ 2)
