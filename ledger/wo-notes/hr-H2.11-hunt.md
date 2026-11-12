# H2.11 hunt: inbox authorisation, batches, caps (wip/hr-h2.11 @ 46ecf8387 · lane DB wo-hr-qc-l2)

Two probes made real calls on the lane DB. They built their own tenants: 10 item sets per actor. Each set has every type in u1 and u2, own items, items filed on behalf, a chain leave, a decided leave, a paid-month correction and a stock charge, all created through each type's own request function. They also added cap fixtures as direct rows. Totals: **61 checks · 57 PASS · 4 FAIL** (one real bug, one defence-in-depth gap, one minor input gap, one finding that the code is correct and my check was wrong).

## FAIL
**F1 · MAJOR · OT branch cap: a manager loses their own branch's pending OT with no warning.** Setup: 3 PENDING OT in u1 (made with `requestOt`) plus 520 PENDING OT in u2 with later dates. MGR1[u1] calls `listInbox(type OT)`: got **OT = 0 (0/3 of own branch), truncated = []**. `otRequestList(MGR1)` directly also returns 0. OWNER gets 500 with truncated = [OT]. Cause: `ot.ts otRequestList` takes 500 rows ordered `date desc` across the whole system, then filters by branch. The inbox computes `truncated` from the list after filtering (`O.length >= 500`), so a branch manager is never warned. Both the inbox counts and the badge show 0. This is not a widening, but pending work disappears silently. `listCorrections` has the same pattern (`take max*2`, then branch filter, then slice), not exercised here because of its 5-pending-per-employee limit. Fix direction (needs ruling, `ot.ts` is frozen): branch filter in the query, or flag OT as truncated whenever the raw query hit `LIST_TAKE`.

**F2 · MINOR (defence in depth) · OT_REQUEST adjustment rows can be decided here.** Test: a crafted PENDING `HrPayAdjustment` with sourceType `OT_REQUEST` (artificial: H2.9 always writes these rows as APPROVED). It is correctly not listed. But OWNER's single `decideInbox({type: ADJUSTMENT})` → **APPROVED**. `decideAdjustmentAs` → `decideAdjustment` has no `sourceType === "OT_REQUEST"` refusal, unlike `cancelAdjustment` and `moveStrandedAdjustment`, which return `OT_TEXT.otRow`. The existing `decideAdjustmentAction` behaves the same, so this is not an inbox widening. Unreachable today. The suggested fix is a one-line refusal in `decideAdjustmentAs`.

**F3 · MINOR · a reject reason made only of zero-width spaces is accepted.** `reason: "​​​"` passes the 3–200 check because `str()` only trims whitespace, and the leave was REJECTED. Other bad inputs were refused: undefined, "", spaces, "ab", " ab ", 201 chars, number, array, tabs/newlines. The reason only goes to the audit log (Q6), so the impact is an empty audit reason.

**Not a bug, recorded for completeness (D2):** a paid-month correction (CP). The inbox got `decideCorrection`'s own paid-month text and the item became CANCELLED. My follow-up call to the type function then saw "already decided". The cancellation is the type's own designed effect, and the text came straight through.

## PASS (got = wanted)
- **Visibility diff** (OWNER MGR1 MGR2 KEYC KEYP PAYV PAYA): the inbox ⊆ each type's own lister, with 0 extra ids. Missing-from-inbox is exactly what should be hidden: own items (MGR1: CM LM OM · KEYC: CK SK · KEYP: OP).
- **DTO scan:** no segments, paidMin, user ids, emails, linkedUserId, requestedBy/filedBy or salary for anyone. Non-payroll viewers get no ADJUSTMENT and no `amountSatang`. No other-tenant ids. u1 viewers get no u2 ids or names. Leave reason appears iff `leaveDetail` gives it. Swap reason and `to` match `listSwapsForManager`. Correction evidence and reason match `listCorrections`. Consent only on STOCK.
- **Counts:** match list lengths for every actor. `inboxCounts` = `listInbox.counts`. `unitId=u2` for u1 viewers gives 0/0.
- **Actors that must get nothing:** STAFF, ENDED, MEMBER, kiosk get null list, counts and quota. XOWNER sees no T1 ids; XOWNER deciding 19 CONF items through its own ctx changed nothing; OWNER and MGR1 deciding the other tenant's leave are refused.
- **Quota table** has the same gate as `leaveBalances` (null for PAYV, KEYC, KEYP, PAYA). MGR1 sees u1 rows only, and `unitId=u2` gives []. **Overview:** no money, no u2 data for u1 viewers.
- **Decide matrix:** approvals equal the type rules exactly for every actor:
  - OWNER: 22/22
  - MGR1: L1 LF O1 OF OP
  - MGR2: L2 O2
  - KEYC: S1 C1 CM. A MANAGER cannot decide a correction, and KEYC's own items and items it filed are refused.
  - KEYP: O1 OM. Its filed OF is refused (four-eyes) and its own OP is refused.
  - PAYA: OT plus A1 A2 AP AS. Its filed AF is refused.
  - PAYV: none.

  Every inbox refusal matched the type function's text, with no DB change. Nothing was ever approved by the inbox that the type would refuse. Decision audit is ≤ 1 per item.
- **Type confusion:** all 20 cross pairings produced 0 ok and no change. Arrays or objects as ids, unknown or lowercase type, a SQL-looking id, a bad decision, or a short/object key → badItem or key. Empty or non-array → empty. 51 or 100 items → tooMany. 60 duplicates → de-duplicated to one item. An ADJUSTMENT in a batch → oneByOne. A stock charge decided by MGR1 or KEYP → noRight.
- **Batch:** MGR1 batch (20 mixed items) = MGR1 singles. Items after refused ones are still processed.
- **Double submit and races:**
  - Same-key double submit in parallel: one run, the other gets inProgress, and a resubmit replays. Another user with the same key, or the same key with REJECTED → batchDiff. 1 OT audit, 1 USE row.
  - OWNER approve ∥ MGR1 approve ∥ MGR1 reject on 5 overlapping items: each item decided ≤ once. Losers got the type's "already decided" / stale texts.
- **Leave cap:** 501 pending leaves gives OWNER LEAVE = 500 with truncated [LEAVE]. **Query count:** 38 / 38 / 38 at 4, 40 and 200 items.

## Not tested
`decideInboxAction` itself: it needs a Next request for `requireTenant`. By reading the code, the systemId is checked to be an HR system of the session tenant. Also not tested: the correction 1000-row cap (same pattern as F1), and any UI.

Residue: none in both runs (RESIDUE none). The seeded tenant was not touched, so no re-seed was needed. Probe scripts `scripts/zz-hunt-h211-{main,cap}.mts` are deleted; this note is the only new file.
