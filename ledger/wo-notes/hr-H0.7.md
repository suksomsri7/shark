# WO H0.7 — Hotfix residuals: leave requester = user id (+ data fix) · owner's own leave · cancel my leave · `linkedUserId` 1↔1 + `linkApprovedById` · plan steps carry the confirmer · self-binding of `requestLeaveAction`

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.7-oracle` cut from `session/hr` @392bf457 (brief) ⊇ 527c155f · 22 Oct 2026 · controller: Fable · oracle writer: Opus (this file §0–§1, §4, §9, §11 oracle part) · builder: tbd
> Contract: brief `ledger/hr-briefs/hr-brief-H0.7.md` (§1 facts · §2 R1–R10 · §3 oracle · §6 Q1–Q3) + `hr-brief-COMMON.md` · HF-HR-0 rounds 4–5 (R4.1a · R4.3 · R4.7 · R5.4)
> Oracle: `scripts/qc-hr-h0.7.mts` (57 checks incl. Z1 · commit `test(hr): H0.7 oracle …` · **edited after commit: no**) · red run `ledger/wo-notes/hr-H0.7-red.txt` · green run `hr-H0.7-green.txt` (builder)
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
