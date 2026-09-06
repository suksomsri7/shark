# K1.14 — ปุ่มลัด · empty state · realtime · คลังเก็บ · เมนู 7 หมวด (+ เก็บหนี้ UI)

> ผู้ทำ: Opus (builder รอบที่ 2 — รอบแรกถูกฆ่ากลางทางตอนเครื่องรีสตาร์ตเพราะหน่วยความจำหมด)
> สัญญา: `ledger/KANBAN-RUN.md` §K1.14 · ข้อสอบ: `scripts/qc-kanban-k1.14.mts` (ห้ามแตะ)
> แบบ: `docs/modules/13-kanban-v2.md` §5.2 (เมนู) §5.6 (ปุ่มลัด) §5.7 (empty state) · ภาพ `ledger/design-kanban/01,02,03`

---

## 0. สิ่งที่รับช่วงมาจากรอบก่อน

รอบแรกทำงานไปได้ไกลมากแล้ว **ต้นไม้ไฟล์ที่ค้างอยู่คืองานที่ใช้ได้จริง ไม่ใช่ของครึ่ง ๆ กลาง ๆ** — สิ่งแรกที่ทำคือรัน oracle
ดูก่อนว่าอยู่ตรงไหน ไม่ใช่เริ่มใหม่ ผลคือ **15/15 ตั้งแต่ครั้งแรกที่รัน** (ก่อนที่รอบนี้จะแตะโค้ดสักบรรทัด)

สิ่งที่รอบก่อนทำเสร็จแล้ว (ตรวจแล้วว่าถูกและครบ ไม่ได้แก้):
- `Shortcuts.tsx` · `preferences.ts` + หน้า `/app/settings/preferences` + ลิงก์ใน `NavDrawer`
- `realtime.ts` / `useBoardLive.ts` / `/api/realtime/kanban-token` + รีแฟกเตอร์ `realtime/client.ts` ให้แชท-บอร์ดใช้แกนเดียว
- `archive.ts` + หน้า `/kanban/b/{id}/archive` + `ArchivePage.tsx` + ลิงก์จากเมนู ⋯
- `nav.ts` + `KanbanTabs.tsx` + `layout.tsx childrenFor` + ขยาย `qc-nav-functions.mts` ให้ตามไปอ่านทะเบียน
- empty state 6 ข้อความ · `ThaiDatePicker.tsx` + ต่อเข้ากับ `CardBack` · หนี้ UI หน้ารวมบอร์ด 4 ข้อ
- ไมเกรชัน `20260929000000_kanban_v2_k` (คอลัมน์ `User.prefs`) — **ลง QC ไปแล้ว** (ตรวจจาก `information_schema` แล้ว)
- `visual-kanban.mts`: ห่อ cleanup ใน `finally` แล้ว + สเปคชุด 1.14 (11 ภาพ)

สิ่งที่ **รอบนี้** ทำเพิ่ม (ทั้งหมดเป็นของที่รอบก่อนยังไปไม่ถึงหรือทำพลาด — รายละเอียดข้อ 6):
1. แก้ hydration risk ใน `ArchivePage.tsx` (ใช้ `toLocaleString("th-TH")` ผิดกติกา K1.5)
2. `visual-kanban.mts`: แก้ selector มือถือของชุด 1.5 ที่ค้างมาตั้งแต่ K1.13 (แดงปลอม)
3. `visual-kanban.mts`: ใส่ **สมาชิกบอร์ด** ให้ภาพชุด 1.14 (ชุดข้อมูล QC ไม่มีเลย → avatar ไม่มีอะไรให้เรนเดอร์)
4. `visual-kanban.mts`: ใส่ snapshot/restore ให้ชุด **1.5** — เดิมลากการ์ดจริงแล้วไม่คืนสภาพ
5. `scripts/pending/restore-kanban-seed-inbox.mts` — ล้างหนี้ที่ข้อ 4 สะสมไว้ (คอลัมน์แรกเหลือ 0 จาก 5 ใบ)
6. รันด่านทั้งหมด (oracle · regression 17 ชุด · typecheck · fitness · ภาพ 4 ชุด) แล้วดูภาพเทียบ mockup เอง

---

## 1. ไฟล์ที่แตะ

### ไฟล์ใหม่
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/modules/kanban/realtime.ts` | ชื่อช่อง + payload + `publishBoardSignal` (ไม่มีวัน throw) |
| `src/lib/modules/kanban/archive.ts` | `listArchived` · `restoreColumn` |
| `src/lib/modules/kanban/nav.ts` | ทะเบียนเมนู 7 หมวด (ที่เดียว) |
| `src/lib/modules/kanban/preferences.ts` | อ่าน/เขียน `User.prefs` (`kanbanShortcuts`) |
| `src/components/kanban/Shortcuts.tsx` | ตัวฟังคีย์ + หน้ารายการปุ่มลัด (`shortcuts-help`) |
| `src/components/kanban/useBoardLive.ts` | poll 5 วิ + subscribe realtime + หยุดเมื่อแท็บซ่อน |
| `src/components/kanban/ArchivePage.tsx` | หน้าคลังเก็บ (แท็บ/ค้นหา/กู้คืน) |
| `src/components/kanban/KanbanTabs.tsx` | แถบแท็บ 7 หมวด (ป้าย "เร็ว ๆ นี้") |
| `src/components/kanban/ThaiDatePicker.tsx` | ชิปวันไทย + popover ปฏิทิน (หนี้ K1.6/K1.13) |
| `src/components/kanban/ShortcutsPreferenceSwitch.tsx` | สวิตช์ปิดปุ่มลัด |
| `src/app/app/sys/[id]/kanban/b/[boardId]/archive/page.tsx` | หน้าคลัง (server) |
| `src/app/app/settings/preferences/page.tsx` | หน้าการตั้งค่าส่วนตัว |
| `src/app/api/realtime/kanban-token/route.ts` | ออก token ผูก capability ช่องเดียว |
| `prisma/migrations/20260929000000_kanban_v2_k/migration.sql` | `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefs" JSONB NOT NULL DEFAULT '{}'` |
| `scripts/pending/restore-kanban-seed-inbox.mts` | เครื่องมือครั้งเดียว ล้างหนี้ seed (ข้อ 6.4) |

### ไฟล์ที่แก้
`prisma/schema/core.prisma` (User.prefs) · `src/lib/modules/kanban/{actions,cards,moves,labels,comments,checklists,limits,types,service,activity-text,ui}.ts`
· `src/lib/realtime/{client,events,index}.ts` · `src/app/app/layout.tsx` · `src/app/app/sys/[id]/kanban/{boards,my-tasks,b/[boardId]}/page.tsx`
· `src/components/kanban/{BoardView,BoardHeader,BoardsHome,CardBack,MyTasks}.tsx` · `src/components/app-shell/NavDrawer.tsx`
· `scripts/{visual-kanban,qc-nav-functions}.mts` · `ledger/KANBAN-RUN.md`

---

## 2. แผนที่ฟังก์ชัน

```
realtime.ts     kanbanChannel(tenantId, boardId) → "kanban:<t>:<b>"
                boardSignal({type, boardId?, columnId?, cardId?}) → {type, ids…, at}   ← บัญชีขาว ตัดสนามที่ไม่ประกาศทิ้ง
                publishBoardSignal(ctx, boardId, signal) → void                        ← try/catch ครอบทั้งตัว ไม่ throw

archive.ts      listArchived(ctx, boardId, {q?}) → {cards[], columns[]}                ← VIEWER · take 200 (KANBAN_LIMITS.archivePageSize)
                restoreColumn(ctx, columnId) → {ok, boardId}                           ← ADMIN · ท้ายบอร์ด · idempotent

nav.ts          KANBAN_NAV (7 รายการ · status ready|soon)
                kanbanNavChildren(base) → เฉพาะ ready (drawer — ห้ามมี dead link)
                kanbanNavItems(systemId) → ครบ 7 พร้อมสถานะ (แถบแท็บ)

preferences.ts  parsePreferences(raw) · getUserPreferences(userId) · setUserPreferences(userId, patch)  ← patch ไม่เขียนทับทั้งก้อน

actions.ts      listArchivedAction · restoreColumnAction · setKanbanShortcutsAction     ← *Action เท่านั้น (แกนอยู่ไฟล์อื่น)

client (browser) subscribeVia(tokenUrl, events, map, cb)   ← แกนกลางร่วม
                 subscribeChat(systemId, cb)   / subscribeBoard(boardId, cb)
                 useBoardLive(boardId, {paused})
```

---

## 3. ตารางปุ่มลัด (ตามแบบ §5.6 · ตรงกับหน้า `?`)

| ปุ่ม | ทำอะไร | คำสั่งที่ส่งให้ `BoardView` |
|---|---|---|
| `?` | เปิด/ปิดรายการปุ่มลัด | `help` (จัดการใน `Shortcuts.tsx` เอง) |
| `b` | ตัวสลับบอร์ด | `boards` → `router.push(/kanban/boards)` |
| `f` / `x` | เปิดตัวกรอง / ล้างตัวกรอง | `filter` (คลิกปุ่มจริง) / `filter-clear` |
| `n` | สร้างการ์ดใต้การ์ดที่ชี้อยู่ | `new-card` (คลิก `add-card` ของคอลัมน์นั้น) |
| `t` / `d` / `l` | แก้ชื่อ / กำหนดส่ง / ป้าย | `rename-card`/`due`/`labels` → เปิดหลังการ์ดพร้อมแผง |
| `c` | เก็บการ์ดเข้าคลัง | `archive-card` (ผ่าน `swipeArchive` → มี undo) |
| `j` / `k` (และ ↓/↑) | เลื่อนเลือกการ์ดลง/ขึ้น | `card-next` / `card-prev` (ย้ายโฟกัส DOM จริง) |
| `Shift + ←/→` | ย้ายการ์ดที่เลือกข้ามคอลัมน์ | `move-left` / `move-right` |
| `z` | เลิกทำล่าสุด (5 วิ) | `undo` |
| `Ctrl/⌘ + K` | ค้นหาข้ามบอร์ด | `search` |
| `g` แล้ว `i`/`t`/`b` | กล่องงานเข้า / งานของฉัน / บอร์ด | `go-inbox`/`go-my-tasks`/`go-boards` (คอร์ด 1.5 วิ) |
| `Esc` | ปิดหลังการ์ด/แผงที่เปิดอยู่ | `escape` |

**ด่านที่กันไม่ให้ปุ่มลัดขโมยการพิมพ์** (`inTypingContext`):
1. `e.isComposing` **หรือ** `e.keyCode === 229` → ทิ้ง (Safari/Android รุ่นเก่าไม่ตั้ง `isComposing`)
2. `INPUT` / `TEXTAREA` / `SELECT` / `isContentEditable` — ตรวจทั้ง `e.target` **และ** `document.activeElement`
   (บางเบราว์เซอร์ยิง keydown ที่ target เป็น `body` ทั้งที่โฟกัสอยู่ในช่องพิมพ์ตอน IME เปิด)
3. `e.defaultPrevented` → จบทันที (การ์ด/หลังการ์ด/⌘K จัดการไปแล้ว — ไม่งั้น `Shift+←` ย้ายการ์ด 2 ครั้ง)
4. `enabled=false` → **ไม่ผูกตัวฟังเลย** ไม่ใช่ผูกแล้ว `return` ข้างใน
5. ข้อยกเว้น: `Esc` และ `Ctrl/⌘K` ทำงานได้ทุกที่ (แต่ `⌘K` ยังทิ้งเมื่อ IME ประกอบคำอยู่)

---

## 4. ออกแบบ realtime (D13)

```
เซิร์ฟเวอร์: mutation → commit → publishBoardSignal(...)  (นอก $transaction เสมอ · ไม่ await ก็ได้ · ไม่มีวัน throw)
             ↓
   sanitizeSignal (src/lib/realtime/events.ts — บัญชีขาว SAFE_KEYS)
             ↓  Ably (ถ้ามีกุญแจ)
เบราว์เซอร์: subscribeBoard(boardId) ← token จาก /api/realtime/kanban-token (ผ่าน assertBoardRole VIEWER)
             ↓
   useBoardLive → router.refresh()  (debounce 400ms)
```

**หลัก 4 ข้อ**
1. **polling คือทางหลัก · realtime คือตัวเร่ง** — ไม่มี `ABLY_API_KEY` (สภาพ QC/prod วันนี้) ทุกอย่างยังครบผ่านรอบ poll 5 วิ
   และเมื่อ subscribe ติดแล้วก็ **ไม่ปิดรอบ poll ทิ้ง** แค่ยืดเป็น 60 วิ (ผู้ให้บริการหลุดกลางทาง จอจะไม่ค้างถาวร)
2. **หลัง commit เท่านั้น** — ยิงใน tx แล้ว tx rollback = ทุกจอรีเฟรชไปเห็นของที่ไม่มีจริง · และถ้ามันโยน error
   งานที่บันทึกสำเร็จจะถูกรายงานว่า "ไม่สำเร็จ" → ผู้ใช้กดซ้ำ → ของซ้ำ (บทเรียนเดียวกับ `sendReplyAction` 1 ก.ย.)
3. **ไม่ส่งเนื้อหางานออกนอกบ้าน** — payload เป็น id/enum ล้วน กรอง 2 ชั้น (ประกอบด้วยบัญชีขาวใน `boardSignal`
   แล้วกรองซ้ำที่ขอบใน `sanitizeSignal`) · ผู้ให้บริการรู้ได้แค่ "บอร์ดไหนขยับเมื่อไหร่"
4. **ชื่อช่องมี tenantId เสมอ** + token ผูก capability `subscribe` ช่องเดียว + ต้องผ่าน `assertBoardRole` ก่อนออก token
   (บอร์ดที่มองไม่เห็น = 404 ไม่ใช่ 403) — "boardId เดาไม่ได้" ไม่ใช่ระบบสิทธิ์

**จุดที่เรียก `publishBoardSignal` (10 จุด)**: `moves.moveCard` · `moves.moveColumn`/`archiveColumn` · `cards.updateCardFields` ·
`cards.archiveCard` · `cards.restoreCard` · `cards.setCardAssignees` · `labels.setCardLabels` · `comments` · `checklists` · `archive.restoreColumn`

**พักการรีเฟรชเมื่อ**: กำลังลากการ์ด/คอลัมน์ · เปิดหลังการ์ดอยู่ · แท็บถูกซ่อน (กลับมาเห็นแท็บ = ดึงทันที ไม่รอครบรอบ)

---

## 5. เมนู 7 หมวด · คลังเก็บ · empty state

- **เมนู**: `nav.ts` เป็นทะเบียนเดียว · `layout.tsx childrenFor("KANBAN")` ใส่เฉพาะ `ready` (drawer เป็นลิงก์ล้วน —
  ลิงก์ที่กดแล้ว 404 คือ dead link ที่ `qc-nav-functions.mts` ห้าม) · `KanbanTabs` โชว์ครบ 7 โดยหมวด `soon`
  จางลง + ป้าย "เร็ว ๆ นี้" + กดไม่ได้ · ขยาย `qc-nav-functions.mts` ให้ตามไปอ่านทะเบียน (ไม่งั้นด่าน dead link
  จะมองไม่เห็นลิงก์ของบอร์ดงานเลยสักเส้น = ข้อสอบวัดอะไรไม่ได้)
- **คลังเก็บ**: อ่าน = VIEWER · กู้คืนการ์ด = EDITOR · กู้คืนคอลัมน์ = ADMIN (D16) · ค้นหายิงกลับเซิร์ฟเวอร์
  (หน้าดึงมาแค่ 200 แถวแรก — กรองในเครื่องจะ "หาไม่เจอ" ของนอก 200 แถวแบบเงียบ ๆ ซึ่งแย่กว่าไม่มีช่องค้นหา)
  · กู้คืนคอลัมน์ไป **ท้ายบอร์ด** ไม่ใช่ตำแหน่งเดิม (ระหว่างอยู่ในคลังคนอื่นสลับคอลัมน์ไปแล้ว)
- **empty state 6 อัน** (ข้อความตรง §5.7 · ทุกอันมีปุ่มขั้นต่อไปตามที่แบบกำหนด):
  ยังไม่มีบอร์ด → เลือกเทมเพลต/สร้างเปล่า · บอร์ดนี้ยังว่าง → + เพิ่มการ์ด · ลากการ์ดมาวางที่นี่ (เส้นประในคอลัมน์ว่าง) ·
  ไม่มีการ์ดตรงกับตัวกรอง → ล้างตัวกรอง · วันนี้ไม่มีงานค้าง 🎉 → ดูบอร์ดทั้งหมด · ยังไม่มีการ์ดที่เก็บเข้าคลัง

---

## 6. Deviation / เรื่องที่ตัดสินใจเอง

1. **สวิตช์ปุ่มลัดอยู่ `/app/settings/preferences` ไม่ใช่ `/app/settings`** — โปรเจกต์นี้ไม่มีหน้า `src/app/app/settings/page.tsx`
   (settings เป็นกลุ่ม sub-route ล้วน) จึงทำหน้าใหม่ + **เพิ่มลิงก์ใน `NavDrawer`** ทันที (บทเรียน 29 ส.ค.:
   `/app/settings/webhooks` เป็นหน้ากำพร้าอยู่หลายเดือนเพราะไม่มีใครลิงก์ถึง) · oracle S1.3 ผ่านทาง `preferences.ts`

2. **`User.prefs` เป็นตารางระดับแพลตฟอร์ม (axis global) ไม่ผูก tenant** — ตั้งใจ: การปิดปุ่มลัดคือเรื่อง "การเข้าถึงได้"
   ของ **คน** ไม่ใช่ของร้าน · คนเดียวเปิด 3 ร้านต้องปิดครั้งเดียวจบ · ไมเกรชันเป็น `ADD COLUMN IF NOT EXISTS`
   ที่มี DEFAULT คงที่ ⇒ PostgreSQL 11+ ไม่ rewrite ตาราง ไม่ล็อกยาวบน prod

3. **`boardSignal().at` เป็น ISO string แต่บนสาย Ably กลายเป็น epoch ms** — `sanitizeSignal` เดิม (ของแชท) บังคับ
   `at` เป็น `number` ⇒ สตริงถูกทิ้งแล้วประทับ `Date.now()` แทน ต่างกันไม่ถึงมิลลิวินาที (publish ต่อจาก
   สร้าง signal ทันที) และ `useBoardLive` ไม่ได้ใช้ `at` เลย · **ไม่แก้ sanitizer** เพราะจะกระทบสัญญาเดิมของแชท ·
   ข้อสอบ S3.3 ตรวจที่ `boardSignal()` ตรง ๆ จึงยังตรงตามสัญญา (`typeof at === "string"`)

4. **`restoreColumn` บันทึกกิจกรรมเป็น `COLUMN_UPDATED` + ธง `restored: true`** ไม่ใช่ชนิดใหม่ `COLUMN_RESTORED`
   (การเพิ่มค่า enum = ไมเกรชันที่ P1 ไม่ต้องการ) · `activity-text.ts` อ่านธงแล้วเขียนประโยค "กู้คืนคอลัมน์ …"

5. **รีแฟกเตอร์ `src/lib/realtime/client.ts`** ให้แชทกับบอร์ดใช้แกน `subscribeVia` ร่วมกัน (แทนที่จะก๊อปทั้งก้อน)
   — `subscribeChat` คง URL/events/การแมปเดิมทุกตัวอักษร · ⚠️ **ไม่มีข้อสอบชุดไหนครอบไฟล์นี้** (grep แล้ว)
   ⇒ ขอให้ Fable แหย่จุดนี้ (ดูข้อ 8)

6. **ตัวกรองหน่วยธุรกิจบนหน้ารวมบอร์ดกรองฝั่ง client** (ไม่ยิงคำขอใหม่) — จำนวนบอร์ดต่อ system เป็นหลักสิบ
   ไม่ใช่หลักหมื่น · กรองไม่เจอมี empty state + ปุ่ม "ล้างตัวกรอง" ของตัวเอง

7. **หน้าคลังเก็บไม่มีแถบแท็บ 7 หมวด** — มันเป็นหน้าลูกของบอร์ดใบหนึ่ง (เหมือนหน้าบอร์ดที่ก็ไม่มี) ไม่ใช่หมวดของโมดูล

---

## 7. หนี้ที่ล้าง + บั๊กที่เจอเองรอบนี้

### 7.1 หนี้ UI ตามใบสั่ง (เห็นในภาพแล้วทั้ง 3 ข้อ)
- **ชิปวันไทย** แทน `datetime-local` บนหลังการ์ด: `อา. 11 ต.ค. 2569 · 18:00 น.` + popover ปฏิทินไทย
  (หัวเดือน "ต.ค. 2569" · หัวคอลัมน์ อา–ส · ช่องชั่วโมง:นาที · ปุ่มลัด วันนี้/พรุ่งนี้/สัปดาห์หน้า · "ไม่กำหนด" · "เสร็จสิ้น")
  คำนวณ UTC+7 เองล้วน **ห้าม Intl** (บทเรียน K1.5 hydration mismatch)
- **หน้ารวมบอร์ด** ตรง mockup 01: แถบสีซ้ายเต็มความสูง (แทนแถบบน) · avatar สมาชิกวงกลมซ้อนกัน 3 + "+N" ·
  การ์ดเส้นประ "สร้างบอร์ดใหม่" ท้ายแถวติดดาว · dropdown "หน่วยธุรกิจ: ทั้งหมด"
- **`visual-kanban.mts` ห่อ cleanup ใน `finally`** + ห่อ `try/catch` ของตัวเองอีกชั้น (คืนสภาพไม่ได้ต้องรายงาน ไม่ใช่กลืนเงียบ)

### 7.2 🔴 บั๊กที่เจอเองรอบนี้ (4 ข้อ — ไม่มีอยู่ในใบสั่ง)

**(1) `ArchivePage.tsx` ใช้ `toLocaleString("th-TH")` — เสี่ยง hydration mismatch**
แถวชุดแรกเรนเดอร์จากเซิร์ฟเวอร์ (`initial`) แล้วเบราว์เซอร์ hydrate ทับ · ICU ของ Node กับของเบราว์เซอร์ให้สตริงไม่เท่ากัน
เป็นข้อห้ามที่เขียนไว้ชัดในหัว `Card.tsx`/`ThaiDatePicker.tsx`/`CardBack.tsx` อยู่แล้ว → เปลี่ยนไปใช้ `formatCardDateTime`
ตัวเดียวกับที่โมดูลใช้ทั้งหมด · ยืนยันจากภาพหลัง build ใหม่: `6 ก.ย. 2569 15:23` → `อา. 6 ก.ย. 2569 · 15:30`

**(2) ชุดภาพ 1.5 แดงปลอมบนมือถือมาตั้งแต่ K1.13**
`expect: ["[data-testid=column]"]` แต่มือถือเรนเดอร์ `MobileBoard.tsx` (testid `mobile-column`) ตั้งแต่ K1.13
→ เปิดภาพดูแล้วจอถูกต้องทุกอย่าง เป็น selector ที่ค้าง → แยกสเปคเป็น desktop/mobile คนละ expect
**แดงปลอมอันตรายกว่าไม่ตรวจ** — คนอ่านจะเริ่มมองข้ามสีแดงของชุดนี้

**(3) 🔴 ชุดข้อมูล QC ไม่มีแถว `KanbanBoardMember` เลยสักบอร์ด (0 แถว ทั้ง 11 บอร์ด)**
เจ้าของ/ผู้จัดการเห็นบอร์ดจาก "บทบาทในร้าน" ไม่ใช่จากการเป็นสมาชิกบอร์ด ⇒ **avatar สมาชิกไม่มีอะไรให้เรนเดอร์**
และ "ภาพว่าง" จะถูกอ่านผิดว่า "ยังไม่ได้ทำ" (ตอนแรกผมเองก็เกือบสรุปแบบนั้น) → ใส่สมาชิกจริงผ่าน `members.addMember`
ในตัวเตรียมของชุด 1.14 แล้วถอดคืนใน `finally` (ลบแถว `MEMBER_ADDED` ที่เกิดด้วย ไม่ให้ข้อสอบ K1.10 นับเกิน)
**หมายเหตุถึง Fable: ควรเพิ่มสมาชิกลงใน `seed-kanban-qc.mts` ตอนเปิด P2** — หนี้ประเภทเดียวกับ `isDoneColumn` ของ K1.13

**(4) 🔴 สเปคภาพ `board-patong-dragged` (WO 1.5) ทำชุดข้อมูล QC เสียหายสะสมมาตลอด**
มันลากการ์ดใบแรกของคอลัมน์ 1 ไปคอลัมน์ 3 **จริง** แล้วไม่เคยคืนสภาพ ⇒ ถ่ายภาพชุด 1.5 หนึ่งครั้ง = การ์ดหายจาก
คอลัมน์แรกถาวร 1 ใบ · ตรวจ DB วันนี้: `กล่องงานเข้า` เหลือ **0 จาก 5** (สะสม 5 รอบ · จำนวนรวมยังครบ 24 ใบ
จึงไม่มีข้อสอบไหนจับได้) → แก้ 2 ชั้น:
- ล้างหนี้: `scripts/pending/restore-kanban-seed-inbox.mts` (ย้ายกลับผ่าน `moves.moveCard` ตามลำดับใน seed)
- กันไม่ให้เกิดอีก: ขยาย snapshot/restore ของ K1.13 ให้ครอบ WO 1.5 ด้วย **และคืน `position` ด้วยไม่ใช่แค่ `columnId`**
  (ลากแล้วลำดับในคอลัมน์เปลี่ยน ไม่คืนจะเพี้ยนสะสมเงียบ ๆ แบบเดียวกัน)
- ยืนยัน: รันชุด 1.5 ซ้ำ → `🧹 คืนสภาพ K1.5: คืนการ์ดที่เปลี่ยนระหว่างถ่าย 1 ใบ` · คอลัมน์กลับเป็น 5/6/3/3/7 เป๊ะ

---

## 8. จุดที่อยากให้ Fable ลองแหย่

1. **แชทยังทำงานเหมือนเดิมไหมหลังรีแฟกเตอร์ `realtime/client.ts`** (deviation ข้อ 5) — ไม่มีข้อสอบชุดไหนครอบไฟล์นี้
   typecheck ผ่านและ URL/events/การแมปเหมือนเดิมทุกตัวอักษร แต่เป็นไฟล์ที่แชท prod พึ่งอยู่ · อยากให้เปิดกล่องแชทจริงบน QC server
2. **ปุ่มลัดชนกับการพิมพ์ไทยจริง ๆ ไหม** — เปิดหลังการ์ด พิมพ์ชื่อการ์ดที่มีตัว `d`/`c`/`n`/`t` ด้วยแป้นไทย
   (โดยเฉพาะขณะ IME กำลังประกอบคำ) แล้วดูว่ามีแผงไหนเด้งขึ้นมาขโมยโฟกัสไหม · แล้วลองปิดสวิตช์แล้วกดซ้ำ
3. **`Shift+←/→` ย้ายการ์ด 2 ครั้งไหม** — ผมกัน `e.defaultPrevented` ไว้แล้ว แต่มันขึ้นกับว่า handler ของการ์ด
   (K1.5) `preventDefault()` จริงทุกเส้นทางหรือเปล่า · กดรัว ๆ ข้ามคอลัมน์สุดขอบดูด้วย (ควรเงียบ ไม่ใช่ error)
4. **2 browser เห็นกันใน 2 วิ** (ข้อที่สัญญาไว้ในตาราง WO) — วันนี้ยังไม่มี `ABLY_API_KEY` ⇒ เส้นทางที่ทำงานจริง
   คือ **polling 5 วิ** ไม่ใช่ realtime · ถ้าเกณฑ์ "2 วิ" ต้องเป็นจริงบน prod ต้องได้กุญแจ Ably ก่อน
   (`/api/realtime/kanban-token` ตอบ `{mode:"polling"}` 200 อยู่ตอนนี้ — ตั้งใจ ไม่ใช่ error)
5. **`publishBoardSignal` บล็อกผู้เรียกไหมเมื่อผู้ให้บริการช้า** — ผมใส่ `await` ไว้ที่ callsite (อ่านง่ายกว่า
   fire-and-forget และชั้นล่างคืนทันทีเมื่อไม่มีกุญแจ) แต่ถ้าวันหน้ามีกุญแจแล้ว Ably ตอบช้า 3 วิ ผู้ใช้จะรอ 3 วิ
   ต่อการย้ายการ์ด 1 ครั้ง · **อยากให้ตัดสินว่าจะใส่ timeout หรือถอด `await` ออก**
6. **คลังเก็บเกิน 200 แถว** — ค้นหาเจอ แต่รายการเปล่า ๆ ตัดที่ 200 โดยไม่บอกผู้ใช้ว่าถูกตัด · P1 ยอมรับได้ไหม
   หรืออยากให้ขึ้นบรรทัด "แสดง 200 รายการล่าสุด — ใช้ช่องค้นหาเพื่อหาของที่เก่ากว่านี้"
7. **`archivedBy` ของแถวเก่า** — การ์ดที่ถูกเก็บก่อนมีคอลัมน์ `archivedById` จะขึ้น `—` และ `null` · ตรวจว่าไม่พังหน้า

---

## 9. ผลด่าน (รันจริง · บรรทัดสุดท้ายตามที่ออกมา)

**Oracle K1.14**
```
===== QC Kanban K1.14 =====
ผ่าน 15/15
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
JSON_SUMMARY {"total":15,"passed":15,"findings":[]}
```
> ⚠️ ตาราง WO เขียนว่า "16 ข้อ" แต่ไฟล์ข้อสอบจริงมี **15** check (S1.1–S1.3 · S2.1 · S3.1–S3.4 · S4.1–S4.6 · S5.1) — ไม่ได้แตะไฟล์

**Regression (รันหลังคืนสภาพ seed แล้ว · ทุกชุดรันด้วย env จาก `.env.qc` host `ep-plain-art`)**
```
k1.1  ผ่าน 30/30    k1.6  ผ่าน 20/20    k1.11 ผ่าน 21/21
k1.2  ผ่าน 25/25    k1.7  ผ่าน 21/21    k1.12 ผ่าน 18/18
k1.3  ผ่าน 29/29    k1.8  ผ่าน 18/18    k1.13 ผ่าน 16/16
k1.4  ผ่าน 30/30    k1.9  ผ่าน 18/18    k1.14 ผ่าน 15/15
k1.5  ผ่าน 17/17    k1.10 ผ่าน 16/16
qc-kanban-notify      QC Kanban Notify: 12/12 ผ่าน
qc-ai-kanban-board    ผ่าน 3/3
qc-nav-functions      ✅ ผ่านทั้งหมด — 10 เช็ก
```
> 🟡 **รายงานตามตรง**: ในการรันชุดแรกของ batch นี้ `k1.1` ออกมา `29/30 · CRITICAL 1` **หนึ่งครั้ง**
> ผมไม่ได้เก็บ check id ไว้ (จับแค่บรรทัดสรุป) · รันซ้ำหลังจากนั้น **5 ครั้งเขียว 30/30 ทุกครั้ง** (เดี่ยว 4 + ใน batch 1)
> ยังหาเงื่อนไขที่ทำให้เกิดซ้ำไม่ได้ — จดไว้เผื่อ Fable เจออีกจะได้ไม่คิดว่าเป็นของใหม่

**typecheck / fitness**
```
$ pnpm typecheck
> tsc --noEmit
(ไม่มี error)

$ pnpm exec tsx scripts/fitness.mts   (ไม่ export env)
===== FITNESS =====
ผ่าน 20/20
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
`grep ": any|as any|<any>" src/` → ไม่พบ

**ภาพ (production build บน `.env.qc` :3215 · ปิดเซิร์ฟเวอร์แล้ว)**
```
1.14  ✅ 11/11 ภาพ · failures 0   (shortcuts-help · archive-cards D/M · archive-columns · archive-after-restore ·
                                   board-filter-empty D/M · boards-home D/M · card-back-due-picker D/M)
1.5   ✅ 10/10 ภาพ · failures 0   + 🧹 คืนสภาพ K1.5: คืนการ์ดที่เปลี่ยนระหว่างถ่าย 1 ใบ · การ์ด ACTIVE = 24
1.6   ✅ 3/3 ภาพ · failures 0
1.12  ✅ 5/5 ภาพ · failures 0
```
**เปิดดูเองแล้วเทียบ mockup** (ไม่ได้อ่านแต่รายงาน):
- `shortcuts-help-desktop` — 14 แถวตรง §5.6 · คำไทยตรงตาราง · บรรทัดท้ายบอกทางไปปิดสวิตช์
- `boards-home-desktop` vs `01-boards-home.png` — แถบสีซ้าย ✅ · avatar `ผ ธ ป +1` / `ก ธ` ✅ · การ์ดเส้นประ ✅ ·
  dropdown หน่วยธุรกิจ ✅ · แถบแท็บ 7 หมวดพร้อมป้าย "เร็ว ๆ นี้" 5 อัน ✅ · ลำดับหมวดตรง mockup
- `card-back-due-picker-desktop` vs `03-card-back.png` — ชิป `อา. 11 ต.ค. 2569 · 18:00 น.` + ปฏิทินไทย พ.ศ. ✅
- `1.6/card-back-desktop` — ทั้ง "กำหนดส่ง" และ "วันเริ่ม" เป็นชิปแล้ว (`ไม่กำหนด` เมื่อว่าง) ไม่มี native input เหลือ
- `archive-cards/columns` — แท็บ การ์ด/คอลัมน์ · ช่องค้นหา · ปุ่มกู้คืน · บรรทัดอธิบาย "ของในคลังไม่ถูกลบ…"
- `board-filter-empty` — ไอคอนกรวย + "ไม่มีการ์ดตรงกับตัวกรอง" + ปุ่ม "ล้างตัวกรอง"
- `1.5/board-patong-mobile` — MobileBoard ปกติ (จุดบอกคอลัมน์ · แถบคำใบ้ปัด · FAB) = ยืนยันว่าแดงเดิมเป็นแดงปลอม

**ไมเกรชัน**: `20260929000000_kanban_v2_k` เพิ่มอย่างเดียว 1 คอลัมน์ · ลง QC แล้ว (ยืนยันจาก `information_schema.columns`)
**prod ยังไม่ลง** — ลงตอน Vercel build ตามปกติ

---

## 10. ยังไม่ได้ทำ (ตั้งใจ · นอกขอบเขต K1.14)

- `g` แล้ว `i` → หมวด "กล่องงานเข้า" ยังไม่มีหน้า (K2.8) ⇒ ขึ้น toast "กล่องงานเข้ากำลังจะมา (เร็ว ๆ นี้)" แทนการพาไป 404
- `MyTasks.tsx:296` ยังใช้ `toLocaleDateString("th-TH")` (ของเดิมจาก K1.13 · ภาพชุด 1.13 เขียว) — ไม่แตะในรอบนี้
  เพราะไม่ใช่หนี้ของ WO นี้ แต่จดไว้: เป็นแบบเดียวกับบั๊ก 7.2(1) ที่เพิ่งแก้ ควรเก็บกวาดพร้อมกันสัก WO
- `stamp()` ต่อโปรเซส (หนี้ MINOR จาก K1.10) ยังอยู่
