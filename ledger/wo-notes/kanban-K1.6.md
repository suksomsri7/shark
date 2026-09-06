# K1.6 — หลังการ์ด (Card Back) · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.6 · oracle `scripts/qc-kanban-k1.6.mts` (20 ข้อ, ไม่แก้) · ภาพ `scripts/visual-kanban.mts 1.6` · มockup `ledger/design-kanban/03-card-back.png`

## ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/kanban/sanitize.ts` — `sanitizeDescription()` (allowlist regex-based, ไม่เพิ่ม dependency ตาม D12) + `renderDescription()` (markdown-lite → HTML แล้ว sanitize)
- `src/components/kanban/CardBack.tsx` — หลังการ์ดทั้งใบ (โมดัลเดสก์ท็อป/แผ่นเต็มจอมือถือ)

**แก้**
- `src/lib/modules/kanban/cards.ts` — เพิ่ม `getCardDetail` · `updateCardFields` · `duplicateCard` · `archiveCard` · `restoreCard` · `listArchivedCards` (ทุกตัวผ่าน `assertCardRole`/`assertBoardRole` ก่อนเสมอ)
- `src/lib/modules/kanban/types.ts` — เพิ่ม `CardDetailDto` (ส่วนของการ์ดที่ `getBoardView` ไม่ส่งมาด้วย: description/startAt/reminder/สถานะคลัง)
- `src/lib/modules/kanban/service.ts` — เพิ่ม `listCardLabelDtos`/`listCardAssigneeDtos` (ประกอบ DTO ของการ์ดใบเดียวให้ action ทำสำเนา/กู้คืนใช้)
- `src/lib/modules/kanban/actions.ts` — เพิ่ม `getCardDetailAction` `updateCardFieldsAction` `duplicateCardAction` `archiveCardAction` `restoreCardAction` `setCardLabelsAction` `setCardAssigneesAction` `createLabelAction` · **เปลี่ยนชื่อ** `archiveCardAction(FormData)` เดิม (ก่อน K1.6) → `archiveCardFormAction` (ชนชื่อกับ action ใหม่ที่รับ object) · export ทุกตัวยังลงท้าย `*Action`
- `src/lib/modules/kanban/ui.tsx` — อัปเดตจุดเรียกเป็น `archiveCardFormAction` (หน้าเดิมก่อน K1.5 ที่ไม่มี route ชี้แล้ว แต่ยังคอมไพล์ต้องผ่าน)
- `src/components/kanban/BoardView.tsx` — เสียบ `CardBack` แทน placeholder เดิม: state `openCardSnapshot`/`openColumnMeta`/`labels` (แยกจาก `columns` เพราะ `getBoardView` ไม่ส่งการ์ด ARCHIVED มา — เก็บ "ภาพตอนเปิด" ไว้ให้หลังการ์ดโชว์แถบคลังต่อได้แม้การ์ดถูกถอดออกจากกองแล้ว) · handlers `onPatch/onRemove/onDuplicated/onRestored/onMoveToColumn/onLabelCreated/onToast` (ย้ายการ์ดจากหลังการ์ดใช้ `moveCardTo` เดิมของ K1.5 — เดิน optimistic+rollback+toast เส้นเดียวกับลากวาง) · `closeCard` คืนโฟกัสให้การ์ดใบเดิมบนบอร์ด (§12.2) · เปิดตรงจาก URL (`initialCardId`) หา snapshot จาก `board.columns` ตอน mount
- `src/components/kanban/Card.tsx` — export เพิ่ม `formatCardDateTime`/`formatCardDate` (ปี พ.ศ. · คำนวณเอง ไม่ใช้ `toLocaleDateString` ตามบทเรียน K1.5) + เติม `year` ใน `BkkParts`
- `src/components/kanban/KanbanIcon.tsx` — เพิ่มไอคอน `swap`/`bolt` (คัดจาก `_base.part`/`_kb.part` เหมือนเดิม)

## sanitize.ts — กติกา

- Allowlist (§11.6): `p br h1 h2 ul ol li strong b em i s code a`(href http/https เท่านั้น + บังคับ `rel="noopener"`) — attribute อื่นทั้งหมดถูกตัด
- ตัดทั้งก้อน (แท็ก+เนื้อหา): `script style iframe object embed noscript` — เพราะเนื้อหาข้างในเป็นโค้ด ไม่ใช่ข้อความที่ผู้ใช้ตั้งใจพิมพ์
- แท็กเดี่ยวอันตราย (`img` ฯลฯ) ตัดทั้งแท็ก
- แท็กที่ไม่อยู่ใน allowlist แต่ไม่อันตราย (เช่น `h3`) → **ปลดแท็กแต่คงข้อความ** (ต่างจากกลุ่มบน)
- ไม่มี DOM parser/cheerio — regex ล้วนตาม D12 ("ไม่เพิ่ม dependency")
- `renderDescription(text)`: `- ` → `<ul><li>` · `**x**` → `<strong>` · `*x*` → `<em>` · URL http(s) auto-link · บรรทัดว่างคั่นย่อหน้า `<p>` · escape ก่อนแปลงเสมอ (กัน HTML ดิบหลุดจากข้อความ) → จบด้วย `sanitizeDescription`
- **ที่ที่ markdown-lite เกิดขึ้นจริง**: client (`CardBack.tsx`) เรียก `renderDescription(rawText)` ก่อนส่ง `description` ให้ `updateCardFieldsAction` — service `cards.updateCardFields` ทำแค่ `sanitizeDescription` (ไม่ parse markdown) ตามสัญญา oracle ที่ทดสอบส่ง HTML ดิบตรง ๆ เข้า `description`

## DOM / testid (ตรงสัญญา 9 ตัว)

`card-back`(panel, `role="dialog" aria-modal="true"`) `card-title`(คลิกแก้ในที่) `card-title-input` `card-description`(บล็อกรายละเอียด) `card-due` `card-labels` `card-members` `card-archive`(สลับเป็นปุ่มกู้คืนเมื่ออยู่ในคลัง) `card-close`

- `Escape` ปิด + คืนโฟกัสให้การ์ดใบเดิม (ผ่าน `cardEls` ref map ของ `BoardView`)
- Focus trap ในโมดัล (คำนวณ focusable elements เอง ไม่มี lib) + โฟกัสไปที่ชื่อการ์ดตอนเปิด (§12.2)
- VIEWER (`canEdit=false`): ปุ่ม/ช่องแก้ทั้งหมด **ไม่อยู่ใน DOM** (เงื่อนไข `editable`/`canEdit` ครอบทุกจุด ไม่ใช่แค่ซ่อนด้วย CSS) — แถวสรุปกำหนดส่ง/วันเริ่มสลับเป็นข้อความอ่านอย่างเดียวแทน `<input>`
- ปุ่มที่ WO ถัดไปยังไม่มา (เช็คลิสต์/ไฟล์แนบ/เชื่อมข้อมูล SHARK/สะท้อนการ์ด/เทมเพลต/ติดตาม/AI 3 ปุ่ม) = `disabled` + `title="เร็ว ๆ นี้"` ไม่ใช่หายไปจากจอ

## URL sync

`BoardView.openCard/closeCard` (เดิมจาก K1.5) ทำ `history.replaceState` ตั้ง/ลบ `?card=` — ไม่ navigate จึงไม่ยิง RSC ซ้ำ · เปิดตรงจาก URL ตอนโหลดหน้า (`page.tsx` ส่ง `initialCardId` จาก `searchParams.card`) → `useEffect` มองหาการ์ดใน `board.columns` ตอน mount มาตั้ง snapshot

## สถาปัตยกรรมข้อมูล (ทำไมต้องมี `getCardDetail` แยก)

`getBoardView` (K1.5) จงใจไม่ดึง `description`/comment มาด้วยเพื่องบประสิทธิภาพ (§12.1: "ไม่ดึง description/comment ในหน้าบอร์ด") ⇒ `CardBack` เปิดแล้วเรียก `getCardDetailAction` เพิ่มเพื่อเอา description/startAt/reminderMinutesBefore/สถานะคลัง (skeleton 3 บล็อกระหว่างรอ) แล้วรวมกับ `card` prop (title/dueAt/labels/assignees ที่มีอยู่แล้ว) เป็น `Fields` state เดียวที่เป็นแหล่งความจริงของโมดัลตั้งแต่นั้น

## Optimistic + revert

ชื่อ/รายละเอียด(debounce 800ms)/กำหนดส่ง/วันเริ่ม/เตือนล่วงหน้า/ป้าย/ผู้รับผิดชอบ: แก้ local state ก่อนเสมอ (+ แปะกลับไปที่การ์ดบนบอร์ดผ่าน `onPatch` สำหรับฟิลด์ที่โชว์บนตัวการ์ด) → ยิง action จริง → ผิดพลาด revert ทั้งสองที่ + toast ไทย (ใช้ `board-toast` ของ K1.5 ซ้ำ) · ย้ายคอลัมน์เดินท่อ `moveCardTo` เดิมของการลากวาง (ได้ rollback/toast ฟรี) · ทำสำเนา/เก็บ/กู้คืน รอผล server แล้วค่อยอัปเดต DOM (ไม่มี optimistic เพราะเป็นการกระทำที่เปลี่ยนโครงบอร์ด ความเสี่ยง UX ต่ำกว่าพิมพ์ ไม่คุ้มความซับซ้อนเพิ่ม)

## กับดักที่เจอ

- **ตั้งชื่อฟังก์ชันชนกัน**: `cards.ts` ต้องมีฟังก์ชันชื่อ `archiveCard(ctx, cardId)` ตามสัญญา oracle แต่ `service.ts` มี `archiveCard(tenantId, systemId, cardId)` เดิมอยู่แล้วและ `actions.ts` import ทั้งคู่ — แก้ด้วยแพตเทิร์นเดียวกับที่ `moves.ts` ทำไว้กับ `archiveColumn` ตั้งแต่ K1.4 (`import { archiveCard as archiveCardV2 } from "./cards"`) และเปลี่ยนชื่อ action เดิมที่รับ FormData เป็น `archiveCardFormAction` (ของเดิมยังมีจุดเรียกจาก `ui.tsx` ที่ยัง compile อยู่แม้ไม่มี route ชี้แล้ว)
- **`columns` ในหน้าบอร์ดมีแต่การ์ด ACTIVE**: ถ้าอิง `columns.find(...)` เป็นแหล่งข้อมูลของหลังการ์ดตรง ๆ เหมือนที่ K1.5 ทำไว้ (placeholder เดิม) พอกด "เก็บเข้าคลัง" การ์ดจะหายจาก `columns` ทันที ⇒ React unmount `CardBack` ทั้งที่ควรโชว์แถบ "อยู่ในคลัง" ต่อ — แก้ด้วยการแยก `openCardSnapshot`/`openColumnMeta` ออกจาก `columns` เป็น state ของตัวเอง อัปเดตเฉพาะตอนเปิด/ย้าย/กู้คืน ไม่ผูกกับการมีอยู่ในกองบนบอร์ด
- **description ไม่ใช่ markdown source ที่เก็บไว้**: DB เก็บแค่ HTML สุดท้าย (สัญญา oracle ยืนยันด้วยการยิง HTML ดิบเข้า `updateCardFields` ตรง ๆ ไม่ผ่าน markdown) ⇒ ตัดสินใจให้ `renderDescription` (markdown → HTML) รันที่ client ก่อนส่ง ไม่ใช่ที่ service — ยอมรับว่าการแก้ไขซ้ำจะทำงานบน HTML ที่เคยเซฟไว้ (ไม่ใช่ markdown ต้นฉบับ) เป็นข้อจำกัดที่รู้ตัวของ P1 (ยังไม่มี WYSIWYG/เก็บ markdown แยก)
- **ปี พ.ศ.**: มockup โชว์ "2569" — เพิ่ม `year` ใน `BkkParts` ของ `Card.tsx` แล้ว `+ 543` ในฟังก์ชันใหม่ ไม่แตะพฤติกรรมเดิมของ `dueBadgeOf`

## Known simplification (บันทึกไว้ให้ Fable ตัดสิน)

- ช่องกำหนดส่ง/วันเริ่มใช้ `<input type="datetime-local">`/`type="date"` ของเบราว์เซอร์ตรง ๆ (ตอน `editable`) แทนชิปที่ต้องคลิกเพื่อแก้แบบในภาพ (ยังคงลำดับ/กลุ่ม/ป้ายกำกับไทยตรงแบบ แต่หน้าตาช่องเป็น native control ไม่ใช่ชิปทึบ) — ตัดสินใจเพื่อประหยัดเวลา ให้ฟังก์ชันครบก่อน ยังไม่ทำ click-to-edit เหมือนชื่อ/รายละเอียด
- ปุ่ม "ย้ายไปคอลัมน์/บอร์ดอื่น" ในแบบ — ทำแค่ "ย้ายไปคอลัมน์" (ในบอร์ดเดียวกัน) ตามสัญญา WO ระบุไว้ชัด ("ย้ายไปคอลัมน์ (select → moveCardAction)") · ย้ายข้ามบอร์ดยังไม่ทำ (ไม่มีสัญญาให้ทำใน K1.6)
- ไม่ได้ทำสกรีนช็อตแยกในสายตา VIEWER — ตรวจผ่านโค้ดรีวิว (ทุกปุ่ม/ช่องแก้ครอบด้วย `editable`/`canEdit`) + oracle service-level S2.5/S2.6 (thana ไม่ใช่สมาชิก → 404 · เป็น VIEWER → 403) แทน เพราะ seed ไม่มีผู้ใช้ VIEWER ถาวรบนบอร์ดป่าตอง (ต้องสร้าง membership ชั่วคราวเพิ่มเพื่อถ่ายภาพ)
- "ทำต่ออัตโนมัติ"/"ผู้ช่วย AI"/"ฟิลด์กำหนดเอง" ในแถบขวา = ข้อความ/ปุ่ม disabled คงที่ ไม่ได้ผูกกับ `canEdit` (เพราะยังไม่มีฟังก์ชันจริงให้ทำอะไรอยู่แล้วในทุกบทบาท)

## ภาพที่ตรวจ (`.qc-shots/kanban/1.6/`)

- `card-back-desktop.png` — เทียบ `03-card-back.png`: หัว (`#7 · อยู่ในคอลัมน์ รอทำ · บอร์ด งานร้าน — สาขาป่าตอง`) ตรง · เมนู "เพิ่ม:" อยู่ใต้ชื่อตรงตำแหน่ง · แถวสรุปผู้รับผิดชอบ/ป้ายกำกับ/กำหนดส่ง+วันเริ่ม ตรงลำดับ · รายละเอียด empty state "ยังไม่มีรายละเอียด — คลิกเพื่อเพิ่ม" · แถบขวา 4 กลุ่ม + เก็บเข้าคลัง ตรงลำดับ 5 กลุ่มตามสัญญา · โมดัล 872px กึ่งกลางจอ ถูก
- `card-back-mobile.png` — แผ่นเต็มจอ (`fixed inset-0`) ตามสัญญา · เนื้อหาซ้อนแนวตั้งอ่านง่าย · แถบขวากลายเป็นเต็มความกว้างด้านล่าง
- `card-back-edit-title-desktop.png` — คลิก `card-title` → พิมพ์ใน `card-title-input` → Enter → ชื่อการ์ดบันทึกจริง ("...แก้ชื่อผ่าน QC") ยืนยัน flow แก้ชื่อทำงาน
- **แก้หลังดูภาพ**: ไม่มี — โครงตรงตามที่ออกแบบตั้งแต่รอบแรก (ต่างจากภาพแค่รูปแบบช่องวันที่เป็น native input ตามที่บันทึกไว้ใน "Known simplification")

**หลังถ่ายภาพ**: harness `visual-kanban.mts 1.6` แก้ชื่อการ์ดที่ 7 ของบอร์ดป่าตองเป็น "...แก้ชื่อผ่าน QC" ค้างไว้ (ไม่มีการ cleanup ในตัวสคริปต์) → รันสคริปต์ one-off คืนชื่อกลับเป็น `"ทำใบเสนอราคาทริปเรือ Sea Fox — 3 วัน 2 คืน"` แล้ว (ยืนยันด้วยการรัน oracle ซ้ำหลังคืนชื่อ ยังเขียว 20/20)

## คำสั่งที่รันจริง + ผลสุดท้าย

```
$ pnpm exec tsc --noEmit                       → exit 0 (ก่อนและหลังเปิด/ปิด QC server)
$ bash scripts/acc-v2-serve.sh                  → build สำเร็จ, serve :3215
$ pnpm exec tsx scripts/qc-kanban-k1.6.mts       → ผ่าน 20/20 · CRITICAL 0 · MAJOR 0 · MINOR 0
$ pnpm exec tsx scripts/visual-kanban.mts 1.6    → failures 0 (3 shots) — ดูตาด้วยแล้ว
$ pnpm exec tsx scripts/qc-kanban-k1.5.mts       → 17/17
$ pnpm exec tsx scripts/qc-kanban-k1.3.mts       → 29/29
$ pnpm exec tsx scripts/qc-kanban-k1.2.mts       → 25/25
$ pnpm exec tsx scripts/qc-kanban-k1.1.mts       → 30/30
$ pnpm exec tsx scripts/qc-kanban-notify.mts     → 12/12
$ pnpm exec tsx scripts/qc-ai-kanban-board.mts   → 3/3
$ pnpm exec tsx scripts/qc-kanban-k1.4.mts       → 30/30 (optional — รันด้วยเพราะเร็ว)
$ bash scripts/acc-v2-serve.sh stop
$ pnpm exec tsc --noEmit                        → exit 0
$ pnpm exec tsx scripts/fitness.mts              → 20/20 (รันรอบเดียว — ไม่พบ mode flag แยกในสคริปต์นี้ที่ตรงกับ "both modes"; ผลเดียวกันทุกรอบที่รัน)
```

JSON_SUMMARY (k1.6): `{"total":20,"passed":20,"findings":[]}`
JSON_SUMMARY (visual 1.6): `{"wo":"1.6","user":"owner","shots":[".qc-shots/kanban/1.6/card-back-desktop.png",".qc-shots/kanban/1.6/card-back-mobile.png",".qc-shots/kanban/1.6/card-back-edit-title-desktop.png"],"failures":0}`
JSON_SUMMARY (fitness): `{"total":20,"passed":20,"findings":[]}`

## ทิ้งไว้ให้ตรวจ (ไม่ commit ตามกติกา run)

`git status --porcelain` ที่เกี่ยวกับ WO นี้:
```
 M src/components/kanban/BoardView.tsx
 M src/components/kanban/Card.tsx
 M src/components/kanban/KanbanIcon.tsx
 M src/lib/modules/kanban/actions.ts
 M src/lib/modules/kanban/cards.ts
 M src/lib/modules/kanban/service.ts
 M src/lib/modules/kanban/types.ts
 M src/lib/modules/kanban/ui.tsx
?? src/components/kanban/CardBack.tsx
?? src/lib/modules/kanban/sanitize.ts
```
(`ledger/KANBAN-RUN.md` + `ledger/prod-shots/` ที่เห็นในสถานะเป็นของ Fable จาก K1.5 ไม่ใช่ของ WO นี้)


## ภาคผนวกโดย Fable (ตรวจรับ 08:00 น.)
- ดูภาพเอง: `card-back-desktop` (โครงตรง mockup 03: หัว #7 · แถวเพิ่ม 6 ชิป · ผู้รับ/ป้าย/กำหนดส่ง+เตือน/วันเริ่ม · รายละเอียด · แถบขวา การ์ดนี้/อัตโนมัติ/AI/ฟิลด์/เก็บ) · `card-back-mobile` (แผ่นเต็มจอ เลื่อนได้)
- หนี้ UI ที่รับไว้: ช่องวันที่ใช้ `<input type=datetime-local>` (แสดง 10/11/2026 แบบ US) → ต้องเป็นชิปไทย "พฤ. 11 ก.ย. 2569 · 17:00" + popover ตามแบบ (ทำใน K1.14 พร้อมปุ่มลัด `d`) · ย้ายข้ามบอร์ดยังไม่มี (K2/K3)
- รันซ้ำเอง: k1.6 20 · k1.5 17 · k1.3 29 · k1.2 25 · k1.1 30 · notify 12 · typecheck 0 · fitness 20/20 ×2
