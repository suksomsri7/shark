# S1-6 — S1.7 ต้องอนุมัติเสมอ + กฎ + ผู้อนุมัติ · S1.8 บันทึกการกระทำ + ย้อนกลับ 24 ชม. (Opus · `wip/sec-s1.7` · หลัง S1.4 merge · ชุดตรวจเข้ม 2 ผู้ตรวจ)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (R-K3 **R-K3b** R-K4 §B.3 §B.5 §G), plan rows S1.7/S1.8, `docs/modules/31-secretary.md` §5/§7, ใบ S1.2 (classOfKind ถูกย้ายมาใบนี้ถ้า S1-2 ยังไม่ได้ทำ — ตรวจ `src/lib/ai/secretary/kind-class.ts` ก่อน) และ oracle `scripts/qc-sec-s1.7.mts`. Verified code: `src/lib/ai/proposals.ts` (`DESTRUCTIVE_KINDS` :128 · `KIND_ACCESS` :199 · `executeProposal` :370 claim :445 dispatch :452 · `runKind` :484 · `dispatch` :503 · hand handlers `kanban_create_card` :741 `booking_create_appointment` :825 `cancel_appointment` :958 `kanban_archive_card` :992) · `src/lib/ai/kanban-ops.ts` `dispatchKanbanKind` :608 (`runOpAsActor` → `env.data` มี `id`) · `src/lib/modules/kanban/service.ts` (`archiveCard(tenantId, systemId, cardId, actorUserId?)` :661 · `moveCard` :680) · `src/lib/modules/crm/deals.ts` (`moveDeal(ctx, actor, id, {stageId})` :843) · `src/lib/modules/booking/service.ts` (`cancelAppointment`) · `src/lib/ai/plans.ts` :148 (`runKind` ไม่ส่ง userId — §B.3) · ตาราง `AiApprovalRule` · `AiActionLog` (S1.1).

## S1.7
`src/lib/ai/secretary/kind-class.ts` (pure):
```ts
export type KindClass = { destructive: boolean; money: boolean; customerFacing: boolean; piiExport: boolean; known: boolean };
export function classOfKind(kind: string): KindClass; // destructive = DESTRUCTIVE_KINDS.has · money = module ∈ {account, pos(void/refund/sale), shop(refund), payments, finance, cheques, point, reward, ticket, school(mark_paid), restaurant} หรือ kind มี refund/void/pay · customerFacing = kind ∈ {chat.send, crm.emails.*, member.campaigns.*, marketing_create_campaign, coupon_create} · piiExport = kind มี export/csv · ไม่รู้จัก (kindAccessOf null และไม่ใช่ทะเบียน) ⇒ {known:false, money:true, customerFacing:true} fail-closed
export const ALWAYS_APPROVE = ["destructive", "money", "piiExport"] as const; // ปิดไม่ได้
export const RULE_KEYS = ["chat.send", "money.limit", "pii.export"] as const;
export function whyApproval(kind: string, payload: unknown, rules: RuleMap): string; // ไทย ไม่ว่าง เสมอ (รุ่นแรกทุกข้อเสนอต้องอนุมัติ) เช่น "ลบ/ยกเลิกถาวร — ต้องยืนยัน 2 ชั้น" · "มีเงินออก" · "ส่งถึงลูกค้า (กฎ chat.send)" · "เกินวงเงิน N บาท ที่ตั้งไว้" (อ่าน limitSatang · จำนวนจาก payload.totalSatang/amountSatang/grandTotalSatang ถ้ามี) · ทั่วไป "เลขาเสนอ — รุ่นแรกทุกรายการเขียนต้องมีคนอนุมัติ"
```
`src/lib/ai/secretary/approval-gate.ts`:
```ts
export type RuleMap = Record<(typeof RULE_KEYS)[number], { enabled: boolean; limitSatang: number | null }>;
export const DEFAULT_RULES: RuleMap; // ทั้ง 3 enabled · money.limit limitSatang 500000 (5,000 บาท)
export async function listRules(tenantId): Promise<RuleMap>;            // เติม default
export async function setRule(tenantId, by: { userId; membership }, key, patch: { enabled?: boolean; limitSatang?: number | null }): Promise<RuleMap>; // OWNER เท่านั้น (ForbiddenError) · key ∉ RULE_KEYS throw ไทย · limitSatang < 0 หรือไม่ใช่จำนวนเต็ม throw · upsert AiApprovalRule(setById)
export async function approvalGate(tenantId, m: MembershipCtx, row: { kind; conversationId; payload }): Promise<{ ok: true; why: string } | { ok: false; note: string }>;
   // ห้องมี AiRoom (conversationId) ⇒ m.role ต้องเป็น OWNER/MANAGER ไม่งั้น {ok:false, note:"ข้อเสนอของเลขาต้องให้เจ้าของหรือผู้จัดการอนุมัติ"} · ห้องเดิม (ไม่มี AiRoom) ⇒ ok เสมอ (พฤติกรรมเดิม · qc-ai-proposals เขียว) · why = whyApproval(kind, payload, await listRules)
```
ต่อเข้า `executeProposal` หลัง `assertCan` (:427) ก่อนด่าน 2 ชั้น: `const gate = await approvalGate(...)`; ไม่ผ่าน ⇒ return {ok:false, note} คง PENDING · `runKind` ไม่ต้องมี gate (แผน = ผู้กดยืนยันแผนแล้ว) · R-K3b: กฎ 3 ข้อในรุ่นแรก **ไม่มีผลเปิดทางอัตโนมัติ** (ทุกข้อเสนอยังต้องอนุมัติ) — ผลคือข้อความ "ทำไมต้องอนุมัติ" + หน้า B4 + เตรียมรุ่น AUTO
## S1.8
`src/lib/ai/secretary/actions.ts`:
```ts
export const UNDOABLE_KINDS: Record<string, { entityType: string; hours: 24 }>; // "kanban_create_card" · "kanban.cards.create" · "kanban.cards.move" · "crm.deals.move" · "booking_create_appointment" (ห้ามใส่ kind ที่ส่งข้อความ/เงินออก)
export type ActionEntity = { type: string; id: string; unitId?: string | null };
export async function snapshotBefore(tenantId, kind, payload): Promise<unknown | null>; // kanban.cards.move ⇒ {columnId, position} เดิมของ card (payload.params.id) · crm.deals.move ⇒ {stageId} เดิม · อื่น null
export async function recordAction(input: { tenantId; conversationId; kind; summary; approverId: string | null; proposalId?: string | null; planId?: string | null; entity?: ActionEntity | null; before?: unknown; executedAt: Date }): Promise<AiActionLog>;
   // roomId = AiRoom.id ของ conversation (null ถ้าห้องเดิม) · userId = conversationCreatorOf(conversationId).id ?? approverId ?? "system" · module = kindAccessOf(kind)?.module ?? kind.split(".")[0] · payload = { ids เท่านั้น: entity, before, proposalPayloadIds (ค่า string ที่ลงท้าย Id/id ของ payload) } ห้ามเก็บข้อความ/ชื่อ/เบอร์ · entityType/entityId จาก entity · undoableUntil = kind ∈ UNDOABLE ? executedAt + 24h : null
export async function undoAction(ctx: ConvCtx, logId: string): Promise<{ ok: true; note: string } | { ok: false; note: string }>;
   // มองไม่เห็น (ห้องของ log ตาม roomSightFor หรือ OWNER) = "ไม่พบรายการ" · undoneAt มีแล้ว = "ย้อนไปแล้ว" · now > undoableUntil = "เกิน 24 ชั่วโมง ย้อนไม่ได้แล้ว" · kind ไม่อยู่ใน UNDOABLE = "รายการนี้ย้อนไม่ได้" · assertCan(m, kindAccessOf(kind)) ของคนกด · handler: kanban_create_card/kanban.cards.create ⇒ kanbanSvc.archiveCard(..., userId) · kanban.cards.move ⇒ moveCard กลับ before · crm.deals.move ⇒ moveDeal กลับ before.stageId · booking_create_appointment ⇒ cancelAppointment ถ้า startAt > now ไม่งั้น "นัดเริ่มแล้ว ย้อนไม่ได้" · สำเร็จ ⇒ updateMany({id, undoneAt: null}) → {undoneAt, undoneById} (claim อะตอมมิก · ชนะเท่านั้นทำ) + แถวใหม่ kind `undo:<kind>` (undoableUntil null · proposalId เดิม)
export async function listLog(ctx: ConvCtx, opts?: { day?: string (YYYY-MM-DD BKK); module?: string; roomId?: string; take?: number }): Promise<AiActionLog[]>; // OWNER ทุกแถว · อื่น = แถวที่ roomId อยู่ในห้องที่เห็น (roomSightFor) หรือ userId/approverId = ตัวเอง · เรียง createdAt desc · take ≤ 200
```
ต่อเข้า: `executeProposal` — ก่อน dispatch: `before = await snapshotBefore(...)` · dispatch รับ `out: { entity?: ActionEntity }` (เพิ่มพารามิเตอร์ท้าย `dispatch(..., out?)` และส่งต่อเข้า `dispatchKanbanKind(..., out?)` ที่ตั้ง `out.entity = { type: "kanban.card"|"kanban.board", id: env.data.id }` เมื่อ env.data.id เป็น string · hand handler `kanban_create_card`/`booking_create_appointment` ตั้ง out.entity จาก card.id/appointment.id) · หลัง dispatch สำเร็จ: `recordAction(...)` (ล้ม = log ไม่ throw · ผลข้อเสนอยังสำเร็จ) · `runKind(..., userId)` ก็ `recordAction` (planId จาก refId `plan-<id>-<i>`) · `plans.ts:148` ส่ง `opts?.userId` เข้า runKind (§B.3) · ห้ามแก้ handler ที่คืน string อื่น (normalize ที่ executeProposal)
## Files you own
`src/lib/ai/secretary/{kind-class,approval-gate,actions}.ts` · `src/lib/ai/proposals.ts` (gate hunk · out param · recordAction hunks · 2 hand handlers ตั้ง entity) · `src/lib/ai/kanban-ops.ts` (`out?`) · `src/lib/ai/plans.ts` (:148 userId) · `docs/modules/31-secretary.md` §5/§7 · `ledger/wo-notes/sec-s1.7.md`
## Acceptance = `scripts/qc-sec-s1.7.mts` ทั้งหมด PASS + regression: `qc-ai-proposals` `qc-ai-plan` `qc-ai-credit` `qc-ai-actions` `qc-ai-kanban-board` `qc-ai-phase-b1` `qc-ai-phase-b2` `qc-ai-wave5b` `qc-ai-growth` `qc-ai-automation` `qc-pos-p3.9` `qc-svc-smoke` `qc-approval` `qc-approval-wiring` `qc-approval-edit` เท่า baseline 85751098 · typecheck 0 · fitness ×2 · ชุดนี้มี 2 ผู้ตรวจ (ผู้คุม spawn)
