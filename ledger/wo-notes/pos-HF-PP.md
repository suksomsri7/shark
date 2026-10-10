# POS HF-PP — manager gate for PROMPTPAY/CARD "paid" without a payment intent (server side)

Builder (account A, 10 Oct 2026). Brief `ledger/pos-briefs/pos-brief-HF-PP.md` (§9 rulings 1–3) · origin P2.4U R2 F8 (`wo-notes/pos-P2.4U-review.md` "R2").
Base `session/pos` 831ad163 · branch `wip/pos-hf-pp` · tree `/root/projects/shark-pos-c` · QC4 only.

## Commits
| sha | what |
|---|---|
| 73a98f16 | oracle first: `qc-pos-p1.7` R4b (32→33) · `qc-pos-p2.4` P9 (49→50) |
| 60f7ce72 | red-before `wo-notes/HF-PP-red.txt` |
| 49bb6ea7 | **code** — `pos/register.ts` (code head) |
| f5a3cd19 | `POS-OWNER-PENDING.md` P1.7 owner line (CARD included · flip in `REG_MANUAL_METHODS`) |
| 8a8e0a8d | merge `origin/session/pos` a693c9b3 (ledger-only · no conflict) — **gated head** |

## Diff summary (code = `src/lib/modules/pos/register.ts` only, +15/−1)
- `:426` import `parsePosIntentSettings` beside `isPaymentIntentId` (same reader as `createPaymentIntent`/`scopeOf` — no new reader).
- `:681–684` `REG_MANUAL_METHODS = {"PROMPTPAY","CARD"}` (= the `manualMethods` set of ruling 3) + `REG_MANUAL_MANAGER_MESSAGE` = the literal of `payment-intent.ts:424`.
- `:2226–2235` in `submitRegisterSale`, right after the P1.15 token block (so `s.actor` = token holder when a token is sent) and before DEVICE_REVOKED / shift / pricing / discount-override (first write) and far above the `regSubmitTable`/`regSubmitWithIntents`/`regCreate` branch: any pay method in the set with `!isPaymentIntentId(reference)` **and** actor lacks `pos.shift.manage@unit` ⇒ read `AppSystem.settings` → `parsePosIntentSettings(...).manualConfirmRequiresManager` ⇒ `{ok:false, code:"PERMISSION_DENIED", message}`. Setting read only in that case (CASH/TRANSFER/pi_ paths: zero extra queries).
- Untouched: intent flow, Beam, static QR, receipts, `createSale` input/contract sha, schema, messages, UI.

## Oracle (ORACLE-EDIT, brief scope 4)
- `qc-pos-p1.7` **R4b** (`:91` registry · run block before C31): setting on · cashier (`pos.sale.create` + `pos.sale.priceOverride` so custom lines do not trip Q8's own PERMISSION_DENIED; no `pos.shift.manage`): PROMPTPAY bare / CARD EDC ref / CASH+PROMPTPAY ⇒ PERMISSION_DENIED with the exact Thai message, PosSale/PosPayment +0 · owner PROMPTPAY ok · cashier CASH ok · cashier PROMPTPAY with PAID `pi_` ok (gate stays at confirm) · setting off ⇒ cashier PROMPTPAY ok.
- `qc-pos-p2.4` **P9** (`:91` registry · step after R4): own tables H1–H3 via `regSubmitTable` (lines [] + tableSessionId) · setting via the real writer `updatePosIntentSettings` (owner) · STAFF PROMPTPAY / CARD ⇒ PERMISSION_DENIED + message, rows +0, session OPEN, item unpaid · STAFF CASH ok · owner PROMPTPAY ok · setting off ⇒ STAFF PROMPTPAY ok.

## Red-before (base 831ad163 + oracle, `HF-PP-red.txt`)
- p1.7 **32/33** — only R4b: cashier PROMPTPAY/CARD/split → OK, PosSale 8→11, PosPayment 9→13 (positive controls green).
- p2.4 **49/50** — only P9: STAFF PROMPTPAY → OK (table closed by it; CARD/CASH then TABLE_SESSION_CLOSED as a consequence).

## Deviations / decisions
1. Placement: after the idempotent replay lookup and the token block (brief: "after the pay-method parse … before any write", token holder = ruling/scope 2). A replay of an already-committed key still returns the original bill (no write) — same as every other post-lookup gate.
2. Messages (scope 3 / ruling 2): **no new key.** Register (`RegisterScreen.tsx` rule 3) and `TableCheckout.tsx` render refusals only via `refusalMessageKey(code)` ⇒ this backstop shows the existing `errors.permissionDenied` in both, same as every other PERMISSION_DENIED; the UI gates (`PayIntentPanel` `manualAllowed`, `presetManagerOnly`) show first. If the controller wants the specific text on screen, that is a UI change + `register.refusal.manualConfirmManager` th/en (follow-up, not done).
3. CARD included (ruling 3) — owner line in `POS-OWNER-PENDING.md`.
4. Oracle cashier in R4b carries `pos.sale.priceOverride` (needed for custom lines of the p1.7 `sell` helper; otherwise the red would be the Q8 refusal, not this gate). The message is asserted exactly to rule out other PERMISSION_DENIED sources.

## Gates — head 8a8e0a8d (dirty 0, logs headed `tree=… head=8a8e0a8d dirty=0`, scratch `hfpp/gates/`)
| gate | result |
|---|---|
| typecheck (iso, pos-gate.lock) | exit 0 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p1.7 ×2 | 33/33 · 33/33 |
| qc-pos-p2.4 | 50/50 |
| qc-pos-p1.6 | 48/48 |
| qc-hf-tx | 18/18 |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.15 | 39/39 |
| qc-pos-p1.12 | 72/72 |
| qc-pos-p1.1 | 180/180 |
| qc-hf-pos-page-authz | 62/62 |

## Follow-ups
- `qc-pos-p2.8` ST6 (PAR: register.ts sha = P2.8 base or merge-base) will read red on this branch, green once merged into session/pos (same as HF-TX) — not run here.
- No oracle check combines a P1.15 staff token with this gate (token holder = `s.actor` by construction; p1.15 39/39 regression only). Add if the reviewer wants it.
- Optional UI text for this refusal (deviation 2).
- Visual lane: no UI change ⇒ no `--state` to shoot.
- Reviewer (read-only) per brief; hunter not needed per brief (controller decides).

## Fix round 1 (review R1 F1 + controller rulings 1–2, 10 Oct 11:5xZ)
Commit 33072250 (code + owner lines) · upstream merges a42718c0 (eb402e91) and e8ad970e (203dec3e, ledger-only; src/scripts/prisma identical to a42718c0).
| file:line | change |
|---|---|
| `InterimPayDialog.tsx:240–245` | `edcManagerOnly = method==="CARD" && !intentMode && intent.manualRequiresManager && !intent.canManageShift` → added to `canConfirm`/`canSplit` (button, Enter submit and F4 all go through `primary()` ⇒ blocked) |
| `InterimPayDialog.tsx:719` | under the EDC reference input: `<small …muted>{t("pay.intent.managerOnly")}</small>` = same hint/presentation as `PayIntentPanel.tsx:418` (testid `pos-reg-paydlg-edc-manager-only`) |
| `InterimPayDialog.tsx:929` | confirm `title` = managerOnly when gated (same as PayIntentPanel:413) |
| `register-shared.ts:915–922` | `REGISTER_MANUAL_MANAGER_MESSAGE` (single source) + `submitRefusalMessageKey(r)`: PERMISSION_DENIED + that message ⇒ `refusal.manualConfirmManager`, else `refusalMessageKey(code)` |
| `register.ts:469 · :685` | import the shared constant; `REG_MANUAL_MANAGER_MESSAGE` = it (no second literal; byte-identical to payment-intent.ts:424) |
| `RegisterScreen.tsx:47 · :1766–1767` | pay-dialog submit refusal uses the new key when matched, else `errorFor(code)` as before |
| `TableCheckout.tsx:19 · :255` | `setError({key: submitRefusalMessageKey(r)})` |
| `pos.json th/en :386–388` | `register.refusal.manualConfirmManager` |
| `pos.json th/en :1759–1760 · :1937` | settings label/hint + history line mention PromptPay **and card** (EDC) |
| `POS-OWNER-PENDING.md` | 2 P1.7 owner lines: TRANSFER without reference not gated (owner decides) · REST `pos/api/ops/sales.ts` PROMPTPAY via API key not gated (owner-issued key trust) |

Notes: no new component / visual state (reused hint). When the page passes no `payIntent` (`p.intent` null) the dialog does not know the setting ⇒ server backstop only (unchanged). 'use client' files import only `register-shared` (pure). ST7 0.

### Gates fix 1 — head a42718c0 (dirty 0, headed logs `hfpp/gates-f1/`)
| gate | result |
|---|---|
| typecheck | exit 0 |
| qc-pos-p1.18 (ST7 U-phase = 0) | 81/81 |
| qc-pos-p1.7 | 33/33 |
| qc-pos-p2.4 | 50/50 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-p1.3 | 128/128 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| visual-pos --dry register (states) owner / cashier | exit 0 · plan 101 shots each |
| visual-pos --dry tables (resto) owner / cashier | exit 0 · 3 shots each |
Controller visual: register pay dialog with CARD selected, Beam card off, setting on, cashier ⇒ hint under the reference + confirm disabled (no new state; existing pay-dialog state with method CARD). `qc-pos-p2.8` ST6 on the merged tip = controller.
