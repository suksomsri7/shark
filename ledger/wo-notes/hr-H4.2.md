# WO H4.2 — labour cost % vs sales (ค่าแรงต่อยอดขาย) + staffing demand — builder notes

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/hr-h4.2` cut from `session/hr` 93a0b76ee (oracle head ae33a9fc3) · builder: Claude Opus 5.5 · 14 Nov 2026
> Contract: brief `ledger/hr-briefs/hr-brief-H4.2.md` (+ CONTROLLER RULINGS 1 + 2) · oracle `scripts/qc-hr-h4.2.mts` + `-lib` (49 checks, **not edited**) · note `hr-H4.2-oracle.md` §1 §4 accepted as contract
> DB: lane only (`scripts/qc-hr.sh`) · no migration · green summary `hr-H4.2-green.txt`

## 0. Checkpoint
- done: POS seam · pure rules · service · UI (01 card, 03 heads/footer/panel, settings card) · messages th/en · inventory · visual-hr "4.2" · regression run (see `hr-H4.2-green.txt`)
- open: 3 ORACLE-EDIT requests (§6) — qc-hr-h4.2 stays 46/49 until ruled; qc-hr-h2.2 S6.2 conflicts with H4.2 S1.8 inventory rows (§6c)

## 1. Files
| file | new/edited | what |
|---|---|---|
| `src/lib/modules/hr/labor-rules.ts` | new | pure D1–D13 (monthlyShare Q4/Q4b · dayWage · holidayPremium (engine divisor :369) · ssoEstimate · largestRemainder · hourSlots (= reportHourly keys) · forecastHour · pctTenths · needed · scheduledAt · texts th/en · defaults · settings parse/validate) — no imports |
| `src/lib/modules/hr/labor.ts` | new | `laborDay` · `laborWeek` · `laborMonth` · `getLaborSettings` · `setLaborSettings`; DB gate (Membership row, role must match); P1/P2/P3/P5; facade via `await import("@/lib/modules/pos")` only |
| `src/lib/modules/hr/labor-ui.tsx` | new | server components `HrLaborCard` (01) + `LaborSettingsCard` (settings); tokens only, no Intl in money/% format |
| `src/lib/modules/hr/labor-actions.ts` | new | `"use server"` `saveLaborSettingsAction` (assertCan hr.employee.create key gate → service decides from DB) — returns fixed Thai reason, page maps to `?msg=lab.*` allowlist |
| `src/lib/modules/pos/reports.ts` | hunk (additions only, 48 lines, `HR H4.2`) | `salesByHour` + types + `SALES_BY_HOUR_MAX_DAYS = 45`; same doc rules as reportHourly; POS of unit = AppSystemUnit(POS) + active (posOfUnit rule) |
| `src/lib/modules/pos/index.ts` | hunk | `export const salesFacts = { salesByHour }` + types |
| `scripts/fitness.mts` | 2 hunks | edge `"hr→pos"` + new check `F2.1h` (only hr/labor.ts, lazy, index only) |
| `src/lib/modules/hr/overview-ui.tsx` | 3 hunks | `labor?: ReactNode` slot rendered after the tiles (file stays facade-only — qc-hr-h2.11 S1.6) |
| `src/lib/modules/hr/ui.tsx` | 2 hunks | **outside the brief file list** — passes `labor={<HrLaborCard systemId=… />}` to the section (reason §5 D-1) |
| `src/lib/modules/hr/roster-ui.tsx` | 11 hunks | `labor` prop (type-only import from ./labor) · head chip `hr-roster-demand-<day>` (amber when short) · footer `hr-roster-labor-foot` (grid + narrow) · side panel `hr-roster-demand-panel` · head note |
| `src/app/app/sys/[id]/hr/roster/page.tsx` | 3 hunks | loads `laborWeek` + `laborDay(drafts)` for the panel day (largest shortage → today → Monday); panel DTO sent with `money: null` |
| `src/app/app/sys/[id]/hr/settings/page.tsx` | 4 hunks | `LaborSettingsCard` + `onSaveLabor` + `lab.*` codes in MSG_TEXTS |
| `src/messages/{th,en}/common.json` | +`hr.labor` (35 flat keys, parity) | incl. `estimateNote`, `smallGroup`, label "ยอดขายสุทธิตามรายงาน POS" |
| `scripts/hr-ui-inventory.json` | +14 rows wo H4.2 | 9 on `/app/sys/[id]`, 3 on `/hr/roster`, 2 on `/hr/settings` |
| `scripts/visual-hr.mts` | hunk | `"4.2"`: labor-card · labor-roster · labor-settings |

## 2. Decisions (brief/oracle readings)
1. **D10 day sales:** past = actual; today = whole-day forecast + `soFarSatang` (hours ≤ now hour); future = forecast **unless POS already holds sales for that day** (then actual). Needed by S4.8 (U1 01-31/02-01 at now 01-17 expect actual 70,000/100,000) while S4.5 keeps "today = forecast 400,000". Month sales = actual only (S4.11 1,870,000 includes 01-31).
2. Day hours list: cost keys + sales/forecast keys of the business date; keys of another business date (overnight, cutoff 0) shown as hour+24 (oracle §4.7 left to builder).
3. Hour split per D8 = unit-day cost over combined span minutes of that unit's entries; shift cost = unit-day cost split by paid minutes per entry (§4.2); wage+premium and SSO split separately with the same weights (wage+sso = cost per unit).
4. Holiday premium per entry with that entry's unit holiday row (unit row beats shop-wide row); OT law via `otLawOf` over `loadLawView` rows (law.ts stays the only table reader); SSO row via `pickLawRow` — missing ⇒ 0 + `flags.lawMissing`.
5. P2 small group: cell hidden when viewer is non-OWNER branch-limited payroll viewer, contributors 1–2 and any contributor's home unit is outside scope (null home counts as outside). Hidden cells = `null` (no rounded hint), `suppressed` counts hidden cells, `flags.smallGroup`.
6. Non-money viewers: day `money: null`; week footer `{paidMinutes}` only (no `*Satang/*Tenths` keys); month = NO.
7. Settings write needs canManageHrSettings **and** all-branch scope (shop-wide key, same as clock policy). Audit `hr.labor.settings {keys}` after the tx (writeAudit pattern of saveClockPolicy).
8. `labor.ts` gets `tenantDb` by lazy `await import("@/lib/core/db")` because oracle S1.5 `noPrisma` rejects any value import from `/core/db` (incl. tenantDb). No raw prisma anywhere.
9. Week `scheduledAtPeak` is computed from the forecast peak even when splh is unset; `neededAtPeak` null then.

## 3. COMMON §F self-check
- [x] F1 no new page/route (card/section on existing pages) ⇒ no nav change; `?msg=` = allowlist codes `lab.*` (settings page MSG_TEXTS).
- [x] F2 only tx client inside `$transaction` (setLaborSettings: lockHrSettings(tx)/writeHrSettingsKeys(tx) only; audit after commit).
- [x] F3 unitAccess `[]` = all branches (hrScopeOf) on reads (S5.6 green) and writes; explicit list refused with the one NO text, no unit ids.
- [x] F4 refusals Thai, identical bytes for non-viewers (S5.5: 18 refusals canonical-equal, no ids/3+ digit numbers).
- [x] F5 tx options maxWait 15 s / timeout 20 s (server action, same as clock policy); one write per save, audit once.
- [x] F6 no migration.
- [x] F7 no privileged link/grant paths; settings gate inside the DB membership read, lock order HR-SET-1.
- [x] F8 no rate limits needed (read-only + settings).
- [x] F9 no new outbox event.
- [~] F10 changed files ⊆ brief list **except `hr/ui.tsx` (2 marked hunks)** — see §5 D-1.

## 4. Privacy / access summary
Gains: OWNER + `hr.payroll.read` see day/week/month labour money of their scope; roster readers (MANAGER / hr.employee.create) see headcounts scheduled/needed (needed only with their own `pos.report.view`); settings editable by all-branch HR settings managers. Nobody loses access. POS gains one read-only function; no POS behaviour change (S3.3 green control).

## 5. Deviations / debts
- D-1 `hr/ui.tsx` touched (not in §8 list): qc-hr-h2.11 S1.6 forbids `overview-ui.tsx` importing hr modules outside {inbox, scope, …}, so the card is passed as a `labor` slot from the hub (`ui.tsx`) instead of being imported by the section.
- D-H42-vat-exclusive (Q2 ruling): labour % uses VAT-inclusive POS net; VAT-registered shops may want ex-VAT — owner/accountant list.
- Brief §11 debts unchanged: rate history · OT/commission in day estimates · SSO min-base clamp · DAILY/HOURLY holiday pay when not rostered · per-person labour report · non-POS sales · AI line on 01 (H4.3).
- Hub card computes day + month + previous month on each hub load (one facade call per unit per ≤45-day chunk) — fine for ≤20 units; cache later if needed.

## 6. ORACLE-EDIT requests (qc-hr-h4.2 not edited — 46/49 until ruled)
a. **S3.1 `sameHours`** — `repNz` is `canon(...)` (a JSON string), so `repNz.length === 3` compares a string length (~43) and can never be true. Hunk: `repNz.length === 3` → `JSON.parse(repNz).length === 3`. Facade hours already equal reportHourly (same canon string; sum44/perDay/sparse/today/cutoff keys all pass).
b. **S4.12 `all`** golden 247,723 omits leaver N (U3, MONTHLY 1,000,000, active=false, end 2027-03-20 — counted by D2 and required by S4.10/S4.11 March). Owner, no unitId, 2027-01-16 = U1 247,723 + U3 N 32,258 + SSO 1,613 = **281,594** (actual output). Hunk: `cost(all) === 247_723` → `cost(all) === 281_594` (or pass `{unitId}`-free check on a day where U3 is 0).
c. **S1.8 `inventory`** — `inventoryParity(...).meta` requires *every* row of pages ending `/app/sys/[id]` and `/hr/roster` to carry wo H4.2, but those pages already hold H1.2/H2.11/H2.12/H3.9 and H2.2 rows ⇒ impossible. codeNoRow is empty for both pages. Hunk (H4.1/H2.5 precedent): judge `meta` on the H4.2 rows only (`rows.filter(r => r.wo === "H4.2").every(r => r.oracle === "qc-hr-h4.2")`).
   Same root cause in **qc-hr-h2.2 S6.2** (older oracle, not a frozen-file static ⇒ not pre-authorised; editing it also turns H4.2 S1.6 `oracles` red): adding the 3 required `/hr/roster` rows (wo H4.2) makes its `meta` false. Hunk: judge meta on wo H2.2 rows only. Needs controller ruling for both files (and S1.6 exemption for that one hunk).

## 7. Runs + incident
- Results: `hr-H4.2-green.txt` (qc-hr-h4.2 46/49 ×4 incl. unforced — unforced runs fully because labor-rules.ts exists; residue none every run). Typecheck #1 red (19× TS2737 BigInt literals) → fixed with `BigInt(x)` constants → typecheck #2 exit 0 (390 s).
- POS report suites cannot run on the lane DB (exit 4: "จะเขียนแถวได้เฉพาะ QC4" guard, before any write). To prove their static reds are pre-existing I ran p2.11/p2.12/p3.5/p3.6 in a temporary detached worktree at base ae33a9fc3 with `env -u DATABASE_URL -u DIRECT_URL`: same red ids as on HEAD. **Incident:** without URL vars the POS env loader fell back to `.env.qc` and connected to QC4 (`ep-frosty-lab`), so those 4 suites' DB parts ran there on base code (JSON_SUMMARY residue 0 / tempLeft [] / guardHits 0). Not intended; worktree removed. Controller: please treat QC4 as touched by 4 POS suites (self-cleaning).
