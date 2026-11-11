# P3.4 S — builder notes (ออฟไลน์: snapshot · `/sync/sales` · คิวผู้จัดการ · ด่านเซิร์ฟเวอร์ C-13 v2)

Tree `/root/projects/shark-pos-d` · branch `wip/pos-p3.4` from `72669941` + merge `origin/wip/pos-p3.4-oracle` `eb4eee6d` (merge `fc5a2c5f`) · prompt `pos-prompt-accountA-P3.4-B.md` · brief `pos-brief-P3.4.md` §10 + CD-P34a.
Status: see §9 (results) — this file is the checkpoint.

## 1. Files / hunks per ruling
| Ruling | File | Hunk |
|---|---|---|
| R1 · มติ 2 · CD-2 | `prisma/migrations/20261217110000_pos_p34_offline/migration.sql` (new) | ADD COLUMN ×4 (PosSale.offlineRef/syncedAt · PosDevice.offlineCode/offlineSeq DEFAULT 0) · CREATE TABLE PosOfflineSale/PosOfflineSnapshot · 5 indexes · partial unique `PosSale(unitId, offlineRef) WHERE offlineRef IS NOT NULL` + `PosDevice(unitId, offlineCode) WHERE offlineCode IS NOT NULL` |
| R1 | `prisma/schema/pos.prisma` | 2 marked field blocks (PosSale · PosDevice) + 2 models appended (statuses = String) |
| R1 | `src/lib/core/scope.ts` | `PosOfflineSale: sys()` · `PosOfflineSnapshot: unit` (1 block) |
| R1 | `scripts/pos-qc-env.mts` | `POS_MODELS` + posOfflineSale / posOfflineSnapshot |
| R3 R4 R5 R11 R12 · ST/Q | `src/lib/modules/pos/offline-shared.ts` (new · pure) | names table consts + 11 fns · `OFFLINE_SLIP_TITLE` · slip labels via payload (receipt-render untouched) |
| F15.4 | `src/messages/{th,en}/pos.json` | append `register.offline.{refusal.* (11) , slip.title}` |
| R7 มติ 3 | `src/lib/modules/pos/service.ts` | type `offline?: Readonly<{ref; soldAt}>` · `saleOfflineSoldAt`/`bkkPeriodOf` · period line · paidAt/offlineRef/syncedAt (4 marked blocks, 2 base lines replaced) |
| ST2 | `scripts/pos-sale-contract.json` | `types.CreateSaleInput.offline` (ORACLE-EDIT commit) |
| R6 R8 R9 · CD-4 CD-12 | `src/lib/modules/pos/register.ts` | `RegisterOfflineSubmit` + `registerOfflineCtx` (Symbol key) · regPrice `opts.at/snapshotPrices` · book `opts.at` · snapshot price override in the line loop · `off` read · device-revoked skip · recorded shift · re-price at soldAt + snapshot drift · `saleInput.offline` · no KDS ticket (5 base lines replaced) |
| มติ 12 · CD-12 | `src/lib/modules/pos/staff-pin.ts` | one block: `staffActorFromToken(…, opts?{at})` → at-path (expiry at `at` + token issued ≤ at + revokedAt ≤ at refused) · base body renamed `staffActorFromTokenNow` (1 base line) · `verifyStaffPin` untouched |
| CD-1 | `src/lib/modules/pos/kds.ts` | heal SQL `AND s."offlineRef" IS NULL` |
| R2 R5–R10 · CD-3…CD-9 | `src/lib/modules/pos/offline-sync.ts` (new) | 5 async exports · never calls createSale |
| R5 มติ 2 | `src/app/api/pos/sync/route.ts` (new) | POST · getAuth · same-origin + JSON only (CSRF) · 401/403/404/409/422/503 JSON |
| R5 มติ 2 · CD-8 | `src/lib/modules/pos/api/ops/sync.ts` (new) · `api/op.ts` · `api/registry.ts` · `core/permissions.ts` · `api-keys/scopes.ts` | op `sync.sales` (49) · `POS_SCOPES.offlineSync` · key `pos.offline.sync` · bundle **pos-admin** (CD-P34b) |
| ST5 | `docs/api/POS-API.md` · `skills/shark-pos-api/references/endpoints.md` | `gen-pos-api-docs` regenerated |
| R3 ST8 | `src/lib/modules/pos/settings-general.ts` | import + appended `updatePosOfflineEnabled` (OWNER only · FOR UPDATE + jsonb_set + audit) |
| มติ 10 | `ledger/POS-CONTRACTS.md` | C-13 v2 as-built block |

## 2. Migration + `_prisma_migrations` (QC4 only)
- Before deploy (`bash scripts/qc4.sh pnpm exec prisma migrate status`): last common `20261216100000_pos_p27_qr_orders`; rows present in QC4 but not in this tree: `20261201000000_hr_pin_hash`, `20261202000000_hr_payroll_run_live_unique`, `20261217100000_pos_p35_staff_commission` (P3.5 lane). Mine renamed `20261217100000` → **`20261217110000_pos_p34_offline`** so it never shares a timestamp with P3.5.
- `migrate deploy` on QC4 → applied `20261217110000_pos_p34_offline` only. `prisma generate` in tree d only (own node_modules, not a bind mount).

## 3. ORACLE-EDITs (each its own `test(pos)` commit)
| Commit | File | Before → after |
|---|---|---|
| `439ca700` | `scripts/pos-gates.json` (CD-10) | suites 88 → 89 (+ `qc-pos-p3.4` forced) |
| `0ebdc101` | `scripts/pos-sale-contract.json` (ST2) | fields 62 → 63 (`CreateSaleInput` 51 → 52: `offline`) · callers kept = 72669941 (createSale 16 · voidSale 12 · refundSale 1) — the generator rewrites callers from today's src (already ≠ base: sales.ts gone · refundSale +1) which would make ST2 red; F15.2 treats caller drift as info |
| `1be86fee` | `scripts/qc-pos-p2.13.mts` ST1 | OPS_SPEC 48 → 49 (+ `sync.sales POST /sync/sales pos.offline.sync write`) · titles :1 :65 :68 :147 · BUNDLE_SPEC pos-admin 15 → 16 (+ `pos.offline.sync`) |
| `f0ff7298` | `scripts/qc-pos-api-skill.mts` K5 | OP_PATHS 48 → 49 (+ `POST /sync/sales`) · titles :44 :91 :301 |

## 4. CONTROLLER-DECISION (raised by the builder)
- **CD-P34b (CD-8 vs RS4)**: CD-8 says `pos.offline.sync` joins the bundle of `pos.sale.create`. That bundle is `pos-operate`, but `qc-pos-p3.4.mts:1942` creates key "op" = `pos-operate` and `:2007–2008` (RS4) requires it to get **403 scope_missing** — adding the scope to `pos-operate` makes RS4 red. Built: scope in **`pos-admin`** (also carries `pos.sale.create`) + p2.13 BUNDLE_SPEC ORACLE-EDIT. Flip = move the line in `scopes.ts` POS_OPERATE_SCOPES + ORACLE-EDIT p3.4 RS4.
- **CD-P34c (OFF code rule vs SEC3 fixture)**: `qc-pos-p3.4.mts:1915–1916` (SEC3) builds D5 refs with `nextRef("D5")` → `codeOfDev` falls back to `Z${k}` (`:1277`) because the SEC3 loop (`:1909`) never stores `SN.D5`; the "kept" item `OFF-ZD5-0001` must be **OK**. Built rule: ref = `^OFF-[A-Z0-9]{1,8}-[0-9]{4,8}$`; a code in the server namespace `C<n>` must be **this device's** code (other device / unassigned C-code = REJECTED VALIDATION — SY15 steal); a non-`C<n>` code cannot collide with server-assigned codes; uniqueness per unit is the full ref (OFFLINE_REF_TAKEN + partial unique). createSale's `offline.ref` regex aligned. Strict alternative (only own `C<n>`): ORACLE-EDIT SEC3 to keep `SN.D5 = sn.snapshot` in the loop, then tighten the two regexes.
- **CD-P34d (manager accept ≠ "price = item price")**: R10 says accept with "price = item price". Built: accept re-runs R6 (price at soldAt or the snapshot evidence frozen in the payload) — a forged price stays PRICE_MISMATCH (accept refused; discard + ring online with a normal, cap/PIN-checked discount). Accepting a client-asserted price would bypass every price control. Overrides that accept *does* apply: shift → null (off-shift cash) · seller → original seller if still allowed, else the manager · stock re-checked · max-age 24 h waived (manager decides) · missing snapshot evidence allowed (soldAt price only). Still enforced: future clock, snapshot bounds, device revoked at soldAt, OFF ref.
- **CD-P34e (K6 home skill copies)**: `gen-pos-api-docs` changed `skills/shark-pos-api/references/endpoints.md` ⇒ `qc-pos-api-skill` K6 (home copies `/root/.claude*/skills/shark-pos-api` byte-equal) is red on this branch. Not synced by the builder (would publish `/sync/sales` to every session before deploy) → CONTROLLER-RUN `bash scripts/sync-skills.sh` at merge.
- **CD-P34f (snapshot transport for U)**: S ships the snapshot facade only (names table has no snapshot route/op). P3.4U needs a deploy-stable way to fetch it (e.g. GET/POST on `/api/pos/sync` or a sibling route) — controller to rule at U.
- **Migration `SET lock_timeout`**: the prompt asks for it, but ST1 (`qc-pos-p3.4.mts:467–490`) accepts only ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE INDEX statements (a `SET` is "คำสั่งที่ไม่อนุญาต"). Omitted; ADD COLUMN nullable/constant DEFAULT is metadata-only on PG ≥ 11. Controller may add a prod-only lock_timeout at deploy.

## 5. Deviations / design notes (hunter targets)
- Offline context reaches `submitRegisterSale` only through `registerOfflineCtx` (module-private Symbol key) — cannot come from request JSON / server-action args.
- `PosOfflineSale` lifecycle: insert first as `REJECTED` + reason `PROCESSING` (transient) → verdict. Replays: SYNCED/ACCEPTED = DUPLICATE (no writes) · REJECTED = same reason · DISCARDED = REJECTED `DISCARDED` · PROCESSING = decide again (crash recovery, sale idempotent by key) · same key + different item hash / unit / device = REJECTED `IDEMPOTENCY_CONFLICT` (no writes). Audit `pos.sale.offline_synced` only by the winner of the PROCESSING → SYNCED transition and only when the sale carries this offlineRef (an online sale of the same key = DUPLICATE, no offline audit).
- Payload: stripped of `pin managerPin managerUserId phoneLast4 staffToken token secret password` at every level; the token itself is never stored — `itemHash` (sha256 of the item with sha256(token)) + `staffClaimUserId` (unverified claim, used only by manager accept) + snapshot `evidence` (issuedAt · priceValidUntil · prices of the cart's products/choices) frozen at first contact.
- Clock (R7): soldAt ≤ now + 2 min · ≥ now − 24 h · ≥ snapshot.issuedAt · soldAt − issuedAt ≤ 24 h (snapshot too old at sale time) · ≥ shift.openedAt − 5 min. Snapshot-price path allowed only until the snapshot's priceValidUntil + 15 min (stored as `priceMap.$priceValidUntil`).
- Shift (R8): item shiftId must be this device's shift of the unit (else VALIDATION); not OPEN = SHIFT_CLOSED. **No shiftId** ⇒ the device's shift covering soldAt is bound (OPEN → bind · closed → SHIFT_CLOSED) — prevents hiding cash bills off-shift; none + `requiredRegister` = SHIFT_REQUIRED.
- Token (มติ 12): `staffActorFromToken(…, {at})` also refuses `at` before the token's issue time (exp − TTL) and `at` > now + 2 min; PIN version + sell permission evaluated now.
- Snapshot-path lines whose unit price differs from the price book get `priceSource "OPEN"` (+ `priceRule null`); drift = `{totalAtSoldAtSatang, snapshotTotalSatang, lines[{productId, priceAtSoldAtSatang, snapshotPriceSatang}]}` in result · PosOfflineSale.drift · audit `after.drift`.
- Transient register refusals (BUSY / INTERNAL / UNKNOWN) stop the batch with `{ok:false, code:"BUSY"}` (row stays PROCESSING; resend is idempotent).
- Prices in the snapshot are the register catalogue's at the server clock of the call (`issuedAt` = `opts.now ?? now`); `opts.now` is the test seam for clamps only. `syncedAt`/`createdAt` = server wall clock.
- Not done in S (no allowed file): outbox payload `offlineRef` (R9 "additive" — optional) · discard as a shift cash-variance note (R10 — shift.ts frozen).

## 6. Lane-pin reds at 737102e8 (controller re-pins at merge; builder never edits) — gates1 run
Listed in the prompt (all red, pin-only):
- `qc-pos-p2.7` ST3 (register.ts/service.ts/contract vs 05975437 · `:49`, `:342–361`) — also **ST1** schema-unchanged pin (`:47`/`:616`, "schema + migration เพิ่มอย่างเดียว" sees the P3.4 PosSale/PosDevice fields)
- `qc-pos-p2.8` ST6 (register.ts · service.ts · contract not touched · `:295`) — also **ST1** (`:564`, models unchanged) + **L2** (`:764`, contract unchanged)
- `qc-pos-p2.10` ST2 (`:221` LANE_PIN · register.ts +65 −5 · service.ts +21 −2 · contract sha ba68f669 ≠ 72afb258 · qc-pos-p2.13/api-skill edited)
- `qc-pos-p2.11` ST1 (prisma ≠ 05975437 · `:267`) + ST4 (lane-A files service.ts/register*.ts)
- `qc-pos-p2.12` ST1 (prisma ≠ c5fc223b · lane-A `:356–370`)
- `qc-pos-p2.13` ST5 (contract sha · prisma diff · `:350`)
- `qc-hf-fu` ST1 (prisma changed vs c3c52ef1/merge-base c5fc223b · register*/service NEVER_TOUCH `:285–296`)
**Not in the prompt's list — same class (pins on the contract sha / PosDevice model / migrations that R1 + ST2 require to change):**
- `qc-pos-p1.10` ST2 `:275–278` — every migration mentioning `"PosDevice"` must be CREATE-only; P3.4 R1 must `ALTER TABLE "PosDevice" ADD COLUMN` (and p3.4 ST1 requires exactly that form) ⇒ ORACLE-EDIT: restrict to the P1.10 migration or allow ADD COLUMN.
- `qc-pos-p2.1` S8 `:553–555` and `qc-pos-p2.2` S3 `:545–546/:556` — contract-sha gate for the accepted extra fields (sha 72afb258…) ⇒ re-pin to ba68f669… + accept `offline`.
- `qc-pos-p2.6` ST1 `:525` (PosDevice field set = base) + L3 `:379–380` (contract sha) ⇒ re-pin.
- `qc-pos-p2.9` L1 `:376` (contract additions vs 57dc226b only giftCard*) · `qc-pos-p2.9b` L1 `:47` (CONTRACT_SHA 72afb258…) ⇒ re-pin.
- `qc-pos-api-skill` K6 `:314` + `qc-pos-p2.14` K2 `:512` — home skill copies ≠ regenerated endpoints.md ⇒ CONTROLLER-RUN `bash scripts/sync-skills.sh` at merge (CD-P34e).

## 7. U-only handoff (P3.4U · not in this suite)
- V states: `offline-sale` · `offline-queue` · `offline-tenders` · `offline-sync-back` · `offline-rejected` (derived manager queue, owner-ack like P2.8) · `settings-offline-live` — fresh incognito context each, flag on; existing `offline` / `settings-offline` keep flag off.
- IndexedDB `shark-pos-off:<systemId>:<unitId>` (never `managerPin|pin|phoneLast4|cost`) · wipe snapshot on logout/`STAFF_TOKEN_INVALID` · Web Locks leader + backoff · shift close blocked while queue > 0 · unsynced bills not voidable/refundable · offline PIN verifier PBKDF2-SHA256 ≥ 310k (มติ 8).
- Strings `register.offline.*` 19ง banner/chips + live `settings.offline.*` · ui-inventory rows for new testids · OfflineCard switch → `updatePosOfflineEnabled` (needs a "use server" action) · client slip = `offlineSlipPayload` + `printReceipt` · results → `classifyOfflineResult` · refusal text → `offlineRefusalMessageKey`.
- Snapshot transport (CD-P34f) · session sync URL `POST /api/pos/sync` body `{systemId, unitId, deviceId, items}`.

## 8. `--state` list for the controller
None new in S (no UI). Visual `--list` / `--dry` th/en must stay unchanged (§9).

## 9. Results (QC4 · tree d · never export CI)
- `qc-pos-p3.4` red-before at 439ca700 = 4/42 (ST4 ST7 Z1 Z2) · run1 566eb646 41/42 (SEC3 → CD-P34c) · run2 7f9c6209 **42/42** · run3 737102e8 **42/42** · run4 737102e8 **42/42** (00:20Z) · `--no-db` **15/15**.
- gates1 at 737102e8 (`scratchpad/p34b/gates1/`): green — p1.3 p1.6 p1.7 p1.9 p1.9b p1.11 p1.12 p1.15 hf-tx p1.1 p1.18 · money restaurant-money shop-refund hotel-money ticket-money subscription-money account-cpa · fitness no-env 53/53 · fitness QC4 0 · fitness-pos 8/8 · `gen-pos-api-docs --check` 0 · visual `--list` / `--dry` th / en exit 0 (visual-pos.mts untouched ⇒ no new state).
  Red = pin-only, §6: p1.10 ST2 · p2.1 S8 · p2.2 S3 · p2.6 ST1+L3 · p2.7 ST1+ST3 · p2.8 ST1+ST6+L2 · p2.9 L1 · p2.9b L1 · p2.10 ST2 · p2.11 ST1+ST4 · p2.12 ST1 · p2.13 ST5 · hf-fu ST1 · api-skill K6 · p2.14 K2 (no behavioural red).
- typecheck: mid-way f0ff7298 exit 0; final head — see commit message of the push / report.

## 10. Fix round 1 delivered (CD-P34g · hunter N1–N5 + R1 F1–F6) — 17 Oct
Fix commits (marker `// POS P3.4 ▸ fix1 <id> ◂`; inside existing register.ts blocks the marker carries no `◂` so the P3.4 block stays one block for ST2):
| Item | Commit | What |
|---|---|---|
| N1 High | `02c4622c` | payload stores `verifiedSellerUserId` (token user verified at soldAt on pass 1, else sync user) + `claimedSellerUserId` (display only); accept sells as the verified seller only (cannot sell any more → SELLER_MISMATCH, never the manager); list returns claimed/verified separately |
| N2 = F3 | `abc6cd86` | accept: recorded/covering shift OPEN → bound · closed → null · none → device's OPEN shift else null · pass 1: no covering shift ∧ (device OPEN shift ∨ shift within 24 h) → SHIFT_REQUIRED |
| N3 | `cfaa8935` `0d543417` | soldAt > evidence.priceValidUntil + 15 min → CLOCK_INVALID · audit `after.priceAtSyncSatang` · at-soldAt total (rule-priced line) < total at sync ∧ sync − soldAt > 30 min → `PRICE_WINDOW_REVIEW` (new code in `OFFLINE_REFUSAL_CODES`, `register.offline.refusal.priceWindowReview` th/en) · accept skips the review and prices at soldAt |
| N4 = F1 | `f6a1842d` | snapshot retention = issued within 24 h (cap 200/device) ∪ last 2 |
| N5 = F4 | `77776824` `cdc0bff1` | discard: sale of `reg2:<key>` exists → row SYNCED (+ offline_synced audit `via:"recovered"` only if none yet), refuse CONFLICT · list includes ACCEPTED_BY_MANAGER with saleId null |
| F2 | `9974752a` | register.ts regPrice: `UNAVAILABLE && !opts.at` (offline skips 86/menu sold-out; archived = PRODUCT_NOT_FOUND; stock via createSale) — 6 base lines replaced in register.ts (ST2 limit 8) |
| F5 | `096f8a8c` | flag off gates snapshot issue only; `syncOfflineSales` no longer checks the flag |
| F6 | `3222d081` | `C<n>` ref must parse canonically (`parseOfflineRef`) else REJECTED VALIDATION |

Oracle (each its own `test(pos)` commit; checks 42 → 49):
- ORACLE-ADD SY18 (N1) `47241a08` · SY19 (N2) `2337c387` · SY20 (N3) `9d2678e9` · SY21 (N4) `c1514a66` · SY22 (N5) `a2e051c4` · SY23 (F2) `c0937031` + fixture fix `b3207da0` (gum: latte is MENU without a MenuItem at unit A) · SY24 (F6) `e1f31992`.
- ORACLE-EDIT F5 `42115e63` (SY13: flag-off sync of a queued batch is accepted · count 42 → 42).
- **ORACLE-EDIT forced by the rulings (not on the CD-P34g list — CD-P34h)** `6bc89969`: SY6 (+ the SY5 count line) — the happy-hour bill sold 2 h before sync is exactly the N3 review case ⇒ now REJECTED PRICE_WINDOW_REVIEW then manager accept at 3000 (at-soldAt pricing still proven); SEC3 — with 24 h retention the D5 eviction test issues its first two snapshots 30 h / 29 h ago (still "3 issued → 2 kept → evicted hash REJECTED").
- Red against the old code: all oracle commits sit on the 737102e8 code (no src change until the first fix commit) — forced run at b3207da0's predecessor `e1f31992` = **40/49**, red exactly SY6 SY13 SY18 SY19 SY20 SY21 SY22 SY23 SY24 (SY23's first run red on its fixture; fixed in b3207da0 before the fixes). No swap-in needed (nothing to restore).

Results at code head `3222d081` (QC4):
- `qc-pos-p3.4` forced **49/49** ×2 (fix1-r1 · gates-fix1) · `--no-db` **15/15**.
- `qc-pos-p1.9` 0 · `qc-pos-p1.15` 0 · `qc-hf-tx` 0 · `qc-pos-p2.6` 65/67 (red = pins ST1 PosDevice fields + L3 contract sha; behavioural part green incl. PAR) · `qc-pos-p2.2` 41/42 (red = pin S3 contract sha) · fitness no-env 0 · fitness QC4 0 · fitness-pos 0 · `gen-pos-api-docs --check` 0.
- **Typecheck** (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`): head **18229723** dirty=0 (2026-10-17T01:04:59Z) → **exit 0**. (Earlier: f0ff7298 exit 0 · eca8f126 exit 0.) The only later commit is this ledger line.

## 11. Fix round 2 delivered (CD-P34i · R2 G1–G4 + hunter N6–N9) — 17 Oct
| Item | Commit | What |
|---|---|---|
| G1 | `65ffde7b` | covering shift resolved first on both passes · recorded shift counts only if soldAt ∈ [openedAt − 5 min, closedAt ?? now]; pass 1 not covering = CLOCK_INVALID (opened after soldAt — keeps SY11's R7 code) / VALIDATION (closed before soldAt); accept falls back to the covering shift (OPEN → bound) |
| G2 + N6 | `b52e768b` | price-at-sync = `regPrice(…, {at: syncTime})` (offline path, no 86 gate); refusal ⇒ null ⇒ fail closed (review when late > 30 min ∧ rule-priced line) · snapshot-match branch: late > 30 min ∧ soldAt > snapshot pvu ∧ snapshot total < price-at-sync (or null) ⇒ PRICE_WINDOW_REVIEW |
| G3 | `8c2cfc4b` | retention = issued within 2 × OFFLINE_MAX_AGE_MS (48 h) of opts.now ∪ last 2 · cap 200 |
| N8 | `e1436b13` | snapshot issue 1/device/60 s (issuedAt window; allowed when the last snapshot's pvu has passed) ⇒ RATE_LIMITED (before the catalogue walk) · never evict a hash referenced by PROCESSING/REJECTED/ACCEPTED-without-sale rows |
| N7 | `0df1386f` | accept with claimed seller ≠ verified (= sync user, no token): claimed must sell at the unit (else SELLER_MISMATCH); discount cap = lower of both; open/custom/typed-weight lines need priceOverride of the claimed seller too |
| N9 | `9824f1fe` | discard re-labels SYNCED only when the committed sale's offlineRef = the row's; otherwise normal discard |
| G4 | `08585311` | C-13: REST-synced rows (API-key actor) cannot be accepted — SELLER_MISMATCH ⇒ discard only (acknowledged; no code) |

Oracle (own `test(pos)` commits; checks 49 → 51): ORACLE-EDIT SY19 (G1) `c9a4f299` · SY20 (G2/N6 +3 cases incl. positive) `9596142e` · SEC3 (G3: −60/−59 h) `51bdbc7b` · SY22 (N9) `bf4ca866` · ORACLE-ADD SY25 (N8) `0275c1c0` · SY26 (N7) `b85d620f`.
Red before the fixes (code = 3222d081, head bf4ca866): forced **46/51**, red exactly SY19 SY20 SY22 SY25 SY26 (SY20's positive case and SEC3 green on old code = controls). No swap-in needed.
**CD-P34j (deviation)**: N6's snapshot-branch review is applied only when soldAt is past the snapshot's priceValidUntil (the N6 bypass window (pvu, pvu+15]). The literal "snapshotTotal < priceAtSync ∧ late > 30 min" would also queue every honest base-price drift synced late (SY4: cake 4500 snapshot vs 5500 now, synced 90 min later must stay OK + drift). G1 pass-1 code for a recorded shift that opened after soldAt stays CLOCK_INVALID (SY11) — VALIDATION only when it closed before soldAt.
Results at code head 9824f1fe (gates at 08585311, ledger-only after): `qc-pos-p3.4` forced **51/51 ×2** · `--no-db` **15/15** · `qc-pos-p1.9` 0 · `qc-hf-tx` 0 · `qc-pos-p2.6` 65/67 (pins ST1 + L3 only; behavioural + PAR green) · `qc-pos-p2.2` 41/42 (pin S3 only) · fitness no-env 0 · fitness QC4 0 · `gen-pos-api-docs --check` 0.
- **Typecheck** (8192 heap · iso 10500M): head **e39a842f** dirty=0 (2026-10-17T01:48:24Z) → **exit 0**. Only this ledger line follows.
