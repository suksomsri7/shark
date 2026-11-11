# P1.18 S re-check, fix rounds 1+2: wip/pos-p1.18 @b1717d7c (prev ffea3435) · reviewer (read-only)

**VERDICT: MERGEABLE.** F1–F10 are closed as ruled and both ORACLE-EDITs are acceptable. Nothing below blocks the merge. R1–R3 are follow-ups and R4–R5 are notes for the module owners.

## Findings (none blocking)
- **R1 LOW-MED (F2 latency, follow-up):** the advisory lock is held for the whole tx (`staff-pin.ts:356-379`, lock `:359`). Inside it, the anonymous loop runs async scrypt over **every** PIN row of the unit (`:248-257`) and keeps one pooled connection.
  - Cost: about 30–60 ms × rows per wrong PIN, serialised per unit. Waiters also hold a pool connection for up to `timeout 20s` (`:379`), and there is no `lock_timeout`.
  - A burst at one unit can therefore starve that instance's Prisma pool. Other tenants feel it through the pool, not through the lock.
  - It is bounded: only the first 30 failures per 15 minutes pay for scrypt. After the cap, the throttled path is lock + one count with no scrypt (`:362`). A timeout is fail-closed and returns INTERNAL via `guard` (`:69-75`).
  - Acceptable for P1. Hardening: `set_config('lock_timeout','3s',true)` first, or reserve-then-verify (under the lock only count + insert a provisional fail row, then commit, verify outside, and delete the row on success).
- **R2 INFO (F2 ceiling, owner):** `STAFF_PIN_RE` allows 4 digits (`register-shared.ts:58`). With N_U = 30 per 15 minutes, an attacker gets about 2,880 anonymous guesses per unit per day. With around 10 four-digit PINs that is an expected hit within hours.
  - The constant is the controller's ruling. Suggest a daily unit cap or an owner alert on `PIN_THROTTLED`, or ≥6 digits for MANAGER PINs.
- **R3 LOW (F8 perf, follow-up):** the CHAT `lastActivityAt` raw query (`pos-integrations.ts:196-201`) has no `createdAt` bound. For a POS that never sent a LINE receipt it walks the tenant's whole AuditLog backwards via `(tenantId, createdAt)`. Fix: add `createdAt >= now()-90d`.
- **R4 INFO (K4, approval owner):** the guard also refuses self-**REJECT** (`approval/service.ts:252-259`). In a multi-owner tenant, the requester cannot reject or withdraw their own request this way. This is the K4 semantics as before.
- **R5 INFO (member):** `qc-member-m1.7` S6.2/S6.3 (`:185,:197`) go green only if the member QC tenant has **exactly one** accepted OWNER. That has not been verified, because the suite fails at setup (`actorOf` `:56-58`, same as m2.7/m2.8). The member session must confirm this after fixing the seed and expected file.

## Verified OK
1. **F2/K1:**
   - `STAFF_PIN_UNIT_THROTTLE_AFTER = 30` is exported (`register-shared.ts:67`).
   - The bucket is the device's own code only for a registered, non-REVOKED PosDevice of this unit and tenant. Every other code goes to `"unregistered"` (`staff-pin.ts:339-342`). A registered device keeps its own cap of 10.
   - One `$transaction`: `pg_advisory_xact_lock(hashtext('pos.staff.pin:'||tenant||':'||unit))` (`:359`), then a single count query for unit and bucket (`:344-350`), then verify through `tx` (`:363`), then the fail row inserted through `tx.auditLog.create` in the same tx (`:366`). The real code is kept as `deviceCode`. A row insert failure now rolls back, which is fail-closed.
   - The key is per tenant+unit, so unrelated units and tenants are not serialised (only 32-bit hash collisions could). Named attempts bypass the gate (`:408`).
   - The window is bounded by tenantId + action + createdAt ≥ 15 min (index `(tenantId, createdAt)`).
   - K1b rewording: **ACCEPT**. With the bucket, the sketched "30 unregistered codes" run is throttled at the 11th attempt and would never test the cap. K1b (3 registered × 9 + 3 unregistered, 31st on a registered device with no failures; U1 unaffected) isolates the unit cap, and K1c covers rotating codes.
   - Red-before is real: `k1-red-before.log`, head 50b53285, 77/79, failed K1b+K1c. Green-after: 79/79.
2. **F3/K4 round 2:**
   - `soleOwner = m.role==="OWNER" && membership.count({tenantId: ctx.tenantId, role:"OWNER", acceptedAt:{not:null}}) === 1`. It is a live query with no cache, run only on the requester = approver path (`service.ts:252-259`). It uses the same filter idiom as `crm/commissions.ts:1827` and `limits.ts:211`.
   - MANAGER/STAFF requester = approver still gets `SELF_APPROVAL`. The `crm.commission` set is unchanged (`:224`). `bulkDecide` (`:349`) goes through `decide` (`:359`).
   - **Status filter = role OWNER + `acceptedAt IS NOT NULL` only.** Membership has no status or suspension column (`core.prisma` Membership), so no "suspended owner" state exists.
   - A pending co-owner invite does not count until it is accepted. Demoting or removing the other owner makes the remaining owner the sole owner, which is intended.
   - The count is outside the decision tx. The TOCTOU window is negligible.
   - Round 2 is strictly looser than round 1 (green suites stay green) and stricter than ffea3435 only for multi-owner tenants.
   - K4b: both halves pass, and bulkDecide reports done 0 / failed 1. The control (second owner decides) passes.
3. **F1:** `page.tsx:43-46` checks `evaluate(pos.device.manage)` at shop level before `canManageAllLinkedUnits`. This is identical to the writer (`receipt-settings.ts:89-90`). `promptpayId` is unmasked only when `canEditReceipt`, so a `["*"]` cashier sees it masked. ST11's regex intent is kept.
4. **F4:** passthrough (`settings-actions.ts:107-111`). The writer returns VALIDATION for undefined, numbers and objects, and only an explicit `null` removes (`payment-settings.ts:283-284`).
   - **F5:** `maskAuditPhones` is pure: it takes the mask as a parameter and does not import prisma (`settings-shared.ts:103-111`). The receipt diff masks both `before` and `after` (`receipt-settings.ts:120`). `summaryOf` masks old rows on read (`settings-general.ts:399`). `before` is never returned.
5. **F7:**
   - Card: LINKED if any link is active, with `linkCount` when there is more than one link (`pos-integrations.ts:165-173`).
   - Toggle: `FOR UPDATE` over every link (`:255-258`). If all links are already in the requested state, it returns SAME with no audit. Otherwise each link goes through `setPosLinkEnabled(…, tx)` in one tx (`:262`), and the audit lists `accountSystemIds` when there is more than one.
   - `connections.ts:210-255`: with no `tx`, `linkDbOf` = `dbOf(ctx)` and `ownScope` = `{}`, so behaviour is identical to before. With `tx`, it adds explicit tenantId + systemId to the where clause and the data.
6. **F8:** scoped through `JOIN PosSale … s.systemId` and `targetType 'PosSale'`, which matches the writer (`receipt-send.ts:142-145`).
   - **F9:** fallback requires `status:"HELD"` and `createdAt ≥ expireCutoff`, otherwise `NOT_FOUND` (`held-cart.ts:165-170`), the same cutoff that recall uses (`:260-261`).
   - **F10:** the HR heading and NM-2 line are present in `POS-OWNER-PENDING.md`.
7. **ORACLE-EDITs:**
   - 50b53285 (K1b/K1c) and 53aa6428 (K4b) are their own `test(...)` commits. The count goes 77 → 79 → 80. `pos-P1.18-oracle.md` records both; the K4b record is in c4ab8edd.
   - Fixtures are only in temp tenant T: devices on T/U2, owner2 user with `EMAIL_PREFIX`, membership deleted afterwards. Z1/Z2 are green with residue 0.
8. **Gates:** all logs are headed `tree=/root/projects/shark-pos-c`.
   - Round 1 (head 447dacd2, all round-1 code): p1.18 79/79 ×3, crm-c3.3 90, approval 16, edit 12, wiring 7, bulk 13, page-authz 56, account 16, cpa 107, p1.10 40, fitness 41/41 ×2, fitness-pos 8/8, typecheck 0.
   - Round 1 drift: p1.15 38/39, p1.3 125/128, p1.7 31/32, then the rerun gave 39, 128 and 32.
   - Round 2 (c4ab8edd; b1717d7c is ledger-only): p1.18 80/80 ×3 with residue 0 and fpDrift none, crm-c3.3 90/90, approval 16, edit 12, wiring 7, bulk 13, page-authz 56, fitness ×2, fitness-pos, typecheck 0. m1.7 shows 0/1 M1.7-ERR at setup ×2, as noted.

## Follow-ups
- **P1.18U / hardening:** R1 (lock_timeout or reserve-then-verify), R3 (time bound), plus the existing items: posTabs `t`, `posBusinessToday`, branch PromptPay static QR (F6), `pinThrottled` UI, sent-receipt locale.
- **Owners:**
  - Approval: R4 and the O16(c) choice.
  - Member: R5, reseed and confirm S6.2/S6.3.
  - Controller: R2 PIN length / cap.
  - Account: multi-link POS question (F7).
  - HR: NM-2 rerun.
  - F11 history scoping.

---
**Controller rulings (account A, 9 Oct 19:2xZ):** MERGEABLE accepted → merged `--no-ff` into `session/pos`. R1 (`lock_timeout` 3 s inside the K1 tx) + R3 (CHAT lastActivity `createdAt ≥ now()-90d`) → P1.18U ruling 10 as ≤20-line server hunks. R2 (4-digit PIN × 30/15 min per unit) → `POS-OWNER-PENDING.md` for the owner (daily cap / alert / 6-digit MANAGER PIN). R4 → approval owner (with O16(c)). R5 → member owner after the seed fix. F11 history scoping → P1.18U follow-up list.
