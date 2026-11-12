# P0.3 independent review, round 2 — TRIPS-CORE-CONTRACT.md

- **Object reviewed:** `48b243186` on `session/trips`, plus TRIPS-DEFAULTS "ภาคผนวก ก".
- **Method:** read-only. No builds, no `.env` access.
- **Out of scope:** the controller rulings (accounting V2 instead of POS, two-phase locking, refunds paid as money, baht-only ledger, AgentUser/AgentSession, TripFolio, `/book` and `/agent`, statement layout = mock-up 13ง) are taken as given.

## 1. Round-1 findings — status

| R1 | Status | Where | Note |
|---|---|---|---|
| B-1 pass-through outside VAT | **Closed** | §H.0, §H.1, §H.2 | A new defect sits in the chosen accounts and posting path: N-1, N-2. |
| B-2 basket deadlock | **Closed** | §C, §D.5 | No cycle left (see §3a). The interface wording is inconsistent: N-8. |
| B-3 agency journals | **Partly** | §H.3 | Collection, set-off, remittance, trip close and full cancellation now balance. Cancellation with a fee and the `AGENT_RESELLS` mode are still missing: N-5. |
| M-1 allotment invariant | Closed | §D.0, §D.1 (5)(6), `returnedToPublic` | — |
| M-2 cabin units ALLOTTED | Closed | §D.1 (6)(7), §D.2 | — |
| M-3 hold CAS / PENDING expiry | Closed | §D.0.4, §D.1 (3), §D.4.3 | Minor conflict with §G.0: N-9. |
| M-4 global identity | Closed | §B.2, §J.3.1, `SupplierPeerLink` | — |
| M-5 agent auth and file viewers | Closed | §B.2, §J.3.1, §J.4, L.1 P-4 | LINE remark: N-7. |
| M-6 commission VAT | Closed | §H.4, X26 | X26 default issue: N-10. |
| M-7 currency ledger | Closed | THB-only CHECK | — |
| M-8 facade gaps | Closed on paper | §A.4, §H.1 | Implementability: N-2, N-6. |
| M-9 F5 / tenantDb | Closed | §A.4 | — |
| M-10 migrations | **Partly** | §B.0, §B.3 | (b)–(f) closed. (a) the deploy still has an oversell window: N-3. |
| M-11 marketing exclusion | Closed | §J.4 | `bookingForCrm` returns `partyId: null`, and the CRM bridge then exits (`business.ts:133–140` verified). |
| M-12 refund rules | Closed | §G.3, §H.2 | 6,475 / 4,975 / 7,470 reproduce. |
| M-13 collector × payment-method matrix | Closed | §G.0 | — |
| M-14 statement scope | Closed | §I.3 | Controller ruling 6. |
| M-15 tables builders would invent | Mostly closed | §B, L-54 | The remainder is listed per work order. |
| m-1 enums | **Partly** | — | `CancelRequest.choice` is still `REFUND\|CREDIT\|MOVE` (§C) against `TripRefundRequest.choice` `MONEY\|CREDIT\|MOVE_DATE`. `ConfirmRequest.pay.mode` (`AGENT_CREDIT`/`AGENT_WALLET`/`AGENT_COLLECTS`) does not match `TripBooking.payMethod` (`PAY_NOW`/`PAY_LATER`/`WALLET`/`CREDIT`). |
| m-2 key range | **Partly** | — | §E.4 says "T55 is not in the file". It is: `trips.license.fields`, TRIPS-DEFAULTS line 125. |
| m-3 to m-16 | Closed | — | m-11 and m-13 no longer apply. |
| C-1 to C-12 | Closed | — | Re-checked against the code, including `posVatRateBp :645`, `member/index.ts` exports, `business.ts:46`, `outbox-consumers.ts:1519` and `account/index.ts:2546`. |

## 2. Section M — the writer's disagreements

| # | Who is right | Reason |
|---|---|---|
| M-a | **Writer** | `filterFor` throws only for unit-scoped tables without a unitId (`db.ts:63–68`). Agency tables are tenant-scoped. |
| M-b | **Writer** | A `quota.ts` built on `tenantDb(...).$queryRaw` imports no `prisma`, so it adds nothing to F5. |
| M-c | **Writer, with a caveat** | The POS rule against paying deposits on MEMBER bills is off this path. But no route exists today to issue store credit without POS: the giftcard service only reads or tenders `STORE_CREDIT`. X.2 must add one. Fine while credit stays hidden. |
| M-d | **Writer** | Trip close is now an accounting journal entry, so the cap of 3 deposits per bill never applies. |
| M-e | **Writer, with a condition** | External documents take VAT as a single given amount (`applyExternalDepositReceipt`, `account/index.ts:356–375`). But native account documents compute VAT **per line** (`totals.ts:85–120`, INCLUDE mode: `net = round(line/1.07)` per line). Conditions: «applyTripReceipt» must write a single VATable line, or store header totals as external and never recompute them. A test must show printed VAT = header VAT. §F.1 still says "round per line, total = Σ lines" — scope that rule to amounts only, not VAT. |
| M-f | **Writer** | Moot after controller ruling 1. Mock-up 13ค is a single document. |

## 3. New material

### 3a. Two-phase locking: 14 flows checked, no deadlock found

Why the argument holds:
- Every phase-1 row beyond 1a belongs to exactly one 1a row: an `AgentAllotment` or `TripUnit` belongs to one departure, a `TicketChannelQuota` to one session.
- Every flow locks that 1a row first, so all access to those rows is serialised behind it.
- Two flows take no 1a lock:
  - Cabin assignment locks 1c, then 2b. No flow that holds 2b ever waits on 1c, so no cycle.
  - AGENT_HOLD extension is a CAS on 2a only. It and the sweeper both use row-level re-check: one CAS wins, the other matches 0 rows.

What I tried without finding a cycle: statement (2f only) against confirm, trip close or the commission run (2e → 2f); hold-cap advisory lock (layer 0) against everything (nothing takes it after 1a); `TicketChannelQuota` "semantic order" against "by id". The last one is harmless only because the session row serialises access; note it.

Lost updates: none in the trips counters. One in the ticket deploy (N-3). One inexact count in the hold cap (N-11).

### 3b. Money arithmetic recomputed through §H

| Example | Result |
|---|---|
| Direct receipt 11,450 | Dr 1010 11,450 / Cr 2110 9,299.07, 2200 650.93, 2140 1,500. Balances. |
| Liveaboard 19,740 / 49,660 | 19,740 VAT 1,291.40. 46,060 VAT 3,013.27 + 3,600 pass-through. Σ VAT 4,304.67 = VAT of 65,800. Correct. |
| Refund 6,475 / 4,975 | Credit note 4,649.53 + 325.47 + 1,500 = 6,475. Retained 4,649.54 to 4040, 325.46 VAT stays. 2110 ends at 0. Correct. |
| Agency charge (Vc = 0) | Dr 1100 7,181.50 + 1170 1,050 = Cr 2110 6,542.06 + 2210 457.94 + 2140 1,200 + 2135 31.50 = 8,231.50. Set-off, remittance and close all balance. Full cancellation after set-off mirrors and balances. |
| VAT on commission | EXCLUSIVE: 7,108.00. INCLUSIVE: 981.31 / 68.69 / 29.44 → 7,179.44. Correct. |
| Statement 86,121.15 | 101,700 + 11,400 − 15,255 + 457.65 − 7,181.50 − 5,000 = 86,121.15. Correct. |
| Shop-collect (link) | Accrue, pay and claw-back balance. |

### 3c. Findings

**N-1 MAJOR — proposed account codes are already taken.** §H.1 says "codes free in the starting chart".
- Dorm creates its tenant-deposit liability lazily at **2140–2149** (`gl.ts:2176`, `ensureTenantDepositLedgerInTx`).
- The imported chart defines **4040** = "รายได้ค่าเช่าอุปกรณ์" (`import-shared.ts:114`).

A shop running dorm and trips on one book would put pass-through money into the tenant-deposit account.
Fix: use mapping keys (`TRIPS_PASS_THROUGH`, `TRIPS_CANCEL_INCOME`, `AGENCY_ADVANCE`, `WHT_PENDING`, `COMMISSION_PAYABLE`, `COMMISSION_PREPAID`, `SUPPLIER_COST`, `AGENT_COMMISSION_EXP`) with lazy creation that picks a free code from a range. This is exactly the `ensureTenantDepositLedgerInTx` pattern. The JVs must reference keys, not codes.

**N-2 MAJOR — «applyTripReceipt» cannot use the standard DEPOSIT_RECEIPT posting.**
`gl.ts:658–676` posts Cr DEPOSIT_RECEIVED = grandTotal − VAT, which would put the pass-through into 2110. It also ignores the line `accountId` override.
Fix: state that the function writes its own JV (like `postExternalDepositReceipt`, plus a pass-through leg) and creates the document as an external document with given totals and no automatic posting.
Two related points:
- These deposit documents are never deducted by a later receipt. Account deposit-outstanding views must exclude `source TRIPS`.
- State the `vatRateBp` of the pass-through line (0 or −1 = exempt) and how the ภ.พ.30 sales report treats it. Exempt lines can show up as exempt sales.

**N-3 MAJOR — the ticket deploy can oversell.** §B.3.
Step 1 copies `type.sold`. Old code keeps selling until step 2, and those orders have `sessionId NULL`. New code then sells against a stale session counter until step 3 runs.
Example: quota 100, sold 99 at migration. Old code sells 1. After deploy the session says 99, so new code sells 1 more: 101.
Fix:
- The reconcile also assigns `sessionId` to orders and admissions created in the gap.
- Sessions carry `reconciledAt`; new code refuses to sell (`BUSY`) on a session that has not been reconciled. Alternatively, run the reconcile before traffic is switched.

**N-4 MAJOR — counter cash outside the POS shift has no reconciliation story.** L-55, §H.0.
"A separate daily report" names no cash account (which `AccountFinance` the Dr 1000 hits), no count, no handover and no variance posting. If staff use the POS drawer, every POS shift close shows a surplus.
Fix: a per-unit trips cash account (`AccountFinance`), a daily count/close record with variance posted to a JV, and handover via `AccountFinanceTransfer`. Also an explicit rule: separate drawer, or cash moves out at close. This is needed before T1.3.

**N-5 MAJOR — agency journals still missing.** §H.3 ก.
- (i) Cancellation with a fee in agency-collect mode: what happens to the 1170 prepaid-commission balance (expense or claw back, per A23); whether the VAT on the retained part moves 2210 → 2200 when no remittance has happened; and whether `CANCEL_FEE` is a separate ledger row or netted inside `CANCELLATION` ("if not already deducted" leaves the builder to guess).
- (ii) The `AGENT_RESELLS` mode (A5, selectable, W13) has no journal at all.

Fix: add the rows, or hide `AGENT_RESELLS` in round 1 (state which).

**N-6 MINOR — closed accounting periods.** `assertPeriodOpen` (`gl.ts:171–176`) rejects postings into a CLOSED period. A late trip close, a cancellation, or an UNPOSTED retry dated in a closed month would retry forever.
Fix: a posting-date policy (post in the first open period, keep the event date in the memo) and a cap on the retry queue.

**N-7 MINOR — agent identity details.**
- LINE `userId` is scoped per provider. Login through each shop's OA gives the same person a different id. Key the row as (provider/channel id, `lineUserId`) and allow several login methods per `AgentUser`. Otherwise a LINE-only agent cannot be the same identity at two shops (the Q7 premise).
- `AgentAccountMember` rows must be created only when the agency accepts an `INVITED` account, never by the shop.

**N-8 MINOR — the phase-1 interface is described two ways.** §C has `reserveInTx(tx, ctx, rows[], intent)`; §D.5 has `reserveInTx(tx, ctx, line)` called "one row at a time".
Fix: state that phase 1 is one global sort of `CapacityRowRef`, and each call runs only the statement for that row with that line's intent. Example: the departure update of (2) in one call, the allotment update in a later call.

**N-9 MINOR — hold duration for agency PAY_NOW.** §G.0 says the hold lasts A16; §D.4.3 says `PAYMENT` = T5 "and nowhere else". Use A16 for `purpose PAYMENT` when there is an `agentAccountId`.

**N-10 MINOR — contract vs DEFAULTS consistency.**
- X25 (`returnCancelledToQuota`) chain: the contract index says AT·A·P, the appendix says SHOP·AGENT.
- X26's default depends on `AgentAccount.vatRegistered`. The settings engine can only give template defaults, so it must be resolved at use time; say so.
- T55 exists (m-2).
- §F.1 per-line rounding vs §H.2 VAT per document (M-e).
- Enum mismatches (m-1 above).

**N-11 MINOR — hold cap.**
- The public `contactKey` may not be known when the hold is taken (before the booker form).
- The count must filter `expiresAt > now`.
- The waitlist-offer and move flows create holds without taking the layer-0 lock.

State which flows count toward the cap.

### 3d. Accounting facade — implementability (checked against code)

- **Document kinds:** `DEPOSIT_RECEIPT`, `RECEIPT`, `TAX_INVOICE`, `CREDIT_NOTE`, `BILLING_NOTE`, `WHT_CERT`, `PURCHASE`, `EXPENSE` all exist (`account.prisma:7–32`).
- **Numbering:** `nextDocNo(tx, tenant, system, docType, date)` (`service.ts:1245`). Correct.
- **Book per unit:** the `BUSINESS` link per unit exists (`dormBook` → `findAccountLinksFor`). Correct.
- **Existing accounts:** 1100, 1130, 1150, 1155, 1160, 2100, 2110, 2130, 2200, 2210 and 4030 exist. Correct.
- **New accounts:** see N-1. **Posting path:** see N-2. **Period locks:** see N-6.
- **`AccountDocSource` TRIPS/AGENCY/SUPPLIER:** in a migration of its own. Correct.
- **Folio settlement:** `reverse/restoreRoomChargePosting` takes `{posSystemId, saleId, …}`, usable for trip folios. Correct.

### 3e. What a T0.1 builder would still have to invent

- **Status value lists:** `TripPaymentDue.status` (the r2 table dropped the values), `TripPassenger.formStatus`, `TripPdpaRequest.kind/status`, `TripWaitlist.status`, `TripSeason.status`.
- **JSON shapes:** `TripSchedule.rule/exceptions`, `TripPriceRule.params`, `TripDeparture.stopSell/insurance`.
- **Snapshot keys:** the exact key list for snapshot kind `"trips.booking"`. §E.4 marks ⓢ only "as examples", and the appendix keys (X11, X16, X19) are not marked at all.
- **Unit types:** the per-def `unitTypes` (trips → `TRIPS`, ticket → `TICKET`, agency → both?).
- **Settings screen:** which work order adds `severity` and `reviewHint` to `SettingsForm` (T0.1 or T1.1).

## 4. Verdict: **READY, with gated fixes**

No blocker remains. T0.1–T0.6 can start once the §3e items go into the T0.1/T0.5 brief. Fix these in the contract before the gated work order:

| Fix | Before |
|---|---|
| N-1 and N-2 (and N-6) | T0.7 |
| N-5 | A1.5 |
| N-3 | K1.1 |
| N-4 | T1.3 |
| N-7 | A1.2 |
| N-8 | T0.6 |
| N-9, N-10, N-11 and the m-1/m-2 leftovers | Edit in the next contract touch |

Owner items: unchanged from §L.1 P-1…P-7. Add a mention in the N-4 owner note that counter cash stays outside the POS drawer.
