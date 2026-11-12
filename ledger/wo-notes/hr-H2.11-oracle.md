# H2.11 oracle notes — `scripts/qc-hr-h2.11.mts` (57 checks · RED-by-design 52 · GREEN controls 5)

Brief `ledger/hr-briefs/hr-brief-H2.11.md` (DRAFT). Base 847d37bf3. Lane DB wo-hr-qc-l2 (`scripts/qc-hr.sh`).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 [QC_FORCE=1] pnpm exec tsx scripts/qc-hr-h2.11.mts` (seed `seed-hr-qc` first). SKIP while `hr/inbox.ts` is absent.

## Fixture (one run · tenants `qc-hr-h211-*` · 2031 · `opts.now` = 2031-06-20 10:00 BKK)
T1 units u1/u2 · HR systems sA (matrix) + sC (query budget) · T2 sB (other tenant).
Employees sA: E1 u1 (s1) · E2 u1 (s2) · E3 u2 (s3) · E4 u2 (s4) · EM u1 (linked to MANAGER mgr1). Salary profiles (OT rate). Unlimited PERSONAL policy.
Built ONLY through the types' own request functions (F1 proves each own lister shows the owner all 17):
- LEAVE `requestLeave`: L1 E1 07-15..16 (reason) · L2 E3 07-15 · LM EM 07-17 · L4 E2 06-25 (approved after OL) · L3 E2 07-22 **after** an HrLeave approval policy on sA ⇒ chain · LO in T2.
- OT `requestOt` 06-25 18–20: O1 E1 filed by dec1 · O2 E3 · OM EM · OL E2 (L4 approved afterwards ⇒ leaveDay) by owner.
- SWAP `requestSwap`+`respondSwap`: S1 E1(07-01)↔E2(07-02) u1 · S2 E3↔E4 u2 — PENDING.
- CORRECTION `requestCorrection` ADD OUT 18:00 self: C1 E1 · C2 E3 · CM EM (06-18) · CP E2 2031-05-28, then a PAID run 2031-05 (paid-month refusal at apply).
- ADJUSTMENT `requestAdjustment` A1 E1 BONUS by owner · A2 E3 ADVANCE by `pay` · AS = `requestStockCharge` DAMAGE E2 (consent) · AO in T2.
Viewers: owner · mgr1 MANAGER[u1] (linked EM) · key1 STAFF[u1] hr.employee.create · dec1 STAFF[u1] hr.leave.decide+hr.payadjust.approve+request · pay STAFF* payroll.read+payadjust.approve · payRead STAFF* payroll.read · s1 staff · kiosk (hr.attendance.clock) · member · other (T2 owner).
L1 and O2 `createdAt` back-dated 10 days (age filter S4.4).

## Write order (results literal; texts = each type's exported text)
S6.1 whole-call refusals → B1 mgr1 14 items → B2 key1 5 → B3 pay [O2,A1] + singles A1/AS/A2 → reject L2 with reason → replay B1 / B1 key with other items → parallel OM (owner ∥ dec1) and LM → S8 invariants → S11 budget on sC (1 → 5 employees × leave/OT/correction/adjustment; Prisma `query` events counted via `qc4Env(suite,{countQueries:true})`, new optional arg in `qc-hr-lib.mts`, other oracles unaffected).
Expected audit totals (S8.7): hr.inbox.decide 29 · hr.inbox.batch 11 · hr.inbox.batch_done 11.

## Statics
S1.2 import whitelist = brief R3; `decideLeave`/`bulkDecideLeave`/`decideAdjustment` forbidden in inbox.ts. S13.1 frozen: ot swap service actions payroll-actions stock-charge availability judge lifecycle privacy privacy-shared scope approval-effects outbox-consumers + approval/** + prisma/** (hunks carrying another WO's `HR Hx.y|SYNC|VIS` marker tolerated); payroll-rules sha. S13.2 leave.ts/payroll.ts additions only, correction.ts/ui.tsx/layout.tsx marked hunks only. Base = `baseRef("QC_H211_BASE")`; no newest-migration assertion.

## Builder notes / risks
- Swap and OT approvals here are future-dated ⇒ OT stays unsettled (S8.2 expects 0 OT_REQUEST rows).
- S11 is RED until `listCorrections` stops doing `periodCountOf` per row (brief R1 correction.ts hunk) and every inbox reader is batched.
- `teamOverview` for staff: expected null only when all four readers return null for that viewer (computed, not assumed).

## Checks
H2.11-S1.1 · R1 · MAJOR · RED · [static] inbox.ts server-only (no directive) · exports listInbox inboxCounts decideInbox teamOverview teamLeaveQuota
H2.11-S1.2 · R3 · CRITICAL · RED · [static] inbox.ts imports from type modules ⊆ R3 list · never decideLeave/bulkDecideLeave/decideAdjustment · other specs allowed
H2.11-S1.3 · R3 · CRITICAL · RED · [static] inbox.ts: no prisma, no hr*/approval* table accessor, no *RawUnsafe (auditLog only)
H2.11-S1.4 · R1 · MAJOR · RED · [static] inbox-shared.ts: no imports · INBOX_TEXT byte-exact (10 texts)
H2.11-S1.5 · R1 · CRITICAL · RED · [static] inbox-actions.ts "use server": decideInboxAction → requireTenant + hrViewerOf + decideInbox · no now
H2.11-S1.6 · R12 · CRITICAL · RED · [static] page + overview-ui import no per-type module · InboxBatch "use client" imports allowed · no DB reach
H2.11-S1.7 · R2 · CRITICAL · RED · [static] wrappers: leave.ts decideLeaveAs/leaveDetailsMany/teamLeaveBalances · payroll.ts decideAdjustmentAs + listAdjustments pendingUnbound
H2.11-F1 · fixture · CRITICAL · GREEN · [db] fixtures through own request functions: each type's own lister shows the owner all 17 pending T1 items
H2.11-F2 · fixture · MAJOR · GREEN · [db] L3 owned by a PENDING approval request · L4 APPROVED · other-tenant LO/AO pending in T2
H2.11-S2.1 · R5 · CRITICAL · RED · [db] owner: exact list (17 · L3 CHAIN)
H2.11-S2.2 · R5 · CRITICAL · RED · [db] MANAGER[u1] linked: L1 L3c O1 OL S1r C1r CPr (own LM/OM/CM hidden · no ADJ · no u2)
H2.11-S2.3 · R5 · CRITICAL · RED · [db] STAFF[u1] hr.employee.create: S1 C1 CP CM
H2.11-S2.4 · R5 · CRITICAL · RED · [db] STAFF[u1] leave.decide+payadjust: L1 LM L3c O1f OM OL
H2.11-S2.5 · R5 · CRITICAL · RED · [db] STAFF* payroll+approve: O1 O2 OM OL A1 A2f AS
H2.11-S2.6 · R5 · CRITICAL · RED · [db] STAFF* payroll-only: all OT + ADJ read-only NO_RIGHT
H2.11-S2.7 · R4 · CRITICAL · RED · [db] staff · kiosk · member: listInbox/inboxCounts null · decideInbox noAccess (nothing written)
H2.11-S3.1 · R4 · CRITICAL · RED · [db] item keys exact for every viewer · type/blocker vocab
H2.11-S3.2 · R4 · CRITICAL · RED · [db] detail keys per type exact · leave reason only for leave readers · swap reason only for deciders
H2.11-S3.3 · R4 · CRITICAL · RED · [db] no ฿/segments/paidMin/linkedUserId/pin/salary/national id keys (non-payroll viewers: no amountSatang at all)
H2.11-S3.4 · R4 · MAJOR · RED · [db] ADJUSTMENT: AS source STOCK + consent {at,ref} · A1 MANUAL + consent null
H2.11-S3.5 · R4 · MAJOR · RED · [db] batchable = canDecide ∧ type≠ADJUSTMENT
H2.11-S4.1 · R4 · CRITICAL · RED · [db] counts = list lengths per type · decidable · inboxCounts = listInbox counts (all viewers)
H2.11-S4.2 · R4 · MAJOR · RED · [db] type filter OT ⇒ only OT items · counts unchanged
H2.11-S4.3 · R4 · CRITICAL · RED · [db] unit filter: owner u2 ⇒ u2 items only · MANAGER[u1] asking u2 ⇒ [] (no leak)
H2.11-S4.4 · R4 · MAJOR · RED · [db] age filter minAgeDays 7 ⇒ exactly the two back-dated items
H2.11-S4.5 · R4 · MAJOR · RED · [db] sort createdAt asc/id asc · paging take 4 ⇒ union = full list, no dupes, last nextCursor null
H2.11-S5.1 · R4 · CRITICAL · RED · [db] LEAVE impact: keys · duty = leaveDutyHintsMany entry · balance keys · othersOff owner [E3] / manager u1 []
H2.11-S5.2 · R4 · MAJOR · RED · [db] OT impact measuredMin null (no punches) · weekWarn false · SWAP impact null
H2.11-S5.3 · R4 · CRITICAL · RED · [db] CORRECTION impact: CP monthClosed true · C1 false · deltaMin null (ADD)
H2.11-S5.4 · R4 · MAJOR · RED · [db] ADJUSTMENT impact targetPeriod 2031-06 (A1, AS)
H2.11-S6.1 · R6 · CRITICAL · RED · [db] whole-call refusals: noAccess · key · empty · tooMany(51) · badItem · rejectReason — no audit row
H2.11-S6.2 · R6 · CRITICAL · RED · [db] batch MANAGER[u1] (14 mixed items) ⇒ per-item results = each type's own text
H2.11-S6.3 · R6 · CRITICAL · RED · [db] batch key holder (paid month · other branch swap) ⇒ per-item results
H2.11-S6.4 · R6 · CRITICAL · RED · [db] payroll approver: batch ADJ ⇒ oneByOne · single A1/AS ok · single A2 own-requested text
H2.11-S6.5 · R6 · MAJOR · RED · [db] reject with reason ⇒ REJECTED · reason in hr.inbox.decide audit
H2.11-S7.1 · R8 · CRITICAL · RED · [db] double submit same key ⇒ replayed:true · identical results · nothing decided again
H2.11-S7.2 · R8 · MAJOR · RED · [db] same key, other items ⇒ batchDiff
H2.11-S7.3 · R8 · CRITICAL · RED · [db] two approvers in parallel on one OT ⇒ exactly one ok, other OT decided text · 1 approve audit
H2.11-S7.4 · R8 · CRITICAL · RED · [db] two approvers in parallel on one leave ⇒ one ok, other stale · 1 USE row
H2.11-S8.1 · inv · CRITICAL · RED · [db] leave ledger: L1 one USE row = −days · L2 REJECTED no USE · L3 still PENDING
H2.11-S8.2 · inv · CRITICAL · RED · [db] OT O1/O2/OM APPROVED · OL PENDING · no OT_REQUEST adjustment (future days not settled)
H2.11-S8.3 · inv · CRITICAL · RED · [db] correction C1/CM APPROVED with one OUT punch each · CP CANCELLED · C2 PENDING
H2.11-S8.4 · inv · CRITICAL · RED · [db] swap S1 APPROVED · shifts exchanged · one hr.swap.apply · S2 PENDING
H2.11-S8.5 · inv · CRITICAL · RED · [db] adjustments A1/AS APPROVED (one hr.payadjust.approve each) · A2 PENDING
H2.11-S8.6 · inv · CRITICAL · RED · [db] each decided item decided exactly once (decision audit = 1 per target · never 2)
H2.11-S8.7 · R8 · MAJOR · RED · [db] inbox audits: hr.inbox.decide = 29 · hr.inbox.batch = 11 · hr.inbox.batch_done = 11
H2.11-S9.1 · R9 · MAJOR · RED · [db] teamOverview owner: keys · board = loadAttendanceBoard · counts = inboxCounts · recompute/due = readers
H2.11-S9.2 · R9 · MAJOR · RED · [db] teamOverview MANAGER[u1] board = its own board · staff ⇒ null when every reader is null
H2.11-S10.1 · R10 · MAJOR · RED · [db] teamLeaveQuota owner: rows E1..E4+EM · cells = leaveBalances strings
H2.11-S10.2 · R10 · MAJOR · RED · [db] teamLeaveQuota MANAGER[u1] u1 rows only · key holder / payroll ⇒ null
H2.11-S11.1 · R11 · CRITICAL · RED · [db] listInbox query count: +4 each of LEAVE/OT/CORRECTION/ADJUSTMENT ⇒ same count · ≤ 60
H2.11-S12.1 · R12 · MAJOR · RED · [static] tab "คำขอ" right after "ใบลา" in hrTabs and layout HR children · page file exists
H2.11-S12.2 · UI · MAJOR · RED · [static] testids present · inventory rows (wo H2.11) both ways
H2.11-S12.3 · UI · MINOR · RED · [static] messages hr.inbox th=en · tokens only · visual spec "2.11"
H2.11-S13.1 · frozen · CRITICAL · GREEN · [static] frozen files unchanged (other WOs' marked hunks tolerated) · payroll-rules sha · no prisma change
H2.11-S13.2 · hunks · MAJOR · GREEN · [static] leave.ts/payroll.ts: marked additions only · correction.ts/ui.tsx/layout.tsx: marked hunks only
H2.11-Z1 · house · CRITICAL · GREEN · no residue
