# P1.3 — hunter, code-reading pass (read-only · no DB · cloud run · 3 Oct 2026)

You did NOT build or review this. Tree `/home/user/shark-p13-rev` (detached 5f97add4). Scope: P1.3 server side + the client money path — `src/lib/modules/pos/{register.ts (exports after ~:396), register-shared.ts, pricing-shared.ts, register-actions.ts}`, `pos/service.ts` (B1 hunk: `productId`), `member/wallet.ts` `automaticDiscountForSale`, `src/components/pos/register/**` (submit/idempotency/quote paths only), `src/app/app/sys/[id]/pos/register/page.tsx`, shell hunks (`layout.tsx`, `NavRail`/`AppShell`/`AppMain`).
Context: `ledger/pos-briefs/pos-brief-P1.3.md` (rulings + addenda), POS-RESUME §0.8 tail "P1.3 B1 — ผู้ตรวจ+ล่าเงิน" (findings already fixed in B1.1 — do not re-report unless the fix is incomplete). DB oracle results (VPS run 1): qc-pos-p1.3 forced 120/121 (only S6.1 = P1.6), all money regressions green.

Rules: read-only — no edits/commits/installs/build, no DB (unreachable; never try). Report in English.

## Hunt (attacker + race mindset; each finding must have a concrete exploit/failure path through real code)
1. **Money**: any input (client-forged action payload: negative/huge/float qty, duplicate productIds, open-price lines, discount AMOUNT/PERCENT edge, 0-baht bill, payMethods shapes, expectedGrandTotal games) that makes the stored sale differ from what the server priced, Σpay ≠ total, or exceeds the discount cap; Int32 overflow; rounding drift between `priceCart` and `createSale`.
2. **Idempotency**: key reuse across units/systems/tenants; same key different cart; retry after VOID; key length/charset; race between quote and submit; P2002 handling leaking another tenant's bill info.
3. **Authz / isolation**: every exported action — unit scope (`units` of membership), system↔unit pairing, cross-tenant product/member ids, flag-off tenant calling V2 actions directly (actions must refuse or be harmless when flag is off? decide from rulings), cashier price override permission, `pos.*` wildcard.
4. **Info leaks**: refusal payloads (ids, names, receipt numbers of other units), error messages with internals.
5. **Client**: double submit, stale quote applied, beforeunload/key rotation paths that could sell twice or lose a sale.
For each item you could not prove without a DB, write a precise DB probe recipe (steps + expected vs. suspected result) so the controller can script it on the VPS.

## Report (≤60 lines)
Findings CRITICAL / MAJOR / MINOR / NOTE with file:line + exploit path + suggested fix · list of DB probe recipes · verdict: ship-blocking issues yes/no.
