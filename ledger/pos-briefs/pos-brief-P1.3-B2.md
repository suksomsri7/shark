# P1.3 — BUILDER stage B2 (UI) — controller brief (1 Oct 2026)

You are the B2 builder of work order P1.3 (new register screen). Server side (B1 + B1.1) is done and accepted at `eb30aa5f` on `wip/pos-p1.3`. You build everything the user sees.

## Read first (in this order)
1. `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` and `pos-brief-COMMON.md` (machine rules — binding).
2. `/root/projects/shark-pos/ledger/pos-briefs/pos-spec-P1.3-register-ui.md` — the whole file. It is binding for layout, testids, copy, states, keyboard, i18n (§6), inventory rows (§4.7) and ground rules G1–G10 (§0).
3. `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P1.3.md` — rulings on §8 (Q1–Q29), Addendum and Addendum 2. Where the brief differs from the spec, the brief wins.
4. `/root/projects/shark-pos-p11/ledger/wo-notes/pos-P1.3.md` §3 (contract table), §6 ("What B2 must know") and section "B1.1". Where the code contract differs from spec §3.1/§3.2, **the code wins** (e.g. `submitRegisterSaleAction({systemId, unitId, sale})`).
5. Mockups (look at them, they are the target): `/root/projects/shark-pos/ledger/design-pos/01-register.png`, `05-mobile.png` (panel ก), `19-states.png`, `20-en-ipad.png`. The mockups' HTML/CSS sources sit next to them (`01-register.html` + `.body.html`, `05-mobile.*`, `19-states.*`, `20-en-ipad.*`) — take exact sizes, radii, colours and spacing from those sources rather than guessing from the PNG, but use the app's design tokens/classes where the spec names them.
6. The oracle `scripts/qc-pos-p1.3.mts`, groups S5 (static UI checks) — read every S5 check before writing a file; they pin file names, testids, import rules and i18n keys.

## Tree / machine
- Worktree `/root/projects/shark-pos-p11`, branch `wip/pos-p1.3`, head `eb30aa5f`. Work only here. This tree has its own `node_modules`; still **no** `pnpm install/add`, **no** `prisma generate/migrate/format`, no schema edit.
- DB = QC4 only: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Forced oracle: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.3.mts` (the variable must sit inside the wrapper).
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` — at most twice (the lock is shared with other sessions; wait in the shell, never kill anything to get it).
- **No `next build`, no server, no browser.** The controller builds and takes the screenshots after you report (CONTROLLER-RUN). So: be exact about the spec's pixel numbers, and render-check your JSX by reading it against §2 and §7, because your first visual feedback comes after hand-in.
- Never read/edit/source `.env`. Never touch `/root/projects/shark-crm*`, `/root/projects/shark-in-th`. Never sweep `/tmp`.

## Scope (files)
- New: `src/components/pos/register/*` exactly as spec §3.1 lists (RegisterScreen, RegisterTopContext, RegisterModeTabs, SearchRow, CategoryChips, ProductGrid, ProductCard, CartPanel, CartLine, LineEditor, BillDiscountDialog, CouponDialog (soon state only — Q12), CustomItemDialog, OpenPriceDialog, ClearBillDialog, InterimPayDialog, SaleDone, MobileCartBar, MobileCartSheet, RegisterStatusBar).
- `src/app/app/sys/[id]/pos/register/page.tsx`: keep the HF-POS-PAGES guard verbatim; flag gate `settings.pos.registerV2 === true` ⇒ new screen, anything else ⇒ today's `PosRegister` rendered exactly as now (Q4). Trace how POS system settings are stored and read today; no new table.
- i18n: `src/messages/th/pos.json`, `src/messages/en/pos.json` + ONE hunk in `src/i18n/request.ts` (spec §6). th/en key parity; no Thai literal in register component files (A6). Every key `refusalMessageKey` can return must exist in both (list in notes §6).
- `scripts/pos-ui-inventory.json` rows (spec §4.7). `scripts/seed-pos-qc.mts`: the one approved hunk `registerV2: true` for the QC tenants.
- Shell, smallest hunks, each marked `// POS P1.3 ▸ … ◂`: `Topbar.tsx` empty slot `<div id="app-topbar-slot" …/>` (≤3 lines) and `NavRail.tsx` `isRailPath` (1 line). Before editing, run read-only `git diff origin/main...origin/session/crm -- src/components/app-shell/` and stay clear of CRM hunks.
- `scripts/visual-pos.mts`: extend so the controller can shoot the new screen's states for `p1.3` — at least: default register (owner + cashier), cart with 3 lines incl. a line discount, line editor open, bill-discount dialog, custom-item dialog, interim pay dialog (cash), sale-done, empty search result, sold-out/low-stock cards visible, mobile cart sheet open (390 only); `LOCALE=en` support at 1440. Each state = its own PNG name. Keep every existing safety rule of that script (session cleanup, chromium profile cleanup, no :3215). A `--dry` run must print the new plan.
- **Never touch**: `src/lib/modules/pos/register-ui.tsx`, `src/lib/actions/pos.ts` (byte pins S5.12), `createSale/voidSale/refundSale`, anything under `prisma/`, the oracle file (propose ORACLE-EDITs in your notes instead; do not edit).
- Server files of B1 (`register.ts`, `register-shared.ts`, `pricing-shared.ts`, `register-actions.ts`): change only if the UI truly needs an additive read-only field, and say so in the notes with the reason. No change to any money rule.

## Behaviour rules that are not negotiable
1. Totals on screen = `priceCart` locally for instant feedback, then the server quote replaces them; the amount the user pays is always the server quote. Pay is disabled while a quote is pending or failed.
2. Idempotency key lifecycle per spec §3.4 + notes §6: one key per bill attempt; the submit object is kept and re-sent unchanged on retry; `UNKNOWN/INTERNAL/BUSY` keep the key and offer retry; `IDEMPOTENCY_CONFLICT` = "this bill already exists" → show the existing bill (`saleId`, `receiptNo`, `saleStatus`), never resell under a new key silently; other refusals are definite (new key for the next attempt). Double click / double Enter on pay must produce one submit in flight.
3. `PRICE_CHANGED` → show the fresh totals from the response, the user must confirm again. `MEMBER_RIGHTS_UNSUPPORTED` → message + offer to remove the member.
4. Payments: only CASH and PROMPTPAY; every entry ≥ 1 satang; zero-total bill submits `payMethods: []`; cash received < cash portion cannot be submitted.
5. The client never shows a server `message`; it maps `code` through `refusalMessageKey` → i18n.
6. Custom item / open price controls: disabled with a visible reason when `canOverridePrice` is false (server refuses anyway).
7. Required-option products are blocked with `errors.optionsRequired`; `soldOutReason: "UNAVAILABLE"` blocked; `"NO_STOCK"` still sellable with the low/out badge.
8. `"use client"` files import only `register-shared`, `pricing-shared`, `register-actions` from the POS module (never `register.ts` or anything reaching prisma). `"use server"` files export async functions only.
9. Touch targets ≥ 44px (Q14). No horizontal overflow at 390, 768, 1024, 1440.
10. Soon items (โต๊ะ, ออเดอร์ออนไลน์, รายงาน, coupon, หมายเหตุ, camera…) use the house "soon" pattern — visible, disabled, not clickable into a dead end.

## Done when
- Forced oracle: everything green except S6.1 (belongs to P1.6). Unforced run: all green / S6.1 skipped. No QC4 residue (S9.x green).
- Regression identical before/after (before = `eb30aa5f`): `qc-pos-p1.1`, `qc-pos-register`, `qc-hf-pos-page-authz`, `qc-pos-p0.2`, `qc-pos-inventory`, `qc-pos-account`, `qc-pos-closeday`, `qc-pos-coupon`, `qc-pos-products`.
- `pnpm fitness` with QC4 env and without env: exit 0 (run through `iso.sh`); UI debt for `register/page.tsx` = 0.
- Typecheck exit 0 (the 5632 MB command).
- Notes: append section "B2" to `ledger/wo-notes/pos-P1.3.md`: file list, every deliberate parity delta vs the mockups (with reason), what is hidden/soon, seams for P1.2/P1.4/P1.5/P1.6/P1.12/P1.15, G1–G10 self-check, the visual-pos shot list, anything you could not verify without a browser (be honest — the controller will look at exactly those first).
- ONE commit on `wip/pos-p1.3` (commit with `--no-verify` after fitness passed through iso.sh — the hook path points into an off-limits tree; message in Thai, ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; no model ids), `git push -u origin wip/pos-p1.3`. Never push `main` or `session/pos`.
- Keep the notes file updated as you go (checkpoint), so a restart can continue from files.

## Report (English, compact)
Head sha · oracle numbers (forced + unforced) · regression table · gates · list of things not verifiable without a browser · proposed ORACLE-EDITs · anything touched outside the scope list.
