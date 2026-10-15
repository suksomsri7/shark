# P2.10 builder notes — จอลูกค้า (จอที่ 2)

Builder (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.10` = `session/pos` **84ffb48b** (HF-FU merge; `origin/session/pos` moved to e6546359 = same code + ledger, merge-base resolves to 84ffb48b) + oracle `wip/pos-p2.10-oracle` e9eeb83f (merge e4c8be5b).
Contract = `ledger/wo-notes/pos-P2.10-oracle.md` names table · brief `pos-brief-P2.10.md` §10 rulings 1–13 · spec `ledger/pos-briefs/pos-spec-P2.10-display.md`.
Run logs: `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p210/runs/` (line 1 of every log = `tree= head= dirty=`).

## Status
- [x] 1 oracle merged (e4c8be5b) · red-before at 84ffb48b forced = **1/12 (Z1)**, ST2·pins green with `P210_BASE=84ffb48b` — same as the oracle's run on 57a8b19a ⇒ `P2.10-red.txt` not appended (`runs/red-base-84ffb48b.log`).
- [x] 2 migration `20261215100000_pos_p210_customer_display` + `pos.prisma` (enum `PosCustomerDisplayStatus` + model) + `scope.ts` `PosCustomerDisplay: sys()` (registry head, beside PosDeposit — same reason as P2.9b deviation 1) + `pos-qc-env` entry (5e2c4082) · `prisma generate` in tree b (own node_modules, ext4 not a bind mount) · **applied on QC4** (`prisma migrate deploy` via qc4.sh + pos gate lock: "Applying migration 20261215100000_pos_p210_customer_display … successfully applied", `runs/migrate-qc4.log`).
- [x] 3 `display-shared.ts` · `display.ts` · `display-actions.ts` · messages `pos.display.{errors,screen,settings}` th/en · `receiptShopHeaderOf` (473b608f) → forced suite 11/12 (only ST2 existence half red).
- [x] 4 `/d` page + actions + `DisplayScreen` + inventory rows (c2365274).
- [x] 5 `use-display-publish.ts` + marked hunks RegisterScreen/InterimPayDialog (9dae2cc4).
- [x] 6 DeviceSettings block + fact live + inventory rows + owner line (db9d7614) · ORACLE-EDIT `qc-pos-p1.18.mts:312` own commit (a37af00e).
- [x] 7 visual harness wo `p2.10` + `POS_PAGES` `display` + `POS_DISPLAY_VIEWPORTS` + spec (d19044d9) · `--dry` rc 0 th + en.
- [x] 8 gates (table below).

## Files / hunks per ruling
| file | what | ruling |
|---|---|---|
| `prisma/migrations/20261215100000_pos_p210_customer_display/migration.sql` | `SET lock_timeout '3s'` · enum via DO-block · `CREATE TABLE IF NOT EXISTS "PosCustomerDisplay"` · unique tokenHash · partial unique (deviceId) WHERE status='ACTIVE' · partial unique (pairCodeHash) WHERE NOT NULL · index (tenantId, unitId, status) — no FK, nothing else touched | 9 |
| `prisma/schema/pos.prisma` | enum + model (no `@relation`) | 9 |
| `src/lib/core/scope.ts` · `scripts/pos-qc-env.mts` | `PosCustomerDisplay: sys()` · `posCustomerDisplay` model entry · `POS_PAGES` + `display` · `POS_DISPLAY_VIEWPORTS` (display 1280×800, ipad-land 1024×768) | 9 · 11 |
| `src/lib/modules/pos/display.ts` | single writer: `enableCustomerDisplay` `pairCustomerDisplay` `revokeCustomerDisplay` `updateCustomerDisplaySettings` `customerDisplayStatus` `publishDisplayState` `readCustomerDisplay` | 1–6 · 9 · 13 |
| `src/lib/modules/pos/display-shared.ts` | types `DisplayState`/`DisplayView`/results · constants (`MAX_DISPLAY_LINES=20`, `MAX_DISPLAY_STATE_BYTES=16384`, `DISPLAY_COOKIE(_OPTIONS)`, TTLs, cadence) · `nextPollMs` · hand-written strict `displayStateSchema` (zod-like `safeParse`, truncation) · `displayCut/FirstName/StampView/EffectivePhase/SeqNow/Baht/Group` · `normalizePairCode` | 1 3 5 9 |
| `src/lib/modules/pos/display-actions.ts` | thin session actions (5) | 2 4 5 |
| `src/lib/modules/pos/receipt.ts` · `receipt-shared.ts` | pure `receiptShopHeaderOf` extracted from `buildReceipt` (same result) + `receiptShopHeader(db, tenant, system, unit)` (header chain incl. book via `account` — kept inside receipt.ts so display.ts never imports account) | §3 header |
| `src/app/(store)/d/page.tsx` · `actions.ts` | public page (`force-dynamic`, robots noindex, no session) · `pairDisplayAction` sets httpOnly cookie · `readDisplayAction` (deletes cookie on DISPLAY_NOT_PAIRED) · `@supports` notice | 1 2 7 |
| `src/components/pos/display/DisplayScreen.tsx` | pair form ↔ display · poll · hidden pause · wake lock · full screen · 11A layout (`xl:` = 1280, base = 1024) | 1 · §9 |
| `src/components/pos/display/use-display-publish.ts` | register publish hook | 5 · 13.2 |
| `RegisterScreen.tsx` | +15 lines, all inside `// POS P2.10 ▸ … ◂` (import · hook call · `onDisplayPay` JSX prop) — 0 removed lines | 5 · 13.6 |
| `InterimPayDialog.tsx` | +22 lines inside markers (type import · optional prop · key + 2 effects) — `resetBill`/`sendingRef` untouched | 5 · 13.6 |
| `DeviceSettings.tsx` | `CustomerDisplayBlock` (end of file, marked) + 1 marked mount line + imports + header comment | R7 · 4 |
| `src/lib/pos-integrations.ts` · `scripts/qc-pos-p1.18.mts:312` | `rewardNearCustomerDisplay` → `true, null` · ORACLE-EDIT (dated, own commit) | 10 |
| `scripts/pos-ui-inventory.json` | 11 rows: `/d` (pair form/code/submit, full screen) · settings (enable, revoke + dialog ×2, show points, idle text, locale) | F15.3 |
| `scripts/visual-pos.mts` | wo `p2.10` plan / fixture / runner / cleanup (signal + finally) | 11 |
| `src/messages/{th,en}/pos.json` | `pos.display.errors` (7 codes + validation + internal) · `screen` · `settings` (en has no Thai) | R8 |
| `ledger/POS-OWNER-PENDING.md` | owner line (old tablets) — append-only | 7 |

Pins: `register*.ts` `service.ts` `tender*.ts` `payment-intent.ts` `held-cart.ts` `outbox-consumers.ts` `proxy.ts` `pos-sale-contract.json` — 0 hunks (ST2·pins green vs merge-base 84ffb48b). No createSale caller, no outbox event, no member/account import in display.ts.

## Design decisions inside the rulings
- **Derived version (13.2)**: `ver = stateSeq.effectivePhase.intentStatus.settingsHash8`; the page sends `sinceVer` (extra optional input) → `changed:false` only when equal. Callers that send only `sinceSeq` (the oracle) get `changed:false` iff `sinceSeq == stateSeq`, the phase did not expire (120 s stale / 20 s done) and the state carries no `intentId` (CD-P210-2's "simplest builder"). `lastPolledAt` = one `updateMany … WHERE lastPolledAt IS NULL OR < now−30 s`.
- **pairFailCount (13.1)**: lock check only (≥ 5 refuses even the right code; enable resets to 0); a wrong code is not attributable to a row ⇒ brute force is bounded by the 10/min/IP limiter (`pos:display:pair:<ip>` in `ChatRateBucket`) + 10-min TTL + 32⁸ space (CD-P210-1 recommendation).
- **QR (6 · 13.4)**: own-device intent (same tenant/system/unit, `deviceId` = device code) → PENDING = intent `qrPayload`; PAID/CONSUMED = status with `payload:null` (display shows ✓ รับเงินแล้ว); EXPIRED/CANCELLED/foreign/no id → PROMPTPAY static `promptpayPayload(unit id → PaymentProfile, roundSatang)` (`status:"STATIC"`, `intentId:null`), other methods → `null`. Receipt URL: sale of the display's unit/system, `createdAt ≥ now−15 min`, its shift's `deviceId` = device code, `qrEReceipt` on → `eReceiptUrl`.
- **Strings (13.5)**: > 80 chars cut to 79 + "…" server-side (first name: first token ≤ 30); > 20 lines cut + `moreCount`; input JSON > 16 384 UTF-8 bytes / unknown key anywhere / bad type → `DISPLAY_STATE_INVALID`. The stored state is the sanitised one (no last name ever stored).
- **seq**: register uses `displaySeqNow` = 100 ms ticks since 2026-01-01 (int4 until ~2032, monotonic across reloads/tabs); server accepts any int 0..2³¹−1 and writes `WHERE stateSeq < seq`.
- **Stamp strip**: hidden without a member (brief §3 "no program/no member").
- **Settings refusal** for bad input = `VALIDATION` (extra code + message key; R8 list has no settings code — oracle drift 3 accepts any refusal).
- **Status DTO** adds `enabled` and `pairLocked` (UI needs them; no code/token/hash ever returned).

## Deviations
1. **Card size** — non-test, non-ledger, non-JSON diff ≈ 2.0 k lines (display.ts 475 · DisplayScreen 474 · display-shared 348 · DeviceSettings +253 · hook 186 · actions 117 · page/actions 87 · receipt +42 · register hunks 37) > the ~1,400 split heuristic of brief §5.7 — not split (single S+U card per ruling "Scope"); controller may ask for a split at review. (ruling scope / §5.7)
2. Extra optional `sinceVer` on `readCustomerDisplay` + `ver` in its result (ruling 13.2 implementation; oracle calls unaffected).
3. Extra refusal code `VALIDATION` (+ `INTERNAL`) with th/en messages (R8 lists 7; ST2 checks those 7).
4. Cookie `Secure` is set as ruled even on `http://127.0.0.1` (Chrome accepts Secure cookies from loopback); the visual harness sets the cookie itself for seeded states (`page.setCookie` with `secure` = https only) and the live/pair states exercise the real action. (ruling 2)
5. `receiptShopHeader` (async, reads the book via `account`) lives in `receipt.ts`, not display.ts — display.ts imports `./receipt` (allowed: ST1 forbids only direct member/account imports). (§3 header chain · §7)

## CONTROLLER-DECISION
- None for pins: every existing `qc-pos-*`/`qc-hf-*` gate below is green; the only edited oracle line is the pre-approved `qc-pos-p1.18.mts:312`.
- Card-size heuristic (deviation 1) — controller's call.

## Fixtures (qc-pos-p2.10 · QC4)
Temp tenants `posqc-p210-<rand>` (+ `-t2`) wiped by the oracle (Z1 residue 0, buckets 0, seed fingerprint unchanged in every run). Visual (CONTROLLER-RUN): device `posqc-vis-p210-<pid>` "เคาน์เตอร์ 1" (revoked in cleanup) · display rows unpaired in cleanup · `display-done` = shift + 1 PAID cash bill ฿625 on that device (bill kept, shift closed counted = expected) · PromptPay ID via P1.7U `ensureQcPromptPay` (restored by `cleanupIntents`) · `display-live` uses the run device `DEVICE_ID` (P1.15U PIN/token seed + owner-opened shift) · bucket `pos:display:pair:posqc-vis-p210-<pid>` deleted.

## `--state` list for the controller (all new — wo p2.10, owner, th + `LOCALE=en`)
`bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p2.10 --states --user owner --base http://127.0.0.1:<port>` (no `--page` = settings + display):
`settings-display-unpaired,settings-display-code,settings-display-online,display-pair,display-idle,display-cart,display-member-stamps,display-paying-promptpay,display-paying-cash,display-paying-card,display-done,display-stale,display-unsupported,display-live`
(display = 1280×800 + 1024×768, en 1280 only; `display-live` 1280 only; settings 1440/1024/390, en 1440). Needs a build of this tip (new page `/d`, new table on QC4 = already migrated).
`qc-hf-pos-page-authz`: **no row added** — that suite pins the guards of `/app/sys/[id]/pos/*` pages; `/d` is a public token page like `/r/[token]` (no session, scope = cookie token).

## Gates
Head under test 3eac2361 for the last row; all other rows a37af00e/d19044d9 (code identical — d19044d9 only adds the visual harness/spec; 3eac2361 only merges ledger). Logs under `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p210/runs/`.
| gate | result | log |
|---|---|---|
| qc-pos-p2.10 forced ×2 | 12/12 · 12/12 rc 0 | g-p210-forced-1.log · g-p210-forced-2.log |
| qc-pos-p2.10 unforced | 12/12 rc 0 (merge-base 84ffb48b) | g-p210-unforced.log |
| qc-pos-p2.10 unforced after merging session/pos 6f5b5fa5 | 12/12 rc 0 (merge-base 6f5b5fa5) | g-p210-after-merge.log |
| qc-pos-p1.10 | 40/40 | g-p110.log |
| qc-pos-p1.11 | 38/38 | g-p111.log |
| qc-pos-p1.18 (after ORACLE-EDIT) | 81/81 | g-p118.log |
| qc-pos-p1.3 | 128/128 | g-p13.log |
| qc-pos-p1.1 | 180/180 | g-p11.log |
| qc-pos-p1.6 | 48/48 | g-p16.log |
| qc-pos-p1.7 | 33/33 | g-p17.log |
| qc-pos-p1.12 | 72/72 | g-p112.log |
| qc-pos-p2.9b | 53/53 | g-p29b.log |
| qc-hf-pos-page-authz | 81/81 (no row added — see above) | g-authz.log |
| qc-hf-tx | 22/22 | g-hftx.log |
| typecheck (full, pos gate lock) | rc 0 (1 full run; scoped tsc per step: tsc-step4/5/6/7.log rc 0, positive control = step-4 first run red TS2339) | typecheck-1.log |
| fitness no-env / env (qc4) | 50/50 · 50/50 | fitness-noenv.log · fitness-env.log |
| fitness-pos | 8/8 (F15.3 933 rows) | fitness-pos.log |
| visual-pos p2.10 --states --dry (CI=1) | rc 0 th (27 shots) · rc 0 en (14) · regression dry: all / p2.9bu / --list / p1.3 cashier rc 0 | visual-dry-th.log · visual-dry-en.log |
| red-before at base | forced 1/12 (Z1) | red-base-84ffb48b.log |


## Fix round 1 (R1 F1–F7 + controller F8 · rulings 1–10 of pos-P2.10-review.md)
Base 7ac9efbe. Commits in order: 8bc606a2 test CT3 · b9519541 red §fix1 · e2c91684 F1 · 54217c15 F2 · 47461b49 F3 · a03770f5 F4 · 38cdeb15 F6 · 409a63eb F7 · 0fc52068 F8 · be57073d test CT3 false-positive fix. Every hunk sits inside `// POS P2.10 ▸ fix1 … ◂`. No pinned file touched, no migration, no messages change.

| Ruling | Files / hunks |
|---|---|
| 8 ORACLE-ADD CT3 | `scripts/qc-pos-p2.10.mts`: registry row + CT3 block after CT2 (marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.10 fix 1)`). Covers (a) firstName = real memberCode (cart + done) ⇒ `""` and the code nowhere in the view, with a positive control for a real name; (b) totals.member kind rows with showPoints=false: POINTS ⇒ generic label without digits, VOUCHER with no label or a code-shaped label ⇒ "คูปอง" and no code in the view. Positive controls: TIER label kept, named VOUCHER kept, POINTS label back with showPoints=true. Suite 12 → 13. be57073d fixed my own false positive: the amount 12_400 contains the substring "1240". The amount is now 6_200 and the digit scan only looks at the labels. |
| 1 F1 | `use-display-publish.ts`: keepalive skips `done` as well as idle. `send(force)` also skips `done`, which covers the paired:false recheck and visibility resends. A done view goes out once, when the view changes, and ages out on the server after 20 s. |
| 2 F2 | `display-shared.ts`: `DISPLAY_MEMBER_CODE_RES` + `displayLooksLikeMemberCode` match the real format from `member/service.ts` randCode (6 chars, or 8 after collisions, from ACDEFGHJKLMNPQRSTUVWXY3-9) plus letter-prefixed numeric imports such as M000123. `parseState` blanks a first name that matches. `use-display-publish.ts` `memberFirstName`: name empty or equal to memberCode ⇒ `""`. `DisplayScreen.tsx` greeting: empty name ⇒ `screen.welcome`; the thanks line already handled an empty name. Side effect: a real all-caps 6-letter name drawn from that alphabet (e.g. "CHARLY") is also blanked. Accepted. |
| 3 F3 | `DeviceSettings.tsx`: the code panel shows whenever `code && left > 0`, including when paired. Refresh clears `code` only when `!pendingCodeExpiresAt`; an already-expired code is kept so the expiry note can show, and that note now shows on paired devices too. |
| 4 F4 | `display-shared.ts`: `DisplayMemberKind` · `DISPLAY_MEMBER_GENERIC_LABEL` th/en (ส่วนลดสมาชิก/คูปอง/บัตรกำนัล) · `DISPLAY_VOUCHER_CODE_RE` · `displayMemberLabel`. `parseTotals` accepts `kind`, and `label` may be missing when `kind` is set. `display.ts` `buildView` renders the labels at read time, so a showPoints change applies at once. View rows stay `{label, satang}`; rows without `kind` keep their label, so CT1 is unchanged. Hook `memberRow`: sends `kind`; a VOUCHER label only when the wallet voucher has a real name; GIFTCARD label empty. **Deviation (extends ruling 4 under ruling 3):** GIFTCARD always shows "บัตรกำนัล", because the wallet label carries the masked card number. |
| 5 F5 | **Accepted as designed, not implemented.** A wholly wrong code cannot be tied to a row, so `pairFailCount` is never incremented in prod. Protection = 10/min/IP + 10-min TTL + 32⁸ code space. `pairLocked` remains the oracle's lock semantic (PA2 sets it directly). |
| 6 F6 | `display.ts` `readCustomerDisplay`: the UPDATE runs only when the loaded `lastPolledAt` is null or ≥ 30 s old. The WHERE guard stays for overlapping polls. |
| 7 F7 | `d/page.tsx`: with a cookie, an SSR read that returns anything other than `DISPLAY_NOT_PAIRED` (or throws) ⇒ `pairedOffline`. `DisplayScreen.tsx` then starts paired with the offline badge and polls immediately. Only `DISPLAY_NOT_PAIRED`, from SSR or a poll, shows the pair form. |
| F8 (controller) | **Cause:** `BROWSER.newPage()` for the register tab turns the display tab `document.visibilityState` to "hidden", and DisplayScreen pauses polling while hidden (by design), so the display kept its idle view. Reproduced headless with the same chromium and args (`/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p210/runs/fix1/vischk.mjs`): display tab visible → hidden after newPage. The register/publish side is not implicated: pairing, read and header were fine in vis82, and the server path is covered by DS/CT/PY. **Fix (harness):** `visual-pos.mts` display-live calls `page.bringToFront()` before the 20 s wait; visibilitychange then triggers an immediate read. **Diagnostics on failure:** `p210LiveDiag` prints the register tab (visibility · `window.__posDisplayPublish` = last seq/phase/ok/paired/written/code · cart lines), the display tab (visibility · data-phase · `window.__posDisplayRead` = last ok/changed/seq/ver/phase · lines), the DB row (stateSeq · stateAt · phase · lines · lastPolledAt) and a direct `readCustomerDisplay`. The hook and screen globals carry status only, no view content. Needs the real UI: controller re-shoot of `display-live` on tree d. |

### Follow-ups (ruling 9 · builder notes, not owner lines)
- Publish accepts a client-claimed `deviceCode` within the unit, so a cashier can drive another counter's display. QR and receipt stay server-derived. Bind publish to the register's heartbeat device later (P2.14).
- `display` in `POS_PAGES` adds 2 pair-form shots to other WOs' no-`--page` runs (accepted).

### CT3 red-before
At 7ac9efbe code (head 8bc606a2 = test commit only), unforced: 12/13, CT3 red. firstName "HVKTXJ" (a real memberCode); the view contained the code; `kind` rows refused as DISPLAY_STATE_INVALID. Recorded in `P2.10-red.txt` §fix1 · log `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p210/runs/fix1/red-ct3.log`.

### Gates (logs under `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p210/runs/fix1/`)
| Gate | Result | Log |
|---|---|---|
| qc-pos-p2.10 forced ×2 + unforced (head be57073d) | 13/13 · 13/13 · 13/13 (Z1 residue 0 · buckets 0 · fpDrift []) | g2-p210-forced-1/-2.log · g2-p210-unforced.log |
| qc-pos-p2.10 at 0fc52068 (before be57073d) | 12/13, CT3 red only on the oracle false positive above | g-p210-*.log |
| qc-pos-p1.18 · p1.3 · p1.10 · p1.12 | 81/81 · 128/128 · 40/40 · 72/72 | g-p118 · g-p13 · g-p110 · g-p112 |
| typecheck (full, 1 run, head 0fc52068) | 0 errors | typecheck.log |
| single-file tsc of the changed files incl. qc-pos-p2.10 (head be57073d) | rc 0 | tsc-files.log |
| fitness no-env / env (qc4) | 50/50 · 50/50 | fitness-noenv.log · fitness-env.log |
| visual-pos p2.10 --states --dry (CI=1) th / en | rc 0 (30 shots) / rc 0 (30) | visual-dry-th.log · visual-dry-en.log |
| fetch origin/session/pos | 6f5b5fa5 = already merged (no move) | — |

### `--state`s for the controller to re-shoot (tree d, after this push)
`display-live` (F8), `display-done` (F1/F2), `display-member-stamps` and `settings-display-code`. **There is no paired variant of `settings-display-code`.** The state enables a device that is not yet paired, so F3 (code panel on a paired device) can only be checked by hand: `settings-display-online` → "ขอรหัสใหม่". F7 (SSR read failure ⇒ offline + polling) has no state either.
