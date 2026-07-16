# Approval Engine (DESIGN — สำหรับ WO-0049)

> เอกสารออกแบบล่วงหน้า · ต่อยอดของจริง ยังไม่สร้าง · path ในอนาคตเขียนเป็นข้อความธรรมดา (ไม่ใส่ backtick)

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** core service กลางสำหรับ "สายอนุมัติ" (approval chain) ที่ config ได้ ให้โมดูลอื่นเกาะ — PO/ใบลา/เอกสารเกินวงเงิน/ใบสั่งซื้อสินทรัพย์ ผ่านขั้นอนุมัติก่อนมีผล
- **ผู้ใช้:** OWNER ตั้งกฎ · MANAGER/OWNER เป็นผู้อนุมัติในหน่วยที่คุม · STAFF เป็นผู้ยื่นคำขอ
- **เหตุผลเชิงธุรกิจ:** อ้าง `docs/sds/01_VISION.md` — "สมบูรณ์ระดับโลก" ต้องมี control เชิงองค์กร (SME ที่โตขึ้นต้องการ maker-checker) · เป็น building block ที่ Vendor Portal (0059), บัญชี, procurement ใช้ร่วม ไม่ต่างคนต่างทำ

## Data model เสนอ
โมดูลใหม่ `approval`. ข้อเสนอหลัก = **tenant-scoped core service** (ไม่ผูก AppSystem) เพราะกฎอนุมัติควรใช้ข้ามระบบย่อยในร้านเดียว — เหมือน `AutomationRule`/`AppNotification` ที่เป็น axis `tenant` ใน `src/lib/core/scope.ts`. ทุก model ลงทะเบียน scope ตาม convention `docs/sds/06_DATABASE.md`.

- `ApprovalPolicy` (axis: tenant) — กติกาสายอนุมัติ
  - `id` cuid · `tenantId` · `createdAt` · `updatedAt`
  - `name` · `entityType` (string ตรงชื่อ Prisma model ต้นทาง เช่น `"PurchaseOrder"`, `"HrLeave"`, `"AccountDocument"`) · `active` Boolean
  - `unitId` String? (จำกัดหน่วย · null = ทั้งร้าน) · `systemId` String? (จำกัดระบบต้นทาง)
  - `thresholdSatang` Int? (เงื่อนไขวงเงิน · null = ทุกจำนวน) · `conditionJson` Json (เงื่อนไขเสริม เช่น leaveType)
  - `@@index([tenantId, entityType, active])`
- `ApprovalStep` (axis: tenant) — ขั้นในสาย (ordered)
  - `id` · `tenantId` · `policyId` · `order` Int · `approverRole` (`MANAGER | OWNER`) · `approverUserId` String? (ระบุคนเจาะจงได้)
  - `requireAll` Boolean · `@@unique([policyId, order])`
- `ApprovalRequest` (axis: tenant) — 1 คำขอต่อ 1 entity instance
  - `id` · `tenantId` · `policyId` · `entityType` · `entityId` (id ของ PO/Leave/Document ต้นทาง)
  - `unitId` String? · `systemId` String? · `amountSatang` Int?
  - `status` enum `ApprovalStatus` (`PENDING | APPROVED | REJECTED | CANCELLED`) · `currentStepOrder` Int
  - `requestedById` · `decidedAt` DateTime? · `idempotencyKey` String
  - `@@unique([tenantId, idempotencyKey])` · `@@unique([tenantId, entityType, entityId])` (1 entity = 1 คำขอ active) · `@@index([tenantId, status])`
- `ApprovalDecision` (axis: tenant, append-only) — ประวัติการตัดสินแต่ละขั้น
  - `id` · `tenantId` · `requestId` · `stepOrder` Int · `decidedById` · `decision` (`APPROVED | REJECTED`) · `note` String? · `createdAt`
  - `@@index([requestId])`

**Idempotency:** `idempotencyKey` pattern `approval-<entityType>-<entityId>` — ยื่นซ้ำ entity เดิม = ไม่สร้างซ้ำ. Decision append-only (ห้าม update ย้อน).

## Service API เสนอ (ไฟล์ในอนาคต src/lib/modules/approval/service.ts)
- `resolvePolicy(ctx, { entityType, unitId, systemId, amountSatang })` → ApprovalPolicy | null (เลือกกฎที่ตรง+วงเงินเข้าเงื่อนไข · เจาะจงสุดชนะ) — ไม่มีกฎ = ไม่ต้องอนุมัติ (คืน null → ต้นทางทำงานปกติ)
- `submitForApproval(ctx, { entityType, entityId, unitId?, systemId?, amountSatang?, requestedById })` → `{ requestId } | { autoApproved: true }` — ไม่มี policy = auto-approve
- `decide(m, ctx, requestId, { decision, note })` — บันทึก ApprovalDecision, เลื่อน `currentStepOrder`; ครบทุกขั้น → `APPROVED` + emit outbox `approval.request.approved`; REJECT ขั้นใด = `REJECTED` ทันที + emit `approval.request.rejected`
- `listPending(ctx, { forUserId })` — คำขอที่รอ user นี้ตัดสิน (ตาม role/step)
- `cancelRequest(ctx, requestId)` — ต้นทางยกเลิก entity → cancel request
- **Edge cases:** (1) entity ถูกยกเลิกระหว่างรออนุมัติ → cancelRequest · (2) approver ลาออก/ถอนสิทธิ์ → resolve ด้วย role เป็นหลัก · (3) แก้ยอด entity หลังยื่น → ยื่นใหม่ (invalidate เดิม) · (4) กด decide ซ้ำ/แข่งกัน → claim อะตอมมิก `updateMany` เงื่อนไข `currentStepOrder` (เหมือน claim ใน `src/lib/ai/proposals.ts`)

## การเชื่อมต่อ
- **ไม่มีเงินเข้าเส้นเงินโดยตรง** — Approval เป็น gate ก่อน entity มีผล. เมื่อ approved แล้ว entity ต้นทาง (เช่น PO รับเข้า → บัญชี) เดินเส้นเงินของตัวเองตามเดิม (PosSale/AccountDocument → outbox → account-bridge)
- **Outbox event ใหม่ที่ต้องเพิ่ม:** `approval.request.submitted` · `approval.request.approved` · `approval.request.rejected` — ผูก handler ใน `src/lib/outbox-consumers.ts` (แจ้งเตือนผู้อนุมัติผ่าน AppNotification + ปลดล็อก entity ต้นทาง)
- **ช่องทางที่เกาะ (อ้าง `docs/sds/02_ARCHITECTURE.md`):** ช่องทาง 1 (outbox) เป็นหลัก · ช่องทาง 2 (service call ผ่าน composition root) — โมดูลต้นทางเรียก `submitForApproval` ผ่าน composition root ไม่ import ตรงข้ามโมดูล
- ต่อ Automation engine เดิม (runForEvent) เพื่อแจ้งเตือน

## AI actions
- **read tool ใหม่:** `pending_approvals` — "คำขออนุมัติที่รอคุณตัดสิน" (คืนรายการ entity + ยอด) — เดิน read-only เหมือน `pending_leaves` ใน `src/lib/ai/tools.ts`
- **action tool ใหม่:** `approval_decide` → ProposalKind `approval_decide` → dispatch เรียก `approvalSvc.decide` (เดินเส้น proposal เดิมใน `src/lib/ai/proposals.ts`)
- KIND_ACCESS: `{ module: "approval", action: "approval.request.decide" }`

## Permissions เสนอ
- `approval.policy.manage` (ตั้งกฎ — OWNER) · `approval.request.decide` (อนุมัติ/ปฏิเสธ — MANAGER/OWNER) · `approval.request.view`

## UI หน้าจอหลัก (ตาม `docs/UI_STANDARD.md`)
- **หน้า "รออนุมัติ"** (hub) — `DataList` คำขอที่รอ user (primary = ชนิด+ยอด, secondary = ผู้ยื่น+วันที่, trailing = `StatusChip`) · ปุ่มอนุมัติ/ปฏิเสธผ่าน `ConfirmDialog` + `reasonField` เมื่อปฏิเสธ
- **หน้าตั้งค่าสายอนุมัติ** — `FormField`: ชนิดเอกสาร · วงเงิน (รับเป็นบาท) · ขั้นอนุมัติ (เพิ่ม step ตามลำดับ role)
- badge จำนวนรออนุมัติบน nav

## ข้อสอบ oracle ที่ต้องมี
1. ไม่มี policy → `submitForApproval` คืน autoApproved, entity เดินต่อทันที
2. policy วงเงิน ≥ 5,000 บาท: ยอด 4,999 บาท ไม่เข้ากระบวน · 5,000 บาท เข้า PENDING
3. สาย 2 ขั้น (MANAGER→OWNER): approve ขั้น 1 → ยัง PENDING · approve ขั้น 2 → APPROVED + emit outbox
4. REJECT ขั้นใดก็ตาม → REJECTED ทันที ไม่ไปขั้นต่อ
5. STAFF (ไม่มีสิทธิ์ decide) กด → ForbiddenError, สถานะคง PENDING
6. decide ซ้ำ/แข่งกันสองคน → มีคนเดียวชนะ (claim อะตอมมิก) ไม่นับ 2 ครั้ง
7. tenant อื่นมองไม่เห็น ApprovalRequest ของร้านนี้ (cross-tenant)
8. ยื่น entity เดิมซ้ำ (idempotencyKey) → ไม่สร้าง ApprovalRequest ซ้ำ
9. AI: pending_approvals อ่านเฉพาะที่รอ user นั้น · approval_decide สร้าง proposal ไม่ execute จนยืนยัน
10. entity ถูกยกเลิก → cancelRequest → status CANCELLED, ไม่โผล่ใน listPending
11. ApprovalDecision append-only — decide 3 ครั้งมี 3 แถว ไม่ทับ

## ความเสี่ยง / คำถามเปิด
- 🔑 **axis ของ approval: tenant vs system?** เสนอ tenant (ใช้ข้ามระบบย่อย) — ต้องการเจ้าของ/สถาปนิกยืนยันว่าไม่ต้องแยกต่อ AppSystem (จะได้ไม่ต้องเพิ่ม SystemType `APPROVAL`)
- 🔑 ระดับ granularity ของ approver: role (MANAGER/OWNER) พอไหม หรือต้องระบุ user/ตำแหน่งเจาะจง (กระทบ HR position)
- entity ที่แก้ยอดหลังยื่น: นโยบาย invalidate อัตโนมัติ vs เตือน — ต้องตัดสิน
