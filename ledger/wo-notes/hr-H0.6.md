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

## PAUSE STOP (owner, 8 Oct ~22:00Z) — next: controller rules on ORACLE-EDIT S7.2 (below), then oracle forced ×1 more + unforced ×1, then the regression block (§ "pending"), then typecheck (both builder runs were lost to the gate lock / the pause)

Builder: Claude Opus 5.5 · branch `wip/pos-hr-h0.6` · worktree `/root/projects/shark-hr` · commits `188c9204` (step 1) · step 2 (HR) · step 3 (CRM) · this notes commit.

### Done per R-item (file:line on the branch head)
- **R1 schema + migration** — `prisma/schema/payroll.prisma:83-99` (`reversedAt DateTime?` · `reversedById String?` · `@@index([systemId, periodKey])` · `@@unique` removed, comment points at the raw partial unique) · `prisma/migrations/20261202000000_hr_payroll_run_live_unique/migration.sql` (ADD COLUMN ×2 · DROP INDEX `HrPayrollRun_systemId_periodKey_key` · CREATE UNIQUE INDEX `…_live_key` WHERE `"status" <> 'REVERSED'` · CREATE INDEX `…_idx`). Offline `prisma migrate diff --from-schema <base> --to-schema prisma/schema` = the same SQL minus the partial unique (expected). QC4 `migrate status` before: only pending = this folder; QC4 has 13 folders this branch lacks (12 POS `20261120…–20261129…` + H0.5 `20261201000000_hr_pin_hash`) — expected. `migrate deploy` via `qc4.sh` + gate lock → "All migrations have been successfully applied." exit 0. `prisma generate` (own node_modules) done.
  - **Prod order (corrected in r2, reviewer R1): MIGRATE FIRST, then code** — the Vercel prod build already runs `migrate deploy` before `next build`. The new client reads/writes `reversedAt`/`reversedById` (`listRuns`, `payslipData`, `approveRun`, the `reverseRun` UPDATE), so code-first = payroll page 500 + every reverse TX_FAILED. The migration is safe for old code (nullable columns; the old dup check never inserts a second run per period). **Read-only pre-check first (R2):** `SELECT r."id", r."periodKey", count(a."id") FROM "HrPayrollRun" r JOIN "HrPayAdjustment" a ON a."runId"=r."id" WHERE r."status"='REVERSED' GROUP BY 1,2;` — 0 rows = nothing to do; rows = owner decides (one-off backfill: unbind + emit `hr.payroll.reversed#<id>`, or document), because those pre-H0.6 reversed periods become open and a new run would silently skip their still-bound rows. The constraint swap runs in one Prisma transaction (DROP + CREATE together; `CREATE UNIQUE INDEX` non-concurrent ⇒ short ACCESS EXCLUSIVE/SHARE lock on `HrPayrollRun`, a small table). Run it while nobody is creating a payroll run: check `SELECT count(*) FROM "HrPayrollRun" WHERE "status"='DRAFT' AND "createdAt" > now() - interval '5 minutes'` = 0 / do it outside pay-day hours; a concurrent `createPayrollRun` simply waits on the table lock (no failure mode — the advisory lock + live dup check still hold).
- **R2 reverseRun** — `src/lib/modules/hr/payroll.ts:1041-1121` (signature `reverseRun(ctx, runId, reason?, actor?: PayrollActor)` · pre-read run + ACCOUNT system · inline tx: `lockRunPeriod` :1057 → `lockRunRow` (FOR UPDATE) → guards NOT_FOUND / ALREADY_REVERSED / NO_JV (today's text, OQ-1) / BAD_STATUS → guarded raw `UPDATE … status IN (APPROVED,PAID) AND journalEntryId IS NOT NULL` :1064 (count = 1) setting REVERSED + `reversedAt` (UTC) + `reversedById` + note → `reverseEntry({tenantId, systemId: acct}, jv, why, tx)` :1074 (no live ACCOUNT ⇒ skip, OQ-9) → `SELECT id … FOR UPDATE` + `UPDATE "HrPayAdjustment" SET runId = NULL` :1086 (count check) → `emitOutbox hr.payroll.reversed#<runId>` {runId, periodKey, adjustmentIds} :1089 → after commit audit `hr.payroll.reverse` :1116 {status, runId, periodKey, adjustmentCount, journalEntryId, reversalEntryId, jvReversed}). Helpers + fixed texts + `reverseRefused` (audit `hr.payroll.reverse.refused` {runId, code}) + `JvReverseFailed` (OQ-8: tx rolls back, text "กลับรายการบัญชีไม่สำเร็จ — รอบจ่ายยังไม่ถูกกลับ", `logOps WARN hr-payroll` ids + error name/code only): `payroll.ts:1525-1563`.
  - 🔴 **design note for the reviewer:** `tenantDb`'s query extension also applies inside `$transaction` (Prisma 7 `_createItxClient` keeps `_extensions`), and `AccountJournalEntry` is system-scoped — passing an HR-scoped tx to `reverseEntry` would filter the JV by the HR systemId and throw "ไม่พบรายการบัญชีที่จะกลับ". So with an ACCOUNT system the tx is opened on `tenantDb({tenantId, systemId: acct.id})`, without one on `tenantDb(ctx)`; every HR row inside the tx is read/written with raw SQL that binds the HR tenantId + systemId explicitly (lock helpers were already raw). The S8.6 static regex matches the `tenantDb(ctx).$transaction(` branch.
  - `payroll-actions.ts:178-185` `reverseRunAction` passes `{userId, isOwner}`; the action-level audit is removed (OQ-5 ⇒ one row per UI reverse). **Who can reverse: unchanged** (`hr.payroll.approve` + `canViewPayroll`).
- **R3 period freed / OQ-4** — `LIVE_RUN_WHERE` / `liveRunWhere()` `payroll.ts:32-35`, applied to every period→run lookup on `hrPayrollRun` (grep of `src/**`: no lookup outside payroll.ts): requestAdjustment :148 · decideAdjustment :218 + :224 · createPayrollRun dup :593 (text unchanged) · strandedAdjustments :1216 · moveStrandedAdjustment :1248 + :1253 · requestCommissionAdjustment :1311 · payrollRunPeriods :1348 · moveCommissionAdjustmentPeriod :1452-1453 · strandedCommissionAdjustments :1487. Lookups by run id (cancelAdjustment :277, delete/recompute/approve/markPaid/listRuns/payslip/adjustmentsOfRun) untouched.
- **R4 CRM seam** — `adjustmentsByIds(ctx, ids)` `payroll.ts:1570-1597` → `{id, runId, runStatus, crmCommissionId, status}` (chunked 500, tenantDb-scoped; `runStatus` added beyond OQ-6 for the replay guard) + re-export `hr/index.ts:40-44` (append-only, marked). `crm/commissions.ts:2120-2168` `onPayrollReversed` (marked append-only block): run must be REVERSED (`adjustmentsOfRun` status) · pair rule `{id: crmCommissionId, hrPayAdjustmentId}` · `reversedOfId: null` · `updateManyAndReturn` per 500 ⇒ one `crm.commission.unpaid` audit per changed row, actor null · returns `{unpaid}`. Bridge `crm-bridges/commissions.ts:74-82`. Consumer `outbox-consumers.ts:1208` (one marked line; `"onPayrollReversed" as never` because the name union at :556 is CRM-owned and the rule is one line). Webhook label `webhooks/labels.ts:89`.
  - 🔴 **OQ-3 deviation (decision for the controller):** the ruling "un-pay only adjustments with `runId IS NULL`" contradicts the oracle: S2.2/S4.2 create R2/R2b (binding the adjustments to a DRAFT run) **before** the reversed event is delivered (S3.1, S4.3 expect PAID→APPROVED). Implemented guard = skip adjustments **bound to a PAID run** (ids-only WARN `crm`), un-pay when unbound or bound to a DRAFT/APPROVED run (that run's `hr.payroll.paid` re-pays it). X9.2 (late replay after R2 PAID ⇒ nothing changes) passes through this guard, not a time window. A literal `runId IS NULL` guard would also leave C1 PAID forever if R2 (DRAFT) is then deleted.
- **R5 clawback** — untouched by code (status filter); S4.1–S4.3 green: C2r/C3r stay REVERSED, D3 (DEDUCTION bound to R1b) unbound and re-bound by R2b, C2 PAID→APPROVED→PAID, money nets to 0 (OQ-2 as ruled).
- **R7** payload/audits ids + counts only (X8.1 green).

### ORACLE-EDITs
- **OQ-7 applied (pre-approved):** `scripts/qc-hr-h0.1.mts:53` `SCHEMA_SHA` `7f9ab537951e8b58ad127ad9fed3014ae0ea013ee2cea35bc226533295f5f8a7` → `2636c177261f57c1a102fe6d09c6819e9a2fc1aabc649a10cae6a8ef2d361302` (commit 188c9204). Not yet re-run (regression pending).
- **REQUEST — `qc-hr-h0.6` S7.2 (harness bug, cannot pass for any code):** line 1010 `((await adjRows([a72]))[0]?.runId ?? "x") === null` is always false (`null ?? "x"` = `"x"`). Hunk: `((await adjRows([a72]))[0]?.runId ?? "x") === null` → `(await adjRows([a72]))[0]?.runId === null`. Every other S7.2 value is as expected (actual: `OK … status=REVERSED bound=0 events=1 audits=1 jvReversed=false entry=POSTED reversals=0`).
- **EXPECTED REDs needing controller hash edits (not edited, per rules):** `qc-hr-h0.1` **S4.3** (sha of the whole CRM C3.3 block of payroll.ts — R3/OQ-4 must change `requestCommissionAdjustment` / `payrollRunPeriods` / `moveCommissionAdjustmentPeriod` / `strandedCommissionAdjustments`) and `qc-hr-h0.2` **S5.3** (sha of `strandedCommissionAdjustments` body — S2.7 of this oracle requires the live filter there). New values: run `node_modules/.bin/tsx scripts/qc-hr-h0.2.mts --hashes` and sha256 of the `seg(…"// CRM C3.3 ▸ ทางเข้าของคอมมิชชัน CRM", "// ◂ CRM C3.3")` on the head. markPaid block + computeItem + payroll-rules.ts unchanged (S8.4 green).

### Runs completed (final lines + exit codes)
- `qc-hr-h0.6` forced run 1 (head = step 3): `===== qc-hr-h0.6 ===== passed 46/47 (QC_FORCE)` · failed `["H0.6-S7.2"]` (harness bug above) · `RESIDUE tenants=0 rows=0 audit=0 outbox=0` · exit 1 → `ledger/wo-notes/hr-H0.6-green.txt`. X6.1–X6.4 + S6.5 green under load.
- offline replica of the oracle's static block (S5.6 · S8.1–S8.6) → all OK.
- `fitness.mts` with env (`qc4.sh`): `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` · `JSON_SUMMARY {"total":42,"passed":42,"findings":[]}` exit 0 · without env (`env -u DATABASE_URL -u DIRECT_URL`): same, exit 0. Pre-commit fitness passed on all three commits.
- typecheck run 1: exit 1 with **no output** = `flock -w 3600` on `/tmp/shark-gate.lock` timed out (tsc never started). Run 2: stopped by the owner pause while waiting on the lock (tsc never started). ⇒ **typecheck NOT done.**
- oracle forced run 2: stopped by the pause while still waiting on the QC4 gate lock (never connected — nothing written).

### Pending (next session, in this order)
1. Controller rules on the S7.2 ORACLE-EDIT and the two hash edits (h0.1 S4.3 · h0.2 S5.3).
2. `qc-hr-h0.6` forced ×1 more + unforced ×1 (prerequisites now present ⇒ unforced runs everything).
3. Regression: `qc-payroll-reverse` · `qc-crm-c3.3` · `qc-hr-h0.1` · `qc-hr-h0.2` · `qc-hr-payadjust` · `qc-payroll` · `qc-hf-hr-privacy` · `qc-approval` · `qc-approval-wiring` · `qc-account-cpa` · `seed-hr-qc` · `scripts/fitness-hr.mts` both modes.
4. Typecheck (COMMON §A.9).
5. Builder notes finish (this section is the checkpoint).

### Temp data / processes
- QC4: only the migration (intended, shared). Oracle run 1 residue 0. No temp scripts left in `scripts/`.
- Processes: my two `iso-*` units in `/root/projects/shark-hr` (oracle run 2 + typecheck run 2, both still waiting on locks) were stopped with `systemctl stop`; nothing of mine is running.

## RESUME 22 Oct (builder, branch `wip/pos-hr-h0.6`, from 1083a96f)

### Done
- Controller rulings applied: (a) S7.2 ORACLE-EDIT · (b) replay guard "skip adjustments bound to a PAID run" accepted as is · (c) two hash ORACLE-EDITs · (d) consumer line `"onPayrollReversed" as never` left for the reviewer. Commit `ae397e24` (pre-commit fitness passed, no `--no-verify`).
- ORACLE-EDITs (only these three hunks):
  - `scripts/qc-hr-h0.6.mts:1010` S7.2: `((await adjRows([a72]))[0]?.runId ?? "x") === null` → `(await adjRows([a72]))[0]?.runId === null`
  - `scripts/qc-hr-h0.1.mts:55` S4.3 `CRM_BLOCK_SHA` `fcc215391da90dccc285f4f8fdcca41568a1a722c1273a353136d7af5be774b4` → `33ec8e46af7dd084ac1b1460167736a662bcc80bddc97db6ca1a22fb4c403869` (markPaid block hash `893a9e4e…` unchanged = still correct)
  - `scripts/qc-hr-h0.2.mts:128` S5.3 `BASE_HASH.stranded` `6c6332f004f79ab22c42ebfd28492bfbd79c7e502fd51de56dda198fa64a7698` → `bf3c0b6749e36f8dda0c42a0d28fcc495276a96e7d66dfec9442ca71d8ffacf6` (signature `SIG_STRANDED` unchanged, still matches)
- No product code changed in this session.

### Runs completed (final lines + exit codes) — all via `iso.sh qc4.sh with-gate-lock.sh`, one at a time
| suite | mode | result | failed | residue | exit |
|---|---|---|---|---|---|
| qc-hr-h0.6 | forced #1 | 47/47 | – | `RESIDUE tenants=0 rows=0 audit=0 outbox=0` | 0 |
| qc-hr-h0.6 | forced #2 (→ `hr-H0.6-green.txt`) | 47/47 | – | same, 0 | 0 |
| qc-hr-h0.6 | unforced | 47/47 (not skipped) | – | same, 0 | 0 |
| qc-payroll-reverse | forced | 14/14 | – | – | 0 |
| qc-crm-c3.3 | forced | 90/90 | – | – | 0 |
| qc-hr-h0.1 | forced | **66/67** | **H0.1-X6.6** (see below) | Z1 green | 1 |
| qc-hr-h0.2 | forced | 58/58 | – | – | 0 |
| qc-hr-payadjust | forced | 27/27 | – | – | 0 |
| qc-payroll | forced | 19/19 | – | – | 0 |
| qc-hf-hr-privacy | forced | 194/194 | – | – | 0 |
| qc-approval | forced | 16/16 | – | – | 0 |
| qc-approval-wiring | forced | 7/7 | – | – | 0 |
| qc-account-cpa | forced | 107/107 | – | – | 0 |
| seed-hr-qc | run 1 | 22/23 | O1 (see below) | – | 1 |
| fitness.mts | env (qc4) / no env | 42/42 · 42/42 | – | – | 0 · 0 |
| fitness-hr.mts | env (qc4) / no env | 5/5 · 5/5 | – | – | 0 · 0 |
| `pnpm typecheck` (§A.9, heap 8192 / ISO_MEM 10000M, run 1 of 2) | – | `tsc --noEmit` 0 errors, 213 s | – | – | 0 |

- **H0.1-X6.6 — new red, caused by the H0.6 contract, ORACLE-EDIT REQUEST (not fixed in code).** `qc-hr-h0.1` reverses `runA` at line 521 (S1.6) and its global invariant X6.6 (lines 887-908) then requires, for *every* run including REVERSED ones, "item add/deduct = Σ adjustments bound to that run". H0.6 R2.5 (unbind on reverse, `qc-hr-h0.6` S1.3) + R2/Q1 (items kept, S1.6) make this impossible for a REVERSED run: actual `item 4znccb/o39avx add 150000/0 · item 4znccb/0yfs73 ded 50000/0` = the reversed runA with a1/a2 unbound. No code change can satisfy both oracles. Green on the base 103fde95 (= 5fe98f44 code). Requested hunk (line 888): `where: { tenantId: T }` → `where: { tenantId: T, status: { not: "REVERSED" } }` for `allRuns` — but then `dangling` would flag nothing new (reversed runs have no bound rows after H0.6), so the minimal alternative is: keep `allRuns` for `runIds`/`dangling`, and skip the per-item sum loop for `r.status === "REVERSED"` (select `status` too). Controller to rule.
- **seed-hr-qc O1** — "other tenants unchanged" counts `posSale` across all non-seed tenants: before 534 → after 565 while POS suites (`qc-pos-p2.9b`, `qc-hf-tx`, `qc-subscription-money` from `shark-pos*`) were writing QC4 concurrently. Not HR code (the seed touches only `qc-hr-v2`; tenant/hrEmployee/hrPayrollRun/customer counts unchanged). Re-run alone after POS QC4 units drained: see below.
- **seed-hr-qc re-run** (alone, 04:15Z, after waiting up to 60 min for POS QC4 units to drain): **23/23**, findings [] , exit 0 ⇒ O1 in run 1 was the concurrent POS writes, not a red.

### Debts to log at merge
| item | status | owner |
|---|---|---|
| `qc-hr-h0.1` X6.6 vs H0.6 R2.5/Q1 | ORACLE-EDIT requested (above); red until ruled | controller |
| consumer line `crmCommissionBridge("onPayrollReversed" as never)` (`outbox-consumers.ts:1208`) | tolerated by controller ruling (d) | reviewer |
| `seed-hr-qc` O1 counts `posSale` across all tenants ⇒ flaky while POS lanes write QC4 | pre-existing oracle design; re-run alone is green | HR RUN backlog |
| prod order for migration `20261202000000_hr_payroll_run_live_unique` | **migrate first**, then code (r2 correction, reviewer R1) · run the R2 read-only pre-check first · outside pay-day hours (see PAUSE STOP §R1) | merge/deploy |
| typecheck | done (run 1 of 2, exit 0) | – |

### Temp data / processes
- QC4: no residue (every oracle run `RESIDUE tenants=0 rows=0 audit=0 outbox=0`; h0.1 Z1 green; seed re-creates only `qc-hr-v2`).
- Outputs kept outside the repo (scratch dir); nothing added to `scripts/`.
- Processes: none of mine running (`systemctl list-units 'iso-*'` shows only `shark-pos*` units). No POS unit or `/tmp/shark-gate-pos.lock` touched.
- Owner's caution (22 Oct 02:5xZ) followed: DB suites one at a time; typecheck started only after `free -g` avail ≥ 11 GB and no build/tsc unit; seed run alone.

### ORACLE-EDIT `qc-hr-h0.1` X6.6 (ruled by controller, 22 Oct) — commit `0b0a3423`
- **Old semantics:** for every run of the tenant (any status): Σ items = run totals · each item's add/deduct = Σ adjustments bound to that run · no bound row without an item · no dangling runId. Written before H0.6 — assumed adjustments stay bound for life.
- **New semantics:** same, except the per-item add/deduct = Σ bound check is skipped for `status === "REVERSED"` runs (items are a frozen snapshot, H0.6 R2/Q1), and instead a REVERSED run must have **0** rows still bound (H0.6 S1.3 restated tenant-wide). Σ items = totals, orphan and dangling checks still apply to every run. Hunk: `allRuns` select + `status`, `if (r.status !== "REVERSED") { …per-item loop… }`, one `g.push` for "still bound after reverse".
- Runs after the edit (one at a time, same wrapper): `qc-hr-h0.1` forced → `===== qc-hr-h0.1 ===== passed 67/67 (QC_FORCE)` exit 0 (Z1 residue green) · `qc-hr-h0.6` forced → 47/47, `RESIDUE tenants=0 rows=0 audit=0 outbox=0`, exit 0. Debt "h0.1 X6.6" above is closed.

## r2 (reviewer) — 22 Oct · review `ledger/wo-notes/hr-H0.6-review.md` (ACCEPT WITH NOTES)

### Step 0 — new base
- `git merge origin/session/hr` (d350c26c, contains H0.5 b640e36c) → merge commit `51ac6a5e`. One conflict, `src/lib/modules/hr/index.ts` (both append at EOF): kept the H0.5 block first, then the H0.6 block, and added the missing closing marker `// ◂ HR H0.6` (R7). Every other file merged clean. `bash scripts/iso.sh pnpm exec prisma generate` done (own `node_modules`).
- `QC_H06_BASE` for S8.5 = `d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7` (merge-base with `origin/session/hr`).

### Rulings applied (commits `4e4c085e`, `e6e9189c`)
- **R1 runbook = migrate first:** `migration.sql:4-5` comment + PAUSE STOP §R1 "Prod order" + the debt row corrected.
- **R2 pre-check:** the read-only SQL is in PAUSE STOP §R1 (above). The migration comment only points at it. A first version had the SQL in the migration comment, and qc-crm-c3.3 S0.4 flagged it as a CRM migration: its table-name scan matches the literal `"HrPayAdjustment"`. I moved the SQL out (`e6e9189c`), and c3.3 is 90/90 again. Info: QC4 applied this migration before the comment edits, so its `_prisma_migrations` checksum differs from the file (comments only). `migrate deploy` does not re-check applied migrations; prod has not applied it yet.
- **R3 money race (`crm/commissions.ts` `onPayrollReversed`, inside the H0.6 block):** the unpaid loop now also returns `hrPayAdjustmentId`. Afterwards, `adjustmentsByIds` is re-read for the pairs that were just unpaid. Any row now bound to a run with `runStatus === "PAID"` goes back APPROVED→PAID through a guarded `updateManyAndReturn` (same pair rule, `reversedOfId: null`). Each changed row gets one `crm.commission.repaid` audit `{before APPROVED, after PAID, via PAYROLL_PAID_DURING_REVERSE, runId}`; this is a distinct action, as with `.unpaid`/`.topup`, so the existing `.unpaid` counts are unaffected. The return value is `{unpaid: unpaid − repaid}`. A Thai comment explains the interleaving. Whichever of `onPayrollPaid(R2)` and this re-check lands last, the end state is the same. This path is not exercised by the h0.6 oracle (X9.2 covers a late event only), so the hunter probes it.
- **R4:** `reverseEntry` returning `{skipped}` while an ACCOUNT system exists now gives its own fixed text, `REVERSE_OK_JV_SKIPPED`. `jvSkipped` (boolean) is added to the outcome and to the `hr.payroll.reverse` audit. The no-account text is unchanged.
- **R5 (debt):** the `crm.commission.unpaid`/`.repaid` audits are written after the committed update, outside any tx, per the house "audit after commit" pattern. If the process dies between the update and the audit, that audit row is lost.
- **R6:** fine. The free-text `reason` now lives only in `HrPayrollRun.note` and the JV memo, which is better for PDPA.
- **R7 stale comments fixed:** payroll.ts :144 / :590 / :1211 (live-run wording) · `crm-bridges/commissions.ts:3` ("5 receivers" + an onPayrollReversed bullet, marked `HR H0.6` so S8.5 holds) · `qc-hr-h0.1.mts:51` hash comment · `// ◂ HR H0.6` in hr/index.ts. **Not changed: payroll.ts :1310** "(ทุกสถานะ)" in `requestCommissionAdjustment`. It sits inside the CRM C3.3 block, which h0.1 S4.3 `CRM_BLOCK_SHA` hashes; changing it would need another ORACLE-EDIT. Left for the controller to bundle with a future hash update.
- **R9 (debt → H3.4):** the `data-testid`s in payroll-ui.tsx :282/:334/:339 are keyed by `periodKey` and can repeat now that a REVERSED run and a live run of the same period both show. Key them by run id in H3.4.
- **Item 4:** widened the name union at `outbox-consumers.ts:556` (`| "onPayrollReversed"`, marked) and dropped `as never` at the consumer line. These are exactly the reviewer's two marked lines.

### Runs (r2, one at a time, same wrapper)
| suite | result | failed | residue | exit |
|---|---|---|---|---|
| qc-hr-h0.6 forced ×2 + unforced (head 4e4c085e) | 47/47 ×3 | – | `RESIDUE tenants=0 rows=0 audit=0 outbox=0` ×3 | 0 |
| qc-hr-h0.6 forced (final head e6e9189c → `hr-H0.6-green.txt`) | 47/47 | – | 0 | 0 |
| qc-hr-h0.5 | 71/71 | – | `RESIDUE tenants=0` | 0 |
| qc-payroll-reverse | 14/14 | – | – | 0 |
| qc-crm-c3.3 | 89/90 → fixed → **90/90** | S0.4 (my migration comment, fixed in code) | – | 1 → 0 |
| qc-hr-h0.1 | 67/67 | – | Z1 green | 0 |
| qc-hr-h0.2 | 58/58 | – | – | 0 |
| qc-hr-payadjust | 27/27 | – | – | 0 |
| qc-payroll | 19/19 | – | – | 0 |
| qc-hf-hr-privacy | 194/194 | – | – | 0 |
| qc-approval / qc-approval-wiring | 16/16 · 7/7 | – | – | 0 · 0 |
| qc-account-cpa | 107/107 | – | – | 0 |
| fitness.mts env / no env | 42/42 · 42/42 | – | – | 0 · 0 |
| fitness-hr.mts env / no env | 5/5 · 5/5 | – | – | 0 · 0 |
| typecheck (gate: ≥11 GB, no build/tsc unit) | `tsc --noEmit` 0 errors, 203 s | – | – | 0 |
| seed-hr-qc (alone, ×2) | 22/23 ×2 | O1 only: run 1 hrEmployee of another tenant 50→51 · run 2 (08:19Z, after the 60-min wait cap with 2 POS QC4 units still active) posSale 519→525 — concurrent writes by other lanes; every `qc-hr-v2` check green; same flake as the 22 Oct morning run, which went 23/23 when QC4 was quiet | – | 1 · 1 |
| qc-hr-h0.3 | not run (controller: 34/36 pre-existing on the base, S5.1/S5.2 AI actor gate — out of scope) | – | – | – |

### Temp data / processes (r2)
- QC4: no residue (every h0.6 run `RESIDUE … 0`; h0.5 `RESIDUE tenants=0`; h0.1 Z1 green). Seed only re-creates `qc-hr-v2`.
- None of my processes or units are running. No POS unit and no `/tmp/shark-gate-pos.lock` was touched. Outputs are in the scratch dir, outside the repo.

## r3 oracle (S10/X10) — 22 Oct · oracle writer (Claude Opus 5.5) · head d838fccf

Encodes controller rulings R3.1–R3.3 (hunter findings F1a/F1b/F2/F3/F4, `hr-H0.6-hunt.md`). Additive only: 8 registry lines + one group `X10` in `scripts/qc-hr-h0.6.mts` (after S6). Own tenant `<slug>-r3` (ACCOUNT + CRM + 4 HR systems), swept by the existing cleanup. `QC_H06_BASE` / S8.5 semantics unchanged. Suite = 55 checks.

Forced orderings use the hunter's technique: a side transaction holds `SELECT … FOR UPDATE` on the `CrmCommission` row, and we poll `pg_blocking_pids` (followed transitively, so a waiter queued behind another waiter counts). Then the competing real calls run and the lock is released. Every wait means "the call settled **or** it is now blocked on the lock". So the same script drives the base, whose read-then-write handlers never wait on some steps, and a converging build, whose lock-then-read handlers wait on every step. Neither case relies on timing.

Run: forced ×1 on d838fccf (`QC_H06_BASE=d350c26c…`) → `ledger/wo-notes/hr-H0.6-red-r3.txt`: **51/55**, failed exactly X10.1 · X10.2 · S10.5 · S10.6. S0–S8 / X1 / X6 / X8 / X9 (47) all green. `RESIDUE tenants=0 rows=0 audit=0 outbox=0`. No crash, no group crash.

| id | rule | expected on base | actual on base (d838fccf) |
|---|---|---|---|
| X10.1 | R3.1 · F1a: `paid#R1` handler held on the row → `reverseRun(R1)` + `reversed#R1` → release ⇒ R1 REVERSED, adj unbound, C **APPROVED**, unpaid ≤ 1, repaid 0 | RED | **RED**: paid handler blocked · reversed handler settled at once (0 rows) · end `C=PAID adj.runId=null unpaid=0` |
| X10.2 | R3.1 · F1b: `reversed#R1` held → markPaid(R2) + `paid#R2` → second lock queued → release #1 (the base handler un-pays, re-reads R2 PAID, its re-pay write waits on lock #2) → `reverseRun(R2)` + `reversed#R2` → release ⇒ R2 REVERSED, C **APPROVED**, unpaid − repaid = 1, unpaid ≤ 2 | RED | **RED**: every step forced (`queued=true`, handlers blocked on lock #2, C@mid APPROVED, reversed#R2 settled with 0 rows) · end `C=PAID unpaid=1 repaid=1` |
| X10.3 | R3 order (hunter P1) ⇒ R2 PAID, C PAID, unpaid = repaid ≤ 1 · then reversed#R1, paid#R1, paid#R2 ×2 each ⇒ status + updatedAt + audit counts unchanged | GREEN | GREEN |
| X10.4 | 20 concurrent rounds, random 0–40 ms, alternating P9 shape and mirror shape ⇒ C = (bound run PAID ? PAID : APPROVED), unpaid ≤ 1, repaid ≤ 1 | GREEN (the mirror window is narrow) | GREEN 20/20 |
| S10.5 | R3.2 · F2: a legacy REVERSED run (status set in DB + JV reversed, OT 1,200 + COMMISSION 3,000 still bound) ⇒ `createPayrollRun` throws `PayrollInputError` with a Thai text that is not the dup text, has no id/name/amount, and is the same on 2 calls · 0 runs · 0 outbox · 0 audit | RED | **RED**: `create OK (run created, binds 0, totalAdd 0 vs legacy 420000)`, runs 1→2. The base-made DRAFT is then deleted with `deleteDraftRun`, so S10.7/S10.8 are judged on their own. |
| S10.6 | R3.3 · F3: own reversed event, `adjustmentIds` = [unbound own row, row bound to a PAID run, row bound to a legacy REVERSED run, row bound to a DRAFT run], all commissions PAID ⇒ only the unbound row → APPROVED (1 unpaid audit) · the other 3 untouched | RED | **RED**: PAID-run row skipped (OQ-3 guard), but the legacy-REVERSED-bound and DRAFT-bound commissions were un-paid (`unpaid=1` each) |
| S10.7 | R3.4 / review R2: the pre-check SQL (verbatim; only the trailing `;` dropped; judged on this tenant's runs) returns exactly [legacy run, n=2] · after the unbind it returns none | GREEN (control) | GREEN |
| S10.8 | after the unbind: `createPayrollRun(P)` ok · binds exactly the 2 rows · totalAdd = 420000 once = the legacy run's · 7 totals = the legacy run's · Σ items = totals · DRAFT | GREEN (control) | GREEN |

### What the builder must do (r3)
1. **R3.1, both handlers.** In `crm/commissions.ts` `onPayrollPaid` and `onPayrollReversed`, process each chunk in one transaction: `SELECT … FROM "CrmCommission" … FOR UPDATE` → **then** `adjustmentsByIds` → set PAID where the adjustment is bound to a PAID run (pair rule, `reversedOfId IS NULL`, and the H4 "employee has an item" rule of `adjustmentsOfRun`), APPROVED otherwise. Use guarded writes, so a row already in its target state is not written: X10.3 compares `updatedAt` across replays. Audit only the rows that changed. The R3 re-check / `changedPairs` (F4) goes away.
2. **R3.2.** In `createPayrollRun`, under the period advisory lock and before `buildRunRows`: if a REVERSED run of `(systemId, periodKey)` still has `HrPayAdjustment.runId` = that run, throw `PayrollInputError(<fixed Thai text>)`. The text is the builder's choice but must not be the dup text and must contain no id, name or amount. Write nothing, emit nothing, audit nothing.
3. **R3.3.** In `onPayrollReversed`, un-pay only rows with `runId = null`. Skip rows bound to any run (PAID, APPROVED, DRAFT, legacy REVERSED).

### Deviations / notes for the controller
- **X10.1 audit count.** The ruling says "exactly one unpaid audit". With lock-then-read handlers, the paid write never lands in this order, so the correct converging result is **0** unpaid audits. The base's 0 comes with C=PAID. Encoded as `unpaid ≤ 1, repaid = 0`, with C APPROVED as the deciding assertion.
- **X10.3 audit count.** The ruling says "one unpaid + one repaid". That is the base's read-then-write signature. A lock-then-read handler sees R2 PAID under the lock and changes nothing (0/0). Encoded as `unpaid = repaid ≤ 1`, which passes both and still pins the end state PAID.
- **X10.2 audits.** Encoded as `unpaid − repaid = 1, unpaid ≤ 2`: the last un-pay must be audited, and the trail must be consistent.
- **X10.4 is strengthened:** 10 P9-shape rounds plus 10 mirror-shape (F1a) rounds instead of 20 P9 rounds, judged by the general rule "C = bound run PAID ? PAID : APPROVED". Green on base this run. The mirror window is narrow, so a base run could rarely go red here. A correct build is always green.
- **S10.5 is split.** The refusal is S10.5. "After the unbind, create succeeds and binds them once" is the new **S10.8** (CRITICAL). It is a control, green on base, so the create path after a backfill stays pinned.
- **S10.6** adds the DRAFT-bound case (commission forced PAID in DB) to cover R3.3's "any run". Base un-pays it as well.
- **All four forced interleavings were deterministic** on base (`blocked`/`queued=true` in the log). Nothing had to be weakened.
- **⚠ S8.5 conflict, needs a ruling before the builder starts.** S8.5 requires `crm/commissions.ts` to be **append-only** vs base, with every hunk marked `HR H0.6`. `onPayrollPaid` (:1409) sits outside the H0.6 block. Rewriting it in place removes lines and turns S8.5 red. The builder can stay compliant by adding a single marked line at the top of `onPayrollPaid` that delegates to a new function inside the H0.6 block (e.g. `return onPayrollPaidConverging(input); // HR H0.6 r3 ▸ R3.1 ◂`). The old body then becomes dead code but no line is removed. Otherwise S8.5 needs an ORACLE-EDIT. Also check whether `qc-crm-c3.3` hashes or pins `onPayrollPaid`; I did not check this.
- `createPayrollRun` sits under the `CRM C3.3-fix` comment in `payroll.ts`. `qc-hr-h0.1` S4.3 hashes only the `// CRM C3.3 ▸ ทางเข้าของคอมมิชชัน CRM … ◂` and markPaid blocks, so the guard should not move those hashes. Still, run h0.1/h0.2 hashes in regression.

## r3 build — 22 Oct · builder · from 8480089f (r3 oracle) · rulings R3.1–R3.4 + the R3.3 global converging-rule ruling

### Commits
`9c65f49e` (wip: R3.1 + R3.2 + literal R3.3 → 49/55, conflict reported) · `101b2852` (global converging rule + ruled S10.6 ORACLE-EDIT) · `e8ce78a7` (delegating line behind `H06_R3_CONVERGING = true as boolean` so the dead old body keeps TS narrowing — typecheck run 1 had 3 TS2322 there) · this notes commit.

### Files → R-items
- **R3.1 converging handlers — `src/lib/modules/crm/commissions.ts`**
  - `onPayrollPaid` (:1409): ONE marked line `if (H06_R3_CONVERGING) return onPayrollPaidConverging({ tenantId, systemId, runId }); // HR H0.6 r3 ▸ … ◂` (:1415; the switch is a `boolean` const in the H0.6 block, always on). The old body stays as dead code, so the file is still append-only vs `d350c26c` (0 removed lines; S8.5 green). `qc-crm-c3.3` does not pin `onPayrollPaid` (behaviour only).
  - `onPayrollReversed` (:2129): checks that the run is REVERSED → candidate pairs from `adjustmentsByIds` → `convergeCommissions(…, "REVERSED_EVENT")`.
  - `onPayrollPaidConverging` (:2145): run PAID → candidate pairs = `adjustmentsOfRun` items (H4) → `convergeCommissions(…, "PAID_EVENT")`.
  - `convergeCommissions` (:2167), per chunk of 500, in ONE `tenantDb({tenantId}).$transaction` (maxWait 60 s · timeout 600 s):
    1. `SELECT … FROM "CrmCommission" … ORDER BY "id" FOR UPDATE` (tagged template; pair rule · `reversedOfId IS NULL` · APPROVED/PAID).
    2. `adjustmentsByIds(…, { tx })` on the same tx.
    3. Target (:2196): **PAID** iff bound to a PAID run AND the employee has an item in it. **APPROVED** iff unbound, or bound to a DRAFT/APPROVED run. **Skip** if bound to a REVERSED run (legacy) or to a PAID run without an item.
    4. Guarded raw UPDATE on the prior status, only for rows not already in their target state. Replays write nothing, so `updatedAt` and audits stay the same (X10.3).
    5. After commit: `crm.commission.unpaid` for PAID→APPROVED (via `PAYROLL_REVERSED` / `PAYROLL_PAID_RECHECK`) · `crm.commission.repaid` for APPROVED→PAID from the reversed handler. The paid handler's normal APPROVED→PAID writes no audit (unchanged behaviour).
  - The r2 `changedPairs` re-check (F4) is removed.
  - Import `tenantDb` (:36, marked).
- **R3.1 HR side — `src/lib/modules/hr/payroll.ts`**
  - `adjustmentsByIds(ctx, ids, opts?: { tx })` (:1581): one raw query that binds the HR tenantId + systemId on every table (the caller's tx may be scoped to another system). It returns `hasItem` (the H4 rule). `PayAdjustmentRef` gains `hasItem`.
  - Line 2: `Prisma` is now a value import (for `Prisma.join`), marked.
- **R3.2 create guard — `payroll.ts` :595-602** (`createPayrollRun`):
  - Runs under the period advisory lock, right after the dup check, before `buildRunRows`. If a REVERSED run of the same system + period still has bound `HrPayAdjustment` rows, it throws `PayrollInputError(LEGACY_REVERSED_BOUND_TH)` (:1521).
  - The text is fixed Thai, differs from the dup text, and carries no id, name or amount. Nothing is written, emitted or audited.
  - It sits outside the hashed blocks. Hashes after r3: CRM block `33ec8e46…` · markPaid `893a9e4e…` · h0.2 stranded `bf3c0b67…`, all unchanged.
- **R3.3 — superseded by the controller's global converging rule** (above). The first literal build ("skip anything bound") went 49/55: S3.1/S3.2/X9.1/S3.3/X9.2/S4.3 failed because the same-period DRAFT re-run R2 already binds C1 when `reversed#R1` arrives. Under the global rule a row bound to a later-deleted DRAFT was already APPROVED at event time, which closes the delete-draft hole.

### ORACLE-EDIT (ruled) — `scripts/qc-hr-h0.6.mts` S10.6
- **Old:** the event payload = [unbound own row, PAID-run row, legacy REVERSED-run row, DRAFT-run row] ⇒ only the unbound row → APPROVED; the 3 bound rows stay PAID, 0 audits.
- **New:** the unbound row AND the DRAFT-bound row → APPROVED (1 unpaid audit each; the DRAFT row stays bound). The PAID-run and legacy-REVERSED-run rows stay PAID with 0 audits.
- **Hunk:** `others` without the DRAFT row · `dr = stateOf(Cd, Ad)` asserted `APPROVED · un 1 · re 0 · runId ≠ null` · info / label / registry text. No other oracle change.

### R3.4 runbook / debts
- **Deploy gate (hard).** On prod, before `migrate deploy`, run the read-only pre-check (PAUSE STOP §R1): `SELECT r."id", r."periodKey", count(a."id") FROM "HrPayrollRun" r JOIN "HrPayAdjustment" a ON a."runId"=r."id" WHERE r."status"='REVERSED' GROUP BY 1,2;`
  - **0 rows** = go.
  - **Any row** = STOP: the owner decides first. Until then the R3.2 guard refuses a new run for those periods with a fixed Thai text.
- **Debt → separate WO:** a one-off for legacy REVERSED runs: unbind their rows and emit `hr.payroll.reversed#<id>` per run, reusing reverseRun's steps. Until then the converging handlers skip rows bound to REVERSED runs.
- **Debt:** `onPayrollPaid`'s old body is dead code behind the delegating line (kept for S8.5 append-only). Delete it when the CRM owner next edits that block.
- Earlier debts still stand: R5 audit after commit · R9 testids → H3.4 · payroll.ts :1310 stale comment inside the hashed CRM block.

### Runs (r3, head 101b2852, one at a time, same wrapper, `QC_H06_BASE=d350c26c…` for h0.6)
| suite | result | failed | residue | exit |
|---|---|---|---|---|
| qc-hr-h0.6 forced #1 / #2 (→ `hr-H0.6-green.txt`) / unforced | 55/55 ×3 | – | `RESIDUE tenants=0 rows=0 audit=0 outbox=0` ×3 | 0 |
| qc-crm-c3.3 | 90/90 | – | – | 0 |
| qc-payroll-reverse | 14/14 | – | – | 0 |
| qc-payroll | 19/19 | – | – | 0 |
| qc-hr-payadjust | 27/27 | – | – | 0 |
| qc-hr-h0.1 | 67/67 | – | Z1 green | 0 |
| qc-hr-h0.2 | 58/58 | – | – | 0 |
| qc-hr-h0.5 | 71/71 | – | `RESIDUE tenants=0` | 0 |
| qc-hf-hr-privacy | 194/194 | – | – | 0 |
| qc-approval / qc-approval-wiring | 16/16 · 7/7 | – | – | 0 · 0 |
| qc-account-cpa | 107/107 | – | – | 0 |
| seed-hr-qc (alone) | 23/23 | – | – | 0 |
| fitness.mts env / no env | 42/42 · 42/42 | – | – | 0 · 0 |
| fitness-hr.mts env / no env | 5/5 · 5/5 | – | – | 0 · 0 |
| typecheck run 1 (gate opened 09:58Z after a POS build) | 3 × TS2322 in the dead old `onPayrollPaid` body (narrowing lost after an unconditional `return`) | – | – | 2 |
| typecheck run 2 (head e8ce78a7) | `tsc --noEmit` 0 errors, 39 s | – | – | 0 |
| qc-hr-h0.6 forced on e8ce78a7 (→ `hr-H0.6-green.txt`) · qc-crm-c3.3 forced on e8ce78a7 | 55/55 · 90/90 | – | 0 | 0 · 0 |

### Temp data / processes (r3)
- QC4: no residue. No process or unit of mine is running. POS units and `/tmp/shark-gate-pos.lock` were not touched. `ledger/wo-notes/hr-H0.6-control1.txt` (untracked, not mine) was left alone.
