# WO H<x>.<y> — <title>

> RUN "HR V2" · worktree `/root/projects/shark-hr` (or `shark-hr-b`/`-c`, as the controller assigns) · branch `wip/pos-hr-<wo>` (oracle writer: `wip/pos-hr-<wo>-oracle`) cut from `session/hr` @<hash> · <date from `date -u`> · controller: <model> · builder: <agent/model>
> Contract: `HR-V2-MASTER-PLAN.md` §4 row H<x>.<y> (on `origin/session/pos` — read with `git show`, never check out) · brief `ledger/hr-briefs/hr-brief-H<x>.<y>.md` + `hr-brief-COMMON.md` (rules A–F) · design `ledger/DESIGN-HR-V2.md` §… · review `ledger/REVIEW-HR-V2-DESIGN-2026-10-01.md` (its rulings win) · mockups `ledger/design-hr/NN-*.body.html`
> Oracle: `scripts/qc-hr-h<x>.<y>.mts` (N checks · commit `test(hr): H<x>.<y>` <hash> · **edited after commit: no / yes (see §9 ORACLE-EDIT)**) · red run `ledger/wo-notes/hr-h<x>.<y>-red.txt` · green run `hr-h<x>.<y>-green.txt`
> DB: **QC4 only** (`wo-pos-qc4` · `ep-frosty-lab`) — every DB command: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → <ok>

## 0. Checkpoint (keep current — a restart continues from here)
- done: …
- next: …
- last command + its final summary line: …

## 1. Files touched
| file | new/edited | what | hot file? (COMMON §D marker `// HR <WO> ▸ … ◂`) |
|---|---|---|---|

## 2. Migration / seed / backfill (if any)
- migration: folder name (timestamp ≥ `20261201000000`) · additive only (no DROP · no NOT NULL without default · `ALTER TYPE … ADD VALUE` in its own file · partial unique = raw SQL) · `migrate diff` SQL read · applied to QC4 via `qc4.sh` · `_prisma_migrations` on QC4 checked for folders this branch lacks
- seed: `scripts/seed-hr-qc.mts` / `scripts/hr-qc-env.mts` (HQC) changes · run ×2 ⇒ identical `JSON_SUMMARY.counts` · `scripts/hr-expected.json` rewritten (never committed)
- backfill: script · `--dry-run` result · real run result · idempotency proof (second run = 0 changes)

## 3. Gates (16 = CRM-MASTER-PLAN §3 1–12 + HR-V2-MASTER-PLAN §2 13–16 · every gate needs evidence · a gate that cannot pass ⇒ §10 debt table)
| # | gate | pass? | evidence (paste the real line, not a description) |
|---|---|---|---|
| D1 | oracle written first by a separate agent and was RED (or SKIPPED) for the right reason | ☐ | commit hash + red summary line |
| D2 | oracle green when the **controller re-runs it** after `seed-hr-qc` | ☐ | `JSON_SUMMARY {...}` ×2 · residue 0 |
| D3 | X1–X12 covered wherever they apply (N-A = one-line reason) | ☐ | §4 table |
| D4 | regression: previous HR oracles + §5 block identical before/after | ☐ | §5 table |
| D5 | typecheck clean (gate lock, ≤ 2 runs) · `pnpm fitness` + `scripts/fitness-hr.mts` green with env (`qc4.sh`) and with `env -u DATABASE_URL -u DIRECT_URL` | ☐ | `FINDINGS:` / `JSON_SUMMARY` lines of all 5 commands |
| D6 | build passes — **CONTROLLER-RUN** (builders never build or serve) | ☐ | exit 0 + port up (controller) |
| D7 | screenshots for the §7 roles at 3 sizes · controller compares with the mockup · no overflow | ☐ | paths + `PARITY: pass / bounce — reason` |
| D8 | every pressable element has a `data-testid` + a row in `scripts/hr-ui-inventory.json` · `$debt` only shrinks | ☐ | inventory diff |
| D9 | reviewer (separate, read-only agent) reads the diff — no BLOCKER · hunter for money/privacy/PIN WOs | ☐ | report summary |
| D10 | docs: new op has a `test:` id · API docs not stale · new permission key has a Thai label in `permissions.ts` · new event registered | ☐ | F13.x result |
| D11 | notes complete on this template + debt table + QC4 restored (`seed-hr-qc` re-run = same counts) | ☐ | this file + seed `JSON_SUMMARY` |
| D12 | commits on `wip/pos-hr-<wo>` only, pushed · controller merges into `session/hr` (never `main`/`session/*`/`rc/*`/`hotfix/*`) · migration ⇒ prod `_prisma_migrations` row at deploy time | ☐ | hashes |
| D13 | **privacy matrix** green: every new surface × 6 viewers + other tenant (§6) — RSC props · server-action returns · CSV · outbox payloads · AI tool output | ☐ | check ids per cell |
| D14 | **payroll regression set** green and identical before/after: `qc-payroll` · `qc-payroll-reverse` · `qc-hr-payadjust` · `qc-crm-c3.3` · `qc-hf-hr-privacy` · `qc-account-cpa` | ☐ | §5 rows |
| D15 | **parity** with `design-hr/NN` at 1440 / 1024 / 390, Thai + English (UI WOs) · `hr.*` keys complete (F16.4) | ☐ | §7 table + F16.4 line |
| D16 | **every new event** has a consumer in `src/lib/outbox-consumers.ts` + exactly one automation/webhook label + an oracle that replays it twice | ☐ | check id + summary |

## 4. X-group checks (HR-V2-MASTER-PLAN §3 — all 12 rows, every WO)
| X | applies? | check ids / one-line N-A reason |
|---|---|---|
| X1 idempotency — double submit / replayed event = one row (clock · leave · OT · swap · commission · run create · posting) | ☐ yes / ☐ N-A | `H<x>.<y>-X1.1` … |
| X2 cross-tenant / cross-system / cross-branch — ids of another tenant, HR system or branch refused, nothing leaks (`tenantDb` filters the system; FKs do not) | ☐ yes / ☐ N-A | |
| X3 permissions — each action × role · self-decision refused (leave · OT · adjustment · swap · correction · run with own row, HQ17) | ☐ yes / ☐ N-A | |
| X4 money — satang identities (`net = gross + add − deduct − ssoEmployee − wht` · Σ items = run totals) · rounding by test vectors · no negative net · Dr = Cr | ☐ yes / ☐ N-A | |
| X5 reversal — reverse/cancel undoes every side effect (JV · adjustments unbound · CRM commission un-paid · leave balance txn · roster) | ☐ yes / ☐ N-A | |
| X6 race — 10 parallel lanes × 3 rounds on separate connections (double clock · double approve · recompute ∥ approve · create run ∥ adjust) | ☐ yes / ☐ N-A | |
| X7 time — Asia/Bangkok day boundaries · overnight shifts · month ends · leap day · oracles never hard-code "today" | ☐ yes / ☐ N-A | |
| X8 not connected — HR with no ACCOUNT / POS / Booking / CRM still works (no posting, no booking side effect) | ☐ yes / ☐ N-A | |
| X9 outbox — replay ×2 · first-step failure does not starve later consumers · drain to silence | ☐ yes / ☐ N-A | |
| X10 visual — parity at 3 sizes · no overflow · Thai · empty/error states | ☐ yes / ☐ N-A | |
| X11 PDPA — field-absence checks (RSC · actions · CSV · events · AI) + retention for GPS/photo (HQ27) | ☐ yes / ☐ N-A | |
| X12 no env — fitness/static checks run without `.env` | ☐ yes / ☐ N-A | |

## 5. Regression block (hr-brief-COMMON §E — paste final summary line + exit code; before = on the base, after = on the branch head)
Command per suite: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<suite>.mts`
| suite | when it is required | before (exit · summary) | after (exit · summary) | identical? |
|---|---|---|---|---|
| WO oracle ×2 (no residue) | always | | | |
| `qc-hf-hr-privacy` | always | | | |
| `qc-hr` · `qc-hr-attendance` · `qc-hr-roster` · `qc-hr-leave-booking` | always | | | |
| `qc-hr-payadjust` · `qc-payroll` · `qc-payroll-reverse` | always | | | |
| `qc-booking-hours-hr` | always | | | |
| `qc-crm-c3.3` | payroll WOs | | | |
| `qc-approval` · `qc-approval-wiring` | approval WOs | | | |
| `qc-ai-tools` · `qc-ai-proposals` | AI files | | | |
| `qc-account-cpa` | posting WOs | | | |
| `qc-nav-functions` | new pages | | | |
| previous HR oracles `qc-hr-h0.1` … `qc-hr-h<prev>` | always | | | |
| `pnpm fitness` + `scripts/fitness-hr.mts` — with env / `env -u DATABASE_URL -u DIRECT_URL` | always | | | |
| typecheck (COMMON §A.9) | always | | | |
- known pre-existing: `qc-ai-actions` 11/12 CRASH on QC4 (identical before/after is fine) · other pre-existing reds: …

## 6. Privacy matrix (gate D13 · one row per new/changed surface · cell = check id + result: `shown` / `absent` / `refused (identical bytes)`)
Viewers = `HQC.users` of `scripts/hr-qc-env.mts` + a second tenant built by the oracle.
| surface (page · action · CSV · event · AI tool) | field(s) | owner | payroll (`hr.payroll.read`) | manager (no payroll key) | staff with HR key | plain member | the employee themself (linked user) | other tenant |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
- refusal bytes for non-viewers identical (no salary oracle) — check id: …

## 7. Screenshots + parity (UI WOs · D7/D15 · CONTROLLER-RUN)
Command: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/visual-hr.mts <wo> --user <owner|manager|payroll|staff|kiosk|member> --base http://127.0.0.1:3226` (builder delivers `--dry`; register the WO's pages in `SPECS["<wo>"]`)
| page | mockup | user | 1440×900 | 1024×768 | 390×844 | overflow (3 sizes) | HTTP | console errors | differences seen (where) |
|---|---|---|---|---|---|---|---|---|---|
| | `design-hr/NN-*.body.html` | owner | path | path | path | no/no/no | 200 | 0 | |
| | | manager | | | | | | | |
| | | staff | | | | | | | |
- Thai + English rendered (F16.4 keys present in both)
- `PARITY: pass / bounce — <reason>`

## 8. Who gains / loses access (every WO that changes a guard, a key, a DTO or a page)
| who (role · key · linked employee) | gains | loses | why (brief ref) | check id |
|---|---|---|---|---|
| | | | | |

## 9. Disputes / technical rulings (with evidence)
- `ORACLE-EDIT <suite>-<check>`: hunk · reason (spec § / code file:line) — controller rules
- spec gap: … → decision … (how to roll back)
- decisions for the controller: …

## 10. Debt / not done
| item | reason | closes in |
|---|---|---|

## 11. QC4 restored / temp data left
- oracle `finally` deletes …; residue check result: …
- no `qc-visual-hr` session left · no chromium profile `/tmp/chr-hr-*` left · no ChatRateBucket rows of the oracle's tenants left
- **temp data left:** none / <exact list, by design>
