# HF-APIV1 — legacy `/api/v1/*` routes ignore API-key scopes and system binding (security hotfix · builder · worktree /root/projects/shark-hf · branch hotfix/apiv1-scope off origin/main)

Owner order 1 Oct: "fix it if it can be done without affecting the CRM work in progress". Verified: no CRM branch touches these files. Lane rules `ledger/pos-briefs/pos-brief-LANE-RULES.md` (in /root/projects/shark-pos — read-only) are binding (QC4 only, iso.sh, no build/server, no prisma, typecheck command with the 5632 MB heap, once).

## The hole (controller verified in code)
`src/lib/api-keys/route-auth.ts` `authenticateApiRequest` returns `{tenantId, keyId, scopes, systemId, expiresAt}` but the 9 legacy routes never look at `scopes`/`systemId`:
`src/app/api/v1/{sales,customers,inventory/items,appointments,queue/tickets,reservations,shop/orders,tickets/orders,me}/route.ts`.
⇒ a key issued for ONE module (e.g. a Kanban read bundle, or an account key bound to one accounting system) can read all POS sales (with memberId), customers (PII), inventory, appointments, queue, reservations, shop and ticket orders of the same shop. Not cross-tenant.

## Required behaviour
1. Understand the key model first (read `src/lib/api-keys/{service,scopes,route-auth}.ts`, how `/api/v1/account/*`, `/api/v1/kanban/*`, `/api/v1/crm/*`, `/api/v1/member/*` gate keys — `require.ts` / registry dispatch — and what a "legacy key" is in `scripts/qc-account-api-keys.mts` AK-8.x and `scripts/qc-public-api.mts`).
2. Rule (fail closed, no new scope vocabulary, no schema change):
   - **Legacy shop-wide key** = no scopes AND no bound system (the kind these routes were built for) ⇒ keeps working exactly as today on all 9 routes (do not break existing integrations).
   - **Scoped and/or system-bound key** ⇒ **403** on the 8 data routes with a Thai message that does not blame the user (e.g. key นี้ออกให้ใช้กับระบบ … เท่านั้น จึงเรียกดูข้อมูลส่วนนี้ไม่ได้) + English `error_en`/house error shape used by these routes. No data, no counts, identical body regardless of whether data exists.
   - `/api/v1/me`: decide from what it returns — if it only describes the key/tenant identity, keep it open to every valid key (document why); if it returns anything beyond that, apply the rule.
   - If the house semantics for "empty scopes" differ from the above (e.g. empty scopes means "no access" in the newer modules), follow the house semantics that keep TODAY's legitimate legacy callers working and explain it in the notes with file:line — and flag it as a controller decision before finishing.
3. Implement ONCE: a small helper next to `authenticateApiRequest` (e.g. `requireLegacyFullAccessKey(auth)`), called by each route right after auth. Minimal hunks; no refactor of the routes; no change to `authenticateApiRequest`'s return shape; do not touch `scopes.ts` vocabulary, registries, `src/lib/api/**`.
4. Audit while you are there (report only, do not fix): any other route under `src/app/api/**` that authenticates with an API key and does not check scope/system binding (the `ai/skills`, `ai/tools` routes do check — verify), and any legacy route that leaks cross-system data even for legacy keys.

## Files you own
`src/lib/api-keys/route-auth.ts` (additive helper), the 9 route files (one guard line + import each), NEW oracle `scripts/qc-hf-apiv1-scope.mts`, notes `ledger/wo-notes/HF-APIV1.md` (in your worktree), and — only if an existing oracle asserts the old (insecure) behaviour — the smallest edit to that oracle, listed as ORACLE-EDIT with before/after.

## Oracle (write it FIRST, show it RED on the unfixed code, then fix)
`scripts/qc-hf-apiv1-scope.mts`, house style (`chk`, `JSON_SUMMARY`, cleanup in `finally`, temp keys/rows tagged `qc-hf-apiv1-<rand>` inside the POS QC tenant from `scripts/pos-expected.json` if present on your base — it is not on origin/main, so create the keys in an existing QC tenant the way `qc-public-api.mts` does, and delete them in `finally`): for EACH of the 8 data routes: legacy key ⇒ 200 same shape as before (positive control); scoped-only key (kanban read bundle) ⇒ 403 no data; system-bound key (account key bound to an accounting system) ⇒ 403; scoped+bound ⇒ 403; expired/revoked ⇒ 401 unchanged; other-tenant key ⇒ sees only its own tenant (unchanged). `/me` per your decision. Call the route handlers in-process like `qc-public-api.mts` does (no server).
## Acceptance (paste final lines)
A1 oracle RED before (save output) → GREEN after. A2 `qc-public-api`, `qc-account-api-keys`, `qc-ai-skills` and every other `scripts/qc-*api*.mts` that touches API keys: same result as before your change (run before/after on QC4 through the gate lock). A3 `pnpm fitness` with and without env unchanged. A4 typecheck exit 0. A5 notes: rule, per-route table, audit findings, customer impact statement (which existing key types lose access to what). 
Finish: commit on `hotfix/apiv1-scope`, `git push -u origin hotfix/apiv1-scope`. Do NOT push main. Do not commit `.env*`, `scripts/qc4.sh`, `.qc-shots`.
