# WO H0.5 — PIN hashing + uniqueness + `verifyPin` facade

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.5-oracle` (oracle writer) → builder `wip/pos-hr-h0.5`, cut from `session/hr` @2c4d92b2 · 2026-10-08T05:11Z (`date -u`) · controller: Fable · oracle writer: Claude Opus 5.5
> Contract: `HR-V2-MASTER-PLAN.md` §4 row H0.5 + §8 migration row (read with `git show origin/session/pos:…`) · brief `ledger/hr-briefs/hr-brief-H0.5.md` §2 R1–R8 / §3 + `hr-brief-COMMON.md`
> Oracle: `scripts/qc-hr-h0.5.mts` (**58 checks** · commit `test(hr): H0.5` — see git log · edited after commit: no) · red run `ledger/wo-notes/hr-H0.5-red.txt` · green run `hr-H0.5-green.txt` (builder)
> DB: **QC4 only** (`ep-frosty-lab`) — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.5.mts`
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → ok

## 0. Checkpoint
- done (oracle writer): oracle written · unforced run = SKIP exit 0 · forced run = RED 8/58 for the right reasons, no crash, `RESIDUE tenants=0 none` · typecheck clean (1 run) · notes.
- next: controller rules OQ-1…OQ-14 and F-1…F-3 (§9) → builder on `wip/pos-hr-h0.5`.
- last command: forced run → `===== qc-hr-h0.5 ===== ผ่าน 8/58 (QC_FORCE)` exit 1.

## 1. Check list → brief ruling (ids `H0.5-…` · base = expected on 2c4d92b2)
| id | brief | base | what |
|---|---|---|---|
| S1.1 | R2 | RED | hashPin: other tenant ⇒ other hash · same input ⇒ same · 64 lowercase hex |
| S1.2 | R2 | RED | hashPin equals a local HMAC-SHA256(key = pepper, msg = `tenantId\u001fpin`) (OQ-4) |
| S1.3 | R2 / §3 S1 | RED | child process with another pepper ⇒ other hash, and the child's hash matches the formula with its own pepper (OQ-3) |
| S1.4 | R2 | RED | child without `HR_PIN_PEPPER` (self-checked `pepperAbsent`) ⇒ hashPin throws `PinNotConfiguredError`, fixed text |
| S1.5 | R2 | RED | same child: setPin + verifyPin refuse with the fixed text (throw or `{ok:false}`, OQ-5) · the row has no plain PIN and no hash |
| S2.1 | R2 | GREEN | 4/5/6 digits ok |
| S2.2 | R2 | GREEN | "123" / "1234567" / "12a4" ⇒ "PIN ต้องเป็นตัวเลข 4-6 หลัก", row unchanged |
| S2.3 | R2 | RED | after set: pinHash = formula · pinSetAt set · pinCode null |
| S2.4 | R2 | RED | empty pin ⇒ all three null |
| S2.5 | R2 | RED | inactive employee ⇒ "ไม่พบพนักงาน" |
| X2.1 | R2 / X2 | GREEN | employee of the other HR system ⇒ "ไม่พบพนักงาน" |
| S2.6 | R2 | RED | audit `hr.pin.set` + `hr.pin.clear` exist, no PIN digits / hash in before/after (OQ-12) |
| S3.1 | R2 / HQ3 | RED | same PIN, two systems of one tenant ⇒ second gets the D8 text byte-identical, no hash |
| S3.2 | R2 / X6 | RED | race: 10 setPin of one PIN on 10 employees (2 child processes × 5, pool warmed to 5 distinct backend pids each = 10 connections), 3 rounds ⇒ 1 ok + 9 D8 per round |
| S3.3 | R1 / X6 | RED | DB after the race: 1 row with the hash per round, 0 plain |
| S3.4 | R4 | RED | deactivated holder frees the PIN (base red only because no hash) |
| S3.5 | HQ3 | RED | other tenant may reuse the PIN (hash of that tenant) |
| S3.6 | R1 | RED | `pg_indexes`: exactly one index touching pinHash = `HrEmployee_tenantId_pinHash_active_key` UNIQUE (tenantId, pinHash) WHERE active = true AND pinHash IS NOT NULL |
| S4.1 | R2 / C-8 | RED | correct ⇒ keys exactly `employeeId,ok,systemId,userId` · userId = linked user |
| S4.2 | R2 | RED | employee of system B, no linked user ⇒ ok, systemId B, userId null |
| S4.3 | R2 | RED | wrong ⇒ exactly `{ok:false, reason:"PIN ไม่ถูกต้อง"}` (OQ-8) |
| S4.4 | R2 | RED | bad format ("12", "abcd", 7 digits, "", "12 34") ⇒ same text |
| S4.5 | R2 | RED | inactive holder ⇒ not verified |
| X2.2 | R2 / X2 | RED | PIN of another tenant ⇒ not verified here, verified there (positive control) |
| S4.6 | Q2 / R2 | RED | `systemId` filter (other system ⇒ no, own ⇒ ok) · `unitId` accepted and ignored |
| S4.7 | R2 / C.9 | RED | 120 calls pass the limiter, 121st (correct PIN) ⇒ "ลองใหม่ในอีก N วินาที" · bucket `hr-verifypin:<tenantId>` count ≥ 121 |
| S4.8 | R7 | RED | no verify result contains a PIN, hash, employee name or pepper; no throw |
| S4.9 | R2 (static) | RED | `pin.ts` has `timingSafeEqual(` and an identifier containing "dummy" (OQ-6) · timing median is `[info]` only |
| S5.1–S5.3 | R2 legacy / HQ4 | RED | plain-only row ⇒ verify ok ⇒ upgraded in place (hash, setAt, pinCode null) ⇒ second verify ok |
| S5.4 | R2 legacy / HQ3 | RED | two plain rows with one PIN ⇒ not verified, both untouched |
| S5.5 | R3 | GREEN | kioskRoster hasPin: plain true · hash true · none false · keys only id/name/position/hasPin (OQ-9) |
| S5.6 | R2 | RED | `hasPin(row)` truth table |
| S5.7 | R2 legacy / X6 | RED | 10 concurrent verifies on one plain row ⇒ 10 ok, row ends hashed (OQ-7) |
| S6.1 | R6 (static) | RED | backfill script exists, `loadQcEnv(`, `ep-royal-night` + `HR_BACKFILL_PROD`, `--apply`, `--tenant` |
| S6.2–S6.7 | R6 / R7 | RED | dry-run counts (OQ-1) + no write · apply state + changed 4 · audit `hr.pin.backfill` · second apply 0 · output has no PIN/hash/pepper/full name, lists duplicate ids |
| S7.1 | R3 | RED | clockWithPin on a hashed row (pinCode null) ⇒ IN 1 row · `verifyPinForEmployee` exported |
| S7.2 / S7.3 | R3 | GREEN | wrong PIN text · no-PIN text unchanged |
| S7.4 / S7.5 | R3 | RED | createEmployee `{pin}` hashed · duplicate ⇒ created, `pinSet:false` + D8 `reason` (OQ-11) |
| S7.6–S7.8 | R4 | RED | A deactivated → B takes the PIN → A reactivated ⇒ `pinCleared:true`, A no PIN, B keeps it · audit `REACTIVATE_DUPLICATE` |
| S8.1 | F16.5 / R3 | RED | AST mirror of F16.5 for `pinCode` (all `src/**`) and `pinHash` (HR area, OQ-10) outside `hr/pin.ts`, plus `seed-review-shop.mts` |
| S8.2 | R3 | RED | `hr/index.ts` re-exports `verifyPin` and a `VerifyPin…` type from `./pin`, has "C-8", still no DB import |
| S8.3 | R1 | RED | migration folder/SQL (columns, partial unique, no DROP, Thai comment) + `hr.prisma` fields (pinCode kept) |
| S8.4 | R5 | RED | `env.ts` line `HR_PIN_PEPPER: z.string().min(32).optional()` marked `HR H0.5 ▸` (same or previous line) · `export const hasPinPepper` |
| S8.5 | R7 | GREEN | `privacy-shared.ts` has `hasPin`, no pinCode/pinHash in the AST |
| S8.6 | §4 | RED | `fitness-hr` `F165_BASELINE.size === 0` and `scanPinReaders()` empty, `hr/pin.ts` exists |
| S8.7 | R2 / R7 | RED | `pin.ts`: `createHmac("sha256"`, the three fixed texts, no `e.message`, no `console.*` |
| Z1 | — | GREEN | residue: 3 temp tenants gone, no HR/audit/party rows, no `hr-verifypin:`/`hr-kiosk:`/`hr-setpin:` buckets of our ids, temp user gone |

Counts per group: S1 5 · S2 7 (incl. X2.1) · S3 6 · S4 10 (incl. X2.2, static S4.9) · S5 7 · S6 7 · S7 8 · S8 7 · Z1 1 = **58**.
Not in the oracle (COMMON §E, controller runs it): `qc-hf-hr-privacy` viewer matrix unchanged (§3 S8 first bullet).

## 2. Migration / seed / backfill
Builder. The oracle's S6 fixture (tenant `…-bf`): 2 active duplicates (plain, same PIN) · 1 inactive plain · 1 already hashed (`pinSetAt` 2026-01-02T03:04:05Z) · 1 unique plain · 1 without PIN.

## 4. X-group
| X | applies? | check ids / N-A reason |
|---|---|---|
| X1 idempotency | yes | S6.6 (second apply = 0), S5.3 |
| X2 cross-tenant / system | yes | X2.1, X2.2, S4.6, S3.5 |
| X3 permissions | N-A | service/facade level; action guards unchanged (H0.3 limiters stay, R7) |
| X4 money | N-A | no money |
| X5 reversal | yes (partial) | S2.4 clear, S7.7 reactivate clears |
| X6 race | yes | S3.2/S3.3 (2 processes × 5, 10 connections, 3 rounds), S5.7 |
| X7 time | N-A | no date logic; oracle uses no "today" |
| X8 not connected | N-A | HR-only |
| X9 outbox | N-A | no event (H4.4 out of scope) |
| X10 visual | N-A | no UI change in scope |
| X11 PDPA | yes | S4.8, S6.7, S2.6, S7.8, S5.5 keys, S8.1, S8.5 |
| X12 no env | N-A here | S8.* are static but the oracle file loads env; F16.5 itself is the no-env check (fitness-hr both modes) |

## 9. Disputes / technical rulings — open questions for the controller (the oracle implements the default)
- **OQ-1 Backfill output contract.** Last line `JSON_SUMMARY {"mode":"dry-run"|"apply","tenants":[{"tenantId","plain","duplicates","hashed","toUpdate","toUpdateInactive","changed"}]}` (or the tenant fields at top level). `duplicates` = number or array of employee ids. `toUpdate` = rows that will get a hash (unique plain + inactive plain = 2), `toUpdateInactive` = how many of those are inactive (1) — my reading of "toUpdate 2 + 1 inactive". `changed` = rows written (dry-run 0 · first apply 4 = 2 hashed + 2 duplicates cleared · second apply 0). The dry-run output must name the duplicate employee ids (initials allowed, full names not).
- **OQ-2 Wrappers for the backfill child.** `bash scripts/qc4.sh pnpm exec tsx scripts/hr-backfill-pin-hash.mts --tenant <id> [--apply]` with the parent's env. Not `iso.sh`: `systemd-run` only passes PATH/HOME/QC_ENV_FILE/NODE_OPTIONS, so `HR_PIN_PEPPER` would be lost (the parent already runs inside iso). Not `with-gate-lock.sh`: the parent holds `/tmp/shark-gate-qc4.lock`, a nested flock waits on itself (up to 30 min).
- **OQ-3 "Pepper override within the process"** = a child process. `env.ts` parses `process.env` once at import, so an in-process override cannot reach `env`. Children receive the parent env (no env-file reload), the missing-pepper child gets it minus `HR_PIN_PEPPER` and reports `pepperAbsent` as a control.
- **OQ-4 HMAC key bytes.** Key = the `HR_PIN_PEPPER` string as UTF-8 (not hex-decoded) · message `${tenantId}\u001f${pin}` · lowercase hex. A hex-decoded key would need an ORACLE-EDIT of `specHash` (S1.2 and every "hash=match" check). POS (P1.15) must use the same.
- **OQ-5 Missing pepper.** `hashPin` must throw (name `PinNotConfiguredError` or `instanceof` the exported class, message = fixed text). `setPin`/`verifyPin` may throw it or return `{ok:false, reason:<fixed text>}` — both accepted; no plain write either way.
- **OQ-6 S4.9 naming.** The dummy compare on the miss path needs an identifier containing "dummy" (any case) outside comments, plus `timingSafeEqual(`. Other naming = ORACLE-EDIT (additive), like H0.3 OQ-5.
- **OQ-7 Legacy race.** 10 concurrent `verifyPin` on one plain row must all succeed: a `count 0` on the upgrade `updateMany` (another call upgraded it first) ⇒ re-check by hash, not a refusal. Only P2002 (another active holder) ⇒ not verified.
- **OQ-8 Result shapes.** ok = exactly `{ok, employeeId, systemId, userId}` · refusal = exactly `{ok:false, reason}`.
- **OQ-9 kioskRoster row keys** stay `{id, name, position, hasPin}`.
- **OQ-10 S8.1 scope.** `pinCode`: all `src/**` + `scripts/seed-review-shop.mts`. `pinHash`: `src/lib/modules/hr/**`, `src/lib/ai/**`, `src/app/**` paths with a segment `hr`/`kiosk`/`payroll`, + seed-review-shop (pages/giftcard have their own `pinHash` columns). Same AST node kinds as F16.5 (property access · `["x"]` · `{ x: … }` / shorthand · binding · string literal containing the name); type-literal property signatures are not counted. Allowed: only `hr/pin.ts` (the backfill script is under `scripts/`, not scanned except seed-review-shop).
- **OQ-11 createEmployee duplicate** returns `pinSet:false` and `reason` = D8 text (field name `reason`).
- **OQ-12 Audit lookup.** Row matches when `targetId` = employee id or the id appears in before/after. `REACTIVATE_DUPLICATE` may be anywhere in before/after.
- **OQ-13 Backfill audit.** `hr.pin.backfill` row with `tenantId` = the tenant, numeric counts in before/after.
- **OQ-14** The already-hashed row keeps its `pinSetAt` byte-identical through `--apply`.

### Findings for the controller (affect builder/acceptance, outside the oracle)
- **F-1 Brief §4 ("ORACLE-EDIT for qc-hr-h0.3 / qc-hf-hr-privacy not needed") is wrong in three places:**
  - (a) `qc-hr-h0.3.mts` S3.1/S3.2 read `pinCode` after `setPinAction` (`:553` `pin11 === "80010"`, then `pin12 === "80012"`) ⇒ red as soon as setPin nulls `pinCode`. Needs an ORACLE-EDIT (compare `pinHash` to `hashPin(tid, "80010")`).
  - (b) `qc-hf-hr-privacy.mts:190-191` calls `hr.createEmployee(ctx, { …, pinCode: "1234" })` through a **typed** import (`:37`, no `as string`). Renaming `CreateEmployeeInput.pinCode` → `pin` breaks `pnpm typecheck`/`next build` (excess property), and those PINs would no longer be set ⇒ Pr-9 (`hasPin` true), N-1/N-3 (duplicate refusal) red. N-4 (`:287` reads `pinCode === "5678"`) goes red anyway once createEmployee hashes. Recommendation: builder keeps `pinCode?` as a deprecated alias of `pin` (goes through setPin, never stored plain) and the controller issues an ORACLE-EDIT for N-4 only.
  - (c) `qc-hr-h0.3.mts` S4 gives three employees the same plain PIN "5555" (`:570`). Under R2 the kiosk legacy upgrade of the 2nd/3rd one hits P2002 ⇒ "treat as not verified" ⇒ S4.1/S4.2 rounds 2–3 red. Ruling needed for `verifyPinForEmployee` (name chosen on screen): recommended = on P2002 accept the plain match without upgrading (the row stays plain and appears in the backfill duplicate list); alternative = ORACLE-EDIT H0.3 to distinct PINs.
- **F-2** R2 writes `tenantDb({ tenantId }).hrEmployee.findFirst(...)` for verifyPin, but `HrEmployee` is system-scoped: `tenantDb` without `systemId` throws fail-closed (`src/lib/core/db.ts:72`; see the comment above `employeeOfUser`, `service.ts` ~:870). Builder has to list the tenant's HR systems and query per system (F5.1 forbids raw prisma in `hr/**`); the index is per tenant, so at most one active row matches.
- **F-3** `server-only` is not installed; `pin.ts` must not `import "server-only"` (the oracle imports it under tsx).

## 10. Debt / not done
| item | reason | closes in |
|---|---|---|
| timing compare is `[info]` (median of 50 vs 50) | brief §3 S4: soft check; hard check is static S4.9 | — |
| backfill missing-pepper exit 2 not tested | child env would come from `.env.qc` via `loadQcEnv`, so the oracle can't reliably remove the pepper | builder notes |

## 11. QC4 restored / temp data left
- `finally` deletes the 3 tenants (`qc-hr-h0.5-<stamp>`, `-o`, `-bf`), their HR/audit/party/system rows (audit before tenant: `AuditLog.tenant` = SetNull), every `ChatRateBucket` key containing a tenant/employee/system id, and the temp user. Forced run: `RESIDUE tenants=0 none (สร้าง 3 ร้าน · ผู้ใช้ 1)`.
- **temp data left:** none.

## Commands run (oracle writer)
| command | final line | exit |
|---|---|---|
| `grep -c ep-frosty-lab .env.qc4` | `2` | 0 |
| `pnpm exec tsx scripts/qc-hr-h0.5.mts --list` (no DB) | `qc-hr-h0.5 — 58 ข้อ` | 0 |
| `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.5.mts` | `JSON_SUMMARY {"suite":"qc-hr-h0.5","total":0,"passed":0,…,"skipped":true,…,"registered":58}` | 0 |
| `… env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.5.mts` (1st, before fixes) | crashed at the end: `Z1` id not registered (harness bug, fixed) · `RESIDUE tenants=0 none` | 1 |
| `… env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.5.mts` (saved in `hr-H0.5-red.txt`) | `===== qc-hr-h0.5 ===== ผ่าน 8/58 (QC_FORCE)` · `RESIDUE tenants=0 none` | 1 |
| `timeout -k 10 1200 env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` | `tsc --noEmit` (no errors) | 0 |

RED on the base (8 pass / 50 fail): pass = S2.1 S2.2 X2.1 S5.5 S7.2 S7.3 S8.5 Z1 (the GREEN rows). Fail reasons: `module absent: hr/pin.ts` (S1.*), `facade missing` (S4.1–S4.8, X2.2, S5.1–S5.4, S5.7), plain-text behaviour (S2.3 `plain=SET hash=n/a`, S2.5 inactive accepted, S3.1 both ok, S3.2 `ok=10` per round, S3.3 `plain=10`, S7.4/S7.5 `pin` ignored, S7.7 no `pinCleared`), `script missing` (S6.*), no index (S3.6), statics (S4.9, S6.1, S8.1–S8.4, S8.6, S8.7).
