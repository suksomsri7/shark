# H5.1 — every HR button at 3 screen sizes (walk + one fix batch per area)

> DRAFT r0 · 14 Nov 2026 · brief drafter (read-only). Base = `session/hr` 8fd6f7dc4 + H4.3 + H4.8 + H4.9 once merged. Branch `wip/hr-h5.1`. Lane S. Q defaults (end) hold unless the controller rules.
> Sources: MASTER §2 gate 15 · RESUME (H2.2, VIS-1, H2.12) · `wo-notes/hr-VISUAL-batch1.md`, `hr-H2.12-visual.md`, `hr-VIS-1.md` · `visual-hr.mts` · `hr-ui-inventory.json` · F16.8. `HANDOVER-H3.md`/`HR-DEBTS.md` are on `wip/hr-h3.10`: read at r1 and pull debts marked H5.1.

## 1. Goal
Every HR screen at 1440/1024/390, th+en, for each viewer kind that changes it. Every inventory control present (or correctly absent) and safe to press. Defects fixed per area and re-walked. No features, no schema.

## 2. Owner rules (requirements)
- **R-PARITY** "real UI must match the approved mockups": sign-off needs MOCKUP | RENDER pairs, not summary JSON.
- **R-LOCALES** "every locale that ships is rendered and looked at": HR ships th+en (F16.4: 1,737 `hr.*` keys in each of `src/messages/{th,en}/common.json`).
- **R-PICTURE** "verify the picture, not that the script ran": HTTP 200 + no overflow is not a verdict. H2.12 left 11 pages "summary only". Not allowed here.
- **R-THAI** plain Thai with correct classifiers (คน/วัน/รายการ/ใบ/รอบ), no codes on th screens. H2.12 found raw `OT`/`DEDUCTION`/`PERSONAL` (fixed in VIS-2).
- **R-NO-฿** managers without a payroll key never see ฿ (owner list 12 Nov). This overrides mockups 01/05.

## 3. "Every button", operationally
1. **Source of truth = `hr-ui-inventory.json` `.rows`** (557 rows on 8fd6f7dc4, 20 pages; H4.3/H4.8 add rows at merge). Fields used: `page testid kind interactive roles hiddenFor conditional expect.type`. The walk reads the rows. It keeps no list of its own.
2. **Gap = interactive control with no row.** F16.8 matches testid ↔ row only. It scans only `modules/hr`, `app/sys/[id]/{hr,payroll}`. It misses `src/app/app/me/hr/**` and `/app/approvals`, and it hides 15 gaps in `F168_*_BASELINE`. It never sees controls **without** a testid (`$debt` = stale H0.4 counts). Add a new read-only `scripts/hr-testid-gaps.mts` over those roots + `me/hr` + HR blocks of `approvals`. It flags every JSX tag where `isInteractive(tag, attrs)` (`scripts/lib/crm-testid-scan.mts:47`) is true and there is no `data-testid`/`testId` (hidden inputs skipped). Output = file:line + tag. Runtime twin: on each shot, find elements in `main` matching `button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button|tab]` with no testid → finding `NO-TESTID`.
3. **Press policy (Q2):** auto-click rows with `expect.type ∈ {navigate, modal, ui, inline-error}`. Open each modal, then close it (Cancel/Esc). For `mutation` rows: check present + enabled (or disabled with a visible reason), open the `*-trigger` sheet and cancel. Never submit. Oracles prove mutations, and submits break the seed (H2.12 `inbox-batch-result` forced a reseed).

## 4. Walk matrix
Viewports (as in `visual-hr.mts`): **1440×900 · 1024×768 touch · 390×844 mobile+touch**. Locales **th, en** via cookie `LOCALE` (`src/i18n/config.ts:5`; add `--lang` to visual-hr).
Viewers (`hr-qc-env.mts:280`): **O** owner · **P** payroll (keys, all branches) · **PB** payroll viewer one branch (**new HQC user `payroll-branch`**, keys + `units:["huahin"]`) · **M** manager, no payroll key · **MB** manager-branch หัวหิน · **S** staff น้ำฝน (linked) · **PS** payrollSelf ก้อย · **K** kiosk · **N** member.

| # | screen (`/app/sys/[hr]/…` unless `/app/…`) | mockup `ledger/design-hr/` | viewers | cells |
|---|---|---|---|---|
| 1 | hub (overview, labour card, inbox preview) | 01-team-overview.png | O P PB M MB S | 6 |
| 2 | hr/employees | 02-employees.png | O P PB M MB S | 6 |
| 3 | hr/employees/[id] (S own → redirect) | 02-employees.png | O P PB M MB S | 6 |
| 4 | hr/roster | 03-roster.png | O M MB | 3 |
| 5 | hr/attendance?view=day | 04-attendance.png (04A) | O M MB | 3 |
| 6 | attendance month น้ำฝน (S = own) | 04-attendance.png (04B) | O MB S | 3 |
| 7 | attendance?view=corrections | 05-leave-ot.png | O M MB S | 4 |
| 8 | hr/kiosk (+ PIN pad after a click, K) | 04-attendance.png + 07-mobile.png | K K-pin O MB | 4 |
| 9 | hr/leave (leave, OT, impact) | 05-leave-ot.png | O M MB S | 4 |
| 10 | hr/requests | 05-leave-ot.png | O P PB M MB | 5 |
| 11a | hr/payroll open period (run v2, hours, opening YTD, stock, cert, accounting) | 06-payroll-run.png | O P PB M MB S | 6 |
| 11b | hr/payroll?bank=paid (bank file, filings, JV) | 06-payroll-run.png | O P PB | 3 |
| 12 | payroll/[run]/slip/[emp] | 07-mobile.png (07c) | O P PB | 3 |
| 13a | reports?report=register | 02-employees.png | O P PB | 3 |
| 13b | reports?report=payroll-month | 01-team-overview.png (month) | O P PB M | 4 |
| 13c | reports?report=time | 01-team-overview.png (month) | O M MB | 3 |
| 14 | hr/settings (incl. LINE, API keys, AI, labour, engine) | 08-settings-ai.png | O M MB | 3 |
| 15 | hr/settings/law | 08-settings-ai.png | O MB | 2 |
| 16 | /app/approvals (HR rows) | — | O M S | 3 |
| 17 | /app/me/hr | 07-mobile.png (07a) | S PS | 2 |
| 18 | /app/me/hr/week | 07-mobile.png | S | 1 |
| 19 | /app/me/hr/requests · ?form=leave · ?form=advance | 07-mobile.png (07b) | S ×3 | 3 |
| 20 | /app/me/hr/pay | 07-mobile.png (07c) | S | 1 |
| 21 | /app/me/hr/pay/[run] | 07-mobile.png (07c) | S | 1 |
| 22 | /app/me/hr/profile (LINE card) | 07-mobile.png | S PS | 2 |

**84 cells × 3 sizes × 2 locales = 504 shots.** **Refusal sweep (th, 1440, HTTP 404 + no HR text): 35 shots.** It covers employees K N · profile K N S(other) · roster S P K N · attendance P K N · kiosk N S PS · leave K N · requests S K N · payroll K N · admin slip M MB S(other) · reports S K N · settings S K N · law S P N · me slip N. **Total 539 PNG.**
**MOCKUP | RENDER pairs: 26 states with a mockup × 3 sizes = 78 pairs** (th, primary viewer O; S for 17–22; K for 8). Mockups are desktop-only (01–06, 08) or mobile-only (07). Still pair every size: the check is that content and order survive the reflow. en is checked against its th twin, not against a mockup.

## 5. Automatic vs looked at
**Automatic, all 539 shots (fail the run):** HTTP = expected per viewer · each inventory row present/absent per `roles`/`hiddenFor` · enabled, or disabled with a visible reason · clicks §3 raise no page error · 0 console errors (except the 404 resource) · no `html/body` horizontal scroll, and no element in `main` with `scrollWidth > clientWidth+1` unless it is marked `data-scroll="x"` (attendance table at 1024 and quota table at 390 are known scrollers) · clipped text (ellipsis/overflow hidden and scrollWidth > clientWidth) listed as WARN · no `MISSING_MESSAGE`, no key pattern `\bhr\.[a-zA-Z.]+` · en: no Thai `[฀-๿]` in `main` except seed names (allowlist from `hr-expected.json`) · th: no raw enum `\b[A-Z][A-Z_]{2,}\b` outside an allowlist (OT PIN PDF CSV GPS KBank SCB BBL KTB LINE AI API) · no raw error (`Error:`, `TypeError`, `Prisma`, `P20\d\d`, stack, `undefined`, `NaN`, `[object Object]`) · tap target ≥ 44 px at 390 for buttons/links (WARN).
**Looked at (agent writes verdicts, the controller opens them, never from JSON):** all 78 pairs → MATCH/MINOR/MAJOR + differences + path. Every screen in en at 1440+390 (contact sheet) for wording. Every viewer at 390 for density/order. Thai wording + classifiers on th. Exceptions ruled earlier (03 demand/AI cards, 01 timeline, VIS-2 no inline money approve) are listed, not re-raised.

## 6. Privacy re-check (automatic, every shot; hit = BLOCKER, stop and report)
- **M MB S K N:** visible text **and page source** (`outerHTML` + every `self.__next_f` RSC chunk) contain no `฿`, no `\d{1,3}(,\d{3})*\.\d{2}`, and none of `baseSalarySatang netSatang grossSatang amountSatang ytdJson bankAccountNo nationalId ssoNumber pinHash pinCode houseRegAddress`. Exception: S/PS own pay pages (20–21).
- **PB:** money only next to หัวหิน home-branch employees. Totals = sum of visible rows. Partial note (excludedHeadcount) shown (H4.2 R1).
- **P/PB:** the limited-viewer notes are present where totals are partial.
- **Lower roles:** ID/bank only `•••4`, no GPS coordinates, no photo keys, no other person's leave reason.

## 7. Seed (deterministic)
`seed-hr-qc.mts` (34 checks, tenant `qc-hr-v2`, 1 v1 paid run, today's roster, 5-kind inbox) lacks most H3/H4 states. Older oracles pin its counts. **Q3 default: new additive `scripts/seed-hr-walk.mts`.** It runs after seed-hr-qc, works through services only, as the owner, with dates relative to `HQC`. It is idempotent with `--dry-run`, prints counts, and writes `scripts/hr-walk-expected.json`. Adds: user `payroll-branch` · ACTIVE copies of the law rows **on lane DB only** (Q7) · a v2 DRAFT run in the open period with hours pulled · slips for the paid run · 1 issued salary certificate + 1 pending request · filings for the paid period (ภ.ง.ด.1, สปส.1-10, one 50 ทวิ) · opening YTD for 2 people (one with an opening, one who started before the first v2 run with none → warning) · POS hourly sales today/yesterday at หัวหิน (if the POS facade cannot be seeded through services, record the labour card's empty state) · LINE: linked (นัท), code pending, never linked, feature ON · API keys: 1 active + 1 revoked · AI: 1 `hr_draft_roster` + 1 `hr_flag_pattern` proposal · KBANK_PCT enabled + 1 bank-file manifest. Every walk/re-walk: seed-hr-qc → seed-hr-walk → shots.

## 8. Machine plan
- **ONE build** after H4.3 + H4.8 + H4.9 (SYNC) merge; record the sha. Ledger record (`hr-H2.12-visual.md:3,61`): `next build --webpack` in `scripts/iso.sh` **ISO_MEM 16G, heap 14336** (8192 OOMs), lane env `.env.qc-hr` via `scripts/qc-hr.sh`, through `acc-v2-serve.sh` (`ACC_V2_BUILD_FLAGS=--webpack`, build inside `with-gate-lock.sh`), `SHARK_TSC_PREBUILD_OK=1` for main's `REPLY_RATE` export, which main 4d6ef6ee7 removed, so try without the flag (Q10). Reconstructed command (no committed script): `ISO_MEM=16G bash scripts/iso.sh bash scripts/qc-hr.sh env NODE_OPTIONS=--max-old-space-size=14336 ACC_V2_BUILD_FLAGS=--webpack ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh build`.
- **Exclusive:** it holds the gate lock and blocks every typecheck. H2.2's builds took **≈12 min each** (`HR-METRICS.md`). Plan 12–30 min on a busy box. Announce the window and queue nothing.
- **Serve:** own systemd unit **`hr-qc-serve-3226v`**, port **3226** (`… qc-hr.sh env ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start`), outside the iso scope (dies with it). Stop **by unit name** after the walk.
- **Lane:** lane 1 `/root/projects/shark-hr`, DB `wo-hr-qc-l1`, frozen until the re-walk ends. Shots are CONTROLLER-RUN (Sonnet may run/copy; Opus writes verdicts).
- **Outputs:** `.qc-shots/hr/H5.1/<lang>/<row>/<key>-<viewer>-<WxH>.png` + `summary-<viewer>-<lang>.json` · `sheets/<row>-<viewer>-<lang>.png` = **1440 | 1024 | 390 side by side** · `pairs/<row>-<WxH>.png` = mockup | render · copy to `/root/qc/hr-h5.1/` (dir must be created) · verdicts `ledger/wo-notes/hr-H5.1-walk.md`.
- **Tooling (this ticket):** visual-hr `--lang`, user `payroll-branch`, spec `"5.1"` (this matrix; it also covers the never-shot 3.6, 3.7, 3.4-YTD, 4.3, 4.8), §5/§6 checks; new `hr-walk-sheets.mts` (image composition) and `hr-testid-gaps.mts`.
- **Controller review:** opens every contact sheet and all 78 pairs. It does not sign off a pair it did not open.

## 9. Defects
Record = `{id, BLOCKER|MAJOR|MINOR, file, testid|NO-TESTID+selector, viewer, size, lang, png, expected (mockup + region, or owner rule), actual}` in `hr-H5.1-walk.md`. **One fix batch per area** (VIS-1 pattern, not counted in 44): VIS-5a time (roster, attendance, kiosk, corrections) · 5b leave/requests/approvals · 5c money (payroll, slips, reports, bank/filings) · 5d hub/people/settings/law · 5e ของฉัน · 5f i18n/wording. Each batch: builder → area `qc-hr-h*` + `qc-hf-hr-privacy` + fitness-hr (pinned hunks → controller ORACLE-EDIT). Then **one rebuild** for all batches → re-walk **only the affected rows** (all their viewers × 3 sizes × 2 langs + pairs) → the controller looks. BLOCKERs are fixed at once.
Debts to close or rule: D-VIS1-tabs (404 tabs for S/K/N, tab strip overflow at 1440; pinned by h4.4 S13.5 + h2.2 S1.3) · VIS-1 minors (method column, 16 px checkboxes, ปุ้ย twice on kiosk, raw settings template text, Gregorian native dates/holiday year) · H2.2 minors (dot on dark chip, "ลาพักร้อน" wrap at 1024, long-press drag on a real device) · H2.12 MINORs (narrow settings column vs 08 side menu, hub ≈45 % width, staff leave picker) · H2.2 D18/D19 · D-H34-damage-cause UI · H3.9 D-3 delete warning · H3.8 tone-mark overlap in PDF (open one PDF per locale).

## 10. Acceptance checks
1. `hr-testid-gaps`: 0 untriaged controls. Each kept one has a reason in the walk note.
2. F16.8 roots + `me/hr` + approvals; green; baselines not grown.
3. Every inventory row visited for every viewer in `roles ∪ hiddenFor`, at least at 1440 th (log = summaries).
4. 539 shots; 0 script failures after the batches.
5. §6 privacy: 0 hits on the final walk.
6. 78 pairs with verdicts; 0 MAJOR open; every MINOR fixed or ruled.
7. en: 0 MISSING_MESSAGE/key leaks/Thai leftovers. th: 0 raw enums.
8. No page-level horizontal scroll at 390; declared scrollers listed.
9. Re-walk covers every affected row × 3 sizes × 2 langs; the controller opened each changed pair.
10. After the last batch: payroll regression set + `qc-hf-hr-privacy` + fitness-hr + clean typecheck (pm-full).
11. `seed-hr-walk` ×2 = same counts; other tenants unchanged.
12. Serve unit stopped by name; 0 leftover sessions with UA `qc-visual-hr`.

## 11. Out of scope
Native mobile app (Expo) · e-mails and LINE message bodies · PDF layout beyond one open per locale · prod data · new features or mockup redesign · performance · the H5.2 privacy/money hunt · the H5.3 prod runbook.

## QUESTIONS FOR THE CONTROLLER
- Q1 Walk en at all 3 sizes? **Default yes**: R-LOCALES; automatic checks carry most of the +252.
- Q2 No submits, mutations only open/cancel? **Default yes**: oracles prove the mutations, and a submit breaks the seed.
- Q3 Additive `seed-hr-walk.mts` instead of editing seed-hr-qc? **Default yes**: the 34 pinned seed checks stay valid.
- Q4 New HQC user `payroll-branch`? **Default yes**: the H4.2 branch money rule has no screen proof yet.
- Q5 Include the "not linked" ของฉัน state for O/N? **Default yes, 390 th only**: it is a real first-day state.
- Q6 Refusals at 1440 th only? **Default yes**: a 404 does not depend on size.
- Q7 ACTIVE law rows on lane DB l1 only? **Default yes**: without them the v2 screens are empty, and real data still waits for the accountant.
- Q8 Hide tabs that 404 (ORACLE-EDIT h4.4 S13.5/h2.2 S1.3)? **Default yes, in VIS-5d**: no dead ends for staff.
- Q9 Six fix batches VIS-5a…f, not counted? **Default yes**: same as VIS-1/VIS-2.
- Q10 Build without `SHARK_TSC_PREBUILD_OK`? **Default try without, fall back with a note**: main removed the cause.
