# P0.3 independent review — ledger/TRIPS-CORE-CONTRACT.md

Reviewer: independent (read-only). Tree `/root/projects/shark-trips`, branch `session/trips`, HEAD `ce9d16656` (the contract says it checked `@dadf9bc4b`; the only commits since then are ledger docs). I changed no repository file, did not read `.env*` and ran no builds or tests.
Ground truth used: code > TA (rulings rounds 1–5, §12.1, §13.1) > MP §2/§3 > CC > README and mock-up 15.

---

## 1. Claims about existing code

Verified correct (no action needed): `channels.ts` (pure), `dorm-pay.ts`, `registerMinuteJob` and `rooms.expireHolds`, `notifyCustomer` domain `"booking"|"rooms"` with `${domain}.msg.${messageKey}` and a template-only def (`notify-customer.ts:35,182-185`), `SCOPE_KINDS`/`SettingDomain`/`SettingUnitType` closed (`types.ts:15,32,48`), `SUPPORTED_SCOPES`/`REF_FIELD`/`locateMany`/`entitiesOfUnit`/`refsFor` returns null without a unit/`snapshotPolicy` on `prisma` outside the tx (`service.ts:84,205,281,429,481-488`), `isValidOutOfScopeReason` at `service.ts:943`, `registry.ts:11,30,139-151,196`, `scope.ts` `g()`, `PosDocCounter` upsert (`pos/deposit.ts:508`), `moduleTakeDeposit:609`, `moduleDepositForBill:690`, `moduleRefundDeposit:703` (whole remainder only), `moduleForfeitDeposit:865`, `moduleUnforfeitDeposit:881`, `MAX_DEPOSIT_ROWS` ≤ 3 (`pos/service.ts:354-359`), receipt number `period-NNNN` (`pos/service.ts:1013`), `HotelFolio.reservationId @unique` required FK (`hotel.prisma:396-397`), `UnitType` has no TRIPS (`core.prisma:63`), `TicketType.quota/sold` (`ticket.prisma:64`), ticket `orderNo` uses max+1 without a lock and `TK-`+10 codes (`ticket/service.ts:37,216-224,237`), account `vatConfigOf:50`, `applyExternalChannelCommission:726`, `createExternalInvoice` CRM/DORM overloads (`:1132-1154`), `createExpenseDoc:1359`, `postSecurityDeposit:1973`, `wht.ts` `issueWhtCreditCert:138`, `issueWhtCert:310`, `pnd:413`, `promptpayQrFor`/`receiverFor`, the `payment.slip.approved` consumer `bothMain` (`outbox-consumers.ts:995`), `LINK_PURPOSES` with 3 values, `checkRateLimitDb:38`, `uploadFile:209`, `deleteStoredFile`, `privateFileUrl` with a 900 s cap, `signLink`, `HotelGuestRecord.idNumberEnc`, `CustomerOtp`, `PosHeldCart`, `issueTicketTx`, `FALLBACK_LEGACY`, `hotel.booking.deposit_after_expiry`, `/b/[slug]` taken and bound by fitness F2.3/F2.4 (`fitness.mts:538,585`), and `AccountDocSource` gained `DORM` through `ALTER TYPE` (precedent).

Wrong or incomplete (each one is used in a finding below):

| # | Contract claim | Real state |
|---|---|---|
| C-1 | §A.3: "all new code calls POS through the `@/lib/modules/pos` facade". §H.1 calls `moduleTakeDeposit`, `moduleRefundDeposit`, `moduleDepositForBill` and `moduleForfeitDeposit`. | `pos/index.ts` exports none of these (it has only `createSale`, `voidSale`, `afterSaleCommitted`, … and `serviceBills.depositForBill`). Hotel and booking import `pos/deposit` and `pos/service` directly. Following the contract as written means editing the POS facade, which is a POS change. |
| C-2 | §H.1 workaround: "a separate POS bill for the passThrough lines, product tax NONE". | POS has no tax per line or per bill. `CreateSaleInput.lines` has no tax kind (`pos/service.ts:98-117`), and VAT comes from the POS system: `posVatRateBp(tx, tenantId, systemId)` (`:952`). A non-VAT bill cannot be issued on a VAT-registered POS. |
| C-3 | §H.2: `recordExternalPayment` "already exists, used by DORM" and `createExternalCreditNote` "already exists". | Both are DORM-only. The input types are `DormChannel`/`DormExternalNoteInput` and both resolve the book through `dormBook(tenantId, unitId)` (`account/index.ts:1926,1948-1966`). TRIPS needs overloads. |
| C-4 | §H.2 account documents with `sourceKind "TRIPS"`. | `AccountDocSource` (`account.prisma:100`) has no TRIPS, AGENCY or SUPPLIER value. The contract never lists that `ALTER TYPE`. |
| C-5 | §L-16: "F5 = raw SQL; capacity.ts is the only raw-SQL file → +1". | F5 counts files that **import `{ prisma }` from `@/lib/core/db`** (`fitness.mts:617-618`), not raw SQL. `tenantDb` runs SQL fine. Raw `prisma` is needed for every cross-tenant sweep and for every lookup that happens before the tenant is known, so the budget is much larger than +2. |
| C-6 | §B.3/L-32: moving the SQL from `ticket/service.ts` to `quota.ts` costs "F5 +0". | `service.ts` keeps importing `prisma` for other code (line 1), so a new `quota.ts` that imports it counts +1. |
| C-7 | §J.4 / `TripDocView.viewerKind AGENT, CUSTOMER`: files open only through `privateFileUrl`. | The file route `api/files/[id]` accepts only STAFF (with a `Membership`), CUSTOMER (with a `CustomerSession`) or PORTAL (CRM) viewers (route.ts:94-138). Agents and token-only customers have no viewer kind. The argument order is also `(fileId, viewer, ttl)`, not `(fileId, ttl, viewer)`. |
| C-8 | §L-18: the agent's `AgentIdentityUser.userId` is a platform `User`, logging in by LINE or e-mail. | `User.email` is required and unique (`core.prisma:107`). A LINE-only agent cannot become a `User`. The migration list also has no agent session table. |
| C-9 | §L-42: "TRIPS-DEFAULTS has only `trips.msg.enabled` (T69)". | TRIPS-DEFAULTS already has **T70 `trips.msg.<kind>`** (one template per kind, th+en). §E.4 also says "T1–T69 (70)", but the range is T1–T70. |
| C-10 | `SLIP_DOMAIN_REF` lives in `slip-verify.ts:219`. | It is defined at `payment/slip-shared.ts:76`; line 219 is only where it is used. |
| C-11 | §H.1 calls `moduleTakeDeposit({keyBase, amountSatang, payType, customerId, createdBy}, sell)`. | The function also requires `tenantId`, `unitId` and `systemId`. `systemId` comes from `systemForUnit(…,"POS")`, as `hotel/booking.ts:996` does. A TRIPS unit with no POS bound gets `NO_POS`. Neither the contract nor T1.9 (onboarding) says anything about this. |
| C-12 | §E.5: "the registry rejects at load time any trips/agency/ticket rule that can return BLOCK". | `evaluateLegal` is wired to `TH_RENTAL_2568_RULES` and returns BLOCK on an unknown rule (always) and on invalid input (`guarded()`). `modeOf` forces STRICT when `unitId` is null (`service.ts:745`), and that is the case for every AGENT/AGENT_TIER row. Unless the contract requires the tour evaluator to return **WARN (not BLOCK) on invalid input**, the engine can still produce `LEGAL_BLOCK` in these domains. |

---

## 2. Findings

### BLOCKER

**B-1 — No named path can keep the park fee (pass-through) outside VAT, and the proposed workaround is impossible.** §H.1, §H.6, L-9.
Evidence: C-2. `moduleTakeDeposit` takes a single `amountSatang`, and VAT is set per POS system. The §H.1 fallback ("separate POS bill, tax NONE") cannot be built. Even if it could, `createSale` → `applyExternalSale` would book the 1,500 as **sales revenue**, not as money collected on behalf of customers (a liability), which breaks MP §2 rule 6 and TA §13.1 L5. The README receipt (9,299.07 + 650.93 + 1,500 = 11,450) cannot be reproduced. With the TRIPS-DEFAULTS default T14 = `TRIP_ONLY`, the Liveaboard example puts the park fee (2 × 1,800) in **instalment 2** (49,660), not instalment 1 as §H.1 assumes.
Correction: state plainly that without a POS change pass-through cannot run through POS at all. Either (a) get owner permission for `lines[].taxKind` / a pass-through amount on `moduleTakeDeposit` and `createSale`, posted to a "money received on behalf" liability; or (b) add a new account V2 facade function, e.g. «postPassThroughReceipt» (Dr cash, Cr money-received-on-behalf, no VAT; idempotency key `trips-pt-<dueId>`; reversed on refund). Split each paid instalment into a POS deposit receipt (VAT part) plus that entry. Either way, define the refund of a pass-through (C-1 and B-1 currently have none) and pass-through on any instalment, not only the first. Owner decision: OQ9 must be re-asked with "the workaround does not work" stated.

**B-2 — Deadlock in the basket (and in any multi-line confirm) because `confirmInTx` takes its locks one kind at a time.** §C rule 4, §D.5.
Concrete interleaving (agent X, tour departure D, ticket session S):
- T1 `basketConfirm` [TRIP(D) + TICKET(S)]: TRIP `confirmInTx` locks D (level 2) → … → `AgentBalance(X)` (level 9, `postEntries`). Then TICKET `confirmInTx` asks for `UPDATE TicketSession S` (level 2) and waits.
- T2 is an agency ticket order on S: it locks S (level 2) → … → `postEntries` → asks for `AgentBalance(X)` and waits for T1.

Each waits on the other: `40P01`. The same cycle exists inside a single kind whenever a basket has two departures D1 < D2: line 1 reaches `AgentBalance(X)` before line 2 locks D2, while a concurrent single booking on D2 for agent X holds D2 and waits for `AgentBalance(X)`.
Correction: a basket must run in two phases. Phase A takes the level 2–5 locks for every line of every kind, sorted (kind, id). Phase B takes levels 6–11. Split the interface into `reserveInTx` + `finalizeInTx`, or have `postEntries` collect entries and post them once at the end of the basket. Add a rule to §D.5: "no level-k lock after any level > k lock **anywhere in the transaction**". Add this exact interleaving to the X concurrency test.

**B-3 — The default agency flow (agency collects, Q2/A10) has no journal entries for revenue, commission expense or the WHT payable.** §H.2, §H.3, §I.
Evidence: H.2 posts only ledger rows (`CHARGE`/`COMMISSION_NETTED`/`WHT_GROSSUP`) plus a later invoice built from the statement. «applyAgentCommissionAccrual» exists only for shop-collect (H.3). Nothing records the shop's commission expense or its WHT payable (31.50, ภ.ง.ด.53) when the commission is netted. Nothing issues the shop's 50 ทวิ to the agency. «issueAgencyWhtReceipt» covers the **opposite** direction, the agency withholding from the shop, which happens only with `AGENT_RESELLS`. And nothing recognises revenue at trip close for `collectMode = AGENT` (there is no POS close bill). Under the L-11 proposal, revenue then depends on when the statement is issued and can land in the wrong month.
Correction: name explicit new account facade functions and their entries:
- trip close (AGENT collect): Dr agency receivable (or Dr advance received), Cr revenue/VAT per the snapshot;
- netting: Dr commission expense (+ input VAT if the agency is VAT-registered), Cr agency receivable; Dr agency receivable, Cr WHT payable 31.50; and the shop's `issueWhtCert` (payer side) with date = `settledAt`;
- the reverse of each on cancellation or claw-back.

Then recompute 8,200 − 1,050 + 31.50 = 7,181.50 and 86,121.15 through those entries in the A1.5/A1.6 tests.

### MAJOR

**M-1 — The allotment invariant breaks when a sold allotment seat is cancelled with `returnCancelledToQuota = false`, and step (6) ignores a 0-row result.** §D.1 (5)(6), §D.3.
Interleaving: allotment qty 10, used 6, departure `reserved` = 4. The agent cancels 2 sold seats with the flag off. `used` becomes 4, so Σ(qty − used − held) = 6, but `reserved` stays 4. The next release (6) sets `releasedAt` with `releasedQty` = 6, then runs `UPDATE … reserved − 6 WHERE reserved >= 6`: 0 rows, never checked. The allotment is now marked released, but the departure still holds 4 phantom reserved seats (lost to the public). If several allotments share the departure, the release instead eats another agent's reserved seats, so that agent's contracted quota fails `reserved >= n`.
Correction: when the flag is off, decrease the allotment the same way (`qty − n`, or a `returnedQty` column) so that Σ stays equal to `reserved`. Every multi-statement counter step must check its row count and throw on 0 (state this as a rule for (3)–(8)). Reading `releasedAt` for (4)/(5) must happen **after** the departure lock (state this too).

**M-2 — Liveaboard: cabins marked `ALLOTTED` are never freed, and the berth chosen is not tied to the counter path.** §D.1 (6)(7), §D.2, L-21.
(6) and (7) never touch `TripUnit`. After an allotment is released its berths stay `ALLOTTED`, so they cannot be sold publicly while `publicLeft` says they are free (`BERTH_TAKEN` at hold time). An agent who holds through the allotment path (2) may pick a `FREE` berth (§D.2's WHERE allows `FREE OR ALLOTTED`). That consumes `reserved` while its own allotted berths stay `ALLOTTED`, and the same drift follows.
Correction: allotment path → only `ALLOTTED` units of that allotment. Public path → only `FREE` units. (7) marks units `ALLOTTED` and (6) returns the unreleased, unheld ones to `FREE`, both under the departure lock. Add test "Σ ALLOTTED units = reserved" per departure.

**M-3 — Hold-to-sale guards only the aggregate `held >= n`, and PENDING bookings' holds expire under the sweeper.** §D.1 (3), §D.4, §G.1/§G.2.
(3) never checks that *this* hold is still active. The PENDING rows (`SHOP_CONFIRMS`, `requestFirst`, supplier, where respondBy is hours) have holds that expire at `holdMinutes`. The sweeper releases the seats but only moves `HOLD` bookings to EXPIRED, so the booking stays PENDING. When the supplier later confirms, `held − n` succeeds by consuming **other customers' holds**. Those customers then fail at payment with SOLD_OUT, and "held = Σ ACTIVE holds" breaks.
Correction: every conversion first runs a CAS on the specific hold (`UPDATE "TripHold" … WHERE id=$h AND status='ACTIVE' AND "expiresAt" > $now RETURNING qtyPublic, qtyAllot`) and then changes counters by the returned amounts. PENDING holds get `expiresAt = respondBy` (from a setting), or the sweeper cancels the PENDING booking together with its hold. Pick one source of truth for expiry: `TripHold.expiresAt` or `TripBooking.holdExpiresAt`, not both (D.2 "extend" updates only the hold).

**M-4 — Global `AgentIdentity` can be read and written by any shop.** §B.2, TC3, L-17.
`identity.ts` says "write only through this function" but not *who* may write. `payeeType`, `taxId` and `treaty` drive WHT (§F.1), so shop A editing a shared identity changes shop B's tax treatment. For `kind PERSON`, `taxId` is a Thai national ID held globally and searchable through `@@index([taxId])`: a PDPA problem and an enumeration risk. `Supplier.linkedTenantId` (S1.5 peer link) lets a shop point at any tenant and read its live availability and prices without that tenant's consent.
Correction: only the agency's own `OWNER` `AgentIdentityUser` can write the global identity. Each shop keeps its own tax facts per account (`AgentAccount` + its Party) and WHT uses **the shop's copy**, frozen into the snapshot. There is no cross-tenant search by taxId; the agency is linked by an invite or code the agency issues. Model the peer link as "supplier shop creates an `AgentAccount` for the buyer shop's identity" (consent on the supplier side) and drop the free-form `linkedTenantId`.

**M-5 — Agent authentication and document access are not designed.** L-18, L-19, §J.4, C-7, C-8.
Correction: add «AgentSession» (global: `identityUserId`, `tokenHash`, expiry, revocation) to the A1.1 migration, with its own cookie name, never the `Session`/`__Host-` cookie of `/app`. Say whether an agent login needs a `User` (C-8). If not, the global person row should be «AgentPerson» (LINE/e-mail) rather than `User`. Add an `AGENT` viewer kind, and a "token + OTP" customer viewer, to `api/files/[id]` (a platform change that needs an owner WO) or forbid agents and token customers from opening files. A security review is required before A1.2.

**M-6 — Commission VAT is missing.** §F.1 gross-up formula, the snapshot `commission` object, §I.1.
TRIPS-DEFAULTS A26 says "3% of commission **before VAT**" and A29 says "(+VAT on commission if any)". `AgentCommission.vatSatang` exists, but the snapshot, the remittance formula and the ledger kinds have no VAT. Most Thai juristic agencies are VAT-registered.
Correction: add `commissionVatSatang` and `agencyVatRegistered` to the snapshot and a `COMMISSION_VAT` ledger kind. Remittance = retail − commission − commission VAT + WHT (WHT on the pre-VAT commission). Have an accountant confirm the sign (A29's wording is ambiguous). The README examples assume a non-VAT agency, so the fixture must say so.

**M-7 — Per-currency agency balances contradict the schema.** §H.5 vs §B.2.
H.5 says "`BOOKING` = separate ledger per currency (`AgentBalance` per currency)", but `AgentBalance` has PK `agentAccountId` and `AgentLedgerEntry` has `@@unique([agentAccountId, seq])`. The A22 enum is actually `THB_AT_BOOKING_RATE`/`BOOKING_CURRENCY`.
Correction: PK (agentAccountId, currency), seq per (agent, currency), and lock order by (agentAccountId, currency). Alternatively disable `BOOKING_CURRENCY` in round 1 (needs owner approval: R7 says per-contract choice).

**M-8 — Facade changes are under-listed.** §H, L-10.
Add to L-10:
- POS facade exports for the deposit functions (C-1). This is a POS touch, so ask the owner in the same question as L-9.
- `AccountDocSource` 'TRIPS' (+ 'AGENCY'/'SUPPLIER' if needed) via `ALTER TYPE … ADD VALUE` in its own migration before any client writes it (C-4).
- TRIPS overloads of `recordExternalPayment` and `createExternalCreditNote` (C-3).
- Payer-side `issueWhtCert` on the facade.

Name an owner WO for each.

**M-9 — The F5 budget and the scoped client are misunderstood.** L-16, C-5.
Cross-tenant jobs (`trips.paymentDue`, `autoClose`, `pdpaPurge`, `departureCancelDefault`, `agency.releaseAllotments`, `requestsExpire`, `statements`, `supplier.requestTimeouts`) and lookups before the tenant is known (`/sp/[token]`, agent API key, agent session) need raw `prisma`. Unit-scoped `tenantDb` throws without `unitId` (`db.ts:62-68`), so the agent portal and statements, which span the units of one shop, need either a loop per unit or raw `prisma`.
Correction: one "cross-tenant entry" file per module (`trips/jobs.ts`, `agency/jobs.ts`, `supplier/public.ts`) with a stated F5 increase. Everything else uses `tenantDb`. Fix the L-16 text.

**M-10 — Migration safety gaps.** §B.1, §B.3.
- (a) The ticket backfill runs inside the migration while old code keeps incrementing `TicketType.sold` until the deploy, so the session counters drift. Correction: a post-deploy reconcile under the session lock (recompute `sold` from live orders), plus a test comparing before and after.
- (b) `TripCheckin @@unique([passengerId, result]) WHERE …` written as a Prisma `@@unique` becomes a **full** unique, and the second DUPLICATE scan fails. Write it as SQL only.
- (c) Every "NULLS NOT DISTINCT" unique (TripDeparture, TripPrice, AgentRate, SupplierCost, TicketChannelQuota) must be raw SQL, not `@@unique` (Prisma emits NULLS DISTINCT, so duplicate rows with `optionId` null get through).
- (d) Legacy ticket PENDING orders are counted in `TicketType.sold`. The backfill puts them in `sold`, not `held`; state this, because the §D.3 test otherwise fails on legacy shops.
- (e) Missing index `AgentAllotment(slotId)` (release, departure cancel, recompute of `reserved`). A partial index `TripHold(expiresAt) WHERE status='ACTIVE'` is better for the sweeper across shops.
- (f) `ADD VALUE 'TRIPS'` must not be used in the same migration.

**M-11 — The "agency customers stay out of the shop's marketing" mechanism cannot be built as described.** §J.4.
Under §A.3, member cannot import trips, so "member facade filters by `TripBooking.marketingEligible`" is impossible.
Correction: for `marketingEligible = false` bookings, never create or link a `Member` and never set member marketing consent. Create the `Party` with a source tag through the party facade, and add an X.2 test (Q17/R3).

**M-12 — Refund rules underspecified against mock-up 15.** §G.3, §F.2.
Missing: (i) the cancellation ladder applies to non-pass-through lines only, and pass-through not yet paid out is refunded 100% (mock-up 15: 9,950 × 50% = 4,975 kept; 4,975 + 1,500 = 6,475 refunded); (ii) seats stay held until approval, then are released and offered to the waitlist; (iii) the credit option "+20% of the retained part, valid 12 months" (7,470) cannot be expressed: `refundForm` is a string, and T23 has no bonus or validity field; (iv) the manual-edit cap "over ฿2,000 needs a manager" is a different key from «autoApproveUpTo». (v) L-9(ง): converting a deposit to credit is impossible without a POS change, because POS refuses DEPOSIT on MEMBER bills (`pos/service.ts:358`), yet the T23 default `CUSTOMER_CHOOSES_MONEY_OR_CREDIT` offers credit. Either the default changes or POS is touched: owner.

**M-13 — The opening state per collector × payment method is undefined.** §G.1, §H.2.
A10 (`AGENT_COLLECTS`) × A11 (`PAY_NOW` default) says the agency pays per booking, yet G.1 sends `AGENT_COLLECTS` straight to CONFIRMED with seats sold.
Correction: a 2 × 3 table of initial state, seat state (held/sold), ledger rows and slip ref (`AGENT_CHARGE` per booking vs statement), including which unit's PromptPay receives a statement payment that spans units.

**M-14 — Statement scope (L-11) conflicts with the fixture.** §I.3.
`STATEMENT_ST_PTD_1` (`scripts/trips-fixture.mts:252`) counts "31 confirmed bookings" in 1–15 Nov, and the PTD list includes future travel (LB-7002-0029, February 2027). The default "travelled in period" would not give 86,121.15. Also note that −7,181.50 is the **cancellations** line (`cancelledSatang 718,150`), not a payment as the formula implies.
Correction: the owner or accountant picks the scope. Until then the fixture and the default must agree.

**M-15 — Builders would have to invent these tables or keys** (by work-order group):
- T1.4: assigning bookings to vehicles and ordering pickups.
- T1.10 / S1.4: import batch and undo.
- W1.1 / A1.8: link view counters and the "view → pay" funnel (the fixture has `link30d.views 214`).
- W3.2: custom domain.
- A1.4: "stop sell" per departure × agency × channel (TA §2.3).
- A2.4: agency webhook endpoints and the media library.
- K1.5: signing keys per shop for offline gates, with rotation.
- L1.2: re-pointing existing departures, their units and their capacity when a new deck-plan version takes effect.
- L1.4: single-occupancy supplement and "whole cabin" capacity units (berths, not people).
- C1.1: channel mapping, inbound inbox and OTA settlement (treat the OTA as an `AgentAccount`?).
- K: English names for `TicketEvent`/`TicketType` (they are String, Thai only).
- Basket with 2 units (TRIP unit + TICKET unit, L-6) while `SellCtx` has a single `unitId`.

Add each to its WO brief or to §B.

### MINOR

- **m-1 Enum and name mismatches with TRIPS-DEFAULTS** (that file wins): T17 `NOTIFY_SHOP·AUTO_RELEASE` (contract: `RELEASE`); A14 `BLOCK_NEW·WARN_ONLY` (`WARN/BLOCK`); A5 `SHOP_PRINCIPAL·AGENT_RESELLS` (snapshot `SHOP|AGENT`); T21 keys `EXTERNAL·MIN_NOT_MET·SHOP_FAULT` (contract `SHOP_EXTERNAL·MIN_PAX`); T22 `MOVE_DATE·CREDIT·REFUND_100` (`MOVE·CREDIT·REFUND`); A22 (see M-7). A21 allows `ON_CONFIRM`, but H.3 and I.2.5 hard-code "earned at trip close".
- **m-2** §E.4 key range: "T1–T69 (70)" should be T1–T70. §E.4 cites `trips.license.*` (T56–T57) without T55, and `trips.marine.*` "T59–T60" is correct, but T43 `trips.consumer.withdraw7Days` is never mentioned.
- **m-3** L-3 says "`chainProblem` adds new order rules" while L-30/§E.2 says "no new rule". Delete it from L-3.
- **m-4** The `AgentCommission` status `SETTLING` (I.4) is missing from the B.2 status list, and `AgentCommission` is missing from the §D.5 lock table. Place it between 6 (booking) and 9 (`AgentBalance`), used by close, cancel and the commission run.
- **m-5** Liveaboard cabin blocking (D.2, "TripUnit BLOCKED + capacity − k") must lock the departure first, then the units. The text gives no order.
- **m-6** Share-a-cabin by gender (R6): when assigning, lock **all** `TripUnit` rows of the cabin (sortKey, id), otherwise two concurrent opposite-gender assignments both pass.
- **m-7** G26/A17 hold cap is counted without a serialisation point, so concurrent holds can exceed it by 1. Count it under the `AgentBalance` lock or an advisory lock on (agent), taken at level 1.5 before departures.
- **m-8** The public idempotency namespace `pub:<hash IP+UA>` breaks a retry after the phone changes network, which can create a duplicate booking. Namespace by basket or session token instead.
- **m-9** `requestHash` is declared in the pure `sellable.ts` but needs `node:crypto`. Declare only the type there and implement it in a server file.
- **m-10** `TripsCounter` is a trips table, but ticket (TK) and agency (`ST:`) write to it, which crosses module ownership. Move it to `sellable.prisma` as «SellCounter».
- **m-11** Split payment with more than 3 deposit receipts: without a POS change, issue several close bills per booking (`trips-close-<id>-<k>`, ≤ 3 deposits each) and relax invariant H.6 "≤ 1 close bill".
- **m-12** FX: VAT law converts foreign currency at the tax-point date (each receipt), while the contract locks the booking-day rate (MP 13). Add an accountant label to T4 and «trips.fx.rates».
- **m-13** POS shifts: `pos.shift.required.otherSources` can make the slip consumer fail with `SHIFT_REQUIRED`. State the retry/queue behaviour (hotel has the same issue).
- **m-14** Missing keys beyond the 17: NO_SHOW correction window, public hold cap per contact (G26 public), OTP-verified lifetime, overdue grace, refund manual-edit cap, credit bonus % and validity, `agency.msg.<kind>` and `ticket.msg.<kind>` templates (K13 has only switches), and the retention of booker personal data on EXPIRED/abandoned HOLD bookings (PDPA).
- **m-15** The snapshot lacks per-line `vatSatang`, `agentDiscountSatang` (Q12/A24) and the commission pro-rata rule for partial cancellation. `lines[].costSatang` is added later by S1.1: state that it is optional inside v1.
- **m-16** `/book/[shop]/[product]`: `TripProduct.slug` and ticket event identifiers can collide within one tenant. Prefix them or use a kind segment.

---

## 3. Recomputation of README numbers through the contract's rules

| Example | Result |
|---|---|
| 11,450 = 2 × 3,500 + 2,450 + 500 + park (2 × 600 + 300) | ✅ arithmetic. VAT per line, half-up: 457.94 + 160.28 + 32.71 = 650.93; 9,950 − 650.93 = 9,299.07 ✅. **Cannot be issued** as the mock-up 13 document through any named function (B-1). |
| 7,150 = 8,200 − 15% × 7,000 | ✅ (park excluded from the commission base). |
| 7,181.50 = 8,200 − 1,050 + 31.50 | ✅ ledger arithmetic. Journal entries missing (B-3). Valid only for a non-VAT agency (M-6) and when 1,050 ≥ the A27 threshold (continuous contract = deduct on every payment). |
| 86,121.15 = 101,700 + 11,400 − 15,255 + 457.65 − 7,181.50 − 5,000 | ✅ arithmetic (15,255 = 15%, 457.65 = 3%). Line −7,181.50 = cancellations (fixture), not a payment. Under the proposed L-11 scope the set of bookings differs (M-14). |
| 69,400 / 19,740 / 49,660, due 16 Dec 2026 | ✅ with T14 `TRIP_ONLY`: 30% × 65,800 = 19,740; the balance includes 3,600 park; 14 Feb 2027 − 60 days = 16 Dec 2026. Park falls in instalment 2, which contradicts the §H.1 "first instalment" workaround (B-1). |
| Receipt 9,299.07 + 650.93 + 1,500 | ❌ not reproducible without a POS change or a new account function (B-1). |
| Refund 6,475 / 4,975 | ✅ only if the ladder base excludes pass-through and pass-through is refunded in full (mock-up 15). The contract does not say so (M-12). POS mechanics: a fee bill of 4,975 paid from the deposit plus `moduleRefundDeposit` of 4,975 works. The refund of the 1,500 park fee has no named function (B-1). |

---

## 4. Owner rulings — compliance

- SHARK never holds money: ✅ (wallet = ledger, receivers belong to the shop).
- Validators OK/WARN only: ⚠ the engine can still BLOCK (C-12). Commercial blocks (A14, `BELOW_MIN_SELL_PRICE`) are allowed per TRIPS-DEFAULTS. ✅
- Everything adjustable: ⚠ m-14 keys missing. L-22 floors are acceptable (security), but tell the owner.
- Agency customers outside marketing: ⚠ mechanism broken (M-11).
- Phase 2: ✅ nothing built (no sub-agents, no seat maps, no network, no zh). The platform-level identity is present but needs M-4.
- Multi-currency and split payment only for Liveaboard: ✅ (CHECK + T18 VALIDATION).
- One public route: ✅ `/book/[shop]` (L-1).
- TH + EN: ✅ trips. ⚠ ticket names (M-15).

## 5. Tenant isolation and privacy (summary)

Token hashing, tenant binding through `[shop]`, `checkRateLimitDb`, event payloads with no personal data, medical forms hidden from agencies by default, and the private storage plus view log are all sound.

Gaps:
- M-4: global identity writes, national ID stored globally, peer link without consent.
- M-5: agent sessions and file viewers.
- m-14: personal data kept on abandoned HOLD bookings.
- Agency webhooks must also exclude events of other agencies' bookings on shared departures. `trips.departure.*` carries no `agentAccountId`, so it is correctly excluded; keep it that way.

---

## 6. Section L — position on each item

| # | Position | Reason |
|---|---|---|
| L-1 | Agree (owner confirms the URL, OQ8) | `/b` is CRM and fitness-bound. `/book`, `/agent` and `/sp` are free. |
| L-2 | Agree + amend | Also require WARN, never BLOCK, on invalid or unknown tour input, and widen the `LegalRuleId` union (C-12). |
| L-3 | Agree, fix text | Contradicts L-30 (m-3). |
| L-4 | Agree | — |
| L-5 | Agree | Optionally put a settings version in the quote fingerprint. |
| L-6 | Agree | The value cannot be used in the same migration. |
| L-7 | Agree | — |
| L-8 | Agree (a list of refTypes) | The map is in `slip-shared.ts:76`. Define the receiving unit for statement payments. |
| **L-9** | **Disagree with the workaround** | (a) is impossible: POS VAT is per system and books revenue, not a liability (B-1). (b) Use several close bills (m-11). (c) The fee-bill route is fine. (d) Impossible without POS, and conflicts with the T23 default. Ask the owner with these facts, plus the facade exports (C-1). |
| **L-10** | Agree + extend | Add `AccountDocSource`, TRIPS overloads of payment and credit note, netted commission expense and WHT payable, the payer-side 50 ทวิ, and revenue at close for AGENT collect (B-3, M-8). |
| **L-11** | Needs owner/accountant | The proposed default changes which bookings the approved mock-up and fixture statement contain (M-14). Whatever the scope, revenue for AGENT collect must be recognised at trip close (B-3), not when the invoice is issued. |
| L-12 | Agree | Plus a post-deploy reconcile (M-10a). |
| **L-13** | Agree with option 1 (code `TK-YYMM-NNNN`, admission codes unchanged) | Matches the mock-up. `checkIn` matches admissions only. Low risk. |
| L-14 | Agree | — |
| L-15 | Agree | — |
| L-16 | Disagree | Wrong metric (C-5, C-6, M-9). |
| L-17 | Agree | Plus the rule that peer links run through an `AgentAccount` (M-4). |
| **L-18** | Disagree as written | No session table, `User.email` is required, no file-viewer kind (M-5). Needs a separate «AgentSession» and a security review. |
| **L-19** | Agree (do not reuse the CRM portal) | F2.3/F2.4 bind `src/app/b`. Borrowing only the OTP is fine. |
| L-20 | Agree | — |
| L-21 | Agree + fix | M-2. |
| L-22 | Agree | Inform the owner that the floors are not adjustable below the minimum. |
| L-23 | Needs accountant (label) | — |
| **L-24** | Agree with conditions | A single expiry source, PENDING hold expiry (M-3), HOLD rows excluded from the "sold" test, and retention of booker personal data on EXPIRED rows (m-14). |
| L-25 | Agree (prefer an S1.1 migration of its own) | Keeps A1.1 smaller. Either is fine. |
| L-26 | Agree | — |
| L-27 | Agree | — |
| L-28 | Agree (reject) | — |
| L-29 | Agree | — |
| L-30 | Agree | — |
| L-31 | Agree | — |
| L-32 | Agree | — |
| L-33 | Agree | — |
| L-34 | Agree | Note that legacy PENDING orders count as sold (M-10d). |
| **L-35** | Needs owner | The owner-approved TA §1 and §4.3 say `HotelFolio`. It cannot be used as-is (required unique FK). (a) «TripFolio» with the same shape contradicts the approved text. (b) A nullable FK touches hotel and changes hotel types. Recommend (a) with the same UI and POS settlement, and the owner approves the deviation (OQ11). |
| L-36 | Agree | — |
| L-37 | Agree | — |
| L-38 | Agree | — |
| L-39 | Agree | — |
| L-40 | Agree | Facade `*InTx` names must also respect B-2 phase ordering. |
| L-41 | Agree + extend | m-14 keys. |
| L-42 | Partly wrong | T70 `trips.msg.<kind>` already exists (C-9). Keep the T69 name and reserve the kind "enabled" (`notifyCustomer` already rejects a non-template def), or rename it. Owner-neutral. Add `agency.msg.*` and `ticket.msg.*` templates. |
| L-43 | Agree | — |
| L-44 | Agree | — |
| L-45 | Agree | — |
| L-46 | Agree | Plus M-10a. |
| L-47 | Agree | — |
| L-48 | Agree | — |
| L-49 | Agree | — |

---

## 7. Verdict: **FIX FIRST**

Fix B-1, B-2, B-3 and M-1 to M-14 in the contract before T0.1 starts. M-15 can be filled in per WO brief, and the MINORs can be handled when each WO is written.

**Only the owner can decide:**
1. POS changes (L-9 restated): per-line tax or pass-through on deposit and sale, plus deposit functions on the POS facade (C-1). Without this, the alternative is park fees through a new account V2 function as separate documents, so mock-up 13 becomes two documents.
2. Converting a deposit to store credit needs POS, or the T23 default changes to `MONEY` (M-12 v).
3. L-35: TripFolio vs changing `HotelFolio` (deviation from the approved design).
4. L-11 / M-14: what the agency statement contains (booked vs travelled) — with the accountant.
5. The sign and base of commission VAT in the netted remittance (M-6) — with the accountant.
6. R7 `BOOKING_CURRENCY` commission in round 1, or deferred (M-7).
7. URL `/book/<shop>` and `/agent/<shop>` (L-1/OQ8, cosmetic).
8. Whether an agent login must be a platform `User` (LINE-only agents) — M-5 / Q7 interpretation.
