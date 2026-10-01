# HF-POS-PAGES — authorization gaps on POS pages (security hotfix)

Branch `hotfix/pos-page-authz` (off origin/main 04d2ade9) · worktree `/root/projects/shark-hf2` · DB = QC4 only.
Brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-HF-POS-PAGES.md`.

## Status (checkpoint)
- [x] 1. audit (table below — verified in this worktree, line numbers = origin/main)
- [x] baseline regressions + fitness before (outputs `HF-POS-PAGES-runs/before-*.txt`)
- [x] 2. oracle RED — `HF-POS-PAGES-red.txt` (ผ่าน 7/41 · CRITICAL 34)
- [x] 3. fix
- [x] 4. GREEN — `HF-POS-PAGES-green.txt` (ผ่าน 41/41) + regressions after identical
- [x] 5. fitness both modes 33/33 = before · typecheck exit 0
- [x] 6. commit + push `hotfix/pos-page-authz`

## 1. Audit (origin/main)

Primitive: `evaluate` (`src/lib/core/rbac.ts:32-40`) — `canAccessUnit(m, undefined)` returns true (`rbac.ts:24`) ⇒ any `assertCan` without `unitId` skips the branch check.

| # | surface | file:line | verdict | detail |
|---|---|---|---|---|
| G1 | page `/pos/sales` (bill list) | `src/app/app/sys/[id]/pos/sales/page.tsx:18-30` | **CONFIRMED** | tenant+system check only; no permission check; `posSale.findMany({tenantId, systemId})` all units, last 100 bills + total — any member of the tenant (incl. STAFF with no POS permission, branch-limited users) sees every branch |
| G2 | page `/pos/close` | `…/pos/close/page.tsx:33-47` | **CONFIRMED** | `assertCan(pos.sale.create)` without `unitId`; `closeDaySummary/closeDayBills({tenantId, systemId})` cover all units ⇒ branch-A user sees branch B totals, cash-in-drawer, bill list. Refusal is a thrown ForbiddenError (500 page), not `notFound()` |
| G3 | action `exportDaySalesCsvAction` | `src/lib/actions/pos.ts:343-358` | **CONFIRMED** | same as G2 (`assertCan` without unit; CSV of all units) |
| G4 | page `/pos/products` | `…/pos/products/page.tsx:31-40` | **CONFIRMED** | `assertCan(pos.product.setPrice)` without unit ⇒ branch-limited MANAGER/STAFF pass. Price written is tenant-wide (`AccountProduct.salePrice`, `register.ts:266-302`) ⇒ needs all-branch access. Refusal = thrown error (500) |
| G5 | action `setItemSalePriceAction` | `src/lib/actions/pos.ts:467-496` | **CONFIRMED** | same as G4; `itemId` itself is scoped tenant+inventory system (`register.ts:281`) ✔ |
| G6 | page `/pos/register` | `…/pos/register/page.tsx:25-58` | **CONFIRMED (worse than reported)** | no permission check at all; `posUnits` not filtered by `unitAccess`; `?unit=B` honoured for a branch-A user ⇒ page loads branch B catalogue + **200 member names/phones of B's member system** (`posMembers`) + services. A user with no POS permission also gets the page + member list (selling itself is refused by the actions) |
| G7 | actions `registerSaleAction` / `posQuoteAction` / `posMemberRightsAction` / `posOpenDealsAction` | `pos.ts:361-366`, `:293-298`, `:186-193`, `:245-248` | **REFUTED (guarded)** | `posUnitIsLinked(tenant, systemId, unitId)` + `assertPosCan(auth, unitId)` = `pos.sale.create@unit` ✔ — client `systemId/unitId` cannot cross tenant/system/branch |
| G8 | `assertPosServiceCan` / `posOwnedUnit` | `pos.ts:503-519` | dead code | not called anywhere (service actions removed 13 Aug) — no exposure, left |
| G9 | overview `/app/sys/[id]` POS section (`PosContent`) | `src/app/app/sys/[id]/page.tsx:127-142` | **CONFIRMED — LEFT (out of scope)** | last 10 bills + all-time total + today's `closeDaySummary` of all units, no permission check. File is outside `pos/**` and is edited by the CRM branch (C1.11/C3.2 hunks) ⇒ controller decision |

Found while auditing, not authz-by-unit, left for their WOs (see "left" below): `lines[].itemId` unchecked + client prices never re-priced (`pos.ts:88,435` → P1.3); `safeMemberId` checks tenant only, not the unit's member system (`pos.ts:132-138`); idempotency short-circuit returns any tenant sale by key (`pos.ts:373-379`, key is a client UUID); `exportDaySalesCsvAction` passes an unvalidated `businessDate` (`pos.ts:356`).

## 3. Fix (minimal hunks)
- NEW `src/lib/modules/pos/access.ts` — pure guard decisions (no I/O): `posMembership`, `posSalesScope` (pos.sale.create somewhere; OWNER/`*` ⇒ all units, else the units of `unitAccess` where `pos.sale.create@unit` passes; none ⇒ null), `posScopeUnitIds`, `posCanSetTenantPrice` (pos.product.setPrice **and** OWNER or `unitAccess` `*`), `posRegisterView` (perm + linked units filtered by unit; `?unit=` naming an inaccessible linked unit ⇒ refused; garbage/missing ⇒ first accessible, as before).
- `src/lib/modules/pos/service.ts` — `CloseCtx.unitIds?` (optional ⇒ every existing caller unchanged); `closeDaySummary`/`closeDayBills` add `unitId in unitIds` only when given; `closeDayCsv` inherits.
- `/pos/sales` page — `posSalesScope` → `notFound()`; `where` adds `unitId in` for limited users.
- `/pos/close` page — `assertCan` (no unit, threw 500) → `posSalesScope` → `notFound()`; passes `unitIds` to summary/bills.
- `/pos/products` page — `assertCan` → `posCanSetTenantPrice` → `notFound()`.
- `/pos/register` page — `posRegisterView` → `notFound()`; switcher lists accessible units only.
- `exportDaySalesCsvAction` — `posSalesScope` (null ⇒ `ForbiddenError` as before) + `unitIds`.
- `setItemSalePriceAction` — `posCanSetTenantPrice` (false ⇒ `ForbiddenError` as before).
- No permission key added; `permissions.ts`, `ai/*`, `createSale`/`voidSale` untouched; no shared hot file touched.

## Per-surface before → after
| surface | OWNER | all-branch MANAGER (`*`) | branch-A user on A | branch-A user on B | no POS permission | other tenant |
|---|---|---|---|---|---|---|
| `/pos/register` | all units → **same** | all units → **same** | sees A+B in switcher → **A only** | `?unit=B` loaded B catalogue + B member list (200 names/phones) → **404** | page + member list → **404** | 404 → 404 |
| `/pos/sales` | 100 bills all units → **same** | → **same** | all branches' bills → **A's bills only** | (list) B bills shown → **hidden** | all bills → **404** | 404 → 404 |
| `/pos/close` | all units → **same** | → **same** | totals/cash/bills of A+B → **A only** | B's figures shown → **hidden** | thrown 500 → **404** | 404 → 404 |
| CSV export | all units → **same** | → **same** | A+B rows → **A only** | B rows → **hidden** | ForbiddenError → same | "ไม่พบระบบขายนี้" → same |
| `/pos/products` | OK → **same** | OK → **same** | branch-limited MANAGER / STAFF+setPrice: OK → **404** | (tenant-wide price) → **404** | thrown 500 → **404** | 404 → 404 |
| `setItemSalePriceAction` | OK → **same** | OK (STAFF `*`+setPrice too) → **same** | branch-limited: OK → **ForbiddenError** | → **ForbiddenError** | ForbiddenError → same | "ไม่พบระบบขายนี้" → same |
| sale/quote/member/deal actions | unchanged (already `pos.sale.create@unit` + `posUnitIsLinked`) | | | | | |

## Who loses access (only people who should never have had it)
1. Tenant members **without any POS permission** (STAFF lacking `pos.sale.create`/`pos.*`): lose the register page (incl. member list) and the bill list (404).
2. **Branch-limited** MANAGER/STAFF: bill list, close-day, CSV now show only their branches; register switcher shows only their branches; `?unit=<other branch>` = 404.
3. **Branch-limited** MANAGER/STAFF with `pos.product.setPrice`: lose `/pos/products` and price setting (price is tenant-wide `AccountProduct.salePrice`). Controller decision below.
OWNER and `unitAccess ["*"]` users: no change (oracle S-1/S-2, C-1/C-2, P-1..P-3, R-1..R-3).

## Acceptance
- A1 oracle `scripts/qc-hf-pos-page-authz.mts`: RED `ผ่าน 7/41 · FINDINGS: CRITICAL 34` → GREEN `ผ่าน 41/41 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0`.
- A2 (QC4, gate lock) before = after: qc-pos-register 42/42 · qc-pos-account 16/16 · qc-pos-products 24/24 · qc-pos-coupon 8/8 · qc-pos-closeday 22/22 · qc-pos-inventory 25/25 · qc-nav-functions "ผ่านทั้งหมด — 11 เช็ก" (`HF-POS-PAGES-runs/{before,after}-*.txt`).
- A3 fitness: qc4-env 33/33 · `env -i` 33/33, before = after.
- A4 `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` exit 0.

## Found but left
- `src/app/app/sys/[id]/page.tsx:127-142` (`PosContent` on the system overview): last 10 bills + all-time total + today's summary of **all units**, no permission check — same class as G1/G2. Outside `pos/**` and edited by the CRM branch ⇒ not touched. Fix after CRM merges: same 3 lines (`posSalesScope` → filter `unitId in`, pass `unitIds` to `closeDaySummary`).
- `src/lib/actions/pos.ts:88,435` — `lines[].itemId` unchecked and client price never re-priced (P1.3).
- `src/lib/actions/pos.ts:132-138` — `safeMemberId` checks tenant only, not the unit's member system (same tenant, low risk; P1.12).
- `src/lib/actions/pos.ts:373-379` — idempotency short-circuit returns any tenant sale by key (key is a client UUID; P1.6).
- `src/lib/actions/pos.ts` CSV `businessDate` not validated (garbage ⇒ invalid Date ⇒ error, no leak).
- `src/lib/actions/pos.ts:503-519` — dead `assertPosServiceCan`/`posOwnedUnit`.
- AI `pos_create_sale`/`void_sale`, `/api/v1/sales` — out of scope (P1.6 / separate one-line guard per REVIEW §6 row 8).

## Controller decisions before deploy
1. Branch-limited managers lose `/pos/products` (price is tenant-wide). Alternative = per-branch prices (P2.2/P2.11). Confirm acceptable.
2. "All-branch" = OWNER or `unitAccess` containing `"*"`; a manager listing every unit explicitly is treated as branch-limited.
3. Bill list / close-day use `pos.sale.create` as the read permission until `pos.sale.read` (P1.15).
4. Overview page `PosContent` leak (above) — schedule after CRM merge.

## Round 2 (controller ruling 1 Oct) — "all branches" ≠ only `"*"`
- Rule: all-branch = OWNER · `unitAccess` has `"*"` · or `pos.product.setPrice` passes at EVERY non-archived unit linked to this POS (`posUnits`, archived excluded). Empty linked list ⇒ OWNER/`*` only.
- `posCanSetTenantPrice(m, linkedUnitIds)`; `/pos/products` and `setItemSalePriceAction` pass `posUnits(tenantId, systemId)` ids.
- `posSalesScope` unchanged (filtered list kept): a manager covering every linked unit already sees every bill of those units through `unitId in unitAccess`. `allUnits` would also expose bills of archived/unlinked units or other-module sales the actor has no unit access to ⇒ not a no-op security-wise.
- Oracle +7 cases (P-9a..P-14; P-7/P-8 now require `posUnits(` in the call): RED on 976c0625 `ผ่าน 43/48 · CRITICAL 5` (`HF-POS-PAGES-r2-red.txt`) → GREEN `ผ่าน 48/48 · CRITICAL 0` (`HF-POS-PAGES-r2-green.txt`). Note: the first RED run of P-7 used a wrong static slice (fixed); the corrected P-7 is still RED on 976c0625 (call has no `posUnits(`).
- Regressions after round 2 identical (42/16/24/8/22/25/11) · fitness 33/33 both modes · typecheck exit 0 (`HF-POS-PAGES-runs/r2-*`).
- Access change vs round 1: single-branch shop managers and managers/STAFF+setPrice listing every linked branch regain `/pos/products` + price setting (same as origin/main for them).

## Round 3 (reviewer should-fix S1–S3, 1 Oct)
Pre-check: `git diff origin/main...origin/session/crm -- "src/app/app/sys/[id]/page.tsx"` = empty (crm @13553e5e) ⇒ the overview page can be fixed here. `origin/session/pos` does not touch any hotfix file either.
- **S1 overview `/app/sys/[id]`** (POS branch only): `posScope = sys.type === "POS" ? posSalesScope(...) : null`; null ⇒ `PosContent` not rendered (header + rest of page unchanged); `PosContent` recent 10 bills + all-time PAID aggregate use `posSaleWhere(scope)`, today's summary gets `unitIds: posScopeUnitIds(scope)`. Other modules' sections untouched.
- **S2 price coverage**: new loader `posPriceUnitIds(tenantId, posSystemId)` (`pos/register.ts`) = non-archived units linked to this POS ∪ non-archived units linked (AppSystemUnit type INVENTORY) to any inventory system those units use — the price on `AccountProduct.salePrice` reaches every register reading that inventory via `posCatalog`. `/pos/products` and `setItemSalePriceAction` pass it to `posCanSetTenantPrice`. POS-X→X and POS-Y→Y sharing one inventory: manager [X] refused, [X,Y] allowed, archived Z ignored; single-POS single-branch still allowed.
- **S3 rigor**: `posSaleWhere(tenantId, systemId, scope)` in `access.ts`, used by the bill-list page, the overview page and the oracle (S-1..S-5, O-3..O-5 run the real filter). Static checks now require the exact use of each guard result (whitespace-normalised): `where: posSaleWhere(tenantId, id, scope)`, `if (!scope) notFound()`, close-day `closeDaySummary/closeDayBills({ …, unitIds }, businessDate)`, CSV `if (!scope) throw new ForbiddenError(` + `closeDayCsv({ tenantId, systemId, unitIds: posScopeUnitIds(scope) }, date)`, price `priceUnitIds = await posPriceUnitIds(...)` + refusal before `await setItemSalePrice(`, register `if (!view.ok) notFound(); const units = view.units;` + `const active = view.active;` (no `units[0]`), overview O-1/O-2. Cleanup `del` failures are now CRITICAL checks (no swallowing).
- Mutation proofs (`HF-POS-PAGES-r3-mutation-static.txt`, `-data.txt`): 16 static mutations each turn exactly the intended check red (S-8, C-8 ×3, C-9 ×2, P-7, P-8 ×2, R-11 ×2, O-1, O-2 ×3); data mutations: posSaleWhere ignoring scope ⇒ S-4/S-5/O-4; closeDay ignoring unitIds ⇒ C-0/C-3..C-6/O-4; price units without shared inventory ⇒ P-15a/P-15; failing tenant delete ⇒ CLEANUP-tenant ×2. All files restored (sha verified).
- Oracle: RED on c7dd2fd4 `ผ่าน 41/56 · CRITICAL 15` (`HF-POS-PAGES-r3-red.txt`; incl. P-15 real behaviour: [X]-only manager passes) → GREEN `ผ่าน 56/56 · CRITICAL 0` (`HF-POS-PAGES-r3-green.txt`).
- Typecheck exit 0 (`HF-POS-PAGES-runs/r3-typecheck.txt`). Regressions before = after (`HF-POS-PAGES-runs/r3-*`): POS 42/16/24/8/22/25 · qc-nav-functions 11 · suites reading the overview page: qc-connections 7/7 · qc-crm-v1 17/17 · qc-chat-staff-perms 49/49 · qc-chat-v2-icons 35/35 · qc-chat-inbox-ui 55/55 · qc-chat-push-badge 48/48 · qc-crm-c1.11 57/66 both (same 9 S6/S7 ids — need a running app/HTTP; pre-existing). Fitness 33/33 both modes.
- Access change vs round 2: tenant members without POS permission no longer see POS sales on the overview page; branch-limited users see only their branches there; a manager whose branches don't cover every branch sharing the inventory loses price setting.

## Findings for the owner (recorded, not fixed here)
- `src/lib/modules/account/product-actions.ts:247-250` `updateProductAction`: `assertAccountCan(auth, "account.product.manage")` (no branch) ⇒ a branch-limited manager can edit the same `AccountProduct.salePrice` from `/account/products` that HF-POS-PAGES now refuses at `/pos/products`.
- `src/lib/dashboard/widgets.ts:112-130` and `src/lib/dashboard/service.ts:61-66`: dashboard POS widgets/today's sales aggregate all branches of the first POS (`tenantDb({tenantId, systemId}).posSale.aggregate`) for any viewer — branch-limited users see all-branch totals.
- `origin/session/pos:src/lib/modules/pos/api/ops/reports.ts:13` (future POS reports ops) build on `closeDaySummary` without unit scope — P2.13 must pass the actor's scope (`unitIds`).
- `src/lib/actions/pos.ts:133-138` `safeMemberId` checks the tenant only, not the unit's member system — P1.12.
