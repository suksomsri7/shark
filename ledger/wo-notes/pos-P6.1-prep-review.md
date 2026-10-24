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

---

# Round 2 — P6.1 fix1 (`wip/pos-p6.1-fix1` 74f24f81) · account A · 24 Oct 2026 01:20–01:35Z (`date -u`)

Read on tree `/root/projects/shark-pos-p11` (detached at 74f24f81; nothing edited). Builder note `ledger/wo-notes/pos-P6.1-fix1.md`. The base is c91d8735 (= session/pos 5e5b0675 + the prep merge).
Same rules as round 1:
- no build, serve, QC5, prod or DB write;
- node only via `iso.sh` ISO_MEM=3G;
- QC4 read-only through `qc4.sh` + `/tmp/shark-gate-pos.lock`;
- crontab read for counts and paths only (no line printed);
- no `.env*` opened.

## Verdict: **MERGEABLE**
- All of F1–F16 are closed with evidence (table below), and every claimed run reproduced.
- Two new **MEDIUM** runbook gaps (R2-F1, R2-F2) and five LOW items remain. All are doc or guard tweaks. None blocks the merge into session/pos.
- **Condition:** close R2-F1 and R2-F2 before the W31 rehearsal / owner hand-off.
- `git merge-tree session/pos(e41c486a) 74f24f81` → clean.

## Reproduced (round 2)
- **Oracle on the branch:** `qc-pos-p6.1` → **26/28**, failed = [R1, R3] (PR body, by design).
- **Red-before:** `env P61_REV=603877ea` → **16/28**, failed = E1 R1 R3 Z1 N1–N8. Matches the note.
- **Writer guard:** `pos-prod-writer-guard.mts --self-test` → **21/21**.
- **QC4 `--self-test`:** FAIL 0 · WARN 5 (M1 = #37 pending on shared QC4, X1, S1, S6, S7) · posMigrations 38.
- **QC4 `--counts`:** FAIL 0. PosSale 519 … nothing over 100k ⇒ path ก.
- **`--crons`:** R1 OK (3 entries, all `/root/projects/shark-in-th`). R2 WARN (de0eafc7, 43 behind a84bca2b). R3 WARN (0 `pos.*` jobs). R4 OK.
- **Crontab lock files:** each of minute/hourly/daily has exactly 1 entry with `/tmp/shark-crm-<mode>.cron.lock`. The §7:470 assumption holds.
- **Schema card:** QC4 read-only `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script`, filtered to POS tables = **exactly the 14 `CREATE INDEX`** named in #37.
  - No DROP of `PosProductChannelPrice_product_code_unit_key`, so the `@@unique` declaration removes the old drift.
  - #37 (`prisma/migrations/20261220100000_pos_p61_hand_indexes/migration.sql`) = `SET lock_timeout '5s'` + 14 × `CREATE INDEX IF NOT EXISTS` + `RESET`. No CONCURRENTLY, no DROP.
  - The names match Prisma defaults (`<Table>_<cols>_idx`).
  - The prisma/ diff touches only those 14 `@@index` + 1 `@@unique` (ecommerce, inventory, pos, pos_order, restaurant) + #37. Nothing in src/, package.json or the lockfile.
- **Path ข dependency claim checked.** Objects created by p111 (PosReceiptIssue*, PosTaxInvoiceRequest*, `PosSale.publicToken`) and by p34 (PosOfflineSale/Snapshot, offlineCode/Ref/Seq, syncedAt) are not referenced by any later migration. The one exception is `publicToken` in `pos_p27_qr_orders`, which belongs to `PosOrder`.
- **The §1A queries (a)–(d) only use columns and enum values that exist on origin/main.** Checked: ApiKey revokedAt/expiresAt/systemId/scopesJson/lastUsedAt · Appointment/HotelReservation/RentalBooking depositPaidAt + status values · BookingService/HotelRoomType/RentalAsset depositSatang · Membership acceptedAt/unitAccess · `BusinessUnit.type` RESTAURANT.
- **Writer CLIs connect only with the validated URL.** `src/lib/core/db.ts:23` = `new PrismaPg({ connectionString: process.env.DATABASE_URL })`, the same variable `decideWriterTarget` checks (`scripts/lib/pos-prod-writer-guard.mts:88-110`).
  - No env file is loaded on the prod path: `pos-backfill-catalog.mts:37-47` loads `QC_ENV_FILE` only without ALLOW. Web-prices and shift-off load none.
  - The guard runs before the dynamic `import("@/lib/core/db")` in all 3 CLIs (catalog `:49` vs `:65`, web-prices `:27` vs `:34`, shift-off `:29` vs `:36`).
  - `--verify` exits before the dry-run marker is written (`pos-backfill-catalog.mts:84-91` vs `:118-119`).

## F1–F16 closure (file:line at 74f24f81)
| F | closed? | evidence |
|---|---|---|
| F1 | ✅ | runbook §0 `:11-22`: vercel-build fact, order env → VPS migrate → `migrate status` hard gate → merge, P3009, "No pending migrations to apply." §4.2–4.3 `:326-350`; §11 `:574-585`; oracle N1 |
| F2 | ✅ | §6 `:434` (W40 · ≥ 32 · ≠ other keys · before migrate) · §1 row 1.13 `:47` · §9 pairing `:516` · verify `ENV_NAMES` `scripts/verify-prod-pos.mts:220` |
| F3 | ✅ | §8 `:478-509`: 7 prod lines, all `DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL=…`; one shared guard; expected output per CLI |
| F4 | ✅ | §1A `:67-115`: a–e with file:line + commits, GO-3a…3e, read-only psql block; verify `--counts` K3 `:665-693` |
| F5 | ✅ | `--counts` `verify-prod-pos.mts:44,61-78,643-699` (savepoint per query, pre-migrate safe via 42P01) · §3.2 `:192-257` paths ก/ข/ค/ง with exact SQL · `COUNT_TABLES` maps PosSale to both ข and ง (`:64`) |
| F6 | ✅ | §7 `:453-472`: hourly cadence; flock all 3 locks + `pull --ff-only` + install; `--crons [--post-merge]` `:701-783`; S9 `:563-572` |
| F7 | ✅ | §4.4 step 3 `:355` · appendix rule `:604` (20 files) |
| F8 | ✅ | §9 `:534-538` (+ GO-22 detector SQL) |
| F9 | ✅ | §3.3 `:259-274` (URL option + `SHOW lock_timeout` + `prisma db execute --stdin` proof + ALTER ROLE fallback) · row 1.4 dropped `:38` · 100k `:202` |
| F10 | ✅ | §4.0 `:296-315` (detached worktree at `<PR_HEAD_SHA>`, clean status, no `.env`, frozen install). Oracle N7 bans prod commands from `/root/projects/shark-pos` |
| F11 | ✅ | §1 rows 1.16–1.19 `:50-53` (W37 W38 W39/W41 W19) |
| F12 | ✅ | `qc-pos-p6.1.mts` Z1 (+prisma/, lane pin c91d8735) · E1 (W40 row, no forced "pending") · N1–N8 `:503-643` · R3 |
| F13 | ✅ | = F2 (`:220`) |
| F14 | ✅ | §1 1.3 → `src/lib/actions/pos.ts:536` (`:37`) · 1.5 → `scripts/fitness-pos.mts:1062-1068` (`:39`) |
| F15 | ✅ | §5.3 `:406-417` (VALUES LEFT JOIN ⇒ 15 rows, exists/valid) |
| F16 | ✅ | `decideTarget(env, mode, allow)` `verify-prod-pos.mts:108-135` (rehearsal = prod rules) + G2 `:321-323` · guard `:104-108` + self-test `:167-169` |

## New findings (round 2)

### R2-F1 — MEDIUM · nothing re-checks that the PR head is still `<PR_HEAD_SHA>` at merge time (GO-12)
**Evidence.**
- GO-11 (`:343`, `:584`) only forbids merging *other* PRs with migrations.
- The controller pushes to `session/pos` routinely: e41c486a (PR body draft) already sits on top of the tip this branch was cut from.
- Any commit that lands on the PR between GO-5 and GO-12 is built and promoted by Vercel without the gates. If it carries a migration, Vercel applies it with no pre-flight (the F1 failure mode again).

**Fix.** §4.3 step 0 (⛔ GO-12 pre-check):
```
git -C /root/projects/shark-pos fetch origin
git -C /root/projects/shark-pos diff --stat <PR_HEAD_SHA> origin/session/pos -- prisma src package.json pnpm-lock.yaml vercel.json scripts/vercel-build.sh
```
- The diff must be empty, **and** `git log <main SHA at GO-10>..origin/main -- prisma/migrations` must be empty.
- Otherwise re-run GO-9/GO-10 on the new head.
- State the freeze rule as "ledger-only commits allowed".
- Add an oracle line.

### R2-F2 — MEDIUM · systems that already have `registerV2 = true` switch to the V2 register at merge with an empty catalogue
**Evidence.**
- §8 puts GO-16…GO-19 *after* GO-12.
- The V2 register reads `PosProduct` (`src/lib/modules/pos/register.ts:829,853`), which is empty until the catalog backfill runs.
- Shift-required is on by default for registerV2 (`src/lib/modules/pos/shift.ts:48-55`) until `pos-shift-required-off`.
- So a system counted in K2 cannot sell between the merge and the end of the dry-run → TG → "ทำ" cycle, which can take hours.
- §1A lists a–e but not this case.
- QC4 K2 = 2. The prod value is unknown until GO-6.

**Fix.**
- Add §1A row **f**: "K2 > 0: these systems get the V2 register at merge".
- If K2 > 0, run §8.1–8.5 for those tenants between GO-10 and GO-12. They only write new tables, the new `posProductId` link columns and a settings key, all of which main ignores. Then re-run `--verify` after GO-12, because legacy writes between backfill and merge can leave drift.
- Alternative: set `registerV2 = false` for them before the merge.
- Prove the chosen route in the rehearsal.

### R2-F3 — LOW · node version claim
- Row 1.8 (`:42`) says `@zxing/library` needs node ≥ 24 (its `engines` is `>= 24.0.0`).
- The VPS node inside `iso.sh` is **v20.20.2** (`bash scripts/iso.sh node --version`).
- There is no `engine-strict`, so `pnpm install --frozen-lockfile` only warns. The lane trees install fine on this machine.

**Fix.** Reword row 1.8 and the §7:471 assumption: "warning only on this VPS; browser-only lib".

### R2-F4 — LOW · the host checks compare the first DNS label only
Both `decideWriterTarget` (`pos-prod-writer-guard.mts:75-85`) and `decideTarget` (`verify-prod-pos.mts:121-122`) look only at the first label:
- `ep-royal-night-x.anything.tld` → role prod;
- `ep-frosty-lab-x.anything.tld` → role qc4 (no ALLOW needed);
- writer CLIs accept `-pooler` endpoints.

That is fine against accidents, but cheap to harden.

**Fix.**
- Require the endpoint label to match `^<mark>-[a-z0-9]+$` and the hostname to end in `.neon.tech`.
- Writers refuse `-pooler`.
- Add self-test cases: suffix spoof, pooler, IP literal, uppercase.

### R2-F5 — LOW · the new `@@unique` changes generated client types, but no full type check ran
- `@@unique([productId, channelCode, unitId], map: …)` on `PosProductChannelPrice` adds a new `WhereUniqueInput` to the generated client.
- fix1 ran no `prisma generate` and no full `tsc` (note `:5`, `:57`: single-file tsc on the scripts only).
- `vercel-build.sh` runs `tsc` *after* migrate, so a type error would first show at merge. The build goes red; it is recoverable by a forward fix.

**Fix.** Before the PR, the controller runs `prisma generate` + `tsc --noEmit` (via iso.sh, tree d) on the merged session/pos. The change is additive, so this is likely green.

### R2-F6 — LOW · §4.4 step 6 restore caveat
Restoring from the GO-8 Neon branch discards every write since GO-8. Say so, and limit it to the window (no sales since GO-8).

### R2-F7 — LOW · §4.0 does not stop when the URL is rejected
`:310` unsets `PROD_DIRECT_URL` on a `-pooler` URL or an existing `options=` but does not stop. Later lines then run with an empty variable (`psql ""` falls back to local defaults).

**Fix.** Add `[ -n "${PROD_DIRECT_URL:-}" ] || echo "🔴 หยุด"`, or a line telling the owner to stop and re-enter the URL.

## Answers to the round-2 questions
- **Can a writer CLI reach a non-allowlisted host?** No. The connection = the validated `DATABASE_URL`; the guard runs before the DB import; no env file is loaded on the prod path; `DIRECT_URL` must be the same mark and role. Only the R2-F4 label-spoof edge remains.
- **Does the guard self-test cover the bypasses?**
  - Covered (21 cases): NO_URL · non-allowlisted · look-alike prefix · percent-encoded · `?host=` · PGHOST · mixed DIRECT_URL · ALLOW/tenant rules · rehearsal on/off-list · marker keying.
  - Missing: suffix spoof, pooler, `PGHOSTADDR`-only, IP literal, uppercase hostname (R2-F4).
- **The lock_timeout URL proof is sound in design:** a positive and a negative control, through the same schema engine (`prisma db execute`). I did not re-run it (QC4 evidence is in the note). GO-7 repeats it on prod read-only.
- **§3.2 paths ก/ข/ค/ง are executable as written.**
  - Path ข's `resolve --applied`-before-deploy is flagged ⚠️ as an assumption to prove in W31 (`:212`).
  - PosSale > 100k correctly triggers both ข and ง (`COUNT_TABLES` `:64`; table `:207`, `:210`).
- **Lane-pin oracles** `qc-pos-p3.8` ST3 and `qc-hf-fu2` ST1 stay red until the merge re-pin (controller noted it). #37 is not yet on QC4/QC5, so self-test M1 shows 🟡 until the controller applies it.
