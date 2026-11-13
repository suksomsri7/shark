# A1.1 — independent design review of the agency/supplier schema (before build)

Reviewer: independent, read-only (no tsx/DB/build). Tree `/root/projects/shark-trips-l2` @ `6b116d048` (`wip/trips-a1.1`).
Read: brief `ledger/trips-briefs/A1.1.md` (all 314 lines), WRITER-REPORT, oracle `scripts/qc-trips-a1.1.mts` (M/T/C/U/L/S/X1/AI/R sections in full, others by title), CC §0 §A §B §D §H.3–H.8 §I §J, MP §3–§4 (lane order), TD §2 + appendix, mock-ups 04/05/10 (body.html; 10 PNG opened), `trips.prisma`, `sellable.prisma`, `customer-session.prisma`, `api.prisma`, `webhook.prisma`, `crm.prisma` portal tables, `core.prisma` Session/AuthToken/Tenant, `core/db.ts` (tenantDb), `platform/pdpa.ts`, `core/integrations/secret-box.ts`, `core/signed-link.ts`, `env.ts`, `trips/pricing-core.ts` (agency input), `trips/pickup-core.ts`, wo-notes T0.1/T0.4/T0.5/T0.6, T0.7 brief (`wip/trips-t0.7`), `session/hr` migration list.

## Verdict: **REVISE FIRST**

The bulk of the design is sound: global tables stay free of PII, the scope split is right, CHECK coverage is thorough, the append-only trigger logic is correct for what it tries to do, and all additive columns are safe for the T0.7/T0.8 lanes. But A1.1 is the only migration until L1.1 for A1.2–A2.5 and S1.1–S1.3. Several gaps would force a migration there, and two trigger/unique decisions would block real operations for good:

1. The trigger blocks the platform's tenant deletion (`platform/pdpa.ts`). Tenants that have ledger rows can never be purged, and nothing reports it.
2. A voided statement can never be regenerated. Its ledger rows stay bound to it forever, and `@@unique([agentAccountId, periodKey])` blocks a new statement for the same period.
3. The statement's ≥ 0 CHECKs and total CHECK reject data the contract itself produces: a positive CANCELLATION, COMMISSION_CLAWBACK, REFUND_TO_AGENT, and the commission-payout kinds of a mixed-mode agent.
4. Missing pieces for A1.5–A1.7/A2.4 that can't be added without a migration: a unit/book dimension on ledger rows, payment-to-statement allocation, a per-agent commission payout record, clawback representation, and an agent webhook delivery log.

None of this is large. Most fixes are one column, one CHECK or one small table.

---

## Required schema changes (ranked)

### R1 — Ledger trigger must not block platform tenant purge 🔴
`sweepPendingDeletes → purgeTenantRows` (`src/lib/platform/pdpa.ts:75–90`) calls `deleteMany({where:{tenantId}})` on every tenant-axis model and treats any error as an FK miss. The trigger raises 23001, so `AgentLedgerEntry` stays in `failed`, `leftover.length > 0`, and the tenant is never deleted. No error is ever surfaced. pdpa.ts is a platform file outside this RUN. Fix this in the schema so no code change is needed:
```sql
IF TG_OP = 'DELETE' THEN
  IF current_setting('shark.ledger_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = OLD."tenantId" AND t."status" = 'PENDING_DELETE') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'AGENT_LEDGER_APPEND_ONLY' USING ERRCODE = '23001';
END IF;
```
(`TenantStatus.PENDING_DELETE` exists, `core.prisma:24`.) Oracle: add an L-check that deleting ledger rows of a tenant in `PENDING_DELETE` succeeds, and of an `ACTIVE` tenant fails.

### R2 — VOID / regenerate of statements is currently impossible 🔴
- Trigger: allow `statementId` to change (to NULL or a new id) **only when the old statement is VOID**:
```sql
IF OLD."statementId" IS NOT NULL AND NEW."statementId" IS DISTINCT FROM OLD."statementId"
   AND EXISTS (SELECT 1 FROM "AgentStatement" s WHERE s."id" = OLD."statementId" AND s."status" = 'VOID') THEN
  n."statementId" := OLD."statementId";            -- neutralise for the whole-row compare
END IF;
```
- Replace `@@unique([agentAccountId, periodKey])` with a hand-written partial unique: `CREATE UNIQUE INDEX "AgentStatement_agentAccountId_periodKey_key" ON "AgentStatement"("agentAccountId","periodKey") WHERE "status" <> 'VOID';`. Prisma ignores partial indexes, so this adds no new drift (T0.1 note). Put `@@index([agentAccountId, periodKey])` in the Prisma file.
- Add `accountDocId` to the set-once list (null → value, once). CC D.5 keeps accounting outside the trips tx and retries after commit (the `UNPOSTED` pattern). A ledger row inserted before its accounting document exists could otherwise never get the doc id. `settledAt`/`whtCertDocId` already follow this pattern.

### R3 — Statement buckets and signs don't match the ledger kinds 🔴
CC §I.3 says the amount on the statement is the sum of its entries (Σ entries), with no recomputation. But:
- `cancelledSatang ≥ 0` is subtracted in the total. The brief itself (K4) lets CANCELLATION be positive, and COMMISSION_CLAWBACK (+) is "รวมใน ยกเลิก/คืน". A period with net clawback breaks the CHECK. **Drop `AgentStatement_cancelledSatang_check` (make it signed).**
- REFUND_TO_AGENT, COMMISSION_EARNED, COMMISSION_PAID and WHT_WITHHELD have no bucket. Mock-up 05 shows one agent (PTD) with both a NETTED statement and a link-sales commission payout. Those entries get `statementId` (statementId IS NULL and in period), so the total CHECK fails. Two options:
  - (a) add `otherSatang Int @default(0)` (signed) to the formula: `… − paidDuringPeriodSatang + otherSatang`, and document which kinds go there; or
  - (b) rule that payout-mode kinds never get a `statementId`, and then decide in CC how H.8 "ledger = AR 1100" works for mixed agents. COMMISSION_EARNED is AP (COMMISSION_PAYABLE), not AR 1100, so H.8 is already false for a mixed agent.
  The reviewer recommends (a) plus a note to the controller to fix H.8.

### R4 — Payment ↔ statement allocation (A1.6 aging)
A payment shows on the *current* statement as "ชำระแล้วระหว่างงวด" (`statementId` = the billing statement) but settles the *previous* one (`paidSatang`, PARTIAL/PAID, aging). One column can't hold both. Add:
- `AgentLedgerEntry.settlesStatementId String?` (set at insert; CHECK `settlesStatementId IS NULL OR kind IN ('PAYMENT','WALLET_TOPUP','REFUND_TO_AGENT','ADJUSTMENT')`), plus `@@index([settlesStatementId])`.
- `AgentStatement.version Int @default(0)` (CAS on paidSatang/status from concurrent payments) and `overdueAt DateTime?`. Without the marker, the daily `agency.statement.overdue` job can't be idempotent.

### R5 — Accounting book (unit) dimension on ledger rows
CC H.1 binds every accounting call to `(tenantId, unitId)`, so AR 1100 lives per unit book. A1.5/A1.6 must split or post per book. The agency module can't read `TripBooking` (TC2 forbids agency→trips), so it can't find a booking's unit later. Add `AgentLedgerEntry.unitId String?` + CHECK `"bookingId" IS NULL OR "unitId" IS NOT NULL` + `@@index([agentAccountId, unitId])`. (AgentCommission already has `bookingUnitId`.) Raise with the controller whether one statement can span books (`receiveUnitId` only).

### R6 — Commission payout record and clawback (A1.7)
- New tenant table **«AgentCommissionPayout»**: `tenantId · runId · agentAccountId · unitId · financeAccountId? · commissionSatang · vatSatang · whtSatang · clawbackNettedSatang · paidSatang · whtMode · whtRateBp · accountDocId? · whtCertDocId? · status (PENDING PAID FAILED VOID) · paidAt? · idempotencyKey · createdAt · updatedAt`, with `@@unique([runId, agentAccountId, unitId])`, `@@unique([tenantId, idempotencyKey])` and ≥ 0 CHECKs.
  - Why: `payCommissionRun` makes one payment voucher and one 50 ทวิ per agent per payment, outside the tx. Without a per-agent row there is no retry or idempotency unit.
  - A27 "per payment" thresholds are also judged per agent payment.
- Clawback: `AgentCommission` is unique per booking, and `commissionSatang ≥ 0`. A partial or after-payment clawback (CC H.3 ข "หักในรอบจ่ายถัดไป"; partial cancel with fee) has nowhere to go. Add `clawbackSatang Int @default(0)` (CHECK `0 ≤ clawbackSatang ≤ commissionSatang + vatSatang`) and `clawbackRunId String?`.

### R7 — Agent webhook delivery log (A2.4)
The platform `WebhookDelivery` has an FK to `WebhookEndpoint` (`webhook.prisma:26`), so agent webhooks can't use it. Add tenant table **«AgentWebhookDelivery»**: `tenantId · webhookId · eventId · eventType · status (PENDING OK FAILED DEAD) · attempts · nextAttemptAt? · lastError? · responseCode? · createdAt · updatedAt`, with `@@unique([webhookId, eventId])`, `@@index([tenantId, status])` and a hand-written partial `("nextAttemptAt") WHERE status IN ('PENDING','FAILED')`. The payload is the outbox event (CC J.1: ids/amounts only), so no copy is needed.

### R8 — AgentRequest: sweeper path and the TC5 single time source
- CC D.4: the hold sweeper sets "AgentRequest ที่ผูก → EXPIRED" by hold. Add **`@@index([holdId])`**.
- TC5 says hold expiry has one source (`TripHold.expiresAt`). For BOOKING requests, `AgentRequest.expiresAt` is a second source that `agency.requestsExpire` acts on. Make `expiresAt` nullable, add CHECK `("kind" = 'BOOKING') = ("holdId" IS NOT NULL)` and CHECK `"holdId" IS NOT NULL OR "expiresAt" IS NOT NULL`, and make `AgentRequest_expiresAt_pending_idx` `WHERE status='PENDING' AND "holdId" IS NULL`.
- Promote the queue's filter/join fields out of `payload Json`: `bookingId String?`, `productKind String?`, `productId String?`, `slotId String?`, `qty Int?` (+ `@@index([tenantId, productKind, slotId])`). The shop approval queue is per departure, and BOOKING requests resolve to a PENDING booking (TC5).

### R9 — Tax-id hash: key, scope of input, squatting (decide now; the global table is permanent)
- **Key**: `SESSION_SECRET` is the platform's rotatable auth key (17 call sites: sessions, signed links, staff PINs, OTP). If it is rotated after a compromise, every `taxIdHash` silently stops matching. The unique index then lets the same tax id register twice, and nothing can re-hash because plaintext isn't stored globally.
  - Use the at-rest data key the platform already has: a label-derived HMAC key from `INTEGRATIONS_CREDENTIALS_KEY` (`secret-box.ts:11`; already used for hotel guest IDs and planned for `AgentAccount.taxIdEnc/bankAccountEnc`), e.g. `"agent-taxid:v1:" + key`, fail-closed.
  - Store the value versioned, `v1:<64hex>`, with CHECK `"taxIdHash" IS NULL OR "taxIdHash" ~ '^v1:[0-9a-f]{64}$'`. A key change then becomes a dual-read migration instead of silent corruption. (AI-5 regex needs an ORACLE-EDIT.)
- **Input**: CC TC3/§B.2 says "ห้ามเก็บเลขบัตรประชาชนบุคคล", but `normalizeThaiTaxId` accepts any 13 digits that pass checksum. Thai juristic tax ids start with `0`. Require the leading `0` for the identity hash (brief §5.1 + AI-1).
- **Squatting**: juristic tax ids are public (DBD). With a global unique and no verification, anyone can claim a competitor's id first, and the real company then gets `TAX_ID_TAKEN` (a DoS). Since AI-11 forbids a verification column on AgentIdentity, the safe choice is **a plain index, no unique**. Keep the "match when the agent types it" semantics. If uniqueness is required, it needs verification (the DBD API key exists in env) and a column, which means a CC change.

### R10 — TripPickupZone: "null = not migrated" is ambiguous per column
`nameEn` and `areas` are legitimately null after migration ("no English name"). Use `kind` as the single marker and enforce all-or-nothing:
`TripPickupZone_v2_check`: `"kind" IS NULL OR ("windowMin" IS NOT NULL AND "active" IS NOT NULL AND "basis" IS NOT NULL)`. The brief then says "kind IS NULL ⇒ read polygon v1". The W1.2/T1.3 backfill sets all columns in one UPDATE.

### R11 — Small CHECK corrections
- `AgentAccount_identity_check`: a revoked invite (never accepted) becomes CLOSED with no identity. Use `"identityId" IS NOT NULL OR "status" IN ('INVITED','CLOSED')`.
- `SellBasket_holdKey_pair_check`: `("holdIdempotencyKey" IS NULL) = ("holdRequestHash" IS NULL)`.
- `AgentRate_fixed_currency_check`: `"mode" <> 'COMMISSION_FIXED' OR "currency" = 'THB'`. T0.5 consumes `fixedSatang`, and the ledger is THB only (decision 9).
- `AgentCommission_currency_check`: `"currency" = 'THB' OR "fxRateMicros" IS NOT NULL`. The column is named `baseSatang`, so the amounts are THB.
- `AgentTier_code_check`: `"code" IN ('A','B','C')` for v1. A1 `agency.tier.table` and A2 `newAgentTier` are keyed by fixed A/B/C. A shop-created tier "D" would have no A1 row, and widening the CHECK later is cheap.
- `AgentUser.status` + `ERASED` (PDPA erasure state distinct from DISABLED). Widening a CHECK later means DROP+ADD, so add it now.

### R12 — Remove from A1.1, design in L1.1: `TripSupplierPeerLink`, `TripGroupQuoteRequest`
MP §4 lane ข is `A1 → S1.1–S1.3 → A2 → L → S1.4–S1.6 → C1.1`. S1.5 (peer links) and S1.6 (group quotes) come **after** L1.1, which is a migration WO. Creating a **cross-tenant global table** now, before S1.5 is briefed or security-reviewed, fixes its shape without need. The S1.6 table is also thin: no signature evidence, no public token for the requester, no PDPA retention for `requester Json`. Keep `TripSupplier.peerLinkId String?` (harmless) and `AgentAccount.kind` OTA/PEER. Note for the controller: C1.1's mapping/inbox tables also need L1.1 (the brief claims C1.1 has no migration).

---

## Optional improvements (ordered)

- **O1 — DB-enforced ledger head.** Add an AFTER INSERT trigger on `AgentLedgerEntry`:
  `UPDATE "AgentBalance" SET "balanceSatang" = "balanceSatang" + NEW."amountSatang", "lastSeq" = NEW."seq", "version" = "version" + 1, "updatedAt" = now() WHERE "agentAccountId" = NEW."agentAccountId" AND "lastSeq" = NEW."seq" - 1; IF NOT FOUND THEN RAISE … '23001'`.
  This makes `seq` gapless and `balance = Σ` by construction. Code still locks AgentBalance first (layer 2f) and must not also update the balance. Optionally add `balanceAfterSatang Int` on the entry (immutable, gives opening/closing for free).
- **O2 — int4 aggregates (OQ19 follow-up).** Per-booking int4 is decided, but `AgentStatement.*Satang`, `AgentCommissionRun.total*` and `AgentBalance.balanceSatang` are sums across bookings. A large Liveaboard agency half-month can approach 21.4 M THB. A later ALTER TYPE is not additive, so decide now (BigInt) or record the cap in OQ19.
- **O3 — AgentContract overlap.** Add `EXCLUDE USING gist ("agentAccountId" WITH =, daterange("validFrom", COALESCE("validTo",'infinity'), '[]') WITH &&) WHERE ("status"='ACTIVE')` (btree_gist exists). Similarly, a partial unique on AgentAllotmentBlock `(agentAccountId, productKind, productId, optionId) NULLS NOT DISTINCT WHERE active` (but that is a 6th NND drift name, so prefer an EXCLUDE or accept overlaps resolved in code).
- **O4 — Hot-path indexes** (trips has no migration until L1.1):
  - `TripHold("agentAccountId") WHERE status='ACTIVE' AND "agentAccountId" IS NOT NULL` (portal "ที่ถือไว้", A17 display).
  - `AgentStopSell("tenantId","productKind","productId") WHERE "liftedAt" IS NULL` (product-level and per-agent "ปิดขาย").
  - `AgentStatement("dueAt") WHERE status IN ('ISSUED','PARTIAL')` (cross-tenant overdue job; the existing index leads with tenantId).
  - `TripSupplierPayable("dueAt") WHERE status IN ('ACCRUED','BILLED')`.
  - `AgentCommission("tenantId","status","earnedAt")` (tenant-wide run preview).
  - `AgentLoginCode("expiresAt")` and `TripPassengerLink("expiresAt")` (purge).
  - `TripMoneyEvent("tenantId","unitId","receivedAt")`. Cash close by business date should follow the actual received date once back-dating exists; `createdAt` misattributes late entries.
- **O5 — AgentLoginCode.** Add `purpose String` (LOGIN, ADD_LOGIN, INVITE_ACCEPT) + CHECK, and `ipHash String?`. Spec in A1.2: `target` = HMAC(label+SESSION_SECRET, normalised target), not plain sha256; `codeHash` = HMAC(…, `${id}:${code}`) as in `phone-auth.ts:130`. A short-lived auth artefact may use SESSION_SECRET.
- **O6 — Per-tenant last activity.** Add `AgentAccountMember.lastActiveAt DateTime?` so the shop's team tab never shows the global `AgentUser.lastLoginAt`, which leaks activity at other shops.
- **O7 — Intra-file FKs.** T0.1 §7.21 chose "no FK at all" (CC only forbids cross-file). The dangerous spots without FKs:
  - AgentRate rows orphaned from a deleted rate card are still picked up by the `(tenantId, productKind, productId)` loader.
  - Sessions/logins of an erased AgentUser stay valid unless code joins status.
  If the controller keeps the rule, the code rule must be: rate cards are archived, never deleted; session lookup always joins AgentUser + AgentIdentity status. If FKs are allowed, use them only on identity tables (Login/Session → User CASCADE) and AgentRate → AgentRateCard CASCADE, never into the ledger (cascade would hit the trigger).
- **O8 — TripSupplierPayable FX** (foreign Liveaboard operators): `currency String @default("THB")`, `amountMinor Int?`, `fxRateMicros Int?`, `version Int @default(0)`. S1.3 can't add these later.
- **O9 — AgentApiKey.** Add `rotatedFromId String?` (platform parity, `api.prisma:18`). Agent API idempotency can reuse `ApiIdempotency` (keyId = AgentApiKey.id, tenantId); no new table is needed.
- **O10 — AgentAccount.** Make `@@unique([tenantId, identityId])` partial `WHERE status <> 'CLOSED'` if re-joining should create a new account (otherwise document "reopen the row"). Add `licenceReminderSentAt DateTime?` for an idempotent `agency.licenceReminders`.
- **O11 — Ledger trigger hardening.**
  - The whole-row `n IS DISTINCT FROM OLD` fails at runtime ("could not identify an equality operator for type json") if a `json` column is ever added. Either never add json, or compare `to_jsonb(n) IS DISTINCT FROM to_jsonb(OLD)`.
  - Restrict set-once columns by kind: `whtCertDocId` only on WHT_GROSSUP/WHT_WITHHELD/COMMISSION_PAID; `settledAt` only on commission kinds.
- **O12 — AuditLog(tenantId, targetId) index.** The writer says CONCURRENTLY can't run inside a Prisma migration. The usual workaround is a **separate migration folder containing that single statement**. A one-statement script is not run inside an explicit transaction block. Verify on a lane DB before relying on it. That is a controller decision (the platform table is outside the RUN).

---

## Answers per question

### 1. Completeness vs downstream WOs (no migration until L1.1)
| WO | Serves without migration? | Gaps |
|---|---|---|
| A1.2 register/approve/users/Party/CRM/licence | Yes, with R11 | invite-revoke CHECK (R11); optional licence reminder marker (O10); invite e-mail lives in `contact Json` (fine) |
| A1.3 tiers/contracts/rates/special periods/calculator | Mostly | AgentTier code ↔ A1 keys (R11); COMMISSION_FIXED currency (R11); contract overlap (O3). The rate tables feed T0.5's `LEVEL` (`pricing-core.ts:95–104`: mode/rateBp/fixedSatang/unitMinorByPaxCode/minSellMinor/markupCapBp). The loader maps `paxTypeId → code`, which is fine. |
| A1.4 quota/release/request-first/holds+caps/stop-sell | With R8 | AgentRequest holdId index, TC5 expiry, promoted columns (R8); stop-sell product index (O4); agent hold index (O4). Caps use existing `TripHold.capKeyHash` partial index, which is fine. |
| A1.5 ledger/credit/wallet/pay-now | With R1, R2(accountDocId), R5 | unitId (R5); purge (R1); optional DB-enforced head (O1). Credit limit/term are settings A12–A14 (correctly not in the schema). |
| A1.6 statements → billing note, payments, aging | **No** today | R2 (void/regenerate), R3 (buckets), R4 (allocation + version + overdue marker) |
| A1.7 commission run + WHT + clawback | **No** today | R6 (payout table, clawback) |
| A1.8 sales links + stats | Yes | Stats = existing `TripLinkStat` (unit, NND `(unitId, day, channel, linkId)`). `AgentLink.discountBp` + A24 cap fine. |
| A2.1/A2.2/A2.3 portal | Yes (with O4) | `TripBooking.agentRef/voucherOptions`, `AgentAccount.logoFileId`, `TripPassengerLink` cover 04ค/05 |
| A2.4 media/API keys/webhooks | **No** today | R7 (delivery log); O9 |
| A2.5 shop reports | Yes | — |
| S1.1 suppliers + external products + cost | Yes | TripSupplierCost NND fine (arbiter for S1.4 `ON CONFLICT`) |
| S1.2 supplier requests + `/sp/[token]` + timeouts | Yes | optional `viewedAt` |
| S1.3 payables/terms/profit | Mostly | FX/version (O8); payable due index (O4) |
| S1.4–S1.6, C1.1 | Come after L1.1 | Design in L1.1 (R12) |

Speculative now (should not be created): `TripSupplierPeerLink`, `TripGroupQuoteRequest` (R12). Everything else maps to a screen or a CC line.

### 2. Global (non-tenant) tables
- **Model.** Identity (company) → AgentUser (person, one identity) → AgentLogin (N per user) → per-shop AgentAccount + AgentAccountMember. This is sound for "one agency, many shops". Limitation: `AgentLogin @@unique([kind, providerId, subject])` + `AgentUser.identityId NOT NULL` means one e-mail can work for only one agency. A freelancer selling for two agencies needs a second e-mail. Accept and document (adding `AgentIdentityMember` later is additive).
- **Uniqueness/normalisation.**
  - E-mail: lower-case, CHECK on `AgentLogin_email_norm_check`, OK.
  - LINE: providerId + userId, OK (CC N-7).
  - Phone: none, fine.
  - Tax id: see R9 (key source, juristic-only, squatting).
- **Sessions/codes.**
  - `AgentSession`: tokenHash unique, absolute + idle expiry with CHECK, revokedAt, ipHash/uaHash. Matches `Session` (`core.prisma:173`).
  - `AgentLoginCode`: hash only, attempts, expiresAt, usedAt. Needs purpose + an expiry index + the HMAC spec (O5).
  - Device binding: uaHash is sufficient for v1.
- **PDPA erasure.** Delete AgentLogin/AgentSession/AgentLoginCode rows, set AgentUser to ERASED (R11) with a placeholder displayName, and set AgentIdentity to CLOSED with a placeholder name and `taxIdHash` NULL. Tenant ledgers reference only `agentAccountId`/`actorId` (no FKs), so nothing breaks. Per-shop `AgentAccount` data is each shop's own record (controller = shop).
- **Cross-tenant privacy.** No schema path lets shop A read B's rows, *as long as global tables are never read with a shop actor*. The real risks are code paths:
  1. **`tenantDb` passes global models through unfiltered** (`db.ts`: `if (d.axis !== "tenant"…) return query(args)`). Any future shop-side code doing `tenantDb(ctx).agentSession.findMany()` reads the whole platform. Ask the controller for a fitness rule (ORACLE-EDIT): `agentIdentity|agentUser|agentLogin|agentSession|agentLoginCode|tripSupplierPeerLink` only in `agency/entry.ts`, `platform/agent-auth.ts` and `supplier/public.ts`. X1-4 only checks this WO.
  2. Do not show a shop any of these, because each reveals the agent's other shops:
     - `AgentLogin.providerId`: the LINE channel of the shop whose OA the agent used.
     - `AgentSession.activeAgentAccountId`.
     - `AgentUser.lastLoginAt` (O6).
  3. `listAgentAccountsOfUser` must only be callable from the agent's own session.
  4. `findAgentIdentityByCode` is brute-forceable at 30⁶ codes. It needs a rate limit (A1.2).
  5. `$queryRaw` through tenantDb is unfiltered (CC A.4), so raw SQL must carry `tenantId`.
  6. `TAX_ID_TAKEN` is an existence oracle, but it is agent-side only.
  7. Platform `AgentIdentity.status=SUSPENDED` is visible to all shops, which is intended.
  - Schema-enforceable: keep PII out of global tables (done), exact column sets (T-3/AI-10). Everything else is code + fitness.

### 3. Money correctness
- **Types and signs.**
  - All Int4 satang with CHECKs; the sign CHECK per ledger kind is correct.
  - Statement sign problem: R3.
  - Aggregates: O2.
  - The refs CHECK omits CC's required refs for PAYMENT/WALLET_TOPUP/REFUND_TO_AGENT (accountDocId) and CANCELLATION (requestId). With R2 (accountDocId set-once) they can't be NOT NULL at insert, so leave them to code and say so in the brief.
- **Trigger.**
  - Logic is correct: null→value neutralisation, whole-row compare, GUC delete, `RETURN NEW`.
  - Bypassable by the app role (it owns the table: `DISABLE TRIGGER`, `TRUNCATE`, `SET LOCAL shark.ledger_purge`). It guards against bugs, not malice, and that should be stated.
  - Prisma: no `@updatedAt`, so updates that change nothing pass, and upserts that hit a conflict with equal values pass. `deleteMany` in tests needs `SET LOCAL` inside an interactive `$transaction`, which works on the same connection.
  - Tenant deletion is blocked: R1.
  - Statement void: R2.
  - Future json column: O11.
- **AgentBalance.** It is a cache. Keep it consistent with a guarded single-statement update under the 2f lock (CC), or enforce it in the DB (O1). Credit limit stays in settings, so there is no CHECK. The WALLET rule ("ยอดหลังตัด ≤ 0") is code. The AgentBalance row must exist before the first entry (`INSERT … ON CONFLICT DO NOTHING` at account creation).
- **Currency.**
  - Ledger is THB-only (CHECK).
  - AgentRate is currency-aware (NET in product currency) but needs the COMMISSION_FIXED → THB CHECK (R11).
  - AgentCommission needs a THB/fx CHECK (R11).
  - Payables: O8.
- **Idempotency.** Present on ledger, request, run, supplier request/payable. Missing on statement payment allocation (R4) and per-agent payout (R6). The webhook delivery dedupe key is in R7.
- **Period locking.** An ISSUED statement is immutable in code. Accounting periods belong to the account module (`postedDate`). There is no agency-side lock table, which is fine.

### 4. Constraints and indexes
- **NND on AgentRate/TripSupplierCost.** Keep them.
  - They block exact duplicates and serve as the arbiter for `INSERT … ON CONFLICT` in S1.4 imports.
  - They do not prevent overlapping windows (`travelFrom` NULL vs a date), so the resolver must still rank by priority/specificity.
  - A sentinel (`''` for id dims, as `TicketChannelQuota.channel = "*"`) would remove drift for the id dims, but the date dims would need a fake date. Not worth it; the drift is procedural, and D-1 + the T0.1 handover note cover it.
- **FK policy.** Matches the T0.1 controller ruling (§7.21), which is stricter than CC §B (cross-file only). Dangers and mitigations: O7.
- **Hot paths.** Covered:
  - agent allotment by `(agentAccountId, productKind, slotId)`
  - portal 7 days `(tenantId, agentAccountId, slotDate)`
  - release partial
  - ledger by `(agentAccountId, seq)` / `(agentAccountId, statementId)`
  - link `(tenantId, code)`
  - api key `keyHash`
  - session `tokenHash`
  Missing: R8 `AgentRequest(holdId)`, plus O4.
- **Enum CHECKs.** Complete. Additions: R11.
- **JSON → real columns.**
  - `AgentRequest.payload` → product/slot/qty/booking (R8).
  - Keep as JSON: `AgentRateCard.conditions` (evaluated in memory), `AgentAccount.contact`, `TripSupplier.paymentTerms`, `AgentContract.termsSnapshot`, `TripBooking.voucherOptions`, `TripPickupZone.areas`.
  - `TripGroupQuoteRequest.requester` holds PII and needs a purge story (R12).

### 5. Additive columns on existing tables
- **Lane safety.** All nullable, no default, no UPDATE. T0.7/T0.8 code never reads them, and the old generated client doesn't select them. Order **deploy → generate** is required: a new client on an old DB fails on any TripBooking select. CHECKs added to TripPickupZone/TripBooking validate existing rows, and NULLs pass.
- **Locks.**
  - ADD COLUMN nullable is metadata-only.
  - ADD CONSTRAINT CHECK takes ACCESS EXCLUSIVE briefly and scans the table.
  - CREATE INDEX (non-concurrent) on TripMoneyEvent (empty in prod) and the SellBasket partial unique takes a SHARE lock.
  - All are trivial at current sizes. Production trips is not launched; prod tables are empty or missing.
  - Put `SET lock_timeout = '5s';` at the top of the file as T0.1 did (M-2 allows it).
- **Design per column.**
  - `TripPickupZone`: R10.
  - `SellBasket`: R11 pair CHECK. Keys must be the namespaced `nsKey` value (they are, `booking.ts:524`).
  - `TripMoneyEvent`: `refEventId` CHECK `"refEventId" IS NULL OR "kind" IN ('REFUNDED','RETAINED','CREDIT_ISSUED')` (optional). `reference` length/charset CHECK matching T0.7's `≤ 64 [A-Za-z0-9 ._/-]` (optional). Index note in O4.
  - `TripBooking.agentRef/voucherOptions`: fine.
  - `TripPassengerLink`: fine. Unit axis means public `/form/[token]` lookups must loop units or go through `trips/jobs.ts`, as CC A.4 already accepts. Expiry index: O4.

### 6. Naming and placement
- `Supplier` collides (`procurement.prisma:9`), so the `TripSupplier*` rename is necessary.
- No other collisions on `main` or `session/hr`. Planned K1.1 (`TicketSession`, `TicketChannelQuota`, `TicketBatch`, `TicketHold`, `TicketScan`, `GateSigningKey`) and L1.1 (`Vessel*`, `CabinAssignment`, `TripFolio*`) names are free.
- Placement is right: agency.prisma (24), supplier.prisma (Trip* supplier set), trips.prisma (`TripPassengerLink`), sellable.prisma.
- Doc-sync debt: CC references `SupplierRequest`, `SupplierPayable`, `SupplierPeerLink`, `SupplierCost` and `GroupQuoteRequest` in §A.1, §A.4, §B.0, §D.4–5, §G.2 and §J.2. The brief §2.6 count is wrong ("tenant 19": the actual is 20 = 19 Agent* + TripSupplier, as the oracle TABLES map has). Oracle S-1's label says "tenant 19 · unit 6" while the data is 20/5.

### 7. Settings registry
- **Doc-sync.** R-1 only compares key, chain and type word. It does not compare enum option sets, table shapes or defaults (defaults are embedded in the oracle by the writer, not parsed from TD). The shape deviations (A1 + creditTermDays, A27 `appliesTo` object, A25 nullable, `TH_FOUNDATION`) must be written back into TD/CC in the next docs round.
- **Deviations.**
  - **A5/A22 restricted schemas: acceptable.** The only difference from CC H.3 is the error message ("ยังไม่เปิดใช้ในรุ่นนี้" vs a generic INVALID_VALUE). Add the message in `helpTh`.
  - **A12 as strings: acceptable** given `form.ts:56`. Provide a typed accessor.
  - **A25 nullable: acceptable** (null = derive from the account book).
  - **X27 deferred: acceptable** (CC §E.4 names A2.2).
  - **A1.creditTermDays: not acceptable as is.**
    - It duplicates A12 at AGENT_TIER scope with a different type (number vs string).
    - No precedence is defined between `A12(AGENT) > A12(AGENT_TIER) > A1[tier].creditTermDays > A12 default`.
    - Either define that precedence in the brief (A1.3 resolver) and use the same representation (`"7"|"15"|"30"|null`), or drop the field and let the template-time tier seeding write A12 at AGENT_TIER.
    - The same latent duplication exists for `A1.payDefault` vs A11 (from TD itself). Document one precedence rule for both.
- **Presentation metadata.** R-14/R-17 enforce `tableTh` on every table key and enum labels. OK.

### 8. Rollout risk
- `prisma migrate deploy` applies pending local migrations and **does not complain about migrations applied in the DB but missing locally** (Prisma documents that deploy doesn't warn about them or check drift). The HR migrations on the lane DB (`2026120x…`) are therefore tolerated.
- When `session/hr` (migrations up to `20270107000000`) later merges, those older-timestamped folders apply out of order. deploy allows this; `migrate dev` would not, and is never used.
- T0.1's deploys to main/l1/l2 went through the same situation silently (no note).
- **Controller checks before deploying to the main QC DB (ep-wandering-butterfly):**
  1. `prisma migrate status` through `iso.sh qc-trips.sh`: pending must be exactly `<ts>_agency`. Applied-not-local must be only known HR names.
  2. `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL` must return 0 rows (else P3009 blocks deploy).
  3. No pre-existing objects: `to_regclass` for every new table/index name, `pg_proc` for `agent_ledger_entry_guard`, and `information_schema.columns` for the 13 added columns (catches a lane experiment applied by hand).
  4. `SHOW server_version` ≥ 15 (NND); lane is 18.7.
  5. Take a Neon branch/snapshot first. There is no down migration, and the trigger and functions are invisible to `migrate diff`.
  6. Hold `with-gate-lock.sh` and check `pg_stat_activity` for long transactions on TripBooking/SellBasket/TripPickupZone/TripMoneyEvent.
  7. After deploy: `generate`, then read-only `migrate diff`. Only the 5 known `DROP INDEX` names may appear for Trip*/Sell*/Agent*. Then run the oracle, `qc-trips-t0.1` (expected flips M-1/M-6/RS-5) and p0.1.
  8. Lanes l1/l3: merge → deploy → generate, in that order, before rerunning their oracles.
  9. On production: `prisma migrate deploy` must complete before the new build serves traffic (new client + old DB = failure on TripBooking).

### 9. Oracle
**Important properties with no check:**
- Behaviour of numeric CHECKs. C-5 checks names only, so `>= -1` under the right name passes. Add a generic loop: for each `NUM_CHECKS` entry, insert −1 (or 10001 for bp) and expect 23514.
- Behaviour of `AgentRateCard_dates_check`, `AgentAllotmentBlock_dates_check`, `TripSupplierCost_dates_check`, `AgentContract_dates_check`, and `AgentLedgerEntry_booking_check` with bookingKind only.
- Tenant purge with ledger rows (R1). Would have caught the blocker. Exercise `purgeTenantRows`-style `deleteMany` through the Prisma client on a `PENDING_DELETE` tenant.
- Trigger through the **Prisma client** (`update`/`updateMany` setting statementId, `upsert` no-op), not only raw pg.
- Statement VOID → rebind, and periodKey re-use after VOID (R2).
- Statement with net-positive cancellations or other kinds (R3).
- `AgentAccount` CLOSED invited without identity (R11).
- Index presence for the hot paths in R8/O4.
- Tax-id normalisation rejecting a personal id (leading digit ≠ 0) (R9).

**Checks that look wrong or brittle:**
- S-1 title says "tenant 19 · unit 6"; the data and the correct count is 20/5. Cosmetic, but it misleads the builder (and brief §2.6 says 19).
- M-2 allows only `SET lock_timeout` / `RESET lock_timeout`. `SET LOCAL lock_timeout` would be flagged; say so in the brief.
- M-2/M-5/L-7 assume the function body is delimited by `$$`. A `$fn$` tag would break the `$$…$$` stripping and may false-fail M-2 on the body's `UPDATE`. Pin `$$` in the brief (it is shown) or make the regex tag-agnostic.
- AI-5 hard-codes `^[0-9a-f]{64}$` (conflicts with R9 versioning).
- C-8's PAYMENT case relies on the sign failing, not on missing refs (fine, but no test for refs on PAYMENT exists because the brief omits them; see §3).
- U-2 expects `travelFrom` difference to pass, which is correct. But no test shows that an overlapping-window row is accepted (documenting that NND is not an overlap guard).
- C-7 positive control builds `TripSupplierPeerLink`/`TripGroupQuoteRequest` (R12 would remove them).
- R-1's doc-sync can't detect the A1/A27 shape deviations (see §7).
- G-1 assumes the t0.1 flips are only M-1/M-6/RS-5; the writer derived this from reading code, not from a run.

---

## What I did not check
- Did not run anything: no migration, oracle, typecheck or `migrate diff`. All statements about Prisma 7.8 behaviour (ignoring partial indexes; proposing DROP for NND; deploy tolerating missing-local migrations; single-statement CONCURRENTLY) come from the T0.1 notes, the writer's diff log and Prisma's documented behaviour, not from a run here.
- Did not read CC §C (sellable), §E.1–E.5 in full, §F, §G, §K, §L/§M/§N in full, TA/LG, or the settings engine (`registry.ts`, `service.ts`, `form.ts`). So the AGENT/AGENT_TIER locate design and the form constraints were taken from the brief.
- Did not open PNGs 04/05 (body.html text read instead); 10 opened.
- Did not verify `scope.ts`/fitness F1 internals, or whether QC lane DBs use a non-`public` schema (it matters for the trigger's unqualified type name only if `search_path` differs at call time).
- Did not check legal retention (Accounting Act record-keeping) against tenant purge of agency ledgers. Out of scope, but worth one line to `shark-thai-law` when R1 is decided.
- Did not review the agency settings defs (A1–A37 defaults per template) value by value against TD prose.
