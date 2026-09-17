# Phase C4 — every button works (C4.1–C4.4)
Read `crm-brief-COMMON.md` and MASTER-PLAN §7 first. Prerequisite: phases C1–C3 closed, QC server built from HEAD.

## C4.1 — complete the registry
- For every CRM route (list from `src/app/app/sys/[id]/crm/**`, `/app/settings/teams`, the portal folder, the chat CRM panel, public pages `/t/*`, `/l/*`, unsubscribe, form embed) enumerate interactive elements from the built DOM with a crawler mode of `scripts/visual-crm.mts` (`--inventory`): buttons, links, tabs, menus, toggles, selects, inputs, drag handles. Every one needs `data-testid` + an inventory row (schema MASTER-PLAN §7) with `roles`, `hiddenFor`, `expect`.
- Cross-check against the 17 mockups: count controls in each `ledger/design-crm/NN-*.body.html`; every mockup control is either implemented (row exists) or listed in `ledger/wo-notes/crm-C4.1.md` with the reason and the owner-facing consequence.
- Fitness F14.1/F14.2 green with an EMPTY baseline (the v1 baseline from C0.1 must be gone or justified).
Acceptance: registry row count reported per page; zero unregistered testids; zero ghost rows.

## C4.2 — press everything (NEW `scripts/qc-crm-buttons.mts`)
For each user in owner, manager, nok, thana, customer(portal) × {1440, 390}: open page → for each row: visible (or ABSENT when in `hiddenFor` — a hidden control that is present = `hiddenLeak`) → act → assert `expect`: modal testid appears / URL matches / a server action or fetch fired AND returned ok AND the stated DB effect is observable / download has bytes and correct content-type / inline Thai error shown. Dead-control detector: within 3 s no DOM mutation, no navigation, no network, no toast ⇒ ❌ `dead`. Capture console errors, ≥400 responses, hydration warnings, overflow after each action. All writes use temp rows tagged `qc-btn-` and are restored.
Output `.qc-shots/crm/buttons/summary.json` `{total, passed, dead[], wrongExpect[], hiddenLeak[], consoleErrors[], overflow[]}`. Gate: passed === total.

## C4.3 — every form
For every form row: valid submit → success path; each required field empty → inline error under that field (never `alert`), focus moves to it; over-long / emoji / `=cmd|' /C calc'!A0` / `<script>` input → stored inert, rendered escaped; **double submit within 200 ms → exactly one row**; closing a modal mid-way leaves no orphan rows; server-side validation matches client-side (submit the same bad payload straight to the action/REST op → same refusal).

## C4.4 — user journeys US1–US10 end to end (blueprint §1.4)
Scripted in `visual-crm.mts --journey USn`, crossing pages and roles (e.g. US3: thana issues a quotation → customer session accepts in the portal → thana sees the stage move + activity + notification). Each journey asserts the final DB state named in the user story and takes screenshots at each step into `.qc-shots/crm/journeys/USn/`.

Bugs found in C4 are fixed through the normal loop (oracle first where a functional oracle missed it — add the missing check to the owning work order's oracle, not only to the button runner).
