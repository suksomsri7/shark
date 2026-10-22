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

## rules update (walker R2 · builder · account B · 22 Oct 2026 21:05–21:45Z UTC)
Prompt `ledger/pos-briefs/pos-prompt-accountB-P4.2-WALKER-R2.md` · inputs: P4.1 review (R1 ×3) + builder notes fix1/fix2/fix3 (CD-P41-B2 B3 B6 · F12 F13 F15–F18 F22 F26–F29). Tree b · `wip/pos-p4.2-walker` = `origin/wip/pos-p4.2-walker` d2127ce1 + `merge --no-ff bb7b0b2b` (1b118949 · `pos-gates.json` merged with no conflict, all 8 entries kept). Scripts + ledger only · no `src/` · `visual-pos.mts` untouched · only `--list` / `--dry` / gate mode / `--self-test` / read-only QC4 pre-flight ran (no build, no serve, no QC5, no real pass) · every node command via `scripts/iso.sh` ISO_MEM=3G · commits `--no-verify` (fitness run separately via iso).

| SHA | group |
|---|---|
| 1b118949 | merge session/pos bb7b0b2b (P3.12 + P4.1 registry 1,242 rows) |
| 82af5b02 | ORACLE-EDIT qc-pos-p4.1 R3 + `$fields.opener` (R11 optional `?` · R10 `= ` search-noop) |
| 8ba4bff6 | fixtures: classifier R1 R5 R12 · pure helpers R4 R6 R8–R11 · resets R7 · money R13 |
| a67af0ed | walker: press rules R1–R11 · side-effect tail phase R7 · gate B8 (R13) B9 B10 |
| dc33658e | oracle qc-pos-p4.2: new reasons allowed + counted · W11 · `--self-test` · PIN bb7b0b2b |
| 23fa951b | review fixes (1 read-only reviewer sub-agent, 12 findings: 2 High · 5 Med · 5 Low — all fixed except #8 subpath, see CD-P42-R4) |
| (this) | notes |

### CD-P42-R1…R13 (fx = `scripts/pos-buttons-fixtures.mts` · w = `scripts/qc-pos-buttons.mts` · lines at 23fa951b)
- **CD-P42-R1 (B2)** `input[type=hidden]` ⇒ `skip hidden-input`: static when needs says `type=hidden` (fx:234 — 1216/1217) · runtime when the testid exists only as hidden inputs (w:597 `hiddenInput`, used in press/visible paths) or the pressed element is `input:hidden`.
- **CD-P42-R2 (B3/F15)** press only pressable elements (w:608 `pressInfo`, applied w:1080): button · a[href] · input · select · textarea · summary · form (form/filter rows) · role button|link|switch|checkbox|radio|tab|menuitem(+radio/checkbox)|option · label of a field · self/ancestor/descendant · React click handler (with tabindex, and — decision — also without tabindex, so a handler div is never a false `static`). Not pressable ⇒ `skip static` for manager/cashier (1-unit personas) · owner ⇒ `dead` "not pressable".
- **CD-P42-R3 (F13)** disabled after registry steps + PREFILL and the needs' CD-P41-F13 clause names this persona ⇒ `skip disabled-expected` (w:1098 · fx:324 `f13Users`: the role word nearest the clause; none named = manager+cashier; owner never; `expect.state disabled` rows stay `visible` = ok). Enabled ⇒ pressed normally (a server refusal is a real wrongExpect).
- **CD-P42-R4 (F16)** `navMatches` (fx:383, used w:1203): URL query/hash ignored unless the target has one; target query keys must be present (`[x]`/`<x>`/empty = any non-empty · `v*` = prefix · else exact) · target `#hash` must equal. Decision: a deeper sub-path still matches (old walker behaviour the registry was audited against, e.g. tabs anyOf `/app/sys/[id]`) — reviewer #8 asked to anchor; left for the controller.
- **CD-P42-R5 (F17/F12)** `skip needs-persona` (fx:286 list · applied fx:231, before the visible/notice check): F17 discount-over sheet 380-389 + manager-PIN 393-398 (owner/manager) · sales PIN dialogs 399-401 (owner/manager) · F12 refusal notices 1231-1235 1241 (cashier); only while the row still has needs. 915 not listed (cashier reaches it with a deposit fixture).
- **CD-P42-R6 (F18)** registry steps (`=value` `=*` `=click` `=on` `= `) run in `reveal` before PREFILL and mark their element (w:667 `markFilled`, WeakSet in the page) · PREFILL skips marked elements (w:763) · walker-typed discount = `discountFill` (fx:425 · w:492, before the qty/count rule: "dis**count**"): % = half the STAFF cap, baht = 1, cap from `posDiscountCaps(settings)` at run time (default 1000 bp, register-shared.ts:37).
- **CD-P42-R7 (F22)** side-effect rows (fx:351 keys 476 506 822 307 537 1161 1183 + needs/note "press last/กดท้าย/reset/CD-P41-F22" ⇒ also 445) run in a tail phase after every page group, 307 last (w:1483) · after each and at the end `resetSideEffects` (fx:680): walker devices back to ACTIVE · LAN agents of the run revoked (`revokePrintAgent`) · creds of the run deleted · KDS stations of the run deleted (822) · channels of the run deleted (FK ⇒ archived) — `where unitId = posqc-btn-unit` only · `_qcP42Before` now also holds the posqc-btn `BusinessUnit.settings` (476) and the POS↔account link state (506 → `setPosAccountLink` enables back) (fx:563 marker) · restore after every writing row in `finally` (w:1415) · `healResidue` (fx:868) undoes a killed run's devices/agents/creds before start; pre-flight reports posqc-btn residue as warn · Customer-create rows (439/445) get a per-run random phone instead of the fixed 0812345678 (w:685 `freshPhone`).
- **CD-P42-R8 (F26)** `expectAlts` (fx:437) reads `anyOf` strings and `{type,target,state}` objects; primary first, then any alternative (visible/navigate/ui) — never rescues ≥400, a db naming no known model, or a money/counter mutation (w:1257 `hardFail`); an inline-error rescue is labelled `anyOf-refusal` · enabled select with one option + needs ⇒ `skip needs` (w:532) · checked radio (`aria-checked=true` / `:checked`) ⇒ `skip idle-expected` (w:628) · copy rows: context gets clipboard permissions; primary fails ⇒ clipboard changed (length+hash only, never the text) ⇒ ok; unreadable ⇒ DOM text "คัดลอกแล้ว/Copied" (w:645, w:1349).
- **CD-P42-R9 (F27)** locale/unit switch already in that state (aria pressed/selected/checked/current · data-state · `<html lang>` = the switch's locale) ⇒ `skip idle-expected` (fx:430 `SWITCH_RE`/`localeOfSwitch`, w:628) · after any locale switch the LOCALE/lang cookies go back to the cell locale (w:656).
- **CD-P42-R10 (F28)** walker rule `search-noop`: PREFILL never types into search-like fields (fx:417 · w:761); a registry step `<testid>= ` types one character then clears (w:672) — 830 keeps working, the registry can drop the space later.
- **CD-P42-R11 (F29)** opener step suffixed `?` = optional, skipped without error when absent for the persona (fx:373 `parseStep`, w:706) · ORACLE-EDIT `qc-pos-p4.1.mts:422` R3 strips `?` before the same-page check (delete-probe in gate B10: `<real row>?` green, `<missing>?` red) · `$fields.opener` documents `?` and `= ` (registry line 15, ORACLE-EDIT note) · F15.3b only checks the shape (fitness-pos 8/8). No registry row uses `?` yet (949-951/1164 can, in P4.3).
- **CD-P42-R12 (B6)** `skip dead-known` before every other rule (fx:272 list, fx:224): legacy pos-pay-button · pos-member-select · pos-catalog-item · pos-reg-member-remove · pos-settings-card-state-offline · pos-kds-legacy-open (844) · pos-sales-unit-all (964).
- **CD-P42-R13 (money policy)** still true after R12 = 15: gate B8 (w:275) on all 19 cells — 15 R12-detected + 30 `safety external` rows never planned as press (skip:external before reveal) · R11 detects 44 · 487 money/counter presses over the matrix all verify by db/oracle except `register#pos-taxinv-submit` (counter, ui-only on /register — no write to verify: ui + branch check; CD) · none on `unit=*` · no opener passes through an external row · money branch check = rows *created* after the press (diff vs pre-press ids, PosPayment via sale ids — fx:1043) · public pages: any writing row (money · mutation · opener through a mutation row) runs only with a posqc-btn token, tokenless writing pages are not pressed (w:810 · fx:840 tokens record their unit).

### Oracle `qc-pos-p4.2` (12 checks)
SKIP vocabulary + `STATIC_REASONS`/`DYNAMIC_REASONS` shared from fx · W6 (193): plan skip ⇒ same reason · runtime reasons only on planned press/visible rows · W2 perReason must equal the rows (155) · **W11** (213): disabled-expected only for the persona F13 names · static only manager/cashier · no static/idle-expected on money rows · dead-known only B6 · W9 counts absent/visible external rows as not pressed (the positive control was red on hiddenFor external rows at d2127ce1) · pass bar unchanged (ok = total − skip · dead/wrongExpect/hiddenLeak/error 0 · console/hydration/overflow 0) · PIN default `bb7b0b2b`.
`--self-test` (positive control + 1–3 flips per check, no summaries read) **12/12** · normal run **2/12 red-before** (W1–W9 W11 red: no summaries · W10 Z1 green) with every probe red as expected (12/12) · `pos-oracle-check … qc-pos-p4.2 --base bb7b0b2b` VERDICT green (red 0 · warn 0) · `… qc-pos-p4.1 --base 6e32c1e2` green · `qc-pos-p4.1 --no-db` 16/16 · `qc-pos-p2.14 --no-db` 15/15 · fitness-pos 8/8 · fitness 53/53 · walker gate 10/10 (B1–B10) · strict single-file tsc of the 3 scripts exit 0.

### `--list` per cell (registry 1,242 rows · hash 7edf45641e6e26ef · total 15,286 = Σ cellRows)
```
LIST owner-desktop         1161 · skip 56 · press 1059 · visible 30 · absent 16 · skip: dead-known 7 · external 28 · needs-persona 19 · hidden-input 2
LIST owner-ipad            1162 · skip 56 · press 1060 · visible 30 · absent 16 · skip: dead-known 7 · external 28 · needs-persona 19 · hidden-input 2
LIST owner-mobile          1146 · skip 56 · press 1044 · visible 30 · absent 16 · skip: dead-known 7 · external 28 · needs-persona 19 · hidden-input 2
LIST manager-desktop       1161 · skip 54 · press 957 · absent 120 · visible 30 · skip: dead-known 7 · external 28 · needs-persona 19
LIST manager-ipad          1162 · skip 54 · press 958 · absent 120 · visible 30 · skip: dead-known 7 · external 28 · needs-persona 19
LIST manager-mobile        1146 · skip 54 · press 942 · absent 120 · visible 30 · skip: dead-known 7 · external 28 · needs-persona 19
LIST cashier-desktop       1161 · skip 56 · press 540 · absent 539 · visible 26 · skip: dead-known 7 · external 23 · no-role-claim 20 · needs-persona 6
LIST cashier-ipad          1162 · skip 56 · press 541 · absent 539 · visible 26 · skip: dead-known 7 · external 23 · no-role-claim 20 · needs-persona 6
LIST cashier-mobile        1146 · skip 56 · press 533 · absent 531 · visible 26 · skip: dead-known 7 · external 23 · no-role-claim 20 · needs-persona 6
LIST owner-desktop-en      1161 · skip 56 · press 1059 · visible 30 · absent 16 · skip: dead-known 7 · external 28 · needs-persona 19 · hidden-input 2
LIST owner-mobile-en        390 · skip 38 · press 337 · visible 14 · absent 1 · skip: dead-known 5 · external 14 · needs-persona 19
LIST manager-desktop-en    1161 · skip 54 · press 957 · absent 120 · visible 30 · skip: dead-known 7 · external 28 · needs-persona 19
LIST manager-mobile-en      390 · skip 38 · press 334 · absent 4 · visible 14 · skip: dead-known 5 · external 14 · needs-persona 19
LIST cashier-desktop-en    1161 · skip 56 · press 540 · absent 539 · visible 26 · skip: dead-known 7 · external 23 · no-role-claim 20 · needs-persona 6
LIST cashier-mobile-en      390 · skip 25 · press 291 · absent 61 · visible 13 · skip: dead-known 5 · external 14 · no-role-claim 6
LIST public-desktop          54 · press 52 · skip 2 · skip: external 2
LIST public-desktop-en       54 · press 52 · skip 2 · skip: external 2
LIST public-mobile           60 · press 58 · skip 2 · skip: external 2
LIST public-mobile-en        58 · press 56 · skip 2 · skip: external 2
```
Registry gap reasons (missing-target/db/safety) = 0 in every cell.

### `--dry --user owner --device desktop --page all` (head) + time per cell
```
═══ qc-pos-buttons --dry (ไม่เปิดเบราว์เซอร์ · ไม่แตะ DB · ไม่ต่อเซิร์ฟเวอร์) ═══
ทะเบียน 1242 แถว (hash 7edf45641e6e26ef) · กติกา P4.1 ยืมจาก scripts/qc-pos-p4.1.mts (sha e21073121f17f310) · oracle id 1922 · head dc33658e
ตรวจคีย์ตัวกด (R3 opener/needs/viewport · R9 hiddenFor ของ P4.1): ✅ ถูกรูป · opener 979 · needs 861 · viewport 63 · safety 83

── ตารางผ่าน (มติ 6 · รอบละ 1 ช่อง มติ 9 · ประมาณการ 6 วิ/กด · 3.5 วิ/ตรวจซ่อน · 3 วิ/ตรวจเห็น · +90 วิ/รอบ) ──
  owner-desktop        แถว  1161 · skip 56 · press 1059 · visible 30 · absent 16 ≈ 1:50 ชม.
  owner-ipad           แถว  1162 · skip 56 · press 1060 · visible 30 · absent 16 ≈ 1:50 ชม.
  owner-mobile         แถว  1146 · skip 56 · press 1044 · visible 30 · absent 16 ≈ 1:48 ชม.
  manager-desktop      แถว  1161 · skip 54 · press 957 · absent 120 · visible 30 ≈ 1:46 ชม.
  manager-ipad         แถว  1162 · skip 54 · press 958 · absent 120 · visible 30 ≈ 1:46 ชม.
  manager-mobile       แถว  1146 · skip 54 · press 942 · absent 120 · visible 30 ≈ 1:44 ชม.
  cashier-desktop      แถว  1161 · skip 56 · press 540 · absent 539 · visible 26 ≈ 1:28 ชม.
  cashier-ipad         แถว  1162 · skip 56 · press 541 · absent 539 · visible 26 ≈ 1:28 ชม.
  cashier-mobile       แถว  1146 · skip 56 · press 533 · absent 531 · visible 26 ≈ 1:27 ชม.
  owner-desktop-en     แถว  1161 · skip 56 · press 1059 · visible 30 · absent 16 ≈ 1:50 ชม.
  owner-mobile-en      แถว   390 · skip 38 · press 337 · visible 14 · absent 1 ≈ 0:36 ชม.
  manager-desktop-en   แถว  1161 · skip 54 · press 957 · absent 120 · visible 30 ≈ 1:46 ชม.
  manager-mobile-en    แถว   390 · skip 38 · press 334 · absent 4 · visible 14 ≈ 0:36 ชม.
  cashier-desktop-en   แถว  1161 · skip 56 · press 540 · absent 539 · visible 26 ≈ 1:28 ชม.
  cashier-mobile-en    แถว   390 · skip 25 · press 291 · absent 61 · visible 13 ≈ 0:35 ชม.
  public-desktop       แถว    54 · press 52 · skip 2                        ≈ 0:07 ชม.
  public-desktop-en    แถว    54 · press 52 · skip 2                        ≈ 0:07 ชม.
  public-mobile        แถว    60 · press 58 · skip 2                        ≈ 0:07 ชม.
  public-mobile-en     แถว    58 · press 56 · skip 2                        ≈ 0:07 ชม.
  รวม 19 ช่อง ≈ 22:26 ชม. (ช่องโหว่ทะเบียน 0 รายการ · รอบละ 1 ช่อง — แถว needs ที่ fixture ไม่มีจะจบเร็วกว่าประมาณการ)

── แผนช่อง owner-desktop · หน้า all: 1161 แถว · skip 56 · press 1059 · visible 30 · absent 16 ──
  ⏭️     7 × dead-known — แถวตายที่รู้แล้ว (CD-P41-B6 · ไม่กด · นับไม่ตก จน P4.3 ลบ — CD-P42-R12) · เช่น pos-pay-button, pos-member-select, pos-catalog-item, pos-reg-member-remove
  ⏭️    28 × external — safety external — ไม่กด ต้องอ้าง oracle (มติ 5 · W3) · เช่น pos-bills-menu-reprint, pos-bills-reprint, pos-settings-print-sample, pos-device-test-print
  ⏭️    19 × needs-persona — opener/needs ที่บทบาทนี้ทำให้เกิดไม่ได้ (จอ PIN ที่ถึงได้เฉพาะผู้ไม่มีสิทธิ์ · การ์ดปฏิเสธที่ไม่มีผู้ใช้ QC ถึง — CD-P41-F17/F12 · CD-P42-R5) · เช่น pos-discount-over-manager, pos-dis
```
Estimate ≈ 22:26 h for 19 cells run one at a time (6 s/press · 3.5 s/absent · 3 s/visible · +90 s/cell); rows ending as needs/needs-fixture finish faster. Cheaper option stays CD-P42-W10 (money/counter presses only in th cells).

### Commands the controller runs on tree d (QC5 · one at a time · never beside a build / qc:all / visual sweep)
1. Merge `wip/pos-p4.2-walker` into the tree-d line (scripts + ledger only).
2. Pre-flight (read-only): `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight` — no `block` (posqc-btn residue = warn, healed by the fixture).
3. Fixtures are made by the pass itself (`ensureFixtures` → find-or-create posqc-btn unit/personas/device/PIN/shift · snapshot `_qcP42Before`); build + serve tree d first (10g chain as for the visual lane).
4. Smoke: `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-buttons.mts --user owner --device desktop --page register --only 'pos-reg-*' --base http://127.0.0.1:<port>`, then per cell `… --user <owner|manager|cashier|public> --device <desktop|ipad|mobile> --page all --base http://127.0.0.1:<port>` (en: `--locale en`; 19 cells per the table).
5. Verdict: `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p4.2.mts` (or `P42_SUMMARY_DIR=<dir>`); `--self-test` proves the probes.

### Decisions for the controller (CD-P42-R*)
- **CD-P42-R2a** React click handler without tabindex counts as pressable (strict prompt list = tabindex only) — avoids false `static`; a11y nit, not a walker failure.
- **CD-P42-R4a** sub-path acceptance kept (reviewer #8) — anchoring would turn tab/anyOf `/app/sys/[id]` rows into wrongExpect; rule it or fix those targets in P4.3.
- **CD-P42-R7a** resets are walker-owned rows in posqc-btn only; product/catalogue/price edits at system level (shared by all branches, e.g. 564 product save, 575 bulk price, recipe) persist on QC5 — known limit (brief §6 accepts QC5 accumulation); `healResidue` revokes every unrevoked agent / deletes every cred in posqc-btn (walker-owned unit) but never old channels or stations.
- **CD-P42-R7b** 439/445 random phone overrides a registry value (F22 "ล้าง/สุ่มเบอร์") — the only place a walker value beats a registry fill.
- **CD-P42-R13a** `register#pos-taxinv-submit` (safety counter, expect ui) has nothing to verify by db — ui + branch check; add an oracle id in P4.3 or drop counter on the /register row.
- **CD-P42-R13b** public writing rows need a posqc-btn token; QC5 has none for /q/t /q /q/o (and /r only after a staff cell sold in posqc-btn) ⇒ they end as `needs-fixture` until a posqc-btn table/link/order fixture exists (P4.3 or controller seed).

### Known limits
- Real-pass code still never executed (builders never serve); the review covered control flow / APIs statically. Expect iteration-1 fixes.
- runGroup leaks its `targetcreated` listener if page setup throws (rows recorded as error, later groups continue).
- Money branch check is fail-closed against any concurrent QC5 writer in the tenant (ruling 9).
