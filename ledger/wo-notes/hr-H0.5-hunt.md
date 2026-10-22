# H0.5 security hunt — PIN hashing / uniqueness / verifyPin

> Hunter: Claude Opus 5.5 · 2026-10-22 · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.5` @ `1517ad7f` (verified) · diff `session/hr...HEAD` (10 files)
> Probes: one scratch script (deleted afterwards), run 2× through `iso.sh → qc4.sh → with-gate-lock.sh → tsx`, QC4 (`ep-frosty-lab`), tenant `qc-hunt-h05-<ts>`, 2 HR systems. Load 4.1 and 7.2 during the runs; the timing numbers are DB round-trip dominated and came out the same both times.
> No product code, oracle or ledger file edited apart from this note. Not committed.

## Findings

### F1 — MAJOR (contract level, not a builder defect) — tenant-wide PIN-only lookup + success-agnostic 120/60 s bucket = whole 4-digit space can be harvested
- `src/lib/modules/hr/pin.ts:40` `VERIFY_PIN_LIMIT = { limit: 120, windowMs: 60_000 }`, `:166` the only limiter, key `hr-verifypin:<tenantId>`; `:199` returns `employeeId` + `userId` on a hit.
- PINs are unique per tenant and `verifyPin` takes no employee identity, so each guess is tested against **every** PIN holder at once. Hit chance per guess = N/10⁴ (4 digits). With 30 holders the first hit is expected after ~333 guesses (≈ 3 min). A sequential sweep of 0000–9999 takes 10⁴/120 ≈ **84 min** and returns every holder's PIN with their employeeId. 6 digits: full sweep ≈ 139 h, first hit ≈ 4.6 h. Nothing records failures: no audit, no ops alert, no lockout.
- Probe: call #121 in the window returned `"ลองใหม่ในอีก 51 วินาที"`. Calls 1–120 with distinct wrong PINs all went through.
- Today nothing calls it: `verifyPin` is only re-exported (`hr/index.ts:46`). The risk arrives with POS P1.15.
- Smallest ask (controller ruling before P1.15 consumes C-8): count **failures** (not all calls), per tenant **and** per caller device/user, e.g. 10 failures / 15 min with an escalating lockout. Add `logOps` WARN plus an owner notification when the tenant failure bucket trips. Consider requiring 6 digits for the tenant-wide path (the kiosk keeps 4–6).

### F2 — MAJOR — backfill in prod mode lets a stale shell `HR_PIN_PEPPER` silently override the prod env file (irreversible lockout)
- `scripts/hr-backfill-pin-hash.mts:49-63`: `process.loadEnvFile(p)` **does not override variables already in the environment**. Probe on node v20.20.2 with fake values: shell `HR_PIN_PEPPER=from_shell_value` + file `HR_PIN_PEPPER=from_file_value…` ⇒ `process.env.HR_PIN_PEPPER = from_shell_value`. `DATABASE_URL` behaves the same way.
- Scenario: the operator's shell still has a QC/dev pepper exported, runs runbook B2 step 3 `HR_BACKFILL_PROD=1 HR_BACKFILL_ENV_FILE=<prod file> … --apply`. Every prod plain PIN gets hashed under the wrong pepper and `pinCode` is nulled. Every employee then fails both the kiosk and verifyPin. The rollout is one-way (B2), so the only recovery is re-setting every PIN.
- B2 says "the script loads `DATABASE_URL` **and** `HR_PIN_PEPPER` from that file". That is false whenever either one is already exported. The script also accepts `HR_BACKFILL_PROD=1` with no env file at all (`if (f)`), using whatever the shell holds.
- Smallest ask (script only): when `PROD`, require `HR_BACKFILL_ENV_FILE`. Refuse with exit 1 if `HR_PIN_PEPPER`, `DATABASE_URL` or `DIRECT_URL` is already set before loading, or load with override (`util.parseEnv(readFileSync(p))` then assign). Optional stronger guard: `--canary <employeeId>` reading a PIN the owner just set in the prod UI from stdin; refuse `--apply` if `hashPin` ≠ the stored `pinHash`. This proves the script's pepper equals the deployed one.

### F3 — MINOR — tenant-wide DoS of `verifyPin`
- Same bucket as F1 (`pin.ts:166`), counted before the PIN check. Probe: after 120 junk calls, the **correct** PIN `4321` was refused with `"ลองใหม่ในอีก 51 วินาที"` for the whole tenant. The kiosk is unaffected (separate path; `clockWithPin` → ok in the same window).
- Any one POS terminal or user, or one buggy client loop, blocks staff PIN verification (void approvals) for every terminal of the shop.
- Ask: same fix as F1 (per-caller bucket, failures-only counting, so successes are not starved by junk).

### F4 — MINOR (rollout window only) — duplicate legacy PINs: timing oracle + kiosk accepts both holders + verifyPin then attributes to one of them
- Timing (25 interleaved calls per case, 2 HR systems, both runs): hit ≈ 30 ms (sys A) / 39 ms (sys B) · **miss ≈ 78–82 ms · inactive holder ≈ 78–81 ms · duplicate-plain ≈ 60 ms** (p25 58 vs 74–77, tight) · bad format ≈ 10 ms. All misses return the same text `"PIN ไม่ถูกต้อง"`. The duplicate-plain path (`pin.ts:222`) returns after 2S+1 queries instead of 3S, so its latency tells that ≥ 2 employees share this plain PIN.
- Kiosk (`pin.ts:269-285`, ruling F-1(c)): probe `verifyPinForEmployee(dup1,"7777")` ok → dup1 upgraded to hash. `verifyPinForEmployee(dup2,"7777")` **still ok** (P2002, upgrade skipped). After that `verifyPin("7777")` = **ok, employeeId = dup1**. So during the window dup2 can pass as dup1 on the tenant-wide path. B3 says "verifyPin (POS, tenant-wide) does not [accept them]"; that only holds until one duplicate has used the kiosk.
- Ask (runbook/notes, no code): gate P1.15 consumption of `verifyPin` on B2 step 4 (0 plain rows on prod), and correct B3. Removing the legacy path after the backfill closes the timing difference as well.

### F5 — MINOR — the miss path costs 3×S sequential queries; the dummy compare equalises nothing
- `pin.ts:192-221`: `byHash` (S queries), then the legacy loop (S), then `byHash` again (S); S ≤ 50 active HR systems (`:187`). With 2 systems a miss already takes ≈ 80 ms vs 30 ms for a hit. With 50 systems, 120 wrong calls/min = 18 000 queries/min against one tenant. `timingSafeEqual` on `DUMMY_HASH` (`:219`) is correct but makes no difference when DB round trips dominate. Static check S4.9 is cosmetic. The latency difference doesn't matter today, since `ok` reveals hit/miss anyway. F4 is the exception.
- Ask: one query per pass over `systemId: { in: systemIds }` (a tenant-scoped accessor, or a `tenantDb` variant that accepts a system list). Drop the second `byHash` and the legacy loop when the legacy path is removed.

### F6 — MINOR — `createEmployeeAction` is a "PIN taken?" oracle that bypasses the `hr-setpin` limiter
- `src/lib/modules/hr/actions.ts:45-60` reads `pin` from FormData and has no `checkRateLimitDb`. The create form (`ui.tsx` ~:479-490) has no PIN field, but a server action accepts any posted field. `service.ts:60-64` → `setPin` → D8 text. Probe: `createEmployee(…, {pin:"4321"})` (held by an active employee) ⇒ `{pinSet:false, reason:"PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น"}`; free PIN ⇒ `pinSet:true`. The action discards the result, but `hasPin` in the list then shows it. That gives an unlimited taken-PIN oracle for anyone with `hr.employee.create`. It is noisy (it creates employees) and does not say *who* holds the PIN. The H0.3 10/10 min bucket on `setPinAction` exists precisely for this oracle.
- Ask: drop `pin` from `createEmployeeAction` (the UI never sends it), or apply the same `hr-setpin:<t>:<u>` bucket when `pin` is present.

### NOTES
- N1 (known F4b / D3): reactivation audit `hr.pin.clear REACTIVATE_DUPLICATE` has `actorId: null` (probe confirmed). `restoreEmployeeAction` drops `pinCleared`, so the owner is never told to set a new PIN.
- N2: `checkRateLimitDb` fails open (`rate-limit-db.ts:77-83`). An attacker can't force it with crafted input: the key is `hr-verifypin:<tenantId>` from the caller. Pool exhaustion under a flood could make some limiter calls fail open, though the next queries would usually fail too. For the tenant-wide verify path (not chat), fail-closed is the safer choice; POS can retry. Controller call.
- N3: no audit or ops record of failed `verifyPin` / kiosk attempts, so there is nothing to detect with. That also means a failure audit can't leak which employee was targeted.
- N4: pepper check is length-only (`pin.ts:52`, `env.ts:25` `min(32)`); `"a"×32` passes. The runbook says `openssl rand -hex 32`, which is fine. Rotation = all PINs invalid, documented honestly (B2, pin.ts:7).
- N5: the unique index counts active employees of **deactivated** HR systems, but `verifyPin` skips those systems (`:184`). Such a PIN reads as "taken" on `setPin` and "wrong" on `verifyPin`. Consistent with D8; mention it in the notes.
- N6: the migration builds the index without `CONCURRENTLY` (not possible inside Prisma's migration tx). There is a short write lock on `HrEmployee`, but the index starts empty (all `pinHash` NULL), so it is a non-issue at prod size.
- N7: `listEmployees` (`service.ts:67`) and several `findFirst` calls return full rows including `pinHash`/`pinSetAt` to server code. Checked: no row is spread into a client component or API/AI output (`ui.tsx` passes `hasPin(e)`; staff/booking map to DTOs; AI uses `count`). This is known reviewer F8; a `select` is still worth adding.

## Tried and held
- No plaintext compare left: `pinCode` is only read in `pin.ts`, plus the backfill script (grep over `src/` + `scripts/`); the legacy kiosk compare hashes the stored plain value and uses `timingSafeEqual` (`:264,:269`).
- Hash: HMAC-SHA256 keyed by the pepper (not concatenation), message `tenantId␟pin`, so the same PIN in two tenants gives different hashes. The pepper is never logged, returned or put in audit. Probe: audit rows (6) contain no fixture PIN and no 64-hex string; backfill output contains no PIN, no 64-hex string and no pepper.
- Same text and same latency for "no such PIN" vs "PIN of an inactive employee" (78–82 ms both, `"PIN ไม่ถูกต้อง"`). A PIN in the other HR system of the tenant is found (hitB ok). D8 text is byte-identical for setPin duplicates and createEmployee duplicates.
- Uniqueness: the partial unique index is the only arbiter (no pre-select), so it is race-safe (oracle S3.2 covers 10-way races). Reactivation collision ⇒ `{ok:true, pinCleared:true}` with the PIN cleared (probe). An inactive holder's PIN can be reused (probe `pinSet:true`).
- Tenant/system scope: every `pin.ts` query goes through `tenantDb` with `tenantId` (+ `systemId` per HR system); no raw `prisma` / `$queryRaw` in `pin.ts`. `setPin` requires the employee to be active and in `ctx.systemId`. The kiosk `employeeId` is client-chosen by design (name on screen); H0.3 limiters are unchanged.
- Legacy path can't be forced after the backfill: no writer of `pinCode` remains in `src/` (the `pinCode` alias goes through `setPin` and is hashed). The legacy branches only match `pinHash IS NULL AND pinCode = pin`. `verifyPin`'s legacy branch runs behind the same tenant limiter; the kiosk branch behind the H0.3 kiosk limiters.
- Backfill (`--tenant`, QC4): dry-run wrote nothing. `--apply` hashed the unique plain row, cleared the duplicate (the one still plain, while the already-upgraded holder kept its hash) and cleared the invalid `12a4` row. A second `--apply` gave `changed 0` (idempotent). One tx per tenant, guarded by an advisory lock. Writes are conditional (`pinCode = old AND pinHash IS NULL`), so concurrent kiosk upgrades are harmless; a concurrent P2002 rolls back only that tenant. Only the given tenant is touched; output shows ids + initials only.
- Bad format costs a limiter slot (counted before the format check), so formats can't be probed for free.

## Residue / running
- Tenants `qc-hunt-h05-*` on QC4 = **0** after each run (`RESIDUE tenants qc-hunt-h05-* = 0` ×2); `ChatRateBucket` rows of the tenant and its employees deleted. Scratch script and `/tmp/hunt-h05` (fake env file) removed.
- Nothing of mine is running. The `iso-*` units still up all have WorkingDirectory `shark-pos` / `shark-pos-d` (POS lanes, untouched). `/tmp/shark-gate-pos.lock` not touched.

## Verdict: **FIX ROUND NEEDED (small, script + notes only)**
- Required before the prod runbook: **F2** (backfill env precedence) and the F4 note corrections (P1.15 gated on 0 plain rows; fix B3 wording).
- Recommended in the same round: F6 (one line in `createEmployeeAction`).
- F1/F3/F5 are contract-level; rule on them before POS P1.15 consumes `verifyPin` (they don't block merging H0.5, since nothing calls `verifyPin` yet).
- If the controller would rather patch the runbook than the script for F2 (`env -i`, or `unset HR_PIN_PEPPER DATABASE_URL DIRECT_URL` before step 3), this becomes ACCEPT WITH NOTES.

## r3 re-check
> Hunter: Claude Opus 5.5 · 2026-10-22 · `/root/projects/shark-hr-b` · branch `wip/pos-hr-h0.5` @ `9095eaa5` (verified) · r3 diff `0bd64e58..9095eaa5` (5 files).
> One scratch probe (`.hunt-h05r3/probe.mts`, now deleted), run once via `iso.sh → qc4.sh → with-gate-lock.sh → tsx` on QC4 (`ep-frosty-lab`). Tenants `qc-hunt-h05r3-<ts>` (T: HR systems A+B · T2: one system). Load during the run was 5.1–5.7. The timing medians were tight (IQR ≤ 3 ms) and unknown and inactive came out identical, so I did not repeat the run. Backfill probes ran directly with `env -i` and fake files in `mktemp -d` (port-1 URL, fake 46-char pepper); the dir was deleted afterwards.

### F1 — per-caller bucket · PARTIAL (closed for a server-derived caller key; open when the caller can choose the key, see G1/G3)
- Sequential: 10 wrong from `u1` ⇒ `wrong×10`, 11th ⇒ `ลองใหม่ในอีก 600 วินาที`, correct PIN from `u1` ⇒ limited, correct PIN from `u2` ⇒ ok (right employee). Buckets `u1=10`, tenant `10`, `u2` no row. 5 more calls from the locked `u1` ⇒ buckets unchanged (10/10), no new audit. **Refused calls consume nothing.**
- Successes: 30 parallel + 100 sequential correct ⇒ `ok×130`, **0 bucket rows**.
- Key variants (correct PIN, `u1` locked): `" u1 "`, `"u1\t"`, `"\nu1"`, `"u1 "` ⇒ limited (trim folds them). `"U1"` and `"u1​"` ⇒ ok (separate buckets; harmless for cuid user ids, but relevant if the client picks the key). `""`, `"   "`, `undefined`, `null`, missing property ⇒ `PIN ไม่ถูกต้อง` with no row created. `0` ⇒ key `"0"`.
- Collisions: the tenant key is `hr-verifypin:<t>` and the caller key is `hr-verifypin:<t>:<k>`. Tenant ids contain no `:`, so no caller key can equal another tenant's key. T full ⇒ the same PIN in T2 ⇒ ok. Kiosk/setpin prefixes (`hr-kiosk:`, `hr-setpin:`) are disjoint.
- Who passes `callerKey`? Nobody yet (only the re-export). The contract comment (`hr/index.ts:44`) says "user id … else `unit:<unitId>` (or device id)". A session user id is server-side and the client cannot choose it. A unit id or device id usually arrives in the request and can be rotated freely (see G3).

### F2 — backfill prod env precedence · CLOSED
`HR_BACKFILL_PROD=1`, `--tenant` dry-run, minimal env:
| case | exit | JSON_SUMMARY | message |
|---|---|---|---|
| preset `HR_PIN_PEPPER` (valid-looking) | 1 | no | Thai, names `HR_PIN_PEPPER`, before load |
| preset `DATABASE_URL` | 1 | no | Thai, names it |
| preset `HR_PIN_PEPPER=` (empty) / `DATABASE_URL=` (empty) | 1 / 1 | no | refused (`!== undefined`, strict) |
| no `HR_BACKFILL_ENV_FILE` / set to `""` | 1 / 1 | no | Thai, names it |
| env file path missing | 1 | no | `ไม่พบ HR_BACKFILL_ENV_FILE` |
| values only in the file | passes the guard; host `127.0.0.1`, P1001 on the fake URL, tx rolled back | yes | expected |
| file without the pepper / pepper < 32 chars | 2 / 2 | no | fixed not-configured text, nothing loaded from DB |
| preset `DIRECT_URL` only | not refused | — | harmless: the runtime client uses `DATABASE_URL` only (`src/lib/core/db.ts:23`) |

### F3 — tenant-wide DoS · MOSTLY CLOSED
Junk from one sequential caller now stops at 10 and no longer starves anyone. To trip the tenant bucket you now need 120 failures/min from ≥ 12 caller keys, or a single burst (G1). P7: one caller's 200-request burst set the tenant bucket to 199 ⇒ every terminal of the shop refused for 60 s, repeatable once per 10 min.

### F4 — rollout window · NOTES DONE (unchanged by design)
B2 now gates P1.15 on step 4, and B3 is corrected. The timing tell is still present: duplicate-plain median 42 ms vs miss 51 ms.

### F5 — raw SQL · CLOSED
`pin.ts:232-238`: a `$queryRaw` tagged template only. `tenantId`, the `Prisma.join(sysIds)` items, the `Prisma.sql` fragments (`pinHash`/`pinCode`) and `LIMIT` are all bound parameters; no string concatenation. `sysIds.length === 0` ⇒ `[]` with no query (an empty `IN ()` cannot occur). `tenantDb().$queryRaw` adds no scope, so the explicit `"tenantId" = $` is the scope, and it is always present. Probes: a T2 system id or a bogus `systemId` from T ⇒ wrong (counted), `systemId=sB` ⇒ ok, `systemId=sA` ⇒ wrong. Miss now costs 51 ms vs 25 ms for a hit (r2: 80 vs 30).

### F6 — createEmployeeAction · CLOSED (read)
`actions.ts:53-59` no longer reads `pin`. The only other `createEmployee` caller (`ai/proposals.ts:660`) passes no pin. `setPinAction` keeps its 10/10 min bucket.

### Lock audit `hr.pin.locked` · HOLDS
4 locks in the run ⇒ exactly 4 rows: `u1`, the long key, `burst30`, `burst200`. Bursts of 30 and 200 each produced exactly one row, because only one atomic upsert returns 10. All rows have actorType `SYSTEM`, actorId null, targetId null, keys `callerKey,count,windowSec`, and contain no PIN, no 4–6-digit run and no employee id. Successes never write one (P2: 0 rows). Caveat: `callerKey` is stored verbatim (P5b stored a 200 000-char key; see G2).

### New findings
#### G1 — MAJOR (blocks P1.15; not H0.5 merge) — peek→consume race: a single burst bypasses both buckets, and the burst size is chosen by the attacker
- `src/lib/modules/hr/pin.ts:185-206`: `peekRateLimitDb` (read) … lookup … `failed()` → `checkRateLimitDb` (write). Every request in a burst passes the peek before any request consumes.
- Probe P7, one caller, last guess correct: **30 parallel ⇒ 29 wrong evaluated + 1 ok, caller bucket 29 (limit 10), tenant 29**. **200 parallel ⇒ 199 wrong + 1 ok in 1.4 s, caller bucket 199, tenant 199 (limit 120).** The builder's debt says "overshoot ≤ concurrency of that burst". That is true, but the concurrency is attacker-chosen: a POS user can call a server action with N parallel fetches. A 4-digit sweep is a 10⁴-request burst (≈ 70 s at the 7 ms/req observed). It returns every PIN holder's id and yields **one** audit row. The result is the F1 harvest again, done faster.
- Smallest fix: reserve atomically, then refund. Consume both buckets first with `checkRateLimitDb` (the r2 order; atomic, so `count > limit` ⇒ refuse). On a **success** (and on `PinNotConfigured`), refund with one statement: `UPDATE "ChatRateBucket" SET "count" = "count" - 1 WHERE "key" = $k AND "windowStart" = $ws AND "count" > 0`, where `$ws` is the windowStart the consume returned. `checkRateLimitDb` would need to expose `windowStart` (or add `refundRateLimitDb(key, windowStart)` next to `peekRateLimitDb`). Failures-only accounting stays the same, overshoot becomes 0, and the count-10 audit is unchanged. A refused call (count > limit) also needs the refund to keep "refused consumes nothing", or the controller can rule that refused calls may count. Oracle: a parallel-burst check (e.g. 50 wrong from one caller with `Promise.all` ⇒ ≤ 10 evaluated).

#### G2 — MINOR — unvalidated `callerKey`: a NUL byte makes the per-caller limiter fail open (and floods `OpsEvent`); huge keys are stored verbatim
- `pin.ts:180` only trims. Postgres rejects `\u0000` in text ⇒ both `peekRateLimitDb` and `checkRateLimitDb` throw ⇒ fail-open (`rate-limit-db.ts:109-114`, `:77-83`).
- Probe P5: `callerKey "evil\u0000x"` ⇒ 15 wrong, all evaluated (`wrong×15`). A correct PIN afterwards ⇒ ok, with **0 caller rows and 0 lock audits**. Only the tenant bucket counted (15). The 15 calls wrote **31 `OpsEvent` WARN rows** (`tenantId` null). P5b: a 200 000-char key works as a bucket and lands in `AuditLog.after`.
- This only matters if the key ever comes from request data. Smallest fix in `verifyPin`: `if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(callerKey)) return wrong;` (no DB). r2 N2 (fail-closed for this path) would also cover it.

#### G3 — contract (controller ruling before P1.15) — caller-chosen keys reduce F1 to the tenant bucket, and the tenant trip is silent
- Probe P6: 120 wrong, each with a fresh `callerKey` ⇒ `wrong×120` and **0 lock audits**. The 121st call (correct PIN, new key) ⇒ `ลองใหม่ในอีก 54 วินาที`. **0 `OpsEvent`, 0 notifications** for the tenant. With rotating `unit:`/device keys the r2 numbers still hold (full 4-digit sweep ≈ 84 min, first hit ≈ 3 min with 30 holders), and nothing is recorded.
- Ask: C-8 must state that `callerKey` is a **server-derived authenticated identity** (session user id; for kiosk-less terminals, a server-registered terminal id taken from a signed cookie or the session, never a request field). Add `logOps WARN` plus the deferred owner alert when the tenant bucket first reaches 120 (one per window, the same `count === limit` trick as `hr.pin.locked`).

### Tried and held (r3)
- Hash-first and legacy paths: a single plain row ⇒ ok, the row is upgraded (pinCode null, pinHash = spec), and ok again via the hash. Duplicate plain ⇒ wrong (counted). An inactive holder ⇒ wrong.
- Texts unchanged (`PIN ไม่ถูกต้อง` / `ลองใหม่ในอีก N วินาที`). Timing medians (25 interleaved rounds): hit 25 · **miss 51 · inactive 51** (p25/p75 49/52 for both, so parity holds) · duplicate plain 42 (F4) · bad format 17. Bad format no longer looks like a miss in latency, but it was always distinguishable by format alone.
- `PinNotConfigured` consumes nothing (code read, `pin.ts:213`). Success never touches the buckets (P2).

### Residue / running
- `cleanup … RESIDUE tenants qc-hunt-h05r3-* = 0 · buckets = 0` (ChatRateBucket rows deleted by `key contains tenantId`, including the long and NUL attempts, which never created rows). Tenant `auditLog`/`opsEvent`/`appSystem`/`hrEmployee` were deleted. The 31 tenant-less `OpsEvent` WARN rows from the NUL probe were deleted by source + time window + error text (31 = 31). No users were created.
- Scratch dir `.hunt-h05r3/`, the run log and the fake env dir are removed. `git status`: only the controller's 3 untracked `hr-H0.5-control*.txt` remain, plus this note edit (not committed).
- Nothing of mine is running. I did not touch the `hr-ctl-h05r3-*`, POS `iso-*` units or `/tmp/shark-gate-pos.lock`.

### Verdict: **ACCEPT WITH NOTES** for merging H0.5 (no caller of `verifyPin` exists yet; F2/F5/F6 closed, F1/F3 closed for sequential traffic)
- **Before POS P1.15 consumes C-8 (required):** G1 (reserve + refund instead of peek + consume, plus an oracle burst check) and the G3 ruling (server-derived `callerKey`, tenant-trip alert). G2 is a one-line validation, best done in the same round.
- If the controller wants `verifyPin` final before merge, G1 + G2 make a small fix round (`pin.ts` + `rate-limit-db.ts` + one oracle check). In that case this verdict reads FIX ROUND NEEDED (small).
