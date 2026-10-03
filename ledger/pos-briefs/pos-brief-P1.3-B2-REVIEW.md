# P1.3 B2 — independent code reviewer brief (read-only · cloud run · 3 Oct 2026)

You did NOT build this. Tree: `/home/user/shark-p13-rev` (detached at ba6a9bb8, no node_modules). Diff under review: `git diff eb30aa5f..ba6a9bb8` (B2 = register UI behind `settings.pos.registerV2`; 33 files, ~5.5k lines). B1/B1.1 server side was already reviewed — touch it only where B2 changed it.

Read first: `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-P1.3.md` (incl. addenda/rulings Q1–Q29), `pos-brief-P1.3-B2.md`, `pos-spec-P1.3-register-ui.md` (§7 pixels, §8 decisions), builder notes `ledger/wo-notes/pos-P1.3.md` "B2".

Rules: read-only — no edits, no commits, no installs, no DB (none reachable), no build/server. Do not run anything that opens a DB connection. Report in English.

## Check
1. **Flag-off safety (Q4)**: with flag off, is the legacy page (`register-legacy-page.tsx` move from page.tsx) behaviourally identical to origin/main? Diff the moved body against the original line by line. Known open defect B2.1 (NavRail rail by URL) is being fixed in parallel — confirm it and look for any OTHER flag-off leak (shell, i18n keys, imports with side effects, route params, metadata).
2. **Money path from UI**: client never decides price/total; submit carries `expectedGrandTotalSatang`, idempotency key generated once per bill and reused on retry (double-click, network retry, "bill already exists" card); handling of every refusal code incl. `PRICE_CHANGED`, `PAYMENT_MISMATCH`, `IDEMPOTENCY_CONFLICT`, `MEMBER_RIGHTS_UNSUPPORTED`, `OPTIONS_REQUIRED`; cash tendered/change integer satang; PromptPay manual confirm.
3. **Server actions**: no thrown errors leaking (refusals returned as data); authz/unit scope on every new action; no new action bypassing B1 checks; request serialization (quote/search/status) cannot apply stale responses.
4. **UI standard**: tokens only, `pos.*` keys th+en complete (no raw English/enum on screen), buttons ≥44px, F2/F4/F8/Esc, Thai IME not broken by key handlers, no horizontal scroll at 390/360.
5. **Out-of-list files** (`register-legacy-page.tsx`, `RegisterDialog.tsx`, `RegisterIcon.tsx`): justified?
6. Oracle integrity: did B2 edit `scripts/qc-pos-p1.3.mts` assertions (vs fe89ccd7/0002997e)? Any edit = list it and judge legitimacy.

## Report (≤60 lines)
Verdict: MERGEABLE / MERGEABLE-AFTER-FIXES / NOT-MERGEABLE · findings as BLOCKER / SHOULD-FIX / NOTE, each with file:line, concrete failure scenario, suggested fix · list of things only a browser/DB run can confirm (for the controller).
