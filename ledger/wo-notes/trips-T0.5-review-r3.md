# T0.5 r3 re-check — wip/trips-t0.5 @ dc43fac2e (T0.5 diff 41468fa5a..HEAD)

Read-only review. I did not build, run tests or touch the database.

**Verdict: MERGE.** Every r2 finding is closed. I found no new BLOCKER or MAJOR. The notes below are for the T0.6 brief, plus one ruling.

## Claims checked

**N1 — closed.**
- Instalment rows carry `dueAtBooking`: `true` on the deposit row and on the single-balance row, `false` on the later balance row.
- The v3 fingerprint drops `now`. It writes `"AT_BOOKING"` for the booking-time rows and keeps the absolute due date for the later balance, which is derived from the travel date and therefore stable.
- `buildTripBookingSnapshot(ctx, line, {quotedFingerprint, policyAt?} | PricedQuote, opts)`:
  - re-prices at the booking clock with one `snapshotPolicy` read;
  - compares sha256 against `TripQuoteLine.fingerprint`, which is the same `sha(priceFingerprint)`;
  - writes the snapshot from the **fresh** result only;
  - records `quote {fingerprint, policyAt}`;
  - has an "outside the caller's tx" note in the JSDoc.

**Clock independence of the hash:**

| Field | In the hash? | Effect |
|---|---|---|
| hold expiry | no | — |
| FX date (`effectiveFrom`) | no; only the FX rate is hashed | — |
| `policyAt` | no; recorded only, never used for pricing | — |
| warnings and trace | no | — |
| `sold`/`held` (changed by the booking's own hold) | no | — |
| season boundaries | — | Seasons key on the **travel** date, so crossing midnight changes nothing. |

These change the hash **legitimately**:
- EARLY_BIRD days-ahead crossing a threshold;
- price/rule booking windows (`bookFrom`/`bookTo`);
- promo `validTo`;
- the balance due date reaching "today", which collapses the plan to one instalment;
- the LAST_MINUTE hour threshold, which can fire within minutes, including when the new price is *lower*;
- the FX rate or any price/settings change;
- the provider's `evaluate` result.

None of these are spurious.

**Can a caller defeat the guard?**
- A fingerprint taken from another line, product, departure, pax mix, actor or channel cannot match the fresh hash, so the call fails closed with PRICE_CHANGED.
- A caller can make the guard a no-op by passing a freshly computed PricedQuote (the compatibility path), or a hash it just computed. Even then it cannot inject a price, because the snapshot always comes from `fresh`.
- So the guard protects the customer against silent change, not against T0.6 itself. That is acceptable.

**N2 — closed.**
- A unit-level THB extra on a foreign-currency quote is converted once (`thbUnitSatang`, trace `FX_FROM_THB`). It is excluded from the agent discount, and its minor-unit amount is included in the instalment `amountMinor`.
- A unit-level extra in another currency is skipped with an `EXTRA_CURRENCY_SKIPPED` HIGH warning. A mismatched *product* extra is still rejected.
- The loader drops a unit-level extra when the product has an active extra of the same `kind`. One consequence: a product extra that is optional suppresses a mandatory unit extra of the same kind. That follows the ruling.

**Minors — all closed.**
- An override of a THB-origin line clears `thbUnitSatang`, so `amountMinor` and `amountSatang` move together.
- `logOps` is removed, so the quote path no longer writes to the database.
- Total gross, VAT and the per-line `thbUnitSatang×qty` are capped at int4.
- `redeemPromosInTx` sorts by `ruleId`, rejects duplicate rules, and any failure throws so the caller rolls back.

**Post-merge.**
- `departures-core.ts` imports only `json-schemas` and a *type* from `core/sellable`. It has no prisma, no settings, and no `new Date()`/`Date.now`. `pricing-core.ts` and `snapshot.ts` stay pure.
- `tripTzValid` uses `normalizeTimezone(tz) === tz.trim()`. An unknown zone falls back silently, so the comparison catches it and the result is SETTINGS_INVALID. The loader trims the zone first.
- The seed finds the 31 Dec departure with `listDepartures`, or else creates it with T0.3's `createDeparture`. The direct-row fallback is gone.

**Hand arithmetic.** No money path changed except the extras and pickup FX branch. The r2 figures still hold:
- Racha 11,450 (9,299.07 / 650.93 / 1,500);
- agent-collects remit to shop: 7,150 / 7,181.50 / 7,108.00 / 7,179.44;
- shop-collects pay-to-agent: 1,018.50 / 1,092.00 / 1,020.56;
- liveaboard instalments 19,740 / 49,660;
- mock 15: 6,475 / 4,975 / 325.47;
- ALL_LINES cancellation: refund 1,080, keep 19,740.

## Open items (not merge-blocking)

1. **Approval `resolvedMinor` is optional (r1 B19).** Acceptable for merge, with a ruling: T0.6 must always put `resolvedMinor` (taken from the REQUIRES_APPROVAL details) on every approval it passes. Without it, an approval for 3,000 granted when the resolved price was 3,200 still validates after the resolved price rises to 5,000 (40% below). T0.6 enforces this; make the field required in T0.5 when the oracle check can change.
2. **For the T0.6 brief: the fingerprint binds the whole request context.** That covers `ctx.actor`, `ctx.channel`, the agent, and `opts` (`agentDiscountSatang`, `linkId`, `partyId` for providers, overrides). The booking call must reproduce them exactly. Example: quote as PUBLIC on the web, then confirm as SYSTEM after payment, and the result is always PRICE_CHANGED. Also, T0.6 checks `now ≤ quote.expiresAt` itself and decides how to handle PRICE_CHANGED (re-quote) and PROMO_* at redeem (abort or re-quote without the code).
3. **Lock order** is now documented in the `promo.ts` JSDoc: product → departure → booking → promo rules by `ruleId` → redemptions → provider `redeemInTx`.
4. **`contactKey`** guidance is documented: partyId, otherwise E.164 phone, otherwise lowercase email. T0.6 must pick one rule and use it on every channel.
