# K1.12 — เทมเพลต 6 ชุดธุรกิจไทย + หน้ารวมบอร์ดใหม่ (boards home) · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.12 · oracle `scripts/qc-kanban-k1.12.mts` (19 ข้อ · ไม่แตะ) · ภาพ `scripts/visual-kanban.mts 1.12` (Fable เตรียม shot แรกไว้แล้ว 1 ใบ → เพิ่มอีก 2 spec = 5 ใบ) · มาตรฐาน `ledger/design-kanban/01-boards-home.png`/`.html`

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260927000000_kanban_v2_i/migration.sql` — additive: enum `KanbanTemplateScope` + ตาราง `KanbanBoardTemplate` + index `tenantId` + **partial unique index** `(scope,key) WHERE key IS NOT NULL`
- `src/lib/modules/kanban/templates.ts` — `listTemplates` · `createBoardFromTemplate` (atomic) · `saveBoardAsTemplate` · `deleteTenantTemplate`
- `src/lib/modules/kanban/boardsHome.ts` — `boardsHome(ctx, actor)`
- `scripts/seed-kanban-templates.mts` — 6 เทมเพลตแพลตฟอร์ม (idempotent find-then-write · ปลอดภัยรัน prod ด้วย `ALLOW_PROD_SEED=1`)
- `src/components/kanban/BoardsHome.tsx` — หน้ารวมบอร์ดใหม่ (client · รับ DTO ที่ fetch มาแล้วจาก server)
- `src/components/kanban/TemplatePicker.tsx` — แถว "เริ่มจากเทมเพลต" (คลิกการ์ด → พรีวิวคอลัมน์ → "ใช้เทมเพลตนี้")
- `src/components/kanban/CreateBoardModal.tsx` — โมดัลสร้างบอร์ด (ชื่อ/หน่วยธุรกิจ/การมองเห็น/เทมเพลต) + validation ในตัว

**แก้**
- `prisma/schema/kanban.prisma` — เพิ่ม enum + model `KanbanBoardTemplate` (ท้ายไฟล์ · `KanbanBoard.templateOfId` มีอยู่แล้วตั้งแต่ K1.1 ไม่ต้องแก้)
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanBoardTemplate` เป็นแกน **global** (ไม่ใช่ tenant) ตามคำแนะนำ blueprint §6.1 — ดูเหตุผลใน deviation ข้อ 1
- `src/lib/modules/kanban/types.ts` — เพิ่ม DTO ที่ไฟล์นี้ต้องบริสุทธิ์: `TemplateColumnSpec/TemplateLabelSpec/TemplateCardSpec/TemplateStructure/BoardTemplateDto/BoardsHomeCardDto/BoardsHomeDto`
- `src/lib/modules/kanban/service.ts` — re-export facade: `createBoardFromTemplate/deleteTenantTemplate/listTemplates/saveBoardAsTemplate/boardsHome` + ชนิด DTO
- `src/lib/modules/kanban/actions.ts` — เพิ่ม `createBoardFromTemplateAction` (ทำสองหน้าที่ — ดู deviation ข้อ 2) · `saveBoardAsTemplateAction` · `deleteTenantTemplateAction` (`starBoardAction` มีอยู่แล้วจาก K1.3/K1.5 — ใช้ตัวเดิม)
- `src/components/kanban/BoardHeader.tsx` — เมนู ⋯ เพิ่ม "บันทึกเป็นเทมเพลต" (ADMIN) + โมดัลเล็ก `SaveAsTemplateModal` ในไฟล์เดียวกัน (ชื่อ+คำอธิบาย · validation อยู่ในหน้า ไม่ใช้ `alert()`)
- `src/app/app/sys/[id]/kanban/boards/page.tsx` — เขียนใหม่ทั้งหน้า: เรียก `boardsHome`+รายชื่อหน่วยธุรกิจ แล้วส่งให้ `<BoardsHome>` (แทนที่ `KanbanBoardsSection` เดิม — ฟังก์ชันนั้นยังอยู่ในไฟล์ `ui.tsx` เผื่อวันหน้ามีใครอ้างถึง แต่ไม่ถูกเรียกจากหน้านี้อีกแล้ว)
- `scripts/visual-kanban.mts` — เพิ่ม 2 spec เข้าไปใน `"1.12"` ที่ Fable เตรียมไว้แล้ว (`template-picker-open` · `create-board-modal-filled`) + เตรียม/คืนสภาพ "ติดดาวบอร์ดป่าตอง" ก่อน-หลังถ่าย (ชุดข้อมูล QC ปกติไม่มีบอร์ดติดดาวเลย ⇒ แถบ "บอร์ดติดดาว" จะไม่ปรากฏให้ selector หาเจอ)

## Schema

```prisma
enum KanbanTemplateScope { PLATFORM TENANT }

model KanbanBoardTemplate {
  id          String              @id @default(cuid())
  tenantId    String?             // null = แพลตฟอร์ม
  scope       KanbanTemplateScope
  key         String?             // คีย์คงที่ของแพลตฟอร์ม (dive-shop/hotel/restaurant/clinic/retail/weekly)
  name        String
  description String?
  icon        String
  structure   Json                // { columns[], labels[], cards[] }
  createdById String?
  createdAt   DateTime            @default(now())
  @@index([tenantId])
}
```

unique จริง (`scope,key` เมื่อ `key` ไม่ null) เป็น **partial index** เขียนตรงในไมเกรชัน SQL ไม่ใช่ `@@unique` ในสคีมา (Prisma schema language ไม่รองรับเงื่อนไข `WHERE` ของ partial index) — ผลลัพธ์เดียวกับ unique constraint ปกติบนคอลัมน์ nullable ของ Postgres อยู่แล้ว (NULL ไม่ชนกัน) แต่เขียนให้ชัดเจนตามตัวอักษรของสัญญา §K1.12

## Function map

| ฟังก์ชัน | ไฟล์ | หมายเหตุ |
|---|---|---|
| `listTemplates(ctx)` | `templates.ts` | แพลตฟอร์มมาก่อนเสมอ (`ORDER BY scope` — "PLATFORM" < "TENANT" ตัวอักษร) แล้วต่อท้ายด้วยของร้าน |
| `createBoardFromTemplate(ctx, actor, keyOrId, {name?,unitId?,visibility?})` | `templates.ts` | ตรวจ `kanban.board.create` + หา template (id หรือ key) **ก่อน**เปิด tx → tx เดียวสร้างบอร์ด+คอลัมน์+สมาชิก ADMIN+ป้าย+การ์ด(+เช็คลิสต์)+activity 2 ชนิด (CARD_CREATED ต่อใบ, BOARD_CREATED ท้ายสุด) แล้วปิดด้วย `cardNoSeq = จำนวนการ์ด` |
| `saveBoardAsTemplate(ctx, actor, boardId, {name,description?})` | `templates.ts` | ต้อง ADMIN ของบอร์ด · อ่านเฉพาะคอลัมน์/การ์ด ACTIVE · ไม่เก็บ `assigneeUserId`/`dueAt` ไว้ใน DTO เลย (ชนิด `TemplateCardSpec` ไม่มีฟิลด์พวกนี้ตั้งแต่ต้น) |
| `deleteTenantTemplate(ctx, actor, templateId)` | `templates.ts` | scope=PLATFORM → error ไทย · tenantId ไม่ตรง → 404 · ต้องมี `kanban.template.manage` |
| `boardsHome(ctx, actor)` | `boardsHome.ts` | `visibleBoardsWhere(actor)` กรองบอร์ด แล้วนับ card/overdue ด้วย `groupBy` (คิวรีเดียวต่อชนิด ไม่ใช่ต่อบอร์ด) · จัดกลุ่ม `byUnit`/`tenantWide`/`starred` (บอร์ดโผล่ได้ทั้งใน starred และกลุ่มของมันพร้อมกัน — ตรงกับ mockup 01) |

## 6 เทมเพลตธุรกิจไทย (seed)

| key | ชื่อ | ไอคอน | คอลัมน์ | ป้าย | การ์ด (มี checklist) |
|---|---|---|---|---|---|
| `dive-shop` | ร้านดำน้ำ/ทัวร์ทางน้ำ | shop | 5 (กล่องงานเข้า→เสร็จแล้ว) | 6 | 6 ใบ (2 มี checklist) |
| `hotel` | โรงแรม/ที่พัก | home | 5 | 5 | 5 ใบ (2 มี checklist) |
| `restaurant` | ร้านอาหาร | flag | 5 | 5 | 5 ใบ (2 มี checklist) |
| `clinic` | คลินิก/สถานพยาบาล | check | 5 | 5 | 5 ใบ (2 มี checklist) |
| `retail` | ร้านค้าปลีก | box | 4 | 5 | 4 ใบ (2 มี checklist) |
| `weekly` | งานประจำสัปดาห์ (ใช้ได้ทุกธุรกิจ) | cal | 4 | 4 | 4 ใบ (1 มี checklist) |

ทุกชุดมีคอลัมน์ `isDoneColumn=true` ปิดท้ายเสมอ (ชื่อ "เสร็จแล้ว") · เนื้อหาการ์ด/ป้าย/คอลัมน์อ้างอิงตาราง §10 ของ `docs/modules/13-kanban-v2.md` (คำต่อคำเกือบทั้งหมด ปรับให้ตรงรูป `structure` ที่ปักไว้ใน KANBAN-RUN แทนรูปแบบ `labelKeys`/`{title,items}` ของ blueprint เดิม)

## Deviation (เหตุผลที่ทำต่างจากตัวอักษรตรง ๆ)

1. **ลงทะเบียน `KanbanBoardTemplate` ใน `scope.ts` เป็นแกน `global` ไม่ใช่ `tenant`** — ตารางนี้มีทั้งแถว `tenantId=null` (แพลตฟอร์ม) และแถวผูก tenant (ของร้าน) ปนกัน ถ้าลงเป็น `tenant` แล้ววันหน้ามีใครเผลอเรียก `tenantDb()` กับตารางนี้ (โมดูล kanban วันนี้ไม่ได้ใช้ `tenantDb()` เลยสักไฟล์ — ใช้ raw prisma + where กรองเองทุกจุดตามธรรมเนียมเดิมของโมดูล) `filterFor()` จะยัด `tenantId=ctx.tenantId` ทับ WHERE เดิม ⇒ แถวแพลตฟอร์มหายไปเงียบ ๆ ทันที การลงเป็น `global` (เหมือน `PlatformAnnouncement`/`ChatWebhookLog`) ทำให้ `tenantDb()` ข้ามการ inject ไปเลย บังคับให้ทุก query กรอง tenantId เอง (ซึ่ง `templates.ts` ทำอยู่แล้วทุกฟังก์ชัน) — ตรงกับคำแนะนำที่เขียนไว้ล่วงหน้าใน `docs/modules/13-kanban-v2.md` §6.1 พอดี (`ต้องลงทะเบียนเป็น g("เทมเพลตกลางของแพลตฟอร์ม — tenantId null")`)
2. **`createBoardFromTemplateAction` ทำสองหน้าที่** (สร้างจากเทมเพลต **และ** สร้างบอร์ดเปล่า) — สัญญาปักชื่อ action นี้ไว้แต่ `CreateBoardModal.tsx` ต้องมีตัวเลือก "บอร์ดเปล่า" ด้วย (มะม็อคอัพ 01 พูดชัดว่า "เปล่า หรือเริ่มจากเทมเพลต") แทนที่จะเพิ่ม action ใหม่นอกรายการที่ปักไว้ ผมให้ `templateId` ว่าง/null แปลว่า "บอร์ดเปล่า" แล้วเรียก `createBoard()` เดิม (มีอยู่แล้วตั้งแต่ K1.1 รองรับ `unitId`/`visibility` อยู่แล้ว) ภายในฟังก์ชันเดียวกัน — โมดัลจึงเรียก action เดียวจบทั้งสองทาง ไม่ต้องมี action คู่ขนาน
3. **DTO ของเทมเพลต/หน้ารวมบอร์ด (`TemplateStructure`/`BoardTemplateDto`/`BoardsHomeCardDto`/`BoardsHomeDto`) ย้ายไปอยู่ใน `types.ts` แทนที่จะอยู่ใน `templates.ts`/`boardsHome.ts`** — บทเรียนตรงจาก K1.11 deviation #1: Turbopack เดินตามทั้งไฟล์ตอนสร้าง client chunk แม้ client component จะ `import type` แค่ชนิดเดียวจากไฟล์ที่ (ทางอ้อม) แตะ `db.ts`→`pg` ก็ตาม ⇒ ถ้าปล่อย DTO ไว้ใน `templates.ts`/`boardsHome.ts` (ทั้งคู่ import `prisma` จาก `./db`) แล้ว `BoardsHome.tsx`/`TemplatePicker.tsx`/`CreateBoardModal.tsx` (ทั้งสาม `"use client"`) `import type` จากที่นั่น จะทำให้ `bash scripts/acc-v2-serve.sh` (production build) ล้มแบบเดียวกับที่ K1.11 เจอ — ย้ายชนิดไปไฟล์บริสุทธิ์ตั้งแต่ต้น (ไม่ต้องเจอ build ล้มก่อนแล้วค่อยแก้) `templates.ts`/`boardsHome.ts` re-export ชนิดพวกนี้กลับออกไปด้วย `export type {...} from "./types"` ให้โค้ดที่เรียกผ่าน path เดิม (`@/lib/modules/kanban/templates`) ยังใช้ได้เหมือนสัญญาระบุ (`service.ts` facade ก็ export ชุดเดียวกันต่ออีกที) — build ผ่านตั้งแต่รอบแรกไม่ต้องแก้ซ้ำ (ยืนยันจาก `bash scripts/acc-v2-serve.sh` build สำเร็จ + ภาพ 5 ใบ `failures:0`)
4. **ไม่ทำ dropdown "หน่วยธุรกิจ: ทั้งหมด" ที่หัวหน้ารวมบอร์ด (ตัวกรองสาขาในมะม็อกอัพ)** — มะม็อกอัพ 01 วาดปุ่มนี้ไว้ในแถบหัวเรื่อง แต่ไม่มีในรายการ testid ที่สัญญา/oracle ปักไว้ (`boards-starred/boards-by-unit/boards-tenant/templates-row/create-board`) และหน้าออกแบบมาให้ "จัดกลุ่มตามสาขาอยู่แล้ว" (เลื่อนดูได้ตรง ๆ ไม่ต้องกรอง) — เว้นไว้เป็นส่วนขยาย ถ้าอยากได้ทำได้ในไฟล์เดียว (`BoardsHome.tsx`) โดยกรอง `home.byUnit` ฝั่ง client
5. **`overdueCount`/`cardCount` ของการ์ดบอร์ดในหน้ารวม คำนวณจาก `dueAt < now()` จริง ไม่ใช่จากวันที่อ้างของชุดข้อมูล QC (`KQC.today = 2026-09-30`)** — เหมือนที่ K1.11 บันทึกไว้แล้วว่า `searchCards` เป็นคิวรีสดใช้เวลาจริงเสมอ `boardsHome` ก็เป็นแบบเดียวกัน ⇒ ตัวเลข "เลยกำหนด" ที่เห็นในภาพ (เช่น "เลยกำหนด 4 ใบ" บนบอร์ดป่าตอง) เป็นของจริงตามเวลาที่รัน ไม่ใช่ตามสมมติฐานวันที่ 30 ก.ย. 2569 — ไม่กระทบ oracle (ไม่มีข้อทดสอบเจาะจงตัวเลขเป๊ะ เช็คแค่ `typeof number`)

## Verify — ภาพจริง (เปิดดูเองทีละใบ · เทียบ mockup 01)

`bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-kanban.mts 1.12` → `.qc-shots/kanban/1.12/`

- `boards-home-new-desktop.png` / `-mobile.png` — หัวเรื่อง "บอร์ดงาน · 3 บอร์ด · การ์ดค้าง 38 ใบ" + ช่องค้นหา (⌘K) + ปุ่ม "+ สร้างบอร์ด" ดำ · แถบ "บอร์ดติดดาว" (เตรียมติดดาวบอร์ดป่าตองไว้ก่อนถ่าย) โชว์การ์ดแถบสีฟ้าซ้าย + ชิปแดง "เลยกำหนด 4 ใบ" · แถบ "สาขาป่าตอง" (1 บอร์ด) / "สาขากะตะ" (1 บอร์ด ไม่ติดดาว ไอคอนดาวโปร่ง) / "บอร์ดกลางองค์กร" (ซ่อมบำรุงอุปกรณ์ แถบเขียว) / "เริ่มจากเทมเพลต" (6 การ์ด ไอคอน+ชื่อ+จำนวนคอลัมน์/การ์ด) — ครบ 4 แถบตามลำดับที่สัญญาระบุ (§3.1 "ติดดาว → สาขา → กลางองค์กร → เทมเพลต") มือถือยุบเป็นคอลัมน์เดียวอ่านง่าย ไม่ล้นจอ
- `template-picker-open-desktop.png` — คลิกการ์ด "ร้านดำน้ำ/ทัวร์ทางน้ำ" แล้วขยายพรีวิว: คำอธิบายไทย + ชิปคอลัมน์ 5 ใบ (ชิปสุดท้าย "เสร็จแล้ว" กรอบ/ตัวอักษรเขียวแยกจากชิปอื่น) + ปุ่มดำ "ใช้เทมเพลตนี้ →"
- `create-board-modal-filled-desktop.png` / `-mobile.png` — โมดัลกลางจอพร้อมฉากหลังจาง ช่องชื่อกรอกแล้ว + dropdown หน่วยธุรกิจ/การมองเห็น/เทมเพลตครบ 3 ตัว + ปุ่ม "ยกเลิก"/"สร้างบอร์ด" — **ไม่ได้กดยืนยัน** (ไม่มีบอร์ดเศษหลงเหลือ ตรวจแล้วหลังถ่ายด้วยสคริปต์ชั่วคราว: บอร์ด QC ยังมีแค่ 3 บอร์ดเดิม)
- ทั้ง 5 ใบ: `failures: 0`

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… SESSION_SECRET=…   (grep|cut บรรทัดเดียว · host = ep-plain-art ยืนยันแล้ว)
pnpm exec prisma generate → ✔ Generated Prisma Client
pnpm exec prisma migrate deploy → Applying migration `20260927000000_kanban_v2_i` → All migrations have been successfully applied.
pnpm exec tsx scripts/seed-kanban-templates.mts → ✅ สร้างใหม่ 6 · อัปเดต 0 (รวม 6 ชุด)
pnpm exec tsx scripts/seed-kanban-qc.mts → ✅ seed บอร์ดงาน: … บอร์ด 3 · การ์ด 38

pnpm exec tsx scripts/qc-kanban-k1.12.mts
  → ผ่าน 18/18 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":18,"passed":18,"findings":[]}

regressions:
  k1.1  {"total":30,"passed":30,"findings":[]}   k1.2  {"total":25,"passed":25,"findings":[]}
  k1.3  {"total":29,"passed":29,"findings":[]}   k1.4  {"total":30,"passed":30,"findings":[]}
  k1.5  {"total":17,"passed":17,"findings":[]}   k1.6  {"total":20,"passed":20,"findings":[]}
  k1.7  {"total":21,"passed":21,"findings":[]}   k1.8  {"total":18,"passed":18,"findings":[]}
  k1.9  {"total":18,"passed":18,"findings":[]}   k1.10 {"total":16,"passed":16,"findings":[]}
  k1.11 {"total":21,"passed":21,"findings":[]}
  qc-kanban-notify   → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → EXIT=0 (ไม่มี error)
env -i (ไม่ export env) pnpm exec tsx scripts/fitness.mts → ผ่าน 20/20 · JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

bash scripts/acc-v2-serve.sh → build สำเร็จรอบแรก (ไม่มี deviation แบบ K1.11 — ย้าย DTO ไป types.ts ไว้ล่วงหน้าแล้ว)
pnpm exec tsx scripts/visual-kanban.mts 1.12
  → JSON_SUMMARY {"wo":"1.12","user":"owner","shots":[…5 ใบ…],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว

ตรวจหลังถ่ายภาพ (สคริปต์ชั่วคราว ลบแล้ว): boards = [บอร์ดลับสาขากะตะ, ซ่อมบำรุงอุปกรณ์, งานร้าน — สาขาป่าตอง] (3 เดิม ไม่มีเศษ) · stars = 0 · templates visible = 6
```

## ⚠️ Finding — ไม่มี (oracle เขียว 18/18 ตั้งแต่รอบแรก ไม่มีข้อที่ต้องแย้ง)

## จุดที่อยากให้ Fable ลองแหย่

- **ไอคอนเทมเพลต** (`shop`/`home`/`flag`/`check`/`box`/`cal`) เลือกจากชุดที่มีอยู่แล้วใน `KanbanIcon.tsx` (ห้ามวาดไอคอนใหม่ตามกติกา §5.7) ไม่มีไอคอนเฉพาะทาง "ร้านอาหาร"/"คลินิก" ในสไปรต์ที่อนุมัติแล้ว — เลือก `flag`/`check` แทนแบบมีเหตุผลแต่ไม่ตรงตัวอักษร (ดู deviation ที่ไม่ได้เขียนแยกเพราะเป็นทางเลือกด้านความหมาย ไม่ใช่ทางลัดของสัญญา) ถ้าอยากได้ไอคอนเฉพาะทาง ต้องเพิ่มลาย SVG ใหม่ในสไปรต์ก่อน (ต้องผ่านเจ้าของ/นักออกแบบ)
- **แผงเลือกหน่วยธุรกิจที่หัวหน้ารวมบอร์ด (dropdown กรอง) ยังไม่ทำ** — ดู deviation ข้อ 4 · ถ้าอยากได้ ทำได้ในไฟล์เดียว (`BoardsHome.tsx`) โดยกรอง `home.byUnit`/`home.tenantWide` ตาม state ใหม่
- **`saveBoardAsTemplate` รวมเช็คลิสต์หลายชุดของการ์ดเดียวเป็น array เดียว (flatten)** — ชนิด `TemplateCardSpec.checklist` เป็น `string[]` แบนราบ (ตามสัญญา — 1 การ์ด = เช็คลิสต์ได้ 1 ชุดเมื่อสร้างจากเทมเพลต) ถ้าบอร์ดต้นทางมีการ์ดที่มี 2 เช็คลิสต์ขึ้นไป รายการจากทั้งสองชุดจะถูกรวมเป็นชุดเดียวชื่อ "ขั้นตอนงาน" ตอนสร้างบอร์ดใหม่จากเทมเพลตนั้น (ไม่ error แต่ข้อมูลย่อยหายจากการแบ่งกลุ่ม) — ไม่มีบอร์ด QC ไหนมีเช็คลิสต์ 2 ชุดต่อการ์ดในสัญญา K1.7 จึงยังไม่เจอเคสนี้จริง แต่เป็นไปได้ในอนาคต
- **ลอง**: กด "บันทึกเป็นเทมเพลต" จากเมนู ⋯ ของบอร์ด "บอร์ดลับสาขากะตะ" (PRIVATE ที่ thana มองไม่เห็น) ด้วยสิทธิ์ ADMIN จริง (owner) → ควรบันทึกได้ปกติ (การมองเห็นเทมเพลตไม่ผูกกับ visibility ของบอร์ดต้นทาง — เทมเพลตที่ได้เป็น TENANT เห็นได้ทั้งร้านแม้บอร์ดต้นทางจะเป็นบอร์ดลับ) — เป็นพฤติกรรมที่ตั้งใจ (เทมเพลตไม่ใช่สำเนาข้อมูลลับ เป็นแค่โครงคอลัมน์/ชื่อการ์ด) แต่ควรตรวจสายตาว่าตรงกับที่เจ้าของคาดหวังไหม
- **ลอง**: สร้างบอร์ดจากเทมเพลตซ้ำ ๆ หลายรอบติดกันเร็ว ๆ (ไม่รอ debounce) — แต่ละครั้งเป็น `prisma.$transaction` แยกกัน ไม่มี unique constraint กันบอร์ดชื่อซ้ำ ⇒ สร้างบอร์ดชื่อเดียวกันซ้ำได้หลายใบ (ตั้งใจ — เหมือน Trello ที่สร้างบอร์ดชื่อซ้ำได้เสมอ ไม่ใช่บั๊ก)
