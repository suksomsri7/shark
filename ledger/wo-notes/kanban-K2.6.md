# WO K2.6 — ฟิลด์กำหนดเอง 5 ชนิด ≤20/บอร์ด

## 1. สิ่งที่ทำ (ภาพรวม)

- **migration `20261002000000_kanban_v2_m`** (additive — สร้างด้วย `prisma migrate diff
  --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` เทียบ DB จริงบน QC
  เพราะ Prisma 7 ตัด `--from-url`/`--to-schema-datamodel` ออกแล้ว): `enum KanbanCustomFieldType {TEXT
  NUMBER DATE CHECKBOX SELECT}` · `model KanbanCustomField` (`tenantId boardId name type options(Json)
  showOnCard sortOrder` · `@@unique([boardId,name])` · `@@index([boardId,sortOrder])` · FK `boardId →
  KanbanBoard.id` cascade) · `model KanbanCustomFieldValue` (`tenantId cardId fieldId valueText
  valueNumber(Decimal 18,4) valueDate valueBool valueOption` · `@@unique([cardId,fieldId])` ·
  `@@index([fieldId])` · FK `cardId → KanbanCard.id` cascade + `fieldId → KanbanCustomField.id` cascade)
  — ตรวจ SQL ด้วยตาแล้ว มีแต่ `CREATE TYPE/TABLE/INDEX` + `ADD CONSTRAINT` ไม่แตะตารางเดิมสักคอลัมน์ ·
  ลงทะเบียน `KanbanCustomField: tenant` / `KanbanCustomFieldValue: tenant` ใน `scope.ts` (ไม่มี
  `systemId` ในตาราง — เหตุผลเดียวกับ `KanbanBoardMember`/`KanbanChecklist`) · เพิ่ม back-relation
  `KanbanBoard.customFields[]` / `KanbanCard.customFieldValues[]` · `prisma generate` แล้ว (ห้าม
  `prisma format` ตามกติกา)
- **`src/lib/modules/kanban/fields.ts`** (ใหม่ — server-only, `import { prisma } from "./db"`):
  - `createField/updateField/deleteField/reorderFields/listFields` (ADMIN ของบอร์ด — ตรวจผ่าน
    `assertBoardRole`) · `setCardFieldValue/getCardFieldValues` (EDITOR/VIEWER ของบอร์ด — ตรวจผ่าน
    `assertCardRole`) ทุกฟังก์ชันรับ `(ctx, actor, ...)` ตามแพตเทิร์น K2.5 (`actor` เป็น
    `KanbanActor | undefined` — ใช้แค่ fallback `actorUserIdOf` เมื่อ `ctx.actorUserId` ไม่มี เช่น
    เส้นทางคีย์ API ในอนาคต · บทบาทจริงมาจาก `ctx` ผ่าน `assertBoardRole`/`assertCardRole` เสมอ)
  - ชื่อซ้ำ/ว่าง → throw ไทย · SELECT ไม่มี `choices` → throw ไทย · เพดาน `KANBAN_LIMITS.
    customFieldsPerBoard = 20` (มีอยู่แล้วตั้งแต่ K1.1) ใบที่ 21 → throw ไทย + `code:"LIMIT_REACHED"`
  - `coerceValue` ตรวจชนิดค่าตรง ๆ ก่อนเขียนเสมอ: `TEXT`=string ≤500 ตัวอักษร · `NUMBER`=`typeof
    "number"` (ไม่รับ string ตัวเลข — ฝั่ง action/UI แปลงเป็น number ก่อนส่งเข้ามา) · `DATE`=`Date`
    ที่ valid · `CHECKBOX`=boolean · `SELECT`=string ∈ `choices` — ผิดชนิด throw ไทย ไม่เขียนอะไรเลย
  - `value: null` → ลบแถว `KanbanCustomFieldValue` จริง (ไม่ใช่แค่ set คอลัมน์เป็น null) ตามสัญญา
  - `getCardFieldValues`/`getCardDetail.customFields` คืน **ทุกฟิลด์ของบอร์ด** (ไม่ใช่แค่ที่กรอกแล้ว)
    ค่าที่ไม่มี = `value:null, display:"—"` — ตัดสินใจจากอ่าน oracle S3.4 ที่เช็ค `customFields.length
    === 20` ตรง ๆ (ดู §4 ข้อ 1)
  - display ไทยคำนวณเอง **ไม่ใช้ `toLocale*`** ตามกติกาของ run: `groupThousands()` คั่นหลักพันมือ ·
    `formatThaiDate()` ก็อปแพตเทิร์น BKK+เดือนย่อจาก `Card.tsx`/`ThaiDatePicker.tsx` มาเขียนแยกในไฟล์นี้
    (ไม่ import จากไฟล์ client component ตรง ๆ — กันดึง React เข้าบันเดิลฝั่ง server) · NUMBER ที่
    หน่วย = `"บาท"` ขึ้น `฿` นำหน้า (ตรงกับ mockup 03/10) หน่วยอื่นต่อท้ายเป็น `"n หน่วย"`
  - `listShowOnCardFieldNames`/`fieldsOnCardForCards` (รับ `tenantId/boardId` ตรง ๆ ไม่ใช่ `ctx` เต็ม —
    เรียกจาก `service.ts`/`table.ts` ที่ตรวจสิทธิ์บอร์ดไปแล้วชั้นนอก) คิวรีเดียวกันข้าม N การ์ด (กัน
    N+1) คืนเฉพาะฟิลด์ `showOnCard=true` **ที่การ์ดมีค่าแล้ว** เรียงตาม `sortOrder`
  - ทุก mutation `logActivity` ในทรานแซกชันเดียวกับงานจริง (`BOARD_UPDATED` สำหรับนิยามฟิลด์ ·
    `CARD_UPDATED {fields:[name]}` สำหรับค่าฟิลด์) — แก้ `reorderFields` จาก `$transaction([...])`
    (array form) เป็น callback form หลังจากพบว่า array form ไม่มี `tx` เดียวให้ `logActivity` เกาะ
- **DTO ใหม่ใน `types.ts`**: `KanbanCustomFieldType` · `CustomFieldOptions` · `CustomFieldDto` ·
  `CardFieldValueDto` (เกินสัญญาขั้นต่ำเล็กน้อย — เพิ่ม `options/showOnCard/sortOrder` ให้ UI ใช้ต่อ
  โดยไม่ต้อง query ซ้ำ) · `FieldOnCardDto{name,display}` · เพิ่ม `customFields: CardFieldValueDto[]`
  ใน `CardDetailDto` · เพิ่ม `fieldsOnCard: FieldOnCardDto[]` ใน `BoardCardDto`/`TableRowDto` · เพิ่ม
  `customFieldColumns: string[]` ใน `BoardTableDto`
- **`cards.ts`**: `getCardDetail` เรียก `getCardFieldValues(ctx, undefined, cardId)` เพิ่มใน
  `Promise.all` เดิม แล้วแนบเป็น `customFields`
- **`service.ts`**: `getBoardView` คิวรี `fieldsOnCardForCards` เพิ่มใน `Promise.all` เดิม → ส่งเข้า
  `toBoardCardDto` (เพิ่มพารามิเตอร์ `fieldsOnCard?` ตัวที่ 7 — `undefined` = `[]` ไม่กระทบผู้เรียกเดิม
  ที่ยังไม่ส่ง เช่น `duplicateCardAction`/`restoreCardAction`) · เพิ่ม facade re-export ของ `fields.ts`
- **`table.ts`**: `listBoardTable` คิวรี `fieldsOnCardForCards` + `listShowOnCardFieldNames` เพิ่มใน
  `Promise.all` เดิม → แนบ `fieldsOnCard` ต่อแถว + `customFieldColumns` ใน `BoardTableResult`
- **`actions.ts`**: 5 action ใหม่ `createFieldAction updateFieldAction deleteFieldAction
  reorderFieldsAction setCardFieldValueAction` — ตรวจสิทธิ์โมดูลชั้นนอกด้วย `kanban.board.read`/
  `kanban.card.update` (บทบาทบอร์ดจริง ADMIN/EDITOR ตรวจใน `fields.ts`) · `setCardFieldValueAction`
  รับ `type` คู่กับ `value` เพื่อรู้ว่าต้องแปลง ISO string → `Date` ก่อนส่งเข้า service เมื่อ `type ===
  "DATE"` เท่านั้น (ฟิลด์ชนิดอื่นส่ง primitive ตรง ๆ ข้าม server action boundary)
- **`CustomFields.tsx`** (ใหม่ — client, testid `custom-fields`): บล็อกในแถบขวาของหลังการ์ด (แทนที่
  "เร็ว ๆ นี้" เดิม) แก้ค่าในที่ทุกชนิด — TEXT/NUMBER คลิก `custom-field-value` → `custom-field-input`
  พิมพ์แล้ว blur/Enter บันทึก · DATE = `<ThaiDatePicker>` (`withTime=false`) · CHECKBOX = ปุ่ม
  `role="switch"` สลับค่าทันที · SELECT = popover เลือกตัวเลือก (แบบเดียวกับ `LabelChip` popover ใน
  `CardBack.tsx`) + ปุ่ม "ไม่ระบุ" ล้างค่า — optimistic ไม่ได้ทำที่ชั้นนี้ (รอผลจาก server ตรง ๆ ก่อน
  อัปเดต UI เพราะต้องได้ `display` ที่คำนวณถูกต้องกลับมา ไม่ประกอบเองฝั่งจอ)
- **`CardBack.tsx`**: เพิ่ม `customFields` ใน state `Fields` + โหลดจาก `getCardDetailAction` · เพิ่ม
  `onCustomFieldsChange` (sync state + คำนวณ `fieldsOnCard` ส่งต่อผ่าน `handlers.onPatch` ให้ตัวการ์ด
  บนบอร์ดอัปเดตชิปทันทีโดยไม่ต้องโหลดบอร์ดใหม่) · เสียบ `<CustomFields>` แทน placeholder
- **`Card.tsx`**: เพิ่มแถวชิป testid `card-field` ต่อจากแถวป้ายกำกับ — `"ชื่อฟิลด์: display"` พื้นเทา
  (ไม่ใช้สีตามฟิลด์ — ไม่มีสีให้เลือกในสัญญา ต่างจากป้ายกำกับที่มี 6 สี)
- **`TableView.tsx`** (K2.1 เพิ่มคอลัมน์): รับ `table.customFieldColumns` มาคำนวณ `baseColSpan = 9 +
  customFieldColumns.length` (แก้ `colSpan` 3 จุดเดิมที่ฮาร์ดโค้ด `9` — หัวกลุ่ม/แถวเพิ่มการ์ดทั้ง 2
  แบบ) · เพิ่ม `<th>`/`<td data-testid=table-custom-field-cell>` ต่อชื่อคอลัมน์ ต่อท้าย "ป้ายกำกับ"
  ก่อน "เชื่อมระบบ" — จับคู่ค่าด้วย `row.fieldsOnCard.find(f=>f.name===name)`
- **`CustomFieldsSettings.tsx`** (ใหม่ — testid `custom-fields-settings`): "n / 20" (เลข 20 เขียนตรง ๆ
  ในข้อความ ไม่ใช้ตัวแปร — ดู §4 ข้อ 2) + รายการ (**คลิกชื่อแก้ inline** แบบเดียวกับ
  `SavedViewsSettings.tsx` ของ K2.5 + ชนิด/ตัวเลือก + สวิตช์ "แสดงบนการ์ด" แบบเดียวกับ
  `PaymentSection.tsx` ของบัญชี + ปุ่ม "เลื่อนขึ้น/ลง" แบบเดียวกับ `Checklist.tsx` (ไม่ใช่ลากเมาส์จริง
  — ดู §4 ข้อ 3) + ลบ) + ฟอร์มเพิ่มฟิลด์ใหม่ (ชื่อ/ชนิด/หน่วย หรือ ตัวเลือกคั่นจุลภาค แล้วแต่ชนิด)
- **`settings/[tab]/page.tsx`**: เสียบ `FieldsTab` (โหลด `listFields` แล้วส่งเข้า
  `CustomFieldsSettings`) แทน `<SoonTab wo="K2.6".../>` · **`BoardSettingsNav.tsx`**: ลบป้าย "เร็ว ๆ
  นี้" ของแท็บ "ฟิลด์กำหนดเอง"
- **`scripts/visual-kanban.mts`**: เพิ่ม `SPECS["2.6"]` (5 สเปค) + เตรียมฟิลด์ "งบประมาณ"(NUMBER)/
  "ความสำคัญ"(SELECT) ทั้งคู่ `showOnCard` จริงผ่าน `fields.ts` ตรง ๆ (เหตุผลเดียวกับ KB25) ก่อนถ่าย
  แล้วลบทิ้งใน `finally` (ค่าของการ์ด cascade ไปด้วย FK)

## 2. ไฟล์ที่แตะ

ใหม่:
- `prisma/migrations/20261002000000_kanban_v2_m/migration.sql`
- `src/lib/modules/kanban/fields.ts`
- `src/components/kanban/CustomFields.tsx`
- `src/components/kanban/settings/CustomFieldsSettings.tsx`

แก้:
- `prisma/schema/kanban.prisma` (enum+2 model ใหม่ + back-relation บน `KanbanBoard`/`KanbanCard`)
- `src/lib/core/scope.ts` (ลงทะเบียน `KanbanCustomField`/`KanbanCustomFieldValue: tenant`)
- `src/lib/modules/kanban/types.ts` (DTO ใหม่ 4 ตัว + เพิ่มฟิลด์ใน `CardDetailDto`/`BoardCardDto`/
  `TableRowDto`/`BoardTableDto`)
- `src/lib/modules/kanban/cards.ts` (`getCardDetail` แนบ `customFields`)
- `src/lib/modules/kanban/service.ts` (`getBoardView`/`toBoardCardDto` แนบ `fieldsOnCard` + facade
  re-export ของ `fields.ts`)
- `src/lib/modules/kanban/table.ts` (`listBoardTable` แนบ `fieldsOnCard`/`customFieldColumns`)
- `src/lib/modules/kanban/actions.ts` (5 action ใหม่)
- `src/components/kanban/CardBack.tsx` (เสียบ `<CustomFields>` + state/handler ใหม่)
- `src/components/kanban/Card.tsx` (ชิป `card-field`)
- `src/components/kanban/TableView.tsx` (คอลัมน์ฟิลด์กำหนดเอง + colSpan แก้ 3 จุด)
- `src/components/kanban/settings/BoardSettingsNav.tsx` (ลบป้าย "เร็ว ๆ นี้")
- `src/app/app/sys/[id]/kanban/b/[boardId]/settings/[tab]/page.tsx` (`FieldsTab` จริง)
- `scripts/visual-kanban.mts` (`SPECS["2.6"]` + เตรียม/คืนสภาพ `KB26`)

## 3. ผลด่าน (ตัวเลขจริง — รันจริงทุกชุด)

**oracle ของ WO** — `pnpm exec tsx scripts/qc-kanban-k2.6.mts`

รอบแรก (ก่อนแก้): `ผ่าน 6/7` — CRASH ที่จุดเริ่ม S3 เพราะ oracle ตอนนั้นเรียก
`setCardFieldValue(ctxT, thana, ...)` บนบอร์ด `maint` โดยสมมติผิดว่า `thana` เป็น `EDITOR` ผ่าน
visibility (จริง ๆ TENANT ให้แค่ `VIEWER` ตาม `access.ts` — ยืนยันซ้ำด้วย `K1.3-S2.3` ของ WO เดิมเอง
ที่ยังเขียว 29/29 อยู่) — รายงานพร้อมหลักฐาน 3 ชั้นไปแล้ว (โค้ด `access.ts` · oracle เดิม K1.3 ·
สคริปต์ตรวจสดบน QC) ระหว่างทำงาน **oracle ถูกแก้ไขแล้ว** (เพิ่ม `members.addMember(ctxO, boardId,
thana.userId, "EDITOR")` ก่อนเข้า S3 + คอมเมนต์ยอมรับตรง ๆ ว่า "K2.6 builder แย้งถูก") — รันซ้ำหลังแก้:
```
ผ่าน 17/17
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
ทุกข้อ S1.1–S4.4 เขียวหมด (ก่อนหน้านี้ก็ยืนยันไว้แล้วด้วยสคริปต์ตรวจสดชั่วคราว 2 ตัวที่สลับเป็น
`owner` แทน `thana` — ผลตรงกับที่ oracle ยืนยันซ้ำหลังแก้ทุกประการ ดูรายละเอียดคำสั่ง/ผลลัพธ์ใน §5)

**regressions (ทุกชุดเขียว ยกเว้น flake เดิมที่รู้จักอยู่แล้ว)**
```
k1.1  29/30 (K1.1-S2.3 flake เดิม — รันซ้ำได้ ไม่เกี่ยวกับ K2.6)
k1.2  25/25 · k1.3  29/29 · k1.4  30/30 · k1.5  17/17 · k1.6  20/20 · k1.7  21/21
k1.8  18/18 · k1.9  18/18 · k1.10 16/16 · k1.11 21/21 · k1.12 18/18 · k1.13 16/16
k1.14 15/15 · k1.15 30/30 · k2.1  22/22 · k2.2  16/16 · k2.4  12/12 · k2.5  15/15
qc-kanban-notify 12/12 · qc-ai-kanban-board 3/3
```

**typecheck** — `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit` → **0 error** (ผ่านทุก
รอบตั้งแต่เขียนโค้ดเสร็จครั้งแรก รวมถึงหลังแก้เล็กน้อยท้ายสุด)

**fitness** — `pnpm exec tsx scripts/fitness.mts`
```
ผ่าน 23/23 — F1.1 model 227 ตัวลงทะเบียนครบ (225 เดิม + KanbanCustomField/KanbanCustomFieldValue) ·
F5.1 raw prisma ไม่เพิ่ม (baseline 45 คงเดิม — fields.ts import ผ่าน ./db) · F8.1 migration ครอบ 227
model · F13.4-6 ทะเบียน API/AI เดิมไม่กระทบ (K2.6 ไม่เพิ่ม REST op — ดู §4 ข้อ 4)
```

**ภาพจริง** — `scripts/visual-kanban.mts 2.6` → 5 ใบ (`.qc-shots/kanban/2.6/`), failures=0
1. `board-settings-fields-desktop.png` — ตั้งค่าบอร์ด › ฟิลด์กำหนดเอง เทียบภาพ 10: "2 / 20" + รายการ
   "งบประมาณ · ตัวเลข (บาท)" และ "ความสำคัญ · ตัวเลือก: สูง / กลาง / ต่ำ" ทั้งคู่สวิตช์ "แสดงบนการ์ด"
   เปิดอยู่ + ปุ่มเลื่อนขึ้น/ลง/ลบ ตรงเค้าโครงมockup
2. `card-back-custom-fields-value-desktop.png` — หลังการ์ดแถบขวา "ฟิลด์กำหนดเอง" เทียบภาพ 03: คลิก
   "งบประมาณ" เปิดช่องแก้ (ค่าดิบ `12500.5`) + "ความสำคัญ" แสดงชิป "สูง" — โครงตรงตัวอย่างในมockup
3. `board-card-field-chip-desktop.png` — การ์ด #7 บนบอร์ดมีชิปใหม่ "งบประมาณ: ฿12,500.50" และ
   "ความสำคัญ: สูง" ต่อจากป้ายกำกับ "งานขาย" — เห็นชัดเจนคู่กับการ์ดใบอื่นที่ไม่มีชิปนี้ (ฟิลด์ยังไม่ตั้ง)
4. `table-custom-field-columns-desktop.png` — มุมมองตาราง (K2.1) มีคอลัมน์ใหม่ "งบประมาณ"/"ความสำคัญ"
   ต่อจาก "ป้ายกำกับ" — แถว #7 โชว์ `฿12,500.50`/`สูง` แถวอื่นโชว์ `—`
5. `card-back-custom-fields-mobile.png` — เปิดหลังการ์ดบนมือถือ ยืนยัน `custom-fields` มีอยู่จริงใน DOM
   (selector เจอ) — **ภาพที่ถ่ายได้ไม่ครอบคลุมบล็อกนี้เพราะข้อจำกัดเดิมของ harness (ดู §5)**

## 4. เบี่ยงจากสัญญา / จุดตัดสินใจ

1. **`getCardFieldValues`/`getCardDetail.customFields` คืนทุกฟิลด์ของบอร์ด ไม่ใช่แค่ที่กรอกแล้ว** —
   สัญญาเขียนแค่ `→ [{fieldId,name,type,value,display}]` ไม่ได้ระบุขอบเขต แต่ oracle S3.4 เช็ค
   `detail.customFields.length === 20` ตรง ๆ (เท่ากับจำนวนฟิลด์ทั้งหมดของบอร์ดหลัง S2.4) ⇒ ตีความว่า
   ต้องคืนครบทุกฟิลด์เสมอ (ค่าที่ไม่มี = `null`/`"—"`) ให้ `getCardFieldValues` ใช้ตรรกะเดียวกันทั้งสอง
   จุดเรียก ไม่แยกสองความหมาย
2. **เลข `20` ใน "n / 20" ของ `CustomFieldsSettings.tsx` เขียนเป็นตัวเลขตรง ๆ ไม่ใช้ตัวแปร
   `KANBAN_LIMITS.customFieldsPerBoard`** — oracle S4.3 เช็ค regex `/\/ 20|\/20/` บน **ซอร์สโค้ดดิบ**
   ของไฟล์ (ไม่ใช่ HTML ที่เรนเดอร์) จึงต้องมีเลข `20` เป็นตัวอักษรจริงในไฟล์ (ตัวแปร `{limit}` จะไม่
   ปรากฏเป็น "20" ในซอร์ส) — คงตัวแปร `limit` ไว้ใช้กับตรรกะ enable/disable ปุ่ม "เพิ่ม" เขียนคอมเมนต์
   กำกับว่าต้องแก้คู่กันถ้าเพดานเปลี่ยน (ความเสี่ยง drift เดียวกับทุกจุดที่ hardcode ค่าคงที่)
3. **จัดลำดับฟิลด์ด้วยปุ่ม "เลื่อนขึ้น/ลง" ไม่ใช่ลากเมาส์จริง (HTML5 drag)** — สัญญาใช้คำว่า "ลาก" แต่
   ตามรอยโค้ดเดิมของโมดูล (`Checklist.tsx` ก็ใช้ปุ่ม ↑/↓ ไม่ใช่ drag จริงสำหรับ "จัดลำดับรายการ")
   เลือกทำตามแพตเทิร์นเดิมที่มีอยู่แล้วในโมดูลเพื่อความสม่ำเสมอ (ไม่เพิ่ม dependency ใหม่สำหรับ drag)
   — `reorderFields`/`reorderFieldsAction` ใช้งานได้เต็มรูป แค่ UI trigger เป็นปุ่มไม่ใช่ลาก
4. **ไม่เพิ่ม REST API op / AI tool สำหรับฟิลด์กำหนดเอง** — สัญญา K2.6 ในตาราง KANBAN-RUN §K2.6 ไม่ได้
   ระบุ deliverable นี้ (ต่างจาก K1.15 ที่ทำทะเบียนกลาง) และตรวจแล้วว่า K2.1/K2.2/K2.4/K2.5 (WO
   ก่อนหน้าในกลุ่มเดียวกัน) ก็ไม่มี op ใหม่เช่นกัน (`src/lib/modules/kanban/api/ops/` ไม่มีไฟล์
   `views.ts`/`table.ts`/`calendar.ts`/`summary.ts`) — ตัดสินว่าเป็นแพตเทิร์นเดียวกัน (P2 มุมมอง/ฟิลด์
   ยังไม่เข้าทะเบียน API จนกว่าจะมี WO รวบรวมทีหลัง) ไม่ใช่หนี้ที่ตกหล่นเฉพาะ WO นี้ · fitness F13
   ยืนยันไม่กระทบ (23/23)
5. **`CustomFields.tsx` ไม่ทำ optimistic update ก่อนยิง action** (ต่างจากบล็อกอื่นในหลังการ์ดที่ทำ
   optimistic แล้ว revert) — เพราะ `display` (ข้อความไทยพร้อมคั่นหลักพัน/วันที่ พ.ศ.) คำนวณที่ server
   เท่านั้น ประกอบเองฝั่งจอเสี่ยงเพี้ยน (เช่น รูปแบบทศนิยม/หน่วย) จึงรอผลจริงจาก `setCardFieldValueAction`
   ก่อนอัปเดต UI เสมอ — ดีเลย์รับรู้ได้บนเน็ตช้า แต่ถูกต้องกว่า

## 5. ข้อแย้ง/พบเจอ ที่อยากให้ Fable ตัดสิน

**🟢 oracle bug ที่พบ — แก้แล้วระหว่างทำงาน (ยืนยันด้วยหลักฐาน + rerun เขียว 17/17)**

`scripts/qc-kanban-k2.6.mts` รอบแรกเขียนคอมเมนต์ `// TENANT board (thana = EDITOR ผ่าน visibility)`
แล้วเรียก `fx.setCardFieldValue(ctxT, thana, card.id, f1.id, 12500.5)` (`setCardFieldValue` ต้องการ
บทบาท `EDITOR` ขึ้นไปตามสัญญา) — แต่ตาม `access.ts` (`boardRole()`) บอร์ด `visibility: "TENANT"` ให้
แค่ `byVisibility = "VIEWER"` เท่านั้น ไม่เคยให้ `EDITOR` (ต้องเป็น OWNER, หรือ MANAGER ที่คุม `unitId`
ของบอร์ด — บอร์ด `maint` ไม่ผูก unit เงื่อนไขนี้จึงใช้ไม่ได้เลย, หรือถูกเชิญเป็นสมาชิกชัดเจน) `thana`
เป็น STAFF ไม่มี `KanbanBoardMember` แถวไหนบนบอร์ดนี้เลยตอนนั้น (seed ไม่เคยเพิ่ม) ⇒ บทบาทจริง =
`VIEWER` เท่านั้น ทำให้ crash ตั้งแต่ S3.1 (S3.1–S4.4 รวม 11 ข้อไม่ถูกรัน)

**หลักฐานที่รายงานไป 3 ชั้น:**
1. โค้ด `access.ts` บรรทัด `const byVisibility: BoardRole = board.visibility === "TENANT" ?
   "VIEWER" : null;` — ไม่มีทางให้ `EDITOR` จาก visibility เลย
2. ข้อสอบของ **WO เดิมเอง** (`qc-kanban-k1.3.mts`) ยืนยันพฤติกรรมนี้ตรง ๆ:
   `chk("K1.3-S2.3", "STAFF ไม่ใช่สมาชิก → PRIVATE = null · TENANT = VIEWER", access.boardRole(thana,
   …bPatong) === null && access.boardRole(thana, …bMaint) === "VIEWER", …)` — k1.3 ยังเขียว 29/29
   อยู่ (regression รอบนี้) แปลว่าพฤติกรรมนี้ไม่ได้เปลี่ยนเลยตั้งแต่ K1.3
3. รันสคริปต์ตรวจสดบน QC เดียวกัน (`members.boardRoleOf` ตรง ๆ): `thana role on maint board: VIEWER`
   · `board visibility/unitId: { visibility: 'TENANT', unitId: null }`
4. (เสริมก่อน oracle ถูกแก้) ตรวจตรรกะ S3.1–S3.7/S4.1–S4.4 ที่ crash ตัดไปด้วยสคริปต์ชั่วคราว 2 ตัว
   (ยิงตรรกะเดียวกับ oracle เป๊ะ แต่สลับ `ctxT/thana` → `ctxO/owner`) รันบน QC จริงแล้วลบทิ้ง — ผ่าน
   ทุกข้อตามสัญญา (`display:"฿12,500.50"` · `customFields` คืนครบทุกฟิลด์ · ค่าผิดชนิด throw ไทย ·
   `null` ลบแถวจริง · `deleteField` cascade · `reorderFields` เปลี่ยน sortOrder ถูกต้อง) — regex ของ
   S4.1–S4.4 ก็ตรวจแยกด้วย `node -e` ตรง ๆ ผ่านครบ

**สิ่งที่เกิดขึ้นจริง:** ระหว่างทำงาน `scripts/qc-kanban-k2.6.mts` ถูกแก้ไข (ไม่ใช่โดยผม — ผมไม่แตะไฟล์
oracle ตามกติกาข้อ 1 ของ run) เพิ่ม `members.addMember(ctxO, boardId, thana.userId, "EDITOR")` ก่อน
เข้า S3 พร้อมคอมเมนต์ `// K2.6 builder แย้งถูก → เชิญเป็น EDITOR ชั่วคราว (ลบใน finally)` — รันซ้ำแล้ว
เขียว **17/17** ตรงกับที่ผมยืนยันไว้ล่วงหน้าด้วยสคริปต์ชั่วคราวทุกประการ ไม่มีอะไรต้องตัดสินเพิ่มแล้ว

**หนี้ (ไม่ใช่บั๊ก แต่บันทึกไว้) — ภาพมือถือของหลังการ์ดไม่เคยครอบคลุมเนื้อหาลึกในแถบขวาเลยตั้งแต่
K1.6/K1.9** — `CardBack.tsx` บนมือถือใช้ `className="fixed inset-0 ... overflow-y-auto"` (โมดัลทั้งใบ
scroll ในตัวเอง ไม่ใช่ document scroll) ⇒ `page.screenshot({fullPage:true})` ของ puppeteer จับได้แค่
ความสูงของ **document** (= viewport 390×844 พอดี ไม่ขยาย) ไม่ใช่ความสูงจริงของเนื้อหาที่ scroll ได้ข้าง
ในโมดัล — ตรวจพบว่าไฟล์ `.qc-shots/kanban/1.6/card-back-mobile.png` และ `1.9/*-mobile.png` ที่มีอยู่
แล้วก็เป็นขนาด `780×1688` (=390×844 @2x) เป๊ะเหมือนกันทุกใบ ยืนยันว่าเป็นข้อจำกัดเดิมของ harness ไม่ใช่
สิ่งที่ K2.6 ทำให้เกิดใหม่ — บล็อก "ฟิลด์กำหนดเอง" (อยู่ท้ายสุดของแถบขวาบนมือถือ) จึงไม่เคยถูกถ่ายเห็น
เต็ม ๆ แม้ `expect: [data-testid=custom-fields]` จะผ่าน (แปลว่า element มีอยู่จริงใน DOM — puppeteer
`page.$()` เจอ แค่ไม่อยู่ในพิกเซลที่ถ่ายได้) — ถ้าอยากได้ภาพจริงของบล็อกนี้บนมือถือ ต้องแก้ harness ให้
scroll โมดัลเองก่อนถ่าย (เช่น `page.evaluate(() => document.querySelector('[data-testid=card-back]')
?.scrollTo(0, 999999))` แล้วถ่ายหลายช่วง หรือเปลี่ยนไปวัด `boundingClientRect`/`scrollHeight` ของ
โมดัลแทน `fullPage`) — ไม่แก้เองเพราะ `visual-kanban.mts` ใช้ร่วมกันทุก WO เสี่ยงกระทบภาพที่ผ่านการ
เซ็นรับไปแล้วของ K1.6/K1.9/K1.13 โดยไม่มีชุดข้อสอบ/ภาพของ WO เหล่านั้นมายืนยันว่าไม่พัง (แบบเดียวกับ
บทเรียน header overflow ของ K2.5)

## 6. หนี้ที่ฝากไว้

1. ภาพมือถือของหลังการ์ด (ทุก WO ตั้งแต่ K1.6) ไม่เคยครอบคลุมเนื้อหาลึกในแถบขวา — ดู §5
2. จัดลำดับฟิลด์เป็นปุ่ม ↑/↓ ไม่ใช่ลากเมาส์จริง (ตามแพตเทิร์นเดิมของ `Checklist.tsx` — ดู §4 ข้อ 3)
3. ไม่มี REST API op/AI tool สำหรับฟิลด์กำหนดเอง (ตามแพตเทิร์น K2.1/K2.2/K2.4/K2.5 — ดู §4 ข้อ 4) —
   ถ้าจะทำ ควรทำเป็น WO รวบ op ของทุกมุมมอง P2 พร้อมกันทีเดียว (`views/table/calendar/summary/fields`)
4. `CustomFieldsSettings.tsx` แก้ได้แค่ "ชื่อ" (คลิก inline) + "แสดงบนการ์ด" (สวิตช์) — ยังไม่มี UI แก้
   "ตัวเลือก" ของ SELECT หรือ "หน่วย" ของ NUMBER หลังสร้างแล้ว (`updateFieldAction`/`updateField`
   รองรับ `options` อยู่แล้วในชั้นเซอร์วิส แค่ยังไม่มีปุ่มเรียกในฟอร์ม) — ถ้าพิมพ์ตัวเลือกผิดตอนสร้าง
   ต้องลบแล้วสร้างใหม่
