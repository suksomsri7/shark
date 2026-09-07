# K3.1 — `KanbanCardLink` เชื่อมข้อมูล SHARK (ผูกการ์ดกับวัตถุโมดูลอื่น 20 ชนิด · ตัวแปลผลรายชนิด · เช็คสิทธิ์รายคนทุกครั้ง · ขาย้อน · facade `createCardFromExternal`)

> WO: `ledger/KANBAN-RUN.md` §K3.1 · ข้อสอบ: `scripts/qc-kanban-k3.1.mts` (20 ข้อ · Fable เขียน · builder ไม่แตะ)
> โมเดล: Opus ตามตาราง WO · เกณฑ์: `docs/modules/13-kanban-v2.md` §9.1 / §4.2 / §4.3 / §13 K3.1

## 1. สิ่งที่ทำ (ภาพรวม)

1. **สคีมา + ไมเกรชัน `20261008000000_kanban_v2_r`** (additive ล้วน · อ่าน SQL ด้วยตาแล้ว ไม่มี DROP/ALTER TYPE ของคอลัมน์เดิม):
   - `enum KanbanLinkType` 20 ค่าตาม §4.2
   - `model KanbanCardLink` (`tenantId systemId cardId linkType linkId role label createdById removedAt createdAt updatedAt`)
     · `@@unique([cardId, linkType, linkId])` (ผูกซ้ำ = ไม่มีแถวที่สอง) · `@@index([tenantId, systemId, linkType, linkId])` (ขาย้อน) · `@@index([cardId, removedAt])`
   - `KanbanCard.sourceKey String?` + **partial unique** `("tenantId","sourceKey") WHERE "sourceKey" IS NOT NULL`
     (เขียนมือใน migration.sql — Prisma schema ไม่รองรับ `WHERE` บน `@@unique` · แพตเทิร์นเดียวกับ `KanbanInboxItem` K2.8 / `KanbanBoardTemplate` K1.12)
   - `KanbanActivityType` เพิ่ม `LINK_ADDED` / `LINK_REMOVED` (enum เดิมมี 24 ค่า ไม่มี 2 ตัวนี้ — §4.2 ระบุไว้แต่ K1.10 ยังไม่ได้ลง)
   - `src/lib/core/scope.ts`: `KanbanCardLink: sys()`
   - ลง QC ด้วย `prisma migrate deploy` + `prisma generate` (ไม่ใช้ `prisma format`)

2. **`link-resolvers.ts` (ใหม่) — ทะเบียนชนิด + ตัวแปลผล + ฝั่งอ่าน**
   - `LINK_TYPES: Record<KanbanLinkKind, { label, icon, modules, action, canView, href, resolve }>` ครบ 20 ชนิด
   - `resolveTargets(ctx, refs)` จัดกลุ่มตามชนิดแล้วยิงคิวรี **ชนิดละครั้ง** (กัน N+1) · ปลายทางที่โมดูลนั้นพัง = แถวกลายเป็น "(ถูกลบไปแล้ว)" ไม่ทำให้เปิดการ์ดไม่ได้
   - `toLinkDto()` = **จุดตัดสินสิทธิ์จุดเดียว** — `canView=false` สร้าง DTO จากป้ายชนิดล้วน ๆ (ไม่แตะ `target` เลย) ⇒ ชื่อลูกค้า/preview/ยอดเงิน/ลิงก์ ไม่มีทางหลุด แม้เขียนพลาดข้างล่าง
   - `listCardLinks(ctx, actor, cardId)` (VIEWER+) · `listCardsForTarget(ctx, actor, {linkType, linkId})` (กรอง `visibleBoardsWhere` + บอร์ด ACTIVE + `removedAt: null`) · `linkCountsOfCards` (groupBy — ชิปบนการ์ด) · `linkChipsOfCards` (คอลัมน์ "เชื่อม" ของตาราง)
   - **สิทธิ์**: `moduleGate()` — OWNER ผ่าน · MANAGER ผ่านในหน่วยที่คุม (`canAccessUnit` เดิม) · STAFF ต้องมีคีย์อ่านของโมดูล
     (`chat.conversation.read` · `inventory.item.read` · `hr.leave.read` · `account.doc.view` · `approval.request.decide` **หรือเป็นผู้ยื่น**) · โมดูลที่ยังไม่มีคีย์อ่านใช้ "มีคีย์ `{module}.*` ตัวใดตัวหนึ่ง" แบบเดียวกับ `canReadKanban` · `PARTY` = crm/account/party · `URL` = ทุกคน
   - **ไม่มี cache ระดับโมดูล** — คิดใหม่ทุกครั้งจาก `actor` ที่ส่งเข้ามา (ข้อสอบ S2.7 ยืนยัน: ให้คีย์ในหน่วยความจำแล้วเห็นทันที)

3. **`links.ts` (ใหม่) — ฝั่งเขียน + facade**
   - `addLink` (EDITOR · URL บังคับ `https?://` · ชนิดอื่นต้อง resolve เจอในร้านนี้ · label ≤ 120 · ซ้ำ = คืนแถวเดิม · ถอดแล้วผูกใหม่ = คืนชีพแถวเดิม · `KANBAN_LIMITS.linksPerCard = 30` เกิน → throw ไทย)
   - `removeLink` (EDITOR · soft delete `removedAt` · ถอดซ้ำ = เงียบ) · ทั้งคู่เขียน `KanbanActivity` ใน tx เดียวกับงานจริง
   - `createCardFromExternal(ctx, input) → { cardId, created }` — **ประตูเดียว** ของ K3.2/K3.3/K3.9: กันซ้ำ 2 ชั้น (อ่านก่อน + unique ของ DB) · ชนกันตอนยิงพร้อมกัน = อ่านซ้ำแล้วคืน `created:false` ไม่โยน error · คอลัมน์ปริยาย = คอลัมน์ ACTIVE แรกตาม `position` · `description` ผ่าน `sanitizeDescription` · บอร์ดไม่มี/ARCHIVED → throw ไทย
   - `searchPartiesForLink` (ผ่าน facade party)
   - 🔴 ไม่ import โมดูล chat/forms/approval/hr/pos/account เลย (ทิศทางเดียว)

4. **`link-labels.ts` (ใหม่)** — ป้ายไทย + ไอคอนของ 20 ชนิด · ไฟล์ **บริสุทธิ์ ไม่แตะ prisma** เพราะถูกอ่านจากทั้ง server (`link-resolvers`) และฝั่ง client (`activity-text.ts` ที่ `Timeline.tsx` เรียก)

5. **DTO / จุดต่อ**
   - `CardDetailDto.links` (เติมจริงใน `cards.getCardDetail` — `loadActor(ctx)` แล้วส่งเข้า `listCardLinks`)
   - `BoardCardDto.linkCount` (`service.getBoardView` เพิ่มคิวรีใน `Promise.all` เดิม — ไม่เพิ่ม round-trip แบบลูก) + `toBoardCardDto` รับพารามิเตอร์ใหม่
   - `TableRowDto.links` เติมจริงใน `table.ts` — **หลังแบ่งหน้า** (บอร์ด 500 การ์ดแสดง 50 แถว ⇒ resolve 50 แถว) และคืนเฉพาะแถวที่ผู้ดูมีสิทธิ์
   - `KanbanActivityKind` + `describeActivity` + `activityIconName` รองรับ LINK_ADDED/LINK_REMOVED (ประวัติพูดถึง **ชนิด** ไม่ใช่ชื่อของปลายทาง — คนอ่านประวัติอาจไม่มีสิทธิ์เห็นชื่อ)

6. **UI** — `CardLinks.tsx` (ใหม่) testid `card-links` วางเหนือ "รายละเอียด" ตามภาพ 03 · แถว = ไอคอน + title/subtitle + ชิปสถานะ + ลิงก์ "เปิด" · ไม่มีสิทธิ์ = พื้นเทา ตัวเทา "(ไม่มีสิทธิ์เข้าถึง)" ไม่มีลิงก์ · × ถอด (ยืนยัน inline) · ปุ่ม "เพิ่มการเชื่อม" testid `card-link-add` → แผง 2 แท็บ (ลิงก์ภายนอก / ผู้ติดต่อค้นชื่อ) · `Card.tsx` ชิปจำนวน testid `card-link-count` · ชิป "เชื่อมข้อมูล SHARK" ในเมนู "เพิ่ม:" ของหัวการ์ด (เดิม `disabled` = "เร็ว ๆ นี้") ต่อให้กางแผงเดียวกันแล้ว

7. **actions 3 ตัว** `addCardLinkAction` / `removeCardLinkAction` / `searchPartyForLinkAction` (คืน `links` ทั้งชุดจาก server เสมอ — client ไม่ประกอบสิทธิ์เอง)

8. **REST ops 3 ตัว** `api/ops/links.ts`: `cards.links.list` (GET) · `cards.links.add` (POST) · `cards.links.remove` (DELETE) ที่ `/cards/{id}/links` · `test: "K3.1-S6.2"` · ต่อในทะเบียน `api/registry.ts` (85 op) · regen `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/references/endpoints.md` + copy ไป `/root/.claude/skills/shark-kanban-api/`
   - ไม่ประกาศ `tool:` (สัญญาไม่ได้สั่ง — เลี่ยงการแตะ `src/lib/ai/skills.ts` ใน WO นี้)

9. **facade ของ party เพิ่ม 2 ตัว (อ่านอย่างเดียว)** `listBriefsByIds` / `searchByName` — คืนแค่ `{ id, name }` เท่านั้น (ไม่มี phone/email/taxId/address) · เพิ่มเส้น `kanban→party` ใน `ALLOWED_EDGES` ของ `scripts/fitness.mts` พร้อมคอมเมนต์อ้าง WO

10. **`inbox.moveToBoard` ใช้ `sourceKey` จริงแล้ว** (หนี้ที่ K2.8 ฝากไว้) — การ์ดที่เกิดจากรายการภายนอกพกกุญแจเดียวกับต้นทาง · มีด่านตรวจก่อนเข้า tx: ต้นทางชิ้นนี้เคยเป็นการ์ดแล้ว → ข้อความไทย ("เรื่องนี้ถูกสร้างเป็นการ์ด #n ไปแล้ว") ไม่ใช่ error ดิบจากการชน unique

11. **`scripts/visual-kanban.mts`** เพิ่ม spec `"3.1"` (ชื่อไฟล์ผูกกับ `--user` เพื่อไม่ให้รอบที่สองทับรอบแรก) + บล็อกเตรียม/คืนสภาพ

## 2. ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20261008000000_kanban_v2_r/migration.sql`
- `src/lib/modules/kanban/link-resolvers.ts` · `links.ts` · `link-labels.ts`
- `src/lib/modules/kanban/api/ops/links.ts`
- `src/components/kanban/CardLinks.tsx`

**แก้**
- `prisma/schema/kanban.prisma` · `src/lib/core/scope.ts`
- `src/lib/modules/kanban/{limits,types,service,cards,table,actions,activity-text,inbox}.ts` · `api/registry.ts`
- `src/lib/modules/party/{index,service}.ts`
- `src/components/kanban/{Card,CardBack}.tsx`
- `scripts/fitness.mts` (ALLOWED_EDGES) · `scripts/visual-kanban.mts` (spec 3.1)
- `docs/api/KANBAN-API.md` + skill endpoints (regen)

## 3. ผลด่าน (ตัวเลขจริง)

| ด่าน | ผล |
|---|---|
| `qc-kanban-k3.1.mts` (ตามที่ Fable เขียน ไม่แก้) | **10/11 · CRASH** — ข้อสอบอ้าง `E.boards.kataSecret.id` แต่ seed ให้คีย์ `kata` (ดู §5) |
| `qc-kanban-k3.1.mts` (สำเนาชั่วคราว แก้ `kataSecret` → `kata` คำเดียว แล้วลบทิ้ง) | **20/20** (CRITICAL 0 · MAJOR 0) |
| `tsc --noEmit` ทั้งโปรเจกต์ | **0 error** |
| `scripts/fitness.mts` | **23/23** (F1/F8 model ใหม่ผ่าน · F2.1 เส้นใหม่แค่ `kanban→party` · F13.4 85 op มี test · F13.5 คู่มือไม่ stale) |
| `qc-kanban-k1.*` 15 ชุด | k1.1 30/30 (รอบแรก S2.5 flake `cardNoSeq` ตามหนี้เดิม — รันเดี่ยวเขียว) · k1.2 25/25 · k1.3 29/29 · k1.4 30/30 · **k1.5 17/17 (แดงรอบแรก 1 ข้อ — ดู §6)** · k1.6 20/20 · k1.7 21/21 · k1.8 18/18 · k1.9 18/18 · k1.10 16/16 · k1.11 21/21 · k1.12 18/18 · k1.13 16/16 · k1.14 15/15 · k1.15 30/30 |
| `qc-kanban-k2.*` 12 ชุด | k2.1 22/22 · k2.2 16/16 · k2.3 17/17 · k2.4 12/12 · k2.5 15/15 · k2.6 17/17 · k2.7 31/31 · k2.8 17/17 · k2.9 26/26 · k2.10 22/22 · k2.11 30/30 · k2.12 13/13 |
| `qc-kanban-notify.mts` | 12/12 |
| `qc-ai-skills.mts` | 23/23 |
| `qc-nav-functions.mts` | ผ่านทั้งหมด (10 เช็ก) |
| `qc-ai-kanban-board.mts` | 3/3 |
| ภาพ | 5 ใบใน `.qc-shots/kanban/3.1/` (ต้องการ ≥ 3) |
| ฐาน QC หลังจบงาน | `KanbanCardLink` 0 · การ์ดที่มี `sourceKey` 0 · Party 0 · AppSystem CHAT 0 · ApprovalPolicy 0 · การ์ดรวม 38 (= seed) · สิทธิ์ธนากลับเป็นชุดเดิม |

### ภาพที่ถ่าย (เปิดดูครบทุกใบ)
| ไฟล์ | เห็นอะไร |
|---|---|
| `card-links-owner-desktop.png` | บล็อก "เชื่อมข้อมูล SHARK" เหนือ "รายละเอียด" · 2 แถว: "คุณสมชาย ใจดี (ลูกค้า) / ผู้ติดต่อ (CRM / Party)" + "คู่มือส่งซ่อมเรกูเลเตอร์ / ลิงก์ภายนอก · https://…" ทั้งคู่มี "เปิด ›" + × · ประวัติมี 2 บรรทัด "เชื่อมการ์ดกับ…" · การ์ดบนบอร์ดหลังโมดัลขึ้นตราลิงก์ **2** |
| `card-link-add-desktop.png` | แผง "เพิ่มการเชื่อม" 2 แท็บ (ลิงก์ภายนอก/ผู้ติดต่อ) · ช่อง `https://…` + ช่องป้ายกำกับ + ปุ่ม "เชื่อมลิงก์" (จางเพราะยังไม่กรอก) · ชิป "เชื่อมข้อมูล SHARK" ที่หัวการ์ดเป็นสีน้ำเงิน (กดได้แล้ว) |
| `card-link-added-desktop.png` | **กดจริงบน production build**: กรอก URL + ป้าย → กด "เชื่อมลิงก์" → แถวที่ 3 "ใบเสนอราคาอะไหล่ (เพิ่มจากหน้าจอจริง)" โผล่ · ตราบนการ์ดขยับเป็น **3** |
| `card-link-removed-desktop.png` | กด × แถวล่างสุด → "ถอดออก" → เหลือ 2 แถว · ตราบนการ์ดกลับเป็น **2** · ประวัติยังมี 2 บรรทัด "เชื่อมการ์ดกับลิงก์ภายนอก" (soft delete ไม่ลบประวัติ) |
| `card-links-thana-desktop.png` | ธนา (VIEWER + ไม่มีสิทธิ์โมดูลปลายทาง): แถวครบ 2 แถวเหมือนเดิม แต่แถว PARTY = "ผู้ติดต่อ (CRM / Party) **(ไม่มีสิทธิ์เข้าถึง)**" พื้นเทา ไม่มี "เปิด" · ไม่มีชื่อ "คุณสมชาย" ที่ไหนในหน้า · แถว URL ยังเห็นและกด "เปิด" ได้ · ไม่มีปุ่ม "เพิ่มการเชื่อม"/× (VIEWER) |

## 4. การตัดสินใจสำคัญ (deviation + เหตุผล)

| # | เรื่อง | ตัดสิน |
|---|---|---|
| D1 | **แยกไฟล์ `links.ts` / `link-resolvers.ts`** | สัญญาเขียนว่า "+ `link-resolvers.ts` ถ้าแยก" · **ต้องแยกจริง**: `cards.getCardDetail` ต้องอ่านการเชื่อม แต่ฝั่งเขียนต้องเรียก `service.createCard` → `cards.ts` ⇒ รวมไฟล์เดียว = วง `cards → links → service → cards` (บทเรียนเดียวกับ `activity.ts ↔ members.ts` ใน K1.10) · ฝั่งอ่านจึงอยู่ `link-resolvers.ts` ที่ไม่รู้จัก `service.ts` เลย · `links.ts` re-export ให้ผู้เรียกเห็นเป็นทางเข้าเดียว |
| D2 | `label` **ไม่โชว์** เมื่อ `canView=false` | §9.1 เขียนว่า "label เก็บได้แค่ชื่อสั้น ๆ ไว้แสดงตอนไม่มีสิทธิ์" แต่ข้อสอบ S2.6 บังคับว่า DTO ของแถวที่ไม่มีสิทธิ์ **ต้องไม่มี** ชื่อลูกค้าเลย (`!/สมชาย/.test(JSON.stringify(row))`) และ label ที่ผู้ใช้พิมพ์อาจ **เป็น** ชื่อลูกค้าเอง ⇒ ตัด `label` ออกจาก DTO ทั้งก้อน ใช้ `title = "{ชนิด} (ไม่มีสิทธิ์เข้าถึง)"` แทน (ปลอดภัยกว่า และเป็นสิ่งที่ §13 K3.1 ตรวจ) |
| D3 | `href` ของชนิดที่ยังไม่มีหน้ารายตัว | §9.1 เขียน URL แบบ "รายตัว" ไว้หลายชนิดที่ **route ยังไม่มีจริง** ⇒ ยึด "ลิงก์ที่กดแล้วไปถึงจริง": `ACCOUNT_DOC` → `/app/sys/{sys}/account/docs/{docType}/{id}` (route จริง ไม่ใช่ `/account/documents/{id}` ที่เป็นหน้าแฟ้มเอกสาร) · `APPROVAL_REQUEST` → `/app/approvals?r={id}` (route จริงคือ `/app/approvals`) · `CRM_CONTACT` → `.../crm/contacts?c={id}` · โมดูลผูกสาขา (นัดหมาย/ห้องพัก/เช่า/คาบเรียน/คิว/อีเวนต์/ร้านออนไลน์/ร้านอาหาร) → `/app/u/{unitSlug}/…` (resolve slug จาก `unitId` คิวรีเดียวต่อชนิด) · `FORM_SUBMISSION` → ลิงก์ไป **ตัวฟอร์ม** ไม่ใช่คำตอบรายใบ (คำตอบคือข้อมูลลูกค้า) |
| D4 | `PARTY` → `/app/party/{id}` | ตามข้อสอบ S2.5 เป๊ะ ๆ — **route นี้ยังไม่มีในแอป** (ดู §7 หนี้) |
| D5 | `partial unique` ของ `sourceKey` ประกาศเฉพาะใน migration | Prisma schema ไม่รองรับ `WHERE` บน `@@unique` · แพตเทิร์นที่รีโปนี้ใช้อยู่แล้ว 2 ที่ (`KanbanInboxItem`, `KanbanBoardTemplate`) — เขียนคอมเมนต์กำกับในสคีมาไว้ให้คนอ่านรู้ |
| D6 | REST op ไม่ประกาศ `tool:` | สัญญา §K3.1 สั่งแค่ REST + docs/skill · การเพิ่ม tool ต้องแตะ `SKILLS`/`KIND_ACCESS` ซึ่งเป็นของ K3.5 (เครื่องมือ AI) — ไม่ล้ำ WO อื่น |
| D7 | ชนิดที่กดเพิ่มเองได้จาก UI = URL + PARTY เท่านั้น | ตามสัญญา ("ชนิดอื่นเกิดจาก integration/automation") — REST เปิดครบ 20 ชนิดตามปกติ |
| D8 | ตาราง K2.1 คอลัมน์ "เชื่อม" ซ่อนแถวที่ไม่มีสิทธิ์ | ต่างจากหลังการ์ดโดยตั้งใจ: หลังการ์ดต้อง "บอกว่ามีของอยู่" (§9.1) ส่วนตารางเป็นมุมมองสรุป — ช่องเทาเต็มคอลัมน์ไม่ให้ข้อมูลอะไรกับใคร |

## 5. ข้อแย้งกับข้อสอบ (พร้อมหลักฐาน)

**`K3.1-S3.1` / CRASH — ข้อสอบอ้างคีย์บอร์ดที่ seed ไม่ได้สร้าง**

- บรรทัดในข้อสอบ (`scripts/qc-kanban-k3.1.mts` บล็อก S3):
  `const kata = await svc.createCard({ … boardId: E.boards.kataSecret.id … })`
- เฉลยที่ seed เขียนจริง (`scripts/kanban-expected.json`): `boards` มีคีย์ **`patong` · `maint` · `kata`** — ไม่มี `kataSecret`
  ```
  $ python3 -c "import json;print(list(json.load(open('scripts/kanban-expected.json'))['boards'].keys()))"
  ['patong', 'maint', 'kata']
  ```
- ผล: `E.boards.kataSecret` = `undefined` → `TypeError: Cannot read properties of undefined (reading 'id')` → ตกลง `catch` ⇒ ข้อสอบจบที่ **10/11 (CRASH)** โดยไม่ได้ตรวจ S3–S6 เลย
- พิสูจน์ว่าเป็นปัญหาของข้อสอบ ไม่ใช่ของโค้ด: ทำสำเนา `scripts/qc-kanban-k3.1.localfix.mts` ที่ **แก้คำเดียว** (`E.boards.kataSecret.id` → `E.boards.kata.id`) แล้วรัน ได้ **20/20 · CRITICAL 0 · MAJOR 0** จากนั้นลบสำเนาทิ้ง (ไม่เหลือไฟล์ในทรี — `ls scripts/qc-kanban-k3.1*` เหลือไฟล์เดียว)
- **ขอให้ Fable แก้ไฟล์ข้อสอบเอง** (กติกาข้อ 1) — แก้ 1 จุด: `kataSecret` → `kata`

## 6. บั๊กที่ตัวเองทำแล้วแก้ระหว่างทาง

- **`K1.5-S4.4` แดง 1 รอบ**: คอมเมนต์ที่เขียนใน `Card.tsx` มีอักขระ 🔗 ซึ่งอยู่ในช่วง `U+1F300–U+1FAFF` ที่ข้อสอบ K1.5 ห้ามไว้ทั้งไฟล์ (ไม่ใช่แค่ข้อความบนจอ) → เปลี่ยนคอมเมนต์เป็นตัวหนังสือล้วน แล้ว k1.5 กลับเป็น **17/17** · บทเรียน: ข้อสอบ "ห้ามอีโมจิ" ของ `BoardView/Column/Card` สแกนทั้งไฟล์รวมคอมเมนต์
- **ถ่ายภาพธนาไม่ได้รอบแรก (500)**: ดู §7 หนี้ ข้อ 1

## 7. หนี้ / เรื่องที่ต้องตัดสินต่อ

1. 🔴 **หนี้เดิม (ไม่ใช่ของ K3.1) — พนักงานที่มีแต่คีย์ `kanban.card.*` เปิดบอร์ดได้ แต่เปิด "หลังการ์ด" ไม่ได้ (500)**
   - หน้าบอร์ด (`b/[boardId]/page.tsx`) ใช้ `canReadKanban(actor)` ซึ่งมีกติกา backward-compat §6.1 ("มีคีย์ `kanban.*` ตัวใดตัวหนึ่ง = ได้ read โดยนัย")
   - แต่ `getCardDetailAction` (และ action อื่นอีก ~20 จุดใน `actions.ts`) เรียก `assertKanbanCan(auth, "kanban.board.read")` ซึ่งเป็น `assertCan` **ตรงตัว** (รับเฉพาะคีย์นั้นหรือ `kanban.*` แบบสตริงเป๊ะ)
   - ธนาใน seed มี `{kanban.card.move, kanban.card.create, kanban.card.update, kanban.board.create}` ⇒ เปิดบอร์ดได้ แต่เปิดการ์ดแล้วได้ `ForbiddenError: ไม่มีสิทธิ์: kanban.board.read` (เห็นใน `.qc-shots/acc-v2/server.log`)
   - **ไม่แก้ใน WO นี้** (แตะ ~20 call site ของ action อื่น = เสี่ยงกับข้อสอบชุดอื่นทั้งหมด) — Fable ตัดสินว่าจะให้ `assertKanbanCan` ใช้ `canReadKanban` เป็น fallback ไหม
   - เลี่ยงชั่วคราวเฉพาะตอนถ่ายภาพ: `visual-kanban.mts` เติมคีย์ `kanban.board.read` ให้ธนา **แล้วคืนชุดสิทธิ์เดิมเป๊ะ ๆ** ใน `restoreSeed()` (ยืนยันหลังรัน: สิทธิ์ธนากลับเป็น 4 คีย์เดิม)
2. **`/app/party/{id}` ยังไม่มี route** — ข้อสอบ S2.5 บังคับ href นี้ และ §9.1 ก็เขียนไว้แบบนี้ ⇒ วันนี้ลิงก์ PARTY บนหลังการ์ดกดแล้ว 404 · ต้องมีหน้าโปรไฟล์ผู้ติดต่อกลาง (งานของโมดูล party ไม่ใช่บอร์ดงาน) หรือเปลี่ยนเป็นหน้า CRM
3. **ไม่มีขาย้อนบนหน้าจอ** — `listCardsForTarget` พร้อมใช้แล้ว แต่ยังไม่มี UI ที่ไหนเรียก (สัญญาไม่ได้สั่ง — จะไปโผล่ที่ K3.4 "ย้อนกลับ outbound" / หน้าผู้ติดต่อ)
4. **K2.9 action `add_link`** — สัญญาระบุว่าเป็นทางเลือก ("ไม่บังคับใน oracle") · **ยังไม่ทำ**
5. **`sourceType` enum ยังไม่มีค่า `INBOX`** ที่ §4.2 เขียนไว้ (เป็นหนี้จาก K1.1 — `moveToBoard` map เป็น `MANUAL`) ไม่เกี่ยวกับ WO นี้แต่เจอระหว่างทาง
6. **ยังไม่ได้รัน `pnpm qc:all` เต็ม** (ข้อห้ามของ WO — builder ห้ามรัน) · ชุดที่ WO สั่งให้รันรันครบแล้วทั้งหมด
