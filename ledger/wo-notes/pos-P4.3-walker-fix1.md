# P4.3 walker fix round 1 — R registry · H harness/fixtures (builder, account A · 23 Oct 2026 · written 23:2xZ)

Brief: `ledger/pos-briefs/pos-prompt-accountA-P4.3-WALKER-FIX1.md` (controller tree) · source of truth: `ledger/wo-notes/pos-P4.3-triage.md` §7 (session/pos 4c66c727).
Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.3-walker` · base 77de6002 (walker code = tree d @89631a81, `git diff 89631a81 77de6002 -- scripts/qc-pos-buttons.mts scripts/pos-buttons-fixtures.mts` empty, so the §7 line numbers applied as-is).
Commits: 2785f6e0 registry · 2fcfa99c fixtures · 7f36d98a walker · this note. scripts/ + ledger/ only · no build/serve/QC5 · QC4 read-only (pre-flight).
Line refs below: **w:** = `scripts/qc-pos-buttons.mts` · **fx:** = `scripts/pos-buttons-fixtures.mts` · at 7f36d98a. Registry hash after: **c0ab85d696f4bb29**.

## R — registry (`scripts/pos-ui-inventory.json`)

| id | row | change | rule | probe | verbatim? |
|---|---|---|---|---|---|
| R1 | register#pos-reg-bill-type | `expect.anyOf [{toast, pos-reg-toast}]` | CD-P42-R8 | `--list` row press · H3 watcher feeds the anyOf fallback (w:1438) so the 4 s toast is not missed | yes (+ w:1438 so it can actually pass) |
| R2 | register#pos-lock-submit | `expect.anyOf [{inline-error, pos-lock-message}]` | CD-P42-R8 | `--list` press · non-money ⇒ anyOf rescue path | yes |
| R3 | register#pos-reg-held-discard-* | **not in registry** — fx:369 `SELF_CLICK_FIRST` + w:1134 tap-then-press | – | p4.1 R3 red with the §7 opener; gate B10 "R3/R4 SELF_CLICK_FIRST" | **no** (see Deviations 1) |
| R4 | stock#pos-stock-qty-* | **not in registry** — same table; tap finds the button unfiltered, re-find by the exact testid with H12 tags (w:1134-1150) | – | same | **no** (Deviations 1) |
| R5 | sales#pos-bills-date-next | `opener ["pos-bills-date=2026-10-01"]` | CD-P42-R6 | `--list` press | yes |
| R6 | sales#pos-bills-page-* | `expect {ui, pos-bills-page-*, selected, note}` (needs unchanged) | walker contract "ui selected = no dead check" · CD-P43-W1 | `--list` press · w:1329 | yes (+ w:1329, Deviations 2) |
| R7 | settings#pos-device-card-* | `expect {ui, pos-device-card-*, selected, note}` | same | same | yes (+ w:1329) |
| R8 | settings#pos-settings-api-create-submit | opener `+ "pos-settings-api-unit-*=on?"` · `expect.resultTarget pos-settings-api-raw` | CD-P42-R11 | `--dry` "ขั้นไม่บังคับ ? 1" · plan verify db | yes (stale needs text kept — Deviations 5) |
| R9 | settings#pos-channel-creds-webhook-copy | opener `["pos-settings-nav-channels","pos-channel-open-lineman"]` · needs added | CD-P42-R7/R11 | `--list` press | yes |
| R10 | shifts#pos-print-drawer-open · tables#pos-tbl-qr-sheet-print | oracle `P1.10-E2` · oracle `P4.3-S5` | CD-P42-R13 · P4.2 W6 | plan: drawer `skip external · oracle P1.10-E2` ✅ · QR `skip external · ไม่มี oracle id ที่มีจริง (P4.3-S5)` until the oracle lane merges | yes (QR id cited ahead of the oracle lane) |
| – | sales#pos-bills-accounting-link · settings#pos-settings-account-link | not touched ("after P2 is fixed" = product round) | – | – | by brief |

## H — walker / fixtures

| id | change | where | probe | verbatim? |
|---|---|---|---|---|
| H1 | type `{ delay: 45 }` · `sleep(60)` · `press(ENTER_SUBMIT.has(testid) ? "Enter" : "Tab")` | w:595-598 · `ENTER_SUBMIT` w:549 | tsc · reading | yes |
| H2 | `/-(scrim|backdrop|overlay)$/` ⇒ `el.click({ offset: { x: 4, y: 4 } })` | w:1245 | puppeteer-core 24.43.1 supports `offset` | yes |
| H3 | watcher started after `PRESSED_ONCE.add` (watchT = resultTarget · target · VIS anyOf) · VIS check w:1369 · resultTarget w:1429 · **anyOf fallback w:1438** · stopped before money/rec (w:1449), on the dead path and in `finally` | w:1251-1276 | tsc · reading | yes + anyOf fallback + handle dispose (Deviations 3) |
| H4 | disabled gate after the F13 block | w:1173-1184 | tsc | **narrowed** (Deviations 4) |
| H5 | search regex above the money regex in fillValueFor · w:1500 `!isSearchLike(...)` as §7 + w:1502 explicit `dirty` for search rows | w:531 · w:1500-1502 | tsc | yes + explicit dirty (3 search rows have ui appears/none ⇒ would otherwise push to openChain, not reload) |
| H6 | `for (const k of ["manager","cashier"]) await ensurePersona(c, k)` · preflight checks both personas for any staff cell | fx:981-982 · fx:1192-1193 | pre-flight QC4: persona-manager/cashier rows printed for the default (all users) run | guard `user !== "public"` dropped — already inside `if (user !== "public")`, tsc TS2367 |
| H7 | `if (t === "pos-stock-scan") return "PQC-CF-LATTE"` (seed SKU pos-qc-env.mts:279) + Enter | w:513 · w:549 | grep seed | yes |
| H8 | SIDE_EFFECT_KEYS `shifts#pos-shift-close-submit` · resetSideEffects label === SHIFT_CLOSE_KEY ⇒ `ensureDeviceShift(c)` | fx:359-360 · fx:757-761 | gate B10 "H8/H11 ช่วงท้าย" · `--dry` tail rows 9 (manager) | yes + ensureDeviceShift made re-entrant (fx:839 PIN row remembered once · fx:850 token issued once) — a second call would otherwise push the walker PIN as the "original" and restore it at the end |
| H9 | alertsNow filter `&& !e.closest('[data-testid="pos-settings-api-raw"]')` | w:614-618 | reading | yes |
| H10 | PREFILL skips pos-ord-man-conv / -party | w:805 | reading | yes |
| H11 | SIDE_EFFECT_KEYS `kds#pos-kds-pause` · reset step "พักครัว": RestaurantSetting.kitchenPaused of posqc-btn-unit ⇒ `kdsSetKitchenPause(paused:false)` (P5.2 D11 writer), fallback `updateMany` | fx:361-362 · fx:746-756 | gate B10 | yes (runs after every tail row, residue sweep and end of run; acts only when paused) |
| H12 | `findVisible(…, onlyTags)` · `rowTags(it)` = INPUT/TEXTAREA/SELECT for **wildcard** input/textarea/select rows | w:725-729 (reveal) · prefill refresh | src scan (below) | **narrowed** to wildcard rows (Deviations 6) |
| H13 | clickEl: non-pressable container without its own click handler that has pressable children ⇒ click `a[href]:not([aria-current="page"]), button:not([disabled])` | w:469-484 | reading | yes + "no own click handler" guard (a clickable card with buttons inside keeps the centre click) |
| H14 | `ensureApprovalPolicy` (name "QC P4.3 ตัวกด ส่วนลดเกินสิทธิ์ (posqc-btn)", POS_DISCOUNT_OVER, unit posqc-btn-unit, system POS, step 1 MANAGER, `createPolicy`) · cleanup: delete, or `active=false` when an ApprovalRequest refers to it (no FK; keeps the request readable) · preflight line | fx:927-946 · fx:984 · fx:1040-1050 · fx:1222-1226 | pre-flight QC4: `would-create approval-policy-discount-over` | scoped to posqc-btn-unit (not tenant-wide) so other QC suites on the tenant see no new policy |
| H15 | console: skip `Failed to load resource` whose `location().url` host ends with `.example.com` | w:1008-1017 | reading | yes |
| H16 | writesOf tags `AppSystem … settings.pos.<k>` rows with paths (`posSettingsPaths`: `{a, b}` lists · `<unitId>` → posqc-btn-unit · other `<x>` cut) · db check uses `posSettingsChanged` (settings.pos.<k> now vs `_qcP42Before` snapshot) instead of `writtenSince` | fx:1064-1086 · fx:1093 · w:1416-1419 | gate B10 "H16 settings.pos" (4 parse cases + writesOf on board-create) | yes |
| H17 | – (phase-B observation, not in scope) | – | – | – |

## Deviations from §7 (with the code)

1. **R3/R4 not in the registry.** Applying `"pos-reg-held-discard-*=click"` / `"pos-stock-qty-*=click"` made `qc-pos-p4.1 --no-db` red 15/16: `P4.1-R3 … pos-reg-held-discard-*: opener ชี้ตัวเอง · pos-stock-qty-*: opener ชี้ตัวเอง` (qc-pos-p4.1.mts:428 `else if (id === t)`). No ORACLE-EDIT in this card ⇒ the same behaviour is a walker table: fx:369 `SELF_CLICK_FIRST` (2 rows) and w:1134 — after reveal, tap the found element once (unfiltered lookup, so the "นับ" button is found), settle, re-find by its exact `data-testid` (H12 tags after the tap), then the normal press. Registry openers of both rows unchanged. **Decision:** keep the table, or ORACLE-EDIT p4.1 R3 to allow a trailing `<self>=click` step and move both into the registry (then delete the table).
2. **R6/R7 pressed-element check (w:1329).** With several devices in posqc-btn-unit (one per persona), the pattern lookup after the press returns another, unselected card and `state: selected` fails — exactly what the row's old note warned (DeviceSettings.tsx:310-318). When the target equals the row's own pattern, uiNow checks the pressed element (`el`, if still connected); otherwise the old lookup.
3. **H3 extras.** The anyOf fallback (w:1438) also reads `seen` — R1's toast hides after 4 s, long before the fallback runs (uiNow waits 5 s first). Watcher handles are disposed; the watcher is stopped on every exit (finally).
4. **H4 narrowed.** §7 gates every `isDisabled` (disabled **or aria-disabled**). Cashier `register#pos-reg-custom-item` is `aria-disabled` + tap shows `errors.needPriceOverride` in pos-reg-toast (SearchRow.tsx:73-77) and was **ok** in phase A via anyOf; the verbatim gate would make it dead (row has no needs). Gate = native `disabled`, or aria-disabled when no toast/inline-error expectation exists.
5. **R8 needs text** still says the shared opener cannot tick a unit — now stale (the `?` step does it). Left verbatim (§7 does not touch needs); suggest rewording in the next registry round.
6. **H12 narrowed to wildcard rows.** src scan of input/textarea/select rows whose testid also sits on another tag: exact row `sales#pos-sales-unit-all` (kind select) is an `<option>` — a strict filter would make it unfindable. Every wildcard row has a real input match (others are prefix neighbours: spans/buttons). `pos-prod-drawer-cell-*-*` read-only `ViewCell` div is no longer pressed (not found instead of static/dead).
7. **H6 guard** dropped (tsc strict TS2367: `user` is already narrowed to staff there).

## Self-verification (no server · no build · no QC5)

- strict single-file tsc of the 3 scripts (`tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --resolveJsonModule --lib es2022,dom,dom.iterable --types node`) → exit 0 (first run caught TS2367 → Deviations 7).
- walker gate (no args) **10/10** (B1–B10; B10 + H16 / SELF_CLICK_FIRST / H8-H11) · registry 1250 rows, hash c0ab85d696f4bb29.
- `--dry --user manager --device desktop --page all` exit 0 · keyProblems 0 · manager-desktop 1169 rows (press 965 · absent 120 · visible 30 · skip 54 = dead-known 7 · external 28 · needs-persona 19) · tail rows 9 · optional "?" steps 1 · anyOf 34 · matrix 19 cells.
- `--list --locale th --user manager --device desktop` per page: register 302 · sales 98 · settings 291 · shifts 49 · tables 111 · stock 63 · kds 27; every touched row present: bill-type / lock-submit / held-discard-* / stock-qty-* / stock-scan / bills-date-next / bills-page-* / device-card-* / api-create-submit / webhook-copy / kds-pause = press · shift-close-submit = press (money) · drawer-open = skip external (oracle P1.10-E2) · qr-sheet-print = skip external (P4.3-S5 not yet an id).
- `qc-pos-p4.2 --self-test` **12/12** (all probes red-as-expected) · `qc-pos-p4.1 --no-db` **16/16** (baseline 16/16 at 77de6002).
- `pos-oracle-check.sh … qc-pos-p4.2 --base 77de6002` → VERDICT warn (red 0 · warn 1 = O3 PIN default bb7b0b2b ≠ base; oracle file untouched, pre-existing).
- fixture pre-flight on QC4 via qc4.sh + `/tmp/shark-gate-pos.lock` + with-gate-lock: 🟢 no blocks · warn 1 (db-host QC4) · ok 21 · would-create 20 (incl. both personas + approval-policy-discount-over) · missing 5 · "ไม่มีการเขียน" (findFirst/count only).
- pre-commit fitness green on every commit.

## For the controller
- R3/R4 ruling (Deviations 1).
- `P4.3-S5`: `readDbCheckIds` (qc-pos-p4.1.mts:239, used by P4.2 W6 and the walker) **skips D-group "S"/"P" ids** — if the oracle lane registers P4.3-S5 as a static (S) check, the QR row stays "external without an oracle id" even after merge. Register it with group "-" (as P1.10-E2) or rule an exception.
- P4 (chat-link.ts updatedAt) no longer shows in the walker: H16 compares settings.pos.chat itself; the product bug stays for the product round.
- H16 is stricter: a settings save that writes the same value as before is now wrongExpect ("ไม่ต่างจากก่อนกด"), where updatedAt used to pass it.
