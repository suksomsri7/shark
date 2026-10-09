# POS P1.15U — builder notes (UI half: lock screen 13B · staff switch · discount-over sheet · 21B wait · manager PIN on void/refund · 21A titles · visual)

Builder · account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.15u` from `origin/session/pos` 3127fa07 · 9 Oct 2026.
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P1.15U.md` rulings 1–10 · brief `pos-brief-P1.15.md` §3 · server contract summary in `ledger/wo-notes/pos-P1.15.md`.
Merged `origin/session/pos` twice (P1.10U settings/print/PayDone at 532edd5f — RegisterScreen import conflict + inventory rows; ledger-only at 8009a2c9). P1.11U (BillsClient share row) was not yet in `session/pos` at the last merge.

## Screens built
- **13B lock screen** — `src/components/pos/register/LockScreen.tsx` (full-screen overlay z-70 over the app bar): header SHARK · shop · branch · device (heartbeat name) | shift chip · online · clock · date; left = lock tile, "ใส่ PIN เพื่อปลดล็อก", `<avatar> name · role · ล็อกเมื่อ HH:MM`, 6 dots, keypad 1–9 / ลืม PIN / 0 / ⌫, hint; right = "ใครกำลังใช้เครื่องนี้" staff cards (chip ใช้งานอยู่ · เจ้าของกะ #n · เปิด HH:MM · ขายในกะนี้ได้ · ยังไม่ได้ตั้ง PIN), [สลับพนักงาน], held-bill card (count · label · lines · held time · by · total), footer auto-lock line. Modes: checking · unregistered ("ลงทะเบียนเครื่องนี้ก่อน" + link to settings `?tab=devices`, no PIN pad) · revoked · ready. Phases: PIN (always sends the selected `userId`) · manager unlock (PIN_LOCKED / ลืม PIN → manager taps own card + PIN → `unlockStaffPinAction`) · set PIN (staff without a PIN, and after a "ลืม PIN" manager unlock).
- **Staff session store** — `src/lib/modules/pos/staff-session.ts`: `sessionStorage["pos-staff:<deviceId>"] = {userId, name, role, staffToken, expiresAt}` (never cookie/localStorage; expired = removed).
- **Idle lock** — `src/components/pos/register/use-idle-lock.ts` (pointer/keyboard/touch/wheel; hidden tab ≥ N min); `settings.pos.register.autoLockMinutes` parsed by `posRegisterAutoLockMinutes` (0–60, default 2, 0 = off) in `register-shared.ts`.
- **RegisterScreen** — locked when no token / expired / idle / lock button / any `STAFF_TOKEN_INVALID`; locking keeps the cart; unlock by another user auto-holds the cart under the previous user's token (label `lock.holdLabel` = "สลับพนักงาน"); keyboard shortcuts + scanner capture disabled while locked; seller chip = token user and is the lock button (`pos-lock-now`; mobile `pos-lock-now-mobile`). Token (+ `deviceId`) on submit, hold, recall; shifts page opens shifts with the token (`ShiftsClient.tsx`).
- **Discount cap + discount-over sheet** — page passes `registerDiscountCaps(ctx)` into `registerSellerLimits(actor, unitId, caps)` and to the screen; seller cap = session limits when the token user is the session user, else `caps[role]`; `BillDiscountDialog` shows "เพดานของคุณ x%"; over-cap line/bill discount opens `DiscountOverSheet.tsx`: (a) manager picker (MANAGER/OWNER with PIN) + PIN → armed on the bill, sent as `managerPin` + `managerUserId` with the payment submit; (b) "ส่งขออนุมัติ" → submit without payments (expected = local grand + 1, so no sale can be created) → `APPROVAL_REQUIRED {requestId, heldCartId}` → screen cleared (resetBill outside `send`, S5.21) → 21B. `PENDING_APPROVAL` → same dialog.
- **21B wait dialog** — `src/components/pos/register/ApprovalWaitDialog.tsx` (shared by register and Bills): summary "ส่งคำขอ<title> · ฿x แล้ว HH:MM · เหตุผล", approver card (named approver or role) + chip ส่งแล้ว, spinner + 5:00 countdown from `createdAt`, "หรือ", manager PIN pad (picker + boxes + 1–9 / ล้าง / 0 / ⌫), footer + [ยกเลิกคำขอ]. Polls `posApprovalStatusAction` every 5 s. APPROVED: discount → recall the held cart (approved-cap quote, `heldCartId` on submit); void/refund → toast + refresh. REJECTED → "ผู้จัดการปฏิเสธ: <note>". EXPIRED (PENDING ≥ 5 min) → "คำขอหมดอายุ · บิลยังอยู่ตามเดิม"; "ยกเลิกคำขอ" calls `cancelPosApprovalAction` (facade `cancelRequest`).
- **Bills (void/refund)** — `BillsClient.tsx`: requester token + `deviceId` on void/refund; codes `PIN_* · DEVICE_REVOKED · APPROVAL_* · PENDING_APPROVAL · STAFF_TOKEN_INVALID` mapped through `refusalMessageKey` (no more `unknown`); `APPROVAL_REQUIRED/PENDING_APPROVAL` opens 21B; 21B PIN resubmits the original void (same reason + key) / refund (same payload) with `managerPin` + `managerUserId`; void/refund buttons read "… — รออนุมัติ…" (muted, `data-pending`) while a request of that bill is open (status read keyed by `saleId`), tapping reopens 21B.
- **21A** — `src/app/app/approvals/page.tsx` + `BulkApprovals.tsx`: POS requests render title = `payload.title` (refund adds the receipt no.), subtitle "<requester> · <device> · <n> นาทีที่แล้ว" composed at display time (`posApprovalCards` in `pos-approval.ts` — user name, membership role, `PosDevice.name`, tenant-scoped), amount right, reason line, over-cap chip only when the snapshot carries a cap, `<details>` rows ผู้ขอ/เครื่อง/เวลา/เหตุผล/ถ้าอนุมัติ (void "คืนเงินสด ฿x · คืนสต็อก · ใบลดหนี้" · refund lines · discount "ส่วนลด x% = ฿y") + policy line (policy name). Approve/reject = the existing bulk buttons; non-POS requests unchanged.

## Keys and testids
`pos.register.lock.*` (34) · `pos.register.staff.*` (13) · `pos.register.discountOver.*` (12) · `pos.register.approval.*` (27) + `pos.register.approval.card.*` (13), th + en. Testids `pos-lock-*`, `pos-staff-*`, `pos-discount-over-*`, `pos-approval-wait-*` (+ `pos-reg-bill-discount-cap` display) — 30 inventory rows (`scripts/pos-ui-inventory.json`, wo P1.15U). 21A cards carry `approval-pos-card` (core page, outside the POS inventory).

## Server hunks (rulings 2, 5) — lines added/removed vs 3127fa07
- `bills.ts` +9/−2 · `bills-actions.ts` +3 · `bills-shared.ts` +3/−1 — `voidSaleByActor` `staffToken` → `staffActorFromToken` (ctx.deviceId) → requester = token user; bad token = `STAFF_TOKEN_INVALID`, never falls back.
- `refund.ts` +14/−3 · `refund-shared.ts` +5/−1 — same for `refundSale` (token device = `input.deviceId` ?? ctx).
- `held-cart.ts` +35/−3 — `recallHeldCart` quotes with the approved cap (`approvedDiscountOf`) and returns `approvedRequestId`; new `discardHeldCartRejected` (only HELD rows, audit `pos.heldCart.discard` actor = decider, `after.via "approval_rejected"`).
- `pos-approval-consumer.ts` +11/−4 — rejected `POS_DISCOUNT_OVER` ⇒ `discardHeldCartRejected`.
- `pos-approval.ts` +121 — `posApprovalView` (status read, 52 lines incl. comments — over the 40-line hint because it also returns approver/decider/note/held cart for 21B) · `cancelPosApprovalRequest` · `posApprovalCards` (21A, display-only read).
- `pos-approval-actions.ts` (new, 62) — `posApprovalStatusAction({requestId | saleId})` · `cancelPosApprovalAction({requestId})`, `assertCan` pos.sale.create|void|refund at the unit, unit/system checked against the snapshot.
- `register-shared.ts` +47/−1 — `posRegisterAutoLockMinutes`, `RecallHeldCartResult.approvedRequestId?`, `PosApprovalView`/`PosApprovalViewResult`/`POS_APPROVAL_WAIT_MS`.
- Oracle (ORACLE-EDIT, separate `test(...)` commits fa175cdd · ad286f6d): `scripts/qc-pos-p1.15.mts` + AP-U1 (recall of an approved held cart = approved-cap quote ฿204 + `approvedRequestId`, submit passes; plain held cart has none) · AP-U2 (rejected discount request discards the held cart, audit once, replay ×2 safe, recall NOT_FOUND) · TK-U1 (void/refund with a bad token = `STAFF_TOKEN_INVALID`, nothing written; session owner + valid STAFF token voids with audit actor = token user). 36 → 39 checks.

## Deviations (ruling → what was built)
1. R1 unregistered device: "no device registered" = `registerStatus.deviceStatus` not ACTIVE (or no device id) ⇒ lock screen shows "ลงทะเบียนเครื่องนี้ก่อน" + link, no PIN pad. Consequence: every register page needs a registered device + a PIN; the visual harness registers its device and seeds PINs.
2. R1 bootstrap: staff without a PIN can set one on the lock screen (`setStaffPinAction` — server decides: self, or device account with `pos.staff.manage`); "ลืม PIN" = manager PIN + unlock, then the set-PIN pad (falls back to the "ตั้งค่า → พนักงาน" text when the device account lacks `pos.staff.manage`). Without this a fresh shop could never unlock (the settings staff tab is P1.18).
3. R1 PIN entry: 6 digits auto-submit; 4–5-digit PINs need the "ยืนยัน" button / Enter (mockup has no OK key).
4. R1 lock button: on the seller chip in the top bar (all ≥ md widths) + a mobile lock key; the bottom status bar (xl only, rewritten by P1.10U) has none.
5. R3 staff cards: hours from HR omitted (no HR read in the page); "ลาวันนี้" not shown; shift number shown only for the shift of this device (list rows carry only `{id, openedAt}`); "สลับพนักงาน" moves the PIN pad to the next staff (card tap does the same directly).
6. R4 (a): manager PIN is not pre-verified — it is armed on the bill and verified by the payment submit (wrong/locked ⇒ pay-dialog error, the armed PIN is dropped). Because `quoteRegisterCart` knows neither PIN nor approved carts, the screen prices an armed bill with `priceCart` (no cap) and an approved recall with the quote returned by recall; a server total that differs (e.g. service charge) comes back as `PRICE_CHANGED` with the real totals.
7. R5 21B discount PIN: recalls the held cart onto the screen and arms the PIN with its `heldCartId` (server cancels the pending request on the paid submit) instead of a resubmit (a submit needs payments). Approver card shows the step approver name or role + "แจ้งในหน้าอนุมัติของ SHARK แล้ว" (no presence/LINE data). Decision note read directly from `ApprovalDecision` (facade has no note reader; CRM portal reads it the same way). EXPIRED is computed by the status read (PENDING ≥ 5 min); the request is only cancelled when the user presses ยกเลิกคำขอ.
8. R6 Bills: 21B PIN for a refund request opened from another session (no stored payload) is hidden (`allowPin=false`) — waiting/cancel still work. Cashier (no `pos.sale.void`) sees the pending label on a disabled button.
9. R7 21A: the over-cap chip needs a cap in the snapshot — `regDiscountOver` does not store one today, so the chip never shows (follow-up). Shift number in the device row not shown (snapshot has no shift).
10. R10 visual: one run device (`posqc-vis-dev-<pid>`, registered for every register run, revoked in finally) instead of a fixed `posqc-p115u-dev` — a revoked fixed code cannot be registered again. PINs are random 6-digit, set through `setStaffPin`, never printed, and the prior `PosStaffPin` rows are restored (or deleted) in finally/signal. The PENDING POS_VOID request is written directly (prisma) under an inactive policy (so no other suite sees a policy) after a real cash sale, and `approval-wait` navigates from the register job to the Bills page (21B for void lives there); `--page sales --states` is unchanged. `--page approvals` skipped: `/app/approvals` is a core page outside `POS_PAGES`/`pathOf` — adding it would change `scripts/pos-qc-env.mts` for every POS suite.

## Follow-ups
- Quote variant that accepts `managerPin`/`managerUserId`/`heldCartId` (exact totals for armed/approved bills instead of the client-side estimate + `PRICE_CHANGED`).
- Store the requester's cap (bp + role) in the POS_DISCOUNT_OVER snapshot so 21A can show "เกินเพดาน x% ของ<role>".
- Recalling a held "รออนุมัติส่วนลด" cart and requesting again creates a second held cart + request (the old one stays pending until it expires/cancels).
- Approval presence/notification channel (มือถือ · ออนไลน์ · LINE) for the 21B approver card.
- Settings → พนักงาน tab (P1.18) for PIN management; HR hours/leave on staff cards.
- Carried from P1.15 S: per-device throttle for anonymous PIN guesses · core self-approval block · concurrent same-key auto-hold.

## Gates (exit codes) — tree b, head a238ef87 (merged `origin/session/pos` 1d9b97c8); every log carries a `tree=/root/projects/shark-pos-b head=…` header (session scratchpad `p115u/runs/`)
| gate | result |
|---|---|
| `pnpm typecheck` (full, gate lock) | 0 |
| `qc-pos-p1.15` forced #1 / #2 / unforced | 0 · 39/39 ×3 (36 + AP-U1 AP-U2 TK-U1) · temp tenant removed, 320 tables, residue 0 |
| qc-pos-p1.3 / p1.5 / p1.6 / p1.7 / p1.8 | 0 · 128/128 / 0 · 21/21 / 0 · 48/48 / 0 · 31/31 / 0 · 49/49 |
| qc-pos-p1.9 / p1.10 | batch run 1 · 51/53 and 1 · 38/40 — only Z1/Z2 (QC coffee shop rows changed mid-run by another lane: posProduct 18→7, a new PosShift, outbox/audit rows — not P1.15U code paths); re-run right after: **0 · 53/53 / 0 · 40/40** (an earlier batch on 8009a2c9 was also 53/53 / 40/40) |
| qc-pos-p1.11 / p1.16 | 0 · 38/38 / 0 · 28/28 |
| qc-approval / -wiring / -edit | 0 · 16/16 / 0 · 7/7 / 0 · 12/12 |
| qc-hf-pos-page-authz / qc-nav-functions | 0 · 56/56 / 0 · 11/11 |
| `pnpm fitness` with QC4 env / without env · `fitness-pos.mts` | 0 · 41/41 / 0 · 41/41 · 0 · 8/8 |
| visual `--page register --states --dry` owner / cashier | 0 · 50 shots / 0 · 50 shots (5 new P1.15U states) |
| visual `--page sales --states --dry` owner / cashier | 0 · 15 / 0 · 15 (unchanged) |
| first gate batch note | `qc-pos-p1.3` was 1 · 127/128 (S5.20 regex wants the literal `inert={layers.length > 0}` / `inert={i < layers.length - 1}`) → lock inertness moved to a wrapping element (a238ef87) → 128/128 |

Real visual run (chromium + server) = CONTROLLER-RUN: `--page register --states --user owner|cashier --base …` (writes per the dry plan, all cleaned in finally).

## Fix round 1 (reviewer verdict MERGEABLE-AFTER-FIXES on 7af05531 · prompt `pos-prompt-accountB-P1.15U-fix.md`)
| finding | commit | what changed | verified by |
|---|---|---|---|
| F1 | bc20d08e | `setOwnStaffPin` (staff-pin.ts) + `setOwnStaffPinAction` — ignores any userId, session user only, `ALREADY_SET` when a PIN exists (new code → `errors.alreadySet`); LockScreen sets a PIN only on the session user's own no-PIN card; other no-PIN cards and ลืม PIN show `lock.forgotBody`; `setStaffPinAction` no longer called from the lock screen | subset tsc · PN suites in qc-pos-p1.15 unchanged green |
| F2 | 19055b59 | `listStaffForDeviceAction` on a registered device: no PIN at the unit ⇒ register usable by the session user, dismissible banner `staff.noPinBanner` (sessionStorage `pos-nopin-banner:<deviceId>`), idle lock off, manual lock opens 13B with "กลับไปขาย"; any PIN ⇒ full lock rule; unregistered device unchanged; read failure ⇒ treated as "has PIN" (locked) | code review + visual seed sets PINs (lock path) |
| F3 | b04f3759 | `savePending` stores the sale without `managerPin`/`managerUserId` (comment: a reload retry returns the committed bill or a clean `DISCOUNT_EXCEEDS_LIMIT`) | subset tsc · qc-pos-p1.3 S5.22 green |
| F4 | d62cfdef | `send` returns while locked (restore retry of the pre-reload request excepted); `confirmPay` returns while locked and locks instead of sending when a PIN shop has no token; PayDialog F4 ignored under `[inert]`; locking in the form phase closes the pay layer | qc-pos-p1.3 S5.20/S5.21 green |
| F5 | 34a5fa3c | `DiscountAuth` keeps the authorized discount (bp, satang); `localCap = max(sellerCap, auth.bp)` (not nulled); `tryCart` refuses a discount above it ⇒ discount-over sheet reopens and the authority is cleared | subset tsc |
| F6 | 4fb5d6bf | 21B: first EXPIRED read cancels once and stops polling; FAILED stops polling. Follow-up (not built): consumer ignores decisions after `POS_APPROVAL_WAIT_MS` | subset tsc |
| F7 | ecacb680 | `cancelPosApprovalRequest(scope, requestId, actor)` — requester (token user, else session user) or `pos.staff.manage`; `PERMISSION_DENIED` / `STAFF_TOKEN_INVALID`; audit `pos.approval.cancel` {requestId, kind, saleId, heldCartId, byUserId}; 21B sends the device token | subset tsc |
| F8 | 8fc0b15e | Bills: registered device (heartbeat ACTIVE) with any PIN ⇒ void/refund need a live token, else dialog "ใส่ PIN ที่หน้าขายก่อน" + link to `/pos/register`; `STAFF_TOKEN_INVALID` clears the token + same dialog; `NO_PERMISSION` opens `ManagerPinPad` (new shared component, also used by 21B; testids `pos-mgr-pin-*`) resubmitting with `managerPin` + `managerUserId`; unregistered device unchanged | fitness-pos F15.3 · subset tsc |
| F9 | f51dff01 | visual-pos keeps every seeded request id; cleanup deletes all requests of the visual policy (+ snapshots) before the policy | visual dry rc 0 |
| F10 | 4ed84c27 | dead previous token ⇒ hold with the new token, label "สลับพนักงาน · <prev>"; both holds fail ⇒ no switch (screen stays locked, toast above the overlay) | subset tsc |
| deviation 3 | 46b45ca0 | `regDiscountOver` snapshot adds `capBp: regMaxDiscountBp(s.actor, caps)` + `capRole`; `posApprovalCards` uses them ⇒ 21A over-cap chip | qc-pos-p1.15 green |
| ORACLE-EDIT | 7049639e | TK-U1 + refund with a valid token ⇒ request `requestedById` = token user; AP-U1 + consumed approval no longer quotes the cap (held cart set back to HELD, recall ⇒ no `approvedRequestId`, quote `DISCOUNT_EXCEEDS_LIMIT`). Oracle notes 36 → 39 | qc-pos-p1.15 39/39 |
Merge: `origin/session/pos` 9ba7834b (P1.11U) at ede913ba — conflicts in BillsClient imports, visual-pos (StateKey, seed block, summary) and the inventory (theirs + P1.15U rows); typecheck + qc-pos-p1.15 re-run after the merge (gates below).

| gate (fix round 1 · head ede913ba · logs `scratchpad/p115u/runs/*` with `tree=/root/projects/shark-pos-b head=ede913ba` headers) | result |
|---|---|
| `pnpm typecheck` (gate lock · log ends `typecheck exit=0`) | 0 |
| `qc-pos-p1.15` forced #1 / #2 / unforced | 0 · 39/39 ×3 (residue 0) |
| qc-pos-p1.9 / p1.10 / p1.17 / qc-hf-pos-page-authz | 0 · 53/53 / 0 · 40/40 / 0 · 40/40 / 0 · 56/56 |
| qc-pos-p1.3 | batch 1 · 126/128 (only S9.1/S9.2 restore checks — another lane's visual fixtures landed in the QC coffee shop mid-run: posProduct 7→18, 4 option groups); re-run right after: **0 · 128/128** |
| `pnpm fitness` with QC4 env / without env · `fitness-pos.mts` | 0 · 41/41 / 0 · 41/41 · 0 · 8/8 |
| visual `--states --dry` register / sales × owner / cashier | 0 · 50 / 15 each |

Follow-ups added: consumer ignores decisions that arrive after `POS_APPROVAL_WAIT_MS` (F6, server side, not built).

## Fix round 2 + merge
- **696a86f4** `fix(pos P1.15U): N1 bills fails closed · N2 expiry-cancel notice · N3 no-PIN recheck`
  - N1: `BillsClient` `pinShop` starts `null` ⇒ void/refund disabled with "กำลังตรวจสถานะเครื่อง…" until the device check ends; a failed/non-ok heartbeat sets `true` (fail closed, like the register); unregistered/no device = `false`.
  - N2: 21B shows "ยกเลิกคำขอไม่ได้ · ให้ผู้จัดการยกเลิกใน 21A" when the expiry auto-cancel is refused (no longer swallowed).
  - N3: RegisterScreen re-runs the no-PIN check on tab visible and after each status refresh while in no-PIN mode; a flip to "has PIN" locks the screen.
  - Gates on 696a86f4: typecheck 0 · fitness-pos 8/8 · visual `--page sales --states --dry` owner/cashier rc 0 · `qc-pos-p1.15` forced 38/39 ×2 — only Z2 (coffee-shop fingerprint moved by lane 4 / the controller visual run mid-suite); controller accepted the round on these gates.
- **Merge 2339a13a** = `origin/session/pos` 1e32b118 (P1.7U PromptPay panel · P1.13 S tax invoice · p1.3 receipt-counter ORACLE-EDIT). Conflicts (all "keep both"): `register/page.tsx` (caps + `payIntent`; one `registerSellerLimits(…, caps)`), `RegisterScreen.tsx` props (`autoLockMinutes`/`discountCaps` + `payIntent`), `register-shared.ts` + `register.ts` refusal codes (`ALREADY_SET` + `TAX_ID_INVALID`/`NOT_ELIGIBLE`), messages th/en (`errors.alreadySet` + tax keys), `visual-pos.mts` (StateKey union, dry print, seed block, summary incl. `intentState` + `p115State`), `pos-ui-inventory.json` (theirs + 35 P1.15U rows). `pnpm exec prisma generate` run in tree b after the merge.

| gate (head 2339a13a · logs `scratchpad/p115u/runs/*-m2.log` with tree/head header) | result |
|---|---|
| `pnpm typecheck` (iso + `/tmp/pos-gate.lock`, log ends `typecheck exit=0`) | 0 |
| `pnpm fitness` (no env) · `fitness-pos.mts` | 0 · 41/41 · 0 · 8/8 |
| visual `--states --dry` register owner/cashier · sales owner/cashier | rc 0 · 58 / 58 / 15 / 15 |
| `qc-pos-p1.15` forced #1 / #2 / unforced (after `ctl/vis42-done`) | 0 · 39/39 ×3 · residue 0 |
| qc-pos-p1.7 / p1.13 / p1.3 / p1.10 / p1.9 / qc-hf-pos-page-authz | 0 · 32/32 / 0 · 32/32 (suite has 32 checks after its own ORACLE-EDIT c82d9b8f) / 0 · 128/128 / 0 · 40/40 / 0 · 53/53 / 0 · 56/56 |
