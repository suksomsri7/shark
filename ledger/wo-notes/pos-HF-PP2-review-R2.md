# HF-PP2 R2 (fix round 1) — p11 @ 94d31026 (code 448c632c · oracle 4fadbbae) — read-only
**Verdict: MERGEABLE.** The fix closes R1 F1. There are no new blocking findings.
**(1) Code — OK.** `order.ts:37` imports `PAYMENT_INTENT_CONSUME_WINDOW_MS` from `payment-intent-shared`, the same constant the register's consume uses (`payment-intent.ts:542`, `> window` ⇒ INTENT_EXPIRED); `order.ts:1115` uses `paidAt >= now − window`, so the boundary matches.
- `:1113` `allPi`; `:1114` tenant-scoped `posPayment.count({tenantId, reference in piIds}) > 0` ⇒ `used` ⇒ `pis = []` ⇒ not exempt ⇒ settings read ⇒ PERMISSION_DENIED. All inside the marked block (:1107-1119), before `mutate` (:1120); the comment at :1108 is updated.
- The new reads run only when `allPi` holds (short-circuited for CASH/TRANSFER, manager actors and non-`pi_` manual rows), so the common path is unchanged.
**(2) Oracle — OK.** New orders o5 and o6 (`qc-pos-p2.8.mts:1895-1896`, separate orders); `piOld` gets `paidAt` −25 h at :1901 (`MIN = 60_000`, :978).
- Loop at :1930-1940: o5 reuses o3's `piOk` (already on o3's PosPayment after :1928), o6 uses `piOld`. Each asserts `denied` (exact code and message), ACCEPTED/UNPAID/no sale/same version, and PosSale, PosPayment and that order's PosOrderEvent each +0. It runs with the setting on, after the o3 positive control and before the setting-off control.
- Count is still 61 D-rows (only the P10 text was extended). `HF-PP2-red2.txt:54,82-83` is 59/61, with P10 red on both new cases (o5 and o6 → OK/PAID, rows +1) plus the expected ST6 PAR.
**(3) Scope — OK.** `3de290df..94d31026` changes only `order.ts` (+5/−3, marked block and import), `qc-pos-p2.8.mts` (P10 and header comments) and ledger notes/red2.
**Notes (non-blocking):**
- N1: `PosPayment` has no index on `(tenantId, reference)` (only `saleId`), so the :1114 count is a scan. It runs only on the crafted all-`pi_` path, so this is acceptable; add an index if `pi_` order pay is ever wired into the UI.
- N2: two concurrent `payOrder` calls with the same `pi_` can both pass the check (no FOR UPDATE or consume). This is the existing follow-up (b): `payOrder` should claim intents if wired.
- N3: the o5/o6 checks don't re-check outbox counts (the R1 cases did). Minor, because the event counts cover the write path.
