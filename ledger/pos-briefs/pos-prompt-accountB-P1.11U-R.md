# Prompt — P1.11U reviewer (read-only). Controller: head under review = `wip/pos-p1.11u` e43e8696 (base = session/pos 943b1278). Visual screenshots are the controller's (CONTROLLER-RUN) — you review code + mockup fidelity from the JSX.

---

You are the REVIEWER for POS work order **P1.11U** (public receipt page `/r/<token>` 11C · sheets: tax invoice / review / issue · points expand · bills drawer share row · visual states). Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-prompt-accountB-P1.11U.md` (controller rulings 1–7 — binding) and `pos-brief-P1.11.md` §3 + CD1/CD6.
- Mockup `ledger/design-pos/11-customer-display.png` panel C (open the PNG), `12-bills-refund.png` (drawer actions).
- Builder notes `ledger/wo-notes/pos-P1.11U.md` (`git show e43e8696:…`), S contract in `ledger/wo-notes/pos-P1.11.md`.
- Next 16.2 rules (`node_modules/next/dist/docs/`): `generateMetadata`, `notFound()`/`not-found.tsx` in a route group, server actions with `"use server"` exporting only async functions, `'use client'` imports only pure/shared modules.

## Tree
`/root/projects/shark-pos-c` — read via `git -C /root/projects/shark-pos-c show e43e8696:<path>` / `git -C /root/projects/shark-pos-c diff 943b1278..e43e8696` only. No checkout, pnpm, prisma, DB, servers, `git worktree`.

## Verify (cite file:line)
1. **Dispatcher safety** (ruling 1): regex `^[0-9A-HJKMNP-TV-Z]{12}$` exactly; the accounting branch byte-for-byte unchanged (diff of the old function body); POS unknown token ⇒ `notFound()` and the `not-found.tsx` renders "ไม่พบใบเสร็จ"; `generateMetadata` noindex for the POS branch only; `dynamic = "force-dynamic"` still set; no caching of a public receipt.
2. **No PII / no ids on the page**: the server component passes only `PublicReceipt` fields to the client; no sale id, tenant id, device, cashier, member name/phone/email anywhere in the HTML or in client props; the token is the only identifier the client sends back; every client action takes `(token, input)`.
3. **11C fidelity** from JSX: avatar initial + shop name + "branch · date" + status chip (4 variants with correct Thai text: ชำระแล้ว / ยกเลิกแล้ว / คืนเงินบางส่วน ฿x / คืนเงินแล้ว); "ใบเสร็จ R… · ใบกำกับอย่างย่อ ABB-…" (ABB only when present); item rows `name × qty`; "ส่วนลด + คูปอง" red only when > 0; "VAT 7% รวมในราคา" (hidden when `vat` null); bold ยอดสุทธิ; payment line with `·` separators and Thai method labels; serviceCharge/tip rows when > 0; 4 buttons in order with the state rules (tax invoice AVAILABLE/REQUESTED/ISSUED/NOT_AVAILABLE; points only with `points`; review hidden/muted per `actions.review`; report always); footer text; 390 px mobile layout, no horizontal scroll (fixed widths?); th default + `?lang=en` + every string via keys.
4. **Sheets**: tax invoice (taxId 13 digits client-side + server), review (1–5 stars, body ≤500), issue (message ≤500, contact ≤120); submit disabled while pending; refusal codes mapped through `receiptRefusalMessageKey` with Thai text, never raw codes/ids; success states (`rpub-issue-sent`, REQUESTED) render without reload or with `router.refresh()` correctly; no `window.location` tricks.
5. **Bills drawer share row** (ruling 4): `sendReceiptAction` called with `{systemId, saleId, via, email?}`; LINE/email/copy-link buttons; copy link uses `qrEReceiptUrl` and the null ⇒ toast; the builder notes that copying a link on a >30-min bill writes a reprint audit row via `receiptPayloadAction` — judge severity and propose the smallest S-side fix (e.g. a read-only `receiptLinkAction`).
6. **Visual script**: `receipt-public` page + 6 states; seeding goes through register/refund/void actions on the coffee tenant with prefix `posqc-p111u-`; cleanup in `finally` (the notes admit 3 bills + 1 refund + 1 closed shift remain per run — is that acceptable for the QC tenant, or must they be voided/removed?); `--page sales --states` unaffected; `PAGE_EXPECT` entry (public page: 200 for both users).
7. **ST6 oracle**: the page deferral removal is a strengthening only (no other check touched); the dropped-noindex ⇒ red claim is plausible from the check text.
8. **Keys/inventory**: th+en complete for every new string; `scripts/pos-ui-inventory.json` rows well-formed; testids `pos-rpub-*`, `pos-receipt-send-*` present where the visual script expects them.
9. **Gates**: notes' exit codes consistent; the typecheck red was only `pos-receipt-bridges.ts:54` (controller's nit, since fixed on session/pos at e43f620d) — confirm the U diff adds no type-level risk by reading the client/server boundaries.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, concrete input → wrong outcome, fix), "Verified OK", visual-diff checklist for the controller (what to look at in the PNGs vs 11C), follow-ups.
