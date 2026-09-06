# K1.15 — REST API + AI tools ของบอร์ดงาน (บันทึกผู้ทำ)

> WO: `ledger/KANBAN-RUN.md` §K1.15 · decision **D15** (API+AI ของบอร์ดงาน) และ **D18** (บทบาทของคีย์บนบอร์ด)
> ข้อสอบ: `scripts/qc-kanban-k1.15.mts` (30 ข้อ · Fable เขียน · builder ไม่แตะ)

## 1. สิ่งที่ทำ (ภาพรวม)

1. **ยกแกน REST เป็นของกลาง** — `src/lib/api/{op,respond,run,idempotency,require,dispatch,openapi,actor}.ts`
   ดึงออกมาจาก `src/lib/modules/account/api/*` (ไฟล์ของบัญชีกลายเป็น re-export บาง ๆ · พฤติกรรมเดิมทุกอย่าง)
2. **ทะเบียน op ของบอร์ดงาน** — `src/lib/modules/kanban/api/registry.ts` **56 op** (ต้องการ ≥ 50)
   แยกเป็นไฟล์ `api/ops/{core,boards,columns,cards,labels,checklists,comments,attachments,misc}.ts`
3. **REST** — `/api/v1/kanban/*` (catch-all) + `/api/v1/kanban/openapi.json`
4. **ชุดสิทธิ์** — `kanban-read` / `kanban-edit` / `kanban-admin` ใน `src/lib/api-keys/scopes.ts` + หน้าจอออกคีย์ที่
   `บอร์ดงาน › ตั้งค่า › API`
5. **AI** — `src/lib/ai/kanban-ops.ts` + `tools-kanban.ts` (generate 16 tool จากทะเบียน) · สกิล `tasks` ใช้ของจากทะเบียน
   โดยคงชื่อเดิม `kanban_my_tasks` / `kanban_create_board` / `kanban_create_card`
6. **เอกสาร** — `scripts/gen-kanban-api-docs.mts` → `docs/api/KANBAN-API.md` + สกิล Claude `shark-kanban-api`
   (+ สำเนาไป `/root/.claude/skills/`) · หน้า `/developers/kanban` และ `/developers/kanban.md`
7. **เหตุการณ์** — `kanban.*` 9 ตัวใน `webhooks/labels.ts` + consumer ครบทุกตัว · ยิงจริงเพิ่ม `card.created` / `card.archived`
8. **ด่าน fitness F13** — ขยายเป็น F13.4/F13.5/F13.6 ครอบทะเบียนบอร์ดงาน (ข้อสอบครอบ · คู่มือไม่เก่า · tool มีบ้าน)

## 2. ไฟล์ที่แตะ

**แกนกลางใหม่ (ของกลาง · ทั้งบัญชีและบอร์ดงานใช้ร่วม)**
- `src/lib/api/op.ts` `respond.ts` `run.ts` `idempotency.ts` `require.ts` `dispatch.ts` `openapi.ts` `actor.ts` (ใหม่)
- `src/lib/core/errors.ts` (ใหม่ — `isSafeUserMessage`/`safeReason` ย้ายออกจาก `modules/account/errors.ts`)

**บัญชี (เปลี่ยนเป็น re-export บาง ๆ · พฤติกรรมเดิม)**
- `src/lib/modules/account/api/{op,respond,run,idempotency}.ts` = re-export ล้วน
- `.../api/require.ts` = `ACCOUNT_API_CONFIG` + `requireAccountApi` ที่เรียกแกนกลาง (ข้อความไทยเดิมทุกตัวอักษร)
- `.../api/dispatch.ts` = ผูก `ACCOUNT_OPS` + config เข้ากับ `coreDispatch`
- `.../api/registry.ts` = `matchOp`/`allowedMethods` เรียก `matchOpIn`/`allowedMethodsIn` ของแกนกลาง
- `.../api/openapi.ts` = คำนำของบัญชี (INFO_DESCRIPTION เดิม) + เรียก `coreBuildOpenApi(ops, ACCOUNT_DOC_INFO)`
- `.../api/actor.ts` = ตรรกะ IMPLIES ของบัญชีเหมือนเดิม + `accountApiKeyActor()` (ผูก `can()` เข้า actor)
- `src/lib/modules/account/errors.ts` = re-export ตัวช่วย 2 ตัวจาก core
- `src/lib/ai/account-ops.ts` = actor 2 ตัวเติม `can`/`denyMessageTh` (ข้อความเดิม)

**บอร์ดงาน — API ใหม่**
- `src/lib/modules/kanban/api/{actor,op,config,dispatch,registry,openapi,serialize}.ts`
- `src/lib/modules/kanban/api/ops/{core,boards,columns,cards,labels,checklists,comments,attachments,misc}.ts`
- `src/app/api/v1/kanban/[...path]/route.ts` · `src/app/api/v1/kanban/openapi.json/route.ts`

**บอร์ดงาน — service ที่ต้องเปิดทางให้ actor ของคีย์**
- `types.ts`: `KanbanCtx.actor?` (actor สำเร็จรูป) · `KanbanActor.apiRole?`
- `access.ts`: `canReadKanban` / `boardRole` / `visibleBoardsWhere` รู้จัก `apiRole` (D18)
- `members.ts`: `loadActor` ใช้ `ctx.actor` ถ้ามี · เพิ่ม `assertLabelRole`
- `service.ts`: เพิ่ม `updateBoardFields` (คำอธิบาย/สี/สาขา) + ยิง `kanban.card.created`
- `cards.ts`: `archiveCard` ยิง `kanban.card.archived`
- `nav.ts`: หมวด "ตั้งค่า" soon → ready

**คีย์ API / สิทธิ์**
- `src/lib/api-keys/scopes.ts`: `KANBAN_SCOPE_KEYS` + bundle `kanban-read`/`kanban-edit`/`kanban-admin`
- `src/lib/api-keys/service.ts`: `verifyApiKeyDetailed` คืน `createdById` (ผู้เขียนความเห็นผ่าน API)
- `src/components/account-v2/ConnectionsPanel.tsx`: เติมคำแปลไทยของ bundle ใหม่ (typecheck บังคับให้ครบ)

**AI**
- `src/lib/ai/kanban-ops.ts` (ใหม่) · `src/lib/ai/tools-kanban.ts` (ใหม่)
- `src/lib/ai/tools.ts`: ถอด tool เขียนมือ 3 ตัว → `...kanbanTools()`
- `src/lib/ai/proposals.ts`: kind `kanban.*` (KIND_ACCESS + DESTRUCTIVE + dispatch) · kind รุ่นเก่ายังอยู่ครบ
- `src/lib/ai/skills.ts`: สกิล `tasks` = 16 tool จากทะเบียน + ด่านความครบถ้วน + gating ตาม scope ของคีย์

**หน้าจอ / เอกสาร / ด่าน**
- `src/lib/modules/kanban/settings-actions.ts` (ใหม่) · `src/components/kanban/ApiKeysPanel.tsx` (ใหม่)
- `src/app/app/sys/[id]/kanban/settings/page.tsx` (ใหม่ — "ตั้งค่า › API")
- `scripts/gen-kanban-api-docs.mts` → `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/**` (+ สำเนา `/root/.claude/skills/`)
- `src/app/developers/kanban/page.tsx` · `src/app/developers/kanban.md/route.ts` · ลิงก์ใน `src/app/developers/page.tsx`
- `src/lib/webhooks/labels.ts` (9 event) · `src/lib/outbox-consumers.ts` (consumer ครบ) · `scripts/fitness.mts` (F13.4–F13.6)
- probe ของผู้ทำ (ไม่ใช่ข้อสอบ): `scripts/probe-k115-registry.mts` · `scripts/probe-k115-optable.mts` · `scripts/probe-k115-csv.mts`

## 3. ตาราง op (56 ตัว)

| op id | method | path | kind | สิทธิ์ (action) | AI tool |
|---|---|---|---|---|---|
| `ping` | GET | `/ping` | read | `kanban.board.read` | — |
| `boards.list` | GET | `/boards` | read | `kanban.board.read` | `kanban_list_boards` |
| `boards.get` | GET | `/boards/{id}` | read | `kanban.board.read` | `kanban_get_board` |
| `boards.summary` | GET | `/boards/{id}/summary` | read | `kanban.board.read` | `kanban_board_summary` |
| `boards.create` | POST | `/boards` | write | `kanban.board.create` | `kanban_create_board` |
| `boards.update` | PATCH | `/boards/{id}` | write | `kanban.board.rename` | — |
| `boards.archive` | DELETE | `/boards/{id}` | danger | `kanban.board.delete` | — |
| `boards.restore` | POST | `/boards/{id}/restore` | write | `kanban.board.delete` | — |
| `boards.star` | PUT | `/boards/{id}/star` | write | `kanban.board.read` | — |
| `boards.members.list` | GET | `/boards/{id}/members` | read | `kanban.board.read` | — |
| `boards.members.add` | POST | `/boards/{id}/members` | write | `kanban.board.member.manage` | — |
| `boards.members.update` | PATCH | `/boards/{id}/members/{userId}` | write | `kanban.board.member.manage` | — |
| `boards.members.remove` | DELETE | `/boards/{id}/members/{userId}` | danger | `kanban.board.member.manage` | — |
| `boards.activity` | GET | `/boards/{id}/activity` | read | `kanban.board.read` | — |
| `boards.archived` | GET | `/boards/{id}/archive` | read | `kanban.board.read` | — |
| `columns.list` | GET | `/boards/{id}/columns` | read | `kanban.board.read` | — |
| `columns.create` | POST | `/boards/{id}/columns` | write | `kanban.column.create` | — |
| `columns.update` | PATCH | `/columns/{id}` | write | `kanban.column.create` | — |
| `columns.move` | POST | `/columns/{id}/move` | write | `kanban.card.move` | — |
| `columns.archive` | DELETE | `/columns/{id}` | danger | `kanban.column.delete` | — |
| `columns.restore` | POST | `/columns/{id}/restore` | write | `kanban.column.create` | — |
| `columns.move-all` | POST | `/columns/{id}/move-all` | write | `kanban.card.move` | — |
| `cards.list` | GET | `/boards/{id}/cards` | read | `kanban.board.read` | `kanban_list_cards` |
| `cards.get` | GET | `/cards/{id}` | read | `kanban.board.read` | — |
| `cards.create` | POST | `/boards/{id}/cards` | write | `kanban.card.create` | `kanban_create_card` |
| `cards.update` | PATCH | `/cards/{id}` | write | `kanban.card.update` | `kanban_update_card` |
| `cards.move` | POST | `/cards/{id}/move` | write | `kanban.card.move` | `kanban_move_card` |
| `cards.archive` | DELETE | `/cards/{id}` | danger | `kanban.card.delete` | `kanban_archive_card` |
| `cards.restore` | POST | `/cards/{id}/restore` | write | `kanban.card.delete` | — |
| `cards.duplicate` | POST | `/cards/{id}/duplicate` | write | `kanban.card.create` | — |
| `cards.complete` | POST | `/cards/{id}/complete` | write | `kanban.card.move` | `kanban_complete_card` |
| `cards.assignees.set` | PUT | `/cards/{id}/assignees` | write | `kanban.card.update` | `kanban_assign_card` |
| `cards.labels.set` | PUT | `/cards/{id}/labels` | write | `kanban.card.update` | `kanban_set_labels` |
| `cards.activity` | GET | `/cards/{id}/activity` | read | `kanban.board.read` | — |
| `labels.list` | GET | `/boards/{id}/labels` | read | `kanban.board.read` | — |
| `labels.create` | POST | `/boards/{id}/labels` | write | `kanban.label.manage` | — |
| `labels.update` | PATCH | `/labels/{id}` | write | `kanban.label.manage` | — |
| `labels.delete` | DELETE | `/labels/{id}` | write | `kanban.label.manage` | — |
| `checklists.create` | POST | `/cards/{id}/checklists` | write | `kanban.card.update` | `kanban_add_checklist` |
| `checklists.update` | PATCH | `/checklists/{id}` | write | `kanban.card.update` | — |
| `checklists.delete` | DELETE | `/checklists/{id}` | write | `kanban.card.update` | — |
| `checklist-items.create` | POST | `/checklists/{id}/items` | write | `kanban.card.update` | — |
| `checklist-items.update` | PATCH | `/checklist-items/{id}` | write | `kanban.card.update` | — |
| `checklist-items.delete` | DELETE | `/checklist-items/{id}` | write | `kanban.card.update` | — |
| `checklist-items.move` | POST | `/checklist-items/{id}/move` | write | `kanban.card.update` | — |
| `comments.list` | GET | `/cards/{id}/comments` | read | `kanban.board.read` | — |
| `comments.create` | POST | `/cards/{id}/comments` | write | `kanban.card.comment` | `kanban_add_comment` |
| `comments.update` | PATCH | `/comments/{id}` | write | `kanban.card.comment` | — |
| `comments.delete` | DELETE | `/comments/{id}` | write | `kanban.card.comment` | — |
| `attachments.list` | GET | `/cards/{id}/attachments` | read | `kanban.board.read` | — |
| `attachments.create` | POST | `/cards/{id}/attachments` | write | `kanban.card.attach` | — |
| `attachments.delete` | DELETE | `/attachments/{id}` | write | `kanban.card.attach` | — |
| `cards.cover` | PUT | `/cards/{id}/cover` | write | `kanban.card.attach` | — |
| `search` | GET | `/search` | read | `kanban.board.read` | `kanban_search_cards` |
| `my-tasks` | GET | `/my-tasks` | read | `kanban.board.read` | `kanban_my_tasks` |
| `templates.list` | GET | `/templates` | read | `kanban.board.read` | — |

## 4. D18 — คีย์ API กลายเป็น "คนบนบอร์ด" ได้อย่างไร

ปัญหา: ทุก service ของโมดูลตัดสินสิทธิ์ 2 ชั้น (RBAC + บทบาทในบอร์ดจากแถว `KanbanBoardMember`/บทบาทในร้าน)
แต่คีย์ API ไม่มี Membership และไม่เคยถูกเชิญเข้าบอร์ดไหน ⇒ ถ้าปล่อยไว้ ทุก endpoint จะได้ 404 หมด

ทางที่เลือก (ตาม D18 · ทำใน `src/lib/modules/kanban/api/actor.ts`):

1. `boardRoleForScopes(scopes)` — `kanban.board.member.manage` → **ADMIN** · มี scope เขียนตัวใดตัวหนึ่ง
   (`KANBAN_WRITE_SCOPES`) → **EDITOR** · ที่เหลือ → **VIEWER**
2. `kanbanActorForKey()` สร้าง `KanbanActor` ที่มี `apiRole` = ค่าข้างบน · `userId` = ผู้สร้างคีย์ (ถ้ารู้) ไม่งั้น = id ของคีย์
3. `access.ts` รู้จัก `apiRole` 3 จุด: `canReadKanban` (ผ่าน), `boardRole` (คืน `apiRole` ทุกบอร์ด — ก่อนกติกา
   membership/visibility), `visibleBoardsWhere` (คืน `{}` = ทุกบอร์ดของ tenant+system ที่ผู้เรียกกรองอยู่แล้ว)
4. `KanbanCtx.actor` = ช่องใหม่ที่ `members.loadActor` อ่านก่อนจะไปแตะ Membership ⇒ **ไม่ต้องแก้ service สักตัว**
   ทุก `assertBoardRole/assertCardRole/assertColumnRole` ทำงานถูกต้องกับคีย์ทันที
5. `ApiActor.can()` = `kanbanScopesCan(scopes, action)` (evaluate + กติกา §6.1 "มีคีย์ `kanban.*` ตัวใดก็ได้ = อ่านได้")
   ⇒ ด่านแรกยังเป็น scope ของ op (403 `scope_missing`) แล้วจึงเจอด่านบทบาทบอร์ด (403/404)

ผลลัพธ์ที่ตั้งใจ: คีย์ = "integration ระดับร้าน" เห็นทุกบอร์ดรวมบอร์ด PRIVATE ของทุกสาขา — เจ้าของร้านเป็นคนออกคีย์
และเลือกชุดสิทธิ์เอง (หน้า ตั้งค่า › API เขียนไว้ตรง ๆ ว่า "คีย์ทำงานได้ทุกบอร์ดของระบบนี้")

**ความเห็นผ่าน API**: `KanbanComment.authorUserId` เป็น NOT NULL ⇒ ตัดสินตามที่ Fable ค้างไว้ใน K1.8 ว่า
**ผู้เขียน = ผู้สร้างคีย์** (`ApiKey.createdById`) ไม่เพิ่มคอลัมน์ `apiKeyId` · คีย์รุ่นเก่าที่ไม่รู้ว่าใครสร้าง →
`comments.create` ตอบ 403 ไทยพร้อมทางออก ("สร้างคีย์ใหม่จากหน้าตั้งค่า") · `verifyApiKeyDetailed` จึงคืน `createdById` เพิ่ม
(ผลข้างเคียงที่ตั้งใจ: กิจกรรม/ผู้มอบหมาย/ดาว ที่เกิดจากคีย์ ผูกกับ "คนที่ออกคีย์" ส่วน `AuditLog` ยังเป็น `API_KEY` + keyId)

## 5. การยกแกนกลาง (ย้ายอะไร · อะไรเป็น re-export)

| ไฟล์ | ย้ายไป | เปลี่ยนอะไร |
|---|---|---|
| `op.ts` | `src/lib/api/op.ts` | เพิ่ม `module?` และ `auditAction?` (ไม่ใส่ = ใช้ `action` เดิม) |
| `respond.ts` | `src/lib/api/respond.ts` | ดึงตัวช่วยจาก `@/lib/core/errors` · เพิ่มการอ่าน `status` ของ error โมดูล (404/403/409) |
| `run.ts` | `src/lib/api/run.ts` | `writeAudit` จาก `@/lib/core/audit` · ข้อความปฏิเสธมาจาก `actor.denyMessageTh` · audit ใช้ `auditAction` |
| `idempotency.ts` | `src/lib/api/idempotency.ts` | ไม่มี (ยกทั้งดุ้น) |
| `require.ts` | `src/lib/api/require.ts` | `requireApi(req, op, cfg)` — cfg บอก systemType/rateNs/makeActor/ข้อความไทย |
| `dispatch.ts` | `src/lib/api/dispatch.ts` | `dispatch(ops, method, req, params, cfg)` + ย้าย `matchOp`/`allowedMethods` มาเป็น `matchOpIn`/`allowedMethodsIn` |
| `openapi.ts` | `src/lib/api/openapi.ts` | `buildOpenApi(ops, info)` — `ApiDocInfo` (title/version/server/description/security) |
| `actor.ts` | `src/lib/api/actor.ts` | ชนิด `ApiActor` มี `can(action)` + `denyMessageTh` · ตรรกะ IMPLIES ของบัญชียังอยู่ที่บัญชี |

ของบัญชีที่ยัง "อยู่ที่เดิม" ทั้งหมด: ข้อความไทย/อังกฤษทุกประโยค · ตัวเลขเพดานอัตรา · INFO_DESCRIPTION ·
`ACCOUNT_OPS` และ handler ทุกตัว ⇒ ข้อสอบ `qc-account-api-*` เขียวครบ 18 ชุด (ดู §7)

## 6. เบี่ยงจากสัญญา / จุดตัดสินใจ

1. **op 56 ตัว ไม่ใช่ ~52** — เพิ่ม `columns.list`, `boards.summary` (tool `kanban_board_summary` ตามสัญญา AI),
   `cards.list` มี tool `kanban_list_cards` ⇒ AI tool รวม 16 ตัว (สัญญาขอ ≥ 15)
2. **`columns.update` ไม่รับ `color`** — วันนี้ไม่มี service ที่เขียน `KanbanColumn.color` และกติกาห้ามเขียน query ในไฟล์ op
   (เพิ่มทีหลังได้โดยไม่ทำสัญญาพัง)
3. **`wipLimit: 0` = ไม่จำกัด** — `setColumnWip` ปฏิเสธค่า < 1 ด้วย error ดิบ ⇒ ชั้น API แปลง 0 → null ให้
4. **การ์ดที่สร้างผ่าน API ใช้ `sourceType: AUTOMATION`** — enum ยังไม่มีค่า `API` (การเพิ่มค่าต้อง migration ของ enum)
5. **`comments.create` / `attachments.create` รับคีย์สิทธิ์ตัวเดียว** (`kanban.card.comment` / `kanban.card.attach`)
   ต่างจากหน้าจอที่ยอมรับ `kanban.card.update` ด้วย (backward compat ของร้านเก่า) — คีย์ API เจ้าของติ๊ก scope เองตอนออกคีย์
   ⇒ ชุด `kanban-edit` มีทั้งสองคีย์อยู่แล้ว
6. **`my-tasks` ของคนอื่น**: คีย์ต้องเป็นระดับ ADMIN (มี `kanban.board.member.manage`) · ผู้ช่วย AI ในแอปยกเว้น
   (ยังถามแทนพนักงานได้เหมือนก่อน K1.15 ผ่าน adapter ที่แปลง "ชื่อ/อีเมล" → userId)
7. **event `kanban.card.due_soon` / `kanban.card.overdue`** ประกาศไว้ + มี consumer แล้ว แต่ **ยังไม่มีตัวยิงจริง**
   (งานเตือนกำหนดส่งอยู่ P2 · ข้อสอบ S3.6 ขอครบ 9 ตัว) — จดเป็นหนี้ไว้ให้ K2.x
8. **`test` ของ op ส่วนใหญ่ชี้ที่ข้อสอบระดับทะเบียน** (`K1.15-S1.2`/`S1.3`) เพราะ oracle มี 30 ข้อครอบเป็นชุด
   ไม่ได้มีข้อสอบรายตัวครบ 56 op ⇒ ด่าน F13.4 ที่เพิ่มบังคับแค่ว่า "id ที่อ้างมีอยู่จริงในชุด qc-kanban-*"
   (ทุก WO ของ P2/P3 ที่เพิ่ม op ควรผูก test ของตัวเองกับข้อสอบ WO นั้น)
9. **หน้า "ตั้งค่า" ของบอร์ดงานเปิดก่อน K2.5** — เปิดเฉพาะส่วน API (ที่ออกคีย์) พร้อมย้าย `nav.ts` เป็น `ready`
   ตามกติกาในหัวไฟล์ (soon → ready ต้องมี `page.tsx` จริงใน commit เดียวกัน)
10. **เพิ่ม service 2 ตัวและ helper 1 ตัว**: `updateBoardFields` (service.ts) · `assertLabelRole` (members.ts)
    — ทั้งคู่เป็นบ้านที่ถูกต้องของตรรกะนั้น ไม่ได้เขียน query ในไฟล์ op

## 7. ผลด่าน (gate)

**ข้อสอบของ WO** — `pnpm exec tsx scripts/qc-kanban-k1.15.mts`
```
===== QC Kanban K1.15 =====
ผ่าน 29/30
FINDINGS: CRITICAL 0 · MAJOR 1 · MINOR 0
JSON_SUMMARY {"total":30,"passed":29,"findings":["K1.15-S2.16"]}
```

### 🔴 K1.15-S2.16 — ข้อสอบข้อนี้ผ่านไม่ได้ตามที่เขียนไว้ (ขอให้ Fable ตัดสิน)

ข้อสอบอ่านคำตอบด้วย `await res.text()` (บรรทัด 54) แล้วเช็ค `body._raw.charCodeAt(0) === 0xfeff` (บรรทัด 99)
แต่ตามสเปก WHATWG `Response.text()` **ลอก BOM ทิ้งเสมอ** ⇒ ค่าที่ได้จะไม่มีวันขึ้นต้นด้วย U+FEFF

หลักฐาน (3 ชั้น):
1. `node -e 'new Response("﻿abc").text()'` → `"abc"` (BOM หาย)
2. ข้อสอบของบัญชีรู้เรื่องนี้อยู่แล้วและอ่านไบต์ดิบแทน — `scripts/qc-account-api-read-gl.mts:47` และ
   `scripts/qc-account-api-read-finance.mts:45` เขียนกำกับไว้ว่า *"🔴 res.text() ลอก BOM ออกตาม WHATWG — ต้องอ่านไบต์ดิบ"*
3. probe ของ builder `scripts/probe-k115-csv.mts` (ยิง route จริงด้วยคีย์ kanban-read):
```
status: 200 content-type: text/csv; charset=utf-8
first 3 bytes: ef bb bf (ef bb bf = BOM)
res.text() charCodeAt(0): 63 ("cardNo,title")
BOM ในไบต์จริง: มี ✅
```
⇒ ของจริงมี BOM ครบ (Excel เปิดไทยได้) · ข้อที่ต้องแก้คือวิธีอ่านในข้อสอบ (เปลี่ยนเป็น `arrayBuffer()` แบบชุดบัญชี)
**builder ไม่แตะ oracle ตามกติกาข้อ 1** — หยุดไว้ที่ข้อนี้และรายงาน

**ข้อสอบเก่า (regression) — เขียวหมด**
```
qc-kanban-k1.1  30/30   qc-kanban-k1.6  20/20   qc-kanban-k1.11 21/21
qc-kanban-k1.2  25/25   qc-kanban-k1.7  21/21   qc-kanban-k1.12 18/18
qc-kanban-k1.3  29/29   qc-kanban-k1.8  18/18   qc-kanban-k1.13 16/16
qc-kanban-k1.4  30/30   qc-kanban-k1.9  18/18   qc-kanban-k1.14 15/15
qc-kanban-k1.5  17/17   qc-kanban-k1.10 16/16   qc-kanban-notify 12/12 · qc-ai-kanban-board 3/3
```

**ข้อสอบ API บัญชี (18 ชุด)** — เขียว 17 ชุด · แดง 1 ชุดจาก oracle ที่ขัดกัน (ดูด้านล่าง)
```
core 64/64 · ai-skill 33/33 · ai-external 16/16 · docs 17/17 · openapi 26/26 · webhooks 22/22
read-docs 50/50 · read-finance 38/38 · read-gl 55/55 · write-docs 52/52 · write-finance 33/33
write-gl 35/35 · write-master 44/44 · write-ops 29/29 · write-payments 32/32 · settings 33/34*
keys 49/51 (AK-7.1 · AK-7.2) · read-master 7/9 (แดงมาก่อน — ดูด้านล่าง)
```

**typecheck** — `pnpm typecheck` → 0 error
**fitness (ไม่มี env)** — `pnpm exec tsx scripts/fitness.mts`
```
===== FITNESS =====
ผ่าน 23/23
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
```
(เดิม 20/20 · เพิ่ม F13.4/F13.5/F13.6 ของทะเบียนบอร์ดงาน)

### ⚠️ ข้อสอบบัญชี 3 ข้อที่แดงเพราะ "ทะเบียน bundle เป็นของกลางแล้ว" (ขอให้ Fable ตัดสิน)

| ข้อสอบ | ข้อ | ที่มา |
|---|---|---|
| `qc-account-api-keys` | AK-7.1 | ยืนยันว่า `API_SCOPE_BUNDLES` มี **id 5 ตัวเป๊ะ ๆ** (`["read-only","issue-and-collect","accountant","danger","settings"]`) |
| `qc-account-api-keys` | AK-7.2 | ยืนยันว่า **ทุก** scope ในทุก bundle ขึ้นต้น `account.` |
| `qc-account-api-settings` | S1.2 | หน้า "บัญชี › การเชื่อมต่อ" ต้องมี radio ครบ **ทุก id** ใน `API_SCOPE_BUNDLES` |

ทำไมหลบไม่ได้: ข้อสอบ K1.15-S1.5 อ่าน `API_SCOPE_BUNDLES` ตรง ๆ และเรียก
`scopes.expandBundles(["kanban-read"|"kanban-edit"|"kanban-admin"])` ซึ่ง `expandBundles` หา bundle จาก
`BUNDLE_BY_ID` ที่สร้างจาก `API_SCOPE_BUNDLES` ⇒ **bundle ของบอร์ดงานต้องอยู่ในอาร์เรย์เดียวกัน** ไม่งั้น
ข้อสอบของ WO นี้พังทั้งชุด · จะแยกอาร์เรย์ก็ไม่ได้ด้วยเหตุผลเดียวกัน

ทางแก้ที่เสนอ (แก้ที่ข้อสอบบัญชี — เป็นข้อที่เขียนไว้ตอนมีโมดูลเดียว):
```ts
// AK-7.1 / AK-7.2 / A2-S1.2 — กรองเฉพาะชุดของบัญชีก่อนตรวจ
const accountBundles = bundles.filter((b) => b.scopes.some((s) => s.startsWith("account.")));
```
สิ่งที่ builder ทำไปแล้วเพื่อไม่ให้ "หน้าจอ/คู่มือของบัญชี" เพี้ยน (ทั้งสองจุดกรองด้วยเงื่อนไขเดียวกันนี้):
`ConnectionsPanel.tsx` โชว์เฉพาะ 5 ชุดของบัญชี · `gen-account-api-docs.mts` เขียนตารางเฉพาะ 5 ชุด
(⇒ `docs/api/ACCOUNT-API.md` ไม่ขยับแม้แต่ไบต์เดียว — `--check` ผ่าน)

### ⚠️ `qc-account-api-read-master` แดงมาก่อนแล้ว (ไม่เกี่ยวกับ K1.15)

`B2-C1.1` + `CRASH` เกิดเพราะ `scripts/acc-v2-expected.json` (ไฟล์ที่ commit ไว้ · **ไม่ได้ถูกแก้ใน WO นี้** —
ไม่ปรากฏใน `git status`) ไม่มีคีย์ `contacts.regular` และ `contacts.groups` ที่ข้อสอบต้องใช้:
```
$ python3 -c "import json;print(sorted(json.load(open('scripts/acc-v2-expected.json'))['contacts'].keys()))"
['active', 'all', 'archived', 'customer', 'vendor']
```
ตัวเลขที่เหลือตรงเฉลยหมด (`all 63 · customer 41 · vendor 22 · archived 5 · active 58`) — ขาดแค่ 2 คีย์นี้
⇒ ต้อง re-seed บัญชี หรือเติมคีย์ในเฉลย (ไม่ได้ทำใน WO นี้ เพราะ seed บัญชีจะไปแตะข้อมูล QC ของงานอื่น)

### หมายเหตุ `.claude/` ของ worktree นี้

`.claude/` อยู่ใน `.gitignore` ⇒ worktree นี้ไม่มีสกิล `shark-account-api` ตั้งแต่แรก ทำให้
`qc-account-api-docs` (F2.1–F2.7) และ `qc-account-api-openapi` (OA-4.5) แดงตั้งแต่ก่อนเริ่มงาน —
builder คัดลอกมาจาก `/root/.claude/skills/shark-account-api` แล้ว ทั้งสองชุดจึงเขียว (17/17 · 26/26)
สกิลใหม่ `shark-kanban-api` ก็ถูกคัดลอกไป `/root/.claude/skills/` เช่นกัน (`diff -r` เท่ากันทุกไบต์)

## 8. จุดที่อยากให้ Fable ลองแหย่

1. **D18 กับบอร์ดลับ** — สร้างคีย์ `kanban-read` ผูก system ของร้าน แล้วยิง `GET /boards`,
   `GET /boards/{บอร์ดลับสาขากะตะ}`, `GET /search?q=` ⇒ ต้องเห็นทั้ง 3 บอร์ด (ตั้งใจตาม D18)
   แล้วลองคีย์ของร้านอื่น/ระบบอื่น ⇒ ต้อง 404 ทุกเส้น ไม่ใช่ 403 (ทดสอบทั้ง path บอร์ด/การ์ด/คอลัมน์/ป้าย/ความเห็น)
2. **การ์ดของบอร์ดอื่นผ่าน path บอร์ดที่เห็น** — `POST /boards/{A}/cards` ด้วย `columnId` ของบอร์ด B
   (บอร์ดเดียวกันในระบบเดียวกัน) ⇒ ต้อง 422 `validation` · ตอนนี้กันไว้ที่ `ops/cards.ts` หลัง `createCard`
   (การ์ดถูกสร้างแล้วค่อยเด้ง — **ยังไม่ rollback**) ⇒ ถ้าอยากให้สะอาดกว่านี้ต้องเช็ค column ก่อนเรียก service
3. **กันซ้ำ + คำสั่งอันตราย** — ด่าน `confirm` อยู่ **ก่อน** ด่านกันซ้ำใน `src/lib/api/dispatch.ts`
   ⇒ ยิง `DELETE /cards/{id}` ด้วยคีย์กันซ้ำเดิม 2 ครั้ง (ครั้งแรกไม่ส่ง confirm → 409 · ครั้งที่สองส่ง confirm)
   ครั้งแรก **ไม่จองแถวกันซ้ำ** งานจึงทำจริงในครั้งที่สอง (builder ตรวจจากโค้ดแล้ว ไม่ได้ยิงจริง —
   อยากให้ Fable ยืนยันด้วย probe ว่าตรงใจ ไม่ใช่ 409 `idempotency_conflict`)
4. **บทบาทของคีย์กับ WIP** — `POST /cards/{id}/move` ด้วย `force: true` จากคีย์ `kanban-edit` (EDITOR)
   ⇒ ต้อง 404/403 จาก `assertBoardRole(..., "ADMIN")` ของ `moveCard` ไม่ใช่ข้ามเพดานได้
5. **ความเห็นผ่านคีย์ที่ไม่มีผู้สร้าง** — สร้างคีย์ด้วย `createApiKey(..., { createdById: null })` แล้วยิง
   `POST /cards/{id}/comments` ⇒ ต้อง 403 ข้อความไทยที่บอกทางออก (ไม่ใช่ 500 จาก NOT NULL)
6. **AI**: `runKanbanTool("kanban_move_card", …)` ⇒ ต้องได้ `proposalId` + `waiting: user_confirm`
   แล้ว `executeProposal` ด้วยสิทธิ์ STAFF ที่ไม่มี `kanban.card.move` ⇒ ต้องถูกปฏิเสธที่ `assertCan` ของ KIND_ACCESS
   · และ `kanban_archive_card` ต้องเป็น `risk: DESTRUCTIVE` (ยืนยัน 2 ชั้น)
7. **สกิลกับคีย์รุ่นเดิม** — `GET /api/v1/ai/skills/tasks` ด้วยคีย์ `scopes: []` ⇒ ควรไม่เห็น tool ของบอร์ดงานเลย
   (gating ผ่าน `toolAllowedForApiKey`) · คีย์ `kanban-read` ⇒ ควรเห็นเฉพาะ tool อ่าน 6 ตัว
8. **เหตุการณ์ซ้ำ** — เปิดหน้าตั้งค่า webhook ของร้าน ⇒ ต้องเห็น `kanban.*` **9 ตัว ไม่ซ้ำ**
   (ก่อนแก้มี 14 แถวเพราะ `labels.ts` ประกาศทับ `AUTOMATION_EVENTS` — เจอตอน generate คู่มือ)
9. **`boards.summary.overdueCount` ใช้เวลา UTC** เทียบ `dueAt` — งานที่กำหนดส่ง "สิ้นวันไทย" จะถูกนับว่าเลยกำหนด
   เร็วไปได้ถึง 7 ชม. (บทเรียน `reference_thai_date_getday_trap`) · ยังไม่แก้เพราะ `search?due=overdue` ของ K1.11
   ก็ใช้เกณฑ์เดียวกัน — ถ้าจะแก้ควรแก้ทั้งคู่พร้อมกันใน P2
10. **คอลัมน์ "เสร็จ" มีได้หลายคอลัมน์** — `cards.complete` เลือกคอลัมน์ซ้ายสุดที่ตั้งธง (ไม่มีอะไรบังคับให้มีคอลัมน์เดียว)
    เขียนไว้ในคู่มือแล้ว แต่ควรตัดสินใน K2.x ว่าจะบังคับ 1 คอลัมน์ต่อบอร์ดไหม

## 9. probe ที่ builder รันเอง (นอกข้อสอบ)

`scripts/probe-k115-ai.mts` — เส้นทาง AI ครบเส้น (ไม่ได้พึ่งข้อสอบที่ตรวจแค่ข้อความในไฟล์):
```
tool ที่ลงทะเบียนจริง: 16 kanban_list_boards,…,kanban_my_tasks
ซ้ำไหม: ไม่ซ้ำ ✅
assertSkillRegistryComplete ✅
kanban_list_boards      → read   [{"id":"…","name":"งานร้าน — สาขาป่าตอง",…
kanban_board_summary    → read   {"cardCount":24,"doneCount":0,"overdueCount":4,"unassignedCount":5,…
kanban_my_tasks(ธนา)    → read   {"counts":{"overdue":2,"today":0,"week":0,"none":1,"doneThisWeek":1},…
kanban_create_card      → propose kanban.cards.create · สร้างการ์ดงาน · บอร์ด "งานร้าน — สาขาป่าตอง" · "จาก AI"
kanban_archive_card     → propose kanban.cards.archive
kind ที่ต้องยืนยัน 2 ชั้น: kanban.cards.archive
```
`scripts/probe-k115-registry.mts` — ทะเบียน 56 op · id/path ไม่ซ้ำ · action ขึ้นต้น `kanban.` ครบ · ทุกตัวมี `test`
`scripts/probe-k115-csv.mts` — หลักฐาน BOM ของ CSV (ดู §7)

## 10. ภาพหน้าจอ

- `/developers/kanban` (desktop 1440 · fullPage 17,976px) และ mobile — `.qc-shots/kanban/path/custom-{desktop,mobile}.png`
  (ถ่ายหลัง build รอบที่ 2 ⇒ ส่วน Webhooks โชว์ 9 event ไม่ซ้ำแล้ว)
- `บอร์ดงาน › ตั้งค่า › API` — ภาพเดียวกันชุดก่อนหน้า (`custom-desktop.png` รอบแรก) โชว์ radio 3 ชุด
  (อ่านอย่างเดียว / ทำงานกับการ์ด / ผู้ดูแล) + ช่องชื่อคีย์ + วันหมดอายุ + ลิงก์ไป `/developers/kanban`
  🔴 ไฟล์ถูกเขียนทับด้วยภาพ `/developers/kanban` รอบสอง — Fable ถ่ายซ้ำได้ด้วย
  `pnpm exec tsx scripts/visual-kanban.mts path /app/sys/<systemId>/kanban/settings`

## 11. หนี้ที่ฝากไว้ให้ WO ถัดไป

1. `kanban.card.due_soon` / `kanban.card.overdue` — ยังไม่มีตัวยิง (K2.x งานเตือนกำหนดส่ง)
2. `boards.summary.overdueCount` + `search?due=overdue` ใช้เวลา UTC เทียบ `dueAt` (ควรเป็นสิ้นวันไทย)
3. `cards.create` ที่ columnId ข้ามบอร์ด: ปฏิเสธหลังสร้างการ์ดแล้ว (ควรตรวจคอลัมน์ก่อนเรียก service)
4. `columns.update` ยังไม่รองรับ `color` (รอ service)
5. หน้า `ตั้งค่า` ของบอร์ดงานมีแค่ส่วน API — K2.5 มาเติมส่วนที่เหลือ
6. `test` ของ op ส่วนใหญ่ยังชี้ข้อสอบระดับทะเบียน (ดู §6 ข้อ 8)
