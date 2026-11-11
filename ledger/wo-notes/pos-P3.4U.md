# P3.4U — builder notes (ออฟไลน์ 19ง: IndexedDB · ขายเงินสด/โอน · สลิป OFF · คิว+ซิงก์ · คิวผู้จัดการ · สวิตช์ · PIN ออฟไลน์)

Tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.4u` from `origin/session/pos` **731caa0c** (= base b92d5598 + ledger-only 731caa0c) · prompt `pos-prompt-accountA-P3.4U-BUILD.md` · rulings 1–11 + CD-P34U-1…4.
This file is the restart checkpoint (§0 = status).

## 0. Status / next
- [x] step 1 `6a471c55` — client modules (IDB `offline-store.ts` · PBKDF2 `offline-pin.ts` · `use-offline-register.ts`) · `offline-actions.ts` · route `api/pos/sync/snapshot` · CD-P34U-3 hunk
- [x] steps 2–3 + 5 (carried from the killed session, reviewed + 2 fixes, see §3) — sell/banner/chips/slip · sync strip + badge + status bar · LockScreen offline PIN
- [x] steps 4 + 6 `c1f6f1d3` — Shifts close guard + manager queue card · [x] step 7 `ac4b793b` settings live card · [x] step 8a `4d5fabbd` visual (9 states) · [x] 8b `2a92a7b1` inventory +36 · spec · [x] step 9 merge `09fe30cf` (origin b45584ad, ledger only)
- [x] typecheck 0 @91ef77a0 · [x] pos-pre-submit run 1 (§6) · [x] p2.14 V2 sweep row · [x] pushed — DONE (not merged)

## 1. 🔴 Server hunk for the reviewer (CD-P34U-3 — the ONLY server hunk of the card)
`src/lib/modules/pos/offline-sync.ts` `issueOfflineSnapshot` — one block `// POS P3.4U ▸ CD-P34U-3 … ◂ POS P3.4U`:
`$transaction` + `pg_try_advisory_xact_lock(hashtextextended('pos-off-snap:<tenant>:<unit>:<deviceCode>',0))` around rate-check → catalog walk → insert → prune.
Lock busy ⇒ `RATE_LIMITED` at once (N parallel issues ⇒ one catalog walk — N11/H1). Insert = `createMany skipDuplicates` (P2002 cannot abort the tx).
Prune keeps: 2 newest ∪ ≤200 newest inside 48 h ∪ **the oldest inside 48 h** (N11) ∪ hashes referenced by pending rows. Catalog reads go through `db` (pool max 10, the tx holds only the lock + writes); tx `{maxWait 10 s, timeout 120 s}`.

## 2. Components / files (all hunks marked `POS P3.4U ▸ … ◂`)
| Ruling | File | What |
|---|---|---|
| 2 · R13 | `components/pos/register/offline-store.ts` (new) | IDB `shark-pos-off:<sys>:<unit>` (meta · queue · synced) · `enqueueOffline` (seq + add in one tx) · `applySyncResults` · `countQueuedOnDevice` (read-only, no DB creation) · every write via `offlineStoreSafe` |
| 7 | `components/pos/register/offline-pin.ts` (new) | PBKDF2-SHA256 310k · 16-byte device salt · `rememberOfflineUnlock` / `tryOfflineUnlock` (5 fails ⇒ locked) / holder |
| 3 5 8 | `components/pos/register/use-offline-register.ts` (new) | snapshot fetch (load · pvu edge · 15 min · backoff) · Web Locks leader sync loop (online · kick · 30 s) · gate · enqueue · wipe |
| 3 4 5 6 | `components/pos/register/OfflineRegisterParts.tsx` (new) | 19ง banner · badge · chips · pay row · pay sheet · done + slip · bills list (no void/refund) |
| — | `lib/modules/pos/offline-client-shared.ts` (new · pure) | DB name · forbidden keys · record types · backoff · gate/close/discard helpers · baht→satang · quick cash · N10 · `offlineSlipOf` |
| 9 10 | `lib/modules/pos/offline-actions.ts` (new · "use server") | `listOfflineRejectedAction` `acceptOfflineSaleAction` `discardOfflineSaleAction` (pos.shift.manage) · `updatePosOfflineEnabledAction` (pos.settings.manage; writer re-checks OWNER) — async only, no throw, `unstable_rethrow` |
| 8 (CD-P34U-2) | `app/api/pos/sync/snapshot/route.ts` (new) | POST, sync-route guards (same-origin · JSON · session · tenant status · body ≤ 4 kB) → `issueOfflineSnapshot` · `RATE_LIMITED` = 429 |
| 8 (CD-P34U-3) | `lib/modules/pos/offline-sync.ts` | the one server hunk (§1) |
| 1 3 5 7 | `RegisterScreen.tsx` · `CartPanel.tsx` · `register/page.tsx` | flag prop · offline mode (totals, chips, pay row, F4/mobile bar → offline sheet) · unknown → queue · status bar pendingSync = local queue (flag on) · banner/strip · lock props |
| 7 | `LockScreen.tsx` | offline holder pad · `onPinVerified` at every online unlock · no switch/manager offline · P3.5U-F2 |
| 6 9 | `shifts/ShiftsClient.tsx` · `shifts/page.tsx` · `shifts/OfflineQueueSection.tsx` (new) | close guard · manager queue card · member names (display) |
| 10 | `settings/shark-ui.tsx` · `settings/SharkSettings.tsx` · `settings/page.tsx` | live card (CD-P34U-1) · offline tab banner |
| — | `messages/{th,en}/pos.json` | keys §spec 7 (th = en key set · no Thai in en) |
| 11 | `scripts/visual-pos.mts` · `scripts/pos-ui-inventory.json` (+36) | §5 |

## 3. Deviations / design notes (per ruling)
- **Carried-over work** (killed session): steps 2–3 + 5 were uncommitted; reviewed and kept, fixes: doc comment order in RegisterScreen; session-user change also wipes the PIN verifier; ternary testid → template (F15.3 readable).
- R2/13 logout: no register-level logout exists — snapshot + verifier are wiped when another session user opens the register (snapshot userId ≠ session user) and on `STAFF_TOKEN_INVALID`; queue survives. The verifier alone is useless without the unexpired token in sessionStorage.
- R3: totals offline = `offlineCartTotals`; lines with options are sellable only when the choice is in the snapshot (S contract); weighed-barcode lines refuse. Over-cap discounts cannot be approved offline (no manager PIN offline) ⇒ `offline.discountOver`.
- R5: whole-batch non-2xx / `ok:false` ⇒ keep all + backoff (resend with same keys is safe). The status-bar "รอซิงก์" switches to the local queue only when the flag is on (flag off = server 0 as today).
- R6: close guard counts `queued` only (parked rows are on the server's manager queue and would otherwise block forever). No void/refund of unsynced bills: they never reach "today's bills" (server) and the local list has no void/refund control.
- R7: verifier written on every successful online unlock (PIN · set-own-PIN · manager override), only while the flag is on; offline unlock requires the in-memory token holder with an unexpired `expiresAt`.
- CD-P34U-1: with the flag off the card shows the live switch + state chip; pending number stays "0" unless this device/server really has offline bills (then honest counts).
- CD-P34U-4: the card is drawn for managers when the flag is on or rows exist (flag off + no rows = today's Shifts pixels). Seller names come from tenant memberships loaded by the page (display only).
- Settings switch: OWNER toggles; everyone who can read settings sees the live state (aria-disabled).
- Slip devices: `offline-slip` shot at 1440 + 390 only (document, same at 1024).

## 4. CONTROLLER-DECISION
- **CD-P34U-B1 (oracle ST7 vs inventory rule)**: `qc-pos-p3.4` ST7 requires a row for *every* new `offline|sync` testid, but the inventory has interactive kinds only (CRM `$fields`: "กล่อง/ข้อความ/แถวรายการที่ไม่มีตัวกดไม่ต้องมีแถว"). Built: 14 display testids nothing needed were dropped; the 14 kept display testids (banner, gate, chips/chip-*, sync strip, done, done-no, bills, bill-*, lock note, queue card, queue row-*, close-blocked note, settings state, pay sheet) have rows marked "แสดงอย่างเดียว (ไม่มีตัวกด) — แถวตาม qc-pos-p3.4 ST7" with the nearest kind (precedent `pos-settings-card-state-offline`). Alternative: ORACLE-EDIT ST7 to count only interactive testids (F15.3 scanner flag) and drop those 14 rows.
- **CD-P34U-B2 (harness `offline-close-blocked`)**: the guard needs a still-queued bill after the page goes back online; the state answers `POST /api/pos/sync` with `{ok:true, results:[]}` via request interception (every item = keep) — not 4xx/5xx, so no console/5xx noise. Alternative: inject an IDB row (less real).
- Owner-ack (derived screens, P2.8 precedent): offline pay sheet · done card · bills list · Shifts manager queue card · settings live state.

## 5. Visual lane (`visual-pos.mts` wo `p3.4u --states` · pages register shifts settings)
Plan `P34U_PLAN` + `P34U_WO`/`P34U_PAGES` (old plans/states untouched; `offline` + `settings-offline` keep flag off). Each P3.4U job = fresh browser context (closed after the shot), device pinned to the run device `posqc-vis-dev-<pid>` (has the run shift).
Fixture `ensureP34uFixture` (first P3.4U job): flag on via `updatePosOfflineEnabled` (owner) — previous value restored after the last P3.4U job / finally / signal; stale `posqcvisp34u*` REJECTED rows of killed runs discarded (then restore = off). For `offline-rejected` / `settings-offline-live`: `issueOfflineSnapshot` for the run device + one forged-price bill via `syncOfflineSales` (amer −฿10, owner token) → REJECTED `PRICE_MISMATCH` → discarded in cleanup. Per job `prepP34u`: delete the run device's snapshots issued in the last 2 min (route limit 1/device/60 s). Cleanup also deletes the run device's snapshots. Side effect: `offline-sync-back` = 1 real cash bill per shot in the run shift (closed by `closeRunShift` as today).
Dry plans (iso, `CI=1`): owner 26 shots rc 0 · cashier 17 rc 0 · `LOCALE=en` 15 rc 0.

### `--state` list for the controller's QC5 round (run passes one at a time)
`env CI=1 pnpm exec tsx scripts/visual-pos.mts p3.4u --states --user owner --state offline-sale,offline-queue,offline-tenders,offline-sync-back,offline-slip,offline-lock-pin,offline-rejected,offline-close-blocked,settings-offline-live`
`… --user cashier --state offline-sale,offline-queue,offline-tenders,offline-sync-back,offline-slip,offline-lock-pin`
`LOCALE=en … --user owner` (same list as owner) · regression: `p1.3 --states --state offline` + `p1.18u --states --state settings-offline` (flag off = today's pixels).

## 6. Gates (QC4 · never export CI)
- typecheck @91ef77a0 (code = head; later commits ledger/JSON data only): **exit 0 · 0 errors** (iso 8192/10500M · 13:49–13:53Z).
- pos-pre-submit run 1 @b6ecb66a (13:54–14:54Z · logs `/root/pos-runs/presubmit-shark-pos-p11-20261021T135425Z/`):
```
PRESUBMIT-TABLE head=b6ecb66a tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3.4-run1          0    51/51        445  
wo-qc-pos-p3.4-run2          0    51/51         94  
wo-qc-pos-p3.4-nodb          0    15/15          6  
qc-pos-p1.1                  0    180/180      177  
qc-pos-p1.3                  0    128/128      156  
qc-pos-p1.6                  0    48/48         42  
qc-pos-p1.9                  0    53/53         22  
qc-pos-p1.12                 0    72/72         83  
qc-pos-p1.15                 0    40/40         38  
qc-pos-p1.16                 0    28/28         28  
qc-pos-p1.17                 0    40/40          9  
qc-pos-p1.18                 0    81/81         41  
qc-pos-p2.1                  0    55/55         49  
qc-pos-p2.7                  0    42/42         68  
qc-pos-p2.8                  0    61/61        153  
qc-pos-p2.9                  0    62/62        168  
qc-pos-p2.9b                 0    53/53        117  
qc-pos-p2.10                 1    12/13        191  P2.10-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.11                 0    34/34        208  
qc-pos-p2.12                 1    32/33        101  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.13                 0    54/54        109  
qc-pos-p2.14                 1    59/60        113  P2.14-V2
qc-pos-p3.5                  0    55/55         93  
qc-hf-fu                     1    28/29        182  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-tx                     0    22/22        127  
qc-hf-fu2                    1    30/31        153  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6          127  
qc-shop-refund               0    12/12         33  
qc-hotel-money               0    5/5           77  
qc-ticket-money              0    6/6           64  
qc-subscription-money        0    14/14         79  
qc-account-cpa               0    107/107       85  
qc-acc-v2-pos-lines          1    65/79         53  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
fitness-noenv                0    53/53         14  
fitness-qc4                  0    53/53         75  
fitness-pos                  0    8/8            8  
gen-check                    0    -              1  
PRESUBMIT head=b6ecb66a green=31 red=6 expected-lane-pin=4 unexpected-red=qc-pos-p2.14,qc-acc-v2-pos-lines · wo: qc-pos-p3.4-run1=51/51 · qc-pos-p3.4-run2=51/51 · qc-pos-p3.4-nodb=15/15 · VERDICT red (5: qc-pos-p2.10 qc-pos-p2.12 qc-pos-p2.14 qc-hf-fu qc-hf-fu2)
```
- Reds: lane pins (expected, controller re-pins at merge) p2.10 ST2 · p2.12 ST1 · hf-fu ST1 · hf-fu2 ST1 · `qc-acc-v2-pos-lines` 65/79 = manifest **accepted** (no acc-v2 seed in QC4, since P1).
- `qc-pos-p2.14` V2 (unexpected): wo-gated visual constants need a run row in `scripts/pos-visual-sweep.json` → fixed `ad806bfa` (row `p3.4u-offline`); `--no-db` re-check 14/15 — remaining miss `/^p3\.?5u/` is **pre-existing on the base** (P3.5U gate without a sweep row) → CONTROLLER-DECISION B3: add the p3.5u row at the P3.5U visual merge.
- visual `p3.4u --states --dry` (iso, CI=1): owner 26 · cashier 17 · en 15 — rc 0.

## 7. Fix round 1 (R1 + hunt · CD-P34U-R1/R2 · controller B 21 Oct 14:3xZ) — one commit per finding
- **F1** `228e6b86` · `src/lib/modules/pos/offline-sync.ts:242-248,332-334` — inside the CD-P34U-3 block (still one hunk): `SNAPSHOT_MAX_IN_FLIGHT = 3`, process-level counter on `globalThis.__posOfflineSnapshotInFlight` checked **before** `$transaction`; over the cap ⇒ `refuse("RATE_LIMITED")` (existing client backoff); `try { return await db.$transaction(…) } finally { n-- }`. Catalog walk still on `db` (not moved to `tx`).
- **F2** `90630260` · `LockScreen.tsx:73-74,195,258,327` → `use-offline-register.ts:52,285-296` `rememberUnlock` — every online unlock passes `r.role === "STAFF" ? pin : null`; `null` (OWNER/MANAGER) ⇒ verifier **not written and any old one wiped** ⇒ holder null ⇒ existing copy `offline.lock.unavailable` (no new keys). Harness `offline-lock-pin`: cashier = holder flow, owner = `data-state="unavailable"` + asserts no verifier in IDB.
- **F3** `3fde618b` · `use-offline-register.ts:104-105` (flag off ⇒ `forgetOfflineUnlock` every reload) and `:150-151` (`OFFLINE_DISABLED|DEVICE_REVOKED|DEVICE_NOT_FOUND` ⇒ forget + holder null).
- **F4** `2cf09b60` · `shifts/page.tsx:49-56` — S DTO has user ids only ⇒ member load gated: flag on, or `posOfflineSale.count` of open rows (REJECTED · ACCEPTED without sale, same set as `listOfflineRejected`) > 0; names only (no e-mail; nameless = "ไม่ทราบชื่อ").
- **F5** `e615834d` · `RegisterScreen.tsx:1904-1905` — unknown → queue only when Σ `payMethods.amountSatang` == snapshot `grandTotalSatang`; otherwise stays `unknown`.
- **F6** `49f04082` · `use-offline-register.ts:132-162,176-191` — `fetchSnapshot(): Promise<boolean>`; pvu-edge timer: skipped/refused ⇒ exactly one retry at `max(snapNextAt − now, 15 s)`; cleared on unmount/pvu change.
- **F7** `5bb50bd3` · markers `LockScreen.tsx:566,572` (`staffList`) · `shark-ui.tsx:231-233` (pending span + `{pendTotal}`).
- **F8** controller — `p3.4u-offline` sweep row untouched (merge kept upstream `p3.5u-th/en` + this row).
- Merge `1e96ad13` = origin/session/pos `36f2a654` (p3.5u harness fixes, sweep rows, p2.10/hf-fu re-pins, ledger; conflict only in `pos-visual-sweep.json` → union).
- Dry plans (iso, CI=1) @ merge: owner 26 · cashier 17 · en 15 — rc 0.
- Typecheck @7d4a3397 dirty 0: **exit 0 · 0 errors** (15:12Z).
- pos-pre-submit run 2 (last) @7d4a3397 · `P34_LANE=36f2a654` · logs `/root/pos-runs/presubmit-shark-pos-p11-20261021T151300Z/`:
```
PRESUBMIT-TABLE head=7d4a3397 tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3.4-run1          0    51/51        130  
wo-qc-pos-p3.4-run2          0    51/51        140  
wo-qc-pos-p3.4-nodb          0    15/15         65  
qc-pos-p1.1                  0    180/180      163  
qc-pos-p1.3                  0    128/128      305  
qc-pos-p1.6                  0    48/48        176  
qc-pos-p1.9                  0    53/53         63  
qc-pos-p1.15                 0    40/40         77  
qc-pos-p1.17                 0    40/40         62  
qc-pos-p1.18                 0    81/81        149  
qc-pos-p2.1                  0    55/55        164  
qc-pos-p3.5                  0    55/55        102  
qc-hf-fu                     1    28/29        187  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-tx                     0    22/22         69  
qc-hf-fu2                    1    30/31        135  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
fitness-noenv                0    53/53         13  
fitness-qc4                  0    53/53         24  
fitness-pos                  0    8/8            9  
gen-check                    0    -              2  
PRESUBMIT head=7d4a3397 green=17 red=2 expected-lane-pin=2 unexpected-red=- · wo: qc-pos-p3.4-run1=51/51 · qc-pos-p3.4-run2=51/51 · qc-pos-p3.4-nodb=15/15 · VERDICT red (2: qc-hf-fu qc-hf-fu2)
```
- Reds = lane pins only (hf-fu ST1 · hf-fu2 ST1 — controller re-pins at merge); unexpected-red none.

## 8. Fix round 2 — harness only (QC5 round 77d72a69 = 19/58 · controller B 21 Oct 16:3xZ) · `768bae71`
Causes in the QC5 logs (`/root/pos-runs/vis-p34u-qc5-20261021T161045Z/`): (a) owner runs: the first state already had no snapshot because `prepP34u` **spared the fixture's snapshot** of the run device (my bug) ⇒ every load-time `POST /api/pos/sync/snapshot` inside 60 s = 429; (b) all runs: going back online makes the register refetch the snapshot at once (product behaviour, unchanged) inside 60 s of the load-time fetch ⇒ 429 console error (sync-back · slip · close-blocked); (c) `net::ERR_INTERNET_DISCONNECTED` console errors while the harness holds the context offline (queue · lock-pin).
- **Device-code scheme (decision)**: one device for all P3.4U shots = the run device `posqc-vis-dev-<pid>` (it owns the run shift, so `offline-sync-back` still sells exactly 1 real cash bill per shot into the run shift; a per-shot device would need its own shift). Spacing instead: `scripts/visual-pos.mts:6931` `p34uClearSnapRate` (before every P3.4U shot) deletes the run device's snapshots issued in the last 2 min — **no exception for the fixture row any more** (its price evidence is frozen in the payload). It never deletes inside a shot: an unsynced bill needs its own snapshot (`SNAPSHOT_UNKNOWN` otherwise).
- **Reconnect spacing**: `:7095` records `P34U_NET.snapAt` when the shot's snapshot lands in IDB; `:6961` `p34uSpaceBeforeOnline` waits until snapAt + 62 s before `offline-sync-back` (`:7262`) and `offline-close-blocked` (`:7176`) reconnect (+ ~50 s per such shot). `offline-slip` no longer reconnects (`:7247`; the slip HTML is self-contained).
- **Offline whitelist rule**: `:6938-6959` `P34U_NET` reset per job (`:9589`); `p34uOffline(page, on)` is the only P3.4U path that toggles `setOfflineMode` (window closes 1 s after reconnect); console listener `:9625` drops an error only when (P3.4U state) ∧ (harness-held offline window) ∧ text matches `ERR_INTERNET_DISCONNECTED|Failed to fetch` ∧ (resource URL same-origin or empty) — every other console error stays red; count printed in the shot line ("ออฟไลน์กรองแล้ว n") and `offlineSuppressed` in the shot JSON (`:9858`).
- `--state` list unchanged (§5). Gates: dry owner 26 · cashier 17 · en 15 rc 0 (iso, CI=1) · `qc-pos-p3.4 --no-db` 15/15 · `qc-hf-fu --no-db` 3/4 = ST1 lane pin only (`scripts/visual-pos.mts` vs pin 580c6b0a, controller re-pins) · typecheck below.
- Typecheck @3613aef3 dirty 0: **exit 0 · 0 errors** (16:26–16:27Z) — harness compiles.
