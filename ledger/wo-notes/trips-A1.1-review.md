# A1.1 — independent review of the BUILT migration + supporting code (review 2)

Tree `/root/projects/shark-trips-l2` @ `1285f85a0` (`wip/trips-a1.1`), diff vs `f26c5ac99`. Lane DB l2 (ep-calm-sun, PG 18.7) inspected read-only. All probes ran inside transactions that were rolled back.
Scripts (scratch): `a1.1-review2/inspect.mts` (catalog ↔ Prisma diff + trigger/CHECK probes), `probe2.mts` (fresh-session search_path, PENDING_DELETE path), `preflight.sql`, `postdeploy.sql`, `runsql.mts`. I tried both SQL files on l2. The pre-flight returns "already exists" there, as it should, and the post-deploy returns 31 / 88+88 valid / 149+149 validated / trigger 'O' / 0 FK / smoke 23001 then OK.

## Verdict: **FIX FIRST (small)**

The migration is correct. It matches the brief table by table. The applied catalog matches the Prisma schema with 0 column mismatches and 0 index mismatches. The trigger does what R1 says, and every new CHECK on an existing table touches only new NULL columns. Nothing in the SQL is a BLOCKER, and the file could merge as is.

Two things should be done before merge because they are cheap now:
- **One MAJOR authz gap in code.** It was introduced by this WO's settings-scope change. It is one line.
- **One house-style hardening of the trigger function.** It is one line. Merge is the last point where it can go into this file without a follow-up migration.

Everything else is MINOR or a note.

---

## Findings

### MAJOR

**M1 — Branch-restricted MANAGER (or STAFF with `agency.settings.*`) can write AGENT / AGENT_TIER settings, MONEY keys included.**
`src/lib/core/settings/service.ts:421–426` (`permissionIssue`), together with the new `locateMany` branches at `:310–322`. Those branches return `unitId: null`.
- Only `scope === "TENANT"` requires `isUnrestricted`. AGENT_TIER and AGENT now resolve to `unitId: null`.
- So `evaluate(actor, {unitId: undefined})` → `canAccessUnit` returns true (`rbac.ts:24` "tenant-level action ไม่ผูก unit"). A MANAGER restricted to one branch then gets `true` (`rbac.ts:36`).
- The builder's note understates this. It is not only "STAFF with agency.* permission": **every MANAGER, whatever their branch**, passes.

Failure scenario (once A1.2/A1.3 create `AgentTier`/`AgentAccount` rows):
- A branch-X manager calls the generic server action `saveSettingsAction` (`settings/actions.ts:45`). It takes `scope`/`scopeId` from the client.
- They set `agency.money.creditLimit` (A13, MONEY) on an agent that books for every branch, or `agency.money.paymentMethod = CREDIT` / `overLimitAction = WARN_ONLY` at AGENT_TIER. That changes terms for all agents of a tier, shop-wide.
- AGENT_TIER is effectively tenant-wide, yet the TENANT rule denies exactly this person.

Not exploitable today, because no code creates AgentTier/AgentAccount rows and `locate` returns NOT_FOUND. The oracle has no check for it: the RS group uses an owner actor.

**Rule (proposed):** AGENT_TIER and AGENT are tenant-level, so require `isUnrestricted` (OWNER or `unitAccess ["*"]`), the same as TENANT.
```ts
// service.ts:421
if ((scope === "TENANT" || scope === "AGENT_TIER" || scope === "AGENT") && !isUnrestricted(actor)) {
  return { key: def.key, code: "TENANT_SCOPE_FORBIDDEN", messageTh: `ค่าระดับทั้งร้าน/เอเจนซี่ของ «${def.labelTh}» แก้ได้เฉพาะเจ้าของหรือผู้ดูแลทุกสาขา` };
}
```
A later refinement for A1.3 is optional: for AGENT, allow a restricted actor when `AgentAccount.unitIds` is non-empty and ⊆ `actor.unitAccess`. That needs `unitIds` carried in `known`.

Add an oracle check: a restricted MANAGER and a STAFF with `agency.settings.money` get `TENANT_SCOPE_FORBIDDEN` at AGENT and AGENT_TIER, and no row is written.

This is code-only, with no DB impact. Brief §1 limited `service.ts` edits to SUPPORTED_SCOPES + locate, so it needs a controller ruling. Fix in A1.1 r1, or at the latest before any WO that creates tier/account rows.

### MINOR

**m1 — Trigger function does not pin `search_path` (house style).** `migration.sql:1106–1107`. `DECLARE n "AgentLedgerEntry"` and the references to `"Tenant"` and `"AgentStatement"` are unqualified.
- Proven on l2: in a fresh session with `SET search_path = pg_catalog`, `UPDATE public."AgentLedgerEntry" …` fails with `42704 type "AgentLedgerEntry" does not exist`.
- Effect: every UPDATE/DELETE on the ledger fails under a non-default search_path (scripts, psql sessions, pooled roles with a custom path).
- The repo's other plpgsql functions pin it: `20261104000002…:13` and `…003…:24` have `SET search_path = pg_catalog, public`.
- The function is not SECURITY DEFINER (`prosecdef=false`, `proconfig=null`), so there is no privilege issue, only fragility. The brief §3.4 text omitted it and the builder copied the brief.
- Fix: `CREATE FUNCTION "agent_ledger_entry_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ …`.
- Re-apply on l2 in place, for example in one tx: `CREATE OR REPLACE FUNCTION …` with the new text, then `UPDATE "_prisma_migrations" SET checksum = <sha256 of edited file> WHERE migration_name='20270201000200_agency'`. Resetting the l2 Neon branch from its parent and re-deploying is the cleanest option. Main/l1/l3 just get the final file.
- If not fixed now, any later migration can `CREATE OR REPLACE` it additively.

**m2 — `AgentCommission_clawbackSatang_check` uses int4 arithmetic.** `:1034`.
- `"commissionSatang" + "vatSatang"` overflows before the comparison. Probe: commission 2,000,000,000 + vat 200,000,000 gives `22003 integer out of range` instead of 23514.
- Practically unreachable, since per-booking amounts stay far below 21 M THB, but the error class is wrong.
- Fix: `CHECK ("clawbackSatang" >= 0 AND "clawbackSatang"::bigint <= "commissionSatang"::bigint + "vatSatang")`. `AgentAllotment_counters_check` (`:1062`) has the same pattern and is harmless at seat counts.
- Lane re-apply: DROP+ADD the constraint by hand plus a checksum update, or branch reset. Changing this after merge would be a DROP+ADD, which is not additive. Do it now or leave it.

**m3 — Lock window on existing tables.** `:15–33` put the four `ALTER TABLE … ADD COLUMN` first.
- Prisma sends the script as one simple-query batch, which Postgres runs as one implicit transaction (that is also why CONCURRENTLY can't be used).
- So the ACCESS EXCLUSIVE locks on TripBooking/SellBasket/TripPickupZone/TripMoneyEvent are held for the whole 276-statement script. During that time even reads of TripBooking block.
- Seconds at most on today's tiny tables (l2: 3/3/3/0 rows). Production trips tables are empty or near-empty.
- Optional improvement: move the four ALTERs, the 6 existing-table CHECKs (`:968–969`, `:1033`, `:1081–1083`) and the 3 existing-table indexes (`:915–918`, `:1090`, `:1099`) to just before `RESET`. That only reorders lines, with no schema change.

**m4 — F17.1 can be evaded, and will give false positives.** `scripts/fitness.mts:639–640`.
- Not caught:
  - `prisma["agentIdentity"]`
  - `const { agentUser } = prisma`
  - `Prisma.ModelName.AgentIdentity`
  - `'AgentIdentity'` in single quotes or backticks (for example in `$queryRawUnsafe('… FROM "AgentIdentity"')`, the inner double-quoted name *is* caught)
  - an entry.ts export that hands out a delegate (`export const ids = prisma.agentIdentity`)
- Caught: aliases (`import { prisma as db }` → `db.agentIdentity`) and `tenantDb(ctx).agentUser`.
- False positive ahead: A1.2+ will write `AuditLog.targetType = "AgentUser"` outside entry.ts, and F17.1 will go red on a legitimate audit write. Any DTO property `.agentUser`/`.agentSession` also trips it.
- Suggested replacement:
  - delegate regex: `/(\.|\[\s*["'`])(agentIdentity|agentUser|agentLogin|agentLoginCode|agentSession)\b|\{[^}]*\b(agentIdentity|agentUser|agentLogin|agentLoginCode|agentSession)\b[^}]*\}\s*=\s*\w+/`
  - name regex limited to SQL/registry context: `/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+(\w+\.)?["'`]?(AgentIdentity|AgentUser|AgentLogin|AgentLoginCode|AgentSession)\b|ModelName\.(AgentIdentity|AgentUser|AgentLogin|AgentLoginCode|AgentSession)\b|scopeOf\(\s*["'`](Agent(Identity|User|Login|LoginCode|Session))["'`]/`
  - G-4 positive control: add a bracket-access probe.

**m5 — Contract doc leftovers.**
- `TRIPS-CORE-CONTRACT.md:1041` (L-25) still says the supplier tables live in "migration ของ S1.1 เอง … `TripSupplierPeerLink` อยู่ด้วย". It is now false on both counts. Change it to "A1.1 «agency» (TripSupplier/Cost/Request/Payable) · PeerLink/GroupQuote → L1.1 (R2)".
- `:173` adds "ใบสั่งชนะเมื่อขัด" to the B.2 header. That is a semantic change beyond §4.3: the contract defers to a brief. Prefer stating the full column/CHECK set in the contract, or limiting the clause to "detail lives in the brief".
- The B.2 additive-columns line (`:208`) mentions `TripMoneyEvent @@index([tenantId, unitId, createdAt])` but not the R9 `receivedAt` index.
- Everything else in both doc diffs is exactly the §4.3 list (TD A1/A12/A22/A25/A26/A27/X27; CC B.2/I.2/I.3/A.1/D.4/G.2/J.2/L-58/B.4 move). The A27 key `amount` → `amountSatang` matches the brief's shape.

**m6 — Trigger allows binding or moving `statementId` to any id** (`:1115–1119`): another agent's statement, another tenant's, or a VOID one. Bugs in A1.6 would then corrupt S1, though the drift query would catch it. Optional: `AND EXISTS (SELECT 1 FROM "AgentStatement" s WHERE s."id" = NEW."statementId" AND s."agentAccountId" = NEW."agentAccountId" AND s."status" <> 'VOID')` for non-null NEW. Otherwise leave it to code plus the S1 invariant. Note only.

**m7 — PENDING_DELETE window.** `:1111` lets *any* DELETE through for the whole 30-day grace period. A tenant can cancel deletion (`pdpa.ts:62`), so a buggy delete during the window loses ledger rows of a tenant that comes back. Tightening it (for example also `t."deleteRequestedAt" < now() - interval '29 days'`) couples the trigger to `graceDays`. Accept as R1 decided, but note it in CC I.2.

**m8 — entry.ts small points.**
- `agentUserByLogin` (`entry.ts:153`) returns users of any status and does not check identity status. A1.2 must reject non-ACTIVE users (document it in the JSDoc).
- `agentUserByLogin` and `listAgentAccountsOfUser` are not wrapped in `guarded`, so a DB error throws instead of returning BUSY. Their signatures have no fail type, so this is acceptable; note it for A1.2.
- `makeAgentPublicCode` has a 256 mod 30 bias (16 of 30 symbols are about 1/9 more likely). It does not matter at 30⁶.

**m9 — Redundant indexes (brief-mandated, keep).**
- `AgentRate_rateCardId_idx` = the leading column of `AgentRate_dims_key`.
- `TripSupplierCost_supplierId_productId_idx` = the leading 2 columns of `TripSupplierCost_dims_key`.
- `AgentStatement_agentAccountId_periodKey_idx` = the columns of the partial unique (it only adds VOID rows).
- Small cost on tiny tables. Not worth a brief change.

### Notes (pre-existing, out of A1.1 scope)
- PDPA export `exportTenantData` (`pdpa.ts:44`) does `JSON.stringify` over rows. `Member.spent12mSatang BigInt` (`member.prisma:62`) already makes that throw, and there is no `BigInt.prototype.toJSON` anywhere in `src`. A1.1 adds more BigInt tables to the same broken path (AgentBalance/Statement/Run/Payout). Raise it with the controller as a platform bug.
- TRUNCATE is unguarded, as the brief accepted. Probe: `TRUNCATE "AgentLedgerEntry"` succeeds. A `BEFORE TRUNCATE … FOR EACH STATEMENT` guard would cost one more function. No repo script truncates agency tables (grep).

---

## Task-by-task

### 1. Brief ↔ migration
- **Tables, columns, nullability and defaults: all 31 tables match brief §2.1–§2.5 column for column.** `updatedAt` is absent exactly on AgentLogin, AgentLoginCode, AgentLedgerEntry and TripPassengerLink. The AgentBalance PK is `agentAccountId`.
- **BIGINT** appears exactly 23 times, matching R4 / §2.7: AgentBalance 1 (`:463`), AgentStatement 13 (`:483–495`), Run 4 (`:547–550`), Payout 5 (`:568–572`). All other money columns are int4.
- **CHECKs: 149, every name and expression per §3.1–§3.3.**
  - The SELL_CHANNELS 12 match `core/sellable.ts:12`, and productKind matches `PRODUCT_KINDS`.
  - Uniques, NND (2) and partials (2 unique + 3 index) are as specified. O4 (R9) adds exactly 8 indexes: 4 partial in SQL (`:1099–1102`) and 4 `@@index`.
  - Nothing beyond that: the catalog diff lists exactly these 11 SQL-only indexes.
- Also confirmed:
  - no FK (catalog: 0)
  - no enum, DROP or data statement
  - `SET lock_timeout = '5s'` is the first statement (`:12`) and `RESET` the last (`:1128`)
  - 276 statements = 1+4+31+57+31+149+1+1+1
- **Mismatches: none.**

### 2. Migration ↔ Prisma (applied catalog vs `.prisma`, my own diff)
- 31 new tables plus the 13 added columns: **0 mismatches** in type (incl. int8/date/timestamp(3)/jsonb/_text), nullability (Prisma lists nullable in the DB, as usual) or defaults.
- Every `@@unique`/`@@index`/PK exists with exactly those columns and no WHERE/NND. Every SQL-only object carries a "SQL มือ" comment in its model.
- Constraint names are ≤ 48 characters and the longest index name is 56. No truncation, and none collide.
- I could not run the builder's "migrations → schema" diff (no shadow DB); the catalog diff stands in for it.

### 3. Ledger trigger (probes on l2, all rolled back)
| Probe | Result |
|---|---|
| UPDATE amount | 23001 |
| settledAt null→now **+ amount** | 23001 (no smuggling) |
| statementId null→s **+ kind** | 23001 |
| `SET statementId = statementId`; every column = itself | OK |
| statementId+settledAt+accountDocId+whtCertDocId from null at once | OK |
| re-set settledAt / clear accountDocId | 23001 |
| move statementId from a non-VOID (or missing) statement | 23001 |
| move from a VOID statement; same move **+ amount** | OK; 23001 |
| DELETE with missing tenant / ACTIVE tenant | 23001 |
| DELETE with `SET LOCAL shark.ledger_purge='on'`; `'ON'` | OK; 23001 (case-sensitive, fails closed) |
| DELETE with PENDING_DELETE tenant | OK |
| `INSERT … ON CONFLICT DO UPDATE SET actorId = EXCLUDED.actorId` (same value) | OK (no-op passes) |
| TRUNCATE | succeeds (no guard; brief accepted) |
| fresh session, `search_path = pg_catalog` | 42704 → m1 |

- **Tenant reference:** `Tenant.status` is the `"TenantStatus"` enum; the literal coerces. The function is not SECURITY DEFINER and the owner is `neondb_owner` = the app role.
- **Missing tenant row:** DELETE is refused; only the GUC removes such orphans.
- **Purge cost:** one PK lookup on Tenant per row, which is fine for a tenant's ledger.
- **Purge ordering:** `pdpa.ts` deletes child rows before `tenant.delete` (`:110` then `:128`), so the tenant row still exists and still reads PENDING_DELETE while the ledger is purged.

### 4. CHECK semantics
- **Sign sets (`:1066`)** match CC/brief:
  - positive: CHARGE, CHARGE_PASS_THROUGH, WHT_GROSSUP, COMMISSION_PAID, WHT_WITHHELD, COMMISSION_CLAWBACK, REFUND_TO_AGENT
  - negative: COMMISSION_NETTED, COMMISSION_VAT, PAYMENT, WALLET_TOPUP, COMMISSION_EARNED
  - CANCELLATION and ADJUSTMENT are free but ≠ 0
  - This is consistent with the payout flow (EARNED −, PAID +, WHT_WITHHELD +, which nets to 0).
- **Statement formula (`:1072`):** with the §2.3 bucket mapping it equals `opening + Σ amount` over all 14 kinds, the same as `AGENCY_STATEMENT_DRIFT_SQL`.
  - The ≥ 0 buckets (sales, passThrough, wht, commission, commissionVat, paidDuring) are exactly the buckets whose kinds have a fixed sign.
  - cancelled, adjustment and other are signed.
  - The 13ง example works.
- **NULL tolerance:** every "required when X" rule has the form `kind/mode NOT IN (…) OR col IS NOT NULL` on a NOT NULL discriminator: refs, value, wht, currency, hold, owner, identity, v2. NULL cannot slip through.
- **Ranges:**
  - Date ranges are inclusive `>=`. StopSell is strict `>`. Session idle is `<=`.
  - An open start (`from` NULL, `to` set) passes on purpose.
  - Value sets match the contract names exactly; no typos found.
- Only m2 (int4 overflow) is a semantic defect.

### 5. Uniqueness and indexes
- **Idempotency:** ledger (tenant, key), commission (bookingKind, bookingId, agent), payout (run, agent, unit) + (tenant, key), webhook delivery (webhook, event), request/run (tenant, key, nullable → NULLS DISTINCT) are all present.
- **Hash lookups:** tokenHash, keyHash, inviteTokenHash, responseTokenHash and TripPassengerLink.tokenHash are all unique.
- **Statement partial unique:** probed. A second live statement for the same period gives 23505; two VOID statements plus one live one is OK.
- **Missing tenant prefix:** only on cuid-keyed lookups or the deliberate cross-tenant sweepers (`TripSupplierRequest_status_respondBy_idx`, `AgentStatement_dueAt_open_idx`, etc.). Fine.
- O4 is fully covered. The waste is listed in m9.

### 6. Additive columns vs the other lanes
- All 13 columns are nullable with no default (V7).
- The new CHECKs reference only new columns, so existing rows and writes that don't know the columns pass.
- `wip/trips-t0.7` `money.ts:464` inserts TripMoneyEvent with an explicit column list (none of the new columns), and `reference` goes only into the audit payload (`:505`).
- `wip/trips-t0.8` `passengers.ts` keeps links in AuditLog (`:371`, `:541`) and never touches TripPassengerLink.
- Neither branch changes `prisma/`.
- No `SELECT *`/`RETURNING *` or positional INSERT on the four tables in HEAD, t0.7 or t0.8.
- T1.1 rows keep `kind` NULL, so the v2 CHECK passes (l2: 3 rows, all NULL). T0.6's SellBasket writes leave both hold columns NULL, so the pair CHECK passes.
- Order deploy → generate as the brief says. An old client on the new DB is fine.

### 7. Global tables and privacy
- **scope.ts:** 5 global / 22 tenant / 4 unit, as specified.
- **tenantDb:** passes global models through unfiltered (`db.ts:94`), so F17.1 is the only fence. See m4 for its gaps.
- **PDPA:** `tenantScopedModels()` picks up all 26 tenant/unit tables. Purge works through the trigger's PENDING_DELETE branch. Export has the pre-existing BigInt bug (see Notes).
- **entry.ts:**
  - No result contains `taxIdHash`, `providerId`, `activeAgentAccountId` or `lastLoginAt`.
  - The only cross-tenant read is `listAgentAccountsOfUser`, filtered by the actor's own identity and active membership.
  - Logs carry only name, code and stack frames.
- **Tax id:** `normalizeJuristicTaxId` (`identity-core.ts:62–69`) strips spaces and hyphens and requires 13 digits with a leading `0`. The check digit is `(11 − Σ_{i=0..11} d_i·(13−i) mod 11) mod 10`. **That is the correct Thai 13-digit check-digit algorithm.**
- **HMAC:** K = HMAC-SHA256(raw `INTEGRATIONS_CREDENTIALS_KEY`, `"shark:agent-taxid:v1"`), then hash = `v1:` + HMAC-SHA256(K, `"TH-JURISTIC:"+id`). This is per spec. It uses the same raw-but-trim-checked key as `secret-box.ts:17–18`. A missing or short key throws `NOT_CONFIGURED`, which becomes `BUSY KEY_NOT_CONFIGURED`, with no fallback. Comparison uses `timingSafeEqual`.

### 8. Settings registry
- 40 keys. Snapshot `agency.booking` = exactly the 24 keys of CC §N.3.
- A13 = SATANG 0..1e11.
- A5 and A22 are closed enums with "ยังไม่เปิดใช้ในรุ่นนี้".
- A25 is nullable.
- Legal inputs for A5/A26/A27/A29/A30/A34 are of the `{hit}` form, and the defaults do not trip them (checked by hand for A26 W07/W09).
- Templates and fallback are per §4.
- TD after the doc edit agrees.
- For the scope-resolution gap, see M1.
- `locateMany` itself is correct and tenant-scoped (`where: { tenantId: T, id in }`). AGENT carries `AGENT_TIER: tierId ?? null`.
- I relied on the oracle's R/WS/F groups for per-key presentation metadata and the WARN-only level. I spot-checked; I did not re-derive every key.

### 9. Rollout
- **Main QC and lanes l1/l3:** same behaviour. Every new CHECK reads only new columns, so violating rows are impossible by construction. The real risks are pre-existing objects or a half-applied migration, and lock waits.
- Run `a1.1-review2/preflight.sql` on each DB (P1–P12, expectations inline), then deploy → generate, then `postdeploy.sql` (V1–V10) and `migrate diff` (only the 5 known DROP INDEX lines).
- Take a Neon snapshot first (R8). If deploy fails mid-way, the implicit tx rolls everything back; then `migrate resolve --rolled-back`.

### 10. Controller oracle edits
- **a1.1 M-3** (TripHold allowed): justified by R9. Slightly loose (any index on TripHold passes); could pin the name `TripHold_agentAccountId_active_idx`.
- **L-10** (`mine` filter by the test's own ids): justified. The random ids make it tight. It hides other checks leaving tenant-A ledger rows with no head row, which is cosmetic.
- **G-1**: justified.
- **t0.1 M-1** (later folders `agency|ticket_v2|liveaboard*`): reasonable, slightly broad.
- **M-6, RS-5, S-8 (≤ 52)**: justified.

Still no oracle check for:
- (a) M1: a restricted actor at AGENT/AGENT_TIER
- (b) the trigger under a non-default search_path / `proconfig` pinned
- (c) F17.1 evasion forms (bracket, destructure, ModelName)
- (d) the clawback CHECK at int4 extremes
- (e) TRUNCATE behaviour (documenting the accepted gap)
- (f) statementId bound to a statement of another account
- (g) migration ordering / lock window
- (h) `agentUserByLogin` on a DISABLED/ERASED user or a non-ACTIVE identity (what A1.2 relies on)

## Checked and fine
- Migration shape, counts, names and expressions
- Catalog ↔ Prisma (0 diffs)
- BIGINT set
- No FK, enum or DROP
- lock_timeout
- Trigger logic (all the R1 rules, including the multi-column smuggle and the no-op update)
- Purge interplay with `pdpa.ts`
- The partial unique on statements
- The NND uniques (oracle U-1/U-2 plus catalog)
- Sign sets and statement formula = invariant SQL
- Additive columns vs the T0.6/T0.7a/T0.8/T1.1 writers
- scope.ts registration
- tenantDb behaviour
- PDPA purge list
- The Thai tax-id check digit
- HMAC derivation and failure mode
- No leak of the never-show fields
- The doc edits (apart from m5)
- `locateMany` tenant scoping

## Not checked
- I did not run the oracle, typecheck, fitness, build or the regression suites; I relied on the builder's and controller's numbers.
- I did not run `prisma migrate diff`; per instructions I ran no migrate commands.
- I did not check the main QC or l1/l3 DBs; the SQL there is for the controller.
- The UI rendering of agency settings.
- Every one of the 40 keys' Thai labels and `tableTh` metadata (left to oracle R-14/R-17).
- `legal/th-tour-2569` severities themselves.
- Postgres `lower()` vs JS `toLowerCase()` on exotic Unicode emails. One sample differs (`İ`), but the CHECK only needs the JS-lowered string to be a fixed point of `lower()`; not exhaustively tested.
