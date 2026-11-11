# Prompt — P1.12U fix round 2 (re-check R2: F1–F3). Controller (account A, 9 Oct 14:4xZ): head = `wip/pos-p1.12u` ec9e91de · report `ledger/wo-notes/pos-P1.12U-review-R2.md` (MERGEABLE-AFTER-FIXES) · tree **p11** again (same rules as fix round 1: never `pnpm install`/`prisma generate`/`prisma format` there; never touch tree d/b/c).

---

You are the BUILDER for the **P1.12U fix round 2** — three small items, nothing else changes. English reports, Thai code comments. Read `ledger/wo-notes/pos-P1.12U-review-R2.md` first (findings + "Verified OK" — keep all of it as is), then your own notes `ledger/wo-notes/pos-P1.12U.md` ("Fix round 1").

## Rulings
1. **F1 (Medium) → fix.** `RegisterQuoteOverrideInput` gains `staffToken?: string`; `quoteRegisterCartOverrideAction` forwards it; `quoteRegisterCartOverride` resolves the acting user **exactly as `submitRegisterSale` does** (token checked first; bad/expired token ⇒ `STAFF_TOKEN_INVALID`; the token actor is used for the held-cart holder/manage check and for the caps). The UI sends `tokenArgs()` with every override quote (same place recall does it, `RegisterScreen.tsx` ~:1151). Add **ORACLE-EDIT U5** in its own `test(pos P1.12): ORACLE-EDIT U5 — override quote honours staffToken` commit: device logged in as a STAFF account without `pos.sale.manage`; cashier B (token) held + approved cart ⇒ override quote with B's token ⇒ ok with the approved cap; the same quote without the token (session actor ≠ holder) ⇒ `APPROVAL_MISMATCH`; invalid token ⇒ `STAFF_TOKEN_INVALID`. Count 71 → 72; record in `pos-P1.12-oracle.md`.
2. **F2 (Low) → fix** as proposed: when the override effect re-runs for the same `cartVer` and the auth was dropped / the override refused, clear the stored quote for that version (`setQuote(q => q?.ver === ver ? null : q)` or tag the quote with `overrideKey` and require a match) so pay is disabled immediately, as P1.15U did.
3. **F3 (Low) → fix per the reviewer's option**: for `discAuth.kind === "approved"`, do **not** run the override quote while `auth.inputJson !== cartInputJson`; show the plain discount-over refusal card and keep `discAuth`/`heldCartId`; undoing the edit restores the approved quote; the approval is dropped only when submit returns `APPROVAL_MISMATCH` (unchanged). Non-member carts: no change.
4. Follow-ups to list in the notes (no code now): `HeldBillsDrawer`/`TaxInvoiceDialog` flex-column bodies on phones; overlapping wrong-PIN override quotes can count +2 before the disarm; the plain quote prices member carts with the session cap (builder note); F10.

## Tree / commands
`/root/projects/shark-pos-p11` on `wip/pos-p1.12u` (ec9e91de; `git -C … status --short` must be clean). `git -C /root/projects/shark-pos-p11 …` / absolute paths; run pnpm/tsx inside the tree. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p112u-fix2/`. Other lanes run suites on `posqc-coffee` — re-run once before calling a suite red.

## Gates before "done"
`qc-pos-p1.12` forced ×2 + unforced **72/72** residue 0 (U5 red before your server change — keep that log) · `qc-pos-p1.15` 39 · `qc-pos-p1.3` 128 · `qc-pos-p1.13` 33 · `qc-hf-pos-page-authz` 56 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0 · visual dry plans unchanged (6 member states listed). Logs with `tree=/root/projects/shark-pos-p11 head=<sha>` headers under `scratchpad/p112u-fix2/runs/`.

## Done =
"## Fix round 2" in `ledger/wo-notes/pos-P1.12U.md` (per-finding change with file:line, U5, follow-ups, gate exit codes) · push `wip/pos-p1.12u` · report ≤15 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/tree d.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
