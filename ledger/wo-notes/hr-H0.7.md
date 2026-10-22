# WO H0.7 — Hotfix residuals: leave requester = user id (+ data fix) · owner's own leave · cancel my leave · `linkedUserId` 1↔1 + `linkApprovedById` · plan steps carry the confirmer · self-binding of `requestLeaveAction`

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.7-oracle` cut from `session/hr` @392bf457 (brief) ⊇ 527c155f · 22 Oct 2026 · controller: Fable · oracle writer: Opus (this file §0–§1, §4, §9, §11 oracle part) · builder: Opus (sections B0–B11 below, branch `wip/pos-hr-h0.7`)
> Contract: brief `ledger/hr-briefs/hr-brief-H0.7.md` (§1 facts · §2 R1–R10 · §3 oracle · §6 Q1–Q3) + `hr-brief-COMMON.md` · HF-HR-0 rounds 4–5 (R4.1a · R4.3 · R4.7 · R5.4)
> Oracle: `scripts/qc-hr-h0.7.mts` (57 checks incl. Z1 · commit `test(hr): H0.7 oracle …` 564a5900 · **edited after commit: yes — ORACLE-EDIT S4.6 (pre-approved, see B9)**) · red run `ledger/wo-notes/hr-H0.7-red.txt` · green run `hr-H0.7-green.txt` (builder)
> DB: **QC4 only** — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.7.mts`

## 0. Checkpoint
- done (oracle writer): oracle written · run forced ×1 on the base (exit 1 · 10/57 · RED for the right reasons · residue none) · run unforced ×1 (SKIPPED · exit 0) · this note · red file
- next (builder): §4 of the brief — migration → R2/R3/R4/R5 → R6 → R7 → R8 → UI hunk → notes; answer §9 open questions with the controller first (Q-A … Q-F)
- last command: forced run → `===== qc-hr-h0.7 ===== passed 10/57 (QC_FORCE)` · `RESIDUE none (tenants=3 users=27)`

## 1. Files touched (oracle writer)
| file | new/edited | what |
|---|---|---|
| `scripts/qc-hr-h0.7.mts` | new | oracle (57 checks) |
| `ledger/wo-notes/hr-H0.7.md` | new | this note |
| `ledger/wo-notes/hr-H0.7-red.txt` | new | base run (forced + unforced) |

## Check table (id · rule · severity · base expectation · actual on base 392bf457)
Fixture: tenant `qc-hr-h0.7-<stamp>` (HR systems A + B, HrLeave policy on A with 1 MANAGER step) · `-b` (other tenant: HR system, employee, OWNER member) · `-fix` (data-fix tenant). Users: owner (employee, linked) · manager (MANAGER, employee, linked, no payroll) · payroll viewer (STAFF `hr.payroll.read` + `settings.staff.write` + `hr.leave.request`) · hrKey (STAFF `hr.leave.request/read/decide`) · staff A, B (linked, `hr.leave.request`) · staff C (unlinked employee) · noEmp (STAFF `hr.leave.request`, no employee) · plain member (no keys) · other-tenant OWNER · link targets X, Y, Y2, Z0–2, W0–2, V0–2, F1–F3 (no membership until linked). New columns are read with `$queryRaw` only ("∅col" = column absent).

| id | rule | sev | base exp. | actual reason on base |
|---|---|---|---|---|
| S1.1 | R2/R3 | CRIT | RED | action without `employeeId` returns early ⇒ 0 leaves |
| S1.2 | R2 | MAJ | RED | no request ⇒ "my requests" empty |
| S1.3 | R2 | MAJ | RED | `requestedById` = EMPLOYEE id · `filedById` column absent |
| S1.4 | R3 | CRIT | RED | staff A filed a leave for B (posted id trusted) |
| S1.5 | R3 | MAJ | RED | no refusal text · posting C's id created a leave of C |
| S1.6 | R3 | CRIT | RED | leaves created for another tenant's employee and for an HR-system-B employee under system A, no text |
| S1.7 | R2 | MAJ | RED | no refusal (leave created with employee id as requester) |
| S1.8 | R3 | MAJ | RED | requester = employee id · `filedById` absent |
| S2.1 | R4 | CRIT | RED | owner's leave PENDING + request PENDING |
| S2.2 | R4 | MAJ | RED | no `hr.leave.owner_auto` audit |
| S2.3 | R4 | MAJ | RED | `isOnLeave` false / `isAvailable` true |
| S2.4 | R4.1a | CRIT | GREEN | ✅ control — both self-decision texts |
| S2.5 | R4 | MAJ | RED | PENDING + request · `filedById` absent |
| S2.6 | R4.1a | CRIT | GREEN | ✅ control — owner cannot decide own legacy PENDING leave |
| S3.1 | R5 | CRIT | RED | no S1.1 leave (and `cancelLeave` absent) |
| S3.2 | R5 | CRIT | RED | `cancelLeave` absent |
| S3.3 | R5 | MAJ | RED | `cancelLeave` absent (fixture: chain APPROVED via `decide` + hand-delivered `applyApprovalEffect` ✓) |
| S3.4 | R5 | MAJ | RED | `cancelLeave` absent · owner leaves PENDING |
| S4.1 | R6 | CRIT | RED | link ok · `linkApprovedById` column absent |
| S4.2 | R6 | CRIT | RED | refused, no link — but with the OLD text "…การผูกบัญชีต้องทำโดยเจ้าของกิจการหรือผู้มีสิทธิ์ดูเงินเดือน" ≠ R6 text (see Q-B) |
| S4.3 | R6 | MAJ | RED | `linkApprovedById` absent |
| S4.4 | R6 | CRIT | RED | app refusal exists (HF-HR-0) but DB probe `accepted` (no unique index) |
| X4.5 | R6 | CRIT | GREEN | ✅ advisory lock `staff-link:` (R5.3) already serialises |
| S4.6 | R6 | MAJ | RED | no exported unlink function anywhere (see Q-C) |
| S4.7 | R6 | MAJ | RED | no `hr.employee.link` audit |
| S4.8 | R1 | CRIT | RED | index absent on QC4 |
| S5.1–S5.5 | R8 | CRIT/MAJ | RED | `scripts/hr-fix-approval-requester.mts` absent (S5.4/S5.5 require that the script ran) |
| S6.1 | R7 | MAJ | RED | `runKind(m, ctx.tenantId, st.kind, st.payload, \`plan-…\`)` — no user id |
| S6.2 | R7 | MAJ | GREEN | N/A — no leave-request proposal kind (`hr_request_leave`/`hr_leave_request`) exists; becomes behavioural if the builder adds one (see Q-D) |
| S6.3 | R5.4 | CRIT | GREEN | ✅ control |
| S7.1 | R1 | CRIT | RED | migration folder absent |
| S7.2 | R1 | MAJ | RED | schema fields absent |
| S7.3 | R1 | CRIT | RED | QC4 columns absent |
| S7.4 | C.4 | CRIT | GREEN | ✅ `payroll-rules.ts` sha256 75a66c0c… |
| S7.5 | R9 | CRIT | GREEN | ✅ reader signature hash e995b128… + facade exports |
| S7.6 | R10 | MAJ | RED | `cancelLeave` / `cancelLeaveAction` absent |
| S7.7 | R5 | MAJ | RED | no `.tsx` wiring `cancelLeaveAction` with a `…cancel…` testid in `hr-ui-inventory.json` |
| S7.8 | R5.4 | MIN | GREEN | ✅ `PLAN_HUMAN_ONLY` kept |
| X6.1 / X6.2 | X6 | MAJ | RED | script absent |
| X7.1 | R4.3 | CRIT | GREEN | ✅ conditional updateMany already gives one winner |
| X7.2 | R1 | CRIT | RED | raw UPDATEs on 2 connections: both commit ×3 (one user linked to 2 employees) |
| X8.1 | C.1 | MAJ | RED | none of the three audit kinds exist |
| X8.2 | C.1 | MAJ | RED | S1.5/S1.6 texts empty · S3.2 no function |
| X8.3 | R9 | MAJ | RED | staff DTO keys unchanged ✓ but manager row has no "ยื่นโดย <name>" |
| X9.1–X9.7 | X9 | CRIT | RED | `cancelLeaveAction` absent (refusal cells require the function to exist, so they cannot be vacuously green) |
| Z1 | – | CRIT | GREEN | ✅ residue none |

Green on base = 10 (S2.4 · S2.6 · X4.5 · X7.1 · S6.2(N/A) · S6.3 · S7.4 · S7.5 · S7.8 · Z1) — all controls / freezes / N/A, none of them a vacuous pass of new behaviour except S6.2 (flagged Q-D).

## 4. X-group (this WO)
| X | applies? | ids / N-A |
|---|---|---|
| X1 idempotency | yes | S5.3 · X6.1 (second apply = 0) · X6.2 (parallel applies) |
| X2 cross-tenant / cross-system | yes | S1.6 (other tenant + other HR system) · X9.6 · S5.4 |
| X3 permissions / self-decision | yes | S1.4 S1.5 S1.8 · S2.4 S2.6 · S3.2 · S4.2 · X9.* |
| X4 money | N-A | no money moves |
| X5 reversal | yes | S3.1 (leave + request both cancelled) · S4.6 (unlink clears both columns) |
| X6 race | yes | X4.5 · X7.1 · X7.2 (2 connections × 3 rounds — the brief asks for "two concurrent links"; not 10 lanes) · X6.2 |
| X7 time | partly | fixed dates (2031 future / 2020 past) — never "today"; S3.4 depends on "future vs past" only |
| X8 not connected | N-A | no ACCOUNT/POS/CRM side effect added |
| X9 outbox | N-A | no new event (owner-auto emits none per brief; `hr.leave.submitted` unchanged) — see Q-E |
| X10 visual | builder/controller | S7.7 static only; screenshots are CONTROLLER-RUN |
| X11 PDPA | yes | X8.1–X8.3 · S5.5 · S2.2 · S4.7 |
| X12 no env | yes | statics (S6.1 S7.1 S7.2 S7.4–S7.8) run before any DB use |

## 9. Disputes / open questions for the controller (not silently weakened)
- **Q-A · R4 `decisionNote` has no column.** R4 says the owner-auto leave gets `decisionNote` "เจ้าของร้าน — ไม่ต้องผ่านการอนุมัติ" and the R5 fallback mentions `decisionNote` too, but `HrLeave` has no such column (`prisma/schema/hr.prisma:162-178`) and R1 adds only `linkApprovedById` + `filedById`. S7.1 asserts **exactly three statements**, so a fourth `ADD COLUMN "decisionNote"` would turn S7.1 red. The oracle does **not** assert the note (constant `T_OWNER_NOTE` is declared, unused). Ruling needed: (a) drop the note, (b) carry it in the `hr.leave.owner_auto` audit `after` only, or (c) allow a 4th statement (ORACLE-EDIT S7.1). Q1 is moot: `HrLeaveStatus` already has `CANCELLED` (`hr.prisma:7`), so no enum statement is needed.
- **Q-B · S4.2 text change.** The salary-profile refusal already exists since HF-HR-0 (`staff/service.ts:396-398`, text "…การผูกบัญชีต้องทำโดยเจ้าของกิจการหรือผู้มีสิทธิ์ดูเงินเดือน"). The oracle encodes the R6 text literally, so the builder must **replace** the old text. If the controller prefers to keep the old bytes (checked: no oracle under `scripts/` pins the old text — `grep -rl มีข้อมูลเงินเดือน scripts` hits only this oracle), ORACLE-EDIT S4.2 to the old text.
- **Q-C · No unlink path exists.** R6 "Unlink clears both" — there is no unlink function in `src/lib/staff/service.ts` or `hr/service.ts` (`revokeStaffAccess` only sets `Membership.acceptedAt = null` and leaves `linkedUserId`). S4.6 looks for any exported function whose name matches `/unlink/i` in staff/service then hr/service and calls it as `fn({ tenantId, actorUserId, employeeId })`. Ruling needed: is a new unlink function in scope (and its name/signature/permission), or should `revokeStaffAccess` clear the link (then ORACLE-EDIT S4.6 to call it with `membershipId`)?
- **Q-D · S6.2 is N/A on this tree.** There is no `hr_request_leave` proposal kind, and no HR plan kind needs an actor today (`hr_create_employee` does not). R7 is therefore enforced only by S6.1 (static: `executePlan` passes the confirmer to `runKind`). Also: `runKind` **already** has a positional 6th parameter `userId` (K3.5, `proposals.ts:475-483`); the brief's `{ userId }` options object would be a second way to pass the same thing. S6.1 accepts either form (`/userId/` inside the `runKind(...)` call). If the builder adds a leave-request kind, S6.2 runs a plan step `{ kind, payload: { type, fromDate, toDate } }` confirmed by staff A — payload shape is the oracle's guess (ORACLE-EDIT if different).
- **Q-E · No outbox event for owner-auto / cancel.** The brief names audits only. If the builder emits `hr.leave.submitted` for owner-auto leaves (kanban bridge "หาคนแทน") or a new `hr.leave.cancelled`, COMMON §C.10 (consumer + label + replay ×2) applies and the oracle has no check — controller to rule.
- **Q-F · Unspecified refusal texts.** R3 (no employee · not-found) and R5 (cancel refusals) give no exact text. The oracle requires Thai, no error internals (`Error`, `prisma`, `P20xx`, `undefined`, …), and no other person's name (X8.2) — not exact bytes. Say if exact bytes are wanted.
- **Action shapes the oracle assumes** (ORACLE-EDIT if the builder needs another): `requestLeaveAction` / `cancelLeaveAction` are called by arity — `(fd)`, `(prev, fd)` or `(systemId, prev, fd)`; form fields `systemId`, `leaveId` (cancel) and `systemId`, `employeeId?`, `type`, `fromDate`, `toDate`, `reason` (request); a refusal may be returned (`{message|reason|error}`) or thrown. `cancelLeave(ctx, leaveId, { actorUserId })` may return `{ ok:false, reason }` / `false` or throw. `requestLeave(ctx, { …, actorUserId })`. The data fix script must accept `--tenant <id>` and `--apply`; its output is checked for the integers 2 / 1 (dry-run), 0 (re-apply), and the unlinked row's ApprovalRequest id **or** employee id.
- **X8.3 key name.** The manager-side "ยื่นโดย <display name>" is checked as a substring of the DTO row (any key); the staff-side DTO must keep exactly `id, employeeName, type, fromDate, toDate, status` (no `reason` for staff without `hr.leave.read`, no filer field).
- **HQ19 (Q3):** encoded with the default (STAFF files only for themself; MANAGER / OWNER / holders of `hr.employee.create` or `hr.leave.decide` may file on behalf, with `filedById`).
- Observation (not this WO): staff A (`hr.leave.request` only) receives 27 leave rows of the whole system from `leaveItemsForViewer` (names/dates/status, no reason). That is today's behaviour and outside H0.7's contract; noted for the privacy hunter.

## 11. QC4 restored / temp data left (oracle)
- `finally` sweeps every tenant-scoped table of the 3 tenants (2 passes) + users by id and by e-mail prefix `qc-hr-h0.7-<stamp>-` + sessions + ChatRateBucket keys containing our ids; residue line checks HrLeave/HrEmployee/HrSalaryProfile/ApprovalRequest/ApprovalPolicy/AuditLog/OutboxEvent/AiPlan/AiConversation/Membership/AppSystem per tenant, users, sessions, tenants by prefix, rate rows.
- Base run: `RESIDUE none (tenants=3 users=27)` · Z1 ✅. **Temp data left: none.**
- Commands run (oracle writer): `bash scripts/iso.sh pnpm exec prisma generate` · forced run (exit 1, 10/57) · unforced run (exit 0, SKIPPED) — each through `iso.sh` + `qc4.sh` + `with-gate-lock.sh`, foreground, one at a time.


---
# BUILDER (wip/pos-hr-h0.7 · cut from origin/wip/pos-hr-h0.7-oracle 564a5900)

## B0. Checkpoint
- done: migration (QC4 applied) · R2–R10 · ORACLE-EDIT S4.6 · oracle forced ×2 + unforced ×1 = 56/57 (S1.7 = dispute D-1) · regression + seed + fitness both modes all green · notes · green file
- next (controller): rule D-1 (S1.7) · CONTROLLER-RUN screenshots `visual-hr.mts 0.7` · reviewer + privacy hunter
- typecheck: NOT run — gate never opened in 90 min (B5)

## B1. Files → R-items (lines on the branch head)
| file | what | R | hot file? |
|---|---|---|---|
| `prisma/schema/hr.prisma` | `HrEmployee.linkApprovedById String?` (+ comment on the partial unique) · `HrLeave.filedById String?` | R1 | — (Mig WO) |
| `prisma/migrations/20261203000000_hr_link_unique_requester/migration.sql` | exactly 3 statements: 2× `ADD COLUMN … TEXT` + `CREATE UNIQUE INDEX "HrEmployee_tenantId_linkedUserId_key" … WHERE "linkedUserId" IS NOT NULL` (pre-check SQL in the header comment) | R1 | — |
| `src/lib/modules/hr/service.ts` :465-501 | `RequestLeaveInput.actorUserId?` · `HrLeaveRequestError` · fixed texts · `isTenantOwner` | R2 R4 R10 | — |
| `src/lib/modules/hr/service.ts` :503-590 | `requestLeave`: employee must be in this HR system (else `LEAVE_EMPLOYEE_NOT_FOUND`) · requester = `linkedUserId ?? actor` · explicit empty actor + unlinked ⇒ `LEAVE_NO_REQUESTER` · `filedById` · owner's own leave ⇒ APPROVED, `decidedById` null, no ApprovalRequest, no outbox, audit `hr.leave.owner_auto` {leaveId, employeeId, status, filedById, note "เจ้าของร้าน — ไม่ต้องผ่านการอนุมัติ"} (Q-A) · chain `requestedById = requester ?? employeeId` (legacy only, D-1) | R2 R4 | — |
| `src/lib/modules/hr/service.ts` :701-761 | `cancelLeave(ctx, leaveId, { actorUserId })` → `{ok:true}`/`{ok:false,reason}`: PENDING + requester (or legacy employee-id requester's linked user; no chain = linked user or filer) ⇒ `approval.cancelRequest` (core, guarded PENDING→CANCELLED) first, then leave PENDING→CANCELLED guarded · owner-auto APPROVED (no chain, decidedById null, actor = linked OWNER) only when `fromDate` > Bangkok today (`thaiDateKey`) · audit `hr.leave.cancel` {status, requestId, cancelledById} | R5 | — |
| `src/lib/modules/hr/actions.ts` :270-322 | `requestLeaveAction`: STAFF without `hr.employee.create`/`hr.leave.decide` never reads `employeeId` → `employeeOfUser` (none ⇒ Thai refusal, thrown `HrLeaveRequestError`) · others may post an id (service checks system) · always passes `actorUserId` · new `cancelLeaveAction(formData)` (tenant from session, refusal thrown as Thai `HrLeaveRequestError`) | R3 R5 | — |
| `src/lib/modules/hr/privacy.ts` :129-146 · `privacy-shared.ts` :93 | `LeaveItemDto.filedBy?` = "ยื่นโดย <User.name>" only for `hr.leave.read` viewers and only on filed-on-behalf leaves · staff keys unchanged | R9 | — |
| `src/lib/modules/hr/ui.tsx` :313 | history line shows `filedBy` when present | R9 | — |
| `src/app/app/approvals/page.tsx` :4, :78-95 | "คำขอของฉัน": PENDING HrLeave rows → ConfirmDialog → `cancelLeaveAction` (fields systemId + leaveId) · wrapper `data-testid=hr-leave-cancel-<leaveId>` · trigger `btn-sm min-h-11` (44 px) · other entity types keep `cancelMyRequestAction` | R5 | — |
| `scripts/hr-ui-inventory.json` | +3 rows `hr-leave-cancel-*` (display) · `-*-trigger` (button) · `-*-sheet` (form → action:cancelLeaveAction) | R5 | — |
| `src/lib/staff/service.ts` :26, :401, :440-446, :466-474, :589-622 | R6 text (Q-B) · `linkApprovedById: actor` in the guarded link updateMany (DB index = final judge; P2002 ⇒ existing retry ⇒ `otherLink` Thai text) · audit `hr.employee.link` {employeeId, userId, approvedById} · `revokeStaffAccess` one marked hunk: tx clears `linkedUserId`+`linkApprovedById` of the target's rows + membership revoke · audit `{employeeId, userId, approvedById:null, unlinked:true}` per employee (also for an already-revoked membership still linked) | R6 | — |
| `src/lib/ai/plans.ts` :140-142 | `runKind(…, \`plan-…\`, opts?.userId ?? null)` — existing 6th positional (Q-D) · PLAN_HUMAN_ONLY untouched | R7 | yes (marked) |
| `scripts/hr-fix-approval-requester.mts` | new · R8 | R8 | — |
| `scripts/visual-hr.mts` | `SPECS["0.7"]` = `/app/approvals` for owner/manager/staff | X10 | — |
| `scripts/qc-hr-h0.7.mts` | ORACLE-EDIT S4.6 (B9) | — | — |
- `ai/proposals.ts` not touched (no new kind; Q-D) · `approval/service.ts` not touched (existing `cancelRequest`) · `payroll-rules.ts` untouched (S7.4) · no outbox event added (Q-E).

## B2. Migration + QC4
- `prisma migrate diff --from-schema <base prisma/schema> --to-schema prisma/schema --script` = the 2 `ADD COLUMN` statements (index is raw SQL by design) — read ✓.
- QC4 `_prisma_migrations` checked first: every local `202611*/202612*` folder present except ours; QC4 also has POS folders this branch lacks (2026120x–1219 pos_*) — expected, untouched.
- pre-check on QC4 (`… GROUP BY "tenantId","linkedUserId" HAVING count(*)>1`) = **0 rows** · columns absent before.
- applied: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → "Applying migration `20261203000000_hr_link_unique_requester`" · exit 0. S4.8/S7.3 green afterwards.
- `bash scripts/iso.sh pnpm exec prisma generate` (own node_modules).

## B3. Texts (Q-F — fixed Thai, no names, no internals)
| where | text |
|---|---|
| R2 no requester | ใบลานี้ยังไม่มีบัญชีผู้ยื่น — ให้ผู้จัดการยื่นแทน |
| R3 STAFF without employee row | บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ให้ผู้จัดการยื่นใบลาแทน หรือขอให้ผู้ดูแลผูกบัญชีก่อน |
| R3 employee not in this HR system / tenant | ไม่พบพนักงานคนนี้ในระบบพนักงานนี้ — กรุณารีเฟรชหน้าแล้วเลือกใหม่ |
| R4 audit note (payload only, Q-A) | เจ้าของร้าน — ไม่ต้องผ่านการอนุมัติ |
| R5 not found | ไม่พบใบลา หรืออยู่นอกร้านนี้ |
| R5 not the requester | ยกเลิกได้เฉพาะใบลาที่คุณยื่นเอง |
| R5 decided | ใบลานี้ตัดสินแล้ว — ยกเลิกเองไม่ได้ หากต้องเปลี่ยน กรุณาติดต่อหัวหน้าหรือเจ้าของกิจการ |
| R5 owner-auto already started | ใบลานี้ถึงวันลาแล้ว — ยกเลิกย้อนหลังไม่ได้ |
| R5 no actor | ระบบไม่ทราบผู้ยกเลิกใบลานี้ — กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง |
| R5 REJECTED/CANCELLED (own) | ใบลานี้ไม่อนุมัติแล้ว / ใบลานี้ยกเลิกแล้ว |
| R5 stale | สถานะใบลาเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่ (existing) |
| cancel form incomplete | ข้อมูลใบลาไม่ครบ กรุณาเปิดหน้าใหม่แล้วลองอีกครั้ง |
| R6 salary profile (Q-B, replaces HF-HR-0 text) | พนักงานคนนี้มีข้อมูลเงินเดือน — ให้ผู้ดูแลเงินเดือนเป็นคนผูกบัญชี |
| R6 1↔1 | existing HF-HR-0 text "บัญชีนี้ผูกกับพนักงานอีกคนในกิจการนี้อยู่แล้ว (1 บัญชีผูกได้กับพนักงาน 1 คน) — กรุณาใช้อีเมลอื่น" (no names) |
| UI | ปุ่ม "ยกเลิกใบลา" · "ยกเลิกใบลานี้?" · "ใบลาจะถูกยกเลิกและออกจากสายอนุมัติ — ถ้ายังต้องลา ให้ยื่นใบใหม่" · "ยืนยันยกเลิกใบลา" (inline like the rest of `/app/approvals`, which has no `messages` keys) |

## B4. Results (exit codes)
| suite | exit | summary |
|---|---|---|
| qc-hr-h0.7 forced #1 | 1 | passed 56/57 (QC_FORCE) · ❌ S1.7 only · RESIDUE none |
| qc-hr-h0.7 forced #2 | 1 | passed 56/57 (QC_FORCE) · ❌ S1.7 only · RESIDUE none |
| qc-hr-h0.7 unforced | 1 | passed 56/57 · ❌ S1.7 only · RESIDUE none (no longer SKIPs — H0.7 present) |
| qc-hr-leave-booking | 0 | 14/14 |
| qc-approval | 0 | 16/16 |
| qc-approval-wiring | 0 | 7/7 |
| qc-approval-edit | 0 | 12/12 |
| qc-hf-hr-privacy | 0 | 194/194 |
| qc-hr-h0.3 | 0 | 37/37 |
| qc-hr-h0.1 | 0 | 67/67 |
| qc-hr-h0.2 | 0 | 58/58 |
| qc-hr-h0.5 | 0 | 71/71 |
| qc-hr-h0.6 (QC_H06_BASE=d350c26c…) | 0 | 55/55 |
| qc-crm-c3.3 | 0 | 90/90 |
| qc-crm-c0.3 | 0 | 88/88 |
| seed-hr-qc (alone) | 0 | 23/23 |
| extra: qc-ai-proposals · qc-ai-tools · qc-hr · qc-hr-attendance · qc-chat-staff-perms | 0 ×5 | 16/16 · 18/18 · 9/9 · 31/31 · 49/49 |
| fitness (qc4 env / no env) | 0 / 0 | 42/42 · 42/42 |
| fitness-hr (qc4 env / no env) | 0 / 0 | 5/5 · 5/5 |
- pre-commit hook (fitness) passed on every commit (no `--no-verify`).

## B5. Typecheck
- **NOT RUN.** Gate (`free -g` available ≥ 11 GB AND no `iso-*` build/typecheck/tsc unit) checked every 5 min for 90 min (12:24–13:49Z): available 8–10 GB throughout (once 4 GB with one heavy POS unit at 13:04) ⇒ never open ⇒ stopped per the controller's rule. 0 typecheck runs used (budget 2 left). Command for the controller: `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`.
- Type risk notes for that run: `prisma generate` done (new columns typed) · `requestLeaveAction` still `Promise<void>` (form action) · `cancelLeaveAction(formData): Promise<void>` matches ConfirmDialog `action` · `RequestLeaveInput.actorUserId` optional ⇒ scripts/*.mts callers unaffected.

## B6. Visual (X10)
- `scripts/visual-hr.mts` gets `SPECS["0.7"]` (`/app/approvals`, owner/manager/staff). Builder ran `--dry` for the 3 users ⇒ 9 shots planned: `.qc-shots/hr/0.7/approvals-my-requests-{owner,manager,staff}-{1440x900,1024x768,390x844}.png`.
- Real shots are **CONTROLLER-RUN** (visual-hr header + COMMON §A.8: builders never build/serve). Note: the cancel button only renders for a user with a PENDING leave in an approval chain; HQC seed has no HrLeave policy ⇒ the controller needs a pending chain leave of the shot user (e.g. create a policy + file a leave) or the shots show the empty "คำขอของฉัน" state.

## B7. Prod runbook
1. Read-only pre-check on prod: `SELECT "tenantId","linkedUserId",count(*) FROM "HrEmployee" WHERE "linkedUserId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1` → must be 0 rows (HQ29 said 0 on 5 Oct). Non-zero ⇒ stop, owner decides which link stays.
2. `prisma migrate deploy` (Vercel build runs it before `next build`). Migration is additive + safe with old code.
3. Deploy code.
4. Data fix dry-run: `HR_FIX_PROD=1 HR_FIX_ENV_FILE=<prod env file> pnpm exec tsx scripts/hr-fix-approval-requester.mts` (DATABASE_URL must NOT be set in the shell) → counts per tenant + ids of rows whose employee is unlinked.
5. `… --apply` → second `--apply` must report 0 changed. Unlinked rows stay (listed by request id) — fixed automatically only after the employee is linked and the script is re-run.

## B8. Decisions / debts for the controller
- **D-1 (dispute · S1.7 red).** R2 + S1.7 want `requestLeave(ctx, {employeeId: <unlinked>, …})` **without** `actorUserId` to be refused. The same call shape (unlinked employee + active HrLeave policy + no actor) is used by the regression oracles the controller listed as must-stay-green: `qc-hf-hr-privacy` (`mkLeave(e2.id …)` in D-8/C-1/A-*/SC-4/AD-1/PL5, `eF2` in F2) and `qc-approval-wiring` AW-2.1–2.3 — they would crash/red (privacy far below 194). No input distinguishes the two. Implemented the HF-HR-0 R4.2 precedent: `actorUserId` **absent** = internal/legacy caller (old behaviour, requester = linked user, else employee id); **present but empty** = refused with the R2 text; every `src` caller passes the real user id (only `requestLeaveAction` reaches `requestLeave`). Requested **ORACLE-EDIT S1.7** (`scripts/qc-hr-h0.7.mts:560`): `await hr.requestLeave(ctxA, { employeeId: E.c, actorUserId: null, type: "SICK", fromDate: "2031-02-10", toDate: "2031-02-10" });` — reason: absent-vs-empty is the house convention (decideLeave R4.2) and is the only way to keep qc-hf-hr-privacy 194/194 + qc-approval-wiring green. Alternative (strict): keep S1.7 and ORACLE-EDIT `qc-hf-hr-privacy` mkLeave/F2 + `qc-approval-wiring` to pass an actor, then flip one line (`legacyCaller`) in requestLeave.
  - ruled by controller: ORACLE-EDIT S1.7 accepted + F16.6 guard (controller commit 40515732 · `scripts/fitness-hr.mts` F16.6 MAJOR: every `requestLeave(`/`cancelLeave(` call under src/** passes `actorUserId` — green 6/6 with no env; proven RED (MAJOR 1, `src/lib/modules/hr/actions.ts:300 requestLeave( ไม่มี actorUserId`) on a scratch copy of src with that key removed, real tree untouched because the controller unit hr-ctl-h07 was running in it)
- Owner's own leave: owner = linked user has an accepted OWNER membership of the tenant (fake user ids in old oracles ⇒ not owner ⇒ chain as before; privacy SC-5/SC-6/AD-3 unchanged).
- Owner-auto leaves are not in "คำขอของฉัน" (no ApprovalRequest) ⇒ the owner cancels them only through `cancelLeave` (no UI button yet) — debt, small UI WO.
- `revokeStaffAccess` now unlinks; `restoreStaffAccess` does **not** relink (re-grant needed) — intended (exposure), mention to owner.
- `requestLeaveAction` / `cancelLeaveAction` refusals are thrown Thai `HrLeaveRequestError` (same pattern as `decideLeaveAction`); form actions show the route error boundary — inline feedback would need useActionState (not in scope).
- The leave form on the HR page still shows the employee select to everyone; for STAFF the posted value is ignored (server-side) — UI could hide it (debt).
- R7 changes behaviour for every plan kind that reads `userId` (kanban/member/CRM kinds now get the confirmer instead of null) — intended by C8; qc-ai-proposals/tools green.
- No outbox events (Q-E).
- Observation from the oracle writer (staff sees all leaves of the system in `leaveItemsForViewer`) unchanged.

## B9. ORACLE-EDITs applied
- **S4.6** (pre-approved, Q-C): old = search exported `/unlink/i` function in staff/hr service, call `fn({tenantId, actorUserId, employeeId})`, assert both columns null · new = `staff.revokeStaffAccess({ tenantId, actorUserId: U.viewer.id, membershipId: g43.membershipId })`, assert both columns null **and** an `hr.employee.link` audit `{employeeId: EQ, userId: Y, approvedById: null, unlinked: true}`; registry title updated accordingly. Commit fa007b53.
- requested, not applied: **S1.7** (D-1 above).

## B10. Who gains / loses access
- loses: STAFF can no longer file leave for another employee; a manager without `hr.payroll.read` can no longer link an account to an employee with a salary profile (already refused since HF-HR-0, new text); a revoked account loses its employee link (payslip-self access).
- gains: requester sees own leave requests in "คำขอของฉัน" and can cancel PENDING ones; the owner's own leave needs no approval; managers/HR see "ยื่นโดย <name>".

## B11. Residue
- every oracle run: `RESIDUE none (tenants=3 users=27)` · Z1 ✅ · QC4 schema now has the H0.7 migration (additive) · seed-hr-qc re-run 23/23 · temp script `scripts/.h07-precheck.mts` deleted (never committed) · nothing of mine running.

## B10 (R10 addendum · numbered after B11 because B10/B11 already existed). Leave list row scope (privacy hunt F1 + F2)
- **Rule (R10.1 · R10.5).** `leaveRowScopeOf(m, userId)` in `src/lib/modules/hr/service.ts:805-826` (pure; uses `core/rbac` `evaluate`). It returns `{all:true}` when `m.role` is OWNER or MANAGER, or when `evaluate` grants `hr.leave.read` or `hr.leave.decide` (this is today's `reason` set widened by decide). Every other viewer gets `{linkedUserId: <userId>}`, which covers STAFF with only `hr.leave.request` / `hr.employee.create` / `hr.attendance.clock` / `hr.payroll.read`, or no key at all. An empty or missing userId gives `""`, which means 0 rows. The `reason` key still follows `hr.leave.read` only (`hrAccessOf().readLeave`), so a decide-only holder sees every row but no reason (S9.3).
- **Query filter (R10.1/R10.2).** `listLeaves(ctx, take = 100, scope?)` (:828) and `pendingLeaves(ctx, take = 100, scope?)` (:839) map the scope to a Prisma `where`:
  - all → `{}`;
  - own → `{ employee: { linkedUserId } }` inside the same `findMany` as `status`/`take`, so `take=100` can never cut off the viewer's own row (S9.10 builds 102 rows; the own row is the oldest);
  - `""` → `[]` without a query.
  - No scope = old behaviour (HrHub pending **count** card `ui.tsx:528`, internal callers).
- **Web (R10.1).** `privacy.ts:130-132` `leaveItemsForViewer` passes `leaveRowScopeOf(v, v.userId)` to both lists. DTO keys are unchanged (R10.4): base 6, plus `reason` for the read set, plus `filedBy` only on filed-on-behalf rows for the read set.
- **AI (R10.3).** `ai/tools.ts:233-236` `pending_leaves` reads `aiActorMembership(ctx.actor)`.
  - No membership (general API key) ⇒ `[]`. Output is still `{ใบลารออนุมัติ: []}` with no error. This is the fail-closed ruling, not the hunter's "wide" suggestion.
  - A member actor gets `leaveRowScopeOf(membership, aiActorUserId(actor))`.
  - The genuine system actor (scheduled-task, STAFF audience, no user) gets 0 rows.
  - Shape unchanged; still no reason.
  - `tool-access.ts` (OPEN) untouched; the row scope is the gate.
- Untouched: calendar, upcoming_schedule, kanban gates, tenant/system isolation (`tenantDb(ctx)`), and the HrHub count. Hunks marked `HR H0.7 R10 ▸ … ◂`.
- **Results.**
  - qc-hr-h0.7: forced ×2 = 67/67 exit 0, unforced = 67/67 exit 0, RESIDUE none (tenants=3 users=31).
  - Regression, all exit 0: qc-hf-hr-privacy 194/194 · qc-approval-wiring 7/7 · qc-ai-tools 18/18 · qc-ai-proposals 16/16 · qc-hr-h0.3 37/37 · qc-chat-staff-perms 49/49.
  - fitness 42/42 (env + no env) · fitness-hr 6/6 (env + no env).
  - No typecheck (controller).

## B12. R11 addendum (review M1 + m1 + m2/m3)
- **R11.1 owner-account link guard** (`src/lib/staff/service.ts:410`, one marked hunk inside the `grantStaffAccess` tx, right after the target membership `existing` is read).
  - Rule: if the target account's membership role is OWNER, and the actor is neither that same user nor an OWNER of the tenant, throw `StaffRuleError`. The whole transaction rolls back: no linkedUserId/linkApprovedById change, no membership change.
  - The `hr.employee.link` audit is written only after a successful tx, so a refusal writes 0 of them. Per the ruling, no refusal audit.
  - MANAGER/STAFF accounts link as before. An owner linking their own account, or a co-OWNER linking another owner, still works (S11.4/S11.5).
- **R11.2 cancel/decide lock.**
  - `decideLeave` (`hr/service.ts:630`): reads, checks, chain lookup and the guarded updateMany now run inside `tenantDb(ctx).$transaction`, after `pg_advisory_xact_lock(hashtextextended(\`hr-leave:${leaveId}\`, 0))`. The chain lookup now uses `tx` with an explicit tenantId. Texts, checks and order are unchanged; the audit is still written after commit; no events.
  - A cancelled leave re-read under the lock refuses with the existing Thai texts: `LEAVE_STALE` when a decider is given, otherwise "ใบลานี้ยกเลิกแล้ว — เปลี่ยนผลไม่ได้".
  - `cancelLeave` (`hr/service.ts:720`): takes the same key first. All reads plus both writes happen in one tx: `approval.cancelRequest(…, { tx })`, then HrLeave → CANCELLED. A decided leave is still refused with the existing text. `isTenantOwner` takes the tx, so no second connection is opened under the lock. Audit after commit.
  - `approval/service.ts:440` `cancelRequest` gains optional `opts.tx` (marked; no tx = old behaviour) and adds an explicit `tenantId` to the guarded where. Tx opts: `LEAVE_LOCK_TX_OPTS = { maxWait: 20_000, timeout: 60_000 }` (house value from payroll.ts).
- **R11.3 fitness-hr.**
  - F16.6 now treats a literal `actorUserId: undefined` (and `void …`) as missing, follows `import { requestLeave as x }` bindings, and pre-filters files on the bare names.
  - New **F16.7** (MAJOR): reads the CREATE UNIQUE INDEX name from `20261203000000_hr_link_unique_requester/migration.sql`. The name must appear in `prisma/schema/**` (today: the hr.prisma comment) or in a later migration, and no later migration may `DROP INDEX` it.
  - GREEN on the real tree: 7/7, exit 0 with no env.
  - RED, each on a throwaway copy in /tmp/h07-b/r11red (deleted; real tree untouched):
    - `actorUserId: undefined` at `actions.ts:302` ⇒ exit 1, "src/lib/modules/hr/actions.ts:300 requestLeave( ไม่มี actorUserId".
    - aliased import `requestLeave as fileLeave` in a scratch file ⇒ exit 1, "src/lib/tmpqc/alias.ts:2 requestLeave( ไม่มี actorUserId". The first try stayed green because of the old pre-filter; fixed, then re-proven.
    - schema comment removed ⇒ exit 1, "HrEmployee_tenantId_linkedUserId_key ไม่ถูกอ้างใน prisma/schema/** หรือ migration ที่ใหม่กว่า".
    - later migration with `DROP INDEX` ⇒ exit 1, "20261230000000_qc_drop DROP INDEX HrEmployee_tenantId_linkedUserId_key".
- **Text (add to B3):** R11.1 owner account ⇒ "ผูกบัญชีเจ้าของกิจการได้เฉพาะเจ้าของกิจการเอง — ให้เจ้าของกิจการเป็นผู้ทำรายการนี้".
- **Results.**
  - qc-hr-h0.7: forced ×2 = 74/74 exit 0, unforced = 74/74 exit 0, RESIDUE none (tenants=4 users=39).
  - Regression, all exit 0: qc-hf-hr-privacy 194/194 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-approval-edit 12/12 · qc-hr-leave-booking 14/14 · qc-chat-staff-perms 49/49 · qc-hr-h0.3 37/37.
  - fitness 42/42 (env + no env) · fitness-hr 7/7 (env + no env).
  - No typecheck (controller).
