# Kanban / บอร์ดงานภายใน (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
บอร์ดงานคล้าย Trello — board → column → card + assignee/labels/dueAt + ย้ายคอลัมน์. ผู้ใช้: พนักงานใน tenant. **Layer 2: Core** (feature no.13) — scope=system (AppSystem type KANBAN, มีได้หลายบอร์ด/ระบบ).
โค้ด: `src/lib/modules/kanban/{service,actions,ui}.ts` · schema `prisma/schema/kanban.prisma`.

## Data model (prisma/schema/kanban.prisma) — tenantId+systemId
- **KanbanBoard** — `name` `description?` `sortOrder` `status`(ACTIVE/ARCHIVED) `archivedAt?`.
- **KanbanColumn** — `boardId` `name` `sortOrder` `status` (onDelete Cascade board). index `[boardId,status,sortOrder]`.
- **KanbanCard** — `boardId` `columnId` `title` `description?` `assigneeUserId?`(ต้องเป็น Membership ของ tenant — ตรวจใน service) `labels`json(string[]) `dueAt?`(UTC) `sortOrder` `status` `archivedAt?`. index `[columnId,status,sortOrder]`, `[tenantId,systemId,assigneeUserId]`.

## Service API (src/lib/modules/kanban/service.ts)
- `listBoards(tenantId, systemId, includeArchived=false)` · `getBoard(...)`(+ columns+cards).
- `createBoard({...})` (seed columns เริ่มต้น) · `renameBoard` · `archiveBoard` · `unarchiveBoard`.
- `createColumn(...)` · `renameColumn` · `archiveColumn`.
- `createCard({...})` (ตรวจ assignee เป็น membership) · `updateCard({...})` · `archiveCard`.
- `moveCard({...})` — ย้ายข้ามคอลัมน์ + จัด sortOrder · `moveCardSideways({...})` — เรียงในคอลัมน์เดิม.
- `listTenantUsers(tenantId)` — สำหรับเลือก assignee.

## การเชื่อมต่อ
- **User/Membership กลาง**: assigneeUserId ตรวจ membership ที่ service.
- self-contained · ไม่มี outbox · ไม่มีเส้นเงิน.

## Permissions (assertCan ใน actions.ts)
`kanban.board.create` · `kanban.board.rename` · `kanban.board.delete` · `kanban.column.create` · `kanban.column.delete` · `kanban.card.create` · `kanban.card.update` · `kanban.card.move` · `kanban.card.delete`.

## UI
- `/app/sys/[id]/kanban/[boardId]` (KanbanContent) — บอร์ด/คอลัมน์/การ์ด. หน้าระบบ `/app/sys/[id]` (type=KANBAN) แสดงรายการบอร์ด.

## การทดสอบ
- `scripts/qc-systems.mts` — kanban ในชุด 7 ระบบ (board/column/card/move ผ่าน service จริง).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Defer (P2): real-time SSE, drag-drop จริง, checklist/comment ในการ์ด, WIP limit, members/roles ต่อบอร์ด.
- WO-0045: AI สร้างงาน kanban ผ่าน proposal.
