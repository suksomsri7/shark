# POS P5.2 (first half) — authz matrix + red-before oracle (`scripts/qc-pos-p5.2.mts`)

Oracle writer · account B · 22 Oct 2026 01:5xZ (`date -u`) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p5.2-oracle` from `origin/session/pos` **2fb1fe8e** (product tip a58122fc).
Brief: `ledger/pos-briefs/pos-brief-P5.md` §4 P5.2 · §8 · §10 addendum (rulings 3, 5 and 6 confirmed · ruling 4 deferred). No product edits (nothing under `src/` was touched).

Files:
- `scripts/pos-authz-matrix.json`: the single source (ruling 3). It has 325 rows sorted by surface, one row per line.
- `scripts/pos-authz-matrix-gen.mts`: a read-only generator (fs + regex, deterministic). It has `--write`, `--check` and `--list`. Hand-read values live in its `OVERRIDES` table, and each override carries a reason in `notes`.
- `scripts/qc-pos-p5.2.mts`: 33 checks (17 static, 16 DB).
- `scripts/pos-gates.json`: +`qc-pos-p5.2` (mode unforced), placed after `qc-hf-pos-page-authz`.

## 1. Matrix stats
| kind | rows | coveredBy "" | notes |
|---|---|---|---|
| action | 214 | 178 | every `export async function` of a `"use server"` file under `src/lib/modules/pos/**`, `src/lib/pos-*.ts` and `src/lib/actions/pos.ts` (45 files) |
| api | 57 | 6 | 49 REST ops (`rest:<METHOD> <path>`), 5 methods of `api/v1/pos/[...path]`, `api/pos/sync`, `sync/snapshot`, `api/cron/hourly` |
| public | 40 | 34 | 22 public actions (`(store)/d`, `/q`, `/r/[token]/pos-receipt-actions`), 7 public pages, Beam webhook, platform GET/POST, print-agent jobs + ack, openapi.json, `developers/pos.md`, 5 legacy restaurant store routes (LEG door) |
| page | 14 | 1 | 13 pages under `sys/[id]/pos/**` + `sys/[id]/page.tsx` (PosContent) |
| **total** | **325** | **219** | rows without evidence: **0** · `?` on action/page rows: **0** (M4) |

- Action roles: CASHIER allow 144 · deny 67 · cond 3. STAFF_NOPERM deny 213 · cond 1. MANAGER deny 7 (OWNER-only / payroll-only rows). unitScoped 174.
- coveredBy is a heuristic: a suite counts when it names the surface within ±2 lines of a deny marker. 25 suites appear; the top three are qc-pos-p2.13 (47 rows), qc-hf-pos-page-authz (18) and qc-pos-p2.10 (7).
- How roles are derived: the permission keys are those that appear in the export body and in the same-file helpers and constants it reaches (transitively, up to 3 levels), plus `NEED[...]` map entries, plus key constants imported from neighbouring files. Keys are filtered to the `permissions.ts` catalog. A row whose keys include `role !== "OWNER"` is OWNER-only. 19 rows are overridden by hand after reading the code (see `OVERRIDES`).

## 2. Checks (base 2fb1fe8e) → matrix rows they prove
Full run: **27/33, exit 1** (log `/root/pos-runs/p52-oracle-run1.log`). `--no-db`: **14/17, exit 1**. `--list`: 33.

| id | proves (matrix ref) | base |
|---|---|---|
| M1 | every scanned surface has a row and no row is stale (`rows[*]`) | 🟢 325 = 325 |
| M2 | evidence `file:line` exists, sits in that surface's file and function, and the line has a guard marker or a call to a same-file guard helper | 🟢 |
| M3 | each coveredBy id exists in `scripts/` and in `pos-gates.json` | 🟢 25 suites |
| M4 | shape: sorted and unique · kinds · 9 roles with valid values · no `?` on action/page rows | 🟢 |
| M5 | the matrix equals what the generator builds (a stale matrix after a code change is red) | 🟢 |
| P1 | public token entropy from crypto: receipt 60 · order 60 · link 80 · display 256 · intent 96 · print agent 256 bits | 🟢 code is right |
| P2 | `RestaurantTable.qrToken` is at least 60 bits from creation (`(store)/q/t/[qrToken]`) | 🔴 `@default(cuid())` has about 41 random bits, and `restaurant/table.ts` creates tables without setting a token |
| P3 | a malformed token is refused before any DB call (saleForToken · tableCtx · linkCtx · orderOfToken · rowOfToken · agentOf) | 🟢 |
| P4 | a malformed token and an unknown well-formed token get the same code (TOKEN_NOT_FOUND / TOKEN_INVALID), and the QR binds to its own branch | 🟢 (binding sub-part skipped: QC tenants have 0 tables, see CD-O7) |
| P5 | per-IP rate limit on the `/r` POS branch, `publicReceiptAction`, issue, tax-request and review | 🔴 none of the 5 has one |
| P6 | rate limit on the `/q` read doors: tableDoor · tablePoll · tableBill · linkDoor · orderStatus | 🔴 none of the 5 has one |
| P7 | a public receipt of a coffee member bill carries no member id, name, phone, e-mail or LINE id, and no tenantId/unitId (read-only) | 🟢 |
| P8 | public actions take only the token plus what the customer types (no id parameters) | 🟢 22 actions |
| R1 | CASHIER × the 67 CASHIER=deny action rows → refused | 🔴 `getPosAiSettingsAction` = ok |
| R2 | STAFF_NOPERM × the 213 STAFF_NOPERM=deny rows → refused | 🔴 `getPosAiSettingsAction` = ok |
| R3 | the R1/R2 refusals carry a permission or not-found code | 🔴 6/278: VALIDATION / SETTINGS_SECTION_LOCKED come back before the permission check (3 actions, see H5) |
| R4 | ANON × all 214 action rows → redirect or refusal | 🟢 |
| R5 | positive control: OWNER, MANAGER and CASHIER of A1 read the A1 bill (ok, with its receipt number) | 🟢 the harness sees real data, so the green negatives mean something |
| T1 | OWNER of shop B × all 214 rows with shop A's ids → no A data, A rows unchanged, no B row that points at A's system/branch | 🟢 |
| T2 | MANAGER of A1 × the 174 unitScoped rows with the A2 unit and bill → no A2 bill data, A2 rows unchanged | 🟢 |
| T3 | OWNER of A × 40 read rows with resto ids → no resto data, resto fingerprint unchanged | 🟢 |
| K1 | REST pos-admin key of A × the 23 `{id}` ops with B's bill → GET 404 · writes not 2xx · B unchanged | 🟢 |
| K2 | REST key filtered to A1 × the A2 bill → GET 404, receipt 404, void 409, A2 unchanged; positive control A1 = 200 | 🟢 |
| S1 | timing-safe signature compare (Beam, x-shark-signature) · agent and display tokens looked up by hash · no raw body, secret or authorization in logs | 🟢 |
| S2 | platform inbound with a valid signature returns 503 ADAPTER_PENDING and writes nothing, so a replay has no effect | 🟢 (no nonce/timestamp: H6, ruling 6) |
| S3 | Beam route replay: bad signature 401 with no change · the same body ×2 → 200 ×2 · intent PAID once · paidAt unchanged · 1 outbox row | 🟢 |
| S4 | print-agent ack replay: the other shop's token gets 404 · ack ×2 → 200 ×2 · DONE · doneAt unchanged | 🟢 |
| N1–N4 | inverse probes: the M1 judge on a matrix missing one row reports 1 unlisted · the denial judge fails `ok:true` and a throw · the entropy judge fails 55-bit and Math.random tokens · the leak judge finds the sentinel | 🟢 4 self-tests |
| Z1 / Z2 | temp tenants wiped (344 tables, 0 rows, users and key buckets gone) · coffee/resto fingerprint unchanged | 🟢 |

The checks that are green on base are green because the code is right. Each one is backed by an inverse probe (N1–N4) or a positive control (R5, the K2 A1 positive, S3 bad-signature). Without those, a removed check would pass silently.

## 3. Findings for the hunters (not fixed — read-only lane)
- **H1 (MED, R1/R2 red):** `src/lib/modules/pos/ai-settings-actions.ts:31–35` `getPosAiSettingsAction` has no permission check. Any accepted member of the shop, including STAFF with no POS keys, can read the whole POS AI settings block, including `brief.email` and `managerUserIds`. Update requires OWNER (`:49`). The matrix expects `pos.settings.manage`.
- **H2 (MED, P5 red):** the `/r/<token>` POS branch skips the per-IP limit on purpose (`(store)/r/[token]/page.tsx:69–80`). `publicReceiptAction`, `reportReceiptIssue` (per-bill limit only), `requestFullTaxInvoice` and `submitReceiptReview` have no per-IP limit either. The accounting branch has `accountRateGuard("publicToken"/"publicSubmit")`.
- **H3 (MED, P6 red):** the `/q` read doors (`qr-order.ts` tableDoor :300, tablePoll :309, tableBill :524, linkDoor :563, orderStatus :713) have no rate limit, so enumeration is unbounded. Writes are already limited by `submitGuard` per token and IP.
- **H4 (MED/LOW, P2 red):** `RestaurantTable.qrToken @default(cuid())` (`prisma/schema/restaurant.prisma:296`) gives about 41 random bits; the timestamp, counter and fingerprint parts are predictable. Under ruling 5 (< 60 bits) a format change is allowed. Rotated tokens are already `qr_<uuid32>`.
- **H5 (LOW, R3 red):** some refusals come before the permission check:
  - `updatePosReceiptUnitSettingsAction` returns VALIDATION before the `pos.device.manage` check in `receipt-settings.ts`.
  - `updatePosUnitPromptpayAction` returns `SETTINGS_SECTION_LOCKED` to a cashier, which reveals the lock state.
  - `createAnomalyCardAction` returns VALIDATION before the permission check in `pos-board-bridges`.
- **H6 (lens L1, matrix MANAGER=allow):** a single-branch MANAGER passes the shop-level gates, which call `assertCan` without `unitId`, so `evaluate` gives a manager everything. Shop-wide writes are therefore open to a manager of one branch: `updatePosGeneralSettings`, `updatePosDiscountCaps`, `updatePosStaffSettings`, `updatePosOfflineEnabled`, `setPosAccountLink` and `updatePosReceiptSettings`. Compare `posCanSetTenantPrice` and `canManageAllLinkedUnits` (F9), which require all branches. The hunter decides whether this is intended.
- **H7 (PDPA lens L5):** the public receipt shows the member's live points balance to anyone who holds the link (`public-receipt.ts:52` → `pointsOf` :96).
- **H8 (LOW):** display pairing increments `pairFailCount` only when the code hash matches (`display.ts:218–219`). A wrong-code brute force is therefore bounded only by 10/min/IP (8 Crockford characters = 40 bits, short TTL).
- **H9 (LOW):** `api/pos/sync` `sameOrigin()` passes when the Origin header is missing. It relies on the SameSite=Lax session cookie.
- Known, kept out of red on purpose: D1c (shift-open claims any deviceId, ruling 4 deferred) · H6 platform nonce/timestamp (ruling 6, real adapters) · D11 legacy writers on linked units and F8 chat LINKED server check (no D1–D3 checks yet, see CD-O8).

## 4. CONTROLLER-DECISIONS (CD-P52-O…)
1. **CD-P52-O1:** the matrix is generated, and hand-read values sit in the generator's `OVERRIDES` (with reasons) rather than as free edits to the JSON. M5 fails when the JSON is not equal to `--write` output. A new surface in P6, or after the P3.6U / P3-SKEL U merges, means: run `--write`, then review the new rows and add overrides where the derivation says `?` (M4 refuses `?` on action/page rows).
2. **CD-P52-O2 (scan scope):**
   - Included: `sys/[id]/page.tsx` (PosContent), legacy restaurant store routes that import POS (LEG door) and `api/cron/hourly`.
   - Out of scope (`$outOfScope`): `/app/u/**` restaurant/booking pages, `/app/approvals`, `(store)/r/[token]/actions.ts` (the accounting tax-invoice branch, which imports no POS module) and the `restaurant.ts` / `booking.ts` / giftcard actions (createSale callers). Those belong to hunter lens D11.
3. **CD-P52-O3:** the entropy threshold is 60 bits for every public token (ruling 5). The brief's "≥ 96 for the rest" would fail the 80-bit order link, and ruling 5 forbids a format change at or above 60 bits.
4. **CD-P52-O4:** the expectation for `getPosAiSettingsAction` is `pos.settings.manage` (deny CASHIER and NOPERM), so R1/R2 are red on base. Please confirm the rule. If you rule "any member may read", I will ORACLE-EDIT the override.
5. **CD-P52-O5:** R3 (a validation or lock code before the permission check) is a red check at LOW severity. Options: fix the order in the round (it is cheap), or move the 3 actions to the debt table and narrow R3 by ORACLE-EDIT.
6. **CD-P52-O6:** the manifest has no "set" field. The entry is placed next to `qc-hf-pos-page-authz` with mode **unforced**, because the suite has no SKIP gate and `QC_FORCE` has no effect on it.
7. **CD-P52-O7:** the QR-binding part of P4 is skipped because both QC tenants have 0 `RestaurantTable` rows and we never reseed. The fix round for H4 may add a temp-tenant table fixture (restaurant system plus table) and make the binding mandatory.
8. **CD-P52-O8:** D1–D3 from the brief (device identity D1c, D11 legacy writers, F8 chat LINKED) are **not** in this oracle, because ruling 4 is deferred. They get added as `P5.2-D1…D3` by ORACLE-EDIT when the controller rules on the fix round.
9. **CD-P52-O9:** P2, P5 and P6 are static red-before checks of missing hardening. The fix must flip them. The rate-limit regex accepts `checkRateLimit(Db)` / `*RateGuard` / `submitGuard` / `readGuard` / `rateGuard`; a fix that uses another helper name needs an ORACLE-EDIT.
10. **CD-P52-O10:** S3 sets fake `BEAM_*` values in `process.env` of the oracle process only (never `.env`), inserts the intent row directly in the temp tenant, and deletes its own bad-signature OpsEvent row by the body fingerprint.
11. **CD-P52-O11:** coveredBy is a deterministic heuristic, not proof. 219/325 rows have no named suite. After this oracle, all of them are covered by R4/T1 (all actions) and R1/R2/T2 (by role), and the REST ops by K1/K2 and p2.13.

## 5. Commands
- Generator: `env ISO_MEM=2G bash scripts/iso.sh pnpm exec tsx scripts/pos-authz-matrix-gen.mts --check` → ✅
- Full run: `env -C /root/projects/shark-pos-b ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env QC_FORCE=1 GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.2.mts` → 27/33, exit 1. Failed: P2 P5 P6 R1 R2 R3. guardHits 0, residue 0.
- `--no-db`: run through iso.sh only, without the gate lock, because it does not touch the DB (another lane's pre-submit held the POS lock). → 14/17. Failed: P2 P5 P6.
- Lint: `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p5.2 --base 2fb1fe8e` → **VERDICT green** (red 0 · warn 0).
