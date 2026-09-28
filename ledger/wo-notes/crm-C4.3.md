# WO C4.3 — every form (oracle/runner writer · 27 ก.ย. 2569 · worktree `shark-crm-c43` @ 18feaa84 · QC3)

> สถานะ: **PHASE 1 จบ** (runner + shared restore module + addendum · in-process พิสูจน์บน QC3) · รอผู้คุมงานเปิด QC server
> จาก HEAD แล้ว resume เพื่อ PHASE 2 (browser บน QC1 ผ่าน gate lock) · ไม่ commit · ไม่แตะโค้ด product · ไม่แตะ
> `qc-crm-buttons.mts` (เจ้าของคือ C4.2) · ไม่ reseed QC3 (ดู §3)

## §1 Files

| file | status |
|---|---|
| `scripts/qc-crm-forms.mts` | NEW — runner (~1,670 lines): 24 source-verified form specs + in-process pass (f, DB side of c/d) + browser pass (a–e, render side of c) + positive controls (in-process 8 · browser 10) + `--dry` / `--selftest-browser` / `--inproc` / `--browser-only` / `--form` / `--cat` |
| `scripts/lib/qc-crm-restore.mts` | NEW — shared SNAPSHOT/RESTORE copied from `qc-crm-buttons.mts` + `MemberSection` in the model list + `purgeAppendOnlySince()` + `verify()` + `unprotect()` (addendum §4) |
| `ledger/crm-briefs/crm-brief-C4.3.md` | NEW — oracle-proposed contract (DECISIONS D-b1 … D-fx1, per-form table, findings) |
| `ledger/wo-notes/crm-C4.3.md` | this file |
| `.qc-shots/c43/` | `qc3-crm-expected.json` (QC3 answer key copy) · `inproc-1.log` · `inproc-2.log` · `typecheck-*.log` |

## §2 Results (QC3, in-process)

- `--dry`: 24 forms · 237 in-process checks · ≈316 browser checks · spec coverage 24/24 (no missing / ghost spec) ·
  every spec field testid is a registry row.
- `--selftest-browser` (synthetic pages, no server/DB): **10/10** positive controls — alert→`dialog`, form-level box→
  `not-under-field`, `required`→`native-bubble`, no focus→`no-focus`, disabled→`silent-disable`, correct form→pass,
  innerHTML→executed/injected, textContent→clean, double-click driver 2 submits unguarded / 1 guarded. (Run #1 was 9/10:
  the control exposed a harness bug — `setContent` keeps the window so the XSS flag leaked; fixed.)
- `--inproc` run #1: 241/257 · restore identical=false (2 MemberSection + 1 OpsEvent leftovers → module fixed, rows
  removed by id) · 13 of the 16 failures were harness bugs (company args dropped taxId/website/email; sequence step
  columns read from the wrong table; REST path-param cases; visibility/member probes too narrow; composer fixture lacked
  consent), all fixed.
- `--inproc` run #2: **259/262** · positive controls **8/8** · blockedFetch 0 · restore **identical=true**
  (purged AuditLog 241 · OutboxEvent 113 · AppNotification 1 · ApiIdempotency 27 · OpsEvent 1). By category:
  f 102/103 · c 139/140 · d 18/19. Advisories 29 (13 "no server dedupe" d, 14 message-text f, 1 client-only rule,
  1 silent cut the UI cannot reach). Skipped 3 (team room a/c/d — no MEETING rooms in the seed).
- `--inproc` run #3 (after the phase-2 robustness edits: deal contact `@first`, empty-target fix, https cookie, `mirror`,
  WebhookDelivery purge): identical to run #2 — 259/262 · 8/8 · identical=true · blockedFetch 0 (`inproc-3.log`).
- `pnpm typecheck` (5120 MB, gate lock): **exit 0** (`typecheck-2.log`, started 14:46 after the last edit at 14:42).
- The 3 failures are product findings (addendum §5): phantom `TeamMember{userId:""}` (`src/lib/core/teams.ts:57`),
  parallel duplicate lost-reason labels (`lost-reasons.ts:74`), ZWJ stripped from activity titles (`activities-shared.ts:63`).

## §3 QC3 state

No reseed was needed: QC3 is at migration `20261102000000_crm_v2_c` (= HEAD), CRM seed intact (60 deals · 80 contacts ·
21 companies incl. the backfill text company). 6 `qc-` pipelines pre-existed from another suite (not mine, untouched —
the snapshot keeps them). Every run of this runner leaves the tenant byte-identical (verify()).

## §4 Phase 2 (browser) — what the controller needs to know

- Needs: production QC server from HEAD on QC1 (`QC_BASE`), `CRM_EXPECTED_PATH` = QC1 answer key, gate lock. The runner
  never starts a server and refuses a DB that does not match the key.
- Expected from source (addendum D-b1): **b ❌ on almost every form** (no component calls `.focus()`; 20/24 use one
  form-level box; `crm-api-key-form`/`crm-api-hook-form` use native `required`). Decide D-b1 before reading the gate.
- `crm-email-composer`: browser runs b only (guarded, server-action POSTs aborted); thread = run fixture (scheduled 2099).
- Not yet exercised in a browser: openers/pickers per form (`team-card@<id>`, activity target picker, deal contact
  `@first`), the render checks, the 80 ms double-click on real forms. Expect a first-run harness pass the same way
  in-process needed one (13 harness bugs → 0).

## §5 PHASE 2 (27 ก.ย. ~15:35 UTC →) — browser + ruling

**Controller ruling applied in the runner:** owner × 390 (`@390` suffix) for a/b/e · `staff:thana` f check (a
refusal must be a clean Thai `{ok:false}`; a form the registry hides from thana (`hiddenFor`) must be refused by the
server — acceptance = `server-allows-hidden`; accepted on a form thana may use = advisory) · `--part`/`--merge`
(parts ≤15 min under the shared lock; merge keeps the latest result per form·cat·check·mode) · `--device`.

**Runner fixes from real pages (QC1 server :3215, ce728fd8):**
1. `/activities` render: NOTEs never appear in the default "pending" list (`activities.ts:891`) → render URL
   `?status=done&type=NOTE&contactId=` (was a false `not-visible-as-text` ×5).
2. Double-click driver used raw mouse coordinates without scrolling → a submit below the fold was never hit
   (`crm-api-hook-form` d: 0 POSTs). Now `scrollIntoView` first + NEW positive control `PD-below-fold` (browser controls 11).
3. Straggler writes: the probe returned at the first row of a multi-row action (bulk enroll) and the per-check restore
   ran while the server action was still inserting → next check saw Δ13/Δ14 rows. Now: page waits for network idle
   before close/restore + probe polls until the count is stable. Bulk b/d/e clean after the fix.
4. d diagnostics (POST statuses + message) · restore log per model (`[CrmSequenceEnrollment d50 …]`).

**QC1 partial run** (21 of 24 forms, before the switch): `.qc-shots/crm/forms/parts-qc1/b1…b6b.json` — every part
restore identical=true, positive controls all caught. Kept for reference; the deliverable is the QC3 run (§6).

**Switch (controller, ~16:50 UTC):** QC1 lock congested → second server `:3216` on **QC3** (same build ce728fd8,
SHARK_AI_MOCK=1). Full re-run on QC3 via `.qc-shots/c43/run-qc3.sh` (parts i1 + q01…q10 → merge).

## §6 STATE AT QUOTA STOP (controller alert, ~17:40 UTC) — resume from here

- Nothing in flight. Last chain `.qc-shots/c43/run-qc3.sh` (QC3 server :3216 · QC3 DB · QC3 lock · key
  `.qc-shots/c43/qc3-crm-expected.json`) finished: parts i1 + q01…q10, **every part restore identical=true**, positive
  controls in-process 8/8 + browser 11/11 in every part. Merge → `.qc-shots/crm/forms/summary.json`:
  **572/651 · failures 79 · restoreIdentical true** (`failuresByKind` inside; logs `.qc-shots/c43/q3-*.log`).
- Known product findings confirmed on QC3: 1 phantom TeamMember (f required:userId) · 2 lost-reason parallel dup (d) ·
  3 activity ZWJ (c emoji) · **4 CONFIRMED**: crm-api-key-form + crm-api-hook-form `staff:thana` → THROWN (gate outside try).
  The rest are strict-b kinds (no-focus / not-under-field / native-bubble / silent-disable) = the C4.3-fix part 2 list.
- Pending runner item: activity-log-form `/activities` render ×5 were a RUNNER bug (browser target picker takes the first
  name match ≠ ctx.contactId). FIXED in the runner after q03 ran (render URL now reads contactId from the stored row) —
  NOT yet re-run. q10 (composer/team room) 4 failures not yet read.
- `pnpm typecheck` NOT re-run since the phase-2 edits (last exit 0 was before them).
- NEXT (after reset, QC3 only):
  1. `cd /root/projects/shark-crm-c43 && bash scripts/iso.sh env CRM_EXPECTED_PATH=$PWD/.qc-shots/c43/qc3-crm-expected.json QC_BASE=http://127.0.0.1:3216 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --browser-only --form activity-log-form --part q03b`
  2. `pnpm exec tsx scripts/qc-crm-forms.mts --merge` (latest result per check wins) → read q10 + failuresByKind
  3. `env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck`
  4. update addendum §5 + handback (per-form failure list by kind).
- QC1 partial run (before switch) archived in `.qc-shots/crm/forms/parts-qc1/` (all parts restore identical).

## §7 RESUME after quota reset (QC3 :3216)
- q10 read: composer b ×4 were a RUNNER bug (the guard pushed aborted server-action POSTs into `dialogs` ⇒ "dialog"); now a
  separate `kit.blocked` counter → re-run q11: composer b = genuine `not-under-field` (message box ABOVE the fields, −165…−389 px).
  Team room: all a–e SKIPPED (no MEETING rooms in the seed — form renders a text) · only f ran in-process.
- activity render: second RUNNER bug — the browser form defaults to type CALL (not NOTE), `type=NOTE` filter hid it
  (probe on QC3, test row deleted). URL now `?status=done&scope=team&contactId=` → q12: all render checks ✅; browser
  emoji now labelled `zwj-stripped` (finding 3).
- Parts on QC3 so far: i1 q01…q10 q11 q12 — all restore identical, positive controls all caught.
- Merge (13 parts: i1 q01…q12): **577/651 · positive controls 140/140 · restore identical all** · 74 failures =
  6 fixedInMain:130ca0c1 + 68 strict-b. Work-order list for C4.3-fix part 2 → addendum §8 (22 forms).
- Runner changes in this resume: `kit.blocked` (guard POSTs ≠ dialogs) · activity render URL without type filter ·
  browser `zwj-stripped` kind · merge: a later part replaces all of a form's earlier results per mode · `fixedInMain` tags.
- `pnpm typecheck` (5120 MB, gate lock) after all phase-2 edits: **exit 0** (`typecheck-3.log`). Phase 2 DONE.

## §8 REVIEW FIXES (B1 B2 S3–S8 + notes) — 27 Sep late
- B1 merge supersedes per form·category·mode·device group only; gate requires every planned check (check-level for f/a/b/d/e,
  group-level for c/d-inproc) present or explicitly skipped → `missingPlanned[]`. Controls PM-partial-rerun · PM-missing-planned.
- B2 restore module: read errors throw in snapshot/restore/verify (only an absent model is tolerated, listed). Controls on an
  in-memory fake prisma: PH-restore-readfail-snapshot · PH-restore-readfail-restore (throws, 0 deletes) · PH-verify-leftover.
- S3 aria-describedby counts only when VISIBLE and NEW. Controls PB-describedby-static (→ not-under-field) · PB-describedby-hidden.
- S4 whole-table state (count/fingerprint per form, `STATE`) on every refusal/abandon check. Control PC-state-untagged-row.
- S5 object-import c: payloads go into the title cell → import → stored → CSV export neutralised (overlong explicitly skipped: title = 200 by design).
- S6 render: `gotoRender` requires a ≥200<400 response + same pathname; search/filter/query-echo inputs ignored.
  Controls PR-searchbox-echo · PR-goto-failed · PR-goto-404.
- S7 refuses to start unless an ancestor `flock` holds the gate lock of ITS DB (host → lock) and QC_BASE is local. Control PH-lock-guard;
  proven: a run without the wrapper exits fatal before touching data.
- S8 provenance per part (head · HEAD:src · dirty · runner sha · server pid/cwd/BUILD_ID/build commit → build src tree); merge refuses
  mismatches (PM-provenance · PM-build-src).
- Notes: a fails on page errors · d counts Party/CrmDealContact side rows · REST Thai check reads error.message_th only.
- Old parts archived → `.qc-shots/crm/forms/parts-prehardening/`. Re-run: `.qc-shots/c43/run-qc3-v2.sh` (typecheck + i1 + q01…q10 + merge).
- v2 chain (i1 + q01…q08 done, every part restore identical) died with the container restart ~00:20 (q09/q10 never started —
  no restore interrupted). It exposed a RUNNER bug: deal side-row probe counted CrmDealContact, which createDeal never writes
  (side 0 in-process too) → now CrmDealStageHistory (deals.ts:725). Runner hash changed ⇒ v2 parts archived to
  `parts-v2/`; full v3 re-run as systemd unit `c43-forms-v3` (`.qc-shots/c43/run-qc3-v3.sh`, log `run-qc3-v3.out`).
- **v3 DONE (unit c43-forms-v3, 28 Sep ~00:30→01:55 UTC, QC3 :3216):** typecheck exit 0 (`typecheck-5.log`, final runner) ·
  merge **585/659** · positive controls **217/217** · restore identical in all 11 parts · missingPlanned 0 · provenance problems 0
  (one runner sha ce208879 · src 963d16bc = build ce728fd8:src · BUILD_ID Hdguns9GH9DuvBNdnUSlM) · 74 failures = the SAME set
  as the pre-hardening run (diffed: 0 new, 0 gone) = 6 fixedInMain:130ca0c1 + 68 strict-b. +8 checks = object-import c (S5).

## §9 REVIEW ROUND 2 SHOULD-FIX (28 Sep) — applied, merge re-run on the unchanged v3 parts
- Skips never supersede results (only results/advisories do). A skip covers only the planned checks named in `covers` of an
  explicit allowlist `ALLOWED_SKIPS` (the 32 current skips, each with its reason); any other skip ⇒ `unlistedSkips` ⇒ gate red.
  Controls: PM-skip-no-erase · PM-unlisted-skip · NM-listed-skip (negative).
- Probe/state -1 ⇒ `probe-error`, never clean; `assertProbes()` per form (in-process + browser) before any check.
- describedby: the new text node must lie INSIDE the describedby element (text + box). Controls PB-describedby-elsewhere, PB-describedby-good (negative).
- Leftover row in a tenant table OUTSIDE the snapshot list: PH-verify-leftover-outside.
- Merge now also re-runs the no-DB harness controls with the current runner (under the QC3 lock).
- Result (unit `c43-forms-r2`): typecheck exit 0 (`typecheck-6.log`) · merge **585/659** · positive controls **225/225** ·
  restore identical 11/11 · missingPlanned 0 · unlistedSkips 0 · provenance problems 0 · failures = the same 74
  (6 fixedInMain:130ca0c1 + 68 strict-b). `--selftest-browser` 17/17. Gate red only because of those 74 (expected until C4.3-fix).

## §10 REQUIRED CUSTOM FIELD (controller addition, 28 Sep ~05:30 UTC)
- `CUSTOM_REQ` (company-new-form · contact-new-form): fixture = one REQUIRED TEXT field ("รหัสอ้างอิงลูกค้า QC" /
  "รหัสอ้างอิงผู้ติดต่อ QC", key `qcformreq`) created through the product's designer actions (createObjectSection/FieldAction)
  INSIDE the snapshot window and removed by a restore right after its checks (never visible to the other checks).
- f in-process: `custom valid (action)` (baseline, with value) · `required:custom (action)` · `required:custom (REST companies|contacts.create)`.
- b browser 1440 + 390: `required:custom` / `required:custom @390` — field located by its LABEL (survives a testid change);
  message must be NEW Thai text under THAT field + focus on it. Planned checks added; ALLOWED_SKIPS unchanged.
- Controls: PB-custom-formlevel (error in form-level box → not-under-field ✅ caught) · PB-custom-good (negative, passes).
  `--selftest-browser` 19/19.
- Run: systemd unit `c43-forms-cf1` (`.qc-shots/c43/run-custom-cf1.sh`, log `cf1.log`, part → `parts-custom/cf1.json`,
  kept apart from the v3 parts because the runner hash changed). `--only-custom` flag.
- cf1 exposed a gap in the new b check itself: on company/contact the form-level box (`company-new-error` / `contact-new-error`)
  sits DIRECTLY under the custom fieldset, so geometry called it "inline" (only focus failed). Fix: the custom checks pass
  `formLevel: [spec.errorBox]` → the form's own box never counts as under-the-field (kind `form-level-box`). Control
  PB-custom-formlevel-adjacent (caught). `--selftest-browser` 20/20. cf1 archived in parts-custom/ (superseded).
- **cf2 (unit c43-forms-cf2, QC3 :3216 = build ce728fd8, BUILD_ID Hdguns9GH9DuvBNdnUSlM — NOT main; the old build still serves 3216):**
  typecheck exit 0 (`typecheck-8.log`) · 10 checks: 2 ✅ (custom valid baseline) · 8 ❌ RED as expected · controls 35/35 ·
  restore identical. f: action AND REST **accept** a company/contact without the required custom value (new product finding —
  server-side required-custom enforcement missing on create) · b (1440+390): message = form-level box, not under the field.

## ✅ C4.3 ACCEPTED by controller (28 Sep 2026 ~18:10 UTC)
- Oracle: qc-crm-forms.mts (24 forms · a–f · required custom fields · 256+ positive controls) — reviewer 2 rounds + probe/select-wait ORACLE-EDITs by controller.
- Product: C4.3-fix part 1 (130ca0c1) + part 2 (c6fe26d2: inline field errors on 22 forms + server-side required custom fields) — reviewers MERGEABLE.
- Acceptance run on MAIN / QC1 against the server built from committed c6fe26d2 (`.qc-shots/crm/c43-accept2.log`): **669/669 · positive controls 0 missed · restore identical ×12 · missingPlanned 0 · unlistedSkips 0**. Gate flag false ONLY from provenance "src/prisma had uncommitted changes" on the 10 BROWSER parts: batch C5.4-B was merged into the working tree (uncommitted) while they ran — those parts exercise the SERVER (clean committed build c6fe26d2), not the working tree; the in-process parts (oc1, i1) ran on a clean tree. Controller judgement: product under test = committed c6fe26d2 ⇒ accepted.
- Follow-ups: N2 FieldError inside <label> (screen readers read twice) · N3 server-side dedupe on company/contact double submit → batch E.
