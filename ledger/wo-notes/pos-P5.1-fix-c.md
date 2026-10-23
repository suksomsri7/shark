# P5.1 FIX batch C — builder (account B · 23 Oct 2026 · tree p11 · branch `wip/pos-p5.1-fix-c`)
Base: `origin/session/pos` f9edab55 (batch B merged). Scope: R1 (batch B) F3 → **CD-P51-O8** (forfeit) · F4 → **CD-P51-O9** (module receipt pay type) · brief `ledger/pos-briefs/pos-prompt-accountB-P5.1-FIX-C-BUILD.md`.
Constraints kept: no migration · no `prisma/` · no new `createSale(` call site (U4/HT6.4/L2 unchanged) · no new error code · every hunk marked `POS P5.1 ▸ MA12/MA13/MA14 ◂` · OP lines at the end of `POS-OWNER-PENDING.md`.

## 1. Check → commit → change
| check | commit | change |
|---|---|---|
| MA12 MA12b MA13 MA14 (oracle) | ab2b3472 | `qc-pos-p5.1`: 4 rows (batch C · finding R1-F3/R1-F4 · `C_IDS`) + verdicts + self-test samples (good / R1 numbers) · `MA_IDS` = MA1–MA11 only · fixture + MGR user · `depositMod` import |
| MA14 (O9) | 161ca81b | `moduleTakeDeposit` payType = real method (CASH/PROMPTPAY/TRANSFER/CARD) · missing/other (incl. `DEPOSIT`) ⇒ **TRANSFER** · booking/hotel/rental `recordDeposit` default `"TRANSFER"` · `closeDaySummary`: a no-ref DEPOSIT row on a POS_DEPOSIT receipt/CN counts as TRANSFER (same channel as account-bridge `depositChannel` → 1010) ⇒ the DEPOSIT line = deposit used on final bills only |
| O9 ORACLE-EDITs | 49950894 | p2.9b A6 · BD-3.2 · HP-4.1 · RP-4.1: receipt pay row DEPOSIT → TRANSFER (JV assertions unchanged) |
| MA12 MA12b MA13 (O8) | e3b5b815 | `pos/deposit.ts` **forfeitDeposit** core (key `dep-forfeit:<depositId>` + advisory lock · bill one line `มัดจำริบ — ไม่มาตามนัด` = remaining · pay `{DEPOSIT, refSaleId}` · memberId = deposit owner (มติ 4) · createSale locks/applies the deposit ⇒ USED · audit `pos.deposit.forfeit` (PosDeposit · reason · actor · source) only on a new bill · DEPOSIT_EXCEEDS/P2002/P2034/P2028 ⇒ re-read ×3) · **moduleForfeitDeposit** (legacy = no PosDeposit ⇒ no-op) · **registerForfeitDeposit** (scope check · `pos.sale.manage` · reason required · module deposits only · regCreateSale `sourceModule POS` · device shift if any) · lookup row `fromModule` · `booking setAppointmentStatus` NO_SHOW ⇒ `forfeitNoShowDeposit` after the status commit · booking's single createSale moved into `bookingTxSale(tx, input)` (shared by recordDeposit + forfeit · `callerTx(tx)`) · `deposit-actions.ts registerForfeitDepositAction` · `DepositRefund.tsx` "ริบมัดจำ" button + sheet (bills drawer of the deposit receipt) · th/en keys `bills.deposit.forfeit*` · `pos-ui-inventory.json` 7 rows (fitness F15.3a) · `pos-authz-matrix` row (OVERRIDE CASHIER deny · gen `--check` ok) |
| L3 re-pin | b443b8b4 | `P29B_L3_PIN` c82ee447 → **e3b5b815** |

## 2. Red-before / green-after (QC4 · iso ISO_MEM 3G · qc4.sh · POS gate lock · logs `scratchpad/p51c/logs/`)
| check | red-before | green-after (b443b8b4 · run1 + run2) |
|---|---|---|
| MA12 (O8a) | oracle ab2b3472 on product f9edab55 (`redbefore-ab2b3472.log`): NO_SHOW ok · forfeit bills 0 · deposit 50,000 OPEN · 2110 net 46,729 · GL revenue 0 · audit 0 (= R1 F3) | ✅ 1 bill PAID 50,000 "มัดจำริบ — ไม่มาตามนัด" · pay [DEPOSIT:50000] only · GL 4xxx 46,729 · 2200 net 3,271 · 2110 net 0 · deposit 0 USED · audit 1 · repeat NO_SHOW = still 1 bill |
| MA12b (O8b · control) | ✅ by design (cancel already left the deposit OPEN) — self-test flips it red on the "forfeit on cancel" sample | ✅ booking CANCELLED · hotel cancelReservation · rental cancelBooking: OPEN 50,000 · 0 forfeit bills |
| MA13 (O8c) | ❌ `MISSING:registerForfeitDeposit` · deposit OPEN 50,000 | ✅ cashier PERMISSION_DENIED (0 bills) · manager no reason REASON_REQUIRED (0) · manager + reason ok 1 bill 50,000 · deposit 0 USED · audit reason + manager id · again = 1 bill |
| MA14 (O9 · GL 1010 probe) | ❌ new receipt [DEPOSIT] · 15 DEPOSIT rows on module receipts · day report DEPOSIT 910,000 vs final bills 160,000 · Dr 1010 of module receipts 750,000 vs their TRANSFER rows 0 | ✅ receipt [TRANSFER] · 0 DEPOSIT rows on module receipts · DEPOSIT = final-bill rows · TRANSFER = Σ TRANSFER rows · Dr 1010 (module receipts) = Σ their TRANSFER rows |
| O9 ORACLE-EDITs | product f9edab55 src (`redbefore-o9/`): p2.9b A6 ❌ (row DEPOSIT) + L3 ❌ (edited suites ≠ pin) · BD-3.2 ❌ PAID/DEPOSIT · HP-4.1 ❌ · RP-4.1 ❌ | ✅ p2.9b 53/53 · booking-deposit 18/18 · hotel-public 15/15 · rental-public 16/16 |

## 3. ORACLE-EDIT (CD-P51-O8/O9)
- `qc-pos-p5.1`: + MA12 MA12b MA13 MA14 · `MA_IDS` limited to MA1–MA11 (registry ST1 still checks F1–F11 one-to-one) · `C_IDS` registry check · fixture user MGR (MANAGER) · module import `pos/deposit`.
- `qc-pos-p2.9b` A6 (title + `pays[0].type` DEPOSIT → TRANSFER) · `P29B_L3_PIN` c82ee447 → **e3b5b815**.
- `qc-booking-deposit` BD-3.2 · `qc-hotel-public` HP-4.1 · `qc-rental-public` RP-4.1: receipt pay row DEPOSIT → TRANSFER. JV assertions (Dr 1010 / Cr 2110 46,729 / Cr 2200 3,271) unchanged.
- Not an oracle but generated tables: `scripts/pos-authz-matrix.json` (+ OVERRIDE in `pos-authz-matrix-gen.mts`) · `scripts/pos-ui-inventory.json` (+7 rows).

## 4. Suites at head b443b8b4 (this notes commit = ledger only)
| suite | result |
|---|---|
| qc-pos-p5.1 run1 / run2 / --no-db | **21/21 · 21/21 · 2/2** (guardHits 0 · pumpErrors 0 · residue 0) |
| qc-pos-p2.9b · qc-booking-deposit · qc-hotel-public · qc-rental-public | 53/53 · 18/18 · 15/15 · 16/16 |
| qc-hotel-refund · qc-rental-refund (extra · deposit refund path) | 15/15 · 11/11 |
| qc-pos-p1.6 · qc-hf-tx · qc-pos-p3.6 | 48/48 · 22/22 (HT6.1/HT6.4 · booking 1 site) · 52/52 |
| qc-money-mapping · qc-account-cpa | 5/5 · 107/107 |
| pre-submit core (`presubmit/`) | p1.1 180/180 · p1.3 128/128 · p1.18 81/81 · fitness ±env 53/53 · fitness-pos 8/8 · gen-check ok · hf-fu 28/29 + hf-fu2 30/31 = ST1 lane pins only (service.ts / deposit.ts vs merge-base) · unexpected red: none |
| qc-pos-p2.10 --no-db | 1/2 — ST2 lane pin only (`service.ts` hunk +5 −1 · p2.9b + p5.1 oracle files CONTROLLER-DECISION) |
| pos-authz-matrix-gen --check | ok (399 rows) |
Runner note: pre-submit + gates-all were run from scratchpad copies with ISO_MEM 3G (the tree scripts hard-code 5G; owner rule ≤ 3G) — same suites, same QC4 wrapper + POS gate lock.

## 5. Design choices (brief ambiguities · smallest option)
1. **Where the register "ริบมัดจำ" lives**: the existing bills-drawer deposit control (`DepositRefund.tsx`, the only register UI for OPEN deposits) — a second button next to "คืนมัดจำ", shown only for module deposits (`fromModule` on the lookup row = PosDeposit key `dep:mod:`). Server = `registerForfeitDeposit` next to `registerRefundDeposit`. No manager-PIN path (ruling says `pos.sale.manage`); a cashier gets "ริบมัดจำได้เฉพาะผู้จัดการ".
2. **How the module form passes the pay method**: the three module forms have no method field ⇒ no form change; the service default is TRANSFER and `moduleTakeDeposit` never records DEPOSIT for money in (an explicit "DEPOSIT" maps to TRANSFER). A future form field only needs to pass `payMethod`.
3. Forfeit bill: auto (NO_SHOW) = `sourceModule BOOKING` · sourceId appointment · through booking's existing call site; register = `sourceModule POS` · sourceId deposit · `regCreateSale`. One key per deposit ⇒ both paths together = one bill.
4. Forfeit is after the status commit (not in the status tx — createSale owns the deposit lock order). A failure (e.g. `SHIFT_REQUIRED` when other-source sales need an open shift) leaves the deposit OPEN, logs, and the register forfeit is the fallback.
5. A member deposit's forfeit bill carries `memberId` = deposit owner (required by `DEPOSIT_NOT_OWNER`); no `pointSystemId` ⇒ no points, but member bridges see a member bill (INFO for member owner).
6. NO_SHOW set by mistake: the forfeit bill stays; voiding it at the register restores the deposit to OPEN (existing `depositSaleVoided`). Not automated on status change back.
7. Day report: only `closeDaySummary` byMethod remaps legacy no-ref DEPOSIT rows on deposit receipts/CNs (batch-B era) to TRANSFER; `reports.ts` payment report untouched.
8. Register deposits (taken at the register) are refused by `registerForfeitDeposit` (VALIDATION) — ruling (c) covers module deposits; register-deposit expiry/forfeit stays CD6/W39.

## 6. Not done / not verified
- Strict tsc (controller). No UI/visual run of the new sheet. `qc-pos-p5.2` DB (R1 fires every action row; new row CASHIER=deny) not run — other lane's suite; matrix `--check` green.

## 7. R1 round 1 (R1 of batch C · controller ruling **CD-P51-O10** · 23 Oct)
Red-before = oracle 2fbcebbd on product c683f5e9 src (`logs/redbefore-o10/`) + R1 probes `scratchpad/p51-fix-c-r1/logs/probe-c*.log` · green-after = 0430b249 (`logs/final-o10-0430b249/`).
| fix | commit | change | red-before | green-after |
|---|---|---|---|---|
| F1 HIGH tier discount | bd5a1b08 | forfeit sell input `memberAttachOnly: true` when the deposit has a member (createSale skips tier/benefits) | MA12c: NO_SHOW "ริบมัดจำไม่สำเร็จ" · 0 bills · OPEN 50,000 · MA13b: INTERNAL (probe Q2: PAYMENT_MISMATCH 50,000 ≠ 45,000) | ✅ MA12c / MA13b: 1 bill 50,000 · discount 0 · deposit 0 USED |
| F2 MED member effects | fa77a9c5 | `member-bridges.ts loadSale` ⇒ null for `dep-forfeit:` bills (paid/void/refund paths: points · totalSpent · PURCHASE timeline · first purchase · tier eval · campaign · referral) · `stamp autoStampFromSaleEvent` skips them | probe Q1: pointEarned 20 · EARN 20 · totalSpent 0 → 50,000 · PURCHASE row | ✅ MA12c / MA13b: points 0 · totalSpent +0 · timeline 0 |
| F3 MED voided key | bd5a1b08 | `forfeitKeyOf`: PAID/REFUNDED bill on the key = dup · VOIDED ⇒ `dep-forfeit:<id>-r<n>` · voided mid-tx ⇒ retry | MA12d: re-forfeit = old VOIDED bill · deposit OPEN 50,000 (= probe Q4) | ✅ new bill PAID · deposit 0 USED |
| F4 MED leave NO_SHOW | bd5a1b08 | `setAppointmentStatus`: previous NO_SHOW → any other status ⇒ `moduleUnforfeitDeposit` (PAID + unrefunded forfeit bill ⇒ `voidSale` + `depositSaleVoided` now) before the status update · void refused / refunded ⇒ status unchanged + message naming the bill (`{ok:false, unforfeit}`) | MA12e: bill PAID · deposit USED 0 · DONE [CASH 200,000] · Σ revenue 250,000 | ✅ bill VOIDED · OPEN 50,000 · DONE [DEPOSIT 50,000 + CASH 150,000] · Σ 200,000 |
| F5 surfacing | bd5a1b08 | `setStatusAction`: `{ok:false}` ⇒ `logOps WARN pos.deposit.forfeit_failed` (forfeit failures) + redirect `?err=` · booking page shows the reason card (`booking-status-error`) · `PAYMENT_MISMATCH` ⇒ VALIDATION message (not INTERNAL) · DEPOSIT_CLOSED = no failure | MA12f: no redirect · 0 OpsEvent (probe Q2/Q7: silent / INTERNAL) | ✅ redirect `?err=` · OpsEvent WARN ≥ 1 · deposit OPEN |
| F6 commission | b979a6f2 | `staff-commission accrualRows` returns [] for `dep-forfeit:` bills | MA13 ACCRUE 2,500 (= probe Q6) | ✅ ACCRUE 0 |
| F7 button | 0430b249 (+ lookup `canForfeit` in bd5a1b08) | lookup row `canForfeit` = module deposit ∧ `pos.sale.manage`; button rendered only then · UI inventory 7 rows roles owner/manager · `hiddenFor: ["cashier"]` | (static) button shown to every role | ✅ fitness F15.3a green · matrix `--check` ok |
| F8(b) reports | fa23e6c7 | `shift.ts computeReport` + `reports.ts reportPayments`: no-ref DEPOSIT row on a POS_DEPOSIT receipt/CN ⇒ TRANSFER (same rule as `closeDaySummary`) | MA14b: shift T0/D50,000 · day T50,000/D0 · payments T0/D50,000 | ✅ all three T50,000/D0 |
| F9 other branch | (oracle) | MA13 + manager of branch A on branch H | NOT_FOUND (control · already denied) | ✅ NOT_FOUND |
| F8(a)(c) | ledger | OP lines only (W41 = controller) | — | — |
Oracle (ORACLE-EDIT CD-P51-O10 · 2fbcebbd): + MA12c MA12d MA12e MA12f MA13b MA14b (`C2_IDS`, finding `RC-Fn`) · MA13 + other-branch manager + commission ACCRUE · fixture: BOOKING units BM (MEMBER + new POINT system) / BZ, MGR manager, tier VIP 10 % (lazy). `P29B_L3_PIN` unchanged (e3b5b815 — pinned functions/suites not touched this round).
Design notes: (1) refunded forfeit bill (refundedSatang > 0) ⇒ leaving NO_SHOW is refused (no auto void of a partly refunded bill). (2) The status-refusal path (void refused) is not exercised by an oracle row (needs a closed-shift forfeit bill); covered by reasoning + the `{ok:false}` branch. (3) Commits group F1/F3/F4/F5 because they share `deposit.ts` hunks.
Suites at 0430b249 (QC4 · iso 3G · qc4.sh · POS gate lock · sequential):
| suite | result |
|---|---|
| qc-pos-p5.1 ×2 | **27/27 · 27/27** (guardHits 0 · pumpErrors 0 · residue 0) · `--no-db` 2/2 |
| p2.9b · booking-deposit · hotel-public · rental-public | 53/53 · 18/18 · 15/15 · 16/16 |
| p1.6 · hf-tx · money-mapping · account-cpa | 48/48 · 22/22 · 5/5 · 107/107 |
| p1.9 · p1.9b · closeday (unforced) | 53/53 · 22/22 · 22/22 |
| p3.6 · p3.5 (extra · commission) | 51/52 **ST4** · 54/55 **ST2** — file pin "shift.ts byte-equal to pin" (R2 S5.12 / มติ 11): F8(b) changes `computeReport` as ruled ⇒ needs a controller re-pin/ORACLE-EDIT (all DB rows green) |
| member suites of the manifest (m2.6 m2.7 m2.8 m1.7 · unforced) | 0/1 each = the manifest's accepted setup crash on QC4 ("reading 'role'" · member seed ≠ member-expected.json) — no QC4 member suite exercises purchase points; MA12c/MA13b cover the forfeit side |
| p2.10 --no-db | 1/2 ST2 lane pin only (service.ts +5 −1 · oracle files CONTROLLER-DECISION) |
| fitness (iso) · fitness-pos · authz matrix `--check` | 53/53 · 8/8 · ok |
