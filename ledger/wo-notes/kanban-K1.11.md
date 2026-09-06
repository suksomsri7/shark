# K1.11 — ตัวกรอง + ค้นหาข้ามบอร์ด (filters + search palette) · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.11 · oracle `scripts/qc-kanban-k1.11.mts` (21 ข้อ · ไม่แตะ) · ภาพ `scripts/visual-kanban.mts 1.11` (สเปคใหม่ 2 รายการ → 4 ใบ) · มาตรฐาน `ledger/design-kanban/02-board.png` บล็อก `.fbar` (แถบตัวกรอง)

## ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/kanban/filters.ts` — ตรรกะ**บริสุทธิ์**ทั้งหมด (ไม่แตะ prisma/`./db`/`./access` เลย): `parseSearchQuery` · `filterBoardCards` · `hasAnyFilter` · `boardFiltersFromParams` · `dueBucketOf` · ชนิด `BoardFilters`/`DueBucket`/`CardStatus`/`FilterableCard`/`SearchCardDto`/… — ไฟล์นี้คือสิ่งที่ client component (`BoardView.tsx`/`FilterBar.tsx`/`SearchPalette.tsx`) import ได้อย่างปลอดภัย
- `src/lib/modules/kanban/search.ts` — **server-only**: `searchCards(ctx, actor, filters)` ยิง DB ข้ามบอร์ด (`visibleBoardsWhere`) + re-export ทุกอย่างจาก `filters.ts` ให้ oracle เรียกจากพาธเดียว `@/lib/modules/kanban/search` ได้ครบตามสัญญา (ดู deviation ข้อ 1 — เหตุผลที่ต้องแยกไฟล์)
- `src/components/kanban/FilterBar.tsx` — แถบ "กรองอยู่:" ใต้หัวบอร์ด (testid `filter-bar` `filter-count` `filter-clear`) · อ่าน `filters` จาก prop (นับ) + `useSearchParams`/`useRouter` เอง (ลบทีละพารามิเตอร์/ล้างทั้งหมด)
- `src/components/kanban/SearchPalette.tsx` — ค้นหาข้ามบอร์ด เปิดด้วยปุ่ม `search-open` หรือ Ctrl/⌘ K (testid `search-palette` `search-input` `search-result`) · debounce 250ms → `searchCardsAction` · จัดกลุ่มตามบอร์ด · ↑/↓/Enter/Esc

**แก้**
- `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` — parse `searchParams` (`assignee/label/due/status/q`) ผ่าน `boardFiltersFromParams` → ส่งเป็น prop `filters` ให้ `BoardView` (server → client ตามสัญญา)
- `src/components/kanban/BoardView.tsx` — คำนวณ `filteredColumns`/`totalCardCount`/`visibleCardCount` ด้วย `filterBoardCards` (client-side ต่อยอด state ที่โหลดมาแล้ว ไม่ยิง DB ซ้ำ) · เรนเดอร์ `<FilterBar/>` ใต้หัวบอร์ด · แทนที่กองคอลัมน์ด้วย empty state "ไม่มีการ์ดตรงกับตัวกรอง" + ปุ่มล้าง เมื่อกรองแล้วไม่เจอ
- `src/components/kanban/BoardHeader.tsx` — เปิดใช้ปุ่ม "ตัวกรอง" เดิม (เคยปิด disabled) เป็นตัวเปิดแผงเลือกด่วน (ผู้รับผิดชอบ/ป้าย/กำหนดส่ง/สถานะ — คลิก = เขียน URL param, คลิกซ้ำ = ปลด) + pill นับจำนวนตัวกรองที่ทำงานอยู่ · เพิ่มปุ่ม `<SearchPalette>` (มองเห็นทุกขนาดจอ ไม่ผูก `lg:` เหมือนปุ่มอื่น — มือถือค้นหาได้ด้วย)
- `src/lib/modules/kanban/ui.tsx` (`KanbanBoardsSection` — หน้ารวมบอร์ดเดิมก่อน K1.12) — ใส่ `<SearchPalette>` ใน `actions` ของ `Section` (ปุ่มค้นหาที่ "หน้ารวมบอร์ด" ตามสัญญา "ปุ่มค้นหาในหัวบอร์ด/หน้ารวมบอร์ด")
- `src/lib/modules/kanban/actions.ts` — `searchCardsAction({systemId, text?, take?, cursor?})` (แปลง `parseSearchQuery` ที่ server แล้วเรียก `searchCards`) — เกตด้วย `canReadKanban` (ไม่ใช่ `assertKanbanCan("kanban.board.read")` ตรง ๆ — ดู deviation ข้อ 2)
- `scripts/visual-kanban.mts` — เพิ่มสเปค `"1.11"` (ไม่แตะสเปคเดิม): `board-filtered` (`?label=ด่วน&status=open`) + `search-palette-sea-fox` (คลิกปุ่มค้นหา → พิมพ์ "Sea Fox")

## Function map

### `filters.ts` (บริสุทธิ์)
| ฟังก์ชัน | หมายเหตุ |
|---|---|
| `parseSearchQuery(text) → BoardFilters` | ตัดคำด้วย `\s+` · คำสงวนไทย/อังกฤษคู่กัน (`เลยกำหนด`/`overdue` ฯลฯ) · `ป้าย:x`/`label:x` · `บอร์ด:x`/`board:x` · `@ฉัน`/`@me` → `assignee:"me"` · ตัวสุดท้ายชนะในแกนเดียวกัน (ประมวลซ้ายไปขวา ทับค่าเดิม) · คำที่เหลือรวมเป็น `q` |
| `filterBoardCards(cards, filters, {now, userId}) → T[]` | generic `<T extends FilterableCard>` กันได้ทั้ง `KanbanCard` ดิบของ Prisma (raw `labels: string[]` + `assigneeUserId`) และ `BoardCardDto` ฝั่ง client (`labels: {name}[]` + `assignees: {userId}[]`) โดยไม่ต้อง cast · `label` = ชื่อป้ายตรงตัว · `assignee` เช็คทั้ง `assigneeUserId` ∪ `assignees[]` · `q` ค้นชื่อ+รายละเอียด (ไม่สนตัวพิมพ์) |
| `dueBucketOf(card, nowMs) → DueBucket \| null` | ลำดับ: `completedAt` ไม่ null → ไม่มีทางเป็น overdue → วันเดียวกัน (เวลาไทย UTC+7) = `today` → อยู่ในสัปดาห์ปฏิทินไทย (จันทร์–อาทิตย์) ที่เหลือ = `week` → นอกนั้น `null` |
| `hasAnyFilter` / `boardFiltersFromParams` | ใช้ตัดสิน "มีตัวกรองทำงานอยู่ไหม" และแปลง `searchParams` ดิบ → `BoardFilters` (ค่าไม่ตรง enum ถูกทิ้งเงียบกันลิงก์พัง) |

### `search.ts` (server-only)
| ฟังก์ชัน | หมายเหตุ |
|---|---|
| `searchCards(ctx, actor, filters & {take?,cursor?}) → {items, nextCursor?, total}` | boards จำกัดด้วย `visibleBoardsWhere(actor)` (+ `board:` contains ชื่อบอร์ด) · `q` แมตช์ title/description **และชื่อป้าย** ผ่าน join `cardLabels→label` (ดู deviation ข้อ 3) · `due` แปลงเป็นช่วงเวลาจริงด้วยสูตรเดียวกับ `dueBucketOf` (`dueRangeWhere`) · cursor = base64(`{createdAt, id}`) แบบ keyset เรียง `createdAt asc, id asc` |

## Deviation (เหตุผลที่ทำต่างจากตัวอักษรตรง ๆ)

1. **แยก `filters.ts` ออกจาก `search.ts`** — สัญญาเขียนว่าทั้งสามฟังก์ชันอยู่ "service `search.ts`" ไฟล์เดียว ตอนแรกเขียนรวมไฟล์เดียวจริงตามนั้น (มี `searchCards` ใช้ `await import("./db")` แบบ dynamic คิดว่าเลี่ยงได้) แต่ตอน `bash scripts/acc-v2-serve.sh` (production build) **ล้มจริง**: Turbopack ลาก `search.ts` (ผ่าน `db.ts`→`pg`→`@prisma/adapter-pg`) เข้าบันเดิลฝั่ง browser ทันทีที่ `BoardView.tsx` (client) import ชื่อใดก็ได้จากไฟล์เดียวกัน แม้ `import()` จะเป็น dynamic และอยู่ในฟังก์ชันที่ client ไม่เคยเรียกก็ตาม (import trace ยืนยันชัดเจน — Turbopack เดินตามทั้งกราฟตอนสร้าง client chunk ไม่ใช่แค่ named export ที่ถูกใช้จริง) ⇒ แก้โดยย้ายส่วนบริสุทธิ์ทั้งหมดไป `filters.ts` (ไม่มี import ใด ๆ เลยสักบรรทัด) ให้ client import ตรง ๆ จากที่นั่น ส่วน `search.ts` เหลือแค่ `searchCards` + re-export ให้ oracle ยังเรียกผ่าน `@/lib/modules/kanban/search` ได้ครบสามฟังก์ชันตามสัญญา (`search.parseSearchQuery`/`search.filterBoardCards`/`search.searchCards` ใช้ได้เหมือนเดิมทุกจุด) — เห็นผลจริงจาก build ที่ผ่านหลังแก้ (ดูบรรทัดคำสั่งด้านล่าง)
2. **`searchCardsAction` เกตด้วย `canReadKanban(actor)` ไม่ใช่ `assertKanbanCan(auth,"kanban.board.read")`** — actions อื่นในไฟล์ (เช่น `listBoardActivityAction`) ยังใช้ `assertKanbanCan(auth,"kanban.board.read")` ตรง ๆ ซึ่งไม่มีคีย์ backward-compat "มี `kanban.*` ตัวไหนก็ได้ = read" ของ `canReadKanban` (K1.3) — พนักงาน QC ทั้ง 3 คน (thana/pook/kitti) มีแค่ `kanban.card.create/update/move` + `kanban.board.create` ไม่มี `kanban.board.read` ตรง ๆ ⇒ ถ้าใช้ `assertKanbanCan` ตรง ๆ คนกลุ่มนี้จะกดปุ่มค้นหาไม่ได้ทั้งที่เข้าหน้าบอร์ดได้ปกติ (หน้าบอร์ดเองก็เช็คด้วย `canReadKanban`) เลยเลือกใช้ตัวเดียวกับหน้าบอร์ดเพื่อความสม่ำเสมอ — เป็น deviation เฉพาะไฟล์ใหม่นี้ ไม่ได้แก้ actions เดิม (นอกสโคป WO)
3. **`searchCards`'s `q` แมตช์ชื่อป้ายด้วย (นอกจาก title/description)** — สัญญาระบุ `filterBoardCards`'s `q` ว่า "ค้นชื่อ+รายละเอียด" เท่านั้น แต่ oracle S3.4 (`'บอร์ด:ซ่อม ด่วน'` → ต้องเจอการ์ด "คอมเพรสเซอร์เสียงดังผิดปกติ" ที่ชื่อไม่มีคำว่า "ด่วน" เลย มีแต่ **ป้าย** ชื่อ "ด่วน") พิสูจน์ว่า `searchCards` (ข้ามบอร์ด) ต้องกว้างกว่า `filterBoardCards` (บอร์ดเดียว) ตรงจุดนี้ — เพิ่ม join `cardLabels→label.name contains q` เป็นเงื่อนไข OR ที่สาม เฉพาะใน `searchCards` เท่านั้น `filterBoardCards` (ฝั่ง client/บอร์ดเดียว) ยังคง title+description ตามสัญญาเป๊ะ
4. **ไม่ทำ `assignee=none` (การ์ดยังไม่มอบหมาย)** — บลูปรินต์ §11.8 พูดถึงไว้ แต่สัญญา URL ของ K1.11 ที่ปักไว้ตรง ๆ ระบุแค่ `assignee=me|<userId>` ไม่มี `none` และ oracle ไม่มีข้อทดสอบ — เว้นไว้เป็นส่วนขยายในอนาคต (ง่ายจะเพิ่มทีหลัง: `filters.assignee === "none"` → เงื่อนไข `assigneeUserId: null AND assignees: none`)
5. **ไม่ทำ `#123` (ค้นด้วยเลขการ์ด) ใน `parseSearchQuery`** — บลูปรินต์ §11.9 มีไว้ แต่ไม่อยู่ในรายการคำสงวนที่สัญญา K1.11 ปักตายตัว (`@ฉัน` `ป้าย:x` `เลยกำหนด` `วันนี้` `สัปดาห์นี้` `ไม่กำหนด` `เสร็จ` `บอร์ด:ชื่อ`) และ oracle ไม่ทดสอบ — พิมพ์ `#123` วันนี้จะกลายเป็นคำค้นธรรมดา (ไม่ error แต่ก็ไม่แมตช์ cardNo ตรง ๆ) เว้นไว้เป็นส่วนขยาย
6. **แผงเลือกด่วนใน `BoardHeader.tsx`** (ผู้รับผิดชอบ/ป้าย/กำหนดส่ง/สถานะ) — ไม่ได้ระบุไว้ตรง ๆ ในสัญญา (สัญญาพูดถึงแค่ `FilterBar` แสดง+ลบ+ล้าง) แต่ mockup 02 วาดปุ่ม "ตัวกรอง" มี pill ตัวเลขและดูคลิกได้ ถ้าปล่อยปุ่มไว้เฉย ๆ โดยไม่มีทางตั้งตัวกรองใหม่เลย (นอกจากพิมพ์ URL เองหรือผ่าน SearchPalette) ผู้ใช้จริงจะงงว่ากดแล้วทำไมไม่มีอะไรเกิดขึ้น — เพิ่มแผงเล็ก ๆ ให้ครบวงจร ใช้พารามิเตอร์ URL ชุดเดียวกับ `FilterBar` เป๊ะ (ไม่มี state ซ้อน)

## Verify — ภาพจริง (เปิดดูเองทีละใบ · เทียบ mockup 02 บล็อกแถบตัวกรอง)

`bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-kanban.mts 1.11` → `.qc-shots/kanban/1.11/`

- `board-filtered-desktop.png` — URL `?label=ด่วน&status=open`: แถบ "กรองอยู่:" ใต้หัวบอร์ด มีชิป "ป้าย: ด่วน ×" + "สถานะ: ยังไม่เสร็จ ×" (กรอบ/ตัวอักษรสีฟ้า accent) + "แสดง 3 จาก 24 การ์ด" + ลิงก์ "ล้างตัวกรอง" + ข้อความจาง "ลิงก์นี้แชร์ตัวกรองให้ทีมได้" ชิดขวา — **ตรงโครง `.fbar` ของ mockup 02 ทุกจุด** · ปุ่ม "ตัวกรอง" บนหัวบอร์ดมี pill เลข "2" ตรงกับจำนวนแกนที่ทำงานอยู่ · เหลือ 2 การ์ดในกล่องงานเข้า + 1 ในรอทำ (คอลัมน์อื่นว่างแต่ยังโชว์กรอบคอลัมน์ปกติ ไม่ได้ซ่อนคอลัมน์)
- `board-filtered-mobile.png` (390px) — แถบตัวกรองห่อบรรทัดสวย ชิปไม่ล้นจอ อ่านครบ
- `search-palette-sea-fox-desktop.png` — โมดัลกลางจอ ช่องพิมพ์ "Sea Fox" + แถวคำใบ้ไวยากรณ์ 5 ชิป (`@ฉัน` `ป้าย:ด่วน` `เลยกำหนด` `วันนี้` `บอร์ด:ชื่อ`) + ผลลัพธ์จัดกลุ่มตามชื่อบอร์ด: "งานร้าน — สาขาป่าตอง" (2 ใบ: #7, #9) แล้ว "ซ่อมบำรุงอุปกรณ์" (1 ใบ: #5) ตรงกับ oracle S3.1 เป๊ะ (3 ใบ) · แถวแรกไฮไลต์สีฟ้า (ค่าเริ่มต้น `highlight=0`) · แต่ละแถวมี `#เลขการ์ด` + ชื่อ + คอลัมน์ + วันครบกำหนด + ป้าย
- `search-palette-sea-fox-mobile.png` — โมดัลเต็มความกว้างจอ อ่านครบไม่ล้น เหมือนกันกับเดสก์ท็อปทุกประการ
- ทั้ง 4 ใบ: `failures: 0` (ไม่มี console error / selector หาย)

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… SESSION_SECRET=…   (grep|cut บรรทัดเดียว · ตรวจ host = ep-plain-art ก่อน)
pnpm exec prisma migrate deploy → No pending migrations to apply. (WO นี้ไม่มี schema เปลี่ยน)
pnpm exec tsx scripts/seed-kanban-qc.mts → ✅ seed บอร์ดงาน: … บอร์ด 3 · การ์ด 38

pnpm exec tsx scripts/qc-kanban-k1.11.mts
  → ผ่าน 20/21 · FINDINGS: CRITICAL 0 · MAJOR 1 · MINOR 0
  → JSON_SUMMARY {"total":21,"passed":20,"findings":["K1.11-S2.4"]}

regressions:
  k1.1  {"total":30,"passed":30,"findings":[]}   k1.2  {"total":25,"passed":25,"findings":[]}
  k1.3  {"total":29,"passed":29,"findings":[]}   k1.4  {"total":30,"passed":30,"findings":[]}
  k1.5  {"total":17,"passed":17,"findings":[]}   k1.6  {"total":20,"passed":20,"findings":[]}
  k1.7  {"total":21,"passed":21,"findings":[]}   k1.8  {"total":18,"passed":18,"findings":[]}
  k1.9  {"total":18,"passed":18,"findings":[]}   k1.10 {"total":16,"passed":16,"findings":[]}
  qc-kanban-notify   → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → EXIT=0 (ไม่มี error)
pnpm exec tsx scripts/fitness.mts (ไม่ export env) → ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

bash scripts/acc-v2-serve.sh → (รอบแรกล้มเพราะ deviation #1 · รอบสองผ่านหลังแยก filters.ts)
pnpm exec tsx scripts/visual-kanban.mts 1.11
  → JSON_SUMMARY {"wo":"1.11","user":"owner","shots":[…4 ใบ…],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว
```

## ⚠️ Finding ที่รายงาน (ไม่แก้ oracle — ตามกติกา run นี้)

### K1.11-S2.4 — `due=none` คาด 6 ได้จริง 7 (MAJOR ไม่ใช่ CRITICAL)

นับเองจากบอร์ด "งานร้าน — สาขาป่าตอง" (`scripts/seed-kanban-qc.mts` บรรทัด 94-125) — การ์ดที่**ไม่มี** `due:` ในสเปคเลย (`dueAt = null`) มี **7** ใบ ไม่ใช่ 6:

1. "แจ้งซ่อม: ไฟใต้น้ำห้องล้างอุปกรณ์ดับ 2 ดวง" (กล่องงานเข้า)
2. "ตอบรีวิว Google 3 ดาวของคุณสมหญิง" (กล่องงานเข้า)
3. "เช็คสต็อกตะกั่ว + ชุดเว็ทสูท M ก่อนสั่งเพิ่ม" (รอทำ)
4. "อบรมพนักงานใหม่ 2 คน — ระบบ SHARK POS" (รอทำ)
5. "ทำป้ายราคาคอร์สใหม่ติดหน้าร้าน" (รอทำ)
6. "รอผู้จัดการอนุมัติซื้อคอมเพรสเซอร์ตัวใหม่" (รอตรวจ)
7. "รีวิวสัญญาเช่าห้องเก็บอุปกรณ์" (รอตรวจ)

ไม่มีใบไหนถูก `completedAt` (อยู่คนละคอลัมน์กับ "เสร็จแล้ว") จึงไม่มีเหตุผลให้ตกไปกลุ่มอื่น `filterBoardCards({due:"none"})` คืน 7 ใบนี้ตรงตามชื่อ (ไม่มีกำหนดส่ง) — ตรวจซ้ำด้วยสคริปต์ debug ชั่วคราว (ลบแล้ว) ยืนยันตัวเลขจาก DB จริงตรงกับที่นับจากซอร์สโค้ด seed พอดี คาดว่าคอมเมนต์ "(6)" ในไฟล์ oracle เป็นการนับผิดตอนเขียนสเปค (ทำนองเดียวกับ K1.1/K1.4 ที่ oracle เคยผิดมาก่อนในบันทึกเหตุการณ์ของ run นี้) — ขอให้ Fable ตรวจแล้วแก้ comment/ตัวเลขคาดหวังในไฟล์ oracle เป็น 7

### หมายเหตุ (ไม่ใช่บั๊ก) — K1.11-S3.3 ผ่านได้เพราะเวลาจริงยังไม่ถึงวันที่อ้างของชุดข้อมูล

`searchCards` ไม่มีพารามิเตอร์ `now` (ตามสัญญา — เป็นคิวรีสดใช้ `Date.now()` จริงเสมอ ต่างจาก `filterBoardCards`) ส่วน `KQC.today = "2026-09-30"` เป็นวันที่ในอนาคตเมื่อเทียบกับวันที่รันจริง (6 ก.ย. 2026) — แปลว่าทุกวันนี้ (ก่อน 30 ก.ย.) การ์ดในชุดข้อมูล QC **ยังไม่มีใบไหนเลยกำหนดจริง ๆ ตามเวลาจริง** เพราะทุก `dueAt` คำนวณเป็นออฟเซตจากวันที่ 30 ก.ย. ⇒ `K1.11-S3.3` ("kitti เลยกำหนด = 0") ผ่านถูกต้องในทางปฏิบัติ **แต่โดยบังเอิญ** (ตรวจยืนยันด้วยสคริปต์ debug: ถ้าปลอมเวลาให้ตรงกับ `KQC.today` จริง จะพบว่า kitti มี **2** ใบเลยกำหนดในบอร์ด "ซ่อมบำรุงอุปกรณ์" คอลัมน์ "เสร็จ" ที่ไม่เคยถูกตั้ง `isDoneColumn=true` — "เปลี่ยนแบตเตอรี่คอมพิวเตอร์ดำน้ำ 5 เครื่อง" (due -3) และ "ล้างถังอากาศประจำปี ชุด A" (due -12)) — สอดคล้องกับ `KQC.oracleValidUntil: "2026-10-31"` ที่ Fable ตั้งไว้แล้วว่าข้อสอบชุดนี้มีอายุ ไม่ใช่บั๊กของ `searchCards` แต่เป็นข้อจำกัดโดยธรรมชาติของการทดสอบฟังก์ชันที่ใช้เวลาจริงคู่กับชุดข้อมูลที่ผูกกับวันที่ในอนาคต — **แจ้งไว้เผื่อ Fable รัน oracle นี้ซ้ำหลัง 30 ก.ย. 2026 แล้วเห็น S3.3 เปลี่ยนไปเป็นค้างที่อื่น (ไม่ใช่ 0 เสมอไปแล้ว)**

## จุดที่อยากให้ Fable ลองแหย่

- **แผงเลือกด่วนใน `BoardHeader.tsx` เป็นแบบ single-select ต่อแกน** (คลิกป้ายอื่นแทนที่ป้ายเดิม ไม่ใช่เลือกได้หลายป้ายพร้อมกัน) — ตรงกับ URL param เดี่ยว `label=<ชื่อ>` ตามสัญญา (ไม่รองรับหลายค่าคั่นด้วย comma) ถ้าอยากได้ "ป้ายใดป้ายหนึ่งใน 3" ต้องขยาย `BoardFilters.label` เป็น array ก่อน (งานคนละ WO)
- **`searchCards`'s cursor อิง `createdAt` ไม่ใช่ `updatedAt`** — การ์ดที่เพิ่งแก้ไข (ไม่ใช่เพิ่งสร้าง) จะไม่ขยับตำแหน่งในหน้า pagination ถือว่าปกติ (คนละความหมายกับ "ล่าสุด") แต่ถ้ามีคนถามหา sort อื่น (เช่น "แก้ล่าสุดก่อน") ต้องเพิ่ม index ใหม่
- **`assignee=none` (ยังไม่มอบหมาย) ยังไม่ทำ** — ดู deviation ข้อ 4 · ถ้าอยากได้ ทำได้ในสโคปเล็ก (เพิ่ม branch เดียวใน `filterBoardCards`/`dueRangeWhere`) ไม่กระทบของเดิม
- **การพิมพ์ `#123` ใน SearchPalette ยังไม่ค้นด้วยเลขการ์ดตรง ๆ** — ดู deviation ข้อ 5 · ตอนนี้ตกไปเป็นคำค้นอิสระ ถ้าชื่อการ์ดไม่มีคำว่า "#123" ก็จะไม่เจอ (Trello ทำแบบนี้ได้เพราะมี full index เลขการ์ด) — เพิ่มได้ง่ายถ้าอยากได้ก่อน P2
- **`FilterBar`/แผงเลือกด่วนยังไม่มีตัวเลือก "ผู้รับผิดชอบ" ที่เป็น "ยังไม่มอบหมาย"** เหมือนข้อด้านบน — คนละจุด UI แต่ root cause เดียวกัน
- **ลอง**: เปิด `?assignee=xxx-ไม่มีจริง` (userId มั่ว) — `FilterBar` ควรโชว์ชิป "ผู้รับผิดชอบ: xxx-ไม่มีจริง" (ตกกลับไปโชว์ id ดิบเพราะหาไม่เจอใน `board.members`) ไม่ error แต่ก็ไม่สวย — ถ้าอยากให้พังแบบสวยกว่านี้ (ซ่อนชิปเมื่อหา owner ไม่เจอ) ทำได้ในไฟล์เดียว
