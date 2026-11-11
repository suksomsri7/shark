# Prompt for account B — UI builder: P1.6 U (pay screen), then P1.2 U (options/variants/weighed). Use from Wed 7 Oct.

⚠️ Do NOT paste the old `pos-prompt-accountB-P1.6-S.md`: the server side of P1.6 (and of P1.2) is already accepted.

---

You are the UI BUILDER for POS work orders **P1.6 U** and then **P1.2 U**. The server side of both is done and accepted in `session/pos`. A controller reviews your work. Report in English in the notes.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, `pos-spec-P1.3-register-ui.md` (register UI conventions)
- P1.6: `ledger/pos-briefs/pos-brief-P1.6.md` (whole; R9 + mockups 02 and 05ข; §7–§9 rulings: tip outside grandTotal, tip toggle stays disabled — TIP_NOT_AVAILABLE until P1.6b) and `ledger/wo-notes/pos-P1.6.md`
- P1.2: `ledger/pos-briefs/pos-brief-P1.2.md` (§R2/§R3 rulings) and `ledger/wo-notes/pos-P1.2.md` (helpers for you: `cartAddProduct(..., options)`, `cartAddWeighed(...)`, scan result `weighed`)
- Oracles: `scripts/qc-pos-p1.6.mts`, `scripts/qc-pos-p1.2.mts` (P1.2 S1 S2 are the UI checks: message keys `options.*`/`variants.title` used on screen, test ids `pos-reg-options-dialog`, `pos-reg-option-*`, `pos-reg-options-confirm`, `pos-reg-variant-*`, `pick` deciding by optionGroupCount + variantCount). Do NOT edit assertions.
- AGENTS.md: this Next.js differs from training data. Read `node_modules/next/dist/docs/` before touching Next code.

## Tree
- `/root/projects/shark-pos-b` (NOT shark-pos-p11 — the controller's VPS runner switches branches in p11). Must be clean. `git fetch origin session/pos && git checkout -b wip/pos-p1.6u origin/session/pos`.
- `node_modules` here is a READ-ONLY bind mount of p11's (re-mount if missing: `mount --bind -o ro /root/projects/shark-pos-p11/node_modules /root/projects/shark-pos-b/node_modules`). Never `pnpm install` / `prisma generate` here. If the Prisma client looks older than session/pos (type errors on Pos* models you did not touch), stop and tell the owner — the controller regenerates it.
- A parallel HR session works in `/root/projects/shark-hr` on the same QC4: suites wait on the shared gate lock — let them wait.
- No schema change, no migration, no `prisma generate`. QC4 only (`ep-frosty-lab`, print hostname only) for DB suites, through the wrappers.

## Order
1. P1.6 U on `wip/pos-p1.6u`: pay dialog (split ≤10 methods, numpad, tendered/change, CARD/TRANSFER, bill + line notes, service charge line when enabled, refusal codes shown as Thai messages). Th + en keys. Commit + push after each piece.
2. Then `git checkout -b wip/pos-p1.2u` from your P1.6 U head: option picker dialog, variant chooser, weighed line (scale label scan + typed weight behind set-price permission), cart line showing options/weight. Make P1.2 S1 S2 green.
After each piece: typecheck; `qc-pos-p1.6` / `qc-pos-p1.2` forced; p1.3/p1.4/p1.5/p1.9 forced (register UI must not regress); fitness both modes.

## Done =
- `qc-pos-p1.2` 55/55 and `qc-pos-p1.6` 48/48, forced ×2 and unforced; other P1.x unchanged; typecheck 0; fitness 0; no residue.
- Notes `ledger/wo-notes/pos-P1.6U.md` and `pos-P1.2U.md`: screens built, keys added, open questions.
- Push and stop. No deploy. The controller builds, takes screenshots (3 sizes + EN) and sends reviewers.

## Hard rules
Push only `wip/pos-p1.6u` and `wip/pos-p1.2u`. Explicit-path commits; never `git add -A`; never commit `scripts/*-expected.json` or `scripts/fixtures/**`. Never main, prod or `.env*`. Do not edit `account/service.ts`, `ai/proposals.ts`. If a permission is denied, stop and report. QUOTA STOP at a clean commit with "next: <step>" in the notes.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
