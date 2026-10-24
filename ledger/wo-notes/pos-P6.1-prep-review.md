# R1 review — P6.1 prep (runbook + verify-prod-pos + qc-pos-p6.1) · account A · 24 Oct 2026 00:06–00:16Z (`date -u`)

Branch `wip/pos-p6.1-prep` **603877ea** (base 23c85130), read on tree `/root/projects/shark-pos-p11` (detached, nothing edited). Product tip compared = controller `session/pos` **5e5b0675** (product ≈ 290a1cf0 + ledger; 325 commits since the base). Brief `ledger/pos-briefs/pos-prompt-accountA-P6.1-PREP-R.md`.
Read-only throughout: no build, serve, QC5, prod or DB write. Node ran only through `iso.sh` with ISO_MEM=3G. No `.env*` was opened. Crontab was read for **counts and paths only**; no line was printed.

## Verdict: **MERGEABLE-AFTER-FIXES**
The verify script is sound and really read-only, and the oracle reproduces. But the runbook **cannot be handed to the owner as it stands**:
- **F1**: its core order contradicts how this repo actually deploys.
- **F2–F6**: it misses the changes since 23c85130 and several unflagged behaviour changes at deploy.

Fix F1–F6 before the rehearsal (W31) or the PR body. F7–F12 go in the same fix round. F13–F16 are optional.

## Reproduced evidence
- Oracle on the branch: `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.1.mts` → **18/19**, failed = [P6.1-R1] (PR body, by design). Matches notes §7.
- Red-before: `… iso.sh env P61_REV=23c85130 pnpm exec tsx scripts/qc-pos-p6.1.mts` → **1/19**, only Z1 green. Matches notes §4.
- `--self-test` on QC4 (lane command, gate lock /tmp/shark-gate-pos.lock), 00:09:48–00:09:58Z → **FAIL 0 · WARN 4 (X1 S1 S6 S7) · 22 checks · posMigrations 37 · EXIT 0**. Counts drifted from the notes as expected: InvLocationStock 113 · OpsEvent ERROR 109 · pos_product 2555.
- Migrations: `git log 23c85130..HEAD -- prisma/migrations prisma/schema` = **empty**. `git diff --name-only origin/main...HEAD -- prisma/migrations` = **36 dirs** — still 36, all additive. No new crons (`minute-jobs.ts`, `api/cron/*` and `vercel.json` have no diff since base). No permission-key changes (`core/permissions.ts` has no diff).
- New env since base: **`POS_DEVICE_KEY`** only (`src/lib/env.ts:27`; `src/lib/modules/pos/device-cookie.ts:15,17,34-35,47`; min 32 characters).
- `git merge-tree HEAD 603877ea` → one content conflict, in `scripts/pos-gates.json`.

## Findings

### F1 — BLOCKER · the runbook ignores that merging to main auto-runs `prisma migrate deploy` on Vercel
**Evidence.**
- `vercel.json` has `"buildCommand": "bash scripts/vercel-build.sh"`; the same line is on origin/main.
- `scripts/vercel-build.sh:21-25` runs `pnpm exec prisma migrate deploy` and then `migrate status` whenever `VERCEL_ENV=production`, before the build. It was added after the 1 Sep chat outage (commit 8c9a2a68).
- `prisma.config.ts` makes migrate use Vercel's `DIRECT_URL`.

The runbook never mentions `vercel-build.sh` (grep shows 0 hits). Its §0:11 order "merge PR → migrate deploy → …", §4.2:161 "migrate first, then promote the new build" and §11 steps 1→7→8 assume the owner migrates by hand after the merge.

**What actually happens.** Pressing merge makes Vercel run all 36 migrations at merge time. That run has:
- no §3.4 pre-flight;
- no W33 counts or CONCURRENTLY pre-step;
- no Neon restore branch;
- no `lock_timeout` option.

Vercel then promotes automatically. If a migration fails, the build goes red and the old code stays (safe). But `_prisma_migrations` is then in P3009, which blocks **every** later production build, unrelated hotfixes included, until someone resolves it.

**Fix.** Rewrite §0, §4.1–4.3 and §11 around this:
1. ⛔ Set env on Vercel production **before the merge**: `POS_DEVICE_KEY` (F2), and `POS_CREDENTIALS_KEY` if it is not set yet.
2. ⛔ Inside the window, at the **exact PR head SHA** and from a clean checkout (F10), run in order: §3.4 pre-flight + counts → Neon restore branch → `prisma migrate deploy` from the VPS.
3. ⛔ Then merge. Vercel's migrate must print "No pending migrations", then the build runs and promotes.
4. State explicitly that migrating before the merge is safe because old main code runs on the additive schema (the rule in `vercel-build.sh:12-14`).
5. Add a failure branch: "Vercel build red at the migrate step ⇒ §4.3 from the VPS, then Redeploy".
6. Add an oracle line: the runbook must cite `scripts/vercel-build.sh` and the pre-merge migrate order.

### F2 — HIGH · `POS_DEVICE_KEY` (W40) is still a placeholder, and the env step comes after promote
**Evidence.**
- Runbook §6:221 says "กุญแจอุปกรณ์ … pending P5.2 fix round — ชื่อยังไม่กำหนด (CD-P61-P5)".
- §11:320 has env only for `POS_CREDENTIALS_KEY`, at step 10, *after* step 8 "promote".
- `POS-OWNER-PENDING.md` W40 says: 🔴 set it before deploy. If unset, browser pairing **and opening a shift from the shifts page** are refused (`device-cookie.ts:47` `DEVICE_KEY_UNSET`).
- Since base, the sale, refund, cash, shift and offline-sync paths take the device from the signed cookie only: c81988ad, b4c05ec9, 1ab99b10, and 14fd873c (snapshot route).

**Fix.**
- Replace the §6 row with: `POS_DEVICE_KEY` · `device-cookie.ts:15,17,35,47` · ≥ 32 characters (`openssl rand -hex 32`) · must differ from `POS_CREDENTIALS_KEY`, `CHAT_CREDENTIALS_KEY` and `SESSION_SECRET` · ⛔ owner, Vercel, **before the merge** (W40).
- Add a §9 rollout step: "after deploy, the manager presses 'จับคู่เบราว์เซอร์นี้' once on every register; a unit with ≥ 1 device then refuses cookie-less writes (409 DEVICE_NOT_PAIRED); rotating the key = re-pair every device; one cookie per browser".
- Add `POS_DEVICE_KEY` to `ENV_NAMES` in the verify script (`verify-prod-pos.mts:172-177`).
- Close CD-P61-P5.

### F3 — HIGH · the prod backfill commands pass no `DATABASE_URL`, so they silently use the run tree's `.env`
**Evidence.**
- Runbook §8:250 and :256 run `env … ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts …` with no URL.
- `scripts/pos-backfill-catalog.mts:44-51`: with `ALLOW_PROD_BACKFILL=1` it calls `process.loadEnvFile(process.env.BACKFILL_ENV_FILE ?? ".env")`. `iso.sh:7` cds to the repo root first.

So the target is whatever `/root/projects/shark-pos/.env` holds. That breaks the runbook's own "ไม่ใช่ .env" rule (§4.2:157) and P6 §8. If that `.env` points at a QC database, `isProdDbUrl` is false and the "prod" backfill quietly runs on QC.

**Fix.**
- Every §8 command gets `DATABASE_URL='<PROD_DIRECT_URL>' DIRECT_URL='<PROD_DIRECT_URL>' BACKFILL_ENV_FILE=/dev/null` after `iso.sh`.
- Add a "check the printed host label = prod" line.
- Extend oracle R2 so that every `ALLOW_PROD_BACKFILL=1` line must also carry `DATABASE_URL='<PROD_DIRECT_URL>'`.

### F4 — HIGH · "flags default off ⇒ prod behaviour unchanged at deploy" (§4.2:161) is false
These changes are **not** behind a per-shop flag. They take effect for every shop at deploy:
- **(a) Legacy restaurant doors close on any unit linked to an active POS system, whatever registerV2 says.**
  - `src/lib/modules/pos/legacy-door.ts:20-36`: the predicate is `AppSystemUnit type POS` + `AppSystem active`.
  - Guest routes return 409 and send guests to the new `/q/t/` door. Bill check, PromptPay confirm and table merge are refused.
  - P5.2 D11 (abbd7d1a) widened this after base: **15 legacy writers** in `src/lib/actions/restaurant.ts:28` (settings, kitchen pause, stations, categories, option groups, stock, items, zones, tables) now redirect `?err=POS_LINKED`.
  - Prod restaurant units that already share a unit with a POS v1 system change behaviour at deploy.
- **(b) Module deposits (booking, hotel, rental) become POS_DEPOSIT receipts.**
  - Commits 61453bf2, e3b5b815, 161ca81b.
  - Accounting changes: Cr 2110 liability instead of revenue, and receipts carry a real pay method.
  - Owner policy items W39 and W41 are still open.
- **(c) A general REST API key now gets 403 `pos_scope_required`** on POS AI tools and the sales skill (f87cc9c5, e4f14951). Prod integrators on a general key lose access.
- **(d) Credit-account writes and the tip ledger now require OWNER, or MANAGER with unitAccess "*" only** (549c0964).

**Fix.**
- Add a section "พฤติกรรมที่เปลี่ยนตอน deploy โดยไม่มีธง" listing (a)–(d) with file:line, each with an owner GO (⛔).
- Add a pre-merge read-only count to the verify script's new `--counts` mode (F5): restaurant units with an active POS link · open module deposits · active general-scope API keys.
- Reword §4.2:161.

### F5 — HIGH · ruling P1 (pre-create the 5 indexes with CONCURRENTLY) cannot be executed as written, and `--counts` does not exist
**Evidence: `--counts` is missing.**
- W33 (`POS-OWNER-PENDING.md`) and addendum 2 P1 both cite `verify-prod-pos.mts --counts`.
- The script accepts only `--list` and `--self-test`: `verify-prod-pos.mts:33-38` exits 2 on anything else.
- The runbook §3.2:128 still says "ตัดสิน… (CD-P61-P1)". It has no 100k threshold and no pre-create step.

**Evidence: pre-creation fails for 2 of the 5 indexes.**
- `PosSale_publicToken_key` is a plain `CREATE UNIQUE INDEX` (`20261129000000_pos_p111_online_receipt/migration.sql:56`) on a column added by a plain `ADD COLUMN` in the same file (`:10`).
- `PosSale_unit_offlineRef_key`: plain index at `20261217110000_pos_p34_offline/migration.sql:50`, plain `ADD COLUMN` at `:9`.
- So you cannot pre-create them: the column does not exist yet. If you pre-add the column too, the migration fails with 42P07 / 42701 → P3018 mid-file, in stmt mode, leaving partial state.

**Evidence: pre-creation works for the other 3, with extra steps.**
- `RestaurantOrder_posSaleId_key` and `_posOrderId_key` (`p26_kds/migration.sql:5-7`) and `GiftCard_storeCredit_owner_key` (`p29_tenders:27,30`) use IF NOT EXISTS for both the column and the index.
- For GiftCard the owner must also pre-create type `GiftCardKind` (`p29_tenders:21`, inside the DO) and add `kind` with the same DEFAULT, then build the partial unique index with the identical predicate.

**Fix.**
1. Add `--counts` to the verify script. It must be pre-migrate safe: every query in its own savepoint, missing POS tables tolerated. Output: `reltuples` + `count(*)` with `statement_timeout` for PosSale · PosSaleLine · PosPayment · RestaurantOrder · GiftCard · AccountDocument · MenuItem · RestaurantOrderItem · ShopProduct · ShopOrderLine · RestaurantTable · RestaurantSetting · InvItem · TableSession; registerV2 distribution; plus the F4 counts. Print a `JSON_SUMMARY`. Add a self-test case for it.
2. Runbook §3.2 gains a decision table:
   - PosSale ≤ threshold ⇒ accept the stmt-mode scan (write-blocking only for that one statement);
   - PosSale > threshold ⇒ the controller rules on editing p111/p34 **before the merge** (they are not on prod; only the QC4/QC5 checksums need `migrate resolve`);
   - RestaurantOrder/GiftCard > threshold ⇒ the exact pre-create SQL above, rehearsed on the branch.

### F6 — HIGH · `pos.*` minute jobs will not run after the merge: the VPS dispatcher runs from a stale checkout
**Evidence.**
- `crontab -l` has **3 lines with `crm-cron`, all under `/root/projects/shark-in-th`** (counted by path; no line printed).
- That worktree's local `main` is **43 commits behind origin/main**, last commit de0eafc7 on 8 Oct, with a clean status.
- `scripts/crm-cron.mts:72,86` runs `runMinuteJobs` from that checkout's own `src/lib/platform/minute-jobs.ts`. origin/main's copy has 0 `pos.` jobs.
- Runbook §7:239-242 only asks whether the crontab is installed (CD-P61-P6 / W34).

**Fix.**
- Add a §7 ⛔ step after the merge: fast-forward the dispatcher checkout (`git -C /root/projects/shark-in-th pull --ff-only` + `pnpm install --frozen-lockfile`, which runs `prisma generate` via postinstall).
- Then verify the next minute round lists `pos.staffCommission.payroll` and `pos.slip.purge` (OpsEvent or log).
- Record W34 as "crontab present (3 entries), checkout stale".

### F7 — MEDIUM · §4.3 step 5 wrongly says "every file is re-runnable"
**Evidence.** §4.3:169 claims "ทุกไฟล์รันซ้ำได้ (`IF NOT EXISTS` / `DO … EXCEPTION`)". In fact 19 stmt-mode files have plain `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN` or `CREATE INDEX`. Examples:
- `pos_p19_shift`: `CREATE TYPE "PosShiftStatus"` and `ALTER TABLE "PosSale" ADD COLUMN "shiftId"`;
- `p111:10,56` and `p34:9,50`.

**Fix.** Step 5 should say: "stmt-mode files are NOT re-runnable. Appendix-A rollback of the failed file (step 3) is mandatory before `resolve --rolled-back` and redeploy. Only DO files are atomic."

### F8 — MEDIUM · whole-system rollback by promoting the previous build (§9:281) is unsafe once V2 has written data
After the first V2 sale, the old main Prisma client meets:
- new enum values (`PosPayType` CARD / PLATFORM / GIFT_CARD / STORE_CREDIT / ON_ACCOUNT, `PosOrderPaymentState` …), and throws on read;
- refund/CN rows (`PosSale.docType`), which old reports count as sales;
- module deposits held as POS_DEPOSIT receipts (F4b), which old booking/hotel code cannot refund.

**Fix.** Say that promote-previous is valid only before the first V2 write. After that, rollback = flags off + forward fix. Add this to the PR body's rollback section.

### F9 — MEDIUM · addendum-2 rulings are not applied in the runbook
- P2: §3.3:132 still offers (ก)/(ข)/(ค), and the §4.2:158-159 commands lack `?options=-c%20lock_timeout%3D5s`. Add the option plus a rehearsal proof that Prisma 7.8 and the Neon proxy really apply it (e.g. a probe connection with the same URL running `SHOW lock_timeout`). Keep the role-level (ก) as the fallback.
- P5: placeholder (F2).
- P6: W34 step (F6).
- P7: row 1.4 (§1:25) is still present. Mark it dropped.
- W33: the 100k threshold is missing (F5).

### F10 — MEDIUM · prod commands run from the controller worktree
**Evidence.**
- §4.2, §4.3, §8 and §10 all use `env -C /root/projects/shark-pos`. That is `session/pos` plus uncommitted ledger work, not the PR head or merge SHA.
- `prisma.config.ts:5` loads that tree's `.env` if present.

**Fix.**
- Use a dedicated clean worktree at the exact SHA; check `git rev-parse HEAD`, a clean `git status -- prisma`, and `pnpm install --frozen-lockfile`.
- `prisma migrate status` must show the prod endpoint label in its "Datasource" line before `deploy` runs.

### F11 — MEDIUM · open owner items that ship with the merge are not in the §1 preconditions
- **W37**: inventory actions write POS catalogue rows on every branch without the row gate.
- **W38**: `updatePosStaffCommission` is still under the read key `hr.payroll.read` (`src/lib/modules/pos/settings-general.ts:608`, where the comment says "หรือผู้มี hr.payroll.read"). Both were only "accepted-pending-owner" (8d5312da).
- **W39 / W41**: deposit policy.
- **W19**: slip retention.

**Fix.** Add §1 rows 1.13+ with "answer or accept the default before the merge".

### F12 — MEDIUM · the oracle needs maintenance before or at the merge
- **Z1** turns red on the tip. `qc-pos-p6.1.mts:435` diffs `LANE_PIN(23c85130)..HEAD`, which after the merge includes the P5.x `src/` changes. Needs a lane view or a re-pin.
- **E1** (`:303`) *requires* the word "pending" next to P5.2, which forces stale text. Change it to require a `POS_DEVICE_KEY` row with W40 and ≥ 32.
- **G1**: registering the suite in `pos-gates.json` with R1 red by design turns full gates red until the PR body exists. It also conflicts with the tip (merge-tree). Register it together with the PR body, or add a controller known-red rule.
- New checks to add: F1 (vercel-build order) · F3 (URL on every prod backfill line) · verify `ENV_NAMES` ⊇ the E1 names.

### F13 — LOW
Verify `ENV_NAMES` lacks `POS_DEVICE_KEY` (`verify-prod-pos.mts:172-177`); fixed under F2.

### F14 — LOW · citation drift at the tip
- `src/lib/actions/pos.ts:484` → now `:536` (§1.3).
- `scripts/fitness-pos.mts:1052` no longer points at `SYSTEM_MARKER_ALLOWLIST` (§1.5).
- Oracle P1 only checks line count ≤ file length, so it cannot see content drift. Re-cite at the merge commit.

### F15 — LOW
The §5 `indisvalid` query (:202) returns only indexes that exist, so a missing index does not show up. Require "15 rows, all t", or rely on verify X1 = OK.

### F16 — LOW
When the rehearsal-branch role is added (P3), it must be a new role, not `prod`. `decideTarget` (`:82-88`) only applies `ALLOW_PROD_AUDIT` to role `prod`. Add a G2 case for it.

## B — verify-prod-pos.mts (read-only audit)
**DB calls.** Every DB call goes through `client.query`:
- `:284-287`: BEGIN, `SET TRANSACTION READ ONLY`, `SET LOCAL statement_timeout/lock_timeout`;
- `:273-278`: savepoints;
- `:264-266`: `q()`, which accepts SELECT/WITH/SHOW only and refuses `;`;
- `:472`: ROLLBACK in `finally`;
- `:296`: one write probe `CREATE TEMP TABLE`, only when `SELF && role === qc4`, inside a savepoint, and refused with 25006 (reproduced).

There is no prisma, no `$executeRaw` and no `loadEnvFile`. A data-modifying CTE would still be blocked by the READ ONLY transaction, and `SHOW transaction_read_only` is asserted at `:288-289`.

**Gate.** `decideTarget` (`:64-89`):
- allowlist by first-label prefix; rejects `PGHOST`, `?host=` and mixed `DIRECT_URL`;
- prod requires `ALLOW_PROD_AUDIT=1` and refuses `--self-test`;
- QC4 is allowed only with `--self-test`.

G2 covers 12 cases and N1 adds canaries.

**Secrets.** Only the host mark and env names are printed (`:477`). pg error text is truncated to 160 characters (at most a username, never a password).

**Gap.** There is no `--counts` mode for W33 (F5).

## D — CD-P61-P1…P10 (default safe, or owner needed)
| CD | default / ruling | safe? | owner row |
|---|---|---|---|
| P1 | pre-create CONCURRENTLY if > 100k | **not executable for p111/p34** (F5). Feasible for p26/p29 with extra SQL | **W33** (counts) + controller ruling on p111/p34 |
| P2 | `options=-c lock_timeout=5s` in the URL | unproven for Prisma 7.8 + Neon proxy; Vercel's auto-migrate path has no option at all (F1) | rehearsal proof; ⛔ owner if role-level fallback |
| P3 | same-day allowlist commit | safe (data only); must be a new role (F16) | — |
| P4 | schema-parity S card later | safe for the deploy itself. But `scripts/qc-migrate-status.mts:61` MS-2 (`migrate diff --exit-code`) will report drift once the hand indexes exist ⇒ the rehearsal's `qc:all` goes red, and a future `migrate dev` generates DROPs. **Land before the rehearsal** | — |
| P5 | `POS_DEVICE_KEY` | **owner action required before the merge** (F2) | **W40** |
| P6 | W34 crontab | crontab exists (3 entries, shark-in-th) but the checkout is 43 commits stale ⇒ not safe (F6) | **W34** + new step |
| P7 | drop the `qc-prisma.sh` item | safe: prod never uses it (`qc-prisma.sh:29-32`; POS uses `qc4.sh`) | — |
| P8 | builder card for the `backfillWebPrices` CLI + P1.9 data step | safe only while flags stay off. Blocks the first trial-shop flag-on (§8.4–8.5) | builder S card (no owner) |
| P9 | negative stock = WARN | safe | owner sees the report |
| P10 | brief corrections (12 tables · 5 ADD VALUE · host from `PROD_HOST_MARK`) | correct: verified `PROD_HOST_MARK` = the allowlist mark (`qc-env-guard.mjs:18`) | — |

## Runbook deltas since 23c85130 (things the runbook, inventory and verify script do not cover yet)
1. Migrations: **0 new** (still 36, additive 36/0). No new crons. No new permission keys.
2. **Env `POS_DEVICE_KEY`** (W40 · `env.ts:27` · `device-cookie.ts` · ≥ 32) must be set before the merge. Post-deploy: pair every register once.
3. **Device binding everywhere** (P5.2: c81988ad, b4c05ec9, 1ab99b10, 0de07d33, 14fd873c snapshot route, c27ea9cc canonical base64url). Units with devices refuse cookie-less writes. Manager override for shift close is audited (`pos.shift.close.override`).
4. **D11**: 15 legacy restaurant writers refuse POS-linked units (abbd7d1a), on top of the P2.14 legacy-door closure. This is unflagged (F4a).
5. **P5.1 module deposits** → POS_DEPOSIT receipts / CN refunds / forfeit on NO_SHOW (61453bf2 … 12ef86f4). This is an accounting change, unflagged (F4b), with W39/W41 open.
6. **REST/AI**: general key gets 403 `pos_scope_required` on POS tools (f87cc9c5) (F4c).
7. **Credit/tip** = OWNER or MANAGER "*" only (549c0964) — add to the role-review line in §9.
8. **P5.3**: InvItem barcode index confirmed as a P6.1 hand step (`pos-P5.3-oracle.md:146`, `catalog.ts:1337-1345` — already in the §5 list). The "P5.3 outputs" row stays pending until the P5.3 fix round.
9. Open owner items shipping with the merge: W37 · W38 · W39 · W41 · W19 (F11).
10. Addendum-2 rulings not yet applied (F9), plus the deploy mechanics that were already missing at the base (F1, F6, F10).
