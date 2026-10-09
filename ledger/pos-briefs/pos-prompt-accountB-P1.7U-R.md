# Prompt — P1.7U reviewer (read-only). Controller: head under review = `wip/pos-p1.7u` 52b0713b (base = session/pos cc16520c + ledger). Screenshots are the controller's (CONTROLLER-RUN).

---

You are the REVIEWER for POS work order **P1.7U** (pay dialog PromptPay/Beam intent panel · card via Beam · 17A "วิธีรับเงิน" settings tab · visual states). Read-only: no edits/commits/DB/build/servers/`.env*`/network. English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-prompt-accountB-P1.7U.md` (controller rulings 1–8 — binding) and `pos-brief-P1.7.md`; `ledger/wo-notes/pos-P1.7.md` "Contract for P1.7U" + "Fix round 1"; builder notes `ledger/wo-notes/pos-P1.7U.md` (`git show 52b0713b:…`) incl. the 5 deviations.
- Mockup `ledger/design-pos/02-payment.png` (right column QR panel) and `17-settings-3.png` 17A sidebar.
- Next 16.2 rules; memory rules: `'use client'` imports only `*-shared`/pure modules; `"use server"` exports only async functions; `scripts/*.mts` typechecked by `next build`.

## Tree
`/root/projects/shark-pos-p11` — read via `git -C /root/projects/shark-pos-p11 show 52b0713b:<path>` / `git -C /root/projects/shark-pos-p11 diff cc16520c..52b0713b` only. No checkout, pnpm, prisma, DB, servers, `git worktree`.

## Verify (cite file:line)
1. **Money-safety in the client**: the confirm button enables only when every intent-backed row is PAID; a PAID row is locked (amount/method/remove); `reference = intent.id` goes on exactly that row; a PENDING intent is cancelled before a new one is created on amount/method change; `IDEMPOTENCY_CONFLICT` cannot loop; polling stops on terminal states and on unmount; no double `createPaymentIntentAction` on re-render (effect deps / refs).
2. **Deviation 4 (closing the dialog leaves a PENDING intent)**: concrete scenario — cashier opens QR, customer pays after the dialog is closed, the cart changes, a new QR is created for the new amount; the first intent becomes PAID via webhook and is never consumed ⇒ money at Beam with no bill (ops `refund_needed` only on CANCELLED). Judge severity and propose the minimal fix (cancel on close unless PAID; or keep and surface it on reopen).
3. **Manual confirm UI** matches the server: STATIC per `manualConfirmRequiresManager`; PROMPTPAY_BEAM always needs `pos.shift.manage` (builder says the server requires it — confirm against `payment-intent.ts`); CARD_BEAM no button. Permission flag comes from page props, not guessed.
4. **Over-cap guard (ruling 5)**: QR creation blocked while the bill discount exceeds the seller's cap, using the caps already on the page; does not block managers/owners wrongly.
5. **Settings tab (ruling 6)**: `updatePosIntentSettingsAction` validates (`qrExpiryMinutes` int 5..60, booleans strictly), permission `pos.device.manage`, writes only `settings.pos.payment` keys and leaves `updatePosPaymentSettings` untouched; `beamConfigured` boolean exposed without any key material; S1-U really asserts the round-trip + STAFF denial (positive control noted: 31/32 before the server code).
6. **Fidelity to 02** from JSX: QR panel title "PromptPay · ยอดรอบนี้ ฿x", QR size/placement, status line text per kind, manual button text "ยืนยันเองเมื่อเห็นเงินเข้า", countdown, expired state with "สร้าง QR ใหม่", card tile subtitle "Beam" vs "EDC · ใส่เลขอ้างอิง"; th/en keys for every string; testids `pos-pay-intent-*`, `pos-settings-pay-*`.
7. **Visual script**: the four states seed through actions/services only, cancel this run's pending intents in `finally`, restore the PromptPay ID; `paydlg-promptpay-paid` makes one real sale — is its cleanup consistent with the other register states (bills stay, like P1.16)?
8. **Deviations 1–5**: acceptable or not, each with a one-line reason.
9. **Gates**: notes' exit codes consistent with the diff; typecheck 0 at head.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, concrete input → wrong outcome, fix), "Verified OK", visual checklist for the controller (what to compare in the PNGs vs 02/17A), follow-ups.
