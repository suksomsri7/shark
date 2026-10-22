# P4.2 walker — `scripts/qc-pos-buttons.mts` + `scripts/pos-buttons-fixtures.mts` + oracle `scripts/qc-pos-p4.2.mts` (walker writer · account B · 22 Oct 2026 07:01–07:3xZ UTC)

Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.2-walker` · base `537195ad` (P4.1 oracle head). Prompt `ledger/pos-briefs/pos-prompt-accountB-P4.2-WALKER.md` · brief `pos-brief-P4.md` §4 (P4.2 · money policy ⚠️6) · §10 rulings 4 5 6 7 9 + addendum W29 W30 · P4.1 notes CD-P41-O1…O12.
Scripts + ledger only. No `src/` edits · `visual-pos.mts` untouched · only `--list` / `--dry` / gate mode / read-only QC4 pre-flight were run (no build, no server, no QC5, no real pass).

## Commits
| SHA | What |
|---|---|
| `0aabb2f3` | `scripts/pos-buttons-fixtures.mts` — (1) pure layer: registry reader · P4.1 rules borrowed from `qc-pos-p4.1.mts` (CD-P42-W1) · `PASS_MATRIX` · `cellRows` · `classify`/`planCell` · skip vocabulary · (2) QC5 fixtures (`posqc-btn-unit` · personas · device · PIN · staff token · shift · `settings.pos._qcP42Before`) · (3) read-only `--preflight` |
| `07001c7d` | `scripts/qc-pos-buttons.mts` — walker: `--list` · `--dry` · gate mode (no `--base`) · real pass (CONTROLLER-RUN, one cell) |
| `2599e18c` | walker summary records `oracleIdsHash` (freshness of the db/oracle verify plan — W3) |
| `46397411` | `scripts/qc-pos-p4.2.mts` (W1–W10 + Z1) + `pos-gates.json` rows `qc-pos-buttons` and `qc-pos-p4.2` (both `unforced`) |
| (this) | these notes |

## Design
- **One cell per invocation** (ruling 9): cell = user × device × locale. The walker opens every registry page of the cell as that user on the QC5 build served at `--base`, walks the `opener` chain (registry testids only, `=value` steps as in the CRM presser), finds the control (exact testid → first visible twin; pattern → first visible clickable match not owned by another registry row), asserts visibility/enabled state and presses it by `kind`/`safety`/`expect`.
- **Classifier (pure, shared by walker + oracle)** `classify(row, cell)`:
  - user ∉ roles ∪ hiddenFor → `skip(no-role-claim)` · user ∈ hiddenFor → **absent** (visible = `hiddenLeak`) · `kind notice` / ui `refused` / ui `disabled` → **visible** check only;
  - `safety external` → `skip(external)` (never pressed; detail = the oracle id or "no valid id" — oracle W6 reds the latter);
  - P4.1 money/external/counter detector hits but the row has no `safety` → `skip(missing-safety)` (**fail-closed**: the 22 money rows of today are never pressed outside the policy);
  - no target (and not ui+state / not a ui fill) → `skip(missing-target)` · mutation without well-formed `db` and without a real oracle id → `skip(missing-db)` (R1/R2 gaps);
  - `safety money|counter` → press **once per run**, **only in unit `posqc-btn-unit`** (cart fixture first on the register page), then the PosSale/PosPayment/PosPaymentIntent/PosDeposit/PosCashMovement/PosShift rows written since the press must all be in that unit (else `error money-outside-btn`).
- **Press/assert** (port of `qc-crm-buttons.mts`): click (DOM-click fallback, protocol links neutralised) · fill (typed fixture values by testid/input type, value must change) · `form|filter` → `requestSubmit()` · PREFILL of empty sibling fields in the same form/dialog/sheet before mutation/download/form rows · **dead** = 3 s without DOM mutation, navigation, request, new tab, download or value change · `modal|toast|inline-error` → target visible ≤ 6 s · `navigate` → URL matches target (+ main-frame HTTP < 400) · `ui` → appears / disappears / changes / count / selected / unchanged · `download` → bytes · `mutation` → non-GET fired, no ≥ 400, no new `role=alert`/`*-error`, then **db** (read-only prisma: a row of each named model of the tenant created/updated since the press, DB clock; delete = count drops) or **oracle** (the id exists in a `qc-pos-*` `--list`; suites are never run) + `resultTarget`/testid target visible.
- **Per row**: console errors, hydration (`Hydration…` · React #418/#423/#425), 5xx, horizontal overflow (html/body/main, once per URL) like `visual-pos.mts`. Shots only on non-ok rows: `.qc-shots/pos/buttons/<page>/<testid>-<user>-<device>[-en].png`.
- **Output**: `.qc-shots/pos/buttons/summary-<user>-<device>[-en].json` (head · base · dbHost · registryHash · p41Sha · oracleIdsHash · cell · unit · totals · perReason · consoleErrors · hydration · overflow · http5xx · moneyPresses · restores · fixtureLog · pages · rows[] one per cell row) + `JSON_SUMMARY {total, passed=ok, ok, dead, wrongExpect, hiddenLeak, skip, error, perReason, consoleErrors, hydration, overflow, moneyPresses, restoreFailures, fatal}`.
- **Safety of a real pass**: refuses unless DB host is QC5 (`ep-fragrant-thunder`) and tenant = `posqc-coffee-tenant` (constant) · under `with-gate-lock.sh` (`SHARK_GATE_LOCK_MARKER=1`) · `CI` unset · pre-flight has no block · `globalThis.fetch` limited to `--base` · sessions (UA `qc-pos-buttons`) and the chromium profile deleted in finally + SIGINT/SIGTERM/SIGHUP · settings.pos restored exactly after every writing row + finally + signal.
- **Gate mode** (no `--base`, no `--dry/--list` — what `pos-gates-all.sh` / qc:all run): static self-test, no browser, no DB — B1 registry + borrowed rules · B2 plan covers every cell row exactly once (19 cells) · B3 no external / no un-safetied money row planned as press · B4 R3/R9 key shapes · B5 fail-closed classifier cases (6) · B6 writer DB guard (QC4 refused, QC5 + QC tenant passes, other tenant refused) · B7 info (registry gaps). Today **7/7**.

## Pass matrix (19 cells · ruling 6) + time estimate
th = owner|manager|cashier × desktop 1440×900 | ipad 1024×768 | mobile 390×844 (9) · en = staff × desktop (3) + staff × mobile on EN_MOBILE pages register/sales (3) · public = desktop + mobile × th|en (4; en mobile = /r /d /q only — /developers/pos is not an EN_MOBILE page; no ipad for public). Estimate = 6 s/press · 3.5 s/absent · 3 s/visible · +90 s/pass (CRM run6 ≈ 4.4 s/row).

| cell | rows | plan today | ≈ h:mm |
|---|---|---|---|
| owner-desktop | 1096 | press 859 · skip 237 | 1:27 |
| owner-ipad | 1096 | press 859 · skip 237 | 1:27 |
| owner-mobile | 1096 | press 859 · skip 237 | 1:27 |
| manager-desktop | 1096 | skip 1054 · press 29 · absent 13 | 0:05 |
| manager-ipad | 1096 | skip 1054 · press 29 · absent 13 | 0:05 |
| manager-mobile | 1096 | skip 1054 · press 29 · absent 13 | 0:05 |
| cashier-desktop | 1096 | press 461 · skip 182 · absent 453 | 1:14 |
| cashier-ipad | 1096 | press 461 · skip 182 · absent 453 | 1:14 |
| cashier-mobile | 1096 | press 461 · skip 182 · absent 453 | 1:14 |
| owner-desktop-en | 1096 | press 859 · skip 237 | 1:27 |
| owner-mobile-en | 387 | press 298 · skip 89 | 0:31 |
| manager-desktop-en | 1096 | skip 1054 · press 29 · absent 13 | 0:05 |
| manager-mobile-en | 387 | skip 385 · press 2 | 0:02 |
| cashier-desktop-en | 1096 | press 461 · skip 182 · absent 453 | 1:14 |
| cashier-mobile-en | 387 | press 268 · skip 81 · absent 38 | 0:31 |
| public-desktop | 60 | skip 60 | 0:02 |
| public-desktop-en | 60 | skip 60 | 0:02 |
| public-mobile | 60 | skip 60 | 0:02 |
| public-mobile-en | 58 | skip 58 | 0:02 |

**Today ≈ 12:16 h for all 19 cells** (sequential, one at a time). Once the P4.1 builder fills the registry, today's 1,612 gap skips become presses and manager rows gain claims: upper bound ≈ 20–24 h (th 9 × ≈ 1:45 · en desktop 3 × ≈ 1:45 · en mobile 3 × ≈ 0:40 · public 4 × ≈ 0:06). Brief §5 budgeted 6–9 h — see CD-P42-W10 for a cheaper money/size policy if the controller wants it.

## `--list` counts per cell (head `46397411`, registry hash `dd262fb8725dd929`, 1,156 rows = 1,096 staff + 60 public)
`bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-buttons.mts --list` → `JSON_SUMMARY total 14551` (= Σ cellRows; oracle W10 compares every cell)
```
owner-desktop         1096 · press 859 · skip 237 · skip: missing-target 103 · missing-safety 31 · missing-db 102 · not-pos-page 1
owner-ipad            1096 · press 859 · skip 237 · skip: missing-target 103 · missing-safety 31 · missing-db 102 · not-pos-page 1
owner-mobile          1096 · press 859 · skip 237 · skip: missing-target 103 · missing-safety 31 · missing-db 102 · not-pos-page 1
manager-desktop       1096 · skip 1054 · press 29 · absent 13 · skip: no-role-claim 1040 · missing-target 11 · not-pos-page 1 · missing-db 2
manager-ipad          1096 · skip 1054 · press 29 · absent 13 · skip: no-role-claim 1040 · missing-target 11 · not-pos-page 1 · missing-db 2
manager-mobile        1096 · skip 1054 · press 29 · absent 13 · skip: no-role-claim 1040 · missing-target 11 · not-pos-page 1 · missing-db 2
cashier-desktop       1096 · press 461 · skip 182 · absent 453 · skip: missing-target 54 · missing-safety 26 · missing-db 32 · no-role-claim 69 · not-pos-page 1
cashier-ipad          1096 · press 461 · skip 182 · absent 453 · skip: missing-target 54 · missing-safety 26 · missing-db 32 · no-role-claim 69 · not-pos-page 1
cashier-mobile        1096 · press 461 · skip 182 · absent 453 · skip: missing-target 54 · missing-safety 26 · missing-db 32 · no-role-claim 69 · not-pos-page 1
owner-desktop-en      1096 · press 859 · skip 237 · skip: missing-target 103 · missing-safety 31 · missing-db 102 · not-pos-page 1
owner-mobile-en        387 · press 298 · skip 89 · skip: missing-target 51 · missing-safety 24 · missing-db 14
manager-desktop-en    1096 · skip 1054 · press 29 · absent 13 · skip: no-role-claim 1040 · missing-target 11 · not-pos-page 1 · missing-db 2
manager-mobile-en      387 · skip 385 · press 2 · skip: no-role-claim 378 · missing-target 7
cashier-desktop-en    1096 · press 461 · skip 182 · absent 453 · skip: missing-target 54 · missing-safety 26 · missing-db 32 · no-role-claim 69 · not-pos-page 1
cashier-mobile-en      387 · press 268 · skip 81 · absent 38 · skip: missing-target 38 · missing-safety 21 · missing-db 13 · no-role-claim 9
public-desktop          60 · skip 60 · skip: no-role-claim 60
public-desktop-en       60 · skip 60 · skip: no-role-claim 60
public-mobile           60 · skip 60 · skip: no-role-claim 60
public-mobile-en        58 · skip 58 · skip: no-role-claim 58
```

## `--dry` owner / desktop / all
`bash scripts/iso.sh env CI=1 pnpm exec tsx scripts/qc-pos-buttons.mts --dry --user owner --device desktop --page all` → exit 0 · key shapes ✅ (opener 0 · needs 0 · viewport 0 · safety 0 rows today)
```
── แผนช่อง owner-desktop · หน้า all: 1096 แถว · press 859 · skip 237 ──
  ⏭️   103 × missing-target — R1 gap · e.g. pos-reg-tax-invoice, pos-stock-*-search-hit-*, pos-bills-date-prev, pos-bills-date-next
  ⏭️    31 × missing-safety — P4.1 detector hit, no safety (fail-closed) · e.g. pos-reg-paydlg-form, pos-reg-paydlg-confirm, pos-reg-paydlg-retry, pos-shift-move-submit …
  ⏭️   102 × missing-db — R2 gap · e.g. pos-reg-hold-confirm, pos-reg-hold-dialog, pos-reg-held-recall-*, pos-reg-held-discard-*
  ⏭️     1 × not-pos-page — pos-kds-legacy-open (/app/u/[unitSlug]/restaurant/kds · P4.1 observation)
  💰 money/counter to press (unit posqc-btn-unit · once per run): 0   (all money rows are missing-safety today)
  🛡️ external (never pressed · cite oracle): 0                         (external rows are missing-safety today)
  pages: register 303 · shifts 46 · reports 21 · stock 61 · products 76 · sales 84 · settings 256 · close 1 · products/price-rules 28 · tables 111 · orders 77 · kds 29 · legacy kds 1 · reports/print 2
  fixture (real pass · QC5): unit posqc-btn-unit (find-or-create · link POS INVENTORY ACCOUNT MEMBER POINT) · user = QC owner · device posqc-btn-dev-owner · random PIN (never printed) · shift float ฿1000 (closed counted = expected at the end) · settings.pos → _qcP42Before
```
Full log: scratchpad `p42/dry-owner-desktop.log` · plan file `.qc-shots/pos/buttons/plan-dry-owner-desktop.json`.

## Fixture preconditions — read-only pre-flight on QC4 (07:19–07:21Z)
`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight` → exit 0 · `JSON_SUMMARY {total 45, blocks 0, ok 20, would-create 19, missing 5, warn 1}` · **no write** (find/count only; writers refuse QC4 by host — gate B6 proves it). QC4 is the oracle DB: nothing was created there; the controller re-runs the same command through `qc5.sh` before the first pass.
```
PF warn         db-host                            ep-frosty-lab-aoylqlv8-pooler.c-2.ap-southeast-1.aws.neon.tech (QC4 — อ่านอย่างเดียว · fixture จะปฏิเสธการเขียน)
PF ok           tenant-guard                       T.tenantId=posqc-coffee-tenant (ค่าคงที่ posqc-coffee-tenant)
PF ok           tenant-row                         posqc-coffee-tenant slug pos-qc-coffee
PF ok           system-POS                         posqc-coffee-sys-pos type POS (linkUnit ต้องมีระบบ)
PF ok           system-INVENTORY                   posqc-coffee-sys-inv type INVENTORY (linkUnit ต้องมีระบบ)
PF ok           system-ACCOUNT                     posqc-coffee-sys-acc type ACCOUNT (linkUnit ต้องมีระบบ)
PF ok           system-MEMBER                      posqc-coffee-sys-member type MEMBER (linkUnit ต้องมีระบบ)
PF ok           system-POINT                       posqc-coffee-sys-point type POINT (linkUnit ต้องมีระบบ)
PF ok           owner-membership                   role OWNER unitAccess ["*"] (registerDevice/setStaffPin/openShift/closeShift actor)
PF ok           cashier-permissions-source         role STAFF permissions {"pos.sale.create":true,"member.customer.read":true} (สำเนาให้แคชเชียร์ตัวกด)
PF would-create btn-unit                           posqc-btn-unit slug pos-qc-btn type SHOP (prisma.businessUnit.create · CD-P42-W5)
PF would-create link-POS                           linkUnit(posqc-coffee-tenant, posqc-coffee-sys-pos, posqc-btn-unit)
PF would-create link-INVENTORY                     linkUnit(posqc-coffee-tenant, posqc-coffee-sys-inv, posqc-btn-unit)
PF would-create link-ACCOUNT                       linkUnit(posqc-coffee-tenant, posqc-coffee-sys-acc, posqc-btn-unit)
PF would-create link-MEMBER                        linkUnit(posqc-coffee-tenant, posqc-coffee-sys-member, posqc-btn-unit)
PF would-create link-POINT                         linkUnit(posqc-coffee-tenant, posqc-coffee-sys-point, posqc-btn-unit)
PF would-create persona-manager-user               posqc-btn-user-manager pos-qc-btn-manager@shark.local (user.upsert)
PF would-create persona-manager-membership         membership.upsert posqc-btn-mb-manager MANAGER unitAccess [posqc-btn-unit]
PF would-create persona-cashier-user               posqc-btn-user-cashier pos-qc-btn-cashier@shark.local (user.upsert)
PF would-create persona-cashier-membership         membership.upsert posqc-btn-mb-cashier STAFF unitAccess [posqc-btn-unit]
PF would-create device-owner                       posqc-btn-dev-owner registerDevice (ACTIVE 0/3 ของสาขา)
PF would-create pin-owner                          setStaffPin posqc-coffee-user-owner (owner actor · สุ่ม 6 หลัก · ไม่พิมพ์ค่า)
PF would-create shift-owner                        openShift float 100000 → closeShift นับตรงยอดตอนจบ
PF would-create device-manager                     posqc-btn-dev-manager registerDevice (ACTIVE 0/3 ของสาขา)
PF would-create pin-manager                        setStaffPin posqc-btn-user-manager (owner actor · สุ่ม 6 หลัก · ไม่พิมพ์ค่า)
PF would-create shift-manager                      openShift float 100000 → closeShift นับตรงยอดตอนจบ
PF would-create device-cashier                     posqc-btn-dev-cashier registerDevice (ACTIVE 0/3 ของสาขา)
PF would-create pin-cashier                        setStaffPin posqc-btn-user-cashier (owner actor · สุ่ม 6 หลัก · ไม่พิมพ์ค่า)
PF would-create shift-cashier                      openShift float 100000 → closeShift นับตรงยอดตอนจบ
PF ok           session-secret                     มี (issueStaffToken · ไม่พิมพ์ค่า) — ต้องตรงกับของเซิร์ฟเวอร์ QC
PF ok           settings-residue                   ไม่มีซาก _qcP42Before
PF ok           settings-registerV2                settings.pos.registerV2=true (ปิด = หน้าขายเดิม W29 · แถวหน้าขายใหม่จะไม่ขึ้น)
PF ok           settings-offline                   settings.pos.offline.enabled=undefined (เปิด = หน้าขายดึง snapshot ตอนโหลด · ตัวกดเว้น ≥ 61 วิต่อเครื่อง)
PF ok           settings-shift-required            settings.pos.shift.requiredRegister=undefined (ตัวกดเปิดกะของตัวเองเสมอ)
PF ok           cart-products                      สินค้าทุกสาขาราคาบวก 6 รายการ (ตะกร้าของแถวเงิน)
PF ok           member                             สมาชิก QC โทร 0899000001: 1 แถว (แถวสมาชิก = needs เมื่อไม่มี)
PF missing      credit-accounts                    PosCreditAccount 0 แถว (บิลเครดิต/บริษัท = needs เมื่อไม่มี)
PF missing      kanban-board                       KanbanBoard ของร้าน 0 (การ์ดบอร์ด = needs เมื่อไม่มี)
PF ok           public-token(/r)                   242 แถว (อ่านอย่างเดียว · ไม่มี = skip(needs-fixture))
PF missing      public-qrToken(/q/t)               0 แถว (อ่านอย่างเดียว · ไม่มี = skip(needs-fixture))
PF missing      public-linkToken(/q)               0 แถว (อ่านอย่างเดียว · ไม่มี = skip(needs-fixture))
PF missing      public-orderToken(/q/o)            0 แถว (อ่านอย่างเดียว · ไม่มี = skip(needs-fixture))
PF ok           external-WebhookEndpoint active    0 (> 0 = ตัวกดไม่เริ่ม — ปิดก่อน)
PF ok           external-PosPrintAgent not revoked 0 (> 0 = ตัวกดไม่เริ่ม — ปิดก่อน)
PF ok           external-PosIntegrationCredential COMPLETE 0 (> 0 = ตัวกดไม่เริ่ม — ปิดก่อน)
```
Reading: every writer precondition holds (tenant row · 5 systems exist for `linkUnit` · owner OWNER `*` as actor of registerDevice/setStaffPin/openShift/closeShift · cashier permissions to copy · unit slug `pos-qc-btn` free · persona e-mails free · device codes well-formed, 0/3 active devices on the unit (3 personas = exactly the default limit) · `SESSION_SECRET` present for `issueStaffToken` · `registerV2=true` · offline flag off · 6 priced all-unit products for the cart · no residue). `missing` = data rows the standard seed lacks on QC4 (credit accounts · kanban board · /q table/link/order tokens) → those rows end as `skip(needs)` / `skip(needs-fixture)` unless QC5 has them. `external-*` = 0 (> 0 would block the pass).

## Oracle `qc-pos-p4.2` — red-before (head `46397411`, no summaries)
`bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p4.2.mts` (`--no-db` identical) → **2/11**: W1–W9 🔴 (19/19 summaries missing ⇒ nothing proves W2–W9) · W10 🟢 (walker `--list` = cellRows in 19/19 cells, 14,551 rows; walker gate 7/7) · Z1 🟢. Every check has a positive control (a synthetic all-pass summary set built from the walker plan of a *filled* registry — gap rows filled through the same classifier, external rows given a real oracle id) that must be green, and a flip that must be red — `JSON_SUMMARY.probes` all true:

| id | check | flip (must go red) |
|---|---|---|
| W1 | 19 summaries exist, parse, right cell, full run (`page all`, no `--only`) | delete one cell |
| W2 | each summary holds every cell row exactly once; totals = row classes | drop a row |
| W3 | fresh: registryHash · P4.1 sha · oracleIdsHash · head contains `P42_PIN` · base · DB host QC5 | stale registryHash |
| W4 | ruling 7: ok = total − skip · dead/wrongExpect/hiddenLeak/error 0 · no fatal · all restores ok | dead 1 |
| W5 | console 0 · hydration 0 · overflow 0 | console error 1 |
| W6 | skip reasons ⊆ vocabulary · static reasons equal the classifier · no skip of a planned press · external skips cite a real oracle id | planned press reported as `skip(no-role-claim)` |
| W7 | money/counter only in posqc-btn-unit · ≤ 1 press per row per run · every pressed money row has a moneyPresses record | money press landing in silom |
| W8 | registry gaps (missing-target/db/safety) = 0 | `missing-db` 1 |
| W9 | external rows (own or detected) never pressed | an external row reported ok |
| W10 | walker `--list` per cell = cellRows (19) · walker gate mode green | registry minus one row → count differs |
| Z1 | registry + git status unchanged by the run | fake change |

Lint: `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p4.2 --base 537195ad` → **VERDICT green (red 0 · warn 0)**. `pos-gates.json` rows → `qc-pos-p2.14 --no-db` 15/15 (G1 G2 G3 green). `qc-pos-p4.1` after the work = same 8 red as at its head (R1 R2 R4 R5 R6 R10 R11 R12; R8 still green, 643 test-used ids). Single-file strict tsc of the 3 scripts (`tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck --resolveJsonModule --lib es2022,dom,dom.iterable --types node …`) → exit 0; positive control (injected `const x: number = "x"`) → exit 2 TS2322. pre-commit fitness green on every commit.

## What the controller runs on tree d
1. Merge/fetch `wip/pos-p4.2-walker` into the tree-d line after review (scripts + ledger only).
2. QC5 pre-flight (read-only): `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight` — must print no `block`.
3. QC5 migrate status → build (10g chain) → serve, as for the visual lane (never beside another build / qc:all / visual sweep).
4. One cell at a time (19 cells), e.g. `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-buttons.mts --user owner --device desktop --page all --base http://127.0.0.1:<port>` · en: `… bash scripts/qc5.sh env LOCALE=en bash scripts/with-gate-lock.sh …` (or `--locale en`) · public: `--user public --device desktop|mobile`. Smoke first with `--page register --only 'pos-reg-*'` (a filtered run overwrites the same summary file; W1 accepts only `page all` runs).
5. Verdict: `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p4.2.mts` on tree d (or `P42_SUMMARY_DIR=<dir>` elsewhere).

## Decisions for the controller (CD-P42-W*)
- **CD-P42-W1 (reuse of P4.1)**: `qc-pos-p4.1.mts` exports nothing (top-level run + `process.exit`). The fixtures module extracts the named declarations (`isPublicPage` `SAFETY` `VIEWPORTS` `MONEY_*` `EXTERNAL_*` `COUNTER_*` `isMoneyRow` `isExternalRow` `isCounterRow` `r3` `r9` `readDbCheckIds` …) from its source, transpiles them with `typescript` and evaluates them in a closed scope; 8 probes must pass or the walker refuses to plan (fail-closed). An ORACLE-EDIT of the P4.1 lists therefore reaches the walker with no change; the P4.1 sha is recorded in every summary (W3). Alternative: a one-line `export` block in `qc-pos-p4.1.mts` by ORACLE-EDIT — then the extractor can be dropped.
- **CD-P42-W2 (gate mode)**: the file name `qc-pos-buttons.mts` is fixed by the prompt, so `qc-pos-p2.14 G1` requires it in `pos-gates.json`, and `pos-gates-all` N6 requires `total == passed > 0`, not skipped. Without `--base` the walker runs the static self-test B1–B7 (no browser, no DB). The pass verdict is `qc-pos-p4.2`.
- **CD-P42-W3 (matrix)**: 19 cells as above; public en at 1440 + 390 (EN_MOBILE public pages); en summaries carry a `-en` suffix (`summary-<user>-<device>-en.json`).
- **CD-P42-W4 (personas)**: owner = QC owner (units `*`). Manager/cashier = walker-owned users `posqc-btn-user-manager` (MANAGER, permissions `{}` like the P2.11U visual manager) and `posqc-btn-user-cashier` (STAFF, permissions copied from the seed cashier at run time), both `unitAccess [posqc-btn-unit]`, kept (W30). Seed memberships are never changed (the seed cashier cannot reach the btn unit). Visibility rules are role/permission based, so hiddenLeak semantics match the registry's "QC users".
- **CD-P42-W5 (writers)**: unit via `prisma.businessUnit.create` (no unit writer in the modules; same as visual-pos P1.18U) · links `system/service.linkUnit` · device `pos/device.registerDevice` · PIN `pos/staff-pin.setStaffPin` (prior row restored) · token `issueStaffToken` · shift `pos/shift.openShift`/`closeShift` (counted = expected). StepError always names step + value.
- **CD-P42-W6 (unit)**: every staff page is opened with `?unit=posqc-btn-unit` (added when the registry query has none, replaced when it names `[unitId]`; `unit=*` kept). No walker write lands in silom/ari; money rows are additionally verified after the press (W7).
- **CD-P42-W7 (gap skips)**: `missing-target|missing-db|missing-safety` are reasoned skips in the walker (so a thin registry never causes unsafe presses) but **W8 keeps the oracle red until they are 0** — i.e. until the P4.1 builder lands.
- **CD-P42-W8 (no-role-claim)**: a role that is in neither `roles` nor `hiddenFor` gets `skip(no-role-claim)` (allowed). Today that is 1,040 rows for the manager and all 60 public rows (public pages still say owner/cashier — R4 gap). Please rule whether the P4.1 builder must claim the manager on every row (then W6/W8-style red could be added).
- **CD-P42-W9 (db verify)**: "written since the press" = createdAt/updatedAt ≥ DB now − 0.5 s for the first ≤ 3 named models with a tenantId (delete = count drop); no column-literal checks yet. Oracle-only rows: id existence only (never run suites). Weak for concurrent writers — another QC5 job must not run beside a pass (ruling 9).
- **CD-P42-W10 (money volume)**: "once per run" = once per invocation (one cell) ⇒ up to 19 real presses per money/counter row per full matrix, all on posqc-btn. Option for the controller: press money/counter rows only in th cells (en/ipad/mobile = visibility only), and cut the matrix time by ≈ 30 %.
- **CD-P42-W11 (forms/journeys)**: `kind form` = PREFILL + `requestSubmit()` + the mutation assertion. Double-submit = 1 row / cancel = 0 rows (brief W5) and the J-set J1–J6 (brief W6) are **not** in this card's oracle — proposal: a P4.2b card on top of this walker (journeys = registry opener chains + db asserts), or fold them into P4.3.
- **CD-P42-W12 (settings restore)**: the whole `settings.pos` subtree is snapshotted (`_qcP42Before` = `{had, v}`, crash-healed at the next start) and written back after every row that sent a non-GET and changed it, plus finally/signal. Other tables a press may change (the walker's own PosDevice printerConfig, btn-unit channels/links, API keys …) stay as QC5 residue in the btn unit (brief §6 accepts QC5 accumulation).
- **CD-P42-W13 (rates)**: offline flag off today ⇒ no snapshot fetch. If on, the walker spaces register loads ≥ 61 s on its single device (no rate rule touched). REST rows are not walked (REST = `qc-pos-p2.13`).
- **CD-P42-W14 (locks)**: `qc5.sh` sets `GATE_LOCK_FILE=/tmp/shark-gate-qc5.lock`; `with-gate-lock` serialises the walker with other QC5 with-gate-lock jobs but **not** with `visual-pos` sweeps (their `$command` has no with-gate-lock) — never run a sweep beside a pass.

## Known limits
- Registry rows are not filled yet (0 rows with opener/needs/viewport/safety): today's plan skips 1,612 gap items over the matrix, presses 0 money/counter rows and 0 external rows exist as such; manager/public are mostly `no-role-claim`. After the P4.1 builder the same walker/oracle run unchanged (classifier reads the new keys).
- The real-pass code path has never executed (builders never build/serve). Expect iteration-1 presser false-deads (brief §6: 2 iterations budgeted); the CRM-proven parts (opener reveal, PREFILL, dead detector, expect checks) were ported, the POS parts (cart, unit, money check, settings restore, staff token injection) are new.
- QC4 lacks credit accounts, a kanban board and /q tokens ⇒ those rows skip as `needs`/`needs-fixture` unless QC5 has them (QC5 pre-flight tells).
- 3 personas use exactly the default 3-device limit of the btn unit.
- Hydration is detected from console text; overflow per URL once.
