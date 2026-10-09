# POS P1.18U — builder notes (account B, tree d)

Branch `wip/pos-p1.18u` from `session/pos` 39204872 (P1.12U + P2.1 S + P1.18 S); merged `origin/session/pos` 2bfece5f (P2.1 R8 ORACLE-EDIT + ledger) in 2ed087f8.
Prompt `ledger/pos-briefs/pos-prompt-accountB-P1.18U.md` (rulings 1–13). Tree `/root/projects/shark-pos-d` · QC4 (`ep-frosty-lab`) · logs `scratchpad/p118u/runs/`.

## Checkpoint
- done: steps 1–4 · commits e83ede7a (tabs + 5 tab UIs) · 7e2050f8 (register items 10a/b/e + 11) · 8339fc9f (i18n pass) · a8e94d63 (visual states) · 2ed087f8 (merge) · 8d2b5424 (general drafts fix).
- next: controller — real screenshots (`visual-pos.mts p118u --page settings|register --states`, owner + cashier, th + LOCALE=en), review.

## Built per tab / item
- **Shell** (`SettingsShell.tsx`, `settings-tabs.ts`): 8 tabs live, `POS_SETTINGS_DEFAULT_TAB = "general"` (Q6); menu icons per 17A (gear · doc · wallet · print · users · link · truck · swap); footer still omitted. Clock button `pos-settings-history-shell-open` in the menu header (only with `pos.settings.manage`) + `useSettingsHistory()` context for the shark tab button. No P1.10U/P1.7U oracle asserted the `receipt` fallback ⇒ **no ORACLE-EDIT**.
- **ทั่วไป** (`GeneralSettings.tsx`): 17A cards in ruling order — หน้าขาย · กะและลิ้นชัก · รายงาน · สต็อกของสาขา · บาร์โค้ดสินค้าชั่ง · พร้อมเพย์ของสาขา · ค่าบริการ · ภาษาของแอป; one `posSettingsOverviewAction` load; per-card "บันทึก" sends only changed keys (`updatePosGeneralSettingsAction` / `updatePosUnitStockPolicyAction` / `updatePosUnitPromptpayAction`); client-side range checks mirror `POS_GENERAL_LIMITS`; VALIDATION field → `pos-settings-general-field-error` under the field; SETTINGS_SECTION_LOCKED / PERMISSION_DENIED → card read-only + message; "บันทึกแล้ว" 3 s; cashier = read-only, no buttons; saving one card keeps other cards' drafts.
- **พนักงานและสิทธิ์** (`StaffSettings.tsx`, `StaffPinDialog.tsx`): page renders `SettingsRefusal` without `pos.settings.manage` at the unit; `posStaffOverviewAction` + `posSettingsOverviewAction` (for `canEdit.caps`); matrix 12 rows (contract order, mockup labels/sub-labels), legend, counts from `staff[]`, cells ink / accent-soft (STAFF column + `needsApproval`) / "—" / "n/m"; discount row "ไม่จำกัด" + % inputs (MANAGER only editable by OWNER); black "บันทึก" = caps only; policies read-only switches + empty text + dashed note + `/app/settings/approval`; PIN rows + "ตั้ง PIN"/"เปลี่ยน PIN" → PIN dialog (enter + confirm → `setStaffPinAction` → reload list); HR row disabled switch + "เร็ว ๆ นี้ · P3.5".
- **การเชื่อมต่อระบบ SHARK** (`SharkSettings.tsx`, `shark-ui.tsx`): header + live count pill + history button + danger backlog chip; grid 1/2/3 columns (md/xl); 13 cards in contract order with icon tiles (AI accent sparkle), facts with params (`{baht} บาท = 1 แต้ม`, oversell select, multi-book autoPost), planned facts muted + phase, OFF / NO_SYSTEM footers + "เปิดใช้", PLANNED chip, "ล่าสุด …", "จัดการ →", AI dashed note; ACCOUNT = live switch → confirm dialog (`pos-settings-account-confirm`) → `{enabled:false, confirm:true}`, off→on direct, NOT_FOUND toast + link, PERMISSION_DENIED → disabled + "เจ้าของร้านหรือผู้ดูแลบัญชีเท่านั้น", refetch after success; receipt card from `receiptSettingsPageDataAction`; offline card; channels + payments panels.
- **ช่องทาง / ออฟไลน์** (`ChannelsPane`, `OfflinePane`): phase banner + same panel/card full width.
- **History drawer** (`components/pos/settings/HistoryDrawer.tsx`): HeldBillsDrawer shell, rows "เวลา (relative < 24 h else d MMM y HH:mm) · ชื่อ · ประโยค", one message per summary key `pos.settings.history.<section>.<key>`, device/PIN rows by action, unknown ⇒ "แก้ไข{ส่วน}", "โหลดเพิ่ม", empty, error + retry, Esc closes.
- **Language switcher** (`components/pos/LocaleChooser.tsx`): TH | EN segmented, 44 px buttons, `setUiLocaleAction` → `router.refresh()`; register top bar (md+, next to online/shift chips) and the ทั่วไป language card.
- **Register items**: 10a `PIN_THROTTLED` (already mapped to `register.errors.pinThrottled` "…รอ 15 นาทีแล้วลองใหม่" by `refusalMessageKey`) now also drops the armed manager PIN like PIN_INVALID/LOCKED (override quote + submit paths) · 10b static QR = `promptpayIdForUnit` first · 10c close/reports "today" = `posBusinessToday` · 10d no change · 10e two hardening hunks · 11 empty catalogue: owner/manager button, cashier text (`register.emptyCatalogue.cashierBody`).
- **i18n pass**: ST7 scan 61 lines / 4 files → **0**; close-day page + CloseDayTools → `pos.report.closeDay.*`, products page → `pos.stock.productsPage.*` (existing groups; th byte-identical); `print/types.ts` reads `print.errors` from `messages/th/pos.json`; `posTabs(id, t)` on overview, register, products, stock, sales, shifts, close, reports, settings; bills drawer timeline + system actor translated; date-input overlay (`components/pos/DateOverlay.tsx`) on reports from/to and close-day date.

## Server hunks (each marked `POS P1.18U ▸ … ◂`)
- `pos/register/page.tsx` +3 (10b) · `staff-pin.ts` +2 (`set_config('lock_timeout','3s',true)` before the advisory lock) · `pos-integrations.ts` +2 (CHAT scan `createdAt >= now() - interval '90 days'`).
- `bills.ts` 9 lines changed / `bills-shared.ts` +5: timeline items gain additive `kind` + `params` (server `text` unchanged), `BILLS_SYSTEM_NAME` moved to shared (same value).
- `service.ts` +3: `PosDayBill.methodTypes` (additive; close-day page translates methods).
- Page-level: `close/page.tsx`, `reports/page.tsx` (`posBusinessToday`), `settings/page.tsx` (storefront read: ACTIVE SHOP unit with ≥1 active ShopProduct; masked unit/shop PromptPay).

## Deviations (ruling)
1. (8) 390 register header (05ก) has no room/slot for the switcher — md+ only in the register; phones switch in ตั้งค่า → ทั่วไป.
2. (3) P1.15U has no reusable "set PIN for someone" pad (lock screen sets only the own PIN) ⇒ `StaffPinDialog` with the lock-screen pad layout.
3. (3) "ปลดล็อก" omitted — `posStaffOverview.staff[]` exposes no lock state (unlock stays on the lock screen with a manager PIN).
4. (3) planned row chip shows the contract phase `roleMatrix.planned` = **P2.8** (brief R10), not "P2.5" from the ruling text.
5. (3) light-blue "ต้องอนุมัติ" only in the STAFF column (owner/manager are the approvers).
6. (2) receipt-language segmented th "ไทย | อังกฤษ" (en "Thai | English"): F15.4 forbids a th value without Thai letters.
7. (2) PERMISSION_DENIED on a general card shows `general.permissionDenied` — `errors.permissionDenied` is receipt-worded.
8. (2) day cut-off = select 00:00–06:00 in 15-min steps (+ stored off-grid value), locale-independent instead of a native time input.
9. (2) ค่าบริการ read-only + note (no writer UI exists).
10. (4) PLANNED cards show the phase chip instead of a switch; non-ACCOUNT switches are read-only indicators (CD2); e-Tax label = 17A wording "e-Tax Invoice ทางอีเมล"; CRM title + channel brand names are code literals (proper names; F15.4).
11. (4) channels: LINE MAN/Grab P2.1, Shopee/foodpanda P3 (mockup statuses not real); payments panel omits MDR % and slip check (no data), card sub = Beam or EDC.
12. (4) offline card switch off + P3.4 chip; "รายการรอซิงก์ 0" static (no queue yet).
13. (11) **fixture breach to rule**: no module function creates a BusinessUnit or sets `settings.pos.registerV2`, so the 19ก fixture uses the app's own primitives for those two rows (`prisma.businessUnit.create` as createSystemAction/DNA CREATE_UNIT, one jsonb flag as seed-pos-qc); system/link/shift flag/device via `createSystem` · `linkUnit` · `updatePosGeneralSettings` · `registerDevice`; created right before the 19ก jobs, deleted after the last one (+ finally). Controller to accept or move it into `seed-pos-qc`.
14. (11) 19ก cashier visual not shot: QC cashier membership has no access to the fixture unit (seed membership not edited); cashier text path is code-only.
15. (13) `LOCALE=en` runs shoot 1440 only (harness rule since P1.3 20B).
16. (9) close-day summary title shows the date per locale (was ISO); bill CSV export keeps server text.
17. (9) `print/types.ts` now imports `messages/th/pos.json` (same strings) — adds the th JSON to the print client chunk.

## Fixtures (visual-pos)
- `seedHistoryOnce`: if the coffee POS history has < 3 rows → 4 real general edits as owner (heldCartExpireDays ±1 and back, autoLockMinutes ±1 and back; final values unchanged); ≥ 3 rows ⇒ no write.
- `seedEmptyCatalogueOnce` / `cleanupEmptyCatalogue`: unit `posqc-coffee-unit-empty-vis` + POS "ขายหน้าร้าน · แคตตาล็อกว่าง (ภาพ QC)" + device `posqc-vis-empty-<pid>` — find-or-create, removed after the state.
- `register-en`: clicks EN (md+) / cookie on 390, then deletes LOCALE + lang cookies (th runs).

## Follow-ups
- Sent receipts (LINE / e-mail) stay th (P1.18 deviation 5) — parity sheet.
- HR roster/schedule sync (P3.5) · channel UI (P2.1U) · offline queue (P3.4) · e-Tax (P3.11) · service-charge editor UI.
- 19ก fixture: decide seed-pos-qc vs visual fixture; QC manager user would allow the cashier/manager variants.
- History scope per unit / no e-mail fallback (P1.18 F11).

## Gate exit codes (code head 8d2b5424 · logs `scratchpad/p118u/runs/final-20261009T201618Z/` · every log headed `tree=/root/projects/shark-pos-d head=8d2b5424`)
typecheck 0 · pnpm fitness no env 0 (41/41) · with QC4 env 0 (41/41) · fitness-pos 0 (8/8) ·
**qc-pos-p1.18 `QC_P118_PHASE=U` forced #1 0 (80/80) · forced #2 0 (80/80) · unforced 0 (80/80, phase U auto, ST7 = 0 lines, residue 0, leaks none, fpDrift none)** ·
qc-pos-p1.10 0 (40/40) · p1.7 0 (32/32) · p1.15 0 (39/39) · p1.16 0 (28/28) · p1.3 0 (128/128) · p1.12 0 (72/72 — 65 in the prompt; current oracle) · p1.13 0 (33/33) ·
p2.1 0 (55/55 — 54 + R8 from the merged session/pos) · qc-hf-pos-page-authz 0 (56/56) · qc-nav-functions 0 (11 checks) · qc-hr-roster 0 (24/24).
Visual `--dry` rc 0: `--page settings --states` owner/cashier th 40 · en 14; `--page register --states` owner th 86 / en 31, cashier th 83 / en 30 (logs `dry-*` in the same folder). Real screenshots = CONTROLLER-RUN.
No ORACLE-EDIT in this card.

## Fix round 1 (account B, tree c `/root/projects/shark-pos-c`, 9 Oct · review `pos-P1.18U-review.md` F1–F8 · prompt `pos-prompt-accountB-P1.18U-fix.md`)
Branch `wip/pos-p1.18u` from e082e83f. Commits: `d1c48cf9` ORACLE-EDIT H2b · `ad1feb8f` fix F1 F3–F6 · `85b47b2f` visual fixture F2 F7 · this ledger commit. Everything under "Verified OK" was left as it was.
- **F1** `settings-general.ts:391-412` `summaryOf(after, before, mask)`: a nested `k.k2` is emitted only when `canon(before[k][k2]) !== canon(after[k][k2])`. Both sides go through `maskAuditPhones`, so an unchanged phone is never reported. Top-level scalars and `k.count` are unchanged. The reader passes `r.before` (`:469`, already selected). So a blindClose-only edit now gives `shift.blindClose` alone, a rules-only weighed edit gives no `weighedBarcode.enabled`, and a shop-name-only receipt edit gives no phone/address/logo parts. **ORACLE-EDIT H2b** (`qc-pos-p1.18.mts:123` registry, `:1774-1807` body) **80 → 81**, recorded in `pos-P1.18-oracle.md`. Red before: `scratchpad/p118u-fix/runs/red-before-H2b.log` = 80/81, only H2b (5 shift keys · `weighedBarcode.enabled` present).
- **F2** `visual-pos.mts:638-644`: the SIGINT/SIGTERM/SIGHUP handler awaits `cleanupEmptyCatalogue()` (and prints its line) before `cleanupSettingsState()`. The header (`:13`, `:109-115`) is true again.
- **F3** `SharkSettings.tsx:216-217`: `pos-settings-account-denied` renders when `accDenied || (accountLive && accountLocked)`, so a cashier sees the reason under the locked switch before any refusal.
- **F4** `SharkSettings.tsx:225-226`: the "เปิดใช้" link renders only when `c.manage?.canManage`, with `href = c.manage.href`. Otherwise the footer is muted text only. NO_SYSTEM cards carry `manage: null` (I8), so they now always show text only. `ADD_SYSTEM_HREF` stays for the NOT_FOUND toast link.
- **F5** `components/pos/print/types.ts:1-11`: the JSON import and `PRINT_MESSAGES_TH` are removed. `refusePrint` sets `message: code` (log-only; no screen reads `.message`, and every screen uses `pos.print.errors.<code>`). `grep -rn "messages/th/pos.json" src/components src/app/app/sys/[id]/pos` = **0**. Deviation 17 is gone.
- **F6** `settings/page.tsx:66-79`: the storefront probe is one `$queryRaw` (tenant-bound): `BusinessUnit` SHOP+ACTIVE `AND EXISTS (ShopProduct same tenant/unit active)` `ORDER BY sortOrder, createdAt LIMIT 1`. This is the same boolean and row as before, and the EXISTS uses the `ShopProduct(tenantId, unitId, active)` index. The schema has no BusinessUnit↔ShopProduct relation, so a Prisma `some` filter is not possible. EXPLAIN on QC4 is valid (semi-join).
- **F7** `visual-pos.mts:333-339, 2753-2835`: the unit id and device code are both `posqc-vis-empty-<pid>` (slug `pos-qc-vis-empty-<pid>`). The system is found through the link of this run's unit, not by its shared name. `deleteEmptyCatalogueSet` deletes devices · links · system · unit **and the AuditLog rows whose targetId is that system, device or unit** (the `pos.settings.updated` and `pos.device.register` orphans). It is used by finally, the signal handler and `sweepStaleEmptyCatalogue` (`posqc-vis-empty-*` units older than 1 h, i.e. kill -9 leftovers; never the current pid). The legacy fixed id `posqc-coffee-unit-empty-vis` is not swept, because tree d's controller run still uses it.
- **F8**: every log of this round, the dry logs included, starts with `tree=/root/projects/shark-pos-c head=<sha> dirty=<n> cmd=…` (`scratchpad/p118u-fix/gates.sh`).

### Gate exit codes (head 85b47b2f, dirty 0 · logs `scratchpad/p118u-fix/runs/final-r1-85b47b2f/`)
typecheck 0 · pnpm fitness no env 0 (41/41) · with QC4 env 0 (41/41) · fitness-pos 0 (8/8) ·
**qc-pos-p1.18 `QC_P118_PHASE=U` forced #1 0 (81/81) · forced #2 0 (81/81) · unforced 0 (81/81, phase U, ST7 0, residue 0, leaks none)**. fpDrift = only `posStaffPin` of the seed tenant, which the controller's concurrent visual run writes ·
qc-pos-p1.10 0 (40/40) · p1.16 0 (28/28) · qc-pos-closeday 0 (22/22) · p1.6 0 (48/48) · p1.9 0 (53/53) · qc-hf-pos-page-authz 0 (56/56) ·
**qc-pos-p1.3 1 (127/128, S1.9) · re-run 1 (125/128, S1.9 S9.1 S9.2)**: not this card. S1.9's search finds `PQC-VIS-106324-OUT`, a product fixture of the controller's tree-d visual run (pid 106324, `/root/projects/shark-pos-d`, port 3228), on the shared `posqc-coffee`. S9.1/S9.2 drift (posSale 185→188, AuditLog, product/InvItem fingerprints) is that run's sales and fixtures. p1.3 touches none of the files changed here, and it was 128/128 at e082e83f. Re-run p1.3 when tree d's visual run is idle.
Visual `--states --dry` rc 0 (log headers in place): settings owner th 40 / en 14, cashier th 40 / en 14 · register owner th 86 / en 31, cashier th 83 / en 30 (same counts as before).

## Fix round 2 (visual)
Account B, tree c `/root/projects/shark-pos-c`, 9 Oct. Prompt `pos-prompt-accountB-P1.18U-fix2.md`, findings V1–V4 from the controller screenshots vis52 @e082e83f. Branch `wip/pos-p1.18u` from 82bf9b9f. Code commit `a5059a7f`, then this ledger commit. No new message keys. No server, test or oracle change.

**How this was verified.** `visual-pos --dry` only prints the plan; it does not open chromium, so it gives no DOM widths. The checks below are reasoning about the classes, using measured inputs:
- Card widths come from the controller's screenshots (CSS px). Staff matrix card: 425 at 1440 and 406 at 1024. Shark grid card: 250 at 1440 (content 220) and about 193 at 1024 (2 columns, content about 163).
- Text widths come from the app font's metrics: IBM Plex Sans Thai TTF hmtx advances at the real px size and weight (`scratchpad/p118u-fix2/tw.py`). Kerning and GPOS are not included.

- **V1, 17C role table clipped.** Fix in `StaffSettings.tsx:221-266`.
  - The table is `table-fixed w-full` with a `<colgroup>`: three role columns at `w-[88px]`, and the task column gets the remaining width. Role cells are `px-1.5 text-center`.
  - The task column is `pl-4 pr-2 md:pl-5 break-words`. Sub-labels wrap at word boundaries.
  - The cap input is now 56px (it was 72) and the `%` is 13px (`:160-175`).
  - The wrapper is `max-md:overflow-x-auto`, and the table has `min-w-[360px] md:min-w-0`. So the horizontal scroll is a safety net below md (390) only.
  - Rule: 3 × 88 = 264.
    - At 1440, the task column is about 159px (131px of text). The longest th label is 111px, so th labels stay on one line. EN "Receive/adjust stock" (141px) wraps to 2 lines.
    - At 1024, the task column is about 140px (112px of text). th labels up to 111px fit. "กรอกราคาเองที่หน้าขาย" (123px) wraps.
    - The role columns hold 76px of content: "ไม่จำกัด" is 48px, "Unlimited" 67px, and the input plus `%` about 68px.
  - (88 rather than "~96": at 96 the 1024 task column drops to 116px, which leaves 88px of text.)
- **V2, ใบเสร็จและภาษี rows overflow.** Fix in `SharkSettings.tsx:261-312`.
  - The fixed 120/136px label column is gone. Each row is `flex flex-wrap items-center justify-between gap-x-3`:
    - The label is muted, `shrink-0 whitespace-nowrap`.
    - The value is `inline-flex max-w-full items-center gap-1.5 text-right`, with the VAT check icon inline before the text.
  - When the value fits beside the label, it sits on the right on one line. When it does not, the whole value moves to its own line under the label, at full card width. It is never squeezed into a narrow column, and there is no `truncate`, so nothing is clipped mid-word. A value wider than the whole card would wrap at word boundaries (none is).
  - The e-Tax row (`:300-310`, `pos-settings-card-etax`) is label + one `whitespace-nowrap` group (chip "รอผู้ให้บริการ" + small disabled "สมัคร" `h-11 px-2.5`). The group moves under the label as one piece.
  - **Deviation from the wording "one line at 1440/1024".** A 3-column card has 220px of content at 1440 and about 163px at 1024 (2 columns). The e-Tax row needs 271px in th (label 121 + gap 12 + group 138) and 313px in en, so at both widths the chip and button move together under the label.
    - At 390 the card is single-column (about 320px of content), so th stays on one line and en stays on one line.
    - At 1440 th, VAT fits on one line (68 + 12 + 139 = 219 of 220, at the edge). Tax ID with a number (168px) and "POS001 · หัว/ท้ายใบเสร็จ ตั้งแล้ว" (165px) move under their labels. In en, all three values move under.
    - Getting a true one-line row at 1440 would need wider cards (fewer grid columns at xl), which ruling 4 fixes at 3/2/1. That is not changed here.
- **V3/V4, PLANNED card header.**
  - Shared header classes are in `shark-ui.tsx:20-26`:
    - `CARD_HEAD` = `flex items-start`.
    - `HEAD_TITLE` = `min-w-0 flex-1 break-words pt-[3px] leading-[20px]`, so the first line is centred on the 26px icon.
    - `HEAD_SWITCH` = `-my-[9px]` with a 44px hit area, so the knob centre aligns with the first title line.
    - `SOON_ROW` = `-mt-1.5 flex pl-[39px]`: the chip gets its own row under the title, indented to the title start and not confined to the title column.
  - System cards (`SharkSettings.tsx:172-210`):
    - A PLANNED card (AI) has a read-only off knob in the header (`pos-settings-card-state-ai`, title "เร็ว ๆ นี้ · P3.9"), as in mockup 10.
    - Its chip moves to `pos-settings-card-soon-ai` under the title.
    - ACCOUNT and the read-only switches use the same top alignment. The receipt card's "แก้ไข" link does too (`:281-285`).
  - The offline card (`shark-ui.tsx:170-184`) uses the same header. Its chip row is `pos-settings-card-soon-offline` (`pl-[43px]`, because its tile is 30px).
  - Rule check: the title column at 1440 is 220 − 26 − 13 − 13 − 44 = 124px. "Coupons and vouchers" (143px) wraps to 2 lines with the switch level with line 1 (V4). The chip row has 181px at 1440 and 124px at 1024; "Coming soon · P3.9" is 121.5px, so no overlap.
  - **Rows (`shark-ui.tsx:71`, `SharkSettings.tsx:340-341`).** At 1024 the two panels were side by side at about 200px each, which left about 8px for the name beside a chip. They now sit side by side only from `xl`; below that they stack at full width. At 1024 the name gets about 184px and the longest name is 128px. Row titles also get `truncate` as a safety net.
- **Coupons and vouchers (EN) on two lines** is accepted. The switch stays top-right, level with line 1 (`-my-[9px]` + `items-start`).
- **Inventory:** the `pos-spec-P1.3-register-ui.md` addendum now lists `pos-settings-card-soon-<code>` and `pos-settings-card-etax`, and `card-state-*` on PLANNED cards.

### Gate exit codes (head a5059a7f · logs `scratchpad/p118u-fix2/runs/` · each headed `tree=/root/projects/shark-pos-c head=<sha>`)
| Gate | Exit | Result |
|---|---|---|
| typecheck | 0 | — |
| `qc-pos-p1.18` `QC_P118_PHASE=U`, unforced | 0 | 81/81 · phase U · ST7 = 0 · residue 0 · leaks none |
| `pnpm fitness` without env | 0 | 41/41 |
| fitness-pos | 0 | 8/8 |
| visual `--page settings --states --dry`, owner | 0 | th 40 shots · en 14 shots |

- The pre-commit fitness also passed.
- fpDrift in the qc run is only `posStaffPin` of the seed tenant, the same as in round 1. It comes from the controller's tree-d run, not from this card.
- Real screenshots are the controller's.
