# WO H0.6 — Payroll reversal correctness (D2b + CRM seam) · oracle

> RUN "HR V2" · worktree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.6-oracle` cut from `session/hr` @103fde95 (contains H0.1–H0.4, hotfix, main/CRM v2 71a1f363) · 8 Oct 2026 · oracle writer: Claude Opus 5.5 · builder: (next, from the post-H0.5 base, branch `wip/pos-hr-h0.6`)
> Contract: brief `ledger/hr-briefs/hr-brief-H0.6.md` (§2 R1–R8 · §3 oracle · §6 Q1–Q3) + `hr-brief-COMMON.md` (rules A–F) · controller amendment: oracle written on the *current* session/hr (H0.5 = PIN only; nothing here touches `hr/pin.ts` or PIN fields)
> Oracle: `scripts/qc-hr-h0.6.mts` (47 checks) · red run `ledger/wo-notes/hr-H0.6-red.txt` · green run `hr-H0.6-green.txt` (builder)
> DB: **QC4 only** (`ep-frosty-lab`) — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.6.mts`
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → ok (session/hr contains the hotfix)

## 0. Checkpoint
- done: oracle written · unforced run = SKIP exit 0 · forced run = RED for the right reasons, no crash, residue 0 (see §5) · file-only tsc 0 · full typecheck timed out ×2 (debt, §10) · commit + push
- next: builder implements R1–R5 on `wip/pos-hr-h0.6` (post-H0.5 base) until `qc-hr-h0.6` is green ×2; controller rules on OQ-1…OQ-9 first (§9)
- last command + final summary line: see §5

## 1. Files touched (oracle writer — no product code)
| file | new/edited | what | hot file? |
|---|---|---|---|
| `scripts/qc-hr-h0.6.mts` | new | the oracle (47 checks) | no |
| `ledger/wo-notes/hr-H0.6-red.txt` | new | forced run on the base | no |
| `ledger/wo-notes/hr-H0.6.md` | new | these notes | no |

## 2. Fixture (what the oracle builds — throwaway, swept in `finally`)
- Tenant **T** `qc-hr-h0.6-<rand>`: HR systems `H` (main story), `HB` (clawback), `HX` (races), `HO` (cross-system) · ACCOUNT `ACC` (`createSystem` + `ensureAccounting`) · CRM `CRM` (settings `uiVersion 2 · bridgesEnabled · commission {PAID, no approval, payrollLink}`, no rules).
- Tenant **T2** `qc-hr-h0.6-<rand>-b`: HR `H2`, **no ACCOUNT** (S7.1), later a temporary ACCOUNT that is deleted after the approve (S7.2); also the "other tenant" of X1.
- Main story on `H`, period P = `2032-03` (fixed future period — the oracle never depends on today): employees สมชาย 30,000 / สมหญิง 18,000 · OT ฿1,500 · DEDUCTION ฿500 · CRM commission **C1** (raw `CrmCommission` APPROVED row, the C3.3 way) + `requestAdjustment(kind COMMISSION, crmCommissionId: C1)` → decided APPROVED → `C1.hrPayAdjustmentId` linked · R1 create → `approveRun(expect incl. itemsDigest)` (JV) → `markPaid` → `hr.payroll.paid#R1` hand-delivered ⇒ C1 PAID (S0.1 control).
- Event delivery = by id to `consumers[type]` of `src/lib/outbox-consumers.ts` (whatever the row's status — another session's drainer may have claimed it) · **never a global drain** · events of other tenants are never read.
- Races (S6): two worker processes (`node_modules/.bin/tsx scripts/qc-hr-h0.6.mts --h06-worker …`), 5 lanes each (= 10 connections, pool warmed with 6 concurrent `SELECT 1 FROM pg_sleep(0.3)`), released round by round through a stdin barrier (`GO i` → `H06ROUND i …`) — no wall-clock windows, generous 30-min waits (QC4 under CPU steal).

## 3. Check list → brief ruling
| id | what | brief |
|---|---|---|
| S0.1 | [control] fixture paid: R1 PAID + JV, 3 bound, C1 PAID | §3 fixture |
| S1.1 | reverse ok · REVERSED · `reversedAt` ≈ now · `reversedById` = actor (raw SQL) | R1 · R2.3 |
| S1.2 | original JV REVERSED · one mirrored REVERSAL entry | R2.4 · `qc-payroll-reverse` |
| S1.3 | 3 adjustments unbound, APPROVED, unchanged, CRM link intact | R2.5 |
| S1.4 | audit `hr.payroll.reverse` {runId, periodKey, adjustmentCount 3, journalEntryId, reversalEntryId} + actor | R2.7 |
| S1.5 | one event `hr.payroll.reversed#R1`, systemId = HR | R2.6 · C.10 |
| S1.6 | items + totals kept | R2 (items stay) · Q1 |
| X8.1 | payload exactly {runId, periodKey, adjustmentIds} · no name/amount/note in payload or audits | R2.6 · R7 · Q2 |
| S2.1 | P open after reverse: `payrollRunPeriods` without P · `strandedAdjustments` none | R3 |
| S2.2 | `createPayrollRun(P)` → R2 binds the same 3 ids, same totals + digest | R3 · D2b |
| S2.3 | live R2 takes P (`payrollRunPeriods`, stranded lists a late row) | R3 |
| S2.4 | DB partial unique + plain index + 2 nullable columns (`pg_indexes`, `information_schema`) | R1 |
| S2.5 | third create while R2 live → exact dup text | R3 (text unchanged) |
| S2.6 | raw INSERT: second live row → 23505 · extra REVERSED row accepted (rolled back) | R1 (index proof) |
| S2.7 | `strandedCommissionAdjustments` does not list the unbound COMMISSION row of the reversed period | R3 · §4 "two status filters" · **OQ-4** |
| S3.1 | consumer exists · C1 PAID → APPROVED | R4 |
| S3.2 | one audit `crm.commission.unpaid` with before/after/via/runId, actor null | R4 |
| X9.1 | replay ×2 + ×2 parallel + direct call → 0 changes, 1 audit | R4 replay-safe · C.10 |
| S3.3 | R2 approve + markPaid → C1 PAID · trail PAID→APPROVED→PAID | §3 S3 |
| X9.2 | late replay of `hr.payroll.reversed#R1` (and `paid#R1`) after R2 is PAID → C1 stays PAID | R4 "exactly once" · **OQ-3** |
| S4.1 | clawback rows (C2r, C3r), C3 and D2 untouched by the reverse | R5 |
| S4.2 | A2 + D3 (DEDUCTION bound to the reversed run) unbound and re-bound by R2b | R5 |
| S4.3 | C2 (clawed back while paid in R1b) follows the pair rule PAID→APPROVED→PAID · money nets to 0 | R4 · R5 · **OQ-2** |
| S5.1 | DRAFT → exact no-JV text (today's text) | R2.2 · **OQ-1** |
| S5.2 | second reverse → exact "รอบนี้กลับรายการไปแล้ว" | R2.2 |
| S5.3 | DRAFT carrying a JV id → exact "รอบนี้กลับรายการไม่ได้ในสถานะปัจจุบัน" | R2.2 |
| S5.4 | `reverseEntry` throws inside the tx → fixed note, APPROVED, bound, no event, no success audit | R2 (one tx) · fixed-text rule · **OQ-8** |
| S5.5 | refusal audits for S5.1–S5.3 (code + actor) | R2.2 · **OQ-5** |
| S5.6 | [static] no `.message` / `String(e)` / `${e}` in `reverseRun` | R2.2 |
| X1.1 | other tenant / other HR system → exact "ไม่พบรอบจ่าย", untouched | R2.2 · X2 of COMMON |
| X1.2 | forged event under the other tenant + direct call → 0 changes | R4 · X1 |
| X1.3 | `adjustmentsByIds(ctx, ids)` scoped to tenant + system | R4 · **OQ-6** |
| S6.0 | [control] 2 processes × 5 lanes answered all 12 rounds | R6 |
| X6.1 | 10 ∥ reverse ×3 → 1 ok, 9 exact "already", 1 reversal, 1 event | R6 |
| X6.2 | 5 reverse ∥ 5 create ×3 → ≤1 live run, dup texts, period re-runnable | R6 |
| X6.3 | 5 markPaid ∥ 5 reverse ×3 → REVERSED, ≤1 paid event, 1 reversed event | R6 |
| X6.4 | 5 approve(expect) ∥ 5 reverse on a DRAFT ×3 → never 2 JVs, consistent winner | R6 |
| S6.5 | whole-tenant ledger + events consistent · ΣDr = ΣCr | R6 · `qc-payroll-reverse` |
| S7.1 | no ACCOUNT system → exact no-JV text | X8 (today's rule) |
| S7.2 | ACCOUNT deleted after the JV → REVERSED, unbound, event, audit `jvReversed:false`, JV untouched | X8 controller default · **OQ-9** |
| S8.1 | [static] consumer line · bridge · marked CRM fn · `adjustmentsByIds` + facade re-export | R4 |
| S8.2 | [static] webhook label exactly once · twin of every `"hr.payroll.paid"` registry | R4 · C.10 |
| S8.3 | [static] migration SQL + schema | R1 |
| S8.4 | [static] FREEZE: payroll-rules.ts (F16.2), computeItem, markPaid block | §4 · C.4 |
| S8.5 | [static] marked hunks only in the 4 files (diff vs `103fde95`, override `QC_H06_BASE`) · commissions.ts append-only | §3 S8 · COMMON §D |
| S8.6 | [static] signature + tx + lock + FOR UPDATE + `reverseEntry(…, tx)` + emit · `reverseRunAction` passes the actor | R2 |
| Z1 | residue (every tenantId table, audit, outbox) | COMMON B.1 |

## 4. X-group checks
| X | applies? | ids |
|---|---|---|
| X1 idempotency / replay | yes | X9.1 · X9.2 · S5.2 · X6.1 |
| X2 cross-tenant / cross-system | yes | X1.1 · X1.2 · X1.3 |
| X3 permissions | N-A in this oracle — "who can reverse" is unchanged (`hr.payroll.approve` + `canViewPayroll` in `reverseRunAction`); the action is only checked statically for passing the actor (S8.6) |
| X4 money | yes | S1.2 · S2.2 · S4.3 · S6.5 |
| X5 reversal | yes (the WO itself) | S1.* · S3.* · S4.* |
| X6 race | yes | S6.0 · X6.1–X6.4 |
| X7 time | N-A — fixed future periods; `reversedAt` compared to the call time ± 1 h only |
| X8 not connected | yes | S7.1 · S7.2 |
| X9 outbox | yes | S1.5 · S3.1 · X9.1 · X9.2 · S8.1 · S8.2 |
| X10 visual | N-A — no UI in H0.6 (R8) |
| X11 PDPA | yes (payload/audit) | X8.1 |
| X12 no env | static checks (S5.6, S8.*) need no DB; the suite as a whole needs QC4 |

## 5. Commands run (writer) — final lines + exit codes
- `grep -c ep-frosty-lab .env.qc4` → `2`
- `node_modules/.bin/tsx scripts/qc-hr-h0.6.mts --list` → 47 checks, exit 0
- file-only `tsc -p <scratch tsconfig extending tsconfig.json, include = the oracle>` → exit 0 (scratch file removed)
- unforced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.6.mts` → exit 0 · `JSON_SUMMARY {"suite":"qc-hr-h0.6","total":0,"passed":0,"failed":[],"findings":[],"skipped":true,"reason":["prisma/migrations/20261202000000_hr_payroll_run_live_unique/migration.sql: partial unique index migration absent","src/lib/modules/crm/commissions.ts: onPayrollReversed absent","src/lib/modules/hr/payroll.ts: adjustmentsByIds absent"],"registered":47}`
- forced: `… env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.6.mts` → exit 1 · `===== qc-hr-h0.6 ===== passed 12/47 (QC_FORCE)` · `"crashed":null` · `RESIDUE tenants=0 rows=0 audit=0 outbox=0` → `ledger/wo-notes/hr-H0.6-red.txt`
  - green on the base (controls / invariants): S0.1 fixture · S1.2 JV reversal (today's reverseEntry) · S1.6 items kept · S2.7 (vacuous on the base: the row is never unbound) · S4.1 clawback rows untouched · S5.1 + S7.1 no-JV text unchanged · X1.1 not-found text · S6.0 workers · X6.4 approve ∥ reverse consistent (reverse always refused on the base) · S8.4 freeze · Z1 residue
  - RED on the base, for these reasons: **S1** `column "reversedAt" does not exist` (S1.1) · adjustments stay bound (S1.3) · no audit (S1.4) · no event (S1.5, X8.1 payload null) · **S2** `payrollRunPeriods` still lists P (S2.1) · `createPayrollRun(P)` → "มีรอบจ่ายงวด 2032-03 อยู่แล้ว…" (S2.2; S2.3/S2.5 need R2) · plain unique only, no partial index/columns (S2.4) · a REVERSED row insert hits the plain unique (S2.6) · **S3/X9/X1.2** consumer `hr.payroll.reversed` + `onPayrollReversed` absent, C1 stays PAID · **S4.2/S4.3** rows stay bound, no R2b, no event · **S5** second reverse ok text but no event (S5.2) · DRAFT+JV → "รอบนี้กลับรายการไปแล้ว หรือสถานะเปลี่ยน" (S5.3) · `reverseEntry` failure returns `e.message` "ไม่พบรายการบัญชีที่จะกลับ" (S5.4) · no refusal audits (S5.5) · `.message` in reverseRun (S5.6) · **S7.2** no event/audit, adjustment bound · **X1.3** `adjustmentsByIds` absent · **X6.1–X6.3** losers get "รอบนี้กลับรายการไปแล้ว หรือสถานะเปลี่ยน" (no lock), 0 events, rows bound, period not re-runnable · **S6.5** 0 reversed events per REVERSED run · **S8.1–S8.3, S8.5, S8.6** statics absent
  - writer note: forced run #1 (same base) failed S6.0 on a harness bug — the worker warm-up `SELECT pg_sleep()` returns `void`, which Prisma 7 cannot deserialize; fixed to `SELECT 1 AS one FROM pg_sleep(0.3)` before the recorded run (run #1: 10/47, the same REDs otherwise, residue 0)
- typecheck (COMMON §A.9, 2 runs allowed — both used): run 1 `timeout -k 10 1200 … pnpm typecheck` → exit 124 (timeout; tsc started, no diagnostics printed) · run 2 same command with `timeout -k 10 3000` → exit 124 with empty output (never got past the gate lock in 50 min; load 45–53). **Full typecheck NOT completed by the writer — controller to run it.** Evidence the oracle compiles: the file-only `tsc` above (repo tsconfig, strict) exit 0; the oracle imports no app module statically (all `await import("…" as string)`), so it cannot break the type graph of `src/**`.

## 9. Open questions for the controller (OQ-n · default implemented)
- **OQ-1 no-JV text.** Brief R2.2 writes "รอบนี้ยังไม่ได้ลงบัญชี — ไม่มีรายการให้กลับ (รอบที่ยังเป็นร่างใช้ปุ่มลบร่าง)", today's `payroll.ts:1033` says `… (รอบที่ยังเป็นร่าง ยกเลิกได้ด้วยปุ่ม "ลบร่าง")`, and §3 S5 says "(unchanged text)". **Default: today's text, compared exactly** (S5.1 · S7.1 · X6.4). Both wordings pass `qc-hr-h0.1` S4.7. If the controller wants the R2.2 wording, ORACLE-EDIT = the constant `T_NO_JV`.
- **OQ-2 R5's premise does not match the code.** `crm/commissions.ts` `reverseRows` (:748-826) never changes the original row's status: a clawed-back PAID commission stays **PAID**; only the new negative row is REVERSED (`reversedOfId` = original). So for "a commission PAID in R1 that CRM reverses before HR reverses R1" the R4 pair rule (status PAID · reversedOfId null · {id, hrPayAdjustmentId}) **does** match the original. **Default (S4.3): R4 literally** — the original goes PAID→APPROVED, its COMMISSION row re-enters R2 and is paid again, the clawback DEDUCTION (next free period) still deducts it, so the money nets to 0 (asserted). The literal R5 case ("the DEDUCTION row bound to the reversed run") is covered separately with C3/D3 (C3 paid in an earlier run, its DEDUCTION bound to R1b): reversal row stays REVERSED and untouched, D3 re-enters R2b (S4.1/S4.2). Alternative if the controller prefers: skip originals that have a reversal row ⇒ S4.3 ORACLE-EDIT.
- **OQ-3 late replay (money).** R4 as written would un-pay a commission that R2 already paid again if `hr.payroll.reversed#R1` is delivered late (retry/backlog after R2 is PAID): the adjustment id is the same, C1 is PAID, the pair matches. X9.2 asserts **no change**. Suggested guard: `adjustmentsByIds` (or the consumer) skips adjustments that are bound to a run whose status is PAID (unbound, DRAFT or APPROVED runs still un-pay — a delayed event that arrives while R2 is a DRAFT must still set C1 back to APPROVED, else a later `deleteDraftRun` would leave it PAID forever).
- **OQ-4 CRM sweeper filter.** §4 allows "the two status filters" in the CRM C3.3 block of `payroll.ts`. I read them as `payrollRunPeriods` (:1286) **and** `strandedCommissionAdjustments` (:1420). Without the second one the minute job `crm.commissions.payroll` (rehomeStranded) moves the unbound COMMISSION row of a reversed period to the next month, so R2 would not re-bind it (S2.2 would then fail in production timing). S2.7 asserts it. Not asserted (controller to rule — R3 says "wherever a period's live run is looked up"): `requestAdjustment` H0.2 closed check (:139), `requestCommissionAdjustment` closed check (:1251), `decideAdjustment` runs set (:209), `moveStrandedAdjustment` runs set (:1188), `moveCommissionAdjustmentPeriod` closed check (:1390-1392) still treat a REVERSED run as "taken".
- **OQ-5 refusal audit name + duplicate action audit.** "auditRefusal-style rows like H0.1 (`hr.payroll.reverse` with `refused.code`)" is ambiguous (H0.1 uses `*.refused`). **Default: action `hr.payroll.reverse` or `hr.payroll.reverse.refused`, with a string `code` anywhere in before/after, actorId = actor** (S5.5); the success row = `hr.payroll.reverse` without a code (S1.4). Note: `reverseRunAction` (`payroll-actions.ts:182-189`, action at :185) already writes its own `hr.payroll.reverse` row {ok, note, reason} — with the new service audit a UI reverse writes two rows of the same action; the builder should drop or rename the action-level one (not tested: the oracle calls the service).
- **OQ-6 `adjustmentsByIds` signature.** Assumed `adjustmentsByIds(ctx: {tenantId, systemId}, ids: string[]) → {id, crmCommissionId}[]` (payroll.ts convention, like `adjustmentsOfRun(ctx, runId)`); rows with a null `crmCommissionId` may be returned or omitted (X1.3).
- **OQ-7 `qc-hr-h0.1` S4.2 will go RED.** It freezes `prisma/schema/payroll.prisma` sha256 (`7f9ab537…`); R1 must change that file, while §5 requires `qc-hr-h0.1` identical. The controller needs an ORACLE-EDIT of `qc-hr-h0.1` S4.2 (new schema hash after H0.6) or must list it as a known, intended diff.
- **OQ-8 `reverseEntry` failure text.** The brief gives no text for "reversal of the JV failed". S5.4 only asserts a Thai note that does not contain the thrown message ("ไม่พบรายการบัญชีที่จะกลับ"). Failure injected by pointing `journalEntryId` at a missing entry (restored afterwards).
- **OQ-9 S7 default.** Implemented the controller default: ACCOUNT system deleted after the JV ⇒ `reverseEntry` skipped, run REVERSED, adjustments unbound, event emitted, audit `jvReversed:false`, the old JV stays POSTED.
- Also noted: brief §1 claim verified — nothing in `src/**` or `scripts/**` uses `HrPayrollRun`'s compound key (`systemId_periodKey` only at `gl.ts:1668`, an account model).

## 10. Debt / not done
| item | reason | closes in |
|---|---|---|
| full `pnpm typecheck` | both writer runs hit the timeout under load (gate lock) — file-only tsc clean | controller |
| green side never observed | the H0.6 code does not exist on the base; green-path logic is type-checked only | builder run |
| viewer matrix (COMMON C.2) | H0.6 adds no surface (R8: no UI); the only output change is the event payload + audits (X8.1) | — |

## 11. QC4 restored / temp data left
- `finally` sweeps every table with a `tenantId` column for both temp tenants (4 passes), then the tenants; Z1 counts rows + audit (by tenant and by the oracle's actor id) + outbox; the run prints `RESIDUE tenants=<n> …`.
- worker processes are the oracle's own children (END on stdin, SIGKILL only after 60 s if still alive).
- **temp data left:** none — both forced runs printed `RESIDUE tenants=0 rows=0 audit=0 outbox=0` (Z1 green)
