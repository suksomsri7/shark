# K1.5 — ลากวางเดสก์ท็อป + หน้าบอร์ดใหม่ (client component ตัวแรกของโมดูล)

> ผู้ทำ: Opus (builder) · 6 ก.ย. 2026 · worktree `shark-kanban` · branch `session/kanban` (ไม่ commit — ทิ้ง tree ไว้ให้ Fable ตรวจ)
> แบบที่ยึด: `ledger/design-kanban/02-board.png` + `_kb.part`/`_base.part` · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §3.2 · สัญญา `ledger/KANBAN-RUN.md` §K1.5

## สรุปผลด่าน (บรรทัดสุดท้ายจริง)

| ด่าน | ผล |
|---|---|
| `pnpm exec tsx scripts/qc-kanban-k1.5.mts` | `ผ่าน 17/17` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":17,"passed":17,"findings":[]}` |
| `scripts/visual-kanban.mts 1.5` | ทุกหน้า HTTP 200 · testid ครบ · console error 0 · `JSON_SUMMARY {"wo":"1.5","user":"owner","shots":[…10 ใบ…],"failures":0}` |
| `qc-kanban-k1.1` | `ผ่าน 30/30` · `JSON_SUMMARY {"total":30,"passed":30,"findings":[]}` |
| `qc-kanban-k1.2` | `ผ่าน 25/25` · `JSON_SUMMARY {"total":25,"passed":25,"findings":[]}` |
| `qc-kanban-k1.3` | `ผ่าน 29/29` · `JSON_SUMMARY {"total":29,"passed":29,"findings":[]}` |
| `qc-kanban-k1.4` | `ผ่าน 30/30` · `JSON_SUMMARY {"total":30,"passed":30,"findings":[]}` |
| `qc-kanban-notify` | `QC Kanban Notify: 12/12 ผ่าน` · `✅ เขียวหมด` |
| `qc-ai-kanban-board` | `ผ่าน 3/3` · `JSON_SUMMARY {"total":3,"passed":3,"findings":[]}` |
| `pnpm typecheck` | 0 error (ไม่มีบรรทัดออก · exit 0) |
| `pnpm fitness` 2 โหมด | `ผ่าน 20/20` และ (`env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET`) `ผ่าน 20/20` |

## คำสั่งที่รัน (ตามลำดับจริง)

```bash
pnpm exec tsc --noEmit                                   # ก่อน build (กัน build ตกเพราะ type)
pnpm exec tsx scripts/qc-kanban-k1.5.mts
bash scripts/acc-v2-serve.sh                             # production build บน .env.qc :3215 (2 รอบ: ก่อน/หลังแก้หัวบอร์ดมือถือ)
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
pnpm exec tsx scripts/visual-kanban.mts 1.5
pnpm exec tsx scripts/pending/probe-kanban-k1.5-wip.mts   # โพรบ WIP เต็ม → rollback + toast (ของ builder · ไม่ใช่ด่าน CI)
pnpm exec tsx scripts/visual-kanban.mts path /app/sys/<sys>            # สโมกหน้าอื่น ๆ
pnpm exec tsx scripts/visual-kanban.mts path /app/u/patong
pnpm exec tsx scripts/visual-kanban.mts path /app/kb
pnpm exec tsx scripts/visual-kanban.mts path /app/sys/<sys>/kanban/<boardId>   # ลิงก์เก่า → เด้งเข้าหน้าใหม่
bash scripts/acc-v2-serve.sh stop                        # ปิดก่อน typecheck/fitness (เครื่อง 2 คอร์)
pnpm exec tsc --noEmit ; pnpm exec tsx scripts/qc-kanban-k1.{1,2,3,4}.mts ; … ; pnpm fitness
```

## ไฟล์

**ใหม่**
| ไฟล์ | สาระ |
|---|---|
| `src/components/kanban/BoardView.tsx` | client component หลัก — state ของบอร์ด · ลากการ์ด/คอลัมน์ด้วย pointer events · optimistic + rollback + toast · เพิ่มการ์ด · ปุ่มลัด `Shift+←/→` · แผ่นหลังการ์ดชั่วคราว (`?card=`) |
| `src/components/kanban/Column.tsx` | คอลัมน์ 240px `<section data-testid="column">` — หัวคอลัมน์ (ชื่อแก้ในที่ · จำนวน · ชิป WIP · `+` · `⋯`) · กองการ์ด + เส้นวาง · ช่องเพิ่มการ์ด |
| `src/components/kanban/Card.tsx` | การ์ด `<article data-testid="card">` — ปก/ชิปที่มา/ชื่อ/ป้าย/ป้ายกำหนดส่ง 4 โทน/ตราเช็คลิสต์-ไฟล์-ความเห็น/รูปคน + `dueBadgeOf()` `Avatar` `tagColorVar()` |
| `src/components/kanban/BoardHeader.tsx` | `<header data-testid="board-header">` — ‹ · ชื่อ (ADMIN แก้ในที่) · ดาว · ชิปสาขา/การมองเห็น · สวิตช์มุมมอง 5 · ตัวกรอง/อัตโนมัติ (ปิด) · รูปทีม + เชิญ · `⋯` |
| `src/components/kanban/KanbanIcon.tsx` | สไปรต์ 44 ไอคอน — path **คัดคำต่อคำ** จาก `_base.part`/`_kb.part` (สคริปต์ดึง ไม่พิมพ์เอง) |
| `src/components/app-shell/NavRail.tsx` | รางไอคอน 56px + `isRailPath(pathname)` (ตัวตัดสินที่เดียวของทั้งแอป) |
| `src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx` | หน้าบอร์ดใหม่ (server) — `requireTenant` → `canReadKanban` → `getBoardView` → `notFound()` เมื่อ `KanbanNotFoundError` |
| `scripts/pending/probe-kanban-k1.5-wip.mts` | โพรบของ builder: ตั้ง wipLimit ชั่วคราว → ลากจริง → ถ่ายภาพ toast/เด้งกลับ → **คืนค่าใน finally** |

**แก้**
| ไฟล์ | สาระ |
|---|---|
| `src/lib/modules/kanban/types.ts` | + DTO ของหน้าบอร์ด (`BoardViewDto` `BoardColumnDto` `BoardCardDto` `BoardLabelDto` `BoardPersonDto` `KanbanTagColor`) — ไม่มี Date/Prisma model (ข้าม RSC ได้) |
| `src/lib/modules/kanban/service.ts` | + `getBoardView(ctx, actor, boardId)` (ผ่าน `getBoardFor` → ป้าย/ผู้รับ/สาขา/ดาว/สมาชิก ใน 6 query ขนาน) · `toBoardCardDto()` · `tagColorAt()` · re-export ชนิด DTO |
| `src/lib/modules/kanban/actions.ts` | action ของหน้าบอร์ดเปลี่ยนมารับ **object** (type-safe จาก client): `moveCardAction` `moveColumnAction` `renameColumnAction` `setColumnWipAction` `setColumnDoneAction` `moveAllCardsAction` `archiveColumnAction` `createCardAction`(คืน DTO) `renameBoardAction` + ใหม่ `starBoardAction` · ตัวห่อ FormData ให้หน้าเดิม: `createCardFormAction` `archiveColumnFormAction` · `boardPath()` ชี้ `/kanban/b/` |
| `src/lib/modules/kanban/ui.tsx` | หน้าเดิมใช้ตัวห่อ FormData + ลิงก์ทุกจุดชี้ `/kanban/b/{id}` (งานของฉัน/รายการบอร์ด) |
| `src/app/app/sys/[id]/kanban/[boardId]/page.tsx` | เหลือ `redirect()` ไปหน้าใหม่ (คง `?card=` ไปด้วย) |
| `src/components/app-shell/AppShell.tsx` | `railMode = isRailPath(pathname)` → เรนเดอร์ `<NavRail>` แทน drawer ปักซ้าย (โมดูลอื่นไม่แตะ) |
| `src/components/app-shell/AppMain.tsx` | หน้าบอร์ด = `px-0 pb-0 pt-14 lg:pl-14` (เต็มจอ + เว้นซ้ายเท่าราง) |
| `src/app/globals.css` | + โทเคน `--color-stage:#f4f5f7` `--color-kb-column:#eceef1` `--color-due-{soon,late,done}-bg` |

## โครง DOM + testid (ต้องคงไว้ — harness ภาพนับด้วย `:nth-of-type`)

```
<main>                                   ← AppMain (pt-14 · lg:pl-14 = ใต้ topbar + ข้างรางไอคอน)
 └ div  (เวที · h=100dvh-3.5rem · bg --color-stage)
    ├ <header data-testid="board-header">…</header>
    ├ div.board-columns (flex · gap 12 · padding 12/20/18 · overflow-x auto)
    │   ├ <section data-testid="column" data-column-id>       ×5   ← element เดียวกันทั้งแถว (nth-of-type ตรง)
    │   │   ├ div  หัวคอลัมน์ (ชื่อ · จำนวน · ชิป WIP · + · ⋯)
    │   │   ├ div  กองการ์ด  (overflow-y auto · gap 7)
    │   │   │   ├ <div data-testid="drop-indicator">          0-1 ใบ (เป็น div → ไม่ชนการนับ article)
    │   │   │   └ <article data-testid="card" data-card-id>   ×n
    │   │   └ <button data-testid="add-card">  หรือ  "คอลัมน์เต็ม — ปิดงานก่อน"
    │   └ <button>  เพิ่มคอลัมน์ (คนละ tag กับคอลัมน์ → ไม่ชนการนับ section)
    ├ div  การ์ดที่ยกอยู่ (fixed · pointer-events none · rotate 2.4°)
    ├ <aside data-testid="card-back-placeholder">  (K1.6 จะแทนที่)
    └ div  toast  <div data-testid="board-toast">
```

🔴 กติกาที่ต้องไม่ลืมตอนทำ K1.6+: **คอลัมน์ต้องเป็น `<section>` ล้วนในกองเดียว · การ์ดต้องเป็น `<article>` ล้วนในกองเดียว** ถ้าเอา element ชนิดเดียวกันไปแทรก (เช่น ทำเส้นวางเป็น `<article>`) selector `:nth-of-type` ของ harness จะเลื่อนไปทั้งชุดโดยไม่มีอะไรฟ้อง

## อัลกอริทึมลากวาง

**เริ่มลาก** (`onPointerDown` บนการ์ด · ข้ามเมื่อคลิกโดน `button/a/input/textarea/select`)
- เมาส์: ขยับเกิน **4px** = ยกการ์ด (ต่ำกว่านั้นถือเป็นคลิกเปิดการ์ด)
- นิ้ว/ปากกา: **กดค้าง 300ms** ถึงยก · ถ้าเลื่อนเกิน 12px ก่อนครบเวลา = ยกเลิก (คนกำลังเลื่อนจอ)
- ฟัง `pointermove/up/cancel` ที่ `window` (ไม่ใช้ `setPointerCapture` เพราะการ์ดต้นทางถูกถอดออกจาก DOM ระหว่างลาก — capture จะหลุดเอง)

**ระหว่างลาก**
- การ์ดต้นฉบับถูกถอดออกจากกอง แล้วแทนด้วย **เส้นวาง** (กล่องประน้ำเงิน `--color-accent` บนพื้น `--color-out`) สูงเท่าการ์ดที่ยก · ใบที่ลอยตามเมาส์เป็น `<Card ghost>` (เอียง 2.4° + เงา ตาม `.kc.drag` ของแบบ)
- **หาคอลัมน์**: วน `columnEls` เทียบ `x` กับกรอบคอลัมน์ (เผื่อ ±8px) · ออกนอกแถว = คงตำแหน่งเดิมไว้ (ไม่กระโดด)
- **หา index**: วนการ์ดของคอลัมน์นั้น (ตัดใบที่ยกออก) หาใบแรกที่ `y < กึ่งกลางใบ` → index นั้น · ไม่เจอ = ต่อท้าย
- 🔴 **ชดเชยเส้นวาง**: ถ้าเส้นวางอยู่ในคอลัมน์นี้แล้วที่ index `k` การ์ดตั้งแต่ `k` ลงไปถูกดันลง `เส้นวาง.height + gap(7px)` ⇒ ลบออกก่อนเทียบกึ่งกลาง ไม่งั้น index จะสั่นสลับไปมา (เส้นโผล่→ดันการ์ด→เงื่อนไขพลิก→เส้นหาย→…) เป็นวงจรกระพริบ
- 🔴 `CARD_GAP = 7` ใน BoardView **ต้องเท่ากับ** `gap` ของกองการ์ดใน Column.tsx

**ปล่อย**
- เพื่อนบ้าน = `afterCardId = list[index-1]` · `beforeCardId = list[index]` (จาก state ที่ตัดใบที่ยกออกแล้ว) — ส่งแค่ **id** ไม่ส่ง position (คีย์ fractional คิดใน tx ของ `moves.ts` ที่ล็อกคอลัมน์แล้วเท่านั้น)
- ตำแหน่งเดิมเป๊ะ (คอลัมน์เดิม + index เดิม) = ไม่ยิง action
- `draggedAt` กัน `click` ที่ตามหลัง `pointerup` ไม่ให้เปิดหลังการ์ดโดยไม่ตั้งใจ (250ms)

**คีย์บอร์ด** — `Shift+←/→` บนการ์ดที่โฟกัส = ย้ายไปท้ายคอลัมน์ซ้าย/ขวา (เดินทาง `moveCardTo` เส้นเดียวกับการลาก) · `Enter`/`Space` = เปิดการ์ด

**ลากคอลัมน์** — จับที่หัวคอลัมน์ (ข้ามปุ่ม/ช่องพิมพ์) · สลับลำดับสด ๆ ใน state ตอนลอยผ่าน · ปล่อยแล้วยิง `moveColumnAction({beforeColumnId, afterColumnId})` · ล้มเหลว = คืนลำดับเดิม + toast

## optimistic / rollback

1. `snapshot = columnsRef.current` (อาเรย์เดิม ไม่ได้ก๊อปลึก — เก็บ reference ไว้ทั้งชุด)
2. เขียน state ใหม่ทันที (`cloneWithCardMoved`) → จอขยับก่อน server ตอบ
3. `startTransition(async () => moveCardAction(...))`
4. `{ok:true}` → `patchCard(position)` (รับคีย์จริงหลัง rebalance กลับมาเก็บ)
   `{ok:false}` → `setCols(snapshot)` + toast ไทย:
   - `WIP_LIMIT` → **"คอลัมน์นี้เต็มแล้ว (จำกัด n งาน) — ย้ายงานอื่นออกก่อน"**
   - `CARD_ARCHIVED` → **"การ์ดนี้ถูกเก็บเข้าคลังไปแล้ว"**
   - อื่น ๆ/ขว้าง (403/404/เน็ตล่ม) → **"ย้ายการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง"**
   ทุกข้อความบอก "เกิดอะไรกับงาน + ทำอะไรต่อ" ไม่โทษคนกด
5. คำสั่งอื่น (เปลี่ยนชื่อคอลัมน์/บอร์ด · WIP · ธงเสร็จ · ย้ายทั้งคอลัมน์ · เก็บคอลัมน์ · ดาว) ใช้แพตเทิร์นเดียวกันทุกตัว

🔴 **สถานะเป็นของ client หลัง mount** — ตั้งใจไม่ sync จาก props ที่ server ส่งมาใหม่ (action ยัง `revalidatePath` ตามเดิมเพื่อให้หน้าอื่น/การโหลดครั้งหน้าได้ของสด) ถ้าวันหน้าเพิ่ม realtime (K1.14) ให้ merge ที่จุดเดียวนี้ ไม่ใช่ทับทั้งก้อนระหว่างมีการลากค้างอยู่

## รางไอคอน 56px

- `isRailPath(pathname) = /^\/app\/sys\/[^/]+\/kanban\/b\//` — **ตัวตัดสินที่เดียว** ใช้ร่วมกัน 2 ที่: `AppShell` (เลือกเรนเดอร์ `<NavRail>` แทน `<NavDrawer variant="pinned">`) และ `AppMain` (ระยะขอบ `lg:pl-14` + เต็มจอ)
- รางรับ `items` ชุดเดียวกับ drawer (มาจาก layout ซึ่งอ่าน DB) ⇒ ไม่รู้จักโมดูลไหนเป็นพิเศษ · ไอคอนใช้ `NavIcon` ตัวเดิมของ shell · มี tooltip ทุกปุ่ม
- ปุ่มล่างสุด "กางเมนูเต็ม" ยิง `CustomEvent("app:drawer-open")` ที่ `AppShell` ฟังอยู่แล้ว (ไม่เพิ่มสัญญาข้ามชั้นใหม่) · ปุ่ม ☰ บน topbar ยังใช้ได้เหมือนเดิม
- จอ < lg ไม่มีราง (drawer overlay เหมือนเดิม) · เปิดจากแอป (`inApp`) ไม่มีรางเช่นกัน
- ตรวจแล้วว่าไม่กระทบหน้าอื่น: `/app/sys/<sys>` · `/app/u/patong` · `/app/kb` · `/kanban/boards` · `/kanban/my-tasks` = HTTP 200 + drawer 288px ตามเดิม + console error 0

## ภาพที่เปิดดูจริง (ทุกใบ) และสิ่งที่แก้หลังดู

| ภาพ | เห็นอะไร |
|---|---|
| `board-patong-desktop.png` | ✅ ตรงแบบ 02: รางไอคอน 56px · หัวบอร์ดครบทุกชิ้น · 5 คอลัมน์กว้าง ~234–240px พื้น `#eceef1` บนเวที `#f4f5f7` (วัดพิกเซลจริง: คอลัมน์ = rgb(236,238,241) · เวที = rgb(244,245,247)) · การ์ดมีป้ายสี/ป้ายกำหนดส่ง/รูปคน · ปุ่ม "เพิ่มการ์ด" ท้ายคอลัมน์ · ช่องเพิ่มคอลัมน์ประ |
| `board-patong-dragged-desktop.png` | ✅ การ์ด "ลูกค้าถามคอร์ส Open Water…" ย้ายจากคอลัมน์ 1 ไปอยู่ **ระหว่างใบ 1–2 ของคอลัมน์ 3** จริง · ตัวเลขหัวคอลัมน์อัปเดต (5→4, 3→4) |
| `board-patong-after-reload-desktop.png` | ✅ เหมือนใบก่อนหน้าทุกจุด = ลำดับคงหลังโหลดใหม่ (position ลง DB จริง) |
| `board-patong-mobile.png` | ❌ รอบแรก **หัวบอร์ดดันหน้ากว้าง 983px** ชื่อบอร์ดตัดบรรทัดเป็นแนวตั้ง → **แก้แล้ว** (หัวบอร์ด `overflow-x:auto` · ชื่อ `truncate`+`nowrap` · ชิป/สวิตช์มุมมอง/ปุ่มรอง/รูปทีม ซ่อนต่ำกว่า `lg`) → รอบสอง 390px พอดีจอ เลื่อนคอลัมน์แนวนอนได้ |
| `board-maint-desktop.png` / `-mobile.png` | ✅ บอร์ด TENANT 4 คอลัมน์ · ชิป "ทั้งร้านเห็น" |
| `boards-home-desktop.png` / `-mobile.png` | ✅ หน้ารวมบอร์ดเดิม + drawer 288px (รางไม่ไปโผล่) · ลิงก์เข้าบอร์ดชี้ `/kanban/b/` |
| `my-tasks-desktop.png` / `-mobile.png` | ✅ หน้าเดิมทำงานปกติ (owner ไม่มีงานที่ถูกมอบหมาย → empty state เดิม) |
| `probe-wip-full-desktop.png` | ✅ ชิป WIP แดง **"2/2 เต็ม"** + ท้ายคอลัมน์ "คอลัมน์เต็ม — ปิดงานก่อน" พร้อมไอคอนกุญแจ (ตรงแบบ 02) |
| `probe-wip-rejected-desktop.png` | ✅ ลากเข้าคอลัมน์ที่เต็ม → การ์ดเด้งกลับที่เดิม + toast ดำกลางล่าง **"คอลัมน์นี้เต็มแล้ว (จำกัด 2 งาน) — ย้ายงานอื่นออกก่อน"** · console error 0 |

**แก้จากการดูภาพ 1 อย่าง** = หัวบอร์ดบนมือถือ (ด้านบน) · นอกนั้นตรงแบบตั้งแต่รอบแรก

## จุดที่ "ต่างจากภาพ 02" เพราะข้อมูล ไม่ใช่โค้ด (ตรวจแล้ว ไม่ใช่บั๊ก)
- ไม่มีชิปที่มา (จากแชท LINE/ฟอร์ม/ใบลา) เพราะการ์ด seed เป็น `sourceType=MANUAL` ทุกใบ — โค้ดรองรับครบ 7 ชนิดแล้ว (`SOURCE_LABEL` ใน Card.tsx)
- ไม่มีชิป WIP/คอลัมน์เสร็จบนบอร์ดป่าตอง เพราะ seed ไม่ได้ตั้ง `wipLimit`/`isDoneColumn` (เห็นของจริงได้จากโพรบข้างบน)
- ไม่มีแถบตัวกรอง "แสดง 18 จาก 24 การ์ด" = K1.11 · ไม่มีปกการ์ด = K1.9 · ตราเช็คลิสต์/ไฟล์/ความเห็นยังเป็น 0 = K1.7–K1.9 (การ์ดไม่เรนเดอร์ตราที่เป็น 0 ⇒ ไม่มีตราหลอกตา)
- ป้ายกำหนดส่งของคอลัมน์ "เสร็จแล้ว" เป็นสีแดง "เลย n วัน" ไม่ใช่เขียว "เสร็จ …" เพราะการ์ดยังไม่มี `completedAt` (คอลัมน์นั้นไม่ได้ตั้งธง done) — ตรรกะสีเขียวทำงานเมื่อมี `completedAt` จริง

## ข้อมูล QC ที่เปลี่ยนไป (ต้องบันทึกตามกติกา)
- รัน `visual-kanban.mts 1.5` **2 รอบ** (รอบแรก + รอบยืนยันหลังแก้หัวบอร์ดมือถือ) ⇒ บอร์ด "งานร้าน — สาขาป่าตอง" มีการ์ด **2 ใบ** ถูกลากจริงจากคอลัมน์ "กล่องงานเข้า" ไปไว้ระหว่างใบ 1–2 ของ "กำลังทำ":
  1. "ลูกค้าถามคอร์ส Open Water รอบเสาร์นี้ — ยังไม่ตอบ"
  2. "ขอใบเสนอราคา ทริปกลุ่มบริษัท ABC 12 คน"
  ⇒ ตอนนี้ กล่องงานเข้า 3 · กำลังทำ 5 (รวมทั้งบอร์ดยัง 24 การ์ด/5 คอลัมน์ — ข้อสอบ S5.1 เขียว)
- โพรบ WIP ตั้ง `wipLimit=2` บนคอลัมน์ "กำลังซ่อม" ของบอร์ดซ่อมบำรุงชั่วคราว แล้ว **คืนเป็น null แล้ว** (ยืนยันในเอาต์พุต `คืนค่า wipLimit = null`) · การย้ายที่ถูกปฏิเสธไม่เขียนอะไรลง DB
- session ที่ mint ทุกตัวถูกลบ (`userAgent = qc-visual-kanban` / `qc-visual-kanban-probe`)

## บทเรียน/กับดักที่เจอ (ให้ WO ถัดไปไม่เสียเวลาซ้ำ)
1. **อีโมจิในคอมเมนต์ทำข้อสอบตก** — `qc-kanban-k1.5` S4.4 ห้ามอักขระช่วง U+1F300–U+1FAFF ใน `BoardView/Column/Card` ซึ่งรวม 🔴 ที่ repo นี้ใช้เป็นธรรมเนียม ⇒ ในไฟล์คอมโพเนนต์ของบอร์ดใช้ ⚠️ แทน
2. **วันที่ต้องคิดเอง ห้าม `toLocaleDateString("th-TH")`** — หน้านี้เรนเดอร์ทั้ง server (Node ICU) และ hydrate (Chromium ICU) สตริงไม่ตรงกัน = hydration error = console error = ข้อสอบภาพตก · และ th-TH เป็นปี พ.ศ. ⇒ ใช้ตาราง `TH_MONTH/TH_WDAY` + ออฟเซ็ต +7 ชม. ตายตัว และรับ `now` จาก server ผ่าน DTO (`board.now`) ไม่เรียก `Date.now()` ตอนเรนเดอร์
3. **server action ที่คืนค่า ใช้กับ `<form action={…}>` ไม่ได้** (ต้องคืน `void | Promise<void>`) ⇒ ตัวที่หน้าเดิมยังใช้เป็นฟอร์มต้องมีตัวห่อ `…FormAction` แยก (แพทเทิร์นเดียวกับ `moveCardSidewaysAction` ของ K1.4)
4. **เส้นวางแทรกในกอง = เรขาคณิตขยับ** ต้องชดเชยความสูงก่อนเทียบกึ่งกลาง ไม่งั้น index กระพริบ (อาการ: การ์ดสั่นตอนลากค้างอยู่ระหว่างสองใบ)
5. `createCard()` คืน `null` เมื่อคอลัมน์ถูกเก็บเข้าคลังไปแล้ว (ไม่ throw) — action ต้องแปลงเป็น `{ok:false,message}` ไทย ไม่ใช่ปล่อยพัง

## งานที่จงใจ "ยังไม่ทำ" (ส่งต่อ)
- หลังการ์ดจริง (K1.6) — วันนี้คลิกการ์ดแค่ปัก `?card=<id>` ใน URL (ผ่าน `history.replaceState` ไม่ยิง RSC) + แผ่นขวา "หลังการ์ด — เร็ว ๆ นี้" (`data-testid="card-back-placeholder"`) · หน้า server อ่าน `?card=` ส่งเป็น `initialCardId` ให้แล้ว ⇒ K1.6 เสียบตัวจริงแทน `<aside>` ก้อนเดียว
- ปุ่ม "เชิญ" · เมนู ⋯ ของบอร์ด (ตั้งค่า/ป้าย/คลังเก็บ) · ตัวกรอง · อัตโนมัติ · มุมมอง 4 แบบ = ปิดไว้พร้อม tooltip "เร็ว ๆ นี้" ตาม WO ของมันเอง
- เพิ่มคอลัมน์จากหน้าบอร์ด (ปุ่ม `+` ท้ายแถว) ยัง disabled — `createColumnAction` ยังเป็นฟอร์มของหน้าเดิม (K1.12/K1.14 ค่อยต่อ)
- auto-scroll ตอนลากชิดขอบจอ (ของ optional ใน WO) ยังไม่ทำ — บอร์ด 5 คอลัมน์บน 1440 ไม่ต้องเลื่อน แต่ถ้าบอร์ดกว้างขึ้นควรเติมใน K1.13 พร้อมท่ามือถือ

JSON_SUMMARY {"wo":"K1.5","k1.5":{"total":17,"passed":17,"findings":[]},"visual":{"shots":10,"probeShots":2,"failures":0},"k1.1":30,"k1.2":25,"k1.3":29,"k1.4":30,"notify":12,"aiKanbanBoard":3,"typecheck":0,"fitness":"20/20 ×2","filesNew":8,"filesChanged":8}


## ภาคผนวกโดย Fable (ตรวจรับ 07:21 น.)
- เปิดภาพเอง: `board-patong-desktop` (โครง/สี/ตรา ตรง mockup 02 · ป้าย 6 สี · กำหนดส่งสีตามความหมาย · รางไอคอน) · `board-patong-after-reload` (การ์ด "ขอใบเสนอราคา" อยู่คอลัมน์ 3 จริงหลังโหลดใหม่) · `board-patong-mobile` (คอลัมน์เลื่อนได้ · header ไม่ดันจอ) · `probe-wip-rejected` (ชิป 2/2 เต็ม + toast ไทย)
- รันซ้ำเอง: k1.5 17 · k1.3 29 · k1.2 25 · k1.1 30 · notify 12 · typecheck 0 · fitness 20/20 ×2 (k1.4 ข้ามรอบนี้ — 5 นาที · ผ่านตอน builder รัน)
- หมายเหตุ: กำหนดส่งบนภาพแสดง "30 ก.ย." แทน "วันนี้" เพราะนาฬิกาจริง (6 ก.ย.) ≠ today ของ seed (30 ก.ย.) — ถูกต้องตามข้อมูล · คอลัมน์ "เสร็จแล้ว" ยังไม่ติดธง done ใน seed จึงขึ้นเลยกำหนดสีแดง (จะติดธงใน seed รอบหน้า)
