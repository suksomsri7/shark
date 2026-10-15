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
Head under test 3eac2361 for the last row; all other rows a37af00e/d19044d9 (code identical — d19044d9 only adds the visual harness/spec; 3eac2361 only merges ledger). Logs under .
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

